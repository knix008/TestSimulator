// More assembly tools: replace components (mate references found again on the new part), copy with mates
// (repeated, re-pointed or left out, then solved), hole alignment and envelope selection.
import test from 'node:test';
import assert from 'node:assert/strict';
import { replaceComponents, bestReference, copyWithMates, holeAlignment, envelopeSelection, isEnvelope } from '../../src/cad/asm-tools.js';
import { solveMates, quatIdentity } from '../../src/cad/assembly.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
let n = 0;
const newId = (p) => `${p}${++n}`;
const plane = (comp, point, dir, extra = {}) => ({ comp, kind: 'plane', point, dir, ...extra });
const axis = (comp, point, dir, radius) => ({ comp, kind: 'axis', point, dir, sig: { radius } });

test('replace: the chosen instance uses the new part; its mate references are found again on it', () => {
  const asm = {
    components: [
      { id: 'base', part: 'plate', position: [0, 0, 0], rotation: quatIdentity(), fixed: true },
      { id: 'b1', part: 'boltM6', position: [10, 0, 5], rotation: quatIdentity() },
      { id: 'b2', part: 'boltM6', position: [30, 0, 5], rotation: quatIdentity() },
    ],
    mates: [
      { id: 'm1', type: 'concentric', a: axis('b1', [0, 0, 0], [0, 0, 1], 3), b: axis('base', [10, 0, 0], [0, 0, 1], 3.2) },
      { id: 'm2', type: 'coincident', a: plane('b1', [0, 0, 0], [0, 0, -1]), b: plane('base', [0, 0, 5], [0, 0, 1]) },
      { id: 'm3', type: 'concentric', a: axis('b2', [0, 0, 0], [0, 0, 1], 3), b: axis('base', [30, 0, 0], [0, 0, 1], 3.2) },
    ],
  };
  // The new bolt (M8): its shank axis and the underside of its head, at other places in its own frame.
  const newFaces = [axis(null, [0, 0, 0], [0, 0, 1], 4), axis(null, [0, 0, 20], [0, 0, 1], 6.5), plane(null, [0, 0, 0.5], [0, 0, -1]), plane(null, [0, 0, 6], [0, 0, 1])];
  const r = replaceComponents(asm, ['b1'], 'boltM8', (ref) => bestReference(ref, newFaces));
  assert.deepEqual(r.replaced, ['b1']);
  assert.equal(asm.components[1].part, 'boltM8');
  assert.equal(asm.components[2].part, 'boltM6');
  assert.equal(r.remapped, 2);
  assert.deepEqual(r.lost, []);
  // The axis nearest the old one (the shank, not the head's), the face facing the same way.
  assert.deepEqual(asm.mates[0].a.point, [0, 0, 0]); assert.equal(asm.mates[0].a.comp, 'b1');
  assert.deepEqual(asm.mates[1].a.point, [0, 0, 0.5]);
  // Every instance of b2's part (only b2 is still an M6) — nothing matches on that part: its mate is suppressed
  // and marked, not left pulling on a face that is gone.
  const r2 = replaceComponents(asm, ['b2'], 'boltM10', () => null, { allInstances: true });
  assert.deepEqual(r2.replaced, ['b2']);
  assert.deepEqual(r2.lost, ['m3']);
  assert.ok(asm.mates[2].suppressed && asm.mates[2].lostReference);
  assert.ok(!asm.mates[0].suppressed);
  // Both bolts now share no part; make them share one and replace "all instances" from either.
  asm.components[2].part = 'boltM8';
  const r3 = replaceComponents(asm, ['b1'], 'boltM12', (ref) => ref, { allInstances: true });
  assert.deepEqual(r3.replaced.sort(), ['b1', 'b2']);
  // Found again: the mark and the suppression go.
  assert.ok(asm.mates.every((m) => !m.suppressed && !m.lostReference));
});

test('best reference keeps a plane\'s facing and prefers the axis of the same radius', () => {
  const ref = plane(null, [0, 0, 5], [0, 0, 1]);
  const got = bestReference(ref, [plane(null, [0, 0, 5], [0, 0, -1]), plane(null, [0, 0, 7], [0, 0, 1]), axis(null, [0, 0, 5], [0, 0, 1], 2)]);
  assert.deepEqual(got.point, [0, 0, 7]);
  const ax = axis(null, [0, 0, 0], [1, 0, 0], 3);
  assert.equal(bestReference(ax, [axis(null, [0, 0.1, 0], [1, 0, 0], 8), axis(null, [0, 0.2, 0], [-1, 0, 0], 3)]).sig.radius, 3);
  assert.equal(bestReference(ax, [plane(null, [0, 0, 0], [1, 0, 0])]), null);
  assert.equal(bestReference(ref, [plane(null, [0, 0, 50], [0, 0, 1])], { limit: 100 }).point[2], 50);
  assert.equal(bestReference(ref, [plane(null, [0, 0, 50], [0, 0, 1])], { limit: 10 }), null);
});

test('copy with mates: a pin copied into the next hole (concentric re-pointed, the face mate repeated), then solved', () => {
  const asm = {
    components: [
      { id: 'plate', part: 'P', position: [0, 0, 0], rotation: quatIdentity(), fixed: true },
      { id: 'pin', part: 'Q', name: 'Pin<1>', position: [10, 0, 5], rotation: quatIdentity() },
    ],
    mates: [
      { id: 'c1', type: 'concentric', name: 'Concentric1', a: axis('pin', [0, 0, 0], [0, 0, 1], 2), b: axis('plate', [10, 0, 0], [0, 0, 1], 2) },
      { id: 'c2', type: 'coincident', name: 'Coincident1', a: plane('pin', [0, 0, 0], [0, 0, -1]), b: plane('plate', [0, 0, 5], [0, 0, 1]) },
    ],
  };
  const { component, mates } = copyWithMates(asm, 'pin', { c1: { mode: 'new', other: axis('plate', [40, 20, 0], [0, 0, 1], 2) } }, { newId, nameOf: () => 'Pin<2>', mateName: (m) => `${m.type}-copy`, offset: [5, 5, 0] });
  assert.equal(component.name, 'Pin<2>');
  assert.equal(component.fixed, false);
  assert.equal(mates.length, 2);
  assert.ok(mates.every((m) => [m.a, m.b].some((r) => r.comp === component.id)));
  assert.deepEqual(mates[0].b.point, [40, 20, 0]);
  assert.equal(mates[1].b.comp, 'plate'); // repeated: the same face of the plate
  assert.equal(asm.mates.length, 4);
  solveMates(asm, { status: false });
  const c = asm.components.find((x) => x.id === component.id);
  near(c.position[0], 40, 1e-5); near(c.position[1], 20, 1e-5); near(c.position[2], 5, 1e-5);
  // The original stays where its own mates hold it.
  const p = asm.components.find((x) => x.id === 'pin');
  near(p.position[0], 10, 1e-5); near(p.position[2], 5, 1e-5);
});

test('copy with mates: skip leaves a mate out; "new" without a pick does too', () => {
  const asm = {
    components: [{ id: 'a', part: 'P', position: [0, 0, 0], rotation: quatIdentity(), fixed: true }, { id: 'b', part: 'Q', position: [0, 0, 0], rotation: quatIdentity() }],
    mates: [{ id: 'm1', type: 'coincident', a: plane('b', [0, 0, 0], [0, 0, 1]), b: plane('a', [0, 0, 0], [0, 0, -1]) }, { id: 'm2', type: 'parallel', a: plane('b', [0, 0, 0], [1, 0, 0]), b: plane('a', [0, 0, 0], [1, 0, 0]) }],
  };
  const r = copyWithMates(asm, 'b', { m1: { mode: 'skip' }, m2: { mode: 'new', other: null } }, { newId, nameOf: () => 'B2' });
  assert.equal(r.mates.length, 0);
  assert.equal(asm.components.length, 3);
});

test('hole alignment: stacked plates — one hole on the axis, one 0.3 off, one beside (not overlapping), one far along the axis', () => {
  const hole = (comp, x, y, z0, z1, r = 3, dir = [0, 0, 1]) => ({ comp, point: [x, y, z0], dir, radius: r, lo: 0, hi: z1 - z0 });
  const holes = [
    hole('top', 0, 0, 5, 10), hole('bottom', 0, 0, 0, 5),
    hole('top', 20, 0, 5, 10), hole('bottom', 20.3, 0, 0, 5),
    hole('top', 50, 0, 5, 10), hole('bottom', 57, 0, 0, 5),
    hole('top', 80, 0, 5, 10), hole('far', 80.2, 0, 40, 45),
    // A cover on the top plate, its hole facing the other way (dir −z) on the bottom plate's axis.
    { comp: 'cover', point: [20.3, 0, 20], dir: [0, 0, -1], radius: 3, lo: 0, hi: 10 },
  ];
  const r = holeAlignment(holes, { tolerance: 0.01 });
  // Aligned: the (0, 0) pair. The cover lies on the top plate (z 10 … 20): its 20.3 axis is 0.3 off the top
  // plate's 20 hole, as the bottom plate's is; the cover and the bottom plate are 5 apart along the axis.
  assert.equal(r.aligned, 1);
  assert.equal(r.checked, 3);
  const pairs = r.misaligned.map((m) => `${m.a}-${m.b}:${m.offset.toFixed(2)}`).sort();
  assert.deepEqual(pairs, ['top-bottom:0.30', 'top-cover:0.30']);
  // A looser tolerance accepts the 0.3.
  assert.equal(holeAlignment(holes, { tolerance: 0.5 }).misaligned.length, 0);
});

test('envelopes: inside / crossing / outside by boxes; the flag', () => {
  const boxes = new Map([['env', [[0, 0, 0], [100, 100, 100]]], ['in', [[10, 10, 10], [20, 20, 20]]], ['cross', [[90, 10, 10], [110, 20, 20]]], ['out', [[200, 0, 0], [210, 10, 10]]]]);
  assert.deepEqual(envelopeSelection('env', boxes, 'inside'), ['in']);
  assert.deepEqual(envelopeSelection('env', boxes, 'crossing'), ['in', 'cross']);
  assert.deepEqual(envelopeSelection('env', boxes, 'outside'), ['out']);
  assert.equal(isEnvelope({ envelope: true }), true);
  assert.equal(isEnvelope({}), false);
});
