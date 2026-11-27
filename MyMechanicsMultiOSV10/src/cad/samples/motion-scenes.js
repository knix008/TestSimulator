// The motion stage of every start-page sample (see motion.js): what moves and how, sample by sample.
// Y-up coordinates (the samples' builders' frame); each scene gets the built project and the language picker L.
// Nothing from the imported modules is used at module top level.
import { STAGE } from './motion.js';
import { faceOutline } from './assembly.js';
import { addArc, addCircle, addLine, addRectangle, addSlot } from '../sketch.js';
import { circularSketchPattern } from '../sketchtools.js';
import { rotate, quatIdentity } from '../assembly.js';
import { newId } from '../document.js';
import { poly } from '../samples.js';

const S = () => STAGE;
const sub = (a, b) => a.map((v, i) => v - b[i]);
const add = (a, b) => a.map((v, i) => v + b[i]);
const mul = (a, s) => a.map((v) => v * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };
const rad = (d) => (d * Math.PI) / 180;

/** The project's part by name prefix (Korean or English names both start the same way in a sample) or index. */
const partAt = (project, i = 0) => project.parts[i];
/** A motor on a component about its own local axis (point, dir in the part). */
function motorLocal(asm, comp, point, dir, opts) {
  return S().motor(asm, comp, add(comp.position, rotate(comp.rotation, point)), rotate(comp.rotation, dir), opts);
}
/** A copy of an assembly's components (new ids, every one fixed, no mates): the stage moves them freely. */
function copyAssembly(project, asm, name) {
  const out = S().stageAssembly(project, name, 6);
  const ids = new Map();
  for (const c of asm.components) {
    const id = newId('cmp'); ids.set(c.id, id);
    out.components.push({ ...structuredClone(c), id, fixed: true });
  }
  return { asm: out, comp: (old) => out.components.find((c) => c.id === ids.get(old.id)) };
}
/** Rotary motion of a gear pair's driven member that matches the driver at their pitch point (equal pitch radii). */
function matchSign(aDir, bDir, aPoint, bPoint, pitch) {
  const va = cross(aDir, sub(pitch, aPoint)); const vb = cross(bDir, sub(pitch, bPoint));
  return dot(va, vb) >= 0 ? 1 : -1;
}

// ───────────────────────── reusable scenes

/** Rollers along X (radius r, length across z), a frame on legs; a part riding them back and forth ±amp. */
function conveyor(project, L, part, { amp = 120, period = 6, rotation = quatIdentity(), H = 120 } = {}) {
  const { rig, box, cyl, hole, put, putBox, motor, stageAssembly, boxOf, DARK, GREY } = S();
  const bx = boxOf(part, project, rotation);
  const r = 15; const pitch = 50;
  const width = bx.size[2] + 40; const len = bx.size[0] + 2 * amp + 80;
  const n = Math.max(4, Math.floor(len / pitch));
  const xs = Array.from({ length: n }, (_, i) => -((n - 1) * pitch) / 2 + i * pitch);
  const frame = rig(project, L('컨베이어 프레임', 'Conveyor frame'), (b) => {
    for (const sg of [-1, 1]) {
      const z0 = sg * (width / 2 + 2); const z1 = sg * (width / 2 + 14);
      box(b, [xs[0] - 40, H - 30, Math.min(z0, z1)], [xs.at(-1) + 40, H + 18, Math.max(z0, z1)], 'add', 'Side rail');
      for (const x of [xs[0] - 20, xs.at(-1) + 20]) box(b, [x - 15, 0, Math.min(z0, z1)], [x + 15, H - 30, Math.max(z0, z1)], 'add', 'Leg');
      for (const x of xs) hole(b, 'z', [x, H, 0], 4.5, Math.min(z0, z1) - 1, Math.max(z0, z1) + 1);
    }
    box(b, [xs[0] - 40, 0, -width / 2 - 14], [xs.at(-1) + 40, 10, width / 2 + 14], 'add', 'Floor tie');
  }, { color: DARK });
  const roller = rig(project, L('롤러', 'Roller'), (b) => {
    cyl(b, 'z', [0, 0, 0], r, -width / 2 + 1, width / 2 - 1, { name: 'Roller' });
    cyl(b, 'z', [0, 0, 0], 4, -width / 2 - 14, width / 2 + 14, { name: 'Spindle' });
    box(b, [-r - 1, -1.5, -width / 2], [r + 1, 1.5, -width / 2 + 6], 'cut', 'Groove');
  }, { color: GREY });
  const asm = stageAssembly(project, L('롤러 컨베이어', 'On a roller conveyor'), period * 2);
  put(asm, frame, [0, 0, 0]);
  const turn = (amp / r) * (180 / Math.PI);
  for (const x of xs) motor(asm, put(asm, roller, [x, H, 0]), [x, H, 0], [0, 0, -1], { amplitude: turn, period });
  const cP = putBox(asm, project, part, rotation, [0, H + r, 0], ['mid', 'min', 'mid']);
  motor(asm, cP, [0, 0, 0], [1, 0, 0], { linear: true, amplitude: amp, period });
  return asm;
}

/** A shaft along X turned between centres (a lathe: chuck, tailstock, bed): the part is the shaft. */
function lathe(project, L, part, { axis = 'x', rpm = 40 } = {}) {
  const { rig, box, cyl, put, onShaft, motor, stageAssembly, boxOf, ONTO_X, DARK, GREY, BLUE } = S();
  const bx = boxOf(part, project, ONTO_X[axis]);
  const R = Math.max(bx.size[1], bx.size[2]) / 2; const H = R + 90;
  const len = bx.size[0];
  const bed = rig(project, L('선반 베드', 'Lathe bed'), (b) => {
    box(b, [-len / 2 - 160, 0, -70], [len / 2 + 140, 40, 70], 'add', 'Bed');
    box(b, [-len / 2 - 160, 40, -70], [-len / 2 - 60, H + 50, 70], 'add', 'Headstock');
    box(b, [len / 2 + 30, 40, -45], [len / 2 + 90, H - 20, 45], 'add', 'Tailstock');
    cyl(b, 'x', [0, H, 0], 22, len / 2 + 30, len / 2 + 120, { name: 'Quill' });
    const tip = b.sketch(b.plane('right', len / 2 + 1.5), (k) => { const c = addCircle(k, 0, H, 14); void c; });
    b.add('extrude', { sketch: tip.id, depth: 28.5, draft: true, draftAngle: -20 });
  }, { color: DARK });
  const chuck = rig(project, L('척', 'Chuck'), (b) => {
    cyl(b, 'x', [0, H, 0], R + 40, -len / 2 - 58, -len / 2 - 12, { name: 'Chuck body' });
    for (let i = 0; i < 3; i++) {
      const a = (i * 2 * Math.PI) / 3; const c = Math.cos(a); const s = Math.sin(a);
      // Jaws stand off the part (they do not grip it here, so the part's own ends stay as they are).
      const rr = R + 6; const w = 7;
      const p = [[rr * c - w * s, rr * s + w * c], [(rr + 26) * c - w * s, (rr + 26) * s + w * c], [(rr + 26) * c + w * s, (rr + 26) * s - w * c], [rr * c + w * s, rr * s - w * c]];
      const sk = b.sketch(b.plane('right', -len / 2 - 12), (k) => poly(k, p.map(([y, z]) => [-z, y + H])));
      b.add('extrude', { sketch: sk.id, depth: 10 });
    }
  }, { color: BLUE });
  const asm = stageAssembly(project, L('선반 가공', 'Turning on a lathe'), 6);
  put(asm, bed, [0, 0, 0]);
  const cC = put(asm, chuck, [0, 0, 0]);
  const cP = onShaft(asm, project, part, { axis, at: [0, 0, 0], y: H, z: 0, x: 0 });
  motor(asm, cC, [0, H, 0], [1, 0, 0], { speed: rpm });
  motor(asm, cP, [0, H, 0], [1, 0, 0], { speed: rpm });
  void GREY;
  return asm;
}

/** A pendulum / lever: the part swings ±amp° about a world axis through `pivot`; extra comps swing with it. */
function swing(asm, comps, pivot, dir, amp, period) {
  for (const c of comps) S().motor(asm, c, pivot, dir, { amplitude: amp, period });
}

/** A pair of identical gears (or wheels) on two shafts along X, at z = ±c/2, height H; `phase` turns the second. */
function wheelPair(project, L, part, { axis = 'z', c, H, r, phase = 0, x = 0, rpm = 20, blockXs, shaftX = [-60, 60], ratio = -1, title }) {
  const { shaftFrame, put, onShaft, motor, stageAssembly } = S();
  const { frame, shafts } = shaftFrame(project, L, [{ y: H, z: -c / 2, r, x0: shaftX[0], x1: shaftX[1] }, { y: H, z: c / 2, r, x0: shaftX[0], x1: shaftX[1] }], blockXs);
  const asm = stageAssembly(project, title ?? L('맞물림 구동', 'Meshing drive'), 6);
  put(asm, frame, [0, 0, 0]);
  const out = [];
  for (const [i, z] of [-c / 2, c / 2].entries()) {
    const cs = put(asm, shafts[i], [0, 0, 0]);
    const cp = onShaft(asm, project, part, { axis, y: H, z, x, phase: i ? phase : 0 });
    const speed = i ? rpm * ratio : rpm;
    motor(asm, cs, [0, H, z], [1, 0, 0], { speed });
    motor(asm, cp, [0, H, z], [1, 0, 0], { speed });
    out.push(cp);
  }
  return { asm, comps: out };
}

// ───────────────────────── the scenes

export const SCENES = {
  // ── basic parts
  basMountBracket: (p, L) => S().trunnion(p, L, partAt(p)),
  basManifold: (p, L) => S().trunnion(p, L, partAt(p)),
  basPipeTee: (p, L) => S().trunnion(p, L, partAt(p), { tilt: 25 }),
  basNamePlate: (p, L) => S().trunnion(p, L, partAt(p), { tilt: 35 }),
  basClevis(p, L) {
    // A rod-eye link on the clevis pin swings ±50°; the clevis is screwed into a block.
    const { rig, box, cyl, hole, put, motor, stageAssembly, DARK, GREY, BLUE } = S();
    const part = partAt(p);
    const block = rig(p, L('클레비스 받침 블록', 'Clevis block'), (b) => {
      box(b, [-40, -62, -40], [40, -22, 40], 'add', 'Block');
      hole(b, 'y', [0, 0, 0], 10.8, -63, -21);
      box(b, [-70, -78, -60], [70, -62, 60], 'add', 'Base');
    }, { color: DARK });
    const pin = rig(p, L('클레비스 핀 Ø16', 'Clevis pin Ø16'), (b) => {
      cyl(b, 'x', [0, 45, 0], 7.85, -24, 24, { name: 'Pin' });
      cyl(b, 'x', [0, 45, 0], 12, 20.5, 25, { name: 'Head' });
      cyl(b, 'x', [0, 45, 0], 2, -30, -24, { name: 'Cotter' });
    }, { color: GREY, material: 'steel-4340' });
    const link = rig(p, L('로드 아이 링크', 'Rod-eye link'), (b) => {
      cyl(b, 'x', [0, 45, 0], 14, -7, 7, { rIn: 8.1, name: 'Eye' });
      box(b, [-7, 57, -8], [7, 170, 8], 'add', 'Arm');
      cyl(b, 'x', [0, 180, 0], 14, -7, 7, { rIn: 6, name: 'Far eye' });
    }, { color: BLUE, material: 'steel-4340' });
    const asm = stageAssembly(p, L('클레비스 링크 요동', 'Clevis and swinging link'), 8);
    put(asm, block, [0, 0, 0]); put(asm, part, [0, 0, 0]); put(asm, pin, [0, 0, 0]);
    const cL = put(asm, link, [0, 0, 0]);
    motor(asm, cL, [0, 45, 0], [1, 0, 0], { amplitude: 50, period: 4 });
  },
  basBearingCap(p, L) {
    // The cap closes a split housing; a shaft with a pulley turns in the bore.
    const { rig, box, cyl, put, motor, stageAssembly, DARK, GREY } = S();
    const part = partAt(p);
    const lower = rig(p, L('하부 하우징', 'Lower housing'), (b) => {
      box(b, [-70, -50, -20], [70, 0, 20], 'add', 'Housing');
      cyl(b, 'z', [0, 0, 0], 30, -21, 21, { op: 'cut' });
      box(b, [-110, -66, -70], [110, -50, 70], 'add', 'Base');
    }, { color: DARK });
    const shaft = rig(p, L('축과 풀리', 'Shaft and pulley'), (b) => {
      cyl(b, 'z', [0, 0, 0], 29.5, -60, 90, { name: 'Shaft' });
      cyl(b, 'z', [0, 0, 0], 48, 40, 60, { name: 'Pulley' });
      for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; cyl(b, 'z', [34 * Math.cos(a), 34 * Math.sin(a), 0], 7, 39, 61, { op: 'cut' }); }
    }, { color: GREY, material: 'steel-4340' });
    const asm = stageAssembly(p, L('분할 베어링 하우징', 'Split bearing housing'), 6);
    put(asm, lower, [0, 0, 0]); put(asm, part, [0, 0, 0]);
    motor(asm, put(asm, shaft, [0, 0, 0]), [0, 0, 0], [0, 0, 1], { speed: 30 });
  },
  basHeatSink(p, L) {
    // A fan on the heat sink's fins: its rotor turns.
    const { rig, box, cyl, prism, put, motor, stageAssembly, DARK, BLUE } = S();
    const part = partAt(p);
    const board = rig(p, L('회로 기판', 'Circuit board'), (b) => { box(b, [-90, -3, -70], [90, 0, 70], 'add', 'Board'); }, { color: '#2f6b3a', material: 'abs' });
    const frame = rig(p, L('팬 프레임', 'Fan frame'), (b) => {
      box(b, [-40, 44.5, -40], [40, 59.5, 40], 'add', 'Frame');
      cyl(b, 'y', [0, 0, 0], 37, 44, 60, { op: 'cut' });
      for (const x of [-34, 34]) for (const z of [-34, 34]) cyl(b, 'y', [x, 0, z], 2.2, 44, 60, { op: 'cut' });
      for (const a of [45, 135, 225, 315]) {
        const c = Math.cos(rad(a)); const s = Math.sin(rad(a)); const w = 2;
        prism(b, 'y', 57.5, 59.5, (k, uv) => poly(k, [[10 * c - w * s, 10 * s + w * c], [38 * c - w * s, 38 * s + w * c], [38 * c + w * s, 38 * s - w * c], [10 * c + w * s, 10 * s - w * c]].map(([x, z]) => uv(x, z))));
      }
      cyl(b, 'y', [0, 0, 0], 12, 57.5, 59.5, { name: 'Motor mount' });
    }, { color: '#30343a', material: 'abs' });
    const rotor = rig(p, L('팬 로터', 'Fan rotor'), (b) => {
      cyl(b, 'y', [0, 0, 0], 12, 46, 56.5, { name: 'Hub' });
      for (let i = 0; i < 7; i++) {
        const a0 = (i * 2 * Math.PI) / 7;
        const pts = [];
        for (const [rr, da, side] of [[11, 0, -1], [35, 0.35, -1], [35, 0.35, 1], [11, 0, 1]]) { const a = a0 + da + side * (rr < 20 ? 0.32 : 0.2); pts.push([rr * Math.cos(a), rr * Math.sin(a)]); }
        prism(b, 'y', 47, 55.5, (k, uv) => poly(k, pts.map(([x, z]) => uv(x, z))), 'add', 'Blade');
      }
    }, { color: BLUE, material: 'abs' });
    const asm = stageAssembly(p, L('방열판과 냉각 팬', 'Heat sink with a fan'), 4);
    put(asm, board, [0, 0, 0]); put(asm, part, [0, 0, 0]); put(asm, frame, [0, 0, 0]);
    motor(asm, put(asm, rotor, [0, 0, 0]), [0, 0, 0], [0, 1, 0], { speed: 45 });
    void DARK;
  },
  basConRod(p, L) {
    // Slider-crank: the crank turns, the connecting rod drives a crosshead in its guides (mates).
    const { rig, box, cyl, hole, put, motor, stageAssembly, picker, mate, CYL, PLN, DARK, GREY, BLUE } = S();
    const part = partAt(p);
    const e = 40;
    const frame = rig(p, L('크랭크 프레임', 'Crank frame'), (b) => {
      box(b, [-90, -116, -90], [250, -100, 60], 'add', 'Base');
      box(b, [-40, -100, -70], [40, 40, -40], 'add', 'Bearing pedestal');
      hole(b, 'z', [0, 0, 0], 15.6, -71, -39);
      for (const [z0, z1] of [[-30, -13], [13, 30]]) {
        box(b, [80, -100, z0], [250, -25, z1], 'add', 'Lower guide');
        box(b, [80, 25, z0], [250, 37, z1], 'add', 'Upper guide');
      }
      box(b, [80, -100, -42], [250, 37, -30], 'add', 'Guide wall');
    }, { color: DARK });
    const crank = rig(p, L('크랭크', 'Crank'), (b) => {
      cyl(b, 'z', [0, 0, 0], 62, -24, -12, { name: 'Disc' });
      cyl(b, 'z', [0, 0, 0], 15, -75, -24, { name: 'Axle' });
      cyl(b, 'z', [e, 0, 0], 17.7, -12, 15, { name: 'Crank pin' });
      cyl(b, 'z', [-30, 0, 0], 18, -25, -11, { op: 'cut' });
    }, { color: GREY, material: 'steel-4340' });
    const head = rig(p, L('크로스헤드', 'Crosshead'), (b) => {
      box(b, [-30, -25, -30], [30, 25, 30], 'add', 'Body');
      box(b, [-31, -26, -11], [20, 26, 11], 'cut', 'Slot');
      cyl(b, 'z', [0, 0, 0], 9.8, -30, 30, { name: 'Pin' });
    }, { color: BLUE, material: 'steel-4340' });
    const asm = stageAssembly(p, L('슬라이더 크랭크 기구', 'Slider-crank mechanism'), 4);
    const cF = put(asm, frame, [0, 0, 0]);
    const cC = put(asm, crank, [0, 0, 0]);
    const cR = put(asm, part, [e, 0, 0], quatIdentity(), false);
    const xp = e + 150;
    const cH = put(asm, head, [xp, 0, 0], quatIdentity(), false);
    const P = { f: picker(frame, p), c: picker(crank, p), r: picker(part, p), h: picker(head, p) };
    mate(asm, 'concentric', P.c(cC, CYL(17.7)), P.r(cR, CYL(18)));
    mate(asm, 'coincident', P.c(cC, PLN([0, 0, 1], -12)), P.r(cR, PLN([0, 0, -1], 12)));
    mate(asm, 'concentric', P.h(cH, CYL(9.8)), P.r(cR, CYL(10)));
    mate(asm, 'coincident', P.f(cF, PLN([0, 1, 0], -25)), P.h(cH, PLN([0, -1, 0], 25)));
    mate(asm, 'coincident', P.f(cF, PLN([0, 0, 1], -30)), P.h(cH, PLN([0, 0, -1], 30)));
    motor(asm, cC, [0, 0, 0], [0, 0, 1], { speed: 30 });
  },
  basMotorMount(p, L) {
    // A NEMA 23 stepper in the mount turns a pulley.
    const { rig, box, cyl, put, motor, stageAssembly, DARK, GREY } = S();
    const part = partAt(p);
    const body = rig(p, L('스테핑 모터 NEMA 23', 'Stepper motor NEMA 23'), (b) => {
      box(b, [-28.5, 24.5, -91], [28.5, 81.5, -35], 'add', 'Body');
      cyl(b, 'z', [0, 53, 0], 18.9, -35, -33.6, { name: 'Pilot' });
      b.add('chamfer', { distance: 4, edges: b.edges((e) => e.type === 'LINE' && Math.abs(e.dir[2]) > 0.99) });
    }, { color: '#2b2f36', material: 'al-6061' });
    const rotor = rig(p, L('모터 축과 풀리', 'Motor shaft and pulley'), (b) => {
      cyl(b, 'z', [0, 53, 0], 3.17, -33.5, -8, { name: 'Shaft' });
      cyl(b, 'z', [0, 53, 0], 16, -22, -8, { name: 'Pulley' });
      for (let i = 0; i < 3; i++) { const a = (i * 2 * Math.PI) / 3; cyl(b, 'z', [9.5 * Math.cos(a), 53 + 9.5 * Math.sin(a), 0], 3, -23, -7, { op: 'cut' }); }
    }, { color: GREY, material: 'al-6061' });
    const asm = stageAssembly(p, L('모터 마운트와 스테핑 모터', 'Motor mount with a stepper'), 4);
    put(asm, part, [0, 0, 0]); put(asm, body, [0, 0, 0]);
    motor(asm, put(asm, rotor, [0, 0, 0]), [0, 53, 0], [0, 0, 1], { speed: 30 });
    void DARK;
  },
  basCamDisc(p, L) {
    // The cam turns on its shaft and lifts a flat-faced follower in a guide (cam mate).
    const { rig, box, cyl, hole, put, motor, stageAssembly, picker, mate, PLN, CYL, DARK, GREY, BLUE } = S();
    const part = partAt(p);
    const frame = rig(p, L('캠 프레임', 'Cam frame'), (b) => {
      box(b, [-80, -110, -60], [80, -94, 50], 'add', 'Base');
      box(b, [-70, -94, -52], [70, 135, -40], 'add', 'Back plate');
      hole(b, 'z', [0, 0, 0], 10.4, -53, -39);
      box(b, [-22, 100, -40], [22, 125, 30], 'add', 'Guide');
      hole(b, 'y', [0, 0, 8], 8.4, 99, 126);
    }, { color: DARK });
    const shaft = rig(p, L('캠축', 'Camshaft'), (b) => {
      cyl(b, 'z', [0, 0, 0], 9.8, -80, 40, { name: 'Shaft' });
      cyl(b, 'z', [0, 0, 0], 24, -78, -66, { name: 'Hand wheel' });
      for (let i = 0; i < 3; i++) { const a = (i * 2 * Math.PI) / 3; cyl(b, 'z', [15 * Math.cos(a), 15 * Math.sin(a), 0], 4, -79, -65, { op: 'cut' }); }
    }, { color: GREY, material: 'steel-4340' });
    const follower = rig(p, L('평면 종동절', 'Flat-faced follower'), (b) => {
      box(b, [-48, 0, -4], [48, 6, 20], 'add', 'Foot');
      cyl(b, 'y', [0, 0, 8], 8, 6, 150, { name: 'Stem' });
      cyl(b, 'y', [0, 0, 8], 13, 150, 158, { name: 'Knob' });
    }, { color: BLUE, material: 'steel-4340' });
    const asm = stageAssembly(p, L('캠과 평면 종동절', 'Cam and flat follower'), 6);
    const cF = put(asm, frame, [0, 0, 0]);
    const cC = put(asm, part, [0, 0, 0]);
    const cS = put(asm, shaft, [0, 0, 0]);
    const cFo = put(asm, follower, [0, 60, 0], quatIdentity(), false);
    const P = { f: picker(frame, p), c: picker(part, p), fo: picker(follower, p) };
    mate(asm, 'concentric', P.f(cF, CYL(8.4)), P.fo(cFo, CYL(8)));
    mate(asm, 'parallel', P.f(cF, PLN([0, 0, 1], -40)), P.fo(cFo, PLN([0, 0, 1], 20)));
    mate(asm, 'cam', P.c(cC, PLN([0, 0, 1], 16, (f) => f.area > 2000)), P.fo(cFo, PLN([0, -1, 0], 0)), { profile: faceOutline(part, PLN([0, 0, 1], 16, (f) => f.area > 2000)) });
    motor(asm, cC, [0, 0, 0], [0, 0, 1], { speed: 20 });
    motor(asm, cS, [0, 0, 0], [0, 0, 1], { speed: 20 });
  },
  basCapScrew(p, L) {
    // A nut runner backs the cap screw out of a block and runs it in again.
    const { rig, box, hole, put, stageAssembly, nutRunner, DARK } = S();
    const part = partAt(p);
    const block = rig(p, L('나사 구멍 블록', 'Tapped block'), (b) => { box(b, [-40, -60, -40], [40, 0, 40], 'add', 'Block'); hole(b, 'y', [0, 0, 0], 6.6, -61, 1); }, { color: DARK });
    const asm = stageAssembly(p, L('너트 러너 체결', 'Run in by a nut runner'), 6);
    put(asm, block, [0, 0, 0]);
    const cP = put(asm, part, [0, 0, 0]);
    nutRunner(p, L, asm, cP, { axisPoint: [0, 0, 0], pitch: 1.75, lift: 14, socketR: 12, socketY0: 13 });
  },
  basCastleNut(p, L) {
    const { rig, box, cyl, put, stageAssembly, nutRunner, DARK } = S();
    const part = partAt(p);
    const stud = rig(p, L('스터드 볼트 판', 'Stud plate'), (b) => { box(b, [-45, -20, -45], [45, 0, 45], 'add', 'Plate'); cyl(b, 'y', [0, 0, 0], 6.8, 0, 40, { name: 'Stud M16' }); }, { color: DARK });
    const asm = stageAssembly(p, L('너트 러너 체결', 'Run in by a nut runner'), 6);
    put(asm, stud, [0, 0, 0]);
    const cP = put(asm, part, [0, 0, 0]);
    nutRunner(p, L, asm, cP, { axisPoint: [0, 0, 0], pitch: 2, lift: 12, socketR: 17, socketY0: 20, socketIn: 9 });
  },
  basBallKnob(p, L) {
    // A shift lever: the knob on a rod with a ball pivot swings ±18°.
    const { rig, box, cyl, put, stageAssembly, DARK, GREY } = S();
    const part = partAt(p);
    const consoleP = rig(p, L('레버 콘솔', 'Lever console'), (b) => {
      box(b, [-60, -200, -60], [60, -116, 60], 'add', 'Console');
      cyl(b, 'y', [0, 0, 0], 15.5, -142, -115, { op: 'cut' });
    }, { color: DARK });
    const lever = rig(p, L('레버 봉', 'Lever rod'), (b) => {
      b.add('revolve', { sketch: b.sketch('front', (k) => { const a = addLine(k, 0, -134, 0, -134); void a; poly(k, [[0, -134], [3.2, -134], [3.2, 12], [0, 12]]); addLine(k, 0, -150, 0, 20, { construction: true }); }).id });
      // The ball joint: a half disc turned about the lever's axis.
      const ball = b.sketch('front', (k) => { const arc = addArc(k, 0, -120, 14, -Math.PI / 2, Math.PI / 2); addLine(k, 0, 0, 0, 0, { from: arc.p2, to: arc.p1 }); addLine(k, 0, -140, 0, -100, { construction: true }); });
      b.add('revolve', { sketch: ball.id });
    }, { color: GREY, material: 'steel-4340' });
    const asm = stageAssembly(p, L('변속 레버', 'Shift lever'), 6);
    put(asm, consoleP, [0, 0, 0]);
    const cL = put(asm, lever, [0, 0, 0]); const cK = put(asm, part, [0, 0, 0]);
    swing(asm, [cL, cK], [0, -120, 0], [0, 0, 1], 18, 3);
  },
  basTSlotTable: (p, L) => S().slideRig(p, L, partAt(p), { amp: 80, period: 6, name: L('테이블 이송', 'Table traverse') }),
  basSpringClip(p, L) {
    const { rig, box, cyl, put, stageAssembly, DARK } = S();
    const part = partAt(p);
    const pin = rig(p, L('스프링 핀', 'Spring pin'), (b) => { box(b, [-30, -40, -30], [30, -28, 30], 'add', 'Base'); cyl(b, 'y', [0, 0, 0], 8.5, -28, 30, { name: 'Pin' }); }, { color: DARK });
    const asm = stageAssembly(p, L('비틀림 스프링 감김', 'Torsion spring winding'), 6);
    put(asm, pin, [0, 0, 0]);
    swing(asm, [put(asm, part, [0, 0, 0])], [0, 0, 0], [0, 1, 0], 25, 3);
  },

  // ── machine elements
  mchSpurGear: (p, L) => { wheelPair(p, L, partAt(p), { axis: 'z', c: 90, H: 80, r: 12.4, phase: GEAR_PHASE.spur, blockXs: [-40, 40], shaftX: [-60, 60], title: L('평기어 한 쌍 맞물림', 'A meshing spur-gear pair') }); },
  mchTimingPulley(p, L) {
    const { asm, comps } = wheelPair(p, L, partAt(p), { axis: 'z', c: 130, H: 60, r: 6.9, blockXs: [-38, 38], shaftX: [-58, 58], ratio: 1, title: L('타이밍 벨트 구동', 'Timing-belt drive') });
    const x = comps[0].position[0];
    S().put(asm, S().loopPart(p, L, L('타이밍 벨트 HTD 5M', 'Timing belt HTD 5M'), { y: 60, c: 130, rIn: 23.6, rOut: 26.4, x0: x - 6.4, x1: x + 6.4 }), [0, 0, 0]);
  },
  mchSprocket(p, L) {
    const { asm, comps } = wheelPair(p, L, partAt(p), { axis: 'z', c: 150, H: 70, r: 12.4, blockXs: [-45, 45], shaftX: [-65, 65], ratio: 1, x: 0, title: L('체인 구동', 'Chain drive') });
    const x = comps[0].position[0];
    for (const [a, b] of [[4.3, 5.8], [-5.8, -4.3]]) S().put(asm, S().loopPart(p, L, L('체인 링크판', 'Chain link plates'), { y: 70, c: 150, rIn: 37, rOut: 48.5, x0: x + a, x1: x + b, color: '#7d848c', material: 'steel-1020' }), [0, 0, 0]);
  },
  mchBevelGear(p, L) {
    // Two equal bevel gears on axes 78.4° apart (each cone 39.2°), apexes together.
    const { rig, box, cyl, put, motor, stageAssembly, qmul, RZ, RY, DARK, GREY } = S();
    const part = partAt(p);
    const apexY = 14 / (1 - 0.62); const half = Math.atan(30 / apexY); const theta = (2 * half * 180) / Math.PI;
    const yA = 130; const apex = [0, yA + apexY, 0];
    const qA = quatIdentity(); const qB = qmul(RZ(theta), RY(GEAR_PHASE.bevel));
    const posB = sub(apex, rotate(qB, [0, apexY, 0]));
    const unitPart = (name, legFor) => rig(p, name, (b) => {
      cyl(b, 'y', [0, 0, 0], 9.8, -90, 20, { name: 'Shaft' });
      void legFor;
    }, { color: GREY, material: 'steel-4340' });
    const shaftA = unitPart(L('구동 축', 'Driving shaft')); const shaftB = unitPart(L('피동 축', 'Driven shaft'));
    const housingA = rig(p, L('구동 축 하우징', 'Driving-shaft housing'), (b) => {
      cyl(b, 'y', [0, 0, 0], 24, yA - 95, yA - 22, { rIn: 10.3, name: 'Housing' });
      cyl(b, 'y', [0, 0, 0], 40, 0, yA - 95, { name: 'Pedestal' });
      box(b, [-120, -16, -90], [170, 0, 90], 'add', 'Base');
    }, { color: DARK });
    // The driven housing is built in the driven gear's frame (axis = local Y) with a leg down to the base.
    const sinT = Math.sin(rad(theta)); const cosT = Math.cos(rad(theta));
    const legL = (posB[1] - 90 * cosT - 2) / sinT;
    const housingB = rig(p, L('피동 축 하우징', 'Driven-shaft housing'), (b) => {
      cyl(b, 'y', [0, 0, 0], 24, -95, -22, { rIn: 10.3, name: 'Housing' });
      box(b, [-legL, -90, -20], [-18, -40, 20], 'add', 'Leg');
    }, { color: DARK });
    const asm = stageAssembly(p, L('베벨 기어 한 쌍', 'A bevel-gear pair'), 6);
    put(asm, housingA, [0, 0, 0]);
    put(asm, housingB, posB, qB);
    const cA = put(asm, part, [0, yA, 0], qA); const cSA = put(asm, shaftA, [0, yA, 0], qA);
    const cB = put(asm, part, posB, qB); const cSB = put(asm, shaftB, posB, qB);
    const aDir = [0, 1, 0]; const bDir = rotate(qB, [0, 1, 0]);
    const pitch = add(apex, mul(unit(add([0, -1, 0], mul(bDir, -1))), 30));
    const sgn = matchSign(aDir, bDir, apex, apex, pitch);
    for (const c of [cA, cSA]) motor(asm, c, [0, yA, 0], aDir, { speed: 20 });
    for (const c of [cB, cSB]) motor(asm, c, posB, bDir, { speed: 20 * sgn });
  },
  mchWormGearSet(p, L) {
    // The worm turns 30 times for one turn of the wheel (gear mate kept).
    const asm = p.assemblies[0];
    const [cWheel, cWorm] = asm.components;
    asm.motion = { duration: 6, motors: [] };
    motorLocal(asm, cWorm, [0, 0, 0], [1, 0, 0], { speed: 60 });
    motorLocal(asm, cWheel, [0, 0, 0], [0, 0, 1], { speed: 2 * WORM_SIGN });
    void L;
  },
  mchBallBearing(p, L) {
    const { rig, box, cyl, put, motor, stageAssembly, DARK, GREY } = S();
    const part = partAt(p);
    const housing = rig(p, L('베어링 하우징 판', 'Bearing housing plate'), (b) => {
      box(b, [-55, -7.5, -55], [55, 7.5, 55], 'add', 'Plate');
      cyl(b, 'y', [0, 0, 0], 26.3, -8, 8, { op: 'cut' });
      for (const x of [-45, 45]) for (const z of [-45, 45]) box(b, [x - 8, -90, z - 8], [x + 8, -7.5, z + 8], 'add', 'Leg');
      box(b, [-70, -106, -70], [70, -90, 70], 'add', 'Base');
    }, { color: DARK });
    const shaft = rig(p, L('축과 핸들 휠', 'Shaft and hand wheel'), (b) => {
      cyl(b, 'y', [0, 0, 0], 12.4, -60, 52, { name: 'Shaft' });
      cyl(b, 'y', [0, 0, 0], 45, 44, 52, { name: 'Wheel' });
      for (let i = 0; i < 5; i++) { const a = (i * 2 * Math.PI) / 5; cyl(b, 'y', [28 * Math.cos(a), 0, 28 * Math.sin(a)], 9, 43, 53, { op: 'cut' }); }
    }, { color: GREY, material: 'steel-4340' });
    const asm = stageAssembly(p, L('베어링으로 도는 축', 'A shaft turning in the bearing'), 6);
    put(asm, housing, [0, 0, 0]);
    const cB = put(asm, part, [0, 0, 0]); const cS = put(asm, shaft, [0, 0, 0]);
    for (const c of [cB, cS]) motor(asm, c, [0, 0, 0], [0, 1, 0], { speed: 30 });
  },
  mchSteppedShaft(p, L) {
    // The shaft in two pillow blocks on its bearing seats, a pulley on the Ø22 end.
    const { shaftFrame, rig, cyl, put, motor, stageAssembly, GREY } = S();
    const part = partAt(p); const H = 70;
    const { frame } = shaftFrame(p, L, [{ y: H, z: 0, r: 12.5, x0: 0, x1: 240, make: false }], [41, 174]);
    const pulley = rig(p, L('V 풀리', 'V-pulley'), (b) => {
      cyl(b, 'x', [0, H, 0], 45, 200, 228, { rIn: 11.2, name: 'Pulley' });
      cyl(b, 'x', [0, H, 0], 38, 206, 222, { rIn: 30, op: 'cut' });
      for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; cyl(b, 'x', [0, H + 22 * Math.cos(a), 22 * Math.sin(a)], 6, 199, 229, { op: 'cut' }); }
    }, { color: GREY, material: 'cast-iron' });
    const asm = stageAssembly(p, L('필로 블록에서 도는 축', 'Turning in pillow blocks'), 6);
    put(asm, frame, [0, 0, 0]);
    const cS = put(asm, part, [0, H, 0]); const cP = put(asm, pulley, [0, 0, 0]);
    for (const c of [cS, cP]) motor(asm, c, [0, H, 0], [1, 0, 0], { speed: 30 });
  },
  mchJawCoupling(p, L) {
    // Two halves, jaws interleaved, on two shafts.
    const { shaftFrame, put, onShaft, motor, stageAssembly } = S();
    const part = partAt(p); const H = 60;
    const { frame, shafts } = shaftFrame(p, L, [{ y: H, z: 0, r: 11.8, x0: -110, x1: -3 }, { y: H, z: 0, r: 11.8, x0: 3, x1: 110 }], [-80, 80]);
    const asm = stageAssembly(p, L('조 커플링 연결', 'Jaw coupling joining two shafts'), 6);
    put(asm, frame, [0, 0, 0]);
    const cA = onShaft(asm, p, part, { axis: 'y', y: H, z: 0, x: -12.5 });
    const cB = onShaft(asm, p, part, { axis: 'y', y: H, z: 0, x: 12.5, flip: true, phase: GEAR_PHASE.jaw });
    for (const c of [cA, cB, put(asm, shafts[0], [0, 0, 0]), put(asm, shafts[1], [0, 0, 0])]) motor(asm, c, [0, H, 0], [1, 0, 0], { speed: 30 });
  },
  mchCompressionSpring(p, L) {
    // End grinding: the spring turns on a mandrel under a grinding wheel turning the other way.
    const { rig, box, cyl, put, putBox, motor, stageAssembly, DARK, GREY, BLUE } = S();
    const part = partAt(p);
    const frame = rig(p, L('연삭기 프레임', 'Grinder frame'), (b) => {
      box(b, [-90, -96, -70], [130, -80, 70], 'add', 'Base');
      cyl(b, 'y', [0, 0, 0], 30, -80, -42, { name: 'Spindle housing' });
      box(b, [80, -80, -30], [120, 150, 30], 'add', 'Column');
      box(b, [30, 110, -30], [120, 140, 30], 'add', 'Head');
    }, { color: DARK });
    const mandrel = rig(p, L('맨드릴', 'Mandrel'), (b) => {
      cyl(b, 'y', [0, 0, 0], 10.5, -40, 56, { name: 'Mandrel' });
      cyl(b, 'y', [0, 0, 0], 26, -41.5, 0, { name: 'Face plate' });
      for (let i = 0; i < 3; i++) { const a = (i * 2 * Math.PI) / 3; box(b, [17 * Math.cos(a) - 3, -6, 17 * Math.sin(a) - 3], [17 * Math.cos(a) + 3, 0.5, 17 * Math.sin(a) + 3], 'cut', 'Notch'); }
    }, { color: GREY, material: 'steel-4340' });
    const wheel = rig(p, L('연삭 숫돌', 'Grinding wheel'), (b) => {
      cyl(b, 'y', [0, 0, 0], 45, 58, 72, { rIn: 8, name: 'Wheel' });
      cyl(b, 'y', [0, 0, 0], 8, 72, 110, { name: 'Spindle' });
      for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; cyl(b, 'y', [30 * Math.cos(a), 0, 30 * Math.sin(a)], 3, 69, 73, { op: 'cut' }); }
    }, { color: BLUE, material: 'cast-iron' });
    const asm = stageAssembly(p, L('스프링 끝면 연삭', 'Grinding the spring ends'), 6);
    put(asm, frame, [0, 0, 0]);
    const cM = put(asm, mandrel, [0, 0, 0]);
    const cS = putBox(asm, p, part, quatIdentity(), [0, 0.2, 0], ['mid', 'min', 'mid']);
    const cW = put(asm, wheel, [0, 0, 0]);
    for (const c of [cM, cS]) motor(asm, c, [0, 0, 0], [0, 1, 0], { speed: 20 });
    motor(asm, cW, [0, 0, 0], [0, 1, 0], { speed: -60 });
  },
  mchTorsionSpring(p, L) {
    const { rig, box, cyl, put, stageAssembly, DARK } = S();
    const part = partAt(p);
    const pin = rig(p, L('스프링 핀', 'Spring pin'), (b) => { box(b, [-30, -40, -30], [30, -30, 30], 'add', 'Base'); cyl(b, 'y', [0, 0, 0], 9, -30, 34, { name: 'Pin' }); }, { color: DARK });
    const asm = stageAssembly(p, L('비틀림 스프링 감김', 'Torsion spring winding'), 6);
    put(asm, pin, [0, 0, 0]);
    swing(asm, [put(asm, part, [0, 0, 0])], [0, 0, 0], [0, 1, 0], 30, 3);
  },
  mchGrooveCam(p, L) {
    // A roller follower runs in the groove (cam mate on the groove's pitch curve) and slides in a guide.
    const { rig, box, cyl, hole, put, motor, stageAssembly, picker, mate, PLN, CYL, DARK, GREY, BLUE } = S();
    const part = partAt(p);
    const frame = rig(p, L('캠 프레임', 'Cam frame'), (b) => {
      box(b, [-90, -116, -70], [90, -100, 60], 'add', 'Base');
      box(b, [-85, -100, -48], [85, 175, -36], 'add', 'Back plate');
      hole(b, 'z', [0, 0, 0], 12.9, -49, -35);
      box(b, [-22, 120, -36], [22, 150, 40], 'add', 'Guide');
      hole(b, 'y', [0, 0, 26], 6.5, 119, 151);
    }, { color: DARK });
    const shaft = rig(p, L('캠축', 'Camshaft'), (b) => { cyl(b, 'z', [0, 0, 0], 12.3, -70, 30, { name: 'Shaft' }); cyl(b, 'z', [0, 0, 0], 26, -68, -56, { name: 'Collar' }); }, { color: GREY, material: 'steel-4340' });
    const follower = rig(p, L('롤러 종동절', 'Roller follower'), (b) => {
      cyl(b, 'z', [0, 0, 0], 6, 11, 17, { name: 'Roller' });
      cyl(b, 'z', [0, 0, 0], 3, 17, 30, { name: 'Roller pin' });
      box(b, [-8, -6, 22], [8, 14, 30], 'add', 'Yoke');
      cyl(b, 'y', [0, 0, 26], 6, 14, 150, { name: 'Stem' });
    }, { color: BLUE, material: 'steel-4340' });
    const asm = stageAssembly(p, L('홈 캠과 롤러 종동절', 'Groove cam and roller follower'), 6);
    const cF = put(asm, frame, [0, 0, 0]);
    const cC = put(asm, part, [0, 0, 0]); const cS = put(asm, shaft, [0, 0, 0]);
    const r = (t) => 44 + 6 * (1 - Math.cos(t)) + 2.5 * Math.sin(2 * t);
    const cFo = put(asm, follower, [0, r(Math.PI / 2), 0], quatIdentity(), false);
    const P = { f: picker(frame, p), c: picker(part, p), fo: picker(follower, p) };
    mate(asm, 'concentric', P.f(cF, CYL(6.5)), P.fo(cFo, CYL(6, (f) => f.center[1] > 50)));
    mate(asm, 'parallel', P.f(cF, PLN([0, 0, 1], -36)), P.fo(cFo, PLN([0, 0, 1], 30)));
    const profile = Array.from({ length: 180 }, (_, i) => { const t = (2 * Math.PI * i) / 180; return [r(t) * Math.cos(t), r(t) * Math.sin(t), 18].map((v) => Math.round(v * 1e4) / 1e4); });
    mate(asm, 'cam', P.c(cC, PLN([0, 0, 1], 18, (f) => f.area > 4000)), { comp: cFo.id, kind: 'axis', point: [0, 0, 14], dir: [0, 0, 1] }, { profile, followerRadius: 0 });
    for (const c of [cC, cS]) motor(asm, c, [0, 0, 0], [0, 0, 1], { speed: 15 });
  },
  mchLeadScrew(p, L) {
    // The screw turns, the flanged nut travels 4 mm a turn (screw mate kept).
    const asm = p.assemblies[0];
    const [cs, cn] = asm.components;
    asm.motion = { duration: 8, motors: [] };
    const lift = 32; const turns = (lift / 4) * 360;
    motorLocal(asm, cs, [0, 0, 0], [0, 1, 0], { amplitude: turns * LEAD_SIGN, period: 8, oneWay: true });
    motorLocal(asm, cn, [0, 0, 0], [0, 1, 0], { linear: true, amplitude: lift, period: 8, oneWay: true });
    void L;
  },
  mchUJointYoke: (p, L) => ujoint(p, L),
  mchCrankshaft(p, L) {
    // In three main bearings, a pulley on the nose and a flywheel on the flange.
    const { shaftFrame, rig, cyl, put, onShaft, motor, stageAssembly, GREY } = S();
    const part = partAt(p); const H = 85;
    const cmp = { x0: -40, x1: 335 };
    const { frame } = shaftFrame(p, L, [{ y: H, z: 0, r: 20, x0: cmp.x0, x1: cmp.x1, make: false }], [12, 160, 308], { blockT: 14 });
    const fly = rig(p, L('플라이휠과 풀리', 'Flywheel and pulley'), (b) => {
      cyl(b, 'x', [0, H, 0], 70, 335.3, 360, { name: 'Flywheel' });
      for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; cyl(b, 'x', [0, H + 45 * Math.cos(a), 45 * Math.sin(a)], 10, 335, 361, { op: 'cut' }); }
      cyl(b, 'x', [0, H, 0], 40, -34, -10, { rIn: 15.2, name: 'Pulley' });
      cyl(b, 'x', [0, H, 0], 41, -28, -16, { rIn: 33, op: 'cut' });
    }, { color: GREY, material: 'cast-iron' });
    const asm = stageAssembly(p, L('크랭크축 회전', 'Crankshaft turning'), 6);
    put(asm, frame, [0, 0, 0]);
    const cC = onShaft(asm, p, part, { axis: 'z', y: H, z: 0, x: (-40 + 335) / 2 });
    const cF = put(asm, fly, [0, 0, 0]);
    for (const c of [cC, cF]) motor(asm, c, [0, H, 0], [1, 0, 0], { speed: 30 });
  },
  mchImpeller(p, L) {
    const { rig, box, cyl, put, motor, stageAssembly, DARK, GREY } = S();
    const part = partAt(p); const H = 110;
    const housing = rig(p, L('팬 하우징과 모터', 'Fan housing and motor'), (b) => {
      cyl(b, 'z', [0, H, 0], 82, -2, 30, { rIn: 77, name: 'Ring' });
      cyl(b, 'z', [0, H, 0], 32, -80, -15, { name: 'Motor' });
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) box(b, [dx ? Math.min(dx * 30, dx * 79) : -6, H + (dy ? Math.min(dy * 30, dy * 79) : -6), -22], [dx ? Math.max(dx * 30, dx * 79) : 6, H + (dy ? Math.max(dy * 30, dy * 79) : 6), -15], 'add', 'Strut');
      box(b, [-30, 0, -80], [30, H - 30, -15], 'add', 'Pedestal');
      box(b, [-110, -16, -110], [110, 0, 60], 'add', 'Base');
      box(b, [-60, 0, -10], [60, H - 80, 28], 'add', 'Ring foot');
    }, { color: DARK });
    const shaft = rig(p, L('모터 축', 'Motor shaft'), (b) => { cyl(b, 'z', [0, H, 0], 2.8, -15, 26, { name: 'Shaft' }); }, { color: GREY, material: 'steel-4340' });
    const asm = stageAssembly(p, L('팬 회전', 'Fan running'), 4);
    put(asm, housing, [0, 0, 0]);
    const cI = put(asm, part, [0, H, 0]); const cS = put(asm, shaft, [0, 0, 0]);
    for (const c of [cI, cS]) motor(asm, c, [0, H, 0], [0, 0, 1], { speed: 40 });
  },

  // ── housings
  hsgGearbox: (p, L) => S().trunnion(p, L, partAt(p), { tilt: 20 }),
  hsgEnclosure: (p, L) => S().trunnion(p, L, partAt(p)),
  hsgCover(p, L) {
    // Ejection: the moulded cover is pushed up off the core plate by four ejector pins and comes back.
    const { rig, box, cyl, put, putBox, motor, stageAssembly, boxOf, DARK, GREY } = S();
    const part = partAt(p); const bx = boxOf(part, p);
    const y0 = bx.lo[1];
    const plate = rig(p, L('코어 형판', 'Core plate'), (b) => {
      box(b, [-110, y0 - 40, -90], [110, y0 - 0.5, 90], 'add', 'Core plate');
      for (const x of [-40, 40]) for (const z of [-30, 30]) cyl(b, 'y', [x, 0, z], 4.3, y0 - 41, y0, { op: 'cut' });
      box(b, [-110, y0 - 120, -90], [110, y0 - 100, 90], 'add', 'Clamp plate');
      for (const x of [-100, 100]) box(b, [x - 10, y0 - 100, -90], [x + 10, y0 - 40, 90], 'add', 'Spacer');
    }, { color: DARK });
    const pins = rig(p, L('이젝터 판과 핀', 'Ejector plate and pins'), (b) => {
      box(b, [-80, y0 - 95, -60], [80, y0 - 80, 60], 'add', 'Ejector plate');
      for (const x of [-40, 40]) for (const z of [-30, 30]) cyl(b, 'y', [x, 0, z], 4, y0 - 80, y0 - 1, { name: 'Ejector pin' });
    }, { color: GREY, material: 'steel-4340' });
    const asm = stageAssembly(p, L('사출품 취출', 'Ejecting the moulding'), 5);
    put(asm, plate, [0, 0, 0]);
    const cE = put(asm, pins, [0, 0, 0]); const cP = putBox(asm, p, part, quatIdentity(), [0, y0, 0], ['mid', 'min', 'mid']);
    for (const c of [cE, cP]) motor(asm, c, [0, 0, 0], [0, 1, 0], { linear: true, amplitude: 35, period: 5, oneWay: true });
  },
  hsgVolute: (p, L) => S().trunnion(p, L, partAt(p), { tilt: 20 }),
  hsgEndBell: (p, L) => S().trunnion(p, L, partAt(p)),
  hsgChassis: (p, L) => conveyor(p, L, partAt(p), { amp: 100 }),
  hsgLBracket: (p, L) => S().trunnion(p, L, partAt(p)),
  hsgDinRail: (p, L) => S().trunnion(p, L, partAt(p)),
  hsgRackPanel(p, L) {
    // The 1U panel slides out of the rack on its rails and back.
    const { rig, box, put, motor, stageAssembly, DARK } = S();
    const part = partAt(p);
    const rack = rig(p, L('19인치 랙', '19-inch rack'), (b) => {
      for (const sg of [-1, 1]) {
        box(b, [sg > 0 ? 244 : -262, -150, -40], [sg > 0 ? 262 : -244, 150, -20], 'add', 'Post');
        box(b, [sg > 0 ? 244 : -262, -150, -400], [sg > 0 ? 262 : -244, 150, -380], 'add', 'Rear post');
        box(b, [sg > 0 ? 244 : -262, -12, -380], [sg > 0 ? 262 : -244, 12, -40], 'add', 'Slide rail');
      }
      box(b, [-262, -166, -400], [262, -150, -20], 'add', 'Floor');
    }, { color: DARK });
    const asm = stageAssembly(p, L('랙 패널 인출', 'Rack panel sliding out'), 6);
    put(asm, rack, [0, 0, 0]);
    motor(asm, put(asm, part, [0, 0, 0]), [0, 0, 0], [0, 0, 1], { linear: true, amplitude: 150, period: 6, oneWay: true });
  },
  hsgHandle: (p, L) => S().trunnion(p, L, partAt(p)),
  hsgBatteryBox(p, L) {
    // A copy of the assembly in which the lid swings open on its back edge and closes.
    const { asm, comp } = copyAssembly(p, p.assemblies[0], L('배터리 박스 뚜껑 열기', 'Opening the battery box'));
    const lid = comp(p.assemblies[0].components[1]);
    S().motor(asm, lid, [0, 70, -45], [-1, 0, 0], { amplitude: 105, period: 6, oneWay: true });
  },
  hsgGuard(p, L) {
    // Inside the guard a turntable robot arm sweeps back and forth.
    const { rig, box, cyl, put, motor, stageAssembly, DARK, BLUE } = S();
    const base = rig(p, L('선회 베이스', 'Swivel base'), (b) => { cyl(b, 'y', [0, 0, 0], 90, 30, 160, { name: 'Base' }); }, { color: DARK });
    const arm = rig(p, L('선회 암', 'Swivel arm'), (b) => {
      cyl(b, 'y', [0, 0, 0], 70, 160, 220, { name: 'Turret' });
      box(b, [0, 180, -35], [300, 240, 35], 'add', 'Arm');
      cyl(b, 'y', [280, 0, 0], 24, 80, 180, { name: 'Gripper' });
    }, { color: BLUE, material: 'al-6061' });
    const asm = stageAssembly(p, L('안전 가드 안의 로봇 암', 'Robot arm inside the guard'), 8);
    put(asm, partAt(p), [0, 0, 0]); put(asm, base, [0, 0, 0]);
    motor(asm, put(asm, arm, [0, 0, 0]), [0, 0, 0], [0, 1, 0], { amplitude: 100, period: 8 });
  },
  hsgGrip: (p, L) => { S().turntable(p, L, partAt(p), { gap: 1 }); },
  hsgNozzle(p, L) {
    // The nozzle glides back and forth over the floor on its wand.
    const { rig, box, put, putBox, motor, stageAssembly, boxOf, DARK } = S();
    const part = partAt(p); const bx = boxOf(part, p);
    const floor = rig(p, L('바닥', 'Floor'), (b) => { box(b, [-320, bx.lo[1] - 21, -380], [320, bx.lo[1] - 1, 380], 'add', 'Floor'); }, { color: '#9b8164', material: 'oak' });
    const asm = stageAssembly(p, L('바닥 청소', 'Cleaning the floor'), 6);
    put(asm, floor, [0, 0, 0]);
    const cP = putBox(asm, p, part, quatIdentity(), [0, bx.lo[1], 0], ['mid', 'min', 'mid']);
    motor(asm, cP, [0, 0, 0], [0, 0, 1], { linear: true, amplitude: 200, period: 6 });
  },
  hsgBottle: (p, L) => conveyor(p, L, partAt(p), { amp: 110 }),

  // ── advanced features
  advSpring(p, L) {
    // A spring tester: the press plate comes down onto the spring's end and lifts again.
    const { rig, box, cyl, put, putBox, motor, stageAssembly, boxOf, DARK, BLUE } = S();
    const part = partAt(p); const bx = boxOf(part, p); const h = bx.size[1];
    const frame = rig(p, L('스프링 시험기', 'Spring tester'), (b) => {
      box(b, [-70, -16, -50], [70, 0, 50], 'add', 'Base');
      cyl(b, 'y', [0, 0, 0], 8, 0, h + 70, { name: 'Guide rod' });
      for (const x of [-55, 55]) cyl(b, 'y', [x, 0, 0], 8, 0, h + 110, { name: 'Column' });
      box(b, [-70, h + 110, -20], [70, h + 128, 20], 'add', 'Crosshead');
    }, { color: DARK });
    const plate = rig(p, L('압판', 'Press plate'), (b) => {
      box(b, [-46, h + 40, -26], [46, h + 52, 26], 'add', 'Plate');
      cyl(b, 'y', [0, 0, 0], 9, h + 39, h + 53, { op: 'cut' });
      for (const x of [-55, 55]) cyl(b, 'y', [x, 0, 0], 9, h + 39, h + 53, { op: 'cut' });
      cyl(b, 'y', [30, 0, 0], 6, h + 52, h + 109, { name: 'Ram' });
    }, { color: BLUE });
    const asm = stageAssembly(p, L('스프링 하중 시험', 'Spring load test'), 5);
    put(asm, frame, [0, 0, 0]);
    putBox(asm, p, part, quatIdentity(), [0, 0, 0], ['mid', 'min', 'mid']);
    motor(asm, put(asm, plate, [0, 0, 0]), [0, 0, 0], [0, -1, 0], { linear: true, amplitude: 38, period: 5, oneWay: true });
  },
  advBoltNut(p, L) {
    // A copy of the joint in which a nut runner backs the nut off the bolt and runs it on again.
    const src = p.assemblies[0];
    const { asm, comp } = copyAssembly(p, src, L('너트 풀고 조이기', 'Backing the nut off and on'));
    const nut = comp(src.components[3]);
    // The modelled thread ridges (two separate sweeps) touch along their flanks as the nut runs: like the lead
    // screw and the worm sets, the stage allows that overlap.
    asm.allowInterference = true;
    S().nutRunner(p, L, asm, nut, { axisPoint: [...nut.position], pitch: 1.5, lift: 9, socketR: 12, socketY0: 1, down: true, socketIn: 6, hand: -1 });
  },
  advBikeFrame: (p, L) => bike(p, L),
  advMachineStand(p, L) {
    // An indexing table on the stand turns.
    const { rig, cyl, box, put, motor, stageAssembly, boxOf, DARK, BLUE } = S();
    const part = partAt(p); const top = boxOf(part, p).hi[1];
    const body = rig(p, L('인덱스 테이블 본체', 'Indexing table body'), (b) => { cyl(b, 'y', [0, 0, 0], 150, top + 0.5, top + 60, { name: 'Body' }); }, { color: DARK });
    const table = rig(p, L('인덱스 테이블', 'Indexing table'), (b) => {
      cyl(b, 'y', [0, 0, 0], 180, top + 60, top + 80, { name: 'Table' });
      for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; box(b, [130 * Math.cos(a) - 25, top + 80, 130 * Math.sin(a) - 25], [130 * Math.cos(a) + 25, top + 120, 130 * Math.sin(a) + 25], 'add', 'Fixture'); }
    }, { color: BLUE });
    const asm = stageAssembly(p, L('받침대 위 인덱스 테이블', 'Indexing table on the stand'), 8);
    put(asm, part, [0, 0, 0]); put(asm, body, [0, 0, 0]);
    motor(asm, put(asm, table, [0, 0, 0]), [0, 0, 0], [0, 1, 0], { speed: 7.5 });
  },
  advSheetEnclosure: (p, L) => conveyor(p, L, partAt(p), { amp: 90 }),
  advMoldedCover: (p, L) => S().trunnion(p, L, partAt(p)),
  advCarBody: (p, L) => car(p, L),
  advWineGlass: (p, L) => { S().turntable(p, L, partAt(p), { rpm: 6 }); },
  advDuctBend: (p, L) => S().trunnion(p, L, partAt(p), { tilt: 20 }),
  advKnob(p, L) {
    // A volume knob on a potentiometer turns 0…270° and back.
    const { rig, box, cyl, put, motor, stageAssembly, DARK, GREY } = S();
    const part = partAt(p);
    const panel = rig(p, L('패널과 가변 저항', 'Panel and potentiometer'), (b) => {
      box(b, [-60, -4, -60], [60, -1, 60], 'add', 'Panel');
      cyl(b, 'y', [0, 0, 0], 4.5, -5, 0, { op: 'cut' });
      cyl(b, 'y', [0, 0, 0], 12, -22, -4, { name: 'Pot body' });
      cyl(b, 'y', [0, 0, 0], 4, -4, -1, { rIn: 2.6, name: 'Bushing' });
    }, { color: DARK });
    const shaft = rig(p, L('가변 저항 축', 'Pot shaft'), (b) => { cyl(b, 'y', [0, 0, 0], 1.8, -3.9, 4, { name: 'Shaft' }); }, { color: GREY, material: 'brass' });
    const asm = stageAssembly(p, L('볼륨 노브 돌리기', 'Turning the volume knob'), 6);
    put(asm, panel, [0, 0, 0]);
    for (const c of [put(asm, part, [0, 0, 0]), put(asm, shaft, [0, 0, 0])]) motor(asm, c, [0, 0, 0], [0, -1, 0], { amplitude: 270, period: 6, oneWay: true });
  },
  advParamBracket: (p, L) => S().trunnion(p, L, partAt(p)),
  advWireHanger(p, L) {
    // The hanger swings on a rail.
    const { rig, box, cyl, put, stageAssembly, DARK } = S();
    const rail = rig(p, L('옷걸이 봉', 'Hanging rail'), (b) => {
      cyl(b, 'z', [24, 190, 0], 9, -120, 100, { name: 'Rail' });
      box(b, [-6, 150, -136], [54, 230, -120], 'add', 'Wall bracket');
      box(b, [-60, -140, -160], [110, 230, -136], 'add', 'Wall');
      box(b, [-260, -156, -160], [260, -140, 120], 'add', 'Floor');
    }, { color: DARK });
    const asm = stageAssembly(p, L('흔들리는 옷걸이', 'Swinging hanger'), 6);
    put(asm, rail, [0, 0, 0]);
    swing(asm, [put(asm, partAt(p), [0, 0, 0])], [24, 190, 0], [0, 0, 1], 15, 3);
  },
  advTurbineBlade: (p, L) => turbine(p, L),
  advMoldInsert(p, L) {
    // The soap bar is ejected from the cavity insert and comes back.
    const { put, motor, stageAssembly } = S();
    const [soap, insert] = p.parts;
    const asm = stageAssembly(p, L('비누 취출', 'Ejecting the soap'), 5);
    put(asm, insert, [0, 0, 0]);
    motor(asm, put(asm, soap, [0, 0, 0]), [0, 0, 0], [0, 1, 0], { linear: true, amplitude: 45, period: 5, oneWay: true });
  },
  advBottleCap(p, L) {
    const { rig, cyl, put, stageAssembly, nutRunner, GREY } = S();
    const part = partAt(p);
    const bottle = rig(p, L('병', 'Bottle'), (b) => {
      cyl(b, 'y', [0, 0, 0], 12, -20, 11.3, { name: 'Neck' });
      cyl(b, 'y', [0, 0, 0], 17, -24, -20, { name: 'Neck ring' });
      cyl(b, 'y', [0, 0, 0], 34, -170, -40, { name: 'Body' });
      b.add('loft', { sketches: [b.sketch(b.plane('top', -40), (k) => addCircle(k, 0, 0, 34)).id, b.sketch(b.plane('top', -24), (k) => addCircle(k, 0, 0, 14)).id] });
    }, { color: '#d8e6ef', material: 'abs' });
    const asm = stageAssembly(p, L('뚜껑 열고 닫기', 'Capping and uncapping'), 6);
    put(asm, bottle, [0, 0, 0]);
    nutRunner(p, L, asm, put(asm, part, [0, 0, 0]), { axisPoint: [0, 0, 0], pitch: 3, lift: 12, socketR: 22, socketY0: 17, socketH: 20 });
    void GREY;
  },

  // ── assemblies without a motion study
  asmPillowLine(p, L) {
    const asm = p.assemblies[0];
    const byPart = (i) => asm.components.filter((c) => c.part === p.parts[i].id);
    asm.motion = { duration: 6, motors: [] };
    for (const c of [...byPart(2), ...byPart(3), ...byPart(4), ...byPart(5)]) motorLocal(asm, c, [0, 0, 0], [0, 1, 0], { speed: 40 });
    void L;
  },
  asmDoorHinge(p, L) {
    const asm = p.assemblies[0];
    const door = asm.components.find((c) => c.part === p.parts[1].id);
    const pin = asm.components.find((c) => c.part === p.parts[4].id);
    asm.motion = { duration: 6, motors: [] };
    S().motor(asm, door, [...pin.position], rotate(pin.rotation, [0, DOOR_SIGN, 0]), { amplitude: 70, period: 6, oneWay: true });
    void L;
  },
  asmFlangeJoint(p, L) {
    // A copy in which every nut is backed off its bolt (with its washer) and run on again.
    const src = p.assemblies[0];
    const { asm, comp } = copyAssembly(p, src, L('너트 풀고 조이기', 'Backing the nuts off and on'));
    const washers = src.components.filter((c) => c.part === p.parts[5].id).map(comp);
    const nuts = src.components.filter((c) => c.part === p.parts[4].id).map(comp);
    nuts.forEach((n, i) => {
      const w = washers[i];
      S().motor(asm, w, [...n.position], [0, -1, 0], { linear: true, amplitude: 14, period: 6, oneWay: true });
      S().motor(asm, n, [...n.position], [0, -1, 0], { amplitude: 7 * 360, period: 6, oneWay: true, parent: w });
    });
  },
  asmCart(p, L) {
    // The cart rolls back and forth (its casters' wheels turn in their own study).
    const asm = p.assemblies.find((a) => a.components.some((c) => c.sub));
    const deck = asm.components.find((c) => c.fixed);
    asm.motion = { duration: 6, motors: [] };
    S().motor(asm, deck, [0, 0, 0], [1, 0, 0], { linear: true, amplitude: 150, period: 6 });
    void L;
  },
  asmShaftDrawing(p, L) { lathe(p, L, p.parts[0]); },
  asmHousingDrawing(p, L) { S().trunnion(p, L, p.parts[0]); },
};

/** Phases that put a tooth of the second gear in the first one's space (found by the interference check). */
export const GEAR_PHASE = { spur: 5, bevel: 9, jaw: 120 };
/** Senses that keep the kept mates satisfied (the worm's gear mate, the lead screw's screw mate, the door's limit). */
export const WORM_SIGN = 1; export const LEAD_SIGN = -1; export const DOOR_SIGN = -1;

// ───────────────────────── the larger special scenes

function ujoint(p, L) {
  // A universal joint at 12°: the yoke on a vertical shaft drives a second yoke through the cross (mates).
  const { rig, box, cyl, prism, put, motor, stageAssembly, mate, RZ, DARK, GREY, BLUE } = S();
  const part = partAt(p);
  const beta = 12; const C = [0, 52, 0]; const q2 = RZ(beta);
  const base = rig(p, L('U 조인트 프레임', 'U-joint frame'), (b) => {
    box(b, [-160, -116, -60], [80, -100, 60], 'add', 'Base');
    box(b, [-25, -100, -25], [25, -20, 25], 'add', 'Bearing block');
    cyl(b, 'y', [0, 0, 0], 10.2, -101, -19, { op: 'cut' });
    // A buttress under the tilted bearing (its face follows the bearing block's side).
    const c = Math.cos(rad(beta)); const s = Math.sin(rad(beta));
    const W = (lx, ly) => [C[0] + lx * c - ly * s, C[1] + lx * s + ly * c];
    const a = W(-25.6, 70); const d = W(-25.6, 110);
    prism(b, 'z', -25, 25, (k) => poly(k, [a, d, [d[0] - 40, d[1]], [d[0] - 40, -100], [a[0], -100]]), 'add', 'Buttress');
  }, { color: DARK });
  const shaft1 = rig(p, L('입력 축', 'Input shaft'), (b) => { cyl(b, 'y', [0, 0, 0], 9.8, -98, 26, { name: 'Shaft' }); }, { color: GREY, material: 'steel-4340' });
  const yoke2 = rig(p, L('출력 요크와 축', 'Output yoke and shaft'), (b) => {
    for (const sg of [-1, 1]) box(b, [-8, -12, sg > 0 ? 15.5 : -24], [8, 32, sg > 0 ? 24 : -15.5], 'add', 'Lug');
    cyl(b, 'z', [0, 0, 0], 7.5, -25, 25, { op: 'cut' });
    cyl(b, 'y', [0, 0, 0], 26, 30, 40, { name: 'Bridge' });
    cyl(b, 'y', [0, 0, 0], 9.8, 40, 150, { name: 'Output shaft' });
    cyl(b, 'y', [0, 0, 0], 30, 135, 145, { name: 'Output wheel' });
  }, { color: BLUE, material: 'steel-4340' });
  const bearing2 = rig(p, L('출력 베어링', 'Output bearing'), (b) => {
    box(b, [-25, 70, -25], [25, 110, 25], 'add', 'Bearing block');
    cyl(b, 'y', [0, 0, 0], 10.2, 69, 111, { op: 'cut' });
  }, { color: DARK });
  const crossP = rig(p, L('십자 축', 'Cross'), (b) => {
    box(b, [-9, -9, -9], [9, 9, 9], 'add', 'Centre');
    cyl(b, 'x', [0, 0, 0], 7.3, -25.5, 25.5, { name: 'Arm X' });
    cyl(b, 'z', [0, 0, 0], 7.3, -23.5, 23.5, { name: 'Arm Z' });
  }, { color: GREY, material: 'steel-4340' });
  const asm = stageAssembly(p, L('유니버설 조인트 12°', 'Universal joint at 12°'), 6);
  put(asm, base, [0, 0, 0]);
  const cY1 = put(asm, part, [0, 0, 0]); const cS1 = put(asm, shaft1, [0, 0, 0]);
  const cB2 = put(asm, bearing2, C, q2);
  const cY2 = put(asm, yoke2, C, q2, false);
  const cX = put(asm, crossP, C, quatIdentity(), false);
  const ax = (comp, point, dir) => ({ comp: comp.id, kind: 'axis', point, dir });
  const pl = (comp, point, dir) => ({ comp: comp.id, kind: 'plane', point, dir });
  mate(asm, 'concentric', ax(cY1, [0, 52, 0], [1, 0, 0]), ax(cX, [0, 0, 0], [1, 0, 0]));
  mate(asm, 'concentric', ax(cY2, [0, 0, 0], [0, 0, 1]), ax(cX, [0, 0, 0], [0, 0, 1]));
  mate(asm, 'concentric', ax(cB2, [0, 0, 0], [0, 1, 0]), ax(cY2, [0, 0, 0], [0, 1, 0]));
  mate(asm, 'coincident', pl(cB2, [0, 60, 0], [0, 1, 0]), pl(cY2, [0, 60, 0], [0, -1, 0]));
  for (const c of [cY1, cS1]) motor(asm, c, [0, 0, 0], [0, 1, 0], { speed: 15 });
}

function bike(p, L) {
  // On a stand: the rear wheel turns, the fork steers ±12° and its wheel turns with it.
  const { rig, box, cyl, put, motor, stageAssembly, prism, DARK, GREY, RUBBER } = S();
  const part = partAt(p);
  const axleR = [-405, 40, 0];
  const top = [420, 560, 0]; const bot = [465, 422, 0];
  const steer = unit(sub(bot, top));
  const tAx = (40 - bot[1]) / steer[1];
  const axleF = add(bot, mul(steer, tAx));
  const R = 318;
  const wheel = rig(p, L('바퀴 700C', 'Wheel 700C'), (b) => {
    cyl(b, 'z', [0, 0, 0], R, -11, 11, { rIn: 290, name: 'Rim and tyre' });
    cyl(b, 'z', [0, 0, 0], 20, -45, 45, { name: 'Hub' });
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6; const c = Math.cos(a); const s = Math.sin(a); const w = 1.6;
      prism(b, 'z', -1.6, 1.6, (k) => poly(k, [[19 * c - w * s, 19 * s + w * c], [291 * c - w * s, 291 * s + w * c], [291 * c + w * s, 291 * s - w * c], [19 * c + w * s, 19 * s - w * c]]), 'add', 'Spoke');
    }
  }, { color: RUBBER, material: 'rubber' });
  const fork = rig(p, L('앞 포크', 'Front fork'), (b) => {
    // Built about the steering axis as local Y (the fork is placed turned onto it).
    box(b, [-14, -56, -62], [14, -36, 62], 'add', 'Crown');
    for (const z of [-56, 56]) cyl(b, 'y', [0, 0, z], 9, -tAx, -45, { name: 'Blade' });
  }, { color: GREY, material: 'steel-4340' });
  const stand = rig(p, L('작업 스탠드', 'Work stand'), (b) => {
    box(b, [-700, -R - 60, -200], [800, -R - 40, 200], 'add', 'Floor plate');
    cyl(b, 'y', [-140, 0, -120], 18, -R - 40, 456, { name: 'Post' });
    box(b, [-160, 440, -125], [-120, 456, -22], 'add', 'Clamp arm');
  }, { color: DARK });
  const asm = stageAssembly(p, L('자전거 바퀴와 조향', 'Bicycle wheels and steering'), 8);
  put(asm, stand, [0, 0, 0]); put(asm, part, [0, 0, 0]);
  // The fork's local Y is the steering axis pointing up: the rotation turning +Y onto −steer.
  const up = mul(steer, -1); const ang = Math.atan2(-up[0], up[1]) * (180 / Math.PI);
  const qF = S().RZ(ang);
  const cF = put(asm, fork, [...bot], qF);
  motor(asm, cF, [...bot], up, { amplitude: 12, period: 4 });
  const cR = put(asm, wheel, axleR); const cW = put(asm, wheel, axleF);
  motor(asm, cR, axleR, [0, 0, -1], { speed: 25 });
  motor(asm, cW, axleF, [0, 0, -1], { speed: 25, parent: cF });
}

function car(p, L) {
  // On a show turntable: the body turns with it and the chassis' four wheels spin under it (1:10 touring car:
  // Ø64 × 26 wheels, wheelbase 257, axles 32 above the ground, tyre faces 190 apart).
  const { rig, cyl, put, motor, stageAssembly, DARK, BLUE, RUBBER } = S();
  const part = partAt(p);
  const wheel = rig(p, L('바퀴', 'Wheel'), (b) => {
    cyl(b, 'z', [0, 0, 0], 32, -13, 13, { rIn: 22, name: 'Tyre' });
    cyl(b, 'z', [0, 0, 0], 22, -12, 12, { name: 'Rim' });
    for (let i = 0; i < 6; i++) { const a = (i * 2 * Math.PI) / 6; cyl(b, 'z', [13 * Math.cos(a), 13 * Math.sin(a), 0], 4.5, -13, 13, { op: 'cut' }); }
  }, { color: RUBBER, material: 'rubber' });
  const stand = rig(p, L('턴테이블 받침', 'Turntable stand'), (b) => { cyl(b, 'y', [0, 0, 0], 220, -40, -12, { name: 'Stand' }); }, { color: DARK });
  const disc = rig(p, L('턴테이블', 'Turntable'), (b) => { cyl(b, 'y', [0, 0, 0], 260, -11, -0.5, { name: 'Disc' }); for (let i = 0; i < 12; i++) { const a = (i * Math.PI) / 6; cyl(b, 'y', [240 * Math.cos(a), 0, 240 * Math.sin(a)], 6, -2, 0, { op: 'cut' }); } }, { color: BLUE });
  const asm = stageAssembly(p, L('턴테이블 위 자동차', 'Car on a show turntable'), 8);
  put(asm, stand, [0, 0, 0]);
  const cD = put(asm, disc, [0, 0, 0]); const cB = put(asm, part, [0, 0, 0]);
  motor(asm, cD, [0, 0, 0], [0, 1, 0], { speed: 7.5 });
  motor(asm, cB, [0, 0, 0], [0, 1, 0], { speed: 7.5 });
  for (const x of [-128.5, 128.5]) for (const z of [-82, 82]) motor(asm, put(asm, wheel, [x, 32, z]), [x, 32, z], [0, 0, -1], { speed: 40, parent: cD });
}

function turbine(p, L) {
  // Twelve blades on a disc, the rotor turning in two pedestals.
  const { rig, cyl, box, put, motor, stageAssembly, RZ, DARK, GREY } = S();
  const part = partAt(p);
  const r0 = 120; const H = r0 + 30 + 95 + 40; const N = 12;
  const rotor = rig(p, L('터빈 디스크', 'Turbine disc'), (b) => {
    cyl(b, 'z', [0, H, 0], r0, -22, 22, { name: 'Disc' });
    cyl(b, 'z', [0, H, 0], 25, -120, 120, { name: 'Shaft' });
  }, { color: GREY, material: 'titanium' });
  const frame = rig(p, L('베어링 받침', 'Bearing pedestals'), (b) => {
    box(b, [-280, -16, -150], [280, 0, 150], 'add', 'Base');
    for (const z of [-100, 100]) { box(b, [-40, 0, z - 10], [40, H + 40, z + 10], 'add', 'Pedestal'); cyl(b, 'z', [0, H, 0], 26.2, z - 11, z + 11, { op: 'cut' }); }
  }, { color: DARK });
  const asm = stageAssembly(p, L('터빈 로터 회전', 'Turbine rotor turning'), 6);
  put(asm, frame, [0, 0, 0]);
  const cR = put(asm, rotor, [0, 0, 0]);
  motor(asm, cR, [0, H, 0], [0, 0, 1], { speed: 15 });
  for (let i = 0; i < N; i++) {
    const a = (i * 360) / N; const q = RZ(a);
    const c = put(asm, part, add([0, H, 0], rotate(q, [0, r0 + 30.3, 0])), q);
    motor(asm, c, [0, H, 0], [0, 0, 1], { speed: 15 });
  }
}

/** One line on the start page: what the sample's stage does. */
export const MOTION_NOTES = {
  basMountBracket: ['트러니언 2축 모션', 'two-axis trunnion motion'], basManifold: ['트러니언 2축 모션', 'two-axis trunnion motion'], basPipeTee: ['트러니언 2축 모션', 'two-axis trunnion motion'],
  basClevis: ['핀 링크 요동 모션', 'swinging link motion'], basNamePlate: ['트러니언 2축 모션', 'two-axis trunnion motion'], basBearingCap: ['분할 하우징 축 회전 모션', 'shaft turning in the split housing'],
  basHeatSink: ['냉각 팬 회전 모션', 'fan running'], basConRod: ['슬라이더 크랭크 모션', 'slider-crank motion'], basMotorMount: ['스테핑 모터 구동 모션', 'stepper driving a pulley'],
  basCamDisc: ['캠·종동절 모션', 'cam and follower motion'], basCapScrew: ['너트 러너 체결 모션', 'nut-runner motion'], basCastleNut: ['너트 러너 체결 모션', 'nut-runner motion'],
  basBallKnob: ['변속 레버 모션', 'shift-lever motion'], basTSlotTable: ['테이블 이송 모션', 'table traverse motion'], basSpringClip: ['스프링 감김 모션', 'spring winding motion'],
  mchSpurGear: ['기어 한 쌍 맞물림 모션', 'meshing pair motion'], mchBevelGear: ['베벨 기어 맞물림 모션', 'bevel pair motion'], mchWormGearSet: ['웜 구동 모션 (1:30)', 'worm drive motion (1:30)'],
  mchTimingPulley: ['벨트 구동 모션', 'belt drive motion'], mchSprocket: ['체인 구동 모션', 'chain drive motion'], mchBallBearing: ['축 회전 모션', 'shaft turning motion'],
  mchSteppedShaft: ['필로 블록 회전 모션', 'turning in pillow blocks'], mchJawCoupling: ['커플링 회전 모션', 'coupling motion'], mchCompressionSpring: ['끝면 연삭 모션', 'end-grinding motion'],
  mchTorsionSpring: ['스프링 감김 모션', 'spring winding motion'], mchGrooveCam: ['홈 캠·롤러 종동절 모션', 'groove cam and roller motion'], mchLeadScrew: ['나사 이송 모션', 'screw feed motion'],
  mchUJointYoke: ['유니버설 조인트 12° 모션', 'universal joint motion at 12°'], mchCrankshaft: ['크랭크축 회전 모션', 'crankshaft turning'], mchImpeller: ['팬 회전 모션', 'fan running'],
  hsgGearbox: ['트러니언 2축 모션', 'two-axis trunnion motion'], hsgEnclosure: ['트러니언 2축 모션', 'two-axis trunnion motion'], hsgCover: ['사출품 취출 모션', 'ejection motion'],
  hsgVolute: ['트러니언 2축 모션', 'two-axis trunnion motion'], hsgEndBell: ['트러니언 2축 모션', 'two-axis trunnion motion'], hsgChassis: ['롤러 컨베이어 모션', 'roller-conveyor motion'],
  hsgLBracket: ['트러니언 2축 모션', 'two-axis trunnion motion'], hsgDinRail: ['트러니언 2축 모션', 'two-axis trunnion motion'], hsgRackPanel: ['랙 인출 모션', 'slide-out motion'],
  hsgHandle: ['트러니언 2축 모션', 'two-axis trunnion motion'], hsgBatteryBox: ['뚜껑 열림 모션', 'lid opening motion'], hsgGuard: ['가드 안 로봇 암 모션', 'robot arm inside the guard'],
  hsgGrip: ['턴테이블 모션', 'turntable motion'], hsgNozzle: ['바닥 청소 모션', 'floor-cleaning motion'], hsgBottle: ['롤러 컨베이어 모션', 'roller-conveyor motion'],
  advSpring: ['하중 시험 모션', 'load-test motion'], advBoltNut: ['너트 러너 모션', 'nut-runner motion'], advBikeFrame: ['바퀴·조향 모션', 'wheels and steering motion'],
  advMachineStand: ['인덱스 테이블 모션', 'indexing-table motion'], advSheetEnclosure: ['롤러 컨베이어 모션', 'roller-conveyor motion'], advMoldedCover: ['트러니언 2축 모션', 'two-axis trunnion motion'],
  advCarBody: ['턴테이블·바퀴 모션', 'turntable and wheels motion'], advWineGlass: ['턴테이블 모션', 'turntable motion'], advDuctBend: ['트러니언 2축 모션', 'two-axis trunnion motion'],
  advKnob: ['노브 회전 모션', 'knob turning motion'], advParamBracket: ['트러니언 2축 모션', 'two-axis trunnion motion'], advWireHanger: ['진자 모션', 'pendulum motion'],
  advTurbineBlade: ['터빈 로터 모션', 'turbine rotor motion'], advMoldInsert: ['취출 모션', 'ejection motion'], advBottleCap: ['뚜껑 체결 모션', 'capping motion'],
  asmPillowLine: ['축 라인 회전 모션', 'shaft line turning'], asmDoorHinge: ['문 열림 모션', 'door opening motion'], asmFlangeJoint: ['너트 풀림·체결 모션', 'nuts backed off and on'],
  asmCart: ['카트 주행 모션', 'cart rolling motion'], asmShaftDrawing: ['선반 회전 모션 포함', 'with a lathe motion study'], asmHousingDrawing: ['트러니언 모션 포함', 'with a trunnion motion study'],
};
void addRectangle; void addSlot; void circularSketchPattern;
