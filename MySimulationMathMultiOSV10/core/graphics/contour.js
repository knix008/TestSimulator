// Contour lines and filled contour bands on a rectangular grid. Every grid
// cell is split into four triangles around its centre (centre value = mean
// of the corners), so lines and band edges agree exactly and saddles are
// resolved consistently. Pure ESM.
import { linearTicks } from './ticks.js';

/**
 * Grid accessor. Z is m×n column-major; X / Y are vectors (length n / m) or
 * m×n matrices (column-major). Returns {m, n, x(i,j), y(i,j), z(i,j)}.
 */
export function makeGrid(X, Y, Z, m, n) {
  const xv = X.length === n && X.length !== m * n ? X : null;
  const yv = Y.length === m && Y.length !== m * n ? Y : null;
  return {
    m, n,
    x: xv ? (i, j) => xv[j] : (i, j) => X[i + j * m],
    y: yv ? (i) => yv[i] : (i, j) => Y[i + j * m],
    z: (i, j) => Z[i + j * m],
  };
}

/** Automatic levels: nice values strictly inside the data range (about n of them). */
export function autoLevels(Z, n = null) {
  let lo = Infinity, hi = -Infinity;
  for (const v of Z) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!(hi > lo)) return Number.isFinite(lo) ? [lo] : [];
  if (n != null) {
    const out = [];
    for (let k = 1; k <= n; k++) out.push(lo + ((hi - lo) * k) / (n + 1));
    return out;
  }
  const t = linearTicks(lo, hi, 11);
  return t.filter((v) => v >= lo && v <= hi);
}

// Triangles of cell (i,j): vertices are [x, y, z, id]. Ids: grid node i+j*m,
// centre m*n + i + j*(m-1).
function cellTriangles(g, i, j) {
  const { m, n } = g;
  const node = (a, b) => [g.x(a, b), g.y(a, b), g.z(a, b), a + b * m];
  const p00 = node(i, j), p10 = node(i + 1, j), p11 = node(i + 1, j + 1), p01 = node(i, j + 1);
  const zs = [p00[2], p10[2], p11[2], p01[2]];
  if (zs.some((z) => !Number.isFinite(z))) return null;
  const c = [(p00[0] + p10[0] + p11[0] + p01[0]) / 4, (p00[1] + p10[1] + p11[1] + p01[1]) / 4, (zs[0] + zs[1] + zs[2] + zs[3]) / 4, m * n + i + j * (m - 1)];
  return { tris: [[c, p00, p01], [c, p01, p11], [c, p11, p10], [c, p10, p00]], quad: [p00, p01, p11, p10], zmin: Math.min(...zs), zmax: Math.max(...zs) };
}

const edgeKey = (a, b) => (a[3] < b[3] ? `${a[3]}_${b[3]}` : `${b[3]}_${a[3]}`);
function cross(a, b, L) {
  const t = (L - a[2]) / (b[2] - a[2]);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Contour lines: [{level, points: [x0, y0, x1, y1, ...]}] — one entry per
 * connected polyline (closed loops repeat their first point).
 */
export function contourLines(X, Y, Z, m, n, levels) {
  const g = makeGrid(X, Y, Z, m, n);
  const out = [];
  if (m < 2 || n < 2) return out;
  const cells = [];
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < m - 1; i++) { const c = cellTriangles(g, i, j); if (c) cells.push(c); }
  for (const L of levels) {
    // segments keyed by edge
    const segs = [];
    for (const c of cells) {
      if (L < c.zmin || L > c.zmax) continue;
      for (const t of c.tris) {
        const above = t.map((p) => p[2] >= L);
        const k = (above[0] ? 1 : 0) + (above[1] ? 1 : 0) + (above[2] ? 1 : 0);
        if (k === 0 || k === 3) continue;
        const pts = [];
        for (let e = 0; e < 3; e++) {
          const a = t[e], b = t[(e + 1) % 3];
          if ((a[2] >= L) !== (b[2] >= L)) pts.push({ key: edgeKey(a, b), p: cross(a, b, L) });
        }
        if (pts.length === 2 && pts[0].key !== pts[1].key) segs.push(pts);
      }
    }
    out.push(...joinSegments(segs).map((points) => ({ level: L, points })));
  }
  return out;
}

function joinSegments(segs) {
  const byKey = new Map();
  segs.forEach((s, idx) => {
    for (const end of s) {
      if (!byKey.has(end.key)) byKey.set(end.key, []);
      byKey.get(end.key).push(idx);
    }
  });
  const used = new Uint8Array(segs.length);
  const lines = [];
  const nextFrom = (key, cur) => {
    const list = byKey.get(key) || [];
    for (const k of list) if (!used[k] && k !== cur) return k;
    return -1;
  };
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    used[s0] = 1;
    const chain = [segs[s0][0], segs[s0][1]];
    // extend forward
    for (;;) {
      const tail = chain[chain.length - 1];
      const k = nextFrom(tail.key, -1);
      if (k < 0) break;
      used[k] = 1;
      const s = segs[k];
      chain.push(s[0].key === tail.key ? s[1] : s[0]);
    }
    for (;;) {
      const head = chain[0];
      const k = nextFrom(head.key, -1);
      if (k < 0) break;
      used[k] = 1;
      const s = segs[k];
      chain.unshift(s[0].key === head.key ? s[1] : s[0]);
    }
    const pts = [];
    for (const c of chain) pts.push(c.p[0], c.p[1]);
    lines.push(pts);
  }
  return lines;
}

// Clips polygon (vertices [x,y,z]) to z >= L (keepAbove) or z <= L.
function clipPoly(poly, L, keepAbove) {
  const out = [];
  const inside = (p) => (keepAbove ? p[2] >= L : p[2] <= L);
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length];
    const ia = inside(a), ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) {
      const t = (L - a[2]) / (b[2] - a[2]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, L]);
    }
  }
  return out;
}

/**
 * Filled bands between consecutive levels: [{lo, hi, polys: [[x,y,...], ...]}].
 * The first band starts at -Inf when fillBelow, the last ends at +Inf.
 */
export function contourBands(X, Y, Z, m, n, levels, fillBelow = true) {
  const g = makeGrid(X, Y, Z, m, n);
  const L = levels.slice().sort((a, b) => a - b);
  const edges = fillBelow ? [-Infinity, ...L, Infinity] : [...L, Infinity];
  const bands = [];
  for (let b = 0; b < edges.length - 1; b++) bands.push({ lo: edges[b], hi: edges[b + 1], polys: [] });
  if (m < 2 || n < 2 || !bands.length) return bands;
  const bandOf = (z) => { let k = 0; while (k < bands.length - 1 && z >= bands[k].hi) k++; return k; };
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < m - 1; i++) {
    const c = cellTriangles(g, i, j);
    if (!c) continue;
    if (!fillBelow && c.zmax < L[0]) continue;
    const b0 = bandOf(c.zmin), b1 = bandOf(c.zmax);
    if (b0 === b1 && c.zmax < bands[b0].hi && c.zmin >= bands[b0].lo) {
      if (!fillBelow && c.zmin < L[0]) { /* partially below: fall through */ } else {
        const pts = [];
        for (const p of c.quad) pts.push(p[0], p[1]);
        bands[b0].polys.push(pts);
        continue;
      }
    }
    for (const t of c.tris) {
      for (let k = Math.max(0, b0 - 1); k <= Math.min(bands.length - 1, b1); k++) {
        let poly = t;
        if (Number.isFinite(bands[k].lo)) poly = clipPoly(poly, bands[k].lo, true);
        if (poly.length < 3) continue;
        if (Number.isFinite(bands[k].hi)) poly = clipPoly(poly, bands[k].hi, false);
        if (poly.length < 3) continue;
        const pts = [];
        for (const p of poly) pts.push(p[0], p[1]);
        bands[k].polys.push(pts);
      }
    }
  }
  return bands;
}

/** The contour matrix: [level n x1 x2 ...; n y1 y2 ...] as {dims:[2, k], data}. */
export function contourMatrix(lines) {
  const cols = [];
  for (const l of lines) {
    const np = l.points.length / 2;
    cols.push([l.level, np]);
    for (let k = 0; k < np; k++) cols.push([l.points[2 * k], l.points[2 * k + 1]]);
  }
  const data = new Float64Array(cols.length * 2);
  cols.forEach((c, j) => { data[2 * j] = c[0]; data[2 * j + 1] = c[1]; });
  return { dims: [2, cols.length], data };
}
