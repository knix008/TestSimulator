// Start-page samples of the "advanced" group: real objects that show the features beyond extrude and
// revolve — helix and sweep, threads, weldments with cut lists, sheet metal with its flat pattern, mold
// tools, surfaces, spline revolves, 3D-sketch sweeps, wraps, lofts, equations and configurations, and a
// part cut by another part of the project.
//
// samples.js imports this module, so nothing from it (or from the modules it imports) is used at the top
// level here: every helper below only runs when a sample is built.
import { builder, centreRect, circle, point, near, dim, component, mate, settle } from '../samples.js';
import { regenerate } from '../features.js';
import { addArc, addLine, addPolygon, addSlot, addText, mergePoints, ORIGIN } from '../sketch.js';
import { addSpline, circularSketchPattern } from '../sketchtools.js';
import { createAssembly, createPart, createProject } from '../document.js';
import { quatFromAxisAngle, quatIdentity, mateEntityOfFace } from '../assembly.js';
import { isCylinder, faceSignature } from '../refs.js';

const G = 'advanced';
export const SAMPLES = [
  { id: 'advSpring', group: G, icon: 'helix', ko: ['압축 스프링 (닫힌·연삭 끝단)', '가변 피치 3D 스플라인 나선 · 스윕 · 연삭 끝단 잘라내기'], en: ['Compression spring (closed, ground ends)', 'Variable-pitch 3D spline helix · sweep · ground-end cuts'] },
  { id: 'advBoltNut', group: G, icon: 'featThread', ko: ['볼트·너트 체결 (M10 나사산)', '나선 스윕 수나사·암나사 · 회전 모따기 · 동심·일치 메이트'], en: ['Bolt and nut joint (M10 threads)', 'Helix-swept external and internal threads · revolved chamfers · concentric and coincident mates'] },
  { id: 'advBikeFrame', group: G, icon: 'structural', ko: ['자전거 프레임', '3D 스케치 · 파이프 구조 부재 (3종) · 절단 목록 · 드롭아웃 대칭'], en: ['Bicycle frame', '3D sketches · pipe members (three sizes) · cut list · mirrored dropouts'] },
  { id: 'advMachineStand', group: G, icon: 'cutList', ko: ['용접 기계 받침대', '각관·직사각관·앵글 부재 · 대칭 복사 · 상판 구멍 패턴'], en: ['Welded machine stand', 'Square / rectangular tube and angle members · mirror · top plate holes'] },
  { id: 'advSheetEnclosure', group: G, icon: 'sheetMetal', ko: ['판금 섀시 케이스', '베이스 플랜지 · 조그 · 스케치 굽힘 · 모서리 플랜지 · 헴 · 펼치기'], en: ['Sheet metal chassis', 'Base flange · jog · sketched bend · edge flanges · hem · flat pattern'] },
  { id: 'advMoldedCover', group: G, icon: 'cavity', ko: ['사출 성형 커버 (코어·캐비티)', '구배 · 쉘 · 보스 · 리브 · 파팅 라인 · 툴링 분할'], en: ['Molded cover (core and cavity)', 'Draft · shell · bosses · rib · parting line · tooling split'] },
  { id: 'advCarBody', group: G, icon: 'surfaceLoft', ko: ['자동차 차체 쉘', '단면 5개 곡면 로프트 · 곡면 자르기 · 붙이기 · 두껍게 · 휠 아치 · 옆 창'], en: ['Car body shell', 'Surface loft through five sections · trim · knit · thicken · wheel arches · side windows'] },
  { id: 'advWineGlass', group: G, icon: 'featDome', ko: ['와인 잔', '스플라인 회전 · 쉘 · 오목 돔 · 필렛'], en: ['Wine glass', 'Spline revolve · shell · concave dome · fillets'] },
  { id: 'advDuctBend', group: G, icon: 'featSweep', ko: ['3D 덕트 벤드', '3D 스플라인 경로 · 링 단면 스윕 · 플랜지 · 볼트 구멍 스케치 패턴 · 필렛'], en: ['3D duct bend', '3D spline path · ring-section sweep · flanges · bolt hole sketch patterns · fillet'] },
  { id: 'advKnob', group: G, icon: 'featWrap', ko: ['각인 노브', '랩 (글자 양각) · 원형 패턴 · 홈 36개 · 돔 · D컷 보어'], en: ['Engraved knob', 'Wrapped lettering emboss · circular patterns · 36 flutes · dome · D bore'] },
  { id: 'advParamBracket', group: G, icon: 'equations', ko: ['파라메트릭 브래킷', '전역 변수 · 수식 · 컨피규레이션 3개 · 디자인 테이블'], en: ['Parametric bracket', 'Global variables · equations · three configurations · design table'] },
  { id: 'advWireHanger', group: G, icon: 'splineTool', ko: ['철사 옷걸이', '3D 스케치 스윕 (닫힌 경로·스플라인 고리) · 꼬임 나선 · 돔'], en: ['Wire coat hanger', '3D sketch sweeps (closed path, spline hook) · twisted helix · dome'] },
  { id: 'advTurbineBlade', group: G, icon: 'featLoft', ko: ['터빈 블레이드', '비틀린 에어포일 로프트 · 전나무 뿌리 · 플랫폼'], en: ['Turbine blade', 'Loft through twisted airfoils · fir-tree root · platform'] },
  { id: 'advMoldInsert', group: G, icon: 'insertPartFeat', ko: ['비누 금형 인서트', '부품 삽입 (캐비티) · 컷 스윕 러너 · 냉각·이젝터 구멍'], en: ['Soap mold insert', 'Insert part (cavity) · cut-sweep runner · cooling and ejector holes'] },
  { id: 'advBottleCap', group: G, icon: 'featCutRevolve', ko: ['병뚜껑', '얇은 회전체 · 나선 스윕 암나사 · 널링 스케치 패턴 · 실링 링'], en: ['Bottle cap', 'Thin revolve · helix-swept internal thread · knurl sketch pattern · sealing ring'] },
];

const TOP = { kind: 'std', name: 'top' };
const FRONT = { kind: 'std', name: 'front' };
const RIGHT = { kind: 'std', name: 'right' };

// ───────────────────────── small helpers

/** A closed chain of lines through `pts`; returns the lines in order. */
function chain(s, pts) {
  const out = [];
  const first = addLine(s, pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
  out.push(first);
  for (let i = 1; i < pts.length; i++) {
    const b = pts[(i + 1) % pts.length];
    const last = i === pts.length - 1;
    out.push(addLine(s, 0, 0, b[0], b[1], { from: out.at(-1).p2, ...(last ? { to: first.p1 } : {}) }));
  }
  return out;
}

/** A construction axis line (for revolves) from (x1,y1) to (x2,y2). */
const axis = (s, x1, y1, x2, y2) => addLine(s, x1, y1, x2, y2, { construction: true });

/** A circle at (x, y) with its diameter and its centre's position from the origin dimensioned. */
function circleAt(s, x, y, d) {
  const c = circle(s, x, y, d);
  if (x || y) {
    dim(s, { type: 'hdistance', a: ORIGIN, b: c.id, value: x });
    dim(s, { type: 'vdistance', a: ORIGIN, b: c.id, value: y });
  }
  return c;
}

const radial = (p) => Math.hypot(p[0], p[2]);
const single = (name, part) => {
  const project = createProject({ name, kind: 'none' });
  project.parts.push(part);
  project.active = { kind: 'part', id: part.id };
  return project;
};

// ───────────────────────── 1. compression spring

function spring(T) {
  const b = builder(createPart(T('압축 스프링', 'Compression spring'), { material: 'steel-4340', partNo: 'SP-D30-W3-L51', description: T('닫힌·연삭 끝단, 유효 5권', 'Closed and ground ends, 5 active coils') }));
  // Outer spring: a helix whose pitch closes up at both ends (3.2 → 9 → 3.2), as a 3D spline through its points.
  const r = 15; const turns = 7; const per = 12;
  const pitchAt = (t) => { const a = Math.min(1, Math.max(0, t - 0.6) / 0.8); const z = Math.min(1, Math.max(0, turns - 0.6 - t) / 0.8); return 3.2 + (9 - 3.2) * Math.min(a, z); };
  const pts = []; let y = 0;
  for (let i = 0; i <= turns * per; i++) {
    const t = i / per;
    if (i) y += pitchAt(t - 0.5 / per) / per;
    pts.push([r * Math.cos(2 * Math.PI * t), y, -r * Math.sin(2 * Math.PI * t)].map((v) => Math.round(v * 1000) / 1000));
  }
  const height = pts.at(-1)[1];
  const path = b.add('sketch3d', { points: pts, spline: true, name: T('3D스케치-가변 피치 나선', '3DSketch-VariablePitchHelix') });
  const wire = b.sketch('front', (k) => circleAt(k, r, 0, 3), T('스케치-선재', 'Sketch-Wire'));
  b.add('sweep', { sketch: wire.id, path: path.id, frenet: true });
  // Ground ends: ground flat, square to the axis.
  const g1 = b.sketch('top', (k) => centreRect(k, 50, 50), T('스케치-아래 연삭', 'Sketch-GrindBottom'));
  b.add('extrude', { sketch: g1.id, op: 'cut', depth: 5 });
  const p4 = b.plane('top', height);
  const g2 = b.sketch(p4, (k) => centreRect(k, 50, 50), T('스케치-위 연삭', 'Sketch-GrindTop'));
  b.add('extrude', { sketch: g2.id, op: 'cut', depth: 5, reverse: true });
  return b.part;
}

// ───────────────────────── 2. bolt and nut

function threadedBolt(T) {
  const b = builder(createPart(T('육각 볼트 M10×25', 'Hex bolt M10×25'), { material: 'steel-4340', partNo: 'KS-B1002-M10x25', description: T('강도 8.8, 나사 길이 14', 'Grade 8.8, thread length 14') }));
  const head = b.sketch('top', (k) => addPolygon(k, 0, 0, 16 / Math.sqrt(3), 6, 0), T('스케치-머리', 'Sketch-Head'));
  b.add('extrude', { sketch: head.id, depth: 6.4 });
  // The 30° chamfer of the head's corners (a cut revolve, as the standard draws it).
  const ch = b.sketch('front', (k) => { chain(k, [[7.6, 6.41], [9.6, 6.41], [9.6, 6.41 - 2 * Math.tan(Math.PI / 6)]]); axis(k, 0, -50, 0, 20); });
  b.add('revolve', { sketch: ch.id, op: 'cut' });
  // Plain shank under the head, the threaded length at the minor diameter.
  const shank = b.sketch('top', (k) => circle(k, 0, 0, 10), T('스케치-몸통', 'Sketch-Shank'));
  b.add('extrude', { sketch: shank.id, depth: 9, reverse: true });
  b.add('fillet', { radius: 0.5, edges: b.edges((e) => e.type === 'CIRCLE' && near(e.mid[1], 0) && near(radial(e.mid), 5, 0.01)) });
  const core = b.plane('top', -9);
  const minor = b.sketch(core, (k) => circle(k, 0, 0, 8.4), T('스케치-골지름', 'Sketch-MinorDiameter'));
  b.add('extrude', { sketch: minor.id, depth: 16, reverse: true });
  b.add('chamfer', { distance: 0.6, edges: b.edges((e) => e.type === 'CIRCLE' && near(e.mid[1], -25)) });
  // The external thread: its 60° ridge swept along a helix (pitch 1.5, nine turns).
  const hp = b.plane('top', -24.25);
  const hx = b.add('helix', { plane: hp, radius: 4.6, pitch: 1.5, turns: 9 });
  const rp = b.sketch('front', (k) => chain(k, [[4.1, -24.95], [5, -24.4], [5, -24.1], [4.1, -23.55]]), T('스케치-나사산', 'Sketch-ThreadRidge'));
  b.add('sweep', { sketch: rp.id, path: hx.id, frenet: true });
  return b.part;
}

function threadedNut(T) {
  const b = builder(createPart(T('육각 너트 M10', 'Hex nut M10'), { material: 'steel-4340', partNo: 'KS-B1012-M10', description: T('암나사 M10×1.5', 'Internal thread M10×1.5') }));
  const s = b.sketch('top', (k) => { addPolygon(k, 0, 0, 16 / Math.sqrt(3), 6, 0); circle(k, 0, 0, 10); });
  b.add('extrude', { sketch: s.id, depth: 8 });
  // The 30° corner chamfers on both faces.
  const ch = b.sketch('front', (k) => {
    const c = 2 * Math.tan(Math.PI / 6);
    chain(k, [[7.6, 8.01], [9.6, 8.01], [9.6, 8.01 - c]]);
    chain(k, [[7.6, -0.01], [9.6, -0.01 + c], [9.6, -0.01]]);
    axis(k, 0, -10, 0, 20);
  });
  b.add('revolve', { sketch: ch.id, op: 'cut' });
  // The internal thread: its ridge (a trapezoid) swept along a helix inside the bore.
  const hp = b.plane('top', 0.75);
  const hx = b.add('helix', { plane: hp, radius: 4.6, pitch: 1.5, turns: 4.3 });
  const rp = b.sketch('front', (k) => chain(k, [[5.1, 0.05], [5.1, 1.45], [4.2, 0.9], [4.2, 0.6]]), T('스케치-나사산', 'Sketch-ThreadRidge'));
  b.add('sweep', { sketch: rp.id, path: hx.id, frenet: true });
  return b.part;
}

function plainWasher(T) {
  const b = builder(createPart(T('평와셔 M10', 'Plain washer M10'), { material: 'steel-1020', partNo: 'KS-B1326-10' }));
  const s = b.sketch('top', (k) => { circle(k, 0, 0, 20); circle(k, 0, 0, 10.5); });
  b.add('extrude', { sketch: s.id, depth: 2 });
  b.add('chamfer', { distance: 0.3, edges: b.edges((e) => e.type === 'CIRCLE' && near(radial(e.mid), 10, 0.01)) });
  return b.part;
}

function clampPlate(T) {
  const b = builder(createPart(T('클램프 판', 'Clamp plate'), { material: 'al-6061', partNo: 'ADV-CP-60' }));
  const s = b.sketch('top', (k) => { centreRect(k, 60, 40); circle(k, 0, 0, 11); });
  b.add('extrude', { sketch: s.id, depth: 6 });
  b.add('fillet', { radius: 5, edges: b.edges((e) => Math.abs(e.dir[1]) > 0.99 && Math.abs(e.mid[0]) > 29) });
  b.add('chamfer', { distance: 0.8, edges: b.edges((e) => e.type === 'CIRCLE' && near(radial(e.mid), 5.5, 0.01)) });
  const slots = b.sketch('top', (k) => { addSlot(k, -22, -8, -22, 8, 3.3); addSlot(k, 22, -8, 22, 8, 3.3); });
  b.add('extrude', { sketch: slots.id, op: 'cut', end: 'throughBoth' });
  return b.part;
}

function boltNut(T, name) {
  const project = createProject({ name, kind: 'none' });
  const plate = clampPlate(T); const bolt = threadedBolt(T); const washer = plainWasher(T); const nut = threadedNut(T);
  project.parts.push(plate, bolt, washer, nut);
  const asm = createAssembly(name);
  // The bolt's thread is engaged in the nut's: those solids share the thread flanks.
  asm.allowInterference = true;
  project.assemblies.push(asm);
  const cP = component(asm, plate, [0, 0, 0], quatIdentity(), true);
  const cB = component(asm, bolt, [6, 30, 4], quatFromAxisAngle([0, 0, 1], 6));
  const cW = component(asm, washer, [-4, -12, 3]);
  const cN = component(asm, nut, [3, -30, -5], quatFromAxisAngle([0, 1, 0], 20));
  // Each part built once for all its mate references (faceEntity would rebuild it every time).
  const built = new Map();
  const faceEntity = (part, comp, test) => {
    if (!built.has(part.id)) {
      // Up to the thread: the faces the mates use are already there (and the thread is the slow part).
      const upTo = part.features.findIndex((f) => f.type === 'helix');
      built.set(part.id, regenerate(part, upTo < 0 ? {} : { upTo }).body);
    }
    const face = built.get(part.id).faces.find((f) => test(faceSignature(f)));
    if (!face) throw new Error(`sample: face not found in ${part.name}`);
    return { comp, ...mateEntityOfFace(face, faceSignature) };
  };
  const plane = (y, up) => (f) => f.type === 'PLANE' && near(f.center[1], y) && (up ? f.normal[1] > 0.99 : f.normal[1] < -0.99);
  const hole = faceEntity(plate, cP.id, (f) => isCylinder(f.type) && near(f.radius ?? 0, 5.5, 0.01));
  mate(asm, 'concentric', hole, faceEntity(bolt, cB.id, (f) => isCylinder(f.type) && near(f.radius ?? 0, 5, 0.01)));
  mate(asm, 'coincident', faceEntity(plate, cP.id, plane(6, true)), faceEntity(bolt, cB.id, (f) => plane(0, false)(f) && f.area > 50));
  mate(asm, 'concentric', hole, faceEntity(washer, cW.id, (f) => isCylinder(f.type) && near(f.radius ?? 0, 5.25, 0.01)));
  mate(asm, 'coincident', faceEntity(plate, cP.id, plane(0, false)), faceEntity(washer, cW.id, plane(2, true)));
  mate(asm, 'concentric', hole, faceEntity(nut, cN.id, (f) => isCylinder(f.type) && near(f.radius ?? 0, 5, 0.01)));
  mate(asm, 'coincident', faceEntity(washer, cW.id, plane(0, false)), faceEntity(nut, cN.id, plane(8, true)));
  settle(project, asm);
  project.active = { kind: 'assembly', id: asm.id };
  return project;
}

// ───────────────────────── 3. bicycle frame

const normalize3 = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };

function bikeFrame(T) {
  const b = builder(createPart(T('자전거 프레임', 'Bicycle frame'), { material: 'al-6061', partNo: 'BK-FR-540', description: T('다이아몬드 프레임 54 cm', 'Diamond frame, 54 cm') }));
  const BB = [0, 0, 0]; const seat = [-160, 520, 0]; const headTop = [420, 560, 0]; const headBot = [465, 422, 0];
  const along = (p, q, k) => { const d = normalize3([q[0] - p[0], q[1] - p[1], q[2] - p[2]]); return [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k].map((v) => Math.round(v * 1000) / 1000); };
  const seatTop = along(BB, seat, Math.hypot(seat[0], seat[1]) + 40);
  const headUp = along(headBot, headTop, Math.hypot(headTop[0] - headBot[0], headTop[1] - headBot[1]) + 20);
  const headDown = along(headTop, headBot, Math.hypot(headTop[0] - headBot[0], headTop[1] - headBot[1]) + 18);
  // Bottom bracket shell across the frame, and the dropouts (left plate mirrored to the right).
  const bb = b.sketch('front', (k) => { circle(k, 0, 0, 42); circle(k, 0, 0, 34); }, T('스케치-BB 셸', 'Sketch-BBShell'));
  b.add('extrude', { sketch: bb.id, end: 'midplane', depth: 68 });
  const pl = b.plane('front', 62);
  const drop = b.sketch(pl, (k) => { addSlot(k, -415, 30, -385, 55, 14); addSlot(k, -405, 40, -420, 40, 5); }, T('스케치-드롭아웃', 'Sketch-Dropout'));
  const dropout = b.add('extrude', { sketch: drop.id, end: 'midplane', depth: 6 });
  b.add('mirror', { seeds: [dropout.id], plane: FRONT });
  // Rear triangle as one 3D sketch: chain stay and seat stay on the left, the seat stay bridge, and down the right.
  const axle = (z) => [-405, 40, z];
  const rear = b.add('sketch3d', { points: [[-20, 0, 24], axle(62), [-150, 492, 14], [-150, 492, -14], axle(-62), [-20, 0, -24]], name: T('3D스케치-뒤삼각', '3DSketch-RearTriangle') });
  b.add('structural', { sketch: rear.id, profile: 'pipe', w: 19, t: 1.4 });
  // Down tube and seat tube as one 3D sketch (one profile, two members); the top tube, the head tube.
  const main = b.add('sketch3d', { points: [headBot, BB, seatTop], name: T('3D스케치-다운·시트', '3DSketch-Down+Seat') });
  b.add('structural', { sketch: main.id, profile: 'pipe', w: 34.9, t: 1.6 });
  const topTube = b.add('sketch3d', { points: [seat, headTop], name: T('3D스케치-탑튜브', '3DSketch-TopTube') });
  b.add('structural', { sketch: topTube.id, profile: 'pipe', w: 31.8, t: 1.4 });
  const head = b.add('sketch3d', { points: [headUp, headDown], name: T('3D스케치-헤드', '3DSketch-HeadTube') });
  b.add('structural', { sketch: head.id, profile: 'pipe', w: 44, t: 3 });
  return b.part;
}

// ───────────────────────── 4. welded machine stand

function machineStand(T) {
  const b = builder(createPart(T('용접 기계 받침대', 'Welded machine stand'), { material: 'steel-1020', partNo: 'WS-800x500', description: T('800×500×742, 상판 12t', '800×500×742, 12 mm top plate') }));
  const X = 380; const Z = 230; const H = 730;
  // Top plate with rounded corners and a grid of counterbored mounting holes.
  const pt = b.plane('top', H);
  const plate = b.sketch(pt, (k) => centreRect(k, 840, 540), T('스케치-상판', 'Sketch-TopPlate'));
  b.add('extrude', { sketch: plate.id, depth: 12 });
  b.add('fillet', { radius: 20, edges: b.edges((e) => Math.abs(e.dir[1]) > 0.99 && near(Math.abs(e.mid[0]), 420) && near(Math.abs(e.mid[2]), 270)) });
  const ptop = b.plane('top', H + 12);
  const hs = b.sketch(ptop, (k) => point(k, -300, 150));
  const hole = b.add('hole', { sketch: hs.id, kind: 'counterbore', diameter: 11, cbDiameter: 18, cbDepth: 6.5, through: true });
  b.add('linearPattern', { seeds: [hole.id], direction: { kind: 'axis', axis: 'x' }, spacing: 200, count: 4, direction2: { kind: 'axis', axis: 'z' }, spacing2: 300, count2: 2 });
  // Levelling foot pads under the legs, each with two anchor holes.
  const pads = b.sketch('top', (k) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const c = [sx * X, -sz * Z]; chain(k, [[c[0] - 45, c[1] - 45], [c[0] + 45, c[1] - 45], [c[0] + 45, c[1] + 45], [c[0] - 45, c[1] + 45]]); } }, T('스케치-발판', 'Sketch-FootPads'));
  b.add('extrude', { sketch: pads.id, depth: 10, reverse: true });
  const under = b.add('plane', { base: TOP, offset: -10, flip: true });
  const ah = b.sketch({ kind: 'ref', id: under.id }, (k) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) { point(k, sx * X + 34, sz * Z + 34); point(k, sx * X - 34, sz * Z - 34); } });
  b.add('hole', { sketch: ah.id, diameter: 13, depth: 10, through: false });
  const pf = b.plane('front', Z);
  // Legs: square tube, on the front frame plane, mirrored to the back.
  const legs = b.sketch(pf, (k) => { addLine(k, -X, 0, -X, H); addLine(k, X, 0, X, H); }, T('스케치-다리', 'Sketch-Legs'));
  const legF = b.add('structural', { sketch: legs.id, profile: 'squareTube', w: 50, t: 3 });
  b.add('mirror', { seeds: [legF.id], plane: FRONT });
  // Long rails (rectangular tube, standing up) at the top and near the floor.
  const rails = b.sketch(pf, (k) => { addLine(k, -X + 20, H - 25, X - 20, H - 25); addLine(k, -X + 20, 150, X - 20, 150); }, T('스케치-가로대', 'Sketch-Rails'));
  const railF = b.add('structural', { sketch: rails.id, profile: 'rectTube', w: 40, h: 60, t: 3 });
  b.add('mirror', { seeds: [railF.id], plane: FRONT });
  // Short rails across the ends (right plane: sketch x runs along −Z).
  const pr = b.plane('right', X);
  const ends = b.sketch(pr, (k) => { addLine(k, -Z + 20, H - 25, Z - 20, H - 25); addLine(k, -Z + 20, 150, Z - 20, 150); }, T('스케치-측면대', 'Sketch-EndRails'));
  const endF = b.add('structural', { sketch: ends.id, profile: 'squareTube', w: 40, t: 3 });
  b.add('mirror', { seeds: [endF.id], plane: RIGHT });
  // Back cross bracing in angle iron.
  const pb = b.plane('front', -Z + 10);
  const brace = b.sketch(pb, (k) => { addLine(k, -X + 25, 180, X - 25, H - 55); addLine(k, -X + 25, H - 55, X - 25, 180); }, T('스케치-가새', 'Sketch-Braces'));
  b.add('structural', { sketch: brace.id, profile: 'angle', w: 40, h: 40, t: 4 });
  return b.part;
}

// ───────────────────────── 5. sheet metal chassis

function sheetEnclosure(T) {
  const b = builder(createPart(T('판금 섀시', 'Sheet metal chassis'), { material: 'al-6061', partNo: 'SM-CH-240', description: T('두께 1.5, 굽힘 반지름 1.5, K 0.44', 't 1.5, bend radius 1.5, K 0.44') }));
  const t = 1.5;
  const base = b.sketch('top', (k) => centreRect(k, 240, 160), T('스케치-베이스', 'Sketch-Base'));
  b.add('baseFlange', { sketch: base.id, thickness: t, radius: 1.5, kFactor: 0.44 });
  // A raised step at the left end (jog), a back wall at the right end (sketched bend).
  const jogLine = b.sketch('top', (k) => addLine(k, -90, -100, -90, 100), T('스케치-조그', 'Sketch-JogLine'));
  b.add('jog', { sketch: jogLine.id, height: 10 });
  const bendLine = b.sketch('top', (k) => addLine(k, 80, -100, 80, 100), T('스케치-굽힘선', 'Sketch-BendLine'));
  b.add('sketchedBend', { sketch: bendLine.id, angle: 90, flip: true });
  // Side walls on the long edges of the floor between the step and the back wall.
  const longEdge = (sz) => (e) => e.type === 'LINE' && near(e.mid[1], t, 1e-3) && near(e.mid[2], sz * 80, 1e-3) && Math.abs(e.dir[0]) > 0.99 && e.mid[0] > -90 && e.mid[0] < 80;
  b.add('edgeFlange', { edge: b.edges(longEdge(1))[0], length: 45, angle: 90 });
  b.add('edgeFlange', { edge: b.edges(longEdge(-1))[0], length: 45, angle: 90 });
  // Open hem on the free end of the raised step.
  b.add('hem', { edge: b.edges((e) => e.type === 'LINE' && Math.abs(e.dir[2]) > 0.99 && e.mid[0] < -120 && e.mid[1] > 10)[0], kind: 'open', gap: 1, length: 12 });
  // Vent slots in the floor and connector cut-outs through the side walls.
  const vent = b.sketch('top', (k) => addSlot(k, -50, -50, -50, 50, 3), T('스케치-통풍구', 'Sketch-Vent'));
  const v = b.add('extrude', { sketch: vent.id, op: 'cut', end: 'throughBoth' });
  b.add('linearPattern', { seeds: [v.id], direction: { kind: 'axis', axis: 'x' }, spacing: 16, count: 7 });
  const io = b.sketch('front', (k) => { circleAt(k, -50, 28, 12); circleAt(k, -25, 28, 12); chain(k, [[0, 20], [40, 20], [40, 36], [0, 36]]); }, T('스케치-커넥터', 'Sketch-Connectors'));
  b.add('extrude', { sketch: io.id, op: 'cut', end: 'throughBoth' });
  return b.part;
}

// ───────────────────────── 6. molded cover with core and cavity

function moldedCover(T) {
  const b = builder(createPart(T('계기 커버', 'Instrument cover'), { material: 'abs', color: '#3d4a5c', partNo: 'MD-CV-100', description: T('살 두께 2, 구배 3°', 'Wall 2 mm, 3° draft') }));
  const body = b.sketch('top', (k) => centreRect(k, 100, 64));
  b.add('extrude', { sketch: body.id, depth: 28 });
  b.add('draft', { angle: 3, neutral: TOP, faces: b.faces((f) => f.type === 'PLANE' && Math.abs(f.normal[1]) < 0.01) });
  b.add('fillet', { radius: 10, edges: b.edges((e) => e.type === 'LINE' && Math.abs(e.dir[1]) > 0.95) });
  b.add('fillet', { radius: 4, edges: b.edges((e) => near(e.mid[1], 28, 1e-3)) });
  b.add('shell', { thickness: 2, faces: b.faces((f) => f.type === 'PLANE' && near(f.center[1], 0) && f.normal[1] < -0.99) });
  // Screw bosses under the top (drafted) and a stiffening rib across.
  const bosses = b.sketch('top', (k) => { for (const [x, z] of [[-36, -20], [36, -20], [-36, 20], [36, 20]]) { circle(k, x, z, 8); circle(k, x, z, 3.2); } });
  b.add('extrude', { sketch: bosses.id, depth: 26.5, draft: true, draftAngle: 0.5 });
  const rib = b.sketch('front', (k) => addLine(k, -28, 16, 28, 16));
  b.add('rib', { sketch: rib.id, thickness: 1.5 });
  // A window for the display and a button hole in the top.
  const pTop = b.plane('top', 28);
  const win = b.sketch(pTop, (k) => { chain(k, [[-30, -12], [6, -12], [6, 12], [-30, 12]]); circleAt(k, 24, 0, 12); });
  b.add('extrude', { sketch: win.id, op: 'cut', depth: 6 });
  // Mold tools: the parting line at the open rim, then the core and cavity blocks around the part.
  b.add('partingLine', { dir: 'y' });
  b.add('toolingSplit', { dir: 'y', margin: 12, gap: 45, show: 'both', keepPart: true });
  return b.part;
}

// ───────────────────────── 7. car body from surfaces

function carBody(T) {
  const b = builder(createPart(T('자동차 차체', 'Car body shell'), { material: 'steel-1020', color: '#b8322f', partNo: 'CB-1-10', description: T('1:10 축척 차체 쉘, 두께 2', '1:10 body shell, 2 mm skin') }));
  // Cross-sections along the car (right plane: sketch x runs along −Z, y is up): half width, floor, belt line,
  // roof height and roof half width.
  const sections = [
    [-215, { w: 62, f: 20, b: 64, top: 80, rw: 48 }],
    [-140, { w: 74, f: 18, b: 76, top: 104, rw: 52 }],
    [-20, { w: 80, f: 18, b: 80, top: 134, rw: 58 }],
    [120, { w: 78, f: 18, b: 72, top: 92, rw: 60 }],
    [215, { w: 64, f: 22, b: 52, top: 60, rw: 50 }],
  ];
  const ids = sections.map(([x, s], i) => {
    const pl = b.plane('right', x);
    const pts = [[0, s.f], [s.w, s.f + 10], [s.w, s.b], [s.rw * 0.7, s.top - 4], [0, s.top]];
    const loop = [...pts, ...pts.slice(1, -1).reverse().map(([u, y]) => [-u, y])];
    return b.sketch(pl, (k) => addSpline(k, loop, { closed: true }), T(`단면 ${i + 1}`, `Section ${i + 1}`)).id;
  });
  const skin = b.add('surfaceLoft', { sketches: ids, ruled: true });
  // Trim the underside off and knit the skin into one surface, then give it its thickness.
  const trim = b.add('trimSurface', { surface: skin.id, plane: { kind: 'ref', id: b.plane('top', 30).id }, keep: 'above' });
  const knit = b.add('knit', { surfaces: [trim.id], solid: false });
  b.add('thicken', { surface: knit.id, thickness: 2, side: 'in' });
  // Wheel arches, and the side windows, cut through both sides at once (the roof is higher than the windows).
  const arches = b.sketch('front', (k) => { circleAt(k, -140, 30, 70); circleAt(k, 140, 30, 70); }, T('스케치-휠 아치', 'Sketch-WheelArches'));
  b.add('extrude', { sketch: arches.id, op: 'cut', end: 'throughBoth' });
  const win = b.sketch('front', (k) => { chain(k, [[-120, 90], [70, 90], [-18, 122], [-100, 112]]); }, T('스케치-옆 창', 'Sketch-SideWindows'));
  b.add('extrude', { sketch: win.id, op: 'cut', end: 'throughBoth' });
  return b.part;
}

// ───────────────────────── 8. wine glass

function wineGlass(T) {
  const b = builder(createPart(T('와인 잔', 'Wine glass'), { material: 'glass', partNo: 'GL-WG-450', description: T('용량 약 450 ml', 'About 450 ml') }));
  // Bowl: a spline profile revolved, then shelled open at the rim.
  const bowl = b.sketch('front', (k) => {
    const l0 = addLine(k, 0, 95, 8, 95);
    const sp = addSpline(k, [[8, 95], [24, 99], [38, 116], [43, 146], [40, 176], [35, 200]], { ids: [l0.p2] });
    const l1 = addLine(k, 0, 0, 0, 200, { from: sp.pts.at(-1) });
    addLine(k, 0, 0, 0, 0, { from: l1.p2, to: l0.p1 });
    axis(k, 0, -10, 0, 220);
  }, T('스케치-볼', 'Sketch-Bowl'));
  b.add('revolve', { sketch: bowl.id });
  b.add('shell', { thickness: 1.6, faces: b.faces((f) => f.type === 'PLANE' && near(f.center[1], 200)) });
  b.add('fillet', { radius: 0.7, edges: b.edges((e) => e.type === 'CIRCLE' && near(e.mid[1], 200)) });
  // Stem and foot (spline profiles), fused under the bowl.
  const stem = b.sketch('front', (k) => {
    const sp = addSpline(k, [[4.6, 10], [3.6, 45], [4.2, 80], [9, 96]]);
    const l1 = addLine(k, 0, 0, 0, 96, { from: sp.pts.at(-1) });
    const l2 = addLine(k, 0, 0, 0, 10, { from: l1.p2 });
    addLine(k, 0, 0, 0, 0, { from: l2.p2, to: sp.pts[0] });
    axis(k, 0, -10, 0, 220);
  }, T('스케치-스템', 'Sketch-Stem'));
  b.add('revolve', { sketch: stem.id });
  const foot = b.sketch('front', (k) => {
    const l0 = addLine(k, 0, 0, 38, 0);
    const l1 = addLine(k, 0, 0, 38, 1.8, { from: l0.p2 });
    const sp = addSpline(k, [[38, 1.8], [22, 3.6], [9, 7], [4.8, 12]], { ids: [l1.p2] });
    const l2 = addLine(k, 0, 0, 0, 12, { from: sp.pts.at(-1) });
    addLine(k, 0, 0, 0, 0, { from: l2.p2, to: l0.p1 });
    axis(k, 0, -10, 0, 220);
  }, T('스케치-받침', 'Sketch-Foot'));
  b.add('revolve', { sketch: foot.id });
  // A shallow kick-up under the foot (a concave dome) and the rounded foot edge.
  b.add('dome', { faces: b.faces((f) => f.type === 'PLANE' && near(f.center[1], 0) && f.normal[1] < -0.99), height: 1.1, reverse: true });
  b.add('fillet', { radius: 0.6, edges: b.edges((e) => e.type === 'CIRCLE' && near(radial(e.mid), 38, 0.01) && e.mid[1] > 1) });
  return b.part;
}

// ───────────────────────── 9. 3D duct bend

function ductBend(T) {
  const b = builder(createPart(T('덕트 벤드', 'Duct bend'), { material: 'stainless-304', partNo: 'DT-40-3D', description: T('관 40×3, 3D 경로', 'Tube 40×3 on a 3D path') }));
  // Flanges first: the bottom one (horizontal) and the side one (facing +X), bored and drilled for four bolts.
  const flange = (k, cx, cy) => {
    circleAt(k, cx, cy, 90); circleAt(k, cx, cy, 34);
    const h = circleAt(k, cx + 33, cy, 9);
    circularSketchPattern(k, [h.id], { cx, cy, count: 4 });
  };
  const f1 = b.sketch('top', (k) => flange(k, 0, 0), T('스케치-바닥 플랜지', 'Sketch-BaseFlange'));
  b.add('extrude', { sketch: f1.id, depth: 10, reverse: true });
  const sidePlane = b.plane('right', 185);
  const f2 = b.sketch(sidePlane, (k) => flange(k, -80, 160), T('스케치-옆 플랜지', 'Sketch-SideFlange'));
  b.add('extrude', { sketch: f2.id, depth: 10 });
  // The tube: a ring swept along a 3D spline that leaves the bottom flange straight up and runs into the side one.
  const path = b.add('sketch3d', { points: [[0, 0, 0], [0, 50, 0], [40, 130, 40], [130, 160, 80], [200, 160, 80]], spline: true, name: T('3D스케치-경로', '3DSketch-Path') });
  const ring = b.sketch('top', (k) => { circle(k, 0, 0, 40); circle(k, 0, 0, 34); }, T('스케치-관 단면', 'Sketch-TubeSection'));
  b.add('sweep', { sketch: ring.id, path: path.id });
  // Cut flush with the side flange's face, and a fillet where the tube meets the bottom flange.
  const face = b.plane('right', 195);
  const trim = b.sketch(face, (k) => chain(k, [[-160, 90], [0, 90], [0, 230], [-160, 230]]));
  b.add('extrude', { sketch: trim.id, op: 'cut', depth: 30, reverse: true });
  // (The tube's rim on the flange: two half circles, given by their signatures so the part is not rebuilt here.)
  const half = (z, dx) => ({ type: 'BSPLINE_CURVE', mid: [0, 0, z], dir: [dx, 0, 0], length: 62.831853, start: [-20 * dx, 0, 0], end: [20 * dx, 0, 0] });
  b.add('fillet', { radius: 3, edges: [half(-20, 1), half(20, -1)] });
  return b.part;
}

// ───────────────────────── 10. engraved knob

/** Block letters "VOL" (closed outlines, 6 high) with their lower-left corner at (x, y). */
function blockVol(k, x, y) {
  const at = (pts) => chain(k, pts.map(([u, v]) => [x + u, y + v]));
  at([[0, 6], [1.3, 6], [2.2, 1.7], [3.1, 6], [4.4, 6], [2.8, 0], [1.6, 0]]);
  at([[5.2, 0], [9.2, 0], [9.2, 6], [5.2, 6]]);
  at([[6.4, 1.2], [8, 1.2], [8, 4.8], [6.4, 4.8]]);
  at([[10, 0], [13.6, 0], [13.6, 1.2], [11.2, 1.2], [11.2, 6], [10, 6]]);
}

function knob(T) {
  const b = builder(createPart(T('볼륨 노브', 'Volume knob'), { material: 'al-6061', color: '#3a3f47', partNo: 'KN-50-D6', description: T('D컷 6 mm 축용', 'For a 6 mm D shaft') }));
  const prof = b.sketch('front', (k) => { chain(k, [[0, 0], [25, 0], [25, 24], [23, 26], [0, 26]]); axis(k, 0, -5, 0, 40); }, T('스케치-몸체', 'Sketch-Body'));
  b.add('revolve', { sketch: prof.id });
  b.add('chamfer', { distance: 0.8, edges: b.edges((e) => e.type === 'CIRCLE' && near(e.mid[1], 0) && near(radial(e.mid), 25, 0.01)) });
  // Lettering wrapped on the smooth band (laid on the cylinder by arc length), three times round.
  const tp = b.plane('front', 30);
  const txt = b.sketch(tp, (k) => blockVol(k, -6.8, 15.5), T('스케치-글자', 'Sketch-Lettering'));
  const wrap = b.add('wrap', { sketch: txt.id, face: b.faces((f) => isCylinder(f.type) && near(f.radius ?? 0, 25, 0.01))[0], depth: 0.5, op: 'emboss' });
  b.add('circularPattern', { seeds: [wrap.id], axis: { kind: 'axis', axis: 'y' }, count: 3 });
  // Domed top with a pointer groove.
  b.add('dome', { faces: b.faces((f) => f.type === 'PLANE' && near(f.center[1], 26)), height: 3 });
  const pp = b.plane('top', 29.5);
  const ptr = b.sketch(pp, (k) => addSlot(k, 8, 0, 18, 0, 1), T('스케치-표시선', 'Sketch-Pointer'));
  b.add('extrude', { sketch: ptr.id, op: 'cut', depth: 3 });
  // Grip flutes round the skirt: one flute sketched, 36 by a circular sketch pattern, cut at once.
  const fl = b.sketch('top', (k) => { const c = circleAt(k, 25.6, 0, 3); circularSketchPattern(k, [c.id], { count: 36 }); }, T('스케치-홈', 'Sketch-Flutes'));
  b.add('extrude', { sketch: fl.id, op: 'cut', depth: 12, reverse: true });
  // D bore for the shaft and a set screw hole.
  const bore = b.sketch('top', (k) => {
    const a0 = Math.atan2(Math.sqrt(5), 2);
    const a = addArc(k, 0, 0, 3, a0, 2 * Math.PI - a0);
    addLine(k, 0, 0, 0, 0, { from: a.p1, to: a.p2 });
  }, T('스케치-D컷', 'Sketch-DBore'));
  b.add('extrude', { sketch: bore.id, op: 'cut', depth: 16, reverse: true });
  const side = b.plane('right', 25);
  const ss = b.sketch(side, (k) => point(k, 0, 6));
  b.add('hole', { sketch: ss.id, diameter: 2.5, depth: 24, through: false });
  return b.part;
}

// ───────────────────────── 11. parametric bracket

function paramBracket(T) {
  const part = createPart(T('파라메트릭 브래킷', 'Parametric bracket'), { material: 'steel-1020', partNo: 'PB-{L}x{W}', description: T('모든 치수가 전역 변수에서', 'Every size from the global variables') });
  part.variables = [
    { name: 'L', expr: '100' }, { name: 'W', expr: '80' }, { name: 'H', expr: '70' }, { name: 'T', expr: '8' },
    { name: 'D', expr: '9' }, { name: 'E', expr: '15' }, { name: 'N', expr: '3' },
    { name: 'P', expr: '(W - 2 * E) / (N - 1)' }, { name: 'RF', expr: 'T' }, { name: 'GT', expr: 'round(T * 0.75 * 10) / 10' },
  ];
  const b = builder(part);
  // The L section on the front plane: every length driven by an equation.
  const sec = b.sketch('front', (k) => {
    const ls = chain(k, [[0, 0], [100, 0], [100, 8], [8, 8], [8, 70], [0, 70]]);
    mergePoints(k, ls[0].p1, ORIGIN);
    ['horizontal', 'vertical', 'horizontal', 'vertical', 'horizontal', 'vertical'].forEach((type, i) => dim(k, { type, a: ls[i].id }));
    const d = (line, value, expr, name) => { const c = dim(k, { type: 'distance', a: line.id, value }); c.expr = expr; c.name = name; };
    d(ls[0], 100, 'L', 'D1'); d(ls[5], 70, 'H', 'D2'); d(ls[1], 8, 'T', 'D3'); d(ls[4], 8, 'T', 'D4');
  }, T('스케치-단면', 'Sketch-Section'));
  b.add('extrude', { sketch: sec.id, end: 'midplane', depth: 80, exprs: { depth: 'W' } });
  b.add('fillet', { radius: 8, exprs: { radius: 'RF' }, edges: b.edges((e) => e.type === 'LINE' && near(e.mid[0], 8) && near(e.mid[1], 8)) });
  b.add('fillet', { radius: 16, exprs: { radius: 'RF + T' }, edges: b.edges((e) => e.type === 'LINE' && near(e.mid[0], 0) && near(e.mid[1], 0)) });
  // Gusset in the middle (rib), its ends placed by equations.
  const g = b.sketch('front', (k) => {
    const l = addLine(k, 8, 55, 70, 8);
    const at = (p, type, value, expr) => { const c = dim(k, { type, a: ORIGIN, b: p, value }); c.expr = expr; };
    at(l.p1, 'hdistance', 8, 'T'); at(l.p1, 'vdistance', 55, 'H - E');
    at(l.p2, 'hdistance', 70, 'L - 2 * E'); at(l.p2, 'vdistance', 8, 'T');
  }, T('스케치-리브', 'Sketch-Gusset'));
  b.add('rib', { sketch: g.id, thickness: 6, exprs: { thickness: 'GT' } });
  // Base holes: one placed by equations, patterned N times at pitch P.
  const pBase = b.add('plane', { base: TOP, offset: 8, exprs: { offset: 'T' } });
  const hb = b.sketch({ kind: 'ref', id: pBase.id }, (k) => {
    point(k, 85, 25);
    const p = k.entities.at(-1).id;
    const c1 = dim(k, { type: 'hdistance', a: ORIGIN, b: p, value: 85 }); c1.expr = 'L - E';
    const c2 = dim(k, { type: 'vdistance', a: ORIGIN, b: p, value: 25 }); c2.expr = 'W / 2 - E';
  }, T('스케치-바닥 구멍', 'Sketch-BaseHoles'));
  const h1 = b.add('hole', { sketch: hb.id, diameter: 9, through: true, exprs: { diameter: 'D' } });
  b.add('linearPattern', { seeds: [h1.id], direction: { kind: 'axis', axis: 'z' }, spacing: 25, count: 3, exprs: { spacing: 'P', count: 'N' } });
  // Upright holes: two, at the edge distance from the sides and the top (counterbored on the inside face).
  const pUp = b.add('plane', { base: RIGHT, offset: 8, exprs: { offset: 'T' } });
  const hu = b.sketch({ kind: 'ref', id: pUp.id }, (k) => {
    point(k, 25, 55);
    const p = k.entities.at(-1).id;
    const c1 = dim(k, { type: 'hdistance', a: ORIGIN, b: p, value: 25 }); c1.expr = 'W / 2 - E';
    const c2 = dim(k, { type: 'vdistance', a: ORIGIN, b: p, value: 55 }); c2.expr = 'H - E';
  }, T('스케치-세움 구멍', 'Sketch-UprightHoles'));
  const h2 = b.add('hole', { sketch: hu.id, kind: 'counterbore', diameter: 9, cbDiameter: 15, cbDepth: 3, through: true, exprs: { diameter: 'D', cbDiameter: 'D * 1.6', cbDepth: 'T * 0.4' } });
  b.add('linearPattern', { seeds: [h2.id], direction: { kind: 'axis', axis: 'z' }, spacing: 50, count: 2, exprs: { spacing: 'W - 2 * E' } });
  // Three configurations (the design table holds the same columns).
  part.configurations = [
    { id: 'cfg-small', name: T('소형', 'Small'), variables: { L: '70', W: '60', H: '50', T: '6', D: '6.6', E: '12', N: '2' }, suppress: {}, values: {} },
    { id: 'cfg-standard', name: T('표준', 'Standard'), variables: {}, suppress: {}, values: {} },
    { id: 'cfg-heavy', name: T('고하중', 'Heavy duty'), variables: { L: '140', W: '120', H: '100', T: '12', D: '13.5', E: '20', N: '4' }, suppress: {}, values: {} },
  ];
  part.config = 'cfg-standard';
  part.partNo = 'PB-100x80';
  return part;
}

// ───────────────────────── 12. wire coat hanger

function wireHanger(T) {
  const b = builder(createPart(T('철사 옷걸이', 'Wire coat hanger'), { material: 'steel-1020', color: '#b9bec4', partNo: 'HG-410-W3', description: T('철사 지름 3.2', 'Wire 3.2 mm') }));
  const w = 3.2;
  // The triangle: one closed 3D path, the wire round its corners.
  const tri = b.add('sketch3d', { points: [[0, 0, 0], [205, 0, 0], [5, 142, 0], [-5, 142, 0], [-205, 0, 0]], closed: true, name: T('3D스케치-몸체', '3DSketch-Body') });
  const s1 = b.sketch('right', (k) => circle(k, 0, 0, w), T('스케치-철사', 'Sketch-Wire'));
  b.add('sweep', { sketch: s1.id, path: tri.id, transition: 'round' });
  // The hook: a 3D spline from the neck.
  const hook = b.add('sketch3d', { points: [[0, 140, 0], [0, 168, 0], [3, 190, 2], [17, 206, 4], [35, 203, 3], [43, 187, 1], [36, 174, 0]], spline: true, name: T('3D스케치-고리', '3DSketch-Hook') });
  const pn = b.plane('top', 140);
  const s2 = b.sketch(pn, (k) => circle(k, 0, 0, w));
  b.add('sweep', { sketch: s2.id, path: hook.id });
  // Twisted neck: a wire wound round both ends.
  const pt = b.plane('top', 132);
  const twist = b.add('helix', { plane: pt, radius: 4.6, pitch: 3.4, turns: 3 });
  const s3 = b.sketch('front', (k) => circleAt(k, 4.6, 132, 2.6));
  b.add('sweep', { sketch: s3.id, path: twist.id, frenet: true });
  // Rounded hook tip and a grip sleeve on the bar.
  // (The hook's end face, given by its signature so the part is not rebuilt here.)
  b.add('dome', { faces: [{ type: 'PLANE', center: [36, 174, 0], normal: [-0.727143, -0.685621, -0.034438], area: 8.042477 }], height: 1.4 });
  const sl = b.sketch('front', (k) => { chain(k, [[-110, 0], [-110, 3.7], [-109.2, 4.5], [109.2, 4.5], [110, 3.7], [110, 0]]); axis(k, -130, 0, 130, 0); }, T('스케치-손잡이 슬리브', 'Sketch-GripSleeve'));
  b.add('revolve', { sketch: sl.id });
  return b.part;
}

// ───────────────────────── 13. turbine blade

function airfoil(chord, thick, camber, twistDeg, shift = [0, 0]) {
  const xs = [1, 0.75, 0.5, 0.3, 0.15, 0.05, 0];
  const yt = (x) => 5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const yc = (x) => 4 * camber * x * (1 - x);
  const upper = xs.map((x) => [x, yc(x) + yt(x)]);
  const lower = xs.slice(1, -1).reverse().map((x) => [x, yc(x) - yt(x)]);
  const a = (twistDeg * Math.PI) / 180;
  return [...upper, ...lower].map(([x, y]) => {
    const u = (x - 0.4) * chord; const v = y * chord;
    return [u * Math.cos(a) - v * Math.sin(a) + shift[0], u * Math.sin(a) + v * Math.cos(a) + shift[1]];
  });
}

function turbineBlade(T) {
  const b = builder(createPart(T('터빈 블레이드', 'Turbine blade'), { material: 'titanium', partNo: 'TB-1ST-095', description: T('1단 압축기 블레이드', 'First-stage compressor blade') }));
  // Fir-tree root along the disc slot (Z), and the platform.
  const root = b.sketch('front', (k) => {
    const half = [[16, -30], [12, -25], [15, -21], [11, -15], [14, -11], [10, -5], [10, 0]];
    chain(k, [...half, ...half.slice().reverse().map(([x, y]) => [-x, y])]);
  }, T('스케치-뿌리', 'Sketch-Root'));
  b.add('extrude', { sketch: root.id, end: 'midplane', depth: 40 });
  const plat = b.sketch('top', (k) => centreRect(k, 52, 44), T('스케치-플랫폼', 'Sketch-Platform'));
  b.add('extrude', { sketch: plat.id, depth: 5 });
  b.add('fillet', { radius: 3, edges: b.edges((e) => Math.abs(e.dir[1]) > 0.99 && near(Math.abs(e.mid[0]), 26)) });
  // Lock-wire hole through the root and chamfered root edges.
  const pr = b.plane('right', 16);
  const lw = b.sketch(pr, (k) => point(k, 0, -27.5));
  b.add('hole', { sketch: lw.id, diameter: 2.5, through: true });
  b.add('chamfer', { distance: 1, edges: b.edges((e) => e.type === 'LINE' && near(e.mid[1], -30) && Math.abs(e.dir[0]) > 0.99) });
  // Airfoil sections up the span: smaller, thinner and twisted further toward the tip.
  const stations = [[4, 36, 0.16, 0.06, 0], [35, 33, 0.13, 0.055, 12], [65, 30, 0.105, 0.05, 23], [95, 28, 0.085, 0.045, 34]];
  const ids = stations.map(([y, c, t, m, tw], i) => {
    const pl = b.plane('top', y);
    return b.sketch(pl, (k) => addSpline(k, airfoil(c, t, m, tw), { closed: true }), T(`스케치-단면${i + 1}`, `Sketch-Section${i + 1}`)).id;
  });
  b.add('loft', { sketches: ids });
  return b.part;
}

// ───────────────────────── 14. soap and its mold insert

function soapBar(T) {
  const b = builder(createPart(T('비누', 'Soap bar'), { material: 'pom', color: '#e8d9b5', partNo: 'SP-BAR-84', description: T('성형 제품', 'The molded product') }));
  const s = b.sketch('top', (k) => addSlot(k, -30, 0, 30, 0, 12));
  b.add('extrude', { sketch: s.id, depth: 12, draft: true, draftAngle: 2 });
  b.add('fillet', { radius: 4, edges: b.edges((e) => near(e.mid[1], 12, 1e-3)) });
  const pt = b.plane('top', 12);
  const txt = b.sketch(pt, (k) => addText(k, -14, -3, 'MECH', 7.5));
  b.add('extrude', { sketch: txt.id, op: 'cut', depth: 0.8 });
  return b.part;
}

function moldInsert(T, soap) {
  const b = builder(createPart(T('캐비티 인서트', 'Cavity insert'), { material: 'steel-4340', partNo: 'MI-SP-120', description: T('비누 금형 고정측', 'Soap mold, fixed half') }));
  const blk = b.sketch('top', (k) => centreRect(k, 120, 80));
  b.add('extrude', { sketch: blk.id, depth: 40, reverse: true });
  b.add('chamfer', { distance: 1.5, edges: b.edges((e) => e.type === 'LINE' && near(e.mid[1], 0) && Math.abs(e.dir[1]) < 0.01) });
  // Guide pin holes at the corners, cooling channels across, ejector pins from below.
  const pt = b.sketch('top', (k) => { for (const [x, z] of [[-50, -30], [50, -30], [-50, 30], [50, 30]]) point(k, x, z); });
  b.add('hole', { sketch: pt.id, kind: 'counterbore', diameter: 10, cbDiameter: 16, cbDepth: 4, depth: 30, through: false });
  const pz = b.plane('front', 40);
  const cool = b.sketch(pz, (k) => { point(k, -45, -28); point(k, 45, -28); point(k, 0, -32); });
  b.add('hole', { sketch: cool.id, diameter: 8, through: true });
  const under = b.add('plane', { base: TOP, offset: -40, flip: true });
  const ej = b.sketch({ kind: 'ref', id: under.id }, (k) => point(k, -24, 0));
  const ejector = b.add('hole', { sketch: ej.id, diameter: 4, through: true });
  b.add('linearPattern', { seeds: [ejector.id], direction: { kind: 'axis', axis: 'x' }, spacing: 24, count: 3 });
  // The cavity: the soap (top face down) cut out of the block.
  b.add('insertPart', { part: soap.id, op: 'cut', axis: 'x', angle: 180 });
  // Runner from the block edge to the cavity: a half-round profile swept along a line (cut sweep).
  const pr = b.plane('right', 60);
  const prof = b.sketch(pr, (k) => { const arc = addArc(k, 0, 0, 3, Math.PI, 2 * Math.PI); addLine(k, 0, 0, 0, 0, { from: arc.p1, to: arc.p2 }); }, T('스케치-러너 단면', 'Sketch-RunnerSection'));
  const path = b.sketch('front', (k) => addLine(k, 60, 0, 36, 0));
  b.add('sweep', { sketch: prof.id, path: path.id, op: 'cut' });
  return b.part;
}

function moldProject(T, name) {
  const project = createProject({ name, kind: 'none' });
  const soap = soapBar(T);
  const insert = moldInsert(T, soap);
  project.parts.push(soap, insert);
  project.active = { kind: 'part', id: insert.id };
  return project;
}

// ───────────────────────── 15. bottle cap

function bottleCap(T) {
  const b = builder(createPart(T('병뚜껑', 'Bottle cap'), { material: 'pom', color: '#2f7fd1', partNo: 'BC-28-PCO', description: T('스윕 암나사 피치 3, 널링 48줄', 'Swept internal thread pitch 3, 48 knurls') }));
  const prof = b.sketch('front', (k) => {
    chain(k, [[13.5, 0], [16, 0], [16, 16], [0, 16], [0, 14.2], [11, 14.2], [11.3, 11.6], [12.1, 11.6], [12.4, 14.2], [13.5, 14.2]]);
    axis(k, 0, -5, 0, 25);
  }, T('스케치-단면', 'Sketch-Section'));
  b.add('revolve', { sketch: prof.id });
  b.add('fillet', { radius: 1.2, edges: b.edges((e) => e.type === 'CIRCLE' && near(e.mid[1], 16) && near(radial(e.mid), 16, 0.01)) });
  // The internal thread: a thread profile swept along a helix inside the skirt (two turns, pitch 3).
  const ph = b.plane('top', 1.5);
  const hx = b.add('helix', { plane: ph, radius: 13.6, pitch: 3, turns: 2 });
  const tp = b.sketch('front', (k) => chain(k, [[13.7, 0.6], [13.7, 2.4], [12.4, 1.8], [12.4, 1.2]]), T('스케치-나사 단면', 'Sketch-ThreadProfile'));
  b.add('sweep', { sketch: tp.id, path: hx.id, frenet: true });
  // Knurl grooves round the upper skirt, above the thread: one groove sketched, patterned in the sketch, cut once.
  const pk = b.plane('top', 8.8);
  const kn = b.sketch(pk, (k) => { const ls = chain(k, [[16.4, -0.55], [16.4, 0.55], [15.6, 0]]); circularSketchPattern(k, ls.map((l) => l.id), { count: 48 }); }, T('스케치-널링', 'Sketch-Knurl'));
  b.add('extrude', { sketch: kn.id, op: 'cut', depth: 6.6, reverse: true });
  // Lead-in chamfer at the mouth and the tamper band groove (revolved cuts).
  const cuts = b.sketch('front', (k) => {
    chain(k, [[13.3, -0.01], [14.6, -0.01], [13.3, 1.3]]);
    chain(k, [[15.5, 2.2], [16.5, 2.2], [16.5, 2.8], [15.5, 2.8]]);
    axis(k, 0, -5, 0, 25);
  });
  b.add('revolve', { sketch: cuts.id, op: 'cut' });
  // A shallow recess in the top for the print.
  const ptop = b.plane('top', 16);
  const rec = b.sketch(ptop, (k) => circle(k, 0, 0, 22));
  b.add('extrude', { sketch: rec.id, op: 'cut', depth: 0.4 });
  return b.part;
}

// ───────────────────────── build

export function build(id, lang = 'ko') {
  const T = (ko, en) => (lang === 'en' ? en : ko);
  const sample = SAMPLES.find((s) => s.id === id);
  if (!sample) return null;
  const name = sample[lang === 'en' ? 'en' : 'ko'][0];
  switch (id) {
    case 'advSpring': return single(name, spring(T));
    case 'advBoltNut': return boltNut(T, name);
    case 'advBikeFrame': return single(name, bikeFrame(T));
    case 'advMachineStand': return single(name, machineStand(T));
    case 'advSheetEnclosure': return single(name, sheetEnclosure(T));
    case 'advMoldedCover': return single(name, moldedCover(T));
    case 'advCarBody': return single(name, carBody(T));
    case 'advWineGlass': return single(name, wineGlass(T));
    case 'advDuctBend': return single(name, ductBend(T));
    case 'advKnob': return single(name, knob(T));
    case 'advParamBracket': return single(name, paramBracket(T));
    case 'advWireHanger': return single(name, wireHanger(T));
    case 'advTurbineBlade': return single(name, turbineBlade(T));
    case 'advMoldInsert': return moldProject(T, name);
    case 'advBottleCap': return single(name, bottleCap(T));
    default: return null;
  }
}
