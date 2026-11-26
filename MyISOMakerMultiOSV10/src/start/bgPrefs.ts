/** Start-screen background choice (this computer only). */
import { ANIMATIONS, DEFAULT_ANIMATION } from './background'

export type BgPrefs = {
  kind: string
  /** 0 = still … 2 = double speed */
  speed: number
  /** 0.15 … 1, the canvas opacity */
  opacity: number
  /** pick another background every `autoSec` seconds */
  auto: boolean
  autoSec: number
}

const KEY = 'isomaker.startBackground'
export const BG_DEFAULTS: BgPrefs = { kind: DEFAULT_ANIMATION, speed: 1, opacity: 0.85, auto: false, autoSec: 30 }

const clamp = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d
}

export function loadBgPrefs(): BgPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}') || {}
    return {
      kind: (ANIMATIONS as string[]).includes(raw.kind) ? raw.kind : BG_DEFAULTS.kind,
      speed: clamp(raw.speed, 0, 2, BG_DEFAULTS.speed),
      opacity: clamp(raw.opacity, 0.15, 1, BG_DEFAULTS.opacity),
      auto: raw.auto === true,
      autoSec: clamp(raw.autoSec, 10, 600, BG_DEFAULTS.autoSec),
    }
  } catch {
    return { ...BG_DEFAULTS }
  }
}

export function saveBgPrefs(p: BgPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* no storage */
  }
}
