// Input resolution: before converting, the source image is shrunk to a share of its size
// (keeping its aspect ratio), and the number of characters shrinks by the same share. A glyph
// therefore covers the same part of the picture at every resolution, but a lower resolution
// draws the picture with fewer, coarser characters and makes a smaller image.
export const INPUT_SCALE = { min: 10, max: 100, step: 5 };
export const MIN_COLS = 8;

export function clampInputScale(value) {
  const n = Math.round(Number(value) / INPUT_SCALE.step) * INPUT_SCALE.step;
  if (!Number.isFinite(n)) return INPUT_SCALE.max;
  return Math.min(INPUT_SCALE.max, Math.max(INPUT_SCALE.min, n));
}

/** The shrunken image size; never below one pixel, aspect ratio kept. */
export function scaledSize(width, height, percent) {
  const share = clampInputScale(percent) / 100;
  return {
    width: Math.max(1, Math.round(width * share)),
    height: Math.max(1, Math.round(height * share)),
  };
}

/** Columns to convert with: the chosen columns times the share (at least MIN_COLS). */
export function scaledColumns(cols, percent) {
  return Math.max(MIN_COLS, Math.round((Number(cols) * clampInputScale(percent)) / 100));
}
