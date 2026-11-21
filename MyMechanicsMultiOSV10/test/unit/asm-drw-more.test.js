// Component patterns, mirror, smart mates and collision detection; drawing sheets, crop / break / broken-out views,
// hole and revision tables; curvature, zebra and thickness checks; buckling and fatigue studies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createAssembly } from '../../src/cad/document.js';
import { placePoint, quatFromAxisAngle, rotate } from '../../src/cad/assembly.js';
import { addComponentPattern, updatePatterns, removePattern, prunePatterns, mirroredPlacement, mirrorLocalAxis, smartMateFor, moveWithCollision, kernelCollisions, placedBox } from '../../src/cad/asm-more.js';
import { createDrawing, projectView, drawingSvg } from '../../src/cad/drawing.js';
import {
  sheetsOf, sheetDrawing, addSheet, renameSheet, deleteSheet, setActiveSheet, adoptToActiveSheet, activeSheetId, flattenPath, cropProjection, breakProjection, defaultBreak,
  adjustProjections, findHoles, holeTableRows, addRevision, removeRevision, nextRevision, sheetSvg, viewDepth,
} from '../../src/cad/drawing-more.js';
import { vertexCurvature, curvatureColours, zebraColours, thicknessAnalysis } from '../../src/cad/evaluate.js';
import { buckling, fatigue, snCurve, lifeAt, equivalentAlternating, damageColor } from '../../src/cad/fea-more.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6, what = '') => assert.ok(Math.abs(a - b) <= tol, `${what} ${a} ≉ ${b}`);
const nearV = (a, b, tol = 1e-6, what = '') => a.forEach((x, i) => near(x, b[i], tol, `${what}[${i}]`));
let ids = 0;
const newId = (p) => `${p}${++ids}`;

function asmWith(...placements) {
  const asm = createAssembly('A');
  asm.components = placements.map((pl, i) => ({ id: `c${i}`, part: 'p1', name: `Part<${i + 1}>`, position: pl.position ?? [0, 0, 0], rotation: pl.rotation ?? [0, 0, 0, 1], fixed: Boolean(pl.fixed) }));
  asm.mates ??= [];
  return asm;
}

// ───────────────────────── assembly

test('linear component pattern: 3 × 2 copies, follows its seed, removable', () => {
  const asm = asmWith({ fixed: true }, { position: [5, 0, 0] });
  const { pattern, components } = addComponentPattern(asm, ['c1'], { type: 'linear', dir: [1, 0, 0], spacing: 20, count: 3, dir2: [0, 0, 1], spacing2: 15, count2: 2 }, { newId });
  assert.equal(components.length, 5);
  const pos = components.map((c) => c.position.join(','));
  for (const p of ['25,0,0', '45,0,0', '5,0,15', '25,0,15', '45,0,15']) assert.ok(pos.includes(p), `${p} in ${pos}`);
  assert.ok(components.every((c) => c.fixed && c.pattern === pattern.id && c.part === 'p1'));
  assert.equal(new Set(asm.components.map((c) => c.name)).size, asm.components.length, 'names are unique');
  asm.components[1].position = [5, 10, 0];
  assert.equal(updatePatterns(asm), 5);
  assert.deepEqual(asm.components.find((c) => c.id === components[0].id).position, [25, 10, 0]);
  assert.deepEqual(removePattern(asm, pattern.id).length, 5);
  assert.equal(asm.components.length, 2);
  assert.equal(asm.patterns.length, 0);
});

test('circular component pattern: 4 copies evenly about the Y axis, turned with it', () => {
  const asm = asmWith({ position: [30, 0, 0] });
  const { components } = addComponentPattern(asm, ['c0'], { type: 'circular', axis: { point: [0, 0, 0], dir: [0, 1, 0] }, count: 4, angle: 360 }, { newId });
  assert.equal(components.length, 3);
  nearV(components[0].position, [0, 0, -30], 1e-9, '90°');
  nearV(components[1].position, [-30, 0, 0], 1e-9, '180°');
  nearV(components[2].position, [0, 0, 30], 1e-9, '270°');
  // A local point of the copy is where the seed's point goes when turned 90° about Y.
  nearV(placePoint(components[0], [1, 0, 0]), rotate(quatFromAxisAngle([0, 1, 0], 90), [31, 0, 0]), 1e-9, 'turned');
  // A partial arc: 3 copies over 90° → 0, 45, 90.
  const asm2 = asmWith({ position: [10, 0, 0] });
  const r2 = addComponentPattern(asm2, ['c0'], { type: 'circular', axis: { point: [0, 0, 0], dir: [0, 0, 1] }, count: 3, angle: 90 }, { newId });
  nearV(r2.components.at(-1).position, [0, 10, 0], 1e-9, '90° end');
});

test('mirror component: the copy is the mirror image of a part symmetric about its local plane', () => {
  const rot = quatFromAxisAngle([0.3, 1, 0.2], 37);
  const c = { position: [12, 3, -4], rotation: rot };
  const plane = { point: [0, 0, 0], normal: [1, 0, 0] };
  for (const k of [0, 1, 2]) {
    const m = mirroredPlacement(c, plane, k);
    const len = Math.hypot(...m.rotation);
    near(len, 1, 1e-9, 'unit quaternion');
    // Part symmetric about its local plane ⊥ axis k: local p and its reflection S_k p are both points of it.
    for (const p of [[1, 2, 3], [-4, 0.5, 2], [0, -3, 7]]) {
      const world = placePoint(c, p);
      const mirrored = [-world[0], world[1], world[2]];
      const sp = p.slice(); sp[k] = -sp[k];
      nearV(placePoint(m, sp), mirrored, 1e-9, `k=${k}`);
    }
  }
  assert.deepEqual(mirroredPlacement(c, plane, -1).rotation, rot, 'orientation kept');
  assert.equal(mirrorLocalAxis({ rotation: [0, 0, 0, 1] }, [1, 0, 0], 'auto') !== 0, true, 'auto picks an axis in the mirror plane');
  const asm = asmWith({ position: [20, 0, 0] });
  const { components } = addComponentPattern(asm, ['c0'], { type: 'mirror', plane, orientation: 'auto' }, { newId });
  near(components[0].position[0], -20, 1e-9);
  asm.components[0].position = [25, 0, 0];
  updatePatterns(asm);
  near(asm.components[1].position[0], -25, 1e-9, 'follows the seed');
  asm.components = asm.components.filter((x) => x.id !== 'c0');
  prunePatterns(asm);
  assert.equal(asm.components.length, 0, 'copies go with their seed');
});

test('smart mates: cylinders → concentric, planes → coincident with the alignment they have', () => {
  const axis = { kind: 'axis', point: [0, 0, 0], dir: [0, 0, 1] };
  const up = { kind: 'plane', point: [0, 0, 0], dir: [0, 0, 1] };
  const down = { kind: 'plane', point: [0, 0, 5], dir: [0, 0, -1] };
  assert.deepEqual(smartMateFor(axis, axis), { type: 'concentric', aligned: 'anti' });
  assert.deepEqual(smartMateFor(up, down), { type: 'coincident', aligned: 'anti' });
  assert.deepEqual(smartMateFor(up, up), { type: 'coincident', aligned: 'aligned' });
  const flipped = { position: [0, 0, 0], rotation: quatFromAxisAngle([1, 0, 0], 180) };
  assert.equal(smartMateFor(up, up, { position: [0, 0, 0], rotation: [0, 0, 0, 1] }, flipped).aligned, 'anti', 'uses the current placement');
  assert.equal(smartMateFor(axis, up).type, 'coincident');
  assert.equal(smartMateFor(null, up), null);
});

test('collision detection: a move stops at the last free step, or carries on and reports the contact', () => {
  const make = () => asmWith({ position: [0, 0, 0], fixed: true }, { position: [-30, 0, 0] });
  // 10 mm cubes centred on the positions: they touch when |dx| ≤ 10.
  const collides = (asm) => (Math.hypot(...asm.components[1].position.map((v, i) => v - asm.components[0].position[i])) <= 10 ? ['c0'] : []);
  const a = make();
  const r = moveWithCollision(a, ['c1'], { translate: [40, 0, 0] }, collides, { steps: 8, mode: 'stop' });
  assert.equal(r.stopped, true);
  assert.deepEqual(r.hits, ['c0']);
  near(a.components[1].position[0], -15, 1e-9, 'stopped before contact');
  const b = make();
  const r2 = moveWithCollision(b, ['c1'], { translate: [40, 0, 0] }, collides, { steps: 8, mode: 'highlight' });
  assert.equal(r2.stopped, false);
  assert.deepEqual(r2.hits, ['c0']);
  near(b.components[1].position[0], 10, 1e-9, 'full move');
  const c = make();
  const r3 = moveWithCollision(c, ['c1'], { rotate: { axis: [0, 0, 1], degrees: 90, point: [0, 0, 0] } }, collides, { steps: 6 });
  assert.equal(r3.stopped, false, 'turning about the far pivot never comes within reach');
  nearV(c.components[1].position, [0, -30, 0], 1e-9);
  assert.equal(moveWithCollision(make(), ['c0'], { translate: [5, 0, 0] }, collides).steps, 0, 'fixed components do not move');
});

test('collision detection on the kernel: a box slid into another stops at contact', () => {
  const box = R.makeBox([-5, -5, -5], [5, 5, 5]);
  const asm = asmWith({ position: [0, 0, 0], fixed: true }, { position: [-40, 0, 0] });
  const local = [[-5, -5, -5], [5, 5, 5]];
  const shapeOf = (c) => box.clone().translate(c.position);
  const collides = (a) => kernelCollisions(a, ['c1'], { shapeOf, distance: (s, t) => R.measureDistanceBetween(s, t), boxOf: (c) => placedBox(local, c), tolerance: 0.01 });
  assert.deepEqual(collides(asm), []);
  const r = moveWithCollision(asm, ['c1'], { translate: [40, 0, 0] }, collides, { steps: 40 });
  assert.equal(r.stopped, true);
  assert.ok(asm.components[1].position[0] <= -10 && asm.components[1].position[0] > -12, `${asm.components[1].position[0]}`);
});

// ───────────────────────── drawings

const block = () => R.makeBox([-50, -25, 0], [50, 25, 20]).cut(R.makeCylinder(10, 40, [0, 0, -10], [0, 0, 1])).cut(R.makeCylinder(4, 40, [30, 10, -10], [0, 0, 1]));

test('sheets: add, rename, switch, delete; each sheet shows only its views and tables', () => {
  const d = createDrawing({ id: 'd1', name: 'D', source: { kind: 'part', id: 'p' } });
  assert.equal(sheetsOf(d).length, 1);
  assert.equal(sheetDrawing(d).views.length, 4);
  const s2 = addSheet(d, 'Details', 'sh2');
  assert.equal(activeSheetId(d), 'sh2');
  assert.equal(sheetDrawing(d).views.length, 0, 'a new sheet is empty');
  d.views.push({ id: 'v9', type: 'front' });
  d.annotations.push({ id: 'a1', kind: 'note', x: 1, y: 1, text: 'x' });
  assert.equal(adoptToActiveSheet(d), 2);
  assert.deepEqual(sheetDrawing(d).views.map((v) => v.id), ['v9']);
  renameSheet(d, s2.id, 'Detail sheet');
  assert.equal(sheetsOf(d)[1].name, 'Detail sheet');
  setActiveSheet(d, sheetsOf(d)[0].id);
  assert.equal(sheetDrawing(d).views.length, 4);
  assert.equal(sheetDrawing(d).annotations.length, 0);
  assert.equal(deleteSheet(d, 'sh2'), true);
  assert.equal(d.views.length, 4);
  assert.equal(d.annotations.length, 0);
  assert.equal(deleteSheet(d, sheetsOf(d)[0].id), false, 'the last sheet stays');
});

test('SVG arcs are flattened onto the circle', () => {
  const polys = flattenPath('M 10 0 A 10 10 0 0 0 -10 0 A 10 10 0 0 0 10 0 Z');
  assert.equal(polys.length, 1);
  assert.ok(polys[0].length > 20);
  for (const [x, y] of polys[0]) near(Math.hypot(x, y), 10, 1e-6, 'radius');
  assert.ok(polys[0].some(([, y]) => y > 9) && polys[0].some(([, y]) => y < -9), 'both halves');
});

test('crop view keeps only the rectangle; break view shortens the view but dimensions show the true length', () => {
  const shape = block();
  const p = projectView(shape, 'front');
  const c = cropProjection(p, { x0: -50, y0: -25, x1: 0, y1: 25 });
  assert.ok(c.box.x1 <= 1e-6 && c.box.x0 < -49);
  for (const d of [...c.visible, ...c.hidden]) for (const poly of flattenPath(d)) for (const [x] of poly) assert.ok(x <= 1e-6, `x ${x} inside the crop`);
  assert.ok(c.visible.length > 0);
  const span = defaultBreak(p.box);
  assert.equal(span.axis, 'x');
  const b = breakProjection(p, span);
  near(b.trueW, 100, 1e-3);
  assert.ok(b.box.x1 - b.box.x0 < 50, 'shortened');
  assert.equal(b.breaks.length, 1);
  for (const d of b.visible) for (const poly of flattenPath(d)) for (const [x] of poly) assert.ok(x <= b.box.x1 + 1e-6);
  assert.equal(b.map2(0, 0), null, 'the middle is gone');
  near(b.map2(45, 0)[0], 45 - (span.to - span.from - b.breaks[0].gap), 1e-9);
  // On the sheet: the dimension under the broken view still reads 100.
  const d = createDrawing({ id: 'd2', name: 'D', source: { kind: 'part', id: 'p' } });
  d.views = [{ id: 'v-front', type: 'front', break: span }];
  const adj = adjustProjections(d, new Map([['v-front', p]]));
  const svg = sheetSvg(d, adj, {});
  assert.match(svg, />100<\/text>/);
  assert.match(svg, /class="break-line"/);
});

test('broken-out section: material over the region is removed to the depth, the cut is hatched', () => {
  const shape = block();
  const d = createDrawing({ id: 'd3', name: 'D', source: { kind: 'part', id: 'p' } });
  near(viewDepth(shape, { type: 'front' }), 20, 1e-6);
  d.views = [{ id: 'v-front', type: 'front', brokenOut: { x0: -45, y0: -10, x1: -20, y1: 10, depth: 10 } }];
  const p = projectView(shape, 'front');
  const adj = adjustProjections(d, new Map([['v-front', p]]), { shape, key: 'k', cache: new Map() });
  const q = adj.get('v-front');
  assert.ok(q.brokenOut);
  const area = q.brokenOut.triangles.reduce((s, t) => s + Math.abs((t[2] - t[0]) * (t[5] - t[1]) - (t[4] - t[0]) * (t[3] - t[1])) / 2, 0);
  near(area, 25 * 20, 1, 'hatched area = region');
  const svg = sheetSvg(d, adj, {});
  assert.match(svg, /class="brokenout-line"/);
  assert.match(svg, /class="hatch"/);
  assert.ok(R.measureVolume(shape) > 0, 'the model itself is untouched');
});

test('hole table: holes seen end-on, tagged, located from the lower-left corner', () => {
  const shape = block();
  const holes = findHoles(shape);
  assert.equal(holes.length, 2);
  const p = projectView(shape, 'front');
  const rows = holeTableRows(holes, { type: 'front' }, p.box);
  assert.deepEqual(rows.map((r) => r.tag), ['A1', 'A2']);
  near(rows[0].x, 50, 1e-3); near(rows[0].y, 25, 1e-3); near(rows[0].diameter, 20, 1e-3);
  near(rows[1].x, 80, 1e-3); near(rows[1].y, 35, 1e-3); near(rows[1].diameter, 8, 1e-3);
  assert.equal(holeTableRows(holes, { type: 'top' }, p.box).length, 0, 'not seen end-on from the top');
  const d = createDrawing({ id: 'd4', name: 'D', source: { kind: 'part', id: 'p' } });
  d.views = [{ id: 'v-front', type: 'front' }];
  d.holeTable = { view: 'v-front' };
  const svg = sheetSvg(d, new Map([['v-front', p]]), { holeRows: rows, labels: { 'holeTable.title': 'HOLES' } });
  assert.match(svg, /HOLES/);
  assert.match(svg, /⌀20/);
  assert.match(svg, /class="hole-tag">A2</);
});

test('revision table: rows A, B …; the title block follows the latest; drawn on its sheet only', () => {
  const d = createDrawing({ id: 'd5', name: 'D', source: { kind: 'part', id: 'p' } });
  assert.equal(nextRevision([]), 'A');
  addRevision(d, { description: 'First issue', date: '2026-01-01', by: 'SK' });
  addRevision(d, { description: 'Hole moved', date: '2026-02-01', by: 'SK' });
  assert.deepEqual(d.revisions.map((r) => r.rev), ['A', 'B']);
  assert.equal(d.title.revision, 'B');
  const svg = sheetSvg(d, new Map(), {});
  assert.match(svg, /Hole moved/);
  assert.match(svg, /class="revision-table"/);
  addSheet(d, 'Two', 'sh2');
  assert.doesNotMatch(sheetSvg(d, new Map(), {}), /revision-table/, 'not on the second sheet');
  removeRevision(d, 'B');
  assert.equal(d.title.revision, 'A');
  // Without any of the new fields the sheet is exactly the plain drawing.
  const plain = createDrawing({ id: 'd6', name: 'D', source: { kind: 'part', id: 'p' } });
  assert.equal(sheetSvg(plain, new Map(), {}), drawingSvg(sheetDrawing(plain), new Map(), {}));
});

// ───────────────────────── evaluate

const meshOf = (s) => s.mesh({ tolerance: 0.05, angularTolerance: 0.1 });

test('curvature display: a cylinder of radius 10 reads 1/10 on its side and 0 on its ends', () => {
  const m = meshOf(R.makeCylinder(10, 30, [0, 0, 0], [0, 0, 1]));
  const { curvature, max } = vertexCurvature(m);
  near(max, 0.1, 0.01, 'max');
  let side = 0; let flat = 0;
  for (let i = 0; i < curvature.length; i++) {
    const z = m.vertices[3 * i + 2]; const nz = m.normals[3 * i + 2];
    if (Math.abs(nz) > 0.99) { near(curvature[i], 0, 1e-6, 'end cap'); flat++; } else { near(curvature[i], 0.1, 0.01, `side z=${z}`); side++; }
  }
  assert.ok(side > 10 && flat > 10);
  const hole = meshOf(R.makeBox([-20, -20, 0], [20, 20, 10]).cut(R.makeCylinder(5, 30, [0, 0, -10], [0, 0, 1])));
  assert.ok(Math.min(...vertexCurvature(hole).curvature) < -0.18, 'a hole is concave (negative)');
  const { colors } = curvatureColours(m, { size: 40 });
  assert.equal(colors.length, m.vertices.length);
});

test('zebra stripes: one shade on a flat face, both shades on a cylinder, and they move with the view', () => {
  const box = meshOf(R.makeBox([0, 0, 0], [10, 10, 10]));
  const z1 = zebraColours(box, { view: [0.3, 0.4, 1] });
  const byNormal = new Map();
  for (let i = 0; i < box.vertices.length / 3; i++) {
    const key = [0, 1, 2].map((k) => Math.round(box.normals[3 * i + k])).join(',');
    const c = z1.colors[3 * i];
    if (byNormal.has(key)) assert.equal(byNormal.get(key), c, 'flat face is one shade'); else byNormal.set(key, c);
  }
  const cyl = meshOf(R.makeCylinder(10, 30, [0, 0, 0], [0, 0, 1]));
  const z2 = zebraColours(cyl, { view: [1, 0, 0], up: [0, 1, 0], stripes: 12 });
  const shades = new Set(Array.from(z2.colors));
  assert.ok(shades.has(Math.fround(0.96)) && shades.has(Math.fround(0.06)), 'black and white stripes');
  const z3 = zebraColours(cyl, { view: [1, 0.5, 0], up: [0, 1, 0], stripes: 12 });
  assert.notDeepEqual(Array.from(z2.colors), Array.from(z3.colors));
});

test('thickness analysis: a 4 mm plate is 4 thick; under the threshold it is flagged red', () => {
  const m = meshOf(R.makeBox([0, 0, 0], [60, 40, 4]));
  const r = thicknessAnalysis(m, { threshold: 5 });
  near(r.min, 4, 1e-3, 'min');
  near(r.max, 60, 1e-3, 'max');
  for (let i = 0; i < m.vertices.length / 3; i++) if (Math.abs(m.normals[3 * i + 2]) > 0.99) near(r.thickness[i], 4, 1e-3, 'plate face');
  assert.ok(r.thin > 0);
  const red = [];
  for (let i = 0; i < r.thickness.length; i++) if (r.thickness[i] < 5) red.push(r.colors[3 * i] > 0.8 && r.colors[3 * i + 1] < 0.3);
  assert.ok(red.length && red.every(Boolean));
  const thick = thicknessAnalysis(m, { threshold: 3 });
  assert.equal(thick.thin, 0);
  // A tube: the wall (outer 10, inner 8) is 2 mm thick through the side.
  const tube = meshOf(R.makeCylinder(10, 20, [0, 0, 0], [0, 0, 1]).cut(R.makeCylinder(8, 40, [0, 0, -10], [0, 0, 1])));
  const t = thicknessAnalysis(tube, { threshold: 1 });
  near(t.min, 2, 0.05, 'tube wall');
});

// ───────────────────────── simulation

function boxMesh(L, W, H, div = 4) {
  const vertices = []; const triangles = []; const faceGroups = [];
  const faces = [[[0, 0, 0], [0, 0, H], [0, W, 0], 0], [[L, 0, 0], [0, W, 0], [0, 0, H], 1], [[0, 0, 0], [L, 0, 0], [0, 0, H], 2], [[0, W, 0], [0, 0, H], [L, 0, 0], 3], [[0, 0, 0], [0, W, 0], [L, 0, 0], 4], [[0, 0, H], [L, 0, 0], [0, W, 0], 5]];
  for (const [org, a, b, faceId] of faces) {
    const base = vertices.length / 3; const start = triangles.length;
    for (let j = 0; j <= div; j++) for (let i = 0; i <= div; i++) vertices.push(...org.map((o, c) => o + (a[c] * i) / div + (b[c] * j) / div));
    for (let j = 0; j < div; j++) for (let i = 0; i < div; i++) { const p = base + j * (div + 1) + i; triangles.push(p, p + 1, p + div + 2, p, p + div + 2, p + div + 1); }
    faceGroups.push({ start, count: triangles.length - start, faceId });
  }
  return { vertices: Float32Array.from(vertices), triangles: Uint32Array.from(triangles), faceGroups };
}
const STEEL = { E: 210000, nu: 0.3, yield: 250, density: 7850 };

test('buckling: a 200 mm cantilever column 10 × 10 under 1 kN agrees with Euler; tension gives a negative factor', () => {
  const euler = (Math.PI ** 2 * 210000 * (10 ** 4 / 12)) / (4 * 200 * 200);   // N
  const r = buckling(boxMesh(200, 10, 10), { material: STEEL, fixtures: [0], loads: [{ faceId: 1, force: [-1000, 0, 0] }], resolution: 40, modes: 2 });
  assert.equal(r.ok, true, r.error);
  assert.ok(r.loadFactor > 0);
  const ratio = r.loadFactor / (euler / 1000);
  assert.ok(ratio > 0.95 && ratio < 1.2, `load factor ${r.loadFactor} vs Euler ${euler / 1000} (voxels are a little stiff)`);
  near(r.loadFactors[1], r.loadFactors[0], 1e-3 * r.loadFactor, 'square section: two equal modes');
  assert.equal(r.modes[0].length, boxMesh(200, 10, 10).vertices.length);
  const r2 = buckling(boxMesh(200, 10, 10), { material: STEEL, fixtures: [0], loads: [{ faceId: 1, force: [-2000, 0, 0] }], resolution: 40 });
  near(r2.loadFactor, r.loadFactor / 2, 1e-3 * r.loadFactor, 'twice the load, half the factor');
  const t = buckling(boxMesh(200, 10, 10), { material: STEEL, fixtures: [0], loads: [{ faceId: 1, force: [1000, 0, 0] }], resolution: 40 });
  assert.ok(t.loadFactor < 0, 'tension: buckles only reversed');
  assert.equal(buckling(boxMesh(200, 10, 10), { material: STEEL, fixtures: [], loads: [] }).error, 'no-fixtures');
});

test('fatigue: S-N curve, Goodman correction and damage from the static stress', () => {
  const steel = snCurve({ yield: 351, ultimate: 420, group: 'steel' });
  near(steel.su, 420); near(steel.se, 210);
  near(lifeAt(0.9 * 420, steel), 1e3, 1e-6);
  near(lifeAt(210.0001, steel), 1e6, 50);
  assert.equal(lifeAt(200, steel), Infinity, 'below the endurance limit');
  const mid = lifeAt(Math.sqrt(0.9 * 420 * 210), steel);
  near(Math.log10(mid), 4.5, 1e-6, 'log-log straight line');
  const al = snCurve({ yield: 276, group: 'aluminium' });
  assert.ok(Number.isFinite(lifeAt(0.3 * al.su, al)), 'aluminium has no endurance limit');
  near(equivalentAlternating(100, 'reversed', 400), 100);
  near(equivalentAlternating(100, 'zeroBased', 400), 50 / (1 - 50 / 400));
  const stat = { vertexStress: Float32Array.from([0, 100, 300, 400]) };
  const f = fatigue(stat, { material: { yield: 351, ultimate: 420, group: 'steel' }, loading: 'reversed', cycles: 1e5 });
  assert.equal(f.vertexLife[0], Infinity);
  assert.equal(f.vertexDamage[1], 0);
  assert.ok(f.vertexDamage[3] > 1, 'fails before 1e5 cycles');
  near(f.minLife, f.vertexLife[3]);
  near(f.factorOfSafety, 210 / 400, 1e-6);
  assert.deepEqual(damageColor(0).map((x) => x > 0), [true, true, true]);
  assert.ok(damageColor(2)[0] > 0.9 && damageColor(2)[1] < 0.2, 'red at failure');
});
