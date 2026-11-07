import type {
  Catalog,
  ChatMessage,
  CoachLine,
  Correction,
  Gloss,
  LlmSettings,
  Phrase,
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError(0, "offline", "没有连上服务。先在 backend 目录启动 API。");
  }
  if (!response.ok) {
    let code = "request_failed";
    let message = "请求没有成功。";
    try {
      const body = await response.json();
      const detail = body.detail;
      if (detail && typeof detail === "object" && !Array.isArray(detail)) {
        code = detail.code ?? code;
        message = detail.message ?? message;
      } else if (typeof detail === "string") {
        message = detail;
      } else if (Array.isArray(detail)) {
        message = "有一项内容没填对。";
      }
    } catch {
      message = response.statusText || message;
    }
    throw new ApiError(response.status, code, message);
  }
  return response.json() as Promise<T>;
}

export const api = {
  catalog() {
    return request<Catalog>("/api/v1/catalog");
  },
  profile() {
    return request<Profile>("/api/v1/profile");
  },
  settings() {
    return request<LlmSettings>("/api/v1/settings");
  },
  saveSettings(input: {
    provider: string;
    baseUrl: string;
    model: string;
    apiKey: string;
    clearApiKey: boolean;
  }) {
    return request<LlmSettings>("/api/v1/settings", {
      method: "PUT",
      body: JSON.stringify({
        provider: input.provider,
        base_url: input.baseUrl,
        model: input.model,
        api_key: input.apiKey,
        clear_api_key: input.clearApiKey,
      }),
    });
  },
  listModels(input: { provider: string; baseUrl: string; apiKey: string }) {
    return request<LlmSettings>("/api/v1/settings/models", {
      method: "POST",
      body: JSON.stringify({
        provider: input.provider,
        base_url: input.baseUrl,
        api_key: input.apiKey,
      }),
    });
  },
  testSettings(input: {
    provider: string;
    baseUrl: string;
    model: string;
    apiKey: string;
    clearApiKey: boolean;
  }) {
    return request<{ ok: boolean; message: string }>("/api/v1/settings/test", {
      method: "POST",
      body: JSON.stringify({
        provider: input.provider,
        base_url: input.baseUrl,
        model: input.model,
        api_key: input.apiKey,
        clear_api_key: input.clearApiKey,
      }),
    });
  },
  session(sessionId: string) {
    return request<Session>(`/api/v1/sessions/${sessionId}`);
  },
  createSession(input: { sceneId?: string; level: string; situationZh?: string; correctionsEnabled?: boolean }) {
    return request<Session>("/api/v1/sessions", {
      method: "POST",
      body: JSON.stringify({
        scene_id: input.sceneId ?? "",
        level: input.level,
        situation_zh: input.situationZh ?? "",
        corrections_enabled: input.correctionsEnabled ?? true,
      }),
    });
  },
  gloss(text: string) {
    return request<Gloss>("/api/v1/glossary", {
      method: "POST",
      body: JSON.stringify({ text }),
    });
  },
  phrases() {
    return request<Phrase[]>("/api/v1/phrases");
  },
  savePhrase(text: string, glossZh: string, kind: "word" | "sentence") {
    return request<Phrase>("/api/v1/phrases", {
      method: "POST",
      body: JSON.stringify({ text, gloss_zh: glossZh, kind }),
    });
  },
  deletePhrase(phraseId: string) {
    return request<{ ok: boolean }>(`/api/v1/phrases/${phraseId}`, { method: "DELETE" });
  },
  sendMessage(sessionId: string, text: string, assisted: boolean) {
    return request<{ user_message: ChatMessage; assistant_message: ChatMessage }>(
      `/api/v1/sessions/${sessionId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ text, assisted }),
      },
    );
  },
  correct(sessionId: string, messageId: string) {
    return request<{ message_id: string; correction: Correction | null }>(
      `/api/v1/sessions/${sessionId}/messages/${messageId}/correction`,
      { method: "POST" },
    );
  },
  coach(sessionId: string, intentZh: string, variant = 0) {
    return request<CoachLine>(`/api/v1/sessions/${sessionId}/coach`, {
      method: "POST",
      body: JSON.stringify({ intent_zh: intentZh, variant }),
    });
  },
  recap(sessionId: string) {
    return request<Recap>(`/api/v1/sessions/${sessionId}/recap`, { method: "POST" });
  },
  // Server speech slots. Playback in v1 uses the browser voice until a provider is registered.
  speech: {
    transcribe(file: Blob) {
      const body = new FormData();
      body.append("file", file, "speech.webm");
      return fetch("/api/v1/speech/transcribe", { method: "POST", body });
    },
    synthesize(text: string, voice = "partner") {
      return fetch("/api/v1/speech/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice }),
      });
    },
  },
};
