// Pipe fittings beyond the plain tee: B16.9 reducer chains and reducing tees for any branch size, equal and
// reducing crosses, angled laterals (wyes) with their geometric take-outs, size changes at a corner (B16.9
// reducing elbows, or an elbow / bend and reducers) and tube saddles at an angle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import {
  routeBom, routeSolid, routeLayout, reducerChain, teeOutlet, lateralTakeouts, saddleCutBack, reducingElbowSolid, sectionVolume,
  REDUCER_H, REDUCING_TEE_M, REDUCING_ELBOWS,
} from '../../src/cad/routing.js';
import { PIPES, stdShape } from '../../src/cad/stdparts.js';
import { countSolids } from '../../src/cad/part-more.js';

await loadKernel();
const R = rep();
const V = (s) => R.measureVolume(s);
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const rows = (bom, item) => bom.rows.filter((r) => r.item === item);
const r1 = (v) => Math.round(v * 10) / 10;
const ring = (dn) => { const p = PIPES[dn]; return { ro: p.od / 2, ri: p.od / 2 - p.wall }; };

test('reducer chains: listed pairs in one step, the rest through the smallest listed small end', () => {
  assert.deepEqual(reducerChain('DN50', 'DN25'), [{ largeSize: 'DN50', smallSize: 'DN25', H: 76.2 }]);
  assert.deepEqual(reducerChain('DN100', 'DN15'), [{ largeSize: 'DN100', smallSize: 'DN40', H: REDUCER_H.DN100 }, { largeSize: 'DN40', smallSize: 'DN15', H: REDUCER_H.DN40 }]);
  assert.deepEqual(reducerChain('DN50', 'DN15').map((r) => `${r.largeSize}×${r.smallSize}`), ['DN50×DN20', 'DN20×DN15']);
  assert.deepEqual(reducerChain('DN32', 'DN32'), []);
  // A reducing tee too small for the table: the smallest listed outlet, then reducers.
  assert.deepEqual(teeOutlet('DN100', 'DN15'), { size: 'DN40', M: REDUCING_TEE_M.DN100.DN40, reducers: [{ largeSize: 'DN40', smallSize: 'DN15', H: 63.5 }] });
  assert.deepEqual(teeOutlet('DN50', 'DN25'), { size: 'DN25', M: 50.8, reducers: [] });
  const bom = routeBom({ kind: 'pipe', dn: 'DN100', points: [[0, 0, 0], [600, 0, 0]], branches: [{ dn: 'DN15', points: [[300, 0, 0], [300, 0, 400]] }] });
  assert.deepEqual(rows(bom, 'reducingTee').map((r) => r.size), ['DN100×DN40']);
  assert.deepEqual(rows(bom, 'reducer').map((r) => r.size), ['DN40×DN15']);
  assert.equal(rows(bom, 'pipe').at(-1).length, r1(400 - 85.7 - 63.5));
  // Inline DN100 → DN25: two reducers centred on the node.
  const inline = routeBom({ kind: 'pipe', dn: 'DN100', points: [[0, 0, 0], [500, 0, 0]], branches: [{ dn: 'DN25', points: [[500, 0, 0], [1000, 0, 0]] }] });
  assert.deepEqual(rows(inline, 'reducer').map((r) => r.size), ['DN100×DN40', 'DN40×DN25']);
  assert.deepEqual(rows(inline, 'pipe').map((r) => r.length), [r1(500 - (101.6 + 63.5) / 2), r1(500 - (101.6 + 63.5) / 2)]);
  const s = routeSolid({ kind: 'pipe', dn: 'DN100', points: [[0, 0, 0], [500, 0, 0]], branches: [{ dn: 'DN25', points: [[500, 0, 0], [1000, 0, 0]] }] }, [], stdShape);
  assert.equal(countSolids(s.shape), 4);
});

test('equal cross: four legs cut back by C, volume = run and outlet minus the Steinmetz overlap', () => {
  const f = { kind: 'pipe', dn: 'DN50', points: [[0, 0, 0], [400, 0, 0]], branches: [{ points: [[200, 0, 0], [200, 0, 150]] }, { points: [[200, 0, 0], [200, 0, -150]] }] };
  const { J } = routeLayout(f);
  const x = J.find((j) => j.kind === 'cross');
  assert.ok(x);
  const C = PIPES.DN50.tee;
  near(x.fitting.C, C); near(x.fitting.M, C);
  const bom = routeBom(f);
  assert.deepEqual(rows(bom, 'pipe').map((r) => r.length), [200 - C, 200 - C, 150 - C, 150 - C].map(r1));
  assert.deepEqual(rows(bom, 'cross').map((r) => [r.size, r.qty]), [['DN50', 1]]);
  const r = routeSolid(f, [], stdShape);
  assert.equal(countSolids(r.shape), 5);
  const { ro, ri } = ring('DN50');
  const cross = Math.PI * (ro * ro - ri * ri) * 4 * C - (16 * (ro ** 3 - ri ** 3)) / 3;
  near(V(r.shape), sectionVolume(ro, ri, 400 + 300 - 4 * C) + cross, 1e-5);
});

test('reducing cross: the larger outlet sets the cross, the smaller one gets a reducer', () => {
  const f = { kind: 'pipe', dn: 'DN50', points: [[0, 0, 0], [400, 0, 0]], branches: [{ dn: 'DN25', points: [[200, 0, 0], [200, 0, 300]] }, { dn: 'DN20', points: [[200, 0, 0], [200, 0, -300]] }] };
  const bom = routeBom(f);
  assert.deepEqual(rows(bom, 'reducingCross').map((r) => r.size), ['DN50×DN25']);
  assert.deepEqual(rows(bom, 'reducer').map((r) => r.size), ['DN25×DN20']);
  assert.deepEqual(rows(bom, 'pipe').map((r) => r.length), [200 - 63.5, 200 - 63.5, 300 - 50.8, 300 - 50.8 - 50.8].map(r1));
  assert.throws(() => routeBom({ ...f, branches: [f.branches[0], { points: [[200, 0, 0], [200, 300, 300]] }] }), (e) => e.code === 'cross-angle');
});

test('45° lateral: take-outs from the geometry, the branch clears the run exactly at its take-out', () => {
  const f = { kind: 'pipe', dn: 'DN50', points: [[0, 0, 0], [400, 0, 0]], branches: [{ points: [[150, 0, 0], [350, 0, 200]] }] };
  const { ro } = ring('DN50');
  const a = Math.PI / 4;
  const t = lateralTakeouts(ro, ro, a);
  near(t.long, ro * (1 + Math.SQRT1_2) + ro * Math.SQRT1_2 + ro);
  near(t.short, ro * Math.SQRT1_2 + ro);
  near(t.branch, ro * (1 + Math.SQRT1_2) / Math.SQRT1_2 + ro);
  // The branch's outside, at s = clear, touches the run's outside at one point and is outside it elsewhere.
  const s = t.clear; let min = Infinity;
  for (let k = 0; k <= 720; k++) {
    const phi = (k / 720) * 2 * Math.PI;
    const n = s * Math.sin(a) + ro * Math.cos(phi) * Math.cos(a); const e = ro * Math.sin(phi);
    min = Math.min(min, Math.hypot(n, e));
  }
  near(min, ro, 1e-9);
  const bom = routeBom(f);
  assert.deepEqual(rows(bom, 'lateral').map((r) => [r.size, r.angle]), [['DN50', 45]]);
  assert.deepEqual(rows(bom, 'pipe').map((r) => r.length), [r1(150 - t.short), r1(250 - t.long), r1(200 * Math.SQRT2 - t.branch)]);
  assert.ok(bom.notes.includes('lateral'));
  const r = routeSolid(f, [], stdShape);
  assert.equal(countSolids(r.shape), 4);
  const [lo, hi] = r.shape.boundingBox.bounds;
  near(lo[0], 0, 1e-6); near(hi[2], 200 + ro * Math.SQRT1_2, 1e-4);
});

test('size change at a 90° elbow corner: a B16.9 reducing elbow (centre to end = the large A), exact geometry', () => {
  assert.deepEqual(REDUCING_ELBOWS.DN50, ['DN40', 'DN32', 'DN25']);
  const f = { kind: 'pipe', dn: 'DN50', fittings: 'elbows', points: [[0, 0, 0], [0, 0, 300]], branches: [{ dn: 'DN25', points: [[0, 0, 300], [300, 0, 300]] }] };
  const A = PIPES.DN50.elbow;
  const bom = routeBom(f);
  assert.deepEqual(rows(bom, 'reducingElbow').map((r) => r.size), ['DN50×DN25']);
  assert.deepEqual(rows(bom, 'pipe').map((r) => r.length), [r1(300 - A), r1(300 - A)]);
  const L = ring('DN50'); const S = ring('DN25');
  const el = reducingElbowSolid([0, 0, 300], { d1: [0, 0, 1], d2: [1, 0, 0], R: A, secA: L, secB: S, n: 12 });
  const q = (a, b) => (a * a + a * b + b * b) / 3;
  near(V(el), A * (Math.PI / 2) * Math.PI * (q(L.ro, S.ro) - q(L.ri, S.ri)), 2e-3);
  // The end faces: square to the legs, A from the corner, the large and small sections.
  const ends = el.faces.filter((x) => x.geomType === 'PLANE').map((x) => { const c = x.center; return { c: [c.x, c.y, c.z], area: R.measureArea(x) }; });
  const at = (p) => ends.find((e) => Math.hypot(e.c[0] - p[0], e.c[1] - p[1], e.c[2] - p[2]) < 1e-6);
  assert.ok(at([0, 0, 300 - A]), JSON.stringify(ends.map((e) => e.c)));
  assert.ok(at([A, 0, 300]));
  near(at([0, 0, 300 - A]).area, Math.PI * (L.ro ** 2 - L.ri ** 2), 1e-6);
  near(at([A, 0, 300]).area, Math.PI * (S.ro ** 2 - S.ri ** 2), 1e-6);
  // Not listed (DN50 → DN15) or not 90°: an elbow of the large size and the reducer chain on the small leg.
  const g = routeBom({ ...f, branches: [{ dn: 'DN15', points: [[0, 0, 300], [300, 0, 300]] }] });
  assert.deepEqual(rows(g, 'elbow').map((r) => [r.size, r.angle]), [['DN50', 90]]);
  assert.deepEqual(rows(g, 'reducer').map((r) => r.size), ['DN50×DN20', 'DN20×DN15']);
  assert.equal(rows(g, 'pipe')[1].length, r1(300 - A - 76.2 - 38.1));
  // Bent pipe: a bend of the large size, then the reducer.
  const b = routeBom({ ...f, fittings: 'bends', bendRadius: 80 });
  assert.deepEqual(rows(b, 'pipe').map((r) => r.length), [r1(300 - 80), r1(300 - 80 - 76.2)]);
  assert.equal(rows(b, 'bend')[0].qty, 1);
  const s = routeSolid({ ...f, fittings: 'bends', bendRadius: 80 }, [], stdShape);
  assert.equal(countSolids(s.shape), 4, 'two pipes, the bend, the reducer');
});

test('tube saddles at an angle: the long-point cut-back, 90° = √(R² − r²)', () => {
  near(saddleCutBack(10, 6, Math.PI / 2), 8);
  // Brute force over the branch generators: the nearest meeting point with the run's outside.
  const brute = (Rr, r, a) => { let m = Infinity; for (let k = 0; k <= 20000; k++) { const c = -1 + (2 * k) / 20000; m = Math.min(m, (Math.sqrt(Rr * Rr - r * r + r * r * c * c) - r * c * Math.cos(a)) / Math.sin(a)); } return m; };
  for (const [Rr, r, d] of [[10, 6, 45], [10, 9.5, 60], [10, 3, 30], [8, 8, 45]]) near(saddleCutBack(Rr, r, (d * Math.PI) / 180), brute(Rr, r, (d * Math.PI) / 180), 1e-6);
  const f = { kind: 'tube', od: 20, wall: 2, points: [[0, 0, 0], [300, 0, 0]], branches: [{ od: 12, points: [[100, 0, 0], [200, 0, 100]] }] };
  const bom = routeBom(f);
  assert.equal(rows(bom, 'tube')[1].length, r1(100 * Math.SQRT2 - saddleCutBack(10, 6, Math.PI / 4)));
  assert.equal(rows(bom, 'saddle')[0].angle, 45);
  assert.equal(countSolids(routeSolid(f, [], stdShape).shape), 1);
});
