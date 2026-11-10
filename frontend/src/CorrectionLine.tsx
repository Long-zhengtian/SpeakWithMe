import { correctionPieces } from "./lib/correctionDiff";

type CorrectionLineProps = {
  original: string;
  suggestion: string;
};

export function CorrectionLine({ original, suggestion }: CorrectionLineProps) {
  const pieces = correctionPieces(original, suggestion);
  return (
    <p className="correction-line" data-testid="correction-line">
      {pieces.map((piece, index) => (
        <span key={`${piece.kind}-${index}`}>
          {index > 0 ? " " : null}
          {piece.kind === "same" ? (
            piece.text
          ) : (
            <>
              {piece.from ? <s className="correction-drop">{piece.from}</s> : null}
              {piece.from && piece.to ? " " : null}
              {piece.to ? <strong className="correction-next">{piece.to}</strong> : null}
            </>
          )}
        </span>
      ))}
    </p>
  );
}
