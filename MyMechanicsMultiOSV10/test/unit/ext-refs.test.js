// External references (top-down design): a face of another component kept in the edited part's frame, moved when
// the assembly changes (unless locked), and broken into a fixed plane that the features keep.
import test from 'node:test';
import assert from 'node:assert/strict';
import { frameBetween, addExternalRef, updateExternalRefs, breakExternalRefs, inContextFeatures } from '../../src/cad/ext-refs.js';
import { resolvePlane } from '../../src/cad/features.js';
import { quatIdentity, quatFromAxisAngle } from '../../src/cad/assembly.js';

const at = (position, rotation = quatIdentity()) => ({ position, rotation });
const nearV = (a, b) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-9, `${a} vs ${b}`));

test('a face frame of B in A\'s frame', () => {
  const f = frameBetween({ origin: [0, 0, 10], xDir: [1, 0, 0], normal: [0, 0, 1] }, at([5, 0, 0]), at([0, 0, 0], quatFromAxisAngle([0, 0, 1], 90)));
  nearV(f.origin, [-5, 0, 10]); nearV(f.xDir, [0, 1, 0]); nearV(f.normal, [0, 0, 1]);
});

test('references are added once, followed on update, kept when locked, broken into fixed planes', () => {
  const part = { id: 'p', features: [{ id: 's1', type: 'sketch', plane: { kind: 'ext', id: null } }] };
  let n = 0;
  const id = addExternalRef(part, { asm: 'A', at: 'cA', comp: 'cB', sig: { x: 1 }, frame: { origin: [0, 0, 10], xDir: [1, 0, 0], normal: [0, 0, 1] } }, () => `x${++n}`);
  assert.equal(addExternalRef(part, { asm: 'A', at: 'cA', comp: 'cB', sig: { x: 1 }, frame: { origin: [0, 0, 10], xDir: [1, 0, 0], normal: [0, 0, 1] } }, () => `x${++n}`), id);
  part.features[0].plane.id = id;
  assert.equal(inContextFeatures(part).length, 1);
  // resolvePlane reads the reference from the part.
  nearV(resolvePlane({ kind: 'ext', id }, { part }).origin, [0, 0, 10]);
  // B moves up 20: the plane follows.
  const places = { cA: at([0, 0, 0]), cB: at([0, 0, 20]) };
  const face = () => ({ origin: [0, 0, 10], xDir: [1, 0, 0], normal: [0, 0, 1] });
  const r = updateExternalRefs(part, face, (a, c) => places[c]);
  assert.equal(r.updated, 1);
  nearV(part.externalRefs[0].frame.origin, [0, 0, 30]);
  // Locked: stays.
  part.externalRefs[0].locked = true; places.cB = at([0, 0, 50]);
  assert.equal(updateExternalRefs(part, face, (a, c) => places[c]).updated, 0);
  nearV(part.externalRefs[0].frame.origin, [0, 0, 30]);
  // A face that is gone is reported.
  delete part.externalRefs[0].locked;
  assert.deepEqual(updateExternalRefs(part, () => null, (a, c) => places[c]).missing, [id]);
  // Broken: the sketch keeps a fixed plane there.
  assert.equal(breakExternalRefs(part), 1);
  assert.equal(part.externalRefs.length, 0);
  assert.equal(part.features[0].plane.kind, 'frame');
  nearV(resolvePlane(part.features[0].plane, { part }).origin, [0, 0, 30]);
});
