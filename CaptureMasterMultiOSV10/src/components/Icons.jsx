import React from 'react';

// Stroke icons on a 24×24 grid. `Icon name="…"` renders one; unknown names
// render an empty box so a typo is visible rather than silent.
const PATHS = {
  screen: 'M3 5h18v11H3z M8 20h8 M12 16v4',
  window: 'M3 5h18v14H3z M3 9h18 M6 7h.01 M8.5 7h.01',
  region: 'M4 8V5a1 1 0 0 1 1-1h3 M16 4h3a1 1 0 0 1 1 1v3 M20 16v3a1 1 0 0 1-1 1h-3 M8 20H5a1 1 0 0 1-1-1v-3 M9 9h6v6H9z',
  record: 'M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0 M12 12m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0',
  stop: 'M6 6h12v12H6z',
  pause: 'M8 5v14 M16 5v14',
  play: 'M7 4l13 8-13 8z',
  open: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  recent: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M12 7v5l3 2',
  save: 'M5 3h11l3 3v15H5z M8 3v5h7V3 M8 21v-7h8v7',
  saveAs: 'M5 3h11l3 3v15H5z M8 3v5h7V3 M12 13v6 M9 16h6',
  export: 'M12 3v12 M7 8l5-5 5 5 M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4',
  print: 'M6 9V3h12v6 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M6 14h12v7H6z',
  undo: 'M9 14l-4-4 4-4 M5 10h9a5 5 0 0 1 0 10h-3',
  redo: 'M15 14l4-4-4-4 M19 10h-9a5 5 0 0 0 0 10h3',
  copy: 'M9 9h10v11H9z M5 15V5a1 1 0 0 1 1-1h9',
  paste: 'M8 4h8v3H8z M6 6H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-1 M9 12h6 M9 16h6',
  zoomIn: 'M10 10m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0 M21 21l-6-6 M10 7v6 M7 10h6',
  zoomOut: 'M10 10m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0 M21 21l-6-6 M7 10h6',
  fit: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5 M9 9h6v6H9z',
  actual: 'M3 5h18v14H3z M8 9v6 M12 9v6 M16 9v6',
  settings: 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  info: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M12 16v-4 M12 8h.01',
  close: 'M6 6l12 12 M18 6L6 18',
  minimize: 'M5 12h14',
  maximize: 'M5 5h14v14H5z',
  restore: 'M8 8h12v12H8z M4 16V4h12',
  check: 'M5 12l5 5L20 7',
  trash: 'M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3',
  select: 'M5 3l14 9-6 1-3 6z',
  pen: 'M4 20l4-1 11-11-3-3L5 16z M13 7l3 3',
  rect: 'M4 6h16v12H4z',
  ellipse: 'M12 12m-9 0a9 6 0 1 0 18 0a9 6 0 1 0-18 0',
  arrow: 'M5 19L19 5 M11 5h8v8',
  line: 'M5 19L19 5',
  text: 'M5 6h14 M12 6v13 M9 19h6',
  highlight: 'M4 18h16 M8 14l7-7 3 3-7 7H8z M15 7l1-1 3 3-1 1',
  pixelate: 'M4 4h4v4H4z M12 4h4v4h-4z M8 8h4v4H8z M16 8h4v4h-4z M4 12h4v4H4z M12 12h4v4h-4z M8 16h4v4H8z M16 16h4v4h-4z',
  number: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M10 9l2-1v8',
  crop: 'M6 2v14a2 2 0 0 0 2 2h14 M18 22V8a2 2 0 0 0-2-2H2',
  image: 'M3 5h18v14H3z M3 16l5-5 4 4 3-3 6 6 M16 9h.01',
  video: 'M3 7h13v10H3z M16 10l5-3v10l-5-3',
  file: 'M6 3h8l5 5v13H6z M14 3v5h5',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.7 M20 4v5h-5',
  caret: 'M6 9l6 6 6-6',
  grip: 'M20 20L4 4 M20 12l-8 8 M20 16l-4 4',
  front: 'M4 4h10v10H4z M10 10h10v10H10z',
  back: 'M10 10h10v10H10z M4 4h10v10H4z',
  duplicate: 'M8 8h12v12H8z M4 16V4h12',
  palette: 'M12 3a9 9 0 0 0 0 18c1 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a5 5 0 0 0 5-5c0-4-4.5-7-10-7z M7.5 10.5h.01 M12 7.5h.01 M16.5 10.5h.01',
  font: 'M4 20l6-16h4l6 16 M7 14h10',
  warning: 'M12 3l10 18H2z M12 10v4 M12 18h.01',
  error: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M9 9l6 6 M15 9l-6 6',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z M6 11a6 6 0 0 0 12 0 M12 17v4 M9 21h6',
  keyboard: 'M3 7h18v10H3z M7 10h.01 M11 10h.01 M15 10h.01 M7 14h10',
  general: 'M3 5h18v4H3z M3 12h18v7H3z',
  files: 'M4 4h9l3 3h4v13H4z',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4z M12 13m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
};

export function Icon({ name, size, className, style, strokeWidth = 1.8 }) {
  const d = PATHS[name] || 'M4 4h16v16H4z';
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

export default Icon;
