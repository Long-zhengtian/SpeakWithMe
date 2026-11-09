type Notice = { kind: "status" | "error"; text: string | null };

const notices = new Set<(notice: Notice) => void>();

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
