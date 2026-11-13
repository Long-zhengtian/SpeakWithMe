export function keepHearing(heard: string, next: string) {
  const fixed = next.replace(/\s+/g, " ").trim();
  if (!fixed) return heard;
  const originalWords = heard.split(/\s+/).filter(Boolean);
  const nextWords = fixed.split(/\s+/).filter(Boolean);
  if (!originalWords.length || !nextWords.length) return heard;
  if (originalWords.join(" ").toLowerCase() === nextWords.join(" ").toLowerCase()) return heard;
  const limit = Math.max(2, Math.floor(originalWords.length * 0.34));
  if (Math.abs(originalWords.length - nextWords.length) > limit) return heard;
  const shared = commonWords(
    originalWords.map((word) => word.toLowerCase()),
    nextWords.map((word) => word.toLowerCase()),
  );
  const longer = Math.max(originalWords.length, nextWords.length);
  if (shared / longer < 0.62) return heard;
  return fixed;
}

function commonWords(left: string[], right: string[]) {
  const rows = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1).fill(0));
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      rows[i][j] = left[i - 1] === right[j - 1] ? rows[i - 1][j - 1] + 1 : Math.max(rows[i - 1][j], rows[i][j - 1]);
    }
  }
  return rows[left.length][right.length];
}
