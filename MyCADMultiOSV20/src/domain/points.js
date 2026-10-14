// FreeCAD Points and Reverse Engineering: point clouds (.xyz / .asc / .pts /
// ASCII .pcd), least-squares fits of a plane, a sphere and a cylinder, and a
// mesh through the points (Delaunay over their best-fit plane). No DOM.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export const POINT_FORMATS = ['xyz', 'asc', 'pts', 'pcd'];

/**
 * Points of a text point cloud: each line "x y z [more]" (commas or spaces);
 * .pts may start with a count line, .pcd has a header up to "DATA ascii".
 */
export function parsePointCloud(text) {
  const src = String(text);
  let body = src;
  if (/^\s*#?\s*\.?PCD|^VERSION|^FIELDS/m.test(src.slice(0, 400))) {
    const at = src.search(/^DATA\s+(\w+)/m);
    if (at < 0) throw new Error('PCD: no DATA line');
    const kind = /^DATA\s+(\w+)/m.exec(src)[1].toLowerCase();
    if (kind !== 'ascii') throw new Error('PCD: only ASCII point clouds are read');
    body = src.slice(src.indexOf('\n', at) + 1);
  }
  const pts = [];
  for (const line of body.split(/\r?\n/)) {
    const v = line.trim().split(/[\s,;]+/).map(Number);
    if (v.length >= 3 && v.slice(0, 3).every(Number.isFinite)) pts.push(v[0], v[1], v[2]);
  }
  if (pts.length < 9) throw new Error('Point cloud: fewer than 3 points');
  return pts;
}

/** Point cloud text (.xyz). */
export function toXyz(points) {
  const lines = [];
  for (let i = 0; i + 2 < points.length; i += 3) lines.push(`${points[i]} ${points[i + 1]} ${points[i + 2]}`);
  return `${lines.join('\n')}\n`;
}

const asPoints = (flat) => { const out = []; for (let i = 0; i + 2 < flat.length; i += 3) out.push([flat[i], flat[i + 1], flat[i + 2]]); return out; };

/** Eigen decomposition of a symmetric 3×3 matrix (Jacobi): { values, vectors } sorted by value, largest first. */
function eigen3(m) {
  const a = [[m[0][0], m[0][1], m[0][2]], [m[1][0], m[1][1], m[1][2]], [m[2][0], m[2][1], m[2][2]]];
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += a[p][q] ** 2;
    if (off < 1e-24) break;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      const s = t * c;
      for (let k = 0; k < 3; k++) { const akp = a[k][p]; const akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < 3; k++) { const apk = a[p][k]; const aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = v[k][p]; const vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq; }
    }
  }
  const order = [0, 1, 2].sort((i, j) => a[j][j] - a[i][i]);
  return { values: order.map((i) => a[i][i]), vectors: order.map((i) => [v[0][i], v[1][i], v[2][i]]) };
}

/** Centroid and principal directions of points (largest spread first). */
export function principalAxes(points) {
  const n = points.length;
  const c = [0, 1, 2].map((k) => points.reduce((s, p) => s + p[k], 0) / n);
  const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of points) {
    const d = sub(p, c);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i][j] += (d[i] * d[j]) / n;
  }
  return { centroid: c, ...eigen3(cov) };
}

const rms = (values) => Math.sqrt(values.reduce((s, v) => s + v * v, 0) / Math.max(1, values.length));

/** Least-squares plane: { centroid, normal, u, v, rms }. */
export function fitPlane(flat) {
  const points = asPoints(flat);
  const { centroid, vectors } = principalAxes(points);
  let normal = unit(vectors[2]);
  if (normal[2] < 0 || (Math.abs(normal[2]) < 1e-12 && normal[1] < 0)) normal = normal.map((x) => -x);
  const u = unit(vectors[0]);
  const v = cross(normal, u);
  return { centroid, normal, u, v, rms: rms(points.map((p) => dot(sub(p, centroid), normal))) };
}

/** Solves A x = b for a small dense system (Gaussian elimination). */
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-300) return null;
    for (let r = c + 1; r < n; r++) { const k = M[r][c] / M[c][c]; for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let j = r + 1; j < n; j++) s -= M[r][j] * x[j]; x[r] = s / M[r][r]; }
  return x;
}

/** Least squares of rows · x = rhs (normal equations). */
function leastSquares(rows, rhs) {
  const n = rows[0].length;
  const A = Array.from({ length: n }, () => new Array(n).fill(0));
  const b = new Array(n).fill(0);
  rows.forEach((row, k) => { for (let i = 0; i < n; i++) { b[i] += row[i] * rhs[k]; for (let j = 0; j < n; j++) A[i][j] += row[i] * row[j]; } });
  return solve(A, b);
}

/** Sphere through the points (algebraic least squares): { center, radius, rms }. */
export function fitSphere(flat) {
  const points = asPoints(flat);
  const c0 = principalAxes(points).centroid;
  const local = points.map((p) => sub(p, c0));
  const x = leastSquares(local.map(([a, b, c]) => [2 * a, 2 * b, 2 * c, 1]), local.map(([a, b, c]) => a * a + b * b + c * c));
  if (!x) return null;
  const center = [x[0] + c0[0], x[1] + c0[1], x[2] + c0[2]];
  const radius = Math.sqrt(Math.max(0, x[3] + x[0] ** 2 + x[1] ** 2 + x[2] ** 2));
  return { center, radius, rms: rms(points.map((p) => Math.hypot(...sub(p, center)) - radius)) };
}

/**
 * Cylinder through the points: the axis is the direction along which the
 * points spread most (or least, whichever fits a circle better), the circle
 * fitted across it. { base, axis, radius, height, rms }.
 */
export function fitCylinder(flat) {
  const points = asPoints(flat);
  const { centroid, vectors } = principalAxes(points);
  let best = null;
  for (const axisGuess of vectors) {
    const axis = unit(axisGuess);
    const e1 = unit(Math.abs(axis[2]) < 0.9 ? cross(axis, [0, 0, 1]) : cross(axis, [1, 0, 0]));
    const e2 = cross(axis, e1);
    const flatPts = points.map((p) => { const d = sub(p, centroid); return [dot(d, e1), dot(d, e2), dot(d, axis)]; });
    const x = leastSquares(flatPts.map(([a, b]) => [2 * a, 2 * b, 1]), flatPts.map(([a, b]) => a * a + b * b));
    if (!x) continue;
    const radius = Math.sqrt(Math.max(0, x[2] + x[0] ** 2 + x[1] ** 2));
    const err = rms(flatPts.map(([a, b]) => Math.hypot(a - x[0], b - x[1]) - radius));
    if (!best || err < best.rms) {
      const along = flatPts.map((p) => p[2]);
      const lo = Math.min(...along); const hi = Math.max(...along);
      const centre = [0, 1, 2].map((k) => centroid[k] + x[0] * e1[k] + x[1] * e2[k]);
      best = { base: centre.map((v, k) => v + lo * axis[k]), axis, radius, height: hi - lo, rms: err };
    }
  }
  return best ? refineCylinder(points, best) : null;
}

/**
 * Gauss–Newton on the radial distances: the axis tilts (two angles), its point
 * moves across it (two offsets) and the radius changes until the points sit on the surface.
 */
function refineCylinder(points, start) {
  const sample = points.length > 4000 ? points.filter((_, i) => i % Math.ceil(points.length / 4000) === 0) : points;
  let axis = start.axis;
  let origin = start.base;
  let radius = start.radius;
  const frame = (ax) => {
    const e1 = unit(Math.abs(ax[2]) < 0.9 ? cross(ax, [0, 0, 1]) : cross(ax, [1, 0, 0]));
    return [e1, cross(ax, e1)];
  };
  const residuals = ([a, b, u, v, r], ax, o) => {
    const [e1, e2] = frame(ax);
    const axis2 = unit([0, 1, 2].map((k) => ax[k] + a * e1[k] + b * e2[k]));
    const o2 = [0, 1, 2].map((k) => o[k] + u * e1[k] + v * e2[k]);
    return sample.map((p) => { const d = sub(p, o2); return Math.hypot(...cross(d, axis2)) - (radius + r); });
  };
  for (let it = 0; it < 12; it++) {
    const base = residuals([0, 0, 0, 0, 0], axis, origin);
    const h = 1e-6 * Math.max(1, radius);
    const J = [0, 1, 2, 3, 4].map((j) => { const x = [0, 0, 0, 0, 0]; x[j] = j < 2 ? 1e-6 : h; return residuals(x, axis, origin).map((v, i) => (v - base[i]) / x[j]); });
    const rows = base.map((_, i) => J.map((col) => col[i]));
    const step = leastSquares(rows, base.map((v) => -v));
    if (!step) break;
    const [e1, e2] = frame(axis);
    axis = unit([0, 1, 2].map((k) => axis[k] + step[0] * e1[k] + step[1] * e2[k]));
    origin = [0, 1, 2].map((k) => origin[k] + step[2] * e1[k] + step[3] * e2[k]);
    radius += step[4];
    if (Math.hypot(...step) < 1e-10) break;
  }
  // The base: where the points start along the axis.
  const along = points.map((p) => dot(sub(p, origin), axis));
  const lo = Math.min(...along); const hi = Math.max(...along);
  return { base: origin.map((v, k) => v + lo * axis[k]), axis, radius, height: hi - lo, rms: rms(points.map((p) => Math.hypot(...cross(sub(p, origin), axis)) - radius)) };
}

/** Delaunay triangulation of 2D points (Bowyer–Watson). Returns index triples. */
export function delaunay(pts) {
  const n = pts.length;
  if (n < 3) return [];
  const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs); const minY = Math.min(...ys);
  const d = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY) || 1;
  const all = [...pts, [minX - 20 * d, minY - d], [minX + d / 2, minY + 20 * d], [minX + 21 * d, minY - d]];
  const circum = (t) => {
    const [a, b, c] = t.map((i) => all[i]);
    const D = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
    if (Math.abs(D) < 1e-300) return { x: 0, y: 0, r2: Infinity };
    const sq = (p) => p[0] * p[0] + p[1] * p[1];
    const x = (sq(a) * (b[1] - c[1]) + sq(b) * (c[1] - a[1]) + sq(c) * (a[1] - b[1])) / D;
    const y = (sq(a) * (c[0] - b[0]) + sq(b) * (a[0] - c[0]) + sq(c) * (b[0] - a[0])) / D;
    return { x, y, r2: (a[0] - x) ** 2 + (a[1] - y) ** 2 };
  };
  let tris = [{ v: [n, n + 1, n + 2] }];
  tris[0].c = circum(tris[0].v);
  for (let i = 0; i < n; i++) {
    const p = all[i];
    const bad = [];
    const keep = [];
    for (const t of tris) ((p[0] - t.c.x) ** 2 + (p[1] - t.c.y) ** 2 < t.c.r2 * (1 + 1e-12) ? bad : keep).push(t);
    const edges = new Map();
    for (const t of bad) for (let k = 0; k < 3; k++) {
      const a = t.v[k]; const b = t.v[(k + 1) % 3];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      edges.set(key, edges.has(key) ? null : [a, b]);
    }
    tris = keep;
    for (const e of edges.values()) {
      if (!e) continue;
      const t = { v: [e[0], e[1], i] };
      t.c = circum(t.v);
      tris.push(t);
    }
  }
  return tris.filter((t) => t.v.every((i) => i < n)).map((t) => {
    const [a, b, c] = t.v.map((i) => all[i]);
    // Counter-clockwise.
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) >= 0 ? t.v : [t.v[0], t.v[2], t.v[1]];
  });
}

/**
 * A surface mesh through the points (Reverse Engineering › mesh from points):
 * Delaunay over the best-fit plane, long thin triangles across gaps dropped.
 * Triangles face the plane's normal side.
 */
export function meshFromPoints(flat, { maxPoints = 6000 } = {}) {
  let points = asPoints(flat);
  if (points.length > maxPoints) { const step = points.length / maxPoints; points = Array.from({ length: maxPoints }, (_, i) => points[Math.floor(i * step)]); }
  const plane = fitPlane(points.flat());
  const uv = points.map((p) => { const d = sub(p, plane.centroid); return [dot(d, plane.u), dot(d, plane.v)]; });
  const tris = delaunay(uv);
  // Edge length limit: well above the typical spacing of the points.
  const lengths = tris.flatMap((t) => [0, 1, 2].map((k) => Math.hypot(uv[t[k]][0] - uv[t[(k + 1) % 3]][0], uv[t[k]][1] - uv[t[(k + 1) % 3]][1]))).sort((a, b) => a - b);
  const limit = (lengths[Math.floor(lengths.length / 2)] ?? 0) * 4;
  return tris.filter((t) => [0, 1, 2].every((k) => Math.hypot(uv[t[k]][0] - uv[t[(k + 1) % 3]][0], uv[t[k]][1] - uv[t[(k + 1) % 3]][1]) <= limit + 1e-9))
    .map((t) => t.map((i) => points[i]));
}

/**
 * Euler angles (degrees, MyCAD order X then Y then Z, rz = 0) that turn the
 * z axis onto `dir`; and the local x / y axes they give.
 */
export function eulerTo(dir) {
  const n = unit(dir);
  const rx = (-Math.asin(Math.max(-1, Math.min(1, n[1]))) * 180) / Math.PI;
  const ry = (Math.atan2(n[0], n[2]) * 180) / Math.PI;
  const a = (rx * Math.PI) / 180; const b = (ry * Math.PI) / 180;
  // R = Ry(b) · Rx(a): images of x and y.
  const x = [Math.cos(b), 0, -Math.sin(b)];
  const y = [Math.sin(b) * Math.sin(a), Math.cos(a), Math.cos(b) * Math.sin(a)];
  return { rx, ry, x, y };
}
