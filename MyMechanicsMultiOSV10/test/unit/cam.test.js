// CAM: polygon offsets, sections, feature recognition, toolpaths (2.5D, drilling, 3D, turning), material removal
// with a gouge check against the part, cycle time, and G-code that replays to the same path in every dialect.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import {
  offsetLoops, rectLoop, circleLoop, cw, regionArea, distanceToLoops, resample, loopArea, sliceMesh, weldMesh, TriangleGrid, dropCutter,
  insideRegion, clearingRings, segDist,
} from '../../src/cad/cam-geom.js';
import { machiningModel, recognizeFeatures, turningProfile, isTurnable } from '../../src/cad/cam-features.js';
import { camContext, defaultStock, planOperations, generateProgram, generateToolpath, createOp, stockVolume, expandMoves, stepLevels } from '../../src/cad/cam-ops.js';
import { simulateMilling, gougeCheck, simulateTurning, turnGougeCheck, cycleTime, pathLengths, zmapMesh } from '../../src/cad/cam-sim.js';
import { postProcess, parseGcode, wcsMoves, compareMoves, POST_IDS, POSTS, setupSheetHtml, fmtNum, wcsOrigin } from '../../src/cad/cam-post.js';
import { cloneTools, millingData, turningData, machineOf, cutMaterialOf, threadForDrill, MACHINES } from '../../src/cad/cam-tools.js';

await loadKernel();
const R = rep();
const tools = cloneTools();
const toolById = (id) => tools.find((t) => t.id === id);

// ───────────────────────── 2D offsets

test('offsets: a square shrinks and grows by exactly the distance (area, corner arcs)', () => {
  const sq = rectLoop(0, 0, 100, 100);
  assert.ok(Math.abs(regionArea(offsetLoops([sq], -10)) - 6400) < 1e-6);
  const grown = regionArea(offsetLoops([sq], 5, { tol: 0.001 }));
  // Circumscribed corner arcs: never inside the true offset, at most the tolerance outside.
  const exact = 10000 + 4 * 100 * 5 + Math.PI * 25;
  assert.ok(grown >= exact - 1e-6 && grown < exact + 0.5, `${grown} vs ${exact}`);
});

test('offsets: every point of a pocket-with-island offset is at the tool radius from the walls', () => {
  const walls = [rectLoop(0, 0, 100, 60), cw(rectLoop(30, 20, 50, 40)), cw(circleLoop(75, 30, 8, 0.001))];
  for (const r of [3, 6, 9.5]) {
    const off = offsetLoops(walls, -r, { tol: 0.002 });
    assert.ok(off.length >= 1, `r ${r}: ${off.length} loops`);
    let min = Infinity; let max = 0;
    for (const loop of off) for (const p of resample(loop, 0.25, true)) { const d = distanceToLoops(walls, p); min = Math.min(min, d); max = Math.max(max, d); assert.ok(insideRegion(walls, p)); }
    assert.ok(min >= r - 1e-6, `r ${r}: closest ${min}`);
    assert.ok(max <= r + 0.01, `r ${r}: farthest ${max}`);
  }
});

test('offsets: overlapping islands read as their union; a too-large offset is empty', () => {
  const walls = [rectLoop(0, 0, 100, 100), cw(rectLoop(40, 40, 60, 60)), cw(rectLoop(55, 40, 75, 60))];
  const off = offsetLoops(walls, -5);
  assert.equal(off.length, 2);
  const hole = off.find((l) => loopArea(l) < 0);
  // The union 35 × 20 grown by 5 with round corners.
  assert.ok(Math.abs(-loopArea(hole) - (45 * 30 - (4 - Math.PI) * 25)) < 0.5, `${loopArea(hole)}`);
  assert.deepEqual(offsetLoops([rectLoop(0, 0, 10, 10)], -6), []);
  const rings = clearingRings([rectLoop(0, 0, 60, 40)], 4, 3);
  assert.ok(rings.length >= 5 && rings.length <= 6, `${rings.length} rings`);
});

// ───────────────────────── a milled test part

const pocketPart = () => {
  let body = R.makeBox([-50, -40, 0], [50, 40, 30]);
  body = body.cut(R.drawRoundedRectangle(60, 40, 8).sketchOnPlane('XY', 20).extrude(10));   // closed pocket, corner R8
  body = body.cut(R.makeCylinder(2.5, 40, [35, 30, -5], [0, 0, 1]));                          // Ø5 through hole
  return body;
};
const body = pocketPart();
const model = machiningModel(body.mesh({ tolerance: 0.005, angularTolerance: 0.05 }));
const stock = defaultStock(model.bounds, { margin: 0, top: 2 });
const rec = recognizeFeatures(model, { stockTop: stock.z1 });
const ctx = camContext({ model, stock, tools, machine: 'vmc', material: 'al-6061', features: rec.features });

test('sections of the part: outer loop CCW, pocket and hole CW, areas', () => {
  const at25 = sliceMesh(model.welded, 25);
  const areas = at25.map(loopArea).sort((a, b) => a - b);
  assert.equal(at25.length, 3);
  assert.ok(Math.abs(areas[2] - 8000) < 0.01);
  assert.ok(Math.abs(-areas[0] - (60 * 40 - (4 - Math.PI) * 64)) < 0.5, `${areas[0]}`);
  assert.ok(Math.abs(-areas[1] - Math.PI * 6.25) < 0.05, `${areas[1]}`);
  assert.equal(sliceMesh(model.welded, 10).length, 2);
});

test('drop cutter: flat and ball heights on the pocket floor, the top and against a wall edge', () => {
  const grid = new TriangleGrid(weldMesh(body.mesh({ tolerance: 0.01, angularTolerance: 0.1 })));
  const flat = { type: 'flat', r: 5 }; const ball = { type: 'ball', r: 5, rc: 5 };
  assert.ok(Math.abs(dropCutter(grid, flat, 0, 0) - 20) < 1e-6);
  assert.ok(Math.abs(dropCutter(grid, flat, 0, 16) - 30) < 1e-6, 'the flat bottom rests on the top edge');
  // Ball 4 mm from the pocket's edge: 5 − √(25 − 16) = 2 below the top.
  assert.ok(Math.abs(dropCutter(grid, ball, 0, 16) - 28) < 1e-3, `${dropCutter(grid, ball, 0, 16)}`);
  assert.ok(Math.abs(dropCutter(grid, ball, -45, -35) - 30) < 1e-6);
});

test('feature recognition: face, closed pocket, through hole (with the M6 tap drill size)', () => {
  const types = rec.features.map((f) => f.type).sort();
  assert.deepEqual(types, ['face', 'hole', 'pocket']);
  const pocket = rec.features.find((f) => f.type === 'pocket');
  assert.equal(pocket.floor, 20); assert.equal(pocket.top, 30);
  assert.ok(Math.abs(pocket.width - 40) < 0.01 && Math.abs(pocket.length - 60) < 0.01);
  const hole = rec.features.find((f) => f.type === 'hole');
  assert.equal(hole.d, 5); assert.equal(hole.through, true); assert.equal(hole.tapCandidate, 'M6');
  assert.equal(rec.turnable, false);
});

test('feature recognition: slot, boss, step, counterbored blind hole, freeform', () => {
  let b = R.makeBox([-50, -40, 0], [50, 40, 30]);
  b = b.cut(R.drawRoundedRectangle(60, 30, 8).sketchOnPlane('XY', 20).extrude(10));
  b = b.fuse(R.makeCylinder(5, 5, [0, 0, 20], [0, 0, 1]));
  b = b.cut(R.makeCylinder(3.4, 12, [-35, 25, 20], [0, 0, 1])).cut(R.makeCylinder(6, 5, [-35, 25, 25], [0, 0, 1]));
  b = b.cut(R.drawRoundedRectangle(40, 8, 4).sketchOnPlane('XY', 25).extrude(5).translate([0, -30, 0]));
  b = b.cut(R.makeBox([40, -40, 22], [50, -20, 30]));
  b = b.cut(R.makeSphere(6).translate([30, 25, 33]));
  const m = machiningModel(b.mesh({ tolerance: 0.01, angularTolerance: 0.1 }));
  const r = recognizeFeatures(m, { stockTop: 32 });
  const by = (t) => r.features.filter((f) => f.type === t);
  assert.equal(by('slot').length, 1); assert.ok(Math.abs(by('slot')[0].width - 8) < 0.01);
  assert.equal(by('boss').length, 1); assert.equal(by('boss')[0].height, 5);
  assert.equal(by('step').length, 1); assert.equal(by('step')[0].floor, 22);
  assert.equal(by('pocket').length, 1); assert.equal(by('pocket')[0].islands.length, 1);
  const h = by('hole')[0];
  assert.equal(h.d, 6.8); assert.equal(h.through, false); assert.deepEqual(h.counterbore, { d: 12, depth: 5 });
  assert.equal(by('surface3d').length, 1);
});

test('default operations for the features, and feeds and speeds from the material', () => {
  const ops = planOperations(rec.features, tools);
  assert.deepEqual(ops.map((o) => o.type), ['facing', 'pocket', 'contour', 'spot', 'peck']);
  const d = millingData(toolById('t2'), 'aluminium', machineOf('vmc'));
  assert.equal(d.rpm, Math.min(12000, Math.round((1000 * 380) / (Math.PI * 12))));
  assert.ok(d.feed > 1000 && d.feed <= 10000);
  const steel = millingData(toolById('t2'), 'steel', machineOf('vmc'));
  assert.ok(steel.rpm < d.rpm && steel.feed < d.feed, 'steel runs slower than aluminium');
  // Chip thinning: a light radial cut takes a higher feed per tooth.
  assert.ok(millingData(toolById('t2'), 'steel', machineOf('vmc'), { ae: 1 }).feed > steel.feed);
  const tap = millingData(toolById('t19'), 'steel', machineOf('vmc'));
  assert.ok(Math.abs(tap.feed - tap.rpm * 1) < 1, 'a tap feeds one pitch per turn');
  assert.equal(cutMaterialOf('stainless-304'), 'stainless'); assert.equal(threadForDrill(8.5), 'M10');
  const t = turningData(toolById('l1'), 'steel', machineOf('lathe'));
  assert.ok(Math.abs(t.rpmAt(40) - (1000 * 220) / (Math.PI * 40)) < 1e-6);
  assert.equal(stepLevels(30, 20, 3).length, 4);
});

const ops = planOperations(rec.features, tools).map((o) => (o.type === 'pocket' ? { ...o, leave: 0, leaveZ: 0, finishPass: false } : o));
const program = generateProgram(ctx, ops);

test('every planned operation makes a toolpath', () => {
  assert.deepEqual(program.errors, []);
  assert.equal(program.paths.length, ops.length);
  for (const p of program.paths) assert.ok(p.moves.length > 0 && p.rpm > 0 && p.feed > 0, p.opType);
});

test('pocket toolpath: every cutting move keeps the tool radius from the walls; the wall pass is at the radius', () => {
  const R6 = toolById('t2').d / 2;
  const walls = sliceMesh(model.welded, 25);
  const check = (tp, exact) => {
    let min = Infinity; let maxAtWall = 0; let pos = null; let n = 0;
    for (const m of expandMoves(tp.moves)) {
      if (pos && m.k === 'f' && m.p[2] < 29.9 && pos[2] < 29.9) {
        for (const q of resample([[pos[0], pos[1]], [m.p[0], m.p[1]]], 0.5)) { const d = distanceToLoops(walls, q); min = Math.min(min, d); if (d < R6 + 0.5) maxAtWall = Math.max(maxAtWall, d); n++; }
      }
      pos = m.p;
    }
    assert.ok(n > 100, `${tp.opType}: ${n} samples`);
    assert.ok(min >= R6 - 1e-6, `${tp.opType}: tool centre ${min} from a wall (radius ${R6})`);
    if (exact) assert.ok(maxAtWall <= R6 + 0.01, `${tp.opType}: wall pass at ${maxAtWall}`);
  };
  check(program.paths.find((p) => p.opType === 'pocket'), false);
  check(program.paths.find((p) => p.opType === 'contour'), true);
});

const sim = simulateMilling(stock, program.paths, tools, { cell: 0.5 });
const grid = model.topGrid();
const gouge = gougeCheck(sim.map, (x, y) => grid.topAt(x, y), { tol: 0.02 });

test('material removal: no gouge, no rapid through material, removed volume = stock − part', () => {
  assert.equal(gouge.count, 0, `gouges: ${gouge.count}, deepest ${gouge.max}`);
  assert.equal(sim.rapidCuts, 0, JSON.stringify(sim.rapidAt));
  const expected = stockVolume(stock) - R.measureVolume(body);
  assert.ok(Math.abs(sim.removed - expected) / expected < 0.005, `removed ${sim.removed} vs ${expected}`);
  assert.ok(gouge.remaining / expected < 0.002, `left ${gouge.remaining}`);
  const mesh = zmapMesh(sim.map, { partHeights: gouge.partHeights });
  assert.equal(mesh.vertices.length, mesh.colors.length);
});

test('cycle time: feed length over feed, rapids at the rapid rate, a change per new tool', () => {
  const machine = machineOf('vmc');
  const t = cycleTime(program.paths, machine);
  let feedTime = 0; let rapidLen = 0;
  let pos = null;
  for (const p of program.paths) {
    for (const m of expandMoves(p.moves)) { if (!m.p) continue; if (pos) { const L = Math.hypot(m.p[0] - pos[0], m.p[1] - pos[1], m.p[2] - pos[2]); if (m.k === 'r') rapidLen += L; else feedTime += (L / m.f) * 60; } pos = m.p; }
  }
  assert.ok(Math.abs(t.cutting - feedTime) < 1e-6, `${t.cutting} vs ${feedTime}`);
  assert.ok(Math.abs(t.rapid - (rapidLen / machine.rapid) * 60) < 1e-6);
  // Pocket and contour share the Ø12 end mill: four changes for five operations.
  const changes = program.paths.filter((p, i) => i === 0 || p.tool !== program.paths[i - 1].tool).length;
  assert.equal(t.changes, changes); assert.equal(changes, 4);
  assert.ok(Math.abs(t.total - (t.cutting + t.rapid + changes * machine.toolChange)) < 1e-6);
  assert.ok(pathLengths(program.paths[1].moves).feed > 1000);
});

for (const post of POST_IDS.filter((id) => POSTS[id].kind === 'mill')) {
  test(`G-code (${post}): parses and replays to the same path`, () => {
    const code = postProcess({ number: 1234, name: 'Test part', tools, paths: program.paths, stock, bounds: model.bounds, post, ops });
    assert.match(code, /G21/); assert.match(code, /T2 M6/); assert.match(code, post === 'linuxcnc' ? /M2\n/ : /M30\n/);
    assert.match(code, post === 'linuxcnc' ? /G83/ : /G98 G83/);
    const replay = parseGcode(code, { start: [0, 0, 0] });
    const expected = wcsMoves(program.paths, stock, 'stockTopCenter', model.bounds, [0, 0, 0]);
    const cmp = compareMoves(replay, expected);
    assert.ok(cmp.max < 1e-3, `largest difference ${cmp.max} (${cmp.count})`);
    assert.equal(cmp.kinds, 0);
  });
}

test('G-code numbers and the work offset', () => {
  assert.equal(fmtNum(50, POSTS.fanuc), '50.'); assert.equal(fmtNum(50, POSTS.linuxcnc), '50');
  assert.equal(fmtNum(-0.00001, POSTS.fanuc), '0.'); assert.equal(fmtNum(12.34567, POSTS.iso), '12.3457');
  assert.deepEqual(wcsOrigin(stock, 'stockTopCorner'), [stock.x0, stock.y0, stock.z1]);
  // Arcs and incremental moves are read too.
  const moves = parseGcode('G90 G0 X10 Y0 Z5\nG1 Z0 F100\nG3 X0 Y10 I-10 J0\nG91 G1 X-5\n', { start: [0, 0, 10] });
  const arcEnd = moves.findLast((m) => Math.abs(m.p[1] - 10) < 1e-9 && Math.abs(m.p[0]) < 1e-9);
  assert.ok(arcEnd);
  for (const m of moves.slice(2, -1)) assert.ok(Math.abs(Math.hypot(m.p[0], m.p[1]) - 10) < 1e-9);
  assert.deepEqual(moves.at(-1).p.map((v) => Math.round(v * 1e6) / 1e6), [-5, 10, 0]);
});

test('set-up sheet: tools, operations and cycle time', () => {
  const times = cycleTime(program.paths, machineOf('vmc'));
  const html = setupSheetHtml({ name: 'Pocket', material: 'Al 6061', machine: 'VMC', post: 'Fanuc', stock, wcs: 'stockTopCenter', origin: wcsOrigin(stock), tools, ops, paths: program.paths, times });
  assert.match(html, /<table/); assert.match(html, /T12/); assert.equal((html.match(/<tr>/g) ?? []).length, 6 + 4 + 1 + 5 + 1);
});

test('adaptive clearing of the pocket: no gouge, engagement held at the limit', () => {
  const op = createOp('adaptive', { id: 'ad', tool: 't3', feature: rec.features.find((f) => f.type === 'pocket').id, stepdown: 10, leave: 0, leaveZ: 0, engagement: 80 });
  const tp = generateToolpath(ctx, op);
  assert.ok(tp.engagement <= 80 + 1e-6);
  const s = simulateMilling(stock, [tp], tools, { cell: 0.5 });
  const g = gougeCheck(s.map, (x, y) => grid.topAt(x, y), { tol: 0.02 });
  assert.equal(g.count, 0);
});

// ───────────────────────── 3D

test('3D: z-level roughing, then parallel / scallop / waterline finishing on a dome do not gouge', () => {
  const dome = R.makeBox([-30, -30, 0], [30, 30, 10]).fuse(R.makeSphere(25).translate([0, 0, -5]).intersect(R.makeBox([-30, -30, 10], [30, 30, 40])));
  const m = machiningModel(dome.mesh({ tolerance: 0.02, angularTolerance: 0.1 }));
  const st = defaultStock(m.bounds, { margin: 2, top: 1 });
  const c = camContext({ model: m, stock: st, tools, material: 'al-6061', features: recognizeFeatures(m, { stockTop: st.z1 }).features });
  const g = m.topGrid();
  const rough = generateToolpath(c, createOp('zlevel', { id: 'r', tool: 't2', stepdown: 3 }));
  for (const [type, tool, extra] of [['parallel', 't6', { scallop: 0.05 }], ['scallop', 't7', { scallop: 0.1 }], ['waterline', 't6', { stepdown: 2 }]]) {
    const fin = generateToolpath(c, createOp(type, { id: type, tool, ...extra }));
    const s = simulateMilling(st, [rough, fin], tools, { cell: 0.5 });
    const gc = gougeCheck(s.map, (x, y) => g.topAt(x, y), { tol: 0.03 });
    assert.equal(gc.count, 0, `${type}: ${gc.count} gouges, deepest ${gc.max} at ${gc.cells.map((k) => [s.map.x0 + (k % s.map.nx + 0.5) * s.map.hx, s.map.y0 + (Math.floor(k / s.map.nx) + 0.5) * s.map.hy].join(',')).join(' ')}`);
    assert.ok(s.removed > 0);
  }
});

// ───────────────────────── turning

test('turning: profile, facing / OD rough and finish / drill / bore / groove; removed = stock − part; G-code replays', () => {
  let shaft = R.makeCylinder(20, 30, [0, 0, 0], [0, 0, 1]).fuse(R.makeCylinder(12, 40, [0, 0, 30], [0, 0, 1])).cut(R.makeCylinder(6, 80, [0, 0, -5], [0, 0, 1]));
  shaft = shaft.cut(R.makeCylinder(30, 4, [0, 0, 50], [0, 0, 1]).cut(R.makeCylinder(10, 4, [0, 0, 50], [0, 0, 1])));
  const m = machiningModel(shaft.mesh({ tolerance: 0.005, angularTolerance: 0.05 }));
  assert.ok(isTurnable(m));
  const prof = turningProfile(m);
  assert.equal(prof.grooves.length, 1); assert.ok(Math.abs(prof.grooves[0].r - 10) < 0.01);
  assert.ok(Math.abs(prof.maxR - 20) < 0.01 && Math.abs(prof.bore - 6) < 0.01);
  const st = defaultStock(m.bounds, { turning: true, margin: 2, top: 2 }); st.z0 = m.bounds.lo[2];
  const c = camContext({ model: m, stock: st, tools, machine: 'lathe', material: 'steel-1020', profile: prof });
  const tops = planOperations([], tools, { turning: true, profile: prof });
  assert.deepEqual(tops.map((o) => o.type), ['tFace', 'tRough', 'tDrill', 'tBoreRough', 'tBoreFinish', 'tFinish', 'tGroove']);
  const prog = generateProgram(c, tops);
  assert.deepEqual(prog.errors, []);
  const s = simulateTurning(st, prog.paths, tools, { cell: 0.1 });
  const at = (z) => { if (z > prof.front || z < prof.back) return { outer: 0, inner: 0 }; let best = prof.samples[0]; for (const q of prof.samples) if (Math.abs(q.z - z) < Math.abs(best.z - z)) best = q; return best; };
  const gc = turnGougeCheck(s, at, { tol: 0.06 });
  assert.equal(gc.count, 0, `gouges ${gc.count}, deepest ${gc.max}`);
  const expected = stockVolume(st) - R.measureVolume(shaft);
  assert.ok(Math.abs(s.removed - expected) / expected < 0.005, `removed ${s.removed} vs ${expected}`);
  for (const post of ['fanucLathe', 'linuxcncLathe']) {
    const code = postProcess({ tools, paths: prog.paths, stock: st, bounds: m.bounds, post, ops: tops });
    assert.match(code, post === 'fanucLathe' ? /G96 S220 M3/ : /G96 D\d+ S220 M3/);
    const cmp = compareMoves(parseGcode(code, { lathe: true, start: [0, 0, 0] }), wcsMoves(prog.paths, st, 'stockTopCenter', m.bounds, [0, 0, 0]));
    assert.ok(cmp.max < 1e-3, `${post}: ${cmp.max} ${cmp.count}`);
  }
  const thread = generateToolpath(c, createOp('tThread', { id: 'th', tool: 'l5', pitch: 1.5, passes: 5, length: 10, z1: 70 }));
  assert.equal(thread.moves.filter((x) => x.k === 't').length, 5);
  const code = postProcess({ tools, paths: [thread], stock: st, bounds: m.bounds, post: 'fanucLathe' });
  assert.equal((code.match(/G32 Z-10\. F1\.5/g) ?? []).length, 5);
  assert.ok(cycleTime(prog.paths, machineOf('lathe')).total > 0);
});

test('machines and posts are listed with their kinds', () => {
  assert.ok(MACHINES.some((x) => x.kind === 'lathe') && MACHINES.some((x) => x.kind === 'mill'));
  for (const id of POST_IDS) assert.ok(['mill', 'lathe'].includes(POSTS[id].kind));
  assert.ok(segDist([0, 1], [0, 0], [1, 0]) === 1);
});
