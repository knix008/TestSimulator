import { useCallback, useEffect, useRef } from "react";
import type { SessionSummary } from "./api";

type Props = {
  summary: SessionSummary;
  scrollTop: number;
  total: number;
  viewportHeight: number;
  onJump: (offset: number) => void;
};

/**
 * The diff position strip next to each pane: a minimap of where every difference sits in
 * the document, with the current viewport marked. Click or drag to jump there.
 */
export function OverviewBar({ summary, scrollTop, total, viewportHeight, onJump }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragging = useRef(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;

    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const styles = getComputedStyle(canvas);
    const colors: Record<string, string> = {
      added: styles.getPropertyValue("--added-accent").trim() || "#22c55e",
      removed: styles.getPropertyValue("--removed-accent").trim() || "#ef4444",
      modified: styles.getPropertyValue("--modified-accent").trim() || "#f59e0b",
    };

    context.clearRect(0, 0, width, height);
    context.fillStyle = styles.getPropertyValue("--overview-bg").trim() || "#f8fafc";
    context.fillRect(0, 0, width, height);

    const rowCount = Math.max(1, summary.rowCount);
    const markHeight = Math.max(2, height / rowCount);
    for (const bucket of summary.overview) {
      context.fillStyle = colors[bucket.kind] ?? colors.modified;
      const y = (bucket.row / rowCount) * height;
      context.fillRect(1, Math.min(y, height - markHeight), width - 2, markHeight);
    }

    if (total > 0 && viewportHeight > 0 && viewportHeight < total) {
      const top = (scrollTop / total) * height;
      const size = Math.max(6, (viewportHeight / total) * height);
      context.fillStyle = styles.getPropertyValue("--overview-viewport").trim() || "rgba(100,116,139,0.28)";
      context.fillRect(0, Math.min(top, height - size), width, size);
    }
  }, [summary, scrollTop, total, viewportHeight]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  const jump = (clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientY - bounds.top) / bounds.height, 0), 1);
    onJump(ratio * total - viewportHeight / 2);
  };

  return (
    <canvas
      ref={canvasRef}
      className="overview-bar"
      title={`${summary.added} / ${summary.removed} / ${summary.modified}`}
      onPointerDown={(event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        jump(event.clientY);
      }}
      onPointerMove={(event) => {
        if (dragging.current) jump(event.clientY);
      }}
      onPointerUp={(event) => {
        dragging.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
    />
  );
}
