// Security (보안) items that first lived in the office-props category (their ids keep the ofp- prefix so saved
// projects still find them): face-recognition terminals and speed gate, the fingerprint attendance terminal,
// IP cameras and the NVR. Units metres, Y up, front +Z, origin bottom centre (finish() centres every build).
import { THREE, Kit, P, T } from './helpers.js';
import { finish } from './kitchen.js';
import { mk } from './appliances-more.js';
import { C } from './accessories-plus.js';
import { keys } from './office-props.js';

const PI = Math.PI;
/** A security entry (surface placement unless stated). */
export const sec = (def) => mk({ category: 'security', placement: 'surface', ...def });
const ofp = sec;

const fingerprint = ofp({
  id: 'ofp-fingerprint-attendance-terminal', placement: 'wall', elevation: 1.3, ko: '지문 인식 근태 단말기', en: 'Fingerprint attendance terminal',
  params: [P.bool('screen', '화면 켜짐', 'Screen on', true), P.color('body', '몸체 색', 'Body colour', '#2b2b2b')],
  tags: ['fingerprint reader', 'attendance terminal', 'biometric', 'access control', '지문 인식기', '근태 단말기', '출입 통제'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.14, h = 0.2;
    k.box('body', 'plastic-abs-gloss-black', w, h, 0.035, 0, h / 2, 0.0175, { r: 0.012, ...C(p.body) });
    k.box('display', p.screen ? 'screen-on-dark' : 'screen-matte-off', w * 0.8, h * 0.35, 0.002, 0, h * 0.72, 0.036, { r: 0.002 });
    keys(k, 'keys', 'plastic-abs-matte-grey', 3, 4, 0, h * 0.36, 0.035, 0.022, 0.016, { top: false });
    k.box('sensor', 'glass-tint-smoke-dark', 0.025, 0.03, 0.01, 0, h * 0.1, 0.04, { r: 0.004 });
    return finish(k);
  },
});

/* ============================================================ access control and IP cameras */

/** Face-recognition terminal head: tall screen with a camera bar, centred at x, bottom at y, front at z. */
function faceHead(k, x, y, z, { screen = true, color = '#1e1f22' } = {}) {
  const w = 0.13, h = 0.24;
  k.box('terminal', 'plastic-abs-gloss-black', w, h, 0.03, x, y + h / 2, z, { r: 0.012, ...C(color) });
  k.box('screen', screen ? 'screen-on-dark' : 'screen-matte-off', w - 0.016, h * 0.62, 0.002, x, y + h * 0.42, z + 0.016, { r: 0.003 });
  k.box('camera', 'glass-tint-smoke-dark', w * 0.7, 0.025, 0.004, x, y + h * 0.87, z + 0.016, { r: 0.004 });
  for (const dx of [-0.025, 0.025]) k.cyl('camera', 'glass-tint-smoke-dark', 0.006, 0.006, 0.003, x + dx, y + h * 0.87, z + 0.017, { rx: PI / 2, segs: 10 });
  k.box('leds', 'led-blue', w * 0.5, 0.003, 0.002, x, y + h * 0.95, z + 0.0165, { r: 0 });
}

const faceTerminalWall = ofp({
  id: 'ofp-face-recognition-terminal', placement: 'wall', elevation: 1.35, ko: '얼굴 인식 출입 통제 단말기 (벽부형)', en: 'Face recognition access terminal (wall)',
  params: [P.bool('screen', '화면 켜짐', 'Screen on', true), P.color('body', '몸체 색', 'Body colour', '#1e1f22'), P.bool('temp', '체온 측정', 'Temperature sensor', false)],
  tags: ['face recognition', 'access control', 'facial terminal', 'biometric', '얼굴 인식', '안면 인식', '출입 통제', '출입 단말기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('bracket', 'metal-pc-black-matte', 0.08, 0.16, 0.012, 0, 0.12, 0.006, { r: 0.002 });
    faceHead(k, 0, 0, 0.03, { screen: p.screen, color: p.body });
    if (p.temp) k.box('sensor', 'plastic-abs-gloss-black', 0.05, 0.04, 0.04, 0, 0.265, 0.035, { r: 0.008 });
    return finish(k);
  },
});

const faceTerminalStand = ofp({
  id: 'ofp-face-recognition-pedestal', placement: 'floor', ko: '얼굴 인식 출입 통제 단말기 (스탠드형)', en: 'Face recognition access terminal on pedestal',
  params: [P.len('height', '높이', 'Height', 1.2, 1.0, 1.5), P.bool('screen', '화면 켜짐', 'Screen on', true), P.mat('post', '기둥', 'Post', 'metal-ss-brushed', 'metal')],
  tags: ['face recognition', 'access control', 'pedestal terminal', 'lobby', '얼굴 인식', '안면 인식 스탠드', '출입 통제', '로비'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height;
    k.cyl('base', p.post, 0.17, 0.18, 0.02, 0, 0, 0, { segs: k.seg(28, 10) });
    k.cyl('post', p.post, 0.03, 0.03, h - 0.2, 0, 0.02, 0, { segs: k.seg(14, 6) });
    faceHead(k, 0, h - 0.2, 0.01, { screen: p.screen });
    return finish(k);
  },
});

const faceGate = ofp({
  id: 'ofp-face-recognition-speed-gate', placement: 'floor', ko: '얼굴 인식 스피드 게이트', en: 'Face recognition speed gate',
  params: [P.int('lanes', '통로 수', 'Lanes', 1, 1, 3), P.num('open', '날개 열림', 'Wings open', 0, 0, 1, 0.05), P.bool('screen', '화면 켜짐', 'Screens on', true)],
  tags: ['speed gate', 'turnstile', 'face recognition', 'entrance gate', '스피드 게이트', '출입 게이트', '얼굴 인식 게이트'],
  build: (p, ctx) => {
    const k = new Kit(ctx), lane = 0.65, cab = 0.2, L = 1.4, h = 1.0, n = p.lanes;
    for (let i = 0; i <= n; i++) {
      const x = (i - n / 2) * (lane + cab);
      k.box('cabinets', 'metal-ss-brushed', cab, h, L, x, h / 2, 0, { r: 0.02 });
      k.box('tops', 'glass-tint-smoke-dark', cab, 0.01, L - 0.1, x, h + 0.005, 0, { r: 0.003 });
      if (i < n) faceHead(k, x + cab / 2 - 0.02, h, L / 2 - 0.15, { screen: p.screen });
      for (const s of [-1, 1]) if ((i > 0 && s < 0) || (i < n && s > 0)) {
        const a = p.open * PI / 2;
        k.box('wings', 'plastic-acrylic-clear', lane / 2 - 0.02, 0.6, 0.012, x + s * (cab / 2 + Math.cos(a) * (lane / 4 - 0.01)), 0.55, Math.sin(a) * s * 0 + Math.sin(a) * (lane / 4), { r: 0.01, ry: -s * a });
      }
      k.box('leds', 'led-green', 0.006, 0.02, L * 0.6, x + (i < n ? cab / 2 + 0.001 : -cab / 2 - 0.001), h - 0.1, 0, { r: 0 });
    }
    return finish(k);
  },
});

/** IP camera bodies: bullet / dome / turret / ptz / fisheye / box / cube / doorbell. */
function ipCam(k, kind, color) {
  const body = 'plastic-abs-gloss-white', o = color ? C(color) : {};
  switch (kind) {
    case 'bullet': {
      // Looks down (the usual aim). The bezel and glass sit on the nose of the barrel.
      const tilt = 0.45, rx = PI / 2 + tilt, down = Math.sin(tilt), fwd = Math.cos(tilt);
      const cy = 0.09, cz = 0.07, L = 0.18, nose = L / 2 - 0.002;
      k.box('mount', body, 0.08, 0.08, 0.02, 0, 0.05, 0.01, { r: 0.008, ...o });
      k.rod('mount', body, [0, 0.05, 0.02], [0, cy, cz], 0.012, { segs: 10, ...o });
      k.cyl('housing', body, 0.032, 0.032, L, 0, cy, cz, { rx, segs: k.seg(20, 8), ...o });
      k.box('housing', body, 0.078, 0.008, L * 0.82, 0, cy + fwd * 0.038, cz + down * 0.038, { r: 0.003, rx: -tilt, ...o });
      k.cyl('lens', 'plastic-abs-matte-black', 0.03, 0.026, 0.014, 0, cy - down * (nose - 0.005), cz + fwd * (nose - 0.005), { rx, segs: k.seg(16, 6) });
      k.cyl('lens', 'glass-tint-smoke-dark', 0.02, 0.02, 0.005, 0, cy - down * nose, cz + fwd * nose, { rx, segs: k.seg(16, 6) });
      break;
    }
    case 'dome':
      k.cyl('housing', body, 0.07, 0.065, 0.03, 0, 0.0, 0, { segs: k.seg(24, 8), ...o });
      k.sphere('dome', 'glass-tint-smoke-dark', 0.055, 0, 0.0, 0, { rx: PI, thetaLength: PI / 2, segs: k.seg(24, 8), rings: k.seg(8, 4) });
      break;
    case 'turret': {
      // Eyeball under the base, lens on the lower front of the ball so it watches the floor.
      const tilt = 0.7, rx = PI / 2 + tilt, down = Math.sin(tilt), fwd = Math.cos(tilt), R = 0.042;
      k.cyl('housing', body, 0.055, 0.06, 0.018, 0, 0.05, 0, { segs: k.seg(24, 8), ...o });
      k.sphere('housing', body, R, 0, 0.03, 0.01, { segs: k.seg(20, 8), rings: k.seg(10, 5), ...o });
      k.cyl('lens', 'plastic-abs-matte-black', 0.02, 0.016, 0.01, 0, 0.03 - down * (R - 0.004), 0.01 + fwd * (R - 0.004), { rx, segs: 14 });
      k.cyl('lens', 'glass-tint-smoke-dark', 0.012, 0.012, 0.004, 0, 0.03 - down * R, 0.01 + fwd * R, { rx, segs: 12 });
      break;
    }
    case 'ptz':
      k.box('mount', body, 0.06, 0.18, 0.03, 0, 0.09, 0.015, { r: 0.01, ...o });
      k.rod('mount', body, [0, 0.12, 0.03], [0, 0.12, 0.17], 0.02, { segs: 10, ...o });
      k.cyl('housing', body, 0.08, 0.08, 0.06, 0, 0.12, 0.2, { segs: k.seg(24, 8), ...o });
      k.sphere('dome', 'glass-tint-smoke-dark', 0.07, 0, 0.12, 0.2, { rx: PI, thetaLength: PI / 2, segs: k.seg(24, 8), rings: k.seg(8, 4) });
      break;
    case 'fisheye':
      k.cyl('housing', body, 0.075, 0.08, 0.035, 0, 0, 0, { segs: k.seg(28, 10), ...o });
      k.sphere('dome', 'glass-tint-smoke-dark', 0.03, 0, 0.0, 0, { rx: PI, thetaLength: PI / 2, segs: k.seg(16, 6), rings: k.seg(6, 3) });
      break;
    case 'box': {
      const tilt = 0.35, rx = PI / 2 + tilt, down = Math.sin(tilt), fwd = Math.cos(tilt);
      const cy = 0.14, cz = 0.1, nose = 0.1;
      k.box('mount', body, 0.06, 0.06, 0.02, 0, 0.08, 0.01, { r: 0.006, ...o });
      k.rod('mount', body, [0, 0.08, 0.02], [0, cy, cz], 0.01, { segs: 8, ...o });
      k.box('housing', body, 0.09, 0.07, 0.18, 0, cy, cz, { r: 0.006, rx: -tilt, ...o });
      k.cyl('lens', 'plastic-abs-matte-black', 0.028, 0.024, 0.045, 0, cy - down * (nose - 0.01), cz + fwd * (nose - 0.01), { rx, segs: k.seg(16, 6) });
      k.cyl('lens', 'glass-tint-smoke-dark', 0.018, 0.018, 0.005, 0, cy - down * (nose + 0.012), cz + fwd * (nose + 0.012), { rx, segs: k.seg(16, 6) });
      break;
    }
    case 'cube':
      k.cyl('mount', body, 0.03, 0.035, 0.015, 0, 0, 0, { segs: 16, ...o });
      k.rod('mount', body, [0, 0.015, 0], [0, 0.05, 0], 0.006, { segs: 8, ...o });
      k.box('housing', body, 0.06, 0.08, 0.035, 0, 0.09, 0, { r: 0.015, ...o });
      k.box('lens', 'glass-tint-smoke-dark', 0.045, 0.045, 0.002, 0, 0.1, 0.018, { r: 0.012 });
      break;
    case 'dual': {
      const tilt = 0.5, rx = PI / 2 + tilt, down = Math.sin(tilt), fwd = Math.cos(tilt);
      const cy = 0.1, cz = 0.06, L = 0.16, nose = L / 2 - 0.002;
      k.box('mount', body, 0.1, 0.06, 0.02, 0, 0.06, 0.01, { r: 0.006, ...o });
      k.rod('mount', body, [0, 0.06, 0.02], [0, cy, cz], 0.012, { segs: 10, ...o });
      k.box('housing', body, 0.11, 0.055, L, 0, cy, cz, { r: 0.01, rx: -tilt, ...o });
      for (const x of [-0.028, 0.028]) {
        k.cyl('lens', 'plastic-abs-matte-black', 0.02, 0.016, 0.012, x, cy - down * (nose - 0.004), cz + fwd * (nose - 0.004), { rx, segs: 14 });
        k.cyl('lens', 'glass-tint-smoke-dark', 0.012, 0.012, 0.004, x, cy - down * nose, cz + fwd * nose, { rx, segs: 12 });
      }
      break;
    }
    case 'turret-wall': {
      const tilt = 0.65, rx = PI / 2 + tilt, down = Math.sin(tilt), fwd = Math.cos(tilt), R = 0.04;
      k.box('mount', body, 0.07, 0.07, 0.016, 0, 0.08, 0.008, { r: 0.008, ...o });
      k.rod('mount', body, [0, 0.08, 0.016], [0, 0.07, 0.06], 0.012, { segs: 10, ...o });
      k.sphere('housing', body, R, 0, 0.06, 0.08, { segs: k.seg(20, 8), rings: k.seg(10, 5), ...o });
      k.cyl('lens', 'plastic-abs-matte-black', 0.018, 0.014, 0.01, 0, 0.06 - down * (R - 0.004), 0.08 + fwd * (R - 0.004), { rx, segs: 14 });
      k.cyl('lens', 'glass-tint-smoke-dark', 0.011, 0.011, 0.004, 0, 0.06 - down * R, 0.08 + fwd * R, { rx, segs: 12 });
      break;
    }
    case 'doorbell':
      k.box('housing', 'plastic-abs-gloss-black', 0.045, 0.13, 0.025, 0, 0.065, 0.0125, { r: 0.012, ...o });
      k.cyl('lens', 'glass-tint-smoke-dark', 0.01, 0.01, 0.003, 0, 0.105, 0.025, { rx: PI / 2, segs: 12 });
      k.cyl('button', 'plastic-abs-matte-grey', 0.014, 0.014, 0.004, 0, 0.035, 0.025, { rx: PI / 2, segs: 14 });
      k.add('leds', 'led-blue', T(new THREE.TorusGeometry(0.015, 0.0015, 6, 16), 0, 0.035, 0.027));
      break;
  }
}

const IPCAMS = [
  ['bullet', 'wall', 2.3, 'IP 카메라 (불릿형)', 'IP camera (bullet)', ['bullet camera', 'outdoor camera', '불릿 카메라', '실외 카메라']],
  ['dome', 'ceiling', 2.6, 'IP 카메라 (돔형, 천장)', 'IP camera (dome, ceiling)', ['dome camera', 'ceiling camera', '돔 카메라', '천장 카메라']],
  ['turret', 'ceiling', 2.6, 'IP 카메라 (터렛형)', 'IP camera (turret)', ['turret camera', 'eyeball camera', '터렛 카메라', '아이볼 카메라']],
  ['ptz', 'wall', 2.1, 'IP 카메라 (PTZ, 벽부형)', 'IP camera (PTZ, wall arm)', ['ptz camera', 'pan tilt zoom', 'PTZ 카메라', '회전형 카메라']],
  ['fisheye', 'ceiling', 2.6, 'IP 카메라 (360° 어안)', 'IP camera (360° fisheye)', ['fisheye camera', '360 camera', 'panoramic', '어안 카메라', '360도 카메라']],
  ['box', 'wall', 2.2, 'IP 카메라 (박스형)', 'IP camera (box)', ['box camera', 'zoom lens camera', '박스 카메라', '렌즈 교환형']],
  ['cube', 'surface', 0, '실내용 IP 카메라 (탁상형)', 'Indoor desk IP camera', ['indoor camera', 'wifi camera', 'home cam', '실내 카메라', '와이파이 카메라', '홈캠']],
  ['doorbell', 'wall', 1.3, '비디오 도어벨 (IP)', 'IP video doorbell', ['video doorbell', 'door camera', 'intercom', '비디오 도어벨', '도어 카메라', '인터폰']],
  ['dual', 'wall', 2.35, 'IP 카메라 (듀얼 렌즈)', 'IP camera (dual lens)', ['dual lens', 'two lens camera', '듀얼 렌즈', '2렌즈 카메라']],
  ['turret-wall', 'wall', 2.4, 'IP 카메라 (벽부 터렛)', 'IP camera (wall turret)', ['wall turret', 'eyeball', '벽부 터렛', '아이볼']],
];

const ipCams = IPCAMS.map(([kind, placement, elevation, ko, en, tags]) => ofp({
  id: `ofp-ip-camera-${kind}`, placement, ...(placement === 'surface' ? {} : { elevation: placement === 'ceiling' ? elevation - 0.15 : elevation }), ko, en,
  params: [P.color('body', '몸체 색', 'Body colour', kind === 'doorbell' ? '#1e1f22' : '#f2f2f2'), P.bool('ir', '적외선 LED', 'IR LEDs', true)],
  tags: [...tags, 'ip camera', 'cctv', 'security camera', 'IP 카메라', 'CCTV', '보안 카메라'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    ipCam(k, kind, p.body);
    if (p.ir && (kind === 'dome' || kind === 'fisheye' || kind === 'ptz' || kind === 'cube')) k.box('ir', 'led-red', 0.006, 0.006, 0.002, 0.0, kind === 'cube' ? 0.1 : 0.0, kind === 'cube' ? 0.0185 : 0.02, { r: 0 });
    return finish(k);
  },
}));

const nvr = ofp({
  id: 'ofp-nvr-recorder', ko: '네트워크 영상 저장 장치 (NVR)', en: 'Network video recorder (NVR)',
  params: [P.int('bays', '디스크 베이', 'Drive bays', 2, 1, 8), P.bool('monitor', '모니터', 'With monitor', true)],
  tags: ['nvr', 'video recorder', 'cctv recorder', 'NVR', '녹화기', 'CCTV 녹화기'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.38, d = 0.3, h = 0.05 + Math.ceil(p.bays / 4) * 0.02;
    k.box('body', 'metal-pc-black-matte', w, h, d, 0, h / 2, 0, { r: 0.004 });
    k.box('leds', 'led-green', 0.004, 0.004, 0.002, -w / 2 + 0.02, h / 2, d / 2 + 0.001, { r: 0 });
    k.box('leds', 'led-blue', 0.004, 0.004, 0.002, -w / 2 + 0.03, h / 2, d / 2 + 0.001, { r: 0 });
    for (let i = 0; i < p.bays; i++) k.box('bays', 'plastic-abs-matte-grey', 0.06, 0.012, 0.002, -0.05 + (i % 4) * 0.065, 0.015 + Math.floor(i / 4) * 0.02, d / 2 + 0.001, { r: 0 });
    if (p.monitor) {
      k.box('monitor', 'plastic-abs-matte-black', 0.5, 0.3, 0.03, 0, h + 0.25, -0.05, { r: 0.004 });
      k.box('screen', 'screen-on-dark', 0.48, 0.27, 0.002, 0, h + 0.25, -0.034, { r: 0 });
      for (let c = 0; c < 2; c++) for (let r = 0; r < 2; r++) k.box('grid', 'paper-black', 0.003, 0.27, 0.001, 0, h + 0.25, -0.032, { r: 0 });
      k.box('monitor', 'plastic-abs-matte-black', 0.04, 0.1, 0.04, 0, h + 0.05, -0.07, { r: 0.004 });
    }
    return finish(k);
  },
});


export { faceHead, ipCam };
export const ITEMS = [faceTerminalWall, faceTerminalStand, faceGate, fingerprint, ...ipCams, nvr];
