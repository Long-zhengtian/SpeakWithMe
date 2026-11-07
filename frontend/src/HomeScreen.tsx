import { useEffect, useState } from "react";
import { ApiError, api } from "./api/client";
import { formatWhen } from "./lib/time";
import type { Profile } from "./types";

type HomeScreenProps = {
  onPractice: () => void;
  onRecords: () => void;
  onPhrases: () => void;
  onSettings: () => void;
};

export function HomeScreen({ onPractice, onRecords, onPhrases, onSettings }: HomeScreenProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
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
      .settings()
      .then((next) => {
        if (alive) setHasKey(next.api_key_set);
      })
      .catch(() => {
        if (alive) setHasKey(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="home">
      <header className="home-top">
        <div>
          <p className="brand">Speaking With Me</p>
          <div className="home-links">
            <button type="button" className="text-button back-link" data-testid="open-phrases" onClick={onPhrases}>
              句型本
            </button>
            <button type="button" className="text-button back-link" data-testid="open-settings" onClick={onSettings}>
              设置
            </button>
          </div>
          <h1>我的练习</h1>
          <p className="lede">每场对话、指正和小结都留在这台电脑上。下一场开始前，可以先看上次留下的一句。</p>
          {hasKey === false ? <p className="lede">先填写 API key，对话、指正和怎么说都会用它。</p> : null}
        </div>
        <button
          type="button"
          className="primary"
          data-testid={hasKey ? "home-start" : "home-need-key"}
          disabled={hasKey === null}
          onClick={hasKey ? onPractice : onSettings}
        >
          {hasKey === false ? "填写密钥" : "开始一场"}
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
        <>
          <section className="stat-row" data-testid="profile-stats">
            <button type="button" className="stat-card" data-testid="open-records" onClick={onRecords}>
              <strong>{profile.stats.sessions}</strong>
              <span>场练习</span>
            </button>
            <article>
              <strong>{profile.stats.user_turns}</strong>
              <span>句自己说的</span>
            </article>
            <article>
              <strong>{profile.stats.corrections}</strong>
              <span>处指正</span>
            </article>
            <article>
              <strong>{profile.stats.assisted_turns}</strong>
              <span>句借助说的</span>
            </article>
          </section>
          <div className="home-grid">
            <section className="panel feedback">
              <h2>上一场反馈</h2>
              {profile.latest_feedback ? (
                <div data-testid="latest-feedback">
                  <p className="scene-kicker">
                    {profile.latest_feedback.scene_title_zh} · {formatWhen(profile.latest_feedback.finished_at)}
                  </p>
                  <ul>
                    {profile.latest_feedback.went_well.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <p className="try-next">{profile.latest_feedback.try_next}</p>
                  {profile.latest_feedback.keep_sentence ? <p>留下这句：{profile.latest_feedback.keep_sentence}</p> : null}
                  {profile.latest_feedback.revised_from ? (
                    <p>你当时说的是：{profile.latest_feedback.revised_from}</p>
                  ) : null}
                </div>
              ) : (
                <p className="muted">结束一场之后，这里会留下一句下次可以自己说的话。</p>
              )}
              {profile.focus.length > 0 ? (
                <div className="focus-row">
                  {profile.focus.map((item) => (
                    <span key={item.category}>
                      {item.label_zh} · {item.count}
                    </span>
                  ))}
                </div>
              ) : null}
            </section>
            <section className="panel">
              <h2>最近的指正</h2>
              {profile.recent_corrections.length === 0 ? (
                <p className="muted">还没有要改的句子。</p>
              ) : (
                <ul className="note-list">
                  {profile.recent_corrections.map((note) => (
                    <li key={`${note.scene_title_zh}-${note.suggestion}`}>
                      <span>{note.label_zh}</span>
                      <strong>{note.suggestion}</strong>
                      <em>{note.explanation_zh}</em>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
