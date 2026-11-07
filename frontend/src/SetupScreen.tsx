import { FormEvent, useEffect, useState } from "react";
import { ApiError, api } from "./api/client";
import type { Catalog, Session } from "./types";

type SetupScreenProps = {
  onStart: (session: Session) => void;
  onBack: () => void;
};

export function SetupScreen({ onStart, onBack }: SetupScreenProps) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [sceneId, setSceneId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [situation, setSituation] = useState("");
  const [correctionsEnabled, setCorrectionsEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .catalog()
      .then((next) => {
        if (!alive) return;
        setCatalog(next);
        setSceneId(next.scenes[0]?.id ?? "");
        setLevelId(next.levels[0]?.id ?? "");
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof ApiError ? err.message : "场景没有加载出来。");
      });
    return () => {
      alive = false;
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const custom = situation.trim();
    if ((!custom && !sceneId) || !levelId || pending) return;
    setPending(true);
    setError(null);
    try {
      onStart(
        await api.createSession({
          sceneId: custom ? "" : sceneId,
          level: levelId,
          situationZh: custom,
          correctionsEnabled,
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "这场没有开始。");
      setPending(false);
    }
  }

  return (
    <main className="setup">
      <p className="brand">Speaking With Me</p>
      <button type="button" className="text-button back-link" onClick={onBack}>
        回到主页
      </button>
      <h1>开口之前，先把角色分开</h1>
      <p className="lede">
        聊天的人只负责把话说下去。说错了，旁边标一处。不会说，就用中文问该怎么说。
      </p>
      <ol className="roles">
        <li>
          <strong>聊天</strong>
          <span>只接话，不讲语法。</span>
        </li>
        <li>
          <strong>指正</strong>
          <span>一句最多改一处。</span>
        </li>
        <li>
          <strong>怎么说</strong>
          <span>中文进去，英语句子出来。</span>
        </li>
      </ol>
      <form className="setup-card" onSubmit={onSubmit}>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        {!catalog ? (
          <p className="muted">{error ? "检查后端是否在 8000 端口。" : "正在准备场景…"}</p>
        ) : (
          <>
            <fieldset>
              <legend>这场聊什么</legend>
              <div className="scene-grid">
                {catalog.scenes.map((scene) => (
                  <button
                    key={scene.id}
                    type="button"
                    className="scene-card"
                    aria-pressed={!situation.trim() && scene.id === sceneId}
                    data-testid={`scene-${scene.id}`}
                    onClick={() => {
                      setSceneId(scene.id);
                      setSituation("");
                    }}
                  >
                    <span className="scene-kicker">
                      {scene.partner_name} · {scene.partner_role_zh}
                    </span>
                    <strong>{scene.title_zh}</strong>
                    <span>{scene.description_zh}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <label htmlFor="custom-situation">或者自己说这场在哪</label>
            <textarea
              id="custom-situation"
              data-testid="custom-situation"
              value={situation}
              placeholder="例如：我在机场找丢失的行李"
              onChange={(event) => setSituation(event.target.value)}
            />
            <fieldset>
              <legend>指正</legend>
              <div className="levels">
                <button
                  type="button"
                  className="level"
                  aria-pressed={correctionsEnabled}
                  onClick={() => setCorrectionsEnabled(true)}
                >
                  <strong>正常</strong>
                  <span>一句最多改一处。</span>
                </button>
                <button
                  type="button"
                  className="level"
                  aria-pressed={!correctionsEnabled}
                  data-testid="corrections-off"
                  onClick={() => setCorrectionsEnabled(false)}
                >
                  <strong>这场不改</strong>
                  <span>只把对话接下去。</span>
                </button>
              </div>
            </fieldset>
            <fieldset>
              <legend>你现在的水平</legend>
              <div className="levels">
                {catalog.levels.map((level) => (
                  <button
                    key={level.id}
                    type="button"
                    className="level"
                    aria-pressed={level.id === levelId}
                    data-testid={`level-${level.id}`}
                    onClick={() => setLevelId(level.id)}
                  >
                    <strong>{level.label_zh}</strong>
                    <span>{level.hint_zh}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <button className="primary" type="submit" data-testid="start-session" disabled={pending}>
              {pending ? "正在进店…" : "开始这场"}
            </button>
          </>
        )}
      </form>
    </main>
  );
}
