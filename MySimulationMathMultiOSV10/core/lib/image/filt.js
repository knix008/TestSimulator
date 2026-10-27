// Image processing, part 2: linear and order-statistic filtering, filter
// kernels, gradients and edge detection.
import { tensor, toTensor, isTensor, isChar, isString, toStr } from '../../value.js';
import { IE, imgOf, toUnit, fromUnit, makeOut, dbl } from './imgutil.js';

const isText = (v) => v != null && ((isChar(v) && v.dims[0] <= 1) || (isString(v) && v.data.length === 1));
const txt = (v) => (isText(v) ? toStr(v).toLowerCase() : null);
const numsOf = (v) => Array.from(toTensor(v).re);
const given = (v) => v !== undefined && !(isTensor(v) && v.re.length === 0);

/** Kernel object { kh, kw, re (column-major) }. */
export const kernelOf = (v) => { const t = toTensor(v); return { kh: t.dims[0], kw: t.dims[1], re: t.re }; };
const K = (rows) => { const kh = rows.length, kw = rows[0].length; const re = new Float64Array(kh * kw); for (let i = 0; i < kh; i++) for (let j = 0; j < kw; j++) re[i + j * kh] = rows[i][j]; return { kh, kw, re }; };
const kT = (k) => { const re = new Float64Array(k.re.length); for (let i = 0; i < k.kh; i++) for (let j = 0; j < k.kw; j++) re[j + i * k.kw] = k.re[i + j * k.kh]; return { kh: k.kw, kw: k.kh, re }; };
const kRot = (k) => ({ kh: k.kh, kw: k.kw, re: Float64Array.from(k.re).reverse() });
const kScale = (k, s) => ({ ...k, re: Float64Array.from(k.re, (x) => x * s) });

/** Boundary index mapping; returns -1 for constant padding outside. */
export function padIndex(k, n, mode) {
  if (k >= 0 && k < n) return k;
  if (mode === 'replicate') return k < 0 ? 0 : n - 1;
  if (mode === 'circular') return ((k % n) + n) % n;
  if (mode === 'symmetric') { const L = 2 * n; let s = ((k % L) + L) % L; if (s >= n) s = L - 1 - s; return s; }
  return -1;
}

/**
 * 2-D correlation of one plane. opts: { boundary: 'replicate'|'symmetric'|'circular'|number, full }.
 * Returns { re, h, w }.
 */
export function correlate(plane, h, w, k, opts = {}) {
  const mode = typeof opts.boundary === 'string' ? opts.boundary : 'constant';
  const cval = typeof opts.boundary === 'number' ? opts.boundary : 0;
  const cy = Math.floor((k.kh + 1) / 2) - 1, cx = Math.floor((k.kw + 1) / 2) - 1;
  const oh = opts.full ? h + k.kh - 1 : h, ow = opts.full ? w + k.kw - 1 : w;
  const sy = opts.full ? -(k.kh - 1) : -cy, sx = opts.full ? -(k.kw - 1) : -cx;
  const out = new Float64Array(oh * ow);
  const ys = new Int32Array(oh + k.kh), xs = new Int32Array(ow + k.kw);
  for (let i = 0; i < oh + k.kh; i++) ys[i] = padIndex(i + sy, h, mode);
  for (let j = 0; j < ow + k.kw; j++) xs[j] = padIndex(j + sx, w, mode);
  const nz = [];
  for (let j = 0; j < k.kw; j++) for (let i = 0; i < k.kh; i++) { const v = k.re[i + j * k.kh]; if (v !== 0) nz.push(i, j, v); }
  for (let x = 0; x < ow; x++) {
    for (let y = 0; y < oh; y++) {
      let s = 0;
      for (let q = 0; q < nz.length; q += 3) {
        const yy = ys[y + nz[q]], xx = xs[x + nz[q + 1]];
        s += nz[q + 2] * (yy < 0 || xx < 0 ? cval : plane[yy + xx * h]);
      }
      out[y + x * oh] = s;
    }
  }
  return { re: out, h: oh, w: ow };
}

function filterImage(im, k, opts, raw = true) {
  const src = raw ? im.re : toUnit(im);
  const planes = [];
  let oh = im.h, ow = im.w;
  for (let c = 0; c < im.c; c++) {
    const r = correlate(src.subarray(c * im.n, (c + 1) * im.n), im.h, im.w, k, opts);
    planes.push(r.re); oh = r.h; ow = r.w;
  }
  const re = new Float64Array(oh * ow * im.c);
  planes.forEach((p, c) => re.set(p, c * oh * ow));
  return { re, dims: im.dims.length > 2 ? [oh, ow, ...im.dims.slice(2)] : [oh, ow] };
}

function imfilter(args) {
  if (args.length < 2) throw IE('imfilter', 'notEnoughInputs', 'Not enough input arguments.');
  const im = imgOf(args[0], 'imfilter');
  let k = kernelOf(args[1]);
  const opts = { boundary: 0, full: false };
  let conv = false;
  for (const a of args.slice(2)) {
    const s = txt(a);
    if (s === null) opts.boundary = toTensor(a).re[0];
    else if (['symmetric', 'replicate', 'circular'].includes(s)) opts.boundary = s;
    else if (s === 'same') opts.full = false; else if (s === 'full') opts.full = true;
    else if (s === 'conv') conv = true; else if (s === 'corr') conv = false;
    else throw IE('imfilter', 'badOption', `Unknown option '${toStr(a)}'.`);
  }
  if (conv) k = kRot(k);
  const r = filterImage(im, k, opts);
  return makeOut(im.cls, r.dims, r.re);
}

// ---------------------------------------------------------------- fspecial

function gaussKernel(hsize, sigma) {
  const [m, n] = hsize;
  const p1 = (m - 1) / 2, p2 = (n - 1) / 2;
  const re = new Float64Array(m * n);
  let mx = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < m; i++) { const x = j - p2, y = i - p1; const v = Math.exp(-(x * x + y * y) / (2 * sigma * sigma)); re[i + j * m] = v; if (v > mx) mx = v; }
  let s = 0; for (let i = 0; i < re.length; i++) { if (re[i] < 2.220446049250313e-16 * mx) re[i] = 0; s += re[i]; }
  if (s) for (let i = 0; i < re.length; i++) re[i] /= s;
  return { kh: m, kw: n, re };
}
const sizeArg = (v, d) => { if (!given(v)) return [d, d]; const a = numsOf(v); return a.length === 1 ? [a[0], a[0]] : [a[0], a[1]]; };

export function fspecialJS(type, a1, a2) {
  switch (type) {
    case 'average': { const [m, n] = sizeArg(a1, 3); return { kh: m, kw: n, re: new Float64Array(m * n).fill(1 / (m * n)) }; }
    case 'gaussian': return gaussKernel(sizeArg(a1, 3), given(a2) ? toTensor(a2).re[0] : 0.5);
    case 'disk': {
      const r = given(a1) ? toTensor(a1).re[0] : 5;
      const c = Math.ceil(r), n = 2 * c + 1;
      const re = new Float64Array(n * n);
      const S = 16;
      let tot = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        let cnt = 0;
        for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) { const x = j - c - 0.5 + (a + 0.5) / S, y = i - c - 0.5 + (b + 0.5) / S; if (x * x + y * y <= r * r) cnt++; }
        re[i + j * n] = cnt; tot += cnt;
      }
      for (let i = 0; i < re.length; i++) re[i] /= tot;
      return { kh: n, kw: n, re };
    }
    case 'laplacian': {
      const al = given(a1) ? Math.min(1, Math.max(0, toTensor(a1).re[0])) : 0.2;
      const s = 4 / (al + 1), a = al / 4, b = (1 - al) / 4;
      return kScale(K([[a, b, a], [b, -1, b], [a, b, a]]), s);
    }
    case 'log': {
      const [m, n] = sizeArg(a1, 5); const sg = given(a2) ? toTensor(a2).re[0] : 0.5;
      const g = gaussKernel([m, n], sg);
      const s2 = sg * sg; const p1 = (m - 1) / 2, p2 = (n - 1) / 2;
      const h1 = new Float64Array(m * n); let sum = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < m; i++) { const x = j - p2, y = i - p1; h1[i + j * m] = (g.re[i + j * m] * (x * x + y * y - 2 * s2)) / (s2 * s2); sum += h1[i + j * m]; }
      for (let i = 0; i < h1.length; i++) h1[i] -= sum / (m * n);
      return { kh: m, kw: n, re: h1 };
    }
    case 'motion': {
      const len = Math.max(1, given(a1) ? toTensor(a1).re[0] : 9), th = ((given(a2) ? toTensor(a2).re[0] : 0) * Math.PI) / 180;
      const half = (len - 1) / 2;
      const cs = Math.cos(th), sn = Math.sin(th);
      const R = Math.ceil(half) + 1;
      const n = 2 * R + 1;
      const full = new Float64Array(n * n);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const x = j - R, y = -(i - R);
        const along = x * cs + y * sn, perp = Math.abs(-x * sn + y * cs);
        const ex = Math.max(0, Math.abs(along) - half);
        const d = Math.hypot(ex, perp);
        full[i + j * n] = Math.max(0, 1 - d);
      }
      // crop zero borders
      let r0 = 0, r1 = n - 1, c0 = 0, c1 = n - 1;
      const rowZero = (i) => { for (let j = 0; j < n; j++) if (full[i + j * n] > 1e-12) return false; return true; };
      const colZero = (j) => { for (let i = 0; i < n; i++) if (full[i + j * n] > 1e-12) return false; return true; };
      while (r0 < r1 && rowZero(r0) && rowZero(r1)) { r0++; r1--; }
      while (c0 < c1 && colZero(c0) && colZero(c1)) { c0++; c1--; }
      const kh = r1 - r0 + 1, kw = c1 - c0 + 1;
      const re = new Float64Array(kh * kw); let s = 0;
      for (let j = 0; j < kw; j++) for (let i = 0; i < kh; i++) { re[i + j * kh] = full[r0 + i + (c0 + j) * n]; s += re[i + j * kh]; }
      for (let i = 0; i < re.length; i++) re[i] /= s;
      return { kh, kw, re };
    }
    case 'prewitt': return K([[1, 1, 1], [0, 0, 0], [-1, -1, -1]]);
    case 'sobel': return K([[1, 2, 1], [0, 0, 0], [-1, -2, -1]]);
    case 'unsharp': {
      const al = given(a1) ? Math.min(1, Math.max(0, toTensor(a1).re[0])) : 0.2;
      return kScale(K([[-al, al - 1, -al], [al - 1, al + 5, al - 1], [-al, al - 1, -al]]), 1 / (al + 1));
    }
    default: throw IE('fspecial', 'badType', `Unknown filter type '${type}'.`);
  }
}
function fspecial(args) {
  const type = txt(args[0]);
  if (!type) throw IE('fspecial', 'badType', 'The filter type must be text.');
  const k = fspecialJS(type, args[1], args[2]);
  return dbl([k.kh, k.kw], k.re);
}

function imgaussfiltJS(im, sigma, size, pad) {
  const sy = sigma[0], sx = sigma[sigma.length - 1];
  const hy = size ? size[0] : 2 * Math.ceil(2 * sy) + 1, hx = size ? size[size.length - 1] : 2 * Math.ceil(2 * sx) + 1;
  const ky = gaussKernel([hy, 1], sy), kx = gaussKernel([1, hx], sx);
  const r1 = filterImage(im, ky, { boundary: pad });
  return filterImage({ ...im, re: r1.re }, kx, { boundary: pad });
}
function padOpt(v) { const s = txt(v); if (s === null) return toTensor(v).re[0]; return s; }
function imgaussfilt(args) {
  const im = imgOf(args[0], 'imgaussfilt');
  let i = 1, sigma = [0.5];
  if (given(args[1]) && !isText(args[1])) { sigma = numsOf(args[1]); i = 2; }
  let size = null, pad = 'replicate';
  for (; i + 1 < args.length; i += 2) {
    const k = txt(args[i]);
    if (k === 'filtersize') size = numsOf(args[i + 1]);
    else if (k === 'padding') pad = padOpt(args[i + 1]);
    else if (k === 'filterdomain') { /* spatial only */ } else throw IE('imgaussfilt', 'badOption', `Unknown option '${toStr(args[i])}'.`);
  }
  for (const s of sigma) if (!(s > 0)) throw IE('imgaussfilt', 'badSigma', 'SIGMA must be positive.');
  const r = imgaussfiltJS(im, sigma, size, pad);
  return makeOut(im.cls, r.dims, r.re);
}

function imsharpen(args) {
  const im = imgOf(args[0], 'imsharpen');
  let radius = 1, amount = 0.8, thr = 0;
  for (let i = 1; i + 1 < args.length; i += 2) {
    const k = txt(args[i]); const v = toTensor(args[i + 1]).re[0];
    if (k === 'radius') radius = v; else if (k === 'amount') amount = v; else if (k === 'threshold') thr = v;
    else throw IE('imsharpen', 'badOption', `Unknown option '${toStr(args[i])}'.`);
  }
  const u = toUnit(im);
  const blur = imgaussfiltJS({ ...im, re: u }, [radius], null, 'replicate');
  const re = new Float64Array(u.length);
  for (let i = 0; i < u.length; i++) {
    const d = u[i] - blur.re[i];
    re[i] = Math.abs(d) > thr ? u[i] + amount * d : u[i];
    if (im.cls !== 'double' && im.cls !== 'single') re[i] = Math.min(1, Math.max(0, re[i]));
  }
  return fromUnit(re, im.dims, im.cls);
}

// ---------------------------------------------------------------- order statistics

function orderFilter(im, mh, mw, pick, mode, mask) {
  const cy = Math.floor((mh + 1) / 2) - 1, cx = Math.floor((mw + 1) / 2) - 1;
  const re = new Float64Array(im.re.length);
  const buf = [];
  for (let c = 0; c < im.c; c++) {
    const off = c * im.n;
    for (let x = 0; x < im.w; x++) for (let y = 0; y < im.h; y++) {
      buf.length = 0;
      for (let j = 0; j < mw; j++) for (let i = 0; i < mh; i++) {
        if (mask && !mask[i + j * mh]) continue;
        const yy = padIndex(y - cy + i, im.h, mode), xx = padIndex(x - cx + j, im.w, mode);
        buf.push(yy < 0 || xx < 0 ? 0 : im.re[off + yy + xx * im.h]);
      }
      buf.sort((a, b) => a - b);
      re[off + y + x * im.h] = pick(buf);
    }
  }
  return re;
}
function medfilt2(args) {
  const im = imgOf(args[0], 'medfilt2');
  let size = [3, 3], mode = 'constant';
  for (const a of args.slice(1)) {
    const s = txt(a);
    if (s === null) size = numsOf(a).length === 1 ? [numsOf(a)[0], numsOf(a)[0]] : numsOf(a).slice(0, 2);
    else if (s === 'zeros') mode = 'constant'; else if (s === 'symmetric') mode = 'symmetric'; else if (s === 'indexed') mode = 'constant';
    else throw IE('medfilt2', 'badOption', `Unknown option '${toStr(a)}'.`);
  }
  const re = orderFilter(im, size[0], size[1], (b) => { const n = b.length; return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2; }, mode, null);
  return makeOut(im.cls, im.dims, re);
}
function ordfilt2(args) {
  if (args.length < 3) throw IE('ordfilt2', 'notEnoughInputs', 'Not enough input arguments.');
  const im = imgOf(args[0], 'ordfilt2');
  const order = toTensor(args[1]).re[0];
  const dom = toTensor(args[2]);
  let mode = 'constant';
  const offs = given(args[3]) && !isText(args[3]) ? toTensor(args[3]).re : null;
  for (const a of args.slice(3)) { const s = txt(a); if (s === 'symmetric') mode = 'symmetric'; else if (s === 'zeros') mode = 'constant'; }
  const mask = Float64Array.from(dom.re, (x) => (x ? 1 : 0));
  const cnt = mask.reduce((a, b) => a + b, 0);
  if (order < 1 || order > cnt) throw IE('ordfilt2', 'badOrder', 'ORDER must be between 1 and the number of nonzero elements in DOMAIN.');
  const re = orderFilter(im, dom.dims[0], dom.dims[1], (b) => b[order - 1], mode, mask);
  void offs;
  return makeOut(im.cls, im.dims, re);
}

// ---------------------------------------------------------------- gradients and edges

const GRAD = {
  sobel: () => { const hy = K([[-1, -2, -1], [0, 0, 0], [1, 2, 1]]); return [kT(hy), hy]; },
  prewitt: () => { const hy = K([[-1, -1, -1], [0, 0, 0], [1, 1, 1]]); return [kT(hy), hy]; },
  central: () => [K([[-0.5, 0, 0.5]]), K([[-0.5], [0], [0.5]])],
  intermediate: () => [K([[-1, 1]]), K([[-1], [1]])],
  roberts: () => [K([[1, 0], [0, -1]]), K([[0, 1], [-1, 0]])],
};
function gradXY(im, method) {
  const g = GRAD[method];
  if (!g) throw IE('imgradient', 'badMethod', `Unknown gradient method '${method}'.`);
  const [hx, hy] = g();
  const plane = Float64Array.from(im.re.subarray(0, im.n));
  let gx = correlate(plane, im.h, im.w, hx, { boundary: 'replicate' }).re;
  let gy = correlate(plane, im.h, im.w, hy, { boundary: 'replicate' }).re;
  if (method === 'intermediate') {
    // forward differences: last column/row are 0
    gx = new Float64Array(im.n); gy = new Float64Array(im.n);
    for (let x = 0; x < im.w; x++) for (let y = 0; y < im.h; y++) { const p = y + x * im.h; if (x < im.w - 1) gx[p] = plane[p + im.h] - plane[p]; if (y < im.h - 1) gy[p] = plane[p + 1] - plane[p]; }
  }
  return [gx, gy];
}
function imgradientxy(args) {
  const im = imgOf(args[0], 'imgradientxy');
  const [gx, gy] = gradXY(im, txt(args[1]) || 'sobel');
  return [dbl([im.h, im.w], gx), dbl([im.h, im.w], gy)];
}
function imgradient(args) {
  let gx, gy, h, w;
  if (args.length >= 2 && !isText(args[1])) {
    const a = toTensor(args[0]), b = toTensor(args[1]); gx = a.re; gy = b.re; [h, w] = a.dims;
  } else {
    const im = imgOf(args[0], 'imgradient');
    [gx, gy] = gradXY(im, txt(args[1]) || 'sobel'); h = im.h; w = im.w;
  }
  const mag = new Float64Array(gx.length), dir = new Float64Array(gx.length);
  for (let i = 0; i < gx.length; i++) { mag[i] = Math.hypot(gx[i], gy[i]); dir[i] = (Math.atan2(-gy[i], gx[i]) * 180) / Math.PI; }
  return [dbl([h, w], mag), dbl([h, w], dir)];
}

function thinEdges(b, bx, by, h, w, cutoff) {
  const e = new Float64Array(h * w);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const p = y + x * h; const v = b[p];
    if (!(v > cutoff)) continue;
    const ax = Math.abs(bx[p]), ay = Math.abs(by[p]);
    const left = x > 0 ? b[p - h] : v, right = x < w - 1 ? b[p + h] : v, up = y > 0 ? b[p - 1] : v, down = y < h - 1 ? b[p + 1] : v;
    if ((ax >= ay && v >= left && v >= right) || (ay >= ax && v >= up && v >= down)) e[p] = 1;
  }
  return e;
}

function edge(args, nargout) {
  const im = imgOf(args[0], 'edge');
  if (im.c !== 1) throw IE('edge', 'invalidInput', 'Expected a 2-D grayscale image.');
  const method = txt(args[1]) || 'sobel';
  const thrArg = given(args[2]) && !isText(args[2]) ? numsOf(args[2]) : null;
  const { h, w } = im;
  const a = toUnit(im);
  let e, thrOut;
  if (method === 'sobel' || method === 'prewitt' || method === 'roberts') {
    let kx, ky, scale = 4;
    if (method === 'sobel') { const op = kScale(fspecialJS('sobel'), 1 / 8); ky = op; kx = kT(op); } else if (method === 'prewitt') { const op = kScale(fspecialJS('prewitt'), 1 / 6); ky = op; kx = kT(op); } else { kx = K([[1, 0], [0, -1]]); ky = K([[0, 1], [-1, 0]]); kx = kScale(kx, 0.5); ky = kScale(ky, 0.5); scale = 6; }
    const bx = correlate(a, h, w, kx, { boundary: 'replicate' }).re, by = correlate(a, h, w, ky, { boundary: 'replicate' }).re;
    const b = new Float64Array(h * w); let sum = 0;
    for (let i = 0; i < b.length; i++) { b[i] = bx[i] * bx[i] + by[i] * by[i]; sum += b[i]; }
    let cutoff;
    if (thrArg) { cutoff = thrArg[0] * thrArg[0]; thrOut = thrArg[0]; } else { cutoff = (scale * sum) / b.length; thrOut = Math.sqrt(cutoff); }
    const nothin = args.some((x) => txt(x) === 'nothinning');
    e = nothin ? Float64Array.from(b, (v) => (v > cutoff ? 1 : 0)) : thinEdges(b, bx, by, h, w, cutoff);
  } else if (method === 'canny') {
    const sigma = given(args[3]) ? toTensor(args[3]).re[0] : Math.SQRT2;
    const sz = 2 * Math.ceil(3 * sigma) + 1;
    const g = gaussKernel([sz, 1], sigma);
    const s1 = correlate(a, h, w, g, { boundary: 'replicate' }).re;
    const sm = correlate(s1, h, w, kT(g), { boundary: 'replicate' }).re;
    const dx = correlate(sm, h, w, K([[-0.5, 0, 0.5]]), { boundary: 'replicate' }).re;
    const dy = correlate(sm, h, w, K([[-0.5], [0], [0.5]]), { boundary: 'replicate' }).re;
    const mag = new Float64Array(h * w); let mx = 0;
    for (let i = 0; i < mag.length; i++) { mag[i] = Math.hypot(dx[i], dy[i]); if (mag[i] > mx) mx = mag[i]; }
    if (mx > 0) for (let i = 0; i < mag.length; i++) mag[i] /= mx;
    let lo, hi;
    if (thrArg && thrArg.length >= 2) [lo, hi] = thrArg;
    else if (thrArg) { hi = thrArg[0]; lo = 0.4 * hi; } else {
      const counts = new Float64Array(64);
      for (const v of mag) counts[Math.min(63, Math.round(v * 63))]++;
      let cum = 0, idx = 64;
      for (let k = 0; k < 64; k++) { cum += counts[k]; if (cum > 0.7 * h * w) { idx = k + 1; break; } }
      hi = idx / 64; lo = 0.4 * hi;
    }
    thrOut = [lo, hi];
    // non-maximum suppression
    const nms = new Float64Array(h * w);
    for (let x = 1; x < w - 1; x++) for (let y = 1; y < h - 1; y++) {
      const p = y + x * h, m = mag[p];
      if (m <= lo) continue;
      let ang = (Math.atan2(dy[p], dx[p]) * 180) / Math.PI; if (ang < 0) ang += 180;
      let q1, q2;
      if (ang < 22.5 || ang >= 157.5) { q1 = p - h; q2 = p + h; } else if (ang < 67.5) { q1 = p - h - 1; q2 = p + h + 1; } else if (ang < 112.5) { q1 = p - 1; q2 = p + 1; } else { q1 = p - h + 1; q2 = p + h - 1; }
      if (m >= mag[q1] && m >= mag[q2]) nms[p] = m;
    }
    // hysteresis
    e = new Float64Array(h * w);
    const stack = [];
    for (let p = 0; p < h * w; p++) if (nms[p] > hi && !e[p]) { e[p] = 1; stack.push(p); }
    while (stack.length) {
      const p = stack.pop(); const y = p % h, x = (p - y) / h;
      for (let dxx = -1; dxx <= 1; dxx++) for (let dyy = -1; dyy <= 1; dyy++) {
        const yy = y + dyy, xx = x + dxx; if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
        const q = yy + xx * h; if (!e[q] && nms[q] > lo) { e[q] = 1; stack.push(q); }
      }
    }
  } else if (method === 'log' || method === 'zerocross') {
    let b;
    let sigma = 2;
    if (method === 'log') {
      if (given(args[3])) sigma = toTensor(args[3]).re[0];
      const sz = Math.ceil(sigma * 3) * 2 + 1;
      b = correlate(a, h, w, fspecialJS('log', tensor('double', [1, 1], [sz]), tensor('double', [1, 1], [sigma])), { boundary: 'replicate' }).re;
    } else {
      if (!given(args[3])) throw IE('edge', 'noFilter', 'The zerocross method needs a filter H.');
      b = correlate(a, h, w, kernelOf(args[3]), { boundary: 'replicate' }).re;
    }
    let thr;
    if (thrArg) thr = thrArg[0]; else { let s = 0; for (const v of b) s += Math.abs(v); thr = (0.75 * s) / b.length; }
    thrOut = thr;
    e = new Float64Array(h * w);
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
      const p = y + x * h, v = b[p];
      const nb = [];
      if (x < w - 1) nb.push(b[p + h]); if (x > 0) nb.push(b[p - h]); if (y < h - 1) nb.push(b[p + 1]); if (y > 0) nb.push(b[p - 1]);
      if (v < 0) { for (const q of nb) if (q > 0 && Math.abs(v - q) > thr) { e[p] = 1; break; } } else if (v === 0) {
        if ((x > 0 && x < w - 1 && b[p - h] * b[p + h] < 0 && Math.abs(b[p - h] - b[p + h]) > 2 * thr) || (y > 0 && y < h - 1 && b[p - 1] * b[p + 1] < 0 && Math.abs(b[p - 1] - b[p + 1]) > 2 * thr)) e[p] = 1;
      }
    }
  } else throw IE('edge', 'badMethod', `Unknown edge detection method '${method}'.`);
  const BW = tensor('logical', [h, w], e);
  if (nargout > 1) return [BW, Array.isArray(thrOut) ? dbl([1, 2], thrOut) : dbl([1, 1], [thrOut])];
  return BW;
}

export const builtins = { imfilter, fspecial, imgaussfilt, imsharpen, medfilt2, ordfilt2, imgradientxy, imgradient, edge };

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const help = {
  imfilter: H('Filter an image with a 2-D kernel (correlation by default). Options: boundary value, \'symmetric\', \'replicate\', \'circular\'; \'same\' or \'full\'; \'corr\' or \'conv\'.', '2차원 커널로 이미지를 필터링합니다(기본 상관). 옵션: 경계 값, \'symmetric\', \'replicate\', \'circular\'; \'same\'/\'full\'; \'corr\'/\'conv\'.', ['B = imfilter(A, h)', 'B = imfilter(A, h, options...)']),
  fspecial: H('Create a predefined 2-D filter: average, disk, gaussian, laplacian, log, motion, prewitt, sobel, unsharp.', '미리 정의된 2차원 필터를 만듭니다: average, disk, gaussian, laplacian, log, motion, prewitt, sobel, unsharp.', ['h = fspecial(type)', 'h = fspecial(\'average\', hsize)', 'h = fspecial(\'disk\', radius)', 'h = fspecial(\'gaussian\', hsize, sigma)', 'h = fspecial(\'laplacian\', alpha)', 'h = fspecial(\'log\', hsize, sigma)', 'h = fspecial(\'motion\', len, theta)', 'h = fspecial(\'unsharp\', alpha)']),
  imgaussfilt: H('2-D Gaussian filtering of an image (separable, replicate padding by default).', '이미지를 2차원 가우스 필터로 거릅니다(분리형, 기본 replicate 채움).', ['B = imgaussfilt(A)', 'B = imgaussfilt(A, sigma)', 'B = imgaussfilt(..., \'FilterSize\', sz, \'Padding\', pad)']),
  imsharpen: H('Sharpen an image with unsharp masking.', '언샤프 마스킹으로 이미지를 선명하게 합니다.', ['B = imsharpen(A)', 'B = imsharpen(A, \'Radius\', r, \'Amount\', a, \'Threshold\', t)']),
  medfilt2: H('2-D median filtering (3-by-3 neighbourhood by default).', '2차원 중앙값 필터(기본 3×3 이웃).', ['B = medfilt2(A)', 'B = medfilt2(A, [m n])', 'B = medfilt2(..., padopt)']),
  ordfilt2: H('2-D order-statistic filtering over a neighbourhood domain.', '이웃 영역에 대한 2차원 순서 통계 필터.', ['B = ordfilt2(A, order, domain)', 'B = ordfilt2(..., padopt)']),
  imgradientxy: H('Directional image gradients Gx and Gy (sobel, prewitt, central, intermediate, roberts).', '방향별 이미지 기울기 Gx, Gy 를 구합니다(sobel, prewitt, central, intermediate, roberts).', ['[Gx, Gy] = imgradientxy(I)', '[Gx, Gy] = imgradientxy(I, method)']),
  imgradient: H('Gradient magnitude and direction (degrees) of an image.', '이미지 기울기의 크기와 방향(도)을 구합니다.', ['[Gmag, Gdir] = imgradient(I)', '[Gmag, Gdir] = imgradient(I, method)', '[Gmag, Gdir] = imgradient(Gx, Gy)']),
  edge: H('Find edges in a grayscale image: sobel (default), prewitt, roberts, log, zerocross, canny.', '회색조 이미지의 경계를 찾습니다: sobel(기본), prewitt, roberts, log, zerocross, canny.', ['BW = edge(I)', 'BW = edge(I, method)', 'BW = edge(I, method, threshold)', 'BW = edge(I, \'canny\', threshold, sigma)', '[BW, threshOut] = edge(...)']),
};
