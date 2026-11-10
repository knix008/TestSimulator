// Walls from a picture of a floor plan (scan, screenshot, PNG/JPG export).
// The edge pipeline is 3DArchitecture's (core/imageParser.js): grey → Gaussian
// blur → Sobel → non-maximum suppression → per-direction threshold → denoise →
// Hough (horizontal / vertical lines only) → segments along each line. Instead of
// merging nearby parallel edges into one line, the edges are handed to the plan
// recognizer, which pairs the two faces of each wall into a centre line and a
// thickness exactly like CAD lines.
//
// Pure (works on { data: RGBA bytes, width, height }); the app decodes the picture
// with a canvas, the tests with sharp.
import { recognizePlan } from './plan-recognize.js';

export const MAX_DETECT_SIZE = 1400;

function toGrayscale(data, w, h) {
  const g = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3] / 255;
    // Transparent pixels count as white paper.
    g[i] = Math.round((0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) * a + 255 * (1 - a));
  }
  return g;
}

function gaussianBlur(g, w, h) {
  const K = [2, 4, 5, 4, 2, 4, 9, 12, 9, 4, 5, 12, 15, 12, 5, 4, 9, 12, 9, 4, 2, 4, 5, 4, 2];
  const out = new Uint8Array(g);
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    let s = 0;
    for (let ky = -2; ky <= 2; ky++) for (let kx = -2; kx <= 2; kx++) s += g[(y + ky) * w + (x + kx)] * K[(ky + 2) * 5 + (kx + 2)];
    out[y * w + x] = Math.round(s / 159);
  }
  return out;
}

function sobel(g, w, h) {
  const mag = new Float32Array(w * h); const gx = new Float32Array(w * h); const gy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const dx = -g[i - w - 1] + g[i - w + 1] - 2 * g[i - 1] + 2 * g[i + 1] - g[i + w - 1] + g[i + w + 1];
    const dy = -g[i - w - 1] - 2 * g[i - w] - g[i - w + 1] + g[i + w - 1] + 2 * g[i + w] + g[i + w + 1];
    gx[i] = dx; gy[i] = dy; mag[i] = Math.sqrt(dx * dx + dy * dy);
  }
  return { mag, gx, gy };
}

function nonMaxSuppression(mag, gx, gy, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; const m = mag[i];
    if (m === 0) continue;
    const ax = Math.abs(gx[i]); const ay = Math.abs(gy[i]);
    let n1; let n2;
    if (ax >= 2.414 * ay) { n1 = mag[i - 1]; n2 = mag[i + 1]; }
    else if (ay >= 2.414 * ax) { n1 = mag[i - w]; n2 = mag[i + w]; }
    else if (gx[i] * gy[i] > 0) { n1 = mag[i - w - 1]; n2 = mag[i + w + 1]; }
    else { n1 = mag[i - w + 1]; n2 = mag[i + w - 1]; }
    if (m >= n1 && m >= n2) out[i] = m;
  }
  return out;
}

/** Vertical and horizontal edges each against their own strongest, so one direction cannot drown the other. */
function threshold(nms, gx, gy, w, h, ratio) {
  let maxGx = 0; let maxGy = 0;
  for (let i = 0; i < w * h; i++) {
    if (!nms[i]) continue;
    maxGx = Math.max(maxGx, Math.abs(gx[i])); maxGy = Math.max(maxGy, Math.abs(gy[i]));
  }
  const edges = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!nms[i]) continue;
    const ax = Math.abs(gx[i]); const ay = Math.abs(gy[i]);
    if ((ax >= ay && ax >= maxGx * ratio) || (ay > ax && ay >= maxGy * ratio)) edges[i] = 1;
  }
  return edges;
}

function denoise(edges, w, h, minNeighbors = 4) {
  const out = new Uint8Array(w * h);
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    if (!edges[y * w + x]) continue;
    let count = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if ((dy || dx) && edges[(y + dy) * w + (x + dx)]) count++;
    if (count >= minNeighbors) out[y * w + x] = 1;
  }
  return out;
}

/** Hough lines near 0° / 90° (±2°: plans are drawn square to the paper): [{ rho, theta, votes }], local maxima only. */
function hough(edges, w, h, minVotesV, minVotesH, maxLines = 400) {
  const diag = Math.ceil(Math.hypot(w, h));
  const rhoN = diag * 2 + 1; const thetaN = 180;
  const acc = new Int32Array(rhoN * thetaN);
  const cosT = new Float32Array(thetaN); const sinT = new Float32Array(thetaN);
  const allowed = [];
  for (let t = 0; t < thetaN; t++) {
    const a = (t * Math.PI) / thetaN;
    cosT[t] = Math.cos(a); sinT[t] = Math.sin(a);
    if (t <= 1 || t >= 179 || Math.abs(t - 90) <= 1) allowed.push(t);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!edges[y * w + x]) continue;
    for (const t of allowed) acc[(Math.round(x * cosT[t] + y * sinT[t]) + diag) * thetaN + t]++;
  }
  const NMS = 3;
  const lines = [];
  for (let r = NMS; r < rhoN - NMS; r++) {
    for (const t of allowed) {
      const v = acc[r * thetaN + t];
      const vertical = t <= 1 || t >= 179;
      if (v < (vertical ? minVotesV : minVotesH)) continue;
      let isMax = true;
      outer: for (let dr = -NMS; dr <= NMS; dr++) for (let dt = -NMS; dt <= NMS; dt++) {
        if (!dr && !dt) continue;
        const tt = (((t + dt) % thetaN) + thetaN) % thetaN;
        const other = acc[(r + dr) * thetaN + tt];
        // Ties: the first one wins (keeps one of two equal neighbours).
        if (other > v || (other === v && (dr < 0 || (dr === 0 && dt < 0)))) { isMax = false; break outer; }
      }
      if (isMax) lines.push({ rho: r - diag, theta: (t * Math.PI) / thetaN, votes: v });
    }
  }
  return lines.sort((a, b) => b.votes - a.votes).slice(0, maxLines);
}

/** Pixel runs along each Hough line → segments (split where the edge stops for longer than `gap`). */
function segmentsAlong(lines, edges, w, h, minLen, gap) {
  const segs = [];
  for (const { rho, theta } of lines) {
    // Plans are drawn square to the paper: lines within 1° of the axes are made exact.
    let c = Math.cos(theta); let s = Math.sin(theta);
    if (Math.abs(c) < Math.sin(1.01 * Math.PI / 180)) { c = 0; s = 1; } else if (Math.abs(s) < Math.sin(1.01 * Math.PI / 180)) { c = Math.sign(c); s = 0; }
    const horizontal = Math.abs(s) > Math.abs(c);
    const pts = [];
    if (horizontal) {
      for (let x = 0; x < w; x++) { const y = Math.round((rho - x * c) / s); for (let dy = -1; dy <= 1; dy++) { const ny = y + dy; if (ny >= 0 && ny < h && edges[ny * w + x]) { pts.push(x); break; } } }
    } else {
      for (let y = 0; y < h; y++) { const x = Math.round((rho - y * s) / c); for (let dx = -1; dx <= 1; dx++) { const nx = x + dx; if (nx >= 0 && nx < w && edges[y * w + nx]) { pts.push(y); break; } } }
    }
    const at = (p) => (horizontal ? [p, (rho - p * c) / s] : [(rho - p * s) / c, p]);
    let start = pts[0]; let prev = pts[0]; let count = 1;
    const flush = () => { const span = prev - start + 1; if (span >= minLen && count / span >= 0.6) segs.push({ a: at(start), b: at(prev + 1) }); };
    for (let i = 1; i < pts.length; i++) {
      if (pts[i] - prev > gap) { flush(); start = pts[i]; count = 0; }
      count++; prev = pts[i];
    }
    if (pts.length) flush();
  }
  return segs;
}

/**
 * Edge segments of a plan picture, in pixels: { segments: [{ a, b }], edges (Uint8Array), width, height }.
 * `scale` (≤ 1) is applied by the caller when it shrinks big pictures first.
 */
export function imageEdgeSegments(image, { edgeThreshold = 0.25, minSegment = 12, gap = 6 } = {}) {
  const { data, width: w, height: h } = image;
  const gray = gaussianBlur(toGrayscale(data, w, h), w, h);
  const { mag, gx, gy } = sobel(gray, w, h);
  const raw = threshold(nonMaxSuppression(mag, gx, gy, w, h), gx, gy, w, h, edgeThreshold);
  const edges = denoise(raw, w, h, 4);
  const border = Math.max(3, Math.round(Math.min(w, h) * 0.01));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (y < border || y >= h - border || x < border || x >= w - border) edges[y * w + x] = 0;
  const lines = hough(edges, w, h, minSegment, minSegment);
  return { segments: segmentsAlong(lines, edges, w, h, minSegment, gap), edges, width: w, height: h };
}

/** Otsu's threshold of a grey picture (ink / paper split), kept between 60 and 200. */
function otsu(gray) {
  const hist = new Float64Array(256);
  for (const v of gray) hist[v]++;
  const total = gray.length;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0; let wB = 0; let best = 0; let level = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB; const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; level = t; }
  }
  return Math.max(60, Math.min(200, level));
}

// ───────────────────────── scans: deskew and noise

/**
 * The dominant edge direction of a picture (radians in (−45°, 45°], image axes: x right, y down): walls are
 * square to each other, so the edge directions (Sobel gradients, weighted by strength) fold onto a quarter turn
 * and the strongest one wins (0.25° bins, smoothed, refined between bins).
 */
export function dominantAngle(image) {
  const { data, width: w, height: h } = image;
  const { mag, gx, gy } = sobel(gaussianBlur(toGrayscale(data, w, h), w, h), w, h);
  let max = 0;
  for (let i = 0; i < w * h; i++) if (mag[i] > max) max = mag[i];
  if (!(max > 0)) return 0;
  const BINS = 360; const Q = Math.PI / 2;
  const hist = new Float64Array(BINS);
  const cut = max * 0.2;
  for (let i = 0; i < w * h; i++) {
    const m = mag[i];
    if (m < cut) continue;
    let t = Math.atan2(gy[i], gx[i]) % Q;
    if (t < 0) t += Q;
    hist[Math.min(BINS - 1, Math.floor((t / Q) * BINS))] += m;
  }
  const smooth = new Float64Array(BINS);
  for (let b = 0; b < BINS; b++) for (let k = -3; k <= 3; k++) smooth[b] += hist[(b + k + BINS) % BINS] * (4 - Math.abs(k));
  let peak = 0;
  for (let b = 1; b < BINS; b++) if (smooth[b] > smooth[peak]) peak = b;
  const l = smooth[(peak - 1 + BINS) % BINS]; const c = smooth[peak]; const r = smooth[(peak + 1) % BINS];
  const shift = l - 2 * c + r !== 0 ? (0.5 * (l - r)) / (l - 2 * c + r) : 0;
  let angle = ((peak + 0.5 + shift) / BINS) * Q;
  if (angle > Q / 2) angle -= Q;
  // Gradient directions lean towards the pixel axes; the edge pixels themselves line up best (the sharpest
  // row and column profiles) at the true angle: search ±1° around the estimate, then finer.
  const xs = []; const ys = [];
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 400000)));
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (mag[y * w + x] >= cut) { xs.push(x); ys.push(y); }
  if (xs.length < 50) return angle;
  const diag = Math.ceil(Math.hypot(w, h));
  const prof = new Float64Array(diag * 2 + 4); const prof2 = new Float64Array(diag * 2 + 4);
  const sharpness = (t) => {
    prof.fill(0); prof2.fill(0);
    const ct = Math.cos(t); const st = Math.sin(t);
    for (let i = 0; i < xs.length; i++) {
      prof[Math.round(-xs[i] * st + ys[i] * ct) + diag]++;
      prof2[Math.round(xs[i] * ct + ys[i] * st) + diag]++;
    }
    let sum = 0;
    for (let i = 0; i < prof.length; i++) sum += prof[i] * prof[i] + prof2[i] * prof2[i];
    return sum;
  };
  const DEG = Math.PI / 180;
  // Coarse: every half degree of the quarter turn (stair-stepped edges can fool the gradients), and the gradients' guess.
  let best = angle; let bestScore = sharpness(angle);
  for (let d = -45; d < 45; d += 0.5) { const s = sharpness(d * DEG); if (s > bestScore) { bestScore = s; best = d * DEG; } }
  angle = best;
  for (const [span, inc] of [[0.6, 0.05], [0.05, 0.005]]) {
    for (let d = -span; d <= span + 1e-9; d += inc) { const s = sharpness(angle + d * DEG); if (s > bestScore) { bestScore = s; best = angle + d * DEG; } }
    angle = best;
  }
  if (angle > Q / 2) angle -= Q;
  if (angle <= -Q / 2) angle += Q;
  return angle;
}

/**
 * The picture turned so that edges at `angle` (image axes) run along the rows and columns, on a canvas big enough
 * for all of it (white around): { image, toSource(q) } — toSource maps a point of the new picture (pixels) back.
 */
export function rotateImage(image, angle) {
  const { data, width: w, height: h } = image;
  const c = Math.cos(angle); const s = Math.sin(angle);
  const W = Math.ceil(w * Math.abs(c) + h * Math.abs(s)) + 2; const H = Math.ceil(w * Math.abs(s) + h * Math.abs(c)) + 2;
  const c0 = [w / 2, h / 2]; const c1 = [W / 2, H / 2];
  // A point q of the new picture comes from p = c0 + R(angle)·(q − c1) (an edge at `angle` becomes level).
  const toSource = (q) => { const x = q[0] - c1[0]; const y = q[1] - c1[1]; return [c0[0] + c * x - s * y, c0[1] + s * x + c * y]; };
  const out = new Uint8ClampedArray(W * H * 4).fill(255);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [px, py] = toSource([x + 0.5, y + 0.5]);
      const fx = px - 0.5; const fy = py - 0.5;
      const x0 = Math.floor(fx); const y0 = Math.floor(fy);
      if (x0 < -1 || y0 < -1 || x0 >= w || y0 >= h) continue;
      const tx = fx - x0; const ty = fy - y0;
      const o = (y * W + x) * 4;
      const in0 = y0 >= 0 && y0 < h; const in1 = y0 + 1 < h;
      const i00 = in0 && x0 >= 0 ? (y0 * w + x0) * 4 : -1; const i10 = in0 && x0 + 1 < w ? (y0 * w + x0 + 1) * 4 : -1;
      const i01 = in1 && x0 >= 0 ? ((y0 + 1) * w + x0) * 4 : -1; const i11 = in1 && x0 + 1 < w ? ((y0 + 1) * w + x0 + 1) * 4 : -1;
      for (let k = 0; k < 4; k++) {
        const v00 = i00 < 0 ? 255 : data[i00 + k]; const v10 = i10 < 0 ? 255 : data[i10 + k];
        const v01 = i01 < 0 ? 255 : data[i01 + k]; const v11 = i11 < 0 ? 255 : data[i11 + k];
        out[o + k] = (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
      }
    }
  }
  return { image: { data: out, width: W, height: H }, toSource };
}

/** Grain of the paper: mean difference of neighbouring light pixels (0 for a clean export, several grey levels for a scan). */
function paperGrain(gray, w, h, level) {
  let sum = 0; let n = 0;
  for (let y = 0; y < h; y += 2) for (let x = 0; x + 1 < w; x += 2) {
    const a = gray[y * w + x]; const b = gray[y * w + x + 1];
    if (a > level && b > level) { sum += Math.abs(a - b); n++; }
  }
  return n ? sum / n : 0;
}

function median3(g, w, h) {
  const out = new Uint8Array(g);
  const v = new Uint8Array(9);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    let k = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const val = g[(y + dy) * w + x + dx];
      let j = k++;
      while (j > 0 && v[j - 1] > val) { v[j] = v[j - 1]; j--; }
      v[j] = val;
    }
    out[y * w + x] = v[4];
  }
  return out;
}

/**
 * Ink of a picture (1 = ink). Clean pictures: one threshold (Otsu). Scans (grainy paper, uneven light): a median
 * filter, then each pixel against the mean of its neighbourhood (`window` pixels, Bradley's method), then specks
 * removed and pinholes filled.
 */
export function inkMask(gray, w, h, { window = 31, smooth = false } = {}) {
  const level = otsu(gray);
  const ink = new Uint8Array(w * h);
  const grain = paperGrain(gray, w, h, level);
  if (grain < 2.5) {
    for (let i = 0; i < w * h; i++) ink[i] = gray[i] < level ? 1 : 0;
    return { ink: smooth ? majority(ink, w, h) : ink, level, scanned: false };
  }
  const g = median3(gray, w, h);
  const W1 = w + 1;
  const integral = new Float64Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += g[y * w + x]; integral[(y + 1) * W1 + x + 1] = integral[y * W1 + x + 1] + row; } }
  const r = Math.max(7, window >> 1);
  const ceiling = Math.min(230, level + 50);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r); const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r); const x1 = Math.min(w, x + r + 1);
      const sum = integral[y1 * W1 + x1] - integral[y0 * W1 + x1] - integral[y1 * W1 + x0] + integral[y0 * W1 + x0];
      const v = g[y * w + x];
      const local = sum / ((x1 - x0) * (y1 - y0));
      // Darker than its surroundings; near thick ink (a dark neighbourhood) the global level counts too.
      ink[y * w + x] = (v < ceiling && v < local * 0.78) || (v < level && v < local * 0.97) ? 1 : 0;
    }
  }
  return { ink: majority(ink, w, h), level, scanned: true };
}

/** Specks off, pinholes filled and ragged edges straightened: the majority of each 3 × 3 block, twice. */
function majority(ink, w, h) {
  let cur = ink;
  for (let pass = 0; pass < 2; pass++) {
    const out = new Uint8Array(cur);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += cur[(y + dy) * w + x + dx];
      out[y * w + x] = n >= 5 ? 1 : 0;
    }
    cur = out;
  }
  return cur;
}

/**
 * Ink outlines of a plan picture, in pixels: the borders between dark (ink) and light (paper) pixels that run
 * straight along rows or columns, as segments [{ a, b }] — the faces of filled or double-line walls, like CAD lines.
 */
export function imageMaskSegments(image, { minSegment = 8, gap = 1, window = 31, turned = false } = {}) {
  const { data, width: w, height: h } = image;
  const gray = toGrayscale(data, w, h);
  const { ink, level, scanned } = inkMask(gray, w, h, { window, smooth: turned });
  // Scanned or turned pictures: edges still wander by a pixel here and there (stair steps), so bridge a little
  // more and keep short runs too, they are joined across neighbouring rows below.
  const rough = scanned || turned;
  if (rough) gap = Math.max(gap, 3);
  const segs = [];
  const minRun = rough ? 2 : minSegment;
  const runs = (count, len, edgeAt, emit) => {
    for (let k = 1; k < count; k++) {
      for (const kind of [1, -1]) {
        let start = -1; let last = -2;
        for (let t = 0; t <= len; t++) {
          const on = t < len && edgeAt(k, t) === kind;
          if (on) { if (start < 0 || t - last > gap + 1) { if (start >= 0 && last - start + 1 >= minRun) emit(k, start, last + 1, kind); start = t; } last = t; }
        }
        if (start >= 0 && last - start + 1 >= minRun) emit(k, start, last + 1, kind);
      }
    }
  };
  const rows = []; const cols = [];
  // Horizontal borders (between rows y−1 and y): +1 = ink below (a top face), −1 = ink above.
  runs(h, w, (y, x) => ink[y * w + x] - ink[(y - 1) * w + x], (k, t0, t1, kind) => rows.push({ k, t0, t1, kind }));
  // Vertical borders (between columns x−1 and x).
  runs(w, h, (x, y) => ink[y * w + x] - ink[y * w + x - 1], (k, t0, t1, kind) => cols.push({ k, t0, t1, kind }));
  const joined = (list) => (rough ? joinNeighbours(list, gap + 1) : list).filter((r) => r.t1 - r.t0 >= minSegment);
  for (const r of joined(rows)) segs.push({ a: [r.t0, r.k], b: [r.t1, r.k] });
  for (const r of joined(cols)) segs.push({ a: [r.k, r.t0], b: [r.k, r.t1] });
  return { segments: segs, level, scanned, width: w, height: h };
}

/**
 * Border runs of one kind on neighbouring rows (|Δrow| ≤ 1) that overlap or nearly touch are one edge that
 * steps between two rows (the staircase of a slightly turned or noisy edge): joined into one run on the row
 * holding most of its length.
 */
function joinNeighbours(list, gap) {
  const byKey = new Map();
  for (const r of list) { const key = `${r.kind}:${r.k}`; if (!byKey.has(key)) byKey.set(key, []); byKey.get(key).push(r); }
  const parent = list.map((_, i) => i);
  list.forEach((r, i) => { r.i = i; });
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (const r of list) {
    for (const dk of [0, 1]) {
      for (const q of byKey.get(`${r.kind}:${r.k + dk}`) ?? []) {
        if (q === r) continue;
        if (Math.min(r.t1, q.t1) - Math.max(r.t0, q.t0) >= -gap) parent[find(q.i)] = find(r.i);
      }
    }
  }
  const groups = new Map();
  for (const r of list) { const g = find(r.i); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); }
  const out = [];
  for (const members of groups.values()) {
    const weight = new Map();
    for (const m of members) weight.set(m.k, (weight.get(m.k) ?? 0) + m.t1 - m.t0);
    const k = [...weight].sort((a, b) => b[1] - a[1])[0][0];
    // A group spreading over more than three rows is several edges side by side: keep its members apart.
    const ks = members.map((m) => m.k);
    if (Math.max(...ks) - Math.min(...ks) > 2) { out.push(...members); continue; }
    out.push({ k, t0: Math.min(...members.map((m) => m.t0)), t1: Math.max(...members.map((m) => m.t1)), kind: members[0].kind });
  }
  return out;
}

/**
 * Walls (and door / window gaps) in a plan picture. `metresPerPixel` = the picture's scale (after calibration).
 * Returns the recognizer's result in picture metres: x right, z down from the top-left corner, plus `angle` (the
 * picture's tilt that was taken out, radians) and `scanned` (the noisy-picture threshold was used).
 * A tilted picture (a scan, a photo, a plan drawn at an angle; up to ±45°) is turned square first and the walls
 * found are turned back, so they lie on the picture.
 */
/**
 * Mostly dark pictures (a blueprint, a dark-mode screen capture: light lines on a dark ground) as dark lines on a
 * light ground, which is what the wall detection reads. Returns the picture itself when it is light already.
 */
export function lightGround(image) {
  const { data, width: w, height: h } = image;
  const gray = toGrayscale(data, w, h);
  let sum = 0;
  for (let i = 0; i < gray.length; i += 7) sum += gray[i];
  if (sum / Math.ceil(gray.length / 7) >= 110) return image;
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) { out[i] = 255 - data[i]; out[i + 1] = 255 - data[i + 1]; out[i + 2] = 255 - data[i + 2]; out[i + 3] = data[i + 3] ?? 255; }
  return { ...image, data: out, inverted: true };
}

/** Two Otsu thresholds (three tone classes: ink, middle, paper) and the share of pixels in the middle class. */
function otsu3(gray) {
  const hist = new Float64Array(256);
  for (const v of gray) hist[v]++;
  const n = gray.length;
  const P = new Float64Array(257); const S = new Float64Array(257);
  for (let i = 0; i < 256; i++) { P[i + 1] = P[i] + hist[i]; S[i + 1] = S[i] + i * hist[i]; }
  const part = (a, b) => { const w = P[b] - P[a]; return w > 0 ? ((S[b] - S[a]) ** 2) / w : 0; };
  let best = -1; let t1 = 85; let t2 = 170;
  for (let a = 8; a < 248; a += 2) for (let b = a + 8; b < 252; b += 2) {
    const v = part(0, a) + part(a, b) + part(b, 256);
    if (v > best) { best = v; t1 = a; t2 = b; }
  }
  return { t1, t2, middle: (P[t2] - P[t1]) / n };
}

/**
 * The walls of a picture alone, for plans with furniture and coloured floors: a black-on-white picture of the
 * darkest tones (coloured floors and pale furniture drop out), without strokes thinner than a wall (the lines of
 * furniture, hatching, dimension lines and text drop out), keeping only large connected shapes (the wall network,
 * not a dark appliance in the middle of a room). Returns null when nothing wall-like is left.
 * `minThickness` (m) is the thinnest wall to keep.
 */
export function wallsOnly(image, { metresPerPixel, minThickness = 0.09 } = {}) {
  const src = lightGround(image);
  const { width: w, height: h } = src;
  const gray = toGrayscale(src.data, w, h);
  // Coloured floors / furniture fills form a large middle tone: the walls are the class below it.
  const { t1, middle } = otsu3(gray);
  const level = middle > 0.12 ? t1 : otsu(gray);
  let ink = new Uint8Array(w * h);
  for (let i = 0; i < ink.length; i++) ink[i] = gray[i] <= level ? 1 : 0;
  // Opening (erode, then dilate) by a square of radius r: strokes thinner than 2r + 1 pixels vanish.
  const r = Math.max(1, Math.floor((minThickness * 0.8) / metresPerPixel / 2));
  // Separable square window: `all` = erosion (every pixel of the window is ink), else dilation (any pixel is).
  const filter = (mask, all, r) => {
    const tmp = new Uint8Array(w * h); const out = new Uint8Array(w * h);
    const along = (get, n, set) => {
      for (let i = 0; i < n; i++) {
        let v = all ? 1 : 0;
        for (let d = -r; d <= r; d++) {
          const s = get(i + d);
          if (all ? !s : s) { v = all ? 0 : 1; break; }
        }
        set(i, v);
      }
    };
    for (let y = 0; y < h; y++) along((x) => (x < 0 || x >= w ? 0 : mask[y * w + x]), w, (x, v) => { tmp[y * w + x] = v; });
    for (let x = 0; x < w; x++) along((y) => (y < 0 || y >= h ? 0 : tmp[y * w + x]), h, (y, v) => { out[y * w + x] = v; });
    return out;
  };
  // First a closing by one pixel: walls drawn as hatching or pencil strokes become solid (the hairline gaps
  // between the strokes fill; separate furniture lines stay apart). Then the opening.
  ink = filter(filter(ink, false, 1), true, 1);
  ink = filter(filter(ink, true, r), false, r);
  // Large connected shapes only (a span of at least 0.8 m: a wall stub between a door and a window still counts).
  const label = new Int32Array(w * h).fill(-1);
  const span = Math.max(8, 0.8 / metresPerPixel);
  const keepComp = [];
  const stack = [];
  let comps = 0;
  for (let i = 0; i < ink.length; i++) {
    if (!ink[i] || label[i] >= 0) continue;
    let x0 = w; let x1 = 0; let y0 = h; let y1 = 0;
    stack.push(i); label[i] = comps;
    while (stack.length) {
      const j = stack.pop(); const x = j % w; const y = (j / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const k of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1]) if (k >= 0 && ink[k] && label[k] < 0) { label[k] = comps; stack.push(k); }
    }
    keepComp.push(Math.max(x1 - x0, y1 - y0) >= span);
    comps++;
  }
  const data = new Uint8ClampedArray(w * h * 4);
  let kept = 0;
  for (let i = 0; i < ink.length; i++) {
    const on = ink[i] && keepComp[label[i]];
    if (on) kept++;
    const v = on ? 0 : 255;
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
  }
  return kept > 0 ? { data, width: w, height: h } : null;
}

/**
 * Walls, doors and windows of a plan picture. `evidence`: the picture the door swings are read from (the original
 * when `image` is its walls-only copy, see wallsOnly) — the same size; by default `image` itself.
 */
export function detectImageWalls(image, { metresPerPixel, method = 'outline', edgeThreshold = 0.25, minThickness = 0.09, maxThickness = 0.45, deskew = true, evidence = null } = {}) {
  const m = metresPerPixel;
  image = lightGround(image);
  let swings = evidence && evidence.width === image.width && evidence.height === image.height ? lightGround(evidence) : image;
  let work = image; let back = (p) => p; let angle = 0;
  if (deskew) {
    angle = dominantAngle(image);
    if (Math.abs(angle) > 0.3 * Math.PI / 180) {
      const turned = rotateImage(image, angle);
      work = turned.image;
      if (swings !== image) swings = rotateImage(swings, angle).image;
      else swings = work;
      back = (p) => { const q = turned.toSource([p[0] / m, p[1] / m]); return [q[0] * m, q[1] * m]; };
    } else angle = 0;
  }
  const minSegment = Math.max(6, Math.round(0.1 / m));
  // 'outline': borders of the ink (sharp, exact for clean pictures); 'edges': Sobel + Hough (3DArchitecture), for noisy scans.
  const found = method === 'edges'
    ? imageEdgeSegments(work, { edgeThreshold, minSegment, gap: Math.max(3, Math.round(0.12 / m)) })
    : imageMaskSegments(work, { minSegment, gap: 1, window: Math.max(15, Math.round(0.8 / m)) | 1, turned: work !== image });
  const lines = found.segments.map((sg) => ({ a: [sg.a[0] * m, sg.a[1] * m], b: [sg.b[0] * m, sg.b[1] * m], layer: 'IMAGE' }));
  const result = recognizePlan({ lines }, { mode: 'image', minThickness: Math.max(minThickness, 2.5 * m), maxThickness, angleTol: 1, minWall: Math.max(0.3, 6 * m), bandTolerance: Math.max(0.02, 4 * m) });
  doorSwings(swings === image ? work : swings, result, m);
  const turn = (x) => ({ ...x, a: back(x.a), b: back(x.b) });
  return { ...result, walls: result.walls.map(turn), leftovers: result.leftovers.map(turn), segments: lines.map(turn), angle, scanned: Boolean(found.scanned) };
}

/**
 * Door gaps in a picture: which way the door opens and where its hinge is, from the ink of the drawn swing
 * (a quarter circle around the hinge and the leaf line). Of the four possible swings the one over most ink wins.
 */
function doorSwings(image, result, m) {
  const { data, width: w, height: h } = image;
  const gray = toGrayscale(data, w, h);
  const level = otsu(gray);
  const inkAt = (x, z) => {
    const px = Math.round(x / m); const py = Math.round(z / m);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = px + dx; const Y = py + dy;
      if (X >= 0 && Y >= 0 && X < w && Y < h && gray[Y * w + X] < level) return 1;
    }
    return 0;
  };
  for (const op of result.openings) {
    if (op.kind !== 'door') continue;
    const wall = result.walls[op.wall];
    const L = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
    const u = [(wall.b[0] - wall.a[0]) / L, (wall.b[1] - wall.a[1]) / L];
    const n = [-u[1], u[0]];
    const g = op.width;
    let best = null;
    for (const side of [1, -1]) {
      for (const end of [-1, 1]) {
        // Hinge on the jamb at `end`, on the face towards `side`; the leaf closes along −end·u and opens along side·n.
        const s = op.offset + (end * g) / 2;
        const H = [wall.a[0] + u[0] * s + n[0] * side * (wall.thickness / 2), wall.a[1] + u[1] * s + n[1] * side * (wall.thickness / 2)];
        let ink = 0; const N = 24;
        for (let i = 1; i < N; i++) {
          const t = (i / N) * (Math.PI / 2);
          const dir = [-end * u[0] * Math.cos(t) + side * n[0] * Math.sin(t), -end * u[1] * Math.cos(t) + side * n[1] * Math.sin(t)];
          ink += inkAt(H[0] + dir[0] * g * 0.97, H[1] + dir[1] * g * 0.97);
        }
        for (let i = 2; i < 10; i++) ink += inkAt(H[0] + side * n[0] * g * (i / 10), H[1] + side * n[1] * g * (i / 10)) * 0.5;
        if (!best || ink > best.ink) best = { ink, side, end };
      }
    }
    if (!best || best.ink < 6) continue;
    op.side = best.side > 0 ? 'left' : 'right';
    const hingeLocal = best.end * (op.side === 'left' ? 1 : -1);
    op.hinge = hingeLocal < 0 ? 'left' : 'right';
  }
}
