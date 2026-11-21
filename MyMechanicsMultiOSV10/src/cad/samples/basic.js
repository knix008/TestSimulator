// Start-page samples of the "basic" group (기본 부품 / Basic parts): single machined, cast and moulded parts
// with full feature trees — pockets, ribs, Hole Wizard holes, threads, drafts, patterns, mirrors, lofts,
// splines, sketch text, domes, wraps and sweeps along 3D sketches. Every sketch dimension can be edited.
//
// The helpers come from ../samples.js, which imports this module: they are used inside functions only.
import { builder, centreRect, circle, poly, point, near, dim } from '../samples.js';
import { addArc, addLine, addPolygon, addRectangle, addSlot, addText } from '../sketch.js';
import { addSpline, circularSketchPattern } from '../sketchtools.js';
import { createPart, createProject } from '../document.js';
import { isCylinder } from '../refs.js';

export const SAMPLES = [
  { id: 'basMountBracket', group: 'basic', icon: 'featFillet', ko: ['CNC 장착 브래킷', '포켓 · 리브 · 카운터보어 구멍 패턴 · 대칭 복사 · 필렛'], en: ['CNC mounting bracket', 'Pocket · ribs · counterbored hole pattern · mirror · fillets'] },
  { id: 'basManifold', group: 'basic', icon: 'featHole', ko: ['유압 매니폴드 블록', '교차 포트 · 카운터보어/카운터싱크 · 막힌 구멍 · 나사 표시 · O링 홈'], en: ['Hydraulic manifold block', 'Intersecting ports · counterbore/countersink · blind holes · cosmetic port threads · O-ring groove'] },
  { id: 'basPipeTee', group: 'basic', icon: 'featRevolve', ko: ['플랜지 이경 티', '회전 · 회전 컷 · 교차 필렛 · 볼트 구멍 원형 패턴'], en: ['Flanged reducing tee', 'Revolves · cut-revolve · junction fillet · bolt-hole circular patterns'] },
  { id: 'basClevis', group: 'basic', icon: 'featChamfer', ko: ['단붙이 클레비스', '포크 홈 · 핀 구멍 · 렌치 평면 · 수나사 · 모따기'], en: ['Stepped clevis', 'Fork slot · pin bore · wrench flats · external thread · chamfers'] },
  { id: 'basNamePlate', group: 'basic', icon: 'note', ko: ['각인 명판', '스케치 문자 양각·음각 · 오목 면 · 돔 배지 · 접시 구멍'], en: ['Engraved name plate', 'Sketch text raised and engraved · recess · domed badge · countersunk holes'] },
  { id: 'basBearingCap', group: 'basic', icon: 'featDraft', ko: ['주조 베어링 캡', '아치 돌출 · 구배 · 필렛 · 오일 홈 회전 컷 · 자리파기 구멍'], en: ['Cast bearing cap', 'Arched boss · draft · fillets · oil-groove cut-revolve · spot-faced holes'] },
  { id: 'basHeatSink', group: 'basic', icon: 'featLinPattern', ko: ['방열판', '핀 직선 패턴 · 클립 홈 · 뿌리 필렛 · 써멀 패드 포켓'], en: ['Heat sink', 'Fin linear pattern · clip notch · root fillets · thermal-pad pocket'] },
  { id: 'basConRod', group: 'basic', icon: 'featLoft', ko: ['커넥팅 로드', '테이퍼 로프트 섕크 · I형 포켓 대칭 · 볼트 패드 · 오일 구멍'], en: ['Connecting rod', 'Tapered loft shank · mirrored I-beam pockets · bolt pads · oil hole'] },
  { id: 'basMotorMount', group: 'basic', icon: 'featMirror', ko: ['NEMA 23 모터 마운트', 'L 브래킷 · 조정 슬롯 · 리브 · 평면 대칭 복사 구멍'], en: ['NEMA 23 motor mount', 'L bracket · adjusting slots · ribs · mirrored hole pattern'] },
  { id: 'basCamDisc', group: 'basic', icon: 'splineTool', ko: ['캠 디스크', '스플라인 윤곽 · 허브 · 키홈 · 경량 구멍 패턴 · 멈춤 나사 구멍 (나사 표시)'], en: ['Cam disc', 'Spline profile · hubs · keyway · lightening-hole pattern · set-screw hole (cosmetic thread)'] },
  { id: 'basCapScrew', group: 'basic', icon: 'featThread', ko: ['육각 구멍 볼트 M12×50', '육각 소켓 · 원뿔 바닥 회전 컷 · 널링 원형 스케치 패턴 · 수나사'], en: ['Socket head cap screw M12×50', 'Hex socket · cone cut-revolve · knurled head (circular sketch pattern) · thread'] },
  { id: 'basCastleNut', group: 'basic', icon: 'featCirPattern', ko: ['홈붙이 너트 M16', '육각 · 30° 모따기 회전 컷 · 홈 원형 패턴 · 암나사 (표시)'], en: ['Castle nut M16', 'Hex · 30° chamfer cut-revolve · slot circular pattern · cosmetic internal thread'] },
  { id: 'basBallKnob', group: 'basic', icon: 'featDome', ko: ['볼 손잡이', '회전 · 미끄럼 방지 홈 패턴 · 돔 · 인서트 구멍과 나사 표시 · 랩 눈금'], en: ['Ball knob', 'Revolve · grip flute pattern · dome · insert bore with cosmetic thread · wrapped index mark'] },
  { id: 'basTSlotTable', group: 'basic', icon: 'featCut', ko: ['T 홈 테이블 단면', 'T 홈 컷 직선 패턴 · 아래 포켓 2방향 패턴 · 탭 구멍 (나사 표시) · 모따기'], en: ['T-slot table section', 'T-slot cut linear pattern · 2-way underside pocket pattern · tapped holes (cosmetic) · chamfers'] },
  { id: 'basSpringClip', group: 'basic', icon: 'featSweep', ko: ['비틀림 스프링 클립', '나선 스윕 · 3D 스케치를 따라 스윕한 다리와 고리'], en: ['Torsion spring clip', 'Helix sweep · legs and hooks swept along 3D sketches'] },
];

const L = (lang, ko, en) => (lang === 'en' ? en : ko);
const TOP = { kind: 'std', name: 'top' };
const FRONT = { kind: 'std', name: 'front' };
const RIGHT = { kind: 'std', name: 'right' };
const hyp = (a, b) => Math.hypot(a, b);
/** A reference plane turned over (its normal reversed): holes and cuts on it go the other way. */
function flipped(b, base, offset) {
  const f = b.add('plane', { base: typeof base === 'string' ? { kind: 'std', name: base } : base, offset, flip: true });
  return { kind: 'ref', id: f.id };
}
const isLine = (e) => e.type === 'LINE';
const isCircle = (e) => e.type === 'CIRCLE';
/** A circular edge of radius r around the axis through (cx, cz) parallel to y, at height y. */
const circleY = (e, y, r, cx = 0, cz = 0, tol = 0.02) => isCircle(e) && near(e.mid[1], y, tol) && near(hyp(e.mid[0] - cx, e.mid[2] - cz), r, tol);

// ───────────────────────── the parts

const BUILD = {
  /** CNC-milled mounting bracket: base and upright wall, pocket, gussets, counterbored patterns, bore. */
  basMountBracket(lang) {
    const b = builder(createPart(L(lang, 'CNC 장착 브래킷', 'CNC mounting bracket'), { material: 'al-6061', partNo: 'BR-1201' }));
    const base = b.sketch('top', (k) => centreRect(k, 140, 90));
    b.add('extrude', { sketch: base.id, depth: 12 });
    // The upright wall along the back edge (z −45 … −33), 82 high.
    const wall = b.sketch('top', (k) => addRectangle(k, -70, 33, 70, 45));
    b.add('extrude', { sketch: wall.id, depth: 82 });
    b.add('fillet', { radius: 6, edges: b.edges((e) => isLine(e) && near(e.mid[1], 12) && near(e.mid[2], -33) && Math.abs(e.dir[0]) > 0.99) });
    b.add('fillet', { radius: 10, edges: b.edges((e) => isLine(e) && Math.abs(e.dir[1]) > 0.99 && near(Math.abs(e.mid[0]), 70) && (near(e.mid[2], 45) || near(e.mid[2], -45))) });
    b.add('chamfer', { distance: 2, edges: b.edges((e) => isLine(e) && near(e.mid[1], 82) && Math.abs(e.dir[0]) > 0.99) });
    // A gusset at x = 60, mirrored to x = −60.
    const ribPlane = b.plane('right', 60);
    const rs = b.sketch(ribPlane, (k) => addLine(k, 33, 64, -20, 12));
    const rib = b.add('rib', { sketch: rs.id, thickness: 8 });
    b.add('mirror', { seeds: [rib.id], plane: RIGHT });
    // A pocket in the base with rounded corners.
    const topFace = b.plane('top', 12);
    const ps = b.sketch(topFace, (k) => addRectangle(k, -28, -32, 28, -4));
    b.add('extrude', { sketch: ps.id, op: 'cut', depth: 6 });
    b.add('fillet', { radius: 5, edges: b.edges((e) => isLine(e) && Math.abs(e.dir[1]) > 0.99 && e.mid[1] > 6 && e.mid[1] < 12 && near(Math.abs(e.mid[0]), 28) && e.mid[2] > 3 && e.mid[2] < 33) });
    // Base holes: one counterbored seed, a 2 × 2 pattern.
    const hs = b.sketch(topFace, (k) => point(k, -46, -26));
    const hole = b.add('hole', { sketch: hs.id, kind: 'counterbore', diameter: 9, cbDiameter: 15, cbDepth: 5, through: true });
    b.add('linearPattern', { seeds: [hole.id], direction: { kind: 'axis', axis: 'x' }, spacing: 92, count: 2, direction2: { kind: 'axis', axis: 'z' }, spacing2: 44, count2: 2, reverse2: true });
    // The wall: a Ø30 bore and four counterbored holes from its inner face.
    const inner = b.plane('front', -33);
    const bore = b.sketch(inner, (k) => circle(k, 0, 55, 30));
    b.add('extrude', { sketch: bore.id, op: 'cut', end: 'through' });
    b.add('chamfer', { distance: 1, edges: b.edges((e) => isCircle(e) && near(hyp(e.mid[0], e.mid[1] - 55), 15, 0.02)) });
    const ws = b.sketch(inner, (k) => { point(k, -30, 32); point(k, 30, 32); point(k, -30, 72); point(k, 30, 72); });
    b.add('hole', { sketch: ws.id, kind: 'counterbore', diameter: 6.6, cbDiameter: 11, cbDepth: 4, through: true });
    return b.part;
  },

  /** Hydraulic manifold: drilled ports that meet inside the block, tapped port bores, mounting holes. */
  basManifold(lang) {
    const b = builder(createPart(L(lang, '유압 매니폴드 블록', 'Hydraulic manifold block'), { material: 'al-6061', partNo: 'HM-4P-80' }));
    const s = b.sketch('top', (k) => centreRect(k, 80, 60));
    b.add('extrude', { sketch: s.id, depth: 50 });
    b.add('chamfer', { distance: 1.5, edges: b.edges(isLine) });
    // P and T ports from the top: counterbored, blind (drill points).
    const top = b.plane('top', 50);
    const tp = b.sketch(top, (k) => { point(k, -20, 0); point(k, 20, 0); });
    b.add('hole', { sketch: tp.id, kind: 'counterbore', diameter: 10, cbDiameter: 18, cbDepth: 4, depth: 35, through: false });
    b.add('thread', { edge: b.edges((e) => isCircle(e) && near(e.mid[1], 46, 0.02) && near(hyp(e.mid[0] - 20, e.mid[2]), 5, 0.02))[0], pitch: 1.5, length: 12, size: 'M12', cosmetic: true });
    // A and B work ports from the front face, meeting the vertical bores.
    const front = b.plane('front', 30);
    const fp = b.sketch(front, (k) => { point(k, -20, 25); point(k, 20, 25); });
    b.add('hole', { sketch: fp.id, kind: 'counterbore', diameter: 8, cbDiameter: 14, cbDepth: 3, depth: 30, through: false });
    // A gauge port from the right side (countersunk) across to the T bore.
    const right = b.plane('right', 40);
    const gp = b.sketch(right, (k) => point(k, 0, 15));
    b.add('hole', { sketch: gp.id, kind: 'countersink', diameter: 8, csDiameter: 14, csAngle: 90, depth: 45, through: false });
    // A cartridge-valve cavity from the left side, into the P bore.
    const left = flipped(b, 'right', -40);
    const cv = b.sketch(left, (k) => point(k, 0, -30));
    b.add('hole', { sketch: cv.id, kind: 'counterbore', diameter: 16, cbDiameter: 24, cbDepth: 3, depth: 18, through: false });
    // An O-ring face groove around the P port.
    const og = b.sketch(top, (k) => { circle(k, -20, 0, 26); circle(k, -20, 0, 21); });
    b.add('extrude', { sketch: og.id, op: 'cut', depth: 1.6 });
    // Four through mounting holes, a 2 × 2 pattern.
    const mh = b.sketch(top, (k) => point(k, -32, 22));
    const m = b.add('hole', { sketch: mh.id, diameter: 6.6, through: true });
    b.add('linearPattern', { seeds: [m.id], direction: { kind: 'axis', axis: 'x' }, spacing: 64, count: 2, direction2: { kind: 'axis', axis: 'z' }, spacing2: 44, count2: 2 });
    return b.part;
  },

  /** Flanged reducing tee: run and branch revolved, the junction filleted, bores and bolt circles. */
  basPipeTee(lang) {
    const b = builder(createPart(L(lang, '플랜지 이경 티', 'Flanged reducing tee'), { material: 'stainless-304', partNo: 'PT-DN50x32' }));
    const run = b.sketch('front', (k) => {
      poly(k, [[-80, 0], [80, 0], [80, 55], [66, 55], [66, 30], [-66, 30], [-66, 55], [-80, 55]]);
      addLine(k, -90, 0, 90, 0, { construction: true });
    });
    b.add('revolve', { sketch: run.id });
    const branch = b.sketch('front', (k) => {
      poly(k, [[0, 0], [22, 0], [22, 66], [45, 66], [45, 80], [0, 80]]);
      addLine(k, 0, -10, 0, 90, { construction: true });
    });
    b.add('revolve', { sketch: branch.id });
    b.add('fillet', { radius: 4, edges: b.edges((e) => !isLine(e) && !isCircle(e) && e.mid[1] > 15) });
    b.add('fillet', { radius: 3, edges: b.edges((e) => isCircle(e) && ((near(Math.abs(e.mid[0]), 66) && near(hyp(e.mid[1], e.mid[2]), 30, 0.02)) || (near(e.mid[1], 66) && near(hyp(e.mid[0], e.mid[2]), 22, 0.02)))) });
    // The bores: the run by a cut-revolve, the branch by a cut-extrude down to the run.
    const rb = b.sketch('front', (k) => {
      poly(k, [[-81, 0], [81, 0], [81, 24], [-81, 24]]);
      addLine(k, -90, 0, 90, 0, { construction: true });
    });
    b.add('revolve', { sketch: rb.id, op: 'cut' });
    const bb = b.sketch(b.plane('top', 81), (k) => circle(k, 0, 0, 34));
    b.add('extrude', { sketch: bb.id, op: 'cut', depth: 81 });
    b.add('chamfer', { distance: 1.5, edges: b.edges((e) => isCircle(e) && ((near(Math.abs(e.mid[0]), 80) && near(hyp(e.mid[1], e.mid[2]), 24, 0.02)) || (near(e.mid[1], 80) && near(hyp(e.mid[0], e.mid[2]), 17, 0.02)))) });
    // Bolt holes: one on each run flange, patterned 8× about the run axis; 6× on the branch flange.
    const ha = b.sketch(b.plane('right', 80), (k) => point(k, 0, 43));
    const hA = b.add('hole', { sketch: ha.id, diameter: 11, depth: 16, through: false });
    const hb = b.sketch(flipped(b, 'right', -80), (k) => point(k, 0, 43));
    const hB = b.add('hole', { sketch: hb.id, diameter: 11, depth: 16, through: false });
    b.add('circularPattern', { seeds: [hA.id, hB.id], axis: { kind: 'axis', axis: 'x' }, count: 8 });
    const hc = b.sketch(b.plane('top', 80), (k) => point(k, 35, 0));
    const hC = b.add('hole', { sketch: hc.id, diameter: 9, depth: 16, through: false });
    b.add('circularPattern', { seeds: [hC.id], axis: { kind: 'axis', axis: 'y' }, count: 6 });
    return b.part;
  },

  /** Stepped clevis: rounded fork with a slot and pin bore, stepped threaded shank with wrench flats. */
  basClevis(lang) {
    const b = builder(createPart(L(lang, '단붙이 클레비스', 'Stepped clevis'), { material: 'steel-4340', partNo: 'CL-M20-16' }));
    // The fork seen from the side (right plane): a rectangle with a round top, 40 wide (x).
    const fork = b.sketch('right', (k) => {
      const l1 = addLine(k, -15, 0, 15, 0);
      const l2 = addLine(k, 0, 0, 15, 45, { from: l1.p2 });
      const arc = addArc(k, 0, 45, 15, 0, Math.PI, { from: l2.p2 });
      addLine(k, 0, 0, 0, 0, { from: arc.p2, to: l1.p1 });
      dim(k, { type: 'distance', a: l1.id, value: 30 });
      dim(k, { type: 'distance', a: l2.id, value: 45 });
    });
    b.add('extrude', { sketch: fork.id, end: 'midplane', depth: 40 });
    const slot = b.sketch('front', (k) => addRectangle(k, -8, 22, 8, 70));
    b.add('extrude', { sketch: slot.id, op: 'cut', end: 'throughBoth' });
    b.add('fillet', { radius: 3, edges: b.edges((e) => isLine(e) && near(e.mid[1], 22) && near(Math.abs(e.mid[0]), 8) && Math.abs(e.dir[2]) > 0.99) });
    const pin = b.sketch('right', (k) => circle(k, 0, 45, 16));
    b.add('extrude', { sketch: pin.id, op: 'cut', end: 'throughBoth' });
    b.add('chamfer', { distance: 1, edges: b.edges((e) => isCircle(e) && near(hyp(e.mid[1] - 45, e.mid[2]), 8, 0.02)) });
    // The stepped shank: Ø28 then Ø20 (M20), with wrench flats on the Ø28 step.
    const s1 = b.sketch('top', (k) => circle(k, 0, 0, 28));
    b.add('extrude', { sketch: s1.id, depth: 22, reverse: true });
    const s2 = b.sketch(b.plane('top', -22), (k) => circle(k, 0, 0, 20));
    b.add('extrude', { sketch: s2.id, depth: 28, reverse: true });
    b.add('chamfer', { distance: 1.5, edges: b.edges((e) => circleY(e, -50, 10)) });
    b.add('chamfer', { distance: 1, edges: b.edges((e) => circleY(e, -22, 14)) });
    const flats = b.sketch('top', (k) => { addRectangle(k, 11, -16, 16, 16); addRectangle(k, -16, -16, -11, 16); });
    b.add('extrude', { sketch: flats.id, op: 'cut', depth: 16 });
    b.add('thread', { edge: b.edges((e) => circleY(e, -48.5, 10))[0], pitch: 2.5, length: 20, size: 'M20' });
    // A cross hole for a cotter pin through the thread.
    const ch = b.sketch(b.plane('front', 15), (k) => point(k, 0, -44));
    b.add('hole', { sketch: ch.id, diameter: 4, through: true });
    return b.part;
  },

  /** Name plate: a recessed field with raised text, an engraved serial number, a domed badge. */
  basNamePlate(lang) {
    const b = builder(createPart(L(lang, '각인 명판', 'Engraved name plate'), { material: 'al-6061', partNo: 'NP-120-50', color: '#b9c2cc' }));
    const s = b.sketch('top', (k) => centreRect(k, 120, 50));
    b.add('extrude', { sketch: s.id, depth: 5 });
    b.add('fillet', { radius: 6, edges: b.edges((e) => isLine(e) && Math.abs(e.dir[1]) > 0.99) });
    b.add('chamfer', { distance: 0.8, edges: b.edges((e) => near(e.mid[1], 5)) });
    // The recessed field (a raised border is left around it).
    const face = b.plane('top', 5);
    const rs = b.sketch(face, (k) => centreRect(k, 100, 34));
    b.add('extrude', { sketch: rs.id, op: 'cut', depth: 1.2 });
    b.add('fillet', { radius: 3, edges: b.edges((e) => isLine(e) && Math.abs(e.dir[1]) > 0.99 && near(Math.abs(e.mid[0]), 50) && near(Math.abs(e.mid[2]), 17)) });
    // Raised lettering and a domed badge on the field.
    const floor = b.plane('top', 3.8);
    const ts = b.sketch(floor, (k) => addText(k, -26, -5, 'MYMECH', 11));
    b.add('extrude', { sketch: ts.id, depth: 1 });
    const badge = b.sketch(floor, (k) => circle(k, -39, 0, 14));
    b.add('extrude', { sketch: badge.id, depth: 0.8 });
    b.add('dome', { faces: b.faces((f) => f.type === 'PLANE' && near(f.center[1], 4.6) && near(f.center[0], -39, 0.05)), height: 1.4 });
    // The serial number engraved into the lower border.
    const sn = b.sketch(face, (k) => addText(k, -22, -24, 'SN 2026-0042', 4));
    b.add('extrude', { sketch: sn.id, op: 'cut', depth: 0.4 });
    // Countersunk screw holes on the short sides.
    const hs = b.sketch(face, (k) => { point(k, -55, 0); point(k, 55, 0); });
    b.add('hole', { sketch: hs.id, kind: 'countersink', diameter: 3.4, csDiameter: 7, csAngle: 90, through: true });
    return b.part;
  },

  /** Cast bearing cap: arched body with drafted sides, fillets, half bore with oil groove, bolt holes. */
  basBearingCap(lang) {
    const b = builder(createPart(L(lang, '주조 베어링 캡', 'Cast bearing cap'), { material: 'cast-iron', partNo: 'BC-60-140' }));
    const xs = Math.sqrt(50 * 50 - 20 * 20);
    const body = b.sketch('front', (k) => {
      const l1 = addLine(k, -70, 0, 70, 0);
      const l2 = addLine(k, 0, 0, 70, 20, { from: l1.p2 });
      const l3 = addLine(k, 0, 0, xs, 20, { from: l2.p2 });
      const arc = addArc(k, 0, 0, 50, Math.atan2(20, xs), Math.PI - Math.atan2(20, xs), { from: l3.p2 });
      const l4 = addLine(k, 0, 0, -70, 20, { from: arc.p2 });
      addLine(k, 0, 0, 0, 0, { from: l4.p2, to: l1.p1 });
      dim(k, { type: 'distance', a: l1.id, value: 140 });
      dim(k, { type: 'distance', a: l2.id, value: 20 });
      dim(k, { type: 'radius', a: arc.id, value: 50 });
    });
    b.add('extrude', { sketch: body.id, end: 'midplane', depth: 40 });
    // Casting draft on the side faces, pulled up from the parting plane.
    b.add('draft', { angle: 3, neutral: TOP, faces: b.faces((f) => f.type === 'PLANE' && Math.abs(f.normal[2]) > 0.99) });
    b.add('fillet', { radius: 6, edges: b.edges((e) => near(e.mid[1], 20, 0.3) && near(Math.abs(e.mid[0]), xs, 1.5) && Math.abs(e.dir[2]) > 0.9) });
    b.add('fillet', { radius: 2, edges: b.edges((e) => near(Math.abs(e.mid[0]), 70, 0.6) && e.mid[1] > 19 && Math.abs(e.dir[2]) > 0.9) });
    // The half bore and its oil groove (a cut-revolve about the bore axis).
    const bore = b.sketch('front', (k) => circle(k, 0, 0, 60));
    b.add('extrude', { sketch: bore.id, op: 'cut', end: 'throughBoth' });
    const groove = b.sketch('right', (k) => {
      poly(k, [[-2.5, 25], [2.5, 25], [2.5, 32], [-2.5, 32]]);
      addLine(k, -30, 0, 30, 0, { construction: true });
    });
    b.add('revolve', { sketch: groove.id, op: 'cut' });
    b.add('chamfer', { distance: 1, edges: b.edges((e) => !isLine(e) && near(hyp(e.mid[0], e.mid[1]), 30, 0.5) && Math.abs(e.mid[2]) > 15) });
    // Spot-faced bolt holes in the feet and an oil hole down through the crown.
    const hs = b.sketch(b.plane('top', 20), (k) => { point(k, -58, 0); point(k, 58, 0); });
    b.add('hole', { sketch: hs.id, kind: 'counterbore', diameter: 11, cbDiameter: 20, cbDepth: 1.5, through: true });
    const oil = b.sketch(b.plane('top', 55), (k) => point(k, 0, 0));
    b.add('hole', { sketch: oil.id, diameter: 6, depth: 30, through: false });
    return b.part;
  },

  /** Extruded heat sink: a base with a linear pattern of fins, a clip notch, root fillets, mounting holes. */
  basHeatSink(lang) {
    const b = builder(createPart(L(lang, '방열판', 'Heat sink'), { material: 'al-6061', partNo: 'HS-120-44', color: '#2c3036' }));
    const base = b.sketch('top', (k) => centreRect(k, 120, 80));
    b.add('extrude', { sketch: base.id, depth: 8 });
    b.add('fillet', { radius: 5, edges: b.edges((e) => isLine(e) && Math.abs(e.dir[1]) > 0.99) });
    const fin = b.sketch(b.plane('top', 8), (k) => addRectangle(k, -49, -40, -47, 40));
    const f1 = b.add('extrude', { sketch: fin.id, depth: 36 });
    b.add('linearPattern', { seeds: [f1.id], direction: { kind: 'axis', axis: 'x' }, spacing: 8, count: 13 });
    b.add('fillet', { radius: 0.8, edges: b.edges((e) => isLine(e) && near(e.mid[1], 8) && Math.abs(e.dir[2]) > 0.99 && Math.abs(e.mid[0]) < 50) });
    // A notch across the fins for the retaining clip.
    const notch = b.sketch('right', (k) => addRectangle(k, -5, 26, 5, 50));
    b.add('extrude', { sketch: notch.id, op: 'cut', end: 'throughBoth' });
    // The thermal-pad pocket underneath and four counterbored mounting holes in the side lands.
    const pad = b.sketch('top', (k) => centreRect(k, 50, 50));
    b.add('extrude', { sketch: pad.id, op: 'cut', depth: 0.5, reverse: true });
    const hs = b.sketch(b.plane('top', 8), (k) => { for (const x of [-54.5, 54.5]) for (const y of [-30, 30]) point(k, x, y); });
    b.add('hole', { sketch: hs.id, kind: 'counterbore', diameter: 4.5, cbDiameter: 8.5, cbDepth: 3, through: true });
    return b.part;
  },

  /** Connecting rod: big and small ends, a tapered loft shank with I-beam pockets, cap bolt pads. */
  basConRod(lang) {
    const b = builder(createPart(L(lang, '커넥팅 로드', 'Connecting rod'), { material: 'steel-4340', partNo: 'CR-150-36' }));
    const big = b.sketch('front', (k) => circle(k, 0, 0, 60));
    b.add('extrude', { sketch: big.id, end: 'midplane', depth: 24 });
    const small = b.sketch('front', (k) => { const c = circle(k, 150, 0, 36); dim(k, { type: 'hdistance', a: 'O', b: c.c, value: 150 }); });
    b.add('extrude', { sketch: small.id, end: 'midplane', depth: 20 });
    // The shank: a loft from a 30-high section to an 18-high one, 14 thick.
    const s1 = b.sketch(b.plane('right', 20), (k) => centreRect(k, 14, 30));
    const s2 = b.sketch(b.plane('right', 140), (k) => centreRect(k, 14, 18));
    b.add('loft', { sketches: [s1.id, s2.id] });
    // Pads for the cap bolts on both sides of the big end.
    const pad = b.sketch('front', (k) => addRectangle(k, 18, -12, 34, 12));
    const p = b.add('extrude', { sketch: pad.id, end: 'midplane', depth: 24 });
    b.add('mirror', { seeds: [p.id], plane: RIGHT });
    // I-beam pockets on both faces of the shank.
    const pk = b.sketch(b.plane('front', 7), (k) => poly(k, [[40, -10], [122, -6], [122, 6], [40, 10]]));
    const cut = b.add('extrude', { sketch: pk.id, op: 'cut', depth: 3.5 });
    b.add('mirror', { seeds: [cut.id], plane: FRONT });
    // The bores, their chamfers, the cap bolt holes and the small-end oil hole.
    const bores = b.sketch('front', (k) => { circle(k, 0, 0, 36); circle(k, 150, 0, 20); });
    b.add('extrude', { sketch: bores.id, op: 'cut', end: 'throughBoth' });
    b.add('chamfer', { distance: 1, edges: b.edges((e) => isCircle(e) && (near(hyp(e.mid[0], e.mid[1]), 18, 0.02) || near(hyp(e.mid[0] - 150, e.mid[1]), 10, 0.02))) });
    const bolts = b.sketch(b.plane('top', 40), (k) => { point(k, -26, 0); point(k, 26, 0); });
    b.add('hole', { sketch: bolts.id, diameter: 8.5, through: true });
    const oil = b.sketch(b.plane('top', 20), (k) => point(k, 150, 0));
    b.add('hole', { sketch: oil.id, diameter: 4, depth: 12, through: false });
    return b.part;
  },

  /** NEMA 23 motor mount: an L bracket with a pilot bore, mirrored motor holes, slots and gussets. */
  basMotorMount(lang) {
    const b = builder(createPart(L(lang, 'NEMA 23 모터 마운트', 'NEMA 23 motor mount'), { material: 'al-6061', partNo: 'MM-N23-08' }));
    const base = b.sketch('top', (k) => centreRect(k, 120, 70));
    b.add('extrude', { sketch: base.id, depth: 8 });
    const up = b.sketch('top', (k) => addRectangle(k, -60, 27, 60, 35));
    b.add('extrude', { sketch: up.id, depth: 90 });
    b.add('fillet', { radius: 4, edges: b.edges((e) => isLine(e) && near(e.mid[1], 8) && near(e.mid[2], -27) && Math.abs(e.dir[0]) > 0.99) });
    b.add('fillet', { radius: 8, edges: b.edges((e) => isLine(e) && Math.abs(e.dir[1]) > 0.99 && near(Math.abs(e.mid[0]), 60) && near(e.mid[2], 35)) });
    b.add('fillet', { radius: 12, edges: b.edges((e) => isLine(e) && Math.abs(e.dir[2]) > 0.99 && near(Math.abs(e.mid[0]), 60) && near(e.mid[1], 90)) });
    // Adjusting slots in the base, mirrored.
    const sl = b.sketch('top', (k) => addSlot(k, 40, -6, 40, -26, 3.25));
    const slot = b.add('extrude', { sketch: sl.id, op: 'cut', end: 'throughBoth' });
    b.add('mirror', { seeds: [slot.id], plane: RIGHT });
    // The pilot bore Ø38.1 and the motor's 47.14 mm hole square (two holes mirrored about the bore's centre).
    const inner = b.plane('front', -27);
    const pilot = b.sketch(inner, (k) => circle(k, 0, 53, 38.1));
    b.add('extrude', { sketch: pilot.id, op: 'cut', end: 'through' });
    b.add('chamfer', { distance: 1, edges: b.edges((e) => isCircle(e) && near(hyp(e.mid[0], e.mid[1] - 53), 19.05, 0.02)) });
    const mh = b.sketch(inner, (k) => { point(k, -23.57, 76.57); point(k, 23.57, 76.57); });
    const holes = b.add('hole', { sketch: mh.id, kind: 'counterbore', diameter: 5.5, cbDiameter: 9.5, cbDepth: 3, through: true });
    b.add('mirror', { seeds: [holes.id], plane: b.plane('top', 53) });
    // A cable slot low in the upright and two gussets.
    const cs = b.sketch('front', (k) => addSlot(k, -20, 19, 20, 19, 4));
    b.add('extrude', { sketch: cs.id, op: 'cut', end: 'throughBoth' });
    const rs = b.sketch(b.plane('right', 52), (k) => addLine(k, 27, 70, -25, 8));
    const rib = b.add('rib', { sketch: rs.id, thickness: 6 });
    b.add('mirror', { seeds: [rib.id], plane: RIGHT });
    return b.part;
  },

  /** Cam disc: a closed-spline lobe, hubs on both faces, keyed bore, lightening holes, tapped set screw. */
  basCamDisc(lang) {
    const b = builder(createPart(L(lang, '캠 디스크', 'Cam disc'), { material: 'steel-4340', partNo: 'CM-120-16' }));
    const radii = [42, 50, 57, 60, 57, 50, 42, 40, 40, 40, 40, 40];
    const cam = b.sketch('front', (k) => addSpline(k, radii.map((r, i) => [r * Math.cos((i * Math.PI) / 6), r * Math.sin((i * Math.PI) / 6)]), { closed: true }));
    b.add('extrude', { sketch: cam.id, depth: 16 });
    const hub = b.sketch(b.plane('front', 16), (k) => circle(k, 0, 0, 44));
    b.add('extrude', { sketch: hub.id, depth: 12 });
    const back = b.sketch('front', (k) => circle(k, 0, 0, 44));
    b.add('extrude', { sketch: back.id, depth: 6, reverse: true });
    b.add('chamfer', { distance: 1, edges: b.edges((e) => isCircle(e) && near(hyp(e.mid[0], e.mid[1]), 22, 0.02) && (near(e.mid[2], 28) || near(e.mid[2], -6))) });
    // Bore with keyway.
    const bore = b.sketch('front', (k) => circle(k, 0, 0, 20));
    b.add('extrude', { sketch: bore.id, op: 'cut', end: 'throughBoth' });
    const key = b.sketch('front', (k) => addRectangle(k, -3, 8, 3, 12.8));
    b.add('extrude', { sketch: key.id, op: 'cut', end: 'throughBoth' });
    // Lightening holes, 4 about the axis.
    const lh = b.sketch('front', (k) => circle(k, 0, -30, 12));
    const lc = b.add('extrude', { sketch: lh.id, op: 'cut', end: 'throughBoth' });
    b.add('circularPattern', { seeds: [lc.id], axis: { kind: 'axis', axis: 'z' }, count: 4 });
    // A spot-faced, tapped M5 set-screw hole down through the front hub to the bore.
    const ss = b.sketch(b.plane('top', 22.5), (k) => point(k, 0, -22));
    b.add('hole', { sketch: ss.id, kind: 'counterbore', diameter: 4.2, cbDiameter: 9, cbDepth: 2, depth: 14, through: false });
    b.add('thread', { edge: b.edges((e) => isCircle(e) && near(e.mid[1], 20.5, 0.02) && near(hyp(e.mid[0], e.mid[2] - 22), 2.1, 0.02))[0], pitch: 0.8, length: 6, size: 'M5', cosmetic: true });
    // A timing mark on the lobe.
    const mark = b.sketch(b.plane('front', 16), (k) => poly(k, [[-1.2, 56], [1.2, 56], [0, 52]]));
    b.add('extrude', { sketch: mark.id, op: 'cut', depth: 0.6 });
    return b.part;
  },

  /** M12 socket head cap screw: hex socket with a drill-point bottom, knurled head, rolled thread. */
  basCapScrew(lang) {
    const b = builder(createPart(L(lang, '육각 구멍 볼트 M12×50', 'Socket head cap screw M12×50'), { material: 'steel-4340', partNo: 'ISO4762-M12x50', color: '#3a3d42' }));
    const head = b.sketch('top', (k) => circle(k, 0, 0, 18));
    b.add('extrude', { sketch: head.id, depth: 12 });
    const shank = b.sketch('top', (k) => circle(k, 0, 0, 12));
    b.add('extrude', { sketch: shank.id, depth: 50, reverse: true });
    b.add('fillet', { radius: 0.6, edges: b.edges((e) => circleY(e, 0, 6)) });
    b.add('chamfer', { distance: 1, edges: b.edges((e) => circleY(e, 12, 9)) });
    b.add('chamfer', { distance: 1, edges: b.edges((e) => circleY(e, -50, 6)) });
    // The hex socket (10 across flats) and its drill-point bottom.
    const socket = b.sketch(b.plane('top', 12), (k) => addPolygon(k, 0, 0, 10 / Math.sqrt(3), 6, 0));
    b.add('extrude', { sketch: socket.id, op: 'cut', depth: 6 });
    const cone = b.sketch('front', (k) => {
      poly(k, [[0, 6], [5, 6], [0, 3]]);
      addLine(k, 0, -5, 0, 20, { construction: true });
    });
    b.add('revolve', { sketch: cone.id, op: 'cut' });
    b.add('thread', { edge: b.edges((e) => circleY(e, -49, 6))[0], pitch: 1.75, length: 20, size: 'M12' });
    // Knurled head: a V groove sketched once and copied round by a circular sketch pattern, cut in one go.
    const v = b.sketch(b.plane('top', 12), (k) => {
      const before = new Set(k.entities.map((e) => e.id));
      poly(k, [[9.6, 0], [8.5, 0.7], [8.5, -0.7]]);
      circularSketchPattern(k, k.entities.filter((e) => !before.has(e.id) && e.type === 'line').map((e) => e.id), { count: 30 });
    });
    b.add('extrude', { sketch: v.id, op: 'cut', depth: 13 });
    return b.part;
  },

  /** Castle nut M16: hex with 30° chamfers, a slotted crown, internal thread. */
  basCastleNut(lang) {
    const b = builder(createPart(L(lang, '홈붙이 너트 M16', 'Castle nut M16'), { material: 'steel-1020', partNo: 'KS-M16-CN' }));
    const hex = b.sketch('top', (k) => { addPolygon(k, 0, 0, 24 / Math.sqrt(3), 6, 0); circle(k, 0, 0, 14); });
    b.add('extrude', { sketch: hex.id, depth: 13 });
    b.add('thread', { edge: b.edges((e) => circleY(e, 0, 7))[0], pitch: 2, length: 12, size: 'M16', internal: 'internal', cosmetic: true });
    const crown = b.sketch(b.plane('top', 13), (k) => { circle(k, 0, 0, 22); circle(k, 0, 0, 14); });
    b.add('extrude', { sketch: crown.id, depth: 6 });
    b.add('chamfer', { distance: 0.8, edges: b.edges((e) => circleY(e, 19, 11) || circleY(e, 19, 7)) });
    // 30° chamfers on the hex corners: two triangles revolved as a cut.
    const t = 2.5 * Math.tan(Math.PI / 6);
    const ch = b.sketch('front', (k) => {
      poly(k, [[12, 0], [14.5, 0], [14.5, t]]);
      poly(k, [[12, 13], [14.5, 13 - t], [14.5, 13]]);
      addLine(k, 0, -5, 0, 25, { construction: true });
    });
    b.add('revolve', { sketch: ch.id, op: 'cut' });
    // Six slots in the crown: one across the nut, patterned 3× at 60°.
    const sl = b.sketch(b.plane('top', 19), (k) => centreRect(k, 30, 4.5));
    const slot = b.add('extrude', { sketch: sl.id, op: 'cut', depth: 5 });
    b.add('circularPattern', { seeds: [slot.id], axis: { kind: 'axis', axis: 'y' }, count: 3, angle: 120 });
    return b.part;
  },

  /** Ball knob: revolved ball on a neck, grip flutes, a dome on the flat top, threaded insert bore, index mark. */
  basBallKnob(lang) {
    const b = builder(createPart(L(lang, '볼 손잡이', 'Ball knob'), { material: 'pom', partNo: 'BK-40-M8', color: '#24272c' }));
    const yNeck = 30 - Math.sqrt(400 - 81);
    const prof = b.sketch('front', (k) => {
      const first = addLine(k, 0, 0, 16, 0);
      let prev = addLine(k, 0, 0, 16, 4, { from: first.p2 });
      prev = addLine(k, 0, 0, 9, 8, { from: prev.p2 });
      prev = addLine(k, 0, 0, 9, yNeck, { from: prev.p2 });
      const arc = addArc(k, 0, 30, 20, Math.atan2(yNeck - 30, 9), Math.atan2(16, 12), { from: prev.p2 });
      dim(k, { type: 'radius', a: arc.id, value: 20 });
      prev = addLine(k, 0, 0, 0, 46, { from: arc.p2 });
      addLine(k, 0, 0, 0, 0, { from: prev.p2, to: first.p1 });
      addLine(k, 0, -5, 0, 55, { construction: true });
    });
    b.add('revolve', { sketch: prof.id });
    b.add('fillet', { radius: 1, edges: b.edges((e) => circleY(e, 0, 16)) });
    b.add('dome', { faces: b.faces((f) => f.type === 'PLANE' && near(f.center[1], 46)), height: 2 });
    // A threaded insert bore from below (M8).
    const below = flipped(b, 'top', 0);
    const hs = b.sketch(below, (k) => point(k, 0, 0));
    b.add('hole', { sketch: hs.id, diameter: 6.8, depth: 16, through: false });
    b.add('thread', { edge: b.edges((e) => circleY(e, 0, 3.4))[0], pitch: 1.25, length: 12, size: 'M8', cosmetic: true });
    // An index mark wrapped onto the base collar.
    const ms = b.sketch(b.plane('front', 20), (k) => addRectangle(k, -0.8, 0.8, 0.8, 3.4));
    b.add('wrap', { sketch: ms.id, face: b.faces((f) => isCylinder(f.type) && near(f.radius ?? 0, 16, 0.01))[0], depth: 0.5, op: 'deboss' });
    // Grip flutes (a circular sketch pattern, cut at once) around the ball's equator.
    const fl = b.sketch('top', (k) => { const c = circle(k, 21.5, 0, 6); circularSketchPattern(k, [c.id], { count: 18 }); });
    b.add('extrude', { sketch: fl.id, op: 'cut', end: 'throughBoth' });
    return b.part;
  },

  /** T-slot table section: three T slots, an underside pocket grid, locating and tapped holes. */
  basTSlotTable(lang) {
    const b = builder(createPart(L(lang, 'T 홈 테이블 단면', 'T-slot table section'), { material: 'cast-iron', partNo: 'TT-240-14' }));
    const s = b.sketch('top', (k) => centreRect(k, 240, 160));
    b.add('extrude', { sketch: s.id, depth: 50 });
    b.add('chamfer', { distance: 2, edges: b.edges((e) => isLine(e) && near(e.mid[1], 50)) });
    // One T slot along x (14 wide neck, 24 wide under), patterned 3× across.
    const ts = b.sketch('right', (k) => poly(k, [[43, 51], [57, 51], [57, 36], [62, 36], [62, 26], [38, 26], [38, 36], [43, 36]]));
    const slot = b.add('extrude', { sketch: ts.id, op: 'cut', end: 'throughBoth' });
    b.add('linearPattern', { seeds: [slot.id], direction: { kind: 'axis', axis: 'z' }, spacing: 50, count: 3 });
    b.add('chamfer', { distance: 1, edges: b.edges((e) => isLine(e) && near(e.mid[1], 50) && Math.abs(e.dir[0]) > 0.99 && [-50, 0, 50].some((z) => near(Math.abs(e.mid[2] - z), 7))) });
    // The cored underside: one pocket patterned 4 × 2.
    const pk = b.sketch('top', (k) => addRectangle(k, -105, -36, -60, -14));
    const pocket = b.add('extrude', { sketch: pk.id, op: 'cut', depth: 18, reverse: true });
    b.add('linearPattern', { seeds: [pocket.id], direction: { kind: 'axis', axis: 'x' }, spacing: 55, count: 4, direction2: { kind: 'axis', axis: 'z' }, spacing2: 50, count2: 2, reverse2: true });
    b.add('fillet', { radius: 4, edges: b.edges((e) => isLine(e) && Math.abs(e.dir[1]) > 0.99 && e.mid[1] < 18 && Math.abs(e.mid[0]) < 110 && Math.abs(e.mid[2]) < 40) });
    // Locating holes on top (countersunk), tapped M12 holes in the front face.
    const lh = b.sketch(b.plane('top', 50), (k) => { for (const x of [-100, 100]) for (const y of [-25, 25]) point(k, x, y); });
    b.add('hole', { sketch: lh.id, kind: 'countersink', diameter: 12, csDiameter: 15, csAngle: 90, depth: 15, through: false });
    const th = b.sketch(b.plane('front', 80), (k) => { point(k, -80, 25); point(k, 80, 25); });
    b.add('hole', { sketch: th.id, diameter: 10.2, depth: 24, through: false });
    b.add('thread', { edge: b.edges((e) => isCircle(e) && near(e.mid[2], 80, 0.02) && near(hyp(e.mid[0] - 80, e.mid[1] - 25), 5.1, 0.02))[0], pitch: 1.75, length: 18, size: 'M12', cosmetic: true });
    return b.part;
  },

  /** Torsion spring clip: a helical coil and two legs with hooks, each swept along a 3D sketch. */
  basSpringClip(lang) {
    const b = builder(createPart(L(lang, '비틀림 스프링 클립', 'Torsion spring clip'), { material: 'stainless-304', partNo: 'TS-12-2.5' }));
    const r = 12; const pitch = 4; const turns = 3.5; const h = pitch * turns;
    const helix = b.add('helix', { plane: TOP, radius: r, pitch, turns });
    const p1 = b.sketch('front', (k) => circle(k, r, 0, 2.5));
    b.add('sweep', { sketch: p1.id, path: helix.id, frenet: true });
    // Leg 1 from the coil's start: straight out along +z, then a hooked end.
    const leg1 = b.add('sketch3d', { points: [[r, 0, 0], [r, 0, 40], [r + 6, 0, 46], [r + 12, 0, 40]], spline: false });
    b.add('sweep', { sketch: p1.id, path: leg1.id, transition: 'round' });
    // Leg 2 from the coil's end: out along +z, bent down and out, ending in an eye-like hook.
    const p2 = b.sketch('front', (k) => circle(k, -r, h, 2.5));
    const leg2 = b.add('sketch3d', { points: [[-r, h, 0], [-r, h, 30], [-r - 10, h + 8, 45], [-r - 10, h + 16, 52]], spline: true });
    b.add('sweep', { sketch: p2.id, path: leg2.id });
    return b.part;
  },
};

export function build(id, lang = 'ko') {
  const make = BUILD[id];
  if (!make) return null;
  const sample = SAMPLES.find((s) => s.id === id);
  const project = createProject({ name: sample[lang === 'en' ? 'en' : 'ko'][0], kind: 'none' });
  const part = make(lang);
  part.description = sample[lang === 'en' ? 'en' : 'ko'][1];
  project.parts.push(part);
  project.active = { kind: 'part', id: part.id };
  return project;
}
