import React from 'react';

// One shared stroke-based icon set. Every icon is a 24×24 line drawing that
// inherits the current text colour, so it works in every theme.
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

export const IconOpen = (p) => (
  <S {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></S>
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
  <S {...p}><path d="M5 3h9l3 3v6" /><path d="M5 3v18h6" /><path d="M8 3v5h6" /><path d="m20 14-6 6v3h3l6-6z" transform="translate(-2 -1) scale(0.9)" /></S>
);
export const IconCopy = (p) => (
  <S {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></S>
);
// I-beam over a line of text: the "select text" tool.
export const IconSelectText = (p) => (
  <S {...p}><path d="M9 5h6M9 19h6M12 5v14" /><path d="M4 9V7h3M20 9V7h-3M4 15v2h3M20 15v2h-3" /></S>
);
export const IconSelectAll = (p) => (
  <S {...p}><rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 3" /><path d="M7 9h10M7 13h10M7 17h6" /></S>
);
export const IconMarquee = (p) => (
  <S {...p}><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><rect x="8" y="8" width="8" height="8" rx="1" strokeDasharray="2 2" /></S>
);
export const IconImage = (p) => (
  <S {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.8" /><path d="m4 18 5-5 3.5 3.5L16 13l4 4" /></S>
);
export const IconText = (p) => (
  <S {...p}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></S>
);
export const IconUndo = (p) => (
  <S {...p}><path d="M4 9h11a5 5 0 0 1 0 10h-6" /><path d="m8 5-4 4 4 4" /></S>
);
export const IconRedo = (p) => (
  <S {...p}><path d="M20 9H9a5 5 0 0 0 0 10h6" /><path d="m16 5 4 4-4 4" /></S>
);
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
  <S {...p}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="m12 7 -2.5 2.5M12 7l2.5 2.5M12 17l-2.5-2.5M12 17l2.5-2.5M12 7v10" /></S>
);
export const IconActual = (p) => (
  <S {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 15V9l-2 1.5M13 9h3v3h-3v3h3" /></S>
);
export const IconRotateLeft = (p) => (
  <S {...p}><path d="M4 9a8 8 0 1 1 1.5 7" /><path d="M4 4v5h5" /></S>
);
export const IconRotateRight = (p) => (
  <S {...p}><path d="M20 9A8 8 0 1 0 18.5 16" /><path d="M20 4v5h-5" /></S>
);
export const IconSearch = (p) => (
  <S {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></S>
);
export const IconSidebar = (p) => (
  <S {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></S>
);
export const IconHighlight = (p) => (
  <S {...p}><path d="m14 4 6 6-7.5 7.5H7l-1.5-3z" /><path d="M4 21h16" /></S>
);
export const IconSettings = (p) => (
  <S {...p}><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.1a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></S>
);
export const IconInfo = (p) => (
  <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.6v.6" /></S>
);
export const IconLang = (p) => (
  <S {...p}><path d="M3 6h11M8.5 4v2c0 4-2 7-5.5 9M6 12c1.6 3 4 4.8 7 5.6" /><path d="m13 21 4.2-10 4.2 10M14.6 17.5h5.2" /></S>
);
export const IconTheme = (p) => (
  <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" /></S>
);
export const IconFirst = (p) => (<S {...p}><path d="M18 5v14M15 12l-8 6V6z" /></S>);
export const IconLast = (p) => (<S {...p}><path d="M6 5v14M9 12l8 6V6z" /></S>);
export const IconPrev = (p) => (<S {...p}><path d="m15 5-7 7 7 7" /></S>);
export const IconNext = (p) => (<S {...p}><path d="m9 5 7 7-7 7" /></S>);
export const IconUp = (p) => (<S {...p}><path d="m5 15 7-7 7 7" /></S>);
export const IconDown = (p) => (<S {...p}><path d="m5 9 7 7 7-7" /></S>);
export const IconClose = (p) => (<S {...p}><path d="M6 6l12 12M18 6 6 18" /></S>);
export const IconTrash = (p) => (
  <S {...p}><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></S>
);
export const IconBookmark = (p) => (
  <S {...p}><path d="M6 4h12v17l-6-4-6 4z" /></S>
);
export const IconAlert = (p) => (
  <S {...p}><path d="M12 3.5 22 20H2z" /><path d="M12 10v4M12 17v.6" /></S>
);
export const IconDownload = (p) => (
  <S {...p}><path d="M12 3v12M8 11l4 4 4-4M4 20h16" /></S>
);
export const IconFolder = (p) => (
  <S {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></S>
);
export const IconClip = (p) => (
  <S {...p}><path d="M15 7 8.5 13.5a2.5 2.5 0 0 0 3.5 3.5L19 10a4.5 4.5 0 0 0-6.4-6.4L5.5 10.7a6.5 6.5 0 0 0 9.2 9.2L20 14.6" /></S>
);
export const IconOutline = (p) => (
  <S {...p}><path d="M4 6h3M4 12h3M4 18h3M10 6h10M10 12h10M10 18h10" /></S>
);
export const IconGrid = (p) => (
  <S {...p}><rect x="3" y="3" width="7" height="8" rx="1" /><rect x="14" y="3" width="7" height="8" rx="1" /><rect x="3" y="13" width="7" height="8" rx="1" /><rect x="14" y="13" width="7" height="8" rx="1" /></S>
);
export const IconLayout = (p) => (
  <S {...p}><rect x="4" y="3" width="16" height="8" rx="1.5" /><rect x="4" y="13" width="16" height="8" rx="1.5" /></S>
);
// Tree disclosure arrow: points right when closed, down when open (rotated by
// the `open` class so the change animates).
export const IconChevron = ({ className = '', ...p }) => (
  <S {...p} className={`chev ${className}`}><path d="m9 5 7 7-7 7" /></S>
);
// Printer: paper feeding out of the top of the machine.
export const IconPrint = (p) => (
  <S {...p}><path d="M7 9V4h10v5" /><path d="M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" /><rect x="7" y="14" width="10" height="7" rx="1" /></S>
);
// Overflow menu: the rest of the toolbar, behind one button.
export const IconMore = (p) => (
  <S {...p}><circle cx="5" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="19" cy="12" r="1.4" fill="currentColor" /></S>
);
export const IconCheck = (p) => (<S {...p}><path d="m5 12.5 4.5 4.5L19 7" /></S>);
export const IconMinimize = (p) => (<S {...p} size={p.size || 14}><path d="M5 12h14" /></S>);
export const IconMaximize = (p) => (<S {...p} size={p.size || 14}><rect x="5" y="5" width="14" height="14" rx="1.5" /></S>);
export const IconRestore = (p) => (
  <S {...p} size={p.size || 14}><rect x="4" y="8" width="12" height="12" rx="1.5" /><path d="M8 8V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-3" /></S>
);
