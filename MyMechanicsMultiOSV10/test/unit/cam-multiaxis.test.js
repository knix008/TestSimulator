// Multi-axis machining (cad/cam-multiaxis.js): 4-axis rotary finishing of a shaft lying along X (the tool tip on
// the part's radius at every A angle, a flat milled on it found), 5-axis finishing of a dome (the ball centre a
// ball radius off the sphere, the tool axis along the normal leaned and within the tilt limit, the stock model
// without gouges), mill-turn live drilling (axial holes by C angle and radius, a radial pattern) and the posts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { machiningModel, recognizeFeatures, turningProfile } from '../../src/cad/cam-features.js';
import { camContext, defaultStock, generateToolpath, createOp, planOperations, profileAt } from '../../src/cad/cam-ops.js';
import { simulateMilling, gougeCheck, simulateTurning, turnGougeCheck, withLiveGouges, dexelMesh } from '../../src/cad/cam-sim.js';
import { postProcess } from '../../src/cad/cam-post.js';
import { cloneTools } from '../../src/cad/cam-tools.js';
import { toolAxis, axisToAC } from '../../src/cad/cam-multiaxis.js';

await loadKernel();
const R = rep();
const tools = cloneTools();

test('4-axis rotary: a Ø40 shaft along X — the ball tip runs on radius 20 at every A; a flat at r = 15 is followed', () => {
  // Shaft x 0…60, radius 20, its axis through y = z = 0; a flat milled at z = 15 between x 20 and 40.
  const shaft = R.makeCylinder(20, 60, [0, 0, 0], [1, 0, 0]).cut(R.makeBox([20, -30, 15], [40, 30, 30]));
  const m = machiningModel(shaft.mesh({ tolerance: 0.01, angularTolerance: 0.05 }));
  const st = defaultStock(m.bounds, { margin: 0, top: 0 });
  const c = camContext({ model: m, stock: st, tools, material: 'al-6061' });
  const tp = generateToolpath(c, createOp('rotary4', { id: 'r4', tool: 't7', scallop: 0.05, sample: 1 }));
  assert.equal(tp.multi, 'rotary4');
  const feeds = tp.moves.filter((mv) => mv.k === 'f');
  assert.ok(feeds.length > 200 && tp.angles >= 36, `${feeds.length} moves, ${tp.angles} angles`);
  const angles = new Set(feeds.map((mv) => Math.round(mv.a)));
  assert.ok(Math.min(...angles) === 0 && Math.max(...angles) > 340);
  for (const mv of feeds) {
    // The machine position: Z is the tip's radius (y 0); the part point at the same radius.
    assert.equal(mv.mp[1], 0);
    assert.ok(Math.abs(Math.hypot(mv.p[1], mv.p[2]) - mv.mp[2]) < 1e-6);
    const onFlat = mv.mp[0] > 17.99 && mv.mp[0] < 42.01;   // within a ball radius of the flat
    assert.ok(mv.mp[2] <= 20 + 1e-3, `x ${mv.mp[0]} r ${mv.mp[2]}`);
    if (!onFlat) assert.ok(Math.abs(mv.mp[2] - 20) < 0.02, `x ${mv.mp[0]} A ${mv.a} r ${mv.mp[2]}`);
  }
  // Pointing at the flat (the part turned so +z faces the tool: A = 0) the tip is at r 15 mid-flat.
  const mid = feeds.filter((mv) => Math.abs(mv.mp[0] - 30) < 0.6 && Math.abs(mv.a) < 1e-9);
  assert.ok(mid.length && mid.every((mv) => Math.abs(mv.mp[2] - 15) < 0.02), JSON.stringify(mid.map((mv) => mv.mp)));
  // Post: A words with the moves, G43 on the first.
  const g = postProcess({ tools, paths: [tp], stock: st, ops: [{ id: 'r4', type: 'rotary4' }] });
  assert.match(g, /G43 H\d+ Z/);
  assert.ok((g.match(/ A\d/g) ?? []).length > 100);
});

test('5-axis: a dome finished with the tool along the normal (leaned, within the tilt limit), no gouges', () => {
  const dome = R.makeBox([-30, -30, 0], [30, 30, 10]).fuse(R.makeSphere(25).translate([0, 0, -5]).intersect(R.makeBox([-30, -30, 10], [30, 30, 40])));
  const m = machiningModel(dome.mesh({ tolerance: 0.02, angularTolerance: 0.1 }), { shape: dome });
  const st = defaultStock(m.bounds, { margin: 2, top: 1 });
  const c = camContext({ model: m, stock: st, tools, material: 'al-6061', features: recognizeFeatures(m, { stockTop: st.z1 }).features });
  const rough = generateToolpath(c, createOp('zlevel', { id: 'r', tool: 't2', stepdown: 3 }));
  const tp = generateToolpath(c, createOp('multi5', { id: 'f5', tool: 't6', scallop: 0.05, maxTilt: 50, lead: 10 }));
  assert.equal(tp.multi, 'multi5');
  const Rb = 4;
  let tilted = 0;
  for (const mv of tp.moves.filter((x) => x.k === 'f')) {
    const tilt = (Math.acos(mv.t[2]) * 180) / Math.PI;
    assert.ok(tilt <= 50 + 1e-6, `tilt ${tilt}`);
    if (tilt > 20) tilted++;
    // The ball centre: tip + axis · R.
    const cen = [mv.p[0] + mv.t[0] * Rb, mv.p[1] + mv.t[1] * Rb, mv.p[2] + mv.t[2] * Rb];
    // On the sphere part (centre (0, 0, −5), radius 25, above z = 10) the centre is 25 + R from the sphere's centre.
    if (Math.hypot(cen[0], cen[1]) < 15) assert.ok(Math.abs(Math.hypot(cen[0], cen[1], cen[2] + 5) - 29) < 0.05, `${cen}`);
  }
  assert.ok(tilted > 50, `${tilted} tilted moves`);
  const s = simulateMilling(st, [rough, tp], tools, { cell: 0.5 });
  assert.deepEqual(s.skipped, []);
  // Rows starting off the part come in at feed below the stock's top: no rapid through material.
  const alone = simulateMilling(st, [tp], tools, { cell: 0.5 });
  assert.equal(alone.rapidCuts, 0, JSON.stringify(alone.rapidAt.slice(0, 2)));
  const gc = gougeCheck(s, m, { tol: 0.03 });
  assert.equal(gc.count, 0, `${gc.count} gouges`);
  // Post: TCP with A / C, cancelled after.
  const g = postProcess({ tools, paths: [tp], stock: st, ops: [{ id: 'f5', type: 'multi5' }] });
  assert.match(g, /G43\.4 H\d+/);
  assert.match(g, /G49/);
  assert.ok((g.match(/ A[\d.-]+ C[\d.-]+/g) ?? []).length > 100);
});

test('tool axis and A / C: lean along the cut, the tilt limit, C kept continuous across ±180°', () => {
  const a = toolAxis([0, 0, 1], [1, 0, 0], 10, 60);
  assert.ok(Math.abs((Math.atan2(a[0], a[2]) * 180) / Math.PI - 10) < 1e-9);
  const b = toolAxis([1, 0, 0.2], [0, 1, 0], 0, 45);
  assert.ok(Math.abs((Math.acos(b[2]) * 180) / Math.PI - 45) < 1e-9);
  assert.deepEqual(axisToAC([0, 0, 1]), { A: 0, C: 0 });
  const p = axisToAC([Math.sin(0.5), 0, Math.cos(0.5)]);
  assert.ok(Math.abs(p.A - (0.5 * 180) / Math.PI) < 1e-9 && Math.abs(p.C - 90) < 1e-9);
  const c1 = axisToAC([-0.01, 0.5, 0.86], 179).C;
  assert.ok(c1 > 179, String(c1));
});

test('mill-turn: four axial holes on a flange face drilled by C angle and radius; a radial pattern of six', () => {
  let flange = R.makeCylinder(30, 12, [0, 0, 0], [0, 0, 1]).fuse(R.makeCylinder(15, 30, [0, 0, 12], [0, 0, 1]));
  for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; flange = flange.cut(R.makeCylinder(3, 20, [22 * Math.cos(a), 22 * Math.sin(a), -4], [0, 0, 1])); }
  const m = machiningModel(flange.mesh({ tolerance: 0.005, angularTolerance: 0.05 }));
  const prof = turningProfile(m);
  const st = defaultStock(m.bounds, { turning: true, margin: 1, top: 1 }); st.z0 = m.bounds.lo[2];
  const rec = recognizeFeatures(m, { stockTop: st.z1 });
  const c = camContext({ model: m, stock: st, tools, machine: 'lathe', material: 'steel-1020', profile: prof, features: rec.features });
  const ax = generateToolpath(c, createOp('mtAxial', { id: 'ax', tool: 't13' }));
  assert.equal(ax.holes, 4);
  const cs = ax.moves.map((mv) => ((Math.round(mv.c) % 360) + 360) % 360).sort((x, y) => x - y);
  assert.deepEqual(cs, [0, 90, 180, 270]);
  assert.ok(ax.moves.every((mv) => Math.abs(mv.radius - 22) < 0.01 && mv.live === 'axial'));
  const rad = generateToolpath(c, createOp('mtRadial', { id: 'rd', tool: 't12', count: 6, startAngle: 15, z: 25, depth: 4 }));
  assert.equal(rad.moves.length, 6);
  assert.ok(Math.abs(rad.outer - 15) < 0.05, String(rad.outer));
  rad.moves.forEach((mv, i) => { assert.ok(Math.abs(mv.c - (15 + 60 * i)) < 1e-9); assert.ok(Math.abs(Math.hypot(mv.p[0], mv.p[1]) - 11) < 0.05); });
  const g = postProcess({ tools, paths: [ax, rad], stock: st, post: 'fanucLathe', ops: [{ id: 'ax', type: 'mtAxial' }, { id: 'rd', type: 'mtRadial' }] });
  assert.equal((g.match(/G83 /g) ?? []).length, 4);
  assert.equal((g.match(/G87 /g) ?? []).length, 6);
  assert.match(g, /M13/);
  assert.match(g, /G0 C90\.?0*\b|G0 C90/);
  // On a part with no off-axis holes the axial operation says so.
  const plain = machiningModel(R.makeCylinder(20, 30, [0, 0, 0], [0, 0, 1]).mesh({ tolerance: 0.01, angularTolerance: 0.1 }));
  const c2 = camContext({ model: plain, stock: defaultStock(plain.bounds, { turning: true }), tools, machine: 'lathe', profile: turningProfile(plain), features: [] });
  assert.throws(() => generateToolpath(c2, createOp('mtAxial', { id: 'x', tool: 't13' })), (e) => e.code === 'noLiveHoles');
});

test('4-axis rotary simulation: the box stock turned round the A axis is cut to the shaft and its flat, no gouges', () => {
  const shaft = R.makeCylinder(20, 60, [0, 0, 0], [1, 0, 0]).cut(R.makeBox([20, -30, 15], [40, 30, 30]));
  const m = machiningModel(shaft.mesh({ tolerance: 0.01, angularTolerance: 0.05 }));
  const st = defaultStock(m.bounds, { margin: 0, top: 0 });
  const c = camContext({ model: m, stock: st, tools, material: 'al-6061' });
  const tp = generateToolpath(c, createOp('rotary4', { id: 'r4', tool: 't7', scallop: 0.05, sample: 1 }));
  const s = simulateMilling(st, [tp], tools, { cell: 0.5 });
  assert.deepEqual(s.skipped, []);
  assert.equal(s.full, true);
  // Rapids turn the part beyond the stock's corners and stop above its surface: none goes through material.
  assert.equal(s.rapidCuts, 0, JSON.stringify(s.rapidAt.slice(0, 3)));
  // Box 60 × 40 × 40 minus the shaft (π·20²·60) less the flat's segment (r 20 at 15 off the axis, 20 long).
  const segment = 400 * Math.acos(15 / 20) - 15 * Math.sqrt(400 - 225);
  const removable = 60 * 40 * 40 - (Math.PI * 400 * 60 - segment * 20);
  assert.ok(s.removed > removable * 0.9 && s.removed < removable * 1.02, `removed ${s.removed.toFixed(0)} of ${removable.toFixed(0)}`);
  // The corners of the box went (seen along Z: the top over a corner of the section is gone at every x).
  const g = s.dexel.grids.x; const corner = g.rays[(g.nv - 1) * g.nu + (g.nu - 1)];
  assert.equal(corner.length, 0, `corner ray ${corner}`);
  const gc = gougeCheck(s, m, { tol: 0.05 });
  assert.equal(gc.count, 0, `${gc.count} gouges, max ${gc.max}`);
  // The whole stock for display: a closed surface round the shaft.
  const mesh = dexelMesh(s.dexel);
  assert.ok(mesh.triangles.length > 3000 && mesh.vertices.length === mesh.normals.length);
});

test('mill-turn simulation: after turning, the live tools drill the axial and radial holes into the turned bar', () => {
  let flange = R.makeCylinder(30, 12, [0, 0, 0], [0, 0, 1]).fuse(R.makeCylinder(15, 30, [0, 0, 12], [0, 0, 1]));
  for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; flange = flange.cut(R.makeCylinder(3, 20, [22 * Math.cos(a), 22 * Math.sin(a), -4], [0, 0, 1])); }
  // The six radial holes the live tool drills are in the design too (Ø5.2, flat bottomed at radius 11).
  for (let i = 0; i < 6; i++) { const a = ((15 + 60 * i) * Math.PI) / 180; flange = flange.cut(R.makeCylinder(2.6, 8, [11 * Math.cos(a), 11 * Math.sin(a), 25], [Math.cos(a), Math.sin(a), 0])); }
  const m = machiningModel(flange.mesh({ tolerance: 0.005, angularTolerance: 0.05 }));
  const prof = turningProfile(m);
  const st = defaultStock(m.bounds, { turning: true, margin: 1, top: 1 }); st.z0 = m.bounds.lo[2];
  const rec = recognizeFeatures(m, { stockTop: st.z1 });
  const c = camContext({ model: m, stock: st, tools, machine: 'lathe', material: 'steel-1020', profile: prof, features: rec.features });
  const turning = planOperations(rec.features, tools, { turning: true, profile: prof }).map((op) => generateToolpath(c, op));
  const ax = generateToolpath(c, createOp('mtAxial', { id: 'ax', tool: 't12' }));
  const rad = generateToolpath(c, createOp('mtRadial', { id: 'rd', tool: 't12', count: 6, startAngle: 15, z: 25, depth: 4 }));
  const at = (z) => profileAt(prof, z);
  const cell = 0.1;
  const plain = simulateTurning(st, turning, tools, { cell });
  const s = simulateTurning(st, [...turning, ax, rad], tools, { cell });
  assert.deepEqual(s.skipped, []);
  assert.ok(s.live?.dexel, 'a 3D model for the live tools');
  // Ø5 drills (118° points, cone height hc): four through the 12 mm flange with the tip at its bottom face (full width
  // above hc), six with the tip 4 mm under the Ø30 shaft's surface — up to the curved outside, √(15² − y²) across it.
  const r = 2.5; const hc = r / Math.tan((59 * Math.PI) / 180); const cone = (Math.PI * r * r * hc) / 3;
  const axial = Math.PI * r * r * (12 - hc) + cone;
  let radial = cone; const n = 200;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const y = -r + ((i + 0.5) * 2 * r) / n; const z = -r + ((j + 0.5) * 2 * r) / n; if (y * y + z * z <= r * r) radial += Math.max(0, Math.sqrt(225 - y * y) - (11 + hc)) * ((2 * r) / n) ** 2; }
  const expect = 4 * axial + 6 * radial;
  assert.ok(Math.abs(s.live.removed - expect) < expect * 0.04, `live removed ${s.live.removed.toFixed(1)}, about ${expect.toFixed(1)}`);
  assert.ok(Math.abs(s.removed - plain.removed - s.live.removed) < 1e-6);
  const check = withLiveGouges(turnGougeCheck(s, at, { tol: 0.05 }), s, m, { tol: 0.05 });
  assert.equal(check.live.count, 0, `${check.live.count} live gouges, max ${check.live.max}`);
  // A Ø6.8 drill in the Ø6 holes cuts into the part: found.
  const big = generateToolpath(c, createOp('mtAxial', { id: 'ax2', tool: 't13' }));
  const s2 = simulateTurning(st, [...turning, big], tools, { cell });
  const c2 = withLiveGouges(turnGougeCheck(s2, at, { tol: 0.05 }), s2, m, { tol: 0.05 });
  assert.ok(c2.live.count > 0 && c2.live.max > 0.3, JSON.stringify(c2.live));
  assert.ok(dexelMesh(s.live.dexel).triangles.length > 3000);
});
