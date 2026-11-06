// Minimal inline SVG icon set (stroke-based, inherit currentColor).
import React from 'react';

const S = ({ children, size = 18, color, tint }) => (
  <svg className="icon-color" width={size} height={size} viewBox="0 0 24 24" fill={tint ? 'currentColor' : 'none'} fillOpacity={tint ? 0.2 : undefined}
    stroke="currentColor" strokeOpacity="1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color }}>
    {children}
  </svg>
);

export const IconFolder = (p) => <S color="#e5a50a" tint {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></S>;
export const IconFilePlus = (p) => <S color="#3b82f6" tint {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M12 12v6M9 15h6" /></S>;
export const IconMerge = (p) => <S color="#f07d13" {...p}><path d="M7 3v6a5 5 0 0 0 5 5 5 5 0 0 1 5 5v2" /><path d="M17 3v6" /><path d="m14 6 3-3 3 3" /><path d="M7 21v-4" /></S>;
export const IconHash = (p) => <S color="#8b5cf6" {...p}><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" /></S>;
export const IconSave = (p) => <S color="#14b8a6" {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></S>;
export const IconExport = (p) => <S color="#e0559b" {...p}><path d="M12 3v12M8 7l4-4 4 4" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></S>;
export const IconChevron = (p) => <S color="#64748b" {...p}><path d="m6 9 6 6 6-6" /></S>;
const DocBase = ({ children, size }) => <S size={size} color="#0ea5e9" tint><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" />{children}</S>;
export const IconMd = ({ size } = {}) => <DocBase size={size}><path d="M8.5 17v-3l1.4 1.6L11.3 14v3M14 14v3M14 17l1.4-1.4M14 17l-1.2-1.2" /></DocBase>;
export const IconHtml = (p) => <S color="#6366f1" {...p}><path d="m9 9-3 3 3 3M15 9l3 3-3 3" /><rect x="3" y="4" width="18" height="16" rx="2" /></S>;
export const IconPdf = ({ size } = {}) => <DocBase size={size}><path d="M8.5 17v-3h1a1 1 0 0 1 0 2h-1M13 14v3M13 14h1.5M13 15.4h1.2" /></DocBase>;
export const IconWord = ({ size } = {}) => <DocBase size={size}><path d="M8 14l1 3 1.2-2.2L11.4 17l1-3" /></DocBase>;
export const IconSaveAs = (p) => <S color="#0ea5e9" {...p}><path d="M19 13V5a2 2 0 0 0-.6-1.4L16 1.2A2 2 0 0 0 14.6.6H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6" /><path d="M15 18.5h6M18 15.5v6" /><path d="M7 .6v5h7" /></S>;
export const IconPrinter = (p) => <S color="#65a30d" {...p}><path d="M6 9V3h12v6" /><path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="7" rx="1" /></S>;
export const IconTrash = (p) => <S color="#e5484d" tint {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" /></S>;
export const IconInfo = (p) => <S color="#0ea5e9" tint {...p}><circle cx="12" cy="12" r="9" /><path d="M12 16v-5M12 8h.01" /></S>;
export const IconSettings = (p) => <S color="#64748b" tint {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></S>;
export const IconCheck = (p) => <S color="#22a55b" {...p}><path d="M20 6 9 17l-5-5" /></S>;
export const IconCheckSquare = (p) => <S color="#14b8a6" {...p}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></S>;
export const IconSquare = (p) => <S color="#e0559b" {...p}><rect x="3" y="3" width="18" height="18" rx="2" /></S>;
export const IconCopy = (p) => <S color="#6366f1" tint {...p}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></S>;
export const IconCut = (p) => <S color="#6366f1" {...p}><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12" /></S>;
export const IconPaste = (p) => <S color="#0ea5e9" {...p}><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /></S>;
export const IconSelectAll = (p) => <S color="#6366f1" {...p}><rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 3" /><path d="M9 12l2 2 4-4" /></S>;
export const IconTarget = (p) => <S color="#3b82f6" {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></S>;
export const IconGrip = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="9" cy="5" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="9" cy="19" r="1.6" />
    <circle cx="15" cy="5" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="15" cy="19" r="1.6" />
  </svg>
);
export const IconUp = (p) => <S color="#22a55b" {...p}><path d="m18 15-6-6-6 6" /></S>;
export const IconDown = (p) => <S color="#f07d13" {...p}><path d="m6 9 6 6 6-6" /></S>;
export const IconX = (p) => <S color="#e5484d" {...p}><path d="M18 6 6 18M6 6l12 12" /></S>;
export const IconSun = (p) => <S color="#14b8a6" {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></S>;
export const IconMoon = (p) => <S color="#e0559b" {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></S>;
export const IconRefresh = (p) => <S color="#22a55b" {...p}><path d="M21 12a9 9 0 1 1-2.2-5.8" /><path d="M21 3v6h-6" /></S>;
// Per-theme toolbar icons (one distinct glyph per theme).
export const IconStars = (p) => <S color="#6366f1" {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /><path d="M18 3.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z" /></S>;
export const IconSnow = (p) => <S color="#0ea5e9" {...p}><path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19" /><path d="M12 6l-2 1.6M12 6l2 1.6M12 18l-2-1.6M12 18l2-1.6M6 12l1.6-2M6 12l1.6 2M18 12l-1.6-2M18 12l-1.6 2" /></S>;
export const IconLeaf = (p) => <S color="#65a30d" {...p}><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z" /><path d="M2 21c0-3 1.85-5.36 5.08-6" /></S>;
export const IconFlower = (p) => <S color="#3b82f6" {...p}><path d="M12 21s-6-3.8-8.4-7.5C2 11 3.6 8 6.5 8c1.8 0 3 1.2 5.5 3.6C14.5 9.2 15.7 8 17.5 8c2.9 0 4.5 3 2.9 5.5C18 17.2 12 21 12 21z" /></S>;
export const IconSunrise = (p) => <S color="#22a55b" {...p}><path d="M17 18a5 5 0 0 0-10 0" /><path d="M12 2v7M4.2 10.2l1.4 1.4M1 18h2M21 18h2M18.4 11.6l1.4-1.4M23 22H1M8 6l4-4 4 4" /></S>;
export const IconContrast = (p) => <S color="#8b5cf6" tint {...p}><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" /></S>;
export const IconPaper = (p) => <S color="#8b5cf6" {...p}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></S>;
export const IconDroplet = (p) => <S color="#14b8a6" {...p}><path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z" /></S>;
export const IconCoffee = (p) => <S color="#e0559b" {...p}><path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" /><path d="M17 9h2a2.5 2.5 0 0 1 0 5h-2" /><path d="M7 2v2.5M11 2v2.5" /></S>;
export const IconCloud = (p) => <S color="#e5a50a" {...p}><path d="M17.5 19a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.7-1.5A4 4 0 0 0 6.5 19z" /></S>;
export const IconGlobe = (p) => <S color="#6366f1" {...p}><circle cx="12" cy="12" r="9" /><path d="M3.5 9h17M3.5 15h17M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18" /></S>;
export const IconBulb = (p) => <S color="#0ea5e9" {...p}><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.3 1 2.5h6c0-1.2.3-1.8 1-2.5A6 6 0 0 0 12 3z" /></S>;
export const IconCalendar = (p) => <S color="#65a30d" {...p}><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></S>;
export const IconClock = (p) => <S color="#3b82f6" {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></S>;

// ── Markdown formatting toolbar ──────────────────────────
export const IconBold = (p) => <S color="#22a55b" {...p}><path d="M7 5h6a3.5 3.5 0 0 1 0 7H7z" /><path d="M7 12h7.5a3.5 3.5 0 0 1 0 7H7z" /></S>;
export const IconItalic = (p) => <S color="#f07d13" {...p}><path d="M19 5h-7M12 19H5M15 5 9 19" /></S>;
export const IconStrike = (p) => <S color="#8b5cf6" {...p}><path d="M5 12h14M8 8a3 3 0 0 1 3-2.5h2A3 3 0 0 1 16 8M8 16a3 3 0 0 0 3 2.5h2a3 3 0 0 0 3-2.5" /></S>;
export const IconUndo = (p) => <S color="#14b8a6" {...p}><path d="M9 7 4 12l5 5" /><path d="M4 12h11a5 5 0 0 1 0 10h-1" /></S>;
export const IconRedo = (p) => <S color="#e0559b" {...p}><path d="m15 7 5 5-5 5" /><path d="M20 12H9a5 5 0 0 0 0 10h1" /></S>;
export const IconUnderline = (p) => <S color="#e5a50a" {...p}><path d="M7 5v6a5 5 0 0 0 10 0V5M5 21h14" /></S>;
export const IconHeading = (p) => <S color="#6366f1" {...p}><path d="M6 5v14M18 5v14M6 12h12" /></S>;
export const IconList = (p) => <S color="#0ea5e9" {...p}><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4" cy="6" r="1.2" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1.2" fill="currentColor" stroke="none" /></S>;
export const IconListOrdered = (p) => <S color="#65a30d" {...p}><path d="M10 6h10M10 12h10M10 18h10" /><path d="M4 4.5V8M3 15h2l-2 3h2M3 6h1" /></S>;
export const IconChecklist = (p) => <S color="#3b82f6" {...p}><path d="M11 6h9M11 12h9M11 18h9" /><path d="M3 6l1.3 1.3L6.7 5M3 12l1.3 1.3L6.7 11M3 18l1.3 1.3L6.7 17" /></S>;
export const IconQuote = (p) => <S color="#22a55b" {...p}><path d="M6 7h4v5a4 4 0 0 1-4 4M14 7h4v5a4 4 0 0 1-4 4" /></S>;
export const IconCode = (p) => <S color="#f07d13" {...p}><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" /></S>;
export const IconLink = (p) => <S color="#8b5cf6" {...p}><path d="M10 13a5 5 0 0 0 7.1 0l2-2A5 5 0 0 0 12 4l-1 1" /><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20l1-1" /></S>;
export const IconTable = (p) => <S color="#14b8a6" {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16M15 4v16" /></S>;
export const IconRule = (p) => <S color="#e0559b" {...p}><path d="M4 12h16M6 8h2M16 8h2M6 16h2M16 16h2" /></S>;
export const IconImage = (p) => <S color="#e5a50a" {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></S>;

// Window controls
export const IconWinMin = (p) => <S color="#e5a50a" {...p} size={14}><path d="M5 12h14" /></S>;
export const IconWinMax = (p) => <S color="#22a55b" {...p} size={14}><rect x="5" y="5" width="14" height="14" rx="1" /></S>;
export const IconWinRestore = (p) => <S color="#22a55b" {...p} size={14}><rect x="7" y="7" width="11" height="11" rx="1" /><path d="M7 7V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-2" /></S>;
export const IconWinClose = (p) => <S color="#e5484d" {...p} size={14}><path d="M18 6 6 18M6 6l12 12" /></S>;

// Language toggle flags. These keep their own colors; they are the language
// the button will switch to, not the language currently in use.
function Flag({ children, width = 26 }) {
  const height = Math.round(width * 2 / 3);
  return (
    <svg className="lang-flag" width={width} height={height} viewBox="0 0 60 40" aria-hidden="true">
      {children}
    </svg>
  );
}

export function IconFlagUK({ width = 26 } = {}) {
  return (
    <Flag width={width}>
      <clipPath id="flag-uk">
        <rect width="60" height="40" rx="2" />
      </clipPath>
      <g clipPath="url(#flag-uk)">
        <rect width="60" height="40" fill="#012169" />
        <path d="M0 0 L60 40 M60 0 L0 40" stroke="#fff" strokeWidth="8" />
        <path d="M0 0 L60 40 M60 0 L0 40" stroke="#C8102E" strokeWidth="4" />
        <path d="M30 0 V40 M0 20 H60" stroke="#fff" strokeWidth="14" />
        <path d="M30 0 V40 M0 20 H60" stroke="#C8102E" strokeWidth="8" />
      </g>
    </Flag>
  );
}

function Bars({ broken = [false, false, false] }) {
  return broken.map((isBroken, i) => (
    isBroken
      ? <g key={i}><rect x="-6" y={-4.2 + i * 3.2} width="4.6" height="1.6" /><rect x="1.4" y={-4.2 + i * 3.2} width="4.6" height="1.6" /></g>
      : <rect key={i} x="-6" y={-4.2 + i * 3.2} width="12" height="1.6" />
  ));
}

export function IconFlagKR({ width = 26 } = {}) {
  return (
    <Flag width={width}>
      <rect width="60" height="40" rx="3" fill="#fff" stroke="#c5c5c5" strokeWidth="1" />
      <g transform="translate(30 20)" fill="#141414">
        <g transform="translate(-16 -9) rotate(56)"><Bars /></g>
        <g transform="translate(16 -9) rotate(-56)"><Bars broken={[true, false, true]} /></g>
        <g transform="translate(-16 9) rotate(-56)"><Bars broken={[false, true, false]} /></g>
        <g transform="translate(16 9) rotate(56)"><Bars broken={[true, true, true]} /></g>
      </g>
      <g transform="translate(30 20)">
        <circle r="8.2" fill="#CD2E3A" />
        <path d="M0-8.2a8.2 8.2 0 0 0 0 16.4 4.1 4.1 0 0 0 0-8.2 4.1 4.1 0 0 1 0-8.2z" fill="#0047A0" />
      </g>
    </Flag>
  );
}

// ── Archive icons ────────────────────────────────────────────────────────────
export const IconArchive = (p) => <S color="#f07d13" tint {...p}><path d="M21 8v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8" /><rect x="1.5" y="3" width="21" height="5" rx="1" /><path d="M10 12h4" /></S>;
export const IconPack = (p) => <S color="#22a55b" tint {...p}><path d="M12 3v9" /><path d="m8.5 8.5 3.5 3.5 3.5-3.5" /><path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6" /><path d="M9 16h6" /></S>;
export const IconUnpack = (p) => <S color="#3b82f6" tint {...p}><path d="M12 12V3" /><path d="m8.5 6.5 3.5-3.5 3.5 3.5" /><path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6" /><path d="M9 16h6" /></S>;
export const IconTest = (p) => <S color="#14b8a6" tint {...p}><path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></S>;
export const IconRepair = (p) => <S color="#f07d13" tint {...p}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3 17.7V21h3.3l6.3-6.3a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.5-.6-.6-2.5z" /></S>;
export const IconConvert = (p) => <S color="#8b5cf6" {...p}><path d="M4 8h14" /><path d="m14 4 4 4-4 4" /><path d="M20 16H6" /><path d="m10 12-4 4 4 4" /></S>;
export const IconTools = (p) => <S color="#e0559b" {...p}><path d="M4 7h16M4 12h16M4 17h10" /><circle cx="18" cy="17" r="2" /></S>;
export const IconKey = (p) => <S color="#e5a50a" tint {...p}><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8M16 7l3 3M14 9l2 2" /></S>;
export const IconLock = (p) => <S color="#e5a50a" tint {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></S>;
export const IconFile = (p) => <S color="#0ea5e9" tint {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></S>;
export const IconFolderOpen = (p) => <S color="#e5a50a" tint {...p}><path d="M3 8V6a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1" /><path d="M3 19 5.5 10h15.8a1 1 0 0 1 1 1.3L20 19a2 2 0 0 1-2 1.5H5A2 2 0 0 1 3 19z" /></S>;
export const IconFolderPlus = (p) => <S color="#f07d13" tint {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M12 11v5M9.5 13.5h5" /></S>;
export const IconEdit = (p) => <S color="#14b8a6" tint {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></S>;
export const IconEye = (p) => <S color="#0ea5e9" tint {...p}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></S>;
export const IconExternal = (p) => <S color="#0ea5e9" {...p}><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></S>;
export const IconSplit = (p) => <S color="#f07d13" tint {...p}><path d="M12 3v18" strokeDasharray="3 3" /><path d="M8 7H4v10h4" /><path d="M16 7h4v10h-4" /></S>;
export const IconJoin = (p) => <S color="#14b8a6" tint {...p}><path d="M4 7v10h16V7z" /><path d="M12 7v10" strokeDasharray="2 3" /></S>;
export const IconGauge = (p) => <S color="#e0559b" {...p}><path d="M4 18a9 9 0 1 1 16 0" /><path d="m12 14 4-5" /><circle cx="12" cy="14" r="1.2" /></S>;
export const IconBack = (p) => <S color="#3b82f6" {...p}><path d="m12 19-7-7 7-7" /><path d="M5 12h14" /></S>;
export const IconHome = (p) => <S color="#22a55b" tint {...p}><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /></S>;
export const IconDrive = (p) => <S color="#64748b" tint {...p}><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M5.5 13 8 5h8l2.5 8" /><path d="M7 16.5h.01" /></S>;
export const IconDownload = (p) => <S color="#3b82f6" {...p}><path d="M12 4v11" /><path d="m7.5 11 4.5 4.5 4.5-4.5" /><path d="M4 20h16" /></S>;
export const IconComment = (p) => <S color="#6366f1" tint {...p}><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></S>;
export const IconClose2 = (p) => <S color="#e5484d" tint {...p}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="m9 9 6 6M15 9l-6 6" /></S>;
export const IconPanelLeft = (p) => <S color="#0ea5e9" tint {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></S>;
export const IconPanelRight = (p) => <S color="#8b5cf6" tint {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></S>;
export const IconArrowLeft = (p) => <S color="#64748b" {...p}><path d="m15 6-6 6 6 6" /></S>;
export const IconArrowRight = (p) => <S color="#64748b" {...p}><path d="m9 6 6 6-6 6" /></S>;
// A panel beside an arrow: which panel, and whether it goes or comes.
const leftPane = <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>;
const rightPane = <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></>;
export const IconCollapseLeftPanel = (p) => <S color="#0ea5e9" {...p}>{leftPane}<path d="m16 9-3 3 3 3" /></S>;
export const IconExpandLeftPanel = (p) => <S color="#0ea5e9" {...p}>{leftPane}<path d="m13 9 3 3-3 3" /></S>;
export const IconCollapseRightPanel = (p) => <S color="#8b5cf6" {...p}>{rightPane}<path d="m8 9 3 3-3 3" /></S>;
export const IconExpandRightPanel = (p) => <S color="#8b5cf6" {...p}>{rightPane}<path d="m11 9-3 3 3 3" /></S>;
export const IconPlaces = (p) => <S color="#e5484d" tint {...p}><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></S>;
export const IconHelp = (p) => <S color="#3b82f6" tint {...p}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.2-2.5 3.9" /><path d="M12 17.2h.01" /></S>;
// A painter's palette: its dabs keep their own colours on every theme.
export const IconPalette = ({ size = 18 }) => (
  <svg className="icon-color" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ color: '#c98d4e' }}>
    <path d="M12 2.5C6.5 2.5 2 6.6 2 11.8c0 5 4.2 9.7 9 9.7 1.6 0 2.5-1 2.5-2.2 0-.6-.2-1.1-.6-1.6-.4-.5-.6-1-.6-1.5 0-1.2 1-2.1 2.2-2.1h2.3c3 0 4.7-1.9 4.7-4.3C21.5 5.9 17.3 2.5 12 2.5z" fill="#c98d4e" stroke="#7d5226" strokeWidth="1.2" strokeLinejoin="round" />
    <circle cx="7" cy="10.5" r="1.9" fill="#e5484d" />
    <circle cx="10.5" cy="6.6" r="1.9" fill="#f5c518" />
    <circle cx="15.5" cy="6.6" r="1.9" fill="#22a55b" />
    <circle cx="18.6" cy="10.4" r="1.7" fill="#3b82f6" />
    <circle cx="7.6" cy="15.3" r="1.7" fill="#8b5cf6" />
  </svg>
);
