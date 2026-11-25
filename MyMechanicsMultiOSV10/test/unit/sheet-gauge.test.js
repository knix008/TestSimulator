// Sheet metal gauge tables and bend calculation tables (cad/sheet-gauge.js): a gauge sets the thickness, radius
// and K; the bend methods (K-factor, K table, DIN 6935, allowance and deduction tables) give the flat length.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, createSketchGeometry } from '../../src/cad/sketch.js';
import { edgeSignature } from '../../src/cad/refs.js';
import { GAUGE_TABLES, sheetSettings, ruleAllowance, ruleK, dinK, seedBendRows, bendRule, gaugeOf } from '../../src/cad/sheet-gauge.js';

await loadKernel();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const BA = (deg, r, t, k) => ((deg * Math.PI) / 180) * (r + k * t);

test('gauge tables: thickness, radii and K from the row; a custom table; none keeps the typed values', () => {
  const g16 = GAUGE_TABLES.steel.rows.find((r) => r.name === '16');
  near(g16.thickness, 1.519, 1e-3);
  const s = sheetSettings({ gaugeTable: 'steel', gauge: '16', thickness: 9, radius: 9, kFactor: 0.2 });
  near(s.thickness, g16.thickness); near(s.radius, g16.radii[0]); near(s.k, 0.44);
  // A radius the row offers is kept; another one falls back to the row's first.
  near(sheetSettings({ gaugeTable: 'steel', gauge: '16', radius: g16.radii[2] }).radius, g16.radii[2]);
  const c = sheetSettings({ gaugeTable: 'custom', gauge: 'B', customGauges: [{ name: 'A', thickness: 1, radius: 1, k: 0.3 }, { name: 'B', thickness: 3, radius: 4, k: 0.4 }] });
  assert.deepEqual([c.thickness, c.radius, c.k], [3, 4, 0.4]);
  const n = sheetSettings({ gaugeTable: 'none', thickness: 2.5, radius: 1, kFactor: 0.33 });
  assert.deepEqual([n.thickness, n.radius, n.k, n.rule], [2.5, 1, 0.33, 0.33]);
  assert.equal(gaugeOf({ gaugeTable: 'none' }), null);
  for (const id of Object.keys(GAUGE_TABLES)) for (const r of GAUGE_TABLES[id].rows) assert.ok(r.thickness > 0 && r.radii.length && r.k > 0 && r.k < 1, `${id} ${r.name}`);
});

test('bend methods: K-factor, K table by r/t, DIN 6935, allowance and deduction tables', () => {
  near(ruleAllowance(0.44, 90, 2, 1.5), BA(90, 2, 1.5, 0.44));
  // K table: r/t = 1.5 lies between 1 → 0.38 and 2 → 0.42.
  const kt = bendRule({ bendMethod: 'kTable' }, 0.44);
  near(ruleAllowance(kt, 90, 3, 2), BA(90, 3, 2, 0.4));
  near(ruleK(kt, 90, 3, 2), 0.4);
  // DIN 6935: r/t = 1 → K = 0.325; from r/t = 5 on, 0.5.
  near(dinK(2, 2), 0.325); near(dinK(10, 2), 0.5);
  near(ruleAllowance({ method: 'din6935', k: 0.44 }, 60, 2, 2), BA(60, 2, 2, 0.325));
  // Allowance table: rows at two radii, interpolated by angle and radius.
  const rows = [{ angle: 90, radius: 2, value: 4 }, { angle: 180, radius: 2, value: 8.4 }, { angle: 90, radius: 4, value: 7 }, { angle: 180, radius: 4, value: 14.2 }];
  const al = bendRule({ bendMethod: 'allowance', bendRows: rows }, 0.44);
  near(ruleAllowance(al, 90, 2, 2), 4);
  near(ruleAllowance(al, 135, 2, 2), 6.2);
  near(ruleAllowance(al, 90, 3, 2), 5.5);
  near(ruleAllowance(al, 45, 2, 2), 2); // below the first row: in proportion to the angle
  // Deduction: BA = 2(r + t)·tan(θ/2) − BD.
  const de = bendRule({ bendMethod: 'deduction', bendRows: [{ angle: 90, radius: 2, value: 3.5 }] }, 0.44);
  near(ruleAllowance(de, 90, 2, 2), 2 * 4 * 1 - 3.5);
  // An empty table falls back to the K-factor.
  near(ruleAllowance(bendRule({ bendMethod: 'allowance' }, 0.4), 90, 2, 2), BA(90, 2, 2, 0.4));
  // Rows seeded from K give back the K-factor's allowance (allowance) and deduction.
  for (const method of ['allowance', 'deduction']) {
    const seeded = bendRule({ bendMethod: method, bendRows: seedBendRows(method, 2, [3], 0.44) }, 0.44);
    for (const deg of [30, 90, 120]) near(ruleAllowance(seeded, deg, 3, 2), BA(deg, 3, 2, 0.44), 1e-3);
  }
});

test('a gauge and a bend table drive the base flange and the flat length of an edge flange', () => {
  const build = (sheet, flat = false) => {
    const part = { id: 'p', name: 'Part', features: [] };
    const s = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() });
    addRectangle(s, 0, 0, 100, 50); part.features.push(s);
    part.features.push(createFeature(part, 'baseFlange', { sketch: s.id, ...sheet }));
    const r0 = regenerate(part);
    const t = r0.body.boundingBox.bounds[1][2] - r0.body.boundingBox.bounds[0][2];
    const edge = r0.body.edges.find((e) => e.geomType === 'LINE' && e.startPoint.x > 99.9 && e.endPoint.x > 99.9 && e.startPoint.z > t - 0.01 && e.endPoint.z > t - 0.01);
    part.features.push(createFeature(part, 'edgeFlange', { edge: edgeSignature(edge), length: 30, angle: 90 }));
    const r = regenerate({ ...part, flat });
    for (const [id, x] of r.results) assert.ok(x.ok, `${id}: ${x.error} ${x.detail ?? ''}`);
    const [lo, hi] = r.body.boundingBox.bounds;
    return { t, length: hi[0] - lo[0], sheet: r.sheet ?? null };
  };
  const g = GAUGE_TABLES.steel.rows.find((x) => x.name === '14');
  const a = build({ gaugeTable: 'steel', gauge: '14', thickness: 5, radius: g.radii[1] });
  near(a.t, g.thickness, 1e-6);
  const flat = build({ gaugeTable: 'steel', gauge: '14', thickness: 5, radius: g.radii[1] }, true);
  near(flat.length, 100 + BA(90, g.radii[1], g.thickness, g.k) + 30, 1e-5);
  // A bend allowance table: the flat strip is the table's value.
  const tab = build({ thickness: 2, radius: 3, bendMethod: 'allowance', bendRows: [{ angle: 90, radius: 3, value: 6.5 }] }, true);
  near(tab.length, 100 + 6.5 + 30, 1e-5);
  const din = build({ thickness: 2, radius: 2, bendMethod: 'din6935' }, true);
  near(din.length, 100 + BA(90, 2, 2, 0.325) + 30, 1e-5);
});
