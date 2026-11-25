// Solid sweep: a tool body (a revolved solid — a cutter) moved along a path with its axis kept in one direction, as
// a milling cutter moves. The swept volume is the tool's section through its axis, square to the path, swept with
// that axis held fixed (the trihedron's binormal), joined with the tool at the path's start and at its end. That is
// the exact envelope while the path stays square to the tool axis (every move in planes across the axis); a path
// that climbs or dives along the axis is refused rather than approximated.
import { rep } from './kernel.js';
import { revolvedAxis } from './costing.js';

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

/**
 * The swept volume of `tool` (a solid) along `path` (a wire starting at the tool, the tool's axis through the
 * path's start). Throws { code } 'tool-not-revolved', 'path-along-axis'.
 */
export function solidSweep(tool, path, { codeError }) {
  const R = rep(); const oc = R.getOC();
  const ax = toolAxis(tool);
  if (!ax) throw codeError('tool-not-revolved');
  const a = ax.dir;
  const smp = pathSamples(path);
  for (const s of smp) if (Math.abs(dot(s.t, a)) > 1e-6) throw codeError('path-along-axis');
  // The tool's section through its axis, square to the path at the start (a big planar face cut by the tool).
  const p0 = smp[0].p; const t0 = smp[0].t;
  const [lo, hi] = tool.boundingBox.bounds; const big = Math.hypot(...sub(hi, lo)) * 2 + 10;
  const foot = add(ax.point, a, dot(sub(p0, ax.point), a));
  const u = unit(cross(t0, a));
  const c = (s, k) => add(add(foot, u, s * big), a, k * big);
  const plane = R.makePolygon([c(-1, -1), c(1, -1), c(1, 1), c(-1, 1)]);
  const common = new oc.BRepAlgoAPI_Common(tool.wrapped, plane.wrapped, new oc.Message_ProgressRange());
  const section = R.cast(common.Shape()); common.delete();
  const faces = section.faces ?? [];
  if (!faces.length) throw codeError('tool-not-revolved');
  // Swept with the tool axis as the fixed binormal; round transitions at the path's corners.
  let swept = null;
  for (const face of faces) {
    const outer = face.outerWire();
    const bin = new oc.gp_Dir(a[0], a[1], a[2]);
    const mk = new oc.BRepOffsetAPI_MakePipeShell(path.wrapped);
    mk.SetTransitionMode(oc.BRepBuilderAPI_TransitionMode.BRepBuilderAPI_RoundCorner);
    mk.SetMode(bin);
    mk.Add(outer.wrapped, false, true);
    try { mk.Build(); mk.MakeSolid(); } catch { mk.delete(); bin.delete(); throw codeError('kernel'); }
    let s = R.cast(mk.Shape()); mk.delete(); bin.delete();
    try { if (R.measureVolume(s) < 0) s = R.cast(s.wrapped.Reversed()); } catch { /* keep */ }
    swept = swept ? swept.fuse(s) : s;
  }
  // The tool at the start (where it is) and at the end (moved there; its axis keeps its direction).
  const pEnd = smp[smp.length - 1].p;
  return swept.fuse(tool.clone()).fuse(tool.clone().translate(sub(pEnd, p0)));
}
