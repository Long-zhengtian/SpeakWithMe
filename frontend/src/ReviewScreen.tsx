import { useState } from "react";
import { ApiError, api } from "./api/client";
import { categoryLabel } from "./lib/labels";
import { closeOverlay, useOverlay } from "./lib/overlay";
import { formatWhen } from "./lib/time";
import type { Gloss, Session } from "./types";
import { GlossCard } from "./GlossCard";
import { MessageBubble } from "./MessageBubble";

type ReviewScreenProps = {
  session: Session;
  onBack: () => void;
  onPractice: () => void;
  onStarted: (session: Session) => void;
  canPractice: boolean;
  backLabel?: string;
};

export function ReviewScreen({
  session,
  onBack,
  onPractice,
  onStarted,
  canPractice,
  backLabel = "返回记录",
}: ReviewScreenProps) {
  const [gloss, setGloss] = useState<Gloss | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  useOverlay(gloss !== null, () => setGloss(null));

  function closeGloss() {
    if (!closeOverlay()) setGloss(null);
  }

  async function lookup(word: string) {
    setError(null);
    try {
      setGloss(await api.gloss(word));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "这个词没有查到。");
    }
  }

  async function startFrom(messageId = "") {
    if (!canPractice || starting) return;
    setStarting(messageId || "opening");
    setError(null);
    try {
      onStarted(await api.forkSession(session.id, messageId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "这场没有重新开始。");
      setStarting(null);
    }
  }

  async function keep(text: string, glossZh: string, kind: "word" | "sentence") {
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
    <main className="studio">
      <header className="studio-top">
        <div>
          <p className="brand">Speak With Me</p>
          <h1>
            {session.scene.title_zh}
            <span>
              {session.scene.partner_name} · {session.level}
              {session.finished_at ? ` · ${formatWhen(session.finished_at)}` : ""}
            </span>
          </h1>
          <p className="goal">这是一场已经记下的练习。</p>
        </div>
        <div className="top-actions">
          <button type="button" className="ghost" onClick={onBack}>
            {backLabel}
          </button>
          <button type="button" className="ghost" onClick={onPractice} disabled={!canPractice || starting !== null}>
            再练一场
          </button>
          <button
            type="button"
            className="primary"
            data-testid="restart-session"
            onClick={() => void startFrom()}
            disabled={!canPractice || starting !== null}
          >
            {starting === "opening" ? "正在开始…" : "重新开始"}
          </button>
        </div>
      </header>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="review-layout">
        <section className="transcript">
          {gloss ? (
            <GlossCard
              gloss={gloss}
              saved={savedKey === `word:${gloss.text}`}
              onClose={closeGloss}
              onKeep={() => {
                void keep(gloss.text, gloss.gloss_zh, "word").then((saved) => {
                  if (saved) closeGloss();
                });
              }}
            />
          ) : null}
          {session.messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              partnerName={session.scene.partner_name}
              onWord={(word) => void lookup(word)}
            >
              <button
                type="button"
                className="text-button"
                data-testid={`continue-${message.id}`}
                onClick={() => void startFrom(message.id)}
                disabled={!canPractice || starting !== null}
              >
                {starting === message.id ? "正在开始…" : "从这句开始"}
              </button>
              {message.correction ? (
                <aside className="correction">
                  <span>{categoryLabel(message.correction.category)}</span>
                  <p className="correction-original">{message.correction.original_span}</p>
                  <p className="correction-suggestion">{message.correction.suggestion}</p>
                  <p className="correction-why">{message.correction.explanation_zh}</p>
                </aside>
              ) : null}
              {message.role === "user" &&
              session.corrections_enabled &&
              !message.assisted &&
              !message.correction &&
              message.correction_status === "clear" ? (
                <span className="correction-ok" title="这句不用改" aria-label="这句不用改">
                  ✓
                </span>
              ) : null}
              {message.role === "user" && session.corrections_enabled && message.correction_status === "failed" ? (
                <p className="correction-miss">模型调用失败，这句还没看完。</p>
              ) : null}
            </MessageBubble>
          ))}
        </section>
        {session.recap ? (
          <section className="panel feedback" data-testid="review-feedback">
            <h2>这场反馈</h2>
            <ul>
              {session.recap.went_well.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="try-next">{session.recap.try_next}</p>
            {session.recap.keep_sentence ? <p>留下这句：{session.recap.keep_sentence}</p> : null}
            {session.recap.revised_from ? <p>你当时说的是：{session.recap.revised_from}</p> : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
