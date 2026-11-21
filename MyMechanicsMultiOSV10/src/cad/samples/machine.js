// Start-page samples of the "machine" group (기계 요소 / Machine elements): gears, worm drive, pulleys and
// sprockets, a ball bearing, shafts, couplings, springs, a cam, a lead screw, a universal-joint yoke, a
// crankshaft and an impeller — real feature trees built with the same features a user would use.
// Imports are used only inside functions: samples.js imports this module (a circular import).
import { builder, circle, poly, point, near, component, mate, settle } from '../samples.js';
import { addLine, addArc, addSlot, addRectangle } from '../sketch.js';
import { addSpline, addEllipse, circularSketchPattern, sketchFillet } from '../sketchtools.js';
import { createPart, createProject, createAssembly } from '../document.js';
import { quatIdentity, captureMate, mateEntityOfFace } from '../assembly.js';
import { isCylinder, faceSignature } from '../refs.js';
import { regenerate } from '../features.js';

export const SAMPLES = [
  { id: 'mchSpurGear', group: 'machine', icon: 'mateGear', ko: ['평기어 m2.5 Z36', '인벌류트 이(호) · 스케치 원형 패턴 · 웨브 홈 대칭 · 경량 구멍 패턴 · 키홈 · 전역 변수(M, Z, B)'], en: ['Spur gear m2.5 Z36', 'Involute teeth (arcs) · circular sketch pattern · mirrored web recess · lightening holes · keyway · global variables (M, Z, B)'] },
  { id: 'mchBevelGear', group: 'machine', icon: 'featCutLoft', ko: ['베벨 기어 m3 Z20', '로프트 원뿔 · 꼭짓점으로 줄어드는 이 홈 컷 로프트 · 원형 패턴 · 허브 · 멈춤나사 구멍'], en: ['Bevel gear m3 Z20', 'Lofted cone · cut-loft tooth spaces shrinking to the apex · circular pattern · hub · set screw'] },
  { id: 'mchWormGearSet', group: 'machine', icon: 'helix', ko: ['웜 기어 세트', '웜 축(나선 스윕 사다리꼴 나사 · 링 홈 · 키홈 · 센터 구멍) + 웜 휠(웨브 홈 · 이) · 직각·기어 메이트'], en: ['Worm gear set', 'Worm shaft (trapezoid swept along a helix · ring grooves · keyway · centre holes) + worm wheel (web recesses · teeth) · perpendicular and gear mates'] },
  { id: 'mchTimingPulley', group: 'machine', icon: 'equations', ko: ['타이밍 풀리 HTD 5M 30T', '홈 원형 패턴(N) · 플랜지 회전 · 탭 멈춤나사 패턴 · 전역 변수(P, N, W, OD)'], en: ['Timing pulley HTD 5M 30T', 'Groove pattern (N) · revolved flanges · tapped set screws patterned · global variables (P, N, W, OD)'] },
  { id: 'mchSprocket', group: 'machine', icon: 'featCirPattern', ko: ['체인 스프로킷 #40 21T', '롤러 자리 스케치 패턴 · 이 옆 모따기 회전 컷 대칭 · 허브 · 경량 구멍 패턴'], en: ['Chain sprocket #40 21T', 'Roller seats as a sketch pattern · tooth side chamfers (revolved cut, mirrored) · hub · lightening holes'] },
  { id: 'mchBallBearing', group: 'machine', icon: 'featRevolve', ko: ['깊은 홈 볼 베어링 6205-2Z', '내·외륜 회전 · 궤도 홈 · 스냅링 홈 · 실드 대칭 · 볼 9개 원형 패턴'], en: ['Deep-groove ball bearing 6205-2Z', 'Revolved rings · raceways · snap ring groove · mirrored shields · 9 balls in a circular pattern'] },
  { id: 'mchSteppedShaft', group: 'machine', icon: 'featCutRevolve', ko: ['계단축 (베어링·커플링 자리)', '회전 · 필렛 · 모따기 · 멈춤링 홈 · 키홈 2개 · 핀 구멍 · 센터 구멍 · M20 장식 나사산'], en: ['Stepped shaft (bearing and coupling seats)', 'Revolve · fillets · chamfers · retaining ring grooves · two keyways · pin hole · centre holes · cosmetic M20 thread'] },
  { id: 'mchJawCoupling', group: 'machine', icon: 'featHole', ko: ['조 커플링 반쪽', '허브 · 부채꼴 조 원형 패턴 · 필렛 · 모따기 · 키홈 · M8 탭 멈춤나사 2개'], en: ['Jaw coupling half', 'Hub · sector jaws in a circular pattern · fillets · chamfers · keyway · two M8 tapped set screws'] },
  { id: 'mchCompressionSpring', group: 'machine', icon: 'helix', ko: ['압축 스프링 (닫힌·연삭 끝)', '나선 3개 이어 스윕 · 끝 연삭 컷 · 전역 변수(DM, WIRE, PITCH, ACTIVE)'], en: ['Compression spring (closed, ground ends)', 'Three helices swept end to end · ground ends · global variables (DM, WIRE, PITCH, ACTIVE)'] },
  { id: 'mchTorsionSpring', group: 'machine', icon: 'featSweep', ko: ['비틀림 스프링', '나선 스윕 · 접선 다리 2개 (선+호 경로 스윕, 끝 고리)'], en: ['Torsion spring', 'Helix sweep · two tangent legs (line + arc path sweeps with hooks)'] },
  { id: 'mchGrooveCam', group: 'machine', icon: 'splineTool', ko: ['홈 캠 (종동절 홈)', '닫힌 스플라인 두 개 사이 홈 컷 · 허브 · 카운터보어 구멍 패턴 · 타이밍 표시'], en: ['Groove cam (follower track)', 'Groove between two closed splines · hub · counterbored hole pattern · timing mark'] },
  { id: 'mchLeadScrew', group: 'machine', icon: 'mateScrew', ko: ['리드 스크루와 플랜지 너트', 'Tr 나사 나선 스윕 · 너트 장식 나사산 · D컷 · 렌치 면 대칭 · 플랜지 구멍 패턴 · 나사 메이트'], en: ['Lead screw and flanged nut', 'Trapezoidal thread swept along a helix · cosmetic nut thread · D flat · mirrored wrench flats · flange hole pattern · screw mate'] },
  { id: 'mchUJointYoke', group: 'machine', icon: 'featIntersect', ko: ['유니버설 조인트 요크', '교차 돌출 2개로 귀 모양 · 십자 보어 · 스폿 페이스 대칭 · 키홈 · 핀·그리스 구멍'], en: ['Universal-joint yoke', 'Two intersect extrudes shape the lugs · cross bore · mirrored spot faces · keyway · pin and grease holes'] },
  { id: 'mchCrankshaft', group: 'machine', icon: 'featMirror', ko: ['4기통 크랭크축', '저널 회전 · 평형추 웨브 직선 패턴 · 크랭크 핀 · 바디 대칭 · 플랜지 볼트 패턴 · 키홈'], en: ['Four-throw crankshaft', 'Revolved journals · counterweighted webs (linear pattern) · crank pins · body mirror · flange bolt pattern · keyway'] },
  { id: 'mchImpeller', group: 'machine', icon: 'featLoft', ko: ['링 팬 임펠러', '비틀린 날개 로프트 · 원형 패턴 · 돔 · 슈라우드 링 · D컷 보어 · 멈춤나사'], en: ['Ring fan impeller', 'Twisted lofted blades · circular pattern · dome · shroud ring · D-shaped bore · set screw'] },
];

// ───────────────────────── small helpers

const T = (lang) => (ko, en) => (lang === 'en' ? en : ko);
const rad = (d) => (d * Math.PI) / 180;
const pol = (r, a) => [r * Math.cos(a), r * Math.sin(a)];

/** A construction line (a revolve axis). */
const axisLine = (k, x1, y1, x2, y2) => addLine(k, x1, y1, x2, y2, { construction: true });

/**
 * An arc from p1 through pm to p2 (either way round). `from` / `to` reuse existing points for its ends.
 * Returns { arc, start, end } (the point ids at p1 and p2).
 */
function arc3(k, p1, pm, p2, { from = null, to = null } = {}) {
  const [x1, y1] = p1; const [xm, ym] = pm; const [x2, y2] = p2;
  const d = 2 * (x1 * (ym - y2) + xm * (y2 - y1) + x2 * (y1 - ym));
  const s1 = x1 * x1 + y1 * y1; const sm = xm * xm + ym * ym; const s2 = x2 * x2 + y2 * y2;
  const cx = (s1 * (ym - y2) + sm * (y2 - y1) + s2 * (y1 - ym)) / d;
  const cy = (s1 * (x2 - xm) + sm * (x1 - x2) + s2 * (xm - x1)) / d;
  const r = Math.hypot(x1 - cx, y1 - cy);
  const ang = (x, y) => Math.atan2(y - cy, x - cx);
  // Counter-clockwise from p1 to p2 when pm lies to the right of the chord p1 → p2.
  const ccw = (x2 - x1) * (ym - y1) - (y2 - y1) * (xm - x1) < 0;
  if (ccw) { const arc = addArc(k, cx, cy, r, ang(x1, y1), ang(x2, y2), { from, to }); return { arc, start: arc.p1, end: arc.p2 }; }
  const arc = addArc(k, cx, cy, r, ang(x2, y2), ang(x1, y1), { from: to, to: from });
  return { arc, start: arc.p2, end: arc.p1 };
}

/** Rounds the sketch's line corners at these places (sketch fillets: the turned tool gets the round). */
function roundCorners(k, corners, r) {
  for (const [x, y] of corners) {
    const p = k.entities.find((e) => e.type === 'point' && Math.hypot(e.x - x, e.y - y) < 1e-6 && k.entities.some((l) => l.type === 'line' && !l.construction && (l.p1 === e.id || l.p2 === e.id)));
    if (p) sketchFillet(k, p.id, r);
  }
}

/** One part in a project of its own. */
function partOnly(name, part) {
  const project = createProject({ name, kind: 'none' });
  project.parts.push(part);
  project.active = { kind: 'part', id: part.id };
  return project;
}

/** The name (ko / en) of a sample. */
function nameOf(id, lang) {
  const s = SAMPLES.find((x) => x.id === id);
  return s[lang === 'en' ? 'en' : 'ko'][0];
}

/**
 * Involute tooth-space (gap) of a spur gear with module m and z teeth, centred on angle `at` (radians) in the
 * sketch: a root arc, radial lines up to the base circle, involute flanks as splines and a closing line a
 * little outside the tip circle. `scale` shrinks it about the origin (the small end of a bevel gear).
 */
function involuteGap(k, m, z, { at = 0, pa = 20, ext = 1.2, n = 6, scale = 1, offset = [0, 0], spline = false, straight = false } = {}) {
  const a0 = rad(pa);
  const r = (m * z) / 2; const rb = r * Math.cos(a0); const ra = r + m; const rf = r - 1.25 * m;
  const inv = (a) => Math.tan(a) - a;
  const half = (rho) => Math.PI / (2 * z) - inv(a0) + inv(Math.acos(Math.min(1, rb / rho)));
  const r0 = Math.max(rb, rf);
  const P = (rho, h) => { const [x, y] = pol(rho * scale, at + h); return [x + offset[0], y + offset[1]]; };
  const h0 = half(r0);
  const root = addArc(k, offset[0], offset[1], rf * scale, at - h0, at + h0);
  const flank = (sign, startId) => {
    const pts = [];
    for (let i = 0; i <= n; i++) { const rho = r0 + ((ra + ext - r0) * i) / n; pts.push(P(rho, sign * half(rho))); }
    // Straight sides: one line from the root to beyond the tip (a trapezoidal space).
    if (straight) return addLine(k, 0, 0, ...pts[n], { from: startId }).p2;
    let first = startId;
    if (rf < rb - 1e-6) { const l = addLine(k, 0, 0, ...P(r0, sign * h0), { from: startId }); first = l.p2; }
    if (spline) return addSpline(k, pts, { ids: [first] }).pts.at(-1);
    // An arc through the flank's ends and middle: within a few µm of the involute over a tooth's height.
    return arc3(k, pts[0], pts[n >> 1], pts[n], { from: first }).end;
  };
  const lower = flank(-1, root.p1);
  const upper = flank(1, root.p2);
  addLine(k, 0, 0, 0, 0, { from: upper, to: lower });
  return { r, rb, ra, rf };
}

/**
 * Every tooth space of a gear in one sketch: one involute gap and a circular sketch pattern of it (one cut
 * then makes all the teeth — far quicker than a feature pattern of z cuts on a detailed body).
 */
function gearTeeth(k, m, z, opts = {}) {
  const before = new Set(k.entities.map((e) => e.id));
  const g = involuteGap(k, m, z, opts);
  const ids = k.entities.filter((e) => !before.has(e.id)).map((e) => e.id);
  circularSketchPattern(k, ids, { cx: opts.offset?.[0] ?? 0, cy: opts.offset?.[1] ?? 0, count: z });
  return g;
}

// ───────────────────────── 1. spur gear (global variables M, Z, B)

function spurGear(name) {
  const part = createPart(name, { material: 'steel-4340', partNo: 'GR-M2.5-Z36' });
  part.variables = [{ name: 'M', expr: '2.5' }, { name: 'Z', expr: '36' }, { name: 'B', expr: '20' }, { name: 'BORE', expr: '25' }, { name: 'HUB', expr: 'B + 12' }];
  const b = builder(part);
  const m = 2.5; const z = 36; const B = 20; const H = B + 12;
  const ra = (m * (z + 2)) / 2; const rf = (m * z) / 2 - 1.25 * m;
  const rHub = 20; const rimIn = Math.floor(rf - 5);
  const blank = b.sketch('front', (k) => circle(k, 0, 0, 2 * ra), 'Blank');
  blank.constraints.find((c) => c.type === 'diameter').expr = 'M * (Z + 2)';
  b.add('extrude', { sketch: blank.id, end: 'midplane', depth: B, exprs: { depth: 'B' } });
  const hub = b.sketch('front', (k) => circle(k, 0, 0, 2 * rHub), 'Hub');
  b.add('extrude', { sketch: hub.id, end: 'midplane', depth: H, exprs: { depth: 'HUB' } });
  b.add('chamfer', { distance: 1, edges: b.edges((e) => e.type === 'CIRCLE' && near(Math.hypot(e.mid[0], e.mid[1]), rHub, 0.01) && near(Math.abs(e.mid[2]), H / 2)) });
  // The web: a recess turned into one face between the hub and the rim, mirrored to the other.
  const recess = b.sketch('right', (k) => {
    poly(k, [[-B / 2 - 1, rHub], [-B / 2 + 6, rHub], [-B / 2 + 6, rimIn], [-B / 2 - 1, rimIn]]);
    roundCorners(k, [[-B / 2 + 6, rHub]], 3);
    axisLine(k, -20, 0, 20, 0);
  }, 'Recess');
  const rc = b.add('revolve', { sketch: recess.id, op: 'cut' });
  b.add('mirror', { seeds: [rc.id], plane: { kind: 'std', name: 'front' } });
  const bore = b.sketch('front', (k) => circle(k, 0, 0, 25), 'Bore');
  bore.constraints.find((c) => c.type === 'diameter').expr = 'BORE';
  b.add('extrude', { sketch: bore.id, op: 'cut', end: 'throughBoth' });
  b.add('chamfer', { distance: 1, edges: b.edges((e) => e.type === 'CIRCLE' && near(Math.hypot(e.mid[0], e.mid[1]), 12.5, 0.01)) });
  const key = b.sketch('front', (k) => addRectangle(k, -4, 0, 4, 12.5 + 3.3), 'Keyway');
  b.add('extrude', { sketch: key.id, op: 'cut', end: 'throughBoth' });
  const holes = b.sketch('front', (k) => circle(k, (rHub + rimIn) / 2, 0, 10), 'Lightening');
  const hc = b.add('extrude', { sketch: holes.id, op: 'cut', end: 'throughBoth' });
  b.add('circularPattern', { seeds: [hc.id], axis: { kind: 'axis', axis: 'z' }, count: 6 });
  const gap = b.sketch('front', (k) => gearTeeth(k, m, z), 'ToothSpaces');
  b.add('extrude', { sketch: gap.id, op: 'cut', end: 'throughBoth' });
  return b.part;
}

// ───────────────────────── 2. bevel gear (a loft between two toothed outlines)

/**
 * The whole toothed outline of a gear as one closed loop: for one pitch a root arc, the involute flanks
 * (arcs) and the tip arc, then a circular sketch pattern of that chain (the copies join end to end).
 */
function gearOutline(k, m, z, { pa = 20, scale = 1 } = {}) {
  const a0 = rad(pa);
  const r = (m * z) / 2; const rb = r * Math.cos(a0); const ra = r + m; const rf = r - 1.25 * m;
  const inv = (a) => Math.tan(a) - a;
  const half = (rho) => Math.PI / (2 * z) - inv(a0) + inv(Math.acos(Math.min(1, rb / rho)));
  const r0 = Math.max(rb, rf); const rm = (r0 + ra) / 2; const step = (2 * Math.PI) / z;
  const S = (rho, ang) => pol(rho * scale, ang);
  const before = new Set(k.entities.map((e) => e.id));
  const h0 = half(r0);
  const root = arc3(k, S(rf, -h0), S(rf, 0), S(rf, h0));
  let at = root.end;
  if (rf < rb - 1e-6) at = addLine(k, 0, 0, ...S(r0, h0), { from: at }).p2;
  const f1 = arc3(k, S(r0, h0), S(rm, half(rm)), S(ra, half(ra)), { from: at });
  const tip = arc3(k, S(ra, half(ra)), S(ra, step / 2), S(ra, step - half(ra)), { from: f1.end });
  const f2 = arc3(k, S(ra, step - half(ra)), S(rm, step - half(rm)), S(r0, step - h0), { from: tip.end });
  if (rf < rb - 1e-6) addLine(k, 0, 0, ...S(rf, step - h0), { from: f2.end });
  circularSketchPattern(k, k.entities.filter((e) => !before.has(e.id)).map((e) => e.id), { count: z });
  return { r, ra, rf };
}

function bevelGear(name) {
  const b = builder(createPart(name, { material: 'steel-4340', partNo: 'GR-BV-M3-Z20' }));
  const m = 3; const z = 20; const h = 14; const s = 0.62;
  // Hub on the back and a boss on the front first; the toothed cone is lofted onto them.
  const hub = b.sketch('top', (k) => circle(k, 0, 0, 40), 'Hub');
  b.add('extrude', { sketch: hub.id, depth: 16, reverse: true });
  b.add('chamfer', { distance: 1.5, edges: b.edges((e) => e.type === 'CIRCLE' && near(e.mid[1], -16) && near(rXZ(e.mid), 20, 0.01)) });
  const front = b.sketch(b.plane('top', h - 0.5), (k) => circle(k, 0, 0, 30), 'FrontBoss');
  b.add('extrude', { sketch: front.id, depth: 4.5 });
  b.add('chamfer', { distance: 1, edges: b.edges((e) => e.type === 'CIRCLE' && near(e.mid[1], h + 4) && near(rXZ(e.mid), 15, 0.01)) });
  // The teeth shrink toward the cone apex: the same involute outline at the large end and, scaled, at the
  // small end — one loft makes every tooth.
  const big = b.sketch('top', (k) => gearOutline(k, m, z), 'LargeEnd');
  const small = b.sketch(b.plane('top', h), (k) => gearOutline(k, m, z, { scale: s }), 'SmallEnd');
  b.add('loft', { sketches: [big.id, small.id], ruled: true });
  const bore = b.sketch('top', (k) => circle(k, 0, 0, 20), 'Bore');
  b.add('extrude', { sketch: bore.id, op: 'cut', end: 'throughBoth' });
  const key = b.sketch('top', (k) => addRectangle(k, -3, 0, 3, 12.8), 'Keyway');
  b.add('extrude', { sketch: key.id, op: 'cut', end: 'throughBoth' });
  const ss = b.sketch(b.plane('right', 20), (k) => point(k, 0, -9), 'SetScrew');
  b.add('hole', { sketch: ss.id, diameter: 5, through: false, depth: 12 });
  return b.part;
}

const rXZ = (p) => Math.hypot(p[0], p[2]);
const rXY = (p) => Math.hypot(p[0], p[1]);
const rYZ = (p) => Math.hypot(p[1], p[2]);

/** A plane reference made with Flip (its normal turned round), for holes drilled from the other side. */
function flippedPlane(b, base, offset) {
  const f = b.add('plane', { base: { kind: 'std', name: base }, offset, flip: true });
  return { kind: 'ref', id: f.id };
}

// ───────────────────────── 3. worm and worm wheel (assembly)

function wormShaft(name) {
  const b = builder(createPart(name, { material: 'steel-4340', partNo: 'WM-M3-Q10' }));
  const s = b.sketch('front', (k) => {
    poly(k, [[-62, 0], [-62, 10], [-32, 10], [-32, 13], [-30, 13], [-30, 11.4], [30, 11.4], [30, 13], [32, 13], [32, 10], [52, 10], [52, 0]]);
    axisLine(k, -70, 0, 60, 0);
  }, 'WormProfile');
  b.add('revolve', { sketch: s.id });
  b.add('chamfer', { distance: 1, edges: b.edges((e) => e.type === 'CIRCLE' && (near(e.mid[0], -62) || near(e.mid[0], 52))) });
  b.add('chamfer', { distance: 0.5, edges: b.edges((e) => e.type === 'CIRCLE' && near(rYZ(e.mid), 13, 0.01) && (near(e.mid[0], -32) || near(e.mid[0], 32))) });
  const grooves = b.sketch('front', (k) => {
    addRectangle(k, -36.3, 9.4, -35.2, 10.5);
    addRectangle(k, 35.2, 9.4, 36.3, 10.5);
    axisLine(k, -70, 0, 60, 0);
  }, 'RingGrooves');
  b.add('revolve', { sketch: grooves.id, op: 'cut' });
  const key = b.sketch(b.plane('top', 10), (k) => addSlot(k, -58, 0, -46, 0, 3), 'Keyway');
  b.add('extrude', { sketch: key.id, op: 'cut', depth: 3.5 });
  const c1 = b.sketch(flippedPlane(b, 'right', -62), (k) => point(k, 0, 0), 'CentreHoleL');
  b.add('hole', { sketch: c1.id, kind: 'countersink', diameter: 2.5, csDiameter: 5.3, csAngle: 60, through: false, depth: 6 });
  const c2 = b.sketch(b.plane('right', 52), (k) => point(k, 0, 0), 'CentreHoleR');
  b.add('hole', { sketch: c2.id, kind: 'countersink', diameter: 2.5, csDiameter: 5.3, csAngle: 60, through: false, depth: 6 });
  // The worm thread: a 20° trapezoid (module 3: addendum 3, dedendum 3.6) swept along a helix of the axial
  // pitch π·m on the 30 mm pitch diameter, fused to the 22.8 mm root core.
  const P = Math.PI * 3; const x0 = -26; const turns = (56 - 4) / P;
  const helix = b.add('helix', { plane: b.plane('right', x0), radius: 15, pitch: P, turns });
  const wr = P / 2 + 2 * 3.6 * Math.tan(rad(20)) + 0.4; const wt = P / 2 - 2 * 3 * Math.tan(rad(20));
  const tooth = b.sketch('top', (k) => poly(k, [[x0 - wr / 2, -10.9], [x0 + wr / 2, -10.9], [x0 + wt / 2, -18], [x0 - wt / 2, -18]]), 'ThreadForm');
  b.add('sweep', { sketch: tooth.id, path: helix.id, frenet: true });
  return b.part;
}

function wormWheel(name) {
  const b = builder(createPart(name, { material: 'brass', partNo: 'WW-M3-Z30' }));
  const m = 3; const z = 30; const W = 24;
  const rf = (m * z) / 2 - 1.25 * m;
  // A straight-faced rim: a throated (or chamfered) rim, cut by every tooth space, is many times slower to build.
  const blank = b.sketch('front', (k) => circle(k, 0, 0, 98), 'Blank');
  b.add('extrude', { sketch: blank.id, end: 'midplane', depth: W });
  const hub = b.sketch('front', (k) => circle(k, 0, 0, 44), 'Hub');
  b.add('extrude', { sketch: hub.id, end: 'midplane', depth: W + 10 });
  const rimIn = Math.floor(rf - 5);
  const recess = b.sketch('right', (k) => {
    // Both faces' recesses in one turned cut.
    for (const sgn of [-1, 1]) {
      poly(k, [[sgn * (W / 2 + 1), 22], [sgn * (W / 2 - 6), 22], [sgn * (W / 2 - 6), rimIn], [sgn * (W / 2 + 1), rimIn]]);
      roundCorners(k, [[sgn * (W / 2 - 6), 22]], 3);
    }
    axisLine(k, -20, 0, 20, 0);
  }, 'Recesses');
  b.add('revolve', { sketch: recess.id, op: 'cut' });
  const holes = b.sketch('front', (k) => circle(k, (22 + rimIn) / 2, 0, 9), 'Lightening');
  const hc = b.add('extrude', { sketch: holes.id, op: 'cut', end: 'throughBoth' });
  b.add('circularPattern', { seeds: [hc.id], axis: { kind: 'axis', axis: 'z' }, count: 6 });
  const bore = b.sketch('front', (k) => circle(k, 0, 0, 25), 'Bore');
  b.add('extrude', { sketch: bore.id, op: 'cut', end: 'throughBoth' });
  const key = b.sketch('front', (k) => addRectangle(k, -4, 0, 4, 15.8), 'Keyway');
  b.add('extrude', { sketch: key.id, op: 'cut', end: 'throughBoth' });
  // Straight-sided tooth spaces (a worm wheel's teeth match the worm's straight rack-like flanks).
  const teeth = b.sketch('front', (k) => gearTeeth(k, m, z, { ext: 2, straight: true }), 'ToothSpaces');
  b.add('extrude', { sketch: teeth.id, op: 'cut', end: 'throughBoth' });
  return b.part;
}

/** A mate reference on a face of a built body (the part is built once for all its references). */
function refsOn(part, project, upTo = null) {
  let body = null;
  return (comp, test) => {
    // upTo: built without the last features (the teeth) when the faces wanted are not touched by them.
    if (!body) body = regenerate(part, { project, upTo }).body;
    const face = body.faces.find((f) => test(faceSignature(f), f));
    if (!face) throw new Error(`sample: face not found in ${part.name}`);
    return { comp, ...mateEntityOfFace(face, faceSignature) };
  };
}

function wormSet(name, lang) {
  const L = T(lang);
  const project = createProject({ name, kind: 'none' });
  const wheel = wormWheel(L('웜 휠 Z30', 'Worm wheel Z30'));
  const worm = wormShaft(L('웜 축 m3', 'Worm shaft m3'));
  project.parts.push(wheel, worm);
  const asm = createAssembly(name);
  project.assemblies.push(asm);
  const cWheel = component(asm, wheel, [0, 0, 0], quatIdentity(), true);
  const cWorm = component(asm, worm, [0, 60, 0]);
  const W = refsOn(wheel, project, wheel.features.length - 2); const S = refsOn(worm, project, worm.features.length - 4);
  const wheelAxis = W(cWheel.id, (f) => isCylinder(f.type) && near(f.radius ?? 0, 22, 0.01));
  const wormAxis = S(cWorm.id, (f) => isCylinder(f.type) && near(f.radius ?? 0, 10, 0.01) && f.center[0] > 40);
  mate(asm, 'perpendicular', wheelAxis, wormAxis);
  // 30 turns of the single-start worm for one turn of the wheel.
  mate(asm, 'gear', wheelAxis, wormAxis, { ratio: 30, reverse: false });
  captureMate(asm, asm.mates.at(-1));
  // The worm runs in the wheel's tooth spaces: meshing teeth touch (and the simplified forms overlap a little).
  asm.allowInterference = true;
  settle(project, asm);
  project.active = { kind: 'assembly', id: asm.id };
  return project;
}

// ───────────────────────── 4. timing pulley HTD 5M (global variables P, N, W)

function timingPulley(name) {
  const part = createPart(name, { material: 'al-6061', partNo: 'TP-5M-30-15' });
  part.variables = [{ name: 'P', expr: '5' }, { name: 'N', expr: '30' }, { name: 'W', expr: '16' }, { name: 'OD', expr: 'N * P / pi - 1.14' }, { name: 'BORE', expr: '14' }];
  const b = builder(part);
  const P = 5; const N = 30; const W = 16;
  const ro = (N * P) / Math.PI / 2 - 0.57;
  const blank = b.sketch('front', (k) => circle(k, 0, 0, 2 * ro), 'PitchBlank');
  blank.constraints.find((c) => c.type === 'diameter').expr = 'OD';
  b.add('extrude', { sketch: blank.id, end: 'midplane', depth: W, exprs: { depth: 'W' } });
  // Flanges (bevelled rims) on both sides and the hub on the back, turned in one profile.
  const flanges = b.sketch('right', (k) => {
    poly(k, [[-W / 2 + 1, 15], [-W / 2 + 1, 20.5], [-W / 2, 20.5], [-W / 2, 27], [-W / 2 - 1, 27], [-W / 2 - 1.6, 26.4], [-W / 2 - 1.6, 15]]);
    poly(k, [[W / 2 - 1, 0], [W / 2 - 1, 20.5], [W / 2, 20.5], [W / 2, 27], [W / 2 + 1, 27], [W / 2 + 1.6, 26.4], [W / 2 + 1.6, 16], [W / 2 + 13.6, 16], [W / 2 + 13.6, 0]]);
    axisLine(k, -30, 0, 30, 0);
  }, 'FlangesAndHub');
  b.add('revolve', { sketch: flanges.id });
  b.add('chamfer', { distance: 1, edges: b.edges((e) => e.type === 'CIRCLE' && near(e.mid[2], -W / 2 - 13.6) && near(rXY(e.mid), 16, 0.01)) });
  const bore = b.sketch('front', (k) => circle(k, 0, 0, 14), 'Bore');
  bore.constraints.find((c) => c.type === 'diameter').expr = 'BORE';
  b.add('extrude', { sketch: bore.id, op: 'cut', end: 'throughBoth' });
  b.add('chamfer', { distance: 0.6, edges: b.edges((e) => e.type === 'CIRCLE' && near(rXY(e.mid), 7, 0.01)) });
  const key = b.sketch('front', (k) => addRectangle(k, -2.5, 0, 2.5, 9.3), 'Keyway');
  b.add('extrude', { sketch: key.id, op: 'cut', end: 'throughBoth' });
  // Two M5 set screws in the hub, 90° apart: a spot-faced tapped hole and its pattern.
  const ss = b.sketch(b.plane('top', 16), (k) => point(k, 0, W / 2 + 7.6), 'SetScrew');
  const hole = b.add('hole', { sketch: ss.id, kind: 'counterbore', diameter: 4.2, cbDiameter: 7, cbDepth: 1, through: false, depth: 10 });
  const thread = b.add('thread', { edge: b.edges((e) => e.type === 'CIRCLE' && near(e.mid[1], 15, 1e-3) && near(Math.hypot(e.mid[0], e.mid[2] + W / 2 + 7.6), 2.1, 0.01))[0], pitch: 0.8, length: 6, size: 'M5', cosmetic: true, internal: 'internal' });
  b.add('circularPattern', { seeds: [hole.id, thread.id], axis: { kind: 'axis', axis: 'z' }, count: 2, angle: 90 });
  // One HTD groove (a 1.49 mm radius, 2.06 deep) across the belt width, patterned N times (last: quick).
  const groove = b.sketch('front', (k) => circle(k, ro - 2.06 + 1.49, 0, 2 * 1.49), 'Groove');
  const gc = b.add('extrude', { sketch: groove.id, op: 'cut', end: 'midplane', depth: W, exprs: { depth: 'W' } });
  b.add('circularPattern', { seeds: [gc.id], axis: { kind: 'axis', axis: 'z' }, count: N, exprs: { count: 'N' } });
  return b.part;
}

// ───────────────────────── 5. roller-chain sprocket ANSI 40, 21 teeth

/** A roller seat and its flanks (a sprocket tooth space) at angle `at`: seat circle at the pitch radius. */
function sprocketGap(k, Rp, rs, Ro, at, flare = rad(20)) {
  const P = ([x, y]) => [x * Math.cos(at) - y * Math.sin(at), x * Math.sin(at) + y * Math.cos(at)];
  const seat = [Rp, 0];
  const up = [seat[0] + rs * Math.cos(Math.PI / 2 + flare), rs * Math.sin(Math.PI / 2 + flare)];
  const lo = [up[0], -up[1]];
  const run = (Ro + 2 - up[0]) / Math.cos(flare);
  const upEnd = [up[0] + run * Math.cos(flare), up[1] + run * Math.sin(flare)];
  const loEnd = [upEnd[0], -upEnd[1]];
  const arc = arc3(k, P(up), P([seat[0] - rs, 0]), P(lo));
  const l1 = addLine(k, 0, 0, ...P(upEnd), { from: arc.start });
  const l2 = addLine(k, 0, 0, ...P(loEnd), { from: arc.end });
  addLine(k, 0, 0, 0, 0, { from: l1.p2, to: l2.p2 });
}

function sprocket(name) {
  const b = builder(createPart(name, { material: 'steel-1020', partNo: 'SP-40-21' }));
  const p = 12.7; const N = 21; const t = 7.2;
  const Rp = p / (2 * Math.sin(Math.PI / N)); const Ro = (p * (0.6 + 1 / Math.tan(Math.PI / N))) / 2; const rs = (1.005 * 7.92 + 0.076) / 2;
  const plate = b.sketch('front', (k) => circle(k, 0, 0, 2 * Ro), 'Plate');
  b.add('extrude', { sketch: plate.id, end: 'midplane', depth: t });
  const hub = b.sketch(b.plane('front', t / 2), (k) => circle(k, 0, 0, 46), 'Hub');
  b.add('extrude', { sketch: hub.id, depth: 18 });
  b.add('chamfer', { distance: 1.2, edges: b.edges((e) => e.type === 'CIRCLE' && near(e.mid[2], t / 2 + 18) && near(rXY(e.mid), 23, 0.01)) });
  const holes = b.sketch('front', (k) => circle(k, 30, 0, 8), 'Lightening');
  const hc = b.add('extrude', { sketch: holes.id, op: 'cut', end: 'throughBoth' });
  b.add('circularPattern', { seeds: [hc.id], axis: { kind: 'axis', axis: 'z' }, count: 6 });
  const bore = b.sketch('front', (k) => circle(k, 0, 0, 25), 'Bore');
  b.add('extrude', { sketch: bore.id, op: 'cut', end: 'throughBoth' });
  b.add('chamfer', { distance: 1, edges: b.edges((e) => e.type === 'CIRCLE' && near(rXY(e.mid), 12.5, 0.01)) });
  const key = b.sketch('front', (k) => addRectangle(k, -4, 0, 4, 15.8), 'Keyway');
  b.add('extrude', { sketch: key.id, op: 'cut', end: 'throughBoth' });
  const ss = b.sketch(b.plane('top', 23), (k) => point(k, 0, -(t / 2 + 9)), 'SetScrew');
  b.add('hole', { sketch: ss.id, diameter: 6.8, through: false, depth: 12 });
  // All 21 roller seats in one sketch (a circular sketch pattern of one seat), cut through.
  const teeth = b.sketch('front', (k) => {
    const before = new Set(k.entities.map((e) => e.id));
    sprocketGap(k, Rp, rs, Ro, 0);
    circularSketchPattern(k, k.entities.filter((e) => !before.has(e.id)).map((e) => e.id), { count: N });
  }, 'RollerSeats');
  b.add('extrude', { sketch: teeth.id, op: 'cut', end: 'throughBoth' });
  // Tooth side chamfers (the chain's lead-in): a turned cut on one face, mirrored to the other.
  const tc = b.sketch('right', (k) => {
    poly(k, [[-t / 2 - 0.1, Ro - 3.2], [-t / 2 - 0.1, Ro + 1], [-t / 2 + 1.8, Ro + 1]]);
    axisLine(k, -20, 0, 20, 0);
  }, 'ToothChamfer');
  const tcc = b.add('revolve', { sketch: tc.id, op: 'cut' });
  b.add('mirror', { seeds: [tcc.id], plane: { kind: 'std', name: 'front' } });
  return b.part;
}

// ───────────────────────── 6. deep-groove ball bearing 6205-2Z

function ballBearing(name) {
  const b = builder(createPart(name, { material: 'steel-4340', partNo: '6205-2Z' }));
  const Rp = 19.25; const rb = 7.938 / 2; const rg = 4.1; const B = 15;
  const inner = b.sketch('front', (k) => {
    poly(k, [[12.5, -B / 2], [16.6, -B / 2], [16.6, B / 2], [12.5, B / 2]]);
    roundCorners(k, [[12.5, -B / 2], [16.6, -B / 2], [16.6, B / 2], [12.5, B / 2]], 0.6);
    axisLine(k, 0, -10, 0, 10);
  }, 'InnerRing');
  b.add('revolve', { sketch: inner.id });
  const outer = b.sketch('front', (k) => {
    poly(k, [[21.9, -B / 2], [26, -B / 2], [26, B / 2], [21.9, B / 2]]);
    roundCorners(k, [[21.9, -B / 2], [26, -B / 2], [26, B / 2], [21.9, B / 2]], 0.6);
    axisLine(k, 0, -10, 0, 10);
  }, 'OuterRing');
  b.add('revolve', { sketch: outer.id });
  // Raceways: one groove circle turned through both rings.
  const race = b.sketch('front', (k) => { circle(k, Rp, 0, 2 * rg); axisLine(k, 0, -10, 0, 10); }, 'Raceways');
  b.add('revolve', { sketch: race.id, op: 'cut' });
  // Shield seats: shallow recesses in the outer ring for the shields.
  const seat = b.sketch('front', (k) => {
    addRectangle(k, 21.5, B / 2 - 1.2, 23.4, B / 2 + 0.1);
    addRectangle(k, 21.5, -B / 2 - 0.1, 23.4, -B / 2 + 1.2);
    axisLine(k, 0, -10, 0, 10);
  }, 'ShieldSeats');
  b.add('revolve', { sketch: seat.id, op: 'cut' });
  const snap = b.sketch('front', (k) => { addRectangle(k, 24.9, 4.4, 26.5, 5.5); axisLine(k, 0, -10, 0, 10); }, 'SnapRingGroove');
  b.add('revolve', { sketch: snap.id, op: 'cut' });
  // Steel shields (2Z): a pressed ring set in the seat, mirrored to the other side.
  const shield = b.sketch('front', (k) => {
    poly(k, [[17.0, B / 2 - 1.0], [23.6, B / 2 - 1.0], [23.6, B / 2 - 0.4], [17.6, B / 2 - 0.4], [17.6, B / 2 - 0.2], [17.0, B / 2 - 0.2]]);
    axisLine(k, 0, -10, 0, 10);
  }, 'Shield');
  const sh = b.add('revolve', { sketch: shield.id });
  b.add('mirror', { seeds: [sh.id], plane: { kind: 'std', name: 'top' } });
  // The balls: a half disc turned about its straight edge, patterned round the pitch circle.
  const ball = b.sketch('front', (k) => {
    const arc = addArc(k, Rp, 0, rb, -Math.PI / 2, Math.PI / 2);
    addLine(k, 0, 0, 0, 0, { from: arc.p2, to: arc.p1 });
    axisLine(k, Rp, -rb - 1, Rp, rb + 1);
  }, 'Ball');
  const bl = b.add('revolve', { sketch: ball.id });
  b.add('circularPattern', { seeds: [bl.id], axis: { kind: 'axis', axis: 'y' }, count: 9 });
  return b.part;
}

// ───────────────────────── 7. stepped shaft (keyways, ring grooves, thread, centre holes)

function steppedShaft(name) {
  const b = builder(createPart(name, { material: 'steel-4340', partNo: 'SH-240-30' }));
  const prof = [[0, 0], [0, 10], [22, 10], [22, 12.5], [60, 12.5], [60, 16], [68, 16], [68, 15], [150, 15], [150, 17.5], [158, 17.5], [158, 12.5], [190, 12.5], [190, 11], [240, 11], [240, 0]];
  const s = b.sketch('front', (k) => { poly(k, prof); axisLine(k, -10, 0, 250, 0); }, 'ShaftProfile');
  b.add('revolve', { sketch: s.id });
  const atX = (x, r) => (e) => e.type === 'CIRCLE' && near(e.mid[0], x, 1e-3) && near(rYZ(e.mid), r, 0.01);
  b.add('fillet', { radius: 0.8, edges: b.edges((e) => [atX(60, 12.5), atX(68, 15), atX(150, 15), atX(158, 12.5), atX(190, 11)].some((t) => t(e))) });
  b.add('chamfer', { distance: 1, edges: b.edges((e) => [atX(240, 11), atX(22, 12.5), atX(60, 16), atX(68, 16), atX(150, 17.5), atX(158, 17.5)].some((t) => t(e))) });
  const grooves = b.sketch('front', (k) => {
    addRectangle(k, 54.8, 11.95, 56.1, 13);
    addRectangle(k, 184.8, 11.95, 186.1, 13);
    axisLine(k, -10, 0, 250, 0);
  }, 'RetainingRingGrooves');
  b.add('revolve', { sketch: grooves.id, op: 'cut' });
  const k1 = b.sketch(b.plane('top', 15), (k) => addSlot(k, 84, 0, 136, 0, 4), 'Keyway30');
  b.add('extrude', { sketch: k1.id, op: 'cut', depth: 5 });
  const k2 = b.sketch(b.plane('top', 11), (k) => addSlot(k, 198, 0, 232, 0, 3), 'Keyway22');
  b.add('extrude', { sketch: k2.id, op: 'cut', depth: 3.5 });
  const pin = b.sketch(b.plane('top', 17.5), (k) => point(k, 154, 0), 'PinHole');
  b.add('hole', { sketch: pin.id, diameter: 5, through: true });
  // M20 × 1.5 on the left end.
  b.add('thread', { edge: b.edges(atX(0, 10))[0], pitch: 1.5, length: 16, size: 'M20x1.5', cosmetic: true });
  const c1 = b.sketch(flippedPlane(b, 'right', 0), (k) => point(k, 0, 0), 'CentreHoleA');
  b.add('hole', { sketch: c1.id, kind: 'countersink', diameter: 3.15, csDiameter: 6.7, csAngle: 60, through: false, depth: 8 });
  const c2 = b.sketch(b.plane('right', 240), (k) => point(k, 0, 0), 'CentreHoleB');
  b.add('hole', { sketch: c2.id, kind: 'countersink', diameter: 3.15, csDiameter: 6.7, csAngle: 60, through: false, depth: 8 });
  return b.part;
}

// ───────────────────────── 8. jaw coupling half

function jawCoupling(name) {
  const b = builder(createPart(name, { material: 'cast-iron', partNo: 'JC-L100-24' }));
  const hub = b.sketch('top', (k) => circle(k, 0, 0, 56), 'Hub');
  b.add('extrude', { sketch: hub.id, depth: 24 });
  b.add('chamfer', { distance: 1.5, edges: b.edges((e) => e.type === 'CIRCLE' && near(e.mid[1], 0) && near(rXZ(e.mid), 28, 0.01)) });
  // One jaw: an annular sector, patterned three times (the spider fits in the gaps).
  const jaw = b.sketch(b.plane('top', 24), (k) => {
    const o = addArc(k, 0, 0, 27, rad(-27), rad(27));
    const i = addArc(k, 0, 0, 13.5, rad(-27), rad(27));
    addLine(k, 0, 0, 0, 0, { from: i.p1, to: o.p1 });
    addLine(k, 0, 0, 0, 0, { from: i.p2, to: o.p2 });
  }, 'Jaw');
  const jw = b.add('extrude', { sketch: jaw.id, depth: 16 });
  b.add('circularPattern', { seeds: [jw.id], axis: { kind: 'axis', axis: 'y' }, count: 3 });
  b.add('fillet', { radius: 2, edges: b.edges((e) => e.type === 'LINE' && Math.abs(e.dir[1]) > 0.99 && near(rXZ(e.mid), 27, 0.01) && e.mid[1] > 24) });
  b.add('chamfer', { distance: 1.2, edges: b.edges((e) => near(e.mid[1], 40) && rXZ(e.mid) > 13) });
  const bore = b.sketch('top', (k) => circle(k, 0, 0, 24), 'Bore');
  b.add('extrude', { sketch: bore.id, op: 'cut', end: 'throughBoth' });
  b.add('chamfer', { distance: 1, edges: b.edges((e) => e.type === 'CIRCLE' && near(e.mid[1], 0) && near(rXZ(e.mid), 12, 0.01)) });
  const key = b.sketch('top', (k) => addRectangle(k, 0, -4, 15.3, 4), 'Keyway');
  b.add('extrude', { sketch: key.id, op: 'cut', end: 'throughBoth' });
  // Two M8 set screws: over the key and at 90°.
  const s1 = b.sketch(b.plane('right', 28), (k) => point(k, 0, 10), 'SetScrewKey');
  b.add('hole', { sketch: s1.id, kind: 'counterbore', diameter: 6.8, cbDiameter: 11, cbDepth: 1.5, through: false, depth: 18 });
  b.add('thread', { edge: b.edges((e) => e.type === 'CIRCLE' && near(e.mid[0], 26.5, 1e-3) && near(Math.hypot(e.mid[1] - 10, e.mid[2]), 3.4, 0.01))[0], pitch: 1.25, length: 10, size: 'M8', cosmetic: true, internal: 'internal' });
  const s2 = b.sketch(b.plane('front', 28), (k) => point(k, 0, 10), 'SetScrew90');
  b.add('hole', { sketch: s2.id, kind: 'counterbore', diameter: 6.8, cbDiameter: 11, cbDepth: 1.5, through: false, depth: 18 });
  return b.part;
}

// ───────────────────────── 9. compression spring (helix sweeps, closed and ground ends; variables)

function compressionSpring(name) {
  const part = createPart(name, { material: 'steel-4340', partNo: 'CS-4x30x58' });
  part.variables = [{ name: 'DM', expr: '30' }, { name: 'WIRE', expr: '4' }, { name: 'PITCH', expr: '10' }, { name: 'ACTIVE', expr: '5' }, { name: 'CLOSED', expr: 'WIRE + 0.2' }];
  const b = builder(part);
  const R = 15; const d = 4; const p = 10; const n = 5; const pc = d + 0.2;
  const top = { kind: 'std', name: 'top' };
  // A closed end coil, the active coils, and the other closed end: three helices end to end.
  const h1 = b.add('helix', { plane: top, radius: R, pitch: pc, turns: 1, exprs: { radius: 'DM / 2', pitch: 'CLOSED' } });
  const pl2 = b.add('plane', { base: top, offset: pc, exprs: { offset: 'CLOSED' } });
  const h2 = b.add('helix', { plane: { kind: 'ref', id: pl2.id }, radius: R, pitch: p, turns: n, exprs: { radius: 'DM / 2', pitch: 'PITCH', turns: 'ACTIVE' } });
  const pl3 = b.add('plane', { base: top, offset: pc + n * p, exprs: { offset: 'CLOSED + ACTIVE * PITCH' } });
  const h3 = b.add('helix', { plane: { kind: 'ref', id: pl3.id }, radius: R, pitch: pc, turns: 1, exprs: { radius: 'DM / 2', pitch: 'CLOSED' } });
  const wire = (y, label) => {
    const s = b.sketch('right', (k) => circle(k, -R, y, d), label);
    s.constraints.find((c) => c.type === 'diameter').expr = 'WIRE';
    return s;
  };
  // Active coils first, then the end coils joined to them.
  b.add('sweep', { sketch: wire(pc, 'WireActive').id, path: h2.id, frenet: true });
  b.add('sweep', { sketch: wire(pc + n * p, 'WireTopEnd').id, path: h3.id, frenet: true });
  b.add('sweep', { sketch: wire(0, 'WireBottomEnd').id, path: h1.id, frenet: true });
  // Ground ends: flat, square to the axis.
  const g1 = b.sketch(b.plane('top', 1.2), (k) => circle(k, 0, 0, 50), 'GrindA');
  b.add('extrude', { sketch: g1.id, op: 'cut', end: 'through' });
  const g2 = b.sketch(b.plane('top', 2 * pc + n * p - 1.2), (k) => circle(k, 0, 0, 50), 'GrindB');
  b.add('extrude', { sketch: g2.id, op: 'cut', end: 'through', reverse: true });
  return b.part;
}

// ───────────────────────── 10. torsion spring (helix sweep + tangent legs with hooks)

function torsionSpring(name) {
  const b = builder(createPart(name, { material: 'steel-4340', partNo: 'TS-3x24-6' }));
  const R = 12; const d = 3; const p = 3.3; const n = 6; const H = p * n;
  // The coil: a helix about the Y axis (it starts at +Z, heading +X), the wire circle on the Right plane there.
  const coil = b.add('helix', { plane: { kind: 'std', name: 'top' }, radius: R, pitch: p, turns: n });
  const prof = b.sketch('right', (k) => circle(k, -R, 0, d), 'Wire');
  b.add('sweep', { sketch: prof.id, path: coil.id, frenet: true });
  // The legs leave the coil along its tangent (Top plane: sketch y = −Z); each ends in a hook.
  const leg = (plane, sx, label) => b.sketch(plane, (k) => {
    const l = addLine(k, 0, -R, sx * 30, -R);
    const a = arc3(k, [sx * 30, -R], [sx * 33, -R + 3], [sx * 30, -R + 6], { from: l.p2 });
    addLine(k, 0, 0, sx * 25, -R + 6, { from: a.end });
  }, label);
  const legA = leg('top', -1, 'LegPathA');
  const pa = b.sketch('right', (k) => circle(k, -R, 0, d), 'WireLegA');
  b.add('sweep', { sketch: pa.id, path: legA.id });
  const legB = leg(b.plane('top', H), 1, 'LegPathB');
  const pb = b.sketch('right', (k) => circle(k, -R, H, d), 'WireLegB');
  b.add('sweep', { sketch: pb.id, path: legB.id });
  return b.part;
}

// ───────────────────────── 11. plate cam with a follower groove (closed splines)

function grooveCam(name) {
  const b = builder(createPart(name, { material: 'steel-4340', partNo: 'CM-140-G12' }));
  const T0 = 18; const depth = 8; const half = 6.5;
  const disk = b.sketch('front', (k) => circle(k, 0, 0, 140), 'Disk');
  b.add('extrude', { sketch: disk.id, depth: T0 });
  b.add('chamfer', { distance: 1.5, edges: b.edges((e) => e.type === 'CIRCLE' && near(rXY(e.mid), 70, 0.01)) });
  const hub = b.sketch('front', (k) => circle(k, 0, 0, 50), 'Hub');
  b.add('extrude', { sketch: hub.id, depth: 12, reverse: true });
  b.add('chamfer', { distance: 1, edges: b.edges((e) => e.type === 'CIRCLE' && near(e.mid[2], -12) && near(rXY(e.mid), 25, 0.01)) });
  // The pitch curve: a rise of 12 mm with a little harmonic, the groove ±half around it (offset along the normal).
  const r = (t) => 44 + 6 * (1 - Math.cos(t)) + 2.5 * Math.sin(2 * t);
  const curve = (off) => {
    const n = 48; const pts = [];
    for (let i = 0; i < n; i++) {
      const t = (2 * Math.PI * i) / n; const e = 1e-4;
      const p0 = pol(r(t), t); const p1 = pol(r(t + e), t + e);
      const tx = p1[0] - p0[0]; const ty = p1[1] - p0[1]; const l = Math.hypot(tx, ty);
      pts.push([p0[0] + (off * ty) / l, p0[1] - (off * tx) / l]);
    }
    return pts;
  };
  const groove = b.sketch(b.plane('front', T0), (k) => { addSpline(k, curve(half), { closed: true }); addSpline(k, curve(-half), { closed: true }); }, 'FollowerGroove');
  b.add('extrude', { sketch: groove.id, op: 'cut', depth });
  const bore = b.sketch('front', (k) => circle(k, 0, 0, 25), 'Bore');
  b.add('extrude', { sketch: bore.id, op: 'cut', end: 'throughBoth' });
  const key = b.sketch('front', (k) => addRectangle(k, -4, 0, 4, 15.8), 'Keyway');
  b.add('extrude', { sketch: key.id, op: 'cut', end: 'throughBoth' });
  const mh = b.sketch(b.plane('front', T0), (k) => point(k, 0, -27), 'MountHole');
  const hole = b.add('hole', { sketch: mh.id, kind: 'counterbore', diameter: 6.6, cbDiameter: 11, cbDepth: 6.5, through: true });
  b.add('circularPattern', { seeds: [hole.id], axis: { kind: 'axis', axis: 'z' }, count: 4, angle: 360 });
  // Timing mark: a small V notch at the start of the rise.
  const mark = b.sketch('front', (k) => poly(k, [[67, 0], [71, -2], [71, 2]]), 'TimingMark');
  b.add('extrude', { sketch: mark.id, op: 'cut', end: 'throughBoth' });
  return b.part;
}

// ───────────────────────── 12. lead screw and flanged nut (assembly)

function leadScrew(name) {
  const b = builder(createPart(name, { material: 'stainless-304', partNo: 'LS-16x4-108' }));
  // Journals, bearing seats and the 11.5 mm root core of the Tr16×4 thread.
  const s = b.sketch('front', (k) => {
    poly(k, [[0, 0], [5, 0], [5, 12], [6, 12], [6, 20], [8, 20], [8, 26], [5.75, 26], [5.75, 82], [8, 82], [8, 88], [6, 88], [6, 98], [4, 98], [4, 108], [0, 108]]);
    axisLine(k, 0, -10, 0, 120);
  }, 'ScrewProfile');
  b.add('revolve', { sketch: s.id });
  b.add('chamfer', { distance: 0.5, edges: b.edges((e) => e.type === 'CIRCLE' && ((near(e.mid[1], 0) && near(rXZ(e.mid), 5, 0.01)) || (near(e.mid[1], 108) && near(rXZ(e.mid), 4, 0.01)) || (near(e.mid[1], 20) && near(rXZ(e.mid), 8, 0.01)) || (near(e.mid[1], 88) && near(rXZ(e.mid), 8, 0.01)))) });
  const flat = b.sketch(b.plane('right', 4.2), (k) => addRectangle(k, -7, -1, 7, 11), 'DFlat');
  b.add('extrude', { sketch: flat.id, op: 'cut', depth: 3, reverse: true });
  const groove = b.sketch('front', (k) => { addRectangle(k, 3.6, 101, 4.5, 101.9); axisLine(k, 0, -10, 0, 120); }, 'RingGroove');
  b.add('revolve', { sketch: groove.id, op: 'cut' });
  // Tr16×4: a 30° trapezoid (2.25 deep) swept along a 4 mm pitch helix over the core.
  const P = 4; const y0 = 28; const turns = (80 - y0) / P;
  const helix = b.add('helix', { plane: b.plane('top', y0), radius: 7, pitch: P, turns });
  const wr = P / 2 + 2 * 1.25 * Math.tan(rad(15)) + 0.2; const wt = P / 2 - 2 * 1 * Math.tan(rad(15));
  const form = b.sketch('right', (k) => poly(k, [[-5.5, y0 - wr / 2], [-5.5, y0 + wr / 2], [-8, y0 + wt / 2], [-8, y0 - wt / 2]]), 'ThreadForm');
  b.add('sweep', { sketch: form.id, path: helix.id, frenet: true });
  return b.part;
}

function leadNut(name) {
  const b = builder(createPart(name, { material: 'brass', partNo: 'LN-16x4-F' }));
  const s = b.sketch('front', (k) => {
    poly(k, [[6, 0], [20, 0], [20, 8], [12, 8], [12, 30], [6, 30]]);
    axisLine(k, 0, -10, 0, 40);
  }, 'NutProfile');
  b.add('revolve', { sketch: s.id });
  b.add('chamfer', { distance: 0.8, edges: b.edges((e) => e.type === 'CIRCLE' && ((near(rXZ(e.mid), 20, 0.01)) || (near(e.mid[1], 30) && near(rXZ(e.mid), 12, 0.01)))) });
  b.add('fillet', { radius: 1.5, edges: b.edges((e) => e.type === 'CIRCLE' && near(e.mid[1], 8) && near(rXZ(e.mid), 12, 0.01)) });
  const fl = b.sketch(b.plane('right', 10.5), (k) => addRectangle(k, -15, 8.5, 15, 31), 'WrenchFlat');
  const flc = b.add('extrude', { sketch: fl.id, op: 'cut', depth: 3, reverse: true });
  b.add('mirror', { seeds: [flc.id], plane: { kind: 'std', name: 'right' } });
  const fh = b.sketch(b.plane('top', 8), (k) => point(k, 15, 0), 'FlangeHole');
  const hole = b.add('hole', { sketch: fh.id, diameter: 4.5, through: true });
  b.add('circularPattern', { seeds: [hole.id], axis: { kind: 'axis', axis: 'y' }, count: 4 });
  const lube = b.sketch(b.plane('front', 12), (k) => point(k, 0, 19), 'LubeHole');
  b.add('hole', { sketch: lube.id, diameter: 3, through: false, depth: 7 });
  // The internal Tr16×4 thread is cosmetic (shown in drawings, no geometry).
  b.add('thread', { edge: b.edges((e) => e.type === 'CIRCLE' && near(e.mid[1], 30) && near(rXZ(e.mid), 6, 0.01))[0], pitch: 4, length: 30, size: 'Tr16x4', cosmetic: true, internal: 'internal' });
  return b.part;
}

function leadScrewSet(name, lang) {
  const L = T(lang);
  const project = createProject({ name, kind: 'none' });
  const screw = leadScrew(L('리드 스크루 Tr16×4', 'Lead screw Tr16×4'));
  const nut = leadNut(L('플랜지 너트', 'Flanged nut'));
  project.parts.push(screw, nut);
  const asm = createAssembly(name);
  project.assemblies.push(asm);
  const cs = component(asm, screw, [0, 0, 0], quatIdentity(), true);
  const cn = component(asm, nut, [0, 40, 0]);
  const S = refsOn(screw, project, screw.features.length - 4); const N = refsOn(nut, project);
  const sAxis = S(cs.id, (f) => isCylinder(f.type) && near(f.radius ?? 0, 6, 0.01) && f.center[1] < 20);
  const nAxis = N(cn.id, (f) => isCylinder(f.type) && near(f.radius ?? 0, 20, 0.01));
  // The nut travels 4 mm per turn on the screw.
  mate(asm, 'screw', sAxis, nAxis, { pitch: 4, reverse: false });
  captureMate(asm, asm.mates.at(-1));
  // The nut's thread sits in the screw's: the two thread forms share their flanks.
  asm.allowInterference = true;
  settle(project, asm);
  project.active = { kind: 'assembly', id: asm.id };
  return project;
}

// ───────────────────────── 13. universal-joint yoke (intersect extrudes)

function ujointYoke(name) {
  const b = builder(createPart(name, { material: 'steel-4340', partNo: 'UJ-Y-20' }));
  const hub = b.sketch('top', (k) => circle(k, 0, 0, 34), 'Hub');
  b.add('extrude', { sketch: hub.id, depth: 28 });
  const fork = b.sketch('front', (k) => poly(k, [[-26, 24], [26, 24], [26, 74], [15, 74], [15, 36], [-15, 36], [-15, 74], [-26, 74]]), 'Fork');
  b.add('extrude', { sketch: fork.id, end: 'midplane', depth: 36 });
  // Rounded lug tops (seen from the side) and the round outside (seen from above): two intersect extrudes.
  const side = b.sketch('right', (k) => {
    const a = addArc(k, 0, 52, 18, 0, Math.PI);
    const l1 = addLine(k, 0, 0, -18, -2, { from: a.p2 });
    const l2 = addLine(k, 0, 0, 18, -2, { from: l1.p2 });
    addLine(k, 0, 0, 0, 0, { from: l2.p2, to: a.p1 });
  }, 'LugOutline');
  b.add('extrude', { sketch: side.id, op: 'common', end: 'throughBoth' });
  const round = b.sketch('top', (k) => circle(k, 0, 0, 58), 'OuterRound');
  b.add('extrude', { sketch: round.id, op: 'common', end: 'throughBoth' });
  b.add('fillet', { radius: 4, edges: b.edges((e) => e.type === 'LINE' && Math.abs(e.dir[2]) > 0.99 && near(Math.abs(e.mid[0]), 15) && near(e.mid[1], 36)) });
  // The cross bore through both lugs, spot faces for the bearing cups (mirrored).
  const cross = b.sketch('right', (k) => circle(k, 0, 52, 15), 'CrossBore');
  b.add('extrude', { sketch: cross.id, op: 'cut', end: 'throughBoth' });
  const spot = b.sketch(b.plane('right', 26), (k) => circle(k, 0, 52, 24), 'SpotFace');
  const sp = b.add('extrude', { sketch: spot.id, op: 'cut', depth: 1.5 });
  b.add('mirror', { seeds: [sp.id], plane: { kind: 'std', name: 'right' } });
  b.add('chamfer', { distance: 0.8, edges: b.edges((e) => e.type === 'CIRCLE' && near(Math.hypot(e.mid[1] - 52, e.mid[2]), 7.5, 0.01)) });
  const bore = b.sketch('top', (k) => circle(k, 0, 0, 20), 'Bore');
  b.add('extrude', { sketch: bore.id, op: 'cut', depth: 30, reverse: true });
  b.add('chamfer', { distance: 1, edges: b.edges((e) => e.type === 'CIRCLE' && near(e.mid[1], 0) && (near(rXZ(e.mid), 17, 0.01) || near(rXZ(e.mid), 10, 0.01))) });
  const key = b.sketch('top', (k) => addRectangle(k, -3, 0, 3, 12.8), 'Keyway');
  b.add('extrude', { sketch: key.id, op: 'cut', depth: 24, reverse: true });
  const pin = b.sketch(b.plane('right', 17), (k) => point(k, 0, 12), 'CrossPin');
  b.add('hole', { sketch: pin.id, diameter: 6, through: true });
  const grease = b.sketch(b.plane('front', 18), (k) => point(k, 20.5, 52), 'GreaseHole');
  b.add('hole', { sketch: grease.id, diameter: 4, through: false, depth: 12 });
  return b.part;
}

// ───────────────────────── 14. four-throw crankshaft (revolve, extrudes, linear pattern, mirror)

/** A crank web with its counterweight, pin side toward angle `phi`: pin boss arc, flanks, counterweight arc. */
function crankWeb(k, phi, R = 30) {
  const rot = phi - Math.PI / 2;
  const P = ([x, y]) => [x * Math.cos(rot) - y * Math.sin(rot), x * Math.sin(rot) + y * Math.cos(rot)];
  const top = arc3(k, P([24, R]), P([0, R + 24]), P([-24, R]));
  const cw0 = P(pol(56, rad(200))); const cw1 = P(pol(56, rad(340)));
  const l1 = addLine(k, 0, 0, ...cw0, { from: top.end });
  const cw = arc3(k, cw0, P([0, -56]), cw1, { from: l1.p2 });
  addLine(k, 0, 0, 0, 0, { from: cw.end, to: top.start });
}

function crankshaft(name) {
  const b = builder(createPart(name, { material: 'steel-4340', partNo: 'CR-4C-60' }));
  const R = 30;
  // Main journals 1, 2 and half of 3 (u = −z, v = r): the shaft is symmetric about the centre main.
  const mains = b.sketch('right', (k) => {
    poly(k, [[0, 0], [0, 20], [-24, 20], [-24, 0]]);
    poly(k, [[-74, 0], [-74, 20], [-98, 20], [-98, 0]]);
    poly(k, [[-148, 0], [-148, 20], [-160, 20], [-160, 0]]);
    axisLine(k, 10, 0, -170, 0);
  }, 'MainJournals');
  b.add('revolve', { sketch: mains.id });
  // A throw: a web with its counterweight, the second web as a linear pattern of it, the pin between,
  // and a lightening bore through pin and webs. Throw 1 has its pin up, throw 2 down.
  const throwAt = (z0, phi, tag) => {
    const web = b.sketch(b.plane('front', z0), (k) => crankWeb(k, phi, R), `Web${tag}`);
    const w = b.add('extrude', { sketch: web.id, depth: 14 });
    b.add('linearPattern', { seeds: [w.id], direction: { kind: 'axis', axis: 'z' }, spacing: 36, count: 2 });
    const pin = b.sketch(b.plane('front', z0 + 13), (k) => circle(k, ...pol(R, phi), 36), `Pin${tag}`);
    b.add('extrude', { sketch: pin.id, depth: 24 });
    const bore = b.sketch(b.plane('front', z0 - 1), (k) => circle(k, ...pol(R, phi), 14), `PinBore${tag}`);
    b.add('extrude', { sketch: bore.id, op: 'cut', depth: 52, reverse: true });
  };
  throwAt(24, Math.PI / 2, '1');
  throwAt(98, -Math.PI / 2, '2');
  // Throws 3 and 4 and mains 4 and 5: the whole body mirrored about the centre main journal.
  b.add('mirror', { body: true, plane: b.plane('front', 160) });
  // The pulley nose and the flywheel flange (not symmetric: added after the mirror).
  const ends = b.sketch('right', (k) => {
    poly(k, [[0.5, 0], [0.5, 15], [40, 15], [40, 0]]);
    poly(k, [[-319.5, 0], [-319.5, 45], [-335, 45], [-335, 0]]);
    axisLine(k, 50, 0, -345, 0);
  }, 'NoseAndFlange');
  b.add('revolve', { sketch: ends.id });
  b.add('chamfer', { distance: 1, edges: b.edges((e) => e.type === 'CIRCLE' && ((near(e.mid[2], -40) && near(rXY(e.mid), 15, 0.01)) || (near(e.mid[2], 335) && near(rXY(e.mid), 45, 0.01)))) });
  const nk = b.sketch(b.plane('top', 15), (k) => addSlot(k, 0, 6, 0, 34, 2.5), 'NoseKeyway');
  b.add('extrude', { sketch: nk.id, op: 'cut', depth: 3 });
  const nose = b.sketch(flippedPlane(b, 'front', -40), (k) => point(k, 0, 0), 'NoseBolt');
  b.add('hole', { sketch: nose.id, diameter: 10.2, through: false, depth: 25 });
  const fh = b.sketch(b.plane('front', 335), (k) => point(k, 0, 34), 'FlangeBolt');
  const fhole = b.add('hole', { sketch: fh.id, diameter: 8.5, through: false, depth: 15 });
  b.add('circularPattern', { seeds: [fhole.id], axis: { kind: 'axis', axis: 'z' }, count: 6 });
  const pilot = b.sketch(b.plane('front', 335), (k) => circle(k, 0, 0, 20), 'PilotBore');
  b.add('extrude', { sketch: pilot.id, op: 'cut', depth: 12 });
  return b.part;
}

// ───────────────────────── 15. ring fan impeller (lofted twisted blades, circular pattern, dome)

function impeller(name) {
  const b = builder(createPart(name, { material: 'al-6061', partNo: 'IMP-150-5' }));
  const hub = b.sketch('right', (k) => { poly(k, [[12, 0], [12, 12], [0, 12], [0, 20], [-30, 20], [-30, 0]]); axisLine(k, 20, 0, -40, 0); }, 'Hub');
  b.add('revolve', { sketch: hub.id });
  b.add('chamfer', { distance: 1, edges: b.edges((e) => e.type === 'CIRCLE' && near(e.mid[2], -12) && near(rXY(e.mid), 12, 0.01)) });
  b.add('dome', { faces: b.faces((f) => f.type === 'PLANE' && near(f.center[2], 30) && f.normal[2] > 0.9), height: 9 });
  const ring = b.sketch('right', (k) => { addRectangle(k, -26, 70, -4, 74); axisLine(k, 10, 0, -40, 0); }, 'Shroud');
  b.add('revolve', { sketch: ring.id });
  b.add('chamfer', { distance: 1, edges: b.edges((e) => e.type === 'CIRCLE' && near(rXY(e.mid), 74, 0.01)) });
  // A blade: a loft from a thick root section (steep) to a thin tip section (flatter) — twisted.
  const root = b.sketch(b.plane('right', 16), (k) => addEllipse(k, -15, 0, 14, 2.4, rad(55)), 'BladeRoot');
  const tip = b.sketch(b.plane('right', 72), (k) => addEllipse(k, -15, 0, 12, 1.3, rad(28)), 'BladeTip');
  const blade = b.add('loft', { sketches: [root.id, tip.id] });
  b.add('circularPattern', { seeds: [blade.id], axis: { kind: 'axis', axis: 'z' }, count: 5 });
  // The shaft bore with a D flat, and a set screw in the back boss.
  const bore = b.sketch('front', (k) => {
    const a0 = Math.acos(3 / 4);
    const arc = addArc(k, 0, 0, 4, a0, 2 * Math.PI - a0);
    addLine(k, 0, 0, 0, 0, { from: arc.p2, to: arc.p1 });
  }, 'DBore');
  b.add('extrude', { sketch: bore.id, op: 'cut', end: 'throughBoth' });
  const ss = b.sketch(b.plane('top', 12), (k) => point(k, 0, 6), 'SetScrew');
  b.add('hole', { sketch: ss.id, diameter: 2.5, through: false, depth: 9 });
  return b.part;
}

// ───────────────────────── build

const BUILDERS = {
  mchSpurGear: (n) => spurGear(n),
  mchBevelGear: (n) => bevelGear(n),
  mchWormGearSet: (n, lang) => wormSet(n, lang),
  mchTimingPulley: (n) => timingPulley(n),
  mchSprocket: (n) => sprocket(n),
  mchBallBearing: (n) => ballBearing(n),
  mchSteppedShaft: (n) => steppedShaft(n),
  mchJawCoupling: (n) => jawCoupling(n),
  mchCompressionSpring: (n) => compressionSpring(n),
  mchTorsionSpring: (n) => torsionSpring(n),
  mchGrooveCam: (n) => grooveCam(n),
  mchLeadScrew: (n, lang) => leadScrewSet(n, lang),
  mchUJointYoke: (n) => ujointYoke(n),
  mchCrankshaft: (n) => crankshaft(n),
  mchImpeller: (n) => impeller(n),
};

export function build(id, lang = 'ko') {
  const name = nameOf(id, lang);
  const made = BUILDERS[id](name, lang);
  if (made.parts) return made;
  return partOnly(name, made);
}

