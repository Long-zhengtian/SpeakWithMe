export function bindHold(element: HTMLElement, handlers: { start: () => void; end: () => void }) {
  let holding = false;
  let mouseId: number | null = null;

  const begin = () => {
    if (holding || element.hasAttribute("disabled")) return;
    holding = true;
    handlers.start();
  };

  const finish = () => {
    if (!holding) return;
    holding = false;
    mouseId = null;
    handlers.end();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    event.preventDefault();
    mouseId = event.pointerId;
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      /* 松开时仍会结束。 */
    }
    begin();
  };

  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    if (mouseId !== null && event.pointerId !== mouseId) return;
    finish();
  };

  const onTouchStart = (event: TouchEvent) => {
    if (element.hasAttribute("disabled")) return;
    event.preventDefault();
    begin();
  };

  const onTouchEnd = (event: TouchEvent) => {
    if (event.changedTouches.length === 0) return;
    finish();
  };

  const blockMenu = (event: Event) => event.preventDefault();

  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("pointerup", onPointerUp);
  element.addEventListener("pointercancel", onPointerUp);
  element.addEventListener("contextmenu", blockMenu);
  element.addEventListener("touchstart", onTouchStart, { passive: false });
  element.addEventListener("touchend", onTouchEnd);
  element.addEventListener("touchcancel", onTouchEnd);
  document.addEventListener("touchend", onTouchEnd);
  document.addEventListener("touchcancel", onTouchEnd);
  return () => {
    element.removeEventListener("pointerdown", onPointerDown);
    element.removeEventListener("pointerup", onPointerUp);
    element.removeEventListener("pointercancel", onPointerUp);
    element.removeEventListener("contextmenu", blockMenu);
    element.removeEventListener("touchstart", onTouchStart);
    element.removeEventListener("touchend", onTouchEnd);
    element.removeEventListener("touchcancel", onTouchEnd);
    document.removeEventListener("touchend", onTouchEnd);
    document.removeEventListener("touchcancel", onTouchEnd);
  };
}
