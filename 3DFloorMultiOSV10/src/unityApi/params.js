/**
 * Tunable FloorPlanTo3D (Unity/API) parameters.
 * Sent to the Mask R-CNN API and applied during client-side normalize/build.
 */

export const UNITY_PARAMS_STORAGE_KEY = 'fp3d.unity.params.v2';

/** @typedef {typeof DEFAULT_UNITY_PARAMS} UnityParams */

export const DEFAULT_UNITY_PARAMS = Object.freeze({
  /** Mask R-CNN score threshold (lower → more detections). */
  minConfidence: 0.4,
  /** Cap instances returned by the model. */
  maxDetections: 180,
  /** Drop boxes smaller than this (px on longer side). */
  minBoxSidePx: 8,
  /** Nominal door width (m) for meters-per-pixel scale. */
  doorWidthM: 0.9,
  /** When no doors: averageDoor ≈ max(24, min(W,H) * ratio). */
  doorFallbackRatio: 0.045,
  /** Include class in results. */
  includeWalls: true,
  includeWindows: true,
  includeDoors: true,
  /** Client builder: merge double-line walls. */
  mergeParallel: true,
  /** Client builder: carve openings out of walls. */
  carveOpenings: true,
  /** Opening-to-wall band multiplier for carve. */
  carveBandScale: 1.35,
  /** Parallel-wall merge gap as fraction of min(image side). */
  parallelGapRatio: 0.015,
});

export const UNITY_PARAM_FIELDS = [
  { key: 'minConfidence', min: 0.2, max: 0.9, step: 0.05, kind: 'float' },
  { key: 'maxDetections', min: 20, max: 300, step: 10, kind: 'int' },
  { key: 'minBoxSidePx', min: 4, max: 40, step: 1, kind: 'int' },
  { key: 'doorWidthM', min: 0.7, max: 1.2, step: 0.05, kind: 'float' },
  { key: 'doorFallbackRatio', min: 0.025, max: 0.08, step: 0.005, kind: 'float' },
  { key: 'carveBandScale', min: 1.0, max: 2.0, step: 0.05, kind: 'float' },
  { key: 'parallelGapRatio', min: 0.008, max: 0.04, step: 0.001, kind: 'float' },
];

/**
 * @param {Partial<UnityParams>} [raw]
 * @returns {UnityParams}
 */
export function normalizeUnityParams(raw = {}) {
  const d = DEFAULT_UNITY_PARAMS;
  const src = raw && typeof raw === 'object' ? raw : {};
  const num = (key, fallback) => {
    const v = Number(src[key]);
    return Number.isFinite(v) ? v : fallback;
  };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const bool = (key, fallback) => (src[key] === undefined ? fallback : Boolean(src[key]));

  return {
    minConfidence: clamp(num('minConfidence', d.minConfidence), 0.05, 0.99),
    maxDetections: Math.round(clamp(num('maxDetections', d.maxDetections), 10, 500)),
    minBoxSidePx: Math.round(clamp(num('minBoxSidePx', d.minBoxSidePx), 2, 80)),
    doorWidthM: clamp(num('doorWidthM', d.doorWidthM), 0.5, 1.5),
    doorFallbackRatio: clamp(num('doorFallbackRatio', d.doorFallbackRatio), 0.015, 0.12),
    includeWalls: bool('includeWalls', d.includeWalls),
    includeWindows: bool('includeWindows', d.includeWindows),
    includeDoors: bool('includeDoors', d.includeDoors),
    mergeParallel: bool('mergeParallel', d.mergeParallel),
    carveOpenings: bool('carveOpenings', d.carveOpenings),
    carveBandScale: clamp(num('carveBandScale', d.carveBandScale), 0.8, 2.5),
    parallelGapRatio: clamp(num('parallelGapRatio', d.parallelGapRatio), 0.005, 0.08),
  };
}

/** @returns {UnityParams} */
export function loadUnityParams() {
  try {
    const raw = localStorage.getItem(UNITY_PARAMS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_UNITY_PARAMS };
    return normalizeUnityParams(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_UNITY_PARAMS };
  }
}

/** @param {Partial<UnityParams>} params */
export function saveUnityParams(params) {
  const normalized = normalizeUnityParams(params);
  try {
    localStorage.setItem(UNITY_PARAMS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    /* ignore */
  }
  return normalized;
}

export function resetUnityParams() {
  try {
    localStorage.removeItem(UNITY_PARAMS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_UNITY_PARAMS };
}

/** Payload sent to FloorPlanTo3D-API as form field `params`. */
export function unityParamsForApi(params) {
  const p = normalizeUnityParams(params);
  return {
    minConfidence: p.minConfidence,
    maxDetections: p.maxDetections,
    minBoxSidePx: p.minBoxSidePx,
    doorFallbackRatio: p.doorFallbackRatio,
    includeWalls: p.includeWalls,
    includeWindows: p.includeWindows,
    includeDoors: p.includeDoors,
  };
}
