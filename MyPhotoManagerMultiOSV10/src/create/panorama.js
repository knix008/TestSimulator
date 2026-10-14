// Panorama stitching for photos taken by panning in one direction.
//  - alignPair: translation of image b relative to image a, found by normalized
//    cross-correlation of the overlap on a grayscale pyramid: exhaustive search
//    on the coarsest level (≈160 px), then ±2 px refinement on every finer level
//    for the best few candidates
//  - stitch: chains the pair offsets, equalizes exposure from the overlap means
//    (per-channel gains) and blends seams with linear feathering across overlaps
// Translation only — no rotation, scaling or lens projection.

const COARSE_SIZE = 160;
const MAX_REFINE_PIXELS = 1_500_000;

/** Grayscale plane { width, height, data: Float32Array } from RGBA pixels. */
export function toGray(image) {
  const { width, height, data } = image;
  const out = new Float32Array(width * height);
  for (let p = 0, i = 0; p < out.length; p++, i += 4) out[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  return { width, height, data: out };
}

/** Half-size plane by 2×2 box averaging. */
export function halve(plane) {
  const w = Math.max(1, plane.width >> 1);
  const h = Math.max(1, plane.height >> 1);
  const src = plane.data;
  const sw = plane.width;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const r0 = Math.min(plane.height - 1, 2 * y) * sw;
    const r1 = Math.min(plane.height - 1, 2 * y + 1) * sw;
    for (let x = 0; x < w; x++) {
      const x0 = Math.min(sw - 1, 2 * x);
      const x1 = Math.min(sw - 1, 2 * x + 1);
      out[y * w + x] = (src[r0 + x0] + src[r0 + x1] + src[r1 + x0] + src[r1 + x1]) * 0.25;
    }
  }
  return { width: w, height: h, data: out };
}

function pyramid(plane, levels) {
  const out = [plane];
  for (let i = 1; i < levels; i++) out.push(halve(out[i - 1]));
  return out;
}

/**
 * Normalized cross-correlation of a and b where b's top-left sits at (dx, dy)
 * in a's coordinates. `step` subsamples rows/columns for speed.
 */
function ncc(a, b, dx, dy, step = 1) {
  const x0 = Math.max(0, dx);
  const x1 = Math.min(a.width, dx + b.width);
  const y0 = Math.max(0, dy);
  const y1 = Math.min(a.height, dy + b.height);
  if (x1 - x0 < 2 || y1 - y0 < 2) return { score: -1, n: 0 };
  const ad = a.data; const bd = b.data;
  let sa = 0; let sb = 0; let saa = 0; let sbb = 0; let sab = 0; let n = 0;
  for (let y = y0; y < y1; y += step) {
    let ia = y * a.width + x0;
    let ib = (y - dy) * b.width + (x0 - dx);
    for (let x = x0; x < x1; x += step, ia += step, ib += step) {
      const va = ad[ia]; const vb = bd[ib];
      sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb;
    }
    n += Math.ceil((x1 - x0) / step);
  }
  const cov = sab - (sa * sb) / n;
  const va = saa - (sa * sa) / n;
  const vb = sbb - (sb * sb) / n;
  if (va <= 1e-6 || vb <= 1e-6) return { score: -1, n };
  return { score: cov / Math.sqrt(va * vb), n };
}

/** Search ranges (in full-resolution pixels) for one direction. */
function ranges(a, b, direction, maxOverlap, minOverlap, drift) {
  if (direction === 'vertical') {
    const minDy = Math.max(1, Math.round(a.height - maxOverlap * Math.min(a.height, b.height)));
    const maxDy = Math.max(minDy, Math.round(a.height - Math.max(8, minOverlap * Math.min(a.height, b.height))));
    const d = Math.round(drift * Math.max(a.width, b.width));
    return { dx: [-d, d], dy: [minDy, maxDy] };
  }
  const minDx = Math.max(1, Math.round(a.width - maxOverlap * Math.min(a.width, b.width)));
  const maxDx = Math.max(minDx, Math.round(a.width - Math.max(8, minOverlap * Math.min(a.width, b.width))));
  const d = Math.round(drift * Math.max(a.height, b.height));
  return { dx: [minDx, maxDx], dy: [-d, d] };
}

function alignDirection(pa, pb, direction, { maxOverlap, minOverlap, drift, candidates }) {
  const levels = pa.length;
  const top = levels - 1;
  const scale = 2 ** top;
  const full = ranges(pa[0], pb[0], direction, maxOverlap, minOverlap, drift);
  const ca = pa[top]; const cb = pb[top];
  const found = [];
  const dxLo = Math.floor(full.dx[0] / scale); const dxHi = Math.ceil(full.dx[1] / scale);
  const dyLo = Math.floor(full.dy[0] / scale); const dyHi = Math.ceil(full.dy[1] / scale);
  for (let dy = dyLo; dy <= dyHi; dy++) {
    for (let dx = dxLo; dx <= dxHi; dx++) {
      const { score } = ncc(ca, cb, dx, dy);
      found.push({ dx, dy, score });
    }
  }
  found.sort((p, q) => q.score - p.score);
  // Keep the best few distinct peaks.
  const seeds = [];
  for (const f of found) {
    if (seeds.length >= candidates) break;
    if (seeds.every((s) => Math.abs(s.dx - f.dx) > 2 || Math.abs(s.dy - f.dy) > 2)) seeds.push(f);
  }
  let best = { dx: 0, dy: 0, score: -Infinity };
  for (const seed of seeds) {
    let { dx, dy } = seed;
    let score = seed.score;
    for (let level = top - 1; level >= 0; level--) {
      const a = pa[level]; const b = pb[level];
      const overlap = (Math.min(a.width, dx * 2 + b.width) - Math.max(0, dx * 2)) * (Math.min(a.height, dy * 2 + b.height) - Math.max(0, dy * 2));
      const step = overlap > MAX_REFINE_PIXELS ? Math.ceil(Math.sqrt(overlap / MAX_REFINE_PIXELS)) : 1;
      const cx = dx * 2; const cy = dy * 2;
      score = -Infinity;
      for (let ty = cy - 2; ty <= cy + 2; ty++) {
        for (let tx = cx - 2; tx <= cx + 2; tx++) {
          const r = ncc(a, b, tx, ty, step);
          if (r.score > score) { score = r.score; dx = tx; dy = ty; }
        }
      }
    }
    if (score > best.score) best = { dx, dy, score };
  }
  return best;
}

/**
 * Translation of image b relative to image a: b's top-left corner lies at
 * (dx, dy) in a's pixel coordinates.
 *   maxOverlap: largest overlap searched, as a fraction of the image size (0.6)
 *   minOverlap: smallest overlap searched (0.1)
 *   direction: 'horizontal' (b to the right of a), 'vertical' (b below a) or 'auto'
 *   drift: perpendicular freedom as a fraction of the perpendicular size (0.08)
 * Returns { dx, dy, score (NCC, −1…1), direction }.
 */
export function alignPair(a, b, { maxOverlap = 0.6, minOverlap = 0.1, direction = 'horizontal', drift = 0.08, candidates = 4 } = {}) {
  const ga = a.data instanceof Float32Array ? a : toGray(a);
  const gb = b.data instanceof Float32Array ? b : toGray(b);
  let levels = 1;
  while (Math.max(ga.width, ga.height) / 2 ** (levels - 1) > COARSE_SIZE && Math.min(ga.width, ga.height, gb.width, gb.height) / 2 ** levels >= 16) levels += 1;
  const pa = pyramid(ga, levels);
  const pb = pyramid(gb, levels);
  const opts = { maxOverlap, minOverlap, drift, candidates };
  const dirs = direction === 'auto' ? ['horizontal', 'vertical'] : [direction];
  let best = null;
  for (const dir of dirs) {
    const r = alignDirection(pa, pb, dir, opts);
    if (!best || r.score > best.score) best = { ...r, direction: dir };
  }
  return best;
}

/** Per-channel mean of an image over a rectangle given in its own coordinates. */
function regionMean(image, x0, y0, x1, y1) {
  const sums = [0, 0, 0];
  let n = 0;
  const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 250_000)));
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * image.width + x) * 4;
      sums[0] += image.data[i]; sums[1] += image.data[i + 1]; sums[2] += image.data[i + 2];
      n += 1;
    }
  }
  return sums.map((s) => s / Math.max(1, n));
}

/**
 * Stitch images taken in sequence into one panorama.
 *   options: alignPair options, plus
 *     equalize (true): per-channel gains so overlaps match in brightness/colour
 *     offsets: precomputed [{ x, y }] canvas positions (skips alignment)
 * Returns { image (uncovered canvas pixels are transparent), offsets: [{ x, y }], gains: [[r, g, b]], pairs }.
 */
export function stitch(images, options = {}) {
  if (!images?.length) throw new Error('stitch: no images');
  const { equalize = true } = options;
  const n = images.length;
  const pairs = [];
  let positions = options.offsets?.map((o) => ({ x: o.x, y: o.y }));
  if (!positions) {
    positions = [{ x: 0, y: 0 }];
    let prevGray = toGray(images[0]);
    for (let i = 1; i < n; i++) {
      const gray = toGray(images[i]);
      const r = alignPair(prevGray, gray, options);
      pairs.push(r);
      positions.push({ x: positions[i - 1].x + r.dx, y: positions[i - 1].y + r.dy });
      prevGray = gray;
    }
  } else {
    for (let i = 1; i < n; i++) {
      const dx = positions[i].x - positions[i - 1].x;
      const dy = positions[i].y - positions[i - 1].y;
      pairs.push({ dx, dy, direction: Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical' });
    }
  }
  const minX = Math.min(...positions.map((p) => p.x));
  const minY = Math.min(...positions.map((p) => p.y));
  const offsets = positions.map((p) => ({ x: p.x - minX, y: p.y - minY }));
  const width = Math.max(...images.map((img, i) => offsets[i].x + img.width));
  const height = Math.max(...images.map((img, i) => offsets[i].y + img.height));

  // Exposure equalization: gain of image i relative to i-1 from the overlap means.
  const gains = images.map(() => [1, 1, 1]);
  if (equalize && n > 1) {
    for (let i = 1; i < n; i++) {
      const a = images[i - 1]; const b = images[i];
      const oa = offsets[i - 1]; const ob = offsets[i];
      const x0 = Math.max(oa.x, ob.x); const x1 = Math.min(oa.x + a.width, ob.x + b.width);
      const y0 = Math.max(oa.y, ob.y); const y1 = Math.min(oa.y + a.height, ob.y + b.height);
      if (x1 - x0 < 1 || y1 - y0 < 1) { gains[i] = gains[i - 1].slice(); continue; }
      const ma = regionMean(a, x0 - oa.x, y0 - oa.y, x1 - oa.x, y1 - oa.y);
      const mb = regionMean(b, x0 - ob.x, y0 - ob.y, x1 - ob.x, y1 - ob.y);
      gains[i] = gains[i - 1].map((g, c) => g * Math.min(4, Math.max(0.25, (ma[c] + 1) / (mb[c] + 1))));
    }
    // Normalize so the geometric mean gain per channel is 1 (no global drift).
    for (let c = 0; c < 3; c++) {
      const logMean = gains.reduce((s, g) => s + Math.log(g[c]), 0) / n;
      const k = Math.exp(-logMean);
      for (const g of gains) g[c] *= k;
    }
  }

  // Feather ramps: along each pair's axis, the earlier image fades out and the
  // later one fades in linearly across their overlap.
  const ramps = images.map(() => []);
  for (let i = 1; i < n; i++) {
    const horizontal = pairs[i - 1].direction !== 'vertical';
    const a = images[i - 1]; const b = images[i];
    const oa = offsets[i - 1]; const ob = offsets[i];
    const start = horizontal ? ob.x : ob.y;
    const end = horizontal ? oa.x + a.width : oa.y + a.height;
    const sA = horizontal ? oa.x : oa.y;
    const eB = horizontal ? ob.x + b.width : ob.y + b.height;
    if (end <= start) continue;
    const lo = Math.max(start, sA);
    const hi = Math.min(end, eB);
    if (hi <= lo) continue;
    ramps[i - 1].push({ horizontal, lo, hi, rising: false });
    ramps[i].push({ horizontal, lo, hi, rising: true });
  }
  const rampWeight = (r, cx, cy) => {
    const v = r.horizontal ? cx : cy;
    const t = (v + 0.5 - r.lo) / (r.hi - r.lo);
    const u = t < 0 ? 0 : t > 1 ? 1 : t;
    return r.rising ? u : 1 - u;
  };

  const out = new Uint8ClampedArray(width * height * 4);
  const acc = new Float32Array(width * 4);
  for (let y = 0; y < height; y++) {
    acc.fill(0);
    for (let i = 0; i < n; i++) {
      const img = images[i]; const o = offsets[i];
      const sy = y - o.y;
      if (sy < 0 || sy >= img.height) continue;
      const g = gains[i];
      const list = ramps[i];
      let rowWeight = 1;
      const xRamps = [];
      for (const r of list) {
        if (r.horizontal) xRamps.push(r);
        else rowWeight = Math.min(rowWeight, rampWeight(r, 0, y));
      }
      const base = sy * img.width * 4;
      for (let sx = 0; sx < img.width; sx++) {
        const cx = o.x + sx;
        let w = rowWeight;
        for (const r of xRamps) { const rw = rampWeight(r, cx, y); if (rw < w) w = rw; }
        if (w <= 0) w = 1e-6; // keep a tiny weight so every covered pixel is written
        const si = base + sx * 4;
        const ai = cx * 4;
        acc[ai] += w * img.data[si] * g[0];
        acc[ai + 1] += w * img.data[si + 1] * g[1];
        acc[ai + 2] += w * img.data[si + 2] * g[2];
        acc[ai + 3] += w;
      }
    }
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      const w = acc[x * 4 + 3];
      if (w <= 0) continue;
      out[row + x * 4] = acc[x * 4] / w;
      out[row + x * 4 + 1] = acc[x * 4 + 1] / w;
      out[row + x * 4 + 2] = acc[x * 4 + 2] / w;
      out[row + x * 4 + 3] = 255;
    }
  }
  return { image: { width, height, data: out }, offsets, gains, pairs };
}
