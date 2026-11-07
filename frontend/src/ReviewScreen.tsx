import { useState } from "react";
import { ApiError, api } from "./api/client";
import { categoryLabel } from "./lib/labels";
import { canSpeak, speak } from "./lib/speak";
import { formatWhen } from "./lib/time";
import type { Gloss, Session } from "./types";
import { WordText } from "./WordText";

type ReviewScreenProps = {
  session: Session;
  onBack: () => void;
  onPractice: () => void;
  canPractice: boolean;
  backLabel?: string;
};

export function ReviewScreen({ session, onBack, onPractice, canPractice, backLabel = "返回记录" }: ReviewScreenProps) {
  const spoken = canSpeak();
  const [gloss, setGloss] = useState<Gloss | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function lookup(word: string) {
    setError(null);
    try {
      setGloss(await api.gloss(word));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "这个词没有查到。");
    }
  }

  async function keep(text: string, glossZh: string, kind: "word" | "sentence") {
    try {
      await api.savePhrase(text, glossZh, kind);
      setSavedKey(`${kind}:${text}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "没有收进句型本。");
    }
  }

  return (
    <main className="studio">
      <header className="studio-top">
        <div>
          <p className="brand">Speaking With Me</p>
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
          <button type="button" className="primary" onClick={onPractice} disabled={!canPractice}>
            再练一场
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
            <section className="panel" data-testid="gloss-panel">
              <h2>{gloss.text}</h2>
              <p>{gloss.gloss_zh}</p>
              <button type="button" className="text-button" onClick={() => void keep(gloss.text, gloss.gloss_zh, "word")}>
                {savedKey === `word:${gloss.text}` ? "已收下" : "收下"}
              </button>
            </section>
          ) : null}
          {session.messages.map((message) => (
            <article key={message.id} className={`bubble ${message.role === "user" ? "user" : "partner"}`}>
              <header>
                <span>{message.role === "user" ? "你" : session.scene.partner_name}</span>
                {message.assisted ? <em>借助</em> : null}
                <button type="button" className="text-button" onClick={() => speak(message.text)} disabled={!spoken}>
                  听
                </button>
              </header>
              <WordText text={message.text} onWord={(word) => void lookup(word)} />
              {message.correction ? (
                <aside className="correction">
                  <span>{categoryLabel(message.correction.category)}</span>
                  <p className="correction-original">{message.correction.original_span}</p>
                  <p className="correction-suggestion">{message.correction.suggestion}</p>
                  <p className="correction-why">{message.correction.explanation_zh}</p>
                </aside>
              ) : null}
            </article>
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
