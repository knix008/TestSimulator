// Costing by process: holes recognised on the B-rep (through, blind with a drill point, counterbore, countersink),
// drill / tap times from the feeds, pockets from the volume each cutting feature removed, turning from round bar,
// sheet metal cut length / pierces / bends of the flat pattern, casting (Chvorinov) and moulding (cooling time,
// clamp force, mould amortised), the CO₂e from the same breakdown and the CSV / HTML report.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate, faceRef } from '../../src/cad/features.js';
import { addRectangle, createSketchGeometry } from '../../src/cad/sketch.js';
import { edgeSignature, faceSignature } from '../../src/cad/refs.js';
import { bendAllowance } from '../../src/cad/advanced.js';
import {
  recogniseHoles, turnedAxis, sheetBlank, projectedArea, projectedAreaMesh, wallThickness, edgeFeatures, edgeToolFeed, drillFeed, interpolate, chvorinov, coolingTime, partCost, partCO2,
  costSettings, autoProcess, costReportCsv, costReportHtml, COST_TABLE_DEFAULTS, CO2_TABLE_DEFAULTS, MOULD_PLASTICS,
} from '../../src/cad/costing.js';
import { materialOf } from '../../src/cad/materials.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const top = { kind: 'std', name: 'top' };
const M = COST_TABLE_DEFAULTS.machining;
const steel = materialOf('steel-1020');

function newPart() { return { id: 'p', name: 'Part', features: [] }; }
function sketchOn(part, plane, draw) {
  const s = createFeature(part, 'sketch', { plane, ...createSketchGeometry() });
  draw(s); part.features.push(s); return s;
}
/** A 60 × 40 × 15 block (centred on the origin) with holes of `kind` at two sketch points of its top face. */
function drilledBlock(kind, params = {}) {
  const part = newPart();
  const s = sketchOn(part, top, (k) => addRectangle(k, 0, 0, 60, 40));
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 15 }));
  const r0 = regenerate(part);
  const face = r0.body.faces.find((f) => Math.abs(faceSignature(f).center[2] - 15) < 1e-6);
  const hs = createFeature(part, 'sketch', { plane: faceRef(face), ...createSketchGeometry() });
  hs.entities.push({ id: 'h1', type: 'point', x: 0, y: 0 }, { id: 'h2', type: 'point', x: 15, y: 5 });
  part.features.push(hs);
  part.features.push(createFeature(part, 'hole', { sketch: hs.id, kind, through: true, diameter: 6, ...params }));
  const r = regenerate(part);
  assert.equal(r.error, null, r.error?.message);
  return { part, r };
}

test('drill feed: rpm = 1000·Vc/(π·D), feed/rev = factor·D (clamped), feed = rpm × feed/rev', () => {
  const d = drillFeed(6, 25, 0.015);
  near(d.rpm, 25000 / (Math.PI * 6)); near(d.fr, 0.09); near(d.feed, (25000 / (Math.PI * 6)) * 0.09);
  near(drillFeed(1, 25, 0.015).fr, 0.02); near(drillFeed(100, 25, 0.015).fr, 0.5);
  near(interpolate([[1, 8000], [2, 5000], [3, 3500]], 2.5), 4250); near(interpolate([[1, 8000], [2, 5000]], 0.5), 8000); near(interpolate([[1, 8000], [2, 5000]], 9), 5000);
});

test('settings merge key by key; the process follows the part when not chosen', () => {
  const s = costSettings({ pricePerKg: { steel: 5 }, machining: { rate: 99, removalRate: { steel: 1 } } });
  assert.equal(s.pricePerKg.steel, 5); assert.equal(s.pricePerKg.aluminium, COST_TABLE_DEFAULTS.pricePerKg.aluminium);
  assert.equal(s.machining.rate, 99); assert.equal(s.machining.removalRate.steel, 1); assert.equal(s.machining.removalRate.iron, M.removalRate.iron);
  assert.deepEqual(s.sheet.cutSpeed, COST_TABLE_DEFAULTS.sheet.cutSpeed);
  assert.equal(autoProcess({ sheet: { thickness: 2 }, material: 'steel-1020' }), 'sheet');
  assert.equal(autoProcess({ material: 'abs' }), 'moulding');
  assert.equal(autoProcess({ material: 'al-6061' }), 'machining');
});

test('holes on the B-rep: two through holes Ø6 × 15 from the hole feature', () => {
  const { r } = drilledBlock('simple');
  const holes = recogniseHoles(r.body);
  assert.equal(holes.length, 2);
  for (const h of holes) {
    near(h.diameter, 6); near(h.depth, 15); assert.equal(h.through, true);
    near(h.volume, Math.PI * 9 * 15); near(h.dir[2], -1); near(Math.hypot(h.dir[0], h.dir[1]), 0);
    near(h.entry[2], 15); assert.equal(h.steps.length, 0); assert.equal(h.countersink, null);
  }
});

test('blind hole with a 118° drill point: depth to the tip, entry from the open end, cone volume included', () => {
  const r = 3; const d = 10; const tip = r / Math.tan((59 * Math.PI) / 180);
  const { r: built } = drilledBlock('simple', { through: false, depth: d });
  const holes = recogniseHoles(built.body);
  assert.equal(holes.length, 2);
  const [h] = holes;
  assert.equal(h.through, false);
  near(h.depth, d + tip, 1e-6); near(h.diameter, 6); near(h.entry[2], 15, 1e-9); near(h.dir[2], -1);
  near(h.volume, Math.PI * r * r * d + (Math.PI * r * r * tip) / 3, 1e-6);
  // Flat-bottomed blind hole (end mill): also closed.
  const flat = R.makeBox([0, 0, 0], [30, 30, 20]).cut(R.makeCylinder(4, 12, [15, 15, 8], [0, 0, 1]));
  const [g] = recogniseHoles(flat);
  assert.equal(g.through, false); near(g.depth, 12); near(g.diameter, 8);
  // A fillet-like partial cylinder (a quarter round) is not a hole.
  const notch = R.makeBox([0, 0, 0], [30, 30, 20]).cut(R.makeCylinder(5, 30, [0, 0, -5], [0, 0, 1]));
  assert.equal(recogniseHoles(notch).length, 0);
});

test('counterbore and countersink: the pilot drill runs the whole depth, the step / sink are their own operations', () => {
  const cb = drilledBlock('counterbore', { cbDiameter: 11, cbDepth: 6.5 });
  const holes = recogniseHoles(cb.r.body);
  assert.equal(holes.length, 2);
  near(holes[0].diameter, 6); near(holes[0].depth, 15);
  assert.equal(holes[0].steps.length, 1); near(holes[0].steps[0].diameter, 11); near(holes[0].steps[0].depth, 6.5);
  near(holes[0].volume, Math.PI * 30.25 * 6.5 + Math.PI * 9 * 8.5);
  const c = partCost({ body: cb.r.body, material: 'steel-1020', features: cb.part.features, results: cb.r.results }, { process: 'machining' });
  const bores = c.rows.filter((x) => x.op === 'counterbore');
  assert.equal(bores.length, 2);
  near(bores[0].timeMin, (6.5 + M.approach) / drillFeed(11, M.drillSpeed.steel, M.feedFactor).feed);
  const cs = drilledBlock('countersink', { csDiameter: 13, csAngle: 90 });
  const hs = recogniseHoles(cs.r.body);
  assert.ok(hs[0].countersink, 'countersink found');
  near(hs[0].countersink.diameter, 13, 1e-6); near(hs[0].countersink.length, (13 - 6) / 2, 1e-6);
});

test('machining: drill rows = (depth + approach) / feed, roughing = stock − part − holes, setups, totals add up', () => {
  const { part, r } = drilledBlock('simple');
  const c = partCost({ body: r.body, material: 'steel-1020', features: part.features, results: r.results }, { process: 'machining', lot: 1 });
  assert.equal(c.process, 'machining'); assert.equal(c.turned, false);
  const drills = c.rows.filter((x) => x.op === 'drill');
  assert.equal(drills.length, 2);
  const feed = drillFeed(6, M.drillSpeed.steel, M.feedFactor).feed;
  near(drills[0].timeMin, (15 + M.approach) / feed);
  near(drills[0].cost, (drills[0].timeMin / 60) * M.rate);
  // Block stock: bounding box + 2 mm on every side.
  const stock = 64 * 44 * 19; near(c.stockVolume, stock);
  const volume = 60 * 40 * 15 - 2 * Math.PI * 9 * 15;
  near(c.rows.find((x) => x.op === 'rough').amount, (stock - volume - 2 * Math.PI * 9 * 15) / 1000, 1e-6);
  near(c.rows.find((x) => x.op === 'rough').timeMin, (stock - 60 * 40 * 15) / 1000 / M.removalRate.steel, 1e-6);
  assert.equal(c.rows.filter((x) => x.op === 'pocket').length, 0, 'the hole feature is drilled, not pocketed');
  assert.equal(c.setups, 1, 'all holes from one side');
  near(c.rows.find((x) => x.op === 'setup').timeMin, M.setup);
  near(c.materialCost, stock * 1e-9 * steel.density * COST_TABLE_DEFAULTS.pricePerKg.steel);
  near(c.total, c.rows.reduce((s, x) => s + x.cost, 0));
  near(c.timeMin, c.rows.reduce((s, x) => s + x.timeMin, 0));
  // The lot shares the setup.
  const c10 = partCost({ body: r.body, material: 'steel-1020', features: part.features, results: r.results }, { process: 'machining', lot: 10 });
  near(c10.rows.find((x) => x.op === 'setup').timeMin, M.setup / 10);
});

test('machining: a cut-extrude pocket is its own row with exactly the volume it removed', () => {
  const part = newPart();
  const s = sketchOn(part, top, (k) => addRectangle(k, 0, 0, 60, 40));
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 15 }));
  const r0 = regenerate(part);
  const face = r0.body.faces.find((f) => Math.abs(faceSignature(f).center[2] - 15) < 1e-6);
  const ps = sketchOn(part, faceRef(face), (k) => addRectangle(k, 0, 0, 20, 10));
  part.features.push(createFeature(part, 'extrude', { sketch: ps.id, op: 'cut', depth: 5 }));
  const r = regenerate(part);
  assert.equal(r.error, null);
  const c = partCost({ body: r.body, material: 'al-6061', features: part.features, results: r.results }, { process: 'machining' });
  const pocket = c.rows.filter((x) => x.op === 'pocket');
  assert.equal(pocket.length, 1);
  near(pocket[0].volume, 20 * 10 * 5, 1e-6);
  near(pocket[0].timeMin, 1 / (M.removalRate.aluminium * M.pocketFactor), 1e-6);
  near(c.rows.find((x) => x.op === 'rough').volume, 64 * 44 * 19 - 60 * 40 * 15, 1e-6);
});

test('machining: tapped hole from an internal thread feature; tap time = 2 (L + approach) / (P · rpm)', () => {
  const { part, r } = drilledBlock('simple', { diameter: 6.8 });
  const rim = r.body.edges.find((e) => e.geomType === 'CIRCLE' && Math.abs(e.startPoint.z - 15) < 1e-6);
  part.features.push(createFeature(part, 'thread', { edge: edgeSignature(rim), pitch: 1.25, length: 10, cosmetic: true }));
  const r2 = regenerate(part);
  assert.equal(r2.error, null, r2.error?.message);
  const c = partCost({ body: r2.body, material: 'steel-1020', features: part.features, results: r2.results }, { process: 'machining' });
  const taps = c.rows.filter((x) => x.op === 'tap');
  assert.equal(taps.length, 1);
  const th = [...r2.results.values()].find((x) => x.thread).thread;
  const rpm = (1000 * M.drillSpeed.steel * M.tapSpeed) / (Math.PI * 2 * th.radius);
  near(taps[0].timeMin, (2 * (10 + M.approach)) / (1.25 * rpm));
});

test('turned part: round bar to the next 5 mm, facing both ends, rough turning = the rest', () => {
  const shaft = R.makeCylinder(10, 50, [0, 0, 0], [0, 0, 1]).fuse(R.makeCylinder(6, 20, [0, 0, 50], [0, 0, 1]));
  const ax = turnedAxis(shaft);
  assert.ok(ax, 'rotational');
  near(ax.rMax, 10); near(ax.t1 - ax.t0, 70);
  const c = partCost({ body: shaft, material: 'steel-1020' }, { process: 'machining' });
  assert.equal(c.turned, true); assert.equal(c.stock.kind, 'bar');
  near(c.stock.diameter, 25); near(c.stock.length, 74);
  const bar = Math.PI * 12.5 ** 2 * 74; near(c.stockVolume, bar);
  const face = Math.PI * 12.5 ** 2 * 2;
  const facing = c.rows.filter((x) => x.op === 'facing');
  assert.equal(facing.length, 2); near(facing[0].volume, face);
  near(facing[0].timeMin, face / 1000 / M.turnRate.steel);
  const part = Math.PI * 100 * 50 + Math.PI * 36 * 20;
  near(c.rows.find((x) => x.op === 'turn').volume, bar - part - 2 * face, 1e-6);
  assert.equal(c.setups, 2);
  // A box is not turned.
  assert.equal(turnedAxis(R.makeBox([0, 0, 0], [10, 10, 10])), null);
});

test('sheet blank: cut length = outline + cut-outs, one pierce per loop, laser time from the speed table', () => {
  const plate = R.makeBox([0, 0, 0], [100, 50, 2]).cut(R.makeCylinder(5, 10, [30, 25, -4], [0, 0, 1]));
  const b = sheetBlank(plate, { normal: [0, 0, 1] });
  near(b.cutLength, 300 + 10 * Math.PI, 1e-9); assert.equal(b.pierces, 2); near(b.thickness, 2);
  near(b.area, 5000 - 25 * Math.PI, 1e-6); near(b.width, 100); near(b.height, 50);
  const S = COST_TABLE_DEFAULTS.sheet;
  const c = partCost({ body: plate, material: 'steel-1020', sheet: { thickness: 2, normal: [0, 0, 1], bends: [] } }, { process: 'sheet', lot: 1 });
  near(c.rows.find((x) => x.op === 'laserCut').timeMin, (300 + 10 * Math.PI) / 5000);
  near(c.rows.find((x) => x.op === 'pierce').timeMin, (2 * S.pierceSec) / 60);
  assert.equal(c.bends, 0);
  near(c.sheetArea, 110 * 60); near(c.boughtMass, 110 * 60 * 2 * 1e-9 * steel.density);
  // Aluminium cuts faster (material factor).
  const al = partCost({ body: plate, material: 'al-6061', sheet: { thickness: 2, normal: [0, 0, 1], bends: [] } }, { process: 'sheet' });
  near(al.rows.find((x) => x.op === 'laserCut').speed, 5000 * S.cutFactor.aluminium);
});

test('sheet metal part: the flat pattern is cut, its bends go on the press brake', () => {
  const part = newPart();
  const s = sketchOn(part, top, (k) => addRectangle(k, 0, 0, 100, 50));
  part.features.push(createFeature(part, 'baseFlange', { sketch: s.id, thickness: 2, radius: 3, kFactor: 0.4 }));
  const r0 = regenerate(part);
  const edge = r0.body.edges.find((e) => e.geomType === 'LINE' && e.startPoint.x > 99.9 && e.endPoint.x > 99.9 && e.startPoint.z > 1.9 && e.endPoint.z > 1.9);
  part.features.push(createFeature(part, 'edgeFlange', { edge: edgeSignature(edge), length: 30, angle: 90 }));
  const r = regenerate(part);
  const flat = regenerate({ ...part, flat: true });
  const c = partCost({ body: r.body, flat: flat.body, sheet: r.sheet, material: 'steel-1020' }, { lot: 1 });
  assert.equal(c.process, 'sheet');
  assert.equal(c.bends, 1);
  const L = 100 + bendAllowance(90, 3, 2, 0.4) + 30;
  near(c.blank.cutLength, 2 * (L + 50), 1e-6);
  const S = COST_TABLE_DEFAULTS.sheet;
  near(c.rows.find((x) => x.op === 'bend').timeMin, S.bendSec / 60);
  near(c.rows.find((x) => x.op === 'setup').timeMin, S.bendSetup);
  // Without the sheet's list the bends come from the folded body's cylinder pairs.
  const c2 = partCost({ body: r.body, flat: flat.body, sheet: { ...r.sheet, bends: [] }, material: 'steel-1020' }, {});
  assert.equal(c2.bends, 1);
});

test('casting: pour weight from the yield, Chvorinov solidification, pattern over the lot', () => {
  const box = R.makeBox([0, 0, 0], [100, 50, 20]);
  const V = 100000; const A = 2 * (5000 + 2000 + 1000);
  near(chvorinov(V, A, 1.2), 1.2 * (V / A) ** 2);
  const C = COST_TABLE_DEFAULTS.casting;
  const iron = materialOf('cast-iron');
  const c = partCost({ body: box, material: 'cast-iron' }, { process: 'casting', lot: 200 });
  const mass = V * 1e-9 * iron.density;
  near(c.partMass, mass); near(c.poured, mass / C.yield); near(c.boughtMass, mass / C.yield);
  near(c.solidSec, C.B * (V / A) ** 2);
  near(c.rows.find((x) => x.op === 'solidify').timeMin, (C.B * (V / A) ** 2) / 60);
  near(c.rows.find((x) => x.op === 'melt').energy, (mass / C.yield) * C.meltEnergy.iron);
  near(c.toolingCost, C.patternCost / 200);
  near(c.materialCost, (mass / C.yield) * COST_TABLE_DEFAULTS.pricePerKg.iron);
});

test('moulding: the measured wall, cooling time formula, clamp tonnage from the projected area, mould amortised', () => {
  const plate = R.makeBox([0, 0, 0], [100, 50, 2]);
  near(projectedArea(plate, [0, 0, 1]), 5000, 1e-9);
  const p = MOULD_PLASTICS.abs;
  near(coolingTime(2, p), (4 / (Math.PI ** 2 * p.alpha)) * Math.log((4 / Math.PI) * ((p.melt - p.mould) / (p.eject - p.mould))));
  const P = COST_TABLE_DEFAULTS.moulding;
  const c = partCost({ body: plate, material: 'abs' }, { lot: 1000, moulding: { cavities: 2 } });
  assert.equal(c.process, 'moulding');
  const V = 10000; const A = 2 * (5000 + 200 + 100);
  void A;
  near(c.wall, 2, 1e-6, 'the plate is 2 thick'); near(c.walls.max, 2, 1e-6);
  near(c.coolSec, coolingTime(c.wall, p)); assert.equal(c.projectedExact, true);
  near(c.shotVolume, V * 2 * (1 + P.runner));
  near(c.fillSec, (V * 2 * (1 + P.runner)) / 1000 / P.injectionRate);
  near(c.cycleSec, c.fillSec + c.coolSec + P.resetSec);
  near(c.tonnes, (5000 * 2 * (1 + P.runner) * P.cavityPressure) / 9806.65);
  near(c.rows.find((x) => x.op === 'cool').timeMin, c.coolSec / 60 / 2);
  near(c.mouldCost, P.mouldBase + 2 * (P.cavityCost + 6 * P.perFace));
  near(c.toolingCost, c.mouldCost / 1000);
  // A wall given by hand and the plastic's own temperatures.
  const w = partCost({ body: plate, material: 'abs' }, { moulding: { wall: 3, eject: 100 } });
  near(w.coolSec, coolingTime(3, { ...p, eject: 100 }));
});

test('CO₂e from the breakdown: material bought × factor, each row energy × grid, transport', () => {
  const { part, r } = drilledBlock('simple');
  const c = partCost({ body: r.body, material: 'steel-1020', features: part.features, results: r.results }, { process: 'machining' });
  for (const x of c.rows.filter((y) => y.op !== 'material')) near(x.energy, (x.timeMin / 60) * M.power);
  const s = partCO2(c);
  near(s.materialCO2, c.boughtMass * CO2_TABLE_DEFAULTS.perKg.steel);
  near(s.energy, c.energy); near(s.processCO2, c.energy * CO2_TABLE_DEFAULTS.grid);
  near(s.transportCO2, (c.partMass / 1000) * CO2_TABLE_DEFAULTS.distance * CO2_TABLE_DEFAULTS.perTonneKm);
  near(s.total, s.rows.reduce((a, x) => a + x.co2, 0));
  near(partCO2(c, { factor: 2, distance: 0, grid: 0 }).total, c.boughtMass * 2);
});

test('report: CSV has a header, one line per row, transport and the totals; HTML lists the same rows', () => {
  const box = R.makeBox([0, 0, 0], [100, 50, 20]);
  const c = partCost({ body: box, material: 'steel-1020' }, { process: 'machining' });
  const s = partCO2(c);
  const csv = costReportCsv(c, s);
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 1 + c.rows.length + 2);
  assert.equal(lines[0], 'op,feature,qty,amount,unit,time,cost,energy,co2');
  assert.ok(lines.at(-1).startsWith('total,'));
  assert.ok(lines.at(-1).includes(String(Math.round(c.total * 1e4) / 1e4)));
  const t = (k) => ({ 'cost.col.op': 'Operation' }[k] ?? k);
  assert.ok(costReportCsv(c, s, t).startsWith('Operation,'));
  const html = costReportHtml(c, s, null, { title: 'Report <A>' });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('Report &lt;A&gt;'));
  assert.equal((html.match(/<tr><td>/g) ?? []).length, c.rows.length);
});

test('the Costing and Sustainability pages render every process with texts in both languages', async () => {
  const { evalPm, COST_FIELDS } = await import('../../src/ui/pm-eval-more.js');
  const { DICTIONARIES } = await import('../../src/i18n.js');
  const plate = R.makeBox([0, 0, 0], [100, 50, 2]).cut(R.makeCylinder(5, 10, [30, 25, -4], [0, 0, 1]));
  for (const lang of ['en', 'ko']) {
    const dict = DICTIONARIES[lang];
    const missing = new Set();
    const t = (k, p = {}) => { if (!(k in dict)) missing.add(k); return String(dict[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => p[x] ?? ''); };
    const api = {
      t, pmHead: (g, title) => `<h>${title}</h>`, pmGroup: (g, title, body) => `<section>${title}${body}</section>`, pmSeg: () => '', pmList: () => '', pmButton: (k, g, l) => `<button data-pm="${k}">${l}</button>`,
      textRow: (k, v, l) => `<label data-k="${k}">${l}<input value="${v}"></label>`, sel: (k, opts, cur) => `<select data-k="${k}">${opts.map(([v, l]) => `<option ${v === cur ? 'selected' : ''}>${l}</option>`).join('')}</select>`,
    };
    for (const process of ['machining', 'sheet', 'casting', 'moulding']) {
      const material = process === 'moulding' ? 'abs' : 'steel-1020';
      const cost = partCost({ body: plate, material, sheet: process === 'sheet' ? { thickness: 2, normal: [0, 0, 1], bends: [] } : null }, { process });
      const co2 = partCO2(cost);
      const html = evalPm({ kind: 'costing', result: { cost, co2, material } }, { ...api, costing: { process } });
      for (const [path] of COST_FIELDS[process]) assert.ok(html.includes(`data-k="cost:${path.replace('*', cost.group)}"`), `${process}: ${path}`);
      assert.ok(html.includes('data-pm="drw.costCsv"') && html.includes('data-pm="drw.costHtml"'));
      const sus = evalPm({ kind: 'sustain', result: { cost, co2, material } }, { ...api, sustain: {} });
      assert.ok(sus.includes('CO₂e'));
    }
    assert.deepEqual([...missing], [], `${lang}: texts missing`);
  }
});

test('machining: holes from two sides need two setups; a hole above the largest drill is helically milled', () => {
  const body = R.makeBox([0, 0, 0], [100, 60, 20])
    .cut(R.makeCylinder(3, 30, [10, 30, -5], [0, 0, 1]))
    .cut(R.makeCylinder(2.5, 120, [-10, 8, 10], [1, 0, 0]))
    .cut(R.makeCylinder(20, 30, [70, 32, -5], [0, 0, 1]));
  const holes = recogniseHoles(body);
  assert.equal(holes.length, 3);
  const c = partCost({ body, material: 'steel-1020' }, { process: 'machining', lot: 1 });
  assert.equal(c.setups, 2);
  near(c.rows.find((x) => x.op === 'setup').timeMin, 2 * M.setup);
  const big = c.rows.filter((x) => x.op === 'interpolate');
  assert.equal(big.length, 1);
  near(big[0].volume, Math.PI * 400 * 20, 1e-6); near(holes.find((h) => Math.abs(h.axis[0]) > 0.5).depth, 100);
  near(big[0].timeMin, (Math.PI * 400 * 20) / 1000 / (M.removalRate.steel * M.pocketFactor), 1e-6);
  assert.equal(c.rows.filter((x) => x.op === 'drill').length, 2);
  // Setups given by hand, and holes reamed up to a diameter.
  const d = partCost({ body, material: 'steel-1020' }, { process: 'machining', machining: { setups: 5, reamBelow: 6 } });
  assert.equal(d.setups, 5);
  assert.equal(d.rows.filter((x) => x.op === 'ream').length, 2);
});

test('projected area from the B-rep: overlapping faces count once (T-bracket), lying cylinder and sphere exact', () => {
  // Base 40 × 20, a post, a top 60 × 20 overhanging the base: the shadow is the top alone.
  const T = R.makeBox([0, 0, 0], [40, 20, 5]).fuse(R.makeBox([15, 0, 5], [25, 20, 15])).fuse(R.makeBox([-10, 0, 15], [50, 20, 20]));
  near(projectedArea(T, [0, 0, 1]), 60 * 20, 1e-9);
  assert.ok(projectedAreaMesh(T, [0, 0, 1]) > 60 * 20 + 500, 'adding up the faces would count the base again');
  // An L-bracket seen from the side (along −Y): its outline 40 × 30 less the 35 × 25 notch.
  const L = R.makeBox([0, 0, 0], [40, 30, 5]).fuse(R.makeBox([0, 0, 0], [5, 30, 30]));
  near(projectedArea(L, [0, -1, 0]), 40 * 5 + 5 * 25, 1e-9);
  near(projectedArea(R.makeCylinder(5, 40, [0, 0, 10], [1, 0, 0]), [0, 0, 1]), 10 * 40, 1e-9);
  near(projectedArea(R.makeSphere(5), [0, 0, 1]), Math.PI * 25, 1e-9);
  // A tube standing on its end: the ring.
  near(projectedArea(R.makeCylinder(10, 20, [0, 0, 0], [0, 0, 1]).cut(R.makeCylinder(6, 40, [0, 0, -10], [0, 0, 1])), [0, 0, 1]), Math.PI * (100 - 36), 1e-9);
});

test('wall thickness by inscribed spheres: a shelled box is as thick as its shell', () => {
  const part = newPart();
  const s0 = sketchOn(part, top, (k) => addRectangle(k, 0, 0, 60, 40));
  part.features.push(createFeature(part, 'extrude', { sketch: s0.id, depth: 30 }));
  const r0 = regenerate(part);
  const lid = r0.body.faces.find((f) => Math.abs(faceSignature(f).center[2] - 30) < 1e-6);
  part.features.push(createFeature(part, 'shell', { thickness: 2, faces: [faceSignature(lid)] }));
  const r = regenerate(part);
  assert.equal(r.error, null);
  const w = wallThickness(r.body);
  near(w.governing, 2, 1e-6);
  // Only where two walls meet is the material thicker: the sphere in the corner of two 2 mm walls is 4√2 / (1 + √2).
  assert.ok(w.max > 2 && w.max <= (4 * Math.SQRT2) / (1 + Math.SQRT2) + 1e-6, String(w.max));
  assert.ok(w.min < 2 && w.avg <= 2 + 1e-6, 'thinner only at the rims and corners');
  assert.ok(w.samples.length >= 150);
  // Two walls: the thick one governs once it covers enough of the area.
  const step = R.makeBox([0, 0, 0], [100, 50, 2]).fuse(R.makeBox([0, 0, 0], [30, 50, 6]));
  near(wallThickness(step).governing, 6, 1e-6);
  // A user's wall wins over the measured one.
  const c = partCost({ body: r.body, material: 'pc' }, { moulding: { wall: 2.5 } });
  near(c.wall, 2.5); assert.equal(c.walls, null);
});

test('fillets and chamfers on the B-rep: radius, edge length, removed volume; own tool rows by length / feed', () => {
  const box = () => R.makeBox([0, 0, 0], [40, 30, 20]);
  const filleted = box().fillet(5, (e) => e.inDirection('Z'));
  const fs = edgeFeatures(filleted);
  assert.equal(fs.length, 4);
  for (const x of fs) {
    assert.equal(x.kind, 'fillet'); assert.equal(x.convex, true);
    near(x.radius, 5); near(x.length, 20); near(x.angle, Math.PI / 2); near(x.volume, (1 - Math.PI / 4) * 25 * 20);
  }
  near(fs.reduce((a, x) => a + x.volume, 0), R.measureVolume(box()) - R.measureVolume(filleted), 1e-9);
  const c = partCost({ body: filleted, material: 'al-6061' }, { process: 'machining' });
  const rows = c.rows.filter((x) => x.op === 'cornerRound');
  assert.equal(rows.length, 4);
  const t = edgeToolFeed(20, M.millSpeed.aluminium, { teeth: M.edgeTeeth, factor: M.edgeFeedFactor, maxRpm: M.maxRpm });
  near(t.rpm, Math.min(M.maxRpm, 300000 / (Math.PI * 20))); near(t.fz, 0.15); near(t.feed, t.rpm * 4 * 0.15);
  near(rows[0].timeMin, (20 + 2 * M.approach) / t.feed);
  near(c.rows.find((x) => x.op === 'rough').volume, 44 * 34 * 24 - 40 * 30 * 20, 1e-6);
  assert.equal(c.rows.filter((x) => x.op === 'pocket').length, 0);
  // Chamfers 2 × 2 (45°): band 2√2 wide, triangle ½·2·2 per mm.
  const ch = edgeFeatures(box().chamfer(2, (e) => e.inDirection('Z')));
  assert.equal(ch.length, 4);
  for (const x of ch) { near(x.width, 2 * Math.SQRT2); near(x.legs[0], 2); near(x.legs[1], 2); near(x.length, 20); near(x.volume, 40); }
  const cc = partCost({ body: box().chamfer(2, (e) => e.inDirection('Z')), material: 'steel-1020' }, { process: 'machining' });
  const tc = edgeToolFeed(6, M.millSpeed.steel, { teeth: M.edgeTeeth, factor: M.edgeFeedFactor, maxRpm: M.maxRpm });
  near(cc.rows.find((x) => x.op === 'chamferMill').timeMin, (20 + 2 * M.approach) / tc.feed);
  // A round edge (torus band): the corner edge's length 2π·10 and the volume by Pappus.
  const shaft = () => R.makeCylinder(10, 40, [0, 0, 0], [0, 0, 1]);
  const rounded = shaft().fillet(3, (e) => e.inPlane('XY', 40));
  const [tor] = edgeFeatures(rounded);
  near(tor.radius, 3, 1e-9); near(tor.length, 20 * Math.PI, 1e-9);
  near(tor.volume, R.measureVolume(shaft()) - R.measureVolume(rounded), 1e-6);
  // An inside corner: a ball-nose of the radius, stepping across the arc.
  const ell = R.makeBox([0, 0, 0], [40, 30, 5]).fuse(R.makeBox([0, 0, 0], [5, 30, 30])).fillet(4, (e) => e.inDirection('Y').containsPoint([5, 15, 5]));
  const inner = edgeFeatures(ell).filter((x) => !x.convex);
  assert.equal(inner.length, 1);
  near(inner[0].radius, 4); near(inner[0].length, 30); near(inner[0].volume, (1 - Math.PI / 4) * 16 * 30);
  const cl = partCost({ body: ell, material: 'steel-1020' }, { process: 'machining' });
  const ball = cl.rows.find((x) => x.op === 'ballNose');
  const passes = Math.ceil((4 * Math.PI / 2) / M.ballStep);
  assert.equal(ball.passes, passes);
  near(ball.timeMin, (passes * (30 + 2 * M.approach)) / edgeToolFeed(8, M.millSpeed.steel, { teeth: M.edgeTeeth, factor: M.edgeFeedFactor, maxRpm: M.maxRpm }).feed);
});
