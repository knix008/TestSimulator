// regenerate() builders of the standard-part and route features (std-types.js). Both add a body of their own
// to the part (a compound with what was there), or join it to the body when `merge` is set.
import { rep } from './kernel.js';
import { stdShape, stdProblem, stdThread, designation } from './stdparts.js';
import { routeSolid, routeBom, routePoints } from './routing.js';
import { codeError } from './features.js';

const AXIS_TURN = { z: null, '-z': [[1, 0, 0], 180], x: [[0, 1, 0], 90], '-x': [[0, 1, 0], -90], y: [[1, 0, 0], -90], '-y': [[1, 0, 0], 90] };

/** Turns a +Z part so that +Z points along `axis` ('x', '-y' …), spins it by `angle` about that axis, moves it to (x, y, z). */
export function placeStd(shape, p) {
  let s = shape;
  const spin = Number(p.angle) || 0;
  if (Math.abs(spin) > 1e-9) s = s.rotate(spin, [0, 0, 0], [0, 0, 1]);
  const turn = AXIS_TURN[p.axis ?? 'z'];
  if (turn) s = s.rotate(turn[1], [0, 0, 0], turn[0]);
  const at = [Number(p.x) || 0, Number(p.y) || 0, Number(p.z) || 0];
  if (at.some((v) => Math.abs(v) > 1e-12)) s = s.translate(at);
  return s;
}

/** The same placement for a point / direction (cosmetic threads). */
function placeVec(v, p, isDir) {
  const rot = (u, axis, a) => {
    const r = (a * Math.PI) / 180; const c = Math.cos(r); const s = Math.sin(r);
    const [x, y, z] = u; const [kx, ky, kz] = axis;
    const d = kx * x + ky * y + kz * z;
    return [x * c + (ky * z - kz * y) * s + kx * d * (1 - c), y * c + (kz * x - kx * z) * s + ky * d * (1 - c), z * c + (kx * y - ky * x) * s + kz * d * (1 - c)];
  };
  let u = rot(v, [0, 0, 1], Number(p.angle) || 0);
  const turn = AXIS_TURN[p.axis ?? 'z'];
  if (turn) u = rot(u, turn[0], turn[1]);
  return isDir ? u : [u[0] + (Number(p.x) || 0), u[1] + (Number(p.y) || 0), u[2] + (Number(p.z) || 0)];
}

function addBody(ctx, shape, merge) {
  if (!ctx.body) return shape;
  if (merge) return ctx.body.fuse(shape);
  return rep().makeCompound([ctx.body, shape]);
}

export function buildStdFeature(f, ctx) {
  if (f.type === 'stdPart') {
    const problem = stdProblem(f);
    if (problem) throw codeError(problem, { kind: f.kind });
    const shape = placeStd(stdShape(f), f);
    const th = stdThread(f);
    const thread = th ? { ...th, centre: placeVec(th.centre, f, false), dir: placeVec(th.dir, f, true) } : null;
    return { body: addBody(ctx, shape, f.merge), std: { designation: designation(f) }, ...(thread ? { thread } : {}) };
  }
  if (f.type === 'route') {
    const pts = routePoints(f, ctx.part.features);
    if (pts.length < 2) throw codeError('no-path');
    let r;
    try { r = routeSolid(f, ctx.part.features, stdShape); } catch (error) { throw codeError(error.code ?? 'route-failed', error.params ?? {}); }
    const bom = routeBom(f, ctx.part.features, { measured: r.measured });
    return { body: addBody(ctx, r.shape, false), route: { length: r.length, bom } };
  }
  throw codeError('unknown-feature', { type: f.type });
}
