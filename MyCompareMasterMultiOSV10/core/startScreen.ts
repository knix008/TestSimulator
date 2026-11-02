/**
 * The start screen's settings: which moving background, how fast, how opaque the
 * cards over it are, and where the cards sit.
 *
 * Kept in the app settings (`settings.startScreen`) so the start screen and the
 * Settings window's Start screen tab edit the same values and follow each other.
 * The drawing lives in src/startBackground.ts; this module is only the names, the
 * limits and the validation, so the server can sanitise what it stores.
 */

export const BACKGROUND_KINDS = [
  "diffLines",
  "mergeFlow",
  "folderTrees",
  "hexBytes",
  "pixelDiff",
  "pairs",
  "history",
  "overview",
  "wordDiff",
  "conflicts",
  "syncArrows",
  "binaryRain",
  "scanBeam",
  "tableCells",
  "waveforms",
  "constellation",
  "ripples",
  "aurora",
  "hexGrid",
  "bubbles",
] as const;

export type BackgroundKind = (typeof BACKGROUND_KINDS)[number];

export type StartScreenSettings = {
  background: BackgroundKind;
  /** Percent of normal speed, 0..300; null means the default for the motion setting. */
  speed: number | null;
  /** Seconds between automatic changes of background; 0 is off. */
  shuffleSec: number;
  /** How opaque the cards over the background are, in percent. */
  cardOpacity: number;
  /** The card board (see src/startLayout.ts), or null for the default arrangement. */
  layout: unknown;
};

export const SPEED_MIN = 0;
export const SPEED_MAX = 300;
export const SPEED_STEP = 10;
export const DEFAULT_SPEED = 100;
/** The default speed when the system asks for reduced motion: slower, never stopped. */
export const REDUCED_MOTION_SPEED = 40;
export const OPACITY_MIN = 20;
export const OPACITY_MAX = 100;
export const OPACITY_STEP = 5;
export const SHUFFLE_SECONDS = 20;

export const DEFAULT_START_SCREEN: StartScreenSettings = {
  background: "diffLines",
  speed: null,
  shuffleSec: 0,
  cardOpacity: 80,
  layout: null,
};

export function isBackgroundKind(value: unknown): value is BackgroundKind {
  return typeof value === "string" && (BACKGROUND_KINDS as readonly string[]).includes(value);
}

const stepped = (value: number, min: number, max: number, step: number) =>
  Math.max(min, Math.min(max, Math.round(value / step) * step));

/** The speed actually used: the saved one, or the default for the motion setting. */
export function effectiveSpeed(settings: Pick<StartScreenSettings, "speed">, reducedMotion: boolean): number {
  return settings.speed ?? (reducedMotion ? REDUCED_MOTION_SPEED : DEFAULT_SPEED);
}

/**
 * Anything stored, made valid. A background that no longer exists falls back to the
 * default one, and every number is clamped to its range and step.
 */
export function sanitizeStartScreen(value: unknown): StartScreenSettings {
  const v = value && typeof value === "object" ? (value as Partial<StartScreenSettings>) : {};
  const speed = v.speed === undefined || v.speed === null ? NaN : Number(v.speed);
  const opacity = v.cardOpacity === undefined || v.cardOpacity === null ? NaN : Number(v.cardOpacity);
  const shuffle = Number(v.shuffleSec);
  return {
    background: isBackgroundKind(v.background) ? v.background : DEFAULT_START_SCREEN.background,
    speed: Number.isFinite(speed) ? stepped(speed, SPEED_MIN, SPEED_MAX, SPEED_STEP) : null,
    shuffleSec: Number.isFinite(shuffle) && shuffle > 0 ? Math.min(600, Math.max(5, Math.round(shuffle))) : 0,
    cardOpacity: Number.isFinite(opacity)
      ? stepped(opacity, OPACITY_MIN, OPACITY_MAX, OPACITY_STEP)
      : DEFAULT_START_SCREEN.cardOpacity,
    layout: v.layout && typeof v.layout === "object" && !Array.isArray(v.layout) ? v.layout : null,
  };
}
