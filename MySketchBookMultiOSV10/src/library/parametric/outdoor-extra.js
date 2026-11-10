// Further outdoor designs: garden structures (pergola, hexagonal gazebo, shed, arbour, fence,
// gate), lounging (canopy daybed, hanging swing bed, corner sectional, dining set), cooking
// (kamado, outdoor kitchen island), water (bird bath, tiered fountain, hot tub, outdoor shower,
// water butt), kids (trampoline, sandbox) and garden utility (bike rack, mailbox, compost bays,
// wheelbarrow, firewood rack). See ARCHITECTURE.md §12 → Library objects.
import { THREE, Kit, P, roundRect, addCabinet, addHandle, transformAdded, rng } from './helpers.js';
import { finish } from './kitchen.js';
import { mk } from './appliances-more.js';

const PI = Math.PI;
const circle = (r, y, n, z0 = 0) => Array.from({ length: n }, (_, i) => { const a = (i / n) * PI * 2; return [Math.cos(a) * r, y, Math.sin(a) * r + z0]; });

/* ------------------------------------------------------------ structures */

const pergola = mk({
  id: 'out-pergola', category: 'outdoor', ko: '원목 퍼골라', en: 'Timber pergola',
  params: [
    P.len('width', '폭', 'Width', 3.0, 2.0, 5.0), P.len('depth', '깊이', 'Depth', 3.0, 2.0, 4.5), P.len('height', '높이', 'Height', 2.5, 2.2, 3.0),
    P.mat('wood', '목재', 'Timber', 'wood-pine', 'wood'), P.bool('slats', '상부 살', 'Top slats', true),
  ],
  tags: ['pergola', 'garden structure', 'shade', '퍼골라', '파고라', '정원 구조물', '그늘막'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, depth: d, height: h, wood } = p, px = w / 2 - 0.12, pz = d / 2 - 0.12;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.box('posts', wood, 0.12, h, 0.12, sx * px, h / 2, sz * pz, { r: 0.006 });
      k.box('feet', 'metal-black', 0.18, 0.04, 0.18, sx * px, 0.02, sz * pz, { r: 0.003 });
      // knee braces
      k.box('posts', wood, 0.06, 0.5, 0.06, sx * (px - 0.16), h - 0.32, sz * pz, { r: 0.004, rz: sx * PI / 4 });
    }
    for (const sz of [-1, 1]) k.box('beams', wood, w + 0.3, 0.2, 0.07, 0, h - 0.1, sz * pz, { r: 0.005 });
    const n = Math.max(4, Math.round(w / 0.4));
    for (let i = 0; i < n; i++) k.box('beams', wood, 0.05, 0.16, d + 0.3, -w / 2 + 0.05 + ((w - 0.1) * i) / (n - 1), h + 0.08, 0, { r: 0.004 });
    if (p.slats) {
      const m = Math.max(4, Math.round(d / 0.22));
      for (let j = 0; j < m; j++) k.box('slats', wood, w + 0.2, 0.04, 0.045, 0, h + 0.18, -d / 2 + 0.06 + ((d - 0.12) * j) / (m - 1), { r: 0.003 });
    }
    return finish(k);
  },
});

const gazebo = mk({
  id: 'out-gazebo-hex', category: 'outdoor', ko: '육각 정자(가제보)', en: 'Hexagonal gazebo',
  params: [
    P.len('radius', '반지름', 'Radius', 1.6, 1.2, 2.4), P.len('height', '기둥 높이', 'Post height', 2.3, 2.1, 2.7),
    P.mat('wood', '목재', 'Timber', 'wood-teak', 'wood'), P.mat('roof', '지붕', 'Roof', 'wood-dark'),
    P.bool('rails', '난간', 'Railings', true),
  ],
  tags: ['gazebo', 'pavilion', 'garden house', '정자', '가제보', '파빌리온', '원두막'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.radius, h = p.height, fh = 0.15;
    k.cyl('floor', p.wood, R + 0.12, R + 0.15, fh, 0, 0, 0, { segs: 6 });
    const pts = Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * PI * 2; return [Math.sin(a) * R, Math.cos(a) * R]; });
    for (const [x, z] of pts) k.box('posts', p.wood, 0.11, h, 0.11, x, fh + h / 2, z, { r: 0.006 });
    for (let i = 0; i < 6; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % 6];
      k.rod('beams', p.wood, [x0, fh + h - 0.08, z0], [x1, fh + h - 0.08, z1], 0.06, { segs: 4 });
      // railings on all sides except the entrance (the side facing +z)
      if (p.rails && i !== 5) {
        for (const y of [0.5, 0.9]) k.rod('beams', p.wood, [x0, fh + y, z0], [x1, fh + y, z1], 0.03, { segs: 6 });
        for (let s = 1; s < 6; s++) { const t = s / 6; k.rod('beams', p.wood, [x0 + (x1 - x0) * t, fh, z0 + (z1 - z0) * t], [x0 + (x1 - x0) * t, fh + 0.9, z0 + (z1 - z0) * t], 0.015, { segs: 5 }); }
      }
    }
    const y0 = fh + h;
    k.cyl('roof', p.roof, 0.06, R + 0.45, 0.95, 0, y0, 0, { segs: 6 });
    k.cyl('roof', p.roof, R + 0.45, R + 0.45, 0.05, 0, y0 - 0.05, 0, { segs: 6 });
    k.cyl('finial', 'metal-black', 0.0, 0.05, 0.25, 0, y0 + 0.9, 0, { segs: k.seg(10, 5) });
    return finish(k);
  },
});

const shed = mk({
  id: 'out-garden-shed', category: 'outdoor', ko: '정원 창고(목조)', en: 'Wooden garden shed',
  params: [
    P.len('width', '폭', 'Width', 2.4, 1.6, 3.6), P.len('depth', '깊이', 'Depth', 1.8, 1.2, 2.8),
    P.mat('wall', '벽 목재', 'Cladding', 'wood-pine', 'wood'), P.mat('roof', '지붕', 'Roof', 'metal-black'),
    P.mat('trim', '문·몰딩', 'Door / trim', 'paint-white-matte'), P.bool('window', '창문', 'Window', true),
  ],
  tags: ['shed', 'garden shed', 'tool shed', '창고', '정원 창고', '목조 창고', '헛간'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.depth, wh = 1.95, t = 0.05, a = 0.5, rise = (w / 2) * Math.tan(a);
    k.box('base', 'concrete', w + 0.1, 0.1, d + 0.1, 0, 0.05, 0, { r: 0.004 });
    const y0 = 0.1;
    // clapboard walls: stacked boards (front/back shorter so the corners overlap)
    const n = Math.round(wh / 0.15);
    for (let i = 0; i < n; i++) {
      const y = y0 + (i + 0.5) * (wh / n);
      for (const s of [-1, 1]) {
        k.box('walls', p.wall, w, wh / n + 0.004, t, 0, y, s * (d / 2 - t / 2), { r: 0.004, rx: s * 0.04 });
        k.box('walls', p.wall, t, wh / n + 0.004, d - 2 * t, s * (w / 2 - t / 2), y, 0, { r: 0.004, rz: -s * 0.04 });
      }
    }
    // gables
    for (const s of [-1, 1]) {
      const g = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, rise)]);
      k.panel('walls', p.wall, g, t, 0, y0 + wh, s * (d / 2 - t / 2), { bevel: 0.003 });
    }
    // roof
    const sl = (w / 2 + 0.18) / Math.cos(a);
    for (const s of [-1, 1]) k.box('roof', p.roof, sl, 0.04, d + 0.25, s * (w / 4 + 0.09 - 0.01), y0 + wh + rise / 2 - 0.05 + 0.02, 0, { r: 0.004, rz: -s * a });
    k.box('trim', p.trim, 0.12, 0.06, d + 0.27, 0, y0 + wh + rise + 0.02, 0, { r: 0.01 });
    // door + corner boards
    const dw = Math.min(0.9, w * 0.4), dh = 1.8, zf = d / 2 + 0.012;
    k.box('trim', p.trim, dw, dh, 0.03, -w * 0.15, y0 + dh / 2, zf, { r: 0.004 });
    for (const y of [0.25, dh / 2, dh - 0.25]) k.box('trim', p.trim, dw - 0.06, 0.1, 0.02, -w * 0.15, y0 + y, zf + 0.022, { r: 0.003 });
    k.box('trim', p.trim, 0.1, Math.hypot(dw - 0.1, dh / 2 - 0.25) , 0.02, -w * 0.15, y0 + dh * 0.62, zf + 0.022, { r: 0.003, rz: -Math.atan2(dw - 0.1, dh / 2 - 0.25) });
    addHandle(k, 'hardware', 'metal-black', 'bar', -w * 0.15 + dw / 2 - 0.08, y0 + 1.0, zf + 0.015, { len: 0.14, vertical: true });
    for (const s of [-1, 1]) for (const sz of [-1, 1]) k.box('trim', p.trim, 0.08, wh, 0.08, s * (w / 2 - 0.02), y0 + wh / 2, sz * (d / 2 - 0.02), { r: 0.004 });
    if (p.window) {
      const ww = Math.min(0.7, w * 0.3);
      k.box('glass', 'glass-clear', ww, 0.55, 0.01, w * 0.25, y0 + 1.3, zf - 0.005, { r: 0 });
      k.panel('trim', p.trim, frame(ww + 0.08, 0.63, 0.05), 0.04, w * 0.25, y0 + 1.3, zf + 0.005);
      k.box('trim', p.trim, 0.03, 0.55, 0.03, w * 0.25, y0 + 1.3, zf + 0.005, { r: 0.002 });
    }
    return finish(k);
  },
});
function frame(w, h, b) {
  const s = new THREE.Shape([new THREE.Vector2(-w / 2, -h / 2), new THREE.Vector2(w / 2, -h / 2), new THREE.Vector2(w / 2, h / 2), new THREE.Vector2(-w / 2, h / 2)]);
  const hole = new THREE.Path([new THREE.Vector2(-w / 2 + b, -h / 2 + b), new THREE.Vector2(-w / 2 + b, h / 2 - b), new THREE.Vector2(w / 2 - b, h / 2 - b), new THREE.Vector2(w / 2 - b, -h / 2 + b)]);
  s.holes.push(hole);
  return s;
}

const arbour = mk({
  id: 'out-arbour-arch', category: 'outdoor', ko: '아치 장미 아치(아버)', en: 'Garden arch arbour',
  params: [
    P.len('width', '폭', 'Width', 1.2, 0.9, 2.0), P.len('height', '높이', 'Height', 2.2, 1.9, 2.6),
    P.mat('metal', '프레임', 'Frame', 'metal-black'), P.bool('climber', '덩굴 식물', 'Climbing plant', true),
  ],
  tags: ['arbour', 'arbor', 'garden arch', 'rose arch', 'trellis', '아치', '장미 아치', '트렐리스', '정원 아치'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, rise = Math.min(0.45, w * 0.35), h0 = h - rise, zs = 0.25, m = p.metal;
    const arc = (z) => Array.from({ length: 13 }, (_, i) => { const t = i / 12, a = PI * (1 - t); return [Math.cos(a) * w / 2, h0 + Math.sin(a) * rise, z]; });
    for (const z of [-zs, zs]) {
      for (const s of [-1, 1]) k.rod('frame', m, [s * w / 2, 0, z], [s * w / 2, h0, z], 0.014);
      k.tube('frame', m, arc(z), 0.014);
    }
    // side lattice: horizontal bars + a diamond of diagonals
    for (const s of [-1, 1]) {
      const x = s * w / 2;
      for (let y = 0.3; y < h0; y += 0.3) k.rod('frame', m, [x, y, -zs], [x, y, zs], 0.008, { segs: 6 });
      for (let y = 0.1; y + 0.5 < h0; y += 0.5) { k.rod('frame', m, [x, y, -zs], [x, y + 0.5, zs], 0.006, { segs: 5 }); k.rod('frame', m, [x, y, zs], [x, y + 0.5, -zs], 0.006, { segs: 5 }); }
    }
    for (let i = 1; i < 12; i += 2) { const a = PI * (1 - i / 12); k.rod('frame', m, [Math.cos(a) * w / 2, h0 + Math.sin(a) * rise, -zs], [Math.cos(a) * w / 2, h0 + Math.sin(a) * rise, zs], 0.008, { segs: 6 }); }
    if (p.climber) {
      const r = rng(5);
      for (let i = 0; i < 14; i++) {
        const t = i / 13, side = i % 2 ? 1 : -1;
        let x, y;
        if (t < 0.35) { x = -w / 2; y = 0.4 + (t / 0.35) * (h0 - 0.4); } else if (t > 0.65) { x = w / 2; y = 0.4 + ((1 - t) / 0.35) * (h0 - 0.4); } else { const a = PI * (1 - (t - 0.35) / 0.3); x = Math.cos(a) * w / 2; y = h0 + Math.sin(a) * rise; }
        k.sphere('leaves', i % 3 ? 'plant-leaf' : 'plant-leaf-light', 0.1 + r() * 0.06, x, y, side * zs * r(), { scale: [1.2, 0.8, 1.4], segs: k.seg(10, 5), rings: k.seg(7, 4) });
      }
    }
    return finish(k);
  },
});

const fence = mk({
  id: 'out-fence-panel', category: 'outdoor', ko: '원목 울타리 패널', en: 'Wooden fence panel',
  params: [
    P.len('width', '폭', 'Width', 1.8, 0.9, 2.4), P.len('height', '높이', 'Height', 1.5, 0.6, 2.0),
    P.pick('style', '살 방향', 'Boards', 'horizontal', [['horizontal', '가로 루버', 'Horizontal slats'], ['vertical', '세로 판재', 'Vertical boards'], ['picket', '피켓', 'Picket']]),
    P.mat('wood', '목재', 'Timber', 'wood-teak', 'wood'),
  ],
  tags: ['fence', 'fence panel', 'garden fence', 'privacy screen', '울타리', '펜스', '담장', '가림막'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, wd = p.wood, iw = w - 0.18;
    for (const s of [-1, 1]) { k.box('posts', wd, 0.09, h + 0.05, 0.09, s * (w / 2 - 0.045), (h + 0.05) / 2, 0, { r: 0.005 }); k.box('posts', wd, 0.11, 0.025, 0.11, s * (w / 2 - 0.045), h + 0.06, 0, { r: 0.004 }); }
    if (p.style === 'horizontal') {
      const n = Math.max(3, Math.round(h / 0.11));
      for (let i = 0; i < n; i++) k.box('boards', wd, iw, 0.09, 0.02, 0, 0.06 + (i + 0.5) * ((h - 0.08) / n), 0, { r: 0.003 });
    } else {
      for (const y of [0.25, h - 0.25]) k.box('posts', wd, iw, 0.08, 0.04, 0, y, -0.03, { r: 0.004 });
      const bw = p.style === 'picket' ? 0.08 : 0.12, gap = p.style === 'picket' ? 0.06 : 0.008;
      const n = Math.max(2, Math.floor((iw + gap) / (bw + gap)));
      const used = n * bw + (n - 1) * gap;
      for (let i = 0; i < n; i++) {
        const x = -used / 2 + bw / 2 + i * (bw + gap);
        if (p.style === 'picket') {
          const s = new THREE.Shape([new THREE.Vector2(-bw / 2, 0), new THREE.Vector2(bw / 2, 0), new THREE.Vector2(bw / 2, h - 0.12), new THREE.Vector2(0, h - 0.04), new THREE.Vector2(-bw / 2, h - 0.12)]);
          k.panel('boards', wd, s, 0.02, x, 0.04, 0, { bevel: 0.002 });
        } else k.box('boards', wd, bw, h - 0.06, 0.02, x, 0.03 + (h - 0.06) / 2, 0, { r: 0.003 });
      }
    }
    return finish(k);
  },
});

const gate = mk({
  id: 'out-garden-gate', category: 'outdoor', ko: '정원 쪽문(피켓 게이트)', en: 'Picket garden gate',
  params: [
    P.len('width', '폭', 'Width', 1.0, 0.7, 1.6), P.len('height', '높이', 'Height', 1.1, 0.8, 1.8),
    P.mat('wood', '목재', 'Timber', 'paint-white-matte'), P.mat('metal', '철물', 'Hardware', 'metal-black', 'metal'),
  ],
  tags: ['gate', 'garden gate', 'picket gate', 'wicket', '대문', '쪽문', '정원 문', '게이트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, wd = p.wood, lw = w - 0.03;
    for (const s of [-1, 1]) {
      k.box('posts', wd, 0.1, h + 0.25, 0.1, s * (w / 2 + 0.05), (h + 0.25) / 2, 0, { r: 0.005 });
      k.cyl('posts', wd, 0.0, 0.065, 0.08, s * (w / 2 + 0.05), h + 0.25, 0, { segs: 4, ry: PI / 4 });
    }
    for (const y of [0.18, h - 0.28]) k.box('leaf', wd, lw, 0.08, 0.03, 0, y, -0.02, { r: 0.004 });
    const L = Math.hypot(lw - 0.12, h - 0.46);
    k.box('leaf', wd, 0.08, L, 0.03, 0, (h - 0.1) / 2, -0.02, { r: 0.004, rz: Math.atan2(lw - 0.12, h - 0.46) });
    const n = Math.max(4, Math.round(lw / 0.12));
    for (let i = 0; i < n; i++) {
      const x = -lw / 2 + 0.04 + ((lw - 0.08) * i) / (n - 1), top = h - 0.06 - 0.08 * Math.cos(((x / lw) * PI));
      const s = new THREE.Shape([new THREE.Vector2(-0.035, 0), new THREE.Vector2(0.035, 0), new THREE.Vector2(0.035, top - 0.1), new THREE.Vector2(0, top - 0.04), new THREE.Vector2(-0.035, top - 0.1)]);
      k.panel('leaf', wd, s, 0.02, x, 0.06, 0.006, { bevel: 0.002 });
    }
    for (const y of [0.18, h - 0.28]) k.box('hardware', p.metal, 0.3, 0.03, 0.006, -lw / 2 + 0.15, y, -0.038, { r: 0.002 });
    k.box('hardware', p.metal, 0.12, 0.04, 0.03, lw / 2 - 0.08, h - 0.4, 0.03, { r: 0.004 });
    k.rod('hardware', p.metal, [lw / 2 - 0.1, h - 0.4, 0.05], [lw / 2 - 0.03, h - 0.4, 0.05], 0.008);
    return finish(k);
  },
});

/* --------------------------------------------------------------- lounging */

const daybed = mk({
  id: 'out-canopy-daybed', category: 'outdoor', ko: '캐노피 야외 데이베드', en: 'Outdoor canopy daybed',
  params: [
    P.len('width', '폭', 'Width', 2.0, 1.6, 2.4), P.len('depth', '깊이', 'Depth', 1.5, 1.2, 1.9),
    P.mat('frame', '프레임', 'Frame', 'metal-aluminium'), P.mat('fabric', '쿠션·캐노피', 'Cushion / canopy', 'fabric-linen-white', 'fabric'),
    P.bool('curtains', '커튼', 'Curtains', true),
  ],
  tags: ['daybed', 'canopy bed', 'outdoor bed', 'cabana', '데이베드', '캐노피', '야외 침대', '선베드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.depth, H = 2.05, f = p.frame;
    k.box('frame', f, w, 0.25, d, 0, 0.2, 0, { r: 0.02 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.box('frame', f, 0.06, H, 0.06, sx * (w / 2 - 0.03), H / 2, sz * (d / 2 - 0.03), { r: 0.006 });
      k.box('frame', f, 0.08, 0.08, 0.08, sx * (w / 2 - 0.03), 0.04, sz * (d / 2 - 0.03), { r: 0.006 });
    }
    for (const sz of [-1, 1]) k.box('frame', f, w, 0.06, 0.06, 0, H - 0.03, sz * (d / 2 - 0.03), { r: 0.006 });
    for (const sx of [-1, 1]) k.box('frame', f, 0.06, 0.06, d, sx * (w / 2 - 0.03), H - 0.03, 0, { r: 0.006 });
    k.soft('cushion', p.fabric, w - 0.1, 0.16, d - 0.1, 0.05, 0, 0.405, 0, { puff: 0.015 });
    k.soft('cushion', p.fabric, w - 0.2, 0.42, 0.18, 0.07, 0, 0.66, -d / 2 + 0.16, { rx: -0.2, puff: 0.02 });
    for (const s of [-1, 1]) k.soft('pillows', 'fabric-mustard', 0.45, 0.4, 0.14, 0.06, s * 0.35, 0.68, -d / 2 + 0.3, { rx: -0.25, puff: 0.03 });
    k.box('canopy', p.fabric, w + 0.04, 0.02, d + 0.04, 0, H + 0.01, 0, { r: 0.006 });
    if (p.curtains) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      // gathered curtain at each post: a slim tapered drape
      k.cyl('canopy', p.fabric, 0.12, 0.07, H - 0.1, sx * (w / 2 - 0.13), 0.05, sz * (d / 2 - 0.13), { segs: k.seg(12, 6) });
    }
    return finish(k);
  },
});

const swingBed = mk({
  id: 'out-hanging-daybed', category: 'outdoor', ko: '원형 행잉 스윙 베드', en: 'Round hanging swing bed',
  params: [
    P.len('diameter', '지름', 'Diameter', 1.3, 1.0, 1.6), P.mat('stand', '스탠드', 'Stand', 'metal-black', 'metal'),
    P.mat('seat', '바구니', 'Basket', 'rattan'), P.mat('fabric', '쿠션', 'Cushion', 'fabric-linen-beige', 'fabric'),
  ],
  tags: ['swing bed', 'hanging bed', 'hanging chair', 'nest swing', '스윙 베드', '행잉 체어', '그네 침대', '흔들 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, H = 2.2, span = Math.max(1.9, p.diameter + 0.7), st = p.stand;
    // inverted-U stand (arc) with foot bars along z
    const pts = Array.from({ length: 17 }, (_, i) => { const a = PI * (i / 16); return [Math.cos(a) * span / 2, Math.sin(a) * (H - 0.05) + 0.04, 0]; });
    k.tube('stand', st, pts, 0.03);
    for (const s of [-1, 1]) k.box('stand', st, 0.06, 0.04, 1.0, s * span / 2, 0.02, 0, { r: 0.006 });
    const top = H - 0.05;
    k.rod('stand', st, [0, top, 0], [0, top - 0.35, 0], 0.012);
    const ring = top - 0.35;
    const sy = 0.42;
    // ropes from the hook to the rim
    for (let i = 0; i < 4; i++) { const a = PI / 4 + (i / 4) * PI * 2; k.rod('ropes', 'fabric-linen-beige', [0, ring, 0], [Math.cos(a) * R * 0.95, sy + 0.12, Math.sin(a) * R * 0.95], 0.008, { segs: 5 }); }
    k.lathe('basket', p.seat, [[0, sy - 0.12], [R * 0.7, sy - 0.12], [R * 0.98, sy - 0.02], [R, sy + 0.1], [R * 0.95, sy + 0.12], [R * 0.9, sy + 0.04], [0, sy]], 0, 0, 0, { segs: k.seg(32, 10) });
    k.soft('cushion', p.fabric, R * 1.5, 0.12, R * 1.5, 0.06, 0, sy + 0.06, 0, { puff: 0.02 });
    const back = new THREE.TorusGeometry(R * 0.8, 0.1, k.seg(10, 5), k.seg(24, 8), PI);
    back.rotateX(PI / 2); back.rotateY(0); back.translate(0, sy + 0.18, 0);
    // the half torus lies on the -z side (back)
    back.rotateY(PI);
    k.add('cushion', p.fabric, back);
    return finish(k);
  },
});

const sectional = mk({
  id: 'out-sectional-corner', category: 'outdoor', ko: '야외 코너 소파(ㄱ자)', en: 'Outdoor corner sectional',
  params: [
    P.len('width', '폭', 'Width', 2.8, 2.0, 3.6), P.len('depth', '깊이', 'Depth', 2.2, 1.6, 3.0),
    P.mat('frame', '프레임', 'Frame', 'rattan'), P.mat('fabric', '쿠션', 'Cushions', 'fabric-linen-white', 'fabric'),
  ],
  tags: ['outdoor sofa', 'sectional', 'corner sofa', 'patio lounge', '야외 소파', '코너 소파', 'ㄱ자 소파', '라탄 소파'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.depth, sd = 0.8, f = p.frame, bh = 0.3, by = 0.08;
    k.box('frame', f, w, bh, sd, 0, by + bh / 2, -d / 2 + sd / 2, { r: 0.02 });
    k.box('frame', f, sd, bh, d - sd, -w / 2 + sd / 2, by + bh / 2, sd / 2, { r: 0.02 });
    // backs along the back and the left side, arm on the right
    k.box('frame', f, w, 0.42, 0.12, 0, by + bh + 0.21, -d / 2 + 0.06, { r: 0.02 });
    k.box('frame', f, 0.12, 0.42, d - 0.12, -w / 2 + 0.06, by + bh + 0.21, 0.06, { r: 0.02 });
    k.box('frame', f, 0.14, 0.22, sd, w / 2 - 0.07, by + bh + 0.11, -d / 2 + sd / 2, { r: 0.02 });
    for (const [x, z] of [[-w / 2 + 0.05, -d / 2 + 0.05], [w / 2 - 0.05, -d / 2 + 0.05], [w / 2 - 0.05, -d / 2 + sd - 0.05], [-w / 2 + 0.05, d / 2 - 0.05], [-w / 2 + sd - 0.05, d / 2 - 0.05], [-w / 2 + sd - 0.05, -d / 2 + sd - 0.05]]) k.box('feet', 'metal-black', 0.05, by, 0.05, x, by / 2, z, { r: 0.004 });
    const ct = 0.13, cy = by + bh + ct / 2;
    // long run seats (after the corner seat), return seats
    const runL = w - sd - 0.14, nL = Math.max(1, Math.round(runL / 0.75)), cwL = runL / nL;
    k.soft('cushions', p.fabric, sd - 0.12, ct, sd - 0.14, 0.04, -w / 2 + sd / 2 + 0.06, cy, -d / 2 + sd / 2 + 0.06, { puff: 0.012 });
    for (let i = 0; i < nL; i++) {
      const x = -w / 2 + sd + cwL * (i + 0.5);
      k.soft('cushions', p.fabric, cwL - 0.01, ct, sd - 0.14, 0.04, x, cy, -d / 2 + sd / 2 + 0.06, { puff: 0.012 });
      k.soft('cushions', p.fabric, cwL - 0.03, 0.4, 0.14, 0.05, x, cy + 0.24, -d / 2 + 0.2, { rx: -0.18, puff: 0.02 });
    }
    const runZ = d - sd, nZ = Math.max(1, Math.round(runZ / 0.75)), cwZ = runZ / nZ;
    for (let i = 0; i < nZ; i++) {
      const z = -d / 2 + sd + cwZ * (i + 0.5);
      k.soft('cushions', p.fabric, sd - 0.14, ct, cwZ - 0.01, 0.04, -w / 2 + sd / 2 + 0.06, cy, z, { puff: 0.012 });
      k.soft('cushions', p.fabric, 0.14, 0.4, cwZ - 0.03, 0.05, -w / 2 + 0.2, cy + 0.24, z, { rz: 0.18, puff: 0.02 });
    }
    k.soft('cushions', p.fabric, 0.5, 0.4, 0.14, 0.05, -w / 2 + 0.45, cy + 0.24, -d / 2 + 0.2, { rx: -0.18, puff: 0.02 });
    return finish(k);
  },
});

/** Slatted garden chair at the origin, facing +z. */
function gardenChair(k, wd) {
  const sh = 0.45, w = 0.48, d = 0.5;
  for (const sx of [-1, 1]) {
    k.box('chairs', wd, 0.04, sh, 0.04, sx * (w / 2 - 0.03), sh / 2, d / 2 - 0.04, { r: 0.004 });
    k.box('chairs', wd, 0.04, 0.92, 0.04, sx * (w / 2 - 0.03), 0.46, -d / 2 + 0.06, { r: 0.004, rx: -0.08 });
    k.box('chairs', wd, 0.04, 0.04, d - 0.04, sx * (w / 2 - 0.03), 0.66, 0.02, { r: 0.004 });
  }
  for (let i = 0; i < 5; i++) k.box('chairs', wd, w, 0.02, 0.075, 0, sh, -d / 2 + 0.07 + i * 0.09, { r: 0.004 });
  for (let i = 0; i < 3; i++) k.box('chairs', wd, w - 0.06, 0.07, 0.02, 0, 0.62 + i * 0.1, -d / 2 + 0.07 - (0.04 + i * 0.1) * 0.08, { r: 0.004, rx: -0.08 });
}

const diningSet = mk({
  id: 'out-dining-set', category: 'outdoor', ko: '야외 식탁 세트(티크)', en: 'Teak outdoor dining set',
  params: [
    P.len('length', '식탁 길이', 'Table length', 1.8, 1.2, 2.6), P.int('chairs', '의자 수', 'Chairs', 6, 2, 8),
    P.mat('wood', '목재', 'Wood', 'wood-teak', 'wood'), P.bool('umbrella', '파라솔 구멍 마개', 'Umbrella hole cap', true),
  ],
  tags: ['outdoor dining', 'patio dining set', 'garden table', 'teak', '야외 식탁', '정원 식탁', '티크 식탁', '테라스'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, D = 0.95, H = 0.75, wd = p.wood;
    const n = Math.round(p.chairs), ends = n >= 6 ? 2 : 0, per = Math.ceil((n - ends) / 2);
    const slats = Math.round(D / 0.1);
    for (let i = 0; i < slats; i++) k.box('table', wd, L, 0.03, D / slats - 0.008, 0, H - 0.015, -D / 2 + (D / slats) * (i + 0.5), { r: 0.003 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('table', wd, 0.07, H - 0.03, 0.07, sx * (L / 2 - 0.08), (H - 0.03) / 2, sz * (D / 2 - 0.08), { r: 0.005 });
    for (const sz of [-1, 1]) k.box('table', wd, L - 0.2, 0.08, 0.03, 0, H - 0.07, sz * (D / 2 - 0.06), { r: 0.003 });
    if (p.umbrella) k.cyl('cap', 'metal-steel', 0.03, 0.03, 0.005, 0, H, 0, { segs: k.seg(12, 6) });
    let placed = 0;
    for (const sz of [-1, 1]) for (let i = 0; i < per && placed < n - ends; i++, placed++) {
      const x = -L / 2 + (L / per) * (i + 0.5);
      transformAdded(k, () => gardenChair(k, wd), x, 0, sz * (D / 2 + 0.2), sz < 0 ? 0 : PI);
    }
    if (ends) for (const sx of [-1, 1]) transformAdded(k, () => gardenChair(k, wd), sx * (L / 2 + 0.25), 0, 0, sx < 0 ? PI / 2 : -PI / 2);
    return finish(k);
  },
});

/* ---------------------------------------------------------------- cooking */

const kamado = mk({
  id: 'out-kamado-grill', category: 'outdoor', ko: '카마도 세라믹 그릴', en: 'Kamado ceramic grill',
  params: [P.mat('shell', '본체', 'Shell', 'ceramic-matte'), P.mat('shelf', '사이드 선반', 'Side shelves', 'wood-teak', 'wood')],
  tags: ['kamado', 'ceramic grill', 'egg grill', 'bbq', 'smoker', '카마도', '세라믹 그릴', '바베큐', '훈연기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const y0 = 0.42;
    // nest stand
    k.add('stand', 'metal-black', new THREE.TorusGeometry(0.27, 0.012, k.seg(8, 4), k.seg(32, 10)).rotateX(PI / 2).translate(0, y0, 0));
    for (let i = 0; i < 4; i++) {
      const a = PI / 4 + (i * PI) / 2, c = Math.cos(a), s = Math.sin(a);
      k.rod('stand', 'metal-black', [c * 0.27, y0, s * 0.27], [c * 0.3, 0.06, s * 0.3], 0.012);
      k.cyl('stand', 'rubber-black', 0.03, 0.03, 0.025, c * 0.3, 0.03, s * 0.3, { rz: PI / 2, segs: k.seg(12, 6) });
    }
    k.lathe('shell', p.shell, [[0, y0 - 0.05], [0.18, y0 - 0.04], [0.28, y0 + 0.08], [0.33, y0 + 0.28], [0.335, y0 + 0.4], [0.33, y0 + 0.43], [0.32, y0 + 0.47], [0.3, y0 + 0.6], [0.22, y0 + 0.75], [0.1, y0 + 0.81], [0, y0 + 0.82]], 0, 0, 0, { segs: k.seg(36, 10), smooth: 16 });
    k.add('band', 'metal-steel', new THREE.TorusGeometry(0.333, 0.012, k.seg(6, 3), k.seg(36, 10)).rotateX(PI / 2).translate(0, y0 + 0.44, 0));
    k.cyl('band', 'metal-steel', 0.055, 0.06, 0.06, 0, y0 + 0.8, 0, { segs: k.seg(16, 6) });
    k.box('band', 'metal-steel', 0.12, 0.08, 0.02, 0, y0 + 0.14, 0.31, { r: 0.004 });
    k.box('band', 'metal-steel', 0.06, 0.06, 0.16, 0, y0 + 0.5, 0.32, { r: 0.006 });
    k.box('shelf', p.shelf, 0.3, 0.04, 0.12, 0, y0 + 0.5, 0.42, { r: 0.012 });
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) k.box('shelf', p.shelf, 0.32, 0.025, 0.07, s * 0.5, y0 + 0.4, -0.13 + i * 0.087, { r: 0.004 });
    for (const s of [-1, 1]) k.box('stand', 'metal-black', 0.14, 0.03, 0.03, s * 0.36, y0 + 0.385, 0, { r: 0.003 });
    return finish(k);
  },
});

const bbqIsland = mk({
  id: 'out-bbq-island', category: 'outdoor', ko: '야외 주방 아일랜드(그릴)', en: 'Outdoor kitchen island with grill',
  params: [
    P.len('width', '폭', 'Width', 2.2, 1.6, 3.0), P.mat('body', '외장', 'Cladding', 'travertine', 'stone'),
    P.mat('top', '상판', 'Counter', 'granite-grey', 'stone'), P.bool('sink', '싱크', 'Sink', true),
  ],
  tags: ['outdoor kitchen', 'bbq island', 'grill island', 'built-in grill', '야외 주방', '바베큐 아일랜드', '빌트인 그릴', '아웃도어 키친'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.68, h = 0.9;
    const top = addCabinet(k, { w, h, d, rows: [{ h: 1, n: 4, type: 'door' }], body: p.body, front: 'metal-steel', handle: 'bar', handleMat: 'metal-chrome', top: p.top, topThick: 0.04, topOverhang: 0.03, plinth: 0.06 }).top;
    const gx = -w / 2 + 0.5;
    k.box('grill', 'metal-steel', 0.78, 0.12, 0.52, gx, top + 0.02, 0, { r: 0.008 });
    k.rbox('grill', 'metal-steel', 0.76, 0.24, 0.48, 0.08, gx, top + 0.2, -0.03, { segs: k.seg(3, 1) });
    k.rod('knobs', 'metal-chrome', [gx - 0.3, top + 0.22, 0.24], [gx + 0.3, top + 0.22, 0.24], 0.01);
    for (let i = 0; i < 4; i++) k.cyl('knobs', 'plastic-black', 0.022, 0.022, 0.03, gx - 0.24 + i * 0.16, top + 0.0, 0.26, { rx: PI / 2, segs: k.seg(14, 6) });
    if (p.sink) {
      const sx = w / 2 - 0.4;
      k.box('sink', 'metal-steel', 0.44, 0.01, 0.38, sx, top + 0.005, 0, { r: 0.004 });
      k.box('sink', 'screen-black', 0.38, 0.004, 0.32, sx, top + 0.011, 0, { r: 0 });
      k.cyl('sink', 'metal-chrome', 0.022, 0.025, 0.04, sx, top, -0.24, { segs: k.seg(12, 6) });
      k.tube('sink', 'metal-chrome', [[sx, top + 0.04, -0.24], [sx, top + 0.3, -0.24], [sx, top + 0.36, -0.15], [sx, top + 0.3, -0.08]], 0.012);
    }
    return finish(k);
  },
});

const firewood = mk({
  id: 'out-firewood-rack', category: 'outdoor', ko: '장작 거치대', en: 'Firewood log rack',
  params: [P.len('width', '폭', 'Width', 1.2, 0.6, 1.8), P.len('height', '높이', 'Height', 1.2, 0.6, 1.8), P.num('fill', '채움', 'Fill', 0.8, 0, 1, 0.05)],
  tags: ['firewood', 'log rack', 'log store', 'wood pile', '장작', '장작 거치대', '땔감', '통나무'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, d = 0.36;
    for (const s of [-1, 1]) {
      for (const z of [-d / 2 + 0.015, d / 2 - 0.015]) k.box('rack', 'metal-black', 0.03, h, 0.03, s * (w / 2 - 0.015), h / 2, z, { r: 0.003 });
      k.box('rack', 'metal-black', 0.03, 0.03, d, s * (w / 2 - 0.015), h - 0.015, 0, { r: 0.003 });
    }
    for (const z of [-d / 2 + 0.015, d / 2 - 0.015]) { k.box('rack', 'metal-black', w, 0.03, 0.03, 0, 0.06, z, { r: 0.003 }); k.box('rack', 'metal-black', w, 0.03, 0.03, 0, h - 0.015, z, { r: 0.003 }); }
    for (const s of [-1, 1]) k.box('rack', 'metal-black', 0.05, 0.05, d + 0.04, s * (w / 2 - 0.1), 0.025, 0, { r: 0.004 });
    const r = rng(9), lr = 0.055, iw = w - 0.06, rows = Math.floor(((h - 0.1) * p.fill) / (lr * 1.75));
    for (let j = 0; j < rows; j++) {
      const off = j % 2 ? lr : 0, n = Math.floor((iw - off) / (2 * lr));
      for (let i = 0; i < n; i++) {
        const rr = lr * (0.82 + r() * 0.18), x = -iw / 2 + off + lr + i * 2 * lr, y = 0.075 + lr + j * lr * 1.73;
        k.cyl('logs', r() > 0.5 ? 'wood-dark' : 'wood-pine', rr, rr, d - 0.02, x, y, -(d - 0.02) / 2, { rx: PI / 2, segs: k.seg(9, 5) });
      }
    }
    return finish(k);
  },
});

/* ------------------------------------------------------------------ water */

const birdBath = mk({
  id: 'out-bird-bath', category: 'outdoor', ko: '석조 새 물그릇(버드배스)', en: 'Stone bird bath',
  params: [P.len('height', '높이', 'Height', 0.75, 0.5, 1.0), P.mat('stone', '석재', 'Stone', 'concrete', 'stone'), P.bool('water', '물', 'Water', true)],
  tags: ['bird bath', 'garden ornament', 'pedestal', '버드배스', '새 물그릇', '정원 장식', '석조'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const h = p.height, R = 0.3;
    k.lathe('stone', p.stone, [[0, 0], [0.18, 0], [0.18, 0.05], [0.12, 0.08], [0.08, 0.15], [0.065, h * 0.5], [0.08, h - 0.12], [0.12, h - 0.08], [R * 0.7, h - 0.04], [R, h], [R, h + 0.04], [R - 0.03, h + 0.04], [R * 0.7, h], [0, h - 0.03]], 0, 0, 0, { segs: k.seg(32, 10) });
    if (p.water) k.cyl('water', 'water', R - 0.04, R * 0.6, 0.02, 0, h, 0, { segs: k.seg(32, 10) });
    return finish(k);
  },
});

const fountain = mk({
  id: 'out-fountain-tiered', category: 'outdoor', ko: '3단 정원 분수', en: 'Three-tier garden fountain',
  params: [P.len('diameter', '수반 지름', 'Basin diameter', 1.4, 0.9, 2.2), P.mat('stone', '석재', 'Stone', 'travertine', 'stone')],
  tags: ['fountain', 'tiered fountain', 'garden fountain', 'water feature', '분수', '정원 분수', '수반', '조경'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, st = p.stone;
    k.lathe('stone', st, [[0, 0], [R, 0], [R + 0.03, 0.04], [R + 0.03, 0.38], [R - 0.06, 0.4], [R - 0.08, 0.06], [0, 0.06]], 0, 0, 0, { segs: k.seg(40, 12) });
    k.cyl('water', 'water', R - 0.08, R - 0.08, 0.26, 0, 0.06, 0, { segs: k.seg(40, 12) });
    k.lathe('stone', st, [[0, 0.06], [0.16, 0.06], [0.1, 0.2], [0.07, 0.75], [0.1, 0.82], [0, 0.82]], 0, 0, 0, { segs: k.seg(24, 8) });
    const tiers = [[R * 0.55, 0.85], [R * 0.32, 1.25]];
    for (const [r, y] of tiers) {
      k.lathe('stone', st, [[0, y - 0.03], [r * 0.3, y - 0.03], [r, y + 0.07], [r, y + 0.1], [r - 0.03, y + 0.1], [r * 0.3, y + 0.02], [0, y + 0.02]], 0, 0, 0, { segs: k.seg(32, 10) });
      k.cyl('water', 'water', r - 0.04, r * 0.5, 0.05, 0, y + 0.03, 0, { segs: k.seg(32, 10) });
    }
    k.lathe('stone', st, [[0, 0.9], [0.06, 0.9], [0.04, 1.22], [0, 1.22]], 0, 0, 0, { segs: k.seg(16, 6) });
    k.lathe('stone', st, [[0, 1.33], [0.04, 1.33], [0.03, 1.48], [0.06, 1.52], [0.03, 1.6], [0, 1.62]], 0, 0, 0, { segs: k.seg(16, 6) });
    return finish(k);
  },
});

const hotTub = mk({
  id: 'out-hot-tub', category: 'outdoor', ko: '야외 스파 욕조(핫텁)', en: 'Outdoor hot tub',
  params: [
    P.len('width', '폭', 'Width', 2.1, 1.6, 2.4), P.mat('cladding', '외장', 'Cabinet', 'wood-teak', 'wood'),
    P.bool('cover', '덮개', 'Cover on', false), P.bool('steps', '계단', 'Steps', true),
  ],
  tags: ['hot tub', 'spa', 'jacuzzi', 'whirlpool', '스파', '핫텁', '자쿠지', '야외 욕조'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = 0.9;
    // vertical cladding boards around a plinth
    k.box('cabinet', 'plastic-black', w - 0.04, 0.06, w - 0.04, 0, 0.03, 0, { r: 0.005 });
    const n = Math.round(w / 0.1);
    for (const s of [-1, 1]) for (let i = 0; i < n; i++) {
      const u = -w / 2 + (w / n) * (i + 0.5);
      k.box('cabinet', p.cladding, w / n - 0.006, h - 0.12, 0.02, u, 0.06 + (h - 0.12) / 2, s * (w / 2 - 0.01), { r: 0.003 });
      k.box('cabinet', p.cladding, 0.02, h - 0.12, w / n - 0.006, s * (w / 2 - 0.01), 0.06 + (h - 0.12) / 2, u, { r: 0.003 });
    }
    const rim = roundRect(w, w, 0.12), hole = new THREE.Path();
    const iw = w - 0.3, r = 0.2, ix = -iw / 2, iy = -iw / 2;
    hole.moveTo(ix + r, iy); hole.lineTo(ix + iw - r, iy); hole.quadraticCurveTo(ix + iw, iy, ix + iw, iy + r); hole.lineTo(ix + iw, iy + iw - r); hole.quadraticCurveTo(ix + iw, iy + iw, ix + iw - r, iy + iw); hole.lineTo(ix + r, iy + iw); hole.quadraticCurveTo(ix, iy + iw, ix, iy + iw - r); hole.lineTo(ix, iy + r); hole.quadraticCurveTo(ix, iy, ix + r, iy);
    rim.holes.push(hole);
    k.slab('shell', 'plastic-white', rim, 0.06, h - 0.06, { bevel: 0.01 });
    k.box('shell', 'plastic-white', iw, 0.7, iw, 0, h - 0.06 - 0.35, 0, { r: 0.08, segs: 2 });
    if (p.cover) {
      for (const s of [-1, 1]) k.rbox('cover', 'plastic-grey', w - 0.02, 0.09, w / 2 - 0.01, 0.03, 0, h + 0.045, s * (w / 4), { segs: k.seg(3, 1) });
    } else {
      k.box('water', 'water', iw - 0.02, 0.02, iw - 0.02, 0, h - 0.1, 0, { r: 0 });
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.rbox('pillows', 'rubber-black', 0.26, 0.08, 0.12, 0.03, x * (w / 2 - 0.3), h + 0.03, z * (w / 2 - 0.12), { segs: k.seg(3, 1) });
      for (let i = 0; i < 6; i++) k.cyl('jets', 'metal-chrome', 0.02, 0.02, 0.01, -iw / 2 + 0.2 + i * (iw - 0.4) / 5, h - 0.35, -iw / 2 + 0.002, { rx: PI / 2, segs: k.seg(10, 5) });
    }
    if (p.steps) {
      k.box('steps', p.cladding, 0.9, 0.22, 0.5, 0, 0.11, w / 2 + 0.26, { r: 0.008 });
      k.box('steps', p.cladding, 0.9, 0.22, 0.25, 0, 0.33, w / 2 + 0.135, { r: 0.008 });
    }
    return finish(k);
  },
});

const shower = mk({
  id: 'out-shower', category: 'outdoor', ko: '야외 샤워기(데크 받침)', en: 'Outdoor shower on deck tray',
  params: [P.mat('metal', '샤워 기둥', 'Column', 'metal-steel', 'metal'), P.mat('deck', '데크', 'Deck', 'wood-teak', 'wood'), P.bool('hand', '핸드 샤워', 'Hand shower', true)],
  tags: ['outdoor shower', 'pool shower', 'garden shower', 'beach shower', '야외 샤워', '수영장 샤워', '정원 샤워기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const m = p.metal, s = 0.9, H = 2.2;
    for (const x of [-0.35, 0.35]) k.box('deck', p.deck, 0.05, 0.05, s, x, 0.025, 0, { r: 0.004 });
    const n = 8;
    for (let i = 0; i < n; i++) k.box('deck', p.deck, s, 0.025, s / n - 0.012, 0, 0.0625, -s / 2 + (s / n) * (i + 0.5), { r: 0.003 });
    const z0 = -s / 2 + 0.06;
    k.box('column', m, 0.2, 0.012, 0.2, 0, 0.081, z0, { r: 0.003 });
    k.cyl('column', m, 0.025, 0.025, H - 0.09, 0, 0.087, z0, { segs: k.seg(16, 6) });
    k.tube('column', m, [[0, H - 0.05, z0], [0, H + 0.02, z0 + 0.06], [0, H + 0.02, z0 + 0.4]], 0.018);
    k.cyl('column', m, 0.13, 0.11, 0.025, 0, H - 0.005, z0 + 0.42, { segs: k.seg(24, 8) });
    k.cyl('column', m, 0.035, 0.035, 0.08, 0, 1.0, z0, { rx: PI / 2, segs: k.seg(12, 6) });
    k.box('column', m, 0.12, 0.016, 0.02, 0.05, 1.0, z0 + 0.09, { r: 0.004 });
    if (p.hand) {
      k.box('column', m, 0.05, 0.05, 0.05, 0, 1.3, z0 + 0.04, { r: 0.006 });
      k.cyl('column', m, 0.022, 0.016, 0.24, 0, 1.18, z0 + 0.08, { segs: k.seg(12, 6) });
      k.tube('hose', 'metal-chrome', [[0, 1.18, z0 + 0.08], [0.03, 0.85, z0 + 0.12], [0.02, 0.6, z0 + 0.05], [0, 1.0, z0 + 0.03]], 0.008);
    }
    return finish(k);
  },
});

const waterButt = mk({
  id: 'out-water-butt', category: 'outdoor', ko: '빗물 저장통', en: 'Rain water butt',
  params: [P.len('height', '높이', 'Height', 0.95, 0.7, 1.2), P.color('color', '색', 'Colour', '#3d5a40')],
  tags: ['water butt', 'rain barrel', 'rainwater tank', '빗물통', '빗물 저장통', '물통', '정원'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const h = p.height, R = 0.3, y0 = 0.3, ov = { color: p.color };
    for (const s of [-1, 1]) k.box('stand', 'concrete', 0.6, 0.15, 0.22, 0, 0.075 + (s > 0 ? 0.15 : 0), s * 0.0, { r: 0.006 });
    k.lathe('barrel', 'plastic-grey', [[0, y0], [R * 0.85, y0], [R * 0.95, y0 + 0.05], [R, y0 + h * 0.5], [R * 0.95, y0 + h - 0.05], [R * 0.9, y0 + h], [0, y0 + h]], 0, 0, 0, { segs: k.seg(32, 10), overrides: ov });
    for (const f of [0.25, 0.5, 0.75]) k.add('barrel', 'plastic-grey', new THREE.TorusGeometry(R * (f === 0.5 ? 1 : 0.985), 0.01, k.seg(6, 3), k.seg(32, 10)).rotateX(PI / 2).translate(0, y0 + h * f, 0), { overrides: ov });
    k.cyl('lid', 'plastic-black', R * 0.86, R * 0.88, 0.03, 0, y0 + h, 0, { segs: k.seg(32, 10) });
    k.cyl('tap', 'metal-brass', 0.018, 0.018, 0.07, 0, y0 + 0.1, R - 0.01, { rx: PI / 2, segs: k.seg(10, 5) });
    k.box('tap', 'metal-brass', 0.05, 0.012, 0.012, 0, y0 + 0.13, R + 0.05, { r: 0.003 });
    return finish(k);
  },
});

/* -------------------------------------------------------------------- kids */

const trampoline = mk({
  id: 'out-trampoline', category: 'outdoor', ko: '안전망 트램펄린', en: 'Trampoline with safety net',
  params: [P.len('diameter', '지름', 'Diameter', 3.0, 2.4, 4.3), P.mat('pad', '패드', 'Pad', 'fabric-navy', 'fabric'), P.bool('net', '안전망', 'Safety net', true)],
  tags: ['trampoline', 'garden trampoline', 'kids', 'safety net', '트램펄린', '방방', '아이', '놀이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, y = 0.85;
    k.tube('frame', 'metal-steel', circle(R, y, 24), 0.022, { closed: true, segs: k.seg(72, 24), radial: k.seg(10, 5) });
    k.cyl('mat', 'rubber-black', R - 0.18, R - 0.18, 0.006, 0, y - 0.01, 0, { segs: k.seg(40, 12) });
    k.add('pad', p.pad, new THREE.TorusGeometry(R - 0.09, 0.08, k.seg(8, 4), k.seg(40, 12)).rotateX(PI / 2).scale(1, 0.35, 1).translate(0, y + 0.01, 0));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2 + PI / 6, c = Math.cos(a), s = Math.sin(a);
      // W-legs: two struts from the frame meeting a foot bar
      const t = 0.18;
      k.rod('frame', 'metal-steel', [c * R - s * t, y, s * R + c * t], [c * R, 0.02, s * R], 0.02, { segs: 8 });
      k.rod('frame', 'metal-steel', [c * R + s * t, y, s * R - c * t], [c * R, 0.02, s * R], 0.02, { segs: 8 });
      k.rod('frame', 'metal-steel', [c * (R - 0.25), 0.02, s * (R - 0.25)], [c * (R + 0.15), 0.02, s * (R + 0.15)], 0.02, { segs: 8 });
    }
    if (p.net) {
      const top = y + 1.75;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * PI * 2, c = Math.cos(a), s = Math.sin(a);
        k.rod('posts', 'metal-steel', [c * (R + 0.02), y - 0.25, s * (R + 0.02)], [c * (R + 0.02), top, s * (R + 0.02)], 0.018, { segs: 8 });
        k.cyl('posts', 'rubber-black', 0.03, 0.03, top - y - 0.1, c * (R + 0.02), y + 0.1, s * (R + 0.02), { segs: 8 });
      }
      k.tube('net', 'fabric-wool-charcoal', circle(R + 0.01, top - 0.02, 32), 0.01, { closed: true, segs: k.seg(72, 24), radial: k.seg(8, 4) });
      for (let j = 1; j < 6; j++) k.tube('net', 'fabric-wool-charcoal', circle(R + 0.005, y + 0.05 + j * 0.28, 32), 0.004, { closed: true, radial: 4, segs: k.seg(64, 20) });
    }
    return finish(k);
  },
});

const sandbox = mk({
  id: 'out-sandbox', category: 'outdoor', ko: '원목 모래 놀이터(샌드박스)', en: 'Wooden sandbox with corner seats',
  params: [P.len('width', '폭', 'Width', 1.5, 1.0, 2.2), P.mat('wood', '목재', 'Wood', 'wood-pine', 'wood'), P.bool('toys', '장난감', 'Toys', true)],
  tags: ['sandbox', 'sandpit', 'kids play', 'garden play', '모래 놀이', '샌드박스', '모래 놀이터', '아이 놀이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = 0.28, t = 0.04, wd = p.wood;
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
      const y = 0.07 + i * 0.14;
      k.box('box', wd, w, 0.13, t, 0, y, s * (w / 2 - t / 2), { r: 0.005 });
      k.box('box', wd, t, 0.13, w - 2 * t, s * (w / 2 - t / 2), y, 0, { r: 0.005 });
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const tri = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(-sx * 0.32, 0), new THREE.Vector2(0, -sz * 0.32)]);
      k.slab('box', wd, tri, 0.025, h, { x: sx * (w / 2), z: sz * (w / 2), bevel: 0.003 });
    }
    k.box('sand', 'travertine', w - 2 * t, 0.2, w - 2 * t, 0, 0.1, 0, { r: 0.02 });
    if (p.toys) {
      k.lathe('toys', 'plastic-white', [[0, 0.2], [0.07, 0.2], [0.085, 0.31], [0.08, 0.31], [0, 0.22]], 0.2, 0, 0.1, { segs: k.seg(16, 6), overrides: { color: '#e04b3a' } });
      k.box('toys', 'plastic-white', 0.05, 0.015, 0.22, -0.2, 0.21, -0.1, { r: 0.004, ry: 0.6, overrides: { color: '#f2c12e' } });
    }
    return finish(k);
  },
});

/* ---------------------------------------------------------------- utility */

const bikeRack = mk({
  id: 'out-bike-rack', category: 'outdoor', ko: '자전거 거치대(후프형)', en: 'Hoop bike rack',
  params: [P.int('hoops', '거치 수', 'Hoops', 4, 2, 8), P.mat('metal', '금속', 'Metal', 'metal-steel', 'metal')],
  tags: ['bike rack', 'bicycle stand', 'cycle rack', '자전거 거치대', '자전거 보관대', '자전거'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = Math.round(p.hoops), pitch = 0.5, L = (n - 1) * pitch + 0.2, m = p.metal;
    for (const z of [-0.3, 0.3]) k.box('rack', m, L, 0.04, 0.05, 0, 0.02, z, { r: 0.004 });
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + 0.1 + i * pitch;
      k.bentTube('rack', m, [[x, 0.04, -0.3], [x, 0.8, -0.3], [x, 0.8, 0.3], [x, 0.04, 0.3]], 0.024, 0.15);
    }
    return finish(k);
  },
});

const mailbox = mk({
  id: 'out-mailbox', category: 'outdoor', ko: '기둥형 우편함', en: 'Post-mounted mailbox',
  params: [P.mat('box', '우편함', 'Box', 'metal-black', 'metal'), P.mat('post', '기둥', 'Post', 'wood-white'), P.bool('flag', '깃발 올림', 'Flag up', true)],
  tags: ['mailbox', 'letter box', 'post box', '우편함', '우체통', '편지함'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const top = 1.05, bw = 0.18, bl = 0.48, bh = 0.13;
    k.box('post', p.post, 0.09, top, 0.09, 0, top / 2, 0, { r: 0.006 });
    k.box('post', p.post, 0.1, 0.03, bl * 0.7, 0, top + 0.015, 0, { r: 0.004 });
    k.box('box', p.box, bw, bh, bl, 0, top + 0.03 + bh / 2, 0, { r: 0.006 });
    k.cyl('box', p.box, bw / 2, bw / 2, bl, 0, top + 0.03 + bh, -bl / 2, { rx: PI / 2, segs: k.seg(20, 8) });
    k.box('box', p.box, bw + 0.01, bh + bw / 2 + 0.01, 0.01, 0, top + 0.03 + (bh + bw / 2) / 2, bl / 2 + 0.005, { r: 0.004 });
    k.cyl('trim', 'metal-brass', 0.012, 0.012, 0.02, 0, top + 0.03 + bh, bl / 2 + 0.01, { rx: PI / 2, segs: k.seg(10, 5) });
    const fx = bw / 2 + 0.01, fy = top + 0.03 + bh * 0.6;
    if (p.flag) { k.box('flag', 'paint-white-matte', 0.006, 0.22, 0.025, fx, fy + 0.1, -0.1, { r: 0.002, overrides: { color: '#c0392b' } }); k.box('flag', 'paint-white-matte', 0.006, 0.07, 0.09, fx, fy + 0.18, -0.06, { r: 0.002, overrides: { color: '#c0392b' } }); }
    else k.box('flag', 'paint-white-matte', 0.006, 0.025, 0.22, fx, fy, -0.05, { r: 0.002, overrides: { color: '#c0392b' } });
    return finish(k);
  },
});

const compost = mk({
  id: 'out-compost-bays', category: 'outdoor', ko: '2칸 원목 퇴비함', en: 'Two-bay timber compost bin',
  params: [P.len('width', '폭', 'Width', 1.8, 1.2, 2.6), P.mat('wood', '목재', 'Wood', 'wood-pine', 'wood'), P.bool('compost', '퇴비', 'Compost heap', true)],
  tags: ['compost', 'compost bin', 'garden', '퇴비', '퇴비함', '컴포스트', '정원 용품'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.9, h = 0.9, wd = p.wood, n = 6, sh = h / n;
    for (let i = 0; i < n; i++) {
      const y = sh * (i + 0.5);
      k.box('slats', wd, w, sh - 0.025, 0.025, 0, y, -d / 2 + 0.0125, { r: 0.003 });
      for (const x of [-w / 2 + 0.0125, 0, w / 2 - 0.0125]) k.box('slats', wd, 0.025, sh - 0.025, d - 0.025, x, y, 0.0125, { r: 0.003 });
      if (i < 3) for (const s of [-1, 1]) k.box('slats', wd, w / 2 - 0.06, sh - 0.025, 0.025, s * w / 4, y, d / 2 - 0.05, { r: 0.003 });
    }
    for (const x of [-w / 2 + 0.04, -0.04, 0.04, w / 2 - 0.04]) for (const z of [-d / 2 + 0.04, d / 2 - 0.04]) k.box('posts', wd, 0.05, h + 0.04, 0.05, x, (h + 0.04) / 2, z, { r: 0.004 });
    if (p.compost) k.sphere('heap', 'soil', Math.min(w / 4 - 0.06, 0.36), -w / 4, 0, 0, { scale: [1, 0.55, 1], thetaLength: PI / 2, segs: k.seg(16, 6), rings: k.seg(8, 3) });
    return finish(k);
  },
});

const wheelbarrow = mk({
  id: 'out-wheelbarrow', category: 'outdoor', ko: '외바퀴 손수레', en: 'Wheelbarrow',
  params: [P.mat('tray', '통', 'Tray', 'paint-green-matte'), P.mat('handles', '손잡이', 'Handles', 'wood-ash', 'wood')],
  tags: ['wheelbarrow', 'garden cart', 'barrow', '손수레', '외발 수레', '리어카', '정원 도구'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const tray = new THREE.CylinderGeometry(0.4, 0.26, 0.3, 4, 1, false);
    tray.rotateY(PI / 4); tray.scale(1.05, 1, 1.4); tray.translate(0, 0.55, 0.05);
    k.add('tray', p.tray, tray);
    k.add('wheel', 'rubber-black', new THREE.TorusGeometry(0.15, 0.045, k.seg(10, 5), k.seg(28, 10)).rotateY(PI / 2).translate(0, 0.195, 0.62));
    k.cyl('wheel', 'metal-steel', 0.06, 0.06, 0.06, -0.03, 0.195, 0.62, { rz: PI / 2, segs: k.seg(14, 6) });
    for (const s of [-1, 1]) {
      k.rod('handles', p.handles, [s * 0.12, 0.2, 0.66], [s * 0.3, 0.42, -0.85], 0.02, { segs: 8 });
      k.cyl('grips', 'rubber-black', 0.024, 0.024, 0.13, s * 0.3, 0.42, -0.98, { rx: PI / 2, segs: 8 });
      k.rod('legs', 'metal-steel', [s * 0.25, 0.4, -0.45], [s * 0.26, 0.0, -0.5], 0.012, { segs: 6 });
      k.rod('legs', 'metal-steel', [s * 0.26, 0.0, -0.5], [s * 0.26, 0.38, -0.25], 0.012, { segs: 6 });
    }
    return finish(k);
  },
});

export const ITEMS = [
  pergola, gazebo, shed, arbour, fence, gate, daybed, swingBed, sectional, diningSet, kamado, bbqIsland,
  firewood, birdBath, fountain, hotTub, shower, waterButt, trampoline, sandbox, bikeRack, mailbox, compost, wheelbarrow,
];
