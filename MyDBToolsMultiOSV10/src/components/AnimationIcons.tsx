// A coloured icon for each of the twenty moving backgrounds, drawn to suggest the
// animation itself (waves, rain, orbits …). Each has its own colour; dark themes
// get a lighter shade of it (styles/shell.css, .anim-ic).
import type { ReactNode } from 'react';

const ICONS: Record<string, { color: string; dark: string; paths: ReactNode }> = {
  aurora: { color: '#10b981', dark: '#6ee7b7', paths: <><path d="M3 15c3-6 6-6 9 0s6 6 9 0" /><path d="M3 10c3-5 6-5 9 0s6 5 9 0" opacity=".55" /></> },
  waves: { color: '#0284c7', dark: '#7dd3fc', paths: <><path d="M2 9c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0" /><path d="M2 15c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0" /></> },
  particles: { color: '#7c3aed', dark: '#c4b5fd', paths: <><circle cx="6" cy="7" r="1.6" /><circle cx="15" cy="5" r="1.2" /><circle cx="11" cy="12" r="2" /><circle cx="18" cy="14" r="1.4" /><circle cx="7" cy="18" r="1.2" /></> },
  constellation: { color: '#4f46e5', dark: '#a5b4fc', paths: <><path d="M4 18l5-8 6 3 5-8" /><circle cx="4" cy="18" r="1.5" /><circle cx="9" cy="10" r="1.5" /><circle cx="15" cy="13" r="1.5" /><circle cx="20" cy="5" r="1.5" /></> },
  bubbles: { color: '#06b6d4', dark: '#67e8f9', paths: <><circle cx="8" cy="15" r="4" /><circle cx="16" cy="9" r="3" /><circle cx="17" cy="17" r="1.8" /></> },
  gridflow: { color: '#0d9488', dark: '#5eead4', paths: <><path d="M3 8h18M3 16h18M8 3v18M16 3v18" /></> },
  flowchart: { color: '#ea580c', dark: '#fdba74', paths: <><rect x="8" y="2.5" width="8" height="5" rx="1" /><path d="M12 7.5v4" /><path d="M12 11.5l4 3-4 3-4-3z" /><path d="M12 17.5v4" /></> },
  starfield: { color: '#ca8a04', dark: '#fde047', paths: <><path d="M12 3l1.8 4.6 4.7.4-3.6 3 1.2 4.7L12 13.3 7.9 15.7l1.2-4.7-3.6-3 4.7-.4z" /><circle cx="19" cy="19" r="1" /><circle cx="5" cy="19" r="0.8" /></> },
  rain: { color: '#2563eb', dark: '#93c5fd', paths: <><path d="M7 4l-2 5M13 3l-2 5M19 4l-2 5M9 13l-2 5M15 12l-2 5M20 15l-1.5 4" /></> },
  snow: { color: '#0ea5e9', dark: '#bae6fd', paths: <><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" /><path d="M10 5l2 2 2-2M10 19l2-2 2 2" /></> },
  fireflies: { color: '#84cc16', dark: '#d9f99d', paths: <><circle cx="7" cy="8" r="2" /><circle cx="16" cy="6" r="1.4" /><circle cx="14" cy="15" r="2.2" /><circle cx="6" cy="17" r="1.2" /></> },
  ripples: { color: '#0891b2', dark: '#a5f3fc', paths: <><circle cx="12" cy="12" r="2" /><circle cx="12" cy="12" r="5.5" /><circle cx="12" cy="12" r="9" opacity=".6" /></> },
  coderain: { color: '#16a34a', dark: '#86efac', paths: <><path d="M6 3v6M6 12v2M12 6v8M12 17v3M18 3v4M18 10v8" /></> },
  hexagons: { color: '#9333ea', dark: '#d8b4fe', paths: <><path d="M8 4l4 2.3v4.6L8 13.2 4 10.9V6.3z" /><path d="M16 10.8l4 2.3v4.6l-4 2.3-4-2.3v-4.6z" /></> },
  orbits: { color: '#db2777', dark: '#f9a8d4', paths: <><circle cx="12" cy="12" r="2.2" /><ellipse cx="12" cy="12" rx="9" ry="4" /><ellipse cx="12" cy="12" rx="4" ry="9" transform="rotate(35 12 12)" /></> },
  lava: { color: '#dc2626', dark: '#fca5a5', paths: <><path d="M9 3h6l1 4-1 14H9L8 7z" /><circle cx="12" cy="11" r="1.8" /><circle cx="11" cy="16" r="1.2" /></> },
  spiral: { color: '#6d28d9', dark: '#ddd6fe', paths: <><path d="M12 12c0-1.5 2-1.5 2 0s-1.5 3-4 3-4-2-4-4 2.5-6 6-6 6 3 6 6-3 8-8 8" /></> },
  confetti: { color: '#e11d48', dark: '#fda4af', paths: <><path d="M5 5l2 3M12 3v3M19 5l-2 3M7 13l-3 1M17 13l3 1" /><rect x="9" y="10" width="2.5" height="2.5" transform="rotate(20 10 11)" /><path d="M14 17l2 3M8 18l-1 3" /></> },
  nodes: { color: '#0f766e', dark: '#99f6e4', paths: <><circle cx="5" cy="6" r="2" /><circle cx="19" cy="7" r="2" /><circle cx="12" cy="18" r="2" /><path d="M7 6.4l10 .4M6 8l5 8.3M17.8 8.8L13 16.4" /></> },
  ribbons: { color: '#c026d3', dark: '#f0abfc', paths: <><path d="M3 7c4 0 5 4 9 4s5-4 9-4" /><path d="M3 15c4 0 5 4 9 4s5-4 9-4" opacity=".6" /></> },
};

export function AnimationIcon({ kind }: { kind: string }) {
  const icon = ICONS[kind];
  if (!icon) return null;
  return (
    <svg
      className="anim-ic"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ '--anim-light': icon.color, '--anim-dark': icon.dark } as React.CSSProperties}
    >
      {icon.paths}
    </svg>
  );
}

export const ANIMATION_ICON_KINDS = Object.keys(ICONS);
