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
import { camContext, defaultStock, planOperations, generateProgram, generateToolpath, createOp, stockVolume, expandMoves, stepLevels, EngagementModel, cuspHeight, scallopLeft } from '../../src/cad/cam-ops.js';
import { simulateMilling, gougeCheck, simulateTurning, turnGougeCheck, cycleTime, pathLengths, zmapMesh } from '../../src/cad/cam-sim.js';
import { postProcess, parseGcode, wcsMoves, compareMoves, POST_IDS, POSTS, setupSheetHtml, fmtNum, wcsOrigin } from '../../src/cad/cam-post.js';
import { cloneTools, millingData, turningData, machineOf, cutMaterialOf, threadForDrill, MACHINES, parseInsert } from '../../src/cad/cam-tools.js';

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
const gouge = gougeCheck(sim, model, { tol: 0.02 });

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

test('engagement is exact: a straight cut beside the last pass takes acos(1 − ae/R), a slot 180°', () => {
  const area = [rectLoop(-100, -100, 100, 100)];
  for (const ae of [0.5, 1.5, 3, 6]) {
    const m = new EngagementModel(area, 6);
    m.add([-50, 0], [50, 0]);
    const e = (m.engagement([0, ae], [1, 0]) * 180) / Math.PI;
    assert.ok(Math.abs(e - (Math.acos(1 - ae / 6) * 180) / Math.PI) < 1e-6, `ae ${ae}: ${e}`);
  }
  assert.ok(Math.abs(new EngagementModel(area, 6).engagement([0, 0], [1, 0]) - Math.PI) < 1e-9);
  // What lies outside the area (the part's wall, air) is not material: half the radius past an edge, 120° of 180°.
  const walled = new EngagementModel([rectLoop(-100, 0, 100, 100)], 6);
  assert.ok(Math.abs(walled.engagement([0, 3], [1, 0]) - (2 * Math.PI) / 3) < 1e-9);
});

test('adaptive clearing of the pocket: no gouge, engagement held at the limit', () => {
  const op = createOp('adaptive', { id: 'ad', tool: 't3', feature: rec.features.find((f) => f.type === 'pocket').id, stepdown: 10, leave: 0, leaveZ: 0, engagement: 80 });
  const tp = generateToolpath(ctx, op);
  assert.ok(tp.engagement <= 80 + 1e-6, `${tp.engagement}`);
  // Re-check every cutting move at the floor with a fresh model of the same level.
  const R4 = toolById('t3').d / 2;
  const floorMoves = tp.moves.filter((mv) => mv.k === 'f' && Math.abs(mv.p[2] - 20) < 1e-6);
  const region = offsetLoops([...sliceMesh(model.welded, 20.01)].filter((l) => loopArea(l) < 0).map((l) => [...l].reverse()), -R4);
  const check = new EngagementModel(offsetLoops(region, R4), R4);
  let worst = 0; let prev = null;
  // The entry ring (opened by the ramp like a helical bore) is cut at full width by design.
  const entry = tp.entries.find((en) => Math.abs(en.z - 20) < 1e-6)?.loop ?? [];
  const onEntry = (q) => entry.some((e, i) => segDist(q, e, entry[(i + 1) % entry.length]) < 0.05);
  for (const mv of floorMoves) {
    const q = [mv.p[0], mv.p[1]];
    if (prev) { const d = Math.hypot(q[0] - prev[0], q[1] - prev[1]); if (d > 1e-6) { if (!onEntry(q)) worst = Math.max(worst, check.engagement(q, [(q[0] - prev[0]) / d, (q[1] - prev[1]) / d])); check.add(prev, q); } }
    prev = q;
  }
  assert.ok((worst * 180) / Math.PI <= 80 + 0.5, `re-checked engagement ${(worst * 180) / Math.PI}`);
  const s = simulateMilling(stock, [tp], tools, { cell: 0.5 });
  const g = gougeCheck(s, model, { tol: 0.02 });
  assert.equal(g.count, 0);
});

// ───────────────────────── 3D

test('3D: z-level roughing, then parallel / scallop / waterline finishing on a dome do not gouge', () => {
  const dome = R.makeBox([-30, -30, 0], [30, 30, 10]).fuse(R.makeSphere(25).translate([0, 0, -5]).intersect(R.makeBox([-30, -30, 10], [30, 30, 40])));
  const m = machiningModel(dome.mesh({ tolerance: 0.02, angularTolerance: 0.1 }), { shape: dome });
  const st = defaultStock(m.bounds, { margin: 2, top: 1 });
  const c = camContext({ model: m, stock: st, tools, material: 'al-6061', features: recognizeFeatures(m, { stockTop: st.z1 }).features });
  const g = m.topGrid();
  const rough = generateToolpath(c, createOp('zlevel', { id: 'r', tool: 't2', stepdown: 3 }));
  for (const [type, tool, extra] of [['parallel', 't6', { scallop: 0.05 }], ['scallop', 't7', { scallop: 0.1 }], ['waterline', 't6', { stepdown: 1 }]]) {
    const fin = generateToolpath(c, createOp(type, { id: type, tool, ...extra }));
    if (type === 'waterline') {
      // From the kernel's offset solid: at tip height 15 the ball's centre (19) runs on the sphere grown by 4,
      // radius √(29² − 24²) about the axis — exactly, not to a mesh.
      assert.equal(fin.exact, true);
      const at15 = fin.moves.filter((mv) => mv.k === 'f' && Math.abs(mv.p[2] - 15) < 1e-9);
      assert.ok(at15.length > 50);
      for (const mv of at15) assert.ok(Math.abs(Math.hypot(mv.p[0], mv.p[1]) - Math.sqrt(29 ** 2 - 24 ** 2)) < 0.002, `${Math.hypot(mv.p[0], mv.p[1])}`);
    }
    const s = simulateMilling(st, [rough, fin], tools, { cell: 0.5 });
    const gc = gougeCheck(s, m, { tol: 0.03 });
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
  // A control that compensates the nose radius gets the contour with G42 / G41; nose centre = contour dilated.
  for (const post of ['fanucLathe', 'linuxcncLathe']) {
    const code = postProcess({ tools, paths: prog.paths, stock: st, bounds: m.bounds, post, ops: tops, comp: 'control' });
    assert.match(code, /G42 G1 [XZ]/); assert.match(code, /G41 G1 [XZ]/); assert.match(code, /G40 G0/);
    const cmp = compareMoves(parseGcode(code, { lathe: true, start: [0, 0, 0] }), wcsMoves(prog.paths, st, 'stockTopCenter', m.bounds, [0, 0, 0], 'control'));
    assert.ok(cmp.max < 1e-3, `${post} control: ${cmp.max} ${cmp.count}`);
  }
  const fin = prog.paths.find((p) => p.opType === 'tFinish');
  const seg = (pts) => pts.slice(1).map((q, i) => [pts[i], q]);
  const contourSegs = seg(fin.contour.map((q) => [q[0], q[2]]));
  for (const mv of fin.moves.filter((x) => x.k === 'f' && x.p[0] > 0.01 && x.p[2] < 70.39 && x.p[2] > 0.1)) {
    const d = Math.min(...contourSegs.map(([a, b]) => segDist([mv.p[0], mv.p[2]], a, b)));
    assert.ok(Math.abs(d - fin.nose) < 0.01, `nose centre ${d} from the contour (nose ${fin.nose})`);
  }
  // Thread: a V of the insert's 60° along the pitch, its volume ≈ 2π r̄ · (½ · 2h·tan30° · h) / P · L.
  const thread = generateToolpath(c, createOp('tThread', { id: 'th', tool: 'l5', pitch: 1.5, passes: 5, length: 10, z1: 70 }));
  assert.equal(thread.moves.filter((x) => x.k === 't').length, 5);
  // Threaded on a bar already at the major diameter: what goes is the thread's V.
  const bar = { kind: 'bar', r: 12, z0: 55, z1: 70, cx: 0, cy: 0 };
  const cut = simulateTurning(bar, [thread], tools, { cell: 0.02 });
  const h = 0.61343 * 1.5; const area = 0.5 * 2 * h * Math.tan(Math.PI / 6) * h; const Rm = 12 - h / 3;
  const expectedThread = 2 * Math.PI * Rm * (area / 1.5) * 10;
  assert.ok(Math.abs(cut.removed - expectedThread) / expectedThread < 0.06, `thread ${cut.removed} vs ${expectedThread}`);
  assert.equal(turnGougeCheck(cut, at, { tol: 0.06, threads: [thread.thread] }).count, 0);
  const code = postProcess({ tools, paths: [thread], stock: st, bounds: m.bounds, post: 'fanucLathe' });
  assert.equal((code.match(/G32 Z-10\. F1\.5/g) ?? []).length, 5);
  assert.ok(cycleTime(prog.paths, machineOf('lathe')).total > 0);
});

test('ISO 1832 insert codes: shape angle, inscribed circle, thickness, nose radius', () => {
  assert.deepEqual(pick3(parseInsert('CNMG 120408')), ['C', 80, 12.7, 4.76, 0.8]);
  assert.deepEqual(pick3(parseInsert('VBMT160404')), ['V', 35, 9.525, 4.76, 0.4]);
  assert.deepEqual(pick3(parseInsert('DNMG 150608')), ['D', 55, 12.7, 6.35, 0.8]);
  assert.deepEqual(pick3(parseInsert('TNMG 160404')), ['T', 60, 9.525, 4.76, 0.4]);
  assert.deepEqual(pick3(parseInsert('WNMG 080408')), ['W', 80, 12.7, 4.76, 0.8]);
  assert.equal(parseInsert('RCMT 1204M0').round, true);
  assert.equal(parseInsert('XYZ'), null);
  const l2 = toolById('l2'); assert.equal(l2.angle, 35); assert.equal(l2.nose, 0.4);
});
const pick3 = (x) => [x.shape, x.angle, x.ic, x.thickness, x.nose];

test('machines and posts are listed with their kinds', () => {
  assert.ok(MACHINES.some((x) => x.kind === 'lathe') && MACHINES.some((x) => x.kind === 'mill'));
  for (const id of POST_IDS) assert.ok(['mill', 'lathe'].includes(POSTS[id].kind));
  assert.ok(segDist([0, 1], [0, 0], [1, 0]) === 1);
});

test('tapped hole (from a thread hint): spot, peck and tap cycles replay in every milling dialect', () => {
  const r = recognizeFeatures(model, { stockTop: stock.z1, hints: { threads: [{ x: 35, y: 30, d: 5, size: 'M6' }] } });
  const hole = r.features.find((f) => f.type === 'hole');
  assert.equal(hole.thread, 'M6');
  const c = camContext({ model, stock, tools, material: 'steel-1020', features: r.features });
  const holeOps = planOperations(r.features, tools).filter((o) => ['spot', 'peck', 'drill', 'tap'].includes(o.type));
  assert.deepEqual(holeOps.map((o) => o.type), ['spot', 'peck', 'tap']);
  const prog = generateProgram(c, holeOps);
  assert.deepEqual(prog.errors, []);
  const tap = prog.paths.find((p) => p.opType === 'tap');
  assert.ok(Math.abs(tap.feed - tap.rpm * 1) <= 1, 'tapping feed = pitch × speed');
  for (const post of ['fanuc', 'haas', 'linuxcnc', 'iso']) {
    const code = postProcess({ tools, paths: prog.paths, stock, bounds: model.bounds, post });
    assert.match(code, post === 'linuxcnc' ? /G33\.1 Z-?[\d.]+ K1/ : /G84 /);
    const cmp = compareMoves(parseGcode(code, { start: [0, 0, 0] }), wcsMoves(prog.paths, stock, 'stockTopCenter', model.bounds, [0, 0, 0]));
    assert.ok(cmp.max < 1e-3, `${post}: ${cmp.max} ${cmp.count}`);
  }
});

test('tri-dexel stock: a side hole the cutter cannot reach stays as stock; a 0.05 mm cut into a wall is caught at any grid', () => {
  const b = R.makeBox([-20, -15, 0], [20, 15, 20]).cut(R.makeCylinder(4, 60, [-30, 0, 8], [1, 0, 0]));
  const m = machiningModel(b.mesh({ tolerance: 0.002, angularTolerance: 0.05 }));
  const st = defaultStock(m.bounds, { margin: 0, top: 2 });
  const c = camContext({ model: m, stock: st, tools, material: 'al-6061', features: recognizeFeatures(m, { stockTop: st.z1 }).features });
  const face = generateToolpath(c, createOp('facing', { id: 'f', tool: 't1', stepdown: 1 }));
  const s = simulateMilling(st, [face], tools, { cell: 0.5 });
  const g = gougeCheck(s, m, { tol: 0.01 });
  assert.equal(g.count, 0);
  // Left after facing: the material inside the side hole (the part's own hole is air in the stock model).
  assert.ok(Math.abs(g.remaining - Math.PI * 16 * 40) / (Math.PI * 16 * 40) < 0.03, `${g.remaining}`);
  assert.ok(Math.abs(s.removed - 40 * 30 * 2) < 5, `${s.removed}`);
  // A vertical pass with its edge 0.05 mm inside the wall at x = 20 (off the 0.7 mm grid): seen along the X rays.
  for (const cell of [0.7, 1.3]) {
    const into = { op: 'x', tool: 't4', kind: 'mill', moves: [{ k: 'r', p: [23 - 0.05, -10, 30] }, { k: 'f', p: [23 - 0.05, -10, 5], f: 300 }, { k: 'f', p: [23 - 0.05, 10, 5], f: 300 }] };
    const s2 = simulateMilling(st, [into], tools, { cell });
    const g2 = gougeCheck(s2, m, { tol: 0.01 });
    assert.ok(g2.count > 0 && Math.abs(g2.max - 0.05) < 0.01, `cell ${cell}: ${g2.count} ${g2.max}`);
    const ok = { ...into, moves: into.moves.map((mv) => ({ ...mv, p: [23, mv.p[1], mv.p[2]] })) };
    assert.equal(gougeCheck(simulateMilling(st, [ok], tools, { cell }), m, { tol: 0.01 }).count, 0, `cell ${cell}: a tangent pass`);
  }
});

test('scallop finishing: every pair of neighbouring passes leaves the asked-for cusp, on flat and steep ground', () => {
  const dome = R.makeBox([-30, -30, 0], [30, 30, 10]).fuse(R.makeSphere(25).translate([0, 0, -5]).intersect(R.makeBox([-30, -30, 10], [30, 30, 40])));
  const m = machiningModel(dome.mesh({ tolerance: 0.01, angularTolerance: 0.05 }), { shape: dome });
  const st = defaultStock(m.bounds, { margin: 2, top: 1 });
  const c = camContext({ model: m, stock: st, tools, material: 'al-6061', features: recognizeFeatures(m, { stockTop: st.z1 }).features });
  const tp = generateToolpath(c, createOp('scallop', { id: 's', tool: 't6', scallop: 0.05, sample: 0.5 }));
  // The rings only (the clean-up passes added after them are checked in the next test).
  const ringPasses = tp.passes.slice(0, tp.passes.length - (tp.cleanup ?? 0));
  const R4 = 4; const grid = m.topGrid();
  const surf = (x, y) => grid.topAt(x, y);
  // The scallop profile along radial cross-sections of the dome: where each pass crosses the radial line (its
  // polyline cut exactly, the height interpolated), neighbours two by two.
  const heights = [];
  for (let k = 0; k < 24; k++) {
    const th = (2 * Math.PI * k) / 24; const u = [Math.cos(th), Math.sin(th)];
    const on = [];
    for (const pass of ringPasses) {
      for (let i = 0; i + 1 < pass.length; i++) {
        const a2 = pass[i]; const b2 = pass[i + 1];
        const da = -u[1] * a2[0] + u[0] * a2[1]; const db = -u[1] * b2[0] + u[0] * b2[1];
        if ((da > 0) === (db > 0) || da === db) continue;
        const f = da / (da - db);
        const q = [a2[0] + (b2[0] - a2[0]) * f, a2[1] + (b2[1] - a2[1]) * f, a2[2] + (b2[2] - a2[2]) * f];
        const t = u[0] * q[0] + u[1] * q[1];
        if (t > 3 && t < 18) on.push({ t, z: q[2] });
      }
    }
    on.sort((x, y) => x.t - y.t);
    for (let i = 0; i + 1 < on.length; i++) heights.push(cuspHeight([on[i].t, on[i].z + R4], [on[i + 1].t, on[i + 1].z + R4], R4, (t) => surf(u[0] * t, u[1] * t)));
  }
  assert.ok(heights.length > 50, `${heights.length} cusps`);
  heights.sort((x, y) => x - y);
  const med = heights[Math.floor(heights.length / 2)];
  assert.ok(Math.abs(med - 0.05) < 0.0075, `median cusp ${med}`);
  // Where the passes still follow the square outline they started from, a radial section crosses them aslant.
  assert.ok(heights[Math.floor(heights.length * 0.75)] < 0.05 * 1.3, `75th percentile ${heights[Math.floor(heights.length * 0.75)]}`);
});

test('scallop finishing: the height actually left is at most the one asked for everywhere on the dome, with no gouge', () => {
  // The left height measured as the part sees it: each surface point's distance to the nearest ball position
  // along every pass (clean-up passes included), less the radius — not a section through the passes.
  const dome = R.makeBox([-30, -30, 0], [30, 30, 10]).fuse(R.makeSphere(25).translate([0, 0, -5]).intersect(R.makeBox([-30, -30, 10], [30, 30, 40])));
  const m = machiningModel(dome.mesh({ tolerance: 0.01, angularTolerance: 0.05 }), { shape: dome });
  const st = defaultStock(m.bounds, { margin: 2, top: 1 });
  const c = camContext({ model: m, stock: st, tools, material: 'al-6061', features: recognizeFeatures(m, { stockTop: st.z1 }).features });
  const h = 0.05;
  const tp = generateToolpath(c, createOp('scallop', { id: 's', tool: 't6', scallop: h, sample: 0.5 }));
  const grid = m.topGrid();
  const left = scallopLeft(tp.passes, 4, (x, y) => grid.topAt(x, y), { step: 0.05 });
  let max = -Infinity; let min = Infinity; let n = 0;
  for (let r = 3; r <= 18; r += 0.11) for (let th = 0; th < 2 * Math.PI; th += 0.02) {
    const v = left.at(r * Math.cos(th), r * Math.sin(th));
    max = Math.max(max, v); min = Math.min(min, v); n++;
  }
  assert.ok(n > 40000, `${n} points`);
  assert.ok(max <= h * 1.02, `largest scallop ${max} for ${h}`);
  assert.ok(min > -0.012, `no gouge beyond the mesh's tolerance: ${min}`);
});

test('waterline: the shank keeps clear of an overhang exactly — a ball over a stem, its widest circle between levels', () => {
  // A 10 mm square stem with a sphere (r 12, centre z 30) on it: the sphere's lower half hangs over the stem. A ball
  // cutter (R 4) whose shank runs under the sphere's equator must stay outside the equator grown by R — 16 mm.
  const part = R.makeBox([-5, -5, 0], [5, 5, 30]).fuse(R.makeSphere(12).translate([0, 0, 30]));
  const m = machiningModel(part.mesh({ tolerance: 0.01, angularTolerance: 0.05 }), { shape: part });
  const st = defaultStock(m.bounds, { margin: 6, top: 1 });
  const c = camContext({ model: m, stock: st, tools, material: 'al-6061', features: recognizeFeatures(m, { stockTop: st.z1 }).features });
  const tp = generateToolpath(c, createOp('waterline', { id: 'w', tool: 't6', stepdown: 2.3 }));
  assert.equal(tp.exact, true, 'from the B-rep');
  const Rb = toolById('t6').d / 2;
  let checked = 0; let minR = Infinity;
  for (const mv of expandMoves(tp.moves)) {
    if (mv.k !== 'f') continue;
    const [x, y, z] = mv.p;
    if (z + Rb >= 30 - 1e-6 || z < 1) continue;               // the shank (from the ball's centre up) under the equator
    minR = Math.min(minR, Math.hypot(x, y)); checked++;
  }
  assert.ok(checked > 50, `${checked} moves under the overhang`);
  assert.ok(minR >= 12 + Rb - 1e-3, `closest approach ${minR} (needs ${12 + Rb})`);
});

test('gouges are judged on the B-rep: a coarse mesh of a bore makes none up, a real 0.1 mm cut into the wall is measured', () => {
  // A plate with a Ø20 bore, meshed coarsely: the mesh's chords stand inside the hole, so the mesh alone sees part
  // material where a cutter finishing the bore exactly runs. The solid decides.
  const plate = R.makeBox([-20, -20, 0], [20, 20, 10]).cut(R.makeCylinder(10, 20, [0, 0, -5], [0, 0, 1]));
  const coarse = plate.mesh({ tolerance: 0.1, angularTolerance: 0.5 });
  const stock = { kind: 'box', x0: -20, y0: -20, z0: 0, x1: 20, y1: 20, z1: 10 };
  const ring = (r, z) => Array.from({ length: 721 }, (_, i) => { const a = (2 * Math.PI * i) / 720; return [r * Math.cos(a), r * Math.sin(a), z]; });
  // A Ø8 flat end mill round the bore at depth: exactly on the wall (r 10 − 4), then 0.1 mm into it.
  const pathAt = (r) => ({ op: 'p', tool: 't3', moves: [{ k: 'r', p: [r, 0, 20] }, { k: 'r', p: [r, 0, 2] }, ...ring(r, 2).map((p) => ({ k: 'f', p, f: 500 }))] });
  const check = (model, r) => gougeCheck(simulateMilling(stock, [pathAt(r)], tools, { cell: 0.25 }), model, { tol: 0.02 });
  const meshOnly = machiningModel(coarse);
  const exact = machiningModel(coarse, { shape: plate });
  const onWallMesh = check(meshOnly, 6);
  const onWall = check(exact, 6);
  assert.ok(onWallMesh.count > 0, `the coarse mesh alone reports ${onWallMesh.count} gouges (the chords)`);
  assert.equal(onWall.count, 0, `on the solid: no gouge (max ${onWall.max})`);
  assert.ok(onWall.exact.confirmed > 0 && onWall.exact.cleared === onWall.exact.confirmed, JSON.stringify(onWall.exact));
  const into = check(exact, 6.1);
  assert.ok(into.count > 0, 'a cut into the wall is a gouge');
  assert.ok(Math.abs(into.max - 0.1) < 0.01, `its depth on the solid ${into.max} (0.1)`);
});
