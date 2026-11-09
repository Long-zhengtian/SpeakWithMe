import { useEffect, useState } from "react";
import { canSpeak, speak, subscribeSpeaking } from "./lib/speak";

type HearButtonProps = {
  text: string;
  speakKey: string;
  partnerName?: string;
};

export function HearButton({ text, speakKey, partnerName }: HearButtonProps) {
  const [live, setLive] = useState(false);

  useEffect(() => subscribeSpeaking((key) => setLive(key === speakKey)), [speakKey]);

  if (!canSpeak()) return null;

  return (
    <button
      type="button"
      className={`hear${live ? " live" : ""}`}
      aria-label={live ? "停止" : "听"}
      aria-pressed={live}
      onClick={() => speak(text, speakKey, partnerName)}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="M4 9.5v5h3.2L13 19V5L7.2 9.5H4z" fill="currentColor" />
        <path
          className="wave"
          d="M16 9.2a4.2 4.2 0 0 1 0 5.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          className="wave far"
          d="M18.4 7a7 7 0 0 1 0 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
