// Further structure items: Japanese box stairs (kaidan-dansu), classical balustrade, horizontal-bar
// railing, corner fireplace, panelled box column, fluted pilaster, tambour fluted wall panel,
// king-post timber truss, stacked-stone cladding, access ramp with handrails, glass-block wall.
// See ARCHITECTURE.md §12 → Library objects.
import { THREE, Kit, P, variant, clamp, rng, frameShape } from './helpers.js';
import { finish } from './kitchen.js';
import { mk } from './appliances-more.js';

const V2 = (x, y) => new THREE.Vector2(x, y);

/* ------------------------------------------------------------- stairs */

const boxStairs = mk({
  id: 'st-stairs-storage', category: 'structure', ko: '수납 계단장(카이단 단스)', en: 'Storage staircase (kaidan-dansu)',
  params: [
    P.int('steps', '단 수', 'Steps', 5, 3, 8),
    P.len('width', '폭', 'Width', 0.8, 0.5, 1.2),
    P.len('rise', '단 높이', 'Step rise', 0.22, 0.17, 0.26),
    P.len('run', '단 깊이', 'Step run', 0.3, 0.22, 0.4),
    P.mat('wood', '나무', 'Wood', 'wood-walnut', 'wood'),
    P.mat('fronts', '서랍/문', 'Fronts', 'wood-oak', 'wood'),
  ],
  tags: ['storage stairs', 'stair cabinet', 'kaidan dansu', 'loft stairs', '수납 계단', '계단장', '계단 수납장', '다락 계단'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = clamp(Math.round(p.steps), 3, 8), w = p.width, rh = p.rise, run = p.run, L = n * run;
    for (let i = 0; i < n; i++) {
      // column i spans z from the back; its top is (n - i) steps high
      const hgt = (n - i) * rh, z = -L / 2 + run * (i + 0.5);
      k.box('carcass', p.wood, w, hgt - 0.03, run, 0, (hgt - 0.03) / 2, z, { r: 0.003 });
      k.box('treads', p.wood, w + 0.01, 0.03, run + 0.015, 0, hgt - 0.015, z + 0.0075, { r: 0.004, segs: 2 });
    }
    // fronts on the side face (+x) of each column: drawers on top, doors below
    for (let i = 0; i < n; i++) {
      const hgt = (n - i) * rh - 0.03, z = -L / 2 + run * (i + 0.5), x = w / 2 + 0.009;
      const rows = Math.max(1, Math.round(hgt / 0.3));
      for (let r = 0; r < rows; r++) {
        const fh = hgt / rows - 0.006, y = (hgt / rows) * (r + 0.5);
        k.box('fronts', p.fronts, 0.018, fh, run - 0.012, x, y, z, { r: 0.002 });
        k.cyl('handles', 'metal-black', 0.012, 0.012, 0.012, x + 0.009, y, z, { rz: -Math.PI / 2, segs: k.seg(12, 6) });
      }
    }
    return finish(k);
  },
});

/* ------------------------------------------------------------ railings */

const balustrade = mk({
  id: 'st-balustrade-classic', category: 'structure', ko: '클래식 난간(석조 발루스터)', en: 'Classical balustrade',
  params: [
    P.len('length', '길이', 'Length', 2.0, 0.6, 6),
    P.len('height', '높이', 'Height', 0.95, 0.75, 1.2),
    P.mat('stone', '재질', 'Material', 'travertine', 'stone'),
  ],
  tags: ['balustrade', 'baluster', 'classical railing', 'stone railing', '발루스터', '난간', '석조 난간', '클래식 난간'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, h = p.height, pl = 0.12, cap = 0.08, bh = h - pl - cap;
    k.box('rails', p.stone, L, pl, 0.24, 0, pl / 2, 0, { r: 0.008, segs: 2 });
    k.box('rails', p.stone, L + 0.04, cap, 0.28, 0, h - cap / 2, 0, { r: 0.012, segs: 2 });
    const prof = [[0.045, 0], [0.045, 0.03], [0.03, 0.05], [0.055, bh * 0.25], [0.06, bh * 0.38], [0.035, bh * 0.6], [0.025, bh * 0.78], [0.035, bh * 0.88], [0.04, bh * 0.94], [0.045, bh], [0, bh]];
    const posts = Math.max(2, Math.round(L / 1.2) + 1);
    const pitch = 0.16, inner = (L - 0.2 * posts) / (posts - 1);
    for (let i = 0; i < posts; i++) {
      const x = -L / 2 + 0.1 + i * (0.2 + inner);
      k.box('rails', p.stone, 0.2, bh, 0.22, x, pl + bh / 2, 0, { r: 0.006, segs: 2 });
      if (i === posts - 1) break;
      const nb = Math.max(1, Math.floor(inner / pitch));
      for (let j = 0; j < nb; j++) k.lathe('balusters', p.stone, prof, x + 0.1 + (inner * (j + 0.5)) / nb, pl, 0, { smooth: 16, segs: k.seg(16, 6) });
    }
    return finish(k);
  },
});

const barRailing = mk({
  id: 'st-railing-horizontal', category: 'structure', ko: '가로살 철제 난간', en: 'Horizontal-bar steel railing',
  params: [
    P.len('length', '길이', 'Length', 2.0, 0.6, 6),
    P.len('height', '높이', 'Height', 1.0, 0.8, 1.2),
    P.int('bars', '가로살 수', 'Bars', 6, 3, 10),
    P.mat('metal', '금속', 'Metal', 'metal-black', 'metal'),
    P.mat('rail', '손잡이', 'Handrail', 'wood-oak'),
  ],
  tags: ['railing', 'horizontal railing', 'modern railing', 'balcony railing', '난간', '가로살 난간', '철제 난간', '모던 난간'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, h = p.height, posts = Math.max(2, Math.round(L / 1.0) + 1);
    for (let i = 0; i < posts; i++) {
      const x = -L / 2 + 0.025 + ((L - 0.05) * i) / (posts - 1);
      k.box('posts', p.metal, 0.04, h - 0.04, 0.04, x, (h - 0.04) / 2, 0, { r: 0.003 });
      k.box('posts', p.metal, 0.1, 0.008, 0.1, x, 0.004, 0, { r: 0.002 });
    }
    const nb = clamp(Math.round(p.bars), 3, 10);
    for (let j = 0; j < nb; j++) k.rod('bars', p.metal, [-L / 2 + 0.02, 0.12 + ((h - 0.24) * j) / (nb - 1), 0], [L / 2 - 0.02, 0.12 + ((h - 0.24) * j) / (nb - 1), 0], 0.008, { segs: k.seg(10, 5) });
    k.box('rail', p.rail, L, 0.04, 0.07, 0, h - 0.02, 0, { r: 0.012, segs: 2 });
    return finish(k);
  },
});

/* ---------------------------------------------------------- fireplace */

const cornerFire = mk({
  id: 'st-fireplace-corner', category: 'structure', ko: '코너 벽난로', en: 'Corner fireplace',
  params: [
    P.len('size', '크기', 'Size', 1.1, 0.8, 1.6),
    P.len('height', '높이', 'Height', 1.2, 0.9, 1.6),
    P.mat('surround', '마감', 'Surround', 'wall-plaster', 'wall'),
    P.mat('hearth', '바닥석', 'Hearth', 'granite-grey', 'stone'),
    P.bool('fire', '불꽃', 'Fire', true),
  ],
  tags: ['corner fireplace', 'fireplace', 'kiva', 'hearth', '코너 벽난로', '벽난로', '모서리 벽난로', '난로'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const S = p.size, h = p.height;
    // triangular plan in the back-left corner (corner at -x/-z), front face diagonal
    const tri = new THREE.Shape([V2(-S / 2, -S / 2), V2(S / 2, -S / 2), V2(-S / 2, S / 2)]);
    k.slab('hearth', p.hearth, new THREE.Shape([V2(-S / 2, -S / 2), V2(S / 2 + 0.12, -S / 2), V2(-S / 2, S / 2 + 0.12)]), 0.05, 0, { bevel: 0.006 });
    const body = new THREE.ExtrudeGeometry(tri, { depth: h - 0.05, bevelEnabled: false, curveSegments: 4 });
    body.rotateX(Math.PI / 2); body.translate(0, h, 0);
    k.add('surround', p.surround, body);
    // mantel shelf following the diagonal
    const mantel = new THREE.Shape([V2(-S / 2, -S / 2), V2(S / 2 + 0.06, -S / 2), V2(-S / 2, S / 2 + 0.06)]);
    k.slab('mantel', 'wood-dark', mantel, 0.06, h * 0.82, { bevel: 0.006 });
    // firebox opening on the diagonal face
    const diag = Math.SQRT2 * S, ow = Math.min(0.6, diag * 0.5), oh = Math.min(0.55, h * 0.5);
    const ry = Math.PI / 4;
    k.box('firebox', 'paint-black-matte', ow, oh, 0.02, 0.012, 0.05 + oh / 2, 0.012, { r: 0.002, ry });
    if (p.fire) {
      for (let i = 0; i < 3; i++) k.cyl('flame', 'light-warm', 0.0, 0.05, 0.16 + 0.05 * (i % 2), 0.06 + (i - 1) * 0.08 * Math.SQRT1_2, 0.06, 0.06 - (i - 1) * 0.08 * Math.SQRT1_2, { segs: k.seg(10, 5) });
      k.light(0.08, 0.2, 0.08, { color: '#ffae5c', intensity: 0.8, distance: 4 });
    }
    return finish(k);
  },
});

/* --------------------------------------------------------- columns etc. */

const panelColumn = mk({
  id: 'st-column-panelled', category: 'structure', ko: '판넬 사각 기둥', en: 'Panelled box column',
  params: [
    P.len('height', '높이', 'Height', 2.4, 1.8, 3.5),
    P.len('size', '단면 폭', 'Section', 0.3, 0.2, 0.6),
    P.mat('finish', '마감', 'Finish', 'paint-white-matte'),
  ],
  tags: ['column', 'box column', 'square column', 'panelled', '기둥', '사각 기둥', '판넬 기둥', '인테리어 기둥'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const h = p.height, s = p.size, bh = 0.18, ch = 0.12;
    k.box('base', p.finish, s + 0.06, bh, s + 0.06, 0, bh / 2, 0, { r: 0.004, segs: 2 });
    k.box('base', p.finish, s + 0.08, ch * 0.4, s + 0.08, 0, h - ch * 0.2, 0, { r: 0.004, segs: 2 });
    k.box('base', p.finish, s + 0.04, ch * 0.6, s + 0.04, 0, h - ch * 0.4 - ch * 0.3, 0, { r: 0.004, segs: 2 });
    const sh = h - bh - ch;
    k.box('shaft', p.finish, s, sh, s, 0, bh + sh / 2, 0, { r: 0.003 });
    // recessed panel mouldings on four faces
    for (let f = 0; f < 4; f++) {
      const ry = (f * Math.PI) / 2, nx = Math.sin(ry), nz = Math.cos(ry);
      k.panel('moulding', p.finish, frameShape(s - 0.07, sh - 0.14, 0.018), 0.012, nx * (s / 2 + 0.006), bh + sh / 2, nz * (s / 2 + 0.006), { ry, bevel: 0.004 });
    }
    return finish(k);
  },
});

const pilaster = mk({
  id: 'st-pilaster-fluted', category: 'structure', placement: 'wall', elevation: 0, ko: '세로홈 벽기둥(필라스터)', en: 'Fluted pilaster',
  params: [
    P.len('height', '높이', 'Height', 2.4, 1.8, 3.5),
    P.len('width', '폭', 'Width', 0.3, 0.18, 0.5),
    P.int('flutes', '홈 수', 'Flutes', 5, 3, 9),
    P.mat('finish', '마감', 'Finish', 'paint-white-matte'),
  ],
  tags: ['pilaster', 'fluted', 'classical', 'wall column', '필라스터', '벽기둥', '세로홈', '클래식 몰딩'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const h = p.height, w = p.width, d = 0.05, bh = 0.2, ch = 0.18;
    k.box('pilaster', p.finish, w + 0.06, bh, d + 0.03, 0, bh / 2, (d + 0.03) / 2, { r: 0.004, segs: 2 });
    k.box('pilaster', p.finish, w + 0.03, 0.04, d + 0.015, 0, bh + 0.02, (d + 0.015) / 2, { r: 0.006, segs: 2 });
    const sh = h - bh - ch - 0.04;
    k.box('pilaster', p.finish, w, sh, d, 0, bh + 0.04 + sh / 2, d / 2, { r: 0.002 });
    const n = clamp(Math.round(p.flutes), 3, 9), fw = (w - 0.04) / n;
    for (let i = 0; i < n; i++) k.cyl('flutes', p.finish, fw * 0.32, fw * 0.32, sh - 0.12, -w / 2 + 0.02 + fw * (i + 0.5), bh + 0.1, d, { segs: k.seg(12, 6), open: true });
    k.box('pilaster', p.finish, w + 0.05, ch * 0.5, d + 0.025, 0, h - ch * 0.75, (d + 0.025) / 2, { r: 0.004, segs: 2 });
    k.box('pilaster', p.finish, w + 0.09, ch * 0.5, d + 0.045, 0, h - ch * 0.25, (d + 0.045) / 2, { r: 0.006, segs: 2 });
    return finish(k);
  },
});

const tambour = mk({
  id: 'st-fluted-panel', category: 'structure', placement: 'wall', elevation: 0, ko: '반원 플루트 벽 패널(탐부르)', en: 'Tambour fluted wall panel',
  params: [
    P.len('width', '폭', 'Width', 1.2, 0.3, 3.0),
    P.len('height', '높이', 'Height', 2.4, 0.6, 3.0),
    P.len('pitch', '홈 간격', 'Flute pitch', 0.04, 0.025, 0.08),
    P.mat('finish', '마감', 'Finish', 'wood-oak'),
  ],
  tags: ['fluted panel', 'tambour', 'reeded wall', 'wall panel', '플루트 패널', '탐부르', '템바보드', '벽 패널'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, n = Math.max(4, Math.round(w / p.pitch)), r = w / n / 2;
    k.box('panel', p.finish, w, h, 0.012, 0, h / 2, 0.006, { r: 0.001 });
    const segs = k.seg(10, 4);
    for (let i = 0; i < n; i++) {
      const g = new THREE.CylinderGeometry(r, r, h, segs, 1, true, -Math.PI / 2, Math.PI);
      g.translate(-w / 2 + r * (2 * i + 1), h / 2, 0.012);
      k.add('panel', p.finish, g);
    }
    return finish(k);
  },
});

const truss = mk({
  id: 'st-truss-kingpost', category: 'structure', placement: 'ceiling', elevation: 2.5, ko: '킹포스트 목조 트러스', en: 'King-post timber truss',
  params: [
    P.len('span', '스팬', 'Span', 4.0, 2.0, 8.0),
    P.num('pitch', '경사(°)', 'Pitch (°)', 30, 15, 45, 1),
    P.len('timber', '목재 단면', 'Timber size', 0.15, 0.08, 0.25),
    P.mat('wood', '목재', 'Timber', 'wood-dark', 'wood'),
  ],
  tags: ['truss', 'king post', 'timber truss', 'exposed beam', '트러스', '목조 트러스', '노출 보', '서까래'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const S = p.span, t = p.timber, a = clamp(p.pitch, 15, 45) * Math.PI / 180, H = (S / 2) * Math.tan(a);
    k.box('timber', p.wood, S, t, t, 0, t / 2, 0, { r: 0.006, segs: 2 });
    const len = Math.hypot(S / 2, H);
    for (const s of [-1, 1]) {
      k.box('timber', p.wood, len, t, t, s * S / 4, t / 2 + H / 2, 0, { r: 0.006, segs: 2, rz: -s * a });
      // struts from the king post foot to the rafters
      const bx = s * S / 4, by = t + H / 2;
      const sl = Math.hypot(bx, by - t);
      k.box('timber', p.wood, sl, t * 0.75, t * 0.75, bx / 2, (t + by) / 2, 0, { r: 0.005, rz: Math.atan2(by - t, bx) });
    }
    k.box('timber', p.wood, t, H, t, 0, t + H / 2 - t / 2, 0, { r: 0.006, segs: 2 });
    for (const s of [-1, 1]) k.box('plates', 'metal-black', 0.22, 0.22, 0.006, 0, t * 1.2, s * (t / 2 + 0.003), { r: 0.002 });
    return finish(k);
  },
});

const stone = mk({
  id: 'st-stone-cladding', category: 'structure', placement: 'wall', elevation: 0, ko: '적층 석재 벽 마감', en: 'Stacked stone cladding',
  params: [
    P.len('width', '폭', 'Width', 1.2, 0.4, 3.0),
    P.len('height', '높이', 'Height', 2.4, 0.4, 3.0),
    P.mat('stone', '석재', 'Stone', 'granite-grey', 'stone'),
    P.int('seed', '모양', 'Variation', 1, 1, 30),
  ],
  tags: ['stone cladding', 'stacked stone', 'ledgestone', 'feature wall', '석재 마감', '스톤 월', '파벽돌', '포인트 벽'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, rand = rng(p.seed * 31 + 7), rowH = 0.08;
    k.box('backing', 'concrete', w, h, 0.01, 0, h / 2, 0.005, { r: 0 });
    const rows = Math.max(1, Math.round(h / rowH)), rh = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = -w / 2;
      while (x < w / 2 - 0.01) {
        const len = Math.min(w / 2 - x, 0.15 + rand() * 0.3);
        const d = 0.025 + rand() * 0.02;
        k.box('stones', p.stone, len - 0.006, rh - 0.008, d, x + len / 2, rh * (r + 0.5), 0.01 + d / 2, { r: 0.004 });
        x += len;
      }
    }
    return finish(k);
  },
});

const ramp = mk({
  id: 'st-ramp', category: 'structure', ko: '경사로(핸드레일)', en: 'Access ramp with handrails',
  params: [
    P.len('rise', '높이', 'Rise', 0.3, 0.05, 0.8),
    P.len('width', '폭', 'Width', 1.2, 0.8, 2.0),
    P.num('gradient', '경사(1:n)', 'Gradient (1:n)', 12, 6, 20, 1),
    P.bool('rails', '핸드레일', 'Handrails', true),
    P.mat('surface', '표면', 'Surface', 'concrete'),
  ],
  tags: ['ramp', 'access ramp', 'wheelchair ramp', 'barrier free', '경사로', '슬로프', '휠체어 경사로', '무장애'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.rise, w = p.width, L = R * clamp(p.gradient, 6, 20);
    const side = new THREE.Shape([V2(L / 2, 0), V2(-L / 2, 0), V2(-L / 2, R), V2(-L / 2 + 0.3, R)]);
    // side profile in x/y, extruded across z (width)
    k.panel('ramp', p.surface, side, w, 0, 0, 0, { bevel: 0.004 });
    if (p.rails) {
      const rh = 0.9;
      for (const s of [-1, 1]) {
        const z = s * (w / 2 - 0.04);
        const pts = [[L / 2 - 0.05, 0], [L / 2 - 0.05, rh], [-L / 2 + 0.3, R + rh], [-L / 2 - 0.05, R + rh], [-L / 2 - 0.05, R]];
        k.bentTube('rails', 'metal-steel', pts.map(([x, y]) => [x, y, z]), 0.02, 0.06, { radial: k.seg(10, 5) });
        const nPosts = Math.max(2, Math.round(L / 1.5));
        for (let i = 1; i < nPosts; i++) {
          const x = L / 2 - 0.05 - ((L - 0.35) * i) / nPosts, yb = R * ((L / 2 - x) / (L - 0.3));
          k.rod('rails', 'metal-steel', [x, Math.min(R, yb), z], [x, Math.min(R, yb) + rh, z], 0.018, { segs: k.seg(10, 5) });
        }
      }
    }
    return finish(k);
  },
});

const glassBlockWall = mk({
  id: 'st-glass-block-wall', category: 'structure', ko: '유리블록 벽', en: 'Glass block wall',
  params: [
    P.len('width', '폭', 'Width', 1.2, 0.4, 3.0),
    P.len('height', '높이', 'Height', 2.0, 0.4, 2.8),
    P.mat('glass', '유리', 'Glass', 'glass-frosted', 'glass'),
    P.mat('frame', '테두리', 'Edge frame', 'metal-aluminium', 'metal'),
  ],
  tags: ['glass block', 'glass brick', 'partition', 'bathroom wall', '유리블록', '글라스 블록', '칸막이', '유리 벽돌'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, b = 0.19, d = 0.08, e = 0.03;
    const nx = Math.max(1, Math.round((w - 2 * e) / b)), ny = Math.max(1, Math.round((h - 2 * e) / b));
    const bw = (w - 2 * e) / nx, bh = (h - 2 * e) / ny;
    k.box('grout', 'concrete', w - 2 * e, h - 2 * e, d * 0.6, 0, h / 2, 0, { r: 0 });
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      k.box('blocks', p.glass, bw - 0.01, bh - 0.01, d, -w / 2 + e + bw * (i + 0.5), e + bh * (j + 0.5), 0, { r: 0.008 });
    }
    k.panel('frame', p.frame, frameShape(w, h, e), d + 0.01, 0, h / 2, 0, { bevel: 0.003 });
    return finish(k);
  },
});

/* ---------------------------------------------------------------- variants */

const V = [
  variant(tambour, 'white', '화이트 플루트 패널', 'White fluted wall panel', { finish: 'paint-white-matte' }, { tags: ['white', '화이트'] }),
  variant(stone, 'travertine', '트래버틴 석재 벽 마감', 'Travertine stacked stone', { stone: 'travertine' }, { tags: ['travertine', '트래버틴'] }),
];

export const ITEMS = [boxStairs, balustrade, barRailing, cornerFire, panelColumn, pilaster, tambour, truss, stone, ramp, glassBlockWall, ...V];
