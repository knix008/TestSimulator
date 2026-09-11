// Inline SVG toolbar icons — stroke inherits currentColor so they follow the theme.
import type { ReactNode } from 'react';

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const icon = (children: ReactNode) => (
  <svg {...base} aria-hidden="true">
    {children}
  </svg>
);

export const Icons = {
  New: () =>
    icon(
      <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
      </>,
    ),
  Open: () => icon(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />),
  Database: () =>
    icon(
      <>
        <ellipse cx="12" cy="5.5" rx="7.5" ry="3" />
        <path d="M4.5 5.5v13c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-13" />
        <path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" />
      </>,
    ),
  Save: () =>
    icon(
      <>
        <path d="M4 4h12l4 4v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
        <path d="M8 4v6h8V4M8 21v-6h8v6" />
      </>,
    ),
  SaveAs: () =>
    icon(
      <>
        <path d="M4 4h10l4 4v6" />
        <path d="M4 4v16h7" />
        <path d="M16 17h6M19 14v6" />
      </>,
    ),
  Export: () =>
    icon(
      <>
        <path d="M12 3v12" />
        <path d="M8 7l4-4 4 4" />
        <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
      </>,
    ),
  Undo: () =>
    icon(
      <>
        <path d="M3 10h11a5 5 0 0 1 0 10H8" />
        <path d="M3 10l5-5M3 10l5 5" />
      </>,
    ),
  Redo: () =>
    icon(
      <>
        <path d="M21 10H10a5 5 0 0 0 0 10h6" />
        <path d="M21 10l-5-5M21 10l-5 5" />
      </>,
    ),
  Table: () =>
    icon(
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M9 9v11" />
      </>,
    ),
  Relation: () =>
    icon(
      <>
        <rect x="2" y="4" width="7" height="6" rx="1" />
        <rect x="15" y="14" width="7" height="6" rx="1" />
        <path d="M9 7h4a2 2 0 0 1 2 2v8" />
      </>,
    ),
  ZoomIn: () =>
    icon(
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M15.5 15.5L21 21M8 10.5h5M10.5 8v5" />
      </>,
    ),
  ZoomOut: () =>
    icon(
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M15.5 15.5L21 21M8 10.5h5" />
      </>,
    ),
  FitAll: () =>
    icon(
      <>
        <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" />
        <rect x="9" y="9" width="6" height="6" rx="1" />
      </>,
    ),
  Panel: () =>
    icon(
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M15 4v16" />
      </>,
    ),
  Analyze: () =>
    icon(
      <>
        <path d="M4 20V10M9.5 20V4M15 20v-7M20.5 20v-11" />
      </>,
    ),
  Report: () =>
    icon(
      <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M9 13h6M9 17h6" />
      </>,
    ),
  Sample: () =>
    icon(
      <>
        <path d="M12 3l2.2 5.3 5.8.5-4.4 3.8 1.3 5.6L12 15.3 7.1 18.2l1.3-5.6L4 8.8l5.8-.5z" />
      </>,
    ),
  Settings: () =>
    icon(
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
      </>,
    ),
  About: () =>
    icon(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 16v-5M12 8h.01" />
      </>,
    ),
  Pointer: () => icon(<path d="M5 3l14 8-6 1.5L10 19z" />),
  Grid: () =>
    icon(
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
      </>,
    ),
  Arrange: () =>
    icon(
      <>
        <rect x="3" y="4" width="7" height="6" rx="1" />
        <rect x="14" y="4" width="7" height="6" rx="1" />
        <rect x="3" y="14" width="7" height="6" rx="1" />
        <rect x="14" y="14" width="7" height="6" rx="1" />
      </>,
    ),
  Delete: () =>
    icon(
      <>
        <path d="M4 7h16M10 11v6M14 11v6" />
        <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3" />
      </>,
    ),
  Edit: () =>
    icon(
      <>
        <path d="M4 20h4l10-10a2.8 2.8 0 1 0-4-4L4 16z" />
        <path d="M13.5 6.5l4 4" />
      </>,
    ),
  Column: () =>
    icon(
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M9 9v11M15 9v11" />
      </>,
    ),
  Language: () =>
    icon(
      <>
        <path d="M3 6h9M7.5 6V4M10 6c0 4-3.2 7-7 8" />
        <path d="M5 11c1.6 2 3.6 3.2 6 3.8" />
        <path d="M12.5 21l4-11 4 11M14 17.5h5" />
      </>,
    ),
  // The language toggle shows the flag of the language in use. Flags are drawn
  // in their own colours (not currentColor) so they stay recognisable in every
  // theme; a faint outline keeps the white field visible on light backgrounds.
  /** Korean: Taegeukgi — red/blue taegeuk on white with the four trigrams. */
  FlagKo: () => (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="1.5" fill="#fff" />
      <g fill="none" stroke="#111" strokeWidth="0.9" strokeLinecap="butt">
        <g transform="translate(5.8 8.6) rotate(-56)"><path d="M-1.6-1h3.2M-1.6 0h3.2M-1.6 1h3.2" /></g>
        <g transform="translate(18.2 8.6) rotate(56)"><path d="M-1.6-1h3.2M-1.6 0h3.2M-1.6 1h3.2" /></g>
        <g transform="translate(5.8 15.4) rotate(56)"><path d="M-1.6-1h3.2M-1.6 0h3.2M-1.6 1h3.2" /></g>
        <g transform="translate(18.2 15.4) rotate(-56)"><path d="M-1.6-1h3.2M-1.6 0h3.2M-1.6 1h3.2" /></g>
      </g>
      <g transform="rotate(-34 12 12)">
        <circle cx="12" cy="12" r="3.8" fill="#0047a0" />
        <path d="M8.2 12a3.8 3.8 0 0 1 7.6 0a1.9 1.9 0 0 1-3.8 0a1.9 1.9 0 0 0-3.8 0z" fill="#cd2e3a" />
      </g>
      <rect x="2" y="5" width="20" height="14" rx="1.5" fill="none" stroke="currentColor" strokeOpacity="0.35" />
    </svg>
  ),
  /** English: the Union Jack. */
  FlagEn: () => (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden="true">
      <clipPath id="flag-en-clip"><rect x="2" y="5" width="20" height="14" rx="1.5" /></clipPath>
      <g clipPath="url(#flag-en-clip)">
        <rect x="2" y="5" width="20" height="14" fill="#012169" />
        <path d="M2 5l20 14M22 5L2 19" stroke="#fff" strokeWidth="3.4" />
        <path d="M2 5l20 14M22 5L2 19" stroke="#c8102e" strokeWidth="1.2" />
        <path d="M12 5v14M2 12h20" stroke="#fff" strokeWidth="4.6" />
        <path d="M12 5v14M2 12h20" stroke="#c8102e" strokeWidth="2.6" />
      </g>
      <rect x="2" y="5" width="20" height="14" rx="1.5" fill="none" stroke="currentColor" strokeOpacity="0.35" />
    </svg>
  ),
  Palette: () =>
    icon(
      <>
        <path d="M12 21a9 9 0 1 1 9-9c0 1.7-1.3 3-3 3h-1.5a2 2 0 0 0-1.4 3.4A2 2 0 0 1 13.7 21z" />
        <circle cx="7.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="9.8" cy="8" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="14.2" cy="8" r="1.1" fill="currentColor" stroke="none" />
      </>,
    ),
  Success: () =>
    icon(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12.4 2.6 2.6L16 9.6" />
      </>,
    ),
  Warning: () =>
    icon(
      <>
        <path d="M10.3 3.9 2.6 17.1A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0z" />
        <path d="M12 9v4.5M12 17h.01" />
      </>,
    ),
  Question: () =>
    icon(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9.5a2.5 2.5 0 1 1 3.3 2.4c-.5.2-.8.7-.8 1.2v.6M12 17h.01" />
      </>,
    ),
  Recent: () =>
    icon(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </>,
    ),
  Reset: () =>
    icon(
      <>
        <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
        <path d="M3 4v5h5" />
      </>,
    ),
  FitWidth: () =>
    icon(
      <>
        <path d="M3 5v14M21 5v14" />
        <path d="M7 12h10M7 12l3-3M7 12l3 3M17 12l-3-3M17 12l-3 3" />
      </>,
    ),
  Doc: () =>
    icon(
      <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M9 13h6M9 17h4" />
      </>,
    ),
  Image: () =>
    icon(
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="8.5" cy="9.5" r="1.5" />
        <path d="M21 16l-5-5-6 6-2-2-5 5" />
      </>,
    ),
  Code: () =>
    icon(
      <>
        <path d="M8.5 8.5 4 12l4.5 3.5M15.5 8.5 20 12l-4.5 3.5M13.5 5l-3 14" />
      </>,
    ),
  Exit: () =>
    icon(
      <>
        <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
        <path d="M15 8l4 4-4 4M19 12H9" />
      </>,
    ),
  Snap: () =>
    icon(
      <>
        <path d="M4 9h16M4 15h16M9 4v16M15 4v16" />
        <circle cx="9" cy="9" r="2" fill="currentColor" stroke="none" />
      </>,
    ),
  Help: () =>
    icon(
      <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
        <path d="M10 12.5a2 2 0 1 1 2.6 1.9c-.4.2-.6.6-.6 1M12 18h.01" />
      </>,
    ),
};
