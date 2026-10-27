// Interpolation, piecewise polynomials, triangulation and trapezoidal integration.
import { test } from 'node:test';
import { call, c1, V, C, D, close, relClose, makeCtx, assert, num, str } from './linalg-util.mjs';
import { classes } from '../core/lib/linalg/index.js';
import { tensor, cell, isStruct } from '../core/value.js';

const seq = (a, b, n) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
const sub = (obj, cls, subs, nargout = 1) => classes[cls].subsref(obj, subs, nargout, makeCtx());

test('interp1: linear, nearest, next, previous, extrapolation', () => {
  const x = V([1, 2, 3]), v = V([10, 20, 40]);
  close(c1('interp1', [x, v, V([1.5, 2.5, 3])]), [15, 30, 40]);
  const o = c1('interp1', [x, v, V([0, 4])]);
  assert.ok(Number.isNaN(o.re[0]) && Number.isNaN(o.re[1]));
  close(c1('interp1', [x, v, V([0, 4]), str('linear'), str('extrap')]), [0, 60]);
  close(c1('interp1', [x, v, V([0, 4]), str('linear'), num(-1)]), [-1, -1]);
  close(c1('interp1', [x, v, V([1.4, 1.5, 2.6]), str('nearest')]), [10, 20, 40]);
  close(c1('interp1', [x, v, V([1.2, 2, 2.1]), str('next')]), [20, 20, 40]);
  close(c1('interp1', [x, v, V([1.2, 2, 2.9]), str('previous')]), [10, 20, 20]);
  close(c1('interp1', [v, V([1.5])]), [15]);
  // unsorted x, matrix v (columns), NaN query, complex v
  close(c1('interp1', [V([3, 1, 2]), V([[40, 4], [10, 1], [20, 2]]), V([[1.5], [NaN]])]), [[15, 1.5], [NaN, NaN]]);
  close(c1('interp1', [x, C([[1, 2, 3]], [[1, 1, 0]]), V([2.5])]), C([[2.5]], [[0.5]]));
  assert.throws(() => c1('interp1', [V([1, 1, 2]), V([1, 2, 3]), V([1.5])]), /unique/);
  assert.throws(() => c1('interp1', [x, v, V([1]), str('bogus')]), /Invalid interpolation method/);
});
test('interp1: spline, pchip, makima, cubic reproduce polynomials / preserve shape', () => {
  const x = seq(0, 3, 7), q = seq(-0.5, 3.5, 17);
  const cub = (t) => t ** 3 - 2 * t + 1;
  close(c1('interp1', [V(x), V(x.map(cub)), V(q), str('spline')]), q.map(cub), 1e-12, 'not-a-knot reproduces cubics');
  const lin = (t) => 2 * t - 1;
  for (const m of ['pchip', 'makima', 'cubic']) close(c1('interp1', [V(x), V(x.map(lin)), V(seq(0, 3, 9)), str(m)]), seq(0, 3, 9).map(lin), 1e-13, m);
  // pchip is monotone for monotone data (no overshoot)
  const xs = [0, 1, 2, 3, 4], ys = [0, 0, 0, 1, 1];
  const vq = c1('interp1', [V(xs), V(ys), V(seq(0, 4, 41)), str('pchip')]);
  assert.ok(Array.from(vq.re).every((v) => v >= -1e-15 && v <= 1 + 1e-15));
  for (let i = 1; i < vq.re.length; i++) assert.ok(vq.re[i] >= vq.re[i - 1] - 1e-15);
  // known pchip / spline values
  close(c1('interp1', [V([1, 2, 3, 4]), V([1, 4, 9, 16]), V([2.5]), str('pchip')]), [6.25], 0.05);
  close(c1('interp1', [V([1, 2, 3, 4]), V([1, 4, 9, 16]), V([2.5]), str('spline')]), [6.25], 1e-13);
  // pchip extrapolates by default
  assert.ok(Number.isFinite(c1('interp1', [V(xs), V(ys), V([5]), str('pchip')]).re[0]));
  const pp = c1('interp1', [V([1, 2, 3]), V([1, 4, 9]), str('spline'), str('pp')]);
  assert.ok(isStruct(pp));
  close(c1('ppval', [pp, V([2.5])]), [6.25], 1e-13);
});
test('spline: not-a-knot, clamped, vector-valued; pchip/makima functions', () => {
  const x = [0, 1, 2, 3, 4];
  const y = x.map((t) => Math.sin(t));
  const pp = c1('spline', [V(x), V(y)]);
  assert.equal(pp.data[0].pieces.re[0], 4); assert.equal(pp.data[0].order.re[0], 4);
  close(c1('ppval', [pp, V(x)]), y, 1e-14, 'interpolates');
  // clamped: endslopes given as extra values
  const yc = [0].concat(x.map((t) => t * t), [8]);
  close(c1('spline', [V(x), V(yc), V([0.5, 2.5])]), [0.25, 6.25], 1e-13, 'clamped reproduces t^2');
  // vector valued (2 x n)
  const Y = V([[0, 1, 4, 9], [0, 1, 8, 27]]);
  const vv = c1('spline', [V([0, 1, 2, 3]), Y, V([1.5])]);
  assert.deepEqual(vv.dims, [2, 1]); close(vv, [[2.25], [3.375]], 1e-12);
  close(c1('pchip', [V([0, 1, 2]), V([0, 1, 2]), V([0.5, 1.5])]), [0.5, 1.5], 1e-15);
  close(c1('makima', [V([0, 1, 2, 3]), V([0, 2, 4, 6]), V([2.5])]), [5], 1e-15);
  // makima avoids overshoot on flat regions
  const mk = c1('makima', [V([1, 2, 3, 4, 5, 6]), V([0, 0, 0, 1, 1, 1]), V(seq(1, 3, 9))]);
  assert.ok(Array.from(mk.re).every((v) => Math.abs(v) < 1e-15));
  assert.throws(() => c1('spline', [V([1, 2, 3]), V([1, 2])]), /incompatible/);
});
test('mkpp, unmkpp, ppval on matrices', () => {
  const pp = c1('mkpp', [V([0, 1, 3]), V([[1, 0, 0], [2, 1, 0]])]);
  // piece 1: x^2 on [0,1); piece 2: 2(x-1)^2 + (x-1) on [1,3]
  close(c1('ppval', [pp, V([[0.5, 2], [3, -1]])]), [[0.25, 3], [10, 1]]);
  const [b, co, l, k, d] = call('unmkpp', [pp], 5);
  close(b, [0, 1, 3]); close(co, [[1, 0, 0], [2, 1, 0]]); assert.equal(l.re[0], 2); assert.equal(k.re[0], 3); assert.equal(d.re[0], 1);
  assert.throws(() => c1('mkpp', [V([0, 1, 2]), V([1, 2, 3])]), /incompatible/);
});
test('interp2: linear exact on bilinear data, nearest, spline, cubic, grids and extrapval', () => {
  const xg = [1, 2, 3, 4], yg = [10, 20, 30];
  const f = (x, y) => 2 * x + 0.5 * y + 0.1 * x * y;
  const Vm = V(yg.map((y) => xg.map((x) => f(x, y))));
  const q = c1('interp2', [V(xg), V(yg), Vm, V([1.5, 3.2]), V([15, 27])]);
  close(q, [f(1.5, 15), f(3.2, 27)], 1e-13);
  // grid vectors of different orientation → full grid
  const G = c1('interp2', [V(xg), V(yg), Vm, V([1.5, 2.5, 3.5]), V([[12], [25]])]);
  assert.deepEqual(G.dims, [2, 3]);
  close(G, [[f(1.5, 12), f(2.5, 12), f(3.5, 12)], [f(1.5, 25), f(2.5, 25), f(3.5, 25)]], 1e-12);
  close(c1('interp2', [V(xg), V(yg), Vm, V([1.4]), V([26]), str('nearest')]), [f(1, 30)]);
  const cubicF = (x, y) => x ** 3 - y * y * x / 100 + 3;
  const Vc = V(yg.map((y) => xg.map((x) => cubicF(x, y))));
  close(c1('interp2', [V(xg), V(yg), Vc, V([2.5]), V([15]), str('spline')]), [cubicF(2.5, 15)], 1e-10, 'spline exact for cubic x quadratic');
  const cq = c1('interp2', [V(xg), V(yg), Vc, V([2.5]), V([15]), str('cubic')]).re[0];
  assert.ok(Math.abs(cq - cubicF(2.5, 15)) < 0.5);
  const mq = c1('interp2', [V(xg), V(yg), Vc, V([2.5]), V([15]), str('makima')]).re[0];
  assert.ok(Math.abs(mq - cubicF(2.5, 15)) < 0.5);
  const o = c1('interp2', [V(xg), V(yg), Vm, V([0, 2]), V([15, 15])]);
  assert.ok(Number.isNaN(o.re[0])); relClose(o.re[1], f(2, 15), 1e-14);
  close(c1('interp2', [V(xg), V(yg), Vm, V([0]), V([15]), str('linear'), num(-7)]), [-7]);
  close(c1('interp2', [Vm, V([2.5]), V([1.5])]), [f(2.5, 15)], 1e-13, 'implicit 1:n grid');
  const Rf = c1('interp2', [V([[1, 2], [3, 4]])]);
  assert.deepEqual(Rf.dims, [3, 3]); close(Rf, [[1, 1.5, 2], [2, 2.5, 3], [3, 3.5, 4]]);
  // meshgrid matrices as X and Y
  const X = V(yg.map(() => xg)), Y = V(yg.map((y) => xg.map(() => y)));
  close(c1('interp2', [X, Y, Vm, V([2.2]), V([22])]), [f(2.2, 22)], 1e-13);
});
test('interp3 and interpn', () => {
  const g = [0, 1, 2];
  const f = (x, y, z) => x + 2 * y + 3 * z;
  // meshgrid layout: V(y, x, z)
  const re = new Float64Array(27);
  for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) re[i + 3 * j + 9 * k] = f(g[j], g[i], g[k]);
  const Vv = tensor('double', [3, 3, 3], re);
  close(c1('interp3', [V(g), V(g), V(g), Vv, V([0.5]), V([1.5]), V([0.25])]), [f(0.5, 1.5, 0.25)], 1e-14);
  close(c1('interp3', [Vv, V([1.5]), V([2.5]), V([1.25])]), [f(0.5, 1.5, 0.25)], 1e-14);
  // ndgrid layout: V(x1, x2, x3)
  const re2 = new Float64Array(27);
  for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) re2[i + 3 * j + 9 * k] = f(g[i], g[j], g[k]);
  const Vn = tensor('double', [3, 3, 3], re2);
  close(c1('interpn', [V(g), V(g), V(g), Vn, V([0.5, 1]), V([1.5, 2]), V([0.25, 0])]), [f(0.5, 1.5, 0.25), f(1, 2, 0)], 1e-14);
  close(c1('interpn', [V([1, 2, 3]), V([10, 20, 30]), V([2.5])]), [25], 1e-14);
  close(c1('interpn', [V([1, 2, 3]), V([10, 20, 40]), V([2.5]), str('spline')]), c1('interp1', [V([1, 2, 3]), V([10, 20, 40]), V([2.5]), str('spline')]), 1e-13);
  close(c1('interpn', [Vn, V([1.5]), V([2]), V([3]), str('nearest')]), [f(1, 1, 2)]);
});
test('interpft', () => {
  const n = 8; const x = Array.from({ length: n }, (_, i) => Math.cos((2 * Math.PI * i) / n));
  const y = c1('interpft', [V(x), num(16)]);
  close(y, Array.from({ length: 16 }, (_, i) => Math.cos((2 * Math.PI * i) / 16)), 1e-13);
});
test('griddedInterpolant object', () => {
  const F = classes.griddedInterpolant.construct([V([1, 2, 3]), V([10, 20, 40])]);
  close(sub(F, 'griddedInterpolant', [{ type: '()', subs: [V([1.5, 2.5])] }])[0], [15, 30]);
  assert.equal(sub(F, 'griddedInterpolant', [{ type: '.', subs: 'Method' }])[0].re.length, 6);
  const F2 = classes.griddedInterpolant.construct([V([1, 2, 3]), V([10, 20, 40]), str('spline')]);
  close(sub(F2, 'griddedInterpolant', [{ type: '()', subs: [V([4])] }])[0], [c1('interp1', [V([1, 2, 3]), V([10, 20, 40]), V([4]), str('spline')]).re[0]], 1e-12, 'extrapolates with method');
  const x1 = V([1, 2, 3]), x2 = V([1, 2]);
  const Vv = V([[1, 2], [3, 4], [5, 6]]);
  const G = classes.griddedInterpolant.construct([cell([1, 2], [x1, x2]), Vv]);
  close(sub(G, 'griddedInterpolant', [{ type: '()', subs: [V([1.5]), V([1.5])] }])[0], [2.5]);
  close(sub(G, 'griddedInterpolant', [{ type: '()', subs: [V([[1.5, 1.5], [3, 2]])] }])[0], [[2.5], [6]]);
  const grid = sub(G, 'griddedInterpolant', [{ type: '()', subs: [cell([1, 2], [V([1, 2]), V([1, 2])])] }])[0];
  assert.deepEqual(grid.dims, [2, 2]); close(grid, [[1, 2], [3, 4]]);
  const G2 = classes.griddedInterpolant.subsasgn(G, [{ type: '.', subs: 'Method' }], str('nearest'));
  close(sub(G2, 'griddedInterpolant', [{ type: '()', subs: [V([1.4]), V([1.6])] }])[0], [2]);
  const Gn = classes.griddedInterpolant.construct([V([1, 2, 3]), V([10, 20, 40]), str('linear'), str('none')]);
  assert.ok(Number.isNaN(sub(Gn, 'griddedInterpolant', [{ type: '()', subs: [V([5])] }])[0].re[0]));
  assert.throws(() => classes.griddedInterpolant.construct([V([1, 2]), V([1, 2, 3])]), /grid/);
});
test('delaunay, convhull, delaunayTriangulation', () => {
  const px = [0, 1, 0, 1, 0.5], py = [0, 0, 1, 1, 0.5];
  const T = c1('delaunay', [V(px), V(py)]);
  assert.deepEqual(T.dims, [4, 3]);
  // total area equals the hull area, every triangle positively oriented
  let area = 0; const t = D(T);
  for (let k = 0; k < 4; k++) {
    const [a, b, c] = [t.re[k] - 1, t.re[k + 4] - 1, t.re[k + 8] - 1];
    const ar = ((px[b] - px[a]) * (py[c] - py[a]) - (py[b] - py[a]) * (px[c] - px[a])) / 2;
    assert.ok(ar > 0); area += ar;
  }
  relClose(area, 1, 1e-14);
  // random points: Delaunay property (no point inside any circumcircle)
  let s = 7; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const qx = Array.from({ length: 60 }, r), qy = Array.from({ length: 60 }, r);
  const T2 = D(c1('delaunay', [V(qx), V(qy)])); const nt = T2.m;
  let tot = 0;
  for (let k = 0; k < nt; k++) {
    const [a, b, c] = [T2.re[k] - 1, T2.re[k + nt] - 1, T2.re[k + 2 * nt] - 1];
    tot += ((qx[b] - qx[a]) * (qy[c] - qy[a]) - (qy[b] - qy[a]) * (qx[c] - qx[a])) / 2;
    const ax = qx[a], ay = qy[a], bx = qx[b], by = qy[b], cx = qx[c], cy = qy[c];
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
    const r2 = (ax - ux) ** 2 + (ay - uy) ** 2;
    for (let p = 0; p < 60; p++) if (p !== a && p !== b && p !== c) assert.ok((qx[p] - ux) ** 2 + (qy[p] - uy) ** 2 >= r2 * (1 - 1e-9), 'empty circumcircle');
  }
  const [k, av] = call('convhull', [V(qx), V(qy)], 2);
  relClose(tot, av.re[0], 1e-12, 'triangulation covers the hull');
  assert.equal(k.re[0], k.re[k.re.length - 1]);
  const [kk, a1] = call('convhull', [V([0, 1, 1, 0, 0.5]), V([0, 0, 1, 1, 0.5])], 2);
  assert.equal(kk.re.length, 5); relClose(a1.re[0], 1, 1e-15);
  const DT = classes.delaunayTriangulation.construct([V(px), V(py)]);
  const cl = sub(DT, 'delaunayTriangulation', [{ type: '.', subs: 'ConnectivityList' }])[0];
  assert.deepEqual(cl.dims, [4, 3]);
  const [ti, bc] = sub(DT, 'delaunayTriangulation', [{ type: '.', subs: 'pointLocation' }, { type: '()', subs: [V([0.5]), V([0.1])] }], 2);
  assert.ok(ti.re[0] >= 1 && ti.re[0] <= 4); relClose(bc.re.reduce((x, y) => x + y, 0), 1, 1e-14);
  const nn = sub(DT, 'delaunayTriangulation', [{ type: '.', subs: 'nearestNeighbor' }, { type: '()', subs: [V([0.9]), V([0.95])] }])[0];
  assert.equal(nn.re[0], 4);
  const e = sub(DT, 'delaunayTriangulation', [{ type: '.', subs: 'edges' }, { type: '()', subs: [] }])[0];
  assert.deepEqual(e.dims, [8, 2]);
});
test('scatteredInterpolant and griddata', () => {
  let s = 3; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const px = [0, 1, 0, 1].concat(Array.from({ length: 30 }, r)), py = [0, 0, 1, 1].concat(Array.from({ length: 30 }, r));
  const f = (x, y) => 3 * x - 2 * y + 1;
  const vals = px.map((x, i) => f(x, py[i]));
  const F = classes.scatteredInterpolant.construct([V(px), V(py), V(vals)]);
  close(sub(F, 'scatteredInterpolant', [{ type: '()', subs: [V([0.3, 0.77]), V([0.6, 0.12])] }])[0], [f(0.3, 0.6), f(0.77, 0.12)], 1e-12, 'linear exact for planes');
  close(sub(F, 'scatteredInterpolant', [{ type: '()', subs: [V([1.5]), V([0.5])] }])[0], [f(1.5, 0.5)], 1e-10, 'linear extrapolation');
  const Fn = classes.scatteredInterpolant.construct([V(px), V(py), V(vals), str('nearest')]);
  close(sub(Fn, 'scatteredInterpolant', [{ type: '()', subs: [V([0.01]), V([0.01])] }])[0], [f(0, 0)]);
  const q = c1('griddata', [V(px), V(py), V(vals), V([0.25, 0.5]), V([0.5, 0.75])]);
  close(q, [f(0.25, 0.5), f(0.5, 0.75)], 1e-12);
  const outside = c1('griddata', [V(px), V(py), V(vals), V([2]), V([2])]);
  assert.ok(Number.isNaN(outside.re[0]));
  const g = c1('griddata', [V(px), V(py), V(vals), V([0.2, 0.4, 0.6]), V([[0.3], [0.7]])]);
  assert.deepEqual(g.dims, [2, 3]);
  const v4 = c1('griddata', [V(px), V(py), V(vals), V([px[7]]), V([py[7]]), str('v4')]);
  relClose(v4.re[0], vals[7], 1e-8, 'v4 interpolates the data');
  const nr = c1('griddata', [V(px), V(py), V(vals), V([5]), V([5]), str('nearest')]);
  assert.ok(Number.isFinite(nr.re[0]));
});
test('trapz and cumtrapz', () => {
  close(c1('trapz', [V([1, 2, 3])]), 4);
  close(c1('trapz', [V([0, 1, 3]), V([1, 2, 3])]), 1.5 + 5);
  close(c1('trapz', [V([[1, 2], [3, 4], [5, 6]])]), [6, 8]);
  close(c1('trapz', [V([[1, 2], [3, 4]]), num(2)]), [[1.5], [3.5]]);
  const x = seq(0, Math.PI, 2001);
  relClose(c1('trapz', [V(x), V(x.map(Math.sin))]).re[0], 2, 1e-6);
  close(c1('cumtrapz', [V([1, 2, 3])]), [0, 1.5, 4]);
  close(c1('cumtrapz', [V([0, 2, 3]), V([1, 1, 1])]), [0, 2, 3]);
  close(c1('trapz', [num(0.5), V([1, 2, 3])]), 2);
});
