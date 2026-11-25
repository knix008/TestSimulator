// Assembly and sketch extras (the modelling side; app-sim2.js has the UI):
//   assembly features — cut-extrudes and holes made at assembly level through several components: the tool is
//     a solid in assembly space (a rectangle or circle on a standard plane, extruded through or to a depth) and
//     is cut from each chosen component's body in that component's own frame (the parts themselves stay as
//     they are — the cut belongs to the assembly); a sub-assembly's own cuts move with it, cuts reach the parts
//     inside sub-assemblies, and mass properties, interference, drawings and mates all use the cut bodies;
//   belts and chains — between two pulleys / sprockets (cylindrical faces of two components with parallel axes):
//     the open-belt length 2C·cos β + r1(π + 2β) + r2(π − 2β), the path (two tangents, two arcs), a swept belt body
//     as a triangle mesh, and for chains the number of links of a pitch (rounded up to even, the length follows);
//   sketch blocks — sketch entities grouped as a reusable block (kept in the project), inserted as instances
//     (moved, rotated, scaled copies tagged with the instance), exploded back into plain entities;
//   sketch picture — an image placed on a sketch plane as a tracing reference (corners on the plane, opacity);
//   library features — a feature with its sketch saved as a library item and inserted on a picked planar face
//     (the sketch is put on that face; ids are new).
import { rep } from './kernel.js';
import { solveSketch, DIMENSIONS } from './sketch.js';
import { quatToAxisAngle, quatConjugate, rotate, composePlacement, flattenAssembly, placeShape } from './assembly.js';
import { newSketchId, pointsOf, byId, refreshEquation, mapEquationPlace, ORIGIN, POINT_KEYS } from './sketch.js';
import { STD_PLANES, frame as makeFrame } from './features.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a); return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 0]; };
const round = (v) => Math.round(v * 1e6) / 1e6;

// ───────────────────────── assembly features

export const ASM_FEATURE_TYPES = ['asmCut', 'asmHole'];

/**
 * A new assembly feature: { id, type: 'asmCut' | 'asmHole', name, plane ('front' | 'top' | 'right'), offset (along
 * the plane normal), profile { kind: 'rect', cx, cy, w, h } | { kind: 'circle', cx, cy, d }, depth (mm; 0 = through
 * all), both (through both sides), comps: [component ids] (empty: every component) }.
 */
export function createAsmFeature(asm, type, opts = {}) {
  const list = asm.asmFeatures ?? [];
  const f = {
    id: opts.id ?? `af${Date.now().toString(36).slice(-5)}${list.length}`, type, name: opts.name ?? `${type}${list.length + 1}`,
    plane: opts.plane ?? 'top', offset: opts.offset ?? 0,
    profile: opts.profile ?? (type === 'asmHole' ? { kind: 'circle', cx: 0, cy: 0, d: 10 } : { kind: 'rect', cx: 0, cy: 0, w: 20, h: 20 }),
    depth: opts.depth ?? 0, both: opts.both ?? true, comps: opts.comps ?? [],
  };
  asm.asmFeatures = [...list, f];
  return f;
}

/** The frame of an assembly feature's sketch plane (origin moved by the offset). */
export function asmFeatureFrame(f) {
  const fr = makeFrame(STD_PLANES[f.plane] ?? STD_PLANES.top);
  return { ...fr, origin: add(fr.origin, scale(fr.normal, Number(f.offset) || 0)) };
}

/** The tool solid of an assembly feature in assembly space (kernel). `size`: the assembly's size (through all). */
export function asmFeatureTool(f, size = 1000) {
  const R = rep();
  const fr = asmFeatureFrame(f);
  const plane = new R.Plane(fr.origin, fr.xDir, fr.normal);
  const p = f.profile ?? {};
  const depth = Number(f.depth) > 0 ? Number(f.depth) : 4 * size;
  const drawing = p.kind === 'circle'
    ? R.drawCircle(Math.max(1e-3, Number(p.d) / 2)).translate(Number(p.cx) || 0, Number(p.cy) || 0)
    : R.drawRectangle(Math.max(1e-3, Number(p.w)), Math.max(1e-3, Number(p.h))).translate(Number(p.cx) || 0, Number(p.cy) || 0);
  const both = f.both !== false;
  const sk = drawing.sketchOnPlane(plane);
  // Through both sides: start the extrusion behind the plane.
  let tool = sk.extrude(both ? 2 * depth : depth);
  if (both) tool = tool.translate(scale(fr.normal, -depth));
  return tool;
}

/** The inverse of a placement as a placement. */
const inversePlacement = (c) => { const q = quatConjugate(c.rotation); const p = rotate(q, c.position); return { position: scale(p, -1), rotation: q }; };

function placed(shape, c) {
  let s = shape;
  const { axis, angle } = quatToAxisAngle(c.rotation);
  if (Math.abs(angle) > 1e-9) s = s.rotate(angle, [0, 0, 0], axis);
  if (c.position.some((v) => Math.abs(v) > 1e-12)) s = s.translate(c.position);
  return s;
}

/** Does feature f act on component id? */
export const featureActsOn = (f, id) => !f.suppressed && (!f.comps?.length || f.comps.includes(id));

/**
 * A component's body with the assembly features cut from it, in the component's own frame (kernel).
 * body: the part's solid (not consumed); placement: the component's placement in the assembly. Returns the new
 * solid, or the body itself when no feature acts on the component.
 */
export function cutComponent(body, placement, features, compId, size = 1000) {
  const acting = (features ?? []).filter((f) => featureActsOn(f, compId));
  if (!acting.length || !body) return body;
  let shape = body.clone();
  const inv = inversePlacement(placement);
  for (const f of acting) {
    const tool = placed(asmFeatureTool(f, size), inv);
    try { shape = shape.cut(tool); } catch { /* the tool misses this body */ }
  }
  return shape;
}

const IDENT = { position: [0, 0, 0], rotation: [0, 0, 0, 1] };
const composeP = (a, b) => composePlacement({ position: a.position, rotation: a.rotation }, { position: b.position, rotation: b.rotation });

/**
 * The assembly features that act on one part of a component: those of the assembly acting on the component
 * itself, then — down a sub-assembly — those of every sub-assembly on the way acting on the component the path
 * goes through (they belong to that sub-assembly and move with it). Returns [{ f, frame }], `frame` being the
 * placement of the feature's own assembly in the top assembly's space. `compPlacement`: the component's
 * placement (default its own).
 */
export function leafCutFeatures(project, asm, comp, leafPath = [], compPlacement = null) {
  const out = [];
  if (!asm || !comp || comp.suppressed) return out;
  const take = (a, id, frame) => { for (const f of a?.asmFeatures ?? []) if (featureActsOn(f, id)) out.push({ f, frame }); };
  take(asm, comp.id, IDENT);
  let cur = comp.sub ? project?.assemblies?.find((x) => x.id === comp.sub) : null;
  let pl = compPlacement ?? { position: comp.position ?? [0, 0, 0], rotation: comp.rotation ?? [0, 0, 0, 1] };
  for (const id of leafPath) {
    if (!cur) break;
    take(cur, id, pl);
    const node = cur.components.find((c) => c.id === id);
    if (!node) break;
    pl = composeP(pl, node);
    cur = node.sub ? project?.assemblies?.find((x) => x.id === node.sub) : null;
  }
  return out;
}

/**
 * A part's body with assembly cuts taken out, in the part's own frame. `leafPlacement`: the part's placement in
 * the top assembly; `cuts`: from leafCutFeatures. The body is not consumed; with no cuts the body is returned.
 */
export function cutLeafBody(body, leafPlacement, cuts, size = 1000) {
  if (!cuts?.length || !body) return body;
  let shape = body.clone();
  const inv = inversePlacement(leafPlacement);
  for (const { f, frame } of cuts) {
    let tool = asmFeatureTool(f, size);
    if (frame && frame !== IDENT) tool = placed(tool, frame);
    tool = placed(tool, inv);
    try { shape = shape.cut(tool); } catch { /* the tool misses this body */ }
  }
  return shape;
}

/**
 * Every part of an assembly placed in its space with the assembly cuts taken out (what mass properties,
 * interference and drawings measure): [{ comp, path, part, placement, cut (bool), shape }]. `bodyOf(partId)` →
 * the part's solid (not consumed). Hidden / suppressed components are skipped.
 */
export function assemblyCutShapes(project, asm, bodyOf, { size = 1000, includeHidden = false } = {}) {
  const out = [];
  for (const comp of asm?.components ?? []) {
    if (comp.suppressed || (comp.hidden && !includeHidden)) continue;
    const leaves = comp.sub ? flattenAssembly(project, project.assemblies.find((a) => a.id === comp.sub) ?? { components: [] }) : [{ path: [], part: comp.part, placement: IDENT }];
    for (const leaf of leaves) {
      const body = bodyOf(leaf.part);
      if (!body) continue;
      const placement = composeP(comp, leaf.placement);
      const cuts = leafCutFeatures(project, asm, comp, leaf.path);
      const local = cutLeafBody(body, placement, cuts, size);
      out.push({ comp, path: leaf.path, part: leaf.part, placement, cut: cuts.length > 0, shape: placeShape(local, placement) });
    }
  }
  return out;
}

/**
 * Mass properties of an assembly with its cuts: { mass (kg), volume (mm³), centerOfMass, parts }.
 * `densityOf(partId)` kg/m³.
 */
export function assemblyCutMass(project, asm, bodyOf, densityOf, opts = {}) {
  const R = rep();
  let mass = 0; let volume = 0; const com = [0, 0, 0];
  const list = assemblyCutShapes(project, asm, bodyOf, opts);
  for (const x of list) {
    const vp = R.measureShapeVolumeProperties(x.shape);
    const m = vp.volume * 1e-9 * densityOf(x.part);
    mass += m; volume += vp.volume;
    vp.centerOfMass.forEach((v, i) => { com[i] += v * m; });
  }
  if (mass > 0) for (let i = 0; i < 3; i++) com[i] /= mass;
  return { mass, volume, centerOfMass: com, parts: list.length };
}

// ───────────────────────── belts and chains

/**
 * The belt between two pulleys: { c1, r1 } and { c2, r2 } (centres on their axes, radii), axis (unit, the pulleys'
 * common axis direction). Returns { length, span (centre distance in the belt plane), beta, wrap1, wrap2, path
 * (closed polyline, points xyz), normals (outward, per point) } or null when the pulleys overlap.
 */
export function beltPath(p1, p2, axis, { segments = 32 } = {}) {
  const w = unit(axis);
  // Both centres in one plane perpendicular to the axis (half-way along it).
  const mid = (dot(p1.c, w) + dot(p2.c, w)) / 2;
  const c1 = add(p1.c, scale(w, mid - dot(p1.c, w))), c2 = add(p2.c, scale(w, mid - dot(p2.c, w)));
  const d = len(sub(c2, c1)), r1 = p1.r, r2 = p2.r;
  if (!(d > Math.abs(r1 - r2) + 1e-9) || !(r1 > 0) || !(r2 > 0)) return null;
  const e = scale(sub(c2, c1), 1 / d), n = unit(cross(w, e));
  const beta = Math.asin((r1 - r2) / d);
  const length = 2 * d * Math.cos(beta) + r1 * (Math.PI + 2 * beta) + r2 * (Math.PI - 2 * beta);
  const dirAt = (ang) => add(scale(e, Math.cos(ang)), scale(n, Math.sin(ang)));
  const path = [], normals = [];
  const arc = (c, r, a0, a1) => {
    const k = Math.max(4, Math.round((segments * Math.abs(a1 - a0)) / Math.PI));
    for (let i = 0; i <= k; i++) { const a = a0 + ((a1 - a0) * i) / k; const u = dirAt(a); path.push(add(c, scale(u, r))); normals.push(u); }
  };
  const top = Math.PI / 2 - beta;
  // Pulley 2 from the upper tangent round its far side to the lower one, then pulley 1 back round its far side.
  arc(c2, r2, top, -top);
  arc(c1, r1, -top, -top - (Math.PI + 2 * beta));
  return { length, span: d, beta, wrap1: Math.PI + 2 * beta, wrap2: Math.PI - 2 * beta, path, normals, c1, c2, axis: w };
}

/** The number of chain links of a pitch for a belt length (even, at least the length) and the chain's length. */
export function chainLinks(length, pitch) {
  if (!(pitch > 0)) return { links: 0, length };
  let links = Math.ceil(length / pitch - 1e-9);
  if (links % 2) links++;
  return { links, length: links * pitch };
}

/**
 * The belt body as a triangle mesh (vertices, normals, triangles, faceGroups) around a closed path: a band of
 * `width` along the axis and `thickness` outward from the pulleys.
 */
export function beltMesh(belt, { width = 10, thickness = 2 } = {}) {
  const { path, normals, axis } = belt;
  const n = path.length;
  const vertices = [], norms = [], triangles = [];
  const hw = width / 2;
  // Four corners per path point: inner/outer × back/front.
  const corner = (i, outer, front) => add(add(path[i], scale(normals[i], outer ? thickness : 0)), scale(axis, front ? hw : -hw));
  const quad = (a, b, c, d, nrm) => {
    const base = vertices.length / 3;
    for (const p of [a, b, c, d]) vertices.push(...p);
    for (let k = 0; k < 4; k++) norms.push(...nrm);
    triangles.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (len(sub(path[j], path[i])) < 1e-9) continue;
    const nm = unit(add(normals[i], normals[j]));
    quad(corner(i, true, false), corner(j, true, false), corner(j, true, true), corner(i, true, true), nm);
    quad(corner(i, false, true), corner(j, false, true), corner(j, false, false), corner(i, false, false), scale(nm, -1));
    quad(corner(i, false, true), corner(i, true, true), corner(j, true, true), corner(j, false, true), axis);
    quad(corner(j, false, false), corner(j, true, false), corner(i, true, false), corner(i, false, false), scale(axis, -1));
  }
  return { vertices: Float32Array.from(vertices), normals: Float32Array.from(norms), triangles: Uint32Array.from(triangles), faceGroups: [{ start: 0, count: triangles.length, faceId: 0 }] };
}

/** Volume of a closed triangle mesh (divergence theorem), mm³. */
export function meshVolume(mesh) {
  const V = mesh.vertices, T = mesh.triangles;
  let vol = 0;
  for (let t = 0; t < T.length; t += 3) {
    const a = 3 * T[t], b = 3 * T[t + 1], c = 3 * T[t + 2];
    vol += (V[a] * (V[b + 1] * V[c + 2] - V[b + 2] * V[c + 1]) - V[a + 1] * (V[b] * V[c + 2] - V[b + 2] * V[c]) + V[a + 2] * (V[b] * V[c + 1] - V[b + 1] * V[c])) / 6;
  }
  return vol;
}

/** A belt / chain record: { id, kind: 'belt' | 'chain', name, a, b (pulley refs { comp, sig, path? }), width, thickness, pitch }. */
export function createBelt(asm, kind, a, b, opts = {}) {
  const list = asm.belts ?? [];
  const belt = { id: opts.id ?? `belt${Date.now().toString(36).slice(-5)}${list.length}`, kind, name: opts.name ?? `${kind}${list.length + 1}`, a, b, width: opts.width ?? 10, thickness: opts.thickness ?? (kind === 'chain' ? 6 : 2), pitch: opts.pitch ?? 12.7 };
  asm.belts = [...list, belt];
  return belt;
}

// ───────────────────────── sketch blocks

/**
 * A block from sketch entities: the entities, the points they use and the relations among them, relative to a base
 * point (x0, y0). { id, name, base, entities, constraints }.
 */
export function makeBlock(sketch, ids, { name = 'Block', id = null, base = null } = {}) {
  const pick = new Set(ids.filter((x) => x !== ORIGIN));
  const curves = sketch.entities.filter((e) => pick.has(e.id) && e.type !== 'point');
  const pointIds = new Set([...sketch.entities.filter((e) => pick.has(e.id) && e.type === 'point').map((e) => e.id), ...curves.flatMap(pointsOf)]);
  const pts = [...pointIds].map((p) => byId(sketch, p)).filter(Boolean);
  if (!pts.length && !curves.some((e) => e.type === 'text')) return null;
  const xs = [...pts.map((p) => p.x), ...curves.filter((e) => e.type === 'text').map((e) => e.x)], ys = [...pts.map((p) => p.y), ...curves.filter((e) => e.type === 'text').map((e) => e.y)];
  const b = base ?? [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  const all = new Set([...pointIds, ...curves.map((e) => e.id)]);
  const entities = [...pts.map((p) => ({ id: p.id, type: 'point', x: round(p.x - b[0]), y: round(p.y - b[1]), ...(p.standalone ? { standalone: true } : {}) })),
    ...curves.map((e) => { const c = JSON.parse(JSON.stringify(e)); delete c.fixed; delete c.block; if (c.type === 'text') { c.x = round(c.x - b[0]); c.y = round(c.y - b[1]); } if (c.type === 'equation') c.place = mapEquationPlace(e, ([px, py]) => [px - b[0], py - b[1]]); if (c.focus) { c.focus = [c.focus[0] - b[0], c.focus[1] - b[1]]; c.apex = [c.apex[0] - b[0], c.apex[1] - b[1]]; } return c; })];
  const constraints = (sketch.constraints ?? []).filter((c) => [c.a, c.b, c.c].filter(Boolean).every((x) => all.has(x)) && !['fix'].includes(c.type)).map((c) => JSON.parse(JSON.stringify(c)));
  return { id: id ?? `blk${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 1e3)}`, name, base: b, entities, constraints };
}

/**
 * Inserts a block instance at (x, y), rotated by `angle` (degrees) and scaled: new ids, each entity tagged
 * { block: { id: block id, instance } }. Returns { instance, ids }.
 */
export function insertBlock(sketch, block, { x = 0, y = 0, angle = 0, scale: k = 1, instance = null } = {}) {
  const inst = instance ?? `bi${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 1e4)}`;
  const a = (angle * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  const tf = (px, py) => [round(x + k * (ca * px - sa * py)), round(y + k * (sa * px + ca * py))];
  const map = new Map();
  for (const e of block.entities) map.set(e.id, newSketchId(e.type === 'point' ? 'p' : e.type[0]));
  const ids = [];
  for (const e of block.entities) {
    // Each entity remembers which of the block's it is (so the instance's place can be found from its points).
    const n = { ...JSON.parse(JSON.stringify(e)), id: map.get(e.id), block: { id: block.id, instance: inst, src: e.id } };
    if (e.type === 'point') { [n.x, n.y] = tf(e.x, e.y); }
    for (const key of POINT_KEYS) if (n[key]) n[key] = map.get(n[key]) ?? n[key];
    if (n.pts) n.pts = n.pts.map((id) => map.get(id) ?? id);
    if (n.r != null) n.r = round(n.r * k);
    if (n.rx != null) { n.rx = round(n.rx * k); n.ry = round(n.ry * k); n.rot = (n.rot ?? 0) + a; }
    if (n.type === 'text') { [n.x, n.y] = tf(e.x, e.y); n.size = (Number(e.size) || 10) * k; n.rot = (e.rot ?? 0) + a; }
    if (n.type === 'equation') n.place = mapEquationPlace(e, ([px, py]) => tf(px, py));
    if (n.focus) { n.focus = tf(...e.focus); n.apex = tf(...e.apex); }
    sketch.entities.push(n);
    ids.push(n.id);
  }
  for (const id of ids) { const n = byId(sketch, id); if (n?.type === 'equation') refreshEquation(sketch, n); }
  for (const c of block.constraints ?? []) {
    const n = { ...JSON.parse(JSON.stringify(c)) };
    for (const key of ['a', 'b', 'c']) if (n[key]) n[key] = map.get(n[key]) ?? n[key];
    if (n.value != null && ['distance', 'hdistance', 'vdistance', 'radius', 'diameter'].includes(n.type)) n.value = round(n.value * k);
    if (n.id) n.id = newSketchId('k');
    sketch.constraints.push(n);
  }
  return { instance: inst, ids };
}

/** Block instances in a sketch: Map instance → { block (id), ids }. */
export function blockInstances(sketch) {
  const out = new Map();
  for (const e of sketch.entities) {
    if (!e.block) continue;
    if (!out.has(e.block.instance)) out.set(e.block.instance, { block: e.block.id, ids: [] });
    out.get(e.block.instance).ids.push(e.id);
  }
  return out;
}

/** Explodes an instance: its entities become plain sketch entities. Returns how many. */
export function explodeBlock(sketch, instance) {
  let n = 0;
  for (const e of sketch.entities) if (e.block?.instance === instance) { delete e.block; n++; }
  return n;
}

// ───────────────────────── sketch picture

/**
 * The picture's corners on the sketch plane, world xyz (counter-clockwise from bottom-left). picture: { x, y
 * (centre, sketch units), width, aspect (h / w), angle (degrees) }; frame: the sketch's plane frame.
 */
export function pictureCorners(picture, fr) {
  const w = Number(picture.width) || 100, hgt = w * (Number(picture.aspect) || 1);
  const a = ((Number(picture.angle) || 0) * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  const cx = Number(picture.x) || 0, cy = Number(picture.y) || 0;
  return [[-w / 2, -hgt / 2], [w / 2, -hgt / 2], [w / 2, hgt / 2], [-w / 2, hgt / 2]].map(([u, v]) => {
    const su = cx + ca * u - sa * v, sv = cy + sa * u + ca * v;
    return add(fr.origin, add(scale(fr.xDir, su), scale(fr.yDir, sv)));
  });
}

/** Normalises the stored picture fields (opacity 0.05–1, width > 0). */
export function normalisePicture(p) {
  return { src: String(p.src ?? ''), name: String(p.name ?? ''), x: Number(p.x) || 0, y: Number(p.y) || 0, width: Math.max(1e-3, Number(p.width) || 100), aspect: Math.max(1e-3, Number(p.aspect) || 1), angle: Number(p.angle) || 0, opacity: Math.min(1, Math.max(0.05, Number(p.opacity ?? 0.5))), visible: p.visible !== false };
}

// ───────────────────────── library features

/**
 * A library item from a feature of the part and the sketch it uses: { id, name, type, features: [sketch, feature] }.
 * null when the feature has no sketch of its own.
 */
export function makeLibraryItem(part, featureId, { name = null, id = null } = {}) {
  const f = part.features.find((x) => x.id === featureId);
  if (!f) return null;
  const sketch = f.type === 'sketch' ? f : part.features.find((x) => x.id === f.sketch && x.type === 'sketch');
  if (!sketch) return null;
  const list = f.type === 'sketch' ? [sketch] : [sketch, f];
  return { id: id ?? `lib${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 1e3)}`, name: name ?? f.name, type: f.type, created: new Date().toISOString(), features: JSON.parse(JSON.stringify(list)) };
}

/**
 * Inserts a library item into a part: its sketch goes on `plane` (a plane reference, e.g. faceRef(face)), with new
 * ids and names (`nameOf(type) → name`). Placed at the end (or before the rollback bar). Returns the new features.
 */
export function insertLibraryItem(part, item, plane, { nameOf = null, newId = null, dims = null } = {}) {
  const ids = new Map();
  const fresh = (f) => (newId ? newId(f.type) : `${f.type.slice(0, 3)}${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 1e5)}`);
  const copies = item.features.map((f) => { const c = JSON.parse(JSON.stringify(f)); const nid = fresh(c); ids.set(c.id, nid); c.id = nid; return c; });
  for (const c of copies) {
    if (c.sketch && ids.has(c.sketch)) c.sketch = ids.get(c.sketch);
    if (c.type === 'sketch') {
      c.plane = JSON.parse(JSON.stringify(plane));
      // Size parameters: the item's dimensions given new values, the sketch solved with them.
      const own = (c.constraints ?? []).filter((k) => dims && dims[k.id] != null && Number.isFinite(Number(dims[k.id])));
      if (own.length) { for (const k of own) k.value = Number(dims[k.id]); solveSketch(c); }
    }
    delete c.suppressed;
    c.name = nameOf ? nameOf(c) : `${item.name}-${c.name}`;
    c.library = item.id;
  }
  const at = part.rollback ?? part.features.length;
  part.features.splice(at, 0, ...copies);
  if (part.rollback != null) part.rollback += copies.length;
  return copies;
}

/** A library item's size parameters: its sketches' driving dimensions [{ id, type, value, sketch }]. */
export function libraryDims(item) {
  const out = [];
  for (const f of item?.features ?? []) if (f.type === 'sketch') for (const k of f.constraints ?? []) if (DIMENSIONS.includes(k.type) && Number.isFinite(Number(k.value)) && !k.driven) out.push({ id: k.id, type: k.type, value: Number(k.value), sketch: f.name });
  return out;
}

/**
 * A face plane reference moved for a library item: its origin at `at` (a point on the face, else the face's own) plus
 * dx, dy along the face's axes, its x direction turned by `angle` degrees in the face.
 */
export function placedFaceRef(ref, normal, { at = null, dx = 0, dy = 0, angle = 0 } = {}) {
  const n = normal; const x = ref.xDir; const y = [n[1] * x[2] - n[2] * x[1], n[2] * x[0] - n[0] * x[2], n[0] * x[1] - n[1] * x[0]];
  let o = ref.origin;
  if (at) { const d = [at[0] - o[0], at[1] - o[1], at[2] - o[2]]; const h = d[0] * n[0] + d[1] * n[1] + d[2] * n[2]; o = [at[0] - h * n[0], at[1] - h * n[1], at[2] - h * n[2]]; }
  o = [0, 1, 2].map((i) => o[i] + dx * x[i] + dy * y[i]);
  const a = (angle * Math.PI) / 180;
  const xr = [0, 1, 2].map((i) => Math.cos(a) * x[i] + Math.sin(a) * y[i]);
  const r6 = (v) => Math.round(v * 1e6) / 1e6;
  return { ...ref, origin: o.map(r6), xDir: xr.map(r6) };
}

/** The library in a storage (localStorage-like; anything with getItem / setItem) or in memory. */
const memory = new Map();
export const LIBRARY_KEY = 'mymechanics.library';
export function loadLibrary(storage = null) {
  try { const raw = storage ? storage.getItem(LIBRARY_KEY) : memory.get(LIBRARY_KEY); const list = JSON.parse(raw ?? '[]'); return Array.isArray(list) ? list : []; } catch { return []; }
}
export function saveLibrary(list, storage = null) {
  const text = JSON.stringify(list);
  try { if (storage) storage.setItem(LIBRARY_KEY, text); else memory.set(LIBRARY_KEY, text); return true; } catch { memory.set(LIBRARY_KEY, text); return false; }
}
