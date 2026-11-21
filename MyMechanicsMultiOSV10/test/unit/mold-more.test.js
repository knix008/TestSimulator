// Mold tools: shut-off surfaces fill the openings that go through the part, the parting surface runs out from
// the parting line, and core / cavity come from splitting the tooling block with them; the undercut warning.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { throughOpenings, partingSurfaceOf, coreCavity, edgeLoops, undercutCount, pullOf, ruledStrips } from '../../src/cad/mold-more.js';
import { partingEdges, ADVANCED_TYPES, ADVANCED_DEFAULTS } from '../../src/cad/advanced.js';
import { MOLD_MORE_TYPES } from '../../src/cad/mold-more-types.js';
import { regenerate, FEATURE_TYPES } from '../../src/cad/features.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
const up = [0, 0, 1];
const plate = () => R.makeBox([0, 0, 0], [40, 20, 10]).cut(R.makeCylinder(4, 30, [20, 10, -10], [0, 0, 1]));

test('the mold features are registered', () => {
  for (const t of MOLD_MORE_TYPES) { assert.ok(ADVANCED_TYPES.includes(t)); assert.ok(FEATURE_TYPES.includes(t)); assert.equal(typeof ADVANCED_DEFAULTS[t], 'function'); }
  assert.deepEqual(pullOf({ dir: '' }, { parting: { key: '-y', dir: [0, -1, 0] } }).dir, [0, -1, 0]);
  assert.deepEqual(pullOf({ dir: 'x' }, {}).dir, [1, 0, 0]);
});

test('shut-off: one patch per opening that goes right through along the pull; blind holes need none', () => {
  const o = throughOpenings(plate(), up);
  assert.equal(o.length, 1, 'the hole shows on the top and the bottom face: one patch');
  near(o[0].area, Math.PI * 16, 1e-3);
  // At the parting height asked for (the bottom, z = 0) or else the top.
  near(throughOpenings(plate(), up, { height: 0 })[0].w, 0, 1e-9);
  near(throughOpenings(plate(), up)[0].w, 10, 1e-9);
  const blind = R.makeBox([0, 0, 0], [40, 20, 10]).cut(R.makeCylinder(4, 15, [20, 10, 3], [0, 0, 1]));
  assert.equal(throughOpenings(blind, up).length, 0);
  const two = plate().cut(R.makeCylinder(2, 30, [6, 6, -10], [0, 0, 1]));
  assert.equal(throughOpenings(two, up).length, 2);
  // Across the pull the hole is not an opening.
  assert.equal(throughOpenings(plate(), [1, 0, 0]).length, 0);
});

test('parting surface: flat parting line → a plane around the outline; stepped → ruled strips', () => {
  const box = R.makeBox([0, 0, 0], [40, 20, 10]);
  const ps = partingSurfaceOf(box, up, 30);
  assert.ok(ps.planar); near(ps.height, 0, 1e-9);
  near(R.measureArea(ps.surface), (40 + 60) * (20 + 60) - 40 * 20, 1e-3);
  assert.equal(edgeLoops(partingEdges(box, up)).length, 1);
  // A parting line that is not level: ruled strips out from each edge, neighbours sharing their side lines.
  const c = [[0, 0, 0], [10, 0, 5], [10, 10, 0], [0, 10, 5]];
  const loop = c.map((p, i) => R.makeLine(p, c[(i + 1) % 4]));
  const strips = ruledStrips(loop, up, [5, 5, 2.5], 20);
  assert.equal(strips.length, 4);
  for (const s of strips) assert.ok(R.measureArea(s) > 100);
  const ends = (s) => s.edges.map((e) => [e.startPoint, e.endPoint].map((p) => [p.x, p.y, p.z].map((v) => Math.round(v * 1000)).join(',')).sort().join('|'));
  const shared = ends(strips[0]).filter((k) => ends(strips[1]).includes(k));
  assert.equal(shared.length, 1, 'neighbouring strips share their side line');
});

test('core and cavity by surfaces: through openings need their shut-offs', () => {
  const body = plate();
  const ps = partingSurfaceOf(body, up, 40);
  const m = 10;
  assert.throws(() => coreCavity(body, { dir: up, surface: ps.surface, shutOffs: [], margin: m }), /not-parted|kernel/);
  const shut = throughOpenings(body, up, { height: ps.height }).map((o) => o.patch);
  const r = coreCavity(body, { dir: up, surface: ps.surface, shutOffs: shut, margin: m });
  const block = (40 + 2 * m) * (20 + 2 * m) * (10 + 2 * m);
  const core = (40 + 2 * m) * (20 + 2 * m) * m; // everything below the parting plane z = 0
  near(R.measureVolume(r.core), core, 1e-3);
  near(R.measureVolume(r.cavity), block - core - R.measureVolume(body), 1e-3);
  assert.ok(r.cavity.boundingBox.bounds[0][2] >= -1e-6, 'the cavity is above the parting plane (with the hole’s pin)');
});

test('the features in a rebuild: parting line → shut-off → parting surface → tooling split; undercut warning', () => {
  const part = (body, more = []) => ({ id: 'p', name: 'P', features: [{ id: 'im', type: 'import', name: 'I', brep: body.serialize() }, { id: 'pl', type: 'partingLine', name: 'PL', dir: 'z' }, ...more] });
  const r = regenerate(part(plate(), [
    { id: 'so', type: 'shutOff', name: 'SO', ...ADVANCED_DEFAULTS.shutOff() },
    { id: 'ps', type: 'partingSurface', name: 'PS', ...ADVANCED_DEFAULTS.partingSurface(), distance: 40 },
    { id: 'ts', type: 'toolingSplit', name: 'TS', ...ADVANCED_DEFAULTS.toolingSplit(), dir: 'z', gap: 0, margin: 10 },
  ]));
  for (const id of ['pl', 'so', 'ps', 'ts']) assert.equal(r.results.get(id).ok, true, `${id}: ${r.results.get(id).error ?? ''}`);
  assert.equal(r.results.get('so').shutOff.count, 1);
  assert.ok(r.surfaces.has('so') && r.surfaces.has('ps'));
  assert.ok(r.results.get('ts').tooling.bySurface);
  assert.equal(r.results.get('ts').undercuts, 0);
  const block = 60 * 40 * 30;
  near(R.measureVolume(r.body), block - R.measureVolume(plate()), 1e-2);
  // A side hole across the pull: the tooling split warns of an undercut.
  const side = R.makeBox([0, 0, 0], [40, 20, 10]).cut(R.makeCylinder(3, 60, [-10, 10, 5], [1, 0, 0]));
  assert.ok(undercutCount(side, up) >= 1);
  const r2 = regenerate(part(side, [{ id: 'ts', type: 'toolingSplit', name: 'TS', ...ADVANCED_DEFAULTS.toolingSplit(), dir: 'z' }]));
  assert.ok(r2.results.get('ts').ok && r2.results.get('ts').undercuts >= 1);
  // No openings: the shut-off feature says so.
  const r3 = regenerate(part(R.makeBox([0, 0, 0], [10, 10, 10]), [{ id: 'so', type: 'shutOff', name: 'SO', dir: '' }]));
  assert.equal(r3.results.get('so').error, 'no-openings');
});
