// Parts are built from a list of features (the FeatureManager design tree): sketches, reference
// planes, bosses and cuts (extrude, revolve), dress-ups (fillet, chamfer, shell), holes, patterns and
// mirrors. regenerate() runs the list in order on the OpenCASCADE kernel and returns the body after
// every step; a feature that fails is marked and skipped (the rest still builds).
//
// Coordinates are millimetres, Z up (frame.js): Top plane = XY, Front = XZ (seen from −Y), Right = YZ (seen from +X).
import { rep, fontLoaded } from './kernel.js';
import { profiles, standalonePoints, constructionLines, byId, createSketchGeometry, newSketchId, hasRegions } from './sketch.js';
import { faceSignature, findEdges, findFace, planeOfFace, crossV, normalize, setAreaMeasure } from './refs.js';
import { ADVANCED_DEFAULTS, ADVANCED_NAMES, buildAdvanced, ADVANCED_TYPES } from './advanced.js';
import { PART_MORE_TYPES, PART_MORE_DEFAULTS, PART_MORE_NAMES } from './part-more-types.js';
import { buildPartMore, refAxisOf } from './part-more.js';
import { STD_TYPES, STD_DEFAULTS, STD_NAMES } from './std-types.js';
import { buildStdFeature } from './std-features.js';
import { tapHoles, patternThreads } from './hole-threads.js';
import { effectiveFeatures } from './params.js';
import { frameTable, isYUp, worldUp } from './frame.js';
import { yUpDefaults } from './zup.js';

export const FEATURE_TYPES = ['import', 'sketch', 'plane', 'extrude', 'revolve', 'fillet', 'chamfer', 'shell', 'hole', 'linearPattern', 'circularPattern', 'mirror', ...ADVANCED_TYPES, ...PART_MORE_TYPES, ...STD_TYPES];
/** Features that add or remove material with a tool solid (patterns and mirrors copy them). */
export const TOOL_FEATURES = ['extrude', 'revolve', 'hole', 'sweep', 'loft', 'rib', 'thread', 'wrap', 'structural', 'insertPart', 'dome'];
/** The standard planes (Z up); a sketch's y runs up (+Z) on the front and right planes and along +Y on the top one. */
export const STD_PLANES = frameTable({
  front: { origin: [0, 0, 0], xDir: [1, 0, 0], normal: [0, -1, 0] },
  top: { origin: [0, 0, 0], xDir: [1, 0, 0], normal: [0, 0, 1] },
  right: { origin: [0, 0, 0], xDir: [0, 1, 0], normal: [1, 0, 0] },
}, ['origin', 'xDir', 'normal']);
/** World axes by name; '-x', '-y', '-z' point the other way (projects turned from Y up use them). */
export const AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1], '-x': [-1, 0, 0], '-y': [0, -1, 0], '-z': [0, 0, -1] };

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A plane frame with its y axis: { origin, xDir, yDir, normal }. */
export function frame({ origin, xDir, normal }) {
  const n = normalize(normal); const x = normalize(xDir);
  return { origin: [...origin], xDir: x, yDir: normalize(crossV(n, x)), normal: n };
}

/** Sketch coordinates → world coordinates. */
export const toWorld = (f, [u, v]) => add(f.origin, add(scale(f.xDir, u), scale(f.yDir, v)));
/** World → sketch coordinates (projected onto the plane). */
export function toSketch(f, p) {
  const d = [p[0] - f.origin[0], p[1] - f.origin[1], p[2] - f.origin[2]];
  return [dot(d, f.xDir), dot(d, f.yDir)];
}

// ───────────────────────── creating features

let n = 0;
export const newFeatureId = (type) => `${type.slice(0, 3)}${Date.now().toString(36).slice(-5)}${(n++).toString(36)}`;

export const FEATURE_DEFAULTS = {
  import: () => ({ brep: '', source: '' }),
  sketch: () => ({ plane: { kind: 'std', name: 'front' }, ...createSketchGeometry() }),
  plane: () => ({ base: { kind: 'std', name: 'top' }, offset: 20, flip: false }),
  extrude: () => ({ sketch: null, op: 'boss', end: 'blind', depth: 10, reverse: false, end2: 'none', depth2: 10, merge: true }),
  revolve: () => ({ sketch: null, op: 'boss', axis: null, angle: 360, reverse: false, merge: true }),
  fillet: () => ({ radius: 2, edges: [] }),
  chamfer: () => ({ distance: 1, edges: [] }),
  shell: () => ({ thickness: 1.5, faces: [] }),
  hole: () => ({ sketch: null, kind: 'simple', diameter: 6.6, depth: 15, through: true, cbDiameter: 11, cbDepth: 6.5, csDiameter: 13, csAngle: 90, threadSize: 'M8', threadDepth: 16, threadMode: 'auto' }),
  linearPattern: () => ({ seeds: [], direction: { kind: 'axis', axis: 'x' }, spacing: 20, count: 3, reverse: false, direction2: null, spacing2: 20, count2: 2, reverse2: false }),
  circularPattern: () => ({ seeds: [], axis: { kind: 'axis', axis: 'z' }, count: 6, angle: 360, equal: true, reverse: false }),
  mirror: () => ({ seeds: [], plane: { kind: 'std', name: 'right' }, body: false }),
  ...ADVANCED_DEFAULTS,
  ...PART_MORE_DEFAULTS,
  ...STD_DEFAULTS,
};

/** A new feature of `type` with its defaults (and `params` on top). Names like "Boss-Extrude1". */
export function createFeature(part, type, params = {}) {
  // The sample builders are written Y up (frame.js withYUp): they get the defaults in that frame.
  const defaults = { type, ...FEATURE_DEFAULTS[type]() };
  if (isYUp()) yUpDefaults(defaults);
  const feature = { id: newFeatureId(type), type, name: '', ...defaults, ...params };
  feature.name = params.name ?? nextName(part, feature);
  return feature;
}

/** The base name of a feature kind (i18n key suffix) — a cut extrude is "Cut-Extrude", a boss "Boss-Extrude". */
export const nameKey = (f) => {
  if (f.type === 'extrude' || f.type === 'revolve') return `${f.op === 'cut' ? 'cut' : f.op === 'common' ? 'common' : 'boss'}-${f.type}`;
  if (f.type === 'sweep' || f.type === 'loft') return `${f.op === 'cut' ? 'cut' : 'boss'}-${f.type}`;
  if (f.type === 'boundary' && (f.op === 'boss' || f.op === 'cut')) return `${f.op}-boundary`;
  return f.type;
};

const BASE_NAMES = { import: 'Imported', sketch: 'Sketch', plane: 'Plane', 'boss-extrude': 'Boss-Extrude', 'cut-extrude': 'Cut-Extrude', 'boss-revolve': 'Revolve', 'cut-revolve': 'Cut-Revolve', fillet: 'Fillet', chamfer: 'Chamfer', shell: 'Shell', hole: 'Hole', linearPattern: 'LPattern', circularPattern: 'CirPattern', mirror: 'Mirror', 'common-extrude': 'Intersect-Extrude', 'common-revolve': 'Intersect-Revolve', ...ADVANCED_NAMES, ...PART_MORE_NAMES, ...STD_NAMES };

/** The English base name of a feature ("Boss-Extrude" for a boss extrude) — a default name is base + number. */
export const baseNameOf = (f) => BASE_NAMES[nameKey(f)] ?? f.type;

let namer = null;
/** The app names new features in its language ("스케치1", "Sketch1"): namer(key) → base name or null. */
export function setFeatureNamer(fn) { namer = fn; }

function nextName(part, feature) {
  const base = namer?.(nameKey(feature)) ?? BASE_NAMES[nameKey(feature)] ?? feature.type;
  let i = 1;
  const taken = new Set((part?.features ?? []).map((f) => f.name));
  while (taken.has(`${base}${i}`)) i++;
  return `${base}${i}`;
}

/** Features that use feature `id` (a sketch's extrude, a pattern's seed …). */
export function dependents(part, id) {
  return part.features.filter((f) => f.sketch === id || f.seeds?.includes(id) || f.plane?.feature === id || f.base?.feature === id || f.plane?.id === id || f.base?.id === id
    || f.path === id || f.sketches?.includes(id) || f.surface === id || f.neutral?.id === id || f.curve === id || f.curves?.includes(id) || f.tool === id || f.surfaces?.includes(id)
    || f.axis?.id === id || f.pointRef === id || f.cs === id);
}

/** Every feature that depends on `id`, directly or through others (deleting `id` deletes them too). */
export function allDependents(part, id) {
  const out = new Set();
  const visit = (x) => { for (const f of dependents(part, x)) if (!out.has(f.id)) { out.add(f.id); visit(f.id); } };
  visit(id);
  return [...out];
}

// ───────────────────────── planes

/**
 * The frame of a plane reference at this point of the rebuild: a standard plane, a reference plane
 * feature, or a planar face of the body (matched by its signature).
 */
export function resolvePlane(ref, ctx) {
  if (!ref) return frame(STD_PLANES.front);
  if (ref.kind === 'std') return frame(STD_PLANES[ref.name] ?? STD_PLANES.front);
  if (ref.kind === 'ref') {
    const f = ctx.planes.get(ref.id);
    if (!f) throw codeError('plane-missing');
    return f;
  }
  if (ref.kind === 'face') {
    const face = findFace(ctx.body, ref.sig);
    if (!face || face.geomType !== 'PLANE') throw codeError('face-missing');
    const p = planeOfFace(face);
    // A plane on a face keeps the x direction it was made with, when that still lies in the face.
    const x = ref.xDir && Math.abs(dot(ref.xDir, p.normal)) < 1e-6 ? ref.xDir : p.xDir;
    return frame({ origin: ref.origin && Math.abs(dot([ref.origin[0] - p.origin[0], ref.origin[1] - p.origin[1], ref.origin[2] - p.origin[2]], p.normal)) < 1e-6 ? ref.origin : p.origin, xDir: x, normal: p.normal });
  }
  return frame(STD_PLANES.front);
}

/** A plane reference for a picked planar face (its frame is kept for a stable sketch orientation). */
export function faceRef(face) {
  const p = planeOfFace(face);
  return { kind: 'face', sig: faceSignature(face), origin: p.origin.map(round), xDir: p.xDir.map(round) };
}

const round = (v) => Math.round(v * 1e6) / 1e6;

export function replicadPlane(f) {
  const R = rep();
  return new R.Plane(f.origin, f.xDir, f.normal);
}

// ───────────────────────── errors

export function codeError(code, params = {}) {
  const error = new Error(code);
  error.code = code;
  error.params = params;
  return error;
}

// ───────────────────────── sketch → replicad drawing

/**
 * A rational Bézier piece { P, w } drawn exactly (an OCCT Bézier curve with weights): partial ellipses, conics
 * and parabolas are drawn as themselves, not as approximations. The pen starts the piece where it is.
 */
export function rationalBezierTo(pen, piece) {
  const R = rep(); const oc = R.getOC();
  const n = piece.P.length;
  const poles = new oc.NCollection_Array1_gp_Pnt2d(1, n);
  const weights = new oc.NCollection_Array1_double(1, n);
  const made = [];
  try {
    piece.P.forEach((p, i) => { const q = new oc.gp_Pnt2d(p[0], p[1]); made.push(q); poles.SetValue(i + 1, q); weights.SetValue(i + 1, piece.w[i]); });
    const rational = piece.w.some((w) => Math.abs(w - piece.w[0]) > 1e-15);
    const curve = rational ? new oc.Geom2d_BezierCurve(poles, weights) : new oc.Geom2d_BezierCurve(poles);
    pen.saveCurve(new R.Curve2D(curve));
  } finally { for (const q of made) q.delete(); poles.delete(); weights.delete(); }
  pen.pointer = piece.P[n - 1];
  return pen;
}

export function loopDrawing(loop) {
  const R = rep();
  const segs = loop.segs;
  if (segs.length === 1 && segs[0].kind === 'circle') return R.drawCircle(segs[0].r).translate(segs[0].c[0], segs[0].c[1]);
  if (segs.length === 1 && segs[0].kind === 'ellipse') {
    const e = segs[0];
    return R.drawEllipse(e.rx, e.ry).rotate((e.rot * 180) / Math.PI, [0, 0]).translate(e.c[0], e.c[1]);
  }
  const first = segs[0].kind === 'line' ? segs[0].a : segs[0].from;
  let pen = R.draw(first);
  segs.forEach((s, i) => {
    const last = i === segs.length - 1;
    // The last straight segment is drawn by close(); an arc or a spline ends exactly on the next start point.
    if (s.kind === 'line') { if (!last) pen = pen.lineTo(s.b); }
    else if (s.kind === 'spline') { for (const [, c1, c2, p3] of s.beziers) pen = pen.cubicBezierCurveTo(p3, c1, c2); }
    else if (s.kind === 'pieces') { for (const pc of s.pieces) pen = rationalBezierTo(pen, pc); }
    else pen = pen.threePointsArcTo(s.to, s.mid);
  });
  return pen.close();
}

/** The sketch's closed regions as one replicad Drawing (outer loops minus their holes, fused). */
export function sketchDrawing(sketch) {
  const regions = profiles(sketch);
  const texts = sketch.entities.filter((e) => e.type === 'text' && !e.construction && String(e.text ?? '').trim());
  if (!regions.length && !texts.length) throw codeError('no-profile');
  let all = null;
  for (const region of regions) {
    let d = loopDrawing(region.outer);
    for (const hole of region.holes) d = d.cut(loopDrawing(hole));
    all = all ? all.fuse(d) : d;
  }
  for (const e of texts) { const d = textDrawing(e); all = all ? all.fuse(d) : d; }
  return all;
}

/** Sketch text as a drawing: the font's glyph outlines (letter holes included). */
export function textDrawing(e) {
  const R = rep();
  if (!fontLoaded()) throw codeError('no-font');
  let d = R.drawText(String(e.text), { startX: 0, startY: 0, fontSize: Number(e.size) || 10, fontFamily: 'roboto' });
  if (e.rot) d = d.rotate((e.rot * 180) / Math.PI, [0, 0]);
  return d.translate(e.x, e.y);
}

const outlineCache = new Map();
/** Sketch text as polylines in sketch coordinates (for the sketch editor and the view). */
export function textOutline(e) {
  const key = JSON.stringify([e.text, e.size, e.rot, e.x, e.y]);
  if (outlineCache.has(key)) return outlineCache.get(key);
  let out = [];
  try {
    const paths = [textDrawing(e).toSVGPaths()].flat(3).filter(Boolean);
    out = paths.flatMap((d) => svgPolylines(d)).map((poly) => poly.map(([x, y]) => [x, -y]));
  } catch { out = []; }
  if (outlineCache.size > 200) outlineCache.clear();
  outlineCache.set(key, out);
  return out;
}

/** SVG path data → polylines (curves flattened); y as written (the caller flips it). */
function svgPolylines(d) {
  const tokens = String(d).match(/[MLHVCQZmlhvcqz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const out = []; let cur = null; let x = 0; let y = 0; let sx = 0; let sy = 0; let cmd = null; let i = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    if (cmd === 'M') { x = num(); y = num(); sx = x; sy = y; cur = [[x, y]]; out.push(cur); cmd = 'L'; }
    else if (cmd === 'L') { x = num(); y = num(); cur?.push([x, y]); }
    else if (cmd === 'H') { x = num(); cur?.push([x, y]); }
    else if (cmd === 'V') { y = num(); cur?.push([x, y]); }
    else if (cmd === 'C') { const [a, b, c, e2, f, g] = [num(), num(), num(), num(), num(), num()]; for (let k = 1; k <= 8; k++) { const t = k / 8; const u = 1 - t; cur?.push([u * u * u * x + 3 * u * u * t * a + 3 * u * t * t * c + t * t * t * f, u * u * u * y + 3 * u * u * t * b + 3 * u * t * t * e2 + t * t * t * g]); } x = f; y = g; }
    else if (cmd === 'Q') { const [a, b, c, e2] = [num(), num(), num(), num()]; for (let k = 1; k <= 6; k++) { const t = k / 6; const u = 1 - t; cur?.push([u * u * x + 2 * u * t * a + t * t * c, u * u * y + 2 * u * t * b + t * t * e2]); } x = c; y = e2; }
    else if (cmd === 'Z' || cmd === 'z') { cur?.push([sx, sy]); x = sx; y = sy; cmd = null; }
    else i++;
  }
  return out.filter((p) => p.length > 1);
}

// ───────────────────────── regeneration

/**
 * Builds the part. Returns { body, results, planes, sketches, error }:
 * results: Map featureId → { ok, error, body (after this feature), tool, frame (sketch / plane) }.
 * `upTo` (index, exclusive): the rollback bar — later features are not built.
 */
export function regenerate(input, { upTo = null, project = null, flat = undefined, stack = [] } = {}) {
  const R = rep();
  setAreaMeasure((face) => R.measureArea(face));
  // Equations, global variables and the active configuration give the values the features are built with.
  const part = { ...input, features: effectiveFeatures(input) };
  const results = new Map();
  const planes = new Map();
  const ctx = { body: null, planes, part, results, project, surfaces: new Map(), curves: new Map(), flat: flat ?? Boolean(input.flat), stack: [...stack, input.id], sheet: null };
  const end = upTo == null ? part.features.length : Math.max(0, Math.min(part.features.length, upTo));
  let lastError = null;
  for (let i = 0; i < end; i++) {
    const f = part.features[i];
    if (f.suppressed) { results.set(f.id, { ok: true, suppressed: true, body: ctx.body }); continue; }
    try {
      const out = build(f, ctx) ?? {};
      if (out.body !== undefined) ctx.body = out.body;
      if (out.frame && (f.type === 'plane')) planes.set(f.id, out.frame);
      if (out.surface) ctx.surfaces.set(f.id, out.surface);
      if (out.curve) ctx.curves.set(f.id, out.curve);
      results.set(f.id, { ok: true, ...out, body: ctx.body });
    } catch (error) {
      lastError = error;
      results.set(f.id, { ok: false, error: error?.code ?? 'kernel', detail: String(error?.message ?? error), params: error?.params ?? {}, body: ctx.body });
    }
  }
  for (let i = end; i < part.features.length; i++) results.set(part.features[i].id, { ok: true, rolledBack: true });
  return { body: ctx.body, results, planes, surfaces: ctx.surfaces, curves: ctx.curves, sheet: ctx.sheet, features: part.features, error: lastError };
}

function build(f, ctx) {
  switch (f.type) {
    case 'import': return buildImport(f, ctx);
    case 'sketch': return { frame: resolvePlane(f.plane, ctx) };
    case 'plane': return buildPlane(f, ctx);
    case 'extrude': return buildExtrude(f, ctx);
    case 'revolve': return buildRevolve(f, ctx);
    case 'hole': return buildHole(f, ctx);
    case 'fillet': return buildDressUp(f, ctx, 'fillet');
    case 'chamfer': return buildDressUp(f, ctx, 'chamfer');
    case 'shell': return buildShell(f, ctx);
    case 'linearPattern': return buildLinearPattern(f, ctx);
    case 'circularPattern': return buildCircularPattern(f, ctx);
    case 'mirror': return buildMirror(f, ctx);
    default:
      if (ADVANCED_TYPES.includes(f.type)) return buildAdvanced(f, ctx);
      if (PART_MORE_TYPES.includes(f.type)) return buildPartMore(f, ctx);
      if (STD_TYPES.includes(f.type)) return buildStdFeature(f, ctx);
      throw codeError('unknown-feature', { type: f.type });
  }
}

/** A body read from a STEP file, kept in the part as OpenCASCADE BREP text (later features build on it). */
function buildImport(f, ctx) {
  const R = rep();
  if (!f.brep) throw codeError('import-empty');
  let shape = R.deserializeShape(f.brep);
  // A body imported before Z up is turned with its project (zup.js) when it is built.
  if (Number(f.turnX)) shape = shape.rotate(Number(f.turnX), [0, 0, 0], [1, 0, 0]);
  return { body: ctx.body ? ctx.body.fuse(shape) : shape };
}

function buildPlane(f, ctx) {
  const base = resolvePlane(f.base, ctx);
  const normal = f.flip ? scale(base.normal, -1) : base.normal;
  return { frame: frame({ origin: add(base.origin, scale(base.normal, Number(f.offset) || 0)), xDir: base.xDir, normal }) };
}

export function sketchOf(f, ctx, id = f.sketch) {
  const sketch = ctx.part.features.find((x) => x.id === id && x.type === 'sketch');
  if (!sketch) throw codeError('sketch-missing');
  const r = ctx.results.get(sketch.id);
  if (!r?.ok || r.suppressed || !r.frame) throw codeError('sketch-failed');
  return { sketch, frame: r.frame };
}

/** Size of everything built so far (for "through all"): the body's diagonal plus the sketch's. */
export function sizeAround(ctx, extra = 0) {
  let size = 100 + extra;
  if (ctx.body) {
    const [lo, hi] = ctx.body.boundingBox.bounds;
    size = Math.max(size, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) * 2 + Math.hypot(...lo) + Math.hypot(...hi));
  }
  return size;
}

/** Joins a tool to the body: boss → fuse, cut → cut (a cut with nothing to cut is an error). */
export function combine(ctx, tool, op, { merge = true } = {}) {
  if (op === 'cut') {
    if (!ctx.body) throw codeError('nothing-to-cut');
    return ctx.body.cut(tool);
  }
  // Intersect: only what the body and the tool share is kept.
  if (op === 'common') {
    if (!ctx.body) throw codeError('nothing-to-cut');
    return ctx.body.intersect(tool);
  }
  if (!ctx.body) return tool;
  // Merge result off: the new solid is a body of its own beside the ones there (a multi-body part).
  if (merge === false) { const R = rep(); return R.makeCompound([...solidList(ctx.body), ...solidList(tool)]); }
  return ctx.body.fuse(tool);
}

/** The solids of a shape (one solid, or the solids of a compound). */
function solidList(shape) {
  const R = rep();
  try { const list = [...R.iterTopo(shape.wrapped, 'solid')].map((x) => R.cast(x)); return list.length ? list : [shape]; } catch { return [shape]; }
}

/**
 * The sketch's regions extruded. The regions are fused into one drawing first; when the kernel turns that into an
 * inside-out solid (seen with many small regions, e.g. 30 tooth spaces, and differently for different plane
 * orientations), each region is extruded on its own and the solids fused instead.
 */
function extrudeDrawing(sketch, drawing, plane, length) {
  const R = rep();
  let solid = null;
  try { solid = drawing.sketchOnPlane(plane).extrude(length); if (R.measureVolume(solid) > 0) return solid; } catch { /* rebuilt below */ }
  const regions = profiles(sketch);
  const texts = sketch.entities.filter((e) => e.type === 'text' && !e.construction && String(e.text ?? '').trim());
  if (regions.length + texts.length < 2) return solid ?? drawing.sketchOnPlane(plane).extrude(length);
  let out = null;
  for (const region of regions) {
    let d = loopDrawing(region.outer);
    for (const hole of region.holes) d = d.cut(loopDrawing(hole));
    const one = d.sketchOnPlane(plane).extrude(length);
    out = out ? out.fuse(one) : one;
  }
  for (const e of texts) { const one = textDrawing(e).sketchOnPlane(plane).extrude(length); out = out ? out.fuse(one) : one; }
  return out;
}

function extrudeTool(f, ctx) {
  const { sketch, frame: fr } = sketchOf(f, ctx);
  const drawing = sketchDrawing(sketch);
  const cut = f.op === 'cut';
  if (f.draft && Number(f.draftAngle) > 0 && (f.end ?? 'blind') === 'blind') return draftedExtrude(f, sketch, fr);
  // Bosses grow along the sketch normal, cuts go into the material (against it); Reverse flips both.
  let dir = cut ? -1 : 1;
  if (f.reverse) dir = -dir;
  const bounds = Math.max(profiles(sketch).reduce((m, r) => Math.max(m, ...r.outer.points.map(([x, y]) => Math.hypot(x, y))), 0), ...sketch.entities.filter((e) => e.type === 'text').map((e) => Math.hypot(e.x, e.y) + (Number(e.size) || 10) * String(e.text).length));
  const big = sizeAround(ctx, bounds * 2);
  let start = 0; let length;
  if (f.end === 'through') length = big * dir;
  else if (f.end === 'throughBoth') { start = -big; length = 2 * big; }
  else if (f.end === 'midplane') { start = -Math.abs(f.depth) / 2; length = Math.abs(f.depth); }
  else length = Math.abs(Number(f.depth)) * dir;
  if (!(Math.abs(length) > 1e-6)) throw codeError('zero-depth');
  const plane = replicadPlane({ ...fr, origin: add(fr.origin, scale(fr.normal, start)) });
  let solid = extrudeDrawing(sketch, drawing, plane, length);
  // Direction 2 (the second direction): the other way from the sketch plane.
  if (f.end2 && f.end2 !== 'none' && (f.end === 'blind' || f.end === 'through')) {
    const length2 = f.end2 === 'through' ? -big * dir : -Math.abs(Number(f.depth2)) * dir;
    const other = extrudeDrawing(sketch, sketchDrawing(sketch), replicadPlane(fr), length2);
    solid = solid.fuse(other);
  }
  return solid;
}

/** A blind extrude with a draft angle ("Draft On/Off"): the side faces taper as it grows. */
function draftedExtrude(f, sketch, fr) {
  const R = rep();
  const dir = (f.op === 'cut' ? -1 : 1) * (f.reverse ? -1 : 1);
  const depth = Math.abs(Number(f.depth)) || 1;
  const normal = scale(fr.normal, dir);
  const neutral = new R.Plane(fr.origin, fr.xDir, normal);
  let solid = null;
  for (const region of profiles(sketch)) {
    let d = loopDrawing(region.outer);
    for (const hole of region.holes) d = d.cut(loopDrawing(hole));
    const angle = (f.draftOutward ? -1 : 1) * Number(f.draftAngle);
    let tapered;
    try {
      // Inward taper by default (a boss gets smaller as it grows); "outward" turns it the other way.
      tapered = d.clone().sketchOnPlane(neutral).extrude(depth).draft(angle, (finder) => finder.not((g) => g.parallelTo(neutral)), neutral);
    } catch {
      // The kernel's draft fails on some faces (a full cylinder): a loft to the profile offset by depth·tan(angle).
      const inset = -depth * Math.tan((angle * Math.PI) / 180);
      const loftOf = (loop) => {
        const bottom = loopDrawing(loop).sketchOnPlane(neutral);
        const top = loopDrawing(loop).offset(inset).sketchOnPlane(new R.Plane(add(fr.origin, scale(normal, depth)), fr.xDir, normal));
        return bottom.loftWith(top);
      };
      tapered = loftOf(region.outer);
      for (const hole of region.holes) tapered = tapered.cut(loftOf(hole));
    }
    solid = solid ? solid.fuse(tapered) : tapered;
  }
  return solid;
}

function buildExtrude(f, ctx) {
  const tool = extrudeTool(f, ctx);
  return { tool, body: combine(ctx, tool, f.op, { merge: f.merge !== false }) };
}

function revolveTool(f, ctx) {
  const { sketch, frame: fr } = sketchOf(f, ctx);
  const axis = (f.axis && byId(sketch, f.axis)) || constructionLines(sketch)[0];
  if (!axis || axis.type !== 'line') throw codeError('no-axis');
  const a = byId(sketch, axis.p1); const b = byId(sketch, axis.p2);
  const pa = toWorld(fr, [a.x, a.y]); const pb = toWorld(fr, [b.x, b.y]);
  let dir = normalize([pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]]);
  if (f.reverse) dir = scale(dir, -1);
  const angle = Math.max(0.1, Math.min(360, Number(f.angle) || 360));
  const drawing = sketchDrawing(sketch);
  return drawing.sketchOnPlane(replicadPlane(fr)).revolve(dir, { origin: pa, angle });
}

function buildRevolve(f, ctx) {
  const tool = revolveTool(f, ctx);
  return { tool, body: combine(ctx, tool, f.op, { merge: f.merge !== false }) };
}

/** Hole profile in (radius, depth) — depth grows into the material; a blind hole ends in a 118° drill point. */
export function holeProfile(f, depth) {
  const r = Math.max(0.05, Number(f.diameter) / 2);
  const lead = 0.01 * Math.max(1, r);
  const tip = f.through ? 0 : r / Math.tan((59 * Math.PI) / 180);
  const pts = [[0, -lead]];
  if (f.kind === 'counterbore') {
    const rb = Math.max(r + 0.05, Number(f.cbDiameter) / 2);
    const hb = Math.min(depth * 0.95, Math.max(0.05, Number(f.cbDepth)));
    pts.push([rb, -lead], [rb, hb], [r, hb]);
  } else if (f.kind === 'countersink') {
    const rs = Math.max(r + 0.05, Number(f.csDiameter) / 2);
    const half = (Math.max(30, Math.min(150, Number(f.csAngle) || 90)) * Math.PI) / 360;
    const hs = (rs - r) / Math.tan(half);
    pts.push([rs + lead * Math.tan(half), -lead], [r, hs]);
  } else pts.push([r, -lead]);
  pts.push([r, depth]);
  pts.push([0, depth + tip]);
  return pts;
}

/** The axes of a hole feature's holes: [{ at (on the sketch plane), dir (into the material) }]. */
export function holeAxes(f, ctx) {
  const { sketch, frame: fr } = sketchOf(f, ctx);
  const into = scale(fr.normal, -1);
  return standalonePoints(sketch).map((p) => ({ at: toWorld(fr, [p.x, p.y]), dir: into }));
}

function holeTool(f, ctx) {
  const R = rep();
  const { sketch, frame: fr } = sketchOf(f, ctx);
  const points = standalonePoints(sketch);
  if (!points.length) throw codeError('no-hole-points');
  const into = scale(fr.normal, -1);
  const depth = f.through ? sizeAround(ctx) : Math.max(0.1, Number(f.depth));
  const profile = holeProfile(f, depth);
  let tool = null;
  for (const p of points) {
    const at = toWorld(fr, [p.x, p.y]);
    // The profile's plane holds the hole axis: x = radial (the sketch x), y = into the material.
    const u = fr.xDir;
    const plane = new R.Plane(at, u, crossV(u, into));
    let pen = R.draw(profile[0]);
    for (const q of profile.slice(1)) pen = pen.lineTo(q);
    const one = pen.close().sketchOnPlane(plane).revolve(into, { origin: at });
    tool = tool ? tool.fuse(one) : one;
  }
  return tool;
}

function buildHole(f, ctx) {
  const tool = holeTool(f, ctx);
  const body = combine(ctx, tool, 'cut');
  // A tapped hole: the tap drill, then the ISO thread (cosmetic, or modelled into the body — hole-threads.js).
  if (f.kind === 'tapped' && ctx.body) {
    let t;
    try { t = tapHoles(f, holeAxes(f, ctx), ctx.body, body, { maxLen: sizeAround(ctx) }); } catch (error) { throw codeError(error.code ?? 'thread-failed'); }
    return { tool, body: t.body, ...(t.threads.length ? { thread: t.thread, threads: t.threads } : {}) };
  }
  return { tool, body };
}

function buildDressUp(f, ctx, kind) {
  if (!ctx.body) throw codeError('no-body');
  const edges = findEdges(ctx.body, f.edges);
  if (!edges.length) throw codeError('no-edges');
  if (edges.length < f.edges.length) ctx.warning = 'edges-lost';
  const size = Number(kind === 'fillet' ? f.radius : f.distance);
  if (!(size > 0)) throw codeError('zero-size');
  const pick = (e) => (edges.some((m) => m.isSame(e)) ? size : null);
  const body = kind === 'fillet' ? ctx.body.fillet(pick) : ctx.body.chamfer(pick);
  return { body, matched: edges.length };
}

function buildShell(f, ctx) {
  if (!ctx.body) throw codeError('no-body');
  const t = Number(f.thickness);
  if (!(t > 0)) throw codeError('zero-size');
  const faces = f.faces.map((sig) => findFace(ctx.body, sig)).filter(Boolean);
  if (!faces.length) throw codeError('no-faces');
  const body = ctx.body.shell(t, (finder) => finder.when(({ element }) => faces.some((m) => m.isSame(element))));
  return { body };
}

/** The tool solids of the seed features (bosses and cuts kept apart). */
function seedTools(f, ctx) {
  const tools = [];
  for (const id of f.seeds ?? []) {
    const seed = ctx.part.features.find((x) => x.id === id);
    const r = ctx.results.get(id);
    if (!seed || !r?.ok || !r.tool) continue;
    tools.push({ tool: r.tool, op: r.toolOp ?? (seed.type === 'hole' || seed.op === 'cut' ? 'cut' : 'boss') });
  }
  return tools;
}

/** A direction reference: a world axis or a straight edge of the body. */
function resolveDirection(ref, ctx) {
  if (!ref || ref.kind === 'axis') return AXES[ref?.axis ?? 'x'] ?? AXES.x;
  if (ref.kind === 'edge') {
    const [edge] = findEdges(ctx.body, [ref.sig]);
    if (!edge) throw codeError('edge-missing');
    const s = edge.startPoint; const e = edge.endPoint;
    return normalize([e.x - s.x, e.y - s.y, e.z - s.z]);
  }
  return AXES.x;
}

/** An axis reference: { origin, dir } — a world axis through the origin, or a straight / circular edge. */
function resolveAxis(ref, ctx) {
  if (!ref || ref.kind === 'axis') return { origin: [0, 0, 0], dir: AXES[ref?.axis] ?? worldUp() };
  if (ref.kind === 'ref') return refAxisOf(ref, ctx);
  if (ref.kind === 'edge') {
    const [edge] = findEdges(ctx.body, [ref.sig]);
    if (!edge) throw codeError('edge-missing');
    if (edge.geomType === 'CIRCLE') {
      const R = rep();
      const curve = R.getOC ? null : null; void curve;
      // A circle's axis: through its centre (mean of three points' circumcentre) along its normal.
      const p0 = vec(edge.pointAt(0)); const p1 = vec(edge.pointAt(0.25)); const p2 = vec(edge.pointAt(0.5));
      const c = circumcentre(p0, p1, p2);
      return { origin: c, dir: normalize(crossV([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]])) };
    }
    const s = vec(edge.startPoint); const e = vec(edge.endPoint);
    return { origin: s, dir: normalize([e[0] - s[0], e[1] - s[1], e[2] - s[2]]) };
  }
  return { origin: [0, 0, 0], dir: worldUp() };
}

const vec = (v) => (Array.isArray(v) ? v : [v.x, v.y, v.z]);

function circumcentre(a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = crossV(ab, ac);
  const d = 2 * dot(n, n);
  if (d < 1e-18) return a;
  const t1 = scale(crossV(n, ab), dot(ac, ac));
  const t2 = scale(crossV(ac, n), dot(ab, ab));
  return add(a, scale(add(t1, t2), 1 / d));
}

function applyCopies(ctx, tools, transforms) {
  let body = ctx.body;
  if (!body) throw codeError('no-body');
  let made = 0;
  for (const move of transforms) {
    for (const { tool, op } of tools) {
      const copy = move(tool.clone());
      body = op === 'cut' ? body.cut(copy) : body.fuse(copy);
      made++;
    }
  }
  return { body, copies: made };
}

function buildLinearPattern(f, ctx) {
  const tools = f.body ? [{ tool: ctx.body, op: 'boss' }] : seedTools(f, ctx);
  if (!tools.length) throw codeError('no-seeds');
  let d1 = resolveDirection(f.direction, ctx);
  if (f.reverse) d1 = scale(d1, -1);
  const n1 = Math.max(1, Math.min(200, Math.round(f.count)));
  const s1 = Number(f.spacing) || 0;
  let d2 = f.direction2 ? resolveDirection(f.direction2, ctx) : null;
  if (d2 && f.reverse2) d2 = scale(d2, -1);
  const n2 = d2 ? Math.max(1, Math.min(200, Math.round(f.count2))) : 1;
  const s2 = Number(f.spacing2) || 0;
  const moves = []; const places = []; const steps = [];
  for (let i = 0; i < n1; i++) for (let j = 0; j < n2; j++) {
    if (!i && !j) continue;
    const v = add(scale(d1, i * s1), d2 ? scale(d2, j * s2) : [0, 0, 0]);
    moves.push((s) => s.translate(v));
    places.push((q, isDir) => (isDir ? q : add(q, v)));
    steps.push({ kind: 'translate', v });
  }
  // The moves as data too (a pattern-driven component pattern repeats them in an assembly).
  return { ...patternThreads(f, ctx, applyCopies(ctx, tools, moves), places), moves: steps };
}

/** A point / direction rotation by `deg` about the axis through `origin` along `dir` (Rodrigues): (q, isDir) → q'. */
function rotation(deg, origin, dir) {
  const k = normalize(dir); const a = (deg * Math.PI) / 180; const c = Math.cos(a); const sn = Math.sin(a);
  return (q, isDir) => {
    const v = isDir ? q : [q[0] - origin[0], q[1] - origin[1], q[2] - origin[2]];
    const kv = k[0] * v[0] + k[1] * v[1] + k[2] * v[2]; const kx = crossV(k, v);
    const r = [0, 1, 2].map((i) => v[i] * c + kx[i] * sn + k[i] * kv * (1 - c));
    return isDir ? r : [r[0] + origin[0], r[1] + origin[1], r[2] + origin[2]];
  };
}

function buildCircularPattern(f, ctx) {
  const tools = f.body ? [{ tool: ctx.body, op: 'boss' }] : seedTools(f, ctx);
  if (!tools.length) throw codeError('no-seeds');
  const { origin, dir } = resolveAxis(f.axis, ctx);
  const count = Math.max(1, Math.min(360, Math.round(f.count)));
  const total = Math.max(0.1, Math.min(360, Number(f.angle) || 360));
  const step = f.equal ? (total >= 359.999 ? total / count : total / Math.max(1, count - 1)) : total;
  const sign = f.reverse ? -1 : 1;
  const moves = []; const places = []; const steps = [];
  for (let i = 1; i < count; i++) {
    moves.push((s) => s.rotate(sign * step * i, origin, dir));
    places.push(rotation(sign * step * i, origin, dir));
    steps.push({ kind: 'rotate', deg: sign * step * i, origin: [...origin], dir: [...dir] });
  }
  return { ...patternThreads(f, ctx, applyCopies(ctx, tools, moves), places), moves: steps };
}

function buildMirror(f, ctx) {
  if (!ctx.body) throw codeError('no-body');
  const fr = resolvePlane(f.plane, ctx);
  if (f.body) return { body: ctx.body.fuse(ctx.body.clone().mirror(fr.normal, fr.origin)) };
  const tools = seedTools(f, ctx);
  if (!tools.length) throw codeError('no-seeds');
  return applyCopies(ctx, tools, [(s) => s.mirror(fr.normal, fr.origin)]);
}

// ───────────────────────── helpers for the app

/** The sketch features a feature of `type` can use (a sketch with closed regions or with points for holes). */
export function usableSketches(part, type, beforeIndex = part.features.length) {
  return part.features.slice(0, beforeIndex).filter((f) => f.type === 'sketch' && !f.suppressed && !part.features.some((x) => x.sketch === f.id) && (type === 'hole' ? standalonePoints(f).length : hasRegions(f)));
}

/** A copy of a part's feature list (for edits that can be cancelled). */
export const cloneFeatures = (features) => JSON.parse(JSON.stringify(features));

export { newSketchId };
