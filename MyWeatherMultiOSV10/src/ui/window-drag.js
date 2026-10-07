const INTERACTIVE = "button, a, input, select, textarea, .resize-grip, .menu-item";

export function attachWindowDrag(root, onStep) {
  if (!root) return () => {};
  const onDown = (event) => {
    if (event.button != null && event.button !== 0) return;
    if (event.target?.closest?.(INTERACTIVE)) return;
    const start = { x: event.screenX ?? event.clientX ?? 0, y: event.screenY ?? event.clientY ?? 0 };
    let started = false;
    const move = (next) => {
      const dx = Math.round((next.screenX ?? next.clientX ?? 0) - start.x);
      const dy = Math.round((next.screenY ?? next.clientY ?? 0) - start.y);
      if (!started) {
        if (Math.hypot(dx, dy) < 4) return;
        started = true;
        void onStep({ phase: "start" });
      }
      void onStep({ phase: "move", dx, dy });
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
      if (started) void onStep({ phase: "end" });
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
  };
  root.addEventListener("pointerdown", onDown);
  return () => root.removeEventListener("pointerdown", onDown);
}
