/**
 * Tunable DreamSpace detection parameters (persisted in localStorage).
 * Defaults tuned for better vertical-wall recall on architectural plans.
 */

export const DREAMSPACE_PARAMS_STORAGE_KEY = 'fp3d.dreamspace.params.v1';

/** @typedef {typeof DEFAULT_DREAMSPACE_PARAMS} DreamspaceParams */

export const DEFAULT_DREAMSPACE_PARAMS = Object.freeze({
  /** Working image max side (px). Higher helps thin vertical strokes. */
  maxSide: 800,
  /**
   * Ink threshold = clamp(mean * inkMeanScale).
   * Lower → more ink (catches faint vertical lines).
   */
  inkMeanScale: 0.82,
  /** Min wall length as fraction of min(image side) — horizontal. */
  minRunRatioH: 0.022,
  /** Min wall length as fraction of min(image side) — vertical (lower = more V walls). */
  minRunRatioV: 0.014,
  /** Absolute floor for min run length (px). */
  minRunFloorH: 10,
  minRunFloorV: 8,
  /** Extra horizontal dilate passes before vertical extraction (0–3). */
  verticalDilate: 2,
  /** Center tolerance scale when merging collinear vertical stubs. */
  verticalMergeScale: 1.6,
  /** Morphological open (erode+dilate) before extraction. */
  morphOpen: true,
  /** Extra dilate after open (reconnects broken strokes). */
  extraDilate: 1,
  /** Collinear merge gap as fraction of min side. */
  mergeGapRatio: 0.014,
  /** Parallel double-wall collapse gap as fraction of min side. */
  parallelGapRatio: 0.032,
  /** Nominal door width used for scale + gap joining (m). */
  doorWidthM: 0.9,
  /** Nominal window width used for gap joining (m). */
  windowWidthM: 1.2,
  /** Default plan span (m) when no openings found. */
  planSpanM: 12,
});

/** UI metadata for sliders */
export const DREAMSPACE_PARAM_FIELDS = [
  {
    key: 'maxSide',
    min: 480,
    max: 1200,
    step: 40,
    kind: 'int',
  },
  {
    key: 'inkMeanScale',
    min: 0.65,
    max: 0.95,
    step: 0.01,
    kind: 'float',
  },
  {
    key: 'minRunRatioH',
    min: 0.012,
    max: 0.05,
    step: 0.001,
    kind: 'float',
  },
  {
    key: 'minRunRatioV',
    min: 0.008,
    max: 0.04,
    step: 0.001,
    kind: 'float',
  },
  {
    key: 'verticalDilate',
    min: 0,
    max: 3,
    step: 1,
    kind: 'int',
  },
  {
    key: 'verticalMergeScale',
    min: 1,
    max: 2.5,
    step: 0.1,
    kind: 'float',
  },
  {
    key: 'extraDilate',
    min: 0,
    max: 2,
    step: 1,
    kind: 'int',
  },
  {
    key: 'mergeGapRatio',
    min: 0.006,
    max: 0.03,
    step: 0.001,
    kind: 'float',
  },
  {
    key: 'parallelGapRatio',
    min: 0.015,
    max: 0.06,
    step: 0.001,
    kind: 'float',
  },
  {
    key: 'doorWidthM',
    min: 0.7,
    max: 1.2,
    step: 0.05,
    kind: 'float',
  },
  {
    key: 'windowWidthM',
    min: 0.8,
    max: 2.0,
    step: 0.05,
    kind: 'float',
  },
];

/**
 * @param {Partial<DreamspaceParams>} [raw]
 * @returns {DreamspaceParams}
 */
export function normalizeDreamspaceParams(raw = {}) {
  const d = DEFAULT_DREAMSPACE_PARAMS;
  const src = raw && typeof raw === 'object' ? raw : {};
  const num = (key, fallback) => {
    const v = Number(src[key]);
    return Number.isFinite(v) ? v : fallback;
  };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  return {
    maxSide: Math.round(clamp(num('maxSide', d.maxSide), 320, 1600)),
    inkMeanScale: clamp(num('inkMeanScale', d.inkMeanScale), 0.5, 1.05),
    minRunRatioH: clamp(num('minRunRatioH', d.minRunRatioH), 0.008, 0.08),
    minRunRatioV: clamp(num('minRunRatioV', d.minRunRatioV), 0.005, 0.06),
    minRunFloorH: Math.round(clamp(num('minRunFloorH', d.minRunFloorH), 4, 40)),
    minRunFloorV: Math.round(clamp(num('minRunFloorV', d.minRunFloorV), 4, 40)),
    verticalDilate: Math.round(clamp(num('verticalDilate', d.verticalDilate), 0, 4)),
    verticalMergeScale: clamp(num('verticalMergeScale', d.verticalMergeScale), 1, 3),
    morphOpen: src.morphOpen === undefined ? d.morphOpen : Boolean(src.morphOpen),
    extraDilate: Math.round(clamp(num('extraDilate', d.extraDilate), 0, 3)),
    mergeGapRatio: clamp(num('mergeGapRatio', d.mergeGapRatio), 0.004, 0.05),
    parallelGapRatio: clamp(num('parallelGapRatio', d.parallelGapRatio), 0.01, 0.1),
    doorWidthM: clamp(num('doorWidthM', d.doorWidthM), 0.5, 1.5),
    windowWidthM: clamp(num('windowWidthM', d.windowWidthM), 0.6, 2.5),
    planSpanM: clamp(num('planSpanM', d.planSpanM), 6, 30),
  };
}

/** @returns {DreamspaceParams} */
export function loadDreamspaceParams() {
  try {
    const raw = localStorage.getItem(DREAMSPACE_PARAMS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DREAMSPACE_PARAMS };
    return normalizeDreamspaceParams(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_DREAMSPACE_PARAMS };
  }
}

/** @param {Partial<DreamspaceParams>} params */
export function saveDreamspaceParams(params) {
  const normalized = normalizeDreamspaceParams(params);
  try {
    localStorage.setItem(DREAMSPACE_PARAMS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    /* ignore quota */
  }
  return normalized;
}

export function resetDreamspaceParams() {
  try {
    localStorage.removeItem(DREAMSPACE_PARAMS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_DREAMSPACE_PARAMS };
}
