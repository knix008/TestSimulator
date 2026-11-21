// More surface, sheet metal and weldment features:
//   surfaces  — ruled surface, delete face (delete / patch / fill), replace face, extend surface;
//   sheet     — miter flange, lofted bend (with a developed flat pattern), tab, closed corner, corner relief,
//               forming tools (dimple, emboss, louver, lance) placed on a sheet face;
//   weldments — end cap, gusset, weld bead (solid or cosmetic), trim / extend of structural members.
// Registered in advanced.js (types, defaults, names, build) and built by regenerate() like the others: each
// returns { body?, tool?, surface?, curve?, … } and the extra data the cut list or the flat pattern needs.
import { rep } from './kernel.js';
import { profiles, byId } from './sketch.js';
import { findEdges, findFace, crossV, normalize } from './refs.js';
import { sketchOf, sizeAround, replicadPlane, codeError, loopDrawing, resolvePlane, toWorld } from './features.js';
import { sketchWire, bendAllowance, structuralProfile, circleOfEdge } from './advanced.js';

export { SHEET_MORE_TYPES, FORM_TOOLS, SHEET_MORE_ICONS, SHEET_MORE_DEFAULTS, SHEET_MORE_NAMES } from './sheet-more-types.js';
import { FORM_TOOLS } from './sheet-more-types.js';
import { worldUp, worldFront } from './frame.js';
import { makeHelixStable, makeCylinderStable, makeCircleStable } from './oriented.js';

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vec = (v) => (Array.isArray(v) ? v : [v.x, v.y, v.z]);
const num = (v, d = 0) => (v === null || v === '' || v === undefined || !Number.isFinite(Number(v)) ? d : Number(v));
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
const AXIS_DIRS = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1], '-x': [-1, 0, 0], '-y': [0, -1, 0], '-z': [0, 0, -1] };

export function buildSheetMore(f, ctx) {
  switch (f.type) {
    case 'ruledSurface': return buildRuled(f, ctx);
    case 'deleteFace': return buildDeleteFace(f, ctx);
    case 'replaceFace': return buildReplaceFace(f, ctx);
    case 'extendSurface': return buildExtendSurface(f, ctx);
    case 'miterFlange': return buildMiterFlange(f, ctx);
    case 'loftedBend': return buildLoftedBend(f, ctx);
    case 'tab': return buildTab(f, ctx);
    case 'closedCorner': return buildClosedCorner(f, ctx);
    case 'cornerRelief': return buildCornerRelief(f, ctx);
    case 'formTool': return buildFormTool(f, ctx);
    case 'endCap': return buildEndCap(f, ctx);
    case 'gusset': return buildGusset(f, ctx);
    case 'weldBead': return buildWeldBead(f, ctx);
    case 'trimExtend': return buildTrimExtend(f, ctx);
    default: throw codeError('unknown-feature', { type: f.type });
  }
}

// ───────────────────────── shared helpers

function prismOf(shape, v) {
  const R = rep(); const oc = R.getOC();
  const vv = new R.Vector(v);
  const mk = new oc.BRepPrimAPI_MakePrism(shape.wrapped, vv.wrapped, false, true);
  const out = R.cast(mk.Shape());
  mk.delete();
  return out;
}

/** A big box on the side of the plane (origin, normal) the normal points to. */
function halfSpace(ctx, origin, normal, extra = 0) {
  const R = rep();
  const big = sizeAround(ctx, extra) * 4;
  const n = normalize(normal);
  const x = normalize(crossV(n, Math.abs(dot(n, worldUp())) < 0.9 ? worldUp() : [1, 0, 0]));
  return R.drawRectangle(big, big).sketchOnPlane(new R.Plane(origin, x, n)).extrude(big);
}

const facesOfEdge = (body, edge) => body.faces.filter((fc) => fc.edges.some((e) => e.isSame(edge)));

/** A point well inside a face (its centre for planes, the middle of its parameters otherwise). */
function insidePoint(face) {
  try { return vec(face.geomType === 'PLANE' ? face.center : face.pointOnSurface(0.5, 0.5)); } catch { return vec(face.center); }
}

const normalOf = (face, p) => normalize(vec(face.normalAt(p ?? insidePoint(face))));

/** The in-face direction at point p of an edge (tangent T) pointing from the edge into the face. */
function intoFace(face, p, T) {
  const R = rep();
  const a = normalize(crossV(T, normalOf(face, p)));
  // The side where a step from the edge stays on the face (a planar face's centre can be in a hole).
  const step = 1e-2;
  try {
    const da = R.measureDistanceBetween(face, R.makeVertex(add(p, mul(a, step))));
    const db = R.measureDistanceBetween(face, R.makeVertex(add(p, mul(a, -step))));
    if (Math.abs(da - db) > step * 1e-3) return da < db ? a : mul(a, -1);
  } catch { /* fall back to the centre */ }
  return dot(a, sub(insidePoint(face), p)) < 0 ? mul(a, -1) : a;
}

/** A closed surface's seam (the edge where a cylinder's face meets itself). */
function isSeam(edge, face) {
  const oc = rep().getOC();
  try { return Boolean(oc.BRep_Tool.IsClosed(edge.wrapped, face.wrapped)); } catch { return false; }
}

function sewToShape(faces, tol = 1e-3) {
  const R = rep(); const oc = R.getOC();
  const sew = new oc.BRepBuilderAPI_Sewing(tol, true, true, true, false);
  for (const s of faces) sew.Add(s.wrapped);
  sew.Perform(new oc.Message_ProgressRange());
  const shape = R.cast(sew.SewedShape());
  sew.delete();
  return shape;
}

/** A closed sewn shell as a solid, right side out; null when it does not close. */
function solidOfShell(shape) {
  const R = rep(); const oc = R.getOC();
  if (shape.wrapped.ShapeType() !== oc.TopAbs_ShapeEnum.TopAbs_SHELL) return null;
  try {
    let solid = R.makeSolid([shape]);
    if (R.measureVolume(solid) < 0) solid = R.cast(solid.wrapped.Reversed());
    return solid;
  } catch { return null; }
}

/** A planar face's outline offset within its plane by d (Intersection: sharp corners; Arc: rounded). */
function offsetPlanar(faceOrWire, d, sharp = true) {
  const R = rep(); const oc = R.getOC();
  const join = sharp ? oc.GeomAbs_JoinType.GeomAbs_Intersection : oc.GeomAbs_JoinType.GeomAbs_Arc;
  const mk = new oc.BRepOffsetAPI_MakeOffset(faceOrWire.wrapped, join, false);
  mk.Perform(d, 0);
  if (!mk.IsDone()) { mk.delete(); throw codeError('kernel'); }
  const out = R.cast(mk.Shape());
  mk.delete();
  return out;
}

/** Points along an edge, `n` + 1 of them, with the tangent at each. */
function samples(edge, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    out.push({ p: vec(edge.pointAt(u)), T: normalize(vec(edge.tangentAt(u))) });
  }
  return out;
}

/** A ruled strip from an edge to the edge moved by dirAt(point, tangent) × d at each point. */
function ruledStrip(edge, dirAt, d) {
  const R = rep();
  if (edge.geomType === 'LINE') {
    const s = samples(edge, 1);
    const a = dirAt(s[0].p, s[0].T); const b = dirAt(s[1].p, s[1].T);
    if (len3(sub(a, b)) < 1e-9) return prismOf(edge.clone(), mul(a, d));
    return R.makeFace(R.assembleWire([R.makeLine(s[0].p, s[1].p), R.makeLine(s[1].p, add(s[1].p, mul(b, d))), R.makeLine(add(s[1].p, mul(b, d)), add(s[0].p, mul(a, d))), R.makeLine(add(s[0].p, mul(a, d)), s[0].p)]));
  }
  const s = samples(edge, 24);
  const dirs = s.map((x) => dirAt(x.p, x.T));
  if (dirs.every((x) => len3(sub(x, dirs[0])) < 1e-6)) return prismOf(edge.clone(), mul(dirs[0], d));
  const moved = s.map((x, i) => add(x.p, mul(dirs[i], d)));
  const closed = len3(sub(s[0].p, s.at(-1).p)) < 1e-6;
  const curve = R.makeBSplineApproximation(closed ? [...moved.slice(0, -1), moved[0]] : moved, { tolerance: 1e-4, smoothing: null, degMax: 3 });
  return R.loft([R.assembleWire([edge.clone()]), R.assembleWire([curve])], { ruled: true }, true);
}

// ───────────────────────── surfaces

/**
 * Ruled surface from body edges: tangent to the face next to each edge (outward in it), normal to that
 * face, or along a direction. `alternate` uses the other face at the edge; `reverse` flips the direction.
 */
function buildRuled(f, ctx) {
  const R = rep();
  if (!ctx.body) throw codeError('no-body');
  const edges = findEdges(ctx.body, f.edges ?? []);
  if (!edges.length) throw codeError('no-edges');
  const d = Math.max(0.01, num(f.distance, 10));
  const sgn = f.reverse ? -1 : 1;
  const strips = edges.map((edge) => {
    const faces = facesOfEdge(ctx.body, edge);
    const face = faces[f.alternate && faces.length > 1 ? 1 : 0];
    let dirAt;
    if (f.mode === 'vector' || !face) { const a = mul(AXIS_DIRS[f.axis] ?? worldUp(), sgn); dirAt = () => a; }
    else if (f.mode === 'normal') dirAt = (p) => mul(normalOf(face, p), sgn);
    else dirAt = (p, T) => mul(intoFace(face, p, T), -sgn);
    return ruledStrip(edge, dirAt, d);
  });
  return { surface: strips.length === 1 ? strips[0] : R.makeCompound(strips), ruled: { edges: strips.length } };
}

/** The edges bounding a set of faces (used by exactly one of them), grouped into closed wires. */
function boundaryLoops(faces) {
  const R = rep();
  const all = [];
  for (const fc of faces) for (const e of fc.edges) {
    if (isSeam(e, fc)) continue;
    const seen = all.find((x) => x.e.isSame(e));
    if (seen) seen.n++; else all.push({ e, n: 1 });
  }
  const free = all.filter((x) => x.n === 1).map((x) => x.e);
  const loops = [];
  const left = [...free];
  const near = (a, b) => len3(sub(a, b)) < 1e-5;
  while (left.length) {
    const chain = [left.shift()];
    let grew = true;
    while (grew) {
      grew = false;
      const ends = chain.flatMap((e) => [vec(e.startPoint), vec(e.endPoint)]);
      const i = left.findIndex((e) => ends.some((p) => near(p, vec(e.startPoint)) || near(p, vec(e.endPoint))));
      if (i >= 0) { chain.push(left.splice(i, 1)[0]); grew = true; }
    }
    loops.push(R.assembleWire(chain.map((e) => e.clone())));
  }
  return loops;
}

/** A patch over a closed loop: planar when it is flat, else a filling (tangent to `around` in patch mode). */
function patchOf(wire, around, tangent) {
  const R = rep(); const oc = R.getOC();
  try { const face = R.makeFace(wire.clone()); if (face.geomType === 'PLANE') return face; } catch { /* not planar */ }
  const mk = new oc.BRepOffsetAPI_MakeFilling(3, 15, 2, false, 1e-5, 1e-4, 0.01, 0.1, 8, 9);
  for (const e of wire.edges) {
    const nb = tangent ? around.find((fc) => fc.edges.some((x) => x.isSame(e))) : null;
    if (nb) mk.Add(e.wrapped, nb.wrapped, oc.GeomAbs_Shape.GeomAbs_G1, true);
    else mk.Add(e.wrapped, oc.GeomAbs_Shape.GeomAbs_C0, true);
  }
  mk.Build(new oc.Message_ProgressRange());
  if (!mk.IsDone()) { mk.delete(); throw codeError('kernel'); }
  const face = R.cast(mk.Shape());
  mk.delete();
  return face;
}

/**
 * Delete face: `delete` leaves the rest as a surface body; `patch` closes each opening with a patch tangent to
 * the faces around it (flat openings get a planar face), `fill` with a plain filling; both give a solid back.
 */
function buildDeleteFace(f, ctx) {
  if (!ctx.body) throw codeError('no-body');
  const gone = (f.faces ?? []).map((sig) => findFace(ctx.body, sig)).filter(Boolean);
  if (!gone.length) throw codeError('no-faces');
  const keep = ctx.body.faces.filter((fc) => !gone.some((g) => g.isSame(fc)));
  if (!keep.length) throw codeError('no-faces');
  if (f.mode === 'delete') return { body: null, surface: sewToShape(keep.map((x) => x.clone())), deleted: gone.length };
  const patches = boundaryLoops(gone).map((w) => patchOf(w, keep, f.mode !== 'fill'));
  const solid = solidOfShell(sewToShape([...keep.map((x) => x.clone()), ...patches]));
  if (!solid) throw codeError('delete-open');
  return { body: solid, deleted: gone.length, patches: patches.length };
}

/**
 * Replace face: the body grows or shrinks so that the picked faces end on the replacement surface (which must
 * cover them when seen along their normals).
 */
function buildReplaceFace(f, ctx) {
  const R = rep();
  if (!ctx.body) throw codeError('no-body');
  const surface = ctx.surfaces.get(f.surface);
  if (!surface) throw codeError('no-surfaces');
  const targets = (f.faces ?? []).map((sig) => findFace(ctx.body, sig)).filter(Boolean);
  if (!targets.length) throw codeError('no-faces');
  const big = sizeAround(ctx) * 2;
  let body = ctx.body;
  const [lo0, hi0] = body.boundingBox.bounds;
  for (const face of targets) {
    const n = normalOf(face);
    const grow = prismOf(face.clone(), mul(n, big));
    // The cut reaches past the top of the grown part wherever the surface is (above or below the face).
    const column = prismOf(face.clone().translate(mul(n, -2 * big)), mul(n, 6 * big));
    let above = null;
    for (const sf of surface.faces) { const p = prismOf(sf.clone(), mul(n, 4 * big)); above = above ? above.fuse(p) : p; }
    body = body.fuse(grow).cut(above.intersect(column));
  }
  const [lo, hi] = body.boundingBox.bounds;
  if (hi.some((v, i) => v - hi0[i] > big / 2) || lo.some((v, i) => lo0[i] - v > big / 2)) throw codeError('replace-short');
  return { body };
}

/** Average speed of a face's parametrisation along u (or v) at the middle of the other parameter. */
function paramSpeed(face, alongU) {
  let L = 0; let prev = null;
  for (let i = 0; i <= 16; i++) {
    const p = vec(alongU ? face.pointOnSurface(i / 16, 0.5) : face.pointOnSurface(0.5, i / 16));
    if (prev) L += len3(sub(p, prev));
    prev = p;
  }
  return L;
}

/**
 * Extend surface: every boundary of each face moved out by `distance`. Planes: their outline offset in the
 * plane; analytic surfaces (cylinder, cone, extrusion, revolution): the same surface over a larger range
 * ("same"); else, or with "linear", ruled strips tangent to the face along its boundary edges.
 */
function buildExtendSurface(f, ctx) {
  const R = rep(); const oc = R.getOC();
  const surface = ctx.surfaces.get(f.surface);
  if (!surface) throw codeError('no-surfaces');
  const d = Math.max(0.01, num(f.distance, 5));
  const out = [];
  for (const face of surface.faces) {
    if (face.geomType === 'PLANE') {
      const wire = offsetPlanar(face, d, true);
      out.push(R.makeFace(wire));
      continue;
    }
    let done = false;
    if (f.kind !== 'linear' && !['BSPLINE_SURFACE', 'BEZIER_SURFACE', 'OFFSET_SURFACE', 'OTHER_SURFACE'].includes(face.geomType)) {
      try {
        const s = oc.BRep_Tool.Surface(face.wrapped);
        const b = oc.BRepTools.UVBounds(face.wrapped);
        const du = (d * (b.UMax - b.UMin)) / Math.max(1e-9, paramSpeed(face, true));
        const dv = (d * (b.VMax - b.VMin)) / Math.max(1e-9, paramSpeed(face, false));
        let u0 = b.UMin - du; let u1 = b.UMax + du;
        const period = 2 * Math.PI;
        if (['CYLINDRE', 'CONE', 'REVOLUTION', 'SPHERE', 'TORUS'].includes(face.geomType) && u1 - u0 >= period - 1e-6) { u0 = b.UMin; u1 = b.UMin + period; }
        const mk = new oc.BRepBuilderAPI_MakeFace(s, u0, u1, b.VMin - dv, b.VMax + dv, 1e-6);
        out.push(R.cast(mk.Face()));
        mk.delete();
        done = true;
      } catch { done = false; }
    }
    if (!done) {
      // Linear: a strip tangent to the face, going outward from each boundary edge.
      const strips = face.edges.filter((edge) => !isSeam(edge, face)).map((edge) => ruledStrip(edge, (p, T) => mul(intoFace(face, p, T), -1), d));
      out.push(sewToShape([face.clone(), ...strips]));
    }
  }
  return { surface: out.length === 1 ? out[0] : R.makeCompound(out) };
}

// ───────────────────────── sheet metal

function needSheet(ctx) {
  if (!ctx.body || !ctx.sheet) throw codeError('no-sheet');
  return ctx.sheet;
}

function insideBody(body, p, r) {
  const R = rep();
  try { return R.measureVolume(body.clone().intersect(R.makeBox(sub(p, [r, r, r]), add(p, [r, r, r])))) > 8 * r ** 3 * 0.5; } catch { return false; }
}

/** An edge flange's geometry (as the edge flange builds it): the outward direction and the bend side. */
function flangeFrame(ctx, s, e, flip) {
  const sm = ctx.sheet; const t = sm.thickness;
  const d = normalize(sub(e, s)); const len = len3(sub(e, s));
  const nb = sm.normal;
  if (Math.abs(dot(d, nb)) > 1e-3) throw codeError('edge-not-on-sheet');
  let o = normalize(crossV(d, nb));
  const mid = mul(add(s, e), 0.5);
  const into = dot(sub(mid, sm.origin), nb) > t / 2 ? -1 : 1;
  const probe = Math.min(t, len) * 0.2;
  if (insideBody(ctx.body, add(add(mid, mul(o, probe * 2)), mul(nb, into * t / 2)), probe)) o = mul(o, -1);
  let b = mul(nb, -into);
  if (flip) b = mul(b, -1);
  return { d, len, o, b, into };
}

/**
 * The solid of a flange along s→e (outward o, bending toward b), lengthened by `ext0` before s and `ext1`
 * after e. Formed: bend of `angle` with inner radius r, then a flat of L; flat pattern: one strip.
 */
function flangeSolid(ctx, s, e, { o, b, d, len }, { angle, radius, length, flip }, ext0 = 0, ext1 = 0) {
  const R = rep();
  const sm = ctx.sheet; const t = sm.thickness;
  const r = radius; const theta = angle; const L = length;
  const start = sub(s, mul(d, ext0));
  const base = flip ? add(start, mul(b, -t)) : start;
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
    pen = pen.lineTo(b1);
    pen = r > 1e-6 || t > 0 ? pen.threePointsArcTo([0, -t], outer(th / 2)) : pen.lineTo([0, -t]);
    draw = pen.close();
  }
  const plane = new R.Plane(base, o, crossV(o, b));
  const sign = dot(d, crossV(o, b)) >= 0 ? 1 : -1;
  return draw.sketchOnPlane(plane).extrude(sign * (len + ext0 + ext1));
}

/** Pairs of flanges meeting at a corner (one end in common): { i, j, V, di, dj }, di / dj along each from V. */
function corners(list) {
  const out = [];
  const near = (a, b) => len3(sub(a, b)) < 1e-4;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const A = list[i]; const B = list[j];
    for (const [va, wa] of [[A.s, A.e], [A.e, A.s]]) for (const [vb, wb] of [[B.s, B.e], [B.e, B.s]]) {
      if (near(va, vb)) out.push({ i, j, V: va, di: normalize(sub(wa, va)), dj: normalize(sub(wb, vb)), atStartI: va === A.s, atStartJ: vb === B.s });
    }
  }
  return out;
}

/** The two flanges of a corner lengthened past it and cut on the bisecting (miter) plane, `gap` apart. */
function miteredPair(ctx, c, A, B, gap) {
  const ext = (fl) => fl.radius + ctx.sheet.thickness + fl.length + 1;
  const piece = (fl, atStart, mine, other) => {
    const solid = flangeSolid(ctx, fl.s, fl.e, fl.geo, fl, atStart ? ext(fl) : 0, atStart ? 0 : ext(fl));
    const m = normalize(sub(mine, other));
    return solid.intersect(halfSpace(ctx, add(c.V, mul(m, gap / 2)), m));
  };
  return [piece(A, c.atStartI, c.di, c.dj), piece(B, c.atStartJ, c.dj, c.di)];
}

/**
 * Miter flange: edge flanges along a chain of straight sheet edges, joined at the corners by miter cuts
 * (a `gap` between them). The flat pattern lays each one out as a strip of bend allowance + length.
 */
function buildMiterFlange(f, ctx) {
  const sm = needSheet(ctx);
  const edges = findEdges(ctx.body, f.edges ?? []);
  if (!edges.length) throw codeError('edge-missing');
  if (edges.some((e) => e.geomType !== 'LINE')) throw codeError('edge-missing');
  const radius = f.radius == null || f.radius === '' ? sm.radius : Math.max(0, num(f.radius));
  const angle = Math.max(1, Math.min(180, num(f.angle, 90)));
  const length = Math.max(0, num(f.length, 20));
  const gap = Math.max(0, num(f.gap, 0));
  const list = edges.map((edge) => {
    const s = vec(edge.startPoint); const e = vec(edge.endPoint);
    return { s, e, geo: flangeFrame(ctx, s, e, f.flip), angle, radius, length, flip: f.flip };
  });
  const cs = corners(list);
  const ext = (fl) => radius + sm.thickness + length + 1;
  let body = ctx.body;
  const tools = [];
  for (const [k, fl] of list.entries()) {
    const at = cs.filter((c) => c.i === k || c.j === k);
    const e0 = at.some((c) => (c.i === k ? c.atStartI : c.atStartJ)) ? ext(fl) : 0;
    const e1 = at.some((c) => !(c.i === k ? c.atStartI : c.atStartJ)) ? ext(fl) : 0;
    let solid = flangeSolid(ctx, fl.s, fl.e, fl.geo, fl, e0, e1);
    for (const c of at) {
      const mine = c.i === k ? c.di : c.dj; const other = c.i === k ? c.dj : c.di;
      const m = normalize(sub(mine, other));
      solid = solid.intersect(halfSpace(ctx, add(c.V, mul(m, gap / 2)), m));
    }
    tools.push(solid);
    sm.bends.push({ start: fl.s, end: fl.e, angle, radius, outward: fl.geo.o, flat: ctx.flat, allowance: bendAllowance(angle, radius, sm.thickness, sm.k), length, flip: f.flip, miter: f.id });
  }
  for (const s of tools) body = body.fuse(s);
  return { body, miter: { flanges: tools.length, corners: cs.length } };
}

/** The bends of earlier edge / miter flanges, rebuilt as { s, e, geo, angle, radius, length, flip }. */
function flangesOf(f, ctx) {
  const sm = needSheet(ctx);
  const ids = [...(f.flanges ?? []), f.flangeA, f.flangeB].filter(Boolean);
  const out = [];
  for (const x of ctx.part.features) {
    if (x.type !== 'edgeFlange' || x.suppressed) continue;
    if (ids.length && !ids.includes(x.id)) continue;
    const b = ctx.results.get(x.id)?.bend;
    if (!b || !ctx.results.get(x.id)?.ok) continue;
    const s = x.edge?.start ?? b.start; const e = x.edge?.end ?? b.end;
    const geo = flangeGeometry(ctx, s, e, b.outward, x.flip);
    out.push({ id: x.id, s, e, geo, angle: b.angle, radius: b.radius, length: Math.max(0, num(x.length, 20)), flip: Boolean(x.flip) });
  }
  return out;
}

/** The frame of a flange already built (outward known): the bend side from where the edge is on the sheet. */
function flangeGeometry(ctx, s, e, o, flip) {
  const sm = ctx.sheet; const t = sm.thickness;
  const d = normalize(sub(e, s)); const len = len3(sub(e, s));
  const mid = mul(add(s, e), 0.5);
  const into = dot(sub(mid, sm.origin), sm.normal) > t / 2 ? -1 : 1;
  let b = mul(sm.normal, -into);
  if (flip) b = mul(b, -1);
  return { d, len, o, b, into };
}

/** Closed corner: two edge flanges meeting at a corner are lengthened to close it, mitered between them. */
function buildClosedCorner(f, ctx) {
  needSheet(ctx);
  if (ctx.flat) return { corner: { closed: 0 } };
  const list = flangesOf(f, ctx);
  const cs = corners(list);
  if (!cs.length) throw codeError('no-corner');
  let body = ctx.body;
  for (const c of cs) for (const piece of miteredPair(ctx, c, list[c.i], list[c.j], Math.max(0, num(f.gap, 0)))) body = body.fuse(piece);
  return { body, corner: { closed: cs.length } };
}

/**
 * Corner relief: where two flanges meet, a rectangular or round cut through the bend zone (the sheet
 * corner, both bends and the gap between) — the notch a flat blank needs so the bends don't tear.
 */
function buildCornerRelief(f, ctx) {
  const R = rep();
  const sm = needSheet(ctx);
  const list = flangesOf(f, ctx);
  const cs = corners(list);
  if (!cs.length) throw codeError('no-corner');
  const t = sm.thickness;
  let body = ctx.body;
  for (const c of cs) {
    const A = list[c.i]; const B = list[c.j];
    const zone = Math.max(A.radius, B.radius) + t;
    const w = num(f.size, 0) > 0 ? num(f.size) : zone;
    const lo = mul(sm.normal, -(zone + t)); const span = 2 * zone + 3 * t;
    // Along di runs flange i; across it (−dj) is flange j's outward side.
    let tool;
    if (f.kind === 'round') {
      tool = makeCylinderStable(w, span, add(c.V, lo), sm.normal);
    } else {
      const pts = [add(c.V, add(mul(c.di, w), mul(c.dj, w))), add(c.V, add(mul(c.di, w), mul(c.dj, -zone))), add(c.V, add(mul(c.di, -zone), mul(c.dj, -zone))), add(c.V, add(mul(c.di, -zone), mul(c.dj, w)))].map((p) => add(p, lo));
      tool = R.basicFaceExtrusion(R.makePolygon(pts), new R.Vector(mul(sm.normal, span)));
    }
    body = body.cut(tool);
  }
  return { body, relief: { corners: cs.length, kind: f.kind === 'round' ? 'round' : 'rect' } };
}

/** Developed (unrolled) outline of a ruled strip between two point chains: triangles laid out one by one. */
export function developStrip(P, Q) {
  const n = P.length;
  const d = (a, b) => len3(sub(a, b));
  const place = (A, B, rA, rB, away) => {
    // The point at rA from A and rB from B, on the other side of AB than `away`.
    const ab = [B[0] - A[0], B[1] - A[1]]; const L = Math.hypot(ab[0], ab[1]);
    const x = (rA * rA - rB * rB + L * L) / (2 * L);
    const h = Math.sqrt(Math.max(0, rA * rA - x * x));
    const ux = [ab[0] / L, ab[1] / L]; const uy = [-ux[1], ux[0]];
    const c1 = [A[0] + ux[0] * x + uy[0] * h, A[1] + ux[1] * x + uy[1] * h];
    const c2 = [A[0] + ux[0] * x - uy[0] * h, A[1] + ux[1] * x - uy[1] * h];
    if (!away) return c1;
    const side = (p) => Math.sign((B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0]));
    return side(c1) !== side(away) ? c1 : c2;
  };
  const p2 = [[0, 0]]; const q2 = [[0, d(P[0], Q[0])]];
  let prev = null;
  for (let i = 0; i < n - 1; i++) {
    const np = place(p2[i], q2[i], d(P[i], P[i + 1]), d(Q[i], P[i + 1]), prev);
    p2.push(np);
    const nq = place(q2[i], np, d(Q[i], Q[i + 1]), d(P[i + 1], Q[i + 1]), p2[i]);
    q2.push(nq);
    prev = q2[i];
  }
  return { p: p2, q: q2 };
}

function chainPoints(wire, n) {
  // Fine samples along each edge by its length, then resampled evenly by arc length.
  const fine = [];
  for (const e of wire.edges) {
    const k = Math.max(4, Math.ceil(n * 4 * (e.length / Math.max(1e-9, wire.edges.reduce((s, x) => s + x.length, 0)))));
    for (let i = fine.length ? 1 : 0; i <= k; i++) fine.push(vec(e.pointAt(i / k)));
  }
  const acc = [0];
  for (let i = 1; i < fine.length; i++) acc.push(acc[i - 1] + len3(sub(fine[i], fine[i - 1])));
  const total = acc.at(-1);
  const out = [];
  let j = 0;
  for (let i = 0; i <= n; i++) {
    const s = (total * i) / n;
    while (j < acc.length - 2 && acc[j + 1] < s) j++;
    const u = (s - acc[j]) / Math.max(1e-12, acc[j + 1] - acc[j]);
    out.push(add(fine[j], mul(sub(fine[j + 1], fine[j]), Math.min(1, Math.max(0, u)))));
  }
  return out;
}

/**
 * Lofted bend: a sheet of thickness t lofted (ruled) between two profiles, e.g. a square-to-round
 * transition. Flat pattern: the ruled surface developed triangle by triangle, as one flat blank.
 */
function buildLoftedBend(f, ctx) {
  const R = rep();
  const ids = f.sketches ?? [];
  if (ids.length < 2) throw codeError('loft-needs-two');
  const prof = ids.slice(0, 2).map((id) => { const { sketch, frame } = sketchOf({ sketch: id }, ctx, id); return { wire: sketchWire(sketch, frame), frame }; });
  const t = Math.max(0.05, num(f.thickness, 2));
  if (!ctx.sheet) ctx.sheet = { thickness: t, radius: Math.max(0, num(f.radius, t)), k: Math.min(1, Math.max(0, num(f.kFactor, 0.44))), normal: prof[0].frame.normal, origin: prof[0].frame.origin, bends: [] };
  const n = Math.max(8, Math.min(256, Math.round(num(f.segments, 64))));
  const P = chainPoints(prof[0].wire, n); const Q = chainPoints(prof[1].wire, n);
  const shell = R.loft([prof[0].wire.clone(), prof[1].wire.clone()], { ruled: true }, true);
  const area = R.measureArea(shell);
  if (ctx.flat) {
    const { p, q } = developStrip(P, Q);
    const fr = prof[0].frame;
    const outline = [...p, ...q.slice().reverse()].map(([u, v]) => toWorld(fr, [u, v]));
    const face = R.makePolygon(outline);
    const tool = R.basicFaceExtrusion(face, new R.Vector(mul(fr.normal, t)));
    return { tool, body: ctx.body ? ctx.body.fuse(tool) : tool, lofted: { area, flatArea: R.measureArea(face) } };
  }
  let tool;
  {
    const oc = R.getOC();
    const mk = new oc.BRepOffsetAPI_MakeThickSolid();
    mk.MakeThickSolidBySimple(shell.wrapped, t);
    mk.Build(new oc.Message_ProgressRange());
    if (!mk.IsDone()) { mk.delete(); throw codeError('kernel'); }
    tool = R.cast(mk.Shape());
    mk.delete();
    try { if (R.measureVolume(tool) < 0) tool = R.cast(tool.wrapped.Reversed()); } catch { /* keep */ }
  }
  return { tool, body: ctx.body ? ctx.body.fuse(tool) : tool, lofted: { area } };
}

/** Tab: a closed sketch on the sheet's face plane, as thick as the sheet and joined to it. */
function buildTab(f, ctx) {
  const R = rep();
  const sm = needSheet(ctx);
  const { sketch, frame } = sketchOf(f, ctx);
  if (Math.abs(Math.abs(dot(frame.normal, sm.normal)) - 1) > 1e-6) throw codeError('tab-plane');
  const h = dot(sub(frame.origin, sm.origin), sm.normal);
  const t = sm.thickness;
  let d = null;
  for (const r of profiles(sketch)) { let x = loopDrawing(r.outer); for (const hole of r.holes) x = x.cut(loopDrawing(hole)); d = d ? d.fuse(x) : x; }
  if (!d) throw codeError('no-profile');
  // From the sketch plane into the sheet's thickness (a sketch on the top face goes down, on the bottom up).
  const toward = h > t / 2 ? -t : t;
  const sign = dot(frame.normal, sm.normal) > 0 ? 1 : -1;
  if (Math.abs(h) > 1e-4 && Math.abs(h - t) > 1e-4) throw codeError('tab-plane');
  const tool = d.sketchOnPlane(replicadPlane(frame)).extrude(toward * sign);
  if (R.measureDistanceBetween(ctx.body, tool) > 1e-4) throw codeError('tab-not-touching');
  return { tool, body: ctx.body.fuse(tool) };
}

/** A forming tool's cross-section, revolved (dimple, emboss) or extruded (louver, lance), and its opening. */
function formShapes(f, t, plane) {
  const R = rep();
  const S = Math.max(1, num(f.size, 20)); const H = Math.max(t * 1.05, num(f.height, 4)); const W = Math.max(t * 2, num(f.width, 8));
  const { origin, x, y, z } = plane;
  const P = (u, v, w) => add(origin, add(mul(x, u), add(mul(y, v), mul(z, w))));
  if (f.tool === 'dimple' || f.tool === 'emboss') {
    const Rb = S / 2;
    // Profile in (radial = x, height = z), revolved about z.
    const prof = new R.Plane(origin, x, mul(y, -1));
    let pen;
    if (f.tool === 'dimple') {
      const rs = (Rb * Rb + H * H) / (2 * H); const cz = H - rs;
      const a = Math.atan2(0 - cz, Rb); const m = (a + Math.PI / 2) / 2;
      const mid = (dz) => [rs * Math.cos(m), cz + rs * Math.sin(m) + dz];
      pen = R.draw([Rb, 0]).lineTo([Rb, t]).threePointsArcTo([0, H + t], mid(t)).lineTo([0, H]).threePointsArcTo([Rb, 0], mid(0)).close();
    } else {
      const top = Math.max(Rb * 0.3, Rb - H);
      pen = R.draw([0, H]).lineTo([top, H]).lineTo([Rb, 0]).lineTo([Rb, t]).lineTo([top, H + t]).lineTo([0, H + t]).close();
    }
    const formed = R.revolution(pen.sketchOnPlane(prof).face(), origin, z, 360);
    const hole = makeCylinderStable(Rb, t, origin, z);
    return { formed, hole, size: [S, S, H] };
  }
  const L = S;
  if (f.tool === 'louver') {
    // Across the louver (y): attached at +W/2, open at −W/2, the hood rising H over the opening; along x: L.
    const prof = new R.Plane(P(-L / 2, 0, 0), y, x);
    // The hood: an arc from the attached side up to its highest point over the open side.
    const rs = (W * W + H * H) / (2 * H); const cz = H - rs;
    const a0 = Math.atan2(-cz, W); const m = (a0 + Math.PI / 2) / 2;
    const mid = (dz) => [-W / 2 + rs * Math.cos(m), cz + rs * Math.sin(m) + dz];
    const pen = R.draw([W / 2, 0]).lineTo([W / 2, t]).threePointsArcTo([-W / 2, H + t], mid(t)).lineTo([-W / 2, H]).threePointsArcTo([W / 2, 0], mid(0)).close();
    const formed = pen.sketchOnPlane(prof).extrude(L);
    return { formed, hole: alignedBox(plane, [-L / 2, -W / 2, 0], [L / 2, W / 2, t]), size: [L, W, H] };
  }
  // Lance (bridge): a strip slit on both long sides and raised H, joined at both ends by ramps.
  const ramp = Math.min(L / 4, H * 1.5);
  const prof = new R.Plane(P(0, -W / 2, 0), x, mul(y, -1));
  const pen = R.draw([-L / 2, 0]).lineTo([-L / 2 + ramp, H]).lineTo([L / 2 - ramp, H]).lineTo([L / 2, 0]).lineTo([L / 2, t]).lineTo([L / 2 - ramp, H + t]).lineTo([-L / 2 + ramp, H + t]).lineTo([-L / 2, t]).close();
  const formed = pen.sketchOnPlane(prof).extrude(-W);
  return { formed, hole: alignedBox(plane, [-L / 2, -W / 2, 0], [L / 2, W / 2, t]), size: [L, W, H] };
}

/** A box given in the tool's local frame (corner lo → hi). */
function alignedBox({ origin, x, y, z }, lo, hi) {
  const R = rep();
  const P = (u, v) => add(origin, add(mul(x, u), mul(y, v)));
  const face = R.makePolygon([P(lo[0], lo[1]), P(hi[0], lo[1]), P(hi[0], hi[1]), P(lo[0], hi[1])].map((p) => add(p, mul(z, lo[2]))));
  return R.basicFaceExtrusion(face, new R.Vector(mul(z, hi[2] - lo[2])));
}

/**
 * Forming tool from the library (dimple, emboss, louver, lance) on a planar sheet face: the opening is cut
 * through the sheet and the formed shape (as thick as the sheet) put in its place. Down forms the other way.
 */
function buildFormTool(f, ctx) {
  const sm = needSheet(ctx);
  const face = findFace(ctx.body, f.face);
  if (!face || face.geomType !== 'PLANE') {
    if (ctx.flat) return {};
    throw codeError('face-missing');
  }
  const t = sm.thickness;
  const n = normalOf(face);
  if (Math.abs(Math.abs(dot(n, sm.normal)) - 1) > 1e-6) throw codeError('form-face');
  // Local frame on the face: ΔX along the world X axis laid on the face (−Y when the face is across X), turned by `angle`.
  const wx = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : worldFront();
  const x0 = normalize(sub(wx, mul(n, dot(wx, n))));
  const y0 = normalize(crossV(n, x0));
  const a = (num(f.angle) * Math.PI) / 180;
  const x = add(mul(x0, Math.cos(a)), mul(y0, Math.sin(a))); const y = normalize(crossV(n, x));
  const at = add(vec(face.center), add(mul(x0, num(f.dx)), mul(y0, num(f.dy))));
  // z points the way the form rises; the local origin is on the sheet's other face.
  const z = f.down ? mul(n, -1) : n;
  const origin = f.down ? at : sub(at, mul(n, t));
  const { formed, hole, size } = formShapes(f, t, { origin, x, y: f.down ? mul(y, -1) : y, z });
  const body = ctx.body.cut(hole).fuse(formed);
  return { body, form: { tool: FORM_TOOLS.includes(f.tool) ? f.tool : 'dimple', size } };
}

// ───────────────────────── weldments

/** End cap: a plate on a member's end face, its outline inset from the face's outer edge, `thickness` thick. */
function buildEndCap(f, ctx) {
  const R = rep();
  if (!ctx.body) throw codeError('no-body');
  const face = findFace(ctx.body, f.face);
  if (!face || face.geomType !== 'PLANE') throw codeError('face-missing');
  const n = normalOf(face);
  const T = Math.max(0.1, num(f.thickness, 5));
  const inset = Math.max(0, num(f.inset, 0));
  const outer = R.makeFace(face.outerWire().clone());
  const plate = inset > 1e-9 ? R.makeFace(offsetPlanar(outer, -inset, true)) : outer;
  const tool = prismOf(plate, mul(n, T));
  const [lo, hi] = plate.boundingBox.bounds;
  const dims = [0, 1, 2].map((i) => hi[i] - lo[i]).sort((p, q) => q - p);
  return { tool, body: ctx.body.fuse(tool), endCap: { thickness: T, w: round3(dims[0]), h: round3(dims[1]), area: R.measureArea(plate) } };
}

/**
 * Gusset: a triangular plate (legs d1, d2 along the two faces, corner chamfer) in the plane across the line
 * where two planar faces meet, centred on the faces (shifted by `offset` along the line).
 */
function buildGusset(f, ctx) {
  const R = rep();
  if (!ctx.body) throw codeError('no-body');
  const faces = (f.faces ?? []).slice(0, 2).map((sig) => findFace(ctx.body, sig)).filter(Boolean);
  if (faces.length < 2 || faces.some((x) => x.geomType !== 'PLANE')) throw codeError('no-faces');
  const [F1, F2] = faces;
  const n1 = normalOf(F1); const n2 = normalOf(F2);
  const c1 = vec(F1.center); const c2 = vec(F2.center);
  const Ldir = crossV(n1, n2);
  if (len3(Ldir) < 1e-6) throw codeError('faces-parallel');
  const L = normalize(Ldir);
  // A point on both planes: x = α n1 + β n2 (+ along L).
  const k1 = dot(n1, c1); const k2 = dot(n2, c2); const m = dot(n1, n2);
  const det = 1 - m * m;
  const alpha = (k1 - k2 * m) / det; const beta = (k2 - k1 * m) / det;
  const onLine = add(mul(n1, alpha), mul(n2, beta));
  const mid = mul(add(c1, c2), 0.5);
  const P = add(onLine, mul(L, dot(sub(mid, onLine), L) + num(f.offset)));
  let a1 = normalize(crossV(L, n1)); if (dot(a1, sub(c1, P)) < 0) a1 = mul(a1, -1);
  let a2 = normalize(crossV(L, n2)); if (dot(a2, sub(c2, P)) < 0) a2 = mul(a2, -1);
  const d1 = Math.max(0.5, num(f.d1, 30)); const d2 = Math.max(0.5, num(f.d2, 30));
  const T = Math.max(0.1, num(f.thickness, 5));
  const ch = Math.max(0, Math.min(Math.min(d1, d2) * 0.9, num(f.chamfer)));
  const base = sub(P, mul(L, T / 2));
  const pts = ch > 1e-9 ? [add(base, mul(a1, ch)), add(base, mul(a1, d1)), add(base, mul(a2, d2)), add(base, mul(a2, ch))] : [base, add(base, mul(a1, d1)), add(base, mul(a2, d2))];
  const tool = R.basicFaceExtrusion(R.makePolygon(pts), new R.Vector(mul(L, T)));
  return { tool, body: ctx.body.fuse(tool), gusset: { d1, d2, thickness: T, chamfer: ch } };
}

/**
 * Weld bead: a fillet weld (legs = size) along edges where two faces make an inside corner — straight edges
 * as a prism, circular edges (a pipe on a plate) revolved. Cosmetic: no solid, only the bead's path shown.
 */
function buildWeldBead(f, ctx) {
  const R = rep();
  if (!ctx.body) throw codeError('no-body');
  const edges = findEdges(ctx.body, f.edges ?? []);
  if (!edges.length) throw codeError('no-edges');
  const s = Math.max(0.1, num(f.size, 5));
  const length = edges.reduce((sum, e) => sum + e.length, 0);
  const weld = { size: s, length, count: edges.length, cosmetic: Boolean(f.cosmetic) };
  if (f.cosmetic) return { curve: R.makeCompound(edges.map((e) => e.clone())), weld };
  let body = ctx.body;
  for (const edge of edges) {
    const faces = facesOfEdge(ctx.body, edge);
    if (faces.length < 2) throw codeError('weld-not-corner');
    const { p, T } = samples(edge, 2)[0];
    const a1 = intoFace(faces[0], p, T); const a2 = intoFace(faces[1], p, T);
    const tri = [p, add(p, mul(a1, s)), add(p, mul(a2, s))];
    const cen = mul(add(add(tri[0], tri[1]), tri[2]), 1 / 3);
    if (insideBody(ctx.body, cen, s * 0.08)) throw codeError('weld-not-corner');
    const profile = R.makePolygon(tri);
    let bead;
    if (edge.geomType === 'LINE') bead = R.basicFaceExtrusion(profile, new R.Vector(sub(vec(edge.endPoint), vec(edge.startPoint))));
    else if (edge.geomType === 'CIRCLE') { const c = circleOfEdge(edge); bead = R.revolution(profile, c.centre, c.normal, 360); }
    else throw codeError('edge-unsupported');
    body = body.fuse(bead);
  }
  return { body, weld };
}

/** The segments of a structural member feature: { id, pa, pb, u, profile plane } as the member builds them. */
function memberSegments(m, ctx) {
  let segs; let refNormal;
  const s3 = ctx.part.features.find((x) => x.id === m.sketch && x.type === 'sketch3d');
  if (s3) {
    const pts = s3.points ?? [];
    segs = pts.slice(1).map((p, i) => ({ id: `s${i}`, pa: pts[i], pb: p }));
    if (s3.closed && pts.length > 2) segs.push({ id: `s${pts.length - 1}`, pa: pts[pts.length - 1], pb: pts[0] });
    refNormal = null;
  } else {
    const { sketch, frame } = sketchOf(m, ctx);
    segs = sketch.entities.filter((e) => e.type === 'line' && !e.construction).map((l) => { const a = byId(sketch, l.p1); const b = byId(sketch, l.p2); return { id: l.id, pa: toWorld(frame, [a.x, a.y]), pb: toWorld(frame, [b.x, b.y]) }; });
    refNormal = frame.normal;
  }
  const rot = (num(m.rotate) * Math.PI) / 180;
  return segs.filter((g) => len3(sub(g.pb, g.pa)) > 1e-6).map((g) => {
    const dir = normalize(sub(g.pb, g.pa));
    const u0 = refNormal && Math.abs(dot(refNormal, dir)) < 0.99 ? refNormal : normalize(crossV(dir, Math.abs(dot(dir, worldUp())) < 0.9 ? worldUp() : [1, 0, 0]));
    const v0 = normalize(crossV(dir, u0));
    const u = add(mul(u0, Math.cos(rot)), mul(v0, Math.sin(rot)));
    return { ...g, dir, u, L: len3(sub(g.pb, g.pa)) };
  });
}

/**
 * Trim / extend: each segment of a structural member that crosses the boundary plane is trimmed to it, one
 * that stops short is extended to it (its end cut along the plane). The side kept is the one the segment's
 * middle is on. The cut list then shows the new lengths.
 */
function buildTrimExtend(f, ctx) {
  const R = rep();
  if (!ctx.body) throw codeError('no-body');
  const m = ctx.part.features.find((x) => x.id === f.member && x.type === 'structural');
  if (!m) throw codeError('no-member');
  const fr = resolvePlane(f.plane, ctx);
  const N = fr.normal; const O = fr.origin;
  const segs = memberSegments(m, ctx);
  const margin = Math.max(num(m.w, 40), num(m.h, 40)) * 2 + 1;
  let body = ctx.body;
  const members = [];
  let changed = 0;
  for (const g of segs) {
    const along = dot(g.dir, N);
    const midSide = dot(sub(add(g.pa, mul(g.dir, g.L / 2)), O), N);
    if (Math.abs(along) < 1e-9 || Math.abs(midSide) < 1e-9) { members.push({ line: g.id, length: round3(g.L) }); continue; }
    const s = dot(sub(O, g.pa), N) / along; // where the line meets the plane, from pa
    const keepN = midSide > 0 ? N : mul(N, -1);
    const solidFrom = (p, length) => structuralProfile(m.profile, m.w, m.h, m.t).sketchOnPlane(new R.Plane(p, g.u, g.dir)).extrude(length);
    if (s > 1e-6 && s < g.L - 1e-6) {
      // Trim: the part beyond the plane goes.
      const piece = solidFrom(g.pa, g.L).intersect(halfSpace(ctx, O, mul(keepN, -1), g.L));
      body = body.cut(piece);
      const keptEnd = dot(sub(g.pa, O), keepN) > 0 ? 0 : g.L;
      members.push({ line: g.id, length: round3(Math.abs(s - keptEnd)) });
      changed++;
    } else if (s >= g.L - 1e-6 || s <= 1e-6) {
      const fromEnd = s >= g.L - 1e-6;
      const gapLen = fromEnd ? s - g.L : -s;
      if (gapLen < 1e-6) { members.push({ line: g.id, length: round3(g.L) }); continue; }
      const start = fromEnd ? sub(g.pb, mul(g.dir, 1e-3)) : sub(g.pa, mul(g.dir, gapLen + margin));
      const ext = solidFrom(start, gapLen + margin + 1e-3).intersect(halfSpace(ctx, O, keepN, gapLen + margin));
      body = body.fuse(ext);
      members.push({ line: g.id, length: round3(g.L + gapLen) });
      changed++;
    }
  }
  if (!changed) throw codeError('no-crossing');
  return { body, members, trim: { member: m.id, changed } };
}

const round3 = (v) => Math.round(v * 1000) / 1000;

/** Sketches each of these features uses: closed profiles (tab, lofted bend). */
export function sheetMoreSketchUse(type) {
  return ['tab', 'loftedBend'].includes(type) ? 'profile' : null;
}
