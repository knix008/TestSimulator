/**
 * The draggable divider between a side panel and the merge.
 *
 * It writes the new width into the settings, so a panel keeps the width it was given
 * across restarts. The drag is tracked with pointer capture rather than window-level
 * listeners, which is what keeps it working when the pointer crosses into the panes
 * (or leaves the window entirely) mid-drag.
 *
 * Double-clicking puts both panels back to the same width, which is how they start.
 */
import { useRef } from "react";
import {
  DEFAULT_LOG_HEIGHT,
  DEFAULT_PANEL_WIDTH,
  MAX_LOG_HEIGHT,
  MAX_PANEL_WIDTH,
  MIN_LOG_HEIGHT,
  MIN_PANEL_WIDTH,
} from "../core/settings.js";
import { useApp } from "./state.js";

export function Splitter({ side }: { side: "left" | "right" | "bottom" }) {
  const app = useApp();
  const dragging = useRef<{ start: number; from: number } | null>(null);
  const horizontal = side === "bottom";

  const size = side === "left"
    ? app.settings.leftPanelWidth
    : side === "right"
      ? app.settings.rightPanelWidth
      : app.settings.logPanelHeight;

  const apply = (next: number) => {
    if (horizontal) {
      const clamped = Math.round(Math.min(MAX_LOG_HEIGHT, Math.max(MIN_LOG_HEIGHT, next)));
      void app.updateSettings({ logPanelHeight: clamped });
      return;
    }
    const clamped = Math.round(Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, next)));
    void app.updateSettings(side === "left" ? { leftPanelWidth: clamped } : { rightPanelWidth: clamped });
  };

  return (
    <div
      className={`splitter${horizontal ? " horizontal" : ""}`}
      role="separator"
      aria-orientation={horizontal ? "horizontal" : "vertical"}
      aria-label={app.t("tip.splitter")}
      title={app.t("tip.splitter")}
      data-splitter={side}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragging.current = { start: horizontal ? event.clientY : event.clientX, from: size };
      }}
      onPointerMove={(event) => {
        const drag = dragging.current;
        if (!drag) return;
        // The left panel grows as the pointer moves right; the right panel and the
        // log, which are anchored to the far edge, grow as it moves the other way.
        const delta = (horizontal ? event.clientY : event.clientX) - drag.start;
        apply(drag.from + (side === "left" ? delta : -delta));
      }}
      onPointerUp={(event) => {
        dragging.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onDoubleClick={() => {
        void app.updateSettings(horizontal
          ? { logPanelHeight: DEFAULT_LOG_HEIGHT }
          : { leftPanelWidth: DEFAULT_PANEL_WIDTH, rightPanelWidth: DEFAULT_PANEL_WIDTH });
      }}
    />
  );
}
