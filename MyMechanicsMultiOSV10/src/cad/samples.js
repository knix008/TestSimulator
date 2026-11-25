// Sample projects for the start page: real feature trees (every dimension can be edited and the part
// rebuilds), machine parts, assemblies with mates and drawings. Built when opened — the kernel must be
// loaded (fillets and mates pick their edges and faces from the built solid).
import { createFeature, regenerate } from './features.js';
import {
  addArc, addCenterRectangle, addCircle, addConstraint, addLine, addPolygon, addRectangle, addSlot, createSketchGeometry, mergePoints, ORIGIN, solveSketch, byId,
} from './sketch.js';
import { edgeSignature, faceSignature, isCylinder } from './refs.js';
import { createAssembly, createPart, createProject, addDrawing, newId } from './document.js';
import { mateEntityOfFace, quatFromAxisAngle, quatIdentity, solveMates } from './assembly.js';
import { rep } from './kernel.js';
import { withYUp } from './frame.js';
import { migrateProject } from './zup.js';
import * as basicGroup from './samples/basic.js';
import * as machineGroup from './samples/machine.js';
import * as housingGroup from './samples/housing.js';
import * as assemblyGroup from './samples/assembly.js';
import * as advancedGroup from './samples/advanced.js';

/** The groups' modules: each exports SAMPLES ([{ id, group, icon, ko: [name, note], en: [name, note] }]) and build(id, lang). */
const GROUP_MODULES = [basicGroup, machineGroup, housingGroup, assemblyGroup, advancedGroup];

export const SAMPLE_GROUPS = [
  { id: 'basic', icon: 'featExtrude', ko: '기본 부품', en: 'Basic parts' },
  { id: 'machine', icon: 'featRevolve', ko: '기계 요소', en: 'Machine elements' },
  { id: 'housing', icon: 'featShell', ko: '하우징·판금형', en: 'Housings' },
  { id: 'assembly', icon: 'assembly', ko: '어셈블리·도면', en: 'Assemblies & drawings' },
  { id: 'advanced', icon: 'featSweep', ko: '고급 피처', en: 'Advanced features' },
];

export const LEGACY_SAMPLES = [
  { id: 'block', group: 'basic', icon: 'featExtrude', ko: ['구멍 뚫린 블록', '돌출 · 구멍 가공 마법사 · 필렛'], en: ['Block with holes', 'Extrude · Hole Wizard · fillet'] },
  { id: 'lBracket', group: 'basic', icon: 'featFillet', ko: ['L 브래킷', 'L자 단면 돌출 · 두 면의 구멍 · 안쪽 필렛'], en: ['L-bracket', 'L profile · holes on two faces · inner fillet'] },
  { id: 'hexNut', group: 'basic', icon: 'polygon', ko: ['육각 너트 M10', '다각형 스케치 · 모따기'], en: ['Hex nut M10', 'Polygon sketch · chamfer'] },
  { id: 'bolt', group: 'basic', icon: 'featChamfer', ko: ['육각 볼트 M10×40', '머리와 몸통 · 끝 모따기'], en: ['Hex bolt M10×40', 'Head and shank · tip chamfer'] },
  { id: 'bushing', group: 'basic', icon: 'featChamfer', ko: ['부싱', '원형 단면 · 양쪽 모따기'], en: ['Bushing', 'Ring section · chamfers both ends'] },
  { id: 'flange', group: 'machine', icon: 'featRevolve', ko: ['파이프 플랜지', '회전 · 볼트 구멍 원형 패턴'], en: ['Pipe flange', 'Revolve · bolt holes in a circular pattern'] },
  { id: 'shaft', group: 'machine', icon: 'featRevolve', ko: ['계단축', '회전 · 키홈 · 모따기'], en: ['Stepped shaft', 'Revolve · keyway · chamfers'] },
  { id: 'pulley', group: 'machine', icon: 'featRevolve', ko: ['V 벨트 풀리', 'V 홈 회전 · 경량 구멍 패턴'], en: ['V-belt pulley', 'V-groove revolve · lightening hole pattern'] },
  { id: 'gear', group: 'machine', icon: 'featCirPattern', ko: ['평기어 (24잇)', '이 홈 잘라내기 · 원형 패턴'], en: ['Spur gear (24 teeth)', 'Tooth cut · circular pattern'] },
  { id: 'wheel', group: 'machine', icon: 'featCirPattern', ko: ['살 바퀴', '포켓 잘라내기 · 원형 패턴'], en: ['Spoked wheel', 'Pocket cut · circular pattern'] },
  { id: 'knob', group: 'machine', icon: 'featRevolve', ko: ['손잡이 노브', '회전 · 미끄럼 방지 홈 패턴'], en: ['Control knob', 'Revolve · grip cut pattern'] },
  { id: 'pillowBlock', group: 'housing', icon: 'featHole', ko: ['베어링 하우징', '아치 돌출 · 보어 · 카운터보어 구멍'], en: ['Pillow block', 'Arched boss · bore · counterbored holes'] },
  { id: 'enclosure', group: 'housing', icon: 'featShell', ko: ['전자 기기 케이스', '필렛 · 쉘 · 측면 구멍'], en: ['Electronics enclosure', 'Fillet · shell · side cut-outs'] },
  { id: 'mountPlate', group: 'housing', icon: 'featLinPattern', ko: ['장착판', '슬롯 · 직선 패턴 구멍 · 대칭 복사'], en: ['Mounting plate', 'Slots · linear hole pattern · mirror'] },
  { id: 'shaftAssembly', group: 'assembly', icon: 'assembly', ko: ['축 어셈블리', '하우징 + 축 + 풀리 · 동심·일치 메이트'], en: ['Shaft assembly', 'Housing + shaft + pulley · concentric and coincident mates'] },
  { id: 'boltedJoint', group: 'assembly', icon: 'mateConcentric', ko: ['볼트 체결 조인트', '두 판 · 볼트 · 너트 · 간섭 검사'], en: ['Bolted joint', 'Two plates · bolt · nut · interference check'] },
  { id: 'flangeDrawing', group: 'assembly', icon: 'drawing', ko: ['플랜지 도면', '3면도 + 등각도 · 표제란'], en: ['Flange drawing', 'Three views + isometric · title block'] },
  { id: 'bracketDrawing', group: 'assembly', icon: 'drawing', ko: ['브래킷 도면', 'L 브래킷의 2D 도면'], en: ['Bracket drawing', '2D drawing of the L-bracket'] },
  { id: 'spring', group: 'advanced', icon: 'helix', ko: ['압축 스프링', '나선 · 스윕'], en: ['Compression spring', 'Helix · sweep'] },
  { id: 'threadedBolt', group: 'advanced', icon: 'featThread', ko: ['나사산 볼트 M10', '나사산 피처 (수나사)'], en: ['Threaded bolt M10', 'Thread feature (external)'] },
  { id: 'funnel', group: 'advanced', icon: 'featLoft', ko: ['깔때기', '로프트 · 두껍게 · 돔'], en: ['Funnel', 'Loft · dome · draft'] },
  { id: 'sheetBracket', group: 'advanced', icon: 'sheetMetal', ko: ['판금 브래킷', '베이스 플랜지 · 모서리 플랜지 · 펼치기'], en: ['Sheet metal bracket', 'Base flange · edge flanges · flatten'] },
  { id: 'weldFrame', group: 'advanced', icon: 'structural', ko: ['용접 프레임', '구조 부재 (각관) · 절단 목록'], en: ['Welded frame', 'Structural members (square tube) · cut list'] },
  { id: 'paramPlate', group: 'advanced', icon: 'equations', ko: ['파라메트릭 판', '전역 변수 · 수식 · 컨피규레이션'], en: ['Parametric plate', 'Global variables · equations · configurations'] },
];

// ───────────────────────── building helpers

export function builder(part) {
  const planeRef = (p) => (typeof p === 'string' ? { kind: 'std', name: p } : p);
  const api = {
    part,
    sketch(plane, draw, name = null) {
      const s = createFeature(part, 'sketch', { plane: planeRef(plane), ...createSketchGeometry(), ...(name ? { name } : {}) });
      draw(s);
      solveSketch(s);
      part.features.push(s);
      return s;
    },
    plane(base, offset) {
      const f = createFeature(part, 'plane', { base: planeRef(base), offset });
      part.features.push(f);
      return { kind: 'ref', id: f.id };
    },
    // Sample threads use the V (UN 60°) form — an exact screw solid like every thread form (the baseline,
    // test/fixtures/samples-yup-baseline.json, has their parts measured that way); new threads made in the app are ISO.
    add(type, params) { const f = createFeature(part, type, type === 'thread' ? { form: 'v', ...params } : params); part.features.push(f); return f; },
    /** Signatures of the built body's edges that `test(sig)` accepts. */
    edges(test) { const r = regenerate(part); return r.body ? r.body.edges.map(edgeSignature).filter(test) : []; },
    faces(test) { const r = regenerate(part); return r.body ? r.body.faces.map(faceSignature).filter(test) : []; },
  };
  return api;
}

export const near = (a, b, tol = 1e-4) => Math.abs(a - b) < tol;
export const dim = (s, c) => addConstraint(s, c);

/** A rectangle centred on the origin, fully defined by its width and height. */
export function centreRect(s, w, h) {
  const { lines, center } = addCenterRectangle(s, 0, 0, w / 2, h / 2);
  mergePoints(s, center.id, ORIGIN);
  dim(s, { type: 'distance', a: lines[0].id, value: w });
  dim(s, { type: 'distance', a: lines[1].id, value: h });
  return lines;
}

/** A circle with a diameter dimension (centred on the origin when cx = cy = 0). */
export function circle(s, cx, cy, d) {
  const c = addCircle(s, cx, cy, d / 2);
  if (!cx && !cy) mergePoints(s, c.c, ORIGIN);
  dim(s, { type: 'diameter', a: c.id, value: d });
  return c;
}

/** A closed polyline (one chain of lines). */
export function poly(s, pts) {
  const first = addLine(s, pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
  let prev = first;
  for (let i = 1; i < pts.length; i++) {
    const b = pts[(i + 1) % pts.length];
    const last = i === pts.length - 1;
    prev = addLine(s, 0, 0, b[0], b[1], { from: prev.p2, ...(last ? { to: first.p1 } : {}) });
  }
  return first;
}

export const point = (s, x, y) => { s.entities.push({ id: `h${s.entities.length}${Math.random().toString(36).slice(2, 6)}`, type: 'point', x, y, standalone: true }); };

// ───────────────────────── parts

export const PARTS = {
  spring(name) {
    const b = builder(createPart(name, { material: 'steel-4340', partNo: 'SP-30-6' }));
    const helix = b.add('helix', { plane: { kind: 'std', name: 'top' }, radius: 15, pitch: 6, turns: 6 });
    const prof = b.sketch('front', (k) => { const c = addCircle(k, 15, 0, 1.5); dim(k, { type: 'diameter', a: c.id, value: 3 }); });
    b.add('sweep', { sketch: prof.id, path: helix.id, frenet: true });
    return b.part;
  },
  threadedBolt(name) {
    const b = builder(createPart(name, { material: 'steel-4340', partNo: 'KS-M10x40-T' }));
    const head = b.sketch('top', (k) => addPolygon(k, 0, 0, 16 / Math.sqrt(3), 6, 0));
    b.add('extrude', { sketch: head.id, depth: 6.4 });
    const shank = b.sketch('top', (k) => circle(k, 0, 0, 10));
    b.add('extrude', { sketch: shank.id, depth: 40, reverse: true });
    b.add('thread', { edge: b.edges((e) => e.type === 'CIRCLE' && near(e.mid[1], -40))[0], pitch: 1.5, length: 20, size: 'M10' });
    return b.part;
  },
  funnel(name) {
    const b = builder(createPart(name, { material: 'abs', partNo: 'FN-01' }));
    const bottom = b.sketch('top', (k) => circle(k, 0, 0, 20));
    const top = b.plane('top', 40);
    const upper = b.sketch(top, (k) => centreRect(k, 60, 60));
    b.add('loft', { sketches: [bottom.id, upper.id] });
    const neck = b.sketch('top', (k) => circle(k, 0, 0, 20));
    b.add('extrude', { sketch: neck.id, depth: 15, reverse: true, draft: true, draftAngle: 4 });
    b.add('dome', { faces: b.faces((f) => f.type === 'PLANE' && f.center[1] > 39.9), height: 6 });
    return b.part;
  },
  sheetBracket(name) {
    const b = builder(createPart(name, { material: 'al-6061', partNo: 'SM-BRK-01' }));
    const base = b.sketch('top', (k) => centreRect(k, 120, 60));
    b.add('baseFlange', { sketch: base.id, thickness: 2, radius: 2, kFactor: 0.44 });
    const top = (sig, x) => sig.type === 'LINE' && near(sig.start[0], x) && near(sig.end[0], x) && near(sig.mid[1], 2);
    b.add('edgeFlange', { edge: b.edges((e) => top(e, 60))[0], length: 30, angle: 90 });
    b.add('edgeFlange', { edge: b.edges((e) => top(e, -60))[0], length: 30, angle: 90 });
    const holes = b.sketch('top', (k) => { circle(k, -30, 0, 8); circle(k, 30, 0, 8); });
    b.add('extrude', { sketch: holes.id, op: 'cut', end: 'throughBoth' });
    return b.part;
  },
  weldFrame(name) {
    const b = builder(createPart(name, { material: 'steel-1020', partNo: 'WF-600' }));
    const frame = b.sketch('front', (k) => { poly(k, [[0, 0], [600, 0], [600, 400], [0, 400]]); addLine(k, 0, 0, 600, 400); });
    b.add('structural', { sketch: frame.id, profile: 'squareTube', w: 40, h: 40, t: 3 });
    return b.part;
  },
  paramPlate(name) {
    const part = createPart(name, { material: 'al-6061', partNo: 'PP-01' });
    part.variables = [{ name: 'W', expr: '120' }, { name: 'H', expr: 'W / 2' }, { name: 'T', expr: '8' }, { name: 'D', expr: 'T + 2' }];
    const b = builder(part);
    const plate = b.sketch('top', (k) => centreRect(k, 120, 60));
    const [w, h] = plate.constraints.filter((c) => c.type === 'distance');
    w.expr = 'W'; w.name = 'D1'; h.expr = 'H'; h.name = 'D2';
    const ex = b.add('extrude', { sketch: plate.id, depth: 8, exprs: { depth: 'T' } });
    void ex;
    const hole = b.sketch('top', (k) => circle(k, 0, 0, 10));
    hole.constraints.find((c) => c.type === 'diameter').expr = 'D';
    const cut = b.add('extrude', { sketch: hole.id, op: 'cut', end: 'throughBoth' });
    part.configurations = [{ id: 'cfg-small', name: 'Small', variables: { W: '80', T: '5' }, suppress: {}, values: {} }, { id: 'cfg-solid', name: 'NoHole', variables: {}, suppress: { [cut.id]: true }, values: {} }];
    return b.part;
  },
  block(name) {
    const b = builder(createPart(name, { material: 'al-6061', partNo: 'MM-1001' }));
    const s = b.sketch('top', (k) => centreRect(k, 80, 50));
    b.add('extrude', { sketch: s.id, depth: 20 });
    b.add('fillet', { radius: 5, edges: b.edges((e) => Math.abs(e.dir[1]) > 0.99) });
    const top = b.plane('top', 20);
    const hs = b.sketch(top, (k) => { point(k, -25, 0); point(k, 25, 0); });
    b.add('hole', { sketch: hs.id, kind: 'counterbore', diameter: 9, cbDiameter: 15, cbDepth: 9, through: true });
    const cs = b.sketch(top, (k) => circle(k, 0, 0, 16));
    b.add('extrude', { sketch: cs.id, op: 'cut', depth: 8 });
    return b.part;
  },
  lBracket(name) {
    const b = builder(createPart(name, { material: 'steel-1020', partNo: 'MM-1002' }));
    const s = b.sketch('front', (k) => poly(k, [[0, 0], [60, 0], [60, 6], [6, 6], [6, 50], [0, 50]]));
    b.add('extrude', { sketch: s.id, end: 'midplane', depth: 40 });
    b.add('fillet', { radius: 4, edges: b.edges((e) => near(e.mid[0], 6) && near(e.mid[1], 6) && Math.abs(e.dir[2]) > 0.99) });
    const base = b.plane('top', 6);
    const h1 = b.sketch(base, (k) => { point(k, 40, 12); point(k, 40, -12); });
    b.add('hole', { sketch: h1.id, diameter: 6.6, through: true });
    const side = b.plane('right', 6);
    const h2 = b.sketch(side, (k) => { point(k, 12, 36); point(k, -12, 36); });
    b.add('hole', { sketch: h2.id, diameter: 6.6, through: true });
    return b.part;
  },
  hexNut(name) {
    const b = builder(createPart(name, { material: 'steel-4340', partNo: 'KS-M10-N' }));
    const s = b.sketch('top', (k) => { addPolygon(k, 0, 0, 16 / Math.sqrt(3), 6, 0); circle(k, 0, 0, 10.2); });
    b.add('extrude', { sketch: s.id, depth: 8 });
    b.add('chamfer', { distance: 0.8, edges: b.edges((e) => e.type === 'LINE' && (near(e.mid[1], 8) || near(e.mid[1], 0)) && Math.abs(e.dir[1]) < 0.01 && Math.hypot(e.mid[0], e.mid[2]) > 6) });
    return b.part;
  },
  bolt(name) {
    const b = builder(createPart(name, { material: 'steel-4340', partNo: 'KS-M10x40' }));
    const head = b.sketch('top', (k) => addPolygon(k, 0, 0, 16 / Math.sqrt(3), 6, 0));
    b.add('extrude', { sketch: head.id, depth: 6.4 });
    const shank = b.sketch('top', (k) => circle(k, 0, 0, 10));
    b.add('extrude', { sketch: shank.id, depth: 40, reverse: true });
    b.add('chamfer', { distance: 1, edges: b.edges((e) => e.type === 'CIRCLE' && near(e.mid[1], -40)) });
    return b.part;
  },
  bushing(name) {
    const b = builder(createPart(name, { material: 'brass', partNo: 'MM-2005' }));
    const s = b.sketch('top', (k) => { circle(k, 0, 0, 30); circle(k, 0, 0, 20); });
    b.add('extrude', { sketch: s.id, depth: 20 });
    b.add('chamfer', { distance: 1, edges: b.edges((e) => e.type === 'CIRCLE') });
    return b.part;
  },
  flange(name) {
    const b = builder(createPart(name, { material: 'stainless-304', partNo: 'MM-3001' }));
    const s = b.sketch('front', (k) => {
      poly(k, [[15, 0], [60, 0], [60, 12], [30, 12], [30, 35], [15, 35]]);
      addLine(k, 0, 0, 0, 40, { construction: true });
    });
    b.add('revolve', { sketch: s.id });
    const top = b.plane('top', 12);
    const hs = b.sketch(top, (k) => point(k, 45, 0));
    const hole = b.add('hole', { sketch: hs.id, diameter: 9, through: true });
    b.add('circularPattern', { seeds: [hole.id], axis: { kind: 'axis', axis: 'y' }, count: 6 });
    b.add('fillet', { radius: 3, edges: b.edges((e) => e.type === 'CIRCLE' && near(e.mid[1], 12) && Math.hypot(e.mid[0], e.mid[2]) < 31 && Math.hypot(e.mid[0], e.mid[2]) > 29) });
    return b.part;
  },
  shaft(name) {
    const b = builder(createPart(name, { material: 'steel-4340', partNo: 'MM-3002' }));
    const s = b.sketch('front', (k) => {
      poly(k, [[0, 0], [0, 10], [30, 10], [30, 15], [90, 15], [90, 10], [120, 10], [120, 0]]);
      addLine(k, 0, 0, 120, 0, { construction: true });
    });
    b.add('revolve', { sketch: s.id });
    b.add('chamfer', { distance: 1, edges: b.edges((e) => e.type === 'CIRCLE' && (near(e.mid[0], 0) || near(e.mid[0], 120))) });
    const key = b.plane('top', 15);
    const ks = b.sketch(key, (k) => addSlot(k, 45, 0, 75, 0, 3));
    b.add('extrude', { sketch: ks.id, op: 'cut', depth: 3.5 });
    return b.part;
  },
  pulley(name) {
    const b = builder(createPart(name, { material: 'cast-iron', partNo: 'MM-3003' }));
    const s = b.sketch('front', (k) => {
      poly(k, [[10, 0], [50, 0], [50, 5], [42, 10], [50, 15], [50, 20], [10, 20]]);
      addLine(k, 0, 0, 0, 30, { construction: true });
    });
    b.add('revolve', { sketch: s.id });
    const face = b.plane('top', 20);
    const hs = b.sketch(face, (k) => point(k, 27, 0));
    const hole = b.add('hole', { sketch: hs.id, diameter: 12, through: true });
    b.add('circularPattern', { seeds: [hole.id], axis: { kind: 'axis', axis: 'y' }, count: 5 });
    return b.part;
  },
  gear(name) {
    const b = builder(createPart(name, { material: 'pom', partNo: 'MM-3004' }));
    const s = b.sketch('front', (k) => { circle(k, 0, 0, 96); circle(k, 0, 0, 16); });
    b.add('extrude', { sketch: s.id, depth: 12 });
    const ts = b.sketch('front', (k) => poly(k, [[-2.4, 49], [2.4, 49], [1.5, 42], [-1.5, 42]]));
    const tooth = b.add('extrude', { sketch: ts.id, op: 'cut', end: 'throughBoth' });
    b.add('circularPattern', { seeds: [tooth.id], axis: { kind: 'axis', axis: 'z' }, count: 24 });
    const hub = b.sketch('front', (k) => { circle(k, 0, 0, 32); circle(k, 0, 0, 16); });
    b.add('extrude', { sketch: hub.id, depth: 6, reverse: true });
    return b.part;
  },
  wheel(name) {
    const b = builder(createPart(name, { material: 'al-7075', partNo: 'MM-3005' }));
    const s = b.sketch('front', (k) => { circle(k, 0, 0, 120); circle(k, 0, 0, 20); });
    b.add('extrude', { sketch: s.id, depth: 15 });
    const ps = b.sketch('front', (k) => circle(k, 0, 35, 26));
    const pocket = b.add('extrude', { sketch: ps.id, op: 'cut', end: 'throughBoth' });
    b.add('circularPattern', { seeds: [pocket.id], axis: { kind: 'axis', axis: 'z' }, count: 5 });
    b.add('fillet', { radius: 1.5, edges: b.edges((e) => e.type === 'CIRCLE' && near(Math.hypot(e.mid[0], e.mid[1]), 60, 0.01)) });
    return b.part;
  },
  knob(name) {
    const b = builder(createPart(name, { material: 'abs', partNo: 'MM-4001', color: '#2b2f36' }));
    const s = b.sketch('front', (k) => {
      poly(k, [[0, 0], [25, 0], [25, 4], [22, 18], [15, 22], [0, 22]]);
      addLine(k, 0, -5, 0, 30, { construction: true });
    });
    b.add('revolve', { sketch: s.id });
    const g = b.sketch('top', (k) => circle(k, 25.5, 0, 5));
    const grip = b.add('extrude', { sketch: g.id, op: 'cut', end: 'throughBoth' });
    b.add('circularPattern', { seeds: [grip.id], axis: { kind: 'axis', axis: 'y' }, count: 12 });
    const bore = b.sketch('top', (k) => circle(k, 0, 0, 6));
    b.add('extrude', { sketch: bore.id, op: 'cut', depth: 15, reverse: true });
    return b.part;
  },
  pillowBlock(name) {
    const b = builder(createPart(name, { material: 'cast-iron', partNo: 'MM-5001' }));
    const base = b.sketch('top', (k) => centreRect(k, 120, 40));
    b.add('extrude', { sketch: base.id, depth: 15 });
    const up = b.sketch('front', (k) => {
      const l1 = addLine(k, -30, 45, -30, 15);
      const l2 = addLine(k, 0, 0, 30, 15, { from: l1.p2 });
      const l3 = addLine(k, 0, 0, 30, 45, { from: l2.p2 });
      const c = { id: `pc${Math.random().toString(36).slice(2, 6)}`, type: 'point', x: 0, y: 45 };
      k.entities.push(c);
      k.entities.push({ id: `pa${Math.random().toString(36).slice(2, 6)}`, type: 'arc', c: c.id, p1: l3.p2, p2: l1.p1 });
    });
    b.add('extrude', { sketch: up.id, end: 'midplane', depth: 40 });
    const bore = b.sketch('front', (k) => circle(k, 0, 45, 30));
    b.add('extrude', { sketch: bore.id, op: 'cut', end: 'throughBoth' });
    const top = b.plane('top', 15);
    const hs = b.sketch(top, (k) => { point(k, -45, 0); point(k, 45, 0); });
    b.add('hole', { sketch: hs.id, kind: 'counterbore', diameter: 11, cbDiameter: 18, cbDepth: 4, through: true });
    b.add('fillet', { radius: 4, edges: b.edges((e) => Math.abs(e.dir[1]) > 0.99 && near(Math.abs(e.mid[0]), 60)) });
    return b.part;
  },
  enclosure(name) {
    const b = builder(createPart(name, { material: 'pc', partNo: 'MM-6001', color: '#5d7896' }));
    const s = b.sketch('top', (k) => centreRect(k, 120, 80));
    b.add('extrude', { sketch: s.id, depth: 40 });
    b.add('fillet', { radius: 8, edges: b.edges((e) => Math.abs(e.dir[1]) > 0.99) });
    b.add('shell', { thickness: 2.5, faces: b.faces((f) => near(f.center[1], 40) && f.normal[1] > 0.99) });
    const side = b.plane('front', 40);
    const cs = b.sketch(side, (k) => { circle(k, -35, 20, 12); addRectangle(k, 5, 12, 45, 28); });
    b.add('extrude', { sketch: cs.id, op: 'cut', depth: 6 });
    return b.part;
  },
  mountPlate(name) {
    const b = builder(createPart(name, { material: 'al-6061', partNo: 'MM-6002' }));
    const s = b.sketch('top', (k) => centreRect(k, 160, 100));
    b.add('extrude', { sketch: s.id, depth: 8 });
    const sl = b.sketch('top', (k) => addSlot(k, 40, -20, 40, 20, 5));
    const slot = b.add('extrude', { sketch: sl.id, op: 'cut', end: 'throughBoth' });
    b.add('mirror', { seeds: [slot.id], plane: { kind: 'std', name: 'right' } });
    const top = b.plane('top', 8);
    const hs = b.sketch(top, (k) => point(k, -10, 40));
    const hole = b.add('hole', { sketch: hs.id, kind: 'countersink', diameter: 5.5, csDiameter: 11, through: true });
    b.add('linearPattern', { seeds: [hole.id], direction: { kind: 'axis', axis: 'x' }, spacing: 10, count: 3, direction2: { kind: 'axis', axis: 'z' }, spacing2: 80, count2: 2 });
    b.add('fillet', { radius: 6, edges: b.edges((e) => Math.abs(e.dir[1]) > 0.99 && near(Math.abs(e.mid[0]), 80)) });
    return b.part;
  },
};

// ───────────────────────── assemblies

export function faceEntity(part, comp, test) {
  const r = regenerate(part);
  const face = r.body.faces.find((f) => test(faceSignature(f), f));
  if (!face) throw new Error(`sample: face not found in ${part.name}`);
  return { comp, ...mateEntityOfFace(face, faceSignature) };
}

export function component(asm, part, position, rotation = quatIdentity(), fixed = false) {
  const count = asm.components.filter((c) => c.part === part.id).length;
  const c = { id: newId('cmp'), part: part.id, name: `${part.name}<${count + 1}>`, position, rotation, fixed };
  asm.components.push(c);
  return c;
}

export const mate = (asm, type, a, b, extra = {}) => asm.mates.push({ id: newId('mate'), type, name: '', a, b, ...extra });

export function shaftAssembly(lang) {
  const L = (ko, en) => (lang === 'en' ? en : ko);
  const project = createProject({ name: L('축 어셈블리', 'Shaft assembly'), kind: 'none' });
  const block = PARTS.pillowBlock(L('베어링 하우징', 'Pillow block'));
  const shaft = PARTS.shaft(L('계단축', 'Stepped shaft'));
  const pulley = PARTS.pulley(L('V 벨트 풀리', 'V-belt pulley'));
  const bush = PARTS.bushing(L('부싱', 'Bushing'));
  project.parts.push(block, shaft, pulley, bush);
  const asm = createAssembly(L('축 어셈블리', 'Shaft assembly'));
  project.assemblies.push(asm);
  const cBlock = component(asm, block, [0, 0, 0], quatIdentity(), true);
  const cShaft = component(asm, shaft, [-30, 60, 10], quatFromAxisAngle([0, 1, 0], -80));
  const cPulley = component(asm, pulley, [20, 90, 80], quatFromAxisAngle([1, 0, 0], 80));
  const cBush = component(asm, bush, [-10, 80, -50], quatFromAxisAngle([1, 0, 0], 80));
  const cyl = (r) => (f) => isCylinder(f.type) && near(f.radius ?? -1, r, 0.01);
  // The shaft's middle section in the bore, its shoulder flush with the housing's back face.
  mate(asm, 'concentric', faceEntity(block, cBlock.id, (f) => cyl(15)(f) && Math.abs(f.center[0]) < 1), faceEntity(shaft, cShaft.id, (f) => cyl(15)(f) && near(f.center[0], 60, 1)));
  mate(asm, 'coincident', faceEntity(block, cBlock.id, (f) => f.type === 'PLANE' && near(f.center[2], -20) && f.center[1] > 16), faceEntity(shaft, cShaft.id, (f) => f.type === 'PLANE' && near(f.center[0], 30)), { aligned: 'aligned' });
  // The pulley on the long end, flush with it.
  mate(asm, 'concentric', faceEntity(shaft, cShaft.id, (f) => cyl(10)(f) && near(f.center[0], 105, 2)), faceEntity(pulley, cPulley.id, cyl(10)));
  mate(asm, 'coincident', faceEntity(shaft, cShaft.id, (f) => f.type === 'PLANE' && near(f.center[0], 120)), faceEntity(pulley, cPulley.id, (f) => f.type === 'PLANE' && near(f.center[1], 20) && f.normal[1] > 0.9), { aligned: 'aligned' });
  // A bushing on the short end against the housing.
  mate(asm, 'concentric', faceEntity(shaft, cShaft.id, (f) => cyl(10)(f) && near(f.center[0], 15, 2)), faceEntity(bush, cBush.id, cyl(10)));
  mate(asm, 'coincident', faceEntity(shaft, cShaft.id, (f) => f.type === 'PLANE' && near(f.center[0], 30)), faceEntity(bush, cBush.id, (f) => f.type === 'PLANE' && near(f.center[1], 20) && f.normal[1] > 0.9), { aligned: 'anti' });
  settle(project, asm);
  project.active = { kind: 'assembly', id: asm.id };
  return project;
}

export function boltedJoint(lang) {
  const L = (ko, en) => (lang === 'en' ? en : ko);
  const project = createProject({ name: L('볼트 체결 조인트', 'Bolted joint'), kind: 'none' });
  const plate = (() => {
    const b = builder(createPart(L('체결판', 'Joint plate'), { material: 'steel-1020', partNo: 'MM-7001' }));
    const s = b.sketch('top', (k) => { centreRect(k, 80, 50); circle(k, -20, 0, 11); circle(k, 20, 0, 11); });
    b.add('extrude', { sketch: s.id, depth: 10 });
    return b.part;
  })();
  const bolt = PARTS.bolt(L('육각 볼트 M10×40', 'Hex bolt M10×40'));
  const nut = PARTS.hexNut(L('육각 너트 M10', 'Hex nut M10'));
  project.parts.push(plate, bolt, nut);
  const asm = createAssembly(L('볼트 체결 조인트', 'Bolted joint'));
  project.assemblies.push(asm);
  const p1 = component(asm, plate, [0, 0, 0], quatIdentity(), true);
  const p2 = component(asm, plate, [10, 30, 10]);
  mate(asm, 'coincident', faceEntity(plate, p1.id, (f) => f.type === 'PLANE' && near(f.center[1], 10) && f.normal[1] > 0.9), faceEntity(plate, p2.id, (f) => f.type === 'PLANE' && near(f.center[1], 0) && f.normal[1] < -0.9));
  mate(asm, 'concentric', faceEntity(plate, p1.id, (f) => isCylinder(f.type) && near(f.center[0], -20)), faceEntity(plate, p2.id, (f) => isCylinder(f.type) && near(f.center[0], -20)));
  mate(asm, 'concentric', faceEntity(plate, p1.id, (f) => isCylinder(f.type) && near(f.center[0], 20)), faceEntity(plate, p2.id, (f) => isCylinder(f.type) && near(f.center[0], 20)));
  for (const x of [-20, 20]) {
    const cb = component(asm, bolt, [x + 8, 45, 6], quatFromAxisAngle([0, 0, 1], 8));
    const cn = component(asm, nut, [x, -40, 15]);
    // Bolt head on the top plate (upside down: head up, shank through both plates), nut under the bottom one.
    mate(asm, 'concentric', faceEntity(plate, p1.id, (f) => isCylinder(f.type) && near(f.center[0], x)), faceEntity(bolt, cb.id, (f) => isCylinder(f.type) && f.center[1] < -5));
    mate(asm, 'coincident', faceEntity(plate, p2.id, (f) => f.type === 'PLANE' && near(f.center[1], 10) && f.normal[1] > 0.9), faceEntity(bolt, cb.id, (f) => f.type === 'PLANE' && near(f.center[1], 0) && f.normal[1] < -0.9));
    mate(asm, 'concentric', faceEntity(plate, p1.id, (f) => isCylinder(f.type) && near(f.center[0], x)), faceEntity(nut, cn.id, (f) => isCylinder(f.type)));
    mate(asm, 'coincident', faceEntity(plate, p1.id, (f) => f.type === 'PLANE' && near(f.center[1], 0) && f.normal[1] < -0.9), faceEntity(nut, cn.id, (f) => f.type === 'PLANE' && near(f.center[1], 8) && f.normal[1] > 0.9));
  }
  settle(project, asm);
  project.active = { kind: 'assembly', id: asm.id };
  return project;
}

export function settle(project, asm) {
  const R = rep();
  void R;
  solveMates(asm, { size: 150 });
}

export function partProject(id, lang) {
  const sample = LEGACY_SAMPLES.find((s) => s.id === id) ?? SAMPLES.find((s) => s.id === id);
  const name = sample[lang === 'en' ? 'en' : 'ko'][0];
  const project = createProject({ name, kind: 'none' });
  const part = PARTS[id](name);
  project.parts.push(part);
  project.active = { kind: 'part', id: part.id };
  return project;
}

export function drawingProject(partId, lang) {
  const project = partProject(partId, lang);
  const part = project.parts[0];
  const d = addDrawing(project, { kind: 'part', id: part.id }, `${part.name} - ${lang === 'en' ? 'Sheet1' : '시트1'}`);
  d.title.partNo = part.partNo;
  d.title.drawnBy = 'SHKWON';
  project.active = { kind: 'drawing', id: d.id };
  return project;
}

/**
 * Builds a sample project (the kernel must be loaded). The builders are written in the old Y-up coordinates:
 * they run in that frame and the project is turned to Z up afterwards, like an old file.
 */
export function buildSample(id, lang = 'ko') {
  const project = withYUp(() => buildSampleYUp(id, lang));
  return project ? migrateProject(project) : project;
}

/** The sample as its builder makes it, in the old Y-up frame (call it inside withYUp()). */
export function buildSampleYUp(id, lang) {
  for (const g of GROUP_MODULES) if (g.SAMPLES.some((x) => x.id === id) && !id.startsWith('legacy:')) return g.build(id, lang);
  id = id.replace(/^legacy:/, '');
  if (id === 'shaftAssembly') return shaftAssembly(lang);
  if (id === 'boltedJoint') return boltedJoint(lang);
  if (id === 'flangeDrawing') return drawingProject('flange', lang);
  if (id === 'bracketDrawing') return drawingProject('lBracket', lang);
  if (PARTS[id]) return partProject(id, lang);
  return null;
}

export { byId, addArc };

/** Every sample on the start page, group by group (15 each). */
export const SAMPLES = GROUP_MODULES.flatMap((g) => g.SAMPLES);
