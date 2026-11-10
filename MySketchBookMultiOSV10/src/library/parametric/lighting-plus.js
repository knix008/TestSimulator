// Lighting, more designs (category 'lighting'): magnetic track, recessed linear wall washer,
// suspended linear office luminaire, louvred troffer, UFO high bay, emergency exit sign, emergency
// twin spot, tube batten, linear candle and orb chandeliers, balanced 3-arm pendant, schoolhouse
// stem pendant, alabaster sconce, stair step light, LED corner pole, office up/down floor light,
// 3-head tree lamp, portable lantern, candlestick buffet lamp, surface cylinder downlight and a
// pharmacy floor lamp.
// Every glowing part uses a light-* preset and the item carries Kit.light markers at the emitters
// (marker intensity × 800 = lumens, see builder.js lampSpec; spots shine along the marker's −Y).
// Ceiling items follow lighting.js: the lowest point is y = 0 and `elevation` is where that bottom
// goes under a 2.4 m ceiling (recessed fittings: the trim hangs just below the ceiling).
import { THREE, Kit, P, frameShape, transformAdded } from './helpers.js';
import { finish } from './kitchen.js';
import { mk } from './appliances-more.js';
import { canopy, bulb, profileOf, metalShade } from './lighting.js';

const PI = Math.PI;
const CAT = 'lighting';
const CEILING = 2.4;
const WARM = '#ffe2b0';
const COOL = '#f3f6ff';

/** Opal glass / alabaster diffuser: milky when the lamp is off, glowing when it is on (builder.js setLampGlow). */
const OPAL = { color: '#f3eee6', emissive: '#ffe0b0', emissiveIntensity: 0.9 };

const L$ = (def) => mk({ category: CAT, ...def });

/** A ceiling item whose `elevation` follows its measured height (or the trim drop of a recessed fitting). */
function ceil$(def, recessed = 0) {
  const entry = L$({ placement: 'ceiling', ...def });
  Object.defineProperty(entry, 'elevation', {
    enumerable: true, configurable: true,
    get: () => Math.round((CEILING - (recessed || entry.size[1])) * 1000) / 1000,
  });
  return entry;
}

const v3 = (a, s = 1, b = [0, 0, 0]) => [b[0] + a[0] * s, b[1] + a[1] * s, b[2] + a[2] * s];

/* ------------------------------------------------------------ track and recessed */

const magneticTrack = ceil$({
  id: 'ltx-magnetic-track', ko: '마그네틱 레일 조명', en: 'Magnetic track light',
  params: [
    P.len('length', '레일 길이', 'Track length', 2.0, 1.0, 4.0),
    P.int('spots', '스폿 수', 'Spots', 3, 1, 6),
    P.num('tilt', '스폿 기울기(°)', 'Spot tilt (°)', 20, 0, 60, 1),
    P.mat('finish', '마감', 'Finish', 'metal-black', 'metal'),
  ],
  tags: ['magnetic track', 'track light', 'rail spotlight', 'spot', '마그네틱 레일', '레일 조명', '레일등', '스폿 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, m = p.finish;
    // 48 mm surface channel at the ceiling (y = 0 here; finish() puts the lowest point at 0)
    k.box('track', m, L, 0.048, 0.026, 0, -0.024, 0, { r: 0.002 });
    k.box('slot', 'plastic-black', L - 0.012, 0.003, 0.012, 0, -0.0485, 0, { r: 0 });
    for (const s of [-1, 1]) k.box('track', m, 0.004, 0.05, 0.028, s * (L / 2 + 0.002), -0.025, 0, { r: 0.001 });
    const t = (p.tilt * PI) / 180, dir = [0, -Math.cos(t), Math.sin(t)];
    for (let i = 0; i < p.spots; i++) {
      const x = -L / 2 + (L * (i + 0.5)) / p.spots;
      k.box('heads', m, 0.03, 0.016, 0.02, x, -0.057, 0, { r: 0.003 }); // magnetic adapter
      k.rod('heads', m, [x, -0.064, 0], [x, -0.1, 0], 0.005, { segs: k.seg(10, 5) });
      k.box('heads', m, 0.07, 0.008, 0.012, x, -0.104, 0, { r: 0.002 }); // yoke
      for (const s of [-1, 1]) k.box('heads', m, 0.004, 0.04, 0.012, x + s * 0.033, -0.124, 0, { r: 0.001 });
      const pivot = [x, -0.14, 0];
      const a = v3(dir, -0.045, pivot), b = v3(dir, 0.075, pivot);
      k.rod('heads', m, a, b, 0.028, { segs: k.seg(24, 8) });
      k.rod('baffle', 'paint-black-matte', v3(dir, -0.012, b), v3(dir, 0.004, b), 0.0285, { segs: k.seg(24, 8), open: true });
      k.rod('bulb', 'light-warm', v3(dir, -0.008, b), v3(dir, -0.005, b), 0.021, { segs: k.seg(18, 8) });
      const l = v3(dir, 0.012, b);
      k.light(l[0], l[1], l[2], { intensity: 0.6, distance: 5, type: 'spot', angle: 0.35, color: WARM });
    }
    return finish(k);
  },
});

const wallWasher = ceil$({
  id: 'ltx-wall-washer-recessed', ko: '매입 선형 월워셔', en: 'Recessed linear wall washer',
  params: [
    P.len('length', '길이', 'Length', 1.2, 0.6, 2.4),
    P.mat('trim', '테두리', 'Trim', 'metal-white', 'metal'),
  ],
  tags: ['wall washer', 'linear recessed', 'wash light', 'architectural lighting', '월워셔', '벽면 조명', '매입 라인 조명', '건축 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, W = 0.09;
    // 6 mm trim flange (a frame) just under the ceiling; the rest sits above it in the void
    for (const s of [-1, 1]) {
      k.box('trim', p.trim, L, 0.006, 0.014, 0, 0.003, s * (W / 2 - 0.007), { r: 0.001 });
      k.box('trim', p.trim, 0.014, 0.006, W - 0.028, s * (L / 2 - 0.007), 0.003, 0, { r: 0.001 });
    }
    // dark side baffles, LED board on the back side and an angled kick reflector that throws the light to +z
    for (const s of [-1, 1]) k.box('baffle', 'paint-black-matte', L - 0.028, 0.055, 0.003, 0, 0.034, s * (W / 2 - 0.016), { r: 0 });
    k.box('bulb', 'light-warm', L - 0.04, 0.004, 0.016, 0, 0.058, -0.022, { r: 0 });
    k.box('reflector', 'metal-aluminium', L - 0.03, 0.003, 0.07, 0, 0.038, 0.006, { r: 0, rx: 0.55 });
    k.box('housing', 'metal-steel', L, 0.03, W - 0.01, 0, 0.076, 0, { r: 0.002 });
    k.box('housing', 'metal-steel', 0.12, 0.035, 0.07, L / 2 - 0.12, 0.108, 0, { r: 0.002 }); // driver
    const n = Math.max(1, Math.round(L / 0.5));
    for (let i = 0; i < n; i++) k.light(-L / 2 + (L * (i + 0.5)) / n, 0.02, 0.02, { intensity: 0.45, distance: 5, type: 'spot', angle: 0.65, color: WARM });
    return finish(k);
  },
}, 0.006);

const linearOffice = ceil$({
  id: 'ltx-linear-suspended', ko: '사무실 직·간접 라인 펜던트', en: 'Suspended linear office light (direct/indirect)',
  params: [
    P.len('length', '길이', 'Length', 1.5, 1.2, 2.4),
    P.len('drop', '와이어 길이', 'Cable length', 0.6, 0.3, 1.5),
    P.mat('body', '본체', 'Body', 'metal-white', 'metal'),
  ],
  tags: ['linear pendant', 'office light', 'suspended luminaire', 'direct indirect', '사무실 조명', '라인 펜던트', '직간접 조명', '와이어 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, H = 0.05, D = 0.065, m = p.body;
    k.rbox('body', m, L, H, D, 0.008, 0, H / 2 + 0.002, 0);
    k.box('diffuser', 'light-cool', L - 0.02, 0.004, D - 0.016, 0, 0.002, 0, { r: 0.001 }); // opal down diffuser
    k.box('diffuser', 'light-cool', L - 0.02, 0.003, D - 0.03, 0, H + 0.0025, 0, { r: 0.001 }); // up-light lens
    for (const s of [-1, 1]) k.box('caps', 'plastic-grey', 0.005, H, D, s * (L / 2 + 0.0015), H / 2 + 0.002, 0, { r: 0.001 });
    const top = H + p.drop;
    for (const s of [-1, 1]) {
      const x = s * (L / 2 - 0.15);
      k.cyl('cable', 'metal-chrome', 0.004, 0.004, 0.02, x, H + 0.002, 0, { segs: k.seg(10, 5) });
      k.rod('cable', 'metal-steel', [x, H + 0.02, 0], [x, top - 0.012, 0], 0.0008, { segs: 4 });
      k.cyl('canopy', m, 0.035, 0.035, 0.012, x, top - 0.012, 0, { segs: k.seg(24, 8) });
    }
    k.rod('cable', 'plastic-white', [0.05, H + 0.002, 0], [0.05, top - 0.012, 0], 0.002, { segs: 4 }); // power cord
    k.cyl('canopy', m, 0.035, 0.035, 0.012, 0.05, top - 0.012, 0, { segs: k.seg(24, 8) });
    const n = Math.max(2, Math.round(L / 0.6));
    for (let i = 0; i < n; i++) k.light(-L / 2 + (L * (i + 0.5)) / n, -0.01, 0, { intensity: 4.5 / n, distance: 7, color: COOL });
    k.light(0, H + 0.06, 0, { intensity: 1.2, distance: 5, color: COOL }); // indirect share
    return finish(k);
  },
});

const troffer = ceil$({
  id: 'ltx-troffer-louvre', ko: '매입 루버 등기구 (M-BAR)', en: 'Recessed louvre troffer',
  params: [
    P.pick('format', '크기', 'Size', '600', [['600', '600×600', '600 × 600'], ['1200', '600×1200', '600 × 1200']]),
    P.int('lamps', '램프 수', 'Lamps', 3, 2, 4),
    P.mat('body', '본체', 'Body', 'paint-white-matte', 'paint'),
  ],
  tags: ['troffer', 'louvre light', 'office ceiling light', 'grid light', 'recessed', '루버 등기구', '사무실 천장등', '매입등', 'M바 조명', '형광등'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.6, D = p.format === '1200' ? 1.2 : 0.6, m = p.body;
    // 12 mm flange frame that rests on the ceiling grid
    for (const s of [-1, 1]) {
      k.box('body', m, W, 0.012, 0.022, 0, 0.006, s * (D / 2 - 0.011), { r: 0.002 });
      k.box('body', m, 0.022, 0.012, D - 0.044, s * (W / 2 - 0.011), 0.006, 0, { r: 0.002 });
    }
    // open-bottomed housing: four walls + top (the reflector you look into)
    k.box('body', m, W - 0.044, 0.004, D - 0.044, 0, 0.094, 0, { r: 0 });
    for (const s of [-1, 1]) {
      k.box('body', m, W - 0.044, 0.084, 0.003, 0, 0.054, s * (D / 2 - 0.0235), { r: 0 });
      k.box('body', m, 0.003, 0.084, D - 0.044, s * (W / 2 - 0.0235), 0.054, 0, { r: 0 });
    }
    const n = p.lamps, pitch = (W - 0.06) / n;
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + 0.03 + pitch * (i + 0.5);
      k.rod('tubes', 'light-cool', [x, 0.07, -D / 2 + 0.05], [x, 0.07, D / 2 - 0.05], 0.008, { segs: k.seg(12, 6) });
      for (const s of [-1, 1]) k.box('holders', 'plastic-white', 0.022, 0.03, 0.02, x, 0.075, s * (D / 2 - 0.04), { r: 0.002 });
    }
    // parabolic louvre: long blades between the lamps + cross blades
    for (let i = 0; i <= n; i++) k.box('louvre', 'metal-chrome', 0.003, 0.04, D - 0.05, -W / 2 + 0.03 + pitch * i, 0.032, 0, { r: 0 });
    const cross = Math.round((D - 0.05) / 0.1);
    for (let j = 1; j < cross; j++) k.box('louvre', 'metal-chrome', W - 0.05, 0.03, 0.002, 0, 0.027, -D / 2 + 0.025 + ((D - 0.05) * j) / cross, { r: 0 });
    const sections = D > 0.9 ? 2 : 1;
    for (let j = 0; j < sections; j++) k.light(0, 0.02, -D / 2 + (D * (j + 0.5)) / sections, { intensity: (n * 1.5) / sections, distance: 7, color: COOL });
    return finish(k);
  },
}, 0.012);

/* --------------------------------------------------------------- industrial */

const highBay = ceil$({
  id: 'ltx-high-bay', ko: 'LED 투광등 (UFO 하이베이)', en: 'UFO LED high bay',
  params: [
    P.len('diameter', '지름', 'Diameter', 0.4, 0.3, 0.5),
    P.len('drop', '체인 길이', 'Chain length', 0.5, 0.2, 1.5),
    P.bool('reflector', '반사갓', 'Reflector', true),
    P.mat('body', '본체', 'Body', 'paint-black-matte', 'paint'),
  ],
  tags: ['high bay', 'ufo light', 'warehouse light', 'industrial', '하이베이', '공장등', '창고 조명', '투광등', '산업용 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2;
    k.cyl('lens', 'light-cool', R * 0.8, R * 0.8, 0.004, 0, 0, 0, { segs: k.seg(40, 12) });
    k.lathe('body', p.body, [[R * 0.8, 0.002], [R * 0.97, 0.008], [R, 0.025], [R * 0.96, 0.045], [R * 0.55, 0.055], [0.05, 0.06], [0, 0.06]], 0, 0, 0, { segs: k.seg(40, 12) });
    // radial heat-sink fins on the back
    const fins = k.hi ? 24 : 10;
    for (let i = 0; i < fins; i++) {
      const a = (i / fins) * PI * 2, rr = R * 0.5 + 0.03;
      k.box('fins', 'metal-aluminium', R * 0.62, 0.045, 0.004, Math.cos(a) * rr, 0.075, Math.sin(a) * rr, { r: 0, ry: -a });
    }
    k.cyl('fins', 'metal-aluminium', 0.06, 0.07, 0.07, 0, 0.055, 0, { segs: k.seg(24, 8) });
    if (p.reflector) {
      const outer = profileOf([[R * 1.55, -R * 0.85], [R * 1.25, -R * 0.45], [R * 1.03, -0.003]], k.seg(10, 4));
      k.lathe('reflector', 'metal-aluminium', outer, 0, 0, 0, { segs: k.seg(40, 12) });
      k.lathe('reflector', 'metal-aluminium', outer.map(([r, y]) => [r - 0.002, y]).reverse(), 0, 0, 0, { segs: k.seg(40, 12) });
    }
    // eye hook, chain and the ceiling hook plate
    k.add('chain', 'metal-steel', new THREE.TorusGeometry(0.018, 0.004, k.seg(6, 4), k.seg(16, 8)).translate(0, 0.14, 0));
    const links = Math.max(2, Math.floor(p.drop / 0.034));
    for (let j = 0; j < links; j++) {
      const g = new THREE.TorusGeometry(0.012, 0.0025, k.seg(5, 3), k.seg(12, 6)).scale(0.75, 1.3, 1);
      if (j % 2) g.rotateY(PI / 2);
      k.add('chain', 'metal-steel', g.translate(0, 0.17 + j * 0.034, 0));
    }
    const top = 0.17 + links * 0.034 + 0.01;
    k.cyl('canopy', 'metal-steel', 0.04, 0.04, 0.01, 0, top, 0, { segs: k.seg(20, 8) });
    k.light(0, -0.02, 0, { intensity: 12, distance: 14, type: 'spot', angle: 1.0, color: COOL });
    return finish(k);
  },
});

/* ------------------------------------------------------------- emergency */

const GREEN = { color: '#1fb455', emissive: '#16d45f', emissiveIntensity: 1.6 };

const exitSign = L$({
  id: 'ltx-exit-sign', placement: 'wall', elevation: 2.1, ko: '비상구 유도등', en: 'Emergency exit sign',
  params: [
    P.len('width', '폭', 'Width', 0.36, 0.25, 0.5),
    P.pick('arrow', '화살표', 'Arrow', 'right', [['right', '오른쪽', 'Right'], ['left', '왼쪽', 'Left'], ['none', '없음', 'None']]),
    P.mat('housing', '외함', 'Housing', 'plastic-white', 'plastic'),
  ],
  tags: ['exit sign', 'emergency exit', 'running man', 'safety sign', '비상구', '유도등', '피난구 유도등', '비상 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, H = W * 0.45, D = 0.03, s = H / 0.162;
    k.rbox('housing', p.housing, W, H, D, 0.004, 0, H / 2, 0, { segs: k.seg(2, 1) });
    k.box('panel', 'light-cool', W - 0.02, H - 0.02, 0.003, 0, H / 2, D / 2 + 0.0005, { r: 0, overrides: GREEN });
    const zf = D / 2 + 0.003, dirX = p.arrow === 'left' ? -1 : 1, white = 'paint-white-gloss';
    const X = (x) => x * dirX * s;
    const Y = (y) => H / 2 + y * s;
    // door (outline) and the running figure heading for it
    k.panel('picto', white, frameShape(0.05 * s, 0.11 * s, 0.007 * s), 0.002, X(0.11), Y(0), zf);
    k.sphere('picto', white, 0.011 * s, X(0.02), Y(0.045), zf, { segs: k.seg(12, 6), rings: k.seg(8, 4), scale: [1, 1, 0.3] });
    const lim = (a, b) => k.rod('picto', white, [X(a[0]), Y(a[1]), zf], [X(b[0]), Y(b[1]), zf], 0.0055 * s, { segs: 5 });
    lim([0.01, 0.028], [-0.004, -0.008]); // torso
    lim([-0.004, -0.008], [0.022, -0.03]); lim([0.022, -0.03], [0.02, -0.055]); // front leg
    lim([-0.004, -0.008], [-0.03, -0.03]); lim([-0.03, -0.03], [-0.05, -0.04]); // back leg
    lim([0.008, 0.022], [0.035, 0.012]); lim([0.008, 0.022], [-0.022, 0.012]); // arms
    if (p.arrow !== 'none') {
      const ax = -0.1;
      lim([ax - 0.035, 0], [ax + 0.03, 0]);
      lim([ax + 0.03, 0], [ax + 0.008, 0.022]);
      lim([ax + 0.03, 0], [ax + 0.008, -0.022]);
    }
    k.light(0, H / 2, D / 2 + 0.04, { intensity: 0.06, distance: 2, color: '#5cff95' });
    return finish(k);
  },
});

const twinSpot = L$({
  id: 'ltx-emergency-twin-spot', placement: 'wall', elevation: 2.25, ko: '비상 조명등 (2구)', en: 'Emergency twin spot light',
  params: [
    P.num('aim', '헤드 각도(°)', 'Head aim (°)', 35, 0, 70, 1),
    P.mat('body', '본체', 'Body', 'plastic-white', 'plastic'),
  ],
  tags: ['emergency light', 'twin spot', 'battery backup', 'bug eye', '비상등', '비상 조명', '정전 조명', '2구 비상등'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const m = p.body;
    k.rbox('body', m, 0.32, 0.11, 0.075, 0.012, 0, 0.055, 0, { segs: k.seg(3, 1) });
    k.box('label', 'plastic-grey', 0.12, 0.028, 0.003, 0, 0.05, 0.0385, { r: 0.001 });
    k.sphere('led', 'plastic-white', 0.004, 0.1, 0.035, 0.0375, { segs: 8, rings: 5, overrides: { color: '#d7322b' } });
    const t = (p.aim * PI) / 180, dir = [0, -Math.sin(t), Math.cos(t)];
    for (const sx of [-1, 1]) {
      const x = sx * 0.1;
      k.cyl('yoke', m, 0.009, 0.011, 0.02, x, 0.108, 0, { segs: k.seg(12, 6) });
      k.box('yoke', m, 0.09, 0.008, 0.016, x, 0.13, 0, { r: 0.002 });
      for (const s of [-1, 1]) k.box('yoke', m, 0.006, 0.05, 0.016, x + s * 0.042, 0.155, 0, { r: 0.002 });
      const pivot = [x, 0.168, 0];
      const a = v3(dir, -0.03, pivot), b = v3(dir, 0.035, pivot);
      k.rod('heads', m, a, b, 0.036, { segs: k.seg(24, 8) });
      k.rod('heads', 'metal-chrome', v3(dir, -0.008, b), v3(dir, 0.004, b), 0.037, { segs: k.seg(24, 8), open: true });
      k.rod('bulb', 'light-warm', v3(dir, -0.006, b), v3(dir, -0.003, b), 0.03, { segs: k.seg(20, 8) });
      const l = v3(dir, 0.012, b);
      k.light(l[0], l[1], l[2], { intensity: 0.35, distance: 6, type: 'spot', angle: 0.5, color: COOL });
    }
    return finish(k);
  },
});

const batten = ceil$({
  id: 'ltx-tube-batten', ko: '직관 형광등 (트윈 등기구)', en: 'Tube batten light',
  params: [
    P.len('length', '길이', 'Length', 1.2, 0.6, 1.5),
    P.int('tubes', '관 수', 'Tubes', 2, 1, 2),
    P.mat('body', '본체', 'Body', 'metal-white', 'metal'),
  ],
  tags: ['batten', 'tube light', 'fluorescent', 't8', 'garage light', '형광등', '직관등', '등기구', '창고 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, n = p.tubes, Wd = n === 1 ? 0.05 : 0.11;
    k.box('body', p.body, L, 0.032, Wd, 0, 0.056, 0, { r: 0.003 });
    for (const s of [-1, 1]) k.box('holders', 'plastic-white', 0.03, 0.04, Wd * 0.92, s * (L / 2 - 0.015), 0.036, 0, { r: 0.003 });
    for (let j = 0; j < n; j++) {
      const z = n === 1 ? 0 : (j - 0.5) * 0.055;
      k.rod('tubes', 'light-cool', [-L / 2 + 0.03, 0.026, z], [L / 2 - 0.03, 0.026, z], 0.013, { segs: k.seg(14, 6) });
    }
    const sections = Math.max(1, Math.round(L / 0.6));
    for (let i = 0; i < sections; i++) k.light(-L / 2 + (L * (i + 0.5)) / sections, 0.0, 0, { intensity: (n * 2.3) / sections, distance: 7, color: COOL });
    return finish(k);
  },
});

/* ----------------------------------------------------------- chandeliers */

/** Candle: drip cup, white sleeve and a flame-shaped bulb, standing at (x, y, z). */
function candle(k, metal, x, y, z, h = 0.09) {
  k.lathe('metal', metal, [[0, 0], [0.012, 0], [0.028, 0.01], [0.03, 0.014], [0.014, 0.012], [0, 0.012]], x, y, z, { segs: k.seg(18, 8) });
  k.cyl('sleeve', 'paint-white-gloss', 0.011, 0.011, h, x, y + 0.01, z, { segs: k.seg(14, 6) });
  k.lathe('bulb', 'light-warm', [[0, 0], [0.009, 0.006], [0.012, 0.016], [0.008, 0.03], [0, 0.04]], x, y + 0.01 + h, z, { segs: k.seg(12, 6) });
}

const linearCandle = ceil$({
  id: 'ltx-linear-candle-chandelier', ko: '일자형 캔들 샹들리에', en: 'Linear candle chandelier',
  params: [
    P.len('length', '길이', 'Length', 1.2, 0.8, 1.8),
    P.int('candles', '초 수', 'Candles', 6, 4, 10),
    P.len('drop', '봉 길이', 'Rod length', 0.5, 0.2, 1.2),
    P.mat('metal', '금속', 'Metal', 'metal-black', 'metal'),
  ],
  tags: ['linear chandelier', 'island chandelier', 'candle chandelier', 'farmhouse', '일자형 샹들리에', '아일랜드 조명', '캔들 샹들리에', '식탁 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, m = p.metal, n = p.candles, yb = 0.02, yt = 0.33;
    for (const y of [yb, yt]) k.rod('metal', m, [-L / 2, y, 0], [L / 2, y, 0], 0.008, { segs: k.seg(12, 6) });
    for (const s of [-1, 1]) {
      k.rod('metal', m, [s * L / 2, yb, 0], [s * L / 2, yt, 0], 0.007, { segs: k.seg(12, 6) });
      k.sphere('metal', m, 0.016, s * (L / 2 + 0.012), yb, 0, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
      k.sphere('metal', m, 0.016, s * (L / 2 + 0.012), yt, 0, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
    }
    // gentle scrolls between the rails make it read as wrought iron
    const scrolls = Math.max(2, n - 1);
    for (let i = 0; i < scrolls; i++) {
      const x = -L / 2 + (L * (i + 0.5)) / scrolls;
      k.tube('metal', m, [[x - 0.05, yt, 0], [x - 0.02, yt - 0.06, 0], [x, yt - 0.09, 0], [x + 0.02, yt - 0.06, 0], [x + 0.05, yt, 0]], 0.004, { segs: k.seg(16, 6), radial: k.seg(6, 4) });
    }
    for (let i = 0; i < n; i++) candle(k, m, -L / 2 + 0.08 + ((L - 0.16) * i) / Math.max(1, n - 1), yb + 0.006, 0);
    const top = yt + p.drop;
    for (const s of [-1, 1]) {
      const x = s * (L / 2 - 0.08);
      k.rod('metal', m, [x, yt, 0], [x, top - 0.02, 0], 0.006, { segs: k.seg(10, 5) });
      k.cyl('canopy', m, 0.045, 0.055, 0.02, x, top - 0.02, 0, { segs: k.seg(24, 8) });
    }
    for (const s of [-1, 1]) k.light(s * L / 4, 0.17, 0, { intensity: n * 0.16, distance: 6, color: WARM });
    return finish(k);
  },
});

const orbChandelier = ceil$({
  id: 'ltx-orb-chandelier', ko: '오브 샹들리에 (구형 링)', en: 'Orb chandelier',
  params: [
    P.len('diameter', '지름', 'Diameter', 0.7, 0.45, 1.1),
    P.len('drop', '체인 길이', 'Chain length', 0.4, 0.1, 1.2),
    P.int('lights', '전구 수', 'Lights', 5, 3, 8),
    P.mat('metal', '금속', 'Metal', 'metal-brass', 'metal'),
  ],
  tags: ['orb chandelier', 'sphere chandelier', 'armillary', 'globe chandelier', '오브 샹들리에', '구형 샹들리에', '링 샹들리에', '거실 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, cy = R + 0.02, m = p.metal;
    const t = 0.006, rs = k.seg(8, 4), ts = k.seg(64, 18);
    k.add('metal', m, new THREE.TorusGeometry(R, t, rs, ts).rotateX(PI / 2).translate(0, cy, 0));
    for (let j = 0; j < 3; j++) k.add('metal', m, new THREE.TorusGeometry(R, t, rs, ts).rotateY((j * PI) / 3).translate(0, cy, 0));
    // central stem, bottom finial and the inner candle ring with spokes
    k.rod('metal', m, [0, 0.02, 0], [0, cy + R, 0], 0.007, { segs: k.seg(12, 6) });
    k.sphere('metal', m, 0.02, 0, 0.02, 0, { segs: k.seg(14, 6), rings: k.seg(10, 4) });
    const ry = cy - R * 0.35, rr = R * 0.45;
    k.add('metal', m, new THREE.TorusGeometry(rr, 0.005, rs, k.seg(40, 12)).rotateX(PI / 2).translate(0, ry, 0));
    for (let i = 0; i < p.lights; i++) {
      const a = (i / p.lights) * PI * 2, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      k.rod('metal', m, [0, ry, 0], [x, ry, z], 0.004, { segs: 5 });
      candle(k, m, x, ry, z, 0.07);
    }
    const top = cy + R + p.drop;
    k.add('metal', m, new THREE.TorusGeometry(0.018, 0.004, rs, k.seg(16, 8)).translate(0, cy + R + 0.015, 0));
    k.rod('metal', m, [0, cy + R + 0.03, 0], [0, top - 0.03, 0], 0.005, { segs: k.seg(10, 5) });
    canopy(k, top, 0.06, 0.03, m);
    k.light(0, ry + 0.12, 0, { intensity: p.lights * 0.25, distance: 7, color: WARM });
    return finish(k);
  },
});

/* -------------------------------------------------------------- pendants */

const balancedPendant = ceil$({
  id: 'ltx-three-arm-pendant', ko: '3암 밸런스 펜던트', en: 'Three-arm balanced pendant',
  params: [
    P.len('reach', '팔 길이', 'Arm reach', 0.55, 0.35, 0.8),
    P.len('drop', '줄 길이', 'Cord length', 0.6, 0.3, 1.4),
    P.mat('shade', '갓', 'Shades', 'metal-black', 'metal'),
    P.mat('accent', '팔·장식', 'Arms', 'metal-brass', 'metal'),
  ],
  tags: ['multi arm pendant', 'mobile pendant', 'balanced pendant', 'mid century', '3구 펜던트', '모빌 조명', '밸런스 펜던트', '식탁 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = 0.07, shadeH = R + 0.035, cordL = 0.12, armY = shadeH + cordL, hubY = armY + 0.09;
    k.sphere('arms', p.accent, 0.022, 0, hubY, 0, { segs: k.seg(16, 8), rings: k.seg(10, 5) });
    for (let i = 0; i < 3; i++) {
      const a = PI / 2 + (i * 2 * PI) / 3, c = Math.cos(a), s = Math.sin(a);
      const ex = c * p.reach, ez = s * p.reach;
      k.rod('arms', p.accent, [c * 0.02, hubY, s * 0.02], [ex, armY, ez], 0.005, { segs: k.seg(10, 5) });
      k.sphere('arms', p.accent, 0.012, ex, armY, ez, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
      k.rod('cord', 'plastic-black', [ex, armY - 0.01, ez], [ex, shadeH - 0.005, ez], 0.0025, { segs: 5 });
      transformAdded(k, () => {
        metalShade(k, 'cone', R, 0, p.shade);
        bulb(k, 0, 0.055, 0, 0.022);
        k.light(0, 0.04, 0, { intensity: 0.45, distance: 5, type: 'spot', angle: 0.75, color: WARM });
      }, ex, 0, ez);
    }
    const top = hubY + p.drop;
    k.rod('cord', 'plastic-black', [0, hubY + 0.02, 0], [0, top - 0.025, 0], 0.003, { segs: 5 });
    canopy(k, top, 0.06, 0.025, p.accent);
    return finish(k);
  },
});

const schoolhouse = ceil$({
  id: 'ltx-schoolhouse-pendant', ko: '스쿨하우스 봉 펜던트', en: 'Schoolhouse stem pendant',
  params: [
    P.len('diameter', '지름', 'Diameter', 0.3, 0.2, 0.4),
    P.len('rod', '봉 길이', 'Stem length', 0.6, 0.15, 1.2),
    P.mat('fitter', '금속', 'Fitter', 'metal-brass', 'metal'),
  ],
  tags: ['schoolhouse', 'opal glass pendant', 'stem pendant', 'vintage', '스쿨하우스', '오팔 유리', '봉 펜던트', '빈티지 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, Hg = R * 1.3, nr = Math.max(0.045, R * 0.48), m = p.fitter;
    const glass = profileOf([[0, 0], [R * 0.4, 0.004], [R * 0.78, R * 0.12], [R, R * 0.55], [R * 0.96, R * 0.85], [R * 0.76, R * 1.08], [nr + 0.004, R * 1.22], [nr, Hg]], k.seg(20, 8));
    k.lathe('globe', 'light-warm', glass, 0, 0, 0, { segs: k.seg(40, 12), overrides: OPAL });
    // fitter: collar over the neck, cap and the threaded stem
    k.cyl('fitter', m, nr + 0.008, nr + 0.008, 0.035, 0, Hg - 0.012, 0, { segs: k.seg(32, 10) });
    k.lathe('fitter', m, [[nr + 0.008, 0], [nr + 0.004, 0.012], [0.03, 0.03], [0.012, 0.04], [0, 0.04]], 0, Hg + 0.023, 0, { segs: k.seg(28, 10) });
    bulb(k, 0, R * 0.62, 0, Math.min(0.035, R * 0.3), { socket: m, up: true });
    const s0 = Hg + 0.06, top = s0 + p.rod + 0.045;
    k.rod('fitter', m, [0, s0, 0], [0, top - 0.04, 0], 0.009, { segs: k.seg(12, 6) });
    k.sphere('fitter', m, 0.014, 0, top - 0.04, 0, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
    canopy(k, top, 0.065, 0.03, m);
    k.light(0, R * 0.62, 0, { intensity: 1.1, distance: 6, color: WARM });
    return finish(k);
  },
});

/* ----------------------------------------------------------- wall lights */

const alabaster = L$({
  id: 'ltx-alabaster-sconce', placement: 'wall', elevation: 1.6, ko: '반원통 알라바스터 벽등', en: 'Alabaster half-cylinder sconce',
  params: [
    P.len('height', '높이', 'Height', 0.35, 0.2, 0.6),
    P.mat('metal', '금속', 'Metal', 'metal-brass', 'metal'),
  ],
  tags: ['alabaster sconce', 'half cylinder', 'wall light', 'flush sconce', '알라바스터', '반원 벽등', '벽 조명', '복도 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, r = 0.07, segs = k.seg(28, 10), m = p.metal;
    // glowing stone shade: front half of a cylinder (axis on the back plate)
    k.add('shade', 'light-warm', new THREE.CylinderGeometry(r, r, H - 0.024, segs, 1, true, -PI / 2, PI).translate(0, H / 2, 0), { overrides: { ...OPAL, color: '#efe4d2' } });
    for (const y of [0, H - 0.012]) k.add('metal', m, new THREE.CylinderGeometry(r + 0.004, r + 0.004, 0.012, segs, 1, false, -PI / 2, PI).translate(0, y + 0.006, 0));
    k.box('metal', m, 2 * r + 0.008, H, 0.008, 0, H / 2, -0.004, { r: 0.002 });
    k.cyl('socket', m, 0.014, 0.014, 0.03, 0, H * 0.2, r * 0.45, { segs: k.seg(12, 6) });
    k.cyl('bulb', 'light-warm', 0.013, 0.013, H * 0.5, 0, H * 0.2 + 0.03, r * 0.45, { segs: k.seg(12, 6) });
    k.light(0, H / 2, r * 0.5, { intensity: 0.55, distance: 4, color: WARM });
    return finish(k);
  },
});

const stepLight = L$({
  id: 'ltx-step-light', placement: 'wall', elevation: 0.25, ko: '계단 발밑등', en: 'Stair step light',
  params: [
    P.pick('shape', '모양', 'Shape', 'rect', [['rect', '사각 루버', 'Louvred rectangle'], ['round', '원형 아이리드', 'Round eyelid']]),
    P.mat('plate', '커버', 'Faceplate', 'metal-steel', 'metal'),
  ],
  tags: ['step light', 'stair light', 'foot light', 'recessed wall light', '발밑등', '계단등', '풋라이트', '벽 매입등'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const m = p.plate;
    if (p.shape === 'round') {
      k.cyl('plate', m, 0.045, 0.045, 0.008, 0, 0.045, -0.004, { rx: PI / 2, segs: k.seg(32, 10) });
      k.box('recess', 'paint-black-matte', 0.05, 0.016, 0.002, 0, 0.036, 0.0045, { r: 0 });
      k.box('bulb', 'light-warm', 0.044, 0.004, 0.002, 0, 0.032, 0.0055, { r: 0 });
      // eyelid hood over the slot
      k.add('plate', m, new THREE.CylinderGeometry(0.03, 0.03, 0.06, k.seg(16, 6), 1, true, 0, PI / 2).rotateZ(PI / 2).translate(0, 0.03 + 0.012, 0.004));
    } else {
      k.box('plate', m, 0.13, 0.075, 0.008, 0, 0.0375, 0, { r: 0.002 });
      k.box('recess', 'paint-black-matte', 0.1, 0.034, 0.002, 0, 0.026, 0.0045, { r: 0 });
      k.box('bulb', 'light-warm', 0.096, 0.005, 0.002, 0, 0.04, 0.0055, { r: 0 });
      for (const y of [0.016, 0.026, 0.036]) k.box('plate', m, 0.1, 0.004, 0.008, 0, y, 0.007, { r: 0, rx: -0.6 });
    }
    k.light(0, 0.02, 0.03, { intensity: 0.12, distance: 2, type: 'spot', angle: 1.0, color: WARM });
    return finish(k);
  },
});

/* ------------------------------------------------------------ floor lamps */

const ledPole = L$({
  id: 'ltx-led-corner-pole', ko: 'LED 코너 스탠드 (막대형)', en: 'LED corner floor pole',
  params: [
    P.len('height', '높이', 'Height', 1.5, 1.0, 1.9),
    P.color('glow', '빛 색', 'Light colour', '#ffcf8a'),
    P.mat('base', '받침', 'Base', 'metal-black', 'metal'),
  ],
  tags: ['led floor lamp', 'corner lamp', 'rgb pole', 'mood light', 'LED 스탠드', '코너 조명', '무드등', '막대 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, glow = { color: p.glow, emissive: p.glow };
    k.cyl('base', p.base, 0.125, 0.13, 0.015, 0, 0, 0, { segs: k.seg(40, 12) });
    k.box('pole', 'metal-aluminium', 0.03, H - 0.025, 0.022, 0, 0.015 + (H - 0.025) / 2, 0, { r: 0.003 });
    k.box('bulb', 'light-warm', 0.02, H - 0.09, 0.004, 0, 0.05 + (H - 0.09) / 2, 0.0115, { r: 0.0015, overrides: glow });
    k.box('base', p.base, 0.032, 0.012, 0.024, 0, H - 0.004, 0, { r: 0.003 });
    for (const f of [0.35, 0.75]) k.light(0, H * f, 0.03, { intensity: 0.35, distance: 4, color: p.glow });
    return finish(k);
  },
});

const officeUplight = L$({
  id: 'ltx-office-floor-uplight', ko: '사무실 스탠드 조명 (직·간접)', en: 'Office freestanding up/down light',
  params: [
    P.len('height', '높이', 'Height', 1.95, 1.75, 2.1),
    P.len('head', '헤드 폭', 'Head width', 0.65, 0.5, 0.8),
    P.mat('body', '본체', 'Body', 'metal-white', 'metal'),
  ],
  tags: ['freestanding luminaire', 'office floor lamp', 'uplight', 'task light', '사무실 스탠드', '플로어 조명', '간접 조명', '업라이트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, Wd = p.head, m = p.body;
    k.box('base', m, 0.42, 0.022, 0.42, 0, 0.011, 0, { r: 0.004, segs: 2 });
    k.box('base', 'plastic-grey', 0.28, 0.012, 0.28, 0, 0.028, 0, { r: 0.003 });
    k.box('column', m, 0.05, H - 0.07, 0.05, 0, 0.022 + (H - 0.07) / 2, 0, { r: 0.004 });
    k.box('controls', 'plastic-black', 0.02, 0.05, 0.004, 0, 1.0, 0.027, { r: 0.002 });
    k.rbox('head', m, Wd, 0.045, 0.32, 0.012, 0, H - 0.0225, 0, { segs: k.seg(3, 1) });
    k.box('diffuser', 'light-cool', Wd - 0.04, 0.003, 0.28, 0, H + 0.0005, 0, { r: 0.001 });
    k.box('diffuser', 'light-cool', Wd - 0.06, 0.003, 0.26, 0, H - 0.0455, 0, { r: 0.001 });
    k.cyl('controls', 'plastic-black', 0.012, 0.012, 0.006, Wd / 2 - 0.05, H - 0.052, 0.12, { segs: k.seg(12, 6) }); // presence sensor
    k.light(0, H + 0.08, 0, { intensity: 3.5, distance: 7, color: COOL }); // ≈ 2800 lm up
    k.light(0, H - 0.07, 0, { intensity: 1.5, distance: 5, type: 'spot', angle: 0.9, color: COOL }); // ≈ 1200 lm down
    return finish(k);
  },
});

const treeLamp = L$({
  id: 'ltx-tree-floor-lamp', ko: '3구 트리 플로어 스탠드', en: 'Three-head tree floor lamp',
  params: [
    P.len('height', '높이', 'Height', 1.75, 1.5, 1.95),
    P.mat('shade', '갓', 'Shades', 'metal-black', 'metal'),
    P.mat('metal', '기둥', 'Stand', 'metal-brass', 'metal'),
  ],
  tags: ['tree lamp', 'multi head floor lamp', '3 light floor lamp', 'floor lamp', '트리 스탠드', '3구 스탠드', '플로어 스탠드', '장스탠드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, m = p.metal, R = 0.075, shadeH = R + 0.035;
    k.lathe('stand', m, [[0, 0], [0.15, 0], [0.152, 0.008], [0.14, 0.02], [0.03, 0.03], [0, 0.03]], 0, 0, 0, { segs: k.seg(40, 12) });
    k.rod('stand', m, [0, 0.03, 0], [0, H - 0.02, 0], 0.009, { segs: k.seg(12, 6) });
    k.sphere('stand', m, 0.014, 0, H - 0.02, 0, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
    const heads = [[H - 0.06, 0.4], [H - 0.3, 0.4 + (2 * PI) / 3], [H - 0.54, 0.4 + (4 * PI) / 3]];
    for (const [y, a] of heads) {
      const c = Math.cos(a), s = Math.sin(a), L = 0.28;
      k.cyl('stand', m, 0.014, 0.014, 0.03, 0, y - 0.015, 0, { segs: k.seg(12, 6) });
      k.bentTube('stand', m, [[0, y, 0], [c * L * 0.5, y + 0.05, s * L * 0.5], [c * L, y + 0.02, s * L], [c * L, y - 0.02, s * L]], 0.006, 0.04, { radial: k.seg(8, 4) });
      transformAdded(k, () => {
        metalShade(k, 'cone', R, 0, p.shade);
        bulb(k, 0, 0.05, 0, 0.022);
        k.light(0, 0.035, 0, { intensity: 0.5, distance: 4, type: 'spot', angle: 0.7, color: WARM });
      }, c * L, y - 0.02 - shadeH, s * L);
    }
    return finish(k);
  },
});

const pharmacy = L$({
  id: 'ltx-pharmacy-floor-lamp', ko: '파마시 플로어 스탠드', en: 'Pharmacy floor lamp',
  params: [
    P.len('height', '높이', 'Height', 1.25, 1.0, 1.45),
    P.len('reach', '팔 길이', 'Arm reach', 0.38, 0.25, 0.5),
    P.mat('metal', '금속', 'Metal', 'metal-brass', 'metal'),
    P.mat('shade', '갓', 'Shade', 'metal-brass', 'metal'),
  ],
  tags: ['pharmacy lamp', 'reading floor lamp', 'swing arm floor lamp', 'brass', '파마시 램프', '독서 스탠드', '플로어 스탠드', '스윙암'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, m = p.metal, R = 0.07;
    k.lathe('stand', m, profileOf([[0, 0], [0.14, 0], [0.142, 0.01], [0.12, 0.03], [0.05, 0.045], [0.02, 0.06], [0, 0.062]], k.seg(14, 6)), 0, 0, 0, { segs: k.seg(40, 12) });
    k.rod('stand', m, [0, 0.06, 0], [0, H - 0.015, 0], 0.008, { segs: k.seg(12, 6) });
    k.sphere('stand', m, 0.015, 0, H - 0.015, 0, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
    const ya = H - 0.15;
    k.cyl('stand', m, 0.015, 0.015, 0.045, 0, ya - 0.025, 0, { segs: k.seg(14, 6) }); // sliding collar
    k.cyl('stand', m, 0.008, 0.008, 0.025, -0.015, ya, 0, { rz: PI / 2, segs: k.seg(10, 5) }); // thumb screw
    k.rod('stand', m, [0, ya, 0], [p.reach, ya, 0], 0.0055, { segs: k.seg(10, 5) });
    k.sphere('stand', m, 0.012, p.reach, ya, 0, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
    const shadeH = R * 1.05 + 0.035;
    transformAdded(k, () => {
      metalShade(k, 'bell', R, 0, p.shade);
      bulb(k, 0, 0.05, 0, 0.022);
      k.light(0, 0.035, 0, { intensity: 0.6, distance: 4, type: 'spot', angle: 0.7, color: WARM });
    }, p.reach, ya - 0.01 - shadeH, 0);
    return finish(k);
  },
});

/* ------------------------------------------------------------ table lamps */

const lantern = L$({
  id: 'ltx-portable-lantern', placement: 'surface', ko: '무선 랜턴 램프', en: 'Portable LED lantern lamp',
  params: [
    P.len('height', '높이', 'Height', 0.26, 0.18, 0.35),
    P.mat('metal', '금속', 'Metal', 'metal-brass', 'metal'),
    P.mat('strap', '손잡이', 'Strap', 'leather-cognac', 'leather'),
  ],
  tags: ['lantern', 'cordless lamp', 'rechargeable', 'portable lamp', '랜턴', '무선 조명', '충전식 램프', '캠핑 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, r = 0.055, m = p.metal;
    k.lathe('metal', m, [[0, 0], [r + 0.006, 0], [r + 0.008, 0.006], [r + 0.006, 0.025], [0, 0.025]], 0, 0, 0, { segs: k.seg(32, 10) });
    k.cyl('diffuser', 'light-warm', r, r, H - 0.06, 0, 0.025, 0, { open: true, segs: k.seg(32, 10), overrides: OPAL });
    k.lathe('metal', m, profileOf([[r + 0.007, 0], [r + 0.006, 0.012], [r * 0.7, 0.026], [0.012, 0.035], [0, 0.036]], k.seg(10, 5)), 0, H - 0.035, 0, { segs: k.seg(32, 10) });
    k.bentTube('strap', p.strap, [[-r * 0.55, H - 0.02, 0], [-r * 0.55, H + 0.05, 0], [r * 0.55, H + 0.05, 0], [r * 0.55, H - 0.02, 0]], 0.005, 0.025, { radial: k.seg(8, 4) });
    for (const s of [-1, 1]) k.sphere('metal', m, 0.006, s * r * 0.55, H - 0.018, 0, { segs: 8, rings: 5 });
    k.light(0, H * 0.45, 0, { intensity: 0.2, distance: 3, color: WARM });
    return finish(k);
  },
});

const candlestickLamp = L$({
  id: 'ltx-candlestick-lamp', placement: 'surface', ko: '캔들스틱 뷔페 램프', en: 'Candlestick buffet lamp',
  params: [
    P.len('height', '높이', 'Height', 0.78, 0.6, 0.95),
    P.mat('base', '받침', 'Base', 'metal-brass', 'metal'),
    P.mat('shade', '갓', 'Shade', 'lampshade', 'other'),
  ],
  tags: ['buffet lamp', 'candlestick lamp', 'console lamp', 'table lamp', '뷔페 램프', '캔들스틱', '콘솔 램프', '테이블 램프'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, s = H / 0.78, m = p.base;
    const prof = [[0, 0], [0.075, 0], [0.078, 0.01], [0.06, 0.025], [0.03, 0.04], [0.022, 0.07], [0.035, 0.1], [0.018, 0.13], [0.014, 0.3], [0.022, 0.34], [0.012, 0.36], [0.012, 0.44]];
    k.lathe('base', m, profileOf(prof.map(([r, y]) => [r, y * s]), k.seg(30, 10)), 0, 0, 0, { segs: k.seg(32, 10) });
    k.cyl('sleeve', 'paint-white-gloss', 0.014, 0.014, 0.06 * s, 0, 0.44 * s, 0, { segs: k.seg(14, 6) });
    const shadeH = 0.2 * s, sb = H - shadeH;
    k.cyl('fittings', m, 0.009, 0.009, sb + 0.06 - 0.5 * s, 0, 0.5 * s, 0, { segs: k.seg(10, 5) });
    for (const a of [0, PI]) k.tube('fittings', m, [[Math.cos(a) * 0.02, sb + 0.04, Math.sin(a) * 0.02], [Math.cos(a) * 0.032, sb + 0.12 * s, Math.sin(a) * 0.032], [Math.cos(a) * 0.006, H - 0.006, Math.sin(a) * 0.006]], 0.002, { segs: k.seg(12, 6), radial: 5 });
    k.sphere('fittings', m, 0.008, 0, H + 0.002, 0, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
    const rb = 0.13 * s, rt = 0.075 * s;
    k.cyl('shade', p.shade, rt, rb, shadeH, 0, sb, 0, { open: true, segs: k.seg(40, 12) });
    k.add('fittings', m, new THREE.TorusGeometry(rb, 0.002, 4, k.seg(40, 12)).rotateX(PI / 2).translate(0, sb + 0.002, 0));
    k.add('fittings', m, new THREE.TorusGeometry(rt, 0.002, 4, k.seg(40, 12)).rotateX(PI / 2).translate(0, H - 0.002, 0));
    bulb(k, 0, sb + 0.09, 0, 0.025, { socket: m, up: true });
    k.light(0, sb + 0.1, 0, { intensity: 0.45, distance: 4, color: WARM });
    return finish(k);
  },
});

/* ------------------------------------------------------- surface downlight */

const cylinderDown = ceil$({
  id: 'ltx-surface-cylinder', ko: '노출형 원통 다운라이트', en: 'Surface-mounted cylinder downlight',
  params: [
    P.len('diameter', '지름', 'Diameter', 0.09, 0.06, 0.15),
    P.len('length', '길이', 'Length', 0.18, 0.08, 0.4),
    P.mat('finish', '마감', 'Finish', 'metal-white', 'metal'),
  ],
  tags: ['cylinder downlight', 'surface downlight', 'can light', 'spot', '원통 다운라이트', '노출 다운라이트', '직부 스폿', '원통 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, L = p.length, m = p.finish, segs = k.seg(32, 10);
    const lip = Math.min(0.045, L * 0.4);
    k.cyl('body', m, R, R, L - lip, 0, lip, 0, { segs });
    // open bottom: outer and inner skins of the deep anti-glare baffle + a rolled edge
    k.lathe('body', m, [[R, 0], [R, lip]], 0, 0, 0, { segs });
    k.lathe('baffle', 'paint-black-matte', [[R - 0.003, lip], [R - 0.003, 0]], 0, 0, 0, { segs });
    k.add('body', m, new THREE.TorusGeometry(R - 0.0015, 0.0015, 4, segs).rotateX(PI / 2));
    k.cyl('bulb', 'light-warm', R * 0.55, R * 0.55, 0.003, 0, lip - 0.004, 0, { segs: k.seg(24, 8) });
    k.cyl('body', m, R + 0.008, R + 0.008, 0.008, 0, L, 0, { segs }); // mounting plate
    k.light(0, lip * 0.4, 0, { intensity: 0.8, distance: 5, type: 'spot', angle: 0.4, color: WARM });
    return finish(k);
  },
});

export const ITEMS = [
  magneticTrack, wallWasher, linearOffice, troffer, highBay, exitSign, twinSpot, batten,
  linearCandle, orbChandelier, balancedPendant, schoolhouse, alabaster, stepLight,
  ledPole, officeUplight, treeLamp, pharmacy, lantern, candlestickLamp, cylinderDown,
];
