/**
 * The icon set.
 *
 * Every toolbar button, menu row, panel heading and list entry draws from here, so the
 * app has one visual vocabulary and a menu row can never be text-only — the rule is an
 * icon beside every label. The glyphs are plain 24-unit strokes that inherit
 * `currentColor`, which keeps them legible on all twenty themes.
 */
import type { CSSProperties } from "react";

/** Stroked outlines, drawn with round caps at a 1.7 unit weight. */
const STROKE: Record<string, string> = {
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5",
  files: "M9 3h6l4 4v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM5 7v12a2 2 0 0 0 2 2h8",
  compareFiles: "M4 4h6v16H4zM14 4h6v16h-6zM10 9h4M10 15h4",
  home: "M4 11 12 4l8 7M6 10v9h12v-9M10 19v-5h4v5",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  folders: "M3 8a2 2 0 0 1 2-2h3l1.5 2H15a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM7 6V5a2 2 0 0 1 2-2h3l1.5 2H19a2 2 0 0 1 2 2v6",
  // Three inputs funnelling into one — a 3-way merge, rather than the git branch
  // glyph this used to be, which read as "branch" to everyone who saw it.
  merge: "M3 5h3.5A4.5 4.5 0 0 1 11 9.5V12M3 12h8M3 19h3.5A4.5 4.5 0 0 0 11 14.5V12M11 12h7M15.5 8.5 19 12l-3.5 3.5",
  conflict: "M12 3 2.5 20h19zM12 9v5M12 17.2v.1",
  git: "M6 4v9a3 3 0 0 0 3 3h6M6 4a1.6 1.6 0 1 0 0-.1zM18 16a1.6 1.6 0 1 0 0 .1zM6 20a1.6 1.6 0 1 0 0 .1z",
  repository: "M5 4.5A1.5 1.5 0 0 1 6.5 3H19v14H6.5A1.5 1.5 0 0 0 5 18.5zM5 18.5A1.5 1.5 0 0 0 6.5 20H19v-3",
  save: "M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 3v5h7M8 13h8v8H8z",
  saveAs: "M5 3h9l3 3v6M3 5a2 2 0 0 1 2-2M5 21a2 2 0 0 1-2-2V5M5 21h5M8 3v5h6M15 19l2 2 4-4",
  session: "M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM8 8h8M8 12h8M8 16h5",
  open: "M3 7a2 2 0 0 1 2-2h4l2 2h5a2 2 0 0 1 2 2v1M3 7v10a2 2 0 0 0 2 2h12.5a1.5 1.5 0 0 0 1.44-1.08L21 10H7.2a2 2 0 0 0-1.92 1.44L3 19",
  print: "M7 8V3h10v5M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z",
  preview: "M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  undo: "M9 7 4 12l5 5M4 12h10a5 5 0 0 1 0 10h-2",
  redo: "m15 7 5 5-5 5M20 12H10a5 5 0 0 0 0 10h2",
  copy: "M9 9h10v12H9zM5 15H3V3h12v2",
  paste: "M9 3h6v3H9zM7 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2",
  cut: "m6 4 12 14M18 4 6 18M7 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM17 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  selectAll: "M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M11 4h2M11 20h2M4 11v2M20 11v2",
  find: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  prev: "m14 6-6 6 6 6",
  next: "m10 6 6 6-6 6",
  /*
   * Back and forward through the history: a double chevron.
   *
   * Not the curved arrow — that is Undo, and Undo is a different promise. Undo
   * takes a change back; this takes you back to what you were looking at and
   * leaves every change where it is. Nor the single chevron, which steps through
   * the differences within one comparison.
   */
  historyBack: "M11 6 5 12l6 6M18 6l-6 6 6 6",
  historyForward: "m6 6 6 6-6 6M13 6l6 6-6 6",
  // Deleting on one side or the other: the same bin, but the side it acts on is
  // the whole difference between the two buttons, so it is drawn.
  trashLeft: "M9 7h11M11 7V5h7v2M11 11v7M16 11v7M10 7v12a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2V7M6 14l-3-3 3-3",
  trashRight: "M4 7h11M6 7V5h7v2M8 11v7M13 11v7M5 7v12a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2V7M18 14l3-3-3-3",
  // Syntax highlighting is about code, not about the palette the theme button owns.
  code: "m9 8-5 4 5 4M15 8l5 4-5 4M13 5l-2 14",
  first: "M17 6 11 12l6 6M7 6v12",
  last: "m7 6 6 6-6 6M17 6v12",
  up: "m6 14 6-6 6 6",
  down: "m6 10 6 6 6-6",
  base: "M12 3 3 8l9 5 9-5zM3 14l9 5 9-5",
  local: "M20 4H10a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10M4 9l3 3-3 3",
  remote: "M4 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4M20 9l-3 3 3 3",
  both: "M7 5v14M17 5v14M10 9h4M10 15h4M2 12h3M19 12h3",
  unresolve: "M12 4a8 8 0 1 0 8 8M12 4v8l5 3M19 3l2 2-2 2",
  resolveAll: "m4 12 4 4 8-8M12 16l2 2 6-6",
  theme: "M12 3a9 9 0 0 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1 .8-1.5 1.8-1.5H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8zM7.5 11a1 1 0 1 0 0-.1zM11 7.5a1 1 0 1 0 0-.1zM15.5 9a1 1 0 1 0 0-.1z",
  language: "M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0zM3 12h18M12 3c2.4 2.4 3.6 5.4 3.6 9S14.4 18.6 12 21c-2.4-2.4-3.6-5.4-3.6-9S9.6 5.4 12 3z",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z",
  about: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 7.8v.1",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.6 9.5a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2.2-2.4 3.7M12 17.2v.1",
  close: "m6 6 12 12M18 6 6 18",
  refresh: "M20 11A8 8 0 0 0 6.3 6.3L3 9M3 4v5h5M4 13a8 8 0 0 0 13.7 4.7L21 15M21 20v-5h-5",
  swap: "M7 4v12M7 20 3 16M7 4l4 4M17 20V8M17 4l4 4M17 20l-4-4",
  zoomIn: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4M11 8v6M8 11h6",
  zoomOut: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4M8 11h6",
  zoomReset: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4M8.5 9.5h5l-5 4h5",
  wrap: "M4 6h16M4 12h12a3 3 0 1 1 0 6h-3M4 18h3M10 15l-3 3 3 3",
  highlight: "M4 20h16M6 16l8-8 3 3-8 8zM13 6l3-3 3 3-3 3z",
  whitespace: "M5 10v4M9 12h.1M13 12h.1M17 12h.1M19 10v4",
  letterCase: "M4 18 8 7l4 11M5.5 14.5h5M19 18v-6.5a2.5 2.5 0 1 0-5 0M19 18a3 3 0 0 1-5-2.2c0-1.6 2-2.3 5-2.3",
  panelLeft: "M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM10 4v16",
  panelRight: "M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM14 4v16",
  statusBar: "M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 16h16",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3",
  clearAll: "M4 6h12M4 12h8M4 18h6M15 13l6 6M21 13l-6 6",
  check: "m5 13 4 4 10-10",
  dot: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  exit: "M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 8l-4 4 4 4M6 12h11",
  image: "M4 5h16v14H4zM4 16l4.5-4.5 4 4L16 12l4 4M9 9.5a1 1 0 1 0 0-.1z",
  font: "M5 6V4h14v2M12 4v16M9 20h6",
  eye: "M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  warning: "M12 3 2.5 20h19zM12 9v5M12 17.2v.1",
  error: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 9l6 6M15 9l-6 6",
  added: "M12 5v14M5 12h14",
  removed: "M5 12h14",
  modified: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 3v3M12 18v3M3 12h3M18 12h3",
  equal: "M5 10h14M5 14h14",
  leftOnly: "M19 12H5M9 6l-6 6 6 6",
  rightOnly: "M5 12h14M15 6l6 6-6 6",
  comment: "M4 5h16v11H9l-4 4v-4H4zM8 9h8M8 12.5h5",
  quote: "M8 7c-2 1-3 2.6-3 4.6V17h5v-5H7.5c0-1.6.6-2.6 2-3.4zM17 7c-2 1-3 2.6-3 4.6V17h5v-5h-2.5c0-1.6.6-2.6 2-3.4z",
  hash: "M9 4 7 20M17 4l-2 16M4 9h16M3 15h16",
  bookmark: "M7 4h10v16l-5-4-5 4z",
  music: "M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z",
  cloud: "M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6 10.3 3.6 3.6 0 0 0 7 18z",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5zM12 15v2",
  filter: "M3 5h18l-7 8v6l-4 2v-8z",
  tree: "M5 4v14a2 2 0 0 0 2 2h3M5 10h5M19 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM19 22a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM10 6h7M10 20h7",
  list: "M4 6h2M4 12h2M4 18h2M9 6h11M9 12h11M9 18h11",
  terminal: "M3 5h18v14H3zM7 10l2.5 2L7 14M12.5 15h4",
  sync: "M4 9a8 8 0 0 1 13.3-3.3L20 8M20 4v4h-4M20 15a8 8 0 0 1-13.3 3.3L4 16M4 20v-4h4",
  hex: "M4 5h16v14H4zM8 5v14M12 5v14M16 5v14M4 9.7h16M4 14.3h16",
  columns: "M4 4h7v16H4zM13 4h7v16h-7z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  commit: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 3v5M12 16v5",
  branch: "M6 4v9a3 3 0 0 0 3 3h6M6 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  palette: "M12 21a9 9 0 1 1 0-18c4.97 0 9 3.58 9 8 0 2.21-1.79 4-4 4h-1.8a1.7 1.7 0 0 0-1.2 2.9c.33.33.5.77.5 1.2 0 1.05-.85 1.9-1.9 1.9zM7.5 11.5a1 1 0 1 0 0-.1zM11 8a1 1 0 1 0 0-.1zM15.5 9.5a1 1 0 1 0 0-.1z",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z",
  minimize: "M5 12h14",
  maximize: "M5 5h14v14H5z",
  restore: "M8 8V5h11v11h-3M5 8h11v11H5z",
  monitor: "M4 5h16v11H4zM9 20h6M12 16v4",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7L11.5 7M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7l1.5-1.5",
  download: "M12 4v10M8 10l4 4 4-4M5 19h14",
  drag: "M9 6a1 1 0 1 0 0-.1zM15 6a1 1 0 1 0 0-.1zM9 12a1 1 0 1 0 0-.1zM15 12a1 1 0 1 0 0-.1zM9 18a1 1 0 1 0 0-.1zM15 18a1 1 0 1 0 0-.1z",
  stage: "M12 20V8M8 12l4-4 4 4M5 4h14",
  page: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  // The file kinds the directory tree draws beside a name.
  archive: "M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5 12 12l9-4.5M12 12v9M7.5 5.2l9 4.5",
  video: "M3 6h12v12H3zM15 10l6-3.5v11L15 14M7 9.5l4 2.5-4 2.5z",
  binary: "M8 8h8v8H8zM9 4v4M15 4v4M9 16v4M15 16v4M4 9h4M4 15h4M16 9h4M16 15h4",
};

export type IconName = keyof typeof STROKE | string;

export function hasIcon(name: string): boolean {
  return name in STROKE;
}

export function Icon({
  name,
  size = 18,
  className,
  style,
  strokeWidth = 1.7,
  title,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
  title?: string;
}) {
  const path = STROKE[name] ?? STROKE.dot;
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <path d={path} />
    </svg>
  );
}

/**
 * The two language flags.
 *
 * Drawn rather than taken from an emoji font: the flag emoji render as two letters on
 * Windows, which is exactly the platform this runs on most.
 */
export function Flag({ language, size = 18 }: { language: string; size?: number }) {
  const height = Math.round((size * 2) / 3);
  if (language === "en") {
    return (
      <svg className="icon flag" width={size} height={height} viewBox="0 0 60 40" aria-hidden="true" focusable="false">
        <rect width="60" height="40" fill="#012169" />
        <path d="M0 0 60 40M60 0 0 40" stroke="#ffffff" strokeWidth="8" />
        <path d="M0 0 60 40M60 0 0 40" stroke="#c8102e" strokeWidth="4" />
        <path d="M30 0v40M0 20h60" stroke="#ffffff" strokeWidth="13" />
        <path d="M30 0v40M0 20h60" stroke="#c8102e" strokeWidth="8" />
        <rect width="60" height="40" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg className="icon flag" width={size} height={height} viewBox="0 0 60 40" aria-hidden="true" focusable="false">
      <rect width="60" height="40" fill="#ffffff" />
      <path d="M30 20a7 7 0 0 1 14 0 7 7 0 0 1-14 0z" fill="#cd2e3a" />
      <path d="M16 20a7 7 0 0 1 14 0 7 7 0 0 1-14 0z" fill="#0047a0" />
      <path d="M23 13a7 7 0 0 1 7 7 7 7 0 0 1-7-7z" fill="#cd2e3a" />
      <path d="M37 27a7 7 0 0 1-7-7 7 7 0 0 1 7 7z" fill="#0047a0" />
      <g stroke="#000000" strokeWidth="1.6">
        <path d="M7 9l4 6M9.5 7.5l4 6M12 6l4 6" />
        <path d="M48 28l4 6M50.5 26.5l4 6M53 25l4 6" />
        <path d="M12 34l4-6M9.5 32.5l4-6M7 31l4-6" />
        <path d="M53 15l4-6M50.5 13.5l4-6M48 12l4-6" />
      </g>
      <rect width="60" height="40" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="2" />
    </svg>
  );
}

/** A filled circle, used for theme swatches and status dots in menus. */
export function Swatch({ color, size = 16, ring }: { color: string; size?: number; ring?: string }) {
  return (
    <svg className="icon swatch" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8" fill={color} stroke={ring ?? "rgba(0,0,0,0.25)"} strokeWidth="1.5" />
    </svg>
  );
}
