export const MAX_MESSAGE_CHARS = 800;
export const MAX_INTENT_CHARS = 400;
export const MAX_REPLY_SENTENCES = 2;
export const MAX_CONTEXT_TURNS = 8;
export const CHAT_CONTEXT_CHARS = 12000;
export const CHAT_RECENT_MESSAGES = 16;
export const JSON_ATTEMPTS = 2;

export function cleanReply(text: string) {
  let cleaned = (text || "").trim();
  if (cleaned.length >= 2 && cleaned[0] === cleaned[cleaned.length - 1] && (cleaned[0] === '"' || cleaned[0] === "'")) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

export function limitSentences(text: string, maxSentences = MAX_REPLY_SENTENCES) {
  const parts = (text || "").trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  return parts.slice(0, maxSentences).join(" ");
}

export function mostlyChinese(text: string) {
  const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  return chinese > 0 && chinese >= latin;
}

export function ensurePartnerEnglish(text: string, fallback: string, maxSentences = MAX_REPLY_SENTENCES) {
  const cleaned = limitSentences(cleanReply(text), maxSentences);
  if (!cleaned || mostlyChinese(cleaned)) return fallback;
  return cleaned;
}

export function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function nowIso() {
  return new Date().toISOString();
}

export class EngineError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function parseJsonObject(raw: string): Record<string, unknown> {
  const text = (raw || "").trim();
  if (!text) throw new EngineError(502, "bad_json", "模型没有返回可用的内容。");
  try {
    const value = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const value = JSON.parse(text.slice(start, end + 1));
        if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
      } catch {
        /* try the repair request */
      }
    }
  }
  throw new EngineError(502, "bad_json", "模型没有返回可用的内容。");
}
