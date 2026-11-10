import { gunzipSync } from "fflate";

const MAX_DEFINITIONS = 8;
const MAX_GLOSS_CHARS = 80;
const buckets = new Map<string, Record<string, string[]>>();

function normalizeWord(query: string) {
  let word = (query || "").trim().toLowerCase().replaceAll("’", "'").replaceAll("‘", "'");
  let start = 0;
  let end = word.length;
  while (start < end && !/[a-z]/i.test(word[start])) start += 1;
  while (end > start && !/[a-z0-9]/i.test(word[end - 1])) end -= 1;
  return word.slice(start, end);
}

function candidateWords(word: string) {
  const candidates: string[] = [];
  const add = (value: string) => {
    if (value && !candidates.includes(value)) candidates.push(value);
  };
  add(word);
  if (word.endsWith("'s")) add(word.slice(0, -2));
  if (word.endsWith("s'")) add(word.slice(0, -2));
  if (word.endsWith("ies") && word.length > 4) add(`${word.slice(0, -3)}y`);
  if (word.endsWith("es") && word.length > 3) add(word.slice(0, -2));
  if (word.endsWith("s") && word.length > 3) add(word.slice(0, -1));
  if (word.endsWith("ied") && word.length > 4) add(`${word.slice(0, -3)}y`);
  if (word.endsWith("ed") && word.length > 4) {
    add(word.slice(0, -2));
    add(word.slice(0, -1));
  }
  if (word.endsWith("ing") && word.length > 5) {
    add(word.slice(0, -3));
    add(`${word.slice(0, -3)}e`);
  }
  return candidates;
}

function lemmaOf(exchange: string) {
  for (const part of (exchange || "").split("/")) {
    if (part.startsWith("0:") && part.slice(2).trim()) return normalizeWord(part.slice(2));
  }
  return "";
}

function splitDefinitions(translation: string) {
  const lines: string[] = [];
  for (const line of (translation || "").replaceAll("\\n", "\n").split("\n")) {
    const cleaned = line.trim();
    if (cleaned) lines.push(cleaned);
    if (lines.length >= MAX_DEFINITIONS) break;
  }
  return lines;
}

let parser: Worker | null = null;
let parseQueue: Promise<unknown> = Promise.resolve();

function dictionaryWorker() {
  if (!parser) parser = new Worker(new URL("./dictWorker.ts", import.meta.url), { type: "module" });
  return parser;
}

function parseShard(compressed: ArrayBuffer) {
  const run = () => {
    if (typeof Worker === "undefined") {
      const text = new TextDecoder().decode(gunzipSync(new Uint8Array(compressed)));
      return Promise.resolve(JSON.parse(text) as Record<string, string[]>);
    }
    const worker = dictionaryWorker();
    return new Promise<Record<string, string[]>>((resolve, reject) => {
      const finish = (event: MessageEvent<{ ok: boolean; table?: Record<string, string[]> }>) => {
        worker.removeEventListener("message", finish);
        if (event.data.ok && event.data.table) resolve(event.data.table);
        else reject(new Error("dictionary"));
      };
      worker.addEventListener("message", finish);
      worker.postMessage(compressed, [compressed]);
    });
  };
  const next = parseQueue.then(run, run);
  parseQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function bucket(letter: string) {
  const name = letter >= "a" && letter <= "z" ? letter : "";
  if (buckets.has(name)) return buckets.get(name) || {};
  if (!name) {
    buckets.set(name, {});
    return {};
  }
  const response = await fetch(`./ecdict/${name}.bin`);
  if (!response.ok) {
    buckets.set(name, {});
    return {};
  }
  let parsed: Record<string, string[]> = {};
  try {
    parsed = await parseShard(await response.arrayBuffer());
  } catch {
    parsed = {};
  }
  buckets.set(name, parsed);
  return parsed;
}

async function entry(word: string) {
  if (!word) return null;
  const table = await bucket(word[0]);
  return table[word] || null;
}

export async function lookupGloss(query: string) {
  const normalized = normalizeWord(query);
  if (!normalized) return null;
  for (const candidate of candidateWords(normalized)) {
    const found = await entry(candidate);
    if (!found) continue;
    const lemmaWord = lemmaOf(found[2] || "");
    const base = lemmaWord && lemmaWord !== candidate ? await entry(lemmaWord) : null;
    const definitions: string[] = [];
    for (const line of [...splitDefinitions(base?.[1] || ""), ...splitDefinitions(found[1] || "")]) {
      if (!definitions.includes(line)) definitions.push(line);
    }
    const limited = definitions.slice(0, MAX_DEFINITIONS);
    let gloss = limited[0] || "";
    if (gloss.length > MAX_GLOSS_CHARS) gloss = gloss.slice(0, MAX_GLOSS_CHARS);
    if (!gloss) continue;
    let phonetic = found[0] || "";
    if (!phonetic && base) phonetic = base[0] || "";
    let shown = lemmaWord && lemmaWord !== normalized ? lemmaWord : "";
    if (!shown && candidate !== normalized) shown = candidate;
    return {
      text: query.trim(),
      gloss_zh: gloss,
      phonetic,
      definitions: limited,
      lemma: shown,
    };
  }
  return null;
}
