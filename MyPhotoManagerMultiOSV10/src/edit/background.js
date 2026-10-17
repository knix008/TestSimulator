// Background removal. A rectangle, ellipse, circle or freehand outline is a hint
// about where the object is, not a crop: pixels outside it are background, and
// pixels inside it that belong to the background are cleared too. The matte is
// only an alpha channel. cropToObject then keeps the tight box around what is
// still opaque.
//
// The colour algorithms live in this module and ship with the installer and the
// web build. REMBG 1 and REMBG 2 are neural models (src/edit/bgmodels.js): the
// runtime ships with the app, and each model file is downloaded and installed
// on first use. A neural matte is applied here only after that install has
// stored an alpha mask for this picture.
//
//   grabcut  — iterative colour models (the usual best starting point)
//   color    — drop colours that match the background outside the selection
//   edge     — flood in from outside and stop at a strong colour edge
//   kmeans   — drop colour groups that mostly sit outside the selection
//   saliency — keep pixels that differ from the surrounding background
//   rembg1   — U²-Net (rembg), downloaded
//   rembg2   — ISNet (rembg), downloaded

export const BG_BUILTIN = Object.freeze(['grabcut', 'color', 'edge', 'kmeans', 'saliency']);
export const BG_NEURAL = Object.freeze(['rembg1', 'rembg2']);
export const BG_ALGORITHMS = Object.freeze([...BG_BUILTIN, ...BG_NEURAL]);
export const DEFAULT_BG_ALGORITHM = 'grabcut';

const neuralCache = new Map();

export function isNeuralAlgorithm(id) {
  return BG_NEURAL.includes(id);
}

/** Cache key for a prepared REMBG mask. `selection` is in pixels of this picture. */
export function neuralKey(algorithm, selection, width, height) {
  return `${algorithm}|${width}x${height}|${JSON.stringify(selection)}`;
}

export function hasNeuralAlpha(key) {
  return neuralCache.has(key);
}

export function storeNeuralAlpha(key, alpha) {
  if (neuralCache.has(key)) neuralCache.delete(key);
  neuralCache.set(key, alpha);
  while (neuralCache.size > 4) neuralCache.delete(neuralCache.keys().next().value);
}

export function clearNeuralAlgorithm(id) {
  for (const key of [...neuralCache.keys()]) if (key.startsWith(`${id}|`)) neuralCache.delete(key);
}

const WORK_SIDE = 360;

export function normalizeAlgorithm(id) {
  return BG_ALGORITHMS.includes(id) ? id : DEFAULT_BG_ALGORITHM;
}

export const BG_LINE_STYLES = ['solid', 'dashed', 'dotted'];
export const DEFAULT_BG_LINE_COLOR = '#ffe14a';
export const DEFAULT_BG_LINE_STYLE = 'dashed';
export const DEFAULT_BG_LINE_WIDTH = 3;

export function normalizeLineColor(value) {
  const text = String(value ?? '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : DEFAULT_BG_LINE_COLOR;
}

export function normalizeLineStyle(value) {
  return BG_LINE_STYLES.includes(value) ? value : DEFAULT_BG_LINE_STYLE;
}

export function normalizeLineWidth(value) {
  const width = Math.round(Number(value));
  return Number.isFinite(width) ? Math.max(1, Math.min(24, width)) : DEFAULT_BG_LINE_WIDTH;
}

/** Colour, kind and thickness of the selection outline, plus the dash pattern. */
export function selectionLine(background) {
  const color = normalizeLineColor(background?.lineColor);
  const style = normalizeLineStyle(background?.lineStyle);
  const width = normalizeLineWidth(background?.lineWidth);
  const dash = style === 'solid' ? null : style === 'dotted' ? [1, Math.max(3, width * 2)] : [Math.max(6, width * 3), Math.max(4, width * 2)];
  return { color, style, width, dash };
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
  if (selection.kind === 'rect' || selection.kind === 'ellipse' || selection.kind === 'circle') {
    const x = num(selection.x);
    const y = num(selection.y);
    const w = num(selection.w);
    const h = num(selection.h);
    if (!(w > 0.005) || !(h > 0.005)) return null;
    if (x >= 1 || y >= 1 || x + w <= 0 || y + h <= 0) return null;
    if (selection.kind === 'rect') {
      const left = clamp01(x);
      const top = clamp01(y);
      const rw = Math.min(1 - left, w);
      const rh = Math.min(1 - top, h);
      if (rw < 0.005 || rh < 0.005) return null;
      return { kind: 'rect', x: left, y: top, w: rw, h: rh };
    }
    return { kind: selection.kind, x, y, w, h };
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
  if (selection.kind === 'free') {
    return { kind: 'free', points: (selection.points ?? []).map(([x, y]) => [x * width, y * height]) };
  }
  if (selection.kind === 'rect' || selection.kind === 'ellipse' || selection.kind === 'circle') {
    return { kind: selection.kind, x: selection.x * width, y: selection.y * height, w: selection.w * width, h: selection.h * height };
  }
  return null;
}

function scaleSelection(selection, sx, sy) {
  if (selection.kind === 'free') return { kind: 'free', points: selection.points.map(([x, y]) => [x * sx, y * sy]) };
  return { kind: selection.kind, x: selection.x * sx, y: selection.y * sy, w: selection.w * sx, h: selection.h * sy };
}

/** A circle uses the shorter side of its box, so it stays round in pixels. */
function roundBox(selection) {
  if (selection.kind !== 'circle') return selection;
  const side = Math.min(selection.w, selection.h);
  return {
    kind: 'circle',
    x: selection.x + (selection.w - side) / 2,
    y: selection.y + (selection.h - side) / 2,
    w: side,
    h: side,
  };
}

function fillEllipse(mask, width, height, box) {
  const rx = box.w / 2;
  const ry = box.h / 2;
  if (rx < 0.5 || ry < 0.5) return;
  const cx = box.x + rx;
  const cy = box.y + ry;
  const yStart = Math.max(0, Math.floor(box.y));
  const yEnd = Math.min(height, Math.ceil(box.y + box.h));
  const xStart = Math.max(0, Math.floor(box.x));
  const xEnd = Math.min(width, Math.ceil(box.x + box.w));
  for (let y = yStart; y < yEnd; y++) {
    const dy = (y + 0.5 - cy) / ry;
    const dy2 = dy * dy;
    if (dy2 > 1) continue;
    for (let x = xStart; x < xEnd; x++) {
      const dx = (x + 0.5 - cx) / rx;
      if (dx * dx + dy2 <= 1) mask[y * width + x] = 1;
    }
  }
}

/** 1 where the selection claims the object might be. */
export function selectionMask(width, height, selection) {
  return insideMask(width, height, selection);
}

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
  if (selection.kind === 'ellipse' || selection.kind === 'circle') {
    fillEllipse(mask, width, height, roundBox(selection));
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

/** Runs a generator to the end. Yielded numbers are ignored; the return value is kept. */
function runSync(factory) {
  const gen = factory();
  let step = gen.next();
  while (!step.done) step = gen.next();
  return step.value;
}

/** Same generator, but paints progress between slices. `say(done)` is 0–100. */
async function runAsync(factory, say, from, to) {
  const gen = factory();
  let step = gen.next();
  while (!step.done) {
    await say(from + Number(step.value) * (to - from));
    step = gen.next();
  }
  return step.value;
}

function* downscaleSteps(image, tw, th) {
  const { width: sw, height: sh, data: src } = image;
  if (tw === sw && th === sh) { yield 1; return src; }
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
    if (y % 8 === 7) yield (y + 1) / th;
  }
  return data;
}

function downscale(image, tw, th) {
  return runSync(() => downscaleSteps(image, tw, th));
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

function sampleStep(n) {
  return Math.max(1, Math.round(Math.sqrt(n / 3500)));
}

function solidInside(inside) {
  const alpha = new Uint8Array(inside.length);
  for (let i = 0; i < inside.length; i++) alpha[i] = inside[i] ? 255 : 0;
  return alpha;
}

/**
 * GrabCut-style colour models. Outside the selection trains the background and
 * is never mixed back in from pixels the cut rejected. Inside, a pixel is
 * background only when it sits in that background's own colour spread. Being
 * merely closer to sand or sky than to a small dark detail used to erase the
 * subject, so a freehand outline showed holes instead of the cut-out.
 */
function nearestCentroid(r, g, b, centroids) {
  let best = 0;
  let bestD = Infinity;
  for (let j = 0; j < centroids.length; j++) {
    const c = centroids[j];
    const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
    if (d < bestD) { bestD = d; best = j; }
  }
  return best;
}

function* grabcutSteps(data, w, h, inside) {
  const n = w * h;
  const step = sampleStep(n);
  const samples = [];
  const insideIdx = [];
  let outsideCount = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = y * w + x;
      const p = i * 4;
      const inn = inside[i] ? 1 : 0;
      samples.push([data[p], data[p + 1], data[p + 2], inn]);
      if (inn) insideIdx.push(i);
      else outsideCount++;
    }
  }
  if (outsideCount < 4 || insideIdx.length < 4) { yield 1; return solidInside(inside); }
  // A colour that lives mostly inside the outline is the subject. A freehand
  // stroke that clips an arm must not teach that skin colour as background.
  const groups = kmeans(samples.map((sample) => [sample[0], sample[1], sample[2]]), 5);
  const innCount = new Uint32Array(groups.length);
  const outCount = new Uint32Array(groups.length);
  const groupOf = new Uint16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const group = nearestCentroid(samples[i][0], samples[i][1], samples[i][2], groups);
    groupOf[i] = group;
    if (samples[i][3]) innCount[group]++;
    else outCount[group]++;
  }
  const subject = groups.map((_, group) => {
    const total = innCount[group] + outCount[group];
    return total > 0 && innCount[group] / total >= 0.45;
  });
  const bgColors = [];
  for (let i = 0; i < samples.length; i++) {
    if (samples[i][3] || subject[groupOf[i]]) continue;
    bgColors.push([samples[i][0], samples[i][1], samples[i][2]]);
  }
  if (bgColors.length < 4) {
    for (let i = 0; i < samples.length; i++) if (!samples[i][3]) bgColors.push([samples[i][0], samples[i][1], samples[i][2]]);
  }
  const bgC = kmeans(bgColors, 4);
  yield 0.12;
  const outside = [];
  for (const c of bgColors) outside.push(minDist2(c[0], c[1], c[2], bgC));
  outside.sort((a, b) => a - b);
  const spread = outside[Math.min(outside.length - 1, Math.floor(outside.length * 0.9))];
  const thresh = Math.max(28 * 28, spread * 1.6);
  const fgColors = [];
  for (let k = 0; k < insideIdx.length; k++) {
    const p = insideIdx[k] * 4;
    if (minDist2(data[p], data[p + 1], data[p + 2], bgC) <= thresh) continue;
    fgColors.push([data[p], data[p + 1], data[p + 2]]);
  }
  if (fgColors.length < 4) { yield 1; return solidInside(inside); }
  let fgC = kmeans(fgColors, 4);
  yield 0.22;
  const label = new Uint8Array(n);
  for (let iter = 0; iter < 3; iter++) {
    const nextFg = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const p = i * 4;
        const r = data[p];
        const g = data[p + 1];
        const b = data[p + 2];
        const bgD = minDist2(r, g, b, bgC);
        const fg = inside[i] && !(bgD <= thresh && bgD <= minDist2(r, g, b, fgC));
        label[i] = fg ? 1 : 0;
        if (fg && i % step === 0) nextFg.push([r, g, b]);
      }
      if (y % 12 === 11) yield 0.22 + ((iter + (y + 1) / h) / 3) * 0.7;
    }
    if (nextFg.length >= 4) fgC = kmeans(nextFg, 4);
    yield 0.22 + ((iter + 1) / 3) * 0.7;
  }
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) alpha[i] = label[i] ? 255 : 0;
  return alpha;
}

function grabcutAlpha(data, w, h, inside) {
  return runSync(() => grabcutSteps(data, w, h, inside));
}

/** Colours close to the background palette (sampled outside the selection) go. */
function* colorSteps(data, w, h, inside) {
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
  if (bgColors.length < 4) { yield 1; return solidInside(inside); }
  const centroids = kmeans(bgColors, 4);
  yield 0.35;
  const outside = [];
  for (const c of bgColors) outside.push(minDist2(c[0], c[1], c[2], centroids));
  outside.sort((a, b) => a - b);
  const p95 = outside[Math.min(outside.length - 1, Math.floor(outside.length * 0.95))];
  const thresh = Math.max(24 * 24, p95 * 2.5);
  const alpha = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!inside[i]) continue;
      const p = i * 4;
      alpha[i] = minDist2(data[p], data[p + 1], data[p + 2], centroids) <= thresh ? 0 : 255;
    }
    if (y % 12 === 11) yield 0.35 + ((y + 1) / h) * 0.65;
  }
  return alpha;
}

function colorAlpha(data, w, h, inside) {
  return runSync(() => colorSteps(data, w, h, inside));
}

/** Walk in from outside the selection. A step larger than the colour gap stops the walk. */
function* edgeSteps(data, w, h, inside) {
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
  yield 0.15;
  const limit = 36 * 36;
  let qs = 0;
  let since = 0;
  while (qs < qe) {
    const x = qx[qs];
    const y = qy[qs];
    qs++;
    since++;
    const p = (y * w + x) * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    if (x + 1 < w) consider(x + 1, y);
    if (x > 0) consider(x - 1, y);
    if (y + 1 < h) consider(x, y + 1);
    if (y > 0) consider(x, y - 1);
    if (since >= 4000) {
      since = 0;
      yield 0.15 + Math.min(0.8, (qs / Math.max(1, n)) * 0.8);
    }
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

function edgeAlpha(data, w, h, inside) {
  return runSync(() => edgeSteps(data, w, h, inside));
}

/** Colour groups that live mostly outside the selection are background. */
function* kmeansSteps(data, w, h, inside) {
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
  yield 0.3;
  const groups = centroids.length;
  const inn = new Uint32Array(groups);
  const out = new Uint32Array(groups);
  const assign = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
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
    if (y % 12 === 11) yield 0.3 + ((y + 1) / h) * 0.6;
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

function kmeansAlpha(data, w, h, inside) {
  return runSync(() => kmeansSteps(data, w, h, inside));
}

/** Pixels that differ from the average colour outside the selection stay. */
function* saliencySteps(data, w, h, inside) {
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
  if (sn < 4) { yield 1; return solidInside(inside); }
  const mean = [sr / sn, sg / sn, sb / sn];
  yield 0.25;
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
  yield 0.45;
  const alpha = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!inside[i]) continue;
      const p = i * 4;
      const dr = data[p] - mean[0];
      const dg = data[p + 1] - mean[1];
      const db = data[p + 2] - mean[2];
      alpha[i] = dr * dr + dg * dg + db * db > thresh2 ? 255 : 0;
    }
    if (y % 12 === 11) yield 0.45 + ((y + 1) / h) * 0.55;
  }
  return alpha;
}

function saliencyAlpha(data, w, h, inside) {
  return runSync(() => saliencySteps(data, w, h, inside));
}

const ALGORITHMS = { grabcut: grabcutAlpha, color: colorAlpha, edge: edgeAlpha, kmeans: kmeansAlpha, saliency: saliencyAlpha };
const ALGORITHM_STEPS = { grabcut: grabcutSteps, color: colorSteps, edge: edgeSteps, kmeans: kmeansSteps, saliency: saliencySteps };

const builtinCache = new Map();

function rememberBuiltin(key, alpha) {
  if (builtinCache.has(key)) builtinCache.delete(key);
  builtinCache.set(key, alpha);
  while (builtinCache.size > 4) builtinCache.delete(builtinCache.keys().next().value);
}

function workSize(width, height) {
  const fit = Math.min(1, WORK_SIDE / Math.max(width, height));
  return { sw: Math.max(1, Math.round(width * fit)), sh: Math.max(1, Math.round(height * fit)) };
}

function builtinKey(algorithm, sw, sh, selection) {
  return `${normalizeAlgorithm(algorithm)}|${sw}x${sh}|${JSON.stringify(selection)}`;
}

/**
 * Runs a built-in algorithm ahead of the preview and reports 0–100.
 * `removeBackground` then reuses that matte, so the picture updates after the
 * bar finishes instead of freezing with no feedback.
 * `isCancelled` stops between slices and throws Error('cancelled').
 */
export async function prepareBuiltinRemoval(image, selection, algorithm, report, isCancelled) {
  const name = BG_ALGORITHMS.includes(algorithm) ? algorithm : DEFAULT_BG_ALGORITHM;
  if (isNeuralAlgorithm(name)) return;
  const say = async (done) => {
    if (isCancelled?.()) throw new Error('cancelled');
    report?.(Math.max(0, Math.min(100, Math.round(done))), 100);
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (isCancelled?.()) throw new Error('cancelled');
  };
  const { width, height } = image;
  const fullInside = insideMask(width, height, selection);
  let any = false;
  for (let i = 0; i < fullInside.length; i++) if (fullInside[i]) { any = true; break; }
  if (!any) { await say(100); return; }
  const { sw, sh } = workSize(width, height);
  const scaled = scaleSelection(selection, sw / width, sh / height);
  const key = builtinKey(name, sw, sh, scaled);
  if (builtinCache.has(key)) { await say(100); return; }
  await say(4);
  const small = await runAsync(() => downscaleSteps(image, sw, sh), say, 4, 32);
  await say(34);
  const inside = insideMask(sw, sh, scaled);
  const alpha = await runAsync(() => ALGORITHM_STEPS[normalizeAlgorithm(name)](small, sw, sh, inside), say, 34, 96);
  protectSubject(small, sw, sh, inside, alpha);
  rememberBuiltin(key, alpha);
  await say(100);
}

/**
 * Puts back colours that live mostly inside the selection. Background colour,
 * edge and contrast otherwise treat skin that resembles sand as background and
 * the cut-out disappears.
 */
function protectSubject(data, width, height, inside, alpha) {
  const step = sampleStep(width * height);
  const samples = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = y * width + x;
      const p = i * 4;
      samples.push([data[p], data[p + 1], data[p + 2], inside[i] ? 1 : 0]);
    }
  }
  if (samples.length < 8) return alpha;
  const groups = kmeans(samples.map((sample) => [sample[0], sample[1], sample[2]]), 5);
  const innCount = new Uint32Array(groups.length);
  const outCount = new Uint32Array(groups.length);
  for (let i = 0; i < samples.length; i++) {
    const group = nearestCentroid(samples[i][0], samples[i][1], samples[i][2], groups);
    if (samples[i][3]) innCount[group]++;
    else outCount[group]++;
  }
  const keep = new Uint8Array(groups.length);
  let any = false;
  for (let group = 0; group < groups.length; group++) {
    const total = innCount[group] + outCount[group];
    if (total > 0 && innCount[group] / total >= 0.45) { keep[group] = 1; any = true; }
  }
  if (!any) return alpha;
  for (let i = 0; i < alpha.length; i++) {
    if (!inside[i] || alpha[i]) continue;
    const p = i * 4;
    if (keep[nearestCentroid(data[p], data[p + 1], data[p + 2], groups)]) alpha[i] = 255;
  }
  return alpha;
}

/**
 * `image` is { width, height, data: RGBA }. `selection` is in pixels of that
 * image: { kind: 'rect' | 'ellipse' | 'circle', x, y, w, h } or { kind: 'free', points }.
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
  const name = BG_ALGORITHMS.includes(algorithm) ? algorithm : DEFAULT_BG_ALGORITHM;
  if (isNeuralAlgorithm(name)) {
    const alpha = neuralCache.get(neuralKey(name, selection, width, height));
    if (alpha && alpha.length === width * height) {
      for (let i = 0; i < alpha.length; i++) {
        const p = i * 4;
        out[p + 3] = fullInside[i] ? Math.round((data[p + 3] * alpha[i]) / 255) : 0;
      }
    }
    return { width, height, data: out };
  }
  const { sw, sh } = workSize(width, height);
  const scaled = scaleSelection(selection, sw / width, sh / height);
  const key = builtinKey(name, sw, sh, scaled);
  let alpha = builtinCache.get(key);
  if (!alpha) {
    const small = downscale(image, sw, sh);
    const inside = insideMask(sw, sh, scaled);
    alpha = protectSubject(small, sw, sh, inside, ALGORITHMS[normalizeAlgorithm(name)](small, sw, sh, inside));
    rememberBuiltin(key, alpha);
  }
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
