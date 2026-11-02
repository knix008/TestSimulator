/**
 * The resize grip in the bottom-right corner.
 *
 * A frameless window keeps a native resize border, but it is a few pixels wide and
 * invisible — there is nothing at the corner to tell you the window can be resized at
 * all. This draws the corner, and does the resizing itself rather than relying on
 * that hairline: the pointer is captured on the way down, so the drag survives the
 * pointer leaving the window, and each move sets the window size outright instead of
 * accumulating deltas that would drift.
 *
 * Desktop only — a browser tab has no window of its own to resize.
 */
import { useRef } from "react";
import * as host from "./host.js";
import { useApp } from "./state.js";

export function ResizeGrip() {
  const app = useApp();
  const start = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  if (!host.isDesktop()) return null;

  return (
    <span
      className="resize-grip"
      role="separator"
      aria-label={app.t("tip.resize")}
      title={app.t("tip.resize")}
      data-testid="resize-grip"
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = {
          x: event.screenX,
          y: event.screenY,
          width: window.outerWidth,
          height: window.outerHeight,
        };
      }}
      onPointerMove={(event) => {
        const from = start.current;
        if (!from) return;
        host.resizeWindowTo(
          from.width + (event.screenX - from.x),
          from.height + (event.screenY - from.y),
        );
      }}
      onPointerUp={(event) => {
        start.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
        <path
          d="M13 5 5 13M13 9 9 13M13 1 1 13"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </span>
  );
}
