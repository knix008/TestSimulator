// FreeCAD BIM / Arch / IFC tools on the data: components with additions and
// subtractions, IFC information in the IFC file, glue, grids, merged walls,
// preflight checks, model differences, reorder and nudging, the example house.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  axisCrossings, combineAxes, diffModels, exampleHouse, extendEntity, gluePaths, gridPositions, ifcSheetCells, mergeWallPaths, normalizeBimInfo, parseProps, preflight, propsText, reorderEntities,
} from '../../src/domain/bimtools.js';
import { createDrawing, addEntity, syncDrawingClones, updateEntity } from '../../src/domain/drawing.js';
import { meshVolume, normalizeSolidData, placement, solidMesh, solidMeshGroups } from '../../src/domain/solids.js';
import { axisLines, createBim } from '../../src/domain/arch.js';
import { toIfc } from '../../src/domain/ifc.js';
import { analyzeMesh } from '../../src/domain/meshcheck.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);
const box = (x, y, z, l, w, h, extra = {}) => ({ kind: 'box', params: { length: l, width: w, height: h }, x, y, z, ...extra });

test('components: an addition fuses, a subtraction cuts, and both follow their parts', () => {
  const d = createDrawing({ title: 't' });
  const host = addEntity(d, 'solid', box(0, 0, 0, 100, 100, 100));
  const add = addEntity(d, 'solid', box(100, 0, 0, 50, 100, 100));
  const sub = addEntity(d, 'solid', box(-10, -10, 50, 300, 120, 100));
  updateEntity(d, host.id, { components: { add: [add.id], sub: [sub.id] } });
  // (The document syncs after every change.)
  syncDrawingClones(d);
  const h = d.entities.find((e) => e.id === host.id);
  assert.equal(h.components.parts.add.length, 1);
  // (100 + 50) × 100 × 100, the top half cut away (z > 50).
  near(Math.abs(meshVolume(solidMesh(h))), 150 * 100 * 50, 1e-3);
  // The addition grows: the host follows.
  updateEntity(d, add.id, { params: { length: 100, width: 100, height: 100 } });
  syncDrawingClones(d);
  near(Math.abs(meshVolume(solidMesh(d.entities.find((e) => e.id === host.id)))), 200 * 100 * 50, 1e-3);
  // A deleted part drops out of the component.
  d.entities = d.entities.filter((e) => e.id !== sub.id);
  syncDrawingClones(d);
  const after = d.entities.find((e) => e.id === host.id);
  assert.deepEqual(after.components.sub, []);
  assert.ok(analyzeMesh(solidMesh(after), { selfCheck: false }).closed);
});

test('IFC information: class, classification, properties and B-rep flag reach the IFC file', () => {
  assert.equal(normalizeBimInfo({ ifcType: 'ifcfooting' }).ifcType, 'IfcFooting');
  assert.equal(normalizeBimInfo({ ifcType: 'IfcNothing' }), null);
  const props = parseProps('FireRating = REI 60\nLoadBearing = true\nU = 0.28\nbad line');
  assert.deepEqual(props, { FireRating: 'REI 60', LoadBearing: true, U: 0.28 });
  assert.equal(propsText(props), 'FireRating = REI 60\nLoadBearing = true\nU = 0.28');
  const d = createDrawing({ title: 't' });
  d.bim = createBim('en');
  addEntity(d, 'solid', box(0, 0, 0, 1000, 1000, 500, { name: 'Pad', bim: { ifcType: 'IfcFooting', props, classification: { system: 'Uniclass 2015', code: 'EF_20_05', title: 'Foundations' } } }));
  addEntity(d, 'solid', { kind: 'column', name: 'C1', params: { width: 300, depth: 300, height: 3000 }, x: 0, y: 0, z: 0 });
  addEntity(d, 'solid', { kind: 'column', name: 'C2', params: { width: 300, depth: 300, height: 3000 }, x: 2000, y: 0, z: 0, bim: { brep: true } });
  const ifc = toIfc(d, { timestamp: '2026-01-01T00:00:00' });
  assert.match(ifc, /IFCFOOTING\('[^']+',#\d+,'Pad'/);
  assert.match(ifc, /IFCPROPERTYSINGLEVALUE\('FireRating',\$,IFCLABEL\('REI 60'\)/);
  assert.match(ifc, /IFCPROPERTYSINGLEVALUE\('LoadBearing',\$,IFCBOOLEAN\(\.T\.\)/);
  assert.match(ifc, /IFCCLASSIFICATIONREFERENCE\(\$,'EF_20_05','Foundations'/);
  // C1 is an extrusion; C2 (B-rep flag) is a faceted body.
  assert.equal((ifc.match(/IFCEXTRUDEDAREASOLID/g) ?? []).length, 1);
});

test('wires: glue joins the nearest ends (reversing, bridging gaps); rewire-style join closes loops', () => {
  const out = gluePaths([[{ x: 10, y: 0 }, { x: 20, y: 0 }], [{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 25, y: 0 }, { x: 20, y: 5 }]]);
  // The second wire goes in front (shared end), the third is bridged by a 5 mm gap.
  assert.deepEqual(out.points.map((p) => [p.x, p.y]), [[0, 0], [10, 0], [20, 0], [25, 0], [20, 5]]);
  assert.equal(out.closed, false);
  const square = gluePaths([[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }]]);
  assert.equal(square.closed, true);
  assert.equal(square.points.length, 4);
});

test('grids, axis systems, structural systems and merged walls', () => {
  assert.deepEqual(gridPositions('3000, 4500; 3000'), [0, 3000, 7500, 10500]);
  const a = normalizeSolidData({ kind: 'axis', params: { countX: 3, spacingX: 5000, countY: 1, spacingY: 1000 } });
  const b = normalizeSolidData({ kind: 'axis', params: { countX: 2, spacingX: 4000, countY: 1, spacingY: 1000 }, x: 0, y: 1000 });
  const lines = combineAxes(a, b, axisLines);
  assert.deepEqual(lines, { xs: [0, 5000, 10000], ys: [1000, 5000] });
  const crossings = axisCrossings({ ...a, shape: lines, rz: 90 }, axisLines);
  assert.equal(crossings.length, 6);
  near(crossings[1].x, -1000); near(crossings[1].y, 5000);
  const wall = (x, y, path, openings = []) => normalizeSolidData({ kind: 'wall', params: { width: 200, height: 2700 }, x, y, shape: { path, openings } });
  const w1 = wall(0, 0, [{ x: 0, y: 0 }, { x: 4000, y: 0 }], [{ type: 'door', at: 1000, width: 900 }]);
  const w2 = wall(4000, 0, [{ x: 0, y: 0 }, { x: 0, y: 3000 }], [{ type: 'window', at: 1000, width: 1200 }]);
  const toWorld = (w, p) => { const [x, y] = placement(w)([p.x, p.y, 0]); return { x, y }; };
  const merged = mergeWallPaths([w1, w2], toWorld);
  assert.deepEqual(merged.path, [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }]);
  assert.deepEqual(merged.openings.map((o) => [o.type, Math.round(o.at)]), [['door', 1000], ['window', 5000]]);
  assert.equal(mergeWallPaths([w1, wall(6000, 0, [{ x: 0, y: 0 }, { x: 1000, y: 0 }])], toWorld), null);
});

test('preflight, differences, reorder, extend and the IFC sheet', () => {
  const d = createDrawing({ title: 't' });
  d.bim = createBim('en');
  const one = addEntity(d, 'solid', box(0, 0, 0, 10, 10, 10, { name: 'A', level: 'L1', bim: { ifcType: 'IfcWall', classification: { system: 'CCI', code: 'AD' } } }));
  addEntity(d, 'solid', box(20, 0, 0, 10, 10, 10, { name: 'A' }));
  const tests = Object.fromEntries(preflight(d, { analyze: (e) => analyzeMesh(solidMesh(e), { selfCheck: false }), isArch: () => false }).map((x) => [x.id, x]));
  assert.ok(tests.project.ok && tests.solid.ok && tests.volume.ok && tests.named.ok);
  assert.equal(tests.uniqueNames.items.length, 2);
  assert.equal(tests.ifcType.items.length, 1);
  assert.equal(tests.levels.items.length, 1);
  assert.equal(tests.classification.items.length, 1);
  const item = (name, kind, b, volume) => ({ name, kind, box: b, volume });
  const res = diffModels([item('W', 'wall', [0, 0, 0, 1, 1, 1], 1), item('S', 'slab', [0, 0, 0, 1, 1, 1], 1), item('W', 'wall', [5, 0, 0, 6, 1, 1], 1)], [item('W', 'wall', [0, 0, 0, 1, 1, 1], 1), item('W', 'wall', [9, 0, 0, 10, 1, 1], 1), item('R', 'roof', null, 2)]);
  assert.deepEqual(res, { added: ['R'], removed: ['S'], changed: [{ name: 'W (2)', what: ['placement'] }] });
  const list = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  assert.deepEqual(reorderEntities(list, ['d', 'b']).map((e) => e.id), ['a', 'd', 'c', 'b']);
  assert.deepEqual(extendEntity({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, 2), { x1: -2, y1: 0, x2: 12, y2: 0 });
  assert.equal(extendEntity({ type: 'circle', r: 1 }, -2), null);
  const cells = ifcSheetCells([{ name: 'A', ifcClass: 'IfcWall', props: { Fire: 'REI 60' } }, { name: 'B', ifcClass: 'IfcSlab', props: { U: 0.3 } }]);
  assert.deepEqual(cells, { A1: 'Name', B1: 'IfcClass', C1: 'Fire', D1: 'U', A2: 'A', B2: 'IfcWall', C2: 'REI 60', A3: 'B', B3: 'IfcSlab', D3: '0.3' });
  void one;
});

test('example house: four walls with a door and two windows, slab, roof and a space — all valid solids', () => {
  const raws = exampleHouse();
  assert.deepEqual(raws.map((r) => r.kind), ['wall', 'wall', 'wall', 'wall', 'slab', 'roof', 'space']);
  assert.equal(raws.flatMap((r) => r.shape.openings ?? []).length, 3);
  for (const raw of raws) {
    const e = normalizeSolidData({ ...raw, material: undefined });
    assert.ok(solidMeshGroups(e).some((g) => g.tris.length > 0), raw.name);
  }
});
