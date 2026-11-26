// Every start-page sample moves: a part sample gets a "motion stage" — an assembly in which the part works
// (gears mesh, a screw is run in and out, a link swings on the clevis pin, a crankshaft turns in its bearings,
// a workpiece is turned and tilted on a trunnion table …) with a motion study; assemblies without one get motors.
// The stage's own parts (frames, shafts, bearing blocks, tables) are marked `stage: true`, the stage assembly too.
// Built in the old Y-up frame like the samples (samples.js turns the project to Z up afterwards).
// Motors here name their axis directly ({ kind: 'axis', point, dir } in the component's own frame) — no face —
// so a stage needs no mates unless a linkage does (slider-crank, cams, universal joint).
// Nothing from the imported modules is used at module top level (samples.js imports this file).
import { builder, circle, poly } from '../samples.js';
import { addCircle, addLine, addRectangle, addSlot } from '../sketch.js';
import { circularSketchPattern } from '../sketchtools.js';
import { regenerate } from '../features.js';
import { createAssembly, createPart, newId } from '../document.js';
import { quatFromAxisAngle, quatIdentity, quatMultiply, rotate, placeShape, mateEntityOfFace, captureMate } from '../assembly.js';
import { faceSignature, isCylinder } from '../refs.js';

// ───────────────────────── small helpers

const RX = (deg) => quatFromAxisAngle([1, 0, 0], deg);
const RY = (deg) => quatFromAxisAngle([0, 1, 0], deg);
const RZ = (deg) => quatFromAxisAngle([0, 0, 1], deg);
const qmul = (...qs) => qs.reduce((a, b) => quatMultiply(a, b));
const sub = (a, b) => a.map((v, i) => v - b[i]);
const add = (a, b) => a.map((v, i) => v + b[i]);
const mul = (a, s) => a.map((v) => v * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };
const conj = (q) => [-q[0], -q[1], -q[2], q[3]];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r1 = (v) => Math.round(v * 10) / 10;
const X = [1, 0, 0]; const Y = [0, 1, 0]; const Z = [0, 0, 1];

/** Rig colours: the stage stays grey so the sample's part stands out. */
const GREY = '#8b96a3'; const DARK = '#56606b'; const BLUE = '#3f74b5'; const RUBBER = '#2b2d31';

/** A local axis name → the rotation that turns it onto +X (the stages' shafts run along X). */
const ONTO_X = { x: quatIdentity(), y: RZ(-90), z: RY(90) };

// Bodies are built once per part (the stage reads boxes and faces).
const bodies = new WeakMap();
function bodyOf(part, project) {
  if (!bodies.has(part)) bodies.set(part, regenerate(part, { project }).body);
  return bodies.get(part);
}
/** The part's box placed at `rotation` (position 0): { lo, hi, size, mid }. */
function boxOf(part, project, rotation = quatIdentity()) {
  const [lo, hi] = placeShape(bodyOf(part, project), { position: [0, 0, 0], rotation }).boundingBox.bounds;
  return { lo, hi, size: sub(hi, lo), mid: mul(add(lo, hi), 0.5) };
}

// ───────────────────────── world-aligned sketching (Y up: top (u, v) → (x, −z), front → (x, y), right → (−z, y))

const BASE = { y: 'top', z: 'front', x: 'right' };
/** World coordinates of the two other axes → the sketch's (u, v). */
const UV = {
  y: (x, z) => [x, -z],
  z: (x, y) => [x, y],
  x: (y, z) => [-z, y],
};
const planeAt = (b, axis, at) => (Math.abs(at) < 1e-9 ? BASE[axis] : b.plane(BASE[axis], at));

/** A prism along a world axis from `from` to `to`, its section drawn by draw(k, uv) (uv: world pair → sketch). */
function prism(b, axis, from, to, draw, op = 'add', name = null) {
  // A cut runs into the material (against the plane's normal): cuts are drawn half way and cut both ways.
  if (op !== 'add') {
    const s = b.sketch(planeAt(b, axis, (from + to) / 2), (k) => draw(k, UV[axis]), name);
    return b.add('extrude', { sketch: s.id, end: 'midplane', depth: to - from, op });
  }
  const s = b.sketch(planeAt(b, axis, from), (k) => draw(k, UV[axis]), name);
  return b.add('extrude', { sketch: s.id, depth: to - from });
}
/** An axis-aligned box. */
function box(b, lo, hi, op = 'add', name = null) {
  return prism(b, 'y', lo[1], hi[1], (k, uv) => { const p = uv(lo[0], lo[2]); const q = uv(hi[0], hi[2]); addRectangle(k, Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])); }, op, name);
}
/** A cylinder (a tube with rIn) along a world axis through the point `c` ([x, y, z]; its coordinate along the axis is not used). */
function cyl(b, axis, c, r, from, to, { rIn = 0, op = 'add', name = null } = {}) {
  return prism(b, axis, from, to, (k, uv) => {
    const [u, v] = axis === 'y' ? uv(c[0], c[2]) : axis === 'z' ? uv(c[0], c[1]) : uv(c[1], c[2]);
    addCircle(k, u, v, r);
    if (rIn > 0) addCircle(k, u, v, rIn);
  }, op, name);
}
/** Holes (cut cylinders) along an axis. */
const hole = (b, axis, c, r, from, to) => cyl(b, axis, c, r, from, to, { op: 'cut' });

/** A stage part: built by fn(b), marked as the stage's, grey unless told otherwise. */
function rig(project, name, fn, { material = 'steel-1020', color = GREY, partNo = 'STG' } = {}) {
  const b = builder(createPart(name, { material, color, partNo, stage: true }));
  fn(b);
  project.parts.push(b.part);
  return b.part;
}

/** The stage assembly: made active, a motion study of `duration` s. */
function stageAssembly(project, name, duration = 6) {
  const asm = createAssembly(name, { stage: true, motion: { duration, motors: [] } });
  project.assemblies.push(asm);
  project.active = { kind: 'assembly', id: asm.id };
  return asm;
}

/** A component; every stage component is fixed (its motor moves it). */
function put(asm, part, position, rotation = quatIdentity(), fixed = true) {
  const count = asm.components.filter((c) => c.part === part.id).length;
  const c = { id: newId('cmp'), part: part.id, name: `${part.name}<${count + 1}>`, position, rotation, fixed };
  asm.components.push(c);
  return c;
}
/** Placed so its box (at `rotation`) has its minimum / centre / maximum (per axis: 'min' | 'mid' | 'max') at `at`. */
function putBox(asm, project, part, rotation, at, how = ['mid', 'min', 'mid'], fixed = true) {
  const bx = boxOf(part, project, rotation);
  const pick = (k) => (how[k] === 'min' ? bx.lo[k] : how[k] === 'max' ? bx.hi[k] : bx.mid[k]);
  return put(asm, part, [0, 1, 2].map((k) => at[k] - pick(k)), rotation, fixed);
}

/**
 * A motor about / along a world axis through `point`: rotary (rpm), or a swing (amplitude ° or mm over `period` s;
 * oneWay: from 0 to the amplitude and back), mounted on `parent` (carried along by that component's motion).
 */
function motor(asm, comp, point, dir, { linear = false, speed = 0, amplitude = 0, period = 0, oneWay = false, parent = null } = {}) {
  const q = conj(comp.rotation);
  const ref = { comp: comp.id, kind: 'axis', point: rotate(q, sub(point, comp.position)).map((v) => Math.round(v * 1e6) / 1e6), dir: unit(rotate(q, dir)).map((v) => Math.round(v * 1e9) / 1e9) };
  const m = { id: newId('motor'), kind: linear ? 'linear' : 'rotary', comp: comp.id, ref, speed };
  if (amplitude && period) { m.amplitude = amplitude; m.period = period; }
  if (oneWay) m.oneWay = true;
  if (parent) m.parent = parent.id;
  asm.motion.motors.push(m);
  return m;
}

/** Mate references of a part's faces (the part built once): pick(comp, test(signature)) → mate entity. */
function picker(part, project) {
  const faces = bodyOf(part, project).faces.map((f) => ({ f, s: faceSignature(f) }));
  return (comp, test) => {
    const hit = faces.find((x) => test(x.s, x.f));
    if (!hit) throw new Error(`motion stage: face not found in ${part.name}`);
    return { comp: comp.id, ...mateEntityOfFace(hit.f, faceSignature) };
  };
}
const mate = (asm, type, a, b, extra = {}) => { const m = { id: newId('mate'), type, name: '', a, b, ...extra }; asm.mates.push(m); return m; };
const nearV = (a, b, tol = 0.05) => Math.abs(a - b) < tol;
const CYL = (r, extra = () => true) => (f) => isCylinder(f.type) && nearV(f.radius ?? -1, r, 0.02) && extra(f);
const PLN = (n, c, extra = () => true) => (f) => f.type === 'PLANE' && dot(f.normal, n) > 0.999 && nearV(dot(f.center, n), c, 1e-3) && extra(f);

// ───────────────────────── stage kits

/** A base plate whose top is at y = 0 (fillets on its corners), lo/hi in x and z. */
function basePlate(b, x0, x1, z0, z1, t = 16) {
  box(b, [x0, -t, z0], [x1, 0, z1], 'add', 'Base');
  b.add('fillet', { radius: Math.min(10, (x1 - x0) / 8, (z1 - z0) / 8), edges: b.edges((e) => e.type === 'LINE' && Math.abs(e.dir[1]) > 0.99) });
}

/**
 * Two-axis trunnion table (the machining fixture of a 5-axis mill): the cradle tilts ±tilt° about X, the rotary
 * table on it turns about Y, and the sample's part, clamped on the table, does both.
 */
function trunnion(project, L, part, { rotation = quatIdentity(), tilt = 30, rpm = 6, period = 6, duration = 10 } = {}) {
  const bx = boxOf(part, project, rotation);
  const H = bx.size[1];
  const R = Math.hypot(bx.size[0], bx.size[2]) / 2;
  const s = clamp(R / 60, 0.6, 3); // the rig's scale
  const Rt = Math.max(30, 0.7 * R); const tableT = 10 * s; const plateT = 12 * s;
  const gap = R + 10 * s; const cheekT = 14 * s; const cheekZ = Math.max(30, Math.min(Rt, 60 * s)); const Zc = Rt + 6 * s;
  const pinR = 9 * s; const upT = 26 * s;
  const dy = H / 2 + tableT + plateT;
  // The lowest point of the cradle / the part over the swing (the largest of r·cos(θ − φ) for θ in 0…tilt).
  const reach = (a, c) => { const phi = Math.atan2(c, a); const t = (tilt * Math.PI) / 180; return Math.hypot(a, c) * (phi <= t ? 1 : Math.cos(phi - t)); };
  const Ya = Math.max(reach(dy, Zc), reach(H / 2, R)) + 25 * s;
  const yT = Ya - H / 2;
  const xc = gap + cheekT; const xu = xc + 4 * s;
  const base = rig(project, L('트러니언 베이스', 'Trunnion base'), (b) => {
    basePlate(b, -(xu + upT + 12 * s), xu + upT + 12 * s, -Math.max(Zc, R) - 20 * s, Math.max(Zc, R) + 20 * s, 16 * s);
    for (const sg of [-1, 1]) {
      const x0 = sg > 0 ? xu : -xu - upT; const x1 = sg > 0 ? xu + upT : -xu;
      box(b, [x0, 0, -(pinR + 20 * s)], [x1, Ya + pinR + 18 * s, pinR + 20 * s], 'add', sg > 0 ? 'Upright R' : 'Upright L');
      hole(b, 'x', [0, Ya, 0], pinR + 1.5 * s, x0 - 1, x1 + 1);
    }
  }, { color: DARK });
  const cradle = rig(project, L('트러니언 요람', 'Trunnion cradle'), (b) => {
    const y0 = yT - tableT - plateT; const y1 = yT - tableT;
    box(b, [-xc, y0, -Zc], [xc, y1, Zc], 'add', 'Cradle plate');
    for (const sg of [-1, 1]) {
      const x0 = sg > 0 ? gap : -xc; const x1 = sg > 0 ? xc : -gap;
      box(b, [x0, y0, -cheekZ], [x1, Ya + pinR + 10 * s, cheekZ], 'add', sg > 0 ? 'Cheek R' : 'Cheek L');
      cyl(b, 'x', [0, Ya, 0], pinR, sg > 0 ? xc : -xc - upT - 8 * s, sg > 0 ? xc + upT + 8 * s : -xc, { name: 'Trunnion pin' });
    }
  });
  const table = rig(project, L('회전 테이블', 'Rotary table'), (b) => {
    cyl(b, 'y', [0, 0, 0], Rt, yT - tableT, yT, { name: 'Table' });
    // T slots across the table show it turning.
    for (const a of [0, 60, 120]) {
      const c = Math.cos((a * Math.PI) / 180); const sn = Math.sin((a * Math.PI) / 180);
      prism(b, 'y', yT - 3 * s, yT, (k) => { const w = 3 * s; const l = Rt * 0.92; poly(k, [[-l * c + w * sn, -l * sn - w * c], [l * c + w * sn, l * sn - w * c], [l * c - w * sn, l * sn + w * c], [-l * c - w * sn, -l * sn + w * c]]); }, 'cut', 'T slot');
    }
  }, { color: BLUE });
  const asm = stageAssembly(project, L('트러니언 테이블 가공', 'On a trunnion table'), duration);
  put(asm, base, [0, 0, 0]);
  const cC = put(asm, cradle, [0, 0, 0]);
  const cT = put(asm, table, [0, 0, 0]);
  const cW = putBox(asm, project, part, rotation, [0, yT, 0], ['mid', 'min', 'mid']);
  motor(asm, cC, [0, Ya, 0], X, { amplitude: tilt, period });
  motor(asm, cT, [0, yT, 0], Y, { speed: rpm, parent: cC });
  motor(asm, cW, [0, yT, 0], Y, { speed: rpm, parent: cC });
  return asm;
}

/**
 * Shafts along X held in bearing blocks on a base: shafts [{ y, z, r, x0, x1 }], blocks at `blockXs` (each block
 * holds every shaft that passes it). → the frame part and the shaft parts.
 */
function shaftFrame(project, L, shafts, blockXs, { blockT = 18, color = DARK } = {}) {
  const top = Math.max(...shafts.map((s) => s.y + s.r)) + 16;
  const zLo = Math.min(...shafts.map((s) => s.z - s.r)) - 18; const zHi = Math.max(...shafts.map((s) => s.z + s.r)) + 18;
  const frame = rig(project, L('베어링 블록 프레임', 'Bearing-block frame'), (b) => {
    const xs = [...blockXs, ...shafts.flatMap((s) => [s.x0, s.x1])];
    basePlate(b, Math.min(...xs) - 20, Math.max(...xs) + 20, zLo - 25, zHi + 25);
    for (const x of blockXs) {
      box(b, [x - blockT / 2, 0, zLo], [x + blockT / 2, top, zHi], 'add', 'Bearing block');
      for (const s of shafts) if (s.x0 < x && s.x1 > x) hole(b, 'x', [0, s.y, s.z], s.r + 1.2, x - blockT / 2 - 1, x + blockT / 2 + 1);
    }
  }, { color });
  const parts = shafts.map((s, i) => s.make === false ? null : rig(project, L(`축 Ø${r1(2 * s.r)}`, `Shaft Ø${r1(2 * s.r)}`), (b) => {
    cyl(b, 'x', [0, s.y, s.z], s.r, s.x0, s.x1, { name: 'Shaft' });
    // A key flat on the end shows the shaft turning.
    box(b, [s.x1 - 14, s.y + s.r * 0.6, s.z - s.r], [s.x1 + 1, s.y + s.r + 1, s.z + s.r], 'cut', 'Flat');
    void i;
  }, { color: GREY, material: 'steel-4340' }));
  return { frame, shafts: parts };
}

/** The sample part on a shaft along X: its local axis (`axis`, through `at` in the part) on the line (y, z), centred at x. */
function onShaft(asm, project, part, { axis = 'z', at = [0, 0, 0], y, z, x, phase = 0, flip = false }) {
  const q = qmul(RX(phase), ONTO_X[axis], flip ? RZ(180) : quatIdentity());
  const p0 = sub([0, y, z], rotate(q, at));
  const bx = placeShape(bodyOf(part, project), { position: p0, rotation: q }).boundingBox.bounds;
  const dx = x - (bx[0][0] + bx[1][0]) / 2;
  return put(asm, part, [p0[0] + dx, p0[1], p0[2]], q);
}

/**
 * Nut runner: a carriage on a column lifts by `lift` mm and back (oneWay) while the socket and the screwed part turn
 * `lift / pitch` turns — a right-hand screw backed out and run in again. `axisPoint` = the screw axis at the part's
 * seat, the part already placed (component `comp`).
 */
function nutRunner(project, L, asm, comp, { axisPoint, pitch, lift, period = 6, socketR, socketY0, socketH = 30, down = false, socketIn = 0, hand = 1 }) {
  const sg = down ? -1 : 1; const dir = [0, sg, 0];
  const colX = socketR + 40;
  const yTop = axisPoint[1] + sg * (socketY0 + socketH + 20);
  const carriage = rig(project, L('너트 러너 헤드', 'Nut-runner head'), (b) => {
    const y0 = Math.min(yTop, yTop + sg * 24); const y1 = Math.max(yTop, yTop + sg * 24);
    box(b, [axisPoint[0] - socketR - 6, y0, axisPoint[2] - socketR - 6], [axisPoint[0] + colX + 14, y1, axisPoint[2] + socketR + 6], 'add', 'Arm');
    cyl(b, 'y', [axisPoint[0], 0, axisPoint[2]], socketR * 0.7, sg > 0 ? y1 : y0 - 40, sg > 0 ? y1 + 40 : y0, { name: 'Gear motor' });
  }, { color: BLUE });
  const socket = rig(project, L('소켓', 'Socket'), (b) => {
    const a = axisPoint[1] + sg * socketY0; const bb = axisPoint[1] + sg * (socketY0 + socketH + 20);
    cyl(b, 'y', [axisPoint[0], 0, axisPoint[2]], socketR, Math.min(a, bb), Math.max(a, bb), { name: 'Socket', rIn: socketIn });
    // Flats show it turning.
    for (const s of [-1, 1]) box(b, [axisPoint[0] - socketR - 1, Math.min(a, bb) + 4, axisPoint[2] + s * socketR * 0.75 - (s > 0 ? 0 : socketR)], [axisPoint[0] + socketR + 1, Math.max(a, bb) - 4, axisPoint[2] + s * socketR * 0.75 + (s > 0 ? socketR : 0)], 'cut', 'Wrench flat');
  }, { color: GREY, material: 'steel-4340' });
  const column = rig(project, L('러너 기둥', 'Runner column'), (b) => {
    const y0 = Math.min(axisPoint[1], yTop) - 30; const y1 = Math.max(axisPoint[1], yTop) + 60;
    box(b, [axisPoint[0] + colX + 14 + 1, y0, axisPoint[2] - 20], [axisPoint[0] + colX + 44, y1, axisPoint[2] + 20], 'add', 'Column');
  }, { color: DARK });
  put(asm, column, [0, 0, 0]);
  const cCar = put(asm, carriage, [0, 0, 0]);
  const cSock = put(asm, socket, [0, 0, 0]);
  const turns = (lift / pitch) * 360 * hand;
  motor(asm, cCar, axisPoint, dir, { linear: true, amplitude: lift, period, oneWay: true });
  motor(asm, cSock, axisPoint, dir, { amplitude: turns, period, oneWay: true, parent: cCar });
  motor(asm, comp, axisPoint, dir, { amplitude: turns, period, oneWay: true, parent: cCar });
}

/** A turntable (a column and a turning disc of radius r, top at y = h) and the part standing on it. */
function turntable(project, L, part, { rotation = quatIdentity(), rpm = 8, duration = 7.5, r = null, h = 40, gap = 0 } = {}) {
  const bx = boxOf(part, project, rotation);
  const R = r ?? Math.max(40, 0.62 * Math.hypot(bx.size[0], bx.size[2]));
  const stand = rig(project, L('턴테이블 받침', 'Turntable stand'), (b) => {
    cyl(b, 'y', [0, 0, 0], R * 0.8, 0, h - 12, { name: 'Stand' });
    cyl(b, 'y', [0, 0, 0], R * 1.05, -10, 0, { name: 'Foot' });
  }, { color: DARK });
  const disc = rig(project, L('턴테이블', 'Turntable'), (b) => {
    cyl(b, 'y', [0, 0, 0], R, h - 11, h, { name: 'Disc' });
    for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; cyl(b, 'y', [0.8 * R * Math.cos(a), 0, 0.8 * R * Math.sin(a)], Math.max(2, R * 0.04), h - 2, h, { op: 'cut' }); }
  }, { color: BLUE });
  const asm = stageAssembly(project, L('턴테이블 전시', 'On a turntable'), duration);
  put(asm, stand, [0, 0, 0]);
  const cD = put(asm, disc, [0, 0, 0]);
  const cP = putBox(asm, project, part, rotation, [0, h + gap, 0], ['mid', 'min', 'mid']);
  motor(asm, cD, [0, h, 0], Y, { speed: rpm });
  motor(asm, cP, [0, h, 0], Y, { speed: rpm });
  return { asm, disc: cD, comp: cP, h };
}

/** A linear slide: the part rides a carriage on two rails along `along` ('x' | 'z'), ±amp (or 0…amp oneWay). */
function slideRig(project, L, part, { rotation = quatIdentity(), along = 'x', amp = 60, period = 5, oneWay = false, name, duration = 10 } = {}) {
  const bx = boxOf(part, project, rotation);
  const len = (along === 'x' ? bx.size[0] : bx.size[2]); const wid = (along === 'x' ? bx.size[2] : bx.size[0]);
  const run = len + 2 * amp + 60; const W = Math.max(60, wid * 0.7);
  const A = (u, w) => (along === 'x' ? [u, w] : [w, u]);
  const bed = rig(project, L('리니어 가이드 베드', 'Linear-guide bed'), (b) => {
    const [x0, z0] = A(-run / 2, -W / 2 - 30); const [x1, z1] = A(run / 2, W / 2 + 30);
    basePlate(b, Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1), 20);
    for (const s of [-1, 1]) { const [a0, c0] = A(-run / 2 + 5, s * W / 2 - 8); const [a1, c1] = A(run / 2 - 5, s * W / 2 + 8); box(b, [Math.min(a0, a1), 0, Math.min(c0, c1)], [Math.max(a0, a1), 14, Math.max(c0, c1)], 'add', 'Rail'); }
  }, { color: DARK });
  const car = rig(project, L('캐리지', 'Carriage'), (b) => {
    const [x0, z0] = A(-len / 2 - 10, -W / 2 - 14); const [x1, z1] = A(len / 2 + 10, W / 2 + 14);
    box(b, [Math.min(x0, x1), 15, Math.min(z0, z1)], [Math.max(x0, x1), 30, Math.max(z0, z1)], 'add', 'Carriage plate');
  }, { color: BLUE });
  const asm = stageAssembly(project, name ?? L('리니어 슬라이드', 'On a linear slide'), duration);
  put(asm, bed, [0, 0, 0]);
  const cCar = put(asm, car, [0, 0, 0]);
  const cP = putBox(asm, project, part, rotation, [0, 30, 0], ['mid', 'min', 'mid']);
  const dir = along === 'x' ? X : Z;
  motor(asm, cCar, [0, 0, 0], dir, { linear: true, amplitude: amp, period, oneWay });
  motor(asm, cP, [0, 0, 0], dir, { linear: true, amplitude: amp, period, oneWay });
  return { asm, comp: cP, top: 30 };
}

/** A belt or chain loop round two wheels at z = ±c/2 on a line along X at height y: radii rIn…rOut, x0…x1. */
function loopPart(project, L, name, { y, c, rIn, rOut, x0, x1, color = RUBBER, material = 'rubber' }) {
  return rig(project, name, (b) => {
    prism(b, 'x', x0, x1, (k, uv) => {
      const [u1, v1] = uv(y, -c / 2); const [u2, v2] = uv(y, c / 2);
      addSlot(k, u1, v1, u2, v2, rOut);
      addSlot(k, u1, v1, u2, v2, rIn);
    }, 'add', 'Loop');
  }, { color, material });
}

export const STAGE = {
  RX, RY, RZ, qmul, X, Y, Z, GREY, DARK, BLUE, RUBBER, ONTO_X,
  bodyOf, boxOf, prism, box, cyl, hole, rig, stageAssembly, put, putBox, motor, picker, mate, CYL, PLN,
  basePlate, trunnion, shaftFrame, onShaft, nutRunner, turntable, slideRig, loopPart, captureMate, circle, addLine, circularSketchPattern,
};
