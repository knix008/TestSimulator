// Surface: sections, filling, extruded curves, thickness.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createEntity } from '../../src/domain/entities.js';
import { analyzeMesh } from '../../src/domain/meshcheck.js';
import { featureFrom, solidMesh } from '../../src/domain/solids.js';
import { extrudedCurve, fillSurface, sectionSurface, thicken } from '../../src/domain/surface.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
const area = (tris) => tris.reduce((s, [a, b, c]) => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return s + Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
}, 0);
const sq = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];

test('sections: a ruled surface between two curves; curves drawn the other way are turned', () => {
  near(area(sectionSurface([[{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 0, y: 0 }, { x: 100, y: 0 }]], 50)), 5000);
  // The same, with the top curve drawn backwards: still a flat wall, not a twisted one.
  near(area(sectionSurface([[{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 100, y: 0 }, { x: 0, y: 0 }]], 50)), 5000);
  const smooth = sectionSurface([[{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 0, y: 30 }, { x: 100, y: 30 }], [{ x: 0, y: 0 }, { x: 100, y: 0 }]], 60, true);
  assert.ok(area(smooth) > 100 * Math.hypot(30, 30) * 2 * 0.9);
});

test('filling: flat area of the outline less its holes; a bulge peaks at the height', () => {
  near(area(fillSurface(sq, [], 0)), 10000);
  near(area(fillSurface(sq, [[{ x: 40, y: 40 }, { x: 40, y: 60 }, { x: 60, y: 60 }, { x: 60, y: 40 }]], 0)), 9600);
  const dome = fillSurface(sq, [], 20);
  near(Math.max(...dome.flat().map((p) => p[2])), 20, 1e-9);
  assert.ok(dome.flat().filter((p) => p[0] === 0 || p[1] === 0).every((p) => Math.abs(p[2]) < 1e-12), 'flat along the outline');
});

test('thickness: a plate and a bent wall become closed shells of the right volume', () => {
  const plate = analyzeMesh(thicken(fillSurface(sq, [], 0), 2), { selfCheck: false });
  assert.deepEqual(plate.issues, []);
  near(plate.volume, 20000);
  // An L-shaped wall 10 high, 1 thick, mitred at the bend: (50.5 + 30.5) · 10.
  const wall = analyzeMesh(thicken(extrudedCurve([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 30 }], 10), 1), { selfCheck: false });
  assert.deepEqual(wall.issues, []);
  near(wall.volume, 810);
});

test('surface solids from 2D: the three features', () => {
  const ruled = createEntity('solid', featureFrom('surfRuled', { curves: [[{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 0, y: 5 }, { x: 10, y: 5 }]] }, { height: 20 }));
  assert.equal(ruled.kind, 'surface');
  assert.ok(solidMesh(ruled).length > 0);
  const filled = createEntity('solid', featureFrom('surfFill', { outer: sq, holes: [] }, { bulge: 0, thickness: 3 }));
  near(analyzeMesh(solidMesh(filled), { selfCheck: false }).volume, 30000, 1e-6);
  const walls = createEntity('solid', featureFrom('surfExtrude', { paths: [[{ x: 0, y: 0 }, { x: 10, y: 0 }]] }, { height: 5 }));
  near(area(solidMesh(walls)), 50);
});
