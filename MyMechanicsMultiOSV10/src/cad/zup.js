// Turning a project from the old Y-up frame to Z up (frame.js): every value that is absolute in world space
// — or in a part's own coordinates, which turn the same way — is mapped by R = +90° about X, (x, y, z) → (x, −z, y).
// Sketches stay as they are: the standard planes they sit on turn with R (front XY → XZ, top XZ → XY), so a
// sketched feature lands exactly where R puts it.
//
//   axis names       'x' → 'x', 'y' → 'z', 'z' → '−y' (a reverse flag is toggled, an angle or a spacing negated,
//                    or the signed name '-y' is used where the feature takes one)
//   3-vectors        points, directions, offsets, face / edge signatures, mate references, light positions,
//                    the camera → R·v
//   placements       component rotations and positions, lock / gear captures → R·M·Rᵀ
//   Euler angles     a coordinate system's rx, ry, rz → the angles of R·Rot (its axes turn with the model)
//   imported bodies  (BREP text in the old frame) are turned when they are built (`turnX`)
// A project that has `up: 'z'` is left alone; migrateProject() marks the ones it turns. No DOM, no kernel.
import { toZUp, toYUp } from './frame.js';

const LETTERS = ['x', 'y', 'z'];
const isVec = (v) => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x));
const num = (v, d = 0) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);

/** The turn to Z up (dir 1) or back to Y up (dir −1): vectors, axis names, quaternions, Euler angles. */
export function turnOf(dir = 1) {
  const v = dir > 0 ? toZUp : toYUp;
  const s = Math.SQRT1_2;
  const qr = [dir > 0 ? s : -s, 0, 0, s];
  const mul = (a, b) => {
    const [ax, ay, az, aw] = a; const [bx, by, bz, bw] = b;
    return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
  };
  const conj = (q) => [-q[0], -q[1], -q[2], q[3]];
  const clean = (x) => (Math.abs(x) < 1e-12 ? 0 : Math.round(x * 1e12) / 1e12);
  const seen = new WeakSet();
  return {
    dir,
    /** True the first time an object is seen (objects shared by several mates or features are turned once). */
    first: (o) => (seen.has(o) ? false : (seen.add(o), true)),
    v: (p) => (isVec(p) ? v(p).map((x) => (Object.is(x, -0) ? 0 : x)) : p),
    /** Axis name (optionally signed, '-y') → { letter, negative, name (signed) } in the new frame. */
    axis(name) {
      const text = String(name ?? '');
      const neg = text.startsWith('-');
      const letter = text.replace(/^[-+]/, '');
      const i = LETTERS.indexOf(letter);
      if (i < 0) return null;
      const e = [0, 0, 0]; e[i] = neg ? -1 : 1;
      const w = v(e);
      const j = w.findIndex((x) => Math.abs(x) > 0.5);
      const negative = w[j] < 0;
      return { letter: LETTERS[j], negative, name: `${negative ? '-' : ''}${LETTERS[j]}` };
    },
    /** Component index i of the old frame → { index, sign } in the new one. */
    index(i) { const e = [0, 0, 0]; e[i] = 1; const w = v(e); const j = w.findIndex((x) => Math.abs(x) > 0.5); return { index: j, sign: Math.sign(w[j]) }; },
    q: (q) => (Array.isArray(q) && q.length === 4 ? mul(mul(qr, q), conj(qr)).map(clean) : q),
    /** Euler angles (degrees, about x then y then z) of a frame whose axes turn with the model: angles of T·Rot. */
    euler(rx, ry, rz) {
      const r = (d) => (d * Math.PI) / 180;
      const rot = (p) => {
        let [x, y, z] = p;
        let c = Math.cos(r(rx)); let sn = Math.sin(r(rx)); [y, z] = [y * c - z * sn, y * sn + z * c];
        c = Math.cos(r(ry)); sn = Math.sin(r(ry)); [x, z] = [x * c + z * sn, -x * sn + z * c];
        c = Math.cos(r(rz)); sn = Math.sin(r(rz)); [x, y] = [x * c - y * sn, x * sn + y * c];
        return [x, y, z];
      };
      // Columns of M = T·Rot.
      const cols = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((e) => v(rot(e)));
      const M = (i, j) => cols[j][i];
      const deg = (a) => clean((a * 180) / Math.PI);
      const sy = -M(2, 0);
      if (Math.abs(sy) < 0.999999) return [deg(Math.atan2(M(2, 1), M(2, 2))), deg(Math.asin(sy)), deg(Math.atan2(M(1, 0), M(0, 0)))];
      // Gimbal lock (ry = ±90°): rx and rz turn about the same axis; all of it goes to rx.
      return [deg(Math.atan2(-M(1, 2), M(1, 1))), deg(Math.sign(sy) * Math.PI / 2), 0];
    },
  };
}

// ───────────────────────── signatures and references (anywhere inside a feature)

/** Turns face / edge signatures, face plane references and mate-style entities found anywhere in `node`. */
export function turnRefs(node, T, skip = new Set()) {
  if (!node || typeof node !== 'object' || !T.first(node)) return;
  if (Array.isArray(node)) { for (const x of node) turnRefs(x, T); return; }
  // An edge signature { type, mid, dir, length, start, end }.
  if (isVec(node.mid) && isVec(node.dir)) {
    for (const k of ['mid', 'dir', 'start', 'end']) if (isVec(node[k])) node[k] = T.v(node[k]);
    return;
  }
  // A face signature { type, center, normal, area, radius }.
  if (typeof node.type === 'string' && isVec(node.center) && isVec(node.normal)) {
    node.center = T.v(node.center); node.normal = T.v(node.normal);
    return;
  }
  // A plane on a face { kind: 'face', sig, origin, xDir }.
  if (node.kind === 'face') for (const k of ['origin', 'xDir']) if (isVec(node[k])) node[k] = T.v(node[k]);
  // Mate references, motor references, world refs { kind: 'plane' | 'axis' | 'point', point, dir, sig }.
  if ((node.kind === 'plane' || node.kind === 'axis' || node.kind === 'point') && (isVec(node.point) || isVec(node.dir))) {
    for (const k of ['point', 'dir']) if (isVec(node[k])) node[k] = T.v(node[k]);
  }
  for (const [k, x] of Object.entries(node)) if (!skip.has(k) && x && typeof x === 'object') turnRefs(x, T);
}

// ───────────────────────── features

/**
 * Turns one feature (or a feature's default values) in place. Returns the scalar field moves it made
 * ([{ from, to, sign }]) so equations and configuration values that drive those fields can follow.
 */
export function turnFeature(f, T) {
  const moves = [];
  if (!f || typeof f !== 'object') return moves;
  const has = (k) => Object.prototype.hasOwnProperty.call(f, k);
  /** Three scalar fields that make a vector (dx, dy, dz …). */
  const triple = (keys) => {
    if (!keys.some(has)) return;
    const w = T.v(keys.map((k) => num(f[k])));
    keys.forEach((k, j) => {
      f[k] = w[j];
      // Which old field lands here, and with which sign (for equations and configurations).
      const from = [0, 1, 2].find((i) => T.index(i).index === j);
      moves.push({ from: keys[from], to: k, sign: T.index(from).sign });
    });
  };
  const negate = (k) => { if (has(k) && Number.isFinite(Number(f[k]))) { f[k] = -Number(f[k]); moves.push({ from: k, to: k, sign: -1 }); } };
  /** A plain axis letter (x / y / z) whose flip is taken by `onFlip`; signed names stay signed. */
  const letter = (k, onFlip) => {
    if (!has(k) || typeof f[k] !== 'string') return;
    const a = T.axis(f[k]);
    if (!a) return;
    if (f[k].startsWith('-')) { f[k] = a.name; return; }
    f[k] = a.letter;
    if (a.negative) onFlip();
  };
  /** A signed axis name ('-y' allowed). */
  const signed = (k) => { if (has(k) && typeof f[k] === 'string') { const a = T.axis(f[k]); if (a) f[k] = a.name; } };
  const axisRef = (k, flipKey) => {
    const r = f[k];
    if (!r || r.kind !== 'axis' || typeof r.axis !== 'string') return;
    const a = T.axis(r.axis);
    if (!a) return;
    if (r.axis.startsWith('-')) { r.axis = a.name; return; }
    r.axis = a.letter;
    if (a.negative) f[flipKey] = !f[flipKey];
  };

  turnRefs(f, T, new Set(['entities', 'constraints', 'exprs']));
  switch (f.type) {
    case 'import': if (f.brep) f.turnX = num(f.turnX) + 90 * T.dir; break;
    case 'linearPattern': axisRef('direction', 'reverse'); axisRef('direction2', 'reverse2'); break;
    case 'circularPattern': axisRef('axis', 'reverse'); break;
    case 'moveBody': case 'insertPart': triple(['dx', 'dy', 'dz']); letter('axis', () => negate('angle')); break;
    case 'partingLine': signed('dir'); break;
    case 'toolingSplit': {
      const key = f.dir ?? 'y';
      const a = T.axis(String(key).replace(/^[-+]/, ''));
      signed('dir');
      if (a?.negative) negate('height');
      break;
    }
    case 'flex': signed('axis'); signed('toward'); break;
    case 'deform': triple(['x', 'y', 'z']); signed('dir'); break;
    case 'refAxis': signed('axis'); triple(['x1', 'y1', 'z1']); triple(['x2', 'y2', 'z2']); break;
    case 'refPoint': triple(['x', 'y', 'z']); break;
    case 'coordSys': {
      triple(['x', 'y', 'z']);
      if (['rx', 'ry', 'rz'].some(has)) [f.rx, f.ry, f.rz] = T.euler(num(f.rx), num(f.ry), num(f.rz));
      break;
    }
    case 'tablePattern': if (!f.cs && Array.isArray(f.points)) f.points = f.points.map((p) => T.v(p)); break;
    case 'variablePattern': letter('axis', () => negate('spacing')); break;
    case 'curveXYZ': case 'sketch3d': case 'surfaceSpline': if (Array.isArray(f.points)) f.points = f.points.map((p) => T.v(p)); break;
    case 'ruledSurface': letter('axis', () => { if ((f.mode ?? 'tangent') === 'vector') f.reverse = !f.reverse; }); break;
    default: break;
  }
  return moves;
}

/** −(expr), without stacking −(−(…)). */
const negateExpr = (e) => { const m = /^-\((.*)\)$/.exec(String(e).trim()); return m ? m[1] : `-(${e})`; };

/** Equations (feature.exprs) and configuration values that drive a moved field follow it. */
function followMoves(part, f, moves) {
  const real = moves.filter((m) => m.from !== m.to || m.sign < 0);
  if (!real.length) return;
  if (f.exprs && typeof f.exprs === 'object') {
    const old = { ...f.exprs };
    for (const m of real) if (m.from in old) delete f.exprs[m.from];
    for (const m of real) if (m.from in old) f.exprs[m.to] = m.sign < 0 ? negateExpr(old[m.from]) : old[m.from];
  }
  for (const c of part.configurations ?? []) {
    if (!c?.values) continue;
    const old = { ...c.values };
    for (const m of real) if (`${f.id}.${m.from}` in old) delete c.values[`${f.id}.${m.from}`];
    for (const m of real) {
      const k = `${f.id}.${m.from}`;
      if (k in old) c.values[`${f.id}.${m.to}`] = m.sign < 0 && Number.isFinite(Number(old[k])) ? -Number(old[k]) : old[k];
    }
  }
}

export function turnPart(part, T) {
  for (const f of part.features ?? []) followMoves(part, f, turnFeature(f, T));
}

// ───────────────────────── assemblies, drawings, the project

const turnPlacement = (p, T) => { if (!p || !T.first(p)) return; if (isVec(p.position)) p.position = T.v(p.position); if (Array.isArray(p.rotation)) p.rotation = T.q(p.rotation); };

export function turnAssembly(asm, T) {
  for (const c of asm.components ?? []) turnPlacement(c, T);
  for (const m of asm.mates ?? []) {
    for (const k of ['a', 'b', 'c', 'd']) if (m[k]) turnRefs(m[k], T);
    if (m.relative) turnPlacement(m.relative, T);
    // A cam mate's outline: points in the cam part's own frame.
    if (Array.isArray(m.profile)) m.profile = m.profile.map((q) => T.v(q));
    if (m.base) {
      for (const k of ['a', 'b']) if (Array.isArray(m.base[k])) m.base[k] = T.q(m.base[k]);
      for (const k of ['pa', 'pb']) if (isVec(m.base[k])) m.base[k] = T.v(m.base[k]);
    }
  }
  for (const s of asm.explode?.steps ?? []) if (isVec(s.dir)) s.dir = T.v(s.dir);
  for (const motor of asm.motion?.motors ?? []) if (motor.ref) turnRefs(motor.ref, T);
  for (const p of asm.patterns ?? []) {
    for (const k of ['dir', 'dir2']) if (isVec(p[k])) p[k] = T.v(p[k]);
    if (p.axis && T.first(p.axis)) for (const k of ['point', 'dir']) if (isVec(p.axis[k])) p.axis[k] = T.v(p.axis[k]);
    if (p.plane && T.first(p.plane)) for (const k of ['point', 'normal']) if (isVec(p.plane[k])) p.plane[k] = T.v(p.plane[k]);
    // The part's own symmetry axis (0 x, 1 y, 2 z) turns too.
    if (p.localAxes) for (const id of Object.keys(p.localAxes)) { const k = p.localAxes[id]; if (k >= 0 && k <= 2) p.localAxes[id] = T.index(k).index; }
    if (typeof p.localAxis === 'number' && p.localAxis >= 0) p.localAxis = T.index(p.localAxis).index;
    if (['x', 'y', 'z'].includes(p.orientation)) p.orientation = T.axis(p.orientation).letter;
  }
}

export function turnDrawing(d, T) {
  for (const v of d.views ?? []) {
    if (v.plane && T.first(v.plane)) for (const k of ['point', 'normal']) if (isVec(v.plane[k])) v.plane[k] = T.v(v.plane[k]);
    for (const k of ['dir', 'x', 'up']) if (isVec(v[k])) v[k] = T.v(v[k]);
  }
}

/** Turns a whole project (in place) by T, whatever its `up` says. */
export function turnProject(project, T) {
  for (const part of project.parts ?? []) turnPart(part, T);
  for (const asm of project.assemblies ?? []) turnAssembly(asm, T);
  for (const d of project.drawings ?? []) turnDrawing(d, T);
  const cam = project.camera;
  if (cam) for (const k of ['target', 'dir', 'up']) if (isVec(cam[k])) cam[k] = T.v(cam[k]);
  for (const l of project.lights?.lights ?? []) for (const k of ['position', 'target']) if (isVec(l[k])) l[k] = T.v(l[k]);
  return project;
}

/** True when the project is already in the Z-up frame. */
export const isZUp = (project) => project?.up === 'z';

/**
 * A project made before Z up (no `up: 'z'`) turned to Z up, in place, and marked; a Z-up project is returned
 * unchanged (so this can run on every open).
 */
export function migrateProject(project) {
  if (!project || isZUp(project)) return project;
  turnProject(project, turnOf(1));
  project.up = 'z';
  return project;
}

/** A feature's default values in the Y-up frame (for the sample builders, which are written Y up). */
export function yUpDefaults(defaults) {
  turnFeature(defaults, turnOf(-1));
  return defaults;
}
