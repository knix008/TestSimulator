// Security cameras look down (the usual aim) and the lens sits on the body (src/library/parametric/security2.js,
// security-moved.js). A lens floating a body-length away, or centred above the housing, is the old fault.
// Run: node --test test/unit/cameras.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { withDefaults } from '../../src/library/parametric/helpers.js';
import { ITEMS as moved } from '../../src/library/parametric/security-moved.js';
import { ITEMS as more } from '../../src/library/parametric/security2.js';

const ctx = { quality: 'high', material: () => new THREE.MeshStandardMaterial() };
const cameras = [...moved, ...more].filter((item) => /camera|cctv/i.test(`${item.id} ${item.en}`));

function boxesOf(group) {
  const boxes = {};
  group.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    (boxes[o.name] ??= new THREE.Box3()).union(o.geometry.boundingBox);
  });
  return boxes;
}

test('every security camera builds, and its lens is part of the body', () => {
  assert.ok(cameras.length >= 30, `${cameras.length} cameras`);
  const detached = [];
  for (const item of cameras) {
    const group = item.build(withDefaults(item, {}), ctx);
    assert.ok(group.children.length, `${item.id} built nothing`);
    const { housing, lens } = boxesOf(group);
    if (!housing || !lens) continue;
    if (!housing.intersectsBox(lens.clone().expandByScalar(0.02))) detached.push(item.id);
  }
  assert.deepEqual(detached, []);
});

test('bullet, turret and box cameras look down, not up', () => {
  const aimed = cameras.filter((item) => /bullet|turret|box|dual/.test(item.id));
  assert.ok(aimed.length >= 8, `${aimed.length} aimed cameras`);
  for (const item of aimed) {
    const { housing, lens } = boxesOf(item.build(withDefaults(item, {}), ctx));
    assert.ok(housing && lens, `${item.id} has a body and a lens`);
    const body = housing.getCenter(new THREE.Vector3());
    const glass = lens.getCenter(new THREE.Vector3());
    assert.ok(glass.y <= body.y + 0.015, `${item.id}: the lens is above the body (${(glass.y - body.y).toFixed(3)} m)`);
  }
});
