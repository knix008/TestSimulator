// Start-page samples of the "assembly" group: multi-part assemblies (standard, advanced and mechanical
// mates, exploded views, motion studies, a sub-assembly) and drawings (section / detail views, GD&T,
// datums, surface finish, notes, an assembly drawing with a bill of materials and balloons).
// Every component is placed where its mates put it, then the gear-like mates capture that pose and the
// assembly is solved once more (settle) — so the mates hold exactly and nothing interferes.
// Nothing from the imported modules is used at module top level (samples.js imports this file).
import { builder, centreRect, circle, poly, point, near, settle, component } from '../samples.js';
import { addLine, addPolygon, addRectangle, addSlot, addArc } from '../sketch.js';
import { circularSketchPattern, linearSketchPattern } from '../sketchtools.js';
import { regenerate } from '../features.js';
import { createAssembly, createPart, createProject, addDrawing, newId } from '../document.js';
import { mateEntityOfFace, quatFromAxisAngle, quatIdentity, quatMultiply, captureMate, rotate, placeShape, flattenAssembly } from '../assembly.js';
import { viewBasis, layoutViews, bomRows, SHEETS } from '../drawing.js';
import { faceSignature, isCylinder } from '../refs.js';

export const SAMPLES = [
  { id: 'asmGearReducer', group: 'assembly', icon: 'mateGear', ko: ['2단 기어 감속기', '하우징·축 3개·기어 메이트 2개·베어링·커버 볼트 · 분해도 · 입력축 모터 모션'], en: ['Two-stage gear reducer', 'Housing, 3 shafts, 2 gear mates, bearings, cover bolts · exploded view · motor on the input shaft'] },
  { id: 'asmPillowLine', group: 'assembly', icon: 'mateWidth', ko: ['필로 블록 축 라인', '베이스·필로 블록 2개·인서트 베어링·축·풀리·커플링 · 폭/거리 메이트'], en: ['Pillow-block shaft line', 'Base, 2 pillow blocks, insert bearings, shaft, pulley, coupling · width and distance mates'] },
  { id: 'asmVice', group: 'assembly', icon: 'mateScrew', ko: ['기계 바이스', '이송 나사(나사산) · 나사 메이트로 조 이동 · 폭·거리 제한 메이트 · 모션'], en: ['Machine vice', 'Lead screw (thread) · screw mate moves the jaw · width and limit-distance mates · motion'] },
  { id: 'asmRackSteering', group: 'assembly', icon: 'mateRack', ko: ['랙 앤 피니언 조향 장치', '랙 바(직선 이 패턴)·피니언 · 랙 피니언 메이트 · 타이 로드 잠금 · 모션'], en: ['Rack-and-pinion steering', 'Rack bar (linear tooth pattern), pinion · rack-and-pinion mate · locked tie rods · motion'] },
  { id: 'asmSliderCrank', group: 'assembly', icon: 'motion', ko: ['슬라이더 크랭크 기구', '프레임(리브·냉각핀)·크랭크·커넥팅 로드·피스톤 · 힌지 메이트 · 크랭크 모터 모션'], en: ['Slider-crank mechanism', 'Frame (rib, cooling fins), crank, connecting rod, piston · hinge mates · crank motor motion'] },
  { id: 'asmCamFollower', group: 'assembly', icon: 'motion', ko: ['캠과 종동절', '배 모양 캠(호·접선 프로파일)·평면 종동절 · 캠 메이트 · 리브 가이드 · 캠축 모터'], en: ['Cam and follower', 'Pear cam (arc and tangent profile), flat follower · cam mate · ribbed guide · camshaft motor'] },
  { id: 'asmDoorHinge', group: 'assembly', icon: 'mateHinge', ko: ['경첩 문', '맞대기 경첩 2벌(날개·핀) · 힌지 메이트 · 각도 제한 0–110° · 잠금 메이트'], en: ['Hinged door', 'Two butt hinges (leaves, pins) · hinge mates · angle limit 0–110° · lock mates'] },
  { id: 'asmFlangeJoint', group: 'assembly', icon: 'mate', ko: ['플랜지 볼트 체결부', '용접 목 플랜지 2개·개스킷·배관·볼트/너트/와셔 4벌 · 원형 패턴 구멍'], en: ['Bolted flange joint', '2 weld-neck flanges, gasket, pipes, 4 bolts / nuts / washers · circular hole pattern'] },
  { id: 'asmPlanetary', group: 'assembly', icon: 'featCirPattern', ko: ['유성 기어 세트', '선 기어·유성 기어 3개·내치 링 기어 · 기어 메이트 6개 · 선 기어 모터'], en: ['Planetary gear set', 'Sun, 3 planets, internal ring gear · 6 gear mates · sun motor'] },
  { id: 'asmRobot', group: 'assembly', icon: 'assembly', ko: ['6축 다관절 로봇', '베이스·선회·상완·전완·3축 손목·툴 플랜지 + 2지 그리퍼 서브 어셈블리 · 힌지/각도 제한 메이트 · J1–J6 관절 모터·그리퍼 개폐 모션 · 분해도'], en: ['Six-axis articulated robot', 'Base, waist, upper arm, forearm, 3-axis wrist, tool flange + two-finger gripper sub-assembly · hinge and angle-limit mates · J1–J6 joint motors, gripper opening and closing · exploded view'] },
  { id: 'asmCart', group: 'assembly', icon: 'insertComponent', ko: ['운반 카트 (서브 어셈블리)', '캐스터 서브 어셈블리 4번 사용 · 용접 파이프 손잡이(구조 부재) · 폭 메이트'], en: ['Utility cart (sub-assemblies)', 'Caster sub-assembly used 4 times · welded pipe handle (structural member) · width mate'] },
  { id: 'asmShaftDrawing', group: 'assembly', icon: 'sectionDrawing', ko: ['전동축 부품도', '단면도 A-A · 상세도 B · 흔들림/원통도/직각도 기하 공차 · 데이텀 · 표면 거칠기 · 주기'], en: ['Transmission shaft drawing', 'Section A-A · detail B · runout, cylindricity, perpendicularity GD&T · datums · surface finish · notes'] },
  { id: 'asmHousingDrawing', group: 'assembly', icon: 'gdt', ko: ['베어링 하우징 부품도', '평면도 위 단면도 A-A · 단면의 상세도 C · 위치도(MMC)·평면도 공차 · 데이텀 A/B'], en: ['Bearing housing drawing', 'Section A-A from the top view · detail C of the section · position (MMC) and flatness GD&T · datums A/B'] },
  { id: 'asmRobotDrawing', group: 'assembly', icon: 'bom', ko: ['로봇 조립도', '6축 로봇 어셈블리 도면 · 부품표(BOM) · 품번 풍선 · 주기'], en: ['Robot assembly drawing', 'Six-axis robot assembly drawing · bill of materials · item balloons · notes'] },
  { id: 'asmViceDrawing', group: 'assembly', icon: 'balloon', ko: ['바이스 조립도', '조립 단면도 A-A · 부품표 · 풍선 · 주기'], en: ['Vice assembly drawing', 'Assembly section A-A · bill of materials · balloons · notes'] },
];

// ───────────────────────── small helpers

const T = (lang) => (ko, en) => (lang === 'en' ? en : ko);
const RX = (deg) => quatFromAxisAngle([1, 0, 0], deg);
const RY = (deg) => quatFromAxisAngle([0, 1, 0], deg);
const RZ = (deg) => quatFromAxisAngle([0, 0, 1], deg);
const qmul = (...qs) => qs.reduce((a, b) => quatMultiply(a, b));
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Face tests on signatures: a plane with outward normal n through n·p = c; a cylinder of radius r. */
const PL = (n, c, extra = () => true) => (f) => f.type === 'PLANE' && dot3(f.normal, n) > 0.999 && near(dot3(f.center, n), c, 1e-3) && extra(f);
const CY = (r, extra = () => true) => (f) => isCylinder(f.type) && near(f.radius ?? -1, r, 0.01) && extra(f);
const at = (i, v, tol = 0.5) => (f) => near(f.center[i], v, tol);

/** Mate references of a part's faces, the part rebuilt once: pick(compId, test) → mate entity. */
function picker(part) {
  const body = regenerate(part).body;
  const faces = body.faces.map((f) => ({ f, s: faceSignature(f) }));
  return (comp, test) => {
    const hit = faces.find((x) => test(x.s, x.f));
    if (!hit) throw new Error(`sample: face not found in ${part.name} (${faces.map((x) => `${x.s.type}${x.s.radius ? ` r${x.s.radius}` : ''} @${x.s.center.map(Math.round)}`).join('; ')})`);
    return { comp: typeof comp === 'string' ? comp : comp.id, ...mateEntityOfFace(hit.f, faceSignature) };
  };
}

/** A mate (returned, so gear-like ones can capture their base). */
function addMate(asm, type, a, b, extra = {}) {
  const m = { id: newId('mate'), type, name: '', a, b, ...extra };
  asm.mates.push(m);
  return m;
}
/** Mechanical mates measure from the pose they are added in (components already in place). */
const mech = (asm, type, a, b, extra = {}) => captureMate(asm, addMate(asm, type, a, b, extra));
/** A mate reference's direction in the assembly. */
const worldDir = (asm, ent) => rotate(asm.components.find((c) => c.id === ent.comp).rotation, ent.dir);
/** A gear mate: external gears turn opposite ways, a ring gear the same way (reverse follows the refs' directions). */
function gearMate(asm, a, b, ratio, internal = false) {
  const same = dot3(worldDir(asm, a), worldDir(asm, b)) > 0;
  return mech(asm, 'gear', a, b, { ratio, reverse: internal ? same : !same });
}

function newProject(name) { return createProject({ name, kind: 'none' }); }
function part(name, extra) { return createPart(name, extra); }

/** A revolved part about its Y axis: `pts` = closed profile [[radius, y] …] in the front plane. */
function revolveBody(b, pts, name) {
  const ys = pts.map((p) => p[1]);
  const s = b.sketch('front', (k) => { poly(k, pts); addLine(k, 0, Math.min(...ys) - 5, 0, Math.max(...ys) + 5, { construction: true }); }, name);
  return b.add('revolve', { sketch: s.id });
}

/** Profile of a stepped shaft along Y: segs = [[y0, y1, diameter] …] in order. */
function shaftProfile(segs) {
  const pts = [[0, segs[0][0]]];
  for (const [y0, y1, d] of segs) { pts.push([d / 2, y0], [d / 2, y1]); }
  pts.push([0, segs.at(-1)[1]]);
  // Drop repeated points where two segments of one diameter meet.
  return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
}

/** Circular edges of radius r at height y (Y-axis parts). */
const ringEdge = (r, y, tol = 0.02) => (e) => e.type === 'CIRCLE' && near(e.mid[1], y, tol) && near(Math.hypot(e.mid[0], e.mid[2]), r, tol);

/**
 * The outline of a spur gear's teeth about the sketch origin (a closed polyline): teeth at angles 2πk/z (one on
 * +x), trapezoid gaps half way between, root r − 1.25 m, tip r + m (thin teeth: the mating gear's tooth
 * clears the gap). `internal`: a ring gear's inner outline — gaps open outward from the tip r − m to the root r + 1.25 m.
 * (Top plane: sketch angle φ is a rotation about +Y.)
 */
function toothOutline(k, { z, m, internal = false }) {
  const r = (z * m) / 2; const p = Math.PI * m;
  const root = internal ? r + 1.25 * m : r - 1.25 * m;
  const tip = internal ? r - m : r + m;
  const open = internal ? tip - 1.5 : tip + 1.5;
  const hw = 0.25 * p + ((tip - root) / (open - root)) * 0.18 * p;
  const pts = [];
  for (let i = 0; i < z; i++) {
    const g = ((2 * i + 1) * Math.PI) / z;
    const P = (rho, t) => [rho * Math.cos(g) - t * Math.sin(g), rho * Math.sin(g) + t * Math.cos(g)];
    pts.push(P(tip, -hw), P(root, -0.25 * p), P(root, 0.25 * p), P(tip, hw));
  }
  return poly(k, pts);
}

// ───────────────────────── common parts (local frames: round parts about +Y)

/** A bore of diameter d with a keyway of width kw toward +x (depth 0.45·kw past the bore), as one closed loop. */
function keyedBore(k, d, kw, depth = kw * 0.45) {
  const r = d / 2; const t = Math.asin(kw / 2 / r);
  const arc = addArc(k, 0, 0, r, t, 2 * Math.PI - t);
  const x = r * Math.cos(t) + depth + (r - r * Math.cos(t));
  const l1 = addLine(k, 0, 0, x, -kw / 2, { from: arc.p2 });
  const l2 = addLine(k, 0, 0, x, kw / 2, { from: l1.p2 });
  addLine(k, 0, 0, 0, 0, { from: l2.p2, to: arc.p1 });
  return arc;
}

/**
 * A spur gear: the profile sketch holds the teeth, the bore and the lightening holes (one extrude, no
 * booleans on the toothed body but the hub); hub y w…w+hubL revolved with its chamfer; keyway through the bore.
 */
function spurGear(name, { z, m, w, bore, hubD, hubL, material = 'steel-4340', partNo, holes = 0, keyway = true }) {
  const b = builder(part(name, { material, partNo, description: `z=${z} m=${m}` }));
  const rr = (z * m) / 2 - 1.25 * m;
  const s = b.sketch('top', (k) => {
    toothOutline(k, { z, m });
    if (keyway) keyedBore(k, bore, Math.max(4, Math.round(bore / 4))); else circle(k, 0, 0, bore);
    if (holes) {
      const mid = (rr + hubD / 2) / 2;
      const d = Math.min(rr - hubD / 2 - 6, 2 * mid * Math.sin(Math.PI / holes) - 6);
      const c = circle(k, mid, 0, d);
      circularSketchPattern(k, [c.id], { count: holes });
    }
  }, 'Gear profile');
  b.add('extrude', { sketch: s.id, depth: w });
  if (hubL > 0) {
    const c = 1;
    const hub = b.sketch('front', (k) => {
      poly(k, [[bore / 2, w - 0.5], [hubD / 2, w - 0.5], [hubD / 2, w + hubL - c], [hubD / 2 - c, w + hubL], [bore / 2, w + hubL]]);
      addLine(k, 0, 0, 0, w + hubL + 5, { construction: true });
    }, 'Hub');
    b.add('revolve', { sketch: hub.id });
  }
  return b.part;
}

/** A shielded deep-groove ball bearing d × D × B: rings, shield recesses, chamfers (axis Y, y 0…B). */
function bearing(name, d, D, B, partNo) {
  const b = builder(part(name, { material: 'steel-4340', partNo, description: `${d}×${D}×${B}` }));
  revolveBody(b, [[d / 2, 0], [D / 2, 0], [D / 2, B], [d / 2, B]], 'Rings');
  const ri = d / 2 + (D - d) * 0.22; const ro = D / 2 - (D - d) * 0.2;
  const s = b.sketch('front', (k) => {
    addRectangle(k, ri, -1, ro, 0.6); addRectangle(k, ri, B - 0.6, ro, B + 1);
    addLine(k, 0, -5, 0, B + 5, { construction: true });
  }, 'Shield recess');
  b.add('revolve', { sketch: s.id, op: 'cut' });
  b.add('chamfer', { distance: 0.6, edges: b.edges((e) => e.type === 'CIRCLE' && (near(e.mid[1], 0) || near(e.mid[1], B)) && (near(Math.hypot(e.mid[0], e.mid[2]), d / 2, 0.01) || near(Math.hypot(e.mid[0], e.mid[2]), D / 2, 0.01))) });
  return b.part;
}

/** Hex head bolt: head y 0…k (across flats s), shank y −L…0 (diameter d); tip chamfer, cosmetic thread. */
function hexBolt(name, d, L, { s = d * 1.6, k = d * 0.65, material = 'steel-4340', partNo, thread = true } = {}) {
  const b = builder(part(name, { material, partNo: partNo ?? `ISO4017-M${d}x${L}`, description: `M${d}×${L}` }));
  const head = b.sketch('top', (q) => addPolygon(q, 0, 0, s / Math.sqrt(3), 6, 0), 'Head');
  b.add('extrude', { sketch: head.id, depth: k });
  b.add('chamfer', { distance: d * 0.08, edges: b.edges((e) => e.type === 'LINE' && near(e.mid[1], k) && Math.abs(e.dir[1]) < 0.01) });
  const sh = b.sketch('top', (q) => circle(q, 0, 0, d), 'Shank');
  b.add('extrude', { sketch: sh.id, depth: L, reverse: true });
  b.add('chamfer', { distance: d * 0.1, edges: b.edges(ringEdge(d / 2, -L)) });
  if (thread) b.add('thread', { edge: b.edges(ringEdge(d / 2 - d * 0.1, -L, 0.05))[0] ?? b.edges((e) => e.type === 'CIRCLE' && near(e.mid[1], -L + d * 0.1, 0.05))[0], pitch: d <= 8 ? 1.25 : d <= 12 ? 1.75 : 2, length: Math.min(L, 2 * d + 6), cosmetic: true });
  return b.part;
}

/** Hex nut: y 0…m, hole d, both faces chamfered. */
function hexNut(name, d, { s = d * 1.6, m = d * 0.8, material = 'steel-4340', partNo } = {}) {
  const b = builder(part(name, { material, partNo: partNo ?? `ISO4032-M${d}`, description: `M${d}` }));
  const sk = b.sketch('top', (q) => { addPolygon(q, 0, 0, s / Math.sqrt(3), 6, 0); circle(q, 0, 0, d); }, 'Hex');
  b.add('extrude', { sketch: sk.id, depth: m });
  b.add('chamfer', { distance: d * 0.08, edges: b.edges((e) => e.type === 'LINE' && (near(e.mid[1], 0) || near(e.mid[1], m)) && Math.abs(e.dir[1]) < 0.01) });
  b.add('chamfer', { distance: d * 0.06, edges: b.edges(ringEdge(d / 2, m)) });
  return b.part;
}

/** Plain washer: y 0…t. */
function washer(name, d, D, t, partNo) {
  const b = builder(part(name, { material: 'steel-1020', partNo: partNo ?? `ISO7089-${d}`, description: `${d}×${D}×${t}` }));
  const sk = b.sketch('top', (q) => { circle(q, 0, 0, D); circle(q, 0, 0, d); }, 'Ring');
  b.add('extrude', { sketch: sk.id, depth: t });
  b.add('chamfer', { distance: t * 0.25, edges: b.edges(ringEdge(D / 2, t)) });
  return b.part;
}

// ───────────────────────── 1. two-stage gear reducer

function gearReducerModel(L) {
  const project = newProject(L('2단 기어 감속기', 'Two-stage gear reducer'));
  const X0 = -80; const X1 = -20; const X2 = 45; const YC = 70;
  // Housing: box, rounded, shelled open at the top, feet, bearing bosses (mirrored), bores, tapped cover holes.
  const housing = (() => {
    const b = builder(part(L('기어 하우징', 'Gear housing'), { material: 'cast-iron', partNo: 'GR-100', description: L('주철 하우징', 'Cast housing') }));
    const box = b.sketch('top', (k) => centreRect(k, 228, 104), 'Box');
    b.add('extrude', { sketch: box.id, depth: 135 });
    b.add('fillet', { radius: 14, edges: b.edges((e) => Math.abs(e.dir[1]) > 0.99) });
    b.add('shell', { thickness: 12, faces: b.faces(PL([0, 1, 0], 135)) });
    const foot = b.sketch('top', (k) => centreRect(k, 268, 144), 'Feet');
    b.add('extrude', { sketch: foot.id, depth: 14 });
    b.add('fillet', { radius: 10, edges: b.edges((e) => Math.abs(e.dir[1]) > 0.99 && near(Math.abs(e.mid[0]), 134) && near(Math.abs(e.mid[2]), 72)) });
    const fh = b.sketch(b.plane('top', 14), (k) => { for (const x of [-124, 124]) for (const z of [-62, 62]) point(k, x, z); }, 'Foot holes');
    b.add('hole', { sketch: fh.id, kind: 'counterbore', diameter: 11, cbDiameter: 18, cbDepth: 3, through: true });
    const boss = b.sketch(b.plane('front', 52), (k) => addSlot(k, X0, YC, X2, YC, 30), 'Bearing boss');
    const bossEx = b.add('extrude', { sketch: boss.id, depth: 6 });
    b.add('mirror', { seeds: [bossEx.id], plane: { kind: 'std', name: 'front' } });
    const bores = b.sketch('front', (k) => { circle(k, X0, YC, 42); circle(k, X1, YC, 42); circle(k, X2, YC, 47); }, 'Bearing bores');
    b.add('extrude', { sketch: bores.id, op: 'cut', end: 'throughBoth' });
    const ch = b.sketch(b.plane('top', 135), (k) => { point(k, 0, 46); point(k, 0, -46); point(k, -108, 0); point(k, 108, 0); }, 'Cover holes');
    b.add('hole', { sketch: ch.id, diameter: 8, depth: 20, through: false });
    const drain = b.sketch(b.plane('right', 114), (k) => circle(k, 0, 24, 16), 'Drain boss');
    b.add('extrude', { sketch: drain.id, depth: 6 });
    const dh = b.sketch(b.plane('right', 120), (k) => point(k, 0, 24), 'Drain hole');
    b.add('hole', { sketch: dh.id, diameter: 10, depth: 18, through: false });
    return b.part;
  })();
  const cover = (() => {
    const b = builder(part(L('상부 커버', 'Top cover'), { material: 'al-6061', partNo: 'GR-101' }));
    const s = b.sketch('top', (k) => centreRect(k, 228, 104), 'Plate');
    b.add('extrude', { sketch: s.id, depth: 8 });
    b.add('fillet', { radius: 14, edges: b.edges((e) => Math.abs(e.dir[1]) > 0.99) });
    const insp = b.sketch(b.plane('top', 8), (k) => { const r = addRectangle(k, -70, -25, 10, 25); void r; }, 'Inspection pad');
    b.add('extrude', { sketch: insp.id, depth: 3 });
    b.add('fillet', { radius: 6, edges: b.edges((e) => Math.abs(e.dir[1]) > 0.99 && e.mid[1] > 8 && e.mid[1] < 11.01) });
    const br = b.sketch(b.plane('top', 8), (k) => circle(k, 60, 0, 22), 'Breather');
    b.add('extrude', { sketch: br.id, depth: 12 });
    const bh = b.sketch(b.plane('top', 20), (k) => point(k, 60, 0), 'Breather hole');
    b.add('hole', { sketch: bh.id, diameter: 8, through: true });
    const hs = b.sketch(b.plane('top', 8), (k) => { point(k, 0, 46); point(k, 0, -46); point(k, -108, 0); point(k, 108, 0); }, 'Bolt holes');
    b.add('hole', { sketch: hs.id, diameter: 9, through: true });
    b.add('chamfer', { distance: 1, edges: b.edges((e) => e.type === 'CIRCLE' && near(e.mid[1], 20) && near(Math.hypot(e.mid[0] - 60, e.mid[2]), 11, 0.05)) });
    return b.part;
  })();
  // Input pinion shaft: journals Ø20, integral pinion (z 13, m 2) between −30 and −16, keyed extension.
  const pinionShaft = (name, partNo, segs, gear, keyAt) => {
    const b = builder(part(name, { material: 'steel-4340', partNo }));
    revolveBody(b, shaftProfile(segs), 'Shaft profile');
    const ends = [segs[0][0], segs.at(-1)[1]];
    b.add('chamfer', { distance: 1, edges: b.edges((e) => e.type === 'CIRCLE' && ends.some((y) => near(e.mid[1], y))) });
    if (keyAt) {
      const [y1, y2, d] = keyAt;
      const ks = b.sketch(b.plane('right', d / 2), (k) => addSlot(k, 0, y1, 0, y2, 3), 'Keyway');
      b.add('extrude', { sketch: ks.id, op: 'cut', depth: 3.5 });
    }
    const t = b.sketch(b.plane('top', gear.y0), (k) => toothOutline(k, gear), 'Pinion teeth');
    b.add('extrude', { sketch: t.id, depth: gear.width });
    return b.part;
  };
  const input = pinionShaft(L('입력 피니언 축', 'Input pinion shaft'), 'GR-110',
    [[-58, -46, 20], [-46, -30, 24], [-30, -16, 19], [-16, 46, 24], [46, 58, 20], [58, 100, 18]], { z: 13, m: 2, y0: -30, width: 14 }, [66, 92, 18]);
  const inter = pinionShaft(L('중간 축', 'Intermediate shaft'), 'GR-120',
    [[-58, -46, 20], [-46, -30, 30], [-30, -8, 25], [-8, -4, 28], [-4, 16, 24], [16, 46, 28], [46, 58, 20]], { z: 13, m: 2.5, y0: -4, width: 20 }, null);
  const output = (() => {
    const b = builder(part(L('출력 축', 'Output shaft'), { material: 'steel-4340', partNo: 'GR-130' }));
    revolveBody(b, shaftProfile([[-58, -46, 25], [-46, -10, 28], [-10, -4, 36], [-4, 26, 30], [26, 46, 28], [46, 58, 25], [58, 110, 24]]), 'Shaft profile');
    b.add('chamfer', { distance: 1, edges: b.edges((e) => e.type === 'CIRCLE' && (near(e.mid[1], -58) || near(e.mid[1], 110))) });
    const ks = b.sketch(b.plane('right', 12), (k) => addSlot(k, 0, 68, 0, 100, 4), 'Keyway');
    b.add('extrude', { sketch: ks.id, op: 'cut', depth: 4 });
    const ks2 = b.sketch(b.plane('right', 15), (k) => addSlot(k, 0, 0, 0, 22, 4), 'Gear keyway');
    b.add('extrude', { sketch: ks2.id, op: 'cut', depth: 4 });
    b.add('fillet', { radius: 0.8, edges: b.edges(ringEdge(14, -10)) });
    return b.part;
  })();
  const gear2 = spurGear(L('1단 기어 (47잇)', 'Stage 1 gear (47 T)'), { z: 47, m: 2, w: 14, bore: 25, hubD: 40, hubL: 8, partNo: 'GR-121', holes: 6 });
  const gear4 = spurGear(L('2단 기어 (39잇)', 'Stage 2 gear (39 T)'), { z: 39, m: 2.5, w: 20, bore: 30, hubD: 48, hubL: 10, partNo: 'GR-131', holes: 6 });
  const brgS = bearing(L('베어링 6004', 'Bearing 6004'), 20, 42, 12, '6004-2Z');
  const brgL = bearing(L('베어링 6005', 'Bearing 6005'), 25, 47, 12, '6005-2Z');
  const cap = (name, partNo, hole) => {
    const b = builder(part(name, { material: 'al-6061', partNo }));
    const s = b.sketch('top', (k) => { circle(k, 0, 0, 56); if (hole) circle(k, 0, 0, hole); }, 'Cap');
    b.add('extrude', { sketch: s.id, depth: 6 });
    const hs = b.sketch(b.plane('top', 6), (k) => point(k, 22, 0), 'Screw hole');
    const h = b.add('hole', { sketch: hs.id, kind: 'countersink', diameter: 5.5, csDiameter: 10, through: true });
    b.add('circularPattern', { seeds: [h.id], axis: { kind: 'axis', axis: 'y' }, count: 4 });
    b.add('chamfer', { distance: 1, edges: b.edges(ringEdge(28, 6)) });
    return b.part;
  };
  const capBlind = cap(L('베어링 커버', 'Bearing cap'), 'GR-140', 0);
  const capIn = cap(L('입력 커버 (축 구멍)', 'Input cap (through)'), 'GR-141', 22);
  const capOut = cap(L('출력 커버 (축 구멍)', 'Output cap (through)'), 'GR-142', 28);
  const bolt = hexBolt(L('육각 볼트 M8×25', 'Hex bolt M8×25'), 8, 25);
  project.parts.push(housing, cover, input, inter, output, gear2, gear4, brgS, brgL, capBlind, capIn, capOut, bolt);

  const asm = createAssembly(L('2단 기어 감속기', 'Two-stage gear reducer'), { partNo: 'GR-000', description: L('감속비 10.8 : 1', 'Ratio 10.8 : 1') });
  project.assemblies.push(asm);
  const P = Object.fromEntries([['housing', housing], ['cover', cover], ['input', input], ['inter', inter], ['output', output], ['gear2', gear2], ['gear4', gear4], ['brgS', brgS], ['brgL', brgL], ['capBlind', capBlind], ['capIn', capIn], ['capOut', capOut], ['bolt', bolt]].map(([k, p]) => [k, picker(p)]));
  const cH = component(asm, housing, [0, 0, 0], quatIdentity(), true);
  const cCover = component(asm, cover, [0, 135, 0]);
  addMate(asm, 'coincident', P.housing(cH, PL([0, 1, 0], 135)), P.cover(cCover, PL([0, -1, 0], 0)));
  addMate(asm, 'concentric', P.housing(cH, CY(4, at(0, 108))), P.cover(cCover, CY(4.5, at(0, 108))));
  addMate(asm, 'concentric', P.housing(cH, CY(4, at(0, -108))), P.cover(cCover, CY(4.5, at(0, -108))));
  const bolts = [[0, 46], [0, -46], [-108, 0], [108, 0]].map(([x, z]) => {
    const c = component(asm, bolt, [x, 143, z]);
    addMate(asm, 'concentric', P.housing(cH, CY(4, (f) => near(f.center[0], x, 0.5) && near(f.center[2], z, 0.5))), P.bolt(c, CY(4, (f) => f.center[1] < -1)));
    addMate(asm, 'coincident', P.cover(cCover, PL([0, 1, 0], 8)), P.bolt(c, PL([0, -1, 0], 0)));
    return c;
  });
  // Shafts along +Z (part Y → world Z), bearings in the bores flush with the bosses, caps on the bosses.
  const shafts = [[input, X0, brgS, capIn], [inter, X1, brgS, capBlind], [output, X2, brgL, capOut]].map(([p, x, brg, frontCap]) => {
    const pk = picker(p);
    const cS = component(asm, p, [x, YC, 0], RX(90));
    const br = brg === brgS ? P.brgS : P.brgL;
    const r = brg === brgS ? 10 : 12.5;
    const bore = P.housing(cH, CY(brg === brgS ? 21 : 23.5, (f) => near(f.center[0], x, 0.5)));
    const front = component(asm, brg, [x, YC, 46], RX(90));
    const back = component(asm, brg, [x, YC, -58], RX(90));
    for (const [cb, face] of [[front, PL([0, 0, 1], 58, (f) => f.center[0] > x - 31 && f.center[0] < x + 31)], [back, PL([0, 0, -1], 58)]]) {
      addMate(asm, 'concentric', bore, br(cb, CY(brg === brgS ? 21 : 23.5)));
      const bossFace = P.housing(cH, cb === front ? PL([0, 0, 1], 58) : PL([0, 0, -1], 58));
      void face;
      addMate(asm, 'coincident', bossFace, br(cb, cb === front ? PL([0, 1, 0], 12) : PL([0, -1, 0], 0)), { aligned: 'aligned' });
    }
    addMate(asm, 'concentric', br(front, CY(r)), pk(cS, CY(r, (f) => f.center[1] > 40 && f.center[1] < 60)));
    addMate(asm, 'coincident', br(back, PL([0, 1, 0], 12)), pk(cS, PL([0, -1, 0], 46)));
    const cf = component(asm, frontCap, [x, YC, 58], RX(90));
    const cb2 = component(asm, capBlind, [x, YC, -58], RX(-90));
    const capPick = frontCap === capIn ? P.capIn : frontCap === capOut ? P.capOut : P.capBlind;
    addMate(asm, 'coincident', P.housing(cH, PL([0, 0, 1], 58)), capPick(cf, PL([0, -1, 0], 0)));
    addMate(asm, 'concentric', bore, capPick(cf, CY(28)));
    addMate(asm, 'coincident', P.housing(cH, PL([0, 0, -1], 58)), P.capBlind(cb2, PL([0, -1, 0], 0)));
    addMate(asm, 'concentric', bore, P.capBlind(cb2, CY(28)));
    return { comp: cS, pick: pk, front, back, caps: [cf, cb2] };
  });
  const [sIn, sMid, sOut] = shafts;
  // Gears on their seats, locked to the shafts; gear mates between the stages.
  const cG2 = component(asm, gear2, [X1, YC, -30], RX(90));
  addMate(asm, 'concentric', sMid.pick(sMid.comp, CY(12.5)), P.gear2(cG2, CY(12.5)));
  addMate(asm, 'coincident', sMid.pick(sMid.comp, PL([0, 1, 0], -30)), P.gear2(cG2, PL([0, -1, 0], 0)));
  mech(asm, 'lock', { comp: sMid.comp.id }, { comp: cG2.id });
  const cG4 = component(asm, gear4, [X2, YC, -4], RX(90));
  addMate(asm, 'concentric', sOut.pick(sOut.comp, CY(15)), P.gear4(cG4, CY(15)));
  addMate(asm, 'coincident', sOut.pick(sOut.comp, PL([0, 1, 0], -4)), P.gear4(cG4, PL([0, -1, 0], 0)));
  mech(asm, 'lock', { comp: sOut.comp.id }, { comp: cG4.id });
  const inAxis = sIn.pick(sIn.comp, CY(10, (f) => f.center[1] > 40));
  gearMate(asm, inAxis, P.gear2(cG2, CY(12.5)), 13 / 47);
  gearMate(asm, sMid.pick(sMid.comp, CY(10, (f) => f.center[1] > 40)), P.gear4(cG4, CY(15)), 13 / 39);
  settle(project, asm);
  asm.motion = { duration: 3, motors: [{ id: 'motor-1', kind: 'rotary', comp: sIn.comp.id, ref: inAxis, speed: 20 }] };
  asm.explode = {
    on: false,
    steps: [
      { id: 'explode-1', comps: [cCover.id, ...bolts.map((c) => c.id)], dir: [0, 1, 0], distance: 120 },
      { id: 'explode-2', comps: bolts.map((c) => c.id), dir: [0, 1, 0], distance: 60 },
      { id: 'explode-3', comps: shafts.map((s) => s.caps[0].id), dir: [0, 0, 1], distance: 110 },
      { id: 'explode-4', comps: shafts.map((s) => s.front.id), dir: [0, 0, 1], distance: 70 },
      { id: 'explode-5', comps: shafts.map((s) => s.caps[1].id), dir: [0, 0, -1], distance: 90 },
      { id: 'explode-6', comps: [...shafts.map((s) => s.comp.id), cG2.id, cG4.id, ...shafts.map((s) => s.back.id)], dir: [0, 1, 0], distance: 190 },
      { id: 'explode-7', comps: [cG2.id, cG4.id], dir: [0, 0, -1], distance: 40 },
    ],
  };
  return { project, asm };
}

// ───────────────────────── 2. pillow-block shaft line

/** A plain plane feature (offset from a standard plane, optionally flipped): its reference. */
function planeRef(b, base, offset, flip = false) {
  const f = b.add('plane', { base: { kind: 'std', name: base }, offset, flip });
  return { kind: 'ref', id: f.id };
}

function pillowBlock(L) {
  const b = builder(part(L('필로 블록 UCP205', 'Pillow block UCP205'), { material: 'cast-iron', partNo: 'UCP205', description: L('축 높이 50', 'Shaft height 50') }));
  const base = b.sketch('top', (k) => centreRect(k, 130, 38), 'Base');
  b.add('extrude', { sketch: base.id, depth: 18 });
  b.add('fillet', { radius: 4, edges: b.edges((e) => Math.abs(e.dir[1]) > 0.99 && near(Math.abs(e.mid[0]), 65)) });
  const ped = b.sketch('front', (k) => {
    const l1 = addLine(k, -38, 50, -38, 18);
    const l2 = addLine(k, 0, 0, 38, 18, { from: l1.p2 });
    const l3 = addLine(k, 0, 0, 38, 50, { from: l2.p2 });
    addArc(k, 0, 50, 38, 0, Math.PI, { from: l3.p2, to: l1.p1 });
  }, 'Pedestal');
  b.add('extrude', { sketch: ped.id, end: 'midplane', depth: 38 });
  const bore = b.sketch('front', (k) => circle(k, 0, 50, 52), 'Bore');
  b.add('extrude', { sketch: bore.id, op: 'cut', end: 'throughBoth' });
  b.add('chamfer', { distance: 1, edges: b.edges((e) => e.type === 'CIRCLE' && near(Math.hypot(e.mid[0], e.mid[1] - 50), 26, 0.02)) });
  const sl = b.sketch(b.plane('top', 18), (k) => addSlot(k, 47, 0, 57, 0, 7), 'Bolt slot');
  const slot = b.add('extrude', { sketch: sl.id, op: 'cut', end: 'throughBoth' });
  b.add('mirror', { seeds: [slot.id], plane: { kind: 'std', name: 'right' } });
  const nip = b.sketch(b.plane('top', 88), (k) => circle(k, 0, 0, 14), 'Grease boss');
  b.add('extrude', { sketch: nip.id, depth: 5 });
  const gh = b.sketch(b.plane('top', 93), (k) => point(k, 0, 0), 'Grease hole');
  b.add('hole', { sketch: gh.id, diameter: 5, depth: 20, through: false });
  return b.part;
}

function pillowLineModel(L) {
  const project = newProject(L('필로 블록 축 라인', 'Pillow-block shaft line'));
  const base = (() => {
    const b = builder(part(L('베이스 판', 'Base plate'), { material: 'steel-1020', partNo: 'PL-100' }));
    const s = b.sketch('top', (k) => centreRect(k, 160, 330), 'Plate');
    b.add('extrude', { sketch: s.id, depth: 20 });
    b.add('fillet', { radius: 10, edges: b.edges((e) => Math.abs(e.dir[1]) > 0.99) });
    b.add('chamfer', { distance: 2, edges: b.edges((e) => e.type === 'LINE' && near(e.mid[1], 20) && Math.abs(e.dir[2]) > 0.99) });
    const hs = b.sketch(b.plane('top', 20), (k) => { for (const x of [-52, 52]) for (const z of [-120, 120]) point(k, x, z); }, 'Tapped holes');
    b.add('hole', { sketch: hs.id, diameter: 12, through: true });
    const sl = b.sketch(b.plane('top', 20), (k) => addSlot(k, -58, -150, -42, -150, 6), 'Anchor slot');
    const slot = b.add('extrude', { sketch: sl.id, op: 'cut', end: 'throughBoth' });
    b.add('linearPattern', { seeds: [slot.id], direction: { kind: 'axis', axis: 'x' }, spacing: 100, count: 2, direction2: { kind: 'axis', axis: 'z' }, spacing2: 300, count2: 2 });
    return b.part;
  })();
  const block = pillowBlock(L);
  const brg = bearing(L('인서트 베어링 UC205', 'Insert bearing UC205'), 25, 52, 15, 'UC205');
  const shaft = (() => {
    const b = builder(part(L('전동축 Ø25', 'Line shaft Ø25'), { material: 'steel-4340', partNo: 'PL-110' }));
    revolveBody(b, shaftProfile([[0, 40, 22], [40, 380, 25], [380, 420, 22]]), 'Shaft profile');
    b.add('chamfer', { distance: 1, edges: b.edges((e) => e.type === 'CIRCLE' && (near(e.mid[1], 0) || near(e.mid[1], 420))) });
    b.add('fillet', { radius: 0.8, edges: b.edges((e) => ringEdge(11, 40)(e) || ringEdge(11, 380)(e)) });
    const ks = b.sketch(b.plane('right', 11), (k) => { addSlot(k, 0, 8, 0, 32, 3); addSlot(k, 0, 388, 0, 412, 3); }, 'Keyways');
    b.add('extrude', { sketch: ks.id, op: 'cut', depth: 3.5 });
    return b.part;
  })();
  const pulley = (() => {
    const b = builder(part(L('2열 V 풀리', 'Double V-pulley'), { material: 'cast-iron', partNo: 'PL-120' }));
    revolveBody(b, [[11, 0], [22, 0], [22, 18], [48, 18], [48, 5], [60, 5], [60, 9], [51, 15], [60, 21], [60, 29], [51, 35], [60, 41], [60, 45], [48, 45], [48, 32], [22, 32], [22, 50], [11, 50]], 'Pulley profile');
    const hs = b.sketch(b.plane('top', 32), (k) => point(k, 35, 0), 'Web hole');
    const h = b.add('hole', { sketch: hs.id, diameter: 14, through: true });
    b.add('circularPattern', { seeds: [h.id], axis: { kind: 'axis', axis: 'y' }, count: 5 });
    const kw = b.sketch('top', (k) => addRectangle(k, 10, -3, 14, 3), 'Keyway');
    b.add('extrude', { sketch: kw.id, op: 'cut', end: 'throughBoth' });
    b.add('chamfer', { distance: 1.2, edges: b.edges((e) => ringEdge(11, 50)(e) || ringEdge(11, 0)(e)) });
    return b.part;
  })();
  const coupling = (() => {
    const b = builder(part(L('조 커플링 허브', 'Jaw coupling hub'), { material: 'al-7075', partNo: 'PL-130' }));
    revolveBody(b, [[11, 0], [28, 0], [28, 30], [11, 30]], 'Hub');
    const jw = b.sketch(b.plane('top', 30), (k) => poly(k, [[12, -6], [30, -11], [30, 11], [12, 6]]), 'Jaw gap');
    const j = b.add('extrude', { sketch: jw.id, op: 'cut', depth: 12 });
    b.add('circularPattern', { seeds: [j.id], axis: { kind: 'axis', axis: 'y' }, count: 3 });
    const ss = b.sketch(b.plane('right', 28), (k) => point(k, 0, 9), 'Set screw');
    b.add('hole', { sketch: ss.id, diameter: 6, depth: 18, through: false });
    b.add('chamfer', { distance: 1, edges: b.edges(ringEdge(28, 0)) });
    return b.part;
  })();
  const bolt = hexBolt(L('육각 볼트 M12×30', 'Hex bolt M12×30'), 12, 30);
  project.parts.push(base, block, brg, shaft, pulley, coupling, bolt);
  const asm = createAssembly(L('필로 블록 축 라인', 'Pillow-block shaft line'), { partNo: 'PL-000' });
  project.assemblies.push(asm);
  const P = { base: picker(base), block: picker(block), brg: picker(brg), shaft: picker(shaft), pulley: picker(pulley), coupling: picker(coupling), bolt: picker(bolt) };
  const cBase = component(asm, base, [0, 0, 0], quatIdentity(), true);
  const blocks = []; const bearings = []; const bolts = [];
  for (const z of [-120, 120]) {
    const cb = component(asm, block, [0, 20, z]);
    blocks.push(cb);
    addMate(asm, 'coincident', P.base(cBase, PL([0, 1, 0], 20)), P.block(cb, PL([0, -1, 0], 0)));
    addMate(asm, 'width', P.base(cBase, PL([1, 0, 0], 80)), P.base(cBase, PL([-1, 0, 0], 80)), { c: P.block(cb, PL([1, 0, 0], 65)), d: P.block(cb, PL([-1, 0, 0], 65)) });
    const s = Math.sign(z);
    addMate(asm, 'distance', P.block(cb, PL([0, 0, s], 19)), P.base(cBase, PL([0, 0, s], 165)), { value: 26, aligned: 'aligned' });
    const cr = component(asm, brg, [0, 70, z - 7.5], RX(90));
    bearings.push(cr);
    addMate(asm, 'concentric', P.block(cb, CY(26)), P.brg(cr, CY(26)));
    addMate(asm, 'width', P.block(cb, PL([0, 0, 1], 19)), P.block(cb, PL([0, 0, -1], 19)), { c: P.brg(cr, PL([0, -1, 0], 0)), d: P.brg(cr, PL([0, 1, 0], 15)) });
    for (const x of [-52, 52]) {
      const c = component(asm, bolt, [x, 38, z]);
      bolts.push(c);
      addMate(asm, 'concentric', P.base(cBase, CY(6, (f) => near(f.center[0], x, 0.5) && near(f.center[2], z, 0.5))), P.bolt(c, CY(6, (f) => f.center[1] < -1)));
      addMate(asm, 'coincident', P.block(cb, PL([0, 1, 0], 18)), P.bolt(c, PL([0, -1, 0], 0)));
    }
  }
  const cShaft = component(asm, shaft, [0, 70, -210], RX(90));
  addMate(asm, 'concentric', P.brg(bearings[0], CY(12.5)), P.shaft(cShaft, CY(12.5)));
  addMate(asm, 'concentric', P.brg(bearings[1], CY(12.5)), P.shaft(cShaft, CY(12.5)));
  addMate(asm, 'distance', P.base(cBase, PL([0, 0, -1], 165)), P.shaft(cShaft, PL([0, -1, 0], 0)), { value: 45, aligned: 'aligned' });
  const cCoup = component(asm, coupling, [0, 70, -210], RX(90));
  addMate(asm, 'concentric', P.shaft(cShaft, CY(11, (f) => f.center[1] < 100)), P.coupling(cCoup, CY(11)));
  addMate(asm, 'coincident', P.shaft(cShaft, PL([0, -1, 0], 0)), P.coupling(cCoup, PL([0, -1, 0], 0)), { aligned: 'aligned' });
  const cPul = component(asm, pulley, [0, 70, 170], RX(90));
  addMate(asm, 'concentric', P.shaft(cShaft, CY(11, (f) => f.center[1] > 300)), P.pulley(cPul, CY(11)));
  addMate(asm, 'coincident', P.shaft(cShaft, PL([0, 1, 0], 380)), P.pulley(cPul, PL([0, -1, 0], 0)));
  settle(project, asm);
  asm.explode = {
    on: false,
    steps: [
      { id: 'explode-1', comps: bolts.map((c) => c.id), dir: [0, 1, 0], distance: 140 },
      { id: 'explode-2', comps: [cPul.id], dir: [0, 0, 1], distance: 90 },
      { id: 'explode-3', comps: [cCoup.id], dir: [0, 0, -1], distance: 70 },
      { id: 'explode-4', comps: [cShaft.id, ...bearings.map((c) => c.id)], dir: [0, 1, 0], distance: 80 },
      { id: 'explode-5', comps: [bearings[1].id], dir: [0, 0, 1], distance: 40 },
      { id: 'explode-6', comps: [bearings[0].id], dir: [0, 0, -1], distance: 40 },
    ],
  };
  return { project, asm };
}

// ───────────────────────── 3. machine vice (screw mate)

function viceModel(L) {
  const project = newProject(L('기계 바이스', 'Machine vice'));
  const body = (() => {
    const b = builder(part(L('바이스 몸체', 'Vice body'), { material: 'cast-iron', partNo: 'VC-100' }));
    const s = b.sketch('top', (k) => centreRect(k, 220, 90), 'Base');
    b.add('extrude', { sketch: s.id, depth: 14 });
    b.add('fillet', { radius: 8, edges: b.edges((e) => Math.abs(e.dir[1]) > 0.99) });
    const rail = b.sketch(b.plane('top', 14), (k) => addRectangle(k, -95, -20, 70, 20), 'Guide rail');
    b.add('extrude', { sketch: rail.id, depth: 26 });
    const jaw = b.sketch('front', (k) => addRectangle(k, 70, 14, 100, 80), 'Fixed jaw');
    b.add('extrude', { sketch: jaw.id, end: 'midplane', depth: 90 });
    const end = b.sketch('front', (k) => addRectangle(k, -110, 14, -95, 75), 'End block');
    b.add('extrude', { sketch: end.id, end: 'midplane', depth: 50 });
    b.add('chamfer', { distance: 2, edges: b.edges((e) => e.type === 'LINE' && near(e.mid[1], 80) && Math.abs(e.dir[2]) > 0.99) });
    const sh = b.sketch(planeRef(b, 'right', -95), (k) => point(k, 0, 60), 'Screw bearing');
    b.add('hole', { sketch: sh.id, diameter: 16, through: true });
    const ph = b.sketch(planeRef(b, 'right', 70, true), (k) => { point(k, 25, -65); point(k, -25, -65); }, 'Jaw plate holes'); // flipped plane: sketch y runs down
    b.add('hole', { sketch: ph.id, diameter: 5, depth: 12, through: false });
    const sl = b.sketch(b.plane('top', 14), (k) => addSlot(k, -48, -38, -32, -38, 5.5), 'Clamp slot');
    const slot = b.add('extrude', { sketch: sl.id, op: 'cut', depth: 14 });
    b.add('linearPattern', { seeds: [slot.id], direction: { kind: 'axis', axis: 'x' }, spacing: 80, count: 2, direction2: { kind: 'axis', axis: 'z' }, spacing2: 76, count2: 2 });
    return b.part;
  })();
  const jaw = (() => {
    const b = builder(part(L('이동 조', 'Moving jaw'), { material: 'cast-iron', partNo: 'VC-110' }));
    const s = b.sketch('right', (k) => poly(k, [[-45, 16], [-20, 16], [-20, 40], [20, 40], [20, 16], [45, 16], [45, 80], [-45, 80]]), 'Jaw section');
    b.add('extrude', { sketch: s.id, end: 'midplane', depth: 50 });
    b.add('chamfer', { distance: 2, edges: b.edges((e) => e.type === 'LINE' && near(e.mid[1], 80) && Math.abs(e.dir[2]) > 0.99) });
    const nh = b.sketch(planeRef(b, 'right', 25), (k) => point(k, 0, 60), 'Nut thread');
    b.add('hole', { sketch: nh.id, diameter: 16, through: true });
    const ph = b.sketch(planeRef(b, 'right', 25), (k) => { point(k, 25, 65); point(k, -25, 65); }, 'Jaw plate holes');
    b.add('hole', { sketch: ph.id, diameter: 5, depth: 12, through: false });
    b.add('fillet', { radius: 3, edges: b.edges((e) => e.type === 'LINE' && Math.abs(e.dir[0]) > 0.99 && near(e.mid[1], 80)) });
    return b.part;
  })();
  const plate = (() => {
    const b = builder(part(L('조 판 (세레이션)', 'Jaw plate (serrated)'), { material: 'steel-4340', partNo: 'VC-120' }));
    const s = b.sketch('right', (k) => centreRect(k, 90, 30), 'Plate');
    b.add('extrude', { sketch: s.id, depth: 6 });
    const g = b.sketch('front', (k) => {
      const before = k.entities.length;
      poly(k, [[6.01, -12.6], [6.01, -10.6], [5.1, -11.6]]);
      linearSketchPattern(k, k.entities.slice(before).map((e) => e.id), { dx: 0, dy: 3, count: 9 });
    }, 'Serrations');
    b.add('extrude', { sketch: g.id, op: 'cut', end: 'throughBoth' });
    const hs = b.sketch(planeRef(b, 'right', 6), (k) => { point(k, 25, 0); point(k, -25, 0); }, 'Screw holes');
    b.add('hole', { sketch: hs.id, kind: 'countersink', diameter: 6.6, csDiameter: 12, through: true });
    return b.part;
  })();
  const screw = (() => {
    const b = builder(part(L('이송 나사 Tr16×4', 'Lead screw Tr16×4'), { material: 'steel-4340', partNo: 'VC-130' }));
    revolveBody(b, shaftProfile([[-20, 0, 30], [0, 140, 16]]), 'Screw profile');
    b.add('chamfer', { distance: 1.5, edges: b.edges(ringEdge(15, -20)) });
    b.add('thread', { edge: b.edges(ringEdge(8, 140))[0], pitch: 4, length: 90, cosmetic: true });
    const ch = b.sketch(planeRef(b, 'front', 15), (k) => point(k, 0, -10), 'Handle hole');
    b.add('hole', { sketch: ch.id, diameter: 10, through: true });
    return b.part;
  })();
  const handle = (() => {
    const b = builder(part(L('핸들 봉', 'Handle bar'), { material: 'stainless-304', partNo: 'VC-140' }));
    revolveBody(b, [[0, 0], [8, 0], [8, 12], [5, 12], [5, 148], [8, 148], [8, 160], [0, 160]], 'Bar');
    b.add('fillet', { radius: 2, edges: b.edges((e) => ringEdge(8, 0)(e) || ringEdge(8, 160)(e)) });
    return b.part;
  })();
  project.parts.push(body, jaw, plate, screw, handle);
  const asm = createAssembly(L('기계 바이스', 'Machine vice'), { partNo: 'VC-000', description: L('조 폭 90', 'Jaw width 90') });
  project.assemblies.push(asm);
  const P = { body: picker(body), jaw: picker(jaw), plate: picker(plate), screw: picker(screw), handle: picker(handle) };
  const cBody = component(asm, body, [0, 0, 0], quatIdentity(), true);
  const cJaw = component(asm, jaw, [10, 0, 0]);
  addMate(asm, 'coincident', P.body(cBody, PL([0, 1, 0], 40)), P.jaw(cJaw, PL([0, -1, 0], -40)));
  addMate(asm, 'width', P.body(cBody, PL([0, 0, 1], 20)), P.body(cBody, PL([0, 0, -1], 20)), { c: P.jaw(cJaw, PL([0, 0, -1], -20)), d: P.jaw(cJaw, PL([0, 0, 1], -20)) });
  const cScrew = component(asm, screw, [-110, 60, 0], RZ(-90));
  const screwAxis = P.screw(cScrew, CY(8));
  addMate(asm, 'concentric', P.body(cBody, CY(8, at(1, 60))), screwAxis);
  addMate(asm, 'coincident', P.body(cBody, PL([-1, 0, 0], 110, (f) => f.center[1] > 14)), P.screw(cScrew, PL([0, 1, 0], 0)));
  mech(asm, 'screw', screwAxis, P.jaw(cJaw, CY(8)), { pitch: 4 });
  const cPm = component(asm, plate, [35, 65, 0]);
  addMate(asm, 'coincident', P.jaw(cJaw, PL([1, 0, 0], 25, (f) => f.center[1] > 50)), P.plate(cPm, PL([-1, 0, 0], 0)));
  for (const z of [25, -25]) addMate(asm, 'concentric', P.jaw(cJaw, CY(2.5, at(2, z))), P.plate(cPm, CY(3.3, at(2, z))));
  const cPf = component(asm, plate, [70, 65, 0], RY(180));
  addMate(asm, 'coincident', P.body(cBody, PL([-1, 0, 0], -70, (f) => f.center[1] > 40)), P.plate(cPf, PL([-1, 0, 0], 0)));
  for (const z of [25, -25]) addMate(asm, 'concentric', P.body(cBody, CY(2.5, at(2, z))), P.plate(cPf, CY(3.3, at(2, -z))));
  const cBar = component(asm, handle, [-120, 60, -50], RX(90));
  addMate(asm, 'concentric', P.screw(cScrew, (f) => isCylinder(f.type) && near(f.center[1], -10, 0.5)), P.handle(cBar, CY(5)));
  addMate(asm, 'limitDistance', P.handle(cBar, PL([0, 1, 0], 12)), P.screw(cScrew, CY(15)), { min: 15, max: 135 });
  settle(project, asm);
  // The jaw opens and closes: the screw turns one turn each way (4 mm of travel).
  asm.motion = { duration: 8, motors: [{ id: 'motor-1', kind: 'rotary', comp: cScrew.id, ref: screwAxis, speed: 15, amplitude: 360, period: 8 }] };
  asm.explode = {
    on: false,
    steps: [
      { id: 'explode-1', comps: [cBar.id], dir: [0, 1, 0], distance: 60 },
      { id: 'explode-2', comps: [cScrew.id, cBar.id], dir: [-1, 0, 0], distance: 170 },
      { id: 'explode-3', comps: [cPm.id], dir: [0, 1, 0], distance: 70 },
      { id: 'explode-4', comps: [cJaw.id, cPm.id], dir: [0, 1, 0], distance: 90 },
      { id: 'explode-5', comps: [cPf.id], dir: [1, 0, 0], distance: 60 },
    ],
  };
  return { project, asm };
}

// ───────────────────────── 4. rack-and-pinion steering

const crossV3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function rackSteeringModel(L) {
  const project = newProject(L('랙 앤 피니언 조향 장치', 'Rack-and-pinion steering'));
  const m = 2; const p = Math.PI * m;
  const housing = (() => {
    const b = builder(part(L('랙 하우징', 'Rack housing'), { material: 'al-6061', partNo: 'ST-100' }));
    const t = b.sketch('right', (k) => { circle(k, 0, 0, 36); circle(k, 0, 0, 24); }, 'Tube');
    b.add('extrude', { sketch: t.id, end: 'midplane', depth: 280 });
    const tw = b.sketch('top', (k) => centreRect(k, 50, 40), 'Pinion tower');
    b.add('extrude', { sketch: tw.id, depth: 48 });
    b.add('chamfer', { distance: 2, edges: b.edges((e) => e.type === 'LINE' && near(e.mid[1], 48)) });
    const rb = b.sketch('right', (k) => circle(k, 0, 0, 24), 'Rack bore');
    b.add('extrude', { sketch: rb.id, op: 'cut', end: 'throughBoth' });
    const cav = b.sketch('front', (k) => circle(k, 0, 22, 38), 'Pinion cavity');
    b.add('extrude', { sketch: cav.id, op: 'cut', end: 'midplane', depth: 18 });
    const pb = b.sketch('front', (k) => circle(k, 0, 22, 12), 'Pinion bore');
    b.add('extrude', { sketch: pb.id, op: 'cut', end: 'throughBoth' });
    const lug = b.sketch('front', (k) => addRectangle(k, 105, -34, 135, -12), 'Mount lug');
    const lugEx = b.add('extrude', { sketch: lug.id, end: 'midplane', depth: 50 });
    const lh = b.sketch(b.plane('top', -12), (k) => { point(k, 120, 15); point(k, 120, -15); }, 'Lug holes');
    const lugHole = b.add('hole', { sketch: lh.id, diameter: 9, through: true });
    b.add('mirror', { seeds: [lugEx.id, lugHole.id], plane: { kind: 'std', name: 'right' } });
    return b.part;
  })();
  const rack = (() => {
    const b = builder(part(L('랙 바', 'Rack bar'), { material: 'steel-4340', partNo: 'ST-110', description: `m=${m}` }));
    const s = b.sketch('right', (k) => circle(k, 0, 0, 24), 'Bar');
    b.add('extrude', { sketch: s.id, end: 'midplane', depth: 360 });
    b.add('chamfer', { distance: 1.5, edges: b.edges((e) => e.type === 'CIRCLE' && near(Math.abs(e.mid[0]), 180)) });
    const fl = b.sketch('front', (k) => addRectangle(k, -72, 10, 72, 20), 'Tooth flat');
    b.add('extrude', { sketch: fl.id, op: 'cut', end: 'throughBoth' });
    // Rack teeth: one gap (pitch line y 8, root 5.5, tips 10) and a linear sketch pattern of it: one cut.
    const g = b.sketch('front', (k) => {
      const before = k.entities.length;
      const x0 = -10 * p;
      poly(k, [[x0 - 0.25 * p, 5.5], [x0 + 0.25 * p, 5.5], [x0 + 0.43 * p, 11.5], [x0 - 0.43 * p, 11.5]]);
      linearSketchPattern(k, k.entities.slice(before).map((e) => e.id), { dx: p, dy: 0, count: 21 });
    }, 'Rack teeth');
    b.add('extrude', { sketch: g.id, op: 'cut', end: 'throughBoth' });
    const h1 = b.sketch(planeRef(b, 'right', 180), (k) => point(k, 0, 0), 'Tie-rod thread R');
    b.add('hole', { sketch: h1.id, diameter: 12, depth: 25, through: false });
    const h2 = b.sketch(planeRef(b, 'right', -180, true), (k) => point(k, 0, 0), 'Tie-rod thread L');
    b.add('hole', { sketch: h2.id, diameter: 12, depth: 25, through: false });
    return b.part;
  })();
  const pinion = (() => {
    const b = builder(part(L('피니언 (14잇)', 'Pinion (14 T)'), { material: 'steel-4340', partNo: 'ST-120', description: `z=14 m=${m}` }));
    revolveBody(b, shaftProfile([[-20, 20, 12], [20, 24, 20], [24, 60, 12]]), 'Pinion shaft');
    b.add('chamfer', { distance: 0.8, edges: b.edges((e) => ringEdge(6, -20)(e) || ringEdge(6, 60)(e)) });
    const fl = b.sketch(planeRef(b, 'right', 6), (k) => addRectangle(k, -8, 38, 8, 62), 'Steering flat');
    b.add('extrude', { sketch: fl.id, op: 'cut', depth: 1.5 });
    const t = b.sketch(b.plane('top', -8), (k) => toothOutline(k, { z: 14, m }), 'Pinion teeth');
    b.add('extrude', { sketch: t.id, depth: 16 });
    return b.part;
  })();
  const tieRod = (() => {
    const b = builder(part(L('타이 로드', 'Tie rod'), { material: 'steel-1020', partNo: 'ST-130' }));
    revolveBody(b, [[0, 0], [6, 0], [6, 25], [8, 25], [8, 182], [0, 182]], 'Rod');
    const hx = b.sketch(b.plane('top', 25), (k) => addPolygon(k, 0, 0, 22 / Math.sqrt(3), 6, 0), 'Lock nut');
    b.add('extrude', { sketch: hx.id, depth: 8 });
    const eye = b.sketch('front', (k) => circle(k, 0, 192, 26), 'Ball joint eye');
    b.add('extrude', { sketch: eye.id, end: 'midplane', depth: 14 });
    const eh = b.sketch('front', (k) => circle(k, 0, 192, 10), 'Eye hole');
    b.add('extrude', { sketch: eh.id, op: 'cut', end: 'throughBoth' });
    b.add('chamfer', { distance: 0.6, edges: b.edges((e) => e.type === 'LINE' && (near(e.mid[1], 25) || near(e.mid[1], 33)) && Math.abs(e.dir[1]) < 0.01) });
    return b.part;
  })();
  project.parts.push(housing, rack, pinion, tieRod);
  const asm = createAssembly(L('랙 앤 피니언 조향 장치', 'Rack-and-pinion steering'), { partNo: 'ST-000' });
  project.assemblies.push(asm);
  const P = { housing: picker(housing), rack: picker(rack), pinion: picker(pinion), tie: picker(tieRod) };
  const cH = component(asm, housing, [0, 0, 0], quatIdentity(), true);
  const cR = component(asm, rack, [0, 0, 0]);
  const rackAxis = P.rack(cR, CY(12));
  addMate(asm, 'concentric', P.housing(cH, CY(12)), rackAxis);
  addMate(asm, 'parallel', P.housing(cH, PL([0, 1, 0], 48)), P.rack(cR, PL([0, 1, 0], 10)));
  const cP = component(asm, pinion, [0, 22, 0], qmul(RZ(-90), RX(90)));
  const pinAxis = P.pinion(cP, CY(6, (f) => f.center[1] < 0));
  addMate(asm, 'concentric', P.housing(cH, CY(6)), pinAxis);
  addMate(asm, 'coincident', P.housing(cH, PL([0, 0, 1], 20)), P.pinion(cP, PL([0, -1, 0], -20)));
  // Rack travel = pitch radius × pinion angle; the sign from the refs' directions (contact under the pinion).
  const sigma = dot3(crossV3(worldDir(asm, pinAxis), [0, -1, 0]), worldDir(asm, rackAxis));
  mech(asm, 'rackPinion', pinAxis, rackAxis, { radius: 14, reverse: sigma < 0 });
  const ties = [[155, RZ(-90)], [-155, RZ(90)]].map(([x, rot]) => {
    const s = Math.sign(x);
    const c = component(asm, tieRod, [x, 0, 0], rot);
    addMate(asm, 'concentric', P.rack(cR, CY(6, at(0, s * 167.5, 15))), P.tie(c, CY(6)));
    addMate(asm, 'coincident', P.rack(cR, PL([s, 0, 0], 180)), P.tie(c, PL([0, -1, 0], -25)));
    mech(asm, 'lock', { comp: cR.id }, { comp: c.id });
    return c;
  });
  settle(project, asm);
  asm.motion = { duration: 2.5, motors: [{ id: 'motor-1', kind: 'rotary', comp: cP.id, ref: pinAxis, speed: 10 }] };
  asm.explode = {
    on: false,
    steps: [
      { id: 'explode-1', comps: [cP.id], dir: [0, 0, 1], distance: 90 },
      { id: 'explode-2', comps: [ties[0].id], dir: [1, 0, 0], distance: 80 },
      { id: 'explode-3', comps: [ties[1].id], dir: [-1, 0, 0], distance: 80 },
      { id: 'explode-4', comps: [cR.id, ...ties.map((c) => c.id)], dir: [0, -1, 0], distance: 80 },
    ],
  };
  return { project, asm };
}

// ───────────────────────── 5. slider-crank

function sliderCrankModel(L) {
  const project = newProject(L('슬라이더 크랭크 기구', 'Slider-crank mechanism'));
  const frame = (() => {
    const b = builder(part(L('크랭크 프레임', 'Crank frame'), { material: 'al-6061', partNo: 'SC-100' }));
    const base = b.sketch(b.plane('top', -80), (k) => addRectangle(k, -70, -40, 70, 100), 'Base');
    b.add('extrude', { sketch: base.id, depth: 12 });
    const wall = b.sketch(b.plane('front', -40), (k) => addRectangle(k, -50, -68, 50, 165), 'Wall');
    b.add('extrude', { sketch: wall.id, depth: 12 });
    const boss = b.sketch(b.plane('front', -28), (k) => circle(k, 0, 0, 44), 'Bearing boss');
    b.add('extrude', { sketch: boss.id, depth: 10 });
    const hole = b.sketch('front', (k) => circle(k, 0, 0, 20), 'Crank bearing');
    b.add('extrude', { sketch: hole.id, op: 'cut', end: 'throughBoth' });
    const tube = b.sketch(b.plane('top', 70), (k) => circle(k, 0, 3, 60), 'Cylinder');
    b.add('extrude', { sketch: tube.id, depth: 90 });
    const fin = b.sketch(b.plane('top', 100), (k) => { circle(k, 0, 3, 78); circle(k, 0, 3, 60); }, 'Cooling fin');
    const finEx = b.add('extrude', { sketch: fin.id, depth: 3 });
    b.add('linearPattern', { seeds: [finEx.id], direction: { kind: 'axis', axis: 'y' }, spacing: 12, count: 4 });
    const bore = b.sketch(b.plane('top', 160), (k) => circle(k, 0, 3, 40), 'Bore');
    b.add('extrude', { sketch: bore.id, op: 'cut', depth: 90 });
    const head = b.sketch(b.plane('top', 160), (k) => addRectangle(k, -38, -35, 38, 41), 'Cylinder head');
    b.add('extrude', { sketch: head.id, depth: 8 });
    const hb = b.sketch(b.plane('top', 168), (k) => { for (const x of [-30, 30]) for (const y of [-27, 33]) point(k, x, y); }, 'Head bolts');
    b.add('hole', { sketch: hb.id, kind: 'counterbore', diameter: 6.6, cbDiameter: 11, cbDepth: 3, depth: 8, through: false });
    const rib = b.sketch('right', (k) => addLine(k, 40, -20, 85, -68), 'Rib');
    b.add('rib', { sketch: rib.id, thickness: 10 });
    const mh = b.sketch(b.plane('top', -68), (k) => { for (const x of [-55, 55]) for (const y of [25, 85]) point(k, x, y); }, 'Mount holes');
    b.add('hole', { sketch: mh.id, diameter: 9, through: true });
    return b.part;
  })();
  const crank = (() => {
    const b = builder(part(L('크랭크', 'Crank'), { material: 'steel-4340', partNo: 'SC-110', description: L('행정 60', 'Stroke 60') }));
    const d = b.sketch('front', (k) => circle(k, 0, 0, 80), 'Disc');
    b.add('extrude', { sketch: d.id, depth: 10 });
    const sh = b.sketch('front', (k) => circle(k, 0, 0, 20), 'Shaft');
    b.add('extrude', { sketch: sh.id, depth: 35, reverse: true });
    const pin = b.sketch(b.plane('front', 10), (k) => circle(k, 0, 30, 12), 'Crank pin');
    b.add('extrude', { sketch: pin.id, depth: 16 });
    const lw = b.sketch('front', (k) => { circle(k, -20, -16, 14); circle(k, 20, -16, 14); }, 'Balance holes');
    b.add('extrude', { sketch: lw.id, op: 'cut', end: 'throughBoth' });
    b.add('chamfer', { distance: 1, edges: b.edges((e) => e.type === 'CIRCLE' && near(Math.hypot(e.mid[0], e.mid[1]), 40, 0.02) && near(e.mid[2], 10)) });
    b.add('chamfer', { distance: 0.8, edges: b.edges((e) => e.type === 'CIRCLE' && near(e.mid[2], -35)) });
    return b.part;
  })();
  const rod = (() => {
    const b = builder(part(L('커넥팅 로드', 'Connecting rod'), { material: 'al-7075', partNo: 'SC-120', description: L('중심 거리 100', 'Centres 100') }));
    const sh = b.sketch('front', (k) => poly(k, [[-9, 0], [9, 0], [6, 100], [-6, 100]]), 'Shank');
    b.add('extrude', { sketch: sh.id, depth: 10 });
    const eyes = b.sketch('front', (k) => { circle(k, 0, 0, 36); circle(k, 0, 100, 24); }, 'Eyes');
    b.add('extrude', { sketch: eyes.id, depth: 10 });
    const holes = b.sketch('front', (k) => { circle(k, 0, 0, 12); circle(k, 0, 100, 10); }, 'Bores');
    b.add('extrude', { sketch: holes.id, op: 'cut', end: 'throughBoth' });
    const pk = b.sketch(b.plane('front', 10), (k) => addSlot(k, 0, 26, 0, 76, 3), 'Web pocket');
    const pocket = b.add('extrude', { sketch: pk.id, op: 'cut', depth: 3 });
    b.add('mirror', { seeds: [pocket.id], plane: b.plane('front', 5) });
    return b.part;
  })();
  const piston = (() => {
    const b = builder(part(L('피스톤', 'Piston'), { material: 'al-6061', partNo: 'SC-130', description: 'Ø40' }));
    revolveBody(b, [[0, 0], [20, 0], [20, 38], [19, 40], [0, 40]], 'Piston');
    const rg = b.sketch('front', (k) => { addRectangle(k, 18.5, 30, 21, 31.5); addRectangle(k, 18.5, 25, 21, 26.5); addLine(k, 0, -5, 0, 45, { construction: true }); }, 'Ring grooves');
    b.add('revolve', { sketch: rg.id, op: 'cut' });
    const sl = b.sketch('right', (k) => addRectangle(k, -6, -1, 6, 28), 'Rod slot');
    b.add('extrude', { sketch: sl.id, op: 'cut', end: 'throughBoth' });
    const ph = b.sketch('front', (k) => circle(k, 0, 12, 10), 'Pin bore');
    b.add('extrude', { sketch: ph.id, op: 'cut', end: 'throughBoth' });
    return b.part;
  })();
  const pin = (() => {
    const b = builder(part(L('피스톤 핀', 'Piston pin'), { material: 'steel-4340', partNo: 'SC-140' }));
    revolveBody(b, [[0, 0], [5, 0], [5, 36], [0, 36]], 'Pin');
    b.add('chamfer', { distance: 0.5, edges: b.edges((e) => e.type === 'CIRCLE') });
    return b.part;
  })();
  project.parts.push(frame, crank, rod, piston, pin);
  const asm = createAssembly(L('슬라이더 크랭크 기구', 'Slider-crank mechanism'), { partNo: 'SC-000' });
  project.assemblies.push(asm);
  const P = { frame: picker(frame), crank: picker(crank), rod: picker(rod), piston: picker(piston), pin: picker(pin) };
  // Crank at 40° from top dead centre: pin, wrist-pin height and rod angle from the crank radius and rod length.
  const theta = 40; const R = 30; const Lr = 100;
  const pinX = R * Math.sin((theta * Math.PI) / 180); const pinY = R * Math.cos((theta * Math.PI) / 180);
  const yp = pinY + Math.sqrt(Lr * Lr - pinX * pinX);
  const beta = (Math.asin(pinX / Lr) * 180) / Math.PI;
  const cF = component(asm, frame, [0, 0, 0], quatIdentity(), true);
  const cC = component(asm, crank, [0, 0, -18], RZ(-theta));
  const crankAxis = P.crank(cC, CY(10));
  addMate(asm, 'hinge', P.frame(cF, CY(10)), crankAxis, { c: P.frame(cF, PL([0, 0, 1], -18)), d: P.crank(cC, PL([0, 0, -1], 0)) });
  const cR = component(asm, rod, [pinX, pinY, -8], RZ(beta));
  addMate(asm, 'hinge', P.crank(cC, CY(6)), P.rod(cR, CY(6)), { c: P.crank(cC, PL([0, 0, 1], 10)), d: P.rod(cR, PL([0, 0, -1], 0)) });
  const cPs = component(asm, piston, [0, yp - 12, -3]);
  addMate(asm, 'concentric', P.frame(cF, CY(20)), P.piston(cPs, CY(20)));
  const cPin = component(asm, pin, [0, yp, -21], RX(90));
  addMate(asm, 'concentric', P.piston(cPs, CY(5)), P.pin(cPin, CY(5)));
  mech(asm, 'lock', { comp: cPs.id }, { comp: cPin.id });
  addMate(asm, 'concentric', P.pin(cPin, CY(5)), P.rod(cR, CY(5)));
  settle(project, asm);
  asm.motion = { duration: 4, motors: [{ id: 'motor-1', kind: 'rotary', comp: cC.id, ref: crankAxis, speed: 30 }] };
  asm.explode = {
    on: false,
    steps: [
      { id: 'explode-1', comps: [cPs.id, cPin.id], dir: [0, 1, 0], distance: 90 },
      { id: 'explode-2', comps: [cPin.id], dir: [0, 0, 1], distance: 60 },
      { id: 'explode-3', comps: [cR.id], dir: [0, 0, 1], distance: 45 },
      { id: 'explode-4', comps: [cC.id], dir: [0, 0, 1], distance: 90 },
    ],
  };
  return { project, asm };
}

// ───────────────────────── 6. cam and follower (cam mate)

/** Points (part frame) around the outer outline of a part's planar face, sampled edge by edge in order. */
export function faceOutline(part, test, perEdge = 16) {
  const body = regenerate(part).body;
  const face = body.faces.find((f) => test(faceSignature(f)));
  if (!face) throw new Error(`sample: cam face not found in ${part.name}`);
  const v = (q) => [q.x, q.y, q.z];
  const segs = face.outerWire().edges.map((e) => {
    const n = e.geomType === 'LINE' ? 1 : perEdge;
    return Array.from({ length: n + 1 }, (_, i) => v(e.pointAt(i / n)));
  });
  // Chain the edges end to start (an edge may run either way).
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const out = [...segs.shift()];
  while (segs.length) {
    const end = out.at(-1);
    let best = 0; let flip = false; let bd = Infinity;
    segs.forEach((s, i) => { const a = d(end, s[0]); const b = d(end, s.at(-1)); if (a < bd) { bd = a; best = i; flip = false; } if (b < bd) { bd = b; best = i; flip = true; } });
    const s = segs.splice(best, 1)[0];
    out.push(...(flip ? s.reverse() : s).slice(1));
  }
  if (d(out[0], out.at(-1)) < 1e-6) out.pop();
  return out.map((q) => q.map((x) => Math.round(x * 1e4) / 1e4));
}

/** A pear cam outline: base circle R about the origin, nose circle r at (0, e), joined by tangent lines. */
function pearCam(k, R, r, e) {
  const a = Math.asin((R - r) / e);
  const big = addArc(k, 0, 0, R, Math.PI - a, 2 * Math.PI + a);
  const l1 = addLine(k, 0, 0, r * Math.cos(a), e + r * Math.sin(a), { from: big.p2 });
  const nose = addArc(k, 0, e, r, a, Math.PI - a, { from: l1.p2 });
  addLine(k, 0, 0, 0, 0, { from: nose.p2, to: big.p1 });
}

function camFollowerModel(L) {
  const project = newProject(L('캠과 종동절', 'Cam and follower'));
  const frame = (() => {
    const b = builder(part(L('캠 프레임', 'Cam frame'), { material: 'al-6061', partNo: 'CF-100' }));
    const base = b.sketch(b.plane('top', -60), (k) => addRectangle(k, -60, -50, 60, 70), 'Base');
    b.add('extrude', { sketch: base.id, depth: 12 });
    b.add('fillet', { radius: 8, edges: b.edges((e) => Math.abs(e.dir[1]) > 0.99 && near(Math.abs(e.mid[0]), 60)) });
    const wall = b.sketch(b.plane('front', -40), (k) => addRectangle(k, -50, -48, 50, 130), 'Back plate');
    b.add('extrude', { sketch: wall.id, depth: 12 });
    const hole = b.sketch('front', (k) => circle(k, 0, 0, 20), 'Shaft bearing');
    b.add('extrude', { sketch: hole.id, op: 'cut', end: 'throughBoth' });
    const guide = b.sketch(b.plane('top', 80), (k) => addRectangle(k, -20, -14, 20, 28), 'Follower guide');
    b.add('extrude', { sketch: guide.id, depth: 30 });
    const gb = b.sketch(b.plane('top', 110), (k) => point(k, 0, 0), 'Guide bore');
    b.add('hole', { sketch: gb.id, diameter: 16, depth: 30, through: false });
    const gus = b.sketch(b.plane('right', 13), (k) => poly(k, [[28, 80], [28, 52], [8, 80]]), 'Gusset');
    const gusEx = b.add('extrude', { sketch: gus.id, depth: 6 });
    b.add('mirror', { seeds: [gusEx.id], plane: { kind: 'std', name: 'right' } });
    const mh = b.sketch(b.plane('top', -48), (k) => { for (const x of [-45, 45]) for (const y of [-35, 55]) point(k, x, y); }, 'Mount holes');
    b.add('hole', { sketch: mh.id, kind: 'counterbore', diameter: 9, cbDiameter: 15, cbDepth: 4, through: true });
    b.add('chamfer', { distance: 1.5, edges: b.edges((e) => e.type === 'LINE' && near(e.mid[1], 110) && Math.abs(e.dir[1]) < 0.01 && e.mid[2] > -27) });
    return b.part;
  })();
  const cam = (() => {
    const b = builder(part(L('배 모양 캠', 'Pear cam'), { material: 'steel-4340', partNo: 'CF-110', description: L('양정 16', 'Lift 16') }));
    const s = b.sketch('front', (k) => { pearCam(k, 30, 12, 34); circle(k, 0, 0, 20); }, 'Cam profile');
    b.add('extrude', { sketch: s.id, depth: 16 });
    const hub = b.sketch('front', (k) => { circle(k, 0, 0, 32); circle(k, 0, 0, 20); }, 'Hub');
    b.add('extrude', { sketch: hub.id, depth: 20, reverse: true });
    const ss = b.sketch(b.plane('top', 16), (k) => point(k, 0, 10), 'Set screw');
    b.add('hole', { sketch: ss.id, diameter: 5, depth: 8, through: false });
    b.add('chamfer', { distance: 1, edges: b.edges((e) => e.type === 'CIRCLE' && near(e.mid[2], -20) && near(Math.hypot(e.mid[0], e.mid[1]), 16, 0.05)) });
    return b.part;
  })();
  const shaft = (() => {
    const b = builder(part(L('캠축', 'Camshaft'), { material: 'steel-4340', partNo: 'CF-120' }));
    revolveBody(b, shaftProfile([[0, 2, 20], [2, 8, 28], [8, 75, 20]]), 'Shaft profile');
    b.add('chamfer', { distance: 1, edges: b.edges((e) => ringEdge(10, 0)(e) || ringEdge(10, 75)(e)) });
    const kw = b.sketch(b.plane('right', 10), (k) => addSlot(k, 0, 30, 0, 60, 2.5), 'Keyway');
    b.add('extrude', { sketch: kw.id, op: 'cut', depth: 3 });
    return b.part;
  })();
  const follower = (() => {
    const b = builder(part(L('평면 종동절', 'Flat-faced follower'), { material: 'steel-4340', partNo: 'CF-130' }));
    const foot = b.sketch('top', (k) => centreRect(k, 70, 20), 'Foot');
    b.add('extrude', { sketch: foot.id, depth: 6 });
    b.add('fillet', { radius: 4, edges: b.edges((e) => Math.abs(e.dir[1]) > 0.99) });
    const rod = b.sketch(b.plane('top', 6), (k) => circle(k, 0, 0, 16), 'Stem');
    b.add('extrude', { sketch: rod.id, depth: 120 });
    const col = b.sketch(b.plane('top', 18), (k) => circle(k, 0, 0, 28), 'Spring seat');
    b.add('extrude', { sketch: col.id, depth: 4 });
    const kn = b.sketch(b.plane('top', 126), (k) => circle(k, 0, 0, 22), 'Knob');
    b.add('extrude', { sketch: kn.id, depth: 8 });
    b.add('fillet', { radius: 3, edges: b.edges(ringEdge(11, 134)) });
    return b.part;
  })();
  project.parts.push(frame, cam, shaft, follower);
  const asm = createAssembly(L('캠과 종동절', 'Cam and follower'), { partNo: 'CF-000' });
  project.assemblies.push(asm);
  const P = { frame: picker(frame), cam: picker(cam), shaft: picker(shaft), fol: picker(follower) };
  const cF = component(asm, frame, [0, 0, 0], quatIdentity(), true);
  const cC = component(asm, cam, [0, 0, -8]);
  addMate(asm, 'concentric', P.frame(cF, CY(10)), P.cam(cC, CY(10)));
  addMate(asm, 'coincident', P.frame(cF, PL([0, 0, 1], -28)), P.cam(cC, PL([0, 0, -1], 20)));
  const cS = component(asm, shaft, [0, 0, -50], RX(90));
  const shaftAxis = P.shaft(cS, CY(10, (f) => f.center[1] > 20));
  addMate(asm, 'concentric', P.cam(cC, CY(10)), shaftAxis);
  mech(asm, 'lock', { comp: cC.id }, { comp: cS.id });
  const cFo = component(asm, follower, [0, 34 + 12, 0]);
  addMate(asm, 'concentric', P.frame(cF, CY(8)), P.fol(cFo, CY(8)));
  addMate(asm, 'parallel', P.frame(cF, PL([0, 0, 1], -28)), P.fol(cFo, PL([0, 0, 1], 10)));
  // Cam mate: the cam's front face (its outline is the profile) and the follower's flat foot.
  addMate(asm, 'cam', P.cam(cC, PL([0, 0, 1], 16)), P.fol(cFo, PL([0, -1, 0], 0)), { profile: faceOutline(cam, PL([0, 0, 1], 16)) });
  settle(project, asm);
  asm.motion = { duration: 6, motors: [{ id: 'motor-1', kind: 'rotary', comp: cS.id, ref: shaftAxis, speed: 20 }] };
  asm.explode = {
    on: false,
    steps: [
      { id: 'explode-1', comps: [cFo.id], dir: [0, 1, 0], distance: 120 },
      { id: 'explode-2', comps: [cC.id], dir: [0, 0, 1], distance: 60 },
      { id: 'explode-3', comps: [cS.id], dir: [0, 0, -1], distance: 70 },
    ],
  };
  return { project, asm };
}

// ───────────────────────── 7. door on two butt hinges (hinge and limit-angle mates)

function hingeLeaf(L, side) {
  const a = side === 'a';
  const b = builder(part(a ? L('경첩 날개 (고정)', 'Hinge leaf (fixed)') : L('경첩 날개 (문)', 'Hinge leaf (door)'), { material: 'brass', partNo: a ? 'DH-110' : 'DH-120' }));
  const s = a ? -1 : 1;
  // Plate beside the knuckles, notched where the other leaf's knuckles turn.
  const plate = a
    ? [[-40, 0], [-3, 0], [-3, 20], [-4.5, 20], [-4.5, 40], [-3, 40], [-3, 60], [-40, 60]]
    : [[4.5, 0], [40, 0], [40, 60], [4.5, 60], [4.5, 40], [3, 40], [3, 20], [4.5, 20]];
  const ps = b.sketch('front', (k) => poly(k, plate), 'Leaf');
  b.add('extrude', { sketch: ps.id, end: 'midplane', depth: 3 });
  for (const y0 of a ? [0, 40] : [20]) {
    const kn = b.sketch(y0 ? b.plane('top', y0) : 'top', (k) => { circle(k, 0, 0, 8); circle(k, 0, 0, 4); }, 'Knuckle');
    b.add('extrude', { sketch: kn.id, depth: 20 });
  }
  const hs = b.sketch(b.plane('front', 1.5), (k) => { point(k, s * 25, 12); point(k, s * 25, 48); }, 'Screw holes');
  b.add('hole', { sketch: hs.id, kind: 'countersink', diameter: 4.5, csDiameter: 8, through: true });
  b.add('fillet', { radius: 3, edges: b.edges((e) => Math.abs(e.dir[2]) > 0.99 && near(e.mid[0], s * 40)) });
  return b.part;
}

function doorHingeModel(L) {
  const project = newProject(L('경첩 문', 'Hinged door'));
  const post = (() => {
    const b = builder(part(L('문틀 기둥', 'Door post'), { material: 'oak', partNo: 'DH-100' }));
    const s = b.sketch('top', (k) => addRectangle(k, -50, 1.5, -5, 41.5), 'Post');
    b.add('extrude', { sketch: s.id, depth: 640 });
    const ft = b.sketch('top', (k) => addRectangle(k, -90, -10, -5, 70), 'Foot');
    b.add('extrude', { sketch: ft.id, depth: 12 });
    b.add('chamfer', { distance: 2, edges: b.edges((e) => Math.abs(e.dir[1]) > 0.99 && e.mid[1] > 12 && near(e.mid[0], -50)) });
    const hs = b.sketch(b.plane('front', -1.5), (k) => { for (const y of [112, 148, 492, 528]) point(k, -25, y); }, 'Pilot holes');
    b.add('hole', { sketch: hs.id, diameter: 4, depth: 20, through: false });
    return b.part;
  })();
  const door = (() => {
    const b = builder(part(L('문짝', 'Door leaf'), { material: 'oak', partNo: 'DH-200', description: '400×600×20' }));
    const s = b.sketch(b.plane('front', -21.5), (k) => addRectangle(k, 5, 20, 405, 620), 'Panel');
    b.add('extrude', { sketch: s.id, depth: 20 });
    const rp = b.sketch(b.plane('front', -1.5), (k) => addRectangle(k, 50, 70, 360, 570), 'Raised panel');
    b.add('extrude', { sketch: rp.id, depth: 4 });
    b.add('fillet', { radius: 10, edges: b.edges((e) => Math.abs(e.dir[2]) > 0.99 && e.mid[2] > -1.5 && e.mid[2] < 2.6) });
    b.add('chamfer', { distance: 1.5, edges: b.edges((e) => e.type === 'LINE' && near(e.mid[2], 2.5)) });
    const hs = b.sketch(b.plane('front', -1.5), (k) => { for (const y of [112, 148, 492, 528]) point(k, 25, y); }, 'Pilot holes');
    b.add('hole', { sketch: hs.id, diameter: 4, depth: 15, through: false });
    const kh = b.sketch(b.plane('front', -1.5), (k) => point(k, 385, 320), 'Knob hole');
    b.add('hole', { sketch: kh.id, diameter: 6, through: true });
    return b.part;
  })();
  const leafA = hingeLeaf(L, 'a');
  const leafB = hingeLeaf(L, 'b');
  const pin = (() => {
    const b = builder(part(L('경첩 핀', 'Hinge pin'), { material: 'steel-1020', partNo: 'DH-130' }));
    revolveBody(b, [[0, 0], [2, 0], [2, 60], [3.5, 60], [3.5, 62], [0, 62]], 'Pin');
    b.add('fillet', { radius: 0.8, edges: b.edges(ringEdge(3.5, 62)) });
    return b.part;
  })();
  const knob = (() => {
    const b = builder(part(L('손잡이', 'Knob'), { material: 'brass', partNo: 'DH-140' }));
    revolveBody(b, [[0, -15], [3, -15], [3, 0], [9, 0], [9, 3], [5, 8], [5, 20], [15, 24], [15, 32], [0, 34]], 'Knob');
    b.add('fillet', { radius: 2, edges: b.edges(ringEdge(15, 32)) });
    return b.part;
  })();
  project.parts.push(post, door, leafA, leafB, pin, knob);
  const asm = createAssembly(L('경첩 문', 'Hinged door'), { partNo: 'DH-000' });
  project.assemblies.push(asm);
  const P = { post: picker(post), door: picker(door), a: picker(leafA), b: picker(leafB), pin: picker(pin), knob: picker(knob) };
  const open = -30;
  const cPost = component(asm, post, [0, 0, 0], quatIdentity(), true);
  const cDoor = component(asm, door, [0, 0, 0], RY(open));
  const leaves = [];
  for (const y0 of [100, 480]) {
    const cA = component(asm, leafA, [0, y0, 0]);
    addMate(asm, 'coincident', P.post(cPost, PL([0, 0, 1], -1.5)), P.a(cA, PL([0, 0, -1], 1.5)));
    addMate(asm, 'concentric', P.post(cPost, CY(2, at(1, y0 + 12, 12))), P.a(cA, CY(2.25, at(1, 12, 5))));
    addMate(asm, 'concentric', P.post(cPost, CY(2, at(1, y0 + 48, 12))), P.a(cA, CY(2.25, at(1, 48, 5))));
    const cB = component(asm, leafB, [0, y0, 0], RY(open));
    addMate(asm, 'hinge', P.a(cA, CY(4, at(1, 10))), P.b(cB, CY(4)), { c: P.a(cA, PL([0, 1, 0], 20)), d: P.b(cB, PL([0, -1, 0], -20)) });
    addMate(asm, 'coincident', P.door(cDoor, PL([0, 0, 1], -1.5)), P.b(cB, PL([0, 0, -1], 1.5)));
    mech(asm, 'lock', { comp: cDoor.id }, { comp: cB.id });
    const cPin = component(asm, pin, [0, y0, 0]);
    addMate(asm, 'concentric', P.a(cA, CY(2, at(1, 10))), P.pin(cPin, CY(2)));
    addMate(asm, 'coincident', P.a(cA, PL([0, 1, 0], 60)), P.pin(cPin, PL([0, -1, 0], -60)));
    leaves.push(cA, cB, cPin);
  }
  // The door opens 0…110° from the post's face.
  addMate(asm, 'limitAngle', P.post(cPost, PL([0, 0, 1], -1.5)), P.door(cDoor, PL([0, 0, 1], -1.5)), { min: 0, max: 110 });
  const q = RY(open);
  const cKnob = component(asm, knob, rotate(q, [385, 320, -1.5]), qmul(q, RX(90)));
  addMate(asm, 'concentric', P.door(cDoor, CY(3)), P.knob(cKnob, CY(3)));
  addMate(asm, 'coincident', P.door(cDoor, PL([0, 0, 1], -1.5)), P.knob(cKnob, PL([0, -1, 0], 0)));
  settle(project, asm);
  asm.explode = {
    on: false,
    steps: [
      { id: 'explode-1', comps: leaves.filter((_, i) => i % 3 === 2).map((c) => c.id), dir: [0, 1, 0], distance: 90 },
      { id: 'explode-2', comps: [cDoor.id, cKnob.id, ...leaves.filter((_, i) => i % 3 === 1).map((c) => c.id)], dir: [1, 0, 0.6], distance: 120 },
      { id: 'explode-3', comps: [cKnob.id], dir: [0, 0, 1], distance: 60 },
    ],
  };
  return { project, asm };
}

// ───────────────────────── 8. bolted pipe flange joint

function flangeJointModel(L) {
  const project = newProject(L('플랜지 볼트 체결부', 'Bolted flange joint'));
  const flange = (() => {
    const b = builder(part(L('용접 목 플랜지 DN50', 'Weld-neck flange DN50'), { material: 'stainless-304', partNo: 'FJ-100', description: 'PN16' }));
    revolveBody(b, [[26, 0], [30, 0], [38, 32], [38, 40], [82.5, 40], [82.5, 58], [51, 58], [51, 60], [26, 60]], 'Flange profile');
    b.add('fillet', { radius: 4, edges: b.edges(ringEdge(38, 40)) });
    const hs = b.sketch(b.plane('top', 58), (k) => point(k, 62.5 * Math.SQRT1_2, 62.5 * Math.SQRT1_2), 'Bolt hole');
    const h = b.add('hole', { sketch: hs.id, diameter: 18, through: true });
    b.add('circularPattern', { seeds: [h.id], axis: { kind: 'axis', axis: 'y' }, count: 4 });
    b.add('chamfer', { distance: 1.5, edges: b.edges((e) => ringEdge(82.5, 40)(e) || ringEdge(82.5, 58)(e)) });
    b.add('chamfer', { distance: 1, edges: b.edges(ringEdge(26, 60)) });
    return b.part;
  })();
  const gasket = (() => {
    const b = builder(part(L('개스킷', 'Gasket'), { material: 'rubber', partNo: 'FJ-110' }));
    const s = b.sketch('top', (k) => { circle(k, 0, 0, 102); circle(k, 0, 0, 52); }, 'Ring');
    b.add('extrude', { sketch: s.id, depth: 3 });
    return b.part;
  })();
  const pipe = (() => {
    const b = builder(part(L('배관 60.3×4', 'Pipe 60.3×4'), { material: 'stainless-304', partNo: 'FJ-120' }));
    const s = b.sketch('top', (k) => { circle(k, 0, 0, 60); circle(k, 0, 0, 52); }, 'Tube');
    b.add('extrude', { sketch: s.id, depth: 150 });
    b.add('chamfer', { distance: 1, edges: b.edges((e) => ringEdge(30, 0)(e)) });
    return b.part;
  })();
  const bolt = hexBolt(L('육각 볼트 M16×65', 'Hex bolt M16×65'), 16, 65);
  const nut = hexNut(L('육각 너트 M16', 'Hex nut M16'), 16);
  const wash = washer(L('평와셔 M16', 'Washer M16'), 17, 30, 3);
  project.parts.push(flange, gasket, pipe, bolt, nut, wash);
  const asm = createAssembly(L('플랜지 볼트 체결부', 'Bolted flange joint'), { partNo: 'FJ-000', description: 'DN50 PN16' });
  project.assemblies.push(asm);
  const P = { flange: picker(flange), gasket: picker(gasket), pipe: picker(pipe), bolt: picker(bolt), nut: picker(nut), wash: picker(wash) };
  const cA = component(asm, flange, [0, 0, 0], quatIdentity(), true);
  const axisA = P.flange(cA, CY(26));
  const cG = component(asm, gasket, [0, 60, 0]);
  addMate(asm, 'concentric', axisA, P.gasket(cG, CY(26)));
  addMate(asm, 'coincident', P.flange(cA, PL([0, 1, 0], 60)), P.gasket(cG, PL([0, -1, 0], 0)));
  const cB = component(asm, flange, [0, 123, 0], RX(180));
  addMate(asm, 'concentric', axisA, P.flange(cB, CY(26)));
  addMate(asm, 'coincident', P.gasket(cG, PL([0, 1, 0], 3)), P.flange(cB, PL([0, 1, 0], 60)));
  const hole = (pk, c, x, z) => pk(c, CY(9, (f) => near(f.center[0], x, 1) && near(f.center[2], z, 1)));
  const h0 = 62.5 * Math.SQRT1_2;
  addMate(asm, 'concentric', hole(P.flange, cA, h0, -h0), hole(P.flange, cB, h0, h0));
  const cPa = component(asm, pipe, [0, -150, 0]);
  addMate(asm, 'concentric', axisA, P.pipe(cPa, CY(26)));
  addMate(asm, 'coincident', P.flange(cA, PL([0, -1, 0], 0)), P.pipe(cPa, PL([0, 1, 0], 150)));
  const cPb = component(asm, pipe, [0, 123, 0]);
  addMate(asm, 'concentric', axisA, P.pipe(cPb, CY(26)));
  addMate(asm, 'coincident', P.flange(cB, PL([0, -1, 0], 0)), P.pipe(cPb, PL([0, -1, 0], 0)));
  const fasteners = [];
  for (const [x, z] of [[h0, h0], [-h0, h0], [-h0, -h0], [h0, -h0]]) {
    const ha = hole(P.flange, cA, x, z);
    const cb = component(asm, bolt, [x, 83, z]);
    addMate(asm, 'concentric', ha, P.bolt(cb, CY(8, (f) => f.center[1] < -1)));
    addMate(asm, 'coincident', P.flange(cB, PL([0, -1, 0], -40)), P.bolt(cb, PL([0, -1, 0], 0)));
    const cw = component(asm, wash, [x, 37, z]);
    addMate(asm, 'concentric', ha, P.wash(cw, CY(8.5)));
    addMate(asm, 'coincident', P.flange(cA, PL([0, -1, 0], -40)), P.wash(cw, PL([0, 1, 0], 3)));
    const cn = component(asm, nut, [x, 37 - 12.8, z]);
    addMate(asm, 'concentric', ha, P.nut(cn, CY(8)));
    addMate(asm, 'coincident', P.wash(cw, PL([0, -1, 0], 0)), P.nut(cn, PL([0, 1, 0], 12.8)));
    fasteners.push(cb, cw, cn);
  }
  settle(project, asm);
  asm.explode = {
    on: false,
    steps: [
      { id: 'explode-1', comps: fasteners.filter((_, i) => i % 3 === 0).map((c) => c.id), dir: [0, 1, 0], distance: 200 },
      { id: 'explode-2', comps: fasteners.filter((_, i) => i % 3 === 2).map((c) => c.id), dir: [0, -1, 0], distance: 110 },
      { id: 'explode-3', comps: fasteners.filter((_, i) => i % 3 === 1).map((c) => c.id), dir: [0, -1, 0], distance: 70 },
      { id: 'explode-4', comps: [cB.id, cPb.id], dir: [0, 1, 0], distance: 60 },
      { id: 'explode-5', comps: [cG.id], dir: [0, 1, 0], distance: 30 },
    ],
  };
  return { project, asm };
}

// ───────────────────────── 9. planetary gear set (star configuration)

function planetaryModel(L) {
  const project = newProject(L('유성 기어 세트', 'Planetary gear set'));
  const m = 2; const zs = 12; const zp = 12; const zr = 36; const a = ((zs + zp) * m) / 2;
  const angles = [0, 120, 240];
  const carrier = (() => {
    const b = builder(part(L('캐리어 (고정)', 'Carrier (fixed)'), { material: 'steel-1020', partNo: 'PG-100' }));
    const s = b.sketch('top', (k) => centreRect(k, 130, 130), 'Plate');
    b.add('extrude', { sketch: s.id, depth: 10, reverse: true });
    b.add('fillet', { radius: 10, edges: b.edges((e) => Math.abs(e.dir[1]) > 0.99) });
    const hub = b.sketch(b.plane('top', -10), (k) => circle(k, 0, 0, 44), 'Bearing hub');
    b.add('extrude', { sketch: hub.id, depth: 20, reverse: true });
    const pins = b.sketch('top', (k) => { for (const t of angles) circle(k, a * Math.cos((t * Math.PI) / 180), a * Math.sin((t * Math.PI) / 180), 8); }, 'Planet pins');
    b.add('extrude', { sketch: pins.id, depth: 16 });
    const ch = b.sketch('top', (k) => circle(k, 0, 0, 16), 'Sun bore');
    b.add('extrude', { sketch: ch.id, op: 'cut', end: 'throughBoth' });
    const mh = b.sketch('top', (k) => { for (const x of [-52, 52]) for (const y of [-52, 52]) point(k, x, y); }, 'Mount holes');
    b.add('hole', { sketch: mh.id, kind: 'counterbore', diameter: 9, cbDiameter: 15, cbDepth: 4, through: true });
    b.add('chamfer', { distance: 0.5, edges: b.edges((e) => e.type === 'CIRCLE' && near(e.mid[1], 16)) });
    return b.part;
  })();
  const sun = (() => {
    const b = builder(part(L('선 기어 축 (12잇)', 'Sun gear shaft (12 T)'), { material: 'steel-4340', partNo: 'PG-110', description: `z=${zs} m=${m}` }));
    revolveBody(b, shaftProfile([[-50, 0, 16]]), 'Input shaft');
    b.add('chamfer', { distance: 0.8, edges: b.edges(ringEdge(8, -50)) });
    const kw = b.sketch(b.plane('right', 8), (k) => addSlot(k, 0, -45, 0, -30, 2.5), 'Keyway');
    b.add('extrude', { sketch: kw.id, op: 'cut', depth: 3 });
    const t = b.sketch('top', (k) => toothOutline(k, { z: zs, m }), 'Sun teeth');
    b.add('extrude', { sketch: t.id, depth: 16 });
    return b.part;
  })();
  const planet = spurGear(L('유성 기어 (12잇)', 'Planet gear (12 T)'), { z: zp, m, w: 16, bore: 8, hubD: 0, hubL: 0, partNo: 'PG-120', keyway: false });
  const ring = (() => {
    const b = builder(part(L('링 기어 (36잇) · 출력', 'Ring gear (36 T) · output'), { material: 'steel-4340', partNo: 'PG-130', description: `z=${zr} m=${m}` }));
    const s = b.sketch('top', (k) => {
      circle(k, 0, 0, 100);
      toothOutline(k, { z: zr, m, internal: true });
      const c = circle(k, 45, 0, 6);
      circularSketchPattern(k, [c.id], { count: 6 });
    }, 'Ring profile');
    b.add('extrude', { sketch: s.id, depth: 16 });
    const cv = b.sketch(b.plane('top', 16), (k) => circle(k, 0, 0, 100), 'Cover');
    b.add('extrude', { sketch: cv.id, depth: 6 });
    const hub = b.sketch('front', (k) => { poly(k, [[0, 21], [18, 21], [18, 34], [10, 34], [10, 70], [0, 70]]); addLine(k, 0, 15, 0, 75, { construction: true }); }, 'Output hub');
    b.add('revolve', { sketch: hub.id });
    const kw = b.sketch(b.plane('right', 10), (k) => addSlot(k, 0, 45, 0, 64, 3), 'Keyway');
    b.add('extrude', { sketch: kw.id, op: 'cut', depth: 3.5 });
    b.add('chamfer', { distance: 1, edges: b.edges((e) => ringEdge(50, 22)(e) || ringEdge(10, 70)(e)) });
    return b.part;
  })();
  project.parts.push(carrier, sun, planet, ring);
  const asm = createAssembly(L('유성 기어 세트', 'Planetary gear set'), { partNo: 'PG-000', description: L('캐리어 고정, 감속비 3 : 1 (역회전)', 'Carrier fixed, ratio 3 : 1 (reversing)') });
  project.assemblies.push(asm);
  const P = { carrier: picker(carrier), sun: picker(sun), planet: picker(planet), ring: picker(ring) };
  const cC = component(asm, carrier, [0, 0, 0], quatIdentity(), true);
  const top = P.carrier(cC, PL([0, 1, 0], 0));
  const cS = component(asm, sun, [0, 0, 0]);
  const sunAxis = P.sun(cS, CY(8));
  addMate(asm, 'concentric', P.carrier(cC, CY(8, at(0, 0))), sunAxis);
  addMate(asm, 'coincident', top, P.sun(cS, PL([0, -1, 0], 0)));
  const cR = component(asm, ring, [0, 0, 0]);
  const ringAxis = P.ring(cR, CY(50));
  addMate(asm, 'concentric', sunAxis, ringAxis);
  addMate(asm, 'coincident', top, P.ring(cR, PL([0, -1, 0], 0)));
  // Sun teeth face the planets (0°, 120°, 240°); each planet turned so a gap faces the sun and the ring.
  const planets = angles.map((t) => {
    const r = (t * Math.PI) / 180;
    const c = component(asm, planet, [a * Math.cos(r), 0, -a * Math.sin(r)], RY(t + 180 - 180 / zp));
    const ax = P.planet(c, CY(4));
    addMate(asm, 'concentric', P.carrier(cC, CY(4, (f) => near(f.center[0], a * Math.cos(r), 0.5) && near(f.center[2], -a * Math.sin(r), 0.5))), ax);
    addMate(asm, 'coincident', top, P.planet(c, PL([0, -1, 0], 0)));
    gearMate(asm, sunAxis, ax, zs / zp);
    gearMate(asm, ax, ringAxis, zp / zr, true);
    return c;
  });
  settle(project, asm);
  asm.motion = { duration: 4, motors: [{ id: 'motor-1', kind: 'rotary', comp: cS.id, ref: sunAxis, speed: 30 }] };
  asm.explode = {
    on: false,
    steps: [
      { id: 'explode-1', comps: [cR.id], dir: [0, 1, 0], distance: 90 },
      { id: 'explode-2', comps: planets.map((c) => c.id), dir: [0, 1, 0], distance: 45 },
      { id: 'explode-3', comps: [cS.id], dir: [0, -1, 0], distance: 80 },
    ],
  };
  return { project, asm };
}

// ───────────────────────── 10. six-axis articulated robot with a gripper sub-assembly

/** Signature of a circular edge of radius r whose centre is `c`, lying in the plane coordinate[i] = v (a pattern axis). */
function circleAxis(b, c, r, i, v) {
  const sig = b.edges((e) => e.type === 'CIRCLE' && near(e.mid[i], v, 0.02) && near(Math.hypot(...[0, 1, 2].filter((k) => k !== i).map((k) => e.mid[k] - c[k])), r, 0.05))[0];
  return { kind: 'edge', sig };
}

/** Each joint is a hub on the parent (bore + machined face) and an integral pin on the child, held by a hinge mate. */
export function robotModel(L) {
  const project = newProject(L('6축 다관절 로봇', 'Six-axis articulated robot'));
  const base = (() => {
    const b = builder(part(L('로봇 베이스', 'Robot base'), { material: 'cast-iron', partNo: 'RB-100' }));
    revolveBody(b, [[0, 0], [110, 0], [110, 18], [78, 18], [72, 140], [0, 140]], 'Base body');
    const g = b.sketch('front', (k) => poly(k, [[76, 18], [106, 18], [73, 90]]), 'Gusset');
    const gEx = b.add('extrude', { sketch: g.id, end: 'midplane', depth: 10 });
    b.add('circularPattern', { seeds: [gEx.id], axis: { kind: 'axis', axis: 'y' }, count: 6 });
    const hs = b.sketch(b.plane('top', 18), (k) => point(k, 95 * Math.cos(Math.PI / 6), 95 * Math.sin(Math.PI / 6)), 'Anchor hole');
    const h = b.add('hole', { sketch: hs.id, kind: 'counterbore', diameter: 13, cbDiameter: 20, cbDepth: 4, through: true });
    b.add('circularPattern', { seeds: [h.id], axis: { kind: 'axis', axis: 'y' }, count: 6 });
    const seat = b.sketch(b.plane('top', 140), (k) => circle(k, 0, 0, 60), 'J1 bearing seat');
    b.add('extrude', { sketch: seat.id, op: 'cut', depth: 32 });
    const cable = b.sketch(b.plane('front', 80), (k) => point(k, 0, 60), 'Cable entry');
    b.add('hole', { sketch: cable.id, diameter: 30, depth: 40, through: false });
    b.add('chamfer', { distance: 2, edges: b.edges((e) => ringEdge(72, 140)(e) || ringEdge(110, 18)(e)) });
    return b.part;
  })();
  const waist = (() => {
    const b = builder(part(L('선회 몸체 (J1)', 'Waist (J1)'), { material: 'al-6061', partNo: 'RB-110' }));
    const d = b.sketch('top', (k) => circle(k, 0, 0, 160), 'Turntable');
    b.add('extrude', { sketch: d.id, depth: 25 });
    const sp = b.sketch('top', (k) => circle(k, 0, 0, 60), 'J1 spindle');
    b.add('extrude', { sketch: sp.id, depth: 30, reverse: true });
    const col = b.sketch(b.plane('top', 25), (k) => centreRect(k, 110, 100), 'Column');
    b.add('extrude', { sketch: col.id, depth: 205 });
    b.add('fillet', { radius: 20, edges: b.edges((e) => Math.abs(e.dir[1]) > 0.99 && near(Math.abs(e.mid[0]), 55)) });
    const boss = b.sketch(b.plane('front', 50), (k) => circle(k, 0, 180, 120), 'J2 housing');
    b.add('extrude', { sketch: boss.id, depth: 12 });
    const bore = b.sketch(b.plane('front', 62), (k) => point(k, 0, 180), 'J2 bearing bore');
    b.add('hole', { sketch: bore.id, diameter: 50, depth: 45, through: false });
    const bc = b.sketch(b.plane('front', 62), (k) => point(k, 48, 180), 'Cover screw');
    const bh = b.add('hole', { sketch: bc.id, diameter: 6.8, depth: 12, through: false });
    b.add('circularPattern', { seeds: [bh.id], axis: circleAxis(b, [0, 180, 62], 60, 2, 62), count: 8 });
    const cab = b.sketch('right', (k) => circle(k, 0, 100, 36), 'Cable passage');
    b.add('extrude', { sketch: cab.id, op: 'cut', end: 'throughBoth' });
    const th = b.sketch(b.plane('top', 25), (k) => point(k, 72, 0), 'Table bolt');
    const t = b.add('hole', { sketch: th.id, kind: 'counterbore', diameter: 9, cbDiameter: 15, cbDepth: 5, through: true });
    b.add('circularPattern', { seeds: [t.id], axis: { kind: 'axis', axis: 'y' }, count: 4 });
    return b.part;
  })();
  const upper = (() => {
    const b = builder(part(L('상완 (J2)', 'Upper arm (J2)'), { material: 'al-7075', partNo: 'RB-120' }));
    const pin = b.sketch('front', (k) => circle(k, 0, 0, 50), 'J2 shaft');
    b.add('extrude', { sketch: pin.id, depth: 40, reverse: true });
    const web = b.sketch('front', (k) => addRectangle(k, -40, 0, 40, 400), 'Arm web');
    b.add('extrude', { sketch: web.id, depth: 40 });
    const hubs = b.sketch('front', (k) => { circle(k, 0, 0, 120); circle(k, 0, 400, 100); }, 'Joint hubs');
    b.add('extrude', { sketch: hubs.id, depth: 40 });
    const pk = b.sketch(b.plane('front', 40), (k) => { addSlot(k, -17, 90, -17, 310, 12); addSlot(k, 17, 90, 17, 310, 12); }, 'Pockets (centre rib)');
    b.add('extrude', { sketch: pk.id, op: 'cut', depth: 25 });
    const boss = b.sketch(b.plane('front', 40), (k) => circle(k, 0, 400, 90), 'J3 housing');
    b.add('extrude', { sketch: boss.id, depth: 10 });
    const bore = b.sketch(b.plane('front', 50), (k) => point(k, 0, 400), 'J3 bearing bore');
    b.add('hole', { sketch: bore.id, diameter: 40, depth: 45, through: false });
    const bc = b.sketch(b.plane('front', 50), (k) => point(k, 36, 400), 'Cover screw');
    const bh = b.add('hole', { sketch: bc.id, diameter: 5, depth: 10, through: false });
    b.add('circularPattern', { seeds: [bh.id], axis: circleAxis(b, [0, 400, 50], 45, 2, 50), count: 6 });
    const cab = b.sketch('right', (k) => circle(k, -20, 60, 16), 'Cable hole');
    b.add('extrude', { sketch: cab.id, op: 'cut', end: 'throughBoth' });
    b.add('chamfer', { distance: 1.5, edges: b.edges((e) => e.type === 'CIRCLE' && near(e.mid[2], 50) && near(Math.hypot(e.mid[0], e.mid[1] - 400), 45, 0.05)) });
    return b.part;
  })();
  const fore = (() => {
    const b = builder(part(L('전완 (J3)', 'Forearm (J3)'), { material: 'al-7075', partNo: 'RB-130' }));
    const pin = b.sketch('front', (k) => circle(k, 0, 0, 40), 'J3 shaft');
    b.add('extrude', { sketch: pin.id, depth: 40, reverse: true });
    const hub = b.sketch('front', (k) => circle(k, 0, 0, 100), 'J3 hub');
    b.add('extrude', { sketch: hub.id, depth: 80 });
    const tube = b.sketch('right', (k) => circle(k, -40, 0, 70), 'Arm tube');
    b.add('extrude', { sketch: tube.id, depth: 300 });
    const mot = b.sketch(b.plane('front', 10), (k) => addRectangle(k, -35, 30, 35, 75), 'Wrist motor housing');
    b.add('extrude', { sketch: mot.id, depth: 60 });
    b.add('fillet', { radius: 6, edges: b.edges((e) => e.type === 'LINE' && near(e.mid[1], 75) && Math.abs(e.dir[1]) < 0.01) });
    const bore = b.sketch(planeRef(b, 'right', 300), (k) => point(k, -40, 0), 'J4 bearing bore');
    b.add('hole', { sketch: bore.id, diameter: 40, depth: 30, through: false });
    const bc = b.sketch(planeRef(b, 'right', 300), (k) => point(k, -40, 28), 'Flange screw');
    const bh = b.add('hole', { sketch: bc.id, diameter: 4.2, depth: 10, through: false });
    b.add('circularPattern', { seeds: [bh.id], axis: circleAxis(b, [300, 0, 40], 35, 0, 300), count: 6 });
    const cab = b.sketch(b.plane('top', 75), (k) => point(k, 0, -40), 'Cable gland');
    b.add('hole', { sketch: cab.id, diameter: 16, depth: 20, through: false });
    return b.part;
  })();
  const wrist = (() => {
    const b = builder(part(L('손목 요크 (J4)', 'Wrist yoke (J4)'), { material: 'al-7075', partNo: 'RB-140' }));
    const pin = b.sketch('right', (k) => circle(k, 0, 0, 40), 'J4 shaft');
    b.add('extrude', { sketch: pin.id, depth: 30, reverse: true });
    const body = b.sketch('right', (k) => circle(k, 0, 0, 70), 'Roll housing');
    b.add('extrude', { sketch: body.id, depth: 40 });
    const pl = b.sketch(b.plane('front', 20), (k) => {
      const l1 = addLine(k, 80, 30, 30, 30);
      const l2 = addLine(k, 0, 0, 30, -30, { from: l1.p2 });
      const l3 = addLine(k, 0, 0, 80, -30, { from: l2.p2 });
      addArc(k, 80, 0, 30, -Math.PI / 2, Math.PI / 2, { from: l3.p2, to: l1.p1 });
    }, 'Yoke plate');
    const plate = b.add('extrude', { sketch: pl.id, depth: 12 });
    b.add('mirror', { seeds: [plate.id], plane: { kind: 'std', name: 'front' } });
    const bore = b.sketch('front', (k) => circle(k, 80, 0, 20), 'J5 bearing bore');
    b.add('extrude', { sketch: bore.id, op: 'cut', end: 'throughBoth' });
    b.add('chamfer', { distance: 1.5, edges: b.edges(ringEdge(35, 0)) });
    return b.part;
  })();
  const pitch = (() => {
    const b = builder(part(L('손목 피치 (J5)', 'Wrist pitch (J5)'), { material: 'steel-4340', partNo: 'RB-150' }));
    const hub = b.sketch('front', (k) => circle(k, 0, 0, 56), 'Pitch hub');
    b.add('extrude', { sketch: hub.id, end: 'midplane', depth: 40 });
    const pin = b.sketch('front', (k) => circle(k, 0, 0, 20), 'J5 trunnion');
    b.add('extrude', { sketch: pin.id, end: 'midplane', depth: 64 });
    const nose = b.sketch('right', (k) => circle(k, 0, 0, 36), 'Nose');
    b.add('extrude', { sketch: nose.id, depth: 70 });
    const bore = b.sketch(planeRef(b, 'right', 70), (k) => point(k, 0, 0), 'J6 bearing bore');
    b.add('hole', { sketch: bore.id, diameter: 25, depth: 25, through: false });
    b.add('chamfer', { distance: 1, edges: b.edges((e) => e.type === 'CIRCLE' && near(Math.abs(e.mid[2]), 20) && near(Math.hypot(e.mid[0], e.mid[1]), 28, 0.05)) });
    return b.part;
  })();
  const flange = (() => {
    const b = builder(part(L('툴 플랜지 (J6)', 'Tool flange (J6)'), { material: 'steel-4340', partNo: 'RB-160', description: 'ISO 9409-1-50-4-M6' }));
    const pin = b.sketch('right', (k) => circle(k, 0, 0, 25), 'J6 shaft');
    b.add('extrude', { sketch: pin.id, depth: 20, reverse: true });
    const disk = b.sketch('right', (k) => circle(k, 0, 0, 63), 'Flange');
    b.add('extrude', { sketch: disk.id, depth: 12 });
    const loc = b.sketch(planeRef(b, 'right', 12), (k) => point(k, 0, 0), 'Locating bore');
    b.add('hole', { sketch: loc.id, diameter: 31.5, depth: 6, through: false });
    const hs = b.sketch(planeRef(b, 'right', 12), (k) => point(k, 0, 25), 'Tool screw');
    const h = b.add('hole', { sketch: hs.id, diameter: 6.6, through: true });
    b.add('circularPattern', { seeds: [h.id], axis: { kind: 'axis', axis: 'x' }, count: 4 });
    b.add('chamfer', { distance: 1, edges: b.edges((e) => e.type === 'CIRCLE' && near(e.mid[0], 12) && near(Math.hypot(e.mid[1], e.mid[2]), 31.5, 0.05)) });
    return b.part;
  })();
  // Gripper sub-assembly: body (fixed) with a finger slot, two fingers centred by a width mate, their opening held by a limit-distance mate.
  const gBody = (() => {
    const b = builder(part(L('그리퍼 몸체', 'Gripper body'), { material: 'al-6061', partNo: 'RB-210' }));
    const sp = b.sketch('right', (k) => circle(k, 0, 0, 31.5), 'Spigot');
    b.add('extrude', { sketch: sp.id, depth: 6, reverse: true });
    const pl = b.sketch('right', (k) => circle(k, 0, 0, 63), 'Mount plate');
    b.add('extrude', { sketch: pl.id, depth: 8 });
    const bo = b.sketch(planeRef(b, 'right', 8), (k) => centreRect(k, 40, 76), 'Actuator body');
    b.add('extrude', { sketch: bo.id, depth: 50 });
    b.add('fillet', { radius: 4, edges: b.edges((e) => Math.abs(e.dir[0]) > 0.99 && near(Math.abs(e.mid[1]), 38) && near(Math.abs(e.mid[2]), 20)) });
    const sl = b.sketch(planeRef(b, 'right', 58), (k) => addRectangle(k, -8, -34, 8, 34), 'Finger slot');
    b.add('extrude', { sketch: sl.id, op: 'cut', depth: 6 });
    const hs = b.sketch(planeRef(b, 'right', 8), (k) => point(k, 0, 25), 'Mount screw');
    const h = b.add('hole', { sketch: hs.id, diameter: 6.6, depth: 8, through: false });
    b.add('circularPattern', { seeds: [h.id], axis: { kind: 'axis', axis: 'x' }, count: 4 });
    const air = b.sketch(b.plane('top', 38), (k) => { point(k, 22, 0); point(k, 44, 0); }, 'Air ports');
    b.add('hole', { sketch: air.id, diameter: 5, depth: 12, through: false });
    return b.part;
  })();
  const finger = (() => {
    const b = builder(part(L('그리퍼 핑거', 'Gripper finger'), { material: 'steel-4340', partNo: 'RB-220' }));
    const s = b.sketch('front', (k) => addRectangle(k, 0, 0, 6, 12), 'Slide');
    b.add('extrude', { sketch: s.id, end: 'midplane', depth: 16 });
    const p = b.sketch('front', (k) => addRectangle(k, 6, 0, 70, 8), 'Finger');
    b.add('extrude', { sketch: p.id, end: 'midplane', depth: 20 });
    const v = b.sketch('front', (k) => poly(k, [[48, -0.5], [62, -0.5], [55, 4]]), 'V jaw');
    b.add('extrude', { sketch: v.id, op: 'cut', end: 'throughBoth' });
    b.add('chamfer', { distance: 1.5, edges: b.edges((e) => e.type === 'LINE' && near(e.mid[0], 70) && Math.abs(e.dir[2]) > 0.99) });
    return b.part;
  })();
  project.parts.push(base, waist, upper, fore, wrist, pitch, flange, gBody, finger);
  const P = { base: picker(base), waist: picker(waist), upper: picker(upper), fore: picker(fore), wrist: picker(wrist), pitch: picker(pitch), flange: picker(flange), gb: picker(gBody), f: picker(finger) };

  const grip = createAssembly(L('2지 그리퍼', 'Two-finger gripper'), { partNo: 'RB-200', description: L('평행 그리퍼, 행정 2×19', 'Parallel gripper, stroke 2×19') });
  project.assemblies.push(grip);
  const gB = component(grip, gBody, [0, 0, 0], quatIdentity(), true);
  const fingers = [[15, quatIdentity()], [-15, RX(180)]].map(([y, rot]) => {
    const c = component(grip, finger, [52, y, 0], rot);
    addMate(grip, 'coincident', P.gb(gB, PL([1, 0, 0], 52)), P.f(c, PL([-1, 0, 0], 0)));
    addMate(grip, 'width', P.gb(gB, PL([0, 0, -1], -8)), P.gb(gB, PL([0, 0, 1], -8)), { c: P.f(c, PL([0, 0, 1], 8)), d: P.f(c, PL([0, 0, -1], 8)) });
    return c;
  });
  addMate(grip, 'width', P.gb(gB, PL([0, 1, 0], 38)), P.gb(gB, PL([0, -1, 0], 38)), { c: P.f(fingers[0], PL([0, 1, 0], 8)), d: P.f(fingers[1], PL([0, 1, 0], 8)) });
  // The opening: free between 12 and 50 mm (the stroke), 30 at rest.
  addMate(grip, 'limitDistance', P.f(fingers[0], PL([0, -1, 0], 0)), P.f(fingers[1], PL([0, -1, 0], 0)), { min: 12, max: 50 });
  settle(project, grip);
  // Its own motion: the first finger driven open and closed (±6 mm every 2 s), the width mate moves the other.
  grip.motion = { duration: 6, motors: [{ id: 'motor-grip', kind: 'linear', comp: fingers[0].id, ref: P.f(fingers[0], PL([0, 1, 0], 8)), speed: 0, amplitude: 6, period: 2 }] };

  const asm = createAssembly(L('6축 다관절 로봇', 'Six-axis articulated robot'), { partNo: 'RB-000', description: L('가반 5 kg, 도달 900 mm', 'Payload 5 kg, reach 900 mm') });
  project.assemblies.push(asm);
  const deg = Math.PI / 180;
  const a2 = -20;
  const J2 = [0, 320, 62];
  const J3 = [J2[0] - 400 * Math.sin(a2 * deg), J2[1] + 400 * Math.cos(a2 * deg), J2[2] + 50];
  const J4 = [J3[0] + 300, J3[1], J3[2] + 40];
  const J5 = [J4[0] + 80, J4[1], J4[2]];
  const J6 = [J5[0] + 70, J5[1], J5[2]];
  const cBase = component(asm, base, [0, 0, 0], quatIdentity(), true);
  const cW = component(asm, waist, [0, 140, 0]);
  const j1 = P.waist(cW, CY(30));
  addMate(asm, 'hinge', P.base(cBase, CY(30)), j1, { c: P.base(cBase, PL([0, 1, 0], 140)), d: P.waist(cW, PL([0, -1, 0], 0)) });
  const cU = component(asm, upper, J2, RZ(a2));
  addMate(asm, 'hinge', P.waist(cW, CY(25)), P.upper(cU, CY(25)), { c: P.waist(cW, PL([0, 0, 1], 62)), d: P.upper(cU, PL([0, 0, -1], 0)) });
  addMate(asm, 'limitAngle', P.waist(cW, PL([0, 1, 0], 230)), P.upper(cU, PL([1, 0, 0], 40)), { min: 30, max: 150 });
  const cF = component(asm, fore, J3);
  addMate(asm, 'hinge', P.upper(cU, CY(20)), P.fore(cF, CY(20, at(2, -20, 1))), { c: P.upper(cU, PL([0, 0, 1], 50)), d: P.fore(cF, PL([0, 0, -1], 0)) });
  addMate(asm, 'limitAngle', P.upper(cU, PL([1, 0, 0], 40)), P.fore(cF, PL([0, 1, 0], 75)), { min: 20, max: 160 });
  const cY = component(asm, wrist, J4);
  const j4 = P.wrist(cY, CY(20));
  addMate(asm, 'hinge', P.fore(cF, CY(20, at(0, 285, 20))), j4, { c: P.fore(cF, PL([1, 0, 0], 300)), d: P.wrist(cY, PL([-1, 0, 0], 0)) });
  const cP = component(asm, pitch, J5);
  addMate(asm, 'hinge', P.wrist(cY, CY(10)), P.pitch(cP, CY(10)), { c: P.wrist(cY, PL([0, 0, -1], -20)), d: P.pitch(cP, PL([0, 0, 1], 20)) });
  addMate(asm, 'limitAngle', P.wrist(cY, PL([1, 0, 0], 40)), P.pitch(cP, PL([1, 0, 0], 70)), { min: 0, max: 110 });
  const cFl = component(asm, flange, J6);
  const j6 = P.flange(cFl, CY(12.5));
  addMate(asm, 'hinge', P.pitch(cP, CY(12.5)), j6, { c: P.pitch(cP, PL([1, 0, 0], 70)), d: P.flange(cFl, PL([-1, 0, 0], 0)) });
  const cG = { id: newId('cmp'), sub: grip.id, name: `${grip.name}<1>`, position: [J6[0] + 12, J6[1], J6[2]], rotation: quatIdentity(), fixed: false };
  asm.components.push(cG);
  // The gripper body sits at its sub-assembly's origin: its faces are the sub-assembly's.
  addMate(asm, 'coincident', P.flange(cFl, PL([1, 0, 0], 12)), P.gb(cG.id, PL([-1, 0, 0], 0)));
  addMate(asm, 'concentric', P.flange(cFl, CY(15.75)), P.gb(cG.id, CY(15.75)));
  addMate(asm, 'concentric', P.flange(cFl, CY(3.3, at(1, 25, 1))), P.gb(cG.id, CY(3.3, at(1, 25, 1))));
  settle(project, asm);
  // Motion: every joint. Each motor is mounted on the link before it (parent), so a joint turns wherever the
  // joints under it have taken it; J1–J5 swing inside their angle limits, the tool flange (J6) turns round, and the
  // gripper sub-assembly plays its own motion (the fingers open and close).
  const swing = (id, comp, ref, parent, amplitude, period) => ({ id, kind: 'rotary', comp, ref, parent, speed: 0, amplitude, period });
  asm.motion = {
    duration: 6,
    motors: [
      swing('motor-j1', cW.id, j1, cBase.id, 45, 6),
      swing('motor-j2', cU.id, P.upper(cU, CY(25)), cW.id, 20, 6),
      swing('motor-j3', cF.id, P.fore(cF, CY(20, at(2, -20, 1))), cU.id, 25, 3),
      swing('motor-j4', cY.id, j4, cF.id, 60, 4),
      swing('motor-j5', cP.id, P.pitch(cP, CY(10)), cY.id, 30, 3),
      { id: 'motor-j6', kind: 'rotary', comp: cFl.id, ref: j6, parent: cP.id, speed: 20 },
    ],
  };
  asm.explode = {
    on: false,
    steps: [
      { id: 'explode-1', comps: [cG.id], dir: [1, 0, 0], distance: 90 },
      { id: 'explode-2', comps: [cG.id, cFl.id], dir: [1, 0, 0], distance: 60 },
      { id: 'explode-3', comps: [cG.id, cFl.id, cP.id], dir: [1, 0, 0], distance: 60 },
      { id: 'explode-4', comps: [cG.id, cFl.id, cP.id, cY.id], dir: [1, 0, 0], distance: 70 },
      { id: 'explode-5', comps: [cG.id, cFl.id, cP.id, cY.id, cF.id], dir: [0, 0, 1], distance: 90 },
      { id: 'explode-6', comps: [cG.id, cFl.id, cP.id, cY.id, cF.id, cU.id], dir: [0, 0, 1], distance: 90 },
      { id: 'explode-7', comps: [cW.id, cU.id, cF.id, cY.id, cP.id, cFl.id, cG.id], dir: [0, 1, 0], distance: 80 },
    ],
  };
  project.active = { kind: 'assembly', id: asm.id };
  return { project, asm };
}

// ───────────────────────── 11. cart with four caster sub-assemblies

function cartModel(L) {
  const project = newProject(L('운반 카트 (서브 어셈블리)', 'Utility cart (sub-assemblies)'));
  const bracket = (() => {
    const b = builder(part(L('캐스터 브래킷', 'Caster bracket'), { material: 'steel-1020', partNo: 'CT-110' }));
    const s = b.sketch('top', (k) => centreRect(k, 60, 60), 'Top plate');
    b.add('extrude', { sketch: s.id, depth: 4, reverse: true });
    b.add('fillet', { radius: 6, edges: b.edges((e) => Math.abs(e.dir[1]) > 0.99) });
    const hs = b.sketch('top', (k) => { for (const x of [-22, 22]) for (const y of [-22, 22]) point(k, x, y); }, 'Mount holes');
    b.add('hole', { sketch: hs.id, diameter: 8, through: true });
    const leg = b.sketch(b.plane('right', 16), (k) => {
      const l1 = addLine(k, 20, -55, 20, -4);
      const l2 = addLine(k, 0, 0, -20, -4, { from: l1.p2 });
      const l3 = addLine(k, 0, 0, -20, -55, { from: l2.p2 });
      addArc(k, 0, -55, 20, Math.PI, 2 * Math.PI, { from: l3.p2, to: l1.p1 });
    }, 'Fork leg');
    const legEx = b.add('extrude', { sketch: leg.id, depth: 3 });
    b.add('mirror', { seeds: [legEx.id], plane: { kind: 'std', name: 'right' } });
    const ax = b.sketch('right', (k) => circle(k, 0, -55, 10), 'Axle hole');
    b.add('extrude', { sketch: ax.id, op: 'cut', end: 'throughBoth' });
    const kp = b.sketch('top', (k) => circle(k, 0, 0, 12), 'King-pin hole');
    b.add('extrude', { sketch: kp.id, op: 'cut', end: 'throughBoth' });
    return b.part;
  })();
  const rim = (() => {
    const b = builder(part(L('휠 림', 'Wheel rim'), { material: 'nylon', partNo: 'CT-120' }));
    revolveBody(b, [[5, -16], [12, -16], [12, -4], [24, -4], [24, -12], [28, -12], [28, 12], [24, 12], [24, 4], [12, 4], [12, 16], [5, 16]], 'Rim');
    const hs = b.sketch(b.plane('top', 4), (k) => point(k, 18, 0), 'Web hole');
    const h = b.add('hole', { sketch: hs.id, diameter: 6, through: true });
    b.add('circularPattern', { seeds: [h.id], axis: { kind: 'axis', axis: 'y' }, count: 6 });
    return b.part;
  })();
  const tire = (() => {
    const b = builder(part(L('고무 타이어', 'Rubber tyre'), { material: 'rubber', partNo: 'CT-130' }));
    revolveBody(b, [[28, -12], [34, -12], [38, -8], [38, 8], [34, 12], [28, 12]], 'Tyre');
    const g = b.sketch('front', (k) => { addRectangle(k, 37, -1, 39, 1); addLine(k, 0, -15, 0, 15, { construction: true }); }, 'Tread groove');
    b.add('revolve', { sketch: g.id, op: 'cut' });
    return b.part;
  })();
  const axle = hexBolt(L('차축 볼트 M10×50', 'Axle bolt M10×50'), 10, 50);
  const nut = hexNut(L('육각 너트 M10', 'Hex nut M10'), 10);
  const deck = (() => {
    const b = builder(part(L('카트 상판', 'Cart deck'), { material: 'oak', partNo: 'CT-100' }));
    const s = b.sketch('top', (k) => centreRect(k, 600, 400), 'Deck');
    b.add('extrude', { sketch: s.id, depth: 18 });
    b.add('fillet', { radius: 20, edges: b.edges((e) => Math.abs(e.dir[1]) > 0.99) });
    b.add('chamfer', { distance: 2, edges: b.edges((e) => near(e.mid[1], 18) && e.type !== 'CIRCLE' || (e.type === 'CIRCLE' && near(e.mid[1], 18))) });
    const hs = b.sketch(b.plane('top', 18), (k) => { for (const cx of [-250, 250]) for (const cz of [-150, 150]) for (const dx of [-22, 22]) for (const dz of [-22, 22]) point(k, cx + dx, cz + dz); }, 'Caster holes');
    b.add('hole', { sketch: hs.id, diameter: 8, through: true });
    const so = b.sketch(b.plane('top', 18), (k) => { point(k, -280, 150); point(k, -280, -150); }, 'Handle sockets');
    b.add('hole', { sketch: so.id, diameter: 25.4, depth: 10, through: false });
    return b.part;
  })();
  const handle = (() => {
    const b = builder(part(L('손잡이 프레임 (용접)', 'Handle frame (welded)'), { material: 'stainless-304', partNo: 'CT-140' }));
    const s = b.sketch('right', (k) => {
      const l1 = addLine(k, 150, 0, 150, 750);
      const l2 = addLine(k, 0, 0, -150, 750, { from: l1.p2 });
      addLine(k, 0, 0, -150, 0, { from: l2.p2 });
    }, 'Frame path');
    b.add('structural', { sketch: s.id, profile: 'pipe', w: 25.4, h: 25.4, t: 2 });
    return b.part;
  })();
  project.parts.push(deck, handle, bracket, rim, tire, axle, nut);
  const P = { bracket: picker(bracket), rim: picker(rim), tire: picker(tire), axle: picker(axle), nut: picker(nut), deck: picker(deck), handle: picker(handle) };
  // The caster sub-assembly: bracket fixed, wheel centred between the fork legs, axle bolt and nut.
  const caster = createAssembly(L('캐스터 Ø76', 'Caster Ø76'), { partNo: 'CT-200', description: L('고정형 캐스터', 'Fixed caster') });
  project.assemblies.push(caster);
  const kB = component(caster, bracket, [0, 0, 0], quatIdentity(), true);
  const kR = component(caster, rim, [0, -55, 0], RZ(-90));
  addMate(caster, 'concentric', P.bracket(kB, CY(5)), P.rim(kR, CY(5)));
  addMate(caster, 'width', P.bracket(kB, PL([-1, 0, 0], -16)), P.bracket(kB, PL([1, 0, 0], -16)), { c: P.rim(kR, PL([0, 1, 0], 16)), d: P.rim(kR, PL([0, -1, 0], 16)) });
  const kT = component(caster, tire, [0, -55, 0], RZ(-90));
  addMate(caster, 'concentric', P.rim(kR, CY(28)), P.tire(kT, CY(28)));
  addMate(caster, 'coincident', P.rim(kR, PL([0, 1, 0], 12)), P.tire(kT, PL([0, 1, 0], 12, (f) => Math.hypot(f.center[0], f.center[2]) < 1)), { aligned: 'aligned' });
  const kA = component(caster, axle, [19, -55, 0], RZ(-90));
  addMate(caster, 'concentric', P.bracket(kB, CY(5)), P.axle(kA, CY(5, (f) => f.center[1] < -1)));
  addMate(caster, 'coincident', P.bracket(kB, PL([1, 0, 0], 19)), P.axle(kA, PL([0, -1, 0], 0)));
  const kN = component(caster, nut, [-19, -55, 0], RZ(90));
  addMate(caster, 'concentric', P.bracket(kB, CY(5)), P.nut(kN, CY(5)));
  addMate(caster, 'coincident', P.bracket(kB, PL([-1, 0, 0], 19)), P.nut(kN, PL([0, -1, 0], 0)));
  settle(project, caster);
  caster.motion = { duration: 3, motors: [{ id: 'motor-1', kind: 'rotary', comp: kR.id, ref: P.rim(kR, CY(5)), speed: 40 }] };
  // The cart: deck fixed, a caster under each corner (two of its holes on the deck's), the welded handle in its sockets.
  const cart = createAssembly(L('운반 카트', 'Utility cart'), { partNo: 'CT-000' });
  project.assemblies.push(cart);
  const cD = component(cart, deck, [0, 0, 0], quatIdentity(), true);
  const casters = [];
  for (const x of [-250, 250]) for (const z of [-150, 150]) {
    const n = casters.length + 1;
    const c = { id: newId('cmp'), sub: caster.id, name: `${caster.name}<${n}>`, position: [x, 0, z], rotation: quatIdentity(), fixed: false };
    cart.components.push(c);
    casters.push(c);
    // The bracket sits at the sub-assembly's origin, so its faces are the sub-assembly's.
    addMate(cart, 'coincident', P.deck(cD, PL([0, -1, 0], 0)), P.bracket(c.id, PL([0, 1, 0], 0)));
    addMate(cart, 'concentric', P.deck(cD, CY(4, (f) => near(f.center[0], x - 22, 0.5) && near(f.center[2], z - 22, 0.5))), P.bracket(c.id, CY(4, (f) => near(f.center[0], -22, 0.5) && near(f.center[2], -22, 0.5))));
    addMate(cart, 'concentric', P.deck(cD, CY(4, (f) => near(f.center[0], x + 22, 0.5) && near(f.center[2], z + 22, 0.5))), P.bracket(c.id, CY(4, (f) => near(f.center[0], 22, 0.5) && near(f.center[2], 22, 0.5))));
  }
  const cH = component(cart, handle, [-280, 8, 0]);
  addMate(cart, 'distance', P.deck(cD, PL([0, 1, 0], 18)), P.handle(cH, PL([0, -1, 0], 0)), { value: 10, flip: true });
  for (const z of [-150, 150]) addMate(cart, 'concentric', P.deck(cD, CY(12.7, at(2, z, 1))), P.handle(cH, CY(12.7, (f) => near(f.center[2], z, 1) && f.center[1] < 700)));
  settle(project, cart);
  cart.explode = {
    on: false,
    steps: [
      { id: 'explode-1', comps: casters.map((c) => c.id), dir: [0, -1, 0], distance: 80 },
      { id: 'explode-2', comps: [cH.id], dir: [0, 1, 0], distance: 120 },
    ],
  };
  project.active = { kind: 'assembly', id: cart.id };
  return { project, asm: cart };
}

// ───────────────────────── drawings

/**
 * Where model points land on a drawing's sheet: the views' boxes estimated from bounding boxes (`boxes`: [[lo, hi]]
 * in the source's frame; a section view keeps the half behind its plane), laid out like the drawing will be.
 * Returns { at(viewId, [x, y, z]) → [sheetX, sheetY], scale, place(viewId) → { cx, cy, w, h } }.
 */
function sheetLayout(drawing, boxes) {
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const corners = (lo, hi) => { const out = []; for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) out.push([x, y, z]); return out; };
  const proj = new Map();
  for (const v of drawing.views) {
    if (v.kind === 'detail') continue;
    const B = viewBasis(v);
    let pts = [];
    for (const [lo0, hi0] of boxes) {
      const lo = [...lo0]; const hi = [...hi0];
      if (v.kind === 'section') {
        const n = v.plane.normal; const p = v.plane.point; const i = n.findIndex((c) => Math.abs(c) > 0.99);
        if (i >= 0) { if (n[i] > 0) hi[i] = Math.min(hi[i], p[i]); else lo[i] = Math.max(lo[i], p[i]); }
        if (lo[i] > hi[i]) continue;
      }
      pts = pts.concat(corners(lo, hi));
    }
    const xs = pts.map((q) => dot(q, B.x)); const ys = pts.map((q) => dot(q, B.y));
    proj.set(v.id, { visible: [], hidden: [], box: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }, basis: B });
  }
  const { scale, places } = layoutViews(drawing, proj);
  const viewOf = (id) => drawing.views.find((v) => v.id === id);
  const frameOf = (id) => {
    const v = viewOf(id);
    if (v.kind !== 'detail') { const p = proj.get(id); return { B: p.basis, cx: (p.box.x0 + p.box.x1) / 2, cy: (p.box.y0 + p.box.y1) / 2, s: scale, w: p.box.x1 - p.box.x0, h: p.box.y1 - p.box.y0 }; }
    const parent = frameOf(v.parent);
    return { B: parent.B, cx: v.center[0], cy: v.center[1], s: scale * (v.scale || 2), w: 2 * v.radius, h: 2 * v.radius };
  };
  return {
    scale,
    at(id, q) {
      const f = frameOf(id); const pl = places.get(id);
      return [pl.cx + (dot(q, f.B.x) - f.cx) * f.s, pl.cy + (f.cy - dot(q, f.B.y)) * f.s].map((x) => Math.round(x * 10) / 10);
    },
    place(id) { const f = frameOf(id); const pl = places.get(id); return { cx: pl.cx, cy: pl.cy, w: f.w * f.s, h: f.h * f.s }; },
  };
}

const ann = (d, kind, fields) => { d.annotations.push({ id: `ann-${d.annotations.length + 1}`, kind, ...fields }); };
const off = ([x, y], dx, dy) => [Math.round((x + dx) * 10) / 10, Math.round((y + dy) * 10) / 10];

/** A transmission shaft along X (revolved about the X axis): journals, gear seat, keyways, ring groove, centre holes. */
function transmissionShaft(L) {
  const b = builder(part(L('기어 전동축', 'Transmission shaft'), { material: 'steel-4340', partNo: 'TS-200', description: L('조질 후 저널 연삭', 'Hardened, journals ground') }));
  const segs = [[0, 28, 20], [28, 30, 17], [30, 70, 25], [70, 76, 32], [76, 136, 30], [136, 146, 36], [146, 186, 25], [186, 236, 22]];
  const pts = [[0, 0]];
  for (const [x0, x1, d] of segs) pts.push([x0, d / 2], [x1, d / 2]);
  pts.push([236, 0]);
  const s = b.sketch('front', (k) => { poly(k, pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1])); addLine(k, -5, 0, 241, 0, { construction: true }); }, 'Shaft profile');
  b.add('revolve', { sketch: s.id });
  const ring = (x, r) => (e) => e.type === 'CIRCLE' && near(e.mid[0], x, 0.02) && near(Math.hypot(e.mid[1], e.mid[2]), r, 0.02);
  b.add('thread', { edge: b.edges(ring(0, 10))[0], pitch: 1.5, length: 22, cosmetic: true });
  b.add('chamfer', { distance: 1, edges: b.edges((e) => ring(0, 10)(e) || ring(236, 11)(e)) });
  b.add('fillet', { radius: 0.8, edges: b.edges((e) => ring(70, 12.5)(e) || ring(76, 15)(e) || ring(146, 12.5)(e)) });
  const k1 = b.sketch(b.plane('top', 15), (k) => addSlot(k, 86, 0, 126, 0, 4), 'Gear keyway');
  b.add('extrude', { sketch: k1.id, op: 'cut', depth: 4 });
  const k2 = b.sketch(b.plane('top', 11), (k) => addSlot(k, 196, 0, 226, 0, 3), 'Coupling keyway');
  b.add('extrude', { sketch: k2.id, op: 'cut', depth: 3.5 });
  const g = b.sketch('front', (k) => { addRectangle(k, 179, 11.3, 180.3, 13.5); addLine(k, 170, 0, 190, 0, { construction: true }); }, 'Ring groove');
  b.add('revolve', { sketch: g.id, op: 'cut' });
  for (const [x, flip] of [[236, false], [0, true]]) {
    const c = b.sketch(planeRef(b, 'right', x, flip), (k) => point(k, 0, 0), 'Centre hole');
    b.add('hole', { sketch: c.id, kind: 'countersink', diameter: 3.15, csDiameter: 6.7, csAngle: 60, depth: 8, through: false });
  }
  return b.part;
}

function shaftDrawing(L) {
  const shaft = transmissionShaft(L);
  const project = newProject(shaft.name);
  project.parts.push(shaft);
  const d = addDrawing(project, { kind: 'part', id: shaft.id }, `${shaft.name} - ${L('시트1', 'Sheet1')}`);
  Object.assign(d.title, { partNo: shaft.partNo, drawnBy: 'SHKWON', checkedBy: 'QA', company: 'MyMechanics', revision: 'B' });
  d.views.push({ id: 'v-sec', type: 'right', kind: 'section', parent: 'v-front', label: 'A', plane: { point: [106, 0, 0], normal: [1, 0, 0] } });
  d.views.push({ id: 'v-det', kind: 'detail', parent: 'v-front', center: [180, 12], radius: 7, scale: 4, label: 'B' });
  const lay = sheetLayout(d, [regenerate(shaft).body.boundingBox.bounds]);
  const F = (x, y) => lay.at('v-front', [x, y, 0]);
  ann(d, 'datum', { letter: 'A', ...xy(off(F(50, -12.5), 0, 12)), target: F(50, -12.5) });
  ann(d, 'datum', { letter: 'B', ...xy(off(F(166, -12.5), 0, 12)), target: F(166, -12.5) });
  ann(d, 'gdt', { symbol: 'runout', tolerance: '0.02', datums: ['A-B'], ...xy(off(F(106, -15), -14, 18)), target: F(106, -15) });
  ann(d, 'gdt', { symbol: 'cylindricity', tolerance: '0.005', ...xy(off(F(50, 12.5), -10, -15)), target: F(50, 12.5) });
  ann(d, 'gdt', { symbol: 'perpendicularity', tolerance: '0.01', datums: ['A-B'], ...xy(off(F(146, -18), 8, 22)), target: F(146, -18) });
  ann(d, 'surface', { ra: '0.4', process: 'removal', ...xy(F(166, 12.5)) });
  ann(d, 'surface', { ra: '0.8', process: 'removal', ...xy(F(90, 15)) });
  const T = (x, z) => lay.at('v-top', [x, 0, z]);
  ann(d, 'dimension', { a: T(82, -4), b: T(130, -4), orient: 'horizontal', offset: 9 });
  ann(d, 'dimension', { a: T(193, -3), b: T(229, -3), orient: 'horizontal', offset: 9 });
  const rc = lay.at('v-right', [236, 0, 0]);
  ann(d, 'centermark', { ...xy(rc), size: 30 });
  ann(d, 'note', { ...xy(off(F(14, -10), -16, 16)), text: 'M20×1.5-6g', size: 3, target: F(14, -10) });
  ann(d, 'note', { x: 25, y: 250, size: 3.2, text: L('주기\n1. 지시 없는 모따기 C1, 구석 R0.8\n2. 조질 HRC 28–32, 저널 고주파 경화 HRC 50–55\n3. 일반 공차 KS B ISO 2768-mK', 'NOTES\n1. Unless stated: chamfers C1, fillets R0.8\n2. Hardened HRC 28–32, journals induction hardened HRC 50–55\n3. General tolerances ISO 2768-mK') });
  project.active = { kind: 'drawing', id: d.id };
  return project;
}

const xy = ([x, y]) => ({ x, y });

/** A flanged bearing housing (revolved about Y): bearing seat, seal seat, spigot with O-ring groove, flange holes, grease port. */
function bearingHousing(L) {
  const b = builder(part(L('플랜지형 베어링 하우징', 'Flanged bearing housing'), { material: 'cast-iron', partNo: 'BH-6206', description: L('베어링 6206용', 'For bearing 6206') }));
  revolveBody(b, [[31, 0], [40, 0], [40, 8], [65, 8], [65, 22], [45, 22], [45, 60], [36, 60], [36, 50], [27, 50], [27, 18], [31, 18]], 'Housing profile');
  b.add('fillet', { radius: 3, edges: b.edges(ringEdge(45, 22)) });
  b.add('chamfer', { distance: 1.5, edges: b.edges((e) => ringEdge(65, 8)(e) || ringEdge(65, 22)(e)) });
  b.add('chamfer', { distance: 1, edges: b.edges((e) => ringEdge(31, 0)(e) || ringEdge(36, 60)(e) || ringEdge(45, 60)(e)) });
  const hs = b.sketch(b.plane('top', 22), (k) => point(k, 54, 0), 'Flange hole');
  const h = b.add('hole', { sketch: hs.id, kind: 'counterbore', diameter: 9, cbDiameter: 15, cbDepth: 5, through: true });
  b.add('circularPattern', { seeds: [h.id], axis: { kind: 'axis', axis: 'y' }, count: 4 });
  const boss = b.sketch(planeRef(b, 'right', 44), (k) => circle(k, 0, 40, 14), 'Grease boss');
  b.add('extrude', { sketch: boss.id, depth: 5 });
  const gh = b.sketch(planeRef(b, 'right', 49), (k) => point(k, 0, 40), 'Grease port');
  b.add('hole', { sketch: gh.id, diameter: 5, depth: 25, through: false });
  const g = b.sketch('front', (k) => { addRectangle(k, 37, 2.5, 41, 5.5); addRectangle(k, 35.5, 54, 37.2, 55.6); addLine(k, 0, -5, 0, 65, { construction: true }); }, 'Grooves');
  b.add('revolve', { sketch: g.id, op: 'cut' });
  return b.part;
}

function housingDrawing(L) {
  const hsg = bearingHousing(L);
  const project = newProject(hsg.name);
  project.parts.push(hsg);
  const d = addDrawing(project, { kind: 'part', id: hsg.id }, `${hsg.name} - ${L('시트1', 'Sheet1')}`);
  Object.assign(d.title, { partNo: hsg.partNo, drawnBy: 'SHKWON', checkedBy: 'QA', company: 'MyMechanics', revision: 'A' });
  d.views = d.views.filter((v) => v.id !== 'v-right');
  d.views.push({ id: 'v-sec', type: 'front', kind: 'section', parent: 'v-top', label: 'A', plane: { point: [0, 0, 0], normal: [0, 0, 1] } });
  d.views.push({ id: 'v-det', kind: 'detail', parent: 'v-sec', center: [-38.5, 4], radius: 7, scale: 4, label: 'C' });
  const lay = sheetLayout(d, [regenerate(hsg).body.boundingBox.bounds]);
  const S = (x, y) => lay.at('v-sec', [x, y, 0]);
  const Tp = (x, z) => lay.at('v-top', [x, 0, z]);
  ann(d, 'datum', { letter: 'A', ...xy(off(S(-31, 9), -14, 0)), target: S(-31, 9) });
  ann(d, 'datum', { letter: 'B', ...xy(off(S(55, 8), 0, 12)), target: S(55, 8) });
  ann(d, 'gdt', { symbol: 'perpendicularity', tolerance: '0.02', datums: ['A'], ...xy(off(S(58, 22), 6, -20)), target: S(58, 22) });
  ann(d, 'gdt', { symbol: 'runout', tolerance: '0.03', datums: ['A'], ...xy(off(S(-36, 56), -44, -8)), target: S(-36, 56) });
  ann(d, 'gdt', { symbol: 'position', tolerance: '0.2', diameter: true, modifier: 'M', datums: ['A', 'B'], ...xy(off(Tp(54, 0), 14, -18)), target: Tp(54, 0) });
  ann(d, 'gdt', { symbol: 'flatness', tolerance: '0.01', ...xy(off(S(52, 8), 8, 16)), target: S(52, 8) });
  ann(d, 'surface', { ra: '0.8', process: 'removal', ...xy(S(29, 18)) });
  ann(d, 'surface', { ra: '1.6', process: 'removal', ...xy(S(-50, 22)) });
  ann(d, 'note', { ...xy(off(Tp(54, 0), 14, 14)), text: L('4×Ø9 관통, ⌴Ø15 깊이 5', '4×Ø9 THRU, ⌴Ø15 DEPTH 5'), size: 3, target: Tp(54, 0) });
  ann(d, 'centermark', { ...xy(Tp(0, 0)), size: 40 });
  ann(d, 'note', { x: 25, y: 250, size: 3.2, text: L('주기\n1. 주물 일반 공차 KS B 0250 CT9\n2. 지시 없는 주물 R3\n3. 가공면 외 도장 (회색)', 'NOTES\n1. Casting tolerances ISO 8062 CT9\n2. Unspecified cast radii R3\n3. Paint grey except machined faces') });
  project.active = { kind: 'drawing', id: d.id };
  return project;
}

/** An assembly drawing: front, top and isometric views, a bill of materials and a balloon on each BOM row's part. */
export function assemblyDrawing(L, { project, asm }, { section = null, notes, sheet = 'A3', drop = ['v-right'] } = {}) {
  const d = addDrawing(project, { kind: 'assembly', id: asm.id }, `${asm.name} - ${L('조립도', 'Assembly')}`);
  d.sheet = sheet;
  Object.assign(d.title, { partNo: asm.partNo ?? '', drawnBy: 'SHKWON', checkedBy: 'QA', company: 'MyMechanics', revision: 'A' });
  d.views = d.views.filter((v) => !drop.includes(v.id));
  if (section) d.views.push({ id: 'v-sec', kind: 'section', label: 'A', ...section });
  d.bom = { show: true };
  const bodyOf = new Map(project.parts.map((p) => [p.id, regenerate(p).body]));
  const placed = new Map(flattenAssembly(project, asm).map((leaf) => [leaf.comp.id, placeShape(bodyOf.get(leaf.part), leaf.placement).boundingBox.bounds]));
  const lay = sheetLayout(d, [...placed.values()]);
  const iso = lay.place('v-iso');
  const [W, H] = SHEETS[sheet];
  // Balloons on a ring around the isometric view, each in the direction of its part, spread so none overlap.
  const items = [];
  for (const row of bomRows(asm, project, { lang: 'en' })) {
    const box = placed.get(row.components[0]);
    if (!box) continue;
    const t = lay.at('v-iso', box[0].map((v, i) => (v + box[1][i]) / 2));
    items.push({ item: row.item, t, ang: Math.atan2(t[1] - iso.cy, t[0] - iso.cx) });
  }
  items.sort((p, q) => p.ang - q.ang);
  const gap = Math.min((2 * Math.PI) / Math.max(1, items.length), 0.5);
  for (let i = 1; i < items.length; i++) items[i].ang = Math.max(items[i].ang, items[i - 1].ang + gap);
  const r = Math.hypot(iso.w, iso.h) / 2 + 8;
  for (const it of items) {
    const x = Math.min(W - 16, Math.max(16, iso.cx + Math.cos(it.ang) * r)); const y = Math.min(H - 60, Math.max(16, iso.cy + Math.sin(it.ang) * r));
    ann(d, 'balloon', { item: it.item, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, size: 4.5, target: it.t });
  }
  if (notes) ann(d, 'note', { x: 25, y: H - 42, size: 3.2, text: notes });
  project.active = { kind: 'drawing', id: d.id };
  return project;
}

// ───────────────────────── build

const asmProject = ({ project, asm }) => { project.active = { kind: 'assembly', id: asm.id }; return project; };

const BUILDERS = {
  asmGearReducer: (L) => asmProject(gearReducerModel(L)),
  asmPillowLine: (L) => asmProject(pillowLineModel(L)),
  asmVice: (L) => asmProject(viceModel(L)),
  asmRackSteering: (L) => asmProject(rackSteeringModel(L)),
  asmSliderCrank: (L) => asmProject(sliderCrankModel(L)),
  asmCamFollower: (L) => asmProject(camFollowerModel(L)),
  asmDoorHinge: (L) => asmProject(doorHingeModel(L)),
  asmFlangeJoint: (L) => asmProject(flangeJointModel(L)),
  asmPlanetary: (L) => asmProject(planetaryModel(L)),
  asmRobot: (L) => asmProject(robotModel(L)),
  asmCart: (L) => asmProject(cartModel(L)),
  asmShaftDrawing: (L) => shaftDrawing(L),
  asmHousingDrawing: (L) => housingDrawing(L),
  asmRobotDrawing: (L) => assemblyDrawing(L, robotModel(L), { notes: L('주기\n1. 관절 감속기: 하모닉 드라이브 (J4–J6)\n2. 툴 플랜지 ISO 9409-1-50-4-M6\n3. 케이블은 J1–J3 중공부로 배선', 'NOTES\n1. Joint reducers: harmonic drives (J4–J6)\n2. Tool flange ISO 9409-1-50-4-M6\n3. Route cables through the J1–J3 hollow passages'), sheet: 'A2', drop: ['v-right', 'v-top'] }),
  asmViceDrawing: (L) => assemblyDrawing(L, viceModel(L), { section: { type: 'front', parent: 'v-top', plane: { point: [0, 0, 0], normal: [0, 0, 1] } }, notes: L('주기\n1. 조 판은 연마 후 조립\n2. 이송 나사 Tr16×4 에 그리스 도포', 'NOTES\n1. Grind the jaw plates before assembly\n2. Grease the Tr16×4 lead screw') }),
};

export function build(id, lang) {
  const fn = BUILDERS[id];
  return fn ? fn(T(lang)) : null;
}

