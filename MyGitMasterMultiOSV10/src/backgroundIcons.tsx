/**
 * The start screen backgrounds' icons, in colour: each kind has three tones from the
 * shared palette (src/iconTones.ts, shades per light/dark theme in src/icons.css) —
 * the outline runs from the first tone to the second, and the third washes the tile
 * behind it. Used by the background picker on the start screen and in
 * Preferences › Start screen.
 */
import { useId } from "react";
import type { BackgroundKind } from "../core/startScreen";
import type { Tone } from "./iconTones";
import { BACKGROUND_ICONS } from "./startBackground";
import { StartIcon } from "./startIcons";

export const BACKGROUND_TONES: Record<BackgroundKind, readonly [Tone, Tone, Tone]> = {
  history: ["orange", "green", "amber"],
  diffLines: ["green", "red", "sky"],
  mergeFlow: ["purple", "blue", "pink"],
  folderTrees: ["amber", "brown", "yellow"],
  constellation: ["indigo", "sky", "purple"],
  conflicts: ["red", "orange", "yellow"],
  syncArrows: ["teal", "blue", "green"],
  wordDiff: ["sky", "pink", "cyan"],
  hexBytes: ["slate", "cyan", "indigo"],
  pixelDiff: ["pink", "sky", "purple"],
  pairs: ["blue", "teal", "indigo"],
  overview: ["green", "amber", "teal"],
  binaryRain: ["green", "teal", "cyan"],
  scanBeam: ["cyan", "blue", "sky"],
  tableCells: ["purple", "indigo", "blue"],
  waveforms: ["pink", "purple", "red"],
  ripples: ["blue", "cyan", "sky"],
  aurora: ["yellow", "orange", "pink"],
  hexGrid: ["indigo", "purple", "slate"],
  bubbles: ["sky", "teal", "blue"],
};

/** The light-theme shades, for a window that has not loaded icons.css. */
const FALLBACK: Record<Tone, string> = {
  blue: "#2563eb", sky: "#0284c7", indigo: "#4f46e5", purple: "#9333ea", pink: "#db2777", red: "#dc2626",
  orange: "#ea580c", amber: "#b86e00", yellow: "#a16207", green: "#16a34a", teal: "#0d9488", cyan: "#0891b2",
  slate: "#526075", brown: "#92400e",
};

export const toneColor = (tone: Tone) => `var(--tone-${tone}, ${FALLBACK[tone]})`;

export function BackgroundIcon({ kind, size = 16 }: { kind: BackgroundKind; size?: number }) {
  const id = `bgi-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [from, to, wash] = BACKGROUND_TONES[kind];
  return (
    <span className="bg-icon" data-tones={`${from} ${to} ${wash}`} style={{ width: size + 6, height: size + 6, background: `color-mix(in srgb, ${toneColor(wash)} 22%, transparent)` }}>
      <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
        <defs>
          <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="2" y1="2" x2="14" y2="14">
            <stop offset="0" style={{ stopColor: toneColor(from) }} />
            <stop offset="1" style={{ stopColor: toneColor(to) }} />
          </linearGradient>
        </defs>
      </svg>
      <StartIcon name={BACKGROUND_ICONS[kind]} size={size} color={`url(#${id})`} />
    </span>
  );
}
