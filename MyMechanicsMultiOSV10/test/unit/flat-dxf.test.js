// A sheet metal part's flat pattern straight to DXF (cad/flat-dxf.js): the blank's outline and holes, the bend
// lines on their up / down layers with a note each, in the sheet plane.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, addCircle, createSketchGeometry } from '../../src/cad/sketch.js';
import { edgeSignature } from '../../src/cad/refs.js';
import { flatPatternEntities } from '../../src/cad/flat-dxf.js';
import { entitiesToDxf } from '../../src/cad/sketch-export.js';
import { bendAllowance } from '../../src/cad/advanced.js';
import { writeDwg } from '../../src/cad/dwg/write.js';
import { readDwg } from '../../src/cad/dwg/read.js';

await loadKernel();
const near = (a, b, tol = 1e-5) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

test('flat pattern DXF: outline with its hole, one bend line up with its note, the blank size', () => {
  const part = { id: 'p', name: 'Part', features: [] };
  const s = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() });
  addRectangle(s, 0, 0, 100, 50); addCircle(s, 30, 25, 5); part.features.push(s);
  part.features.push(createFeature(part, 'baseFlange', { sketch: s.id, thickness: 2, radius: 3, kFactor: 0.4 }));
  const r0 = regenerate(part);
  const edge = r0.body.edges.find((e) => e.geomType === 'LINE' && e.startPoint.x > 99.9 && e.endPoint.x > 99.9 && e.startPoint.z > 1.99 && e.endPoint.z > 1.99);
  part.features.push(createFeature(part, 'edgeFlange', { edge: edgeSignature(edge), length: 30, angle: 90 }));
  const formed = regenerate(part); const flat = regenerate({ ...part, flat: true });
  const out = flatPatternEntities(flat.body, formed.sheet, flat.sheet.bends, formed.sheet.bends);
  assert.ok(out);
  const BA = bendAllowance(90, 3, 2, 0.4);
  const size = [...out.size].sort((a, b) => a - b);
  near(size[1], 100 + BA + 30); near(size[0], 50);
  const outline = out.entities.filter((e) => e.layerName === 'OUTLINE');
  assert.equal(outline.filter((e) => e.name === 'CIRCLE').length, 1);
  near(outline.find((e) => e.name === 'CIRCLE').radius, 5);
  assert.equal(outline.filter((e) => e.name === 'LINE').length, 4);
  const lines = out.entities.filter((e) => e.layerName === 'BEND_UP' || e.layerName === 'BEND_DOWN');
  assert.equal(lines.length, 1);
  assert.equal(lines[0].layerName, 'BEND_UP');
  near(Math.hypot(lines[0].end[0] - lines[0].start[0], lines[0].end[1] - lines[0].start[1]), 50);
  // The bend line sits half an allowance past the base's edge (100 from the far side of the blank).
  const xs = outline.flatMap((e) => (e.name === 'LINE' ? [e.start, e.end] : [])).map((p) => p);
  const along = Math.abs(lines[0].end[0] - lines[0].start[0]) < 1e-6 ? 0 : 1;
  const edgeCoord = Math.min(...xs.map((p) => p[along]));
  const farCoord = Math.max(...xs.map((p) => p[along]));
  const bendAt = lines[0].start[along];
  const fromLow = bendAt - edgeCoord; const fromHigh = farCoord - bendAt;
  near(Math.min(fromLow, fromHigh), 30 + BA / 2, 1e-4);
  assert.match(out.entities.find((e) => e.layerName === 'BEND_NOTES').text, /^UP 90° R3 BA/);
  const dxf = entitiesToDxf(out.entities, out.layers);
  for (const l of ['OUTLINE', 'BEND_UP', 'BEND_DOWN', 'BEND_NOTES']) assert.match(dxf, new RegExp(`\n0\nLAYER\n2\n${l}\n`));
  assert.ok(dxf.includes('\nCIRCLE\n') && dxf.trim().endsWith('EOF'));
});
