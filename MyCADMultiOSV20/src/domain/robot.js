// FreeCAD Robot: a 6-axis industrial robot (KUKA-like, Denavit–Hartenberg),
// forward and inverse kinematics, a trajectory along a drawn path, and the
// KUKA KRL program for it. No DOM.

import { placementOf, poseOf } from './assembly.js';

/** DH table of a 6-axis arm (mm, degrees): [d, a, alpha, theta offset], scaled by `reach`. */
export function dhTable(reach = 1) {
  const s = reach;
  return [
    [400 * s, 25 * s, -90, 0],
    [0, 455 * s, 0, 0],
    [0, 35 * s, -90, -90],
    [420 * s, 0, 90, 0],
    [0, 0, -90, 0],
    [80 * s, 0, 0, 0],
  ];
}

/** Joint limits (degrees), as a KR 6 has them. */
export const JOINT_LIMITS = [[-185, 185], [-230, 50], [-130, 250], [-350, 350], [-130, 130], [-350, 350]];
export const JOINTS = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];

const rad = (d) => (d * Math.PI) / 180;
// 4×4 as 3×4 row-major.
const mul = (a, b) => [
  a[0] * b[0] + a[1] * b[4] + a[2] * b[8], a[0] * b[1] + a[1] * b[5] + a[2] * b[9], a[0] * b[2] + a[1] * b[6] + a[2] * b[10], a[0] * b[3] + a[1] * b[7] + a[2] * b[11] + a[3],
  a[4] * b[0] + a[5] * b[4] + a[6] * b[8], a[4] * b[1] + a[5] * b[5] + a[6] * b[9], a[4] * b[2] + a[5] * b[6] + a[6] * b[10], a[4] * b[3] + a[5] * b[7] + a[6] * b[11] + a[7],
  a[8] * b[0] + a[9] * b[4] + a[10] * b[8], a[8] * b[1] + a[9] * b[5] + a[10] * b[9], a[8] * b[2] + a[9] * b[6] + a[10] * b[10], a[8] * b[3] + a[9] * b[7] + a[10] * b[11] + a[11],
];
const dh = (theta, d, a, alpha) => {
  const ct = Math.cos(theta); const st = Math.sin(theta); const ca = Math.cos(alpha); const sa = Math.sin(alpha);
  return [ct, -st * ca, st * sa, a * ct, st, ct * ca, -ct * sa, a * st, 0, sa, ca, d];
};

/** The frames of the base and of joints 1–6 (the last is the flange), for joint angles in degrees. */
export function forwardKinematics(joints, { reach = 1, tool = 0 } = {}) {
  const table = dhTable(reach);
  let m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
  const frames = [m];
  table.forEach(([d, a, alpha, offset], i) => {
    m = mul(m, dh(rad(joints[i] + offset), d, a, rad(alpha)));
    frames.push(m);
  });
  // The tool centre point: `tool` along the flange's z axis.
  const tcp = mul(m, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, tool]);
  return { frames, tcp };
}

const origin = (m) => [m[3], m[7], m[11]];
const zAxis = (m) => [m[2], m[6], m[10]];

/**
 * Joint angles that bring the tool centre point to `target` with the tool
 * pointing down (−Z), starting from `start` (damped least squares). Returns
 * { joints, error (mm), reached }.
 */
export function inverseKinematics(target, start = [0, -90, 90, 0, 90, 0], options = {}) {
  const first = solveFrom(target, start, options);
  if (first.reached) return first;
  // Far round from the start: try again with joint 1 already turned toward the point.
  const a1 = (Math.atan2(target[1], target[0]) * 180) / Math.PI;
  const second = solveFrom(target, [a1, -90, 90, 0, 90, 0], options);
  return second.error < first.error ? second : first;
}

function solveFrom(target, start, { reach = 1, tool = 0, down = true } = {}) {
  let q = start.slice();
  const residual = (j) => {
    const { tcp } = forwardKinematics(j, { reach, tool });
    const p = origin(tcp);
    const r = [p[0] - target[0], p[1] - target[1], p[2] - target[2]];
    // Tool pointing down: its z axis = (0, 0, −1), weighted like 100 mm.
    if (down) { const z = zAxis(tcp); r.push(z[0] * 100, z[1] * 100, (z[2] + 1) * 100); }
    return r;
  };
  let r = residual(q);
  let err = Math.hypot(...r);
  let lambda = 1;
  for (let it = 0; it < 200 && err > 1e-4; it++) {
    const h = 1e-4;
    const J = r.map(() => new Array(6).fill(0));
    for (let k = 0; k < 6; k++) {
      const qp = q.slice(); qp[k] += h;
      const rp = residual(qp);
      for (let i = 0; i < r.length; i++) J[i][k] = (rp[i] - r[i]) / h;
    }
    // (JᵀJ + λ²I) dq = −Jᵀr
    const A = Array.from({ length: 6 }, (_, a) => Array.from({ length: 6 }, (_, b) => J.reduce((s, row) => s + row[a] * row[b], 0) + (a === b ? lambda * lambda : 0)));
    const g = Array.from({ length: 6 }, (_, a) => -J.reduce((s, row, i) => s + row[a] * r[i], 0));
    const dq = solve6(A, g);
    if (!dq) break;
    const trial = q.map((v, k) => Math.max(JOINT_LIMITS[k][0], Math.min(JOINT_LIMITS[k][1], v + dq[k])));
    const tr = residual(trial);
    const te = Math.hypot(...tr);
    if (te < err) { q = trial; r = tr; err = te; lambda = Math.max(1e-3, lambda / 3); } else lambda *= 4;
    if (lambda > 1e8) break;
  }
  const { tcp } = forwardKinematics(q, { reach, tool });
  const p = origin(tcp);
  const distance = Math.hypot(p[0] - target[0], p[1] - target[1], p[2] - target[2]);
  return { joints: q, error: distance, reached: distance < 0.5 };
}

function solve6(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const k = M[r][c] / M[c][c]; for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let j = r + 1; j < n; j++) s -= M[r][j] * x[j]; x[r] = s / M[r][r]; }
  return x;
}

/** Points along a path every `step` mm (its corners kept). */
export function samplePath(points, step = 20) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]; const b = points[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 1; k <= n; k++) out.push([0, 1, 2].map((j) => a[j] + ((b[j] - a[j]) * k) / n));
  }
  return out;
}

/**
 * A trajectory: the joint angles at each point of the path (in the robot's own
 * coordinates), each solved from the one before so the arm moves smoothly.
 * Returns { steps: [{ point, joints, error }], reached }.
 */
export function trajectory(points, start, options = {}) {
  let joints = start;
  const steps = [];
  for (const point of points) {
    const r = inverseKinematics(point, joints, options);
    joints = r.joints;
    steps.push({ point, joints, error: r.error });
  }
  return { steps, reached: steps.every((s) => s.error < 0.5) };
}

/** KUKA KRL program of a trajectory (joint moves, so the controller follows the same arm). */
export function toKrl(steps, { name = 'mycad_path', speed = 50 } = {}) {
  const fmt = (v) => String(Math.round(v * 1000) / 1000);
  const id = String(name).replace(/[^A-Za-z0-9_]/g, '_').slice(0, 24) || 'mycad_path';
  return [
    `DEF ${id}()`,
    '; MyCAD Robot trajectory (joint angles in degrees)',
    `$VEL_AXIS[1] = ${speed}`,
    'PTP {A1 0, A2 -90, A3 90, A4 0, A5 0, A6 0}',
    ...steps.map((s) => `PTP {${s.joints.map((v, i) => `A${i + 1} ${fmt(v)}`).join(', ')}} ; X ${fmt(s.point[0])} Y ${fmt(s.point[1])} Z ${fmt(s.point[2])}`),
    'PTP {A1 0, A2 -90, A3 90, A4 0, A5 0, A6 0}',
    'END',
    '',
  ].join('\r\n');
}

/**
 * The arm as boxes and cylinders (local, base at the origin): a base drum,
 * a link between each pair of joint origins and a drum at every joint.
 * `boxBetween(p, q, size)` and `cylinderAt(frame, r, h)` are the mesh makers.
 */
export function robotParts(joints, { reach = 1, tool = 0 } = {}) {
  const { frames, tcp } = forwardKinematics(joints, { reach, tool });
  const s = reach;
  const links = [];
  const pts = frames.map(origin);
  // Joint 1 sits on the base; the shoulder offsets are short stubs.
  links.push({ from: [0, 0, 0], to: [0, 0, 400 * s * 0.55], size: 160 * s });
  for (let i = 1; i < pts.length; i++) {
    const a = i === 1 ? [0, 0, 400 * s * 0.55] : pts[i - 1];
    const b = pts[i];
    if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) > 1e-6) links.push({ from: a, to: b, size: [130, 110, 95, 80, 65, 55][i - 1] * s });
  }
  if (tool > 0) links.push({ from: origin(frames[6]), to: origin(tcp), size: 18 * s });
  return { links, joints: frames.slice(1).map((m, i) => ({ frame: m, radius: [90, 80, 70, 60, 50, 40][i] * s })), tcp: origin(tcp) };
}

/** Triangles of the arm (local): square links between the joints, a drum at each joint along its axis. */
export function robotMesh(joints, options = {}) {
  const { links, joints: drums } = robotParts(joints, options);
  const tris = [];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const at = (o, u, v, w, x, y, z) => [o[0] + u[0] * x + v[0] * y + w[0] * z, o[1] + u[1] * x + v[1] * y + w[1] * z, o[2] + u[2] * x + v[2] * y + w[2] * z];
  // A prism of an n-gon (radius r) from o along w for length h, u/v across.
  const prismAlong = (o, w, u, v, r, h, n) => {
    const ring = (z) => Array.from({ length: n }, (_, k) => at(o, u, v, w, r * Math.cos((2 * Math.PI * (k + 0.5)) / n), r * Math.sin((2 * Math.PI * (k + 0.5)) / n), z));
    const a = ring(0); const b = ring(h);
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n;
      tris.push([a[k], a[j], b[j]], [a[k], b[j], b[k]]);
      tris.push([at(o, u, v, w, 0, 0, 0), a[j], a[k]], [at(o, u, v, w, 0, 0, h), b[k], b[j]]);
    }
  };
  for (const link of links) {
    const w = unit(sub(link.to, link.from));
    const u = unit(Math.abs(w[2]) < 0.9 ? cross(w, [0, 0, 1]) : cross(w, [1, 0, 0]));
    const v = cross(w, u);
    // A square link (four sides), half its width each way.
    prismAlong(link.from, w, u, v, link.size / Math.SQRT2, Math.hypot(...sub(link.to, link.from)), 4);
  }
  for (const drum of drums) {
    const m = drum.frame;
    const w = [m[2], m[6], m[10]];
    const u = [m[0], m[4], m[8]];
    const v = [m[1], m[5], m[9]];
    const o = [m[3] - w[0] * drum.radius * 0.6, m[7] - w[1] * drum.radius * 0.6, m[11] - w[2] * drum.radius * 0.6];
    prismAlong(o, w, u, v, drum.radius, drum.radius * 1.2, 20);
  }
  // A round base under joint 1.
  prismAlong([0, 0, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0], 180 * (options.reach ?? 1), 60 * (options.reach ?? 1), 28);
  return tris;
}

// ───────────────────────── home, defaults, tool shape, stored trajectories

const finiteList = (v, n) => (Array.isArray(v) && v.length === n && v.every((x) => Number.isFinite(Number(x))) ? v.map(Number) : null);

/**
 * What the Robot workbench keeps per robot (drawing.robots[id]): its home
 * pose (Robot_SetHomePos), the default tool orientation and move values for
 * waypoints (Robot_SetDefaultOrientation / …Values), the solid carried on its
 * flange (Robot_AddToolShape) and its trajectories (Robot_Edge2Trac,
 * …TrajectoryCompound, …TrajectoryDressUp).
 */
export function normalizeRobotData(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [id, r] of Object.entries(raw)) {
    if (!r || typeof r !== 'object') continue;
    const home = finiteList(r.home, 6);
    const orientation = finiteList(r.orientation, 3);
    const d = r.defaults ?? {};
    const defaults = { speed: Math.max(1, Math.min(100, Number(d.speed) || 50)), accel: Math.max(1, Math.min(100, Number(d.accel) || 50)), cont: Boolean(d.cont) };
    const tool = typeof r.tool?.id === 'string' && finiteList(r.tool.rel, 12) ? { id: r.tool.id, rel: r.tool.rel.map(Number) } : null;
    const trajectories = (Array.isArray(r.trajectories) ? r.trajectories : []).filter((t) => t && Array.isArray(t.points) && t.points.length).slice(0, 100).map((t, i) => ({
      id: typeof t.id === 'string' ? t.id : `t${i + 1}`,
      name: typeof t.name === 'string' && t.name ? t.name.slice(0, 80) : `Trajectory ${i + 1}`,
      points: t.points.map((p) => finiteList(p, 3)).filter(Boolean),
      speed: Math.max(1, Math.min(100, Number(t.speed) || defaults.speed)),
      accel: Math.max(1, Math.min(100, Number(t.accel) || defaults.accel)),
      cont: t.cont === undefined ? defaults.cont : Boolean(t.cont),
      ...(finiteList(t.orientation, 3) ? { orientation: t.orientation.map(Number) } : {}),
    })).filter((t) => t.points.length);
    out[id] = { ...(home ? { home } : {}), ...(orientation ? { orientation } : {}), defaults, ...(tool ? { tool } : {}), ...(trajectories.length ? { trajectories } : {}) };
  }
  return out;
}

/** Joint angles of a robot solid. */
export const robotJointValues = (robot) => JOINTS.map((k, i) => Number(robot.params?.[k] ?? [0, -90, 90, 0, 90, 0][i]));

/** The robot's flange in the world: its placement (pose) times the arm's last frame. */
export function flangePose(robotPose, joints, reach = 1) {
  return mul(robotPose, forwardKinematics(joints, { reach }).frames[6]);
}

/** Robot_AddToolShape: each robot's tool solid moved to where its flange is. */
export function followRobotTools(drawing) {
  for (const [id, data] of Object.entries(drawing.robots ?? {})) {
    if (!data.tool) continue;
    const robot = drawing.entities.find((e) => e.id === id && e.kind === 'robot');
    const tool = drawing.entities.find((e) => e.id === data.tool.id);
    if (!robot || !tool) continue;
    const p = placementOf(mul(flangePose(poseOf(robot), robotJointValues(robot), robot.params?.reach ?? 1), data.tool.rel));
    if (['x', 'y', 'z', 'rx', 'ry', 'rz'].some((k) => Math.abs((tool[k] ?? 0) - p[k]) > 1e-7)) drawing.entities = drawing.entities.map((e) => (e.id === tool.id ? { ...e, ...p } : e));
  }
}

/** Robot_TrajectoryCompound: trajectories one after the other. */
export function compoundTrajectory(list, name) {
  return { id: `t${Date.now().toString(36)}`, name, points: list.flatMap((t) => t.points), speed: list[0]?.speed ?? 50, accel: list[0]?.accel ?? 50, cont: list.every((t) => t.cont) };
}

/** Robot_TrajectoryDressUp: a trajectory moved by an offset, with other speed, acceleration, continuity or orientation. */
export function dressUpTrajectory(t, { offset = [0, 0, 0], speed = null, accel = null, cont = null, orientation = null } = {}, name = `${t.name} (dressed)`) {
  return {
    id: `t${Date.now().toString(36)}`, name,
    points: t.points.map((p) => p.map((v, k) => v + (offset[k] ?? 0))),
    speed: speed ?? t.speed, accel: accel ?? t.accel, cont: cont ?? t.cont,
    ...((orientation ?? t.orientation) ? { orientation: orientation ?? t.orientation } : {}),
  };
}
