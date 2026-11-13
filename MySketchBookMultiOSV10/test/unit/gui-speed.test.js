// What keeps the GUI quick, checked without a browser:
//  - fast glass (Viewport.setFastGlass): moving and 2D frames turn transmission off (it makes three.js draw the
//    scene twice); the still frame gets the very same glass back, and new glass added meanwhile is caught;
//  - chip grids (ui/fillrows.js): the last chip spans what is left of its row, so no row ends with a hole.
// Run: node --test test/unit/gui-speed.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Viewport } from '../../src/engine/viewport.js';
import { fillLastRow } from '../../src/ui/fillrows.js';

const glass = () => new THREE.MeshPhysicalMaterial({ transmission: 1, opacity: 0.25, transparent: true, roughness: 0.05 });

test('fast glass: off while moving, the same glass back for the still frame, new glass caught', () => {
  const scene = new THREE.Scene();
  const a = glass();
  const plain = new THREE.MeshStandardMaterial({ color: '#888888' });
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), a), new THREE.Mesh(new THREE.BoxGeometry(), plain), new THREE.Mesh(new THREE.BoxGeometry(), [a, plain]));
  const vp = { scene };
  const fast = (on) => Viewport.prototype.setFastGlass.call(vp, on);
  fast(true);
  assert.equal(a.transmission, 0, 'no transmission pass while moving');
  assert.ok(a.transparent && a.opacity <= 0.3 && a.depthWrite === false, 'see-through instead');
  assert.equal(vp.glassSaved.length, 1, 'shared materials once');
  fast(false);
  assert.deepEqual([a.transmission, a.opacity, a.transparent], [1, 0.25, true], 'the very same glass again');
  assert.equal(a.userData.fastGlass, undefined);
  assert.equal(plain.transparent, false, 'other materials untouched');
  // Glass added while fast (a new object) is caught once the content changed.
  fast(true);
  const b = glass();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), b));
  vp.glassStale = true;
  fast(true);
  assert.equal(b.transmission, 0, 'new glass too');
  fast(false);
  assert.equal(b.transmission, 1);
});

test('chip rows: the last chip fills the holes of its row, for any number of columns', () => {
  const realStyle = globalThis.getComputedStyle;
  try {
    for (const [count, cols, span] of [[25, 2, 'span 2'], [24, 2, ''], [25, 3, 'span 3'], [26, 3, 'span 2'], [27, 4, 'span 2'], [24, 3, ''], [5, 1, '']]) {
      const children = Array.from({ length: count }, () => ({ style: { gridColumn: 'old' } }));
      const grid = { children };
      globalThis.getComputedStyle = () => ({ gridTemplateColumns: Array(cols).fill('98px').join(' ') });
      fillLastRow(grid);
      assert.equal(children.at(-1).style.gridColumn, span, `${count} chips in ${cols} columns`);
      assert.equal(children[0].style.gridColumn, 'old', 'only the last chip changes');
    }
  } finally { globalThis.getComputedStyle = realStyle; }
});
