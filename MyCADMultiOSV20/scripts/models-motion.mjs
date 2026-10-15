// Moving samples (FreeCAD Assembly with joints, drives and couplings):
//   crankEngine()   a single-cylinder engine: crank, flywheel, connecting rod, piston (a closed loop)
//   fourBar()       a four-bar linkage on a stand, with a tracer on the coupler (a closed loop)
//   gearTrain()     three meshing spur gears and a rack (gear and rack couplings)
//   screwVise()     a vise: the handle turns the screw, the screw advances, the jaw follows (screw coupling)
//   robotArm()      a turntable arm with shoulder, elbow and a two-finger gripper (several drives)
//   houseDoors()    a room whose door swings, patio door slides and window opens
// Each opens with drives set: Solid › Play animation (or the bar in the 3D view) runs it.
import { addEntity, createDrawing } from '../src/domain/drawing.js';
import { makeJoint } from '../src/domain/assembly.js';
import { normalizeEntity } from '../src/domain/entities.js';
import { featureFrom } from '../src/domain/solids.js';
import { buildShapes, collectLoops } from '../src/domain/stl.js';

const add = (d, data) => addEntity(d, 'solid', data);
const raw = (kind, params, place = {}) => ({ type: 'solid', kind, params, ...place });
const bool = (op, parts, extra = {}) => ({ type: 'solid', kind: 'boolean', params: {}, shape: { op, parts }, ...extra });
const pad = (shapes, height, place = {}) => ({ type: 'solid', ...featureFrom('pad', { shapes }, { height }), ...place });
const text = (d, x, y, value, size = 8) => addEntity(d, 'text', { x, y, text: value, size, layer: 'text' });

/** A part outline (gear, rack…) as pad shapes. */
function partShapes(kind, params, angle = 0) {
  const part = normalizeEntity({ type: 'part', kind, x: 0, y: 0, angle, params });
  return buildShapes(collectLoops([part]).loops).map(({ outer, holes }) => ({ outer, holes }));
}

const ring = (cx, cy, r, n = 36, cw = false) => {
  const pts = Array.from({ length: n }, (_, i) => ({ x: cx + r * Math.cos((2 * Math.PI * i) / n), y: cy + r * Math.sin((2 * Math.PI * i) / n) }));
  return cw ? pts.reverse() : pts;
};

/** A link from (0, 0) to (len, 0): rounded ends of width w, pin holes of radius r at both ends. */
function linkShape(len, w, r = 0) {
  const n = 18;
  const outer = [];
  for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (Math.PI * i) / n; outer.push({ x: len + (w / 2) * Math.cos(a), y: (w / 2) * Math.sin(a) }); }
  for (let i = 0; i <= n; i++) { const a = Math.PI / 2 + (Math.PI * i) / n; outer.push({ x: (w / 2) * Math.cos(a), y: (w / 2) * Math.sin(a) }); }
  return [{ outer, holes: r ? [ring(0, 0, r, 24, true), ring(len, 0, r, 24, true)] : [] }];
}

/**
 * A link standing in the x–z plane: its start at (x, y, z), turned `angle`° from
 * +x towards +z, `thick` deep towards −y (pad along local z, turned by rx 90).
 */
const link = (len, w, thick, [x, y, z], angle, extra = {}) => pad(linkShape(len, w, extra.pin ?? 0), thick, { x, y, z, rx: 90, ry: -angle, ...extra.place });

const Y = [0, 1, 0];
const Z = [0, 0, 1];
const X = [1, 0, 0];

function finish(d, joints, animation) {
  d.joints = joints;
  d.animation = animation;
  return d;
}

// ───────────────────────── crank and slider: a single-cylinder engine

export function crankEngine() {
  const d = createDrawing({ title: '단기통 엔진 (크랭크 · 커넥팅 로드 · 피스톤)', author: 'SHKWON' });
  Object.assign(d.sheet, { number: 'MO-001', material: 'FC250 · SCM440', company: 'MyCAD samples' });
  const r = 40; const L = 140;
  const base = add(d, { ...raw('box', { length: 320, width: 120, height: 20 }, { x: -160, y: -70, z: -150 }), name: 'Base', color: '#a3aebd' });
  // Two bearing pillars carry the crankshaft; the cylinder liner is cut open towards the viewer.
  for (const [y, name] of [[24, 'BearingRear'], [-58, 'BearingFront']]) add(d, { ...bool('cut', [raw('box', { length: 60, width: 14, height: 140 }, { x: -30, y, z: -130 }), raw('cylinder', { radius: 11, height: 40 }, { x: 0, y: y + 20, z: 0, rx: 90 })]), name, color: '#a3aebd' });
  add(d, { ...bool('cut', [raw('tube', { outer: 42, inner: 34, height: 130 }, { x: 0, y: -17, z: 120 }), raw('box', { length: 100, width: 60, height: 140 }, { x: -50, y: -77, z: 115 })]), name: 'Liner (cut open)', color: '#cfd6e0' });
  add(d, { ...raw('box', { length: 120, width: 120, height: 10 }, { x: -60, y: -77, z: 250 }), name: 'Head', color: '#a3aebd' });
  const crank = add(d, { ...link(r, 34, 12, [0, 0, 0], 90, { pin: 0 }), name: 'Crank', color: '#d9822b' });
  const shaft = add(d, { ...raw('cylinder', { radius: 10, height: 120 }, { x: 0, y: 60, z: 0, rx: 90 }), name: 'Crankshaft', color: '#c9cdd4' });
  const flywheel = add(d, { ...bool('cut', [raw('cylinder', { radius: 80, height: 14 }, { x: 0, y: 60, z: 0, rx: 90 }), ...[0, 120, 240].map((a) => raw('cylinder', { radius: 18, height: 20 }, { x: 46 * Math.cos((a * Math.PI) / 180), y: 63, z: 46 * Math.sin((a * Math.PI) / 180), rx: 90 }))]), name: 'Flywheel', color: '#7a8494' });
  const pin = add(d, { ...raw('cylinder', { radius: 7, height: 30 }, { x: 0, y: 3, z: r, rx: 90 }), name: 'CrankPin', color: '#c9cdd4' });
  const rod = add(d, { ...link(L, 20, 10, [0, -12, r], 90), name: 'ConnectingRod', color: '#3a6cf0' });
  const piston = add(d, { ...raw('cylinder', { radius: 33, height: 50 }, { x: 0, y: -17, z: r + L - 20 }), name: 'Piston', color: '#c9cdd4' });
  text(d, -160, -230, `단기통 엔진: 크랭크 반지름 ${r} · 커넥팅 로드 ${L} — 3D 보기에서 ▶ 재생 (닫힌 고리: 크랭크 → 로드 → 피스톤 → 실린더)`);
  return finish(d, [
    { ...makeJoint('revolute', base, crank, [0, 0, 0], Y, 'crank'), drive: { key: 'angle', from: 0, to: 360 } },
    makeJoint('fixed', crank, shaft, [0, 0, 0], Y, 'shaft'),
    makeJoint('fixed', crank, flywheel, [0, 0, 0], Y, 'flywheel'),
    makeJoint('fixed', crank, pin, [0, 0, r], Y, 'crankpin'),
    makeJoint('revolute', crank, rod, [0, -12, r], Y, 'big-end'),
    makeJoint('slider', base, piston, [0, -17, r + L], Z, 'bore'),
    makeJoint('revolute', rod, piston, [0, -17, r + L], Y, 'wrist-pin'),
  ], { duration: 2, mode: 'loop' });
}

// ───────────────────────── a four-bar linkage (Grashof crank–rocker)

export function fourBar() {
  const d = createDrawing({ title: '4절 링크 (크랭크–로커)', author: 'SHKWON' });
  Object.assign(d.sheet, { number: 'MO-002', material: 'A6061', company: 'MyCAD samples' });
  const a = 40; const b = 130; const c = 90; const g = 120; const h = 160;
  const A = [0, h]; const D = [g, h];
  const B = [A[0], A[1] + a];
  // C: where the coupler (from B) meets the rocker (from D), the upper branch.
  const dx = D[0] - B[0]; const dz = D[1] - B[1]; const dist = Math.hypot(dx, dz);
  const along = (b * b - c * c + dist * dist) / (2 * dist); const across = Math.sqrt(b * b - along * along);
  const C = [B[0] + (along * dx - across * dz) / dist, B[1] + (along * dz + across * dx) / dist];
  const angle = (p, q) => (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI;
  const base = add(d, { ...raw('box', { length: 300, width: 100, height: 16 }, { x: -90, y: -50, z: 0 }), name: 'Base', color: '#a3aebd' });
  for (const [x, name] of [[A[0], 'PostA'], [D[0], 'PostD']]) add(d, { ...raw('box', { length: 24, width: 10, height: h + 12 - 16 }, { x: x - 12, y: 0, z: 16 }), name, color: '#a3aebd' });
  const crank = add(d, { ...link(a, 22, 8, [A[0], 0, A[1]], 90, { pin: 4 }), name: 'Crank', color: '#d9822b' });
  const coupler = add(d, { ...link(b, 18, 8, [B[0], -8, B[1]], angle(B, C), { pin: 4 }), name: 'Coupler', color: '#3a6cf0' });
  const rocker = add(d, { ...link(c, 20, 8, [D[0], 0, D[1]], angle(D, C), { pin: 4 }), name: 'Rocker', color: '#2f9e5a' });
  // A tracer on the coupler, off its line: it draws the coupler curve as it moves.
  const mid = [(B[0] + C[0]) / 2, (B[1] + C[1]) / 2];
  const nrm = [-(C[1] - B[1]) / b, (C[0] - B[0]) / b];
  const tip = [mid[0] + nrm[0] * 40, mid[1] + nrm[1] * 40];
  const arm = add(d, { ...link(40, 10, 6, [mid[0], -16, mid[1]], angle(mid, tip)), name: 'TracerArm', color: '#3a6cf0' });
  const tracer = add(d, { ...raw('sphere', { radius: 7 }, { x: tip[0], y: -19, z: tip[1] }), name: 'Tracer', color: '#e5484d' });
  text(d, -90, -80, `4절 링크: 고정 ${g} · 크랭크 ${a} · 커플러 ${b} · 로커 ${c} (그라스호프: 크랭크가 한 바퀴 돌고 로커는 흔들림)`);
  return finish(d, [
    { ...makeJoint('revolute', base, crank, [A[0], 0, A[1]], Y, 'A'), drive: { key: 'angle', from: 0, to: 360 } },
    makeJoint('revolute', crank, coupler, [B[0], 0, B[1]], Y, 'B'),
    makeJoint('revolute', base, rocker, [D[0], 0, D[1]], Y, 'D'),
    makeJoint('fixed', coupler, arm, [mid[0], 0, mid[1]], Y, 'tracer-arm'),
    makeJoint('fixed', arm, tracer, [tip[0], 0, tip[1]], Y, 'tracer'),
    makeJoint('revolute', coupler, rocker, [C[0], 0, C[1]], Y, 'C'),
  ], { duration: 3, mode: 'loop' });
}

// ───────────────────────── gears and a rack

export function gearTrain() {
  const d = createDrawing({ title: '기어열과 랙 (m2, z20 · z40 · z16)', author: 'SHKWON' });
  Object.assign(d.sheet, { number: 'MO-003', material: 'SM45C', company: 'MyCAD samples' });
  const m = 2; const [z1, z2, z3] = [20, 40, 16];
  const r1 = (m * z1) / 2; const r2 = (m * z2) / 2; const r3 = (m * z3) / 2;
  const p = Math.PI * m;
  const base = add(d, { ...raw('box', { length: 470, width: 300, height: 10 }, { x: -270, y: -70, z: -20 }), name: 'Base', color: '#a3aebd' });
  // Teeth phased to mesh: G1 has a tooth up (+y), G2 a gap down (turned half a tooth), G3 a tooth down.
  const gear = (z, y, turn, name, color) => add(d, { ...pad(partShapes('gear', { module: m, teeth: z, bore: 8, keyway: false, pitchCircle: false }), 12), x: 0, y, z: 0, rz: turn, name, color });
  const g1 = gear(z1, 0, 0, 'Gear z20 (driver)', '#d9822b');
  const g2 = gear(z2, r1 + r2, 180 / z2, 'Gear z40', '#3a6cf0');
  const g3 = gear(z3, r1 + 2 * r2 + r3, 0, 'Gear z16', '#2f9e5a');
  for (const [y, name] of [[0, 'Shaft1'], [r1 + r2, 'Shaft2'], [r1 + 2 * r2 + r3, 'Shaft3']]) add(d, { ...raw('cylinder', { radius: 4, height: 50 }, { x: 0, y, z: -10 }), name, color: '#c9cdd4' });
  // The rack under G1: pitch line at y = −r1, a gap under the gear's lower tooth.
  const rack = add(d, { ...pad(partShapes('rack', { module: m, teeth: 50, height: 10 }), 12), x: -40 * p, y: -r1, z: 0, name: 'Rack', color: '#b9a0e8' });
  add(d, { ...raw('box', { length: 360, width: 6, height: 20 }, { x: -260, y: -r1 - 2.5 * m - 10 - 8, z: -10 }), name: 'RackGuide', color: '#a3aebd' });
  text(d, -110, -110, `기어열: z20 → z40 (×−0.5) → z16 (×−2.5), 랙 (원주 ${(2 * Math.PI * r1).toFixed(1)} mm / 회전) — 연동 조인트`);
  return finish(d, [
    { ...makeJoint('revolute', base, g1, [0, 0, 0], Z, 'G1'), drive: { key: 'angle', from: 0, to: 360 } },
    { ...makeJoint('revolute', base, g2, [0, r1 + r2, 0], Z, 'G2'), follow: { joint: 'G1', key: 'angle', from: 'angle', ratio: -z1 / z2, phase: 0 } },
    { ...makeJoint('revolute', base, g3, [0, r1 + 2 * r2 + r3, 0], Z, 'G3'), follow: { joint: 'G2', key: 'angle', from: 'angle', ratio: -z2 / z3, phase: 0 } },
    { ...makeJoint('slider', base, rack, [0, -r1, 0], X, 'rack'), follow: { joint: 'G1', key: 'offset', from: 'angle', ratio: (r1 * Math.PI) / 180, phase: 0 } },
  ], { duration: 6, mode: 'bounce' });
}

// ───────────────────────── a screw vise

export function screwVise() {
  const d = createDrawing({ title: '나사 바이스 (Tr20×6)', author: 'SHKWON' });
  Object.assign(d.sheet, { number: 'MO-004', material: 'FC300 · S45C', company: 'MyCAD samples' });
  const pitch = 6; const turns = 10;
  const base = add(d, { ...raw('box', { length: 360, width: 120, height: 30 }, { x: 0, y: 0, z: 0 }), name: 'Body', color: '#5d7fa3' });
  add(d, { ...raw('box', { length: 30, width: 120, height: 50 }, { x: 0, y: 0, z: 30 }), name: 'ScrewBlock', color: '#5d7fa3' });
  add(d, { ...raw('box', { length: 40, width: 120, height: 80 }, { x: 320, y: 0, z: 30 }), name: 'FixedJaw', color: '#5d7fa3' });
  const jaw = add(d, { ...raw('box', { length: 40, width: 120, height: 70 }, { x: 120, y: 0, z: 30 }), name: 'MovingJaw', color: '#7b9cc1' });
  const screw = add(d, { ...raw('cylinder', { radius: 10, height: 190 }, { x: -60, y: 60, z: 60, ry: 90 }), name: 'Screw', color: '#c9cdd4' });
  const thread = add(d, { ...raw('helix', { radius: 10.5, pitch, turns: 15, wire: 1.4 }, { x: 30, y: 60, z: 60, ry: 90 }), name: 'Thread', color: '#a0a6b0' });
  const handle = add(d, { ...raw('cylinder', { radius: 5, height: 160 }, { x: -50, y: -20, z: 60, rx: -90 }), name: 'Handle', color: '#c9cdd4' });
  const knobs = [-25, 145].map((y, i) => add(d, { ...raw('sphere', { radius: 10 }, { x: -50, y, z: 60 }), name: `Knob${i + 1}`, color: '#e5484d' }));
  text(d, 0, -40, `나사 바이스: 핸들 ${turns} 회전 = 나사 ${turns * pitch} mm 전진 → 움직이는 조가 따라감 (나사 연동: 회전 → 이동 ${pitch} mm/회전)`);
  return finish(d, [
    { ...makeJoint('cylindrical', base, screw, [-60, 60, 60], X, 'screw'), drive: { key: 'angle', from: 0, to: 360 * turns }, follow: { joint: 'screw', key: 'offset', from: 'angle', ratio: pitch / 360, phase: 0 } },
    makeJoint('fixed', screw, thread, [-60, 60, 60], X, 'thread'),
    makeJoint('fixed', screw, handle, [-50, 60, 60], X, 'handle'),
    ...knobs.map((k, i) => makeJoint('fixed', handle, k, [-50, i ? 145 : -25, 60], X, `knob${i + 1}`)),
    { ...makeJoint('slider', base, jaw, [140, 60, 30], X, 'jaw'), follow: { joint: 'screw', key: 'offset', from: 'angle', ratio: pitch / 360, phase: 0 } },
  ], { duration: 6, mode: 'bounce' });
}

// ───────────────────────── a robot arm with a gripper

export function robotArm() {
  const d = createDrawing({ title: '로봇 팔 (회전대 · 어깨 · 팔꿈치 · 그리퍼)', author: 'SHKWON' });
  Object.assign(d.sheet, { number: 'MO-005', material: 'A7075', company: 'MyCAD samples' });
  const base = add(d, { ...raw('cylinder', { radius: 90, height: 30 }, { x: 0, y: 0, z: 0 }), name: 'Base', color: '#7a8494' });
  const table = add(d, { ...bool('union', [raw('cylinder', { radius: 70, height: 20 }, { x: 0, y: 0, z: 30 }), raw('box', { length: 60, width: 60, height: 90 }, { x: -30, y: -30, z: 50 })]), name: 'Turntable', color: '#d9822b' });
  const shoulder = [0, 120]; const upper = 200; const s0 = 60;
  const elbow = [shoulder[0] + upper * Math.cos((s0 * Math.PI) / 180), shoulder[1] + upper * Math.sin((s0 * Math.PI) / 180)];
  const fore = 170; const e0 = -25;
  const wrist = [elbow[0] + fore * Math.cos((e0 * Math.PI) / 180), elbow[1] + fore * Math.sin((e0 * Math.PI) / 180)];
  const upperArm = add(d, { ...link(upper, 44, 26, [shoulder[0], 13, shoulder[1]], s0), name: 'UpperArm', color: '#3a6cf0' });
  const foreArm = add(d, { ...link(fore, 34, 20, [elbow[0], 10, elbow[1]], e0), name: 'Forearm', color: '#7fb3e6' });
  const palm = add(d, { ...raw('box', { length: 20, width: 80, height: 30 }, { x: wrist[0], y: -40, z: wrist[1] - 15 }), name: 'Palm', color: '#7a8494' });
  const fingers = [-1, 1].map((side) => add(d, { ...raw('box', { length: 50, width: 8, height: 20 }, { x: wrist[0] + 20, y: side * 22 - 4, z: wrist[1] - 10 }), name: side < 0 ? 'FingerA' : 'FingerB', color: '#c9cdd4' }));
  add(d, { ...raw('box', { length: 30, width: 30, height: 30 }, { x: 300, y: 120, z: 0 }), name: 'Part to pick', color: '#e8a53a' });
  text(d, -100, -140, '로봇 팔: 회전대 0→150°, 어깨 0→35°, 팔꿈치 0→−50°, 그리퍼 열림 — 구동 4개가 함께 왕복');
  return finish(d, [
    { ...makeJoint('revolute', base, table, [0, 0, 30], Z, 'turntable'), drive: { key: 'angle', from: 0, to: 150 } },
    { ...makeJoint('revolute', table, upperArm, [shoulder[0], 0, shoulder[1]], Y, 'shoulder'), drive: { key: 'angle', from: 0, to: 35 } },
    { ...makeJoint('revolute', upperArm, foreArm, [elbow[0], 0, elbow[1]], Y, 'elbow'), drive: { key: 'angle', from: 0, to: -50 } },
    makeJoint('fixed', foreArm, palm, [wrist[0], 0, wrist[1]], Y, 'wrist'),
    { ...makeJoint('slider', palm, fingers[0], [wrist[0], 0, wrist[1]], [0, -1, 0], 'fingerA'), drive: { key: 'offset', from: 0, to: 12 } },
    { ...makeJoint('slider', palm, fingers[1], [wrist[0], 0, wrist[1]], Y, 'fingerB'), follow: { joint: 'fingerA', key: 'offset', from: 'offset', ratio: 1, phase: 0 } },
  ], { duration: 5, mode: 'bounce' });
}

// ───────────────────────── a room with a swinging door, a sliding door and a window

export function houseDoors() {
  const d = createDrawing({ title: '방의 문과 창 (여닫이 · 미닫이 · 여닫이 창)', author: 'SHKWON' });
  Object.assign(d.sheet, { number: 'MO-006', material: '', company: 'MyCAD samples' });
  const W = 5000; const D = 4000; const H = 2600; const t = 200;
  const floor = add(d, { ...raw('box', { length: W, width: D, height: 150 }, { x: 0, y: 0, z: -150 }), name: 'Floor', color: '#c8b89a' });
  const wall = (x, y, length, width, name, height = H, z = 0) => add(d, { ...raw('box', { length, width, height }, { x, y, z }), name, color: '#e6e1d8' });
  // Front wall (y = 0) with a door 900 wide at x 600; right wall with a 1800 patio opening; back wall with a window.
  wall(0, 0, 600, t, 'WallFrontA'); wall(1500, 0, W - 1500, t, 'WallFrontB'); wall(600, 0, 900, t, 'WallFrontHead', H - 2100, 2100);
  wall(W - t, t, t, 600, 'WallRightA'); wall(W - t, 2400, t, D - 2400, 'WallRightB'); wall(W - t, 600, t, 1800, 'WallRightHead', H - 2200, 2200);
  wall(0, D - t, 1800, t, 'WallBackA'); wall(3000, D - t, W - 3000, t, 'WallBackB'); wall(1800, D - t, 1200, t, 'WallBackSill', 900); wall(1800, D - t, 1200, t, 'WallBackHead', H - 2100, 2100);
  wall(0, t, t, D - 2 * t, 'WallLeft');
  const door = add(d, { ...raw('box', { length: 880, width: 40, height: 2080 }, { x: 610, y: 80, z: 5 }), name: 'Door', color: '#9a6b3f' });
  const knob = add(d, { ...raw('sphere', { radius: 30 }, { x: 1400, y: 160, z: 1000 }), name: 'DoorKnob', color: '#c9cdd4' });
  const slide = add(d, { ...raw('box', { length: 30, width: 900, height: 2180 }, { x: W - t + 20, y: 1500, z: 10 }), name: 'SlidingDoor', color: '#9fd3e6' });
  add(d, { ...raw('box', { length: 30, width: 900, height: 2180 }, { x: W - t + 70, y: 600, z: 10 }), name: 'FixedPane', color: '#9fd3e6' });
  const sash = add(d, { ...raw('box', { length: 1180, width: 50, height: 1180 }, { x: 1810, y: D - t + 75, z: 910 }), name: 'WindowSash', color: '#9fd3e6' });
  text(d, 0, -600, '방: 여닫이 문 0→100°, 미닫이 문 0→900 mm, 여닫이 창 0→70° — 왕복 (경첩 = 회전 조인트, 레일 = 슬라이더)', 120);
  return finish(d, [
    { ...makeJoint('revolute', floor, door, [610, 80, 0], Z, 'hinge'), drive: { key: 'angle', from: 0, to: 100 } },
    makeJoint('fixed', door, knob, [1400, 160, 1000], Z, 'knob'),
    { ...makeJoint('slider', floor, slide, [W - t, 1500, 0], [0, -1, 0], 'rail'), drive: { key: 'offset', from: 0, to: 900 } },
    { ...makeJoint('revolute', floor, sash, [1810, D - t + 75, 910], Z, 'casement'), drive: { key: 'angle', from: 0, to: 70 } },
  ], { duration: 6, mode: 'bounce' });
}
