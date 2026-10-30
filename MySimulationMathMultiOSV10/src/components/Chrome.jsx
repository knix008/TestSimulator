// Shared chrome: the icon set (24×24 stroke icons), the close button, the
// window buttons, the status-bar resize grip, menu-column layout and the
// in-page dialog frame.
import React from 'react';
import { t, useLanguage } from '../lib/i18n';
import { isDesktop, windowControl } from '../lib/backend';
import { columnsOf } from '../lib/menuColumns';

/** Renders menu items in one column, or two columns filled top to bottom (> 6 items). */
export function menuColumnsNodes(items, row) {
  const cols = columnsOf(items);
  if (cols.length < 2) return items.map(row);
  return <div className="menu-cols">{cols.map((col, c) => <div key={c} className="menu-col">{col.map((x) => row(x.item, x.index))}</div>)}</div>;
}

const base = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

const PATHS = {
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>,
  play: <path d="M8 5v14l11-7z" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></>,
  home: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h5v-6h4v6h5V10" /></>,
  start: <><path d="M12 2.5c3 2 4.5 5.4 4.5 9.3L14.6 16H9.4l-1.9-4.2C7.5 7.9 9 4.5 12 2.5z" /><circle cx="12" cy="9" r="1.6" /><path d="M9.4 13.2 6 15.4l1 3.6 2.8-1.6M14.6 13.2l3.4 2.2-1 3.6-2.8-1.6M10.8 19.2 12 22l1.2-2.8" /></>,
  shield: <path d="M12 3l8 3v6c0 5-3.4 7.8-8 9-4.6-1.2-8-4-8-9V6z" />,
  bug: <><path d="M8 9h8v4a4 4 0 0 1-8 0z" /><path d="M9 9V7a3 3 0 0 1 6 0v2M4 11h4M16 11h4M5 16l3-1M19 16l-3-1M12 17v4" /></>,
  chart: <path d="M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-3" />,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M4 16V4h12" /></>,
  check: <path d="M5 12l5 5L20 7" />,
  alert: <><path d="M12 3l10 18H2z" /><path d="M12 10v4M12 17h.01" /></>,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  code: <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  gate: <><path d="M4 20V5h16v15" /><path d="M9 20v-6h6v6" /></>,
  layers: <path d="M12 3l9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronLeft: <path d="M15 6l-6 6 6 6" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  palette: <><path d="M12 3a9 9 0 0 0 0 18h1.2a2 2 0 0 0 1.4-3.4 2 2 0 0 1 1.4-3.4H18a3 3 0 0 0 3-3A8.2 8.2 0 0 0 12 3z" /><circle cx="7.5" cy="10.5" r="1" fill="currentColor" /><circle cx="10.5" cy="7.5" r="1" fill="currentColor" /><circle cx="15" cy="7.5" r="1" fill="currentColor" /></>,
  download: <path d="M12 4v10M8 10l4 4 4-4M5 20h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  upload: <path d="M12 16V5M8 9l4-4 4 4M5 20h14" />,
  save: <><path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M7 3v5h8V3M7 21v-7h10v7" /></>,
  print: <><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M6 14h12v7H6z" /></>,
  package: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" /></>,
  flow: <><circle cx="5" cy="6" r="2" /><circle cx="19" cy="18" r="2" /><path d="M7 6h6a3 3 0 0 1 0 6h-2a3 3 0 0 0 0 6h6" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
  branch: <><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="8" r="2" /><path d="M6 7v10M18 10a6 6 0 0 1-6 6H6" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" /></>,
  webhook: <><circle cx="12" cy="6" r="2.5" /><circle cx="5.5" cy="17" r="2.5" /><circle cx="18.5" cy="17" r="2.5" /><path d="M10.8 8.2L7 14.8M8 17h8M13.2 8.2L17 14.8" /></>,
  key: <><circle cx="8" cy="14" r="4" /><path d="M11 11l9-9M16 6l3 3M14 8l2 2" /></>,
  cut: <><circle cx="6" cy="18" r="3" /><circle cx="18" cy="18" r="3" /><path d="M8.1 16L19 4M15.9 16L5 4" /></>,
  paste: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2.8h6V4M9 10h6M9 14h6M9 18h4" /></>,
  selectAll: <><path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M10 4h4M10 20h4M4 10v4M20 10v4" /><rect x="8" y="8" width="8" height="8" rx="1" /></>,
  zoomIn: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M8 11h6M11 8v6" /></>,
  zoomOut: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M8 11h6" /></>,
  rotate: <><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></>,
  cube: <><path d="M12 2.5l8.5 4.8v9.4L12 21.5l-8.5-4.8V7.3z" /><path d="M3.5 7.3L12 12l8.5-4.7M12 12v9.5" /></>,
  legend: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M6 9h3M12 9h6M6 14h3M12 14h6" /></>,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" />,
  refresh: <><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 13a8 8 0 0 0 14.3 4.9L20 16" /><path d="M4 3v5h5M20 21v-5h-5" /></>,
  report: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 17v-3M12 17v-5M15 17v-2" /></>,
  tree: <path d="M5 4v16M5 8h6M5 14h6M11 6h8v4h-8zM11 12h8v4h-8z" />,
  filter: <path d="M4 5h16l-6 8v6l-4-2v-4z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9l3 3-3 3M12 15h5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  group: <><circle cx="8" cy="9" r="3" /><circle cx="16" cy="9" r="3" /><path d="M2 20a6 6 0 0 1 12 0M10 20a6 6 0 0 1 12 0" /></>,
  minus: <path d="M5 12h14" />,
  cpu: <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  scale: <path d="M12 3v18M5 21h14M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z" />,
  star: <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" />,
  wrench: <path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-3-3 8-8M14.7 6.3L13 4.6a4 4 0 0 0-5.6 5.6l1.7 1.7M3 21l6-6" />,
  installBox: <><path d="M4 9l8-5 8 5v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path d="M12 9v7M9 13l3 3 3-3" /></>,
  lightbulb: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z" /></>,
  inbox: <><path d="M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /><path d="M3 13h5l1 3h6l1-3h5" /></>,
  thumbsUp: <><path d="M7 11v9H4v-9z" /><path d="M7 11l4-8a2 2 0 0 1 2 2v4h6a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7" /></>,
  userCheck: <><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0M16 11l2 2 4-4" /></>,
  unlock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.7-1.5" /></>,
  smell: <path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7" />,
  ban: <><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>,
  chevronsUp: <path d="M7 13l5-5 5 5M7 18l5-5 5 5" />,
  chevronUp: <path d="M6 15l6-6 6 6" />,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>,
  xCircle: <><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>,
  circleDot: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" fill="currentColor" /></>,
  shieldCheck: <><path d="M12 3l8 3v6c0 5-3.4 7.8-8 9-4.6-1.2-8-4-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>,
  archive: <><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" /></>,
  spinner: <path d="M12 3a9 9 0 1 0 9 9" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />,
  gauge: <><path d="M4 18a8 8 0 1 1 16 0" /><path d="M12 18l4-6" /></>,
  grid: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  hourglass: <path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9" />,
  hash: <path d="M5 9h15M4 15h15M10 3L8 21M16 3l-2 18" />,
  waves: <path d="M2 8c3-3 5-3 8 0s5 3 8 0 3-2 4-2M2 14c3-3 5-3 8 0s5 3 8 0 3-2 4-2M2 20c3-3 5-3 8 0s5 3 8 0" />,
  panelLeft: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
  panelRight: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></>,
  panelBottom: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 14h18" /></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
  dice: <><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9" cy="9" r="1" fill="currentColor" /><circle cx="15" cy="15" r="1" fill="currentColor" /><circle cx="15" cy="9" r="1" fill="currentColor" /><circle cx="9" cy="15" r="1" fill="currentColor" /></>,
  unfold: <path d="M7 9l5-5 5 5M7 15l5 5 5-5" />,
  fold: <path d="M7 4l5 5 5-5M7 20l5-5 5 5" />,
  move: <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />,
  flame: <path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2.5 1.2-3.8 2.5-5 .2 1.6.8 2.6 2 3 0-3-1-5.5.5-8z" />,
  cloud: <path d="M7 18a4 4 0 0 1-.5-8 6 6 0 0 1 11.3 1.5A3.5 3.5 0 0 1 17.5 18z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  drop: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
  snow: <path d="M12 2v20M4 7l16 10M20 7L4 17M9 4l3 2 3-2M9 20l3-2 3 2" />,
  thermo: <><path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z" /><path d="M12 9v7" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>,
  book: <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M8 7h7" />,
  graduation: <><path d="M2 9l10-5 10 5-10 5z" /><path d="M6 11v5c3 2 9 2 12 0v-5M22 9v6" /></>,
  ai: <><rect x="5" y="7" width="14" height="12" rx="3" /><path d="M12 3v4M9 12h.01M15 12h.01M9 16h6M2 12h3M19 12h3" /></>,
  undo: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  redo: <><path d="M15 14l5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></>,
  cancelCircle: <><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></>,
  script: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M8.5 13l2 2-2 2M12.5 17h3" /></>,
  model: <><rect x="2.5" y="9" width="6" height="6" rx="1" /><rect x="15.5" y="4" width="6" height="6" rx="1" /><rect x="15.5" y="14" width="6" height="6" rx="1" /><path d="M8.5 12h3.5V7h3.5M12 12v5h3.5" /></>,
  runSection: <><path d="M4 4h16M4 20h16" /><path d="M9 8v8l7-4z" /></>,
  stepOver: <><path d="M4 14a8 8 0 0 1 15-4" /><path d="M20 5v5h-5" /><circle cx="12" cy="18" r="2" /></>,
  stepIn: <><path d="M12 3v11M8 10l4 4 4-4" /><circle cx="12" cy="19" r="2" /></>,
  stepOut: <><path d="M12 15V4M8 8l4-4 4 4" /><circle cx="12" cy="19" r="2" /></>,
  continue: <><path d="M5 5v14" /><path d="M9 5v14l10-7z" /></>,
  breakpoint: <circle cx="12" cy="12" r="6" fill="currentColor" />,
  breakpointOff: <><circle cx="12" cy="12" r="6" /><path d="M5 19L19 5" /></>,
  comment: <path d="M4 5h16v11H9l-5 4zM8 9h8M8 12h5" />,
  uncomment: <><path d="M4 5h16v11H9l-5 4z" /><path d="M9 8l6 6M15 8l-6 6" /></>,
  indent: <path d="M3 5h18M11 10h10M11 14h10M3 19h18M3 9l4 3-4 3" />,
  outdent: <path d="M3 5h18M11 10h10M11 14h10M3 19h18M7 9l-4 3 4 3" />,
  import: <><path d="M12 3v12M8 11l4 4 4-4" /><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></>,
  clearWs: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 9l6 6M15 9l-6 6" /></>,
  clearCmd: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  layout: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M9 12h12" /></>,
  apps: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 17h6M17 14v6" />,
  library: <><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="16" rx="1" /><path d="M17.5 5l3.5 14.5" /></>,
  variable: <path d="M7 4c-2 2.5-3 5-3 8s1 5.5 3 8M17 4c2 2.5 3 5 3 8s-1 5.5-3 8M9 9l6 6M15 9l-6 6" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 17l-5-5-9 8" /></>,
  table: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16M15 4v16" /></>,
  figure: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M6 16l4-5 3 3 5-7" /></>,
  plotLine: <path d="M3 20h18M4 16l5-6 4 4 7-9" />,
  plotArea: <><path d="M3 20h18" /><path d="M4 18l5-7 4 3 7-8v12z" fill="currentColor" fillOpacity=".25" /></>,
  plotBar: <path d="M3 20h18M6 20v-6M10 20V8M14 20v-9M18 20V5" />,
  plotBarh: <path d="M4 3v18M4 6h6M4 10h12M4 14h9M4 18h15" />,
  plotStairs: <path d="M3 20h18M4 17h4v-4h4V9h4V5h4" />,
  plotStem: <><path d="M3 20h18M7 20v-8M12 20V7M17 20v-5" /><circle cx="7" cy="11" r="1.5" /><circle cx="12" cy="6" r="1.5" /><circle cx="17" cy="14" r="1.5" /></>,
  plotScatter: <><path d="M3 20h18M3 20V4" /><circle cx="8" cy="14" r="1.3" fill="currentColor" /><circle cx="12" cy="10" r="1.3" fill="currentColor" /><circle cx="16" cy="12" r="1.3" fill="currentColor" /><circle cx="18" cy="6" r="1.3" fill="currentColor" /><circle cx="10" cy="16" r="1.3" fill="currentColor" /></>,
  plotHist: <path d="M3 20h18M5 20v-4h3v4M8 20v-9h3v9M11 20V6h3v14M14 20v-7h3v7M17 20v-3h3v3" />,
  plotPie: <><circle cx="12" cy="12" r="9" /><path d="M12 3v9l7 5" /></>,
  plotPolar: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><path d="M12 3v18M3 12h18M7 9c3 4 7 4 10-1" /></>,
  plotLog: <path d="M3 20h18M3 20V4M5 18c3-1 5-3 7-6s4-6 8-8" />,
  plotSurf: <path d="M3 15l6-4 6 3 6-5M3 15l5 5 6-3 7-3-6-5M8 20l1-9M14 17l1-3" />,
  plotMesh: <path d="M3 12l9-5 9 5-9 5zM6 10.3l9 5M9 8.7l9 5M9 15.3l9-5M6 13.7l9-5" />,
  plotContour: <><ellipse cx="12" cy="12" rx="9" ry="7" /><ellipse cx="12" cy="12" rx="5.5" ry="4" /><ellipse cx="12" cy="12" rx="2" ry="1.5" /></>,
  plotImage: <path d="M4 4h5v5H4zM9 9h6v6H9zM15 4h5v5h-5zM4 15h5v5H4zM15 15h5v5h-5zM9 4h6v5M4 9h5v6" />,
  // block-diagram editor (same drawings as src/sim/icons.jsx, for its menus in child windows and the ribbon)
  pause: <path d="M8 5v14M16 5v14" strokeWidth="3" />,
  step: <><path d="M5 5v14l9-7z" /><path d="M18 5v14" /></>,
  fit: <><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /><rect x="8" y="8" width="8" height="8" rx="1" /></>,
  duplicate: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M15 12v6M12 15h6" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></>,
  flip: <><path d="M12 3v18" strokeDasharray="2 2" /><path d="M9 7 4 12l5 5zM15 7l5 5-5 5z" /></>,
  subsystem: <><rect x="4" y="5" width="16" height="14" rx="2" /><rect x="8" y="9" width="8" height="6" rx="1" /></>,
  mask: <><path d="M3 8c3-3 15-3 18 0 0 6-4 10-9 10S3 14 3 8z" /><circle cx="8.5" cy="10" r="1.5" /><circle cx="15.5" cy="10" r="1.5" /></>,
  scope: <><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M5 13c2-5 4-5 6 0s4 5 6 0" /><path d="M9 21h6" /></>,
  workspace: <><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
};

export const ICON_NAMES = Object.keys(PATHS);

/**
 * The icon of a menu / context-menu item. Every item has one (one icon
 * column); a missing or unknown name falls back to a neutral dot and warns
 * in development.
 */
export function menuIcon(item) {
  if (item && item.icon && PATHS[item.icon]) return item.icon;
  if (import.meta.env && import.meta.env.DEV) console.warn('[menu] item without a known icon:', item && (item.id || item.label), item && item.icon);
  return 'circleDot';
}

/**
 * The one close (×) button: red with a white × on hover (like a window close
 * button), a focus ring, and 닫기 / Close as its name unless given another.
 */
export function CloseButton({ onClick, size = 14, className = '', title, ...rest }) {
  const label = rest['aria-label'] || title || t('close');
  return (
    <button type="button" className={`icon-btn close-x ${className}`.trim()} title={title || label} {...rest} aria-label={label} onClick={onClick}>
      <Icon name="close" size={size} />
    </button>
  );
}

// Colourful icons: every icon gets a hue from what it means (run = green,
// delete / stop = red, files = blue, folders = amber, plots = orange, models =
// violet …). The hue goes in --ic; styles.css mixes it with --fg so it reads in
// dark and light themes, and disabled / accent-filled buttons keep currentColor.
const HUE = { blue: '#3b82f6', green: '#16a34a', red: '#ef4444', amber: '#f59e0b', orange: '#f97316', violet: '#8b5cf6', pink: '#ec4899', teal: '#14b8a6', cyan: '#06b6d4', indigo: '#6366f1', yellow: '#eab308', sky: '#0ea5e9', slate: '#64748b' };
const ICON_HUE = [
  [/^(play|run|runSection|continue|step|check|checkCircle|thumbsUp|userCheck|stepOver|stepIn|stepOut|shieldCheck)$/, 'green'],
  [/^(pause)$/, 'amber'],
  [/^(subsystem|mask|duplicate|flip|fit)$/, 'violet'],
  [/^(scope)$/, 'orange'],
  [/^(workspace)$/, 'indigo'],
  [/^(stop|close|trash|clearCmd|clearWs|alert|bug|xCircle|cancelCircle|ban|flame|breakpoint|breakpointOff|minus)$/, 'red'],
  [/^(folder|archive|package|installBox|inbox)$/, 'amber'],
  [/^(history|clock|calendar|hourglass|sun|lightbulb|star|sparkle|home)$/, 'yellow'],
  [/^(chart|plot\w*|waves|gauge|thermo|target|scale)$/, 'orange'],
  [/^(model|flow|link|branch|tree|library|apps|move|layers|cpu|cube|rotate)$/, 'violet'],
  [/^(figure|image|palette|drop|eye)$/, 'pink'],
  [/^(save|download|upload|import|copy|paste|cut|external|cloud)$/, 'teal'],
  [/^(search|filter|globe|info|book|graduation|help|report|comment|uncomment)$/, 'cyan'],
  [/^(table|grid|layout|panel\w*|database|list|variable|hash|unfold|fold|indent|outdent)$/, 'indigo'],
  [/^(settings|wrench|key|lock|unlock|shield|user|users|group|gate)$/, 'slate'],
  [/^(undo|redo|refresh|spinner|dice|chevron\w*|arrow\w*)$/, 'sky'],
];
const hueCache = Object.create(null);
export function iconHue(name) {
  if (hueCache[name] === undefined) { const m = ICON_HUE.find(([re]) => re.test(name)); hueCache[name] = HUE[m ? m[1] : 'blue']; }
  return hueCache[name];
}

export function Icon({ name, size = 16, className }) {
  return <svg {...base} width={size} height={size} className={className ? `ic ${className}` : 'ic'} style={{ '--ic': iconHue(name) }} aria-hidden="true">{PATHS[name] || PATHS.file}</svg>;
}

/** Minimise / maximise / close at the far right of the title bar (desktop). */
export function WindowButtons({ onClose }) {
  return (
    <span className="win-buttons">
      <button type="button" className="win-btn" title={t('win_minimize')} aria-label={t('win_minimize')} onClick={() => windowControl('minimize')}>
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5.5h10" stroke="currentColor" strokeWidth="1" /></svg>
      </button>
      <button type="button" className="win-btn" title={t('win_maximize')} aria-label={t('win_maximize')} onClick={() => windowControl('maximize')}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x=".5" y=".5" width="9" height="9" /></svg>
      </button>
      <button type="button" className="win-btn win-close close-x" title={t('win_close')} aria-label={t('win_close')} onClick={() => (onClose ? onClose() : windowControl('close'))}>
        <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.1"><path d="M.5.5l9 9M9.5.5l-9 9" /></svg>
      </button>
    </span>
  );
}

/** The resize grip at the right end of the status bar. */
export function ResizeGrip() {
  return (
    <span className="sb-grip" aria-hidden="true" onMouseDown={(e) => { if (isDesktop && e.button === 0) { e.preventDefault(); windowControl('resize'); } }}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><circle cx="10" cy="10" r="1.1" /><circle cx="6" cy="10" r="1.1" /><circle cx="10" cy="6" r="1.1" /><circle cx="2" cy="10" r="1.1" /><circle cx="6" cy="6" r="1.1" /><circle cx="10" cy="2" r="1.1" /></svg>
    </span>
  );
}

export function Dialog({ title, children, onClose, wide, icon, className, windowed, dataTour }) {
  useLanguage();
  if (windowed) {
    return (
      <div className={`dialog windowed ${className || ''}`} data-tour={dataTour} role="dialog" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="dialog-title" data-tauri-drag-region>
          <strong data-tauri-drag-region>{icon && <Icon name={icon} size={16} />}{title}</strong>
          <CloseButton onClick={onClose} aria-label={t('win_close')} title={t('win_close')} size={14} />
        </div>
        <div className="dialog-body selectable">{children}</div>
      </div>
    );
  }
  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className={`dialog ${wide ? 'wide' : ''} ${className || ''}`} data-tour={dataTour} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="dialog-title">
          <strong>{icon && <Icon name={icon} size={16} />}{title}</strong>
          <CloseButton onClick={onClose} aria-label={t('win_close')} title={t('win_close')} size={14} />
        </div>
        <div className="dialog-body selectable">{children}</div>
      </div>
    </div>
  );
}
