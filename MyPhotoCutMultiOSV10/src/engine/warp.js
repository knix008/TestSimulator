// Caricature exaggeration: smooth local magnifications of the head and its features.
//
// Each operation scales a region (an ellipse with a centre, radii and tilt) by (sx, sy) in its
// middle, fading to no change at its rim, so the picture never tears. The picture is drawn
// backwards: every output pixel asks where it came from (inverse maps applied last-to-first), so
// there are no holes. Operations are built in order (head first, then forehead, jaw, chin, eyes,
// nose, mouth), each at the place its feature has after the earlier ones (forward map).
import { clamp, createRaster, sample } from './raster.js';
import { ellipsePoint } from './face.js';

/** The exaggeration controls (1 = as in the photo) and their ranges. */
export const WARP_KEYS = ['head', 'eyes', 'nose', 'mouth', 'chin', 'jaw', 'forehead', 'ears'];
export const WARP_RANGE = { min: 0.5, max: 2.2 };
export const STRENGTH_RANGE = { min: 0, max: 2 };
export const NO_WARP = Object.freeze({ head: 1, eyes: 1, nose: 1, mouth: 1, chin: 1, jaw: 1, forehead: 1, ears: 1, strength: 1 });

/**
 * A style's exaggeration fitted to one face: each feature's value times how much it stands out
 * (face.js distinctiveness). Without a face (or factors) the style's own values.
 */
export function personalWarp(styleWarp, factors) {
  const out = normalizeWarp({ ...styleWarp, strength: 1 });
  if (!factors) return out;
  for (const key of Object.keys(factors)) if (key in out) out[key] = Math.round(clamp(out[key] * factors[key], WARP_RANGE.min, WARP_RANGE.max) * 100) / 100;
  return out;
}

/** Fills gaps and clamps a set of exaggeration values. */
export function normalizeWarp(raw = {}) {
  const out = { ...NO_WARP };
  for (const key of WARP_KEYS) {
    const v = Number(raw?.[key]);
    out[key] = Number.isFinite(v) ? clamp(v, WARP_RANGE.min, WARP_RANGE.max) : 1;
  }
  const s = Number(raw?.strength);
  out.strength = Number.isFinite(s) ? clamp(s, STRENGTH_RANGE.min, STRENGTH_RANGE.max) : 1;
  return out;
}

// Falloff: 0 inside the plateau (the region is scaled evenly there), easing to 1 at the rim.
// A plateau keeps a feature's whole shape magnified instead of only its middle.
function fall(t, plateau) {
  if (t >= 1) return 1;
  if (t <= plateau) return 0;
  const x = (t - plateau) / (1 - plateau);
  return x * x * (3 - 2 * x);
}

/** Output → input for one operation. */
export function inverseOp(op, x, y) {
  const dx = x - op.cx;
  const dy = y - op.cy;
  const c = op.cos;
  const s = op.sin;
  const u = dx * c + dy * s;
  const v = -dx * s + dy * c;
  const t = Math.sqrt((u / op.rx) ** 2 + (v / op.ry) ** 2);
  if (t >= 1) return [x, y];
  const h = fall(t, op.plateau);
  const ku = op.ax + (1 - op.ax) * h;
  const kv = op.ay + (1 - op.ay) * h;
  const uu = u * ku;
  const vv = v * kv;
  return [op.cx + uu * c - vv * s, op.cy + uu * s + vv * c];
}

/** Input → output for one operation (the inverse solved by fixed-point steps; used for feature points only). */
export function forwardOp(op, x, y) {
  let px = x;
  let py = y;
  for (let i = 0; i < 40; i++) {
    const [ix, iy] = inverseOp(op, px, py);
    const ex = x - ix;
    const ey = y - iy;
    if (Math.abs(ex) + Math.abs(ey) < 0.01) break;
    px += ex * 0.9;
    py += ey * 0.9;
  }
  return [px, py];
}

function makeOp(cx, cy, angle, rx, ry, sx, sy, plateau = 0.3) {
  // Shrinking is limited (and gets no plateau) so the region never folds over itself.
  const scaleX = clamp(sx, 0.45, 3);
  const scaleY = clamp(sy, 0.45, 3);
  const shrinking = scaleX < 1 || scaleY < 1;
  return { cx, cy, rx: Math.max(2, rx), ry: Math.max(2, ry), cos: Math.cos(angle), sin: Math.sin(angle), ax: 1 / scaleX, ay: 1 / scaleY, sx: scaleX, sy: scaleY, plateau: shrinking ? 0 : plateau };
}

const amount = (value, strength) => 1 + (value - 1) * strength;

/**
 * The operations for a face and a set of exaggerations, plus the features where they end up.
 * Returns { ops, features } (features after the warp: decorations go there).
 */
export function buildWarp(features, rawParams) {
  const p = normalizeWarp(rawParams);
  const k = p.strength;
  const ops = [];
  let f = structuredClone(features);
  const angle = f.face.angle ?? 0;
  const push = (op) => {
    if (Math.abs(op.sx - 1) < 0.005 && Math.abs(op.sy - 1) < 0.005) return;
    ops.push(op);
    f = moveFeatures(f, op);
  };
  const at = (u, v) => ellipsePoint(f.face, u, v);

  // 1. The whole head, around a point low in the face so the neck stays where it is.
  const head = amount(p.head, k);
  {
    const c = at(0, 0.25);
    // The plateau holds the whole head (hair included); the band around it is squeezed.
    push(makeOp(c.x, c.y, angle, f.face.rx * 2.6, f.face.ry * 2.2, head, head, 0.5));
  }
  // 2. Forehead: taller (and a little wider) above the brows.
  const forehead = amount(p.forehead, k);
  {
    const c = at(0, -0.62);
    push(makeOp(c.x, c.y, angle, f.face.rx * 1.25, f.face.ry * 0.72, 1 + (forehead - 1) * 0.45, forehead));
  }
  // 3. Ears / cheeks: the sides of the head wider.
  const ears = amount(p.ears, k);
  for (const side of [-1, 1]) {
    const c = at(side * 0.98, 0.02);
    push(makeOp(c.x, c.y, angle, f.face.rx * 0.5, f.face.ry * 0.42, ears, 1 + (ears - 1) * 0.6));
  }
  // 4. Jaw: the lower face wider.
  const jaw = amount(p.jaw, k);
  {
    const c = at(0, 0.62);
    push(makeOp(c.x, c.y, angle, f.face.rx * 1.35, f.face.ry * 0.62, jaw, 1 + (jaw - 1) * 0.25));
  }
  // 5. Chin: longer.
  const chin = amount(p.chin, k);
  {
    const c = at(0, 0.84);
    push(makeOp(c.x, c.y, angle, f.face.rx * 0.85, f.face.ry * 0.55, 1 + (chin - 1) * 0.3, chin));
  }
  // 6. Eyes.
  const eyes = amount(p.eyes, k);
  for (let i = 0; i < 2; i++) {
    const e = f.eyes[i];
    push(makeOp(e.x, e.y, angle, e.r * 2.6, e.r * 2.3, eyes, eyes, 0.35));
  }
  // 7. Nose.
  const nose = amount(p.nose, k);
  push(makeOp(f.nose.x, f.nose.y - f.nose.r * 0.35, angle, f.nose.r * 2.5, f.nose.r * 2.8, nose, nose, 0.3));
  // 8. Mouth: wider more than taller.
  const mouth = amount(p.mouth, k);
  push(makeOp(f.mouth.x, f.mouth.y, angle, f.mouth.w * 1.7, Math.max(f.mouth.h * 3, f.mouth.w * 0.75), mouth, 1 + (mouth - 1) * 0.65, 0.3));
  return { ops, features: f };
}

/** Features moved by one operation. */
function moveFeatures(f, op) {
  const move = (q) => { const [x, y] = forwardOp(op, q.x, q.y); return { ...q, x, y }; };
  const out = structuredClone(f);
  // The head ellipse: its centre moves and its radii grow by the local scale.
  const centre = forwardOp(op, f.face.cx, f.face.cy);
  const top = forwardOp(op, f.forehead.x, f.forehead.y);
  const bottom = forwardOp(op, f.chin.x, f.chin.y);
  const side = ellipsePoint(f.face, 1, 0);
  const sideOut = forwardOp(op, side.x, side.y);
  out.face.cx = centre[0];
  out.face.cy = centre[1];
  out.face.ry *= Math.hypot(bottom[0] - top[0], bottom[1] - top[1]) / Math.max(1, Math.hypot(f.chin.x - f.forehead.x, f.chin.y - f.forehead.y));
  out.face.rx = Math.max(4, Math.hypot(sideOut[0] - centre[0], sideOut[1] - centre[1]));
  // How much the operation magnifies around a point (a 4-pixel step, measured both ways).
  const scaleAt = (q) => {
    const [x0, y0] = forwardOp(op, q.x, q.y);
    const [x1, y1] = forwardOp(op, q.x + 4, q.y + 4);
    return Math.max(0.3, Math.hypot(x1 - x0, y1 - y0) / Math.hypot(4, 4));
  };
  out.eyes = f.eyes.map((e) => ({ ...move(e), r: e.r * scaleAt(e) }));
  out.brows = (f.brows ?? []).map(move);
  out.nose = { ...move(f.nose), r: f.nose.r * scaleAt(f.nose) };
  const ms = scaleAt(f.mouth);
  out.mouth = { ...move(f.mouth), w: f.mouth.w * ms, h: f.mouth.h * ms };
  out.chin = move(f.chin);
  out.forehead = move(f.forehead);
  return out;
}

/** Where every output pixel comes from: { mapX, mapY } (Float32, source pixels). */
export function warpMap(width, height, ops) {
  const n = width * height;
  const mapX = new Float32Array(n);
  const mapY = new Float32Array(n);
  // Bounding boxes skip the operations a pixel is far from.
  const boxes = ops.map((op) => { const r = Math.max(op.rx, op.ry); return [op.cx - r, op.cy - r, op.cx + r, op.cy + r]; });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let px = x;
      let py = y;
      for (let i = ops.length - 1; i >= 0; i--) {
        const b = boxes[i];
        if (px < b[0] || py < b[1] || px > b[2] || py > b[3]) continue;
        [px, py] = inverseOp(ops[i], px, py);
      }
      const at = y * width + x;
      mapX[at] = px;
      mapY[at] = py;
    }
  }
  return { mapX, mapY };
}

/** A raster redrawn through a map (bilinear). */
export function applyMap(src, map) {
  const out = createRaster(src.width, src.height);
  const o = out.data;
  const px = new Float32Array(4);
  for (let i = 0, j = 0; i < map.mapX.length; i++, j += 4) {
    sample(src, map.mapX[i], map.mapY[i], px);
    o[j] = px[0]; o[j + 1] = px[1]; o[j + 2] = px[2]; o[j + 3] = px[3];
  }
  return out;
}

/** A one-channel image (the person mask) redrawn through a map. */
export function applyMapChannel(channel, width, height, map) {
  const out = new Float32Array(width * height);
  for (let i = 0; i < out.length; i++) {
    const x = clamp(map.mapX[i], 0, width - 1);
    const y = clamp(map.mapY[i], 0, height - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const tx = x - x0;
    const ty = y - y0;
    const a = channel[y0 * width + x0] + (channel[y0 * width + x1] - channel[y0 * width + x0]) * tx;
    const b = channel[y1 * width + x0] + (channel[y1 * width + x1] - channel[y1 * width + x0]) * tx;
    out[i] = a + (b - a) * ty;
  }
  return out;
}

/** Warps a raster (and optionally its mask) by a face's exaggerations: { raster, mask, features }. */
export function caricatureWarp(src, features, params, mask = null) {
  const { ops, features: moved } = buildWarp(features, params);
  if (!ops.length) return { raster: src, mask, features: moved };
  const map = warpMap(src.width, src.height, ops);
  return { raster: applyMap(src, map), mask: mask ? applyMapChannel(mask, src.width, src.height, map) : null, features: moved };
}
