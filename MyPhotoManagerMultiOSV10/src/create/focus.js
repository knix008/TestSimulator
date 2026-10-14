// Focus stacking: merge shots focused at different distances into one image
// that is sharp everywhere. Sharpness = squared Laplacian of the gray image,
// box-averaged over a (2·radius+1)² window; each output pixel blends the
// inputs with weights sharpness^power (high power ≈ pick the sharpest shot,
// lower power = softer transitions). Optional translation alignment reuses
// the median-threshold-bitmap alignment of the HDR module.
import { alignExposures } from './hdr.js';

/** Squared Laplacian (4-neighbour) of the luminance, as a Float32Array. */
export function laplacianEnergy(image) {
  const { width: w, height: h, data } = image;
  const gray = new Float32Array(w * h);
  for (let p = 0, i = 0; p < gray.length; p++, i += 4) gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const ym = y > 0 ? y - 1 : y; const yp = y < h - 1 ? y + 1 : y;
    for (let x = 0; x < w; x++) {
      const xm = x > 0 ? x - 1 : x; const xp = x < w - 1 ? x + 1 : x;
      const l = gray[y * w + xm] + gray[y * w + xp] + gray[ym * w + x] + gray[yp * w + x] - 4 * gray[y * w + x];
      out[y * w + x] = l * l;
    }
  }
  return out;
}

/** Box mean over a (2r+1)² window with clamped edges (separable running sums). */
export function boxMean(plane, w, h, r) {
  if (r <= 0) return plane.slice();
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const size = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let s = 0;
    for (let t = -r; t <= r; t++) s += plane[row + Math.min(w - 1, Math.max(0, t))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = s / size;
      s += plane[row + Math.min(w - 1, x + r + 1)] - plane[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let t = -r; t <= r; t++) s += tmp[Math.min(h - 1, Math.max(0, t)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / size;
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/**
 * Merge a focus bracket into one all-in-focus image.
 *   radius: half-size of the sharpness window in pixels (2 → 5×5)
 *   power: weight exponent on sharpness (4; use Infinity for hard selection)
 *   align: translate images onto the first one before merging (MTB, ±maxShift px)
 * Returns an ImageData-like { width, height, data }.
 */
export function focusStack(images, { radius = 2, power = 4, align = false, maxShift = 32 } = {}) {
  if (!images?.length) throw new Error('focusStack: no images');
  const { width: w, height: h } = images[0];
  for (const img of images) if (img.width !== w || img.height !== h) throw new Error('focusStack: images differ in size');
  const stack = align ? alignExposures(images, { maxShift }).images : images;
  const n = w * h;
  const energies = stack.map((img) => boxMean(laplacianEnergy(img), w, h, Math.max(0, radius | 0)));
  const out = new Uint8ClampedArray(n * 4);
  const hard = !Number.isFinite(power);
  for (let p = 0; p < n; p++) {
    let max = 0; let best = 0;
    for (let k = 0; k < energies.length; k++) if (energies[k][p] > max) { max = energies[k][p]; best = k; }
    const i = p * 4;
    if (hard || max <= 1e-9) {
      const src = stack[hard ? best : 0].data;
      if (!hard && max <= 1e-9) {
        // Flat everywhere: plain average.
        for (let c = 0; c < 4; c++) { let s = 0; for (const img of stack) s += img.data[i + c]; out[i + c] = s / stack.length; }
        continue;
      }
      out[i] = src[i]; out[i + 1] = src[i + 1]; out[i + 2] = src[i + 2]; out[i + 3] = src[i + 3];
      continue;
    }
    let sw = 0; let r = 0; let g = 0; let b = 0; let a = 0;
    for (let k = 0; k < stack.length; k++) {
      // Relative to the maximum keeps the power numerically safe.
      const wt = (energies[k][p] / max) ** power;
      const d = stack[k].data;
      r += wt * d[i]; g += wt * d[i + 1]; b += wt * d[i + 2]; a += wt * d[i + 3];
      sw += wt;
    }
    out[i] = r / sw; out[i + 1] = g / sw; out[i + 2] = b / sw; out[i + 3] = a / sw;
  }
  return { width: w, height: h, data: out };
}
