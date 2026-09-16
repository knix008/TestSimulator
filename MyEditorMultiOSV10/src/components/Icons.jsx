// Inline 16px stroke icons (no icon font, works offline in every host) and
// the file-type icons of the folder tree.
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
  chevronDown: <><path d="M6 9l6 6 6-6" /></>,
  up: <><path d="M12 19V5M5 12l7-7 7 7" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  palette: <><path d="M12 3a9 9 0 0 0 0 18h1a2 2 0 0 0 1.4-3.4 2 2 0 0 1 1.4-3.4H18a3 3 0 0 0 3-3c0-4.6-4-8.2-9-8.2z" /><circle cx="7.5" cy="11.5" r="1.2" fill="currentColor" /><circle cx="10.5" cy="7.5" r="1.2" fill="currentColor" /><circle cx="15" cy="7.5" r="1.2" fill="currentColor" /></>,
  clipboard: <><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M9 13l2 2 4-4" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  eraser: <><path d="M20 20H8L3 15a2 2 0 0 1 0-3l8-8a2 2 0 0 1 3 0l7 7a2 2 0 0 1 0 3l-6 6" /><path d="M6 12l7 7" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  // a document with an arrow going into it: open a file (folderOpen is for folders)
  fileOpen: <><path d="M14 3H7a2 2 0 0 0-2 2v4M5 19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5" />{docCorner}<path d="M2 14h9M8 11l3 3-3 3" /></>,
  filePlus: <>{doc}{docCorner}<path d="M12 11v6M9 14h6" /></>,
  fileSave: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></>,
  saveAll: <><path d="M17 20H6a2 2 0 0 1-2-2V7" /><path d="M20 17H9a2 2 0 0 1-2-2V4a1 1 0 0 1 1-1h8l4 4v9a1 1 0 0 1-1 1z" /><path d="M15 3v4h4M11 17v-5h5v5" /></>,
  undo: <><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></>,
  redo: <><path d="M15 14l5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" /></>,
  cut: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12" /></>,
  paste: <><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M9 12h6M9 16h6" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  replace: <><path d="M4 7h9a3 3 0 0 1 3 3v1" /><path d="M13 4l3 3-3 3" /><path d="M20 17h-9a3 3 0 0 1-3-3v-1" /><path d="M11 20l-3-3 3-3" /></>,
  wrap: <><path d="M3 6h18M3 12h13a3 3 0 0 1 0 6h-4M3 18h6" /><path d="M14 16l-2 2 2 2" /></>,
  pilcrow: <><path d="M13 4v16M17 4v16M17 4h-6.5a3.5 3.5 0 0 0 0 7H13" /></>,
  zoomIn: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M11 8v6M8 11h6" /></>,
  zoomOut: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M8 11h6" /></>,
  sidebar: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M5.5 8h1.5M5.5 11h1.5M5.5 14h1.5" /></>,
  chevronLeft: <><path d="M15 6l-6 6 6 6" /></>,
  chevronUp: <><path d="M6 15l6-6 6 6" /></>,
  arrowDown: <><path d="M12 5v14M5 12l7 7 7-7" /></>,
  arrowUp: <><path d="M12 19V5M5 12l7-7 7 7" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.2A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9M6.6 6.6A16.7 16.7 0 0 0 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1" /></>,
  text: <><path d="M4 7V4h16v3M9 20h6M12 4v16" /></>,
  hash: <><path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18" /></>,
  listTree: <><path d="M4 5h6M4 12h2M8 12h8M4 19h2M8 19h2M12 19h8" /><path d="M6 7v12" /></>,
  minimap: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M16 4v16M18 7h1M18 10h1M18 13h1M6 8h6M6 11h4M6 14h7" /></>,
  binary: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 8v8M11 8h2v8h-2zM16 8v8" /></>,
  fullscreen: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" /></>,
  code: <><path d="M16 18l6-6-6-6M8 6l-6 6 6 6" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  sortAsc: <><path d="M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 4v16" /></>,
  bookOpen: <><path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z" /><path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z" /></>,
  keyboard: <><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" /></>,
  reload: <><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></>,
  moreH: <><circle cx="5" cy="12" r="1.5" fill="currentColor" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /><circle cx="19" cy="12" r="1.5" fill="currentColor" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  minus: <><path d="M5 12h14" /></>,
  filter: <><path d="M3 5h18l-7 8v6l-4 2v-8z" /></>,
  circle: <><circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" /></>,
  plusBox: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 8v8M8 12h8" /></>,
  minusBox: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 12h8" /></>,
  autoIndent: <><path d="M10 6h11M10 12h11M10 18h11M3 6h3M3 18h3" /><path d="M3 12h4M5 10l2 2-2 2" /></>,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9l3 3-3 3M12 15h5" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5" /><path d="M12 17h.01" /></>,
  searchFolder: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v3" /><path d="M3 7v10a2 2 0 0 0 2 2h6" /><circle cx="17" cy="16" r="3.5" /><path d="M19.5 18.5L22 21" /></>,
  searchDocs: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" /><path d="M14 3v5h5v3" /><circle cx="16" cy="16" r="3.5" /><path d="M18.5 18.5L21 21" /></>,
  splitNone: <><rect x="3" y="4" width="18" height="16" rx="2" /></>,
  splitCols: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16" /></>,
  splitRows: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 12h18" /></>,
  splitGrid: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16M3 12h18" /></>,
  nextPane: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16" /><path d="M6 12h4M8.5 10l1.5 2-1.5 2" /></>,
  download: <><path d="M12 3v12M6 9l6 6 6-6" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></>,
  print: <><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M6 14h12v7H6z" /></>,
  format: <><path d="M4 6h16M4 10h10M4 14h13M4 18h7" /><path d="M17 14l2 2 3-3" /></>,
  lint: <><path d="M8 2l1.9 1.9M16 2l-1.9 1.9" /><path d="M9 7h6a3 3 0 0 1 3 3v5a6 6 0 0 1-12 0v-5a3 3 0 0 1 3-3z" /><path d="M3 13h3M18 13h3M12 7v14M4 20l3-2M20 20l-3-2M4 7l3 2M20 7l-3 2" /></>,
  lintNext: <><path d="M9 7h6a3 3 0 0 1 3 3v5a6 6 0 0 1-12 0v-5a3 3 0 0 1 3-3z" /><path d="M12 7v14" /><path d="M20 3v6M17 6l3 3 3-3" /></>,
  terminalPlus: <><path d="M13 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8" /><path d="M7 9l3 3-3 3" /><path d="M18 3v6M15 6h6" /><path d="M21 13v5a2 2 0 0 1-2 2h-3" /></>,
  // menu items: tabs / files
  closeAll: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 9l6 6M15 9l-6 6" /></>,
  closeOthers: <><rect x="8" y="4" width="8" height="16" rx="1" /><path d="M2 10l3 4M5 10l-3 4M22 10l-3 4M19 10l3 4" /></>,
  closeRight: <><rect x="3" y="4" width="9" height="16" rx="1" /><path d="M15 10l4 4M19 10l-4 4" /></>,
  exit: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>,
  // menu items: editing
  selectAll: <><rect x="4" y="4" width="16" height="16" rx="2" strokeDasharray="3.5 2.5" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>,
  dupLine: <><path d="M4 7h11M4 12h11M4 17h11" /><path d="M20 10v6M17 13h6" /></>,
  delLine: <><path d="M4 7h16M4 12h8M4 17h16" /><path d="M16 9l5 5M21 9l-5 5" /></>,
  comment: <><path d="M21 14a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M10.5 7.5l-2 5M15.5 7.5l-2 5" /></>,
  indent: <><path d="M12 6h9M12 12h9M12 18h9M3 6h5M3 18h5" /><path d="M3 12h4M5 9.5L7.5 12 5 14.5" /></>,
  outdent: <><path d="M12 6h9M12 12h9M12 18h9M3 6h5M3 18h5" /><path d="M4 12h4M6.5 9.5L4 12l2.5 2.5" /></>,
  upper: <><text x="12" y="17" textAnchor="middle" fontSize="14" fontWeight="700" fill="currentColor" stroke="none">AB</text></>,
  lower: <><text x="12" y="17" textAnchor="middle" fontSize="14" fontWeight="700" fill="currentColor" stroke="none">ab</text></>,
  sortDesc: <><path d="M11 5h10M11 9h7M11 13h4M3 7l3-3 3 3M6 4v16" /></>,
  trimWs: <><path d="M3 6h18M3 12h8M3 18h18" /><path d="M14 9l6 6M20 9l-6 6" /></>,
  removeEmpty: <><path d="M4 5h16M4 19h16" /><path d="M6 12h12" /><path d="M15 9l-6 6" /></>,
  removeDup: <><path d="M4 7h12M4 12h12M4 17h12" /><path d="M19 10l3 4M22 10l-3 4" /></>,
  // menu items: search
  findNext: <><circle cx="9" cy="10" r="5" /><path d="M12.5 13.5L15 16" /><path d="M20 5v12M17 14l3 3 3-3" /></>,
  findPrev: <><circle cx="9" cy="10" r="5" /><path d="M12.5 13.5L15 16" /><path d="M20 19V7M17 10l3-3 3 3" /></>,
  selectMatches: <><path d="M4 6h9M4 12h9M4 18h9" /><path d="M16 5.5l2 2 3-3M16 11.5l2 2 3-3M16 17.5l2 2 3-3" /></>,
  // menu items: view
  activeLine: <><path d="M5 5h14M5 19h14" /><rect x="3" y="9" width="18" height="6" rx="1" /></>,
  foldGutter: <><path d="M3 6h5M3 12h5M3 18h5" /><path d="M12 6h9M12 18h9" /><path d="M13 10l3 3 3-3" /></>,
  splitView: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16M6 9h3M6 12h3M15 9h3M15 12h3" /></>,
  toolbar: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M7 6.5h.01M10 6.5h.01M13 6.5h.01" /></>,
  statusbar: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 15h18M7 17.5h4M14 17.5h3" /></>,
  zoomReset: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /><text x="11" y="13.8" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="currentColor" stroke="none">1:1</text></>,
  // status-bar pickers
  encoding: <><path d="M4 7V4h16v3M9 20h6M12 4v16" /><path d="M17 15h4M19 13v4" /></>,
  eol: <><path d="M20 5v6a2 2 0 0 1-2 2H5" /><path d="M8 10l-3 3 3 3" /></>,
  spaces: <><path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="3" /></>,
  tab: <><path d="M4 12h13M13 8l4 4-4 4M21 6v12" /></>,
  gitBranch: <><circle cx="6" cy="5" r="2.5" /><circle cx="6" cy="19" r="2.5" /><circle cx="18" cy="8" r="2.5" /><path d="M6 7.5v9M18 10.5c0 4-12 2-12 6" /></>,
  spell: <><path d="M3 17l3.5-10L10 17M4.6 13.5h3.8" /><path d="M12 13.5l2.5 2.5L21 9.5" /><path d="M3 21h18" /></>,
  autocomplete: <><path d="M4 5h9" /><path d="M4 9h5" /><path d="M4 13h6" /><path d="M4 17h4" /><rect x="11" y="10" width="10" height="11" rx="1.5" /><path d="M14 14h4M14 17h4" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>,
  listOrdered: <><path d="M10 6h11M10 12h11M10 18h11" /><path d="M4 6h1v4M4 10h2" /><path d="M6 18H4c0-1 2-2 2-3a1 1 0 0 0-2-.5" /></>,
  checkSquare: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 12l3 3 5-6" /></>,
  quote: <><path d="M10 11H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v6a4 4 0 0 1-4 4" /><path d="M19 11h-4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v6a4 4 0 0 1-4 4" /></>,
  table: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16M15 4v16" /></>,
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

// Language badges for the language menus: a small rounded square in the
// language's customary colour with a short label — no icon assets needed, and
// every language of @codemirror/language-data gets one (unknown ones fall
// back to grey with the first letters of the name).
const DARK = '#1b1e24';
const LANG_BADGES = {
  JavaScript: ['JS', '#f7df1e', DARK], TypeScript: ['TS', '#3178c6'], JSX: ['JSX', '#61dafb', DARK], TSX: ['TSX', '#3178c6'],
  HTML: ['<>', '#e34c26'], CSS: ['CSS', '#264de4'], SCSS: ['SCSS', '#c6538c'], Sass: ['Sass', '#c6538c'], LESS: ['LESS', '#1d365d'], Stylus: ['Styl', '#ff6347'],
  JSON: ['{ }', '#cbcb41', DARK], 'JSON-LD': ['{LD}', '#cbcb41', DARK], Markdown: ['M↓', '#519aba'], XML: ['XML', '#0060ac'], YAML: ['YML', '#cb171e'], TOML: ['TOML', '#9c4221'],
  Python: ['Py', '#3572a5'], Cython: ['Cy', '#3572a5'], C: ['C', '#555555'], 'C++': ['C++', '#f34b7d'], 'C#': ['C#', '#178600'], 'Objective-C': ['ObjC', '#438eff'], 'Objective-C++': ['ObjC', '#6866fb'],
  Java: ['Java', '#b07219'], Kotlin: ['Kt', '#a97bff'], Scala: ['Sc', '#c22d40'], Groovy: ['Gvy', '#4298b8'], Clojure: ['Clj', '#db5855'], ClojureScript: ['Cljs', '#db5855'],
  Go: ['Go', '#00add8'], Rust: ['Rs', '#dea584', DARK], Swift: ['Sw', '#f05138'], Dart: ['Dart', '#00b4ab'], Zig: ['Zig', '#ec915c', DARK], D: ['D', '#ba595e'], Nim: ['Nim', '#ffc200', DARK], Crystal: ['Cr', '#776791'],
  PHP: ['PHP', '#4f5d95'], Ruby: ['Rb', '#701516'], Perl: ['Perl', '#0298c3'], Lua: ['Lua', '#000080'], R: ['R', '#198ce7'], Julia: ['Jl', '#a270ba'], Octave: ['Oct', '#e16737'], Mathematica: ['Mma', '#dd1100'],
  Haskell: ['Hs', '#5e5086'], OCaml: ['ML', '#ef7a08'], SML: ['SML', '#ef7a08'], 'F#': ['F#', '#b845fc'], Elm: ['Elm', '#60b5cc'], Erlang: ['Erl', '#b83998'], Scheme: ['Scm', '#1e4aec'], 'Common Lisp': ['Lisp', '#3fb68b', DARK], Elixir: ['Ex', '#6e4a7e'],
  Shell: ['$_', '#89e051', DARK], PowerShell: ['PS', '#012456'], Dockerfile: ['Dock', '#384d54'], CMake: ['CMk', '#064f8c'], Nginx: ['Ngx', '#009639'], NSIS: ['NSIS', '#0d6efd'], 'Properties files': ['.ini', '#6b7280'],
  SQL: ['SQL', '#e38c00'], MySQL: ['MySQ', '#00758f'], 'MariaDB SQL': ['MDB', '#003545'], 'MS SQL': ['MSSQ', '#cc2927'], PostgreSQL: ['PgSQ', '#336791'], PLSQL: ['PL/S', '#f80000'], SQLite: ['SQLt', '#003b57'], CQL: ['CQL', '#1287b1'], Cypher: ['Cy', '#008cc1'], SPARQL: ['SPQ', '#0c479d'],
  diff: ['±', '#41535b'], LaTeX: ['TeX', '#3d6117'], sTeX: ['TeX', '#3d6117'], Textile: ['Txt', '#ffe7ac', DARK], Troff: ['roff', '#6b7280'],
  Vue: ['Vue', '#41b883'], 'Angular Template': ['Ng', '#dd0031'], Pug: ['Pug', '#a86454'], Jinja: ['Jnj', '#a52a22'], Liquid: ['Liq', '#67b8de'], Velocity: ['Vel', '#5b8fd8'],
  WebAssembly: ['WA', '#654ff0'], Gas: ['asm', '#6e4c13'], Z80: ['Z80', '#6e4c13'], Fortran: ['F90', '#4d41b1'], Cobol: ['CBL', '#0b5aa5'], Pascal: ['Pas', '#e3f171', DARK], 'VB.NET': ['VB', '#945db7'], VBScript: ['VBS', '#945db7'],
  Verilog: ['Vlog', '#b2b7f8', DARK], SystemVerilog: ['SV', '#b2b7f8', DARK], VHDL: ['VHDL', '#adb2cb', DARK], Tcl: ['Tcl', '#e4cc98', DARK], CoffeeScript: ['Cof', '#244776'], LiveScript: ['LS', '#499886'], Haxe: ['Hx', '#df7900'],
  ProtoBuf: ['Prot', '#4285f4'], Solr: ['Solr', '#d9411e'], Puppet: ['Pup', '#302b6d'], Gherkin: ['Ghk', '#5b8c3a'], HTTP: ['HTTP', '#005c9c'], Smalltalk: ['St', '#596706'], Squirrel: ['Sq', '#800000'], Pig: ['Pig', '#fcd7de', DARK], Q: ['Q', '#0040cd'], APL: ['APL', '#5a8164'], Forth: ['4th', '#341708'], Factor: ['Fac', '#636746'], Eiffel: ['Eif', '#4d6977'], Dylan: ['Dyl', '#6c616e'], Oz: ['Oz', '#fab738', DARK], Modelica: ['Mo', '#de1d31'], Spreadsheet: ['=', '#1d6f42'], Brainfuck: ['BF', '#2f2530'], SAS: ['SAS', '#b34936'], Sieve: ['Sv', '#6b7280'], Mbox: ['@', '#6b7280'], PGP: ['PGP', '#6b7280'], EBNF: ['BNF', '#6b7280'], DTD: ['DTD', '#0060ac'], XQuery: ['XQ', '#5232e7'], Turtle: ['TTL', '#0c479d'], NTriples: ['NT', '#0c479d'], 'Web IDL': ['IDL', '#6b7280'], IDL: ['IDL', '#a3522f'], 'RPM Spec': ['RPM', '#b7212a'], 'RPM Changes': ['RPM', '#b7212a'], TiddlyWiki: ['TW', '#6b7280'], 'Tiki wiki': ['Tiki', '#6b7280'], MscGen: ['Msc', '#6b7280'], MsGenny: ['Msg', '#6b7280'], 'Xù': ['Xù', '#6b7280'], Yacas: ['Yac', '#6b7280'], MUMPS: ['M', '#6b7280'], mIRC: ['IRC', '#3d57c3'], Esper: ['EPL', '#6b7280'], ECL: ['ECL', '#8a1267'], FCL: ['FCL', '#6b7280'], HXML: ['HXML', '#df7900'], Asterisk: ['*', '#6b7280'], 'ASN.1': ['ASN', '#6b7280'], TTCN: ['TTCN', '#6b7280'], TTCN_CFG: ['TTCN', '#6b7280'], 'Closure Stylesheets (GSS)': ['GSS', '#264de4'], edn: ['edn', '#db5855'],
  plain: ['Aa', '#6b7280'], auto: ['A?', '#6b7280'],
};

export function langBadge(name) {
  const b = LANG_BADGES[name];
  if (b) return { text: b[0], bg: b[1], fg: b[2] || '#ffffff' };
  const words = String(name || '').split(/[\s-]+/).filter(Boolean);
  const text = words.length > 1 ? words.map((w) => w[0]).join('').slice(0, 3).toUpperCase() : String(name || '?').slice(0, 3);
  return { text, bg: '#6b7280', fg: '#ffffff' };
}

export function LangIcon({ name, size = 16, className = '' }) {
  const b = langBadge(name);
  const n = b.text.length;
  const fontSize = n <= 1 ? size * 0.62 : n === 2 ? size * 0.5 : n === 3 ? size * 0.4 : size * 0.32;
  return (
    <span className={`lang-icon ${className}`} style={{ width: size, height: size, background: b.bg, color: b.fg, fontSize }} aria-hidden="true">{b.text}</span>
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
