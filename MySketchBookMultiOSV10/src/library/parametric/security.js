// Security (보안) category, part 1: biometrics and access control — fingerprint, finger-vein, palm-vein, iris,
// retina, face (with temperature, on stand, kiosk, tablet), hand geometry and multi-modal readers, enrolment and
// livescan stations; card / PIN / QR / long-range readers; turnstiles and gates (tripod, full height, swing,
// flap, wide lane, revolving security door); door hardware (maglock, electric strike, exit button, break glass,
// door controller, smart and digital door locks, door viewer camera) and intercoms (wall pad, lobby phone,
// guard station). Units metres, Y up, front +Z, origin bottom centre (finish() centres every build).
import { THREE, Kit, P, T, frameShape } from './helpers.js';
import { finish } from './kitchen.js';
import { C } from './accessories-plus.js';
import { keys } from './office-props.js';
import { sec, faceHead } from './security-moved.js';

const PI = Math.PI;
const SCREEN = (def = true) => P.bool('screen', '화면 켜짐', 'Screen on', def);
const BODY = (def = '#1e1f22') => P.color('body', '몸체 색', 'Body colour', def);
const scr = (on) => (on ? 'screen-on-dark' : 'screen-matte-off');

/** Wall reader housing w × h × d (bottom at y = 0, back at z = 0); returns the front plane z. */
function housing(k, w, h, d, color, { mat = 'plastic-abs-gloss-black', r = 0.01 } = {}) {
  k.box('body', mat, w, h, d, 0, h / 2, d / 2, { r, ...C(color) });
  return d;
}
/** Fingerprint sensor window (dark glass with a lit ring) on a face at zf. */
function fingerPad(k, x, y, zf, s = 0.022) {
  k.box('sensor', 'glass-tint-smoke-dark', s, s * 1.25, 0.006, x, y, zf + 0.001, { r: s * 0.3 });
  k.box('ring', 'led-blue', s * 1.25, 0.002, 0.002, x, y - s * 0.75, zf + 0.002, { r: 0 });
}
/** Lens (camera / iris) on a face at zf. */
function lens(k, x, y, zf, r) {
  k.cyl('lens', 'plastic-abs-matte-black', r * 1.3, r * 1.3, 0.004, x, y, zf, { rx: PI / 2, segs: k.seg(16, 8) });
  k.cyl('lens', 'glass-tint-smoke-dark', r, r, 0.004, x, y, zf + 0.002, { rx: PI / 2, segs: k.seg(16, 8) });
}
/** Short pedestal (gooseneck post) for floor-standing readers; returns the top height. */
function pedestal(k, h, mat = 'metal-ss-brushed') {
  k.cyl('base', mat, 0.15, 0.16, 0.015, 0, 0, 0, { segs: k.seg(24, 8) });
  k.cyl('post', mat, 0.03, 0.03, h, 0, 0.015, 0, { segs: k.seg(14, 6) });
  return h + 0.015;
}

/* ============================================================ biometrics */

const fingerReader = sec({
  id: 'sec-fingerprint-reader-wall', placement: 'wall', elevation: 1.2, ko: '지문 인식기 (벽부형)', en: 'Wall fingerprint reader',
  params: [BODY(), P.bool('keypad', '키패드', 'Keypad', false)],
  tags: ['fingerprint reader', 'biometric', 'access control', '지문 인식기', '지문 리더', '생체 인식'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.07, h = p.keypad ? 0.17 : 0.12;
    const zf = housing(k, w, h, 0.03, p.body);
    fingerPad(k, 0, 0.035, zf);
    if (p.keypad) keys(k, 'keys', 'plastic-abs-matte-grey', 3, 4, 0, 0.115, zf, 0.016, 0.012, { top: false });
    k.box('leds', 'led-green', 0.012, 0.003, 0.002, 0, h - 0.012, zf + 0.001, { r: 0 });
    return finish(k);
  },
});

const fingerCard = sec({
  id: 'sec-fingerprint-card-terminal', placement: 'wall', elevation: 1.2, ko: '지문·카드 겸용 출입 단말기', en: 'Fingerprint and card access terminal',
  params: [BODY('#2b2b2b'), SCREEN()],
  tags: ['fingerprint card reader', 'rfid fingerprint', 'access terminal', '지문 카드 단말기', '지문 리더', 'RF 카드'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.1, h = 0.18;
    const zf = housing(k, w, h, 0.035, p.body);
    k.box('display', scr(p.screen), 0.07, 0.05, 0.002, 0, 0.14, zf + 0.001, { r: 0.002 });
    k.box('card', 'plastic-abs-matte-grey', 0.07, 0.04, 0.002, 0, 0.08, zf + 0.001, { r: 0.004 });
    fingerPad(k, 0, 0.03, zf);
    return finish(k);
  },
});

const fingerVein = sec({
  id: 'sec-finger-vein-reader', placement: 'wall', elevation: 1.2, ko: '손가락 정맥 인식기', en: 'Finger vein reader',
  params: [BODY('#e8e8e8'), SCREEN()],
  tags: ['finger vein', 'vein reader', 'biometric', '지정맥 인식기', '손가락 정맥', '정맥 인식'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.09, h = 0.16, d = 0.08;
    housing(k, w, h, d, p.body, { mat: 'plastic-abs-gloss-white' });
    k.box('slot', 'plastic-abs-matte-black', 0.03, 0.03, 0.06, 0, 0.05, d - 0.02, { r: 0.012 });
    k.box('leds', 'led-blue', 0.026, 0.002, 0.05, 0, 0.066, d - 0.02, { r: 0 });
    k.box('display', scr(p.screen), 0.06, 0.04, 0.002, 0, 0.12, d + 0.001, { r: 0.002 });
    return finish(k);
  },
});

const palmVein = sec({
  id: 'sec-palm-vein-reader', placement: 'wall', elevation: 1.1, ko: '장정맥 (손바닥 정맥) 인식기', en: 'Palm vein reader',
  params: [BODY(), P.bool('guide', '손 받침', 'Hand guide', true)],
  tags: ['palm vein', 'palm reader', 'contactless biometric', '장정맥 인식기', '손바닥 정맥', '정맥 인식'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.12, h = 0.14;
    const zf = housing(k, w, h, 0.04, p.body);
    k.box('sensor', 'glass-tint-smoke-dark', 0.07, 0.07, 0.004, 0, 0.08, zf + 0.001, { r: 0.01 });
    k.box('ring', 'led-blue', 0.08, 0.003, 0.002, 0, 0.04, zf + 0.002, { r: 0 });
    if (p.guide) k.box('guide', 'plastic-abs-matte-black', 0.11, 0.008, 0.08, 0, 0.005, zf + 0.04, { r: 0.004, rx: 0.15 });
    return finish(k);
  },
});

const palmTerminal = sec({
  id: 'sec-palm-vein-face-terminal', placement: 'wall', elevation: 1.2, ko: '장정맥·얼굴 복합 인식 단말기', en: 'Palm vein and face terminal',
  params: [BODY(), SCREEN()],
  tags: ['palm vein', 'face recognition', 'multi biometric', '장정맥', '얼굴 인식', '복합 생체 인식'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    faceHead(k, 0, 0.12, 0.02, { screen: p.screen, color: p.body });
    k.box('body', 'plastic-abs-gloss-black', 0.13, 0.12, 0.05, 0, 0.06, 0.025, { r: 0.01, ...C(p.body) });
    k.box('sensor', 'glass-tint-smoke-dark', 0.08, 0.004, 0.035, 0, 0.122, 0.035, { r: 0.006 });
    return finish(k);
  },
});

const iris = sec({
  id: 'sec-iris-scanner-wall', placement: 'wall', elevation: 1.4, ko: '홍채 인식기 (벽부형)', en: 'Wall iris scanner',
  params: [BODY(), P.bool('dual', '양안', 'Dual eye', true)],
  tags: ['iris scanner', 'iris recognition', 'biometric', '홍채 인식기', '홍채 인식', '생체 인식'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.16, h = 0.12;
    const zf = housing(k, w, h, 0.05, p.body, { r: 0.02 });
    k.box('window', 'glass-tint-smoke-dark', 0.13, 0.04, 0.003, 0, 0.08, zf + 0.001, { r: 0.012 });
    for (const x of p.dual ? [-0.03, 0.03] : [0]) lens(k, x, 0.08, zf + 0.002, 0.009);
    k.box('leds', 'led-purple', 0.1, 0.002, 0.002, 0, 0.035, zf + 0.001, { r: 0 });
    return finish(k);
  },
});

const irisFace = sec({
  id: 'sec-iris-face-terminal', placement: 'wall', elevation: 1.25, ko: '홍채·얼굴 인식 단말기', en: 'Iris and face recognition terminal',
  params: [BODY(), SCREEN()],
  tags: ['iris face terminal', 'multi biometric', '홍채 얼굴 단말기', '홍채 인식', '얼굴 인식'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.15, h = 0.32;
    const zf = housing(k, w, h, 0.045, p.body, { r: 0.015 });
    k.box('display', scr(p.screen), w - 0.02, 0.17, 0.002, 0, 0.12, zf + 0.001, { r: 0.004 });
    k.box('window', 'glass-tint-smoke-dark', w - 0.03, 0.05, 0.003, 0, 0.265, zf + 0.001, { r: 0.01 });
    for (const x of [-0.035, 0, 0.035]) lens(k, x, 0.265, zf + 0.002, 0.007);
    return finish(k);
  },
});

const irisDesk = sec({
  id: 'sec-iris-enrolment-camera', ko: '홍채 등록 카메라 (탁상형)', en: 'Desktop iris enrolment camera',
  params: [P.num('tilt', '기울기', 'Tilt', 0.2, 0, 0.6, 0.01)],
  tags: ['iris camera', 'enrolment', 'desktop iris', '홍채 등록기', '홍채 카메라', '탁상형'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('base', 'plastic-abs-matte-black', 0.12, 0.015, 0.1, 0, 0.0075, 0, { r: 0.006 });
    k.box('arm', 'plastic-abs-matte-black', 0.03, 0.1, 0.02, 0, 0.065, -0.03, { r: 0.006 });
    k.box('body', 'plastic-abs-matte-black', 0.16, 0.05, 0.05, 0, 0.13, -0.01, { r: 0.015, rx: -p.tilt });
    for (const x of [-0.035, 0.035]) lens(k, x, 0.13, 0.016, 0.01);
    return finish(k);
  },
});

const retina = sec({
  id: 'sec-retina-scanner', placement: 'wall', elevation: 1.35, ko: '망막 인식기', en: 'Retina scanner',
  params: [BODY('#d8dadc')],
  tags: ['retina scanner', 'eye scanner', 'high security', '망막 인식기', '눈 인식', '고보안'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const zf = housing(k, 0.14, 0.2, 0.06, p.body, { mat: 'plastic-abs-matte-grey', r: 0.02 });
    k.cyl('eyecup', 'rubber-black', 0.025, 0.03, 0.04, 0, 0.14, zf, { rx: PI / 2, segs: k.seg(16, 8) });
    lens(k, 0, 0.14, zf + 0.041, 0.012);
    keys(k, 'keys', 'plastic-abs-matte-black', 3, 2, 0, 0.05, zf, 0.02, 0.014, { top: false });
    return finish(k);
  },
});

const faceTemp = sec({
  id: 'sec-face-temperature-kiosk', placement: 'floor', ko: '얼굴 인식·발열 체크 키오스크', en: 'Face recognition temperature kiosk',
  params: [P.len('height', '높이', 'Height', 1.45, 1.1, 1.7), SCREEN()],
  tags: ['temperature kiosk', 'fever screening', 'face recognition', '발열 체크', '체온 측정', '얼굴 인식 키오스크'],
  build: (p, ctx) => {
    const k = new Kit(ctx), top = pedestal(k, p.height - 0.32, 'metal-pc-white-perforated');
    k.box('head', 'plastic-abs-gloss-white', 0.2, 0.32, 0.04, 0, top + 0.16, 0.0, { r: 0.02 });
    k.box('display', scr(p.screen), 0.17, 0.24, 0.002, 0, top + 0.14, 0.021, { r: 0.004 });
    k.box('sensor', 'plastic-abs-gloss-black', 0.08, 0.025, 0.012, 0, top + 0.295, 0.024, { r: 0.006 });
    return finish(k);
  },
});

const faceTablet = sec({
  id: 'sec-face-recognition-tablet', placement: 'wall', elevation: 1.3, ko: '얼굴 인식 태블릿 (8인치)', en: 'Face recognition tablet (8-inch)',
  params: [BODY(), SCREEN(), P.bool('landscape', '가로형', 'Landscape', false)],
  tags: ['face tablet', 'visitor check-in', 'face recognition', '얼굴 인식 태블릿', '방문자 인증', '출입 관리'],
  build: (p, ctx) => {
    const k = new Kit(ctx), [w, h] = p.landscape ? [0.22, 0.14] : [0.14, 0.22];
    const zf = housing(k, w, h, 0.02, p.body, { r: 0.01 });
    k.box('display', scr(p.screen), w - 0.016, h - 0.03, 0.002, 0, h / 2 - 0.004, zf + 0.001, { r: 0.004 });
    lens(k, 0, h - 0.009, zf + 0.001, 0.003);
    return finish(k);
  },
});

const face3d = sec({
  id: 'sec-3d-face-terminal-turnstile-mount', ko: '3D 얼굴 인식 단말기 (게이트 거치형)', en: '3D face terminal on gate mount',
  params: [BODY(), SCREEN(), P.len('pole', '거치대 높이', 'Mount height', 0.3, 0.15, 0.5)],
  tags: ['3d face', 'turnstile mount', 'gate terminal', '3D 얼굴 인식', '게이트 거치', '얼굴 인식 단말기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('base', 'metal-ss-brushed', 0.08, 0.008, 0.08, 0, 0.004, 0, { r: 0.004 });
    k.cyl('post', 'metal-ss-brushed', 0.015, 0.015, p.pole, 0, 0.008, 0, { segs: 10 });
    faceHead(k, 0, p.pole, 0.01, { screen: p.screen, color: p.body });
    return finish(k);
  },
});

const handGeo = sec({
  id: 'sec-hand-geometry-reader', placement: 'wall', elevation: 0.95, ko: '손 모양 인식기 (핸드 지오메트리)', en: 'Hand geometry reader',
  params: [BODY('#d8d4cc')],
  tags: ['hand geometry', 'hand reader', 'biometric time clock', '손 모양 인식', '핸드 리더', '생체 인식'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('body', 'plastic-abs-matte-beige', 0.22, 0.3, 0.08, 0, 0.15, 0.04, { r: 0.02, ...C(p.body) });
    k.box('platen', 'plastic-abs-matte-black', 0.2, 0.012, 0.2, 0, 0.012, 0.18, { r: 0.006 });
    for (let i = 0; i < 5; i++) k.cyl('pins', 'metal-chrome', 0.004, 0.004, 0.02, -0.06 + i * 0.03, 0.018, 0.2 - (i === 0 ? 0.04 : 0), { segs: 6 });
    k.box('display', 'screen-on-dark', 0.1, 0.04, 0.002, 0, 0.24, 0.081, { r: 0.002 });
    keys(k, 'keys', 'plastic-abs-matte-grey', 4, 3, 0, 0.14, 0.08, 0.025, 0.018, { top: false });
    return finish(k);
  },
});

const multiStation = sec({
  id: 'sec-biometric-enrolment-station', placement: 'floor', ko: '생체 정보 등록 데스크 (지문·홍채·얼굴)', en: 'Biometric enrolment desk station',
  params: [P.len('width', '폭', 'Width', 1.2, 0.9, 1.6), SCREEN()],
  tags: ['enrolment station', 'biometric registration', 'id issuing', '생체 등록 데스크', '지문 등록', '신분증 발급'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = 0.75;
    k.box('top', 'plastic-hpl-white', w, 0.03, 0.7, 0, h - 0.015, 0, { r: 0.004 });
    for (const sx of [-1, 1]) k.box('legs', 'metal-pc-light-grey', 0.04, h - 0.03, 0.6, sx * (w / 2 - 0.04), (h - 0.03) / 2, 0, { r: 0.004 });
    k.box('monitor', 'plastic-abs-matte-black', 0.5, 0.3, 0.025, -w * 0.15, h + 0.25, -0.25, { r: 0.004 });
    k.box('screen', scr(p.screen), 0.48, 0.28, 0.002, -w * 0.15, h + 0.25, -0.236, { r: 0 });
    k.box('scanner', 'plastic-abs-matte-black', 0.16, 0.05, 0.14, w * 0.25, h + 0.025, 0.1, { r: 0.012 });
    k.box('scanner', 'glass-tint-smoke-dark', 0.12, 0.002, 0.09, w * 0.25, h + 0.051, 0.1, { r: 0.004 });
    k.box('camera', 'plastic-abs-matte-black', 0.12, 0.04, 0.04, -w * 0.15, h + 0.43, -0.24, { r: 0.012 });
    k.box('pad', 'plastic-abs-matte-black', 0.14, 0.012, 0.1, w * 0.05, h + 0.006, 0.18, { r: 0.006 });
    return finish(k);
  },
});

const livescan = sec({
  id: 'sec-ten-print-livescan', ko: '십지 지문 스캐너 (라이브스캔)', en: 'Ten-print livescan scanner',
  params: [P.bool('lit', '조명', 'Platen lit', true)],
  tags: ['livescan', 'ten print', 'fingerprint scanner', '십지 지문', '지문 스캐너', '지문 채취'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('body', 'plastic-abs-matte-grey', 0.22, 0.09, 0.2, 0, 0.045, 0, { r: 0.02, rx: -0.15 });
    k.box('platen', p.lit ? 'led-green' : 'glass-tint-smoke-dark', 0.16, 0.003, 0.1, 0, 0.095, 0.0, { r: 0.004, rx: -0.15 });
    return finish(k);
  },
});

const usbFinger = sec({
  id: 'sec-usb-fingerprint-scanner', ko: 'USB 지문 스캐너 (PC용)', en: 'USB fingerprint scanner',
  params: [BODY('#2b2b2b')],
  tags: ['usb fingerprint', 'pc login', 'fingerprint scanner', 'USB 지문 인식기', 'PC 지문 로그인', '지문 스캐너'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('body', 'plastic-abs-gloss-black', 0.055, 0.025, 0.075, 0, 0.0125, 0, { r: 0.012, ...C(p.body) });
    k.box('sensor', 'glass-tint-smoke-dark', 0.022, 0.002, 0.028, 0, 0.0255, 0.008, { r: 0.006 });
    k.tube('cable', 'rubber-black', [[0, 0.01, -0.037], [0.02, 0.006, -0.1], [0.08, 0.004, -0.14]], 0.002);
    return finish(k);
  },
});

const signaturePad = sec({
  id: 'sec-signature-pad', ko: '전자 서명 패드', en: 'Electronic signature pad',
  params: [SCREEN()],
  tags: ['signature pad', 'e-signature', 'pen pad', '전자 서명', '서명 패드', '사인 패드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('body', 'plastic-abs-matte-black', 0.2, 0.015, 0.14, 0, 0.0075, 0, { r: 0.01 });
    k.box('screen', scr(p.screen), 0.15, 0.001, 0.09, 0, 0.0155, 0.005, { r: 0.002 });
    k.rod('pen', 'plastic-abs-matte-black', [0.11, 0.008, -0.05], [0.11, 0.008, 0.06], 0.004, { segs: 8 });
    return finish(k);
  },
});

const voice = sec({
  id: 'sec-voice-recognition-panel', placement: 'wall', elevation: 1.35, ko: '음성 인식 출입 패널', en: 'Voice recognition access panel',
  params: [BODY()],
  tags: ['voice recognition', 'speaker verification', 'voice biometric', '음성 인식', '화자 인증', '출입 패널'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const zf = housing(k, 0.1, 0.16, 0.03, p.body);
    k.cyl('grille', 'metal-black-mesh', 0.025, 0.025, 0.003, 0, 0.1, zf, { rx: PI / 2, segs: 16 });
    for (let i = 0; i < 5; i++) k.box('leds', 'led-cyan', 0.004, 0.01 + (i % 3) * 0.006, 0.002, -0.016 + i * 0.008, 0.04, zf + 0.001, { r: 0 });
    return finish(k);
  },
});

/* ============================================================ card, PIN and long-range readers */

const READERS = [
  ['rfid-mullion', '슬림 카드 리더 (문틀형)', 'Slim mullion card reader', 0.045, 0.15, ['mullion reader', 'rfid', 'proximity', '카드 리더', 'RF 리더', '문틀형']],
  ['keypad', '카드·비밀번호 리더', 'Card and PIN reader', 0.085, 0.13, ['pin reader', 'keypad reader', 'card pin', '비밀번호 리더', '키패드 리더', '카드 리더']],
  ['qr', 'QR·모바일 출입 리더', 'QR code and mobile reader', 0.09, 0.12, ['qr reader', 'mobile credential', 'nfc', 'QR 리더', '모바일 출입증', 'NFC']],
  ['touch', '터치 키패드 (유리)', 'Glass touch keypad', 0.08, 0.14, ['touch keypad', 'glass keypad', '터치 키패드', '유리 키패드', '비밀번호']],
];

const readers = READERS.map(([kind, ko, en, w, h, tags]) => sec({
  id: `sec-reader-${kind}`, placement: 'wall', elevation: 1.2, ko, en,
  params: [BODY(), P.bool('led', '상태 LED', 'Status LED', true)],
  tags: [...tags, 'access control', '출입 통제'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const zf = housing(k, w, h, 0.025, p.body);
    if (kind === 'keypad') keys(k, 'keys', 'plastic-abs-matte-grey', 3, 4, 0, h * 0.4, zf, 0.018, 0.013, { top: false });
    if (kind === 'touch') { k.box('glass', 'glass-tint-smoke-dark', w - 0.006, h - 0.006, 0.002, 0, h / 2, zf + 0.001, { r: 0.006 }); keys(k, 'keys', 'led-cyan', 3, 4, 0, h * 0.45, zf + 0.002, 0.018, 0.006, { top: false }); }
    if (kind === 'qr') k.box('window', 'glass-tint-smoke-dark', w - 0.02, 0.05, 0.003, 0, h * 0.45, zf + 0.001, { r: 0.006 });
    if (kind === 'rfid-mullion') k.box('logo', 'plastic-abs-matte-grey', 0.02, 0.02, 0.002, 0, h * 0.5, zf + 0.001, { r: 0.01 });
    if (p.led) k.box('leds', 'led-green', w * 0.4, 0.004, 0.002, 0, h - 0.012, zf + 0.001, { r: 0 });
    return finish(k);
  },
}));

const longRange = sec({
  id: 'sec-long-range-uhf-reader', placement: 'floor', ko: '차량용 원거리 리더 (UHF, 기둥)', en: 'Long-range UHF vehicle reader on post',
  params: [P.len('height', '높이', 'Height', 1.6, 1.0, 2.2)],
  tags: ['uhf reader', 'vehicle access', 'long range rfid', '원거리 리더', '차량 출입', 'UHF'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height;
    k.box('post', 'metal-pc-anthracite', 0.08, H, 0.08, 0, H / 2, 0, { r: 0.006 });
    k.box('panel', 'plastic-abs-matte-white', 0.3, 0.3, 0.06, 0, H - 0.1, 0.07, { r: 0.02, rx: 0.2 });
    return finish(k);
  },
});

/* ============================================================ turnstiles and gates */

const GATES = [
  ['tripod', '삼발이 턴스타일', 'Tripod turnstile', ['tripod turnstile', 'waist high', '삼발이', '턴스타일', '회전식 출입문']],
  ['swing', '스윙 게이트 (유리 날개)', 'Swing barrier gate', ['swing gate', 'barrier', 'glass wing', '스윙 게이트', '출입 게이트']],
  ['flap', '플랩 게이트 (날개형)', 'Flap barrier gate', ['flap barrier', 'optical turnstile', '플랩 게이트', '날개형 게이트']],
  ['wide', '장애인 통로 게이트 (광폭)', 'Wide-lane accessible gate', ['wide lane', 'accessible gate', 'ada', '광폭 게이트', '장애인 통로', '휠체어']],
];

const gates = GATES.map(([kind, ko, en, tags]) => sec({
  id: `sec-gate-${kind}`, placement: 'floor', ko, en,
  params: [P.int('lanes', '통로 수', 'Lanes', 1, 1, 3), P.num('open', '열림', 'Open', 0, 0, 1, 0.05), P.bool('reader', '리더', 'Readers', true)],
  tags: [...tags, 'entrance', 'lobby', '출입 통제', '로비'],
  build: (p, ctx) => {
    const k = new Kit(ctx), lane = kind === 'wide' ? 0.9 : kind === 'tripod' ? 0.55 : 0.6, cab = kind === 'tripod' ? 0.28 : 0.18, L = kind === 'tripod' ? 0.6 : 1.2, h = 0.98;
    for (let i = 0; i <= p.lanes; i++) {
      const x = (i - p.lanes / 2) * (lane + cab);
      k.box('cabinets', 'metal-ss-brushed', cab, h, L, x, h / 2, 0, { r: kind === 'tripod' ? 0.02 : 0.04 });
      k.box('tops', 'glass-tint-smoke-dark', cab - 0.01, 0.006, L - 0.06, x, h + 0.003, 0, { r: 0.002 });
      if (p.reader) k.box('readers', 'glass-tint-smoke-dark', cab * 0.6, 0.004, 0.08, x, h + 0.008, L / 2 - 0.1, { r: 0.004 });
      if (i < p.lanes) {
        const a = p.open * PI / 2;
        if (kind === 'tripod') for (let j = 0; j < 3; j++) { const t = (j / 3) * PI * 2 + a; k.rod('arms', 'metal-ss-polished', [x + cab / 2, 0.85, 0], [x + cab / 2 + Math.cos(t) * 0.45, 0.85 - Math.sin(t) * 0.2 * 0 - 0.2 * Math.abs(Math.sin(t)), Math.sin(t) * 0.3], 0.018, { segs: 8 }); }
        else if (kind === 'flap') { const wl = lane / 2 - 0.02; for (const s of [-1, 1]) k.box('wings', 'plastic-acrylic-clear', wl * (1 - p.open), 0.4, 0.015, x + cab / 2 + (s < 0 ? wl * (1 - p.open) / 2 : lane - wl * (1 - p.open) / 2), 0.75, 0, { r: 0.04 }); }
        else { const wl = kind === 'wide' ? lane - 0.03 : lane / 2 - 0.02; const sides = kind === 'wide' ? [-1] : [-1, 1]; for (const s of sides) { const hx = s < 0 ? x + cab / 2 : x + cab / 2 + lane; k.box('wings', 'plastic-acrylic-clear', wl, 0.75, 0.012, hx - s * Math.cos(a) * wl / 2, 0.55, s * 0 + Math.sin(a) * wl / 2, { r: 0.02, ry: s * a }); } }
      }
      k.box('leds', 'led-green', 0.004, 0.02, L * 0.5, x + (i < p.lanes ? cab / 2 + 0.001 : -cab / 2 - 0.001), h - 0.1, 0, { r: 0 });
    }
    return finish(k);
  },
}));

const fullHeight = sec({
  id: 'sec-full-height-turnstile', placement: 'floor', ko: '전고형 회전문 (풀하이트 턴스타일)', en: 'Full-height turnstile',
  params: [P.num('turn', '회전', 'Rotation', 0, 0, 1.05, 0.05), P.bool('canopy', '캐노피', 'Canopy', true)],
  tags: ['full height turnstile', 'rotor gate', 'perimeter', '전고형 턴스타일', '회전식 출입문', '공장 출입'],
  build: (p, ctx) => {
    const k = new Kit(ctx), R = 0.65, H = 2.2;
    for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) k.box('frame', 'metal-steel-galvanised', 0.06, H, 0.06, sx * (R + 0.05), H / 2, sz * 0.7, { r: 0.004 });
    for (let j = 0; j < 4; j++) for (const sz of [-1, 1]) k.box('frame', 'metal-steel-galvanised', 0.03, H - 0.2, 0.03, (j % 2 ? 1 : -1) * (R + 0.05), (H - 0.2) / 2 + 0.1, sz * (0.2 + j * 0.12), { r: 0 });
    k.cyl('rotor', 'metal-steel-galvanised', 0.04, 0.04, H - 0.1, 0, 0.05, 0, { segs: 10 });
    for (let a = 0; a < 3; a++) { const t = (a / 3) * PI * 2 + p.turn; for (let y = 0.2; y < H - 0.2; y += 0.12) k.rod('bars', 'metal-steel-galvanised', [0, y, 0], [Math.cos(t) * R, y, Math.sin(t) * R], 0.012, { segs: 6 }); }
    if (p.canopy) k.box('canopy', 'metal-pc-anthracite', 2 * R + 0.3, 0.12, 1.6, 0, H + 0.06, 0, { r: 0.006 });
    return finish(k);
  },
});

const revolving = sec({
  id: 'sec-security-revolving-door', placement: 'floor', ko: '보안 회전문 (인터록 캡슐)', en: 'Security revolving door (interlock)',
  params: [P.len('diameter', '지름', 'Diameter', 1.8, 1.4, 2.4), P.num('turn', '회전', 'Rotation', 0.3, 0, 1.6, 0.05)],
  tags: ['security revolving door', 'interlock', 'anti tailgating', '보안 회전문', '인터록', '캡슐형 출입문'],
  build: (p, ctx) => {
    const k = new Kit(ctx), R = p.diameter / 2, H = 2.3;
    const g = new THREE.CylinderGeometry(R, R, H, k.seg(40, 14), 1, true, PI / 4, PI / 2);
    k.add('glass', 'glass-laminated-clear', g.clone().translate(0, H / 2, 0));
    k.add('glass', 'glass-laminated-clear', g.translate(0, H / 2, 0).rotateY(PI));
    k.cyl('canopy', 'metal-ss-brushed', R + 0.05, R + 0.05, 0.2, 0, H, 0, { segs: k.seg(40, 14) });
    k.cyl('floor', 'metal-ss-brushed', R + 0.05, R + 0.05, 0.02, 0, 0, 0, { segs: k.seg(40, 14) });
    for (let a = 0; a < 4; a++) { const t = (a / 4) * PI * 2 + p.turn; k.box('wings', 'glass-laminated-clear', R - 0.05, H - 0.1, 0.012, Math.cos(t) * R / 2, H / 2, Math.sin(t) * R / 2, { r: 0, ry: -t }); }
    k.cyl('post', 'metal-ss-brushed', 0.05, 0.05, H, 0, 0, 0, { segs: 12 });
    return finish(k);
  },
});

/* ============================================================ door hardware and locks */

const maglock = sec({
  id: 'sec-magnetic-door-lock', placement: 'wall', elevation: 2.0, ko: '전자석 도어 락 (EM 락)', en: 'Electromagnetic door lock',
  params: [P.len('length', '길이', 'Length', 0.25, 0.18, 0.3)],
  tags: ['maglock', 'em lock', 'magnetic lock', 'EM 락', '전자석 락', '자석 잠금'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length;
    k.box('lock', 'metal-al-anodised-clear', L, 0.04, 0.05, 0, 0.02, 0.025, { r: 0.004 });
    k.box('plate', 'metal-steel-raw', L * 0.75, 0.012, 0.06, 0, -0.006 + 0.0, 0.06, { r: 0.002 });
    k.box('leds', 'led-red', 0.006, 0.006, 0.002, L / 2 - 0.02, 0.02, 0.051, { r: 0 });
    return finish(k);
  },
});

const strike = sec({
  id: 'sec-electric-strike', placement: 'wall', elevation: 1.0, ko: '전기 스트라이크 (문틀)', en: 'Electric door strike',
  params: [P.mat('plate', '판', 'Plate', 'metal-ss-satin', 'metal')],
  tags: ['electric strike', 'door strike', 'access control', '전기 스트라이크', '문틀 잠금', '출입 통제'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('plate', p.plate, 0.03, 0.18, 0.004, 0, 0.09, 0.002, { r: 0.002 });
    k.box('keeper', 'metal-brass-satin', 0.012, 0.05, 0.006, 0, 0.09, 0.006, { r: 0.002 });
    return finish(k);
  },
});

const exitButton = sec({
  id: 'sec-push-to-exit-button', placement: 'wall', elevation: 1.1, ko: '퇴실 버튼 (EXIT)', en: 'Push-to-exit button',
  params: [P.pick('kind', '종류', 'Type', 'push', [['push', '누름', 'Push'], ['touchless', '비접촉', 'Touchless']])],
  tags: ['exit button', 'request to exit', 'rex', '퇴실 버튼', 'EXIT 버튼', '비접촉 버튼'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('plate', 'metal-ss-satin', 0.086, 0.086, 0.008, 0, 0.043, 0.004, { r: 0.004 });
    if (p.kind === 'push') k.box('button', 'plastic-abs-gloss-blue', 0.05, 0.04, 0.014, 0, 0.043, 0.012, { r: 0.006 });
    else { k.cyl('button', 'glass-tint-smoke-dark', 0.025, 0.025, 0.006, 0, 0.043, 0.008, { rx: PI / 2, segs: 16 }); k.add('ring', 'led-blue', T(new THREE.TorusGeometry(0.027, 0.002, 4, 20), 0, 0.043, 0.012)); }
    return finish(k);
  },
});

const breakGlass = sec({
  id: 'sec-emergency-door-release', placement: 'wall', elevation: 1.2, ko: '비상 도어 해제기 (녹색)', en: 'Emergency door release (green)',
  params: [P.bool('cover', '보호 덮개', 'Cover', true)],
  tags: ['break glass', 'emergency release', 'call point green', '비상 해제', '도어 해제', '비상구 해제'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('box', 'plastic-abs-gloss-green', 0.09, 0.09, 0.05, 0, 0.045, 0.025, { r: 0.006, ...C('#1e9b4b') });
    k.box('window', 'plastic-acrylic-white', 0.06, 0.06, 0.004, 0, 0.045, 0.051, { r: 0.002 });
    if (p.cover) k.box('cover', 'plastic-acrylic-clear', 0.1, 0.1, 0.03, 0, 0.05, 0.07, { r: 0.006 });
    return finish(k);
  },
});

const controller = sec({
  id: 'sec-door-controller-panel', placement: 'wall', elevation: 1.5, ko: '출입 통제 컨트롤러 (함체)', en: 'Access control door controller',
  params: [P.bool('open', '문 열림', 'Door open', false), P.int('doors', '제어 문 수', 'Doors', 4, 1, 8)],
  tags: ['door controller', 'access panel', 'acu', '출입 통제기', '컨트롤러', '통제 함체'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.35, h = 0.4, d = 0.1;
    k.box('box', 'metal-pc-light-grey', w, h, d, 0, h / 2, d / 2, { r: 0.004 });
    if (p.open) {
      k.box('board', 'plastic-abs-gloss-green', w - 0.06, h - 0.1, 0.004, 0, h / 2, d - 0.02, { r: 0, ...C('#1f6b3a') });
      for (let i = 0; i < p.doors; i++) k.box('terminals', 'plastic-abs-matte-black', 0.04, 0.012, 0.012, -w / 2 + 0.06 + (i % 4) * 0.07, 0.08 + Math.floor(i / 4) * 0.25, d - 0.012, { r: 0 });
      k.box('door', 'metal-pc-light-grey', 0.01, h, w, -w / 2 - 0.005, h / 2, d + w / 2, { r: 0.002 });
    } else { k.box('door', 'metal-pc-light-grey', w, h, 0.01, 0, h / 2, d + 0.005, { r: 0.002 }); k.box('leds', 'led-green', 0.006, 0.006, 0.002, w / 2 - 0.03, h - 0.03, d + 0.011, { r: 0 }); }
    return finish(k);
  },
});

const LOCKS = [
  ['push-pull', '디지털 도어락 (푸시풀)', 'Push-pull digital door lock', ['push pull lock', 'smart lock', '푸시풀 도어락', '디지털 도어락', '번호키']],
  ['rim', '디지털 도어락 (보조키형)', 'Rim digital door lock', ['rim lock', 'auxiliary lock', '보조키 도어락', '번호키', '디지털 도어락']],
  ['face', '얼굴 인식 스마트 도어락', 'Face recognition smart lock', ['face lock', 'smart lock', '얼굴 인식 도어락', '스마트 도어락', '안면 인식']],
  ['finger', '지문 인식 도어락', 'Fingerprint door lock', ['fingerprint lock', 'biometric lock', '지문 도어락', '지문 인식 잠금', '스마트 도어락']],
];

const locks = LOCKS.map(([kind, ko, en, tags]) => sec({
  id: `sec-door-lock-${kind}`, placement: 'wall', elevation: 0.95, ko, en,
  params: [P.color('body', '몸체 색', 'Body colour', kind === 'rim' ? '#d8d4cc' : '#2b2b2b'), P.bool('lit', '키패드 켜짐', 'Keypad lit', true)],
  tags: [...tags, 'door lock', '도어락', '현관 잠금'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = kind === 'rim' ? 0.07 : 0.075, h = kind === 'rim' ? 0.16 : 0.4;
    k.box('body', 'metal-al-anodised-black', w, h, 0.03, 0, h / 2, 0.015, { r: 0.012, ...C(p.body) });
    const pad = kind === 'rim' ? 0.1 : 0.26;
    k.box('glass', 'glass-tint-smoke-dark', w - 0.012, kind === 'rim' ? 0.1 : 0.14, 0.002, 0, pad, 0.031, { r: 0.006 });
    keys(k, 'keys', p.lit ? 'led-cyan' : 'plastic-abs-matte-grey', 3, 4, 0, pad, 0.032, 0.018, 0.005, { top: false });
    if (kind === 'push-pull' || kind === 'face' || kind === 'finger') k.box('handle', 'metal-al-anodised-black', 0.035, 0.18, 0.05, 0, 0.11, 0.055, { r: 0.012, ...C(p.body) });
    if (kind === 'face') { lens(k, 0, h - 0.03, 0.031, 0.006); lens(k, 0.02, h - 0.03, 0.031, 0.004); }
    if (kind === 'finger') fingerPad(k, 0, 0.17, 0.081, 0.015);
    return finish(k);
  },
}));

const viewer = sec({
  id: 'sec-door-viewer-camera', placement: 'wall', elevation: 1.5, ko: '디지털 도어 뷰어 (외시경 카메라)', en: 'Digital peephole camera',
  params: [SCREEN()],
  tags: ['door viewer', 'peephole camera', 'digital spyhole', '외시경', '도어 뷰어', '현관 카메라'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('monitor', 'plastic-abs-gloss-black', 0.13, 0.09, 0.02, 0, 0.045, 0.01, { r: 0.01 });
    k.box('screen', scr(p.screen), 0.11, 0.07, 0.002, 0, 0.045, 0.021, { r: 0.004 });
    return finish(k);
  },
});

/* ============================================================ intercoms */

const wallpad = sec({
  id: 'sec-video-wallpad', placement: 'wall', elevation: 1.4, ko: '월패드 (비디오폰)', en: 'Video intercom wall pad',
  params: [SCREEN(), P.color('body', '몸체 색', 'Body colour', '#f2f2f2'), P.len('size', '화면 크기', 'Size', 0.26, 0.18, 0.36)],
  tags: ['wall pad', 'video intercom', 'home network', '월패드', '비디오폰', '인터폰', '홈 네트워크'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.size, h = w * 0.7;
    k.box('body', 'plastic-abs-gloss-white', w, h, 0.025, 0, h / 2, 0.0125, { r: 0.012, ...C(p.body) });
    k.box('screen', p.screen ? 'screen-on-desktop' : 'screen-matte-off', w * 0.72, h * 0.8, 0.002, -w * 0.08, h / 2, 0.026, { r: 0.004 });
    for (let i = 0; i < 4; i++) k.box('buttons', 'plastic-abs-matte-grey', 0.03, 0.012, 0.003, w * 0.38, h * 0.2 + i * h * 0.18, 0.026, { r: 0.004 });
    return finish(k);
  },
});

const lobbyPhone = sec({
  id: 'sec-lobby-entrance-phone', placement: 'wall', elevation: 1.1, ko: '공동현관 로비폰', en: 'Apartment lobby entrance phone',
  params: [SCREEN(), P.mat('frame', '틀', 'Frame', 'metal-ss-brushed', 'metal')],
  tags: ['lobby phone', 'entrance panel', 'apartment intercom', '로비폰', '공동현관', '현관 인터폰'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.22, h = 0.45;
    k.box('body', p.frame, w, h, 0.04, 0, h / 2, 0.02, { r: 0.008 });
    k.box('screen', scr(p.screen), 0.15, 0.1, 0.002, 0, h - 0.1, 0.041, { r: 0.002 });
    lens(k, 0, h - 0.025, 0.041, 0.008);
    keys(k, 'keys', 'metal-chrome', 3, 4, 0, h * 0.42, 0.04, 0.035, 0.026, { top: false });
    fingerPad(k, 0, 0.06, 0.04, 0.03);
    k.box('grille', 'metal-black-mesh', 0.08, 0.02, 0.002, 0, 0.2, 0.041, { r: 0 });
    return finish(k);
  },
});

const guardStation = sec({
  id: 'sec-guard-master-station', ko: '경비실 관리 콘솔 (인터폰 마스터)', en: 'Guard master intercom station',
  params: [SCREEN()],
  tags: ['master station', 'guard intercom', 'concierge', '관리 콘솔', '경비실 인터폰', '마스터 스테이션'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('body', 'plastic-abs-matte-anthracite', 0.32, 0.04, 0.22, 0, 0.02, 0, { r: 0.012 });
    k.box('screen', scr(p.screen), 0.26, 0.15, 0.012, 0, 0.13, -0.08, { r: 0.006, rx: -0.3 });
    keys(k, 'keys', 'plastic-abs-matte-grey', 6, 3, 0.04, 0.04, 0.05, 0.022, 0.016);
    k.box('handset', 'plastic-abs-matte-black', 0.05, 0.03, 0.19, -0.13, 0.055, 0.02, { r: 0.012 });
    return finish(k);
  },
});

export const ITEMS = [
  fingerReader, fingerCard, fingerVein, palmVein, palmTerminal, iris, irisFace, irisDesk, retina, faceTemp, faceTablet, face3d, handGeo,
  multiStation, livescan, usbFinger, signaturePad, voice,
  ...readers, longRange, ...gates, fullHeight, revolving,
  maglock, strike, exitButton, breakGlass, controller, ...locks, viewer,
  wallpad, lobbyPhone, guardStation,
];
