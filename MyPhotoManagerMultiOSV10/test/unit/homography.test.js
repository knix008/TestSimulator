// Perspective panoramas: homography fitting, RANSAC with outliers, matching
// two synthetic views of one scene (the second seen through a known
// perspective), and the stitched mosaic against the scene itself.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apply, fitHomography, invert, multiply, pairHomography, ransacHomography, stitchPerspective } from '../../src/create/homography.js';

function rng(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/** A textured scene: smooth colour gradients plus many random blobs and boxes (lots of corners). */
function scene(w, h) {
  const random = rng(42);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; data[i] = 60 + (x / w) * 120; data[i + 1] = 80 + (y / h) * 100; data[i + 2] = 140; data[i + 3] = 255; }
  for (let k = 0; k < 420; k++) {
    const cx = random() * w; const cy = random() * h; const r = 3 + random() * 14;
    const col = [random() * 255, random() * 255, random() * 255];
    const box = random() < 0.5;
    for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(h, cy + r); y++) for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(w, cx + r); x++) {
      if (!box && (x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      const i = (y * w + x) * 4; data[i] = col[0]; data[i + 1] = col[1]; data[i + 2] = col[2];
    }
  }
  return { width: w, height: h, data };
}

/** A view: pixel (x, y) of the view shows the scene at H(x, y). */
function view(src, w, h, H) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [u, v] = apply(H, x + 0.5, y + 0.5);
    const sx = Math.min(src.width - 1, Math.max(0, Math.round(u - 0.5))); const sy = Math.min(src.height - 1, Math.max(0, Math.round(v - 0.5)));
    const i = (y * w + x) * 4; const j = (sy * src.width + sx) * 4;
    data[i] = src.data[j]; data[i + 1] = src.data[j + 1]; data[i + 2] = src.data[j + 2]; data[i + 3] = 255;
  }
  return { width: w, height: h, data };
}

test('fitHomography recovers an exact transform; invert/multiply agree', () => {
  const H = [1.05, 0.02, 30, -0.03, 0.98, 12, 0.0001, -0.00005, 1];
  const src = [[0, 0], [400, 0], [400, 300], [0, 300], [200, 150], [50, 260]];
  const dst = src.map(([x, y]) => apply(H, x, y));
  const fit = fitHomography(src, dst);
  for (const [x, y] of src) { const a = apply(fit, x, y); const b = apply(H, x, y); assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6); }
  const id = multiply(H, invert(H));
  [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((v, i) => assert.ok(Math.abs(id[i] / id[8] - v) < 1e-9));
});

test('RANSAC ignores outliers', () => {
  const H = [0.9, 0.1, 50, -0.05, 1.1, -20, 0.0002, 0.0001, 1];
  const random = rng(3);
  const src = []; const dst = [];
  for (let i = 0; i < 80; i++) { const p = [random() * 500, random() * 400]; src.push(p); dst.push(apply(H, ...p)); }
  for (let i = 0; i < 40; i++) { src.push([random() * 500, random() * 400]); dst.push([random() * 500, random() * 400]); }
  const fit = ransacHomography(src, dst);
  assert.ok(fit && fit.inliers >= 78, `inliers ${fit?.inliers}`);
  const [u, v] = apply(fit.H, 250, 200); const [a, b] = apply(H, 250, 200);
  assert.ok(Math.hypot(u - a, v - b) < 0.5);
});

// features: CREATE-PANOPERSP
test('two views with perspective: the homography is found and the mosaic matches the scene', () => {
  const world = scene(900, 520);
  const A = view(world, 520, 400, [1, 0, 40, 0, 1, 60, 0, 0, 1]);
  // Second view: further right, slightly turned and seen at an angle.
  const G = [0.97, -0.04, 330, 0.03, 0.99, 50, 0.00012, -0.00002, 1];
  const B = view(world, 520, 400, G);
  const found = pairHomography(A, B);
  assert.ok(found, 'matched');
  // True B → A: A shows world at x + 40, y + 60, so A⁻¹ ∘ G.
  const truth = multiply([1, 0, -40, 0, 1, -60, 0, 0, 1], G);
  for (const [x, y] of [[0, 0], [519, 0], [519, 399], [0, 399], [260, 200]]) {
    const [u, v] = apply(found.H, x, y); const [a, b] = apply(truth, x, y);
    assert.ok(Math.hypot(u - a, v - b) < 3, `corner (${x}, ${y}): ${u.toFixed(1)},${v.toFixed(1)} vs ${a.toFixed(1)},${b.toFixed(1)}`);
  }
  const out = stitchPerspective([A, B]);
  assert.ok(out, 'stitched');
  assert.ok(out.image.width > 700 && out.image.width < 950, `width ${out.image.width}`);
  // Compare the mosaic with the scene where it is covered.
  const toWorld = (x, y) => apply(multiply([1, 0, 40, 0, 1, 60, 0, 0, 1], invert(out.transforms[0])), x, y); // canvas → A → world
  let err = 0; let n = 0;
  for (let y = 5; y < out.image.height - 5; y += 7) for (let x = 5; x < out.image.width - 5; x += 7) {
    const o = (y * out.image.width + x) * 4;
    if (!out.image.data[o + 3]) continue;
    const [u, v] = toWorld(x + 0.5, y + 0.5);
    if (u < 2 || v < 2 || u > world.width - 3 || v > world.height - 3) continue;
    const s = (Math.floor(v) * world.width + Math.floor(u)) * 4;
    err += Math.abs(out.image.data[o] - world.data[s]) + Math.abs(out.image.data[o + 1] - world.data[s + 1]) + Math.abs(out.image.data[o + 2] - world.data[s + 2]);
    n += 3;
  }
  assert.ok(n > 3000, `samples ${n}`);
  assert.ok(err / n < 22, `mosaic error ${(err / n).toFixed(1)}`);
});

test('unrelated pictures do not match (the caller falls back)', () => {
  const a = scene(300, 200);
  const b = { width: 300, height: 200, data: new Uint8ClampedArray(300 * 200 * 4).fill(128) };
  assert.equal(stitchPerspective([a, b]), null);
});
