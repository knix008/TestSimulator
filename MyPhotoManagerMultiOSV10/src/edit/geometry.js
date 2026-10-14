// Geometry of an edit as one affine transform from the (upright) source image
// to the output: quarter turns, flips, straightening (auto-cropped so no empty
// corners show), crop and resize. The same matrix draws the result and maps
// clicks on the preview back to source pixels.
//
// Matrices are [a, b, c, d, e, f] like canvas setTransform:
//   x' = a·x + c·y + e,   y' = b·x + d·y + f

export const DEFAULT_GEOMETRY = Object.freeze({ rotate: 0, flipH: false, flipV: false, straighten: 0, crop: null, resize: null });

export const IDENTITY = [1, 0, 0, 1, 0, 0];

export function multiply(m, n) {
  // m ∘ n (apply n first, then m)
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function invert(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det) return IDENTITY;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

export const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const translate = (x, y) => [1, 0, 0, 1, x, y];
const scale = (sx, sy) => [sx, 0, 0, sy, 0, 0];
const rotation = (radians) => [Math.cos(radians), Math.sin(radians), -Math.sin(radians), Math.cos(radians), 0, 0];

/** Scale of the largest same-aspect rectangle inside a w×h rectangle turned by `degrees`. */
export function straightenScale(w, h, degrees) {
  const t = Math.abs((degrees * Math.PI) / 180);
  if (!t) return 1;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return Math.min(w / (w * c + h * s), h / (w * s + h * c));
}

/**
 * Layout of an edit for a w×h source: { width, height, matrix, stages }.
 * `stages.uncropped` = size and matrix before crop/resize (what the crop tool shows).
 * `crop` is { x, y, w, h } as fractions of the uncropped image.
 * `resize` is { width, height } in output pixels (of the full-size image).
 * `sourceScale`: the source is a preview this many times smaller than the original (resize is scaled with it).
 */
export function layout(w, h, geometry = DEFAULT_GEOMETRY, { skipCrop = false, sourceScale = 1 } = {}) {
  const g = { ...DEFAULT_GEOMETRY, ...geometry };
  const turns = (((Math.round(g.rotate / 90) % 4) + 4) % 4);
  // 1. Quarter turns (clockwise), then flips of what is shown.
  let m = IDENTITY;
  let W = w;
  let H = h;
  if (turns === 1) { m = [0, 1, -1, 0, h, 0]; W = h; H = w; }
  if (turns === 2) { m = [-1, 0, 0, -1, w, h]; }
  if (turns === 3) { m = [0, -1, 1, 0, 0, w]; W = h; H = w; }
  if (g.flipH) m = multiply([-1, 0, 0, 1, W, 0], m);
  if (g.flipV) m = multiply([1, 0, 0, -1, 0, H], m);
  // 2. Straighten about the centre, keeping the largest upright rectangle.
  if (g.straighten) {
    const k = straightenScale(W, H, g.straighten);
    const W2 = Math.max(1, Math.round(W * k));
    const H2 = Math.max(1, Math.round(H * k));
    m = multiply(multiply(multiply(translate(W2 / 2, H2 / 2), rotation((g.straighten * Math.PI) / 180)), translate(-W / 2, -H / 2)), m);
    W = W2;
    H = H2;
  }
  const uncropped = { width: W, height: H, matrix: m };
  // 3. Crop.
  if (g.crop && !skipCrop) {
    const cx = Math.max(0, Math.min(1, g.crop.x));
    const cy = Math.max(0, Math.min(1, g.crop.y));
    const cw = Math.max(0.001, Math.min(1 - cx, g.crop.w));
    const ch = Math.max(0.001, Math.min(1 - cy, g.crop.h));
    m = multiply(translate(-Math.round(cx * W), -Math.round(cy * H)), m);
    W = Math.max(1, Math.round(cw * W));
    H = Math.max(1, Math.round(ch * H));
  }
  // 4. Resize (given in full-size pixels).
  if (g.resize && !skipCrop) {
    const tw = Math.max(1, Math.round(g.resize.width * sourceScale));
    const th = Math.max(1, Math.round(g.resize.height * sourceScale));
    m = multiply(scale(tw / W, th / H), m);
    W = tw;
    H = th;
  }
  return { width: W, height: H, matrix: m, stages: { uncropped } };
}

/** Output size of an edit for the full-size image (for the resize dialog and status bar). */
export function outputSize(w, h, geometry) {
  const { width, height } = layout(w, h, { ...geometry, resize: null });
  return { width, height };
}

/** Crop rectangle (fractions) of the given aspect ratio, as large as fits, centred. */
export function cropForAspect(imageW, imageH, aspect) {
  if (!aspect) return { x: 0, y: 0, w: 1, h: 1 };
  const imageAspect = imageW / imageH;
  if (aspect > imageAspect) {
    const h = imageAspect / aspect;
    return { x: 0, y: (1 - h) / 2, w: 1, h };
  }
  const w = aspect / imageAspect;
  return { x: (1 - w) / 2, y: 0, w, h: 1 };
}

/** Fits w×h into a box (never enlarging unless `enlarge`): { width, height }. */
export function fitSize(w, h, maxW, maxH, enlarge = false) {
  const k = Math.min(maxW / w, maxH / h, enlarge ? Infinity : 1);
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}
