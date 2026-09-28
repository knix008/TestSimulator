import React from 'react';

// One shared stroke-based icon set. Every icon is a 24×24 line drawing that
// inherits the current text colour, so it works in every theme.
//
// The ICONS map at the bottom exists because menus travel to their own popup
// window as plain data: a row carries an icon *name*, and the window looks the
// component up here. Every menu row therefore has an icon and a label, in both
// the in-page and the detached renderer.
const S = ({ size = 18, children, fill = 'none', ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    {...rest}
  >
    {children}
  </svg>
);

// ── Files ─────────────────────────────────────────────────
export const IconOpen = (p) => (
  <S {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></S>
);
export const IconFolder = IconOpen;
export const IconFolderOpen = (p) => (
  <S {...p}>
    <path d="M3 10h18l-2.2 9.2A1.5 1.5 0 0 1 17.35 20.5H6.65a1.5 1.5 0 0 1-1.45-1.3L3 10z" />
    <path d="M4 7.5h5l2 2" />
  </S>
);
export const IconUrl = (p) => (
  <S {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></S>
);
export const IconRecent = (p) => (
  <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></S>
);
export const IconSave = (p) => (
  <S {...p}><path d="M5 3h11l3 3v15H5z" /><path d="M8 3v6h8V3M8 21v-7h8v7" /></S>
);
export const IconSaveAs = (p) => (
  <S {...p}><path d="M5 3h9l3 3v5" /><path d="M5 3v18h6" /><path d="M8 3v5h6" /><path d="m19 13-5 5v3h3l5-5z" /></S>
);
export const IconExport = (p) => (
  <S {...p}><path d="M7 3h7l5 5v8a2 2 0 0 1-2 2h-3" /><path d="M14 3v5h5" /><path d="M3 15h9M9 12l3 3-3 3" /></S>
);
export const IconPrint = (p) => (
  <S {...p}><path d="M7 9V4h10v5" /><path d="M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" /><rect x="7" y="14" width="10" height="7" rx="1" /></S>
);
export const IconTrash = (p) => (
  <S {...p}><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></S>
);
export const IconDownload = (p) => (
  <S {...p}><path d="M12 3v12M8 11l4 4 4-4M4 20h16" /></S>
);

// ── Books ─────────────────────────────────────────────────
export const IconBook = (p) => (
  <S {...p}><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" /><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5A1.5 1.5 0 0 0 20 18.5z" /><path d="M11 4h2v16h-2z" /></S>
);
export const IconLibrary = (p) => (
  <S {...p}><rect x="3" y="4" width="4" height="16" rx="1" /><rect x="9" y="4" width="4" height="16" rx="1" /><path d="m16 5.5 4 1L18 21l-4-1z" /></S>
);
export const IconContents = (p) => (
  <S {...p}><path d="M4 6h3M4 12h3M4 18h3M10 6h10M10 12h10M10 18h10" /></S>
);
export const IconBookmark = (p) => (
  <S {...p}><path d="M6 4h12v17l-6-4-6 4z" /></S>
);
export const IconBookmarkAdd = (p) => (
  <S {...p}><path d="M6 4h12v17l-6-4-6 4z" /><path d="M12 8v5M9.5 10.5h5" /></S>
);
export const IconHighlight = (p) => (
  <S {...p}><path d="m14 4 6 6-7.5 7.5H7l-1.5-3z" /><path d="M4 21h16" /></S>
);
export const IconNote = (p) => (
  <S {...p}><path d="M5 5h14a1 1 0 0 1 1 1v9l-5 5H6a1 1 0 0 1-1-1z" /><path d="M20 15h-4a1 1 0 0 0-1 1v4M8 9h8M8 13h5" /></S>
);
export const IconComment = (p) => (
  <S {...p}><path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-5l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" /></S>
);
export const IconCover = (p) => (
  <S {...p}><rect x="5" y="3" width="14" height="18" rx="1.5" /><path d="M9 3v18" /><circle cx="14.5" cy="9" r="1.6" /><path d="m11 17 3-3 3 3" /></S>
);

// ── Reading / view ────────────────────────────────────────
export const IconFirst = (p) => (<S {...p}><path d="M18 5v14M15 12l-8 6V6z" /></S>);
export const IconLast = (p) => (<S {...p}><path d="M6 5v14M9 12l8 6V6z" /></S>);
export const IconPrev = (p) => (<S {...p}><path d="m15 5-7 7 7 7" /></S>);
export const IconNext = (p) => (<S {...p}><path d="m9 5 7 7-7 7" /></S>);
export const IconUp = (p) => (<S {...p}><path d="m5 15 7-7 7 7" /></S>);
export const IconDown = (p) => (<S {...p}><path d="m5 9 7 7 7-7" /></S>);
export const IconZoomIn = (p) => (
  <S {...p}><circle cx="11" cy="11" r="7" /><path d="M11 8v6M8 11h6M20 20l-3.6-3.6" /></S>
);
export const IconZoomOut = (p) => (
  <S {...p}><circle cx="11" cy="11" r="7" /><path d="M8 11h6M20 20l-3.6-3.6" /></S>
);
export const IconFitWidth = (p) => (
  <S {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m7 12 2.5-2.5M7 12l2.5 2.5M17 12l-2.5-2.5M17 12l-2.5 2.5M7 12h10" /></S>
);
export const IconFitPage = (p) => (
  <S {...p}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="m12 7-2.5 2.5M12 7l2.5 2.5M12 17l-2.5-2.5M12 17l2.5-2.5M12 7v10" /></S>
);
export const IconFitHeight = (p) => (
  <S {...p}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M12 7v10M9.5 9.5 12 7l2.5 2.5M9.5 14.5 12 17l2.5-2.5" /></S>
);
export const IconActual = (p) => (
  <S {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 15V9l-2 1.5M13 9h3v3h-3v3h3" /></S>
);
export const IconRotateLeft = (p) => (<S {...p}><path d="M4 9a8 8 0 1 1 1.5 7" /><path d="M4 4v5h5" /></S>);
export const IconRotateRight = (p) => (<S {...p}><path d="M20 9A8 8 0 1 0 18.5 16" /><path d="M20 4v5h-5" /></S>);
export const IconScroll = (p) => (
  <S {...p}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h6M9 11h6M9 15h6M12 19.5v.5" /></S>
);
export const IconPaged = (p) => (
  <S {...p}><rect x="3" y="4" width="8" height="16" rx="1.5" /><rect x="13" y="4" width="8" height="16" rx="1.5" /></S>
);
export const IconColumns = (p) => (
  <S {...p}><rect x="3" y="4" width="8" height="16" rx="1.5" /><rect x="13" y="4" width="8" height="16" rx="1.5" /></S>
);
export const IconTextSize = (p) => (
  <S {...p}><path d="M3 18 8 6l5 12M4.6 14h6.8" /><path d="M14 18l3.5-8 3.5 8M15 15.5h5" /></S>
);
export const IconLineHeight = (p) => (
  <S {...p}><path d="M4 5h16M4 12h16M4 19h16" /><path d="M2 7 4 5 6 7M2 17l2 2 2-2" /></S>
);
export const IconInvert = (p) => (
  <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" /></S>
);
export const IconOpacity = (p) => (
  <S {...p}><path d="M12 3 6 10a8 8 0 1 0 12 0z" /><path d="M12 3 6 10a8 8 0 0 0 6 11z" fill="currentColor" stroke="none" opacity="0.45" /></S>
);
export const IconImage = (p) => (
  <S {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.8" /><path d="m4 18 5-5 3.5 3.5L16 13l4 4" /></S>
);
export const IconLayout = (p) => (
  <S {...p}><rect x="4" y="3" width="16" height="8" rx="1.5" /><rect x="4" y="13" width="16" height="8" rx="1.5" /></S>
);
export const IconPanelLeft = (p) => (
  <S {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></S>
);
export const IconPanelRight = (p) => (
  <S {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></S>
);

// ── Editing / clipboard ───────────────────────────────────
export const IconCopy = (p) => (
  <S {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></S>
);
export const IconPaste = (p) => (
  <S {...p}><path d="M9 4h6v3H9z" /><path d="M7 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8" /><rect x="12" y="11" width="9" height="10" rx="1.5" /></S>
);
export const IconSelectAll = (p) => (
  <S {...p}><rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 3" /><path d="M7 9h10M7 13h10M7 17h6" /></S>
);
export const IconUndo = (p) => (<S {...p}><path d="M4 9h11a5 5 0 0 1 0 10h-6" /><path d="m8 5-4 4 4 4" /></S>);
export const IconRedo = (p) => (<S {...p}><path d="M20 9H9a5 5 0 0 0 0 10h6" /><path d="m16 5 4 4-4 4" /></S>);
export const IconSearch = (p) => (<S {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></S>);
export const IconText = (p) => (
  <S {...p}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></S>
);

// ── App ───────────────────────────────────────────────────
export const IconSettings = (p) => (
  <S {...p}><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.1a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></S>
);
export const IconInfo = (p) => (<S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.6v.6" /></S>);
export const IconAlert = (p) => (<S {...p}><path d="M12 3.5 22 20H2z" /><path d="M12 10v4M12 17v.6" /></S>);
export const IconCheck = (p) => (<S {...p}><path d="m5 12.5 4.5 4.5L19 7" /></S>);
export const IconClose = (p) => (<S {...p}><path d="M6 6l12 12M18 6 6 18" /></S>);
export const IconClip = (p) => (
  <S {...p}><path d="M15 7 8.5 13.5a2.5 2.5 0 0 0 3.5 3.5L19 10a4.5 4.5 0 0 0-6.4-6.4L5.5 10.7a6.5 6.5 0 0 0 9.2 9.2L20 14.6" /></S>
);
export const IconTheme = (p) => (
  <S {...p}>
    <path d="M12 3.6c-4.6 0-8.4 3.5-8.4 7.9 0 3.2 2.1 5.8 5.1 5.8h1.3c.8 0 1.3.7 1 1.5-.3.8.3 1.6 1.1 1.6 4.1 0 7.7-3.9 7.7-9 0-4.1-3.4-7.8-7.8-7.8z" />
    <circle cx="8.2" cy="10.2" r="1.05" fill="currentColor" stroke="none" />
    <circle cx="11.4" cy="7.8" r="1.05" fill="currentColor" stroke="none" />
    <circle cx="15.2" cy="8.6" r="1.05" fill="currentColor" stroke="none" />
    <circle cx="16.2" cy="12.2" r="1.05" fill="currentColor" stroke="none" />
  </S>
);
export const IconChevron = ({ className = '', ...p }) => (
  <S {...p} className={`chev ${className}`}><path d="m9 5 7 7-7 7" /></S>
);
export const IconExpandAll = (p) => (<S {...p}><path d="m7 9 5 5 5-5" /><path d="m7 4 5 5 5-5" /></S>);
export const IconCollapseAll = (p) => (<S {...p}><path d="m7 15 5-5 5 5" /><path d="m7 20 5-5 5 5" /></S>);
export const IconMinimize = (p) => (<S {...p} size={p.size || 14}><path d="M5 12h14" /></S>);
export const IconMaximize = (p) => (<S {...p} size={p.size || 14}><rect x="5" y="5" width="14" height="14" rx="1.5" /></S>);
export const IconRestore = (p) => (
  <S {...p} size={p.size || 14}><rect x="4" y="8" width="12" height="12" rx="1.5" /><path d="M8 8V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-3" /></S>
);
export const IconKeyboard = (p) => (
  <S {...p}><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" /></S>
);

// Language flags. Filled 3:2 rectangles so they stay readable at toolbar size.
function FlagSvg({ size = 18, children, ...rest }) {
  const w = Number(size) || 18;
  const h = Math.max(8, Math.round(w * 2 / 3));
  return (
    <svg width={w} height={h} viewBox="0 0 36 24" className="lang-flag" aria-hidden="true" focusable="false" {...rest}>
      {children}
    </svg>
  );
}

export const FlagKo = (p) => (
  <FlagSvg {...p}>
    <rect width="36" height="24" rx="2.2" fill="#fff" />
    <g transform="translate(18 12)">
      <circle r="6.4" fill="#CD2E3A" />
      <path d="M0-6.4A6.4 6.4 0 0 1 0 6.4A3.2 3.2 0 0 1 0 0A3.2 3.2 0 0 0 0-6.4Z" fill="#0047A0" />
      <circle cy="-3.2" r="3.2" fill="#CD2E3A" />
      <circle cy="3.2" r="3.2" fill="#0047A0" />
    </g>
    <rect width="36" height="24" rx="2.2" fill="none" stroke="rgba(0,0,0,0.22)" strokeWidth="1" />
  </FlagSvg>
);

export const FlagEn = (p) => (
  <FlagSvg {...p}>
    <rect width="36" height="24" rx="2.2" fill="#012169" />
    <path d="M0 0L36 24M36 0L0 24" stroke="#fff" strokeWidth="5.2" />
    <path d="M0 0L36 24M36 0L0 24" stroke="#C8102E" strokeWidth="2.2" />
    <rect x="14.4" width="7.2" height="24" fill="#fff" />
    <rect y="8.4" width="36" height="7.2" fill="#fff" />
    <rect x="15.6" width="4.8" height="24" fill="#C8102E" />
    <rect y="9.6" width="36" height="4.8" fill="#C8102E" />
    <rect width="36" height="24" rx="2.2" fill="none" stroke="rgba(0,0,0,0.22)" strokeWidth="1" />
  </FlagSvg>
);

export function IconFlag({ lang = 'ko', ...p }) {
  return lang === 'en' ? <FlagEn {...p} /> : <FlagKo {...p} />;
}

/**
 * Name → component, for menus and dialogs that travel as data.
 * A missing name renders the neutral dot rather than nothing, so a row without
 * a matching icon still lines up with the rest.
 */
export const ICONS = {
  open: IconOpen, folder: IconFolder, folderOpen: IconFolderOpen, url: IconUrl,
  recent: IconRecent, save: IconSave, saveAs: IconSaveAs, export: IconExport,
  print: IconPrint, trash: IconTrash, download: IconDownload,
  book: IconBook, library: IconLibrary, contents: IconContents,
  bookmark: IconBookmark, bookmarkAdd: IconBookmarkAdd, highlight: IconHighlight,
  note: IconNote, comment: IconComment, cover: IconCover,
  first: IconFirst, last: IconLast, prev: IconPrev, next: IconNext,
  up: IconUp, down: IconDown, zoomIn: IconZoomIn, zoomOut: IconZoomOut,
  fitWidth: IconFitWidth, fitPage: IconFitPage, fitHeight: IconFitHeight, actual: IconActual,
  rotateLeft: IconRotateLeft, rotateRight: IconRotateRight,
  scroll: IconScroll, paged: IconPaged, columns: IconColumns,
  textSize: IconTextSize, lineHeight: IconLineHeight, invert: IconInvert,
  opacity: IconOpacity, image: IconImage, layout: IconLayout,
  panelLeft: IconPanelLeft, panelRight: IconPanelRight,
  copy: IconCopy, paste: IconPaste, selectAll: IconSelectAll,
  undo: IconUndo, redo: IconRedo, search: IconSearch, text: IconText,
  settings: IconSettings, info: IconInfo, alert: IconAlert, check: IconCheck,
  close: IconClose, clip: IconClip, theme: IconTheme, keyboard: IconKeyboard,
};

export function iconByName(name) {
  return ICONS[name] || IconCheck;
}
