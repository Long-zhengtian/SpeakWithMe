import { FormEvent, useEffect, useState } from "react";
import { ApiError, api } from "./api/client";
import type { Catalog, Partner, Session } from "./types";

type SetupScreenProps = {
  onStart: (session: Session) => void;
  onBack: () => void;
};

export function SetupScreen({ onStart, onBack }: SetupScreenProps) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [partnerId, setPartnerId] = useState("");
  const [personality, setPersonality] = useState("");
  const [levelId, setLevelId] = useState("");
  const [situation, setSituation] = useState("");
  const [pinHome, setPinHome] = useState(false);
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
        const first = next.partners[0];
        setPartnerId(first?.id ?? "");
        setPersonality(first?.personality_zh ?? "");
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

  function choosePartner(partner: Partner) {
    setPartnerId(partner.id);
    setPersonality(partner.personality_zh);
  }

  async function keepPersonality() {
    const partner = catalog?.partners.find((item) => item.id === partnerId);
    const text = personality.trim();
    if (!partner) return;
    if (!text) {
      setPersonality(partner.personality_zh);
      return;
    }
    if (text === partner.personality_zh) return;
    try {
      const saved = await api.savePartner(partner.id, text);
      setCatalog((current) =>
        current
          ? { ...current, partners: current.partners.map((item) => (item.id === saved.id ? saved : item)) }
          : current,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "性格没有记下。");
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const custom = situation.trim();
    if (!custom || !partnerId || !levelId || pending) return;
    setPending(true);
    setError(null);
    try {
      if (personality.trim()) await keepPersonality();
      onStart(
        await api.createSession({
          level: levelId,
          situationZh: custom,
          partnerId,
          pin: pinHome,
          correctionsEnabled,
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "这场没有开始。");
      setPending(false);
    }
  }

  const selected = catalog?.partners.find((item) => item.id === partnerId);

  return (
    <main className="setup">
      <header className="studio-top">
        <div>
          <h1>开一场</h1>
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
              <legend>和谁说</legend>
              <div className="levels">
                {catalog.partners.map((partner) => (
                  <button
                    key={partner.id}
                    type="button"
                    className="level"
                    aria-pressed={partner.id === partnerId}
                    onClick={() => choosePartner(partner)}
                  >
                    <strong>{partner.name}</strong>
                    <span>{partner.personality_zh}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            {selected ? (
              <label className="personality-field">
                {selected.name} 的性格
                <textarea
                  value={personality}
                  maxLength={80}
                  aria-label={`${selected.name} 的性格`}
                  onChange={(event) => setPersonality(event.target.value)}
                  onBlur={() => void keepPersonality()}
                />
              </label>
            ) : null}
            <label htmlFor="custom-situation">这场在哪</label>
            <textarea
              id="custom-situation"
              data-testid="custom-situation"
              value={situation}
              placeholder="例如：我在机场找丢失的行李"
              onChange={(event) => setSituation(event.target.value)}
            />
            <label className="pin-choice">
              <input type="checkbox" checked={pinHome} onChange={(event) => setPinHome(event.target.checked)} />
              放到首页
            </label>
            <fieldset>
              <legend>指正</legend>
              <div className="levels">
                <button type="button" className="level" aria-pressed={correctionsEnabled} onClick={() => setCorrectionsEnabled(true)}>
                  <strong>正常</strong>
                  <span>每句都改成完整的一句。</span>
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
            <button className="primary" type="submit" data-testid="start-session" disabled={pending || !situation.trim()}>
              {pending ? "正在准备…" : "开始这场"}
            </button>
          </>
        )}
      </form>
    </main>
  );
}
