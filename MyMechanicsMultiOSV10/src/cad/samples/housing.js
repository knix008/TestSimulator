// Start-page samples of the "housing" group (하우징·판금형 / Housings): castings, moulded plastic parts,
// sheet metal, a weldment and surface-modelled shells. Every sample is a real feature tree built on the
// kernel when it is opened (fillets, shells and drafts pick their edges and faces from the built body).
// Nothing from the imports is used at module level: samples.js imports this module (circular import).
import { builder, centreRect, circle, poly, near, dim, component, mate, settle } from '../samples.js';
import { addLine, addArc, addCenterRectangle, addSlot, addText, newSketchId, ORIGIN } from '../sketch.js';
import { addEllipse, sketchFillet } from '../sketchtools.js';
import { createAssembly, createPart, createProject } from '../document.js';
import { isCylinder, edgeSignature, faceSignature } from '../refs.js';
import { regenerate } from '../features.js';
import { mateEntityOfFace, quatFromAxisAngle, quatIdentity } from '../assembly.js';

export const SAMPLES = [
  { id: 'hsgGearbox', group: 'housing', icon: 'featShell', ko: ['기어박스 하우징', '구배 · 쉘 · 베어링 보스와 보어 · 보강 리브 · 대칭 복사 · 볼트 구멍 패턴 · 드레인 장식 나사산'], en: ['Gearbox housing', 'Draft · shell · bearing bosses and bores · ribs · mirror · bolt hole patterns · cosmetic drain thread'] },
  { id: 'hsgEnclosure', group: 'housing', icon: 'configurations', ko: ['전자 기기 케이스 (소·대)', '전역 변수 · 컨피규레이션 · 구배 돌출 · 쉘 · 스냅 고리 · 통풍구 패턴 · 나사 보스'], en: ['Electronics enclosure (S/L)', 'Global variables · configurations · drafted extrude · shell · snap lugs · vent pattern · screw bosses'] },
  { id: 'hsgCover', group: 'housing', icon: 'cavity', ko: ['사출 성형 커버', '구배 · 쉘 · 리브 · 보스 · 파팅 라인 · 코어/캐비티 분할'], en: ['Injection-moulded cover', 'Draft · shell · ribs · bosses · parting line · core / cavity split'] },
  { id: 'hsgVolute', group: 'housing', icon: 'featSweep', ko: ['펌프 볼류트 케이싱', '회전 · 3중심 나선 스윕 · 스윕 컷 · 흡입/토출 플랜지 · 원형 패턴'], en: ['Pump volute casing', 'Revolve · three-centre spiral sweep · cut sweep · suction / discharge flanges · circular pattern'] },
  { id: 'hsgEndBell', group: 'housing', icon: 'featCutRevolve', ko: ['모터 엔드 벨', '회전 · 회전 컷 베어링 시트 · 리브 · 귀 · 통풍구 원형 패턴'], en: ['Motor end bell', 'Revolve · cut-revolve bearing seat · ribs · ears · vents in circular patterns'] },
  { id: 'hsgChassis', group: 'housing', icon: 'sheetMetal', ko: ['판금 섀시', '베이스 플랜지 · 조그 · 모서리 플랜지 · 헴 · 루버 슬롯 · 구멍 패턴 · 펼치기'], en: ['Sheet-metal chassis', 'Base flange · jog · edge flanges · hem · louvre slots · hole patterns · flat pattern'] },
  { id: 'hsgLBracket', group: 'housing', icon: 'flatten', ko: ['판금 L 브래킷', '스케치 필렛 · 펼친 상태 구멍 · 스케치 굽힘 · 거싯 · 펼치기'], en: ['Sheet-metal L bracket', 'Sketch fillets · holes cut flat · sketched bend · gussets · flat pattern'] },
  { id: 'hsgDinRail', group: 'housing', icon: 'edgeFlange', ko: ['DIN 레일 Z 브래킷 (TS35)', '베이스 플랜지 · 조그 · 걸림 · 리턴 플랜지 · 접시 구멍 · 슬롯 대칭 · 펼치기'], en: ['DIN-rail Z bracket (TS35)', 'Base flange · jog · hook and return flanges · countersunk holes · mirrored slots · flat pattern'] },
  { id: 'hsgRackPanel', group: 'housing', icon: 'featLinPattern', ko: ['1U 랙 패널', '판금 리턴 플랜지 · 랙 슬롯 · 통풍 패턴 · 스윕 손잡이 · 대칭 복사'], en: ['1U rack panel', 'Sheet-metal returns · rack slots · vent pattern · swept handles · mirror'] },
  { id: 'hsgHandle', group: 'housing', icon: 'draftAnalysis', ko: ['다이캐스트 손잡이 하우징', '스케치 필렛 · 구배 돌출 · 필렛 · 쉘 · 나사 보스 · 리브 패턴'], en: ['Die-cast handle housing', 'Sketch fillets · drafted extrude · fillets · shell · screw bosses · rib pattern'] },
  { id: 'hsgBatteryBox', group: 'housing', icon: 'assembly', ko: ['배터리 박스와 뚜껑', '어셈블리: 쉘 박스 · 나사 보스 · 칸막이 · 립 달린 뚜껑 · 일치·동심 메이트'], en: ['Battery box with lid', 'Assembly: shelled box · screw bosses · separators · lid with lip · coincident / concentric mates'] },
  { id: 'hsgGuard', group: 'housing', icon: 'structural', ko: ['기계 안전 가드 프레임', '구조 부재 (각관 · ㄱ형강) · 절단 목록 · 베이스 판 · 타공 패널'], en: ['Machine guard frame', 'Structural members (square tube, angle) · cut list · base plates · perforated panel'] },
  { id: 'hsgGrip', group: 'housing', icon: 'featThicken', ko: ['인체공학 그립 쉘', '타원 단면 곡면 로프트 · 두껍게 · 돔 캡 · 플랜지 · 버튼 구멍'], en: ['Ergonomic grip shell', 'Lofted surface through ellipses · thicken · domed cap · flange · button opening'] },
  { id: 'hsgNozzle', group: 'housing', icon: 'surfaceLoft', ko: ['청소기 바닥 노즐', '타원 단면 5개 경계 곡면 · 두껍게 · 회전 칼라 · 대칭 공기 구멍'], en: ['Vacuum floor nozzle', 'Boundary surface through five oval profiles · thicken · swivel collar · mirrored bleed holes'] },
  { id: 'hsgBottle', group: 'housing', icon: 'featDome', ko: ['스포츠 물병', '회전 · 역돔 바닥 · 허리 회전 컷 · 홈 패턴 · 나사산 목 · 쉘'], en: ['Sports bottle', 'Revolve · push-up dome · waist cut-revolve · flute pattern · threaded neck · shell'] },
];

const L = (lang) => (ko, en) => (lang === 'en' ? en : ko);

// ───────────────────────── sketch helpers

/** A standalone point (a hole position). */
function pt(s, x, y) {
  const p = { id: newSketchId('h'), type: 'point', x, y, standalone: true };
  s.entities.push(p);
  return p;
}

/** Places an entity's anchor (a point, a circle's centre) at (x, y) from the origin with dimensions (optionally driven by equations). */
function place(s, id, x, y, ex = null, ey = null) {
  dim(s, { type: 'hdistance', a: ORIGIN, b: id, value: x, ...(ex ? { expr: ex } : {}) });
  dim(s, { type: 'vdistance', a: ORIGIN, b: id, value: y, ...(ey ? { expr: ey } : {}) });
}

/** A circle at (x, y), diameter and position dimensioned. */
function circleAt(s, x, y, d, ex = null, ey = null) {
  if (!x && !y && !ex && !ey) return circle(s, 0, 0, d);
  const c = circle(s, x, y, d);
  place(s, c.id, x, y, ex, ey);
  return c;
}

/** A hole position at (x, y), dimensioned. */
function holeAt(s, x, y, ex = null, ey = null) {
  const p = pt(s, x, y);
  place(s, p.id, x, y, ex, ey);
  return p;
}

/** A w × h rectangle centred at (x, y), fully dimensioned. */
function rectAt(s, x, y, w, h, ex = null, ey = null) {
  if (!x && !y && !ex && !ey) return centreRect(s, w, h);
  const { lines, center } = addCenterRectangle(s, x, y, w / 2, h / 2);
  dim(s, { type: 'distance', a: lines[0].id, value: w });
  dim(s, { type: 'distance', a: lines[1].id, value: h });
  place(s, center.id, x, y, ex, ey);
  return lines;
}

const top = 'top'; const front = 'front'; const right = 'right';
const vertical = (e, k = 0.99) => Math.abs(e.dir[1]) > k;
const absNear = (v, x, tol = 0.01) => near(Math.abs(v), x, tol);

/**
 * Edges (signatures) of a body built from only some of the part's features: a cheap stand-in for b.edges() late in a
 * long tree, when those features alone give the same edge (a boss face's bore rim, a hole's rim). Rebuilding the
 * whole part for each pick made the bigger samples slow to open.
 */
function probeEdges(b, feats, test) {
  const r = regenerate({ ...b.part, features: feats });
  return r.body ? r.body.edges.map(edgeSignature).filter(test) : [];
}

/** faceEntity() of samples.js with each part built once (it rebuilds the part for every face otherwise). */
function cachedFaces(project) {
  const bodies = new Map();
  return (part, comp, test) => {
    if (!bodies.has(part.id)) bodies.set(part.id, regenerate(part, { project }).body);
    const face = bodies.get(part.id).faces.find((f) => test(faceSignature(f), f));
    if (!face) throw new Error(`sample: face not found in ${part.name}`);
    return { comp, ...mateEntityOfFace(face, faceSignature) };
  };
}

function partOnly(project, part) {
  project.parts.push(part);
  project.active = { kind: 'part', id: part.id };
  return project;
}

// ───────────────────────── gearbox housing

function gearbox(name) {
  const b = builder(createPart(name, { material: 'cast-iron', partNo: 'GB-H-220', description: 'Two-stage gearbox housing' }));
  const base = b.sketch(top, (k) => centreRect(k, 220, 140));
  b.add('extrude', { sketch: base.id, depth: 130 });
  // Casting draft on the four walls, from the parting plane at the bottom.
  b.add('draft', { angle: 1.5, neutral: { kind: 'std', name: 'top' }, faces: b.faces((f) => f.type === 'PLANE' && Math.abs(f.normal[1]) < 0.5) });
  b.add('fillet', { radius: 12, edges: b.edges((e) => vertical(e, 0.9)) });
  b.add('shell', { thickness: 10, faces: b.faces((f) => f.type === 'PLANE' && f.normal[1] > 0.99 && near(f.center[1], 130)) });
  // Top flange (the cover joint), its corners rounded, with the cover bolt pattern.
  const joint = b.plane(top, 130);
  const fl = b.sketch(joint, (k) => { centreRect(k, 270, 190); centreRect(k, 186, 106); });
  b.add('extrude', { sketch: fl.id, depth: 14, reverse: true });
  b.add('fillet', { radius: 14, edges: b.edges((e) => vertical(e) && absNear(e.mid[0], 135) && absNear(e.mid[2], 95)) });
  const fh = b.sketch(joint, (k) => holeAt(k, -105, -84));
  const flHole = b.add('hole', { sketch: fh.id, kind: 'simple', diameter: 11, through: true });
  b.add('linearPattern', { seeds: [flHole.id], direction: { kind: 'axis', axis: 'x' }, spacing: 70, count: 4, direction2: { kind: 'axis', axis: 'z' }, spacing2: 168, count2: 2, reverse2: true });
  const eh = b.sketch(joint, (k) => { holeAt(k, -124, 0); holeAt(k, 124, 0); });
  b.add('hole', { sketch: eh.id, kind: 'simple', diameter: 11, through: true });
  // Mounting foot with counterbored holes.
  const foot = b.sketch(top, (k) => centreRect(k, 290, 150));
  b.add('extrude', { sketch: foot.id, depth: 16 });
  b.add('fillet', { radius: 10, edges: b.edges((e) => vertical(e) && absNear(e.mid[0], 145) && absNear(e.mid[2], 75)) });
  const footTop = b.plane(top, 16);
  const mh = b.sketch(footTop, (k) => holeAt(k, -128, -55));
  const footHole = b.add('hole', { sketch: mh.id, kind: 'counterbore', diameter: 13.5, cbDiameter: 22, cbDepth: 4, through: true });
  b.add('linearPattern', { seeds: [footHole.id], direction: { kind: 'axis', axis: 'x' }, spacing: 256, count: 2, direction2: { kind: 'axis', axis: 'z' }, spacing2: 110, count2: 2, reverse2: true });
  // Bearing bosses on the front wall, mirrored to the back wall, then bored through both.
  const wall = b.plane(front, 62);
  const bs = b.sketch(wall, (k) => { circleAt(k, -50, 65, 84); circleAt(k, 48, 70, 104); });
  const boss = b.add('extrude', { sketch: bs.id, depth: 20 });
  // Ribs under the bosses (webs from the wall to the foot), mirrored with the bosses.
  const r1 = b.plane(right, -50);
  const rs1 = b.sketch(r1, (k) => poly(k, [[-64, 16], [-64, 44], [-80, 26.5]]));
  const rib1 = b.add('extrude', { sketch: rs1.id, end: 'midplane', depth: 10 });
  const r2 = b.plane(right, 48);
  const rs2 = b.sketch(r2, (k) => poly(k, [[-64, 16], [-64, 36], [-80, 20.5]]));
  const rib2 = b.add('extrude', { sketch: rs2.id, end: 'midplane', depth: 10 });
  b.add('mirror', { seeds: [boss.id, rib1.id, rib2.id], plane: { kind: 'std', name: 'front' } });
  const bores = b.sketch(front, (k) => { circleAt(k, -50, 65, 52); circleAt(k, 48, 70, 72); });
  const bore = b.add('extrude', { sketch: bores.id, op: 'cut', end: 'throughBoth' });
  const bossOnly = [b.part.features.find((f) => f.id === wall.id), bs, boss, b.part.features.at(-3), bores, bore];
  b.add('chamfer', { distance: 1.5, edges: probeEdges(b, bossOnly, (e) => e.type === 'CIRCLE' && absNear(e.mid[2], 82) && (near(e.length, Math.PI * 52, 0.05) || near(e.length, Math.PI * 72, 0.05))) });
  // Bearing-cap screw holes around the small bore (a circular pattern about the boss axis).
  const capFace = b.plane(front, 82);
  const cs = b.sketch(capFace, (k) => holeAt(k, -50, 99));
  const cap = b.add('hole', { sketch: cs.id, kind: 'simple', diameter: 6.8, depth: 16, through: false });
  const bossEdge = probeEdges(b, bossOnly, (e) => e.type === 'CIRCLE' && near(e.mid[2], 82) && near(e.length, Math.PI * 84, 0.05))[0];
  b.add('circularPattern', { seeds: [cap.id], axis: { kind: 'edge', sig: bossEdge }, count: 4 });
  // Oil drain boss with an M16×1.5 thread on the right wall.
  const side = b.plane(right, 116);
  const ds = b.sketch(side, (k) => circleAt(k, 0, 30, 30));
  const drain = b.add('extrude', { sketch: ds.id, depth: 12, reverse: true });
  const dh = b.sketch(side, (k) => holeAt(k, 0, 30));
  const drainHole = b.add('hole', { sketch: dh.id, kind: 'simple', diameter: 14, depth: 22, through: false });
  const sidePlane = b.part.features.find((f) => f.id === side.id);
  b.add('thread', { edge: probeEdges(b, [sidePlane, ds, drain, dh, drainHole], (e) => e.type === 'CIRCLE' && near(e.mid[0], 116) && near(e.length, Math.PI * 14, 0.05))[0], pitch: 1.5, length: 12, internal: 'internal', cosmetic: true });
  return b.part;
}

// ───────────────────────── electronics enclosure (configurations)

function enclosure(name) {
  const part = createPart(name, { material: 'pc', partNo: 'EN-160', color: '#4d5b6b', description: 'Moulded electronics enclosure, small / large' });
  part.variables = [
    { name: 'L', expr: '160' }, { name: 'W', expr: '100' }, { name: 'H', expr: '50' }, { name: 'T', expr: '2.5' }, { name: 'B', expr: '10' },
  ];
  const b = builder(part);
  const body = b.sketch(top, (k) => {
    const [l1, l2] = centreRect(k, 160, 100);
    void l1; void l2;
  });
  const [dl, dw] = body.constraints.filter((c) => c.type === 'distance');
  dl.expr = 'L'; dl.name = 'D1'; dw.expr = 'W'; dw.name = 'D2';
  b.add('extrude', { sketch: body.id, depth: 50, draft: true, draftAngle: 1, exprs: { depth: 'H' } });
  b.add('fillet', { radius: 8, edges: b.edges((e) => vertical(e, 0.9)) });
  b.add('fillet', { radius: 4, edges: b.edges((e) => near(e.mid[1], 0)) });
  b.add('shell', { thickness: 2.5, faces: b.faces((f) => f.type === 'PLANE' && f.normal[1] > 0.99 && near(f.center[1], 50)), exprs: { thickness: 'T' } });
  // Screw bosses in the corners (positions follow L, W).
  const floor = b.plane(top, 2.5);
  b.part.features.at(-1).exprs = { offset: 'T' };
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const bs = b.sketch(floor, (k) => {
    for (const [sx, sy] of corners) circleAt(k, sx * 70, sy * 40, 8, `${sx < 0 ? '-' : ''}(L / 2 - B)`, `${sy < 0 ? '-' : ''}(W / 2 - B)`);
  });
  b.add('extrude', { sketch: bs.id, depth: 44.5, exprs: { depth: 'H - T - 3' } });
  const bossTop = b.plane(top, 47);
  b.part.features.at(-1).exprs = { offset: 'H - 3' };
  const ps = b.sketch(bossTop, (k) => {
    for (const [sx, sy] of corners) holeAt(k, sx * 70, sy * 40, `${sx < 0 ? '-' : ''}(L / 2 - B)`, `${sy < 0 ? '-' : ''}(W / 2 - B)`);
  });
  b.add('hole', { sketch: ps.id, kind: 'simple', diameter: 2.5, depth: 12, through: false });
  // Snap-fit lugs on the long walls (mirrored to the back wall).
  const lugPlane = b.plane(front, 48.5);
  b.part.features.at(-1).exprs = { offset: 'W / 2 - 1.5' };
  const ls = b.sketch(lugPlane, (k) => { rectAt(k, -40, 42, 14, 3, null, 'H - 8'); rectAt(k, 40, 42, 14, 3, null, 'H - 8'); });
  const lug = b.add('extrude', { sketch: ls.id, depth: 2.5 });
  b.add('mirror', { seeds: [lug.id], plane: { kind: 'std', name: 'front' } });
  // Vent slots on the right end wall, patterned upward.
  const endWall = b.plane(right, 81);
  b.part.features.at(-1).exprs = { offset: 'L / 2 + 1' };
  const vs = b.sketch(endWall, (k) => addSlot(k, -25, 14, 25, 14, 2));
  const vent = b.add('extrude', { sketch: vs.id, op: 'cut', depth: 6 });
  b.add('linearPattern', { seeds: [vent.id], direction: { kind: 'axis', axis: 'y' }, spacing: 7, count: 4 });
  // Cable gland hole on the left end wall.
  const leftWall = b.plane(right, -81);
  b.part.features.at(-1).exprs = { offset: '-(L / 2 + 1)' };
  const gs = b.sketch(leftWall, (k) => circleAt(k, 0, 25, 16));
  b.add('extrude', { sketch: gs.id, op: 'cut', depth: 6, reverse: true });
  // Engraved label on the front wall.
  const label = b.plane(front, 51);
  b.part.features.at(-1).exprs = { offset: 'W / 2 + 1' };
  const ts = b.sketch(label, (k) => addText(k, -20, 20, 'MM-01', 8));
  b.add('extrude', { sketch: ts.id, op: 'cut', depth: 2 });
  part.configurations = [
    { id: 'cfg-small', name: 'Small 120×80×40', variables: { L: '120', W: '80', H: '40' }, suppress: {}, values: {} },
    { id: 'cfg-large', name: 'Large 200×120×60', variables: { L: '200', W: '120', H: '60', T: '3' }, suppress: {}, values: {} },
  ];
  return part;
}

// ───────────────────────── injection-moulded cover with core / cavity

function cover(name) {
  const b = builder(createPart(name, { material: 'abs', partNo: 'CV-120', color: '#d9d4c7', description: 'Moulded cover with core and cavity inserts' }));
  const s = b.sketch(top, (k) => centreRect(k, 120, 80));
  b.add('extrude', { sketch: s.id, depth: 25, draft: true, draftAngle: 2 });
  b.add('fillet', { radius: 10, edges: b.edges((e) => vertical(e, 0.9)) });
  b.add('fillet', { radius: 5, edges: b.edges((e) => near(e.mid[1], 25, 0.01)) });
  b.add('shell', { thickness: 2, faces: b.faces((f) => f.type === 'PLANE' && f.normal[1] < -0.99 && near(f.center[1], 0)) });
  // Cross ribs under the ceiling (Rib feature: the region between the line and the ceiling).
  const rx = b.sketch(front, (k) => addLine(k, -40, 9, 40, 9));
  b.add('rib', { sketch: rx.id, thickness: 1.6 });
  const rz = b.sketch(right, (k) => addLine(k, -24, 9, 24, 9));
  b.add('rib', { sketch: rz.id, thickness: 1.6 });
  // Screw bosses hanging from the ceiling, cored from below.
  const ceiling = b.plane(top, 23);
  const bs = b.sketch(ceiling, (k) => { for (const x of [-42, 42]) for (const z of [-22, 22]) circleAt(k, x, z, 7); });
  b.add('extrude', { sketch: bs.id, depth: 17, reverse: true });
  const under = b.add('plane', { base: { kind: 'std', name: 'top' }, offset: 6, flip: true });
  const hs = b.sketch({ kind: 'ref', id: under.id }, (k) => { for (const x of [-42, 42]) for (const z of [-22, 22]) holeAt(k, x, z); });
  b.add('hole', { sketch: hs.id, kind: 'simple', diameter: 2.6, depth: 12, through: false });
  // A button opening and an LED window in the top.
  const lid = b.plane(top, 25);
  const os = b.sketch(lid, (k) => { circleAt(k, 30, 0, 14); addSlot(k, -35, 0, -15, 0, 3); });
  b.add('extrude', { sketch: os.id, op: 'cut', depth: 5 });
  // Mould tools: the parting line, then core and cavity around the part.
  b.add('partingLine', { dir: 'y' });
  b.add('toolingSplit', { dir: 'y', margin: 12, gap: 30, keepPart: true });
  return b.part;
}

// ───────────────────────── pump volute casing

function volute(name) {
  const b = builder(createPart(name, { material: 'cast-iron', partNo: 'PV-80-160', description: 'End-suction pump volute casing' }));
  // Impeller chamber: a disc revolved about the shaft axis (Y).
  const disc = b.sketch(front, (k) => { poly(k, [[0, -22], [80, -22], [80, 22], [0, 22]]); addLine(k, 0, -30, 0, 30, { construction: true }); });
  b.add('revolve', { sketch: disc.id });
  // The scroll: a round section swept along a three-centre spiral (tangent arcs R76 → R82 → R88 over 270°) that
  // runs straight out into the discharge.
  const path = b.sketch(top, (k) => {
    const a1 = addArc(k, 0, 0, 76, 0, Math.PI / 2);
    const a2 = addArc(k, 0, -6, 82, Math.PI / 2, Math.PI, { from: a1.p2 });
    const a3 = addArc(k, 6, -6, 88, Math.PI, 1.5 * Math.PI, { from: a2.p2 });
    addLine(k, 0, 0, 110, -94, { from: a3.p2 });
  });
  const scroll = b.sketch(front, (k) => circleAt(k, 76, 0, 32));
  b.add('sweep', { sketch: scroll.id, path: path.id });
  const bore = b.sketch(front, (k) => circleAt(k, 76, 0, 23));
  b.add('sweep', { sketch: bore.id, path: path.id, op: 'cut' });
  const cavity = b.sketch(front, (k) => { poly(k, [[0, -14], [68, -14], [68, 14], [0, 14]]); addLine(k, 0, -30, 0, 30, { construction: true }); });
  b.add('revolve', { sketch: cavity.id, op: 'cut' });
  // Suction branch and its flange (bolt holes in a circular pattern).
  const under = b.plane(top, -22);
  const inlet = b.sketch(under, (k) => { circle(k, 0, 0, 76); circle(k, 0, 0, 60); });
  b.add('extrude', { sketch: inlet.id, depth: 40, reverse: true });
  const eye = b.sketch(under, (k) => circle(k, 0, 0, 60));
  b.add('extrude', { sketch: eye.id, op: 'cut', depth: 9, reverse: true });
  const flangeFace = b.plane(top, -62);
  const sf = b.sketch(flangeFace, (k) => { circle(k, 0, 0, 130); circle(k, 0, 0, 60); });
  const sfx = b.add('extrude', { sketch: sf.id, depth: 14 });
  const flangeUnder = b.add('plane', { base: { kind: 'std', name: 'top' }, offset: -62, flip: true });
  const sh = b.sketch({ kind: 'ref', id: flangeUnder.id }, (k) => holeAt(k, 50, 0));
  const sHole = b.add('hole', { sketch: sh.id, kind: 'simple', diameter: 14, through: false, depth: 16 });
  b.add('circularPattern', { seeds: [sHole.id], axis: { kind: 'axis', axis: 'y' }, count: 6 });
  // Seal housing on top, the shaft bore and the gland stud holes.
  const lid = b.plane(top, 22);
  const hub = b.sketch(lid, (k) => circle(k, 0, 0, 72));
  b.add('extrude', { sketch: hub.id, depth: 20 });
  const hubTop = b.plane(top, 42);
  const sb = b.sketch(hubTop, (k) => circle(k, 0, 0, 30));
  b.add('extrude', { sketch: sb.id, op: 'cut', end: 'through' });
  const gs = b.sketch(hubTop, (k) => { for (const [x, y] of [[27, 0], [0, 27], [-27, 0], [0, -27]]) holeAt(k, x, y); });
  b.add('hole', { sketch: gs.id, kind: 'simple', diameter: 6.8, depth: 12, through: false });
  // Discharge flange at the end of the scroll.
  const outlet = b.plane(right, 110);
  // (the flange sketch holds its bore and four bolt holes: one region with holes)
  const df = b.sketch(outlet, (k) => {
    circleAt(k, -94, 0, 84); circleAt(k, -94, 0, 23);
    for (const [dx, dy] of [[0, 31], [0, -31], [31, 0], [-31, 0]]) circleAt(k, -94 + dx, dy, 11);
  });
  const dfx = b.add('extrude', { sketch: df.id, depth: 14 });
  const ring = (pl, sk, ex) => [b.part.features.find((f) => f.id === pl.id), sk, ex];
  b.add('chamfer', { distance: 2, edges: [
    ...probeEdges(b, ring(flangeFace, sf, sfx), (e) => e.type === 'CIRCLE' && near(e.mid[1], -62) && near(Math.hypot(e.mid[0], e.mid[2]), 65, 0.01)),
    ...probeEdges(b, ring(outlet, df, dfx), (e) => e.type === 'CIRCLE' && near(e.mid[0], 124) && near(Math.hypot(e.mid[1], e.mid[2] - 94), 42, 0.01)),
  ] });
  return b.part;
}

// ───────────────────────── motor end bell

function endBell(name) {
  const b = builder(createPart(name, { material: 'al-6061', partNo: 'EB-112', description: 'Die-cast motor end shield (drive end)' }));
  const prof = b.sketch(front, (k) => {
    poly(k, [[14, 10], [24, 10], [24, 26], [52, 26], [52, 0], [57, 0], [57, 32], [14, 32]]);
    addLine(k, 0, -5, 0, 40, { construction: true });
  });
  const turned = b.add('revolve', { sketch: prof.id });
  // Bearing seat (6202: Ø35 × 11) turned into the hub.
  const seat = b.sketch(front, (k) => { poly(k, [[0, 10], [17.5, 10], [17.5, 21], [0, 21]]); addLine(k, 0, -5, 0, 40, { construction: true }); });
  b.add('revolve', { sketch: seat.id, op: 'cut' });
  b.add('fillet', { radius: 4, edges: b.edges((e) => e.type === 'CIRCLE' && near(e.mid[1], 32) && near(e.length, Math.PI * 114, 0.05)) });
  // Radial ribs between the hub and the skirt (Rib feature), patterned round the axis.
  const rs = b.sketch(front, (k) => addLine(k, 24, 14, 52, 14));
  const rib = b.add('rib', { sketch: rs.id, thickness: 3 });
  b.add('circularPattern', { seeds: [rib.id], axis: { kind: 'axis', axis: 'y' }, count: 6 });
  // Through-bolt ears with their holes.
  const es = b.sketch(top, (k) => addSlot(k, 50, 0, 64, 0, 8));
  const ear = b.add('extrude', { sketch: es.id, depth: 32 });
  b.add('circularPattern', { seeds: [ear.id], axis: { kind: 'axis', axis: 'y' }, count: 4 });
  const face = b.plane(top, 32);
  const eh = b.sketch(face, (k) => holeAt(k, 64, 0));
  const earHole = b.add('hole', { sketch: eh.id, kind: 'simple', diameter: 6.6, through: true });
  b.add('circularPattern', { seeds: [earHole.id], axis: { kind: 'axis', axis: 'y' }, count: 4 });
  // Cooling vents between the ribs.
  const vs = b.sketch(face, (k) => { const a = Math.PI / 6; addSlot(k, 32 * Math.cos(a), 32 * Math.sin(a), 45 * Math.cos(a), 45 * Math.sin(a), 3); });
  const vent = b.add('extrude', { sketch: vs.id, op: 'cut', depth: 8 });
  b.add('circularPattern', { seeds: [vent.id], axis: { kind: 'axis', axis: 'y' }, count: 6 });
  // Grease nipple boss on the end face and the chamfered shaft bore.
  const gs = b.sketch(face, (k) => circleAt(k, 0, -20, 10));
  b.add('extrude', { sketch: gs.id, depth: 5 });
  const gh = b.sketch(b.plane(top, 37), (k) => holeAt(k, 0, -20));
  b.add('hole', { sketch: gh.id, kind: 'simple', diameter: 4.2, depth: 12, through: false });
  b.add('chamfer', { distance: 1, edges: probeEdges(b, [prof, turned], (e) => e.type === 'CIRCLE' && near(e.mid[1], 32) && near(e.length, Math.PI * 28, 0.05)) });
  return b.part;
}

// ───────────────────────── sheet metal: chassis

function chassis(name) {
  const b = builder(createPart(name, { material: 'al-6061', partNo: 'SM-CH-300', description: 'Sheet-metal instrument chassis, t1.5' }));
  const base = b.sketch(top, (k) => centreRect(k, 300, 200));
  b.add('baseFlange', { sketch: base.id, thickness: 1.5, radius: 1.5, kFactor: 0.44 });
  // A raised rear deck (jog) for the connectors.
  const jl = b.sketch(top, (k) => addLine(k, -160, 60, 160, 60));
  b.add('jog', { sketch: jl.id, height: 12 });
  const line = (test) => (e) => e.type === 'LINE' && test(e);
  b.add('edgeFlange', { edge: b.edges(line((x) => near(x.mid[1], 13.5) && near(x.mid[2], -101.5) && Math.abs(x.dir[0]) > 0.99))[0], length: 50, angle: 90 });
  for (const sx of [-150, 150]) b.add('edgeFlange', { edge: b.edges(line((x) => near(x.mid[1], 1.5) && near(x.mid[0], sx) && Math.abs(x.dir[2]) > 0.99))[0], length: 50, angle: 90 });
  b.add('hem', { edge: b.edges(line((x) => near(x.mid[1], 1.5) && near(x.mid[2], 100) && Math.abs(x.dir[0]) > 0.99))[0], kind: 'closed', length: 12 });
  // Louvre-like vent slots in the floor.
  const ls = b.sketch(top, (k) => addSlot(k, -100, -10, -100, -70, 3));
  const louvre = b.add('extrude', { sketch: ls.id, op: 'cut', end: 'throughBoth' });
  b.add('linearPattern', { seeds: [louvre.id], direction: { kind: 'axis', axis: 'x' }, spacing: 16, count: 6 });
  // PCB standoff holes (100 × 80 pattern).
  const pcb = b.plane(top, 1.5);
  const ph = b.sketch(pcb, (k) => holeAt(k, 30, -20));
  const pcbHole = b.add('hole', { sketch: ph.id, kind: 'simple', diameter: 4.2, through: true });
  b.add('linearPattern', { seeds: [pcbHole.id], direction: { kind: 'axis', axis: 'x' }, spacing: 100, count: 2, direction2: { kind: 'axis', axis: 'z' }, spacing2: 80, count2: 2, reverse2: true });
  // Rear panel: IEC inlet, fan opening and its screw holes.
  const rear = b.sketch(front, (k) => {
    rectAt(k, -90, 40, 28, 20);
    circleAt(k, 60, 40, 46);
    for (const dx of [-20, 20]) for (const dy of [-20, 20]) circleAt(k, 60 + dx, 40 + dy, 4.3);
  });
  b.add('extrude', { sketch: rear.id, op: 'cut', end: 'throughBoth' });
  // Side vents through both side flanges.
  const sv = b.sketch(right, (k) => addSlot(k, -60, 20, -60, 40, 2.5));
  const side = b.add('extrude', { sketch: sv.id, op: 'cut', end: 'throughBoth' });
  b.add('linearPattern', { seeds: [side.id], direction: { kind: 'axis', axis: 'z' }, spacing: 12, count: 8, reverse: true });
  return b.part;
}

// ───────────────────────── sheet metal: L bracket with gussets

function lBracket(name) {
  const b = builder(createPart(name, { material: 'steel-1020', partNo: 'SM-LB-60', description: 'Bent L bracket, t3, with formed gussets' }));
  const base = b.sketch(top, (k) => {
    poly(k, [[-70, -30], [70, -30], [70, 30], [-70, 30]]);
    // Rounded corners (sketch fillets).
    const corners = k.entities.filter((e) => e.type === 'point' && !e.origin).map((p) => p.id);
    for (const id of corners) sketchFillet(k, id, 8);
  });
  b.add('baseFlange', { sketch: base.id, thickness: 3, radius: 3, kFactor: 0.44 });
  // Holes and slots cut flat, before the bend (they go round with the leg).
  const hs = b.sketch(top, (k) => {
    addSlot(k, -50, -15, -40, -15, 3.3); addSlot(k, -50, 15, -40, 15, 3.3);
    circleAt(k, 50, -15, 8.4); circleAt(k, 50, 15, 8.4);
    circleAt(k, 50, 0, 12);
  });
  b.add('extrude', { sketch: hs.id, op: 'cut', end: 'throughBoth' });
  const bl = b.sketch(top, (k) => addLine(k, 20, 40, 20, -40));
  b.add('sketchedBend', { sketch: bl.id, angle: 90, radius: 3 });
  // Gussets in the inside corner (triangular webs, 3 thick, welded in after bending).
  for (const z of [-20, 20]) {
    const g = b.sketch(b.plane(front, z), (k) => poly(k, [[-12, 2.5], [20, 2.5], [23.5, 6], [23.5, 38]]));
    b.add('extrude', { sketch: g.id, end: 'midplane', depth: 3 });
  }
  return b.part;
}

// ───────────────────────── sheet metal: DIN-rail clip

function dinRail(name) {
  const b = builder(createPart(name, { material: 'stainless-304', partNo: 'SM-DIN-Z12', description: 'TS35 DIN-rail Z bracket, t1.5' }));
  const base = b.sketch(top, (k) => centreRect(k, 50, 60));
  b.add('baseFlange', { sketch: base.id, thickness: 1.5, radius: 1, kFactor: 0.44 });
  // A jog lifts the device side 12 mm off the rail.
  const j = b.sketch(top, (k) => addLine(k, 5, 40, 5, -40));
  b.add('jog', { sketch: j.id, height: 12 });
  // A hook bent down to catch the rail lip, a stiffening return on the raised side.
  b.add('edgeFlange', { edge: b.edges((e) => e.type === 'LINE' && near(e.mid[0], -25) && near(e.mid[1], 0) && Math.abs(e.dir[2]) > 0.99)[0], length: 6, angle: 90 });
  b.add('edgeFlange', { edge: b.edges((e) => e.type === 'LINE' && near(e.mid[0], 26.5) && near(e.mid[1], 13.5) && Math.abs(e.dir[2]) > 0.99)[0], length: 8, angle: 90 });
  // Countersunk device holes on the raised side, rail-screw slots in the foot (mirrored).
  const deck = b.plane(top, 13.5);
  const ch = b.sketch(deck, (k) => { holeAt(k, 16, -16); holeAt(k, 16, 16); });
  b.add('hole', { sketch: ch.id, kind: 'countersink', diameter: 4.5, csDiameter: 9, through: true });
  const sl = b.sketch(top, (k) => addSlot(k, -12, -20, -12, -8, 2.2));
  const slots = b.add('extrude', { sketch: sl.id, op: 'cut', end: 'throughBoth' });
  b.add('mirror', { seeds: [slots.id], plane: { kind: 'std', name: 'front' } });
  return b.part;
}

// ───────────────────────── sheet metal: 1U rack panel

function rackPanel(name) {
  const b = builder(createPart(name, { material: 'al-6061', partNo: 'RK-1U-19', description: '19-inch 1U front panel with returns and handles' }));
  const base = b.sketch(front, (k) => poly(k, [
    [-241.3, -22.2], [-216, -22.2], [-216, -20.2], [216, -20.2], [216, -22.2], [241.3, -22.2],
    [241.3, 22.2], [216, 22.2], [216, 20.2], [-216, 20.2], [-216, 22.2], [-241.3, 22.2],
  ]));
  b.add('baseFlange', { sketch: base.id, thickness: 2, radius: 2, kFactor: 0.44 });
  // Return flanges top and bottom (bent backwards from the back face).
  for (const y of [-20.2, 20.2]) b.add('edgeFlange', { edge: b.edges((e) => e.type === 'LINE' && near(e.mid[1], y) && near(e.mid[2], 0) && Math.abs(e.dir[0]) > 0.99)[0], length: 25, angle: 90 });
  // Rack-ear slots (EIA spacing 465.1 × 31.75).
  const ears = b.sketch(front, (k) => { for (const x of [-232.55, 232.55]) for (const y of [-15.875, 15.875]) addSlot(k, x - 1.75, y, x + 1.75, y, 3.25); });
  b.add('extrude', { sketch: ears.id, op: 'cut', end: 'throughBoth' });
  // Vent louvres, display window, LEDs and the power switch.
  const vs = b.sketch(front, (k) => addSlot(k, -60, -12, -60, 12, 2));
  const vent = b.add('extrude', { sketch: vs.id, op: 'cut', end: 'throughBoth' });
  b.add('linearPattern', { seeds: [vent.id], direction: { kind: 'axis', axis: 'x' }, spacing: 8, count: 14 });
  const ws = b.sketch(front, (k) => { rectAt(k, 110, 0, 64, 22); circleAt(k, 160, 8, 3.2); circleAt(k, 160, 0, 3.2); circleAt(k, 160, -8, 3.2); circleAt(k, -150, 0, 12.2); });
  b.add('extrude', { sketch: ws.id, op: 'cut', end: 'throughBoth' });
  // Handles: a round bar swept along a filleted U path, mirrored to the other side.
  const hp = b.sketch(b.plane(right, -200), (k) => {
    const l1 = addLine(k, -2, 15, -32, 15);
    const l2 = addLine(k, 0, 0, -32, -15, { from: l1.p2 });
    addLine(k, 0, 0, -2, -15, { from: l2.p2 });
    sketchFillet(k, l1.p2, 8); sketchFillet(k, l2.p2, 8);
  });
  const hb = b.sketch(b.plane(front, 2), (k) => circleAt(k, -200, 15, 8));
  const handle = b.add('sweep', { sketch: hb.id, path: hp.id });
  b.add('mirror', { seeds: [handle.id], plane: { kind: 'std', name: 'right' } });
  return b.part;
}

// ───────────────────────── die-cast handle housing (clamshell half)

function handle(name) {
  const b = builder(createPart(name, { material: 'al-6061', partNo: 'DC-HH-140', description: 'Die-cast D-handle housing, left half' }));
  const outline = b.sketch(front, (k) => {
    poly(k, [[-70, 0], [70, 0], [70, 14], [55, 60], [-55, 60], [-70, 14]]);
    poly(k, [[-45, 16], [45, 16], [38, 46], [-38, 46]]);
    const corners = k.entities.filter((e) => e.type === 'point' && !e.origin).map((p) => [p.id, p.y > 15 && p.y < 47 && Math.abs(p.x) < 46 ? 6 : 10]);
    for (const [id, r] of corners) sketchFillet(k, id, r);
  });
  // One half of the clamshell, cast with a 2° draft on every side face (pulled along +Z from the parting plane).
  b.add('extrude', { sketch: outline.id, depth: 16, draft: true, draftAngle: 2 });
  b.add('fillet', { radius: 5, edges: b.edges((e) => near(e.mid[2], 16, 0.05)) });
  b.add('shell', { thickness: 2.5, faces: b.faces((f) => f.type === 'PLANE' && f.normal[2] < -0.99 && near(f.center[2], 0, 0.01)) });
  // Screw bosses (the other half screws on) and stiffening ribs, all from the parting plane to the skin.
  const bs = b.sketch(front, (k) => { circleAt(k, -58, 7, 9); circleAt(k, 58, 7, 9); circleAt(k, 0, 53, 8); });
  b.add('extrude', { sketch: bs.id, depth: 15 });
  const inside = b.add('plane', { base: { kind: 'std', name: 'front' }, offset: 0, flip: true });
  const hs = b.sketch({ kind: 'ref', id: inside.id }, (k) => { holeAt(k, -58, -7); holeAt(k, 58, -7); holeAt(k, 0, -53); });
  b.add('hole', { sketch: hs.id, kind: 'simple', diameter: 2.9, depth: 12, through: false });
  const rs = b.sketch(front, (k) => rectAt(k, -24, 53, 1.6, 10));
  const rib = b.add('extrude', { sketch: rs.id, depth: 14 });
  b.add('linearPattern', { seeds: [rib.id], direction: { kind: 'axis', axis: 'x' }, spacing: 16, count: 4 });
  return b.part;
}

// ───────────────────────── battery box with lid (assembly)

function batteryBox(lang) {
  const T = L(lang);
  const project = createProject({ name: T('배터리 박스', 'Battery box'), kind: 'none' });
  // Box: drafted, shelled, corner screw bosses, cell separators (Rib), cable gland, mounting tabs.
  const b = builder(createPart(T('배터리 박스 몸체', 'Battery box body'), { material: 'abs', partNo: 'BB-150-B', color: '#3c4148', description: 'Moulded box for 3 × 2 cells' }));
  const s = b.sketch(top, (k) => centreRect(k, 150, 90));
  b.add('extrude', { sketch: s.id, depth: 70 });
  b.add('fillet', { radius: 6, edges: b.edges((e) => vertical(e)) });
  b.add('fillet', { radius: 3, edges: b.edges((e) => near(e.mid[1], 0)) });
  b.add('shell', { thickness: 2.5, faces: b.faces((f) => f.type === 'PLANE' && f.normal[1] > 0.99 && near(f.center[1], 70)) });
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const floor = b.plane(top, 2.5);
  const bs = b.sketch(floor, (k) => { for (const [x, z] of corners) circleAt(k, x * 64, z * 34, 9); });
  b.add('extrude', { sketch: bs.id, depth: 67.5 });
  const rim = b.plane(top, 70);
  const ph = b.sketch(rim, (k) => { for (const [x, z] of corners) holeAt(k, x * 64, z * 34); });
  b.add('hole', { sketch: ph.id, kind: 'simple', diameter: 2.5, depth: 16, through: false });
  const sep = b.sketch(b.plane(right, -25), (k) => rectAt(k, 0, 21, 80, 37));
  const rib = b.add('extrude', { sketch: sep.id, end: 'midplane', depth: 2 });
  b.add('mirror', { seeds: [rib.id], plane: { kind: 'std', name: 'right' } });
  const gland = b.sketch(b.plane(right, 77), (k) => circleAt(k, 0, 50, 12.5));
  b.add('extrude', { sketch: gland.id, op: 'cut', depth: 6 });
  const tabs = b.sketch(top, (k) => { rectAt(k, 0, -52, 40, 16); rectAt(k, 0, 52, 40, 16); });
  b.add('extrude', { sketch: tabs.id, depth: 4 });
  const th = b.sketch(b.plane(top, 4), (k) => { for (const x of [-12, 12]) for (const z of [-54, 54]) holeAt(k, x, z); });
  b.add('hole', { sketch: th.id, kind: 'simple', diameter: 4.5, through: true });
  const box = b.part;
  // Lid: plate with rounded edges, a lip that locates it in the opening, counterbored screw holes, label recess.
  const l = builder(createPart(T('배터리 박스 뚜껑', 'Battery box lid'), { material: 'abs', partNo: 'BB-150-L', color: '#d0532f', description: 'Lid with locating lip' }));
  const ls = l.sketch(top, (k) => centreRect(k, 150, 90));
  l.add('extrude', { sketch: ls.id, depth: 4 });
  l.add('fillet', { radius: 5, edges: l.edges((e) => vertical(e)) });
  l.add('fillet', { radius: 1.5, edges: l.edges((e) => near(e.mid[1], 4)) });
  const lip = l.sketch(top, (k) => { rectAt(k, 0, -39, 110, 2); rectAt(k, 0, 39, 110, 2); rectAt(k, -69, 0, 2, 56); rectAt(k, 69, 0, 2, 56); });
  l.add('extrude', { sketch: lip.id, depth: 6, reverse: true });
  const lh = l.sketch(l.plane(top, 4), (k) => { for (const [x, z] of corners) holeAt(k, x * 64, z * 34); });
  l.add('hole', { sketch: lh.id, kind: 'counterbore', diameter: 3.4, cbDiameter: 6.5, cbDepth: 2, through: true });
  const label = l.sketch(l.plane(top, 4), (k) => rectAt(k, 0, 0, 80, 40));
  l.add('extrude', { sketch: label.id, op: 'cut', depth: 0.6 });
  const lid = l.part;
  project.parts.push(box, lid);
  const asm = createAssembly(T('배터리 박스', 'Battery box'));
  project.assemblies.push(asm);
  const cBox = component(asm, box, [0, 0, 0], quatIdentity(), true);
  const cLid = component(asm, lid, [6, 95, -4], quatFromAxisAngle([0, 1, 0], 4));
  const hole = (r, x, z) => (f) => isCylinder(f.type) && near(f.radius ?? -1, r, 0.01) && near(f.center[0], x, 0.5) && near(f.center[2], z, 0.5);
  const faceEntity = cachedFaces(project);
  mate(asm, 'coincident', faceEntity(box, cBox.id, (f) => f.type === 'PLANE' && near(f.center[1], 70) && f.normal[1] > 0.9), faceEntity(lid, cLid.id, (f) => f.type === 'PLANE' && near(f.center[1], 0) && f.normal[1] < -0.9));
  mate(asm, 'concentric', faceEntity(box, cBox.id, hole(1.25, 64, -34)), faceEntity(lid, cLid.id, hole(1.7, 64, -34)));
  mate(asm, 'concentric', faceEntity(box, cBox.id, hole(1.25, -64, 34)), faceEntity(lid, cLid.id, hole(1.7, -64, 34)));
  settle(project, asm);
  project.active = { kind: 'assembly', id: asm.id };
  return project;
}

// ───────────────────────── machine guard (weldment)

function guard(name) {
  const b = builder(createPart(name, { material: 'steel-1020', partNo: 'WG-800', description: 'Welded machine guard frame with perforated side panel' }));
  const tube = { profile: 'squareTube', w: 40, h: 40, t: 3 };
  // Front and back frames (posts, top and bottom rails, a mid rail).
  for (const z of [280, -280]) {
    const fr = b.sketch(b.plane(front, z), (k) => {
      poly(k, [[-380, 20], [380, 20], [380, 880], [-380, 880]]);
      addLine(k, -380, 450, 380, 450);
    });
    b.add('structural', { sketch: fr.id, ...tube });
  }
  // Cross members joining them at the bottom and the top.
  for (const y of [20, 880]) {
    const cr = b.sketch(b.plane(top, y), (k) => { addLine(k, -380, 260, -380, -260); addLine(k, 380, 260, 380, -260); });
    b.add('structural', { sketch: cr.id, ...tube });
  }
  // Angle braces in the back frame.
  const br = b.sketch(b.plane(front, -280), (k) => { addLine(k, -360, 470, -40, 860); addLine(k, 360, 470, 40, 860); });
  b.add('structural', { sketch: br.id, profile: 'angle', w: 30, h: 30, t: 4, rotate: 0 });
  // Base plates with anchor holes.
  const feet = b.sketch(top, (k) => { for (const x of [-380, 380]) for (const z of [-280, 280]) rectAt(k, x, z, 100, 100); });
  b.add('extrude', { sketch: feet.id, depth: 10, reverse: true });
  const ah = b.sketch(top, (k) => { for (const x of [-415, 415]) for (const z of [-315, 315]) holeAt(k, x, z); });
  b.add('hole', { sketch: ah.id, kind: 'simple', diameter: 14, through: true });
  // Perforated side panel (2 mm sheet) on the right.
  const pn = b.sketch(b.plane(right, 400), (k) => rectAt(k, 0, 450, 600, 900));
  b.add('extrude', { sketch: pn.id, depth: 2 });
  const sl = b.sketch(b.plane(right, 402), (k) => addSlot(k, 220, 80, 120, 80, 8));
  const slot = b.add('extrude', { sketch: sl.id, op: 'cut', depth: 3 });
  b.add('linearPattern', { seeds: [slot.id], direction: { kind: 'axis', axis: 'y' }, spacing: 60, count: 6, direction2: { kind: 'axis', axis: 'z' }, spacing2: 150, count2: 3 });
  return b.part;
}

// ───────────────────────── ergonomic grip (lofted surface, thickened)

function grip(name) {
  const b = builder(createPart(name, { material: 'nylon', partNo: 'GR-ERGO-110', color: '#2e3a46', description: 'Ergonomic tool grip shell' }));
  // Mounting flange (its four screw holes in the same sketch) and the end cap with a dome: built first, small.
  const fl = b.sketch(top, (k) => {
    addEllipse(k, 0, 0, 24, 20); addEllipse(k, 0, 0, 13.5, 10.5);
    for (const [x, y] of [[19, 0], [-19, 0], [0, 15.5], [0, -15.5]]) circleAt(k, x, y, 3.4);
  });
  b.add('extrude', { sketch: fl.id, depth: 4, reverse: true });
  b.add('chamfer', { distance: 1, edges: b.edges((e) => near(e.mid[1], -4, 0.01) && e.type !== 'LINE' && Math.hypot(e.mid[0] / 24, e.mid[2] / 20) > 0.95) });
  const cap = b.sketch(b.plane(top, 110), (k) => addEllipse(k, 1, 0, 16.5, 14));
  b.add('extrude', { sketch: cap.id, depth: 3 });
  b.add('dome', { faces: b.faces((f) => f.type === 'PLANE' && near(f.center[1], 113, 0.01) && f.normal[1] > 0.99), height: 7 });
  // The grip itself: a surface lofted through four elliptical sections, thickened inward to a 2.5 mm wall.
  const sections = [[0, 0, 16, 13], [35, 2, 19, 15], [75, -1, 17.5, 14], [110, 1, 15, 12.5]];
  const ids = sections.map(([y, x, rx, ry]) => b.sketch(y ? b.plane(top, y) : top, (k) => addEllipse(k, x, 0, rx, ry)).id);
  const skin = b.add('surfaceLoft', { sketches: ids });
  b.add('thicken', { surface: skin.id, thickness: 2.5, side: 'in' });
  // Thumb-button opening and a lanyard hole.
  const cuts = b.sketch(front, (k) => { addSlot(k, 0, 80, 0, 94, 4); circleAt(k, 0, 14, 5); });
  b.add('extrude', { sketch: cuts.id, op: 'cut', end: 'throughBoth' });
  return b.part;
}

// ───────────────────────── vacuum cleaner floor nozzle (boundary surface, thickened)

function nozzle(name) {
  const b = builder(createPart(name, { material: 'abs', partNo: 'VC-NZ-250', color: '#5a6b7a', description: 'Floor nozzle body' }));
  // One boundary surface through five closed profiles: the flared bumper lip, the wide oval mouth, the mid
  // section, the round neck and the end of the swivel tube; thickened to a 2 mm wall.
  const lip = b.sketch(top, (k) => addEllipse(k, 0, 0, 125, 34));
  const mouth = b.sketch(b.plane(top, 8), (k) => addEllipse(k, 0, 0, 118, 28));
  const mid = b.sketch(b.plane(top, 45), (k) => addEllipse(k, 0, 12, 60, 22));
  const neck = b.sketch(b.plane(top, 90), (k) => circleAt(k, 0, 30, 36));
  const tube = b.sketch(b.plane(top, 140), (k) => circleAt(k, 0, 30, 36));
  const skin = b.add('boundary', { curves: [lip.id, mouth.id, mid.id, neck.id, tube.id] });
  b.add('thicken', { surface: skin.id, thickness: 2, side: 'out' });
  // Swivel collar on the tube.
  const col = b.sketch(b.plane(top, 115), (k) => { circleAt(k, 0, 30, 46); circleAt(k, 0, 30, 34); });
  b.add('extrude', { sketch: col.id, depth: 10 });
  // Air-bleed holes in the top, mirrored.
  const bleed = b.sketch(b.plane(top, 60), (k) => circleAt(k, 50, 0, 8));
  const bh = b.add('extrude', { sketch: bleed.id, op: 'cut', depth: 50 });
  b.add('mirror', { seeds: [bh.id], plane: { kind: 'std', name: 'right' } });
  return b.part;
}

// ───────────────────────── bottle (dome, thread, shell)

function bottle(name) {
  const b = builder(createPart(name, { material: 'pc', partNo: 'BT-500', color: '#8fb8d8', description: '500 ml sports bottle, PCO-style neck' }));
  const prof = b.sketch(front, (k) => {
    poly(k, [[0, 0], [30, 0], [33, 4], [33, 140], [15, 176], [0, 176]]);
    const shoulder = k.entities.find((e) => e.type === 'point' && near(e.x, 33) && near(e.y, 140));
    sketchFillet(k, shoulder.id, 20);
    addLine(k, 0, -10, 0, 190, { construction: true });
  });
  b.add('revolve', { sketch: prof.id });
  // Push-up in the base (a reversed dome) and a waist groove for the hand (cut-revolve).
  b.add('dome', { faces: b.faces((f) => f.type === 'PLANE' && near(f.center[1], 0) && f.normal[1] < -0.99), height: 5, reverse: true });
  const waist = b.sketch(front, (k) => { poly(k, [[31.5, 72], [34, 66], [34, 106], [31.5, 100]]); addLine(k, 0, -10, 0, 190, { construction: true }); });
  b.add('revolve', { sketch: waist.id, op: 'cut' });
  // The body is shelled open at the top (2 mm wall); the neck goes on as a solid, is threaded, then bored through.
  b.add('shell', { thickness: 2, faces: b.faces((f) => f.type === 'PLANE' && near(f.center[1], 176) && f.normal[1] > 0.99) });
  // Vertical flutes pressed 1 mm into the wall round the lower body.
  const fl = b.sketch(b.plane(front, 40), (k) => addSlot(k, 0, 18, 0, 56, 3.5));
  const flute = b.add('extrude', { sketch: fl.id, op: 'cut', depth: 8 });
  b.add('circularPattern', { seeds: [flute.id], axis: { kind: 'axis', axis: 'y' }, count: 8 });
  const shoulderTop = b.plane(top, 176);
  const nk = b.sketch(shoulderTop, (k) => circle(k, 0, 0, 30));
  const neck = b.add('extrude', { sketch: nk.id, depth: 30 });
  const neckOnly = [b.part.features.find((f) => f.id === shoulderTop.id), nk, neck];
  b.add('thread', { edge: probeEdges(b, neckOnly, (e) => e.type === 'CIRCLE' && near(e.mid[1], 206))[0], pitch: 3, length: 12 });
  const tr = b.sketch(b.plane(top, 181), (k) => circle(k, 0, 0, 36));
  b.add('extrude', { sketch: tr.id, depth: 3 });
  const bore = b.sketch(b.plane(top, 206), (k) => circle(k, 0, 0, 24));
  b.add('extrude', { sketch: bore.id, op: 'cut', depth: 33 });
  return b.part;
}

// ───────────────────────── projects

const BUILDERS = {
  hsgGearbox: gearbox,
  hsgEnclosure: enclosure,
  hsgCover: cover,
  hsgVolute: volute,
  hsgEndBell: endBell,
  hsgChassis: chassis,
  hsgLBracket: lBracket,
  hsgDinRail: dinRail,
  hsgRackPanel: rackPanel,
  hsgHandle: handle,
  hsgBatteryBox: (name, lang) => batteryBox(lang),
  hsgGuard: guard,
  hsgGrip: grip,
  hsgNozzle: nozzle,
  hsgBottle: bottle,
};

export function build(id, lang) {
  const sample = SAMPLES.find((s) => s.id === id);
  if (!sample) return null;
  const name = sample[lang === 'en' ? 'en' : 'ko'][0];
  const project = createProject({ name, kind: 'none' });
  const made = BUILDERS[id](name, lang);
  if (made.parts) return made;
  return partOnly(project, made);
}

