// IFC from other programs: extruded walls, slabs, columns and beams read as BIM objects.
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIfc, toIfc } from '../../src/domain/ifc.js';
import { parseStepEntities } from '../../src/domain/exchange3d.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

test('another program\'s IFC: walls with doors and windows, slabs, columns and beams come in as BIM objects', async () => {
  const { addEntity, createDrawing } = await import('../../src/domain/drawing.js');
  const d = createDrawing({ title: 'Other' });
  addEntity(d, 'solid', { kind: 'wall', params: { width: 250, height: 3000 }, shape: { path: [{ x: 0, y: 0 }, { x: 6000, y: 0 }], openings: [{ type: 'door', at: 1000, width: 900, height: 2100, sill: 0 }, { type: 'window', at: 3500, width: 1500, height: 1200, sill: 900 }] } });
  addEntity(d, 'solid', { kind: 'slab', params: { thickness: 200 }, shape: { outer: [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 0, y: 4000 }] }, z: 3000 });
  addEntity(d, 'solid', { kind: 'column', params: { width: 400, depth: 300, height: 3000 }, x: 6000, y: 4000, rz: 30 });
  addEntity(d, 'solid', { kind: 'beam', params: { width: 300, height: 500 }, shape: { path: [{ x: 0, y: 4000 }, { x: 6000, y: 4000 }] }, z: 2500 });
  // What MyCAD writes, without MyCAD's own property set: as any other program's file.
  const text = toIfc(d).replace(/'MyCAD'/g, "'OtherApp'");
  const got = parseIfc(text, { stepEntities: parseStepEntities, cut: null });
  const kinds = got.entities.map((e) => e.kind).sort();
  assert.deepEqual(kinds, ['beam', 'column', 'slab', 'wall']);
  const wall = got.entities.find((e) => e.kind === 'wall');
  near(wall.params.width, 250); near(wall.params.height, 3000);
  assert.deepEqual(wall.shape.path.map((p) => [Math.round(p.x), Math.round(p.y)]), [[0, 0], [6000, 0]]);
  assert.deepEqual(wall.shape.openings.map((o) => o.type), ['door', 'window']);
  near(wall.shape.openings[0].at, 1000, 15); near(wall.shape.openings[0].width, 900, 30); near(wall.shape.openings[1].sill, 900, 15); near(wall.shape.openings[1].height, 1200, 30);
  const slab = got.entities.find((e) => e.kind === 'slab');
  near(slab.params.thickness, 200); near(slab.z, 3000);
  const column = got.entities.find((e) => e.kind === 'column');
  near(column.x, 6000); near(column.y, 4000); near(column.params.width, 400); near(column.params.depth, 300); near(((column.rz % 180) + 180) % 180, 30, 1e-6);
  const beam = got.entities.find((e) => e.kind === 'beam');
  near(beam.params.height, 500); near(beam.z, 2500);
});
