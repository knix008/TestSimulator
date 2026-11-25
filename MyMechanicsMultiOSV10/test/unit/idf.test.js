// IDF import (cad/idf.js): the board file and library read, loops with arcs and circles, units (mm, thou), sides
// and rotations; the board and the packages built as extrusions with exact volumes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { regenerate } from '../../src/cad/features.js';
import { readIdfBoard, readIdfLibrary, idfModel, idfProject, loopItems, placementRotation } from '../../src/cad/idf.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const emn = readFileSync(new URL('../fixtures/idf/demo.emn', import.meta.url), 'utf8');
const emp = readFileSync(new URL('../fixtures/idf/demo.emp', import.meta.url), 'utf8');

test('readIdfBoard: header, thickness, outline and cutout loops, holes, keep-outs, placements', () => {
  const b = readIdfBoard(emn);
  assert.equal(b.version, 3); assert.equal(b.name, 'demo_board'); assert.equal(b.units, 1);
  assert.equal(b.thickness, 1.6);
  assert.deepEqual(b.outline.map((l) => [l.label, l.pts.length]), [[0, 6], [1, 2]]);
  assert.equal(b.holes.length, 2); assert.equal(b.holes[0].d, 3.2); assert.equal(b.holes[0].type, 'MTG');
  assert.equal(b.keepouts.length, 1); assert.equal(b.keepouts[0].kind, 'place_keepout'); assert.equal(b.keepouts[0].height, 3);
  assert.deepEqual(b.placements.map((p) => [p.refdes, p.side, p.rotation]), [['U1', 'top', 90], ['C1', 'top', 0], ['U2', 'bottom', 0], ['J9', 'top', 0]]);
  assert.equal(b.placements[0].partNo, 'LM358');
});

test('loopItems: a 90° arc has its centre on the inside of the turn; 360° is a circle about the previous point', () => {
  const [line, arc] = loopItems([{ x: 0, y: 0, angle: 0 }, { x: 90, y: 0, angle: 0 }, { x: 100, y: 10, angle: 90 }]);
  assert.equal(line.kind, 'line');
  assert.equal(arc.kind, 'arc3');
  const m = arc.pts[1];
  // On the circle about (90, 10) of radius 10, half way round.
  near(Math.hypot(m[0] - 90, m[1] - 10), 10); near(m[0], 90 + 10 * Math.SQRT1_2); near(m[1], 10 - 10 * Math.SQRT1_2);
  const [circle] = loopItems([{ x: 50, y: 40, angle: 0 }, { x: 56, y: 40, angle: 360 }]);
  assert.deepEqual(circle, { kind: 'circle', c: [50, 40], r: 6 });
});

test('readIdfLibrary: packages with heights in their own units (thou → mm), properties', () => {
  const lib = readIdfLibrary(emp);
  const soic = lib.get('SOIC8\u0000LM358');
  assert.equal(soic.height, 1.75); assert.equal(soic.loops[0].pts.length, 5); assert.equal(soic.props.CAPACITANCE, '0');
  const cap = lib.get('CAP_RAD');
  near(cap.height, 12); near(cap.loops[0].pts[1].x, 3.2);
});

test('placementRotation: top turns about Z; bottom is turned over about Y first', () => {
  const rot = (q, v) => {
    const [x, y, z, w] = q; const [vx, vy, vz] = v;
    const ix = w * vx + y * vz - z * vy; const iy = w * vy + z * vx - x * vz; const iz = w * vz + x * vy - y * vx; const iw = -x * vx - y * vy - z * vz;
    return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x].map((c) => Math.round(c * 1e9) / 1e9 + 0);
  };
  assert.deepEqual(rot(placementRotation(90, false), [1, 0, 0]), [0, 1, 0]);
  assert.deepEqual(rot(placementRotation(0, true), [1, 0, 0]), [-1, 0, 0]);
  assert.deepEqual(rot(placementRotation(0, true), [0, 0, 1]), [0, 0, -1]);
  assert.deepEqual(rot(placementRotation(90, true), [1, 0, 0]), [0, -1, 0]);
});

test('idfProject: the board (rounded corner, cutout, holes) and packages are exact extrusions; components placed by side', () => {
  const model = idfModel(readIdfBoard(emn), readIdfLibrary(emp));
  assert.deepEqual(model.missing, ['J9']);
  const p = idfProject(model);
  const asm = p.assemblies[0];
  assert.equal(p.active.kind, 'assembly');
  assert.deepEqual(asm.components.map((c) => c.name), ['demo_board<1>', 'U1', 'C1', 'U2']);
  const u1 = asm.components.find((c) => c.name === 'U1'); const u2 = asm.components.find((c) => c.name === 'U2');
  assert.deepEqual(u1.position, [20, 20, 1.6]); assert.deepEqual(u2.position, [20, 60, -0]);
  const vol = (part) => { const r = regenerate(part); return R.measureVolume(r.body); };
  const board = p.parts.find((x) => x.material === 'fr4');
  const area = 100 * 80 - (100 - Math.PI * 100 / 4) - Math.PI * 36 - 2 * Math.PI * 1.6 * 1.6;
  near(vol(board), area * 1.6, 1e-7);
  const soic = p.parts.find((x) => x.name === 'SOIC8');
  near(vol(soic), 4.9 * 3.9 * 1.75, 1e-7);
  const cap = p.parts.find((x) => x.name === 'CAP_RAD');
  near(vol(cap), Math.PI * 3.2 * 3.2 * 12, 1e-6);
});

test('readIdfBoard: THOU units and an IDF 2.0 header; a library-less board still builds', () => {
  const text = '.HEADER\nBOARD_FILE 2.0 "x" 2020/01/01.00:00:00 1\nb THOU\n.END_HEADER\n.BOARD_OUTLINE\n62.99213\n0 0 0 0\n0 1000 0 0\n0 1000 1000 0\n0 0 1000 0\n0 0 0 0\n.END_BOARD_OUTLINE\n';
  const b = readIdfBoard(text);
  assert.equal(b.version, 2); near(b.thickness, 1.6); near(b.outline[0].pts[1].x, 25.4);
  const p = idfProject(idfModel(b));
  near(R.measureVolume(regenerate(p.parts[0]).body), 25.4 * 25.4 * 1.6, 1e-7);
  assert.throws(() => readIdfBoard('.HEADER\nLIBRARY_FILE 3.0\n.END_HEADER\n'), /not an IDF board/);
});

test('export: board outline (arc corner, cutout, holes), placements and packages round-trip through IDF exactly', async () => {
  const { boardFromBody, packageFromBody, placementOf, writeIdfBoard, writeIdfLibrary } = await import('../../src/cad/idf-export.js');
  const p = idfProject(idfModel(readIdfBoard(emn), readIdfLibrary(emp)));
  const asm = p.assemblies[0];
  const bodyOf = (part) => regenerate(part).body;
  const boardPart = p.parts.find((x) => x.material === 'fr4');
  const board = boardFromBody(bodyOf(boardPart));
  // The round cutout comes back as a drilled hole of its size (the same board).
  assert.equal(board.thickness, 1.6);
  assert.deepEqual(board.holes.map((h) => Math.round(h.d * 1e6) / 1e6).sort(), [12, 3.2, 3.2]);
  assert.deepEqual(board.loops.map((l) => l.label), [0]);
  assert.equal(board.loops[0].pts.filter((q) => q.angle).length, 1);
  const pkgs = new Map();
  const placements = asm.components.filter((c) => c.part !== boardPart.id).map((c) => {
    const part = p.parts.find((x) => x.id === c.part);
    if (!pkgs.has(part.id)) pkgs.set(part.id, { pkg: part.name, partNo: part.partNo, ...packageFromBody(bodyOf(part)) });
    return { pkg: part.name, partNo: part.partNo, refdes: c.name, x: c.position[0], y: c.position[1], ...placementOf(c.position, c.rotation, board) };
  });
  assert.deepEqual(placements.map((x) => [x.refdes, x.side, x.rotation, x.offset]), [['U1', 'TOP', 90, 0], ['C1', 'TOP', 0, 0], ['U2', 'BOTTOM', 0, 0]]);
  const emn2 = writeIdfBoard({ name: 'demo', board, placements });
  const emp2 = writeIdfLibrary([...pkgs.values()]);
  const back = idfProject(idfModel(readIdfBoard(emn2), readIdfLibrary(emp2)));
  const vol = (part) => R.measureVolume(bodyOf(part));
  near(vol(back.parts.find((x) => x.material === 'fr4')), vol(boardPart), 1e-7);
  for (const name of ['SOIC8', 'CAP_RAD']) near(vol(back.parts.find((x) => x.name === name)), vol(p.parts.find((x) => x.name === name)), 1e-7);
  const pos = (pr) => pr.assemblies[0].components.map((c) => [c.name, ...c.position.map((v) => Math.round(v * 1e6) / 1e6 + 0), ...c.rotation.map((v) => Math.round(v * 1e6) / 1e6 + 0)]);
  assert.deepEqual(pos(back).slice(1), pos(p).slice(1));
});
