import { useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction } from "react";
import { clampEventsHeight } from "../domain/settings";
import { isTauri, MIN_WINDOW_WIDTH, resizeWindow } from "../platform/desktop";

interface Offset {
  x: number;
  y: number;
}

interface DragStart {
  x: number;
  y: number;
  width: number;
  eventsHeight: number | null;
  offsetX: number;
}

export function usePanelResize(
  offset: Offset,
  eventsHeight: number,
  commitEventsHeight: (height: number) => void,
  setOffset: Dispatch<SetStateAction<Offset>>,
  minWidth = MIN_WINDOW_WIDTH,
) {
  const [width, setWidth] = useState<number | null>(null);
  const [liveEvents, setLiveEvents] = useState<number | null>(null);
  const start = useRef<DragStart | null>(null);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    // The desktop window is resized by the OS itself, so it follows the pointer without lag.
    if (isTauri()) {
      void resizeWindow("SouthEast");
      return;
    }
    const panel = event.currentTarget.closest(".panel");
    if (!(panel instanceof HTMLElement)) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const events = panel.querySelector("#calendar-events");
    start.current = {
      x: event.clientX,
      y: event.clientY,
      width: panel.getBoundingClientRect().width,
      eventsHeight: events ? events.getBoundingClientRect().height : null,
      offsetX: offset.x,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const origin = start.current;
    if (!origin) return;
    const nextWidth = Math.max(minWidth, Math.round(origin.width + event.clientX - origin.x));
    if (origin.eventsHeight !== null) {
      setLiveEvents(clampEventsHeight(origin.eventsHeight + event.clientY - origin.y));
    }
    setWidth(nextWidth);
    // The web card is centered horizontally, so half of the growth is shifted back to keep the left edge fixed.
    setOffset((current) => ({ x: origin.offsetX + (nextWidth - origin.width) / 2, y: current.y }));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (!start.current) return;
    start.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (liveEvents !== null) commitEventsHeight(liveEvents);
    setLiveEvents(null);
  };

  return {
    width,
    eventsHeight: liveEvents ?? eventsHeight,
    gripProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
