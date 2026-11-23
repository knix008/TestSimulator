// Smart fasteners: the stack (bolt, washers, spring washer, nut kinds) and its bolt length, sizes and lengths
// forced after inserting, the holes of a pattern read from the kernel faces, and hole series through stacked
// parts (merged intervals along the axis, through or ending in a tapped hole).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { holeOfFace, fastenerPlan, holePattern, holeSeries, FASTENER_KINDS, NUT_KINDS } from '../../src/cad/fastener.js';
import { isCylinder } from '../../src/cad/refs.js';
import { FLAT_WASHER, SPRING_WASHER, NYLON_NUT, HEX_NUT, boltLengths, STD_ITEMS } from '../../src/cad/stdparts.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const throughHole = (diameter, depth) => ({ diameter, depth, through: true, blind: false, axis: { point: [0, 0, 0], dir: [0, 0, 1] }, ends: [{ centre: [0, 0, depth], normal: [0, 0, 1], open: true }, { centre: [0, 0, 0], normal: [0, 0, -1], open: true }] });

test('the stack: washer, spring washer, bolt, nut washer and nut, each at its offset from the entry face', () => {
  const plan = fastenerPlan(throughHole(9, 10), { washer: true, springWasher: true, nut: true, nutWasher: true, nutKind: 'nylonNut' });
  assert.equal(plan.size, 'M8');
  const w = FLAT_WASHER.M8.h; const sw = SPRING_WASHER.M8.s; const n = NYLON_NUT.M8.h;
  assert.deepEqual(plan.stack.map((s) => s.role), ['washer', 'springWasher', 'bolt', 'nutWasher', 'nut']);
  near(plan.stack[1].at, w); near(plan.stack[2].at, w + sw); near(plan.stack[3].at, -10); near(plan.stack[4].at, -10 - w);
  assert.equal(plan.stack[4].kind, 'nylonNut'); assert.equal(plan.stack[4].flip, true);
  // The shortest standard length with two pitches past the nut: w + sw + 10 + w + n + 2.5 = 27.2 → 30.
  assert.equal(plan.bolt.length, boltLengths('M8').find((l) => l >= w + sw + 10 + w + n + 2.5));
  assert.ok(plan.protrusion >= 2 * 1.25 - 1e-9);
});

test('kinds: socket, countersunk (no washer under a sunk head), button head; nut kinds; sizes a kind lacks', () => {
  assert.deepEqual(FASTENER_KINDS, ['hexBolt', 'socketCap', 'countersunk', 'buttonHead', 'hexBolt933', 'hexBolt931', 'socketCap912', 'countersunk7991', 'lowHead7984']);
  assert.deepEqual(NUT_KINDS, ['hexNut', 'hexNut2', 'thinNut', 'nylonNut', 'hexNut934', 'thinNut439']);
  const din = fastenerPlan(throughHole(6.6, 12), { kind: 'countersunk7991', washer: true, nut: true, nutKind: 'hexNut934' });
  assert.equal(din.bolt.kind, 'countersunk7991'); assert.equal(din.washer, null, 'a DIN countersunk head takes no washer either');
  assert.equal(din.nut.kind, 'hexNut934');
  const csk = fastenerPlan(throughHole(6.6, 12), { kind: 'countersunk', washer: true, nut: true });
  assert.equal(csk.bolt.kind, 'countersunk'); assert.equal(csk.washer, null);
  assert.ok(STD_ITEMS.countersunk.lengths('M6').includes(csk.bolt.length));
  // ISO 7380 stops at M16: an M20 hole has no button head screw.
  assert.equal(fastenerPlan(throughHole(22, 20), { kind: 'buttonHead' }).error, 'too-large');
  const thin = fastenerPlan(throughHole(9, 10), { nutKind: 'thinNut', washer: false });
  assert.equal(thin.nut.kind, 'thinNut');
});

test('size and length can be forced (changing a fastener after inserting it)', () => {
  const forced = fastenerPlan(throughHole(9, 10), { size: 'M6', length: 40 });
  assert.equal(forced.size, 'M6'); assert.equal(forced.bolt.length, 40); assert.equal(forced.fit, 'forced');
  // A length that does not exist for the size falls back to the automatic one.
  assert.equal(fastenerPlan(throughHole(9, 10), { length: 33 }).bolt.length, fastenerPlan(throughHole(9, 10)).bolt.length);
  assert.ok(forced.lengths.includes(40));
  // A longer grip (stacked plates) makes a longer bolt.
  assert.ok(fastenerPlan(throughHole(9, 10), { grip: 30 }).bolt.length > fastenerPlan(throughHole(9, 10)).bolt.length);
  // Into a tapped hole (series ending blind): no nut, a length that does not bottom out.
  const blind = fastenerPlan(throughHole(6.8, 10), { grip: 25, through: false, washer: false });
  assert.equal(blind.nut, null); assert.equal(blind.size, 'M8'); assert.ok(blind.bolt.length <= 25 - 1.25);
});

test('a hole pattern on a flange: the four bolt holes on one face, not the bore nor holes on other faces', () => {
  let plate = R.makeCylinder(60, 12, [0, 0, 0], [0, 0, 1]).cut(R.makeCylinder(20, 14, [0, 0, -1], [0, 0, 1]));
  for (let i = 0; i < 4; i++) { const a = (Math.PI / 2) * i; plate = plate.cut(R.makeCylinder(4.5, 14, [42 * Math.cos(a), 42 * Math.sin(a), -1], [0, 0, 1])); }
  // A blind hole of the same size from the bottom face: a different entry plane.
  plate = plate.cut(R.makeCylinder(4.5, 6, [0, 30, -1], [0, 0, 1]));
  const faces = plate.faces;
  const holes = faces.filter((f) => isCylinder(f.geomType)).map((f) => holeOfFace(f, faces)).filter(Boolean);
  const pick = holes.find((h) => h.through && Math.abs(h.diameter - 9) < 1e-6);
  const plan = fastenerPlan(pick, {});
  const group = holePattern(pick, plan.entry, holes);
  assert.equal(group.length, 4);
  for (const g of group) { near(g.hole.diameter, 9); near(g.hole.ends[g.entry].centre[2], 12, 1e-6); }
  const centres = group.map((g) => Math.hypot(g.hole.axis.point[0], g.hole.axis.point[1]));
  for (const c of centres) near(c, 42, 1e-6);
});

test('a hole series through stacked parts: contiguous holes on the axis, a nut where the last one opens', () => {
  const s = holeSeries([{ t0: 0, t1: 10, through: true, id: 'a' }, { t0: 10.02, t1: 18, through: true, id: 'b' }, { t0: 30, t1: 40, through: true, id: 'far' }]);
  assert.deepEqual(s.chain.map((x) => x.id), ['a', 'b']); near(s.grip, 18); assert.equal(s.through, true);
  // Ending in a blind (tapped) hole: the bolt screws into it.
  const t = holeSeries([{ t0: 0, t1: 8, through: true, id: 'a' }, { t0: 8, t1: 20, through: false, id: 'tap' }]);
  assert.equal(t.through, false); near(t.grip, 20); assert.equal(t.last.id, 'tap');
  // A gap between the parts stops the series.
  assert.equal(holeSeries([{ t0: 0, t1: 5, through: true }, { t0: 6, t1: 9, through: true }]).chain.length, 1);
  assert.equal(holeSeries([]).chain.length, 0);
  assert.ok(HEX_NUT.M8.m > 0);
});
