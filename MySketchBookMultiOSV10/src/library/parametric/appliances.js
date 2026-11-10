// Appliances: refrigerators (incl. Korean 4-door and kimchi fridge), laundry, TV, microwave,
// oven, air conditioners (Korean wall & stand types), dishwasher.
import { THREE, Kit, item, P } from './helpers.js';
import { finish, ovenFront } from './kitchen.js';

/** Long vertical bar handle on posts, front plane at zf. */
export function vBar(k, mat, x, y0, y1, zf, off = 0.04, r = 0.009) {
  k.rod('handles', mat, [x, y0, zf + off], [x, y1, zf + off], r, { segs: k.seg(14, 6) });
  for (const y of [y0 + 0.03, y1 - 0.03]) k.rod('handles', mat, [x, y, zf], [x, y, zf + off], r * 0.8, { segs: k.seg(10, 5) });
}
export function hBar(k, mat, x0, x1, y, zf, off = 0.035, r = 0.008) {
  k.rod('handles', mat, [x0, y, zf + off], [x1, y, zf + off], r, { segs: k.seg(14, 6) });
  for (const x of [x0 + 0.03, x1 - 0.03]) k.rod('handles', mat, [x, y, zf], [x, y, zf + off], r * 0.8, { segs: k.seg(10, 5) });
}

/* ------------------------------------------------------------ refrigerators */

const FINISH = [['metal-steel', '스테인리스', 'Stainless'], ['paint-white-gloss', '화이트 글라스', 'White glass'], ['paint-black-matte', '블랙', 'Black'], ['metal-aluminium', '메탈 실버', 'Silver metal']];

/** Fridge carcass + door grid. doors: [{ x0, x1, y0, y1, handle: 'v-left'|'v-right'|'h-top' }] in metres (x from −w/2). */
export function fridgeBody(k, { w, h, d, finish: fin, doors, doorT = 0.055, handleMat = 'metal-chrome', display = true }) {
  const plinth = 0.035, bodyD = d - doorT;
  k.soft('body', fin, w, h - plinth, bodyD, 0.012, 0, plinth + (h - plinth) / 2, -doorT / 2, { flat: 2 });
  k.box('plinth', 'plastic-black', w - 0.04, plinth, bodyD - 0.02, 0, plinth / 2, -doorT / 2 - 0.015, { r: 0.002 });
  // ventilation grille strip at the toe kick
  k.box('plinth', 'plastic-black', w - 0.06, plinth - 0.006, 0.01, 0, plinth / 2, d / 2 - doorT - 0.005, { r: 0.002 });
  const gap = 0.003, zc = d / 2 - doorT / 2;
  for (const dr of doors) {
    const dw = dr.x1 - dr.x0 - gap, dh = dr.y1 - dr.y0 - gap;
    const cx = (dr.x0 + dr.x1) / 2, cy = (dr.y0 + dr.y1) / 2;
    k.soft('doors', fin, dw, dh, doorT, 0.012, cx, cy, zc, { flat: 2 });
    const zf = d / 2;
    if (dr.handle === 'v-left' || dr.handle === 'v-right') {
      const hx = dr.handle === 'v-left' ? dr.x0 + 0.04 : dr.x1 - 0.04;
      const len = Math.min(0.9, dh * 0.6);
      const y0 = dr.handleLow ? dr.y0 + 0.08 : dr.y1 - 0.08 - len;
      vBar(k, handleMat, hx, y0, y0 + len, zf);
    } else if (dr.handle === 'h-top') {
      hBar(k, handleMat, cx - Math.min(0.25, dw * 0.35), cx + Math.min(0.25, dw * 0.35), dr.y1 - 0.05, zf);
    }
  }
  if (display && doors[0]) {
    const dr = doors[0];
    k.box('display', 'screen-black', 0.09, 0.12, 0.003, dr.x0 + (dr.x1 - dr.x0) * 0.5, dr.y1 - 0.42, d / 2 + 0.0015, { r: 0.002 });
  }
}

const fridge = item({
  id: 'refrigerator', category: 'appliances', ko: '냉장고', en: 'Refrigerator', size: [0.91, 1.85, 0.92],
  params: [
    P.pick('type', '종류', 'Type', 'quad', [['single', '1도어', 'Single door'], ['topFreezer', '2도어(상냉동)', 'Top freezer'], ['sideBySide', '양문형', 'Side-by-side'], ['quad', '4도어', '4-door (French)']]),
    P.len('width', '폭', 'Width', 0.91, 0.55, 1.0),
    P.len('height', '높이', 'Height', 1.85, 1.2, 1.95),
    P.len('depth', '깊이', 'Depth', 0.92, 0.6, 0.95),
    P.mat('finish', '마감', 'Finish', 'metal-steel', 'metal'),
  ],
  tags: ['refrigerator', 'fridge', '냉장고', '양문형 냉장고', '4도어 냉장고', 'appliance'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, height: h, depth: d } = p;
    const x0 = -w / 2, x1 = w / 2, y0 = 0.035, y1 = h;
    let doors;
    if (p.type === 'single') doors = [{ x0, x1, y0, y1, handle: 'v-left' }];
    else if (p.type === 'topFreezer') { const ys = y0 + (y1 - y0) * 0.68; doors = [{ x0, x1, y0, y1: ys, handle: 'v-left' }, { x0, x1, y0: ys, y1, handle: 'v-left', handleLow: true }]; }
    else if (p.type === 'sideBySide') doors = [{ x0, x1: x0 + w * 0.42, y0, y1, handle: 'v-right' }, { x0: x0 + w * 0.42, x1, y0, y1, handle: 'v-left' }];
    else {
      const ys = y0 + (y1 - y0) * 0.42;
      doors = [{ x0, x1: 0, y0: ys, y1, handle: 'v-right' }, { x0: 0, x1, y0: ys, y1, handle: 'v-left' }, { x0, x1: 0, y0, y1: ys, handle: 'h-top' }, { x0: 0, x1, y0, y1: ys, handle: 'h-top' }];
    }
    fridgeBody(k, { w, h, d, finish: p.finish, doors });
    return finish(k);
  },
});

const kimchi = item({
  id: 'kimchi-refrigerator', category: 'appliances', ko: '김치냉장고(스탠드형)', en: 'Kimchi refrigerator', size: [0.7, 1.85, 0.8],
  params: [
    P.len('width', '폭', 'Width', 0.7, 0.6, 0.95),
    P.len('height', '높이', 'Height', 1.85, 1.2, 1.95),
    P.mat('finish', '마감', 'Finish', 'paint-white-gloss', 'paint'),
  ],
  tags: ['kimchi refrigerator', 'kimchi fridge', '김치냉장고', '스탠드형 김치냉장고', '김치통'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, d = 0.8, y0 = 0.035;
    const span = h - y0;
    // top: two doors (40 %), then two full-width drawers
    const yA = y0 + span * 0.3, yB = y0 + span * 0.6;
    fridgeBody(k, {
      w, h, d, finish: p.finish, handleMat: 'metal-aluminium', display: false,
      doors: [{ x0: -w / 2, x1: 0, y0: yB, y1: h, handle: 'v-right', handleLow: true }, { x0: 0, x1: w / 2, y0: yB, y1: h, handle: 'v-left', handleLow: true }, { x0: -w / 2, x1: w / 2, y0: yA, y1: yB, handle: 'h-top' }, { x0: -w / 2, x1: w / 2, y0, y1: yA, handle: 'h-top' }],
    });
    k.box('display', 'screen-black', 0.16, 0.035, 0.003, 0, yB - 0.035, d / 2 + 0.0015, { r: 0.002 });
    return finish(k);
  },
});

/* --------------------------------------------------------------- laundry */

/** Front-loading drum machine (washer or dryer). */
export function drumMachine(k, { w, h, d, finish: fin, dryer }) {
  const panelH = 0.13;
  k.soft('body', fin, w, h - 0.015, d, 0.02, 0, 0.015 + (h - 0.015) / 2, 0, { flat: 3 });
  k.box('feet', 'plastic-black', w - 0.06, 0.016, d - 0.06, 0, 0.008, 0, { r: 0.003 });
  const zf = d / 2;
  // control strip: detergent drawer (washer) / water tank (dryer), dial and display
  k.box('panel', 'plastic-grey', w - 0.02, panelH - 0.01, 0.004, 0, h - panelH / 2 - 0.005, zf, { r: 0.002, overrides: { color: '#d8d9db' } });
  k.box('panel', 'plastic-white', w * 0.32, panelH - 0.04, 0.012, -w * 0.3, h - panelH / 2 - 0.005, zf + 0.004, { r: 0.004 });
  k.lathe('dial', 'metal-chrome', [[0, 0], [0.032, 0], [0.032, 0.006], [0.028, 0.022], [0, 0.024]], w * 0.05, h - panelH / 2 - 0.005, zf, { rx: Math.PI / 2, segs: k.seg(28, 10) });
  k.box('display', 'screen-black', w * 0.22, 0.04, 0.004, w * 0.3, h - panelH / 2 - 0.005, zf + 0.002, { r: 0.003 });
  // round door: chrome ring + smoked glass bowl over a steel drum
  const cy = (h - panelH) * 0.52, R = Math.min(w, h - panelH) * 0.34;
  k.cyl('drum', 'plastic-black', R * 0.98, R * 0.98, 0.006, 0, cy, zf - 0.004, { rx: Math.PI / 2, segs: k.seg(40, 12) });
  k.add('door', 'metal-chrome', new THREE.TorusGeometry(R, 0.022, k.seg(12, 5), k.seg(48, 14)).scale(1, 1, 0.8).translate(0, cy, zf + 0.012));
  k.add('door', 'plastic-white', new THREE.TorusGeometry(R * 0.86, 0.025, k.seg(10, 4), k.seg(48, 14)).scale(1, 1, 0.9).translate(0, cy, zf + 0.018));
  k.sphere('glass', dryer ? 'glass-tinted' : 'glass-tinted', R * 0.82, 0, cy, zf - R * 0.62, { thetaLength: 0.65, segs: k.seg(36, 10), rings: k.seg(8, 3), rx: Math.PI / 2 });
  k.cyl('drum', 'metal-steel', R * 0.78, R * 0.78, 0.004, 0, cy, zf - 0.02, { rx: Math.PI / 2, segs: k.seg(32, 10) });
  k.box('handles', 'plastic-grey', 0.03, 0.12, 0.03, R * 1.02, cy, zf + 0.02, { r: 0.008, segs: 2 });
  // filter cover at the bottom right
  k.box('panel', 'plastic-white', 0.12, 0.07, 0.004, w * 0.3, 0.07, zf, { r: 0.004 });
}

const laundryParams = (h) => [
  P.len('width', '폭', 'Width', 0.6, 0.55, 0.75),
  P.len('height', '높이', 'Height', h, 0.8, 1.05),
  P.len('depth', '깊이', 'Depth', 0.62, 0.5, 0.85),
  P.mat('finish', '색상', 'Finish', 'plastic-white', 'plastic'),
];

const washer = item({
  id: 'washing-machine', category: 'appliances', ko: '드럼 세탁기', en: 'Front-load washer', size: [0.6, 0.85, 0.66],
  params: laundryParams(0.85),
  tags: ['washing machine', 'washer', 'laundry', '세탁기', '드럼세탁기', '빨래'],
  build: (p, ctx) => { const k = new Kit(ctx); drumMachine(k, { w: p.width, h: p.height, d: p.depth, finish: p.finish, dryer: false }); return finish(k); },
});

const dryer = item({
  id: 'dryer', category: 'appliances', ko: '건조기', en: 'Tumble dryer', size: [0.6, 0.85, 0.66],
  params: laundryParams(0.85).map((q) => (q.key === 'finish' ? { ...q, default: 'plastic-grey' } : q)),
  tags: ['dryer', 'tumble dryer', 'laundry', '건조기', '의류건조기'],
  build: (p, ctx) => { const k = new Kit(ctx); drumMachine(k, { w: p.width, h: p.height, d: p.depth, finish: p.finish, dryer: true }); return finish(k); },
});

/* -------------------------------------------------------------------- TV */

export function tvPanel(k, inches, { stand }) {
  const diag = inches * 0.0254;
  const w = diag * 0.8716, h = diag * 0.4903, t = 0.026;
  const y0 = stand ? 0.075 : 0;
  k.box('frame', 'metal-black', w + 0.01, h + 0.01, t, 0, y0 + h / 2 + 0.005, 0, { r: 0.003 });
  k.box('screen', 'screen-black', w, h, 0.002, 0, y0 + h / 2 + 0.005, t / 2, { r: 0 });
  // electronics hump on the back
  k.soft('frame', 'plastic-black', w * 0.6, h * 0.55, 0.035, 0.012, 0, y0 + h * 0.45, -t / 2 - 0.016, { flat: 2 });
  if (stand) {
    // slim pedestal: a plate on a short neck
    k.slab('stand', 'metal-black', roundedPlate(Math.min(0.45, w * 0.35), 0.24), 0.012, 0, { bevel: 0.003, curveSegs: 8 });
    k.box('stand', 'metal-black', 0.08, y0 + h * 0.2, 0.03, 0, (y0 + h * 0.2) / 2, -0.035, { r: 0.006, segs: 2 });
  }
}
const roundedPlate = (w, d) => {
  const s = new THREE.Shape();
  const r = 0.03;
  s.moveTo(-w / 2 + r, -d / 2); s.lineTo(w / 2 - r, -d / 2); s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
  s.lineTo(w / 2, d / 2 - r); s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2); s.lineTo(-w / 2 + r, d / 2);
  s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r); s.lineTo(-w / 2, -d / 2 + r); s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
  return s;
};

const tvSize = (inches, stand) => { const dg = inches * 0.0254; return [dg * 0.8716 + 0.01, dg * 0.4903 + 0.01 + (stand ? 0.075 : 0), stand ? 0.24 : 0.062]; };

const tv = item({
  id: 'tv', category: 'appliances', ko: 'TV(스탠드)', en: 'TV on stand', placement: 'surface', size: tvSize(65, true),
  params: [P.int('inches', '크기(인치)', 'Size (inches)', 65, 32, 98)],
  tags: ['tv', 'television', 'oled', '티비', '텔레비전', '스탠드 TV'],
  build: (p, ctx) => { const k = new Kit(ctx); tvPanel(k, p.inches, { stand: true }); return finish(k); },
});

const tvWall = item({
  id: 'tv-wall', category: 'appliances', ko: 'TV(벽걸이)', en: 'Wall-mounted TV', placement: 'wall', elevation: 1.0, size: tvSize(65, false),
  params: [P.int('inches', '크기(인치)', 'Size (inches)', 65, 32, 98)],
  tags: ['tv', 'wall tv', 'television', '벽걸이 TV', '티비', '텔레비전'],
  build: (p, ctx) => { const k = new Kit(ctx); tvPanel(k, p.inches, { stand: false }); return finish(k); },
});

/* ------------------------------------------------------------- microwave */

const microwave = item({
  id: 'microwave', category: 'appliances', ko: '전자레인지', en: 'Microwave', placement: 'surface', size: [0.49, 0.29, 0.4],
  params: [P.mat('finish', '색상', 'Finish', 'paint-white-gloss', 'paint')],
  tags: ['microwave', 'microwave oven', '전자레인지', '광파오븐', 'kitchen appliance'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.49, h = 0.29, d = 0.38;
    k.soft('body', p.finish, w, h - 0.01, d, 0.015, 0, 0.01 + (h - 0.01) / 2, 0, { flat: 2 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('feet', 'rubber-black', 0.012, 0.012, 0.01, sx * (w / 2 - 0.04), 0, sz * (d / 2 - 0.04), { segs: 8 });
    const zf = d / 2;
    const dw = w * 0.72;
    // door: black glass with a lighter window, recessed grip at its right edge
    k.box('door', 'screen-black', dw, h - 0.03, 0.012, -w / 2 + 0.008 + dw / 2, 0.01 + (h - 0.01) / 2, zf + 0.004, { r: 0.004 });
    k.box('glass', 'glass-tinted', dw - 0.08, h - 0.1, 0.002, -w / 2 + 0.008 + dw / 2 - 0.01, 0.01 + (h - 0.01) / 2, zf + 0.011, { r: 0 });
    k.box('panel', 'screen-black', w - dw - 0.03, h - 0.03, 0.006, w / 2 - 0.008 - (w - dw - 0.03) / 2, 0.01 + (h - 0.01) / 2, zf + 0.001, { r: 0.003 });
    k.box('display', 'light-warm', 0.06, 0.018, 0.002, w / 2 - 0.008 - (w - dw - 0.03) / 2, h - 0.06, zf + 0.0045, { r: 0, overrides: { color: '#9fd0ff' } });
    k.cyl('knobs', 'metal-chrome', 0.022, 0.024, 0.018, w / 2 - 0.008 - (w - dw - 0.03) / 2, 0.11, zf + 0.004, { rx: Math.PI / 2, segs: k.seg(20, 8) });
    return finish(k);
  },
});

const oven = item({
  id: 'oven-builtin', category: 'appliances', ko: '빌트인 오븐', en: 'Built-in oven', size: [0.595, 0.595, 0.56],
  params: [],
  tags: ['oven', 'built-in oven', 'wall oven', '오븐', '빌트인 오븐', '광파오븐'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.595, h = 0.595, d = 0.56;
    k.box('appliance', 'metal-black', w - 0.02, h - 0.02, d - 0.03, 0, h / 2, -0.015, { r: 0.004 });
    ovenFront(k, w, h, 0, d / 2 - 0.01);
    return finish(k);
  },
});

/* ------------------------------------------------------- air conditioners */

const acWall = item({
  id: 'air-conditioner-wall', category: 'appliances', ko: '벽걸이 에어컨', en: 'Wall air conditioner', placement: 'wall', elevation: 2.0, size: [0.89, 0.29, 0.23],
  params: [P.len('width', '폭', 'Width', 0.89, 0.7, 1.1)],
  tags: ['air conditioner', 'aircon', 'split ac', '에어컨', '벽걸이 에어컨', '냉방기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = 0.29, d = 0.21;
    // body rounds off towards the bottom front where the air leaves
    const prof = [[-d / 2, 0.02], [-d / 2, h], [d / 2 - 0.03, h], [d / 2, h - 0.04], [d / 2 + 0.01, h * 0.45], [d / 2 - 0.02, 0.05], [d / 2 - 0.07, 0.0], [-d / 2 + 0.02, 0.0]];
    const shape = new THREE.Shape(prof.map(([z, y]) => new THREE.Vector2(-z, y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: w - 0.016, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelOffset: -0.006, bevelSegments: k.hi ? 3 : 1, curveSegments: 4 });
    geo.translate(0, 0, -(w - 0.016) / 2);
    geo.rotateY(Math.PI / 2);
    k.add('body', 'plastic-white', geo);
    // louver vane across the outlet and the status light
    k.box('vane', 'plastic-grey', w - 0.08, 0.004, 0.06, 0, 0.018, d / 2 - 0.045, { r: 0.0015, rx: 0.5, overrides: { color: '#cfd1d4' } });
    k.box('vane', 'plastic-black', w - 0.1, 0.002, 0.05, 0, 0.012, d / 2 - 0.08, { r: 0 });
    k.box('display', 'light-cool', 0.03, 0.006, 0.002, w * 0.32, h * 0.35, d / 2 + 0.0095, { r: 0 });
    return finish(k);
  },
});

const acStand = item({
  id: 'air-conditioner-stand', category: 'appliances', ko: '스탠드 에어컨', en: 'Floor-standing air conditioner', size: [0.38, 1.8, 0.37],
  params: [
    P.len('height', '높이', 'Height', 1.8, 1.5, 1.95),
    P.mat('finish', '색상', 'Finish', 'plastic-white', 'plastic'),
  ],
  tags: ['air conditioner', 'stand aircon', '스탠드 에어컨', '에어컨', '무풍', 'floor ac'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.38, h = p.height, d = 0.36;
    k.soft('body', p.finish, w, h - 0.05, d, 0.07, 0, 0.05 + (h - 0.05) / 2, 0, { flat: 3 });
    k.soft('base', 'plastic-grey', w - 0.03, 0.05, d - 0.03, 0.02, 0, 0.025, -0.005, { flat: 2, overrides: { color: '#c9cacc' } });
    const zf = d / 2;
    // front: micro-perforated panel band with two round fans, display strip
    k.box('front', 'metal-aluminium', w - 0.06, h * 0.62, 0.006, 0, 0.05 + h * 0.36, zf + 0.001, { r: 0.004 });
    for (const [fy, fr] of [[h * 0.82, 0.12], [h * 0.58, 0.12]]) {
      k.cyl('fans', 'plastic-black', fr, fr, 0.006, 0, fy, zf + 0.003, { rx: Math.PI / 2, segs: k.seg(40, 12) });
      k.add('fans', 'metal-chrome', new THREE.TorusGeometry(fr, 0.006, k.seg(8, 4), k.seg(48, 14)).translate(0, fy, zf + 0.008));
      k.cyl('fans', 'plastic-grey', fr * 0.25, fr * 0.25, 0.008, 0, fy, zf + 0.004, { rx: Math.PI / 2, segs: k.seg(24, 8) });
    }
    k.box('display', 'screen-black', 0.12, 0.05, 0.004, 0, h * 0.38, zf + 0.004, { r: 0.004 });
    k.box('display', 'light-cool', 0.04, 0.012, 0.001, 0, h * 0.38, zf + 0.0065, { r: 0 });
    return finish(k);
  },
});

/* ------------------------------------------------------------ dishwasher */

const dishwasher = item({
  id: 'dishwasher', category: 'appliances', ko: '식기세척기', en: 'Dishwasher', size: [0.6, 0.85, 0.6],
  params: [
    P.len('width', '폭', 'Width', 0.6, 0.45, 0.6),
    P.mat('finish', '마감', 'Finish', 'metal-steel', 'metal'),
  ],
  tags: ['dishwasher', '식기세척기', '식세기', 'kitchen appliance'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = 0.85, d = 0.6;
    k.box('body', 'paint-grey-matte', w - 0.01, h - 0.08, d - 0.03, 0, 0.08 + (h - 0.08) / 2, -0.015, { r: 0.003 });
    k.box('body', 'plastic-black', w - 0.04, 0.08, d - 0.08, 0, 0.04, -0.04, { r: 0.002 });
    k.box('door', p.finish, w - 0.006, h - 0.085, 0.03, 0, 0.083 + (h - 0.085) / 2, d / 2 - 0.015, { r: 0.004, segs: 2 });
    k.box('panel', 'screen-black', w - 0.03, 0.06, 0.003, 0, h - 0.04, d / 2 + 0.0015, { r: 0.002 });
    hBar(k, 'metal-chrome', -w * 0.3, w * 0.3, h - 0.11, d / 2, 0.03, 0.007);
    return finish(k);
  },
});

export const ITEMS = [fridge, kimchi, washer, dryer, tv, tvWall, microwave, oven, acWall, acStand, dishwasher];
