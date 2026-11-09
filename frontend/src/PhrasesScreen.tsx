import { useEffect, useState } from "react";
import { ApiError, api } from "./api/client";
import { HearButton } from "./HearButton";
import type { Phrase } from "./types";

export function PhrasesScreen() {
  const [phrases, setPhrases] = useState<Phrase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentenceFilter, setSentenceFilter] = useState<"all" | "learning" | "mastered">("all");
  const [wordFilter, setWordFilter] = useState<"all" | "learning" | "mastered">("all");

  useEffect(() => {
    let alive = true;
    api
      .phrases()
      .then((next) => {
        if (alive) setPhrases(next);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof ApiError ? err.message : "笔记本没有打开。");
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

  async function mark(phrase: Phrase) {
    const next = phrase.learning_status === "mastered" ? "learning" : "mastered";
    setError(null);
    try {
      const saved = await api.setPhraseStatus(phrase.id, next);
      setPhrases((current) => (current ? current.map((item) => (item.id === saved.id ? saved : item)) : current));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "这一条的状态没有改成。");
    }
  }

  const sentences = phrases?.filter((item) => item.kind === "sentence") ?? [];
  const words = phrases?.filter((item) => item.kind !== "sentence") ?? [];
  const visibleSentences = sentences.filter((item) => matches(item, sentenceFilter));
  const visibleWords = words.filter((item) => matches(item, wordFilter));

  return (
    <main className="home">
      <header className="home-top">
        <div>
          <h1>笔记本</h1>
        </div>
      </header>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {!phrases ? (
        <p className="muted">{error ? "检查后端是否在 8000 端口。" : "正在整理笔记本…"}</p>
      ) : phrases.length === 0 ? (
        <p className="muted">还没有收下的词或句子。对话里点一个英语词，或收下一句，就会留在这里。</p>
      ) : (
        <div className="notebook" data-testid="phrases-page">
          <section className="notebook-section" aria-labelledby="notebook-sentences">
            <h2 id="notebook-sentences">
              句子 <span>{countLabel(sentences)}</span>
            </h2>
            {sentences.length === 0 ? (
              <p className="muted notebook-empty">收下的句子会出现在这里。</p>
            ) : (
              <>
                <StatusFilter value={sentenceFilter} onChange={setSentenceFilter} />
                {visibleSentences.length === 0 ? (
                  <p className="muted notebook-empty">这一栏里还没有。</p>
                ) : (
                  <div className="records">
                    {visibleSentences.map((phrase) => (
                      <article key={phrase.id} className="record phrase-card">
                        <div className="phrase-top">
                          <strong>{phrase.text}</strong>
                          <PhraseTools phrase={phrase} onRemove={() => void remove(phrase.id)} onMark={() => void mark(phrase)} />
                        </div>
                        <span className="word-gloss">{phrase.gloss_zh}</span>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
          <section className="notebook-section" aria-labelledby="notebook-words">
            <h2 id="notebook-words">
              词 <span>{countLabel(words)}</span>
            </h2>
            {words.length === 0 ? (
              <p className="muted notebook-empty">对话里点过的词会出现在这里。</p>
            ) : (
              <>
                <StatusFilter value={wordFilter} onChange={setWordFilter} />
                {visibleWords.length === 0 ? (
                  <p className="muted notebook-empty">这一栏里还没有。</p>
                ) : (
                  <div className="word-list">
                    {visibleWords.map((phrase) => (
                      <div key={phrase.id} className="word-row">
                        <strong>{phrase.text}</strong>
                        <span className="word-gloss">{phrase.gloss_zh}</span>
                        <PhraseTools phrase={phrase} onRemove={() => void remove(phrase.id)} onMark={() => void mark(phrase)} />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function matches(phrase: Phrase, filter: "all" | "learning" | "mastered") {
  if (filter === "all") return true;
  const status = phrase.learning_status === "mastered" ? "mastered" : "learning";
  return status === filter;
}

function countLabel(items: Phrase[]) {
  if (items.length === 0) return "0";
  const learned = items.filter((item) => item.learning_status === "mastered").length;
  return `${learned}/${items.length} 已学会`;
}

function StatusFilter({
  value,
  onChange,
}: {
  value: "all" | "learning" | "mastered";
  onChange: (value: "all" | "learning" | "mastered") => void;
}) {
  const options = [
    ["all", "全部"],
    ["learning", "正在学"],
    ["mastered", "已学会"],
  ] as const;
  return (
    <div className="status-filter">
      {options.map(([id, label]) => (
        <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function PhraseTools({ phrase, onRemove, onMark }: { phrase: Phrase; onRemove: () => void; onMark: () => void }) {
  const learned = phrase.learning_status === "mastered";
  return (
    <span className="phrase-tools">
      <button type="button" className="text-button phrase-status" data-testid={`phrase-status-${phrase.id}`} onClick={onMark}>
        {learned ? "移回正在学" : "标为已学会"}
      </button>
      <HearButton text={phrase.text} speakKey={phrase.id} />
      <button type="button" className="hear phrase-remove" aria-label="去掉" onClick={onRemove}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            d="M8 7h8M9 7V5.5h6V7M7 8.5h10l-.7 11h-8.6L7 8.5z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </span>
  );
}
