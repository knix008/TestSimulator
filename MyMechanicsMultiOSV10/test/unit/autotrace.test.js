// Auto Trace (autotrace.js): a picture's shapes traced into lines, arcs and circles — a rectangle with a round
// hole and a slot hole, placed at the picture's scale and position, closed profiles of the right areas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { shapeMask, maskLoops, fitCircle, traceImage, traceToSketch } from '../../src/cad/autotrace.js';
import { createSketchGeometry, addLine, addArc, addCircle, newSketchId, profiles } from '../../src/cad/sketch.js';

function picture() {
  const W = 200, H = 120; const data = new Uint8Array(W * H * 4).fill(255);
  const set = (x, row, v) => { const i = 4 * (row * W + x); data[i] = data[i + 1] = data[i + 2] = v; };
  for (let row = 20; row < 100; row++) for (let x = 20; x < 180; x++) set(x, row, 0);
  for (let row = 0; row < H; row++) for (let x = 0; x < W; x++) if (Math.hypot(x + 0.5 - 100, row + 0.5 - 60) < 25) set(x, row, 255);
  for (let row = 0; row < H; row++) for (let x = 0; x < W; x++) { const cx = Math.max(140, Math.min(165, x + 0.5)); if (Math.hypot(x + 0.5 - cx, row + 0.5 - 40) < 8) set(x, row, 255); }
  return { width: W, height: H, data };
}

test('the mask and its boundary loops: outer counterclockwise, holes clockwise', () => {
  const img = picture();
  const m = shapeMask(img, { mode: 'dark', threshold: 128 });
  const loops = maskLoops(m, img.width, img.height);
  assert.equal(loops.length, 3);
  const area = (l) => { let a = 0; for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
  const areas = loops.map(area).sort((a, b) => a - b);
  assert.ok(areas[0] < 0 && areas[1] < 0 && areas[2] > 0);
  assert.equal(areas[2], 160 * 80);
  // Light mode finds the background as the shape.
  assert.ok(maskLoops(shapeMask(img, { mode: 'light' }), img.width, img.height).length >= 3);
});

test('fitCircle recovers a circle; the trace gives 4 lines, a circle, 2 lines + 2 arcs', () => {
  const pts = Array.from({ length: 40 }, (_, i) => [3 + 7 * Math.cos(i / 6.4), -2 + 7 * Math.sin(i / 6.4)]);
  const c = fitCircle(pts); assert.ok(Math.abs(c.r - 7) < 1e-9 && Math.abs(c.c[0] - 3) < 1e-9);
  const tr = traceImage(picture(), { tol: 1 });
  const kinds = tr.map((l) => l.pieces.map((p) => p.kind).sort().join(',')).sort();
  assert.deepEqual(kinds, ['arc,arc,line,line', 'circle', 'line,line,line,line']);
  const circle = tr.find((l) => l.pieces[0].kind === 'circle').pieces[0];
  assert.ok(Math.abs(circle.r - 25) < 0.5 && Math.abs(circle.c[0] - 100) < 0.1 && Math.abs(circle.c[1] - 60) < 0.1);
});

test('placed in a sketch at the picture size: a closed profile 160 × 80 mm with its two holes', () => {
  const img = picture();
  const s = createSketchGeometry();
  const pic = { x: 0, y: 0, width: 200, aspect: 0.6, angle: 0 };
  const made = traceToSketch(s, traceImage(img, { tol: 1 }), pic, img.width, img.height, { addLine, addArc, addCircle, newPoint: (sk, x, y) => { const p = { id: newSketchId('p'), type: 'point', x, y }; sk.entities.push(p); return p; } });
  assert.equal(made.length, 4 + 1 + 4);
  const p = profiles(s);
  assert.equal(p.length, 1);
  assert.equal(p[0].holes.length, 2);
  assert.ok(Math.abs(p[0].outer.area - 160 * 80) < 160, String(p[0].outer.area));
  // Centred: the picture's centre is the sketch origin, so the rectangle spans x −80 … 80.
  const xs = s.entities.filter((e) => e.type === 'point').map((q) => q.x);
  assert.ok(Math.abs(Math.min(...xs) + 79.5) < 1 && Math.abs(Math.max(...xs) - 80) < 1);
});
