import { useEffect, useRef } from "react";

export function useOverlay(active: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const id = `overlay-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const previous = window.history.state as { speak?: unknown } | null;
    window.history.pushState({ speak: previous?.speak, overlay: id }, "");
    const onPop = () => onCloseRef.current();
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      const state = window.history.state as { overlay?: string } | null;
      if (state?.overlay === id) window.history.back();
    };
  }, [active]);
}

export function closeOverlay() {
  const state = window.history.state as { overlay?: string } | null;
  if (state?.overlay) {
    window.history.back();
    return true;
  }
  return false;
}
