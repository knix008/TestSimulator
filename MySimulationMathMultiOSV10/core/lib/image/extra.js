// More image processing: 2-D statistics, sliding / distinct block
// processing, local statistic filters, translation, test images, CIELAB
// conversion, distance transform, regional extrema, multilevel thresholds,
// quantization, image tiling and structural similarity.
import { tensor, toTensor, isText, toStr, num, isCell } from '../../value.js';
import { IE, imgOf, toUnit, fromUnit, makeOut, dbl, logical } from './imgutil.js';

const call1 = (ctx, f, args) => ctx.call(f, args, 1)[0];
const lstr = (v) => (v != null && isText(v) ? toStr(v).toLowerCase() : null);
const nums = (v) => Array.from(toTensor(v).re);
const need = (args, n, fn) => { if (args.length < n) throw IE(fn, 'notEnoughInputs', 'Not enough input arguments.'); };

// ------------------------------------------------------------- 2-D statistics

const mean2 = (a) => a.reduce((s, x) => s + x, 0) / a.length;
function mean2Fn(args) { need(args, 1, 'mean2'); return num(mean2(nums(args[0]))); }
function std2Fn(args) { need(args, 1, 'std2'); const a = nums(args[0]); const m = mean2(a); return num(Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1))); }
function corr2Fn(args) {
  need(args, 2, 'corr2');
  const a = nums(args[0]), b = nums(args[1]);
  if (a.length !== b.length) throw IE('corr2', 'sizeMismatch', 'A and B must be the same size.');
  const ma = mean2(a), mb = mean2(b); let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return num(sab / Math.sqrt(saa * sbb));
}

// ------------------------------------------------------------- im2col / col2im

function blockArgs(v, fn) { const s = nums(v); if (s.length === 1) return [s[0], s[0]]; return [s[0], s[1]]; }
function im2colFn(args) {
  need(args, 2, 'im2col');
  const I = imgOf(args[0], 'im2col');
  const [m, n] = blockArgs(args[1], 'im2col');
  const kind = args[2] !== undefined ? lstr(args[2]) : 'sliding';
  const { h, w, re } = I;
  const cols = [];
  if (kind === 'sliding') {
    for (let j = 0; j + n <= w; j++) for (let i = 0; i + m <= h; i++) { const c = new Float64Array(m * n); for (let q = 0; q < n; q++) for (let p = 0; p < m; p++) c[p + q * m] = re[i + p + (j + q) * h]; cols.push(c); }
  } else if (kind === 'distinct') {
    for (let j = 0; j < w; j += n) for (let i = 0; i < h; i += m) { const c = new Float64Array(m * n); for (let q = 0; q < n; q++) for (let p = 0; p < m; p++) c[p + q * m] = i + p < h && j + q < w ? re[i + p + (j + q) * h] : 0; cols.push(c); }
  } else throw IE('im2col', 'badType', "Block type must be 'sliding' or 'distinct'.");
  const out = new Float64Array(m * n * cols.length); cols.forEach((c, k) => out.set(c, k * m * n));
  return makeOut(I.cls, [m * n, cols.length], out);
}
function col2imFn(args) {
  need(args, 3, 'col2im');
  const B = toTensor(args[0]);
  const [m, n] = blockArgs(args[1], 'col2im'); const [h, w] = blockArgs(args[2], 'col2im');
  const kind = args[3] !== undefined ? lstr(args[3]) : 'sliding';
  if (kind === 'sliding') {
    const oh = h - m + 1, ow = w - n + 1;
    if (B.re.length !== oh * ow) throw IE('col2im', 'sizeMismatch', 'For sliding blocks B must be a row vector with one value per block.');
    return makeOut(B.cls, [oh, ow], Float64Array.from(B.re));
  }
  const out = new Float64Array(h * w); const nb = Math.ceil(h / m);
  const ncol = B.dims[1];
  for (let k = 0; k < ncol; k++) {
    const bi = k % nb, bj = Math.floor(k / nb);
    for (let q = 0; q < n; q++) for (let p = 0; p < m; p++) { const i = bi * m + p, j = bj * n + q; if (i < h && j < w) out[i + j * h] = B.re[p + q * m + k * m * n]; }
  }
  return makeOut(B.cls, [h, w], out);
}

// ------------------------------------------------------------- block processing

function sub(re, h, i0, j0, m, n, padVal = 0) {
  const o = new Float64Array(m * n);
  for (let q = 0; q < n; q++) for (let p = 0; p < m; p++) { const i = i0 + p, j = j0 + q; o[p + q * m] = i >= 0 && i < h && j >= 0 && j < re.length / h ? re[i + j * h] : padVal; }
  return o;
}
function nlfilterFn(args, nargout, ctx) {
  need(args, 3, 'nlfilter');
  const I = imgOf(args[0], 'nlfilter');
  const [m, n] = blockArgs(args[1], 'nlfilter');
  const fun = args[2];
  const ci = Math.floor((m - 1) / 2), cj = Math.floor((n - 1) / 2);
  const out = new Float64Array(I.n);
  for (let j = 0; j < I.w; j++) for (let i = 0; i < I.h; i++) {
    const blk = sub(I.re, I.h, i - ci, j - cj, m, n);
    out[i + j * I.h] = toTensor(call1(ctx, fun, [tensor('double', [m, n], blk)])).re[0];
    if ((j & 15) === 0 && i === 0) ctx.checkInterrupt();
  }
  return dbl([I.h, I.w], out);
}
function blockprocFn(args, nargout, ctx) {
  need(args, 3, 'blockproc');
  const I = imgOf(args[0], 'blockproc');
  const [m, n] = blockArgs(args[1], 'blockproc');
  const fun = args[2];
  const by = Math.ceil(I.h / m), bx = Math.ceil(I.w / n);
  const res = [];
  const C = I.c;
  for (let bj = 0; bj < bx; bj++) for (let bi = 0; bi < by; bi++) {
    const bh = Math.min(m, I.h - bi * m), bw = Math.min(n, I.w - bj * n);
    const data = new Float64Array(bh * bw * C);
    for (let c = 0; c < C; c++) for (let q = 0; q < bw; q++) for (let p = 0; p < bh; p++) data[p + q * bh + c * bh * bw] = I.re[bi * m + p + (bj * n + q) * I.h + c * I.n];
    const blk = tensor(I.cls, C > 1 ? [bh, bw, C] : [bh, bw], data);
    const st = { cls: 'struct', dims: [1, 1], fields: ['data', 'location', 'blockSize', 'imageSize'], data: [{ data: blk, location: tensor('double', [1, 2], [bi * m + 1, bj * n + 1]), blockSize: tensor('double', [1, 2], [m, n]), imageSize: tensor('double', [1, 2], [I.h, I.w]) }] };
    res.push({ bi, bj, v: toTensor(call1(ctx, fun, [st])) });
  }
  // assemble: block results tile in the same grid
  const rowH = Array.from({ length: by }, (_, bi) => res.find((r) => r.bi === bi).v.dims[0]);
  const colW = Array.from({ length: bx }, (_, bj) => res.find((r) => r.bj === bj).v.dims[1]);
  const H = rowH.reduce((a, b) => a + b, 0), W = colW.reduce((a, b) => a + b, 0);
  const oc = res[0].v.dims[2] || 1;
  const out = new Float64Array(H * W * oc);
  for (const r of res) {
    const i0 = rowH.slice(0, r.bi).reduce((a, b) => a + b, 0), j0 = colW.slice(0, r.bj).reduce((a, b) => a + b, 0);
    const [rh, rw] = r.v.dims;
    for (let c = 0; c < oc; c++) for (let q = 0; q < rw; q++) for (let p = 0; p < rh; p++) out[i0 + p + (j0 + q) * H + c * H * W] = r.v.re[p + q * rh + c * rh * rw];
  }
  return makeOut(res[0].v.cls, oc > 1 ? [H, W, oc] : [H, W], out);
}

// ------------------------------------------------------------- local statistic filters

function nhood(v, def) {
  if (v === undefined) return { m: def, n: def, mask: null };
  const t = toTensor(v);
  if (t.re.length <= 2 && t.cls !== 'logical' && !(t.dims[0] > 1 && t.dims[1] > 1)) { const [m, n] = t.re.length === 1 ? [t.re[0], t.re[0]] : [t.re[0], t.re[1]]; return { m, n, mask: null }; }
  return { m: t.dims[0], n: t.dims[1], mask: t.re };
}
function localFilter(args, fn, f) {
  need(args, 1, fn);
  const I = imgOf(args[0], fn);
  const { m, n, mask } = nhood(args[1], fn === 'entropyfilt' ? 9 : 3);
  const ci = Math.floor((m - 1) / 2), cj = Math.floor((n - 1) / 2);
  const src = fn === 'entropyfilt' ? toUnit(I) : I.re;
  const out = new Float64Array(I.h * I.w * I.c);
  const vals = [];
  for (let c = 0; c < I.c; c++) for (let j = 0; j < I.w; j++) for (let i = 0; i < I.h; i++) {
    vals.length = 0;
    for (let q = 0; q < n; q++) for (let p = 0; p < m; p++) {
      if (mask && !mask[p + q * m]) continue;
      // symmetric padding
      let ii = i + p - ci, jj = j + q - cj;
      if (ii < 0) ii = -ii - 1; if (ii >= I.h) ii = 2 * I.h - ii - 1;
      if (jj < 0) jj = -jj - 1; if (jj >= I.w) jj = 2 * I.w - jj - 1;
      ii = Math.min(Math.max(ii, 0), I.h - 1); jj = Math.min(Math.max(jj, 0), I.w - 1);
      vals.push(src[ii + jj * I.h + c * I.n]);
    }
    out[i + j * I.h + c * I.n] = f(vals);
  }
  return { I, out };
}
function stdfiltFn(args) { const { I, out } = localFilter(args, 'stdfilt', (v) => { const m = mean2(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, v.length - 1)); }); return dbl(I.dims, out); }
function rangefiltFn(args) { const { I, out } = localFilter(args, 'rangefilt', (v) => Math.max(...v) - Math.min(...v)); return makeOut(I.cls === 'logical' ? 'logical' : I.cls, I.dims, out); }
function entropyOf(v) { const hist = new Float64Array(256); for (const x of v) hist[Math.min(255, Math.max(0, Math.round(x * 255)))]++; let e = 0; for (const c of hist) if (c) { const p = c / v.length; e -= p * Math.log2(p); } return e; }
function entropyfiltFn(args) { const { I, out } = localFilter(args, 'entropyfilt', entropyOf); return dbl(I.dims, out); }

// ------------------------------------------------------------- imtranslate

function imtranslateFn(args) {
  need(args, 2, 'imtranslate');
  const I = imgOf(args[0], 'imtranslate');
  const t = nums(args[1]); const tx = t[0], ty = t[1] ?? 0;
  let fill = 0, view = 'same', method = 'linear';
  for (let i = 2; i < args.length; i++) {
    const s = lstr(args[i]);
    if (s === 'fillvalues') fill = nums(args[++i])[0];
    else if (s === 'outputview') view = lstr(args[++i]);
    else if (s === 'nearest' || s === 'linear' || s === 'bilinear' || s === 'cubic' || s === 'bicubic') method = s;
    else throw IE('imtranslate', 'badOption', `Invalid option '${toStr(args[i])}'.`);
  }
  let H = I.h, W = I.w, ox = 0, oy = 0;
  if (view === 'full') { W = I.w + Math.ceil(Math.abs(tx)); H = I.h + Math.ceil(Math.abs(ty)); ox = Math.min(0, Math.floor(tx)); oy = Math.min(0, Math.floor(ty)); }
  const out = new Float64Array(H * W * I.c);
  for (let c = 0; c < I.c; c++) for (let j = 0; j < W; j++) for (let i = 0; i < H; i++) {
    const sx = j + ox - tx, sy = i + oy - ty;
    let v;
    if (method === 'nearest') { const a = Math.round(sy), b = Math.round(sx); v = a >= 0 && a < I.h && b >= 0 && b < I.w ? I.re[a + b * I.h + c * I.n] : fill; }
    else {
      const a0 = Math.floor(sy), b0 = Math.floor(sx), fa = sy - a0, fb = sx - b0;
      const g = (a, b) => (a >= 0 && a < I.h && b >= 0 && b < I.w ? I.re[a + b * I.h + c * I.n] : fill);
      if (fa < 1e-12 && fb < 1e-12) v = g(a0, b0);
      else v = (1 - fa) * (1 - fb) * g(a0, b0) + fa * (1 - fb) * g(a0 + 1, b0) + (1 - fa) * fb * g(a0, b0 + 1) + fa * fb * g(a0 + 1, b0 + 1);
    }
    out[i + j * H + c * H * W] = v;
  }
  return makeOut(I.cls, I.c > 1 ? [H, W, ...I.dims.slice(2)] : [H, W], out);
}

// ------------------------------------------------------------- test images

function checkerboardFn(args) {
  const n = args[0] !== undefined ? nums(args[0])[0] : 10;
  const p = args[1] !== undefined ? nums(args[1])[0] : 4;
  const q = args[2] !== undefined ? nums(args[2])[0] : p;
  const H = 2 * p * n, W = 2 * q * n;
  const out = new Float64Array(H * W);
  for (let j = 0; j < W; j++) for (let i = 0; i < H; i++) {
    const bi = Math.floor(i / n), bj = Math.floor(j / n);
    const dark = (bi + bj) % 2 === 1;
    out[i + j * H] = dark ? 0 : j >= W / 2 ? 0.7 : 1;
  }
  return dbl([H, W], out);
}
// Modified Shepp-Logan ellipses: [A a b x0 y0 phi(deg)]
const SHEPP = [[1, 0.69, 0.92, 0, 0, 0], [-0.8, 0.6624, 0.874, 0, -0.0184, 0], [-0.2, 0.11, 0.31, 0.22, 0, -18], [-0.2, 0.16, 0.41, -0.22, 0, 18], [0.1, 0.21, 0.25, 0, 0.35, 0], [0.1, 0.046, 0.046, 0, 0.1, 0], [0.1, 0.046, 0.046, 0, -0.1, 0], [0.1, 0.046, 0.023, -0.08, -0.605, 0], [0.1, 0.023, 0.023, 0, -0.606, 0], [0.1, 0.023, 0.046, 0.06, -0.605, 0]];
const SHEPP_ORIG = [[2, 0.69, 0.92, 0, 0, 0], [-0.98, 0.6624, 0.874, 0, -0.0184, 0], [-0.02, 0.11, 0.31, 0.22, 0, -18], [-0.02, 0.16, 0.41, -0.22, 0, 18], [0.01, 0.21, 0.25, 0, 0.35, 0], [0.01, 0.046, 0.046, 0, 0.1, 0], [0.01, 0.046, 0.046, 0, -0.1, 0], [0.01, 0.046, 0.023, -0.08, -0.605, 0], [0.01, 0.023, 0.023, 0, -0.606, 0], [0.01, 0.023, 0.046, 0.06, -0.605, 0]];
function phantomFn(args, nargout) {
  let E = SHEPP, n = 256;
  for (const a of args) {
    const s = lstr(a);
    if (s === 'modified shepp-logan') E = SHEPP; else if (s === 'shepp-logan') E = SHEPP_ORIG;
    else if (s !== null) throw IE('phantom', 'badType', `Unknown phantom '${toStr(a)}'.`);
    else { const t = toTensor(a); if (t.re.length === 1) n = t.re[0]; else { E = []; const r = t.dims[0]; for (let i = 0; i < r; i++) E.push([0, 1, 2, 3, 4, 5].map((k) => t.re[i + k * r])); } }
  }
  const out = new Float64Array(n * n);
  for (const [A, a, b, x0, y0, phi] of E) {
    const c = Math.cos(phi * Math.PI / 180), s = Math.sin(phi * Math.PI / 180);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = (2 * j - (n - 1)) / (n - 1), y = ((n - 1) - 2 * i) / (n - 1);
      const xr = (x - x0) * c + (y - y0) * s, yr = -(x - x0) * s + (y - y0) * c;
      if ((xr / a) ** 2 + (yr / b) ** 2 <= 1) out[i + j * n] += A;
    }
  }
  const P = dbl([n, n], out);
  if (nargout >= 2) { const re = new Float64Array(E.length * 6); E.forEach((e, i) => e.forEach((v, k) => { re[i + k * E.length] = v; })); return [P, dbl([E.length, 6], re)]; }
  return P;
}

// ------------------------------------------------------------- CIELAB

const WHITE = { d65: [0.95047, 1, 1.08883], d50: [0.96422, 1, 0.82521], a: [1.0985, 1, 0.35585], c: [0.98074, 1, 1.18232], e: [1, 1, 1], icc: [0.9642, 1, 0.8249] };
// sRGB (linear) → XYZ matrix and its exact inverse, so that lab2rgb(rgb2lab(x)) round-trips
const MF = [0.4124564, 0.3575761, 0.1804375, 0.2126729, 0.7151522, 0.0721750, 0.0193339, 0.1191920, 0.9503041];
const MI = (() => {
  const [a, b, c, d, e, f, g, h, i] = MF;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
})();
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const fLab = (t) => (t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29);
const fInv = (t) => (t > 6 / 29 ? t ** 3 : 3 * (6 / 29) ** 2 * (t - 4 / 29));
function triples(v, fn) {
  const I = imgOf(v, fn);
  const unit = toUnit(I);
  if (I.c === 3) return { get: (k) => [unit[k], unit[k + I.n], unit[k + 2 * I.n]], n: I.n, dims: I.dims, stride: I.n, cls: I.cls };
  if (I.w === 3 && I.dims.length === 2) return { get: (k) => [unit[k], unit[k + I.h], unit[k + 2 * I.h]], n: I.h, dims: I.dims, stride: I.h, cls: I.cls };
  throw IE(fn, 'badInput', 'Input must be an m-by-n-by-3 image or a c-by-3 colormap.');
}
function whiteOf(args, start) { let w = WHITE.d65; for (let i = start; i < args.length; i += 2) if (lstr(args[i]) === 'whitepoint') { const v = args[i + 1]; w = isText(v) ? WHITE[lstr(v)] : nums(v); if (!w) throw IE('rgb2lab', 'badWhite', 'Unknown white point.'); } return w; }
function rgb2labFn(args) {
  need(args, 1, 'rgb2lab');
  const T = triples(args[0], 'rgb2lab'); const W = whiteOf(args, 1);
  const out = new Float64Array(T.n * 3);
  for (let k = 0; k < T.n; k++) {
    const [r, g, b] = T.get(k).map(lin);
    const X = MF[0] * r + MF[1] * g + MF[2] * b, Y = MF[3] * r + MF[4] * g + MF[5] * b, Z = MF[6] * r + MF[7] * g + MF[8] * b;
    const fx = fLab(X / W[0]), fy = fLab(Y / W[1]), fz = fLab(Z / W[2]);
    out[k] = 116 * fy - 16; out[k + T.stride] = 500 * (fx - fy); out[k + 2 * T.stride] = 200 * (fy - fz);
  }
  return tensor(T.cls === 'single' ? 'single' : 'double', T.dims, out);
}
function lab2rgbFn(args) {
  need(args, 1, 'lab2rgb');
  const t = toTensor(args[0]); const d = t.dims;
  const n = d.length === 3 ? d[0] * d[1] : d[0], stride = n;
  if (!(d.length === 3 && d[2] === 3) && !(d.length === 2 && d[1] === 3)) throw IE('lab2rgb', 'badInput', 'Input must be an m-by-n-by-3 array or a c-by-3 matrix.');
  const W = whiteOf(args, 1);
  let outType = 'double';
  for (let i = 1; i < args.length; i += 2) if (lstr(args[i]) === 'outputtype') outType = lstr(args[i + 1]);
  const out = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) {
    const L = t.re[k], a = t.re[k + stride], b = t.re[k + 2 * stride];
    const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
    const X = W[0] * fInv(fx), Y = W[1] * fInv(fy), Z = W[2] * fInv(fz);
    const r = MI[0] * X + MI[1] * Y + MI[2] * Z, g = MI[3] * X + MI[4] * Y + MI[5] * Z, bb = MI[6] * X + MI[7] * Y + MI[8] * Z;
    out[k] = gam(r); out[k + stride] = gam(g); out[k + 2 * stride] = gam(bb);
  }
  if (outType === 'double' || outType === 'single') return tensor(outType, d, out);
  return fromUnit(Float64Array.from(out, (x) => Math.min(1, Math.max(0, x))), d, outType);
}

// ------------------------------------------------------------- bwdist

function bwdistFn(args, nargout) {
  need(args, 1, 'bwdist');
  const I = imgOf(args[0], 'bwdist');
  const metric = args[1] !== undefined ? lstr(args[1]) : 'euclidean';
  const { h, w } = I; const bw = I.re;
  const D = new Float64Array(h * w).fill(Infinity), L = new Float64Array(h * w);
  const pts = []; for (let k = 0; k < h * w; k++) if (bw[k]) pts.push(k);
  if (!pts.length) return nargout >= 2 ? [dbl([h, w], D), dbl([h, w], L)] : dbl([h, w], D);
  if (metric === 'euclidean' || metric === 'quasi-euclidean') {
    // exact Euclidean distance transform (Felzenszwalb-Huttenlocher), with nearest index tracking
    const INF = 1e20;
    const g = new Float64Array(h * w), gi = new Int32Array(h * w);
    for (let j = 0; j < w; j++) {
      const f = new Float64Array(h), fi = new Int32Array(h);
      for (let i = 0; i < h; i++) { f[i] = bw[i + j * h] ? 0 : INF; fi[i] = i + j * h; }
      const [dd, ii] = edt1(f, fi, h);
      for (let i = 0; i < h; i++) { g[i + j * h] = dd[i]; gi[i + j * h] = ii[i]; }
    }
    for (let i = 0; i < h; i++) {
      const f = new Float64Array(w), fi = new Int32Array(w);
      for (let j = 0; j < w; j++) { f[j] = g[i + j * h]; fi[j] = gi[i + j * h]; }
      const [dd, ii] = edt1(f, fi, w);
      for (let j = 0; j < w; j++) { D[i + j * h] = Math.sqrt(dd[j]); L[i + j * h] = ii[j] + 1; }
    }
  } else {
    const dist = metric === 'cityblock' ? (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) : metric === 'chessboard' ? (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) : null;
    if (!dist) throw IE('bwdist', 'badMetric', `Unknown distance metric '${metric}'.`);
    const P = pts.map((k) => [k % h, Math.floor(k / h), k]);
    for (let k = 0; k < h * w; k++) { const q = [k % h, Math.floor(k / h)]; let best = Infinity, bi = 0; for (const p of P) { const d = dist(q, p); if (d < best) { best = d; bi = p[2]; } } D[k] = best; L[k] = bi + 1; }
  }
  return nargout >= 2 ? [tensor('single', [h, w], D.map(Math.fround)), tensor('uint32', [h, w], L)] : tensor('single', [h, w], D.map(Math.fround));
}
function edt1(f, fi, n) {
  const d = new Float64Array(n), di = new Int32Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    for (;;) { const p = v[k]; s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p); if (s <= z[k] && k > 0) k--; else break; }
    if (s <= z[k]) { v[k] = q; z[k + 1] = Infinity; continue; }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const p = v[k]; d[q] = (q - p) * (q - p) + f[p]; di[q] = fi[p]; }
  return [d, di];
}

// ------------------------------------------------------------- regional extrema

function regionalFn(args, fn, isMax) {
  need(args, 1, fn);
  const I = imgOf(args[0], fn);
  const conn = args[1] !== undefined ? nums(args[1])[0] : 8;
  const { h, w, re } = I;
  const out = new Float64Array(h * w); const seen = new Uint8Array(h * w);
  const nb = conn === 4 ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let s = 0; s < h * w; s++) {
    if (seen[s]) continue;
    const v = re[s]; const stack = [s], region = []; seen[s] = 1; let ok = true;
    while (stack.length) {
      const k = stack.pop(); region.push(k); const i = k % h, j = Math.floor(k / h);
      for (const [di, dj] of nb) {
        const a = i + di, b = j + dj; if (a < 0 || a >= h || b < 0 || b >= w) continue;
        const q = a + b * h; const u = re[q];
        if (u === v) { if (!seen[q]) { seen[q] = 1; stack.push(q); } } else if (isMax ? u > v : u < v) ok = false;
      }
    }
    if (ok) for (const k of region) out[k] = 1;
  }
  return logical([h, w], out);
}

// ------------------------------------------------------------- multithresh / imquantize

function multithreshFn(args, nargout) {
  need(args, 1, 'multithresh');
  const I = imgOf(args[0], 'multithresh');
  const N = args[1] !== undefined ? nums(args[1])[0] : 1;
  if (!(N >= 1 && N <= 20 && Number.isInteger(N))) throw IE('multithresh', 'badN', 'N must be an integer between 1 and 20.');
  const vals = Array.from(I.re).filter((x) => Number.isFinite(x));
  const lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) return nargout >= 2 ? [tensor('double', [1, N], new Float64Array(N).fill(lo)), num(0)] : tensor('double', [1, N], new Float64Array(N).fill(lo));
  const B = 256; const hist = new Float64Array(B);
  for (const x of vals) hist[Math.min(B - 1, Math.floor((x - lo) / (hi - lo) * B))]++;
  const tot = vals.length; const p = Array.from(hist, (c) => c / tot);
  const P = [0], S = [0]; for (let k = 0; k < B; k++) { P.push(P[k] + p[k]); S.push(S[k] + k * p[k]); }
  const mu = S[B];
  const between = (cuts) => { let s = 0, prev = 0; for (const c of [...cuts, B]) { const w = P[c] - P[prev]; if (w > 0) { const m = (S[c] - S[prev]) / w; s += w * (m - mu) ** 2; } prev = c; } return s; };
  let best = null, bv = -1;
  if (N <= 2) {
    if (N === 1) {
      // middle of the (possibly flat) optimal range of cuts
      const vs = []; for (let a = 1; a < B; a++) { const v = between([a]); vs.push(v); if (v > bv) bv = v; }
      const opt = []; vs.forEach((v, k) => { if (v >= bv * (1 - 1e-12)) opt.push(k + 1); });
      best = [opt[Math.floor((opt.length - 1) / 2)]];
    }
    else for (let a = 1; a < B - 1; a++) for (let b = a + 1; b < B; b++) { const v = between([a, b]); if (v > bv) { bv = v; best = [a, b]; } }
  } else {
    // coordinate ascent from equally spaced cuts
    best = Array.from({ length: N }, (_, k) => Math.round((k + 1) * B / (N + 1))); bv = between(best);
    for (let it = 0; it < 50; it++) {
      let changed = false;
      for (let k = 0; k < N; k++) {
        const lo2 = k ? best[k - 1] + 1 : 1, hi2 = k < N - 1 ? best[k + 1] - 1 : B - 1;
        for (let c = lo2; c <= hi2; c++) { const t = best.slice(); t[k] = c; const v = between(t); if (v > bv + 1e-15) { bv = v; best = t; changed = true; } }
      }
      if (!changed) break;
    }
  }
  const thr = best.map((c) => lo + (c / B) * (hi - lo));
  let tv = 0; for (let k = 0; k < B; k++) tv += p[k] * (k - mu) ** 2;
  const out = tensor('double', [1, N], Float64Array.from(thr));
  return nargout >= 2 ? [out, num(tv > 0 ? bv / tv : 0)] : out;
}
function imquantizeFn(args, nargout) {
  need(args, 2, 'imquantize');
  const A = toTensor(args[0]); const lev = nums(args[1]).sort((a, b) => a - b);
  const vals = args[2] !== undefined ? nums(args[2]) : null;
  if (vals && vals.length !== lev.length + 1) throw IE('imquantize', 'badValues', 'VALUES must have one more element than LEVELS.');
  const idx = Float64Array.from(A.re, (x) => { let k = 0; while (k < lev.length && x > lev[k]) k++; return k + 1; });
  const out = vals ? tensor(args[2].cls === 'single' ? 'single' : args[2].cls in { uint8: 1, uint16: 1, int16: 1 } ? args[2].cls : 'double', A.dims, Float64Array.from(idx, (k) => vals[k - 1])) : tensor('double', A.dims, idx);
  return nargout >= 2 ? [out, tensor('double', A.dims, idx)] : out;
}

// ------------------------------------------------------------- imtile / ssim

function imtileFn(args) {
  need(args, 1, 'imtile');
  const A = args[0];
  let imgs;
  if (isCell(A)) imgs = A.data.map((v) => imgOf(v, 'imtile'));
  else { const I = imgOf(A, 'imtile'); const d = I.dims; const cc = d.length === 4 ? d[2] : 1; const k = d.length === 4 ? d[3] : d.length === 3 ? d[2] : 1; imgs = Array.from({ length: k }, (_, q) => ({ ...I, c: cc, dims: [I.h, I.w, cc], re: I.re.subarray(q * I.n * cc, (q + 1) * I.n * cc) })); }
  let grid = null, bg = 0;
  for (let i = 1; i < args.length; i += 2) { const s = lstr(args[i]); if (s === 'gridsize') grid = nums(args[i + 1]); else if (s === 'backgroundcolor') bg = nums(args[i + 1])[0]; else throw IE('imtile', 'badOption', `Invalid option '${toStr(args[i])}'.`); }
  const k = imgs.length;
  const th = Math.max(...imgs.map((m) => m.h)), tw = Math.max(...imgs.map((m) => m.w)), C = Math.max(...imgs.map((m) => m.c));
  let rows, cols;
  if (grid && Number.isFinite(grid[0]) && Number.isFinite(grid[1])) [rows, cols] = grid;
  else if (grid && Number.isFinite(grid[0])) { rows = grid[0]; cols = Math.ceil(k / rows); }
  else if (grid && Number.isFinite(grid[1])) { cols = grid[1]; rows = Math.ceil(k / cols); }
  else { cols = Math.ceil(Math.sqrt(k * th / tw)); rows = Math.ceil(k / cols); }
  const H = rows * th, W = cols * tw;
  const out = new Float64Array(H * W * C).fill(bg);
  imgs.forEach((m, q) => {
    if (q >= rows * cols) return;
    const r0 = Math.floor(q / cols) * th, c0 = (q % cols) * tw;
    const u = m.cls === imgs[0].cls ? m.re : toUnit(m);
    for (let c = 0; c < C; c++) for (let j = 0; j < m.w; j++) for (let i = 0; i < m.h; i++) out[r0 + i + (c0 + j) * H + c * H * W] = u[i + j * m.h + Math.min(c, m.c - 1) * m.n];
  });
  return makeOut(imgs[0].cls, C > 1 ? [H, W, C] : [H, W], out);
}
function ssimFn(args, nargout) {
  need(args, 2, 'ssim');
  const A = imgOf(args[0], 'ssim'), R = imgOf(args[1], 'ssim');
  if (A.re.length !== R.re.length) throw IE('ssim', 'sizeMismatch', 'A and REF must be the same size.');
  let L = A.cls === 'uint8' ? 255 : A.cls === 'uint16' ? 65535 : 1;
  let sigma = 1.5;
  for (let i = 2; i < args.length; i += 2) { const s = lstr(args[i]); if (s === 'radius') sigma = nums(args[i + 1])[0]; else if (s === 'dynamicrange') L = nums(args[i + 1])[0]; else if (s !== 'exponents' && s !== 'regularizationconstants') throw IE('ssim', 'badOption', `Invalid option '${toStr(args[i])}'.`); }
  const C1 = (0.01 * L) ** 2, C2 = (0.03 * L) ** 2;
  const r = Math.ceil(3 * sigma); const kw = 2 * r + 1; const K = new Float64Array(kw * kw); let ks = 0;
  for (let q = 0; q < kw; q++) for (let p = 0; p < kw; p++) { const v = Math.exp(-((p - r) ** 2 + (q - r) ** 2) / (2 * sigma * sigma)); K[p + q * kw] = v; ks += v; }
  for (let i = 0; i < K.length; i++) K[i] /= ks;
  const { h, w } = A;
  const blur = (f) => { const o = new Float64Array(h * w); for (let j = 0; j < w; j++) for (let i = 0; i < h; i++) { let s = 0; for (let q = 0; q < kw; q++) for (let p = 0; p < kw; p++) { let a = i + p - r, b = j + q - r; a = Math.min(Math.max(a, 0), h - 1); b = Math.min(Math.max(b, 0), w - 1); s += K[p + q * kw] * f[a + b * h]; } o[i + j * h] = s; } return o; };
  const x = Float64Array.from(A.re.subarray(0, h * w)), y = Float64Array.from(R.re.subarray(0, h * w));
  const mx = blur(x), my = blur(y);
  const sxx = blur(x.map((v) => v * v)), syy = blur(y.map((v) => v * v)), sxy = blur(x.map((v, i) => v * y[i]));
  const map = new Float64Array(h * w); let tot = 0;
  for (let i = 0; i < h * w; i++) {
    const vx = sxx[i] - mx[i] ** 2, vy = syy[i] - my[i] ** 2, cxy = sxy[i] - mx[i] * my[i];
    map[i] = ((2 * mx[i] * my[i] + C1) * (2 * cxy + C2)) / ((mx[i] ** 2 + my[i] ** 2 + C1) * (vx + vy + C2));
    tot += map[i];
  }
  const val = num(tot / (h * w));
  return nargout >= 2 ? [val, dbl([h, w], map)] : val;
}

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const builtins = {
  mean2: mean2Fn, std2: std2Fn, corr2: corr2Fn,
  im2col: im2colFn, col2im: col2imFn, nlfilter: nlfilterFn, blockproc: blockprocFn,
  stdfilt: stdfiltFn, rangefilt: rangefiltFn, entropyfilt: entropyfiltFn,
  imtranslate: imtranslateFn, checkerboard: checkerboardFn, phantom: phantomFn,
  rgb2lab: rgb2labFn, lab2rgb: lab2rgbFn, bwdist: bwdistFn,
  imregionalmax: (args) => regionalFn(args, 'imregionalmax', true),
  imregionalmin: (args) => regionalFn(args, 'imregionalmin', false),
  multithresh: multithreshFn, imquantize: imquantizeFn, imtile: imtileFn, ssim: ssimFn,
};
export const help = {
  mean2: H('Average of all matrix elements.', '행렬 전체 원소의 평균.', ['B = mean2(A)']),
  std2: H('Standard deviation of all matrix elements.', '행렬 전체 원소의 표준편차.', ['B = std2(A)']),
  corr2: H('2-D correlation coefficient.', '2차원 상관 계수.', ['R = corr2(A, B)']),
  im2col: H('Rearranges image blocks into columns.', '이미지 블록을 열로 재배열.', ['B = im2col(A, [m n])', "B = im2col(A, [m n], 'distinct')"]),
  col2im: H('Rearranges columns into image blocks.', '열을 이미지 블록으로 재배열.', ["A = col2im(B, [m n], [mm nn], 'distinct')", "A = col2im(B, [m n], [mm nn], 'sliding')"]),
  nlfilter: H('General sliding-neighbourhood operation.', '일반 슬라이딩 이웃 연산.', ['B = nlfilter(A, [m n], fun)']),
  blockproc: H('Distinct block processing (fun receives a block struct with field data).', '개별 블록 처리 (fun 은 data 필드를 가진 블록 구조체를 받음).', ['B = blockproc(A, [m n], fun)']),
  stdfilt: H('Local standard deviation of an image.', '이미지의 국소 표준편차.', ['J = stdfilt(I)', 'J = stdfilt(I, nhood)']),
  rangefilt: H('Local range of an image.', '이미지의 국소 범위.', ['J = rangefilt(I)', 'J = rangefilt(I, nhood)']),
  entropyfilt: H('Local entropy of a grayscale image.', '회색조 이미지의 국소 엔트로피.', ['J = entropyfilt(I)', 'J = entropyfilt(I, nhood)']),
  imtranslate: H('Translates an image.', '이미지 평행 이동.', ['B = imtranslate(A, [tx ty])', "B = imtranslate(..., 'FillValues', v, 'OutputView', 'full')", "B = imtranslate(..., 'nearest')"]),
  checkerboard: H('Checkerboard test image.', '체커보드 테스트 이미지.', ['I = checkerboard', 'I = checkerboard(n)', 'I = checkerboard(n, p, q)']),
  phantom: H('Head phantom test image (Shepp-Logan).', '머리 팬텀 테스트 이미지 (Shepp-Logan).', ['P = phantom(n)', "P = phantom('Modified Shepp-Logan', n)", '[P, E] = phantom(...)']),
  rgb2lab: H('Converts RGB to CIE 1976 L*a*b*.', 'RGB 를 CIE 1976 L*a*b* 로 변환.', ['lab = rgb2lab(rgb)', "lab = rgb2lab(rgb, 'WhitePoint', 'd50')"]),
  lab2rgb: H('Converts CIE 1976 L*a*b* to RGB.', 'CIE 1976 L*a*b* 를 RGB 로 변환.', ['rgb = lab2rgb(lab)', "rgb = lab2rgb(lab, 'OutputType', 'uint8')"]),
  bwdist: H('Distance transform of a binary image.', '이진 이미지의 거리 변환.', ['D = bwdist(BW)', '[D, idx] = bwdist(BW)', "D = bwdist(BW, 'cityblock')"]),
  imregionalmax: H('Regional maxima.', '영역 최댓값.', ['BW = imregionalmax(I)', 'BW = imregionalmax(I, conn)']),
  imregionalmin: H('Regional minima.', '영역 최솟값.', ['BW = imregionalmin(I)', 'BW = imregionalmin(I, conn)']),
  multithresh: H("Multilevel image thresholds (Otsu's method).", '다중 레벨 이미지 임계값 (Otsu 방법).', ['thresh = multithresh(A)', 'thresh = multithresh(A, N)', '[thresh, metric] = multithresh(...)']),
  imquantize: H('Quantizes an image with given levels.', '주어진 레벨로 이미지 양자화.', ['quant = imquantize(A, levels)', 'quant = imquantize(A, levels, values)', '[quant, index] = imquantize(...)']),
  imtile: H('Combines images into one tiled image.', '여러 이미지를 하나의 타일 이미지로 결합.', ['B = imtile(I)', 'B = imtile({I1, I2, ...})', "B = imtile(..., 'GridSize', [r c])"]),
  ssim: H('Structural similarity index.', '구조적 유사도 지수.', ['ssimval = ssim(A, ref)', '[ssimval, ssimmap] = ssim(A, ref)']),
};
