// Solid sweep: a tool body (a revolved solid — a cutter) moved along a path with its axis kept in one direction, as
// a milling cutter moves.
//   path square to the axis   the tool's section through its axis, square to the path, swept with the axis held as
//                             the trihedron's binormal, joined with the tool at both ends: the exact envelope
//   straight moves            (any direction, ramps and plunges too) the Minkowski sum of the tool and the segment:
//                             every face of the tool extruded along the move, with the tool at both ends — exact
//   other curved moves        (a helical ramp …) split into short straight moves (64 per edge)
import { rep } from './kernel.js';
import { revolvedAxis } from './costing.js';
import { silhouetteTools, splitFace } from './split-line-more.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const L = Math.hypot(...a) || 1; return a.map((x) => x / L); };
const vec = (p) => (Array.isArray(p) ? p : [p.x, p.y, p.z]);

/** The axis of a revolved tool solid: { point, dir } from its curved faces (null when it has none). */
export function toolAxis(tool) {
  for (const f of tool.faces) {
    if (f.geomType === 'PLANE') continue;
    const ax = revolvedAxis(f);
    if (ax?.dir) return { point: ax.point, dir: unit(ax.dir) };
  }
  return null;
}

/** Path points and unit tangents (each edge sampled), to check the path against the tool axis. */
function pathSamples(path, n = 32) {
  const out = [];
  for (const e of path.edges) for (let i = 0; i <= n; i++) { const u = i / n; out.push({ p: vec(e.pointAt(u)), t: unit(vec(e.tangentAt(u))) }); }
  return out;
}

/** The swept volume of `tool` (a solid) along `path` (a wire starting at the tool, its axis through the start). */
export function solidSweep(tool, path, { codeError }) {
  const R = rep();
  const ax = toolAxis(tool);
  if (!ax) throw codeError('tool-not-revolved');
  const a = ax.dir;
  const smp = pathSamples(path);
  const p0 = smp[0].p;
  // Square to the axis all along: one section sweep.
  if (smp.every((x) => Math.abs(dot(x.t, a)) <= 1e-6)) return sectionSweep(tool, path, ax, p0, codeError);
  // Otherwise edge by edge, the tool carried along (its axis keeps its direction).
  let out = tool.clone();
  for (const e of orderedEdges(path, p0)) {
    const { from, to } = e;
    const moved = tool.clone().translate(sub(from, p0));
    if (e.edge.geomType === 'LINE') { out = out.fuse(translationSweep(moved, sub(to, from))); continue; }
    const ts = Array.from({ length: 33 }, (_, i) => i / 32);
    const square = ts.every((t) => Math.abs(dot(unit(vec(e.edge.tangentAt(t))), a)) <= 1e-6);
    if (square) { out = out.fuse(sectionSweep(moved, R.assembleWire([e.edge.clone()]), { ...ax, point: add(ax.point, sub(from, p0)) }, from, codeError)); continue; }
    const pts = Array.from({ length: 65 }, (_, i) => vec(e.edge.pointAt(e.reversed ? 1 - i / 64 : i / 64)));
    for (let i = 1; i < pts.length; i++) out = out.fuse(translationSweep(tool.clone().translate(sub(pts[i - 1], p0)), sub(pts[i], pts[i - 1])));
  }
  return out;
}

/** The path's edges in order from its start, each with where it begins and ends. */
function orderedEdges(path, p0) {
  const left = [...path.edges];
  const out = [];
  let cur = p0;
  while (left.length) {
    let k = 0; let rev = false; let best = Infinity;
    left.forEach((e, i) => {
      const da = Math.hypot(...sub(vec(e.startPoint), cur)); const db = Math.hypot(...sub(vec(e.endPoint), cur));
      if (da < best) { best = da; k = i; rev = false; }
      if (db < best) { best = db; k = i; rev = true; }
    });
    const e = left.splice(k, 1)[0];
    const from = rev ? vec(e.endPoint) : vec(e.startPoint); const to = rev ? vec(e.startPoint) : vec(e.endPoint);
    out.push({ edge: e, from, to, reversed: rev });
    cur = to;
  }
  return out;
}

/**
 * The volume a solid sweeps moving straight by v (the Minkowski sum with the segment): each face extruded along v,
 * with the solid at both ends. Faces the move runs along (their prism is flat) add nothing.
 */
export function translationSweep(solid, v) {
  const R = rep();
  let out = solid.clone().fuse(solid.clone().translate(v));
  const L = Math.hypot(...v);
  if (L < 1e-12) return out;
  // Curved faces split where they turn away from the move (their silhouette): a whole closed face would sweep the
  // same region forward and back and cancel out.
  const [lo, hi] = solid.boundingBox.bounds; const big = Math.hypot(...sub(hi, lo)) + L + 10;
  const pieces = solid.faces.flatMap((f) => (f.geomType === 'PLANE' ? [f] : splitFace(f, silhouetteTools(f, v, big), big * 1e-7)));
  for (const face of pieces) {
    let prism;
    try { prism = R.basicFaceExtrusion(face.clone(), new R.Vector(v)); } catch { continue; }
    let vol = 0; try { vol = R.measureVolume(prism); } catch { vol = 0; }
    if (Math.abs(vol) < 1e-9 * Math.max(1, L)) continue;
    if (vol < 0) prism = R.cast(prism.wrapped.Reversed());
    out = out.fuse(prism);
  }
  return out;
}

/** The section sweep for a path square to the tool axis (see above). */
function sectionSweep(tool, path, ax, p0, codeError) {
  const R = rep(); const oc = R.getOC();
  const a = ax.dir;
  const smp = pathSamples(path);
  const t0 = smp[0].t;
  const [lo, hi] = tool.boundingBox.bounds; const big = Math.hypot(...sub(hi, lo)) * 2 + 10;
  const foot = add(ax.point, a, dot(sub(p0, ax.point), a));
  const u = unit(cross(t0, a));
  const c = (s, k) => add(add(foot, u, s * big), a, k * big);
  const plane = R.makePolygon([c(-1, -1), c(1, -1), c(1, 1), c(-1, 1)]);
  const common = new oc.BRepAlgoAPI_Common(tool.wrapped, plane.wrapped, new oc.Message_ProgressRange());
  const section = R.cast(common.Shape()); common.delete();
  const faces = section.faces ?? [];
  if (!faces.length) throw codeError('tool-not-revolved');
  let swept = null;
  for (const face of faces) {
    const outer = face.outerWire();
    const bin = new oc.gp_Dir(a[0], a[1], a[2]);
    const mk = new oc.BRepOffsetAPI_MakePipeShell(path.wrapped);
    mk.SetTransitionMode(oc.BRepBuilderAPI_TransitionMode.BRepBuilderAPI_RoundCorner);
    mk.SetMode(bin);
    mk.Add(outer.wrapped, false, true);
    try { mk.Build(); mk.MakeSolid(); } catch { mk.delete(); bin.delete(); throw codeError('kernel'); }
    let sw = R.cast(mk.Shape()); mk.delete(); bin.delete();
    try { if (R.measureVolume(sw) < 0) sw = R.cast(sw.wrapped.Reversed()); } catch { /* keep */ }
    swept = swept ? swept.fuse(sw) : sw;
  }
  const pEnd = smp[smp.length - 1].p;
  return swept.fuse(tool.clone()).fuse(tool.clone().translate(sub(pEnd, p0)));
}
