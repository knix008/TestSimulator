// Sheet metal normal cut (cad/normal-cut.js): a cut square to the sheet — on a flat the same as a plain cut, in a
// bend cut radially from the face it comes in through.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, addCircle, createSketchGeometry } from '../../src/cad/sketch.js';
import { edgeSignature, isCylinder } from '../../src/cad/refs.js';
import { sheetFaces } from '../../src/cad/normal-cut.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-4) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const V = (s) => R.measureVolume(s);

/** A 100 × 50 × 2 sheet with a 90° edge flange up at x = 100 (inner radius 3), and a sketch plane 60 above. */
function sheet() {
  const part = { id: 'p', name: 'Part', features: [] };
  const s = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() });
  addRectangle(s, 0, 0, 100, 50); part.features.push(s);
  part.features.push(createFeature(part, 'baseFlange', { sketch: s.id, thickness: 2, radius: 3, kFactor: 0.44 }));
  const r0 = regenerate(part);
  const edge = r0.body.edges.find((e) => e.geomType === 'LINE' && e.startPoint.x > 99.9 && e.endPoint.x > 99.9 && e.startPoint.z > 1.99 && e.endPoint.z > 1.99);
  part.features.push(createFeature(part, 'edgeFlange', { edge: edgeSignature(edge), length: 30, angle: 90 }));
  const pl = createFeature(part, 'plane', { base: { kind: 'std', name: 'top' }, offset: 60 }); part.features.push(pl);
  return { part, plane: { kind: 'ref', id: pl.id } };
}
function cut(normal, cx, r) {
  const { part, plane } = sheet();
  const before = regenerate(part).body;
  const k = createFeature(part, 'sketch', { plane, ...createSketchGeometry() }); addCircle(k, cx, 25, r); part.features.push(k);
  const f = createFeature(part, 'extrude', { sketch: k.id, op: 'cut', end: 'through', normalCut: normal }); part.features.push(f);
  const out = regenerate(part);
  assert.ok(out.results.get(f.id).ok, `${out.results.get(f.id).error} ${out.results.get(f.id).detail ?? ''}`);
  return { before, after: out.body, removed: V(before) - V(out.body) };
}

test('the sheet faces are the two sides of the flats and bends, not the narrow side walls', () => {
  const body = regenerate(sheet().part).body;
  const faces = sheetFaces(body, 2);
  // Top and bottom of the base, inner and outer of the bend, the two sides of the flange.
  assert.equal(faces.length, 6);
  assert.equal(faces.filter((f) => isCylinder(f.geomType)).length, 2);
});

test('on a flat a normal cut removes what a plain cut does', () => {
  const plain = cut(false, 40, 4); const normal = cut(true, 40, 4);
  near(normal.removed, Math.PI * 16 * 2, 1e-4);
  near(normal.removed, plain.removed, 1e-6);
});

test('across a bend the cut goes radially through the sheet from its entry face', () => {
  const { before } = cut(true, 40, 1);
  const inner = before.faces.find((f) => isCylinder(f.geomType) && Math.abs(Math.hypot(f.center.x - 100, f.center.z - 5) - 3) < 1.5 && f.normalAt(f.center).z > 0);
  assert.ok(inner, 'the inner face of the bend');
  // The prism of a Ø3 circle over the bend; its patch on the inner face; radial slab ri → ro: A·(ro² − ri²)/(2 ri).
  const prism = R.makeCylinder(1.5, 200, [101.5, 25, -100], [0, 0, 1]);
  const oc = R.getOC(); const common = new oc.BRepAlgoAPI_Common(inner.wrapped, prism.wrapped, new oc.Message_ProgressRange());
  const A = R.measureArea(R.cast(common.Shape())); common.delete();
  const normal = cut(true, 101.5, 1.5); const plain = cut(false, 101.5, 1.5);
  near(normal.removed, (A * (25 - 9)) / 6, 1e-3);
  assert.ok(Math.abs(normal.removed - plain.removed) > 0.05, `normal ${normal.removed} vs plain ${plain.removed}`);
});
