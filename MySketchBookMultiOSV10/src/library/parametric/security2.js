// Security (보안) category, part 2: CCTV (analog and IP: vandal dome, mini dome, long-range IR bullet,
// varifocal, thermal, LPR on a pole, multi-sensor panoramic, PTZ on a pole, explosion-proof, solar 4G,
// elevator corner, pinhole, wireless battery, floodlight camera, wiper housing, camera poles and brackets,
// body-worn camera dock, IR illuminator), recording and monitoring (DVR, rack NVR, CCTV monitors and walls,
// guard desk, joystick keyboard, public-view monitor), intrusion alarm (PIR, contacts, glass break, beam
// sensors, siren, keypad, panic button, alarm panel), perimeter (bollards, road blocker, barrier arm, tyre
// spikes, crash gate, razor-wire fence, guard booth) and screening (walk-through metal detector, X-ray
// scanner, wand table, trays) plus guard tour points, radio chargers, key system, safes and signs.
// Units metres, Y up, front +Z, origin bottom centre (finish() centres every build).
import { THREE, Kit, P, T, frameShape } from './helpers.js';
import { finish } from './kitchen.js';
import { C } from './accessories-plus.js';
import { keys } from './office-props.js';
import { sec, ipCam } from './security-moved.js';

const PI = Math.PI;
const BODY = (def = '#f2f2f2') => P.color('body', '몸체 색', 'Body colour', def);
const SCREEN = (def = true) => P.bool('screen', '화면 켜짐', 'Screen on', def);
const CCTV = ['cctv', 'security camera', 'surveillance', 'CCTV', '보안 카메라', '감시 카메라'];

/** Bullet camera body along +Z from (0, y, 0): radius r, length L, with sun shield and lens. */
function bullet(k, r, L, y, body, { tilt = 0.25, ir = true, shield = true } = {}) {
  const dy = -Math.sin(tilt), dz = Math.cos(tilt);
  k.cyl('housing', 'plastic-abs-gloss-white', r, r, L, 0, y, 0, { rx: PI / 2 - tilt, segs: k.seg(18, 8), ...C(body) });
  if (shield) k.box('housing', 'plastic-abs-gloss-white', r * 2.4, 0.006, L * 1.1, 0, y + r + 0.004 + dy * L / 2, dz * L / 2, { r: 0.003, rx: -tilt, ...C(body) });
  k.cyl('lens', 'glass-tint-smoke-dark', r * 0.85, r * 0.85, 0.004, 0, y + dy * L, dz * L, { rx: PI / 2 - tilt, segs: k.seg(16, 8) });
  if (ir) k.add('ir', 'led-red', T(new THREE.TorusGeometry(r * 0.6, 0.002, 4, 16), 0, y + dy * (L + 0.003), dz * (L + 0.003), -tilt, 0, 0));
}
/** Wall bracket arm from the wall (z = 0) to (0, y, z1). */
function bracket(k, y, z1, body) {
  k.box('mount', 'plastic-abs-gloss-white', 0.09, 0.09, 0.015, 0, y, 0.0075, { r: 0.008, ...C(body) });
  k.rod('mount', 'plastic-abs-gloss-white', [0, y, 0.015], [0, y + 0.01, z1], 0.015, { segs: 10, ...C(body) });
}
/** Pole with base plate; returns the top. */
function pole(k, H, mat = 'metal-pc-anthracite') {
  k.box('base', mat, 0.3, 0.02, 0.3, 0, 0.01, 0, { r: 0.004 });
  k.cyl('pole', mat, 0.05, 0.06, H, 0, 0.02, 0, { segs: k.seg(14, 6) });
  return H + 0.02;
}

/* ============================================================ CCTV */

const vandalDome = sec({
  id: 'sec-cctv-vandal-dome', placement: 'ceiling', elevation: 2.3, ko: 'CCTV 돔 카메라 (방폭·반달형)', en: 'Vandal-proof dome camera',
  params: [BODY('#e8e8e8'), P.len('diameter', '지름', 'Diameter', 0.15, 0.1, 0.2)],
  tags: [...CCTV, 'vandal dome', 'ik10', '돔 카메라', '파손 방지'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = p.diameter / 2;
    k.cyl('housing', 'metal-al-anodised-clear', r, r * 1.05, 0.04, 0, 0, 0, { segs: k.seg(24, 8), ...C(p.body) });
    k.sphere('dome', 'glass-tint-smoke-dark', r * 0.8, 0, 0, 0, { rx: PI, thetaLength: PI / 2, segs: k.seg(24, 8), rings: k.seg(8, 4) });
    return finish(k);
  },
});

const miniDome = sec({
  id: 'sec-cctv-mini-dome', placement: 'ceiling', elevation: 2.35, ko: 'CCTV 미니 돔 (실내)', en: 'Indoor mini dome camera',
  params: [BODY()],
  tags: [...CCTV, 'mini dome', 'indoor camera', '미니 돔', '실내 CCTV'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.cyl('housing', 'plastic-abs-gloss-white', 0.045, 0.05, 0.02, 0, 0, 0, { segs: k.seg(20, 8), ...C(p.body) });
    k.sphere('dome', 'glass-tint-smoke-dark', 0.035, 0, 0, 0, { rx: PI, thetaLength: PI / 2, segs: k.seg(20, 8), rings: k.seg(6, 3) });
    return finish(k);
  },
});

const BULLETS = [
  ['long-range', 'CCTV 장거리 적외선 불릿', 'Long-range IR bullet camera', 0.045, 0.32, ['long range', 'ir bullet', '장거리 카메라', '적외선 카메라']],
  ['varifocal', 'CCTV 가변 초점 불릿 (전동 줌)', 'Motorised varifocal bullet camera', 0.04, 0.26, ['varifocal', 'motorized zoom', '가변 초점', '전동 줌']],
  ['analog', '아날로그 CCTV 카메라 (HD)', 'Analog HD bullet camera', 0.032, 0.18, ['analog camera', 'hd-tvi', 'ahd', '아날로그 CCTV', 'AHD']],
  ['thermal', '열화상 카메라 (보안용)', 'Thermal security camera', 0.05, 0.28, ['thermal camera', 'heat detection', '열화상', '열감지 카메라']],
];

const bullets = BULLETS.map(([kind, ko, en, r, L, tags]) => sec({
  id: `sec-cctv-bullet-${kind}`, placement: 'wall', elevation: 2.3, ko, en,
  params: [BODY(kind === 'thermal' ? '#d8d4cc' : '#f2f2f2'), P.num('tilt', '아래 각도', 'Tilt', 0.3, 0, 0.8, 0.01)],
  tags: [...CCTV, ...tags],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    bracket(k, 0.06, 0.08, p.body);
    k.box('housing', 'plastic-abs-gloss-white', r * 1.4, r * 1.2, 0.04, 0, 0.08, 0.09, { r: 0.006, ...C(p.body) });
    const g = new Kit(ctx);
    bullet(g, r, L, 0, p.body, { tilt: p.tilt, ir: kind !== 'thermal' });
    for (const part of g.parts.values()) for (const geo of part.geos) k.add(part.role, part.mat, geo.translate(0, 0.08 + r, 0.1), { overrides: part.overrides, uv: 'keep' });
    if (kind === 'thermal') k.box('lens', 'plastic-abs-matte-black', r * 0.9, r * 0.9, 0.01, 0, 0.08 + r - Math.sin(p.tilt) * L, 0.1 + Math.cos(p.tilt) * L, { r: 0.004, rx: -p.tilt });
    return finish(k);
  },
}));

const lprPole = sec({
  id: 'sec-cctv-lpr-pole', placement: 'floor', ko: '차량 번호 인식 카메라 (LPR, 기둥)', en: 'Licence plate recognition camera on pole',
  params: [P.len('height', '높이', 'Height', 2.5, 1.5, 4.0), P.bool('flash', '보조 조명', 'IR flash', true)],
  tags: [...CCTV, 'lpr', 'anpr', 'licence plate', '차량 번호 인식', 'LPR', '주차장 카메라'],
  build: (p, ctx) => {
    const k = new Kit(ctx), top = pole(k, p.height - 0.2);
    k.box('housing', 'metal-pc-light-grey', 0.14, 0.12, 0.34, 0, top, 0.12, { r: 0.012 });
    k.cyl('lens', 'glass-tint-smoke-dark', 0.04, 0.04, 0.004, 0, top, 0.29, { rx: PI / 2, segs: 14 });
    if (p.flash) { k.box('flash', 'metal-pc-light-grey', 0.14, 0.08, 0.06, 0, top - 0.12, 0.2, { r: 0.008 }); k.box('ir', 'led-red', 0.11, 0.05, 0.002, 0, top - 0.12, 0.231, { r: 0 }); }
    return finish(k);
  },
});

const multiSensor = sec({
  id: 'sec-cctv-multisensor-panoramic', placement: 'wall', elevation: 2.3, ko: '다중 렌즈 파노라마 카메라 (4렌즈)', en: 'Multi-sensor panoramic camera (4 lenses)',
  params: [BODY(), P.int('lenses', '렌즈 수', 'Lenses', 4, 2, 4)],
  tags: [...CCTV, 'multi sensor', 'panoramic', '180 degree', '다중 렌즈', '파노라마 카메라', '광역 감시'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    bracket(k, 0.1, 0.18, p.body);
    k.cyl('housing', 'plastic-abs-gloss-white', 0.14, 0.15, 0.08, 0, 0.0, 0.3, { segs: k.seg(24, 8), ...C(p.body) });
    for (let i = 0; i < p.lenses; i++) { const a = -PI / 2 + ((i + 0.5) / p.lenses) * PI; k.cyl('lens', 'glass-tint-smoke-dark', 0.018, 0.018, 0.01, Math.sin(a) * 0.14, 0.03, 0.3 + Math.cos(a) * 0.14, { rx: PI / 2, ry: a, segs: 12 }); }
    return finish(k);
  },
});

const ptzPole = sec({
  id: 'sec-cctv-ptz-speed-dome-pole', placement: 'floor', ko: 'PTZ 스피드 돔 (가로등형 폴)', en: 'PTZ speed dome on pole',
  params: [P.len('height', '높이', 'Height', 5.0, 3.0, 8.0), BODY()],
  tags: [...CCTV, 'ptz', 'speed dome', 'pole camera', 'PTZ', '스피드 돔', '방범 CCTV'],
  build: (p, ctx) => {
    const k = new Kit(ctx), top = pole(k, p.height - 0.1);
    k.rod('arm', 'metal-pc-anthracite', [0, top - 0.1, 0], [0, top, 0.6], 0.03, { segs: 10 });
    k.cyl('housing', 'plastic-abs-gloss-white', 0.1, 0.1, 0.1, 0, top - 0.12, 0.62, { segs: k.seg(20, 8), ...C(p.body) });
    k.sphere('dome', 'glass-tint-smoke-dark', 0.09, 0, top - 0.12, 0.62, { rx: PI, thetaLength: PI / 2, segs: k.seg(20, 8), rings: k.seg(6, 3) });
    k.box('box', 'metal-pc-light-grey', 0.3, 0.45, 0.15, 0, 1.2, 0.13, { r: 0.006 });
    k.box('signs', 'plastic-abs-gloss-yellow', 0.3, 0.2, 0.004, 0, 2.0, 0.065, { r: 0.002 });
    return finish(k);
  },
});

const explosion = sec({
  id: 'sec-cctv-explosion-proof', placement: 'wall', elevation: 2.3, ko: '방폭 카메라 (스테인리스)', en: 'Explosion-proof stainless camera',
  params: [P.len('length', '길이', 'Length', 0.38, 0.3, 0.5)],
  tags: [...CCTV, 'explosion proof', 'atex', 'hazardous area', '방폭 카메라', '위험 지역', '플랜트'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length;
    k.box('mount', 'metal-ss-satin', 0.12, 0.12, 0.02, 0, 0.06, 0.01, { r: 0.004 });
    k.rod('mount', 'metal-ss-satin', [0, 0.06, 0.02], [0, 0.11, 0.1], 0.02, { segs: 10 });
    k.cyl('housing', 'metal-ss-brushed', 0.07, 0.07, L, 0, 0.16, 0.08, { rx: PI / 2, segs: k.seg(20, 8) });
    for (const z of [0.1, 0.08 + L - 0.02]) k.cyl('flanges', 'metal-ss-brushed', 0.085, 0.085, 0.02, 0, 0.16, z, { rx: PI / 2, segs: k.seg(20, 8) });
    k.cyl('lens', 'glass-clear-thick', 0.055, 0.055, 0.004, 0, 0.16, 0.08 + L + 0.001, { rx: PI / 2, segs: 16 });
    return finish(k);
  },
});

const solar4g = sec({
  id: 'sec-cctv-solar-4g-pole', placement: 'floor', ko: '태양광 LTE 카메라 (공사현장·주차장)', en: 'Solar 4G camera on pole',
  params: [P.len('height', '높이', 'Height', 3.5, 2.0, 5.0), P.num('panelTilt', '패널 각도', 'Panel tilt', 0.6, 0.2, 1.0, 0.01)],
  tags: [...CCTV, 'solar camera', '4g lte', 'off grid', '태양광 CCTV', 'LTE 카메라', '공사 현장'],
  build: (p, ctx) => {
    const k = new Kit(ctx), top = pole(k, p.height - 0.2);
    k.box('panel', 'glass-tint-smoke-dark', 0.8, 0.02, 0.55, 0, top + 0.15, -0.1, { r: 0.004, rx: -p.panelTilt });
    k.box('panel', 'metal-al-anodised-clear', 0.82, 0.03, 0.57, 0, top + 0.13, -0.1, { r: 0.004, rx: -p.panelTilt });
    k.box('battery', 'metal-pc-light-grey', 0.3, 0.4, 0.15, 0, top - 0.6, 0.12, { r: 0.006 });
    const g = new Kit(ctx);
    bullet(g, 0.04, 0.24, 0, '#f2f2f2', { tilt: 0.35 });
    for (const part of g.parts.values()) for (const geo of part.geos) k.add(part.role, part.mat, geo.translate(0, top - 0.15, 0.1), { overrides: part.overrides, uv: 'keep' });
    k.rod('antenna', 'plastic-abs-matte-black', [0.15, top - 0.4, 0.2], [0.15, top - 0.15, 0.2], 0.008, { segs: 6 });
    return finish(k);
  },
});

const elevator = sec({
  id: 'sec-cctv-elevator-corner', placement: 'ceiling', elevation: 2.3, ko: '엘리베이터 코너 카메라', en: 'Elevator corner camera',
  params: [P.mat('plate', '판', 'Plate', 'metal-ss-hairline', 'metal')],
  tags: [...CCTV, 'elevator camera', 'corner mount', '엘리베이터 카메라', '코너형 카메라', '승강기 CCTV'],
  build: (p, ctx) => {
    const k = new Kit(ctx), s = 0.14;
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(s, 0), new THREE.Vector2(0, s)]);
    k.slab('plate', p.plate, shape, 0.06, 0, { bevel: 0.003 });
    k.cyl('lens', 'glass-tint-smoke-dark', 0.006, 0.006, 0.004, s * 0.25, 0.0, s * 0.25, { segs: 10 });
    return finish(k);
  },
});

const pinhole = sec({
  id: 'sec-cctv-pinhole-atm', placement: 'wall', elevation: 1.5, ko: '핀홀 카메라 (ATM·카운터)', en: 'Pinhole camera (ATM / counter)',
  params: [P.mat('plate', '판', 'Plate', 'metal-ss-satin', 'metal')],
  tags: [...CCTV, 'pinhole', 'covert camera', 'atm camera', '핀홀 카메라', 'ATM 카메라', '카운터 카메라'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('plate', p.plate, 0.05, 0.05, 0.008, 0, 0.025, 0.004, { r: 0.004 });
    k.cyl('lens', 'glass-tint-smoke-dark', 0.002, 0.002, 0.002, 0, 0.025, 0.008, { rx: PI / 2, segs: 8 });
    return finish(k);
  },
});

const battery = sec({
  id: 'sec-wireless-battery-camera', placement: 'wall', elevation: 2.2, ko: '무선 배터리 카메라 (와이파이)', en: 'Wireless battery camera',
  params: [BODY(), P.bool('solar', '태양광 패널', 'Solar panel', false)],
  tags: [...CCTV, 'wireless camera', 'battery camera', 'wifi', '무선 카메라', '배터리 카메라', '와이파이 CCTV'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.cyl('mount', 'plastic-abs-gloss-white', 0.03, 0.03, 0.012, 0, 0.05, 0.0, { rx: PI / 2, segs: 12, ...C(p.body) });
    k.rod('mount', 'plastic-abs-gloss-white', [0, 0.05, 0.012], [0, 0.05, 0.05], 0.008, { segs: 8, ...C(p.body) });
    k.box('housing', 'plastic-abs-gloss-white', 0.07, 0.06, 0.1, 0, 0.05, 0.1, { r: 0.025, ...C(p.body) });
    k.box('face', 'plastic-abs-gloss-black', 0.06, 0.05, 0.003, 0, 0.05, 0.15, { r: 0.02 });
    k.cyl('lens', 'glass-tint-smoke-dark', 0.01, 0.01, 0.003, 0, 0.055, 0.151, { rx: PI / 2, segs: 12 });
    if (p.solar) k.box('solar', 'glass-tint-smoke-dark', 0.12, 0.006, 0.08, 0, 0.13, 0.06, { r: 0.004, rx: -0.4 });
    return finish(k);
  },
});

const floodCam = sec({
  id: 'sec-floodlight-camera', placement: 'wall', elevation: 2.3, ko: '투광등 일체형 카메라', en: 'Floodlight camera',
  params: [BODY(), P.bool('on', '조명 켜짐', 'Lights on', false)],
  tags: [...CCTV, 'floodlight camera', 'motion light', '투광등 카메라', '센서등 카메라', '야외 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('plate', 'plastic-abs-gloss-white', 0.12, 0.12, 0.03, 0, 0.06, 0.015, { r: 0.012, ...C(p.body) });
    for (const sx of [-1, 1]) { k.box('lamps', 'plastic-abs-gloss-white', 0.14, 0.09, 0.05, sx * 0.12, 0.09, 0.06, { r: 0.02, ry: sx * 0.4, ...C(p.body) }); k.box('lenses', p.on ? 'light-cool' : 'plastic-acrylic-opal', 0.12, 0.07, 0.003, sx * 0.13, 0.09, 0.087, { r: 0.012, ry: sx * 0.4 }); }
    k.box('housing', 'plastic-abs-gloss-white', 0.05, 0.05, 0.07, 0, 0.0, 0.06, { r: 0.015, ...C(p.body) });
    k.cyl('lens', 'glass-tint-smoke-dark', 0.01, 0.01, 0.003, 0, 0.0, 0.096, { rx: PI / 2, segs: 12 });
    k.light(0, 0.08, 0.15, { color: '#f4f8ff', intensity: p.on ? 1.2 : 0, distance: 8, type: 'spot', angle: 0.7 });
    return finish(k);
  },
});

const wiperHousing = sec({
  id: 'sec-cctv-housing-wiper', placement: 'wall', elevation: 2.3, ko: '와이퍼 하우징 카메라', en: 'Camera housing with wiper',
  params: [P.len('length', '길이', 'Length', 0.45, 0.35, 0.55)],
  tags: [...CCTV, 'outdoor housing', 'wiper', 'heater', '하우징 카메라', '와이퍼', '야외 하우징'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length;
    bracket(k, 0.08, 0.12, '#e8e8e8');
    k.box('housing', 'metal-pc-light-grey', 0.13, 0.12, L, 0, 0.17, 0.12 + L / 2, { r: 0.012 });
    k.box('housing', 'metal-pc-light-grey', 0.16, 0.008, L + 0.05, 0, 0.235, 0.14 + L / 2, { r: 0.003 });
    k.box('glass', 'glass-clear', 0.1, 0.09, 0.004, 0, 0.17, 0.12 + L + 0.001, { r: 0.004 });
    k.box('wiper', 'rubber-black', 0.005, 0.09, 0.006, 0.02, 0.17, 0.12 + L + 0.005, { r: 0.002, rz: 0.4 });
    return finish(k);
  },
});

const camPole = sec({
  id: 'sec-cctv-pole-dual', placement: 'floor', ko: '방범 CCTV 폴 (카메라 2대, 비상벨)', en: 'Crime-prevention CCTV pole with emergency bell',
  params: [P.len('height', '높이', 'Height', 4.5, 3.0, 6.0), P.bool('bell', '비상벨', 'Emergency bell', true)],
  tags: [...CCTV, 'cctv pole', 'emergency bell', 'crime prevention', '방범 CCTV', '비상벨', '안심 폴'],
  build: (p, ctx) => {
    const k = new Kit(ctx), top = pole(k, p.height, 'metal-pc-yellow');
    for (const s of [-1, 1]) {
      k.rod('arm', 'metal-pc-yellow', [0, top - 0.2, 0], [s * 0.35, top - 0.1, 0.1], 0.025, { segs: 8 });
      const g = new Kit(ctx);
      bullet(g, 0.04, 0.24, 0, '#f2f2f2', { tilt: 0.4 });
      for (const part of g.parts.values()) for (const geo of part.geos) k.add(part.role, part.mat, geo.rotateY(s * 0.4).translate(s * 0.35, top - 0.15, 0.1), { overrides: part.overrides, uv: 'keep' });
    }
    k.cyl('beacon', 'plastic-acrylic-red', 0.06, 0.06, 0.1, 0, top, 0, { segs: 12 });
    if (p.bell) { k.box('bell', 'metal-pc-yellow', 0.3, 0.45, 0.12, 0, 1.3, 0.1, { r: 0.012 }); k.cyl('button', 'plastic-abs-gloss-red', 0.04, 0.04, 0.02, 0, 1.3, 0.16, { rx: PI / 2, segs: 14 }); k.box('signs', 'paper', 0.24, 0.08, 0.002, 0, 1.45, 0.161, { r: 0 }); }
    return finish(k);
  },
});

const bodyCam = sec({
  id: 'sec-body-camera-dock', ko: '바디캠 충전 거치대 (8구)', en: 'Body-worn camera charging dock',
  params: [P.int('cams', '카메라 수', 'Cameras', 6, 0, 8)],
  tags: ['body camera', 'bodycam', 'docking station', '바디캠', '웨어러블 카메라', '충전 거치대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('dock', 'plastic-abs-matte-black', 0.42, 0.05, 0.12, 0, 0.025, 0, { r: 0.01 });
    for (let i = 0; i < 8; i++) {
      const x = -0.175 + i * 0.05;
      k.box('leds', i < p.cams ? 'led-green' : 'plastic-abs-matte-grey', 0.006, 0.004, 0.002, x, 0.02, 0.061, { r: 0 });
      if (i < p.cams) { k.box('cams', 'plastic-abs-matte-black', 0.045, 0.085, 0.025, x, 0.09, 0, { r: 0.008 }); k.cyl('lens', 'glass-tint-smoke-dark', 0.008, 0.008, 0.002, x, 0.11, 0.013, { rx: PI / 2, segs: 10 }); }
    }
    return finish(k);
  },
});

const irLamp = sec({
  id: 'sec-ir-illuminator', placement: 'wall', elevation: 2.3, ko: '적외선 투광기 (야간 감시)', en: 'Infrared illuminator',
  params: [P.int('leds', 'LED 수', 'LEDs', 12, 6, 30)],
  tags: ['ir illuminator', 'infrared light', 'night vision', '적외선 투광기', 'IR 조명', '야간 감시'],
  build: (p, ctx) => {
    const k = new Kit(ctx), cols = Math.ceil(Math.sqrt(p.leds)), rows = Math.ceil(p.leds / cols);
    bracket(k, 0.06, 0.06, '#2b2b2b');
    k.box('housing', 'metal-pc-black-matte', cols * 0.025 + 0.03, rows * 0.025 + 0.03, 0.08, 0, 0.12, 0.1, { r: 0.008 });
    for (let i = 0; i < p.leds; i++) k.cyl('leds', 'led-red', 0.007, 0.007, 0.004, -(cols - 1) * 0.0125 + (i % cols) * 0.025, 0.12 - (rows - 1) * 0.0125 + Math.floor(i / cols) * 0.025, 0.14, { rx: PI / 2, segs: 8 });
    return finish(k);
  },
});

/* ============================================================ recording and monitoring */

const dvr = sec({
  id: 'sec-dvr-16ch', ko: 'DVR 녹화기 (16채널)', en: 'DVR recorder (16 channels)',
  params: [P.int('drives', '하드 수', 'Hard drives', 2, 1, 4)],
  tags: ['dvr', 'cctv recorder', 'digital video recorder', 'DVR', '녹화기', 'CCTV 녹화'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.38, h = 0.055;
    k.box('body', 'metal-pc-black-matte', w, h, 0.3, 0, h / 2, 0, { r: 0.004 });
    for (let i = 0; i < 3; i++) k.box('leds', i ? 'led-blue' : 'led-green', 0.004, 0.004, 0.002, -w / 2 + 0.03 + i * 0.012, h / 2, 0.151, { r: 0 });
    for (let i = 0; i < p.drives; i++) k.box('drives', 'plastic-abs-matte-grey', 0.02, 0.003, 0.002, w * 0.2 + i * 0.025, h / 2, 0.151, { r: 0 });
    return finish(k);
  },
});

const nvrRack = sec({
  id: 'sec-nvr-rack-4u', ko: '랙형 NVR (4U, 64채널)', en: 'Rack NVR (4U, 64 channels)',
  params: [P.int('bays', '디스크 베이', 'Drive bays', 16, 8, 24)],
  tags: ['nvr', 'rack nvr', 'video storage', '랙형 NVR', '영상 저장', '64채널'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.44, h = 0.176, d = 0.55;
    k.box('body', 'metal-pc-black-matte', w, h, d, 0, h / 2, 0, { r: 0.004 });
    for (const s of [-1, 1]) k.box('body', 'metal-pc-black-matte', 0.022, h, 0.004, s * (w / 2 + 0.011), h / 2, d / 2, { r: 0 });
    const cols = Math.ceil(p.bays / 4);
    for (let i = 0; i < p.bays; i++) k.box('bays', 'plastic-abs-matte-grey', (w - 0.06) / cols - 0.004, 0.036, 0.004, -w / 2 + 0.03 + ((i % cols) + 0.5) * ((w - 0.06) / cols), 0.025 + Math.floor(i / cols) * 0.04, d / 2 + 0.002, { r: 0.002 });
    return finish(k);
  },
});

const cctvMonitor = sec({
  id: 'sec-cctv-monitor-wall-arm', placement: 'wall', elevation: 1.9, ko: 'CCTV 모니터 (벽 거치, 분할 화면)', en: 'Wall-arm CCTV monitor (split view)',
  params: [P.len('size', '폭', 'Width', 0.6, 0.4, 0.9), SCREEN(), P.pick('split', '분할', 'Split', '4', [['1', '1화면', 'Single'], ['4', '4분할', '4-way'], ['9', '9분할', '9-way'], ['16', '16분할', '16-way']])],
  tags: ['cctv monitor', 'security monitor', 'split screen', 'CCTV 모니터', '분할 화면', '감시 모니터'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.size, h = w * 0.5625, n = Math.round(Math.sqrt(Number(p.split)));
    k.box('mount', 'metal-pc-black-matte', 0.1, 0.1, 0.02, 0, 0, 0.01, { r: 0.004 });
    k.rod('mount', 'metal-pc-black-matte', [0, 0, 0.02], [0, -0.02, 0.25], 0.015, { segs: 8 });
    k.box('monitor', 'plastic-abs-matte-black', w + 0.02, h + 0.02, 0.04, 0, -0.04, 0.28, { r: 0.004, rx: 0.25 });
    k.box('screen', p.screen ? 'screen-on-dark' : 'screen-matte-off', w, h, 0.002, 0, -0.04 + Math.sin(0.25) * 0.021, 0.28 + Math.cos(0.25) * 0.021, { r: 0, rx: 0.25 });
    if (p.screen && n > 1) for (let i = 1; i < n; i++) {
      k.box('grid', 'paper-black', 0.003, h, 0.001, -w / 2 + (i / n) * w, -0.04 + Math.sin(0.25) * 0.023, 0.28 + Math.cos(0.25) * 0.023, { r: 0, rx: 0.25 });
      k.box('grid', 'paper-black', w, 0.003, 0.001, 0, -0.04 - h / 2 + (i / n) * h * Math.cos(0.25) + Math.sin(0.25) * 0.023, 0.28 + Math.cos(0.25) * 0.023 + (h / 2 - (i / n) * h) * Math.sin(0.25), { r: 0, rx: 0.25 });
    }
    return finish(k);
  },
});

const cctvWall = sec({
  id: 'sec-cctv-video-wall-stand', placement: 'floor', ko: 'CCTV 상황판 (스탠드형 모니터 월)', en: 'Freestanding CCTV video wall',
  params: [P.int('cols', '열', 'Columns', 3, 2, 4), P.int('rows', '행', 'Rows', 2, 1, 3), SCREEN()],
  tags: ['cctv video wall', 'control room', 'monitor wall', 'CCTV 상황판', '모니터 월', '관제'],
  build: (p, ctx) => {
    const k = new Kit(ctx), sw = 0.7, sh = 0.4, base = 0.7;
    for (let c = 0; c < p.cols; c++) for (let r = 0; r < p.rows; r++) {
      const x = (c - (p.cols - 1) / 2) * (sw + 0.006), y = base + r * (sh + 0.006) + sh / 2;
      k.box('bezels', 'plastic-abs-matte-black', sw, sh, 0.05, x, y, 0, { r: 0.002 });
      k.box('screens', p.screen ? 'screen-on-dark' : 'screen-matte-off', sw - 0.01, sh - 0.01, 0.002, x, y, 0.026, { r: 0 });
    }
    const W = p.cols * sw;
    for (const s of [-1, 1]) { k.box('stand', 'metal-pc-black-matte', 0.06, base + p.rows * sh, 0.06, s * W * 0.35, (base + p.rows * sh) / 2, -0.06, { r: 0.004 }); k.box('stand', 'metal-pc-black-matte', 0.08, 0.04, 0.6, s * W * 0.35, 0.02, -0.06, { r: 0.004 }); }
    return finish(k);
  },
});

const guardDesk = sec({
  id: 'sec-security-guard-desk', placement: 'floor', ko: '경비 데스크 (CCTV 모니터 3대)', en: 'Security guard desk with CCTV monitors',
  params: [P.len('width', '폭', 'Width', 1.8, 1.4, 2.4), SCREEN(), P.color('front', '전면 색', 'Front colour', '#2f3a52')],
  tags: ['security desk', 'guard desk', 'lobby security', '경비 데스크', '보안 데스크', '안내 데스크'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, D = 0.75;
    k.box('front', 'plastic-hpl-anthracite', W, 1.1, 0.04, 0, 0.55, D / 2, { r: 0.006, ...C(p.front) });
    k.box('ledge', 'stone-quartz-white-sparkle', W + 0.04, 0.03, 0.25, 0, 1.115, D / 2 - 0.06, { r: 0.004 });
    k.box('top', 'plastic-hpl-white', W, 0.03, D - 0.05, 0, 0.74, -0.03, { r: 0.004 });
    for (const s of [-1, 1]) k.box('sides', 'plastic-hpl-anthracite', 0.04, 0.74, D, s * (W / 2 - 0.02), 0.37, 0, { r: 0.004, ...C(p.front) });
    for (let i = -1; i <= 1; i++) {
      k.box('monitors', 'plastic-abs-matte-black', 0.5, 0.3, 0.03, i * 0.52, 0.98, -0.25, { r: 0.004, ry: -i * 0.25 });
      k.box('screens', p.screen ? 'screen-on-dark' : 'screen-matte-off', 0.48, 0.28, 0.002, i * 0.52 + Math.sin(-i * 0.25) * 0.016, 0.98, -0.234, { r: 0, ry: -i * 0.25 });
    }
    k.box('keyboard', 'plastic-abs-matte-black', 0.3, 0.02, 0.12, -0.25, 0.765, 0.05, { r: 0.004 });
    k.box('joystick', 'plastic-abs-matte-black', 0.3, 0.04, 0.15, 0.25, 0.775, 0.05, { r: 0.01 });
    return finish(k);
  },
});

const joystick = sec({
  id: 'sec-ptz-joystick-keyboard', ko: 'PTZ 조이스틱 컨트롤러', en: 'PTZ joystick keyboard controller',
  params: [SCREEN()],
  tags: ['joystick keyboard', 'ptz controller', 'cctv control', '조이스틱 컨트롤러', 'PTZ 제어', 'CCTV 제어'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('body', 'plastic-abs-matte-black', 0.36, 0.05, 0.18, 0, 0.025, 0, { r: 0.012, rx: -0.05 });
    k.box('display', p.screen ? 'screen-on-dark' : 'screen-matte-off', 0.1, 0.002, 0.04, -0.1, 0.051, -0.05, { r: 0 });
    keys(k, 'keys', 'plastic-abs-matte-grey', 4, 4, -0.08, 0.048, 0.02, 0.022, 0.016);
    k.cyl('stick', 'plastic-abs-matte-black', 0.03, 0.035, 0.015, 0.11, 0.05, 0.0, { segs: 14 });
    k.cyl('stick', 'rubber-black', 0.012, 0.01, 0.09, 0.11, 0.065, 0.0, { segs: 10 });
    k.sphere('stick', 'plastic-abs-gloss-red', 0.016, 0.11, 0.16, 0, { segs: 10, rings: 8 });
    return finish(k);
  },
});

const pvm = sec({
  id: 'sec-public-view-monitor', placement: 'floor', ko: '공공 감시 모니터 (매장 입구)', en: 'Public-view monitor (store entrance)',
  params: [P.len('height', '높이', 'Height', 1.7, 1.4, 2.0), SCREEN()],
  tags: ['public view monitor', 'pvm', 'store entrance', '공공 감시 모니터', '매장 CCTV', '입구 모니터'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height;
    k.box('base', 'metal-pc-black-matte', 0.4, 0.02, 0.35, 0, 0.01, 0, { r: 0.006 });
    k.box('post', 'metal-pc-black-matte', 0.08, H - 0.4, 0.05, 0, (H - 0.4) / 2 + 0.02, -0.04, { r: 0.006 });
    k.box('monitor', 'plastic-abs-matte-black', 0.42, 0.7, 0.06, 0, H - 0.35, 0, { r: 0.006 });
    k.box('screen', p.screen ? 'screen-on-nature' : 'screen-matte-off', 0.38, 0.6, 0.002, 0, H - 0.33, 0.031, { r: 0 });
    k.cyl('lens', 'glass-tint-smoke-dark', 0.008, 0.008, 0.004, 0, H - 0.015, 0.031, { rx: PI / 2, segs: 10 });
    k.box('label', 'plastic-abs-gloss-red', 0.3, 0.035, 0.002, 0, H - 0.67, 0.031, { r: 0.002 });
    return finish(k);
  },
});

/* ============================================================ intrusion alarm */

const pir = sec({
  id: 'sec-pir-motion-detector', placement: 'wall', elevation: 2.3, ko: '적외선 동작 감지기 (PIR)', en: 'PIR motion detector',
  params: [BODY(), P.bool('corner', '코너 거치', 'Corner bracket', false)],
  tags: ['motion detector', 'pir sensor', 'intrusion', '동작 감지기', '적외선 감지기', '침입 감지'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    if (p.corner) k.box('bracket', 'plastic-abs-gloss-white', 0.07, 0.07, 0.07, 0, 0.035, 0.035, { r: 0.004, ry: PI / 4, ...C(p.body) });
    k.box('body', 'plastic-abs-gloss-white', 0.065, 0.1, 0.045, 0, 0.05, p.corner ? 0.09 : 0.0225, { r: 0.012, rx: 0.15, ...C(p.body) });
    k.box('lens', 'plastic-acrylic-opal', 0.05, 0.045, 0.004, 0, 0.065, (p.corner ? 0.09 : 0.0225) + 0.024, { r: 0.01, rx: 0.15 });
    k.box('leds', 'led-red', 0.004, 0.004, 0.002, 0.02, 0.025, (p.corner ? 0.09 : 0.0225) + 0.024, { r: 0 });
    return finish(k);
  },
});

const contact = sec({
  id: 'sec-door-window-contact', placement: 'wall', elevation: 2.0, ko: '문·창 열림 감지기 (마그네트)', en: 'Door / window magnetic contact',
  params: [P.num('gap', '열림 간격', 'Opening gap', 0, 0, 0.05, 0.005), BODY()],
  tags: ['door contact', 'magnetic sensor', 'reed switch', '열림 감지기', '마그네트 센서', '문 감지'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('sensor', 'plastic-abs-gloss-white', 0.02, 0.07, 0.015, -0.015, 0.035, 0.0075, { r: 0.004, ...C(p.body) });
    k.box('magnet', 'plastic-abs-gloss-white', 0.012, 0.05, 0.012, 0.01 + p.gap, 0.035, 0.006, { r: 0.003, ...C(p.body) });
    return finish(k);
  },
});

const glassBreak = sec({
  id: 'sec-glass-break-detector', placement: 'wall', elevation: 2.2, ko: '유리 파손 감지기', en: 'Glass-break detector',
  params: [BODY()],
  tags: ['glass break', 'acoustic detector', 'window alarm', '유리 파손 감지기', '창 감지', '침입 감지'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.cyl('body', 'plastic-abs-gloss-white', 0.045, 0.045, 0.025, 0, 0.045, 0, { rx: PI / 2, segs: k.seg(20, 8), ...C(p.body) });
    k.cyl('grille', 'metal-pc-white-perforated', 0.02, 0.02, 0.002, 0, 0.045, 0.025, { rx: PI / 2, segs: 14 });
    return finish(k);
  },
});

const beam = sec({
  id: 'sec-photoelectric-beam-pair', placement: 'floor', ko: '적외선 감지기 (투광·수광 기둥 한 쌍)', en: 'Photoelectric beam towers (pair)',
  params: [P.len('span', '감지 거리', 'Span', 6, 2, 10), P.len('height', '기둥 높이', 'Tower height', 1.2, 0.6, 2.0), P.bool('beams', '광선 보기', 'Show beams', false)],
  tags: ['beam sensor', 'perimeter detection', 'photoelectric', '적외선 감지기', '투광기', '외곽 경비'],
  build: (p, ctx) => {
    const k = new Kit(ctx), S = p.span, H = p.height;
    for (const x of [-S / 2, S / 2]) { k.box('towers', 'plastic-abs-matte-black', 0.12, H, 0.12, x, H / 2, 0, { r: 0.02 }); k.box('caps', 'metal-pc-anthracite', 0.14, 0.03, 0.14, x, H + 0.015, 0, { r: 0.006 }); }
    if (p.beams) for (const y of [H * 0.3, H * 0.6, H * 0.85]) k.box('beams', 'led-red', S - 0.12, 0.003, 0.003, 0, y, 0, { r: 0 });
    return finish(k);
  },
});

const siren = sec({
  id: 'sec-outdoor-siren-strobe', placement: 'wall', elevation: 2.3, ko: '외부 경보 사이렌 (경광등 일체)', en: 'Outdoor alarm siren with strobe',
  params: [P.color('body', '몸체 색', 'Body colour', '#f2f2f2'), P.color('lens', '경광 색', 'Strobe colour', '#2a7de1')],
  tags: ['alarm siren', 'bell box', 'strobe', '경보 사이렌', '경광등', '방범 사이렌'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('body', 'plastic-abs-gloss-white', 0.22, 0.3, 0.08, 0, 0.15, 0.04, { r: 0.04, ...C(p.body) });
    k.box('strobe', 'plastic-acrylic-blue', 0.16, 0.06, 0.03, 0, 0.26, 0.085, { r: 0.015, ...C(p.lens) });
    k.box('label', 'paper', 0.12, 0.05, 0.002, 0, 0.1, 0.081, { r: 0 });
    return finish(k);
  },
});

const alarmKeypad = sec({
  id: 'sec-alarm-keypad', placement: 'wall', elevation: 1.4, ko: '방범 경보 키패드 (무인 경비)', en: 'Intruder alarm keypad',
  params: [SCREEN(), BODY()],
  tags: ['alarm keypad', 'security system', 'arm disarm', '방범 키패드', '무인 경비', '경보 해제'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('body', 'plastic-abs-gloss-white', 0.14, 0.11, 0.025, 0, 0.055, 0.0125, { r: 0.01, ...C(p.body) });
    k.box('display', p.screen ? 'screen-on-white' : 'screen-matte-off', 0.1, 0.025, 0.002, 0, 0.09, 0.026, { r: 0.002 });
    keys(k, 'keys', 'plastic-abs-matte-grey', 4, 3, 0, 0.04, 0.025, 0.026, 0.018, { top: false });
    k.box('leds', 'led-green', 0.004, 0.004, 0.002, -0.06, 0.09, 0.026, { r: 0 });
    return finish(k);
  },
});

const panic = sec({
  id: 'sec-panic-button-under-desk', ko: '비상 호출 버튼 (책상 하부)', en: 'Under-desk panic button',
  params: [P.color('button', '버튼 색', 'Button colour', '#d9342b')],
  tags: ['panic button', 'duress alarm', 'hold-up button', '비상 호출', '비상 버튼', '긴급 신고'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('body', 'plastic-abs-matte-grey', 0.07, 0.03, 0.07, 0, 0.015, 0, { r: 0.006 });
    k.cyl('button', 'plastic-abs-gloss-red', 0.018, 0.018, 0.012, 0, 0.03, 0, { segs: 14, ...C(p.button) });
    return finish(k);
  },
});

const alarmPanel = sec({
  id: 'sec-intruder-alarm-control-panel', placement: 'wall', elevation: 1.6, ko: '방범 경보 제어반', en: 'Intruder alarm control panel',
  params: [P.bool('open', '문 열림', 'Door open', false)],
  tags: ['alarm panel', 'control box', 'intruder alarm', '경보 제어반', '방범 제어반', '무인 경비 본체'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.3, h = 0.35, d = 0.09;
    k.box('box', 'metal-pc-light-grey', w, h, d, 0, h / 2, d / 2, { r: 0.004 });
    if (p.open) { k.box('board', 'plastic-abs-gloss-green', w - 0.06, h - 0.12, 0.004, 0, h * 0.6, d - 0.02, { r: 0, ...C('#1f6b3a') }); k.box('battery', 'plastic-abs-matte-black', 0.15, 0.06, 0.06, 0, 0.05, d / 2, { r: 0.004 }); k.box('door', 'metal-pc-light-grey', 0.01, h, w, -w / 2 - 0.005, h / 2, d + w / 2, { r: 0.002 }); }
    else { k.box('door', 'metal-pc-light-grey', w, h, 0.01, 0, h / 2, d + 0.005, { r: 0.002 }); k.box('lock', 'metal-chrome', 0.015, 0.025, 0.006, w / 2 - 0.03, h / 2, d + 0.012, { r: 0.002 }); }
    return finish(k);
  },
});

/* ============================================================ perimeter */

const bollard = sec({
  id: 'sec-security-bollard-row', placement: 'floor', ko: '차량 진입 방지 볼라드 (줄)', en: 'Security bollard row',
  params: [P.int('count', '개수', 'Count', 4, 1, 6), P.len('pitch', '간격', 'Spacing', 1.4, 1.0, 2.0), P.pick('kind', '종류', 'Type', 'fixed', [['fixed', '고정형', 'Fixed'], ['retractable', '승하강형', 'Retractable'], ['steel', '스테인리스', 'Stainless']])],
  tags: ['bollard', 'vehicle barrier', 'hostile vehicle', '볼라드', '차량 진입 방지', '자동 볼라드'],
  build: (p, ctx) => {
    const k = new Kit(ctx), mat = p.kind === 'steel' ? 'metal-ss-brushed' : 'metal-pc-anthracite';
    for (let i = 0; i < p.count; i++) {
      const x = (i - (p.count - 1) / 2) * p.pitch, up = p.kind === 'retractable' && i % 2 ? 0.2 : 0.9;
      k.cyl('bollards', mat, 0.11, 0.11, up, x, 0, 0, { segs: k.seg(20, 8) });
      k.cyl('bands', 'plastic-abs-gloss-yellow', 0.112, 0.112, 0.05, x, up - 0.12, 0, { segs: k.seg(20, 8) });
      if (p.kind === 'retractable') { k.cyl('collars', 'metal-ss-brushed', 0.16, 0.16, 0.01, x, 0, 0, { segs: k.seg(20, 8) }); k.add('leds', 'led-red', T(new THREE.TorusGeometry(0.111, 0.004, 4, 16), x, up - 0.02, 0, PI / 2)); }
    }
    return finish(k);
  },
});

const roadBlocker = sec({
  id: 'sec-hydraulic-road-blocker', placement: 'floor', ko: '유압식 로드 블로커', en: 'Hydraulic road blocker',
  params: [P.len('width', '폭', 'Width', 3.0, 2.0, 4.0), P.num('raise', '올림', 'Raised', 1, 0, 1, 0.05)],
  tags: ['road blocker', 'wedge barrier', 'anti ram', '로드 블로커', '차량 차단', '유압 차단기'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, a = 0.5 * p.raise;
    k.box('frame', 'metal-steel-galvanised', W + 0.2, 0.02, 1.5, 0, 0.01, 0, { r: 0.004 });
    k.box('plate', 'metal-steel-tread', W, 0.08, 1.2, 0, 0.04 + Math.sin(a) * 0.6, 0.6 - Math.cos(a) * 0.6, { r: 0.004, rx: -a });
    for (let i = 0; i < 6; i++) k.box('stripes', i % 2 ? 'plastic-abs-gloss-yellow' : 'paint-black-matte', W / 6, 0.005, 0.12, -W / 2 + (i + 0.5) * W / 6, 0.083 + Math.sin(a) * 1.15, 0.6 - Math.cos(a) * 1.15 + 0.06, { r: 0, rx: -a });
    return finish(k);
  },
});

const barrierArm = sec({
  id: 'sec-parking-barrier-gate', placement: 'floor', ko: '주차 차단기 (바 게이트)', en: 'Parking barrier gate arm',
  params: [P.len('arm', '바 길이', 'Arm length', 4.0, 2.5, 6.0), P.num('open', '열림', 'Raised', 0, 0, 1, 0.05)],
  tags: ['barrier gate', 'boom gate', 'parking', '주차 차단기', '차단봉', '바 게이트'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.arm, a = p.open * PI / 2;
    k.box('cabinet', 'metal-pc-orange', 0.35, 1.0, 0.3, 0, 0.5, 0, { r: 0.02, ...C('#e86a1c') });
    k.box('cap', 'metal-pc-anthracite', 0.37, 0.04, 0.32, 0, 1.02, 0, { r: 0.006 });
    const cx = 0.2 + Math.cos(a) * L / 2, cy = 0.9 + Math.sin(a) * L / 2;
    k.box('arm', 'metal-al-anodised-clear', L, 0.08, 0.04, cx, cy, 0.17, { r: 0.02, rz: a });
    for (let i = 0; i < Math.floor(L / 0.5); i++) { const t = 0.25 + i * 0.5; k.box('stripes', 'plastic-abs-gloss-red', 0.2, 0.082, 0.042, 0.2 + Math.cos(a) * t, 0.9 + Math.sin(a) * t, 0.17, { r: 0.006, rz: a }); }
    return finish(k);
  },
});

const spikes = sec({
  id: 'sec-tyre-killer-spikes', placement: 'floor', ko: '일방통행 타이어 펑크기 (스파이크)', en: 'One-way tyre spikes',
  params: [P.len('width', '폭', 'Width', 3.0, 1.5, 5.0), P.bool('sign', '경고 표지', 'Warning sign', true)],
  tags: ['tyre spikes', 'one way traffic', 'tire killer', '타이어 펑크기', '스파이크', '역주행 방지'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width;
    k.box('base', 'plastic-abs-gloss-yellow', W, 0.05, 0.4, 0, 0.025, 0, { r: 0.01 });
    const n = Math.round(W / 0.15);
    for (let i = 0; i < n; i++) k.cyl('spikes', 'metal-steel-raw', 0.0, 0.025, 0.06, -W / 2 + (i + 0.5) * (W / n), 0.05, 0, { rz: -0.5, segs: 4 });
    if (p.sign) { k.cyl('post', 'metal-steel-galvanised', 0.025, 0.025, 1.8, W / 2 + 0.3, 0, 0, { segs: 8 }); k.box('signs', 'plastic-abs-gloss-red', 0.5, 0.5, 0.01, W / 2 + 0.3, 1.6, 0.03, { r: 0.004, rz: PI / 4 }); }
    return finish(k);
  },
});

const crashGate = sec({
  id: 'sec-sliding-security-gate', placement: 'floor', ko: '보안 슬라이딩 대문 (자동)', en: 'Automatic sliding security gate',
  params: [P.len('width', '폭', 'Width', 4.0, 3.0, 6.0), P.len('height', '높이', 'Height', 2.0, 1.5, 2.6), P.num('open', '열림', 'Open', 0, 0, 1, 0.05)],
  tags: ['sliding gate', 'security gate', 'automatic gate', '슬라이딩 대문', '자동 대문', '정문'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = p.height, off = -p.open * W * 0.9;
    k.box('rail', 'metal-steel-galvanised', W * 1.9, 0.04, 0.08, -W * 0.45, 0.02, 0, { r: 0.002 });
    k.panel('gate', 'metal-pc-anthracite', frameShape(W, H, 0.06), 0.06, off, H / 2 + 0.06, 0);
    const n = Math.round(W / 0.12);
    for (let i = 1; i < n; i++) k.box('bars', 'metal-pc-anthracite', 0.025, H - 0.12, 0.025, off - W / 2 + i * (W / n), H / 2 + 0.06, 0, { r: 0 });
    k.box('motor', 'metal-pc-light-grey', 0.3, 0.35, 0.25, W / 2 + 0.25, 0.175, -0.2, { r: 0.02 });
    k.box('post', 'metal-pc-anthracite', 0.15, H + 0.1, 0.15, W / 2 + 0.1, (H + 0.1) / 2, 0, { r: 0.004 });
    k.cyl('beacon', 'plastic-acrylic-amber', 0.05, 0.05, 0.08, W / 2 + 0.1, H + 0.1, 0, { segs: 12 });
    return finish(k);
  },
});

const razorFence = sec({
  id: 'sec-razor-wire-fence', placement: 'floor', ko: '보안 펜스 (철조망 상단)', en: 'Security fence with razor wire',
  params: [P.len('length', '길이', 'Length', 3.0, 1.5, 6.0), P.len('height', '높이', 'Height', 2.4, 1.8, 3.0)],
  tags: ['security fence', 'razor wire', 'perimeter fence', '보안 펜스', '철조망', '외곽 울타리'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, H = p.height;
    for (const x of [-L / 2, L / 2]) { k.box('posts', 'metal-pc-forest', 0.06, H, 0.06, x, H / 2, 0, { r: 0.004 }); k.rod('posts', 'metal-pc-forest', [x, H, 0], [x, H + 0.4, -0.25], 0.02, { segs: 6 }); }
    k.box('mesh', 'metal-expanded-steel', L, H - 0.1, 0.01, 0, H / 2, 0, { r: 0 });
    const pts = [];
    for (let i = 0; i <= 80; i++) { const t = i / 80, a = t * PI * 2 * 14; pts.push([-L / 2 + t * L, H + 0.25 + Math.sin(a) * 0.18, -0.15 + Math.cos(a) * 0.18]); }
    k.tube('wire', 'metal-steel-galvanised', pts, 0.004, { segs: k.seg(400, 160), radial: 4 });
    return finish(k);
  },
});

const guardBooth = sec({
  id: 'sec-guard-booth', placement: 'floor', ko: '경비 초소 (정문 경비실)', en: 'Gatehouse guard booth',
  params: [P.len('width', '폭', 'Width', 1.8, 1.2, 2.5), P.len('depth', '깊이', 'Depth', 1.5, 1.2, 2.5), P.color('body', '외벽 색', 'Body colour', '#e8e6df')],
  tags: ['guard booth', 'gatehouse', 'security kiosk', '경비 초소', '경비실', '정문 초소'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, D = p.depth, H = 2.4;
    k.box('base', 'concrete-grc-charcoal', W + 0.1, 0.1, D + 0.1, 0, 0.05, 0, { r: 0.004 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('posts', 'metal-pc-light-grey', 0.08, H, 0.08, sx * (W / 2 - 0.04), H / 2 + 0.1, sz * (D / 2 - 0.04), { r: 0.004, ...C(p.body) });
    k.box('walls', 'metal-pc-light-grey', W, 1.0, 0.05, 0, 0.6, D / 2 - 0.025, { r: 0.004, ...C(p.body) });
    k.box('walls', 'metal-pc-light-grey', W, 1.0, 0.05, 0, 0.6, -D / 2 + 0.025, { r: 0.004, ...C(p.body) });
    k.box('glass', 'glass-tint-grey', W - 0.1, H - 1.0, 0.01, 0, 1.1 + (H - 1.0) / 2, D / 2 - 0.025, { r: 0 });
    k.box('glass', 'glass-tint-grey', W - 0.1, H - 1.0, 0.01, 0, 1.1 + (H - 1.0) / 2, -D / 2 + 0.025, { r: 0 });
    k.box('glass', 'glass-tint-grey', 0.01, H - 1.0, D - 0.1, -W / 2 + 0.025, 1.1 + (H - 1.0) / 2, 0, { r: 0 });
    k.box('door', 'metal-pc-light-grey', 0.05, H - 0.05, D * 0.6, W / 2 - 0.025, H / 2 + 0.08, 0, { r: 0.004, ...C(p.body) });
    k.box('roof', 'metal-pc-anthracite', W + 0.4, 0.12, D + 0.4, 0, H + 0.16, 0, { r: 0.01 });
    k.box('lamp', 'light-panel-dim', W * 0.5, 0.01, D * 0.4, 0, H + 0.095, 0, { r: 0 });
    k.light(0, H + 0.05, 0, { color: '#ffffff', intensity: 0.4, distance: 3 });
    return finish(k);
  },
});

/* ============================================================ screening */

const metalDetector = sec({
  id: 'sec-walk-through-metal-detector', placement: 'floor', ko: '문형 금속 탐지기', en: 'Walk-through metal detector',
  params: [P.len('width', '통로 폭', 'Passage width', 0.76, 0.7, 0.9), P.bool('alarm', '경보 표시', 'Alarm lit', false)],
  tags: ['metal detector', 'walk through', 'security screening', '금속 탐지기', '문형 탐지기', '보안 검색'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = 2.2;
    for (const s of [-1, 1]) { k.box('panels', 'plastic-abs-matte-grey', 0.08, H, 0.6, s * (W / 2 + 0.04), H / 2, 0, { r: 0.01 }); k.box('zones', p.alarm ? 'led-red' : 'led-green', 0.004, H * 0.8, 0.02, s * (W / 2 + 0.001) * 1, H * 0.48, 0.25, { r: 0 }); }
    k.box('header', 'plastic-abs-matte-anthracite', W + 0.16, 0.2, 0.6, 0, H + 0.1, 0, { r: 0.01 });
    k.box('display', 'screen-on-dark', 0.25, 0.08, 0.002, 0, H + 0.1, 0.301, { r: 0.002 });
    return finish(k);
  },
});

const xray = sec({
  id: 'sec-xray-baggage-scanner', placement: 'floor', ko: 'X-ray 수하물 검색기', en: 'X-ray baggage scanner',
  params: [P.len('length', '길이', 'Length', 2.4, 1.8, 3.4), P.bool('bag', '가방', 'Bag on belt', true)],
  tags: ['x-ray scanner', 'baggage screening', 'security check', 'X-ray 검색기', '수하물 검색', '보안 검색대'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, tunnel = 1.0;
    k.box('belt', 'rubber-sheet-black', L, 0.04, 0.6, 0, 0.72, 0, { r: 0.004 });
    for (const sx of [-1, 1]) k.box('frame', 'metal-ss-brushed', 0.04, 0.7, 0.6, sx * (L / 2 - 0.1), 0.35, 0, { r: 0.004 });
    k.box('tunnel', 'metal-pc-light-grey', tunnel, 0.9, 0.85, 0, 1.0 + 0.0, 0, { r: 0.02 });
    k.box('tunnel', 'metal-pc-light-grey', tunnel + 0.1, 0.7, 0.9, 0, 0.35, 0, { r: 0.02 });
    for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) k.box('curtains', 'plastic-pvc-anthracite', 0.005, 0.4, 0.1, sx * tunnel / 2, 1.0, -0.2 + i * 0.1, { r: 0 });
    if (p.bag) k.soft('bag', 'fabric-canvas-black', 0.45, 0.25, 0.35, 0.04, -L * 0.35, 0.865, 0, { puff: 0.01 });
    k.box('console', 'plastic-abs-matte-black', 0.5, 0.35, 0.04, L / 2 - 0.2, 1.45, 0.35, { r: 0.004, rx: 0.3 });
    k.box('screen', 'screen-on-nature', 0.46, 0.3, 0.002, L / 2 - 0.2, 1.45, 0.372, { r: 0, rx: 0.3 });
    return finish(k);
  },
});

const wandTable = sec({
  id: 'sec-screening-table-wand', placement: 'floor', ko: '보안 검색 테이블 (휴대용 탐지기·바구니)', en: 'Screening table with wand and trays',
  params: [P.int('trays', '바구니 수', 'Trays', 4, 1, 8)],
  tags: ['screening table', 'hand wand', 'security trays', '검색 테이블', '휴대용 금속 탐지기', '검색 바구니'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = 1.2, D = 0.6, H = 0.85;
    k.box('top', 'metal-ss-brushed', W, 0.03, D, 0, H - 0.015, 0, { r: 0.004 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('legs', 'metal-ss-brushed', 0.02, 0.02, H - 0.03, sx * (W / 2 - 0.05), 0, sz * (D / 2 - 0.05), { segs: 8 });
    for (let i = 0; i < p.trays; i++) k.box('trays', 'plastic-pp-dusty-blue', 0.55, 0.08, 0.4, 0.25, H + 0.04 + i * 0.02, 0, { r: 0.02 });
    k.box('wand', 'plastic-abs-matte-black', 0.08, 0.03, 0.4, -0.35, H + 0.015, 0, { r: 0.012, ry: 0.3 });
    return finish(k);
  },
});

/* ============================================================ guard and storage */

const tourPoint = sec({
  id: 'sec-guard-tour-checkpoint', placement: 'wall', elevation: 1.3, ko: '순찰 체크 포인트 (NFC)', en: 'Guard tour checkpoint (NFC)',
  params: [P.color('body', '색', 'Colour', '#2a5d9f')],
  tags: ['guard tour', 'patrol checkpoint', 'nfc tag', '순찰 체크', '순찰함', '경비 순찰'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.cyl('tag', 'plastic-abs-gloss-blue', 0.025, 0.025, 0.01, 0, 0.025, 0, { rx: PI / 2, segs: 16, ...C(p.body) });
    k.box('label', 'paper', 0.08, 0.025, 0.002, 0, 0.075, 0.001, { r: 0 });
    return finish(k);
  },
});

const radioCharger = sec({
  id: 'sec-radio-multi-charger', ko: '무전기 충전기 (6구)', en: 'Two-way radio multi-charger',
  params: [P.int('radios', '무전기 수', 'Radios', 5, 0, 6)],
  tags: ['radio charger', 'walkie talkie', 'two way radio', '무전기 충전기', '워키토키', '경비 무전'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('base', 'plastic-abs-matte-black', 0.4, 0.05, 0.12, 0, 0.025, 0, { r: 0.01 });
    for (let i = 0; i < 6; i++) {
      const x = -0.165 + i * 0.066;
      k.box('leds', i < p.radios ? 'led-red' : 'led-green', 0.006, 0.004, 0.002, x, 0.03, 0.061, { r: 0 });
      if (i < p.radios) { k.box('radios', 'plastic-abs-matte-black', 0.055, 0.13, 0.035, x, 0.11, -0.01, { r: 0.008 }); k.rod('antennas', 'rubber-black', [x + 0.015, 0.175, -0.01], [x + 0.015, 0.25, -0.01], 0.005, { segs: 6 }); }
    }
    return finish(k);
  },
});

const keySystem = sec({
  id: 'sec-electronic-key-management', placement: 'wall', elevation: 1.0, ko: '전자 열쇠 관리함 (지문 인증)', en: 'Electronic key management cabinet',
  params: [P.int('keys', '열쇠 수', 'Keys', 24, 8, 48), SCREEN()],
  tags: ['key management', 'key cabinet', 'electronic key box', '열쇠 관리함', '전자 키 박스', '키 관리 시스템'],
  build: (p, ctx) => {
    const k = new Kit(ctx), cols = 8, rows = Math.ceil(p.keys / cols), w = 0.5, h = 0.25 + rows * 0.07, d = 0.15;
    k.box('box', 'metal-pc-light-grey', w, h, d, 0, h / 2, d / 2, { r: 0.006 });
    k.box('door', 'glass-tint-smoke-dark', w - 0.04, h - 0.18, 0.006, 0, (h - 0.18) / 2 + 0.02, d + 0.003, { r: 0.004 });
    for (let i = 0; i < p.keys; i++) k.box('fobs', 'plastic-abs-gloss-yellow', 0.012, 0.045, 0.006, -w / 2 + 0.05 + (i % cols) * ((w - 0.1) / (cols - 1)), 0.05 + Math.floor(i / cols) * 0.07, d - 0.02, { r: 0.002, ...C(['#f2c200', '#2a7de1', '#d9342b', '#2fb04a'][i % 4]) });
    k.box('display', p.screen ? 'screen-on-dark' : 'screen-matte-off', 0.12, 0.07, 0.002, -0.08, h - 0.08, d + 0.001, { r: 0.002 });
    k.box('sensor', 'glass-tint-smoke-dark', 0.025, 0.03, 0.006, 0.1, h - 0.08, d + 0.003, { r: 0.006 });
    return finish(k);
  },
});

const depositSafe = sec({
  id: 'sec-deposit-drop-safe', placement: 'floor', ko: '투입구 금고 (현금 보관)', en: 'Deposit drop safe',
  params: [P.len('height', '높이', 'Height', 0.9, 0.6, 1.4)],
  tags: ['deposit safe', 'drop safe', 'cash safe', '투입구 금고', '현금 금고', '매장 금고'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height, W = 0.45, D = 0.45;
    k.box('body', 'metal-pc-anthracite', W, H, D, 0, H / 2, 0, { r: 0.008 });
    k.box('drawer', 'metal-pc-black-matte', W - 0.06, 0.08, 0.02, 0, H - 0.1, D / 2 + 0.01, { r: 0.004 });
    k.box('handle', 'metal-chrome', 0.15, 0.02, 0.03, 0, H - 0.1, D / 2 + 0.03, { r: 0.006 });
    k.box('door', 'metal-pc-anthracite', W - 0.06, H - 0.25, 0.02, 0, (H - 0.25) / 2 + 0.03, D / 2 + 0.01, { r: 0.004 });
    keys(k, 'keys', 'metal-chrome', 3, 4, -0.08, H * 0.5, D / 2 + 0.02, 0.02, 0.014, { top: false });
    return finish(k);
  },
});

const evidenceLockers = sec({
  id: 'sec-smart-evidence-lockers', placement: 'floor', ko: '스마트 보관함 (보안 사물함)', en: 'Smart secure lockers',
  params: [P.int('cols', '열', 'Columns', 3, 1, 5), P.int('rows', '행', 'Rows', 5, 3, 6), SCREEN()],
  tags: ['smart locker', 'evidence locker', 'secure storage', '스마트 보관함', '보안 사물함', '물품 보관'],
  build: (p, ctx) => {
    const k = new Kit(ctx), cw = 0.38, H = 1.85, D = 0.5, ch = (H - 0.1) / p.rows, W = p.cols * cw + 0.3;
    k.box('body', 'metal-pc-light-grey', W, H, D, 0, H / 2, 0, { r: 0.004 });
    for (let c = 0; c < p.cols; c++) for (let r = 0; r < p.rows; r++) {
      const x = -W / 2 + 0.3 + (c + 0.5) * cw, y = 0.05 + (r + 0.5) * ch;
      k.box('doors', 'metal-pc-light-grey', cw - 0.01, ch - 0.01, 0.01, x, y, D / 2 + 0.005, { r: 0.002, ...C(r % 2 ? '#d0d4d8' : '#c4cad0') });
      k.box('leds', (c + r) % 3 ? 'led-green' : 'led-red', 0.006, 0.006, 0.002, x + cw * 0.35, y + ch * 0.3, D / 2 + 0.011, { r: 0 });
    }
    k.box('panel', 'metal-pc-anthracite', 0.28, H - 0.1, 0.012, -W / 2 + 0.15, H / 2, D / 2 + 0.006, { r: 0.004 });
    k.box('screen', p.screen ? 'screen-on-desktop' : 'screen-matte-off', 0.22, 0.32, 0.002, -W / 2 + 0.15, 1.3, D / 2 + 0.013, { r: 0.002 });
    return finish(k);
  },
});

const SIGNS = [
  ['cctv', 'CCTV 촬영 중 안내판', 'CCTV in operation sign', '#f2c200', ['cctv sign', 'surveillance sign', 'CCTV 안내판', '촬영 중']],
  ['restricted', '관계자 외 출입 금지 표지판', 'Authorised personnel only sign', '#d9342b', ['no entry sign', 'restricted area', '출입 금지', '관계자 외']],
  ['checkpoint', '보안 검색대 안내 표지 (스탠드)', 'Security checkpoint floor sign', '#2a5d9f', ['checkpoint sign', 'screening sign', '보안 검색', '안내 스탠드']],
];

const signs = SIGNS.map(([kind, ko, en, color, tags]) => sec({
  id: `sec-sign-${kind}`, placement: kind === 'checkpoint' ? 'floor' : 'wall', ...(kind === 'checkpoint' ? {} : { elevation: 1.7 }), ko, en,
  params: [P.len('width', '폭', 'Width', 0.4, 0.25, 0.6), P.color('band', '띠 색', 'Band colour', color)],
  tags: [...tags, 'security sign', '보안 표지'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = w * 0.7, y0 = kind === 'checkpoint' ? 1.0 : 0;
    if (kind === 'checkpoint') { k.cyl('base', 'metal-pc-black-matte', 0.18, 0.2, 0.02, 0, 0, 0, { segs: 16 }); k.cyl('post', 'metal-pc-black-matte', 0.015, 0.015, y0, 0, 0.02, 0, { segs: 8 }); }
    k.box('plate', 'plastic-acrylic-white', w, h, 0.004, 0, y0 + h / 2, 0.002, { r: 0.004 });
    k.box('band', 'plastic-acrylic-red', w, h * 0.3, 0.001, 0, y0 + h * 0.82, 0.0045, { r: 0, ...C(p.band) });
    if (kind === 'cctv') { k.box('icon', 'paper-black', w * 0.25, w * 0.12, 0.001, -w * 0.15, y0 + h * 0.45, 0.0045, { r: 0.004, rz: -0.3 }); }
    k.box('text', 'paper-black', w * 0.7, h * 0.07, 0.001, 0, y0 + h * 0.2, 0.0045, { r: 0 });
    return finish(k);
  },
}));

export const ITEMS = [
  vandalDome, miniDome, ...bullets, lprPole, multiSensor, ptzPole, explosion, solar4g, elevator, pinhole, battery, floodCam, wiperHousing, camPole, bodyCam, irLamp,
  dvr, nvrRack, cctvMonitor, cctvWall, guardDesk, joystick, pvm,
  pir, contact, glassBreak, beam, siren, alarmKeypad, panic, alarmPanel,
  bollard, roadBlocker, barrierArm, spikes, crashGate, razorFence, guardBooth,
  metalDetector, xray, wandTable,
  tourPoint, radioCharger, keySystem, depositSafe, evidenceLockers, ...signs,
];
