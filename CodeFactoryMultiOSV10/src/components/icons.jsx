// Inline SVG icons.
//
// Inline rather than an icon font or sprite sheet: they inherit `currentColor`,
// so a theme switch recolors every icon with no extra work, and they survive
// being exported inside a diagram or a report.

import React from 'react';

function Icon({ children, size = 15, viewBox = '0 0 24 24', strokeWidth = 1.8, fill = 'none' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill={fill}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flex: '0 0 auto', display: 'block' }}
    >
      {children}
    </svg>
  );
}

/* --------------------------------------------------------------- menus -- */

export const IconFile = (p) => (
  <Icon {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </Icon>
);

export const IconView = (p) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M9 9v11" />
  </Icon>
);

export const IconSettings = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.9 19a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 5 8.9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9.5a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Icon>
);

export const IconHelp = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
    <path d="M12 17h.01" />
  </Icon>
);

/* ---------------------------------------------------------- menu items -- */

export const IconOpen = (p) => (
  <Icon {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Icon>
);

export const IconSave = (p) => (
  <Icon {...p}>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <path d="M17 21v-8H7v8M7 3v5h8" />
  </Icon>
);

export const IconImport = (p) => (
  <Icon {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5M12 15V3" />
  </Icon>
);

export const IconExport = (p) => (
  <Icon {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M17 8l-5-5-5 5M12 3v12" />
  </Icon>
);

export const IconReport = (p) => (
  <Icon {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6M9 17h6" />
  </Icon>
);

export const IconTable = (p) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 10h18M3 15h18M9 4v16M15 4v16" />
  </Icon>
);

export const IconImage = (p) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path d="M21 16l-5-5-6 6-2-2-5 5" />
  </Icon>
);

export const IconSliders = (p) => (
  <Icon {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
    <circle cx="9" cy="6" r="2" />
    <circle cx="15" cy="12" r="2" />
    <circle cx="8" cy="18" r="2" />
  </Icon>
);

export const IconPalette = (p) => (
  <Icon {...p}>
    <path d="M12 3a9 9 0 1 0 0 18 2 2 0 0 0 1.7-3 2 2 0 0 1 1.7-3H18a3 3 0 0 0 3-3 9 9 0 0 0-9-9z" />
    <circle cx="7.5" cy="11.5" r="1" fill="currentColor" />
    <circle cx="10.5" cy="7.5" r="1" fill="currentColor" />
    <circle cx="15.5" cy="8.5" r="1" fill="currentColor" />
  </Icon>
);

export const IconHourglass = (p) => (
  <Icon {...p}>
    <path d="M7 3h10M7 21h10" />
    <path d="M8 3v3.5a4 4 0 0 0 1.4 3L12 12l-2.6 2.5A4 4 0 0 0 8 18v3" />
    <path d="M16 3v3.5a4 4 0 0 1-1.4 3L12 12l2.6 2.5a4 4 0 0 1 1.4 3V21" />
  </Icon>
);

/** A globe with meridians — the conventional mark for interface language. */
export const IconExpandAll = (p) => (
  <Icon {...p}>
    <path d="M8 6l4-3 4 3M8 18l4 3 4-3" />
    <path d="M12 3v18" />
    <path d="M4 12h16" />
  </Icon>
);

export const IconCollapseAll = (p) => (
  <Icon {...p}>
    <path d="M8 4l4 3 4-3M8 20l4-3 4 3" />
    <path d="M4 12h16" />
  </Icon>
);

/**
 * The interface language, drawn as the language itself rather than a generic
 * globe: the button's icon should say which language is on, not merely that a
 * language setting exists.
 */
function LanguageGlyph({ size = 16, text, letterSpacing }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={{ flex: '0 0 auto', display: 'block' }}
    >
      {/* The active language, set large enough to read at 16px. */}
      <text
        x="1"
        y="11"
        fill="currentColor"
        fontSize={text.length > 1 ? 13 : 15}
        fontWeight="700"
        letterSpacing={letterSpacing || 0}
        dominantBaseline="central"
        fontFamily='"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif'
      >
        {text}
      </text>
      {/* A swap mark, so the badge also reads as a control. */}
      <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.75">
        <path d="M4 18h13l-2.6-2.6" />
        <path d="M20 22H7l2.6 2.6" transform="translate(0,-4)" />
      </g>
    </svg>
  );
}

export const IconLanguageKo = (p) => <LanguageGlyph {...p} text="한" />;
export const IconLanguageEn = (p) => <LanguageGlyph {...p} text="EN" letterSpacing="-1" />;

/** Icon for a UI language id. */
export const LANGUAGE_ICONS = { ko: IconLanguageKo, en: IconLanguageEn };

/** A globe with meridians — used where no single language is meant. */
export const IconLanguage = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z" />
  </Icon>
);

export const IconChevronDown = (p) => (
  <Icon {...p} strokeWidth={2}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
);

/**
 * A live preview of one theme: its own background, accent, warning and
 * critical colors. Used in the toolbar's theme menu so the choice is made by
 * looking at the colors rather than by reading their names.
 */
export function themeSwatchIcon(theme) {
  return function ThemeSwatch({ size = 14 }) {
    const token = (name) => theme.tokens[name];
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" style={{ flex: '0 0 auto', display: 'block' }}>
        <rect x="0.5" y="0.5" width="13" height="13" rx="3" fill={token('--bg')} stroke={token('--border-strong')} />
        <rect x="2.5" y="3" width="3.5" height="8" rx="1" fill={token('--accent')} />
        <rect x="7" y="3" width="2" height="8" rx="0.8" fill={token('--warning')} />
        <rect x="9.8" y="3" width="2" height="8" rx="0.8" fill={token('--critical')} />
      </svg>
    );
  };
}

export const IconInfo = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-5M12 8h.01" />
  </Icon>
);

export const IconSearch = (p) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.6-3.6" />
  </Icon>
);

export const IconPlay = (p) => (
  <Icon {...p}>
    <path d="M6 4l14 8-14 8z" />
  </Icon>
);

export const IconStop = (p) => (
  <Icon {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconRefresh = (p) => (
  <Icon {...p}>
    <path d="M21 12a9 9 0 1 1-2.6-6.4" />
    <path d="M21 4v5h-5" />
  </Icon>
);

export const IconFolder = (p) => (
  <Icon {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Icon>
);

export const IconSidebar = (p) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </Icon>
);

/* ------------------------------------------------------ window controls -- */

export const IconMinimize = (p) => (
  <Icon {...p} strokeWidth={1.4} viewBox="0 0 12 12">
    <path d="M2 6h8" />
  </Icon>
);

export const IconMaximize = (p) => (
  <Icon {...p} strokeWidth={1.4} viewBox="0 0 12 12">
    <rect x="2.5" y="2.5" width="7" height="7" />
  </Icon>
);

export const IconRestore = (p) => (
  <Icon {...p} strokeWidth={1.4} viewBox="0 0 12 12">
    <rect x="2" y="4" width="6" height="6" />
    <path d="M4 4V2h6v6H8" />
  </Icon>
);

export const IconClose = (p) => (
  <Icon {...p} strokeWidth={1.4} viewBox="0 0 12 12">
    <path d="M3 3l6 6M9 3l-6 6" />
  </Icon>
);

/* -------------------------------------------------------------- views -- */

export const IconDashboard = (p) => (
  <Icon {...p}>
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </Icon>
);

export const IconGraph = (p) => (
  <Icon {...p}>
    <circle cx="5" cy="12" r="2.5" />
    <circle cx="18" cy="6" r="2.5" />
    <circle cx="18" cy="18" r="2.5" />
    <path d="M7.3 10.8L15.7 7M7.3 13.2l8.4 3.8" />
  </Icon>
);

export const IconClass = (p) => (
  <Icon {...p}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M4 9h16M4 14h16" />
  </Icon>
);

export const IconInheritance = (p) => (
  <Icon {...p}>
    <rect x="8.5" y="2.5" width="7" height="5" rx="1" />
    <rect x="2" y="16.5" width="7" height="5" rx="1" />
    <rect x="15" y="16.5" width="7" height="5" rx="1" />
    <path d="M12 7.5v4M5.5 16.5v-2.5h13v2.5" />
  </Icon>
);

export const IconSequence = (p) => (
  <Icon {...p}>
    <path d="M5 3v18M19 3v18" />
    <path d="M5 8h14M19 14H5" />
    <path d="M16 5l3 3-3 3M8 11l-3 3 3 3" />
  </Icon>
);

export const IconFlow = (p) => (
  <Icon {...p}>
    <rect x="2" y="9" width="6" height="6" rx="1" />
    <rect x="16" y="9" width="6" height="6" rx="1" />
    <path d="M8 12h8" />
    <path d="M13 9l3 3-3 3" />
  </Icon>
);

export const IconFiles = (p) => (
  <Icon {...p}>
    <path d="M9 3h5l4 4v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
    <path d="M14 3v4h4" />
    <path d="M5 8v11a2 2 0 0 0 2 2h8" />
  </Icon>
);

export const IconTree = (p) => (
  <Icon {...p}>
    <rect x="3" y="3" width="6" height="4" rx="1" />
    <rect x="15" y="10" width="6" height="4" rx="1" />
    <rect x="15" y="17" width="6" height="4" rx="1" />
    <path d="M6 7v10h9M6 12h9" />
  </Icon>
);

export const IconMetrics = (p) => (
  <Icon {...p}>
    <path d="M3 21V3" />
    <path d="M3 21h18" />
    <path d="M7 17v-5M12 17V7M17 17v-8" />
  </Icon>
);

export const IconCopy = (p) => (
  <Icon {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </Icon>
);

export const IconVariable = (p) => (
  <Icon {...p}>
    <path d="M7 4c-2 3-2 13 0 16M17 4c2 3 2 13 0 16" />
    <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
  </Icon>
);

export const IconDatabase = (p) => (
  <Icon {...p}>
    <ellipse cx="12" cy="6" rx="8" ry="3" />
    <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
    <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
  </Icon>
);

export const IconBug = (p) => (
  <Icon {...p}>
    <rect x="8" y="7" width="8" height="12" rx="4" />
    <path d="M8 11H4M20 11h-4M8 16H4.5M20 16h-3.5M9 7L7.5 4.5M15 7l1.5-2.5" />
  </Icon>
);

export const IconShield = (p) => (
  <Icon {...p}>
    <path d="M12 3l8 3v6c0 5-3.4 8.3-8 9.5C7.4 20.3 4 17 4 12V6z" />
    <path d="M9 12l2 2 4-4" />
  </Icon>
);

/** View id → icon, so the toolbar and menu stay in step. */
export const VIEW_ICONS = {
  summary: IconDashboard,
  callGraph: IconGraph,
  classDiagram: IconClass,
  inheritance: IconInheritance,
  sequence: IconSequence,
  dataFlow: IconFlow,
  fileRelations: IconFiles,
  directoryRelations: IconTree,
  metrics: IconMetrics,
  duplicates: IconCopy,
  globals: IconVariable,
  erd: IconDatabase,
  tableAccess: IconTable,
  bugRisk: IconBug,
  security: IconShield,
};
