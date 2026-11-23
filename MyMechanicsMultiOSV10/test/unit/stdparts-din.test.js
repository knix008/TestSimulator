// DIN fasteners in the standard parts library (src/cad/stdparts.js): where DIN differs from ISO the solids follow
// DIN — DIN 933 / 934 / 439 across flats 17 at M10 (ISO 16), DIN 934 nut height 0.8 d, DIN 931 thread length
// 2d + 6 / 2d + 12, DIN 7991 and DIN 7984 heads — and the designations, size tables and threads name DIN.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel } from '../../src/cad/kernel.js';
import { STD_ITEMS, stdShape, designation, sizeTable, stdThreads, stdDefaults, stdProblem, nutHeight, baseKind, HEX_BOLT, HEX_BOLT_DIN, screwThreadLength, METRIC } from '../../src/cad/stdparts.js';

await loadKernel();
const near = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const bbox = (s) => { const [lo, hi] = s.boundingBox.bounds; return { lo, hi, size: hi.map((v, i) => v - lo[i]) }; };
const DIN = ['hexBolt933', 'hexBolt931', 'socketCap912', 'countersunk7991', 'lowHead7984', 'hexNut934', 'thinNut439', 'washer125'];

test('DIN 933 M10×40: across flats 17 (ISO 4017 has 16), head 7; designation DIN 933', () => {
  assert.equal(HEX_BOLT.M10.s, 16); assert.equal(HEX_BOLT_DIN.M10.s, 17);
  const b = bbox(stdShape({ kind: 'hexBolt933', size: 'M10', length: 40 }));
  near(b.size[0], 17); near(b.hi[2], 7); near(b.lo[2], -40);
  assert.equal(designation({ kind: 'hexBolt933', size: 'M10', length: 40 }), 'DIN 933 M10×40');
  const iso = bbox(stdShape({ kind: 'hexBolt', size: 'M10', length: 40 }));
  near(iso.size[0], 16);
});

test('DIN 931: part threaded, b = 2d + 6 up to 125 mm, 2d + 12 above; lengths leave a plain shank', () => {
  assert.equal(screwThreadLength('hexBolt931', 'M10', 80), 26);
  assert.equal(screwThreadLength('hexBolt931', 'M10', 150), 32);
  assert.equal(screwThreadLength('hexBolt933', 'M10', 80), 80 - 2 * METRIC.M10.p, 'DIN 933 is threaded to the head');
  const th = stdThreads({ kind: 'hexBolt931', size: 'M12', length: 100 });
  near(th[0].length, 2 * 12 + 6);
  assert.ok(STD_ITEMS.hexBolt931.lengths('M10').every((l) => l > 26), 'no length shorter than the thread');
});

test('DIN 934 M10 nut: s 17, m = 0.8 d = 8 (ISO 4032: 8.4); DIN 439 thin nut s 17', () => {
  near(nutHeight('hexNut934', 'M10'), 8); near(nutHeight('hexNut', 'M10'), 8.4);
  const b = bbox(stdShape({ kind: 'hexNut934', size: 'M10' }));
  near(b.size[0], 17); near(b.size[2], 8);
  const t = bbox(stdShape({ kind: 'thinNut439', size: 'M10' }));
  near(t.size[0], 17); near(t.size[2], 5);
  assert.equal(designation({ kind: 'hexNut934', size: 'M10' }), 'DIN 934 M10');
});

test('DIN 7991 M10 countersunk head Ø20 (ISO 10642: 22.4); DIN 7984 M10 low head 6 high (ISO 4762: 10)', () => {
  const c = bbox(stdShape({ kind: 'countersunk7991', size: 'M10', length: 30 }));
  near(c.size[0], 20); near(c.hi[2], 0);
  const l = bbox(stdShape({ kind: 'lowHead7984', size: 'M10', length: 30 }));
  near(l.hi[2], 6); near(l.size[0], 16);
  const s = bbox(stdShape({ kind: 'socketCap912', size: 'M10', length: 30 }));
  near(s.hi[2], 10, 1e-3);
});

test('every DIN item: an ISO base, a size table, defaults that build without problems, a DIN designation', () => {
  for (const k of DIN) {
    assert.ok(STD_ITEMS[baseKind(k)] && baseKind(k) !== k, k);
    assert.match(STD_ITEMS[k].standard, /^DIN /);
    const [cols, rows] = sizeTable(k);
    assert.ok(cols.length >= 3 && rows.length >= 5 && rows.every((r) => r.length === cols.length + 1 && r.every((v) => v != null)), k);
    const p = stdDefaults(k);
    assert.equal(stdProblem(p), null, k);
    assert.ok(designation(p).startsWith(STD_ITEMS[k].standard), `${k}: ${designation(p)}`);
  }
  assert.equal(designation({ kind: 'washer125', size: 'M10' }), 'DIN 125 A 10');
});
