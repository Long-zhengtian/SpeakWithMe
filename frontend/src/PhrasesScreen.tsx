import { useEffect, useState } from "react";
import { ApiError, api } from "./api/client";
import { CorrectionLine } from "./CorrectionLine";
import { HearButton } from "./HearButton";
import { categoryLabel } from "./lib/labels";
import type { Phrase } from "./types";

const KIND_KEY = "notebook-kind";
const VIEW_KEY = "notebook-sentence-view";

export function PhrasesScreen() {
  const [phrases, setPhrases] = useState<Phrase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"sentence" | "word">(() => storedChoice(KIND_KEY, ["sentence", "word"] as const, "sentence"));
  const [sentenceView, setSentenceView] = useState<"marked" | "clean">(() =>
    storedChoice(VIEW_KEY, ["marked", "clean"] as const, "marked"),
  );
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

  function chooseKind(next: "sentence" | "word") {
    setKind(next);
    remember(KIND_KEY, next);
  }

  function chooseView(next: "marked" | "clean") {
    setSentenceView(next);
    remember(VIEW_KEY, next);
  }

  const sentences = phrases?.filter((item) => item.kind === "sentence") ?? [];
  const words = phrases?.filter((item) => item.kind !== "sentence") ?? [];
  const visibleSentences = sentences.filter((item) => matches(item, sentenceFilter));
  const visibleWords = words.filter((item) => matches(item, wordFilter));
  const showingSentences = kind === "sentence";
  const visible = showingSentences ? sentences : words;

  return (
    <main className="home">
      <header className="notebook-head">
        <h1>笔记本</h1>
        {phrases && phrases.length > 0 ? <p className="notebook-count">{countLabel(visible)}</p> : null}
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
          <div className="notebook-tools">
            <div className="segment kind-segment" role="group" aria-label="看句子或词">
              <button type="button" aria-pressed={showingSentences} data-testid="notebook-sentences" onClick={() => chooseKind("sentence")}>
                句子
              </button>
              <button type="button" aria-pressed={!showingSentences} data-testid="notebook-words" onClick={() => chooseKind("word")}>
                词
              </button>
            </div>
            {(showingSentences ? sentences : words).length > 0 ? (
              <StatusFilter value={showingSentences ? sentenceFilter : wordFilter} onChange={showingSentences ? setSentenceFilter : setWordFilter} />
            ) : null}
            {showingSentences && sentences.length > 0 ? (
              <button
                type="button"
                className="view-toggle"
                aria-pressed={sentenceView === "marked"}
                data-testid="notebook-view-toggle"
                onClick={() => chooseView(sentenceView === "marked" ? "clean" : "marked")}
              >
                看错误
              </button>
            ) : null}
            {showingSentences && sentences.length > 0 ? (
              <div className="segment view-segment" role="group" aria-label="句子的看法">
                <button
                  type="button"
                  aria-pressed={sentenceView === "marked"}
                  data-testid="notebook-view-marked"
                  onClick={() => chooseView("marked")}
                >
                  带着错误
                </button>
                <button
                  type="button"
                  aria-pressed={sentenceView === "clean"}
                  data-testid="notebook-view-clean"
                  onClick={() => chooseView("clean")}
                >
                  改后的句子
                </button>
              </div>
            ) : null}
          </div>
          {showingSentences ? (
            <section className="notebook-section" aria-label="句子">
              {sentences.length === 0 ? (
                <p className="muted notebook-empty">收下的句子会出现在这里。</p>
              ) : (
                <>
                  {visibleSentences.length === 0 ? (
                    <p className="muted notebook-empty">这一栏里还没有。</p>
                  ) : (
                    <div className="records">
                      {visibleSentences.map((phrase) => (
                        <SentenceCard
                          key={phrase.id}
                          phrase={phrase}
                          marked={sentenceView === "marked"}
                          onRemove={() => void remove(phrase.id)}
                          onMark={() => void mark(phrase)}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          ) : (
            <section className="notebook-section" aria-label="词">
              {words.length === 0 ? (
                <p className="muted notebook-empty">对话里点过的词会出现在这里。</p>
              ) : (
                <>
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
          )}
        </div>
      )}
    </main>
  );
}

function SentenceCard({
  phrase,
  marked,
  onRemove,
  onMark,
}: {
  phrase: Phrase;
  marked: boolean;
  onRemove: () => void;
  onMark: () => void;
}) {
  const showMarks = marked && Boolean(phrase.original_text);
  return (
    <article className="record phrase-card">
      <div className="phrase-top">
        <div className="phrase-body">
          {showMarks ? (
            <aside className="correction">
              {phrase.category ? <span>{categoryLabel(phrase.category)}</span> : null}
              <CorrectionLine original={phrase.original_text || ""} suggestion={phrase.text} />
              <p>{phrase.gloss_zh}</p>
            </aside>
          ) : (
            <>
              <strong>{phrase.text}</strong>
              {phrase.original_text ? null : <span className="word-gloss">{phrase.gloss_zh}</span>}
            </>
          )}
        </div>
        <PhraseTools phrase={phrase} onRemove={onRemove} onMark={onMark} />
      </div>
    </article>
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

function storedChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* the page still switches; the choice just is not kept */
  }
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
