// Solid tools through manifold-3d (src/modeling/solids.js) and primitives.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4 } from 'three';
import { union, subtract, intersect, trim, split, loadManifold } from '../../src/modeling/solids.js';
import { box, cylinder, cone, sphere, tube, prism, rectangle } from '../../src/modeling/primitives.js';

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}`);
const cubes = () => {
  const a = box(1, 1, 1, { anchor: 'corner' });
  const b = box(1, 1, 1, { anchor: 'corner', at: [0.5, 0.5, 0.5] });
  return { a, b };
};

test('primitives are closed solids with the expected volume', () => {
  const b = box(2, 1, 0.5);
  assert.ok(b.isSolid()); close(b.volume(), 1);
  const bb = b.boundingBox();
  close(bb.min.y, 0); close(bb.min.x, -1); close(bb.max.z, 0.25); // bottom-centre anchor
  const poly = (n, r) => 0.5 * n * r * r * Math.sin((2 * Math.PI) / n);
  const c = cylinder(0.5, 2, { segments: 24 }); assert.ok(c.isSolid()); close(c.volume(), poly(24, 0.5) * 2);
  const k = cone(0.5, 1, { segments: 24 }); assert.ok(k.isSolid()); close(k.volume(), (poly(24, 0.5) * 1) / 3);
  const s = sphere(0.5); assert.ok(s.isSolid()); assert.ok(Math.abs(s.volume() - (4 / 3) * Math.PI * 0.125) < 0.03);
  const t = tube(0.5, 0.4, 1, { segments: 24 }); assert.ok(t.isSolid()); close(t.volume(), poly(24, 0.5) - poly(24, 0.4));
  const p = prism([[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]], 0.5); assert.ok(p.isSolid()); close(p.volume(), 1.5);
  assert.equal(rectangle(1, 2).faces.size, 1);
});

test('the manifold WASM loads lazily and only once', async () => {
  const w1 = await loadManifold();
  const w2 = await loadManifold();
  assert.equal(w1, w2);
  assert.equal(typeof w1.Manifold, 'function');
});

test('union of two overlapping cubes', async () => {
  const { a, b } = cubes();
  const r = await union(a, b);
  assert.ok(r.mesh.isSolid());
  close(r.mesh.volume(), 2 - 0.125);
  assert.equal(r.mesh.faces.size, 12);
  assert.deepEqual(r.mesh.validate(), []);
});

test('subtract keeps the materials of the faces that survive', async () => {
  const { a, b } = cubes();
  a.setMaterial([...a.faces.keys()], 'wood-oak');
  b.setMaterial([...b.faces.keys()], 'paint-white');
  const r = await subtract(a, b);
  assert.ok(r.mesh.isSolid());
  close(r.mesh.volume(), 1 - 0.125);
  const mats = [...r.mesh.faces.values()].map((f) => f.material);
  assert.ok(mats.includes('wood-oak'));
  assert.ok(mats.includes('paint-white')); // the bite takes the cutter's faces
  assert.equal(r.mesh.faces.size, 9);
});

test('intersect, trim and split', async () => {
  const { a, b } = cubes();
  const i = await intersect(a, b);
  close(i.mesh.volume(), 0.125);
  assert.equal(i.mesh.faces.size, 6);
  const t = await trim(a, b);
  close(t.a.volume(), 1);
  close(t.b.volume(), 0.875);
  const s = await split(a, b);
  close(s.aOnly.volume(), 0.875);
  close(s.both.volume(), 0.125);
  close(s.bOnly.volume(), 0.875);
  for (const m of [s.aOnly, s.both, s.bOnly]) assert.ok(m.isSolid());
});

test('drilling a hole with a cylinder (operand transforms, soft sides survive)', async () => {
  const a = box(1, 1, 1, { anchor: 'corner' });
  const c = cylinder(0.3, 2, { segments: 24 });
  const r = await subtract(a, c, { matrixB: new Matrix4().makeTranslation(0.5, -0.5, 0.5) });
  assert.ok(r.mesh.isSolid());
  close(r.mesh.volume(), 1 - 0.5 * 24 * 0.09 * Math.sin(Math.PI / 12), 1e-5);
  assert.ok([...r.mesh.edges.values()].filter((e) => e.soft).length >= 24);
});

test('disjoint operands and empty results', async () => {
  const a = box(1, 1, 1, { anchor: 'corner' });
  const b = box(1, 1, 1, { anchor: 'corner', at: [3, 0, 0] });
  const u = await union(a, b);
  close(u.mesh.volume(), 2);
  const i = await intersect(a, b);
  assert.equal(i.mesh.faces.size, 0);
});

test('non-solids are refused with not-solid', async () => {
  const a = box(1, 1, 1);
  const open = box(1, 1, 1);
  open.eraseFaces([[...open.faces.keys()][0]]);
  assert.deepEqual(await union(open, a), { error: 'not-solid', which: 'a' });
  assert.deepEqual(await subtract(a, open), { error: 'not-solid', which: 'b' });
});
