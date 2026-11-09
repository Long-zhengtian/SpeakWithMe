import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ApiError, api, subscribePractice } from "./api/client";
import { RadarScore } from "./RadarScore";
import type { DayScore, HomePlace, Places, PracticeRecord, Profile, Session, SessionScore } from "./types";

type HomeScreenProps = {
  hasKey: boolean | null;
  onPractice: () => void;
  onResume: (sessionId: string) => void;
  onStart: (session: Session) => void;
};

export function HomeScreen({ hasKey, onPractice, onResume, onStart }: HomeScreenProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [places, setPlaces] = useState<Places | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    function load() {
      api
        .profile()
        .then((next) => {
          if (alive) setProfile(next);
        })
        .catch((err: unknown) => {
          if (!alive) return;
          setError(err instanceof ApiError ? err.message : "练习记录没有加载出来。");
        });
    }
    load();
    const stop = subscribePractice(load);
    function loadPlaces() {
      api
        .places()
        .then((next) => {
          if (alive) setPlaces(next);
        })
        .catch(() => {
          if (alive) setPlaces({ pins: [], shelf: [] });
        });
    }
    loadPlaces();
    const stopPlaces = subscribePractice(loadPlaces);
    return () => {
      alive = false;
      stop();
      stopPlaces();
    };
  }, []);

  const records = profile?.records ?? [];
  const resume = records.find((record) => !record.finished_at && !record.ending) ?? null;
  const ready = hasKey === true;

  async function startPlace(place: HomePlace) {
    if (!ready || startingId) return;
    setStartingId(place.id);
    setError(null);
    const level = records.find((record) => record.scene_title_zh === place.title_zh)?.level || "A1";
    try {
      onStart(await api.createSession({ pinId: place.id, level, correctionsEnabled: true }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "这场没有开始。");
      setStartingId(null);
    }
  }

  async function startRandom() {
    if (!ready || startingId) return;
    setStartingId("random");
    setError(null);
    try {
      onStart(await api.createSession({ random: true, level: "B1", correctionsEnabled: true }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "随机场景没有准备好。");
      setStartingId(null);
    }
  }

  async function removePlace(place: HomePlace) {
    if (startingId) return;
    setError(null);
    try {
      await api.removePlace(place.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "没有移出首页。");
    }
  }

  async function restorePlace(place: HomePlace) {
    if (startingId) return;
    setError(null);
    try {
      await api.restorePlace(place.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "没有放回首页。");
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
          <button type="button" className="home-new" data-testid="home-start" disabled={!ready || startingId !== null} onClick={onPractice}>
            开始一场
          </button>
          <button type="button" className="home-new" data-testid="home-random" disabled={!ready || startingId !== null} onClick={() => void startRandom()}>
            {startingId === "random" ? "在想一个场景…" : "随机一场"}
          </button>
        </div>
      </header>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <section className="home-scenes" aria-label="场景">
        {(places?.pins ?? []).map((place) => (
          <SceneRow
            key={place.id}
            title={place.title_zh}
            detail={`${place.partner_name} · ${place.partner_role_zh}`}
            note={startingId === place.id ? "正在开始…" : sceneNote(records, place.title_zh)}
            disabled={!ready || startingId !== null}
            onOpen={() => void startPlace(place)}
            onRemove={() => void removePlace(place)}
          />
        ))}
        {places && places.pins.length === 0 ? <p className="muted">首页还没有场景。可以放回原来的，也可以自己开始一场。</p> : null}
        {places?.shelf.length ? (
          <div className="home-shelf">
            {places.shelf.map((place) => (
              <button key={place.id} type="button" className="text-button" disabled={startingId !== null} onClick={() => void restorePlace(place)}>
                {`放回首页 · ${place.title_zh}`}
              </button>
            ))}
          </div>
        ) : null}
      </section>
      {!profile ? (
        <p className="muted">{error ? "检查后端是否在 8000 端口。" : "正在整理记录…"}</p>
      ) : (
        <ProgressPanel profile={profile} />
      )}
    </main>
  );
}

const REVEAL = 76;
const COMMIT = 150;

function SceneRow({
  title,
  detail,
  note,
  disabled,
  onOpen,
  onRemove,
}: {
  title: string;
  detail: string;
  note: string;
  disabled: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const rowRef = useRef<HTMLElement | null>(null);
  const start = useRef<{ x: number; y: number; id: number; base: number } | null>(null);
  const moved = useRef(false);
  const offsetRef = useRef(0);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".place-menu")) return;
      setMenu(null);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  function shift(next: number) {
    offsetRef.current = next;
    setOffset(next);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "mouse" || disabled) return;
    start.current = { x: event.clientX, y: event.clientY, id: event.pointerId, base: offsetRef.current };
    moved.current = false;
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const origin = start.current;
    if (!origin || event.pointerId !== origin.id) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (!moved.current) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
        start.current = null;
        return;
      }
      if (Math.abs(dx) < 8) return;
      moved.current = true;
      setDragging(true);
    }
    const width = rowRef.current?.offsetWidth || 320;
    shift(Math.min(0, Math.max(-width, origin.base + dx)));
  }

  function onPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!start.current || event.pointerId !== start.current.id) return;
    start.current = null;
    setDragging(false);
    if (!moved.current) return;
    const width = rowRef.current?.offsetWidth || 320;
    const current = offsetRef.current;
    if (current <= -COMMIT) {
      shift(-width);
      onRemove();
      return;
    }
    shift(current <= -REVEAL / 2 ? -REVEAL : 0);
  }

  return (
    <article
      className="home-scene"
      ref={rowRef}
      onContextMenu={(event) => {
        if (disabled) return;
        event.preventDefault();
        setMenu({ top: event.clientY + 6, left: Math.min(event.clientX, window.innerWidth - 120) });
      }}
    >
      <button type="button" className="home-scene-remove" tabIndex={offset < 0 ? 0 : -1} aria-label={`移出首页 ${title}`} disabled={disabled} onClick={onRemove}>
        移出
      </button>
      <button
        type="button"
        className="home-scene-open"
        disabled={disabled}
        style={{ transform: `translateX(${offset}px)`, transition: dragging ? "none" : "transform 0.18s ease" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={() => {
          if (moved.current) {
            moved.current = false;
            return;
          }
          if (offset < 0) {
            setOffset(0);
            return;
          }
          onOpen();
        }}
      >
        <strong>{title}</strong>
        <span>{detail}</span>
        <em>{note}</em>
      </button>
      {menu ? (
        <div className="place-menu" style={{ top: menu.top, left: menu.left }} onPointerDown={(event) => event.stopPropagation()}>
          <button
            type="button"
            onClick={() => {
              setMenu(null);
              onRemove();
            }}
          >
            移出首页
          </button>
        </div>
      ) : null}
    </article>
  );
}

function sceneNote(records: PracticeRecord[], title: string) {
  const match = records.find((record) => record.scene_title_zh === title);
  if (!match) return "还没练过";
  if (match.ending) return "在写小结…";
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
