// Stencils: the master shapes a diagram is drawn with, in categories like
// Microsoft Visio's (Basic, Arrows, Flowchart, Callouts, Containers, UML,
// Database, BPMN, Network, Org chart, Mind map, Floor plan, Blocks, Timeline,
// Electrical). A master gives
//   w, h       default size (px at 96 dpi)
//   geometry   (w, h, params, rounding) → parts [{ d, fill }] in the shape's own
//              coordinates. fill: 'main' (shape fill + line), 'none' (line only),
//              'dark' / 'light' (shade of the fill), 'stroke' (filled with the line colour)
//   points     connection points, normalized [x, y] (0…1 of the box)
//   text       text box, normalized [left, top, right, bottom] (may lie outside the shape)
//   params     control handles (the yellow diamonds): { key: { def, handle(w,h,v) → [x,y], from(w,h,x,y) → v } }
//   style      default style (overrides the theme), qs = default quick-style variant
//   aspect     keep the width / height ratio when resizing
//   compartments  text split by "---" lines into header + sections (UML class, entity)
// Pure data and functions — no DOM — so the renderer, export and tests share them.
import { clamp, ellipsePath, polyPath, regularPoints, roundRectPath } from './geometry.js';
import { scalePath } from './path.js';

const main = (d) => ({ d, fill: 'main' });
const line = (d) => ({ d, fill: 'none' });
const dark = (d) => ({ d, fill: 'dark' });
const light = (d) => ({ d, fill: 'light' });
const solid = (d) => ({ d, fill: 'stroke' });
const poly = (pts, r = 0, closed = true) => polyPath(pts, { closed, radius: r });
const rect = (x, y, w, h, r = 0) => roundRectPath(x, y, w, h, r);
const ell = (x, y, w, h) => ellipsePath(x, y, w, h);
const circle = (cx, cy, rr) => ellipsePath(cx - rr, cy - rr, rr * 2, rr * 2);
const f = (v) => Number(v.toFixed(2));
const M = (...xy) => `M${f(xy[0])} ${f(xy[1])}`;
const L = (...xy) => `L${f(xy[0])} ${f(xy[1])}`;

export const SIDES = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];
const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]];
const SIDES_AND_CORNERS = [...SIDES, ...CORNERS];
const ENDS = [[0, 0.5], [1, 0.5]];
const BELOW = [-0.6, 1.04, 1.6, 1.62];

// ───────────────────────── control handles

const pRound = (def = 0.12) => ({ r: { def, handle: (w, h, v) => [v * Math.min(w, h), 0], from: (w, h, x) => clamp(x / Math.min(w, h), 0, 0.5) } });
const pX = (key, def, max = 0.5, y = 0) => ({ [key]: { def, handle: (w, h, v) => [v * w, y * h], from: (w, h, x) => clamp(x / w, 0, max) } });
const pY = (key, def, max = 0.5, x = 0.5) => ({ [key]: { def, handle: (w, h, v) => [x * w, v * h], from: (w, h, x2, y) => clamp(y / h, 0, max) } });
const pArrow = (head = 0.35, shaft = 0.5) => ({
  head: { def: head, handle: (w, h, v) => [w - v * w, 0], from: (w, h, x) => clamp((w - x) / w, 0.05, 0.95) },
  shaft: { def: shaft, handle: (w, h, v, p) => [w - (p.head ?? head) * w, h / 2 - (v * h) / 2], from: (w, h, x, y) => clamp(1 - (2 * y) / h, 0.05, 1) },
});
const pTail = (tx, ty) => ({ tail: { def: [tx, ty], handle: (w, h, v) => [v[0] * w, v[1] * h], from: (w, h, x, y) => [x / w, y / h] } });
const pStar = (def) => ({ inner: { def, handle: (w, h, v) => [w / 2, h / 2 - (v * h) / 2], from: (w, h, x, y) => clamp((h / 2 - y) / (h / 2), 0.1, 0.95) } });

// ───────────────────────── reusable geometries

const docPath = (x, y, w, h) => `${M(x, y)}H${f(x + w)}V${f(y + h * 0.86)}C${f(x + w * 0.75)} ${f(y + h * 0.7)} ${f(x + w * 0.5)} ${f(y + h * 1.08)} ${f(x + w * 0.25)} ${f(y + h * 0.97)}C${f(x + w * 0.12)} ${f(y + h * 0.92)} ${f(x)} ${f(y + h * 0.88)} ${f(x)} ${f(y + h * 0.86)}Z`;

const G = {
  rect: (w, h, p, r) => [main(rect(0, 0, w, h, r))],
  roundRect: (w, h, p) => [main(rect(0, 0, w, h, (p.r ?? 0.12) * Math.min(w, h)))],
  ellipse: (w, h) => [main(ell(0, 0, w, h))],
  polygon: (sides) => (w, h, p, r) => [main(poly(regularPoints(w, h, sides), r))],
  star: (points) => (w, h, p, r) => [main(poly(regularPoints(w, h, points, { inner: p.inner ?? 0.45 }), r))],
  diamond: (w, h, p, r) => [main(poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]], r))],
  cylinder: (w, h, p) => {
    const c = (p.cap ?? 0.12) * h;
    return [main(`${M(0, c / 2)}A${f(w / 2)} ${f(c / 2)} 0 0 1 ${f(w)} ${f(c / 2)}V${f(h - c / 2)}A${f(w / 2)} ${f(c / 2)} 0 0 1 0 ${f(h - c / 2)}Z`), line(`${M(0, c / 2)}A${f(w / 2)} ${f(c / 2)} 0 0 0 ${f(w)} ${f(c / 2)}`)];
  },
  hCylinder: (w, h, p) => {
    const c = (p.cap ?? 0.12) * w;
    return [main(`${M(c / 2, 0)}H${f(w - c / 2)}A${f(c / 2)} ${f(h / 2)} 0 0 1 ${f(w - c / 2)} ${f(h)}H${f(c / 2)}A${f(c / 2)} ${f(h / 2)} 0 0 1 ${f(c / 2)} 0Z`), line(`${M(w - c / 2, 0)}A${f(c / 2)} ${f(h / 2)} 0 0 0 ${f(w - c / 2)} ${f(h)}`)];
  },
  document: (w, h) => [main(docPath(0, 0, w, h))],
  cloud: (w, h) => [main(`${M(w * 0.25, h * 0.85)}C${f(w * 0.02)} ${f(h * 0.86)} ${f(w * 0.0)} ${f(h * 0.52)} ${f(w * 0.17)} ${f(h * 0.45)}C${f(w * 0.1)} ${f(h * 0.2)} ${f(w * 0.38)} ${f(h * 0.05)} ${f(w * 0.48)} ${f(h * 0.2)}C${f(w * 0.56)} ${f(h * 0.0)} ${f(w * 0.84)} ${f(h * 0.04)} ${f(w * 0.83)} ${f(h * 0.32)}C${f(w * 1.02)} ${f(h * 0.36)} ${f(w * 1.02)} ${f(h * 0.74)} ${f(w * 0.82)} ${f(h * 0.8)}C${f(w * 0.78)} ${f(h * 1.0)} ${f(w * 0.5)} ${f(h * 1.0)} ${f(w * 0.45)} ${f(h * 0.88)}C${f(w * 0.38)} ${f(h * 0.98)} ${f(w * 0.28)} ${f(h * 0.97)} ${f(w * 0.25)} ${f(h * 0.85)}Z`)],
  folded: (w, h) => {
    const c = Math.min(w, h) * 0.2;
    return [main(poly([[0, 0], [w - c, 0], [w, c], [w, h], [0, h]])), dark(poly([[w - c, 0], [w - c, c], [w, c]]))];
  },
};

// ───────────────────────── categories

export const CATEGORIES = [
  { id: 'basic', icon: 'stBasic', name: { ko: '기본 도형', en: 'Basic Shapes' } },
  { id: 'arrows', icon: 'stArrows', name: { ko: '화살표', en: 'Arrows' } },
  { id: 'flowchart', icon: 'stFlowchart', name: { ko: '순서도', en: 'Flowchart' } },
  { id: 'callouts', icon: 'stCallouts', name: { ko: '설명선·텍스트', en: 'Callouts & Text' } },
  { id: 'containers', icon: 'stContainers', name: { ko: '컨테이너·스윔레인', en: 'Containers & Swimlanes' } },
  { id: 'uml', icon: 'stUml', name: { ko: 'UML', en: 'UML' } },
  { id: 'erd', icon: 'stErd', name: { ko: '데이터베이스(ERD)', en: 'Database (ERD)' } },
  { id: 'bpmn', icon: 'stBpmn', name: { ko: 'BPMN', en: 'BPMN' } },
  { id: 'network', icon: 'stNetwork', name: { ko: '네트워크', en: 'Network' } },
  { id: 'org', icon: 'stOrg', name: { ko: '조직도', en: 'Org Chart' } },
  { id: 'mind', icon: 'stMind', name: { ko: '마인드맵·브레인스토밍', en: 'Mind Map & Brainstorming' } },
  { id: 'floor', icon: 'stFloor', name: { ko: '평면도', en: 'Floor Plan' } },
  { id: 'blocks', icon: 'stBlocks', name: { ko: '블록 다이어그램', en: 'Block Diagram' } },
  { id: 'timeline', icon: 'stTimeline', name: { ko: '일정표·타임라인', en: 'Timeline' } },
  { id: 'electrical', icon: 'stElectrical', name: { ko: '전기 회로', en: 'Electrical' } },
];

const masters = [];
/** Defines a master. */
function m(id, cat, w, h, ko, en, geometry, extra = {}) {
  masters.push({ id, cat, w, h, name: { ko, en }, geometry, points: SIDES, text: [0, 0, 1, 1], params: {}, style: {}, ...extra });
}

// ── basic
m('rect', 'basic', 120, 80, '사각형', 'Rectangle', G.rect, { points: SIDES_AND_CORNERS });
m('square', 'basic', 90, 90, '정사각형', 'Square', G.rect, { points: SIDES_AND_CORNERS, aspect: true });
m('roundRect', 'basic', 120, 80, '둥근 사각형', 'Rounded Rectangle', G.roundRect, { params: pRound(0.18) });
m('ellipse', 'basic', 120, 80, '타원', 'Ellipse', G.ellipse, { text: [0.12, 0.12, 0.88, 0.88] });
m('circle', 'basic', 90, 90, '원', 'Circle', G.ellipse, { aspect: true, text: [0.12, 0.12, 0.88, 0.88] });
m('triangle', 'basic', 100, 90, '삼각형', 'Triangle', (w, h, p, r) => [main(poly([[w / 2, 0], [w, h], [0, h]], r))], { points: [[0.5, 0], [0.75, 0.5], [1, 1], [0.5, 1], [0, 1], [0.25, 0.5]], text: [0.2, 0.4, 0.8, 1] });
m('rightTriangle', 'basic', 100, 90, '직각 삼각형', 'Right Triangle', (w, h, p, r) => [main(poly([[0, 0], [w, h], [0, h]], r))], { points: [[0, 0], [0.5, 0.5], [1, 1], [0.5, 1], [0, 0.5]], text: [0, 0.45, 0.6, 1] });
m('diamond', 'basic', 110, 90, '다이아몬드', 'Diamond', G.diamond, { text: [0.2, 0.2, 0.8, 0.8] });
m('pentagon', 'basic', 100, 95, '오각형', 'Pentagon', G.polygon(5), { text: [0.15, 0.2, 0.85, 0.9] });
m('hexagon', 'basic', 110, 95, '육각형', 'Hexagon', (w, h, p, r) => [main(poly([[w * 0.25, 0], [w * 0.75, 0], [w, h / 2], [w * 0.75, h], [w * 0.25, h], [0, h / 2]], r))], { points: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5], [0.25, 0], [0.75, 1]], text: [0.15, 0, 0.85, 1] });
m('heptagon', 'basic', 100, 100, '칠각형', 'Heptagon', G.polygon(7), { text: [0.15, 0.15, 0.85, 0.85] });
m('octagon', 'basic', 100, 100, '팔각형', 'Octagon', (w, h, p, r) => { const a = 0.29; return [main(poly([[w * a, 0], [w * (1 - a), 0], [w, h * a], [w, h * (1 - a)], [w * (1 - a), h], [w * a, h], [0, h * (1 - a)], [0, h * a]], r))]; }, { text: [0.1, 0.1, 0.9, 0.9] });
m('decagon', 'basic', 100, 100, '십각형', 'Decagon', G.polygon(10), { text: [0.12, 0.12, 0.88, 0.88] });
m('parallelogram', 'basic', 130, 75, '평행 사변형', 'Parallelogram', (w, h, p, r) => { const o = (p.offset ?? 0.2) * w; return [main(poly([[o, 0], [w, 0], [w - o, h], [0, h]], r))]; }, { params: pX('offset', 0.2, 0.45), points: [[0.6, 0], [0.9, 0.5], [0.4, 1], [0.1, 0.5]], text: [0.18, 0, 0.82, 1] });
m('trapezoid', 'basic', 130, 75, '사다리꼴', 'Trapezoid', (w, h, p, r) => { const o = (p.offset ?? 0.2) * w; return [main(poly([[o, 0], [w - o, 0], [w, h], [0, h]], r))]; }, { params: pX('offset', 0.2, 0.45), points: [[0.5, 0], [0.9, 0.5], [0.5, 1], [0.1, 0.5]], text: [0.15, 0, 0.85, 1] });
m('star4', 'basic', 100, 100, '별 4', '4-Point Star', G.star(4), { params: pStar(0.38), text: [0.3, 0.3, 0.7, 0.7] });
m('star5', 'basic', 100, 95, '별 5', '5-Point Star', G.star(5), { params: pStar(0.45), text: [0.28, 0.32, 0.72, 0.75] });
m('star6', 'basic', 100, 100, '별 6', '6-Point Star', G.star(6), { params: pStar(0.55), text: [0.25, 0.25, 0.75, 0.75] });
m('star8', 'basic', 100, 100, '별 8', '8-Point Star', G.star(8), { params: pStar(0.7), text: [0.2, 0.2, 0.8, 0.8] });
m('cross', 'basic', 100, 100, '십자형', 'Cross', (w, h, p, r) => { const a = (p.arm ?? 0.3) * w; const b = (p.arm ?? 0.3) * h; return [main(poly([[a, 0], [w - a, 0], [w - a, b], [w, b], [w, h - b], [w - a, h - b], [w - a, h], [a, h], [a, h - b], [0, h - b], [0, b], [a, b]], r))]; }, { params: pX('arm', 0.3, 0.48) });
m('cylinder', 'basic', 90, 110, '원통', 'Cylinder', G.cylinder, { params: pY('cap', 0.18, 0.45), text: [0, 0.2, 1, 1] });
m('cube', 'basic', 110, 100, '정육면체', 'Cube', (w, h, p) => { const d = (p.depth ?? 0.2) * Math.min(w, h); return [main(poly([[0, d], [d, 0], [w, 0], [w, h - d], [w - d, h], [0, h]])), light(poly([[0, d], [d, 0], [w, 0], [w - d, d]])), dark(poly([[w - d, d], [w, 0], [w, h - d], [w - d, h]]))]; }, { params: pX('depth', 0.2, 0.45), text: [0, 0.2, 0.8, 1] });
m('cloud', 'basic', 140, 95, '구름', 'Cloud', G.cloud, { text: [0.15, 0.2, 0.85, 0.85] });
m('heart', 'basic', 100, 90, '하트', 'Heart', (w, h) => [main(`${M(w / 2, h)}C${f(w * 0.15)} ${f(h * 0.7)} 0 ${f(h * 0.45)} 0 ${f(h * 0.28)}C0 ${f(h * 0.06)} ${f(w * 0.2)} 0 ${f(w * 0.28)} 0C${f(w * 0.4)} 0 ${f(w / 2)} ${f(h * 0.1)} ${f(w / 2)} ${f(h * 0.2)}C${f(w / 2)} ${f(h * 0.1)} ${f(w * 0.6)} 0 ${f(w * 0.72)} 0C${f(w * 0.8)} 0 ${f(w)} ${f(h * 0.06)} ${f(w)} ${f(h * 0.28)}C${f(w)} ${f(h * 0.45)} ${f(w * 0.85)} ${f(h * 0.7)} ${f(w / 2)} ${f(h)}Z`)], { text: [0.15, 0.15, 0.85, 0.7] });
m('donut', 'basic', 100, 100, '도넛', 'Donut', (w, h, p) => { const t = (p.ring ?? 0.25) * Math.min(w, h); return [main(`${ell(0, 0, w, h)}${ell(t, t, w - 2 * t, h - 2 * t)}`)]; }, { params: pX('ring', 0.25, 0.45, 0.5), aspect: true, text: [0.25, 0.25, 0.75, 0.75] });
m('moon', 'basic', 70, 100, '달', 'Moon', (w, h) => [main(`${M(w, 0)}A${f(w)} ${f(h / 2)} 0 0 0 ${f(w)} ${f(h)}A${f(w * 0.55)} ${f(h / 2)} 0 0 1 ${f(w)} 0Z`)], { text: [0, 0.3, 0.6, 0.7] });
m('frame', 'basic', 120, 90, '액자', 'Frame', (w, h, p) => { const t = (p.border ?? 0.12) * Math.min(w, h); return [main(`${rect(0, 0, w, h)}${rect(t, t, w - 2 * t, h - 2 * t)}`)]; }, { params: pX('border', 0.12, 0.4, 0.5) });
m('lShape', 'basic', 100, 100, 'L 모양', 'L-Shape', (w, h, p, r) => { const t = (p.thick ?? 0.4) * w; return [main(poly([[0, 0], [t, 0], [t, h - t], [w, h - t], [w, h], [0, h]], r))]; }, { params: pX('thick', 0.4, 0.9), text: [0, 0.6, 1, 1] });
m('plaque', 'basic', 120, 80, '명판', 'Plaque', (w, h) => { const c = Math.min(w, h) * 0.18; return [main(`${M(c, 0)}H${f(w - c)}A${f(c)} ${f(c)} 0 0 0 ${f(w)} ${f(c)}V${f(h - c)}A${f(c)} ${f(c)} 0 0 0 ${f(w - c)} ${f(h)}H${f(c)}A${f(c)} ${f(c)} 0 0 0 0 ${f(h - c)}V${f(c)}A${f(c)} ${f(c)} 0 0 0 ${f(c)} 0Z`)]; });
m('smiley', 'basic', 90, 90, '웃는 얼굴', 'Smiley Face', (w, h) => [main(ell(0, 0, w, h)), solid(ell(w * 0.3, h * 0.3, w * 0.1, h * 0.12)), solid(ell(w * 0.6, h * 0.3, w * 0.1, h * 0.12)), line(`${M(w * 0.28, h * 0.62)}Q${f(w / 2)} ${f(h * 0.85)} ${f(w * 0.72)} ${f(h * 0.62)}`)], { aspect: true, text: BELOW });
m('lightning', 'basic', 80, 110, '번개', 'Lightning Bolt', (w, h, p, r) => [main(poly([[w * 0.42, 0], [w * 0.95, 0], [w * 0.6, h * 0.38], [w * 0.92, h * 0.38], [w * 0.15, h], [w * 0.38, h * 0.52], [w * 0.05, h * 0.52]], r))], { text: BELOW });
m('sun', 'basic', 100, 100, '해', 'Sun', (w, h) => { const rays = []; for (let i = 0; i < 12; i++) { const a = (i * 30 * Math.PI) / 180; rays.push(`${M(w / 2 + Math.cos(a) * w * 0.32, h / 2 + Math.sin(a) * h * 0.32)}${L(w / 2 + Math.cos(a) * w * 0.5, h / 2 + Math.sin(a) * h * 0.5)}`); } return [main(ell(w * 0.22, h * 0.22, w * 0.56, h * 0.56)), line(rays.join(''))]; }, { aspect: true, text: [0.25, 0.25, 0.75, 0.75] });
m('wave', 'basic', 130, 80, '물결', 'Wave', (w, h) => [main(`${M(0, h * 0.12)}C${f(w * 0.3)} ${f(-h * 0.1)} ${f(w * 0.6)} ${f(h * 0.35)} ${f(w)} ${f(h * 0.12)}V${f(h * 0.88)}C${f(w * 0.7)} ${f(h * 1.1)} ${f(w * 0.4)} ${f(h * 0.65)} 0 ${f(h * 0.88)}Z`)], { text: [0, 0.15, 1, 0.85] });
m('textBox', 'basic', 140, 40, '텍스트', 'Text', (w, h) => [line(rect(0, 0, w, h))], { kind: 'text', style: { fill: 'none', line: 'none' }, points: SIDES });
m('line', 'basic', 140, 2, '선', 'Line', (w, h) => [line(`${M(0, h / 2)}${L(w, h / 2)}`)], { kind: 'lineShape', style: { fill: 'none' }, points: ENDS, text: [0, -8, 1, -0.5] });

// ── arrows
const arrowRight = (w, h, p, r) => { const hd = (p.head ?? 0.35) * w; const s = (p.shaft ?? 0.5) * h; const t = (h - s) / 2; return [main(poly([[0, t], [w - hd, t], [w - hd, 0], [w, h / 2], [w - hd, h], [w - hd, h - t], [0, h - t]], r))]; };
m('arrowRight', 'arrows', 130, 70, '오른쪽 화살표', 'Right Arrow', arrowRight, { params: pArrow(), points: [[0, 0.5], [1, 0.5], [0.4, 0.25], [0.4, 0.75]], text: [0, 0.2, 0.75, 0.8] });
m('arrowLeft', 'arrows', 130, 70, '왼쪽 화살표', 'Left Arrow', (w, h, p, r) => arrowRight(w, h, p, r).map((part) => ({ ...part, d: mirrorX(part.d, w) })), { params: pArrow(), points: [[0, 0.5], [1, 0.5]], text: [0.25, 0.2, 1, 0.8] });
m('arrowUp', 'arrows', 70, 130, '위쪽 화살표', 'Up Arrow', (w, h, p, r) => { const hd = (p.head ?? 0.35) * h; const s = (p.shaft ?? 0.5) * w; const t = (w - s) / 2; return [main(poly([[t, h], [t, hd], [0, hd], [w / 2, 0], [w, hd], [w - t, hd], [w - t, h]], r))]; }, { params: { head: { def: 0.35, handle: (w, h, v) => [0, v * h], from: (w, h, x, y) => clamp(y / h, 0.05, 0.95) } }, points: [[0.5, 0], [0.5, 1]], text: [0.2, 0.3, 0.8, 1] });
m('arrowDown', 'arrows', 70, 130, '아래쪽 화살표', 'Down Arrow', (w, h, p, r) => { const hd = (p.head ?? 0.35) * h; const s = (p.shaft ?? 0.5) * w; const t = (w - s) / 2; return [main(poly([[t, 0], [w - t, 0], [w - t, h - hd], [w, h - hd], [w / 2, h], [0, h - hd], [t, h - hd]], r))]; }, { params: { head: { def: 0.35, handle: (w, h, v) => [0, h - v * h], from: (w, h, x, y) => clamp((h - y) / h, 0.05, 0.95) } }, points: [[0.5, 0], [0.5, 1]], text: [0.2, 0, 0.8, 0.7] });
m('arrowLeftRight', 'arrows', 150, 70, '양쪽 화살표', 'Left-Right Arrow', (w, h, p, r) => { const hd = (p.head ?? 0.22) * w; const s = (p.shaft ?? 0.5) * h; const t = (h - s) / 2; return [main(poly([[0, h / 2], [hd, 0], [hd, t], [w - hd, t], [w - hd, 0], [w, h / 2], [w - hd, h], [w - hd, h - t], [hd, h - t], [hd, h]], r))]; }, { params: pArrow(0.22), points: ENDS, text: [0.2, 0.2, 0.8, 0.8] });
m('arrowUpDown', 'arrows', 70, 150, '위아래 화살표', 'Up-Down Arrow', (w, h, p, r) => { const hd = 0.22 * h; const s = 0.5 * w; const t = (w - s) / 2; return [main(poly([[w / 2, 0], [w, hd], [w - t, hd], [w - t, h - hd], [w, h - hd], [w / 2, h], [0, h - hd], [t, h - hd], [t, hd], [0, hd]], r))]; }, { points: [[0.5, 0], [0.5, 1]], text: [0.2, 0.25, 0.8, 0.75] });
m('arrowQuad', 'arrows', 120, 120, '4방향 화살표', 'Quad Arrow', (w, h, p, r) => { const a = 0.2; const b = 0.38; const c = 0.62; return [main(poly([[w / 2, 0], [w * 0.68, h * a], [w * c, h * a], [w * c, h * b], [w * (1 - a), h * b], [w * (1 - a), h * 0.32], [w, h / 2], [w * (1 - a), h * 0.68], [w * (1 - a), h * c], [w * c, h * c], [w * c, h * (1 - a)], [w * 0.68, h * (1 - a)], [w / 2, h], [w * 0.32, h * (1 - a)], [w * b, h * (1 - a)], [w * b, h * c], [w * a, h * c], [w * a, h * 0.68], [0, h / 2], [w * a, h * 0.32], [w * a, h * b], [w * b, h * b], [w * b, h * a], [w * 0.32, h * a]], r))]; }, { text: [0.38, 0.38, 0.62, 0.62] });
m('chevron', 'arrows', 120, 70, '갈매기형', 'Chevron', (w, h, p, r) => { const o = (p.point ?? 0.3) * w; return [main(poly([[0, 0], [w - o, 0], [w, h / 2], [w - o, h], [0, h], [o, h / 2]], r))]; }, { params: pX('point', 0.3, 0.6, 0.5), points: [[0.3, 0.5], [1, 0.5], [0.5, 0], [0.5, 1]], text: [0.3, 0, 0.75, 1] });
m('homePlate', 'arrows', 130, 70, '오각형 화살표', 'Pentagon Arrow', (w, h, p, r) => { const o = (p.point ?? 0.25) * w; return [main(poly([[0, 0], [w - o, 0], [w, h / 2], [w - o, h], [0, h]], r))]; }, { params: pX('point', 0.25, 0.6, 0.5), points: [[0, 0.5], [1, 0.5], [0.4, 0], [0.4, 1]], text: [0, 0, 0.8, 1] });
m('notchedArrow', 'arrows', 130, 70, '톱니 모양 화살표', 'Notched Arrow', (w, h, p, r) => { const hd = 0.35 * w; const t = h * 0.25; return [main(poly([[0, t], [w - hd, t], [w - hd, 0], [w, h / 2], [w - hd, h], [w - hd, h - t], [0, h - t], [w * 0.12, h / 2]], r))]; }, { points: [[0.1, 0.5], [1, 0.5]], text: [0.12, 0.2, 0.75, 0.8] });
m('stripedArrow', 'arrows', 140, 70, '줄무늬 화살표', 'Striped Arrow', (w, h, p, r) => { const hd = 0.33 * w; const t = h * 0.25; return [main(poly([[w * 0.16, t], [w - hd, t], [w - hd, 0], [w, h / 2], [w - hd, h], [w - hd, h - t], [w * 0.16, h - t]], r)), main(rect(0, t, w * 0.04, h - 2 * t)), main(rect(w * 0.07, t, w * 0.06, h - 2 * t))]; }, { points: ENDS, text: [0.16, 0.2, 0.75, 0.8] });
m('bentArrow', 'arrows', 110, 110, '굽은 화살표', 'Bent Arrow', (w, h, p, r) => { const s = 0.24; return [main(poly([[0, h], [0, h * 0.35], [w * 0.65, h * 0.35], [w * 0.65, 0], [w, h * 0.47], [w * 0.65, h * 0.94], [w * 0.65, h * (0.35 + s)], [w * s, h * (0.35 + s)], [w * s, h]], r))]; }, { points: [[0.12, 1], [1, 0.47]], text: [0, 0.35, 0.65, 0.6] });
m('uTurnArrow', 'arrows', 110, 120, 'U턴 화살표', 'U-Turn Arrow', (w, h) => { const s = w * 0.22; return [main(`${M(0, h)}V${f(h * 0.4)}A${f(w * 0.36)} ${f(h * 0.4)} 0 0 1 ${f(w * 0.72)} ${f(h * 0.4)}V${f(h * 0.62)}H${f(w)}L${f(w * 0.61)} ${f(h)}L${f(w * 0.22)} ${f(h * 0.62)}H${f(w * 0.5)}V${f(h * 0.4)}A${f(w * 0.14)} ${f(h * 0.2)} 0 0 0 ${f(s)} ${f(h * 0.4)}V${f(h)}Z`)]; }, { points: [[0.11, 1], [0.61, 1]], text: BELOW });
m('circularArrow', 'arrows', 110, 110, '원형 화살표', 'Circular Arrow', (w, h) => [main(`${M(w * 0.5, h * 0.06)}A${f(w * 0.44)} ${f(h * 0.44)} 0 1 1 ${f(w * 0.08)} ${f(h * 0.62)}L${f(w * 0)} ${f(h * 0.62)}L${f(w * 0.15)} ${f(h * 0.45)}L${f(w * 0.32)} ${f(h * 0.62)}L${f(w * 0.24)} ${f(h * 0.62)}A${f(w * 0.28)} ${f(h * 0.28)} 0 1 0 ${f(w * 0.5)} ${f(h * 0.22)}Z`)], { aspect: true, text: [0.3, 0.3, 0.7, 0.7] });

// ── flowchart
m('process', 'flowchart', 130, 70, '프로세스', 'Process', G.rect);
m('altProcess', 'flowchart', 130, 70, '대체 프로세스', 'Alternate Process', G.roundRect, { params: pRound(0.2) });
m('decision', 'flowchart', 130, 90, '판단', 'Decision', G.diamond, { text: [0.18, 0.18, 0.82, 0.82] });
m('data', 'flowchart', 130, 70, '데이터', 'Data', (w, h, p, r) => { const o = 0.18 * w; return [main(poly([[o, 0], [w, 0], [w - o, h], [0, h]], r))]; }, { points: [[0.55, 0], [0.91, 0.5], [0.45, 1], [0.09, 0.5]], text: [0.16, 0, 0.84, 1] });
m('predefined', 'flowchart', 130, 70, '미리 정의된 프로세스', 'Predefined Process', (w, h) => [main(rect(0, 0, w, h)), line(`${M(w * 0.1, 0)}V${f(h)}${M(w * 0.9, 0)}V${f(h)}`)], { text: [0.1, 0, 0.9, 1] });
m('internalStorage', 'flowchart', 120, 80, '내부 저장소', 'Internal Storage', (w, h) => [main(rect(0, 0, w, h)), line(`${M(w * 0.15, 0)}V${f(h)}${M(0, h * 0.2)}H${f(w)}`)], { text: [0.15, 0.2, 1, 1] });
m('document', 'flowchart', 130, 80, '문서', 'Document', G.document, { points: [[0.5, 0], [1, 0.45], [0.5, 0.95], [0, 0.45]], text: [0, 0, 1, 0.82] });
m('multiDocument', 'flowchart', 130, 85, '여러 문서', 'Multiple Documents', (w, h) => { const o = 0.06; const dw = w * (1 - 2 * o); const dh = h * (1 - 2 * o); return [main(docPath(w * 2 * o, 0, dw, dh)), main(docPath(w * o, h * o, dw, dh)), main(docPath(0, h * 2 * o, dw, dh))]; }, { text: [0, 0.15, 0.88, 0.85] });
m('terminator', 'flowchart', 130, 60, '시작/종료', 'Start/End', (w, h) => [main(rect(0, 0, w, h, h / 2))]);
m('preparation', 'flowchart', 130, 70, '준비', 'Preparation', (w, h, p, r) => [main(poly([[w * 0.18, 0], [w * 0.82, 0], [w, h / 2], [w * 0.82, h], [w * 0.18, h], [0, h / 2]], r))], { text: [0.15, 0, 0.85, 1] });
m('manualInput', 'flowchart', 130, 70, '수동 입력', 'Manual Input', (w, h, p, r) => [main(poly([[0, h * 0.3], [w, 0], [w, h], [0, h]], r))], { points: [[0.5, 0.15], [1, 0.5], [0.5, 1], [0, 0.65]], text: [0, 0.25, 1, 1] });
m('manualOperation', 'flowchart', 130, 70, '수동 작업', 'Manual Operation', (w, h, p, r) => [main(poly([[0, 0], [w, 0], [w * 0.82, h], [w * 0.18, h]], r))], { text: [0.15, 0, 0.85, 1] });
m('onPage', 'flowchart', 60, 60, '연결자', 'Connector', G.ellipse, { aspect: true });
m('offPage', 'flowchart', 70, 75, '페이지 외부 연결자', 'Off-Page Reference', (w, h, p, r) => [main(poly([[0, 0], [w, 0], [w, h * 0.65], [w / 2, h], [0, h * 0.65]], r))], { text: [0, 0, 1, 0.7] });
m('card', 'flowchart', 120, 75, '카드', 'Card', (w, h, p, r) => [main(poly([[w * 0.2, 0], [w, 0], [w, h], [0, h], [0, h * 0.3]], r))]);
m('punchedTape', 'flowchart', 130, 75, '천공 테이프', 'Punched Tape', (w, h) => [main(`${M(0, h * 0.1)}Q${f(w * 0.25)} ${f(h * 0.3)} ${f(w / 2)} ${f(h * 0.1)}T${f(w)} ${f(h * 0.1)}V${f(h * 0.9)}Q${f(w * 0.75)} ${f(h * 0.7)} ${f(w / 2)} ${f(h * 0.9)}T0 ${f(h * 0.9)}Z`)], { text: [0, 0.15, 1, 0.85] });
m('summingJunction', 'flowchart', 70, 70, '합계 연결', 'Summing Junction', (w, h) => [main(ell(0, 0, w, h)), line(`${M(w * 0.15, h * 0.15)}${L(w * 0.85, h * 0.85)}${M(w * 0.85, h * 0.15)}${L(w * 0.15, h * 0.85)}`)], { aspect: true, text: BELOW });
m('or', 'flowchart', 70, 70, '또는', 'Or', (w, h) => [main(ell(0, 0, w, h)), line(`${M(w / 2, 0)}V${f(h)}${M(0, h / 2)}H${f(w)}`)], { aspect: true, text: BELOW });
m('collate', 'flowchart', 80, 90, '대조', 'Collate', (w, h, p, r) => [main(poly([[0, 0], [w, 0], [0, h], [w, h]], r))], { text: BELOW });
m('sort', 'flowchart', 80, 100, '정렬', 'Sort', (w, h) => [main(poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]])), line(`${M(0, h / 2)}H${f(w)}`)], { text: BELOW });
m('extract', 'flowchart', 90, 80, '추출', 'Extract', (w, h, p, r) => [main(poly([[w / 2, 0], [w, h], [0, h]], r))], { text: [0.2, 0.45, 0.8, 1] });
m('merge', 'flowchart', 90, 80, '병합', 'Merge', (w, h, p, r) => [main(poly([[0, 0], [w, 0], [w / 2, h]], r))], { text: [0.2, 0, 0.8, 0.55] });
m('storedData', 'flowchart', 130, 70, '저장된 데이터', 'Stored Data', (w, h) => [main(`${M(w * 0.15, 0)}H${f(w)}A${f(w * 0.15)} ${f(h / 2)} 0 0 0 ${f(w)} ${f(h)}H${f(w * 0.15)}A${f(w * 0.15)} ${f(h / 2)} 0 0 1 ${f(w * 0.15)} 0Z`)], { text: [0.12, 0, 0.88, 1] });
m('delay', 'flowchart', 120, 70, '지연', 'Delay', (w, h) => [main(`${M(0, 0)}H${f(w - h / 2)}A${f(h / 2)} ${f(h / 2)} 0 0 1 ${f(w - h / 2)} ${f(h)}H0Z`)], { text: [0, 0, 0.85, 1] });
m('sequentialData', 'flowchart', 80, 80, '순차 접근 저장소', 'Sequential Data', (w, h) => [main(`${M(w / 2, h)}A${f(w / 2)} ${f(h / 2)} 0 1 1 ${f(w)} ${f(h / 2)}V${f(h)}Z`)], { aspect: true, text: [0.15, 0.15, 0.85, 0.85] });
m('magneticDisk', 'flowchart', 100, 85, '자기 디스크', 'Magnetic Disk', G.cylinder, { params: pY('cap', 0.22, 0.45), text: [0, 0.22, 1, 1] });
m('directAccess', 'flowchart', 130, 70, '직접 접근 저장소', 'Direct Access Storage', G.hCylinder, { params: pX('cap', 0.18, 0.45, 0.5), text: [0.08, 0, 0.82, 1] });
m('display', 'flowchart', 130, 70, '표시', 'Display', (w, h) => [main(`${M(0, h / 2)}L${f(w * 0.18)} 0H${f(w * 0.85)}A${f(w * 0.15)} ${f(h / 2)} 0 0 1 ${f(w * 0.85)} ${f(h)}H${f(w * 0.18)}Z`)], { text: [0.15, 0, 0.85, 1] });
m('loopLimit', 'flowchart', 130, 70, '반복 한계', 'Loop Limit', (w, h, p, r) => [main(poly([[w * 0.15, 0], [w * 0.85, 0], [w, h * 0.3], [w, h], [0, h], [0, h * 0.3]], r))]);
m('annotation', 'flowchart', 120, 70, '주석', 'Annotation', (w, h) => [main(rect(0, 0, w, h)), line(`${M(w * 0.15, 0)}H0V${f(h)}H${f(w * 0.15)}`)], { style: { fill: 'none', line: 'none' }, kind: 'annotation', points: [[0, 0.5]], text: [0.06, 0, 1, 1] });

// ── callouts & text
m('rectCallout', 'callouts', 140, 80, '사각형 설명선', 'Rectangular Callout', (w, h, p, r) => { const [tx, ty] = p.tail ?? [0.2, 1.5]; return [main(poly([[0, 0], [w, 0], [w, h], [w * 0.4, h], [tx * w, ty * h], [w * 0.2, h], [0, h]], r))]; }, { params: pTail(0.2, 1.5) });
m('roundCallout', 'callouts', 140, 80, '둥근 설명선', 'Rounded Callout', (w, h, p) => { const [tx, ty] = p.tail ?? [0.2, 1.5]; const rr = Math.min(w, h) * 0.18; return [main(`${M(rr, 0)}H${f(w - rr)}Q${f(w)} 0 ${f(w)} ${f(rr)}V${f(h - rr)}Q${f(w)} ${f(h)} ${f(w - rr)} ${f(h)}H${f(w * 0.4)}L${f(tx * w)} ${f(ty * h)}L${f(w * 0.22)} ${f(h)}H${f(rr)}Q0 ${f(h)} 0 ${f(h - rr)}V${f(rr)}Q0 0 ${f(rr)} 0Z`)]; }, { params: pTail(0.2, 1.5) });
m('ovalCallout', 'callouts', 140, 85, '타원형 설명선', 'Oval Callout', (w, h, p) => { const [tx, ty] = p.tail ?? [0.15, 1.45]; return [main(`${M(w * 0.42, h * 0.995)}A${f(w / 2)} ${f(h / 2)} 0 1 1 ${f(w * 0.22)} ${f(h * 0.91)}L${f(tx * w)} ${f(ty * h)}Z`)]; }, { params: pTail(0.15, 1.45), text: [0.14, 0.14, 0.86, 0.86] });
m('cloudCallout', 'callouts', 150, 95, '구름 설명선', 'Cloud Callout', (w, h, p) => { const [tx, ty] = p.tail ?? [0.12, 1.4]; const parts = G.cloud(w, h); const bx = w * 0.25 + (tx * w - w * 0.25) * 0.5; const by = h * 0.92 + (ty * h - h * 0.92) * 0.5; return [...parts, main(circle(bx, by, Math.min(w, h) * 0.07)), main(circle(tx * w, ty * h, Math.min(w, h) * 0.04))]; }, { params: pTail(0.12, 1.4), text: [0.15, 0.2, 0.85, 0.85] });
m('lineCallout', 'callouts', 140, 70, '선 설명선', 'Line Callout', (w, h, p) => { const [tx, ty] = p.tail ?? [-0.35, 1.5]; return [main(rect(0, 0, w, h)), line(`${M(0, h)}${L(tx * w, ty * h)}`)]; }, { params: pTail(-0.35, 1.5) });
m('note', 'callouts', 120, 110, '메모', 'Sticky Note', G.folded, { style: { fill: '#fff4a8', line: '#d8b830', textColor: '#3d3300' }, text: [0.06, 0.06, 0.94, 0.94] });
m('title', 'callouts', 300, 50, '제목', 'Title', (w, h) => [line(rect(0, 0, w, h))], { kind: 'text', style: { fill: 'none', line: 'none', fontSize: 26, bold: true } });
m('braceLeft', 'callouts', 30, 120, '왼쪽 중괄호', 'Left Brace', (w, h) => [line(`${M(w, 0)}Q${f(w / 2)} 0 ${f(w / 2)} ${f(h * 0.1)}V${f(h * 0.42)}Q${f(w / 2)} ${f(h / 2)} 0 ${f(h / 2)}Q${f(w / 2)} ${f(h / 2)} ${f(w / 2)} ${f(h * 0.58)}V${f(h * 0.9)}Q${f(w / 2)} ${f(h)} ${f(w)} ${f(h)}`)], { style: { fill: 'none' }, kind: 'lineShape', points: [[0, 0.5], [1, 0], [1, 1]], text: [-3.2, 0, -0.1, 1] });
m('braceRight', 'callouts', 30, 120, '오른쪽 중괄호', 'Right Brace', (w, h) => [line(mirrorX(`${M(w, 0)}Q${f(w / 2)} 0 ${f(w / 2)} ${f(h * 0.1)}V${f(h * 0.42)}Q${f(w / 2)} ${f(h / 2)} 0 ${f(h / 2)}Q${f(w / 2)} ${f(h / 2)} ${f(w / 2)} ${f(h * 0.58)}V${f(h * 0.9)}Q${f(w / 2)} ${f(h)} ${f(w)} ${f(h)}`, w))], { style: { fill: 'none' }, kind: 'lineShape', points: [[1, 0.5], [0, 0], [0, 1]], text: [1.1, 0, 4.2, 1] });
m('bracketLeft', 'callouts', 24, 120, '왼쪽 대괄호', 'Left Bracket', (w, h) => [line(`${M(w, 0)}H0V${f(h)}H${f(w)}`)], { style: { fill: 'none' }, kind: 'lineShape', points: [[0, 0.5]], text: [-3.4, 0, -0.1, 1] });
m('banner', 'callouts', 160, 60, '배너', 'Banner', (w, h, p, r) => [main(poly([[0, 0], [w, 0], [w * 0.92, h / 2], [w, h], [0, h], [w * 0.08, h / 2]], r))], { text: [0.1, 0, 0.9, 1] });
m('scroll', 'callouts', 150, 100, '두루마리', 'Scroll', (w, h) => { const c = h * 0.14; return [main(`${M(c, c)}H${f(w)}V${f(h - c)}H${f(c)}Z`), light(`${M(c, c)}A${f(c / 2)} ${f(c / 2)} 0 0 1 ${f(c)} 0H${f(w - c / 2)}A${f(c / 2)} ${f(c / 2)} 0 0 1 ${f(w - c / 2)} ${f(c)}`), light(`${M(0, h - c / 2)}A${f(c / 2)} ${f(c / 2)} 0 0 1 ${f(c)} ${f(h - c)}V${f(h)}H${f(c / 2)}A${f(c / 2)} ${f(c / 2)} 0 0 1 0 ${f(h - c / 2)}Z`)]; }, { text: [0.12, 0.16, 0.95, 0.84] });

// ── containers & swimlanes
m('container', 'containers', 320, 220, '컨테이너', 'Container', (w, h) => [main(rect(0, 0, w, h)), dark(rect(0, 0, w, Math.min(30, h)))], { kind: 'container', header: 'top', qs: 'subtle', text: [0, 0, 1, 0], textHeader: true });
m('groupFrame', 'containers', 300, 200, '그룹 테두리', 'Group Frame', (w, h) => [main(rect(0, 0, w, h, 12))], { kind: 'container', style: { fill: 'none', dash: 'dash' }, text: [0.02, 0, 0.98, 0], textHeader: true, header: 'top' });
m('swimlane', 'containers', 640, 150, '스윔레인(가로)', 'Swimlane (Horizontal)', (w, h) => [main(rect(0, 0, w, h)), dark(rect(0, 0, Math.min(36, w), h))], { kind: 'container', header: 'left', qs: 'subtle', text: [0, 0, 0, 1], textHeader: true, points: [[0, 0.5], [1, 0.5]] });
m('swimlaneV', 'containers', 200, 520, '스윔레인(세로)', 'Swimlane (Vertical)', (w, h) => [main(rect(0, 0, w, h)), dark(rect(0, 0, w, Math.min(34, h)))], { kind: 'container', header: 'top', qs: 'subtle', text: [0, 0, 1, 0], textHeader: true, points: [[0.5, 0], [0.5, 1]] });
m('pool', 'containers', 680, 320, '풀(교차 기능)', 'Pool (Cross-Functional)', (w, h) => [main(rect(0, 0, w, h)), dark(rect(0, 0, Math.min(36, w), h)), line(`${M(36, h / 2)}H${f(w)}`)], { kind: 'container', header: 'left', qs: 'subtle', text: [0, 0, 0, 1], textHeader: true });
m('phaseSeparator', 'containers', 20, 400, '단계 구분선', 'Phase Separator', (w, h) => [line(`${M(w / 2, 0)}V${f(h)}`)], { style: { fill: 'none', dash: 'dash' }, kind: 'lineShape', points: [[0.5, 0], [0.5, 1]], text: [0.7, 0, 6, 0.08] });

// ── UML
m('umlClass', 'uml', 170, 130, '클래스', 'Class', (w, h) => [main(rect(0, 0, w, h))], { compartments: true, qs: 'subtle', points: SIDES_AND_CORNERS, text: [0, 0, 1, 1] });
m('umlInterface', 'uml', 170, 100, '인터페이스', 'Interface', (w, h) => [main(rect(0, 0, w, h))], { compartments: true, qs: 'subtle', text: [0, 0, 1, 1] });
m('umlActor', 'uml', 40, 80, '행위자', 'Actor', (w, h) => [main(ell(w * 0.28, 0, w * 0.44, h * 0.22)), line(`${M(w / 2, h * 0.22)}V${f(h * 0.62)}${M(0, h * 0.34)}H${f(w)}${M(w / 2, h * 0.62)}L0 ${f(h)}${M(w / 2, h * 0.62)}L${f(w)} ${f(h)}`)], { text: BELOW, qs: 'outline' });
m('umlUseCase', 'uml', 140, 70, '유스케이스', 'Use Case', G.ellipse, { text: [0.12, 0.1, 0.88, 0.9], qs: 'subtle' });
m('umlPackage', 'uml', 160, 110, '패키지', 'Package', (w, h) => [main(poly([[0, h * 0.18], [0, h], [w, h], [w, h * 0.18]])), dark(poly([[0, 0], [w * 0.4, 0], [w * 0.4, h * 0.18], [0, h * 0.18]]))], { text: [0, 0.18, 1, 1], qs: 'subtle' });
m('umlComponent', 'uml', 150, 80, '구성 요소', 'Component', (w, h) => [main(rect(w * 0.08, 0, w * 0.92, h)), light(rect(0, h * 0.2, w * 0.16, h * 0.18)), light(rect(0, h * 0.62, w * 0.16, h * 0.18))], { text: [0.16, 0, 1, 1], qs: 'subtle' });
m('umlNode', 'uml', 150, 100, '노드', 'Node', (w, h) => { const d = Math.min(w, h) * 0.15; return [main(poly([[0, d], [w - d, d], [w - d, h], [0, h]])), light(poly([[0, d], [d, 0], [w, 0], [w - d, d]])), dark(poly([[w - d, d], [w, 0], [w, h - d], [w - d, h]]))]; }, { text: [0, 0.15, 0.85, 1], qs: 'subtle' });
m('umlNote', 'uml', 130, 80, 'UML 메모', 'UML Note', G.folded, { style: { fill: '#fffbe0' }, text: [0.05, 0.05, 0.9, 0.95] });
m('umlLifeline', 'uml', 110, 300, '생명선', 'Lifeline', (w, h) => [main(rect(0, 0, w, 40)), line(`${M(w / 2, 40)}V${f(h)}`)], { lifeline: true, qs: 'subtle', text: [0, 0, 1, 40], dashedLine: true, points: [[0.5, 0], [0.5, 0.2], [0.5, 0.35], [0.5, 0.5], [0.5, 0.65], [0.5, 0.8], [0.5, 1]] });
m('umlActivation', 'uml', 16, 90, '활성 막대', 'Activation', G.rect, { text: [0, 0, 0, 0], points: [[0.5, 0], [0, 0.25], [1, 0.25], [0, 0.75], [1, 0.75], [0.5, 1]] });
m('umlState', 'uml', 130, 70, '상태', 'State', G.roundRect, { params: pRound(0.3), qs: 'subtle' });
m('umlInitial', 'uml', 30, 30, '시작 상태', 'Initial State', (w, h) => [solid(ell(0, 0, w, h))], { aspect: true, text: BELOW });
m('umlFinal', 'uml', 34, 34, '종료 상태', 'Final State', (w, h) => [line(ell(0, 0, w, h)), solid(ell(w * 0.2, h * 0.2, w * 0.6, h * 0.6))], { aspect: true, text: BELOW, style: { fill: 'none' } });
m('umlFork', 'uml', 160, 10, '분기/합류 막대', 'Fork / Join', (w, h) => [solid(rect(0, 0, w, h))], { text: [0, -2.4, 1, -0.2], points: [[0.25, 0], [0.5, 0], [0.75, 0], [0.25, 1], [0.5, 1], [0.75, 1]] });
m('umlObject', 'uml', 150, 60, '객체', 'Object', G.rect, { qs: 'subtle', style: { underline: true } });
m('umlDecision', 'uml', 50, 50, '결정 노드', 'Decision Node', G.diamond, { text: BELOW, qs: 'subtle' });

// ── database (ERD)
m('entity', 'erd', 170, 140, '엔터티', 'Entity', (w, h) => [main(rect(0, 0, w, h))], { compartments: true, qs: 'subtle', points: [[0.5, 0], [1, 0.25], [1, 0.5], [1, 0.75], [0.5, 1], [0, 0.75], [0, 0.5], [0, 0.25]] });
m('weakEntity', 'erd', 150, 70, '약한 엔터티', 'Weak Entity', (w, h) => [main(rect(0, 0, w, h)), line(rect(5, 5, w - 10, h - 10))], { text: [0.05, 0.08, 0.95, 0.92], qs: 'subtle' });
m('relationship', 'erd', 130, 80, '관계', 'Relationship', G.diamond, { text: [0.2, 0.2, 0.8, 0.8], qs: 'subtle' });
m('attribute', 'erd', 120, 60, '속성', 'Attribute', G.ellipse, { text: [0.1, 0.1, 0.9, 0.9], qs: 'outline' });
m('keyAttribute', 'erd', 120, 60, '키 속성', 'Key Attribute', G.ellipse, { text: [0.1, 0.1, 0.9, 0.9], qs: 'outline', style: { underline: true } });
m('dbView', 'erd', 170, 120, '뷰', 'View', (w, h) => [main(rect(0, 0, w, h, 10))], { compartments: true, qs: 'outline', style: { dash: 'dash' } });

// ── BPMN
const envelope = (x, y, w, h) => `${rect(x, y, w, h)}${M(x, y)}${L(x + w / 2, y + h * 0.55)}${L(x + w, y)}`;
m('bpmnStart', 'bpmn', 40, 40, '시작 이벤트', 'Start Event', G.ellipse, { aspect: true, text: BELOW, style: { fill: '#e8f7e4', line: '#2e8b3a' } });
m('bpmnIntermediate', 'bpmn', 40, 40, '중간 이벤트', 'Intermediate Event', (w, h) => [main(ell(0, 0, w, h)), line(ell(w * 0.1, h * 0.1, w * 0.8, h * 0.8))], { aspect: true, text: BELOW, style: { fill: '#fff6e0', line: '#c98a00' } });
m('bpmnEnd', 'bpmn', 40, 40, '종료 이벤트', 'End Event', G.ellipse, { aspect: true, text: BELOW, style: { fill: '#fde8e8', line: '#c0392b', lineWidth: 3.5 } });
m('bpmnTimer', 'bpmn', 40, 40, '타이머 이벤트', 'Timer Event', (w, h) => [main(ell(0, 0, w, h)), line(ell(w * 0.1, h * 0.1, w * 0.8, h * 0.8)), line(`${M(w / 2, h * 0.24)}V${f(h / 2)}L${f(w * 0.68)} ${f(h * 0.6)}`)], { aspect: true, text: BELOW, style: { fill: '#fff6e0', line: '#c98a00' } });
m('bpmnMessage', 'bpmn', 40, 40, '메시지 이벤트', 'Message Event', (w, h) => [main(ell(0, 0, w, h)), line(envelope(w * 0.24, h * 0.32, w * 0.52, h * 0.36))], { aspect: true, text: BELOW, style: { fill: '#e8f7e4', line: '#2e8b3a' } });
m('bpmnTask', 'bpmn', 130, 80, '작업', 'Task', (w, h) => [main(rect(0, 0, w, h, 10))], { qs: 'subtle' });
m('bpmnSubprocess', 'bpmn', 140, 90, '하위 프로세스', 'Sub-Process', (w, h) => [main(rect(0, 0, w, h, 10)), line(`${rect(w / 2 - 8, h - 18, 16, 16)}${M(w / 2 - 5, h - 10)}H${f(w / 2 + 5)}${M(w / 2, h - 15)}V${f(h - 5)}`)], { qs: 'subtle', text: [0, 0, 1, 0.8] });
m('bpmnCallActivity', 'bpmn', 130, 80, '호출 활동', 'Call Activity', (w, h) => [main(rect(0, 0, w, h, 10))], { qs: 'subtle', style: { lineWidth: 3.5 } });
m('gatewayExclusive', 'bpmn', 56, 56, '배타 게이트웨이', 'Exclusive Gateway', (w, h) => [main(poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]])), line(`${M(w * 0.36, h * 0.36)}${L(w * 0.64, h * 0.64)}${M(w * 0.64, h * 0.36)}${L(w * 0.36, h * 0.64)}`)], { aspect: true, text: BELOW, style: { fill: '#fffbe6', line: '#b8860b' } });
m('gatewayParallel', 'bpmn', 56, 56, '병렬 게이트웨이', 'Parallel Gateway', (w, h) => [main(poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]])), line(`${M(w / 2, h * 0.28)}V${f(h * 0.72)}${M(w * 0.28, h / 2)}H${f(w * 0.72)}`)], { aspect: true, text: BELOW, style: { fill: '#fffbe6', line: '#b8860b' } });
m('gatewayInclusive', 'bpmn', 56, 56, '포괄 게이트웨이', 'Inclusive Gateway', (w, h) => [main(poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]])), line(ell(w * 0.3, h * 0.3, w * 0.4, h * 0.4))], { aspect: true, text: BELOW, style: { fill: '#fffbe6', line: '#b8860b' } });
m('gatewayEvent', 'bpmn', 56, 56, '이벤트 기반 게이트웨이', 'Event-Based Gateway', (w, h) => [main(poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]])), line(ell(w * 0.26, h * 0.26, w * 0.48, h * 0.48)), line(poly(regularPoints(w * 0.26, h * 0.26, 5).map(([x, y]) => [x + w * 0.37, y + h * 0.36])))], { aspect: true, text: BELOW, style: { fill: '#fffbe6', line: '#b8860b' } });
m('bpmnDataObject', 'bpmn', 50, 64, '데이터 개체', 'Data Object', G.folded, { text: BELOW, qs: 'outline' });
m('bpmnDataStore', 'bpmn', 64, 56, '데이터 저장소', 'Data Store', G.cylinder, { params: pY('cap', 0.25, 0.45), text: BELOW, qs: 'outline' });
m('bpmnEnvelope', 'bpmn', 60, 40, '메시지', 'Message', (w, h) => [main(rect(0, 0, w, h)), line(`${M(0, 0)}${L(w / 2, h * 0.55)}${L(w, 0)}`)], { text: BELOW, qs: 'outline' });
m('bpmnGroup', 'bpmn', 260, 180, '그룹', 'Group', (w, h) => [main(rect(0, 0, w, h, 10))], { kind: 'container', style: { fill: 'none', dash: 'dashDot' }, text: [0, 0, 1, 0], textHeader: true, header: 'top' });

// ── network
m('server', 'network', 60, 90, '서버', 'Server', (w, h) => [main(rect(0, 0, w, h, 4)), line(`${M(w * 0.15, h * 0.15)}H${f(w * 0.85)}${M(w * 0.15, h * 0.28)}H${f(w * 0.85)}${M(w * 0.15, h * 0.41)}H${f(w * 0.85)}`), solid(circle(w * 0.5, h * 0.82, Math.min(w, h) * 0.05))], { text: BELOW, qs: 'subtle' });
m('desktop', 'network', 90, 80, '데스크톱 PC', 'Desktop PC', (w, h) => [main(rect(0, 0, w, h * 0.7, 4)), light(rect(w * 0.07, h * 0.08, w * 0.86, h * 0.52)), main(poly([[w * 0.4, h * 0.7], [w * 0.6, h * 0.7], [w * 0.65, h * 0.9], [w * 0.35, h * 0.9]])), main(rect(w * 0.25, h * 0.9, w * 0.5, h * 0.1, 2))], { text: BELOW, qs: 'subtle' });
m('laptop', 'network', 100, 70, '노트북', 'Laptop', (w, h) => [main(rect(w * 0.1, 0, w * 0.8, h * 0.75, 4)), light(rect(w * 0.16, h * 0.08, w * 0.68, h * 0.58)), main(poly([[w * 0.05, h * 0.78], [w * 0.95, h * 0.78], [w, h], [0, h]], 2))], { text: BELOW, qs: 'subtle' });
m('monitor', 'network', 90, 70, '모니터', 'Monitor', (w, h) => [main(rect(0, 0, w, h * 0.8, 3)), light(rect(w * 0.05, h * 0.06, w * 0.9, h * 0.66)), line(`${M(w * 0.3, h)}H${f(w * 0.7)}${M(w / 2, h * 0.8)}V${f(h)}`)], { text: BELOW, qs: 'subtle' });
m('router', 'network', 90, 60, '라우터', 'Router', (w, h) => { const c = h * 0.3; return [main(`${M(0, c / 2)}A${f(w / 2)} ${f(c / 2)} 0 0 1 ${f(w)} ${f(c / 2)}V${f(h - c / 2)}A${f(w / 2)} ${f(c / 2)} 0 0 1 0 ${f(h - c / 2)}Z`), light(ell(0, 0, w, c)), line(`${M(w * 0.3, c * 0.5)}H${f(w * 0.45)}${M(w * 0.55, c * 0.5)}H${f(w * 0.7)}${M(w * 0.5, c * 0.15)}V${f(c * 0.85)}`)]; }, { text: BELOW, qs: 'subtle' });
m('switch', 'network', 110, 50, '스위치', 'Switch', (w, h) => [main(poly([[w * 0.1, 0], [w, 0], [w * 0.9, h * 0.35], [0, h * 0.35]])), main(rect(0, h * 0.35, w * 0.9, h * 0.65)), dark(poly([[w * 0.9, h * 0.35], [w, 0], [w, h * 0.65], [w * 0.9, h]])), line(`${M(w * 0.3, h * 0.17)}H${f(w * 0.45)}${M(w * 0.55, h * 0.17)}H${f(w * 0.7)}`)], { text: BELOW, qs: 'subtle' });
m('firewall', 'network', 90, 70, '방화벽', 'Firewall', (w, h) => { const rows = 4; const lines = []; for (let i = 1; i < rows; i++) lines.push(`${M(0, (h * i) / rows)}H${f(w)}`); for (let i = 0; i < rows; i++) { const off = i % 2 ? w / 6 : w / 3; for (let x = off; x < w; x += w / 3) lines.push(`${M(x, (h * i) / rows)}V${f((h * (i + 1)) / rows)}`); } return [main(rect(0, 0, w, h)), line(lines.join(''))]; }, { text: BELOW, style: { fill: '#f6c9a8', line: '#a0522d' } });
m('cloudNet', 'network', 130, 85, '클라우드', 'Cloud', G.cloud, { text: [0.15, 0.25, 0.85, 0.85], qs: 'subtle' });
m('dbServer', 'network', 70, 85, '데이터베이스 서버', 'Database Server', (w, h) => [...G.cylinder(w, h, { cap: 0.22 }), line(`${M(0, h * 0.42)}A${f(w / 2)} ${f(h * 0.11)} 0 0 0 ${f(w)} ${f(h * 0.42)}${M(0, h * 0.64)}A${f(w / 2)} ${f(h * 0.11)} 0 0 0 ${f(w)} ${f(h * 0.64)}`)], { text: BELOW, qs: 'subtle' });
m('printer', 'network', 90, 75, '프린터', 'Printer', (w, h) => [light(rect(w * 0.22, 0, w * 0.56, h * 0.35)), main(rect(0, h * 0.3, w, h * 0.45, 6)), light(rect(w * 0.22, h * 0.62, w * 0.56, h * 0.38)), solid(circle(w * 0.85, h * 0.42, 3))], { text: BELOW, qs: 'subtle' });
m('phone', 'network', 44, 80, '휴대폰', 'Mobile Phone', (w, h) => [main(rect(0, 0, w, h, 7)), light(rect(w * 0.12, h * 0.12, w * 0.76, h * 0.68)), line(circle(w / 2, h * 0.9, Math.min(w, h) * 0.06))], { text: BELOW, qs: 'subtle' });
m('tablet', 'network', 70, 90, '태블릿', 'Tablet', (w, h) => [main(rect(0, 0, w, h, 7)), light(rect(w * 0.1, h * 0.08, w * 0.8, h * 0.78)), line(circle(w / 2, h * 0.93, 2.5))], { text: BELOW, qs: 'subtle' });
m('wirelessAp', 'network', 70, 70, '무선 액세스 포인트', 'Wireless Access Point', (w, h) => [main(rect(w * 0.1, h * 0.65, w * 0.8, h * 0.35, 5)), line(`${M(w / 2, h * 0.65)}V${f(h * 0.4)}${M(w * 0.35, h * 0.3)}A${f(w * 0.2)} ${f(w * 0.2)} 0 0 1 ${f(w * 0.65)} ${f(h * 0.3)}${M(w * 0.22, h * 0.2)}A${f(w * 0.36)} ${f(w * 0.36)} 0 0 1 ${f(w * 0.78)} ${f(h * 0.2)}`)], { text: BELOW, qs: 'subtle' });
m('hub', 'network', 110, 36, '허브', 'Hub', (w, h) => { const ports = []; for (let i = 0; i < 6; i++) ports.push(rect(w * (0.12 + i * 0.12), h * 0.4, w * 0.07, h * 0.3)); return [main(rect(0, 0, w, h, 4)), dark(ports.join(''))]; }, { text: BELOW, qs: 'subtle' });
m('internet', 'network', 80, 80, '인터넷', 'Internet', (w, h) => [main(ell(0, 0, w, h)), line(`${ell(w * 0.28, 0, w * 0.44, h)}${M(0, h / 2)}H${f(w)}${M(w / 2, 0)}V${f(h)}${M(w * 0.08, h * 0.25)}H${f(w * 0.92)}${M(w * 0.08, h * 0.75)}H${f(w * 0.92)}`)], { aspect: true, text: BELOW, qs: 'subtle' });
m('storage', 'network', 80, 70, '스토리지(NAS)', 'Storage (NAS)', (w, h) => [main(rect(0, 0, w, h, 5)), line(`${M(w * 0.12, h * 0.33)}H${f(w * 0.88)}${M(w * 0.12, h * 0.66)}H${f(w * 0.88)}`), solid(`${circle(w * 0.8, h * 0.17, 2.5)}${circle(w * 0.8, h * 0.5, 2.5)}${circle(w * 0.8, h * 0.83, 2.5)}`)], { text: BELOW, qs: 'subtle' });
m('user', 'network', 60, 70, '사용자', 'User', (w, h) => [main(ell(w * 0.28, 0, w * 0.44, h * 0.42)), main(`${M(0, h)}C0 ${f(h * 0.55)} ${f(w)} ${f(h * 0.55)} ${f(w)} ${f(h)}Z`)], { text: BELOW, qs: 'subtle' });
m('rack', 'network', 70, 120, '랙', 'Rack', (w, h) => { const units = []; for (let i = 0; i < 6; i++) units.push(rect(w * 0.1, h * (0.06 + i * 0.15), w * 0.8, h * 0.12)); return [main(rect(0, 0, w, h, 3)), light(units.join(''))]; }, { text: BELOW, qs: 'subtle' });

// ── org chart
m('orgExecutive', 'org', 170, 70, '경영진', 'Executive', (w, h) => [main(rect(0, 0, w, h, 4)), dark(rect(0, 0, w, h * 0.16))], { org: true, text: [0.04, 0.16, 0.96, 1] });
m('orgManager', 'org', 160, 65, '관리자', 'Manager', (w, h) => [main(rect(0, 0, w, h, 4)), dark(rect(0, 0, w * 0.06, h))], { org: true, text: [0.06, 0, 1, 1] });
m('orgPosition', 'org', 150, 60, '직위', 'Position', (w, h) => [main(rect(0, 0, w, h, 4))], { org: true, qs: 'subtle' });
m('orgAssistant', 'org', 140, 55, '보조', 'Assistant', (w, h) => [main(rect(0, 0, w, h, h / 2))], { org: true, qs: 'outline' });
m('orgConsultant', 'org', 150, 60, '컨설턴트', 'Consultant', (w, h) => [main(rect(0, 0, w, h, 4))], { org: true, qs: 'outline', style: { dash: 'dash' } });
m('orgVacancy', 'org', 150, 60, '공석', 'Vacancy', (w, h) => [main(rect(0, 0, w, h, 4))], { org: true, style: { fill: 'none', dash: 'dot' } });
m('orgPhoto', 'org', 190, 70, '사진 카드', 'Photo Card', (w, h) => [main(rect(0, 0, w, h, 6)), light(rect(h * 0.12, h * 0.12, h * 0.76, h * 0.76, 4)), light(`${ell(h * 0.33, h * 0.2, h * 0.34, h * 0.32)}${M(h * 0.18, h * 0.86)}C${f(h * 0.18)} ${f(h * 0.5)} ${f(h * 0.82)} ${f(h * 0.5)} ${f(h * 0.82)} ${f(h * 0.86)}Z`)], { org: true, qs: 'subtle', text: [0.43, 0, 1, 1] });

// ── mind map
m('centralTopic', 'mind', 180, 90, '중심 주제', 'Central Topic', (w, h) => [main(rect(0, 0, w, h, h / 2))], { qs: 'intense', style: { fontSize: 18, bold: true } });
m('mainTopic', 'mind', 140, 56, '주요 주제', 'Main Topic', (w, h) => [main(rect(0, 0, w, h, 12))], { qs: 'fill' });
m('subTopic', 'mind', 120, 40, '하위 주제', 'Subtopic', (w, h) => [main(rect(0, 0, w, h, 8))], { qs: 'subtle' });
m('floatingTopic', 'mind', 120, 44, '자유 주제', 'Floating Topic', (w, h) => [main(rect(0, 0, w, h, 8))], { qs: 'outline', style: { dash: 'dash' } });
m('idea', 'mind', 140, 90, '아이디어', 'Idea', G.cloud, { qs: 'subtle', text: [0.15, 0.2, 0.85, 0.85] });
m('topicUnderline', 'mind', 120, 32, '밑줄 주제', 'Underlined Topic', (w, h) => [line(`${M(0, h)}H${f(w)}`)], { style: { fill: 'none' }, points: [[0, 1], [1, 1]] });

// ── floor plan
m('wall', 'floor', 240, 12, '벽', 'Wall', G.rect, { style: { fill: '#5f6368', line: '#3c4043' }, points: [[0, 0.5], [1, 0.5], [0.5, 0], [0.5, 1]], text: [0, -2.5, 1, -0.2] });
m('room', 'floor', 280, 200, '방', 'Room', (w, h) => [main(rect(0, 0, w, h))], { style: { fill: '#f7f4ec', line: '#3c4043', lineWidth: 5 }, kind: 'container' });
m('door', 'floor', 80, 80, '문', 'Door', (w, h) => [main(rect(0, h - 6, 6, 6)), line(`${M(3, h)}V0A${f(w - 3)} ${f(h)} 0 0 1 ${f(w)} ${f(h)}`)], { style: { fill: '#ffffff', line: '#3c4043', lineWidth: 1.5 }, text: BELOW, points: [[0, 1], [1, 1]] });
m('doubleDoor', 'floor', 140, 70, '양문', 'Double Door', (w, h) => [line(`${M(0, h)}V0A${f(w / 2)} ${f(h)} 0 0 1 ${f(w / 2)} ${f(h)}${M(w, h)}V0A${f(w / 2)} ${f(h)} 0 0 0 ${f(w / 2)} ${f(h)}`)], { style: { fill: 'none', line: '#3c4043', lineWidth: 1.5 }, text: BELOW, points: [[0, 1], [1, 1]] });
m('window', 'floor', 120, 12, '창문', 'Window', (w, h) => [main(rect(0, 0, w, h)), line(`${M(0, h / 2)}H${f(w)}`)], { style: { fill: '#e3f2fd', line: '#3c4043', lineWidth: 1.5 }, text: [0, -2.5, 1, -0.2], points: [[0, 0.5], [1, 0.5]] });
m('tableRect', 'floor', 140, 80, '사각 테이블', 'Rectangular Table', (w, h) => [main(rect(0, 0, w, h, 4))], { style: { fill: '#d7b98e', line: '#7a5a2f' } });
m('tableRound', 'floor', 100, 100, '원형 테이블', 'Round Table', G.ellipse, { aspect: true, style: { fill: '#d7b98e', line: '#7a5a2f' } });
m('chair', 'floor', 46, 46, '의자', 'Chair', (w, h) => [main(rect(0, h * 0.2, w, h * 0.8, 5)), dark(rect(0, 0, w, h * 0.24, 4))], { style: { fill: '#9fa8da', line: '#3949ab' }, text: BELOW });
m('sofa', 'floor', 180, 80, '소파', 'Sofa', (w, h) => [main(rect(0, 0, w, h, 10)), dark(rect(0, 0, w, h * 0.3, 8)), dark(rect(0, 0, w * 0.12, h, 8)), dark(rect(w * 0.88, 0, w * 0.12, h, 8))], { style: { fill: '#a5d6a7', line: '#2e7d32' }, text: [0.12, 0.3, 0.88, 1] });
m('bed', 'floor', 140, 200, '침대', 'Bed', (w, h) => [main(rect(0, 0, w, h, 6)), light(rect(w * 0.08, h * 0.04, w * 0.38, h * 0.14, 6)), light(rect(w * 0.54, h * 0.04, w * 0.38, h * 0.14, 6)), dark(rect(0, h * 0.3, w, h * 0.7, 6))], { style: { fill: '#ffe0b2', line: '#8d6e63' }, text: [0, 0.3, 1, 1] });
m('desk', 'floor', 150, 75, '책상', 'Desk', (w, h) => [main(rect(0, 0, w, h, 3)), line(`${M(w * 0.7, 0)}V${f(h)}${M(w * 0.7, h / 2)}H${f(w)}`)], { style: { fill: '#bcaaa4', line: '#5d4037' } });
m('plant', 'floor', 60, 60, '화분', 'Plant', (w, h) => { const leaves = []; for (let i = 0; i < 8; i++) { const a = (i * 45 * Math.PI) / 180; leaves.push(ell(w / 2 + Math.cos(a) * w * 0.22 - w * 0.15, h / 2 + Math.sin(a) * h * 0.22 - h * 0.15, w * 0.3, h * 0.3)); } return [main(leaves.join('')), dark(circle(w / 2, h / 2, w * 0.14))]; }, { aspect: true, style: { fill: '#81c784', line: '#2e7d32' }, text: BELOW });
m('stairs', 'floor', 100, 160, '계단', 'Stairs', (w, h) => { const steps = []; for (let i = 1; i < 10; i++) steps.push(`${M(0, (h * i) / 10)}H${f(w)}`); return [main(rect(0, 0, w, h)), line(`${steps.join('')}${M(w / 2, h * 0.9)}V${f(h * 0.1)}L${f(w * 0.4)} ${f(h * 0.2)}${M(w / 2, h * 0.1)}L${f(w * 0.6)} ${f(h * 0.2)}`)]; }, { style: { fill: '#eeeeee', line: '#424242' }, text: BELOW });
m('toilet', 'floor', 50, 70, '변기', 'Toilet', (w, h) => [main(rect(0, 0, w, h * 0.28, 4)), main(ell(w * 0.08, h * 0.25, w * 0.84, h * 0.75))], { style: { fill: '#ffffff', line: '#607d8b' }, text: BELOW });
m('sink', 'floor', 70, 50, '세면대', 'Sink', (w, h) => [main(rect(0, 0, w, h, 4)), line(ell(w * 0.15, h * 0.18, w * 0.7, h * 0.66)), solid(circle(w / 2, h * 0.15, 2.5))], { style: { fill: '#ffffff', line: '#607d8b' }, text: BELOW });

// ── block diagram
m('block', 'blocks', 130, 70, '블록', 'Block', G.rect, { qs: 'fill' });
m('block3d', 'blocks', 130, 80, '3D 블록', '3-D Block', (w, h) => { const d = Math.min(w, h) * 0.16; return [main(poly([[0, d], [w - d, d], [w - d, h], [0, h]])), light(poly([[0, d], [d, 0], [w, 0], [w - d, d]])), dark(poly([[w - d, d], [w, 0], [w, h - d], [w - d, h]]))]; }, { text: [0, 0.16, 0.84, 1] });
m('layers', 'blocks', 130, 90, '겹친 층', 'Stacked Layers', (w, h) => [main(rect(w * 0.12, 0, w * 0.88, h * 0.76, 4)), main(rect(w * 0.06, h * 0.12, w * 0.88, h * 0.76, 4)), main(rect(0, h * 0.24, w * 0.88, h * 0.76, 4))], { text: [0, 0.24, 0.88, 1] });
m('pyramid', 'blocks', 140, 120, '피라미드', 'Pyramid', (w, h) => [main(poly([[w / 2, 0], [w, h], [0, h]])), line(`${M(w * 0.33, h * 0.33)}H${f(w * 0.67)}${M(w * 0.17, h * 0.67)}H${f(w * 0.83)}`)], { text: [0.2, 0.68, 0.8, 1] });
m('funnel', 'blocks', 140, 120, '깔때기', 'Funnel', (w, h) => [main(poly([[0, 0], [w, 0], [w * 0.62, h * 0.65], [w * 0.62, h], [w * 0.38, h], [w * 0.38, h * 0.65]])), line(`${M(w * 0.2, h * 0.22)}H${f(w * 0.8)}${M(w * 0.4, h * 0.45)}H${f(w * 0.6)}`)], { text: [0.1, 0, 0.9, 0.22] });
m('target', 'blocks', 100, 100, '과녁', 'Target', (w, h) => [main(ell(0, 0, w, h)), light(ell(w * 0.17, h * 0.17, w * 0.66, h * 0.66)), main(ell(w * 0.34, h * 0.34, w * 0.32, h * 0.32))], { aspect: true, text: BELOW });
m('gear', 'blocks', 100, 100, '톱니바퀴', 'Gear', (w, h) => { const pts = []; const teeth = 10; for (let i = 0; i < teeth * 2; i++) { const a = ((i / (teeth * 2)) * 360 - 90) * (Math.PI / 180); const rr = i % 2 ? 0.4 : 0.5; pts.push([w / 2 + Math.cos(a) * w * rr, h / 2 + Math.sin(a) * h * rr]); pts.push([w / 2 + Math.cos(a + 0.3) * w * rr, h / 2 + Math.sin(a + 0.3) * h * rr]); } return [main(`${poly(pts)}${ell(w * 0.32, h * 0.32, w * 0.36, h * 0.36)}`)]; }, { aspect: true, text: BELOW });
m('tag', 'blocks', 120, 60, '태그', 'Tag', (w, h, p, r) => [main(poly([[0, 0], [w * 0.78, 0], [w, h / 2], [w * 0.78, h], [0, h]], r)), light(circle(w * 0.8, h / 2, Math.min(w, h) * 0.07))], { text: [0, 0, 0.75, 1] });
m('circleRing', 'blocks', 110, 110, '고리', 'Ring', (w, h) => [main(`${ell(0, 0, w, h)}${ell(w * 0.2, h * 0.2, w * 0.6, h * 0.6)}`)], { aspect: true, text: [0.22, 0.22, 0.78, 0.78] });

// ── timeline
m('timelineBar', 'timeline', 600, 34, '타임라인 막대', 'Timeline Bar', (w, h) => { const ticks = []; for (let i = 1; i < 10; i++) ticks.push(`${M((w * i) / 10, h * 0.25)}V${f(h * 0.75)}`); return [main(poly([[0, 0], [w - h / 2, 0], [w, h / 2], [w - h / 2, h], [0, h]])), line(ticks.join(''))]; }, { qs: 'fill', text: [0, 1.1, 1, 2] });
m('milestoneMarker', 'timeline', 30, 80, '마일스톤 표식', 'Milestone Marker', (w, h) => [line(`${M(w / 2, w)}V${f(h)}`), main(poly([[w / 2, 0], [w, w / 2], [w / 2, w], [0, w / 2]]))], { qs: 'intense', text: [-2, -0.75, 3, -0.02], points: [[0.5, 0], [0.5, 1]] });
m('intervalBlock', 'timeline', 160, 36, '구간 블록', 'Interval Block', (w, h) => [main(rect(0, 0, w, h, h / 3))], { qs: 'subtle' });
m('todayMarker', 'timeline', 24, 140, '오늘 표식', 'Today Marker', (w, h) => [solid(poly([[0, 0], [w, 0], [w / 2, w * 0.8]])), line(`${M(w / 2, w * 0.8)}V${f(h)}`)], { style: { line: '#e5484d', fill: '#e5484d' }, text: [-1.5, -0.3, 2.5, -0.02], points: [[0.5, 0], [0.5, 1]] });
m('eventPin', 'timeline', 40, 60, '이벤트 핀', 'Event Pin', (w, h) => [main(`${M(w / 2, h)}C${f(w * 0.1)} ${f(h * 0.6)} 0 ${f(h * 0.45)} 0 ${f(w / 2)}A${f(w / 2)} ${f(w / 2)} 0 0 1 ${f(w)} ${f(w / 2)}C${f(w)} ${f(h * 0.45)} ${f(w * 0.9)} ${f(h * 0.6)} ${f(w / 2)} ${f(h)}Z`), light(circle(w / 2, w / 2, w * 0.2))], { text: BELOW, qs: 'intense' });

// ── electrical
const elec = { style: { fill: 'none', lineWidth: 2 }, points: ENDS, text: [0, 1.05, 1, 1.9], kind: 'lineShape' };
m('resistor', 'electrical', 100, 30, '저항', 'Resistor', (w, h) => [line(`${M(0, h / 2)}H${f(w * 0.2)}L${f(w * 0.25)} 0L${f(w * 0.35)} ${f(h)}L${f(w * 0.45)} 0L${f(w * 0.55)} ${f(h)}L${f(w * 0.65)} 0L${f(w * 0.75)} ${f(h)}L${f(w * 0.8)} ${f(h / 2)}H${f(w)}`)], elec);
m('capacitor', 'electrical', 80, 40, '커패시터', 'Capacitor', (w, h) => [line(`${M(0, h / 2)}H${f(w * 0.44)}${M(w * 0.44, 0)}V${f(h)}${M(w * 0.56, 0)}V${f(h)}${M(w * 0.56, h / 2)}H${f(w)}`)], elec);
m('inductor', 'electrical', 100, 30, '인덕터', 'Inductor', (w, h) => { let d = `${M(0, h)}H${f(w * 0.15)}`; for (let i = 0; i < 4; i++) d += `A${f(w * 0.0875)} ${f(h * 0.8)} 0 0 1 ${f(w * (0.15 + (i + 1) * 0.175))} ${f(h)}`; return [line(`${d}H${f(w)}`)]; }, { ...elec, points: [[0, 1], [1, 1]] });
m('battery', 'electrical', 80, 44, '전지', 'Battery', (w, h) => [line(`${M(0, h / 2)}H${f(w * 0.42)}${M(w * 0.42, 0)}V${f(h)}${M(w * 0.58, h * 0.25)}V${f(h * 0.75)}${M(w * 0.58, h / 2)}H${f(w)}`)], elec);
m('ground', 'electrical', 50, 50, '접지', 'Ground', (w, h) => [line(`${M(w / 2, 0)}V${f(h * 0.5)}${M(0, h * 0.5)}H${f(w)}${M(w * 0.18, h * 0.7)}H${f(w * 0.82)}${M(w * 0.36, h * 0.9)}H${f(w * 0.64)}`)], { ...elec, points: [[0.5, 0]] });
m('switchElec', 'electrical', 100, 40, '스위치', 'Switch', (w, h) => [line(`${M(0, h * 0.8)}H${f(w * 0.3)}L${f(w * 0.68)} ${f(h * 0.1)}${M(w * 0.7, h * 0.8)}H${f(w)}`), line(`${circle(w * 0.3, h * 0.8, 3)}${circle(w * 0.7, h * 0.8, 3)}`)], { ...elec, points: [[0, 0.8], [1, 0.8]] });
m('lamp', 'electrical', 60, 60, '램프', 'Lamp', (w, h) => [line(`${ell(w * 0.15, h * 0.15, w * 0.7, h * 0.7)}${M(0, h / 2)}H${f(w * 0.15)}${M(w * 0.85, h / 2)}H${f(w)}${M(w * 0.25, h * 0.25)}L${f(w * 0.75)} ${f(h * 0.75)}${M(w * 0.75, h * 0.25)}L${f(w * 0.25)} ${f(h * 0.75)}`)], elec);
m('diode', 'electrical', 90, 40, '다이오드', 'Diode', (w, h) => [line(`${M(0, h / 2)}H${f(w * 0.35)}${M(w * 0.65, h / 2)}H${f(w)}${M(w * 0.65, 0)}V${f(h)}`), solid(poly([[w * 0.35, 0], [w * 0.65, h / 2], [w * 0.35, h]]))], elec);
m('voltageSource', 'electrical', 60, 60, '직류 전원', 'DC Source', (w, h) => [line(`${ell(w * 0.1, h * 0.1, w * 0.8, h * 0.8)}${M(w / 2, 0)}V${f(h * 0.1)}${M(w / 2, h * 0.9)}V${f(h)}${M(w * 0.42, h * 0.32)}H${f(w * 0.58)}${M(w / 2, h * 0.24)}V${f(h * 0.4)}${M(w * 0.42, h * 0.68)}H${f(w * 0.58)}`)], { ...elec, points: [[0.5, 0], [0.5, 1]] });
m('acSource', 'electrical', 60, 60, '교류 전원', 'AC Source', (w, h) => [line(`${ell(w * 0.1, h * 0.1, w * 0.8, h * 0.8)}${M(w / 2, 0)}V${f(h * 0.1)}${M(w / 2, h * 0.9)}V${f(h)}${M(w * 0.28, h / 2)}C${f(w * 0.38)} ${f(h * 0.25)} ${f(w * 0.45)} ${f(h * 0.25)} ${f(w / 2)} ${f(h / 2)}S${f(w * 0.62)} ${f(h * 0.75)} ${f(w * 0.72)} ${f(h / 2)}`)], { ...elec, points: [[0.5, 0], [0.5, 1]] });
m('transistor', 'electrical', 70, 80, '트랜지스터', 'Transistor', (w, h) => [line(`${M(0, h / 2)}H${f(w * 0.4)}${M(w * 0.4, h * 0.25)}V${f(h * 0.75)}${M(w * 0.4, h * 0.38)}L${f(w)} 0${M(w * 0.4, h * 0.62)}L${f(w)} ${f(h)}`), solid(poly([[w * 0.86, h * 0.8], [w * 0.95, h * 0.96], [w * 0.76, h * 0.94]]))], { ...elec, points: [[0, 0.5], [1, 0], [1, 1]] });

// ── special shapes made by the drawing tools (not in a stencil)
masters.push({ id: 'freeform', cat: null, w: 100, h: 100, name: { ko: '자유형', en: 'Freeform' }, points: SIDES, text: [0, 0, 1, 1], params: {}, style: {}, custom: true,
  geometry: (w, h, p) => {
    const pts = (p.points ?? []).map(([x, y]) => [x * w, y * h]);
    return pts.length > 1 ? [(p.closed ? main : line)(poly(pts, 0, Boolean(p.closed)))] : [line(rect(0, 0, w, h))];
  } });
// An outline of its own (imported from Visio, or a saved custom shape): parts in unit coordinates (0…1).
masters.push({ id: 'svgpath', cat: null, w: 100, h: 100, name: { ko: '사용자 도형', en: 'Custom Shape' }, points: SIDES, text: [0, 0, 1, 1], params: {}, style: {}, custom: true,
  geometry: (w, h, p) => (p.parts ?? []).map((part) => ({ d: scalePath(part.d, w, h), fill: part.fill ?? 'main' })) });
masters.push({ id: 'image', cat: null, w: 160, h: 120, name: { ko: '그림', en: 'Picture' }, points: SIDES_AND_CORNERS, text: [0, 1.02, 1, 1.4], params: {}, style: { fill: 'none', line: 'none' }, custom: true, geometry: (w, h) => [line(rect(0, 0, w, h))] });
masters.push({ id: 'group', cat: null, w: 100, h: 100, name: { ko: '그룹', en: 'Group' }, points: SIDES, text: [0, 0, 1, 1], params: {}, style: { fill: 'none', line: 'none' }, custom: true, geometry: () => [] });

/** Mirrors a path's x coordinates (absolute commands only: M L H V C Q S T A Z, as written here). */
export function mirrorX(d, w) {
  let out = '';
  const re = /([MLHVCSQTAZ])([^MLHVCSQTAZ]*)/gi;
  let match;
  while ((match = re.exec(d))) {
    const cmd = match[1];
    const nums = match[2].trim() ? match[2].trim().split(/[\s,]+/).map(Number) : [];
    let mapped;
    if (cmd === 'H') mapped = nums.map((x) => w - x);
    else if (cmd === 'V' || cmd === 'Z') mapped = nums;
    else if (cmd === 'A') mapped = nums.map((v, i) => (i % 7 === 4 ? 1 - v : i % 7 === 5 ? w - v : v));
    else mapped = nums.map((v, i) => (i % 2 === 0 ? w - v : v));
    out += cmd + mapped.map((v) => f(v)).join(' ');
  }
  return out;
}

export const MASTERS = masters;
const byId = new Map(masters.map((master) => [master.id, master]));
export const masterById = (id) => byId.get(id) ?? byId.get('rect');
export const hasMaster = (id) => byId.has(id);
export const mastersIn = (cat) => masters.filter((master) => master.cat === cat);

/** The parameter values of a shape: its own, else the master's defaults. */
export function shapeParams(shape, master = masterById(shape.master)) {
  const out = {};
  for (const [key, def] of Object.entries(master.params ?? {})) out[key] = shape.params?.[key] ?? def.def;
  if (master.id === 'freeform') { out.points = shape.params?.points ?? []; out.closed = Boolean(shape.params?.closed); }
  if (master.id === 'svgpath') out.parts = shape.params?.parts ?? [];
  return out;
}

/** Connection points of a shape in its own coordinates. */
export function connectionPoints(shape, master = masterById(shape.master)) {
  const list = shape.points?.length ? shape.points : master.points;
  return list.map(([x, y]) => ({ x: x * shape.w, y: y * shape.h, nx: x, ny: y }));
}

/** Searches the masters by name (both languages) and id. */
export function searchMasters(query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return [];
  return masters.filter((master) => master.cat && (master.id.toLowerCase().includes(q) || master.name.ko.toLowerCase().includes(q) || master.name.en.toLowerCase().includes(q)));
}
