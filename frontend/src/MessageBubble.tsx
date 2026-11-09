import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, api } from "./api/client";
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

type MenuPlace = { top: number; left: number; below: boolean };

export function MessageBubble({ message, partnerName, onWord, children }: MessageBubbleProps) {
  const mine = message.role === "user";
  const extra = Children.toArray(children);
  const avatarRef = useRef<HTMLButtonElement | null>(null);
  const [menu, setMenu] = useState<MenuPlace | null>(null);
  const [open, setOpen] = useState(false);
  const [chinese, setChinese] = useState("");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!menu) return;
    const close = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".avatar-menu, .partner-avatar")) return;
      setMenu(null);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  function toggleMenu() {
    if (menu) {
      setMenu(null);
      return;
    }
    const rect = avatarRef.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom > 72;
    setMenu({ top: below ? rect.bottom + 6 : rect.top - 6, left: rect.left, below });
  }

  async function translate() {
    setMenu(null);
    setOpen(true);
    if ((chinese && !failed) || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      setChinese(await api.translate(message.text));
    } catch (error) {
      setFailed(true);
      setChinese(error instanceof ApiError ? error.message : "这句没有译出来。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className={`bubble ${mine ? "user" : "partner"}`}>
      {mine ? (
        <Avatar name="你" mine />
      ) : (
        <button
          type="button"
          ref={avatarRef}
          className="avatar partner-avatar"
          aria-label={`${partnerName}，更多`}
          aria-expanded={menu !== null}
          onClick={toggleMenu}
        >
          <Avatar name={partnerName} />
        </button>
      )}
      <div className="utterance">
        {message.assisted ? <em data-testid="assisted-tag">借助</em> : null}
        <WordText text={message.text} onWord={onWord} />
      </div>
      <HearButton text={message.text} speakKey={message.id} partnerName={mine ? undefined : partnerName} />
      {mine || !open ? null : (
        <div className="translate-line">
          <p className={failed ? "translate-failed" : "translate-text"}>{loading ? "在译…" : chinese}</p>
          <button type="button" className="translate-dismiss" onClick={() => setOpen(false)}>
            收起
          </button>
        </div>
      )}
      {menu ? (
        <div
          className="avatar-menu"
          style={{ top: menu.top, left: menu.left, transform: menu.below ? undefined : "translateY(-100%)" }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={() => void translate()}>
            翻译
          </button>
        </div>
      ) : null}
      {extra.length ? <div className="bubble-extra">{extra}</div> : null}
    </article>
  );
}
