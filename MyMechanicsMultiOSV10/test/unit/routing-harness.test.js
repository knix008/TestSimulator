// Electrical harness routing: wires routed from connector pin to pin along the bundles (shortest way, through
// the clips asked for), wire lengths with bundle bends rounded and end allowances, bundle diameters from the
// wires, the wire list and connector tables, the flattened harness keeping every branch's true length (and its
// SVG / DXF output), the harness solid with its colours, and the feature in a part.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { harnessModel, harnessBom, harnessFlat, harnessSvg, harnessDxf, harnessSolid, bundleDiameter, WIRE_GAUGES, sampleHarness, connectorTables, wireList } from '../../src/cad/harness.js';
import { routeFaceColours } from '../../src/cad/routing.js';
import { editRouteTable, routeTableCommand, isRouteTableKey } from '../../src/cad/route-edit.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

const H = () => ({
  kind: 'harness', bendRadius: 10, fill: 0.8, endAllowance: 5, diameter: 4,
  points: [[0, 0, 0], [100, 0, 0], [100, 100, 0]],
  branches: [{ points: [[50, 0, 0], [50, -80, 0]] }],
  connectors: [{ name: 'J1', at: [0, 0, 0], pins: 2 }, { name: 'J2', at: [100, 100, 0], pins: 2 }, { name: 'J3', at: [50, -80, 0], pins: 2 }],
  clips: [{ name: 'C1', at: [25, 0, 0] }, { name: 'C2', at: [100, 50, 0] }],
  wires: [
    { name: 'W1', from: 'J1', fromPin: 1, to: 'J2', toPin: 1, color: 'RD', gauge: 0.5, via: ['C2'] },
    { name: 'W2', from: 'J1', fromPin: 2, to: 'J3', toPin: 1, color: 'BK', gauge: 1.5 },
    { name: 'W3', from: 'J2', fromPin: 2, to: 'J3', toPin: 2, color: 'BU', gauge: 0.35 },
  ],
});
const corr = 2 * 10 * Math.tan(Math.PI / 4) - 10 * (Math.PI / 2);

test('wire lengths: shortest way through the bundles, bends rounded, the end allowance at both ends', () => {
  const m = harnessModel(H());
  const len = Object.fromEntries(m.wires.map((w) => [w.name, w.length]));
  near(len.W1, 200 - corr + 10);
  near(len.W2, 130 + 10);
  near(len.W3, 230 - corr + 10);
  assert.deepEqual(m.wires[0].clips, ['C1', 'C2']);
  near(m.length, 280 - corr);
  // The list rounds to 0.1 mm.
  assert.deepEqual(wireList(m).map((w) => w.length), [Math.round((210 - corr) * 10) / 10, 140, Math.round((240 - corr) * 10) / 10]);
});

test('bundle diameter = √(Σ d² / fill) of the wires in each bundle; empty bundles take the set diameter', () => {
  const m = harnessModel(H());
  const d = (g) => WIRE_GAUGES[g];
  const D = (gs) => Math.sqrt(gs.reduce((s, g) => s + d(g) ** 2, 0) / 0.8);
  const byEnds = (a, b) => m.bundles.find((x) => { const e = m.net.edges[x.edge]; const pa = m.net.nodes[e.a].p; const pb = m.net.nodes[e.b].p; return String(pa) === String(a) && String(pb) === String(b); });
  near(byEnds([0, 0, 0], [25, 0, 0]).diameter, D([0.5, 1.5]));
  near(byEnds([50, 0, 0], [100, 0, 0]).diameter, D([0.5, 0.35]));
  near(byEnds([50, 0, 0], [50, -80, 0]).diameter, D([1.5, 0.35]));
  near(bundleDiameter([2, 2, 2, 2], 1), 4);
  const lone = harnessModel({ ...H(), wires: [] });
  assert.ok(lone.bundles.every((b) => b.diameter === 4));
});

test('wiring errors: pins past the connector, a pin used twice, unknown connectors and clips', () => {
  const bad = (patch) => { const f = H(); f.wires = [{ ...f.wires[0], ...patch }]; return () => harnessModel(f); };
  assert.throws(bad({ toPin: 3 }), (e) => e.code === 'wire-pin');
  assert.throws(bad({ to: 'J9' }), (e) => e.code === 'wire-connector');
  assert.throws(bad({ via: ['C7'] }), (e) => e.code === 'wire-clip');
  const f = H(); f.wires.push({ name: 'W4', from: 'J1', fromPin: 1, to: 'J3', toPin: 2 });
  assert.throws(() => harnessModel(f), (e) => e.code === 'pin-used');
  assert.throws(() => harnessModel({ ...H(), connectors: [{ name: 'J1', at: [3, 3, 3], pins: 1 }] }), (e) => e.code === 'point-off-route');
});

test('connector tables: every pin with its wire, colour, size and the far end', () => {
  const t = connectorTables(harnessModel(H()));
  assert.deepEqual(t.map((x) => x.connector), ['J1', 'J2', 'J3']);
  assert.deepEqual(t[2].rows, [{ pin: 1, wire: 'W2', color: 'BK', gauge: 1.5, to: 'J1:2' }, { pin: 2, wire: 'W3', color: 'BU', gauge: 0.35, to: 'J2:2' }]);
  const bom = harnessBom(harnessModel(H()));
  assert.deepEqual(bom.rows.filter((r) => r.item === 'connector').map((r) => [r.type, r.size, r.qty]), [['rect25', '2P 9×6.5×16', 3]]);
  assert.equal(bom.rows.filter((r) => r.item === 'clip').reduce((s, r) => s + r.qty, 0), 2);
  near(bom.rows.find((r) => r.item === 'wire' && r.code === 'BK').length, 140);
});

test('flattened harness: bends straightened, every branch keeps its true length, clips at their distances', () => {
  const m = harnessModel(H());
  const flat = harnessFlat(m);
  assert.equal(flat.nodes.length, 4);
  assert.equal(flat.segments.length, 3);
  const L = flat.segments.map((s) => s.length).sort((a, b) => a - b);
  near(L[0], 50); near(L[1], 80); near(L[2], 150 - corr);
  for (const s of flat.segments) { const [p, q] = s.points; near(Math.hypot(q[0] - p[0], q[1] - p[1]), s.length); }
  // Starting at J1, the longest way goes straight on.
  const at = (name) => flat.nodes.find((n) => n.name === name);
  near(at('J1').x, 0); near(at('J1').y, 0);
  near(at('J2').x, 50 + 150 - corr); near(at('J2').y, 0, 1e-9);
  const toJ2 = flat.segments.find((s) => s.clips.some((c) => c.name === 'C2'));
  near(toJ2.clips[0].at, 50 - 10 + 10 * Math.PI / 2 - 10 + 50);
  // The wire lengths add up along the flat drawing too.
  near(50 + toJ2.length + 10, m.wires[0].length);
  const svg = harnessSvg(flat);
  assert.match(svg, /^<svg /);
  assert.equal((svg.match(/<line [^>]*data-length=/g) ?? []).length, 3);
  assert.match(svg, />J3</);
  const dxf = harnessDxf(flat);
  assert.match(dxf, /AC1009/);
  assert.equal((dxf.match(/\nLINE\n8\nBUNDLE\n/g) ?? []).length, 3);
  assert.ok(dxf.endsWith('EOF\n'));
  assert.throws(() => harnessFlat(harnessModel({ ...H(), connectors: H().connectors.slice(0, 2), wires: [], branches: [{ points: [[50, 0, 0], [50, 100, 0], [100, 100, 0]] }] })), (e) => e.code === 'route-loop');
});

test('harness solid: bundles, housings sized by pin count, clips around the bundle; colours on their faces', () => {
  const r = harnessSolid(H());
  assert.ok(R.measureVolume(r.shape) > 0);
  const faces = new Set(r.shape.faces.map((x) => x.hashCode));
  assert.equal(r.colors.length, 3);
  for (const c of r.colors) { assert.ok(c.faces.length > 0); for (const h of c.faces) assert.ok(faces.has(h)); }
  // In a part: the feature's result carries the BOM (wire list, tables) and the colours reach the body.
  const part = { id: 'p', name: 'P', features: [] };
  const f = createFeature(part, 'route', H());
  part.features.push(f);
  const g = regenerate(part);
  const res = g.results.get(f.id);
  assert.ok(res.ok, res.detail);
  assert.equal(res.route.bom.kind, 'harness');
  assert.equal(res.route.bom.wires.length, 3);
  assert.ok(routeFaceColours(g).size >= r.colors.reduce((s, c) => s + c.faces.length, 0) - 2);
});

test('route table edits: branches, connectors, clips and wires from the PropertyManager', () => {
  const f = { kind: 'harness', points: [[0, 0, 20], [150, 0, 20], [300, 0, 20]] };
  Object.assign(f, sampleHarness(f.points));
  const m = harnessModel(f);
  assert.equal(m.wires.length, 4);
  assert.ok(isRouteTableKey('hw:0:gauge') && !isRouteTableKey('od'));
  editRouteTable(f, 'hw:0:gauge', '1.5', 1.5);
  assert.equal(f.wires[0].gauge, 1.5);
  editRouteTable(f, 'hc:1:name', 'X2', null);
  assert.equal(f.connectors[1].name, 'X2'); assert.equal(f.wires[0].to, 'X2', 'wires follow a renamed connector');
  editRouteTable(f, 'rbp:0:1:1', '120', 120);
  assert.equal(f.branches[0].points[1][1], 120);
  assert.deepEqual(f.connectors[2].at, [150, 120, 20], 'a connector on a moved end point moves with it');
  routeTableCommand(f, 'addWire');
  assert.equal(f.wires.length, 5);
  routeTableCommand(f, 'delWire.4');
  routeTableCommand(f, 'addClip');
  assert.equal(f.clips.length, 2);
  harnessModel(f);
  routeTableCommand(f, 'addBranch');
  assert.equal(f.branches.length, 2);
  harnessModel(f);
  routeTableCommand(f, 'delBranch.1');
  assert.equal(f.branches.length, 1);
  assert.equal(editRouteTable(f, 'hc:0:pins', 'x', null), 'invalid');
});
