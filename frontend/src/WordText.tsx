type WordTextProps = {
  text: string;
  onWord: (word: string) => void;
};

export function WordText({ text, onWord }: WordTextProps) {
  const parts = text.split(/([A-Za-z][A-Za-z']*)/g);
  return (
    <p>
      {parts.map((part, index) =>
        /^[A-Za-z]/.test(part) ? (
          <button key={`${part}-${index}`} type="button" className="word" onClick={() => onWord(part)}>
            {part}
          </button>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </p>
  );
}
