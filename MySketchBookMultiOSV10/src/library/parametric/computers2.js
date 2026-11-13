// Computers (컴퓨터) category, part 2: storage and networking (drives, NAS, hubs, docks, KVM, UPS,
// routers, mesh nodes, switches, access points), printing and scanning, mobile and gaming
// (tablets, phones, e-reader, chargers, VR, consoles, controllers, wheel, flight stick), maker and
// lab gear (single-board computers, breadboard kit, soldering station, oscilloscope, bench supply,
// multimeter, resin printer, open test bench), retro machines and desk accessories.
// Units metres, Y up, front +Z, origin bottom centre (finish() centres every build).
import { THREE, Kit, P, T } from './helpers.js';
import { finish } from './kitchen.js';
import { C } from './accessories-plus.js';
import { cmp, SCREEN, screenMat, keyboard, monitor } from './computers.js';

const PI = Math.PI;

/** n small boxes along x on a face at zf. */
function dots(k, role, mat, n, x, y, zf, pitch, w, h = w) {
  for (let i = 0; i < n; i++) k.box(role, mat, w, h, 0.002, x + (i - (n - 1) / 2) * pitch, y, zf + 0.001, { r: 0 });
}

/* ============================================================ storage */

const extHdd = cmp({
  id: 'cmp-external-hdd-desktop', ko: '외장 하드 (데스크톱형)', en: 'Desktop external hard drive',
  params: [P.int('count', '개수', 'Count', 1, 1, 3), P.bool('vertical', '세워 두기', 'Standing', true)],
  tags: ['external hard drive', 'backup drive', 'usb hdd', '외장 하드', '백업 드라이브', 'USB 하드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    for (let i = 0; i < p.count; i++) {
      const x = (i - (p.count - 1) / 2) * 0.05;
      if (p.vertical) { k.box('drives', 'plastic-abs-matte-black', 0.045, 0.16, 0.12, x, 0.08, 0, { r: 0.006 }); k.box('leds', 'led-blue', 0.002, 0.02, 0.002, x, 0.13, 0.061, { r: 0 }); }
      else { k.box('drives', 'plastic-abs-matte-black', 0.12, 0.045, 0.16, 0, 0.0225 + i * 0.047, 0, { r: 0.006 }); k.box('leds', 'led-blue', 0.02, 0.002, 0.002, 0.03, 0.03 + i * 0.047, 0.081, { r: 0 }); }
    }
    return finish(k);
  },
});

const portableSsd = cmp({
  id: 'cmp-portable-ssd', ko: '휴대용 SSD와 케이블', en: 'Portable SSD with cable',
  params: [P.color('body', '색', 'Colour', '#2a5d9f')],
  tags: ['portable ssd', 'usb-c drive', 'external ssd', '외장 SSD', '휴대용 SSD', '포터블 SSD'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('body', 'metal-al-anodised-blue', 0.058, 0.009, 0.085, 0, 0.0045, 0, { r: 0.004, ...C(p.body) });
    k.tube('cable', 'rubber-black', [[0, 0.0045, -0.0425], [0.0, 0.004, -0.08], [0.06, 0.003, -0.1], [0.12, 0.003, -0.06]], 0.002);
    return finish(k);
  },
});

const nas = (id, ko, en, bays, tags) => cmp({
  id, ko, en,
  params: [P.bool('front', '전면 커버', 'Front cover', bays > 2), P.color('body', '몸체 색', 'Body colour', '#1e1f22')],
  tags: [...tags, 'nas', 'network storage', 'NAS', '네트워크 스토리지'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = bays * 0.045 + 0.03, h = 0.17, d = 0.23;
    k.box('body', 'plastic-abs-matte-black', w, h, d, 0, h / 2, 0, { r: 0.008, ...C(p.body) });
    if (p.front) k.box('cover', 'plastic-abs-gloss-black', w - 0.004, h - 0.004, 0.006, 0, h / 2, d / 2 + 0.003, { r: 0.006 });
    else for (let i = 0; i < bays; i++) k.box('bays', 'plastic-abs-matte-anthracite', 0.04, h - 0.03, 0.004, -w / 2 + 0.035 + i * 0.045, h / 2 + 0.01, d / 2 + 0.002, { r: 0.002 });
    dots(k, 'leds', 'led-green', bays + 1, -w / 2 + 0.01, h * 0.15, d / 2 + (p.front ? 0.006 : 0.002), 0.008, 0.003);
    return finish(k);
  },
});

const nases = [
  nas('cmp-nas-2-bay', '2베이 NAS', '2-bay NAS', 2, ['2 bay nas', 'home nas', '2베이 NAS', '가정용 NAS']),
  nas('cmp-nas-4-bay', '4베이 NAS', '4-bay NAS', 4, ['4 bay nas', 'office nas', '4베이 NAS', '사무실 NAS']),
  nas('cmp-nas-8-bay', '8베이 NAS (데스크톱)', '8-bay desktop NAS', 8, ['8 bay nas', 'raid', '8베이 NAS', 'RAID']),
];

const usbHub = cmp({
  id: 'cmp-usb-hub-aluminium', ko: 'USB 허브 (알루미늄)', en: 'Aluminium USB hub',
  params: [P.int('ports', '포트 수', 'Ports', 4, 3, 10)],
  tags: ['usb hub', 'usb-c hub', 'port expander', 'USB 허브', '멀티 포트', '포트 확장'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.ports * 0.016 + 0.03;
    k.box('body', 'metal-al-anodised-grey', w, 0.013, 0.035, 0, 0.0065, 0, { r: 0.004 });
    dots(k, 'ports', 'plastic-black', p.ports, 0, 0.0065, 0.0175, 0.016, 0.012, 0.005);
    k.tube('cable', 'rubber-black', [[-w / 2, 0.006, 0], [-w / 2 - 0.05, 0.004, 0.02], [-w / 2 - 0.12, 0.003, -0.02]], 0.002);
    return finish(k);
  },
});

const dock = cmp({
  id: 'cmp-laptop-docking-station', ko: '노트북 도킹 스테이션', en: 'Laptop docking station',
  params: [P.bool('vertical', '세로형', 'Vertical', false), P.color('body', '색', 'Colour', '#2b2b2b')],
  tags: ['docking station', 'thunderbolt dock', 'usb-c dock', '도킹 스테이션', '노트북 독', '썬더볼트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    if (p.vertical) k.box('body', 'plastic-abs-matte-black', 0.035, 0.12, 0.13, 0, 0.06, 0, { r: 0.008, ...C(p.body) });
    else k.box('body', 'plastic-abs-matte-black', 0.2, 0.03, 0.08, 0, 0.015, 0, { r: 0.008, ...C(p.body) });
    dots(k, 'ports', 'plastic-black', 5, 0, p.vertical ? 0.03 : 0.015, p.vertical ? 0.065 : 0.04, p.vertical ? 0.006 : 0.025, p.vertical ? 0.004 : 0.014, 0.006);
    k.box('leds', 'led-blue', 0.008, 0.002, 0.002, p.vertical ? 0 : 0.08, p.vertical ? 0.11 : 0.025, p.vertical ? 0.066 : 0.041, { r: 0 });
    return finish(k);
  },
});

const cardReader = cmp({
  id: 'cmp-memory-card-reader', ko: '멀티 카드 리더기', en: 'Multi card reader',
  params: [P.int('cards', '꽂힌 카드', 'Cards inserted', 1, 0, 3)],
  tags: ['card reader', 'sd card reader', 'cfexpress', '카드 리더기', 'SD 카드', '메모리 카드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('body', 'metal-al-anodised-grey', 0.08, 0.016, 0.05, 0, 0.008, 0, { r: 0.004 });
    for (let i = 0; i < p.cards; i++) k.box('cards', 'plastic-abs-gloss-blue', 0.024, 0.002, 0.03, -0.025 + i * 0.026, 0.009, 0.035, { r: 0.001, ...C(['#2a5d9f', '#111111', '#d9342b'][i]) });
    return finish(k);
  },
});

const kvm = cmp({
  id: 'cmp-desktop-kvm-switch', ko: '데스크톱 KVM 스위치', en: 'Desktop KVM switch',
  params: [P.int('ports', 'PC 수', 'Computers', 2, 2, 4)],
  tags: ['kvm switch', 'keyboard video mouse', 'pc switcher', 'KVM 스위치', 'PC 전환기', '모니터 공유'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.ports * 0.035 + 0.04;
    k.box('body', 'metal-pc-black-matte', w, 0.03, 0.08, 0, 0.015, 0, { r: 0.004 });
    for (let i = 0; i < p.ports; i++) { k.box('buttons', 'plastic-abs-matte-grey', 0.02, 0.008, 0.012, -w / 2 + 0.035 + i * 0.035, 0.031, 0.02, { r: 0.002 }); k.box('leds', i ? 'plastic-abs-matte-grey' : 'led-green', 0.004, 0.002, 0.004, -w / 2 + 0.035 + i * 0.035, 0.031, -0.005, { r: 0 }); }
    return finish(k);
  },
});

const deskUps = cmp({
  id: 'cmp-desktop-ups', placement: 'floor', ko: 'PC용 UPS (타워형)', en: 'Desktop tower UPS',
  params: [P.len('height', '높이', 'Height', 0.25, 0.18, 0.4), P.bool('display', 'LCD', 'LCD screen', true)],
  tags: ['ups', 'battery backup', 'uninterruptible', 'UPS', '무정전 전원', '정전 대비'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height, w = 0.1, d = 0.28;
    k.box('body', 'plastic-abs-matte-black', w, h, d, 0, h / 2, 0, { r: 0.008 });
    if (p.display) k.box('display', 'screen-on-dark', 0.06, 0.03, 0.002, 0, h * 0.75, d / 2 + 0.001, { r: 0.002 });
    k.cyl('button', 'plastic-abs-matte-grey', 0.01, 0.01, 0.003, 0, h * 0.55, d / 2, { rx: PI / 2, segs: 12 });
    k.box('leds', 'led-green', 0.006, 0.006, 0.002, 0, h * 0.45, d / 2 + 0.001, { r: 0 });
    return finish(k);
  },
});

const surge = cmp({
  id: 'cmp-surge-protector-strip', placement: 'floor', ko: '과부하 차단 멀티탭', en: 'Surge protector power strip',
  params: [P.int('outlets', '구 수', 'Outlets', 6, 3, 10), P.bool('usb', 'USB 포트', 'USB ports', true)],
  tags: ['surge protector', 'power strip', 'multi tap', '멀티탭', '과부하 차단', '전원 탭'],
  build: (p, ctx) => {
    const k = new Kit(ctx), n = p.outlets, L = n * 0.045 + (p.usb ? 0.05 : 0) + 0.06;
    k.box('body', 'plastic-abs-gloss-white', L, 0.035, 0.055, 0, 0.0175, 0, { r: 0.01 });
    for (let i = 0; i < n; i++) k.cyl('sockets', 'plastic-abs-matte-grey', 0.017, 0.017, 0.002, -L / 2 + 0.06 + i * 0.045, 0.035, 0, { segs: 14 });
    k.box('switch', 'plastic-abs-gloss-red', 0.02, 0.006, 0.02, -L / 2 + 0.022, 0.036, 0, { r: 0.002 });
    if (p.usb) dots(k, 'usb', 'plastic-black', 2, L / 2 - 0.025, 0.0175, 0.0275, 0.016, 0.012, 0.005);
    k.tube('cord', 'plastic-abs-gloss-white', [[-L / 2, 0.015, 0], [-L / 2 - 0.1, 0.01, 0.05], [-L / 2 - 0.2, 0.006, -0.02]], 0.004);
    return finish(k);
  },
});

/* ============================================================ network */

const router = cmp({
  id: 'cmp-wifi-router-antennas', ko: '와이파이 공유기 (안테나 6개)', en: 'Wi-Fi router with six antennas',
  params: [P.int('antennas', '안테나 수', 'Antennas', 6, 2, 8), P.num('fold', '안테나 접기', 'Antenna tilt', 0.15, 0, 1.4, 0.01)],
  tags: ['wifi router', 'wireless router', 'tri band', '공유기', '와이파이 공유기', '무선 공유기'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.26, d = 0.18;
    k.box('body', 'plastic-abs-matte-black', w, 0.04, d, 0, 0.02, 0, { r: 0.012 });
    dots(k, 'leds', 'led-cyan', 6, 0, 0.03, d / 2, 0.02, 0.004);
    const n = p.antennas;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2, x = Math.cos(a) * w * 0.48, z = Math.sin(a) * d * 0.48, out = p.fold;
      k.rod('antennas', 'plastic-abs-matte-black', [x, 0.04, z], [x + Math.cos(a) * Math.sin(out) * 0.17, 0.04 + Math.cos(out) * 0.17, z + Math.sin(a) * Math.sin(out) * 0.17], 0.007, { segs: 8 });
    }
    return finish(k);
  },
});

const mesh = cmp({
  id: 'cmp-mesh-wifi-nodes', ko: '메시 와이파이 (3개 세트)', en: 'Mesh Wi-Fi system (3 nodes)',
  params: [P.int('nodes', '노드 수', 'Nodes', 3, 1, 3), P.color('body', '색', 'Colour', '#f2f2f2')],
  tags: ['mesh wifi', 'mesh router', 'whole home wifi', '메시 와이파이', '메시 공유기', '와이파이 확장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    for (let i = 0; i < p.nodes; i++) {
      const x = (i - (p.nodes - 1) / 2) * 0.14;
      k.cyl('nodes', 'plastic-abs-gloss-white', 0.05, 0.05, 0.1, x, 0, 0, { segs: k.seg(24, 8), ...C(p.body) });
      k.cyl('leds', 'led-cyan', 0.006, 0.006, 0.002, x, 0.1, 0, { segs: 10 });
    }
    return finish(k);
  },
});

const modem = cmp({
  id: 'cmp-cable-modem-ont', ko: '광 모뎀 (ONT)', en: 'Fibre modem (ONT)',
  params: [P.bool('standing', '세워 두기', 'Standing', true)],
  tags: ['modem', 'ont', 'fibre terminal', '모뎀', '광 모뎀', '인터넷 단말기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    if (p.standing) { k.box('body', 'plastic-abs-matte-white', 0.04, 0.18, 0.14, 0, 0.09, 0, { r: 0.008 }); dots(k, 'leds', 'led-green', 4, 0, 0.14, 0.07, 0.008, 0.004); }
    else { k.box('body', 'plastic-abs-matte-white', 0.18, 0.035, 0.14, 0, 0.0175, 0, { r: 0.008 }); dots(k, 'leds', 'led-green', 4, 0, 0.0175, 0.07, 0.02, 0.004); }
    k.tube('fibre', 'plastic-abs-gloss-yellow', [[0, 0.02, -0.07], [0.03, 0.015, -0.15], [0.1, 0.004, -0.2]], 0.0015);
    return finish(k);
  },
});

const desktopSwitch = cmp({
  id: 'cmp-desktop-gigabit-switch', ko: '데스크톱 기가비트 스위치 (8포트)', en: 'Desktop gigabit switch (8-port)',
  params: [P.int('ports', '포트 수', 'Ports', 8, 5, 16), P.int('cables', '연결된 케이블', 'Cables', 4, 0, 16)],
  tags: ['network switch', 'gigabit switch', 'ethernet hub', '스위칭 허브', '랜 허브', '기가 스위치'],
  build: (p, ctx) => {
    const k = new Kit(ctx), n = p.ports, w = n * 0.017 + 0.04;
    k.box('body', 'metal-pc-black-matte', w, 0.028, 0.1, 0, 0.014, 0, { r: 0.004 });
    dots(k, 'ports', 'plastic-black', n, 0, 0.012, 0.05, 0.017, 0.014, 0.012);
    dots(k, 'leds', 'led-green', n, 0, 0.024, 0.05, 0.017, 0.003);
    const cols = ['#2a7de1', '#e0b020', '#d9342b', '#2fb04a', '#f2f2f2'];
    for (let i = 0; i < Math.min(p.cables, n); i++) { const x = (i - (n - 1) / 2) * 0.017; k.tube('cables', 'plastic-abs-gloss-blue', [[x, 0.012, 0.055], [x, 0.01, 0.1], [x + 0.02, 0.004, 0.18]], 0.0025, { ...C(cols[i % cols.length]) }); }
    return finish(k);
  },
});

const ap = cmp({
  id: 'cmp-ceiling-access-point', placement: 'ceiling', elevation: 2.4 - 0.035, ko: '천장형 무선 AP', en: 'Ceiling wireless access point',
  params: [P.pick('shape', '모양', 'Shape', 'round', [['round', '원형', 'Round'], ['square', '사각', 'Square']]), P.bool('led', 'LED 링', 'LED ring', true)],
  tags: ['access point', 'wireless ap', 'ceiling wifi', '무선 AP', '천장 AP', '와이파이 AP'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    if (p.shape === 'round') k.lathe('body', 'plastic-abs-matte-white', [[0, 0], [0.09, 0.002], [0.1, 0.02], [0.095, 0.035], [0, 0.035]], 0, 0, 0, { segs: k.seg(32, 10) });
    else k.box('body', 'plastic-abs-matte-white', 0.2, 0.035, 0.2, 0, 0.0175, 0, { r: 0.015 });
    if (p.led) k.add('leds', 'led-blue', T(new THREE.TorusGeometry(0.03, 0.002, 4, 20), 0, 0.0005, 0, PI / 2));
    return finish(k);
  },
});

const poe = cmp({
  id: 'cmp-poe-injector', ko: 'PoE 인젝터', en: 'PoE injector',
  params: [P.int('ports', '포트 수', 'Ports', 1, 1, 4)],
  tags: ['poe injector', 'power over ethernet', 'PoE', 'PoE 인젝터', '전원 공급'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.06 + p.ports * 0.02;
    k.box('body', 'plastic-abs-matte-black', w, 0.03, 0.1, 0, 0.015, 0, { r: 0.006 });
    dots(k, 'ports', 'plastic-black', p.ports * 2, 0, 0.015, 0.05, 0.016, 0.013, 0.012);
    k.box('leds', 'led-green', 0.004, 0.004, 0.002, w / 2 - 0.01, 0.025, 0.051, { r: 0 });
    return finish(k);
  },
});

/* ============================================================ printing and scanning */

const PRINTERS = [
  ['cmp-inkjet-mfp', '잉크젯 복합기', 'Inkjet multifunction printer', 0.43, 0.2, 0.36, 'plastic-abs-matte-black', true, ['inkjet', 'all in one printer', '잉크젯', '복합기', '가정용 프린터']],
  ['cmp-laser-mfp-office', '레이저 복합기 (사무용, ADF)', 'Office laser MFP with ADF', 0.42, 0.42, 0.43, 'plastic-abs-matte-white', true, ['laser printer', 'mfp', 'adf', '레이저 복합기', '사무용 프린터', '스캐너 일체형']],
  ['cmp-colour-laser-printer', '컬러 레이저 프린터', 'Colour laser printer', 0.42, 0.26, 0.47, 'plastic-abs-matte-white', false, ['colour laser', 'color printer', '컬러 레이저', '레이저 프린터']],
  ['cmp-photo-printer', '포토 프린터 (A3+)', 'A3+ photo printer', 0.62, 0.2, 0.32, 'plastic-abs-matte-black', false, ['photo printer', 'a3 printer', 'fine art', '포토 프린터', 'A3 프린터', '사진 인화']],
];

const printers = PRINTERS.map(([id, ko, en, w, h, d, mat, scanner, tags]) => cmp({
  id, ko, en,
  params: [P.bool('paper', '용지 출력', 'Printed paper', true), P.bool('lid', '스캐너 덮개 열림', 'Scanner lid open', false)],
  tags: [...tags, 'printer', '프린터'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('body', mat, w, h, d, 0, h / 2, 0, { r: 0.012 });
    k.box('tray', 'plastic-abs-matte-anthracite', w * 0.6, 0.012, 0.1, 0, h * 0.3, d / 2 + 0.05, { r: 0.004 });
    if (p.paper) k.box('paper', 'paper', 0.21, 0.002, 0.2, 0, h * 0.3 + 0.008, d / 2 + 0.02, { r: 0 });
    k.box('panel', 'plastic-abs-matte-black', 0.12, 0.004, 0.06, w * 0.3, h + 0.002, d / 2 - 0.05, { r: 0.004, rx: -0.3 });
    k.box('display', 'screen-on-desktop', 0.07, 0.002, 0.04, w * 0.3, h + 0.006, d / 2 - 0.05, { r: 0, rx: -0.3 });
    if (scanner) {
      if (p.lid) k.box('lid', mat, w - 0.02, d - 0.04, 0.02, 0, h + (d - 0.04) / 2, -d / 2 + 0.03, { r: 0.006 });
      else k.box('lid', mat, w - 0.02, 0.02, d - 0.04, 0, h + 0.01, 0, { r: 0.006 });
      if (id.includes('adf') || id.includes('office')) k.box('adf', mat, w * 0.7, 0.06, d * 0.6, 0, h + 0.05, -0.02, { r: 0.01 });
    }
    return finish(k);
  },
}));

const flatbed = cmp({
  id: 'cmp-flatbed-scanner', ko: '평판 스캐너', en: 'Flatbed scanner',
  params: [P.bool('open', '덮개 열림', 'Lid open', false)],
  tags: ['flatbed scanner', 'photo scanner', '평판 스캐너', '스캐너', '사진 스캔'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.28, d = 0.4;
    k.box('body', 'plastic-abs-matte-black', w, 0.04, d, 0, 0.02, 0, { r: 0.008 });
    k.box('glass', 'glass-tint-smoke-dark', w - 0.03, 0.002, d - 0.06, 0, 0.041, 0, { r: 0 });
    if (p.open) k.box('lid', 'plastic-abs-matte-black', w, d - 0.02, 0.012, 0, 0.04 + (d - 0.02) / 2, -d / 2 + 0.005, { r: 0.006 });
    else k.box('lid', 'plastic-abs-matte-black', w, 0.012, d - 0.02, 0, 0.047, 0, { r: 0.006 });
    return finish(k);
  },
});

const docScanner = cmp({
  id: 'cmp-sheetfed-document-scanner', ko: '양면 문서 스캐너 (급지형)', en: 'Sheet-fed duplex document scanner',
  params: [P.int('sheets', '용지 수', 'Sheets loaded', 20, 0, 50)],
  tags: ['document scanner', 'sheet fed', 'duplex scanner', '문서 스캐너', '급지형 스캐너', '양면 스캐너'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.3;
    k.box('body', 'plastic-abs-matte-black', w, 0.16, 0.16, 0, 0.08, 0, { r: 0.02 });
    k.box('chute', 'plastic-abs-matte-anthracite', w * 0.8, 0.004, 0.18, 0, 0.2, -0.12, { r: 0.002, rx: -0.6 });
    if (p.sheets) k.box('paper', 'paper', 0.21, 0.002 + p.sheets * 0.0001, 0.17, 0, 0.205, -0.125, { r: 0, rx: -0.6 });
    k.box('tray', 'plastic-abs-matte-anthracite', w * 0.75, 0.004, 0.14, 0, 0.03, 0.14, { r: 0.002 });
    return finish(k);
  },
});

const labelPrinter = cmp({
  id: 'cmp-desktop-label-printer', ko: '데스크톱 라벨 프린터', en: 'Desktop label printer',
  params: [P.len('label', '라벨 길이', 'Label out', 0.05, 0, 0.15)],
  tags: ['label printer', 'shipping label', 'thermal printer', '라벨 프린터', '송장 프린터', '감열 프린터'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('body', 'plastic-abs-matte-white', 0.12, 0.14, 0.2, 0, 0.07, 0, { r: 0.03 });
    k.box('lid', 'plastic-acrylic-smoke', 0.11, 0.05, 0.12, 0, 0.12, -0.02, { r: 0.02 });
    if (p.label > 0.005) k.box('labels', 'paper', 0.06, 0.001, p.label, 0, 0.06, 0.1 + p.label / 2, { r: 0 });
    return finish(k);
  },
});

const receipt = cmp({
  id: 'cmp-pos-receipt-printer', ko: '영수증 프린터 (POS)', en: 'POS receipt printer',
  params: [P.len('receipt', '영수증 길이', 'Receipt out', 0.08, 0, 0.2)],
  tags: ['receipt printer', 'pos printer', 'thermal', '영수증 프린터', 'POS', '포스 프린터'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('body', 'plastic-abs-matte-black', 0.145, 0.13, 0.19, 0, 0.065, 0, { r: 0.015 });
    if (p.receipt > 0.005) k.box('receipt', 'paper', 0.08, p.receipt, 0.001, 0, 0.13 + p.receipt / 2, 0.02, { r: 0, rx: -0.15 });
    k.box('leds', 'led-green', 0.004, 0.004, 0.002, 0.05, 0.09, 0.096, { r: 0 });
    return finish(k);
  },
});

const plotter = cmp({
  id: 'cmp-large-format-plotter', placement: 'floor', ko: '대형 플로터 (A0)', en: 'Large-format plotter (A0)',
  params: [P.len('width', '폭', 'Width', 1.4, 1.0, 1.8), P.bool('basket', '용지 바스켓', 'Paper basket', true)],
  tags: ['plotter', 'large format printer', 'a0', '플로터', '대형 프린터', '도면 출력'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width;
    k.box('body', 'plastic-abs-matte-black', w, 0.25, 0.5, 0, 0.85, 0, { r: 0.02 });
    for (const sx of [-1, 1]) { k.box('legs', 'metal-pc-black-matte', 0.05, 0.75, 0.05, sx * (w / 2 - 0.08), 0.375 + 0.05, 0, { r: 0.004 }); k.box('legs', 'metal-pc-black-matte', 0.05, 0.05, 0.6, sx * (w / 2 - 0.08), 0.05, 0, { r: 0.004 }); }
    if (p.basket) k.box('basket', 'fabric-canvas-black', w - 0.2, 0.3, 0.4, 0, 0.45, 0.25, { r: 0.04 });
    k.box('paper', 'paper', w * 0.6, 0.002, 0.3, 0, 0.75, 0.3, { r: 0, rx: 0.5 });
    k.box('display', 'screen-on-desktop', 0.1, 0.06, 0.002, w / 2 - 0.12, 0.98, 0.25, { r: 0, rx: -0.6 });
    return finish(k);
  },
});

/* ============================================================ mobile and gaming */

const tabletStand = cmp({
  id: 'cmp-tablet-on-stand', ko: '태블릿과 거치대', en: 'Tablet on desk stand',
  params: [SCREEN('nature'), P.bool('landscape', '가로', 'Landscape', true)],
  tags: ['tablet', 'ipad style', 'tablet stand', '태블릿', '태블릿 거치대', '패드'],
  build: (p, ctx) => {
    const k = new Kit(ctx), [w, h] = p.landscape ? [0.25, 0.175] : [0.175, 0.25], a = 0.3;
    k.box('base', 'metal-al-anodised-grey', 0.12, 0.008, 0.12, 0, 0.004, 0, { r: 0.004 });
    k.box('arm', 'metal-al-anodised-grey', 0.03, 0.1, 0.006, 0, 0.055, -0.03, { r: 0.002, rx: -0.3 });
    k.box('tablet', 'metal-al-anodised-grey', w, h, 0.006, 0, 0.08 + h / 2 * Math.cos(a), -Math.sin(a) * h / 2, { r: 0.008, rx: -a });
    k.box('screen', screenMat(p.screen), w - 0.012, h - 0.012, 0.001, 0, 0.08 + h / 2 * Math.cos(a) + 0.0035 * Math.sin(a), -Math.sin(a) * h / 2 + 0.0035 * Math.cos(a), { r: 0.006, rx: -a });
    return finish(k);
  },
});

const phoneStand = cmp({
  id: 'cmp-smartphone-dock', ko: '스마트폰과 무선 충전 거치대', en: 'Smartphone on wireless charging stand',
  params: [SCREEN('desktop'), P.color('phone', '폰 색', 'Phone colour', '#2b2b2b')],
  tags: ['smartphone', 'phone stand', 'wireless charger', '스마트폰', '휴대폰 거치대', '무선 충전기'],
  build: (p, ctx) => {
    const k = new Kit(ctx), a = 0.3;
    k.box('stand', 'plastic-abs-matte-white', 0.07, 0.012, 0.08, 0, 0.006, 0, { r: 0.006 });
    k.box('stand', 'plastic-abs-matte-white', 0.07, 0.1, 0.012, 0, 0.055, -0.02, { r: 0.006, rx: -a });
    k.box('phone', 'plastic-abs-gloss-black', 0.072, 0.152, 0.008, 0, 0.012 + 0.076 * Math.cos(a), -0.02 - Math.sin(a) * 0.076 + 0.01, { r: 0.01, rx: -a, ...C(p.phone) });
    k.box('screen', screenMat(p.screen), 0.066, 0.145, 0.001, 0, 0.012 + 0.076 * Math.cos(a) + 0.0045 * Math.sin(a), -0.02 - Math.sin(a) * 0.076 + 0.01 + 0.0045 * Math.cos(a), { r: 0.008, rx: -a });
    return finish(k);
  },
});

const ereader = cmp({
  id: 'cmp-e-reader-cover', ko: '전자책 단말기와 커버', en: 'E-reader with cover',
  params: [P.bool('open', '커버 열림', 'Cover open', true), P.color('cover', '커버 색', 'Cover colour', '#3a5a40')],
  tags: ['e-reader', 'ebook reader', 'e-ink', '전자책 단말기', '이북 리더', 'e잉크'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('device', 'plastic-abs-matte-black', 0.115, 0.008, 0.16, 0, 0.004, 0, { r: 0.006 });
    k.box('screen', 'screen-on-white', 0.09, 0.001, 0.12, 0, 0.0085, -0.008, { r: 0 });
    if (p.open) k.box('cover', 'leather-black', 0.12, 0.004, 0.165, -0.125, 0.002, 0, { r: 0.004, ...C(p.cover) });
    else k.box('cover', 'leather-black', 0.12, 0.004, 0.165, 0, 0.011, 0, { r: 0.004, ...C(p.cover) });
    return finish(k);
  },
});

const watchCharger = cmp({
  id: 'cmp-3in1-charging-station', ko: '3in1 충전 스테이션 (폰·시계·이어폰)', en: '3-in-1 charging station',
  params: [P.color('body', '색', 'Colour', '#f2f2f2')],
  tags: ['charging station', 'watch charger', 'earbuds charger', '충전 스테이션', '스마트워치 충전', '무선 충전'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('base', 'plastic-abs-matte-white', 0.18, 0.012, 0.1, 0, 0.006, 0, { r: 0.012, ...C(p.body) });
    k.box('stand', 'plastic-abs-matte-white', 0.07, 0.14, 0.012, -0.05, 0.08, -0.03, { r: 0.008, rx: -0.2, ...C(p.body) });
    k.box('phone', 'plastic-abs-gloss-black', 0.072, 0.15, 0.008, -0.05, 0.1, -0.015, { r: 0.01, rx: -0.2 });
    k.cyl('watch', 'plastic-abs-gloss-black', 0.02, 0.02, 0.06, 0.06, 0.012, -0.0, { rx: PI / 2, segs: 12 });
    k.box('watch', 'plastic-abs-gloss-black', 0.035, 0.042, 0.012, 0.06, 0.04, 0.02, { r: 0.008 });
    k.box('buds', 'plastic-abs-gloss-white', 0.05, 0.022, 0.04, 0.03, 0.023, 0.03, { r: 0.01 });
    return finish(k);
  },
});

const vr = cmp({
  id: 'cmp-vr-headset-stand', ko: 'VR 헤드셋과 컨트롤러 거치대', en: 'VR headset with controllers on stand',
  params: [P.color('body', '색', 'Colour', '#f2f2f2')],
  tags: ['vr headset', 'virtual reality', 'mixed reality', 'VR 헤드셋', '가상현실', 'VR 기기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.cyl('base', 'plastic-abs-matte-black', 0.08, 0.09, 0.015, 0, 0, 0, { segs: k.seg(24, 8) });
    k.cyl('post', 'plastic-abs-matte-black', 0.012, 0.012, 0.25, 0, 0.015, 0, { segs: 8 });
    k.box('headset', 'plastic-abs-gloss-white', 0.19, 0.1, 0.1, 0, 0.27, 0.04, { r: 0.04, ...C(p.body) });
    k.box('face', 'plastic-abs-matte-black', 0.17, 0.08, 0.004, 0, 0.27, 0.091, { r: 0.03 });
    k.add('strap', 'plastic-abs-matte-black', T(new THREE.TorusGeometry(0.09, 0.012, 6, k.seg(24, 8), PI), 0, 0.27, 0.0, PI / 2, 0, PI));
    for (const s of [-1, 1]) {
      k.add('controllers', 'plastic-abs-gloss-white', T(new THREE.TorusGeometry(0.035, 0.008, 6, 16), s * 0.1, 0.12, 0.02, PI / 2, 0, 0), C(p.body));
      k.cyl('controllers', 'plastic-abs-matte-black', 0.015, 0.012, 0.09, s * 0.1, 0.02, 0.02, { segs: 10 });
    }
    return finish(k);
  },
});

const console_ = cmp({
  id: 'cmp-game-console-vertical', ko: '게임 콘솔 (세로 거치)', en: 'Game console (standing)',
  params: [P.color('body', '색', 'Colour', '#f2f2f2'), P.int('pads', '패드 수', 'Controllers', 1, 0, 2)],
  tags: ['game console', 'video game', 'gaming console', '게임기', '콘솔 게임기', '비디오 게임'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('body', 'plastic-abs-gloss-white', 0.1, 0.39, 0.26, 0, 0.205, 0, { r: 0.02, ...C(p.body) });
    k.box('core', 'plastic-abs-gloss-black', 0.05, 0.38, 0.25, 0, 0.205, 0.006, { r: 0.01 });
    k.box('base', 'plastic-abs-matte-black', 0.14, 0.015, 0.1, 0, 0.0075, 0, { r: 0.008 });
    k.box('leds', 'led-blue', 0.003, 0.08, 0.002, 0.026, 0.3, 0.131, { r: 0 });
    for (let i = 0; i < p.pads; i++) {
      const x = 0.15 + i * 0.17;
      k.box('pads', 'plastic-abs-matte-white', 0.15, 0.03, 0.08, x, 0.015, 0.06, { r: 0.015 });
      for (const s of [-1, 1]) k.sphere('pads', 'plastic-abs-matte-white', 0.035, x + s * 0.055, 0.02, 0.1, { segs: 12, rings: 8, scale: [1, 0.6, 1] });
    }
    return finish(k);
  },
});

const handheld = cmp({
  id: 'cmp-handheld-gaming-pc', ko: '휴대용 게이밍 PC (핸드헬드)', en: 'Handheld gaming PC',
  params: [SCREEN('nature'), P.bool('dock', '독', 'In dock', false)],
  tags: ['handheld pc', 'portable console', 'steam deck style', '휴대용 게임기', '핸드헬드 PC', '게이밍 디바이스'],
  build: (p, ctx) => {
    const k = new Kit(ctx), a = p.dock ? 1.2 : 0.0;
    if (p.dock) k.box('dock', 'plastic-abs-matte-black', 0.12, 0.04, 0.1, 0, 0.02, 0, { r: 0.01 });
    const y0 = p.dock ? 0.03 : 0;
    k.box('body', 'plastic-abs-matte-black', 0.3, 0.12, 0.03, 0, y0 + (p.dock ? 0.06 * Math.sin(a) + 0.02 : 0.015), 0, { r: 0.03, rx: p.dock ? -(PI / 2 - a) : -PI / 2 });
    const off = p.dock ? 0.016 : 0.016;
    k.box('screen', screenMat(p.screen), 0.17, 0.1, 0.002, 0, y0 + (p.dock ? 0.06 * Math.sin(a) + 0.02 + Math.cos(a) * off * 0 : 0.0305), p.dock ? off * Math.sin(a) : 0, { r: 0.004, rx: p.dock ? -(PI / 2 - a) : -PI / 2 });
    return finish(k);
  },
});

const flightStick = cmp({
  id: 'cmp-hotas-flight-stick', ko: '비행 시뮬레이터 조이스틱 세트 (HOTAS)', en: 'HOTAS flight stick and throttle',
  params: [P.len('gap', '간격', 'Gap', 0.4, 0.2, 0.7)],
  tags: ['flight stick', 'hotas', 'joystick', 'flight simulator', '조이스틱', '비행 시뮬레이터', '스로틀'],
  build: (p, ctx) => {
    const k = new Kit(ctx), g = p.gap / 2;
    k.box('bases', 'metal-pc-black-matte', 0.18, 0.05, 0.2, g, 0.025, 0, { r: 0.015 });
    k.rod('stick', 'metal-chrome', [g, 0.05, 0], [g, 0.12, 0], 0.01, { segs: 8 });
    k.box('grip', 'plastic-abs-matte-black', 0.05, 0.16, 0.06, g, 0.2, 0.0, { r: 0.02, rx: 0.15 });
    k.box('bases', 'metal-pc-black-matte', 0.18, 0.06, 0.22, -g, 0.03, 0, { r: 0.015 });
    k.box('grip', 'plastic-abs-matte-black', 0.12, 0.08, 0.05, -g, 0.1, 0.02, { r: 0.02 });
    return finish(k);
  },
});

const wheel = cmp({
  id: 'cmp-racing-wheel-pedals', placement: 'floor', ko: '레이싱 휠과 페달 (스탠드)', en: 'Racing wheel and pedals on stand',
  params: [P.len('height', '휠 높이', 'Wheel height', 0.75, 0.6, 0.9), P.color('accent', '포인트 색', 'Accent', '#d9342b')],
  tags: ['racing wheel', 'sim racing', 'steering wheel', '레이싱 휠', '레이싱 시뮬레이터', '핸들 컨트롤러'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height;
    for (const sx of [-1, 1]) k.rod('stand', 'metal-pc-black-matte', [sx * 0.25, 0, -0.1], [sx * 0.2, H - 0.05, -0.1], 0.02, { segs: 8 });
    k.box('stand', 'metal-pc-black-matte', 0.6, 0.03, 0.7, 0, 0.015, 0.15, { r: 0.004 });
    k.box('stand', 'metal-pc-black-matte', 0.45, 0.03, 0.3, 0, H - 0.05, -0.1, { r: 0.004 });
    k.box('base', 'plastic-abs-matte-black', 0.2, 0.15, 0.22, 0, H + 0.03, -0.1, { r: 0.02 });
    k.add('wheel', 'leather-black', T(new THREE.TorusGeometry(0.15, 0.015, k.seg(8, 4), k.seg(32, 12)), 0, H + 0.08, 0.06, 0.3, 0, 0));
    k.box('wheel', 'metal-al-anodised-black', 0.24, 0.05, 0.015, 0, H + 0.08, 0.06, { r: 0.008, rx: 0.3 });
    k.box('accent', 'plastic-abs-gloss-red', 0.03, 0.01, 0.01, 0, H + 0.23, 0.11, { r: 0.002, rx: 0.3, ...C(p.accent) });
    for (let i = 0; i < 3; i++) k.box('pedals', 'metal-al-brushed', 0.06, 0.15, 0.015, -0.1 + i * 0.1, 0.1, 0.4, { r: 0.004, rx: -0.5 });
    return finish(k);
  },
});

/* ============================================================ maker / lab */

const sbc = cmp({
  id: 'cmp-single-board-computer-case', ko: '싱글 보드 컴퓨터 (케이스)', en: 'Single-board computer in case',
  params: [P.bool('open', '뚜껑 열림', 'Lid off', false), P.color('case', '케이스 색', 'Case colour', '#d9342b')],
  tags: ['single board computer', 'raspberry pi style', 'sbc', '싱글보드 컴퓨터', '라즈베리파이', '임베디드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('case', 'plastic-abs-gloss-red', 0.095, 0.02, 0.065, 0, 0.01, 0, { r: 0.006, ...C(p.case) });
    if (p.open) {
      k.box('board', 'plastic-abs-gloss-green', 0.085, 0.002, 0.056, 0, 0.021, 0, { r: 0, ...C('#1f6b3a') });
      k.box('chips', 'plastic-abs-matte-black', 0.015, 0.003, 0.015, -0.01, 0.023, 0, { r: 0 });
      k.box('ports', 'metal-chrome', 0.02, 0.014, 0.016, 0.035, 0.029, -0.015, { r: 0 });
      k.box('ports', 'metal-chrome', 0.02, 0.014, 0.016, 0.035, 0.029, 0.015, { r: 0 });
    } else k.box('lid', 'plastic-abs-gloss-white', 0.095, 0.006, 0.065, 0, 0.023, 0, { r: 0.006 });
    k.box('leds', 'led-green', 0.003, 0.002, 0.003, -0.04, 0.026, 0.025, { r: 0 });
    return finish(k);
  },
});

const breadboard = cmp({
  id: 'cmp-microcontroller-breadboard-kit', ko: '마이크로컨트롤러 브레드보드 실습 키트', en: 'Microcontroller breadboard kit',
  params: [P.int('wires', '점퍼선 수', 'Jumper wires', 8, 0, 20)],
  tags: ['breadboard', 'arduino style', 'electronics kit', '브레드보드', '아두이노', '전자 키트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('board', 'plastic-abs-matte-white', 0.165, 0.009, 0.055, 0, 0.0045, 0, { r: 0.002 });
    k.box('mcu', 'plastic-abs-gloss-blue', 0.068, 0.012, 0.053, -0.13, 0.006, 0, { r: 0.002, ...C('#1a6fb5') });
    k.box('chips', 'plastic-abs-matte-black', 0.02, 0.004, 0.008, -0.13, 0.014, 0, { r: 0 });
    const cols = ['#d9342b', '#2a7de1', '#e0b020', '#2fb04a', '#222222'];
    for (let i = 0; i < p.wires; i++) { const x = -0.07 + i * 0.008; k.tube('wires', 'plastic-abs-gloss-red', [[x, 0.01, -0.02], [x - 0.01, 0.03, 0], [x + 0.01, 0.01, 0.02]], 0.0008, { ...C(cols[i % cols.length]) }); }
    k.sphere('leds', 'led-red', 0.0025, 0.05, 0.013, 0.01, { segs: 8, rings: 6 });
    return finish(k);
  },
});

const soldering = cmp({
  id: 'cmp-soldering-station', ko: '인두기 스테이션', en: 'Soldering station',
  params: [P.bool('display', '온도 표시', 'Temperature display', true)],
  tags: ['soldering station', 'soldering iron', 'electronics repair', '인두기', '납땜', '전자 수리'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('body', 'plastic-abs-matte-black', 0.13, 0.1, 0.16, -0.08, 0.05, 0, { r: 0.01 });
    if (p.display) k.box('display', 'screen-on-dark', 0.06, 0.025, 0.002, -0.08, 0.07, 0.081, { r: 0 });
    k.cyl('knob', 'plastic-abs-gloss-red', 0.012, 0.012, 0.012, -0.08, 0.03, 0.08, { rx: PI / 2, segs: 12 });
    k.cyl('holder', 'metal-chrome', 0.03, 0.035, 0.012, 0.08, 0, 0, { segs: 14 });
    k.cyl('holder', 'metal-chrome', 0.015, 0.02, 0.08, 0.08, 0.012, 0, { rz: -0.6, segs: 12, open: true });
    k.rod('iron', 'plastic-abs-matte-black', [0.1, 0.03, 0], [0.18, 0.09, 0], 0.01, { segs: 8 });
    k.box('sponge', 'plastic-pu-foam', 0.04, 0.012, 0.04, 0.04, 0.006, 0.05, { r: 0.004, ...C('#e0b020') });
    k.tube('cable', 'rubber-black', [[-0.015, 0.04, 0.05], [0.05, 0.02, 0.08], [0.14, 0.06, 0.02]], 0.003);
    return finish(k);
  },
});

const scope = cmp({
  id: 'cmp-digital-oscilloscope', ko: '디지털 오실로스코프', en: 'Digital oscilloscope',
  params: [SCREEN('dark'), P.int('probes', '프로브 수', 'Probes', 2, 0, 4)],
  tags: ['oscilloscope', 'test equipment', 'electronics lab', '오실로스코프', '계측기', '전자 실험'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.32, h = 0.16, d = 0.13;
    k.box('body', 'plastic-abs-matte-grey', w, h, d, 0, h / 2 + 0.01, 0, { r: 0.01 });
    k.box('screen', screenMat(p.screen), 0.17, 0.11, 0.002, -0.06, h / 2 + 0.015, d / 2 + 0.001, { r: 0 });
    for (let i = 0; i < 8; i++) k.cyl('knobs', 'plastic-abs-matte-black', 0.008, 0.008, 0.01, 0.07 + (i % 3) * 0.03, 0.04 + Math.floor(i / 3) * 0.04, d / 2, { rx: PI / 2, segs: 10 });
    for (let i = 0; i < p.probes; i++) k.tube('probes', 'plastic-abs-gloss-yellow', [[0.08 + i * 0.02, 0.02, d / 2 + 0.01], [0.1 + i * 0.02, 0.005, d / 2 + 0.08], [0.0 + i * 0.03, 0.005, d / 2 + 0.15]], 0.002, { ...C(['#e0b020', '#2a7de1', '#d9342b', '#2fb04a'][i]) });
    for (const sx of [-1, 1]) k.box('feet', 'rubber-black', 0.03, 0.01, 0.03, sx * 0.12, 0.005, 0.04, { r: 0.004 });
    return finish(k);
  },
});

const benchPsu = cmp({
  id: 'cmp-bench-power-supply', ko: '직류 전원 공급기 (실험용)', en: 'Bench DC power supply',
  params: [P.bool('on', '켜짐', 'On', true)],
  tags: ['bench power supply', 'dc supply', 'lab power', '전원 공급기', '파워 서플라이', '실험용 전원'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.13, h = 0.16, d = 0.27;
    k.box('body', 'metal-pc-light-grey', w, h, d, 0, h / 2, 0, { r: 0.006 });
    for (let i = 0; i < 2; i++) k.box('display', p.on ? 'led-red' : 'screen-matte-off', 0.08, 0.025, 0.002, 0, h * 0.78 - i * 0.035, d / 2 + 0.001, { r: 0 });
    for (const x of [-0.03, 0.03]) k.cyl('knobs', 'plastic-abs-matte-black', 0.012, 0.012, 0.015, x, h * 0.42, d / 2, { rx: PI / 2, segs: 12 });
    for (const [x, c] of [[-0.03, '#d9342b'], [0.0, '#222222'], [0.03, '#2fb04a']]) k.cyl('jacks', 'plastic-abs-gloss-red', 0.006, 0.006, 0.012, x, h * 0.15, d / 2, { rx: PI / 2, segs: 10, ...C(c) });
    return finish(k);
  },
});

const multimeter = cmp({
  id: 'cmp-digital-multimeter', ko: '디지털 멀티미터', en: 'Digital multimeter',
  params: [P.color('boot', '보호 케이스 색', 'Boot colour', '#e0b020')],
  tags: ['multimeter', 'voltmeter', 'test meter', '멀티미터', '테스터기', '전압계'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('boot', 'plastic-abs-gloss-yellow', 0.09, 0.04, 0.18, 0, 0.02, 0, { r: 0.012, ...C(p.boot) });
    k.box('face', 'plastic-abs-matte-anthracite', 0.075, 0.002, 0.16, 0, 0.041, 0, { r: 0.006 });
    k.box('display', 'screen-on-white', 0.06, 0.001, 0.035, 0, 0.0425, -0.05, { r: 0 });
    k.cyl('dial', 'plastic-abs-matte-black', 0.022, 0.022, 0.008, 0, 0.042, 0.02, { segs: 16 });
    for (const [x, c] of [[-0.025, '#d9342b'], [0.025, '#111111']]) k.tube('leads', 'plastic-abs-gloss-red', [[x, 0.042, 0.075], [x * 2, 0.01, 0.15], [x * 4, 0.005, 0.25]], 0.0018, { ...C(c) });
    return finish(k);
  },
});

const resinPrinter = cmp({
  id: 'cmp-resin-3d-printer', ko: '레진 3D 프린터', en: 'Resin 3D printer',
  params: [P.color('lid', '덮개 색', 'Cover colour', '#e86a1c'), P.bool('cover', '덮개', 'UV cover on', true)],
  tags: ['resin printer', 'sla printer', 'msla', '레진 프린터', '광경화 3D 프린터', 'SLA'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.23, d = 0.23;
    k.box('base', 'metal-pc-black-matte', w, 0.12, d, 0, 0.06, 0, { r: 0.01 });
    k.box('display', 'screen-on-dark', 0.06, 0.04, 0.002, 0, 0.07, d / 2 + 0.001, { r: 0, rx: -0.3 });
    k.box('vat', 'metal-al-anodised-clear', w * 0.7, 0.04, d * 0.5, 0, 0.14, 0, { r: 0.004 });
    k.box('rail', 'metal-al-anodised-clear', 0.04, 0.3, 0.04, 0, 0.27, -d * 0.4, { r: 0.004 });
    k.box('plate', 'metal-al-brushed', w * 0.55, 0.012, d * 0.4, 0, 0.25, -0.02, { r: 0.002 });
    if (p.cover) k.box('cover', 'plastic-acrylic-amber', w, 0.3, d, 0, 0.27, 0, { r: 0.008, ...C(p.lid) });
    return finish(k);
  },
});

const testBench = cmp({
  id: 'cmp-open-air-test-bench', ko: '오픈형 테스트 벤치 PC', en: 'Open-air test bench PC',
  params: [P.bool('rgb', 'RGB', 'RGB lighting', true)],
  tags: ['test bench', 'open frame pc', 'overclocking', '테스트 벤치', '오픈 케이스', '오버클럭'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.36, d = 0.32;
    k.box('tray', 'metal-al-anodised-black', w, 0.006, d, 0, 0.06, 0, { r: 0.002 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('posts', 'metal-chrome', 0.006, 0.006, 0.06, sx * (w / 2 - 0.02), 0, sz * (d / 2 - 0.02), { segs: 8 });
    k.box('board', 'plastic-abs-matte-anthracite', 0.24, 0.004, 0.24, -0.03, 0.065, 0, { r: 0 });
    k.box('cooler', 'metal-al-brushed', 0.12, 0.15, 0.06, -0.04, 0.143, -0.04, { r: 0.004 });
    k.cyl('fans', p.rgb ? 'led-cyan' : 'plastic-abs-matte-black', 0.055, 0.055, 0.025, -0.04, 0.143, 0.0, { rx: PI / 2, segs: k.seg(20, 8), open: true });
    k.box('gpu', 'metal-al-anodised-black', 0.27, 0.05, 0.12, 0.0, 0.11, 0.08, { r: 0.006 });
    k.box('ram', 'plastic-abs-matte-black', 0.006, 0.035, 0.13, 0.05, 0.085, -0.05, { r: 0 });
    k.box('ram', 'plastic-abs-matte-black', 0.006, 0.035, 0.13, 0.06, 0.085, -0.05, { r: 0 });
    k.box('psu', 'metal-pc-black-matte', 0.15, 0.055, 0.14, 0, 0.0275, 0, { r: 0.004 });
    return finish(k);
  },
});

/* ============================================================ retro */

const crt = cmp({
  id: 'cmp-retro-crt-monitor', ko: '레트로 CRT 모니터', en: 'Retro CRT monitor',
  params: [P.len('size', '크기', 'Size', 0.38, 0.3, 0.5), SCREEN('dark')],
  tags: ['crt monitor', 'retro computer', 'vintage', 'CRT 모니터', '브라운관', '레트로'],
  build: (p, ctx) => {
    const k = new Kit(ctx), s = p.size;
    k.box('front', 'plastic-abs-matte-beige', s, s * 0.88, 0.06, 0, s * 0.44 + 0.04, s * 0.3, { r: 0.015 });
    k.box('screen', screenMat(p.screen), s * 0.8, s * 0.62, 0.004, 0, s * 0.48 + 0.04, s * 0.3 + 0.031, { r: 0.02 });
    k.box('body', 'plastic-abs-matte-beige', s * 0.8, s * 0.72, s * 0.6, 0, s * 0.4 + 0.04, -0.02, { r: 0.04 });
    k.box('stand', 'plastic-abs-matte-beige', s * 0.5, 0.04, s * 0.5, 0, 0.02, 0.05, { r: 0.01 });
    return finish(k);
  },
});

const beigePc = cmp({
  id: 'cmp-retro-beige-desktop', ko: '레트로 베이지 데스크톱 (가로형)', en: 'Retro beige desktop computer',
  params: [P.bool('floppy', '플로피 디스크', 'Floppy disk inserted', true)],
  tags: ['retro pc', 'beige box', '486', 'vintage computer', '레트로 PC', '베이지 컴퓨터', '추억의 컴퓨터'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.44, h = 0.15, d = 0.42;
    k.box('case', 'plastic-abs-matte-beige', w, h, d, 0, h / 2, 0, { r: 0.006 });
    for (let i = 0; i < 2; i++) { k.box('bays', 'plastic-abs-matte-beige', 0.15, 0.04, 0.004, w * 0.2, h * 0.7 - i * 0.05, d / 2 + 0.002, { r: 0.002, ...C('#d8cfbd') }); k.box('slots', 'plastic-black', 0.1, 0.004, 0.002, w * 0.2, h * 0.7 - i * 0.05, d / 2 + 0.004, { r: 0 }); }
    if (p.floppy) k.box('floppy', 'plastic-abs-matte-black', 0.09, 0.003, 0.05, w * 0.2, h * 0.7, d / 2 + 0.02, { r: 0.001 });
    k.box('leds', 'led-green', 0.006, 0.004, 0.002, -w * 0.3, h * 0.6, d / 2 + 0.001, { r: 0 });
    k.box('leds', 'led-amber', 0.006, 0.004, 0.002, -w * 0.3, h * 0.5, d / 2 + 0.001, { r: 0 });
    keyboard(k, 0.46, 0.18, 0, 0, d / 2 + 0.15, { mat: 'plastic-abs-matte-beige', keyMat: 'plastic-abs-matte-beige', rows: 6, tilt: 0.08 });
    return finish(k);
  },
});

const floppies = cmp({
  id: 'cmp-floppy-disk-box', ko: '플로피 디스크 보관함', en: 'Floppy disk box',
  params: [P.int('disks', '디스크 수', 'Disks', 10, 0, 20)],
  tags: ['floppy disk', 'diskette', 'retro storage', '플로피 디스크', '디스켓', '레트로 저장장치'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('box', 'plastic-acrylic-smoke', 0.105, 0.09, 0.16, 0, 0.045, 0, { r: 0.004 });
    const cols = ['#222222', '#2a5d9f', '#d9342b', '#e0b020', '#2fb04a'];
    for (let i = 0; i < p.disks; i++) k.box('disks', 'plastic-abs-matte-black', 0.09, 0.09, 0.003, 0, 0.05, -0.07 + i * 0.007, { r: 0.002, ...C(cols[i % cols.length]) });
    return finish(k);
  },
});

const retroConsole = cmp({
  id: 'cmp-retro-mini-console', ko: '레트로 미니 게임기', en: 'Retro mini game console',
  params: [P.color('body', '색', 'Colour', '#d8d4cc'), P.int('pads', '패드 수', 'Pads', 2, 0, 2)],
  tags: ['retro console', 'mini console', 'classic games', '레트로 게임기', '미니 게임기', '고전 게임'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('body', 'plastic-abs-matte-beige', 0.15, 0.05, 0.11, 0, 0.025, 0, { r: 0.008, ...C(p.body) });
    k.box('slot', 'plastic-abs-matte-black', 0.09, 0.006, 0.04, 0, 0.051, -0.01, { r: 0.002 });
    k.box('buttons', 'plastic-abs-gloss-red', 0.015, 0.006, 0.01, -0.04, 0.051, 0.035, { r: 0.002 });
    for (let i = 0; i < p.pads; i++) { k.box('pads', 'plastic-abs-matte-grey', 0.11, 0.018, 0.05, -0.08 + i * 0.16, 0.009, 0.15, { r: 0.008 }); k.box('pads', 'plastic-abs-gloss-red', 0.01, 0.004, 0.01, -0.06 + i * 0.16, 0.019, 0.15, { r: 0.002 }); }
    return finish(k);
  },
});

/* ============================================================ desk accessories */

const laptopStand = cmp({
  id: 'cmp-aluminium-laptop-riser', ko: '알루미늄 노트북 거치대', en: 'Aluminium laptop riser',
  params: [P.len('height', '높이', 'Height', 0.15, 0.08, 0.25), P.bool('laptop', '노트북 올림', 'With laptop', true)],
  tags: ['laptop stand', 'laptop riser', 'ergonomic', '노트북 거치대', '노트북 스탠드', '거북목 방지'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height, a = 0.3;
    for (const sx of [-1, 1]) k.box('stand', 'metal-al-anodised-clear', 0.012, h, 0.22, sx * 0.1, h / 2, 0, { r: 0.004 });
    k.box('stand', 'metal-al-anodised-clear', 0.24, 0.006, 0.24, 0, h, 0, { r: 0.004, rx: a });
    if (p.laptop) {
      const lk = new Kit(ctx);
      const base = 0.015, w = 0.3, d = 0.21;
      lk.box('base', 'metal-al-anodised-grey', w, base, d, 0, base / 2, 0, { r: 0.004 });
      lk.box('lid', 'metal-al-anodised-grey', w, d, 0.006, 0, base + d / 2 * Math.cos(0.3), -d / 2 - Math.sin(0.3) * d / 2, { r: 0.004, rx: -0.3 });
      lk.box('screen', 'screen-on-desktop', w - 0.016, d - 0.02, 0.0015, 0, base + d / 2 * Math.cos(0.3) + 0.004 * Math.sin(0.3), -d / 2 - Math.sin(0.3) * d / 2 + 0.004 * Math.cos(0.3), { r: 0, rx: -0.3 });
      for (const part of lk.parts.values()) for (const g of part.geos) { g.rotateX(a); g.translate(0, h + 0.004, 0); k.add(part.role, part.mat, g, { uv: 'keep' }); }
    }
    return finish(k);
  },
});

const verticalStand = cmp({
  id: 'cmp-vertical-laptop-holder', ko: '노트북 세로 거치대 (클램쉘)', en: 'Vertical laptop holder',
  params: [P.int('slots', '슬롯 수', 'Slots', 1, 1, 3)],
  tags: ['vertical laptop stand', 'clamshell mode', 'laptop dock', '세로 거치대', '노트북 스탠드', '클램쉘'],
  build: (p, ctx) => {
    const k = new Kit(ctx), n = p.slots, w = n * 0.03 + 0.02;
    k.box('base', 'metal-al-anodised-grey', w, 0.03, 0.12, 0, 0.015, 0, { r: 0.006 });
    for (let i = 0; i < n; i++) k.box('laptops', 'metal-al-anodised-grey', 0.017, 0.22, 0.31, -w / 2 + 0.025 + i * 0.03, 0.02 + 0.11, 0, { r: 0.004 });
    return finish(k);
  },
});

const laptopBag = cmp({
  id: 'cmp-laptop-messenger-bag', placement: 'floor', ko: '노트북 가방 (메신저백)', en: 'Laptop messenger bag',
  params: [P.mat('fabric', '천', 'Fabric', 'fabric-canvas-black', 'fabric')],
  tags: ['laptop bag', 'messenger bag', 'computer bag', '노트북 가방', '메신저백', '서류 가방'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.42, h = 0.32, d = 0.1;
    k.soft('bag', p.fabric, w, h, d, 0.02, 0, h / 2, 0, { puff: 0.01 });
    k.soft('flap', p.fabric, w, h * 0.7, 0.02, 0.01, 0, h * 0.62, d / 2 + 0.01, { puff: 0.004 });
    k.tube('strap', p.fabric, [[-w / 2, h * 0.9, 0], [-w / 4, h + 0.25, 0], [w / 4, h + 0.25, 0], [w / 2, h * 0.9, 0]], 0.012);
    return finish(k);
  },
});

const headphoneStand = cmp({
  id: 'cmp-wooden-headphone-stand', ko: '원목 헤드폰 스탠드', en: 'Wooden headphone stand',
  params: [P.mat('wood', '목재', 'Wood', 'wood-am-walnut-oil', 'wood'), P.bool('headphones', '헤드폰', 'Headphones', true)],
  tags: ['headphone stand', 'headphones', 'studio headphones', '헤드폰 스탠드', '헤드폰 거치대', '헤드폰'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('base', p.wood, 0.12, 0.02, 0.12, 0, 0.01, 0, { r: 0.006 });
    k.box('post', p.wood, 0.03, 0.26, 0.03, 0, 0.15, 0, { r: 0.004 });
    k.box('top', p.wood, 0.03, 0.03, 0.12, 0, 0.28, 0, { r: 0.012 });
    if (p.headphones) {
      k.add('band', 'leather-black', T(new THREE.TorusGeometry(0.08, 0.01, 6, k.seg(24, 10), PI), 0, 0.21, 0, 0, PI / 2, 0));
      for (const s of [-1, 1]) k.cyl('cups', 'plastic-abs-matte-black', 0.045, 0.045, 0.03, 0, 0.2, s > 0 ? 0.08 - 0.03 + 0.03 : -0.08, { rx: PI / 2, segs: k.seg(20, 8) });
    }
    return finish(k);
  },
});

const cableBox = cmp({
  id: 'cmp-cable-management-box', placement: 'floor', ko: '멀티탭 정리함', en: 'Cable management box',
  params: [P.len('length', '길이', 'Length', 0.4, 0.3, 0.6), P.color('box', '색', 'Colour', '#f2f2f2')],
  tags: ['cable box', 'power strip box', 'cord organizer', '멀티탭 정리함', '전선 정리함', '케이블 박스'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length;
    k.box('box', 'plastic-abs-matte-white', L, 0.13, 0.16, 0, 0.065, 0, { r: 0.012, ...C(p.box) });
    for (const sx of [-1, 1]) { k.box('slots', 'plastic-black', 0.004, 0.04, 0.05, sx * (L / 2 + 0.0005), 0.05, 0, { r: 0 }); k.tube('cables', 'rubber-black', [[sx * L / 2, 0.05, 0], [sx * (L / 2 + 0.08), 0.02, 0.03], [sx * (L / 2 + 0.15), 0.004, -0.02]], 0.004); }
    return finish(k);
  },
});

const monitorLight = cmp({
  id: 'cmp-monitor-light-bar', ko: '모니터 라이트 바와 모니터', en: 'Monitor with screen light bar',
  params: [SCREEN('dark'), P.bool('on', '라이트 켜짐', 'Light on', true)],
  tags: ['monitor light bar', 'screenbar', 'desk lighting', '모니터 조명', '스크린바', '모니터 라이트'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.6, h = 0.34, cy = 0.33;
    monitor(k, w, h, cy, { screen: p.screen, stand: 'foot' });
    k.cyl('bar', 'metal-al-anodised-black', 0.012, 0.012, 0.45, 0.225, cy + h / 2 + 0.025, -0.0, { rz: PI / 2, segs: 10 });
    k.box('lens', p.on ? 'light-neutral' : 'plastic-acrylic-opal', 0.42, 0.003, 0.012, 0, cy + h / 2 + 0.015, 0.005, { r: 0 });
    k.light(0, cy + h / 2 + 0.01, 0.03, { intensity: p.on ? 0.3 : 0, distance: 1.5, type: 'spot', angle: 0.8, color: '#fff2dc' });
    return finish(k);
  },
});

const docHolder = cmp({
  id: 'cmp-document-holder-copyholder', ko: '문서 거치대 (타이핑용)', en: 'Typing document holder',
  params: [P.num('angle', '각도', 'Angle', 0.35, 0.15, 0.7, 0.01)],
  tags: ['document holder', 'copy holder', 'typing stand', '문서 거치대', '독서대', '타이핑 받침'],
  build: (p, ctx) => {
    const k = new Kit(ctx), a = p.angle;
    k.box('board', 'plastic-abs-matte-black', 0.33, 0.24, 0.006, 0, Math.cos(a) * 0.12 + 0.02, -Math.sin(a) * 0.12, { r: 0.008, rx: -a });
    k.box('paper', 'paper', 0.21, 0.23, 0.001, 0, Math.cos(a) * 0.125 + 0.025, -Math.sin(a) * 0.125 + 0.0035, { r: 0, rx: -a });
    k.box('ledge', 'plastic-abs-matte-black', 0.33, 0.02, 0.03, 0, 0.02, 0.01, { r: 0.004 });
    k.box('stand', 'plastic-abs-matte-black', 0.2, 0.006, 0.2, 0, 0.003, -0.08, { r: 0.004 });
    return finish(k);
  },
});

const smartDisplay = cmp({
  id: 'cmp-smart-display-speaker', ko: '스마트 디스플레이 (AI 스피커)', en: 'Smart display speaker',
  params: [SCREEN('nature'), P.color('fabric', '패브릭 색', 'Fabric colour', '#d6d2c8')],
  tags: ['smart display', 'ai speaker', 'voice assistant', '스마트 디스플레이', 'AI 스피커', '음성 비서'],
  build: (p, ctx) => {
    const k = new Kit(ctx), a = 0.25;
    k.box('base', 'fabric-felt-natural', 0.18, 0.07, 0.08, 0, 0.035, -0.02, { r: 0.03, ...C(p.fabric) });
    k.box('panel', 'plastic-abs-matte-white', 0.18, 0.12, 0.012, 0, 0.1, 0.02, { r: 0.01, rx: -a });
    k.box('screen', screenMat(p.screen), 0.165, 0.1, 0.001, 0, 0.1 + 0.0065 * Math.sin(a), 0.02 + 0.0065 * Math.cos(a), { r: 0.006, rx: -a });
    return finish(k);
  },
});

const earbuds = cmp({
  id: 'cmp-wireless-earbuds-case', ko: '무선 이어폰과 충전 케이스', en: 'Wireless earbuds in charging case',
  params: [P.bool('open', '케이스 열림', 'Case open', true), P.color('body', '색', 'Colour', '#f2f2f2')],
  tags: ['wireless earbuds', 'true wireless', 'charging case', '무선 이어폰', '블루투스 이어폰', '이어버드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('case', 'plastic-abs-gloss-white', 0.06, 0.03, 0.025, 0, 0.015, 0, { r: 0.012, ...C(p.body) });
    if (p.open) {
      k.box('lid', 'plastic-abs-gloss-white', 0.06, 0.018, 0.025, 0, 0.032 + 0.0125, -0.0125, { r: 0.009, rx: -PI / 2 + 0.3, ...C(p.body) });
      for (const s of [-1, 1]) k.sphere('buds', 'plastic-abs-gloss-white', 0.009, s * 0.014, 0.03, 0.002, { segs: 10, rings: 8, ...C(p.body) });
    } else k.box('lid', 'plastic-abs-gloss-white', 0.06, 0.012, 0.025, 0, 0.036, 0, { r: 0.008, ...C(p.body) });
    k.box('leds', 'led-green', 0.002, 0.003, 0.001, 0, 0.012, 0.0126, { r: 0 });
    return finish(k);
  },
});

export const ITEMS = [
  smartDisplay, earbuds,
  extHdd, portableSsd, ...nases, usbHub, dock, cardReader, kvm, deskUps, surge,
  router, mesh, modem, desktopSwitch, ap, poe,
  ...printers, flatbed, docScanner, labelPrinter, receipt, plotter,
  tabletStand, phoneStand, ereader, watchCharger, vr, console_, handheld, flightStick, wheel,
  sbc, breadboard, soldering, scope, benchPsu, multimeter, resinPrinter, testBench,
  crt, beigePc, floppies, retroConsole,
  laptopStand, verticalStand, laptopBag, headphoneStand, cableBox, monitorLight, docHolder,
];
