import { FormEvent, useEffect, useRef, useState } from "react";
import { ApiError, api, subscribePractice } from "./api/client";
import { categoryLabel } from "./lib/labels";
import { bindHold } from "./lib/hold";
import { canListen, startChineseListener, startEnglishListener, type EnglishListener } from "./lib/listen";
import { closeOverlay, useOverlay } from "./lib/overlay";
import { subscribeSpeechNotice } from "./lib/speechNotice";
import { speak, stopSpeaking } from "./lib/speak";
import type { ChatMessage, CoachLine, Gloss, Recap, Session } from "./types";
import { Avatar } from "./Avatar";
import { GlossCard } from "./GlossCard";
import { HearButton } from "./HearButton";
import { MessageBubble } from "./MessageBubble";

function KeyboardIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 10h.01M12 10h.01M17 10h.01M7 14h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

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
  const [status, setStatus] = useState<string | null>(null);
  const [pendingCorrectionId, setPendingCorrectionId] = useState<string | null>(null);
  const [intent, setIntent] = useState("");
  const [coachVariant, setCoachVariant] = useState(0);
  const [coachLine, setCoachLine] = useState<CoachLine | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [sendingLine, setSendingLine] = useState<string | null>(null);
  const [recap, setRecap] = useState<Recap | null>(null);
  const [pinned, setPinned] = useState(Boolean(session.pinned));
  const [pinning, setPinning] = useState(false);
  const [recapLoading, setRecapLoading] = useState(Boolean(session.ending));
  const [gloss, setGloss] = useState<Gloss | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const listenerRef = useRef<EnglishListener | null>(null);
  const sendingRef = useRef(false);
  const talkHoldRef = useRef<HTMLButtonElement | null>(null);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const voiceRef = useRef<HTMLTextAreaElement | null>(null);
  const focusDraft = useRef(false);
  const intentHoldRef = useRef<HTMLButtonElement | null>(null);
  const talkStartRef = useRef<() => void>(() => {});
  const intentStartRef = useRef<() => void>(() => {});
  const [listening, setListening] = useState(false);
  const [inputMode, setInputMode] = useState<"voice" | "text">(canListen() ? "voice" : "text");
  const [coachOpen, setCoachOpen] = useState(false);
  const [intentListening, setIntentListening] = useState(false);
  const [phone, setPhone] = useState(() => document.documentElement.classList.contains("is-phone"));
  const microphone = canListen();
  const heardRef = useRef<Set<string>>(new Set());
  const heardReady = useRef(false);

  const userSpoke = messages.some((message) => message.role === "user");

  useEffect(() => {
    if (!session.ending) return;
    let alive = true;
    async function refresh() {
      try {
        const next = await api.session(session.id);
        if (!alive) return;
        if (next.recap) {
          setRecap(next.recap);
          setRecapLoading(false);
        } else if (!next.ending) {
          setRecapLoading(false);
        }
      } catch {
        /* The summary is still being written. */
      }
    }
    void refresh();
    const stop = subscribePractice(() => void refresh());
    return () => {
      alive = false;
      stop();
    };
  }, [session.ending, session.id]);

  useEffect(() => {
    const scroller = bottomRef.current?.parentElement;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [messages, pendingCorrectionId, recap, sending]);

  useEffect(() => {
    if (!heardReady.current) {
      heardReady.current = true;
      if (messages.some((message) => message.role === "user")) {
        for (const message of messages) {
          if (message.role === "assistant") heardRef.current.add(message.id);
        }
        return;
      }
    }
    const newest = [...messages].reverse().find((message) => message.role === "assistant");
    if (!newest || heardRef.current.has(newest.id) || listening) return;
    heardRef.current.add(newest.id);
    speak(newest.text, newest.id, session.scene.partner_name);
  }, [messages, listening, session.scene.partner_name]);

  useEffect(
    () => () => {
      listenerRef.current?.stop();
      stopSpeaking();
    },
    [],
  );

  useEffect(
    () =>
      subscribeSpeechNotice((notice) => {
        if (notice.kind === "error") {
          setStatus(null);
          if (notice.text) setError(notice.text);
          return;
        }
        setStatus(notice.text);
      }),
    [],
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 860px)");
    const forced = new URLSearchParams(window.location.search).has("phone");
    const apply = () => setPhone(forced || media.matches || document.documentElement.classList.contains("is-phone"));
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  const sheetOpen = phone && (coachOpen || gloss !== null);

  useOverlay(sheetOpen, () => {
    setCoachOpen(false);
    setGloss(null);
  });

  useEffect(() => {
    const endHold = () => listenerRef.current?.stop();
    const cleanups: Array<() => void> = [];
    if (talkHoldRef.current) {
      cleanups.push(bindHold(talkHoldRef.current, { start: () => talkStartRef.current(), end: endHold }));
    }
    if (intentHoldRef.current) {
      cleanups.push(bindHold(intentHoldRef.current, { start: () => intentStartRef.current(), end: endHold }));
    }
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [microphone, coachOpen, phone, inputMode]);

  useEffect(() => {
    for (const node of [draftRef.current, voiceRef.current]) {
      if (!node) continue;
      node.style.height = "40px";
      node.style.height = `${Math.min(node.scrollHeight, 120)}px`;
    }
    if (focusDraft.current) {
      focusDraft.current = false;
      draftRef.current?.focus();
    }
  }, [draft, inputMode]);

  async function requestCorrection(messageId: string) {
    setPendingCorrectionId(messageId);
    try {
      const result = await api.correct(session.id, messageId);
      setMessages((current) =>
        current.map((item) =>
          item.id === messageId
            ? {
                ...item,
                correction: result.correction,
                correction_status: result.correction ? "corrected" : "clear",
              }
            : item,
        ),
      );
    } catch {
      setMessages((current) =>
        current.map((item) => (item.id === messageId ? { ...item, correction_status: "failed" } : item)),
      );
    } finally {
      setPendingCorrectionId((current) => (current === messageId ? null : current));
    }
  }

  async function sendLine(text: string, assisted: boolean) {
    const cleaned = text.trim();
    if (!cleaned || sendingRef.current || recapLoading) return;
    const optimisticId = `local-${Date.now().toString(36)}`;
    const optimistic: ChatMessage = {
      id: optimisticId,
      role: "user",
      text: cleaned,
      assisted,
      correction: null,
    };
    sendingRef.current = true;
    setSending(true);
    setError(null);
    setMessages((current) => [...current, optimistic]);
    if (!assisted) setDraft("");
    if (assisted) setCoachOpen(false);
    try {
      const result = await api.sendMessage(session.id, cleaned, assisted);
      setMessages((current) =>
        current.flatMap((item) => (item.id === optimisticId ? [result.user_message, result.assistant_message] : [item])),
      );
      if (!assisted && session.corrections_enabled) void requestCorrection(result.user_message.id);
    } catch (err) {
      setMessages((current) => current.filter((item) => item.id !== optimisticId));
      if (!assisted) setDraft(cleaned);
      if (assisted) setCoachOpen(true);
      setError(err instanceof ApiError ? err.message : "这句话没发出去。");
    } finally {
      sendingRef.current = false;
      setSending(false);
      setSendingLine(null);
    }
  }

  function beginTalk() {
    if (sendingRef.current || listenerRef.current) return;
    stopSpeaking();
    setListening(true);
    setDraft("");
    setError(null);
    setStatus(null);
    const listener = startEnglishListener({
      onText: setDraft,
      onError: (message) => setError(message),
      onEnd: (text) => {
        listenerRef.current = null;
        setListening(false);
        setStatus(null);
        if (text) {
          setDraft(text);
          setError(null);
        }
      },
    });
    listenerRef.current = listener;
    if (!listener) setListening(false);
  }

  function beginIntent() {
    if (coachLoading || sendingRef.current || listenerRef.current) return;
    stopSpeaking();
    setIntentListening(true);
    setError(null);
    setStatus(null);
    const listener = startChineseListener({
      onText: setIntent,
      onError: (message) => setError(message),
      onEnd: (text) => {
        listenerRef.current = null;
        setIntentListening(false);
        setStatus(null);
        if (text) {
          setIntent(text);
          setError(null);
        }
      },
    });
    listenerRef.current = listener;
    if (!listener) setIntentListening(false);
  }

  talkStartRef.current = beginTalk;
  intentStartRef.current = beginIntent;

  function closeSheet() {
    if (!closeOverlay()) {
      setCoachOpen(false);
      setGloss(null);
    }
  }

  function dismissGloss() {
    setGloss(null);
    if (phone && coachOpen) closeSheet();
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

  async function pinHere() {
    if (pinned || pinning) return;
    setPinning(true);
    setError(null);
    try {
      await api.pinSession(session.id);
      setPinned(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "没有放到首页。");
    } finally {
      setPinning(false);
    }
  }

  async function endScene() {
    if (!userSpoke || sending || recapLoading) return;
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
      setCoachOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "这个词没有查到。");
    }
  }

  async function keep(text: string, glossZh: string, kind: "word" | "sentence") {
    setError(null);
    try {
      await api.savePhrase(text, glossZh, kind);
      setSavedKey(`${kind}:${text}`);
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "没有收进笔记本。");
      return false;
    }
  }

  return (
    <main className="studio talk">
      <header className="studio-top">
        <button type="button" className="ghost" onClick={onExit}>
          {exitLabel}
        </button>
        <div className="talk-heading">
          <h1>
            {session.scene.title_zh}
            <span>
              {session.scene.partner_name} · {session.scene.partner_role_zh} · {session.level}
            </span>
          </h1>
          {session.scene.id === "custom" && !pinned ? (
            <button type="button" className="text-button talk-pin" disabled={pinning} onClick={() => void pinHere()}>
              {pinning ? "正在放上…" : "放到首页"}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className="ghost"
          data-testid="end-session"
          disabled={!userSpoke || sending || recapLoading || recap !== null}
          onClick={() => void endScene()}
        >
          {recapLoading ? "在写小结…" : "结束这场"}
        </button>
      </header>
      {recapLoading ? <p className="pending">小结还在写。回到记录也会继续。</p> : null}
      {status ? <p className="pending">{status}</p> : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="studio-body">
        <section className="transcript" aria-live="polite">
          {session.scene.id === "custom" && session.scene.description_zh ? (
            <p className="scene-brief">{session.scene.description_zh}</p>
          ) : null}
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              partnerName={session.scene.partner_name}
              onWord={(word) => void lookup(word)}
            >
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
              {message.role === "user" &&
              session.corrections_enabled &&
              !message.assisted &&
              !message.correction &&
              pendingCorrectionId !== message.id &&
              message.correction_status === "clear" ? (
                <span className="correction-ok" data-testid="correction-ok" title="这句不用改" aria-label="这句不用改">
                  ✓
                </span>
              ) : null}
              {message.role === "user" &&
              session.corrections_enabled &&
              !message.assisted &&
              pendingCorrectionId !== message.id &&
              message.correction_status === "failed" ? (
                <p className="correction-miss" data-testid="correction-failed">
                  模型调用失败，这句还没看完。
                  <button type="button" className="text-button" data-testid="correction-retry" onClick={() => void requestCorrection(message.id)}>
                    再看一次
                  </button>
                </p>
              ) : null}
            </MessageBubble>
          ))}
          {sending ? (
            <p className="reply-wait">
              <Avatar name={session.scene.partner_name} />
              <span>{session.scene.partner_name} 在接话…</span>
            </p>
          ) : null}
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
        {sheetOpen ? (
          <button type="button" className="sheet-backdrop" aria-label="收起" onClick={closeSheet} />
        ) : null}
        <aside className={`rail${sheetOpen ? " sheet-open" : ""}`}>
          <div className="sheet-bar">
            <span className="sheet-grab" aria-hidden="true" />
            <button type="button" className="ghost sheet-close" onClick={closeSheet}>
              收起
            </button>
          </div>
          <div className="sheet-scroll">
          {gloss ? (
            <GlossCard
              gloss={gloss}
              saved={savedKey === `word:${gloss.text}`}
              onClose={dismissGloss}
              onKeep={() => {
                void keep(gloss.text, gloss.gloss_zh, "word").then((saved) => {
                  if (saved) dismissGloss();
                });
              }}
            />
          ) : null}
          {!phone || coachOpen ? (
          <form className="panel" onSubmit={onAsk}>
            <textarea
              id="coach-input"
              data-testid="coach-input"
              value={intent}
              aria-label="想说的意思"
              placeholder={intentListening ? "正在听…" : "例如：我想要一杯冰拿铁"}
              readOnly={intentListening}
              onChange={(event) => setIntent(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="coach-actions">
              {microphone ? (
                <button
                  type="button"
                  ref={intentHoldRef}
                  className={`mic ${intentListening ? "live" : ""}`}
                  data-testid="coach-hold"
                  disabled={coachLoading || listening}
                >
                  {intentListening ? "正在听…" : "按住说"}
                </button>
              ) : null}
              <button className="primary" type="submit" data-testid="coach-ask" disabled={coachLoading || intentListening || !intent.trim()}>
                {coachLoading ? "在想句子…" : "告诉我怎么说"}
              </button>
            </div>
            {coachLine ? (
              <div className="coach-result">
                <p className="coach-kicker">可以说</p>
                <p data-testid="coach-sentence">{coachLine.sentence}</p>
                <div className="line-actions">
                  <HearButton text={coachLine.sentence} speakKey={`coach:${coachLine.sentence}`} />
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
                  <HearButton text={coachLine.simpler} speakKey={`coach-simple:${coachLine.simpler}`} />
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
          ) : null}
          </div>
        </aside>
        {recap ? null : (
          <form className={`composer ${inputMode === "voice" ? "is-voice" : "is-text"}`} onSubmit={onSend}>
            {inputMode === "voice" && !listening && draft.trim() ? (
              <div className="voice-preview">
                <textarea
                  ref={voiceRef}
                  value={draft}
                  aria-label="刚说的英语"
                  rows={1}
                  disabled={sending}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <button className="primary composer-send" type="submit" data-testid="send-message" disabled={sending || !draft.trim()}>
                  发送
                </button>
                <button type="button" className="composer-chip" onClick={() => setDraft("")}>
                  收起
                </button>
              </div>
            ) : null}
            <div className="composer-row">
            {microphone ? (
              <button
                type="button"
                className="composer-switch"
                aria-label={inputMode === "voice" ? "打字" : "说话"}
                onClick={() => {
                  listenerRef.current?.stop();
                  const next = inputMode === "voice" ? "text" : "voice";
                  if (next === "text") focusDraft.current = true;
                  setInputMode(next);
                }}
              >
                {inputMode === "voice" ? <KeyboardIcon /> : <MicIcon />}
              </button>
            ) : null}
            {inputMode === "voice" && microphone ? (
              <button
                type="button"
                ref={talkHoldRef}
                className={`hold-bar ${listening ? "live" : ""}`}
                data-testid="hold-to-talk"
                disabled={sending || intentListening || recapLoading}
              >
                {listening ? "松开 结束" : "按住 说话"}
              </button>
            ) : (
              <textarea
                id="message-input"
                ref={draftRef}
                data-testid="message-input"
                rows={1}
                value={draft}
                aria-label="英语"
                placeholder="英语"
                disabled={sending || recapLoading}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
            )}
            {inputMode === "text" && draft.trim() ? (
              <button className="primary composer-send" type="submit" data-testid="send-message" disabled={sending || recapLoading}>
                发送
              </button>
            ) : null}
            <button type="button" className="composer-chip coach-open" disabled={recapLoading} onClick={() => setCoachOpen(true)}>
              怎么说
            </button>
            </div>
          </form>
        )}
      </div>
      {microphone ? null : (
        <p className="footnote">这个浏览器不能直接听你说话，先打字。对方的话会跟着读出来。</p>
      )}
    </main>
  );
}
