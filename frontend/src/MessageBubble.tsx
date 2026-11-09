import { Children, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
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

export function MessageBubble({ message, partnerName, onWord, children }: MessageBubbleProps) {
  const mine = message.role === "user";
  const extra = Children.toArray(children);
  const utteranceRef = useRef<HTMLDivElement | null>(null);
  const pressTimer = useRef<number | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef<((event: Event) => void) | null>(null);
  const [menu, setMenu] = useState<{ top: number; left: number; below: boolean } | null>(null);
  const [open, setOpen] = useState(false);
  const [chinese, setChinese] = useState("");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    return () => {
      if (suppressClick.current) window.removeEventListener("click", suppressClick.current, true);
    };
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".translate-menu")) return;
      setMenu(null);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  function clearPress() {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
    pressStart.current = null;
  }

  function armSuppressClick() {
    if (suppressClick.current) window.removeEventListener("click", suppressClick.current, true);
    const stopWordClick = (event: Event) => {
      if (suppressClick.current) window.removeEventListener("click", suppressClick.current, true);
      suppressClick.current = null;
      const target = event.target;
      if (target instanceof Element && target.closest(".translate-dismiss")) return;
      if (target instanceof Node && utteranceRef.current?.contains(target)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    suppressClick.current = stopWordClick;
    window.addEventListener("click", stopWordClick, true);
  }

  function showMenu() {
    if (open) return;
    const rect = utteranceRef.current?.getBoundingClientRect();
    if (!rect) return;
    const below = rect.top < 56;
    setMenu({ top: below ? rect.bottom + 6 : rect.top - 6, left: rect.left, below });
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (mine || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    pressStart.current = { x: event.clientX, y: event.clientY };
    pressTimer.current = window.setTimeout(() => {
      armSuppressClick();
      showMenu();
    }, 450);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = pressStart.current;
    if (!start) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) clearPress();
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
      <Avatar name={mine ? "你" : partnerName} mine={mine} />
      <div
        className="utterance"
        ref={utteranceRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={clearPress}
        onPointerCancel={clearPress}
        onContextMenu={(event) => {
          if (mine) return;
          event.preventDefault();
          showMenu();
        }}
      >
        {message.assisted ? <em data-testid="assisted-tag">借助</em> : null}
        <WordText text={message.text} onWord={onWord} />
      </div>
      <HearButton text={message.text} speakKey={message.id} partnerName={mine ? undefined : partnerName} />
      {mine || !open ? null : (
        <div className="translate-line">
          <p className={failed ? "translate-failed" : "translate-text"}>{loading ? "在译…" : chinese}</p>
          <button type="button" className="translate-dismiss" onPointerDown={(event) => event.stopPropagation()} onClick={() => setOpen(false)}>
            收起
          </button>
        </div>
      )}
      {menu ? (
        <button
          type="button"
          className="translate-menu"
          style={{ top: menu.top, left: menu.left, transform: menu.below ? undefined : "translateY(-100%)" }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => void translate()}
        >
          翻译
        </button>
      ) : null}
      {extra.length ? <div className="bubble-extra">{extra}</div> : null}
    </article>
  );
}
