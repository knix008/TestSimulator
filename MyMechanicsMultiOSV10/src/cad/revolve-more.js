// Revolve options beyond one angle: mid-plane, a second direction, up to vertex / surface / offset from surface,
// thin features and selected contours (profiles from extrude-more.js). Exact: the profile turned by the kernel,
// bounded ends cut with the splitter, keeping the piece that starts at the profile.
import { rep } from './kernel.js';
import { normalize } from './refs.js';
import { codeError } from './features.js';
import { profileFaces, splitBy, touching, fuseAll, extendedFace, planeFace, resolveTarget, resolveVertex, volume } from './extrude-more.js';

export const REVOLVE_ENDS = ['blind', 'midplane', 'upToVertex', 'upToSurface', 'offsetFromSurface'];
export const REVOLVE_ENDS2 = ['blind', 'upToVertex', 'upToSurface', 'offsetFromSurface'];

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const vec = (p) => (Array.isArray(p) ? p : [p.x, p.y, p.z]);

/** True when the revolve needs this module. */
export function needsRevolveMore(f) {
  return (f.end && f.end !== 'blind') || (f.end2 && f.end2 !== 'none') || Boolean(f.thin) || Array.isArray(f.contours);
}

/** The profile faces turned about the axis (origin o, direction d) by `deg` degrees, starting `from` degrees on. */
function turn(faces, o, d, deg, from = 0) {
  const R = rep();
  return fuseAll(faces.map((face) => R.revolution(from ? face.clone().rotate(from, o, d) : face.clone(), o, d, deg)));
}

/** A half-plane bounded by the axis, reaching out toward point p (the "up to vertex" stop). */
function halfPlane(o, d, p, size) {
  const R = rep();
  const radial = sub(sub(p, o), mul(d, dot(sub(p, o), d)));
  if (Math.hypot(...radial) < 1e-9) throw codeError('vertex-on-axis');
  const u = normalize(radial);
  const a = add(o, mul(d, -size)); const b = add(o, mul(d, size));
  const c = add(b, mul(u, size)); const e = add(a, mul(u, size));
  return R.makeFace(R.assembleWire([R.makeLine(a, b), R.makeLine(b, c), R.makeLine(c, e), R.makeLine(e, a)]));
}

/** One direction (d sense of the axis) from the profile, ended by its condition (suffix '' or '2'). */
function direction(faces, f, ctx, o, d, suffix, size) {
  const kind = (suffix ? f.end2 : f.end) ?? 'blind';
  if (kind === 'blind') {
    const deg = Math.max(0.01, Math.min(360, num(suffix ? f.angle2 : f.angle, 360)));
    return turn(faces, o, d, deg);
  }
  // Nearly a full turn, cut where the condition says, keeping the piece that starts at the profile.
  const long = turn(faces, o, d, 359.9);
  let cutter;
  if (kind === 'upToVertex') cutter = halfPlane(o, d, resolveVertex(f[`endVertex${suffix}`], ctx), size);
  else if (kind === 'upToSurface' || kind === 'offsetFromSurface') {
    const tg = resolveTarget(f[`endFace${suffix}`], ctx);
    cutter = tg.face ? extendedFace(tg.face, size) : planeFace(tg.plane.origin, tg.plane.normal, size);
    if (kind === 'offsetFromSurface') {
      const R = rep();
      // Short of the surface by the offset: moved toward the side the profile is on (Reverse offset: away from it).
      const p = vec(cutter.pointOnSurface(0.5, 0.5));
      const nrm = normalize(vec(cutter.normalAt(p)));
      const side = dot(nrm, sub(faceCentre(faces), p)) > 0 ? 1 : -1;
      const off = Math.abs(num(f[`endOffset${suffix}`], 5)) * side * (f[`reverseOffset${suffix}`] ? -1 : 1);
      cutter = cutter.geomType === 'PLANE' ? cutter.translate(mul(nrm, off)) : R.makeOffset(cutter, off);
    }
  } else throw codeError('bad-end', { end: kind });
  const total = volume(long);
  const keep = touching(splitBy(long, cutter), faces);
  const kept = keep.reduce((s, x) => s + volume(x), 0);
  if (!keep.length || kept > total * (1 - 1e-6)) throw codeError('end-not-reached');
  return fuseAll(keep);
}

const faceCentre = (faces) => vec(faces[0].center);

/**
 * The revolved tool: `sketch`, `fr` (its frame), axis origin `o` and direction `d` (Reverse already applied).
 */
export function revolveMoreTool(f, ctx, sketch, fr, o, d) {
  const faces = profileFaces(sketch, fr, f);
  const size = 1e4;
  const end = f.end ?? 'blind';
  let tool;
  if (end === 'midplane') {
    const deg = Math.max(0.01, Math.min(360, num(f.angle, 360)));
    tool = turn(faces, o, d, deg, -deg / 2);
  } else tool = direction(faces, f, ctx, o, d, '', size);
  if (f.end2 && f.end2 !== 'none' && end !== 'midplane') tool = tool.fuse(direction(faces, f, ctx, o, mul(d, -1), '2', size));
  if (!(volume(tool) > 0)) throw codeError('zero-depth');
  void cross;
  return tool;
}
