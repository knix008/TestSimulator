// Fastening features for plastic parts (no DOM): mounting boss (with a hole or a pin, draft and gusset fins), snap
// hook (a cantilever arm with a retaining lip and an insertion slope), snap hook groove (the hook's shape grown by a
// clearance and cut from the mating body), vent (a sketched boundary cut through the wall, with ribs and spars left
// standing) and lip / groove (a strip along the inner or outer edge of a rim face, added or cut).
//
// Every boss, hook or strip starts a hair below the face it stands on, so the kernel fuses it into the wall instead
// of leaving two solids touching along a face.
import { rep } from './kernel.js';
import { findFace, planeOfFace, crossV, normalize, faceWires } from './refs.js';
import { codeError, sketchOf, sizeAround, loopDrawing, replicadPlane } from './features.js';
import { profiles, byId } from './sketch.js';
import { makeCylinderStable } from './oriented.js';

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const OVERLAP = 0.02;

export function buildFastening(f, ctx) {
  switch (f.type) {
    case 'mountingBoss': return buildMountingBoss(f, ctx);
    case 'snapHook': return buildSnapHook(f, ctx);
    case 'snapHookGroove': return buildSnapHookGroove(f, ctx);
    case 'vent': return buildVent(f, ctx);
    case 'lipGroove': return buildLipGroove(f, ctx);
    default: throw codeError('unknown-feature', { type: f.type });
  }
}

// ───────────────────────── where a feature stands on a face

/**
 * The frame a boss or a hook stands in: on the picked planar face, at its centre or at the given point (projected
 * onto the face), the face's outward normal up (reversed on request), the face's own x direction turned by `angle`.
 */
export function standFrame(f, ctx, { angle = 0 } = {}) {
  if (!ctx.body) throw codeError('no-body');
  const face = findFace(ctx.body, f.face);
  if (!face) throw codeError('face-missing');
  if (face.geomType !== 'PLANE') throw codeError('face-not-planar');
  const pl = planeOfFace(face);
  const n = f.reverse ? mul(pl.normal, -1) : pl.normal;
  let at = pl.origin;
  if (f.pointRef && ctx.refPoints?.has(f.pointRef)) at = ctx.refPoints.get(f.pointRef);
  else if (!f.atCenter) at = [num(f.x), num(f.y), num(f.z)];
  at = sub(at, mul(pl.normal, dot(sub(at, pl.origin), pl.normal)));
  const a = (num(angle) * Math.PI) / 180;
  const x0 = pl.xDir; const y0 = normalize(crossV(pl.normal, x0));
  const u = normalize(add(mul(x0, Math.cos(a)), mul(y0, Math.sin(a))));
  const w = normalize(crossV(n, u));
  return { origin: at, n, u, w };
}

/** A prism: the polygon `pts` ([a, b] in the frame's (u, n) plane) extruded `t` along w, centred on the frame. */
function prismUN(fr, pts, t, shift = 0) {
  const R = rep();
  const origin = add(fr.origin, mul(fr.w, shift - t / 2));
  const plane = new R.Plane(origin, fr.u, fr.w);
  // The plane's y is w × u … the sketch's (x, y) are (u, ±n): draw with y mapped so +y is +n.
  const ySign = Math.sign(dot(crossV(fr.w, fr.u), fr.n)) || 1;
  let pen = R.draw([pts[0][0], pts[0][1] * ySign]);
  for (const p of pts.slice(1)) pen = pen.lineTo([p[0], p[1] * ySign]);
  return pen.close().sketchOnPlane(plane).extrude(t);
}

/** A solid of revolution about the frame's normal: profile [[r, h], …] in (radius, height) turned 360°. */
function revolveRH(fr, pts) {
  const R = rep();
  const plane = new R.Plane(fr.origin, fr.u, fr.w);
  const ySign = Math.sign(dot(crossV(fr.w, fr.u), fr.n)) || 1;
  let pen = R.draw([pts[0][0], pts[0][1] * ySign]);
  for (const p of pts.slice(1)) pen = pen.lineTo([p[0], p[1] * ySign]);
  return pen.close().sketchOnPlane(plane).revolve(fr.n, { origin: fr.origin });
}

// ───────────────────────── mounting boss

/**
 * Mounting boss: a round boss `height` high and `od` across at the top, its side drafted outward by `draft`° toward
 * the base; a hole (`id`, `holeDepth` from the top, or through the boss) or a pin (`pinDiameter` × `pinHeight` on
 * top); `fins` gussets around it (`finLength` beyond the boss, `finThickness`, `finHeight` at the boss) starting at
 * `finAngle`°, triangular (sloping to the floor) or rectangular.
 */
function buildMountingBoss(f, ctx) {
  const fr = standFrame(f, ctx);
  const h = Math.max(0.01, num(f.height, 12));
  const rt = Math.max(0.01, num(f.od, 8) / 2);
  const draft = Math.max(0, Math.min(30, num(f.draft, 0)));
  const rb = rt + h * Math.tan((draft * Math.PI) / 180);
  let tool = revolveRH(fr, [[0, -OVERLAP], [rb + OVERLAP * Math.tan((draft * Math.PI) / 180), -OVERLAP], [rt, h], [0, h]]);
  const fins = Math.max(0, Math.min(36, Math.round(num(f.fins, 0))));
  const fl = Math.max(0, num(f.finLength, 5)); const ft = Math.max(0.01, num(f.finThickness, 1.5)); const fh = Math.min(h, Math.max(0.01, num(f.finHeight, h * 0.7)));
  if (fins && fl > 0) {
    for (let i = 0; i < fins; i++) {
      const a = (num(f.finAngle, 0) * Math.PI) / 180 + (i * 2 * Math.PI) / fins;
      const u = normalize(add(mul(fr.u, Math.cos(a)), mul(fr.w, Math.sin(a))));
      const ff = { origin: fr.origin, n: fr.n, u, w: normalize(crossV(fr.n, u)) };
      // The fin starts inside the boss (at half its top radius) so it fuses into it.
      const r0 = rt * 0.5; const r1 = rb + fl;
      const rAtFh = rb - (rb - rt) * (fh / h);
      const pts = f.finShape === 'rect' ? [[r0, -OVERLAP], [r1, -OVERLAP], [r1, fh], [r0, fh]] : [[r0, -OVERLAP], [r1, -OVERLAP], [rAtFh, fh], [r0, fh]];
      tool = tool.fuse(prismUN(ff, pts, ft));
    }
  }
  if (f.kind === 'pin') {
    const pd = Math.max(0.01, num(f.pinDiameter, 3)); const ph = Math.max(0.01, num(f.pinHeight, 4));
    tool = tool.fuse(makeCylinderStable(pd / 2, ph + OVERLAP, add(fr.origin, mul(fr.n, h - OVERLAP)), fr.n));
  }
  let body = ctx.body.clone().fuse(tool);
  if (f.kind !== 'pin') {
    const d = Math.max(0.01, num(f.id, 3.5));
    if (d >= 2 * rt) throw codeError('hole-too-big');
    const depth = f.through ? h + sizeAround(ctx) : Math.max(0.01, num(f.holeDepth, h));
    const hd = Math.max(0, Math.min(10, num(f.holeDraft, 0)));
    // The hole narrows toward its bottom by its draft (a core pin that can be pulled out).
    const rTop = d / 2; const rBot = Math.max(0.001, rTop - depth * Math.tan((hd * Math.PI) / 180));
    const top = add(fr.origin, mul(fr.n, h + OVERLAP));
    const hole = hd > 0 && !f.through
      ? revolveRH({ ...fr, origin: add(fr.origin, mul(fr.n, h - depth)) }, [[0, 0], [rBot, 0], [rTop, depth + OVERLAP], [0, depth + OVERLAP]])
      : makeCylinderStable(rTop, depth + OVERLAP, top, mul(fr.n, -1));
    body = body.cut(hole);
  }
  return { body, frame: { origin: fr.origin, normal: fr.n, xDir: fr.u } };
}

// ───────────────────────── snap hook

/** The hook's solid (arm and lip) in its frame, every size grown by `grow` (the groove's clearance). */
function hookSolid(fr, f, grow = 0) {
  const H = Math.max(0.1, num(f.height, 15)); const W = Math.max(0.1, num(f.width, 6)); const T = Math.max(0.05, num(f.thickness, 1.5));
  const d = Math.max(0, num(f.lipDepth, 1.2)); const lh = Math.min(H * 0.9, Math.max(0.05, num(f.lipHeight, 3)));
  const ia = Math.max(5, Math.min(85, num(f.insertAngle, 30)));
  const g = grow;
  // Arm: behind the lip side (u from −T to 0), from below the face to the top.
  let solid = prismUN(fr, [[-T - g, -OVERLAP], [g, -OVERLAP], [g, H + g], [-T - g, H + g]], W + 2 * g);
  if (d > 0) {
    // Lip: the retaining face flat at H − lh, the outer face up to where the insertion slope starts, the slope to the top.
    const slope = Math.min(lh, d / Math.tan((ia * Math.PI) / 180));
    const y0 = H - lh; const y1 = H - slope;
    // A slope as long as the lip (a shallow insertion angle) leaves no straight outer face: the lip is a triangle.
    const outer = y1 - y0 > 1e-6 ? [[d + g, y0 - g], [d + g, y1]] : [[d + g, y0 - g]];
    solid = solid.fuse(prismUN(fr, [[-OVERLAP, y0 - g], ...outer, [0, H + g], [-OVERLAP, H + g]], W + 2 * g));
  }
  return solid;
}

/**
 * Snap hook: a cantilever arm `height` high, `width` wide, `thickness` thick, standing on the face, with a lip
 * `lipDepth` deep and `lipHeight` long at the top facing direction `angle` (the face's x turned), its top sloped at
 * `insertAngle`° so it slides in, its underside flat so it holds.
 */
function buildSnapHook(f, ctx) {
  const fr = standFrame(f, ctx, { angle: f.angle });
  const solid = hookSolid(fr, f);
  ctx.snapHooks ??= new Map();
  ctx.snapHooks.set(f.id, { frame: fr, params: { ...f } });
  return { body: ctx.body.clone().fuse(solid), frame: { origin: fr.origin, normal: fr.n, xDir: fr.u } };
}

/**
 * Snap hook groove: the chosen snap hook's shape grown by `clearance` cut from another body (`body` is that body's index) — the hole or the pocket the hook latches into.
 */
function buildSnapHookGroove(f, ctx) {
  const hook = ctx.snapHooks?.get(f.hook);
  if (!hook) throw codeError('hook-missing');
  const solids = solidsOf(ctx.body);
  if (solids.length < 2) throw codeError('needs-two-bodies');
  const i = Math.round(num(f.body, 1));
  if (!(i >= 0 && i < solids.length)) throw codeError('body-missing');
  const c = Math.max(0, num(f.clearance, 0.2));
  const tool = hookSolid(hook.frame, hook.params, c);
  const cut = solids[i].clone().cut(tool);
  const out = solids.map((s, k) => (k === i ? cut : s.clone()));
  return { body: out.length === 1 ? out[0] : rep().makeCompound(out), bodies: out.length };
}

function solidsOf(shape) {
  const R = rep();
  if (!shape) return [];
  try { return [...R.iterTopo(shape.wrapped, 'solid')].map((s) => R.cast(s)); } catch { return [shape]; }
}

// ───────────────────────── vent

/**
 * The parts of a vent sketch: the boundary (the largest closed region), spars (other closed loops inside it) and
 * ribs (open lines and arcs inside it). Construction geometry is left out.
 */
export function ventParts(sketch) {
  const regions = profiles(sketch);
  if (!regions.length) return null;
  const loops = regions.flatMap((r) => [r.outer, ...r.holes]).sort((a, b) => b.area - a.area);
  const boundary = loops[0];
  const spars = loops.slice(1);
  const ribs = sketch.entities.filter((e) => !e.construction && e.type === 'line' && !inLoop(sketch, e, loops));
  return { boundary, spars, ribs };
}

/** Whether a line is part of one of the closed loops (its two ends are consecutive corners of a loop). */
function inLoop(sketch, e, loops) {
  const a = byId(sketch, e.p1); const b = byId(sketch, e.p2);
  const same = (p, q) => Math.hypot(p[0] - q.x, p[1] - q.y) < 1e-7;
  return loops.some((l) => l.segs.some((s) => s.kind === 'line' && ((same(s.a, a) && same(s.b, b)) || (same(s.a, b) && same(s.b, a)))));
}

/**
 * Vent: the sketch's boundary is cut through the wall, except the ribs (`ribWidth` wide strips along the sketch's
 * lines) and the spars (`sparWidth` wide rings along its other closed loops), which stay standing at the full wall.
 */
function buildVent(f, ctx) {
  if (!ctx.body) throw codeError('no-body');
  const R = rep();
  const { sketch, frame: fr } = sketchOf(f, ctx);
  const parts = ventParts(sketch);
  if (!parts) throw codeError('no-profile');
  const big = sizeAround(ctx);
  const plane = (dz) => replicadPlane({ origin: add(fr.origin, mul(fr.normal, dz)), xDir: fr.xDir, normal: fr.normal });
  const through = (drawing) => drawing.sketchOnPlane(plane(-big)).extrude(2 * big);
  let tool = through(loopDrawing(parts.boundary));
  const rw = Math.max(0.01, num(f.ribWidth, 1.5));
  for (const l of parts.ribs) {
    const a = byId(sketch, l.p1); const b = byId(sketch, l.p2);
    const d = [b.x - a.x, b.y - a.y]; const L = Math.hypot(...d);
    if (L < 1e-9) continue;
    const t = [d[0] / L, d[1] / L]; const nrm = [-t[1], t[0]];
    // The rib runs a width past each end so it reaches into the boundary's edge.
    const e0 = [a.x - t[0] * rw, a.y - t[1] * rw]; const e1 = [b.x + t[0] * rw, b.y + t[1] * rw];
    const c = [[e0[0] + nrm[0] * rw / 2, e0[1] + nrm[1] * rw / 2], [e1[0] + nrm[0] * rw / 2, e1[1] + nrm[1] * rw / 2], [e1[0] - nrm[0] * rw / 2, e1[1] - nrm[1] * rw / 2], [e0[0] - nrm[0] * rw / 2, e0[1] - nrm[1] * rw / 2]];
    tool = tool.cut(through(R.draw(c[0]).lineTo(c[1]).lineTo(c[2]).lineTo(c[3]).close()));
  }
  const sw = Math.max(0.01, num(f.sparWidth, 1.5));
  for (const loop of parts.spars) {
    const d = loopDrawing(loop);
    let ring;
    try { ring = d.offset(sw / 2).cut(loopDrawing(loop).offset(-sw / 2)); } catch { throw codeError('vent-spar'); }
    tool = tool.cut(through(ring));
  }
  const before = R.measureVolume(ctx.body);
  const body = ctx.body.clone().cut(tool);
  if (Math.abs(R.measureVolume(body) - before) < 1e-9) throw codeError('vent-misses');
  return { body };
}

// ───────────────────────── lip / groove

/**
 * Lip / groove along a rim: on the picked planar face (the top of a wall), the strip `width` wide along its inner
 * (or outer) edge is raised `height` (a lip) or cut `height` deep (a groove, wider by `clearance` for the mating
 * lip).
 */
function buildLipGroove(f, ctx) {
  if (!ctx.body) throw codeError('no-body');
  const R = rep();
  const face = findFace(ctx.body, f.face);
  if (!face) throw codeError('face-missing');
  if (face.geomType !== 'PLANE') throw codeError('face-not-planar');
  const pl = planeOfFace(face);
  const groove = f.kind === 'groove';
  const w = Math.max(0.01, num(f.width, 1)) + (groove ? Math.max(0, num(f.clearance, 0)) : 0);
  const h = Math.max(0.01, num(f.height, 1.5));
  const dir = groove ? mul(pl.normal, -1) : pl.normal;
  // The strip as a prism: everything within w of the chosen edge, kept inside the face's own region.
  const slab = R.basicFaceExtrusion(face.clone(), new R.Vector(mul(dir, h + OVERLAP))).translate(mul(dir, -OVERLAP));
  let stripTool;
  const prism = (fc, len, shift) => R.basicFaceExtrusion(fc, new R.Vector(mul(dir, len))).translate(mul(dir, shift));
  const offsetWireFace = (wire, d) => {
    const oc = R.getOC();
    const base = R.makeFace(wire.clone());
    const mk = new oc.BRepOffsetAPI_MakeOffset(base.wrapped, oc.GeomAbs_JoinType.GeomAbs_Arc, false);
    mk.Perform(d, 0);
    const ok = mk.IsDone();
    const shape = ok ? R.cast(mk.Shape()) : null;
    mk.delete();
    if (!shape) throw codeError('lip-offset');
    const wires = [...R.iterTopo(shape.wrapped, 'wire')].map((x) => R.cast(x));
    if (!wires.length) throw codeError('lip-offset');
    return R.makeFace(wires[0]);
  };
  if (f.side === 'outer') {
    // Inside the outer edge: the outer region minus the outer region shrunk by w.
    const outerWire = faceWires(face).outer;
    const shrunk = offsetWireFace(outerWire, -w);
    stripTool = prism(R.makeFace(outerWire.clone()), h + 2 * OVERLAP, -OVERLAP).cut(prism(shrunk, h + 4 * OVERLAP, -2 * OVERLAP));
  } else {
    const holes = faceWires(face).inner;
    if (!holes.length) throw codeError('lip-no-inner');
    for (const hw of holes) {
      const grown = offsetWireFace(hw, w);
      const piece = prism(grown, h + 2 * OVERLAP, -OVERLAP).cut(prism(R.makeFace(hw.clone()), h + 4 * OVERLAP, -2 * OVERLAP));
      stripTool = stripTool ? stripTool.fuse(piece) : piece;
    }
  }
  const strip = slab.intersect(stripTool);
  const body = groove ? ctx.body.clone().cut(strip) : ctx.body.clone().fuse(strip);
  return { body };
}
