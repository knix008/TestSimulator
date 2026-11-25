// Shell elements (fem/shell.js): DKT bending + CST membrane facets against closed-form results — a cantilever strip,
// simply supported and clamped square plates under pressure (Timoshenko), a strip in tension, the same cantilever
// turned in space, the hoop stress of a pressurised cylinder — and the mid-surface of a thin box from its top face.
import test from 'node:test';
import assert from 'node:assert/strict';
import { shellStatic, midSurface, wallThickness, nodesNearFaces } from '../../src/cad/fem/shell.js';
import { boxMesh } from './fem-shapes.js';

const STEEL = { E: 210000, nu: 0.3, yield: 250, density: 7850 };
const near = (a, b, rel, what) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${what}: ${a} vs ${b}`);

/** A structured nx × ny rectangle [0,a]×[0,b] in z = 0 (alternating diagonals), mapped by `place`. */
function grid(a, b, nx, ny, place = (p) => p) {
  const nodes = [], tri = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) nodes.push(...place([(a * i) / nx, (b * j) / ny, 0]));
  const id = (i, j) => j * (nx + 1) + i;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const [p, q, r, s] = [id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)];
    if ((i + j) % 2) tri.push(p, q, r, p, r, s); else tri.push(p, q, s, q, r, s);
  }
  const at = (fn) => { const out = []; for (let n = 0; n < nodes.length / 3; n++) if (fn(nodes[3 * n], nodes[3 * n + 1], nodes[3 * n + 2], n)) out.push(n); return out; };
  return { nodes: Float64Array.from(nodes), triangles: Uint32Array.from(tri), at, id };
}

test('cantilever strip: tip deflection P·L³ / 3EI, stress 6P(L − x) / b t²', () => {
  const L = 100, bw = 10, t = 2, P = 10, m = grid(L, bw, 40, 4);
  const r = shellStatic({ ...m, thickness: t, material: STEEL, fixtures: [{ nodes: m.at((x) => x < 1e-9), type: 'fixed' }], loads: [{ nodes: m.at((x) => x > L - 1e-9), force: [0, 0, -P] }] });
  assert.ok(r.ok, r.error);
  const I = (bw * t ** 3) / 12, want = (P * L ** 3) / (3 * STEEL.E * I);
  const tip = m.at((x) => x > L - 1e-9).map((n) => -r.displacement[6 * n + 2]);
  near(tip.reduce((s, v) => s + v, 0) / tip.length, want, 0.02, 'tip');
  // Half way out (away from the clamped corners' singular spots): σ = 6 P (L − x) / b t².
  const half = m.at((x, y) => Math.abs(x - 50) < 1e-9 && Math.abs(y - 5) < 1e-9)[0];
  near(r.nodeStress[half], (6 * P * (L - 50)) / (bw * t * t), 0.03, 'stress half way');
  // Equilibrium: the support holds the load.
  near(r.reactions[0].force[2], P, 1e-6, 'reaction');
});

test('square plates under pressure: simply supported 0.00406 q a⁴/D, clamped 0.00126 q a⁴/D', () => {
  const a = 100, t = 1, q = 0.01, D = (STEEL.E * t ** 3) / (12 * (1 - 0.09)), m = grid(a, a, 32, 32);
  const edge = m.at((x, y) => x < 1e-9 || y < 1e-9 || x > a - 1e-9 || y > a - 1e-9);
  const centre = m.id(16, 16);
  const ss = shellStatic({ ...m, thickness: t, material: STEEL, fixtures: [{ nodes: edge, type: 'pinned' }], loads: [{ pressure: q }] });
  assert.ok(ss.ok, ss.error);
  near(-ss.displacement[6 * centre + 2], (0.00406 * q * a ** 4) / D, 0.03, 'simply supported');
  const cl = shellStatic({ ...m, thickness: t, material: STEEL, fixtures: [{ nodes: edge, type: 'fixed' }], loads: [{ pressure: q }] });
  near(-cl.displacement[6 * centre + 2], (0.00126 * q * a ** 4) / D, 0.03, 'clamped');
  // Clamped: the edge moment at mid-side 0.0513 q a² → σx = 6M/t², and σy = ν σx along the held edge (no curvature
  // along it): von Mises σx √(1 − ν + ν²).
  near(cl.maxStress, ((6 * 0.0513 * q * a * a) / (t * t)) * Math.sqrt(1 - 0.3 + 0.09), 0.02, 'clamped edge stress');
});

test('membrane: a strip in tension stretches P·L / EA with σ = P / A', () => {
  const L = 100, bw = 10, t = 2, P = 1000, m = grid(L, bw, 20, 4);
  const r = shellStatic({ ...m, thickness: t, material: STEEL, fixtures: [{ nodes: m.at((x) => x < 1e-9), type: 'fixed' }], loads: [{ nodes: m.at((x) => x > L - 1e-9), force: [P, 0, 0] }] });
  const tip = m.at((x) => x > L - 1e-9).map((n) => r.displacement[6 * n]);
  near(tip.reduce((s, v) => s + v, 0) / tip.length, (P * L) / (STEEL.E * bw * t), 0.03, 'stretch');
  // Away from the clamped end (where Poisson's contraction is held) the stress is P / A.
  const mid = [];
  for (let e = 0; e < r.elements; e++) { const xs = [0, 1, 2].map((k) => m.nodes[3 * m.triangles[3 * e + k]]); if (Math.min(...xs) > 40 && Math.max(...xs) < 60) mid.push(r.elementStress.vm[e]); }
  near(mid.reduce((s, v) => s + v, 0) / mid.length, P / (bw * t), 0.02, 'stress');
});

test('the cantilever turned in space (rotated about an oblique axis) bends the same', () => {
  const L = 100, bw = 10, t = 2, P = 10;
  // Rotation by 40° about (1, 2, 3)/|…| (Rodrigues).
  const k = [1, 2, 3].map((v) => v / Math.hypot(1, 2, 3)), th = (40 * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
  const rot = (p) => { const kxp = [k[1] * p[2] - k[2] * p[1], k[2] * p[0] - k[0] * p[2], k[0] * p[1] - k[1] * p[0]], kp = k[0] * p[0] + k[1] * p[1] + k[2] * p[2]; return [0, 1, 2].map((i) => p[i] * c + kxp[i] * s + k[i] * kp * (1 - c)); };
  const flat = grid(L, bw, 40, 4), m = grid(L, bw, 40, 4, rot);
  const normal = rot([0, 0, -P]);
  const r = shellStatic({ ...m, thickness: t, material: STEEL, fixtures: [{ nodes: flat.at((x) => x < 1e-9), type: 'fixed' }], loads: [{ nodes: flat.at((x) => x > L - 1e-9), force: normal }] });
  const I = (bw * t ** 3) / 12, want = (P * L ** 3) / (3 * STEEL.E * I);
  const tip = flat.at((x) => x > L - 1e-9).map((n) => Math.hypot(r.displacement[6 * n], r.displacement[6 * n + 1], r.displacement[6 * n + 2]));
  near(tip.reduce((a, v) => a + v, 0) / tip.length, want, 0.02, 'tip');
});

test('a quarter of a pressurised cylinder (symmetry planes): hoop stress p·R / t', () => {
  const R = 50, H = 60, t = 1, p = 1, m = grid(Math.PI / 2, H, 48, 12, ([u, z]) => [R * Math.cos(u), R * Math.sin(u), z]);
  // The facets' normals point outwards (u then z): pressure from inside pushes along them, i.e. p < 0 here.
  const fixtures = [
    { nodes: m.at((x, y) => Math.abs(y) < 1e-6), type: 'roller', normal: [0, 1, 0] },
    { nodes: m.at((x) => Math.abs(x) < 1e-6), type: 'roller', normal: [1, 0, 0] },
    { nodes: m.at((x, y, z) => z < 1e-9), type: 'roller', normal: [0, 0, 1] },
  ];
  const r = shellStatic({ ...m, thickness: t, material: STEEL, fixtures, loads: [{ pressure: -p }] });
  assert.ok(r.ok, r.error);
  // Mid-height, away from the ends: the hoop stress (von Mises of a pure hoop stress) and the radial growth p R² / E t.
  const mid = m.at((x, y, z) => Math.abs(z - 30) < 1e-6);
  const grow = mid.map((n) => (r.displacement[6 * n] * m.nodes[3 * n] + r.displacement[6 * n + 1] * m.nodes[3 * n + 1]) / R);
  near(grow.reduce((a, v) => a + v, 0) / grow.length, (p * R * R) / (STEEL.E * t), 0.03, 'radial growth');
  // (Flat facets bend a little between the nodes under the pressure: about (h / R)² — 1 % here.)
  near(r.nodeStress[mid[12]], (p * R) / t, 0.04, 'hoop stress');
});

test('mid-surface of a thin box from its top face: half the thickness down, edge nodes found by the side faces', () => {
  const box = boxMesh(80, 40, 3, 6);      // faces 0 x=0 … 5 z=3 (top)
  const t = wallThickness(box, [5]);
  near(t, 3, 1e-6, 'thickness');
  const mid = midSurface(box, [5], t);
  for (let n = 0; n < mid.nodes.length / 3; n++) assert.ok(Math.abs(mid.nodes[3 * n + 2] - 1.5) < 1e-9);
  const root = nodesNearFaces(box, [0], mid, 0.51 * t + 1e-6);
  assert.ok(root.length >= 2 && root.every((n) => mid.nodes[3 * n] < 1e-9));
  // As a cantilever from x = 0 under its weight: the tip sags q L⁴ / 8EI.
  const r = shellStatic({ nodes: mid.nodes, triangles: mid.triangles, thickness: t, material: STEEL, fixtures: [{ nodes: root, type: 'fixed' }], loads: [{ gravity: [0, 0, -9.81] }] });
  const qL = STEEL.density * 1e-9 * 40 * t * 9.81 * 1000, I = (40 * t ** 3) / 12, want = (qL * 80 ** 4) / (8 * STEEL.E * I);
  const tip = nodesNearFaces(box, [1], mid, 0.51 * t + 1e-6).map((n) => -r.displacement[6 * n + 2]);
  near(tip.reduce((a, v) => a + v, 0) / tip.length, want, 0.05, 'self-weight sag');
});

test('a part as a shell: a thin plate fixed by its end face, pulled down by a force on the other end face', async () => {
  const { partShellStudy } = await import('../../src/cad/fem/shell.js');
  const box = boxMesh(100, 10, 2, 8);     // faces 0 x=0, 1 x=100, 4 bottom, 5 top
  const r = partShellStudy({ mesh: box, shellFaces: [5], fixtures: [{ faceId: 0, type: 'fixed' }], loads: [{ faceId: 1, force: [0, 0, -10] }, { faceId: 2, thermal: { deltaT: 1 } }], material: STEEL });
  assert.ok(r.ok, r.error);
  near(r.thickness, 2, 1e-6, 'measured thickness');
  const want = (10 * 100 ** 3) / (3 * STEEL.E * ((10 * 2 ** 3) / 12));
  near(r.maxDisplacement, want, 0.03, 'tip');
  assert.deepEqual(r.unsupported, ['thermal']);
  // The part's vertices carry the fields: those at x = 100 moved down by about the tip deflection.
  let n = 0;
  for (let v = 0; v < box.vertices.length / 3; v++) if (box.vertices[3 * v] > 100 - 1e-6) { near(-r.vertexDisplacement[3 * v + 2], want, 0.05, 'vertex'); n++; }
  assert.ok(n > 0 && r.vertexStress.length === box.vertices.length / 3);
  assert.equal(partShellStudy({ mesh: box, shellFaces: [], material: STEEL }).error, 'no-shell-faces');
});

test('refining a mid-surface: edges under the size, conforming (each inner edge in two triangles), area kept', async () => {
  const { refineSurface } = await import('../../src/cad/fem/shell.js');
  // A long sliver and a fat triangle sharing an edge (as a CAD tessellation gives).
  const nodes = Float64Array.from([0, 0, 0, 100, 0, 0, 100, 20, 0, 0, 20, 0]), triangles = Uint32Array.from([0, 1, 2, 0, 2, 3]);
  const r = refineSurface({ nodes, triangles, faceOf: [7, 7] }, 4);
  const P = r.nodes, T = r.triangles, L = (a, b) => Math.hypot(P[3 * a] - P[3 * b], P[3 * a + 1] - P[3 * b + 1]);
  let area = 0, maxE = 0; const edges = new Map();
  for (let e = 0; e < T.length / 3; e++) {
    const [a, b, c] = [T[3 * e], T[3 * e + 1], T[3 * e + 2]];
    const cr = (P[3 * b] - P[3 * a]) * (P[3 * c + 1] - P[3 * a + 1]) - (P[3 * c] - P[3 * a]) * (P[3 * b + 1] - P[3 * a + 1]);
    assert.ok(cr > 0, 'orientation kept');
    area += cr / 2;
    for (const [p, q] of [[a, b], [b, c], [c, a]]) { maxE = Math.max(maxE, L(p, q)); const k = Math.min(p, q) + ':' + Math.max(p, q); edges.set(k, (edges.get(k) ?? 0) + 1); }
  }
  near(area, 2000, 1e-9, 'area');
  assert.ok(maxE <= 4 + 1e-9, String(maxE));
  // Boundary edges (once) lie on the rectangle's sides; all others are shared by two triangles.
  for (const [k, n] of edges) {
    if (n === 2) continue;
    const [p, q] = k.split(':').map(Number), onSide = (i) => [P[3 * i] < 1e-9, P[3 * i] > 100 - 1e-9, P[3 * i + 1] < 1e-9, P[3 * i + 1] > 20 - 1e-9];
    assert.ok(n === 1 && onSide(p).some((v, s) => v && onSide(q)[s]), 'hanging edge ' + k);
  }
  assert.ok(r.faceOf.every((f) => f === 7) && r.faceOf.length === T.length / 3);
});
