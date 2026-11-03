/**
 * Moving a floating card (the tutorial's cards) by its header.
 *
 * Until the user drags it the card goes wherever its owner places it; after that it
 * stays where it was put, kept wholly inside the window. Presses on the header's own
 * controls (close, checkbox) are left alone.
 */
import { useCallback, useState, type PointerEvent as ReactPointerEvent } from "react";

export type CardPosition = { left: number; top: number };

const MARGIN = 4;

export function clampToWindow(
  position: CardPosition,
  size: { width: number; height: number },
  view: { width: number; height: number },
): CardPosition {
  return {
    left: Math.round(Math.max(MARGIN, Math.min(view.width - size.width - MARGIN, position.left))),
    top: Math.round(Math.max(MARGIN, Math.min(view.height - size.height - MARGIN, position.top))),
  };
}

export function useDragCard() {
  const [position, setPosition] = useState<CardPosition | null>(null);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if ((event.target as Element).closest("button, input, label, a, select, textarea")) return;
    const card = (event.currentTarget as HTMLElement).closest<HTMLElement>("[data-drag-card]");
    if (!card) return;
    event.preventDefault();
    const start = card.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const move = (moving: PointerEvent) => {
      setPosition(clampToWindow(
        { left: start.left + moving.clientX - startX, top: start.top + moving.clientY - startY },
        { width: start.width, height: start.height },
        { width: window.innerWidth, height: window.innerHeight },
      ));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }, []);

  return { position, setPosition, onPointerDown };
}
