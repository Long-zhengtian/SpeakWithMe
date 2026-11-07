import { useEffect, useState } from "react";
import { ApiError, api } from "./api/client";
import { canSpeak, speak } from "./lib/speak";
import type { Phrase } from "./types";

type PhrasesScreenProps = {
  onBack: () => void;
};

export function PhrasesScreen({ onBack }: PhrasesScreenProps) {
  const [phrases, setPhrases] = useState<Phrase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const spoken = canSpeak();

  useEffect(() => {
    let alive = true;
    api
      .phrases()
      .then((next) => {
        if (alive) setPhrases(next);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof ApiError ? err.message : "句型本没有打开。");
      });
    return () => {
      alive = false;
    };
  }, []);

  async function remove(id: string) {
    setError(null);
    try {
      await api.deletePhrase(id);
      setPhrases((current) => (current ? current.filter((item) => item.id !== id) : current));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "这一条没有去掉。");
    }
  }

  return (
    <main className="home">
      <header className="home-top">
        <div>
          <p className="brand">Speaking With Me</p>
          <button type="button" className="text-button back-link" onClick={onBack}>
            回到主页
          </button>
          <h1>句型本</h1>
          <p className="lede">对话里点过的词，和收下的句子，都留在这里。</p>
        </div>
      </header>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {!phrases ? (
        <p className="muted">{error ? "检查后端是否在 8000 端口。" : "正在整理句型本…"}</p>
      ) : phrases.length === 0 ? (
        <p className="muted">还没有收下的词或句子。对话里点一个英语词，就可以留下。</p>
      ) : (
        <div className="records" data-testid="phrases-page">
          {phrases.map((phrase) => (
            <article key={phrase.id} className="record phrase-card">
              <span className="scene-kicker">{phrase.kind === "word" ? "词" : "句子"}</span>
              <strong>{phrase.text}</strong>
              <span>{phrase.gloss_zh}</span>
              <span className="line-actions">
                <button type="button" className="text-button" onClick={() => speak(phrase.text)} disabled={!spoken}>
                  听
                </button>
                <button type="button" className="text-button" onClick={() => void remove(phrase.id)}>
                  去掉
                </button>
              </span>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
