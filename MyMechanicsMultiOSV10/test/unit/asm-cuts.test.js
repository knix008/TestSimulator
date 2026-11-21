// Assembly cuts in what the assembly measures: mass properties and interference see the cut bodies, cuts reach
// the parts of sub-assemblies (and a sub-assembly's own cuts move with it), and a face made by a cut is a real
// face of the cut body that a mate can take (its axis in the part's own frame).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { quatIdentity, quatFromAxisAngle, interferences, mateEntityOfFace, placePoint } from '../../src/cad/assembly.js';
import { createAsmFeature, leafCutFeatures, cutLeafBody, assemblyCutShapes, assemblyCutMass } from '../../src/cad/asm-extra.js';
import { faceSignature, isCylinder } from '../../src/cad/refs.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const comp = (id, part, position = [0, 0, 0], rotation = quatIdentity()) => ({ id, part, position, rotation });
// Part solids (built once per id, cloned by the code that uses them).
const SOLIDS = {
  plate: () => R.makeBox([-50, -50, 0], [50, 50, 10]),
  pin: () => R.makeCylinder(5, 40, [0, 0, -10], [0, 0, 1]),
};
const cache = new Map();
const bodyOf = (id) => { if (!cache.has(id)) cache.set(id, SOLIDS[id]()); return cache.get(id); };
const DENSITY = 7850;
const HOLE = Math.PI * 25 * 10; // a Ø10 hole through a 10 mm plate

test('mass properties include the assembly cut: volume, mass and centre of mass exact', () => {
  const asm = { id: 'A', components: [comp('a', 'plate'), comp('b', 'plate', [0, 0, 10])], mates: [] };
  const project = { parts: [], assemblies: [asm] };
  // A Ø10 hole off-centre (x = 20) through both plates.
  createAsmFeature(asm, 'asmHole', { plane: 'top', profile: { kind: 'circle', cx: 20, cy: 0, d: 10 }, comps: [] });
  const shapes = assemblyCutShapes(project, asm, bodyOf, { size: 200 });
  assert.equal(shapes.length, 2);
  for (const s of shapes) { assert.ok(s.cut); near(R.measureVolume(s.shape), 100000 - HOLE, 1e-6); }
  const m = assemblyCutMass(project, asm, bodyOf, () => DENSITY, { size: 200 });
  near(m.volume, 2 * (100000 - HOLE), 1e-6);
  near(m.mass, 2 * (100000 - HOLE) * 1e-9 * DENSITY, 1e-6);
  // x of the centre of mass: the plate's (0) less the hole's moment (20 · HOLE) over what is left.
  near(m.centerOfMass[0], (-20 * HOLE) / (100000 - HOLE), 1e-6);
  near(m.centerOfMass[2], 10, 1e-6);
  // The part itself is untouched.
  near(R.measureVolume(bodyOf('plate')), 100000, 1e-9);
});

test('interference sees the cut: a clearance hole removes the clash with the pin', () => {
  const asm = { id: 'A', components: [comp('p', 'plate'), comp('q', 'pin')], mates: [] };
  const project = { parts: [], assemblies: [asm] };
  const clash = (a) => interferences(a, (c) => assemblyCutShapes(project, a, bodyOf, { size: 200 }).find((x) => x.comp === c)?.shape ?? null, (s) => R.measureVolume(s));
  const before = clash(asm);
  assert.equal(before.length, 1);
  near(before[0].volume, Math.PI * 25 * 10, 1e-6); // the pin through the plate
  // A Ø8 hole only in the plate: the clash shrinks to the ring between Ø8 and Ø10.
  const f = createAsmFeature(asm, 'asmHole', { plane: 'top', profile: { kind: 'circle', cx: 0, cy: 0, d: 8 }, comps: ['p'] });
  const ring = clash(asm);
  near(ring[0].volume, Math.PI * (25 - 16) * 10, 1e-6);
  // Ø12: no clash at all.
  f.profile.d = 12;
  assert.deepEqual(clash(asm), []);
});

test('cuts reach sub-assembly parts; a sub-assembly cut moves with the sub-assembly', () => {
  const sub = { id: 'S', components: [comp('s1', 'plate'), comp('s2', 'plate', [0, 0, 10])], mates: [] };
  const top = { id: 'T', components: [comp('k', null, [300, 0, 0])], mates: [] };
  top.components[0].sub = 'S';
  const project = { parts: [], assemblies: [top, sub] };
  // The sub-assembly's own hole at x = 20 of its frame, only through s2.
  createAsmFeature(sub, 'asmHole', { plane: 'top', profile: { kind: 'circle', cx: 20, cy: 0, d: 10 }, comps: ['s2'] });
  // The top assembly's hole at x = 300 − 30 (−30 in the sub frame) through the whole component.
  createAsmFeature(top, 'asmHole', { plane: 'top', profile: { kind: 'circle', cx: 270, cy: 0, d: 10 }, comps: ['k'] });
  assert.equal(leafCutFeatures(project, top, top.components[0], ['s1']).length, 1);
  assert.equal(leafCutFeatures(project, top, top.components[0], ['s2']).length, 2);
  const shapes = assemblyCutShapes(project, top, bodyOf, { size: 400 });
  const vol = Object.fromEntries(shapes.map((s) => [s.path.join('/'), R.measureVolume(s.shape)]));
  near(vol.s1, 100000 - HOLE, 1e-6);
  near(vol.s2, 100000 - 2 * HOLE, 1e-6);
  // The sub-assembly hole sits at x = 300 + 20 in the top assembly: a probe there misses s2's material.
  const s2 = shapes.find((s) => s.path[0] === 's2').shape;
  const probe = (x) => R.measureVolume(s2.clone().intersect(R.makeCylinder(1, 4, [x, 0, 13], [0, 0, 1])));
  near(probe(320), 0, 1e-9);
  near(probe(270), 0, 1e-9);
  near(probe(300), Math.PI * 4, 1e-6);
  const m = assemblyCutMass(project, top, bodyOf, () => DENSITY, { size: 400 });
  near(m.volume, 200000 - 3 * HOLE, 1e-6);
});

test('a face made by the cut is a face of the cut body and takes an axis mate in the part frame', () => {
  // The plate turned 90° about Z and moved: the hole at assembly (110, 40) is at part (40, −10).
  const c = comp('a', 'plate', [100, 0, 0], quatFromAxisAngle([0, 0, 1], 90));
  const asm = { id: 'A', components: [c], mates: [] };
  const project = { parts: [], assemblies: [asm] };
  createAsmFeature(asm, 'asmHole', { plane: 'top', profile: { kind: 'circle', cx: 110, cy: 40, d: 10 }, comps: ['a'] });
  const cuts = leafCutFeatures(project, asm, c, []);
  const body = cutLeafBody(bodyOf('plate'), c, cuts, 300);
  assert.equal(body.faces.length, 7, 'six box faces and the hole');
  const hole = body.faces.find((f) => isCylinder(f.geomType));
  assert.ok(hole, 'the hole face is pickable on the cut body');
  const ent = mateEntityOfFace(hole, faceSignature);
  assert.equal(ent.kind, 'axis');
  near(Math.abs(ent.dir[2]), 1, 1e-9);
  // The axis point in the part frame, and back in the assembly where the hole was made.
  const t = (ent.point[2] - 0) / ent.dir[2];
  const onAxis = ent.point.map((v, i) => v - ent.dir[i] * t);
  near(onAxis[0], 40, 1e-6); near(onAxis[1], -10, 1e-6);
  const back = placePoint(c, onAxis);
  near(back[0], 110, 1e-6); near(back[1], 40, 1e-6);
  near(faceSignature(hole).radius, 5, 1e-9);
});
