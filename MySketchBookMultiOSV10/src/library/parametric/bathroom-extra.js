// Further bathroom items: whirlpool tub, home sauna cabin, steam shower cabin, hand dryer,
// extending magnifying mirror, washer/dryer tower cabinet, shower panel column, slatted duckboard,
// folding shower seat, washing bowl and dipper set. See ARCHITECTURE.md §12 → Library objects.
import { Kit, P, roundRect, frameShape } from './helpers.js';
import { finish } from './kitchen.js';
import { mk } from './appliances-more.js';

const PI = Math.PI;
const CAT = 'bathroom';

const whirlpool = mk({
  id: 'bath-whirlpool-tub', category: CAT, ko: '월풀 욕조(제트 마사지)', en: 'Whirlpool tub with jets',
  params: [
    P.len('length', '길이', 'Length', 1.7, 1.4, 1.9),
    P.len('width', '폭', 'Width', 0.85, 0.7, 1.2),
    P.mat('panel', '앞판', 'Front panel', 'tile-grey', 'tile'),
    P.bool('water', '물', 'Water', true),
  ],
  tags: ['whirlpool', 'jacuzzi', 'spa bath', 'jet tub', 'bathtub', '월풀 욕조', '자쿠지', '욕조', '스파'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, W = p.width, h = 0.56;
    k.box('panel', p.panel, L, h - 0.03, W, 0, (h - 0.03) / 2, 0, { r: 0.004 });
    const rim = frameShape(L, W, 0.09, 0.09, 0.04);
    k.slab('tub', 'ceramic-white', rim, 0.04, h - 0.04, { bevel: 0.01 });
    k.slab('tub', 'ceramic-white', roundRect(L - 0.18, W - 0.18, 0.12), 0.02, h - 0.42, { bevel: 0.006 });
    if (p.water) k.slab('water', 'water', roundRect(L - 0.19, W - 0.19, 0.12), 0.01, h - 0.12, { bevel: 0 });
    for (const s of [-1, 1]) for (const f of [-0.25, 0.1, 0.35]) {
      k.cyl('jets', 'metal-chrome', 0.022, 0.022, 0.012, f * L, h - 0.28, s * (W / 2 - 0.09), { rx: s * -PI / 2, segs: k.seg(14, 6) });
    }
    k.cyl('jets', 'metal-chrome', 0.012, 0.016, 0.16, L / 2 - 0.05, h, -W / 2 + 0.05, { segs: k.seg(12, 6) });
    k.rod('jets', 'metal-chrome', [L / 2 - 0.05, h + 0.15, -W / 2 + 0.05], [L / 2 - 0.16, h + 0.15, -W / 2 + 0.05], 0.012, { segs: k.seg(10, 5) });
    k.soft('pillow', 'plastic-grey', 0.34, 0.06, 0.16, 0.025, -L / 2 + 0.1, h + 0.01, 0, { ry: PI / 2 });
    return finish(k);
  },
});

const sauna = mk({
  id: 'bath-sauna-cabin', category: CAT, ko: '홈 사우나(건식 2인)', en: 'Home sauna cabin (2-person)',
  params: [
    P.len('width', '폭', 'Width', 1.3, 1.0, 1.8),
    P.mat('wood', '목재', 'Wood', 'wood-pine', 'wood'),
  ],
  tags: ['sauna', 'home sauna', 'infrared sauna', 'finnish sauna', '사우나', '건식 사우나', '홈 사우나', '찜질'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = 1.1, H = 1.95, t = 0.05, w = p.wood;
    for (const s of [-1, 1]) k.box('wood', w, t, H, D, s * (W / 2 - t / 2), H / 2, 0, { r: 0.004 });
    k.box('wood', w, W, t, D, 0, H - t / 2, 0, { r: 0.004 });
    k.box('wood', w, W, t, D, 0, t / 2, 0, { r: 0.004 });
    k.box('wood', w, W - 2 * t, H - 2 * t, t, 0, H / 2, -D / 2 + t / 2, { r: 0.002 });
    // front: glass door + side panel
    const dw = Math.min(0.62, W * 0.5);
    k.box('wood', w, W - 2 * t - dw, H - 2 * t, t, -dw / 2, H / 2, D / 2 - t / 2, { r: 0.002 });
    k.box('glass', 'glass-tinted', dw, H - 2 * t - 0.02, 0.01, (W - 2 * t) / 2 - dw / 2, H / 2, D / 2 - 0.01, { r: 0 });
    k.rod('hardware', 'wood-dark', [W / 2 - t - dw + 0.06, 0.85, D / 2 + 0.03], [W / 2 - t - dw + 0.06, 1.25, D / 2 + 0.03], 0.015, { segs: k.seg(10, 5) });
    // benches + heater + lamp
    k.box('bench', w, W - 2 * t, 0.04, 0.45, 0, 0.75, -D / 2 + 0.3, { r: 0.006 });
    k.box('bench', w, W - 2 * t, 0.04, 0.3, 0, 0.42, -D / 2 + 0.6, { r: 0.006 });
    k.box('heater', 'metal-steel', 0.3, 0.45, 0.2, -W / 2 + t + 0.17, 0.26, D / 2 - 0.2, { r: 0.01 });
    k.box('heater', 'granite-grey', 0.26, 0.06, 0.16, -W / 2 + t + 0.17, 0.51, D / 2 - 0.2, { r: 0.02 });
    k.box('lamp', 'light-warm', 0.14, 0.04, 0.03, 0, H - 0.2, -D / 2 + t + 0.02, { r: 0.006 });
    k.light(0, H - 0.25, -D / 2 + 0.12, { intensity: 0.4, distance: 2.5 });
    return finish(k);
  },
});

const steamCabin = mk({
  id: 'bath-steam-shower-cabin', category: CAT, ko: '스팀 샤워 부스(밀폐형)', en: 'Steam shower cabin',
  params: [
    P.len('width', '폭', 'Width', 1.0, 0.9, 1.4),
    P.mat('frame', '프레임', 'Frame', 'metal-aluminium', 'metal'),
    P.mat('glass', '유리', 'Glass', 'glass-frosted', 'glass'),
  ],
  tags: ['steam shower', 'shower cabin', 'shower enclosure', 'shower pod', '스팀 샤워', '샤워 부스', '샤워실', '샤워 캐빈'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = W, H = 2.15, f = p.frame;
    k.box('tray', 'ceramic-white', W, 0.16, D, 0, 0.08, 0, { r: 0.02 });
    k.box('back', 'plastic-white', W - 0.04, H - 0.26, 0.05, 0, 0.16 + (H - 0.26) / 2, -D / 2 + 0.025, { r: 0.01 });
    k.box('back', 'plastic-white', W, 0.1, D, 0, H - 0.05, 0, { r: 0.02 });
    for (const s of [-1, 1]) k.box('glass', p.glass, 0.008, H - 0.26, D - 0.08, s * (W / 2 - 0.004), 0.16 + (H - 0.26) / 2, 0.01, { r: 0 });
    k.box('glass', p.glass, W - 0.04, H - 0.26, 0.008, 0, 0.16 + (H - 0.26) / 2, D / 2 - 0.004, { r: 0 });
    for (const s of [-1, 1]) {
      k.box('frame', f, 0.03, H - 0.26, 0.03, s * (W / 2 - 0.015), 0.16 + (H - 0.26) / 2, D / 2 - 0.015, { r: 0.004 });
    }
    k.rod('frame', f, [0, 0.9, D / 2 + 0.01], [0, 1.2, D / 2 + 0.01], 0.012, { segs: k.seg(10, 5) });
    k.box('fittings', 'metal-chrome', 0.25, 0.05, 0.25, 0, H - 0.12, -0.05, { r: 0.01 });
    k.box('fittings', 'metal-chrome', 0.25, 0.4, 0.02, 0, 1.25, -D / 2 + 0.06, { r: 0.006 });
    k.box('seat', 'plastic-white', 0.4, 0.05, 0.3, -W / 2 + 0.24, 0.5, -D / 2 + 0.2, { r: 0.01 });
    k.box('display', 'light-cool', 0.08, 0.05, 0.004, 0.2, 1.4, -D / 2 + 0.052, { r: 0 });
    return finish(k);
  },
});

const handDryer = mk({
  id: 'bath-hand-dryer', category: CAT, placement: 'wall', elevation: 1.05, ko: '핸드 드라이어', en: 'Hand dryer',
  params: [
    P.pick('style', '형태', 'Style', 'blade', [['blade', '블레이드(손 넣는 형)', 'Blade (hands-in)'], ['nozzle', '노즐형', 'Nozzle']]),
    P.mat('finish', '외장', 'Finish', 'metal-steel', 'metal'),
  ],
  tags: ['hand dryer', 'jet dryer', 'restroom', '핸드 드라이어', '손 건조기', '화장실'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    if (p.style === 'blade') {
      k.rbox('body', p.finish, 0.3, 0.66, 0.22, 0.04, 0, 0.33, 0, { segs: k.seg(4, 1) });
      k.box('slot', 'plastic-black', 0.26, 0.16, 0.24, 0, 0.42, 0.0, { r: 0.02 });
      k.box('display', 'light-cool', 0.03, 0.006, 0.003, 0, 0.6, 0.111, { r: 0 });
    } else {
      k.rbox('body', p.finish, 0.26, 0.24, 0.16, 0.04, 0, 0.14, 0, { segs: k.seg(4, 1) });
      k.cyl('slot', 'plastic-black', 0.03, 0.035, 0.05, 0, 0, 0.05, { segs: k.seg(16, 6) });
    }
    return finish(k);
  },
});

const magnify = mk({
  id: 'bath-magnifying-mirror', category: CAT, placement: 'wall', elevation: 1.3, ko: '확대 면도 거울(벽걸이)', en: 'Extending magnifying mirror',
  params: [
    P.len('reach', '팔 길이', 'Arm reach', 0.3, 0.1, 0.5),
    P.mat('metal', '금속', 'Metal', 'metal-chrome', 'metal'),
    P.bool('lit', 'LED 조명', 'LED ring', true),
  ],
  tags: ['magnifying mirror', 'shaving mirror', 'makeup mirror', 'extendable mirror', '확대경', '면도 거울', '화장 거울'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const m = p.metal, R = 0.11, Z = p.reach + 0.04;
    k.cyl('metal', m, 0.05, 0.05, 0.015, 0, 0.12, 0, { rx: PI / 2, segs: k.seg(20, 8) });
    k.bentTube('metal', m, [[0, 0.12, 0.01], [0, 0.12, Z * 0.5], [0, 0.12, Z - 0.03]], 0.007, 0.03);
    k.cyl('metal', m, R + 0.012, R + 0.012, 0.025, 0, 0.12 + 0.0, Z, { rx: PI / 2, segs: k.seg(36, 12) });
    k.cyl('mirror', 'mirror', R, R, 0.004, 0, 0.12, Z + 0.012, { rx: PI / 2, segs: k.seg(36, 12) });
    if (p.lit) {
      k.cyl('light', 'light-cool', R + 0.008, R + 0.008, 0.003, 0, 0.12, Z + 0.0125, { rx: PI / 2, segs: k.seg(36, 12), open: true });
      k.light(0, 0.12, Z + 0.05, { color: '#eef4ff', intensity: 0.2, distance: 1 });
    }
    return finish(k);
  },
});

const laundryTower = mk({
  id: 'bath-laundry-tower-cabinet', category: CAT, ko: '세탁기·건조기 수납장', en: 'Washer-dryer tower cabinet',
  params: [
    P.mat('body', '본체', 'Body', 'wood-white', 'wood'),
    P.bool('appliances', '세탁기 포함', 'With washer + dryer', true),
  ],
  tags: ['laundry cabinet', 'washer dryer tower', 'utility cabinet', '세탁기장', '건조기 수납장', '다용도실 수납장', '세탁실'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.75, H = 2.1, D = 0.68, t = 0.02, b = p.body;
    for (const s of [-1, 1]) k.box('body', b, t, H, D, s * (W / 2 - t / 2), H / 2, 0, { r: 0.002 });
    k.box('body', b, W, t, D, 0, H - t / 2, 0, { r: 0.002 });
    k.box('body', b, W - 2 * t, t, D, 0, 0.9, 0, { r: 0.002 });
    k.box('body', b, W - 2 * t, t, D, 0, 1.78, 0, { r: 0.002 });
    k.box('body', b, W - 2 * t, H - 1.8, 0.02, 0, 1.79 + (H - 1.8) / 2, D / 2 - 0.01, { r: 0.002 }); // top doors
    k.box('handle', 'metal-black', 0.12, 0.012, 0.02, 0, 1.84, D / 2 + 0.01, { r: 0.003 });
    if (p.appliances) for (const y of [0.02, 0.92]) {
      k.box('machine', 'plastic-white', 0.6, 0.84, 0.6, 0, y + 0.42, -0.02, { r: 0.02 });
      k.cyl('door', 'metal-steel', 0.2, 0.2, 0.02, 0, y + 0.4, 0.28, { rx: PI / 2, segs: k.seg(32, 10) });
      k.cyl('glass', 'glass-tinted', 0.15, 0.15, 0.01, 0, y + 0.4, 0.295, { rx: PI / 2, segs: k.seg(28, 10) });
    }
    return finish(k);
  },
});

const showerPanel = mk({
  id: 'bath-shower-panel-column', category: CAT, placement: 'wall', elevation: 0.6, ko: '샤워 패널(바디 제트)', en: 'Shower panel column with body jets',
  params: [P.mat('finish', '패널', 'Panel', 'metal-steel', 'metal')],
  tags: ['shower panel', 'shower tower', 'body jets', 'rain shower', '샤워 패널', '샤워 타워', '바디 제트', '해바라기 샤워'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const h = 1.5;
    k.rbox('panel', p.finish, 0.2, h, 0.05, 0.01, 0, h / 2, 0, { segs: k.seg(3, 1) });
    k.box('head', 'metal-chrome', 0.22, 0.02, 0.28, 0, h - 0.02, 0.15, { r: 0.008 });
    for (const y of [0.45, 0.65, 0.85]) for (const s of [-1, 1]) k.cyl('head', 'metal-chrome', 0.018, 0.018, 0.01, s * 0.05, y, 0.025, { rx: PI / 2, segs: k.seg(14, 6) });
    k.cyl('head', 'metal-chrome', 0.03, 0.03, 0.03, 0, 1.08, 0.025, { rx: PI / 2, segs: k.seg(16, 6) });
    k.rod('head', 'metal-chrome', [0.06, 0.2, 0.04], [0.06, 0.38, 0.06], 0.014, { segs: k.seg(10, 5) });
    return finish(k);
  },
});

const duckboard = mk({
  id: 'bath-duckboard-mat', category: CAT, ko: '원목 슬랫 발판(스노코)', en: 'Slatted wood duckboard',
  params: [
    P.len('width', '폭', 'Width', 0.8, 0.5, 1.2),
    P.len('depth', '깊이', 'Depth', 0.5, 0.35, 0.9),
    P.mat('wood', '목재', 'Wood', 'wood-teak', 'wood'),
  ],
  tags: ['duckboard', 'bath mat', 'shower mat', 'slatted mat', '스노코', '욕실 발판', '원목 발판', '발매트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = p.depth, n = Math.max(4, Math.round(W / 0.07)), sw = W / n;
    for (let i = 0; i < n; i++) k.box('wood', p.wood, sw - 0.012, 0.018, D, -W / 2 + sw * (i + 0.5), 0.031, 0, { r: 0.003 });
    for (const z of [-1, 0, 1]) k.box('wood', p.wood, W - 0.03, 0.022, 0.04, 0, 0.011, z * (D / 2 - 0.05), { r: 0.003 });
    return finish(k);
  },
});

const foldSeat = mk({
  id: 'bath-folding-shower-seat', category: CAT, placement: 'wall', elevation: 0.45, ko: '접이식 샤워 의자(벽걸이)', en: 'Folding wall shower seat',
  params: [
    P.bool('open', '펼침', 'Folded down', true),
    P.mat('seat', '좌판', 'Seat', 'wood-teak', 'wood'),
  ],
  tags: ['shower seat', 'folding seat', 'accessible', 'barrier free', '샤워 의자', '접이식 의자', '무장애', '안전 손잡이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('frame', 'metal-steel', 0.42, 0.06, 0.025, 0, 0.03, 0.0125, { r: 0.006 });
    if (p.open) {
      const n = 5;
      for (let i = 0; i < n; i++) k.box('seat', p.seat, 0.42, 0.025, 0.06, 0, 0.0475, 0.04 + i * 0.075, { r: 0.004 });
      for (const s of [-1, 1]) k.rod('frame', 'metal-steel', [s * 0.19, 0.035, 0.36], [s * 0.19, -0.2, 0.03], 0.01, { segs: k.seg(8, 4) });
    } else {
      for (let i = 0; i < 5; i++) k.box('seat', p.seat, 0.42, 0.06, 0.025, 0, 0.07 + i * 0.075, 0.04, { r: 0.004 });
    }
    return finish(k);
  },
});

const bowlSet = mk({
  id: 'bath-washbowl-dipper-set', category: CAT, ko: '목욕 대야·바가지 세트', en: 'Wash bowl and dipper set',
  params: [P.mat('wood', '재질', 'Material', 'wood-pine', 'wood')],
  tags: ['wash bowl', 'dipper', 'bath bucket', 'onsen', 'hinoki', '대야', '바가지', '목욕용품', '히노끼'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.lathe('wood', p.wood, [[0, 0], [0.16, 0], [0.17, 0.01], [0.18, 0.13], [0.165, 0.13], [0.155, 0.015], [0, 0.015]], 0, 0, 0, { segs: k.seg(32, 10) });
    k.cyl('hoops', 'metal-copper', 0.178, 0.176, 0.012, 0, 0.03, 0, { open: true, segs: k.seg(32, 10) });
    k.cyl('hoops', 'metal-copper', 0.181, 0.18, 0.012, 0, 0.1, 0, { open: true, segs: k.seg(32, 10) });
    // dipper on the rim
    k.lathe('wood', p.wood, [[0, 0], [0.06, 0], [0.065, 0.08], [0.058, 0.08], [0.054, 0.008], [0, 0.008]], 0.26, 0, 0.0, { segs: k.seg(24, 8) });
    k.box('wood', p.wood, 0.02, 0.016, 0.24, 0.26, 0.07, 0.17, { r: 0.004, rx: -0.15 });
    return finish(k);
  },
});

export const ITEMS = [whirlpool, sauna, steamCabin, handDryer, magnify, laundryTower, showerPanel, duckboard, foldSeat, bowlSet];
