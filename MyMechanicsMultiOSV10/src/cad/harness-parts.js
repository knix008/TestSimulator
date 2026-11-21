// Harness parts library (parameterised): connector housings and clips, their dimensions as plain maths and their
// solids on the kernel. Local frame of a part: +Z along the bundle (connectors: away from it, the mating face at
// z = depth, the wire entry at z = 0), +Y up (a connector's latch, the side away from a clip's mount).
//   connectors  rect25  single / dual row, 2.5 mm pitch, square pin cavities from the wire side, latch ramp on top
//               rect30  dual row, 3.0 mm pitch (a larger power housing)
//               round   circular housing, contacts on a pitch circle, coupling ring at the mating end
//   clips       pClip   band round the bundle and a flat mounting tab with a screw hole (below the bundle)
//               tieMount  square adhesive / screw base under the bundle and a cable-tie band round it
//               band    a plain band (spiral wrap / tape band)
import { rep } from './kernel.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a) || 1; return mul(a, 1 / l); };
const deg = (r) => (r * 180) / Math.PI;

export const CONNECTOR_TYPES = {
  rect25: { shape: 'rect', pitch: 2.5, maxRow: 8, wall: 2, depth: 16, cavity: 1.4, cavityDepth: 12, latch: { w: 4, l: 6, h: 1.5 } },
  rect30: { shape: 'rect', pitch: 3.0, rows: 2, wall: 2.2, depth: 18, cavity: 1.8, cavityDepth: 13, latch: { w: 5, l: 7, h: 1.8 } },
  round: { shape: 'round', pitch: 2.5, wall: 2.5, depth: 20, cavity: 1.2, cavityDepth: 14, ring: { t: 1.5, l: 8 } },
};
export const CONNECTOR_TYPE_IDS = Object.keys(CONNECTOR_TYPES);
export const CLIP_TYPES = {
  pClip: { band: 1.2, width: 12, tab: 14, hole: 5 },
  tieMount: { base: 20, plate: 2, band: 1, width: 4.8 },
  band: { band: 1.5, width: 6 },
};
export const CLIP_TYPE_IDS = Object.keys(CLIP_TYPES);

/**
 * A connector's dimensions: { type, shape, w, h (rect), D (round), depth, cavities: [[x, y]], cavity (square side
 * / hole Ø), cavityDepth, latch | ring, volume (exact) }.
 */
export function connectorDims(type, pins) {
  const T = CONNECTOR_TYPES[type] ?? CONNECTOR_TYPES.rect25;
  const n = Math.max(1, Math.round(pins));
  if (T.shape === 'round') {
    const rc = n === 1 ? 0 : T.pitch / (2 * Math.sin(Math.PI / n));
    const D = 2 * (rc + T.cavity / 2 + T.wall);
    const cavities = Array.from({ length: n }, (_, i) => (n === 1 ? [0, 0] : [rc * Math.cos((2 * Math.PI * i) / n + Math.PI / 2), rc * Math.sin((2 * Math.PI * i) / n + Math.PI / 2)]));
    const r = D / 2;
    const volume = Math.PI * r * r * T.depth - n * Math.PI * (T.cavity / 2) ** 2 * T.cavityDepth + Math.PI * ((r + T.ring.t) ** 2 - r * r) * T.ring.l;
    return { type: CONNECTOR_TYPES[type] ? type : 'rect25', shape: 'round', D, pitchRadius: rc, depth: T.depth, cavities, cavity: T.cavity, cavityDepth: T.cavityDepth, ring: T.ring, pins: n, volume };
  }
  const rows = T.rows ?? (n > T.maxRow ? 2 : 1);
  const cols = Math.ceil(n / rows);
  const w = cols * T.pitch + 2 * T.wall; const h = rows * T.pitch + 2 * T.wall;
  const cavities = [];
  for (let i = 0; i < n; i++) { const r = Math.floor(i / cols); const c = i % cols; cavities.push([(c - (cols - 1) / 2) * T.pitch, ((rows - 1) / 2 - r) * T.pitch]); }
  const volume = w * h * T.depth - n * T.cavity * T.cavity * T.cavityDepth + T.latch.w * T.latch.l * T.latch.h;
  return { type: CONNECTOR_TYPES[type] ? type : 'rect25', shape: 'rect', w, h, rows, cols, depth: T.depth, cavities, cavity: T.cavity, cavityDepth: T.cavityDepth, latch: T.latch, pins: n, volume };
}

/** A clip's dimensions round a bundle of diameter d: { type, r (bore), band, width, box: [[x, y, z], [x, y, z]] }. */
export function clipDims(type, d) {
  const id = CLIP_TYPES[type] ? type : 'pClip';
  const T = CLIP_TYPES[id]; const r = d / 2;
  if (id === 'pClip') return { type: id, r, ...T, box: [[-(r + T.band), -(r + T.band), -T.width / 2], [r + T.tab, r + T.band, T.width / 2]] };
  if (id === 'tieMount') return { type: id, r, ...T, box: [[-T.base / 2, -r - T.plate, -T.base / 2], [T.base / 2, r + T.band, T.base / 2]] };
  return { type: id, r, ...T, box: [[-(r + T.band), -(r + T.band), -T.width / 2], [r + T.band, r + T.band, T.width / 2]] };
}

/** Local solid of a connector (wire side at z = 0). */
export function connectorLocal(dims) {
  const R = rep();
  if (dims.shape === 'round') {
    const r = dims.D / 2;
    let s = R.makeCylinder(r, dims.depth, [0, 0, 0], [0, 0, 1]);
    for (const [x, y] of dims.cavities) s = s.cut(R.makeCylinder(dims.cavity / 2, dims.cavityDepth + 1, [x, y, -1], [0, 0, 1]));
    const ring = R.makeCylinder(r + dims.ring.t, dims.ring.l, [0, 0, dims.depth - dims.ring.l], [0, 0, 1]).cut(R.makeCylinder(r, dims.ring.l + 2, [0, 0, dims.depth - dims.ring.l - 1], [0, 0, 1]));
    return R.makeCompound([s, ring]);
  }
  const { w, h, depth, cavity: c, cavityDepth: cd, latch: L } = dims;
  let s = R.makeBox([-w / 2, -h / 2, 0], [w / 2, h / 2, depth]);
  for (const [x, y] of dims.cavities) s = s.cut(R.makeBox([x - c / 2, y - c / 2, -1], [x + c / 2, y + c / 2, cd]));
  // The latch ramp sits on the top face (a separate solid touching it: the volume adds exactly).
  const latch = R.makeBox([-L.w / 2, h / 2, depth - L.l], [L.w / 2, h / 2 + L.h, depth]);
  return R.makeCompound([s, latch]);
}

/** Local solid of a clip round the bundle axis (z), mounted on its −y side. */
export function clipLocal(dims) {
  const R = rep();
  const { r, band, width } = dims;
  const ring = (outer, inner, wdt) => R.makeCylinder(outer, wdt, [0, 0, -wdt / 2], [0, 0, 1]).cut(R.makeCylinder(inner, wdt + 2, [0, 0, -wdt / 2 - 1], [0, 0, 1]));
  if (dims.type === 'pClip') {
    const tab = R.makeBox([0, -r - band, -width / 2], [r + dims.tab, -r, width / 2]).cut(R.makeCylinder(dims.hole / 2, band + 2, [r + dims.tab / 2, -r - band - 1, 0], [0, 1, 0]));
    return ring(r + band, r, width).fuse(tab);
  }
  if (dims.type === 'tieMount') {
    const plate = R.makeBox([-dims.base / 2, -r - dims.plate, -dims.base / 2], [dims.base / 2, -r, dims.base / 2]);
    return plate.fuse(ring(r + band, r, width));
  }
  return ring(r + band, r, width);
}

/** Rotates a vector by the rotation that takes +Z to `ez` (as orientFrame's first step). */
function zTo(ez, v) {
  const z = [0, 0, 1];
  const c = Math.max(-1, Math.min(1, dot(z, ez)));
  const k0 = cross(z, ez);
  if (len(k0) < 1e-12) return c > 0 ? v.slice() : [v[0], -v[1], -v[2]];
  const k = unit(k0); const s = Math.sqrt(1 - c * c);
  return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
}

/** A local part placed with its +Z along `ez`, its +Y as close to `up` as can be, its origin at `at`. */
export function orientFrame(shape, ez, up, at) {
  const z = [0, 0, 1];
  const e = unit(ez);
  let s = shape;
  const c = Math.max(-1, Math.min(1, dot(z, e)));
  const k = cross(z, e);
  if (len(k) > 1e-12) s = s.rotate(deg(Math.acos(c)), [0, 0, 0], unit(k));
  else if (c < 0) s = s.rotate(180, [0, 0, 0], [1, 0, 0]);
  const y1 = zTo(e, [0, 1, 0]);
  let want = sub(up, mul(e, dot(up, e)));
  if (len(want) < 1e-9) want = y1;
  want = unit(want);
  const ang = Math.atan2(dot(cross(y1, want), e), dot(y1, want));
  if (Math.abs(ang) > 1e-12) s = s.rotate(deg(ang), [0, 0, 0], e);
  return s.translate(at);
}

/** The world "up" of a part along `dir`: +Z (Z-up world), or +Y when the part points along Z. */
export const upFor = (dir) => (Math.abs(unit(dir)[2]) > 0.999 ? [0, 1, 0] : [0, 0, 1]);
