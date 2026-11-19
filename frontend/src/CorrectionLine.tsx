import { correctionPieces } from "./lib/correctionDiff";

type CorrectionLineProps = {
  original: string;
  suggestion: string;
  onWord?: (word: string) => void;
};

export function CorrectionLine({ original, suggestion, onWord }: CorrectionLineProps) {
  const pieces = correctionPieces(original, suggestion);
  return (
    <p className="correction-line" data-testid="correction-line">
      {pieces.map((piece, index) => (
        <span key={`${piece.kind}-${index}`}>
          {index > 0 ? " " : null}
          {piece.kind === "same" ? (
            <Words text={piece.text} onWord={onWord} />
          ) : (
            <>
              {piece.from ? (
                <s className="correction-drop">
                  <Words text={piece.from} onWord={onWord} />
                </s>
              ) : null}
              {piece.from && piece.to ? " " : null}
              {piece.to ? (
                <strong className="correction-next">
                  <Words text={piece.to} onWord={onWord} />
                </strong>
              ) : null}
            </>
          )}
        </span>
      ))}
    </p>
  );
}

function Words({ text, onWord }: { text: string; onWord?: (word: string) => void }) {
  if (!onWord) return text;
  const parts = text.split(/([A-Za-z][A-Za-z']*)/g);
  return parts.map((part, index) =>
    /^[A-Za-z]/.test(part) ? (
      <button key={`${part}-${index}`} type="button" className="word" onClick={() => onWord(part)}>
        {part}
      </button>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}
