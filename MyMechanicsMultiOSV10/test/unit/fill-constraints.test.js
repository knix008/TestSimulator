// Fill surface constraint curves and boundary continuity (advanced.js buildFillSurface).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';

await loadKernel();
const R = rep();
const ok = (part) => { const r = regenerate(part); for (const [id, x] of r.results) assert.ok(x.ok, `${id}: ${x.error} ${x.detail ?? ''}`); return r; };
const dist = (shape, p) => { const q = new R.DistanceQuery(R.makeVertex(p)); return q.distanceTo(shape); };

test('a fill surface passes through a constraint curve inside its boundary', () => {
  const part = { id: 'p', name: 'P', features: [] };
  const loop = createFeature(part, 'sketch3d', { points: [[-20, -20, 0], [20, -20, 0], [20, 20, 0], [-20, 20, 0]], closed: true }); part.features.push(loop);
  const rise = createFeature(part, 'sketch3d', { points: [[-10, 0, 0], [0, 0, 6], [10, 0, 0]], spline: true }); part.features.push(rise);
  const fill = createFeature(part, 'fillSurface', { curve: loop.id }); part.features.push(fill);
  const flat = ok(part).surfaces.get(fill.id);
  assert.ok(dist(flat, [0, 0, 6]) > 5, 'without the constraint the patch is flat');
  fill.constraints = [rise.id];
  for (const continuity of ['contact', 'tangent', 'curvature']) {
    fill.continuity = continuity;
    const s = ok(part).surfaces.get(fill.id);
    assert.ok(dist(s, [0, 0, 6]) < 1e-3, `${continuity}: through the curve's top (${dist(s, [0, 0, 6])})`);
    assert.ok(dist(s, [5, 0, 4.5]) < 0.05, `${continuity}: along the curve`);
    // Still bounded by the loop.
    assert.ok(dist(s, [20, 0, 0]) < 1e-4 && dist(s, [0, -20, 0]) < 1e-4);
  }
});
