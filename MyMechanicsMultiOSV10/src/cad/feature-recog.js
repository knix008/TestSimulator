// Feature recognition of an imported body (FeatureWorks-like): a dumb solid (STEP / IGES / Parasolid / a fitted scan)
// turned into an editable feature tree — for prismatic (2.5D) parts and turned parts.
//
//   holes     cylindrical faces of one axis and radius, concave and full-turn, along X, Y or Z: a cut extrude of a
//             circle over their extent (a blind hole's floor kept);
//   steps     the body with its holes filled is cut along the main axis (the one with the most planar area square
//             to it) at the heights of its planar faces; between two heights the section is the same, so each run of
//             equal sections is a boss extrude of its profile (lines, arcs and circles exactly from the kernel's
//             section) from a reference plane at its start height;
//   revolve   a body all of whose faces turn about the Z axis (planes square to it, cylinders, cones, tori on it):
//             one revolve of its half profile.
// The features are rebuilt (cad/features.js regenerate) and the volume compared: a mismatch means the body is not
// one of these kinds — nothing is returned then (error 'not-recognized').
//   recognizeBody(shape) → { features: [feature specs], report: { kind, axis, steps, holes, volume, rebuilt, error } }
import { rep } from './kernel.js';
import { createFeature, regenerate, STD_PLANES } from './features.js';
import { itemsToSketch } from './cad2d-import.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const T = (v) => [v.x, v.y, v.z];
const AXIS_PLANE = { 0: 'right', 1: 'front', 2: 'top' };

/** The std plane frame for an axis: { name, origin, x, y, n } (n along the axis, maybe its negative). */
function planeFor(axis) {
  const name = AXIS_PLANE[axis], p = STD_PLANES[name];
  const n = p.normal, x = p.xDir, y = cross(n, x);
  return { name, n, x, y };
}

/** The exact section of a shape by the plane n·p = t: sketch items in the plane's (x, y). */
function sectionItems(shape, fr, t) {
  const R = rep(), oc = R.getOC();
  const big = 1e5;
  // A large face in the plane: a rectangle on the std plane moved along its normal.
  const face = R.drawRectangle(big, big).sketchOnPlane(fr.name === 'top' ? 'XY' : fr.name === 'front' ? 'XZ' : 'YZ').face();
  const moved = face.translate(fr.n.map((v) => v * t * (fr.name === 'front' ? 1 : 1)));
  // sketchOnPlane('XZ') faces −Y like the front plane; its translate must follow the plane's own normal.
  const op = new oc.BRepAlgoAPI_Section(shape.wrapped, moved.wrapped, true);
  let edges = [];
  try { edges = R.cast(op.Shape()).edges ?? []; } finally { op.delete(); }
  const uv = (p) => [dot(p, fr.x), dot(p, fr.y)];
  const items = [];
  for (const e of edges) {
    const s = T(e.startPoint), en = T(e.endPoint);
    if (e.geomType === 'LINE') { items.push({ kind: 'line', a: uv(s), b: uv(en) }); continue; }
    if (e.geomType === 'CIRCLE') {
      const m = T(e.pointAt(0.5));
      if (len(sub(s, en)) < 1e-7) {
        const q = T(e.pointAt(0.25));
        // A full circle: its centre from three points.
        const a = uv(s), b = uv(q), c = uv(m);
        const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
        const cx = ((a[0] ** 2 + a[1] ** 2) * (b[1] - c[1]) + (b[0] ** 2 + b[1] ** 2) * (c[1] - a[1]) + (c[0] ** 2 + c[1] ** 2) * (a[1] - b[1])) / d;
        const cy = ((a[0] ** 2 + a[1] ** 2) * (c[0] - b[0]) + (b[0] ** 2 + b[1] ** 2) * (a[0] - c[0]) + (c[0] ** 2 + c[1] ** 2) * (b[0] - a[0])) / d;
        items.push({ kind: 'circle', c: [cx, cy], r: Math.hypot(a[0] - cx, a[1] - cy) });
      } else items.push({ kind: 'arc3', pts: [uv(s), uv(m), uv(en)] });
      continue;
    }
    // Anything else (a B-spline section): its polyline.
    const pts = [0, 0.25, 0.5, 0.75, 1].map((k) => uv(T(e.pointAt(k))));
    for (let i = 1; i < pts.length; i++) items.push({ kind: 'line', a: pts[i - 1], b: pts[i] });
  }
  return items;
}

/** A key of a section (its items, rounded) to tell equal sections apart. */
const sectionKey = (items) => items.map((it) => (it.kind === 'line' ? `L${[...it.a, ...it.b].map((v) => v.toFixed(3)).sort().join(',')}` : it.kind === 'circle' ? `C${it.c.map((v) => v.toFixed(3))},${it.r.toFixed(3)}` : `A${it.pts.flat().map((v) => v.toFixed(3)).sort().join(',')}`)).sort().join('|');

/** Concave full-turn cylinders (holes) grouped by axis line and radius. */
function findHoles(shape) {
  const groups = [];
  for (const f of shape.faces) {
    if (f.geomType !== 'CYLINDRE') continue;
    const circles = f.edges.filter((e) => e.geomType === 'CIRCLE');
    if (!circles.length) continue;
    const pts = [0, 0.25, 0.5].map((k) => T(circles[0].pointAt(k)));
    const ab = sub(pts[1], pts[0]), ac = sub(pts[2], pts[0]), nrm = cross(ab, ac);
    if (len(nrm) < 1e-12) continue;
    const dir = unit(nrm);
    // Centre of the circle through the three points.
    const A = pts[0], B = pts[1], Cp = pts[2];
    const a = sub(B, A), b = sub(Cp, A), axb = cross(a, b);
    const cen = [0, 1, 2].map((k) => A[k] + (cross(axb, a)[k] * dot(b, b) + cross(b, axb)[k] * dot(a, a)) / (2 * dot(axb, axb)));
    const r = len(sub(A, cen));
    // (a curved face's centre is not on it: a point on the surface and the normal there)
    const on = f.pointOnSurface(0.5, 0.5), c = T(on), w = sub(c, cen), radial = sub(w, dir.map((v) => v * dot(w, dir)));
    const concave = dot(T(f.normalAt(on)), radial) < 0;
    const ts = f.edges.flatMap((e) => [T(e.startPoint), T(e.endPoint), T(e.pointAt(0.5))]).map((p) => dot(sub(p, cen), dir));
    const area = rep().measureArea(f);
    let g = groups.find((x) => Math.abs(Math.abs(dot(x.dir, dir)) - 1) < 1e-6 && Math.abs(x.r - r) < 1e-6 && len(sub(sub(cen, x.point), x.dir.map((v) => v * dot(sub(cen, x.point), x.dir)))) < 1e-6);
    if (!g) { g = { point: cen, dir, r, t0: Infinity, t1: -Infinity, area: 0, concave }; groups.push(g); }
    const sgn = dot(g.dir, dir) > 0 ? 1 : -1, base = dot(sub(cen, g.point), g.dir);
    for (const v of ts) { g.t0 = Math.min(g.t0, base + sgn * v); g.t1 = Math.max(g.t1, base + sgn * v); }
    g.area += area; g.concave = g.concave && concave;
  }
  return groups.filter((g) => g.concave && g.area > 0.98 * 2 * Math.PI * g.r * (g.t1 - g.t0));
}

export function recognizeBody(shape) {
  const R = rep();
  const volume = R.measureVolume(shape);
  const report = { kind: null, axis: null, steps: 0, holes: 0, volume, rebuilt: null, error: null };
  // Holes along X, Y or Z, then the body with them filled.
  const holes = findHoles(shape).filter((h) => h.dir.some((v) => Math.abs(Math.abs(v) - 1) < 1e-9));
  let filled = shape;
  for (const h of holes) filled = filled.fuse(R.makeCylinder(h.r, h.t1 - h.t0, h.point.map((v, k) => v + h.dir[k] * h.t0), h.dir));
  try { filled = filled.simplify?.() ?? filled; } catch { /* as is */ }
  // Main axis: the most planar area square to it.
  const areaBy = [0, 0, 0];
  for (const f of filled.faces) if (f.geomType === 'PLANE') { const n = T(f.normalAt(f.center)); const a = R.measureArea(f); for (let k = 0; k < 3; k++) if (Math.abs(Math.abs(n[k]) - 1) < 1e-9) areaBy[k] += a; }
  const axis = areaBy.indexOf(Math.max(...areaBy));
  const fr = planeFor(axis);
  // Heights (along the plane normal) of the planar faces square to it.
  const hs = [...new Set(filled.faces.filter((f) => f.geomType === 'PLANE' && Math.abs(Math.abs(dot(T(f.normalAt(f.center)), fr.n)) - 1) < 1e-9).map((f) => Math.round(dot(T(f.center), fr.n) * 1e6) / 1e6))].sort((a, b) => a - b);
  if (hs.length < 2) { report.error = 'not-recognized'; return { features: [], report }; }
  const runs = [];
  for (let i = 0; i < hs.length - 1; i++) {
    const t0 = hs[i], t1 = hs[i + 1];
    if (t1 - t0 < 1e-6) continue;
    const items = sectionItems(filled, fr, (t0 + t1) / 2);
    if (!items.length) continue;
    const key = sectionKey(items), last = runs.at(-1);
    if (last && last.key === key && Math.abs(last.t1 - t0) < 1e-9) last.t1 = t1; else runs.push({ t0, t1, items, key });
  }
  // The feature tree on a part of its own (rebuilt to check it).
  const part = { id: 'recog', name: 'recog', features: [] };
  let first = true;
  for (const run of runs) {
    const plane = createFeature(part, 'plane', { base: { kind: 'std', name: fr.name }, offset: run.t0 });
    const sk = createFeature(part, 'sketch', { plane: { kind: 'ref', id: plane.id }, ...itemsToSketch(run.items).sketch });
    const ex = createFeature(part, 'extrude', { sketch: sk.id, depth: run.t1 - run.t0, op: first ? 'new' : 'boss' });
    part.features.push(plane, sk, ex); first = false;
  }
  for (const h of holes) {
    // A circle on a plane square to the hole at its start, cut through its length (along the plane normal).
    const k = h.dir.findIndex((v) => Math.abs(Math.abs(v) - 1) < 1e-9), hf = planeFor(k);
    const s0 = dot(h.point.map((v, q) => v + h.dir[q] * h.t0), hf.n), s1 = dot(h.point.map((v, q) => v + h.dir[q] * h.t1), hf.n);
    const lo = Math.min(s0, s1), hi = Math.max(s0, s1);
    const plane = createFeature(part, 'plane', { base: { kind: 'std', name: hf.name }, offset: hi });
    const c = [dot(h.point, hf.x), dot(h.point, hf.y)];
    const sk = createFeature(part, 'sketch', { plane: { kind: 'ref', id: plane.id }, ...itemsToSketch([{ kind: 'circle', c, r: h.r }]).sketch });
    const cut = createFeature(part, 'extrude', { sketch: sk.id, depth: hi - lo, op: 'cut', name: `Hole Ø${(2 * h.r).toFixed(2)}` });
    part.features.push(plane, sk, cut);
  }
  let rebuilt = null;
  try {
    const r = regenerate(part);
    const bad = [...r.results].find(([, x]) => !x.ok);
    if (!bad && r.body) rebuilt = R.measureVolume(r.body);
    // A cut going the wrong way leaves the volume unchanged: try the holes reversed.
    if (rebuilt != null && Math.abs(rebuilt - volume) > 1e-4 * volume && holes.length) {
      for (const f of part.features) if (f.type === 'extrude' && f.op === 'cut') f.reverse = !f.reverse;
      const r2 = regenerate(part);
      if (r2.body) rebuilt = R.measureVolume(r2.body);
    }
  } catch (error) { report.error = error.code ?? 'rebuild-failed'; }
  Object.assign(report, { kind: 'prismatic', axis: 'xyz'[axis], steps: runs.length, holes: holes.length, rebuilt });
  if (rebuilt == null || Math.abs(rebuilt - volume) > 1e-4 * Math.max(1, volume)) { report.error ??= 'not-recognized'; return { features: [], report }; }
  return { features: part.features, report };
}
