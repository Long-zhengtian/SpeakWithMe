import type { Gloss } from "./types";

type GlossCardProps = {
  gloss: Gloss;
  saved: boolean;
  onKeep: () => void;
  onClose: () => void;
};

export function GlossCard({ gloss, saved, onKeep, onClose }: GlossCardProps) {
  const lines = gloss.definitions.length > 0 ? gloss.definitions : [gloss.gloss_zh];
  return (
    <section className="panel" data-testid="gloss-panel">
      <div className="gloss-head">
        <h2>{gloss.text}</h2>
        <button type="button" className="ghost slim" data-testid="gloss-close" onClick={onClose}>
          关闭
        </button>
      </div>
      {gloss.phonetic ? (
        <p className="scene-kicker" data-testid="gloss-phonetic">
          {gloss.phonetic}
        </p>
      ) : null}
      {gloss.lemma ? <p className="muted">词典词条是 {gloss.lemma}</p> : null}
      <ul className="gloss-lines">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <button type="button" className="text-button" onClick={onKeep}>
        {saved ? "已收下" : "收下"}
      </button>
    </section>
  );
}
