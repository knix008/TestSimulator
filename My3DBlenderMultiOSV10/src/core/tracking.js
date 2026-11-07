// Motion tracking: following small patches of a clip from frame to frame by normalized cross-correlation, stabilizing with the
// tracks, and recovering the camera's turns and the points' places by factorization (Tomasi-Kanade, orthographic camera).
//
// A frame is { width, height, luma: Float32Array or Uint8Array }. A track is { id, name, points: { frame: [x, y] }, score }.
import { Matrix4, Quaternion, Vector3 } from 'three';
import { newId } from './doc.js';

export const rgbaToLuma = ({ width, height, rgba }) => {
  const luma = new Float32Array(width * height);
  for (let i = 0; i < luma.length; i++) luma[i] = rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114;
  return { width, height, luma };
};

/** Normalized cross-correlation of a template at (x, y) of a frame; 1 is a perfect match. */
function ncc(template, frame, x, y) {
  const { size, values, mean, norm } = template;
  const half = (size - 1) / 2;
  const { width, height, luma } = frame;
  if (x - half < 0 || y - half < 0 || x + half >= width || y + half >= height) return -2;
  let sum = 0;
  for (let j = 0; j < size; j++) {
    const row = (y - half + j) * width + (x - half);
    for (let i = 0; i < size; i++) sum += luma[row + i];
  }
  const fMean = sum / (size * size);
  let cross = 0;
  let energy = 0;
  let k = 0;
  for (let j = 0; j < size; j++) {
    const row = (y - half + j) * width + (x - half);
    for (let i = 0; i < size; i++) {
      const d = luma[row + i] - fMean;
      cross += (values[k++] - mean) * d;
      energy += d * d;
    }
  }
  return norm > 1e-6 && energy > 1e-6 ? cross / Math.sqrt(norm * energy) : -1;
}

function takeTemplate(frame, x, y, size) {
  const half = (size - 1) / 2;
  const [cx, cy] = [Math.round(x), Math.round(y)];
  const values = new Float32Array(size * size);
  let total = 0;
  let k = 0;
  for (let j = -half; j <= half; j++) {
    for (let i = -half; i <= half; i++) {
      const v = frame.luma[Math.max(0, Math.min(frame.height - 1, cy + j)) * frame.width + Math.max(0, Math.min(frame.width - 1, cx + i))];
      values[k++] = v;
      total += v;
    }
  }
  const mean = total / values.length;
  let norm = 0;
  for (const v of values) norm += (v - mean) * (v - mean);
  return { size, values, mean, norm };
}

/** Where a patch went: { x, y, score }, sub-pixel by a parabola through the best score and its neighbours. */
export function trackStep(previous, next, x, y, { patch = 15, search = 12 } = {}) {
  const size = patch | 1;
  const template = takeTemplate(previous, x, y, size);
  const [cx, cy] = [Math.round(x), Math.round(y)];
  let best = { x: cx, y: cy, score: -3 };
  for (let dy = -search; dy <= search; dy++) {
    for (let dx = -search; dx <= search; dx++) {
      const score = ncc(template, next, cx + dx, cy + dy);
      if (score > best.score) best = { x: cx + dx, y: cy + dy, score };
    }
  }
  const refine = (a, b, c) => { const d = a - 2 * b + c; return Math.abs(d) > 1e-9 ? Math.max(-0.5, Math.min(0.5, (a - c) / (2 * d))) : 0; };
  const sx = refine(ncc(template, next, best.x - 1, best.y), best.score, ncc(template, next, best.x + 1, best.y));
  const sy = refine(ncc(template, next, best.x, best.y - 1), best.score, ncc(template, next, best.x, best.y + 1));
  return { x: best.x + sx, y: best.y + sy, score: best.score };
}

export const createTrack = (name, frame, x, y) => ({ id: newId('trk'), name, points: { [frame]: [x, y] }, score: 1 });

/**
 * Follows a track from a frame to another, one frame at a time. `frameAt(n)` gives the frame's picture.
 * It stops when the match gets worse than `minScore`: a lost track is better than a wrong one. Returns how many frames were added.
 */
export function trackForward(track, frameAt, from, to, { patch = 15, search = 12, minScore = 0.6 } = {}) {
  const step = to >= from ? 1 : -1;
  let [x, y] = track.points[from];
  let added = 0;
  for (let f = from; f !== to; f += step) {
    const [a, b] = [frameAt(f), frameAt(f + step)];
    if (!a || !b) break;
    const hit = trackStep(a, b, x, y, { patch, search });
    if (hit.score < minScore) break;
    track.points[f + step] = [hit.x, hit.y];
    [x, y] = [hit.x, hit.y];
    track.score = hit.score;
    added++;
  }
  return added;
}

/** Offsets that hold the average of some tracks still: { frame: [dx, dy] }, relative to `reference`. */
export function stabilizationOffsets(tracks, reference) {
  const out = {};
  const frames = new Set(tracks.flatMap((t) => Object.keys(t.points).map(Number)));
  for (const f of frames) {
    let [sx, sy, n] = [0, 0, 0];
    for (const t of tracks) {
      const [p, r] = [t.points[f], t.points[reference]];
      if (!p || !r) continue;
      sx += r[0] - p[0];
      sy += r[1] - p[1];
      n++;
    }
    if (n) out[f] = [sx / n, sy / n];
  }
  return out;
}

// ─────────────── camera solve

/** Eigen decomposition of a symmetric matrix (Jacobi): eigenvalues, largest first, and vectors as columns. */
function eigenSymmetric(input) {
  const n = input.length;
  const a = input.map((r) => [...r]);
  const v = a.map((_, i) => a.map((__, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
    if (off < 1e-18) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-14) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      const s = t * c;
      for (let k = 0; k < n; k++) { const [x, y] = [a[k][p], a[k][q]]; a[k][p] = c * x - s * y; a[k][q] = s * x + c * y; }
      for (let k = 0; k < n; k++) { const [x, y] = [a[p][k], a[q][k]]; a[p][k] = c * x - s * y; a[q][k] = s * x + c * y; }
      for (let k = 0; k < n; k++) { const [x, y] = [v[k][p], v[k][q]]; v[k][p] = c * x - s * y; v[k][q] = s * x + c * y; }
    }
  }
  const order = a.map((_, i) => i).sort((x, y) => a[y][y] - a[x][x]);
  return { values: order.map((i) => a[i][i]), vectors: order.map((i) => v.map((row) => row[i])) };
}

function solveLinear(A, b) {
  const n = b.length;
  const m = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(m[r][i]) > Math.abs(m[pivot][i])) pivot = r;
    [m[i], m[pivot]] = [m[pivot], m[i]];
    if (Math.abs(m[i][i]) < 1e-12) return null;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const k = m[r][i] / m[i][i];
      for (let c = i; c <= n; c++) m[r][c] -= k * m[i][c];
    }
  }
  return m.map((r, i) => r[n] / r[i]);
}

/**
 * The shape and the camera's turns from point tracks seen in every frame.
 * Returns { points: [[x,y,z]…], rotations: [Quaternion-like [x,y,z,w]…], frames, error } where error is the reprojection error in
 * pixels. A far-away camera is assumed, so strong perspective shows as a larger error. Needs at least 4 points and 3 frames.
 */
export function solveCamera(tracks, { start = null, end = null } = {}) {
  const frameLists = tracks.map((t) => Object.keys(t.points).map(Number));
  const allFrames = [...new Set(frameLists.flat())].sort((a, b) => a - b);
  const frames = allFrames.filter((f) => (start == null || f >= start) && (end == null || f <= end) && tracks.every((t) => t.points[f]));
  if (tracks.length < 4) throw new Error('Solving needs at least 4 tracks');
  if (frames.length < 3) throw new Error('Solving needs at least 3 frames that every track reaches');
  const [F, P] = [frames.length, tracks.length];
  const W = [];
  const means = [];
  for (const f of frames) {
    const us = tracks.map((t) => t.points[f][0]);
    const vs = tracks.map((t) => t.points[f][1]);
    const [mu, mv] = [us.reduce((a, b) => a + b, 0) / P, vs.reduce((a, b) => a + b, 0) / P];
    means.push([mu, mv]);
    W.push(us.map((u) => u - mu));
    W.push(vs.map((v) => mv - v)); // Image rows go down; solved space goes up.
  }
  // WᵀW is small (P × P), and gives V and the singular values of W.
  const WtW = Array.from({ length: P }, (_, a) => Array.from({ length: P }, (__, b) => W.reduce((s, row) => s + row[a] * row[b], 0)));
  const { values, vectors } = eigenSymmetric(WtW);
  const rank = 3;
  const sigma = values.slice(0, rank).map((x) => Math.sqrt(Math.max(x, 0)));
  if (sigma[2] < 1e-6) throw new Error('These tracks do not show depth: they lie in a plane, or the camera hardly turned');
  // M = W V Σ^-½ (motion), S = Σ^½ Vᵀ (shape).
  const M = W.map((row) => [0, 1, 2].map((k) => row.reduce((s, x, p) => s + x * vectors[k][p], 0) / Math.sqrt(sigma[k])));
  const S = [0, 1, 2].map((k) => vectors[k].map((x) => x * Math.sqrt(sigma[k])));
  // Metric upgrade: find Q with (M Q)'s rows orthonormal pairs. L = Q Qᵀ is symmetric: 6 unknowns, least squares.
  const row = (a, b) => [a[0] * b[0], a[0] * b[1] + a[1] * b[0], a[0] * b[2] + a[2] * b[0], a[1] * b[1], a[1] * b[2] + a[2] * b[1], a[2] * b[2]];
  const rows = [];
  const rhs = [];
  for (let f = 0; f < F; f++) {
    const [i, j] = [M[f * 2], M[f * 2 + 1]];
    rows.push(row(i, i)); rhs.push(1);
    rows.push(row(j, j)); rhs.push(1);
    rows.push(row(i, j)); rhs.push(0);
  }
  const AtA = Array.from({ length: 6 }, (_, a) => Array.from({ length: 6 }, (__, b) => rows.reduce((s, r) => s + r[a] * r[b], 0)));
  const Atb = Array.from({ length: 6 }, (_, a) => rows.reduce((s, r, k) => s + r[a] * rhs[k], 0));
  const l = solveLinear(AtA, Atb);
  if (!l) throw new Error('The camera motion is too small to solve');
  const L = [[l[0], l[1], l[2]], [l[1], l[3], l[4]], [l[2], l[4], l[5]]];
  const eigen = eigenSymmetric(L);
  if (eigen.values[2] <= 0) throw new Error('These tracks do not fit one rigid scene seen by a far camera');
  const Q = [0, 1, 2].map((r) => [0, 1, 2].map((c) => eigen.vectors[c][r] * Math.sqrt(eigen.values[c])));
  const Qinv = invert3(Q);
  const motion = M.map((r) => [0, 1, 2].map((c) => r[0] * Q[0][c] + r[1] * Q[1][c] + r[2] * Q[2][c]));
  // The first camera defines the axes: its rows x, y and their cross z. That choice fixes the rotation left free.
  const axes = (f) => {
    const x = motion[f * 2];
    const y = motion[f * 2 + 1];
    const lx = Math.hypot(...x) || 1;
    const nx = x.map((v) => v / lx);
    const dot = nx[0] * y[0] + nx[1] * y[1] + nx[2] * y[2];
    const oy = y.map((v, k) => v - nx[k] * dot);
    const ly = Math.hypot(...oy) || 1;
    const ny = oy.map((v) => v / ly);
    return { x: nx, y: ny, z: [nx[1] * ny[2] - nx[2] * ny[1], nx[2] * ny[0] - nx[0] * ny[2], nx[0] * ny[1] - nx[1] * ny[0]], scale: (lx + ly) / 2 };
  };
  const base = axes(0);
  const B = [base.x, base.y, base.z];
  const inWorld = (v) => [0, 1, 2].map((r) => B[r][0] * v[0] + B[r][1] * v[1] + B[r][2] * v[2]);
  const shape = Array.from({ length: P }, (_, p) => {
    const s = [S[0][p], S[1][p], S[2][p]];
    return inWorld([0, 1, 2].map((r) => Qinv[r][0] * s[0] + Qinv[r][1] * s[1] + Qinv[r][2] * s[2]));
  });
  const rotations = [];
  const scales = [];
  for (let f = 0; f < F; f++) {
    const a = axes(f);
    const [cx, cy, cz] = [inWorld(a.x), inWorld(a.y), inWorld(a.z)];
    // A camera's axes in the world are the columns of its matrix.
    const m = new Matrix4().makeBasis(new Vector3(...cx), new Vector3(...cy), new Vector3(...cz));
    const q = new Quaternion().setFromRotationMatrix(m);
    rotations.push([q.x, q.y, q.z, q.w]);
    scales.push(a.scale);
  }
  // How well it explains the tracks.
  let error = 0;
  for (let f = 0; f < F; f++) {
    for (let p = 0; p < P; p++) {
      const pred = [0, 1].map((r) => {
        const row2 = motion[f * 2 + r];
        const s = [S[0][p], S[1][p], S[2][p]];
        const q2 = [0, 1, 2].map((k) => Qinv[k][0] * s[0] + Qinv[k][1] * s[1] + Qinv[k][2] * s[2]);
        return row2[0] * q2[0] + row2[1] * q2[1] + row2[2] * q2[2];
      });
      error += (pred[0] - W[f * 2][p]) ** 2 + (pred[1] - W[f * 2 + 1][p]) ** 2;
    }
  }
  return { frames, points: shape, rotations, means, scales, error: Math.sqrt(error / (F * P)) };
}

function invert3(m) {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const k = 1 / (det || 1);
  return [[(e * i - f * h) * k, (c * h - b * i) * k, (b * f - c * e) * k], [(f * g - d * i) * k, (a * i - c * g) * k, (c * d - a * f) * k], [(d * h - e * g) * k, (b * g - a * h) * k, (a * e - b * d) * k]];
}
