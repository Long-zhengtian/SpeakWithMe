import { Children, type ReactNode } from "react";
import { Avatar } from "./Avatar";
import { HearButton } from "./HearButton";
import { WordText } from "./WordText";
import type { ChatMessage } from "./types";

type MessageBubbleProps = {
  message: ChatMessage;
  partnerName: string;
  onWord: (word: string) => void;
  children?: ReactNode;
};

export function MessageBubble({ message, partnerName, onWord, children }: MessageBubbleProps) {
  const mine = message.role === "user";
  const extra = Children.toArray(children);
  return (
    <article className={`bubble ${mine ? "user" : "partner"}`}>
      <Avatar name={mine ? "你" : partnerName} mine={mine} />
      <div className="utterance">
        {message.assisted ? <em data-testid="assisted-tag">借助</em> : null}
        <WordText text={message.text} onWord={onWord} />
      </div>
      <HearButton text={message.text} speakKey={message.id} partnerName={mine ? undefined : partnerName} />
      {extra.length ? <div className="bubble-extra">{extra}</div> : null}
    </article>
  );
}
