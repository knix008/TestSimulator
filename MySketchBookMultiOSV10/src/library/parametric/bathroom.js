// Bathroom: toilets, washbasin vanity, bathtubs, shower booth, towel rail, mirror cabinet, shower set.
// Sanitary ware is lathed (scaled into ovals) so it reads as glazed ceramic, not boxes.
import { THREE, Kit, item, P, OPT, addCabinet, roundRect, ellipse, shellGeo } from './helpers.js';
import { finish, addFaucet } from './kitchen.js';

const SAN = 'ceramic-white';
const FIN = [['metal-chrome', '크롬', 'Chrome'], ['metal-black', '블랙', 'Matte black'], ['metal-brass', '브라스', 'Brass'], ['metal-steel', '스테인리스', 'Brushed steel']];

/** Elliptical ring (seat) as a plan shape. */
function ringShape(w, d, b) {
  const s = ellipse(w, d);
  s.holes.push(new THREE.Path(ellipse(w - 2 * b * 1.25, d - 2 * b * 1.6).getPoints(48).reverse()));
  return s;
}

/* ----------------------------------------------------------------- toilets */

const toilet = item({
  id: 'toilet', category: 'bathroom', ko: '양변기', en: 'Toilet', size: [0.4, 0.74, 0.64],
  params: [
    P.pick('type', '형태', 'Type', 'onePiece', [['onePiece', '원피스', 'One-piece'], ['wallHung', '벽걸이(매립 수조)', 'Wall-hung']]),
    P.bool('lidOpen', '뚜껑 열림', 'Lid open', false),
  ],
  tags: ['toilet', 'wc', 'water closet', '변기', '양변기', '비데'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const seatY = p.type === 'wallHung' ? 0.4 : 0.39;
    const sz = 1.45; // bowl elongation (z / x)
    const backZ = -0.35;
    const R = 0.18;
    const bowlZ = p.type === 'wallHung' ? -0.35 + 0.2 + R * sz : backZ + 0.12 + R * sz - 0.02;
    if (p.type === 'onePiece') {
      // pedestal flares into the bowl; the cavity is the inner run of the same profile
      k.lathe('ceramic', SAN, [[0, 0], [0.115, 0], [0.12, 0.012], [0.118, 0.06], [0.122, 0.16], [0.145, 0.27], [0.168, 0.34], [0.178, seatY - 0.02], [0.175, seatY - 0.005], [0.158, seatY - 0.004], [0.14, seatY - 0.03], [0.09, seatY - 0.15], [0.05, seatY - 0.2], [0, seatY - 0.2]], 0, 0, bowlZ, { smooth: 30, segs: k.seg(40, 12), scale: [1, 1, sz] });
      // low integrated tank behind the seat, merged visually with the bowl
      // skirted back: one smooth body from the floor up to the low tank (no visible joint)
      k.soft('ceramic', SAN, 0.36, 0.68, 0.22, 0.07, 0, 0.34, backZ + 0.11, { puff: 0.004, flat: 4 });
      k.cyl('flush', 'metal-chrome', 0.022, 0.022, 0.006, 0, 0.678, backZ + 0.11, { segs: k.seg(20, 8) });
    } else {
      // concealed cistern behind a boxed-in ledge, flush plate on its face
      k.soft('wall', 'paint-white-matte', 0.6, 1.1, 0.2, 0.01, 0, 0.55, backZ + 0.1, { flat: 2 });
      k.box('flush', 'metal-chrome', 0.24, 0.16, 0.008, 0, 0.98, backZ + 0.2 + 0.004, { r: 0.003 });
      for (const s of [-1, 1]) k.box('flush', 'metal-steel', 0.105, 0.14, 0.004, s * 0.055, 0.98, backZ + 0.2 + 0.009, { r: 0.002 });
      k.lathe('ceramic', SAN, [[0, seatY - 0.22], [0.09, seatY - 0.22], [0.13, seatY - 0.18], [0.16, seatY - 0.1], [0.178, seatY - 0.02], [0.175, seatY - 0.005], [0.158, seatY - 0.004], [0.14, seatY - 0.03], [0.09, seatY - 0.15], [0, seatY - 0.18]], 0, 0, bowlZ, { smooth: 26, segs: k.seg(40, 12), scale: [1, 1, sz] });
      // back of the bowl meets the wall ledge
      k.soft('ceramic', SAN, 0.3, 0.2, 0.2, 0.06, 0, seatY - 0.11, backZ + 0.28, { flat: 3 });
    }
    // seat and lid (soft-close white plastic), hinges
    const sw = 0.36, sd = 0.36 * sz + 0.02;
    k.slab('seat', 'plastic-white', ringShape(sw, sd, 0.05), 0.022, seatY, { bevel: 0.008, curveSegs: 40, z: bowlZ + 0.01 });
    if (p.lidOpen) {
      const lid = ellipse(sw - 0.01, sd - 0.01);
      const geo = new THREE.ExtrudeGeometry(lid, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelOffset: -0.006, bevelSegments: k.hi ? 3 : 1, curveSegments: k.seg(40, 10) });
      // standing upright against the tank / wall
      geo.translate(0, sd / 2, 0);
      geo.rotateX(-0.12);
      geo.translate(0, seatY + 0.03, bowlZ - sd / 2 + 0.01 - 0.02);
      k.add('seat', 'plastic-white', geo);
    } else {
      k.slab('seat', 'plastic-white', ellipse(sw - 0.01, sd - 0.01), 0.022, seatY + 0.022, { bevel: 0.01, curveSegs: 40, z: bowlZ + 0.015 });
    }
    for (const s of [-1, 1]) k.cyl('flush', 'metal-chrome', 0.012, 0.012, 0.03, s * 0.09, seatY + 0.022, bowlZ - sd / 2 + 0.02, { rz: Math.PI / 2, segs: k.seg(12, 6) });
    return finish(k);
  },
});

/* ---------------------------------------------------------------- vanity */

const vanity = item({
  id: 'washbasin-vanity', category: 'bathroom', ko: '세면대 + 하부장', en: 'Washbasin vanity', size: [0.8, 1.19, 0.5],
  params: [
    P.len('width', '폭', 'Width', 0.8, 0.5, 1.6),
    P.pick('basin', '세면기', 'Basin', 'vessel', [['vessel', '탑볼(올림형)', 'Vessel'], ['integrated', '일체형', 'Integrated']]),
    P.int('basins', '세면기 수', 'Basins', 1, 1, 2),
    P.mat('front', '도어', 'Fronts', 'wood-oak', 'wood'),
    P.mat('top', '상판', 'Top', 'quartz-white', 'stone'),
    P.pick('base', '받침', 'Base', 'legs', [['legs', '다리', 'Legs'], ['plinth', '걸레받이', 'Plinth']]),
    P.pick('handle', '손잡이', 'Handles', 'edge', OPT.handle),
    P.pick('finish', '수전 마감', 'Tap finish', 'metal-chrome', FIN),
  ],
  tags: ['washbasin', 'vanity', 'sink', 'basin', '세면대', '욕실장', '세면기', '탑볼'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.5, topY = 0.85, t = 0.02;
    const nb = w < 1.1 ? 1 : p.basins;
    addCabinet(k, { w, h: topY - t, d: d - 0.02, z: -0.01, rows: [{ h: 0.5, n: 1, type: 'drawer' }, { h: 0.5, n: 1, type: 'drawer' }], body: p.front, front: p.front, handle: p.handle, handleMat: p.finish === 'metal-chrome' ? 'metal-steel' : p.finish, base: p.base, legH: 0.18, legStyle: 'metal', legMat: 'metal-black', plinth: 0.08 });
    const xs = nb === 1 ? [0] : [-w / 4, w / 4];
    if (p.basin === 'vessel') {
      k.box('top', p.top, w, t, d, 0, topY - t / 2, 0, { r: 0.003 });
      for (const x of xs) {
        // thin-walled oval bowl on the counter
        k.lathe('basin', SAN, [[0, 0], [0.07, 0], [0.075, 0.004], [0.15, 0.045], [0.19, 0.11], [0.2, 0.135], [0.193, 0.14], [0.183, 0.13], [0.175, 0.105], [0.14, 0.05], [0.07, 0.022], [0, 0.02]], x, topY, 0.03, { smooth: 26, segs: k.seg(40, 12), scale: [1, 1, 0.78] });
        k.cyl('basin', 'metal-chrome', 0.02, 0.02, 0.004, x, topY + 0.021, 0.03, { segs: k.seg(16, 6) });
        addFaucet(k, x, topY, -d / 2 + 0.06, { reach: 0.16, height: 0.33, mat: p.finish });
      }
    } else {
      // ceramic top with soft basins sunk into it
      const shape = roundRect(w, d, 0.01);
      for (const x of xs) shape.holes.push(new THREE.Path(ellipse(Math.min(0.42, w * 0.6 / nb), 0.3).getPoints(40).reverse().map((v) => new THREE.Vector2(v.x + x, v.y + 0.03))));
      k.slab('top', SAN, shape, 0.035, topY - 0.035, { bevel: 0.006, curveSegs: 40 });
      for (const x of xs) {
        const rx = Math.min(0.42, w * 0.6 / nb) / 2;
        k.lathe('basin', SAN, [[rx, topY - 0.002], [rx * 0.97, topY - 0.05], [rx * 0.82, topY - 0.11], [rx * 0.4, topY - 0.14], [0, topY - 0.145]], x, 0, 0.03, { smooth: 16, segs: k.seg(40, 12), scale: [1, 1, 0.15 / rx] });
        k.cyl('basin', 'metal-chrome', 0.02, 0.02, 0.003, x, topY - 0.146, 0.03, { segs: k.seg(16, 6) });
        addFaucet(k, x, topY, -d / 2 + 0.06, { reach: 0.13, height: 0.2, mat: p.finish });
      }
    }
    return finish(k);
  },
});

/* ---------------------------------------------------------------- bathtubs */

const bathtub = item({
  id: 'bathtub', category: 'bathroom', ko: '욕조', en: 'Bathtub', size: [1.87, 0.97, 0.8],
  params: [
    P.pick('type', '형태', 'Type', 'freestanding', [['freestanding', '독립형(타원)', 'Freestanding oval'], ['builtin', '매립형', 'Built-in']]),
    P.len('length', '길이', 'Length', 1.7, 1.2, 2.0),
    P.len('width', '폭', 'Width', 0.8, 0.65, 0.95),
    P.pick('finish', '수전 마감', 'Tap finish', 'metal-chrome', FIN),
    P.bool('water', '물', 'Water', false),
  ],
  tags: ['bathtub', 'bath', 'tub', '욕조', '반신욕', '독립 욕조'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, W = p.width;
    const sx = L / W;
    if (p.type === 'freestanding') {
      const r = W / 2, h = 0.6;
      // one closed profile: outer wall up, rolled rim, inner wall down to the floor of the tub
      k.lathe('tub', SAN, [[0, 0.03], [r * 0.7, 0.03], [r * 0.76, 0.05], [r * 0.88, 0.2], [r * 0.97, 0.45], [r, h - 0.01], [r * 0.985, h], [r * 0.94, h - 0.004], [r * 0.915, h - 0.04], [r * 0.86, 0.3], [r * 0.72, 0.13], [r * 0.5, 0.085], [0, 0.08]], 0, 0, 0, { smooth: 36, segs: k.seg(56, 16), scale: [sx, 1, 1] });
      k.lathe('tub', SAN, [[0, 0], [r * 0.62, 0], [r * 0.64, 0.01], [r * 0.6, 0.035], [0, 0.035]], 0, 0, 0, { segs: k.seg(40, 12), scale: [sx, 1, 1] });
      if (p.water) k.lathe('water', 'water', [[0, 0.4], [r * 0.875, 0.4], [r * 0.875, 0.401], [0, 0.401]], 0, 0, 0, { segs: k.seg(48, 12), scale: [sx * 0.995, 1, 1] });
      // floor-standing tub filler at one end
      const fx = L / 2 + 0.12;
      k.lathe('faucet', p.finish, [[0, 0], [0.05, 0], [0.05, 0.008], [0.018, 0.02], [0.016, 0.85], [0, 0.85]], fx, 0, 0, { segs: k.seg(24, 8) });
      k.tube('faucet', p.finish, [[fx, 0.84, 0], [fx, 0.92, 0], [fx - 0.06, 0.96, 0], [fx - 0.16, 0.9, 0]], 0.014, { segs: k.seg(24, 8) });
      k.rod('faucet', p.finish, [fx, 0.75, 0], [fx + 0.06, 0.77, 0], 0.007);
      return finish(k);
    }
    // built-in: apron + deck with an oval-ish basin cut, wall mixer on the deck
    const h = 0.55, t = 0.04;
    k.soft('tub', SAN, L, h - t, W, 0.01, 0, (h - t) / 2, 0, { flat: 3 });
    const iw = L - 0.2, id = W - 0.2;
    const deck = roundRect(L, W, 0.012);
    const hole = roundRect(iw, id, Math.min(id / 2 - 0.01, 0.22));
    deck.holes.push(new THREE.Path(hole.getPoints(10).reverse()));
    k.slab('tub', SAN, deck, t, h - t, { bevel: 0.008, curveSegs: 12 });
    // inner basin: profile from the rim down to the bottom (normals face inward)
    const ri = id / 2;
    k.lathe('tub', SAN, [[ri, h - t + 0.002], [ri * 0.98, h - 0.1], [ri * 0.88, 0.2], [ri * 0.6, 0.09], [0, 0.08]], 0, 0, 0, { smooth: 20, segs: k.seg(48, 12), scale: [iw / id, 1, 1] });
    if (p.water) k.box('water', 'water', iw - 0.08, 0.002, id - 0.08, 0, 0.4, 0, { r: 0 });
    // deck mixer + spout at the foot end
    const fx = -L / 2 + 0.06;
    k.cyl('faucet', p.finish, 0.025, 0.025, 0.05, fx, h, 0, { segs: k.seg(16, 6) });
    k.tube('faucet', p.finish, [[fx, h + 0.04, 0], [fx, h + 0.12, 0], [fx + 0.05, h + 0.15, 0], [fx + 0.14, h + 0.1, 0]], 0.012, { segs: k.seg(20, 6) });
    for (const s of [-1, 1]) k.cyl('faucet', p.finish, 0.018, 0.02, 0.05, fx, h, s * 0.12, { segs: k.seg(16, 6) });
    return finish(k);
  },
});

/* ----------------------------------------------------------- shower booth */

const showerBooth = item({
  id: 'shower-booth', category: 'bathroom', ko: '샤워부스', en: 'Shower booth', size: [0.9, 2.0, 0.9],
  params: [
    P.pick('type', '형태', 'Type', 'corner', [['corner', '코너형(ㄱ자)', 'Corner'], ['screen', '워크인 파티션', 'Walk-in screen'], ['alcove', '일자형(슬라이딩)', 'Alcove sliding']]),
    P.len('width', '폭', 'Width', 0.9, 0.7, 1.8),
    P.len('depth', '깊이', 'Depth', 0.9, 0.7, 1.4),
    P.len('height', '높이', 'Height', 2.0, 1.8, 2.3),
    P.pick('frame', '프레임', 'Frame', 'metal-chrome', FIN),
    P.bool('tray', '샤워 트레이', 'Shower tray', true),
  ],
  tags: ['shower', 'shower booth', 'shower enclosure', 'glass', '샤워부스', '샤워 파티션', '유리 칸막이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.depth, h = p.height, gt = 0.008, f = p.frame;
    const ty = p.tray ? 0.04 : 0.0;
    if (p.tray) {
      k.slab('tray', SAN, roundRect(w, d, 0.01), 0.04, 0, { bevel: 0.006, curveSegs: 6 });
      k.box('tray', 'metal-steel', w * 0.5, 0.002, 0.06, 0, 0.04, -d / 2 + 0.08, { r: 0 }); // linear drain
    } else {
      k.box('tray', 'tile-grey', w, 0.01, d, 0, 0.005, 0, { r: 0.002 });
    }
    const gh = h - ty;
    const zF = d / 2 - 0.03, xR = w / 2 - 0.03;
    // glass panes with thin profiles; channels at the wall, a stabiliser bar at the top
    const pane = (cx, cz, len, alongX, role = 'glass') => {
      k.box(role, 'glass-clear', alongX ? len : gt, gh - 0.02, alongX ? gt : len, cx, ty + 0.01 + (gh - 0.02) / 2, cz, { r: 0 });
      k.box('frame', f, alongX ? len : 0.012, 0.015, alongX ? 0.012 : len, cx, ty + 0.0075, cz, { r: 0.002 });
    };
    if (p.type === 'screen') {
      const len = w * 0.85;
      pane(-w / 2 + len / 2, zF, len, true);
      k.box('frame', f, 0.02, gh, 0.03, -w / 2 + 0.01, ty + gh / 2, zF, { r: 0.002 });
      k.rod('frame', f, [-w / 2 + len - 0.02, ty + gh - 0.05, zF], [-w / 2 + len - 0.02, ty + gh - 0.05, -d / 2], 0.008);
    } else if (p.type === 'alcove') {
      // two sliding leaves on a top rail, overlapping in the middle
      const half = w / 2 + 0.04;
      pane(-w / 2 + half / 2, zF - 0.012, half, true);
      pane(w / 2 - half / 2, zF + 0.012, half, true);
      k.box('frame', f, w, 0.035, 0.05, 0, ty + gh - 0.017, zF, { r: 0.003 });
      for (const s of [-1, 1]) k.box('frame', f, 0.02, gh, 0.05, s * (w / 2 - 0.01), ty + gh / 2, zF, { r: 0.002 });
      for (const [x, z] of [[-0.03, zF - 0.012], [0.03, zF + 0.012]]) k.rod('handles', f, [x, ty + 1.0, z], [x, ty + 1.3, z], 0.009);
    } else {
      // corner: fixed side pane on the right, front = fixed pane + hinged door with a long pull
      pane(xR, -0.03 + 0, d - 0.06, false);
      const fixed = w * 0.35;
      pane(-w / 2 + fixed / 2, zF, fixed, true);
      const door = w - fixed - 0.06;
      pane(-w / 2 + fixed + 0.01 + door / 2, zF, door, true, 'door');
      for (const yy of [ty + 0.35, ty + gh - 0.35]) k.box('frame', f, 0.03, 0.06, 0.02, -w / 2 + fixed + 0.015, yy, zF, { r: 0.004 }); // hinges
      k.box('frame', f, 0.02, gh, 0.03, -w / 2 + 0.01, ty + gh / 2, zF, { r: 0.002 });
      k.box('frame', f, 0.03, gh, 0.02, xR, ty + gh / 2, -d / 2 + 0.01, { r: 0.002 });
      k.box('frame', f, 0.03, gh, 0.03, xR, ty + gh / 2, zF, { r: 0.004 });
      const hx = -w / 2 + fixed + door - 0.04;
      for (const s of [-1, 1]) k.rod('handles', f, [hx, ty + 0.9, zF + s * 0.035], [hx, ty + 1.25, zF + s * 0.035], 0.0095);
      k.rod('handles', f, [hx, ty + 0.95, zF - 0.035], [hx, ty + 0.95, zF + 0.035], 0.006);
      k.rod('handles', f, [hx, ty + 1.2, zF - 0.035], [hx, ty + 1.2, zF + 0.035], 0.006);
    }
    return finish(k);
  },
});

/* ------------------------------------------------------------- towel rail */

const towelRail = item({
  id: 'towel-rail', category: 'bathroom', ko: '수건걸이(라디에이터)', en: 'Towel rail', placement: 'wall', elevation: 0.5, size: [0.5, 0.8, 0.1],
  params: [
    P.pick('style', '형태', 'Style', 'ladder', [['ladder', '사다리형(온열)', 'Heated ladder'], ['bar', '일자 바', 'Single bar']]),
    P.len('width', '폭', 'Width', 0.5, 0.3, 0.9),
    P.len('height', '높이', 'Height', 0.8, 0.4, 1.4),
    P.pick('finish', '마감', 'Finish', 'metal-chrome', FIN),
    P.bool('towel', '수건', 'Towel', true),
  ],
  tags: ['towel rail', 'towel bar', 'towel warmer', '수건걸이', '타월바', '라디에이터'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, f = p.finish;
    if (p.style === 'bar') {
      k.rod('rail', f, [-w / 2, 0.06, 0.03], [w / 2, 0.06, 0.03], 0.01, { segs: k.seg(14, 6) });
      for (const s of [-1, 1]) {
        k.cyl('rail', f, 0.025, 0.025, 0.012, s * w / 2, 0.06, -0.05, { rx: Math.PI / 2, segs: k.seg(16, 6) });
        k.rod('rail', f, [s * w / 2, 0.06, -0.045], [s * w / 2, 0.06, 0.04], 0.01);
      }
      if (p.towel) towel(k, 0, 0.06, 0.03, w * 0.6, 0.45);
      return finish(k);
    }
    const h = p.height;
    for (const s of [-1, 1]) {
      k.rod('rail', f, [s * w / 2, 0.0, 0.02], [s * w / 2, h, 0.02], 0.014, { segs: k.seg(16, 6) });
      for (const y of [0.1, h - 0.1]) k.rod('rail', f, [s * w / 2, y, -0.05], [s * w / 2, y, 0.02], 0.008);
    }
    const n = Math.max(4, Math.round(h / 0.09));
    for (let i = 0; i < n; i++) {
      const y = 0.05 + (i / (n - 1)) * (h - 0.1);
      k.rod('rail', f, [-w / 2, y, 0.02], [w / 2, y, 0.02], 0.0095, { segs: k.seg(12, 5) });
    }
    if (p.towel) towel(k, 0, 0.05 + (h - 0.1) * 0.75, 0.02, w * 0.75, Math.min(0.5, h * 0.55));
    return finish(k);
  },
});

/** A towel folded over a bar at (x, y, z): one cloth strip hanging down both sides of the bar. */
export function towel(k, x, y, z, w, drop) {
  const r = 0.018, front = drop, back = drop * 0.85, arc = Math.PI * r;
  const total = front + arc + back;
  const fn = (u, v) => {
    const s = v * total;
    const X = x + (u - 0.5) * w * (1 - 0.04 * Math.sin(u * Math.PI));
    let Y, Z;
    if (s < front) { Y = y - front + s; Z = z + r; }
    else if (s < front + arc) { const a = (s - front) / r; Y = y + Math.sin(a) * r; Z = z + Math.cos(a) * r; }
    else { Y = y - (s - front - arc); Z = z - r; }
    // soft vertical waves in the hanging parts
    const hang = Math.max(0, y - Y) / drop;
    Z += Math.sign(Z - z) * 0.006 * hang * Math.sin(u * Math.PI * 5);
    return [X, Y, Z];
  };
  k.add('towel', 'fabric-cotton-white', shellGeo(k.seg(20, 6), k.seg(24, 10), fn, 0.006));
}

/* ----------------------------------------------------------- mirror cabinet */

const mirrorCabinet = item({
  id: 'mirror-cabinet', category: 'bathroom', ko: '욕실 거울 수납장', en: 'Mirror cabinet', placement: 'wall', elevation: 1.1, size: [0.8, 0.7, 0.15],
  params: [
    P.len('width', '폭', 'Width', 0.8, 0.4, 1.6),
    P.len('height', '높이', 'Height', 0.7, 0.5, 0.9),
    P.int('doors', '문 수', 'Doors', 2, 1, 3),
    P.bool('light', '하부 LED', 'LED under light', true),
  ],
  tags: ['mirror cabinet', 'bathroom cabinet', 'medicine cabinet', '거울장', '욕실장', '수납장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, d = 0.13, ft = 0.018;
    k.box('body', 'paint-white-gloss', w, h, d - ft, 0, h / 2, -ft / 2, { r: 0.003 });
    const n = p.doors, gap = 0.003, dw = w / n;
    for (let i = 0; i < n; i++) {
      const cx = -w / 2 + dw * (i + 0.5);
      k.box('doors', 'paint-white-gloss', dw - gap, h - gap, ft - 0.006, cx, h / 2, d / 2 - ft / 2 - 0.003, { r: 0.002 });
      k.box('mirror', 'mirror', dw - gap - 0.004, h - gap - 0.004, 0.006, cx, h / 2, d / 2 - 0.003, { r: 0.0015 });
    }
    if (p.light) {
      k.box('light', 'light-warm', w - 0.06, 0.006, 0.02, 0, -0.002, d / 2 - 0.04, { r: 0 });
      k.light(0, -0.01, d / 2 - 0.04, { intensity: 0.3, distance: 1.5, type: 'spot', angle: 1.2 });
    }
    return finish(k);
  },
});

/* -------------------------------------------------------------- shower set */

const showerSet = item({
  id: 'shower-set', category: 'bathroom', ko: '샤워 수전(해바라기)', en: 'Shower set (rain head)', placement: 'wall', elevation: 0.95, size: [0.32, 1.28, 0.48],
  params: [
    P.len('rise', '높이', 'Riser height', 1.2, 0.8, 1.4),
    P.len('head', '헤드 지름', 'Rain head size', 0.25, 0.18, 0.4),
    P.pick('finish', '마감', 'Finish', 'metal-chrome', FIN),
  ],
  tags: ['shower', 'rain shower', 'shower head', 'shower column', '샤워기', '해바라기 샤워기', '샤워 수전'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const f = p.finish, H = p.rise, R = p.head / 2;
    const zr = 0.05; // riser axis distance from the wall
    // thermostatic mixer bar at the bottom with two handles
    k.rod('body', f, [-0.15, 0.03, zr], [0.15, 0.03, zr], 0.028, { segs: k.seg(24, 8) });
    for (const s of [-1, 1]) {
      k.cyl('body', f, 0.032, 0.032, 0.03, s * 0.15, 0.03, zr, { rz: Math.PI / 2 * s, segs: k.seg(24, 8) });
      k.cyl('body', f, 0.02, 0.02, 0.05, s * 0.08, 0.03, zr - 0.05, { rx: Math.PI / 2, segs: k.seg(16, 6) });
    }
    // riser, arm and rain head
    k.rod('body', f, [0, 0.05, zr], [0, H, zr], 0.012, { segs: k.seg(16, 6) });
    k.tube('body', f, [[0, H - 0.05, zr], [0, H + 0.02, zr + 0.02], [0, H + 0.03, zr + 0.12], [0, H + 0.03, zr + 0.3]], 0.011, { segs: k.seg(20, 6) });
    k.lathe('head', f, [[0, 0], [R - 0.01, 0], [R, 0.004], [R, 0.008], [R * 0.6, 0.016], [0, 0.018]], 0, H + 0.005, zr + 0.3, { segs: k.seg(40, 12) });
    k.cyl('head', 'plastic-grey', R - 0.012, R - 0.012, 0.001, 0, H + 0.0045, zr + 0.3, { segs: k.seg(40, 12) });
    // hand shower on a slide holder + hose loop to the mixer
    const hy = H * 0.6;
    k.box('body', f, 0.03, 0.05, 0.03, 0, hy, zr + 0.02, { r: 0.006 });
    k.lathe('hand', f, [[0, 0], [0.014, 0], [0.016, 0.16], [0.03, 0.2], [0.036, 0.22], [0.034, 0.23], [0, 0.232]], 0, hy - 0.14, zr + 0.05, { rx: -0.18, segs: k.seg(20, 8) });
    k.tube('hose', f, [[0, hy - 0.14, zr + 0.05], [0.03, hy - 0.4, zr + 0.09], [0.07, 0.25, zr + 0.1], [0.06, 0.04, zr + 0.06], [0, 0.0, zr + 0.03]], 0.007, { segs: k.seg(40, 10), radial: k.seg(8, 4) });
    return finish(k);
  },
});

export const ITEMS = [toilet, vanity, bathtub, showerBooth, towelRail, mirrorCabinet, showerSet];
