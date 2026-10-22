/* node --test — pure parts of src/js/volume3d.js (the WebGL renderer is checked in a browser). */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const V = require(path.join(__dirname, '..', 'src', 'js', 'volume3d.js'));

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function shuffle(n, seed) { const r = rng(seed), a = Array.from({ length: n }, (_, i) => i); for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
// slice k filled with the value k
const sliceOf = (nx, ny, k) => new Float32Array(nx * ny).fill(k);

test('buildVolume: sorts shuffled slices along the normal from 3D positions', () => {
  const nx = 4, ny = 3, nz = 12, perm = shuffle(nz, 5);
  // oblique stack: orientation rows along x, columns along y rotated 30° about x
  const a = Math.PI / 6;
  const row = [1, 0, 0], col = [0, Math.cos(a), Math.sin(a)];
  const normal = [0, -Math.sin(a), Math.cos(a)];
  const slices = [], positions = [];
  for (const k of perm) { slices.push(sliceOf(nx, ny, k)); positions.push([10 + normal[0] * k * 2.5, -5 + normal[1] * k * 2.5, 30 + normal[2] * k * 2.5]); }
  const v = V.buildVolume({ slices, nx, ny, positions, spacing: [0.7, 0.8], orientation: [...row, ...col] });
  assert.equal(v.nz, nz);
  for (let z = 0; z < nz; z++) assert.equal(v.data[z * nx * ny], z, `slice ${z}`);
  assert.deepEqual(v.order.map((i) => perm[i]), Array.from({ length: nz }, (_, i) => i));
  assert.ok(Math.abs(v.sz - 2.5) < 1e-6);
  assert.equal(v.sx, 0.8); assert.equal(v.sy, 0.7);
  assert.equal(v.min, 0); assert.equal(v.max, nz - 1);
  assert.ok(Math.abs(v.axes.normal[1] - normal[1]) < 1e-9 && Math.abs(v.axes.normal[2] - normal[2]) < 1e-9);
  assert.equal(v.irregular, false);
});

test('buildVolume: positions without orientation, scalar slice locations, no positions', () => {
  const nx = 2, ny = 2, perm = shuffle(8, 2);
  const v = V.buildVolume({ slices: perm.map((k) => sliceOf(nx, ny, k)), nx, ny, positions: perm.map((k) => [0, 0, -k * 3]) });
  // spread along -z; the normal is flipped to +z so the order runs from the lowest z (k = 7) up
  for (let z = 0; z < 8; z++) assert.equal(v.data[z * 4], 7 - z);
  assert.equal(v.sz, 3);
  const s = V.buildVolume({ slices: perm.map((k) => sliceOf(nx, ny, k)), nx, ny, positions: perm.map((k) => k * 1.25 - 40) });
  for (let z = 0; z < 8; z++) assert.equal(s.data[z * 4], z);
  assert.equal(s.sz, 1.25);
  const n = V.buildVolume({ slices: [sliceOf(2, 2, 4), sliceOf(2, 2, 9)], nx: 2, ny: 2, sliceSpacing: 5 });
  assert.equal(n.data[0], 4); assert.equal(n.sz, 5); assert.equal(n.sx, 1); assert.equal(n.sy, 1);
});

test('buildVolume: median slice gap ignores duplicates and flags uneven spacing', () => {
  const locs = [0, 2, 4, 4, 6, 8, 13];
  const v = V.buildVolume({ slices: locs.map((l) => sliceOf(1, 1, l)), nx: 1, ny: 1, positions: locs });
  assert.equal(v.sz, 2);
  assert.equal(v.irregular, true);
});

test('buildVolume: NaN is replaced with the minimum, the range ignores it; uint16 output', () => {
  const a = new Float32Array([NaN, -100, 50, NaN]), b = new Float32Array([200, NaN, Infinity, 0]);
  const v = V.buildVolume({ slices: [a, b], nx: 2, ny: 2 });
  assert.equal(v.min, -100); assert.equal(v.max, 200);
  for (const x of v.data) assert.ok(Number.isFinite(x));
  assert.equal(v.data[0], -100); assert.equal(v.data[5], -100);
  const u = V.buildVolume({ slices: [a, b], nx: 2, ny: 2, format: 'uint16' });
  assert.ok(u.data instanceof Uint16Array);
  assert.equal(u.data[1], 0); assert.equal(u.data[4], 65535);
  assert.ok(Math.abs(V.normValue(u, 2) - V.normValue(v, 2)) < 1e-4);
  assert.throws(() => V.buildVolume({ slices: [], nx: 2, ny: 2 }));
  assert.throws(() => V.buildVolume({ slices: [new Float32Array(3)], nx: 2, ny: 2 }));
});

test('planTexture: down-sampling decision', () => {
  const p0 = V.planTexture({ nx: 512, ny: 512, nz: 300 }, { maxSize: 2048, maxBytes: 512 * 2 ** 20, bytesPerVoxel: 2 });
  assert.equal(p0.downsampled, false); assert.equal(p0.bytes, 512 * 512 * 300 * 2);
  // axis over the 3D texture limit
  const p1 = V.planTexture({ nx: 512, ny: 512, nz: 600 }, { maxSize: 256, maxBytes: 2 ** 40 });
  assert.deepEqual([p1.nx, p1.ny, p1.nz], [256, 256, 200]); assert.deepEqual([p1.fx, p1.fy, p1.fz], [2, 2, 3]);
  // memory budget: 512×512×1000 × 4 B = 1 GB > 256 MB
  const p2 = V.planTexture({ nx: 512, ny: 512, nz: 1000 }, { maxSize: 2048, maxBytes: 256 * 2 ** 20, bytesPerVoxel: 4 });
  assert.ok(p2.downsampled && p2.bytes <= 256 * 2 ** 20);
  assert.ok(p2.fz >= 2, 'the longest axis is reduced first');
  for (const k of ['nx', 'ny', 'nz']) assert.ok(p2[k] >= 1);
  // the box average keeps a constant volume constant and scales the spacing
  const data = new Float32Array(6 * 4 * 5).fill(7); data[0] = 7;
  const vol = { data, format: 'float32', nx: 6, ny: 4, nz: 5, sx: 1, sy: 1, sz: 2, min: 7, max: 7 };
  const d = V.downsample(vol, V.planTexture(vol, { maxSize: 3 }));
  assert.deepEqual([d.nx, d.ny, d.nz], [3, 2, 3]); assert.equal(d.sx, 2); assert.equal(d.sz, 4);
  for (const x of d.data) assert.equal(x, 7);
});

test('transfer presets: positions increase, colours and opacity in 0..1, LUT built', () => {
  const ids = Object.keys(V.TRANSFER_PRESETS);
  for (const id of ['ct-bone', 'ct-soft', 'ct-lung', 'ct-angio', 'mr-default', 'mip-gray']) assert.ok(ids.includes(id), id);
  for (const [id, p] of Object.entries(V.TRANSFER_PRESETS)) {
    assert.ok(['value', 'relative'].includes(p.space), id);
    assert.ok(p.points.length >= 2);
    for (let i = 0; i < p.points.length; i++) {
      const pt = p.points[i];
      assert.equal(pt.length, 5);
      for (let c = 1; c < 5; c++) assert.ok(pt[c] >= 0 && pt[c] <= 1, `${id} point ${i}`);
      if (i) assert.ok(pt[0] > p.points[i - 1][0], `${id} positions increase at ${i}`);
    }
    if (p.space === 'relative') { assert.equal(p.points[0][0], 0); assert.equal(p.points[p.points.length - 1][0], 1); }
    const lut = V.buildTransferLUT(id, -1024, 3071, { size: 256 });
    assert.equal(lut.length, 1024);
  }
  // bone: air transparent, cortical bone opaque
  const lut = V.buildTransferLUT('ct-bone', -1024, 3071, { size: 4096 });
  const at = (hu) => lut[Math.round((hu + 1024) / 4095 * 4095) * 4 + 3];
  assert.equal(at(-1000), 0); assert.equal(at(0), 0); assert.ok(at(1000) > 180);
  // shift moves the curve, opacity scales it
  const sh = V.buildTransferLUT('ct-bone', -1024, 3071, { size: 4096, shift: 500 });
  assert.ok(sh[Math.round(1000 + 1024) * 4 + 3] < lut[Math.round(1000 + 1024) * 4 + 3]);
  const half = V.buildTransferLUT('mr-default', 0, 1, { size: 16, opacity: 0.5 }), full = V.buildTransferLUT('mr-default', 0, 1, { size: 16 });
  assert.ok(Math.abs(half[15 * 4 + 3] - full[15 * 4 + 3] / 2) <= 1);
});

test('camera presets are right-handed and labels read as expected', () => {
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  for (const [id, v] of Object.entries(V.VIEWS)) {
    const c = cross(v.u, v.b);
    assert.deepEqual(c.map((x) => Math.round(x) + 0), v.r.map((x) => x + 0), id);
  }
  assert.equal(V.dirLabel(V.VIEWS.anterior.r), 'L');
  assert.equal(V.dirLabel(V.VIEWS.anterior.u), 'S');
  assert.equal(V.dirLabel(V.VIEWS.left.r), 'P');
  assert.equal(V.dirLabel([0.7, -0.7, 0]), 'LA');
  assert.equal(V.SIZE.width, 1100);
  assert.equal(typeof V.dialog, 'function');
  // the dialog's built-in English / Korean fallbacks have the same keys
  assert.deepEqual(Object.keys(V.I18N.ko).sort(), Object.keys(V.I18N.en).sort());
});
