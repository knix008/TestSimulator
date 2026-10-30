// Icons of the figure area (24×24 stroke icons, same look as the editor's).
import React from 'react';

const P = {
  zoomIn: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4M8 11h6M11 8v6" /></>,
  zoomOut: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4M8 11h6" /></>,
  boxzoom: <><rect x="3" y="3" width="12" height="12" rx="1" strokeDasharray="3 2" /><circle cx="15" cy="15" r="4" /><path d="m21 21-3-3" /></>,
  cube: <><path d="M12 3 3 7.5v9L12 21l9-4.5v-9z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></>,
  square: <><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M4 14h16M14 4v16" strokeDasharray="2 2" /></>,
  axes3: <><path d="M10 14V3M10 14l9 4M10 14l-6.5 6" /><path d="m8 5 2-2 2 2M17 15.2l2.2 2.8-3.4.9M4 17.6l-.6 2.6 2.7-.2" /></>,
  landscape: <><rect x="2.5" y="6" width="19" height="12" rx="1.5" /><path d="M6 14l3-3 3 2 4-4" /></>,
  portrait: <><rect x="6" y="2.5" width="12" height="19" rx="1.5" /><path d="M9 15l2-3 2 2 2-4" /></>,
  pan: <><path d="M12 3v18M3 12h18" /><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" /></>,
  rotate: <><ellipse cx="12" cy="12" rx="9" ry="4" /><path d="M12 3a4 9 0 0 1 0 18" /><path d="m17 6 2.5-1.5L19 7.5" /></>,
  datacursor: <><path d="M5 19 19 5" strokeDasharray="2 2.5" /><circle cx="12" cy="12" r="2.5" /><path d="M14 10h5v-5" /><rect x="13" y="3" width="8" height="5" rx="1" /></>,
  reset: <><path d="M4 12a8 8 0 1 0 2.3-5.7" /><path d="M4 4v5h5" /></>,
  grid: <><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M9 3v18M15 3v18M3 9h18M3 15h18" /></>,
  edges: <><path d="M3 17c3-1 4-8 9-8s6 7 9 8" /><path d="M5.5 15.2 8 20M9 11l1.5 9.5M15 11l-1.5 9.5M18.5 15.2 16 20M3 17h18" /></>,
  rulers: <><path d="M3 3h18v5H8v13H3z" /><path d="M7 3v2M11 3v3M15 3v2M19 3v3M3 12h2M3 16h3M3 20h2" /></>,
  legend: <><path d="M4 6h3M4 12h3M4 18h3" strokeWidth="3" /><path d="M10 6h10M10 12h10M10 18h10" /></>,
  colorbar: <><rect x="8" y="3" width="6" height="18" rx="1" /><path d="M8 8h6M8 13h6M8 17h6M17 5h3M17 12h3M17 19h3" /></>,
  light: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></>,
  export: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 17v3h16v-3" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
  print: <><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M6 14h12v7H6z" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  figure: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M6 16c3-8 5-8 7-3s3 2 5-4" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  point: <><circle cx="12" cy="12" r="3" /><path d="M12 4v3M12 17v3M4 12h3M17 12h3" /></>,
  hand: <><path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L3 15.5a1.6 1.6 0 0 1 2.4-2L8 15.5" /></>,
};

export function FigIcon({ name, size = 16, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {P[name] || P.figure}
    </svg>
  );
}
