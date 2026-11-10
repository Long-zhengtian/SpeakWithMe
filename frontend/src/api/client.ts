import { localApi, subscribePractice } from "../engine/practice";
import { EngineError } from "../engine/text";
import { store } from "../engine/store";
import type {
  Catalog,
  ChatMessage,
  CoachLine,
  Correction,
  Gloss,
  LlmSettings,
  Partner,
  Phrase,
  Places,
  Profile,
  Recap,
  Session,
} from "../types";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let migration: Promise<void> | null = null;

function migrateOnce() {
  migration ??= (async () => {
    const done = await store.get<boolean>("meta", "migrated");
    if (done) return;
    const existing = await store.all("sessions");
    if (!existing.length) {
      try {
        const response = await fetch("/api/v1/backup", { signal: AbortSignal.timeout(1500) });
        if (response.ok) {
          const body = await response.json();
          if (body && body.format === "speak-with-me-backup") await localApi.importBackup(body);
        }
      } catch {
        /* The previous Python service is not running. The app keeps its own copy. */
      }
    }
    await store.put("meta", "migrated", true);
  })();
  return migration;
}

async function call<T>(run: () => Promise<T>) {
  await migrateOnce();
  try {
    return await run();
  } catch (error) {
    if (error instanceof EngineError || error instanceof ApiError) {
      throw new ApiError(error.status, error.code, error.message);
    }
    throw new ApiError(500, "request_failed", "请求没有成功。");
  }
}

export { subscribePractice };

export const api = {
  catalog: () => call(() => localApi.catalog() as Promise<Catalog>),
  places: () => call(() => localApi.places() as Promise<Places>),
  savePartner: (partnerId: string, personalityZh: string) => call(() => localApi.savePartner(partnerId, personalityZh) as Promise<Partner>),
  removePlace: (placeId: string) => call(() => localApi.removePlace(placeId)),
  restorePlace: (sceneId: string) => call(() => localApi.restorePlace(sceneId)),
  pinSession: (sessionId: string) => call(() => localApi.pinSession(sessionId)),
  profile: () => call(() => localApi.profile() as Promise<Profile>),
  settings: () => call(() => localApi.settings() as Promise<LlmSettings>),
  saveSettings: (input: { provider: string; baseUrl: string; model: string; apiKey: string; clearApiKey: boolean }) =>
    call(() => localApi.saveSettings(input) as Promise<LlmSettings>),
  listModels: (input: { provider: string; baseUrl: string; apiKey: string }) =>
    call(() => localApi.listModels(input) as Promise<LlmSettings>),
  testSettings: (input: { provider: string; baseUrl: string; model: string; apiKey: string; clearApiKey: boolean }) =>
    call(() => localApi.testSettings(input)),
  forkSession: (sessionId: string, throughMessageId = "") => call(() => localApi.forkSession(sessionId, throughMessageId) as Promise<Session>),
  session: (sessionId: string) => call(() => localApi.session(sessionId) as Promise<Session>),
  renameSession: (sessionId: string, titleZh: string) => call(() => localApi.renameSession(sessionId, titleZh) as Promise<Session>),
  deleteSession: (sessionId: string) => call(() => localApi.deleteSession(sessionId)),
  createSession: (input: {
    sceneId?: string;
    level: string;
    situationZh?: string;
    correctionsEnabled?: boolean;
    partnerId?: string;
    pinId?: string;
    pin?: boolean;
    random?: boolean;
  }) => call(() => localApi.createSession(input) as Promise<Session>),
  gloss: (text: string) => call(() => localApi.gloss(text) as Promise<Gloss>),
  translate: (sessionId: string, messageId: string) => call(() => localApi.translate(sessionId, messageId) as Promise<string>),
  phrases: () => call(() => localApi.phrases() as Promise<Phrase[]>),
  savePhrase: (text: string, glossZh: string, kind: "word" | "sentence", mark?: { original: string; category: string }) =>
    call(() => localApi.savePhrase(text, glossZh, kind, mark) as Promise<Phrase>),
  deletePhrase: (phraseId: string) => call(() => localApi.deletePhrase(phraseId)),
  exportBackup: () => call(() => localApi.exportBackup()),
  importBackup: (payload: unknown) => call(() => localApi.importBackup(payload)),
  setPhraseStatus: (phraseId: string, learningStatus: "learning" | "mastered") =>
    call(() => localApi.setPhraseStatus(phraseId, learningStatus) as Promise<Phrase>),
  sendMessage: (sessionId: string, text: string, assisted: boolean) =>
    call(
      () =>
        localApi.sendMessage(sessionId, text, assisted) as Promise<{
          user_message: ChatMessage;
          assistant_message: ChatMessage;
        }>,
    ),
  correct: (sessionId: string, messageId: string) =>
    call(
      () =>
        localApi.correct(sessionId, messageId) as Promise<{
          message_id: string;
          correction: Correction | null;
          correction_status: string;
        }>,
    ),
  coach: (sessionId: string, intentZh: string, variant = 0) => call(() => localApi.coach(sessionId, intentZh, variant) as Promise<CoachLine>),
  recap: (sessionId: string) => call(() => localApi.recap(sessionId) as Promise<Recap>),
  speech: {
    transcribe(_file: Blob) {
      return Promise.resolve(new Response(JSON.stringify({ detail: { message: "语音识别用的是这台设备自己的。" } }), { status: 501 }));
    },
    synthesize(_text: string, _voice = "partner") {
      return Promise.resolve(new Response(JSON.stringify({ detail: { message: "朗读用的是这台设备自己的。" } }), { status: 501 }));
    },
  },
};
