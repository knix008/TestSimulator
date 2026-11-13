// Server room (서버실) category, part 1: 19-inch rack equipment and complete racks. Every device is
// drawn by device() (front face details from its kind: drive bays, ports, LEDs, vents, displays),
// racks by rackShell() + fill(); a rack item is a typical configuration (web servers, storage, core
// network, GPU, blades, backup, patching, UPS …) or a frame / wall cabinet / row / containment pod.
// Units metres, Y up, front +Z, origin bottom centre (finish() centres every build); 1U = 44.45 mm.
import { THREE, Kit, P, T, frameShape, clamp } from './helpers.js';
import { finish } from './kitchen.js';
import { mk } from './appliances-more.js';
import { C } from './accessories-plus.js';

const PI = Math.PI;
export const U = 0.0445;
export const SRV = 'serverroom';
/** A server-room entry: floor placement unless stated. */
export const srv = (def) => mk({ category: SRV, placement: 'floor', ...def });

const DW = 0.44; // device body width (between the rack ears)

/** n small boxes in a row along x centred at x on a face at zf (front-facing), size sw × sh. */
export function row(k, role, mat, n, x, y, zf, pitch, sw, sh = sw) {
  for (let i = 0; i < n; i++) k.box(role, mat, sw, sh, 0.003, x + (i - (n - 1) / 2) * pitch, y, zf + 0.0015, { r: 0 });
}

/**
 * One rack-mount device of `u` units: bottom at y, front face at zf, centred on x, `depth` deep.
 * lite = fewer face details (used inside full racks to stay in the triangle budget).
 */
export function device(k, kind, x, y, zf, u, { depth = 0.7, lite = false, color } = {}) {
  const h = u * U - 0.002, cy = y + h / 2, f = zf;
  // inside full racks every device shares a few materials (mesh budget: one mesh per role + material)
  const LITE = { 'metal-pc-light-grey': 'metal-pc-anthracite', 'metal-pc-red': 'metal-pc-anthracite', 'led-amber': 'led-green', 'led-blue': 'led-green', 'metal-chrome': 'plastic-black', 'plastic-abs-gloss-blue': 'plastic-black', paper: 'metal-pc-anthracite' };
  const m = (mat) => (lite ? LITE[mat] ?? mat : mat);
  const kk = lite ? { box: (role, mat, ...a) => k.box(role === 'labels' ? 'bezel' : role === 'handles' && m(mat) === 'plastic-black' ? 'ports' : role, m(mat), ...a), cyl: (role, mat, ...a) => k.cyl(role, m(mat), ...a) } : k;
  const body = (mat = 'metal-pc-black-matte') => kk.box('chassis', mat, DW, h, depth, x, cy, f - depth / 2 - 0.01, { r: 0.001, ...(color ? C(color) : {}) });
  const ears = () => { for (const s of [-1, 1]) kk.box('chassis', 'metal-pc-black-matte', 0.022, h, 0.004, x + s * (DW / 2 + 0.011), cy, f - 0.002, { r: 0 }); };
  const bezel = (w = DW, mat = 'metal-pc-anthracite', xo = 0) => kk.box('bezel', mat, w, h - 0.002, 0.01, x + xo, cy, f - 0.005, { r: 0.001 });
  const led = (dx, dy = 0, mat = 'led-green') => kk.box('leds', mat, 0.004, 0.004, 0.002, x + dx, cy + dy, f + 0.001, { r: 0 });
  const bays = (cols, rows, w, hh, x0 = 0, pitchX = null) => {
    const px = pitchX ?? w + 0.002, py = (h - 0.008) / rows;
    const cc = lite ? Math.max(1, Math.ceil(cols / 4)) : cols;
    const ww = lite ? (px * cols) / cc - 0.002 : w;
    const ppx = lite ? (px * cols) / cc : px;
    for (let r = 0; r < rows; r++) row(kk, 'bays', 'plastic-abs-matte-grey', cc, x + x0, y + 0.004 + py * (r + 0.5), f, ppx, ww, Math.min(hh, py - 0.002));
  };
  const ports = (n, rows, x0 = 0, pitch = 0.0145, mat = 'plastic-black') => {
    const nn = lite ? Math.max(1, Math.ceil(n / 6)) : n;
    const pp = lite ? (pitch * n) / nn : pitch, sw = lite ? pp - 0.002 : 0.011;
    for (let r = 0; r < rows; r++) row(kk, 'ports', mat, nn, x + x0, cy + (rows > 1 ? (r - (rows - 1) / 2) * 0.014 : 0), f, pp, sw, 0.0095);
  };
  const vents = (w, hh, xo = 0, yo = 0) => kk.box('mesh', 'metal-pc-black-perforated', w, hh, 0.003, x + xo, cy + yo, f + 0.0005, { r: 0 });
  const handles = () => { for (const s of [-1, 1]) kk.box('handles', 'metal-chrome', 0.012, Math.min(h - 0.006, 0.06), 0.012, x + s * (DW / 2 - 0.004), cy, f + 0.008, { r: 0.002 }); };
  switch (kind) {
    case 'server1u': body(); ears(); bezel(); bays(10, 1, 0.03, 0.03, -0.04); vents(0.05, h - 0.012, 0.18); led(0.21, 0, 'led-blue'); led(0.205, 0.008); break;
    case 'server2u': body(); ears(); bezel(); bays(12, 2, 0.028, 0.03, -0.02); vents(0.06, h - 0.02, 0.18); led(-0.205, 0.02, 'led-blue'); led(-0.205, 0); handles(); break;
    case 'storage2u': body(); ears(); bezel(); bays(4, 3, 0.1, 0.026); led(-0.21, 0, 'led-blue'); handles(); break;
    case 'storage4u': body(); ears(); bezel(); bays(4, 6, 0.1, 0.026); led(-0.21, 0.05, 'led-blue'); handles(); break;
    case 'gpu4u': body(); ears(); bezel(); vents(0.34, h - 0.03, 0.03); bays(2, 4, 0.03, 0.035, -0.19); led(0.2, 0.06, 'led-blue'); handles(); break;
    case 'blade': {
      body(); ears(); const n = lite ? 4 : 16;
      for (let i = 0; i < n; i++) kk.box('bays', 'plastic-abs-matte-grey', DW / n - 0.003, h * 0.62, 0.006, x - DW / 2 + (i + 0.5) * (DW / n), y + h * 0.36, f - 0.002, { r: 0 });
      vents(DW - 0.02, h * 0.28, 0, h * 0.33); led(-0.2, h * 0.45, 'led-blue'); handles(); break;
    }
    case 'switch1u': body(); ears(); bezel(DW, 'metal-pc-light-grey'); ports(24, 2, -0.04); ports(4, 1, 0.17, 0.016, 'metal-chrome'); led(-0.2, 0.006); led(-0.2, -0.006, 'led-amber'); break;
    case 'switch-core': {
      body(); ears(); const slots = Math.max(2, Math.floor(u / 2) - 1);
      for (let i = 0; i < slots; i++) {
        const sy = y + 0.02 + i * ((h - 0.08) / slots);
        kk.box('bezel', 'metal-pc-anthracite', DW - 0.02, (h - 0.08) / slots - 0.004, 0.01, x, sy + ((h - 0.08) / slots) / 2, f - 0.005, { r: 0.001 });
        row(kk, 'ports', 'plastic-black', lite ? 4 : 24, x - 0.02, sy + ((h - 0.08) / slots) / 2, f, lite ? 0.08 : 0.0145, lite ? 0.075 : 0.011, 0.0095);
      }
      vents(DW - 0.02, 0.05, 0, h / 2 - 0.03); handles(); break;
    }
    case 'patch': bezel(DW + 0.044, 'metal-pc-black-matte'); ports(24, u > 1 ? 2 : 1, 0, 0.0165); kk.box('labels', 'paper', DW - 0.02, 0.006, 0.001, x, cy + h * 0.38, f + 0.001, { r: 0 }); break;
    case 'fibre': body(); bezel(DW + 0.044, 'metal-pc-black-matte'); ports(24, u > 1 ? 2 : 1, 0, 0.016, 'plastic-abs-gloss-blue'); break;
    case 'cablemgr': {
      bezel(DW + 0.044, 'metal-pc-black-matte');
      const n = lite ? 3 : 6;
      for (let i = 0; i < n; i++) kk.box('handles', 'plastic-black', 0.012, h * 0.8, 0.06, x - DW / 2 + 0.03 + i * ((DW - 0.06) / (n - 1)), cy, f + 0.03, { r: 0.004 });
      break;
    }
    case 'brush': bezel(DW + 0.044, 'metal-pc-black-matte'); kk.box('ports', 'plastic-black', DW - 0.04, 0.01, 0.006, x, cy, f + 0.002, { r: 0 }); break;
    case 'blank': bezel(DW + 0.044, 'metal-pc-black-matte'); break;
    case 'ups': body(); ears(); bezel(); vents(0.28, h - 0.02, -0.06); kk.box('display', 'screen-on-dark', 0.07, Math.min(0.03, h - 0.02), 0.002, x + 0.15, cy + h * 0.15, f + 0.001, { r: 0 }); led(0.12, -h * 0.25); led(0.13, -h * 0.25, 'led-amber'); handles(); break;
    case 'battery': body(); ears(); bezel(); vents(0.36, h - 0.02); handles(); break;
    case 'kvm': body(); ears(); bezel(DW, 'metal-pc-anthracite'); kk.box('handles', 'metal-chrome', 0.2, 0.01, 0.015, x, cy, f + 0.008, { r: 0.004 }); led(0.2, 0); break;
    case 'shelf': {
      for (const s of [-1, 1]) kk.box('chassis', 'metal-pc-black-matte', 0.022, h, 0.004, x + s * (DW / 2 + 0.011), cy, f - 0.002, { r: 0 });
      kk.box('chassis', 'metal-pc-black-matte', DW, 0.003, depth * 0.6, x, y + 0.0015, f - depth * 0.3, { r: 0 });
      kk.box('chassis', 'metal-pc-black-matte', DW, h, 0.003, x, cy, f - 0.003, { r: 0 });
      break;
    }
    case 'fan': body(); ears(); bezel(); for (let i = 0; i < 4; i++) kk.cyl('mesh', 'metal-pc-black-perforated', h * 0.4, h * 0.4, 0.003, x - 0.15 + i * 0.1, cy, f, { rx: PI / 2, segs: k.seg(16, 6) }); led(0.21, 0); break;
    case 'firewall': body(); ears(); bezel(DW, 'metal-pc-red'); ports(8, 1, 0.02); ports(2, 1, 0.16, 0.016, 'metal-chrome'); kk.box('display', 'screen-on-dark', 0.05, 0.012, 0.002, x - 0.16, cy, f + 0.001, { r: 0 }); led(-0.2, 0); break;
    case 'router': body(); ears(); bezel(); for (let i = 0; i < 2; i++) { kk.box('bezel', 'metal-pc-light-grey', 0.19, h * 0.4, 0.01, x - 0.1 + i * 0.2, cy, f - 0.003, { r: 0.001 }); row(kk, 'ports', 'plastic-black', lite ? 2 : 8, x - 0.1 + i * 0.2, cy, f + 0.002, lite ? 0.09 : 0.02, lite ? 0.08 : 0.012, 0.0095); } led(-0.21, h * 0.3); handles(); break;
    case 'tape': body(); ears(); bezel(); kk.box('display', 'screen-on-dark', 0.08, 0.05, 0.002, x + 0.15, cy + h * 0.25, f + 0.001, { r: 0 }); for (let i = 0; i < 2; i++) kk.box('bays', 'plastic-abs-matte-grey', 0.16, h * 0.7, 0.006, x - 0.15 + i * 0.17, cy, f - 0.002, { r: 0.002 }); led(0.12, -h * 0.3); handles(); break;
    case 'pdu': bezel(DW + 0.044, 'metal-pc-black-matte'); for (let i = 0; i < (lite ? 4 : 8); i++) kk.box('ports', 'plastic-black', 0.03, h * 0.7, 0.004, x - 0.17 + i * (lite ? 0.11 : 0.045), cy, f + 0.002, { r: 0 }); led(0.2, 0, 'led-blue'); break;
    case 'console': body(); ears(); bezel(); ports(16, 1, 0.02, 0.016); led(-0.2, 0); break;
    case 'nas': body(); ears(); bezel(); bays(4, 1, 0.08, h - 0.012, -0.03, 0.084); led(0.2, 0, 'led-blue'); led(0.2, -0.008); break;
    case 'simple': bezel(DW + 0.044); kk.box('bays', 'plastic-abs-matte-grey', DW * 0.6, h * 0.5, 0.003, x - 0.05, cy, f + 0.001, { r: 0 }); led(0.2, 0); break;
    default: body(); ears(); bezel(); break;
  }
}

/**
 * Rack cabinet: floor-standing (h units + top/base) or a frame; returns { y0, zf } — the bottom of
 * the first U and the plane of the device fronts. Doors 'glass' | 'mesh' | 'open'.
 */
export function rackShell(k, { units = 42, w = 0.6, d = 1.0, body = 'metal-pc-black-matte', door = 'mesh', sides = true, rear = true, feet = 'castors', top = 'vented' } = {}) {
  const t = 0.02, base = 0.1, h = units * U + base + 0.07;
  k.box('rack', body, w, t, d, 0, h - t / 2, 0, { r: 0.002 });
  if (top === 'fans') for (const z of [-d * 0.2, d * 0.2]) k.cyl('mesh', 'metal-pc-black-perforated', 0.06, 0.06, 0.003, 0, h, z, { segs: k.seg(16, 6) });
  k.box('rack', body, w, base * 0.5, d, 0, base * 0.5, 0, { r: 0.002 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('rack', body, 0.03, h - base * 0.5, 0.03, sx * (w / 2 - 0.015), (h + base * 0.5) / 2, sz * (d / 2 - 0.015), { r: 0.002 });
  if (sides) for (const sx of [-1, 1]) k.box('rack', body, 0.008, h - base, d - 0.06, sx * (w / 2 - 0.004), h / 2 + base / 4, 0, { r: 0 });
  // 19" rails
  const zf = d / 2 - 0.08;
  for (const sx of [-1, 1]) for (const z of [zf, -d / 2 + 0.12]) k.box('rack', body, 0.016, units * U, 0.02, sx * (DW / 2 + 0.03), base + (units * U) / 2, z - 0.01, { r: 0 });
  if (feet === 'castors') for (const sx of [-1, 1]) for (const sz of [-1, 1]) { k.cyl('feet', 'rubber-black', 0.03, 0.03, 0.025, sx * (w / 2 - 0.06) + 0.0125, 0.03, sz * (d / 2 - 0.06), { rz: PI / 2, segs: k.seg(12, 6) }); }
  else for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('feet', 'metal-chrome', 0.02, 0.025, 0.02, sx * (w / 2 - 0.04), 0, sz * (d / 2 - 0.04), { segs: 8 });
  const doorAt = (z, kind) => {
    if (kind === 'open') return;
    k.panel('rack', body, frameShape(w, h - base * 0.5, 0.045, 0.06), 0.018, 0, (h + base * 0.5) / 2, z);
    k.box(kind === 'glass' ? 'glass' : 'mesh', kind === 'glass' ? 'glass-tint-smoke-dark' : 'metal-pc-black-perforated', w - 0.08, h - base * 0.5 - 0.11, 0.004, 0, (h + base * 0.5) / 2, z, { r: 0 });
    k.box('handles', 'metal-chrome', 0.02, 0.18, 0.02, w / 2 - 0.035, h * 0.55, z + Math.sign(z) * 0.015, { r: 0.004 });
  };
  doorAt(d / 2 - 0.009, door);
  if (rear) doorAt(-d / 2 + 0.009, door === 'glass' ? 'mesh' : door);
  return { y0: base, zf, h };
}

/** Fills a rack from the bottom with [kind, units] entries (repeating the list until `units` is used). */
export function fill(k, list, y0, zf, units, { depth = 0.7, lite = true, fillRatio = 1, blanks = true, simple = false } = {}) {
  let used = 0, i = 0;
  const limit = Math.round(units * clamp(fillRatio, 0, 1));
  while (used < limit && list.length) {
    const [kind, u] = list[i % list.length];
    if (used + u > units) break;
    if (kind !== 'gap') device(k, simple && !['patch', 'cablemgr', 'blank', 'brush'].includes(kind) ? 'simple' : kind, 0, y0 + used * U, zf, u, { depth, lite });
    used += u; i++;
  }
  if (blanks && used < units) device(k, 'blank', 0, y0 + used * U, zf, Math.min(units - used, 4), { lite: true });
}

/* ============================================================ single devices (placed on a shelf or bench) */

const DEVICES = [
  ['server1u', 1, '1U 랙 서버', '1U rack server', ['1u server', 'rack server', 'pizza box', '1U 서버', '랙 서버'], 0.75],
  ['server2u', 2, '2U 랙 서버', '2U rack server', ['2u server', 'rack server', 'database server', '2U 서버', '랙 서버'], 0.75],
  ['storage2u', 2, '2U 스토리지 서버', '2U storage server', ['storage server', 'disk shelf', '2U 스토리지', '스토리지 서버'], 0.7],
  ['storage4u', 4, '4U 디스크 어레이', '4U disk array', ['disk array', 'jbod', 'san', '디스크 어레이', '스토리지', 'JBOD'], 0.8],
  ['gpu4u', 4, '4U GPU 서버', '4U GPU server', ['gpu server', 'ai server', 'deep learning', 'GPU 서버', 'AI 서버', '딥러닝 서버'], 0.85],
  ['blade', 10, '블레이드 섀시 (10U)', 'Blade chassis (10U)', ['blade chassis', 'blade server', 'enclosure', '블레이드 섀시', '블레이드 서버'], 0.85],
  ['switch1u', 1, '48포트 네트워크 스위치', '48-port network switch', ['network switch', 'ethernet switch', 'top of rack', '스위치', '네트워크 스위치', 'L2 스위치'], 0.35],
  ['switch-core', 14, '코어 스위치 섀시 (14U)', 'Core switch chassis (14U)', ['core switch', 'chassis switch', 'backbone', '코어 스위치', '백본 스위치', 'L3 스위치'], 0.6],
  ['patch', 1, '24포트 패치 패널', '24-port patch panel', ['patch panel', 'rj45 patch', 'cat6', '패치 패널', '랜 패치 패널'], 0.12],
  ['patch', 2, '48포트 패치 패널', '48-port patch panel', ['patch panel', '48 port', 'cat6a', '48포트 패치 패널', '패치 패널'], 0.12],
  ['fibre', 1, '광 패치 패널 (LC)', 'Fibre patch panel (LC)', ['fibre patch', 'fiber enclosure', 'lc', '광 패치 패널', '광 분배함', 'FDF'], 0.3],
  ['cablemgr', 1, '1U 수평 케이블 정리대', '1U horizontal cable manager', ['cable manager', 'cable organizer', 'd-ring', '케이블 정리대', '수평 케이블 정리'], 0.1],
  ['cablemgr', 2, '2U 수평 케이블 정리대', '2U horizontal cable manager', ['cable manager', '2u', 'finger duct', '2U 케이블 정리대', '케이블 정리'], 0.1],
  ['brush', 1, '브러시 패널', 'Brush strip panel', ['brush panel', 'cable pass-through', '브러시 패널', '케이블 인입 패널'], 0.05],
  ['blank', 1, '블랭크 패널 (1U)', 'Blanking panel (1U)', ['blanking panel', 'filler panel', 'airflow', '블랭크 패널', '공기 흐름 차단'], 0.02],
  ['ups', 2, '2U 랙형 UPS', '2U rack UPS', ['rack ups', 'uninterruptible power', '랙형 UPS', '무정전 전원장치', 'UPS'], 0.6],
  ['ups', 3, '3U 랙형 UPS', '3U rack UPS', ['rack ups', '3u ups', 'online ups', '3U UPS', '무정전 전원장치'], 0.65],
  ['battery', 2, 'UPS 확장 배터리 팩', 'UPS extended battery pack', ['battery pack', 'ebm', 'ups battery', '배터리 팩', 'UPS 배터리'], 0.6],
  ['kvm', 1, '1U KVM 콘솔 서랍', '1U KVM console drawer', ['kvm drawer', 'rack console', 'lcd kvm', 'KVM 콘솔', '랙 콘솔', 'KVM 서랍'], 0.65],
  ['shelf', 2, '랙 선반 (고정형)', 'Fixed rack shelf', ['rack shelf', 'cantilever shelf', '랙 선반', '고정 선반'], 0.5],
  ['fan', 1, '랙 팬 트레이', 'Rack fan tray', ['fan tray', 'rack fan', 'cooling', '팬 트레이', '랙 쿨링 팬'], 0.3],
  ['firewall', 1, '방화벽 어플라이언스', 'Firewall appliance', ['firewall', 'utm', 'security appliance', '방화벽', 'UTM', '보안 장비'], 0.4],
  ['router', 2, '엣지 라우터 (2U)', 'Edge router (2U)', ['router', 'edge router', 'wan', '라우터', '엣지 라우터', 'WAN 라우터'], 0.5],
  ['tape', 4, '테이프 라이브러리 (4U)', 'Tape library (4U)', ['tape library', 'lto', 'backup', '테이프 라이브러리', 'LTO', '백업 장비'], 0.85],
  ['pdu', 1, '수평형 랙 PDU', 'Horizontal rack PDU', ['pdu', 'power distribution', 'rack power strip', '랙 PDU', '전원 분배기', '랙 멀티탭'], 0.15],
  ['console', 1, '콘솔 서버', 'Console server', ['console server', 'serial console', 'out of band', '콘솔 서버', '시리얼 콘솔'], 0.3],
  ['nas', 1, '1U 랙형 NAS', '1U rack NAS', ['nas', 'network storage', 'rack nas', '랙형 NAS', '네트워크 스토리지'], 0.5],
];

const deviceItems = DEVICES.map(([kind, u, ko, en, tags, depth]) => srv({
  id: `srv-dev-${kind}-${u}u`, placement: 'surface', ko, en,
  params: [P.len('depth', '깊이', 'Depth', depth, Math.max(0.02, depth * 0.6), depth * 1.3), P.bool('ears', '랙 귀', 'Rack ears', true)],
  tags: [...tags, '19 inch', '19인치 랙 장비', '서버실'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    device(k, kind, 0, 0, p.depth / 2, u, { depth: p.depth });
    return finish(k);
  },
}));

/* ============================================================ complete racks */

const RACKS = [
  ['web', '웹 서버 랙', 'Web server rack', [['patch', 1], ['switch1u', 1], ['cablemgr', 1], ['server1u', 1], ['server1u', 1], ['server1u', 1], ['server1u', 1], ['server1u', 1], ['server1u', 1]], ['web server', 'compute rack', '웹 서버', '컴퓨팅 랙'], 'mesh'],
  ['db', '데이터베이스 서버 랙', 'Database server rack', [['server2u', 2], ['server2u', 2], ['storage2u', 2], ['gap', 1]], ['database', 'db server', '데이터베이스', 'DB 서버'], 'mesh'],
  ['storage', '스토리지 랙', 'Storage rack', [['storage4u', 4], ['storage4u', 4], ['gap', 1]], ['storage rack', 'san', 'disk', '스토리지 랙', '디스크 어레이'], 'glass'],
  ['network', '네트워크 코어 랙', 'Core network rack', [['patch', 2], ['cablemgr', 1], ['switch1u', 1], ['cablemgr', 1], ['patch', 2], ['switch-core', 14], ['fibre', 1], ['router', 2]], ['network rack', 'core switch', '네트워크 랙', '코어 스위치'], 'mesh'],
  ['gpu', 'GPU 컴퓨팅 랙', 'GPU compute rack', [['gpu4u', 4], ['gap', 1], ['gpu4u', 4], ['gap', 1], ['switch1u', 1]], ['gpu rack', 'ai cluster', 'hpc', 'GPU 랙', 'AI 클러스터', 'HPC'], 'mesh'],
  ['blade', '블레이드 서버 랙', 'Blade server rack', [['blade', 10], ['gap', 1], ['blade', 10], ['switch1u', 1], ['switch1u', 1]], ['blade rack', 'blade enclosure', '블레이드 랙', '블레이드 서버'], 'mesh'],
  ['backup', '백업 랙 (테이프)', 'Backup rack (tape)', [['tape', 4], ['tape', 4], ['server2u', 2], ['storage4u', 4], ['gap', 2]], ['backup rack', 'tape library', '백업 랙', '테이프 백업'], 'glass'],
  ['patching', '패치 패널 랙', 'Patching rack', [['patch', 1], ['cablemgr', 1], ['patch', 1], ['cablemgr', 1], ['fibre', 1], ['cablemgr', 1]], ['patching rack', 'cross connect', 'mdf', '패치 랙', '배선 랙', 'MDF'], 'open'],
  ['ups', 'UPS·배터리 랙', 'UPS and battery rack', [['battery', 2], ['battery', 2], ['battery', 2], ['ups', 3], ['pdu', 1]], ['ups rack', 'battery rack', 'power', 'UPS 랙', '배터리 랙', '전원'], 'mesh'],
  ['mixed', '복합 장비 랙', 'Mixed equipment rack', [['firewall', 1], ['router', 2], ['switch1u', 1], ['patch', 1], ['kvm', 1], ['server2u', 2], ['server1u', 1], ['storage2u', 2], ['nas', 1], ['ups', 2]], ['mixed rack', 'small business', 'all in one', '복합 랙', '소규모 서버실'], 'glass'],
  ['hpc', 'HPC 노드 랙', 'HPC node rack', [['server1u', 1]], ['hpc rack', 'cluster nodes', 'dense compute', 'HPC 랙', '클러스터 노드'], 'mesh'],
  ['security', '보안 장비 랙', 'Security appliance rack', [['firewall', 1], ['firewall', 1], ['cablemgr', 1], ['switch1u', 1], ['console', 1], ['server1u', 1], ['gap', 1]], ['security rack', 'dmz', 'firewall', '보안 랙', 'DMZ', '방화벽'], 'glass'],
];

const rackItems = RACKS.map(([key, ko, en, list, tags, door]) => srv({
  id: `srv-rack-${key}`, ko, en,
  params: [
    P.int('units', '높이 (U)', 'Height (U)', 42, 24, 48), P.num('fill', '장비 채움', 'Equipment fill', 0.8, 0, 1, 0.05),
    P.pick('door', '전면 문', 'Front door', door, [['mesh', '타공', 'Perforated'], ['glass', '유리', 'Glass'], ['open', '없음', 'Open']]),
    P.color('body', '몸체 색', 'Body colour', '#1e1f22'),
  ],
  tags: [...tags, 'server rack', '42u', '서버 랙', '서버실', '전산실'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { y0, zf } = rackShell(k, { units: p.units, door: p.door, body: 'metal-pc-black-matte' });
    fill(k, list, y0, zf, p.units, { fillRatio: p.fill });
    return colourRack(finish(k), p.body);
  },
}));

/** Applies the body colour to the rack frame meshes (colour param on shared material keys). */
function colourRack(g, color) {
  for (const c of g.children) if (c.isMesh && c.name === 'rack' && color && c.material?.color) { c.material = c.material.clone(); c.material.color.set(color); }
  return g;
}

const emptyRack = srv({
  id: 'srv-rack-empty-42u', ko: '빈 서버 랙 (42U)', en: 'Empty server rack (42U)',
  params: [P.int('units', '높이 (U)', 'Height (U)', 42, 18, 48), P.len('width', '폭', 'Width', 0.6, 0.6, 0.8), P.len('depth', '깊이', 'Depth', 1.0, 0.8, 1.2),
    P.pick('door', '전면 문', 'Front door', 'mesh', [['mesh', '타공', 'Perforated'], ['glass', '유리', 'Glass'], ['open', '없음', 'Open']])],
  tags: ['server rack', 'empty rack', 'rack cabinet', '빈 랙', '랙 캐비닛', '서버실'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    rackShell(k, { units: p.units, w: p.width, d: p.depth, door: p.door });
    return finish(k);
  },
});

const networkRack800 = srv({
  id: 'srv-rack-network-800', ko: '네트워크 랙 (800폭, 수직 정리대)', en: 'Network rack 800 wide with vertical managers',
  params: [P.int('units', '높이 (U)', 'Height (U)', 42, 24, 48), P.num('fill', '장비 채움', 'Equipment fill', 0.7, 0, 1, 0.05)],
  tags: ['network rack', '800mm', 'vertical cable manager', '네트워크 랙', '800 랙', '수직 케이블 정리대'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.8, d = 1.0;
    const { y0, zf } = rackShell(k, { units: p.units, w, d, door: 'open' });
    for (const sx of [-1, 1]) {
      k.box('chassis', 'metal-pc-black-matte', 0.12, p.units * U, 0.2, sx * 0.31, y0 + (p.units * U) / 2, zf - 0.05, { r: 0.002 });
      for (let i = 0; i < 10; i++) k.box('handles', 'plastic-black', 0.1, 0.012, 0.05, sx * 0.31, y0 + 0.1 + i * (p.units * U - 0.2) / 9, zf + 0.06, { r: 0.004 });
    }
    fill(k, [['patch', 1], ['cablemgr', 1], ['switch1u', 1], ['cablemgr', 1]], y0, zf, p.units, { fillRatio: p.fill });
    for (let i = 0; i < 8; i++) k.tube('cables', 'plastic-abs-gloss-blue', [[-0.15 + i * 0.04, y0 + 0.3 + i * 0.1, zf + 0.02], [-0.25, y0 + 0.35 + i * 0.1, zf + 0.08], [-0.31, y0 + 0.6 + i * 0.1, zf + 0.06]], 0.003);
    return finish(k);
  },
});

const twoPost = srv({
  id: 'srv-open-frame-2-post', ko: '2포스트 오픈 랙', en: 'Two-post open frame rack',
  params: [P.int('units', '높이 (U)', 'Height (U)', 45, 24, 48), P.num('fill', '장비 채움', 'Equipment fill', 0.5, 0, 1, 0.05), P.mat('frame', '틀', 'Frame', 'metal-al-anodised-black', 'metal')],
  tags: ['2 post rack', 'relay rack', 'open frame', '2포스트 랙', '오픈 랙', '통신 랙'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.units * U + 0.15;
    for (const sx of [-1, 1]) {
      k.box('frame', p.frame, 0.08, h, 0.08, sx * (DW / 2 + 0.05), h / 2, 0, { r: 0.002 });
      k.box('frame', p.frame, 0.1, 0.012, 0.38, sx * (DW / 2 + 0.05), 0.006, 0, { r: 0.002 });
    }
    k.box('frame', p.frame, DW + 0.18, 0.06, 0.08, 0, h - 0.03, 0, { r: 0.002 });
    fill(k, [['patch', 2], ['cablemgr', 1], ['switch1u', 1], ['cablemgr', 1]], 0.08, 0.05, p.units, { depth: 0.3, fillRatio: p.fill, blanks: false });
    return finish(k);
  },
});

const fourPost = srv({
  id: 'srv-open-frame-4-post', ko: '4포스트 오픈 랙', en: 'Four-post open frame rack',
  params: [P.int('units', '높이 (U)', 'Height (U)', 42, 24, 48), P.num('fill', '장비 채움', 'Equipment fill', 0.6, 0, 1, 0.05), P.len('depth', '깊이', 'Depth', 0.9, 0.6, 1.1)],
  tags: ['4 post rack', 'open frame rack', 'server frame', '4포스트 랙', '오픈 프레임', '서버 프레임'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.units * U + 0.15, d = p.depth;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', 'metal-pc-black-matte', 0.05, h, 0.05, sx * (DW / 2 + 0.04), h / 2, sz * (d / 2 - 0.025), { r: 0.002 });
    for (const y of [0.03, h - 0.03]) for (const sx of [-1, 1]) k.box('frame', 'metal-pc-black-matte', 0.05, 0.05, d, sx * (DW / 2 + 0.04), y, 0, { r: 0.002 });
    for (const y of [0.03, h - 0.03]) for (const sz of [-1, 1]) k.box('frame', 'metal-pc-black-matte', DW + 0.13, 0.05, 0.05, 0, y, sz * (d / 2 - 0.025), { r: 0.002 });
    fill(k, [['server2u', 2], ['server1u', 1], ['switch1u', 1]], 0.07, d / 2 - 0.05, p.units, { depth: d * 0.75, fillRatio: p.fill, blanks: false });
    return finish(k);
  },
});

const WALL = [[6, 'srv-wall-cabinet-6u', '벽걸이 랙 (6U)', 'Wall-mount rack (6U)', [['patch', 1], ['switch1u', 1], ['cablemgr', 1], ['pdu', 1]]],
  [9, 'srv-wall-cabinet-9u', '벽걸이 랙 (9U)', 'Wall-mount rack (9U)', [['patch', 1], ['cablemgr', 1], ['switch1u', 1], ['firewall', 1], ['nas', 1], ['pdu', 1]]],
  [12, 'srv-wall-cabinet-12u', '벽걸이 랙 (12U)', 'Wall-mount rack (12U)', [['fibre', 1], ['patch', 2], ['cablemgr', 1], ['switch1u', 1], ['switch1u', 1], ['router', 2], ['shelf', 2], ['pdu', 1]]],
  [18, 'srv-wall-cabinet-18u', '벽걸이 랙 (18U)', 'Wall-mount rack (18U)', [['patch', 2], ['cablemgr', 1], ['switch1u', 1], ['server2u', 2], ['nas', 1], ['ups', 2], ['pdu', 1]]]];

const wallItems = WALL.map(([u, id, ko, en, list]) => srv({
  id, placement: 'wall', elevation: u > 12 ? 1.0 : 1.3, ko, en,
  params: [P.num('fill', '장비 채움', 'Equipment fill', 0.8, 0, 1, 0.05), P.pick('door', '전면 문', 'Front door', 'glass', [['glass', '유리', 'Glass'], ['mesh', '타공', 'Perforated'], ['open', '없음', 'Open']]), P.len('depth', '깊이', 'Depth', 0.45, 0.35, 0.6)],
  tags: ['wall cabinet', 'wall mount rack', 'network cabinet', '벽걸이 랙', '통신 함체', '네트워크 캐비닛'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.6, d = p.depth, h = u * U + 0.12, t = 0.012;
    for (const y of [t / 2, h - t / 2]) k.box('rack', 'metal-pc-black-matte', w, t, d, 0, y, d / 2, { r: 0.002 });
    for (const sx of [-1, 1]) k.box('rack', 'metal-pc-black-matte', t, h, d, sx * (w / 2 - t / 2), h / 2, d / 2, { r: 0.002 });
    k.box('rack', 'metal-pc-black-matte', w, h, t, 0, h / 2, t / 2, { r: 0 });
    for (const sx of [-1, 1]) k.box('rack', 'metal-pc-black-matte', 0.016, u * U, 0.02, sx * (DW / 2 + 0.03), 0.06 + (u * U) / 2, d - 0.08, { r: 0 });
    fill(k, list, 0.06, d - 0.07, u, { depth: d * 0.7, fillRatio: p.fill });
    if (p.door !== 'open') {
      k.panel('rack', 'metal-pc-black-matte', frameShape(w, h, 0.04), 0.016, 0, h / 2, d + 0.008);
      k.box(p.door === 'glass' ? 'glass' : 'mesh', p.door === 'glass' ? 'glass-tint-smoke-dark' : 'metal-pc-black-perforated', w - 0.07, h - 0.07, 0.004, 0, h / 2, d + 0.008, { r: 0 });
      k.box('handles', 'metal-chrome', 0.02, 0.1, 0.02, w / 2 - 0.03, h / 2, d + 0.025, { r: 0.004 });
    }
    return finish(k);
  },
}));

const halfRack = srv({
  id: 'srv-half-rack-24u', ko: '하프 랙 (24U, 소음 차단)', en: 'Half-height soundproof rack (24U)',
  params: [P.num('fill', '장비 채움', 'Equipment fill', 0.8, 0, 1, 0.05), P.color('body', '몸체 색', 'Body colour', '#2a2b2e')],
  tags: ['half rack', 'soundproof rack', 'office rack', '하프 랙', '방음 랙', '사무실 랙'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { y0, zf, h } = rackShell(k, { units: 24, w: 0.75, d: 1.0, door: 'glass', top: 'fans' });
    fill(k, [['patch', 1], ['switch1u', 1], ['firewall', 1], ['server2u', 2], ['server2u', 2], ['nas', 1], ['ups', 2]], y0, zf, 24, { fillRatio: p.fill });
    k.box('mesh', 'metal-pc-black-perforated', 0.5, 0.15, 0.004, 0, h - 0.15, 0.501, { r: 0 });
    return colourRack(finish(k), p.body);
  },
});

const rackRow = srv({
  id: 'srv-rack-row', ko: '서버 랙 열 (연결형)', en: 'Row of bayed server racks',
  params: [P.int('racks', '랙 수', 'Racks', 4, 2, 5), P.num('fill', '장비 채움', 'Equipment fill', 0.75, 0, 1, 0.05), P.pick('door', '전면 문', 'Front door', 'mesh', [['mesh', '타공', 'Perforated'], ['glass', '유리', 'Glass']])],
  tags: ['rack row', 'bayed racks', 'server row', '랙 열', '서버 랙 줄', '데이터센터'],
  build: (p, ctx) => {
    const k = new Kit(ctx), n = p.racks, w = 0.6;
    const plan = [[['server1u', 1], ['server2u', 2]], [['storage4u', 4]], [['patch', 1], ['switch1u', 1], ['cablemgr', 1]], [['gpu4u', 4], ['gap', 1]], [['blade', 10], ['gap', 1]]];
    for (let i = 0; i < n; i++) {
      const sub = new Kit(ctx);
      const { y0, zf } = rackShell(sub, { units: 42, w, door: p.door, sides: i === 0 || i === n - 1 });
      fill(sub, plan[i % plan.length], y0, zf, 42, { fillRatio: p.fill, simple: true });
      const x = (i - (n - 1) / 2) * w;
      for (const part of sub.parts.values()) for (const g of part.geos) k.add(part.role, part.mat, g.translate(x, 0, 0), { overrides: part.overrides, uv: 'keep' });
      for (const l of sub.lights) k.lights.push({ ...l, x: l.x + x });
    }
    return finish(k);
  },
});

const pod = srv({
  id: 'srv-cold-aisle-pod', ko: '냉복도 컨테인먼트 포드', en: 'Cold aisle containment pod',
  params: [P.int('racks', '한 줄 랙 수', 'Racks per row', 4, 2, 5), P.len('aisle', '통로 폭', 'Aisle width', 1.2, 1.0, 1.8), P.num('fill', '장비 채움', 'Equipment fill', 0.7, 0, 1, 0.05)],
  tags: ['cold aisle containment', 'aisle pod', 'data center', '냉복도', '컨테인먼트', '데이터센터'],
  build: (p, ctx) => {
    const k = new Kit(ctx), n = p.racks, w = 0.6, d = 1.0, A = p.aisle, L = n * w, H = 42 * U + 0.17;
    for (const side of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const sub = new Kit(ctx);
        const { y0, zf } = rackShell(sub, { units: 42, w, door: 'mesh', sides: i === 0 || i === n - 1 });
        fill(sub, i % 2 ? [['server2u', 2]] : [['storage4u', 4]], y0, zf, 42, { fillRatio: p.fill, simple: true });
        const x = (i - (n - 1) / 2) * w, z = side * (A / 2 + d / 2);
        for (const part of sub.parts.values()) for (const g of part.geos) {
          if (side > 0) g.rotateY(PI);
          k.add(part.role, part.mat, g.translate(x, 0, z), { overrides: part.overrides, uv: 'keep' });
        }
      }
    }
    // roof panels and end doors
    k.box('glass', 'plastic-pc-clear', L, 0.01, A, 0, H + 0.005, 0, { r: 0 });
    for (const sx of [-1, 1]) {
      k.panel('rack', 'metal-al-anodised-black', frameShape(A, H, 0.04), 0.03, sx * (L / 2 + 0.015), H / 2, 0, { ry: PI / 2 });
      k.box('glass', 'plastic-pc-clear', 0.006, H - 0.08, A / 2 - 0.05, sx * (L / 2 + 0.015), H / 2, -A / 4, { r: 0 });
      k.box('glass', 'plastic-pc-clear', 0.006, H - 0.08, A / 2 - 0.05, sx * (L / 2 + 0.015), H / 2, A / 4, { r: 0 });
    }
    k.light(0, H - 0.2, 0, { color: '#e8f4ff', intensity: 0.4, distance: 4 });
    k.box('lamp', 'light-panel-dim', L * 0.8, 0.01, 0.1, 0, H - 0.01, 0, { r: 0 });
    return finish(k);
  },
});

const hotChimney = srv({
  id: 'srv-rack-hot-aisle-chimney', ko: '배기 덕트 랙 (침니형)', en: 'Rack with hot-air chimney',
  params: [P.len('duct', '덕트 높이', 'Duct height', 0.6, 0.3, 1.0), P.num('fill', '장비 채움', 'Equipment fill', 0.85, 0, 1, 0.05)],
  tags: ['chimney rack', 'hot aisle', 'exhaust duct', '침니 랙', '배기 덕트', '열기 배출'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { y0, zf, h } = rackShell(k, { units: 42, w: 0.8, d: 1.2, door: 'glass', rear: true });
    fill(k, [['server2u', 2], ['server1u', 1]], y0, zf, 42, { fillRatio: p.fill });
    k.box('duct', 'metal-pc-black-matte', 0.7, p.duct, 0.4, 0, h + p.duct / 2, -0.35, { r: 0.004 });
    k.box('mesh', 'metal-pc-black-perforated', 0.6, 0.004, 0.3, 0, h + p.duct, -0.35, { r: 0 });
    return finish(k);
  },
});

const rearDoorHx = srv({
  id: 'srv-rack-rear-door-cooler', ko: '후면 도어 냉각기 랙', en: 'Rack with rear-door heat exchanger',
  params: [P.num('fill', '장비 채움', 'Equipment fill', 0.9, 0, 1, 0.05), P.bool('pipes', '배관', 'Pipes', true)],
  tags: ['rear door heat exchanger', 'liquid cooling', 'rdhx', '후면 도어 냉각', '수냉 랙', '고밀도 랙'],
  build: (p, ctx) => {
    const k = new Kit(ctx), d = 1.0;
    const { y0, zf, h } = rackShell(k, { units: 42, w: 0.6, d, door: 'mesh', rear: false });
    fill(k, [['gpu4u', 4], ['server2u', 2]], y0, zf, 42, { fillRatio: p.fill });
    k.box('coil', 'metal-pc-black-matte', 0.6, h - 0.05, 0.16, 0, h / 2, -d / 2 - 0.08, { r: 0.004 });
    k.box('mesh', 'metal-pc-black-perforated', 0.5, h - 0.2, 0.004, 0, h / 2, -d / 2 - 0.161, { r: 0 });
    for (let i = 0; i < 5; i++) k.cyl('mesh', 'metal-pc-black-perforated', 0.05, 0.05, 0.004, 0, 0.3 + i * 0.35, -d / 2 - 0.162, { rx: -PI / 2, segs: k.seg(16, 6) });
    if (p.pipes) for (const x of [-0.12, 0.12]) k.rod('pipes', 'plastic-pvc-pipe', [x, 0, -d / 2 - 0.12], [x, 0.25, -d / 2 - 0.12], 0.02, { segs: 10, ...C(x < 0 ? '#2a7de1' : '#d9342b') });
    return finish(k);
  },
});

export const ITEMS = [...deviceItems, ...rackItems, emptyRack, networkRack800, twoPost, fourPost, ...wallItems, halfRack, rackRow, pod, hotChimney, rearDoorHx];
