// 2D electrical schematics (src/cad/schematic.js): pins under rotation, nets (supplies and grounds joined by name),
// wire numbers, from–to and parts lists, checks, SVG and CSV.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSchematic, nextTag, symbolPins, toSheet, pinAt, autoRoute, nets, wireNumbers, fromTo, schematicBom, checkSchematic, schematicSvg, fromToCsv } from '../../src/cad/schematic.js';

/** A relay circuit: +24V → F1 → S1 → K1 coil → PE; +24V → K1 contact → P1 lamp → PE. */
function circuit() {
  const s = createSchematic('sch1', 'Relay control');
  const add = (kind, x, y, extra = {}) => { const sym = { id: `s${s.symbols.length + 1}`, kind, tag: nextTag(s, kind), x, y, rot: 0, ...extra }; s.symbols.push(sym); return sym; };
  const v1 = add('supply', 40, 40, { value: '+24V' });
  const f1 = add('fuse', 60, 50, { value: '2A' });
  const s1 = add('pushbutton', 90, 50);
  const k1 = add('coil', 120, 70);
  const g1 = add('ground', 120, 100);
  const v2 = add('supply', 160, 40, { value: '+24V' });
  const k1c = add('contact', 170, 60, { tag: 'K1' });
  const p1 = add('lamp', 170, 90, { rot: 90 });
  const g2 = add('ground', 170, 120);
  let n = 0;
  const wire = (a, b) => { const A = pinAt(s, a); const B = pinAt(s, b); s.wires.push({ id: `w${++n}`, a, b, points: autoRoute(A, B) }); };
  wire({ sym: v1.id, pin: '+' }, { sym: f1.id, pin: '1' });
  wire({ sym: f1.id, pin: '2' }, { sym: s1.id, pin: '13' });
  wire({ sym: s1.id, pin: '14' }, { sym: k1.id, pin: 'A1' });
  wire({ sym: k1.id, pin: 'A2' }, { sym: g1.id, pin: 'PE' });
  wire({ sym: v2.id, pin: '+' }, { sym: k1c.id, pin: '13' });
  wire({ sym: k1c.id, pin: '14' }, { sym: p1.id, pin: 'X1' });
  wire({ sym: p1.id, pin: 'X2' }, { sym: g2.id, pin: 'PE' });
  return s;
}

test('tags count up per kind; pins turn with the symbol in 90° steps', () => {
  const s = circuit();
  assert.deepEqual(s.symbols.filter((x) => x.kind === 'supply').map((x) => x.tag), ['G1', 'G2']);
  const lamp = s.symbols.find((x) => x.kind === 'lamp');
  // Lamp pins at (−10, 0) / (10, 0) in its frame; turned 90° they stand above and below it.
  assert.deepEqual(toSheet(lamp, symbolPins(lamp)[0]), [170, 80]);
  assert.deepEqual(toSheet(lamp, symbolPins(lamp)[1]), [170, 100]);
  assert.equal(symbolPins({ kind: 'terminal', pins: 6 }).length, 6);
});

test('wires route orthogonally: every segment horizontal or vertical', () => {
  const s = circuit();
  for (const w of s.wires) {
    const path = [pinAt(s, w.a), ...w.points, pinAt(s, w.b)];
    for (let i = 1; i < path.length; i++) assert.ok(Math.abs(path[i][0] - path[i - 1][0]) < 1e-9 || Math.abs(path[i][1] - path[i - 1][1]) < 1e-9, `${w.id} segment ${i}`);
  }
});

test('nets: both +24V supplies are one net, both grounds one PE net; the rest numbered', () => {
  const s = circuit();
  const list = nets(s);
  const plus = list.find((n) => n.name === '+24V'); const pe = list.find((n) => n.name === 'PE');
  assert.ok(plus && pe);
  assert.equal(plus.pins.filter((p) => p.tag === 'G1' || p.tag === 'G2').length, 2, 'the two supplies joined by name');
  assert.ok(plus.pins.some((p) => p.tag === 'F1' && p.pin === '1') && plus.pins.some((p) => p.tag === 'K1' && p.pin === '13'));
  assert.ok(pe.pins.some((p) => p.tag === 'K1' && p.pin === 'A2') && pe.pins.some((p) => p.tag === 'P1' && p.pin === 'X2'));
  assert.equal(list.length, 5, '+24V, PE and three nets between parts (F1–S1, S1–K1, K1–P1)');
  const numbers = wireNumbers(s);
  assert.equal(new Set(numbers.values()).size, s.wires.length, 'every wire has its own number');
  assert.ok([...numbers.values()].filter((x) => x.startsWith('+24V')).length === 2, '+24V.1 and +24V.2');
});

test('from–to list, parts list and CSV', () => {
  const s = circuit();
  const rows = fromTo(s);
  assert.equal(rows.length, 7);
  assert.ok(rows.some((r) => r.from === 'S1:14' && r.to === 'K1:A1'));
  const bom = schematicBom(s);
  assert.deepEqual(bom.map((b) => b.tag), ['F1', 'K1', 'K1', 'P1', 'S1'], 'supplies and grounds are not parts; coil and contact are both K1');
  const csv = fromToCsv(s);
  assert.match(csv, /^Wire,From,To,Net,Color,Gauge,Length\n/);
  assert.equal(csv.trim().split('\n').length, 8);
});

test('checks: an open pin and a duplicate tag are found; a dangling wire too', () => {
  const s = circuit();
  assert.deepEqual(checkSchematic(s).filter((i) => i.kind !== 'duplicate-tag'), [], 'the circuit is complete (the coil and its contact share K1 on purpose)');
  s.symbols.push({ id: 'r1', kind: 'resistor', tag: 'F1', x: 200, y: 200 });
  s.wires.push({ id: 'wx', a: { sym: 'gone', pin: '1' }, b: { sym: 'r1', pin: '1' }, points: [] });
  const issues = checkSchematic(s);
  assert.ok(issues.some((i) => i.kind === 'duplicate-tag' && i.tag === 'F1'));
  assert.ok(issues.some((i) => i.kind === 'open-pin' && i.tag === 'F1' && i.pin === '2'));
  assert.ok(issues.some((i) => i.kind === 'dangling-wire' && i.wire === 'wx'));
});

test('SVG: frame, title, every symbol and wire, wire numbers, pins as dots', () => {
  const s = circuit();
  const svg = schematicSvg(s, { labels: { title: 'Control circuit' } });
  assert.match(svg, /^<svg[^>]+viewBox="0 0 420 297"/);
  assert.equal((svg.match(/class="symbol"/g) ?? []).length, s.symbols.length);
  assert.equal((svg.match(/class="wire"/g) ?? []).length, s.wires.length);
  for (const n of wireNumbers(s).values()) assert.ok(svg.includes(`>${n}<`), `wire number ${n} shown`);
  assert.ok(svg.includes('Relay control') && svg.includes('Control circuit'));
  assert.equal((svg.match(/class="pin"/g) ?? []).length, s.symbols.reduce((k, x) => k + symbolPins(x).length, 0));
});
