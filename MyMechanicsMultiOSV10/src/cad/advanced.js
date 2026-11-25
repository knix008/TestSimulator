// The part features beyond extrude / revolve (Features, Surfaces, Sheet Metal, Weldments
// and Mold Tools tabs): sweep, loft, draft, rib, dome, helix and thread, wrap, thicken, surfaces
// (extruded, revolved, planar, lofted, offset, knit), move / copy, scale and split of the body, insert part
// (and cavity), sheet metal base and edge flanges with a flat pattern, and weldment structural members.
// Built by regenerate() in features.js like the others: each returns { body?, tool?, surface?, curve? }.
import { needsSweepMore, sweepMoreTool } from './sweep-more.js';
import { needsLoftMore, loftMoreTool } from './loft-more.js';
import { needsRibMore, ribMore } from './rib-more.js';
import { rep } from './kernel.js';
import { profiles, byId, standalonePoints, curvePieces, equationError, PIECE_CURVES } from './sketch.js';
import { reversePieces, ellipseArcPieces } from './sketch-curves.js';
import { findEdges, findFace, planeOfFace, crossV, normalize, cylinderRadius, isCylinder, faceSignature } from './refs.js';
import { sketchOf, combine, sizeAround, replicadPlane, codeError, loopDrawing, resolvePlane, toWorld, AXES, regenerate, frame as makeFrame, sketchDrawing, resolveDirection } from './features.js';
import { SHEET_MORE_TYPES, SHEET_MORE_DEFAULTS, SHEET_MORE_NAMES } from './sheet-more-types.js';
import { MOLD_MORE_TYPES, MOLD_MORE_DEFAULTS, MOLD_MORE_NAMES } from './mold-more-types.js';
import { buildMoldMore, toolingSplitBySurfaces, undercutCount } from './mold-more.js';
import { partingLoops } from './mold-brep.js';
import { worldUp, worldFront } from './frame.js';
import { makeHelixStable, makeCylinderStable, makeCircleStable } from './oriented.js';
import { buildSheetMore } from './sheet-more.js';
import { bendFrame, zRange, rotationMap, translationMap, mapFrame } from './sheet-fold.js';
import { isoThread, formThread, threadSolid, cosmeticThread, parseThreadSize, wantsModelled, threadFrame, externalRunoutCore, internalRunoutBlank } from './threads.js';

export const ADVANCED_TYPES = [
  'sweep', 'loft', 'draft', 'rib', 'dome', 'helix', 'thread', 'wrap', 'thicken',
  'surfaceExtrude', 'surfaceRevolve', 'surfacePlanar', 'surfaceLoft', 'surfaceOffset', 'knit',
  'moveBody', 'scaleBody', 'split', 'insertPart', 'baseFlange', 'edgeFlange', 'structural',
  'fillSurface', 'boundary', 'trimSurface', 'hem', 'sketchedBend', 'jog', 'partingLine', 'toolingSplit', 'sketch3d',
  ...SHEET_MORE_TYPES, ...MOLD_MORE_TYPES,
];

export const ADVANCED_DEFAULTS = {
  sweep: () => ({ sketch: null, path: null, op: 'boss', frenet: false, transition: 'right' }),
  loft: () => ({ sketches: [], op: 'boss', ruled: false }),
  draft: () => ({ angle: 3, neutral: { kind: 'std', name: 'top' }, faces: [], reverse: false }),
  rib: () => ({ sketch: null, thickness: 3, flip: false }),
  dome: () => ({ faces: [], height: 5, reverse: false }),
  helix: () => ({ plane: { kind: 'std', name: 'top' }, center: [0, 0], radius: 10, pitch: 5, turns: 4, lefthand: false }),
  thread: () => ({ edge: null, pitch: 1.5, length: 10, internal: 'auto', reverse: false, cosmetic: false, lefthand: false, form: 'iso', mode: 'auto', offset: 0, trimEnd: true }),
  wrap: () => ({ sketch: null, face: null, depth: 1, op: 'emboss' }),
  thicken: () => ({ surface: null, thickness: 2, side: 'out', op: 'boss' }),
  surfaceExtrude: () => ({ sketch: null, depth: 20, midplane: false, reverse: false }),
  surfaceRevolve: () => ({ sketch: null, axis: null, angle: 360 }),
  surfacePlanar: () => ({ sketch: null }),
  surfaceLoft: () => ({ sketches: [], ruled: false }),
  surfaceOffset: () => ({ faces: [], distance: 2 }),
  knit: () => ({ surfaces: [], solid: true }),
  moveBody: () => ({ dx: 0, dy: 0, dz: 0, cx: 0, cy: 0, cz: 0, rx: 0, ry: 0, rz: 0, axis: 'z', angle: 0, copy: false }),
  scaleBody: () => ({ factor: 1.02, about: 'origin' }),
  split: () => ({ plane: { kind: 'std', name: 'top' }, keep: 'above' }),
  insertPart: () => ({ part: null, body: null, op: 'boss', dx: 0, dy: 0, dz: 0, axis: 'z', angle: 0, scale: 1 }),
  baseFlange: () => ({ sketch: null, thickness: 2, radius: 2, kFactor: 0.44, reverse: false }),
  edgeFlange: () => ({ edge: null, length: 20, angle: 90, radius: null, flip: false }),
  structural: () => ({ sketch: null, profile: 'squareTube', w: 40, h: 40, t: 3, rotate: 0 }),
  fillSurface: () => ({ edges: [], curve: null }),
  boundary: () => ({ curves: [], op: 'surface' }),
  trimSurface: () => ({ surface: null, tool: null, plane: { kind: 'std', name: 'top' }, keep: 'above' }),
  hem: () => ({ edge: null, kind: 'closed', length: 10, gap: 1, flip: false }),
  sketchedBend: () => ({ sketch: null, angle: 90, radius: null, flip: false, down: false }),
  jog: () => ({ sketch: null, height: 10, flip: false, down: false }),
  partingLine: () => ({ dir: 'z' }),
  toolingSplit: () => ({ dir: 'z', margin: 10, gap: 30, show: 'both', auto: true, height: 0, keepPart: false }),
  sketch3d: () => ({ points: [[0, 0, 0], [50, 0, 0], [50, 0, 50], [50, -50, 50]], closed: false, spline: false }),
  ...SHEET_MORE_DEFAULTS, ...MOLD_MORE_DEFAULTS,
};

export const ADVANCED_NAMES = {
  'boss-sweep': 'Sweep', 'cut-sweep': 'Cut-Sweep', 'boss-loft': 'Loft', 'cut-loft': 'Cut-Loft', draft: 'Draft', rib: 'Rib', dome: 'Dome', helix: 'Helix', thread: 'Thread',
  wrap: 'Wrap', thicken: 'Thicken', surfaceExtrude: 'Surface-Extrude', surfaceRevolve: 'Surface-Revolve', surfacePlanar: 'Surface-Plane', surfaceLoft: 'Surface-Loft',
  surfaceOffset: 'Surface-Offset', knit: 'Surface-Knit', moveBody: 'Body-Move/Copy', scaleBody: 'Scale', split: 'Split', insertPart: 'Insert-Part',
  baseFlange: 'Base-Flange', edgeFlange: 'Edge-Flange', structural: 'Structural Member',
  fillSurface: 'Surface-Fill', boundary: 'Boundary-Surface', 'boss-boundary': 'Boundary-Boss', 'cut-boundary': 'Boundary-Cut', trimSurface: 'Surface-Trim', hem: 'Hem', sketchedBend: 'Sketched Bend', jog: 'Jog',
  partingLine: 'Parting Line', toolingSplit: 'Tooling Split', sketch3d: '3DSketch',
  ...SHEET_MORE_NAMES, ...MOLD_MORE_NAMES,
};

/** Weldment profiles: [w, h, t] defaults per kind (mm). */
export const STRUCTURAL_PROFILES = {
  squareTube: [40, 40, 3], rectTube: [60, 40, 3], pipe: [42.4, 42.4, 3.2], roundBar: [30, 30, 0], squareBar: [30, 30, 0],
  angle: [50, 50, 5], channel: [80, 45, 6], ibeam: [100, 55, 5.7], tee: [50, 50, 6],
};

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vec = (v) => (Array.isArray(v) ? v : [v.x, v.y, v.z]);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

export function buildAdvanced(f, ctx) {
  switch (f.type) {
    case 'sweep': return buildSweep(f, ctx);
    case 'loft': return buildLoft(f, ctx);
    case 'draft': return buildDraft(f, ctx);
    case 'rib': return buildRib(f, ctx);
    case 'dome': return buildDome(f, ctx);
    case 'helix': return { curve: helixWire(f, ctx) };
    case 'thread': return buildThread(f, ctx);
    case 'wrap': return buildWrap(f, ctx);
    case 'thicken': return buildThicken(f, ctx);
    case 'surfaceExtrude': return { surface: surfaceExtrude(f, ctx) };
    case 'surfaceRevolve': return { surface: surfaceRevolve(f, ctx) };
    case 'surfacePlanar': return { surface: surfacePlanar(f, ctx) };
    case 'surfaceLoft': return { surface: loftOf(f.sketches, ctx, f, true) };
    case 'surfaceOffset': return { surface: surfaceOffset(f, ctx) };
    case 'knit': return buildKnit(f, ctx);
    case 'moveBody': return buildMove(f, ctx);
    case 'scaleBody': return buildScale(f, ctx);
    case 'split': return buildSplit(f, ctx);
    case 'insertPart': return buildInsertPart(f, ctx);
    case 'baseFlange': return buildBaseFlange(f, ctx);
    case 'edgeFlange': return buildEdgeFlange(f, ctx);
    case 'structural': return buildStructural(f, ctx);
    case 'fillSurface': return buildFillSurface(f, ctx);
    case 'boundary': return buildBoundary(f, ctx);
    case 'trimSurface': return buildTrimSurface(f, ctx);
    case 'hem': return buildHem(f, ctx);
    case 'sketchedBend': return buildSketchedBend(f, ctx);
    case 'jog': return buildJog(f, ctx);
    case 'partingLine': return buildPartingLine(f, ctx);
    case 'toolingSplit': return buildToolingSplit(f, ctx);
    case 'sketch3d': return buildSketch3d(f, ctx);
    default:
      if (SHEET_MORE_TYPES.includes(f.type)) return buildSheetMore(f, ctx);
      if (MOLD_MORE_TYPES.includes(f.type)) return buildMoldMore(f, ctx);
      throw codeError('unknown-feature', { type: f.type });
  }
}

// ───────────────────────── sketch curves as 3D wires

/** The sketch's open or closed chain of curves (lines, arcs, splines, circles) as one 3D wire, in order. */
export function sketchWire(sketch, fr) {
  const R = rep();
  const map = new Map(sketch.entities.map((e) => [e.id, e]));
  const W = (id) => { const p = map.get(id); return toWorld(fr, [p.x, p.y]); };
  const curves = sketch.entities.filter((e) => !e.construction && ['line', 'arc', 'spline', 'circle', 'ellipse', ...PIECE_CURVES].includes(e.type));
  if (!curves.length) throw codeError('no-path');
  const ellipse = curves.find((e) => e.type === 'ellipse');
  if (ellipse && curves.length === 1) return R.assembleWire(ellipseEdges(ellipse, map, fr));
  const circle = curves.find((e) => e.type === 'circle');
  if (circle && curves.length === 1) { const c = map.get(circle.c); return R.assembleWire([makeCircleStable(circle.r, toWorld(fr, [c.x, c.y]), fr.normal)]); }
  // Ends merged by position; walk from an end used once (an open path) or from anywhere (a closed one).
  const key = (id) => { const p = map.get(id); return `${Math.round(p.x * 1e5)},${Math.round(p.y * 1e5)}`; };
  const ends = (e) => (e.type === 'spline' ? [e.pts[0], e.pts[e.pts.length - 1]] : [e.p1, e.p2]);
  const degree = new Map();
  for (const e of curves) for (const id of ends(e)) degree.set(key(id), (degree.get(key(id)) ?? 0) + 1);
  const start = curves.find((e) => ends(e).some((id) => degree.get(key(id)) === 1)) ?? curves[0];
  let at = ends(start).find((id) => degree.get(key(id)) === 1) ?? ends(start)[0];
  const left = new Set(curves);
  const edges = [];
  let cur = start;
  while (cur) {
    left.delete(cur);
    const [a, b] = ends(cur);
    const fwd = key(a) === key(at);
    edges.push(...[edgeOf(cur, fwd, map, fr, W)].flat());
    at = fwd ? b : a;
    cur = [...left].find((e) => ends(e).some((id) => key(id) === key(at))) ?? null;
  }
  if (left.size) throw codeError('path-not-chain');
  return R.assembleWire(edges);
}

/** A 3D rational Bézier edge through poles (world points) with weights. */
export function rationalEdge3(poles, weights) {
  const R = rep(); const oc = R.getOC();
  const n = poles.length;
  const arr = new oc.NCollection_Array1_gp_Pnt(1, n); const w = new oc.NCollection_Array1_double(1, n);
  const made = [];
  try {
    poles.forEach((p, i) => { const q = new oc.gp_Pnt(p[0], p[1], p[2]); made.push(q); arr.SetValue(i + 1, q); w.SetValue(i + 1, weights[i]); });
    const rational = weights.some((x) => Math.abs(x - weights[0]) > 1e-15);
    const curve = rational ? new oc.Geom_BezierCurve(arr, w) : new oc.Geom_BezierCurve(arr);
    const maker = new oc.BRepBuilderAPI_MakeEdge(curve);
    const edge = new R.Edge(maker.Edge());
    maker.delete();
    return edge;
  } finally { for (const q of made) q.delete(); arr.delete(); w.delete(); }
}

/** A whole ellipse as four exact rational quadratic edges (a closed path). */
function ellipseEdges(e, map, fr) {
  const c = map.get(e.c);
  return ellipseArcPieces([c.x, c.y], e.rx, e.ry, e.rot ?? 0, 0, Math.PI * 2).map((pc) => rationalEdge3(pc.P.map((p) => toWorld(fr, p)), pc.w));
}

function edgeOf(e, fwd, map, fr, W) {
  const R = rep();
  if (e.type === 'line') return fwd ? R.makeLine(W(e.p1), W(e.p2)) : R.makeLine(W(e.p2), W(e.p1));
  if (e.type === 'arc') {
    const c = map.get(e.c); const p = map.get(e.p1); const q = map.get(e.p2);
    const r = Math.hypot(p.x - c.x, p.y - c.y);
    const a0 = Math.atan2(p.y - c.y, p.x - c.x); let a1 = Math.atan2(q.y - c.y, q.x - c.x);
    while (a1 <= a0) a1 += Math.PI * 2;
    const m = (a0 + a1) / 2;
    const mid = toWorld(fr, [c.x + r * Math.cos(m), c.y + r * Math.sin(m)]);
    return fwd ? R.makeThreePointArc(W(e.p1), mid, W(e.p2)) : R.makeThreePointArc(W(e.p2), mid, W(e.p1));
  }
  // A partial ellipse, a conic or an equation curve: its exact rational Bézier pieces (the plane map is affine).
  if (PIECE_CURVES.includes(e.type)) {
    const pieces = curvePieces({ entities: [...map.values()] }, e, map);
    if (!pieces.length) throw codeError('equation', { message: equationError(e) ?? '' });
    const list = (fwd ? pieces : reversePieces(pieces)).map((pc) => rationalEdge3(pc.P.map((p) => toWorld(fr, p)), pc.w));
    return list;
  }
  // A spline: its Bézier pieces as one approximated curve through its points.
  const pts = e.pts.map((id) => W(id));
  return R.makeBSplineApproximation(fwd ? pts : pts.reverse(), { tolerance: 1e-4, smoothing: null, degMax: 3 });
}

/** A path for a sweep: a sketch (open or closed chain) or a helix feature. */
function pathOf(id, ctx) {
  if (ctx.curves.has(id)) return ctx.curves.get(id);
  const { sketch, frame } = sketchOf({ sketch: id }, ctx, id);
  return sketchWire(sketch, frame);
}

/** Each closed region of a profile sketch: { outer: Wire, holes: [Wire] } on its plane. */
function regionWires(sketch, fr) {
  const plane = replicadPlane(fr);
  const regions = profiles(sketch);
  if (!regions.length) throw codeError('no-profile');
  return regions.map((r) => ({ outer: loopDrawing(r.outer).sketchOnPlane(plane).wire, holes: r.holes.map((h) => loopDrawing(h).sketchOnPlane(plane).wire) }));
}

// ───────────────────────── sweep and loft

function buildSweep(f, ctx) {
  const R = rep();
  if (!f.path) throw codeError('no-path');
  const path = pathOf(f.path, ctx);
  const config = { transitionMode: f.transition === 'round' ? 'round' : f.transition === 'transformed' ? 'transformed' : 'right', frenet: Boolean(f.frenet) };
  // Twist, guide curve, circular profile, thin (sweep-more.js).
  if (needsSweepMore(f)) {
    const prof = f.circular ? {} : sketchOf(f, ctx);
    const tool = sweepMoreTool({ ...f, guideWire: f.guide ? pathOf(f.guide, ctx) : null }, path, config, prof.sketch, prof.frame);
    return { tool, body: combine(ctx, tool, f.op) };
  }
  const { sketch, frame } = sketchOf(f, ctx);
  let tool = null;
  for (const { outer, holes } of regionWires(sketch, frame)) {
    let s = R.genericSweep(outer, path, config, false);
    for (const h of holes) s = s.cut(R.genericSweep(h, path, config, false));
    tool = tool ? tool.fuse(s) : s;
  }
  if (!tool) throw codeError('no-profile');
  return { tool, body: combine(ctx, tool, f.op) };
}

/** A loft through the sketches' outer loops (one closed loop each), in the given order. */
function loftOf(ids, ctx, f, shell = false) {
  if (!ids || ids.length < 2) throw codeError('loft-needs-two');
  const sk = ids.map((id) => {
    const { sketch, frame } = sketchOf({ sketch: id }, ctx, id);
    const regions = profiles(sketch);
    if (!regions.length) throw codeError('no-profile');
    return loopDrawing(regions[0].outer).sketchOnPlane(replicadPlane(frame));
  });
  return sk[0].loftWith(sk.slice(1), { ruled: Boolean(f.ruled) }, shell);
}

function buildLoft(f, ctx) {
  // Guide curves, centre line, start / end conditions, closed, thin (loft-more.js).
  const tool = needsLoftMore(f) ? loftMoreTool(f, ctx, (id) => pathOf(id, ctx)) : loftOf(f.sketches, ctx, f);
  return { tool, body: combine(ctx, tool, f.op) };
}

// ───────────────────────── draft, rib, dome

/**
 * Draft beyond one angle about a neutral plane: a different angle on chosen faces, and parting-line / step draft
 * (each face next to a parting edge turns about that edge, away from the pull direction; Other face also drafts
 * the face on the other side of the parting line). Each face is added with its own plane and angle.
 */
function draftMore(f, ctx) {
  const R = rep(); const oc = R.getOC();
  const body = ctx.body;
  const items = [];
  const angleOf = (face, base) => { const own = (f.angles ?? []).find((x) => { const m = findFace(body, x.sig); return m && m.isSame(face); }); return own ? num(own.angle, base) : base; };
  if (f.kind === 'partingLine' || f.kind === 'step') {
    let pull = f.pull ? resolveDirection(f.pull, ctx) : [0, 0, 1];
    if (f.reverse) pull = mul(pull, -1);
    for (const sig of f.partingEdges ?? []) {
      const [edge] = findEdges(body, [sig]);
      if (!edge) throw codeError('edges-lost');
      const p = vec(edge.pointAt(0.5));
      const faces = body.faces.filter((fc) => fc.edges.some((e) => e.isSame(edge)));
      // The face on the pull side of the edge (its centre lies further along the pull); both with Other face.
      const along = (fc) => (vec(fc.center)[0] - p[0]) * pull[0] + (vec(fc.center)[1] - p[1]) * pull[1] + (vec(fc.center)[2] - p[2]) * pull[2];
      const sorted = faces.filter((fc) => fc.geomType !== 'PLANE' || Math.abs(Math.abs(dot(normalize(vec(fc.normalAt(vec(fc.center)))), pull)) - 1) > 1e-6).sort((x, y) => along(y) - along(x));
      const chosen = f.otherFace ? sorted : sorted.slice(0, 1);
      for (const fc of chosen) items.push({ face: fc, plane: { origin: p, dir: along(fc) >= 0 ? pull : mul(pull, -1) }, angle: angleOf(fc, num(f.angle)) });
    }
  } else {
    const fr = resolvePlane(f.neutral, ctx);
    const n = f.reverse ? mul(fr.normal, -1) : fr.normal;
    for (const sig of f.faces ?? []) { const fc = findFace(body, sig); if (fc) items.push({ face: fc, plane: { origin: fr.origin, dir: n }, angle: angleOf(fc, num(f.angle)) }); }
  }
  if (!items.length) throw codeError('no-faces');
  if (items.some((x) => !(Math.abs(x.angle) > 0) || Math.abs(x.angle) >= 45)) throw codeError('bad-angle');
  const mk = new oc.BRepOffsetAPI_DraftAngle(body.wrapped);
  const made = [];
  try {
    for (const it of items) {
      const o = new oc.gp_Pnt(...it.plane.origin); const d = new oc.gp_Dir(...normalize(it.plane.dir)); const pln = new oc.gp_Pln(o, d);
      made.push(o, d, pln);
      mk.Add(it.face.wrapped, d, (it.angle * Math.PI) / 180, pln, true);
      if (!mk.AddDone()) throw codeError('draft-failed');
    }
    mk.Build(new oc.Message_ProgressRange());
    if (!mk.IsDone()) throw codeError('draft-failed');
    return { body: R.cast(mk.ModifiedShape(body.wrapped)) };
  } finally { mk.delete(); for (const x of made) x.delete(); }
}

function buildDraft(f, ctx) {
  const R = rep();
  if (!ctx.body) throw codeError('no-body');
  if (f.kind === 'partingLine' || f.kind === 'step' || f.angles?.length) return draftMore(f, ctx);
  const faces = (f.faces ?? []).map((sig) => findFace(ctx.body, sig)).filter(Boolean);
  if (!faces.length) throw codeError('no-faces');
  const fr = resolvePlane(f.neutral, ctx);
  const n = f.reverse ? mul(fr.normal, -1) : fr.normal;
  const neutral = new R.Plane(fr.origin, fr.xDir, n);
  const angle = num(f.angle);
  if (!(Math.abs(angle) > 0) || Math.abs(angle) >= 45) throw codeError('bad-angle');
  return { body: ctx.body.draft(angle, (finder) => finder.when(({ element }) => faces.some((m) => m.isSame(element))), neutral) };
}

/**
 * Rib: an open sketch (lines) on a plane through the part; the rib is the region between the sketch line and
 * the body, `thickness` thick about the sketch plane. The region runs from the line toward the body (or the
 * other way with `flip`) and is clipped to the body's bounding box.
 */
function buildRib(f, ctx) {
  const R = rep();
  if (!ctx.body) throw codeError('no-body');
  const { sketch, frame } = sketchOf(f, ctx);
  // Curves, normal direction, one side, linear extension, draft (rib-more.js).
  if (needsRibMore(f) || sketch.entities.some((e) => !e.construction && ['arc', 'spline', 'ellipse', 'conic', 'parabola', 'equation', 'partialEllipse'].includes(e.type))) return ribMore(f, ctx);
  const lines = sketch.entities.filter((e) => e.type === 'line' && !e.construction);
  if (!lines.length) throw codeError('no-path');
  const [lo, hi] = ctx.body.boundingBox.bounds;
  const big = sizeAround(ctx) * 2;
  const t = Math.max(0.01, num(f.thickness, 3));
  const P = (id) => { const p = byId(sketch, id); return [p.x, p.y]; };
  let tool = null;
  for (const l of lines) {
    const a = P(l.p1); const b = P(l.p2);
    const d = [b[0] - a[0], b[1] - a[1]]; const L = Math.hypot(...d) || 1;
    const plane = replicadPlane({ ...frame, origin: add(frame.origin, mul(frame.normal, -t / 2)) });
    const slabOf = (n) => R.draw(a).lineTo(b).lineTo([b[0] + n[0] * big, b[1] + n[1] * big]).lineTo([a[0] + n[0] * big, a[1] + n[1] * big]).close().sketchOnPlane(plane).extrude(t).intersect(R.makeBox(lo, hi));
    // The rib fills the side where the material is (the walls it joins); Flip takes the other side.
    const n1 = [-d[1] / L, d[0] / L]; const n2 = [d[1] / L, -d[0] / L];
    const s1 = slabOf(n1); const s2 = slabOf(n2);
    const touch = (s) => { try { return R.measureVolume(s.clone().intersect(ctx.body)); } catch { return 0; } };
    let pick = touch(s1) >= touch(s2) ? s1 : s2;
    if (f.flip) pick = pick === s1 ? s2 : s1;
    tool = tool ? tool.fuse(pick) : pick;
  }
  return { tool, body: ctx.body.fuse(tool) };
}

/** Dome on a planar face: a spherical cap of `height` over the face (reverse = a dish cut into it). */
function buildDome(f, ctx) {
  const R = rep();
  if (!ctx.body) throw codeError('no-body');
  const face = findFace(ctx.body, f.faces?.[0]);
  if (!face || face.geomType !== 'PLANE') throw codeError('face-missing');
  const p = planeOfFace(face);
  const h = Math.abs(num(f.height, 5));
  if (!(h > 0)) throw codeError('zero-size');
  // A direction other than the face's normal: the dome leans along it (sheared, sections lofted).
  if (f.direction && !(f.direction.kind === 'axis' && (f.direction.axis ?? 'normal') === 'normal')) {
    const d = normalize(resolveDirection(f.direction, ctx));
    const up0 = mul(p.normal, f.reverse ? -1 : 1);
    const along = d[0] * up0[0] + d[1] * up0[1] + d[2] * up0[2];
    if (Math.abs(along) > 1e-3 && Math.abs(along) < 1 - 1e-9) return domeDirected(f, ctx, face, p, h, along > 0 ? d : mul(d, -1));
  }
  if (f.shape === 'elliptical' || f.shape === 'continuous') return domeMore(f, ctx, face, p, h);
  let r = 0;
  for (const e of face.edges) for (const t of [0, 0.25, 0.5, 0.75, 1]) r = Math.max(r, Math.hypot(...sub(vec(e.pointAt(t)), p.origin)));
  const Rs = (r * r + h * h) / (2 * h);
  const out = f.reverse ? -1 : 1;
  // The cap is its arc profile revolved about the face's normal (a kernel sphere gave unreliable booleans).
  // It reaches a little into the body: a cap that only touches the face is lost by the kernel's fuse.
  const up = mul(p.normal, out);
  const eps = h * 0.02;
  const phi = Math.atan2(r, Rs - h);
  const arcAt = (a) => [Rs * Math.sin(a), h - Rs + Rs * Math.cos(a)];
  const profile = R.draw([0, h]).threePointsArcTo(arcAt(phi), arcAt(phi / 2)).lineTo([r, -eps]).lineTo([0, -eps]).close();
  let tool = profile.sketchOnPlane(new R.Plane(p.origin, p.xDir, crossV(p.xDir, up))).revolve(up, { origin: p.origin });
  try {
    // On a copy of the face: building on the body's own edges would change the body.
    if (face.edges.length === 1 && face.edges[0].geomType === 'CIRCLE') throw new Error('round');
    const prism = R.basicFaceExtrusion(face.clone(), new R.Vector(mul(p.normal, out * (h * 2 + 1))));
    const clipped = tool.clone().intersect(prism);
    const v = R.measureVolume(clipped);
    if (v > 1e-9 && v <= R.measureVolume(tool) + 1e-6) tool = clipped;
  } catch { /* a round face: the cap is already right */ }
  return { tool, toolOp: f.reverse ? 'cut' : 'boss', body: f.reverse ? ctx.body.cut(tool) : ctx.body.fuse(tool) };
}

/**
 * A dome leaning along direction `d` (not the face's normal): each level of the dome (its outline scaled about
 * the face's centre, at height z) moved along d so that it rises along d instead of the normal — a shear, which
 * keeps the volume and the height above the face. Spherical: the levels of the sphere cap; elliptical and
 * continuous: of the quarter ellipse. The levels are lofted to the top point.
 */
function domeDirected(f, ctx, face, p, h, d) {
  const R = rep(); const oc = R.getOC();
  const up = mul(p.normal, f.reverse ? -1 : 1);
  const c = vec(face.center);
  const lean = sub(mul(d, 1 / (d[0] * up[0] + d[1] * up[1] + d[2] * up[2])), up);
  const outline = face.clone().outerWire();
  let r = 0;
  for (const e of face.edges) for (const t of [0, 0.25, 0.5, 0.75, 1]) r = Math.max(r, Math.hypot(...sub(vec(e.pointAt(t)), c)));
  const n = 24;
  const levels = [];
  if ((f.shape ?? 'spherical') === 'spherical') {
    const Rs = (r * r + h * h) / (2 * h); const phi = Math.atan2(r, Rs - h);
    for (let i = 0; i < n; i++) { const a = phi * (1 - i / n); levels.push([(Rs * Math.sin(a)) / r, h - Rs + Rs * Math.cos(a)]); }
  } else for (let i = 0; i < n; i++) { const a = (Math.PI / 2) * (i / n); levels.push([Math.cos(a), h * Math.sin(a)]); }
  const spherical = (f.shape ?? 'spherical') === 'spherical';
  // A spherical dome is the sphere cap over the circle round the face, cut to the face: its levels are circles
  // (sheared), and the cap is cut by the face extruded along the direction.
  const circleWire = (rad, at) => R.assembleWire([R.makeCircle(rad, at, up)]);
  const mk = new oc.BRepOffsetAPI_ThruSections(true, false, 1e-6);
  for (const [k, z] of levels) {
    const shift = add(mul(up, z), mul(lean, z));
    mk.AddWire((spherical ? circleWire(k * r, add(c, shift)) : outline.clone().scale(k, c).translate(shift)).wrapped);
  }
  mk.AddVertex(R.makeVertex(add(c, add(mul(up, h), mul(lean, h)))).wrapped);
  mk.Build(new oc.Message_ProgressRange());
  if (!mk.IsDone()) { mk.delete(); throw codeError('dome-failed'); }
  let tool = R.cast(mk.Shape()); mk.delete();
  if (R.measureVolume(tool) < 0) tool = R.cast(tool.wrapped.Reversed());
  if (spherical && !(face.edges.length === 1 && face.edges[0].geomType === 'CIRCLE')) {
    const prism = R.basicFaceExtrusion(face.clone(), new R.Vector(mul(d, (h * 2 + 1) / (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]))));
    tool = tool.intersect(prism);
  }
  tool = tool.fuse(R.basicFaceExtrusion(face.clone(), new R.Vector(mul(up, -h * 0.01))));
  return { tool, toolOp: f.reverse ? 'cut' : 'boss', body: f.reverse ? ctx.body.cut(tool) : ctx.body.fuse(tool) };
}

/**
 * Elliptical and continuous domes. On a circular face, elliptical: a quarter ellipse (semi-axes r and h, an
 * exact rational arc) turned about the face's normal. Otherwise (continuous, or elliptical on another face):
 * the face's outline shrunk about its centre by cos φ and raised by h sin φ, sections lofted from the face up to
 * the top point — the dome meets the side walls square (tangent to walls standing on the face).
 */
function domeMore(f, ctx, face, p, h) {
  const R = rep(); const oc = R.getOC();
  const out = f.reverse ? -1 : 1;
  const up = mul(p.normal, out);
  // One circle (or its arcs): the face's edges all circles about one centre with one radius.
  const circles = face.edges.filter((e) => e.geomType === 'CIRCLE').map((e) => circleOfEdge(e));
  const circle = circles.length === face.edges.length && circles.every((c) => Math.hypot(...sub(c.centre, circles[0].centre)) < 1e-6 && Math.abs(c.radius - circles[0].radius) < 1e-6);
  const c = vec(face.center);
  let tool;
  if (circle) {
    const { centre, radius } = circles[0];
    const x = normalize(sub(vec(face.edges[0].pointAt(0)), centre));
    const P = (a, b) => add(centre, add(mul(x, a), mul(up, b)));
    const w = Math.SQRT1_2;
    const arc = rationalEdge3([P(radius, 0), P(radius, h), P(0, h)], [1, w, 1]);
    const prof = R.makeFace(R.assembleWire([R.makeLine(P(0, 0), P(radius, 0)), arc, R.makeLine(P(0, h), P(0, 0))]));
    tool = R.revolution(prof, centre, up, 360);
  } else {
    const outline = face.clone().outerWire();
    const mk = new oc.BRepOffsetAPI_ThruSections(true, false, 1e-6);
    const n = 12;
    for (let i = 0; i < n; i++) {
      const phi = (Math.PI / 2) * (i / n);
      const k = Math.cos(phi);
      const w = outline.clone().scale(k, c).translate(mul(up, h * Math.sin(phi)));
      mk.AddWire(w.wrapped);
    }
    mk.AddVertex(R.makeVertex(add(c, mul(up, h))).wrapped);
    mk.Build(new oc.Message_ProgressRange());
    if (!mk.IsDone()) { mk.delete(); throw codeError('dome-failed'); }
    tool = R.cast(mk.Shape());
    mk.delete();
    if (R.measureVolume(tool) < 0) tool = R.cast(tool.wrapped.Reversed());
  }
  // With a thin slab under the face (inside the body): a tool that only touches the face is lost by the fuse.
  tool = tool.fuse(R.basicFaceExtrusion(face.clone(), new R.Vector(mul(up, -h * 0.01))));
  return { tool, toolOp: f.reverse ? 'cut' : 'boss', body: f.reverse ? ctx.body.cut(tool) : ctx.body.fuse(tool) };
}

// ───────────────────────── helix and thread

/** Points of a tapered / variable-pitch helix or of a flat spiral, then a fitted B-spline wire. */
export function helixPoints(f) {
  const turns = Math.max(0.05, num(f.turns, 4));
  const r0 = Math.max(0.01, num(f.radius, 10));
  const per = 96; const n = Math.max(8, Math.ceil(turns * per));
  const rows = (f.variable ?? []).map((x) => ({ rev: num(x.rev), pitch: num(x.pitch, num(f.pitch, 5)), d: num(x.d, 2 * r0) })).sort((a, b) => a.rev - b.rev);
  const at = (u, key) => {
    if (!rows.length) return null;
    if (u <= rows[0].rev) return rows[0][key];
    for (let i = 1; i < rows.length; i++) if (u <= rows[i].rev) { const k = (u - rows[i - 1].rev) / ((rows[i].rev - rows[i - 1].rev) || 1); return rows[i - 1][key] + k * (rows[i][key] - rows[i - 1][key]); }
    return rows[rows.length - 1][key];
  };
  const tan = Math.tan((num(f.taper) * Math.PI) / 180) * (f.taperOutward ? 1 : -1);
  const pts = []; let z = 0; let prevU = 0;
  for (let i = 0; i <= n; i++) {
    const u = (turns * i) / n;
    let r;
    if (f.kind === 'spiral') r = r0 + num(f.pitch, 5) * u;
    else {
      // Height grows by the pitch per turn (the pitch at that turn for a variable one).
      if (i) z += rows.length ? ((at(prevU, 'pitch') + at(u, 'pitch')) / 2) * (u - prevU) : num(f.pitch, 5) * (u - prevU);
      r = rows.length ? at(u, 'd') / 2 : r0 + z * tan;
    }
    prevU = u;
    pts.push({ u, r, z: f.kind === 'spiral' ? 0 : z });
  }
  return pts;
}

function helixMoreWire(f, fr, centre) {
  const R = rep();
  const y = fr.yDir; const x = fr.xDir; const nrm = fr.normal;
  const hand = f.lefthand ? -1 : 1;
  const pts = helixPoints(f).map(({ u, r, z }) => { const a = 2 * Math.PI * u * hand; return [0, 1, 2].map((k) => centre[k] + x[k] * r * Math.cos(a) + y[k] * r * Math.sin(a) + nrm[k] * z); });
  return R.assembleWire([R.makeBSplineApproximation(pts, { tolerance: 1e-5, degMax: 8, smoothing: null })]);
}

function helixWire(f, ctx) {
  const R = rep();
  const fr = resolvePlane(f.plane, ctx);
  const centre = toWorld(fr, f.center ?? [0, 0]);
  // Taper, variable pitch and spiral: the curve computed densely and fitted by a B-spline (1e-5 mm).
  if ((f.kind && f.kind !== 'helix') || num(f.taper) || f.variable?.length) return helixMoreWire(f, fr, centre);
  const pitch = Math.max(0.01, num(f.pitch, 5)); const turns = Math.max(0.05, num(f.turns, 4));
  return makeHelixStable(pitch, pitch * turns, Math.max(0.01, num(f.radius, 10)), centre, fr.normal, Boolean(f.lefthand));
}

/**
 * Thread groove cross-sections, [axial offset, depth] in units of the pitch P (depth 0 is a little outside the
 * surface, positive into the material): the 60° V (ISO / UN), ISO 2904 trapezoidal (30°), the 45° / 7° buttress
 * and the 55° pipe thread (Whitworth form, crests and roots left sharp).
 */
export const THREAD_SECTIONS = {
  v: (P) => [[-0.425 * P, 0], [0.425 * P, 0], [0, 0.6 * P]],
  trapezoidal: (P) => [[-0.317 * P, 0], [0.317 * P, 0], [0.183 * P, 0.5 * P], [-0.183 * P, 0.5 * P]],
  buttress: (P) => [[-0.4 * P, 0], [0.4 * P, 0], [-0.326 * P + 0.12 * P, 0.6 * P], [-0.326 * P, 0.6 * P]],
  pipe55: (P) => [[-0.4 * P, 0], [0.4 * P, 0], [0, 0.4 * P / Math.tan((27.5 * Math.PI) / 180)]],
};

/**
 * A thread's groove as a faceted solid: its cross-section (THREAD_SECTIONS, base on the surface, a little
 * outside it) placed every 1/24 turn along the helix of lead (P × starts) from one lead before the edge to
 * L past it, consecutive sections joined by triangles, the ends closed, sewn into a solid; phase turns the
 * start (the starts of a multi-start thread).
 */
export function helicalGroove(centre, dir, xDir, radius, P, L, internal = false, lefthand = false, seg = 24, { form = 'v', lead = P, phase = 0 } = {}) {
  const R = rep(); const oc = R.getOC();
  const y = crossV(dir, xDir);
  const shape = (THREAD_SECTIONS[form] ?? THREAD_SECTIONS.v)(P);
  const out = 0.06 * P;
  const rAt = (depth) => (depth <= 0 ? (internal ? radius - out : radius + out) : internal ? radius + depth : radius - depth);
  const n = Math.ceil(((L + lead) / lead) * seg);
  const at = (rr, z, ang) => [0, 1, 2].map((k) => centre[k] + dir[k] * z + rr * (Math.cos(ang) * xDir[k] + Math.sin(ang) * y[k]));
  const section = (i) => { const ang = phase + (lefthand ? -1 : 1) * (i / seg) * 2 * Math.PI; const z = -lead + (i / seg) * lead; return shape.map(([dz, depth]) => at(rAt(depth), z + dz, ang)); };
  const sew = new oc.BRepBuilderAPI_Sewing(1e-6, true, true, true, false);
  const tri = (p, q, r) => sew.Add(R.makePolygon([p, q, r]).wrapped);
  const cap = (pts, flip) => { for (let k = 1; k + 1 < pts.length; k++) (flip ? tri(pts[0], pts[k + 1], pts[k]) : tri(pts[0], pts[k], pts[k + 1])); };
  const m = shape.length;
  let prev = section(0);
  cap(prev, true);
  for (let i = 1; i <= n; i++) {
    const cur = section(i);
    for (let k = 0; k < m; k++) { const a0 = prev[k]; const a1 = prev[(k + 1) % m]; const b0 = cur[k]; const b1 = cur[(k + 1) % m]; tri(a0, a1, b1); tri(a0, b1, b0); }
    prev = cur;
  }
  cap(prev, false);
  sew.Perform(new oc.Message_ProgressRange());
  const shell = R.cast(sew.SewedShape());
  sew.delete();
  let solid = R.makeSolid([shell]);
  if (R.measureVolume(solid) < 0) solid = R.cast(solid.wrapped.Reversed());
  return solid;
}

/** A circular edge's circle: { centre, normal, radius }. */
export function circleOfEdge(edge) {
  const p = [0, 0.25, 0.5].map((t) => vec(edge.pointAt(t)));
  const ab = sub(p[1], p[0]); const ac = sub(p[2], p[0]);
  const n = crossV(ab, ac); const d = 2 * dot(n, n);
  const c = add(p[0], mul(add(mul(crossV(n, ab), dot(ac, ac)), mul(crossV(ac, n), dot(ab, ab))), 1 / d));
  return { centre: c, normal: normalize(n), radius: Math.hypot(...sub(p[0], c)) };
}

function insideBody(body, p, r) {
  const R = rep();
  try { return R.measureVolume(body.clone().intersect(R.makeBox(sub(p, [r, r, r]), add(p, [r, r, r])))) > 8 * r ** 3 * 0.5; } catch { return false; }
}

/**
 * A thread on a cylindrical edge (a shaft's end or a hole's rim), cut into the material for `length` from the
 * edge. "auto" finds out whether it is a shaft (external) or a hole (internal).
 *   form 'iso'  (new threads) an ISO metric thread: M d × P from `size` (or d from the shaft / the hole and the
 *               pitch), cosmetic or modelled by `mode` ('auto' follows the global modelled-threads option,
 *               'cosmetic', 'modelled'); modelled is the exact ISO 68-1 / 965-1 profile swept along the screw
 *   no form     (older files) a 60° V groove, 0.6·P deep, faceted along the helix; `cosmetic` = a note only
 * `cosmetic: true` always makes it cosmetic.
 */
function buildThread(f, ctx) {
  const R = rep();
  if (!ctx.body) throw codeError('no-body');
  const [edge] = findEdges(ctx.body, f.edge ? [f.edge] : []);
  if (!edge || edge.geomType !== 'CIRCLE') throw codeError('edge-missing');
  const { centre, normal, radius } = circleOfEdge(edge);
  const P = Math.max(0.1, num(f.pitch, 1.5));
  const L = Math.max(P, num(f.length, 10));
  const probe = Math.min(radius, P) * 0.3;
  const step = Math.min(L, radius) * 0.5;
  // Which way the material is, and whether it is inside the circle (shaft) or around it (hole).
  let dir = null; let internal = null;
  const perp = normalize(Math.abs(normal[0]) < 0.9 ? crossV(normal, [1, 0, 0]) : crossV(normal, worldUp()));
  for (const s of [1, -1]) {
    const d = mul(normal, s);
    if (insideBody(ctx.body, add(centre, mul(d, step)), probe)) { dir = d; internal = false; break; }
    if (insideBody(ctx.body, add(add(centre, mul(d, step)), mul(perp, radius + probe * 2)), probe)) { dir = d; internal = true; }
  }
  if (!dir) throw codeError('thread-no-material');
  if (f.internal === true || f.internal === 'internal') internal = true;
  if (f.internal === false || f.internal === 'external') internal = false;
  if (f.reverse) dir = mul(dir, -1);
  // Start offset: the thread begins this far from the edge along the axis (before it: negative — what lies before
  // the edge is outside the material, so it starts at the edge). Trimming with the end face stops it at the
  // cylinder's end.
  const offset = num(f.offset, 0);
  const run0 = cylinderRun(ctx.body, centre, dir, radius);
  // Nothing is cut before the thread's start (a groove's lead-in would): from the offset, or from the edge.
  const clip = { lo: Math.max(0, offset), hi: f.trimEnd !== false && run0 > 1e-6 ? run0 : Infinity };
  const start = add(centre, mul(dir, offset));
  if (f.form === 'iso' || (THREAD_SECTIONS[f.form] && !f.cosmetic && f.faceted !== true)) return buildIsoThread(f, ctx, { centre: start, dir, radius, P, L, internal, edgeCentre: centre, clip, offset });
  if (f.cosmetic) return { thread: { centre: start, dir, radius, pitch: P, length: L, internal } };
  // The groove is a V (60°, 0.6·P deep) swept along the helix, built from flat triangles (24 per turn): a
  // faceted solid the kernel's booleans handle reliably (smooth swept or twisted solids are often missed).
  // One groove per start, each turned 360°/starts, all on the lead (P × starts).
  const starts = Math.max(1, Math.min(8, Math.round(num(f.starts, 1))));
  const form = THREAD_SECTIONS[f.form] ? f.form : 'v';
  let tool = null;
  for (let k = 0; k < starts; k++) {
    const g = helicalGroove(start, dir, perp, radius, P, L, internal, Boolean(f.lefthand), 24, { form, lead: P * starts, phase: (2 * Math.PI * k) / starts });
    tool = tool ? tool.fuse(g) : g;
  }
  tool = clipAlong(tool, centre, dir, radius + 2 * P, clip, offset, offset + L);
  const before = R.measureVolume(ctx.body);
  const body = ctx.body.cut(tool.clone());
  if (!(before - R.measureVolume(body) > 1e-6 * Math.max(1, before))) throw codeError('thread-failed');
  return { tool, toolOp: 'cut', body, thread: { centre: start, dir, radius, pitch: P, length: L, internal } };
}

/**
 * A thread tool cut to the axial range [lo, hi] (from the edge's centre along dir; infinite ends: as far as the
 * tool goes from `from` to `to`) by a cylinder of radius r — trimming with the start / end face.
 */
function clipAlong(tool, centre, dir, r, { lo, hi }, from, to) {
  if (!Number.isFinite(lo) && !Number.isFinite(hi)) return tool;
  const a = Number.isFinite(lo) ? lo : from - 1e3; const b = Number.isFinite(hi) ? hi : to + 1e3;
  if (!(b > a)) throw codeError('thread-failed');
  const zone = rep().makeCylinder(r, b - a, add(centre, mul(dir, a)), dir);
  return tool.intersect(zone, { simplify: false });
}

/**
 * How far the shaft / hole of a circular edge runs along `dir` from its centre: the farthest coaxial circle of
 * the same radius (the far end of the cylinder) — a modelled thread must end on that face, not past it.
 */
function cylinderRun(body, centre, dir, radius) {
  let run = 0;
  for (const e of body.edges) {
    if (e.geomType !== 'CIRCLE') continue;
    let c;
    try { c = circleOfEdge(e); } catch { continue; }
    if (Math.abs(c.radius - radius) > 1e-4 * Math.max(1, radius)) continue;
    const off = sub(c.centre, centre); const along = dot(off, dir);
    if (Math.hypot(...sub(off, mul(dir, along))) > 1e-4 * Math.max(1, radius)) continue;
    run = Math.max(run, along);
  }
  return run;
}

/** An ISO metric thread on a shaft or in a hole: cosmetic (a thread record) or modelled (exact, threads.js). */
function buildIsoThread(f, ctx, { centre, dir, radius, P, L, internal, edgeCentre = centre, clip = { lo: 0, hi: Infinity }, offset = 0 }) {
  const R = rep();
  const iso = !f.form || f.form === 'iso';
  const named = iso ? parseThreadSize(f.size) : null;
  // M d × P: the named size, else the shaft's diameter (external) or the hole's minor diameter plus the
  // thread depth (internal, a hole drilled to D1). Other forms: their basic profile on the shaft / in the hole.
  let spec;
  if (iso) {
    const d = named?.d ?? (internal ? 2 * radius + 1.25 * (Math.sqrt(3) / 2) * P : 2 * radius);
    const pitch = named ? (Number(f.pitch) > 0 ? Number(f.pitch) : named.P) : P;
    try { spec = isoThread(d, pitch); } catch { throw codeError('thread-size'); }
  } else {
    const starts = Math.max(1, Math.min(8, Math.round(num(f.starts, 1))));
    try {
      const depth = formThread(f.form, 100, P).depth;
      spec = formThread(f.form, internal ? 2 * radius + 2 * depth : 2 * radius, P, { starts });
    } catch { throw codeError('thread-size'); }
  }
  // The run from the thread's start (the edge's run less the offset); a thread starting before the edge and trimmed
  // with the start face begins at the edge.
  const run = Math.max(0, cylinderRun(ctx.body, edgeCentre, dir, radius) - offset);
  // Trimmed with the end face (the default) the thread stops where the cylinder ends; not trimmed it runs its length.
  let length = run > 1e-6 && f.trimEnd !== false ? Math.min(L, run) : L;
  if (offset < 0) { centre = edgeCentre; length = Math.max(spec.P, length + offset); }
  const modelled = f.cosmetic !== true && (iso ? wantsModelled(f.mode ?? 'auto') : true);
  const record = iso ? cosmeticThread({ centre, dir, length, internal, d: spec.d, P: spec.P, radius, modelled, lefthand: Boolean(f.lefthand) })
    : { centre: [...centre], dir: [...dir], length, internal: Boolean(internal), pitch: spec.P, major: spec.d, minor: spec.d1, pitchDiameter: spec.d2, radius, size: `${f.form} ${Math.round(spec.d * 100) / 100}×${spec.P}${spec.starts > 1 ? ` (${spec.starts} starts)` : ''}${f.lefthand ? '-LH' : ''}`, modelled: true, lefthand: Boolean(f.lefthand) };
  if (!modelled) return { thread: record, threads: [record] };
  const before = R.measureVolume(ctx.body);
  // Ending inside material (a shoulder, the plain rest of the shaft, the bottom of a blind hole), the thread
  // fades out over the runout instead of stopping at full depth — nothing is cut past its end.
  const probe = Math.min(radius, spec.P) * 0.25;
  const beyond = add(centre, mul(dir, length + spec.P * 0.4));
  const perpDir = normalize(Math.abs(dir[0]) < 0.9 ? crossV(dir, [1, 0, 0]) : crossV(dir, [0, 1, 0]));
  const endsInMaterial = length < run - 1e-6 || insideBody(ctx.body, internal ? beyond : add(beyond, mul(perpDir, radius * 0.5)), probe) || (!internal && insideBody(ctx.body, add(beyond, mul(perpDir, radius + probe * 2)), probe));
  const fr = threadFrame(centre, dir);
  let body;
  try {
    if (internal) {
      let hole = threadSolid(spec, 'internal', { origin: centre, dir, length, lefthand: Boolean(f.lefthand) });
      if (endsInMaterial) hole = hole.intersect(internalRunoutBlank(spec, fr, length, radius), { simplify: false });
      body = ctx.body.cut(hole, { simplify: false });
    } else {
      // The shaft over the threaded length is swapped for the threaded rod trimmed to it (its chamfers kept).
      const zone = R.makeCylinder(radius + 0.3 * spec.P, length, centre, dir);
      const piece = ctx.body.clone().intersect(zone.clone(), { simplify: false });
      const rest = ctx.body.clone().cut(zone, { simplify: false });
      let rod = threadSolid(iso ? spec : { ...spec, lift: 1e-4 }, 'external', { origin: centre, dir, length, lefthand: Boolean(f.lefthand) }).intersect(piece, { simplify: false });
      if (endsInMaterial) rod = rod.fuse(externalRunoutCore(spec, fr, length), { simplify: false });
      body = R.measureVolume(rest) > 1e-9 ? rest.fuse(rod, { optimisation: 'commonFace', simplify: false }) : rod;
    }
  } catch { throw codeError('thread-failed'); }
  const removed = before - R.measureVolume(body);
  if (!(removed > 1e-6 * Math.max(1, before))) throw codeError('thread-failed');
  return { body, thread: record, threads: [record], removed, runout: endsInMaterial };
}

// ───────────────────────── wrap

/**
 * Wrap (projected): the sketch's regions on a plane beside a cylindrical (or planar) face are projected onto
 * it and raised by `depth` (emboss) or sunk into it (deboss). The projection runs toward the face's axis, so
 * text and logos on a cylinder keep their width only near the middle — a full wrap maps by arc length.
 */
function buildWrap(f, ctx) {
  const R = rep();
  if (!ctx.body) throw codeError('no-body');
  if (f.op === 'scribe') {
    // Scribe: the face split along the wrapped outline (the emboss tool's footprint on it); the body keeps its volume.
    const oc = R.getOC();
    const face = findFace(ctx.body, f.face);
    if (!face) throw codeError('face-missing');
    const { tool } = buildWrap({ ...f, op: 'emboss', depth: 1 }, { ...ctx, body: ctx.body.clone() });
    const out = []; let split = 0;
    for (const fc of ctx.body.faces) {
      if (!fc.isSame(face)) { out.push(fc.clone()); continue; }
      const args = new oc.NCollection_List_TopoDS_Shape(); args.Append(fc.clone().wrapped);
      const tools = new oc.NCollection_List_TopoDS_Shape(); tools.Append(tool.clone().wrapped);
      const sp = new oc.BRepAlgoAPI_Splitter();
      sp.SetArguments(args); sp.SetTools(tools); sp.Build(new oc.Message_ProgressRange());
      const pieces = sp.HasErrors() ? [fc.clone()] : R.cast(sp.Shape()).faces;
      sp.delete();
      if (pieces.length > 1) split++;
      out.push(...pieces);
    }
    if (!split) throw codeError('projection-missed');
    const sew = new oc.BRepBuilderAPI_Sewing(1e-5, true, true, true, false);
    for (const fc of out) sew.Add(fc.wrapped);
    sew.Perform(new oc.Message_ProgressRange());
    let body = R.makeSolid([R.cast(sew.SewedShape())]);
    sew.delete();
    if (R.measureVolume(body) < 0) body = R.cast(body.wrapped.Reversed());
    return { body, splitFaces: split };
  }
  const { sketch, frame } = sketchOf(f, ctx);
  const face = findFace(ctx.body, f.face);
  if (!face) throw codeError('face-missing');
  const depth = Math.max(0.01, num(f.depth, 1));
  // Closed regions and sketch text alike (engraved names on a knob).
  const drawing = sketchDrawing(sketch);
  if (isCylinder(face.geomType)) {
    // A true wrap: the sketch is laid on the cylinder by arc length (its x goes around, its y along the axis).
    try {
      const tool = wrapOnCylinder(face, drawing, frame, depth, f.op === 'deboss');
      const op = f.op === 'deboss' ? 'cut' : 'boss';
      return { tool, toolOp: op, body: combine(ctx, tool, op) };
    } catch { /* fall back to the projection below */ }
  }
  let shellRegion;
  let reach;
  if (isCylinder(face.geomType)) {
    const rad = cylinderRadius(face);
    const axisEdge = face.edges.find((e) => e.geomType === 'CIRCLE');
    if (!rad || !axisEdge) throw codeError('face-missing');
    const circ = circleOfEdge(axisEdge);
    const big = sizeAround(ctx) * 2;
    const base = add(circ.centre, mul(circ.normal, -big / 2));
    const outer = f.op === 'deboss' ? makeCylinderStable(rad + 1e-3, big, base, circ.normal) : makeCylinderStable(rad + depth, big, base, circ.normal);
    const inner = f.op === 'deboss' ? makeCylinderStable(Math.max(0.01, rad - depth), big, base, circ.normal) : makeCylinderStable(rad - 1e-3, big, base, circ.normal);
    shellRegion = outer.cut(inner);
    reach = Math.abs(dot(sub(circ.centre, frame.origin), frame.normal));
  } else if (face.geomType === 'PLANE') {
    const p = planeOfFace(face);
    const along = f.op === 'deboss' ? -depth : depth;
    shellRegion = R.basicFaceExtrusion(face.clone(), new R.Vector(mul(p.normal, along)));
    reach = Math.abs(dot(sub(p.origin, frame.origin), frame.normal)) + depth * 2;
  } else throw codeError('face-missing');
  // From the sketch plane toward the face (only the near side of a cylinder).
  const toward = dot(sub(face.geomType === 'PLANE' ? planeOfFace(face).origin : vec(face.center), frame.origin), frame.normal) >= 0 ? 1 : -1;
  const prism = drawing.sketchOnPlane(replicadPlane(frame)).extrude(toward * Math.max(reach, depth * 2));
  const tool = prism.intersect(shellRegion);
  const op = f.op === 'deboss' ? 'cut' : 'boss';
  return { tool, toolOp: op, body: combine(ctx, tool, op) };
}

/**
 * Lays a sketch on a cylinder by arc length. The sketch plane's origin, pushed onto the cylinder, is where the
 * sketch's (0, 0) lands; its x runs around the cylinder and its y along the axis. Returns the raised (or sunk)
 * solid of `depth`.
 */
function wrapOnCylinder(face, drawing, frame, depth, sink) {
  const R = rep();
  const edge = face.edges.find((e) => e.geomType === 'CIRCLE');
  const rad = cylinderRadius(face);
  if (!edge || !rad) throw codeError('face-missing');
  const circ = circleOfEdge(edge);
  const axisDir = circ.normal;
  const foot = (p) => add(circ.centre, mul(axisDir, dot(sub(p, circ.centre), axisDir)));
  const onCyl = (p) => { const f0 = foot(p); const r = normalize(sub(p, f0)); return add(f0, mul(r, rad)); };
  const surf = face.clone();
  const p0 = onCyl(frame.origin);
  const [u0, v0] = surf.uvCoordinates(p0);
  // How the face's (u, v) change along the sketch's x and y (u is an angle, v a length along the axis).
  const eps = Math.min(1, rad * 0.01);
  const wrapU = (u) => { let d = u - u0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  const [ux] = surf.uvCoordinates(onCyl(add(p0, mul(frame.xDir, eps))));
  const [, vy] = surf.uvCoordinates(onCyl(add(p0, mul(frame.yDir, eps))));
  const sx = wrapU(ux) / eps;
  const sy = (vy - v0) / eps;
  if (!(Math.abs(sx) > 1e-9) || !(Math.abs(sy) > 1e-9)) throw codeError('face-missing');
  // (replicad's stretch(ratio, direction) scales across `direction`: [0, 1] stretches x.)
  const mapped = drawing.stretch(sx, [0, 1], [0, 0]).stretch(sy, [1, 0], [0, 0]).translate(u0, v0);
  const sketches = mapped.sketchOnFace(surf, 'native');
  const faces = sketches.sketches ? sketches.sketches.map((s) => s.face()) : [sketches.face()];
  let tool = null;
  for (const fc of faces) {
    const solid = thickOf(fc, sink ? -depth : depth);
    tool = tool ? tool.fuse(solid) : solid;
  }
  return tool;
}

// ───────────────────────── surfaces and thicken

function prismOf(shape, v) {
  const R = rep(); const oc = R.getOC();
  const vv = new R.Vector(v);
  const mk = new oc.BRepPrimAPI_MakePrism(shape.wrapped, vv.wrapped, false, true);
  const out = R.cast(mk.Shape());
  mk.delete();
  return out;
}

function revolOf(shape, origin, dir, degrees) {
  const R = rep(); const oc = R.getOC();
  const ax = R.makeAx1(origin, dir);
  const mk = new oc.BRepPrimAPI_MakeRevol(shape.wrapped, ax, (degrees * Math.PI) / 180, false);
  const out = R.cast(mk.Shape());
  mk.delete();
  return out;
}

function surfaceExtrude(f, ctx) {
  const { sketch, frame } = sketchOf(f, ctx);
  const wire = sketchWire(sketch, frame);
  const d = Math.max(0.01, Math.abs(num(f.depth, 20))) * (f.reverse ? -1 : 1);
  if (f.midplane) return prismOf(wire.clone().translate(mul(frame.normal, -d / 2)), mul(frame.normal, d));
  return prismOf(wire, mul(frame.normal, d));
}

function surfaceRevolve(f, ctx) {
  const { sketch, frame } = sketchOf(f, ctx);
  const axis = (f.axis && byId(sketch, f.axis)) || sketch.entities.find((e) => e.type === 'line' && e.construction);
  if (!axis) throw codeError('no-axis');
  const a = byId(sketch, axis.p1); const b = byId(sketch, axis.p2);
  const pa = toWorld(frame, [a.x, a.y]); const pb = toWorld(frame, [b.x, b.y]);
  const wire = sketchWire({ ...sketch, entities: sketch.entities.filter((e) => e.id !== axis.id) }, frame);
  return revolOf(wire, pa, normalize(sub(pb, pa)), Math.max(0.1, Math.min(360, num(f.angle, 360))));
}

function surfacePlanar(f, ctx) {
  const { sketch, frame } = sketchOf(f, ctx);
  const R = rep();
  // One face per region, its outer loop with its holes (a drawing cut by two or more holes came back as the
  // outer face without holes plus a disc per hole).
  const faces = regionWires(sketch, frame).map(({ outer, holes }) => R.makeFace(outer, holes));
  if (!faces.length) throw codeError('no-profile');
  return faces.length === 1 ? faces[0] : R.makeCompound(faces);
}

function surfaceOffset(f, ctx) {
  const R = rep();
  if (!ctx.body) throw codeError('no-body');
  const faces = (f.faces ?? []).map((sig) => findFace(ctx.body, sig)).filter(Boolean);
  if (!faces.length) throw codeError('no-faces');
  const out = faces.map((face) => R.makeOffset(face, num(f.distance, 2)));
  return out.length === 1 ? out[0] : R.makeCompound(out);
}

/** Knit: sews surfaces into one shell; closed and `solid` → a solid joined to the body. */
function buildKnit(f, ctx) {
  const R = rep(); const oc = R.getOC();
  const parts = (f.surfaces ?? []).map((id) => ctx.surfaces.get(id)).filter(Boolean);
  if (parts.length < 1) throw codeError('no-surfaces');
  const sew = new oc.BRepBuilderAPI_Sewing(1e-3, true, true, true, false);
  for (const s of parts) sew.Add(s.wrapped);
  sew.Perform(new oc.Message_ProgressRange());
  let shape = R.cast(sew.SewedShape());
  sew.delete();
  if (f.solid) {
    try {
      const shells = shape.wrapped.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_SHELL ? [shape] : null;
      if (!shells) throw new Error('not closed');
      let solid = R.makeSolid(shells);
      if (R.measureVolume(solid) < 0) solid = R.cast(solid.wrapped.Reversed());
      return { body: ctx.body ? ctx.body.fuse(solid) : solid };
    } catch { throw codeError('knit-open'); }
  }
  return { surface: shape };
}

/** The solid of a thick shape, turned right side out (the kernel may hand it back inside out). */
function rightSideOut(s) {
  const R = rep();
  let out = s;
  try { if (R.measureVolume(out) < 0) out = R.cast(out.wrapped.Reversed()); } catch { /* keep */ }
  return out;
}

function thickOf(shape, t) {
  const R = rep(); const oc = R.getOC();
  const mk = new oc.BRepOffsetAPI_MakeThickSolid();
  mk.MakeThickSolidBySimple(shape.wrapped, t);
  mk.Build(new oc.Message_ProgressRange());
  if (!mk.IsDone()) { mk.delete(); throw codeError('kernel'); }
  const out = rightSideOut(R.cast(mk.Shape()));
  mk.delete();
  return out;
}

function buildThicken(f, ctx) {
  const surface = ctx.surfaces.get(f.surface);
  if (!surface) throw codeError('no-surfaces');
  const t = Math.max(0.01, num(f.thickness, 2));
  let tool;
  if (f.side === 'both') tool = thickOf(surface, t / 2).fuse(thickOf(surface, -t / 2));
  else tool = thickOf(surface, f.side === 'in' ? -t : t);
  return { tool, body: combine(ctx, tool, f.op ?? 'boss') };
}

// ───────────────────────── body operations

function movedShape(s, f) {
  let out = s;
  // Rotation about the X, Y and Z axes through a rotation centre (in that order), so a body can be laid down or
  // turned over in one feature; then the older single-axis angle about the origin; then the translation.
  const centre = [num(f.cx), num(f.cy), num(f.cz)];
  for (const [key, axis] of [['rx', [1, 0, 0]], ['ry', [0, 1, 0]], ['rz', [0, 0, 1]]]) {
    const a = num(f[key]);
    if (Math.abs(a) > 1e-9) out = out.rotate(a, centre, axis);
  }
  const ang = num(f.angle);
  if (Math.abs(ang) > 1e-9) out = out.rotate(ang, [0, 0, 0], AXES[f.axis] ?? worldUp());
  const t = [num(f.dx), num(f.dy), num(f.dz)];
  if (t.some((v) => Math.abs(v) > 1e-12)) out = out.translate(t);
  return out;
}

function buildMove(f, ctx) {
  if (!ctx.body) throw codeError('no-body');
  const moved = movedShape(ctx.body.clone(), f);
  return { body: f.copy ? ctx.body.fuse(moved) : moved };
}

function buildScale(f, ctx) {
  if (!ctx.body) throw codeError('no-body');
  const k = num(f.factor, 1);
  if (!(k > 0)) throw codeError('zero-size');
  let about = [0, 0, 0];
  if (f.about === 'centroid') { const [lo, hi] = ctx.body.boundingBox.bounds; about = mul(add(lo, hi), 0.5); }
  return { body: ctx.body.scale(k, about) };
}

/** Split by a plane: keep the side the plane's normal points to ("above"), the other, or both (two bodies). */
function buildSplit(f, ctx) {
  const R = rep();
  if (!ctx.body) throw codeError('no-body');
  const fr = resolvePlane(f.plane, ctx);
  const big = sizeAround(ctx) * 4;
  const half = (s) => {
    const plane = replicadPlane({ ...fr, origin: add(fr.origin, mul(fr.xDir, 0)) });
    return R.drawRectangle(big, big).sketchOnPlane(plane).extrude(s * big);
  };
  const above = ctx.body.clone().intersect(half(1));
  const below = ctx.body.clone().intersect(half(-1));
  if (f.keep === 'below') return { body: below };
  if (f.keep === 'both') return { body: R.makeCompound([above, below]), bodies: 2 };
  return { body: above };
}

/** Another part of the project, moved and scaled, joined to this one (cut = a cavity, as in Mold Tools). */
function buildInsertPart(f, ctx) {
  if (!f.part) throw codeError('part-missing');
  const other = ctx.project?.parts?.find((p) => p.id === f.part);
  if (!other) throw codeError('part-missing');
  if (ctx.stack.includes(other.id)) throw codeError('part-cycle');
  const r = regenerate(other, { project: ctx.project, stack: ctx.stack });
  if (!r.body) throw codeError('no-body');
  let s = r.body.clone();
  // One body of a multi-body part (its number from 0, in the part's own order), or all of them.
  if (f.body !== null && f.body !== undefined && f.body !== '') {
    const R = rep(); const oc = R.getOC(); const list = [];
    const ex = new oc.TopExp_Explorer(r.body.wrapped, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    for (; ex.More(); ex.Next()) list.push(R.cast(oc.TopoDS.Solid(ex.Current())));
    ex.delete();
    const one = list[Math.round(Number(f.body))];
    if (!one) throw codeError('body-missing');
    s = one;
  }
  const k = num(f.scale, 1);
  if (Math.abs(k - 1) > 1e-12 && k > 0) s = s.scale(k, [0, 0, 0]);
  const tool = movedShape(s, f);
  const op = f.op === 'cut' ? 'cut' : f.op === 'common' ? 'common' : 'boss';
  return { tool, toolOp: op === 'cut' ? 'cut' : 'boss', body: op === 'boss' && !ctx.body ? tool : combine(ctx, tool, op) };
}

// ───────────────────────── sheet metal

/** Bend allowance (length of the bend's neutral line): angle × (r + k·t). */
export const bendAllowance = (angleDeg, r, t, k) => ((Math.abs(angleDeg) * Math.PI) / 180) * (r + k * t);

function buildBaseFlange(f, ctx) {
  const { sketch, frame } = sketchOf(f, ctx);
  const t = Math.max(0.05, num(f.thickness, 2));
  const dir = f.reverse ? -1 : 1;
  let d = null;
  for (const r of profiles(sketch)) { let x = loopDrawing(r.outer); for (const h of r.holes) x = x.cut(loopDrawing(h)); d = d ? d.fuse(x) : x; }
  if (!d) throw codeError('no-profile');
  const tool = d.sketchOnPlane(replicadPlane(frame)).extrude(t * dir);
  ctx.sheet = { thickness: t, radius: Math.max(0, num(f.radius, t)), k: Math.min(1, Math.max(0, num(f.kFactor, 0.44))), normal: mul(frame.normal, dir), origin: frame.origin, bends: [] };
  return { tool, body: combine(ctx, tool, 'boss'), sheet: ctx.sheet };
}

/**
 * Edge flange on a straight edge of the sheet's top or bottom face: a bend of `angle` (inner radius r) and a
 * flat of `length` after it. In the flat pattern the bend is laid out as a flat strip of the bend allowance.
 */
function buildEdgeFlange(f, ctx) {
  const R = rep();
  const sm = ctx.sheet;
  if (!ctx.body || !sm) throw codeError('no-sheet');
  const [edge] = findEdges(ctx.body, f.edge ? [f.edge] : []);
  if (!edge || edge.geomType !== 'LINE') throw codeError('edge-missing');
  const t = sm.thickness; const r = f.radius == null || f.radius === '' ? sm.radius : Math.max(0, num(f.radius));
  const theta = Math.max(1, Math.min(180, num(f.angle, 90)));
  const L = Math.max(0, num(f.length, 20));
  const s = vec(edge.startPoint); const e = vec(edge.endPoint);
  const d = normalize(sub(e, s)); const len = Math.hypot(...sub(e, s));
  const nb = sm.normal;
  if (Math.abs(dot(d, nb)) > 1e-3) throw codeError('edge-not-on-sheet');
  // Outward: across the edge in the sheet's plane, away from the material.
  let o = normalize(crossV(d, nb));
  const mid = mul(add(s, e), 0.5);
  const h = dot(sub(mid, sm.origin), nb);
  const into = h > t / 2 ? -1 : 1; // the material is below a top edge, above a bottom edge
  const probe = Math.min(t, len) * 0.2;
  if (insideBody(ctx.body, add(add(mid, mul(o, probe * 2)), mul(nb, into * t / 2)), probe)) o = mul(o, -1);
  // The bend goes away from the face the edge is on; Flip bends the other way.
  let b = mul(nb, -into);
  if (f.flip) b = mul(b, -1);
  // Profile in the (o, b) plane at the edge start; the material is at b ∈ [−t, 0]. Flipped, the bend turns toward the
  // material, so its inner face is the opposite sheet face: the profile starts t further along b.
  const flipT = f.flip ? 1 : 0;
  const base = flipT ? add(s, mul(b, t)) : s;
  let draw;
  if (ctx.flat) {
    const flatLen = bendAllowance(theta, r, t, sm.k) + L;
    draw = R.draw([0, 0]).lineTo([flatLen, 0]).lineTo([flatLen, -t]).lineTo([0, -t]).close();
  } else {
    const th = (theta * Math.PI) / 180;
    const inner = (phi) => [r * Math.sin(phi), r - r * Math.cos(phi)];
    const outer = (phi) => [(r + t) * Math.sin(phi), r - (r + t) * Math.cos(phi)];
    const a1 = inner(th); const b1 = outer(th);
    const tdir = [Math.cos(th), Math.sin(th)];
    const a2 = [a1[0] + tdir[0] * L, a1[1] + tdir[1] * L]; const b2 = [b1[0] + tdir[0] * L, b1[1] + tdir[1] * L];
    let pen = R.draw([0, 0]);
    // A sharp bend (radius 0): the inner corner is the start point itself — no zero-length line to it.
    if (r > 1e-6) pen = pen.threePointsArcTo(a1, inner(th / 2));
    if (L > 1e-6) pen = pen.lineTo(a2).lineTo(b2);
    pen = pen.lineTo(b1).threePointsArcTo([0, -t], outer(th / 2));
    draw = pen.close();
  }
  const plane = new R.Plane(base, o, crossV(o, b));
  const sign = dot(d, crossV(o, b)) >= 0 ? 1 : -1;
  const tool = draw.sketchOnPlane(plane).extrude(sign * len);
  const fr = bendFrame(base, o, b); [fr.zLo, fr.zHi] = zRange(fr, s, e);
  sm.bends.push({ start: s, end: e, angle: theta, radius: r, outward: o, flat: ctx.flat, allowance: bendAllowance(theta, r, t, sm.k), frame: fr, r, t, theta, BA: bendAllowance(theta, r, t, sm.k), L, feature: f.id });
  return { tool, body: ctx.body.fuse(tool), bend: sm.bends.at(-1) };
}

// ───────────────────────── weldments

/** A weldment profile's 2D outline (centred on the path, except angles and tees on their corner). */
export function structuralProfile(kind, w, h, t) {
  const R = rep();
  const W = Math.max(0.5, num(w, 40)); const H = Math.max(0.5, num(h, W)); const T = Math.max(0.1, Math.min(Math.min(W, H) / 2 - 0.05, num(t, 3)));
  switch (kind) {
    case 'pipe': return R.drawCircle(W / 2).cut(R.drawCircle(W / 2 - T));
    case 'roundBar': return R.drawCircle(W / 2);
    case 'squareBar': return R.drawRectangle(W, W);
    case 'squareTube': return R.drawRectangle(W, W).cut(R.drawRectangle(W - 2 * T, W - 2 * T));
    case 'rectTube': return R.drawRectangle(W, H).cut(R.drawRectangle(W - 2 * T, H - 2 * T));
    case 'angle': return R.draw([0, 0]).hLine(W).vLine(T).hLine(-(W - T)).vLine(H - T).hLine(-T).close();
    case 'channel': return R.draw([-W / 2, -H / 2]).hLine(W).vLine(T).hLine(-(W - T)).vLine(H - 2 * T).hLine(W - T).vLine(T).hLine(-W).close().translate(W / 2 - W / 2, 0);
    case 'tee': return R.draw([-W / 2, 0]).hLine(W).vLine(-T).hLine(-(W - T) / 2).vLine(-(H - T)).hLine(-T).vLine(H - T).hLine(-(W - T) / 2).close();
    case 'ibeam': default: {
      const tw = T; const tf = Math.min(H / 3, T * 1.5);
      return R.draw([-W / 2, -H / 2]).hLine(W).vLine(tf).hLine(-(W - tw) / 2).vLine(H - 2 * tf).hLine((W - tw) / 2).vLine(tf).hLine(-W).vLine(-tf).hLine((W - tw) / 2).vLine(-(H - 2 * tf)).hLine(-(W - tw) / 2).close();
    }
  }
}

/** Structural members along the sketch's lines; the cut list (profile, length per member) comes with it. */
function buildStructural(f, ctx) {
  const R = rep();
  // Segments: the lines of a sketch, or the straight pieces of a 3D sketch.
  let segs; let refNormal;
  const s3 = ctx.part.features.find((x) => x.id === f.sketch && x.type === 'sketch3d');
  if (s3) {
    const pts = s3.points ?? [];
    segs = pts.slice(1).map((p, i) => ({ id: `s${i}`, pa: pts[i], pb: p }));
    if (s3.closed && pts.length > 2) segs.push({ id: `s${pts.length - 1}`, pa: pts[pts.length - 1], pb: pts[0] });
    refNormal = null;
  } else {
    const { sketch, frame } = sketchOf(f, ctx);
    segs = sketch.entities.filter((e) => e.type === 'line' && !e.construction).map((l) => { const a = byId(sketch, l.p1); const b = byId(sketch, l.p2); return { id: l.id, pa: toWorld(frame, [a.x, a.y]), pb: toWorld(frame, [b.x, b.y]) }; });
    refNormal = frame.normal;
  }
  if (!segs.length) throw codeError('no-path');
  const rot = (num(f.rotate) * Math.PI) / 180;
  let tool = null;
  const members = [];
  for (const { id, pa, pb } of segs) {
    const l = { id };
    const L = Math.hypot(...sub(pb, pa));
    if (L < 1e-6) continue;
    const dir = normalize(sub(pb, pa));
    // Profile axes: across the sketch plane (its normal) and across the line within it, turned by `rotate`.
    const u0 = refNormal && Math.abs(dot(refNormal, dir)) < 0.99 ? refNormal : normalize(crossV(dir, Math.abs(dot(dir, worldUp())) < 0.9 ? worldUp() : [1, 0, 0]));
    const v0 = normalize(crossV(dir, u0));
    const u = add(mul(u0, Math.cos(rot)), mul(v0, Math.sin(rot)));
    const plane = new R.Plane(pa, u, dir);
    const solid = structuralProfile(f.profile, f.w, f.h, f.t).sketchOnPlane(plane).extrude(L);
    tool = tool ? tool.fuse(solid) : solid;
    members.push({ line: l.id, length: Math.round(L * 1000) / 1000 });
  }
  if (!tool) throw codeError('no-path');
  return { tool, body: combine(ctx, tool, 'boss'), members };
}

// ───────────────────────── helpers for the app

/** Sketches a feature of `type` can use (closed regions, open paths, lines, points …). */
export function sketchUse(type) {
  if (['sweep', 'loft', 'baseFlange', 'surfacePlanar', 'surfaceLoft', 'wrap'].includes(type)) return 'profile';
  if (['rib', 'structural', 'surfaceExtrude', 'surfaceRevolve'].includes(type)) return 'curves';
  return null;
}

void standalonePoints; void faceSignature; void makeFrame;

// ───────────────────────── more surfaces: fill, boundary, trim

/** A closed loop for a fill: picked body edges, or a sketch / 3D sketch outline. */
function loopWire(f, ctx) {
  const R = rep();
  if (f.curve) {
    if (ctx.curves.has(f.curve)) return ctx.curves.get(f.curve).clone();
    const { sketch, frame } = sketchOf({ sketch: f.curve }, ctx, f.curve);
    return sketchWire(sketch, frame);
  }
  const edges = findEdges(ctx.body, f.edges ?? []);
  if (edges.length < 1) throw codeError('no-edges');
  return R.assembleWire(edges.map((e) => e.clone()));
}

/** Fill surface: a smooth patch spanning a closed boundary (a hole in a body, a 3D sketch loop). */
function buildFillSurface(f, ctx) {
  const R = rep();
  const face = R.makeNonPlanarFace(loopWire(f, ctx));
  return { surface: face };
}

/**
 * Boundary surface: through two or more closed profiles (a smooth skin, like a loft) or, from open curves,
 * a patch whose edges are all the curves (a filling bounded by them).
 */
function buildBoundary(f, ctx) {
  const R = rep(); const oc = R.getOC();
  const ids = f.curves ?? [];
  if (ids.length < 2) throw codeError('loft-needs-two');
  const closedProfiles = ids.every((id) => { const sk = ctx.part.features.find((x) => x.id === id && x.type === 'sketch'); return sk && profiles(sk).length; });
  // Boundary boss / cut: a solid through the closed profiles, added to or cut from the body.
  if (f.op === 'boss' || f.op === 'cut') {
    if (!closedProfiles) throw codeError('no-profile');
    const tool = loftOf(ids, ctx, { ruled: false }, false);
    return { tool, body: combine(ctx, tool, f.op) };
  }
  if (closedProfiles) return { surface: loftOf(ids, ctx, { ruled: false }, true) };
  const mk = new oc.BRepOffsetAPI_MakeFilling(3, 15, 2, false, 1e-5, 1e-4, 0.01, 0.1, 8, 9);
  for (const id of ids) {
    const wire = ctx.curves.has(id) ? ctx.curves.get(id) : (() => { const { sketch, frame } = sketchOf({ sketch: id }, ctx, id); return sketchWire(sketch, frame); })();
    for (const e of wire.edges) mk.Add(e.wrapped, oc.GeomAbs_Shape.GeomAbs_C0, true);
  }
  mk.Build(new oc.Message_ProgressRange());
  if (!mk.IsDone()) { mk.delete(); throw codeError('kernel'); }
  const face = R.cast(mk.Shape());
  mk.delete();
  return { surface: face };
}

/** Splits `shape` by `tool` with the kernel's splitter: the pieces as one shape. */
function splitShape(shape, tool) {
  const R = rep(); const oc = R.getOC();
  const args = new oc.NCollection_List_TopoDS_Shape(); args.Append(shape.wrapped);
  const tools = new oc.NCollection_List_TopoDS_Shape(); tools.Append(tool.wrapped);
  const sp = new oc.BRepAlgoAPI_Splitter();
  sp.SetArguments(args); sp.SetTools(tools); sp.Build(new oc.Message_ProgressRange());
  if (sp.HasErrors()) { sp.delete(); throw codeError('kernel'); }
  const out = R.cast(sp.Shape());
  sp.delete();
  return out;
}

/** Trim surface: a surface cut by a plane (or another surface); keeps the faces on the chosen side. */
function buildTrimSurface(f, ctx) {
  const R = rep();
  const surface = ctx.surfaces.get(f.surface);
  if (!surface) throw codeError('no-surfaces');
  let toolShape; let point; let normal;
  if (f.tool && ctx.surfaces.has(f.tool)) {
    toolShape = ctx.surfaces.get(f.tool);
    const tf = toolShape.faces[0];
    const p = tf.pointOnSurface(0.5, 0.5);
    point = vec(p); normal = normalize(vec(tf.normalAt(p)));
  } else {
    const fr = resolvePlane(f.plane, ctx);
    const big = sizeAround(ctx) * 4;
    toolShape = R.drawRectangle(big, big).sketchOnPlane(replicadPlane(fr)).face();
    point = fr.origin; normal = fr.normal;
  }
  const pieces = splitShape(surface.clone(), toolShape).faces;
  const keep = pieces.filter((fc) => { const s = dot(sub(vec(fc.center), point), normal); return f.keep === 'below' ? s < 0 : s > 0; });
  if (!keep.length) throw codeError('no-surfaces');
  return { surface: keep.length === 1 ? keep[0] : R.makeCompound(keep) };
}

// ───────────────────────── sheet metal: hem, sketched bend, jog

/** Hem: the sheet's edge folded back 180° over itself (closed: touching; open: with the gap given). */
function buildHem(f, ctx) {
  const sm = ctx.sheet;
  if (!sm) throw codeError('no-sheet');
  const gap = f.kind === 'open' ? Math.max(0.02, num(f.gap, 1)) : Math.max(0.02, sm.thickness * 0.02);
  return buildEdgeFlange({ edge: f.edge, length: num(f.length, 10), angle: 180, radius: gap / 2, flip: f.flip }, ctx);
}

/** A sheet-metal line feature's geometry: the line on the sheet's bottom face, the direction across it. */
function bendLine(f, ctx) {
  const sm = ctx.sheet;
  if (!ctx.body || !sm) throw codeError('no-sheet');
  const { sketch, frame } = sketchOf(f, ctx);
  const line = sketch.entities.find((e) => e.type === 'line' && !e.construction);
  if (!line) throw codeError('no-path');
  const a = byId(sketch, line.p1); const b = byId(sketch, line.p2);
  const pa = toWorld(frame, [a.x, a.y]); const pb = toWorld(frame, [b.x, b.y]);
  const along = normalize(sub(pb, pa));
  const nb = sm.normal;
  if (Math.abs(dot(along, nb)) > 1e-3) throw codeError('edge-not-on-sheet');
  // The side that moves is the one `across` points to; Flip takes the other.
  let across = normalize(crossV(nb, along));
  if (f.flip) across = mul(across, -1);
  const base = add(pa, mul(nb, dot(sub(sm.origin, pa), nb)));
  return { sm, along, across, nb, base };
}

/** The body's halves on either side of the plane through `base` across `across` (the far one is where it points). */
function halves(ctx, base, across) {
  const R = rep();
  const big = sizeAround(ctx) * 4;
  const x = normalize(crossV(across, Math.abs(dot(across, worldFront())) < 0.9 ? worldFront() : [1, 0, 0]));
  const plane = new R.Plane(base, x, across);
  const far = ctx.body.clone().intersect(R.drawRectangle(big, big).sketchOnPlane(plane).extrude(big));
  const near = ctx.body.clone().intersect(R.drawRectangle(big, big).sketchOnPlane(plane).extrude(-big));
  return { near, far };
}

/** The sheet's cross-section on the cut plane (the near half's face lying in it). */
function sectionOf(near, base, across) {
  const found = near.faces.find((fc) => {
    if (fc.geomType !== 'PLANE') return false;
    const n = normalize(vec(fc.normalAt(fc.center)));
    return Math.abs(Math.abs(dot(n, across)) - 1) < 1e-6 && Math.abs(dot(sub(vec(fc.center), base), across)) < 1e-4;
  });
  if (!found) throw codeError('kernel');
  return found.clone();
}

/** Sketched bend: the sheet is bent by `angle` along a sketched line (the far side turns, the near side stays). */
function buildSketchedBend(f, ctx) {
  const R = rep();
  const { sm, across, nb, base } = bendLine(f, ctx);
  const t = sm.thickness; const r = f.radius == null || f.radius === '' ? sm.radius : Math.max(0, num(f.radius));
  const theta = Math.max(1, Math.min(180, num(f.angle, 90)));
  const allowance = bendAllowance(theta, r, t, sm.k);
  const { near, far } = halves(ctx, base, across);
  const section = sectionOf(near, base, across);
  const inner0 = f.down ? base : add(base, mul(nb, t));
  const up0 = f.down ? mul(nb, -1) : nb;
  const fr = bendFrame(inner0, across, up0);
  // Bends already on the side that moves go with it (their frames are where the flange now is).
  const moved = ctx.flat ? translationMap(mul(across, allowance)) : rotationMap(add(inner0, mul(up0, r)), crossV(across, up0), theta);
  for (const x of sm.bends) if (x.frame && dot(sub(x.frame.o, base), across) > 1e-6) x.frame = mapFrame(moved, x.frame);
  sm.bends.push({ sketched: true, angle: theta, radius: r, allowance, flat: ctx.flat, frame: fr, r, t, theta, BA: allowance, L: 1e6, feature: f.id });
  if (ctx.flat) {
    // Flat: the bend becomes a strip of the bend allowance between the halves.
    const fill = R.basicFaceExtrusion(section, new R.Vector(mul(across, allowance)));
    return { body: near.fuse(fill).fuse(far.translate(mul(across, allowance))) };
  }
  const up = f.down ? mul(nb, -1) : nb;
  // The bend's axis runs along the line at radius r beyond the inner face (the one toward the bend).
  const inner = f.down ? base : add(base, mul(nb, t));
  const axisPoint = add(inner, mul(up, r));
  const w = normalize(crossV(across, up));
  const bend = R.revolution(section, axisPoint, w, theta);
  const turned = far.rotate(theta, axisPoint, w);
  return { body: near.fuse(bend).fuse(turned), bend: { angle: theta, radius: r, allowance } };
}

/** Jog: the far side of the line is raised by `height`, with a wall between (two sharp 90° bends). */
function buildJog(f, ctx) {
  const R = rep();
  const { sm, along, across, nb, base } = bendLine(f, ctx);
  const t = sm.thickness;
  const h = Math.max(t, num(f.height, 10));
  // A jog is two bends (the press brake sees both); they carry no frame, so Fold cannot map across them.
  sm.bends.push({ jog: true, flat: ctx.flat, feature: f.id }, { jog: true, flat: ctx.flat, feature: f.id });
  const { near, far } = halves(ctx, base, across);
  const section = sectionOf(near, base, across);
  if (ctx.flat) {
    const len = h - t + 2 * bendAllowance(90, 0, t, sm.k);
    const fill = R.basicFaceExtrusion(section, new R.Vector(mul(across, len)));
    return { body: near.fuse(fill).fuse(far.translate(mul(across, len))) };
  }
  const down = Boolean(f.down);
  const up = down ? mul(nb, -1) : nb;
  // The wall: t thick across the line, from the sheet to the raised sheet, as wide as the sheet there.
  const s = section.edges.flatMap((e) => [vec(e.startPoint), vec(e.endPoint)]).map((p) => dot(sub(p, base), along));
  const lo = Math.min(...s); const hi = Math.max(...s);
  const [y0, y1] = down ? [-t, h] : [0, h + t];
  const normal = crossV(across, up);
  const plane = new R.Plane(add(base, mul(along, lo)), across, normal);
  const sign = dot(normal, along) >= 0 ? 1 : -1;
  const wall = R.draw([0, y0]).lineTo([t, y0]).lineTo([t, y1]).lineTo([0, y1]).close().sketchOnPlane(plane).extrude(sign * (hi - lo));
  const raised = far.translate(add(mul(across, t), mul(up, h)));
  return { body: near.fuse(wall).fuse(raised) };
}

// ───────────────────────── mold tools: parting line, core / cavity

const AXIS_DIRS = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1], '-x': [-1, 0, 0], '-y': [0, -1, 0], '-z': [0, 0, -1] };

/**
 * Parting line: the outer loop between the faces the core forms and the rest, on the faces split at their
 * draft-zero curves (mold-brep.js partingLoops); the face-centre rule below is the fallback.
 */
export function partingEdges(body, dir) {
  try { const pl = partingLoops(body, dir); if (pl.outer >= 0) return pl.loops[pl.outer].map((r) => r.edge); } catch { /* the rule below */ }
  const facesOf = new Map();
  const sideOf = (face) => {
    try { const p = face.geomType === 'PLANE' ? face.center : face.pointOnSurface(0.5, 0.5); return dot(normalize(vec(face.normalAt(p))), dir); } catch { return 0; }
  };
  for (const face of body.faces) {
    const s = sideOf(face);
    for (const e of face.edges) { const k = e.hashCode; if (!facesOf.has(k)) facesOf.set(k, { e, sides: [] }); facesOf.get(k).sides.push(s); }
  }
  const eps = 1e-3;
  let out = [...facesOf.values()].filter((x) => x.sides.some((s) => s > eps) && x.sides.some((s) => s < -eps)).map((x) => x.e);
  // Vertical walls between: the parting line runs along their bottom (where they meet the faces facing away).
  if (!out.length) out = [...facesOf.values()].filter((x) => x.sides.some((s) => s < -eps) && x.sides.some((s) => Math.abs(s) <= eps)).map((x) => x.e);
  return out;
}

function buildPartingLine(f, ctx) {
  const R = rep();
  if (!ctx.body) throw codeError('no-body');
  const dir = AXIS_DIRS[f.dir] ?? AXIS_DIRS.z;
  const edges = partingEdges(ctx.body, dir);
  if (!edges.length) throw codeError('no-edges');
  const height = edges.reduce((sum, e) => sum + dot(vec(e.pointAt(0.5)), dir), 0) / edges.length;
  ctx.parting = { dir, height, key: f.dir ?? 'z' };
  return { curve: R.makeCompound(edges.map((e) => e.clone())), parting: { dir, height, edges: edges.length } };
}

/**
 * Core and cavity: a tooling block around the part split at the parting plane; the cavity (on the pull side)
 * and the core, each with the part's shape taken out, pulled apart by `gap` so both can be seen.
 */
function buildToolingSplit(f, ctx) {
  const R = rep();
  if (!ctx.body) throw codeError('no-body');
  // With a parting surface (mold-more.js): split by it and the shut-offs; the plane below is the fallback.
  if (ctx.partingSurface && f.useSurfaces !== false) { try { return toolingSplitBySurfaces(f, ctx); } catch { /* the plane split below */ } }
  const key = f.dir ?? ctx.parting?.key ?? 'z';
  const dir = AXIS_DIRS[key] ?? AXIS_DIRS.z;
  const axis = dir.findIndex((v) => Math.abs(v) > 0.5);
  const [lo, hi] = ctx.body.boundingBox.bounds;
  const m = Math.max(1, num(f.margin, 10));
  const blo = lo.map((v) => v - m); const bhi = hi.map((v) => v + m);
  const split = f.auto === false ? num(f.height) : ctx.parting && ctx.parting.key === key ? ctx.parting.height * Math.sign(dir[axis]) : (lo[axis] + hi[axis]) / 2;
  const upper = [blo.slice(), bhi.slice()]; upper[0][axis] = split;
  const lower = [blo.slice(), bhi.slice()]; lower[1][axis] = split;
  const pullUp = dir[axis] > 0;
  const cavity = R.makeBox(...(pullUp ? upper : lower)).cut(ctx.body.clone());
  const core = R.makeBox(...(pullUp ? lower : upper)).cut(ctx.body.clone());
  const gap = Math.max(0, num(f.gap, 30));
  const show = f.show ?? 'both';
  const pieces = [];
  if (show !== 'core') pieces.push(cavity.translate(mul(dir, gap)));
  if (show !== 'cavity') pieces.push(core.translate(mul(dir, -gap)));
  if (f.keepPart) pieces.push(ctx.body.clone());
  return { body: pieces.length === 1 ? pieces[0] : R.makeCompound(pieces), tooling: { split, dir }, undercuts: undercutCount(ctx.body, dir) };
}

// ───────────────────────── 3D sketch

/** A 3D sketch: points in space joined by lines (or one smooth spline), open or closed. */
function buildSketch3d(f) {
  const R = rep();
  const pts = (f.points ?? []).filter((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite));
  if (pts.length < 2) throw codeError('no-path');
  if (f.spline && pts.length > 2) {
    const list = f.closed ? [...pts, pts[0]] : pts;
    return { curve: R.assembleWire([R.makeBSplineApproximation(list, { tolerance: 1e-4, smoothing: null, degMax: 3 })]) };
  }
  const edges = [];
  for (let i = 1; i < pts.length; i++) edges.push(R.makeLine(pts[i - 1], pts[i]));
  if (f.closed && pts.length > 2) edges.push(R.makeLine(pts[pts.length - 1], pts[0]));
  return { curve: R.assembleWire(edges) };
}
