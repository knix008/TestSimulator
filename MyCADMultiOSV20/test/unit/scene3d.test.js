// VRML 2.0 and COLLADA: writers, readers, transforms, units, up axis.
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDae, parseVrml, toDae, toVrml } from '../../src/domain/scene3d.js';
import { meshBox, meshVolume, solidMesh } from '../../src/domain/solids.js';
import { createEntity } from '../../src/domain/entities.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
const box = solidMesh(createEntity('solid', { kind: 'box', params: { length: 10, width: 20, height: 30 } }));

test('our VRML and DAE come back the same', () => {
  for (const [write, read] of [[toVrml, parseVrml], [(o) => toDae(o), parseDae]]) {
    const [object] = read(write([{ name: 'Box 1', triangles: box, color: '#ff8000' }]));
    near(meshVolume(object.triangles), 6000);
    assert.equal(object.color, '#ff8000');
  }
});

test('VRML: Transform (translation, rotation, scale), DEF/USE, polygons, ccw FALSE', () => {
  const vrml = `#VRML V2.0 utf8
Transform { translation 100 0 0 rotation 0 0 1 1.5707963 scale 2 2 2 children [
  Shape { geometry IndexedFaceSet { ccw FALSE coord DEF C Coordinate { point [ 0 0 0, 1 0 0, 1 1 0, 0 1 0, 0 0 1, 1 0 1, 1 1 1, 0 1 1 ] }
    coordIndex [ 0 1 2 3 -1  4 7 6 5 -1  0 4 5 1 -1  1 5 6 2 -1  2 6 7 3 -1  3 7 4 0 -1 ] } }
] }
Shape { geometry IndexedFaceSet { coord USE C coordIndex [ 0 3 2 1 -1  4 5 6 7 -1  0 1 5 4 -1  1 2 6 5 -1  2 3 7 6 -1  3 0 4 7 -1 ] } }`;
  const [scaled, plain] = parseVrml(vrml);
  near(meshVolume(scaled.triangles), 8, 1e-5);
  near(meshVolume(plain.triangles), 1);
  const b = meshBox(scaled.triangles);
  near(b.min[0], 98, 1e-5);
  near(b.max[0], 100, 1e-5);
  near(b.max[1], 2, 1e-5);
  assert.throws(() => parseVrml('#VRML V1.0 ascii\nSeparator {}'), /VRML 2\.0/);
});

test('DAE: metres and Y up become millimetres and Z up; polylist and node transforms', () => {
  const dae = `<?xml version="1.0"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset><unit meter="1"/><up_axis>Y_UP</up_axis></asset>
  <library_geometries><geometry id="g"><mesh>
    <source id="p"><float_array id="pa" count="24">0 0 0 1 0 0 1 1 0 0 1 0 0 0 1 1 0 1 1 1 1 0 1 1</float_array><technique_common><accessor source="#pa" count="8" stride="3"/></technique_common></source>
    <vertices id="v"><input semantic="POSITION" source="#p"/></vertices>
    <polylist count="6"><input semantic="VERTEX" source="#v" offset="0"/><vcount>4 4 4 4 4 4</vcount><p>0 3 2 1 4 5 6 7 0 1 5 4 1 2 6 5 2 3 7 6 3 0 4 7</p></polylist>
  </mesh></geometry></library_geometries>
  <library_visual_scenes><visual_scene id="s"><node name="Cube"><translate>0 2 0</translate><instance_geometry url="#g"/></node></visual_scene></library_visual_scenes>
  <scene><instance_visual_scene url="#s"/></scene>
</COLLADA>`;
  const [cube] = parseDae(dae);
  assert.equal(cube.name, 'Cube');
  near(meshVolume(cube.triangles), 1e9, 1e-3);
  const b = meshBox(cube.triangles);
  // Y up 2 m → Z 2000 mm.
  near(b.min[2], 2000, 1e-6);
  near(b.max[2], 3000, 1e-6);
});
