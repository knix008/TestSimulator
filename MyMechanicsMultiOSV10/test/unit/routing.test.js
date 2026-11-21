// Routing: the centre line (straights + bend arcs), its length, trimming for flanges, the route BOM (cut
// lengths, elbows, bends, flanges, cable length) and the swept solids on the kernel (hollow pipe volume by
// Pappus, elbows as separate solids, flanges at the ends, a cable along a spline).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { routePath, routeBom, routeSection, routePoints, bendRadiusOf, trimEnds, polylineLength, sectionVolume, routeSolid } from '../../src/cad/routing.js';
import { PIPES, stdShape } from '../../src/cad/stdparts.js';
import { countSolids } from '../../src/cad/part-more.js';

await loadKernel();
const R = rep();
const V = (s) => R.measureVolume(s);
const near = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const L_PTS = [[0, 0, 0], [0, 0, 100], [100, 0, 100]];

test('a 90° corner: tangent points, arc centre and the developed length', () => {
  const p = routePath(L_PTS, 20);
  assert.deepEqual(p.pieces.map((x) => x.type), ['line', 'arc', 'line']);
  const [a, arc, b] = p.pieces;
  near(a.length, 80); near(b.length, 80);
  near(arc.angle, 90); near(arc.length, 20 * Math.PI / 2);
  assert.deepEqual(arc.centre.map((v) => Math.round(v * 1e6) / 1e6), [20, 0, 80]);
  near(Math.hypot(...arc.mid.map((v, i) => v - arc.centre[i])), 20);
  near(p.length, 160 + 10 * Math.PI);
  assert.equal(p.bends.length, 1);
});

test('collinear points need no bend; 3D corners of any angle', () => {
  const p = routePath([[0, 0, 0], [0, 0, 50], [0, 0, 100], [60, 80, 100]], 10);
  assert.deepEqual(p.pieces.map((x) => x.type), ['line', 'line', 'arc', 'line']);
  near(p.pieces[2].angle, 90);
  // 45° corner: T = r tan 22.5°.
  const q = routePath([[0, 0, 0], [100, 0, 0], [200, 100, 0]], 30);
  near(q.pieces[1].angle, 45);
  near(q.pieces[0].length, 100 - 30 * Math.tan(Math.PI / 8));
  near(polylineLength([[0, 0, 0], [3, 4, 0], [3, 4, 12]]), 17);
});

test('bends that do not fit and U-turns are errors', () => {
  assert.throws(() => routePath([[0, 0, 0], [0, 0, 10], [10, 0, 10]], 20), (e) => e.code === 'bend-too-large');
  assert.throws(() => routePath([[0, 0, 0], [0, 0, 50], [0, 0, 0]], 5), (e) => e.code === 'route-reversal');
  assert.throws(() => routePath([[0, 0, 0]], 5), (e) => e.code === 'no-path');
  assert.throws(() => trimEnds(routePath(L_PTS, 20).pieces, 85, 0), (e) => e.code === 'route-end-short');
});

test('sections and bend radii: pipe sizes, tubes, cables; elbows force the standard radius', () => {
  near(routeSection({ kind: 'pipe', dn: 'DN25' }).ro, 33.7 / 2);
  near(routeSection({ kind: 'pipe', dn: 'DN25' }).ri, 33.7 / 2 - 3.38);
  assert.deepEqual(routeSection({ kind: 'tube', od: 12, wall: 1 }), { ro: 6, ri: 5, od: 12, wall: 1 });
  assert.equal(routeSection({ kind: 'cable', diameter: 8 }).ri, 0);
  assert.equal(bendRadiusOf({ kind: 'pipe', dn: 'DN50', fittings: 'elbows', bendRadius: 10 }), PIPES.DN50.elbow);
  assert.equal(bendRadiusOf({ kind: 'tube', od: 12, wall: 1, bendRadius: 30 }), 30);
  // The path can be another feature's points (a 3D sketch).
  const feats = [{ id: 's3', type: 'sketch3d', points: [[0, 0, 0], [0, 0, 0], [10, 0, 0]] }];
  assert.deepEqual(routePoints({ path: 's3', points: [] }, feats), [[0, 0, 0], [10, 0, 0]]);
});

test('route BOM: elbows → cut lengths and elbow count; bends → one developed length; flanges', () => {
  const pts = [[0, 0, 0], [0, 0, 300], [400, 0, 300], [400, 300, 300]];
  const E = PIPES.DN25.elbow;
  const elbows = routeBom({ kind: 'pipe', dn: 'DN25', fittings: 'elbows', points: pts, flanges: 'none' });
  const cuts = elbows.rows.filter((r) => r.item === 'pipe').map((r) => r.length);
  assert.deepEqual(cuts, [300 - E, 400 - 2 * E, 300 - E].map((l) => Math.round(l * 10) / 10));
  assert.deepEqual(elbows.rows.filter((r) => r.item === 'elbow').map((r) => [r.qty, r.angle]), [[2, 90]]);
  const bent = routeBom({ kind: 'pipe', dn: 'DN25', fittings: 'bends', bendRadius: 60, points: pts, flanges: 'both' });
  const pipe = bent.rows.find((r) => r.item === 'pipe');
  const hub = PIPES.DN25.flange.H;
  near(pipe.length, Math.round((1000 - 4 * 60 + 2 * 60 * Math.PI / 2 - 2 * hub) * 10) / 10, 1e-6);
  assert.equal(bent.rows.find((r) => r.item === 'bend').qty, 2);
  assert.equal(bent.rows.find((r) => r.item === 'flange').qty, 2);
  near(bent.length, 1000 - 4 * 60 + 60 * Math.PI);
  const cable = routeBom({ kind: 'cable', diameter: 6, points: pts }, [], { measured: 1234.56 });
  assert.equal(cable.rows[0].length, 1234.6);
  assert.equal(routeBom({ kind: 'cable', diameter: 6, points: pts }).length, 1000);
});

test('bent tube solid: one hollow sweep, volume = section area × centre-line length', () => {
  const f = { kind: 'tube', od: 12, wall: 1.5, bendRadius: 25, points: [[0, 0, 0], [0, 0, 100], [100, 0, 100], [100, 80, 160]] };
  const r = routeSolid(f, [], stdShape);
  assert.equal(countSolids(r.shape), 1);
  const path = routePath(f.points, 25);
  near(r.length, path.length);
  near(V(r.shape), sectionVolume(6, 4.5, path.length), 1e-4);
});

test('pipe with elbows: straight lengths and elbows as separate solids; flanges at both ends', () => {
  const f = { kind: 'pipe', dn: 'DN25', fittings: 'elbows', flanges: 'both', points: [[0, 0, 0], [0, 0, 300], [300, 0, 300]] };
  const r = routeSolid(f, [], stdShape);
  // 2 straights + 1 elbow + 2 flanges.
  assert.equal(countSolids(r.shape), 5);
  const p = PIPES.DN25; const ro = p.od / 2; const ri = ro - p.wall;
  const flange = V(stdShape({ kind: 'flange', dn: 'DN25' }));
  const pipeLen = r.pieces.reduce((s, x) => s + x.length, 0);
  near(pipeLen, 600 - 2 * p.elbow + p.elbow * Math.PI / 2 - 2 * p.flange.H, 1e-6);
  near(V(r.shape), sectionVolume(ro, ri, pipeLen) + 2 * flange, 1e-4);
  // The far flange faces out along +X at x = 300.
  const [lo, hi] = r.shape.boundingBox.bounds;
  near(hi[0], 300, 1e-4); near(lo[2], 0, 1e-4);
});

test('cable: a solid round sweep along a spline through the points', () => {
  const pts = [[0, 0, 0], [40, 20, 10], [80, 0, 40], [120, 30, 40]];
  const r = routeSolid({ kind: 'cable', diameter: 4, points: pts }, [], stdShape);
  assert.ok(r.measured >= polylineLength(pts) * 0.999 && r.measured < polylineLength(pts) * 1.2, `${r.measured}`);
  near(V(r.shape), Math.PI * 4 * r.measured, 5e-3);
});

test('the route feature in a part: a body of its own, BOM and length in the result, a 3D sketch as its path', () => {
  const part = { id: 'p', name: 'P', features: [] };
  const s3 = createFeature(part, 'sketch3d', { points: [[0, 0, 0], [0, 0, 80], [80, 0, 80]] });
  part.features.push(s3);
  const f = createFeature(part, 'route', { kind: 'tube', od: 10, wall: 1, bendRadius: 20, path: s3.id });
  part.features.push(f);
  const r = regenerate(part);
  const res = r.results.get(f.id);
  assert.ok(res.ok, res.detail);
  near(res.route.length, 120 + 10 * Math.PI);
  assert.equal(res.route.bom.rows[0].item, 'tube');
  assert.equal(countSolids(r.body), 1);
  // A bend too big for the legs is a rebuild error.
  f.bendRadius = 200;
  assert.equal(regenerate(part).results.get(f.id).error, 'bend-too-large');
});
