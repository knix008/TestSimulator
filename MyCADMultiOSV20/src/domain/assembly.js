// FreeCAD Assembly: joints between solids. A joint ties a moving part to a
// base part at a joint frame (origin + axis, kept in the base's coordinates);
// the part keeps its pose relative to that frame, turned (revolute), slid
// (slider) or both (cylindrical) by the joint's values. Parts that are not
// moved by any joint stay where they are (grounded). Joints that close a loop
// are met by solving the free joint values; drives run joint values over time
// (animation) and couplings tie one joint value to another (gears, belts,
// rack and pinion, screws). No DOM.

export const JOINT_TYPES = ['fixed', 'revolute', 'slider', 'cylindrical', 'ball', 'distance', 'parallel', 'perpendicular', 'angle'];
/** Joints that hold only a direction or a distance (the part keeps the rest of its freedom). */
export const ORIENTING = ['distance', 'parallel', 'perpendicular', 'angle', 'ball'];

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

// Rigid transforms as 3×4 row-major [r00 r01 r02 tx, r10 … ty, r20 … tz].
const mul = (a, b) => [
  a[0] * b[0] + a[1] * b[4] + a[2] * b[8], a[0] * b[1] + a[1] * b[5] + a[2] * b[9], a[0] * b[2] + a[1] * b[6] + a[2] * b[10], a[0] * b[3] + a[1] * b[7] + a[2] * b[11] + a[3],
  a[4] * b[0] + a[5] * b[4] + a[6] * b[8], a[4] * b[1] + a[5] * b[5] + a[6] * b[9], a[4] * b[2] + a[5] * b[6] + a[6] * b[10], a[4] * b[3] + a[5] * b[7] + a[6] * b[11] + a[7],
  a[8] * b[0] + a[9] * b[4] + a[10] * b[8], a[8] * b[1] + a[9] * b[5] + a[10] * b[9], a[8] * b[2] + a[9] * b[6] + a[10] * b[10], a[8] * b[3] + a[9] * b[7] + a[10] * b[11] + a[11],
];
const inverse = (m) => {
  // Rotation transposed, translation −Rᵀt.
  const r = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]];
  const t = [m[3], m[7], m[11]];
  return [
    r[0], r[1], r[2], -(r[0] * t[0] + r[1] * t[1] + r[2] * t[2]),
    r[3], r[4], r[5], -(r[3] * t[0] + r[4] * t[1] + r[5] * t[2]),
    r[6], r[7], r[8], -(r[6] * t[0] + r[7] * t[1] + r[8] * t[2]),
  ];
};
const rotZ = (a) => { const c = Math.cos(a); const s = Math.sin(a); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]; };
const rotX = (a) => { const c = Math.cos(a); const s = Math.sin(a); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]; };
const rotY = (a) => { const c = Math.cos(a); const s = Math.sin(a); return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]; };
const moveZ = (d) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, d];
const move = (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];

/** A part's pose (rotation X → Y → Z, then the move; scale and mirror stay the part's own). */
export function poseOf(e) {
  const [cx, sx] = [Math.cos(rad(e.rx ?? 0)), Math.sin(rad(e.rx ?? 0))];
  const [cy, sy] = [Math.cos(rad(e.ry ?? 0)), Math.sin(rad(e.ry ?? 0))];
  const [cz, sz] = [Math.cos(rad(e.rz ?? 0)), Math.sin(rad(e.rz ?? 0))];
  // Rz · Ry · Rx
  return [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx, e.x ?? 0,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx, e.y ?? 0,
    -sy, cy * sx, cy * cx, e.z ?? 0,
  ];
}

const clean = (v) => { const r = Math.round(v * 1e9) / 1e9; return Object.is(r, -0) ? 0 : r; };

/** The placement fields of a pose: x, y, z, rx, ry, rz (degrees). */
export function placementOf(m) {
  let rx; let ry; let rz;
  if (Math.abs(m[8]) < 1 - 1e-12) {
    ry = Math.asin(-m[8]);
    rx = Math.atan2(m[9], m[10]);
    rz = Math.atan2(m[4], m[0]);
  } else {
    // Gimbal lock: all the turn about z.
    ry = m[8] < 0 ? Math.PI / 2 : -Math.PI / 2;
    rx = 0;
    rz = Math.atan2(-m[1], m[5]);
  }
  return { x: clean(m[3]), y: clean(m[7]), z: clean(m[11]), rx: clean(deg(rx)), ry: clean(deg(ry)), rz: clean(deg(rz)) };
}

/** A frame at `origin` whose z axis is `axis` (any x across it). */
function frameAt(origin, axis) {
  const l = Math.hypot(...axis) || 1;
  const z = axis.map((v) => v / l);
  const helper = Math.abs(z[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let x = [helper[1] * z[2] - helper[2] * z[1], helper[2] * z[0] - helper[0] * z[2], helper[0] * z[1] - helper[1] * z[0]];
  const xl = Math.hypot(...x);
  x = x.map((v) => v / xl);
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return [x[0], y[0], z[0], origin[0], x[1], y[1], z[1], origin[1], x[2], y[2], z[2], origin[2]];
}

const numberList = (v, n) => (Array.isArray(v) && v.length === n && v.every((x) => Number.isFinite(Number(x))) ? v.map(Number) : null);

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** A drive: the joint value 'angle' (°) or 'offset' (mm) runs from → to over an animation. */
function driveOf(j) {
  const keys = j.type === 'revolute' ? ['angle'] : j.type === 'slider' ? ['offset'] : j.type === 'cylindrical' ? ['angle', 'offset'] : [];
  if (!j.drive || !keys.includes(j.drive.key ?? keys[0])) return {};
  const from = num(j.drive.from); const to = num(j.drive.to, from);
  return from === to ? {} : { drive: { key: j.drive.key ?? keys[0], from, to } };
}

/** A coupling: this joint's value = the leader's value × ratio + phase. */
function followOf(j) {
  const keys = j.type === 'revolute' ? ['angle'] : j.type === 'slider' ? ['offset'] : j.type === 'cylindrical' ? ['angle', 'offset'] : [];
  const f = j.follow;
  if (!f || f.joint == null || !keys.includes(f.key ?? keys[0]) || !['angle', 'offset'].includes(f.from ?? 'angle')) return {};
  if (String(f.joint) === String(j.id) && (f.key ?? keys[0]) === (f.from ?? 'angle')) return {};
  return { follow: { joint: String(f.joint), key: f.key ?? keys[0], from: f.from ?? 'angle', ratio: num(f.ratio, 1), phase: num(f.phase) } };
}

/** Repaired joints (unknown types, bad frames and self-joints dropped). */
export function normalizeJoints(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const j of raw) {
    if (!j || !JOINT_TYPES.includes(j.type) || j.base === j.part || j.base == null || j.part == null) continue;
    const frame = numberList(j.frame, 12);
    const rel = numberList(j.rel, 12);
    if (!frame || !rel) continue;
    out.push({
      id: String(j.id ?? `j${out.length + 1}`), type: j.type, base: j.base, part: j.part, frame, rel,
      angle: Number.isFinite(Number(j.angle)) ? Number(j.angle) : 0,
      offset: Number.isFinite(Number(j.offset)) ? Number(j.offset) : 0,
      // The values of the other joint types, and an angle joint's fixed angle.
      ...Object.fromEntries(['rx', 'ry', 'rz', 'u', 'v', 'w', 'spin', 'tilt'].filter((k) => Number.isFinite(Number(j[k])) && Number(j[k]) !== 0).map((k) => [k, Number(j[k])])),
      ...driveOf(j),
      ...followOf(j),
    });
  }
  return out;
}

/**
 * A joint between `base` and `part` (entities) at a world point with a world
 * axis: the part keeps its present pose relative to the joint frame.
 */
export function makeJoint(type, base, part, origin, axis = [0, 0, 1], id = 'j1') {
  const world = frameAt(origin, axis);
  const frame = mul(inverse(poseOf(base)), world);
  const rel = mul(inverse(world), poseOf(part));
  return { id, type, base: base.id, part: part.id, frame, rel, angle: 0, offset: 0 };
}

/**
 * Assembly_CreateJointBall / Distance / Parallel / Perpendicular / Angle: the
 * part's frame (at its origin, along its z) follows a frame on the base whose z
 * is the base's z — at the part (parallel, perpendicular, angle, ball) or at the
 * base's origin plane (distance, `distance` mm above it). The free values start
 * where the part is, so only what the joint asks for changes.
 */
export function makeOrientedJoint(type, base, part, { distance = 0, tilt = 0, id = 'j1' } = {}) {
  const P = poseOf(part);
  const B = poseOf(base);
  const partOrigin = [P[3], P[7], P[11]];
  const baseZ = [B[2], B[6], B[10]];
  const partFrame = frameAt(partOrigin, [P[2], P[6], P[10]]);
  const world = type === 'distance' ? frameAt([B[3], B[7], B[11]], baseZ) : frameAt(partOrigin, baseZ);
  const frame = mul(inverse(B), world);
  const rel = mul(inverse(partFrame), P);
  const joint = { id, type, base: base.id, part: part.id, frame, rel, angle: 0, offset: type === 'distance' ? distance : 0, ...(type === 'angle' ? { tilt } : {}) };
  // Start values: where the part is now (its spin about the base axis; its place in the plane).
  const local = mul(inverse(world), partFrame);
  const spin = deg(Math.atan2(local[4], local[0]));
  if (type === 'ball') {
    const e = placementOf(local);
    Object.assign(joint, { rx: e.rx, ry: e.ry, rz: e.rz });
  } else {
    joint.angle = clean(spin);
    if (type === 'distance') Object.assign(joint, { u: clean(local[3]), v: clean(local[7]) });
  }
  return joint;
}

/** The values a joint type has: revolute → angle, slider → offset, cylindrical → both, … */
export const jointKeys = (type) => ({
  revolute: ['angle'], slider: ['offset'], cylindrical: ['angle', 'offset'], ball: ['rx', 'ry', 'rz'],
  distance: ['angle', 'u', 'v'], parallel: ['angle', 'u', 'v', 'w'], perpendicular: ['angle', 'spin', 'u', 'v', 'w'], angle: ['angle', 'spin', 'u', 'v', 'w'],
}[type] ?? []);

/** What a joint lets move: its turn and slide (the others are held at 0). */
function motion(joint) {
  const v = (k) => joint[k] ?? 0;
  switch (joint.type) {
    case 'ball': return mul(mul(rotZ(rad(v('rz'))), rotY(rad(v('ry')))), rotX(rad(v('rx'))));
    case 'distance': return mul(move(v('u'), v('v'), v('offset')), rotZ(rad(v('angle'))));
    case 'parallel': return mul(move(v('u'), v('v'), v('w')), rotZ(rad(v('angle'))));
    case 'perpendicular': case 'angle': return mul(mul(mul(move(v('u'), v('v'), v('w')), rotZ(rad(v('angle')))), rotX(rad(joint.type === 'angle' ? v('tilt') : 90))), rotZ(rad(v('spin'))));
    default: break;
  }
  const turn = joint.type === 'revolute' || joint.type === 'cylindrical' ? rotZ(rad(joint.angle)) : rotZ(0);
  const slide = joint.type === 'slider' || joint.type === 'cylindrical' ? moveZ(joint.offset) : moveZ(0);
  return mul(turn, slide);
}

/**
 * Couplings (FreeCAD Gears, Belt, Rack and pinion, Screw): a joint value that
 * follows another joint's value × ratio + its own phase. Applied in order, so
 * chains of followers work; a follower of itself (a screw: offset from angle) too.
 */
function applyFollowers(joints) {
  const byId = new Map(joints.map((j) => [j.id, j]));
  for (let pass = 0; pass < joints.length; pass++) {
    let changed = false;
    for (const j of joints) {
      if (!j.follow) continue;
      const leader = byId.get(j.follow.joint);
      if (!leader) continue;
      const value = (leader[j.follow.from] ?? 0) * j.follow.ratio + j.follow.phase;
      if (Math.abs((j[j.follow.key] ?? 0) - value) > 1e-12) { j[j.follow.key] = value; changed = true; }
    }
    if (!changed) break;
  }
}

/** How far a closing joint is from holding: a list of residuals (mm; axes × the scene size). */
function closure(joint, A, B, size) {
  const ax = [A[0], A[4], A[8]]; const ay = [A[1], A[5], A[9]]; const az = [A[2], A[6], A[10]];
  const bx = [B[0], B[4], B[8]]; const bz = [B[2], B[6], B[10]];
  const d = [B[3] - A[3], B[7] - A[7], B[11] - A[11]];
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const axis = (p, q) => [(q[0] - p[0]) * size, (q[1] - p[1]) * size, (q[2] - p[2]) * size];
  switch (joint.type) {
    case 'ball': return d;
    case 'distance': return [dot(d, az) - joint.offset, ...axis(az, bz)];
    case 'parallel': return axis(az, bz);
    case 'perpendicular': return [dot(az, bz) * size];
    case 'angle': return [(dot(az, bz) - Math.cos(rad(joint.tilt ?? 0))) * size];
    case 'fixed': return [...d, ...axis(az, bz), ...axis(ax, bx)];
    case 'revolute': return [...d, ...axis(az, bz)];
    case 'slider': return [dot(d, ax), dot(d, ay), ...axis(az, bz), ...axis(ax, bx)];
    case 'cylindrical': return [dot(d, ax), dot(d, ay), ...axis(az, bz)];
    default: return [];
  }
}

/** Solves a small least-squares system J·dx = −r with damping (Levenberg–Marquardt step). */
function dampedStep(J, r, lambda) {
  const n = J[0]?.length ?? 0;
  const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, k) => J.reduce((s, row) => s + row[i] * row[k], 0) + (i === k ? lambda : 0)));
  const g = Array.from({ length: n }, (_, i) => -J.reduce((s, row, m) => s + row[i] * r[m], 0));
  // Gaussian elimination with partial pivoting.
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let i = c + 1; i < n; i++) if (Math.abs(A[i][c]) > Math.abs(A[p][c])) p = i;
    [A[c], A[p]] = [A[p], A[c]]; [g[c], g[p]] = [g[p], g[c]];
    const piv = A[c][c] || 1e-300;
    for (let i = c + 1; i < n; i++) {
      const f = A[i][c] / piv;
      if (!f) continue;
      for (let k = c; k < n; k++) A[i][k] -= f * A[c][k];
      g[i] -= f * g[c];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = g[i];
    for (let k = i + 1; k < n; k++) s -= A[i][k] * x[k];
    x[i] = s / (A[i][i] || 1e-300);
  }
  return x;
}

/**
 * Places every jointed part from its base, outward from the parts no joint
 * moves (grounded). Joints that close a loop (a four-bar linkage, a crank and
 * slider) are met by solving the free joint values — those neither driven nor
 * following another joint — by damped Gauss–Newton, starting from the present
 * values (so a mechanism stays on its branch). Returns the entities (new objects
 * for the parts that moved), the joints with their solved values, the ids of
 * joints that could not be met and the largest closing error (mm).
 */
export function solveAssembly(entities, joints, { tolerance = 1e-4 } = {}) {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const work = joints.map((j) => ({ ...j }));
  applyFollowers(work);
  const usable = work.filter((j) => byId.get(j.base)?.type === 'solid' && byId.get(j.part)?.type === 'solid');
  // Assembly_ToggleGrounded: a grounded part is never moved; its joints only close loops.
  const moved = new Set(usable.filter((j) => !byId.get(j.part).grounded).map((j) => j.part));
  // The tree: each part placed by the first joint that reaches it; the other joints close loops.
  const placed = new Set(entities.filter((e) => !moved.has(e.id)).map((e) => e.id));
  const tree = [];
  const closing = [];
  const used = new Set();
  let progress = true;
  while (progress) {
    progress = false;
    for (const j of usable) {
      if (used.has(j.id) || !placed.has(j.base)) continue;
      if (placed.has(j.part)) continue;
      tree.push(j); placed.add(j.part); used.add(j.id); progress = true;
    }
  }
  for (const j of usable) if (!used.has(j.id) && placed.has(j.base) && placed.has(j.part)) { closing.push(j); used.add(j.id); }
  const forward = () => {
    const poses = new Map();
    for (const j of tree) poses.set(j.part, mul(mul(mul(poses.get(j.base) ?? poseOf(byId.get(j.base)), j.frame), motion(j)), j.rel));
    return poses;
  };
  const poseIn = (poses, id) => poses.get(id) ?? poseOf(byId.get(id));
  let error = 0;
  if (closing.length) {
    const box = entities.filter((e) => placed.has(e.id)).map((e) => [e.x ?? 0, e.y ?? 0, e.z ?? 0]);
    const size = Math.max(10, ...[0, 1, 2].map((k) => Math.max(...box.map((p) => p[k])) - Math.min(...box.map((p) => p[k]))));
    // The free values: tree joints that are neither driven nor followers.
    const free = [];
    for (const j of tree) for (const key of jointKeys(j.type)) if (!j.drive && !(j.follow && j.follow.key === key)) free.push([j, key]);
    const residual = () => {
      applyFollowers(work);
      const poses = forward();
      return closing.flatMap((c) => closure(c, mul(poseIn(poses, c.base), c.frame), mul(poseIn(poses, c.part), inverse(c.rel)), size));
    };
    const norm = (r) => Math.sqrt(r.reduce((s, v) => s + v * v, 0));
    let r = residual();
    let lambda = 1e-3;
    for (let it = 0; it < 60 && free.length && norm(r) > tolerance * 0.1; it++) {
      const J = r.map(() => new Array(free.length).fill(0));
      free.forEach(([j, key], c) => {
        const h = key === 'angle' ? 1e-4 : 1e-4 * size;
        const keep = j[key];
        j[key] = keep + h;
        const r2 = residual();
        j[key] = keep;
        r2.forEach((v, m) => { J[m][c] = (v - r[m]) / h; });
      });
      residual();
      const before = free.map(([j, key]) => j[key]);
      const step = dampedStep(J, r, lambda);
      free.forEach(([j, key], c) => { j[key] += step[c]; });
      const next = residual();
      if (norm(next) < norm(r)) { r = next; lambda = Math.max(1e-9, lambda / 4); } else {
        free.forEach(([j, key], c) => { j[key] = before[c]; });
        r = residual();
        lambda *= 8;
        if (lambda > 1e9) break;
      }
    }
    error = norm(r);
  }
  const poses = forward();
  const out = entities.map((e) => {
    const pose = poses.get(e.id);
    if (!pose) return e;
    const p = placementOf(pose);
    const same = ['x', 'y', 'z', 'rx', 'ry', 'rz'].every((k) => Math.abs((e[k] ?? 0) - p[k]) < 1e-7);
    return same ? e : { ...e, ...p };
  });
  const failed = usable.filter((j) => !used.has(j.id)).map((j) => j.id).concat(work.filter((j) => !usable.includes(j)).map((j) => j.id));
  if (error > tolerance) failed.push(...closing.map((j) => j.id));
  // Joint values rounded off float noise, the input objects kept where nothing changed.
  const solved = work.map((j, i) => {
    const original = joints[i];
    const values = Object.fromEntries(jointKeys(j.type).map((k) => [k, Math.round(j[k] * 1e9) / 1e9]));
    return jointKeys(j.type).every((k) => Math.abs((original[k] ?? 0) - values[k]) < 1e-9) ? original : { ...original, ...values };
  });
  return { entities: out, joints: solved, failed, error };
}

// ───────────────────────── exploded views, bill of materials, ASMT

/**
 * Assembly_CreateView: each part moved away from the assembly's centre by
 * `factor` × its own offset from it — 3×4 moves by entity id (for the 3D view).
 */
export function explodeDeltas(parts, factor, centreOf) {
  const centres = new Map(parts.map((e) => [e.id, centreOf(e)]).filter(([, c]) => c));
  if (!centres.size) return new Map();
  const all = [0, 1, 2].map((k) => [...centres.values()].reduce((s, c) => s + c[k], 0) / centres.size);
  return new Map([...centres].map(([id, c]) => [id, move(...[0, 1, 2].map((k) => (c[k] - all[k]) * factor))]));
}

/** Assembly_CreateBom: one row per kind of part — name, count, material, volume. */
export function billOfMaterials(parts, { volumeOf = () => 0, nameOf = (e) => e.name ?? e.kind } = {}) {
  const rows = new Map();
  for (const e of parts) {
    const name = nameOf(e);
    const material = e.physical?.name ?? '';
    const key = `${name}|${material}`;
    const row = rows.get(key) ?? { name, material, count: 0, volume: Math.abs(volumeOf(e)) };
    row.count += 1;
    rows.set(key, row);
  }
  return [...rows.values()].map((r, i) => ({ index: i + 1, ...r }));
}

/**
 * Assembly_ExportASMT: the assembly in the Ondsel solver's text format —
 * parts with their placement and mass, joints with their markers.
 */
export function toAsmt(parts, joints, { name = 'Assembly', massOf = () => 1 } = {}) {
  const f = (v) => (Math.abs(v) < 1e-12 ? 0 : Math.round(v * 1e9) / 1e9);
  const matrix = (m) => [[m[0], m[1], m[2]], [m[4], m[5], m[6]], [m[8], m[9], m[10]]].map((row) => `\t\t\t\t\t${row.map(f).join(' ')}`).join('\n');
  const lines = ['OndselSolver', 'Assembly', '\tNotes', '\t\t(Text string: \'Exported by MyCAD\' runs: (Core.RunArray runs: #(23) values: #(nil)))', '\tName', `\t\t${name}`, '\tPosition3D', '\t\t0 0 0', '\tRotationMatrix', '\t\t1 0 0', '\t\t0 1 0', '\t\t0 0 1', '\tParts'];
  const label = (e) => String(e.name || e.id).replace(/\s+/g, '_');
  for (const e of parts) {
    const m = poseOf(e);
    lines.push('\t\tPart', '\t\t\tName', `\t\t\t\t${label(e)}`, '\t\t\tPosition3D', `\t\t\t\t${[m[3], m[7], m[11]].map(f).join(' ')}`, '\t\t\tRotationMatrix', matrix(m).replace(/\t\t\t\t\t/g, '\t\t\t\t'),
      '\t\t\tIsFixed', `\t\t\t\t${e.grounded ? 'true' : 'false'}`, '\t\t\tPrincipalMassMarker', '\t\t\t\tName', '\t\t\t\t\tMassMarker', '\t\t\t\tMass', `\t\t\t\t\t${f(massOf(e))}`,
      '\t\t\tMarkers');
    for (const j of joints.filter((x) => x.base === e.id || x.part === e.id)) {
      const marker = j.base === e.id ? j.frame : inverse(j.rel);
      lines.push('\t\t\t\tMarker', '\t\t\t\t\tName', `\t\t\t\t\t\t${j.id}_${j.base === e.id ? 'i' : 'j'}`, '\t\t\t\t\tPosition3D', `\t\t\t\t\t\t${[marker[3], marker[7], marker[11]].map(f).join(' ')}`, '\t\t\t\t\tRotationMatrix', matrix(marker).replace(/\t\t\t\t\t/g, '\t\t\t\t\t\t'));
    }
  }
  const ASMT = { fixed: 'FixedJoint', revolute: 'RevoluteJoint', slider: 'TranslationalJoint', cylindrical: 'CylindricalJoint', ball: 'SphericalJoint', distance: 'PlanarJoint', parallel: 'ParallelAxesJoint', perpendicular: 'PerpendicularJoint', angle: 'AngleJoint' };
  lines.push('\tKinematicIJs', '\tConstraintSets', '\t\tJoints');
  for (const j of joints) {
    const base = parts.find((e) => e.id === j.base); const part = parts.find((e) => e.id === j.part);
    if (!base || !part) continue;
    lines.push(`\t\t\t${ASMT[j.type] ?? 'FixedJoint'}`, '\t\t\t\tName', `\t\t\t\t\t${j.id}`, '\t\t\t\tMarkerI', `\t\t\t\t\t/${name}/${label(base)}/${j.id}_i`, '\t\t\t\tMarkerJ', `\t\t\t\t\t/${name}/${label(part)}/${j.id}_j`);
    if (j.type === 'distance') lines.push('\t\t\t\toffset', `\t\t\t\t\t${f(j.offset)}`);
    if (j.type === 'angle') lines.push('\t\t\t\ttheIzJz', `\t\t\t\t\t${f(rad(j.tilt ?? 0))}`);
  }
  lines.push('\t\tMotions', '\t\tGeneralConstraintSets', '\tForceTorques', '\tConstantGravity', '\t\t0 0 0', '\tSimulationParameters', '\t\ttstart', '\t\t\t0', '\t\ttend', '\t\t\t1', '\t\thmin', '\t\t\t1e-9', '\t\thmax', '\t\t\t1', '\t\thout', '\t\t\t0.1', '\t\terrorTol', '\t\t\t1e-6');
  return `${lines.join('\n')}\n`;
}

// ───────────────────────── animation (FreeCAD Assembly › Animate)

export const ANIMATION_MODES = ['loop', 'bounce', 'once'];

/** Animation settings repaired: duration (s) and how it repeats. */
export function normalizeAnimation(raw = {}) {
  const duration = Number(raw?.duration);
  return {
    duration: Number.isFinite(duration) && duration > 0 ? Math.min(3600, duration) : 4,
    mode: ANIMATION_MODES.includes(raw?.mode) ? raw.mode : 'loop',
  };
}

/** Where in the run (0…1) a time (s) falls. */
export function animationPhase(time, animation) {
  const a = normalizeAnimation(animation);
  const u = time / a.duration;
  if (a.mode === 'once') return Math.max(0, Math.min(1, u));
  if (a.mode === 'bounce') { const k = ((u % 2) + 2) % 2; return k <= 1 ? k : 2 - k; }
  return ((u % 1) + 1) % 1;
}

/** The joints with their driven values at a time (s): each drive runs from → to over the run. */
export function drivenJoints(joints, time, animation) {
  const u = animationPhase(time, animation);
  return joints.map((j) => (j.drive ? { ...j, [j.drive.key]: j.drive.from + (j.drive.to - j.drive.from) * u } : j));
}

/** The joints of a drawing that animation drives. */
export const hasDrives = (joints) => (joints ?? []).some((j) => j.drive);

/** Where a joint is now, in the drawing: { origin, axis }. */
export function jointWorld(joint, base) {
  const m = mul(poseOf(base), joint.frame);
  return { origin: [m[3], m[7], m[11]], axis: [m[2], m[6], m[10]] };
}

/** The rigid move (3×4) that takes a part from one placement to another: pose(to) · pose(from)⁻¹. */
export const poseDelta = (from, to) => mul(poseOf(to), inverse(poseOf(from)));

/**
 * The assembly at time `to`, coming from time `from` (whose solved joints are
 * `joints`): big jumps (scrubbing) are walked in steps of at most 1/60 of a run,
 * so a linkage stays on its branch instead of snapping to the mirror pose.
 */
export function solveAnimation(entities, joints, from, to, animation) {
  const a = normalizeAnimation(animation);
  const steps = Math.min(240, Math.max(1, Math.ceil((Math.abs(to - from) / a.duration) * 60)));
  let current = joints;
  let run = null;
  for (let k = 1; k <= steps; k++) {
    run = solveAssembly(entities, drivenJoints(current, from + ((to - from) * k) / steps, a));
    current = run.joints;
  }
  return run;
}

/** Two rigid moves (3×4) one after the other: a then b applied first (a · b). */
export const composePose = (a, b) => mul(a, b);
