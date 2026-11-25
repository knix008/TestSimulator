// More part features: Advanced Hole (a stack of hole elements from the near side and from the far side —
// counterbore, countersink, straight, tapped, taper — at each point of a sketch), Intersect (the closed regions
// that bodies, surfaces and planes make together: keep or exclude each, merged or as bodies of their own), and
// Mate Reference (up to three faces of a part, with the mate each should get, so the part mates itself when it is
// inserted next to a part with a mate reference of the same name).
import { rep } from './kernel.js';
import { standalonePoints } from './sketch.js';
import { findFace, crossV, normalize } from './refs.js';
import { sketchOf, codeError, sizeAround, toWorld, resolvePlane, replicadPlane } from './features.js';
import { mateEntityOfFace } from './assembly.js';
import { faceSignature } from './refs.js';
import { buildMoveFaceMore } from './move-face.js';

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const num = (v, d = 0) => (v === null || v === '' || v === undefined || !Number.isFinite(Number(v)) ? d : Number(v));
const vec = (v) => (Array.isArray(v) ? v : [v.x, v.y, v.z]);

export function buildPartExtra(f, ctx) {
  switch (f.type) {
    case 'advancedHole': return buildAdvancedHole(f, ctx);
    case 'intersect': return buildIntersect(f, ctx);
    case 'mateReference': return buildMateReference(f, ctx);
    case 'moveFace': return buildMoveFace(f, ctx);
    case 'connectionPoint': return buildConnectionPoint(f, ctx);
    default: throw codeError('unknown-feature', { type: f.type });
  }
}

// ───────────────────────── connection point

/**
 * Connection Point (for magnetic mates): a named point with a direction on a face of the part — a planar face's
 * centre and outward normal, a cylinder's or cone's axis at its end nearest the face's centre (its direction
 * out of the face's end); `offset` moves it along the direction, `flip` turns the direction round. In an
 * assembly, connection points of two components that come near each other snap together (magnetic mate).
 */
function buildConnectionPoint(f, ctx) {
  if (!ctx.body) throw codeError('no-body');
  if (!f.face) throw codeError('no-faces');
  const face = findFace(ctx.body, f.face);
  if (!face) throw codeError('face-missing');
  const ent = mateEntityOfFace(face, faceSignature);
  let point = ent.point; let dir = normalize(ent.dir);
  if (ent.kind === 'axis') {
    // The axis's end at the face's outer end: the face's points' extent along the axis, the end farther out
    // from the body's centre.
    const ts = face.edges.flatMap((e) => [e.startPoint, e.endPoint]).map((v) => dot(sub(vec(v), ent.point), dir));
    const lo = Math.min(...ts); const hi = Math.max(...ts);
    const box = ctx.body.boundingBox; const c = vec(box.center);
    const tc = dot(sub(c, ent.point), dir);
    const t = Math.abs(hi - tc) >= Math.abs(lo - tc) ? hi : lo;
    if (t === lo) dir = mul(dir, -1);
    point = add(ent.point, mul(normalize(ent.dir), t));
  }
  if (f.flip) dir = mul(dir, -1);
  point = add(point, mul(dir, num(f.offset, 0)));
  const name = String(f.cpName ?? f.name ?? 'Connector').trim() || 'Connector';
  return { frame: { origin: point, normal: dir, xDir: normalize(crossV(dir, Math.abs(dir[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])) }, connPoint: { name, point, dir } };
}

/**
 * Magnetic mates to add: connection points of two components (world: [{ comp, name, point, dir }]) closer than
 * `distance` and facing each other (directions within `angle` of opposite) snap; each point takes one partner
 * (the nearest first), and pairs already joined (`joined`: Set of "compA:name|compB:name") are skipped.
 * Returns [{ a, b, gap }] (a, b: the world points' entries).
 */
export function magneticPairs(points, { distance = 25, angle = 0.5236, joined = new Set() } = {}) {
  const cands = [];
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    const a = points[i]; const b = points[j];
    if (a.comp === b.comp) continue;
    const gap = Math.hypot(...sub(a.point, b.point));
    if (gap > distance) continue;
    if (dot(a.dir, b.dir) > -Math.cos(angle)) continue;
    const k1 = `${a.comp}:${a.name}|${b.comp}:${b.name}`; const k2 = `${b.comp}:${b.name}|${a.comp}:${a.name}`;
    if (joined.has(k1) || joined.has(k2)) continue;
    cands.push({ a, b, gap });
  }
  cands.sort((x, y) => x.gap - y.gap);
  const used = new Set(); const out = [];
  for (const c of cands) {
    const ka = `${c.a.comp}:${c.a.name}`; const kb = `${c.b.comp}:${c.b.name}`;
    if (used.has(ka) || used.has(kb)) continue;
    used.add(ka); used.add(kb); out.push(c);
  }
  return out;
}

// ───────────────────────── move face

/**
 * Move Face (offset): planar faces pushed out (positive distance) or pulled in (negative) along their outward
 * normals — the face swept by the distance added to or taken from the body (the faces around it, square to it,
 * grow or shrink with it).
 */
function buildMoveFace(f, ctx) {
  // Offset, translate or rotate (planar faces), offset a cylinder's radius — move-face.js.
  return buildMoveFaceMore(f, ctx);
}

// ───────────────────────── advanced hole

export const HOLE_ELEMENTS = ['counterbore', 'countersink', 'straight', 'tapped', 'taper'];

/**
 * The radial profile of a hole stack, [r, z] from the near face (z 0) down to `length` (the far face):
 * near elements in order from z 0, far elements in order from the far face back. An element:
 * { kind, d (its diameter at the face side), depth, angle } — countersink: `angle` the included angle, its depth
 * where it meets the next element's diameter; taper: `angle` per side, `depth` long; a depth of 0 on the last near
 * element runs it to the far stack (through), else it is blind. Returns { pts: [[r, z]], through, depth }.
 */
export function holeStack(near, far, length) {
  const elems = (list) => (Array.isArray(list) ? list : []).filter((e) => HOLE_ELEMENTS.includes(e?.kind) && num(e.d) > 0);
  const N = elems(near); const Fa = elems(far);
  if (!N.length) throw codeError('hole-no-elements');
  const L = Number.isFinite(length) && length > 0 ? length : null;
  // meetR: where a countersink with no element after it ends (the far stack meets the through hole).
  const spans = (list, start, sign, meetR = 0) => {
    // Each element as [rTop, zTop, rBottom, zBottom] going away from its face.
    const out = []; let z = start;
    list.forEach((e, i) => {
      const r0 = num(e.d) / 2;
      let r1 = r0; let h = Math.max(0, num(e.depth));
      if (e.kind === 'countersink') {
        const next = list[i + 1];
        const rn = next ? num(next.d) / 2 : meetR;
        const half = (Math.min(179, Math.max(1, num(e.angle, 90))) * Math.PI) / 360;
        r1 = Math.min(r0, rn); h = (r0 - r1) / Math.tan(half);
      } else if (e.kind === 'taper') {
        const a = (Math.min(45, Math.max(0, num(e.angle, 1))) * Math.PI) / 180;
        r1 = Math.max(0.01, r0 - h * Math.tan(a));
      }
      out.push({ e, r0, r1, z0: z, h });
      z += sign * h;
    });
    return out;
  };
  const nearSpans = spans(N, 0, 1);
  const farSpans = L ? spans(Fa, L, -1, num(N.at(-1).d) / 2) : [];
  const farDepth = farSpans.reduce((s, x) => s + x.h, 0);
  const last = nearSpans.at(-1);
  // Through: the last near element runs on to where the far stack begins (or to the far face).
  const through = L != null && (num(last.e.depth) <= 0 || nearSpans.reduce((s, x) => s + x.h, 0) + farDepth >= L);
  if (through) {
    const end = L - farDepth;
    last.h = Math.max(0, end - last.z0);
    if (last.e.kind === 'taper') { const a = (Math.min(45, Math.max(0, num(last.e.angle, 1))) * Math.PI) / 180; last.r1 = Math.max(0.01, last.r0 - last.h * Math.tan(a)); }
  } else if (num(last.e.depth) <= 0) last.h = num(last.e.d) * 2;
  const pts = [];
  const eps = 0.01;
  pts.push([0, -eps], [nearSpans[0].r0, -eps]);
  for (const s of nearSpans) pts.push([s.r0, s.z0], [s.r1, s.z0 + s.h]);
  let depth = nearSpans.reduce((s, x) => s + x.h, 0);
  if (through && farSpans.length) {
    // Far elements listed from the far face: walk them back to front.
    for (const s of [...farSpans].reverse()) pts.push([s.r1, s.z0 - s.h], [s.r0, s.z0]);
    depth = L;
  }
  if (through) { pts.push([pts.at(-1)[0], L + eps], [0, L + eps]); depth = L; } else {
    // A blind hole ends in a drill point (118°).
    const rEnd = pts.at(-1)[0];
    pts.push([0, depth + rEnd / Math.tan((118 * Math.PI) / 360)]);
  }
  // Drop repeated points (an element of zero length).
  const clean = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-9);
  return { pts: clean, through, depth };
}

/** How far a line from `at` along `dir` runs in the body before it first leaves it (null: it never enters). */
function runLength(body, at, dir, max) {
  const R = rep();
  try {
    const line = R.makeLine(add(at, mul(dir, -1e-3)), add(at, mul(dir, max)));
    const inside = body.clone().intersect(line);
    let best = null;
    for (const e of inside.edges ?? []) {
      const a = dot(sub(vec(e.startPoint), at), dir); const b = dot(sub(vec(e.endPoint), at), dir);
      const lo = Math.min(a, b); const hi = Math.max(a, b);
      if (lo < 1e-3 && (best == null || hi > best)) best = hi;
    }
    return best;
  } catch { return null; }
}

function buildAdvancedHole(f, ctx) {
  const R = rep();
  if (!ctx.body) throw codeError('no-body');
  const { sketch, frame: fr } = sketchOf(f, ctx);
  const points = standalonePoints(sketch);
  if (!points.length) throw codeError('no-hole-points');
  const into = mul(fr.normal, f.reverse ? 1 : -1);
  const max = sizeAround(ctx) * 2;
  let tool = null; const holes = [];
  for (const p of points) {
    const at = toWorld(fr, [p.x, p.y]);
    const L = runLength(ctx.body, at, into, max);
    const stack = holeStack(f.near, f.far, L);
    const u = fr.xDir;
    const plane = new R.Plane(at, u, crossV(u, into));
    let pen = R.draw(stack.pts[0]);
    for (const q of stack.pts.slice(1)) pen = pen.lineTo(q);
    const one = pen.close().sketchOnPlane(plane).revolve(into, { origin: at });
    tool = tool ? tool.fuse(one) : one;
    holes.push({ at, dir: into, depth: stack.depth, through: stack.through, length: L });
  }
  return { tool, toolOp: 'cut', body: ctx.body.cut(tool), holes };
}

// ───────────────────────── intersect

/** The planes, surfaces and bodies an Intersect uses, and the closed regions they make: [{ solid, volume, centre }]. */
export function intersectRegions(f, ctx) {
  const R = rep(); const oc = R.getOC();
  const solids = f.bodies === false || !ctx.body ? [] : solidList(ctx.body);
  const surfaces = (f.surfaces ?? []).map((id) => ctx.surfaces.get(id)).filter(Boolean);
  const all = [...solids, ...surfaces];
  if (!all.length && !(f.planes ?? []).length) throw codeError('intersect-nothing');
  // The box everything lies in (bigger), split by every tool: cells not touching its outside are the regions.
  let lo = [Infinity, Infinity, Infinity]; let hi = [-Infinity, -Infinity, -Infinity];
  for (const s of all) { const [a, b] = s.boundingBox.bounds; lo = lo.map((v, i) => Math.min(v, a[i])); hi = hi.map((v, i) => Math.max(v, b[i])); }
  if (!Number.isFinite(lo[0])) { lo = [-50, -50, -50]; hi = [50, 50, 50]; }
  const pad = Math.max(1, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) * 0.1);
  const B0 = lo.map((v) => v - pad); const B1 = hi.map((v) => v + pad);
  const box = R.makeBox(B0, B1);
  const big = Math.hypot(B1[0] - B0[0], B1[1] - B0[1], B1[2] - B0[2]) * 2;
  const planeFaces = (f.planes ?? []).map((ref) => {
    // 'front' / 'top' / 'right' (or 'std:…') is a standard plane; anything else a reference plane's id.
    const name = typeof ref === 'string' ? ref.replace(/^(std|ref):/, '') : null;
    const p = name == null ? ref : ['front', 'top', 'right'].includes(name) ? { kind: 'std', name } : { kind: 'ref', id: name };
    const frm = resolvePlane(p, ctx);
    return R.drawRectangle(big, big).sketchOnPlane(replicadPlane(frm)).face();
  });
  const args = new oc.NCollection_List_TopoDS_Shape(); args.Append(box.wrapped);
  const tools = new oc.NCollection_List_TopoDS_Shape();
  for (const s of [...all, ...planeFaces]) tools.Append(s.wrapped);
  const sp = new oc.BRepAlgoAPI_Splitter();
  sp.SetArguments(args); sp.SetTools(tools); sp.Build(new oc.Message_ProgressRange());
  if (sp.HasErrors()) { sp.delete(); throw codeError('kernel'); }
  const cells = solidList(R.cast(sp.Shape()));
  sp.delete();
  const touches = (s) => { const [a, b] = s.boundingBox.bounds; return [0, 1, 2].some((i) => Math.abs(a[i] - B0[i]) < 1e-6 || Math.abs(b[i] - B1[i]) < 1e-6); };
  const regions = [];
  for (const c of cells) {
    if (touches(c)) continue;
    let volume = 0; let centre = [0, 0, 0];
    try { const vp = R.measureShapeVolumeProperties(c); volume = vp.volume; centre = vp.centerOfMass; vp.delete?.(); } catch { continue; }
    if (volume > 1e-9) regions.push({ solid: c, volume, centre });
  }
  // A stable order: by centre (x, then y, then z), so excluded indices keep meaning the same regions.
  const key = (r) => r.centre.map((v) => Math.round(v * 1000) / 1000);
  regions.sort((a, b) => { const p = key(a); const q = key(b); return p[0] - q[0] || p[1] - q[1] || p[2] - q[2]; });
  return { regions, solids };
}

function solidList(shape) {
  const R = rep(); const oc = R.getOC();
  const out = [];
  const ex = new oc.TopExp_Explorer(shape.wrapped, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  for (; ex.More(); ex.Next()) out.push(R.cast(oc.TopoDS.Solid(ex.Current())));
  ex.delete();
  return out;
}

function buildIntersect(f, ctx) {
  const R = rep();
  const { regions, solids } = intersectRegions(f, ctx);
  const exclude = new Set((f.exclude ?? []).map(Number));
  const info = () => regions.map((r, i) => ({ index: i, volume: r.volume, centre: r.centre, excluded: exclude.has(i) }));
  // No region, or every one left out: the part stays as it is (the PropertyManager says why and keeps the list).
  if (!regions.length) return { intersect: { regions: [], none: true } };
  const kept = regions.filter((_, i) => !exclude.has(i));
  if (!kept.length) return { intersect: { regions: info(), allExcluded: true } };
  let made;
  if (f.merge !== false) { made = kept[0].solid; for (const r of kept.slice(1)) made = made.fuse(r.solid); made = solidList(made); } else made = kept.map((r) => r.solid);
  // The bodies used are replaced by the regions (Consume), or kept as they are.
  const others = f.consume === false ? solids : [];
  const list = [...others, ...made];
  return { body: list.length === 1 ? list[0] : R.makeCompound(list), intersect: { regions: info() } };
}

// ───────────────────────── mate reference

export const MATE_REF_TYPES = ['default', 'coincident', 'concentric', 'parallel', 'tangent'];
export const MATE_REF_ALIGN = ['any', 'aligned', 'anti'];

/** Mate reference: the faces (primary, secondary, tertiary) found again, as mate entities with their mate types. */
function buildMateReference(f, ctx) {
  if (!ctx.body) throw codeError('no-body');
  const refs = [];
  for (const k of ['primary', 'secondary', 'tertiary']) {
    if (!f[k]) continue;
    const face = findFace(ctx.body, f[k]);
    if (!face) throw codeError('face-missing');
    const ent = mateEntityOfFace(face, faceSignature);
    const type = MATE_REF_TYPES.includes(f[`${k}Type`]) ? f[`${k}Type`] : 'default';
    refs.push({ ...ent, role: k, type: type === 'default' ? (ent.kind === 'axis' ? 'concentric' : 'coincident') : type, align: MATE_REF_ALIGN.includes(f[`${k}Align`]) ? f[`${k}Align`] : 'any' });
  }
  if (!refs.length) throw codeError('no-faces');
  const name = String(f.refName ?? f.name ?? 'Default').trim() || 'Default';
  const p = refs[0];
  return { frame: { origin: p.point, normal: normalize(p.dir), xDir: normalize(crossV(p.dir, Math.abs(p.dir[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])) }, mateRef: { name, refs } };
}

/**
 * The mates that join a newly placed component to another one through mate references of the same name:
 * `mine` / `theirs` = [{ name, refs }] of the two parts, `newComp` / `otherComp` their component ids. Returns
 * [{ type, aligned, a, b }] (a on the new component) — the first name both have.
 */
export function mateRefMates(mine, theirs, newComp, otherComp) {
  for (const m of mine) {
    const t = theirs.find((x) => x.name === m.name);
    if (!t) continue;
    const out = [];
    m.refs.forEach((r, i) => {
      const s = t.refs[i];
      if (!s || s.kind !== r.kind) return;
      const type = r.type === s.type ? r.type : r.kind === 'axis' ? 'concentric' : 'coincident';
      const align = r.align !== 'any' ? r.align : s.align !== 'any' ? s.align : (type === 'coincident' ? 'anti' : 'aligned');
      const strip = ({ role, type: _t, align: _a, ...e }) => e;
      out.push({ type, aligned: align, a: { comp: newComp, ...strip(r) }, b: { comp: otherComp, ...strip(s) } });
    });
    if (out.length) return out;
  }
  return [];
}
