import { recordMicrophone } from "./mic";
import { loadTranscriber, speechError, speechStatus } from "./models";

export type EnglishListener = {
  stop: () => void;
};

export function canListen() {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

export function startEnglishListener(handlers: {
  onText: (text: string) => void;
  onError: (message: string) => void;
  onEnd: (text: string) => void;
}): EnglishListener | null {
  return startListener("english", handlers);
}

export function startChineseListener(handlers: {
  onText: (text: string) => void;
  onError: (message: string) => void;
  onEnd: (text: string) => void;
}): EnglishListener | null {
  return startListener("chinese", handlers);
}

function startListener(
  language: "english" | "chinese",
  handlers: {
    onText: (text: string) => void;
    onError: (message: string) => void;
    onEnd: (text: string) => void;
  },
): EnglishListener | null {
  if (!canListen()) return null;
  let closed = false;
  const pending = recordMicrophone();
  const model = loadTranscriber();
  speechStatus("正在听…");

  const fail = (error: unknown) => {
    if (closed) return;
    closed = true;
    const message = micMessage(error);
    speechStatus(null);
    speechError(message);
    handlers.onError(message);
    handlers.onEnd("");
  };

  pending.catch((error) => fail(error));

  const finish = async () => {
    if (closed) return;
    try {
      const recording = await pending;
      if (closed) {
        await recording.stop();
        return;
      }
      closed = true;
      const samples = await recording.stop();
      if (samples.length < 1600) {
        speechStatus(null);
        handlers.onEnd("");
        return;
      }
      speechStatus("正在转写…");
      const transcriber = await model;
      const result = await transcriber(samples, { language, task: "transcribe", chunk_length_s: 30 });
      const text = readTranscript(result).replace(/\s+/g, " ").trim();
      speechStatus(null);
      if (text) handlers.onText(text);
      handlers.onEnd(text);
    } catch (error) {
      closed = false;
      fail(error);
    }
  };

  return {
    stop() {
      void finish();
    },
  };
}

function readTranscript(result: { text?: string } | Array<{ text?: string }>) {
  if (Array.isArray(result)) return result.map((item) => item.text ?? "").join(" ");
  return result.text ?? "";
}

function micMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  const text = error instanceof Error ? error.message : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || /permission|not allowed/i.test(text)) {
    return "麦克风没有打开。允许之后再按住说。";
  }
  if (name === "NotFoundError" || name === "NotReadableError") return "没有找到麦克风。";
  if (/fetch|network|failed to load|not found locally|onnx/i.test(text)) return "听写没有准备好，可以先打字。";
  return "这次没有听清，再按住说一次。";
}
