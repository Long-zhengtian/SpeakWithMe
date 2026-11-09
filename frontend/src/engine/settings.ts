import { store } from "./store";
import { EngineError } from "./text";

export type ProviderPreset = { id: string; label: string; base_url: string; custom_url: boolean };

export const PRESETS: ProviderPreset[] = [
  { id: "openai", label: "OpenAI", base_url: "https://api.openai.com/v1", custom_url: false },
  { id: "grok", label: "Grok", base_url: "https://api.x.ai/v1", custom_url: false },
  { id: "glm", label: "智谱 GLM", base_url: "https://open.bigmodel.cn/api/paas/v4", custom_url: false },
  { id: "deepseek", label: "DeepSeek", base_url: "https://api.deepseek.com/v1", custom_url: false },
  { id: "compatible", label: "其他兼容接口", base_url: "", custom_url: true },
];

export type StoredSettings = {
  provider: string;
  base_url: string;
  model: string;
  api_key: string;
  keys: Record<string, string>;
  models: Record<string, string>;
  bases: Record<string, string>;
  model_catalog: Record<string, string[]>;
};

const EMPTY: StoredSettings = {
  provider: "openai",
  base_url: "https://api.openai.com/v1",
  model: "",
  api_key: "",
  keys: {},
  models: {},
  bases: {},
  model_catalog: {},
};

export async function readSettings() {
  const stored = await store.get<StoredSettings>("meta", "llm");
  return normalize(stored || EMPTY);
}

export async function writeSettings(settings: StoredSettings) {
  const next = normalize(settings);
  await store.put("meta", "llm", next);
  return next;
}

export function normalize(record: StoredSettings): StoredSettings {
  let provider = record.provider;
  if (!provider || provider === "openai_compatible" || provider === "mock" || provider === "unconfigured") provider = "openai";
  if (!PRESETS.some((preset) => preset.id === provider)) provider = "openai";
  const keys = { ...(record.keys || {}) };
  const models = { ...(record.models || {}) };
  const bases = { ...(record.bases || {}) };
  if (record.api_key) keys[provider] = keys[provider] || record.api_key;
  if (record.model) models[provider] = models[provider] || record.model;
  if (record.base_url && provider === "compatible") bases[provider] = bases[provider] || record.base_url;
  const catalog: Record<string, string[]> = {};
  for (const [name, ids] of Object.entries(record.model_catalog || {})) {
    catalog[name] = (ids || []).filter(Boolean);
  }
  const preset = PRESETS.find((item) => item.id === provider)!;
  const base = preset.custom_url ? (bases[provider] || "").replace(/\/$/, "") : preset.base_url;
  return {
    provider,
    base_url: base,
    model: models[provider] || "",
    api_key: keys[provider] || "",
    keys,
    models,
    bases,
    model_catalog: catalog,
  };
}

export function keyHint(apiKey: string) {
  if (!apiKey) return "";
  if (apiKey.length < 8) return "已保存";
  return `${apiKey.slice(0, 3)}…${apiKey.slice(-4)}`;
}

export function publicSettings(record: StoredSettings) {
  const current = normalize(record);
  return {
    provider: current.provider,
    base_url: current.base_url,
    model: current.model,
    api_key_set: Boolean(current.api_key),
    api_key_hint: keyHint(current.api_key),
    providers: PRESETS.map((preset) => {
      const key = current.keys[preset.id] || "";
      const base = preset.custom_url ? (current.bases[preset.id] || "").replace(/\/$/, "") : preset.base_url;
      return {
        id: preset.id,
        label: preset.label,
        base_url: base,
        model: current.models[preset.id] || "",
        custom_url: preset.custom_url,
        api_key_set: Boolean(key),
        api_key_hint: keyHint(key),
        models: current.model_catalog[preset.id] || [],
      };
    }),
  };
}

export function cleanBaseUrl(value: string) {
  const base = (value || "").trim().replace(/\/$/, "");
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    throw new EngineError(422, "bad_base_url", "接口地址要以 http:// 或 https:// 开头。");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new EngineError(422, "bad_base_url", "接口地址要以 http:// 或 https:// 开头。");
  if (base.length > 200) throw new EngineError(422, "bad_base_url", "接口地址太长了。");
  return base;
}

export function cleanModel(value: string) {
  const model = (value || "").trim();
  if (!model || model.length > 80 || /\s/.test(model)) throw new EngineError(422, "bad_model", "模型名称写成一行就好。");
  return model;
}

export function cleanKey(value: string) {
  const key = (value || "").trim();
  if (/\s/.test(key) || key.length > 400) throw new EngineError(422, "bad_api_key", "密钥里不要加空格，贴完整的一行。");
  return key;
}
