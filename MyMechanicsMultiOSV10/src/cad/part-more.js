// More part-modelling features: multi-body tools (combine, delete / keep body, indent, flex, deform),
// reference geometry (axis, point, coordinate system), fillet variants (variable radius, face fillet,
// full round), more patterns (curve-, sketch- and table-driven, fill, variable), curves (projected,
// split line, composite, through XYZ points). Built by regenerate() in features.js like the others; each
// builder returns { body?, tool?, curve?, … }.
//
// Flex and Deform rebuild the body as a fine faceted solid (its triangles moved one by one, then sewn):
// an approximation of the smooth result, but a real closed solid that later features can cut and join.
import { buildOpenScad } from './openscad-feature.js';
import { silhouetteTools, planeTool, splitFace } from './split-line-more.js';
import { buildFastening } from './fastening.js';
import { buildSurfaceMore } from './surface-more.js';
import { buildSheetExtra } from './sheet-extra.js';
import { buildPartExtra } from './part-extra.js';
import { rep } from './kernel.js';
import { byId, profiles, standalonePoints } from './sketch.js';
import { findEdges, findFace, planeOfFace, crossV, normalize, isCylinder } from './refs.js';
import { buildSurfaceSpline } from './surface-spline.js';
import { sketchOf, sizeAround, codeError, resolvePlane, toWorld, AXES, regenerate, frame as makeFrame, STD_PLANES } from './features.js';
import { sketchWire, circleOfEdge } from './advanced.js';
import { worldUp, worldFront } from './frame.js';
import { makeHelixStable, makeCylinderStable, makeCircleStable } from './oriented.js';

export { PART_MORE_TYPES, PART_MORE_DEFAULTS, PART_MORE_NAMES, PART_MORE_ICONS, CURVE_TYPES } from './part-more-types.js';


const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const vec = (v) => (Array.isArray(v) ? v : [v.x, v.y, v.z]);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const DIRS = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1], '-x': [-1, 0, 0], '-y': [0, -1, 0], '-z': [0, 0, -1] };

export function buildPartMore(f, ctx) {
  switch (f.type) {
    case 'openscad': return buildOpenScad(f, ctx);
    case 'mountingBoss': case 'snapHook': case 'snapHookGroove': case 'vent': case 'lipGroove': return buildFastening(f, ctx);
    case 'surfaceSweep': case 'cutWithSurface': case 'deleteHole': case 'untrimSurface': case 'midSurface': case 'radiateSurface': case 'flattenSurface': return buildSurfaceMore(f, ctx);
    case 'convertSheet': case 'insertBends': case 'rip': case 'unfold': case 'fold': case 'crossBreak': case 'weldedCorner': case 'tabSlot': return buildSheetExtra(f, ctx);
    case 'advancedHole': case 'intersect': case 'mateReference': case 'moveFace': case 'connectionPoint': return buildPartExtra(f, ctx);
    case 'combine': return buildCombine(f, ctx);
    case 'deleteBody': return buildDeleteBody(f, ctx);
    case 'indent': return buildIndent(f, ctx);
    case 'flex': return buildFlex(f, ctx);
    case 'deform': return buildDeform(f, ctx);
    case 'refAxis': return buildRefAxis(f, ctx);
    case 'refPoint': return buildRefPoint(f, ctx);
    case 'boundingBox': return buildBoundingBox(f, ctx);
    case 'coordSys': return buildCoordSys(f, ctx);
    case 'variableFillet': return buildVariableFillet(f, ctx);
    case 'faceFillet': return buildFaceFillet(f, ctx);
    case 'fullRoundFillet': return buildFullRound(f, ctx);
    case 'curvePattern': return buildCurvePattern(f, ctx);
    case 'sketchPattern': return buildSketchPattern(f, ctx);
    case 'tablePattern': return buildTablePattern(f, ctx);
    case 'fillPattern': return buildFillPattern(f, ctx);
    case 'variablePattern': return buildVariablePattern(f, ctx);
    case 'projectedCurve': return buildProjectedCurve(f, ctx);
    case 'splitLine': return buildSplitLine(f, ctx);
    case 'compositeCurve': return buildCompositeCurve(f, ctx);
    case 'curveXYZ': return buildCurveXYZ(f);
    case 'surfaceSpline': return buildSurfaceSpline(f, ctx);
    default: throw codeError('unknown-feature', { type: f.type });
  }
}

// ───────────────────────── bodies

/** The solid bodies of a shape (a compound of several, one solid, or none). */
export function solidsOf(shape) {
  const R = rep();
  if (!shape) return [];
  try {
    return [...R.iterTopo(shape.wrapped, 'solid')].map((s) => R.cast(s));
  } catch { return [shape]; }
}

/** How many solid bodies a shape has. */
export const countSolids = (shape) => (shape ? solidsOf(shape).length : 0);

const bodyOf = (list) => { const R = rep(); return !list.length ? null : list.length === 1 ? list[0] : R.makeCompound(list); };
const index = (v, n) => { const i = Math.round(num(v, -1)); return i >= 0 && i < n ? i : -1; };

/** Combine: the main body joined with (add), cut by (subtract) or intersected with (common) the others. */
function buildCombine(f, ctx) {
  const solids = solidsOf(ctx.body);
  if (solids.length < 2) throw codeError('needs-two-bodies');
  const main = index(f.main ?? 0, solids.length);
  if (main < 0) throw codeError('body-missing');
  let tools = (f.bodies ?? []).map((i) => index(i, solids.length)).filter((i) => i >= 0 && i !== main);
  if (!tools.length) tools = solids.map((_, i) => i).filter((i) => i !== main);
  let out = solids[main].clone();
  for (const i of tools) {
    const s = solids[i].clone();
    out = f.op === 'subtract' ? out.cut(s) : f.op === 'common' ? out.intersect(s) : out.fuse(s);
  }
  const rest = solids.filter((_, i) => i !== main && !tools.includes(i)).map((s) => s.clone());
  const kept = countSolids(out) ? [out] : [];
  if (!kept.length && !rest.length) throw codeError('empty-result');
  return { body: bodyOf([...kept, ...rest]), bodies: kept.length + rest.length };
}

/** Delete / keep bodies: the listed bodies go (delete) or are the only ones left (keep). */
function buildDeleteBody(f, ctx) {
  const solids = solidsOf(ctx.body);
  if (!solids.length) throw codeError('no-body');
  const picked = new Set((f.bodies ?? []).map((i) => index(i, solids.length)).filter((i) => i >= 0));
  if (!picked.size) throw codeError('body-missing');
  const left = solids.filter((_, i) => (f.mode === 'keep' ? picked.has(i) : !picked.has(i))).map((s) => s.clone());
  return { body: bodyOf(left), bodies: left.length };
}

/**
 * Indent: the tool body is pressed into the target. The target gains a wall of `thickness` around the tool
 * on the far side (where the tool reaches through it) and loses the tool's shape grown by `clearance`.
 * The added wall stops at the target's near face (the side the tool comes from).
 */
function buildIndent(f, ctx) {
  const R = rep();
  const solids = solidsOf(ctx.body);
  if (solids.length < 2) throw codeError('needs-two-bodies');
  const ti = index(f.target ?? 0, solids.length); const ki = index(f.toolBody ?? 1, solids.length);
  if (ti < 0 || ki < 0 || ti === ki) throw codeError('body-missing');
  const target = solids[ti]; const tool = solids[ki];
  const t = Math.max(0.01, num(f.thickness, 1)); const c = Math.max(0, num(f.clearance, 0));
  const grow = (s, d) => (d > 1e-9 ? R.makeOffset(s.clone(), d) : s.clone());
  const [lo, hi] = target.boundingBox.bounds;
  const [tlo, thi] = tool.boundingBox.bounds;
  const centre = mul(add(tlo, thi), 0.5);
  // The side the tool comes from: the axis where its centre is furthest outside the target's box.
  let best = null;
  for (let k = 0; k < 3; k++) {
    const size = Math.max(1e-9, hi[k] - lo[k]);
    const out = centre[k] > hi[k] ? (centre[k] - hi[k]) / size : centre[k] < lo[k] ? (lo[k] - centre[k]) / size : 0;
    if (out > 0 && (!best || out > best.out)) best = { k, out, side: centre[k] > hi[k] ? 1 : -1 };
  }
  let wall = grow(tool, c + t);
  if (best) {
    const big = sizeAround(ctx) * 4;
    const keepLo = lo.map((v) => v - big); const keepHi = hi.map((v) => v + big);
    if (best.side > 0) keepHi[best.k] = hi[best.k]; else keepLo[best.k] = lo[best.k];
    wall = wall.intersect(R.makeBox(keepLo, keepHi));
  }
  const pressed = target.clone().fuse(wall).cut(grow(tool, c));
  const others = solids.filter((_, i) => i !== ti && (i !== ki || f.keepTool)).map((s) => s.clone());
  return { body: bodyOf([pressed, ...others]), bodies: 1 + others.length };
}

// ───────────────────────── flex and deform (faceted)

/**
 * The body as a triangle mesh with no edge longer than `h` (shared vertices merged), at most `maxTris`.
 * Returns { verts: [[x,y,z]], tris: [[i,j,k]] } with the kernel's outward orientation.
 */
export function fineMesh(body, h, maxTris = 3000) {
  const m = body.mesh({ tolerance: Math.max(0.01, h / 6), angularTolerance: 0.3 });
  const verts = []; const keys = new Map();
  const key = (p) => p.map((v) => Math.round(v * 1e5)).join(',');
  const vid = (p) => { const k = key(p); let i = keys.get(k); if (i == null) { i = verts.length; verts.push(p); keys.set(k, i); } return i; };
  const map = [];
  for (let i = 0; i < m.vertices.length; i += 3) map.push(vid([m.vertices[i], m.vertices[i + 1], m.vertices[i + 2]]));
  let tris = [];
  for (let i = 0; i < m.triangles.length; i += 3) {
    const t = [map[m.triangles[i]], map[m.triangles[i + 1]], map[m.triangles[i + 2]]];
    if (t[0] !== t[1] && t[1] !== t[2] && t[2] !== t[0]) tris.push(t);
  }
  for (let pass = 0; pass < 24; pass++) {
    const ek = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
    const long = new Map();
    for (const t of tris) for (let k = 0; k < 3; k++) {
      const a = t[k]; const b = t[(k + 1) % 3];
      const l = len(sub(verts[a], verts[b]));
      if (l > h && !long.has(ek(a, b))) long.set(ek(a, b), l);
    }
    if (!long.size) break;
    // Each split adds about two triangles: within the budget the longest edges go first, so a body with many
    // small faces (holes, fillets) still gets its large flat faces divided.
    const room = Math.floor((maxTris - tris.length) / 2);
    if (room < 1) break;
    const mids = new Map([...long.entries()].sort((p, q) => q[1] - p[1]).slice(0, room).map(([k]) => [k, null]));
    for (const k of mids.keys()) { const [a, b] = k.split('_').map(Number); mids.set(k, vid(mul(add(verts[a], verts[b]), 0.5))); }
    const next = [];
    for (const t of tris) {
      const m3 = [0, 1, 2].map((k) => mids.get(ek(t[k], t[(k + 1) % 3])) ?? null);
      const n = m3.filter((x) => x != null).length;
      if (!n) { next.push(t); continue; }
      if (n === 3) { const [a, b, c] = t; const [ab, bc, ca] = m3; next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]); continue; }
      // Rotate so the split edges come first (edge 0 for one split; edges 0 and 1 for two).
      let r = 0;
      if (n === 1) r = m3.findIndex((x) => x != null);
      else r = (m3.findIndex((x) => x == null) + 1) % 3;
      const v = [t[r], t[(r + 1) % 3], t[(r + 2) % 3]]; const q = [m3[r], m3[(r + 1) % 3], m3[(r + 2) % 3]];
      if (n === 1) next.push([v[0], q[0], v[2]], [q[0], v[1], v[2]]);
      else next.push([v[0], q[0], q[1]], [v[0], q[1], v[2]], [q[0], v[1], q[1]]);
    }
    tris = next;
  }
  return { verts, tris };
}

/**
 * A closed solid from triangles, turned right side out: built directly on shared vertices and edges (each
 * mesh edge one kernel edge, so the triangles are joined as they are made), or sewn when that fails.
 */
export function solidFromTriangles(verts, tris) {
  try { return sharedEdgeSolid(verts, tris); } catch { return sewnSolid(verts, tris); }
}

function sharedEdgeSolid(verts, tris) {
  const R = rep(); const oc = R.getOC();
  const V = verts.map((p) => new oc.BRepBuilderAPI_MakeVertex(new oc.gp_Pnt(p[0], p[1], p[2])).Vertex());
  const edges = new Map();
  const edgeOf = (a, b) => {
    const lo = Math.min(a, b); const hi = Math.max(a, b); const k = `${lo}_${hi}`;
    let e = edges.get(k);
    if (!e) { const mk = new oc.BRepBuilderAPI_MakeEdge(V[lo], V[hi]); if (!mk.IsDone()) throw codeError('kernel'); e = mk.Edge(); mk.delete(); edges.set(k, e); }
    return a < b ? e : oc.TopoDS.Edge(e.Reversed());
  };
  const builder = new oc.TopoDS_Builder();
  const shell = new oc.TopoDS_Shell();
  builder.MakeShell(shell);
  for (const [a, b, c] of tris) {
    const p = verts[a]; const q = verts[b]; const r = verts[c];
    if (len(crossV(sub(q, p), sub(r, p))) < 1e-9) throw codeError('kernel');
    const w = new oc.BRepBuilderAPI_MakeWire(edgeOf(a, b), edgeOf(b, c), edgeOf(c, a));
    if (!w.IsDone()) throw codeError('kernel');
    const f = new oc.BRepBuilderAPI_MakeFace(w.Wire(), true);
    if (!f.IsDone()) throw codeError('kernel');
    builder.Add(shell, f.Face());
    w.delete(); f.delete();
  }
  let solid = R.makeSolid([R.cast(shell)]);
  const v = R.measureVolume(solid);
  if (!(Math.abs(v) > 1e-9)) throw codeError('kernel');
  if (v < 0) solid = R.cast(solid.wrapped.Reversed());
  return solid;
}

function sewnSolid(verts, tris) {
  const R = rep(); const oc = R.getOC();
  const sew = new oc.BRepBuilderAPI_Sewing(1e-5, true, true, true, false);
  let n = 0;
  for (const [a, b, c] of tris) {
    const p = verts[a]; const q = verts[b]; const r = verts[c];
    if (len(crossV(sub(q, p), sub(r, p))) < 1e-10) continue;
    sew.Add(R.makePolygon([p, q, r]).wrapped); n++;
  }
  if (!n) { sew.delete(); throw codeError('kernel'); }
  sew.Perform(new oc.Message_ProgressRange());
  const shell = R.cast(sew.SewedShape());
  sew.delete();
  if (shell.wrapped.ShapeType() !== oc.TopAbs_ShapeEnum.TopAbs_SHELL) throw codeError('deform-open');
  let solid = R.makeSolid([shell]);
  if (R.measureVolume(solid) < 0) solid = R.cast(solid.wrapped.Reversed());
  return solid;
}

/** Triangles that stayed in one plane merged back into one face each (fewer faces and edges to draw). */
function mergeFlat(solid) {
  const R = rep(); const oc = R.getOC();
  try {
    const u = new oc.ShapeUpgrade_UnifySameDomain(solid.wrapped, true, true, false);
    u.Build();
    const merged = R.cast(u.Shape());
    u.delete();
    return Math.abs(R.measureVolume(merged) - R.measureVolume(solid)) <= 1e-6 * Math.max(1, Math.abs(R.measureVolume(solid))) ? merged : solid;
  } catch { return solid; }
}

/** Each body moved point by point through `fn(p)` (faceted, about `h` fine). */
function deformBodies(ctx, fn, h) {
  const out = [];
  for (const s of solidsOf(ctx.body)) {
    const { verts, tris } = fineMesh(s, h);
    out.push(mergeFlat(solidFromTriangles(verts.map(fn), tris)));
  }
  return bodyOf(out);
}

const axisDir = (k, d = 'x') => AXES[k] ?? AXES[d];

/**
 * Flex: bend (the body's length along `axis` curled toward `toward` by `angle`, about its middle), twist
 * (turned by `angle` from one end to the other), taper (cross-section scaled to `factor` at the far end)
 * or stretch (lengthened by `stretch`). The flex zone is the body's whole extent along the axis.
 */
function buildFlex(f, ctx) {
  if (!ctx.body) throw codeError('no-body');
  const a = axisDir(f.axis, 'x');
  let b = AXES[f.toward] ?? worldUp();
  // Toward along the axis itself: bend toward up (or toward the front viewer when the axis is vertical).
  if (Math.abs(dot(a, b)) > 0.5) b = Math.abs(dot(a, worldUp())) > 0.5 ? worldFront() : worldUp();
  const c3 = crossV(a, b);
  const [lo, hi] = ctx.body.boundingBox.bounds;
  const centre = mul(add(lo, hi), 0.5);
  const L = Math.max(1e-6, dot(sub(hi, lo), a.map(Math.abs)));
  const s0 = -L / 2;
  const theta = (num(f.angle, 90) * Math.PI) / 180;
  const mode = f.mode ?? 'bend';
  const decomp = (p) => { const d = sub(p, centre); return { s: dot(d, a), w: dot(d, b), z: dot(d, c3) }; };
  const compose = (s, w, z) => add(centre, add(mul(a, s), add(mul(b, w), mul(c3, z))));
  let fn;
  if (mode === 'bend') {
    if (!(Math.abs(theta) > 1e-6)) throw codeError('zero-size');
    const Rb = L / theta;
    fn = (p) => { const { s, w, z } = decomp(p); const phi = (s - s0) / Rb; const r = Rb - w; return compose(s0 + r * Math.sin(phi), Rb - r * Math.cos(phi), z); };
  } else if (mode === 'twist') {
    fn = (p) => { const { s, w, z } = decomp(p); const phi = (theta * (s - s0)) / L; return compose(s, w * Math.cos(phi) - z * Math.sin(phi), w * Math.sin(phi) + z * Math.cos(phi)); };
  } else if (mode === 'taper') {
    const k1 = num(f.factor, 0.5);
    if (!(k1 > 0)) throw codeError('zero-size');
    fn = (p) => { const { s, w, z } = decomp(p); const k = 1 + ((k1 - 1) * (s - s0)) / L; return compose(s, w * k, z * k); };
  } else {
    const k = (L + num(f.stretch, 20)) / L;
    if (!(k > 0)) throw codeError('zero-size');
    fn = (p) => { const { s, w, z } = decomp(p); return compose(s0 + (s - s0) * k, w, z); };
  }
  const diag = len(sub(hi, lo));
  return { body: deformBodies(ctx, fn, Math.max(diag / 20, 0.2)), faceted: true };
}

/** Point deform: the material within `radius` of the point is pushed `amount` along `dir`, falling off smoothly. */
function buildDeform(f, ctx) {
  if (!ctx.body) throw codeError('no-body');
  const c = f.pointRef && ctx.refPoints?.has(f.pointRef) ? ctx.refPoints.get(f.pointRef) : [num(f.x), num(f.y), num(f.z)];
  const r = Math.max(0.01, num(f.radius, 30));
  const d = num(f.amount, 5);
  const dir = DIRS[f.dir] ?? worldUp();
  const fn = (p) => { const q = len(sub(p, c)) / r; if (q >= 1) return p; const w = (1 - q * q) ** 2; return add(p, mul(dir, d * w)); };
  const [lo, hi] = ctx.body.boundingBox.bounds;
  const h = Math.max(Math.min(len(sub(hi, lo)) / 25, r / 5), 0.2);
  return { body: deformBodies(ctx, fn, h), faceted: true };
}

// ───────────────────────── reference geometry

const regAxis = (ctx, id, a) => { ctx.refAxes ??= new Map(); ctx.refAxes.set(id, a); };
const segmentWire = (p, q) => rep().assembleWire([rep().makeLine(p, q)]);

/** A plane given as "std:front" or "ref:<plane feature id>" (the reference planes built so far). */
function planeOf(text, ctx) {
  const [kind, id] = String(text ?? 'std:front').split(':');
  if (kind === 'ref') return resolvePlane({ kind: 'ref', id }, ctx);
  return makeFrame(STD_PLANES[id] ?? STD_PLANES.front);
}

/** A reference axis: a world axis, two points, a straight or circular edge, a cylinder's axis, two planes' meeting line. */
export function axisOfRef(f, ctx) {
  if (f.kind === 'twoPoints') {
    const p = [num(f.x1), num(f.y1), num(f.z1)]; const q = [num(f.x2), num(f.y2), num(f.z2)];
    if (len(sub(q, p)) < 1e-9) throw codeError('zero-size');
    return { origin: p, dir: normalize(sub(q, p)) };
  }
  if (f.kind === 'edge') {
    const [edge] = findEdges(ctx.body, f.edge ? [f.edge] : []);
    if (!edge) throw codeError('edge-missing');
    if (edge.geomType === 'CIRCLE') { const c = circleOfEdge(edge); return { origin: c.centre, dir: c.normal }; }
    if (edge.geomType !== 'LINE') throw codeError('edge-missing');
    const s = vec(edge.startPoint); const e = vec(edge.endPoint);
    return { origin: s, dir: normalize(sub(e, s)) };
  }
  if (f.kind === 'cylinder') {
    const face = findFace(ctx.body, f.face);
    if (!face || !isCylinder(face.geomType)) throw codeError('face-missing');
    const circle = face.edges.find((e) => e.geomType === 'CIRCLE');
    if (!circle) throw codeError('face-missing');
    const c = circleOfEdge(circle);
    return { origin: c.centre, dir: c.normal };
  }
  if (f.kind === 'twoPlanes') {
    const A = planeOf(f.planeA, ctx); const B = planeOf(f.planeB, ctx);
    const dir = crossV(A.normal, B.normal);
    if (len(dir) < 1e-9) throw codeError('planes-parallel');
    // The point on both planes nearest the world origin.
    const d1 = dot(A.normal, A.origin); const d2 = dot(B.normal, B.origin);
    const n1n2 = dot(A.normal, B.normal); const det = 1 - n1n2 * n1n2;
    const c1 = (d1 - d2 * n1n2) / det; const c2 = (d2 - d1 * n1n2) / det;
    return { origin: add(mul(A.normal, c1), mul(B.normal, c2)), dir: normalize(dir) };
  }
  return { origin: [0, 0, 0], dir: AXES[f.axis] ?? worldUp() };
}

function buildRefAxis(f, ctx) {
  const axis = axisOfRef(f, ctx);
  regAxis(ctx, f.id, axis);
  // Shown as a line over the part and the points that define it (two points: both of them), a little longer.
  const along = (p) => dot(sub(p, axis.origin), axis.dir);
  let ts = [];
  if (f.kind === 'twoPoints') ts.push(0, along([num(f.x2), num(f.y2), num(f.z2)]));
  if (ctx.body) {
    const [lo, hi] = ctx.body.boundingBox.bounds;
    const m = along(mul(add(lo, hi), 0.5)); const half = len(sub(hi, lo)) * 0.6;
    ts.push(m - half, m + half);
  }
  if (!ts.length) ts = [-30, 30];
  let t0 = Math.min(...ts); let t1 = Math.max(...ts);
  const pad = Math.max(2, (t1 - t0) * 0.1);
  t0 -= pad; t1 += pad;
  return { curve: segmentWire(add(axis.origin, mul(axis.dir, t0)), add(axis.origin, mul(axis.dir, t1))), axis };
}

/** A reference point: coordinates, a face's centre, an arc's centre, or a point along an edge. */
export function pointOfRef(f, ctx) {
  if (f.kind === 'faceCenter') {
    const face = findFace(ctx.body, f.face);
    if (!face) throw codeError('face-missing');
    return vec(face.center);
  }
  if (f.kind === 'arcCenter') {
    const [edge] = findEdges(ctx.body, f.edge ? [f.edge] : []);
    if (!edge || edge.geomType !== 'CIRCLE') throw codeError('edge-missing');
    return circleOfEdge(edge).centre;
  }
  if (f.kind === 'onEdge') {
    const [edge] = findEdges(ctx.body, f.edge ? [f.edge] : []);
    if (!edge) throw codeError('edge-missing');
    return vec(edge.pointAt(Math.max(0, Math.min(1, num(f.at, 0.5)))));
  }
  if (f.kind === 'centerOfMass') {
    // The centre of mass of the bodies built so far (uniform density: the volume centroid), moving with the model.
    if (!ctx.body) throw codeError('no-body');
    const p = rep().measureShapeVolumeProperties(ctx.body);
    const c = [...p.centerOfMass];
    p.delete?.();
    return c;
  }
  return [num(f.x), num(f.y), num(f.z)];
}

// ───────────────────────── bounding box

/** The exact axis-aligned box of a shape in a frame (origin, x, y, z unit vectors): [lo, hi] in frame coordinates. */
export function boxInFrame(shape, fr) {
  const R = rep(); const oc = R.getOC();
  const ax = R.makeAx3(fr.origin, fr.z, fr.x);
  const trsf = new oc.gp_Trsf();
  trsf.SetTransformation(ax);
  const moved = new oc.BRepBuilderAPI_Transform(shape.wrapped, trsf, true, false);
  const box = new oc.Bnd_Box();
  try {
    oc.BRepBndLib.AddOptimal(moved.Shape(), box, false, false);
    if (box.IsVoid()) throw codeError('no-body');
    return [[box.GetXMin(), box.GetYMin(), box.GetZMin()], [box.GetXMax(), box.GetYMax(), box.GetZMax()]];
  } finally { box.delete(); moved.delete(); trsf.delete(); ax.delete(); }
}

/** Frames to try for a best-fit box: OCCT's optimal oriented box, and each planar face's normal with its edges. */
function boxCandidates(shape) {
  const R = rep(); const oc = R.getOC();
  const out = [];
  const obb = new oc.Bnd_OBB();
  try {
    oc.BRepBndLib.AddOBB(shape.wrapped, obb, false, true, false);
    if (!obb.IsVoid()) {
      const d = (xyz) => normalize([xyz.X(), xyz.Y(), xyz.Z()]);
      const x = d(obb.XDirection()); const y = d(obb.YDirection());
      out.push({ x, y, z: normalize(crossV(x, y)) });
    }
  } catch { /* no oriented box: the face frames below */ } finally { obb.delete(); }
  const seen = [];
  for (const face of shape.faces) {
    if (face.geomType !== 'PLANE') continue;
    let n; try { n = normalize(vec(face.normalAt(face.center))); } catch { continue; }
    if (seen.some((m) => Math.abs(Math.abs(n[0] * m[0] + n[1] * m[1] + n[2] * m[2]) - 1) < 1e-9)) continue;
    seen.push(n);
    // In-plane directions: each straight edge of the face (the box side lies along one of them for a prism).
    const dirs = [];
    for (const e of face.edges) if (e.geomType === 'LINE') { const d = normalize(sub(vec(e.endPoint), vec(e.startPoint))); if (!dirs.some((q) => Math.abs(Math.abs(q[0] * d[0] + q[1] * d[1] + q[2] * d[2]) - 1) < 1e-9)) dirs.push(d); }
    if (!dirs.length) { const t = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; dirs.push(normalize(crossV(n, t))); }
    for (const x of dirs.slice(0, 12)) out.push({ x, y: normalize(crossV(n, x)), z: n });
    if (seen.length > 40) break;
  }
  out.push({ x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] });
  return out;
}

/**
 * Bounding box (reference geometry): the smallest box around the bodies — best fit (the least volume among the
 * optimal oriented box and boxes square to the part's planar faces) or square to a plane. Its 12 edges are the
 * feature's curve; `box` gives the centre, the axes and the sizes (length ≥ width ≥ thickness) and the volume.
 */
function buildBoundingBox(f, ctx) {
  if (!ctx.body) throw codeError('no-body');
  const R = rep();
  let best = null;
  const consider = (axes) => {
    const fr = { origin: [0, 0, 0], ...axes };
    const [lo, hi] = boxInFrame(ctx.body, fr);
    const size = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    const volume = size[0] * size[1] * size[2];
    if (!best || volume < best.volume - 1e-9 * Math.max(1, volume)) best = { axes, lo, hi, size, volume };
  };
  if (f.mode === 'plane') {
    const pf = planeOf(f.plane, ctx);
    consider({ x: pf.xDir, y: normalize(crossV(pf.normal, pf.xDir)), z: pf.normal });
  } else for (const c of boxCandidates(ctx.body)) consider(c);
  const { axes, lo, hi, size } = best;
  const at = (u, v, w) => add(add(mul(axes.x, u), mul(axes.y, v)), mul(axes.z, w));
  const corners = [];
  for (const w of [lo[2], hi[2]]) for (const [u, v] of [[lo[0], lo[1]], [hi[0], lo[1]], [hi[0], hi[1]], [lo[0], hi[1]]]) corners.push(at(u, v, w));
  const lines = [];
  for (let i = 0; i < 4; i++) {
    lines.push(R.makeLine(corners[i], corners[(i + 1) % 4]), R.makeLine(corners[4 + i], corners[4 + ((i + 1) % 4)]));
    if (size[2] > 1e-9) lines.push(R.makeLine(corners[i], corners[4 + i]));
  }
  const sorted = [...size].sort((a, b) => b - a);
  const centre = at((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
  return { curve: R.makeCompound(lines), box: { centre, axes, size, length: sorted[0], width: sorted[1], thickness: sorted[2], volume: best.volume } };
}

const crossMark = (p, s) => {
  const R = rep();
  return R.makeCompound([0, 1, 2].map((k) => { const d = [0, 0, 0]; d[k] = s; return R.makeLine(sub(p, d), add(p, d)); }));
};

function buildRefPoint(f, ctx) {
  const p = pointOfRef(f, ctx);
  ctx.refPoints ??= new Map(); ctx.refPoints.set(f.id, p);
  return { curve: crossMark(p, 2.5), point: p };
}

/** Rotation of a vector by angles (degrees) about x, then y, then z. */
export function rotateXYZ(v, rx, ry, rz) {
  const r = (deg) => (deg * Math.PI) / 180;
  let [x, y, z] = v;
  let c = Math.cos(r(rx)); let s = Math.sin(r(rx)); [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(r(ry)); s = Math.sin(r(ry)); [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(r(rz)); s = Math.sin(r(rz)); [x, y] = [x * c - y * s, x * s + y * c];
  return [x, y, z];
}

function buildCoordSys(f, ctx) {
  const R = rep();
  const origin = f.pointRef && ctx.refPoints?.has(f.pointRef) ? ctx.refPoints.get(f.pointRef) : [num(f.x), num(f.y), num(f.z)];
  const [x, y, z] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((v) => rotateXYZ(v, num(f.rx), num(f.ry), num(f.rz)));
  const cs = { origin, x, y, z };
  ctx.coordSystems ??= new Map(); ctx.coordSystems.set(f.id, cs);
  // Axes of 20 (X), 14 (Y) and 9 (Z) so they can be told apart, with a small arrow on X.
  const lines = [R.makeLine(origin, add(origin, mul(x, 20))), R.makeLine(origin, add(origin, mul(y, 14))), R.makeLine(origin, add(origin, mul(z, 9)))];
  const tip = add(origin, mul(x, 20));
  lines.push(R.makeLine(tip, add(tip, add(mul(x, -3), mul(y, 1.5)))), R.makeLine(tip, add(tip, add(mul(x, -3), mul(y, -1.5)))));
  return { curve: R.makeCompound(lines), coordSys: cs };
}

/** An axis reference of a pattern / feature, including reference axes ({ kind: 'ref', id }). */
export function refAxisOf(ref, ctx) {
  const a = ctx.refAxes?.get(ref?.id);
  if (!a) throw codeError('axis-missing');
  return a;
}

// ───────────────────────── fillets

/** Variable-radius fillet: each edge runs from r1 at its start to r2 at its end. */
function buildVariableFillet(f, ctx) {
  if (!ctx.body) throw codeError('no-body');
  const edges = findEdges(ctx.body, f.edges ?? []);
  if (!edges.length) throw codeError('no-edges');
  const r1 = num(f.r1, 2); const r2 = num(f.r2, 5);
  if (!(r1 > 0) || !(r2 > 0)) throw codeError('zero-size');
  return { body: ctx.body.fillet((e) => (edges.some((m) => m.isSame(e)) ? [r1, r2] : null)), matched: edges.length };
}

/** Edges shared by two faces. */
function sharedEdges(a, b) {
  return a.edges.filter((e) => b.edges.some((x) => x.isSame(e)));
}

/** Face fillet: a round of `radius` between two picked faces (along the edges where they meet). */
function buildFaceFillet(f, ctx) {
  if (!ctx.body) throw codeError('no-body');
  const faces = (f.faces ?? []).map((sig) => findFace(ctx.body, sig)).filter(Boolean);
  if (faces.length < 2) throw codeError('needs-two-faces');
  const edges = [];
  for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++) edges.push(...sharedEdges(faces[i], faces[j]));
  if (!edges.length) throw codeError('faces-not-adjacent');
  const r = num(f.radius, 2);
  if (!(r > 0)) throw codeError('zero-size');
  return { body: ctx.body.fillet((e) => (edges.some((m) => m.isSame(e)) ? r : null)), matched: edges.length };
}

/**
 * Full round fillet: the centre face (the second pick) between two parallel side faces is replaced by a
 * half-round tangent to both sides (radius = half the distance between them).
 */
function buildFullRound(f, ctx) {
  const R = rep();
  if (!ctx.body) throw codeError('no-body');
  const faces = (f.faces ?? []).map((sig) => findFace(ctx.body, sig)).filter(Boolean);
  if (faces.length < 3) throw codeError('needs-three-faces');
  const [s1, centre, s2] = faces;
  if ([s1, centre, s2].some((x) => x.geomType !== 'PLANE')) throw codeError('needs-planar-faces');
  const p1 = planeOfFace(s1); const p2 = planeOfFace(s2); const pc = planeOfFace(centre);
  if (Math.abs(Math.abs(dot(p1.normal, p2.normal)) - 1) > 1e-6) throw codeError('sides-not-parallel');
  const w = Math.abs(dot(sub(p2.origin, p1.origin), p1.normal));
  if (!(w > 1e-6)) throw codeError('zero-size');
  const r = w / 2;
  const edge = sharedEdges(centre, s1).find((e) => e.geomType === 'LINE');
  if (!edge) throw codeError('faces-not-adjacent');
  const along = normalize(sub(vec(edge.endPoint), vec(edge.startPoint)));
  // The centre face pushed in by r is the region that changes; what is outside the half-cylinder goes.
  const inward = mul(pc.normal, -1);
  const prism = R.basicFaceExtrusion(centre.clone(), new R.Vector(mul(inward, r)));
  // Axis: mid-way between the sides, r below the centre face, along the shared edge.
  const midSide = add(p1.origin, mul(p1.normal, dot(sub(p2.origin, p1.origin), p1.normal) / 2));
  const onCentre = add(midSide, mul(pc.normal, dot(sub(pc.origin, midSide), pc.normal)));
  const axisPoint = add(onCentre, mul(inward, r));
  const [lo, hi] = ctx.body.boundingBox.bounds;
  const big = len(sub(hi, lo)) * 2 + 10;
  const base = add(add(axisPoint, mul(along, dot(sub(pc.origin, axisPoint), along))), mul(along, -big / 2));
  const cyl = makeCylinderStable(r, big, base, along);
  const corners = prism.cut(cyl);
  return { body: ctx.body.cut(corners), radius: r };
}

// ───────────────────────── patterns

/** The seed tools (bosses and cuts) of a pattern; `f.body` patterns the whole body. */
function seeds(f, ctx) {
  if (f.body && ctx.body) return [{ tool: ctx.body.clone(), op: 'boss' }];
  const out = [];
  for (const id of f.seeds ?? []) {
    const seed = ctx.part.features.find((x) => x.id === id);
    const r = ctx.results.get(id);
    if (!seed || !r?.ok || !r.tool) continue;
    out.push({ tool: r.tool, op: r.toolOp ?? (seed.type === 'hole' || seed.op === 'cut' ? 'cut' : 'boss'), id });
  }
  if (!out.length) throw codeError('no-seeds');
  return out;
}

function applyMoves(ctx, tools, moves) {
  let body = ctx.body;
  if (!body) throw codeError('no-body');
  let made = 0;
  for (const move of moves) for (const { tool, op } of tools) { const c = move(tool.clone()); body = op === 'cut' ? body.cut(c) : body.fuse(c); made++; }
  return { body, copies: made };
}

const centroidOf = (shape) => { const [lo, hi] = shape.boundingBox.bounds; return mul(add(lo, hi), 0.5); };

/** A wire (sketch path, 3D sketch, helix, curve feature) as a polyline with arc lengths. */
export function curvePolyline(wire, perEdge = 64) {
  const pts = [];
  const edges = wire.edges;
  // Chain the edges end to start (flip an edge whose end meets the current point).
  let at = null;
  const used = new Set();
  for (let k = 0; k < edges.length; k++) {
    let pick = -1; let flip = false;
    for (let i = 0; i < edges.length; i++) {
      if (used.has(i)) continue;
      if (at == null) { pick = i; break; }
      if (len(sub(vec(edges[i].startPoint), at)) < 1e-4) { pick = i; break; }
      if (len(sub(vec(edges[i].endPoint), at)) < 1e-4) { pick = i; flip = true; break; }
    }
    if (pick < 0) pick = [...edges.keys()].find((i) => !used.has(i));
    used.add(pick);
    const e = edges[pick];
    for (let j = pts.length ? 1 : 0; j <= perEdge; j++) { const t = flip ? 1 - j / perEdge : j / perEdge; pts.push(vec(e.pointAt(t))); }
    at = pts.at(-1);
  }
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + len(sub(pts[i], pts[i - 1])));
  return { pts, s, length: s.at(-1) };
}

function sampleAt(poly, d) {
  const { pts, s } = poly;
  let i = s.findIndex((x) => x >= d);
  if (i <= 0) i = d <= 0 ? 1 : pts.length - 1;
  const k = (d - s[i - 1]) / Math.max(1e-12, s[i] - s[i - 1]);
  const p = add(pts[i - 1], mul(sub(pts[i], pts[i - 1]), Math.max(0, Math.min(1, k))));
  return { p, t: normalize(sub(pts[i], pts[i - 1])) };
}

/** The wire of a curve reference: a curve feature, or a sketch's chain of curves. */
function curveWire(id, ctx) {
  if (ctx.curves.has(id)) return ctx.curves.get(id);
  const { sketch, frame } = sketchOf({ sketch: id }, ctx, id);
  return sketchWire(sketch, frame);
}

/** Curve-driven pattern: copies along a curve (equally spaced over its length, or `spacing` apart), optionally turned with it. */
function buildCurvePattern(f, ctx) {
  const tools = seeds(f, ctx);
  if (!f.curve) throw codeError('no-path');
  const poly = curvePolyline(curveWire(f.curve, ctx));
  const n = Math.max(2, Math.min(200, Math.round(num(f.count, 4))));
  const closed = len(sub(poly.pts[0], poly.pts.at(-1))) < 1e-6;
  const step = f.equal !== false ? poly.length / (closed ? n : n - 1) : num(f.spacing, 20);
  const start = sampleAt(poly, 0);
  const moves = [];
  for (let i = 1; i < n; i++) {
    const d = i * step;
    if (d > poly.length + 1e-6) break;
    const at = sampleAt(poly, Math.min(d, poly.length));
    moves.push((s) => {
      let out = s;
      if (f.align) {
        const ax = crossV(start.t, at.t);
        const ang = (Math.atan2(len(ax), dot(start.t, at.t)) * 180) / Math.PI;
        if (len(ax) > 1e-9 && Math.abs(ang) > 1e-6) out = out.rotate(ang, start.p, normalize(ax));
        else if (dot(start.t, at.t) < 0) out = out.rotate(180, start.p, normalize(crossV(start.t, Math.abs(dot(start.t, worldUp())) < 0.9 ? worldUp() : [1, 0, 0])));
      }
      return out.translate(sub(at.p, start.p));
    });
  }
  return applyMoves(ctx, tools, moves);
}

/** Sketch-driven pattern: a copy at every point of the sketch (the seed's centre is the reference). */
function buildSketchPattern(f, ctx) {
  const tools = seeds(f, ctx);
  const { sketch, frame } = sketchOf(f, ctx);
  const pts = standalonePoints(sketch).map((p) => toWorld(frame, [p.x, p.y]));
  if (!pts.length) throw codeError('no-hole-points');
  const c = centroidOf(tools[0].tool);
  const ref = sub(c, mul(frame.normal, dot(sub(c, frame.origin), frame.normal)));
  const moves = pts.map((p) => sub(p, ref)).filter((v) => len(v) > 1e-6).map((v) => (s) => s.translate(v));
  return applyMoves(ctx, tools, moves);
}

/** Table-driven pattern: copies at the X/Y/Z offsets of the table (in a coordinate system's axes when one is chosen). */
function buildTablePattern(f, ctx) {
  const tools = seeds(f, ctx);
  const cs = f.cs ? ctx.coordSystems?.get(f.cs) : null;
  if (f.cs && !cs) throw codeError('cs-missing');
  const rows = (f.points ?? []).filter((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite));
  if (!rows.length) throw codeError('no-points');
  const moves = rows.map(([x, y, z]) => (cs ? add(add(mul(cs.x, x), mul(cs.y, y)), mul(cs.z, z)) : [x, y, z])).filter((v) => len(v) > 1e-9).map((v) => (s) => s.translate(v));
  return applyMoves(ctx, tools, moves);
}

/** A planar face's outer boundary as a polygon in its plane's (u, v) coordinates, and the frame. */
function facePolygon(face) {
  const p = planeOfFace(face);
  const fr = makeFrame({ origin: p.origin, xDir: p.xDir, normal: p.normal });
  const outer = face.edges;
  const pts = [];
  for (const e of outer) for (let i = 0; i < 16; i++) { const q = sub(vec(e.pointAt(i / 16)), fr.origin); pts.push([dot(q, fr.xDir), dot(q, fr.yDir)]); }
  return { fr, pts, edges: outer.map((e) => Array.from({ length: 17 }, (_, i) => { const q = sub(vec(e.pointAt(i / 16)), fr.origin); return [dot(q, fr.xDir), dot(q, fr.yDir)]; })) };
}

/** Inside test by ray crossing over the face's edge polylines (holes count too). */
function insideEdges(edges, [x, y]) {
  let inside = false;
  for (const poly of edges) for (let i = 1; i < poly.length; i++) {
    const [ax, ay] = poly[i - 1]; const [bx, by] = poly[i];
    if ((ay > y) !== (by > y) && x < ax + ((y - ay) * (bx - ax)) / (by - ay)) inside = !inside;
  }
  return inside;
}

function distToEdges(edges, [x, y]) {
  let d = Infinity;
  for (const poly of edges) for (let i = 1; i < poly.length; i++) {
    const [ax, ay] = poly[i - 1]; const [bx, by] = poly[i];
    const dx = bx - ax; const dy = by - ay; const L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
    d = Math.min(d, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return d;
}

/** Grid points of a fill pattern inside the face: each centre at least `margin` from the boundary (and far enough for the instance to fit). */
export function fillPoints(face, { spacing, margin, layout, angle = 0, clear = 0, ref = null }) {
  const { fr, pts, edges } = facePolygon(face);
  const us = pts.map((p) => p[0]); const vs = pts.map((p) => p[1]);
  const o = ref ? [dot(sub(ref, fr.origin), fr.xDir), dot(sub(ref, fr.origin), fr.yDir)] : [0, 0];
  const S = Math.max(0.1, spacing);
  const rot = (angle * Math.PI) / 180;
  const ext = Math.hypot(Math.max(...us) - Math.min(...us), Math.max(...vs) - Math.min(...vs)) + Math.hypot(...o);
  const out = [];
  const rowH = layout === 'hex' ? S * Math.sqrt(3) / 2 : S;
  const nI = Math.ceil(ext / S) + 1; const nJ = Math.ceil(ext / rowH) + 1;
  for (let j = -nJ; j <= nJ; j++) for (let i = -nI; i <= nI; i++) {
    const gu = i * S + (layout === 'hex' && j % 2 ? S / 2 : 0); const gv = j * rowH;
    const u = o[0] + gu * Math.cos(rot) - gv * Math.sin(rot); const v = o[1] + gu * Math.sin(rot) + gv * Math.cos(rot);
    if (!insideEdges(edges, [u, v])) continue;
    if (distToEdges(edges, [u, v]) < Math.max(margin, clear) - 1e-9) continue;
    out.push(toWorld(fr, [u, v]));
  }
  return { points: out, frame: fr };
}

/** Fill pattern: copies of the seed (or round cuts of `diameter`) filling a planar face in a square or staggered grid. */
function buildFillPattern(f, ctx) {
  const R = rep();
  if (!ctx.body) throw codeError('no-body');
  const face = findFace(ctx.body, f.face);
  if (!face || face.geomType !== 'PLANE') throw codeError('face-missing');
  let tools = null;
  try { tools = (f.seeds ?? []).length ? seeds(f, ctx) : null; } catch { tools = null; }
  const { normal } = planeOfFace(face);
  if (tools) {
    const c = centroidOf(tools[0].tool);
    const [lo, hi] = tools[0].tool.boundingBox.bounds;
    const half = Math.max(...sub(hi, lo).map((v, k) => (Math.abs(normal[k]) > 0.9 ? 0 : v))) / 2;
    const { points } = fillPoints(face, { spacing: num(f.spacing, 15), margin: num(f.margin, 3), layout: f.layout, angle: num(f.angle), clear: half, ref: c });
    const onFace = sub(c, mul(normal, dot(sub(c, vec(face.center)), normal)));
    const moves = points.map((p) => sub(p, onFace)).filter((v) => len(v) > 1e-6).map((v) => (s) => s.translate(v));
    return applyMoves(ctx, tools, moves);
  }
  const d = Math.max(0.05, num(f.diameter, 5));
  const { points, frame } = fillPoints(face, { spacing: num(f.spacing, 15), margin: num(f.margin, 3), layout: f.layout, angle: num(f.angle), clear: d / 2 });
  if (!points.length) throw codeError('no-points');
  const depth = sizeAround(ctx);
  let tool = null;
  for (const p of points) {
    const one = makeCylinderStable(d / 2, depth + 0.02, add(p, mul(frame.normal, 0.01)), mul(frame.normal, -1));
    tool = tool ? tool.fuse(one) : one;
  }
  return { tool, toolOp: 'cut', body: ctx.body.cut(tool.clone()), copies: points.length };
}

/**
 * Variable pattern: copies of one seed feature `spacing` apart along an axis, each built again with its
 * value `param` changed by `delta` per copy (a deeper boss, a wider cut …).
 */
function buildVariablePattern(f, ctx) {
  if (!ctx.body) throw codeError('no-body');
  const id = (f.seeds ?? [])[0];
  const seedIndex = ctx.part.features.findIndex((x) => x.id === id);
  if (seedIndex < 0) throw codeError('no-seeds');
  const seed = ctx.part.features[seedIndex];
  const key = f.param || 'depth';
  if (!Number.isFinite(Number(seed[key]))) throw codeError('bad-param');
  const dir = AXES[f.axis] ?? AXES.x;
  const n = Math.max(2, Math.min(50, Math.round(num(f.count, 3))));
  let body = ctx.body;
  for (let i = 1; i < n; i++) {
    const features = ctx.part.features.slice(0, seedIndex + 1).map((x) => (x.id === id ? { ...x, [key]: Number(seed[key]) + num(f.delta) * i, exprs: undefined } : x));
    const r = regenerate({ ...ctx.part, configurations: undefined, variables: undefined, features }, { project: ctx.project, stack: ctx.stack.slice(0, -1) });
    const res = r.results.get(id);
    if (!res?.ok || !res.tool) throw codeError('seed-failed');
    const op = res.toolOp ?? (seed.type === 'hole' || seed.op === 'cut' ? 'cut' : 'boss');
    const copy = res.tool.clone().translate(mul(dir, num(f.spacing, 20) * i));
    body = op === 'cut' ? body.cut(copy) : body.fuse(copy);
  }
  return { body, copies: n - 1 };
}

// ───────────────────────── curves

function prismBothWays(shape, normal, big) {
  const R = rep(); const oc = R.getOC();
  const moved = shape.clone().translate(mul(normal, -big));
  const v = new R.Vector(mul(normal, 2 * big));
  const mk = new oc.BRepPrimAPI_MakePrism(moved.wrapped, v.wrapped, false, true);
  const out = R.cast(mk.Shape());
  mk.delete();
  return out;
}

/** The kernel's section (common edges) of two shapes. */
export function sectionOf(a, b) {
  const R = rep(); const oc = R.getOC();
  const sec = new oc.BRepAlgoAPI_Section(a.wrapped, b.wrapped, false);
  sec.Approximation(true);
  sec.Build(new oc.Message_ProgressRange());
  if (!sec.IsDone()) { sec.delete(); throw codeError('kernel'); }
  const out = R.cast(sec.Shape());
  sec.delete();
  return out;
}

/** The faces a curve is projected on / split: the picked ones, or all of the body's. */
function targetFaces(f, ctx) {
  if (!ctx.body) throw codeError('no-body');
  const picked = (f.faces ?? []).map((sig) => findFace(ctx.body, sig)).filter(Boolean);
  return picked.length ? picked : ctx.body.faces;
}

/** Projected curve: the sketch projected along its plane's normal onto the faces (both ways). */
function buildProjectedCurve(f, ctx) {
  const R = rep();
  const { sketch, frame } = sketchOf(f, ctx);
  const wire = sketchWire(sketch, frame);
  const faces = targetFaces(f, ctx);
  const tool = prismBothWays(wire, frame.normal, sizeAround(ctx));
  const edges = [];
  for (const face of faces) { try { edges.push(...sectionOf(tool.clone(), face.clone()).edges); } catch { /* misses that face */ } }
  if (!edges.length) throw codeError('projection-missed');
  const length = edges.reduce((s, e) => s + e.length, 0);
  return { curve: R.makeCompound(edges), length };
}

/** Split line: the faces cut along the sketch projected onto them (more faces, the same solid). */
function buildSplitLine(f, ctx) {
  const R = rep(); const oc = R.getOC();
  const faces = targetFaces(f, ctx);
  const big = sizeAround(ctx);
  // The tools that cut a face: the sketch's prism (projection), the face's silhouette for a direction, or the
  // planes / faces / surface bodies it meets (split-line-more.js).
  let toolsFor;
  const kind = f.kind ?? 'projection';
  if (kind === 'silhouette') {
    const d = planeOf(f.plane ?? 'std:top', ctx).normal;
    toolsFor = (face) => silhouetteTools(face, d, big);
  } else if (kind === 'intersection') {
    const tools = [];
    for (const ref of f.tools ?? []) {
      if (ref.startsWith('std:') || ref.startsWith('ref:')) { const fr = planeOf(ref, ctx); tools.push(planeTool(fr.origin, fr.normal, big)); }
      else if (ref.startsWith('surf:')) { const sh = ctx.surfaces.get(ref.slice(5)); if (sh) tools.push(sh); }
    }
    for (const sig of f.toolFaces ?? []) { const fc = findFace(ctx.body, sig); if (fc) tools.push(fc); }
    if (!tools.length) throw codeError('no-tools');
    toolsFor = () => tools;
  } else {
    const { sketch, frame } = sketchOf(f, ctx);
    const tool = prismBothWays(sketchWire(sketch, frame), frame.normal, big);
    toolsFor = () => [tool];
  }
  const out = [];
  let split = 0; let anyTool = false;
  for (const face of ctx.body.faces) {
    if (!faces.some((x) => x.isSame(face))) { out.push(face.clone()); continue; }
    const tools = toolsFor(face);
    if (tools.length) anyTool = true;
    const pieces = tools.length ? splitFace(face, tools, big * 1e-6) : [face.clone()];
    if (pieces.length > 1) split++;
    out.push(...pieces);
  }
  // A silhouette that already runs along the face's edges (a cylinder's seam) splits nothing: that is fine.
  if (!split && !(kind === 'silhouette' && anyTool)) throw codeError(kind === 'projection' ? 'projection-missed' : 'split-missed');
  const sew = new oc.BRepBuilderAPI_Sewing(1e-5, true, true, true, false);
  for (const fc of out) sew.Add(fc.wrapped);
  sew.Perform(new oc.Message_ProgressRange());
  const shell = R.cast(sew.SewedShape());
  sew.delete();
  let body;
  try {
    body = R.makeSolid([shell]);
    if (R.measureVolume(body) < 0) body = R.cast(body.wrapped.Reversed());
  } catch { throw codeError('kernel'); }
  return { body, splitFaces: split };
}

/** Composite curve: sketch paths, curve features and body edges joined end to end into one curve. */
function buildCompositeCurve(f, ctx) {
  const R = rep();
  const edges = [];
  for (const id of f.curves ?? []) edges.push(...curveWire(id, ctx).edges.map((e) => e.clone()));
  for (const e of findEdges(ctx.body, f.edges ?? [])) edges.push(e.clone());
  if (!edges.length) throw codeError('no-path');
  let wire;
  try { wire = R.assembleWire(edges); } catch { throw codeError('path-not-chain'); }
  return { curve: wire, length: wire.edges.reduce((s, e) => s + e.length, 0) };
}

/** Curve through XYZ points: a smooth curve passing through the table's points (closed: back to the first). */
function buildCurveXYZ(f) {
  const R = rep();
  const pts = (f.points ?? []).filter((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite));
  if (pts.length < 2) throw codeError('no-points');
  if (pts.length === 2) return { curve: R.assembleWire([R.makeLine(pts[0], pts[1])]) };
  // A B-spline fitted through the points within 1e-5 mm (the kernel build has no exact interpolator).
  const list = f.closed ? [...pts, pts[0]] : pts;
  return { curve: R.assembleWire([R.makeBSplineApproximation(list, { tolerance: 1e-5, smoothing: null, degMax: 5 })]) };
}

// ───────────────────────── helpers for the app

/** Sketches a new feature of `type` can use: 'points' (sketch pattern), 'path' (curves to project). */
export function partMoreSketchUse(type) {
  if (type === 'sketchPattern') return 'points';
  if (['projectedCurve', 'splitLine'].includes(type)) return 'path';
  return null;
}

void byId; void profiles;
