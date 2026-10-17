// Background removal. The rectangle or freehand outline is a hint about where the
// object is, not a crop: pixels outside it are background, and pixels inside it
// that belong to the background are cleared too. The matte is only an alpha
// channel. cropToObject then keeps the tight box around what is still opaque.
//
// Every algorithm lives in this module, so the desktop installer and the web
// build ship them together. Nothing is downloaded when the app is installed
// or when a photo is opened.
//
//   grabcut  — iterative colour models (the usual best starting point)
//   color    — drop colours that match the background outside the selection
//   edge     — flood in from outside and stop at a strong colour edge
//   kmeans   — drop colour groups that mostly sit outside the selection
//   saliency — keep pixels that differ from the surrounding background

export const BG_ALGORITHMS = Object.freeze(['grabcut', 'color', 'edge', 'kmeans', 'saliency']);
export const DEFAULT_BG_ALGORITHM = 'grabcut';

const WORK_SIDE = 360;

export function normalizeAlgorithm(id) {
  return BG_ALGORITHMS.includes(id) ? id : DEFAULT_BG_ALGORITHM;
}

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const clamp01 = (value) => Math.max(0, Math.min(1, value));

/** Edit record: fractions of the picture, or null when there is nothing to remove. */
export function normalizeBackground(value) {
  if (!value || typeof value !== 'object' || !value.selection) return null;
  const selection = normalizeSelection(value.selection);
  if (!selection) return null;
  return { algorithm: normalizeAlgorithm(value.algorithm), selection };
}

function normalizeSelection(selection) {
  if (!selection || typeof selection !== 'object') return null;
  if (selection.kind === 'rect') {
    const x = clamp01(num(selection.x));
    const y = clamp01(num(selection.y));
    const w = Math.min(1 - x, Math.max(0, num(selection.w)));
    const h = Math.min(1 - y, Math.max(0, num(selection.h)));
    if (w < 0.005 || h < 0.005) return null;
    return { kind: 'rect', x, y, w, h };
  }
  if (selection.kind === 'free' && Array.isArray(selection.points)) {
    const points = [];
    for (const point of selection.points) {
      if (!Array.isArray(point) || point.length < 2) continue;
      points.push([clamp01(num(point[0])), clamp01(num(point[1]))]);
    }
    if (points.length < 3) return null;
    return { kind: 'free', points };
  }
  return null;
}

/** Fractions (as stored on an edit) → pixels of a picture this size. */
export function selectionToPixels(selection, width, height) {
  if (!selection) return null;
  if (selection.kind === 'rect') {
    return { kind: 'rect', x: selection.x * width, y: selection.y * height, w: selection.w * width, h: selection.h * height };
  }
  if (selection.kind === 'free') {
    return { kind: 'free', points: (selection.points ?? []).map(([x, y]) => [x * width, y * height]) };
  }
  return null;
}

function scaleSelection(selection, sx, sy) {
  if (selection.kind === 'rect') return { kind: 'rect', x: selection.x * sx, y: selection.y * sy, w: selection.w * sx, h: selection.h * sy };
  return { kind: 'free', points: selection.points.map(([x, y]) => [x * sx, y * sy]) };
}

/** 1 where the selection claims the object might be. */
function insideMask(width, height, selection) {
  const mask = new Uint8Array(width * height);
  if (!selection) return mask;
  if (selection.kind === 'rect') {
    const x0 = Math.max(0, Math.floor(selection.x));
    const y0 = Math.max(0, Math.floor(selection.y));
    const x1 = Math.min(width, Math.ceil(selection.x + selection.w));
    const y1 = Math.min(height, Math.ceil(selection.y + selection.h));
    for (let y = y0; y < y1; y++) mask.fill(1, y * width + x0, y * width + x1);
    return mask;
  }
  const points = selection.points ?? [];
  if (points.length < 3) return mask;
  for (let y = 0; y < height; y++) {
    const cy = y + 0.5;
    const xs = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if ((yi > cy) !== (yj > cy)) xs.push(xi + ((cy - yi) * (xj - xi)) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] - 0.5));
      const to = Math.min(width - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = from; x <= to; x++) mask[y * width + x] = 1;
    }
  }
  return mask;
}

function downscale(image, tw, th) {
  const { width: sw, height: sh, data: src } = image;
  if (tw === sw && th === sh) return src;
  const data = new Uint8ClampedArray(tw * th * 4);
  for (let y = 0; y < th; y++) {
    const y0 = Math.floor((y * sh) / th);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * sh) / th));
    for (let x = 0; x < tw; x++) {
      const x0 = Math.floor((x * sw) / tw);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * sw) / tw));
      let r = 0; let g = 0; let b = 0; let a = 0; let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const p = (yy * sw + xx) * 4;
          r += src[p]; g += src[p + 1]; b += src[p + 2]; a += src[p + 3]; n++;
        }
      }
      const o = (y * tw + x) * 4;
      data[o] = r / n; data[o + 1] = g / n; data[o + 2] = b / n; data[o + 3] = a / n;
    }
  }
  return data;
}

function kmeans(colors, k, iterations = 8) {
  if (!colors.length) return [[0, 0, 0]];
  const count = Math.max(1, Math.min(k, colors.length));
  // Farthest-point seeds, so a small object of a different colour still gets a centre.
  const centroids = [[colors[0][0], colors[0][1], colors[0][2]]];
  const nearest = new Float64Array(colors.length);
  nearest.fill(Infinity);
  while (centroids.length < count) {
    const last = centroids[centroids.length - 1];
    let bestI = 0;
    let bestD = -1;
    for (let i = 0; i < colors.length; i++) {
      const c = colors[i];
      const d = (c[0] - last[0]) ** 2 + (c[1] - last[1]) ** 2 + (c[2] - last[2]) ** 2;
      if (d < nearest[i]) nearest[i] = d;
      if (nearest[i] > bestD) { bestD = nearest[i]; bestI = i; }
    }
    const src = colors[bestI];
    centroids.push([src[0], src[1], src[2]]);
  }
  const assign = new Uint16Array(colors.length);
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < colors.length; i++) {
      const c = colors[i];
      let best = 0;
      let bestD = Infinity;
      for (let j = 0; j < count; j++) {
        const d = (c[0] - centroids[j][0]) ** 2 + (c[1] - centroids[j][1]) ** 2 + (c[2] - centroids[j][2]) ** 2;
        if (d < bestD) { bestD = d; best = j; }
      }
      assign[i] = best;
    }
    const sum = Array.from({ length: count }, () => [0, 0, 0, 0]);
    for (let i = 0; i < colors.length; i++) {
      const bucket = sum[assign[i]];
      const c = colors[i];
      bucket[0] += c[0]; bucket[1] += c[1]; bucket[2] += c[2]; bucket[3] += 1;
    }
    for (let j = 0; j < count; j++) {
      if (!sum[j][3]) continue;
      centroids[j][0] = sum[j][0] / sum[j][3];
      centroids[j][1] = sum[j][1] / sum[j][3];
      centroids[j][2] = sum[j][2] / sum[j][3];
    }
  }
  return centroids;
}

function minDist2(r, g, b, centroids) {
  let best = Infinity;
  for (let j = 0; j < centroids.length; j++) {
    const c = centroids[j];
    const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
    if (d < best) best = d;
  }
  return best;
}

/** Otsu threshold of a list of non-negative distances. */
function otsu(values) {
  let max = 0;
  for (let i = 0; i < values.length; i++) if (values[i] > max) max = values[i];
  if (max <= 0) return 0;
  const bins = new Uint32Array(256);
  const scale = 255 / max;
  for (let i = 0; i < values.length; i++) bins[Math.min(255, (values[i] * scale + 0.5) | 0)]++;
  const total = values.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * bins[i];
  let sumB = 0;
  let wB = 0;
  let best = -1;
  let index = 0;
  for (let i = 0; i < 256; i++) {
    wB += bins[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * bins[i];
    const diff = sumB / wB - (sum - sumB) / wF;
    const between = wB * wF * diff * diff;
    if (between > best) { best = between; index = i; }
  }
  return index / scale;
}

function sampleStep(n) {
  return Math.max(1, Math.round(Math.sqrt(n / 3500)));
}

function solidInside(inside) {
  const alpha = new Uint8Array(inside.length);
  for (let i = 0; i < inside.length; i++) alpha[i] = inside[i] ? 255 : 0;
  return alpha;
}

/**
 * GrabCut-style colour models. Outside the selection trains the background.
 * Inside, colours that stand away from that background train the foreground.
 * A few passes then label every pixel by the nearer model.
 */
function grabcutAlpha(data, w, h, inside) {
  const n = w * h;
  const step = sampleStep(n);
  const bgColors = [];
  const insideIdx = [];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = y * w + x;
      const p = i * 4;
      if (inside[i]) insideIdx.push(i);
      else bgColors.push([data[p], data[p + 1], data[p + 2]]);
    }
  }
  if (bgColors.length < 4 || insideIdx.length < 4) return solidInside(inside);
  let bgC = kmeans(bgColors, 4);
  const dists = new Float64Array(insideIdx.length);
  for (let k = 0; k < insideIdx.length; k++) {
    const p = insideIdx[k] * 4;
    dists[k] = minDist2(data[p], data[p + 1], data[p + 2], bgC);
  }
  const threshold = otsu(dists);
  const fgColors = [];
  for (let k = 0; k < insideIdx.length; k++) {
    if (dists[k] <= threshold) continue;
    const p = insideIdx[k] * 4;
    fgColors.push([data[p], data[p + 1], data[p + 2]]);
  }
  if (fgColors.length < 4) return solidInside(inside);
  let fgC = kmeans(fgColors, 4);
  const label = new Uint8Array(n);
  for (let iter = 0; iter < 3; iter++) {
    const nextFg = [];
    const nextBg = [];
    for (let i = 0; i < n; i++) {
      const p = i * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      const fg = inside[i] && minDist2(r, g, b, fgC) <= minDist2(r, g, b, bgC);
      label[i] = fg ? 1 : 0;
      if (i % step === 0) (fg ? nextFg : nextBg).push([r, g, b]);
    }
    if (nextFg.length >= 4) fgC = kmeans(nextFg, 4);
    if (nextBg.length >= 4) bgC = kmeans(nextBg, 4);
  }
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) alpha[i] = label[i] ? 255 : 0;
  return alpha;
}

/** Colours close to the background palette (sampled outside the selection) go. */
function colorAlpha(data, w, h, inside) {
  const n = w * h;
  const step = sampleStep(n);
  const bgColors = [];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = y * w + x;
      if (inside[i]) continue;
      const p = i * 4;
      bgColors.push([data[p], data[p + 1], data[p + 2]]);
    }
  }
  if (bgColors.length < 4) return solidInside(inside);
  const centroids = kmeans(bgColors, 4);
  const outside = [];
  for (const c of bgColors) outside.push(minDist2(c[0], c[1], c[2], centroids));
  outside.sort((a, b) => a - b);
  const p95 = outside[Math.min(outside.length - 1, Math.floor(outside.length * 0.95))];
  const thresh = Math.max(24 * 24, p95 * 2.5);
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!inside[i]) continue;
    const p = i * 4;
    alpha[i] = minDist2(data[p], data[p + 1], data[p + 2], centroids) <= thresh ? 0 : 255;
  }
  return alpha;
}

/** Walk in from outside the selection. A step larger than the colour gap stops the walk. */
function edgeAlpha(data, w, h, inside) {
  const n = w * h;
  const bg = new Uint8Array(n);
  const qx = new Int32Array(n);
  const qy = new Int32Array(n);
  let qe = 0;
  const push = (x, y) => {
    const i = y * w + x;
    if (bg[i]) return;
    bg[i] = 1;
    qx[qe] = x;
    qy[qe] = y;
    qe++;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!inside[y * w + x]) push(x, y);
  const limit = 36 * 36;
  let qs = 0;
  while (qs < qe) {
    const x = qx[qs];
    const y = qy[qs];
    qs++;
    const p = (y * w + x) * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    if (x + 1 < w) consider(x + 1, y);
    if (x > 0) consider(x - 1, y);
    if (y + 1 < h) consider(x, y + 1);
    if (y > 0) consider(x, y - 1);
    function consider(nx, ny) {
      const j = ny * w + nx;
      if (bg[j]) return;
      const q = j * 4;
      const dr = data[q] - r;
      const dg = data[q + 1] - g;
      const db = data[q + 2] - b;
      if (dr * dr + dg * dg + db * db <= limit) push(nx, ny);
    }
  }
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) alpha[i] = bg[i] ? 0 : 255;
  return alpha;
}

/** Colour groups that live mostly outside the selection are background. */
function kmeansAlpha(data, w, h, inside) {
  const n = w * h;
  const step = sampleStep(n);
  const colors = [];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const p = (y * w + x) * 4;
      colors.push([data[p], data[p + 1], data[p + 2]]);
    }
  }
  const centroids = kmeans(colors, 5);
  const groups = centroids.length;
  const inn = new Uint32Array(groups);
  const out = new Uint32Array(groups);
  const assign = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    let best = 0;
    let bestD = Infinity;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    for (let j = 0; j < groups; j++) {
      const c = centroids[j];
      const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
      if (d < bestD) { bestD = d; best = j; }
    }
    assign[i] = best;
    if (inside[i]) inn[best]++; else out[best]++;
  }
  const drop = new Uint8Array(groups);
  for (let j = 0; j < groups; j++) {
    const total = inn[j] + out[j];
    drop[j] = total > 0 && out[j] / total >= 0.55 ? 1 : 0;
  }
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) alpha[i] = inside[i] && !drop[assign[i]] ? 255 : 0;
  return alpha;
}

/** Pixels that differ from the average colour outside the selection stay. */
function saliencyAlpha(data, w, h, inside) {
  const n = w * h;
  const step = sampleStep(n);
  let sr = 0; let sg = 0; let sb = 0; let sn = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = y * w + x;
      if (inside[i]) continue;
      const p = i * 4;
      sr += data[p]; sg += data[p + 1]; sb += data[p + 2]; sn++;
    }
  }
  if (sn < 4) return solidInside(inside);
  const mean = [sr / sn, sg / sn, sb / sn];
  let acc = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = y * w + x;
      if (inside[i]) continue;
      const p = i * 4;
      acc += minDist2(data[p], data[p + 1], data[p + 2], [mean]);
    }
  }
  const spread = Math.max(12, Math.sqrt(acc / sn));
  const thresh2 = (spread * 2.5) ** 2;
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!inside[i]) continue;
    const p = i * 4;
    const dr = data[p] - mean[0];
    const dg = data[p + 1] - mean[1];
    const db = data[p + 2] - mean[2];
    alpha[i] = dr * dr + dg * dg + db * db > thresh2 ? 255 : 0;
  }
  return alpha;
}

const ALGORITHMS = { grabcut: grabcutAlpha, color: colorAlpha, edge: edgeAlpha, kmeans: kmeansAlpha, saliency: saliencyAlpha };

/**
 * `image` is { width, height, data: RGBA }. `selection` is in pixels of that
 * image: { kind: 'rect', x, y, w, h } or { kind: 'free', points }.
 * Returns a same-size RGBA image; background pixels have alpha 0.
 * Unknown algorithm names use GrabCut.
 */
export function removeBackground(image, selection, algorithm = DEFAULT_BG_ALGORITHM) {
  const { width, height, data } = image;
  const out = new Uint8ClampedArray(data);
  const fullInside = insideMask(width, height, selection);
  let any = false;
  for (let i = 0; i < fullInside.length; i++) if (fullInside[i]) { any = true; break; }
  if (!any) return { width, height, data: out };
  const fit = Math.min(1, WORK_SIDE / Math.max(width, height));
  const sw = Math.max(1, Math.round(width * fit));
  const sh = Math.max(1, Math.round(height * fit));
  const small = downscale(image, sw, sh);
  const inside = insideMask(sw, sh, scaleSelection(selection, sw / width, sh / height));
  const run = ALGORITHMS[normalizeAlgorithm(algorithm)];
  const alpha = run(small, sw, sh, inside);
  for (let y = 0; y < height; y++) {
    const yy = Math.min(sh - 1, Math.floor(((y + 0.5) * sh) / height));
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const p = i * 4;
      if (!fullInside[i]) { out[p + 3] = 0; continue; }
      const xx = Math.min(sw - 1, Math.floor(((x + 0.5) * sw) / width));
      out[p + 3] = alpha[yy * sw + xx] ? data[p + 3] : 0;
    }
  }
  return { width, height, data: out };
}

/** Axis-aligned box of pixels whose alpha is above `threshold`, or null. */
export function alphaBounds(image, threshold = 8) {
  const { width, height, data } = image;
  let minX = width; let minY = height; let maxX = -1; let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] <= threshold) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Crops to the box that contains the opaque object. Corners of that box may
 * still be transparent. An empty matte becomes a 1×1 clear pixel.
 */
export function cropToObject(image, threshold = 8) {
  const box = alphaBounds(image, threshold);
  if (!box) return { width: 1, height: 1, data: new Uint8ClampedArray(4), box: { x: 0, y: 0, w: 1, h: 1 } };
  const { width, data } = image;
  const next = new Uint8ClampedArray(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) {
    const src = ((y + box.y) * width + box.x) * 4;
    next.set(data.subarray(src, src + box.w * 4), y * box.w * 4);
  }
  return { width: box.w, height: box.h, data: next, box };
}
