// 3D fillet, chamfer, thickness and offset (FreeCAD Part dress-ups) on box, extrusion, prism, cylinder and tube solids.
import assert from 'node:assert/strict';
import test from 'node:test';
import { canExplode, createEntity, explode, normalizeEntity } from '../../src/domain/entities.js';
import { canDressUp, DRESSUP_EDGES, DRESSUP_KINDS } from '../../src/domain/dressup.js';
import { meshBox, meshVolume, solidFootprint, solidMesh, SOLID_ICONS } from '../../src/domain/solids.js';
import { hasIcon } from '../../src/icons.js';

const solid = (kind, params = {}, extra = {}) => createEntity('solid', { kind, params, ...extra });
const box = solid('box', { length: 100, width: 60, height: 40 });
const dress = (kind, params, base = box, place = {}) => normalizeEntity(createEntity('solid', { kind, params, shape: { base }, ...place }));
const edgeOf = (name) => DRESSUP_EDGES.indexOf(name);

/** Every edge of a closed mesh is shared by exactly two triangles, in opposite directions. */
function openEdges(tris) {
  const key = (p) => p.map((v) => Math.round(v * 1e4)).join(',');
  const edges = new Map();
  for (const tri of tris) for (let i = 0; i < 3; i++) {
    const k = `${key(tri[i])}>${key(tri[(i + 1) % 3])}`;
    edges.set(k, (edges.get(k) ?? 0) + 1);
  }
  let open = 0;
  for (const k of edges.keys()) {
    const [a, b] = k.split('>');
    if (!edges.has(`${b}>${a}`)) open++;
  }
  return open;
}

test('dress-up kinds have icons and only go on prism-shaped solids', () => {
  for (const kind of DRESSUP_KINDS) assert.ok(hasIcon(SOLID_ICONS[kind]), `${kind} icon`);
  assert.ok(canDressUp(box));
  assert.ok(canDressUp(solid('cylinder', { radius: 10, height: 20 })));
  assert.ok(canDressUp(solid('tube', { outer: 10, inner: 6, height: 20 })));
  assert.ok(!canDressUp(solid('sphere', { radius: 10 })));
  assert.ok(!canDressUp(solid('cylinder', { radius: 10, height: 20, angle: 180 })));
});

test('chamfer and thickness and offset have the exact volumes of a box', () => {
  // Vertical edges chamfered 10: four corner prisms of 10·10/2 · 40 cut away.
  near(meshVolume(solidMesh(dress('chamfer', { size: 10, edges: edgeOf('vertical') }))), 100 * 60 * 40 - 4 * 50 * 40);
  // Thickness 5, open top: box minus the inside 90 × 50 × 35.
  near(meshVolume(solidMesh(dress('thickness', { thickness: 5 }))), 100 * 60 * 40 - 90 * 50 * 35);
  // Offset −5: the box shrunk by 5 all round.
  near(meshVolume(solidMesh(dress('offset3d', { distance: -5 }))), 90 * 50 * 30);
});

test('a filleted box is closed and smaller than the box but bigger than its chamfer', () => {
  for (const edges of DRESSUP_EDGES) {
    const fillet = solidMesh(dress('fillet', { size: 8, edges: edgeOf(edges) }));
    const chamfer = solidMesh(dress('chamfer', { size: 8, edges: edgeOf(edges) }));
    assert.equal(openEdges(fillet), 0, `fillet ${edges} closed`);
    assert.equal(openEdges(chamfer), 0, `chamfer ${edges} closed`);
    const v = meshVolume(fillet);
    assert.ok(v < 240000 && v > meshVolume(chamfer), `fillet ${edges}: ${v}`);
  }
  // Vertical fillets of radius 8 take away 4 · (1 − π/4) · 8² · 40.
  near(meshVolume(solidMesh(dress('fillet', { size: 8, edges: edgeOf('vertical') }))), 240000 - 4 * (1 - Math.PI / 4) * 64 * 40, 2e-3);
});

test('a positive offset grows a box with rounded edges and a dress-up keeps the base placement', () => {
  const grown = meshBox(solidMesh(dress('offset3d', { distance: 5 })));
  near(grown.max[0] - grown.min[0], 110);
  near(grown.max[2] - grown.min[2], 50);
  const moved = meshBox(solidMesh(dress('chamfer', { size: 2, edges: 0 }, box, { x: 500, y: 200, z: 30 })));
  near(moved.min[0], 500);
  near(moved.min[2], 30);
});

test('thickness works on a cylinder and a tube, and a footprint is drawn in 2D', () => {
  const cup = dress('thickness', { thickness: 2 }, solid('cylinder', { radius: 20, height: 30 }));
  const v = meshVolume(solidMesh(cup));
  assert.ok(v > 0 && v < Math.PI * 400 * 30 * 0.4, `cup ${v}`);
  assert.equal(openEdges(solidMesh(cup)), 0);
  assert.ok(solidFootprint(dress('fillet', { size: 5, edges: 0 })).length > 0);
});

test('a dress-up explodes back into its base solid where it was', () => {
  const e = dress('fillet', { size: 5, edges: 0 }, box, { x: 100, rz: 90 });
  assert.ok(canExplode(e));
  const [back] = explode(e);
  assert.equal(back.kind, 'box');
  assert.equal(back.x, 100);
  assert.equal(back.rz, 90);
  assert.equal(back.params.length, 100);
});

function near(a, b, rel = 1e-6) {
  assert.ok(Math.abs(a - b) <= Math.abs(b) * rel + 1e-6, `${a} ≠ ${b}`);
}
