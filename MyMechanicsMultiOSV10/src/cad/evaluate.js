// Surface and wall checks on the display mesh (no kernel): curvature, zebra stripes and thickness analysis.
// Each returns per-vertex colours (Float32Array rgb, the viewport's `colors`) plus the values it measured.
// mesh = { vertices, triangles, normals? } as body.mesh() gives it (every face has its own vertices, so a sharp
// edge between faces never blends their values).

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-15 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };
const vtx = (V, i) => [V[3 * i], V[3 * i + 1], V[3 * i + 2]];

/** Per-vertex unit normals: the mesh's own, or the area-weighted normals of the triangles around each vertex. */
export function vertexNormals(mesh) {
  const V = mesh.vertices, T = mesh.triangles, n = V.length / 3;
  if (mesh.normals?.length === V.length) {
    const out = new Float32Array(V.length);
    for (let i = 0; i < n; i++) out.set(unit(vtx(mesh.normals, i)), 3 * i);
    return out;
  }
  const acc = new Float64Array(V.length);
  for (let t = 0; t < T.length; t += 3) {
    const a = vtx(V, T[t]), b = vtx(V, T[t + 1]), c = vtx(V, T[t + 2]);
    const nn = cross(sub(b, a), sub(c, a));
    for (const i of [T[t], T[t + 1], T[t + 2]]) for (let k = 0; k < 3; k++) acc[3 * i + k] += nn[k];
  }
  const out = new Float32Array(V.length);
  for (let i = 0; i < n; i++) out.set(unit(vtx(acc, i)), 3 * i);
  return out;
}

// ───────────────────────── curvature

/**
 * Curvature (1/mm) at every vertex: of the normal curvatures along the mesh edges at the vertex,
 * κ = (n_i − n_j)·(p_i − p_j) / |p_i − p_j|², the one largest in size, with its sign (> 0 convex, < 0 concave).
 * A plane gives 0, a cylinder or sphere of radius r gives ±1/r. Returns { curvature: Float32Array, max }.
 */
export function vertexCurvature(mesh) {
  const V = mesh.vertices, T = mesh.triangles, N = vertexNormals(mesh), n = V.length / 3;
  const curvature = new Float32Array(n);
  const visit = (i, j) => {
    const d = sub(vtx(V, i), vtx(V, j)); const l2 = dot(d, d);
    if (l2 < 1e-18) return;
    const k = dot(sub(vtx(N, i), vtx(N, j)), d) / l2;
    if (Math.abs(k) > Math.abs(curvature[i])) curvature[i] = k;
    if (Math.abs(k) > Math.abs(curvature[j])) curvature[j] = k;
  };
  for (let t = 0; t < T.length; t += 3) { visit(T[t], T[t + 1]); visit(T[t + 1], T[t + 2]); visit(T[t + 2], T[t]); }
  let max = 0;
  for (let i = 0; i < n; i++) max = Math.max(max, Math.abs(curvature[i]));
  return { curvature, max };
}

/** Curvature legend colour: black-blue (flat) → green → yellow → red (radius `minRadius` or tighter); log scale. */
export function curvatureColor(k, minRadius = 1, maxRadius = 1000) {
  const a = Math.abs(k);
  if (a < 1 / maxRadius) return [0.12, 0.16, 0.5];
  const t = Math.min(1, Math.max(0, Math.log(a * maxRadius) / Math.log(maxRadius / minRadius)));
  const hue = (1 - t) * 4;
  const x = 1 - Math.abs((hue % 2) - 1);
  if (hue >= 3) return [0, x, 1];
  if (hue >= 2) return [0, 1, x];
  if (hue >= 1) return [x, 1, 0];
  return [1, x, 0];
}

/** Curvature display: { colors, curvature, max, minRadius, maxRadius }. `size` = the part's size (sets the legend). */
export function curvatureColours(mesh, { size = 100 } = {}) {
  const { curvature, max } = vertexCurvature(mesh);
  const minRadius = Math.max(size / 200, 0.1); const maxRadius = Math.max(size * 10, minRadius * 10);
  const colors = new Float32Array(curvature.length * 3);
  curvature.forEach((k, i) => colors.set(curvatureColor(k, minRadius, maxRadius), 3 * i));
  return { colors, curvature, max, minRadius, maxRadius };
}

// ───────────────────────── zebra stripes

/**
 * Zebra stripes: the reflection of the eye ray in each vertex normal looks up a striped environment
 * (parallel bands across `up`). Smooth (tangent / curvature continuous) joins show continuous stripes, a
 * crease shows them jump. `view` = unit direction from the model toward the eye, `up` the screen's up.
 * Returns { colors, band: Float32Array (stripe coordinate per vertex) }.
 */
export function zebraColours(mesh, { view = [0, 0, 1], up = [0, 1, 0], stripes = 10 } = {}) {
  const N = vertexNormals(mesh), n = N.length / 3, v = unit(view);
  let u = sub(up, v.map((x) => x * dot(up, v)));
  u = unit(u);
  if (!(Math.hypot(...u) > 0)) u = Math.abs(v[1]) < 0.9 ? unit(cross(v, [1, 0, 0])) : unit(cross(v, [0, 0, 1]));
  const colors = new Float32Array(3 * n), band = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const nn = vtx(N, i); const c = dot(nn, v);
    const r = [2 * c * nn[0] - v[0], 2 * c * nn[1] - v[1], 2 * c * nn[2] - v[2]];
    const s = Math.asin(Math.max(-1, Math.min(1, dot(r, u)))) / Math.PI + 0.5;   // 0 … 1 over the environment
    band[i] = s * stripes;
    const w = Math.floor(band[i]) % 2 === 0 ? 0.96 : 0.06;
    colors[3 * i] = w; colors[3 * i + 1] = w; colors[3 * i + 2] = w;
  }
  return { colors, band };
}

// ───────────────────────── thickness

/** Uniform bucket grid of the triangles (for rays). */
function triangleGrid(V, T) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < V.length; i += 3) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], V[i + c]); hi[c] = Math.max(hi[c], V[i + c]); }
  const ext = hi.map((h, c) => Math.max(h - lo[c], 1e-9));
  const nt = T.length / 3;
  const cell = Math.max(...ext) / Math.max(4, Math.min(64, Math.round(Math.cbrt(nt) * 2)));
  const dims = ext.map((e) => Math.max(1, Math.ceil(e / cell)));
  const cells = new Map();
  const ci = (x, c) => Math.min(dims[c] - 1, Math.max(0, Math.floor((x - lo[c]) / cell)));
  for (let t = 0; t < nt; t++) {
    const ia = 3 * T[3 * t], ib = 3 * T[3 * t + 1], ic = 3 * T[3 * t + 2];
    const r = [0, 1, 2].map((c) => [ci(Math.min(V[ia + c], V[ib + c], V[ic + c]) - 1e-9, c), ci(Math.max(V[ia + c], V[ib + c], V[ic + c]) + 1e-9, c)]);
    for (let k = r[2][0]; k <= r[2][1]; k++) for (let j = r[1][0]; j <= r[1][1]; j++) for (let i = r[0][0]; i <= r[0][1]; i++) {
      const key = i + dims[0] * (j + dims[1] * k);
      const list = cells.get(key); if (list) list.push(t); else cells.set(key, [t]);
    }
  }
  return { lo, cell, dims, cells, size: Math.hypot(...ext) };
}

/** Distance along the ray o + t·d (d unit) to the nearest triangle hit from inside (triangle facing along d), or Infinity. */
function castInside(V, T, G, o, d, stamp, mark, tMin) {
  const { lo, cell, dims, cells } = G;
  let p = [0, 1, 2].map((c) => Math.min(dims[c] - 1, Math.max(0, Math.floor((o[c] - lo[c]) / cell))));
  const step = d.map((x) => (x > 0 ? 1 : x < 0 ? -1 : 0));
  const tMax = [0, 1, 2].map((c) => (d[c] === 0 ? Infinity : ((lo[c] + (p[c] + (d[c] > 0 ? 1 : 0)) * cell) - o[c]) / d[c]));
  const tDelta = d.map((x) => (x === 0 ? Infinity : cell / Math.abs(x)));
  let best = Infinity;
  for (let guard = 0; guard < 4 * (dims[0] + dims[1] + dims[2]) + 8; guard++) {
    const inside = p.every((x, c) => x >= 0 && x < dims[c]);
    if (inside) {
      const list = cells.get(p[0] + dims[0] * (p[1] + dims[1] * p[2]));
      for (const t of list ?? []) {
        if (mark[t] === stamp) continue;
        mark[t] = stamp;
        const a = vtx(V, T[3 * t]), b = vtx(V, T[3 * t + 1]), c = vtx(V, T[3 * t + 2]);
        const e1 = sub(b, a), e2 = sub(c, a), nn = cross(e1, e2);
        if (dot(nn, d) <= 0) continue;                       // a wall seen from outside: not the far side
        const pv = cross(d, e2), det = dot(e1, pv);
        if (Math.abs(det) < 1e-14) continue;
        const tv = sub(o, a), uu = dot(tv, pv) / det;
        if (uu < -1e-7 || uu > 1 + 1e-7) continue;
        const qv = cross(tv, e1), vv = dot(d, qv) / det;
        if (vv < -1e-7 || uu + vv > 1 + 1e-7) continue;
        const tt = dot(e2, qv) / det;
        if (tt > tMin && tt < best) best = tt;
      }
    } else if (p.some((x, c) => (step[c] > 0 && x >= dims[c]) || (step[c] < 0 && x < 0))) break;
    const k = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
    if (best <= tMax[k]) break;                               // nothing nearer in later cells
    if (!Number.isFinite(tMax[k])) break;
    p = p.slice(); p[k] += step[k]; tMax[k] += tDelta[k];
  }
  return best;
}

/**
 * Wall thickness at every vertex: the distance from the vertex, straight in (against its normal), to the
 * opposite wall. Returns { thickness: Float32Array (Infinity when nothing is hit), min, max, thin (vertices
 * under `threshold`), colors }: red under the threshold, then yellow → green → blue as the wall gets thicker.
 */
export function thicknessAnalysis(mesh, { threshold = 1 } = {}) {
  const V = mesh.vertices, T = mesh.triangles, N = vertexNormals(mesh), n = V.length / 3;
  const G = triangleGrid(V, T);
  const mark = new Int32Array(T.length / 3).fill(-1);
  const thickness = new Float32Array(n);
  const tMin = G.size * 1e-6;
  let min = Infinity, max = 0, thin = 0;
  for (let i = 0; i < n; i++) {
    const nn = vtx(N, i);
    const d = [-nn[0], -nn[1], -nn[2]];
    const p = vtx(V, i);
    const o = [p[0] + d[0] * tMin, p[1] + d[1] * tMin, p[2] + d[2] * tMin];
    const t = Math.hypot(...d) > 0 ? castInside(V, T, G, o, d, i, mark, tMin) + tMin : Infinity;
    thickness[i] = t;
    if (Number.isFinite(t)) { min = Math.min(min, t); max = Math.max(max, t); if (t < threshold) thin++; }
  }
  const colors = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) colors.set(thicknessColor(thickness[i], threshold, max), 3 * i);
  return { thickness, min: Number.isFinite(min) ? min : 0, max, thin, colors, threshold };
}

/** Thickness legend: red below the threshold; above it yellow (just over) → green → blue (thickest). */
export function thicknessColor(t, threshold, max) {
  if (!Number.isFinite(t)) return [0.6, 0.6, 0.6];
  if (t < threshold) return [0.9, 0.15, 0.15];
  const s = max > threshold ? Math.min(1, (t - threshold) / (max - threshold)) : 1;
  return s < 0.5 ? [0.95 - 1.5 * s, 0.85, 0.2 + 0.2 * s] : [0.2, 0.85 - 0.9 * (s - 0.5), 0.3 + 1.3 * (s - 0.5)];
}
