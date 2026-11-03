/**
 * The start screen's and the tutorial's own glyphs (16×16, stroke = currentColor), so
 * they need nothing from src/icons.tsx. `tone` colours a glyph with a fixed hue that
 * reads on light and dark themes alike.
 */
import type { ReactNode } from "react";

const GLYPHS = {
  home: <path d="M2.6 7.6 8 3l5.4 4.6M4.2 6.4V13h7.6V6.4M6.8 13V9.6h2.4V13" />,
  drag: <path d="M6 3.5h.1M10 3.5h.1M6 8h.1M10 8h.1M6 12.5h.1M10 12.5h.1" strokeWidth="2.2" />,
  plus: <path d="M8 3v10M3 8h10" />,
  minus: <path d="M3 8h10" />,
  clock: <><circle cx="8" cy="8" r="5.4" /><path d="M8 5v3.2l2.2 1.4" /></>,
  trash: <path d="M3 4.5h10M6.2 4.5V3h3.6v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5M6.8 7v4M9.2 7v4" />,
  palette: <><path d="M8 2.6a5.4 5.4 0 1 0 0 10.8c.9 0 1.2-.6 1-1.3-.3-.9.2-1.7 1.2-1.7h1.4a2 2 0 0 0 2-2A5.6 5.6 0 0 0 8 2.6z" /><path d="M5.2 7.6h.1M6.8 5.2h.1M9.6 5.2h.1" strokeWidth="2" /></>,
  image: <><rect x="2.4" y="3.2" width="11.2" height="9.6" rx="1.2" /><path d="m3.4 11.6 3.2-3.4 2.4 2.4 1.6-1.6 2.2 2.4" /><circle cx="10.6" cy="6" r="1" /></>,
  grid: <path d="M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z" />,
  eye: <><path d="M1.8 8S4 3.8 8 3.8 14.2 8 14.2 8 12 12.2 8 12.2 1.8 8 1.8 8z" /><circle cx="8" cy="8" r="1.9" /></>,
  sun: <><circle cx="8" cy="8" r="2.6" /><path d="M8 1.8v1.4M8 12.8v1.4M1.8 8h1.4M12.8 8h1.4M3.6 3.6l1 1M11.4 11.4l1 1M3.6 12.4l1-1M11.4 4.6l1-1" /></>,
  moon: <path d="M12.6 10.2A5.2 5.2 0 0 1 5.8 3.4a5.2 5.2 0 1 0 6.8 6.8z" />,
  info: <><circle cx="8" cy="8" r="5.4" /><path d="M8 7.2v3.6M8 5.2v.1" /></>,
  sync: <path d="M3.2 6.4A5 5 0 0 1 12.4 5M12.8 9.6A5 5 0 0 1 3.6 11M12.6 2.6V5.2H10M3.4 13.4v-2.6H6" />,
  settings: <><circle cx="8" cy="8" r="2" /><path d="M8 2v1.6M8 12.4V14M2 8h1.6M12.4 8H14M3.8 3.8l1.1 1.1M11.1 11.1l1.1 1.1M3.8 12.2l1.1-1.1M11.1 4.9l1.1-1.1" /></>,
  folder: <path d="M2.4 4.2h4l1.4 1.6h5.8v6.8H2.4z" />,
  clone: <><rect x="5.2" y="5.2" width="8" height="8" rx="1.2" /><path d="M10.8 5.2V3H2.8v8h2.4" /></>,
  globe: <><circle cx="8" cy="8" r="5.2" /><path d="M3 8h10M8 3c1.5 1.7 1.5 8.3 0 10M8 3c-1.5 1.7-1.5 8.3 0 10" /></>,
  link: <path d="M6.8 9.2 9.2 6.8M5.6 7.6 4.4 8.8a2.2 2.2 0 0 0 3.1 3.1L8.7 10.7M10.4 8.4l1.2-1.2a2.2 2.2 0 0 0-3.1-3.1L7.3 5.3" />,
  tutorial: <><path d="M1.6 6.4 8 3.4l6.4 3L8 9.4z" /><path d="M4.4 7.8v3c1.8 1.4 5.4 1.4 7.2 0v-3M14.4 6.4v3.6" /></>,
  book: <path d="M8 4.4C6.6 3.4 4.6 3 2.6 3.2v9.2c2-.2 4 .2 5.4 1.2 1.4-1 3.4-1.4 5.4-1.2V3.2c-2-.2-4 .2-5.4 1.2zM8 4.4v9.2" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  prev: <path d="M10 3.6 5.6 8l4.4 4.4" />,
  next: <path d="M6 3.6 10.4 8 6 12.4" />,
  check: <path d="m3.4 8.4 3 3 6.2-6.8" />,
  lines: <path d="M3 4h10M3 6.7h7M3 9.4h10M3 12.1h5" />,
  merge: <path d="M4.5 3v4c0 2 3.5 2 3.5 4v2M11.5 3v4c0 2-3.5 2-3.5 4" />,
  tree: <path d="M3.2 3h3v2.6h-3zM3.2 5.6V12h3M4.7 8.4h1.5M9.8 7h3v2.6h-3zM9.8 10.6h3v2.6h-3zM6.2 8.4h3.6M8 8.4v3.5h1.8" />,
  hex: <path d="M3 4.6h2M3 8h2M3 11.4h2M7 4.6h2M7 8h2M7 11.4h2M11 4.6h2M11 8h2M11 11.4h2" />,
  branch: <><circle cx="4.6" cy="3.6" r="1.4" /><circle cx="4.6" cy="12.4" r="1.4" /><circle cx="11.4" cy="5.6" r="1.4" /><path d="M4.6 5v6M11.4 7c0 2.6-6.8 1.8-6.8 4" /></>,
  bars: <path d="M3 13V8M6.3 13V4M9.7 13V6.4M13 13V9.6" />,
  text: <path d="M3 4h10M8 4v9M5.6 13h4.8" />,
  alert: <><path d="M8 2.6 14 13H2z" /><path d="M8 6.6v3.2M8 11.4v.1" /></>,
  binary: <path d="M4 3.4v3.6M3.2 3.4H4M3 7h2M10.4 3.4h1.2v3.6h-1.2zM4 9.4h1.2V13H4zM10.8 9.4V13M10 9.4h.8M10 13h1.6" />,
  search: <><circle cx="7" cy="7" r="3.8" /><path d="m10 10 3.4 3.4" /></>,
  wave: <path d="M1.8 8c1.2-3.6 2.4-3.6 3.6 0s2.4 3.6 3.6 0 2.4-3.6 3.6 0 1.2 1.8 1.6 1" />,
  commit: <><circle cx="8" cy="8" r="2.4" /><path d="M2 8h3.6M10.4 8H14" /></>,
  dot: <><circle cx="8" cy="8" r="1.4" /><circle cx="8" cy="8" r="4.6" /></>,
  box: <path d="M8 2.4 13.2 5.2v5.6L8 13.6 2.8 10.8V5.2zM2.8 5.2 8 8l5.2-2.8M8 8v5.6" />,
  cloud: <path d="M4.6 12.2a2.8 2.8 0 0 1-.3-5.6 3.8 3.8 0 0 1 7.3-.8 2.9 2.9 0 0 1 .2 5.8z" />,
  terminal: <path d="M2.6 3.2h10.8v9.6H2.6zM5 6.2 7.2 8 5 9.8M8.4 9.8h2.6" />,
  language: <path d="M2.4 4h6.4M5.6 2.6V4M4 4c.4 2.4 2 4.2 4 5.2M7.6 4C7.2 6.4 5.6 8.4 3 9.6M8.6 13.4l2.6-6.2 2.6 6.2M9.4 11.6h3.6" />,
  power: <path d="M8 2.6v5M5 4.4a4.8 4.8 0 1 0 6 0" />,
} satisfies Record<string, ReactNode>;

export type StartIconName = keyof typeof GLYPHS;

/** Each glyph's own colour, mid-tone so it reads on every light and dark theme. */
export const START_TONES: Partial<Record<StartIconName, string>> = {
  home: "#3b82f6", plus: "#16a34a", clock: "#f59e0b", trash: "#ef4444", palette: "#d946ef",
  image: "#0ea5e9", grid: "#8b5cf6", eye: "#14b8a6", sun: "#f59e0b", moon: "#6366f1",
  info: "#0ea5e9", sync: "#10b981", settings: "#64748b", folder: "#eab308", clone: "#22c55e",
  globe: "#06b6d4", link: "#3b82f6", tutorial: "#f97316", book: "#a855f7", lines: "#3b82f6",
  merge: "#a855f7", tree: "#eab308", hex: "#64748b", branch: "#f97316", bars: "#22c55e",
  text: "#0ea5e9", alert: "#ef4444", binary: "#10b981", search: "#06b6d4", wave: "#ec4899",
  commit: "#f97316", dot: "#3b82f6", box: "#8b5cf6", cloud: "#38bdf8", check: "#16a34a",
  terminal: "#10b981", language: "#0ea5e9", power: "#ef4444",
};

/** `mono` draws in the text colour (inside coloured buttons); otherwise the glyph's tone. */
export function StartIcon({ name, size = 16, className, color, mono }: { name: StartIconName; size?: number; className?: string; color?: string; mono?: boolean }) {
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke={color ?? (mono ? "currentColor" : START_TONES[name] ?? "currentColor")}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {GLYPHS[name]}
    </svg>
  );
}
