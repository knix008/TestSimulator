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
  | "print";

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {draw(name)}
    </svg>
  );
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
      return <path d="M3 4.5h10M3 8h10M3 11.5h10M6 4.5v.1M10 8v.1M7 11.5v.1" />;
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
          <circle className="dab" cx="5.7" cy="7.3" r="1.05" style={{ fill: "#ef4444" }} />
          <circle className="dab" cx="8.3" cy="5.1" r="1.05" style={{ fill: "#f59e0b" }} />
          <circle className="dab" cx="10.9" cy="7.3" r="1.05" style={{ fill: "#2563eb" }} />
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
