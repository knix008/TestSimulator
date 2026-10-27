// FFT kernels: mixed-radix Stockham autosort (radix 4, 2, 3 and generic small
// primes) with exact twiddle tables, Bluestein chirp-z for lengths with large
// prime factors, and a half-length packing fast path for real input.
// Also: a helper that applies a line operation along one dimension of an N-D
// array. Pure ESM.

const BLUESTEIN_PRIME = 61; // prime factors above this use Bluestein
const planCache = new Map();
const MAX_PLANS = 64;

function factorize(n) {
  const f = [];
  while (n % 4 === 0) { f.push(4); n /= 4; }
  while (n % 2 === 0) { f.push(2); n /= 2; }
  for (let p = 3; p * p <= n; p += 2) while (n % p === 0) { f.push(p); n /= p; }
  if (n > 1) f.push(n);
  return f;
}

function twiddles(n) {
  const c = new Float64Array(n), s = new Float64Array(n);
  // exact per index; use symmetry to keep angles small (accuracy)
  for (let k = 0; k < n; k++) {
    // angle 2*pi*k/n, reduced to [-pi, pi]
    let kk = k; if (2 * kk > n) kk -= n;
    const t = (2 * Math.PI * kk) / n;
    c[k] = Math.cos(t); s[k] = -Math.sin(t); // forward: exp(-i t)
  }
  return { c, s };
}

function getPlan(n) {
  let p = planCache.get(n);
  if (p) return p;
  const factors = factorize(n);
  const maxF = factors.length ? Math.max(...factors) : 1;
  if (maxF > BLUESTEIN_PRIME) {
    let M = 1; while (M < 2 * n - 1) M *= 2;
    const wr = new Float64Array(n), wi = new Float64Array(n);
    let e = 0; const twoN = 2 * n;
    for (let k = 0; k < n; k++) {
      // e = k^2 mod 2n
      let ee = e; if (ee > n) ee -= twoN;
      const t = (Math.PI * ee) / n;
      wr[k] = Math.cos(t); wi[k] = -Math.sin(t);
      e = (e + 2 * k + 1) % twoN;
    }
    const br = new Float64Array(M), bi = new Float64Array(M);
    br[0] = wr[0]; bi[0] = -wi[0];
    for (let k = 1; k < n; k++) { br[k] = br[M - k] = wr[k]; bi[k] = bi[M - k] = -wi[k]; }
    const sub = getPlan(M);
    fftPlan(sub, br, bi);
    p = { n, blue: true, M, wr, wi, br, bi, sub, sr: new Float64Array(M), si: new Float64Array(M) };
  } else {
    const tw = twiddles(n);
    p = { n, blue: false, factors, c: tw.c, s: tw.s, tr: new Float64Array(n), ti: new Float64Array(n) };
  }
  if (planCache.size >= MAX_PLANS) planCache.delete(planCache.keys().next().value);
  planCache.set(n, p);
  return p;
}

function stockham(p, xr, xi) {
  const N = p.n, C = p.c, S = p.s;
  let n = N, s = 1;
  let ar = xr, ai = xi, br = p.tr, bi = p.ti;
  const S3 = Math.sqrt(3) / 2;
  for (const r of p.factors) {
    const m = n / r;
    if (r === 4) {
      for (let q0 = 0; q0 < m; q0++) {
        const t1 = q0 * s, t2 = 2 * t1, t3 = 3 * t1;
        const c1 = C[t1], s1 = S[t1], c2 = C[t2], s2 = S[t2], c3 = C[t3], s3 = S[t3];
        const i0 = s * q0, i1 = s * (q0 + m), i2 = s * (q0 + 2 * m), i3 = s * (q0 + 3 * m);
        const o0 = s * (4 * q0), o1 = o0 + s, o2 = o1 + s, o3 = o2 + s;
        for (let q = 0; q < s; q++) {
          const a0r = ar[i0 + q], a0i = ai[i0 + q], a1r = ar[i1 + q], a1i = ai[i1 + q];
          const a2r = ar[i2 + q], a2i = ai[i2 + q], a3r = ar[i3 + q], a3i = ai[i3 + q];
          const pr = a0r + a2r, pi = a0i + a2i, mr = a0r - a2r, mi = a0i - a2i;
          const qr = a1r + a3r, qi = a1i + a3i, dr = a1r - a3r, di = a1i - a3i;
          br[o0 + q] = pr + qr; bi[o0 + q] = pi + qi;
          // b1 = m - i d
          let yr = mr + di, yi = mi - dr;
          br[o1 + q] = yr * c1 - yi * s1; bi[o1 + q] = yr * s1 + yi * c1;
          yr = pr - qr; yi = pi - qi;
          br[o2 + q] = yr * c2 - yi * s2; bi[o2 + q] = yr * s2 + yi * c2;
          yr = mr - di; yi = mi + dr;
          br[o3 + q] = yr * c3 - yi * s3; bi[o3 + q] = yr * s3 + yi * c3;
        }
      }
    } else if (r === 2) {
      for (let q0 = 0; q0 < m; q0++) {
        const t1 = q0 * s, c1 = C[t1], s1 = S[t1];
        const i0 = s * q0, i1 = s * (q0 + m), o0 = s * 2 * q0, o1 = o0 + s;
        for (let q = 0; q < s; q++) {
          const a0r = ar[i0 + q], a0i = ai[i0 + q], a1r = ar[i1 + q], a1i = ai[i1 + q];
          br[o0 + q] = a0r + a1r; bi[o0 + q] = a0i + a1i;
          const yr = a0r - a1r, yi = a0i - a1i;
          br[o1 + q] = yr * c1 - yi * s1; bi[o1 + q] = yr * s1 + yi * c1;
        }
      }
    } else if (r === 3) {
      for (let q0 = 0; q0 < m; q0++) {
        const t1 = q0 * s, t2 = 2 * t1;
        const c1 = C[t1], s1 = S[t1], c2 = C[t2], s2 = S[t2];
        const i0 = s * q0, i1 = s * (q0 + m), i2 = s * (q0 + 2 * m);
        const o0 = s * 3 * q0, o1 = o0 + s, o2 = o1 + s;
        for (let q = 0; q < s; q++) {
          const a0r = ar[i0 + q], a0i = ai[i0 + q], a1r = ar[i1 + q], a1i = ai[i1 + q], a2r = ar[i2 + q], a2i = ai[i2 + q];
          const sr = a1r + a2r, si = a1i + a2i;
          const tr = a0r - 0.5 * sr, ti = a0i - 0.5 * si;
          const ur = S3 * (a1r - a2r), ui = S3 * (a1i - a2i);
          br[o0 + q] = a0r + sr; bi[o0 + q] = a0i + si;
          let yr = tr + ui, yi = ti - ur;
          br[o1 + q] = yr * c1 - yi * s1; bi[o1 + q] = yr * s1 + yi * c1;
          yr = tr - ui; yi = ti + ur;
          br[o2 + q] = yr * c2 - yi * s2; bi[o2 + q] = yr * s2 + yi * c2;
        }
      }
    } else {
      // generic radix r: W_r^{jk} = W_N^{(jk mod r) * N/r}
      const step = N / r;
      const xr = new Float64Array(r), xi = new Float64Array(r);
      for (let q0 = 0; q0 < m; q0++) {
        for (let q = 0; q < s; q++) {
          for (let k = 0; k < r; k++) { const ii = q + s * (q0 + k * m); xr[k] = ar[ii]; xi[k] = ai[ii]; }
          for (let j = 0; j < r; j++) {
            let sr = 0, si = 0;
            for (let k = 0; k < r; k++) {
              const t = ((j * k) % r) * step;
              const wc = C[t], ws = S[t];
              sr += xr[k] * wc - xi[k] * ws; si += xr[k] * ws + xi[k] * wc;
            }
            const t = j * q0 * s, wc = C[t], ws = S[t];
            const o = q + s * (r * q0 + j);
            br[o] = sr * wc - si * ws; bi[o] = sr * ws + si * wc;
          }
        }
      }
    }
    let t = ar; ar = br; br = t; t = ai; ai = bi; bi = t;
    n = m; s *= r;
  }
  if (ar !== xr) { xr.set(ar); xi.set(ai); }
}

function fftPlan(p, xr, xi) {
  if (p.n <= 1) return;
  if (!p.blue) { stockham(p, xr, xi); return; }
  const { n, M, wr, wi, br, bi, sub, sr, si } = p;
  sr.fill(0); si.fill(0);
  for (let k = 0; k < n; k++) { sr[k] = xr[k] * wr[k] - xi[k] * wi[k]; si[k] = xr[k] * wi[k] + xi[k] * wr[k]; }
  fftPlan(sub, sr, si);
  // multiply by B, then inverse FFT via conjugation
  for (let k = 0; k < M; k++) {
    const a = sr[k], b = si[k];
    sr[k] = a * br[k] - b * bi[k];
    si[k] = -(a * bi[k] + b * br[k]);
  }
  fftPlan(sub, sr, si);
  const inv = 1 / M;
  for (let k = 0; k < n; k++) {
    const cr = sr[k] * inv, ci = -si[k] * inv;
    xr[k] = cr * wr[k] - ci * wi[k]; xi[k] = cr * wi[k] + ci * wr[k];
  }
}

/** In-place unnormalized complex DFT of length re.length (inverse: positive exponent). */
export function fftInPlace(re, im, inverse = false) {
  const n = re.length;
  if (n <= 1) return;
  const p = getPlan(n);
  if (inverse) { for (let k = 0; k < n; k++) im[k] = -im[k]; }
  fftPlan(p, re, im);
  if (inverse) { for (let k = 0; k < n; k++) im[k] = -im[k]; }
}

const realTw = new Map();
/** Full DFT of a real vector x (length n) into outRe/outIm (length n). */
export function fftRealInto(x, outRe, outIm) {
  const n = x.length;
  if (n < 4 || n % 2) {
    outRe.set(x); outIm.fill(0); fftInPlace(outRe, outIm); return;
  }
  const h = n / 2;
  const zr = new Float64Array(h), zi = new Float64Array(h);
  for (let k = 0; k < h; k++) { zr[k] = x[2 * k]; zi[k] = x[2 * k + 1]; }
  fftInPlace(zr, zi);
  let tw = realTw.get(n);
  if (!tw) {
    tw = { c: new Float64Array(h + 1), s: new Float64Array(h + 1) };
    for (let k = 0; k <= h; k++) { let kk = k; if (2 * kk > n) kk -= n; const t = (2 * Math.PI * kk) / n; tw.c[k] = Math.cos(t); tw.s[k] = -Math.sin(t); }
    if (realTw.size > 32) realTw.delete(realTw.keys().next().value);
    realTw.set(n, tw);
  }
  for (let k = 0; k <= h; k++) {
    const k1 = k % h, k2 = (h - k) % h;
    const ar = zr[k1], ai = zi[k1], br = zr[k2], bi = -zi[k2]; // b = conj(Z[h-k])
    const er = 0.5 * (ar + br), ei = 0.5 * (ai + bi); // even part
    // odd part: (a - b)/(2i) = (ai-bi)/2 - i (ar-br)/2
    const or = 0.5 * (ai - bi), oi = -0.5 * (ar - br);
    const c = tw.c[k], s = tw.s[k];
    outRe[k] = er + (or * c - oi * s);
    outIm[k] = ei + (or * s + oi * c);
  }
  for (let k = h + 1; k < n; k++) { outRe[k] = outRe[n - k]; outIm[k] = -outIm[n - k]; }
}

/**
 * Applies fn to every line of an N-D array along dimension dim (0-based).
 * dims: input dims; re/im: data (im may be null). outLen: length of output lines.
 * fn(lineRe, lineIm|null, outRe, outIm) must fill outRe/outIm (outIm is always allocated).
 * Returns {dims, re, im}.
 */
export function alongDim(dims, re, im, dim, outLen, fn) {
  const d = dims.slice();
  while (d.length <= dim) d.push(1);
  const len = d[dim];
  let stride = 1; for (let i = 0; i < dim; i++) stride *= d[i];
  let outer = 1; for (let i = dim + 1; i < d.length; i++) outer *= d[i];
  const od = d.slice(); od[dim] = outLen;
  const total = stride * outLen * outer;
  const ore = new Float64Array(total), oim = new Float64Array(total);
  const lr = new Float64Array(len), li = im ? new Float64Array(len) : null;
  const yr = new Float64Array(outLen), yi = new Float64Array(outLen);
  for (let o = 0; o < outer; o++) {
    for (let s = 0; s < stride; s++) {
      const base = o * len * stride + s;
      for (let k = 0; k < len; k++) { lr[k] = re[base + k * stride]; if (li) li[k] = im[base + k * stride]; }
      yr.fill(0); yi.fill(0);
      fn(lr, li, yr, yi);
      const ob = o * outLen * stride + s;
      for (let k = 0; k < outLen; k++) { ore[ob + k * stride] = yr[k]; oim[ob + k * stride] = yi[k]; }
    }
  }
  return { dims: od, re: ore, im: oim };
}
