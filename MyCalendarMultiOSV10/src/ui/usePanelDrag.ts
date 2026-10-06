import { useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { isTauri, startWindowDrag } from "../platform/desktop";

/** Pixels a press on a button must travel before it turns into a window drag. */
export const DRAG_THRESHOLD = 4;

const NO_DRAG = "input, select, textarea, a, .resize, .resize-grip, .sheet-back, .day-menu";

function onScrollbar(target: Element, event: ReactMouseEvent): boolean {
  if (!(target instanceof HTMLElement) || target.scrollHeight <= target.clientHeight) return false;
  const box = target.getBoundingClientRect();
  return event.clientX >= box.left + target.clientLeft + target.clientWidth;
}

function swallowNextClick() {
  const swallow = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  window.addEventListener("click", swallow, { capture: true, once: true });
  // The desktop drag can end outside the webview without any click, so the guard must not linger.
  window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 400);
}

export function usePanelDrag() {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const offsetRef = useRef(offset);
  offsetRef.current = offset;

  const onMouseDown = (event: ReactMouseEvent) => {
    if (event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest(NO_DRAG) || onScrollbar(target, event)) return;
    const onControl = target.closest("button") !== null;
    const desktop = isTauri();

    if (desktop && !onControl) {
      event.preventDefault();
      void startWindowDrag();
      return;
    }

    const startX = event.clientX;
    const startY = event.clientY;
    const origin = offsetRef.current;
    let dragging = !onControl;
    const stop = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
    };
    const move = (next: MouseEvent) => {
      const dx = next.clientX - startX;
      const dy = next.clientY - startY;
      if (!dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        dragging = true;
        swallowNextClick();
        if (desktop) {
          stop();
          void startWindowDrag();
          return;
        }
      }
      next.preventDefault();
      setOffset({ x: origin.x + dx, y: origin.y + dy });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
  };

  return { offset, setOffset, onMouseDown };
}
