import { Children, useCallback, useEffect, useRef, useState } from "react";

type Props = {
  direction: "row" | "column";
  /** Fraction of the container taken by the first child, 0-1. Equal split by default. */
  initial?: number;
  min?: number;
  max?: number;
  /** Persists the position for this session. */
  storageKey?: string;
  className?: string;
  /** Exactly two children: the first pane and the second pane. */
  children: React.ReactNode;
};

/**
 * Two panes with a draggable divider between them. Double-clicking the divider restores
 * the even split the app starts with.
 */
export function SplitPane({ direction, initial = 0.5, min = 0.15, max = 0.85, storageKey, className, children }: Props) {
  const panes = Children.toArray(children);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [fraction, setFraction] = useState(() => restore(storageKey, initial));
  const dragging = useRef(false);

  useEffect(() => {
    if (!storageKey) return;
    try {
      sessionStorage.setItem(`mydiff.split.${storageKey}`, String(fraction));
    } catch {
      /* private browsing blocks session storage */
    }
  }, [storageKey, fraction]);

  const move = useCallback((event: PointerEvent | React.PointerEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    const value = direction === "row"
      ? (event.clientX - bounds.left) / bounds.width
      : (event.clientY - bounds.top) / bounds.height;
    setFraction(Math.min(Math.max(value, min), max));
  }, [direction, min, max]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (dragging.current) move(event);
    };
    const onUp = () => {
      dragging.current = false;
      document.body.classList.remove("is-splitting");
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [move]);

  const percent = `${(fraction * 100).toFixed(2)}%`;
  return (
    <div
      ref={containerRef}
      className={`split split-${direction}${className ? ` ${className}` : ""}`}
    >
      <div className="split-pane" style={direction === "row" ? { width: percent } : { height: percent }}>
        {panes[0]}
      </div>
      <div
        className="split-divider"
        role="separator"
        aria-orientation={direction === "row" ? "vertical" : "horizontal"}
        onPointerDown={(event) => {
          dragging.current = true;
          document.body.classList.add("is-splitting");
          event.preventDefault();
        }}
        onDoubleClick={() => setFraction(initial)}
      />
      <div className="split-pane is-rest">{panes[1]}</div>
    </div>
  );
}

function restore(key: string | undefined, fallback: number): number {
  if (!key) return fallback;
  try {
    const value = Number(sessionStorage.getItem(`mydiff.split.${key}`));
    return Number.isFinite(value) && value > 0.05 && value < 0.95 ? value : fallback;
  } catch {
    return fallback;
  }
}
