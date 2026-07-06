export const FONT_SCALE_MIN = -2;
export const FONT_SCALE_MAX = 2;
export const EDITOR_BASE_FONT_SIZE = 15;
export const EDITOR_FONT_SIZE_PRESETS = [10, 12, 14, 16, 18, 20, 24];

const FACTORS = {
  [-2]: 0.85,
  [-1]: 0.92,
  0: 1,
  1: 1.08,
  2: 1.16
};

export function normalizeFontScaleStep(step) {
  const value = Number.parseInt(step, 10);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, value));
}

export function getFontScaleFactor(step) {
  return FACTORS[normalizeFontScaleStep(step)] ?? 1;
}

export function getEditorFontSizePx(step) {
  const size = EDITOR_BASE_FONT_SIZE * getFontScaleFactor(step);
  return Number(size.toFixed(1));
}

export function getUiFontScaleFactor(step) {
  return getFontScaleFactor(step);
}
