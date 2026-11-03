// The colours themselves are in icons.css, loaded by main.tsx (so Node tests can import this file).
import { DUOTONE, toneOf } from "./iconTones";

export type IconName =
  | "folder"
  | "branch"
  | "history"
  | "help"
  | "open"
  | "clone"
  | "browse"
  | "prefs"
  | "clock"
  | "refresh"
  | "plus"
  | "undo"
  | "discard"
  | "commit"
  | "fetch"
  | "pull"
  | "push"
  | "stash"
  | "stashPop"
  | "status"
  | "list"
  | "export"
  | "snapshot"
  | "copy"
  | "hash"
  | "filePlus"
  | "folderPlus"
  | "trash"
  | "eyeOff"
  | "eye"
  | "stop"
  | "theme"
  | "language"
  | "drive"
  | "panelLeft"
  | "panelRight"
  | "panelBottom"
  | "terminal"
  | "lock"
  | "alert"
  | "print"
  | "prev"
  | "next"
  | "home"
  | "edit"
  | "book"
  | "tutorial"
  | "more"
  | "tag"
  | "merge"
  | "branchNew"
  | "checkout"
  | "diff"
  | "info"
  | "save"
  | "check"
  | "close"
  | "wrap"
  | "search"
  | "palette"
  | "brush"
  | "toolbar"
  | "key"
  | "external"
  | "user";

/** Every icon name, for the tests (each must have a drawing and a tone). */
export const ICON_NAMES: IconName[] = [
  "folder", "branch", "history", "help", "open", "clone", "browse", "prefs", "clock", "refresh", "plus", "undo",
  "discard", "commit", "fetch", "pull", "push", "stash", "stashPop", "status", "list", "export", "snapshot", "copy",
  "hash", "filePlus", "folderPlus", "trash", "eyeOff", "eye", "stop", "theme", "language", "drive", "panelLeft",
  "panelRight", "panelBottom", "terminal", "lock", "alert", "print", "prev", "next", "home", "edit", "book", "tutorial",
  "more", "tag", "merge", "branchNew", "checkout", "diff", "info", "save", "check", "close", "wrap", "search",
  "palette", "brush", "toolbar", "key", "external", "user",
];

/**
 * A 16 px line icon in its own colour (iconTones.ts): `data-tone` picks the hue,
 * `data-duo` adds a light wash inside the icon's main shape. `mono` draws it in the
 * text colour instead (for places that are already coloured, like a primary button).
 */
export function Icon({ name, mono }: { name: IconName; mono?: boolean }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-icon={name}
      data-tone={mono ? undefined : toneOf(name)}
      data-duo={!mono && DUOTONE.has(name) ? "" : undefined}
    >
      {draw(name)}
    </svg>
  );
}

export function hasDrawing(name: IconName): boolean {
  return draw(name) !== null;
}

export function FileTypeIcon({ path }: { path: string }) {
  const kind = fileKind(path);
  return (
    <svg className={`icon file-type file-type-${kind}`} data-tone={FILE_TONES[kind]} viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 2.2h6.1L13 5.7V13.8H3.5z" />
      <path d="M9.4 2.4V5.8H13" />
      {kind === "code" && <path d="M6.3 8.1 5 9.5l1.3 1.4M9.7 8.1 11 9.5 9.7 10.9" />}
      {kind === "image" && <><circle className="dab" cx="6.5" cy="8.1" r=".8" style={{ fill: "currentColor" }} /><path d="M5 12.2 7 10l1.2 1.1 1.4-1.7 1.6 2.8" /></>}
      {kind === "data" && <path d="M6.2 8.3c.7-.8 2.9-.8 3.6 0-.7.8-2.9.8-3.6 0zM6.2 10.6c.7.8 2.9.8 3.6 0" />}
      {kind === "text" && <path d="M6 8.2h4.2M6 10.3h2.8" />}
      {kind === "web" && <path d="M5.6 9.6 8 7.6l2.4 2M8 7.8v4" />}
      {kind === "config" && <path d="M6.1 8.2h3.8M6.1 10.4h2.4M8 7.4v.1M9.2 9.6v.1" />}
    </svg>
  );
}

const FILE_TONES = { code: "cyan", web: "orange", data: "green", text: "blue", image: "pink", config: "slate", file: "sky" } as const;

function fileKind(path: string): "code" | "web" | "data" | "text" | "image" | "config" | "file" {
  const name = path.split(/[/\\]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp"].includes(ext)) return "image";
  if (["ts", "tsx", "js", "jsx", "mjs", "cjs", "cs", "py", "java", "go", "rs", "c", "cpp", "h", "hpp", "kt", "swift", "vb"].includes(ext)) return "code";
  if (["html", "htm", "css", "scss", "less"].includes(ext)) return "web";
  if (["json", "xml", "yml", "yaml", "csv", "toml"].includes(ext)) return "data";
  if (["md", "txt", "log", "rst"].includes(ext)) return "text";
  if (name.startsWith(".") || ["ini", "cfg", "conf", "env", "gitignore"].includes(ext)) return "config";
  return "file";
}

export function MenuGlyph({ name }: { name: IconName }) {
  return (
    <span className="menu-glyph" aria-hidden="true">
      <Icon name={name} />
    </span>
  );
}

function draw(name: IconName) {
  switch (name) {
    case "folder":
      return <path d="M2 4.5h4l1.2 1.5H14V13H2z" />;
    case "branch":
      return <path d="M5 3.5v6.2a2 2 0 1 0 0 .8V12M5 3.5a1.4 1.4 0 1 0 0 .1M11 8.2V6.5a2 2 0 0 0-2-2H6.5M11 12.2a1.4 1.4 0 1 0 .1 0" />;
    case "history":
      return <path d="M3 8a5 5 0 1 0 1.2-3.2M3 3.5V6h2.5M8 6v2.6l1.8 1.1" />;
    case "help":
      return <><circle cx="8" cy="8" r="5.2" /><path d="M8 11.2v.2M6.6 6.4a1.5 1.5 0 1 1 2.2 1.3c-.5.3-.8.7-.8 1.2" /></>;
    case "open":
      return <path d="M2 6.5V4.2h3.6L7 5.6h7V12H2zM2 8h12" />;
    case "clone":
      return <path d="M6 3.5h6.5V11H6zM3.5 5.5V13H10" />;
    case "browse":
      return <><circle cx="8" cy="8" r="5.2" /><path d="M3 8h10M8 3c1.6 1.6 1.6 8.4 0 10M8 3c-1.6 1.6-1.6 8.4 0 10" /></>;
    case "prefs":
      // A gear: eight teeth around a wheel, with the hole in the middle.
      return (
        <>
          <path d="M6.9 1.9h2.2l.35 1.75 1.3.55 1.5-1 1.55 1.55-1 1.5.55 1.3 1.75.35v2.2l-1.75.35-.55 1.3 1 1.5-1.55 1.55-1.5-1-1.3.55-.35 1.75H6.9l-.35-1.75-1.3-.55-1.5 1-1.55-1.55 1-1.5-.55-1.3L1.9 9.1V6.9l1.75-.35.55-1.3-1-1.5 1.55-1.55 1.5 1 1.3-.55z" strokeWidth="1.3" />
          <circle cx="8" cy="8" r="2.1" strokeWidth="1.4" />
        </>
      );
    case "clock":
      return <><circle cx="8" cy="8" r="5.2" /><path d="M8 5v3.2l2 1.3" /></>;
    case "refresh":
      return <path d="M13 8a5 5 0 1 1-1.4-3.5M13 2.8V5.2H10.6" />;
    case "plus":
      return <path d="M8 3.5v9M3.5 8h9" />;
    case "undo":
      return <path d="M4 7.2 2.2 5.5 4 3.8M2.5 5.5h6.2a3.3 3.3 0 1 1 0 6.6H6" />;
    case "discard":
      return <path d="M4 4.5h8M6.2 4.5V3.5h3.6v1M5 6.2l.5 6h5l.5-6" />;
    case "commit":
      return <><circle cx="8" cy="8" r="5.2" /><path d="M5.4 8.1 7.1 9.7 10.7 6.2" /></>;
    case "fetch":
      return <path d="M8 3v7M5.5 7.5 8 10l2.5-2.5M3.5 12.5h9" />;
    case "pull":
      return <path d="M8 2.8v7.2M5.2 7.4 8 10.2l2.8-2.8M3 13h10" />;
    case "push":
      return <path d="M8 13V5.8M5.2 8.4 8 5.6l2.8 2.8M3 3h10" />;
    case "stash":
      return <path d="M3.5 6.5h9v6h-9zM3.5 6.5 5 4h6l1.5 2.5" />;
    case "stashPop":
      return <path d="M3.5 9h9v4h-9zM8 3v4.5M6 5.2 8 3l2 2.2" />;
    case "status":
      return <path d="M4 4.5h8M4 8h8M4 11.5h5" />;
    case "list":
      return <path d="M3.5 4.5h2M7 4.5h5.5M3.5 8h2M7 8h5.5M3.5 11.5h2M7 11.5h5.5" />;
    case "export":
      return <path d="M8 10.5V3M5.5 5.2 8 2.8l2.5 2.4M3.5 8.5V13h9V8.5" />;
    case "snapshot":
      return <path d="M3 5.5h2.2L6.2 4h3.6l1 1.5H13V12H3zM8 7.2a2 2 0 1 0 .1 0" />;
    case "copy":
      return <path d="M6 3.5h6.5V11H6zM3.5 5.5V13H10" />;
    case "hash":
      return <path d="M6 3.2 5 12.8M11 3.2 10 12.8M3.5 6.2h9M3 10h9" />;
    case "filePlus":
      return <path d="M4 2.8h5L12 5.6V13H4zM9 2.8V6h3M8 8v3.2M6.4 9.6h3.2" />;
    case "folderPlus":
      return <path d="M2 4.5h4l1 1.4H14V13H2zM8 7.6v3.4M6.3 9.3h3.4" />;
    case "trash":
      return <path d="M3.5 4.5h9M6 4.5V3.4h4v1.1M5.2 6.2l.4 6.2h4.8l.4-6.2" />;
    case "eyeOff":
      return <path d="M2.5 3.2 13.5 13M4 6.2A7 7 0 0 0 2 8.2s2 3.6 6 3.6c.8 0 1.5-.2 2.1-.5M7 4.4c.3 0 .6 0 .9.1 3.2.4 5.6 3.7 5.6 3.7s-.5.9-1.4 1.8" />;
    case "eye":
      return <><path d="M2 8s2.2-3.6 6-3.6S14 8 14 8s-2.2 3.6-6 3.6S2 8 2 8z" /><circle cx="8" cy="8" r="1.6" /></>;
    case "stop":
      return <rect x="4" y="4" width="8" height="8" rx="1" />;
    case "theme":
      return (
        <>
          <path strokeWidth="1.35" d="M8 14.2a6 6 0 1 1 0-12 6 5.2 0 0 1 6 5.1 2.9 2.6 0 0 1-2.9 2.6H9.5a1.3 1.3 0 0 0-.7 2.4 1 1 0 0 1-.8 1.9z" />
          <circle className="dab" cx="5.7" cy="7.3" r="1.05" style={{ fill: "#ef4444", stroke: "none" }} />
          <circle className="dab" cx="8.3" cy="5.1" r="1.05" style={{ fill: "#f59e0b", stroke: "none" }} />
          <circle className="dab" cx="10.9" cy="7.3" r="1.05" style={{ fill: "#2563eb", stroke: "none" }} />
        </>
      );
    case "language":
      return <><circle cx="8" cy="8" r="5.2" /><path d="M3 8h10M8 3c1.5 1.7 1.5 8.3 0 10M8 3c-1.5 1.7-1.5 8.3 0 10" /></>;
    case "drive":
      return <path d="M3 4.2h10v7.6H3zM3 7.2h10M5.2 10h.1M7.2 10h2.2" />;
    case "panelLeft":
      return <><rect x="2.2" y="2.6" width="11.6" height="10.8" rx="1" /><path d="M6.2 2.6v10.8" /></>;
    case "panelRight":
      return <><rect x="2.2" y="2.6" width="11.6" height="10.8" rx="1" /><path d="M9.8 2.6v10.8" /></>;
    case "panelBottom":
      return <><rect x="2.2" y="2.6" width="11.6" height="10.8" rx="1" /><path d="M2.2 9.2h11.6" /></>;
    case "terminal":
      return <path d="M3 3.4h10v9.2H3zM5.2 6.2 7.4 8 5.2 9.8M8.4 9.8h2.4" />;
    case "lock":
      return <path d="M5.2 7.2V5.2a2.8 2.8 0 0 1 5.6 0v2M4 7.2h8V13H4z" />;
    case "alert":
      return <><circle cx="8" cy="8" r="5.2" /><path d="M8 4.8v3.6M8 10.8v.2" /></>;
    case "print":
      return <path d="M4.5 6V3h7v3M3 6.5h10v5H3zM5 11.5h6V13H5z" />;
    case "prev":
      return <path d="M4.2 9.6 8 5.4l3.8 4.2" />;
    case "next":
      return <path d="M4.2 6.4 8 10.6l3.8-4.2" />;
    case "home":
      return <path d="M2.6 7.6 8 3l5.4 4.6M4.2 6.4V13h7.6V6.4M6.8 13V9.6h2.4V13" />;
    case "edit":
      return <path d="M3 13h2.6l7-7L10 3.4l-7 7zM8.8 4.6l2.6 2.6" />;
    case "book":
      return <path d="M8 4.4C6.6 3.4 4.6 3 2.6 3.2v9.2c2-.2 4 .2 5.4 1.2 1.4-1 3.4-1.4 5.4-1.2V3.2c-2-.2-4 .2-5.4 1.2zM8 4.4v9.2" />;
    case "tutorial":
      return <><circle cx="8" cy="8" r="5.4" /><path d="M6.6 6.4 10 8l-3.4 1.6z" /></>;
    case "more":
      return <path d="M4 8h.1M8 8h.1M12 8h.1" strokeWidth="2.4" />;
    case "tag":
      return <><path d="M2.8 3h5l5.4 5.4-4.8 4.8L3 7.8z" /><path d="M5.6 5.6h.1" strokeWidth="2" /></>;
    case "merge":
      return <path d="M5 3.4v9.2M5 5.4c0 3 6 2.4 6 5.4v1.8M5 3.4a1.3 1.3 0 1 0 0 .1M11 12.6a1.3 1.3 0 1 0 .1 0M5 12.6a1.3 1.3 0 1 0 .1 0" />;
    case "branchNew":
      return <path d="M5 3.5v9M5 3.5a1.3 1.3 0 1 0 0 .1M5 12.5a1.3 1.3 0 1 0 .1 0M5 8.5c0-2 2-2.8 4-2.8M11.6 3.2v5M9.1 5.7h5" />;
    case "checkout":
      return <path d="M2.8 8h7M7.6 5.4 10.2 8l-2.6 2.6M11.2 3.4h2v9.2h-2" />;
    case "diff":
      return <path d="M3 3.2h4v9.6H3zM9 3.2h4v9.6H9zM4.4 6h1.2M4.4 8.6h1.2M10.4 6h1.2M10.4 10h1.2M11 5.4v1.2" />;
    case "info":
      return <><circle cx="8" cy="8" r="5.4" /><path d="M8 7.4v3.6M8 5v.2" /></>;
    case "save":
      return <><path d="M3 3h8l2 2v8H3z" /><path d="M5.2 3v3h4.6V3M5 13V9.4h6V13" /></>;
    case "check":
      return <><circle cx="8" cy="8" r="5.4" /><path d="M5.6 8.2 7.3 9.8 10.6 6.4" /></>;
    case "close":
      return <path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" />;
    case "wrap":
      return <path d="M2.8 4h10.4M2.8 8h8.2a2 2 0 0 1 0 4H8.6M9.8 10.8 8.4 12l1.4 1.2M2.8 12h3" />;
    case "search":
      return <><circle cx="7" cy="7" r="3.8" /><path d="M9.8 9.8 13.2 13.2" /></>;
    case "palette":
      return (
        <>
          <path d="M8 13.6a5.6 5.6 0 1 1 5.6-5.4c0 1.4-1.1 2.3-2.4 2.3H9.6a1.2 1.2 0 0 0-.7 2.2.9.9 0 0 1-.9.9z" />
          <circle className="dab" cx="5.4" cy="7.2" r="1" style={{ fill: "#ef4444", stroke: "none" }} />
          <circle className="dab" cx="8" cy="5" r="1" style={{ fill: "#f59e0b", stroke: "none" }} />
          <circle className="dab" cx="10.6" cy="7.2" r="1" style={{ fill: "#10b981", stroke: "none" }} />
        </>
      );
    case "brush":
      return <path d="M12.8 2.8 7.4 8.2M6.2 9c-1.6 0-2.6 1.2-2.6 2.6 0 .9-.6 1.4-1 1.6 2.6.6 5.2-.4 5.2-2.6zM7.4 8.2l1.2 1.2" />;
    case "toolbar":
      return <><rect x="2.2" y="3.4" width="11.6" height="9.2" rx="1" /><path d="M2.2 6.6h11.6M4.6 5h.1M6.8 5h.1M9 5h.1" /></>;
    case "key":
      return <><circle cx="5.4" cy="10.4" r="2.6" /><path d="M7.3 8.6 12.6 3.3M10.6 5.3l1.6 1.6M9.2 6.7l1.2 1.2" /></>;
    case "external":
      return <path d="M9 3h4v4M13 3 7.4 8.6M11.4 9.4V13H3V4.6h3.6" />;
    case "user":
      return <><circle cx="8" cy="5.6" r="2.6" /><path d="M3.2 13.2c.6-2.6 2.6-4 4.8-4s4.2 1.4 4.8 4" /></>;
    default:
      return null;
  }
}

export function Flag({ country }: { country: "gb" | "kr" }) {
  return (
    <span className="flag-slot">
      {country === "gb" ? <UnionJack /> : <Taegeukgi />}
    </span>
  );
}

function UnionJack() {
  return (
    <svg className="flag flag-gb" viewBox="0 0 60 30" width="18" height="12" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <clipPath id="flag-gb-bounds"><rect width="60" height="30" /></clipPath>
        <clipPath id="flag-gb-offset"><path d="M30 15h30v15zv15H0zH0V0zV0h30z" /></clipPath>
      </defs>
      <g clipPath="url(#flag-gb-bounds)">
        <path d="M0 0v30h60V0z" fill="#012169" />
        <path d="M0 0 60 30M60 0 0 30" stroke="#fff" strokeWidth="6" />
        <path d="M0 0 60 30M60 0 0 30" clipPath="url(#flag-gb-offset)" stroke="#C8102E" strokeWidth="4" />
        <path d="M-1 11h27v-12h8v12h27v8H34v12h-8V19H-1z" fill="#C8102E" stroke="#FFF" strokeWidth="2" />
      </g>
    </svg>
  );
}

function Taegeukgi() {
  return (
    <svg className="flag flag-kr" viewBox="-72 -48 144 96" width="18" height="12" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path fill="#fff" d="M-72-48v96H72v-96z" />
      <g stroke="#000" strokeWidth="4" fill="none">
        <path transform="rotate(33.69006752598)" d="M-50-12v24m6 0v-24m6 0v24m76 0V1m0-2v-11m6 0v11m0 2v11m6 0V1m0-2v-11" />
        <path transform="rotate(-33.69006752598)" d="M-50-12v24m6 0V1m0-2v-11m6 0v24m76 0V1m0-2v-11m6 0v24m6 0V1m0-2v-11" />
      </g>
      <g transform="rotate(33.69006752598)">
        <path fill="#cd2e3a" d="M12 0a18 18 0 11-36 0 24 24 0 1148 0" />
        <path fill="#0047a0" d="M-24 0a24 24 0 1048 0A12 12 0 100 0a12 12 0 11-24 0" />
      </g>
    </svg>
  );
}
