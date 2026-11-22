// Branched routes: the network (branches attached on points or inside straights), automatic tees (equal and
// reducing, reducer on a smaller run side), concentric reducers on straight runs, ASME B16.9 elbows (90° / 45°
// long radius, cut elbows), take-out-trimmed cut lengths, tube saddles, the fitting solids' exact volumes,
// cable colours on the part and the face offset of picked points inside sub-assemblies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import {
  routeNetwork, routeJunctions, routeLayout, routeBom, routeSolid, elbowFitting, reducerSolid, reducerVolume, sectionVolume,
  ELBOW45_B, REDUCER_H, REDUCING_TEE_M, routeFaceColours, routeVertexColours, faceOffsetPoint, tubeReducerLength, frustum,
} from '../../src/cad/routing.js';
import { PIPES, stdShape } from '../../src/cad/stdparts.js';
import { countSolids } from '../../src/cad/part-more.js';
import { composePlacement, quatFromAxisAngle, quatIdentity } from '../../src/cad/assembly.js';

await loadKernel();
const R = rep();
const V = (s) => R.measureVolume(s);
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const rows = (bom, item) => bom.rows.filter((r) => r.item === item);
const ring = (dn) => { const p = PIPES[dn]; return { ro: p.od / 2, ri: p.od / 2 - p.wall }; };

test('network: a branch starting inside a straight splits it; coincident points are one node; loops and loose branches throw', () => {
  const f = { kind: 'pipe', dn: 'DN50', points: [[0, 0, 0], [400, 0, 0]], branches: [{ points: [[150, 0, 0], [150, 0, 200]] }] };
  const net = routeNetwork(f);
  assert.equal(net.nodes.length, 4);
  assert.deepEqual(net.edges.map((e) => [e.a, e.b, Math.round(e.length * 1e6) / 1e6]), [[0, 1, 150], [1, 2, 250], [1, 3, 200]]);
  assert.deepEqual(net.nodes[1].p, [150, 0, 0]);
  assert.throws(() => routeNetwork({ ...f, branches: [{ points: [[150, 5, 0], [150, 0, 200]] }] }), (e) => e.code === 'branch-not-attached' && e.params.index === 1);
  assert.throws(() => routeNetwork({ kind: 'pipe', points: [[0, 0, 0], [100, 0, 0], [100, 100, 0]], branches: [{ points: [[100, 100, 0], [0, 100, 0], [0, 0, 0]] }] }), (e) => e.code === 'route-loop');
});

test('equal tee: placed at the junction, run and branch cut back by the take-out C; tee volume exact', () => {
  const f = { kind: 'pipe', dn: 'DN50', fittings: 'bends', points: [[0, 0, 0], [400, 0, 0]], branches: [{ points: [[150, 0, 0], [150, 0, 200]] }] };
  const C = PIPES.DN50.tee;
  const { J } = routeLayout(f);
  assert.equal(J[1].kind, 'tee');
  assert.equal(J[1].fitting.reducing, false);
  near(J[1].fitting.C, 63.5); near(J[1].fitting.M, 63.5);
  const bom = routeBom(f);
  assert.deepEqual(rows(bom, 'pipe').map((r) => r.length), [150 - C, 250 - C, 200 - C].map((l) => Math.round(l * 10) / 10));
  assert.deepEqual(rows(bom, 'tee').map((r) => [r.size, r.qty]), [['DN50', 1]]);
  near(bom.length, 600);
  const r = routeSolid(f, [], stdShape);
  assert.equal(countSolids(r.shape), 4, '3 pipes + 1 tee');
  const { ro, ri } = ring('DN50');
  const tee = Math.PI * (ro * ro - ri * ri) * (2 * C + C) - (8 * (ro ** 3 - ri ** 3)) / 3;
  near(V(r.shape), sectionVolume(ro, ri, 150 + 250 + 200 - 3 * C) + tee, 1e-5);
  // The tee sits on the junction: run ±C along X, outlet up to M.
  const [lo, hi] = r.shape.boundingBox.bounds;
  near(lo[0], 0, 1e-4); near(hi[0], 400, 1e-4); near(hi[2], 200, 1e-4);
});

test('reducing tee and a reducer on the smaller run side: take-outs M and C + H', () => {
  const f = { kind: 'pipe', dn: 'DN50', points: [[0, 0, 0], [150, 0, 0]], branches: [{ dn: 'DN32', points: [[150, 0, 0], [400, 0, 0]] }, { dn: 'DN25', points: [[150, 0, 0], [150, 0, 200]] }] };
  const C = PIPES.DN50.tee; const M = REDUCING_TEE_M.DN50.DN25; const H = REDUCER_H.DN50;
  assert.equal(M, 50.8); assert.equal(H, 76.2);
  const bom = routeBom(f);
  assert.deepEqual(rows(bom, 'pipe').map((r) => [r.size, r.length]), [['DN50', Math.round((150 - C) * 10) / 10], ['DN32', Math.round((250 - C - H) * 10) / 10], ['DN25', Math.round((200 - M) * 10) / 10]]);
  assert.deepEqual(rows(bom, 'reducingTee').map((r) => r.size), ['DN50×DN25']);
  assert.deepEqual(rows(bom, 'reducer').map((r) => r.size), ['DN50×DN32']);
  const r = routeSolid(f, [], stdShape);
  assert.equal(countSolids(r.shape), 5, '3 pipes, tee, reducer');
  // Errors: an outlet bigger than the run, a branch too steep for a tee and too flat for a lateral (80°).
  assert.throws(() => routeBom({ kind: 'pipe', dn: 'DN25', points: [[0, 0, 0], [300, 0, 0]], branches: [{ dn: 'DN50', points: [[150, 0, 0], [150, 0, 200]] }] }), (e) => e.code === 'tee-outlet-larger');
  const d80 = 200 / Math.tan((80 * Math.PI) / 180);
  assert.throws(() => routeBom({ kind: 'pipe', dn: 'DN25', points: [[0, 0, 0], [300, 0, 0]], branches: [{ points: [[150, 0, 0], [150 + d80, 0, 200]] }] }), (e) => e.code === 'tee-angle');
});

test('concentric reducer where the size changes along a straight run: centred, H/2 each side, exact volume', () => {
  const f = { kind: 'pipe', dn: 'DN50', points: [[0, 0, 0], [200, 0, 0]], branches: [{ dn: 'DN25', points: [[200, 0, 0], [500, 0, 0]] }] };
  const H = REDUCER_H.DN50;
  const bom = routeBom(f);
  assert.deepEqual(rows(bom, 'pipe').map((r) => r.length), [Math.round((200 - H / 2) * 10) / 10, Math.round((300 - H / 2) * 10) / 10]);
  assert.deepEqual(rows(bom, 'reducer').map((r) => [r.size, r.qty]), [['DN50×DN25', 1]]);
  const L = ring('DN50'); const S = ring('DN25');
  near(V(reducerSolid(L.ro, S.ro, L.ri, S.ri, H, [0, 0, 0], [1, 0, 0])), reducerVolume(L.ro, S.ro, L.ri, S.ri, H), 1e-5);
  near(V(frustum(10, 5, 20, [1, 2, 3], [0, 0, 1])), (Math.PI * 20 / 3) * (100 + 50 + 25), 1e-6);
  const r = routeSolid(f, [], stdShape);
  near(V(r.shape), sectionVolume(L.ro, L.ri, 200 - H / 2) + sectionVolume(S.ro, S.ri, 300 - H / 2) + reducerVolume(L.ro, S.ro, L.ri, S.ri, H), 1e-5);
  // A size change at a corner: a bend of the large size, then the reducer (routing-fittings.test.js has more).
  const bent = routeBom({ kind: 'pipe', dn: 'DN50', bendRadius: 100, points: [[0, 0, 0], [300, 0, 0]], branches: [{ dn: 'DN25', points: [[300, 0, 0], [300, 300, 0]] }] });
  assert.deepEqual(rows(bent, 'reducer').map((r) => r.size), ['DN50×DN25']);
  assert.equal(rows(bent, 'bend')[0].qty, 1);
});

test('B16.9 elbows: 90° and 45° long radius (45° tangents), cut elbows for other angles', () => {
  const e90 = elbowFitting('DN25', 90);
  assert.equal(e90.fitting, 'lr90'); near(e90.T, PIPES.DN25.elbow); near(e90.R, PIPES.DN25.elbow); near(e90.stub, 0);
  const e45 = elbowFitting('DN25', 45);
  const t = Math.tan(Math.PI / 8);
  assert.equal(e45.fitting, 'lr45'); near(e45.T, ELBOW45_B.DN25); near(e45.R, 38.1); near(e45.stub, 22.2 - 38.1 * t);
  // DN20's B (11.1) is shorter than R·tan 22.5°: the radius matches B, no tangent.
  const e20 = elbowFitting('DN20', 45);
  near(e20.R, 11.1 / t); near(e20.stub, 0, 1e-9);
  assert.equal(elbowFitting('DN25', 60).fitting, 'cut90'); near(elbowFitting('DN25', 60).T, 38.1 * Math.tan(Math.PI / 6));
  assert.equal(elbowFitting('DN25', 120).fitting, 'cut180');
  const s = 200 / Math.SQRT2;
  const f = { kind: 'pipe', dn: 'DN25', fittings: 'elbows', points: [[0, 0, 0], [0, 0, 200], [s, 0, 200 + s]] };
  const bom = routeBom(f);
  assert.deepEqual(rows(bom, 'pipe').map((r) => r.length), [177.8, 177.8]);
  assert.deepEqual(rows(bom, 'elbow').map((r) => [r.angle, r.qty]), [[45, 1]]);
  near(bom.length, 400 - 2 * 38.1 * t + 38.1 * Math.PI / 4);
  const r = routeSolid(f, [], stdShape);
  const { ro, ri } = ring('DN25');
  near(V(r.shape), sectionVolume(ro, ri, 2 * 177.8 + 2 * e45.stub + 38.1 * Math.PI / 4), 1e-4);
  // A 60° corner: a cut elbow with a note.
  const c = 200 * Math.cos(Math.PI / 3); const d = 200 * Math.sin(Math.PI / 3);
  const cut = routeBom({ kind: 'pipe', dn: 'DN25', fittings: 'elbows', points: [[0, 0, 0], [0, 0, 200], [d, 0, 200 + c]] });
  assert.deepEqual(rows(cut, 'elbowCut').map((x) => [x.angle, x.from]), [[60, 90]]);
  assert.deepEqual(cut.notes, ['cut-elbow']);
});

test('elbows with a branch: the take-outs of an elbow and a tee on the same straight', () => {
  const f = { kind: 'pipe', dn: 'DN25', fittings: 'elbows', points: [[0, 0, 0], [0, 0, 300], [400, 0, 300]], branches: [{ points: [[200, 0, 300], [200, 0, 500]] }] };
  const A = PIPES.DN25.elbow; const C = PIPES.DN25.tee;
  const bom = routeBom(f);
  assert.deepEqual(rows(bom, 'pipe').map((r) => r.length), [300 - A, 200 - A - C, 200 - C, 200 - C].map((l) => Math.round(l * 10) / 10));
  assert.equal(rows(bom, 'tee')[0].qty, 1);
  assert.equal(rows(bom, 'elbow')[0].qty, 1);
  assert.deepEqual(bom.fittings, { elbows: 1, tees: 1, crosses: 0, laterals: 0, wyes: 0, reducers: 0, saddles: 0 });
});

test('tube branch saddle-welded into the run: cut length to the run outside, exact solid volume', () => {
  const f = { kind: 'tube', od: 20, wall: 2, bendRadius: 40, points: [[0, 0, 0], [300, 0, 0]], branches: [{ od: 12, points: [[100, 0, 0], [100, 0, 150]] }] };
  const bom = routeBom(f);
  assert.deepEqual(rows(bom, 'tube').map((r) => [r.size, r.length]), [['Ø20×2', 300], ['Ø12×2', 150 - 8]]);
  assert.equal(rows(bom, 'saddle')[0].qty, 1);
  const r = routeSolid(f, [], stdShape);
  assert.equal(countSolids(r.shape), 1);
  // ∫∫ over the branch disc of the run's height above its axis (Simpson).
  const overlap = (Rr, rb) => { const n = 4000; const h = (2 * rb) / n; let s = 0; for (let i = 0; i <= n; i++) { const y = -rb + i * h; const v = 2 * Math.sqrt(Math.max(0, rb * rb - y * y)) * Math.sqrt(Rr * Rr - y * y); s += v * (i === 0 || i === n ? 1 : i % 2 ? 4 : 2); } return (s * h) / 3; };
  const out = Math.PI * 100 * 300 + Math.PI * 36 * 150 - overlap(10, 6);
  const inn = Math.PI * 64 * 300 + Math.PI * 16 * 150 - overlap(8, 4);
  near(V(r.shape), out - inn, 1e-4);
  near(tubeReducerLength(20, 12), 4 / Math.tan(Math.PI / 12));
});

test('pipe branches with flanges at every free end ("end" = all ends but the start)', () => {
  const f = { kind: 'pipe', dn: 'DN25', flanges: 'end', points: [[0, 0, 0], [300, 0, 0]], branches: [{ points: [[150, 0, 0], [150, 0, 200]] }] };
  const net = routeNetwork(f);
  const J = routeJunctions(net, f);
  assert.equal(J.filter((j) => j.flange).length, 2);
  const bom = routeBom(f);
  const Hf = PIPES.DN25.flange.H; const C = PIPES.DN25.tee;
  assert.deepEqual(rows(bom, 'pipe').map((r) => r.length), [150 - C, 150 - C - Hf, 200 - C - Hf].map((l) => Math.round(l * 10) / 10));
  assert.equal(rows(bom, 'flange')[0].qty, 2);
});

test('branched cable: spliced chains, a BOM row and a colour per branch; colours reach the part faces', () => {
  const part = { id: 'p', name: 'P', features: [] };
  const f = createFeature(part, 'route', { kind: 'cable', diameter: 4, color: '#2f6fd6', points: [[0, 0, 0], [60, 0, 20], [120, 30, 20]], branches: [{ color: '#2e9e4f', diameter: 3, points: [[60, 0, 20], [60, 80, 40]] }] });
  part.features.push(f);
  const r = regenerate(part);
  const res = r.results.get(f.id);
  assert.ok(res.ok, res.detail);
  assert.deepEqual(res.route.bom.rows.map((x) => [x.size, x.color]), [['Ø4', '#2f6fd6'], ['Ø3', '#2e9e4f']]);
  near(res.route.bom.rows[1].length, Math.round(Math.hypot(0, 80, 20) * 10) / 10, 1e-9);
  const map = routeFaceColours(r);
  assert.ok(map && map.size > 0);
  const bodyFaces = new Set(r.body.faces.map((x) => x.hashCode));
  for (const h of map.keys()) assert.ok(bodyFaces.has(h), 'every coloured face is a face of the part body');
  const blue = [...map.values()].filter((c) => Math.abs(c[2] - 0xd6 / 255) < 1e-9).length;
  assert.ok(blue > 0);
  // Vertex colours: the coloured faces' vertices carry their colour, the rest the part's.
  const mesh = r.body.mesh({ tolerance: 0.5, angularTolerance: 0.5 });
  const vc = routeVertexColours(mesh, map, [1, 1, 1]);
  assert.equal(vc.length, mesh.vertices.length);
  assert.ok([...vc].some((v) => v !== 1));
});

test('face offset of a picked point: the placement of a part inside a sub-assembly is composed', () => {
  const top = { position: [100, 0, 0], rotation: quatFromAxisAngle([0, 0, 1], 90) };
  const inner = { position: [0, 50, 0], rotation: quatIdentity() };
  const pl = composePlacement(top, inner);
  // The part's face normal is +X locally; in the world the sub-assembly turns it to +Y.
  const p = faceOffsetPoint([60, 10, 5], pl, () => [1, 0, 0], 7);
  near(p[0], 60, 1e-9); near(p[1], 17, 1e-9); near(p[2], 5, 1e-9);
  // The local point handed to the normal is the world point taken back through the composed placement.
  let local = null;
  faceOffsetPoint([60, 10, 5], pl, (q) => { local = q; return { x: 0, y: 0, z: 1 }; }, 1);
  near(local[0], 10, 1e-9); near(local[1], -10, 1e-9); near(local[2], 5, 1e-9);
});
