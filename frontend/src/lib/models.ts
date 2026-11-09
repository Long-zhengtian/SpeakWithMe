type Progress = {
  status?: string;
  file?: string;
  name?: string;
  progress?: number;
};

type Transcriber = (
  audio: Float32Array,
  options: { language: string; task: string; chunk_length_s: number },
) => Promise<{ text?: string } | Array<{ text?: string }>>;

type KokoroVoice = {
  generate: (
    text: string,
    options?: { voice?: "af_heart"; speed?: number },
  ) => Promise<{ audio: Float32Array; sampling_rate: number }>;
};

type Notice = { kind: "status" | "error"; text: string | null };

const notices = new Set<(notice: Notice) => void>();
let runtimeReady: Promise<void> | null = null;
let transcriberPromise: Promise<Transcriber> | null = null;
let kokoroPromise: Promise<KokoroVoice> | null = null;

const VOICE_URL = "voices/af_heart.bin";

export function subscribeSpeechNotice(listener: (notice: Notice) => void) {
  notices.add(listener);
  return () => {
    notices.delete(listener);
  };
}

export function speechStatus(text: string | null) {
  notices.forEach((listener) => listener({ kind: "status", text }));
}

export function speechError(text: string) {
  notices.forEach((listener) => listener({ kind: "error", text }));
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function prepareRuntime() {
  if (!runtimeReady) {
    runtimeReady = (async () => {
      const { env } = await import("@huggingface/transformers");
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      env.useBrowserCache = false;
      env.localModelPath = new URL("models/", document.baseURI).href;
      const wasm = env.backends.onnx.wasm;
      if (wasm) {
        wasm.numThreads = 1;
        wasm.wasmPaths = new URL("onnx/", document.baseURI).href;
      }
      const host = window as Window & { __speechFetchPatched?: boolean };
      if (!host.__speechFetchPatched) {
        host.__speechFetchPatched = true;
        const nativeFetch = window.fetch.bind(window);
        const voiceUrl = new URL(VOICE_URL, document.baseURI).href;
        window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
          const url = requestUrl(input);
          if (url.includes("/voices/af_heart.bin")) return nativeFetch(voiceUrl, init);
          return nativeFetch(input, init);
        };
      }
    })().catch((error) => {
      runtimeReady = null;
      throw error;
    });
  }
  return runtimeReady;
}

function progressText(info: Progress) {
  if (!info.status || info.status === "ready" || info.status === "done") return null;
  const file = `${info.file ?? ""} ${info.name ?? ""}`.toLowerCase();
  const kind = file.includes("kokoro") || file.includes("voice") ? "朗读" : "听写";
  return `正在准备${kind}…`;
}

function watchProgress(info: Progress) {
  const text = progressText(info);
  if (text) speechStatus(text);
}

export function loadTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      await prepareRuntime();
      const { pipeline } = await import("@huggingface/transformers");
      const transcriber = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny", {
        dtype: "q8",
        device: "wasm",
        progress_callback: watchProgress,
      });
      return transcriber as Transcriber;
    })().catch((error) => {
      transcriberPromise = null;
      throw error;
    });
  }
  return transcriberPromise;
}

export function loadKokoro() {
  if (!kokoroPromise) {
    kokoroPromise = (async () => {
      await prepareRuntime();
      const { KokoroTTS } = await import("kokoro-js");
      return KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
        dtype: "q8",
        device: "wasm",
        progress_callback: watchProgress,
      });
    })().catch((error) => {
      kokoroPromise = null;
      throw error;
    });
  }
  return kokoroPromise;
}
