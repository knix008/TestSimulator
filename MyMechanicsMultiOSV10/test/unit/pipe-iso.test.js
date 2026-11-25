// Pipe spools and the ISO drawing (cad/pipe-iso.js): spools split at field welds (given, and automatic past a
// maximum spool length), shop welds counted per fitting end, cut lengths and weights, the isometric projection,
// dimensions, the sheet with its tables, and the drawing primitives.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pipeSpools, isoModel, isoProject, isoSheet, isoPrimitives, isoKey } from '../../src/cad/pipe-iso.js';
import { PIPES } from '../../src/cad/stdparts.js';

// An L-shaped DN50 line with elbows, weld-neck flanges at both ends, a tee branch going up.
const L = { kind: 'pipe', dn: 'DN50', fittings: 'elbows', flanges: 'both', points: [[0, 0, 0], [3000, 0, 0], [3000, 2000, 0]], branches: [{ points: [[1500, 0, 0], [1500, 0, 1000]] }] };

test('one spool without field welds: shop welds per fitting end (elbow 2, tee 3, flanges 3 × 1)', () => {
  const s = pipeSpools(L);
  assert.equal(s.spools.length, 1);
  const sp = s.spools[0];
  assert.equal(sp.welds, 2 + 3 + 3);
  assert.deepEqual(sp.fittings.map((x) => x.item).sort(), ['elbow', 'flange', 'flange', 'flange', 'tee']);
  // Pipe: the centre-line lengths less the take-outs; weight from the section.
  const total = 3000 + 2000 + 1000;
  assert.ok(sp.pipeLength < total && sp.pipeLength > total - 1000, String(sp.pipeLength));
  const sec = PIPES.DN50, area = (Math.PI / 4) * (sec.od ** 2 - (sec.od - 2 * sec.wall) ** 2);
  assert.ok(Math.abs(sp.weight - area * sp.pipeLength * 7850e-9) < 1e-9);
  assert.equal(sp.ends.filter((e) => e.kind === 'flange').length, 3);
});

test('a field weld splits the line into two spools; the welds are shared out, the field weld counted once', () => {
  const s = pipeSpools(L, [], { breaks: [[700, 0, 0]] });
  assert.equal(s.spools.length, 2);
  assert.equal(s.fieldWelds.length, 1);
  assert.deepEqual(s.fieldWelds[0].point, [700, 0, 0]);
  assert.equal(s.shopWelds, 8);
  const first = s.spools.find((x) => x.fittings.some((f) => f.item === 'flange') && x.fittings.length === 1);
  assert.ok(first, 'the short start spool holds only its flange');
  assert.ok(first.ends.some((e) => e.kind === 'field'));
  // A point off the route is refused.
  assert.throws(() => pipeSpools(L, [], { breaks: [[700, 50, 0]] }));
});

test('a maximum spool length adds field welds until every spool fits; stock lengths give shop splices', () => {
  const s = pipeSpools(L, [], { maxSpool: 2500 });
  assert.ok(s.spools.every((x) => x.pipeLength <= 2500), s.spools.map((x) => Math.round(x.pipeLength)).join(' '));
  assert.ok(s.fieldWelds.length >= 2);
  const long = { kind: 'pipe', dn: 'DN25', points: [[0, 0, 0], [14000, 0, 0]] };
  const t = pipeSpools(long, [], { stock: 6000 });
  assert.equal(t.spools[0].splices, 2);
  assert.equal(t.spools[0].welds, 2);
});

test('isometric projection and the ISO model: the dimensions are the route’s centre-to-centre lengths', () => {
  const [u, v] = isoProject([1000, 0, 0]);
  assert.ok(Math.abs(u - 866.0254) < 1e-3 && Math.abs(v - 500) < 1e-9);
  assert.deepEqual(isoProject([0, 0, 250]), [0, 250]);
  const m = isoModel(L, [], { breaks: [[700, 0, 0]] });
  const texts = m.dims.map((d) => d.text).sort((a, b) => a - b);
  // Straights: 0→1500, 1500→3000, 3000 → (3000,2000), the branch 1000 — the field weld does not split a dimension.
  assert.deepEqual(texts, ['1000', '1500', '1500', '2000']);
  assert.equal(m.field.length, 1);
  assert.equal(m.flanges.length, 3);
  assert.ok(m.welds.length >= 5);
  assert.deepEqual(m.labels.map((l) => l.text).sort(), ['S1', 'S2']);
  assert.ok(m.ends.every((e) => /^EL /.test(e.text)));
});

test('the sheet: the iso fits above the tables at a standard scale; primitives draw it; the key follows the route', () => {
  const sh = isoSheet(L, [], { W: 420, H: 297, opts: { maxSpool: 2500 } });
  assert.ok(sh.fits && [1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005].includes(sh.scale), String(sh.scale));
  const [iso, ...tables] = sh.annotations;
  assert.equal(iso.kind, 'drwPipeIso');
  assert.deepEqual(tables.map((t) => t.role), ['spools', 'bom', 'welds']);
  const spoolTable = tables[0];
  assert.equal(spoolTable.rows, 1 + iso.iso.spools.length);
  const prims = isoPrimitives(iso);
  assert.ok(prims.some((p) => p.kind === 'fieldWeld') && prims.some((p) => p.kind === 'north'));
  assert.equal(prims.filter((p) => p.kind === 'spool').length, iso.iso.spools.length);
  // All inside the sheet.
  for (const p of prims) for (const q of p.pts ?? (p.c ? [p.c] : [[p.x, p.y]])) assert.ok(q[0] > 0 && q[0] < 420 && q[1] > 0 && q[1] < 297, JSON.stringify(p));
  assert.notEqual(isoKey(L), isoKey({ ...L, dn: 'DN80' }));
});
