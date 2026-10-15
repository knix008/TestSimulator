// FreeCAD's Std commands: the domain parts (units, variables, groups, links,
// the dependency graph, transforms and alignment, materials, the PDF writer).
import assert from 'node:assert/strict';
import test from 'node:test';
import { convertUnit, formatVariables, parseVariables, randomColor } from '../../src/commands/std.js';
import { groupTree, normalizeGroups, normalizeTextDocs, normalizeVarSets, normalizeViews, variableScope } from '../../src/domain/docextras.js';
import { dependencyEdges, graphSvg } from '../../src/domain/depgraph.js';
import { apply, bestFit, eulerOf, rotationOf, transformPlacement } from '../../src/domain/transform3d.js';
import { MATERIALS, massOf, normalizeMaterial } from '../../src/domain/materials.js';
import { buildPdf } from '../../src/domain/pdf.js';
import { instancesOf } from '../../src/view/modeltree.js';
import { addEntity, createDrawing, isLocked, isVisible, normalizeDrawing } from '../../src/domain/drawing.js';
import { syncClones } from '../../src/domain/clones.js';
import { normalizeEntity, transformEntity } from '../../src/domain/entities.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('units calculator: lengths, angles, pressures and temperatures (offset scales)', () => {
  near(convertUnit('length', 1, 'in', 'mm'), 25.4);
  near(convertUnit('length', 1, 'mi', 'km'), 1.609344);
  near(convertUnit('angle', Math.PI, 'rad', 'deg'), 180);
  near(convertUnit('pressure', 1, 'MPa', 'psi'), 145.0377377, 1e-6);
  near(convertUnit('temperature', 100, '°C', '°F'), 212);
  near(convertUnit('temperature', 0, 'K', '°C'), -273.15);
  assert.ok(Number.isNaN(convertUnit('length', 1, 'mm', 'kg')));
});

test('variable sets: "name = value unit" lines, bad lines reported; names in expressions', () => {
  const { variables, errors } = parseVariables('thickness = 4 mm\n# a comment\nwidth = 25\n2bad = 3\nangle = -1.5e1 deg');
  assert.deepEqual(variables, [{ name: 'thickness', value: 4, unit: 'mm' }, { name: 'width', value: 25, unit: '' }, { name: 'angle', value: -15, unit: 'deg' }]);
  assert.deepEqual(errors, [4]);
  assert.equal(formatVariables(variables), 'thickness = 4 mm\nwidth = 25\nangle = -15 deg');
  const sets = normalizeVarSets([{ id: 'v1', name: 'Plate', variables }, { name: 'no id' }]);
  assert.equal(sets.length, 1);
  assert.deepEqual(variableScope({ varSets: sets }), { thickness: 4, 'Plate.thickness': 4, width: 25, 'Plate.width': 25, angle: -15, 'Plate.angle': -15 });
});

test('random colours are readable hex colours', () => {
  let seed = 1;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 50; i++) assert.match(randomColor(random), /^#[0-9a-f]{6}$/);
});

test('groups: parents that loop or are missing become top-level; hidden groups hide their members (and sub-groups)', () => {
  const groups = normalizeGroups([{ id: 'a', name: 'A', parent: 'b' }, { id: 'b', name: 'B', parent: 'a' }, { id: 'c', name: 'C', parent: 'zz' }, { id: 'd', parent: 'c', hidden: true }, { name: 'no id' }]);
  assert.equal(groups.length, 4);
  assert.ok(groups.some((g) => g.parent === null && (g.id === 'a' || g.id === 'b')), 'the loop is broken');
  assert.equal(groups.find((g) => g.id === 'c').parent, null);
  const d = createDrawing({ title: 'Groups' });
  d.groups = normalizeGroups([{ id: 'p', name: 'Parent', hidden: true }, { id: 'k', name: 'Kid', parent: 'p' }]);
  const line = addEntity(d, 'line', { x1: 0, y1: 0, x2: 1, y2: 1, group: 'k' });
  const free = addEntity(d, 'line', { x1: 0, y1: 0, x2: 1, y2: 1 });
  assert.equal(isVisible(d, line), false);
  assert.equal(isVisible(d, free), true);
  assert.deepEqual([...groupTree(d, 'p')].sort(), ['k', 'p']);
  const hidden = normalizeEntity({ type: 'line', x1: 0, y1: 0, x2: 1, y2: 1, hidden: true, unselectable: true, transparency: 140 });
  assert.equal(isVisible(d, hidden), false);
  assert.equal(isLocked(d, hidden), true);
  assert.equal(hidden.transparency, 100);
});

test('the document extras survive a save: groups, views, working view, variable sets, text documents', () => {
  const camera = { position: [1, 2, 3], target: [0, 0, 0], up: [0, 0, 1], projection: 'ortho', zoom: 2 };
  const raw = { title: 'X', entities: [], groups: [{ id: 'g', name: 'G', part: true, placement: { x: 5 } }], views: [{ name: 'V', camera }, { name: 'bad', camera: {} }], workingView: camera, varSets: [{ id: 's', name: 'S', variables: [{ name: 'a', value: 1 }] }], textDocs: [{ id: 't', name: 'Notes', text: 'hi' }] };
  const d = normalizeDrawing(raw);
  assert.equal(d.groups[0].placement.x, 5);
  assert.equal(d.views.length, 1);
  assert.equal(d.workingView.projection, 'ortho');
  assert.equal(d.varSets[0].variables[0].name, 'a');
  assert.equal(d.textDocs[0].text, 'hi');
  assert.deepEqual(normalizeViews([{ camera: { position: [1, 1], target: [0, 0, 0] } }]), []);
  assert.deepEqual(normalizeTextDocs([{ name: 'no id' }]), []);
});

test('links: an external link uses its kept copy; a frozen clone keeps its shape; instances share a source', () => {
  const d = createDrawing({ title: 'Links' });
  const source = { id: 'far', type: 'circle', cx: 0, cy: 0, r: 5, layer: '0' };
  addEntity(d, 'circle', { cx: 0, cy: 0, r: 5, clone: { of: 'far', cx: 0, cy: 0, dx: 10, dy: 0, link: true, external: { file: 'other.mcad', title: 'Other', cache: source } } });
  syncClones(d, { transformEntity, normalizeEntity });
  const link = d.entities[0];
  assert.equal(link.cx, 10, 'the kept copy, moved by the link');
  assert.equal(link.clone.external.title, 'Other');
  const own = addEntity(d, 'circle', { cx: 0, cy: 0, r: 3 });
  const clone = addEntity(d, 'circle', { cx: 0, cy: 0, r: 3, clone: { of: own.id, cx: 0, cy: 0, dx: 20, dy: 0 } });
  const frozen = addEntity(d, 'circle', { cx: 0, cy: 0, r: 3, frozen: true, clone: { of: own.id, cx: 0, cy: 0, dx: 40, dy: 0 } });
  syncClones(d, { transformEntity, normalizeEntity });
  own.r = 7;
  syncClones(d, { transformEntity, normalizeEntity });
  assert.equal(d.entities.find((e) => e.id === clone.id).r, 7);
  assert.equal(d.entities.find((e) => e.id === frozen.id).r, 3, 'frozen');
  assert.deepEqual(new Set(instancesOf(d, [clone.id])), new Set([own.id, clone.id, frozen.id]));
});

test('dependency graph: clones, joints, constraints and groups; SVG with every node', () => {
  const d = createDrawing({ title: 'Deps' });
  const a = addEntity(d, 'line', { x1: 0, y1: 0, x2: 10, y2: 0, name: 'A' });
  const b = addEntity(d, 'line', { x1: 0, y1: 0, x2: 10, y2: 0, name: 'B', clone: { of: a.id, cx: 0, cy: 0, dx: 0, dy: 5 } });
  const c = addEntity(d, 'line', { x1: 0, y1: 0, x2: 0, y2: 10, name: 'C' });
  d.constraints = [{ type: 'perpendicular', refs: [{ id: a.id }, { id: c.id }] }];
  d.groups = [{ id: 'g', name: 'G', parent: null }];
  c.group = 'g';
  const graph = dependencyEdges(d, (entity) => entity.id);
  assert.deepEqual(graph.edges.map((e) => e.kind).sort(), ['clone', 'constraint', 'group']);
  assert.ok(graph.edges.some((e) => e.kind === 'clone' && graph.nodes[e.from].key === a.id && graph.nodes[e.to].key === b.id), 'B follows A');
  const svg = graphSvg(graph);
  assert.match(svg, /^<\?xml/);
  assert.equal((svg.match(/<rect x=/g) ?? []).length, graph.nodes.length);
});

test('placements: Euler angles of R = Rz·Ry·Rx come back; a placement moved by a rigid transform', () => {
  for (const e of [{ rx: 20, ry: -35, rz: 110 }, { rx: -170, ry: 10, rz: 5 }, { rx: 0, ry: 0, rz: 0 }]) {
    const back = eulerOf(rotationOf(e));
    for (const k of ['rx', 'ry', 'rz']) near(back[k], e[k], 1e-6);
  }
  const moved = transformPlacement({ x: 10, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }, rotationOf({ rz: 90 }), [1, 2, 3]);
  near(moved.x, 1, 1e-9); near(moved.y, 12, 1e-9); near(moved.z, 3, 1e-9); near(moved.rz, 90, 1e-9);
});

test('alignment: point pairs give the rigid transform back (one pair: a move; three: the rotation too)', () => {
  const R = rotationOf({ rx: 10, ry: 40, rz: -70 });
  const t = [5, -3, 12];
  const from = [[0, 0, 0], [10, 0, 0], [0, 7, 0], [1, 2, 9]];
  const to = from.map((p) => apply(R, p).map((v, i) => v + t[i]));
  const fit = bestFit(from, to);
  near(fit.rms, 0, 1e-9);
  const angles = eulerOf(fit.R);
  near(angles.rx, 10, 1e-6); near(angles.ry, 40, 1e-6); near(angles.rz, -70, 1e-6);
  const one = bestFit([[1, 1, 1]], [[4, 5, 6]]);
  assert.deepEqual(one.t, [3, 4, 5]);
});

test('materials: library values, user values kept, mass from volume and density', () => {
  const steel = normalizeMaterial({ id: 'steel' });
  assert.equal(steel.density, 7850);
  const mine = normalizeMaterial({ id: 'custom-1', name: 'Mine', density: 1000, E: -5, color: 'blue' });
  assert.equal(mine.density, 1000);
  assert.equal(mine.E, 0);
  assert.match(mine.color, /^#/);
  near(massOf(1e6, steel), 7.85, 1e-12);
  assert.ok(MATERIALS.every((m) => m.name.ko && m.name.en && m.density > 0));
});

test('PDF: one page per image, its paper size, and a cross-reference table that points at each object', () => {
  const image = { width: 2, height: 1, data: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), filter: 'DCTDecode' };
  const bytes = buildPdf([{ widthMm: 297, heightMm: 210, image }, { widthMm: 210, heightMm: 297, image }], { title: 'Plan (A)' });
  const text = new TextDecoder('latin1').decode(bytes);
  assert.match(text, /^%PDF-1\.4/);
  assert.match(text, /\/Count 2/);
  assert.match(text, /\/MediaBox \[0 0 841\.89 595\.276\]/);
  assert.match(text, /\/Title \(Plan \\\(A\\\)\)/);
  const xref = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.equal(text.slice(xref, xref + 4), 'xref');
  const offsets = text.slice(xref).split('\n').slice(3).filter((l) => / 00000 n $/.test(l)).map((l) => Number(l.slice(0, 10)));
  offsets.forEach((offset, i) => assert.equal(text.slice(offset, offset + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`));
});

test('the in-app self-tests (FreeCAD Test workbench) all pass', async () => {
  const { runSelfTests, SELF_TESTS } = await import('../../src/selftest.js');
  const results = runSelfTests(Object.keys(SELF_TESTS));
  assert.ok(results.length >= 10);
  assert.deepEqual(results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.error}`), []);
});
