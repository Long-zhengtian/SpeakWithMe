import { FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api } from "./api/client";
import { categoryLabel } from "./lib/labels";
import { canListen, startEnglishListener, type EnglishListener } from "./lib/listen";
import { canSpeak, speak, stopSpeaking } from "./lib/speak";
import type { ChatMessage, CoachLine, Gloss, Recap, Session } from "./types";
import { WordText } from "./WordText";

type ConversationScreenProps = {
  session: Session;
  onExit: () => void;
  exitLabel?: string;
};

export function ConversationScreen({ session, onExit, exitLabel = "回到主页" }: ConversationScreenProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(session.messages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingCorrectionId, setPendingCorrectionId] = useState<string | null>(null);
  const [intent, setIntent] = useState("");
  const [coachVariant, setCoachVariant] = useState(0);
  const [coachLine, setCoachLine] = useState<CoachLine | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [sendingLine, setSendingLine] = useState<string | null>(null);
  const [recap, setRecap] = useState<Recap | null>(null);
  const [recapLoading, setRecapLoading] = useState(false);
  const [gloss, setGloss] = useState<Gloss | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const listenerRef = useRef<EnglishListener | null>(null);
  const sendingRef = useRef(false);
  const [listening, setListening] = useState(false);
  const spoken = canSpeak();
  const microphone = canListen();
  const heardRef = useRef<Set<string>>(new Set());

  const userSpoke = messages.some((message) => message.role === "user");
  const corrections = messages.filter((message) => message.correction);
  const latestUser = useMemo(
    () => [...messages].reverse().find((message) => message.role === "user"),
    [messages],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pendingCorrectionId, recap]);

  useEffect(() => {
    const newest = [...messages].reverse().find((message) => message.role === "assistant");
    if (!newest || heardRef.current.has(newest.id) || listening) return;
    heardRef.current.add(newest.id);
    speak(newest.text);
  }, [messages, listening]);

  useEffect(
    () => () => {
      listenerRef.current?.stop();
      stopSpeaking();
    },
    [],
  );

  async function requestCorrection(messageId: string) {
    setPendingCorrectionId(messageId);
    try {
      const result = await api.correct(session.id, messageId);
      setMessages((current) =>
        current.map((item) => (item.id === messageId ? { ...item, correction: result.correction } : item)),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "指正没有看完，对话可以继续。");
    } finally {
      setPendingCorrectionId((current) => (current === messageId ? null : current));
    }
  }

  async function sendLine(text: string, assisted: boolean) {
    const cleaned = text.trim();
    if (!cleaned || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    try {
      const result = await api.sendMessage(session.id, cleaned, assisted);
      setMessages((current) => [...current, result.user_message, result.assistant_message]);
      if (!assisted) setDraft("");
      if (!assisted && session.corrections_enabled) void requestCorrection(result.user_message.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "这句话没发出去。");
    } finally {
      sendingRef.current = false;
      setSending(false);
      setSendingLine(null);
    }
  }

  function beginTalk(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (sendingRef.current || listenerRef.current) return;
    stopSpeaking();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* 有些浏览器在这次按下时接不住指针，松开时仍会停止。 */
    }
    setListening(true);
    setDraft("");
    setError(null);
    const listener = startEnglishListener({
      onText: setDraft,
      onError: (message) => setError(message),
      onEnd: (text) => {
        listenerRef.current = null;
        setListening(false);
        if (text) void sendLine(text, false);
      },
    });
    listenerRef.current = listener;
    if (!listener) setListening(false);
  }

  function endTalk(event: PointerEvent<HTMLButtonElement>) {
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      /* 指针已经松开。 */
    }
    listenerRef.current?.stop();
  }

  function onSend(event: FormEvent) {
    event.preventDefault();
    void sendLine(draft, false);
  }

  async function askCoach(variant: number) {
    const cleaned = intent.trim();
    if (!cleaned || coachLoading) return;
    setCoachLoading(true);
    setError(null);
    try {
      setCoachLine(await api.coach(session.id, cleaned, variant));
      setCoachVariant(variant);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "这句还没准备好。");
    } finally {
      setCoachLoading(false);
    }
  }

  function onAsk(event: FormEvent) {
    event.preventDefault();
    void askCoach(0);
  }

  async function useLine(text: string) {
    setSendingLine(text);
    await sendLine(text, true);
  }

  async function endScene() {
    if (!userSpoke || recapLoading) return;
    setRecapLoading(true);
    setError(null);
    try {
      setRecap(await api.recap(session.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "小结没有生成。");
    } finally {
      setRecapLoading(false);
    }
  }

  async function lookup(word: string) {
    setError(null);
    try {
      setGloss(await api.gloss(word));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "这个词没有查到。");
    }
  }

  async function keep(text: string, glossZh: string, kind: "word" | "sentence") {
    setError(null);
    try {
      await api.savePhrase(text, glossZh, kind);
      setSavedKey(`${kind}:${text}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "没有收进句型本。");
    }
  }

  const status = session.corrections_enabled
    ? describeLatest(latestUser, pendingCorrectionId)
    : "这场不改句子，先把话接下去。";

  return (
    <main className="studio">
      <header className="studio-top">
        <div>
          <p className="brand">Speaking With Me</p>
          <h1>
            {session.scene.title_zh}
            <span>
              {session.scene.partner_name} · {session.scene.partner_role_zh} · {session.level}
            </span>
          </h1>
          <p className="goal">{session.scene.goal_zh}</p>
        </div>
        <div className="top-actions">
          <button type="button" className="ghost" onClick={onExit}>
            {exitLabel}
          </button>
          <button
            type="button"
            className="ghost"
            data-testid="end-session"
            disabled={!userSpoke || recapLoading || recap !== null}
            onClick={() => void endScene()}
          >
            {recapLoading ? "在写小结…" : "结束这场"}
          </button>
        </div>
      </header>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="studio-body">
        <section className="transcript" aria-live="polite">
          {messages.map((message) => (
            <article key={message.id} className={`bubble ${message.role === "user" ? "user" : "partner"}`}>
              <header>
                <span>{message.role === "user" ? "你" : session.scene.partner_name}</span>
                {message.assisted ? (
                  <em data-testid="assisted-tag">借助</em>
                ) : null}
                <button type="button" className="text-button" onClick={() => speak(message.text)} disabled={!spoken}>
                  听
                </button>
              </header>
              <WordText text={message.text} onWord={(word) => void lookup(word)} />
              {message.correction ? (
                <aside className="correction" data-testid="correction-card">
                  <span>{categoryLabel(message.correction.category)}</span>
                  <p className="correction-original">{message.correction.original_span}</p>
                  <p className="correction-suggestion">{message.correction.suggestion}</p>
                  <p className="correction-why">{message.correction.explanation_zh}</p>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      void keep(message.correction?.suggestion ?? "", message.correction?.explanation_zh ?? "", "sentence")
                    }
                  >
                    {savedKey === `sentence:${message.correction.suggestion}` ? "已收下" : "收下这句"}
                  </button>
                </aside>
              ) : null}
              {pendingCorrectionId === message.id ? <p className="pending">看一下这句…</p> : null}
            </article>
          ))}
          {sending ? <p className="pending">{session.scene.partner_name} 在接话…</p> : null}
          {recap ? (
            <section className="recap" data-testid="recap">
              <h2>这场小结</h2>
              <ul>
                {recap.went_well.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p data-testid="recap-next">{recap.try_next}</p>
              {recap.keep_sentence ? <p>留下这句：{recap.keep_sentence}</p> : null}
              {recap.revised_from ? <p>你当时说的是：{recap.revised_from}</p> : null}
              <button type="button" className="primary" onClick={onExit}>
                {exitLabel}
              </button>
            </section>
          ) : null}
          <div ref={bottomRef} />
        </section>
        <aside className="rail">
          <form className="panel" onSubmit={onAsk}>
            <h2>怎么说</h2>
            <p className="muted">中文留在这里，{session.scene.partner_name} 看不到。</p>
            <label htmlFor="coach-input">想说的意思</label>
            <textarea
              id="coach-input"
              data-testid="coach-input"
              value={intent}
              placeholder="例如：我想要一杯冰拿铁"
              onChange={(event) => setIntent(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button className="primary" type="submit" data-testid="coach-ask" disabled={coachLoading || !intent.trim()}>
              {coachLoading ? "在想句子…" : "告诉我怎么说"}
            </button>
            {coachLine ? (
              <div className="coach-result">
                <p className="coach-kicker">可以说</p>
                <p data-testid="coach-sentence">{coachLine.sentence}</p>
                <div className="line-actions">
                  <button type="button" className="text-button" onClick={() => speak(coachLine.sentence)} disabled={!spoken}>
                    听一听
                  </button>
                  <button
                    type="button"
                    className="primary slim"
                    data-testid="coach-send"
                    disabled={sending}
                    onClick={() => void useLine(coachLine.sentence)}
                  >
                    {sendingLine === coachLine.sentence ? "发出去了…" : "就说这句"}
                  </button>
                </div>
                <p className="coach-kicker">更简单</p>
                <p>{coachLine.simpler}</p>
                <div className="line-actions">
                  <button type="button" className="text-button" onClick={() => speak(coachLine.simpler)} disabled={!spoken}>
                    听一听
                  </button>
                  <button
                    type="button"
                    className="ghost slim"
                    disabled={sending}
                    onClick={() => void useLine(coachLine.simpler)}
                  >
                    用这句
                  </button>
                </div>
                <p className="gloss">{coachLine.gloss_zh}</p>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void keep(coachLine.sentence, coachLine.gloss_zh, "sentence")}
                >
                  {savedKey === `sentence:${coachLine.sentence}` ? "已收下" : "收下这句"}
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={coachLoading}
                  onClick={() => void askCoach(coachVariant + 1)}
                >
                  换一种说法
                </button>
              </div>
            ) : null}
          </form>
          {gloss ? (
            <section className="panel" data-testid="gloss-panel">
              <h2>{gloss.text}</h2>
              <p>{gloss.gloss_zh}</p>
              <button
                type="button"
                className="text-button"
                onClick={() => void keep(gloss.text, gloss.gloss_zh, gloss.text.includes(" ") ? "sentence" : "word")}
              >
                {savedKey === `${gloss.text.includes(" ") ? "sentence" : "word"}:${gloss.text}` ? "已收下" : "收下"}
              </button>
            </section>
          ) : null}
          <section className="panel">
            <h2>指正</h2>
            <p className="muted">{status}</p>
            {corrections.length === 0 ? null : (
              <ul className="correction-list">
                {corrections.map((message) => (
                  <li key={message.id}>{message.correction?.suggestion}</li>
                ))}
              </ul>
            )}
          </section>
        </aside>
        {recap ? null : (
          <form className="composer" onSubmit={onSend}>
            <label htmlFor="message-input">你的英语</label>
            <textarea
              id="message-input"
              data-testid="message-input"
              value={draft}
              placeholder={listening ? "正在听…" : "用英语说，或按住旁边的按钮开口。"}
              disabled={sending}
              readOnly={listening}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="composer-actions">
              {microphone ? (
                <button
                  type="button"
                  className={`mic ${listening ? "live" : ""}`}
                  data-testid="hold-to-talk"
                  disabled={sending}
                  onPointerDown={beginTalk}
                  onPointerUp={endTalk}
                  onPointerCancel={endTalk}
                >
                  {listening ? "正在听…" : "按住说"}
                </button>
              ) : null}
              <button className="primary" type="submit" data-testid="send-message" disabled={sending || listening || !draft.trim()}>
                发送
              </button>
            </div>
          </form>
        )}
      </div>
      <p className="footnote">
        {microphone
          ? "按住「按住说」讲英语，松开就发出去。对方的话会跟着读出来。打字也还可以用。"
          : "这个浏览器不能直接听你说话，先打字。对方的话会跟着读出来。"}
      </p>
    </main>
  );
}

function describeLatest(message: ChatMessage | undefined, pendingId: string | null) {
  if (!message) return "你说完一句，值得改的地方会标在那句话下面。";
  if (pendingId === message.id) return "正在看上一句。";
  if (message.assisted) return "这句是借助说的，下一轮可以试着自己说。";
  if (message.correction) return "上一句改了一处，先把对话接下去。";
  return "上一句意思清楚，先往下聊。";
}
