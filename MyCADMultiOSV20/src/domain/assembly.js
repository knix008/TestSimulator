// FreeCAD Assembly: joints between solids. A joint ties a moving part to a
// base part at a joint frame (origin + axis, kept in the base's coordinates);
// the part keeps its pose relative to that frame, turned (revolute), slid
// (slider) or both (cylindrical) by the joint's values. Parts that are not
// moved by any joint stay where they are (grounded). No DOM.

export const JOINT_TYPES = ['fixed', 'revolute', 'slider', 'cylindrical'];

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
const moveZ = (d) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, d];

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

/** What a joint lets move: its turn and slide (the others are held at 0). */
function motion(joint) {
  const turn = joint.type === 'revolute' || joint.type === 'cylindrical' ? rotZ(rad(joint.angle)) : rotZ(0);
  const slide = joint.type === 'slider' || joint.type === 'cylindrical' ? moveZ(joint.offset) : moveZ(0);
  return mul(turn, slide);
}

/**
 * Places every jointed part from its base, outward from the parts no joint
 * moves. A part moved by two joints follows the first; joints in a loop are
 * skipped. Returns the entities (new objects for the parts that moved) and the
 * ids of joints that could not be solved.
 */
export function solveAssembly(entities, joints) {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const usable = joints.filter((j) => byId.get(j.base)?.type === 'solid' && byId.get(j.part)?.type === 'solid');
  const moved = new Set(usable.map((j) => j.part));
  const placed = new Set(entities.filter((e) => !moved.has(e.id)).map((e) => e.id));
  const poses = new Map();
  const done = new Set();
  let progress = true;
  while (progress) {
    progress = false;
    for (const j of usable) {
      if (done.has(j.id) || !placed.has(j.base) || placed.has(j.part)) continue;
      const base = poses.get(j.base) ?? poseOf(byId.get(j.base));
      const pose = mul(mul(mul(base, j.frame), motion(j)), j.rel);
      poses.set(j.part, pose);
      placed.add(j.part);
      done.add(j.id);
      progress = true;
    }
  }
  const out = entities.map((e) => {
    const pose = poses.get(e.id);
    if (!pose) return e;
    const p = placementOf(pose);
    const same = ['x', 'y', 'z', 'rx', 'ry', 'rz'].every((k) => Math.abs((e[k] ?? 0) - p[k]) < 1e-7);
    return same ? e : { ...e, ...p };
  });
  return { entities: out, failed: usable.filter((j) => !done.has(j.id)).map((j) => j.id).concat(joints.filter((j) => !usable.includes(j)).map((j) => j.id)) };
}

/** Where a joint is now, in the drawing: { origin, axis }. */
export function jointWorld(joint, base) {
  const m = mul(poseOf(base), joint.frame);
  return { origin: [m[3], m[7], m[11]], axis: [m[2], m[6], m[10]] };
}
