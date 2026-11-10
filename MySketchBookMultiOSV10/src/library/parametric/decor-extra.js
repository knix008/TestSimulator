// Further decor: cuckoo clock, aquarium on a cabinet, door wreath, dreamcatcher, felt letter board,
// brass telescope on a tripod, orrery, sailing ship model, acoustic guitar on a stand, artist's easel
// with canvas. See ARCHITECTURE.md §12 → Library objects.
import { THREE, Kit, P, roundRect, frameShape, rng } from './helpers.js';
import { finish } from './kitchen.js';
import { mk } from './appliances-more.js';

const PI = Math.PI, TAU = PI * 2;
const CAT = 'decor';

const cuckoo = mk({
  id: 'decor-cuckoo-clock', category: CAT, placement: 'wall', elevation: 1.5, ko: '뻐꾸기 시계', en: 'Cuckoo clock',
  params: [
    P.mat('wood', '목재', 'Wood', 'wood-walnut', 'wood'),
    P.len('chain', '추 줄 길이', 'Chain length', 0.45, 0.2, 0.8),
  ],
  tags: ['cuckoo clock', 'wall clock', 'black forest', 'chalet clock', '뻐꾸기 시계', '벽시계', '시계'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.wood, W = 0.3, H = 0.32, D = 0.14, y0 = p.chain + 0.06;
    k.box('wood', w, W, H, D, 0, y0 + H / 2, 0, { r: 0.004 });
    // gabled roof
    const roof = new THREE.Shape([new THREE.Vector2(-W / 2 - 0.05, 0), new THREE.Vector2(0, 0.13), new THREE.Vector2(W / 2 + 0.05, 0), new THREE.Vector2(W / 2 + 0.03, -0.02), new THREE.Vector2(0, 0.105), new THREE.Vector2(-W / 2 - 0.03, -0.02)]);
    k.panel('wood', 'wood-dark', roof, D + 0.04, 0, y0 + H, 0.0, { bevel: 0.003 });
    const gable = new THREE.Shape([new THREE.Vector2(-W / 2, 0), new THREE.Vector2(0, 0.1), new THREE.Vector2(W / 2, 0)]);
    k.panel('wood', w, gable, D, 0, y0 + H, 0, { bevel: 0.002 });
    k.box('door', 'wood-dark', 0.06, 0.07, 0.008, 0, y0 + H + 0.03, D / 2 + 0.004, { r: 0.002 });
    k.sphere('bird', 'paint-white-matte', 0.018, 0, y0 + H + 0.035, D / 2 + 0.02, { segs: k.seg(10, 5), rings: k.seg(6, 3) });
    // dial
    k.cyl('dial', 'paper', 0.085, 0.085, 0.005, 0, y0 + H * 0.45, D / 2, { rx: PI / 2, segs: k.seg(28, 10) });
    k.box('hands', 'metal-black', 0.006, 0.06, 0.002, 0, y0 + H * 0.45 + 0.025, D / 2 + 0.006, { r: 0, rz: 0.5 });
    k.box('hands', 'metal-black', 0.006, 0.045, 0.002, 0, y0 + H * 0.45 + 0.02, D / 2 + 0.007, { r: 0, rz: -1.6 });
    // carved leaves on the sides
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) k.sphere('wood', 'wood-dark', 0.03, s * (W / 2 + 0.01), y0 + 0.06 + i * 0.1, 0.02, { segs: k.seg(10, 5), rings: k.seg(6, 3), scale: [0.5, 1.4, 0.6] });
    // pendulum + pine-cone weights on chains
    k.rod('hands', 'metal-brass', [0, y0, D / 2 - 0.02], [0, y0 - 0.25, D / 2 - 0.02], 0.002, { segs: 4 });
    k.cyl('weights', 'metal-brass', 0.035, 0.035, 0.006, 0, y0 - 0.27, D / 2 - 0.02, { rx: PI / 2, segs: k.seg(20, 8) });
    for (const s of [-1, 1]) {
      k.rod('hands', 'metal-brass', [s * 0.06, y0, 0], [s * 0.06, 0.12, 0], 0.0015, { segs: 4 });
      k.lathe('weights', 'metal-brass', [[0, 0], [0.012, 0.005], [0.022, 0.04], [0.02, 0.1], [0.008, 0.12], [0, 0.12]], s * 0.06, 0, 0, { segs: k.seg(14, 6) });
    }
    return finish(k);
  },
});

const aquarium = mk({
  id: 'decor-aquarium-cabinet', category: CAT, ko: '수족관(받침장 포함)', en: 'Aquarium on cabinet',
  params: [
    P.len('width', '폭', 'Width', 0.9, 0.6, 1.5),
    P.mat('cabinet', '받침장', 'Cabinet', 'wood-black', 'wood'),
    P.bool('plants', '수초', 'Aquatic plants', true),
  ],
  tags: ['aquarium', 'fish tank', 'fishtank', 'aquascape', '수족관', '어항', '수조', '열대어'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = 0.45, ch = 0.75, th = 0.5;
    k.box('cabinet', p.cabinet, W, ch, D, 0, ch / 2, 0, { r: 0.004 });
    for (const s of [-1, 1]) k.box('cabinet', p.cabinet, W / 2 - 0.006, ch - 0.08, 0.004, s * W / 4, ch / 2 + 0.02, D / 2 + 0.002, { r: 0.001 });
    k.box('glass', 'glass-clear', W, th, D, 0, ch + th / 2, 0, { r: 0.002 });
    k.box('water', 'water', W - 0.02, th - 0.07, D - 0.02, 0, ch + (th - 0.07) / 2 + 0.005, 0, { r: 0 });
    k.box('sand', 'travertine', W - 0.02, 0.05, D - 0.02, 0, ch + 0.03, 0, { r: 0.004 });
    k.box('lid', 'plastic-black', W, 0.03, D, 0, ch + th + 0.015, 0, { r: 0.004 });
    k.box('lamp', 'light-cool', W - 0.1, 0.004, D - 0.12, 0, ch + th - 0.002, 0, { r: 0 });
    k.light(0, ch + th - 0.05, 0, { color: '#cfe8ff', intensity: 0.4, distance: 2 });
    const r = rng(7);
    for (let i = 0; i < 3; i++) k.sphere('rocks', 'granite-grey', 0.05 + r() * 0.03, -W / 3 + r() * W * 0.6, ch + 0.06, -0.05 + r() * 0.1, { segs: k.seg(10, 5), rings: k.seg(6, 3), scale: [1.3, 0.7, 1] });
    if (p.plants) for (let i = 0; i < 7; i++) {
      const x = -W / 2 + 0.08 + r() * (W - 0.16), z = -D / 2 + 0.06 + r() * 0.12, hh = 0.15 + r() * 0.2;
      k.tube('plants', 'plant-leaf', [[x, ch + 0.05, z], [x + 0.02, ch + 0.05 + hh * 0.5, z + 0.01], [x - 0.01, ch + 0.05 + hh, z]], 0.006, { segs: k.seg(10, 4), radial: k.seg(6, 3) });
    }
    for (let i = 0; i < 4; i++) k.sphere('fish', 'paint-blue-matte', 0.015, -W / 4 + r() * W / 2, ch + 0.2 + r() * 0.15, -0.1 + r() * 0.2, { segs: k.seg(8, 4), rings: k.seg(5, 3), scale: [1.8, 1, 0.6] });
    return finish(k);
  },
});

const wreath = mk({
  id: 'decor-wreath', category: CAT, placement: 'wall', elevation: 1.4, ko: '리스(문 장식)', en: 'Door wreath',
  params: [
    P.len('diameter', '지름', 'Diameter', 0.45, 0.3, 0.7),
    P.mat('ribbon', '리본', 'Ribbon', 'fabric-velvet-rose', 'fabric'),
  ],
  tags: ['wreath', 'christmas wreath', 'door decor', 'garland', '리스', '크리스마스 리스', '문 장식', '현관 장식'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, r = rng(3), n = k.hi ? 40 : 16;
    k.add('base', 'plant-stem', new THREE.TorusGeometry(R * 0.82, R * 0.12, k.seg(8, 4), k.seg(32, 10)));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, rr = R * (0.72 + r() * 0.2);
      k.sphere('leaves', i % 3 ? 'plant-leaf' : 'plant-leaf-light', R * 0.1, Math.cos(a) * rr, Math.sin(a) * rr, 0.02 + r() * 0.03, { segs: 6, rings: 4, scale: [1.6, 0.8, 0.6], rz: a + 0.6 });
    }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.5; k.sphere('berries', 'book-red', 0.014, Math.cos(a) * R * 0.85, Math.sin(a) * R * 0.85, 0.06, { segs: 8, rings: 5 }); }
    for (const s of [-1, 1]) k.sphere('ribbon', p.ribbon, 0.05, s * 0.05, -R * 0.82, 0.07, { segs: k.seg(10, 5), rings: k.seg(6, 3), scale: [1.2, 0.7, 0.4] });
    for (const s of [-1, 1]) k.box('ribbon', p.ribbon, 0.035, 0.14, 0.006, s * 0.03, -R * 0.82 - 0.08, 0.07, { r: 0.002, rz: s * 0.25 });
    return finish(k);
  },
});

const dreamcatcher = mk({
  id: 'decor-dreamcatcher', category: CAT, placement: 'wall', elevation: 1.3, ko: '드림캐처', en: 'Dreamcatcher',
  params: [
    P.len('diameter', '지름', 'Diameter', 0.3, 0.15, 0.5),
    P.mat('ring', '고리', 'Hoop', 'rattan', 'wood'),
  ],
  tags: ['dreamcatcher', 'boho', 'wall hanging', 'feathers', '드림캐처', '보헤미안', '벽 장식', '깃털'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, yc = 0.45 + R;
    k.add('ring', p.ring, new THREE.TorusGeometry(R, 0.006, k.seg(8, 4), k.seg(40, 12)).translate(0, yc, 0));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU, b = ((i + 3) / 8) * TAU;
      k.rod('web', 'paper', [Math.cos(a) * R, yc + Math.sin(a) * R, 0], [Math.cos(b) * R * 0.35, yc + Math.sin(b) * R * 0.35, 0], 0.0012, { segs: 3 });
    }
    k.add('web', 'paper', new THREE.TorusGeometry(R * 0.35, 0.0015, 3, k.seg(24, 8)).translate(0, yc, 0));
    for (const [x, L] of [[-R * 0.6, 0.3], [0, 0.4], [R * 0.6, 0.3]]) {
      const y1 = yc - R * Math.sqrt(Math.max(0, 1 - (x / R) ** 2));
      k.rod('web', 'paper', [x, y1, 0], [x, y1 - L, 0], 0.0012, { segs: 3 });
      k.sphere('beads', 'wood-teak', 0.01, x, y1 - L * 0.3, 0, { segs: 8, rings: 5 });
      k.sphere('feathers', 'fabric-cotton-white', 0.06, x, y1 - L - 0.04, 0, { segs: k.seg(10, 5), rings: k.seg(8, 4), scale: [0.3, 1.2, 0.08] });
    }
    return finish(k);
  },
});

const letterBoard = mk({
  id: 'decor-letter-board', category: CAT, placement: 'surface', ko: '펠트 레터 보드', en: 'Felt letter board',
  params: [
    P.len('width', '폭', 'Width', 0.4, 0.25, 0.6),
    P.mat('frame', '프레임', 'Frame', 'wood-oak', 'wood'),
    P.mat('felt', '펠트', 'Felt', 'fabric-wool-charcoal', 'fabric'),
  ],
  tags: ['letter board', 'felt board', 'message board', 'sign', '레터 보드', '메시지 보드', '펠트 보드', '문구 보드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, H = W * 0.75, a = 0.22, cy = H / 2 * Math.cos(a) + 0.005, cz = H / 2 * Math.sin(a);
    k.panel('frame', p.frame, frameShape(W, H, 0.02), 0.02, 0, cy, -cz + 0.01, { rx: -a });
    k.box('felt', p.felt, W - 0.03, H - 0.03, 0.006, 0, cy, -cz + 0.008, { r: 0, rx: -a });
    const r = rng(5);
    for (let row = 0; row < 3; row++) {
      const n = 4 + Math.floor(r() * 4), lw = 0.022;
      for (let i = 0; i < n; i++) {
        const lx = (i - (n - 1) / 2) * lw * 1.3, ly = (1 - row) * H * 0.22;
        k.box('letters', 'paint-white-matte', lw * (0.6 + r() * 0.4), lw * 1.2, 0.004, lx, cy + ly * Math.cos(a), -cz + 0.014 - ly * Math.sin(a), { r: 0, rx: -a });
      }
    }
    k.box('frame', p.frame, 0.03, 0.02, H * 0.55, 0, 0.01, -cz - 0.02 + H * 0.2, { r: 0.003 });
    return finish(k);
  },
});

const telescope = mk({
  id: 'decor-telescope-tripod', category: CAT, ko: '황동 망원경(삼각대)', en: 'Brass telescope on tripod',
  params: [
    P.mat('brass', '경통', 'Tube', 'metal-brass', 'metal'),
    P.mat('wood', '삼각대', 'Tripod', 'wood-walnut', 'wood'),
  ],
  tags: ['telescope', 'brass telescope', 'nautical', 'study decor', '망원경', '천체 망원경', '앤틱 소품', '서재 장식'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const top = 1.15;
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + PI / 2; k.rod('wood', p.wood, [Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38], [Math.cos(a) * 0.04, top, Math.sin(a) * 0.04], 0.018, { r2: 0.014, segs: k.seg(10, 5) }); }
    k.cyl('brass', p.brass, 0.05, 0.05, 0.04, 0, top, 0, { segs: k.seg(16, 6) });
    const a = 0.45, L = 0.9;
    const dir = [0, Math.sin(a), Math.cos(a)];
    const seg = [[0.05, 0.36, 0.045], [0.04, 0.3, 0.035], [0.032, 0.24, 0.028]];
    let s0 = -0.35;
    for (const [r1, len, r2] of seg) {
      k.rod('brass', p.brass, [0, top + 0.08 + dir[1] * s0, dir[2] * s0], [0, top + 0.08 + dir[1] * (s0 + len), dir[2] * (s0 + len)], r2, { r2: r1 * 0.9, segs: k.seg(20, 8) });
      s0 += len - 0.04;
    }
    void L;
    k.rod('brass', p.brass, [0, top + 0.08 + dir[1] * 0.36, dir[2] * 0.36], [0, top + 0.08 + dir[1] * 0.42, dir[2] * 0.42], 0.058, { segs: k.seg(20, 8) });
    k.cyl('brass', 'metal-black', 0.02, 0.02, 0.08, 0, top + 0.02, 0, { segs: k.seg(12, 5) });
    return finish(k);
  },
});

const orrery = mk({
  id: 'decor-orrery', category: CAT, placement: 'surface', ko: '태양계 모형(오러리)', en: 'Orrery (solar system model)',
  params: [P.mat('metal', '금속', 'Metal', 'metal-brass', 'metal')],
  tags: ['orrery', 'solar system', 'planets', 'astronomy', 'desk decor', '태양계 모형', '오러리', '행성', '천문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const m = p.metal, y = 0.24;
    k.lathe('metal', m, [[0, 0], [0.12, 0], [0.12, 0.02], [0.05, 0.04], [0.02, 0.06], [0, 0.06]], 0, 0, 0, { segs: k.seg(28, 10) });
    k.cyl('metal', m, 0.008, 0.008, y - 0.06, 0, 0.06, 0, { segs: k.seg(10, 5) });
    k.sphere('sun', 'metal-gold', 0.04, 0, y + 0.02, 0, { segs: k.seg(18, 8), rings: k.seg(12, 5) });
    const planets = [[0.07, 0.008, 'metal-copper'], [0.11, 0.012, 'ceramic-white'], [0.15, 0.014, 'paint-blue-matte'], [0.19, 0.011, 'ceramic-terracotta'], [0.24, 0.026, 'travertine'], [0.29, 0.022, 'metal-gold']];
    planets.forEach(([R, r, mat], i) => {
      const a = i * 1.7;
      const x = Math.cos(a) * R, z = Math.sin(a) * R, py = y - 0.02 + (i % 3) * 0.015;
      k.rod('metal', m, [0, py, 0], [x, py, z], 0.002, { segs: 4 });
      k.rod('metal', m, [x, py, z], [x, py + 0.03, z], 0.002, { segs: 4 });
      k.sphere('planets', mat, r, x, py + 0.03 + r, z, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
    });
    k.add('metal', m, new THREE.TorusGeometry(0.04, 0.002, 3, k.seg(28, 10)).rotateX(PI / 2.3).translate(Math.cos(6.8) * 0.29, y + 0.01 + 0.015 + 0.03 + 0.022, Math.sin(6.8) * 0.29));
    return finish(k);
  },
});

const shipModel = mk({
  id: 'decor-sailing-ship-model', category: CAT, placement: 'surface', ko: '범선 모형', en: 'Sailing ship model',
  params: [
    P.len('length', '길이', 'Length', 0.6, 0.35, 1.0),
    P.mat('wood', '선체', 'Hull', 'wood-teak', 'wood'),
  ],
  tags: ['ship model', 'sailing ship', 'galleon', 'nautical', '범선 모형', '배 모형', '모형', '항해 장식'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, s = L / 0.6, hullY = 0.07 * s;
    const hull = new THREE.Shape([[-0.3, 0.06], [-0.26, 0], [0.22, 0], [0.32, 0.07], [0.3, 0.075], [0.1, 0.06], [-0.2, 0.065], [-0.3, 0.1]].map(([x, y]) => new THREE.Vector2(x * s, y * s)));
    k.panel('hull', p.wood, hull, 0.1 * s, 0, hullY, 0, { bevel: 0.012 * s, curveSegs: 4 });
    k.box('hull', 'wood-dark', 0.5 * s, 0.006, 0.08 * s, 0, hullY + 0.063 * s, 0, { r: 0.002 });
    // stand
    k.box('stand', 'wood-dark', 0.4 * s, 0.02, 0.1 * s, 0, 0.01, 0, { r: 0.004 });
    for (const x of [-0.12, 0.12]) k.box('stand', 'wood-dark', 0.015, hullY, 0.05 * s, x * s, 0.02 + hullY / 2 - 0.01, 0, { r: 0.002 });
    // masts + sails
    const masts = [[-0.14, 0.32], [0.0, 0.4], [0.14, 0.3]];
    for (const [mx, mh] of masts) {
      const x = mx * s, y0 = hullY + 0.06 * s, h = mh * s;
      k.cyl('masts', 'wood-dark', 0.004 * s, 0.005 * s, h, x, y0, 0, { segs: k.seg(8, 4) });
      for (const f of [0.3, 0.62]) {
        const sw = 0.12 * s * (1.1 - f * 0.4), sh = 0.11 * s * (1 - f * 0.3);
        k.box('sails', 'fabric-linen-white', 0.004, sh, sw, x, y0 + h * f + sh / 2 - 0.01 * s, 0.006, { r: 0, ry: 0 });
        k.rod('masts', 'wood-dark', [x, y0 + h * f + sh, -sw / 2 - 0.01], [x, y0 + h * f + sh, sw / 2 + 0.01], 0.002 * s, { segs: 4 });
      }
    }
    k.rod('masts', 'wood-dark', [0.3 * s, hullY + 0.07 * s, 0], [0.42 * s, hullY + 0.12 * s, 0], 0.003 * s, { segs: 4 });
    return finish(k);
  },
});

const guitar = mk({
  id: 'decor-guitar-stand', category: CAT, ko: '통기타와 스탠드', en: 'Acoustic guitar on stand',
  params: [
    P.mat('body', '앞판', 'Top', 'wood-pine', 'wood'),
    P.mat('sides', '측후판', 'Back & sides', 'wood-walnut', 'wood'),
  ],
  tags: ['guitar', 'acoustic guitar', 'guitar stand', 'instrument', 'music', '기타', '통기타', '기타 스탠드', '악기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const lean = 0.22, baseY = 0.12;
    // guitar body outline (figure-eight)
    const s = new THREE.Shape();
    const pts = [];
    for (let i = 0; i <= 48; i++) {
      const t = (i / 48) * TAU;
      const y = 0.25 - 0.25 * Math.cos(t);
      const lower = 0.19, upper = 0.145, waist = 0.12;
      const u = y / 0.5;
      const w = u < 0.55 ? lower * Math.sqrt(Math.max(0, 1 - ((u - 0.28) / 0.29) ** 2)) : upper * Math.sqrt(Math.max(0, 1 - ((u - 0.78) / 0.23) ** 2));
      const ww = Math.max(w, u > 0.45 && u < 0.62 ? waist : 0);
      pts.push(new THREE.Vector2(Math.sin(t) * ww, y));
    }
    s.setFromPoints(pts);
    const m = new THREE.Matrix4().makeRotationX(-lean);
    const place = (geo) => { geo.applyMatrix4(m); geo.translate(0, baseY, 0.05); return geo; };
    const body = new THREE.ExtrudeGeometry(s, { depth: 0.09, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: k.hi ? 2 : 1, curveSegments: 4 });
    body.translate(0, 0, -0.045);
    k.add('sides', p.sides, place(body));
    k.add('top', p.body, place(new THREE.ShapeGeometry(s, 4).translate(0, 0, 0.0505)));
    k.add('hole', 'plastic-black', place(new THREE.CircleGeometry(0.04, k.seg(20, 8)).translate(0, 0.36, 0.051)));
    k.add('neck', 'wood-dark', place(new THREE.BoxGeometry(0.05, 0.48, 0.025).translate(0, 0.73, 0.035)));
    k.add('neck', 'wood-dark', place(new THREE.BoxGeometry(0.075, 0.18, 0.018).translate(0, 1.05, 0.03)));
    k.add('strings', 'metal-steel', place(new THREE.BoxGeometry(0.035, 0.8, 0.002).translate(0, 0.62, 0.052)));
    k.add('top', 'wood-dark', place(new THREE.BoxGeometry(0.1, 0.02, 0.01).translate(0, 0.15, 0.056)));
    // A-frame stand
    for (const sx of [-1, 1]) {
      k.rod('stand', 'metal-black', [sx * 0.15, 0, 0.25], [sx * 0.08, baseY + 0.02, 0.1], 0.008, { segs: k.seg(8, 4) });
      k.rod('stand', 'metal-black', [sx * 0.15, 0, 0.25], [sx * 0.15, 0, -0.15], 0.008, { segs: k.seg(8, 4) });
    }
    k.rod('stand', 'metal-black', [0, 0, -0.15], [0, 0.6, -0.08], 0.009, { segs: k.seg(8, 4) });
    k.rod('stand', 'rubber-black', [-0.12, baseY + 0.02, 0.1], [0.12, baseY + 0.02, 0.1], 0.012, { segs: k.seg(8, 4) });
    return finish(k);
  },
});

const easel = mk({
  id: 'decor-easel-canvas', category: CAT, ko: '이젤과 캔버스', en: "Artist's easel with canvas",
  params: [
    P.len('canvas', '캔버스 높이', 'Canvas height', 0.6, 0.3, 0.9),
    P.mat('wood', '목재', 'Wood', 'wood-pine', 'wood'),
  ],
  tags: ['easel', 'canvas', 'painting', 'artist', 'art studio', '이젤', '캔버스', '그림', '화실'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.wood, H = 1.7, a = 0.15, ch = p.canvas, cw = ch * 0.8;
    for (const s of [-1, 1]) k.rod('wood', w, [s * 0.3, 0, 0.12], [s * 0.05, H, -0.08], 0.018, { segs: k.seg(8, 4) });
    k.rod('wood', w, [0, 0, -0.55], [0, H - 0.05, -0.1], 0.016, { segs: k.seg(8, 4) });
    const ty = 0.8;
    k.box('wood', w, 0.6, 0.03, 0.06, 0, ty, 0.12 - (ty / H) * 0.2 + 0.03, { r: 0.004 });
    const cz = 0.12 - (ty / H) * 0.2 + 0.0 - Math.sin(a) * ch / 2;
    k.box('canvas', 'fabric-cotton-white', cw, ch, 0.025, 0, ty + 0.015 + ch / 2 * Math.cos(a), cz + 0.04, { r: 0.002, rx: -a });
    k.box('paint', 'paint-blue-matte', cw * 0.7, ch * 0.3, 0.002, 0, ty + 0.015 + ch * 0.35 * Math.cos(a), cz + 0.054 - ch * 0.15 * Math.sin(a) + 0.002, { r: 0, rx: -a });
    k.box('paint', 'fabric-mustard', cw * 0.3, cw * 0.3, 0.002, cw * 0.15, ty + 0.015 + ch * 0.75 * Math.cos(a), cz + 0.054 - ch * 0.55 * Math.sin(a) + 0.002, { r: 0, rx: -a });
    return finish(k);
  },
});

export const ITEMS = [cuckoo, aquarium, wreath, dreamcatcher, letterBoard, telescope, orrery, shipModel, guitar, easel];
void roundRect;
