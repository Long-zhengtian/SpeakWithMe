type RecognitionResult = {
  0: { transcript: string };
};

type RecognitionEvent = {
  results: ArrayLike<RecognitionResult>;
};

type RecognitionErrorEvent = {
  error: string;
};

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type RecognitionCtor = new () => Recognition;

type SpeechWindow = Window & {
  SpeechRecognition?: RecognitionCtor;
  webkitSpeechRecognition?: RecognitionCtor;
};

export type EnglishListener = {
  stop: () => void;
};

function recognitionCtor() {
  if (typeof window === "undefined") return null;
  const host = window as SpeechWindow;
  return host.SpeechRecognition || host.webkitSpeechRecognition || null;
}

export function canListen() {
  return recognitionCtor() !== null;
}

function errorMessage(code: string) {
  if (code === "not-allowed" || code === "service-not-allowed") {
    return "麦克风没有打开。允许之后再按住说。";
  }
  if (code === "audio-capture") return "没有找到麦克风。";
  if (code === "network") return "语音识别暂时连不上，可以先打字。";
  return "这次没有听清，再按住说一次。";
}

export function startEnglishListener(handlers: {
  onText: (text: string) => void;
  onError: (message: string) => void;
  onEnd: (text: string) => void;
}): EnglishListener | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = true;
  let latest = "";
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    handlers.onEnd(latest.trim());
  };
  recognition.onresult = (event) => {
    let text = "";
    for (let index = 0; index < event.results.length; index += 1) {
      text += event.results[index][0].transcript;
    }
    latest = text.replace(/\s+/g, " ").trim();
    handlers.onText(latest);
  };
  recognition.onerror = (event) => {
    if (event.error === "aborted" || event.error === "no-speech") return;
    handlers.onError(errorMessage(event.error));
  };
  recognition.onend = finish;
  try {
    recognition.start();
  } catch {
    handlers.onError("这次没有听清，再按住说一次。");
    return null;
  }
  return {
    stop() {
      const giveUp = window.setTimeout(() => {
        try {
          recognition.abort();
        } catch {
          finish();
        }
      }, 700);
      recognition.onend = () => {
        window.clearTimeout(giveUp);
        finish();
      };
      try {
        recognition.stop();
      } catch {
        window.clearTimeout(giveUp);
        finish();
      }
    },
  };
}
