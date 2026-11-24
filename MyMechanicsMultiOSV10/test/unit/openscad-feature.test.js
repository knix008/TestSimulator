// The OpenSCAD feature in a part: the program's mesh as a solid (separate pieces, cavities kept hollow), the
// Customizer values and kept files driving the body, a failing program reported with its message, and the
// result saved in the feature so a reopened file does not run the program again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { runScad } from '../../src/cad/openscad/index.js';
import { meshSolid, packFiles, unpackFiles, scadResult, scadReport, scadParams, scadSavedKey } from '../../src/cad/openscad-feature.js';
import { createFeature, regenerate } from '../../src/cad/features.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const solidOf = (src) => { const r = runScad(src); return meshSolid(r.verts, r.tris); };
const newPart = () => ({ id: 'p', name: 'Part', features: [] });
const bodyOf = (part) => regenerate(part).body;

test('a mesh in separate pieces becomes separate solids; a cavity stays hollow', () => {
  const two = solidOf('cube(10); translate([20, 0, 0]) cube(10);');
  assert.ok(near(R.measureVolume(two), 2000));
  const hollow = solidOf('difference() { cube(20, center = true); cube(10, center = true); }');
  assert.ok(near(R.measureVolume(hollow), 8000 - 1000));
  // The cavity's six faces are there besides the outer six (a filled cube would have 8000 and 6 faces).
  assert.equal(hollow.faces.length, 12);
  const one = solidOf('cube(5);');
  assert.equal(one.faces.length, 6, 'coplanar triangles merged into the cube faces');
});

test('the feature builds its program; Customizer values change the body; another program another body', () => {
  const part = newPart();
  const f = createFeature(part, 'openscad', { source: 'w = 10; // [1:50]\ncube([w, 20, 30]);' });
  part.features.push(f);
  assert.ok(near(R.measureVolume(bodyOf(part)), 6000));
  f.overrides = { w: 20 };
  assert.ok(near(R.measureVolume(bodyOf(part)), 12000));
  assert.deepEqual(scadParams(f).map((p) => [p.name, p.current, p.min, p.max]), [['w', 20, 1, 50]]);
  f.source = 'sphere(5, $fn = 4);';
  const v = R.measureVolume(bodyOf(part));
  assert.ok(v > 0 && v < 4 / 3 * Math.PI * 125);
});

test('files kept in the feature (text and bytes) are what include and import read', () => {
  const stl = new TextEncoder().encode('solid t\n facet normal 0 0 0\n  outer loop\n   vertex 0 0 0\n   vertex 0 10 0\n   vertex 10 0 0\n  endloop\n endfacet\n facet normal 0 0 0\n  outer loop\n   vertex 0 0 0\n   vertex 10 0 0\n   vertex 0 0 10\n  endloop\n endfacet\n facet normal 0 0 0\n  outer loop\n   vertex 0 0 0\n   vertex 0 0 10\n   vertex 0 10 0\n  endloop\n endfacet\n facet normal 0 0 0\n  outer loop\n   vertex 10 0 0\n   vertex 0 10 0\n   vertex 0 0 10\n  endloop\n endfacet\nendsolid t\n');
  const files = packFiles({ 'lib/size.scad': 's = 4;', 'parts/tet.stl': stl });
  assert.equal(typeof files['lib/size.scad'], 'string');
  assert.ok(files['parts/tet.stl'].b64);
  assert.deepEqual([...unpackFiles(files)['parts/tet.stl']], [...stl]);
  const part = newPart();
  part.features.push(createFeature(part, 'openscad', { source: 'include <lib/size.scad>\ncube(s);\ntranslate([10, 0, 0]) import("parts/tet.stl");', files }));
  assert.ok(near(R.measureVolume(bodyOf(part)), 64 + 1000 / 6));
});

test('a program that fails: the rebuild error, its message and echoes in the report; nothing is guessed', () => {
  const part = newPart();
  const f = createFeature(part, 'openscad', { source: 'echo("before"); assert(1 > 2, "too small");' });
  part.features.push(f);
  const res = regenerate(part);
  const r = res.results.get(f.id);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'scad-error');
  const rep2 = scadReport(f);
  assert.match(rep2.error, /too small/);
  assert.deepEqual(rep2.echoes, ['ECHO: "before"']);
  const flat = createFeature(part, 'openscad', { source: 'square(5);' });
  assert.throws(() => scadResult(flat), (e) => e.code === 'scad-2d');
  const none = createFeature(part, 'openscad', { source: 'x = 1;' });
  assert.throws(() => scadResult(none), (e) => e.code === 'scad-empty');
});

test('a result saved in the feature is used while the program and its values are unchanged (no new run)', () => {
  const part = newPart();
  const f = createFeature(part, 'openscad', { source: 'cube(3); // saved-result test' });
  part.features.push(f);
  // A saved result under the right key: a 1 mm box stands in for it, so using it shows (the program gives 27).
  f.result = { key: scadSavedKey(f), brep: R.makeBox([0, 0, 0], [1, 1, 1]).serialize() };
  assert.ok(near(R.measureVolume(bodyOf(part)), 1));
  // A changed value: the key changes, the program runs.
  f.overrides = { unused: 1 };
  assert.ok(near(R.measureVolume(bodyOf(part)), 27));
});
