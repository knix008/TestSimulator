// Lofts through several sections, sweeps of any outline, tapered pads, holes,
// thickness with a chosen open face, and mesh decimation.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createEntity } from '../../src/domain/entities.js';
import { decimateMesh, holeVolume, loftSectionsMesh, sweepSectionMesh, taperedExtrude } from '../../src/domain/features.js';
import { analyzeMesh } from '../../src/domain/meshcheck.js';
import { exactVolume, featureFrom, meshVolume, solidMesh, THICKNESS_OPEN } from '../../src/domain/solids.js';

const near = (a, b, rel = 1e-9) => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel + 1e-9, `${a} ≠ ${b}`);
const sq = (s, cx = 0, cy = 0) => [{ x: cx - s, y: cy - s }, { x: cx + s, y: cy - s }, { x: cx + s, y: cy + s }, { x: cx - s, y: cy + s }];
const closedVolume = (tris) => {
  const r = analyzeMesh(tris, { selfCheck: false });
  assert.deepEqual(r.issues, [], 'closed');
  return r.volume;
};
const frustum = (h, a1, a2) => (h / 3) * (a1 + a2 + Math.sqrt(a1 * a2));

test('loft: three sections ruled = two frustums; smooth stays closed and in between', () => {
  near(closedVolume(loftSectionsMesh([sq(10), sq(5), sq(10)], 40)), 2 * frustum(20, 400, 100));
  const smooth = closedVolume(loftSectionsMesh([sq(10), sq(5), sq(10)], 40, true));
  assert.ok(smooth > 20 * 100 * 2 && smooth < 2 * frustum(20, 400, 100), String(smooth));
  // A feature from picked outlines: three or more become sections.
  const raw = featureFrom('loft', { sections: [sq(10), sq(5), sq(8)] }, { height: 30 });
  assert.equal(raw.shape.sections.length, 3);
  near(meshVolume(solidMesh(createEntity('solid', raw))), frustum(15, 400, 100) + frustum(15, 100, 256));
});

test('sweep: any closed section along a path, square to it, keeps its area through bends', () => {
  near(closedVolume(sweepSectionMesh([[0, 0, 0], [100, 0, 0], [100, 100, 0]], sq(5))), 2 * 100 * 100);
  const raw = featureFrom('sweep', { path: [{ x: 0, y: 0 }, { x: 50, y: 0 }], section: sq(2) }, {});
  near(meshVolume(solidMesh(createEntity('solid', raw))), 50 * 16);
});

test('pad taper: wires narrow toward their inside (as FreeCAD TaperAngle), exact frustum volumes', () => {
  const t = Math.tan((10 * Math.PI) / 180);
  const top = 20 - 2 * 10 * t;
  const holeTop = 6 - 2 * 10 * t;
  near(closedVolume(taperedExtrude({ outer: sq(10), holes: [sq(3)] }, 10, 10)), frustum(10, 400, top * top) - frustum(10, 36, holeTop * holeTop));
  assert.equal(taperedExtrude({ outer: sq(10), holes: [] }, 100, 45), null, 'the top would vanish');
  const pad = createEntity('solid', { kind: 'pad', params: { height: 10, taper: 10 }, shape: { shapes: [{ outer: sq(10), holes: [] }] } });
  assert.equal(exactVolume(pad), null, 'no box formula for a tapered pad');
  near(meshVolume(solidMesh(pad)), frustum(10, 400, top * top));
});

test('hole: counterbore and drill point by Pappus; a countersink; the mesh agrees', () => {
  const p = { diameter: 10, depth: 20, type: 1, cbDiameter: 16, cbDepth: 5, csDiameter: 20, tip: 1 };
  const tipH = 5 / Math.tan((59 * Math.PI) / 180);
  const above = 0.2;
  near(holeVolume(p), Math.PI * 25 * 15 + Math.PI * 64 * (5 + above) + (Math.PI * 25 * tipH) / 3, 1e-9);
  const cs = { ...p, type: 2, tip: 0 };
  near(holeVolume(cs), Math.PI * 25 * (20 - 5) + frustum(5, Math.PI * 25, Math.PI * 100) + Math.PI * 100 * above, 1e-9);
  const hole = createEntity('solid', { kind: 'hole', params: p });
  near(meshVolume(solidMesh(hole)), holeVolume(p), 2e-3);
});

test('thickness: open top, bottom, both, or a closed hollow', () => {
  const base = { kind: 'box', params: { length: 40, width: 30, height: 20 } };
  const inner = (zs) => 34 * 24 * zs;
  const expect = { openTop: 24000 - inner(17), openBottom: 24000 - inner(17), openBoth: 24000 - inner(20), closed: 24000 - inner(14) };
  THICKNESS_OPEN.forEach((open, i) => {
    const e = createEntity('solid', { kind: 'thickness', params: { thickness: 3, open: i }, shape: { base } });
    near(closedVolume(solidMesh(e)), expect[open], 1e-9);
  });
});

test('decimation keeps a closed shape with far fewer triangles', () => {
  const sphere = solidMesh(createEntity('solid', { kind: 'sphere', params: { radius: 20 } }));
  const fewer = decimateMesh(sphere, 0.25);
  assert.ok(fewer.length <= sphere.length * 0.26, `${fewer.length} of ${sphere.length}`);
  near(closedVolume(fewer), meshVolume(sphere), 0.03);
});
