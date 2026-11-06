import React from 'react';
import { useTranslation } from 'react-i18next';
import { ANIMATIONS } from '../lib/background';

export function themeColors() {
  const style = getComputedStyle(document.documentElement);
  const read = (name) => style.getPropertyValue(`--${name}`).trim();
  const bg = read('bg');
  const n = parseInt(bg.slice(1), 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return { bg, accent: read('accent'), accent2: read('accent-2') || read('accent'), text: read('text'), danger: read('danger'), dark: lum < 0.45 };
}

// A small picture for each background: its colour and what it shows.
const ICONS = {
  zipper: ['#f59e0b', <><path d="M12 3v18" /><path d="M8 6h3M13 8h3M8 10h3M13 12h3M8 14h3M13 16h3" /></>],
  squeeze: ['#14b8a6', <><path d="M3 12h6M6 9l3 3-3 3" /><path d="M21 12h-6M18 9l-3 3 3 3" /><path d="M12 5v14" /></>],
  files: ['#3b82f6', <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /></>],
  volumes: ['#8b5cf6', <><rect x="3" y="5" width="18" height="4" rx="1" /><rect x="3" y="11" width="11" height="4" rx="1" /><rect x="3" y="17" width="6" height="3" rx="1" /></>],
  boxes: ['#f97316', <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></>],
  bytes: ['#22c55e', <><rect x="5" y="4" width="5" height="7" rx="2" /><path d="M16 4v7" /><path d="M6 14v7" /><rect x="13" y="14" width="5" height="7" rx="2" /></>],
  aurora: ['#10b981', <><path d="M3 18c3-10 5-12 7-12s1 8 4 8 3-6 7-9" /><path d="M3 21c4-4 6-5 9-5s5 1 9-3" /></>],
  waves: ['#0ea5e9', <><path d="M3 8c3-3 6-3 9 0s6 3 9 0" /><path d="M3 13c3-3 6-3 9 0s6 3 9 0" /><path d="M3 18c3-3 6-3 9 0s6 3 9 0" /></>],
  particles: ['#ec4899', <><circle cx="6" cy="7" r="1.6" /><circle cx="15" cy="5" r="1.2" /><circle cx="19" cy="12" r="1.8" /><circle cx="10" cy="13" r="1.4" /><circle cx="5" cy="18" r="1.2" /><circle cx="15" cy="19" r="1.6" /></>],
  constellation: ['#6366f1', <><path d="m5 6 7 4 7-5M12 10l-3 9 10-3" /><circle cx="5" cy="6" r="1.5" /><circle cx="12" cy="10" r="1.5" /><circle cx="19" cy="5" r="1.5" /><circle cx="9" cy="19" r="1.5" /><circle cx="19" cy="16" r="1.5" /></>],
  bubbles: ['#06b6d4', <><circle cx="9" cy="14" r="5" /><circle cx="17" cy="8" r="3" /><circle cx="18" cy="17" r="2" /></>],
  gridflow: ['#64748b', <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18M3 9h18M3 15h18" /></>],
  starfield: ['#eab308', <path d="m12 3 2.6 6 6.4.6-4.8 4.2 1.4 6.2-5.6-3.3L6.400 20l1.400-6.200L3 9.600 9.400 9z" />],
  snow: ['#38bdf8', <><path d="M12 3v18M4.200 7.500l15.600 9M19.800 7.500l-15.600 9" /><path d="m9.500 5 2.500 2 2.500-2M9.500 19l2.500-2 2.500 2" /></>],
  fireflies: ['#a3e635', <><circle cx="7" cy="8" r="2" /><circle cx="17" cy="7" r="1.400" /><circle cx="14" cy="16" r="2.400" /><circle cx="6" cy="18" r="1.200" /></>],
  ripples: ['#2dd4bf', <><circle cx="12" cy="12" r="2" /><circle cx="12" cy="12" r="5.500" /><circle cx="12" cy="12" r="9" /></>],
  hexagons: ['#d97706', <><path d="m8 3 4 2.300v4.600L8 12.200 4 9.900V5.300z" /><path d="m16 3 4 2.300v4.600l-4 2.300-4-2.300V5.300z" /><path d="m12 11.700 4 2.300v4.600l-4 2.300-4-2.300V14z" /></>],
  orbits: ['#a855f7', <><circle cx="12" cy="12" r="2.500" /><ellipse cx="12" cy="12" rx="10" ry="4" /><circle cx="20" cy="9.500" r="1.200" /></>],
  lava: ['#ef4444', <><path d="M8 3h8l1 3-1 3c3 3 3 12-4 12S5 12 8 9L7 6z" /><circle cx="12" cy="15" r="2" /></>],
  ribbons: ['#f43f5e', <><path d="M3 7c5-4 7 8 12 4s4-5 6-5" /><path d="M3 15c5-4 7 8 12 4s4-5 6-5" /></>],
};

// The moving backgrounds, laid out to choose from.
export default function BackgroundCards({ value, onChange }) {
  const { t } = useTranslation();
  return (
    <div className="bg-cards" data-testid="bg-cards">
      {ANIMATIONS.map((kind) => {
        const [color, shape] = ICONS[kind];
        return (
          <button key={kind} type="button" className={`bg-card${kind === value ? ' on' : ''}`} data-bg-card={kind} aria-pressed={kind === value} title={t(`bg.${kind}`)} onClick={() => onChange(kind)}>
            <svg className="bg-card-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shape}</svg>
            <span className="bg-card-name">{t(`bg.${kind}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
