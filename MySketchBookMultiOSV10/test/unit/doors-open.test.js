// Opening and closing doors, the software-renderer check and the cached length formatter
// (src/app.js swingDoors uses each door item's `open` angle; engine/software-gpu.js; engine/document.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PARAMETRIC_ITEMS } from '../../src/library/parametric/index.js';
import { formatLength } from '../../src/engine/document.js';
import { isSoftwareRenderer, isSoftwareRendererName } from '../../src/engine/software-gpu.js';

const MAT = new THREE.MeshBasicMaterial();
const DOORS = PARAMETRIC_ITEMS.filter((i) => i.category === 'doors');
const OPENABLE = DOORS.filter((i) => i.params?.some((p) => p.key === 'open'));

/** The door built with `open` (low quality, wall 0.2 m): the box of every part, in a stable order. */
function partsAt(item, open) {
  const params = Object.fromEntries(item.params.map((p) => [p.key, p.default]));
  const g = item.build({ ...params, open }, { quality: 'low', wallThickness: 0.2, material: () => MAT, THREE });
  g.updateMatrixWorld(true);
  const boxes = [];
  g.traverse((o) => { if (o.isMesh) { const b = new THREE.Box3().setFromObject(o); boxes.push({ name: o.name, b }); } });
  return { all: new THREE.Box3().setFromObject(g), boxes };
}

test('doors: most door items can open; `open` runs from 0 (closed, the default) up to its max', () => {
  assert.ok(DOORS.length >= 50, `door items (${DOORS.length})`);
  assert.ok(OPENABLE.length >= 40, `openable doors (${OPENABLE.length})`);
  for (const item of OPENABLE) {
    const spec = item.params.find((p) => p.key === 'open');
    assert.equal(spec.default ?? 0, 0, `${item.id}: closed by default`);
    assert.equal(spec.min ?? 0, 0, `${item.id}: min 0`);
    // Degrees for hinged doors (up to 90–180°), a fraction for sliding ones (up to 0.9–1).
    assert.ok(spec.max > 0 && spec.max <= 180, `${item.id}: max ${spec.max}`);
  }
});

test('doors: opened to the max, every openable door moves a part (leaf, panel); closed again it is as built', () => {
  for (const item of OPENABLE) {
    const spec = item.params.find((p) => p.key === 'open');
    const closed = partsAt(item, 0);
    const open = partsAt(item, spec.max);
    const again = partsAt(item, 0);
    const moved = closed.boxes.some((c, i) => {
      const o = open.boxes[i];
      return !o || o.name !== c.name || o.b.min.distanceTo(c.b.min) > 0.02 || o.b.max.distanceTo(c.b.max) > 0.02;
    }) || open.boxes.length !== closed.boxes.length;
    assert.ok(moved, `${item.id}: open ${spec.max} moves nothing`);
    assert.ok(again.all.min.distanceTo(closed.all.min) < 1e-9 && again.all.max.distanceTo(closed.all.max) < 1e-9, `${item.id}: closed again = as built`);
  }
});

test('doors: a hinged door opened 90° reaches out of the wall by about its leaf width', () => {
  const item = PARAMETRIC_ITEMS.find((i) => i.id === 'door-single');
  const closed = partsAt(item, 0).all; const open = partsAt(item, 90).all;
  const depth = (b) => b.max.z - b.min.z;
  assert.ok(depth(closed) < 0.4, `closed: in the wall (${depth(closed).toFixed(2)} m)`);
  assert.ok(depth(open) > 0.6, `open: the leaf sticks out (${depth(open).toFixed(2)} m)`);
});

test('software renderer: SwiftShader, llvmpipe, WARP and Basic Render are software; real GPUs are not', () => {
  for (const name of [
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
    'llvmpipe (LLVM 15.0.7, 256 bits)', 'softpipe', 'lavapipe', 'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Microsoft, WARP, D3D11)',
  ]) assert.equal(isSoftwareRendererName(name), true, name);
  for (const name of [
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'ANGLE (Intel, Intel(R) UHD Graphics 770 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (AMD, AMD Radeon RX 7800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Apple M2', 'Mali-G78', '', null,
  ]) assert.equal(isSoftwareRendererName(name), false, String(name));
});

test('software renderer: read from the WebGL context (debug info, then RENDERER), never throws', () => {
  const gl = (name, debug = true) => ({ RENDERER: 0x1f01, getExtension: () => (debug ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : null), getParameter: (p) => (p === (debug ? 0x9246 : 0x1f01) ? name : 'other') });
  assert.equal(isSoftwareRenderer(gl('SwiftShader')), true);
  assert.equal(isSoftwareRenderer(gl('NVIDIA GeForce')), false);
  assert.equal(isSoftwareRenderer(gl('llvmpipe', false)), true, 'without the debug extension');
  assert.equal(isSoftwareRenderer({ getExtension() { throw new Error('lost'); } }), false, 'a lost context');
});

test('formatLength: cached formatters give the same text as toLocaleString', () => {
  const units = { mm: 0, cm: 1, m: 3, in: 2 };
  const factor = { mm: 1000, cm: 100, m: 1, in: 1 / 0.0254 };
  for (const [u, digits] of Object.entries(units)) {
    for (const metres of [0, 0.0004, 0.1234, 1, 2.4, 10.25, 1234.5678, -3.21]) {
      const v = metres * factor[u];
      const expected = Number(v.toFixed(digits)).toLocaleString('en-US', { maximumFractionDigits: digits });
      assert.equal(formatLength(metres, u), `${expected} ${u}`, `${metres} m in ${u}`);
      assert.equal(formatLength(metres, u, { suffix: false }), expected);
    }
  }
  assert.equal(formatLength(10.25, 'mm'), '10,250 mm');
  assert.equal(formatLength(2.4, 'm'), '2.4 m');
});
