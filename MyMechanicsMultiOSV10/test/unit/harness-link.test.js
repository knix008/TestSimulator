// Schematic ↔ 3D harness link (src/cad/harness-link.js): the schematic's nets between harness connectors become
// harness wires with the schematic's colour and size, differences are found both ways, re-importing keeps the clips a
// wire passes, and the routed lengths of a real harness model come back onto the schematic and its from–to list.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSchematic, pinAt, autoRoute, fromToCsv } from '../../src/cad/schematic.js';
import { harnessModel } from '../../src/cad/harness.js';
import { colourCode, sizeOf, harnessWiresFromSchematic, mergeHarnessWires, compareHarness, backAnnotate, harnessesOf } from '../../src/cad/harness-link.js';

function circuit() {
  const s = createSchematic('sch', 'Panel');
  const sym = (id, kind, tag, x, y, extra = {}) => { s.symbols.push({ id, kind, tag, x, y, rot: 0, ...extra }); return id; };
  sym('x1', 'connector', 'X1', 20, 50, { pins: 4 });
  sym('x2', 'connector', 'X2', 120, 50, { pins: 4 });
  sym('x3', 'connector', 'X3', 220, 50, { pins: 2 });
  sym('m1', 'motor', 'M1', 70, 120);
  sym('p1', 'lamp', 'P1', 70, 160);
  let n = 0;
  const wire = (a, b, extra = {}) => { s.wires.push({ id: `w${++n}`, a, b, points: autoRoute(pinAt(s, a), pinAt(s, b)), number: '', color: '', gauge: '', ...extra }); };
  wire({ sym: 'x1', pin: '1' }, { sym: 'x2', pin: '1' }, { color: 'RD', gauge: '1,5 mm²', number: '101' });   // a plain wire
  wire({ sym: 'x1', pin: '2' }, { sym: 'm1', pin: 'U' });                                               // net of three
  wire({ sym: 'm1', pin: 'U' }, { sym: 'x2', pin: '3' }, { color: 'black' });
  wire({ sym: 'x1', pin: '3' }, { sym: 'p1', pin: 'X1' });                                              // one endpoint only
  wire({ sym: 'x2', pin: '4' }, { sym: 'm1', pin: 'V' }, { color: 'blue', gauge: 'AWG 18' });
  return s;
}
const harness = () => ({ id: 'h', type: 'route', kind: 'harness', bendRadius: 20, diameter: 4, points: [[0, 0, 20], [150, 0, 20], [300, 0, 20]], branches: [], clips: [{ name: 'C1', at: [75, 0, 20] }],
  connectors: [{ name: 'X1', at: [0, 0, 20], pins: 4 }, { name: 'M1', at: [150, 0, 20], pins: 2 }, { name: 'X2', at: [300, 0, 20], pins: 4 }], wires: [] });

test('colour and size texts become harness codes and standard sizes', () => {
  assert.equal(colourCode('rd'), 'RD'); assert.equal(colourCode('Blue'), 'BU'); assert.equal(colourCode('파랑'), 'BU'); assert.equal(colourCode('plaid'), null); assert.equal(colourCode(''), null);
  assert.equal(sizeOf('1,5 mm²'), 1.5); assert.equal(sizeOf('2.5'), 2.5); assert.equal(sizeOf('AWG 18'), 0.75); assert.equal(sizeOf('0.9'), 1); assert.equal(sizeOf('thick'), null);
});

test('nets between harness connectors become wires; a device named like a connector is one; splices and unplaced connectors are reported', () => {
  const { wires, issues } = harnessWiresFromSchematic(circuit(), harness());
  const rows = wires.map((w) => `${w.name} ${w.from}:${w.fromPin}-${w.to}:${w.toPin} ${w.color} ${w.gauge}`);
  assert.ok(rows.includes('101 X1:1-X2:1 RD 1.5'), rows.join(' / '));
  assert.ok(rows.some((r) => / M1:2-X2:4 BU 0\.75$/.test(r)), 'motor pin V is its second pin; blue, AWG 18 → 0.75 mm²');
  assert.ok(rows.some((r) => / M1:1-X1:2 BK 0\.5$/.test(r)), 'the three-pin net gives its first two pins a wire; "black" → BK');
  assert.equal(wires.length, 3, 'the lamp net has only one harness pin');
  assert.ok(issues.some((i) => i.kind === 'splice' && i.pins.length === 3));
  assert.ok(issues.some((i) => i.kind === 'no-connector' && i.tag === 'X3'));
  assert.equal(new Set(wires.map((w) => w.name)).size, wires.length, 'unique names');
  const small = { ...harness(), connectors: [{ name: 'X1', at: [0, 0, 20], pins: 1 }, { name: 'X2', at: [300, 0, 20], pins: 4 }] };
  assert.ok(harnessWiresFromSchematic(circuit(), small).issues.some((i) => i.kind === 'pin-range' && i.tag === 'X1'));
});

test('compare finds missing, extra and changed wires; after the merge they are in sync and clip routing is kept', () => {
  const s = circuit(); const h = harness();
  h.wires = [{ name: 'old', from: 'X2', fromPin: 1, to: 'X1', toPin: 1, color: 'BK', gauge: 1.5, via: ['C1'] }, { name: 'gone', from: 'X1', fromPin: 4, to: 'X2', toPin: 2, color: 'BK', gauge: 0.5 }];
  const c = compareHarness(s, h);
  assert.equal(c.inSync, false);
  assert.equal(c.missing.length, 2);
  assert.deepEqual(c.extra.map((w) => w.name), ['gone']);
  assert.deepEqual(c.changed.map((x) => [x.field, x.schematic, x.harness]), [['color', 'RD', 'BK']], 'pin order does not matter; only the colour differs');
  h.wires = mergeHarnessWires(h.wires, harnessWiresFromSchematic(s, h).wires);
  assert.equal(compareHarness(s, h).inSync, true);
  assert.deepEqual(h.wires.find((w) => w.name === '101').via, ['C1'], 'the clip a wire was told to pass is kept');
  assert.equal(h.wires.some((w) => 'net' in w), false, 'no schematic-only fields in the harness');
});

test('back-annotation: the routed lengths of the harness model are written on every schematic wire of the net and in the CSV', () => {
  const s = circuit(); const h = harness();
  h.wires = mergeHarnessWires([], harnessWiresFromSchematic(s, h).wires);
  const m = harnessModel(h, []);
  const n = backAnnotate(s, h, m.wires);
  assert.equal(n, 3);
  const w1 = s.wires.find((w) => w.id === 'w1');
  assert.equal(w1.length, 300); assert.equal(w1.harnessWire, '101');
  assert.equal(s.wires.find((w) => w.id === 'w2').length, 150, 'X1:2 → M1:1');
  assert.equal(s.wires.find((w) => w.id === 'w3').length, 150, 'the other schematic wire of the same net');
  assert.equal(s.wires.find((w) => w.id === 'w5').length, 150, 'M1:2 → X2:4');
  assert.equal(s.wires.find((w) => w.id === 'w4').length, undefined, 'the lamp wire is not in the harness');
  assert.match(fromToCsv(s), /^101,X1:1,X2:1,[^,]*,RD,"?1,5 mm²"?,300$/m);
  // Removing the harness wires clears the old lengths.
  assert.equal(backAnnotate(s, h, []), 0);
  assert.equal(s.wires.some((w) => 'length' in w), false);
});

test('the harness routes of a project are found in its parts', () => {
  const project = { parts: [{ id: 'p', features: [{ type: 'extrude' }, harness(), { type: 'route', kind: 'pipe' }] }, { id: 'q', features: [] }] };
  assert.deepEqual(harnessesOf(project).map((x) => [x.part.id, x.feature.id]), [['p', 'h']]);
});
