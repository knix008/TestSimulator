// Minimal inline SVG icon set (stroke-based, inherit currentColor).
import React from 'react';

const S = ({ children, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

export const IconFolder = (p) => <S {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></S>;
export const IconFilePlus = (p) => <S {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M12 12v6M9 15h6" /></S>;
export const IconMerge = (p) => <S {...p}><path d="M7 3v6a5 5 0 0 0 5 5 5 5 0 0 1 5 5v2" /><path d="M17 3v6" /><path d="m14 6 3-3 3 3" /><path d="M7 21v-4" /></S>;
export const IconHash = (p) => <S {...p}><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" /></S>;
export const IconSave = (p) => <S {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></S>;
export const IconExport = (p) => <S {...p}><path d="M12 3v12M8 7l4-4 4 4" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></S>;
export const IconChevron = (p) => <S {...p}><path d="m6 9 6 6 6-6" /></S>;
const DocBase = ({ children, size }) => <S size={size}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" />{children}</S>;
export const IconMd = ({ size } = {}) => <DocBase size={size}><path d="M8.5 17v-3l1.4 1.6L11.3 14v3M14 14v3M14 17l1.4-1.4M14 17l-1.2-1.2" /></DocBase>;
export const IconHtml = (p) => <S {...p}><path d="m9 9-3 3 3 3M15 9l3 3-3 3" /><rect x="3" y="4" width="18" height="16" rx="2" /></S>;
export const IconPdf = ({ size } = {}) => <DocBase size={size}><path d="M8.5 17v-3h1a1 1 0 0 1 0 2h-1M13 14v3M13 14h1.5M13 15.4h1.2" /></DocBase>;
export const IconWord = ({ size } = {}) => <DocBase size={size}><path d="M8 14l1 3 1.2-2.2L11.4 17l1-3" /></DocBase>;
export const IconTrash = (p) => <S {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" /></S>;
export const IconInfo = (p) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 16v-5M12 8h.01" /></S>;
export const IconSettings = (p) => <S {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></S>;
export const IconCheck = (p) => <S {...p}><path d="M20 6 9 17l-5-5" /></S>;
export const IconCheckSquare = (p) => <S {...p}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></S>;
export const IconSquare = (p) => <S {...p}><rect x="3" y="3" width="18" height="18" rx="2" /></S>;
export const IconCopy = (p) => <S {...p}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></S>;
export const IconCut = (p) => <S {...p}><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12" /></S>;
export const IconPaste = (p) => <S {...p}><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /></S>;
export const IconSelectAll = (p) => <S {...p}><rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 3" /><path d="M9 12l2 2 4-4" /></S>;
export const IconTarget = (p) => <S {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></S>;
export const IconGrip = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="9" cy="5" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="9" cy="19" r="1.6" />
    <circle cx="15" cy="5" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="15" cy="19" r="1.6" />
  </svg>
);
export const IconUp = (p) => <S {...p}><path d="m18 15-6-6-6 6" /></S>;
export const IconDown = (p) => <S {...p}><path d="m6 9 6 6 6-6" /></S>;
export const IconX = (p) => <S {...p}><path d="M18 6 6 18M6 6l12 12" /></S>;
export const IconSun = (p) => <S {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></S>;
export const IconMoon = (p) => <S {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></S>;
// Per-theme toolbar icons (one distinct glyph per theme).
export const IconStars = (p) => <S {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /><path d="M18 3.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z" /></S>;
export const IconSnow = (p) => <S {...p}><path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19" /><path d="M12 6l-2 1.6M12 6l2 1.6M12 18l-2-1.6M12 18l2-1.6M6 12l1.6-2M6 12l1.6 2M18 12l-1.6-2M18 12l-1.6 2" /></S>;
export const IconLeaf = (p) => <S {...p}><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z" /><path d="M2 21c0-3 1.85-5.36 5.08-6" /></S>;
export const IconFlower = (p) => <S {...p}><path d="M12 21s-6-3.8-8.4-7.5C2 11 3.6 8 6.5 8c1.8 0 3 1.2 5.5 3.6C14.5 9.2 15.7 8 17.5 8c2.9 0 4.5 3 2.9 5.5C18 17.2 12 21 12 21z" /></S>;
export const IconSunrise = (p) => <S {...p}><path d="M17 18a5 5 0 0 0-10 0" /><path d="M12 2v7M4.2 10.2l1.4 1.4M1 18h2M21 18h2M18.4 11.6l1.4-1.4M23 22H1M8 6l4-4 4 4" /></S>;
export const IconContrast = (p) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" /></S>;
export const IconPaper = (p) => <S {...p}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></S>;
export const IconDroplet = (p) => <S {...p}><path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z" /></S>;
export const IconCoffee = (p) => <S {...p}><path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" /><path d="M17 9h2a2.5 2.5 0 0 1 0 5h-2" /><path d="M7 2v2.5M11 2v2.5" /></S>;
export const IconCloud = (p) => <S {...p}><path d="M17.5 19a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.7-1.5A4 4 0 0 0 6.5 19z" /></S>;
export const IconGlobe = (p) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M3.5 9h17M3.5 15h17M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18" /></S>;
export const IconBulb = (p) => <S {...p}><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.3 1 2.5h6c0-1.2.3-1.8 1-2.5A6 6 0 0 0 12 3z" /></S>;
export const IconCalendar = (p) => <S {...p}><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></S>;
export const IconClock = (p) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></S>;

// ── Markdown formatting toolbar ──────────────────────────
export const IconBold = (p) => <S {...p}><path d="M7 5h6a3.5 3.5 0 0 1 0 7H7z" /><path d="M7 12h7.5a3.5 3.5 0 0 1 0 7H7z" /></S>;
export const IconItalic = (p) => <S {...p}><path d="M19 5h-7M12 19H5M15 5 9 19" /></S>;
export const IconHeading = (p) => <S {...p}><path d="M6 5v14M18 5v14M6 12h12" /></S>;
export const IconList = (p) => <S {...p}><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4" cy="6" r="1.2" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1.2" fill="currentColor" stroke="none" /></S>;
export const IconListOrdered = (p) => <S {...p}><path d="M10 6h10M10 12h10M10 18h10" /><path d="M4 4.5V8M3 15h2l-2 3h2M3 6h1" /></S>;
export const IconChecklist = (p) => <S {...p}><path d="M11 6h9M11 12h9M11 18h9" /><path d="M3 6l1.3 1.3L6.7 5M3 12l1.3 1.3L6.7 11M3 18l1.3 1.3L6.7 17" /></S>;
export const IconQuote = (p) => <S {...p}><path d="M6 7h4v5a4 4 0 0 1-4 4M14 7h4v5a4 4 0 0 1-4 4" /></S>;
export const IconCode = (p) => <S {...p}><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" /></S>;
export const IconLink = (p) => <S {...p}><path d="M10 13a5 5 0 0 0 7.1 0l2-2A5 5 0 0 0 12 4l-1 1" /><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20l1-1" /></S>;
export const IconTable = (p) => <S {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16M15 4v16" /></S>;
export const IconRule = (p) => <S {...p}><path d="M4 12h16M6 8h2M16 8h2M6 16h2M16 16h2" /></S>;

// Window controls
export const IconWinMin = (p) => <S {...p} size={14}><path d="M5 12h14" /></S>;
export const IconWinMax = (p) => <S {...p} size={14}><rect x="5" y="5" width="14" height="14" rx="1" /></S>;
export const IconWinRestore = (p) => <S {...p} size={14}><rect x="7" y="7" width="11" height="11" rx="1" /><path d="M7 7V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-2" /></S>;
export const IconWinClose = (p) => <S {...p} size={14}><path d="M18 6 6 18M6 6l12 12" /></S>;
