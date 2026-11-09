import { useEffect, useState } from "react";
import { ApiError, api } from "./api/client";
import { RadarScore } from "./RadarScore";
import type { Catalog, DayScore, Phrase, PracticeRecord, Profile, Scene, Session, SessionScore } from "./types";

type HomeScreenProps = {
  hasKey: boolean | null;
  onPractice: () => void;
  onResume: (sessionId: string) => void;
  onStart: (session: Session) => void;
  onPhrases: () => void;
};

export function HomeScreen({ hasKey, onPractice, onResume, onStart, onPhrases }: HomeScreenProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

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
    api
      .catalog()
      .then((next) => {
        if (alive) setCatalog(next);
      })
      .catch(() => {
        if (alive) setCatalog(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  const records = profile?.records ?? [];
  const resume = records.find((record) => !record.finished_at) ?? null;
  const ready = hasKey === true;

  async function startScene(scene: Scene) {
    if (!ready || startingId) return;
    setStartingId(scene.id);
    setError(null);
    const level = records.find((record) => record.scene_title_zh === scene.title_zh)?.level || "A1";
    try {
      onStart(await api.createSession({ sceneId: scene.id, level, correctionsEnabled: true }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "这场没有开始。");
      setStartingId(null);
    }
  }

  return (
    <main className="home">
      <header className="home-top">
        <div>
          <h1>练习</h1>
          {hasKey === false ? <p className="lede">模型还没接上。到「设置」里选一个来源。</p> : null}
        </div>
        <div className="home-actions">
          {resume ? (
            <button type="button" className="primary" disabled={!ready} onClick={() => onResume(resume.id)}>
              {`接着说 · ${resume.scene_title_zh}`}
            </button>
          ) : null}
          <button type="button" className="home-new" data-testid="home-start" disabled={!ready} onClick={onPractice}>
            开始一场
          </button>
        </div>
      </header>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <section className="home-scenes" aria-label="场景">
        {(catalog?.scenes ?? []).map((scene) => (
          <button
            key={scene.id}
            type="button"
            className="home-scene"
            disabled={!ready || startingId !== null}
            onClick={() => void startScene(scene)}
          >
            <strong>{scene.title_zh}</strong>
            <span>{`${scene.partner_name} · ${scene.partner_role_zh}`}</span>
            <em>{startingId === scene.id ? "正在开始…" : sceneNote(records, scene.title_zh)}</em>
          </button>
        ))}
      </section>
      <PhrasePrompt phrases={phrases} onOpen={onPhrases} />
      {!profile ? (
        <p className="muted">{error ? "检查后端是否在 8000 端口。" : "正在整理记录…"}</p>
      ) : (
        <ProgressPanel profile={profile} />
      )}
    </main>
  );
}

function PhrasePrompt({ phrases, onOpen }: { phrases: Phrase[]; onOpen: () => void }) {
  const sentence = phrases.find((item) => item.kind === "sentence" && item.learning_status !== "mastered");
  const word = phrases.find((item) => item.kind !== "sentence" && item.learning_status !== "mastered");
  const phrase = sentence ?? word;
  if (!phrase) return null;
  return (
    <button type="button" className="home-phrase" onClick={onOpen}>
      <span>{sentence ? "这句话还没学会" : "这个词还没学会"}</span>
      <strong>{phrase.text}</strong>
    </button>
  );
}

function sceneNote(records: PracticeRecord[], title: string) {
  const match = records.find((record) => record.scene_title_zh === title);
  if (!match) return "还没练过";
  if (!match.finished_at) return "进行中";
  return `上次 ${monthDay(match.finished_at)}`;
}

function monthDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function ProgressPanel({ profile }: { profile: Profile }) {
  const progress = profile.progress;
  const days = progress?.days ?? [];
  const today = days.find((day) => day.today);
  const [selectedDate, setSelectedDate] = useState<string | null>(today?.score !== null ? today?.date ?? null : null);
  const selected = days.find((day) => day.date === selectedDate && day.score !== null) ?? null;
  const selectedScore: SessionScore | null =
    selected && selected.score !== null ? { total: selected.score, dimensions: selected.dimensions } : null;
  return (
    <section className="panel progress" data-testid="progress">
      <p className="habit">{habitLine(progress)}</p>
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
                  style={{ height: mark.score === null ? 4 : Math.max(8, Math.round((mark.score / 100) * 28)) }}
                />
              </span>
              <em>{mark.label}</em>
            </button>
          );
        })}
      </div>
      {selected && selectedScore ? (
        <div className="today-score">
          <RadarScore score={selectedScore} testId="day-score" />
          <div>
            <p className="progress-summary">
              <strong>{dayHeading(selected)}</strong>
            </p>
            {selected?.summary ? <p className="day-summary">{selected.summary}</p> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function dayHeading(day: DayScore | undefined) {
  if (!day) return "";
  if (day.today) return "今天";
  const [, month, date] = day.date.split("-");
  return `${Number(month)}月${Number(date)}日`;
}

function habitLine(progress: Profile["progress"]) {
  const days = progress?.practice_days ?? 0;
  if (!progress || progress.streak === 0) {
    return days ? `还没接上连续练习 · 一共 ${days} 天` : "还没接上连续练习";
  }
  const parts = [`连续 ${progress.streak} 天`, `一共 ${days} 天`];
  if (progress.best > progress.streak) parts.push(`最长 ${progress.best} 天`);
  return parts.join(" · ");
}
