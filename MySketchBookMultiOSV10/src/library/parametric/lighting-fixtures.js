// Lighting (조명): more fixture types, every one with its own light marker so it can be switched on
// and off by itself (Properties › Lamp, the context menu or the bulb button in the Outliner) —
// recessed (gimbal, trimless, pinhole, wall-washer, square multi-head, deep anti-glare), panels
// (600 / 1200 / round edge-lit / backlit sky), linear (recessed profile, suspended up-down, ring,
// rectangle frame, wall-grazer), commercial (high-bay round, low-bay, vapour-proof batten, canopy,
// stage par, gallery track rail), pendants (bell, opal globe, cone, cluster rods, beam, bowl, coil
// LED, cylinder), ceiling (dome, ufo, flush crystal, hanji square, bathroom), wall (up-down, half-
// moon, bulkhead, plate, swing reading, slim LED), floor / table (arc LED, tube floor, mushroom
// floor, portable cordless, touch cube, bedside gooseneck), cove strip and under-shelf bars.
// Units metres, Y up, front +Z, origin bottom centre (finish() centres every build).
import { THREE, Kit, P, T, frameShape } from './helpers.js';
import { finish } from './kitchen.js';
import { mk } from './appliances-more.js';
import { C } from './accessories-plus.js';

const PI = Math.PI;
const WARM = '#ffd9a8', NEUTRAL = '#fff1dc', COOL = '#eef4ff';
const lg = (def) => mk({ category: 'lighting', ...def });
const TEMP = P.pick('temp', '색온도', 'Colour temperature', 'neutral', [['warm', '전구색 3000K', 'Warm 3000K'], ['neutral', '주백색 4000K', 'Neutral 4000K'], ['cool', '주광색 6500K', 'Daylight 6500K']]);
const tone = (t) => ({ warm: WARM, neutral: NEUTRAL, cool: COOL }[t] ?? NEUTRAL);
const glowMat = (t) => ({ warm: 'light-warm', neutral: 'light-neutral', cool: 'light-cool' }[t] ?? 'light-neutral');

/* ============================================================ recessed */

const gimbal = lg({
  id: 'lgx-gimbal-downlight', placement: 'ceiling', elevation: 2.4 - 0.02, ko: '각도 조절 매입 다운라이트', en: 'Adjustable gimbal downlight',
  params: [P.len('diameter', '지름', 'Diameter', 0.1, 0.07, 0.18), P.num('tilt', '기울기', 'Tilt', 0.35, 0, 0.6, 0.01), TEMP],
  tags: ['gimbal downlight', 'adjustable downlight', 'recessed spot', '매입등', '다운라이트', '각도 조절'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = p.diameter / 2;
    k.cyl('trim', 'metal-pc-white-perforated', r + 0.012, r + 0.012, 0.004, 0, 0.016, 0, { segs: k.seg(24, 8), ...C('#f4f4f4') });
    k.sphere('gimbal', 'paint-white-matte', r * 0.85, 0, 0.016, 0, { rx: PI + p.tilt, thetaLength: PI / 2, segs: k.seg(20, 8), rings: k.seg(6, 3) });
    k.cyl('lens', glowMat(p.temp), r * 0.45, r * 0.45, 0.003, Math.sin(p.tilt) * r * 0.6, 0.016 - Math.cos(p.tilt) * r * 0.75, 0, { rz: p.tilt, segs: k.seg(16, 6) });
    k.light(Math.sin(p.tilt) * r * 0.6, 0, 0, { intensity: 0.7, distance: 5, type: 'spot', angle: 0.4, color: tone(p.temp) });
    return finish(k);
  },
});

const trimless = lg({
  id: 'lgx-trimless-downlight', placement: 'ceiling', elevation: 2.4 - 0.01, ko: '트림리스 매입등', en: 'Trimless recessed downlight',
  params: [P.len('diameter', '지름', 'Diameter', 0.08, 0.05, 0.15), TEMP],
  tags: ['trimless downlight', 'plaster-in', 'minimal downlight', '트림리스', '매입등', '미니멀 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = p.diameter / 2;
    k.cyl('reflector', 'metal-pc-black-matte', r, r, 0.03, 0, -0.02, 0, { open: true, segs: k.seg(20, 8) });
    k.cyl('lens', glowMat(p.temp), r * 0.6, r * 0.6, 0.003, 0, -0.005, 0, { segs: k.seg(16, 6) });
    k.light(0, -0.02, 0, { intensity: 0.6, distance: 5, type: 'spot', angle: 0.35, color: tone(p.temp) });
    return finish(k);
  },
});

const pinhole = lg({
  id: 'lgx-pinhole-spot', placement: 'ceiling', elevation: 2.4 - 0.01, ko: '핀홀 스포트 매입등', en: 'Pinhole recessed spot',
  params: [P.len('size', '크기', 'Size', 0.06, 0.04, 0.1), TEMP],
  tags: ['pinhole light', 'mini spot', 'accent light', '핀홀 조명', '미니 스포트', '포인트 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx), s = p.size;
    k.box('trim', 'paint-white-matte', s, 0.004, s, 0, 0.002, 0, { r: 0.002 });
    k.cyl('lens', glowMat(p.temp), s * 0.12, s * 0.12, 0.002, 0, 0.0, 0, { segs: 10 });
    k.light(0, -0.01, 0, { intensity: 0.35, distance: 4, type: 'spot', angle: 0.2, color: tone(p.temp) });
    return finish(k);
  },
});

const wallWasher = lg({
  id: 'lgx-asymmetric-wall-washer', placement: 'ceiling', elevation: 2.4 - 0.02, ko: '비대칭 월워셔 매입등', en: 'Asymmetric wall-washer downlight',
  params: [P.len('diameter', '지름', 'Diameter', 0.12, 0.09, 0.18), TEMP],
  tags: ['wall washer', 'asymmetric downlight', 'gallery light', '월워셔', '벽면 조명', '갤러리 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = p.diameter / 2;
    k.cyl('trim', 'paint-white-matte', r + 0.01, r + 0.01, 0.004, 0, 0.016, 0, { segs: k.seg(24, 8) });
    k.cyl('lens', glowMat(p.temp), r * 0.8, r * 0.8, 0.003, 0, 0.012, 0, { segs: k.seg(20, 8) });
    k.sphere('shield', 'paint-white-matte', r * 0.8, 0, 0.012, 0, { rx: PI, thetaLength: PI / 2, segs: k.seg(16, 6), rings: k.seg(6, 3), scale: [1, 0.6, 1] });
    k.light(0, 0, -r, { intensity: 0.6, distance: 4, type: 'spot', angle: 0.6, color: tone(p.temp) });
    return finish(k);
  },
});

const multiHead = lg({
  id: 'lgx-square-multi-head', placement: 'ceiling', elevation: 2.4 - 0.03, ko: '사각 다중 헤드 매입등', en: 'Square multi-head recessed light',
  params: [P.int('heads', '헤드 수', 'Heads', 3, 1, 4), TEMP],
  tags: ['multi head', 'square downlight', 'retail lighting', '다중 헤드', '사각 매입등', '매장 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx), n = p.heads, s = 0.09, w = n * s + 0.02;
    k.box('trim', 'metal-pc-black-matte', w, 0.008, s + 0.02, 0, 0.026, 0, { r: 0.002 });
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * s;
      k.box('cells', 'metal-pc-black-matte', s - 0.006, 0.025, s - 0.006, x, 0.012, 0, { r: 0.002 });
      k.cyl('lens', glowMat(p.temp), s * 0.25, s * 0.25, 0.002, x, 0.0, 0, { segs: 12 });
      k.light(x, -0.01, 0, { intensity: 0.4, distance: 5, type: 'spot', angle: 0.3, color: tone(p.temp) });
    }
    return finish(k);
  },
});

const antiGlare = lg({
  id: 'lgx-deep-anti-glare-downlight', placement: 'ceiling', elevation: 2.4 - 0.01, ko: '딥 눈부심 방지 다운라이트', en: 'Deep anti-glare downlight',
  params: [P.len('diameter', '지름', 'Diameter', 0.09, 0.06, 0.14), P.pick('trim', '테두리', 'Trim', 'black', [['black', '검정', 'Black'], ['white', '흰색', 'White'], ['gold', '금색', 'Gold']]), TEMP],
  tags: ['anti glare downlight', 'deep recessed', 'ugr', '눈부심 방지', '다운라이트', '매입등'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = p.diameter / 2, m = { black: 'metal-pc-black-matte', white: 'paint-white-matte', gold: 'metal-gold-brushed' }[p.trim];
    k.cyl('trim', 'paint-white-matte', r + 0.01, r + 0.01, 0.004, 0, 0.006, 0, { segs: k.seg(24, 8) });
    k.cyl('reflector', m, r, r * 0.6, 0.05, 0, -0.044, 0, { open: true, segs: k.seg(20, 8) });
    k.cyl('lens', glowMat(p.temp), r * 0.5, r * 0.5, 0.002, 0, -0.03, 0, { segs: 12 });
    k.light(0, -0.05, 0, { intensity: 0.6, distance: 5, type: 'spot', angle: 0.35, color: tone(p.temp) });
    return finish(k);
  },
});

/* ============================================================ panels */

const panel = (id, ko, en, w, d, tags, { round = false, edge = false } = {}) => lg({
  id, placement: 'ceiling', elevation: 2.4 - 0.012, ko, en,
  params: [TEMP, P.num('power', '밝기', 'Brightness', 1, 0.3, 1.5, 0.05)],
  tags: [...tags, 'led panel', 'office light', 'LED 평판 조명', '사무실 조명', '천장 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    if (round) {
      k.cyl('frame', 'metal-pc-white-perforated', w / 2, w / 2, 0.012, 0, 0, 0, { segs: k.seg(36, 12), ...C('#f2f2f2') });
      k.cyl('diffuser', glowMat(p.temp), w / 2 - 0.01, w / 2 - 0.01, 0.002, 0, -0.001, 0, { segs: k.seg(36, 12) });
    } else {
      k.box('frame', 'metal-pc-white-perforated', w, 0.012, d, 0, 0.006, 0, { r: 0.002, ...C('#f2f2f2') });
      k.box('diffuser', glowMat(p.temp), w - (edge ? 0.04 : 0.02), 0.002, d - (edge ? 0.04 : 0.02), 0, -0.001, 0, { r: 0 });
    }
    const n = Math.max(1, Math.round((w * d) / 0.36));
    for (let i = 0; i < n; i++) k.light(-w / 2 + (i + 0.5) * (w / n), -0.01, 0, { intensity: (2.4 * p.power) / n, distance: 6, color: tone(p.temp) });
    return finish(k);
  },
});

const panels = [
  panel('lgx-led-panel-600', 'LED 평판 조명 (600×600)', 'LED flat panel 600×600', 0.595, 0.595, ['600 panel', 'grid ceiling', '600각', '텍스 천장']),
  panel('lgx-led-panel-1200', 'LED 평판 조명 (1200×300)', 'LED flat panel 1200×300', 1.195, 0.295, ['1200 panel', 'linear panel', '1200 평판', '길쭉 평판']),
  panel('lgx-led-panel-round', '원형 엣지 LED 평판', 'Round edge-lit LED panel', 0.5, 0.5, ['round panel', 'edge-lit', '원형 평판', '원형 LED'], { round: true }),
  panel('lgx-led-panel-640', 'LED 엣지 평판 (640×640, 슬림 테)', 'Slim-bezel LED edge panel 640×640', 0.64, 0.64, ['edge panel', 'slim bezel', '엣지 평판', '슬림 평판'], { edge: true }),
];

const skyPanel = lg({
  id: 'lgx-virtual-sky-panel', placement: 'ceiling', elevation: 2.4 - 0.08, ko: '가상 하늘 조명 패널', en: 'Virtual skylight panel',
  params: [P.len('size', '크기', 'Size', 1.2, 0.6, 1.8), P.color('sky', '하늘 색', 'Sky colour', '#bfe0ff')],
  tags: ['virtual skylight', 'sky panel', 'daylight panel', '가상 천창', '하늘 조명', '천창 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx), s = p.size;
    k.panel('frame', 'metal-pc-white-perforated', frameShape(s, s, 0.04), 0.08, 0, 0.04, 0, { rx: PI / 2, ...C('#f2f2f2') });
    k.box('sky', 'light-daylight', s - 0.08, 0.002, s - 0.08, 0, 0.0, 0, { r: 0, ...C(p.sky) });
    k.light(0, -0.02, 0, { intensity: 3.5, distance: 7, type: 'spot', angle: 1.1, color: '#e8f2ff' });
    return finish(k);
  },
});

/* ============================================================ linear */

const recessedProfile = lg({
  id: 'lgx-recessed-linear-profile', placement: 'ceiling', elevation: 2.4 - 0.005, ko: '매입 라인 조명 (알루미늄 프로파일)', en: 'Recessed linear profile light',
  params: [P.len('length', '길이', 'Length', 2.0, 0.6, 3.6), P.len('width', '폭', 'Width', 0.05, 0.02, 0.1), TEMP],
  tags: ['linear light', 'recessed profile', 'line light', '라인 조명', '매입 라인', '알루미늄 프로파일'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, w = p.width;
    k.box('profile', 'metal-al-anodised-clear', L, 0.008, w + 0.01, 0, 0.004, 0, { r: 0.001 });
    k.box('diffuser', glowMat(p.temp), L - 0.01, 0.002, w, 0, 0.0, 0, { r: 0 });
    const n = Math.max(1, Math.round(L / 1.2));
    for (let i = 0; i < n; i++) k.light(-L / 2 + (i + 0.5) * (L / n), -0.01, 0, { intensity: 1.0 * L / n, distance: 5, color: tone(p.temp) });
    return finish(k);
  },
});

const upDown = lg({
  id: 'lgx-suspended-up-down-linear', placement: 'ceiling', elevation: 2.7 - 0.85, ko: '직간접 펜던트 라인 조명', en: 'Suspended up-down linear light',
  params: [P.len('length', '길이', 'Length', 1.6, 0.9, 2.4), P.len('drop', '줄 길이', 'Drop', 0.8, 0.3, 1.5), P.color('body', '몸체 색', 'Body colour', '#2b2b2b'), TEMP],
  tags: ['up down light', 'direct indirect', 'suspended linear', '직간접 조명', '펜던트 라인', '사무실 펜던트'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, D = p.drop;
    k.box('body', 'metal-pc-black-matte', L, 0.04, 0.06, 0, 0.02, 0, { r: 0.004, ...C(p.body) });
    k.box('diffuser', glowMat(p.temp), L - 0.02, 0.002, 0.05, 0, -0.001, 0, { r: 0 });
    k.box('diffuser', glowMat(p.temp), L - 0.02, 0.002, 0.05, 0, 0.041, 0, { r: 0 });
    for (const x of [-L * 0.4, L * 0.4]) k.rod('wires', 'metal-ss-satin', [x, 0.04, 0], [x, 0.04 + D, 0], 0.0012, { segs: 4 });
    k.box('canopy', 'metal-pc-black-matte', 0.08, 0.02, 0.04, 0, 0.04 + D - 0.01, 0, { r: 0.004, ...C(p.body) });
    k.light(-L / 4, -0.01, 0, { intensity: 1.0, distance: 5, type: 'spot', angle: 1.0, color: tone(p.temp) });
    k.light(L / 4, -0.01, 0, { intensity: 1.0, distance: 5, type: 'spot', angle: 1.0, color: tone(p.temp) });
    k.light(0, 0.06, 0, { intensity: 0.8, distance: 4, color: tone(p.temp) });
    return finish(k);
  },
});

const ringPendant = lg({
  id: 'lgx-led-ring-pendant', placement: 'ceiling', elevation: 2.7 - 0.9, ko: 'LED 링 펜던트 (단일 링)', en: 'LED ring pendant',
  params: [P.len('diameter', '지름', 'Diameter', 0.8, 0.4, 1.6), P.len('drop', '줄 길이', 'Drop', 0.8, 0.3, 1.5), P.pick('finish', '마감', 'Finish', 'black', [['black', '검정', 'Black'], ['white', '흰색', 'White'], ['gold', '금색', 'Gold']]), TEMP],
  tags: ['ring pendant', 'halo light', 'circle light', '링 조명', '원형 펜던트', '서클 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx), R = p.diameter / 2, D = p.drop, m = { black: 'metal-pc-black-matte', white: 'paint-white-matte', gold: 'metal-gold-brushed' }[p.finish];
    k.add('ring', m, T(new THREE.TorusGeometry(R, 0.02, k.seg(8, 4), k.seg(48, 16)), 0, 0.02, 0, PI / 2));
    k.add('diffuser', glowMat(p.temp), T(new THREE.TorusGeometry(R, 0.012, k.seg(6, 3), k.seg(48, 16)), 0, 0.0, 0, PI / 2, 0, 0, [1, 1, 0.4]));
    for (let i = 0; i < 3; i++) { const a = (i / 3) * PI * 2; k.rod('wires', 'metal-ss-satin', [Math.cos(a) * R, 0.03, Math.sin(a) * R], [0, 0.03 + D, 0], 0.0012, { segs: 4 }); }
    k.cyl('canopy', m, 0.05, 0.05, 0.02, 0, 0.03 + D - 0.02, 0, { segs: 16 });
    for (let i = 0; i < 4; i++) { const a = (i / 4) * PI * 2; k.light(Math.cos(a) * R, -0.01, Math.sin(a) * R, { intensity: 0.5, distance: 5, color: tone(p.temp) }); }
    return finish(k);
  },
});

const rectFrame = lg({
  id: 'lgx-rectangle-frame-pendant', placement: 'ceiling', elevation: 2.7 - 0.9, ko: '사각 프레임 라인 펜던트', en: 'Rectangular frame linear pendant',
  params: [P.len('length', '길이', 'Length', 1.6, 0.8, 2.6), P.len('width', '폭', 'Width', 0.6, 0.3, 1.2), P.len('drop', '줄 길이', 'Drop', 0.8, 0.3, 1.5), TEMP],
  tags: ['frame pendant', 'rectangle light', 'meeting room light', '사각 라인 조명', '회의실 조명', '프레임 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, W = p.width, D = p.drop;
    k.panel('frame', 'metal-pc-black-matte', frameShape(L, W, 0.04), 0.04, 0, 0.02, 0, { rx: PI / 2 });
    for (const sz of [-1, 1]) k.box('diffuser', glowMat(p.temp), L - 0.02, 0.002, 0.03, 0, -0.001, sz * (W / 2 - 0.02), { r: 0 });
    for (const sx of [-1, 1]) k.box('diffuser', glowMat(p.temp), 0.03, 0.002, W - 0.08, sx * (L / 2 - 0.02), -0.001, 0, { r: 0 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rod('wires', 'metal-ss-satin', [sx * L * 0.4, 0.04, sz * W * 0.4], [sx * L * 0.4, 0.04 + D, sz * W * 0.4], 0.0012, { segs: 4 });
    for (const sz of [-1, 1]) k.light(0, -0.01, sz * W / 2, { intensity: 1.2, distance: 5, color: tone(p.temp) });
    return finish(k);
  },
});

const grazer = lg({
  id: 'lgx-wall-grazer-bar', placement: 'wall', elevation: 0.1, ko: '월 그레이저 라인 조명 (바닥 매입)', en: 'Wall-grazer light bar',
  params: [P.len('length', '길이', 'Length', 1.0, 0.3, 2.0), TEMP],
  tags: ['wall grazer', 'uplight bar', 'facade light', '월 그레이저', '벽면 업라이트', '바닥 매입등'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length;
    k.box('body', 'metal-al-anodised-black', L, 0.04, 0.06, 0, 0.02, 0.03, { r: 0.004 });
    k.box('lens', glowMat(p.temp), L - 0.02, 0.002, 0.03, 0, 0.041, 0.03, { r: 0 });
    k.light(0, 0.06, 0.03, { intensity: 0.8 * L, distance: 4, type: 'spot', angle: 0.25, color: tone(p.temp) });
    return finish(k);
  },
});

/* ============================================================ commercial */

const highBayRound = lg({
  id: 'lgx-ufo-high-bay', placement: 'ceiling', elevation: 6 - 0.4, ko: 'UFO형 LED 공장등', en: 'UFO LED high-bay',
  params: [P.len('diameter', '지름', 'Diameter', 0.32, 0.25, 0.45), P.bool('reflector', '반사갓', 'Reflector', true)],
  tags: ['high bay', 'ufo light', 'warehouse light', '공장등', '투광등', '창고 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = p.diameter / 2;
    k.cyl('body', 'metal-pc-black-matte', r, r * 0.9, 0.06, 0, 0.0, 0, { segs: k.seg(28, 10) });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; k.box('fins', 'metal-pc-black-matte', 0.004, 0.04, r * 0.5, Math.cos(a) * r * 0.6, 0.08, Math.sin(a) * r * 0.6, { r: 0, ry: -a }); }
    k.cyl('lens', 'light-cool', r * 0.85, r * 0.85, 0.003, 0, -0.002, 0, { segs: k.seg(28, 10) });
    if (p.reflector) k.cyl('reflector', 'metal-al-polished', r * 1.6, r, 0.15, 0, -0.15, 0, { open: true, segs: k.seg(28, 10) });
    k.add('hook', 'metal-steel-raw', T(new THREE.TorusGeometry(0.02, 0.004, 6, 12), 0, 0.14, 0));
    k.light(0, -0.05, 0, { intensity: 10, distance: 14, type: 'spot', angle: 1.0, color: COOL });
    return finish(k);
  },
});

const vaporProof = lg({
  id: 'lgx-vapour-proof-batten', placement: 'ceiling', elevation: 2.7 - 0.08, ko: '방수 방진등 (주차장·창고)', en: 'Vapour-proof batten (IP65)',
  params: [P.len('length', '길이', 'Length', 1.2, 0.6, 1.5), TEMP],
  tags: ['vapour proof', 'ip65', 'parking light', 'batten', '방수등', '방진등', '주차장 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length;
    k.box('base', 'plastic-abs-matte-grey', L, 0.04, 0.09, 0, 0.05, 0, { r: 0.006 });
    k.lathe('cover', 'plastic-acrylic-opal', [[0, -0.04], [0.04, -0.03], [0.045, 0.0], [0, 0]], 0, 0.03, 0, { rz: PI / 2, scale: [1, 1, 1], segs: k.seg(16, 6) });
    k.box('cover', 'plastic-acrylic-opal', L - 0.04, 0.05, 0.08, 0, 0.0, 0, { r: 0.02 });
    k.box('tube', glowMat(p.temp), L - 0.1, 0.012, 0.012, 0, 0.0, 0, { r: 0.005 });
    k.light(0, -0.03, 0, { intensity: 1.6 * L, distance: 6, color: tone(p.temp) });
    return finish(k);
  },
});

const canopy = lg({
  id: 'lgx-canopy-light', placement: 'ceiling', elevation: 3.5 - 0.1, ko: '캐노피 조명 (주유소·필로티)', en: 'Canopy light',
  params: [P.len('size', '크기', 'Size', 0.4, 0.3, 0.6)],
  tags: ['canopy light', 'petrol station', 'pilotis', '캐노피 조명', '필로티 조명', '주유소 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx), s = p.size;
    k.box('body', 'metal-pc-light-grey', s, 0.08, s, 0, 0.04, 0, { r: 0.008 });
    k.box('lens', 'light-cool', s - 0.04, 0.003, s - 0.04, 0, -0.001, 0, { r: 0 });
    k.light(0, -0.02, 0, { intensity: 6, distance: 10, type: 'spot', angle: 1.1, color: COOL });
    return finish(k);
  },
});

const parCan = lg({
  id: 'lgx-stage-par-can', placement: 'ceiling', elevation: 3.0 - 0.45, ko: '무대 파 조명 (PAR)', en: 'Stage PAR can light',
  params: [P.num('tilt', '기울기', 'Tilt', 0.5, 0, 1.2, 0.01), P.color('gel', '젤 색', 'Gel colour', '#ff6a3d')],
  tags: ['par can', 'stage light', 'event lighting', '파 조명', '무대 조명', '공연 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx), a = p.tilt;
    k.box('yoke', 'metal-pc-black-matte', 0.26, 0.02, 0.03, 0, 0.42, 0, { r: 0.004 });
    for (const sx of [-1, 1]) k.box('yoke', 'metal-pc-black-matte', 0.02, 0.18, 0.03, sx * 0.12, 0.33, 0, { r: 0.004 });
    k.cyl('can', 'metal-pc-black-matte', 0.1, 0.1, 0.32, 0, 0.25, -0.16 * Math.cos(a), { rx: PI / 2 - a, segs: k.seg(24, 8) });
    k.cyl('lens', 'light-candle', 0.09, 0.09, 0.003, 0, 0.25 - Math.sin(a) * 0.16, 0.16 * Math.cos(a) - 0.16 * Math.cos(a) + 0.16 * Math.cos(a), { rx: PI / 2 - a, segs: k.seg(20, 8), ...C(p.gel) });
    k.add('clamp', 'metal-steel-raw', T(new THREE.TorusGeometry(0.03, 0.008, 6, 12), 0, 0.46, 0, 0, PI / 2, 0));
    k.light(0, 0.25 - Math.sin(a) * 0.2, Math.cos(a) * 0.2, { intensity: 1.5, distance: 8, type: 'spot', angle: 0.3, color: p.gel });
    return finish(k);
  },
});

const galleryRail = lg({
  id: 'lgx-gallery-track-rail', placement: 'ceiling', elevation: 3.0 - 0.15, ko: '갤러리 트랙 레일 조명 (4헤드)', en: 'Gallery track rail with spots',
  params: [P.len('length', '레일 길이', 'Rail length', 2.0, 1.0, 3.0), P.int('heads', '헤드 수', 'Heads', 4, 1, 6), P.pick('finish', '마감', 'Finish', 'white', [['white', '흰색', 'White'], ['black', '검정', 'Black']]), TEMP],
  tags: ['track light', 'gallery lighting', 'spotlight rail', '레일 조명', '갤러리 조명', '트랙 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, m = p.finish === 'white' ? 'paint-white-matte' : 'metal-pc-black-matte';
    k.box('rail', m, L, 0.035, 0.035, 0, 0.13, 0, { r: 0.003 });
    for (let i = 0; i < p.heads; i++) {
      const x = -L / 2 + (i + 0.5) * (L / p.heads), z = (i % 2 ? 1 : -1) * 0.02, a = 0.6;
      k.box('adapters', m, 0.04, 0.03, 0.03, x, 0.1, 0, { r: 0.004 });
      k.cyl('heads', m, 0.035, 0.035, 0.12, x, 0.08, z, { rx: PI - a, segs: k.seg(18, 6) });
      k.cyl('lens', glowMat(p.temp), 0.028, 0.028, 0.002, x, 0.08 - Math.cos(a) * 0.12, z + Math.sin(a) * 0.12, { rx: PI - a, segs: 12 });
      k.light(x, 0.08 - Math.cos(a) * 0.13, z + Math.sin(a) * 0.13, { intensity: 0.5, distance: 6, type: 'spot', angle: 0.3, color: tone(p.temp) });
    }
    return finish(k);
  },
});

/* ============================================================ pendants */

const pendant = (id, ko, en, tags, shade, { mat = 'metal-pc-black-matte', glow = false } = {}) => lg({
  id, placement: 'ceiling', elevation: 2.7 - 0.9, ko, en,
  params: [P.len('size', '크기', 'Size', 0.35, 0.18, 0.6), P.len('drop', '줄 길이', 'Drop', 0.6, 0.2, 1.4), P.color('shade', '갓 색', 'Shade colour', '#2b2b2b'), TEMP],
  tags: [...tags, 'pendant', 'hanging lamp', '펜던트', '펜던트 조명', '식탁 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx), s = p.size, D = p.drop;
    const h = shade(k, s, mat, p, glowMat(p.temp));
    k.cyl('cord', 'rubber-black', 0.003, 0.003, D, 0, h, 0, { segs: 6 });
    k.cyl('canopy', mat, 0.05, 0.05, 0.02, 0, h + D, 0, { segs: 16, ...(glow ? {} : C(p.shade)) });
    k.light(0, h * 0.3, 0, { intensity: 0.9, distance: 5, type: 'spot', angle: 0.9, color: tone(p.temp) });
    return finish(k);
  },
});

const pendants = [
  pendant('lgx-bell-pendant', '종 모양 펜던트', 'Bell pendant', ['bell pendant', 'kitchen pendant', '종 펜던트'], (k, s, m, p, g) => {
    k.lathe('shade', m, [[0.02, s * 0.7], [0.05, s * 0.66], [s * 0.2, s * 0.45], [s * 0.42, s * 0.12], [s * 0.5, 0], [s * 0.49, 0], [s * 0.41, s * 0.11], [s * 0.19, s * 0.44], [0.02, s * 0.66]], 0, 0, 0, { segs: k.seg(32, 10), ...C(p.shade) });
    k.sphere('bulb', g, s * 0.1, 0, s * 0.15, 0, { segs: 12, rings: 8 });
    return s * 0.7;
  }),
  pendant('lgx-opal-globe-pendant', '오팔 유리 구 펜던트', 'Opal glass globe pendant', ['globe pendant', 'opal glass', '구 펜던트', '유리 구'], (k, s, m, p, g) => {
    k.sphere('globe', g, s / 2, 0, s / 2, 0, { segs: k.seg(28, 10), rings: k.seg(18, 8) });
    k.cyl('cap', 'metal-brass-brushed', 0.03, 0.035, 0.03, 0, s - 0.01, 0, { segs: 14 });
    return s + 0.02;
  }, { glow: true }),
  pendant('lgx-cone-pendant', '원뿔 펜던트', 'Cone pendant', ['cone pendant', 'minimal pendant', '원뿔 펜던트'], (k, s, m, p, g) => {
    k.cyl('shade', m, 0.02, s * 0.3, s * 0.8, 0, 0, 0, { open: true, segs: k.seg(28, 10), ...C(p.shade) });
    k.cyl('bulb', g, s * 0.25, s * 0.25, 0.003, 0, 0.01, 0, { segs: 16 });
    return s * 0.8;
  }),
  pendant('lgx-wide-bowl-pendant', '넓은 볼 펜던트', 'Wide bowl pendant', ['bowl pendant', 'wide shade', '볼 펜던트', '넓은 갓'], (k, s, m, p, g) => {
    k.lathe('shade', m, [[0.02, s * 0.3], [s * 0.4, s * 0.2], [s * 0.75, 0], [s * 0.74, -0.005], [s * 0.39, s * 0.19], [0.02, s * 0.29]], 0, 0.005, 0, { segs: k.seg(36, 12), ...C(p.shade) });
    k.cyl('bulb', g, s * 0.3, s * 0.3, 0.003, 0, s * 0.12, 0, { segs: 16 });
    return s * 0.32;
  }),
  pendant('lgx-cylinder-pendant', '실린더 펜던트', 'Cylinder pendant', ['cylinder pendant', 'tube pendant', '원통 펜던트'], (k, s, m, p, g) => {
    k.cyl('shade', m, s * 0.2, s * 0.2, s, 0, 0, 0, { open: true, segs: k.seg(24, 8), ...C(p.shade) });
    k.cyl('bulb', g, s * 0.18, s * 0.18, 0.003, 0, 0.02, 0, { segs: 16 });
    return s;
  }),
  pendant('lgx-coil-led-pendant', '코일 LED 펜던트', 'Coil LED pendant', ['coil pendant', 'spiral led', '코일 조명', '나선 펜던트'], (k, s, m, p, g) => {
    const pts = [];
    for (let i = 0; i <= 60; i++) { const t = i / 60, a = t * PI * 2 * 4; pts.push([Math.cos(a) * s * 0.4 * (1 - t * 0.5), s * t, Math.sin(a) * s * 0.4 * (1 - t * 0.5)]); }
    k.tube('coil', g, pts, 0.006, { segs: k.seg(160, 60), radial: 5 });
    return s;
  }, { glow: true }),
];

const rodCluster = lg({
  id: 'lgx-rod-cluster-chandelier', placement: 'ceiling', elevation: 2.7 - 1.0, ko: '막대 클러스터 샹들리에', en: 'Rod cluster chandelier',
  params: [P.int('rods', '막대 수', 'Rods', 9, 5, 15), P.len('spread', '퍼짐', 'Spread', 0.4, 0.2, 0.7), P.mat('metal', '금속', 'Metal', 'metal-brass-brushed', 'metal'), TEMP],
  tags: ['cluster chandelier', 'rod lights', 'modern chandelier', '클러스터 샹들리에', '막대 조명', '모던 샹들리에'],
  build: (p, ctx) => {
    const k = new Kit(ctx), n = p.rods, S = p.spread;
    k.cyl('canopy', p.metal, 0.12, 0.12, 0.02, 0, 0.98, 0, { segs: 20 });
    for (let i = 0; i < n; i++) {
      const a = i * 2.4, r = S * Math.sqrt((i + 0.5) / n), x = Math.cos(a) * r, z = Math.sin(a) * r, y = 0.2 + ((i * 37) % 10) * 0.05;
      k.rod('wires', 'metal-ss-satin', [x, y + 0.3, z], [x * 0.2, 0.98, z * 0.2], 0.001, { segs: 3 });
      k.cyl('rods', p.metal, 0.012, 0.012, 0.3, x, y, z, { segs: 10 });
      k.cyl('lens', glowMat(p.temp), 0.01, 0.01, 0.002, x, y - 0.001, z, { segs: 8 });
    }
    k.light(0, 0.3, 0, { intensity: 2, distance: 6, color: tone(p.temp) });
    return finish(k);
  },
});

const beamPendant = lg({
  id: 'lgx-wood-beam-pendant', placement: 'ceiling', elevation: 2.7 - 0.9, ko: '원목 빔 펜던트 (전구 5개)', en: 'Wooden beam pendant with bulbs',
  params: [P.len('length', '길이', 'Length', 1.2, 0.6, 1.8), P.int('bulbs', '전구 수', 'Bulbs', 5, 3, 8), P.mat('wood', '목재', 'Wood', 'wood-am-walnut-oil', 'wood'), TEMP],
  tags: ['beam pendant', 'wood beam light', 'bulb pendant', '빔 펜던트', '원목 조명', '전구 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length;
    k.box('beam', p.wood, L, 0.08, 0.08, 0, 0.6, 0, { r: 0.004 });
    for (const x of [-L * 0.4, L * 0.4]) k.rod('wires', 'metal-black', [x, 0.64, 0], [x, 0.9, 0], 0.002, { segs: 4 });
    for (let i = 0; i < p.bulbs; i++) {
      const x = -L / 2 + (i + 0.5) * (L / p.bulbs), drop = 0.2 + ((i * 3) % 4) * 0.08;
      k.cyl('cords', 'rubber-black', 0.002, 0.002, drop, x, 0.56 - drop, 0, { segs: 4 });
      k.cyl('sockets', 'metal-brass-brushed', 0.014, 0.014, 0.04, x, 0.56 - drop - 0.04, 0, { segs: 10 });
      k.sphere('bulbs', glowMat(p.temp === 'neutral' ? 'warm' : p.temp), 0.035, x, 0.56 - drop - 0.07, 0, { segs: 12, rings: 8, scale: [1, 1.3, 1] });
    }
    k.light(0, 0.3, 0, { intensity: 1.6, distance: 6, color: WARM });
    return finish(k);
  },
});

/* ============================================================ ceiling */

const ceilingType = (id, ko, en, tags, body) => lg({
  id, placement: 'ceiling', elevation: 2.4 - 0.12, ko, en,
  params: [P.len('diameter', '지름', 'Diameter', 0.45, 0.25, 0.8), TEMP],
  tags: [...tags, 'ceiling light', 'flush mount', '천장등', '방등', '실링 라이트'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = p.diameter / 2;
    const h = body(k, r, glowMat(p.temp));
    k.light(0, -0.02, 0, { intensity: 2.2 * (r / 0.225) ** 2, distance: 6, color: tone(p.temp) });
    void h;
    return finish(k);
  },
});

const ceilings = [
  ceilingType('lgx-dome-ceiling-light', '돔형 방등', 'Dome ceiling light', ['dome light', 'bedroom light', '돔 방등'], (k, r, g) => {
    k.cyl('base', 'paint-white-matte', r * 0.9, r * 0.9, 0.03, 0, 0.09, 0, { segs: k.seg(32, 10) });
    k.sphere('diffuser', g, r, 0, 0.09, 0, { rx: PI, thetaLength: PI / 2, segs: k.seg(32, 10), rings: k.seg(10, 4), scale: [1, 0.4, 1] });
    return 0.12;
  }),
  ceilingType('lgx-square-ceiling-light', '사각 LED 방등', 'Square LED ceiling light', ['square ceiling light', 'room light', '사각 방등', 'LED 방등'], (k, r, g) => {
    k.box('base', 'paint-white-matte', r * 2, 0.06, r * 2, 0, 0.09, 0, { r: 0.01 });
    k.box('diffuser', g, r * 2 - 0.02, 0.03, r * 2 - 0.02, 0, 0.045, 0, { r: 0.012 });
    return 0.12;
  }),
  ceilingType('lgx-hanji-square-ceiling', '한지 사각 천장등', 'Hanji-paper square ceiling light', ['hanji light', 'korean lamp', '한지 조명', '한식 천장등'], (k, r, g) => {
    k.box('frame', 'wood-paulownia-oil', r * 2, 0.1, r * 2, 0, 0.06, 0, { r: 0.004 });
    k.box('diffuser', g, r * 2 - 0.04, 0.002, r * 2 - 0.04, 0, 0.009, 0, { r: 0 });
    for (const s of [-1, 1]) { k.box('frame', 'wood-paulownia-oil', 0.012, 0.012, r * 2, s * r * 0.33, 0.006, 0, { r: 0 }); k.box('frame', 'wood-paulownia-oil', r * 2, 0.012, 0.012, 0, 0.006, s * r * 0.33, { r: 0 }); }
    return 0.11;
  }),
  ceilingType('lgx-crystal-flush-light', '크리스탈 직부등', 'Crystal flush-mount light', ['crystal light', 'flush mount', '크리스탈 조명', '직부등'], (k, r, g) => {
    k.cyl('base', 'metal-chrome', r, r, 0.03, 0, 0.09, 0, { segs: k.seg(32, 10) });
    for (let i = 0; i < 3; i++) k.cyl('crystals', 'glass-crystal', r * (0.9 - i * 0.25), r * (0.85 - i * 0.25), 0.03, 0, 0.06 - i * 0.03, 0, { segs: k.seg(16, 8) });
    k.cyl('diffuser', g, r * 0.3, r * 0.3, 0.003, 0, 0.0, 0, { segs: 16 });
    return 0.12;
  }),
  ceilingType('lgx-bathroom-ip44-ceiling', '욕실등 (방습형)', 'Bathroom ceiling light (IP44)', ['bathroom light', 'moisture proof', '욕실등', '방습등'], (k, r, g) => {
    k.cyl('base', 'plastic-abs-matte-white', r * 0.95, r * 0.95, 0.04, 0, 0.06, 0, { segs: k.seg(32, 10) });
    k.cyl('diffuser', 'plastic-acrylic-opal', r, r * 0.9, 0.06, 0, 0.0, 0, { segs: k.seg(32, 10) });
    k.cyl('glow', g, r * 0.7, r * 0.7, 0.002, 0, -0.001, 0, { segs: 20 });
    return 0.1;
  }),
];

/* ============================================================ wall */

const wallType = (id, ko, en, tags, body, { elevation = 1.8, spot = false } = {}) => lg({
  id, placement: 'wall', elevation, ko, en,
  params: [P.color('body', '몸체 색', 'Body colour', '#2b2b2b'), TEMP],
  tags: [...tags, 'wall light', 'sconce', '벽등', '벽 조명', '브래킷'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const at = body(k, C(p.body), glowMat(p.temp));
    for (const l of at) k.light(l[0], l[1], l[2], { intensity: 0.5, distance: 4, ...(spot ? { type: 'spot', angle: 0.4 } : {}), color: tone(p.temp) });
    return finish(k);
  },
});

const walls = [
  wallType('lgx-up-down-wall-light', '상하 조사 벽등', 'Up-down wall light', ['up down light', 'cylinder sconce', '상하 조사', '원통 벽등'], (k, c, g) => {
    k.cyl('body', 'metal-pc-black-matte', 0.04, 0.04, 0.16, 0, 0.0, 0.07, { segs: k.seg(20, 8), ...c });
    k.box('arm', 'metal-pc-black-matte', 0.04, 0.04, 0.03, 0, 0.08, 0.015, { r: 0.004, ...c });
    for (const y of [0.0, 0.16]) k.cyl('lens', g, 0.034, 0.034, 0.002, 0, y - 0.001, 0.07, { segs: 12 });
    return [[0, -0.02, 0.07], [0, 0.18, 0.07]];
  }, { spot: true }),
  wallType('lgx-half-moon-wall-light', '반달 벽등', 'Half-moon wall light', ['half moon', 'semicircle sconce', '반달 벽등', '반원 조명'], (k, c, g) => {
    const s = new THREE.Shape(); s.absarc(0, 0, 0.15, 0, PI, false); s.closePath();
    k.panel('body', 'metal-brass-brushed', s, 0.03, 0, 0, 0.015, {});
    k.box('glow', g, 0.28, 0.004, 0.02, 0, 0.0, 0.03, { r: 0 });
    return [[0, 0.02, 0.06]];
  }),
  wallType('lgx-bulkhead-light', '벌크헤드 벽등 (방수)', 'Bulkhead wall light', ['bulkhead', 'outdoor wall light', 'ip65', '벌크헤드', '방수 벽등', '현관 등'], (k, c, g) => {
    k.box('base', 'metal-pc-black-matte', 0.26, 0.14, 0.05, 0, 0.07, 0.025, { r: 0.04, ...c });
    k.box('lens', 'plastic-acrylic-opal', 0.22, 0.1, 0.04, 0, 0.07, 0.06, { r: 0.04 });
    k.box('glow', g, 0.15, 0.04, 0.002, 0, 0.07, 0.082, { r: 0.01 });
    for (const y of [0.04, 0.1]) k.box('grill', 'metal-pc-black-matte', 0.22, 0.008, 0.006, 0, y, 0.082, { r: 0, ...c });
    return [[0, 0.07, 0.12]];
  }, { elevation: 1.9 }),
  wallType('lgx-plate-wall-light', '원판 간접 벽등', 'Disc halo wall light', ['disc wall light', 'halo sconce', '원판 벽등', '간접 벽등'], (k, c, g) => {
    k.cyl('disc', 'metal-pc-black-matte', 0.14, 0.14, 0.015, 0, 0.14, 0.05, { rx: PI / 2, segs: k.seg(32, 10), ...c });
    k.cyl('glow', g, 0.12, 0.12, 0.002, 0, 0.14, 0.048, { rx: PI / 2, segs: k.seg(28, 10) });
    k.cyl('stem', 'metal-pc-black-matte', 0.02, 0.02, 0.05, 0, 0.14, 0.0, { rx: PI / 2, segs: 10, ...c });
    return [[0, 0.14, 0.02]];
  }),
  wallType('lgx-slim-led-wall-bar', '슬림 LED 벽등 (바형)', 'Slim LED wall bar', ['led bar', 'slim sconce', 'linear wall light', '슬림 벽등', '바형 벽등'], (k, c, g) => {
    k.box('body', 'metal-al-anodised-black', 0.03, 0.6, 0.03, 0, 0.3, 0.015, { r: 0.004 });
    k.box('glow', g, 0.02, 0.58, 0.002, 0, 0.3, 0.031, { r: 0 });
    return [[0, 0.3, 0.08]];
  }),
  wallType('lgx-swing-reading-wall', '침대 헤드 리딩 벽등', 'Bedside reading wall light', ['reading light', 'bedside wall lamp', '독서등', '침대 벽등', '헤드 조명'], (k, c, g) => {
    k.box('plate', 'metal-pc-black-matte', 0.06, 0.1, 0.02, 0, 0.05, 0.01, { r: 0.008, ...c });
    k.tube('arm', 'metal-pc-black-matte', [[0, 0.05, 0.02], [0, 0.12, 0.12], [0, 0.18, 0.22]], 0.006, { ...c });
    k.cyl('head', 'metal-pc-black-matte', 0.025, 0.03, 0.06, 0, 0.12, 0.24, { rx: 0.4, segs: 14, ...c });
    k.cyl('lens', g, 0.022, 0.022, 0.002, 0, 0.12, 0.24, { segs: 10 });
    return [[0, 0.11, 0.25]];
  }, { elevation: 1.0, spot: true }),
];

/* ============================================================ floor / table */

const arcLed = lg({
  id: 'lgx-arc-led-floor-lamp', ko: '아치형 LED 장스탠드', en: 'Arc LED floor lamp',
  params: [P.len('reach', '팔 길이', 'Reach', 1.5, 0.9, 2.0), P.mat('base', '받침', 'Base', 'stone-marble-carrara', 'stone'), TEMP],
  tags: ['arc floor lamp', 'led floor lamp', 'reading', '아치 스탠드', '장스탠드', '거실 스탠드'],
  build: (p, ctx) => {
    const k = new Kit(ctx), R = p.reach;
    k.box('base', p.base, 0.3, 0.06, 0.2, 0, 0.03, 0, { r: 0.01 });
    const pts = [];
    for (let i = 0; i <= 20; i++) { const t = i / 20; pts.push([R * (1 - Math.cos(t * PI / 2)), 0.06 + 1.9 * Math.sin(t * PI / 2), 0]); }
    k.tube('arc', 'metal-ss-satin', pts, 0.012);
    const end = pts[pts.length - 1];
    k.cyl('head', 'metal-ss-satin', 0.04, 0.12, 0.08, end[0], end[1] - 0.08, 0, { open: true, segs: k.seg(24, 8) });
    k.cyl('lens', glowMat(p.temp), 0.11, 0.11, 0.002, end[0], end[1] - 0.078, 0, { segs: 20 });
    k.light(end[0], end[1] - 0.1, 0, { intensity: 0.9, distance: 5, type: 'spot', angle: 0.7, color: tone(p.temp) });
    return finish(k);
  },
});

const tubeFloor = lg({
  id: 'lgx-led-tube-floor-lamp', ko: 'LED 튜브 스탠드 (코너)', en: 'LED tube corner floor lamp',
  params: [P.len('height', '높이', 'Height', 1.4, 1.0, 1.8), P.color('glow', '빛 색', 'Light colour', '#fff1dc')],
  tags: ['led tube lamp', 'corner lamp', 'rgb floor lamp', 'LED 튜브', '코너 조명', '무드 스탠드'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height;
    k.cyl('base', 'metal-pc-black-matte', 0.1, 0.1, 0.02, 0, 0, 0, { segs: k.seg(20, 8) });
    k.cyl('tube', 'light-neutral', 0.015, 0.015, h, 0, 0.02, 0, { segs: 12, ...C(p.glow) });
    k.light(0, h * 0.6, 0, { intensity: 0.6, distance: 4, color: p.glow });
    return finish(k);
  },
});

const mushroomFloor = lg({
  id: 'lgx-mushroom-floor-lamp', ko: '버섯형 플로어 스탠드', en: 'Mushroom floor lamp',
  params: [P.len('height', '높이', 'Height', 1.3, 0.9, 1.6), P.color('shade', '갓 색', 'Shade colour', '#e8c9a0'), TEMP],
  tags: ['mushroom lamp', 'floor lamp', 'retro', '버섯 스탠드', '플로어 스탠드', '레트로 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height;
    k.cyl('base', 'metal-pc-black-matte', 0.16, 0.17, 0.03, 0, 0, 0, { segs: k.seg(24, 8) });
    k.cyl('stem', 'metal-pc-black-matte', 0.012, 0.012, h - 0.25, 0, 0.03, 0, { segs: 8 });
    k.sphere('shade', 'plastic-acrylic-opal', 0.25, 0, h - 0.22, 0, { thetaLength: PI / 2, segs: k.seg(28, 10), rings: k.seg(10, 4), scale: [1, 0.85, 1], ...C(p.shade) });
    k.cyl('glow', glowMat(p.temp), 0.2, 0.2, 0.002, 0, h - 0.222, 0, { segs: 20 });
    k.light(0, h - 0.25, 0, { intensity: 0.8, distance: 5, color: tone(p.temp) });
    return finish(k);
  },
});

const cordless = lg({
  id: 'lgx-portable-cordless-table-lamp', placement: 'surface', ko: '무선 충전식 테이블 램프', en: 'Portable cordless table lamp',
  params: [P.len('height', '높이', 'Height', 0.3, 0.2, 0.4), P.color('body', '몸체 색', 'Body colour', '#c9a77c'), TEMP],
  tags: ['cordless lamp', 'portable lamp', 'rechargeable', '무선 램프', '충전식 조명', '테이블 램프'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height;
    k.cyl('base', 'metal-al-anodised-gold', 0.05, 0.06, 0.02, 0, 0, 0, { segs: k.seg(20, 8), ...C(p.body) });
    k.cyl('stem', 'metal-al-anodised-gold', 0.008, 0.008, h - 0.08, 0, 0.02, 0, { segs: 8, ...C(p.body) });
    k.sphere('shade', 'metal-al-anodised-gold', 0.08, 0, h - 0.06, 0, { thetaLength: PI / 2, segs: k.seg(24, 8), rings: k.seg(8, 4), scale: [1, 0.7, 1], ...C(p.body) });
    k.cyl('glow', glowMat(p.temp), 0.07, 0.07, 0.002, 0, h - 0.062, 0, { segs: 16 });
    k.light(0, h - 0.08, 0, { intensity: 0.25, distance: 2.5, color: tone(p.temp) });
    return finish(k);
  },
});

const cube = lg({
  id: 'lgx-glow-cube-lamp', placement: 'surface', ko: '터치 큐브 무드등', en: 'Touch glow cube lamp',
  params: [P.len('size', '크기', 'Size', 0.12, 0.08, 0.4), P.color('glow', '빛 색', 'Light colour', '#ffd9a8')],
  tags: ['cube lamp', 'mood light', 'night light', '큐브 조명', '무드등', '수면등'],
  build: (p, ctx) => {
    const k = new Kit(ctx), s = p.size;
    k.box('cube', 'light-warm', s, s, s, 0, s / 2, 0, { r: s * 0.08, ...C(p.glow) });
    k.light(0, s / 2, 0, { intensity: 0.2 * (s / 0.12), distance: 2, color: p.glow });
    return finish(k);
  },
});

const gooseBedside = lg({
  id: 'lgx-gooseneck-bedside-lamp', placement: 'surface', ko: '자바라 침대 스탠드', en: 'Gooseneck bedside lamp',
  params: [P.len('neck', '목 길이', 'Neck length', 0.35, 0.2, 0.5), P.color('body', '몸체 색', 'Body colour', '#2b2b2b'), TEMP],
  tags: ['gooseneck lamp', 'bedside lamp', 'reading lamp', '자바라 스탠드', '침대 스탠드', '독서등'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.neck;
    k.cyl('base', 'metal-pc-black-matte', 0.07, 0.075, 0.02, 0, 0, 0, { segs: k.seg(20, 8), ...C(p.body) });
    k.tube('neck', 'metal-pc-black-matte', [[0, 0.02, 0], [0, L * 0.6, -0.02], [0, L * 0.95, 0.06], [0, L * 0.9, 0.14]], 0.006, { ...C(p.body) });
    k.cyl('head', 'metal-pc-black-matte', 0.02, 0.035, 0.07, 0, L * 0.85, 0.15, { rx: 0.5, segs: 14, ...C(p.body) });
    k.cyl('lens', glowMat(p.temp), 0.032, 0.032, 0.002, 0, L * 0.85, 0.15, { segs: 12 });
    k.light(0, L * 0.82, 0.16, { intensity: 0.35, distance: 3, type: 'spot', angle: 0.5, color: tone(p.temp) });
    return finish(k);
  },
});

/* ============================================================ strips and bars */

const cove = lg({
  id: 'lgx-cove-led-strip', placement: 'wall', elevation: 2.3, ko: '우물 천장 간접 LED 바', en: 'Cove LED strip in pocket',
  params: [P.len('length', '길이', 'Length', 2.0, 0.5, 4.0), P.color('glow', '빛 색', 'Light colour', '#ffe3bf')],
  tags: ['cove lighting', 'indirect light', 'led strip', '간접 조명', '우물 천장', 'LED 바'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length;
    k.box('pocket', 'paint-white-matte', L, 0.1, 0.12, 0, 0.05, 0.06, { r: 0 });
    k.box('strip', 'light-warm', L - 0.02, 0.01, 0.012, 0, 0.105, 0.03, { r: 0, ...C(p.glow) });
    const n = Math.max(1, Math.round(L / 1.2));
    for (let i = 0; i < n; i++) k.light(-L / 2 + (i + 0.5) * (L / n), 0.13, 0.05, { intensity: 0.4 * L / n, distance: 3, color: p.glow });
    return finish(k);
  },
});

const shelfBar = lg({
  id: 'lgx-under-shelf-light-bar', placement: 'surface', ko: '선반 하부 LED 바 (센서)', en: 'Under-shelf LED bar with sensor',
  params: [P.len('length', '길이', 'Length', 0.6, 0.3, 1.2), TEMP],
  tags: ['under shelf light', 'cabinet light', 'motion sensor', '선반 조명', '하부장 조명', '센서등'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length;
    k.box('body', 'metal-al-anodised-clear', L, 0.012, 0.025, 0, 0.006, 0, { r: 0.002 });
    k.box('lens', glowMat(p.temp), L - 0.02, 0.002, 0.018, 0, 0.0, 0, { r: 0 });
    k.box('sensor', 'plastic-abs-matte-black', 0.012, 0.004, 0.012, L / 2 - 0.02, 0.0, 0, { r: 0 });
    k.light(0, -0.01, 0, { intensity: 0.3 * L, distance: 2, type: 'spot', angle: 1.0, color: tone(p.temp) });
    return finish(k);
  },
});

const stair = lg({
  id: 'lgx-stair-recessed-light', placement: 'wall', elevation: 0.25, ko: '계단 벽 매입등 (사각)', en: 'Recessed stair light',
  params: [P.pick('shape', '모양', 'Shape', 'square', [['square', '사각', 'Square'], ['round', '원형', 'Round'], ['slot', '슬롯', 'Slot']]), TEMP],
  tags: ['stair light', 'step light', 'foot light', '계단등', '발밑 조명', '벽 매입등'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    if (p.shape === 'round') { k.cyl('plate', 'metal-pc-black-matte', 0.04, 0.04, 0.006, 0, 0.04, 0.003, { rx: PI / 2, segs: 16 }); k.box('lens', glowMat(p.temp), 0.04, 0.008, 0.002, 0, 0.025, 0.007, { r: 0 }); }
    else if (p.shape === 'slot') { k.box('plate', 'metal-pc-black-matte', 0.14, 0.04, 0.006, 0, 0.02, 0.003, { r: 0.002 }); k.box('lens', glowMat(p.temp), 0.12, 0.008, 0.002, 0, 0.012, 0.007, { r: 0 }); }
    else { k.box('plate', 'metal-pc-black-matte', 0.08, 0.08, 0.006, 0, 0.04, 0.003, { r: 0.004 }); k.box('lens', glowMat(p.temp), 0.06, 0.012, 0.002, 0, 0.02, 0.007, { r: 0 }); }
    k.light(0, 0.0, 0.05, { intensity: 0.08, distance: 1.5, type: 'spot', angle: 0.9, color: tone(p.temp) });
    return finish(k);
  },
});

const mirrorRing = lg({
  id: 'lgx-backlit-round-mirror', placement: 'wall', elevation: 1.2, ko: '간접 조명 원형 거울', en: 'Backlit round mirror light',
  params: [P.len('diameter', '지름', 'Diameter', 0.7, 0.4, 1.0), TEMP],
  tags: ['backlit mirror', 'led mirror', 'bathroom mirror light', 'LED 거울', '간접 조명 거울', '욕실 거울'],
  build: (p, ctx) => {
    const k = new Kit(ctx), R = p.diameter / 2;
    k.cyl('back', 'plastic-abs-matte-white', R * 0.9, R * 0.9, 0.03, 0, R, 0, { rx: PI / 2, segs: k.seg(40, 12) });
    k.add('glow', glowMat(p.temp), T(new THREE.TorusGeometry(R * 0.9, 0.006, 4, k.seg(40, 12)), 0, R, 0.01));
    k.cyl('mirror', 'plastic-acrylic-mirror-silver', R, R, 0.006, 0, R, 0.03, { rx: PI / 2, segs: k.seg(40, 12) });
    k.light(0, R, 0.1, { intensity: 0.4, distance: 2.5, color: tone(p.temp) });
    return finish(k);
  },
});

const emergency = lg({
  id: 'lgx-emergency-bulkhead', placement: 'wall', elevation: 2.2, ko: '비상 조명등 (충전식)', en: 'Emergency light (maintained)',
  params: [P.bool('test', '시험 점등', 'Test lit', false)],
  tags: ['emergency light', 'maintained light', 'battery backup', '비상 조명', '비상등', '정전 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('body', 'plastic-abs-matte-white', 0.3, 0.1, 0.06, 0, 0.05, 0.03, { r: 0.012 });
    k.box('lens', p.test ? 'light-cool' : 'plastic-acrylic-opal', 0.24, 0.04, 0.004, 0, 0.03, 0.062, { r: 0.004 });
    k.box('leds', 'led-green', 0.006, 0.006, 0.002, 0.12, 0.08, 0.061, { r: 0 });
    k.light(0, 0.0, 0.1, { intensity: p.test ? 0.8 : 0.0, distance: 6, type: 'spot', angle: 1.0, color: COOL });
    return finish(k);
  },
});

const fanLight = lg({
  id: 'lgx-dc-ceiling-fan-light', placement: 'ceiling', elevation: 2.7 - 0.45, ko: 'DC 실링팬 조명 (3날개)', en: 'DC ceiling fan with LED light',
  params: [P.len('span', '날개 지름', 'Blade span', 1.3, 0.9, 1.6), P.mat('blades', '날개', 'Blades', 'wood-am-walnut-oil', 'wood'), TEMP],
  tags: ['ceiling fan', 'fan light', 'dc fan', '실링팬', '천장 선풍기', '팬 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx), R = p.span / 2;
    k.cyl('rod', 'metal-pc-black-matte', 0.012, 0.012, 0.3, 0, 0.15, 0, { segs: 8 });
    k.cyl('canopy', 'metal-pc-black-matte', 0.07, 0.07, 0.05, 0, 0.42, 0, { segs: 16 });
    k.cyl('motor', 'metal-pc-black-matte', 0.12, 0.12, 0.1, 0, 0.06, 0, { segs: k.seg(24, 8) });
    for (let i = 0; i < 3; i++) { const a = (i / 3) * PI * 2; k.box('blades', p.blades, R - 0.1, 0.008, 0.14, Math.cos(a) * (R / 2 + 0.05), 0.1, Math.sin(a) * (R / 2 + 0.05), { r: 0.003, ry: -a, rx: 0.12 }); }
    k.cyl('glow', glowMat(p.temp), 0.1, 0.1, 0.004, 0, 0.058, 0, { segs: 20 });
    k.light(0, 0.0, 0, { intensity: 1.2, distance: 5, color: tone(p.temp) });
    return finish(k);
  },
});

export const ITEMS = [
  gimbal, trimless, pinhole, wallWasher, multiHead, antiGlare, ...panels, skyPanel,
  recessedProfile, upDown, ringPendant, rectFrame, grazer, highBayRound, vaporProof, canopy, parCan, galleryRail,
  ...pendants, rodCluster, beamPendant, ...ceilings, ...walls,
  arcLed, tubeFloor, mushroomFloor, cordless, cube, gooseBedside, cove, shelfBar, stair, mirrorRing, emergency, fanLight,
];
