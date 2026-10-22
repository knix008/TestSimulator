/* node --test — src/js/imageFilters.js on synthetic images. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const F = require(path.join(__dirname, '..', 'src', 'js', 'imageFilters.js'));

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const stats = (v) => { let n = 0, s = 0, s2 = 0; for (const x of v) if (x === x) { n++; s += x; s2 += x * x; } const m = s / n; return { mean: m, variance: s2 / n - m * m }; };
function noise(w, h, mean, amp, seed = 1) { const r = rng(seed), v = new Float32Array(w * h); for (let i = 0; i < v.length; i++) v[i] = mean + (r() - 0.5) * 2 * amp; return v; }
function stepImage(w, h, lo, hi, at = w >> 1) { const v = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) v[y * w + x] = x < at ? lo : hi; return v; }
const noNaN = (v) => { for (let i = 0; i < v.length; i++) if (v[i] !== v[i]) return false; return true; };

test('filters: list, param specs and defaults', () => {
  const ids = F.FILTERS.map((f) => f.id);
  for (const id of ['smooth', 'sharpen', 'edge', 'emboss', 'median', 'laplacian', 'invert', 'equalize', 'denoise', 'threshold']) assert.ok(ids.includes(id), id);
  for (const f of F.FILTERS) {
    assert.ok(f.label);
    for (const p of f.params) { assert.ok(p.name && p.type); assert.ok('default' in p); }
    assert.deepEqual(Object.keys(F.defaults(f.id)), f.params.map((p) => p.name));
  }
  assert.throws(() => F.apply('nope', { values: new Float32Array(4), width: 2, height: 2 }));
});

test('smooth: Gaussian keeps the mean and lowers the variance', () => {
  const w = 128, h = 128, v = noise(w, h, 100, 50);
  const a = stats(v);
  const r = F.apply('smooth', { values: v, width: w, height: h }, { sigma: 2 });
  const b = stats(r.values);
  assert.ok(Math.abs(a.mean - b.mean) < 0.5, `mean ${a.mean} → ${b.mean}`);
  assert.ok(b.variance < a.variance / 10, `variance ${a.variance} → ${b.variance}`);
  const k = F.gaussKernel(1.5); assert.ok(Math.abs(k.reduce((s, x) => s + x, 0) - 1) < 1e-6);
  assert.equal(v[0], noise(w, h, 100, 50)[0], 'input untouched');
});

test('sharpen: unsharp mask raises the contrast across an edge', () => {
  const w = 64, h = 32;
  // a soft edge (ramp over 8 px)
  const v = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) v[y * w + x] = Math.min(1, Math.max(0, (x - 28) / 8)) * 100;
  const r = F.apply('sharpen', { values: v, width: w, height: h }, { amount: 1.5, radius: 2 }).values;
  const grad = (a) => { let m = 0; for (let x = 1; x < w; x++) m = Math.max(m, Math.abs(a[16 * w + x] - a[16 * w + x - 1])); return m; };
  assert.ok(grad(r) > grad(v) * 1.3, `max gradient ${grad(v)} → ${grad(r)}`);
  // overshoot either side of the edge (the classic unsharp look)
  assert.ok(Math.min(...r) < -1 && Math.max(...r) > 101);
});

test('edge: Sobel magnitude peaks on the edge and is ~0 elsewhere', () => {
  const w = 40, h = 20, v = stepImage(w, h, 0, 100, 20);
  const r = F.apply('edge', { values: v, width: w, height: h }).values;
  const row = Array.from(r.subarray(10 * w, 11 * w));
  const peak = row.indexOf(Math.max(...row));
  assert.ok(peak === 19 || peak === 20, `peak at ${peak}`);
  assert.ok(row[19] > 300 && row[20] > 300);
  assert.equal(row[5], 0); assert.equal(row[35], 0);
  assert.ok(noNaN(r));
});

test('median: removes salt-and-pepper noise', () => {
  const w = 64, h = 64, v = new Float32Array(w * h).fill(50);
  const r0 = rng(7);
  let salted = 0;
  for (let i = 0; i < v.length; i++) { const q = r0(); if (q < 0.05) { v[i] = 1000; salted++; } else if (q < 0.08) v[i] = -1000; }
  assert.ok(salted > 100);
  for (const size of [3, 5]) {
    const r = F.apply('median', { values: v, width: w, height: h }, { size }).values;
    let bad = 0; for (const x of r) if (x !== 50) bad++;
    assert.ok(bad < (size === 3 ? 20 : 2), `size ${size}: ${bad} pixels still noisy`);
  }
});

test('equalize: spreads a narrow histogram over the original range', () => {
  const w = 100, h = 100, v = new Float32Array(w * h);
  // 90 % of the pixels between 0 and 10, the rest up to 1000
  const r0 = rng(3);
  for (let i = 0; i < v.length; i++) v[i] = r0() < 0.9 ? r0() * 10 : 10 + r0() * 990;
  v[0] = 0; v[1] = 1000;
  const r = F.apply('equalize', { values: v, width: w, height: h }).values;
  const rv = F.rangeOf(r);
  assert.ok(rv.min >= 0 && rv.max <= 1000 + 1e-3);
  const sorted = Float32Array.from(v).sort(), sr = Float32Array.from(r).sort();
  const med = (a) => a[a.length >> 1];
  assert.ok(med(v) < 10 && med(sr) > 400 && med(sr) < 600, `median ${med(v)} → ${med(sr)}`);
  void sorted;
  // monotonic mapping
  const idx = Array.from(v.keys()).sort((a, b) => v[a] - v[b]);
  for (let i = 1; i < idx.length; i++) assert.ok(r[idx[i]] >= r[idx[i - 1]] - 1e-3);
});

test('invert twice is the identity (values and RGBA)', () => {
  const w = 33, h = 17, v = noise(w, h, -200, 800, 5);
  const once = F.apply('invert', { values: v, width: w, height: h }).values;
  const twice = F.apply('invert', { values: once, width: w, height: h }).values;
  for (let i = 0; i < v.length; i++) assert.ok(Math.abs(twice[i] - v[i]) < 1e-3);
  const rgba = new Uint8ClampedArray(w * h * 4); const r0 = rng(9); for (let i = 0; i < rgba.length; i++) rgba[i] = r0() * 256;
  const a = F.apply('invert', { rgba, width: w, height: h }).rgba;
  const b = F.apply('invert', { rgba: a, width: w, height: h }).rgba;
  for (let i = 0; i < rgba.length; i++) if (i % 4 !== 3) assert.equal(b[i], rgba[i]); else assert.equal(a[i], rgba[i], 'alpha kept');
});

test('threshold, laplacian, emboss, denoise behave', () => {
  const w = 40, h = 20, v = stepImage(w, h, 0, 100, 20);
  const t = F.apply('threshold', { values: v, width: w, height: h }, { value: 50 }).values;
  assert.equal(t[0], 0); assert.equal(t[w - 1], 100);
  const lap = F.apply('laplacian', { values: v, width: w, height: h }).values;
  assert.equal(lap[10 * w + 5], 0); assert.ok(lap[10 * w + 19] > 0 && lap[10 * w + 20] < 0);
  const em = F.apply('emboss', { values: v, width: w, height: h }).values;
  assert.equal(em[10 * w + 5], 0); assert.equal(em[10 * w + 35], 100); assert.notEqual(em[10 * w + 20], 100);
  // bilateral: flattens noise but keeps the step
  const noisy = new Float32Array(v.length); const r0 = rng(11);
  for (let i = 0; i < v.length; i++) noisy[i] = v[i] + (r0() - 0.5) * 10;
  const d = F.apply('denoise', { values: noisy, width: w, height: h }, { sigmaSpatial: 1.5, sigmaRange: 0.1 }).values;
  const flat = (a) => stats(Array.from({ length: 10 }, (_, x) => a[10 * w + 3 + x])).variance;
  assert.ok(flat(d) < flat(noisy) / 3, `variance ${flat(noisy)} → ${flat(d)}`);
  assert.ok(d[10 * w + 17] < 15 && d[10 * w + 22] > 85, 'edge kept');
});

test('borders and NaN padding: no NaN appears, NaN stays where it was', () => {
  const w = 31, h = 23, v = noise(w, h, 0, 100, 13);
  const pad = new Float32Array(v); for (let y = 0; y < h; y++) for (let x = 0; x < 4; x++) pad[y * w + x] = NaN;
  for (const f of F.FILTERS) {
    const r = F.apply(f.id, { values: v, width: w, height: h }).values;
    assert.ok(noNaN(r), `${f.id} made NaN`);
    const rp = F.apply(f.id, { values: pad, width: w, height: h }).values;
    for (let i = 0; i < rp.length; i++) assert.equal(rp[i] !== rp[i], pad[i] !== pad[i], `${f.id} NaN at ${i}`);
    const rgba = new Uint8ClampedArray(w * h * 4).fill(120);
    const rr = F.apply(f.id, { rgba, width: w, height: h }).rgba;
    assert.equal(rr.length, rgba.length);
  }
  // tiny images
  for (const f of F.FILTERS) assert.ok(noNaN(F.apply(f.id, { values: new Float32Array([5]), width: 1, height: 1 }).values), f.id);
});

test('timing: every filter on 512×512 under 150 ms', () => {
  const w = 512, h = 512, v = noise(w, h, 0, 1000, 21);
  const rgba = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 37) & 255;
  const times = {};
  for (const f of F.FILTERS) {
    F.apply(f.id, { values: v, width: w, height: h });   // warm-up (JIT)
    const t0 = process.hrtime.bigint();
    F.apply(f.id, { values: v, width: w, height: h });
    times[f.id] = Number(process.hrtime.bigint() - t0) / 1e6;
  }
  console.log('  filter ms (512²):', Object.entries(times).map(([k, ms]) => `${k} ${ms.toFixed(1)}`).join(', '));
  for (const [id, ms] of Object.entries(times)) assert.ok(ms < 150, `${id}: ${ms.toFixed(1)} ms`);
});
