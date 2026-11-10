// Further appliances: massage chair, home fitness (treadmill, exercise bike, rowing machine),
// mini bar fridge, heated clothes airer, shoe care cabinet, easel TV, portable air conditioner,
// wall-mounted mini washer. See ARCHITECTURE.md §12 → Library objects.
import { Kit, P, roundRect, frameShape } from './helpers.js';
import { finish } from './kitchen.js';
import { mk } from './appliances-more.js';

const PI = Math.PI;
const CAT = 'appliances';

/** Centre of a part hinged at (y, z) with length L, tilted by `a` from vertical toward −z (up) or +z (down). */
const tilted = (y, z, L, a, down = false) => (down ? [y - Math.cos(a) * L / 2, z + Math.sin(a) * L / 2] : [y + Math.cos(a) * L / 2, z - Math.sin(a) * L / 2]);

const massageChair = mk({
  id: 'appl-massage-chair', category: CAT, ko: '안마의자', en: 'Massage chair',
  params: [
    P.num('recline', '등받이 각도(°)', 'Recline (°)', 25, 10, 60, 1),
    P.mat('cover', '커버', 'Cover', 'leather-white', 'leather'),
    P.mat('shell', '외장', 'Shell', 'plastic-black', 'plastic'),
  ],
  tags: ['massage chair', 'recliner', 'body massager', '안마의자', '마사지 의자', '리클라이너'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const a = (p.recline * PI) / 180, legA = PI / 2 - a * 0.9;
    k.rbox('shell', p.shell, 0.62, 0.16, 0.9, 0.04, 0, 0.08, 0, { segs: k.seg(3, 1) });
    k.soft('cover', p.cover, 0.52, 0.16, 0.58, 0.05, 0, 0.5, 0.02, { puff: 0.01 });
    k.box('shell', p.shell, 0.5, 0.28, 0.5, 0, 0.3, 0.0, { r: 0.03 });
    // backrest + head hood
    const L = 0.86, [by, bz] = tilted(0.55, -0.26, L, a);
    k.soft('cover', p.cover, 0.54, L, 0.2, 0.07, 0, by, bz, { rx: -a, puff: 0.012 });
    const [hy, hz] = tilted(0.55, -0.32, L * 2 - 0.12, a);
    k.rbox('shell', p.shell, 0.6, 0.2, 0.3, 0.08, 0, hy, hz, { rx: -a, segs: k.seg(4, 1) });
    // large arm units
    for (const s of [-1, 1]) {
      k.rbox('shell', p.shell, 0.13, 0.36, 0.72, 0.05, s * 0.33, 0.48, 0.02, { segs: k.seg(4, 1) });
      k.soft('cover', p.cover, 0.1, 0.05, 0.64, 0.02, s * 0.33, 0.68, 0.02);
    }
    k.box('display', 'light-cool', 0.06, 0.004, 0.035, 0.33, 0.705, 0.25, { r: 0.002 });
    // leg rest
    const LL = 0.5, [ly, lz] = tilted(0.48, 0.3, LL, legA, true);
    k.soft('cover', p.cover, 0.46, LL, 0.2, 0.06, 0, Math.max(LL / 2 * Math.cos(legA) + 0.02, ly), lz, { rx: -legA });
    return finish(k);
  },
});

const treadmill = mk({
  id: 'appl-treadmill', category: CAT, ko: '러닝머신', en: 'Treadmill',
  params: [
    P.len('length', '길이', 'Length', 1.8, 1.4, 2.2),
    P.mat('frame', '프레임', 'Frame', 'plastic-black', 'plastic'),
    P.mat('trim', '레일', 'Rails', 'metal-aluminium', 'metal'),
  ],
  tags: ['treadmill', 'running machine', 'fitness', 'home gym', '러닝머신', '트레드밀', '운동기구', '홈짐'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, W = 0.8, f = p.frame;
    k.rbox('frame', f, W, 0.16, L, 0.03, 0, 0.1, 0, { segs: k.seg(3, 1) });
    k.box('belt', 'rubber-black', 0.52, 0.012, L - 0.3, 0, 0.186, 0.05, { r: 0.004 });
    for (const s of [-1, 1]) k.box('trim', p.trim, 0.1, 0.01, L - 0.3, s * 0.32, 0.185, 0.05, { r: 0.003 });
    k.rbox('frame', f, W - 0.04, 0.2, 0.24, 0.05, 0, 0.13, -L / 2 + 0.12, { segs: k.seg(3, 1) }); // motor hood
    // uprights + console
    const zc = -L / 2 + 0.1, top = 1.32;
    for (const s of [-1, 1]) {
      k.rod('frame', f, [s * 0.36, 0.18, zc + 0.05], [s * 0.34, top - 0.08, zc - 0.12], 0.032, { segs: k.seg(12, 6) });
      k.bentTube('trim', p.trim, [[s * 0.34, 1.05, zc - 0.05], [s * 0.34, 1.08, zc + 0.35], [s * 0.3, 1.0, zc + 0.42]], 0.016, 0.05);
    }
    k.rbox('frame', f, 0.78, 0.26, 0.12, 0.03, 0, top, zc - 0.12, { rx: -0.5, segs: k.seg(3, 1) });
    k.box('display', 'light-cool', 0.32, 0.12, 0.004, 0, top + 0.02, zc - 0.08, { r: 0.002, rx: -0.5 });
    return finish(k);
  },
});

const exerciseBike = mk({
  id: 'appl-exercise-bike', category: CAT, ko: '실내 자전거(스피닝)', en: 'Exercise bike',
  params: [
    P.mat('frame', '프레임', 'Frame', 'paint-black-matte', 'paint'),
    P.mat('wheel', '플라이휠', 'Flywheel', 'metal-chrome', 'metal'),
  ],
  tags: ['exercise bike', 'spin bike', 'stationary bike', 'fitness', '실내 자전거', '스피닝', '헬스 자전거', '운동기구'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const f = p.frame;
    for (const z of [-0.5, 0.5]) k.rbox('frame', f, 0.55, 0.06, 0.08, 0.025, 0, 0.03, z, { segs: k.seg(2, 1) });
    k.rod('frame', f, [0, 0.06, -0.48], [0, 0.4, -0.05], 0.035, { segs: k.seg(12, 6) });
    k.rod('frame', f, [0, 0.06, 0.48], [0, 0.4, -0.05], 0.035, { segs: k.seg(12, 6) });
    k.rod('frame', f, [0, 0.4, -0.05], [0, 0.82, -0.25], 0.03, { segs: k.seg(12, 6) }); // seat post
    k.rod('frame', f, [0, 0.4, -0.05], [0, 0.95, 0.4], 0.03, { segs: k.seg(12, 6) }); // head tube
    k.cyl('wheel', p.wheel, 0.24, 0.24, 0.05, 0, 0.3, 0.32, { rz: PI / 2, segs: k.seg(36, 12) });
    k.rbox('frame', f, 0.04, 0.3, 0.3, 0.02, 0, 0.42, 0.34, { segs: k.seg(2, 1) }); // guard
    k.soft('seat', 'leather-black', 0.16, 0.06, 0.27, 0.025, 0, 0.85, -0.25);
    k.bentTube('frame', f, [[-0.24, 0.98, 0.32], [-0.24, 1.0, 0.45], [0, 1.0, 0.43], [0.24, 1.0, 0.45], [0.24, 0.98, 0.32]], 0.016, 0.05);
    k.box('display', 'light-cool', 0.12, 0.08, 0.02, 0, 1.06, 0.45, { r: 0.006, rx: -0.4 });
    for (const s of [-1, 1]) k.box('seat', 'plastic-black', 0.04, 0.02, 0.1, s * 0.12, 0.33 + s * 0.06, 0.05, { r: 0.004 });
    return finish(k);
  },
});

const rowingMachine = mk({
  id: 'appl-rowing-machine', category: CAT, ko: '로잉머신(물 저항)', en: 'Water rowing machine',
  params: [
    P.len('length', '길이', 'Length', 2.0, 1.8, 2.3),
    P.mat('wood', '목재', 'Wood', 'wood-ash', 'wood'),
  ],
  tags: ['rowing machine', 'rower', 'water rower', 'fitness', '로잉머신', '노젓기', '운동기구'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, w = p.wood;
    k.box('wood', w, 0.18, 0.05, L, 0, 0.16 + (L / 2) * 0.05, 0, { r: 0.006, rx: 0.05 });
    for (const s of [-1, 1]) k.box('wood', w, 0.04, 0.2, 0.06, s * 0.06, 0.09, -L / 2 + 0.03, { r: 0.004 });
    k.box('wood', w, 0.5, 0.06, 0.12, 0, 0.03, L / 2 - 0.3, { r: 0.006 });
    k.cyl('tank', 'glass-tinted', 0.26, 0.26, 0.18, 0, 0.03, L / 2 - 0.3, { segs: k.seg(32, 10) });
    k.cyl('water', 'water', 0.25, 0.25, 0.12, 0, 0.04, L / 2 - 0.3, { segs: k.seg(32, 10) });
    k.box('wood', w, 0.12, 0.6, 0.05, 0, 0.36, L / 2 - 0.55, { r: 0.006, rx: 0.3 });
    for (const s of [-1, 1]) k.box('pads', 'plastic-black', 0.11, 0.025, 0.28, s * 0.1, 0.3, L / 2 - 0.62, { r: 0.008, rx: -0.6 });
    k.soft('pads', 'plastic-black', 0.28, 0.05, 0.3, 0.02, 0, 0.24, -0.1);
    k.rod('handle', 'rubber-black', [-0.25, 0.62, L / 2 - 0.52], [0.25, 0.62, L / 2 - 0.52], 0.016, { segs: k.seg(10, 5) });
    return finish(k);
  },
});

const miniFridge = mk({
  id: 'appl-mini-fridge', category: CAT, ko: '미니 냉장고(바 냉장고)', en: 'Mini bar fridge',
  params: [
    P.len('height', '높이', 'Height', 0.85, 0.5, 0.9),
    P.bool('glass', '유리문', 'Glass door', true),
    P.mat('finish', '외장', 'Finish', 'metal-steel', 'metal'),
  ],
  tags: ['mini fridge', 'bar fridge', 'beverage cooler', 'compact fridge', '미니 냉장고', '소형 냉장고', '음료 냉장고'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.5, d = 0.52, h = p.height;
    k.rbox('body', p.finish, w, h, d - 0.04, 0.01, 0, h / 2, -0.02, { segs: k.seg(2, 1) });
    if (p.glass) {
      k.panel('door', 'plastic-black', frameShape(w - 0.006, h - 0.02, 0.04), 0.04, 0, h / 2, d / 2 - 0.02);
      k.box('glass', 'glass-tinted', w - 0.07, h - 0.09, 0.008, 0, h / 2, d / 2 - 0.02, { r: 0 });
      const n = Math.max(2, Math.round(h / 0.22));
      for (let i = 1; i < n; i++) k.box('shelf', 'metal-chrome', w - 0.08, 0.006, d - 0.12, 0, (h * i) / n, -0.02, { r: 0 });
    } else k.box('door', p.finish, w - 0.006, h - 0.02, 0.04, 0, h / 2, d / 2 - 0.02, { r: 0.006 });
    k.rod('handle', 'metal-chrome', [w / 2 - 0.05, h * 0.3, d / 2 + 0.02], [w / 2 - 0.05, h * 0.85, d / 2 + 0.02], 0.008, { segs: k.seg(10, 5) });
    for (const s of [-1, 1]) k.box('handle', 'metal-chrome', 0.015, 0.012, 0.02, w / 2 - 0.05, h * (s < 0 ? 0.32 : 0.83), d / 2 + 0.01, { r: 0.002 });
    return finish(k);
  },
});

const clothesAirer = mk({
  id: 'appl-heated-clothes-airer', category: CAT, ko: '전기 빨래 건조대', en: 'Heated clothes airer',
  params: [
    P.len('width', '폭', 'Width', 1.4, 0.9, 1.8),
    P.bool('wings', '날개 펼침', 'Wings open', true),
    P.mat('metal', '금속', 'Metal', 'metal-aluminium', 'metal'),
  ],
  tags: ['clothes airer', 'drying rack', 'heated airer', 'laundry rack', '빨래 건조대', '건조대', '전기 건조대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, m = p.metal, top = 0.95, half = 0.3;
    for (const s of [-1, 1]) {
      // A-frame legs per side
      k.rod('frame', m, [s * W / 2, 0, -half], [s * W / 2, top, 0], 0.012, { segs: k.seg(10, 5) });
      k.rod('frame', m, [s * W / 2, 0, half], [s * W / 2, top, 0], 0.012, { segs: k.seg(10, 5) });
      k.box('feet', 'plastic-grey', 0.04, 0.02, 0.05, s * W / 2, 0.01, -half, { r: 0.006 });
      k.box('feet', 'plastic-grey', 0.04, 0.02, 0.05, s * W / 2, 0.01, half, { r: 0.006 });
    }
    k.rod('frame', m, [-W / 2, top, 0], [W / 2, top, 0], 0.014, { segs: k.seg(10, 5) });
    for (let i = 1; i <= 3; i++) for (const z of [-1, 1]) {
      const y = top - i * 0.18, zz = z * half * (i * 0.18) / top;
      k.rod('bars', m, [-W / 2, y, zz], [W / 2, y, zz], 0.008, { segs: k.seg(8, 4) });
    }
    if (p.wings) for (const z of [-1, 1]) {
      const y = top - 0.04;
      k.rod('bars', m, [-W / 2, y, z * 0.02], [-W / 2, y, z * 0.4], 0.01, { segs: k.seg(8, 4) });
      k.rod('bars', m, [W / 2, y, z * 0.02], [W / 2, y, z * 0.4], 0.01, { segs: k.seg(8, 4) });
      for (const f of [0.15, 0.28, 0.4]) k.rod('bars', m, [-W / 2, y, z * f], [W / 2, y, z * f], 0.008, { segs: k.seg(8, 4) });
    }
    k.rbox('control', 'plastic-white', 0.08, 0.05, 0.04, 0.01, W / 2 - 0.08, top - 0.07, 0.03);
    k.box('display', 'light-warm', 0.012, 0.012, 0.004, W / 2 - 0.08, top - 0.07, 0.051, { r: 0 });
    return finish(k);
  },
});

const shoeCare = mk({
  id: 'appl-shoe-care-cabinet', category: CAT, ko: '신발 관리기(슈케어)', en: 'Shoe care cabinet',
  params: [
    P.mat('finish', '도어', 'Door', 'mirror', 'glass'),
    P.mat('body', '본체', 'Body', 'paint-white-matte', 'paint'),
  ],
  tags: ['shoe care', 'shoe dryer', 'shoe steamer', 'shoe cabinet', '신발 관리기', '슈케어', '슈드레서', '신발 건조기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.45, h = 1.6, d = 0.4;
    k.box('body', p.body, w, h, d - 0.03, 0, h / 2, -0.015, { r: 0.006 });
    k.box('door', p.finish, w - 0.006, h - 0.1, 0.025, 0, h / 2 + 0.03, d / 2 - 0.0125, { r: 0.004 });
    k.box('body', p.body, w - 0.006, 0.06, 0.025, 0, 0.03, d / 2 - 0.0125, { r: 0.004 }); // drip drawer
    k.box('display', 'light-cool', 0.08, 0.01, 0.003, 0, h - 0.12, d / 2 + 0.0015, { r: 0 });
    k.box('trim', 'metal-aluminium', 0.012, 0.3, 0.012, -w / 2 + 0.03, h * 0.55, d / 2 + 0.006, { r: 0.003 });
    return finish(k);
  },
});

const easelTv = mk({
  id: 'appl-easel-tv', category: CAT, ko: '이젤 스탠드 TV', en: 'Easel stand TV',
  params: [
    P.int('inches', '화면 크기(인치)', 'Screen (inches)', 55, 43, 77),
    P.mat('stand', '스탠드', 'Stand', 'wood-oak', 'wood'),
  ],
  tags: ['tv', 'easel tv', 'art tv', 'television', 'stand tv', '이젤 TV', '스탠드 TV', '티비', '텔레비전'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const diag = p.inches * 0.0254, sw = diag * 0.8716, sh = diag * 0.4903, a = 0.12;
    const yc = 0.55 + sh / 2;
    k.box('body', 'plastic-black', sw, sh, 0.03, 0, yc, 0, { r: 0.004, rx: -a });
    k.box('screen', 'screen-black', sw - 0.02, sh - 0.02, 0.003, 0, yc + 0.0, 0.015 * Math.cos(a), { r: 0, rx: -a });
    const top = yc + sh / 2 + 0.08;
    for (const s of [-1, 1]) k.rod('stand', p.stand, [s * sw * 0.36, 0, 0.3], [s * sw * 0.04, top, -0.05], 0.018, { segs: k.seg(10, 5) });
    k.rod('stand', p.stand, [0, 0, -0.55], [0, top, -0.08], 0.018, { segs: k.seg(10, 5) });
    k.box('stand', p.stand, sw * 0.7, 0.03, 0.05, 0, 0.53, 0.06, { r: 0.004 });
    return finish(k);
  },
});

const portableAc = mk({
  id: 'appl-portable-air-conditioner', category: CAT, ko: '이동식 에어컨', en: 'Portable air conditioner',
  params: [
    P.bool('hose', '배기 호스', 'Exhaust hose', true),
    P.mat('color', '색상', 'Colour', 'plastic-white', 'plastic'),
  ],
  tags: ['portable air conditioner', 'mobile ac', 'air conditioner', 'cooler', '이동식 에어컨', '창문형 에어컨', '에어컨', '냉방기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.42, h = 0.72, d = 0.36;
    k.soft('body', p.color, w, h, d, 0.05, 0, 0.03 + h / 2, 0, { flat: 3 });
    k.box('grille', 'plastic-grey', w - 0.08, 0.1, 0.01, 0, h - 0.04, d / 2 + 0.002, { r: 0.004 });
    for (let i = 0; i < 4; i++) k.box('grille', 'plastic-grey', w - 0.1, 0.006, 0.014, 0, h - 0.08 + i * 0.025, d / 2 + 0.004, { r: 0 });
    k.box('display', 'light-cool', 0.06, 0.02, 0.003, 0, h - 0.2, d / 2 + 0.001, { r: 0 });
    for (const x of [-1, 1]) for (const z of [-1, 1]) k.cyl('casters', 'plastic-black', 0.018, 0.018, 0.03, x * (w / 2 - 0.05), 0, z * (d / 2 - 0.05), { segs: k.seg(12, 6) });
    if (p.hose) {
      k.tube('hose', 'plastic-grey', [[0, 0.45, -d / 2], [0, 0.5, -d / 2 - 0.2], [0.2, 0.75, -d / 2 - 0.35], [0.4, 0.95, -d / 2 - 0.38]], 0.065, { radial: k.seg(14, 6), segs: k.seg(24, 8) });
      k.box('hose', 'plastic-white', 0.9, 0.2, 0.03, 0.55, 1.0, -d / 2 - 0.41, { r: 0.006 });
    }
    return finish(k);
  },
});

const wallWasher = mk({
  id: 'appl-wall-mounted-washer', category: CAT, placement: 'wall', elevation: 0.9, ko: '벽걸이 미니 세탁기', en: 'Wall-mounted mini washer',
  params: [P.mat('color', '색상', 'Colour', 'plastic-white', 'plastic')],
  tags: ['wall washer', 'mini washer', 'baby laundry', 'washing machine', '벽걸이 세탁기', '미니 세탁기', '아기 빨래', '세탁기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.55, h = 0.62, d = 0.3;
    k.slab('body', p.color, roundRect(w, d, 0.06), h, 0);
    k.cyl('door', 'plastic-grey', 0.19, 0.19, 0.03, 0, h * 0.48, d / 2, { rx: PI / 2, segs: k.seg(36, 12) });
    k.cyl('glass', 'glass-tinted', 0.15, 0.15, 0.012, 0, h * 0.48, d / 2 + 0.018, { rx: PI / 2, segs: k.seg(32, 10) });
    k.box('display', 'light-cool', 0.12, 0.025, 0.004, 0, h - 0.06, d / 2 + 0.002, { r: 0 });
    return finish(k);
  },
});

export const ITEMS = [massageChair, treadmill, exerciseBike, rowingMachine, miniFridge, clothesAirer, shoeCare, easelTv, portableAc, wallWasher];
