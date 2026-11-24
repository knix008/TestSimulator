// The built-in modules of OpenSCAD as geometry, on the Manifold library (the engine OpenSCAD itself uses for
// fast rendering). Primitives are made point for point as OpenSCAD 2021.01 makes them — the same number of
// fragments from $fn / $fa / $fs, the same ring layout of spheres, the same slices and diagonals of
// linear_extrude, the same rings of rotate_extrude, text outlines at OpenSCAD's size and curve steps — so a
// model has the faces OpenSCAD gives it. A node is { d3: Manifold | null, d2: CrossSection | null, color }.
import { isNum, isVec, isStr, isBool, sinDeg, cosDeg, angleAxis, toStr, repr } from './values.js';
import { readImportFile } from './files.js';

const GRID_FINE = 0.00000095367431640625;
const F_MINIMUM = 0.01;

/** OpenSCAD's number of fragments of a circle of radius r. */
export function fragments(r, fn, fs, fa) {
  if (r < GRID_FINE || !Number.isFinite(fn)) return 3;
  if (fn > 0) return Math.max(3, Math.floor(fn));
  return Math.ceil(Math.max(Math.min(360 / fa, (r * 2 * Math.PI) / fs), 5));
}

/** The points of circle(r) with n fragments (counterclockwise from +X). */
export function circlePoints(r, n) {
  const out = [];
  for (let i = 0; i < n; i++) { const phi = (360 * i) / n; out.push([r * cosDeg(phi), r * sinDeg(phi)]); }
  return out;
}

const helixLength = (rSqr, h, twist) => { const T = twist * Math.PI / 180; const c = h / T; return T * Math.sqrt(rSqr + c * c); };
function helixSlices(rSqr, h, twist, fn, fs, fa) {
  twist = Math.abs(twist);
  const min = Math.max(Math.ceil(twist / 120), 1);
  if (Math.sqrt(rSqr) < GRID_FINE || !Number.isFinite(fn)) return min;
  if (fn > 0) return Math.max(Math.ceil((twist / 360) * fn), min);
  return Math.max(Math.min(Math.ceil(twist / fa), Math.ceil(helixLength(rSqr, h, twist) / fs)), min);
}
const archimedes = (a, t) => 0.5 * a * (t * Math.sqrt(1 + t * t) + Math.asinh(t));
function conicalHelixSlices(rSqr, h, twist, scale, fn, fs, fa) {
  twist = Math.abs(twist);
  const r = Math.sqrt(rSqr);
  const min = Math.max(Math.ceil(twist / 120), 1);
  if (r < GRID_FINE || !Number.isFinite(fn)) return min;
  if (fn > 0) return Math.max(Math.ceil((twist * fn) / 360), min);
  const rads = twist * Math.PI / 180;
  const end = scale > 1 ? (rads * scale) / (scale - 1) : rads / (1 - scale);
  const start = end - rads;
  const a = r / end;
  const spiral = archimedes(a, end) - archimedes(a, start);
  const total = Math.sqrt(spiral * spiral + h * h);
  return Math.max(Math.min(Math.ceil(total / fs), Math.ceil(twist / fa)), min);
}
function diagonalSlices(dSqr, h, fn, fs) {
  if (Math.sqrt(dSqr) < GRID_FINE || !Number.isFinite(fn)) return 1;
  if (fn > 0) return Math.max(Math.floor(fn), 1);
  return Math.max(Math.ceil(Math.sqrt(dSqr + h * h) / fs), 1);
}

/** The value as an OpenSCAD number list of length n, or null. */
const vecOf = (v, n) => (isVec(v) && v.length >= n && v.slice(0, n).every(isNum) ? v.slice(0, n) : null);

/** Binds positional and named arguments to `names` (OpenSCAD's parameter order); $ arguments are skipped. */
export function bindArgs(args, names, opt = []) {
  const out = {}; let pos = 0;
  for (const a of args) {
    if (a.name) { if (a.name[0] !== '$') out[a.name] = a.value; continue; }
    if (pos < names.length) { const n = names[pos++]; if (!(n in out)) out[n] = a.value; }
  }
  void opt;
  return out;
}

// 4×4 matrices as rows.
const IDENT = () => [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
const mat4mul = (a, b) => a.map((row) => [0, 1, 2, 3].map((j) => row.reduce((s, x, k) => s + x * b[k][j], 0)));
const colMajor4 = (m) => [m[0][0], m[1][0], m[2][0], m[3][0], m[0][1], m[1][1], m[2][1], m[3][1], m[0][2], m[1][2], m[2][2], m[3][2], m[0][3], m[1][3], m[2][3], m[3][3]];
const colMajor3 = (m) => [m[0][0], m[1][0], 0, m[0][1], m[1][1], 0, m[0][3], m[1][3], 1];

/** Snaps a float32 value back to the shortest decimal that rounds to it (0.1 stays 0.1). */
export function snap32(v) {
  const f = Math.fround(v);
  for (let p = 6; p <= 9; p++) { const s = Number(f.toPrecision(p)); if (Math.fround(s) === f) return s; }
  return f;
}

export function createGeometry(W, { fonts = null, warn = () => {} } = {}) {
  const { Manifold, CrossSection, Mesh } = W;
  const owned = []; let warned = false; void warned;
  const own = (o) => { if (o) owned.push(o); return o; };
  const highlights = []; const backgrounds = [];

  // ── meshes in, Manifold out

  /** Polygon faces (vertex index lists, any orientation consistent) → triangles, welded, outward. */
  function manifoldOf(verts, polys, grid = 0) {
    const index = new Map(); const pos = []; const map = new Array(verts.length);
    const keyOf = grid ? (p) => `${Math.round(p[0] / grid)},${Math.round(p[1] / grid)},${Math.round(p[2] / grid)}` : (p) => `${p[0]},${p[1]},${p[2]}`;
    verts.forEach((p, i) => { const k = keyOf(p); let j = index.get(k); if (j === undefined) { j = pos.length / 3; pos.push(p[0], p[1], p[2]); index.set(k, j); } map[i] = j; });
    const tris = [];
    for (const poly of polys) {
      const ids = poly.map((i) => map[i]).filter((v, k, a) => v !== a[(k + 1) % a.length]);
      if (ids.length < 3) continue;
      if (ids.length === 3) { tris.push(ids); continue; }
      for (const t of triangulateFace(ids, pos)) tris.push(t);
    }
    const clean = orientConsistently(tris.filter(([a, b, c]) => a !== b && b !== c && c !== a));
    if (clean.length < 4) return null;
    let vol = 0;
    for (const [a, b, c] of clean) {
      const ax = pos[3 * a], ay = pos[3 * a + 1], az = pos[3 * a + 2];
      const bx = pos[3 * b], by = pos[3 * b + 1], bz = pos[3 * b + 2];
      const cx = pos[3 * c], cy = pos[3 * c + 1], cz = pos[3 * c + 2];
      vol += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
    }
    const flip = vol < 0;
    const triVerts = new Uint32Array(clean.length * 3);
    clean.forEach(([a, b, c], i) => { triVerts[3 * i] = a; triVerts[3 * i + 1] = flip ? c : b; triVerts[3 * i + 2] = flip ? b : c; });
    if (pos.some((v) => !Number.isFinite(v))) { warn('a mesh has points that are not finite numbers — left out'); return null; }
    const mesh = new Mesh({ numProp: 3, vertProperties: new Float32Array(pos), triVerts });
    mesh.merge();
    let m; let status;
    try { m = own(new Manifold(mesh)); status = m.status(); } catch (error) { status = String(error?.message ?? error); }
    if (status !== 'NoError' && status !== 0) {
      if (!grid) {
        // Nearly equal corners (rounding): welded on a fine grid scaled to the size, as OpenSCAD's polysets are.
        let ext = 0; for (const p of verts) ext = Math.max(ext, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]));
        const again = manifoldOf(verts, polys, Math.max(ext, 1) * 1e-12 * 1024);
        if (again) return again;
      }
      if (grid || !warned) warn(`a mesh is not a closed solid (${status}) — left out`);
      return null;
    }
    return m.isEmpty() ? null : m;
  }
  /** A Manifold call that may throw on bad input (NaN transforms …): null and a warning instead. */
  const safe = (f) => { try { return f(); } catch (error) { warn(`${error?.message ?? error}`); return null; } };

  /** A planar (or nearly) face of more than 3 vertices as triangles: projected on its best plane. */
  function triangulateFace(ids, pos) {
    // Newell normal.
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < ids.length; i++) {
      const a = ids[i], b = ids[(i + 1) % ids.length];
      const ax = pos[3 * a], ay = pos[3 * a + 1], az = pos[3 * a + 2], bx = pos[3 * b], by = pos[3 * b + 1], bz = pos[3 * b + 2];
      nx += (ay - by) * (az + bz); ny += (az - bz) * (ax + bx); nz += (ax - bx) * (ay + by);
    }
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    const [u, v, s] = az >= ax && az >= ay ? [0, 1, Math.sign(nz)] : ax >= ay ? [1, 2, Math.sign(nx)] : [2, 0, Math.sign(ny)];
    const pts = ids.map((i) => [pos[3 * i + u] * (s || 1), pos[3 * i + v]]);
    let tri;
    try { tri = W.triangulate([pts], 1e-9); } catch { tri = null; }
    if (!tri || !tri.length) { const out = []; for (let i = 1; i < ids.length - 1; i++) out.push([ids[0], ids[i], ids[i + 1]]); return out; }
    return tri.map((t) => [ids[t[0]], ids[t[1]], ids[t[2]]]);
  }

  const cross2 = (outlines, rule = 'EvenOdd') => {
    const ok = outlines.filter((o) => o.length >= 3);
    if (!ok.length) return null;
    const cs = own(new CrossSection(ok, rule));
    return cs.isEmpty() ? null : cs;
  };

  const node = (d3, d2, color = null) => (d3 || d2 ? { d3: d3 ?? null, d2: d2 ?? null, color } : null);

  // ── primitives

  function cube({ size, center }) {
    let [x, y, z] = [1, 1, 1];
    if (isNum(size)) x = y = z = size; else if (vecOf(size, 3)) [x, y, z] = size; else if (size !== undefined) warn(`Unable to convert cube(size=${repr(size)}, ...) parameter to a number or a vec3 of numbers`);
    if (!(x > 0 && y > 0 && z > 0) || ![x, y, z].every(Number.isFinite)) return null;
    const [x1, y1, z1] = center === true ? [-x / 2, -y / 2, -z / 2] : [0, 0, 0];
    const [x2, y2, z2] = [x1 + x, y1 + y, z1 + z];
    const v = [[x1, y1, z1], [x2, y1, z1], [x2, y2, z1], [x1, y2, z1], [x1, y1, z2], [x2, y1, z2], [x2, y2, z2], [x1, y2, z2]];
    return node(manifoldOf(v, [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]));
  }

  function sphere(a, sp) {
    const r = radius(a, 'r', 'd', 1);
    if (!(r > 0) || !Number.isFinite(r)) return null;
    const n = fragments(r, sp.fn, sp.fs, sp.fa);
    const rings = Math.floor((n + 1) / 2);
    const verts = [];
    for (let i = 0; i < rings; i++) {
      const phi = (180 * (i + 0.5)) / rings;
      const rr = r * sinDeg(phi); const z = r * cosDeg(phi);
      for (const [x, y] of circlePoints(rr, n)) verts.push([x, y, z]);
    }
    const polys = [];
    polys.push([...Array(n).keys()]);
    for (let i = 0; i < rings - 1; i++) for (let k = 0; k < n; k++) polys.push([i * n + (k + 1) % n, i * n + k, (i + 1) * n + k, (i + 1) * n + (k + 1) % n]);
    polys.push([...Array(n).keys()].map((k) => rings * n - k - 1));
    return node(manifoldOf(verts, polys));
  }

  function cylinder(a, sp) {
    let h = isNum(a.h) ? a.h : 1;
    let r1 = 1, r2 = 1;
    const r = radius(a, 'r', 'd', undefined); const ra = radius(a, 'r1', 'd1', undefined); const rb = radius(a, 'r2', 'd2', undefined);
    if (isNum(r) && (isNum(ra) || isNum(rb))) warn('Cylinder parameters ambiguous');
    if (isNum(r)) r1 = r2 = r;
    if (isNum(ra)) r1 = ra;
    if (isNum(rb)) r2 = rb;
    if (!(h > 0) || r1 < 0 || r2 < 0 || (r1 === 0 && r2 === 0) || ![h, r1, r2].every(Number.isFinite)) return null;
    const z1 = a.center === true ? -h / 2 : 0; const z2 = a.center === true ? h / 2 : h;
    const n = fragments(Math.max(r1, r2), sp.fn, sp.fs, sp.fa);
    const cone = r2 === 0; const inv = r1 === 0;
    const verts = []; const polys = [];
    if (inv) verts.push([0, 0, z1]); else for (const [x, y] of circlePoints(r1, n)) verts.push([x, y, z1]);
    const top0 = verts.length;
    if (cone) verts.push([0, 0, z2]); else for (const [x, y] of circlePoints(r2, n)) verts.push([x, y, z2]);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (cone) polys.push([i, j, top0]);
      else if (inv) polys.push([0, top0 + j, top0 + i]);
      else polys.push([i, j, top0 + j, top0 + i]);
    }
    if (!inv) polys.push([...Array(n).keys()].reverse());
    if (!cone) polys.push([...Array(n).keys()].map((k) => top0 + k));
    return node(manifoldOf(verts, polys));
  }

  function polyhedron(a) {
    const pts = a.points; let faces = a.faces;
    if (faces === undefined && a.triangles !== undefined) { faces = a.triangles; warn('polyhedron(triangles=[]) will be removed in future releases. Use polyhedron(faces=[]) instead.'); }
    if (!isVec(pts) || !isVec(faces)) { warn('Unable to convert points or faces of polyhedron()'); return null; }
    const verts = pts.map((p) => (vecOf(p, 3) ? p.slice(0, 3) : null));
    if (verts.some((p) => !p)) { warn('Unable to convert point of polyhedron() to a vec3 of numbers'); return null; }
    const polys = [];
    for (const f of faces) {
      if (!isVec(f)) continue;
      const ids = f.filter((i) => isNum(i) && i >= 0 && i < verts.length).map((i) => Math.floor(i));
      if (ids.length !== f.length) warn(`Point index out of bounds in polyhedron(): ${repr(f)}`);
      // OpenSCAD faces are clockwise seen from outside: reversed here (the volume check fixes either way).
      if (ids.length >= 3) polys.push(ids.reverse());
    }
    return node(manifoldOf(verts, polys));
  }

  function square({ size, center }) {
    let [x, y] = [1, 1];
    if (isNum(size)) x = y = size; else if (vecOf(size, 2)) [x, y] = size; else if (size !== undefined) warn(`Unable to convert square(size=${repr(size)}, ...) parameter to a number or a vec2 of numbers`);
    if (!(x > 0 && y > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    const [x1, y1] = center === true ? [-x / 2, -y / 2] : [0, 0];
    return node(null, cross2([[[x1, y1], [x1 + x, y1], [x1 + x, y1 + y], [x1, y1 + y]]]));
  }

  function circle(a, sp) {
    const r = radius(a, 'r', 'd', 1);
    if (!(r > 0) || !Number.isFinite(r)) return null;
    return node(null, cross2([circlePoints(r, fragments(r, sp.fn, sp.fs, sp.fa))]));
  }

  function polygon({ points, paths }) {
    if (!isVec(points)) return null;
    const pts = points.map((p) => (vecOf(p, 2) ? p.slice(0, 2) : null));
    if (pts.some((p) => !p)) { warn('Unable to convert points of polygon() to vec2 of numbers'); return null; }
    let outlines;
    if (paths === undefined) outlines = [pts];
    else if (isVec(paths)) outlines = paths.filter(isVec).map((path) => path.filter((i) => isNum(i) && i >= 0 && i < pts.length).map((i) => pts[Math.floor(i)]));
    else { warn('Unable to convert paths of polygon()'); return null; }
    return node(null, cross2(outlines, 'EvenOdd'));
  }

  function radius(a, rName, dName, def) {
    const d = a[dName]; const r = a[rName];
    if (isNum(d)) { if (isNum(r)) warn(`Ignoring radius variable '${rName}' as diameter '${dName}' is defined too.`); return d / 2; }
    if (isNum(r)) return r;
    return def;
  }

  // ── transforms

  function transform(n, M) {
    if (!n) return null;
    const det2 = M[0][0] * M[1][1] - M[0][1] * M[1][0];
    const det3 = M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    let d3 = null; let d2 = null;
    if (M.some((row) => row.some((v) => !Number.isFinite(v)))) { warn('Transformation matrix contains Not-a-Number and/or Infinity - removing object.'); return null; }
    if (n.d3) { if (Math.abs(det3) < 1e-300) warn('Scaling a 3D object with 0 - removing object'); else d3 = own(safe(() => n.d3.transform(colMajor4(M)))); }
    if (n.d2) { if (Math.abs(det2) < 1e-300) warn('Scaling a 2D object with 0 - removing object'); else d2 = own(safe(() => n.d2.transform(colMajor3(M)))); }
    return node(d3, d2, n.color);
  }

  function matrixOf(name, a) {
    const M = IDENT();
    switch (name) {
      case 'translate': { const v = vecOf(a.v, 2) ? [a.v[0], a.v[1], isNum(a.v[2]) ? a.v[2] : 0] : null; if (!v) { if (a.v !== undefined) warn(`Unable to convert translate(${repr(a.v)}) parameter to a vec3 or vec2 of numbers`); return M; } M[0][3] = v[0]; M[1][3] = v[1]; M[2][3] = v[2]; return M; }
      case 'scale': {
        let s = [1, 1, 1];
        if (isNum(a.v)) s = [a.v, a.v, a.v]; else if (vecOf(a.v, 2)) s = [a.v[0], a.v[1], isNum(a.v[2]) ? a.v[2] : 1]; else if (a.v !== undefined) warn(`Unable to convert scale(${repr(a.v)}) parameter to a number, a vec3 or vec2 of numbers or a number`);
        M[0][0] = s[0]; M[1][1] = s[1]; M[2][2] = s[2]; return M;
      }
      case 'rotate': {
        const av = a.a;
        if (isVec(av)) {
          const [x, y, z] = [0, 1, 2].map((i) => (isNum(av[i]) ? av[i] : 0));
          const sx = sinDeg(x), cx = cosDeg(x), sy = sinDeg(y), cy = cosDeg(y), sz = sinDeg(z), cz = cosDeg(z);
          const R = [[cy * cz, cz * sx * sy - cx * sz, cx * cz * sy + sx * sz], [cy * sz, cx * cz + sx * sy * sz, -cz * sx + cx * sy * sz], [-sy, cy * sx, cx * cy]];
          for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i][j] = R[i][j];
          return M;
        }
        if (isNum(av)) {
          const v = vecOf(a.v, 3);
          const R = v && (v[0] || v[1] || v[2]) ? angleAxis(av, v) : [[cosDeg(av), -sinDeg(av), 0], [sinDeg(av), cosDeg(av), 0], [0, 0, 1]];
          for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i][j] = R[i][j];
          return M;
        }
        if (av !== undefined) warn(`Unable to convert rotate(a=${repr(av)}, ...) parameter`);
        return M;
      }
      case 'mirror': {
        const v = vecOf(a.v, 2) ? [a.v[0], a.v[1], isNum(a.v[2]) ? a.v[2] : 0] : [1, 0, 0];
        const l = Math.hypot(...v);
        if (!(l > 0)) return M;
        const n = v.map((x) => x / l);
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i][j] = (i === j ? 1 : 0) - 2 * n[i] * n[j];
        return M;
      }
      case 'multmatrix': {
        const m = a.m;
        if (!isVec(m)) { if (m !== undefined) warn('Unable to convert multmatrix(m) parameter'); return M; }
        for (let i = 0; i < Math.min(4, m.length); i++) { if (!isVec(m[i])) continue; for (let j = 0; j < Math.min(4, m[i].length); j++) if (isNum(m[i][j])) M[i][j] = m[i][j]; }
        return M;
      }
      default: return M;
    }
  }

  // ── colour

  function colorOf(a) {
    let c = a.c; const alpha = isNum(a.alpha) ? a.alpha : 1;
    if (isVec(c)) { const v = c.filter(isNum); if (v.length >= 3) return [v[0], v[1], v[2], v.length >= 4 && a.alpha === undefined ? v[3] : alpha]; warn(`Unable to convert color(${repr(c)})`); return null; }
    if (isStr(c)) {
      const s = c.trim().toLowerCase();
      if (s[0] === '#') {
        const h = s.slice(1);
        const full = h.length === 3 || h.length === 4 ? [...h].map((x) => x + x).join('') : h;
        if (/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(full)) { const v = [0, 2, 4, 6].map((i) => (i < full.length ? parseInt(full.slice(i, i + 2), 16) / 255 : alpha)); return [v[0], v[1], v[2], full.length === 8 ? v[3] : alpha]; }
      }
      if (s === 'transparent') return [0, 0, 0, 0];
      const named = CSS_COLORS[s];
      if (named) return [((named >> 16) & 255) / 255, ((named >> 8) & 255) / 255, (named & 255) / 255, alpha];
      warn(`Unable to parse color "${c}"`);
      return null;
    }
    return null;
  }

  // ── booleans

  function unionOf(nodes) {
    const list = nodes.filter(Boolean);
    if (!list.length) return null;
    if (list.length === 1) return list[0];
    const m3 = list.map((n) => n.d3).filter(Boolean); const m2 = list.map((n) => n.d2).filter(Boolean);
    const d3 = m3.length > 1 ? own(Manifold.union(m3)) : m3[0] ?? null;
    const d2 = m2.length > 1 ? own(CrossSection.union(m2)) : m2[0] ?? null;
    const colors = list.map((n) => n.color).filter(Boolean);
    const color = colors.length && colors.every((c) => c.join() === colors[0].join()) ? colors[0] : null;
    return node(d3 && !d3.isEmpty() ? d3 : null, d2 && !d2.isEmpty() ? d2 : null, color);
  }

  function boolean(op, nodes) {
    const list = nodes.filter(Boolean);
    if (!list.length) return null;
    if (op === 'union') return unionOf(list);
    const first = list[0];
    if (op === 'difference') {
      if (first.d3) {
        const rest = list.slice(1).map((n) => n.d3).filter(Boolean);
        if (list.slice(1).some((n) => n.d2 && !n.d3)) warn('Mixing 2D and 3D objects is not supported');
        const d = rest.length ? own(Manifold.difference([first.d3, ...rest])) : first.d3;
        return node(d.isEmpty() ? null : d, null, first.color);
      }
      const rest = list.slice(1).map((n) => n.d2).filter(Boolean);
      const d = rest.length ? own(CrossSection.difference([first.d2, ...rest])) : first.d2;
      return node(null, d.isEmpty() ? null : d, first.color);
    }
    // intersection: of the same kind as the first.
    if (first.d3) {
      const ms = list.map((n) => n.d3);
      if (ms.some((m) => !m)) return null;
      const d = ms.length > 1 ? own(Manifold.intersection(ms)) : ms[0];
      return node(d.isEmpty() ? null : d, null, first.color);
    }
    const cs = list.map((n) => n.d2);
    if (cs.some((m) => !m)) return null;
    const d = cs.length > 1 ? own(CrossSection.intersection(cs)) : cs[0];
    return node(null, d.isEmpty() ? null : d, first.color);
  }

  function hull(nodes) {
    const list = nodes.filter(Boolean);
    const m3 = list.map((n) => n.d3).filter(Boolean); const m2 = list.map((n) => n.d2).filter(Boolean);
    if (m3.length) { const h = own(Manifold.hull(m3)); return node(h.isEmpty() ? null : h); }
    if (m2.length) { const h = own(CrossSection.hull(m2)); return node(null, h.isEmpty() ? null : h); }
    return null;
  }

  function minkowski(nodes) {
    const list = nodes.filter(Boolean);
    if (!list.length) return null;
    if (list[0].d3) {
      let acc = list[0].d3;
      for (const n of list.slice(1)) if (n.d3) acc = own(acc.minkowskiSum(n.d3));
      return node(acc.isEmpty() ? null : acc, null, list[0].color);
    }
    // 2D: as thin slabs (each 1 thick about z = 0), summed in 3D and cut at z = 0 — exact.
    let acc = own(Manifold.extrude(list[0].d2, 1, 0, 0, [1, 1], true));
    for (const n of list.slice(1)) if (n.d2) acc = own(acc.minkowskiSum(own(Manifold.extrude(n.d2, 1, 0, 0, [1, 1], true))));
    const cs = own(acc.slice(0));
    return node(null, cs.isEmpty() ? null : cs, list[0].color);
  }

  function offset(nodes, a, sp) {
    const n = unionOf(nodes);
    if (!n?.d2) return null;
    let delta = 1; let join = 'Round';
    if (isNum(a.r)) delta = a.r;
    else if (isNum(a.delta)) { delta = a.delta; join = a.chamfer === true ? 'Square' : 'Miter'; }
    const segs = fragments(Math.abs(delta), sp.fn, sp.fs, sp.fa);
    const cs = own(n.d2.offset(delta, join, 1000000, segs));
    return node(null, cs.isEmpty() ? null : cs, n.color);
  }

  // ── extrusions

  /** The outlines of a CrossSection: [{ pts: [[x, y]], positive }]. */
  function outlinesOf(cs) {
    return cs.toPolygons().map((p) => { const pts = p.map((q) => [q[0], q[1]]); let a = 0; for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i]; const [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * y2 - x2 * y1; } return { pts, positive: a > 0 }; });
  }

  function linearExtrude(nodes, a, sp, ctx) {
    let n = unionOf(nodes);
    if (isStr(a.file)) n = importFile({ file: a.file, layer: a.layer, origin: a.origin, scale: 1 }, sp, ctx);
    if (!n?.d2) return null;
    let height = 100;
    if (isNum(a.height)) height = a.height;
    else if (isNum(a.file)) height = a.file;
    if (!(height > 0)) return null;
    let sx = 1, sy = 1;
    if (isNum(a.scale)) sx = sy = a.scale; else if (vecOf(a.scale, 2)) [sx, sy] = a.scale;
    sx = Math.max(0, sx); sy = Math.max(0, sy);
    const twist = isNum(a.twist) ? a.twist : 0;
    const hasSlices = isNum(a.slices);
    const outs = outlinesOf(n.d2);
    const h1 = a.center === true ? -height / 2 : 0; const h2 = a.center === true ? height / 2 : height;
    let slices;
    if (hasSlices) slices = Math.max(Math.floor(a.slices), 1);
    else if (twist !== 0) {
      let r2 = 0; for (const o of outs) for (const [x, y] of o.pts) r2 = Math.max(r2, x * x + y * y);
      slices = (sx === 1 && sy === 1) || sx !== sy ? helixSlices(r2, height, twist, sp.fn, sp.fs, sp.fa) : conicalHelixSlices(r2, height, twist, sx, sp.fn, sp.fs, sp.fa);
    } else if (sx !== sy) {
      let d2 = 0; for (const o of outs) for (const [x, y] of o.pts) d2 = Math.max(d2, (x - x * sx) ** 2 + (y - y * sy) ** 2);
      slices = diagonalSlices(d2, height, sp.fn, sp.fs);
    } else slices = 1;
    const verts = []; const polys = [];
    const V = (x, y, z) => { verts.push([x, y, z]); return verts.length - 1; };
    const tf = (rot, s) => { const c = cosDeg(-rot), si = sinDeg(-rot); return ([x, y]) => [s[0] * (c * x - si * y), s[1] * (si * x + c * y)]; };
    // Caps: the outlines' triangulation, the bottom reversed.
    const tri = W.triangulate(outs.map((o) => o.pts), 1e-12);
    const flat = outs.flatMap((o) => o.pts);
    const bottom = flat.map(([x, y]) => V(x, y, h1));
    for (const t of tri) polys.push([bottom[t[0]], bottom[t[2]], bottom[t[1]]]);
    if (sx > 0 && sy > 0) {
      const T = tf((twist * slices) / slices, [1 - ((1 - sx) * slices) / slices, 1 - ((1 - sy) * slices) / slices]);
      const top = flat.map((p) => { const [x, y] = T(p); return V(x, y, h2); });
      for (const t of tri) polys.push([top[t[0]], top[t[1]], top[t[2]]]);
    }
    for (let j = 0; j < slices; j++) {
      const rot1 = (twist * j) / slices; const rot2 = (twist * (j + 1)) / slices;
      const z1 = h1 + ((h2 - h1) * j) / slices; const z2 = h1 + ((h2 - h1) * (j + 1)) / slices;
      const s1 = [1 - ((1 - sx) * j) / slices, 1 - ((1 - sy) * j) / slices];
      const s2 = [1 - ((1 - sx) * (j + 1)) / slices, 1 - ((1 - sy) * (j + 1)) / slices];
      addSlice(outs, rot1, rot2, z1, z2, s1, s2, tf, V, polys);
    }
    return node(manifoldOf(verts, polys), null, n.color);
  }

  function addSlice(outs, rot1, rot2, h1, h2, s1, s2, tf, V, polys) {
    const T1 = tf(rot1, s1); const T2 = tf(rot2, s2);
    const anyZero = s2[0] === 0 || s2[1] === 0; const anyNonZero = s2[0] !== 0 || s2[1] !== 0;
    const backTwist = rot2 <= rot1;
    for (const o of outs) {
      const vs = o.pts;
      let prev1 = T1(vs[0]); let prev2 = T2(vs[0]);
      const flip = !o.positive !== backTwist;
      for (let i = 1; i <= vs.length; i++) {
        const curr1 = T1(vs[i % vs.length]); const curr2 = T2(vs[i % vs.length]);
        const l1 = Math.hypot(prev1[0] - curr2[0], prev1[1] - curr2[1]); const l2 = Math.hypot(curr1[0] - prev2[0], curr1[1] - prev2[1]);
        const diff = 2 * Math.abs(l1 - l2) * 1e5 > l1 + l2 ? (l1 < l2 ? -1 : 1) : 0;
        const splitFirst = diff === -1 || (diff === 0 && !flip);
        const keepSecond = !anyZero || (anyNonZero && (prev2[0] !== curr2[0] || prev2[1] !== curr2[1]));
        if (splitFirst !== anyZero) {
          polys.push([V(prev1[0], prev1[1], h1), V(curr2[0], curr2[1], h2), V(curr1[0], curr1[1], h1)].reverse());
          if (keepSecond) polys.push([V(curr2[0], curr2[1], h2), V(prev1[0], prev1[1], h1), V(prev2[0], prev2[1], h2)].reverse());
        } else {
          polys.push([V(prev1[0], prev1[1], h1), V(prev2[0], prev2[1], h2), V(curr1[0], curr1[1], h1)].reverse());
          if (keepSecond) polys.push([V(prev2[0], prev2[1], h2), V(curr2[0], curr2[1], h2), V(curr1[0], curr1[1], h1)].reverse());
        }
        prev1 = curr1; prev2 = curr2;
      }
    }
  }

  function rotateExtrude(nodes, a, sp, ctx) {
    let n = unionOf(nodes);
    if (isStr(a.file)) n = importFile({ file: a.file, layer: a.layer, origin: a.origin, scale: a.scale }, sp, ctx);
    if (!n?.d2) return null;
    let angle = 360;
    if (isNum(a.angle) && Number.isFinite(a.angle)) angle = a.angle;
    if (angle > 360) angle = 360; if (angle < -360) angle = -360;
    if (angle === 0) return null;
    const outs = outlinesOf(n.d2);
    let minX = 0, maxX = 0;
    for (const o of outs) for (const [x] of o.pts) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      if (maxX - minX > maxX && maxX - minX > Math.abs(minX)) { warn(`all points for rotate_extrude() must have the same X coordinate sign (range is ${minX.toFixed(2)} -> ${maxX.toFixed(2)})`); return null; }
    }
    const frags = Math.floor(Math.max((fragments(maxX - minX, sp.fn, sp.fs, sp.fa) * Math.abs(angle)) / 360, 1));
    const flipFaces = (minX >= 0 && angle > 0 && angle !== 360) || (minX < 0 && (angle < 0 || angle === 360));
    const verts = []; const polys = [];
    const V = (p) => { verts.push(p); return verts.length - 1; };
    if (angle !== 360) {
      const tri = W.triangulate(outs.map((o) => o.pts), 1e-12);
      const flat = outs.flatMap((o) => o.pts);
      const aEnd = 90 - (frags * angle) / frags;
      const start = flat.map(([x, y]) => V([x * sinDeg(90), x * cosDeg(90), y]));
      const end = flat.map(([x, y]) => V([x * sinDeg(aEnd), x * cosDeg(aEnd), y]));
      for (const t of tri) {
        // Manifold's triangulation turns the other way round from OpenSCAD's tessellation: the cap rule mirrored.
        polys.push(flipFaces ? [start[t[0]], start[t[2]], start[t[1]]] : [start[t[0]], start[t[1]], start[t[2]]]);
        polys.push(flipFaces ? [end[t[0]], end[t[1]], end[t[2]]] : [end[t[0]], end[t[2]], end[t[1]]]);
      }
    }
    const ring = (o, ang) => { const vs = flipFaces ? [...o.pts].reverse() : o.pts; return vs.map(([x, y]) => [x * sinDeg(ang), x * cosDeg(ang), y]); };
    for (const o of outs) {
      const rings = [ring(o, angle === 360 ? -90 : 90), null];
      for (let j = 0; j < frags; j++) {
        const ang = angle === 360 ? -90 + (((j + 1) % frags) * 360) / frags : 90 - ((j + 1) * angle) / frags;
        rings[(j + 1) % 2] = ring(o, ang);
        const A = rings[j % 2]; const B = rings[(j + 1) % 2]; const m = o.pts.length;
        for (let i = 0; i < m; i++) {
          polys.push([V(A[i]), V(B[(i + 1) % m]), V(A[(i + 1) % m])]);
          polys.push([V(A[i]), V(B[i]), V(B[(i + 1) % m])]);
        }
      }
    }
    return node(manifoldOf(verts, polys), null, n.color);
  }

  function projection(nodes, a) {
    const n = unionOf(nodes);
    if (!n?.d3) return null;
    const cs = own(a.cut === true ? n.d3.slice(0) : n.d3.project());
    return node(null, cs.isEmpty() ? null : cs, n.color);
  }

  function resize(nodes, a) {
    const n = unionOf(nodes);
    if (!n) return null;
    const ns = [0, 0, 0];
    if (isNum(a.newsize)) ns.fill(a.newsize); else if (isVec(a.newsize)) a.newsize.slice(0, 3).forEach((v, i) => { ns[i] = isNum(v) ? v : 0; });
    const auto = [false, false, false];
    if (isBool(a.auto)) auto.fill(a.auto); else if (isVec(a.auto)) a.auto.slice(0, 3).forEach((v, i) => { auto[i] = Boolean(v); });
    let size;
    if (n.d3) { const b = n.d3.boundingBox(); size = [0, 1, 2].map((i) => b.max[i] - b.min[i]); }
    else { const b = n.d2.bounds(); size = [b.max[0] - b.min[0], b.max[1] - b.min[1], 0]; ns[2] = 0; }
    let maxdim = 0; for (let i = 1; i < (n.d3 ? 3 : 2); i++) if (ns[i] > ns[maxdim]) maxdim = i;
    const scale = [1, 1, 1];
    for (let i = 0; i < (n.d3 ? 3 : 2); i++) if (ns[i] > 0) scale[i] = ns[i] / size[i];
    const autoscale = scale[maxdim];
    const s = scale.map((v, i) => (!auto[i] || ns[i] > 0 ? v : autoscale));
    const M = IDENT(); M[0][0] = s[0]; M[1][1] = s[1]; M[2][2] = s[2];
    return transform(n, M);
  }

  // ── files and text

  function importFile(a, sp, ctx) {
    const file = isStr(a.file) ? a.file : isStr(a.filename) ? a.filename : null;
    if (!file) { warn('import() needs a file name'); return null; }
    const data = ctx.readFile(file);
    if (data == null) { warn(`Can't open import file '${file}'.`); return null; }
    const got = readImportFile(file, data, { layer: isStr(a.layer) ? a.layer : isStr(a.layername) ? a.layername : null, dpi: isNum(a.dpi) && a.dpi >= 0.001 ? a.dpi : 72, center: a.center === true, fn: sp.fn, fs: sp.fs, fa: sp.fa, origin: vecOf(a.origin, 2) ?? [0, 0], scale: isNum(a.scale) && a.scale > 0 ? a.scale : 1, warn });
    if (!got) return null;
    if (got.mesh) return node(manifoldOf(got.mesh.verts, got.mesh.polys));
    if (got.shapes) {
      const parts = got.shapes.map((sh) => cross2(sh.outlines, sh.rule ?? 'EvenOdd')).filter(Boolean);
      if (!parts.length) return null;
      const u = parts.length > 1 ? own(CrossSection.union(parts)) : parts[0];
      return node(null, u.isEmpty() ? null : u);
    }
    return null;
  }

  function surface(a, ctx) {
    const file = isStr(a.file) ? a.file : null;
    if (!file) { warn('surface() needs a file name'); return null; }
    const data = ctx.readFile(file);
    if (data == null) { warn(`Can't open DAT file '${file}'.`); return null; }
    const got = readImportFile(file, data, { surface: true, invert: a.invert === true, warn });
    if (!got?.grid) return null;
    const { grid, lines, columns } = got;
    let minVal = 0;
    for (const row of grid) for (const v of row) minVal = Math.min(v - 1, minVal);
    const val = (i, j) => grid[i]?.[j] ?? 0;
    const ox = a.center === true ? -(columns - 1) / 2 : 0; const oy = a.center === true ? -(lines - 1) / 2 : 0;
    const verts = []; const polys = [];
    const V = (x, y, z) => { verts.push([x, y, z]); return verts.length - 1; };
    for (let i = 1; i < lines; i++) for (let j = 1; j < columns; j++) {
      const v1 = val(i - 1, j - 1), v2 = val(i - 1, j), v3 = val(i, j - 1), v4 = val(i, j); const vx = (v1 + v2 + v3 + v4) / 4;
      const c = V(ox + j - 0.5, oy + i - 0.5, vx);
      polys.push([V(ox + j - 1, oy + i - 1, v1), V(ox + j, oy + i - 1, v2), c]);
      polys.push([V(ox + j, oy + i - 1, v2), V(ox + j, oy + i, v4), c]);
      polys.push([V(ox + j, oy + i, v4), V(ox + j - 1, oy + i, v3), c]);
      polys.push([V(ox + j - 1, oy + i, v3), V(ox + j - 1, oy + i - 1, v1), c]);
    }
    for (let i = 1; i < lines; i++) {
      polys.push([V(ox, oy + i - 1, minVal), V(ox, oy + i - 1, val(i - 1, 0)), V(ox, oy + i, val(i, 0)), V(ox, oy + i, minVal)]);
      polys.push([V(ox + columns - 1, oy + i, minVal), V(ox + columns - 1, oy + i, val(i, columns - 1)), V(ox + columns - 1, oy + i - 1, val(i - 1, columns - 1)), V(ox + columns - 1, oy + i - 1, minVal)]);
    }
    for (let i = 1; i < columns; i++) {
      polys.push([V(ox + i, oy, minVal), V(ox + i, oy, val(0, i)), V(ox + i - 1, oy, val(0, i - 1)), V(ox + i - 1, oy, minVal)]);
      polys.push([V(ox + i - 1, oy + lines - 1, minVal), V(ox + i - 1, oy + lines - 1, val(lines - 1, i - 1)), V(ox + i, oy + lines - 1, val(lines - 1, i)), V(ox + i, oy + lines - 1, minVal)]);
    }
    if (columns > 1 && lines > 1) {
      const ring = [];
      for (let i = 0; i < columns - 1; i++) ring.push(V(ox + i, oy, minVal));
      for (let i = 0; i < lines - 1; i++) ring.push(V(ox + columns - 1, oy + i, minVal));
      for (let i = columns - 1; i > 0; i--) ring.push(V(ox + i, oy + lines - 1, minVal));
      for (let i = lines - 1; i > 0; i--) ring.push(V(ox, oy + i, minVal));
      polys.push(ring);
    }
    return node(manifoldOf(verts, polys));
  }

  function text(a, sp) {
    const str = a.text === undefined ? '' : isStr(a.text) ? a.text : toStr(a.text);
    if (!str) return null;
    const size = isNum(a.size) ? a.size : 10;
    const spacing = isNum(a.spacing) ? a.spacing : 1;
    const segs = Math.max(Math.floor(fragments(size, sp.fn, sp.fs, sp.fa) / 8) + 1, 2);
    const spec = parseFontName(isStr(a.font) ? a.font : 'Liberation Sans');
    const font = fonts?.(spec.family, spec.style) ?? fonts?.('Liberation Sans', spec.style) ?? fonts?.('Liberation Sans', 'Regular');
    if (!font) { warn(`Can't get font ${isStr(a.font) ? a.font : 'Liberation Sans'}`); return null; }
    const em = font.unitsPerEm;
    // FreeType at OpenSCAD's char size: outline units → size·100/72 per em; advances and boxes (HarfBuzz) are
    // divided by 1.024e5 instead of 1e5, so they are 1000/1024 of that.
    const outK = (size * 100) / 72 / em; const posK = outK * (1e5 / 1.024e5);
    let glyphs = font.stringToGlyphs(str);
    const dir = isStr(a.direction) ? a.direction : 'ltr';
    if (dir === 'rtl') glyphs = glyphs.slice().reverse();
    const vertical = dir === 'ttb' || dir === 'btt';
    if (dir === 'btt') glyphs = glyphs.slice().reverse();
    const placed = []; let width = 0, ascend = 0, descend = 0;
    let pen = 0;
    glyphs.forEach((g, i) => {
      const kern = !vertical && i > 0 ? font.getKerningValue(glyphs[i - 1], g) : 0;
      if (!vertical) pen += kern * posK * spacing;
      const bb = g.getBoundingBox();
      placed.push({ g, pen, xoff: vertical ? -(g.advanceWidth / 2) * posK : 0 });
      if (!vertical) {
        const adv = g.advanceWidth * posK * spacing; width += adv + kern * posK * spacing;
        ascend = Math.max(ascend, Math.max(0, bb.y2 * posK)); descend = Math.max(descend, Math.max(0, -bb.y1 * posK));
        pen += adv;
      } else {
        const adv = (font.ascender - font.descender) * posK * spacing;
        width = Math.max(width, (bb.x2 - bb.x1) * posK);
        ascend += adv; pen += adv;
      }
    });
    const halign = isStr(a.halign) ? a.halign : 'left'; const valign = isStr(a.valign) ? a.valign : 'baseline';
    const xo = halign === 'right' ? -width : halign === 'center' ? -width / 2 : 0;
    const yo = valign === 'top' ? -ascend : valign === 'center' ? descend / 2 - ascend / 2 : valign === 'bottom' ? descend : 0;
    const outlines = [];
    for (const p of placed) {
      const ox = vertical ? xo + p.xoff : xo + p.pen; const oy = vertical ? yo - p.pen - font.ascender * posK : yo;
      let cur = []; let pen2 = [0, 0];
      const add = ([x, y]) => cur.push([x * outK + ox, y * outK + oy]);
      for (const c of p.g.path.commands) {
        if (c.type === 'M') { if (cur.length > 2) outlines.push(cur); cur = []; add([c.x, c.y]); pen2 = [c.x, c.y]; }
        else if (c.type === 'L') { add([c.x, c.y]); pen2 = [c.x, c.y]; }
        else if (c.type === 'Q') { for (let k = 1; k <= segs; k++) { const t = k / segs; const u = 1 - t; add([u * u * pen2[0] + 2 * u * t * c.x1 + t * t * c.x, u * u * pen2[1] + 2 * u * t * c.y1 + t * t * c.y]); } pen2 = [c.x, c.y]; }
        else if (c.type === 'C') { for (let k = 1; k <= segs; k++) { const t = k / segs; const u = 1 - t; add([u ** 3 * pen2[0] + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t ** 3 * c.x, u ** 3 * pen2[1] + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t ** 3 * c.y]); } pen2 = [c.x, c.y]; }
        else if (c.type === 'Z') { if (cur.length > 2) outlines.push(cur); cur = []; }
      }
      if (cur.length > 2) outlines.push(cur);
    }
    // Drop a closing point equal to the start.
    for (const o of outlines) { const f = o[0]; const l = o[o.length - 1]; if (o.length > 3 && Math.abs(f[0] - l[0]) < 1e-12 && Math.abs(f[1] - l[1]) < 1e-12) o.pop(); }
    return node(null, cross2(outlines, 'NonZero'));
  }

  // ── the module table

  const LEAF = new Set(['cube', 'sphere', 'cylinder', 'polyhedron', 'square', 'circle', 'polygon', 'text', 'import', 'surface']);
  const MODULES = {
    cube: { names: ['size', 'center'], run: (a) => cube(a) },
    sphere: { names: ['r'], run: (a, sp) => sphere(a, sp) },
    cylinder: { names: ['h', 'r1', 'r2', 'center'], run: (a, sp) => cylinder(a, sp) },
    polyhedron: { names: ['points', 'faces', 'convexity'], run: (a) => polyhedron(a) },
    square: { names: ['size', 'center'], run: (a) => square(a) },
    circle: { names: ['r'], run: (a, sp) => circle(a, sp) },
    polygon: { names: ['points', 'paths', 'convexity'], run: (a) => polygon(a) },
    text: { names: ['text', 'size', 'font'], run: (a, sp) => text(a, sp) },
    import: { names: ['file', 'layer', 'convexity', 'origin', 'scale'], run: (a, sp, kids, ctx) => importFile(a, sp, ctx) },
    surface: { names: ['file', 'center', 'convexity'], run: (a, sp, kids, ctx) => surface(a, ctx) },
    translate: { names: ['v'], run: (a, sp, kids) => transform(unionOf(kids()), matrixOf('translate', a)) },
    rotate: { names: ['a', 'v'], run: (a, sp, kids) => transform(unionOf(kids()), matrixOf('rotate', a)) },
    scale: { names: ['v'], run: (a, sp, kids) => transform(unionOf(kids()), matrixOf('scale', a)) },
    mirror: { names: ['v'], run: (a, sp, kids) => transform(unionOf(kids()), matrixOf('mirror', a)) },
    multmatrix: { names: ['m'], run: (a, sp, kids) => transform(unionOf(kids()), matrixOf('multmatrix', a)) },
    resize: { names: ['newsize', 'auto', 'convexity'], run: (a, sp, kids) => resize(kids(), a) },
    color: { names: ['c', 'alpha'], run: (a, sp, kids) => { const n = unionOf(kids()); if (!n) return null; const c = colorOf(a); return c ? { ...n, color: c } : n; } },
    offset: { names: ['r'], run: (a, sp, kids) => offset(kids(), a, sp) },
    hull: { names: [], run: (a, sp, kids) => hull(kids()) },
    minkowski: { names: ['convexity'], run: (a, sp, kids) => minkowski(kids()) },
    union: { names: [], run: (a, sp, kids) => unionOf(kids()) },
    difference: { names: [], run: (a, sp, kids) => boolean('difference', kids()) },
    intersection: { names: [], run: (a, sp, kids) => boolean('intersection', kids()) },
    render: { names: ['convexity'], run: (a, sp, kids) => unionOf(kids()) },
    group: { names: [], run: (a, sp, kids) => unionOf(kids()) },
    linear_extrude: { names: ['file', 'layer', 'height', 'origin', 'scale', 'center', 'twist', 'slices'], run: (a, sp, kids, ctx) => linearExtrude(kids(), a, sp, ctx) },
    rotate_extrude: { names: ['file', 'layer', 'origin', 'scale'], run: (a, sp, kids, ctx) => rotateExtrude(kids(), a, sp, ctx) },
    projection: { names: ['cut'], run: (a, sp, kids) => projection(kids(), a) },
  };

  return {
    has: (name) => Object.prototype.hasOwnProperty.call(MODULES, name),
    module(name, args, ctx) {
      const spec = MODULES[name];
      const a = bindArgs(args, spec.names);
      let fs = Number(ctx.special('$fs')); let fa = Number(ctx.special('$fa'));
      if (!(fs >= F_MINIMUM)) { if (Number.isFinite(fs)) ctx.warn(`$fs too small - clamping to ${F_MINIMUM}`); fs = F_MINIMUM; }
      if (!(fa >= F_MINIMUM)) { if (Number.isFinite(fa)) ctx.warn(`$fa too small - clamping to ${F_MINIMUM}`); fa = F_MINIMUM; }
      const fnv = ctx.special('$fn');
      const sp = { fn: isNum(fnv) ? fnv : 0, fs, fa };
      const prevWarn = warn; warn = ctx.warn;
      try {
        if (LEAF.has(name) && ctx.children().length) ctx.warn(`module ${name}() does not support child modules`);
        return spec.run(a, sp, ctx.children, ctx);
      } finally { warn = prevWarn; }
    },
    group: (nodes) => unionOf(nodes),
    boolean,
    highlight: (n) => highlights.push(n),
    background: (n) => backgrounds.push(n),
    highlights, backgrounds,
    /** The final shape: { dim: 3, verts, tris, color } or { dim: 2, outlines, color } (float32 values snapped). */
    finish(n) {
      if (!n) return null;
      if (n.d3) {
        const mesh = n.d3.getMesh();
        const np = mesh.numProp; const vp = mesh.vertProperties;
        const verts = []; for (let i = 0; i < vp.length; i += np) verts.push([snap32(vp[i]), snap32(vp[i + 1]), snap32(vp[i + 2])]);
        const tv = mesh.triVerts; const tris = []; for (let i = 0; i < tv.length; i += 3) tris.push([tv[i], tv[i + 1], tv[i + 2]]);
        return { dim: 3, verts, tris, color: n.color, volume: n.d3.volume(), mixed2d: Boolean(n.d2) };
      }
      return { dim: 2, outlines: n.d2.toPolygons().map((p) => p.map((q) => [snap32(q[0]), snap32(q[1])])), color: n.color, area: n.d2.area() };
    },
    dispose() { for (const o of owned) { try { o.delete(); } catch { /* already gone */ } } owned.length = 0; },
  };
}

/**
 * Triangles turned so that every edge shared by two of them runs in opposite directions (a closed mesh with
 * faces listed either way round, as OpenSCAD's own polysets and many hand-written polyhedra are).
 */
export function orientConsistently(tris) {
  const out = tris.map((t) => t.slice());
  const byEdge = new Map();
  const key = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  out.forEach((t, i) => { for (let k = 0; k < 3; k++) { const e = key(t[k], t[(k + 1) % 3]); if (!byEdge.has(e)) byEdge.set(e, []); byEdge.get(e).push(i); } });
  const done = new Uint8Array(out.length);
  const runs = (t, a, b) => (t[0] === a && t[1] === b) || (t[1] === a && t[2] === b) || (t[2] === a && t[0] === b);
  for (let s = 0; s < out.length; s++) {
    if (done[s]) continue;
    done[s] = 1; const queue = [s];
    while (queue.length) {
      const i = queue.pop(); const t = out[i];
      for (let k = 0; k < 3; k++) {
        const a = t[k], b = t[(k + 1) % 3];
        const near = byEdge.get(key(a, b));
        if (!near || near.length !== 2) continue;
        const j = near[0] === i ? near[1] : near[0];
        if (done[j]) continue;
        // The neighbour must run b → a; if it runs a → b it is turned over.
        if (runs(out[j], a, b)) out[j] = [out[j][0], out[j][2], out[j][1]];
        done[j] = 1; queue.push(j);
      }
    }
  }
  return out;
}

/** "Liberation Sans:style=Bold Italic" → { family, style }. */
export function parseFontName(name) {
  const [family, ...rest] = String(name).split(':');
  let style = 'Regular';
  for (const r of rest) { const m = /^style=(.*)$/i.exec(r.trim()); if (m) style = m[1].trim(); }
  return { family: family.trim() || 'Liberation Sans', style };
}

/** CSS / SVG colour names (OpenSCAD's list). */
const CSS_COLORS = {
  aliceblue: 0xf0f8ff, antiquewhite: 0xfaebd7, aqua: 0x00ffff, aquamarine: 0x7fffd4, azure: 0xf0ffff, beige: 0xf5f5dc, bisque: 0xffe4c4, black: 0x000000, blanchedalmond: 0xffebcd, blue: 0x0000ff, blueviolet: 0x8a2be2, brown: 0xa52a2a, burlywood: 0xdeb887, cadetblue: 0x5f9ea0, chartreuse: 0x7fff00, chocolate: 0xd2691e, coral: 0xff7f50, cornflowerblue: 0x6495ed, cornsilk: 0xfff8dc, crimson: 0xdc143c, cyan: 0x00ffff, darkblue: 0x00008b, darkcyan: 0x008b8b, darkgoldenrod: 0xb8860b, darkgray: 0xa9a9a9, darkgreen: 0x006400, darkgrey: 0xa9a9a9, darkkhaki: 0xbdb76b, darkmagenta: 0x8b008b, darkolivegreen: 0x556b2f, darkorange: 0xff8c00, darkorchid: 0x9932cc, darkred: 0x8b0000, darksalmon: 0xe9967a, darkseagreen: 0x8fbc8f, darkslateblue: 0x483d8b, darkslategray: 0x2f4f4f, darkslategrey: 0x2f4f4f, darkturquoise: 0x00ced1, darkviolet: 0x9400d3, deeppink: 0xff1493, deepskyblue: 0x00bfff, dimgray: 0x696969, dimgrey: 0x696969, dodgerblue: 0x1e90ff, firebrick: 0xb22222, floralwhite: 0xfffaf0, forestgreen: 0x228b22, fuchsia: 0xff00ff, gainsboro: 0xdcdcdc, ghostwhite: 0xf8f8ff, gold: 0xffd700, goldenrod: 0xdaa520, gray: 0x808080, green: 0x008000, greenyellow: 0xadff2f, grey: 0x808080, honeydew: 0xf0fff0, hotpink: 0xff69b4, indianred: 0xcd5c5c, indigo: 0x4b0082, ivory: 0xfffff0, khaki: 0xf0e68c, lavender: 0xe6e6fa, lavenderblush: 0xfff0f5, lawngreen: 0x7cfc00, lemonchiffon: 0xfffacd, lightblue: 0xadd8e6, lightcoral: 0xf08080, lightcyan: 0xe0ffff, lightgoldenrodyellow: 0xfafad2, lightgray: 0xd3d3d3, lightgreen: 0x90ee90, lightgrey: 0xd3d3d3, lightpink: 0xffb6c1, lightsalmon: 0xffa07a, lightseagreen: 0x20b2aa, lightskyblue: 0x87cefa, lightslategray: 0x778899, lightslategrey: 0x778899, lightsteelblue: 0xb0c4de, lightyellow: 0xffffe0, lime: 0x00ff00, limegreen: 0x32cd32, linen: 0xfaf0e6, magenta: 0xff00ff, maroon: 0x800000, mediumaquamarine: 0x66cdaa, mediumblue: 0x0000cd, mediumorchid: 0xba55d3, mediumpurple: 0x9370db, mediumseagreen: 0x3cb371, mediumslateblue: 0x7b68ee, mediumspringgreen: 0x00fa9a, mediumturquoise: 0x48d1cc, mediumvioletred: 0xc71585, midnightblue: 0x191970, mintcream: 0xf5fffa, mistyrose: 0xffe4e1, moccasin: 0xffe4b5, navajowhite: 0xffdead, navy: 0x000080, oldlace: 0xfdf5e6, olive: 0x808000, olivedrab: 0x6b8e23, orange: 0xffa500, orangered: 0xff4500, orchid: 0xda70d6, palegoldenrod: 0xeee8aa, palegreen: 0x98fb98, paleturquoise: 0xafeeee, palevioletred: 0xdb7093, papayawhip: 0xffefd5, peachpuff: 0xffdab9, peru: 0xcd853f, pink: 0xffc0cb, plum: 0xdda0dd, powderblue: 0xb0e0e6, purple: 0x800080, rebeccapurple: 0x663399, red: 0xff0000, rosybrown: 0xbc8f8f, royalblue: 0x4169e1, saddlebrown: 0x8b4513, salmon: 0xfa8072, sandybrown: 0xf4a460, seagreen: 0x2e8b57, seashell: 0xfff5ee, sienna: 0xa0522d, silver: 0xc0c0c0, skyblue: 0x87ceeb, slateblue: 0x6a5acd, slategray: 0x708090, slategrey: 0x708090, snow: 0xfffafa, springgreen: 0x00ff7f, steelblue: 0x4682b4, tan: 0xd2b48c, teal: 0x008080, thistle: 0xd8bfd8, tomato: 0xff6347, turquoise: 0x40e0d0, violet: 0xee82ee, wheat: 0xf5deb3, white: 0xffffff, whitesmoke: 0xf5f5f5, yellow: 0xffff00, yellowgreen: 0x9acd32,
};
