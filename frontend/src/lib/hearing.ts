const cjk = /[\u3400-\u9fff]/;

export function keepHearing(heard: string, next: string) {
  const fixed = next.replace(/\s+/g, " ").trim();
  if (!fixed) return heard;
  const originalWords = heard.split(/\s+/).filter(Boolean);
  const nextWords = fixed.split(/\s+/).filter(Boolean);
  if (!originalWords.length || !nextWords.length) return heard;
  if (originalWords.join(" ").toLowerCase() === nextWords.join(" ").toLowerCase()) return heard;
  if (cjk.test(heard)) return keepMixed(heard, originalWords, nextWords, fixed);
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

function keepMixed(heard: string, originalWords: string[], nextWords: string[], fixed: string) {
  const heardCjk = (heard.match(/[\u3400-\u9fff]/g) || []).length;
  const nextCjk = (nextWords.join(" ").match(/[\u3400-\u9fff]/g) || []).length;
  if (nextCjk >= heardCjk) return heard;
  const anchors = originalWords.map(core).filter((word) => word && !cjk.test(word));
  const nextCores = nextWords.map(core).filter(Boolean);
  const shared = anchors.length ? commonWords(anchors, nextCores) : nextCores.length;
  if (anchors.length && shared / anchors.length < 0.62) return heard;
  const added = nextCores.length - shared;
  if (added > Math.max(8, heardCjk)) return heard;
  if (shared === anchors.length && nextCores.length === anchors.length) return heard;
  return fixed;
}

function core(word: string) {
  return word.toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "");
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
