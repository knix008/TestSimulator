// Signal processing operations: filter filter2 conv2 convn (only when the
// base/linear-algebra areas do not define them), filtfilt sosfilt fftfilt
// resample upfirdn decimate interp upsample downsample medfilt1 sgolay
// sgolayfilt hilbert envelope findpeaks cceps rceps icceps residuez
// waveforms (chirp square sawtooth pulstran rectpuls tripuls gauspuls sinc
// diric), unwrap and dB conversions.
import { E, H, F, M, row, col, num, cplx, tensor, toNum, isText, toStr, isFuncHandle, isEmptyV, toRows, fromRows, callFn, tryCall, prod } from '../_util.js';
import { filter as kfilter, solve as ksolve, qr as kqr, roots as kroots, poly as kpoly } from '../_kernels.js';
import { columnsOf, fromColumns, vecIn, vout, cvout, convR, dft, lowerText, sincf, cdiv, cmul, cadd, csub, cabs, rootsC, polyCx } from './_dsp.js';
import { filtCoeffs, unwrapArr } from './spectral.js';
import { firlsCore } from './design.js';
import { kaiserW, hammingW } from './windows.js';
import { cheb1ap, designZpk } from './design.js';
import { zpk2tf } from './_dsp.js';

// ------------------------------------------------------------ helpers
/** Elementwise map over any real tensor, keeping dims. */
function mapT(v, f) { const t = M(v); const re = new Float64Array(t.a.length); for (let i = 0; i < re.length; i++) re[i] = f(t.a[i]); return tensor('double', t.dims || [t.m, t.n], re); }
const colsApply = (v, fn) => { const X = columnsOf(v); const out = X.cols.map((c, j) => fn(c, j)); return fromColumns(out, X.isRow); };
const optNum = (args, i, def) => (args.length > i && !isText(args[i]) && !isEmptyV(args[i]) ? toNum(args[i]) : def);

// ------------------------------------------------------------ filter / convolution
export function filterImpl(args, nargout) {
  if (args.length < 3) throw E('filter:args', 'Usage: y = filter(b, a, x).');
  const b = Array.from(F(args[0])), a = Array.from(F(args[1]));
  if (!a.length || a[0] === 0) throw E('filter:a0', 'First denominator filter coefficient must be non-zero.');
  const xv = args[2]; const t = M(xv);
  let dim = null; if (args.length > 4) dim = toNum(args[4]);
  const dims = t.dims || [t.m, t.n];
  if (dim == null) { dim = dims.findIndex((d) => d !== 1) + 1 || 1; }
  const nst = Math.max(a.length, b.length) - 1;
  const zi = args.length > 3 && !isEmptyV(args[3]) ? F(args[3]) : null;
  // iterate over vectors along dim
  const L = dims[dim - 1] || 1; const stride = dims.slice(0, dim - 1).reduce((p, d) => p * d, 1); const total = prod(dims); const nvec = total / (L || 1);
  const yr = new Float64Array(total), yi = t.im ? new Float64Array(total) : null; const zf = new Float64Array(nst * nvec);
  let v = 0;
  for (let outer = 0; outer < total / (L * stride || 1); outer++) for (let inner = 0; inner < stride; inner++, v++) {
    const base = outer * L * stride + inner; const x = new Float64Array(L), xi = t.im ? new Float64Array(L) : null;
    for (let k = 0; k < L; k++) { x[k] = t.a[base + k * stride]; if (xi) xi[k] = t.im[base + k * stride]; }
    const z0 = zi ? Array.from(zi.subarray(v * nst, v * nst + nst)) : null;
    if (zi && zi.length !== nst * nvec && zi.length !== nst) throw E('filter:badZi', `Initial conditions must have ${nst} rows.`);
    const zz = zi && zi.length === nst ? Array.from(zi) : z0;
    const r = kfilter(b, a, x, zz);
    for (let k = 0; k < L; k++) yr[base + k * stride] = r.y[k];
    if (xi) { const ri = kfilter(b, a, xi, null); for (let k = 0; k < L; k++) yi[base + k * stride] = ri.y[k]; }
    for (let k = 0; k < nst; k++) zf[v * nst + k] = r.zf[k];
  }
  const y = cplx(dims, yr, yi);
  return nargout > 1 ? [y, nvec === 1 ? col(zf) : tensor('double', [nst, nvec], zf)] : [y];
}
function conv2Core(A, B, shape) {
  const ma = A.m, na = A.n, mb = B.m, nb = B.n;
  const fm = ma + mb - 1, fn = na + nb - 1; const cpx = !!(A.im || B.im);
  const re = new Float64Array(Math.max(0, fm * fn)), im = cpx ? new Float64Array(re.length) : null;
  for (let ja = 0; ja < na; ja++) for (let ia = 0; ia < ma; ia++) {
    const ar = A.a[ia + ja * ma], ai = A.im ? A.im[ia + ja * ma] : 0; if (ar === 0 && ai === 0) continue;
    for (let jb = 0; jb < nb; jb++) for (let ib = 0; ib < mb; ib++) {
      const br = B.a[ib + jb * mb], bi = B.im ? B.im[ib + jb * mb] : 0; const o = ia + ib + (ja + jb) * fm;
      re[o] += ar * br - ai * bi; if (im) im[o] += ar * bi + ai * br;
    }
  }
  let r0 = 0, c0 = 0, om = fm, on = fn;
  if (shape === 'same') { r0 = Math.floor(mb / 2); c0 = Math.floor(nb / 2); om = ma; on = na; }
  else if (shape === 'valid') { r0 = mb - 1; c0 = nb - 1; om = Math.max(0, ma - mb + 1); on = Math.max(0, na - nb + 1); if (mb === 0 || nb === 0) { om = ma; on = na; } }
  else if (shape !== 'full') throw E('conv2:badShape', "Shape must be 'full', 'same' or 'valid'.");
  if (!ma || !na || !mb || !nb) return cplx([shape === 'full' ? Math.max(0, fm) : om, shape === 'full' ? Math.max(0, fn) : on], new Float64Array(0), null);
  const or = new Float64Array(om * on), oi = im ? new Float64Array(om * on) : null;
  for (let j = 0; j < on; j++) for (let i = 0; i < om; i++) { or[i + j * om] = re[i + r0 + (j + c0) * fm]; if (oi) oi[i + j * om] = im[i + r0 + (j + c0) * fm]; }
  return cplx([om, on], or, oi);
}
function conv2Impl(args) {
  let shape = 'full'; let a = args;
  if (a.length && isText(a[a.length - 1])) { shape = toStr(a[a.length - 1]).toLowerCase(); a = a.slice(0, -1); }
  if (a.length === 3) {
    const u = M(a[0]), v = M(a[1]);
    const K = conv2Core({ m: u.a.length, n: 1, a: u.a, im: u.im }, { m: 1, n: v.a.length, a: v.a, im: v.im }, 'full');
    return conv2Core(M(a[2]), M(K), shape);
  }
  if (a.length !== 2) throw E('conv2:args', 'Usage: C = conv2(A, B, shape).');
  return conv2Core(M(a[0]), M(a[1]), shape);
}
function filter2Impl(args) {
  if (args.length < 2) throw E('filter2:args', 'Usage: Y = filter2(h, X, shape).');
  const shape = args.length > 2 ? toStr(args[2]).toLowerCase() : 'same';
  const h = M(args[0]); const r = new Float64Array(h.a.length), ri = h.im ? new Float64Array(h.a.length) : null;
  for (let j = 0; j < h.n; j++) for (let i = 0; i < h.m; i++) { const s = (h.m - 1 - i) + (h.n - 1 - j) * h.m; r[i + j * h.m] = h.a[s]; if (ri) ri[i + j * h.m] = h.im[s]; }
  return conv2Core(M(args[1]), { m: h.m, n: h.n, a: r, im: ri }, shape);
}
function convnImpl(args) {
  if (args.length < 2) throw E('convn:args', 'Usage: C = convn(A, B, shape).');
  const shape = args.length > 2 ? toStr(args[2]).toLowerCase() : 'full';
  const A = M(args[0]), B = M(args[1]);
  const da = A.dims || [A.m, A.n], db = B.dims || [B.m, B.n]; const nd = Math.max(da.length, db.length);
  const ga = Array.from({ length: nd }, (_, i) => da[i] || 1), gb = Array.from({ length: nd }, (_, i) => db[i] || 1);
  const full = ga.map((x, i) => x + gb[i] - 1);
  const strides = (d) => { const s = [1]; for (let i = 1; i < d.length; i++) s.push(s[i - 1] * d[i - 1]); return s; };
  const sa = strides(ga), sb = strides(gb), sf = strides(full);
  const total = full.reduce((p, x) => p * x, 1); const re = new Float64Array(total);
  const na = prod(ga), nbb = prod(gb);
  const sub = (idx, d) => { const r = []; for (let i = 0; i < d.length; i++) { r.push(idx % d[i]); idx = Math.floor(idx / d[i]); } return r; };
  const subsB = Array.from({ length: nbb }, (_, k) => sub(k, gb));
  for (let ka = 0; ka < na; ka++) {
    const av = A.a[ka]; if (av === 0) continue; const s = sub(ka, ga);
    for (let kb = 0; kb < nbb; kb++) { const bv = B.a[kb]; if (bv === 0) continue; const t = subsB[kb]; let o = 0; for (let i = 0; i < nd; i++) o += (s[i] + t[i]) * sf[i]; re[o] += av * bv; }
  }
  let off, od;
  if (shape === 'full') { off = full.map(() => 0); od = full; }
  else if (shape === 'same') { off = gb.map((x) => Math.floor(x / 2)); od = ga; }
  else if (shape === 'valid') { off = gb.map((x) => x - 1); od = ga.map((x, i) => Math.max(0, x - gb[i] + 1)); }
  else throw E('convn:badShape', "Shape must be 'full', 'same' or 'valid'.");
  const ot = od.reduce((p, x) => p * x, 1); const out = new Float64Array(ot);
  for (let k = 0; k < ot; k++) { const s = sub(k, od); let o = 0; for (let i = 0; i < nd; i++) o += (s[i] + off[i]) * sf[i]; out[k] = re[o]; }
  return tensor('double', od, out);
}

// ------------------------------------------------------------ zero-phase and cascaded filtering
export function filtfiltCore(b, a, x) {
  const nfilt = Math.max(b.length, a.length); const nfact = Math.max(1, 3 * (nfilt - 1));
  const L = x.length;
  if (L <= nfact) throw E('filtfilt:tooShort', `Data must have length more than 3 times the filter order (${nfact}).`);
  b = b.slice(); a = a.slice(); while (b.length < nfilt) b.push(0); while (a.length < nfilt) a.push(0);
  const a0 = a[0]; b = b.map((v) => v / a0); a = a.map((v) => v / a0);
  let zi = [];
  if (nfilt > 1) {
    const n = nfilt - 1; const Mx = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) { Mx[i][0] += a[i + 1]; Mx[i][i] += 1; if (i > 0) Mx[i - 1][i] -= 1; }
    const rhs = []; for (let i = 0; i < n; i++) rhs.push(b[i + 1] - b[0] * a[i + 1]);
    zi = ksolve(Mx, rhs);
  }
  const ext = new Float64Array(L + 2 * nfact);
  for (let i = 0; i < nfact; i++) ext[i] = 2 * x[0] - x[nfact - i];
  ext.set(x, nfact);
  for (let i = 0; i < nfact; i++) ext[L + nfact + i] = 2 * x[L - 1] - x[L - 2 - i];
  let y = kfilter(b, a, ext, zi.map((z) => z * ext[0])).y; y.reverse();
  y = kfilter(b, a, y, zi.map((z) => z * y[0])).y; y.reverse();
  return y.slice(nfact, nfact + L);
}
function filtfiltImpl(args) {
  const c = filtCoeffs(args, 'filtfilt'); if (!c.rest.length) throw E('filtfilt:args', 'Usage: y = filtfilt(b, a, x).');
  let b = c.b, a = c.a;
  if (c.sos) {
    let xs = columnsOf(c.rest[c.rest.length - 1]), gain = 1;
    if (c.rest.length > 1) gain = F(c.rest[0]).reduce((p, v) => p * v, 1);
    return fromColumns(xs.cols.map((col0) => { let y = Float64Array.from(col0); for (const r of c.sos) y = filtfiltCore(r.slice(0, 3), r.slice(3, 6), y); return y.map((v) => v * gain * gain); }), xs.isRow);
  }
  return colsApply(c.rest[0], (x) => filtfiltCore(b, a, x));
}
function sosfiltImpl(args) {
  if (args.length < 2) throw E('sosfilt:args', 'Usage: y = sosfilt(sos, x).');
  const sos = toRows(args[0]); if (sos.length && sos[0].length !== 6) throw E('sosfilt:badSos', 'SOS matrix must have 6 columns.');
  return colsApply(args[1], (x) => { let y = x; for (const r of sos) y = kfilter(r.slice(0, 3), r.slice(3, 6), y).y; return y; });
}
function fftfiltImpl(args) {
  if (args.length < 2) throw E('fftfilt:args', 'Usage: y = fftfilt(b, x).');
  const b = F(args[0]);
  return colsApply(args[1], (x) => convR(x, b).slice(0, x.length));
}

// ------------------------------------------------------------ multirate
export function upfirdnCore(x, h, p, q) {
  const Lx = x.length, Lh = h.length; const Ly = Math.ceil(((Lx - 1) * p + Lh) / q);
  const y = new Float64Array(Math.max(0, Ly));
  for (let m = 0; m < Ly; m++) {
    const n = m * q; let s = 0;
    // xu[i] nonzero when i % p == 0 → i = k*p, h index n - k*p in [0, Lh)
    const kmin = Math.max(0, Math.ceil((n - Lh + 1) / p)), kmax = Math.min(Lx - 1, Math.floor(n / p));
    for (let k = kmin; k <= kmax; k++) s += x[k] * h[n - k * p];
    y[m] = s;
  }
  return y;
}
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
function ratApprox(x) { for (let q = 1; q <= 100000; q++) { const p = Math.round(x * q); if (Math.abs(p / q - x) <= 1e-12 * Math.max(1, Math.abs(x))) return [p, q]; } return [Math.round(x * 1e5), 1e5]; }
function resampleImpl(args, nargout) {
  if (args.length < 3) throw E('resample:args', 'Usage: y = resample(x, p, q).');
  let p = toNum(args[1]), q = toNum(args[2]);
  if (!(p > 0 && q > 0)) throw E('resample:badPQ', 'p and q must be positive.');
  if (!Number.isInteger(p) || !Number.isInteger(q)) { const [a, b] = ratApprox(p / q); p = a; q = b; }
  const g = gcd(p, q); p /= g; q /= g;
  let h;
  if (args.length > 3 && F(args[3]).length > 1) h = Float64Array.from(F(args[3]));
  else {
    const n = optNum(args, 3, 10), beta = optNum(args, 4, 5);
    const pqmax = Math.max(p, q); const fc = 1 / 2 / pqmax; const L = 2 * n * pqmax + 1;
    if (n === 0) h = Float64Array.of(p);
    else { const f = firlsCore(L - 1, [0, 2 * fc, 2 * fc, 1], [1, 1, 0, 0]); const w = kaiserW(L, beta); h = f.map((v, i) => p * v * w[i]); }
  }
  const hFilter = h;
  const X = columnsOf(args[0]);
  const out = X.cols.map((x) => {
    let hh = Array.from(hFilter); const L = hh.length; let Lhalf = (L - 1) / 2; const Lx = x.length;
    const nz = Math.floor(q - (Lhalf % q)); hh = [...new Array(nz).fill(0), ...hh]; Lhalf += nz;
    const delay = Math.floor(Math.ceil(Lhalf) / q);
    let nz1 = 0; while (Math.ceil(((Lx - 1) * p + hh.length + nz1) / q) - delay < Math.ceil(Lx * p / q)) nz1++;
    hh = [...hh, ...new Array(nz1).fill(0)];
    const y = upfirdnCore(x, hh, p, q); const Ly = Math.ceil(Lx * p / q);
    return y.slice(delay, delay + Ly);
  });
  return [fromColumns(out, X.isRow), row(hFilter)];
}
function decimateImpl(args) {
  if (args.length < 2) throw E('decimate:args', 'Usage: y = decimate(x, r).');
  const r = toNum(args[1]); if (!Number.isInteger(r) || r < 1) throw E('decimate:badR', 'The decimation factor must be a positive integer.');
  const fir = args.some((a) => lowerText(a) === 'fir');
  const nums = args.slice(2).filter((a) => !isText(a));
  return colsApply(args[0], (x) => {
    const nx = x.length; if (r === 1) return Float64Array.from(x);
    if (fir) {
      const n = nums.length ? toNum(nums[0]) : 30; const b = Float64Array.from(firFromWindow(n, 1 / r));
      const pad = new Float64Array(nx + n); pad.set(x); for (let i = nx; i < nx + n; i++) pad[i] = 2 * x[nx - 1] - x[Math.max(0, 2 * nx - 2 - i)];
      const y = kfilter(Array.from(b), [1], pad).y; const d = Math.floor(n / 2);
      const out = []; for (let i = 0; i < nx; i += r) out.push(y[i + d]); return Float64Array.from(out);
    }
    const n = nums.length ? toNum(nums[0]) : 8;
    const f = designZpk(cheb1ap(n, 0.05), [0.8 / r], 'low', false); const { b, a } = zpk2tf(f);
    const y = filtfiltCore(b, a, x); const nout = Math.ceil(nx / r); const nbeg = r - (r * nout - nx);
    const out = []; for (let i = nbeg - 1; i < nx; i += r) out.push(y[i]); return Float64Array.from(out);
  });
}
function firFromWindow(n, wc) {
  const w = hammingW(n + 1); const b = new Float64Array(n + 1); let s = 0;
  for (let i = 0; i <= n; i++) { b[i] = wc * sincf(wc * (i - n / 2)) * w[i]; s += b[i]; }
  return b.map((v) => v / s);
}
function interpImpl(args) {
  if (args.length < 2) throw E('interp:args', 'Usage: y = interp(x, r).');
  const r = toNum(args[1]); const l = optNum(args, 2, 4); const alpha = optNum(args, 3, 0.5);
  if (!Number.isInteger(r) || r < 1) throw E('interp:badR', 'The interpolation factor must be a positive integer.');
  const half = l * r; const h = new Float64Array(2 * half + 1); const w = kaiserW(2 * half + 1, 5 * alpha + 2);
  for (let k = -half; k <= half; k++) h[k + half] = sincf(k / r) * w[k + half];
  return colsApply(args[0], (x) => { const y = upfirdnCore(x, h, r, 1); return y.slice(half, half + x.length * r); });
}
function upsampleImpl(args) {
  const n = toNum(args[1]); const ph = optNum(args, 2, 0);
  if (!Number.isInteger(n) || n < 1) throw E('upsample:badN', 'The upsampling factor must be a positive integer.');
  if (ph < 0 || ph >= n) throw E('upsample:badPhase', 'The phase must be an integer in [0, n-1].');
  return colsApply(args[0], (x) => { const y = new Float64Array(x.length * n); for (let i = 0; i < x.length; i++) y[i * n + ph] = x[i]; return y; });
}
function downsampleImpl(args) {
  const n = toNum(args[1]); const ph = optNum(args, 2, 0);
  if (!Number.isInteger(n) || n < 1) throw E('downsample:badN', 'The downsampling factor must be a positive integer.');
  if (ph < 0 || ph >= n) throw E('downsample:badPhase', 'The phase must be an integer in [0, n-1].');
  return colsApply(args[0], (x) => { const y = []; for (let i = ph; i < x.length; i += n) y.push(x[i]); return Float64Array.from(y); });
}
function upfirdnImpl(args) {
  if (args.length < 2) throw E('upfirdn:args', 'Usage: y = upfirdn(x, h, p, q).');
  const h = F(args[1]); const p = optNum(args, 2, 1), q = optNum(args, 3, 1);
  return colsApply(args[0], (x) => upfirdnCore(x, h, p, q));
}

// ------------------------------------------------------------ smoothing
function medfilt1Impl(args) {
  if (!args.length) throw E('medfilt1:args', 'Usage: y = medfilt1(x, n).');
  const n = optNum(args, 1, 3); const trunc = args.some((a) => lowerText(a) === 'truncate'); const omit = args.some((a) => lowerText(a) === 'omitnan');
  return colsApply(args[0], (x) => {
    const L = x.length; const y = new Float64Array(L); const lo = n % 2 ? (n - 1) / 2 : n / 2, hi = n % 2 ? (n - 1) / 2 : n / 2 - 1;
    for (let k = 0; k < L; k++) {
      const w = [];
      for (let j = k - lo; j <= k + hi; j++) { if (j < 0 || j >= L) { if (!trunc) w.push(0); } else w.push(x[j]); }
      const v = omit ? w.filter((q) => !Number.isNaN(q)) : w;
      if (!omit && v.some(Number.isNaN)) { y[k] = NaN; continue; }
      if (!v.length) { y[k] = NaN; continue; }
      v.sort((p, q) => p - q); const m = v.length; y[k] = m % 2 ? v[(m - 1) / 2] : (v[m / 2 - 1] + v[m / 2]) / 2;
    }
    return y;
  });
}
export function sgolayCore(k, f) {
  if (f % 2 === 0) throw E('sgolay:evenFrame', 'The frame length must be odd.');
  if (k >= f) throw E('sgolay:order', 'The polynomial order must be less than the frame length.');
  const h = (f - 1) / 2; const S = []; for (let i = -h; i <= h; i++) { const r = []; for (let p = 0; p <= k; p++) r.push(i ** p); S.push(r); }
  // G = S (S'S)^-1
  const StS = Array.from({ length: k + 1 }, (_, a) => Array.from({ length: k + 1 }, (_, b) => S.reduce((s, r) => s + r[a] * r[b], 0)));
  const G = S.map((r) => ksolve(StS, r));
  const B = G.map((g) => S.map((s) => g.reduce((acc, v, p) => acc + v * s[p], 0)));
  return { B, G };
}
function sgolayfiltImpl(args) {
  if (args.length < 3) throw E('sgolayfilt:args', 'Usage: y = sgolayfilt(x, order, framelen).');
  const k = toNum(args[1]), f = toNum(args[2]); const { B } = sgolayCore(k, f); const h = (f - 1) / 2;
  return colsApply(args[0], (x) => {
    const n = x.length; if (n < f) throw E('sgolayfilt:tooShort', 'The data length must be at least the frame length.');
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let rowi, st;
      if (i < h) { rowi = B[i]; st = 0; } else if (i >= n - h) { rowi = B[f - (n - i)]; st = n - f; } else { rowi = B[h]; st = i - h; }
      let s = 0; for (let j = 0; j < f; j++) s += rowi[j] * x[st + j]; y[i] = s;
    }
    return y;
  });
}

// ------------------------------------------------------------ analytic signal and cepstra
export function hilbertCore(x, n) {
  const X = dft(x, null, n); const hgt = new Float64Array(n); hgt[0] = 1;
  if (n % 2 === 0) { for (let i = 1; i < n / 2; i++) hgt[i] = 2; hgt[n / 2] = 1; } else for (let i = 1; i <= (n - 1) / 2; i++) hgt[i] = 2;
  for (let i = 0; i < n; i++) { X.re[i] *= hgt[i]; X.im[i] *= hgt[i]; }
  return dft(X.re, X.im, n, true);
}
function hilbertImpl(args) {
  const X = columnsOf(args[0]); const n = optNum(args, 1, X.len);
  const outs = X.cols.map((c) => hilbertCore(c, n));
  return fromColumns(outs.map((o) => o.re), X.isRow, outs.map((o) => o.im));
}
function envelopeImpl(args, nargout, ctx) {
  const X = columnsOf(args[0]); let fl = null, kind = 'analytic';
  for (const a of args.slice(1)) { const s = lowerText(a); if (s) kind = s; else if (!isEmptyV(a)) fl = toNum(a); }
  const ups = [], los = [];
  for (const x of X.cols) {
    const L = x.length; const m = x.reduce((s, v) => s + v, 0) / L; const up = new Float64Array(L), lo = new Float64Array(L);
    if (kind === 'analytic') { const h = hilbertCore(x.map((v) => v - m), L); for (let i = 0; i < L; i++) { const a = Math.hypot(h.re[i], h.im[i]); up[i] = m + a; lo[i] = m - a; } }
    else if (kind === 'rms') {
      const w = fl || 10; const lo2 = Math.floor((w - 1) / 2), hi2 = w - 1 - lo2;
      for (let i = 0; i < L; i++) { let s = 0, c = 0; for (let j = i - lo2; j <= i + hi2; j++) if (j >= 0 && j < L) { s += (x[j] - m) ** 2; c++; } const r = Math.sqrt(s / c); up[i] = m + r; lo[i] = m - r; }
    } else if (kind === 'peak') {
      const np = fl || 10;
      const env = (sign) => {
        const v = x.map((q) => sign * q); const loc = [0];
        for (let i = 1; i < L - 1; i++) if (v[i] >= v[i - 1] && v[i] > v[i + 1] && i - loc[loc.length - 1] >= np) loc.push(i);
        if (loc[loc.length - 1] !== L - 1) loc.push(L - 1);
        const xs = loc.map((i) => i + 1), ys = loc.map((i) => x[i]);
        const sp = loc.length >= 4 && ctx ? tryCall(ctx, 'spline', [row(xs), row(ys), row(Array.from({ length: L }, (_, i) => i + 1))]) : null;
        if (sp && sp[0]) return F(sp[0]);
        const r = new Float64Array(L); let s = 0;
        for (let i = 0; i < L; i++) { while (s < loc.length - 2 && i > loc[s + 1]) s++; const i0 = loc[s], i1 = loc[s + 1]; r[i] = i1 === i0 ? x[i0] : x[i0] + (x[i1] - x[i0]) * (i - i0) / (i1 - i0); }
        return r;
      };
      up.set(env(1)); lo.set(env(-1));
    } else throw E('envelope:badMethod', `Unknown envelope method '${kind}'.`);
    ups.push(up); los.push(lo);
  }
  return [fromColumns(ups, X.isRow), fromColumns(los, X.isRow)];
}
function rcunwrap(ph) {
  const n = ph.length; const nh = Math.floor((n + 1) / 2); const y = unwrapArr(ph);
  const nd = Math.round(y[nh] / Math.PI); for (let i = 0; i < n; i++) y[i] -= Math.PI * nd * i / nh;
  return { y, nd };
}
function ccepsImpl(args) {
  const v = vecIn(args[0]); const n = optNum(args, 1, v.a.length);
  const X = dft(v.a, null, n); const ph = Array.from(X.re, (r, i) => Math.atan2(X.im[i], r));
  const { y, nd } = rcunwrap(ph);
  const lr = Array.from(X.re, (r, i) => Math.log(Math.hypot(r, X.im[i])));
  const c = dft(lr, y, n, true);
  return [vout(c.re, v.row), num(nd)];
}
function icepsImpl(args) {
  const v = vecIn(args[0]); const nd = optNum(args, 1, 0); const n = optNum(args, 2, v.a.length);
  const Hh = dft(v.a, null, n); const nh = Math.floor((n + 1) / 2);
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) { const ph = Hh.im[i] + Math.PI * nd * i / nh; const m = Math.exp(Hh.re[i]); re[i] = m * Math.cos(ph); im[i] = m * Math.sin(ph); }
  return vout(dft(re, im, n, true).re, v.row);
}
function rcepsImpl(args) {
  const v = vecIn(args[0]); const n = v.a.length;
  const X = dft(v.a, null, n); const lr = Array.from(X.re, (r, i) => Math.log(Math.hypot(r, X.im[i])));
  const y = dft(lr, null, n, true).re;
  const odd = n % 2; const wn = new Float64Array(n); wn[0] = 1; for (let i = 1; i < (n + odd) / 2; i++) wn[i] = 2; if (!odd) wn[n / 2] = 1;
  const yw = y.map((q, i) => q * wn[i]); const Y = dft(yw, null, n);
  const er = new Float64Array(n), ei = new Float64Array(n); for (let i = 0; i < n; i++) { const m = Math.exp(Y.re[i]); er[i] = m * Math.cos(Y.im[i]); ei[i] = m * Math.sin(Y.im[i]); }
  const ym = dft(er, ei, n, true).re;
  return [vout(y, v.row), vout(ym, v.row)];
}

// ------------------------------------------------------------ findpeaks
export function findpeaksCore(y, x, o) {
  const N = y.length; let pk = [];
  for (let i = 1; i < N - 1; i++) {
    if (Number.isNaN(y[i])) continue;
    if (y[i] > y[i - 1] || (Number.isNaN(y[i - 1]) && false)) {
      let j = i; while (j < N - 1 && y[j + 1] === y[i]) j++;
      if (j < N - 1 && y[j + 1] < y[i]) pk.push(i);
      i = j;
    }
  }
  pk = pk.filter((i) => y[i] > o.minH);
  if (o.th > 0) pk = pk.filter((i) => Math.min(y[i] - y[i - 1], y[i] - y[i + 1]) >= o.th);
  // prominence and width
  const info = pk.map((i) => {
    let l = i - 1, lmin = y[i]; while (l >= 0 && !(y[l] > y[i])) { if (y[l] < lmin) lmin = y[l]; l--; }
    let r = i + 1, rmin = y[i]; while (r < N && !(y[r] > y[i])) { if (y[r] < rmin) rmin = y[r]; r++; }
    const base = Math.max(lmin, rmin); const prom = y[i] - base;
    const ref = o.widthRef === 'halfheight' ? y[i] / 2 : y[i] - prom / 2;
    const cross = (dir) => {
      let k = i; const lim = dir < 0 ? Math.max(0, l) : Math.min(N - 1, r);
      while (k !== lim && y[k + dir] >= ref) k += dir;
      if (k === lim && y[k] >= ref) return x[k];
      const k2 = k + dir; const t = (ref - y[k]) / (y[k2] - y[k]); return x[k] + t * (x[k2] - x[k]);
    };
    const wl = cross(-1), wr = cross(1);
    return { i, prom, width: Math.abs(wr - wl), bounds: [wl, wr], ref };
  });
  let sel = info.filter((p) => p.prom >= o.minP && p.width >= o.minW && p.width <= o.maxW);
  if (o.minD > 0 && sel.length > 1) {
    const order = sel.slice().sort((a, b) => y[b.i] - y[a.i]); const keep = new Set(order.map((p) => p.i));
    for (const p of order) { if (!keep.has(p.i)) continue; for (const q of sel) if (q.i !== p.i && keep.has(q.i) && Math.abs(x[q.i] - x[p.i]) < o.minD) keep.delete(q.i); }
    sel = sel.filter((p) => keep.has(p.i));
  }
  if (o.sort === 'descend') sel.sort((a, b) => y[b.i] - y[a.i]); else if (o.sort === 'ascend') sel.sort((a, b) => y[a.i] - y[b.i]);
  if (o.np != null) sel = sel.slice(0, o.np);
  return sel;
}
function findpeaksImpl(args) {
  if (!args.length) throw E('findpeaks:args', 'Usage: [pks, locs] = findpeaks(y).');
  const yv = vecIn(args[0], 'y'); const y = yv.a; let x = null; let i = 1;
  if (args.length > 1 && !isText(args[1])) { x = F(args[1]); i = 2; if (x.length === 1 && y.length > 1) { const fs = x[0]; x = Float64Array.from(y, (_, k) => k / fs); } }
  const xs = x || Float64Array.from(y, (_, k) => k + 1);
  const o = { minH: -Infinity, th: 0, minP: 0, minW: 0, maxW: Infinity, minD: 0, np: null, sort: 'none', widthRef: 'halfprom' };
  for (; i < args.length; i += 2) {
    const k = lowerText(args[i]); const v = args[i + 1]; if (v == null) throw E('findpeaks:badOption', `Option '${k}' needs a value.`);
    if (k === 'minpeakheight') o.minH = toNum(v); else if (k === 'threshold') o.th = toNum(v); else if (k === 'minpeakprominence') o.minP = toNum(v);
    else if (k === 'minpeakwidth') o.minW = toNum(v); else if (k === 'maxpeakwidth') o.maxW = toNum(v); else if (k === 'minpeakdistance') o.minD = toNum(v);
    else if (k === 'npeaks') o.np = toNum(v); else if (k === 'sortstr') o.sort = toStr(v).toLowerCase(); else if (k === 'widthreference') o.widthRef = toStr(v).toLowerCase();
    else if (k === 'annotate') { /* plotting only */ } else throw E('findpeaks:badOption', `Unknown option '${toStr(args[i])}'.`);
  }
  const sel = findpeaksCore(y, xs, o);
  const r = yv.row || (yv.m === 1);
  return [vout(sel.map((p) => y[p.i]), r), vout(sel.map((p) => xs[p.i]), r), vout(sel.map((p) => p.width), r), vout(sel.map((p) => p.prom), r)];
}

// ------------------------------------------------------------ residuez
function residuezImpl(args, nargout) {
  if (args.length === 3 && nargout <= 2) {
    // inverse: [b,a] = residuez(r, p, k)
    const r = toCl(args[0]), p = toCl(args[1]); const k = Array.from(F(args[2]));
    const a = polyCx(p); let b = new Array(Math.max(p.length, 1)).fill(null).map(() => [0, 0]);
    for (let i = 0; i < p.length; i++) { const o = polyCx(p.filter((_, j) => j !== i)); for (let j = 0; j < o.length; j++) b[j] = cadd(b[j], cmul(r[i], o[j])); }
    const kb = []; for (let i = 0; i < k.length + a.length - 1; i++) kb.push([0, 0]);
    for (let i = 0; i < k.length; i++) for (let j = 0; j < a.length; j++) kb[i + j] = cadd(kb[i + j], cmul([k[i], 0], a[j]));
    const L = Math.max(b.length, kb.length); const bb = []; for (let i = 0; i < L; i++) bb.push(cadd(b[i] || [0, 0], kb[i] || [0, 0]));
    return [row(bb.map((z) => z[0])), row(a.map((z) => z[0]))];
  }
  const b = Array.from(F(args[0])), a = Array.from(F(args[1]));
  const a0 = a[0]; const an = a.map((v) => v / a0); let bn = b.map((v) => v / a0);
  let k = [];
  if (bn.length >= an.length) {
    // polynomial division in z^-1: b = k*a + rem with rem degree < length(a)-1
    const nk = bn.length - an.length + 1; const rem = bn.slice(); k = new Array(nk).fill(0);
    // divide reversed polynomials (highest power of z^-1 first)
    const br = rem.slice().reverse(), ar = an.slice().reverse();
    const q = new Array(nk).fill(0);
    for (let i = 0; i < nk; i++) { const c = br[i] / ar[0]; q[i] = c; for (let j = 0; j < ar.length; j++) br[i + j] -= c * ar[j]; }
    k = q.reverse(); bn = br.slice(nk).reverse();
  }
  const p = rootsC(an);
  const r = p.map((pi) => {
    // r_i = B(z)/prod_{j≠i}(1 - p_j z^-1) at z = p_i, B in z^-1
    const zinv = cdiv([1, 0], pi);
    let num = [0, 0]; let zp = [1, 0]; for (const c of bn) { num = cadd(num, cmul([c, 0], zp)); zp = cmul(zp, zinv); }
    let den = [1, 0]; for (const pj of p) if (pj !== pi) den = cmul(den, csub([1, 0], cmul(pj, zinv)));
    return cdiv(num, den);
  });
  const cc = (list) => cplx([list.length, 1], list.map((z) => z[0]), list.map((z) => z[1]));
  return [cc(r), cc(p), row(k)];
}
function toCl(v) { const t = M(v); return Array.from(t.a, (x, i) => [x, t.im ? t.im[i] : 0]); }

// ------------------------------------------------------------ waveforms
function chirpImpl(args) {
  const f0 = optNum(args, 1, 0), t1 = optNum(args, 2, 1), f1 = optNum(args, 3, 100);
  const method = args.length > 4 && isText(args[4]) ? toStr(args[4]).toLowerCase() : 'linear'; const phi = optNum(args, 5, 0) * Math.PI / 180;
  return mapT(args[0], (t) => {
    if (method === 'linear') { const b = (f1 - f0) / t1; return Math.cos(2 * Math.PI * (f0 * t + b / 2 * t * t) + phi); }
    if (method === 'quadratic') { const b = (f1 - f0) / (t1 * t1); return Math.cos(2 * Math.PI * (f0 * t + b / 3 * t * t * t) + phi); }
    if (method === 'logarithmic') { if (f0 <= 0) throw E('chirp:logF0', 'f0 must be positive for a logarithmic chirp.'); const b = (f1 / f0) ** (1 / t1); return Math.cos(2 * Math.PI * f0 * (b ** t - 1) / Math.log(b) + phi); }
    throw E('chirp:badMethod', `Unknown chirp method '${method}'.`);
  });
}
const mod2pi = (t) => ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
function rectp(t, w) { return t >= -w / 2 && t < w / 2 ? 1 : 0; }
function trip(t, w, s) { const a = w / 2; const p = s * a; if (t < -a || t > a) return 0; return t < p ? (t + a) / (p + a) : (a - t) / (a - p); }
function pulstranImpl(args, nargout, ctx) {
  if (args.length < 3) throw E('pulstran:args', 'Usage: y = pulstran(t, d, func, ...).');
  const tt = M(args[0]); const dm = M(args[1]);
  const delays = [], amps = [];
  if (dm.n === 2 && dm.m > 1) for (let i = 0; i < dm.m; i++) { delays.push(dm.a[i]); amps.push(dm.a[i + dm.m]); }
  else for (const d of dm.a) { delays.push(d); amps.push(1); }
  const f = args[2]; const out = new Float64Array(tt.a.length);
  if (!isText(f) && !isFuncHandle(f)) {
    const p = F(f); const fs = optNum(args, 3, 1);
    for (let k = 0; k < delays.length; k++) for (let i = 0; i < out.length; i++) { const pos = (tt.a[i] - delays[k]) * fs; if (pos < 0 || pos > p.length - 1) continue; const i0 = Math.floor(pos); const fr = pos - i0; out[i] += amps[k] * (i0 + 1 < p.length ? p[i0] * (1 - fr) + p[i0 + 1] * fr : p[i0]); }
  } else {
    const extra = args.slice(3);
    for (let k = 0; k < delays.length; k++) {
      const sh = tensor('double', tt.dims || [tt.m, tt.n], Float64Array.from(tt.a, (t) => t - delays[k]));
      const name = isText(f) ? toStr(f) : f; const r = F(callFn(ctx, name, [sh, ...extra], 1)[0]);
      for (let i = 0; i < out.length; i++) out[i] += amps[k] * r[i];
    }
  }
  return tensor('double', tt.dims || [tt.m, tt.n], out);
}
function gauspulsImpl(args, nargout) {
  if (args.length && isText(args[0])) {
    const fc = optNum(args, 1, 1000), bw = optNum(args, 2, 0.5), bwr = optNum(args, 3, -6), tpe = optNum(args, 4, -60);
    const a = -((Math.PI * fc * bw) ** 2) / (4 * Math.log(10 ** (bwr / 20)));
    return num(Math.sqrt(-Math.log(10 ** (tpe / 20)) / a));
  }
  const fc = optNum(args, 1, 1000), bw = optNum(args, 2, 0.5), bwr = optNum(args, 3, -6);
  const a = -((Math.PI * fc * bw) ** 2) / (4 * Math.log(10 ** (bwr / 20)));
  const env = (t) => Math.exp(-a * t * t);
  return [mapT(args[0], (t) => env(t) * Math.cos(2 * Math.PI * fc * t)), mapT(args[0], (t) => env(t) * Math.sin(2 * Math.PI * fc * t)), mapT(args[0], env)];
}
function diric(x, n) {
  const s = Math.sin(x / 2);
  if (Math.abs(s) < 1e-12) { const k = Math.round(x / (2 * Math.PI)); return ((k * (n - 1)) % 2 === 0) ? 1 : -1; }
  return Math.sin(n * x / 2) / (n * s);
}
function unwrapImpl(args) {
  const t = M(args[0]); const tol = optNum(args, 1, Math.PI);
  const dims = t.dims || [t.m, t.n]; let dim = args.length > 2 ? toNum(args[2]) : (dims.findIndex((d) => d !== 1) + 1 || 1);
  const L = dims[dim - 1] || 1, stride = dims.slice(0, dim - 1).reduce((p, d) => p * d, 1), total = t.a.length; const out = new Float64Array(total);
  for (let outer = 0; outer < total / (L * stride || 1); outer++) for (let inner = 0; inner < stride; inner++) {
    const base = outer * L * stride + inner; const v = new Float64Array(L); for (let k = 0; k < L; k++) v[k] = t.a[base + k * stride];
    const u = unwrapArr(v, tol); for (let k = 0; k < L; k++) out[base + k * stride] = u[k];
  }
  return tensor('double', dims, out);
}

// ------------------------------------------------------------ builtins (some only when base/linalg lack them)
const own = {
  filtfilt: filtfiltImpl,
  sosfilt: sosfiltImpl,
  fftfilt: fftfiltImpl,
  resample: resampleImpl,
  upfirdn: upfirdnImpl,
  decimate: decimateImpl,
  interp: interpImpl,
  upsample: upsampleImpl,
  downsample: downsampleImpl,
  medfilt1: medfilt1Impl,
  sgolay(args) { const { B, G } = sgolayCore(toNum(args[0]), toNum(args[1])); return [fromRows(B), fromRows(G)]; },
  sgolayfilt: sgolayfiltImpl,
  hilbert: hilbertImpl,
  envelope: envelopeImpl,
  findpeaks: findpeaksImpl,
  cceps: ccepsImpl,
  icceps: icepsImpl,
  rceps: rcepsImpl,
  residuez: residuezImpl,
  chirp: chirpImpl,
  square(args) { const duty = optNum(args, 1, 50); return mapT(args[0], (t) => (mod2pi(t) < 2 * Math.PI * duty / 100 ? 1 : -1)); },
  sawtooth(args) {
    const w = optNum(args, 1, 1);
    return mapT(args[0], (t) => { const x = mod2pi(t) / (2 * Math.PI); if (x < w) return -1 + 2 * x / w; return w === 1 ? 1 : 1 - 2 * (x - w) / (1 - w); });
  },
  rectpuls(args) { const w = optNum(args, 1, 1); return mapT(args[0], (t) => rectp(t, w)); },
  tripuls(args) { const w = optNum(args, 1, 1), s = optNum(args, 2, 0); if (s < -1 || s > 1) throw E('tripuls:badSkew', 'The skew must be in [-1, 1].'); return mapT(args[0], (t) => trip(t, w, s)); },
  gauspuls: gauspulsImpl,
  pulstran: pulstranImpl,
  diric(args) { const n = toNum(args[1]); if (!Number.isInteger(n) || n < 1) throw E('diric:badN', 'N must be a positive integer.'); return mapT(args[0], (x) => diric(x, n)); },
  db2mag(args) { return mapT(args[0], (y) => 10 ** (y / 20)); },
  mag2db(args) { return mapT(args[0], (y) => (y < 0 ? NaN : 20 * Math.log10(y))); },
  pow2db(args) { return mapT(args[0], (y) => (y < 0 ? NaN : 10 * Math.log10(y))); },
  db2pow(args) { return mapT(args[0], (y) => 10 ** (y / 10)); },
};
/** Builtins that the base or linear-algebra areas may own; registered here only when they do not. */
export const shared = {
  filter: filterImpl,
  filter2: filter2Impl,
  conv2(args) { return conv2Impl(args); },
  convn: convnImpl,
  sinc(args) { return mapT(args[0], sincf); },
  unwrap: unwrapImpl,
};
export const builtins = own;

export const help = {
  filter: H('1-D digital filter (direct form II transposed) with initial and final conditions.', '1차원 디지털 필터 (직접형 II 전치), 초기/최종 조건.', ['y = filter(b, a, x)', '[y, zf] = filter(b, a, x, zi)', 'y = filter(b, a, x, zi, dim)']),
  filter2: H('2-D digital FIR filter (correlation with h).', '2차원 디지털 FIR 필터 (h 와의 상관).', ["Y = filter2(h, X)", "Y = filter2(h, X, shape)"]),
  conv2: H("2-D convolution ('full', 'same', 'valid').", "2차원 합성곱 ('full', 'same', 'valid').", ['C = conv2(A, B)', 'C = conv2(u, v, A)', 'C = conv2(___, shape)']),
  convn: H('N-D convolution.', 'N차원 합성곱.', ['C = convn(A, B)', 'C = convn(A, B, shape)']),
  sinc: H('Normalized sinc function sin(pi x)/(pi x).', '정규화 sinc 함수 sin(pi x)/(pi x).', ['y = sinc(x)']),
  unwrap: H('Unwraps radian phase angles (removes 2*pi jumps).', '라디안 위상을 펼침 (2*pi 점프 제거).', ['Q = unwrap(P)', 'Q = unwrap(P, tol)', 'Q = unwrap(P, tol, dim)']),
  filtfilt: H('Zero-phase forward and reverse digital filtering.', '영위상 정방향·역방향 디지털 필터링.', ['y = filtfilt(b, a, x)', 'y = filtfilt(sos, g, x)', 'y = filtfilt(d, x)']),
  sosfilt: H('Second-order (biquad) section cascade filtering.', '2차 섹션(바이쿼드) 직렬 필터링.', ['y = sosfilt(sos, x)']),
  fftfilt: H('FFT-based FIR filtering (overlap-add).', 'FFT 기반 FIR 필터링 (overlap-add).', ['y = fftfilt(b, x)', 'y = fftfilt(b, x, n)']),
  resample: H('Resamples by the rational factor p/q with an anti-aliasing Kaiser FIR filter.', '앤티에일리어싱 Kaiser FIR 필터로 p/q 배 재표본화.', ['y = resample(x, p, q)', 'y = resample(x, p, q, n, beta)', 'y = resample(x, p, q, b)', '[y, b] = resample(___)']),
  upfirdn: H('Upsample, apply an FIR filter and downsample.', '업샘플, FIR 필터 적용, 다운샘플.', ['y = upfirdn(x, h)', 'y = upfirdn(x, h, p, q)']),
  decimate: H('Decimation after lowpass filtering (Chebyshev IIR default, or FIR).', '저역통과 필터 후 데시메이션 (기본 체비셰프 IIR, 또는 FIR).', ['y = decimate(x, r)', 'y = decimate(x, r, n)', "y = decimate(x, r, 'fir')"]),
  interp: H('Interpolation by an integer factor (lowpass interpolation keeping the original samples).', '정수 배 보간 (원래 샘플을 유지하는 저역통과 보간).', ['y = interp(x, r)', 'y = interp(x, r, l, alpha)']),
  upsample: H('Inserts n-1 zeros between samples.', '샘플 사이에 0을 n-1 개 삽입.', ['y = upsample(x, n)', 'y = upsample(x, n, phase)']),
  downsample: H('Keeps every n-th sample.', 'n 번째 샘플마다 유지.', ['y = downsample(x, n)', 'y = downsample(x, n, phase)']),
  medfilt1: H('1-D median filter of order n (default 3).', '차수 n 의 1차원 중앙값 필터 (기본 3).', ['y = medfilt1(x)', 'y = medfilt1(x, n)', "y = medfilt1(___, 'truncate')"]),
  sgolay: H('Savitzky-Golay filter design: projection matrix B and differentiation matrix G.', 'Savitzky-Golay 필터 설계: 투영 행렬 B, 미분 행렬 G.', ['b = sgolay(order, framelen)', '[b, g] = sgolay(order, framelen)']),
  sgolayfilt: H('Savitzky-Golay smoothing filter.', 'Savitzky-Golay 평활 필터.', ['y = sgolayfilt(x, order, framelen)']),
  hilbert: H('Discrete-time analytic signal via the Hilbert transform.', '힐베르트 변환으로 구한 이산 해석 신호.', ['x = hilbert(xr)', 'x = hilbert(xr, n)']),
  envelope: H("Signal envelope (analytic, 'rms' or 'peak').", "신호 포락선 (해석 신호, 'rms', 'peak').", ['[up, lo] = envelope(x)', "[up, lo] = envelope(x, fl, 'rms')", "[up, lo] = envelope(x, np, 'peak')"]),
  findpeaks: H('Local maxima with height, prominence, width and distance filters.', '높이, 돌출도, 폭, 거리 조건이 있는 극댓값 찾기.', ['pks = findpeaks(y)', '[pks, locs, w, p] = findpeaks(y, x)', "[___] = findpeaks(___, 'MinPeakHeight', h, 'MinPeakDistance', d, 'MinPeakProminence', p, 'NPeaks', n, 'SortStr', 'descend')"]),
  cceps: H('Complex cepstrum.', '복소 켑스트럼.', ['xhat = cceps(x)', '[xhat, nd] = cceps(x, n)']),
  icceps: H('Inverse complex cepstrum.', '역 복소 켑스트럼.', ['x = icceps(xhat, nd)']),
  rceps: H('Real cepstrum and minimum-phase reconstruction.', '실수 켑스트럼과 최소 위상 재구성.', ['y = rceps(x)', '[y, ym] = rceps(x)']),
  residuez: H('Partial fraction expansion in z^-1 (and its inverse).', 'z^-1 의 부분분수 전개 (및 역변환).', ['[r, p, k] = residuez(b, a)', '[b, a] = residuez(r, p, k)']),
  chirp: H("Swept-frequency cosine ('linear', 'quadratic', 'logarithmic').", "주파수 소인 코사인 ('linear', 'quadratic', 'logarithmic').", ['y = chirp(t, f0, t1, f1)', 'y = chirp(t, f0, t1, f1, method, phi)']),
  square: H('Square wave of period 2*pi with duty cycle in percent.', '주기 2*pi, 듀티비(%) 의 사각파.', ['x = square(t)', 'x = square(t, duty)']),
  sawtooth: H('Sawtooth or triangle wave of period 2*pi.', '주기 2*pi 의 톱니파 또는 삼각파.', ['x = sawtooth(t)', 'x = sawtooth(t, width)']),
  rectpuls: H('Sampled aperiodic rectangular pulse.', '비주기 사각 펄스.', ['y = rectpuls(t)', 'y = rectpuls(t, w)']),
  tripuls: H('Sampled aperiodic triangular pulse.', '비주기 삼각 펄스.', ['y = tripuls(t)', 'y = tripuls(t, w, s)']),
  gauspuls: H('Gaussian-modulated sinusoidal RF pulse.', '가우스 변조 정현파 RF 펄스.', ['yi = gauspuls(t, fc, bw)', '[yi, yq, ye] = gauspuls(___)', "tc = gauspuls('cutoff', fc, bw, bwr, tpe)"]),
  pulstran: H('Pulse train from a pulse function or sampled prototype.', '펄스 함수나 표본 원형으로 만든 펄스열.', ['y = pulstran(t, d, func)', 'y = pulstran(t, d, func, p1, p2, ...)', 'y = pulstran(t, d, p, fs)']),
  diric: H('Dirichlet (periodic sinc) function.', '디리클레 (주기 sinc) 함수.', ['y = diric(x, n)']),
  db2mag: H('Decibels to magnitude: 10^(ydb/20).', '데시벨을 크기로: 10^(ydb/20).', ['y = db2mag(ydb)']),
  mag2db: H('Magnitude to decibels: 20*log10(y).', '크기를 데시벨로: 20*log10(y).', ['ydb = mag2db(y)']),
  pow2db: H('Power to decibels: 10*log10(y).', '전력을 데시벨로: 10*log10(y).', ['ydb = pow2db(y)']),
  db2pow: H('Decibels to power: 10^(ydb/10).', '데시벨을 전력으로: 10^(ydb/10).', ['y = db2pow(ydb)']),
};
void kqr; void kroots; void kpoly; void cvout; void cabs;
