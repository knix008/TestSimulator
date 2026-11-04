/**
 * What the start screen remembers: the moving background (which one, how fast, how
 * see-through, whether it changes by itself) and where the cards were put. No canvas
 * and no DOM here, so the settings loader can use it anywhere.
 */

export const ANIMATION_KINDS = [
  'bokeh', 'aperture', 'filmStrip', 'histogram', 'toneCurve', 'colorWheel',
  'layerStack', 'halftone', 'mosaic', 'lightLeak', 'lensFlare', 'brushStrokes',
  'rgbChannels', 'filmGrain', 'contactSheet', 'marchingAnts', 'gradientMesh', 'kaleidoscope',
] as const

export type AnimationKind = (typeof ANIMATION_KINDS)[number]

export type StartBackground = {
  kind: AnimationKind
  /** Percent of normal speed; 0 stops it. */
  speed: number
  /** Percent; 100 leaves only the theme's plain background. */
  transparency: number
  /** Another kind every N seconds; 0 keeps the chosen one. */
  shuffleSec: number
  /** Start on a random kind each time. */
  random: boolean
  /** Saved card positions (see startLayout.ts), or null for the default arrangement. */
  layout: unknown
}

export const DEFAULT_START_BACKGROUND: StartBackground = {
  kind: 'bokeh', speed: 100, transparency: 0, shuffleSec: 0, random: false, layout: null,
}

export const SPEED_RANGE = { min: 0, max: 300, step: 10 }
export const TRANSPARENCY_RANGE = { min: 0, max: 100, step: 5 }
export const SHUFFLE_RANGE = { min: 0, max: 600, step: 5 }

const clampTo = (value: unknown, range: { min: number; max: number }, fallback: number) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(range.min, Math.min(range.max, number)) : fallback
}

/** Storage can hold anything: whatever cannot be used falls back to the default. */
export function normalizeStartBackground(value: unknown): StartBackground {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<StartBackground>
  return {
    kind: ANIMATION_KINDS.includes(raw.kind as AnimationKind) ? raw.kind as AnimationKind : DEFAULT_START_BACKGROUND.kind,
    speed: clampTo(raw.speed, SPEED_RANGE, DEFAULT_START_BACKGROUND.speed),
    transparency: clampTo(raw.transparency, TRANSPARENCY_RANGE, DEFAULT_START_BACKGROUND.transparency),
    shuffleSec: clampTo(raw.shuffleSec, SHUFFLE_RANGE, DEFAULT_START_BACKGROUND.shuffleSec),
    random: raw.random === true,
    layout: raw.layout && typeof raw.layout === 'object' ? raw.layout : null,
  }
}
