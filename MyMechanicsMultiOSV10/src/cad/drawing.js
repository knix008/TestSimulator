// 2D drawings (drawing documents): a sheet with standard views (front, top, right …,
// isometric) of a part or an assembly, made by the kernel's hidden-line removal, with overall
// dimensions, view labels and a title block. Rendered as SVG (screen, print, SVG export) and as DXF.
//
// Besides the standard views a sheet can hold section views (cut by a plane, cut faces hatched), detail
// views (a circle of another view at a larger scale) and auxiliary views (along any direction), and
// annotations (notes, balloons, GD&T feature control frames, datum symbols, surface finish marks, centre
// marks, manual dimensions) and a bill of materials. Annotations, the BOM and the marks are built once as
// plain primitives (polylines, circles, filled polygons, texts in sheet mm, y down) and written both as SVG
// and as DXF from them.
import { rep } from './kernel.js';
import { materialName } from './materials.js';
import { frameTable, worldUp, worldFront } from './frame.js';
import { textWidth as measureText } from './text-metrics.js';

export const SHEETS = {
  A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594], A0: [1189, 841], Letter: [279.4, 215.9], Tabloid: [431.8, 279.4],
  // ANSI / ASME Y14.1 C, D and E (A and B are Letter and Tabloid).
  'ANSI C': [558.8, 431.8], 'ANSI D': [863.6, 558.8], 'ANSI E': [1117.6, 863.6],
};
export const STANDARD_SCALES = [10, 5, 4, 2, 1, 1 / 2, 1 / 2.5, 1 / 4, 1 / 5, 1 / 10, 1 / 20, 1 / 50, 1 / 100];
export const VIEW_TYPES = ['front', 'top', 'right', 'left', 'back', 'bottom', 'iso', 'dimetric'];
/** View kinds: a plain (standard / projected) view has no `kind`; `type: 'custom'` is an auxiliary view. */
export const VIEW_KINDS = ['section', 'detail'];

/**
 * Camera for each view (Z up): dir points from the model toward the viewer; up = dir × xAxis. The front view
 * looks along +Y (from −Y), the top view down −Z (sheet up = +Y), the right view along −X; up is +Z on the sides.
 */
export const VIEW_CAMERAS = frameTable({
  front: { dir: [0, -1, 0], x: [1, 0, 0] },
  back: { dir: [0, 1, 0], x: [-1, 0, 0] },
  top: { dir: [0, 0, 1], x: [1, 0, 0] },
  bottom: { dir: [0, 0, -1], x: [1, 0, 0] },
  right: { dir: [1, 0, 0], x: [0, 1, 0] },
  left: { dir: [-1, 0, 0], x: [0, -1, 0] },
  iso: { dir: [1, -1, 1], x: [1, 1, 0] },
  dimetric: { dir: [1, -1.6, 0.6], x: [1.6, 1, 0] },
}, ['dir', 'x']);

export const scaleLabel = (s) => (s >= 1 ? `${round(s)}:1` : `1:${round(1 / s)}`);
const round = (v) => Math.round(v * 100) / 100;

/** A new drawing of a part or assembly with the usual three views and an isometric one. */
/**
 * The coordinates smart dimensions are kept in (drawing.dimCoords): 2 = every view's true model 2D (a broken view's
 * far side where it really is). Drawings saved before that (no dimCoords) kept the picked points of a broken view
 * in its shortened coordinates: migrateDrawingDims() marks those for resolveLegacyDims() (drawing-dims.js).
 */
export const DIM_COORDS = 2;

/**
 * Opening a drawing saved before DIM_COORDS: the smart dimensions picked in views that have a break are marked
 * `legacyBroken` (their points are in the shortened view) and the drawing gets dimCoords = DIM_COORDS, so this
 * runs once. Model items (computed from the sketches) and pictorial dimensions (from the 3D model) were in true
 * coordinates already. The conversion needs the views' projections (the break's gap depends on the view's size):
 * resolveLegacyDims() does it when the sheet is first drawn. Returns how many were marked.
 */
export function migrateDrawingDims(d) {
  if (!d || typeof d !== 'object' || Number(d.dimCoords) >= DIM_COORDS) return 0;
  const broken = new Set((d.views ?? []).filter((v) => v?.break).map((v) => v.id));
  let n = 0;
  for (const a of Array.isArray(d.annotations) ? d.annotations : []) {
    if (a?.kind === 'drwDim' && !a.model && !a.m3 && broken.has(a.view)) { a.legacyBroken = true; n++; }
  }
  d.dimCoords = DIM_COORDS;
  return n;
}

export function createDrawing({ id, name, source, sheet = 'A3', projection = 'third', title = {} }) {
  return {
    id, name, source, sheet, projection, scale: 1, autoScale: true, showHidden: true, showDims: true, dimCoords: DIM_COORDS,
    views: [
      { id: 'v-front', type: 'front' }, { id: 'v-top', type: 'top' }, { id: 'v-right', type: 'right' }, { id: 'v-iso', type: 'iso', hidden: false },
    ],
    title: { company: '', drawnBy: '', checkedBy: '', date: new Date().toISOString().slice(0, 10), partNo: '', revision: 'A', ...title },
    notes: [],
    annotations: [],
    bom: { show: false },
  };
}

// ───────────────────────── vectors

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
const unit3 = (a) => { const l = len3(a); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : null; };
const vec3 = (a) => (Array.isArray(a) && a.length >= 3 && a.slice(0, 3).every(Number.isFinite) ? a.slice(0, 3).map(Number) : null);

/** The default x axis for a camera looking along `dir` (toward the viewer): keeps the world Z up when it can. */
function autoXAxis(dir) {
  const U = worldUp(); const k = dot3(dir, U);
  // Looking straight down (or up): the sheet's up is +Y (−Y from below), as in the top view.
  const up = Math.abs(k) > 0.999 ? worldFront().map((v) => -Math.sign(k) * v) : U;
  return unit3(cross3(up, dir));
}

/**
 * The camera basis of a view — `dir` (model → viewer), `x` (sheet right), `y` (sheet up = dir × x), all unit —
 * or null for a detail view (it has no camera of its own). Projected 2D coordinates are (p·x, p·y), y up;
 * the SVG paths of a projection are (p·x, −p·y).
 */
export function viewBasis(view) {
  if (!view || view.kind === 'detail') return null;
  let dir; let x = null;
  if (view.kind === 'section') {
    dir = unit3(vec3(view.plane?.normal) ?? worldFront()) ?? worldFront();
    const std = VIEW_CAMERAS[view.type];
    if (std && dot3(unit3(std.dir), dir) > 0.999) x = std.x;
  } else if (view.type === 'custom') {
    dir = unit3(vec3(view.dir) ?? worldFront()) ?? worldFront();
    x = vec3(view.x) ?? null;
    if (!x && vec3(view.up)) x = cross3(vec3(view.up), dir);
  } else {
    const std = VIEW_CAMERAS[view.type] ?? VIEW_CAMERAS.front;
    dir = unit3(std.dir); x = std.x;
  }
  if (x) { const k = dot3(x, dir); x = unit3([x[0] - dir[0] * k, x[1] - dir[1] * k, x[2] - dir[2] * k]); }
  x ??= autoXAxis(dir);
  return { dir, x, y: cross3(dir, x) };
}

// ───────────────────────── projection

/**
 * The outline of a shape the hidden-line projection cannot draw (a bare sphere: a face without real edges): the
 * circles of its spherical faces, of their radius round their projected centres. null when it has none.
 */
function sphereOutlines(shape, dir, x) {
  const R = rep(); const oc = R.getOC();
  const y = cross3(dir, x);
  const visible = []; let box = null;
  for (const face of shape?.faces ?? []) {
    if (face.geomType !== 'SPHERE') continue;
    let ad = null;
    try {
      ad = new oc.BRepAdaptor_Surface(face.wrapped, true);
      const sp = ad.Sphere(); const l = sp.Location(); const c = [l.X(), l.Y(), l.Z()]; const r = sp.Radius();
      const X = dot3(c, x); const Y = dot3(c, y);
      visible.push(`M ${n2(X - r)} ${n2(-Y)} A ${n2(r)} ${n2(r)} 0 1 0 ${n2(X + r)} ${n2(-Y)} A ${n2(r)} ${n2(r)} 0 1 0 ${n2(X - r)} ${n2(-Y)} Z`);
      const b = { x0: X - r, y0: Y - r, x1: X + r, y1: Y + r };
      box = box ? { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) } : b;
    } catch { /* not a sphere after all */ } finally { ad?.delete?.(); }
  }
  return visible.length ? { visible, hidden: [], box, outline: true } : null;
}

function projectWith(shape, dir, x) {
  const R = rep();
  const camera = new R.ProjectionCamera([0, 0, 0], dir, x);
  let drawn;
  try { drawn = R.drawProjection(shape, camera); } catch (error) { const o = sphereOutlines(shape, dir, x); if (o) return o; throw error; }
  const { visible, hidden } = drawn;
  const paths = (d) => { try { return [d.toSVGPaths()].flat(3).filter(Boolean); } catch { return []; } };
  let box = null;
  try {
    const [[x0, y0], [x1, y1]] = visible.boundingBox.bounds;
    box = { x0, y0, x1, y1 };
  } catch { box = { x0: -1, y0: -1, x1: 1, y1: 1 }; }
  return { visible: paths(visible), hidden: paths(hidden), box };
}

/**
 * Projects a shape for one view: { visible: [path], hidden: [path], box: { x0, y0, x1, y1 } } (model units, y up;
 * the paths are y down). `view` (optional) is the view object: a section view (`kind: 'section'`) cuts the shape
 * first and adds `section: { triangles }` (the cut faces, SVG path coordinates, for the hatching); an auxiliary
 * view (`type: 'custom'`) looks along `view.dir`. A detail view (`kind: 'detail'`) has nothing of its own to
 * project — the drawing reuses its parent's projection — so it gets an empty one.
 */
export function projectView(shape, type, view = null) {
  if (view?.kind === 'section' && view.aligned) {
    const folded = alignedShape(shape, view);
    return { ...projectSection(folded, view), aligned: true };
  }
  if (view?.kind === 'section') return projectSection(shape, view);
  if (view?.kind === 'detail') return { visible: [], hidden: [], box: { x0: -1, y0: -1, x1: 1, y1: 1 }, detail: true };
  if ((type === 'custom' || view?.type === 'custom') && view) {
    const b = viewBasis({ ...view, type: 'custom' });
    return { ...projectWith(shape, b.dir, b.x), basis: b };
  }
  const cam = VIEW_CAMERAS[type] ?? VIEW_CAMERAS.front;
  return projectWith(shape, cam.dir, cam.x);
}

/**
 * The two legs of an aligned section's cutting line: from the pivot (the section plane's point) along `u1` in
 * the section plane, and along `u2` — the opposite direction turned by `aligned.angle` degrees about the parent
 * view's line of sight `aligned.axis`. { pivot, axis, u1, u2, n1, n2 } (n: the planes' normals toward the viewer).
 */
export function alignedLegs(view) {
  const pivot = vec3(view.plane?.point) ?? [0, 0, 0];
  const n1 = unit3(vec3(view.plane?.normal) ?? [1, 0, 0]) ?? [1, 0, 0];
  const axis = unit3(vec3(view.aligned?.axis) ?? [0, -1, 0]) ?? [0, -1, 0];
  const u1 = unit3(vec3(view.aligned?.along) ?? cross3(n1, axis)) ?? cross3(n1, axis);
  const th = ((Number(view.aligned?.angle) || 0) * Math.PI) / 180;
  const rot = (v) => { const c = Math.cos(th); const sn = Math.sin(th); const k = axis; const kv = cross3(k, v); const kd = dot3(k, v); return [0, 1, 2].map((i) => v[i] * c + kv[i] * sn + k[i] * kd * (1 - c)); };
  return { pivot, axis, u1, u2: rot(u1.map((x) => -x)), n1, n2: rot(n1), angle: (th * 180) / Math.PI };
}

/**
 * An aligned section's model: the material on the second leg's side (past the bisector of the two legs) turned
 * by −angle about the axis through the pivot, so its cut lies in the first leg's plane; the first leg's side as
 * it is. The section is then taken in that one plane.
 */
export function alignedShape(shape, view) {
  const R = rep();
  const L = alignedLegs(view);
  if (Math.abs(L.angle) < 1e-9) return shape;
  const w = unit3([L.u1[0] + L.u2[0], L.u1[1] + L.u2[1], L.u1[2] + L.u2[2]]) ?? cross3(L.axis, L.u1);
  let m = cross3(L.axis, w);
  if (dot3(m, L.u1) < 0) m = m.map((x) => -x);
  const [lo, hi] = shape.boundingBox.bounds;
  const big = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) * 4 + 10;
  // A half space as a big box on one side of the plane through the pivot with normal `n`.
  const half = (n) => {
    const a = unit3(cross3(n, Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
    const b = cross3(n, a);
    const corner = (i, j) => [0, 1, 2].map((k) => L.pivot[k] + a[k] * big * i + b[k] * big * j);
    const face = R.makePolygon([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)]);
    return R.basicFaceExtrusion(face, new R.Vector(n.map((x) => x * big)));
  };
  const side1 = shape.clone().intersect(half(m));
  const side2 = shape.clone().intersect(half(m.map((x) => -x)));
  const turned = side2.rotate(-L.angle, L.pivot, L.axis);
  return R.makeCompound([side1, turned]);
}

/** A string that changes whenever the projection of the view would (for caching projections). */
export function projectionKey(view) {
  if (!view) return 'none';
  if (view.kind === 'section') return `section|${view.type}|${JSON.stringify(view.plane ?? null)}${view.aligned ? `|aligned|${JSON.stringify(view.aligned)}` : ''}`;
  if (view.kind === 'detail') return `detail|${view.parent}`;
  if (view.type === 'custom') return `custom|${JSON.stringify([view.dir ?? null, view.x ?? null, view.up ?? null])}`;
  return String(view.type);
}

/** Projections of every view of the drawing (view id → projectView()); `cache` (optional Map) keyed by projectionKey. */
export function projectDrawing(shape, drawing, cache = null) {
  const out = new Map();
  for (const v of drawing.views ?? []) {
    if (v.kind === 'detail') continue;
    const k = projectionKey(v);
    let p = cache?.get(k);
    if (!p) { p = projectView(shape, v.type, v); cache?.set(k, p); }
    out.set(v.id, p);
  }
  return out;
}

/**
 * The shape cut by a plane `{ point, normal }`: the part on the side the normal points away from is kept (the
 * normal points toward the viewer of the section view, i.e. the material between the plane and the viewer is
 * removed — the arrows of the cutting line point along −normal, the viewing direction).
 * Returns null when nothing is left. The input shape is not changed.
 */
export function sectionShape(shape, plane) {
  const R = rep();
  const n = unit3(vec3(plane?.normal) ?? worldFront()) ?? worldFront();
  const p = vec3(plane?.point) ?? [0, 0, 0];
  const pl = new R.Plane(p, autoXAxis(n), n);
  try {
    const { negative, positive, on } = shape.split(pl);
    for (const s of [positive, on]) try { s?.delete(); } catch { /* already gone */ }
    return negative ?? null;
  } catch {
    // Older kernels: subtract a box covering the half space in front of the plane.
    const [[x0, y0, z0], [x1, y1, z1]] = shape.boundingBox.bounds;
    const L = 4 * (Math.hypot(x1 - x0, y1 - y0, z1 - z0) + len3(p) + 1);
    const half = R.drawRectangle(L, L).sketchOnPlane(pl).extrude(L);
    try { return shape.cut(half); } catch { return null; }
  }
}

function projectSection(shape, view) {
  const b = viewBasis(view);
  const kept = sectionShape(shape, view.plane);
  if (!kept) return { visible: [], hidden: [], box: { x0: -1, y0: -1, x1: 1, y1: 1 }, section: { triangles: [] }, basis: b };
  const out = projectWith(kept, b.dir, b.x);
  // The cut faces: planar faces of the kept part lying in the plane, facing the viewer.
  const p0 = vec3(view.plane?.point) ?? [0, 0, 0];
  const [[bx0, by0, bz0], [bx1, by1, bz1]] = kept.boundingBox.bounds;
  const size = Math.hypot(bx1 - bx0, by1 - by0, bz1 - bz0) || 1;
  const triangles = [];
  for (const f of kept.faces) {
    try {
      if (f.geomType !== 'PLANE') continue;
      const nn = f.normalAt().toTuple();
      if (dot3(nn, b.dir) < 0.999) continue;
      const c = f.center.toTuple();
      if (Math.abs(dot3([c[0] - p0[0], c[1] - p0[1], c[2] - p0[2]], b.dir)) > size * 1e-5 + 1e-6) continue;
      const m = f.mesh({ tolerance: Math.max(size * 5e-4, 0.01), angularTolerance: 0.15 });
      const pt = (i) => { const v = [m.vertices[i * 3], m.vertices[i * 3 + 1], m.vertices[i * 3 + 2]]; return [dot3(v, b.x), -dot3(v, b.y)]; };
      for (let i = 0; i + 2 < m.triangles.length; i += 3) triangles.push([...pt(m.triangles[i]), ...pt(m.triangles[i + 1]), ...pt(m.triangles[i + 2])]);
    } catch { /* skip that face */ }
  }
  try { kept.delete(); } catch { /* fine */ }
  return { ...out, section: { triangles }, basis: b };
}

/**
 * 45° hatch lines clipped to triangles (flat [x0, y0, x1, y1, x2, y2], y down), `spacing` apart:
 * [[x0, y0, x1, y1]] segments. Lines run up-right on the sheet (`angle` 45) or up-left (135).
 */
export function hatchSegments(triangles, spacing, angle = 45) {
  if (!(spacing > 0) || !triangles?.length) return [];
  const a = (angle * Math.PI) / 180;
  const d = [Math.cos(a), -Math.sin(a)]; const m = [-d[1], d[0]];
  const rows = new Map();
  for (const t of triangles) {
    const P = [[t[0], t[1]], [t[2], t[3]], [t[4], t[5]]];
    const c = P.map((p) => p[0] * m[0] + p[1] * m[1]);
    const lo = Math.ceil(Math.min(...c) / spacing - 1e-9); const hi = Math.floor(Math.max(...c) / spacing + 1e-9);
    for (let k = lo; k <= hi; k++) {
      const cc = k * spacing; const ts = [];
      for (let e = 0; e < 3; e++) {
        const i = e; const j = (e + 1) % 3;
        if ((c[i] - cc) * (c[j] - cc) > 0 || c[i] === c[j]) continue;
        const u = (cc - c[i]) / (c[j] - c[i]);
        const q = [P[i][0] + (P[j][0] - P[i][0]) * u, P[i][1] + (P[j][1] - P[i][1]) * u];
        ts.push(q[0] * d[0] + q[1] * d[1]);
      }
      if (ts.length < 2) continue;
      const t0 = Math.min(...ts); const t1 = Math.max(...ts);
      if (t1 - t0 < 1e-9) continue;
      if (!rows.has(k)) rows.set(k, []);
      rows.get(k).push([t0, t1]);
    }
  }
  const out = [];
  for (const [k, list] of [...rows].sort((p, q) => p[0] - q[0])) {
    list.sort((p, q) => p[0] - q[0]);
    const merged = [];
    for (const iv of list) { const last = merged.at(-1); if (last && iv[0] <= last[1] + spacing * 1e-3) last[1] = Math.max(last[1], iv[1]); else merged.push([...iv]); }
    const cc = k * spacing;
    for (const [t0, t1] of merged) out.push([cc * m[0] + t0 * d[0], cc * m[1] + t0 * d[1], cc * m[0] + t1 * d[0], cc * m[1] + t1 * d[1]]);
  }
  return out;
}

/** Scale multiplier of a view relative to the sheet scale (a detail view: its `scale`, 2 by default). */
export const viewMult = (v) => (v?.kind === 'detail' ? (Number(v.scale) > 0 ? Number(v.scale) : 2) : 1);
/** A view laid out and drawn the original way (no kind, a standard orientation). */
const isPlainView = (v) => !v.kind && v.type !== 'custom';

/** view → its projection; a detail view gets its parent's projection with a circle-sized box. */
export function projectionResolver(drawing, projections) {
  const views = drawing.views ?? [];
  const memo = new Map();
  const get = (v, depth = 0) => {
    if (!v) return undefined;
    if (v.kind !== 'detail') return projections.get(v.id);
    if (memo.has(v.id)) return memo.get(v.id);
    let out;
    const parent = depth < 8 ? views.find((w) => w.id === v.parent && w.id !== v.id) : null;
    const pp = parent ? get(parent, depth + 1) : undefined;
    if (pp) {
      const pc = [(pp.box.x0 + pp.box.x1) / 2, (pp.box.y0 + pp.box.y1) / 2];
      const center = Array.isArray(v.center) && v.center.length >= 2 && v.center.slice(0, 2).every(Number.isFinite) ? [Number(v.center[0]), Number(v.center[1])] : pc;
      const r = Number(v.radius) > 0 ? Number(v.radius) : Math.max(1e-3, 0.25 * Math.min(pp.box.x1 - pp.box.x0, pp.box.y1 - pp.box.y0));
      out = { visible: pp.visible, hidden: pp.hidden, section: pp.section, box: { x0: center[0] - r, y0: center[1] - r, x1: center[0] + r, y1: center[1] + r }, detail: { center, radius: r }, breaks: pp.breaks };
    }
    memo.set(v.id, out);
    return out;
  };
  return get;
}

/**
 * Lays out the views on the sheet and picks a standard scale so they fit (third-angle: top above the front,
 * right to its right; first-angle: the other way). `projections`: view id → projectView() result.
 * Returns { scale, places: Map viewId → { cx, cy } in sheet mm (y down) }.
 * Section, detail and auxiliary views follow the other views in the row along the bottom (wrapping upward).
 */
export function layoutViews(drawing, projections) {
  const [W, H] = SHEETS[drawing.sheet] ?? SHEETS.A3;
  const margin = 20; const titleH = 40; const gap = 22;
  const resolve = projectionResolver(drawing, projections);
  const viewById = (id) => drawing.views.find((v) => v.id === id);
  const size = (id) => {
    const v = viewById(id);
    const p = v ? resolve(v) : projections.get(id);
    if (!p) return { w: 0, h: 0 };
    const k = viewMult(v);
    return { w: (p.box.x1 - p.box.x0) * k, h: (p.box.y1 - p.box.y0) * k };
  };
  const byType = (t) => drawing.views.find((v) => v.type === t && isPlainView(v));
  const front = byType('front'); const top = byType('top'); const right = byType('right'); const iso = drawing.views.find((v) => (v.type === 'iso' || v.type === 'dimetric') && isPlainView(v));
  const fw = size(front?.id).w; const fh = size(front?.id).h;
  const tw = top ? size(top.id).w : 0; const th = top ? size(top.id).h : 0;
  const rw = right ? size(right.id).w : 0; const rh = right ? size(right.id).h : 0;
  void rh;
  const iw = iso ? size(iso.id).w : 0; const ih = iso ? size(iso.id).h : 0;
  // Section / detail / auxiliary views placed automatically get a row of their own under the standard views.
  const extraViews = drawing.views.filter((v) => !isPlainView(v) && !(Number.isFinite(v.x) && Number.isFinite(v.y)));
  const extraH = extraViews.length ? Math.max(0, ...extraViews.map((v) => size(v.id).h)) : 0;
  const extraBand = extraViews.length ? gap + 10 : 0;
  const totalW = Math.max(fw, tw) + rw + iw * 0.8 + 1e-9;
  const totalH = fh + th + extraH + 1e-9;
  const availW = W - 2 * margin - gap * 3; const availH = H - 2 * margin - titleH - gap * 2 - extraBand;
  let scale = drawing.scale || 1;
  if (drawing.autoScale !== false) {
    const fit = Math.min(availW / totalW, availH / totalH);
    scale = STANDARD_SCALES.find((s) => s <= fit) ?? STANDARD_SCALES.at(-1);
  }
  const places = new Map();
  const third = drawing.projection !== 'first';
  const left = margin + gap + (Math.max(fw, tw) * scale) / 2;
  const usedH = (fh + th) * scale + gap;
  const reserve = extraViews.length ? extraH * scale + extraBand : 0;
  const topBand = margin + Math.max(gap, (H - titleH - 2 * margin - usedH - reserve) / 2);
  const frontCy = third ? topBand + th * scale + gap + (fh * scale) / 2 : topBand + (fh * scale) / 2;
  const topCy = third ? topBand + (th * scale) / 2 : frontCy + (fh * scale) / 2 + gap + (th * scale) / 2;
  const rightCx = third ? left + (Math.max(fw, tw) * scale) / 2 + gap + (rw * scale) / 2 : left;
  const frontCx = third ? left : left + (rw * scale) / 2 + gap + (Math.max(fw, tw) * scale) / 2;
  if (front) places.set(front.id, { cx: frontCx, cy: frontCy });
  if (top) places.set(top.id, { cx: frontCx, cy: topCy });
  if (right) places.set(right.id, { cx: third ? rightCx : left, cy: frontCy });
  if (iso) places.set(iso.id, { cx: W - margin - gap - (iw * scale) / 2, cy: margin + gap + (ih * scale) / 2 + 6 });
  // Other views (left, back, bottom) go in a row along the bottom.
  let x = margin + gap;
  for (const v of drawing.views) {
    if (places.has(v.id) || !isPlainView(v)) continue;
    const s = size(v.id);
    places.set(v.id, { cx: x + (s.w * scale) / 2, cy: H - margin - titleH - gap - (s.h * scale) / 2 });
    x += s.w * scale + gap;
  }
  // Then section, detail and auxiliary views; a full row starts a new one above it.
  let rowBottom = H - margin - titleH - gap; let rowH = 0;
  for (const v of drawing.views) {
    if (places.has(v.id)) continue;
    const s = size(v.id);
    const w = s.w * scale; const h = s.h * scale + 10;
    if (x > margin + gap && x + w > W - margin) { x = margin + gap; rowBottom -= rowH + gap; rowH = 0; }
    places.set(v.id, { cx: x + w / 2, cy: rowBottom - (s.h * scale) / 2 });
    x += w + gap; rowH = Math.max(rowH, h);
  }
  // A view moved by hand keeps its place.
  for (const v of drawing.views) if (Number.isFinite(v.x) && Number.isFinite(v.y)) places.set(v.id, { cx: v.x, cy: v.y });
  return { scale, places };
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (v) => { const r = Math.round(v * 100) / 100; return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0$/, ''); };
const n2 = (v) => String(Math.round(v * 1000) / 1000);
const idSafe = (s) => String(s ?? '').replace(/[^A-Za-z0-9_-]/g, '_');

/** Overall dimensions of a (non-isometric) view: width under it, height left of it (a broken view: its true size, p.trueW / p.trueH). */
/** viewDimensions() as primitives (sheet mm, y down) for the DXF: the same lines, arrows and texts. */
export function viewDimensionPrims(p, place, scale) {
  const w = p.box.x1 - p.box.x0; const h = p.box.y1 - p.box.y0;
  const x0 = place.cx - (w * scale) / 2; const x1 = place.cx + (w * scale) / 2;
  const y0 = place.cy - (h * scale) / 2; const y1 = place.cy + (h * scale) / 2;
  const out = [];
  const arrow = (x, y, dx, dy) => ({ t: 'fill', pts: [[x, y], [x - dx * 2.5 - dy * 0.8, y - dy * 2.5 + dx * 0.8], [x - dx * 2.5 + dy * 0.8, y - dy * 2.5 - dx * 0.8]] });
  if (w > 1e-6) {
    const y = y1 + 9;
    out.push({ t: 'poly', pts: [[x0, y1 + 1.5], [x0, y + 2]] }, { t: 'poly', pts: [[x1, y1 + 1.5], [x1, y + 2]] }, { t: 'poly', pts: [[x0, y], [x1, y]] }, arrow(x0, y, -1, 0), arrow(x1, y, 1, 0));
    out.push({ t: 'text', x: (x0 + x1) / 2, y: y - 1.2, text: fmt(p.trueW ?? w), size: 3.2, anchor: 'middle' });
  }
  if (h > 1e-6) {
    const x = x0 - 9;
    out.push({ t: 'poly', pts: [[x0 - 1.5, y0], [x - 2, y0]] }, { t: 'poly', pts: [[x0 - 1.5, y1], [x - 2, y1]] }, { t: 'poly', pts: [[x, y0], [x, y1]] }, arrow(x, y0, 0, -1), arrow(x, y1, 0, 1));
    out.push({ t: 'text', x: x - 1.2, y: (y0 + y1) / 2, text: fmt(p.trueH ?? h), size: 3.2, anchor: 'middle', rot: -90 });
  }
  return out;
}

/** The zone marks of the frame as line pairs (sheet mm, y down), as zoneMarks() draws them. */
export function zoneMarkLines(W, H) {
  const out = [];
  const cols = Math.round((W - 20) / 50); const rows = Math.round((H - 20) / 50);
  for (let i = 1; i < cols; i++) { const x = 10 + ((W - 20) * i) / cols; out.push([[x, 10], [x, 13]], [[x, H - 13], [x, H - 10]]); }
  for (let i = 1; i < rows; i++) { const y = 10 + ((H - 20) * i) / rows; out.push([[10, y], [13, y]], [[W - 13, y], [W - 10, y]]); }
  return out;
}

function viewDimensions(p, place, scale) {
  const w = p.box.x1 - p.box.x0; const h = p.box.y1 - p.box.y0;
  const x0 = place.cx - (w * scale) / 2; const x1 = place.cx + (w * scale) / 2;
  const y0 = place.cy - (h * scale) / 2; const y1 = place.cy + (h * scale) / 2;
  const out = [];
  const arrow = (x, y, dx, dy) => `<path d="M ${x} ${y} l ${-dx * 2.5 - dy * 0.8} ${-dy * 2.5 + dx * 0.8} l ${dy * 1.6} ${-dx * 1.6} z" class="dim-arrow"/>`;
  if (w > 1e-6) {
    const y = y1 + 9;
    out.push(`<line x1="${x0}" y1="${y1 + 1.5}" x2="${x0}" y2="${y + 2}" class="dim-ext"/><line x1="${x1}" y1="${y1 + 1.5}" x2="${x1}" y2="${y + 2}" class="dim-ext"/>`);
    out.push(`<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" class="dim-line"/>${arrow(x0, y, -1, 0)}${arrow(x1, y, 1, 0)}`);
    out.push(`<text x="${(x0 + x1) / 2}" y="${y - 1.2}" class="dim-text" text-anchor="middle">${fmt(p.trueW ?? w)}</text>`);
  }
  if (h > 1e-6) {
    const x = x0 - 9;
    out.push(`<line x1="${x0 - 1.5}" y1="${y0}" x2="${x - 2}" y2="${y0}" class="dim-ext"/><line x1="${x0 - 1.5}" y1="${y1}" x2="${x - 2}" y2="${y1}" class="dim-ext"/>`);
    out.push(`<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" class="dim-line"/>${arrow(x, y0, 0, -1)}${arrow(x, y1, 0, 1)}`);
    out.push(`<text x="${x - 1.2}" y="${(y0 + y1) / 2}" class="dim-text" text-anchor="middle" transform="rotate(-90 ${x - 1.2} ${(y0 + y1) / 2})">${fmt(p.trueH ?? h)}</text>`);
  }
  return out.join('');
}

// ───────────────────────── primitives (sheet mm, y down) → SVG / DXF

// { t: 'poly', pts, closed?, cls? } · { t: 'circle', c, r, fill?, cls? } · { t: 'fill', pts } ·
// { t: 'text', x, y, text, size, anchor?: 'start'|'middle'|'end', rot? (degrees, clockwise on the sheet), bold? }

const add2 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
const unit2 = (a) => { const l = Math.hypot(a[0], a[1]); return l > 1e-12 ? [a[0] / l, a[1] / l] : [1, 0]; };
const pt2 = (p) => (Array.isArray(p) && p.length >= 2 && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])) ? [Number(p[0]), Number(p[1])] : null);
/** Width of a line of text in the sheet's font (text-metrics.js). */
const textWidth = (s, size) => measureText(s, size);

/** A filled arrowhead with its tip at `tip`, pointing along `dir`. */
function arrowHead(tip, dir, L = 2.5, w = 0.8) {
  const d = unit2(dir); const n = [-d[1], d[0]];
  return { t: 'fill', pts: [tip, add2(add2(tip, d, -L), n, w), add2(add2(tip, d, -L), n, -w)] };
}

function circlePath(c, r) {
  return `M ${n2(c[0] - r)} ${n2(c[1])} A ${n2(r)} ${n2(r)} 0 1 0 ${n2(c[0] + r)} ${n2(c[1])} A ${n2(r)} ${n2(r)} 0 1 0 ${n2(c[0] - r)} ${n2(c[1])} Z`;
}

function primitivesSvg(prims) {
  const out = [];
  for (const p of prims) {
    if (p.t === 'poly') out.push(`<path d="M ${p.pts.map((q) => `${n2(q[0])} ${n2(q[1])}`).join(' L ')}${p.closed ? ' Z' : ''}" class="${p.cls ?? 'ann-line'}"/>`);
    else if (p.t === 'circle') out.push(`<path d="${circlePath(p.c, p.r)}" class="${p.fill ? 'ann-fill' : (p.cls ?? 'ann-line')}"/>`);
    else if (p.t === 'fill') out.push(`<path d="M ${p.pts.map((q) => `${n2(q[0])} ${n2(q[1])}`).join(' L ')} Z" class="ann-fill"/>`);
    else if (p.t === 'text') {
      const lines = String(p.text ?? '').split('\n');
      const rot = p.rot ? ` transform="rotate(${n2(p.rot)} ${n2(p.x)} ${n2(p.y)})"` : '';
      const body = lines.length === 1 ? esc(lines[0]) : lines.map((l, i) => `<tspan x="${n2(p.x)}" dy="${i ? n2(p.size * 1.25) : 0}">${esc(l)}</tspan>`).join('');
      out.push(`<text x="${n2(p.x)}" y="${n2(p.y)}" class="${p.bold ? 'ann-text ann-bold' : 'ann-text'}" font-size="${n2(p.size)}" text-anchor="${p.anchor ?? 'start'}"${rot}>${body}</text>`);
    }
  }
  return out.join('');
}

/** DXF entities of primitives (sheet y down → DXF y up, H = sheet height). */
function primitivesDxf(prims, H, layer = 'NOTES') {
  const f = (v) => Number(v).toFixed(4);
  const out = [];
  const line = (a, b) => out.push(`0\nLINE\n8\n${layer}\n10\n${f(a[0])}\n20\n${f(H - a[1])}\n30\n0\n11\n${f(b[0])}\n21\n${f(H - b[1])}\n31\n0`);
  for (const p of prims) {
    if (p.t === 'poly' || p.t === 'fill') {
      const pts = p.pts; const closed = p.closed || p.t === 'fill';
      for (let k = 1; k < pts.length; k++) line(pts[k - 1], pts[k]);
      if (closed && pts.length > 2) line(pts.at(-1), pts[0]);
      if (p.t === 'fill' && (pts.length === 3 || pts.length === 4)) {
        const q = pts.length === 3 ? [pts[0], pts[1], pts[2], pts[2]] : [pts[0], pts[1], pts[3], pts[2]];
        out.push(`0\nSOLID\n8\n${layer}\n${q.map((v, i) => `1${i}\n${f(v[0])}\n2${i}\n${f(H - v[1])}\n3${i}\n0`).join('\n')}`);
      }
    } else if (p.t === 'circle') out.push(`0\nCIRCLE\n8\n${layer}\n10\n${f(p.c[0])}\n20\n${f(H - p.c[1])}\n30\n0\n40\n${f(p.r)}`);
    else if (p.t === 'text') {
      const lines = String(p.text ?? '').split('\n');
      const h = { start: 0, middle: 1, end: 2 }[p.anchor ?? 'start'] ?? 0;
      const r = ((p.rot ?? 0) * Math.PI) / 180;
      lines.forEach((l, i) => {
        if (!l) return;
        // Following lines go down the text's own (rotated) y axis, like the SVG tspans.
        const dy = i * p.size * 1.25;
        const X = p.x - Math.sin(r) * dy; const Y = H - (p.y + Math.cos(r) * dy);
        out.push(`0\nTEXT\n8\n${layer}\n10\n${f(X)}\n20\n${f(Y)}\n30\n0\n40\n${f(p.size * 0.72)}\n1\n${l.replace(/[\r\n]/g, ' ')}\n50\n${f(-(p.rot ?? 0))}${h ? `\n72\n${h}\n11\n${f(X)}\n21\n${f(Y)}\n31\n0` : ''}`);
      });
    }
  }
  return out;
}

// ───────────────────────── annotations

export const ANNOTATION_KINDS = ['note', 'balloon', 'gdt', 'datum', 'surface', 'centermark', 'dimension', 'cloud', 'datumTarget', 'hatch', 'bendTable'];
/** Area hatch patterns: ANSI31 (lines), ANSI37 (crossed lines), steel (pairs of lines), solid fill. */
export const HATCH_PATTERNS = ['ansi31', 'ansi37', 'steel', 'solid'];
export const GDT_SYMBOLS = ['flatness', 'straightness', 'circularity', 'cylindricity', 'parallelism', 'perpendicularity', 'angularity', 'position', 'concentricity', 'symmetry', 'profileLine', 'profileSurface', 'runout', 'totalRunout'];
/** Tolerance kind of each GD&T symbol (form, orientation, location, profile, runout) and whether it needs a datum. */
export const GDT_GROUPS = {
  flatness: 'form', straightness: 'form', circularity: 'form', cylindricity: 'form',
  parallelism: 'orientation', perpendicularity: 'orientation', angularity: 'orientation',
  position: 'location', concentricity: 'location', symmetry: 'location',
  profileLine: 'profile', profileSurface: 'profile', runout: 'runout', totalRunout: 'runout',
};

const arcPts = (cx, cy, r, a0, a1, n = 16) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });

/** A GD&T symbol in unit coordinates (about −1…1, y down) as primitives. */
function gdtGlyph(symbol) {
  const L = (...pts) => ({ t: 'poly', pts });
  const C = (r, c = [0, 0]) => ({ t: 'circle', c, r });
  const arrow = (from, to) => [L(from, add2(to, unit2(sub2(to, from)), -0.45)), { t: 'fill', pts: [to, add2(add2(to, unit2(sub2(to, from)), -0.55), [-unit2(sub2(to, from))[1], unit2(sub2(to, from))[0]], 0.22), add2(add2(to, unit2(sub2(to, from)), -0.55), [-unit2(sub2(to, from))[1], unit2(sub2(to, from))[0]], -0.22)] }];
  switch (symbol) {
    case 'flatness': return [{ t: 'poly', pts: [[-1, 0.45], [-0.45, -0.45], [1, -0.45], [0.45, 0.45]], closed: true }];
    case 'straightness': return [L([-1, 0], [1, 0])];
    case 'circularity': return [C(0.8)];
    case 'cylindricity': return [C(0.55), L([-0.95, 0.85], [-0.05, -0.95]), L([0.05, 0.95], [0.95, -0.85])];
    case 'parallelism': return [L([-0.8, 0.85], [0.1, -0.85]), L([-0.1, 0.85], [0.8, -0.85])];
    case 'perpendicularity': return [L([0, -0.9], [0, 0.75]), L([-0.9, 0.75], [0.9, 0.75])];
    case 'angularity': return [L([0.95, 0.75], [-0.95, 0.75], [0.8, -0.55])];
    case 'position': return [C(0.55), L([-1, 0], [1, 0]), L([0, -1], [0, 1])];
    case 'concentricity': return [C(0.85), C(0.42)];
    case 'symmetry': return [L([-0.6, -0.45], [0.6, -0.45]), L([-1, 0], [1, 0]), L([-0.6, 0.45], [0.6, 0.45])];
    case 'profileLine': return [L(...arcPts(0, 0.45, 0.95, Math.PI, 2 * Math.PI))];
    case 'profileSurface': return [{ t: 'poly', pts: arcPts(0, 0.45, 0.95, Math.PI, 2 * Math.PI), closed: true }];
    case 'runout': return arrow([-0.75, 0.85], [0.75, -0.85]);
    case 'totalRunout': return [...arrow([-0.95, 0.85], [0.25, -0.85]), ...arrow([-0.15, 0.85], [1.0, -0.85]), L([-1.0, 0.85], [0.1, 0.85])];
    default: return [];
  }
}

/** Places unit-coordinate primitives at `c` with size `k`. */
function placeGlyph(prims, c, k) {
  const m = (q) => [c[0] + q[0] * k, c[1] + q[1] * k];
  return prims.map((p) => (p.t === 'circle' ? { ...p, c: m(p.c), r: p.r * k } : { ...p, pts: p.pts.map(m) }));
}
const diameterGlyph = () => [{ t: 'circle', c: [0, 0], r: 0.6 }, { t: 'poly', pts: [[-0.85, 0.85], [0.85, -0.85]] }];

/** Leader from the nearest point of a box's edge midpoints to `target`, with an arrowhead (or a dot). */
function leaderFrom(boxPts, target, end = 'arrow') {
  const t = pt2(target);
  if (!t) return [];
  let from = boxPts[0]; let best = Infinity;
  for (const p of boxPts) { const dd = Math.hypot(p[0] - t[0], p[1] - t[1]); if (dd < best) { best = dd; from = p; } }
  if (best < 1e-6) return [];
  const out = [{ t: 'poly', pts: [from, t] }];
  if (end === 'dot') out.push({ t: 'circle', c: t, r: 0.6, fill: true });
  else out.push(arrowHead(t, sub2(t, from)));
  return out;
}

/** The primitives of one annotation (sheet mm, y down). `scale`: the sheet scale (for dimension values). */
export function annotationPrimitives(a, { scale = 1 } = {}) {
  const x = Number(a?.x) || 0; const y = Number(a?.y) || 0;
  switch (a?.kind) {
    case 'note': {
      const size = Number(a.size) > 0 ? Number(a.size) : 3.5;
      const out = [{ t: 'text', x, y, text: a.text ?? '', size, anchor: a.anchor ?? 'start', rot: Number(a.rot) || 0, bold: Boolean(a.bold) }];
      if (pt2(a.target)) {
        const lines = String(a.text ?? '').split('\n');
        const w = Math.max(...lines.map((l) => textWidth(l, size)));
        out.push(...leaderFrom([[x - 1, y - size * 0.35], [x + w + 1, y - size * 0.35]], a.target));
      }
      return out;
    }
    case 'balloon': {
      const r = Number(a.size) > 0 ? Number(a.size) : 4;
      const out = [{ t: 'circle', c: [x, y], r }, { t: 'text', x, y: y + r * 0.4, text: String(a.item ?? ''), size: r * 1.05, anchor: 'middle' }];
      const t = pt2(a.target);
      if (t) {
        const d = unit2(sub2(t, [x, y]));
        if (Math.hypot(t[0] - x, t[1] - y) > r) out.push({ t: 'poly', pts: [add2([x, y], d, r), t] }, { t: 'circle', c: t, r: 0.6, fill: true });
      }
      return out;
    }
    case 'gdt': {
      const h = Number(a.size) > 0 ? Number(a.size) : 6;
      const ts = h * 0.58;
      const tol = String(a.tolerance ?? '');
      const mod = a.modifier === 'M' || a.modifier === 'L' ? a.modifier : '';
      const datums = (Array.isArray(a.datums) ? a.datums : []).map(String).filter((s) => s.trim());
      const out = [];
      let cx = x;
      out.push(...placeGlyph(gdtGlyph(a.symbol), [cx + h / 2, y + h / 2], h * 0.3));
      cx += h;
      const dia = a.diameter ? ts * 0.95 : 0;
      const modW = mod ? ts * 1.1 + 0.8 : 0;
      const tolW = 1.6 + dia + textWidth(tol, ts) + modW + 1.6;
      let tx = cx + 1.6;
      if (a.diameter) { out.push(...placeGlyph(diameterGlyph(), [tx + dia / 2 - 0.1, y + h / 2], ts * 0.42)); tx += dia; }
      out.push({ t: 'text', x: tx, y: y + h / 2 + ts * 0.36, text: tol, size: ts });
      tx += textWidth(tol, ts);
      if (mod) {
        const mr = ts * 0.55;
        out.push({ t: 'circle', c: [tx + 0.8 + mr, y + h / 2], r: mr }, { t: 'text', x: tx + 0.8 + mr, y: y + h / 2 + ts * 0.27, text: mod, size: ts * 0.75, anchor: 'middle' });
      }
      const cells = [x, cx];
      cx += tolW; cells.push(cx);
      for (const dl of datums) {
        const w = Math.max(h, textWidth(dl, ts) + 2.4);
        out.push({ t: 'text', x: cx + w / 2, y: y + h / 2 + ts * 0.36, text: dl, size: ts, anchor: 'middle' });
        cx += w; cells.push(cx);
      }
      out.unshift({ t: 'poly', pts: [[x, y], [cx, y], [cx, y + h], [x, y + h]], closed: true, cls: 'ann-frame' });
      for (const c of cells.slice(1, -1)) out.push({ t: 'poly', pts: [[c, y], [c, y + h]], cls: 'ann-frame' });
      out.push(...leaderFrom([[x, y + h / 2], [cx, y + h / 2], [x + h / 2, y + h], [x + h / 2, y]], a.target));
      return out;
    }
    case 'datum': {
      const s = Number(a.size) > 0 ? Number(a.size) : 6;
      const out = [{ t: 'poly', pts: [[x - s / 2, y - s / 2], [x + s / 2, y - s / 2], [x + s / 2, y + s / 2], [x - s / 2, y + s / 2]], closed: true, cls: 'ann-frame' },
        { t: 'text', x, y: y + s * 0.2, text: String(a.letter ?? 'A'), size: s * 0.58, anchor: 'middle' }];
      const t = pt2(a.target) ?? [x, y + s / 2 + 5];
      const edges = [[x, y + s / 2], [x, y - s / 2], [x - s / 2, y], [x + s / 2, y]];
      let from = edges[0]; let best = Infinity;
      for (const p of edges) { const dd = Math.hypot(p[0] - t[0], p[1] - t[1]); if (dd < best) { best = dd; from = p; } }
      const d = unit2(sub2(from, t)); const nn = [-d[1], d[0]];
      const apex = add2(t, d, 2.6);
      out.push({ t: 'fill', pts: [add2(t, nn, 1.5), add2(t, nn, -1.5), apex] });
      if (Math.hypot(from[0] - apex[0], from[1] - apex[1]) > 1e-6 && best > 2.6) out.push({ t: 'poly', pts: [apex, from] });
      return out;
    }
    case 'surface': {
      // Tip at (x, y) on the surface; legs at 60° — short one up-left, long one up-right.
      const k = Number(a.size) > 0 ? Number(a.size) / 5 : 1;
      const sl = 5 * k; const ll = 10 * k;
      const c60 = 0.5; const s60 = Math.sqrt(3) / 2;
      const Lp = [x - sl * c60, y - sl * s60]; const Rp = [x + ll * c60, y - ll * s60];
      const out = [{ t: 'poly', pts: [Lp, [x, y], Rp] }];
      if (a.process === 'removal') out.push({ t: 'poly', pts: [Lp, [x + sl * c60, y - sl * s60]] });
      if (a.process === 'noRemoval') { const d = (sl * s60) / 1.5; out.push({ t: 'circle', c: [x, y - d], r: d / 2 }); }
      const ra = String(a.ra ?? '');
      if (ra) {
        const ts = 2.8 * k;
        const w = Math.max(6 * k, textWidth(`Ra ${ra}`, ts) + 1);
        out.push({ t: 'poly', pts: [Rp, [Rp[0] + w, Rp[1]]] }, { t: 'text', x: Rp[0] + 0.8, y: Rp[1] - 0.9, text: `Ra ${ra}`, size: ts });
      }
      return out;
    }
    case 'centermark': {
      const s = Number(a.size) > 0 ? Number(a.size) : 10;
      const h = s / 2; const c = Math.min(1.5, s / 6); const g = Math.min(2.5, s / 4);
      // A small mark (no room for a gap and a 1 mm dash beyond the cross) is one plain cross over its whole size.
      if (h - g < 1) return [{ t: 'poly', pts: [[x - h, y], [x + h, y]] }, { t: 'poly', pts: [[x, y - h], [x, y + h]] }];
      const out = [{ t: 'poly', pts: [[x - c, y], [x + c, y]] }, { t: 'poly', pts: [[x, y - c], [x, y + c]] }];
      out.push({ t: 'poly', pts: [[x - h, y], [x - g, y]] }, { t: 'poly', pts: [[x + g, y], [x + h, y]] }, { t: 'poly', pts: [[x, y - h], [x, y - g]] }, { t: 'poly', pts: [[x, y + g], [x, y + h]] });
      return out;
    }
    case 'dimension': {
      // a, b: the measured sheet points; orient 'horizontal' / 'vertical' measures one coordinate only.
      const A0 = pt2(a.a) ?? [x, y]; const B0 = pt2(a.b) ?? [x + 10, y];
      const off = a.offset !== null && a.offset !== '' && Number.isFinite(Number(a.offset)) ? Number(a.offset) : 8;
      const A = A0; let B = B0;
      if (a.orient === 'horizontal') B = [B0[0], A0[1]];
      if (a.orient === 'vertical') B = [A0[0], B0[1]];
      const dist = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const u = dist > 1e-9 ? unit2(sub2(B, A)) : [1, 0];
      const nrm = [u[1], -u[0]]; // left of a → b on the sheet: a positive offset of a horizontal dimension is above it
      const s = off >= 0 ? 1 : -1;
      const Ad = add2(A, nrm, off); const Bd = add2(B, nrm, off);
      // Extension lines from just off the measured points to a little past the dimension line.
      const ext = (P, D) => { const e = add2(D, nrm, s * 2); const g = Math.hypot(e[0] - P[0], e[1] - P[1]); return { t: 'poly', pts: [g > 1.5 ? add2(P, unit2(sub2(e, P)), 1.5) : P, e] }; };
      const out = [ext(A0, Ad), ext(B0, Bd), { t: 'poly', pts: [Ad, Bd] }, arrowHead(Ad, [-u[0], -u[1]]), arrowHead(Bd, u)];
      let ang = (Math.atan2(u[1], u[0]) * 180) / Math.PI;
      if (ang > 90.001) ang -= 180; else if (ang <= -90.001) ang += 180;
      const value = a.text != null && a.text !== '' ? String(a.text) : fmt(dist / (scale || 1));
      const size = Number(a.size) > 0 ? Number(a.size) : 3.2;
      const mid = [(Ad[0] + Bd[0]) / 2, (Ad[1] + Bd[1]) / 2];
      const ar = (ang * Math.PI) / 180; const up = [Math.sin(ar), -Math.cos(ar)];
      const tp = add2(mid, up, 1.2);
      out.push({ t: 'text', x: tp[0], y: tp[1], text: value, size, anchor: 'middle', rot: Math.abs(ang) < 1e-9 ? 0 : ang });
      return out;
    }
    case 'cloud': return cloudPrimitives(a, x, y);
    case 'datumTarget': return datumTargetPrimitives(a, x, y);
    case 'hatch': return areaHatchPrimitives(a, x, y);
    case 'bendTable': return bendTablePrimitives(a, x, y);
    default: return [];
  }
}

/** The region of a cloud or an area hatch: its points, or the rectangle x, y, w × h. */
function regionOf(a, x, y) {
  const pts = Array.isArray(a.pts) ? a.pts.map(pt2).filter(Boolean) : [];
  if (pts.length >= 3) return pts;
  const w = Number(a.w) > 0 ? Number(a.w) : 40; const h = Number(a.h) > 0 ? Number(a.h) : 25;
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}
const signedArea2 = (pts) => pts.reduce((acc, p, i) => { const q = pts[(i + 1) % pts.length]; return acc + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;

/**
 * Revision cloud: arcs bulging out along the region's outline, each about `arc` mm long (a scalloped closed
 * line), and a revision triangle with its letter at the first corner when `rev` is set.
 */
export function cloudPrimitives(a, x = Number(a.x) || 0, y = Number(a.y) || 0) {
  const pts = regionOf(a, x, y);
  const chord = Number(a.arc) > 0 ? Number(a.arc) : 6;
  const ccw = signedArea2(pts) > 0;
  const out = [];
  const line = [];
  for (let i = 0; i < pts.length; i++) {
    const A = pts[i]; const B = pts[(i + 1) % pts.length];
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (L < 1e-9) continue;
    const n = Math.max(1, Math.round(L / chord));
    const d = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
    // Outward: to the left of each edge of a positively oriented outline (the sheet's y runs down).
    const nrm = ccw ? [d[1], -d[0]] : [-d[1], d[0]];
    const c = L / n;
    // A circular arc over each chord with a sagitta of 0.35 c, bulging outward.
    const sag = 0.35 * c; const R = (c * c) / (8 * sag) + sag / 2;
    for (let k = 0; k < n; k++) {
      const P = [A[0] + d[0] * c * k, A[1] + d[1] * c * k];
      const mid = [P[0] + (d[0] * c) / 2, P[1] + (d[1] * c) / 2];
      const C = [mid[0] - nrm[0] * (R - sag), mid[1] - nrm[1] * (R - sag)];
      const a0 = Math.atan2(P[1] - C[1], P[0] - C[0]);
      const Q = [P[0] + d[0] * c, P[1] + d[1] * c];
      const aq = Math.atan2(Q[1] - C[1], Q[0] - C[0]);
      const top = Math.atan2(mid[1] + nrm[1] * sag - C[1], mid[0] + nrm[0] * sag - C[0]);
      // The way round from P to Q that passes the top of the bulge.
      const norm = (v) => ((v % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const fwd = norm(aq - a0);
      const a1 = norm(top - a0) <= fwd ? a0 + fwd : a0 - (2 * Math.PI - fwd);
      const seg = arcPts(C[0], C[1], R, a0, a1, 8);
      if (line.length) seg.shift();
      line.push(...seg);
    }
  }
  if (line.length) out.push({ t: 'poly', pts: line, closed: true, cls: 'ann-cloud' });
  if (a.rev) {
    const [tx, ty] = pts[0];
    const side = 7; const h = (side * Math.sqrt(3)) / 2;
    const apex = [tx - side * 0.2, ty - side * 0.8 - h];
    out.push({ t: 'poly', pts: [[apex[0] - side / 2, apex[1] + h], [apex[0] + side / 2, apex[1] + h], apex], closed: true });
    out.push({ t: 'text', x: apex[0], y: apex[1] + h * 0.82, text: String(a.rev), size: 3, anchor: 'middle' });
  }
  return out;
}

/**
 * Datum target: a circle split across — the target's size above (e.g. "Ø6", empty for a point), its label below
 * ("A1") — with a leader to the target: an X for a point, a dashed circle crossed by lines for an area of `areaSize`.
 */
export function datumTargetPrimitives(a, x = Number(a.x) || 0, y = Number(a.y) || 0) {
  const r = Number(a.size) > 0 ? Number(a.size) : 5;
  const out = [{ t: 'circle', c: [x, y], r }, { t: 'poly', pts: [[x - r, y], [x + r, y]] }];
  const ts = r * 0.62;
  if (a.area) out.push({ t: 'text', x, y: y - r * 0.22, text: String(a.area), size: ts, anchor: 'middle' });
  out.push({ t: 'text', x, y: y + r * 0.72, text: String(a.label ?? 'A1'), size: ts, anchor: 'middle' });
  const t = pt2(a.target);
  if (t) {
    const d = unit2(sub2(t, [x, y]));
    if (Math.hypot(t[0] - x, t[1] - y) > r) out.push({ t: 'poly', pts: [add2([x, y], d, r), t] });
    if (a.targetKind === 'area') {
      const ar = Math.max(0.5, (Number(a.areaSize) > 0 ? Number(a.areaSize) : 6) / 2);
      out.push({ t: 'circle', c: t, r: ar, cls: 'ann-phantom' });
      for (const [P, Q] of polygonHatch(arcPts(t[0], t[1], ar, 0, 2 * Math.PI, 24).slice(0, -1), ar * 0.6, 45)) out.push({ t: 'poly', pts: [P, Q], cls: 'ann-phantom' });
    } else {
      const k = 1.3;
      out.push({ t: 'poly', pts: [[t[0] - k, t[1] - k], [t[0] + k, t[1] + k]] }, { t: 'poly', pts: [[t[0] - k, t[1] + k], [t[0] + k, t[1] - k]] });
    }
  }
  return out;
}

/** Line segments of a hatch over a polygon: lines at `angle` degrees, `spacing` apart, clipped even–odd. */
export function polygonHatch(pts, spacing = 2.5, angle = 45, shift = 0) {
  const th = (angle * Math.PI) / 180; const u = [Math.cos(th), Math.sin(th)]; const nrm = [-u[1], u[0]];
  const ns = pts.map((p) => p[0] * nrm[0] + p[1] * nrm[1]);
  const lo = Math.min(...ns); const hi = Math.max(...ns);
  const out = [];
  const sp = Math.max(0.2, spacing);
  for (let c = Math.ceil((lo - shift) / sp) * sp + shift; c <= hi; c += sp) {
    const ts = [];
    for (let i = 0; i < pts.length; i++) {
      const A = pts[i]; const B = pts[(i + 1) % pts.length];
      const da = A[0] * nrm[0] + A[1] * nrm[1] - c; const db = B[0] * nrm[0] + B[1] * nrm[1] - c;
      if ((da > 0) === (db > 0)) continue;
      const f = da / (da - db);
      ts.push((A[0] + (B[0] - A[0]) * f) * u[0] + (A[1] + (B[1] - A[1]) * f) * u[1]);
    }
    ts.sort((p, q) => p - q);
    for (let k = 0; k + 1 < ts.length; k += 2) out.push([[c * nrm[0] + ts[k] * u[0], c * nrm[1] + ts[k] * u[1]], [c * nrm[0] + ts[k + 1] * u[0], c * nrm[1] + ts[k + 1] * u[1]]]);
  }
  return out;
}

/** Area hatch / fill over a region (no outline of its own unless `border`): a pattern, its spacing and angle. */
export function areaHatchPrimitives(a, x = Number(a.x) || 0, y = Number(a.y) || 0) {
  const pts = regionOf(a, x, y);
  const pattern = HATCH_PATTERNS.includes(a.pattern) ? a.pattern : 'ansi31';
  const sp = Number(a.spacing) > 0 ? Number(a.spacing) : 2.5;
  const ang = Number.isFinite(Number(a.angle)) ? Number(a.angle) : 45;
  const out = [];
  if (pattern === 'solid') out.push({ t: 'fill', pts, cls: 'ann-solid' });
  else {
    // ANSI37: a second set at right angles; steel: lines in pairs (every second gap narrow).
    const sets = pattern === 'ansi37' ? [[sp, ang, 0], [sp, ang + 90, 0]] : pattern === 'steel' ? [[sp * 2, ang, 0], [sp * 2, ang, sp * 0.5]] : [[sp, ang, 0]];
    for (const [s0, a0, sh] of sets) for (const [P, Q] of polygonHatch(pts, s0, a0, sh)) out.push({ t: 'poly', pts: [P, Q], cls: 'ann-hatch' });
  }
  if (a.border) out.push({ t: 'poly', pts, closed: true });
  return out;
}

/** Bend table: No. · direction · angle · inner radius · K-factor · allowance, one row per bend (a.rows). */
export function bendTablePrimitives(a, x = Number(a.x) || 0, y = Number(a.y) || 0) {
  const head = Array.isArray(a.head) && a.head.length === 6 ? a.head : ['No.', 'Dir.', 'Angle', 'R', 'K', 'BA'];
  const rows = (Array.isArray(a.rows) ? a.rows : []).map((row) => [String(row.no), String(row.dir), `${fmt(row.angle)}°`, fmt(row.radius), fmt(row.k), fmt(row.allowance)]);
  const widths = [10, 14, 16, 14, 12, 16]; const rh = 6; const ts = 3;
  const W = widths.reduce((p, q) => p + q, 0);
  const all = [head.map(String), ...rows];
  const H = rh * all.length;
  const out = [{ t: 'poly', pts: [[x, y], [x + W, y], [x + W, y + H], [x, y + H]], closed: true, cls: 'ann-frame' }];
  for (let i = 1; i < all.length; i++) out.push({ t: 'poly', pts: [[x, y + i * rh], [x + W, y + i * rh]], cls: 'ann-frame' });
  let cx = x;
  for (const w of widths.slice(0, -1)) { cx += w; out.push({ t: 'poly', pts: [[cx, y], [cx, y + H]], cls: 'ann-frame' }); }
  all.forEach((row, i) => { let px = x; row.forEach((cell, j) => { out.push({ t: 'text', x: px + widths[j] / 2, y: y + i * rh + rh * 0.7, text: cell, size: ts, anchor: 'middle', bold: i === 0 }); px += widths[j]; }); });
  return out;
}

/** One annotation as an SVG group (`<g class="annotation …" data-annotation="id">`). */
export function annotationSvg(a, { scale = 1, selected = false } = {}) {
  const prims = annotationPrimitives(a, { scale });
  return `<g class="annotation ann-${esc(a?.kind ?? '')}${selected ? ' selected' : ''}" data-annotation="${esc(a?.id ?? '')}">${primitivesSvg(prims)}</g>`;
}

// ───────────────────────── bill of materials

/**
 * Rows of an assembly's bill of materials, one per part (quantities summed over its components):
 * [{ item, partNo, name, description, material, qty, part?, sub?, components: [componentId] }]. A component whose
 * part is missing gets a row of its own name; a component holding a sub-assembly (`sub`) counts as one row of that
 * assembly. Suppressed components and those with `excludeFromBom` are left out. `lang` picks material names.
 */
export function bomRows(assembly, project, { lang = 'en' } = {}) {
  const rows = new Map();
  for (const c of assembly?.components ?? []) {
    if (!c || c.suppressed || c.excludeFromBom || c.envelope) continue;
    let key; let row;
    if (c.sub != null && c.part == null) {
      key = `sub:${c.sub}`;
      const asm = project?.assemblies?.find((s) => s.id === c.sub);
      row = { partNo: asm?.partNo ?? '', name: asm?.name ?? c.name ?? String(c.sub), description: asm?.description ?? '', material: '', sub: c.sub };
    } else {
      const part = c.part != null ? project?.parts?.find((p) => p.id === c.part) : null;
      if (part) {
        key = `part:${part.id}`;
        let material = '';
        try { material = part.material ? materialName(part.material, lang) : ''; } catch { material = String(part.material ?? ''); }
        row = { partNo: part.partNo ?? '', name: part.name ?? '', description: part.description ?? '', material, part: part.id };
      } else {
        key = `missing:${c.part ?? ''}:${c.name ?? c.id}`;
        row = { partNo: '', name: c.name ?? String(c.part ?? c.id ?? '?'), description: '', material: '', part: c.part ?? null, missing: true };
      }
    }
    if (!rows.has(key)) rows.set(key, { ...row, qty: 0, components: [] });
    const r = rows.get(key);
    r.qty += 1; r.components.push(c.id);
  }
  return [...rows.values()].map((r, i) => ({ item: i + 1, ...r }));
}

export const BOM_COLUMNS = [
  { key: 'item', label: 'bom.item', fallback: 'ITEM NO.', w: 14, anchor: 'middle' },
  { key: 'partNo', label: 'bom.partNo', fallback: 'PART NUMBER', w: 32 },
  { key: 'name', label: 'bom.name', fallback: 'NAME', w: 42 },
  { key: 'description', label: 'bom.description', fallback: 'DESCRIPTION', w: 46 },
  { key: 'material', label: 'bom.material', fallback: 'MATERIAL', w: 32 },
  { key: 'qty', label: 'bom.qty', fallback: 'QTY.', w: 14, anchor: 'middle' },
];
const BOM_ROW_H = 6;

/** Where the BOM goes by default: right-aligned with the title block, its bottom on the title block's top. */
export function bomPlacement(rows, sheet = 'A3') {
  const [W, H] = SHEETS[sheet] ?? SHEETS.A3;
  const w = BOM_COLUMNS.reduce((s, c) => s + c.w, 0);
  const h = BOM_ROW_H * ((rows?.length ?? 0) + 1);
  return { x: W - 10 - w, y: H - 10 - 40 - h, w, h };
}

function bomPrimitives(rows, { x, y, labels = {} }) {
  const out = [];
  const w = BOM_COLUMNS.reduce((s, c) => s + c.w, 0);
  const n = rows.length + 1;
  out.push({ t: 'poly', pts: [[x, y], [x + w, y], [x + w, y + n * BOM_ROW_H], [x, y + n * BOM_ROW_H]], closed: true, cls: 'bom-frame' });
  for (let r = 1; r < n; r++) out.push({ t: 'poly', pts: [[x, y + r * BOM_ROW_H], [x + w, y + r * BOM_ROW_H]], cls: r === 1 ? 'bom-frame' : 'bom-grid' });
  let cx = x;
  for (const [i, col] of BOM_COLUMNS.entries()) {
    if (i) out.push({ t: 'poly', pts: [[cx, y], [cx, y + n * BOM_ROW_H]], cls: 'bom-grid' });
    const tx = col.anchor === 'middle' ? cx + col.w / 2 : cx + 1.2;
    const fit = (s, size, bold = false) => { const str = String(s ?? ''); const room = col.w - 2; if (measureText(str, size, { bold }) <= room) return str; const chars = [...str]; while (chars.length > 1 && measureText(`${chars.join('')}…`, size, { bold }) > room) chars.pop(); return `${chars.join('')}…`; };
    out.push({ t: 'text', x: tx, y: y + BOM_ROW_H - 1.9, text: fit(labels[col.label] ?? col.fallback, 2.4, true), size: 2.4, anchor: col.anchor ?? 'start', bold: true });
    rows.forEach((row, k) => out.push({ t: 'text', x: tx, y: y + (k + 2) * BOM_ROW_H - 1.8, text: fit(row[col.key], 2.8), size: 2.8, anchor: col.anchor ?? 'start' }));
    cx += col.w;
  }
  return out;
}

/** The BOM table as SVG (`<g class="bom">`), top-left at (x, y) sheet mm; by default above the title block of `sheet`. */
export function bomSvg(rows, { x, y, labels = {}, sheet = 'A3' } = {}) {
  const list = rows ?? [];
  const def = bomPlacement(list, sheet);
  const px = Number.isFinite(x) ? x : def.x; const py = Number.isFinite(y) ? y : def.y;
  return `<g class="bom">${primitivesSvg(bomPrimitives(list, { x: px, y: py, labels }))}</g>`;
}

// ───────────────────────── view marks (cutting lines, detail circles) and new view kinds

const sectionLabel = (v, labels) => `${labels['drawing.section'] ?? 'SECTION'} ${v.label ?? 'A'}-${v.label ?? 'A'}`;
function viewLabelText(v, labels, scale) {
  if (v.kind === 'section') return sectionLabel(v, labels);
  if (v.kind === 'detail') return `${labels['drawing.detail'] ?? 'DETAIL'} ${v.label ?? 'B'} (${scaleLabel(scale * viewMult(v))})`;
  if (v.type === 'custom') return v.label ? `${labels['drawing.view'] ?? 'VIEW'} ${v.label}-${v.label}` : (labels['view.custom'] ?? 'Auxiliary view');
  return labels[`view.${v.type}`] ?? v.type;
}

/** Sheet position of a model 2D point (y up) of a view. */
const sheetMap = (p, place, s) => { const cx = (p.box.x0 + p.box.x1) / 2; const cy = (p.box.y0 + p.box.y1) / 2; return ([X, Y]) => [place.cx + (X - cx) * s, place.cy + (cy - Y) * s]; };

/** Marks drawn on view `v` for the section and detail views that name it as their parent. */
function parentMarks(drawing, v, p, place, scale, labels) {
  const out = [];
  const s = scale * viewMult(v);
  const map = sheetMap(p, place, s);
  const basis = v.kind === 'detail' ? null : (p.basis ?? viewBasis(v));
  for (const w of drawing.views) {
    if (w.parent !== v.id || w.id === v.id) continue;
    const letter = String(w.label ?? (w.kind === 'section' ? 'A' : 'B'));
    if (w.kind === 'detail') {
      const c = pt2(w.center) ?? [(p.box.x0 + p.box.x1) / 2, (p.box.y0 + p.box.y1) / 2];
      const r = Number(w.radius) > 0 ? Number(w.radius) : Math.max(1e-3, 0.25 * Math.min(p.box.x1 - p.box.x0, p.box.y1 - p.box.y0));
      const C = map(c); const rs = r * s;
      out.push({ t: 'circle', c: C, r: rs, cls: 'detail-circle' }, { t: 'text', x: C[0] + rs * 0.72 + 1.5, y: C[1] - rs * 0.72 - 1.5, text: letter, size: 4.2, bold: true, anchor: 'start' });
    } else if (w.kind === 'section' && w.aligned && basis) {
      out.push(...alignedCutMarks(w, p, map, s, basis, letter));
    } else if (w.kind === 'section' && basis) {
      const n = unit3(vec3(w.plane?.normal) ?? worldFront()) ?? worldFront();
      if (Math.abs(dot3(n, basis.dir)) > 1e-3) continue; // the plane is not seen edge-on in this view
      const P = vec3(w.plane?.point) ?? [0, 0, 0];
      const ld = cross3(n, basis.dir);
      const p2 = [dot3(P, basis.x), dot3(P, basis.y)];
      const d2 = unit2([dot3(ld, basis.x), dot3(ld, basis.y)]);
      const m = 5 / s;
      const bx = [p.box.x0 - m, p.box.x1 + m]; const by = [p.box.y0 - m, p.box.y1 + m];
      let t0 = -Infinity; let t1 = Infinity;
      for (const [o, dd, [lo, hi]] of [[p2[0], d2[0], bx], [p2[1], d2[1], by]]) {
        if (Math.abs(dd) < 1e-12) { if (o < lo || o > hi) { t0 = Infinity; } continue; }
        const a1 = (lo - o) / dd; const a2 = (hi - o) / dd;
        t0 = Math.max(t0, Math.min(a1, a2)); t1 = Math.min(t1, Math.max(a1, a2));
      }
      if (!(t1 > t0)) continue;
      const E1 = map([p2[0] + d2[0] * t0, p2[1] + d2[1] * t0]); const E2 = map([p2[0] + d2[0] * t1, p2[1] + d2[1] * t1]);
      const along = unit2(sub2(E2, E1));
      const vd = unit2([dot3(n, basis.x) * -1, -(dot3(n, basis.y) * -1)]); // viewing direction (−normal) on the sheet
      out.push({ t: 'poly', pts: [E1, E2], cls: 'cut-line' });
      for (const [E, sign] of [[E1, 1], [E2, -1]]) {
        out.push({ t: 'poly', pts: [E, add2(E, along, sign * 5)], cls: 'cut-end' });
        const tail = add2(E, vd, -7);
        out.push({ t: 'poly', pts: [tail, add2(E, vd, -2.4)], cls: 'ann-line' }, arrowHead(E, vd, 2.6, 0.9));
        const lp = add2(tail, vd, -2.2);
        out.push({ t: 'text', x: lp[0], y: lp[1] + 1.5, text: letter, size: 4.2, bold: true, anchor: 'middle' });
      }
    }
  }
  return out;
}

/** The cutting line of an aligned section: two legs from the pivot to the view's box, arrows on each leg's end. */
function alignedCutMarks(w, p, map, s, basis, letter) {
  const L = alignedLegs(w);
  const out = [];
  const P2 = [dot3(L.pivot, basis.x), dot3(L.pivot, basis.y)];
  const m = 5 / s;
  const bx = [p.box.x0 - m, p.box.x1 + m]; const by = [p.box.y0 - m, p.box.y1 + m];
  const legEnd = (u) => {
    const d2 = unit2([dot3(u, basis.x), dot3(u, basis.y)]);
    let t1 = Infinity;
    for (const [o, dd, [lo, hi]] of [[P2[0], d2[0], bx], [P2[1], d2[1], by]]) { if (Math.abs(dd) < 1e-12) continue; t1 = Math.min(t1, Math.max((lo - o) / dd, (hi - o) / dd)); }
    return Number.isFinite(t1) && t1 > 0 ? map([P2[0] + d2[0] * t1, P2[1] + d2[1] * t1]) : null;
  };
  const C = map(P2);
  for (const [u, n] of [[L.u1, L.n1], [L.u2, L.n2]]) {
    const E = legEnd(u);
    if (!E) continue;
    out.push({ t: 'poly', pts: [C, E], cls: 'cut-line' });
    const along = unit2(sub2(E, C));
    out.push({ t: 'poly', pts: [E, add2(E, along, -5)], cls: 'cut-end' });
    const vd = unit2([-dot3(n, basis.x), dot3(n, basis.y)]);
    const tail = add2(E, vd, -7);
    out.push({ t: 'poly', pts: [tail, add2(E, vd, -2.4)], cls: 'ann-line' }, arrowHead(E, vd, 2.6, 0.9));
    const lp = add2(tail, vd, -2.2);
    out.push({ t: 'text', x: lp[0], y: lp[1] + 1.5, text: letter, size: 4.2, bold: true, anchor: 'middle' });
  }
  // The bend of the cutting line: a thick mark at the pivot.
  out.push({ t: 'poly', pts: [add2(C, unit2(sub2(legEnd(L.u1) ?? C, C)), 2.5), C, add2(C, unit2(sub2(legEnd(L.u2) ?? C, C)), 2.5)], cls: 'cut-end' });
  return out;
}

/** Section hatching of a projection in path coordinates, for a view drawn at sheet scale `s`. */
const hatchOf = (p, s, v) => (p.section?.triangles?.length ? hatchSegments(p.section.triangles, (Number(v.hatchSpacing) > 0 ? Number(v.hatchSpacing) : 2.5) / s, Number(v.hatchAngle) || 45) : []);

/** Clips a segment (path coordinates) to a circle: the inside part or null. */
function clipSegmentCircle(a, b, c, r) {
  const d = sub2(b, a); const f = sub2(a, c);
  const A = d[0] * d[0] + d[1] * d[1];
  if (A < 1e-18) return Math.hypot(f[0], f[1]) <= r ? [a, b] : null;
  const B = 2 * (f[0] * d[0] + f[1] * d[1]); const C = f[0] * f[0] + f[1] * f[1] - r * r;
  const disc = B * B - 4 * A * C;
  if (disc <= 0) return null;
  const sq = Math.sqrt(disc);
  const t0 = Math.max(0, (-B - sq) / (2 * A)); const t1 = Math.min(1, (-B + sq) / (2 * A));
  if (t1 <= t0) return null;
  return [add2(a, d, t0), add2(a, d, t1)];
}

function newKindViewSvg(drawing, v, p, place, scale, labels, selected) {
  const s = scale * viewMult(v);
  const cx = (p.box.x0 + p.box.x1) / 2; const cy = (p.box.y0 + p.box.y1) / 2;
  const t = `translate(${place.cx} ${place.cy}) scale(${s}) translate(${-cx} ${cy})`;
  const isSection = v.kind === 'section';
  const hiddenOn = drawing.showHidden !== false && (isSection ? v.hidden === true : v.hidden !== false);
  const w = (p.box.x1 - p.box.x0) * s; const h = (p.box.y1 - p.box.y0) * s;
  const hatch = hatchOf(p, s, v);
  const hatchSvg = hatch.length ? `<path d="${hatch.map((q) => `M ${n2(q[0])} ${n2(q[1])} L ${n2(q[2])} ${n2(q[3])}`).join(' ')}" class="hatch" vector-effect="non-scaling-stroke"/>` : '';
  const lines = `${hiddenOn ? p.hidden.map((d) => `<path d="${d}" class="hidden-line" vector-effect="non-scaling-stroke"/>`).join('') : ''}${hatchSvg}${p.visible.map((d) => `<path d="${d}" class="visible-line" vector-effect="non-scaling-stroke"/>`).join('')}${threadMarksSvg(p, hiddenOn)}`;
  let inner = lines; let outline = '';
  if (p.detail) {
    const id = `clip-${idSafe(drawing.id)}-${idSafe(v.id)}`;
    const [dx, dy] = p.detail.center;
    inner = `<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><circle cx="${n2(dx)}" cy="${n2(-dy)}" r="${n2(p.detail.radius)}"/></clipPath><g clip-path="url(#${id})">${lines}</g>`;
    outline = `<circle cx="${n2(place.cx)}" cy="${n2(place.cy)}" r="${n2(p.detail.radius * s)}" class="detail-border"/>`;
  }
  const dims = drawing.showDims !== false && !p.detail ? viewDimensions(p, place, s) : '';
  const labelY = place.cy + h / 2 + (drawing.showDims === false || p.detail ? 9 : 19);
  const marks = primitivesSvg(parentMarks(drawing, v, p, place, scale, labels));
  return `<g class="view view-${v.kind ?? v.type} ${selected === v.id ? 'selected' : ''}" data-view="${esc(v.id)}">
      <rect x="${place.cx - w / 2 - 4}" y="${place.cy - h / 2 - 4}" width="${w + 8}" height="${h + 8}" class="view-box"/>
      <g transform="${t}">${inner}</g>${outline}
      ${dims}
      <text x="${place.cx}" y="${labelY}" class="view-label view-label-strong" text-anchor="middle">${esc(viewLabelText(v, labels, scale))}</text>${marks}
    </g>`;
}

const EXTRA_CSS = `<style>
    .hatch{fill:none;stroke:#000;stroke-width:.18}.detail-border{fill:none;stroke:#000;stroke-width:.25}
    .detail-circle{fill:none;stroke:#000;stroke-width:.35}.cut-line{fill:none;stroke:#000;stroke-width:.25;stroke-dasharray:10 1.5 2 1.5}
    .cut-end{fill:none;stroke:#000;stroke-width:.7}.view-label-strong{font-weight:bold}
    .ann-line,.ann-frame{fill:none;stroke:#000;stroke-width:.25;stroke-linejoin:round;stroke-linecap:round}.ann-fill{fill:#000;stroke:none}
    .ann-text{font-family:Roboto,"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif;fill:#000}.ann-bold{font-weight:bold}
    .annotation.selected .ann-line,.annotation.selected .ann-frame{stroke:#1e88e5}.annotation.selected .ann-fill{fill:#1e88e5}.annotation.selected .ann-text{fill:#1e88e5}
    .ann-cloud,.ann-hatch{fill:none;stroke:#000;stroke-width:.25;stroke-linejoin:round}.ann-phantom{fill:none;stroke:#000;stroke-width:.2;stroke-dasharray:3 1}.ann-solid{fill:#000;fill-opacity:.35;stroke:none}
    .annotation.selected .ann-cloud,.annotation.selected .ann-hatch,.annotation.selected .ann-phantom{stroke:#1e88e5}
    .bom-frame{fill:none;stroke:#000;stroke-width:.5}.bom-grid{fill:none;stroke:#000;stroke-width:.2}
  </style>`;

/** Cosmetic thread marks of a view (thin lines and three-quarter circles, the thick thread limit, hidden threads). */
const THREAD_CSS = `
  <style>.phantom-line{fill:none;stroke:#000;stroke-width:.25;stroke-dasharray:8 1.2 1.2 1.2 1.2 1.2}.bend-line{fill:none;stroke:#000;stroke-width:.25}.bend-up{stroke-dasharray:6 1.5 1.5 1.5}.bend-down{stroke-dasharray:2 1.5}.cross-break{fill:none;stroke:#000;stroke-width:.18}.thread-line{fill:none;stroke:#000;stroke-width:.25}.thread-limit{fill:none;stroke:#000;stroke-width:.5}.thread-hidden{fill:none;stroke:#555;stroke-width:.25;stroke-dasharray:2 1.2}</style>`;

function threadMarksSvg(p, hiddenOn) {
  const extra = [...(p.phantom ?? []).map((d) => `<path d="${d}" class="phantom-line" vector-effect="non-scaling-stroke"/>`), ...(p.bendLines?.up ?? []).map((d) => `<path d="${d}" class="bend-line bend-up" vector-effect="non-scaling-stroke"/>`), ...(p.bendLines?.down ?? []).map((d) => `<path d="${d}" class="bend-line bend-down" vector-effect="non-scaling-stroke"/>`), ...(p.bendLines?.cross ?? []).map((d) => `<path d="${d}" class="cross-break" vector-effect="non-scaling-stroke"/>`)].join('');
  return extra + threadMarksOnly(p, hiddenOn);
}

function threadMarksOnly(p, hiddenOn) {
  const t = p.threads;
  if (!t) return '';
  const path = (cls) => (d) => `<path d="${d}" class="${cls}" vector-effect="non-scaling-stroke"/>`;
  return [...(t.thin ?? []).map(path('thread-line')), ...(t.thick ?? []).map(path('thread-limit')), ...(hiddenOn ? (t.hidden ?? []).map(path('thread-hidden')) : [])].join('');
}

/**
 * The drawing sheet as SVG (units: mm). `projections` (view id → projectView()), `labels` (texts in the UI
 * language: view names, title block field names), `info` (part name, material, mass …), `selected` (a view
 * or annotation id), `bomRows` (bomRows() of the assembly, drawn when `drawing.bom.show`).
 */
export function drawingSvg(drawing, projections, { labels = {}, info = {}, selected = null, bomRows: bom = null } = {}) {
  const [W, H] = SHEETS[drawing.sheet] ?? SHEETS.A3;
  const { scale, places } = layoutViews(drawing, projections);
  const resolve = projectionResolver(drawing, projections);
  let fancy = false;
  const views = [];
  for (const v of drawing.views) {
    const p = resolve(v);
    const place = places.get(v.id);
    if (!p || !place) continue;
    if (!isPlainView(v)) { fancy = true; views.push(newKindViewSvg(drawing, v, p, place, scale, labels, selected)); continue; }
    const cx = (p.box.x0 + p.box.x1) / 2; const cy = (p.box.y0 + p.box.y1) / 2;
    // Paths are y-down already: the view's centre (cx, −cy) goes to the place.
    const t = `translate(${place.cx} ${place.cy}) scale(${scale}) translate(${-cx} ${cy})`;
    const hiddenOn = drawing.showHidden !== false && v.hidden !== false && v.type !== 'iso' && v.type !== 'dimetric';
    const w = (p.box.x1 - p.box.x0) * scale; const h = (p.box.y1 - p.box.y0) * scale;
    const marks = primitivesSvg(parentMarks(drawing, v, p, place, scale, labels));
    if (marks) fancy = true;
    views.push(`<g class="view ${selected === v.id ? 'selected' : ''}" data-view="${esc(v.id)}">
      <rect x="${place.cx - w / 2 - 4}" y="${place.cy - h / 2 - 4}" width="${w + 8}" height="${h + 8}" class="view-box"/>
      <g transform="${t}">
        ${hiddenOn ? p.hidden.map((d) => `<path d="${d}" class="hidden-line" vector-effect="non-scaling-stroke"/>`).join('') : ''}
        ${p.visible.map((d) => `<path d="${d}" class="visible-line" vector-effect="non-scaling-stroke"/>`).join('')}${threadMarksSvg(p, hiddenOn)}
      </g>
      ${drawing.showDims !== false && v.type !== 'iso' && v.type !== 'dimetric' ? viewDimensions(p, place, scale) : ''}
      <text x="${place.cx}" y="${place.cy + h / 2 + (v.type === 'iso' || v.type === 'dimetric' || drawing.showDims === false ? 9 : 19)}" class="view-label" text-anchor="middle">${esc(labels[`view.${v.type}`] ?? v.type)}</text>${marks}
    </g>`);
  }
  const extras = [];
  const annotations = Array.isArray(drawing.annotations) ? drawing.annotations : [];
  if (annotations.length) extras.push(`<g class="annotations">${annotations.map((a) => annotationSvg(a, { scale, selected: selected != null && a?.id === selected })).join('')}</g>`);
  if (drawing.bom?.show && Array.isArray(bom)) extras.push(bomSvg(bom, { x: drawing.bom.x, y: drawing.bom.y, labels, sheet: drawing.sheet }));
  if (extras.length) fancy = true;
  const title = drawing.title ?? {};
  const tb = titleBlock(W, H, { ...title, name: info.name ?? drawing.name, material: info.material ?? '', mass: info.mass ?? '', scale: scaleLabel(scale), sheet: drawing.sheet, projection: drawing.projection }, labels);
  return `<svg xmlns="http://www.w3.org/2000/svg" class="drawing-sheet" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm">
  <style>
    .sheet-bg{fill:#fff}.frame{fill:none;stroke:#000;stroke-width:.7}.frame-thin{fill:none;stroke:#000;stroke-width:.25}
    .visible-line{fill:none;stroke:#000;stroke-width:.5;stroke-linejoin:round;stroke-linecap:round}
    .hidden-line{fill:none;stroke:#555;stroke-width:.3;stroke-dasharray:2 1.2}
    .view-box{fill:transparent;stroke:none}.view.selected .view-box{stroke:#1e88e5;stroke-width:.4;stroke-dasharray:2 1}
    .view-label{font:3.2px Roboto,"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif;fill:#000}.dim-line,.dim-ext{stroke:#000;stroke-width:.18;fill:none}.dim-arrow{fill:#000}
    .dim-text{font:3.2px Roboto,"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif;fill:#000}.tb-label{font:2.2px Roboto,"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif;fill:#444}.tb-value{font:3.4px Roboto,"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif;fill:#000}.tb-title{font:bold 5px Roboto,"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif;fill:#000}
  </style>${fancy ? EXTRA_CSS : ''}${[...projections.values()].some((x) => x?.threads) ? THREAD_CSS : ''}
  <rect class="sheet-bg" x="0" y="0" width="${W}" height="${H}"/>
  <rect class="frame" x="10" y="10" width="${W - 20}" height="${H - 20}"/>
  ${zoneMarks(W, H)}
  ${views.join('\n')}
  ${tb}${extras.join('\n')}
</svg>`;
}

function zoneMarks(W, H) {
  const out = [];
  const cols = Math.round((W - 20) / 50); const rows = Math.round((H - 20) / 50);
  for (let i = 1; i < cols; i++) { const x = 10 + ((W - 20) * i) / cols; out.push(`<line x1="${x}" y1="10" x2="${x}" y2="13" class="frame-thin"/><line x1="${x}" y1="${H - 13}" x2="${x}" y2="${H - 10}" class="frame-thin"/>`); }
  for (let i = 1; i < rows; i++) { const y = 10 + ((H - 20) * i) / rows; out.push(`<line x1="10" y1="${y}" x2="13" y2="${y}" class="frame-thin"/><line x1="${W - 13}" y1="${y}" x2="${W - 10}" y2="${y}" class="frame-thin"/>`); }
  return out.join('');
}

function titleBlock(W, H, t, labels) {
  const w = 180; const h = 40; const x = W - 10 - w; const y = H - 10 - h;
  const L = (k, fallback) => esc(labels[`title.${k}`] ?? fallback);
  const cell = (cx, cy, cw, ch, label, value, big = false) => `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" class="frame-thin"/><text x="${cx + 1.2}" y="${cy + 2.8}" class="tb-label">${label}</text><text x="${cx + 1.2}" y="${cy + ch - 1.6}" class="${big ? 'tb-title' : 'tb-value'}">${esc(value)}</text>`;
  // Projection symbol (truncated cone): third angle has the circles on the right.
  const sx = x + 150; const sy = y + 28;
  const cone = `<g transform="translate(${sx} ${sy})"><path d="M 0 -3 L 9 -5 L 9 5 L 0 3 Z" class="frame-thin"/><circle cx="${t.projection === 'first' ? -6 : 18}" cy="0" r="5" class="frame-thin"/><circle cx="${t.projection === 'first' ? -6 : 18}" cy="0" r="2.6" class="frame-thin"/></g>`;
  return `<g class="title-block">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" class="frame"/>
    ${cell(x, y, 110, 14, L('name', 'Title'), t.name, true)}
    ${cell(x + 110, y, 70, 14, L('partNo', 'Part no.'), t.partNo)}
    ${cell(x, y + 14, 55, 13, L('material', 'Material'), t.material)}
    ${cell(x + 55, y + 14, 55, 13, L('mass', 'Mass'), t.mass)}
    ${cell(x + 110, y + 14, 35, 13, L('scale', 'Scale'), t.scale)}
    ${cell(x + 145, y + 14, 35, 13, L('sheet', 'Sheet'), t.sheet)}
    ${cell(x, y + 27, 37, 13, L('drawnBy', 'Drawn'), t.drawnBy)}
    ${cell(x + 37, y + 27, 37, 13, L('checkedBy', 'Checked'), t.checkedBy)}
    ${cell(x + 74, y + 27, 36, 13, L('date', 'Date'), t.date)}
    ${cell(x + 110, y + 27, 25, 13, L('revision', 'Rev.'), t.revision)}
    <rect x="${x + 135}" y="${y + 27}" width="45" height="13" class="frame-thin"/>${cone}
    ${t.company ? `<text x="${x + 2}" y="${y - 2}" class="tb-label">${esc(t.company)}</text>` : ''}
  </g>`;
}

// ───────────────────────── DXF

/** SVG path data (M, L, H, V, C, Q, A, Z — absolute) → polylines [[x, y], …]. Curves are flattened. */
export function pathPolylines(d) {
  const tokens = String(d).match(/[MLHVCQAZmlhvcqaz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const out = [];
  let cur = null; let x = 0; let y = 0; let sx = 0; let sy = 0; let cmd = null; let i = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    switch (cmd) {
      case 'M': x = num(); y = num(); sx = x; sy = y; cur = [[x, y]]; out.push(cur); cmd = 'L'; break;
      case 'L': x = num(); y = num(); cur?.push([x, y]); break;
      case 'H': x = num(); cur?.push([x, y]); break;
      case 'V': y = num(); cur?.push([x, y]); break;
      case 'C': {
        const [x1, y1, x2, y2, x3, y3] = [num(), num(), num(), num(), num(), num()];
        for (let k = 1; k <= 12; k++) { const t = k / 12; const u = 1 - t; cur?.push([u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3]); }
        x = x3; y = y3; break;
      }
      case 'Q': {
        const [x1, y1, x2, y2] = [num(), num(), num(), num()];
        for (let k = 1; k <= 8; k++) { const t = k / 8; const u = 1 - t; cur?.push([u * u * x + 2 * u * t * x1 + t * t * x2, u * u * y + 2 * u * t * y1 + t * t * y2]); }
        x = x2; y = y2; break;
      }
      case 'A': {
        const rx = num(); num(); num(); num(); num(); const ex = num(); const ey = num();
        void rx; cur?.push([ex, ey]); x = ex; y = ey; break;
      }
      case 'Z': case 'z': cur?.push([sx, sy]); x = sx; y = sy; cmd = null; break;
      default: i++;
    }
  }
  return out.filter((p) => p.length > 1);
}

/**
 * The sheet as a DXF file (sheet mm, y up): views as LINE entities on VISIBLE / HIDDEN layers, section hatching
 * on HATCH, and annotations, the BOM, view labels of section / detail / auxiliary views, cutting lines and
 * detail circles on NOTES (LINE, CIRCLE, SOLID and TEXT). The extra layers are declared only when used.
 */
export function drawingDxf(drawing, projections, { labels = {}, bomRows: bom = null } = {}) {
  const [, H] = SHEETS[drawing.sheet] ?? SHEETS.A3;
  const { scale, places } = layoutViews(drawing, projections);
  const resolve = projectionResolver(drawing, projections);
  const lines = [];
  const add = (layer, a, b) => lines.push(`0\nLINE\n8\n${layer}\n10\n${a[0].toFixed(4)}\n20\n${a[1].toFixed(4)}\n30\n0\n11\n${b[0].toFixed(4)}\n21\n${b[1].toFixed(4)}\n31\n0`);
  const notes = [];
  const dimEnts = [];
  let hatched = false;
  let threaded = false;
  let phantomed = false;
  let bent = false;
  for (const v of drawing.views) {
    const p = resolve(v); const place = places.get(v.id);
    if (!p || !place) continue;
    const plain = isPlainView(v);
    const s = scale * viewMult(v);
    const cx = (p.box.x0 + p.box.x1) / 2; const cy = (p.box.y0 + p.box.y1) / 2;
    // SVG (y down) → sheet (y up): X = place.cx + (x − cx)·s, Y = H − (place.cy + (y + cy)·s).
    const map = ([x, y]) => [place.cx + (x - cx) * s, H - (place.cy + (y + cy) * s)];
    const clip = p.detail ? (a, b) => clipSegmentCircle(a, b, [p.detail.center[0], -p.detail.center[1]], p.detail.radius) : (a, b) => [a, b];
    const seg = (layer, a, b) => { const c = clip(a, b); if (c) add(layer, map(c[0]), map(c[1])); };
    const emit = (layer, list) => { for (const d of list) for (const poly of pathPolylines(d)) for (let k = 1; k < poly.length; k++) seg(layer, poly[k - 1], poly[k]); };
    emit('VISIBLE', p.visible);
    if (p.phantom?.length) { emit('PHANTOM', p.phantom); phantomed = true; }
    if (p.bendLines?.up?.length || p.bendLines?.down?.length || p.bendLines?.cross?.length) { emit('BENDS', [...(p.bendLines.up ?? []), ...(p.bendLines.down ?? []), ...(p.bendLines.cross ?? [])]); bent = true; }
    if (p.threads) {
      emit('THREADS', p.threads.thin ?? []); emit('VISIBLE', p.threads.thick ?? []);
      if (drawing.showHidden !== false && v.hidden !== false) emit('HIDDEN', p.threads.hidden ?? []);
      if (p.threads.thin?.length) threaded = true;
    }
    if (plain) { if (drawing.showHidden !== false && v.hidden !== false && v.type !== 'iso' && v.type !== 'dimetric') emit('HIDDEN', p.hidden); } else if (drawing.showHidden !== false && (v.kind === 'section' ? v.hidden === true : v.hidden !== false)) emit('HIDDEN', p.hidden);
    if (!plain) {
      for (const q of hatchOf(p, s, v)) { hatched = true; seg('HATCH', [q[0], q[1]], [q[2], q[3]]); }
      const h = (p.box.y1 - p.box.y0) * s;
      const prims = [{ t: 'text', x: place.cx, y: place.cy + h / 2 + (drawing.showDims === false || p.detail ? 9 : 19), text: viewLabelText(v, labels, scale), size: 3.2, anchor: 'middle' }];
      if (p.detail) prims.push({ t: 'circle', c: [place.cx, place.cy], r: p.detail.radius * s });
      notes.push(...primitivesDxf(prims, H));
    }
    const marks = parentMarks(drawing, v, p, place, scale, labels);
    if (marks.length) notes.push(...primitivesDxf(marks, H));
    // The overall dimensions the sheet shows under and left of the view.
    if (drawing.showDims !== false && (plain ? v.type !== 'iso' && v.type !== 'dimetric' : !p.detail)) dimEnts.push(...primitivesDxf(viewDimensionPrims(p, place, s), H, 'DIMENSIONS'));
  }
  for (const a of Array.isArray(drawing.annotations) ? drawing.annotations : []) notes.push(...primitivesDxf(annotationPrimitives(a, { scale }), H));
  if (drawing.bom?.show && Array.isArray(bom)) {
    const def = bomPlacement(bom, drawing.sheet);
    notes.push(...primitivesDxf(bomPrimitives(bom, { x: Number.isFinite(drawing.bom.x) ? drawing.bom.x : def.x, y: Number.isFinite(drawing.bom.y) ? drawing.bom.y : def.y, labels }), H));
  }
  const [W] = SHEETS[drawing.sheet] ?? SHEETS.A3;
  for (const [a, b] of [[[10, 10], [W - 10, 10]], [[W - 10, 10], [W - 10, H - 10]], [[W - 10, H - 10], [10, H - 10]], [[10, H - 10], [10, 10]]]) add('BORDER', a, b);
  // The frame's zone marks on their own layer (BORDER stays the four frame lines).
  const zones = zoneMarkLines(W, H);
  for (const [a, b] of zones) add('ZONES', [a[0], H - a[1]], [b[0], H - b[1]]);
  const names = ['VISIBLE', 'HIDDEN', 'BORDER'];
  const colors = [7, 8, 7];
  if (zones.length) { names.push('ZONES'); colors.push(7); }
  if (hatched) { names.push('HATCH'); colors.push(8); }
  if (threaded) { names.push('THREADS'); colors.push(7); }
  if (phantomed) { names.push('PHANTOM'); colors.push(9); }
  if (bent) { names.push('BENDS'); colors.push(3); }
  if (notes.length) { names.push('NOTES'); colors.push(7); }
  if (dimEnts.length) { names.push('DIMENSIONS'); colors.push(7); notes.push(...dimEnts); }
  const layers = names.map((name, i) => `0\nLAYER\n2\n${name}\n70\n0\n62\n${colors[i]}\n6\n${name === 'HIDDEN' ? 'HIDDEN' : 'CONTINUOUS'}`).join('\n');
  const entities = notes.length ? [...lines, ...notes] : lines;
  return `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n${names.length}\n${layers}\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${entities.join('\n')}\n0\nENDSEC\n0\nEOF\n`;
}
