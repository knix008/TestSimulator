// Office props (사무실) category, part 1: desk supplies and paper handling — staplers, punches, tape,
// pens, organisers, trays, binders, files, archive boxes, notes, calendars, name plates, stamps,
// calculators, label makers, laminators, shredders, trimmers, binding machines, paper and mail.
// Units metres, Y up, front +Z, origin bottom centre (finish() centres every build); sizes are measured
// from the default build (mk). See ARCHITECTURE.md §12 → Library objects.
import { THREE, Kit, P, T, roundRect, frameShape } from './helpers.js';
import { finish } from './kitchen.js';
import { mk } from './appliances-more.js';
import { C, vessel } from './accessories-plus.js';

const PI = Math.PI;
export const OFP = 'officeprops';
/** An office-props entry: surface placement unless stated. */
export const ofp = (def) => mk({ category: OFP, placement: 'surface', ...def });

/** A row of small square buttons / keys along x on a face at zf (or on top when top=true). */
export function keys(k, role, mat, cols, rows, x, y, z, pitch, s, { top = true, o = {} } = {}) {
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const px = x + (c - (cols - 1) / 2) * pitch, pz = z + (r - (rows - 1) / 2) * pitch;
    if (top) k.box(role, mat, s, 0.004, s, px, y + 0.002, pz, { r: 0.001, ...o });
    else k.box(role, mat, s, s, 0.004, px, y + (r - (rows - 1) / 2) * pitch, z + 0.002, { r: 0.001, ...o });
  }
}

/** Sheet stack (paper) w × d, n sheets thick, bottom at y. */
export function sheets(k, w, d, h, x = 0, y = 0, z = 0, ry = 0, mat = 'paper') {
  k.box('paper', mat, w, h, d, x, y + h / 2, z, { r: 0.0005, ry });
}

/** Lever-arch / ring binder standing on its bottom edge, spine facing +Z. */
export function binder(k, color, w, h, d, x, y, z, { label = true, ry = 0 } = {}) {
  k.box('binders', 'plastic-pp-white', w, h, d, x, y + h / 2, z, { r: 0.003, ry, ...C(color) });
  if (label) k.box('labels', 'paper', w * 0.6, h * 0.35, 0.002, x + Math.sin(ry) * (d / 2 + 0.001), y + h * 0.6, z + Math.cos(ry) * (d / 2 + 0.001), { r: 0, ry });
  k.cyl('rings', 'metal-chrome', w * 0.18, w * 0.18, 0.003, x + Math.sin(ry) * (d / 2), y + h * 0.18, z + Math.cos(ry) * (d / 2 + 0.001), { rx: PI / 2, ry, segs: k.seg(12, 6) });
}

export const BINDER_COLS = ['#1f4e8c', '#b8322a', '#2f7a46', '#e0b020', '#333333', '#7a4a9a', '#e07a2a', '#5a8fb8'];

/* ============================================================ staplers and punches */

const stapler = ofp({
  id: 'ofp-stapler', ko: '스테이플러', en: 'Desk stapler',
  params: [P.color('body', '몸체 색', 'Body colour', '#2b2b2b'), P.len('length', '길이', 'Length', 0.16, 0.12, 0.22)],
  tags: ['stapler', 'desk stapler', 'office supplies', '스테이플러', '호치키스', '사무용품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length;
    k.box('base', 'metal-chrome', L, 0.012, 0.04, 0, 0.006, 0, { r: 0.004 });
    k.box('base', 'rubber-black', L * 0.95, 0.004, 0.038, 0, 0.002, 0, { r: 0.002 });
    k.box('arm', 'plastic-abs-gloss-black', L * 0.92, 0.03, 0.036, 0.004, 0.032, 0, { r: 0.012, rz: 0.06, ...C(p.body) });
    k.box('arm', 'metal-chrome', L * 0.3, 0.01, 0.03, -L * 0.33, 0.02, 0, { r: 0.003 });
    k.cyl('pivot', 'metal-chrome', 0.006, 0.006, 0.042, -L * 0.43, 0.02, -0.021, { rx: PI / 2, segs: k.seg(10, 5) });
    return finish(k);
  },
});

const heavyStapler = ofp({
  id: 'ofp-heavy-duty-stapler', ko: '대용량 스테이플러', en: 'Heavy-duty stapler',
  params: [P.color('body', '몸체 색', 'Body colour', '#c0392b'), P.len('length', '길이', 'Length', 0.3, 0.24, 0.4)],
  tags: ['heavy duty stapler', 'long stapler', 'booklet stapler', '대용량 스테이플러', '중철 스테이플러', '사무용품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length;
    k.box('base', 'metal-pc-black-matte', L, 0.02, 0.08, 0, 0.01, 0, { r: 0.004 });
    k.box('base', 'metal-steel', L * 0.4, 0.008, 0.07, L * 0.25, 0.024, 0, { r: 0.002 });
    k.box('arm', 'metal-pc-red', L * 0.85, 0.05, 0.06, 0.02, 0.07, 0, { r: 0.01, rz: 0.08, ...C(p.body) });
    k.box('lever', 'metal-pc-black-matte', L * 0.55, 0.025, 0.05, L * 0.12, 0.115, 0, { r: 0.01, rz: 0.15 });
    k.box('posts', 'metal-pc-black-matte', 0.03, 0.08, 0.07, -L * 0.42, 0.06, 0, { r: 0.004 });
    return finish(k);
  },
});

const stapleRemover = ofp({
  id: 'ofp-staple-remover', ko: '스테이플 제거기', en: 'Staple remover',
  params: [P.color('body', '몸체 색', 'Body colour', '#2b2b2b')],
  tags: ['staple remover', 'staple puller', '리무버', '스테이플 제거기', '사무용품'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    for (const s of [-1, 1]) {
      k.box('grips', 'plastic-abs-matte-black', 0.055, 0.014, 0.022, -0.005, 0.012 + s * 0.008, 0, { r: 0.006, rz: s * 0.18, ...C(p.body) });
      k.box('jaws', 'metal-chrome', 0.02, 0.003, 0.02, 0.028, 0.012 + s * 0.004, 0, { r: 0.001, rz: -s * 0.4 });
    }
    k.cyl('pivot', 'metal-chrome', 0.003, 0.003, 0.024, -0.03, 0.012, -0.012, { rx: PI / 2, segs: 6 });
    return finish(k);
  },
});

const holePunch = ofp({
  id: 'ofp-hole-punch', ko: '2공 펀치', en: 'Two-hole punch',
  params: [P.color('body', '몸체 색', 'Body colour', '#2a5d9f'), P.int('holes', '구멍 수', 'Holes', 2, 2, 4)],
  tags: ['hole punch', 'paper punch', 'two hole punch', '펀치', '천공기', '사무용품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), n = p.holes, w = 0.08 * n + 0.04;
    k.box('base', 'plastic-abs-matte-grey', w, 0.02, 0.11, 0, 0.01, 0, { r: 0.006 });
    k.box('lever', 'metal-pc-navy', w * 0.95, 0.025, 0.085, 0, 0.055, -0.006, { r: 0.008, rx: -0.12, ...C(p.body) });
    for (let i = 0; i < n; i++) k.cyl('punches', 'metal-chrome', 0.008, 0.008, 0.025, (i - (n - 1) / 2) * 0.08, 0.02, 0.02, { segs: k.seg(12, 6) });
    k.box('guide', 'plastic-abs-matte-black', w * 0.8, 0.004, 0.02, 0, 0.022, 0.048, { r: 0.001 });
    return finish(k);
  },
});

const tapeDispenser = ofp({
  id: 'ofp-tape-dispenser', ko: '테이프 커터', en: 'Tape dispenser',
  params: [P.color('body', '몸체 색', 'Body colour', '#1d1d1d'), P.bool('weighted', '무게추형', 'Weighted base', true)],
  tags: ['tape dispenser', 'sellotape', 'scotch tape', '테이프 커터', '스카치테이프', '사무용품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.weighted ? 0.07 : 0.05;
    k.box('body', 'plastic-abs-gloss-black', 0.14, h * 0.55, 0.06, 0, h * 0.275, 0, { r: 0.014, ...C(p.body) });
    k.lathe('body', 'plastic-abs-gloss-black', [[0.0, 0], [0.04, 0], [0.042, 0.05], [0.0, 0.05]], -0.015, h * 0.45, -0.025, { rx: PI / 2, segs: k.seg(24, 8), ...C(p.body) });
    k.add('tape', 'plastic-acrylic-clear', T(new THREE.TorusGeometry(0.03, 0.007, k.seg(8, 4), k.seg(24, 10)), -0.015, h * 0.45 + 0.04, 0));
    k.box('blade', 'metal-steel', 0.004, 0.012, 0.03, 0.068, h * 0.7, 0, { r: 0 });
    return finish(k);
  },
});

const scissors = ofp({
  id: 'ofp-scissors', ko: '사무용 가위', en: 'Office scissors',
  params: [P.color('grip', '손잡이 색', 'Grip colour', '#e0402a'), P.len('length', '길이', 'Length', 0.21, 0.14, 0.26)],
  tags: ['scissors', 'shears', 'office scissors', '가위', '사무용 가위', '사무용품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length;
    for (const s of [-1, 1]) {
      k.box('blades', 'metal-ss-satin', L * 0.55, 0.002, 0.012, L * 0.2, 0.004 + (s > 0 ? 0.002 : 0), s * 0.004, { r: 0.0008, ry: s * 0.06 });
      k.add('grips', 'plastic-pp-red', T(new THREE.TorusGeometry(0.017, 0.005, k.seg(8, 4), k.seg(16, 8)), -L * 0.25, 0.005, s * 0.02, PI / 2, 0, 0, [1.3, 1, 1]), C(p.grip));
    }
    k.cyl('pivot', 'metal-chrome', 0.004, 0.004, 0.008, -L * 0.06, 0.001, 0, { segs: 8 });
    return finish(k);
  },
});

const clipHolder = ofp({
  id: 'ofp-magnetic-clip-holder', ko: '자석 클립 통', en: 'Magnetic clip holder',
  params: [P.color('body', '몸체 색', 'Body colour', '#2b2b2b'), P.int('clips', '클립 수', 'Clips', 8, 0, 16)],
  tags: ['paper clip holder', 'clip dispenser', 'magnetic', '클립 통', '자석 클립', '사무용품'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.lathe('body', 'plastic-abs-gloss-black', [[0, 0], [0.03, 0], [0.032, 0.05], [0.025, 0.055], [0.0, 0.055]], 0, 0, 0, { segs: k.seg(24, 8), ...C(p.body) });
    k.cyl('magnet', 'metal-steel', 0.02, 0.022, 0.006, 0, 0.055, 0, { segs: k.seg(20, 8) });
    for (let i = 0; i < p.clips; i++) {
      const a = i * 2.39;
      k.box('clips', 'metal-chrome', 0.03, 0.002, 0.008, Math.cos(a) * 0.008, 0.062 + (i % 3) * 0.002, Math.sin(a) * 0.008, { r: 0, ry: a, rx: 0.5 + (i % 3) * 0.3 });
    }
    return finish(k);
  },
});

const penCup = ofp({
  id: 'ofp-mesh-pen-cup', ko: '메쉬 펜꽂이', en: 'Mesh pen cup',
  params: [P.mat('mesh', '메쉬', 'Mesh', 'metal-black-mesh', 'metal'), P.int('pens', '펜 수', 'Pens', 7, 0, 14)],
  tags: ['pen cup', 'pencil holder', 'mesh', '펜꽂이', '연필꽂이', '사무용품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = 0.04, h = 0.1;
    k.cyl('cup', p.mesh, r, r, h, 0, 0, 0, { open: true, segs: k.seg(24, 8) });
    k.cyl('cup', 'metal-black', r, r, 0.004, 0, 0, 0, { segs: k.seg(24, 8) });
    const cols = ['#1f4e8c', '#b8322a', '#222222', '#2f7a46', '#e0b020', '#7a4a9a'];
    for (let i = 0; i < p.pens; i++) {
      const a = i * 2.4, rr = 0.012 + (i % 3) * 0.008, lean = 0.12 + (i % 2) * 0.1;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      k.rod('pens', 'plastic-abs-gloss-white', [x, 0.004, z], [x + Math.cos(a) * lean * 0.14, 0.15 + (i % 3) * 0.01, z + Math.sin(a) * lean * 0.14], 0.004, { segs: 6, ...C(cols[i % cols.length]) });
    }
    return finish(k);
  },
});

const deskOrganizer = ofp({
  id: 'ofp-desk-organizer', ko: '책상 정리함', en: 'Desk organiser',
  params: [P.mat('wood', '목재', 'Wood', 'wood-bamboo-natural', 'wood'), P.len('width', '폭', 'Width', 0.3, 0.22, 0.42)],
  tags: ['desk organizer', 'desk tidy', 'caddy', '책상 정리함', '데스크 오거나이저', '사무용품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, d = 0.14, t = 0.008;
    k.box('box', p.wood, w, t, d, 0, t / 2, 0, { r: 0.001 });
    k.box('box', p.wood, w, 0.06, t, 0, 0.03, d / 2 - t / 2, { r: 0.001 });
    k.box('box', p.wood, w, 0.12, t, 0, 0.06, -d / 2 + t / 2, { r: 0.001 });
    for (const x of [-w / 2 + t / 2, w / 2 - t / 2, -w * 0.15, w * 0.18]) k.box('box', p.wood, t, 0.12, d, x, 0.06, 0, { r: 0.001 });
    k.box('box', p.wood, w * 0.33, 0.1, t, w * 0.33, 0.05, 0, { r: 0.001 });
    sheets(k, 0.1, 0.07, 0.025, -w * 0.33, t, 0.02, 0, 'paper');
    k.box('notes', 'paper', 0.075, 0.03, 0.075, 0.015, t + 0.015, 0.02, { r: 0, ...C('#f6e05e') });
    k.rod('pens', 'plastic-abs-gloss-black', [w * 0.33, t, -0.03], [w * 0.34, 0.16, -0.035], 0.004, { segs: 6 });
    return finish(k);
  },
});

const letterTray = ofp({
  id: 'ofp-letter-tray-stack', ko: '서류함 (적층)', en: 'Stacked letter trays',
  params: [P.color('tray', '트레이 색', 'Tray colour', '#2b2b2b'), P.int('tiers', '단 수', 'Tiers', 3, 1, 5)],
  tags: ['letter tray', 'in tray', 'document tray', 'stacking', '서류함', '서류 트레이', '결재함'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.26, d = 0.34, h = 0.07;
    for (let i = 0; i < p.tiers; i++) {
      const y = i * h;
      k.box('trays', 'plastic-pp-black', w, 0.004, d, 0, y + 0.002, 0, { r: 0.001, ...C(p.tray) });
      for (const s of [-1, 1]) k.box('trays', 'plastic-pp-black', 0.004, h * 0.8, d, s * (w / 2 - 0.002), y + h * 0.4, 0, { r: 0.001, ...C(p.tray) });
      k.box('trays', 'plastic-pp-black', w, h * 0.8, 0.004, 0, y + h * 0.4, -d / 2 + 0.002, { r: 0.001, ...C(p.tray) });
      k.box('trays', 'plastic-pp-black', w, 0.025, 0.004, 0, y + 0.012, d / 2 - 0.002, { r: 0.001, ...C(p.tray) });
      if (i % 2 === 0) sheets(k, 0.21, 0.29, 0.01, 0, y + 0.004, -0.01, 0);
    }
    return finish(k);
  },
});

const fileSorter = ofp({
  id: 'ofp-vertical-file-sorter', ko: '세로형 파일 꽂이', en: 'Vertical file sorter',
  params: [P.mat('metal', '금속', 'Metal', 'metal-pc-black-matte', 'metal'), P.int('slots', '칸 수', 'Slots', 5, 3, 8)],
  tags: ['file sorter', 'desktop file holder', 'step file', '파일 꽂이', '서류 꽂이', '사무용품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), n = p.slots, step = 0.045, d = n * step + 0.02;
    k.box('frame', p.metal, 0.24, 0.004, d, 0, 0.002, 0, { r: 0.001 });
    for (let i = 0; i < n; i++) {
      const z = -d / 2 + 0.01 + i * step, h = 0.12 + (n - i) * 0.025;
      k.box('frame', p.metal, 0.24, h, 0.003, 0, h / 2, z, { r: 0.001 });
      if (i < n - 1) k.box('files', 'paper', 0.22, h - 0.01, 0.006, 0, (h - 0.01) / 2 + 0.004, z + 0.02, { r: 0.001, ...C(['#f2f2f2', '#9ec5e8', '#f4d58d', '#b8e0b0'][i % 4]) });
    }
    return finish(k);
  },
});

const magazineFile = ofp({
  id: 'ofp-magazine-file-box', ko: '매거진 파일 박스', en: 'Magazine file box',
  params: [P.color('box', '색', 'Colour', '#e8e3d8'), P.int('count', '개수', 'Count', 3, 1, 6)],
  tags: ['magazine file', 'file box', 'document holder', '파일 박스', '매거진 파일', '서류 보관'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.08, d = 0.25, h = 0.31;
    for (let i = 0; i < p.count; i++) {
      const x = (i - (p.count - 1) / 2) * (w + 0.005);
      const s = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(d / 2, h * 0.55), new THREE.Vector2(-d / 2, h)]);
      k.panel('boxes', 'paper-cardboard', s, w, x, 0, 0, { ry: PI / 2, bevel: 0.002, ...C(p.box) });
      k.box('labels', 'paper', w * 0.7, 0.05, 0.002, x, h * 0.75, -d / 2 - 0.002, { r: 0 });
    }
    return finish(k);
  },
});

const binderRow = ofp({
  id: 'ofp-binder-row', ko: '바인더 묶음', en: 'Row of binders',
  params: [P.int('count', '개수', 'Count', 6, 1, 12), P.len('spine', '등 폭', 'Spine width', 0.075, 0.04, 0.08)],
  tags: ['ring binder', 'lever arch file', 'binders', '바인더', '파일철', '서류철'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.spine;
    for (let i = 0; i < p.count; i++) binder(k, BINDER_COLS[i % BINDER_COLS.length], w, 0.32, 0.29, (i - (p.count - 1) / 2) * (w + 0.002), 0, 0);
    return finish(k);
  },
});

const binderSingle = ofp({
  id: 'ofp-lever-arch-file', ko: '레버 아치 파일', en: 'Lever arch file',
  params: [P.color('cover', '표지 색', 'Cover colour', '#1f4e8c'), P.bool('open', '펼침', 'Open', false)],
  tags: ['lever arch file', 'ring binder', 'file', '레버 파일', '아치 파일', '서류철'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    if (!p.open) binder(k, p.cover, 0.075, 0.32, 0.29, 0, 0, 0);
    else {
      k.box('covers', 'plastic-pp-white', 0.29, 0.004, 0.32, -0.15, 0.002, 0, { r: 0.002, ...C(p.cover) });
      k.box('covers', 'plastic-pp-white', 0.29, 0.004, 0.32, 0.15, 0.002, 0, { r: 0.002, ...C(p.cover) });
      k.box('covers', 'plastic-pp-white', 0.075, 0.004, 0.32, 0, 0.002, 0, { r: 0.002, ...C(p.cover) });
      sheets(k, 0.21, 0.297, 0.03, 0.15, 0.004, 0);
      k.box('mechanism', 'metal-chrome', 0.03, 0.06, 0.2, 0.02, 0.03, 0, { r: 0.004 });
      k.box('mechanism', 'metal-chrome', 0.012, 0.012, 0.09, 0.02, 0.07, 0.08, { r: 0.004, rx: 0.5 });
    }
    return finish(k);
  },
});

const archiveBox = ofp({
  id: 'ofp-archive-box', placement: 'floor', ko: '문서 보존 상자', en: 'Archive storage box',
  params: [P.mat('board', '판지', 'Board', 'paper-cardboard', 'paper'), P.int('stack', '쌓은 수', 'Stacked', 1, 1, 4)],
  tags: ['archive box', 'storage box', 'bankers box', 'document box', '문서 보존 상자', '보존 상자', '서류 상자'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.33, d = 0.42, h = 0.26;
    for (let i = 0; i < p.stack; i++) {
      const y = i * (h + 0.002), ry = (i % 2) * 0.04;
      k.box('boxes', p.board, w, h - 0.03, d, 0, y + (h - 0.03) / 2, 0, { r: 0.002, ry });
      k.box('lids', p.board, w + 0.008, 0.035, d + 0.008, 0, y + h - 0.0175, 0, { r: 0.002, ry });
      k.box('handles', 'paper-black', 0.1, 0.03, 0.002, 0, y + h * 0.7, d / 2 + 0.002, { r: 0, ry });
      k.box('labels', 'paper', 0.14, 0.08, 0.002, 0, y + h * 0.42, d / 2 + 0.002, { r: 0, ry });
    }
    return finish(k);
  },
});

const expandingFile = ofp({
  id: 'ofp-expanding-file', ko: '아코디언 파일', en: 'Expanding file',
  params: [P.color('cover', '표지 색', 'Cover colour', '#3a6ea5'), P.int('pockets', '포켓 수', 'Pockets', 13, 6, 26)],
  tags: ['expanding file', 'accordion folder', 'document wallet', '아코디언 파일', '확장 파일', '서류 보관'],
  build: (p, ctx) => {
    const k = new Kit(ctx), d = 0.03 + p.pockets * 0.003;
    k.box('cover', 'plastic-pp-white', 0.33, 0.25, 0.003, 0, 0.125, d / 2, { r: 0.002, ...C(p.cover) });
    k.box('cover', 'plastic-pp-white', 0.33, 0.27, 0.003, 0, 0.135, -d / 2, { r: 0.002, ...C(p.cover) });
    for (let i = 1; i < p.pockets; i++) k.box('pockets', 'plastic-pp-white', 0.325, 0.22, 0.0012, 0, 0.11, -d / 2 + (i / p.pockets) * d, { r: 0, ...C(p.cover) });
    k.box('cover', 'plastic-pp-white', 0.33, 0.003, d, 0, 0.0015, 0, { r: 0, ...C(p.cover) });
    k.box('flap', 'plastic-pp-white', 0.33, 0.1, 0.003, 0, 0.23, d / 2 + 0.002, { r: 0.002, rx: 0.05, ...C(p.cover) });
    k.box('strap', 'rubber-black', 0.006, 0.12, 0.004, 0, 0.2, d / 2 + 0.006, { r: 0 });
    return finish(k);
  },
});

const clipboard = ofp({
  id: 'ofp-clipboard', ko: '클립보드', en: 'Clipboard',
  params: [P.mat('board', '판', 'Board', 'wood-mdf-raw', 'wood'), P.bool('paper', '종이', 'Paper', true)],
  tags: ['clipboard', 'writing board', 'clip board', '클립보드', '서류판', '사무용품'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('board', p.board, 0.23, 0.004, 0.32, 0, 0.002, 0, { r: 0.006 });
    if (p.paper) sheets(k, 0.21, 0.297, 0.002, 0, 0.004, 0.006);
    k.box('clip', 'metal-chrome', 0.1, 0.008, 0.04, 0, 0.01, -0.14, { r: 0.003 });
    k.cyl('clip', 'metal-chrome', 0.005, 0.005, 0.06, 0.03, 0.016, -0.15, { rz: PI / 2, segs: 8 });
    return finish(k);
  },
});

const legalPad = ofp({
  id: 'ofp-legal-pad-pen', ko: '리갈 패드와 펜', en: 'Legal pad with pen',
  params: [P.color('paper', '종이 색', 'Paper colour', '#f7ec9c'), P.len('length', '길이', 'Length', 0.3, 0.21, 0.36)],
  tags: ['legal pad', 'notepad', 'writing pad', 'pen', '리갈 패드', '노트 패드', '메모장'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length;
    k.box('pad', 'paper', 0.215, 0.012, L, 0, 0.006, 0, { r: 0.001, ...C(p.paper) });
    k.box('binding', 'paper-cardboard', 0.217, 0.014, 0.03, 0, 0.007, -L / 2 + 0.015, { r: 0.002, ...C('#7a1f1f') });
    k.rod('pen', 'plastic-abs-gloss-black', [-0.06, 0.016, 0.05], [0.07, 0.016, -0.04], 0.005, { segs: k.seg(10, 6) });
    k.rod('pen', 'metal-chrome', [0.07, 0.016, -0.04], [0.08, 0.016, -0.047], 0.005, { r2: 0.001, segs: k.seg(10, 6) });
    return finish(k);
  },
});

const stickyCube = ofp({
  id: 'ofp-sticky-note-cube', ko: '포스트잇 큐브', en: 'Sticky note cube',
  params: [P.color('notes', '메모지 색', 'Note colour', '#f6e05e'), P.len('height', '높이', 'Height', 0.05, 0.02, 0.09)],
  tags: ['sticky notes', 'post-it', 'memo cube', '포스트잇', '메모지', '점착 메모'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height;
    const cols = [p.notes, '#f49ac2', '#8fd3f4', '#b5e48c'];
    const n = 4;
    for (let i = 0; i < n; i++) k.box('notes', 'paper', 0.076, h / n, 0.076, 0, (i + 0.5) * (h / n), 0, { r: 0, ry: i * 0.03, ...C(cols[i]) });
    k.box('notes', 'paper', 0.076, 0.001, 0.05, 0.005, h + 0.004, 0.02, { r: 0, rx: -0.25, ...C(cols[n - 1]) });
    return finish(k);
  },
});

const deskCalendar = ofp({
  id: 'ofp-desk-calendar', ko: '탁상 달력', en: 'Desk calendar',
  params: [P.color('cover', '받침 색', 'Stand colour', '#2b2b2b'), P.len('width', '폭', 'Width', 0.2, 0.14, 0.28)],
  tags: ['desk calendar', 'tent calendar', 'flip calendar', '탁상 달력', '달력', '캘린더'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = w * 0.7, a = 0.35;
    for (const s of [-1, 1]) k.box('stand', 'paper-cardboard', w, h, 0.003, 0, h / 2 * Math.cos(a), s * Math.sin(a) * h / 2, { r: 0, rx: s * a, ...C(p.cover) });
    k.box('pages', 'paper', w * 0.95, h * 0.88, 0.004, 0, h * 0.44 * Math.cos(a) + 0.004, Math.sin(a) * h * 0.44 + 0.004, { r: 0, rx: a });
    k.box('grid', 'paper-black', w * 0.8, h * 0.4, 0.001, 0, h * 0.3 * Math.cos(a) + 0.004, Math.sin(a) * h * 0.3 + 0.007, { r: 0, rx: a });
    k.add('rings', 'metal-black', T(new THREE.CylinderGeometry(0.004, 0.004, w * 0.9, 8), 0, h * Math.cos(a), 0, 0, 0, PI / 2));
    return finish(k);
  },
});

const namePlate = ofp({
  id: 'ofp-desk-name-plate', ko: '명패', en: 'Desk name plate',
  params: [P.mat('base', '받침', 'Base', 'wood-am-walnut-oil', 'wood'), P.len('width', '폭', 'Width', 0.24, 0.16, 0.32)],
  tags: ['name plate', 'desk sign', 'nameplate', '명패', '이름표', '직함 명패'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width;
    const s = new THREE.Shape([new THREE.Vector2(-0.025, 0), new THREE.Vector2(0.025, 0), new THREE.Vector2(0.008, 0.04), new THREE.Vector2(-0.008, 0.04)]);
    k.panel('base', p.base, s, w, 0, 0, 0, { ry: PI / 2, bevel: 0.002 });
    k.box('plate', 'metal-gold-brushed', w * 0.92, 0.05, 0.003, 0, 0.055, 0.005, { r: 0.001, rx: -0.25 });
    k.box('text', 'paper-black', w * 0.6, 0.012, 0.001, 0, 0.055, 0.0075, { r: 0, rx: -0.25 });
    return finish(k);
  },
});

const cardHolder = ofp({
  id: 'ofp-business-card-holder', ko: '명함 꽂이', en: 'Business card holder',
  params: [P.mat('metal', '금속', 'Metal', 'metal-ss-brushed', 'metal'), P.int('cards', '명함 수', 'Cards', 20, 0, 60)],
  tags: ['business card holder', 'card stand', '명함 꽂이', '명함 홀더', '사무용품'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('holder', p.metal, 0.1, 0.004, 0.05, 0, 0.002, 0, { r: 0.001 });
    k.box('holder', p.metal, 0.1, 0.035, 0.004, 0, 0.02, -0.024, { r: 0.001, rx: -0.25 });
    k.box('holder', p.metal, 0.1, 0.014, 0.003, 0, 0.009, 0.024, { r: 0.001 });
    if (p.cards) k.box('cards', 'paper', 0.09, 0.055, Math.max(0.002, p.cards * 0.0003), 0, 0.03, -0.012, { r: 0, rx: -0.25 });
    return finish(k);
  },
});

const stampSet = ofp({
  id: 'ofp-rubber-stamp-rack', ko: '도장 꽂이', en: 'Rubber stamp rack',
  params: [P.mat('wood', '목재', 'Wood', 'wood-beech-oil', 'wood'), P.int('stamps', '도장 수', 'Stamps', 6, 2, 10)],
  tags: ['rubber stamp', 'stamp rack', 'stamp holder', '도장', '고무인', '스탬프'],
  build: (p, ctx) => {
    const k = new Kit(ctx), n = p.stamps, w = n * 0.035 + 0.02;
    k.box('rack', p.wood, w, 0.012, 0.08, 0, 0.006, 0, { r: 0.002 });
    k.box('rack', p.wood, w, 0.07, 0.012, 0, 0.035, -0.034, { r: 0.002 });
    k.box('rack', p.wood, w, 0.01, 0.07, 0, 0.065, 0, { r: 0.002 });
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 0.035;
      k.lathe('stamps', p.wood, [[0, 0], [0.012, 0], [0.012, 0.01], [0.008, 0.03], [0.012, 0.045], [0, 0.05]], x, 0.07, 0, { segs: k.seg(12, 6) });
      k.box('rubber', 'rubber-black', 0.025, 0.006, 0.015, x, 0.062, 0, { r: 0.001 });
    }
    return finish(k);
  },
});

const dateStamp = ofp({
  id: 'ofp-date-stamp-ink-pad', ko: '날짜 도장과 스탬프 패드', en: 'Date stamp with ink pad',
  params: [P.color('pad', '패드 색', 'Pad colour', '#1f4e8c')],
  tags: ['date stamp', 'ink pad', 'self-inking', '날짜 도장', '스탬프 패드', '인주'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('pad', 'plastic-abs-gloss-black', 0.11, 0.015, 0.07, -0.04, 0.0075, 0, { r: 0.004 });
    k.box('ink', 'fabric-felt-charcoal', 0.095, 0.002, 0.058, -0.04, 0.016, 0, { r: 0, ...C(p.pad) });
    k.box('stamp', 'plastic-abs-matte-grey', 0.05, 0.04, 0.035, 0.06, 0.02, 0, { r: 0.004 });
    k.box('stamp', 'metal-chrome', 0.04, 0.02, 0.03, 0.06, 0.05, 0, { r: 0.002 });
    k.box('stamp', 'plastic-abs-gloss-black', 0.035, 0.04, 0.03, 0.06, 0.08, 0, { r: 0.012 });
    return finish(k);
  },
});

const calculator = ofp({
  id: 'ofp-desktop-calculator', ko: '탁상용 계산기', en: 'Desktop calculator',
  params: [P.color('body', '몸체 색', 'Body colour', '#3a3a3a'), P.len('length', '길이', 'Length', 0.19, 0.14, 0.24)],
  tags: ['calculator', 'desk calculator', 'solar calculator', '계산기', '전자계산기', '사무용품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, w = L * 0.75;
    k.box('body', 'plastic-abs-matte-anthracite', w, 0.025, L, 0, 0.0125, 0, { r: 0.008, rx: -0.06, ...C(p.body) });
    k.box('display', 'screen-matte-off', w * 0.8, 0.003, L * 0.18, 0, 0.03, -L * 0.33, { r: 0.001, rx: -0.06 });
    k.box('solar', 'screen-standby', w * 0.3, 0.002, L * 0.06, w * 0.2, 0.031, -L * 0.45, { r: 0, rx: -0.06 });
    keys(k, 'keys', 'plastic-abs-matte-white', 5, 6, 0, 0.026, L * 0.1, w * 0.17, w * 0.13, { o: { rx: -0.06 } });
    return finish(k);
  },
});

const printCalc = ofp({
  id: 'ofp-printing-calculator', ko: '프린트 계산기', en: 'Printing calculator',
  params: [P.color('body', '몸체 색', 'Body colour', '#d8d4cc'), P.len('roll', '용지 길이', 'Tape length', 0.12, 0.02, 0.3)],
  tags: ['printing calculator', 'adding machine', '프린트 계산기', '가산기', '사무용품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.22, d = 0.3;
    k.box('body', 'plastic-abs-matte-beige', w, 0.05, d, 0, 0.025, 0, { r: 0.012, ...C(p.body) });
    k.box('top', 'plastic-abs-matte-beige', w, 0.03, 0.08, 0, 0.06, -d / 2 + 0.04, { r: 0.01, ...C(p.body) });
    k.cyl('roll', 'paper', 0.028, 0.028, 0.06, 0.03, 0.09, -d / 2 + 0.05, { rz: PI / 2, segs: k.seg(16, 8) });
    k.box('tape', 'paper', 0.056, p.roll, 0.001, 0, 0.075 + p.roll / 2, -d / 2 + 0.07, { r: 0, rx: -0.15 });
    k.box('display', 'screen-matte-off', w * 0.6, 0.004, 0.035, 0, 0.051, -0.07, { r: 0.001 });
    keys(k, 'keys', 'plastic-abs-matte-grey', 6, 5, 0, 0.05, 0.05, 0.032, 0.025);
    return finish(k);
  },
});

const labelMaker = ofp({
  id: 'ofp-label-maker', ko: '라벨 프린터 (휴대용)', en: 'Handheld label maker',
  params: [P.color('body', '몸체 색', 'Body colour', '#e8e8e8'), P.color('accent', '포인트 색', 'Accent', '#2a5d9f')],
  tags: ['label maker', 'label printer', 'tape printer', '라벨기', '라벨 프린터', '네임 테이프'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('body', 'plastic-abs-gloss-white', 0.11, 0.06, 0.2, 0, 0.03, 0, { r: 0.02, ...C(p.body) });
    k.box('bumper', 'plastic-abs-matte-grey', 0.115, 0.03, 0.08, 0, 0.03, -0.065, { r: 0.012, ...C(p.accent) });
    k.box('display', 'screen-matte-off', 0.07, 0.003, 0.035, 0, 0.061, -0.03, { r: 0.001 });
    keys(k, 'keys', 'plastic-abs-matte-grey', 6, 5, 0, 0.058, 0.045, 0.015, 0.011);
    k.box('label', 'paper', 0.012, 0.004, 0.05, 0, 0.04, -0.12, { r: 0, ...C('#f6e05e') });
    return finish(k);
  },
});

const laminator = ofp({
  id: 'ofp-laminator', ko: '코팅기', en: 'Laminator',
  params: [P.len('width', '폭', 'Width', 0.38, 0.3, 0.55), P.color('body', '몸체 색', 'Body colour', '#f0f0f0')],
  tags: ['laminator', 'pouch laminator', '코팅기', '라미네이터', '사무 기기'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width;
    k.box('body', 'plastic-abs-gloss-white', w, 0.08, 0.14, 0, 0.04, 0, { r: 0.03, ...C(p.body) });
    k.box('slot', 'plastic-abs-matte-black', w * 0.8, 0.006, 0.01, 0, 0.055, 0.068, { r: 0.002 });
    k.box('tray', 'plastic-acrylic-smoke', w * 0.8, 0.003, 0.12, 0, 0.04, 0.12, { r: 0.002, rx: -0.15 });
    k.box('panel', 'plastic-abs-matte-grey', 0.08, 0.002, 0.04, w * 0.32, 0.08, -0.02, { r: 0.001 });
    k.box('leds', 'led-green', 0.005, 0.002, 0.005, w * 0.3, 0.082, -0.02, { r: 0 });
    return finish(k);
  },
});

const shredder = ofp({
  id: 'ofp-paper-shredder', placement: 'floor', ko: '문서 세단기', en: 'Paper shredder',
  params: [P.len('height', '높이', 'Height', 0.55, 0.4, 0.75), P.color('body', '몸체 색', 'Body colour', '#2b2b2b')],
  tags: ['shredder', 'paper shredder', 'document shredder', '세단기', '문서 세단기', '파쇄기'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height, w = 0.38, d = 0.28;
    k.box('bin', 'plastic-abs-matte-black', w, h - 0.12, d, 0, (h - 0.12) / 2, 0, { r: 0.015, ...C(p.body) });
    k.box('window', 'plastic-acrylic-smoke', w * 0.5, (h - 0.12) * 0.4, 0.004, 0, (h - 0.12) * 0.5, d / 2 + 0.001, { r: 0.004 });
    k.box('head', 'plastic-abs-gloss-black', w + 0.01, 0.12, d + 0.01, 0, h - 0.06, 0, { r: 0.02 });
    k.box('slot', 'rubber-black', w * 0.7, 0.003, 0.012, 0, h + 0.0005, 0.02, { r: 0 });
    k.box('leds', 'led-green', 0.008, 0.003, 0.008, w * 0.35, h, -0.08, { r: 0 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('casters', 'plastic-black', 0.018, 0.018, 0.02, sx * (w / 2 - 0.04), 0, sz * (d / 2 - 0.04), { segs: 8 });
    return finish(k);
  },
});

const deskShredder = ofp({
  id: 'ofp-basket-shredder', placement: 'floor', ko: '휴지통형 세단기', en: 'Basket shredder',
  params: [P.mat('mesh', '바스켓', 'Basket', 'metal-black-mesh', 'metal')],
  tags: ['shredder', 'basket shredder', 'personal shredder', '세단기', '소형 세단기', '파쇄기'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.32, d = 0.2, h = 0.3;
    k.box('basket', p.mesh, w, h, d, 0, h / 2, 0, { r: 0.01 });
    k.box('basket', 'metal-black', w, 0.01, d, 0, 0.005, 0, { r: 0.002 });
    k.box('head', 'plastic-abs-gloss-black', w + 0.02, 0.07, d + 0.02, 0, h + 0.035, 0, { r: 0.01 });
    k.box('slot', 'rubber-black', w * 0.7, 0.002, 0.01, 0, h + 0.071, 0, { r: 0 });
    sheets(k, w * 0.9, d * 0.9, 0.1, 0, 0.01, 0, 0, 'paper-recycled');
    return finish(k);
  },
});

const guillotine = ofp({
  id: 'ofp-paper-guillotine', ko: '재단기 (작두형)', en: 'Paper guillotine',
  params: [P.len('size', '크기', 'Size', 0.4, 0.3, 0.6), P.bool('open', '칼날 올림', 'Blade up', true)],
  tags: ['paper cutter', 'guillotine', 'trimmer', '재단기', '종이 재단기', '작두'],
  build: (p, ctx) => {
    const k = new Kit(ctx), s = p.size;
    k.box('base', 'wood-melamine-white', s, 0.02, s * 0.8, 0, 0.01, 0, { r: 0.003 });
    k.box('grid', 'paper-black', s * 0.85, 0.001, s * 0.7, -0.01, 0.0205, 0, { r: 0 });
    k.box('base', 'metal-al-brushed', 0.012, 0.025, s * 0.8, -s / 2 + 0.006, 0.0225, 0, { r: 0.001 });
    k.box('base', 'metal-al-brushed', s, 0.02, 0.012, 0, 0.02, -s * 0.4 + 0.006, { r: 0.001 });
    const a = p.open ? 0.6 : 0.02;
    k.box('blade', 'metal-steel', 0.02, 0.008, s * 0.9, s / 2 - 0.02, 0.03 + Math.sin(a) * s * 0.44, s * 0.4 - Math.cos(a) * s * 0.44, { r: 0.002, rx: a });
    k.rod('handle', 'plastic-abs-gloss-black', [s / 2 - 0.02, 0.03 + Math.sin(a) * s * 0.88, s * 0.4 - Math.cos(a) * s * 0.88], [s / 2 - 0.02, 0.03 + Math.sin(a) * s * 0.88 + 0.06, s * 0.4 - Math.cos(a) * s * 0.88], 0.012, { segs: 10 });
    return finish(k);
  },
});

const rotaryTrimmer = ofp({
  id: 'ofp-rotary-trimmer', ko: '슬라이드 재단기', en: 'Rotary paper trimmer',
  params: [P.len('length', '길이', 'Length', 0.46, 0.3, 0.7), P.color('rail', '레일 색', 'Rail colour', '#2a5d9f')],
  tags: ['rotary trimmer', 'paper trimmer', 'slide cutter', '슬라이드 재단기', '종이 커터', '재단기'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length;
    k.box('base', 'plastic-abs-matte-grey', L, 0.018, 0.3, 0, 0.009, 0, { r: 0.006 });
    k.box('grid', 'paper', L * 0.9, 0.001, 0.22, -0.01, 0.0185, -0.02, { r: 0 });
    k.box('rail', 'metal-al-anodised-blue', L, 0.022, 0.03, 0, 0.029, 0.12, { r: 0.004, ...C(p.rail) });
    k.box('cutter', 'plastic-abs-gloss-black', 0.05, 0.04, 0.04, L * 0.15, 0.06, 0.12, { r: 0.012 });
    return finish(k);
  },
});

const binding = ofp({
  id: 'ofp-comb-binding-machine', ko: '제본기', en: 'Comb binding machine',
  params: [P.color('body', '몸체 색', 'Body colour', '#e8e8e8'), P.bool('lever', '레버', 'Lever up', true)],
  tags: ['binding machine', 'comb binder', 'binder', '제본기', '링 제본기', '사무 기기'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.45, d = 0.3;
    k.box('body', 'plastic-abs-gloss-white', w, 0.1, d, 0, 0.05, 0, { r: 0.015, ...C(p.body) });
    k.box('top', 'plastic-abs-matte-grey', w * 0.9, 0.012, d * 0.5, 0, 0.106, 0.04, { r: 0.004 });
    k.box('comb', 'plastic-pp-black', w * 0.6, 0.02, 0.02, 0, 0.12, -0.08, { r: 0.008 });
    const a = p.lever ? 0.8 : 0.1;
    k.rod('lever', 'metal-chrome', [w / 2 + 0.01, 0.06, 0], [w / 2 + 0.01, 0.06 + Math.sin(a) * 0.2, Math.cos(a) * 0.2], 0.007, { segs: 8 });
    k.sphere('lever', 'plastic-abs-gloss-black', 0.016, w / 2 + 0.01, 0.06 + Math.sin(a) * 0.2, Math.cos(a) * 0.2, { segs: 10, rings: 8 });
    return finish(k);
  },
});

const paperReams = ofp({
  id: 'ofp-copy-paper-reams', ko: '복사 용지 묶음', en: 'Copy paper reams',
  params: [P.int('reams', '묶음 수', 'Reams', 3, 1, 8), P.color('wrap', '포장 색', 'Wrapper colour', '#e8edf5')],
  tags: ['copy paper', 'paper ream', 'A4 paper', 'printer paper', '복사 용지', 'A4 용지', '프린터 용지'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    for (let i = 0; i < p.reams; i++) {
      const y = i * 0.052, ry = ((i * 37) % 7 - 3) * 0.02;
      k.box('reams', 'paper-glossy', 0.215, 0.05, 0.3, 0, y + 0.025, 0, { r: 0.004, ry, ...C(p.wrap) });
      k.box('bands', 'paper-glossy', 0.216, 0.03, 0.06, 0, y + 0.025, 0.06, { r: 0.004, ry, ...C('#2a5d9f') });
    }
    return finish(k);
  },
});

const paperCarton = ofp({
  id: 'ofp-paper-carton', placement: 'floor', ko: '복사 용지 박스', en: 'Copy paper carton',
  params: [P.int('stack', '쌓은 수', 'Stacked', 1, 1, 4), P.bool('open', '열림', 'Open', false)],
  tags: ['paper box', 'paper carton', 'A4 box', '복사 용지 박스', 'A4 박스', '용지 상자'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.44, d = 0.31, h = 0.26;
    for (let i = 0; i < p.stack; i++) {
      const y = i * h, last = i === p.stack - 1;
      k.box('boxes', 'paper-cardboard', w, h - 0.002, d, 0, y + h / 2, 0, { r: 0.003, ry: (i % 2) * 0.03 });
      k.box('print', 'paper', 0.2, 0.08, 0.002, 0, y + h * 0.55, d / 2 + 0.001, { r: 0, ry: (i % 2) * 0.03, ...C('#2a5d9f') });
      if (last && p.open) for (let j = 0; j < 5; j++) k.box('reams', 'paper-glossy', 0.21, 0.05, 0.29, 0.1 * (j % 2 ? 1 : -1), y + h + 0.025 - (j > 1 ? 0.05 : 0), 0, { r: 0.003 });
    }
    return finish(k);
  },
});

const envelopes = ofp({
  id: 'ofp-envelope-stack', ko: '서류 봉투 묶음', en: 'Envelope stack',
  params: [P.mat('paper', '종이', 'Paper', 'paper-kraft', 'paper'), P.int('count', '장 수', 'Count', 20, 1, 60)],
  tags: ['envelopes', 'manila envelope', 'document envelope', '서류 봉투', '봉투', '우편'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = Math.max(0.002, p.count * 0.0012);
    k.box('envelopes', p.paper, 0.25, h, 0.34, 0, h / 2, 0, { r: 0.001 });
    k.box('flap', p.paper, 0.25, 0.001, 0.05, 0, h + 0.0005, -0.14, { r: 0, ...C('#c8a87a') });
    k.cyl('clasp', 'metal-brass', 0.006, 0.006, 0.002, 0, h, -0.12, { segs: 8 });
    return finish(k);
  },
});

const mailSorter = ofp({
  id: 'ofp-mail-sorter', placement: 'floor', ko: '우편물 분류함', en: 'Mail sorter',
  params: [P.int('cols', '열', 'Columns', 6, 3, 10), P.int('rows', '행', 'Rows', 6, 3, 10)],
  tags: ['mail sorter', 'pigeonhole', 'mailroom', 'literature sorter', '우편물 분류함', '분류함', '편지함'],
  build: (p, ctx) => {
    const k = new Kit(ctx), cw = 0.25, ch = 0.11, d = 0.32, t = 0.012, w = p.cols * cw + t, hh = p.rows * ch + t, base = 0.75;
    k.box('base', 'wood-melamine-light-grey', w, base, d, 0, base / 2, 0, { r: 0.003 });
    for (let c = 0; c <= p.cols; c++) k.box('frame', 'wood-melamine-white', t, hh, d, -w / 2 + t / 2 + c * cw, base + hh / 2, 0, { r: 0.001 });
    for (let r = 0; r <= p.rows; r++) k.box('frame', 'wood-melamine-white', w, t, d, 0, base + t / 2 + r * ch, 0, { r: 0.001 });
    k.box('frame', 'wood-melamine-white', w, hh, t, 0, base + hh / 2, -d / 2 + t / 2, { r: 0 });
    for (let c = 0; c < p.cols; c++) for (let r = 0; r < p.rows; r++) if ((c * 3 + r * 5) % 4 === 0) sheets(k, cw * 0.8, d * 0.8, 0.012, -w / 2 + t + c * cw + cw / 2 - t / 2, base + t + r * ch, 0.01, 0, 'paper-kraft');
    return finish(k);
  },
});

const pencilSharpener = ofp({
  id: 'ofp-electric-pencil-sharpener', ko: '전동 연필깎이', en: 'Electric pencil sharpener',
  params: [P.color('body', '몸체 색', 'Body colour', '#2b2b2b')],
  tags: ['pencil sharpener', 'electric sharpener', '연필깎이', '전동 연필깎이', '사무용품'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('body', 'plastic-abs-gloss-black', 0.09, 0.12, 0.12, 0, 0.06, 0, { r: 0.02, ...C(p.body) });
    k.box('bin', 'plastic-acrylic-smoke', 0.08, 0.04, 0.11, 0, 0.022, 0.005, { r: 0.01 });
    k.cyl('hole', 'metal-chrome', 0.008, 0.008, 0.004, 0, 0.085, 0.06, { rx: PI / 2, segs: 10 });
    return finish(k);
  },
});

const tallyCounter = ofp({
  id: 'ofp-hand-tally-counter', ko: '계수기', en: 'Hand tally counter',
  params: [P.mat('metal', '금속', 'Metal', 'metal-chrome', 'metal')],
  tags: ['tally counter', 'clicker', 'counter', '계수기', '카운터', '숫자 세기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.cyl('body', p.metal, 0.024, 0.024, 0.02, 0, 0, 0, { rx: PI / 2, segs: k.seg(20, 8) });
    k.box('window', 'paper-black', 0.026, 0.008, 0.002, 0, 0.0, 0.0105, { r: 0 });
    k.cyl('button', p.metal, 0.006, 0.006, 0.012, 0.01, 0.022, 0, { segs: 8 });
    k.add('ring', p.metal, T(new THREE.TorusGeometry(0.012, 0.002, 6, 14), -0.02, -0.02, 0));
    return finish(k);
  },
});

const bookends = ofp({
  id: 'ofp-metal-bookends', ko: '북엔드와 책', en: 'Metal bookends with books',
  params: [P.mat('metal', '금속', 'Metal', 'metal-pc-black-matte', 'metal'), P.int('books', '책 수', 'Books', 8, 2, 16)],
  tags: ['bookends', 'book stand', 'manuals', '북엔드', '책꽂이', '매뉴얼'],
  build: (p, ctx) => {
    const k = new Kit(ctx), n = p.books;
    let x = 0;
    const xs = [];
    for (let i = 0; i < n; i++) { const t = 0.02 + ((i * 7) % 4) * 0.008; xs.push([x + t / 2, t]); x += t + 0.001; }
    const off = x / 2;
    xs.forEach(([cx, t], i) => {
      const h = 0.21 + ((i * 5) % 3) * 0.025;
      k.box('books', 'book-cream', t, h, 0.15 + ((i * 3) % 2) * 0.02, cx - off, h / 2, 0, { r: 0.002, ...C(BINDER_COLS[(i * 3) % BINDER_COLS.length]) });
    });
    for (const s of [-1, 1]) {
      k.box('ends', p.metal, 0.003, 0.17, 0.12, s * (off + 0.002), 0.085, 0, { r: 0.001 });
      k.box('ends', p.metal, 0.12, 0.003, 0.12, s * (off - 0.06), 0.0015, 0, { r: 0.001 });
    }
    return finish(k);
  },
});

const deskPad = ofp({
  id: 'ofp-leather-desk-pad', ko: '가죽 데스크 패드', en: 'Leather desk pad',
  params: [P.mat('leather', '가죽', 'Leather', 'leather-black', 'leather'), P.len('width', '폭', 'Width', 0.8, 0.5, 1.2)],
  tags: ['desk pad', 'desk mat', 'blotter', 'leather pad', '데스크 패드', '데스크 매트', '책상 매트'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, d = w * 0.5;
    k.box('pad', p.leather, w, 0.003, d, 0, 0.0015, 0, { r: 0.0012 });
    k.box('rail', p.leather, w, 0.008, 0.06, 0, 0.004, -d / 2 + 0.03, { r: 0.003 });
    return finish(k);
  },
});

const wristRest = ofp({
  id: 'ofp-gel-wrist-rest-set', ko: '손목 받침 세트', en: 'Gel wrist rest set',
  params: [P.color('gel', '색', 'Colour', '#2b2b2b'), P.len('length', '길이', 'Length', 0.44, 0.3, 0.46)],
  tags: ['wrist rest', 'gel pad', 'ergonomic', 'mouse pad', '손목 받침', '손목 패드', '인체공학'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length;
    k.soft('rest', 'fabric-felt-charcoal', L, 0.02, 0.08, 0.01, -0.1, 0.01, 0, { puff: 0.004, ...C(p.gel) });
    k.box('pad', 'fabric-felt-charcoal', 0.22, 0.003, 0.2, L / 2 + 0.04, 0.0015, 0, { r: 0.01, ...C(p.gel) });
    k.soft('rest', 'fabric-felt-charcoal', 0.1, 0.018, 0.06, 0.01, L / 2 + 0.04, 0.012, 0.07, { puff: 0.004, ...C(p.gel) });
    return finish(k);
  },
});

const footrest = ofp({
  id: 'ofp-adjustable-footrest', placement: 'floor', ko: '발 받침대', en: 'Adjustable footrest',
  params: [P.num('tilt', '기울기', 'Tilt', 0.25, 0, 0.5, 0.01), P.color('top', '상판 색', 'Top colour', '#2b2b2b')],
  tags: ['footrest', 'foot rest', 'ergonomic', '발 받침대', '발판', '인체공학'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.45, d = 0.35, a = p.tilt;
    k.box('base', 'plastic-abs-matte-black', w * 0.9, 0.025, d * 0.9, 0, 0.0125, 0, { r: 0.006 });
    k.box('top', 'plastic-abs-matte-black', w, 0.02, d, 0, 0.06 + Math.sin(a) * d / 2, 0, { r: 0.006, rx: a, ...C(p.top) });
    k.box('ribs', 'rubber-black', w * 0.9, 0.004, 0.012, 0, 0.072 + Math.sin(a) * d / 2, 0.05, { r: 0.002, rx: a });
    k.box('hinge', 'plastic-abs-matte-grey', w * 0.5, 0.05, 0.03, 0, 0.045, 0, { r: 0.004 });
    return finish(k);
  },
});

const cableTray = ofp({
  id: 'ofp-under-desk-cable-tray', placement: 'floor', ko: '책상 아래 케이블 트레이', en: 'Under-desk cable tray',
  params: [P.len('length', '길이', 'Length', 0.8, 0.5, 1.4), P.mat('metal', '금속', 'Metal', 'metal-pc-black-perforated', 'metal')],
  tags: ['cable tray', 'cable management', 'wire basket', '케이블 트레이', '선 정리', '배선 정리'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length;
    k.box('tray', p.metal, L, 0.003, 0.13, 0, 0.0015, 0, { r: 0 });
    k.box('tray', p.metal, L, 0.1, 0.003, 0, 0.05, 0.065, { r: 0 });
    k.box('tray', p.metal, L, 0.12, 0.003, 0, 0.06, -0.065, { r: 0 });
    k.box('strip', 'plastic-abs-gloss-white', L * 0.5, 0.04, 0.05, -L * 0.15, 0.023, 0, { r: 0.006 });
    for (let i = 0; i < 4; i++) k.box('plugs', 'plastic-abs-matte-black', 0.035, 0.03, 0.04, -L * 0.35 + i * 0.07, 0.058, 0, { r: 0.004 });
    k.tube('cables', 'rubber-black', [[-L * 0.4, 0.06, 0.01], [-L * 0.1, 0.03, 0.03], [L * 0.3, 0.02, 0.01], [L * 0.45, 0.1, -0.02]], 0.004);
    return finish(k);
  },
});

const powerStrip = ofp({
  id: 'ofp-desk-power-module', ko: '책상용 전원 모듈', en: 'Desk power module',
  params: [P.int('sockets', '콘센트 수', 'Sockets', 3, 1, 6), P.bool('usb', 'USB', 'USB ports', true)],
  tags: ['power module', 'desk socket', 'power strip', 'usb charger', '전원 모듈', '멀티탭', '데스크 콘센트'],
  build: (p, ctx) => {
    const k = new Kit(ctx), n = p.sockets + (p.usb ? 1 : 0), w = n * 0.065 + 0.04;
    k.box('body', 'metal-al-anodised-clear', w, 0.07, 0.07, 0, 0.035, 0, { r: 0.01, rx: 0 });
    for (let i = 0; i < p.sockets; i++) {
      const x = -w / 2 + 0.05 + i * 0.065;
      k.cyl('sockets', 'plastic-abs-matte-black', 0.022, 0.022, 0.004, x, 0.07, 0, { segs: k.seg(16, 8) });
    }
    if (p.usb) for (const dz of [-0.012, 0.012]) k.box('usb', 'plastic-abs-matte-black', 0.014, 0.004, 0.006, w / 2 - 0.04, 0.07, dz, { r: 0 });
    k.box('switch', 'plastic-abs-gloss-red', 0.012, 0.004, 0.02, -w / 2 + 0.015, 0.07, 0, { r: 0.001 });
    return finish(k);
  },
});

const privacyScreen = ofp({
  id: 'ofp-desk-privacy-screen', ko: '책상 칸막이 (패브릭)', en: 'Desk privacy screen',
  params: [P.mat('fabric', '패브릭', 'Fabric', 'felt-acoustic-grey', 'fabric'), P.len('width', '폭', 'Width', 1.2, 0.6, 1.8), P.len('height', '높이', 'Height', 0.45, 0.3, 0.65)],
  tags: ['desk screen', 'privacy panel', 'desk divider', 'acoustic', '책상 칸막이', '파티션', '흡음 패널'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = p.height;
    k.soft('panel', p.fabric, w, h, 0.025, 0.008, 0, 0.03 + h / 2, 0, { flat: 3 });
    for (const s of [-1, 1]) {
      k.box('clamps', 'metal-pc-light-grey', 0.04, 0.08, 0.06, s * w * 0.35, 0.04, 0, { r: 0.004 });
      k.box('clamps', 'metal-pc-light-grey', 0.04, 0.008, 0.08, s * w * 0.35, 0.004, 0.0, { r: 0.002 });
    }
    return finish(k);
  },
});

const acrylicDivider = ofp({
  id: 'ofp-acrylic-sneeze-guard', ko: '아크릴 가림막', en: 'Acrylic desk shield',
  params: [P.len('width', '폭', 'Width', 0.8, 0.4, 1.4), P.len('height', '높이', 'Height', 0.6, 0.4, 0.9), P.bool('pass', '전달 구멍', 'Pass-through', true)],
  tags: ['sneeze guard', 'acrylic shield', 'desk partition', 'plexiglass', '아크릴 가림막', '칸막이', '비말 차단'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = p.height;
    const s = p.pass ? new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(-0.15, 0), new THREE.Vector2(-0.15, 0.1), new THREE.Vector2(0.15, 0.1), new THREE.Vector2(0.15, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(w / 2, h), new THREE.Vector2(-w / 2, h)]) : roundRect(w, h, 0.01);
    k.panel('glass', 'plastic-acrylic-clear', s, 0.005, 0, p.pass ? 0.02 : 0.02 + h / 2, 0, { bevel: 0.001 });
    for (const sx of [-1, 1]) k.box('feet', 'plastic-acrylic-clear', 0.08, 0.02, 0.2, sx * (w / 2 - 0.08), 0.01, 0, { r: 0.004 });
    return finish(k);
  },
});

const trashBin = ofp({
  id: 'ofp-office-waste-bin', placement: 'floor', ko: '사무실 휴지통', en: 'Office waste bin',
  params: [P.mat('bin', '재질', 'Material', 'metal-black-mesh', 'metal'), P.len('height', '높이', 'Height', 0.32, 0.25, 0.45)],
  tags: ['waste bin', 'trash can', 'wastepaper basket', '휴지통', '쓰레기통', '사무실 휴지통'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height, r = h * 0.4;
    k.cyl('bin', p.bin, r, r * 0.85, h, 0, 0, 0, { open: true, segs: k.seg(28, 10) });
    k.cyl('bin', 'metal-black', r * 0.85, r * 0.85, 0.005, 0, 0, 0, { segs: k.seg(28, 10) });
    k.add('rim', 'metal-black', T(new THREE.TorusGeometry(r, 0.004, 6, k.seg(28, 10)), 0, h, 0, PI / 2));
    sheets(k, r * 0.9, r * 0.6, 0.04, 0, 0.005, 0, 0.3, 'paper-recycled');
    return finish(k);
  },
});

const recyclingTrio = ofp({
  id: 'ofp-recycling-bins-trio', placement: 'floor', ko: '분리수거함 (3구)', en: 'Recycling bins (3)',
  params: [P.len('height', '높이', 'Height', 0.75, 0.55, 0.95), P.int('bins', '칸 수', 'Bins', 3, 2, 4)],
  tags: ['recycling bin', 'sorting bin', 'waste station', '분리수거함', '재활용 수거함', '휴지통'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height, bw = 0.3, d = 0.4;
    const cols = ['#2a5d9f', '#e0b020', '#2f7a46', '#8a8a8a'];
    for (let i = 0; i < p.bins; i++) {
      const x = (i - (p.bins - 1) / 2) * (bw + 0.01);
      k.box('bins', 'metal-pc-light-grey', bw, h - 0.04, d, x, (h - 0.04) / 2, 0, { r: 0.01 });
      k.box('lids', 'plastic-pp-white', bw + 0.01, 0.04, d + 0.01, x, h - 0.02, 0, { r: 0.008, ...C(cols[i]) });
      k.box('slots', 'plastic-black', bw * 0.6, 0.002, 0.08, x, h + 0.0005, 0.06, { r: 0 });
      k.box('labels', 'paper', bw * 0.6, 0.1, 0.002, x, h * 0.75, d / 2 + 0.001, { r: 0, ...C(cols[i]) });
    }
    return finish(k);
  },
});

const suggestionBox = ofp({
  id: 'ofp-suggestion-box', placement: 'wall', elevation: 1.1, ko: '건의함', en: 'Suggestion box',
  params: [P.mat('body', '재질', 'Material', 'plastic-acrylic-clear', 'plastic'), P.bool('lock', '자물쇠', 'Lock', true)],
  tags: ['suggestion box', 'comment box', 'ballot box', '건의함', '의견함', '투표함'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.25, h = 0.32, d = 0.15;
    k.box('box', p.body, w, h, d, 0, h / 2, 0, { r: 0.004 });
    k.box('slot', 'plastic-black', w * 0.5, 0.004, 0.012, 0, h + 0.001, 0.02, { r: 0 });
    k.box('header', 'plastic-acrylic-white', w * 0.85, 0.06, 0.004, 0, h * 0.8, d / 2 + 0.003, { r: 0.002 });
    sheets(k, w * 0.8, d * 0.8, 0.05, 0, 0.004, 0, 0, 'paper');
    if (p.lock) k.box('lock', 'metal-brass', 0.02, 0.025, 0.008, 0, h * 0.5, d / 2 + 0.004, { r: 0.002 });
    return finish(k);
  },
});

const receptionBell = ofp({
  id: 'ofp-reception-bell', ko: '호출 벨', en: 'Reception bell',
  params: [P.mat('dome', '돔', 'Dome', 'metal-chrome', 'metal')],
  tags: ['service bell', 'reception bell', 'counter bell', '호출 벨', '탁상 벨', '리셉션'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.cyl('base', 'wood-am-walnut-oil', 0.045, 0.048, 0.015, 0, 0, 0, { segs: k.seg(24, 8) });
    k.sphere('dome', p.dome, 0.04, 0, 0.015, 0, { thetaLength: PI / 2, segs: k.seg(24, 8), rings: k.seg(10, 4) });
    k.cyl('dome', p.dome, 0.003, 0.003, 0.012, 0, 0.055, 0, { segs: 6 });
    k.sphere('dome', p.dome, 0.006, 0, 0.069, 0, { segs: 10, rings: 6 });
    return finish(k);
  },
});

const queueTicket = ofp({
  id: 'ofp-queue-ticket-dispenser', placement: 'floor', ko: '번호표 발급기', en: 'Queue ticket dispenser',
  params: [P.color('body', '몸체 색', 'Body colour', '#c0392b'), P.len('height', '높이', 'Height', 1.2, 1.0, 1.5)],
  tags: ['queue ticket', 'take a number', 'ticket dispenser', '번호표', '번호표 발급기', '대기표'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height;
    k.cyl('base', 'metal-chrome', 0.18, 0.2, 0.02, 0, 0, 0, { segs: k.seg(28, 10) });
    k.cyl('post', 'metal-chrome', 0.025, 0.025, h - 0.25, 0, 0.02, 0, { segs: k.seg(14, 6) });
    k.box('head', 'plastic-abs-gloss-red', 0.2, 0.25, 0.14, 0, h - 0.125, 0, { r: 0.04, ...C(p.body) });
    k.box('display', 'screen-matte-off', 0.14, 0.05, 0.004, 0, h - 0.06, 0.071, { r: 0.002 });
    k.box('ticket', 'paper', 0.04, 0.003, 0.05, 0, h - 0.18, 0.09, { r: 0, rx: 0.2 });
    return finish(k);
  },
});

const stanchion = ofp({
  id: 'ofp-belt-stanchion-pair', placement: 'floor', ko: '차단봉 (벨트형) 2개', en: 'Belt stanchions (pair)',
  params: [P.len('span', '간격', 'Span', 1.5, 0.8, 2.5), P.color('belt', '벨트 색', 'Belt colour', '#1f3a6e'), P.mat('post', '기둥', 'Post', 'metal-ss-polished', 'metal')],
  tags: ['stanchion', 'queue barrier', 'retractable belt', '차단봉', '안내봉', '줄서기 벨트'],
  build: (p, ctx) => {
    const k = new Kit(ctx), s = p.span;
    for (const x of [-s / 2, s / 2]) {
      k.cyl('base', p.post, 0.16, 0.17, 0.03, x, 0, 0, { segs: k.seg(28, 10) });
      k.cyl('post', p.post, 0.032, 0.032, 0.9, x, 0.03, 0, { segs: k.seg(16, 6) });
      k.cyl('post', p.post, 0.04, 0.04, 0.05, x, 0.9, 0, { segs: k.seg(16, 6) });
    }
    k.box('belt', 'fabric-canvas-navy', s - 0.06, 0.05, 0.002, 0, 0.88, 0, { r: 0, ...C(p.belt) });
    return finish(k);
  },
});

const aSign = ofp({
  id: 'ofp-a-frame-sign', placement: 'floor', ko: 'A형 입간판', en: 'A-frame sign board',
  params: [P.mat('frame', '틀', 'Frame', 'wood-oak', 'wood'), P.len('height', '높이', 'Height', 0.9, 0.6, 1.2)],
  tags: ['a-frame sign', 'sandwich board', 'chalkboard sign', '입간판', 'A형 간판', '안내판'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height, w = h * 0.6, a = 0.2;
    for (const s of [-1, 1]) {
      const z = s * Math.sin(a) * h / 2, y = Math.cos(a) * h / 2;
      k.panel('frame', p.frame, frameShape(w, h, 0.04), 0.025, 0, y, z, { rx: s * a });
      k.box('board', 'paint-black-matte', w - 0.08, h - 0.08, 0.008, 0, y, z, { r: 0, rx: s * a });
    }
    k.rod('chain', 'metal-steel', [-w * 0.3, h * 0.3, -Math.sin(a) * h * 0.2], [-w * 0.3, h * 0.3, Math.sin(a) * h * 0.2], 0.003, { segs: 6 });
    return finish(k);
  },
});

const wetFloor = ofp({
  id: 'ofp-wet-floor-sign', placement: 'floor', ko: '미끄럼 주의 표지판', en: 'Wet floor sign',
  params: [P.color('body', '색', 'Colour', '#f2c200'), P.len('height', '높이', 'Height', 0.62, 0.5, 0.9)],
  tags: ['wet floor sign', 'caution sign', 'safety sign', '미끄럼 주의', '주의 표지판', '안전 표지'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height, w = 0.3, a = 0.18;
    for (const s of [-1, 1]) {
      const shape = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(w * 0.35, h), new THREE.Vector2(-w * 0.35, h)]);
      k.panel('panels', 'plastic-pp-mustard', shape, 0.006, 0, 0, s * Math.sin(a) * h / 2, { rx: s * a, bevel: 0.002, ...C(p.body) });
      k.box('icon', 'paper-black', w * 0.35, w * 0.35, 0.002, 0, h * 0.5, s * (Math.sin(a) * h * 0.5 + 0.005), { r: 0, rx: s * a, rz: PI / 4 });
    }
    k.rod('handle', 'plastic-pp-mustard', [0, h, -0.02], [0, h + 0.05, 0], 0.012, { segs: 8, ...C(p.body) });
    return finish(k);
  },
});

export const ITEMS = [
  stapler, heavyStapler, stapleRemover, holePunch, tapeDispenser, scissors, clipHolder, penCup, deskOrganizer, letterTray,
  fileSorter, magazineFile, binderRow, binderSingle, archiveBox, expandingFile, clipboard, legalPad, stickyCube, deskCalendar,
  namePlate, cardHolder, stampSet, dateStamp, calculator, printCalc, labelMaker, laminator, shredder, deskShredder,
  guillotine, rotaryTrimmer, binding, paperReams, paperCarton, envelopes, mailSorter, pencilSharpener, tallyCounter, bookends,
  deskPad, wristRest, footrest, cableTray, powerStrip, privacyScreen, acrylicDivider, trashBin, recyclingTrio, suggestionBox,
  receptionBell, queueTicket, stanchion, aSign, wetFloor,
];
