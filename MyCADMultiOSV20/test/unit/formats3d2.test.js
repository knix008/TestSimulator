// BREP (OpenCASCADE) and OpenSCAD: writers, readers, FreeCAD-made BREP.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parseBrep, toBrep } from '../../src/domain/brep.js';
import { createEntity, normalizeEntity } from '../../src/domain/entities.js';
import { curvedFace, exportMesh, importMesh } from '../../src/domain/exchange3d.js';
import { createDrawing, addEntity } from '../../src/domain/drawing.js';
import { analyzeMesh } from '../../src/domain/meshcheck.js';
import { parseScad } from '../../src/domain/scad.js';
import { extrudePolygon, meshVolume, revolve, solidMesh } from '../../src/domain/solids.js';

const near = (a, b, rel = 1e-9) => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel + 1e-9, `${a} ≠ ${b}`);
const gen = { revolve, extrudePolygon };

test('BREP: our solids come back with their volumes; FreeCAD numbering from the end', () => {
  const box = solidMesh(createEntity('solid', { kind: 'box', params: { length: 10, width: 20, height: 30 }, x: 5 }));
  const cyl = solidMesh(createEntity('solid', { kind: 'cylinder', params: { radius: 5, height: 10 }, x: 50 }));
  const text = toBrep([{ name: 'Box', triangles: box }, { name: 'Cyl', triangles: cyl }]);
  assert.match(text, /^DBRep_DrawableShape\n\nCASCADE Topology V1/);
  // The root (last line) is shape 1: the compound, written last.
  assert.match(text, /\nCo\n\n0100000\n[^\n]*\*\n\n\+1 0\n$/);
  const back = parseBrep(text, { curvedFace });
  near(meshVolume(back[0].triangles), 6000);
  near(meshVolume(back[1].triangles), meshVolume(cyl), 1e-9);
  // Every edge is shared: the shells are closed.
  for (const o of back) assert.equal(analyzeMesh(o.triangles, { selfCheck: false }).openEdges, 0);
});

test('BREP made by FreeCAD (planes and cylinders, locations, edges in any order) reads with FreeCAD\'s volume', () => {
  const { entities } = importMesh('brep', new Uint8Array(fs.readFileSync(new URL('../../samples/freecad/freecad-bracket.brep', import.meta.url))));
  const v = entities.reduce((s, e) => s + meshVolume(solidMesh(normalizeEntity(e))), 0);
  near(v, 27895.22131576614, 0.002);
});

test('OpenSCAD: every solid kind written and read back with its volume', () => {
  const d = createDrawing();
  const sq = (s) => [{ x: -s, y: -s }, { x: s, y: -s }, { x: s, y: s }, { x: -s, y: s }];
  for (const data of [
    { kind: 'box', params: { length: 10, width: 20, height: 30 }, x: 5, rz: 30 },
    { kind: 'cylinder', params: { radius: 5, height: 10, angle: 200 } },
    { kind: 'cone', params: { radius1: 5, radius2: 2, height: 10 }, rx: 45 },
    { kind: 'sphere', params: { radius: 6 } },
    { kind: 'tube', params: { outer: 6, inner: 4, height: 10 } },
    { kind: 'pad', params: { height: 5 }, shape: { shapes: [{ outer: sq(10), holes: [sq(3)] }] } },
    { kind: 'helix', params: {} },
    { kind: 'boolean', params: {}, shape: { op: 'cut', parts: [{ kind: 'box', params: { length: 20, width: 20, height: 20 } }, { kind: 'cylinder', params: { radius: 5, height: 40 }, x: 10, y: 10, z: -10 }] } },
  ]) addEntity(d, 'solid', data);
  const text = new TextDecoder().decode(exportMesh('scad', d, d.entities));
  assert.match(text, /cube\(size = \[10, 20, 30\], center = false\);/);
  assert.match(text, /difference\(\) \{/);
  const back = importMesh('scad', text).entities.map(normalizeEntity);
  assert.equal(back.length, d.entities.length);
  d.entities.forEach((e, i) => near(meshVolume(solidMesh(back[i])), meshVolume(solidMesh(e)), 0.005));
});

test('OpenSCAD language: variables, for, if, 2D shapes in extrusions, transforms, modifiers', () => {
  const objects = parseScad(`
    // a comment
    $fn = 48; w = 10;
    for (i = [0:2]) translate([i * 20, 0, 0]) cube(w, center = true);
    if (w > 5) linear_extrude(height = 4) difference() { square([20, 10]); translate([5, 5]) circle(r = 2); }
    rotate_extrude() translate([10, 0]) square([2, 4]);
    *sphere(100);
    rotate([90, 0, 0]) mirror([1, 0, 0]) cylinder(h = 10, d1 = 4, d2 = 0);
  `, gen);
  assert.equal(objects.length, 4, 'the starred sphere is left out');
  near(meshVolume(objects[0].triangles), 3000, 1e-9);
  near(meshVolume(objects[1].triangles), (200 - (48 / 2) * 4 * Math.sin((2 * Math.PI) / 48)) * 4, 1e-6);
  near(meshVolume(objects[2].triangles), Math.PI * (144 - 100) * 4, 0.01);
  assert.ok(meshVolume(objects[3].triangles) > 0, 'a mirrored cone still faces out');
  assert.throws(() => parseScad('module m() { cube(1); } m();', gen), /modules/);
});
