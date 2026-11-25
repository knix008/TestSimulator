// Hole positions from a 3D sketch (features.js holePositions): holes on two faces of a block at once, each along
// the normal of its own face — the volume taken out is exactly two cylinders.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createSketchGeometry, addRectangle } from '../../src/cad/sketch.js';

await loadKernel();
const R = rep();

test('a 3D sketch with a point on the top face and one on a side face drills two holes, each square to its face', () => {
  const part = { id: 'p', name: 'P', features: [] };
  const sk = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() }); addRectangle(sk, -30, -20, 30, 20); part.features.push(sk);
  part.features.push(createFeature(part, 'extrude', { sketch: sk.id, depth: 30 }));
  const v0 = R.measureVolume(regenerate(part).body);
  // A point on the top (z = 30) and one on the +x side (x = 30).
  const s3 = createFeature(part, 'sketch3d', { points: [[0, 0, 30], [30, 5, 12]] });
  part.features.push(s3);
  const hole = createFeature(part, 'hole', { sketch: s3.id, diameter: 6, depth: 10, through: false, kind: 'simple' });
  part.features.push(hole);
  const r = regenerate(part);
  assert.ok(r.results.get(hole.id).ok, String(r.results.get(hole.id).error));
  const removed = v0 - R.measureVolume(r.body);
  // Each hole: a 10 deep cylinder of Ø6 plus its 118° drill point cone (both the same, so 2 × one hole).
  const one = Math.PI * 9 * 10 + (Math.PI * 9 * (3 / Math.tan((59 * Math.PI) / 180))) / 3;
  assert.ok(Math.abs(removed - 2 * one) < 1e-3 * one || Math.abs(removed - 2 * Math.PI * 9 * 10) < 1e-3 * one, `${removed} vs ${2 * one}`);
  // One hole wall runs down from the top (z extent 10, x extent 6), one in from the side (x extent 10, z extent 6).
  const ext = r.body.faces.filter((fc) => fc.geomType === 'CYLINDRE').map((fc) => { const [lo, hi] = fc.boundingBox.bounds; return [Math.round(hi[0] - lo[0]), Math.round(hi[2] - lo[2])]; });
  assert.ok(ext.some(([x, z]) => x === 6 && z === 10) && ext.some(([x, z]) => x === 10 && z === 6), JSON.stringify(ext));
});
