// Shared by the dataset generators (datasets.js, datasets-media.js): a seeded random generator,
// a dataset record, and a rasterizer that draws strokes with a random affine jitter.

export function rng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.normal = () => {
    const u = Math.max(1e-12, next());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };
  next.int = (n) => Math.floor(next() * n);
  return next;
}

const size = (shape) => shape.reduce((a, b) => a * b, 1);

export function makeDataset({ name, kind, inputShape, xs, ys, task, labels = null, featureNames = null, vocab = null }) {
  const n = ys.length / (task.kind === 'classification' ? 1 : size(task.outputShape));
  return { name, kind, inputShape, n, x: Float32Array.from(xs), y: Float32Array.from(ys), task, labels, featureNames, vocab };
}

function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Draws polylines (unit box) into a size×size grey image with a random affine jitter. */
export function rasterize(strokes, sizePx, r, { jitter = 1, thickness = 1.25, noise = 0.04 } = {}) {
  const scale = (0.82 + r() * 0.22 * jitter) * sizePx;
  const angle = (r() - 0.5) * 0.42 * jitter;
  const tx = (r() - 0.5) * 0.12 * jitter * sizePx + sizePx / 2;
  const ty = (r() - 0.5) * 0.12 * jitter * sizePx + sizePx / 2;
  const slant = (r() - 0.5) * 0.3 * jitter;
  const width = thickness * (0.75 + r() * 0.6 * jitter) * (sizePx / 16);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const map = ([x, y]) => {
    const u = (x - 0.5 + slant * (y - 0.5)) * scale;
    const v = (y - 0.5) * scale;
    return [tx + u * cos - v * sin, ty + u * sin + v * cos];
  };
  const segments = [];
  for (const line of strokes) {
    const points = line.map(map);
    for (let i = 1; i < points.length; i++) segments.push([...points[i - 1], ...points[i]]);
  }
  const out = new Float32Array(sizePx * sizePx);
  for (let y = 0; y < sizePx; y++) {
    for (let x = 0; x < sizePx; x++) {
      let d = Infinity;
      for (const [ax, ay, bx, by] of segments) d = Math.min(d, segmentDistance(x + 0.5, y + 0.5, ax, ay, bx, by));
      const ink = Math.max(0, Math.min(1, width / 2 + 0.5 - d));
      out[y * sizePx + x] = Math.max(0, Math.min(1, ink + r.normal() * noise));
    }
  }
  return out;
}
