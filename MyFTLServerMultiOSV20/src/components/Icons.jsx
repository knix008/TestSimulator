// Inline 16px stroke icons (no icon font, works offline in every host).
import React from 'react';

const base = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

const doc = <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />;
const docCorner = <path d="M14 3v5h5" />;

const paths = {
  folder: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
  folderOpen: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H6l-3 8z" /><path d="M3 18h16l3-8" /></>,
  folderNew: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M12 10v6M9 13h6" /></>,
  folderUp: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M12 17v-7M9 13l3-3 3 3" /></>,
  file: <>{doc}{docCorner}</>,
  fileText: <>{doc}{docCorner}<path d="M8 13h8M8 17h6" /></>,
  fileImage: <>{doc}{docCorner}<circle cx="9.5" cy="12.5" r="1.5" /><path d="M7 19l4-4 3 3 2-2 3 3" /></>,
  fileArchive: <>{doc}{docCorner}<path d="M10 3v2M10 7v2M10 11v2M10 15v3h2" /></>,
  fileExe: <>{doc}{docCorner}<path d="M9 12l2 2-2 2M13 16h2" /></>,
  fileCode: <>{doc}{docCorner}<path d="M10 12l-2 2.5 2 2.5M14 12l2 2.5-2 2.5" /></>,
  fileMarkup: <>{doc}{docCorner}<path d="M9 12l-2 2 2 2M15 12l2 2-2 2M13 11l-2 6" /></>,
  filePdf: <>{doc}{docCorner}<path d="M8 18v-6h2a1.5 1.5 0 0 1 0 3H8M13 18v-6h1.5a2.5 2.5 0 0 1 0 6z" /></>,
  fileAudio: <>{doc}{docCorner}<path d="M10 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM11.5 16.5V11l4-1v5" /><circle cx="14" cy="16" r="1.5" /></>,
  fileVideo: <>{doc}{docCorner}<path d="M9 12l6 3-6 3z" /></>,
  drive: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 12h18M7 16h.01" /></>,
  driveNet: <><rect x="3" y="14" width="7" height="6" rx="1" /><rect x="14" y="14" width="7" height="6" rx="1" /><rect x="8.5" y="3" width="7" height="6" rx="1" /><path d="M12 9v3M6.5 14v-2h11v2" /></>,
  driveUsb: <><path d="M12 2v14" /><path d="M9 5l3-3 3 3" /><circle cx="12" cy="19" r="2.5" /><path d="M8 9a2 2 0 1 0 0 .01M8 11v3l4 2M16 11h2v2h-2zM17 13v1l-5 2" /></>,
  disc: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" /></>,
  home: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h5v-6h4v6h5V10" /></>,
  server: <><rect x="3" y="4" width="18" height="6" rx="1.5" /><rect x="3" y="14" width="18" height="6" rx="1.5" /><path d="M7 7h.01M7 17h.01" /></>,
  plug: <><path d="M9 3v4M15 3v4M6 7h12v4a6 6 0 0 1-12 0zM12 17v4" /></>,
  unplug: <><path d="M9 3v4M15 3v4M6 7h12v4a6 6 0 0 1-12 0zM12 17v4M4 20L20 4" /></>,
  upload: <><path d="M12 19V7M6 13l6-6 6 6" /><path d="M4 21h16" /></>,
  download: <><path d="M12 5v12M6 11l6 6 6-6" /><path d="M4 21h16" /></>,
  refresh: <><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></>,
  rename: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /></>,
  delete: <><circle cx="12" cy="12" r="9" /><path d="M6 6l12 12" /></>,
  open: <><path d="M14 3h7v7" /><path d="M21 3l-9 9" /><path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" /></>,
  explorer: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></>,
  warning: <><path d="M12 3l10 18H2z" /><path d="M12 10v4M12 17h.01" /></>,
  check: <><path d="M5 12l5 5L20 7" /></>,
  close: <><path d="M6 6l12 12M18 6L6 18" /></>,
  chevronRight: <><path d="M9 6l6 6-6 6" /></>,
  sidebar: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M5.5 8h1.5M5.5 11h1.5M5.5 14h1.5" /></>,
  chevronLeft: <><path d="M15 6l-6 6 6 6" /></>,
  collapseAll: <><path d="M4 6h16M4 12h10M4 18h6" /><path d="M17 15l3 3 3-3" transform="translate(-3 -3)" /></>,
  chevronDown: <><path d="M6 9l6 6 6-6" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  minus: <><path d="M5 12h14" /></>,
  up: <><path d="M12 19V5M5 12l7-7 7 7" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  palette: <><path d="M12 3a9 9 0 0 0 0 18h1a2 2 0 0 0 1.4-3.4 2 2 0 0 1 1.4-3.4H18a3 3 0 0 0 3-3c0-4.6-4-8.2-9-8.2z" /><circle cx="7.5" cy="11.5" r="1.2" fill="currentColor" /><circle cx="10.5" cy="7.5" r="1.2" fill="currentColor" /><circle cx="15" cy="7.5" r="1.2" fill="currentColor" /></>,
  clipboard: <><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M9 13l2 2 4-4" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  eraser: <><path d="M20 20H8L3 15a2 2 0 0 1 0-3l8-8a2 2 0 0 1 3 0l7 7a2 2 0 0 1 0 3l-6 6" /><path d="M6 12l7 7" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  play: <><path d="M7 4l12 8-12 8z" fill="currentColor" /></>,
  stop: <><rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" /></>,
  shield: <><path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6z" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l2 2M14 9l2 2" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><circle cx="17" cy="9" r="2.5" /><path d="M16 15.5a5 5 0 0 1 5.5 4.5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  userPlus: <><circle cx="10" cy="8" r="4" /><path d="M2 21a8 8 0 0 1 16 0" /><path d="M19 8v6M16 11h6" /></>,
  network: <><rect x="9" y="3" width="6" height="5" rx="1" /><rect x="3" y="16" width="6" height="5" rx="1" /><rect x="15" y="16" width="6" height="5" rx="1" /><path d="M12 8v4M6 16v-2h12v2" /></>,
  // start page
  sparkle: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>,
  dice: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01" /></>,
  gauge: <><path d="M4 18a9 9 0 1 1 16 0" /><path d="M12 13l4-5" /><circle cx="12" cy="14" r="1.5" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  book: <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 21V5M19 19v2H6" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  radar: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><path d="M12 12l6-6" /><circle cx="16" cy="15" r="1" /></>,
  waves: <><path d="M2 8c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0M2 14c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0M2 20c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0" /></>,
  binary: <><rect x="4" y="3" width="5" height="8" rx="2.5" /><path d="M16 3v8M14 5l2-2M8 13v8M6 15l2-2" /><rect x="14" y="13" width="5" height="8" rx="2.5" /></>,
  cpu: <><rect x="6" y="6" width="12" height="12" rx="2" /><rect x="9.5" y="9.5" width="5" height="5" /><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" /></>,
  star: <><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" /></>,
  transfer: <><path d="M7 20V5M3 9l4-4 4 4M17 4v15M13 15l4 4 4-4" /></>,
  aurora: <><path d="M3 18c3-8 6-12 9-12s6 4 9 12" /><path d="M6 18c2-5 4-7 6-7s4 2 6 7" /></>,
  hexagon: <><path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z" /><path d="M12 8l3.5 2v4L12 16l-3.5-2v-4z" /></>,
  satellite: <><rect x="9" y="9" width="6" height="6" rx="1" transform="rotate(45 12 12)" /><path d="M5 5l3 3M16 16l3 3M3 9l4-4 2 2-4 4zM15 17l4-4 2 2-4 4z" /></>,
  tunnel: <><rect x="2" y="2" width="20" height="20" rx="2" /><rect x="6.5" y="6.5" width="11" height="11" rx="1.5" /><rect x="10" y="10" width="4" height="4" /><path d="M2 2l8 8M22 2l-8 8M2 22l8-8M22 22l-8-8" /></>,
  chart: <><path d="M3 3v18h18" /><path d="M6 15l4-5 3 3 5-7" /><path d="M6 19l4-3 3 1 5-4" /></>,
  tree: <><rect x="3" y="3" width="6" height="5" rx="1" /><rect x="15" y="10" width="6" height="4" rx="1" /><rect x="15" y="17" width="6" height="4" rx="1" /><path d="M6 8v11h9M6 12h9" /></>,
  sync: <><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" /><path d="M4 3v5h5" /><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" /><path d="M20 21v-5h-5" /></>,
  warp: <><circle cx="12" cy="12" r="1.5" /><path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5L19 19M19 5l-3.5 3.5M8.5 15.5L5 19" /></>,
  terrain: <><path d="M2 20l6-9 4 5 3-4 7 8z" /><path d="M2 14h20M5 9h14" opacity=".5" /></>,
  fiber: <><path d="M2 6c6 0 8 6 20 6M2 12h20M2 18c6 0 8-6 20-6" /><circle cx="17" cy="12" r="1.5" /></>,
  broadcast: <><path d="M12 12l-4 10M12 12l4 10M9.5 18h5" /><circle cx="12" cy="10" r="1.5" /><path d="M8 6a6 6 0 0 0 0 8M16 6a6 6 0 0 1 0 8M5 3a10 10 0 0 0 0 14M19 3a10 10 0 0 1 0 14" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01" /></>,
  keyboard: <><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></>,
};

// The two fat arrows of the transfer bar (filled, like the original's GDI+
// bitmaps): ← upload (local → server), → download (server → local).
export function FatArrow({ left, size = 26, className = '' }) {
  const d = left
    ? 'M2 12L11 3v5h11v8H11v5z'
    : 'M22 12L13 3v5H2v8h11v5z';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={`fat-arrow ${className}`} aria-hidden="true">
      <path d={d} fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

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
