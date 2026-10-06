/**
 * The vertical scrollbar beside a comparison pane.
 *
 * It is the scrollbar *and* the map: the whole document is squeezed into the strip,
 * every difference painted in its own colour, with the viewport drawn over it as a
 * thumb you can drag. A native scrollbar cannot show where the changes are, and an
 * overview that is not also the scrollbar means two narrow strips doing one job.
 *
 * One sits on each side of the comparison, which is where the eye already is when it
 * reaches the end of a pane.
 */
import { useCallback, useEffect, useRef } from "react";

const PRIORITY: Record<string, number> = { s: 0, a: 2, r: 2, m: 3 };

export function DiffScrollBar({
  kinds,
  cursor,
  side,
  viewport,
  onSeek,
}: {
  /** One character per row: s(ame) a(dded) r(emoved) m(odified). */
  kinds: string;
  cursor: number;
  side: "left" | "right";
  /** Which rows are on screen, as a fraction of the document. */
  viewport: { start: number; count: number };
  onSeek: (row: number, options?: { centre?: boolean }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const track = trackRef.current;
    if (!canvas || !track) return;

    const box = track.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(10, Math.round(box.width));
    const height = Math.max(10, Math.round(box.height));
    if (canvas.width !== Math.round(width * ratio)) canvas.width = Math.round(width * ratio);
    if (canvas.height !== Math.round(height * ratio)) canvas.height = Math.round(height * ratio);

    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const style = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
    const colors: Record<string, string> = {
      a: read("--added-accent", "#22c55e"),
      r: read("--removed-accent", "#ef4444"),
      m: read("--modified-accent", "#f59e0b"),
    };

    context.clearRect(0, 0, width, height);
    const total = kinds.length || 1;

    // One pass per pixel row, taking the most interesting kind it covers: a single
    // changed line in a long file must not disappear into a run of unchanged ones.
    // Drawn at less than full strength, and inset from both edges, so that in a
    // short file — where one block can be half the bar — the strip still reads as a
    // scrollbar with marks on it rather than as a slab of colour.
    context.globalAlpha = 0.65;
    for (let y = 0; y < height; y++) {
      const from = Math.floor((y / height) * total);
      const to = Math.max(from + 1, Math.floor(((y + 1) / height) * total));
      let best = "s";
      for (let index = from; index < to && index < total; index++) {
        const kind = kinds[index];
        if ((PRIORITY[kind] ?? 0) > (PRIORITY[best] ?? 0)) best = kind;
      }
      if (best === "s") continue;
      context.fillStyle = colors[best] ?? "#999";
      context.fillRect(4, y, width - 8, 1);
    }
    context.globalAlpha = 1;

    // The cursor, drawn last so a dense run cannot hide it.
    const markerY = Math.round((cursor / total) * height);
    context.fillStyle = read("--text", "#000");
    context.globalAlpha = 0.75;
    context.fillRect(0, Math.max(0, markerY - 1), width, 2);
    context.globalAlpha = 1;
  }, [cursor, kinds]);

  useEffect(() => {
    draw();
    const track = trackRef.current;
    if (!track) return;
    const observer = new ResizeObserver(draw);
    observer.observe(track);
    return () => observer.disconnect();
  }, [draw]);

  const seek = (clientY: number, centre: boolean) => {
    const track = trackRef.current;
    if (!track) return;
    const box = track.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (clientY - box.top) / box.height));
    onSeek(Math.floor(fraction * Math.max(1, kinds.length)), { centre });
  };

  const total = Math.max(1, kinds.length);
  const thumbTop = `${(Math.min(viewport.start, total) / total) * 100}%`;
  const thumbHeight = `${Math.max(3, (Math.min(viewport.count, total) / total) * 100)}%`;

  return (
    <div
      className={`diff-scrollbar side-${side}`}
      data-testid={`scrollbar-${side}`}
      ref={trackRef}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragging.current = true;
        seek(event.clientY, true);
      }}
      onPointerMove={(event) => {
        if (dragging.current) seek(event.clientY, true);
      }}
      onPointerUp={(event) => {
        dragging.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
    >
      <canvas ref={canvasRef} />
      <div className="scrollbar-thumb" style={{ top: thumbTop, height: thumbHeight }} />
    </div>
  );
}
