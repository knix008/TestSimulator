// The 20 moving 3D start-screen worlds (src/lib/start3d/) and how fast they play.
// One speed scales the camera, the objects and the sky together.

export const START_SCENES = [
  'valley', 'ocean', 'dusk', 'forest', 'lake', 'sunrise', 'mountains', 'dunes', 'rain', 'snow',
  'aurora', 'stars', 'nebula', 'city', 'fireflies', 'petals', 'embers', 'bokeh', 'ribbons', 'geometry',
];

export const START_SCENE_DEFAULT = 'valley';
export const START_MOTION_DEFAULT = 20;

export function startSceneId(id) {
  return START_SCENES.includes(id) ? id : START_SCENE_DEFAULT;
}

/** Overall motion as a percent, 0 (still) through 100. */
export function startSpeedPercent(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return START_MOTION_DEFAULT;
  return Math.max(0, Math.min(100, n));
}

/** 0 holds one frame. 20 plays every scene at its designed pace; 100 is five times that. */
export function motionScale(percent) {
  return startSpeedPercent(percent) / 20;
}

/** Seconds of scene time per real second for the camera, the objects and the sky. */
export function startRates(motion) {
  const scale = motionScale(motion);
  return { camera: scale, objects: scale, sky: scale };
}

/** How see-through the picture is, 0 (solid) through 100 (only the theme colour). */
export function startTransparency(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export function startIsStill(rates) {
  return !(rates.camera > 0) && !(rates.objects > 0) && !(rates.sky > 0);
}
