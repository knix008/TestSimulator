// Projects, history, assembly maths (no kernel) and drawing helpers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createPart, createAssembly, documentsOf, findDocument, History, packProject, unpackProject, normalizeProject, addDrawing } from '../../src/cad/document.js';
import { quatFromAxisAngle, quatToAxisAngle, rotate, placePoint, solveMates, matesFor, quatIdentity } from '../../src/cad/assembly.js';
import { pathPolylines, scaleLabel, layoutViews, createDrawing, drawingSvg, drawingDxf } from '../../src/cad/drawing.js';
import { MATERIALS, massOf, materialOf } from '../../src/cad/materials.js';
import { levenbergMarquardt, nullSpaceInfo, solveLinear } from '../../src/cad/solver.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test('a new project holds one part and opens it', () => {
  const p = createProject({ name: 'P', kind: 'part' });
  assert.equal(p.parts.length, 1);
  assert.deepEqual(p.active, { kind: 'part', id: p.parts[0].id });
  const a = createProject({ kind: 'assembly' });
  assert.equal(a.assemblies.length, 1);
  assert.equal(findDocument(a, a.active), a.assemblies[0]);
});

test('save and open keep everything; foreign files are refused', () => {
  const p = createProject({ name: 'Round trip' });
  p.parts.push(createPart('Second'));
  p.assemblies.push(createAssembly('A'));
  addDrawing(p, { kind: 'part', id: p.parts[0].id }, 'D');
  const again = unpackProject(packProject(p, { thumbnail: 'data:image/png;base64,AA' }));
  assert.equal(documentsOf(again).length, 4);
  assert.equal(again.thumbnail, 'data:image/png;base64,AA');
  assert.throws(() => unpackProject('{"format":"other"}'), (e) => e.code === 'bad-file');
  assert.throws(() => unpackProject('not json'), (e) => e.code === 'bad-file');
  const fixed = normalizeProject({ parts: [{ name: 'x' }], active: { kind: 'part', id: 'missing' } });
  assert.equal(fixed.active.id, fixed.parts[0].id);
});

test('history: undo and redo whole project snapshots, unchanged commits are ignored', () => {
  const p = createProject({ name: 'H' });
  const h = new History(p);
  assert.equal(h.canUndo, false);
  p.parts[0].material = 'brass';
  assert.equal(h.commit(p, 'material'), true);
  assert.equal(h.commit(p, 'again'), false);
  const back = h.undo();
  assert.equal(back.project.parts[0].material, 'steel-1020');
  assert.equal(back.label, 'material');
  assert.equal(h.redo().project.parts[0].material, 'brass');
});

test('quaternions: axis-angle round trip and rotation', () => {
  const q = quatFromAxisAngle([0, 1, 0], 90);
  const r = rotate(q, [1, 0, 0]);
  near(r[0], 0); near(r[2], -1);
  const { axis, angle } = quatToAxisAngle(q);
  near(angle, 90); near(axis[1], 1);
  const p = placePoint({ position: [10, 0, 0], rotation: q }, [1, 0, 0]);
  near(p[0], 10); near(p[2], -1);
});

test('mates: coincident planes and concentric axes position a free component', () => {
  const asm = createAssembly('A');
  asm.components = [
    { id: 'a', part: 'p', position: [0, 0, 0], rotation: quatIdentity(), fixed: true },
    { id: 'b', part: 'p', position: [30, 40, -20], rotation: quatFromAxisAngle([1, 1, 0], 20), fixed: false },
  ];
  // Part frame: top face plane y = 10 (normal +y), bottom y = 0 (normal −y), a bore along y through (5, 0, 5).
  const top = { kind: 'plane', point: [0, 10, 0], dir: [0, 1, 0] };
  const bottom = { kind: 'plane', point: [0, 0, 0], dir: [0, -1, 0] };
  const bore = { kind: 'axis', point: [5, 0, 5], dir: [0, 1, 0] };
  asm.mates = [
    { id: 'm1', type: 'coincident', a: { comp: 'a', ...top }, b: { comp: 'b', ...bottom } },
    { id: 'm2', type: 'concentric', a: { comp: 'a', ...bore }, b: { comp: 'b', ...bore } },
  ];
  const r = solveMates(asm, { size: 50 });
  assert.deepEqual(r.failed, []);
  const b = asm.components[1];
  near(placePoint(b, [0, 0, 0])[1], 10, 1e-5);
  const axisPoint = placePoint(b, [5, 0, 5]);
  near(axisPoint[0], 5, 1e-5); near(axisPoint[2], 5, 1e-5);
  // Rotation about the shared axis is still free: not fully defined.
  assert.equal(r.status.get('b'), 'under');
  assert.deepEqual(matesFor(top, bottom), ['coincident', 'parallel', 'perpendicular', 'distance', 'angle']);
  assert.deepEqual(matesFor(bore, bore)[0], 'concentric');
});

test('a mate that cannot hold is reported', () => {
  const asm = createAssembly('A');
  asm.components = [
    { id: 'a', part: 'p', position: [0, 0, 0], rotation: quatIdentity(), fixed: true },
    { id: 'b', part: 'p', position: [0, 0, 0], rotation: quatIdentity(), fixed: true },
  ];
  asm.mates = [{ id: 'm', type: 'distance', value: 5, a: { comp: 'a', kind: 'plane', point: [0, 0, 0], dir: [0, 1, 0] }, b: { comp: 'b', kind: 'plane', point: [0, 0, 0], dir: [0, -1, 0] } }];
  assert.deepEqual(solveMates(asm).failed, ['m']);
});

test('solver: linear solve, least squares and rank', () => {
  const x = solveLinear([[2, 1], [1, 3]], [3, 5]);
  near(x[0], 0.8); near(x[1], 1.4);
  const r = levenbergMarquardt(([a, b]) => [a + b - 3, a - b - 1], [0, 0]);
  assert.ok(r.ok); near(r.x[0], 2, 1e-6); near(r.x[1], 1, 1e-6);
  const info = nullSpaceInfo([[1, 0, 0], [0, 1, 0]], 3);
  assert.equal(info.rank, 2);
  assert.deepEqual(info.fixed, [true, true, false]);
});

test('drawings: SVG paths to polylines, scale labels, layout and output without a kernel', () => {
  const lines = pathPolylines('M 0 0 L 10 0 L 10 -5 Z M 1 1 C 2 2 3 3 4 4');
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0].at(-1), [0, 0]);
  assert.equal(scaleLabel(0.5), '1:2');
  assert.equal(scaleLabel(2), '2:1');
  const d = createDrawing({ id: 'd', name: 'D', source: { kind: 'part', id: 'p' } });
  const box = (w, h) => ({ visible: ['M 0 0 L 1 1'], hidden: [], box: { x0: 0, y0: 0, x1: w, y1: h } });
  const projections = new Map([['v-front', box(400, 100)], ['v-top', box(400, 80)], ['v-right', box(80, 100)], ['v-iso', box(300, 200)]]);
  const { scale, places } = layoutViews(d, projections);
  assert.ok(scale < 1, 'a 400 mm part is scaled down on A3');
  assert.ok(places.get('v-top').cy < places.get('v-front').cy, 'third angle: top view above the front view');
  assert.ok(places.get('v-right').cx > places.get('v-front').cx, 'third angle: right view to the right');
  d.projection = 'first';
  const first = layoutViews(d, projections);
  assert.ok(first.places.get('v-top').cy > first.places.get('v-front').cy, 'first angle: top view below');
  assert.match(drawingSvg(d, projections), /class="title-block"/);
  assert.match(drawingDxf(d, projections), /VISIBLE/);
});

test('materials: masses from densities', () => {
  assert.ok(MATERIALS.length >= 16);
  near(massOf(1e6, 'steel-1020'), 7.9);
  assert.equal(materialOf('missing').id, MATERIALS[0].id);
});
