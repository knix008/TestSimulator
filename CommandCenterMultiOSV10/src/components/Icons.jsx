// Inline 16px stroke icons (no icon font, works offline in every host).
import React from 'react';

const base = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

const paths = {
  folder: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
  folderOpen: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H6l-3 8z" /><path d="M3 18h16l3-8" /></>,
  folderNew: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M12 10v6M9 13h6" /></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>,
  fileNew: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M12 11v6M9 14h6" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  move: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  delete: <><circle cx="12" cy="12" r="9" /><path d="M6 6l12 12" /></>,
  trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
  home: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h5v-6h4v6h5V10" /></>,
  refresh: <><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></>,
  archive: <><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" /><path d="M10 13h4" /></>,
  extract: <><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" /><path d="M12 12v6M9 15l3 3 3-3" /></>,
  rename: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  paste: <><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /></>,
  open: <><path d="M14 3h7v7" /><path d="M21 3l-9 9" /><path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" /></>,
  properties: <><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></>,
  tree: <><path d="M4 5h6M4 12h4M4 19h8" /><path d="M14 12h6M16 19h4" /><circle cx="12" cy="12" r="1" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></>,
  language: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  chevronRight: <><path d="M9 6l6 6-6 6" /></>,
  chevronLeft: <><path d="M15 6l-6 6 6 6" /></>,
  chevronDown: <><path d="M6 9l6 6 6-6" /></>,
  up: <><path d="M12 19V5M5 12l7-7 7 7" /></>,
  close: <><path d="M6 6l12 12M18 6L6 18" /></>,
  quit: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>,
  check: <><path d="M5 12l5 5L20 7" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  disc: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" /></>,
  network: <><rect x="3" y="14" width="7" height="6" rx="1" /><rect x="14" y="14" width="7" height="6" rx="1" /><rect x="8.5" y="3" width="7" height="6" rx="1" /><path d="M12 9v3M6.5 14v-2h11v2" /></>,
  usb: <><path d="M12 2v14" /><path d="M9 5l3-3 3 3" /><circle cx="12" cy="19" r="2.5" /><path d="M8 9a2 2 0 1 0 0 .01M8 11v3l4 2M16 11h2v2h-2zM17 13v1l-5 2" /></>,
  drive: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 12h18M7 16h.01" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  palette: <><path d="M12 3a9 9 0 0 0 0 18h1a2 2 0 0 0 1.4-3.4 2 2 0 0 1 1.4-3.4H18a3 3 0 0 0 3-3c0-4.6-4-8.2-9-8.2z" /><circle cx="7.5" cy="11.5" r="1.2" fill="currentColor" /><circle cx="10.5" cy="7.5" r="1.2" fill="currentColor" /><circle cx="15" cy="7.5" r="1.2" fill="currentColor" /></>,
  clipboard: <><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M9 13l2 2 4-4" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9l3 3-3 3M12 15h5" /></>,
  log: <><path d="M4 6h16M4 12h10M4 18h13" /></>,
  gitBranch: <><circle cx="6" cy="5" r="2.5" /><circle cx="6" cy="19" r="2.5" /><circle cx="18" cy="8" r="2.5" /><path d="M6 7.5v9M18 10.5c0 4-12 2-12 6" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  eraser: <><path d="M20 20H8L3 15a2 2 0 0 1 0-3l8-8a2 2 0 0 1 3 0l6 6a2 2 0 0 1 0 3l-6 7" /><path d="M6 12l7 7" /></>,
  undo: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-4" /></>,
  redo: <><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h4" /></>,
  star: <><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" /></>,
  view: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><circle cx="11.5" cy="14" r="2.5" /><path d="M13.5 16l2 2" /></>,
  swap: <><path d="M4 8h13l-3-3" /><path d="M20 16H7l3 3" /></>,
  compare: <><rect x="3" y="4" width="7" height="16" rx="1" /><rect x="14" y="4" width="7" height="16" rx="1" /><path d="M6.5 9v6M17.5 9v6M4.5 12h4M15.5 12h4" /></>,
  multiRename: <><path d="M4 6h9M4 12h9M4 18h9" /><path d="M20.5 5.5a1.5 1.5 0 0 1 0 2L16 12l-3 1 1-3 4.5-4.5a1.5 1.5 0 0 1 2 0z" /></>,
  select: <><rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="4 3" /><path d="M8 12l3 3 5-6" /></>,
  print: <><path d="M6 9V3h12v6" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="7" /><path d="M18 12h.01" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="M21 16l-5-5-8 8" /></>,
  zoomIn: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4M11 8v6M8 11h6" /></>,
  zoomOut: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4M8 11h6" /></>,
  fit: <><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" /><rect x="8" y="8" width="8" height="8" rx="1" /></>,
  actual: <><rect x="3" y="4" width="18" height="16" rx="2" /><text x="6" y="16.5" fontSize="9" fontWeight="700" fill="currentColor" stroke="none" fontFamily="sans-serif">1:1</text></>,
  rotateL: <><path d="M4 12a8 8 0 1 0 2.3-5.7" /><path d="M4 4v5h5" /></>,
  rotateR: <><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></>,
  save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></>,
  wrap: <><path d="M4 6h16M4 12h11a3 3 0 0 1 0 6h-3" /><path d="M14 16l-2 2 2 2M4 18h5" /></>,
  hex: <><path d="M4 7h4M6 5v4M14 7h6M4 17h6M14 15l4 4M18 15l-4 4" /></>,
  contentSearch: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  exact: <><path d="M5 9h14M5 15h14" /></>,
  regex: <><text x="2" y="18" fontSize="15" fontWeight="700" fill="currentColor" stroke="none" fontFamily="monospace">.*</text></>,
  caseAa: <><text x="1" y="17" fontSize="14" fontWeight="700" fill="currentColor" stroke="none">Aa</text></>,
  searchDock: <><circle cx="10" cy="9" r="5" /><path d="M14 13l3 3" /><path d="M3 20h18" /><path d="M6 17h12" opacity="0.5" /></>,
  splitH: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16" /></>,
  splitV: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 12h18" /></>,
  tabs: <><path d="M3 8h18v12H3z" /><path d="M3 8V5a1 1 0 0 1 1-1h6l2 2M12 4h4a1 1 0 0 1 1 1v3" /></>,
  tabNew: <><path d="M3 8h18v12H3z" /><path d="M3 8V5a1 1 0 0 1 1-1h6l2 2h4" /><path d="M12 11v6M9 14h6" /></>,
  panelBottom: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 14h18" /></>,
};

// Flags for the language toggle (the flag of the language you switch TO).
// Drawn as filled shapes, so they ignore the stroke styling of the line icons.
export function Flag({ country, width = 22, className = '' }) {
  const h = Math.round(width * 2 / 3);
  if (country === 'kr') {
    // Taegeukgi: white field, red/blue taegeuk, four trigrams.
    return (
      <svg width={width} height={h} viewBox="0 0 36 24" className={`flag flag-kr ${className}`} aria-hidden="true">
        <rect width="36" height="24" rx="3" fill="#ffffff" stroke="#c8ccd4" strokeWidth="1" />
        <g transform="translate(18 12)">
          <path d="M-6 0a6 6 0 0 1 12 0a3 3 0 0 1 -6 0a3 3 0 0 0 -6 0z" fill="#cd2e3a" transform="rotate(-33)" />
          <path d="M6 0a6 6 0 0 1 -12 0a3 3 0 0 1 6 0a3 3 0 0 0 6 0z" fill="#0047a0" transform="rotate(-33)" />
        </g>
        <g fill="#000000">
          <g transform="translate(6.5 5.5) rotate(-33)"><rect x="-3" y="-2.4" width="6" height="1.2" /><rect x="-3" y="-0.6" width="6" height="1.2" /><rect x="-3" y="1.2" width="6" height="1.2" /></g>
          <g transform="translate(29.5 18.5) rotate(-33)"><rect x="-3" y="-2.4" width="2.6" height="1.2" /><rect x="0.4" y="-2.4" width="2.6" height="1.2" /><rect x="-3" y="-0.6" width="2.6" height="1.2" /><rect x="0.4" y="-0.6" width="2.6" height="1.2" /><rect x="-3" y="1.2" width="2.6" height="1.2" /><rect x="0.4" y="1.2" width="2.6" height="1.2" /></g>
          <g transform="translate(29.5 5.5) rotate(33)"><rect x="-3" y="-2.4" width="2.6" height="1.2" /><rect x="0.4" y="-2.4" width="2.6" height="1.2" /><rect x="-3" y="-0.6" width="6" height="1.2" /><rect x="-3" y="1.2" width="2.6" height="1.2" /><rect x="0.4" y="1.2" width="2.6" height="1.2" /></g>
          <g transform="translate(6.5 18.5) rotate(33)"><rect x="-3" y="-2.4" width="6" height="1.2" /><rect x="-3" y="-0.6" width="2.6" height="1.2" /><rect x="0.4" y="-0.6" width="2.6" height="1.2" /><rect x="-3" y="1.2" width="6" height="1.2" /></g>
        </g>
      </svg>
    );
  }
  // Union Jack (simplified): blue field, white + red saltires, white + red cross.
  return (
    <svg width={width} height={h} viewBox="0 0 36 24" className={`flag flag-gb ${className}`} aria-hidden="true">
      <defs><clipPath id="flag-gb-clip"><rect width="36" height="24" rx="3" /></clipPath></defs>
      <g clipPath="url(#flag-gb-clip)">
        <rect width="36" height="24" fill="#012169" />
        <path d="M0 0L36 24M36 0L0 24" stroke="#ffffff" strokeWidth="4.8" />
        <path d="M0 0L36 24M36 0L0 24" stroke="#c8102e" strokeWidth="1.8" />
        <path d="M18 0V24M0 12H36" stroke="#ffffff" strokeWidth="7" />
        <path d="M18 0V24M0 12H36" stroke="#c8102e" strokeWidth="4" />
      </g>
      <rect width="36" height="24" rx="3" fill="none" stroke="#c8ccd4" strokeWidth="1" />
    </svg>
  );
}

export function Icon({ name, size = 16, className = '', style }) {
  return (
    <svg {...base} width={size} height={size} className={`icon icon-${name} ${className}`} style={style} aria-hidden="true">
      {paths[name] || paths.file}
    </svg>
  );
}

export default Icon;
