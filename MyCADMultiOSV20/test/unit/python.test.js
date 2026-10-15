// Python in the console and macros (Pyodide): FreeCAD-style macros against MyCAD.
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPython, nextStep, runPython, tracePython } from '../../src/script/python.js';
import { addEntity, createDrawing, findEntity, removeEntities, updateEntity } from '../../src/domain/drawing.js';
import { normalizeEntity } from '../../src/domain/entities.js';
import { solidProperties } from '../../src/domain/solids.js';

await loadPython();

/** The `cad` API over a plain drawing (as app.js makes it over the open document). */
function api(drawing) {
  return {
    print: () => {},
    add: (type, data) => addEntity(drawing, type, data).id,
    solid: (kind, params, place = {}) => addEntity(drawing, 'solid', { kind, params, ...place }).id,
    get: (id) => structuredClone(findEntity(drawing, id) ?? null),
    update: (id, patch) => { updateEntity(drawing, id, patch); return id; },
    remove: (id) => removeEntities(drawing, [id]),
    entities: () => structuredClone(drawing.entities),
    properties: (spec) => solidProperties(normalizeEntity({ type: 'solid', ...spec })),
  };
}

test('Part: a box with a hole, shown in the drawing; Python reads the volume', async () => {
  const d = createDrawing();
  const lines = [];
  const value = await runPython([
    'import Part, FreeCAD as App',
    'plate = Part.makeBox(100, 60, 10)',
    'hole = Part.makeCylinder(10, 10, App.Vector(50, 30, 0))',
    'part = plate.cut(hole)',
    'Part.show(part, "Plate")',
    'print("volume", round(part.Volume))',
    'part.Volume',
  ].join('\n'), api(d), (kind, text) => lines.push([kind, text]));
  const solid = d.entities.find((e) => e.name === 'Plate');
  assert.equal(solid.kind, 'boolean');
  assert.equal(solid.shape.op, 'cut');
  const expected = 100 * 60 * 10 - Math.PI * 100 * 10;
  assert.ok(Math.abs(Number(value) - expected) / expected < 0.01, value);
  assert.deepEqual(lines[0], ['out', `volume ${Math.round(Number(value))}`]);
});

test('Documents: addObject("Part::Box"), setting properties and the placement changes the solid', async () => {
  const d = createDrawing();
  await runPython([
    'import FreeCAD as App',
    'doc = App.newDocument("Test")',
    'box = doc.addObject("Part::Box", "Block")',
    'box.Length = 40',
    'box.Height = 5',
    'box.Placement = App.Placement(App.Vector(10, 20, 0), App.Rotation(App.Vector(0, 0, 1), 30))',
    'cyl = doc.addObject("Part::Cylinder", "Pin")',
    'cyl.Radius = 3',
    'doc.recompute()',
  ].join('\n'), api(d), () => {});
  const box = d.entities.find((e) => e.name === 'Block');
  assert.deepEqual([box.params.length, box.params.width, box.params.height], [40, 10, 5]);
  assert.deepEqual([box.x, box.y, box.rz], [10, 20, 30]);
  assert.equal(d.entities.find((e) => e.name === 'Pin').params.radius, 3);
});

test('errors come back as Python exceptions; each run starts fresh', async () => {
  const d = createDrawing();
  await assert.rejects(runPython('import FreeCAD as App\nApp.ActiveDocument.addObject("PartDesign::Body")', api(d), () => {}), /not supported in MyCAD/);
  assert.equal(await runPython('1 + 2', api(d), () => {}), '3');
});

test('macro debugger: the run is traced line by line with its locals; step into, step over and breakpoints', async () => {
  const code = 'def square(n):\n    r = n * n\n    return r\n\ntotal = 0\nfor i in range(3):\n    total += square(i)\nprint(total)';
  const printed = [];
  const { steps, error } = await tracePython(code, {}, (kind, text) => printed.push(text));
  assert.equal(error, null);
  assert.deepEqual(printed, ['5']);
  const lines = steps.filter((s) => s.event === 'line');
  assert.ok(lines.some((s) => s.fn === 'square' && s.line === 2 && s.depth === 2), 'inside the function, one level down');
  const last = [...lines].reverse().find((s) => s.line === 8);
  assert.equal(last.locals.total, '5');
  const first = steps.findIndex((s) => s.event === 'line');
  // Step over never goes into square(); step into does.
  let at = steps.findIndex((s) => s.event === 'line' && s.line === 7);
  const over = nextStep(steps, at, 'over');
  assert.ok(steps[over].depth <= 1);
  const into = nextStep(steps, at, 'into');
  assert.equal(steps[into].fn, 'square');
  // Continue stops on each pass of a breakpoint.
  at = nextStep(steps, first, 'continue', new Set([2]));
  assert.equal(steps[at].line, 2);
  assert.equal(steps[at].locals.n, '0');
  at = nextStep(steps, at, 'continue', new Set([2]));
  assert.equal(steps[at].locals.n, '1');
  const failing = await tracePython('x = 1\ny = x / 0', {}, () => {});
  assert.match(failing.error, /ZeroDivisionError/);
});
