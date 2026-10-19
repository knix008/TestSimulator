// Start page backgrounds: the scene ids and how fast each part of a scene moves.
// Every scene is a WebGL 3D world (src/lib/start3d/). This file holds only the
// plain values the settings, the start page and the tests share.

export const START_SCENE_IDS = [
  'terminal', 'coderain', 'circuit', 'racks', 'git', 'tokens', 'binary', 'keyboard', 'chip',
  'network', 'stack', 'ast', 'debug', 'containers', 'fiber', 'hex', 'pipeline', 'repo', 'api',
  'glyphs',
];

const LEGACY_SPEED = { off: 0, slow: 20, medium: 55, fast: 100 };

/**
 * The parts of a scene that move on their own clock, each with its own speed.
 * `camera`: the flight or walk of the viewer. `objects`: waves, weather, trees,
 * particles, shapes. `sky`: clouds, sun, stars and light.
 */
export const START_SPEED_CHANNELS = [
  { id: 'camera', key: 'cameraSpeed', label: 'start.speed.camera' },
  { id: 'objects', key: 'objectSpeed', label: 'start.speed.objects' },
  { id: 'sky', key: 'skySpeed', label: 'start.speed.sky' },
];

/** A channel speed is a percent of the scene's own pace, 0 (held) through 300. */
export const CHANNEL_MAX = 300;
export const CHANNEL_DEFAULT = 100;

export function startSceneId(id) {
  return START_SCENE_IDS.includes(id) ? id : 'terminal';
}

/** Overall motion as a percent, 0 (still) through 100. Older names map onto the same pace. */
export function startSpeedPercent(value) {
  if (typeof value === 'string' && value in LEGACY_SPEED) return LEGACY_SPEED[value];
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 20;
  return Math.max(0, Math.min(100, n));
}

/** A channel percent, 0 through CHANNEL_MAX. Missing values are the scene's own pace. */
export function channelPercent(value) {
  if (value == null || value === '') return CHANNEL_DEFAULT;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return CHANNEL_DEFAULT;
  return Math.max(0, Math.min(CHANNEL_MAX, n));
}

/** 0 holds one frame. 20 (the default) is one shared pace on every scene; 100 is five times that. */
export function motionScale(percent) {
  return startSpeedPercent(percent) / 20;
}

/**
 * How many seconds each clock advances per real second, from a saved
 * `startScreen` setting: { motion, cameraSpeed, objectSpeed, skySpeed }.
 */
export function startRates(screen = {}) {
  const base = motionScale(screen.motion);
  const out = {};
  for (const channel of START_SPEED_CHANNELS) out[channel.id] = base * (channelPercent(screen[channel.key]) / 100);
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
