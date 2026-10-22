// Start page backgrounds: the scene ids and how fast each part of a scene moves.
// Every scene is a WebGL 3D world (src/ui/start3d/). This file holds only the
// plain values the settings, the start page and the tests share.

export const START_SCENE_IDS = [
  'valley', 'ocean', 'aurora', 'stars', 'rain', 'snow', 'dusk', 'forest', 'dunes', 'city',
  'nebula', 'bokeh', 'grid', 'ribbons', 'embers', 'lake', 'sunrise', 'fireflies', 'geometry', 'ink',
  'petals', 'mountains',
];

const LEGACY_SPEED = { off: 0, slow: 20, medium: 55, fast: 100 };

/**
 * Internal scene clocks (camera / objects / sky) all follow the one Overall
 * speed slider. The UI no longer exposes separate channel controls.
 */
export const START_SPEED_CHANNELS = [
  { id: 'camera', key: 'cameraSpeed', label: 'start.speed.camera' },
  { id: 'objects', key: 'objectSpeed', label: 'start.speed.objects' },
  { id: 'sky', key: 'skySpeed', label: 'start.speed.sky' },
];

export function startSceneId(id) {
  return START_SCENE_IDS.includes(id) ? id : 'valley';
}

/** Overall motion as a percent, 0 (still) through 100. Older names map onto the same pace. */
export function startSpeedPercent(value) {
  if (typeof value === 'string' && value in LEGACY_SPEED) return LEGACY_SPEED[value];
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 20;
  return Math.max(0, Math.min(100, n));
}

/**
 * 0 holds one frame. 20 (the default) is the scene's designed pace (1×).
 * Above that the curve opens up so the top of the slider is clearly faster:
 * 50 ≈ 5×, 100 = 12× designed pace.
 */
export function motionScale(percent) {
  const p = startSpeedPercent(percent);
  if (p <= 20) return p / 20;
  return 1 + (p - 20) * (11 / 80);
}

/**
 * How many seconds each clock advances per real second from `startScreen.motion`.
 * Channel keys left in older saves are ignored so one slider drives everything.
 */
export function startRates(screen = {}) {
  const base = motionScale(screen.motion);
  const out = {};
  for (const channel of START_SPEED_CHANNELS) out[channel.id] = base;
  return out;
}

/** How see-through the background is, 0 (fully shown) through 100 (only the theme colour). */
export function startTransparency(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/** True when nothing in the scene would move: no need to keep drawing frames. */
export function startIsStill(rates) {
  return START_SPEED_CHANNELS.every((channel) => !(rates[channel.id] > 0));
}
