// Motion studies beyond motors driving mates:
//   keyframe animation — component placements kept at times (keys) and played in between (straight or eased
//     moves, turns along the shortest way);
//   motion analysis (physics) — the components are rigid bodies with their real mass, centre of mass and inertia
//     tensor; gravity, springs and dampers between components act on them, motors drive theirs along the
//     prescribed path, and the mates hold as constraints. Each step: forces → unconstrained velocities →
//     velocities projected onto the mates (impulses, mass-weighted) → positions → positions projected back onto
//     the mates (mass-weighted Newton). The constraint impulses give the reaction forces of the mates and the
//     force or torque each motor needs. Results per frame: placements, and for plots each body's centre of mass
//     displacement, speed and acceleration, spring forces, mate reaction forces and motor torques / forces.
// Units: mm, kg, s (forces in kg·mm/s² inside; reported in N and N·mm).
import {
  mateResiduals, worldEntity, requiredRefs, needsGeometry, captureMate, motorPlacement,
  placePoint, rotate, quatMultiply, quatConjugate, quatFromRotvec, quatNormalize,
} from './assembly.js';
import { solveLinear } from './solver.js';

const REF_KEYS = ['a', 'b', 'c', 'd'];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const num = (v, d) => (v == null || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
const COUPLED = ['gear', 'rackPinion', 'screw', 'linearCoupler', 'universalJoint'];

// ───────────────────────── keyframes

/** Spherical interpolation of unit quaternions (the shorter way). */
export function quatSlerp(a, b, s) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (d < 0) { d = -d; bb = b.map((v) => -v); }
  if (d > 0.9995) return quatNormalize(a.map((v, i) => v + (bb[i] - v) * s));
  const th = Math.acos(Math.min(1, d));
  const k0 = Math.sin((1 - s) * th) / Math.sin(th); const k1 = Math.sin(s * th) / Math.sin(th);
  return quatNormalize(a.map((v, i) => v * k0 + bb[i] * k1));
}

/**
 * The placements of a keyframe animation at time t: `assembly.motion.keys` = [{ time, ease ('linear' |
 * 'smooth'), poses: { compId: { position, rotation } } }]. Between two keys that hold a component it moves from
 * one to the other (eased when the later key says so); before the first / after the last it stays; a component
 * no key holds stays where it is. Returns Map compId → placement.
 */
export function keyframePose(assembly, time) {
  const keys = [...(assembly.motion?.keys ?? [])].sort((p, q) => p.time - q.time);
  const out = new Map();
  for (const c of assembly.components ?? []) {
    const held = keys.filter((k) => k.poses?.[c.id]);
    let pl = { position: [...c.position], rotation: [...c.rotation] };
    if (held.length) {
      const i = held.findIndex((k) => k.time > time);
      if (i === 0) pl = clonePl(held[0].poses[c.id]);
      else if (i < 0) pl = clonePl(held[held.length - 1].poses[c.id]);
      else {
        const k0 = held[i - 1]; const k1 = held[i];
        let s = (time - k0.time) / Math.max(1e-9, k1.time - k0.time);
        if (k1.ease === 'smooth') s = s * s * (3 - 2 * s);
        const p0 = k0.poses[c.id]; const p1 = k1.poses[c.id];
        pl = { position: p0.position.map((v, j) => v + (p1.position[j] - v) * s), rotation: quatSlerp(p0.rotation, p1.rotation, s) };
      }
    }
    out.set(c.id, pl);
  }
  return out;
}
const clonePl = (p) => ({ position: [...p.position], rotation: [...p.rotation] });

/** A key of the current placements at `time` (replacing a key at the same time). Returns the key. */
export function captureKey(assembly, time, ease = 'linear') {
  assembly.motion ??= { duration: 5, motors: [] };
  const keys = (assembly.motion.keys ??= []);
  const poses = {};
  for (const c of assembly.components) if (!c.suppressed) poses[c.id] = clonePl(c);
  const key = { time: Math.max(0, Number(time) || 0), ease, poses };
  const i = keys.findIndex((k) => Math.abs(k.time - key.time) < 1e-6);
  if (i >= 0) keys[i] = key; else keys.push(key);
  keys.sort((p, q) => p.time - q.time);
  return key;
}

// ───────────────────────── mass properties

/**
 * Mass properties of a solid (needs the kernel): density in kg/m³ → { mass (kg), com (mm), I: 3×3 inertia tensor
 * about the centre of mass in the solid's frame (kg·mm²) }. The products of inertia come from moments about the
 * diagonal axes (I about n = nᵀ I n).
 */
export function inertiaOf(R, shape, density) {
  const oc = R.getOC();
  const props = new oc.GProp_GProps();
  try {
    oc.BRepGProp.VolumeProperties(shape.wrapped, props, false, false, false);
    const vol = props.Mass();
    const c = props.CentreOfMass();
    const com = [c.X(), c.Y(), c.Z()];
    const mom = (d) => { const dir = new oc.gp_Dir(...d); const ax = new oc.gp_Ax1(c, dir); try { return props.MomentOfInertia(ax); } finally { ax.delete(); dir.delete(); } };
    const ixx = mom([1, 0, 0]); const iyy = mom([0, 1, 0]); const izz = mom([0, 0, 1]);
    const ixy = mom([1, 1, 0]) - (ixx + iyy) / 2; const ixz = mom([1, 0, 1]) - (ixx + izz) / 2; const iyz = mom([0, 1, 1]) - (iyy + izz) / 2;
    const rho = (Number(density) || 1000) * 1e-9; // kg/mm³
    c.delete?.();
    return { mass: vol * rho, com, I: [[ixx, ixy, ixz], [ixy, iyy, iyz], [ixz, iyz, izz]].map((r) => r.map((v) => v * rho)) };
  } finally { props.delete(); }
}

/** Several bodies' mass properties (each in a placement in the common frame) as one (parallel axis theorem). */
export function combineInertia(list) {
  let mass = 0; const com = [0, 0, 0];
  const placed = list.filter((x) => x && x.mass > 0).map((x) => {
    const pl = x.placement ?? { position: [0, 0, 0], rotation: [0, 0, 0, 1] };
    const c = placePoint(pl, x.com);
    const R = rotMatrix(pl.rotation);
    return { mass: x.mass, c, I: mul3(mul3(R, x.I), transpose3(R)) };
  });
  for (const p of placed) { mass += p.mass; for (let i = 0; i < 3; i++) com[i] += p.c[i] * p.mass; }
  if (!(mass > 0)) return { mass: 0, com: [0, 0, 0], I: [[0, 0, 0], [0, 0, 0], [0, 0, 0]] };
  for (let i = 0; i < 3; i++) com[i] /= mass;
  const I = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of placed) {
    const d = sub(p.c, com); const dd = dot(d, d);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) I[i][j] += p.I[i][j] + p.mass * ((i === j ? dd : 0) - d[i] * d[j]);
  }
  return { mass, com, I };
}

function rotMatrix(q) {
  const ex = rotate(q, [1, 0, 0]); const ey = rotate(q, [0, 1, 0]); const ez = rotate(q, [0, 0, 1]);
  return [[ex[0], ey[0], ez[0]], [ex[1], ey[1], ez[1]], [ex[2], ey[2], ez[2]]];
}
const transpose3 = (A) => [[A[0][0], A[1][0], A[2][0]], [A[0][1], A[1][1], A[2][1]], [A[0][2], A[1][2], A[2][2]]];
const mul3 = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const mulV = (A, v) => A.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
function inv3(A) {
  const [a, b, c] = A[0]; const [d, e, f] = A[1]; const [g, h, i] = A[2];
  const co = [e * i - f * h, -(d * i - f * g), d * h - e * g];
  const det = a * co[0] + b * co[1] + c * co[2];
  if (Math.abs(det) < 1e-30) return [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  return [
    [co[0] / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [co[1] / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [co[2] / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}

// ───────────────────────── motion analysis

/**
 * Runs a motion analysis on a copy of the assembly. `bodies`: Map compId → { mass (kg), com (mm, in the
 * component), I (kg·mm², about the centre of mass, component axes) }; `assembly.motion`: { duration, motors,
 * gravity: { on, dir: [x,y,z], g (mm/s²) }, springs: [{ id, a: { comp, point }, b: { comp, point }, k (N/mm),
 * c (N·s/mm), length (free length, mm; default: as assembled) }], contacts: [{ id, a, b, e (restitution 0 … 1) }] }.
 * `gap(contact, placeOf)` → { gap (mm, < 0 when they overlap), pa, pb (closest points, world), n (unit, a → b) } measures a
 * contact pair (the kernel, in the app); without it contacts are left out. Returns { frames: [{ t, poses: Map }], series:
 * { t: [], bodies: { id: { disp, speed, acc } }, springs: { id: [] }, mates: { id: [] }, motors: { id: [] } }, ok }.
 */
export function simulateDynamics(assembly, { entity: entityOf = (r) => r, size = 100, bodies = new Map(), fps = 30, dt = 1 / 400, duration = null, gap = null } = {}) {
  const memo = new Map();
  const entity = (r) => { const k = JSON.stringify(r); if (!memo.has(k)) memo.set(k, entityOf(r)); return memo.get(k); };
  const asm = structuredClone(assembly);
  const motion = asm.motion ?? {};
  const T = num(duration ?? motion.duration, 5);
  const comps = asm.components.filter((c) => !c.suppressed);
  const byId = new Map(comps.map((c) => [c.id, c]));
  const p0 = new Map(comps.map((c) => [c.id, clonePl(c)]));
  const motors = (motion.motors ?? []).map((m) => ({ m, comp: byId.get(m.comp), local: m.ref ? entity(m.ref) : null })).filter((x) => x.comp && x.local);
  const motorOf = new Map(motors.map((x) => [x.comp.id, x]));
  for (const x of motors) x.parent = x.m.parent && x.m.parent !== x.comp.id ? byId.get(x.m.parent) ?? null : null;
  // Where a motor puts its component at time t: its own turn / travel, carried along by the part it is mounted on.
  const motorWant = (x, t) => {
    const own = motorPlacement(x.m, p0.get(x.comp.id), x.local, t);
    if (!x.parent) return own;
    const from = p0.get(x.parent.id); const to = x.parent;
    const q = quatNormalize(quatMultiply(to.rotation, quatConjugate(from.rotation)));
    const tr = sub(to.position, rotate(q, from.position));
    return { position: add(rotate(q, own.position), tr), rotation: quatNormalize(quatMultiply(q, own.rotation)) };
  };
  // Dynamic bodies: every component that is not fixed (motor components too: their path is a constraint).
  const dyn = comps.filter((c) => !c.fixed || motorOf.has(c.id));
  const n = dyn.length;
  const index = new Map(dyn.map((c, i) => [c.id, i]));
  const props = dyn.map((c) => {
    const b = bodies.get(c.id);
    const mass = b?.mass > 0 ? b.mass : 1e-3;
    const I = b?.I ?? [[mass * 100, 0, 0], [0, mass * 100, 0], [0, 0, mass * 100]];
    return { mass, com: b?.com ?? [0, 0, 0], I };
  });
  const K = Math.max(1, size / 4);
  const mates = asm.mates.filter((m) => !m.suppressed && requiredRefs(m.type).every((k) => m[k] && byId.has(m[k].comp) && (!needsGeometry(m.type) || entity(m[k]))));
  const g = motion.gravity?.on === false ? [0, 0, 0] : scale(normalizeOr(motion.gravity?.dir, [0, 0, -1]), num(motion.gravity?.g, 9806.65));
  const springs = (motion.springs ?? []).filter((s) => byId.has(s.a?.comp) && byId.has(s.b?.comp));
  const contacts = gap ? (motion.contacts ?? []).filter((c) => byId.has(c.a) && byId.has(c.b) && c.a !== c.b) : [];
  const contactTol = Math.max(0.01, size * 1e-4);
  for (const s of springs) if (s.length == null) s.length = norm(sub(placePoint(byId.get(s.b.comp), s.b.point), placePoint(byId.get(s.a.comp), s.a.point)));

  // State: placements (on the components), velocities of the centres of mass and angular velocities (world).
  const vel = dyn.map(() => [0, 0, 0]); const omg = dyn.map(() => [0, 0, 0]);
  const comW = (i, pl = dyn[i]) => placePoint(pl, props[i].com);
  const Iworld = (i) => { const R = rotMatrix(dyn[i].rotation); return mul3(mul3(R, props[i].I), transpose3(R)); };
  // A placement moved by δ (6 per body: CoM shift, rotation vector) from `pl`.
  const moved = (i, pl, d, o) => {
    const c = placePoint(pl, props[i].com);
    const q = quatNormalize(quatMultiply(quatFromRotvec([d[o + 3], d[o + 4], d[o + 5]]), pl.rotation));
    const c1 = [c[0] + d[o], c[1] + d[o + 1], c[2] + d[o + 2]];
    return { position: sub(c1, rotate(q, props[i].com)), rotation: q };
  };
  let time = 0;
  // Constraint rows at placements δ away from now: the mates, then each motor's prescribed placement (6 rows).
  const rows = (d) => {
    const pls = dyn.map((c, i) => (d ? moved(i, c, d, i * 6) : c));
    const placeOf = (id) => { const i = index.get(id); return i == null ? byId.get(id) : pls[i]; };
    const out = [];
    for (const m of mates) {
      const e = {}; const place = {}; const st = {};
      for (const k of REF_KEYS) {
        const r = m[k];
        if (!r || !byId.has(r.comp)) { e[k] = null; continue; }
        place[k] = placeOf(r.comp); st[k] = place[k];
        const local = needsGeometry(m.type) ? entity(r) : null;
        e[k] = local ? worldEntity(local, place[k]) : null;
      }
      for (const v of mateResiduals(m, e, K, place, st)) out.push(Number.isFinite(v) ? v : 0);
    }
    // A motor drives one freedom of its component: the turn about (or the travel along) its axis, from where the
    // motor puts it; the mates hold the rest. Its multiplier is the torque (force) the motor gives.
    for (const x of motors) {
      const i = index.get(x.comp.id);
      const want = x.want;
      const pl = pls[i];
      const axis = normalizeOr(rotate(want.rotation, x.local.dir), [0, 0, 1]);
      if (x.m.kind === 'linear') out.push(dot(sub(placePoint(pl, props[i].com), placePoint(want, props[i].com)), axis));
      else {
        const qe = quatNormalize(quatMultiply(pl.rotation, quatConjugate(want.rotation)));
        const sg = qe[3] < 0 ? -1 : 1;
        out.push(2 * sg * (qe[0] * axis[0] + qe[1] * axis[1] + qe[2] * axis[2]));
      }
    }
    return out;
  };
  const jac = (r0) => {
    const h = 1e-6;
    const J = r0.map(() => new Array(6 * n).fill(0));
    const d = new Array(6 * n).fill(0);
    for (let j = 0; j < 6 * n; j++) {
      d[j] = h; const r1 = rows(d); d[j] = 0;
      for (let i = 0; i < r0.length; i++) J[i][j] = (r1[i] - r0[i]) / h;
    }
    return J;
  };
  // M⁻¹ applied to a 6n vector, body by body (linear: 1/m, angular: I⁻¹ in world axes).
  const Minv = () => dyn.map((_, i) => ({ m: 1 / props[i].mass, I: inv3(Iworld(i)) }));
  const applyMinv = (mi, v) => { const out = new Array(6 * n); for (let i = 0; i < n; i++) { const o = i * 6; for (let k = 0; k < 3; k++) out[o + k] = v[o + k] * mi[i].m; const w = mulV(mi[i].I, [v[o + 3], v[o + 4], v[o + 5]]); out[o + 3] = w[0]; out[o + 4] = w[1]; out[o + 5] = w[2]; } return out; };
  // Solves (J M⁻¹ Jᵀ + εI) λ = b (redundant mates: the small ε keeps it solvable).
  const project = (J, mi, b) => {
    const r = J.length;
    if (!r) return { dv: new Array(6 * n).fill(0), lambda: [] };
    const MJt = []; // columns M⁻¹ Jᵢᵀ
    for (let i = 0; i < r; i++) MJt.push(applyMinv(mi, J[i]));
    const A = [];
    let tr = 0;
    for (let i = 0; i < r; i++) { A.push(new Array(r)); for (let j = 0; j < r; j++) { let s = 0; for (let k = 0; k < 6 * n; k++) s += J[i][k] * MJt[j][k]; A[i][j] = s; } tr += A[i][i]; }
    // Scaled to unit diagonal (rows of very different sizes: the turn of a light body next to the move of a heavy
    // one) and regularised a little: mates often give more rows than freedoms they take (redundant rows).
    const D = A.map((row, i) => (row[i] > 0 ? 1 / Math.sqrt(row[i]) : 0));
    for (let i = 0; i < r; i++) for (let j = 0; j < r; j++) A[i][j] *= D[i] * D[j];
    const solveWith = (eps) => solveLinear(A.map((row, i) => row.map((v, j) => v + (i === j ? eps + (D[i] ? 0 : 1) : 0))), b.map((v, i) => v * D[i]));
    const y = solveWith(1e-12) ?? solveWith(1e-8) ?? solveWith(1e-4) ?? new Array(r).fill(0);
    const lambda = y.map((v, i) => v * D[i]);
    const dv = new Array(6 * n).fill(0);
    for (let i = 0; i < r; i++) for (let k = 0; k < 6 * n; k++) dv[k] += MJt[i][k] * lambda[i];
    return { dv, lambda };
  };
  const gapOf = (ct) => { try { return gap(ct, (id) => byId.get(id)); } catch { return null; } };
  // The points a contact touches at (all the kernel's closest pairs: a face resting on a face gives its corners).
  const pointsOf = (g) => g.points?.length ? g.points : [{ pa: g.pa, pb: g.pb }];
  const contactRow = (ct, g, pt = pointsOf(g)[0]) => {
    const row = new Array(6 * n).fill(0);
    for (const [id, p, sg] of [[ct.a, pt.pa, -1], [ct.b, pt.pb, 1]]) {
      const i = index.get(id);
      if (i == null) continue;
      const r = sub(p, comW(i)); const rn = cross(r, g.n);
      for (let k = 0; k < 3; k++) { row[i * 6 + k] = sg * g.n[k]; row[i * 6 + 3 + k] = sg * rn[k]; }
    }
    return row;
  };
  const rowDot = (row, v) => { let t = 0; for (let k = 0; k < row.length; k++) t += row[k] * v[k]; return t; };
  const springForces = () => springs.map((s) => {
    const A = byId.get(s.a.comp); const B = byId.get(s.b.comp);
    const pa = placePoint(A, s.a.point); const pb = placePoint(B, s.b.point);
    const d = sub(pb, pa); const L = norm(d) || 1e-9; const u = scale(d, 1 / L);
    const velAt = (c, p) => { const i = index.get(c.id); if (i == null) return [0, 0, 0]; return add(vel[i], cross(omg[i], sub(p, comW(i)))); };
    const vrel = dot(sub(velAt(B, pb), velAt(A, pa)), u);
    const F = (num(s.k, 1) * (L - num(s.length, L)) + num(s.c, 0) * vrel) * 1000; // N → kg·mm/s²
    return { s, A, B, pa, pb, u, F };
  });

  const frames = []; const series = { t: [], bodies: {}, springs: {}, mates: {}, motors: {} };
  for (const c of dyn) series.bodies[c.id] = { disp: [], speed: [], acc: [] };
  for (const s of springs) series.springs[s.id] = [];
  for (const m of mates) series.mates[m.id] = [];
  for (const x of motors) series.motors[x.m.id] = [];
  series.contacts = {};
  for (const c of contacts) series.contacts[c.id] = [];
  let lastContact = new Map();
  // A contact's largest force since the last frame (an impact lasts one step, between frames).
  const contactPeak = new Map();
  const approach = new Map();
  const com0 = dyn.map((_, i) => comW(i));
  let lastV = dyn.map(() => [0, 0, 0]);
  let lastLambda = []; let lastJ = [];
  const record = (t) => {
    frames.push({ t, poses: new Map(comps.map((c) => [c.id, clonePl(c)])) });
    series.t.push(t);
    dyn.forEach((c, i) => {
      series.bodies[c.id].disp.push(norm(sub(comW(i), com0[i])));
      series.bodies[c.id].speed.push(norm(vel[i]));
      series.bodies[c.id].acc.push(norm(sub(vel[i], lastV[i])) / Math.max(1e-9, dt));
    });
    for (const f of springForces()) series.springs[f.s.id].push(f.F / 1000);
    // Reaction of each mate: the generalised force its rows put on the bodies (largest body force, N).
    let row = 0;
    for (const m of mates) {
      const nr = rows0Count.get(m.id) ?? 0;
      let best = 0;
      for (let i = 0; i < n; i++) {
        const f = [0, 0, 0];
        for (let r = row; r < row + nr; r++) for (let k = 0; k < 3; k++) f[k] += (lastJ[r]?.[i * 6 + k] ?? 0) * (lastLambda[r] ?? 0);
        best = Math.max(best, norm(f));
      }
      series.mates[m.id].push(best / dt / 1000);
      row += nr;
    }
    // The motor rows come after the mates' (one each): impulse / step → torque (N·mm) or force (N).
    motors.forEach((x, j) => { series.motors[x.m.id].push((lastLambda[row + j] ?? 0) / dt / 1000); });
    for (const c of contacts) series.contacts[c.id].push(Math.max(contactPeak.get(c.id) ?? 0, lastContact.get(c.id) ?? 0) / dt / 1000);
    contactPeak.clear();
  };
  // Rows per mate (the same every step).
  const rows0Count = new Map();
  {
    for (const x of motors) x.want = motorWant(x, 0);
    for (const m of mates) {
      const e = {}; const place = {};
      for (const k of REF_KEYS) { const r = m[k]; if (!r || !byId.has(r.comp)) { e[k] = null; continue; } place[k] = byId.get(r.comp); const local = needsGeometry(m.type) ? entity(r) : null; e[k] = local ? worldEntity(local, place[k]) : null; }
      const c = mateResiduals(m, e, K, place, place).length;
      rows0Count.set(m.id, c);
    }
  }
  record(0);
  const frameDt = 1 / fps;
  let nextFrame = frameDt;
  const steps = Math.ceil(T / dt);
  let ok = true;
  for (let step = 1; step <= steps; step++) {
    const h = Math.min(dt, T - time);
    if (h <= 1e-12) break;
    const t1 = time + h;
    for (const m of mates) if (COUPLED.includes(m.type)) captureMate(asm, m);
    for (const x of motors) x.want = motorWant(x, t1);
    // 1. Forces → unconstrained velocities.
    const F = dyn.map((_, i) => scale(g, props[i].mass)); const Tq = dyn.map(() => [0, 0, 0]);
    for (const f of springForces()) {
      const ia = index.get(f.A.id); const ib = index.get(f.B.id);
      if (ia != null) { F[ia] = add(F[ia], scale(f.u, f.F)); Tq[ia] = add(Tq[ia], cross(sub(f.pa, comW(ia)), scale(f.u, f.F))); }
      if (ib != null) { F[ib] = add(F[ib], scale(f.u, -f.F)); Tq[ib] = add(Tq[ib], cross(sub(f.pb, comW(ib)), scale(f.u, -f.F))); }
    }
    lastV = vel.map((v) => [...v]);
    const v6 = new Array(6 * n);
    for (let i = 0; i < n; i++) {
      const Iw = Iworld(i); const Ii = inv3(Iw);
      const gyro = cross(omg[i], mulV(Iw, omg[i]));
      const a = scale(F[i], 1 / props[i].mass); const al = mulV(Ii, sub(Tq[i], gyro));
      const v = add(vel[i], scale(a, h)); const w = add(omg[i], scale(al, h));
      v6.splice(i * 6, 6, ...v, ...w);
    }
    // 2. Velocities onto the mates: J v = −φ / h (the motors' rows bring their components onto their path).
    const mi = Minv();
    const r0 = rows(null); const J = jac(r0);
    const b = r0.map((phi, i) => { let s = 0; for (let k = 0; k < 6 * n; k++) s += J[i][k] * v6[k]; return -s - phi / h; });
    // Contacts: bodies touching (or overlapping) may not move into each other; they bounce back with their
    // restitution and only push (a contact that would pull is let go and the rest solved again).
    // A pair that would close the gap within this step is stopped where it touches (no tunnelling through a thin
    // part); the speed it came with is kept for the bounce the step after.
    // It stops a little short of touching (half the contact tolerance): solids that touch exactly have no closest
    // points to give a normal from.
    let use = [];
    for (const ct of contacts) {
      const gg = gapOf(ct);
      if (!gg) continue;
      const rows1 = pointsOf(gg).map((pt) => contactRow(ct, gg, pt));
      const vns = rows1.map((row) => rowDot(row, v6));
      const vn = Math.min(...vns);
      if (gg.gap > contactTol) {
        if (gg.gap + vn * h >= 0.5 * contactTol) { approach.delete(ct.id); continue; }
        approach.set(ct.id, Math.min(vn, approach.get(ct.id) ?? 0));
        rows1.forEach((row) => use.push({ ct, g: gg, row, target: -(gg.gap - 0.5 * contactTol) / h }));
        continue;
      }
      if (vn > 1e-9 && gg.gap > 0) continue;
      const vin = Math.min(vn, approach.get(ct.id) ?? vn);
      approach.delete(ct.id);
      // (an overlap left is pushed out by the position step below, not by speed: that would add energy)
      rows1.forEach((row) => use.push({ ct, g: gg, row, target: vin < -1 ? -num(ct.e, 0) * vin : 0 }));
    }
    let sol = null;
    for (let pass = 0; pass < 6; pass++) {
      const Jall = [...J, ...use.map((x) => x.row)];
      const ball = [...b, ...use.map((x) => x.target - rowDot(x.row, v6))];
      sol = project(Jall, mi, ball);
      const drop = use.filter((x, k) => sol.lambda[J.length + k] < -1e-12);
      if (!drop.length) break;
      use = use.filter((x) => !drop.includes(x));
    }
    const { dv, lambda } = sol;
    for (let k = 0; k < 6 * n; k++) v6[k] += dv[k];
    lastJ = J; lastLambda = lambda.slice(0, J.length);
    lastContact = new Map();
    use.forEach((x, k) => lastContact.set(x.ct.id, (lastContact.get(x.ct.id) ?? 0) + (lambda[J.length + k] ?? 0)));
    for (const [id, v] of lastContact) contactPeak.set(id, Math.max(contactPeak.get(id) ?? 0, v));
    // 3. Positions.
    for (let i = 0; i < n; i++) {
      const o = i * 6;
      vel[i] = [v6[o], v6[o + 1], v6[o + 2]]; omg[i] = [v6[o + 3], v6[o + 4], v6[o + 5]];
      const d = [vel[i][0] * h, vel[i][1] * h, vel[i][2] * h, omg[i][0] * h, omg[i][1] * h, omg[i][2] * h];
      Object.assign(dyn[i], moved(i, dyn[i], d, 0));
    }
    // 4. Positions back onto the mates (mass-weighted Newton steps): no drift over a long run.
    for (let it = 0; it < 3; it++) {
      const r = rows(null);
      // Bodies left overlapping are pushed apart too (the overlap as a row of its own, the first pass only).
      const over = it === 0 ? contacts.map((ct) => ({ ct, g: gapOf(ct) })).filter((x) => x.g && x.g.gap < -1e-6) : [];
      if (Math.max(0, ...r.map(Math.abs)) < 1e-9 && !over.length) break;
      const Jp = jac(r);
      const orows = over.flatMap((x) => pointsOf(x.g).map((pt) => ({ row: contactRow(x.ct, x.g, pt), v: -x.g.gap })));
      const { dv: dp } = project([...Jp, ...orows.map((x) => x.row)], Minv(), [...r.map((x) => -x), ...orows.map((x) => x.v)]);
      for (let i = 0; i < n; i++) Object.assign(dyn[i], moved(i, dyn[i], dp, i * 6));
    }
    time = t1;
    if (!dyn.every((c) => c.position.every(Number.isFinite))) { ok = false; break; }
    while (time + 1e-9 >= nextFrame && nextFrame <= T + 1e-9) { record(nextFrame); nextFrame += frameDt; }
  }
  return { frames, series, ok, duration: T };
}

function normalizeOr(v, d) { const l = v ? Math.hypot(...v) : 0; return l > 1e-12 ? v.map((x) => x / l) : d; }

/** The placements of a computed analysis at time t (between its frames: interpolated). */
export function dynamicsPose(result, time) {
  const f = result?.frames;
  if (!f?.length) return null;
  if (time <= f[0].t) return f[0].poses;
  if (time >= f[f.length - 1].t) return f[f.length - 1].poses;
  let i = 1; while (i < f.length && f[i].t < time) i++;
  const a = f[i - 1]; const b = f[i];
  const s = (time - a.t) / Math.max(1e-9, b.t - a.t);
  const out = new Map();
  for (const [id, p] of a.poses) { const q = b.poses.get(id) ?? p; out.set(id, { position: p.position.map((v, k) => v + (q.position[k] - v) * s), rotation: quatSlerp(p.rotation, q.rotation, s) }); }
  return out;
}
