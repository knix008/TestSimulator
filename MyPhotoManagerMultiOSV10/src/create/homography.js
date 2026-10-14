// Perspective panorama stitching: photos taken by turning the camera are
// related by a homography (a 3 × 3 projective transform), not a shift.
//   1. corners (Harris) on a grey copy at most WORK px on its long side
//   2. descriptors: normalised 8 × 8 samples of a blurred 16 × 16 patch
//   3. matches: nearest neighbour with Lowe's ratio test and a cross-check
//   4. RANSAC on 4-point homographies, then least squares on all inliers
//   5. every photo is projected onto the middle photo's plane and blended with
//      weights that fall off towards each photo's edges (no hard seams), after
//      per-channel gains matched over the overlaps
// Falls back to null when there are too few reliable matches (the caller then
// uses the translation-only stitcher).

const WORK = 900;

// ───────────────────────── small linear algebra

/** Solves A x = b (n × n, Gaussian elimination with partial pivoting); null if singular. */
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/** 3 × 3 (row-major array of 9) helpers. */
export function multiply(a, b) {
  const out = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) out[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return out;
}
export function invert(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h; const B = -(d * i - f * g); const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}
export function apply(m, x, y) {
  const w = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}
const scaleMatrix = (s) => [s, 0, 0, 0, s, 0, 0, 0, 1];

/**
 * Homography mapping src points to dst points (≥ 4 pairs), least squares with
 * h33 = 1 on normalised coordinates. Returns 9 numbers or null.
 */
export function fitHomography(src, dst) {
  if (src.length < 4) return null;
  const norm = (pts) => {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const d = pts.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / pts.length || 1;
    const k = Math.SQRT2 / d;
    return { T: [k, 0, -k * cx, 0, k, -k * cy, 0, 0, 1], pts: pts.map(([x, y]) => [(x - cx) * k, (y - cy) * k]) };
  };
  const a = norm(src);
  const b = norm(dst);
  // Normal equations of the 8 unknowns.
  const AtA = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const Atb = new Array(8).fill(0);
  const add = (row, v) => { for (let r = 0; r < 8; r++) { Atb[r] += row[r] * v; for (let c = 0; c < 8; c++) AtA[r][c] += row[r] * row[c]; } };
  for (let i = 0; i < a.pts.length; i++) {
    const [x, y] = a.pts[i];
    const [u, v] = b.pts[i];
    add([x, y, 1, 0, 0, 0, -u * x, -u * y], u);
    add([0, 0, 0, x, y, 1, -v * x, -v * y], v);
  }
  const hvec = solve(AtA, Atb);
  if (!hvec) return null;
  const Hn = [...hvec, 1];
  const Tbi = invert(b.T);
  if (!Tbi) return null;
  const H = multiply(Tbi, multiply(Hn, a.T));
  const s = H[8];
  return Math.abs(s) < 1e-12 ? null : H.map((v) => v / s);
}

// ───────────────────────── features

function grayOf(image, maxSide) {
  const k = Math.min(1, maxSide / Math.max(image.width, image.height));
  const w = Math.max(8, Math.round(image.width * k));
  const h = Math.max(8, Math.round(image.height * k));
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // Box-average the source pixels under this one.
    const x0 = Math.floor(x / k); const x1 = Math.max(x0 + 1, Math.floor((x + 1) / k));
    const y0 = Math.floor(y / k); const y1 = Math.max(y0 + 1, Math.floor((y + 1) / k));
    let s = 0; let n = 0;
    for (let yy = y0; yy < Math.min(image.height, y1); yy++) for (let xx = x0; xx < Math.min(image.width, x1); xx++) {
      const i = (yy * image.width + xx) * 4;
      s += 0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2]; n++;
    }
    out[y * w + x] = n ? s / n : 0;
  }
  return { width: w, height: h, data: out, scale: k };
}

function blur(plane, radius = 1) {
  const { width: w, height: h, data } = plane;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0; let n = 0;
    for (let k = -radius; k <= radius; k++) { const xx = x + k; if (xx >= 0 && xx < w) { s += data[y * w + xx]; n++; } }
    tmp[y * w + x] = s / n;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0; let n = 0;
    for (let k = -radius; k <= radius; k++) { const yy = y + k; if (yy >= 0 && yy < h) { s += tmp[yy * w + x]; n++; } }
    out[y * w + x] = s / n;
  }
  return { ...plane, data: out };
}

/** Harris corners spread over a grid: [[x, y], …] in the grey plane's pixels. */
export function corners(plane, max = 600) {
  const { width: w, height: h, data } = plane;
  const ix = new Float32Array(w * h); const iy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    ix[i] = (data[i + 1] - data[i - 1]) * 0.5;
    iy[i] = (data[i + w] - data[i - w]) * 0.5;
  }
  const xx = blur({ width: w, height: h, data: ix.map((v) => v * v) }, 2).data;
  const yy = blur({ width: w, height: h, data: iy.map((v) => v * v) }, 2).data;
  const xy = blur({ width: w, height: h, data: ix.map((v, i) => v * iy[i]) }, 2).data;
  const score = new Float32Array(w * h);
  const border = 10;
  for (let y = border; y < h - border; y++) for (let x = border; x < w - border; x++) {
    const i = y * w + x;
    const det = xx[i] * yy[i] - xy[i] * xy[i];
    const tr = xx[i] + yy[i];
    score[i] = det - 0.04 * tr * tr;
  }
  // Best corner per grid cell (spread), then the strongest overall.
  const cell = Math.max(8, Math.round(Math.sqrt((w * h) / max)));
  const found = [];
  for (let gy = border; gy < h - border; gy += cell) for (let gx = border; gx < w - border; gx += cell) {
    let best = -1; let bi = -1;
    for (let y = gy; y < Math.min(h - border, gy + cell); y++) for (let x = gx; x < Math.min(w - border, gx + cell); x++) {
      const i = y * w + x;
      if (score[i] > best) { best = score[i]; bi = i; }
    }
    if (bi >= 0 && best > 1) found.push([bi % w, (bi / w) | 0, best]);
  }
  found.sort((a, b) => b[2] - a[2]);
  return found.slice(0, max).map(([x, y]) => [x, y]);
}

/** 64-value normalised descriptor of the blurred patch around (x, y); null near the border. */
function describe(blurred, x, y) {
  const { width: w, height: h, data } = blurred;
  const out = new Float32Array(64);
  let k = 0;
  for (let dy = -7; dy <= 7; dy += 2) for (let dx = -7; dx <= 7; dx += 2) {
    const xx = x + dx; const yy = y + dy;
    if (xx < 0 || yy < 0 || xx >= w || yy >= h) return null;
    out[k++] = data[yy * w + xx];
  }
  const mean = out.reduce((s, v) => s + v, 0) / 64;
  let sd = 0;
  for (let i = 0; i < 64; i++) { out[i] -= mean; sd += out[i] * out[i]; }
  sd = Math.sqrt(sd / 64);
  if (sd < 2) return null; // flat: not distinctive
  for (let i = 0; i < 64; i++) out[i] /= sd;
  return out;
}

function features(image) {
  const plane = grayOf(image, WORK);
  const blurred = blur(plane, 1);
  const list = [];
  for (const [x, y] of corners(plane)) {
    const d = describe(blurred, x, y);
    if (d) list.push({ x, y, d });
  }
  return { list, scale: plane.scale };
}

function distance(a, b, limit) {
  let s = 0;
  for (let i = 0; i < 64; i++) { const e = a[i] - b[i]; s += e * e; if (s > limit) return s; }
  return s;
}

/** Ratio-test + cross-checked matches between two feature lists: [[i, j], …]. */
export function matchFeatures(fa, fb, ratio = 0.75) {
  const nearest = (from, to) => from.map((f) => {
    let best = Infinity; let second = Infinity; let bi = -1;
    for (let j = 0; j < to.length; j++) {
      const d = distance(f.d, to[j].d, second);
      if (d < best) { second = best; best = d; bi = j; } else if (d < second) second = d;
    }
    return best < ratio * ratio * second ? bi : -1;
  });
  const ab = nearest(fa, fb);
  const ba = nearest(fb, fa);
  const out = [];
  for (let i = 0; i < ab.length; i++) if (ab[i] >= 0 && ba[ab[i]] === i) out.push([i, ab[i]]);
  return out;
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

/** RANSAC homography from point pairs (src → dst); returns { H, inliers } or null. */
export function ransacHomography(src, dst, { threshold = 3, iterations = 1500, seed = 7 } = {}) {
  const n = src.length;
  if (n < 8) return null;
  const random = rng(seed);
  let best = null;
  let bestCount = 0;
  for (let it = 0; it < iterations; it++) {
    const pick = new Set();
    while (pick.size < 4) pick.add(Math.floor(random() * n));
    const idx = [...pick];
    const H = fitHomography(idx.map((i) => src[i]), idx.map((i) => dst[i]));
    if (!H) continue;
    let count = 0;
    for (let i = 0; i < n; i++) {
      const [u, v] = apply(H, src[i][0], src[i][1]);
      if (Math.hypot(u - dst[i][0], v - dst[i][1]) < threshold) count++;
    }
    if (count > bestCount) { bestCount = count; best = H; }
  }
  if (!best || bestCount < Math.max(8, n * 0.2)) return null;
  const inliers = [];
  for (let i = 0; i < n; i++) {
    const [u, v] = apply(best, src[i][0], src[i][1]);
    if (Math.hypot(u - dst[i][0], v - dst[i][1]) < threshold) inliers.push(i);
  }
  const refined = fitHomography(inliers.map((i) => src[i]), inliers.map((i) => dst[i])) ?? best;
  return { H: refined, inliers: inliers.length, total: n };
}

/**
 * Homography mapping image b's pixels into image a's pixels (full resolution),
 * or null when the pictures do not match reliably.
 */
export function pairHomography(a, b) {
  const fa = features(a);
  const fb = features(b);
  const matches = matchFeatures(fa.list, fb.list);
  if (matches.length < 10) return null;
  const src = matches.map(([, j]) => [fb.list[j].x, fb.list[j].y]);
  const dst = matches.map(([i]) => [fa.list[i].x, fa.list[i].y]);
  const fit = ransacHomography(src, dst);
  if (!fit) return null;
  // Back to full-resolution coordinates: Sa⁻¹ · H · Sb.
  const H = multiply(scaleMatrix(1 / fa.scale), multiply(fit.H, scaleMatrix(fb.scale)));
  return { H, inliers: fit.inliers, matches: matches.length };
}

/** A projection that keeps the picture sane (no flips, not stretched to nothing or to infinity). */
function plausible(H, w, h) {
  const pts = [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => apply(H, x, y));
  if (pts.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return false;
  let area = 0;
  for (let i = 0; i < 4; i++) { const [x1, y1] = pts[i]; const [x2, y2] = pts[(i + 1) % 4]; area += x1 * y2 - x2 * y1; }
  area /= 2;
  const ratio = area / (w * h);
  if (!(ratio > 0.2 && ratio < 5)) return false;
  // Convex, same orientation.
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = pts[i]; const [bx, by] = pts[(i + 1) % 4]; const [cx, cy] = pts[(i + 2) % 4];
    if ((bx - ax) * (cy - by) - (by - ay) * (cx - bx) <= 0) return false;
  }
  return true;
}

// ───────────────────────── stitching

const sampleBilinear = (img, x, y, out) => {
  const x0 = Math.floor(x); const y0 = Math.floor(y);
  if (x0 < 0 || y0 < 0 || x0 >= img.width - 1 || y0 >= img.height - 1) return false;
  const fx = x - x0; const fy = y - y0;
  const i = (y0 * img.width + x0) * 4;
  const j = i + img.width * 4;
  for (let c = 0; c < 3; c++) {
    const top = img.data[i + c] * (1 - fx) + img.data[i + 4 + c] * fx;
    const bottom = img.data[j + c] * (1 - fx) + img.data[j + 4 + c] * fx;
    out[c] = top * (1 - fy) + bottom * fy;
  }
  return true;
};

/**
 * Stitches photos with perspective. Returns { image, transforms (image → canvas), gains }
 * or null when the photos could not be matched (use the translation stitcher then).
 * `maxSide` limits the result (the canvas is scaled down to fit).
 */
export function stitchPerspective(images, { maxSide = 12000 } = {}) {
  const n = images.length;
  if (n < 2) return null;
  // Pairwise: image i+1 → image i.
  const pair = [];
  for (let i = 0; i + 1 < n; i++) {
    const r = pairHomography(images[i], images[i + 1]);
    if (!r || !plausible(r.H, images[i + 1].width, images[i + 1].height)) return null;
    pair.push(r.H);
  }
  // Everything onto the middle photo's plane.
  const ref = Math.floor(n / 2);
  const toRef = new Array(n);
  toRef[ref] = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (let i = ref + 1; i < n; i++) toRef[i] = multiply(toRef[i - 1], pair[i - 1]);
  for (let i = ref - 1; i >= 0; i--) {
    const inv = invert(pair[i]);
    if (!inv) return null;
    toRef[i] = multiply(toRef[i + 1], inv);
  }
  for (let i = 0; i < n; i++) if (!plausible(toRef[i], images[i].width, images[i].height)) return null;
  // Canvas bounds.
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const { width: w, height: h } = images[i];
    for (const [x, y] of [[0, 0], [w, 0], [w, h], [0, h]]) {
      const [u, v] = apply(toRef[i], x, y);
      minX = Math.min(minX, u); minY = Math.min(minY, v); maxX = Math.max(maxX, u); maxY = Math.max(maxY, v);
    }
  }
  const fit = Math.min(1, maxSide / Math.max(maxX - minX, maxY - minY));
  const width = Math.max(1, Math.ceil((maxX - minX) * fit));
  const height = Math.max(1, Math.ceil((maxY - minY) * fit));
  const toCanvas = [fit, 0, -minX * fit, 0, fit, -minY * fit, 0, 0, 1];
  const transforms = toRef.map((m) => multiply(toCanvas, m));
  const inverses = transforms.map((m) => invert(m));
  if (inverses.some((m) => !m)) return null;

  // Gains: each photo's colour relative to its neighbour over their overlap (sampled).
  const gains = images.map(() => [1, 1, 1]);
  const px = [0, 0, 0]; const qx = [0, 0, 0];
  for (let i = 1; i < n; i++) {
    const sa = [0, 0, 0]; const sb = [0, 0, 0]; let count = 0;
    const step = Math.max(2, Math.round(Math.sqrt((width * height) / 40000)));
    for (let y = 0; y < height; y += step) for (let x = 0; x < width; x += step) {
      const [ax, ay] = apply(inverses[i - 1], x, y);
      const [bx, by] = apply(inverses[i], x, y);
      if (!sampleBilinear(images[i - 1], ax, ay, px) || !sampleBilinear(images[i], bx, by, qx)) continue;
      for (let c = 0; c < 3; c++) { sa[c] += px[c]; sb[c] += qx[c]; }
      count++;
    }
    gains[i] = gains[i - 1].map((g, c) => (count ? g * Math.min(4, Math.max(0.25, (sa[c] + 1) / (sb[c] + 1))) : g));
  }
  for (let c = 0; c < 3; c++) {
    const k = Math.exp(-gains.reduce((s, g) => s + Math.log(g[c]), 0) / n);
    for (const g of gains) g[c] *= k;
  }

  // Blend: weight = distance to the photo's nearest edge (feathered seams).
  const out = new Uint8ClampedArray(width * height * 4);
  const sample = [0, 0, 0];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0; let g = 0; let b = 0; let wsum = 0;
      for (let i = 0; i < n; i++) {
        const [sx, sy] = apply(inverses[i], x + 0.5, y + 0.5);
        const img = images[i];
        if (!sampleBilinear(img, sx - 0.5, sy - 0.5, sample)) continue;
        const edge = Math.min(sx, sy, img.width - sx, img.height - sy) / (Math.min(img.width, img.height) / 2);
        const wgt = Math.max(1e-4, Math.min(1, edge)) ** 2;
        r += sample[0] * gains[i][0] * wgt; g += sample[1] * gains[i][1] * wgt; b += sample[2] * gains[i][2] * wgt; wsum += wgt;
      }
      if (!wsum) continue;
      const o = (y * width + x) * 4;
      out[o] = r / wsum; out[o + 1] = g / wsum; out[o + 2] = b / wsum; out[o + 3] = 255;
    }
  }
  return { image: { width, height, data: out }, transforms, gains };
}
