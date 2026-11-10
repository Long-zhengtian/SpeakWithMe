import {
  chatSystem,
  coachSystem,
  correctionSystem,
  foldSystem,
  getLevel,
  getPartner,
  PARTNERS,
  publicScene,
  randomSceneSystem,
  recapSystem,
  SCENES,
  sceneFor,
  sceneSystem,
  type CustomScene,
  type PartnerSpec,
} from "./catalog";
import { lookupGloss } from "./dictionary";
import { complete, completeJson } from "./llm";
import { progressCalendar, scoreSession, categoryLabel } from "./scoring";
import { readSpeech, writeSpeech, type SpeechSettings } from "./speech";
import {
  cleanBaseUrl,
  cleanKey,
  PRESETS,
  publicSettings,
  readSettings,
  writeSettings,
  type StoredSettings,
} from "./settings";
import { store } from "./store";
import {
  CHAT_RECENT_MESSAGES,
  cleanReply,
  EngineError,
  ensurePartnerEnglish,
  MAX_INTENT_CHARS,
  MAX_MESSAGE_CHARS,
  mostlyChinese,
  newId,
  nowIso,
} from "./text";

type Correction = {
  original_span: string;
  suggestion: string;
  category: string;
  explanation_zh: string;
};

type StoredMessage = {
  id: string;
  role: string;
  text: string;
  assisted: boolean;
  correction: Correction | null;
  correction_ready: boolean;
  correction_status: string;
  created_at: string;
  translation_zh?: string;
};

export type StoredSession = {
  id: string;
  scene_id: string;
  level: string;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  ending_at: string;
  recap: { went_well: string[]; try_next: string; keep_sentence: string; revised_from: string } | null;
  corrections_enabled: boolean;
  partner_id: string;
  custom_scene: CustomScene | null;
  title_zh: string;
  folded_until_id: string;
  folded_summary: string;
  messages: StoredMessage[];
};

type StoredPhrase = {
  id: string;
  kind: string;
  text: string;
  gloss_zh: string;
  created_at: string;
  learning_status: string;
  original_text?: string;
  category?: string;
};

const BACKUP_FORMAT = "speak-with-me-backup";
const BACKUP_VERSION = 1;
const practiceListeners = new Set<() => void>();

export function subscribePractice(listener: () => void) {
  practiceListeners.add(listener);
  return () => {
    practiceListeners.delete(listener);
  };
}

function notifyPractice() {
  practiceListeners.forEach((listener) => listener());
}

function fail(status: number, code: string, message: string): never {
  throw new EngineError(status, code, message);
}

let sessionCache: StoredSession[] | null = null;
const saveTails = new Map<string, Promise<void>>();
const removedSessions = new Set<string>();
const recapJobs = new Map<string, ReturnType<typeof writeRecap>>();

function dropSessionCache() {
  sessionCache = null;
}

function enqueueSave<T>(id: string, job: () => Promise<T>) {
  const previous = saveTails.get(id) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(job);
  saveTails.set(
    id,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
}

function mergeMessages(stored: StoredMessage[], incoming: StoredMessage[]) {
  const incomingById = new Map(incoming.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const merged = stored.map((item) => {
    seen.add(item.id);
    const next = incomingById.get(item.id);
    if (!next) return item;
    return {
      ...item,
      ...next,
      text: next.text || item.text,
      correction: next.correction ?? item.correction,
      correction_status: next.correction_status || item.correction_status,
      correction_ready: Boolean(item.correction_ready || next.correction_ready),
      translation_zh: next.translation_zh || item.translation_zh,
    };
  });
  for (const item of incoming) {
    if (!seen.has(item.id)) merged.push(item);
  }
  return merged;
}

async function sessions() {
  if (sessionCache) return sessionCache;
  const rows = await store.all<StoredSession>("sessions");
  sessionCache = rows.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  return sessionCache;
}

async function saveSession(session: StoredSession, touch = true, releaseEnding = false, replace = false) {
  return enqueueSave(session.id, async () => {
    if (replace) removedSessions.delete(session.id);
    if (removedSessions.has(session.id)) return session;
    const current = await store.get<StoredSession>("sessions", session.id);
    if (!current || replace) {
      if (touch) session.updated_at = nowIso();
      await store.put("sessions", session.id, session);
      dropSessionCache();
      return session;
    }
    const merged: StoredSession = {
      ...current,
      ...session,
      messages: mergeMessages(current.messages || [], session.messages || []),
    };
    if (current.finished_at && !session.finished_at) {
      merged.finished_at = current.finished_at;
      merged.recap = current.recap;
      merged.ending_at = "";
    } else if (!releaseEnding && current.ending_at && !session.ending_at && !session.finished_at) {
      merged.ending_at = current.ending_at;
    }
    if (touch) merged.updated_at = nowIso();
    await store.put("sessions", session.id, merged);
    dropSessionCache();
    return merged;
  });
}

async function requireModel() {
  const settings = await readSettings();
  if (!settings.api_key || !settings.model) fail(428, "missing_api_key", "先在设置里填上 API key。");
  return settings;
}

function publicMessage(message: StoredMessage) {
  return {
    id: message.id,
    role: message.role,
    text: message.text,
    assisted: message.assisted,
    correction: message.correction,
    correction_status: message.correction_status || "",
    ...(message.translation_zh ? { translation_zh: message.translation_zh } : {}),
  };
}

function publicSession(session: StoredSession, pinned = false) {
  return {
    id: session.id,
    level: session.level,
    scene: publicScene(session),
    messages: session.messages.map(publicMessage),
    finished_at: session.finished_at,
    recap: session.recap,
    corrections_enabled: session.corrections_enabled,
    partner_id: session.partner_id || "",
    pinned,
    ending: Boolean(session.ending_at) && !session.finished_at,
  };
}

async function getSession(id: string) {
  const session = await store.get<StoredSession>("sessions", id);
  if (!session) fail(404, "session_not_found", "这场对话不在记录里。");
  session.messages = session.messages || [];
  session.ending_at = session.ending_at || "";
  session.partner_id = session.partner_id || partnerIdFor(session);
  session.title_zh = session.title_zh || "";
  session.folded_until_id = session.folded_until_id || "";
  session.folded_summary = session.folded_summary || "";
  return session;
}

function sceneOf(session: StoredSession) {
  const scene = sceneFor(session);
  if (!scene) fail(500, "scene_missing", "这场对话的场景丢了。");
  return scene;
}

type HomePin = {
  id: string;
  kind: "builtin" | "custom";
  title_zh: string;
  description_zh: string;
  partner_id: string;
  partner_name: string;
  partner_role_zh: string;
  scene?: CustomScene;
};

function partnerIdFor(session: { partner_id?: string; scene_id: string; custom_scene: CustomScene | null }) {
  if (session.partner_id) return session.partner_id;
  const scene = sceneFor(session);
  if (scene?.partner_id) return scene.partner_id;
  return PARTNERS.find((partner) => partner.name === scene?.partner_name)?.id || "";
}

function defaultPins(): HomePin[] {
  return SCENES.map((scene) => ({
    id: scene.id,
    kind: "builtin",
    title_zh: scene.title_zh,
    description_zh: scene.description_zh,
    partner_id: scene.partner_id,
    partner_name: scene.partner_name,
    partner_role_zh: scene.partner_role_zh,
  }));
}

async function readPins() {
  const stored = await store.get<HomePin[]>("meta", "home_pins");
  if (!Array.isArray(stored)) return defaultPins();
  return stored.filter((pin) => pin && pin.id && pin.title_zh && (pin.kind === "builtin" || pin.scene));
}

async function writePins(pins: HomePin[]) {
  await store.put("meta", "home_pins", pins);
  notifyPractice();
}

async function readPartners() {
  const saved = await store.get<Record<string, string>>("meta", "partners");
  return PARTNERS.map((partner) => {
    const text = saved?.[partner.id];
    const personality_zh = typeof text === "string" && text.trim() ? text.trim().slice(0, 80) : partner.personality_zh;
    return { ...partner, personality_zh };
  });
}

function publicPartner(partner: PartnerSpec) {
  return { id: partner.id, name: partner.name, personality_zh: partner.personality_zh };
}

function publicPin(pin: HomePin) {
  return {
    id: pin.id,
    kind: pin.kind,
    title_zh: pin.title_zh,
    description_zh: pin.description_zh,
    partner_id: pin.partner_id,
    partner_name: pin.partner_name,
    partner_role_zh: pin.partner_role_zh,
  };
}

async function partnerOf(session: StoredSession) {
  const partners = await readPartners();
  return partners.find((partner) => partner.id === session.partner_id) || null;
}

async function sessionPinned(session: StoredSession) {
  if (!session.custom_scene) return false;
  const pins = await readPins();
  return pins.some((pin) => pin.kind === "custom" && pin.title_zh === session.custom_scene?.title_zh && pin.scene?.opening === session.custom_scene.opening);
}

function pinFromScene(scene: CustomScene, partner: PartnerSpec): HomePin {
  return {
    id: `pin_${newId()}`,
    kind: "custom",
    title_zh: scene.title_zh,
    description_zh: scene.description_zh,
    partner_id: partner.id,
    partner_name: partner.name,
    partner_role_zh: scene.partner_role_zh,
    scene,
  };
}

async function fold(settings: StoredSettings, session: StoredSession) {
  const messages = session.messages;
  if (messages.length <= CHAT_RECENT_MESSAGES) return { recent: messages, covered: "" };
  const recent = messages.slice(-CHAT_RECENT_MESSAGES);
  const prefix = messages.slice(0, -CHAT_RECENT_MESSAGES);
  let start = 0;
  if (session.folded_until_id) {
    const found = prefix.findIndex((message) => message.id === session.folded_until_id);
    if (found >= 0) start = found + 1;
  }
  const pending = prefix.slice(start);
  let summary = (session.folded_summary || "").trim();
  if (pending.length) {
    const pendingChars = pending.reduce((sum, message) => sum + (message.text || "").length, 0);
    if (pending.length >= 4 || pendingChars >= 1200) {
      summary = await summarizeFold(settings, summary, pending);
      session.folded_summary = summary;
      session.folded_until_id = prefix[prefix.length - 1].id;
    } else {
      summary = localCovered(pending, summary);
    }
  }
  return { recent, covered: summary };
}

async function summarizeFold(settings: StoredSettings, previous: string, pending: StoredMessage[]) {
  try {
    const raw = await complete(settings.base_url, settings.api_key, settings.model, {
      system: foldSystem(),
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            already: previous,
            turns: pending.map((message) => ({ role: message.role, text: message.text })),
          }),
        },
      ],
      task: "fold",
      json: false,
    });
    let text = cleanReply(raw);
    if (text.length > 900) text = text.slice(0, 900).replace(/\s+\S*$/, "").trim();
    if (text && !mostlyChinese(text)) return text;
  } catch {
    /* local summary below */
  }
  return localCovered(pending, previous);
}

function localCovered(pending: StoredMessage[], previous: string) {
  const parts = [];
  if (previous.trim()) parts.push(previous.trim());
  for (const message of pending) {
    let bit = (message.text || "").replace(/\s+/g, " ").trim();
    if (!bit) continue;
    if (bit.length > 180) bit = `${bit.slice(0, 177)}...`;
    parts.push(`${message.role === "user" ? "Learner" : "Partner"}: ${bit}`);
  }
  let text = parts.join(" ").trim();
  if (text.length > 900) text = text.slice(-900);
  return text;
}

async function partnerReply(settings: StoredSettings, session: StoredSession) {
  const scene = sceneOf(session);
  const level = getLevel(session.level);
  if (!level) fail(500, "level_missing", "这场对话的水平丢了。");
  const folded = await fold(settings, session);
  const partner = await partnerOf(session);
  let system = chatSystem(scene, level, partner);
  if (folded.covered) {
    system = `${system}\nAlready talked about: ${folded.covered}\nContinue from the latest lines. Do not restart the scene.`;
  }
  let raw = "";
  try {
    raw = await complete(settings.base_url, settings.api_key, settings.model, {
      system,
      messages: folded.recent.map((message) => ({ role: message.role, content: message.text })),
      task: "chat",
      json: false,
    });
  } catch (error) {
    if (error instanceof EngineError && error.code === "llm_truncated") fail(502, error.code, error.message);
    fail(502, "llm_unavailable", "聊天暂时没有接上，再试一次。");
  }
  return ensurePartnerEnglish(raw, scene.clarify_en, level.max_sentences);
}

function message(role: string, text: string, extra: Partial<StoredMessage> = {}): StoredMessage {
  return {
    id: newId(),
    role,
    text,
    assisted: false,
    correction: null,
    correction_ready: role !== "user",
    correction_status: "",
    created_at: nowIso(),
    ...extra,
  };
}

async function writeRecap(sessionId: string) {
  const settings = await requireModel();
  const session = await getSession(sessionId);
  if (session.finished_at && session.recap) return session.recap;
  if (!session.messages.some((item) => item.role === "user")) fail(422, "empty_session", "还没开口，这场不用小结。");
  session.ending_at = session.ending_at || nowIso();
  await saveSession(session);
  notifyPractice();
  const folded = await fold(settings, session);
  let visible = session.messages;
  if (folded.covered && session.folded_until_id) {
    const index = session.messages.findIndex((item) => item.id === session.folded_until_id);
    if (index >= 0) visible = session.messages.slice(index + 1);
  }
  let data: Record<string, unknown> = {};
  try {
    data = await completeJson(
      settings.base_url,
      settings.api_key,
      settings.model,
      recapSystem(),
      [
        {
          role: "user",
          content: JSON.stringify({
            scene_id: session.scene_id,
            level: session.level,
            already_talked_about: folded.covered,
              turns: visible.map((item) => ({
                role: item.role,
                text: item.text,
                assisted: item.assisted,
                ...(item.correction?.suggestion ? { revised: item.correction.suggestion } : {}),
              })),
          }),
        },
      ],
      "recap",
    );
  } catch (error) {
    const failed = await getSession(sessionId);
    failed.ending_at = "";
    await saveSession(failed, true, true);
    notifyPractice();
    const message = error instanceof EngineError ? error.message : "小结暂时没有生成，再试一次。";
    fail(502, error instanceof EngineError ? error.code : "llm_unavailable", message);
  }
  const went = Array.isArray(data.went_well) ? data.went_well.map((item) => String(item).trim()).filter(Boolean).slice(0, 3) : [];
  const finished = await getSession(sessionId);
  finished.recap = {
    went_well: went.length ? went : ["这场对话接上了。"],
    try_next: String(data.try_next || "").trim() || "下一场继续用短句把事情说完。",
    keep_sentence: String(data.keep_sentence || "").trim(),
    revised_from: String(data.revised_from || "").trim(),
  };
  finished.finished_at = nowIso();
  finished.ending_at = "";
  await saveSession(finished);
  notifyPractice();
  return finished.recap;
}

export const localApi = {
  async catalog() {
    return {
      levels: [
        { id: "A1", label_zh: "A1", hint_zh: "刚开口" },
        { id: "A2", label_zh: "A2", hint_zh: "能说短句" },
        { id: "B1", label_zh: "B1", hint_zh: "能把事情讲完" },
      ],
      scenes: ["coffee_shop", "running_late", "weekend"].map((id) => publicScene({ scene_id: id, title_zh: "", custom_scene: null })),
      partners: (await readPartners()).map(publicPartner),
    };
  },

  async places() {
    const pins = await readPins();
    const pinnedIds = new Set(pins.filter((pin) => pin.kind === "builtin").map((pin) => pin.id));
    const shelf = defaultPins().filter((pin) => !pinnedIds.has(pin.id));
    return { pins: pins.map(publicPin), shelf: shelf.map(publicPin) };
  },

  async savePartner(partnerId: string, personalityZh: string) {
    const partner = getPartner(partnerId);
    if (!partner) fail(404, "partner_not_found", "没有这个对话人。");
    const text = personalityZh.trim();
    if (!text) fail(422, "empty_personality", "先写一句这个人是什么样的。");
    if (text.length > 80) fail(422, "personality_too_long", "性格写短一点，80 字以内。");
    const saved = (await store.get<Record<string, string>>("meta", "partners")) || {};
    saved[partnerId] = text;
    await store.put("meta", "partners", saved);
    return publicPartner({ ...partner, personality_zh: text });
  },

  async removePlace(placeId: string) {
    const pins = await readPins();
    const next = pins.filter((pin) => pin.id !== placeId);
    if (next.length === pins.length) fail(404, "place_not_found", "首页没有这场。");
    await writePins(next);
    return { ok: true };
  },

  async restorePlace(sceneId: string) {
    const scene = SCENES.find((item) => item.id === sceneId);
    if (!scene) fail(404, "scene_not_found", "没有这个场景。");
    const pins = await readPins();
    if (pins.some((pin) => pin.id === scene.id)) return { ok: true };
    pins.push({
      id: scene.id,
      kind: "builtin",
      title_zh: scene.title_zh,
      description_zh: scene.description_zh,
      partner_id: scene.partner_id,
      partner_name: scene.partner_name,
      partner_role_zh: scene.partner_role_zh,
    });
    await writePins(pins);
    return { ok: true };
  },

  async pinSession(sessionId: string) {
    const session = await getSession(sessionId);
    if (!session.custom_scene) fail(422, "not_custom", "固定场景用首页的放回就行。");
    if (await sessionPinned(session)) return { ok: true };
    const partners = await readPartners();
    const partner = partners.find((item) => item.id === session.partner_id) || partners[0];
    const pins = await readPins();
    pins.push(pinFromScene(session.custom_scene, partner));
    await writePins(pins);
    return { ok: true };
  },

  async profile() {
    const rows = await sessions();
    const spoke = (session: StoredSession) => session.messages.some((item) => item.role === "user");
    const spoken = rows.filter(spoke);
    const listed = rows.filter((session) => spoke(session) || session.custom_scene);
    return buildProfile(spoken, listed);
  },

  async settings() {
    return publicSettings(await readSettings());
  },

  async saveSettings(input: { provider: string; baseUrl: string; model: string; apiKey: string; clearApiKey: boolean }) {
    const current = await readSettings();
    const provider = knownProvider(input.provider || current.provider);
    const preset = PRESETS.find((item) => item.id === provider)!;
    const keys = { ...current.keys };
    const models = { ...current.models };
    const bases = { ...current.bases };
    const catalog = { ...current.model_catalog };
    let key = "";
    if (input.clearApiKey) {
      delete keys[provider];
    } else if (input.apiKey.trim()) {
      key = cleanKey(input.apiKey);
      keys[provider] = key;
    } else {
      key = keys[provider] || "";
    }
    const base = preset.custom_url ? cleanBaseUrl(input.baseUrl || bases[provider] || "") : preset.base_url;
    if (preset.custom_url) bases[provider] = base;
    let model = "";
    if (input.clearApiKey) {
      model = models[provider] || "";
    } else {
      const listed = catalog[provider] || [];
      model = input.model.trim() || models[provider] || "";
      if (!listed.includes(model)) fail(422, "model_not_listed", "先读取这个地址上的模型，再从列表里选一个。");
      models[provider] = model;
    }
    if (!key && !(input.clearApiKey && current.keys[provider])) fail(422, "missing_api_key", "先填上这个来源的 API key。");
    const next = await writeSettings({
      provider,
      base_url: base,
      model,
      api_key: key,
      keys,
      models,
      bases,
      model_catalog: catalog,
    });
    return publicSettings(next);
  },

  async listModels(input: { provider: string; baseUrl: string; apiKey: string }) {
    const current = await readSettings();
    const provider = knownProvider(input.provider || current.provider);
    const preset = PRESETS.find((item) => item.id === provider)!;
    const keys = { ...current.keys };
    const bases = { ...current.bases };
    const models = { ...current.models };
    const key = input.apiKey.trim() ? cleanKey(input.apiKey) : keys[provider] || "";
    if (!key) fail(422, "missing_api_key", "先填上这个来源的 API key。");
    keys[provider] = key;
    const base = preset.custom_url ? cleanBaseUrl(input.baseUrl || bases[provider] || "") : preset.base_url;
    if (preset.custom_url) bases[provider] = base;
    const ids = await fetchModels(base, key);
    const catalog = { ...current.model_catalog, [provider]: ids };
    if (!ids.includes(models[provider] || "")) delete models[provider];
    const next = await writeSettings({ ...current, keys, bases, models, model_catalog: catalog });
    return publicSettings(next);
  },

  async testSettings(input: { provider: string; baseUrl: string; model: string; apiKey: string; clearApiKey: boolean }) {
    const current = await readSettings();
    const provider = knownProvider(input.provider || current.provider);
    const preset = PRESETS.find((item) => item.id === provider)!;
    const key = input.clearApiKey ? "" : input.apiKey.trim() ? cleanKey(input.apiKey) : current.keys[provider] || "";
    if (!key) fail(422, "missing_api_key", "先填上这个来源的 API key。");
    const base = preset.custom_url ? cleanBaseUrl(input.baseUrl || current.bases[provider] || "") : preset.base_url;
    const listed = current.model_catalog[provider] || [];
    const model = input.model.trim() || current.models[provider] || "";
    if (!listed.includes(model)) fail(422, "model_not_listed", "先读取这个地址上的模型，再从列表里选一个。");
    let response: Response;
    try {
      response = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 8, temperature: 0, messages: [{ role: "user", content: "Reply with ok" }] }),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      fail(502, "provider_unreachable", "连不上这个接口。检查地址能不能打开。");
    }
    if (response.status === 401 || response.status === 403) fail(401, "rejected_key", "密钥没有被接受。");
    if (!response.ok) fail(502, "provider_rejected", "接口没有接受这次试连。检查模型和密钥。");
    return { ok: true, message: "连上了，可以保存。" };
  },

  async createSession(input: {
    sceneId?: string;
    level: string;
    situationZh?: string;
    correctionsEnabled?: boolean;
    partnerId?: string;
    pinId?: string;
    pin?: boolean;
    random?: boolean;
  }) {
    const settings = await requireModel();
    const partners = await readPartners();
    let levelId = input.level;
    let corrections = input.correctionsEnabled !== false;
    let custom: CustomScene | null = null;
    let sceneId = input.sceneId || "";
    let partner = partners.find((item) => item.id === input.partnerId) || partners[0];
    if (input.random) {
      levelId = "B1";
      corrections = true;
      partner = partners[Math.floor(Math.random() * partners.length)] || partners[0];
      const avoid = (await sessions())
        .slice(0, 8)
        .map((item) => item.custom_scene?.title_zh || item.title_zh)
        .filter(Boolean);
      custom = await buildRandomScene(settings, partner, avoid);
      sceneId = "custom";
    } else if (input.pinId) {
      const pin = (await readPins()).find((item) => item.id === input.pinId);
      if (!pin) fail(404, "place_not_found", "首页没有这场。");
      partner = partners.find((item) => item.id === pin.partner_id) || partner;
      if (pin.kind === "custom" && pin.scene) {
        custom = { ...pin.scene, partner_name: partner.name };
        sceneId = "custom";
      } else {
        sceneId = pin.id;
      }
    } else if ((input.situationZh || "").trim()) {
      const situation = (input.situationZh || "").trim();
      if (situation.length > 200) fail(422, "situation_too_long", "短一点，说清这场在什么处境就好。");
      custom = await buildScene(settings, situation, levelId, partner);
      sceneId = "custom";
    }
    const level = getLevel(levelId);
    if (!level) fail(422, "invalid_level", "水平只能是目录里列出的等级。");
    const scene = sceneFor({ scene_id: sceneId, custom_scene: custom });
    if (!scene) fail(404, "scene_not_found", "没有这个场景。");
    if (!custom) partner = partners.find((item) => item.id === scene.partner_id) || partner;
    const session: StoredSession = {
      id: newId(),
      scene_id: sceneId,
      level: levelId,
      created_at: nowIso(),
      updated_at: nowIso(),
      finished_at: null,
      ending_at: "",
      recap: null,
      corrections_enabled: corrections,
      partner_id: partner.id,
      custom_scene: custom,
      title_zh: "",
      folded_until_id: "",
      folded_summary: "",
      messages: [message("assistant", scene.opening, { correction_ready: true })],
    };
    await saveSession(session, false);
    let pinned = false;
    if (input.pin && custom) {
      const pins = await readPins();
      pins.push(pinFromScene(custom, partner));
      await writePins(pins);
      pinned = true;
    }
    return publicSession(session, pinned);
  },

  async session(sessionId: string) {
    const session = await getSession(sessionId);
    return publicSession(session, await sessionPinned(session));
  },

  async renameSession(sessionId: string, titleZh: string) {
    const session = await getSession(sessionId);
    const title = titleZh.trim();
    if (!title) fail(422, "empty_title", "先写一个名字。");
    if (title.length > 40) fail(422, "title_too_long", "名字不要超过 40 个字。");
    session.title_zh = title;
    await saveSession(session);
    return publicSession(session);
  },

  async deleteSession(sessionId: string) {
    await enqueueSave(sessionId, async () => {
      const existing = await store.get("sessions", sessionId);
      if (!existing) fail(404, "session_not_found", "这场对话不在记录里。");
      removedSessions.add(sessionId);
      await store.remove("sessions", sessionId);
      dropSessionCache();
    });
    return { ok: true };
  },

  async sendMessage(sessionId: string, text: string, assisted: boolean) {
    const settings = await requireModel();
    const session = await getSession(sessionId);
    if (session.finished_at || session.ending_at) fail(409, "session_closed", "这场正在写小结，先等它写完。");
    const cleaned = (text || "").trim();
    if (!cleaned) fail(422, "empty_message", "先写一句再发送。");
    if (cleaned.length > MAX_MESSAGE_CHARS) fail(422, "message_too_long", "这句话太长了，缩短一点。");
    const user = message("user", cleaned, {
      assisted,
      correction_ready: assisted || !session.corrections_enabled,
      created_at: nowIso(),
    });
    session.messages = [...session.messages, user];
    await saveSession(session);
    const reply = await partnerReply(settings, session);
    const assistant = message("assistant", reply, { correction_ready: true });
    session.messages = [...session.messages, assistant];
    await saveSession(session);
    return { user_message: publicMessage(user), assistant_message: publicMessage(assistant) };
  },

  async correct(sessionId: string, messageId: string) {
    const settings = await requireModel();
    const session = await getSession(sessionId);
    const current = session.messages.find((item) => item.id === messageId);
    if (!current) fail(404, "message_not_found", "找不到这句。");
    if (current.role !== "user") fail(400, "not_user_message", "只指正你说的话。");
    if (!session.corrections_enabled) {
      current.correction_ready = true;
      await saveSession(session);
      return { message_id: messageId, correction: null, correction_status: "" };
    }
    if (current.correction_ready && current.correction_status !== "failed") {
      return {
        message_id: messageId,
        correction: current.correction,
        correction_status: current.correction_status || (current.correction ? "corrected" : ""),
      };
    }
    const level = getLevel(session.level);
    if (!level) fail(500, "level_missing", "这场对话的水平丢了。");
    try {
      const data = await completeJson(
        settings.base_url,
        settings.api_key,
        settings.model,
        correctionSystem(),
        [
          {
            role: "user",
            content: JSON.stringify({
              level: session.level,
              utterance: current.text,
              assisted: current.assisted,
              partner_last: [...session.messages].reverse().find((item) => item.id !== current.id && item.role === "assistant")?.text || "",
            }),
          },
        ],
        "correction",
      );
      const correction = coerceCorrection(data, current.text);
      current.correction = correction;
      current.correction_ready = true;
      current.correction_status = correction ? "corrected" : "clear";
    } catch {
      current.correction = null;
      current.correction_ready = false;
      current.correction_status = "failed";
      await saveSession(session);
      fail(502, "llm_unavailable", "这句指正没有看完，模型调用失败。");
    }
    await saveSession(session);
    return { message_id: messageId, correction: current.correction, correction_status: current.correction_status };
  },

  async coach(sessionId: string, intentZh: string, variant = 0) {
    const settings = await requireModel();
    const session = await getSession(sessionId);
    const scene = sceneOf(session);
    const level = getLevel(session.level);
    if (!level) fail(500, "scene_missing", "这场对话的场景丢了。");
    const intent = (intentZh || "").trim();
    if (!intent) fail(422, "empty_intent", "先用中文写下你想说的意思。");
    if (intent.length > MAX_INTENT_CHARS) fail(422, "intent_too_long", "短一点就好，说清你想表达的意思。");
    const partnerLast = [...session.messages].reverse().find((item) => item.role === "assistant")?.text || "";
    let data: Record<string, unknown> = {};
    try {
      data = await completeJson(
        settings.base_url,
        settings.api_key,
        settings.model,
        coachSystem(scene, level, await partnerOf(session)),
        [{ role: "user", content: JSON.stringify({ scene_id: scene.id, level: session.level, partner_last: partnerLast, intent_zh: intent, variant }) }],
        "coach",
      );
    } catch (error) {
      if (error instanceof EngineError && error.code === "llm_unavailable") fail(502, "llm_unavailable", "这句话暂时没组织好，再试一次。");
      data = {};
    }
    const sentence = String(data.sentence || "").trim();
    if (!sentence) fail(502, "coach_empty", "没有得到能说的句子，再试一次。");
    return {
      sentence,
      simpler: String(data.simpler || "").trim() || sentence,
      gloss_zh: String(data.gloss_zh || "").trim() || "用这句接上对话。",
    };
  },

  async recap(sessionId: string) {
    const running = recapJobs.get(sessionId);
    if (running) return running;
    const job = writeRecap(sessionId);
    recapJobs.set(sessionId, job);
    try {
      return await job;
    } finally {
      if (recapJobs.get(sessionId) === job) recapJobs.delete(sessionId);
    }
  },

  async translate(sessionId: string, messageId: string) {
    const session = await getSession(sessionId);
    const current = session.messages.find((item) => item.id === messageId);
    if (!current) fail(404, "message_not_found", "找不到这句。");
    if (current.translation_zh) return current.translation_zh;
    const settings = await requireModel();
    const line = current.text.trim();
    if (!line) fail(422, "empty_text", "没有可以翻译的句子。");
    if (line.length > MAX_MESSAGE_CHARS) fail(422, "text_too_long", "这句太长了。");
    let raw = "";
    try {
      raw = await complete(settings.base_url, settings.api_key, settings.model, {
        system: "Translate the English sentence into natural spoken Chinese. Return only the Chinese translation.",
        messages: [{ role: "user", content: line }],
        task: "translate",
        json: false,
      });
    } catch (error) {
      if (error instanceof EngineError) throw error;
      fail(502, "llm_unavailable", "这句没有译出来。");
    }
    const chinese = cleanReply(raw).replace(/^译文[:：]\s*/, "");
    if (!mostlyChinese(chinese)) fail(502, "bad_translation", "这句没有译出来。");
    current.translation_zh = chinese;
    await saveSession(session);
    return chinese;
  },

  async gloss(text: string) {
    const cleaned = (text || "").trim();
    if (!cleaned) fail(422, "empty_text", "先点一个英语词，或留下一句。");
    if (cleaned.length > 160) fail(422, "text_too_long", "短一点，一个词或一句就好。");
    const found = await lookupGloss(cleaned);
    if (!found) fail(404, "word_not_found", "词典里没有这个词。");
    return found;
  },

  async phrases() {
    const rows = await store.all<StoredPhrase>("phrases");
    return rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  },

  async savePhrase(text: string, glossZh: string, kind: string, mark?: { original?: string; category?: string }) {
    const cleaned = text.trim();
    const gloss = glossZh.trim();
    if (!cleaned || !gloss || (kind !== "word" && kind !== "sentence")) fail(422, "invalid_phrase", "要留下的句子不完整。");
    const original = (mark?.original || "").trim();
    const category = (mark?.category || "").trim();
    const marked = Boolean(original && original !== cleaned);
    const existing = (await store.all<StoredPhrase>("phrases")).find(
      (phrase) => phrase.kind === kind && phrase.text.toLowerCase() === cleaned.toLowerCase(),
    );
    if (existing) {
      if (marked && !existing.original_text) {
        existing.original_text = original;
        existing.category = category;
        existing.gloss_zh = gloss;
        await store.put("phrases", existing.id, existing);
      }
      return existing;
    }
    const phrase: StoredPhrase = {
      id: newId(),
      kind,
      text: cleaned,
      gloss_zh: gloss,
      created_at: nowIso(),
      learning_status: "learning",
      ...(marked ? { original_text: original, category } : {}),
    };
    await store.put("phrases", phrase.id, phrase);
    return phrase;
  },

  async deletePhrase(phraseId: string) {
    const existing = await store.get("phrases", phraseId);
    if (!existing) fail(404, "phrase_not_found", "笔记本里没有这一条。");
    await store.remove("phrases", phraseId);
    return { ok: true };
  },

  async setPhraseStatus(phraseId: string, learningStatus: string) {
    if (learningStatus !== "learning" && learningStatus !== "mastered") fail(422, "invalid_phrase_status", "只能标成正在学或已学会。");
    const phrase = await store.get<StoredPhrase>("phrases", phraseId);
    if (!phrase) fail(404, "phrase_not_found", "笔记本里没有这一条。");
    phrase.learning_status = learningStatus;
    await store.put("phrases", phrase.id, phrase);
    return phrase;
  },

  async forkSession(sessionId: string, throughMessageId = "") {
    const settings = await requireModel();
    const source = await getSession(sessionId);
    if (!source.messages.length) fail(422, "empty_session", "这场还没有可以接着说的句子。");
    let chosen = source.messages;
    if (throughMessageId.trim()) {
      const index = source.messages.findIndex((item) => item.id === throughMessageId);
      if (index < 0) fail(404, "message_not_found", "这场里没有这句。");
      chosen = source.messages.slice(0, index + 1);
    } else {
      const opening = source.messages.find((item) => item.role === "assistant");
      if (!opening) fail(422, "empty_session", "这场还没有可以接着说的句子。");
      chosen = [opening];
    }
    const copied = chosen.map((item) => message(item.role, item.text, { assisted: item.assisted, correction_ready: item.role !== "user" }));
    const session: StoredSession = {
      ...source,
      id: newId(),
      created_at: nowIso(),
      updated_at: nowIso(),
      finished_at: null,
      ending_at: "",
      recap: null,
      folded_until_id: "",
      folded_summary: "",
      messages: copied,
    };
    if (copied[copied.length - 1].role === "user") {
      const reply = await partnerReply(settings, session);
      session.messages = [...session.messages, message("assistant", reply, { correction_ready: true })];
    }
    await saveSession(session, false);
    return publicSession(session);
  },

  async exportBackup() {
    const settings = await readSettings();
    const speech = await readSpeech();
    const hasSettings = Boolean(await store.get("meta", "llm"));
    const body = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exported_at: nowIso(),
      sessions: await sessions(),
      phrases: await store.all<StoredPhrase>("phrases"),
      settings: hasSettings ? settings : null,
      speech: speech.key ? speech : null,
      partners: await store.get<Record<string, string>>("meta", "partners"),
      home_pins: await store.get<HomePin[]>("meta", "home_pins"),
    };
    return new Blob([JSON.stringify(body)], { type: "application/json" });
  },

  async importBackup(payload: unknown) {
    if (!payload || typeof payload !== "object" || (payload as { format?: string }).format !== BACKUP_FORMAT) {
      fail(422, "bad_backup", "这不是一份练习备份。");
    }
    const body = payload as {
      version?: number;
      sessions?: unknown;
      phrases?: unknown;
      settings?: unknown;
      speech?: unknown;
      partners?: unknown;
      home_pins?: unknown;
    };
    if (body.version !== BACKUP_VERSION) fail(422, "bad_backup", "这份备份的版本读不了。");
    if (!Array.isArray(body.sessions) || !Array.isArray(body.phrases)) fail(422, "bad_backup", "这份备份里有读不了的内容。");
    if (body.settings != null && (typeof body.settings !== "object" || Array.isArray(body.settings))) {
      fail(422, "bad_backup", "这份备份里有读不了的内容。");
    }
    for (const item of body.sessions) {
      const session = item as StoredSession;
      if (!session?.id) fail(422, "bad_backup", "这份备份里有读不了的内容。");
      await saveSession(session, false, false, true);
    }
    for (const item of body.phrases) {
      const phrase = item as StoredPhrase;
      if (!phrase?.id) fail(422, "bad_backup", "这份备份里有读不了的内容。");
      await store.put("phrases", phrase.id, phrase);
    }
    if (body.settings) await writeSettings(body.settings as StoredSettings);
    if (body.speech && typeof body.speech === "object" && !Array.isArray(body.speech)) {
      await writeSpeech(body.speech as SpeechSettings);
    }
    if (body.partners && typeof body.partners === "object" && !Array.isArray(body.partners)) {
      await store.put("meta", "partners", body.partners);
    }
    if (Array.isArray(body.home_pins)) await store.put("meta", "home_pins", body.home_pins);
    return { sessions: body.sessions.length, phrases: body.phrases.length, settings: Boolean(body.settings) };
  },
};

function knownProvider(provider: string) {
  if (!provider || provider === "openai_compatible" || provider === "mock" || provider === "unconfigured") return "openai";
  return PRESETS.some((preset) => preset.id === provider) ? provider : "openai";
}

async function fetchModels(base: string, key: string) {
  let response: Response;
  try {
    response = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    fail(502, "provider_unreachable", "连不上这个地址，读不到模型。");
  }
  if (response.status === 401 || response.status === 403) fail(401, "rejected_key", "密钥没有被接受。");
  if (!response.ok) fail(502, "provider_rejected", "这个地址没有返回模型列表。");
  let payload: { data?: unknown };
  try {
    payload = await response.json();
  } catch {
    fail(502, "provider_rejected", "这个地址没有返回模型列表。");
  }
  const data = Array.isArray(payload.data) ? payload.data : [];
  const ids = new Set<string>();
  for (const item of data) {
    if (typeof item === "string" && item.trim()) ids.add(item.trim());
    else if (item && typeof item === "object" && "id" in item && String((item as { id: unknown }).id || "").trim()) {
      ids.add(String((item as { id: unknown }).id).trim());
    }
  }
  const listed = [...ids].sort();
  if (!listed.length) fail(502, "no_models", "这个地址没有返回可用的模型。");
  return listed;
}

function sceneFromModel(data: Record<string, unknown>, partner: PartnerSpec, fallback: string): CustomScene {
  return {
    title_zh: String(data.title_zh || "").trim() || "自己的一场",
    description_zh: String(data.description_zh || "").trim() || fallback,
    partner_name: partner.name,
    partner_role_zh: String(data.partner_role_zh || "").trim() || "对方",
    partner_role_en: String(data.partner_role_en || "").trim() || "the other person in this situation",
    goal_zh: String(data.goal_zh || "").trim() || "把这件事说清楚。",
    goal_en: String(data.goal_en || "").trim() || "Help the learner explain the situation in simple English.",
    opening: String(data.opening || "").trim() || "Hi. What happened?",
    clarify_en: String(data.clarify_en || "").trim() || "Sorry, could you say that more simply?",
    rescue_en: String(data.rescue_en || "").trim() || "Could you help me, please?",
  };
}

async function buildScene(settings: StoredSettings, situation: string, levelId: string, partner: PartnerSpec): Promise<CustomScene> {
  let data: Record<string, unknown> = {};
  try {
    data = await completeJson(
      settings.base_url,
      settings.api_key,
      settings.model,
      sceneSystem(),
      [
        {
          role: "user",
          content: JSON.stringify({
            situation_zh: situation,
            level: levelId,
            partner_name: partner.name,
            personality_zh: partner.personality_zh,
            personality_en: partner.personality_en,
          }),
        },
      ],
      "scene",
    );
  } catch (error) {
    if (error instanceof EngineError) fail(502, error.code, "这场场景暂时没有准备好，再试一次。");
    throw error;
  }
  if (!sceneReady(data)) fail(502, "bad_json", "这场场景暂时没有准备好，再试一次。");
  return sceneFromModel(data, partner, situation);
}

async function buildRandomScene(settings: StoredSettings, partner: PartnerSpec, avoid: string[]): Promise<CustomScene> {
  let data: Record<string, unknown> = {};
  try {
    data = await completeJson(
      settings.base_url,
      settings.api_key,
      settings.model,
      randomSceneSystem(),
      [
        {
          role: "user",
          content: JSON.stringify({
            level: "B1",
            partner_name: partner.name,
            personality_zh: partner.personality_zh,
            personality_en: partner.personality_en,
            avoid_titles: avoid,
          }),
        },
      ],
      "scene",
    );
  } catch (error) {
    if (error instanceof EngineError) fail(502, error.code, "随机场景暂时没有准备好，再试一次。");
    throw error;
  }
  if (!sceneReady(data)) fail(502, "bad_json", "随机场景暂时没有准备好，再试一次。");
  return sceneFromModel(data, partner, "随便聊一件生活里的事。");
}

function sceneReady(data: Record<string, unknown>) {
  return Boolean(String(data.title_zh || "").trim() && String(data.partner_role_zh || "").trim() && String(data.opening || "").trim());
}

function coerceCorrection(data: Record<string, unknown>, utterance: string): Correction | null {
  const raw = data.correction;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const suggestion = String(record.suggestion || "").trim();
  if (!suggestion) return null;
  return {
    original_span: utterance.trim() || String(record.original_span || "").trim(),
    suggestion,
    category: String(record.category || "").trim() || "other",
    explanation_zh: String(record.explanation_zh || "").trim() || "这里可以换一种说法。",
  };
}

function buildProfile(practiced: StoredSession[], listed: StoredSession[] = practiced) {
  const corrections = [];
  let userTurns = 0;
  let assistedTurns = 0;
  for (const session of practiced) {
    const scene = publicScene(session);
    for (const message of [...session.messages].reverse()) {
      if (message.role !== "user") continue;
      userTurns += 1;
      if (message.assisted) assistedTurns += 1;
      if (!message.correction) continue;
      corrections.push({
        suggestion: message.correction.suggestion,
        explanation_zh: message.correction.explanation_zh,
        category: message.correction.category,
        label_zh: categoryLabel(message.correction.category),
        scene_title_zh: scene.title_zh,
      });
    }
  }
  const counts = new Map<string, number>();
  for (const item of corrections) counts.set(item.category, (counts.get(item.category) || 0) + 1);
  const focus = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category, count]) => ({ category, label_zh: categoryLabel(category), count }));
  const latest = practiced.find((session) => session.recap);
  const activity = [];
  for (const session of practiced) {
    for (const message of session.messages) {
      if (message.role !== "user") continue;
      activity.push({ at: message.created_at || session.created_at });
    }
  }
  return {
    stats: { sessions: practiced.length, user_turns: userTurns, corrections: corrections.length, assisted_turns: assistedTurns },
    focus,
    recent_corrections: corrections.slice(0, 6),
    latest_feedback: latest?.recap
      ? {
          scene_title_zh: publicScene(latest).title_zh,
          finished_at: latest.finished_at || latest.updated_at,
          went_well: latest.recap.went_well,
          try_next: latest.recap.try_next,
          keep_sentence: latest.recap.keep_sentence,
          revised_from: latest.recap.revised_from,
        }
      : null,
    records: listed.slice(0, 30).map(recordOf),
    activity,
    progress: progressCalendar(practiced),
  };
}

function recordOf(session: StoredSession) {
  const scene = publicScene(session);
  const users = session.messages.filter((message) => message.role === "user");
  let preview = users.length ? users[users.length - 1].text : [...session.messages].reverse().find((message) => message.role === "assistant")?.text || "";
  if (preview.length > 80) preview = `${preview.slice(0, 80)}…`;
  const score = scoreSession(session);
  return {
    id: session.id,
    scene_title_zh: scene.title_zh,
    partner_name: scene.partner_name,
    level: session.level,
    created_at: session.created_at,
    finished_at: session.finished_at,
    ending: Boolean(session.ending_at) && !session.finished_at,
    user_turns: users.length,
    correction_count: users.filter((message) => message.correction).length,
    assisted_turns: users.filter((message) => message.assisted).length,
    try_next: session.recap?.try_next ?? null,
    preview,
    score: { total: score.total, dimensions: score.dimensions },
  };
}
