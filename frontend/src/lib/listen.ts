import { openSpeech, speechFailure } from "./azure";
import { speechError, speechStatus } from "./speechNotice";

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
  return startListener("en-US", handlers);
}

export function startChineseListener(handlers: {
  onText: (text: string) => void;
  onError: (message: string) => void;
  onEnd: (text: string) => void;
}): EnglishListener | null {
  return startListener("zh-CN", handlers);
}

function startListener(
  language: "en-US" | "zh-CN",
  handlers: {
    onText: (text: string) => void;
    onError: (message: string) => void;
    onEnd: (text: string) => void;
  },
): EnglishListener | null {
  if (!canListen()) return null;
  let closed = false;
  let released = false;
  let stopRecognizer: (() => void) | null = null;
  const pieces: string[] = [];
  let partial = "";

  const finish = (text: string) => {
    if (closed) return;
    closed = true;
    speechStatus(null);
    handlers.onEnd(text.replace(/\s+/g, " ").trim());
  };

  const fail = (message: string) => {
    if (closed) return;
    closed = true;
    speechStatus(null);
    speechError(message);
    handlers.onError(message);
    handlers.onEnd("");
  };

  void (async () => {
    try {
      const { sdk, config } = await openSpeech();
      config.speechRecognitionLanguage = language;
      const recognizer = new sdk.SpeechRecognizer(config, sdk.AudioConfig.fromDefaultMicrophoneInput());
      recognizer.recognizing = (_sender, event) => {
        partial = event.result.text || "";
        handlers.onText(join(pieces, partial));
      };
      recognizer.recognized = (_sender, event) => {
        if (event.result.reason !== sdk.ResultReason.RecognizedSpeech || !event.result.text) return;
        pieces.push(event.result.text);
        partial = "";
        handlers.onText(join(pieces, ""));
      };
      recognizer.canceled = (_sender, event) => {
        if (event.reason === sdk.CancellationReason.Error) fail(listenMessage(event.errorDetails));
      };
      speechStatus("正在听…");
      await new Promise<void>((resolve, reject) => {
        recognizer.startContinuousRecognitionAsync(resolve, (error) => reject(new Error(String(error))));
      });
      let stopping = false;
      stopRecognizer = () => {
        if (stopping) return;
        stopping = true;
        recognizer.stopContinuousRecognitionAsync(
          () => {
            recognizer.close();
            finish(join(pieces, partial));
          },
          () => {
            recognizer.close();
            finish(join(pieces, partial));
          },
        );
      };
      if (released) stopRecognizer();
    } catch (error) {
      fail(listenMessage(error instanceof Error ? error.message : ""));
    }
  })();

  return {
    stop() {
      released = true;
      stopRecognizer?.();
    },
  };
}

function join(pieces: string[], partial: string) {
  return [...pieces, partial].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function listenMessage(details: string) {
  if (/permission|not allowed|denied|microphone/i.test(details)) return "麦克风没有打开。允许之后再按住说。";
  if (/no match|nomatch/i.test(details)) return "这次没有听清，再按住说一次。";
  return speechFailure(details, "听写");
}
