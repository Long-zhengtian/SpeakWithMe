export type CorrectionPiece = { kind: "same"; text: string } | { kind: "change"; from: string; to: string };

function words(text: string) {
  return text.trim().split(/\s+/).filter(Boolean);
}

function stem(word: string) {
  return word.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, "").toLowerCase();
}

function sameWord(left: string, right: string) {
  const a = stem(left);
  const b = stem(right);
  return a.length > 0 && a === b;
}

export function correctionPieces(original: string, suggestion: string): CorrectionPiece[] {
  const left = words(original);
  const right = words(suggestion);
  const rows = left.length + 1;
  const cols = right.length + 1;
  const score: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      score[i][j] = sameWord(left[i], right[j]) ? score[i + 1][j + 1] + 1 : Math.max(score[i + 1][j], score[i][j + 1]);
    }
  }
  const raw: Array<{ op: "same" | "del" | "ins"; text: string }> = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (sameWord(left[i], right[j])) {
      raw.push({ op: "same", text: right[j] });
      i += 1;
      j += 1;
    } else if (score[i + 1][j] >= score[i][j + 1]) {
      raw.push({ op: "del", text: left[i] });
      i += 1;
    } else {
      raw.push({ op: "ins", text: right[j] });
      j += 1;
    }
  }
  while (i < left.length) raw.push({ op: "del", text: left[i++] });
  while (j < right.length) raw.push({ op: "ins", text: right[j++] });

  const pieces: CorrectionPiece[] = [];
  let cursor = 0;
  while (cursor < raw.length) {
    if (raw[cursor].op === "same") {
      pieces.push({ kind: "same", text: raw[cursor].text });
      cursor += 1;
      continue;
    }
    const from: string[] = [];
    const to: string[] = [];
    while (cursor < raw.length && raw[cursor].op !== "same") {
      if (raw[cursor].op === "del") from.push(raw[cursor].text);
      else to.push(raw[cursor].text);
      cursor += 1;
    }
    pieces.push({ kind: "change", from: from.join(" "), to: to.join(" ") });
  }
  return pieces;
}
