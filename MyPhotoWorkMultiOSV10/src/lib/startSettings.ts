/**
 * What the start screen remembers: the moving background (which one, how fast, how
 * see-through, whether it changes by itself) and where the cards were put. No canvas
 * and no DOM here, so the settings loader can use it anywhere.
 */

export const ANIMATION_KINDS = [
  'bokeh', 'aperture', 'filmStrip', 'histogram', 'toneCurve', 'colorWheel',
  'layerStack', 'halftone', 'mosaic', 'lightLeak', 'lensFlare', 'brushStrokes',
  'rgbChannels', 'filmGrain', 'contactSheet', 'marchingAnts', 'gradientMesh', 'kaleidoscope',
  'viewfinder', 'instantPhotos',
] as const

export type AnimationKind = (typeof ANIMATION_KINDS)[number]

export type StartBackground = {
  kind: AnimationKind
  /** 0-100; 0 stops it, 100 is the fastest (see speedFactor). */
  speed: number
  /** Percent; 100 leaves only the theme's plain background. */
  transparency: number
  /** Another kind every N seconds; 0 keeps the chosen one. */
  shuffleSec: number
  /** Automatic change on or off; the interval is kept while it is off. */
  shuffleOn: boolean
  /** Start on a random kind each time. */
  random: boolean
  /** Saved card positions (see startLayout.ts), or null for the default arrangement. */
  layout: unknown
}

export const DEFAULT_START_BACKGROUND: StartBackground = {
  kind: 'bokeh', speed: 50, transparency: 0, shuffleSec: 20, shuffleOn: false, random: false, layout: null,
}

export const SPEED_RANGE = { min: 0, max: 100, step: 5 }

/** The fastest setting runs this many times the backgrounds' natural pace. */
export const SPEED_MAX_FACTOR = 5

/**
 * How fast the scene time runs for a speed setting: linear from 0 (still) to 100
 * (five times the natural pace), so every step of the slider is plain to see. The
 * default, 50, runs 2.5 times the natural pace, so the motion reads clearly.
 */
export function speedFactor(speed: number) {
  const value = Math.max(SPEED_RANGE.min, Math.min(SPEED_RANGE.max, Number(speed) || 0))
  return (value / SPEED_RANGE.max) * SPEED_MAX_FACTOR
}
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
    // Older settings had no switch: a non-zero interval meant on.
    shuffleOn: typeof raw.shuffleOn === 'boolean' ? raw.shuffleOn : Number(raw.shuffleSec) > 0,
    random: raw.random === true,
    layout: raw.layout && typeof raw.layout === 'object' ? raw.layout : null,
  }
}
