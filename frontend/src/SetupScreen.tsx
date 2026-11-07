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
      <header className="studio-top">
        <div>
          <h1>开一场</h1>
          <p className="lede">选处境和水平。聊天只接话，指正在旁边，怎么说留到你问的时候。</p>
        </div>
        <button type="button" className="ghost" onClick={onBack}>
          返回练习
        </button>
      </header>
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
