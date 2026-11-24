// More sheet metal: Convert to Sheet Metal (a solid's face and edges become a sheet with bends), Insert Bends
// (a thin-walled solid's sharp edges become bends), Rip (a gap along a corner edge so the walls can unfold),
// Unfold / Fold (the part laid flat for the features between them — cuts across bends — then formed again),
// Cross Break (the cosmetic X on a flat panel), Welded Corner (a flange corner filled with weld), and Tab and
// Slot (tabs on one body's edge, matching slots in the body it stands on).
//
// Bends here are built from their frame (sheet-fold.js): the same frame describes the formed shape and the flat
// pattern, which is how Fold maps what was cut in the flat back onto the formed part.
import { rep } from './kernel.js';
import { findEdges, findFace, crossV, normalize } from './refs.js';
import { codeError, sizeAround, regenerate } from './features.js';
import { bendAllowance } from './advanced.js';
import { meshSolid } from './openscad-feature.js';
import { flangesOf, corners, miteredPair } from './sheet-more.js';
import { bendFrame, zRange, toLocal, toWorld, foldLocal, flangeMap, refineAcross } from './sheet-fold.js';

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
const vec = (v) => (Array.isArray(v) ? v : [v.x, v.y, v.z]);
const num = (v, d = 0) => (v === null || v === '' || v === undefined || !Number.isFinite(Number(v)) ? d : Number(v));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const near3 = (a, b, tol = 1e-5) => len3(sub(a, b)) < tol;

export function buildSheetExtra(f, ctx) {
  switch (f.type) {
    case 'convertSheet': return buildConvert(f, ctx, false);
    case 'insertBends': return buildConvert(f, ctx, true);
    case 'rip': return buildRip(f, ctx);
    case 'unfold': return buildUnfold(f, ctx);
    case 'fold': return buildFold(f, ctx);
    case 'crossBreak': return buildCrossBreak(f, ctx);
    case 'weldedCorner': return buildWeldedCorner(f, ctx);
    case 'tabSlot': return buildTabSlot(f, ctx);
    default: throw codeError('unknown-feature', { type: f.type });
  }
}

// ───────────────────────── helpers

const volume = (s) => { try { return Math.abs(rep().measureVolume(s)); } catch { return 0; } };

/** A box in a frame: x ∈ [x0, x1], y ∈ [y0, y1], z ∈ [z0, z1] (frame coordinates). */
function frameBox(F, x0, x1, y0, y1, z0, z1) {
  const R = rep();
  const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => toWorld(F, [x, y, z0]));
  return R.basicFaceExtrusion(R.makePolygon(pts), new R.Vector(mul(F.z, z1 - z0)));
}

/** A shape moved by a rigid map { R, T } (p' = R p + T). */
function transformed(shape, M) {
  const R = rep(); const oc = R.getOC();
  const tr = new oc.gp_Trsf();
  tr.SetValues(M.R[0][0], M.R[0][1], M.R[0][2], M.T[0], M.R[1][0], M.R[1][1], M.R[1][2], M.T[1], M.R[2][0], M.R[2][1], M.R[2][2], M.T[2]);
  const mk = new oc.BRepBuilderAPI_Transform(shape.wrapped, tr, true, false);
  try { return R.cast(mk.Shape()); } finally { mk.delete(); tr.delete(); }
}

/** The solids of a shape (a compound of bodies, or one solid). */
export function solidsOf(shape) {
  const R = rep(); const oc = R.getOC();
  const out = [];
  const ex = new oc.TopExp_Explorer(shape.wrapped, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  for (; ex.More(); ex.Next()) out.push(R.cast(oc.TopoDS.Solid(ex.Current())));
  ex.delete();
  return out;
}

const compoundOf = (list) => (list.length === 1 ? list[0] : rep().makeCompound(list));

function insideBody(body, p, r) {
  const R = rep();
  try { return R.measureVolume(body.clone().intersect(R.makeBox(sub(p, [r, r, r]), add(p, [r, r, r])))) > 8 * r ** 3 * 0.5; } catch { return false; }
}

/** The faces of `shape` that contain `edge` (by topology), other than `except`. */
function facesWithEdge(shape, edge, except = null) {
  return shape.faces.filter((fc) => (!except || !fc.wrapped.IsSame(except.wrapped)) && fc.edges.some((e) => e.wrapped.IsSame(edge.wrapped)));
}

const normalOf = (face) => normalize(vec(face.normalAt(face.center)));

/** A planar face's vertices (from its edges' ends). */
function faceVertices(face) {
  const out = [];
  for (const e of face.edges) for (const p of [vec(e.startPoint), vec(e.endPoint)]) if (!out.some((q) => near3(p, q))) out.push(p);
  return out;
}

/**
 * The wall thickness behind a planar face: the distance to the nearest parallel face facing the other way
 * (its plane behind this one). Null when there is none.
 */
export function wallThickness(body, face) {
  const n = normalOf(face); const c = vec(face.center);
  let best = null;
  for (const g of body.faces) {
    if (g.geomType !== 'PLANE' || g.wrapped.IsSame(face.wrapped)) continue;
    const m = normalOf(g);
    if (dot(m, n) > -0.999999) continue;
    const d = dot(sub(c, vec(g.center)), n);
    if (d > 1e-6 && (best == null || d < best)) best = d;
  }
  return best;
}

const sheetOf = (ctx) => { if (!ctx.body || !ctx.sheet) throw codeError('no-sheet'); return ctx.sheet; };

/** The solid of one bend in its frame: the bend and the flange after it ('all') or the flange only. */
function bendSolid(F, b, flat, part = 'all') {
  const R = rep();
  const { r, t, theta, L, BA } = b;
  let draw;
  if (flat) {
    const x0 = part === 'flange' ? BA : 0;
    draw = R.draw([x0, 0]).lineTo([BA + L, 0]).lineTo([BA + L, -t]).lineTo([x0, -t]).close();
  } else {
    const th = (theta * Math.PI) / 180;
    const inner = (phi) => [r * Math.sin(phi), r - r * Math.cos(phi)];
    const outer = (phi) => [(r + t) * Math.sin(phi), r - (r + t) * Math.cos(phi)];
    const a1 = inner(th); const b1 = outer(th);
    const td = [Math.cos(th), Math.sin(th)];
    const a2 = [a1[0] + td[0] * L, a1[1] + td[1] * L]; const b2 = [b1[0] + td[0] * L, b1[1] + td[1] * L];
    if (part === 'flange') {
      if (L <= 1e-9) return null;
      draw = R.draw(a1).lineTo(a2).lineTo(b2).lineTo(b1).close();
    } else {
      let pen = R.draw([0, 0]);
      if (r > 1e-6) pen = pen.threePointsArcTo(a1, inner(th / 2));
      if (L > 1e-6) pen = pen.lineTo(a2).lineTo(b2);
      pen = pen.lineTo(b1).threePointsArcTo([0, -t], outer(th / 2));
      draw = pen.close();
    }
  }
  const plane = new R.Plane(toWorld(F, [0, 0, F.zLo]), F.x, F.z);
  return draw.sketchOnPlane(plane).extrude(F.zHi - F.zLo);
}

// ───────────────────────── convert to sheet metal / insert bends

/**
 * Convert to Sheet Metal: the fixed face becomes the base of a sheet `thickness` thick (inside the solid, or
 * outside it), every bend edge a bend of the given radius toward the face beyond it, that face a wall reaching
 * as far as it does. Where two bent walls meet, one runs over the other's end (overlap) with `gap` between, or
 * both stop short (open). Insert Bends does the same on a thin-walled solid: the thickness is its wall's and
 * every straight edge of the fixed face with a flat wall beyond it is bent.
 */
function buildConvert(f, ctx, auto) {
  const R = rep();
  if (!ctx.body) throw codeError('no-body');
  const solids = solidsOf(ctx.body);
  const face = findFace(ctx.body, f.face);
  if (!face) throw codeError('face-missing');
  if (face.geomType !== 'PLANE') throw codeError('face-not-planar');
  const nF = normalOf(face); const P0 = vec(face.center);
  let t;
  if (auto) {
    t = wallThickness(ctx.body, face);
    if (!t) throw codeError('not-thin');
  } else t = Math.max(0.05, num(f.thickness, 2));
  const r = Math.max(0, num(f.radius, t));
  const k = clamp(num(f.kFactor, 0.44), 0, 1);
  const outside = !auto && f.side === 'outside';
  const nb = outside ? nF : mul(nF, -1);
  const gap = Math.max(0, num(f.gap, auto ? 0.1 : 0.2));
  const corner = f.corner === 'open' ? 'open' : 'overlap';
  // The bend edges: the ones chosen, or (Insert Bends) every straight edge of the face with a flat wall beyond.
  let edges = auto ? face.edges.filter((e) => e.geomType === 'LINE') : findEdges(ctx.body, f.edges ?? []);
  edges = edges.filter((e) => face.edges.some((x) => x.wrapped.IsSame(e.wrapped)));
  if (!auto && (f.edges ?? []).length && !edges.length) throw codeError('edge-not-on-face');
  const bends = [];
  for (const edge of edges) {
    if (edge.geomType !== 'LINE') { if (auto) continue; throw codeError('edge-missing'); }
    const [wall] = facesWithEdge(ctx.body, edge, face);
    if (!wall || wall.geomType !== 'PLANE') { if (auto) continue; throw codeError('wall-not-planar'); }
    const nA = normalOf(wall);
    const theta = (Math.acos(clamp(dot(nF, nA), -1, 1)) * 180) / Math.PI;
    if (theta < 1 || theta > 179) { if (auto) continue; throw codeError('wall-angle'); }
    const s = vec(edge.startPoint); const e = vec(edge.endPoint);
    const d = normalize(sub(e, s)); const len = len3(sub(e, s));
    const mid = mul(add(s, e), 0.5);
    // x: in the face's plane, across the edge, out of the face (toward the edge from the face's inside).
    let x = normalize(crossV(d, nF));
    const probe = Math.min(t, len) * 0.2;
    if (insideBody(ctx.body, add(add(mid, mul(x, probe * 2)), mul(nF, -probe * 1.5)), probe)) x = mul(x, -1);
    // The wall runs from the edge into the face beyond it, as far as that face reaches.
    let w = normalize(crossV(nA, d));
    if (dot(w, nF) > 0) w = mul(w, -1);
    const D = Math.max(...faceVertices(wall).map((p) => dot(sub(p, s), w)));
    const half = (theta * Math.PI) / 360;
    const SB = Math.tan(half) * (outside ? r : r + t);
    const L = D - SB;
    if (L < -1e-9) throw codeError('wall-too-short');
    bends.push({ edge, s, e, d, len, x, nA, wall, theta, SB, L: Math.max(0, L) });
  }
  if (!auto && !bends.length && (f.edges ?? []).length) throw codeError('edge-missing');
  // The base: the face as a slab t thick, short of each bend edge by its setback.
  const big = sizeAround(ctx) * 4;
  let base = R.basicFaceExtrusion(face.clone(), new R.Vector(mul(nb, t)));
  for (const b of bends) {
    const F = bendFrame(sub(b.s, mul(b.x, b.SB)), b.x, mul(nF, -1));
    const [z0, z1] = zRange(F, b.s, b.e);
    const pad = Math.max(...bends.map((x) => x.SB)) * 2 + t * 2;
    base = base.cut(frameBox(F, 0, big, -big, big, z0 - pad, z1 + pad));
  }
  // Each bend's line on the base runs between the neighbouring bend lines (or the edge's own ends).
  const shared = (a, b) => [a.s, a.e].some((p) => near3(p, b.s) || near3(p, b.e));
  const lineAt = (b) => ({ p: sub(b.s, mul(b.x, b.SB)), n: b.x });
  const records = [];
  const pieces = [base];
  for (const [i, b] of bends.entries()) {
    const o = add(sub(b.s, mul(b.x, b.SB)), outside ? [0, 0, 0] : mul(nb, t));
    const F = bendFrame(o, b.x, mul(nF, -1));
    let [lo, hi] = zRange(F, b.s, b.e);
    const ext = [0, 0];
    for (const [j, c] of bends.entries()) {
      if (j === i || !shared(b, c)) continue;
      const atStart = near3(b.s, c.s) || near3(b.s, c.e);
      const V = atStart ? b.s : b.e;
      const zV = toLocal(F, V)[2];
      const lowEnd = Math.abs(zV - lo) < Math.abs(zV - hi);
      // Where the neighbour's bend line crosses this bend's line: the base ends there.
      const L2 = lineAt(c);
      const denom = dot(F.z, L2.n);
      if (Math.abs(denom) > 1e-9) {
        const zc = toLocal(F, o)[2] + dot(sub(L2.p, sub(o, mul(nb, outside ? 0 : t))), L2.n) / denom;
        if (lowEnd) lo = Math.max(lo, Math.min(zc, hi)); else hi = Math.min(hi, Math.max(zc, lo));
      }
      if (corner === 'open') continue;
      // Overlap: the earlier wall runs to the neighbour's outer face, the later one to the earlier one's
      // inner face less the gap (their flat parts only — the bends end at the base).
      const outerPt = outside ? add(c.s, mul(c.nA, t)) : c.s;
      const target = i < j ? { p: outerPt, n: c.nA } : { p: sub(outside ? add(c.s, mul(c.nA, t)) : c.s, mul(c.nA, t + gap)), n: c.nA };
      const dirOut = lowEnd ? mul(F.z, -1) : F.z;
      const dd = dot(dirOut, target.n);
      if (Math.abs(dd) > 1e-9) {
        const endPt = toWorld(F, [0, 0, lowEnd ? lo : hi]);
        ext[lowEnd ? 0 : 1] = Math.max(0, dot(sub(target.p, endPt), target.n) / dd);
      }
    }
    F.zLo = lo; F.zHi = hi;
    const BA = bendAllowance(b.theta, r, t, k);
    const rec = { r, t, theta: b.theta, BA, L: b.L };
    pieces.push(bendSolid(F, rec, ctx.flat, 'all'));
    if (ext[0] > 1e-6) { const G = { ...F, zLo: lo - ext[0], zHi: lo }; const p = bendSolid(G, rec, ctx.flat, 'flange'); if (p) pieces.push(p); }
    if (ext[1] > 1e-6) { const G = { ...F, zLo: hi, zHi: hi + ext[1] }; const p = bendSolid(G, rec, ctx.flat, 'flange'); if (p) pieces.push(p); }
    records.push({ start: b.s, end: b.e, angle: b.theta, radius: r, outward: b.x, flat: ctx.flat, allowance: BA, frame: F, ...rec, feature: f.id, convert: true });
  }
  let sheet = pieces[0];
  for (const p of pieces.slice(1)) sheet = sheet.fuse(p);
  // The other bodies of the part stay as they are.
  const others = solids.filter((s) => !s.faces.some((fc) => fc.wrapped.IsSame(face.wrapped)));
  const body = others.length ? R.makeCompound([...others, ...solidsOf(sheet)]) : sheet;
  ctx.sheet = { thickness: t, radius: r, k, normal: nb, origin: P0, bends: records };
  return { body, sheet: ctx.sheet, convert: { bends: records.length, thickness: t } };
}

// ───────────────────────── rip

/**
 * Rip: a gap of `gap` along each chosen corner edge of a thin-walled solid, through the corner where its two
 * walls meet — on the bisector ('both'), or along one wall's inner face so the other keeps the corner ('a' cuts
 * through the first face's wall, 'b' through the second's).
 */
function buildRip(f, ctx) {
  if (!ctx.body) throw codeError('no-body');
  const edges = findEdges(ctx.body, f.edges ?? []);
  if (!edges.length) throw codeError('edge-missing');
  const gap = Math.max(0.01, num(f.gap, 0.1));
  let body = ctx.body;
  let count = 0;
  for (const edge of edges) {
    if (edge.geomType !== 'LINE') throw codeError('edge-missing');
    const [A, B] = facesWithEdge(ctx.body, edge);
    if (!A || !B || A.geomType !== 'PLANE' || B.geomType !== 'PLANE') throw codeError('wall-not-planar');
    const tA = wallThickness(ctx.body, A); const tB = wallThickness(ctx.body, B);
    if (!tA || !tB) throw codeError('not-thin');
    const nA = normalOf(A); const nB = normalOf(B);
    const s = vec(edge.startPoint); const e = vec(edge.endPoint);
    let tool;
    if (f.direction === 'a' || f.direction === 'b') {
      // Through one wall, at the other wall's inner face.
      const [n1, t1, n2, t2] = f.direction === 'a' ? [nA, tA, nB, tB] : [nB, tB, nA, tA];
      const F = bendFrame(s, mul(n1, -1), mul(n2, -1));
      const [z0, z1] = zRange(F, s, e);
      tool = frameBox(F, -0.5 * t1, t1, t2, t2 + gap, z0, z1);
    } else {
      const m = normalize(sub(nA, nB));
      const inward = normalize(mul(add(nA, nB), -1));
      const F = bendFrame(s, inward, m);
      const [z0, z1] = zRange(F, s, e);
      const depth = len3(add(mul(nA, tA), mul(nB, tB))) * 1.25 + 0.01;
      tool = frameBox(F, -0.5 * Math.max(tA, tB), depth, -gap / 2, gap / 2, z0, z1);
    }
    body = body.cut(tool);
    count += 1;
  }
  return { body, rip: { edges: count, gap } };
}

// ───────────────────────── unfold / fold

/**
 * Unfold: from here on (to the next Fold) the part is built on its flat pattern — every bend before it laid
 * flat — so a cut can go straight across a bend. The flat pattern itself is built as usual.
 */
function buildUnfold(f, ctx) {
  const sm = sheetOf(ctx);
  if (ctx.unfold) throw codeError('already-unfolded');
  // The flat pattern is flat already: the features after this one build on it as they are.
  if (ctx.flat) return { unfold: { flatPattern: true } };
  const at = ctx.part.features.indexOf(f);
  const before = ctx.part.features.slice(0, at);
  if (before.some((x) => !x.suppressed && (x.type === 'jog' || x.type === 'loftedBend'))) throw codeError('fold-unsupported');
  const flatRun = regenerate(ctx.part, { upTo: at, flat: true, project: ctx.project, stack: ctx.stack.slice(0, -1) });
  if (!flatRun.body || !flatRun.sheet) throw codeError('no-sheet');
  const flatBends = flatRun.sheet.bends; const formBends = sm.bends;
  if (flatBends.length !== formBends.length || formBends.some((b) => !b.frame) || flatBends.some((b) => !b.frame)) throw codeError('fold-unsupported');
  ctx.unfold = { id: f.id, folded: ctx.body, flat: flatRun.body, flatBends: flatBends.map((b) => ({ ...b })), formBends: formBends.map((b) => ({ ...b })) };
  ctx.flat = true;
  return { body: flatRun.body.clone(), unfold: { bends: flatBends.length } };
}

/** Whether a flat point lies in a bend's flange region (past its strip, within its length and extent). */
function inFlange(b, p, tol = 1e-4) {
  const [x, y, z] = toLocal(b.frame, p);
  return x >= b.BA - tol && x <= b.BA + b.L + tol && z >= b.frame.zLo - tol && z <= b.frame.zHi + tol && y >= -2 * b.t - tol && y <= b.t + tol;
}

/**
 * The pieces of a flat solid moved to the formed part: in each bend's strip wrapped onto the bend, on each
 * flange turned with it, elsewhere unchanged. `stretch` pushes a wrapped cut a little past both sheet faces
 * (so it cuts the formed bend's faces cleanly instead of grazing them).
 */
function foldSolid(piece, u, size, stretch) {
  const out = [];
  const n = u.flatBends.length;
  // Deeper bends first: a bend standing on another bend's flange is mapped before that flange's region is.
  const depth = (i) => u.flatBends.filter((b, j) => j !== i && inFlange(b, u.flatBends[i].frame.o)).length;
  const order = [...Array(n).keys()].sort((a, b) => depth(b) - depth(a) || b - a);
  let rest = piece;
  for (const i of order) {
    if (volume(rest) < 1e-9) break;
    const bf = u.flatBends[i]; const bF = u.formBends[i];
    const F = bf.frame; const G = bF.frame;
    const t = bf.t;
    const zLo = Math.max(F.zLo, -size); const zHi = Math.min(F.zHi, size);
    const L = Math.min(bf.L, size);
    const strip = frameBox(F, 0, bf.BA, -2 * t, t, zLo, zHi);
    const far = frameBox(F, bf.BA, bf.BA + L, -2 * t, t, zLo, zHi);
    const inStrip = rest.clone().intersect(strip.clone());
    if (volume(inStrip) > 1e-9) out.push(wrapPiece(inStrip, bf, F, G, stretch));
    const inFar = rest.clone().intersect(far.clone());
    if (volume(inFar) > 1e-9) out.push(transformed(inFar, flangeMap(bf, F, G)));
    rest = rest.cut(strip).cut(far);
  }
  if (volume(rest) > 1e-9) out.push(rest);
  return out;
}

/** A flat piece in a bend's strip, meshed finely across the bend and each vertex wrapped onto it. */
function wrapPiece(piece, bend, F, G, stretch) {
  const m = piece.mesh({ tolerance: Math.max(0.002, bend.t * 0.002), angularTolerance: 0.1 });
  const V = m.vertices; const T = m.triangles;
  const key = new Map(); const verts = []; const remap = [];
  for (let i = 0; i < V.length / 3; i++) {
    const p = [V[3 * i], V[3 * i + 1], V[3 * i + 2]];
    const kk = p.map((v) => Math.round(v * 1e5)).join(',');
    let j = key.get(kk);
    if (j === undefined) { j = verts.length; verts.push(p); key.set(kk, j); }
    remap.push(j);
  }
  const tris = [];
  for (let i = 0; i < T.length; i += 3) { const a = remap[T[i]]; const b = remap[T[i + 1]]; const c = remap[T[i + 2]]; if (a !== b && b !== c && a !== c) tris.push([a, b, c]); }
  const steps = Math.max(2, Math.ceil(bend.theta / 3));
  const fine = refineAcross(verts, tris, (p) => toLocal(F, p)[0], Math.max(1e-4, bend.BA / steps));
  const pad = stretch ? Math.min(bend.t * 0.05, bend.r > 1e-6 ? bend.r * 0.5 : 0) : 0;
  const moved = fine.verts.map((p) => {
    const q = toLocal(F, p);
    if (pad > 0) { if (Math.abs(q[1]) < 1e-6) q[1] = pad; else if (Math.abs(q[1] + bend.t) < 1e-6) q[1] = -bend.t - pad; }
    return toWorld(G, foldLocal(bend, q));
  });
  return meshSolid(moved, fine.tris);
}

/**
 * Fold: what changed since the Unfold (cut away or added on the flat pattern) is mapped onto the formed part —
 * wrapped over the bends it crosses, turned with the flanges it is on — and the part is formed again.
 */
function buildFold(f, ctx) {
  sheetOf(ctx);
  const u = ctx.unfold;
  if (!u) {
    if (ctx.flat) return { fold: { flatPattern: true } };
    throw codeError('no-unfold');
  }
  const size = sizeAround(ctx) * 4;
  const removed = u.flat.clone().cut(ctx.body.clone());
  const added = ctx.body.clone().cut(u.flat.clone());
  let body = u.folded;
  let cut = 0; let joined = 0;
  if (volume(removed) > 1e-9) for (const p of foldSolid(removed, u, size, true)) { body = body.cut(p); cut += 1; }
  if (volume(added) > 1e-9) for (const p of foldSolid(added, u, size, false)) { body = body.fuse(p); joined += 1; }
  ctx.unfold = null;
  ctx.flat = false;
  return { body, fold: { cutPieces: cut, addedPieces: joined } };
}

// ───────────────────────── cross break

/**
 * Cross Break: the two diagonals of a flat panel (cosmetic — the panel is not changed), kept with the radius,
 * angle and direction of the break so drawings can note them.
 */
function buildCrossBreak(f, ctx) {
  const R = rep();
  if (!ctx.body) throw codeError('no-body');
  const face = findFace(ctx.body, f.face);
  if (!face) throw codeError('face-missing');
  if (face.geomType !== 'PLANE') throw codeError('face-not-planar');
  const n = normalOf(face);
  const pts = faceVertices(face);
  let corners;
  if (pts.length === 4) {
    // Order the corners around the centre; the diagonals join opposite ones.
    const c = mul(pts.reduce(add, [0, 0, 0]), 1 / 4);
    const u = normalize(sub(pts[0], c)); const v = crossV(n, u);
    corners = pts.slice().sort((a, b) => Math.atan2(dot(sub(a, c), v), dot(sub(a, c), u)) - Math.atan2(dot(sub(b, c), v), dot(sub(b, c), u)));
  } else {
    // Any other outline: the diagonals of its box in the face's plane.
    let u = [1, 0, 0]; if (Math.abs(dot(u, n)) > 0.9) u = [0, 1, 0];
    u = normalize(sub(u, mul(n, dot(u, n)))); const v = crossV(n, u);
    const c = vec(face.center);
    const us = pts.map((p) => dot(sub(p, c), u)); const vs = pts.map((p) => dot(sub(p, c), v));
    const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
    corners = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([a, b]) => add(c, add(mul(u, a), mul(v, b))));
  }
  const lift = mul(n, 0.01);
  const lines = [[corners[0], corners[2]], [corners[1], corners[3]]].map(([a, b]) => [add(a, lift), add(b, lift)]);
  const curve = R.makeCompound(lines.map(([a, b]) => R.makeLine(a, b)));
  const up = f.direction !== 'down';
  return { curve, crossBreak: { lines, radius: Math.max(0, num(f.radius, 100)), angle: Math.max(0, num(f.angle, 2)), up, normal: up ? n : mul(n, -1) } };
}

// ───────────────────────── welded corner

/**
 * Welded Corner: the gap where two edge flanges meet is filled (the closed corner's mitered pieces, less what
 * is there already) and kept as a weld — its volume and seam length go to the weld table. The flat pattern
 * has no weld.
 */
function buildWeldedCorner(f, ctx) {
  sheetOf(ctx);
  if (ctx.flat) return { weld: { corners: 0, volume: 0, length: 0 } };
  const list = flangesOf(f, ctx);
  const cs = corners(list);
  if (!cs.length) throw codeError('no-corner');
  let body = ctx.body; let vol = 0; let seam = 0;
  for (const c of cs) {
    let fill = null;
    for (const piece of miteredPair(ctx, c, list[c.i], list[c.j], 0)) fill = fill ? fill.fuse(piece) : piece;
    const weld = fill.cut(body.clone());
    const v = volume(weld);
    if (v > 1e-9) { body = body.fuse(weld); vol += v; }
    seam += Math.max(list[c.i].radius, list[c.j].radius) * Math.PI / 2 + Math.min(list[c.i].length, list[c.j].length) + ctx.sheet.thickness;
  }
  return { body, weld: { corners: cs.length, volume: vol, length: seam } };
}

// ───────────────────────── tab and slot

/**
 * Tab and Slot: `count` tabs `length` long along a straight edge of one body (where it stands on another body's
 * face), as thick as that body there and as high as the other body is thick (or `height`); the other body
 * gets matching slots, `clearance` larger all round. Both bodies must be separate solids of the part.
 */
function buildTabSlot(f, ctx) {
  const R = rep();
  if (!ctx.body) throw codeError('no-body');
  const solids = solidsOf(ctx.body);
  const [edge] = findEdges(ctx.body, f.edge ? [f.edge] : []);
  const face = findFace(ctx.body, f.face);
  if (!edge || edge.geomType !== 'LINE') throw codeError('edge-missing');
  if (!face || face.geomType !== 'PLANE') throw codeError('face-missing');
  const tabBody = solids.find((s) => s.edges.some((e) => e.wrapped.IsSame(edge.wrapped)));
  const slotBody = solids.find((s) => s.faces.some((fc) => fc.wrapped.IsSame(face.wrapped)));
  if (!tabBody || !slotBody || tabBody === slotBody || tabBody.wrapped.IsSame(slotBody.wrapped)) throw codeError('tab-slot-bodies');
  const n = normalOf(face); // out of the slot body, toward the tab body
  const s = vec(edge.startPoint); const e = vec(edge.endPoint);
  if (Math.abs(dot(sub(s, vec(face.center)), n)) > 1e-4 || Math.abs(dot(sub(e, vec(face.center)), n)) > 1e-4) throw codeError('edge-not-on-face');
  const d = normalize(sub(e, s)); const len = len3(sub(e, s));
  // The tab body's face on the slot face that holds the edge: its width across the edge.
  const end = facesWithEdge(tabBody, edge).find((fc) => fc.geomType === 'PLANE' && Math.abs(dot(normalOf(fc), n) + 1) < 1e-6);
  if (!end) throw codeError('tab-not-standing');
  const across = normalize(crossV(n, d));
  const ys = faceVertices(end).map((p) => dot(sub(p, s), across));
  const y0 = Math.min(...ys); const y1 = Math.max(...ys);
  const thick = wallThickness(slotBody, face) ?? 0;
  const h = num(f.height, 0) > 0 ? num(f.height) : thick;
  if (!(h > 0)) throw codeError('not-thin');
  const count = Math.max(1, Math.min(50, Math.round(num(f.count, 2))));
  const L = Math.max(0.1, Math.min(len / count, num(f.length, 10)));
  const c = Math.max(0, num(f.clearance, 0.1));
  const F = bendFrame(s, mul(n, -1), across);
  const zs = zRange(F, s, e);
  const dz = (zs[1] - zs[0]);
  let tabs = tabBody; let slotted = slotBody;
  const centres = [];
  for (let i = 0; i < count; i++) {
    const zc = zs[0] + (dz * (i + 0.5)) / count + num(f.offset, 0);
    centres.push(toWorld(F, [0, 0, zc]));
    tabs = tabs.fuse(frameBox(F, -0.001, h, y0, y1, zc - L / 2, zc + L / 2));
    slotted = slotted.cut(frameBox(F, -0.01, Math.max(h, thick) + 0.01, y0 - c, y1 + c, zc - L / 2 - c, zc + L / 2 + c));
  }
  const others = solids.filter((x) => x !== tabBody && x !== slotBody);
  return { body: R.makeCompound([...others, ...solidsOf(tabs), ...solidsOf(slotted)]), tabSlot: { count, length: L, height: h, clearance: c, centres } };
}
