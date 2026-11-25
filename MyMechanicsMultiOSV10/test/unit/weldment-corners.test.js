// Weldment corner treatment (miter / butt) and custom profiles (advanced.js buildStructural).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, addCircle, createSketchGeometry } from '../../src/cad/sketch.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

function frame(opts) {
  const part = { id: 'p', name: 'P', features: [] };
  const s = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() }); addRectangle(s, 0, 0, 100, 60); part.features.push(s);
  const extra = opts.custom ? (() => { const k = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'front' }, ...createSketchGeometry() }); addCircle(k, 0, 0, 8); part.features.push(k); return { profile: 'custom', profileSketch: k.id }; })() : {};
  const f = createFeature(part, 'structural', { sketch: s.id, profile: 'squareTube', w: 20, h: 20, t: 2, ...opts, ...extra }); part.features.push(f);
  const r = regenerate(part);
  assert.ok(r.results.get(f.id).ok, `${r.results.get(f.id).error} ${r.results.get(f.id).detail ?? ''}`);
  return { body: r.body, members: r.results.get(f.id).members };
}

test('mitered and butt-jointed tube frames: section area × centre-line length, closed outer corners, cut angles', () => {
  const A = 20 * 20 - 16 * 16;
  for (const corner of ['miter', 'butt1', 'butt2']) {
    const { body, members } = frame({ corner });
    near(R.measureVolume(body), A * 2 * (100 + 60), 1e-6);
    const [lo, hi] = body.boundingBox.bounds;
    near(lo[0], -10); near(hi[0], 110); near(lo[1], -10); near(hi[1], 70);
    if (corner === 'miter') {
      for (const m of members) { near(m.angle1, 45); near(m.angle2, 45); }
      // Cut length: the long side of a mitred piece (centre line + 2 × 10).
      assert.deepEqual(members.map((m) => m.cutLength).sort((a, b) => a - b), [80, 80, 120, 120]);
    }
  }
});

test('a custom profile drawn in a sketch (a Ø16 bar)', () => {
  const { body } = frame({ custom: true, corner: 'miter' });
  near(R.measureVolume(body), Math.PI * 64 * 2 * (100 + 60), 1e-4);
});
