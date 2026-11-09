import { useEffect, useState } from "react";
import { ApiError, api } from "./api/client";
import { RadarScore } from "./RadarScore";
import type { DayScore, Phrase, Profile, SessionScore } from "./types";

type HomeScreenProps = {
  hasKey: boolean | null;
  onPractice: () => void;
};

export function HomeScreen({ hasKey, onPractice }: HomeScreenProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .profile()
      .then((next) => {
        if (alive) setProfile(next);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof ApiError ? err.message : "练习记录没有加载出来。");
      });
    api
      .phrases()
      .then((next) => {
        if (alive) setPhrases(next);
      })
      .catch(() => {
        if (alive) setPhrases([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="home">
      <header className="home-top">
        <div>
          <h1>练习</h1>
          {hasKey === false ? <p className="lede">模型还没接上。到「设置」里选一个来源。</p> : null}
        </div>
        <button
          type="button"
          className="primary"
          data-testid="home-start"
          disabled={hasKey !== true}
          onClick={onPractice}
        >
          开始一场
        </button>
      </header>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {!profile ? (
        <p className="muted">{error ? "检查后端是否在 8000 端口。" : "正在整理记录…"}</p>
      ) : (
        <ProgressPanel profile={profile} phrases={phrases} />
      )}
    </main>
  );
}

function ProgressPanel({ profile, phrases }: { profile: Profile; phrases: Phrase[] }) {
  const progress = profile.progress;
  const days = progress?.days ?? [];
  const today = days.find((day) => day.today);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selected = days.find((day) => day.date === selectedDate && day.score !== null) ?? today;
  const sentences = phrases.filter((item) => item.kind === "sentence");
  const words = phrases.filter((item) => item.kind !== "sentence");
  const mastered = (items: Phrase[]) => items.filter((item) => item.learning_status === "mastered").length;
  const streak =
    !progress || progress.streak === 0
      ? "还没接上连续练习"
      : progress.spoke_today
        ? `连续 ${progress.streak} 天`
        : `连续 ${progress.streak} 天，今天还没开口`;
  const selectedScore: SessionScore | null =
    selected && selected.score !== null ? { total: selected.score, dimensions: selected.dimensions } : null;
  return (
    <section className="panel progress" data-testid="progress">
      <h2>进步</h2>
      <div className="today-score">
        {selectedScore ? <RadarScore score={selectedScore} testId="day-score" /> : null}
        <div>
          <p className="progress-summary">
            <strong>{dayHeading(selected)}</strong>
            <span>{streak}</span>
            <span>一共练过 {progress?.practice_days ?? 0} 天</span>
            {progress && progress.best > progress.streak ? <span>最长连续 {progress.best} 天</span> : null}
          </p>
          {selected?.summary ? <p className="day-summary">{selected.summary}</p> : null}
        </div>
      </div>
      <div className="day-strip" aria-label="最近十四天的评分">
        {days.map((mark) => {
          const chosen = selected?.date === mark.date;
          return (
            <button
              key={mark.date}
              type="button"
              className={`day-col${mark.today ? " today" : ""}${chosen ? " selected" : ""}`}
              data-testid={`day-${mark.date}`}
              disabled={mark.score === null}
              aria-pressed={chosen}
              aria-label={mark.score === null ? `${mark.label}，没练` : `${mark.label}，${mark.score} 分`}
              onClick={() => setSelectedDate(mark.date)}
            >
              <span className="day-meter">
                {mark.score !== null ? <span className="day-num">{mark.score}</span> : null}
                <span
                  className={`day-bar${mark.score !== null ? " on" : ""}`}
                  style={{ height: mark.score === null ? 4 : Math.max(8, Math.round((mark.score / 100) * 52)) }}
                />
              </span>
              <em>{mark.label}</em>
            </button>
          );
        })}
      </div>
      {sentences.length > 0 || words.length > 0 ? (
        <p className="muted notebook-progress">
          {`笔记本里，${[
            sentences.length > 0 ? `句子已学会 ${mastered(sentences)}/${sentences.length}` : "",
            words.length > 0 ? `词已学会 ${mastered(words)}/${words.length}` : "",
          ]
            .filter(Boolean)
            .join("，")}。`}
        </p>
      ) : null}
    </section>
  );
}

function dayHeading(day: DayScore | undefined) {
  if (!day || day.score === null) return "今天还没开口";
  if (day.today) return `今天 ${day.score}`;
  const [, month, date] = day.date.split("-");
  return `${Number(month)}/${Number(date)} ${day.score}`;
}
