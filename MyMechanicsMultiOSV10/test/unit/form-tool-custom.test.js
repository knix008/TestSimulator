// Custom forming tool (sheet-more.js customForm): a punch made as its own part, pressed into the sheet with its stop
// face on the sheet's far face — the sheet wraps over it as thick as the sheet, hollow underneath; faces punched out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, addCircle, createSketchGeometry } from '../../src/cad/sketch.js';
import { faceSignature } from '../../src/cad/refs.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const inside = (body, p) => R.measureVolume(body.clone().intersect(R.makeBox(p.map((c) => c - 0.05), p.map((c) => c + 0.05)))) > 0.0005;

function setup(extra = {}) {
  // The punch: a Ø12 × 5 cylinder standing on the Top plane (its stop face the bottom disc).
  const punch = { id: 'punch', name: 'Punch', features: [] };
  const k = createFeature(punch, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() }); addCircle(k, 0, 0, 6); punch.features.push(k);
  punch.features.push(createFeature(punch, 'extrude', { sketch: k.id, depth: 5 }));
  const pb = regenerate(punch).body;
  const stop = pb.faces.find((f) => f.geomType === 'PLANE' && Math.abs(f.center.z) < 1e-6);
  const topFace = pb.faces.find((f) => f.geomType === 'PLANE' && Math.abs(f.center.z - 5) < 1e-6);
  // The sheet: 100 × 60 × 1.5.
  const part = { id: 'p', name: 'P', features: [] };
  const s = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() }); addRectangle(s, 0, 0, 100, 60); part.features.push(s);
  part.features.push(createFeature(part, 'baseFlange', { sketch: s.id, thickness: 1.5, radius: 1.5 }));
  const top = regenerate(part).body.faces.find((f) => f.geomType === 'PLANE' && Math.abs(f.center.z - 1.5) < 1e-6);
  const form = createFeature(part, 'formTool', { face: faceSignature(top), tool: 'custom', toolPart: punch.id, stopFace: faceSignature(stop), ...extra(topFace) });
  part.features.push(form);
  const project = { parts: [punch, part] };
  const r = regenerate(part, { project });
  assert.ok(r.results.get(form.id).ok, `${r.results.get(form.id).error} ${r.results.get(form.id).detail ?? ''}`);
  return r.body;
}

test('a cylindrical punch makes a hollow round boss 1.5 thick over it, open underneath', () => {
  const body = setup(() => ({}));
  const t = 1.5; const r = 6; const h = 5;
  // The wall: the punch grown by t (sides, top, a quarter torus round the rim) less the punch.
  const wall = Math.PI * (r + t) ** 2 * h + Math.PI * r * r * t + (Math.PI * t * t / 4) * 2 * Math.PI * (r + (4 * t) / (3 * Math.PI)) - Math.PI * r * r * h;
  near(R.measureVolume(body), 100 * 60 * t - Math.PI * r * r * t + wall - Math.PI * ((r + t) ** 2 - r * r) * t, 1e-6);
  near(body.boundingBox.bounds[1][2], h + t, 1e-6);
  assert.ok(!inside(body, [50, 30, 3]), 'hollow inside the punch');
  assert.ok(!inside(body, [50, 30, 0.5]), 'open underneath');
  assert.ok(inside(body, [50 + 6.75, 30, 3]), 'the wall');
});

test('the punch top face removed: punched through', () => {
  const body = setup((topFace) => ({ removeFaces: [faceSignature(topFace)] }));
  assert.ok(!inside(body, [50, 30, 5.75]), 'no top over the punch');
  assert.ok(inside(body, [50 + 6.75, 30, 3]), 'the wall stays');
});
