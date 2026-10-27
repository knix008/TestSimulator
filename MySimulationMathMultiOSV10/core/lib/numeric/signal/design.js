// Filter design: IIR (butter cheby1 cheby2 ellip besself + order estimation),
// FIR (fir1 fir2 firls firpm kaiserord), bilinear, impinvar and the
// second-order-section conversions (tf2sos sos2tf zp2sos sos2zp).
import { E, H, F, M, row, col, num, str, cplx, toNum, isText, toStr, n1, fromRows, toRows, V, EPS } from '../_util.js';
import { solve as ksolve, eye as keye, mul as kmul, add as kadd, scale as kscale, conv as kconv } from '../_kernels.js';
import {
  cadd, csub, cmul, cdiv, cabs, cneg, conj, csqrt, cexp, cprod, rootsC, polyR, polyCx, cleanRoots,
  lp2lp, lp2hp, lp2bp, lp2bs, bilinearZpk, zpk2tf, tf2ssLocal, sincf, freqzEval, lowerText,
} from './_dsp.js';
import { hammingW, kaiserW } from './windows.js';

// ------------------------------------------------------------ elliptic helpers
function agm(a, b) { for (let i = 0; i < 60 && Math.abs(a - b) > 1e-16 * a; i++) { const t = (a + b) / 2; b = Math.sqrt(a * b); a = t; } return a; }
export const ellipk = (m) => (m >= 1 ? Infinity : Math.PI / (2 * agm(1, Math.sqrt(1 - m))));
export const ellipkm1 = (p) => (p <= 0 ? Infinity : Math.PI / (2 * agm(1, Math.sqrt(p))));
function carlsonRF(x, y, z) {
  for (let i = 0; i < 200; i++) {
    const A = (x + y + z) / 3; const dx = 1 - x / A, dy = 1 - y / A, dz = 1 - z / A;
    if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) < 1e-4) {
      const E2 = dx * dy - dz * dz, E3 = dx * dy * dz;
      return (1 - E2 / 10 + E3 / 14 + E2 * E2 / 24 - 3 * E2 * E3 / 44) / Math.sqrt(A);
    }
    const l = Math.sqrt(x * y) + Math.sqrt(y * z) + Math.sqrt(z * x);
    x = (x + l) / 4; y = (y + l) / 4; z = (z + l) / 4;
  }
  return 1 / Math.sqrt(x);
}
/** Incomplete elliptic integral of the first kind F(phi | m). */
export const ellipF = (phi, m) => { const s = Math.sin(phi), c = Math.cos(phi); return s * carlsonRF(c * c, 1 - m * s * s, 1); };
/** Jacobi elliptic functions sn, cn, dn (descending Landen / AGM). */
export function ellipj(u, m) {
  if (m < 1e-9) { const t = Math.sin(u), b = Math.cos(u), ai = 0.25 * m * (u - t * b); return { sn: t - ai * b, cn: b + ai * t, dn: 1 - 0.5 * m * t * t }; }
  if (m >= 0.9999999999) {
    let ai = 0.25 * (1 - m); const b = Math.cosh(u), t = Math.tanh(u), phi = 1 / b, twon = b * Math.sinh(u);
    const sn = t + ai * (twon - u) / (b * b); ai *= t * phi;
    return { sn, cn: phi - ai * (twon - u), dn: phi + ai * (twon + u) };
  }
  const a = [1], c = [Math.sqrt(m)]; let b = Math.sqrt(1 - m), twon = 1, i = 0;
  while (Math.abs(c[i] / a[i]) > 1e-16 && i < 12) { const ai = a[i]; i++; c[i] = (ai - b) / 2; const t = Math.sqrt(ai * b); a[i] = (ai + b) / 2; b = t; twon *= 2; }
  let phi = twon * a[i] * u, bb = 0;
  do { const t = c[i] * Math.sin(phi) / a[i]; bb = phi; phi = (Math.asin(t) + phi) / 2; } while (--i);
  const sn = Math.sin(phi), cn = Math.cos(phi);
  return { sn, cn, dn: cn / Math.cos(phi - bb) };
}
function ellipdeg(n, m1) {
  const K1 = ellipk(m1), K1p = ellipkm1(m1); const q1 = Math.exp(-Math.PI * K1p / K1); const q = q1 ** (1 / n);
  let numr = 0, den = 0; for (let k = 0; k <= 7; k++) numr += q ** (k * (k + 1)); for (let k = 1; k <= 8; k++) den += q ** (k * k);
  return 16 * q * (numr / (1 + 2 * den)) ** 4;
}

// ------------------------------------------------------------ analog prototypes (zpk)
export function buttap(n) { const p = []; for (let m = -n + 1; m < n; m += 2) p.push(cneg(cexp([0, Math.PI * m / (2 * n)]))); return { z: [], p: cleanRoots(p), k: 1 }; }
export function cheb1ap(n, rp) {
  const ep = Math.sqrt(10 ** (0.1 * rp) - 1); const mu = Math.asinh(1 / ep) / n; const p = [];
  for (let m = -n + 1; m < n; m += 2) { const th = Math.PI * m / (2 * n); p.push([-Math.sinh(mu) * Math.cos(th), -Math.cosh(mu) * Math.sin(th)]); }
  let k = cprod(p.map(cneg))[0]; if (n % 2 === 0) k /= Math.sqrt(1 + ep * ep);
  return { z: [], p: cleanRoots(p), k };
}
export function cheb2ap(n, rs) {
  const de = 1 / Math.sqrt(10 ** (0.1 * rs) - 1); const mu = Math.asinh(1 / de) / n;
  const ms = []; if (n % 2) { for (let m = -n + 1; m < 0; m += 2) ms.push(m); for (let m = 2; m < n; m += 2) ms.push(m); } else for (let m = -n + 1; m < n; m += 2) ms.push(m);
  const z = ms.map((m) => [0, 1 / Math.sin(m * Math.PI / (2 * n))]);
  const p = [];
  for (let m = -n + 1; m < n; m += 2) { const e = cneg(cexp([0, Math.PI * m / (2 * n)])); p.push(cdiv([1, 0], [Math.sinh(mu) * e[0], Math.cosh(mu) * e[1]])); }
  const k = cdiv(cprod(p.map(cneg)), cprod(z.map(cneg)))[0];
  return { z, p: cleanRoots(p), k };
}
export function ellipap(n, rp, rs) {
  if (n === 1) { const p = -Math.sqrt(1 / (10 ** (0.1 * rp) - 1)); return { z: [], p: [[p, 0]], k: -p }; }
  const epsSq = 10 ** (0.1 * rp) - 1, ep = Math.sqrt(epsSq); const ck1 = epsSq / (10 ** (0.1 * rs) - 1);
  const K0 = ellipk(ck1); const m = ellipdeg(n, ck1); const capk = ellipk(m);
  const js = []; for (let j = 1 - (n % 2); j < n; j += 2) js.push(j);
  const sj = js.map((j) => ellipj(j * capk / n, m));
  const z = []; for (const e of sj) if (Math.abs(e.sn) > EPS) z.push([0, 1 / (Math.sqrt(m) * e.sn)]);
  const zz = [...z, ...z.map(conj)];
  const r = ellipF(Math.atan(1 / ep), 1 - ck1);
  const v0 = capk * r / (n * K0); const v = ellipj(v0, 1 - m);
  let p = sj.map((e) => { const den = 1 - (e.dn * v.sn) ** 2; return [-(e.cn * e.dn * v.sn * v.cn) / den, -(e.sn * v.dn) / den]; });
  if (n % 2) { const nrm = Math.sqrt(p.reduce((s, x) => s + x[0] * x[0] + x[1] * x[1], 0)); const np = p.filter((x) => Math.abs(x[1]) > EPS * nrm); p = [...p.map((x) => (Math.abs(x[1]) > EPS * nrm ? x : [x[0], 0])), ...np.map(conj)]; }
  else p = [...p, ...p.map(conj)];
  let k = cdiv(cprod(p.map(cneg)), cprod(zz.map(cneg)))[0]; if (n % 2 === 0) k /= Math.sqrt(1 + epsSq);
  return { z: zz, p, k };
}
export function besselap(n) {
  if (n === 0) return { z: [], p: [], k: 1 };
  // reverse Bessel polynomial, a_k = (2n-k)! / (2^(n-k) k! (n-k)!), descending powers
  const lf = (x) => { let s = 0; for (let i = 2; i <= x; i++) s += Math.log(i); return s; };
  const a = []; for (let k = n; k >= 0; k--) a.push(Math.exp(lf(2 * n - k) - (n - k) * Math.log(2) - lf(k) - lf(n - k)));
  const a0 = a[a.length - 1]; const sc = a0 ** (1 / n);
  const p = cleanRoots(rootsC(a).map((x) => [x[0] / sc, x[1] / sc]), 1e-10);
  return { z: [], p, k: cprod(p.map(cneg))[0] };
}

// ------------------------------------------------------------ IIR design driver
const BTYPES = { low: 'low', lowpass: 'low', high: 'high', highpass: 'high', bandpass: 'bandpass', pass: 'bandpass', stop: 'stop', bandstop: 'stop' };
function parseIIR(args, name, nPar) {
  if (args.length < 2 + nPar) throw E(`${name}:args`, `Not enough input arguments for ${name}.`);
  const n = toNum(args[0], 'Filter order');
  if (!Number.isInteger(n) || n < 1) throw E(`${name}:badOrder`, 'Filter order must be a positive integer.');
  const par = []; for (let i = 0; i < nPar; i++) par.push(toNum(args[1 + i], 'Ripple'));
  const Wn = Array.from(F(args[1 + nPar]));
  let analog = false, type = Wn.length === 2 ? 'bandpass' : 'low';
  for (const a of args.slice(2 + nPar)) {
    const s = lowerText(a); if (s == null) throw E(`${name}:badArg`, 'Expected a filter type or \'s\'.');
    if (s === 's') analog = true; else if (s === 'z') analog = false; else if (BTYPES[s]) type = BTYPES[s]; else throw E(`${name}:badType`, `Unknown filter type '${s}'.`);
  }
  if (!analog && Wn.some((w) => !(w > 0 && w < 1))) throw E(`${name}:badWn`, 'Cutoff frequencies must be in the interval (0,1).');
  if (analog && Wn.some((w) => !(w > 0))) throw E(`${name}:badWn`, 'Analog cutoff frequencies must be positive.');
  if ((type === 'bandpass' || type === 'stop') && Wn.length !== 2) throw E(`${name}:badWn`, 'Band filters need a two-element frequency vector.');
  if ((type === 'low' || type === 'high') && Wn.length !== 1) throw E(`${name}:badWn`, 'Low/high-pass filters need a scalar frequency.');
  return { n, par, Wn, analog, type };
}
export function designZpk(proto, Wn, type, analog) {
  const u = analog ? Wn : Wn.map((w) => 4 * Math.tan(Math.PI * w / 2));
  let f;
  if (type === 'low') f = lp2lp(proto, u[0]);
  else if (type === 'high') f = lp2hp(proto, u[0]);
  else if (type === 'bandpass') f = lp2bp(proto, Math.sqrt(u[0] * u[1]), u[1] - u[0]);
  else f = lp2bs(proto, Math.sqrt(u[0] * u[1]), u[1] - u[0]);
  if (!analog) f = bilinearZpk(f, 2);
  return { z: cleanRoots(f.z, 1e-10), p: cleanRoots(f.p, 1e-12), k: f.k };
}
const cpxCol = (list) => cplx([list.length, list.length ? 1 : 0], list.map((x) => x[0]), list.map((x) => x[1]));
export function designOut(f, nargout) {
  if (nargout === 3) return [cpxCol(f.z), cpxCol(f.p), num(f.k)];
  const { b, a } = zpk2tf(f);
  if (nargout >= 4) { const s = tf2ssLocal(b, a); return [mat(s.A), mat(s.B), mat(s.C), mat(s.D)]; }
  return [row(b), row(a)];
}
const mat = (rows) => (rows.length && rows[0].length ? fromRows(rows) : V(rows.length, rows.length ? rows[0].length : 0, []));
function iir(protoFn, name, nPar) {
  return (args, nargout) => {
    const o = parseIIR(args, name, nPar);
    return designOut(designZpk(protoFn(o.n, ...o.par), o.Wn, o.type, o.analog), nargout);
  };
}

// ------------------------------------------------------------ order estimation
function ordPrep(args, name) {
  if (args.length < 4) throw E(`${name}:args`, `${name} needs Wp, Ws, Rp and Rs.`);
  const Wp = Array.from(F(args[0])), Ws = Array.from(F(args[1])); const Rp = Math.abs(toNum(args[2])), Rs = Math.abs(toNum(args[3]));
  const analog = args.length > 4 && lowerText(args[4]) === 's';
  if (Wp.length !== Ws.length) throw E(`${name}:badBands`, 'Wp and Ws must have the same length.');
  let ftype = Wp.length === 1 ? (Wp[0] < Ws[0] ? 1 : 2) : (Wp[0] < Ws[0] ? 3 : 4);
  const warp = (w) => (analog ? w : Math.tan(Math.PI * w / 2));
  const WP = Wp.map(warp), WS = Ws.map(warp);
  let WA;
  if (ftype === 1) WA = WS[0] / WP[0];
  else if (ftype === 2) WA = WP[0] / WS[0];
  else if (ftype === 3) WA = Math.min(...WS.map((s) => Math.abs(s * (WP[0] - WP[1]) / (s * s - WP[0] * WP[1]))));
  else WA = Math.min(...WS.map((s) => Math.abs((s * s - WP[0] * WP[1]) / (s * (WP[0] - WP[1])))));
  return { Wp, Ws, Rp, Rs, analog, ftype, WP, WS, WA, unwarp: (w) => (analog ? w : 2 / Math.PI * Math.atan(w)) };
}
const outWn = (a) => (a.length === 1 ? num(a[0]) : row(a));
const builtinsOrd = {
  buttord(args) {
    const o = ordPrep(args, 'buttord');
    const order = Math.ceil(Math.log10((10 ** (0.1 * o.Rs) - 1) / (10 ** (0.1 * o.Rp) - 1)) / (2 * Math.log10(o.WA)));
    const W0 = o.WA / ((10 ** (0.1 * o.Rs) - 1) ** (1 / (2 * order)));
    let WN; const WP = o.WP;
    if (o.ftype === 1) WN = [W0 * WP[0]];
    else if (o.ftype === 2) WN = [WP[0] / W0];
    else if (o.ftype === 3) { const d = WP[1] - WP[0]; const s = Math.sqrt(d * d + 4 * W0 * W0 * WP[0] * WP[1]); WN = [Math.abs((d + s) / (2 * W0)), Math.abs((d - s) / (2 * W0))].sort((x, y) => x - y); }
    else { const d = WP[1] - WP[0]; WN = [-W0, W0].map((w) => Math.abs(-w * d / 2 + Math.sqrt(w * w / 4 * d * d + WP[0] * WP[1]))).sort((x, y) => x - y); }
    return [num(order), outWn(WN.map(o.unwarp))];
  },
  cheb1ord(args) {
    const o = ordPrep(args, 'cheb1ord');
    const order = Math.ceil(Math.acosh(Math.sqrt((10 ** (0.1 * o.Rs) - 1) / (10 ** (0.1 * o.Rp) - 1))) / Math.acosh(o.WA));
    return [num(order), outWn(o.Wp)];
  },
  cheb2ord(args) {
    const o = ordPrep(args, 'cheb2ord');
    const G = Math.sqrt((10 ** (0.1 * o.Rs) - 1) / (10 ** (0.1 * o.Rp) - 1));
    const order = Math.ceil(Math.acosh(G) / Math.acosh(o.WA));
    const nf = 1 / Math.cosh(Math.acosh(G) / order); const p = o.WP; let nat;
    if (o.ftype === 1) nat = [p[0] / nf];
    else if (o.ftype === 2) nat = [p[0] * nf];
    else if (o.ftype === 3) { const a0 = nf / 2 * (p[0] - p[1]) + Math.sqrt(nf * nf * (p[1] - p[0]) ** 2 / 4 + p[1] * p[0]); nat = [a0, p[0] * p[1] / a0].sort((x, y) => x - y); }
    else { const a0 = 1 / (2 * nf) * (p[0] - p[1]) + Math.sqrt((p[1] - p[0]) ** 2 / (4 * nf * nf) + p[1] * p[0]); nat = [a0, p[0] * p[1] / a0].sort((x, y) => x - y); }
    return [num(order), outWn(nat.map(o.unwarp))];
  },
  ellipord(args) {
    const o = ordPrep(args, 'ellipord');
    const a1 = Math.sqrt((10 ** (0.1 * o.Rp) - 1) / (10 ** (0.1 * o.Rs) - 1)); const a0 = 1 / o.WA;
    const order = Math.ceil(ellipk(a0 * a0) * ellipkm1(a1 * a1) / (ellipkm1(a0 * a0) * ellipk(a1 * a1)));
    return [num(order), outWn(o.Wp)];
  },
};

// ------------------------------------------------------------ FIR design
function fir1Impl(args) {
  if (args.length < 2) throw E('fir1:args', 'Usage: b = fir1(n, Wn, ...).');
  let n = toNum(args[0], 'Filter order'); const Wn = Array.from(F(args[1]));
  if (!Number.isInteger(n) || n < 1) throw E('fir1:badOrder', 'Filter order must be a positive integer.');
  if (Wn.some((w) => !(w > 0 && w < 1))) throw E('fir1:badWn', 'Cutoff frequencies must be in the interval (0,1).');
  let type = null, win = null, scale = true;
  for (const a of args.slice(2)) {
    const s = lowerText(a);
    if (s == null) { win = Array.from(F(a)); continue; }
    if (s === 'scale') scale = true; else if (s === 'noscale') scale = false;
    else if (['low', 'high', 'bandpass', 'stop', 'bandstop', 'dc-0', 'dc-1'].includes(s)) type = s;
    else throw E('fir1:badType', `Unknown option '${s}'.`);
  }
  if (!type) type = Wn.length === 1 ? 'low' : Wn.length === 2 ? 'bandpass' : 'dc-0';
  let edges;
  if (type === 'low') edges = [0, Wn[0]];
  else if (type === 'high') edges = [Wn[0], 1];
  else if (type === 'bandpass') edges = [Wn[0], Wn[1]];
  else if (type === 'stop' || type === 'bandstop') edges = [0, Wn[0], Wn[1], 1];
  else if (type === 'dc-0') { edges = [...Wn]; if (edges.length % 2) edges.push(1); }
  else { edges = [0, ...Wn]; if (edges.length % 2) edges.push(1); }
  const nyqPass = edges[edges.length - 1] === 1;
  let warn = null;
  if (nyqPass && n % 2) { n += 1; warn = 'odd'; }
  const L = n + 1;
  if (win && win.length !== L) throw E('fir1:badWindow', `The window length must be n+1 = ${L}.`);
  const w = win || Array.from(hammingW(L));
  const b = new Float64Array(L);
  for (let i = 0; i < L; i++) {
    const m = i - n / 2; let h = 0;
    for (let k = 0; k < edges.length; k += 2) h += edges[k + 1] * sincf(edges[k + 1] * m) - edges[k] * sincf(edges[k] * m);
    b[i] = h * w[i];
  }
  if (scale) {
    let f0; if (edges[0] === 0) f0 = 0; else if (edges[1] === 1) f0 = 1; else f0 = (edges[0] + edges[1]) / 2;
    let re = 0, im = 0; for (let i = 0; i < L; i++) { re += b[i] * Math.cos(Math.PI * i * f0); im -= b[i] * Math.sin(Math.PI * i * f0); }
    const g = Math.hypot(re, im); for (let i = 0; i < L; i++) b[i] /= g;
  }
  return { b, warn };
}
function fir2Impl(args) {
  if (args.length < 3) throw E('fir2:args', 'Usage: b = fir2(n, f, m, ...).');
  let n = toNum(args[0]); const f = Array.from(F(args[1])), m = Array.from(F(args[2]));
  if (f.length !== m.length) throw E('fir2:badLength', 'f and m must have the same length.');
  if (f[0] !== 0 || f[f.length - 1] !== 1) throw E('fir2:badF', 'The frequency vector must start with 0 and end with 1.');
  let npt = null, lap = null, win = null; const nums = [];
  for (const a of args.slice(3)) { if (isText(a)) continue; nums.push(a); }
  if (nums.length && F(nums[nums.length - 1]).length > 1) win = Array.from(F(nums.pop()));
  if (nums.length) npt = toNum(nums[0]); if (nums.length > 1) lap = toNum(nums[1]);
  if (n % 2 && m[m.length - 1] !== 0) n += 1;
  const nn = n + 1;
  if (npt == null) npt = nn < 1024 ? 512 : 2 ** Math.ceil(Math.log2(nn));
  if (lap == null) lap = Math.trunc(npt / 25);
  const wind = win || Array.from(hammingW(nn));
  if (wind.length !== nn) throw E('fir2:badWindow', `The window length must be n+1 = ${nn}.`);
  const N = npt + 1; const Hm = new Float64Array(N); Hm[0] = m[0];
  let nb = 1;
  for (let i = 0; i < f.length - 1; i++) {
    let ne;
    if (f[i + 1] - f[i] === 0) { nb = Math.ceil(nb - lap / 2); ne = nb + lap; } else ne = Math.trunc(f[i + 1] * N);
    if (nb < 0 || ne > N) throw E('fir2:badGrid', 'Too abrupt an amplitude change near the ends of the grid.');
    for (let j = nb; j <= ne; j++) { const inc = nb === ne ? 0 : (j - nb) / (ne - nb); if (j >= 1) Hm[j - 1] = inc * m[i + 1] + (1 - inc) * m[i]; }
    nb = ne + 1;
  }
  const dt = 0.5 * (nn - 1); const L = 2 * N - 2; const re = new Float64Array(L), im = new Float64Array(L);
  for (let k = 0; k < N; k++) { const ph = -dt * Math.PI * k / (N - 1); re[k] = Hm[k] * Math.cos(ph); im[k] = Hm[k] * Math.sin(ph); }
  for (let k = 1; k < N - 1; k++) { re[L - k] = re[k]; im[L - k] = -im[k]; }
  const b = new Float64Array(nn);
  for (let t = 0; t < nn; t++) { let s = 0; for (let k = 0; k < L; k++) { const a = 2 * Math.PI * k * t / L; s += re[k] * Math.cos(a) - im[k] * Math.sin(a); } b[t] = s / L * wind[t]; }
  return b;
}
export function firlsCore(n, f, a, w) {
  const N = n + 1; const Fh = f.map((x) => x / 2); const L = (N - 1) / 2; const odd = N % 2 === 1;
  const nb = f.length / 2; const W = w || new Array(nb).fill(1);
  const ks = []; for (let i = 0; i <= Math.floor(L); i++) ks.push(odd ? i : i + 0.5);
  const bvec = ks.map((k) => {
    let s = 0;
    for (let b = 0; b < nb; b++) {
      const f1 = Fh[2 * b], f2 = Fh[2 * b + 1]; const wt = W[b];
      if (f2 === f1) continue;
      const mm = (a[2 * b + 1] - a[2 * b]) / (f2 - f1); const b1 = a[2 * b] - mm * f1;
      if (k === 0) s += wt * (b1 * (f2 - f1) + mm / 2 * (f2 * f2 - f1 * f1));
      else {
        s += wt * (mm / (4 * Math.PI * Math.PI) * (Math.cos(2 * Math.PI * k * f2) - Math.cos(2 * Math.PI * k * f1)) / (k * k));
        s += wt * (f2 * (mm * f2 + b1) * sincf(2 * k * f2) - f1 * (mm * f1 + b1) * sincf(2 * k * f1));
      }
    }
    return s;
  });
  let coef;
  const equalW = W.every((x) => x === W[0]);
  let fullBand = true; for (let b = 0; b < nb - 1; b++) if (Fh[2 * b + 1] !== Fh[2 * b + 2]) fullBand = false;
  if (equalW && fullBand && Fh[0] === 0 && Fh[Fh.length - 1] === 0.5) {
    coef = bvec.map((x) => (4 * x) / W[0]); if (odd) coef[0] /= 2;
  } else {
    const G = ks.map((ki) => ks.map((kj) => {
      let s = 0;
      for (let b = 0; b < nb; b++) {
        const f1 = Fh[2 * b], f2 = Fh[2 * b + 1];
        s += W[b] * (0.5 * f2 * (sincf(2 * (ki + kj) * f2) + sincf(2 * (ki - kj) * f2)) - 0.5 * f1 * (sincf(2 * (ki + kj) * f1) + sincf(2 * (ki - kj) * f1)));
      }
      return s;
    }));
    coef = ksolve(G, bvec);
  }
  const h = new Float64Array(N);
  if (odd) { const Li = Math.round(L); h[Li] = coef[0]; for (let i = 1; i <= Li; i++) { h[Li + i] = coef[i] / 2; h[Li - i] = coef[i] / 2; } }
  else { const half = N / 2; for (let i = 0; i < half; i++) { h[half + i] = coef[i] / 2; h[half - 1 - i] = coef[i] / 2; } }
  return h;
}
function bandArgs(args, name) {
  if (args.length < 3) throw E(`${name}:args`, `Usage: b = ${name}(n, f, a).`);
  const n = toNum(args[0], 'Filter order'); const f = Array.from(F(args[1])), a = Array.from(F(args[2]));
  if (!Number.isInteger(n) || n < 1) throw E(`${name}:badOrder`, 'Filter order must be a positive integer.');
  if (f.length % 2 || f.length !== a.length) throw E(`${name}:badBands`, 'f and a must have the same even length.');
  if (f.some((x, i) => x < 0 || x > 1 || (i && x < f[i - 1]))) throw E(`${name}:badBands`, 'Band edges must be increasing values in [0, 1].');
  let w = null; const rest = [];
  for (const x of args.slice(3)) { if (isText(x)) rest.push(toStr(x).toLowerCase()); else w = Array.from(F(x)); }
  if (w && w.length !== f.length / 2) throw E(`${name}:badWeights`, 'There must be one weight per band.');
  if (rest.some((s) => s === 'hilbert' || s === 'differentiator')) throw E(`${name}:notSupported`, 'Hilbert and differentiator designs are not supported yet.');
  return { n, f, a, w };
}
/** Parks-McClellan (Remez exchange) equiripple design, symmetric types I/II. */
export function remez(n, f, a, w) {
  const N = n + 1; const typeII = N % 2 === 0; const r = typeII ? N / 2 : (N + 1) / 2;
  const nb = f.length / 2; const W = w || new Array(nb).fill(1);
  const step = 1 / (16 * r);
  const gf = [], gd = [], gw = [], gb = [];
  for (let b = 0; b < nb; b++) {
    let f1 = f[2 * b], f2 = f[2 * b + 1];
    if (typeII && f2 >= 1) f2 = 1 - step;
    if (f2 < f1) continue;
    const np = Math.max(2, Math.ceil((f2 - f1) / step) + 1);
    for (let i = 0; i < np; i++) {
      const fi = f1 + (f2 - f1) * i / (np - 1); const t = f2 > f1 ? (fi - f1) / (f2 - f1) : 0;
      let d = a[2 * b] + (a[2 * b + 1] - a[2 * b]) * t, wt = W[b];
      if (typeII) { const c = Math.cos(Math.PI * fi / 2); d /= c; wt *= c; }
      gf.push(fi); gd.push(d); gw.push(wt); gb.push(b);
    }
  }
  const G = gf.length; const gx = gf.map((x) => Math.cos(Math.PI * x));
  if (G < r + 1) throw E('firpm:grid', 'The frequency grid is too small for this filter order.');
  let ext = Array.from({ length: r + 1 }, (_, k) => Math.round(k * (G - 1) / r));
  const bw = (xs) => {
    const lg = xs.map((xk, k) => { let s = 0, sg = 1; xs.forEach((xj, j) => { if (j !== k) { const d = xk - xj; s -= Math.log(Math.abs(d) || 1e-300); if (d < 0) sg = -sg; } }); return [s, sg]; });
    const mx = Math.max(...lg.map((x) => x[0])); return lg.map(([s, sg]) => sg * Math.exp(s - mx));
  };
  let delta = 0, xs, ys, hw;
  const evalA = (x) => { let nu = 0, de = 0; for (let k = 0; k < xs.length; k++) { const d = x - xs[k]; if (d === 0) return ys[k]; const t = hw[k] / d; nu += t * ys[k]; de += t; } return nu / de; };
  for (let it = 0; it < 100; it++) {
    const xe = ext.map((i) => gx[i]); const g = bw(xe);
    let nu = 0, de = 0; for (let k = 0; k <= r; k++) { nu += g[k] * gd[ext[k]]; de += g[k] * (k % 2 ? -1 : 1) / gw[ext[k]]; }
    delta = nu / de;
    xs = xe.slice(0, r); ys = xs.map((_, k) => gd[ext[k]] - (k % 2 ? -1 : 1) * delta / gw[ext[k]]); hw = bw(xs);
    const Er = new Float64Array(G); for (let i = 0; i < G; i++) Er[i] = gw[i] * (gd[i] - evalA(gx[i]));
    let cand = [];
    for (let i = 0; i < G; i++) {
      const lft = i > 0 && gb[i - 1] === gb[i] ? Er[i - 1] : null, rgt = i < G - 1 && gb[i + 1] === gb[i] ? Er[i + 1] : null;
      const e = Er[i];
      const isMax = e >= 0 && (lft == null || e >= lft) && (rgt == null || e > rgt);
      const isMin = e <= 0 && (lft == null || e <= lft) && (rgt == null || e < rgt);
      if ((isMax || isMin) && Math.abs(e) >= Math.abs(delta) * (1 - 1e-9)) cand.push(i);
    }
    const merged = [];
    for (const i of cand) { const l = merged[merged.length - 1]; if (l != null && Math.sign(Er[l]) === Math.sign(Er[i])) { if (Math.abs(Er[i]) > Math.abs(Er[l])) merged[merged.length - 1] = i; } else merged.push(i); }
    while (merged.length > r + 1) { if (Math.abs(Er[merged[0]]) < Math.abs(Er[merged[merged.length - 1]])) merged.shift(); else merged.pop(); }
    if (merged.length < r + 1) break;
    const same = merged.every((x, i) => x === ext[i]);
    ext = merged;
    if (same) break;
  }
  const h = new Float64Array(N); const Ar = new Float64Array(N);
  for (let j = 0; j < N; j++) { const wj = 2 * Math.PI * j / N; let A = evalA(Math.cos(wj)); if (typeII) A *= Math.cos(wj / 2); Ar[j] = A; }
  for (let t = 0; t < N; t++) { let s = 0; for (let j = 0; j < N; j++) { const wj = 2 * Math.PI * j / N; s += Ar[j] * Math.cos(wj * (t - (N - 1) / 2)); } h[t] = s / N; }
  return { h, err: Math.abs(delta) };
}
function kaiserordImpl(args) {
  if (args.length < 3) throw E('kaiserord:args', 'Usage: [n,Wn,beta,ftype] = kaiserord(f, a, dev, fs).');
  const fs = args.length > 3 ? toNum(args[3]) : 2;
  const f = Array.from(F(args[0])).map((x) => x / fs); const a = Array.from(F(args[1])); const dev = Array.from(F(args[2]));
  if (f.length !== 2 * (a.length - 1)) throw E('kaiserord:badLength', 'length(f) must be 2*length(a)-2.');
  if (dev.length !== a.length) throw E('kaiserord:badDev', 'dev and a must have the same length.');
  const delta = Math.min(...dev); const atten = -20 * Math.log10(delta);
  const D = atten > 21 ? (atten - 7.95) / 14.36 : 0.9222;
  let df = Infinity; for (let i = 0; i < f.length; i += 2) df = Math.min(df, f[i + 1] - f[i]);
  let n = Math.ceil(D / df);
  const beta = atten > 50 ? 0.1102 * (atten - 8.7) : atten >= 21 ? 0.5842 * (atten - 21) ** 0.4 + 0.07886 * (atten - 21) : 0;
  const Wn = []; for (let i = 0; i < f.length; i += 2) Wn.push(f[i] + f[i + 1]);
  let ftype;
  if (a.length === 2) ftype = a[0] > a[1] ? 'low' : 'high';
  else if (a.length === 3 && a[0] === 0 && a[2] === 0) ftype = 'bandpass';
  else if (a.length === 3 && a[1] === 0) ftype = 'stop';
  else ftype = a[0] === 0 ? 'DC-0' : 'DC-1';
  if ((ftype === 'high' || ftype === 'stop' || ftype === 'DC-1') && n % 2) n += 1;
  return [num(n), Wn.length === 1 ? num(Wn[0]) : row(Wn), num(beta), str(ftype)];
}

// ------------------------------------------------------------ bilinear / impinvar
function polyMulR(a, b) { return kconv(a, b); }
function polyPow(p, k) { let r = [1]; for (let i = 0; i < k; i++) r = polyMulR(r, p); return r; }
export function bilinearTf(b, a, fs) {
  b = Array.from(b); a = Array.from(a); while (a.length > 1 && a[0] === 0) a.shift(); while (b.length > 1 && b[0] === 0) b.shift();
  const N = Math.max(a.length, b.length) - 1; const c = 2 * fs;
  const sub = (p) => { const deg = p.length - 1; let out = new Array(N + 1).fill(0); for (let i = 0; i <= deg; i++) { const pw = deg - i; const t = polyMulR(polyPow([1, -1], pw), polyPow([1, 1], N - pw)).map((x) => x * p[i] * c ** pw); for (let j = 0; j < t.length; j++) out[j + (N + 1 - t.length)] += t[j]; } return out; };
  const bz = sub(b), az = sub(a); const a0 = az[0];
  return { b: bz.map((x) => x / a0), a: az.map((x) => x / a0) };
}
function bilinearImpl(args, nargout) {
  if (args.length < 3) throw E('bilinear:args', 'Not enough input arguments.');
  const p = M(args[1]), z0 = M(args[0]);
  const zpkForm = args.length >= 4 && nargout !== 4 && (p.n === 1 || p.m * p.n === 0) && z0.n <= 1 && M(args[2]).a.length === 1 && M(args[3]).a.length === 1;
  if (!zpkForm && (nargout === 4 || args.length >= 5)) {
    let fs = toNum(args[4]); if (args.length > 5) { const fp = 2 * Math.PI * toNum(args[5]); fs = fp / Math.tan(fp / fs / 2) / 2; }
    const A = toRows(args[0]), B = toRows(args[1]), Cm = toRows(args[2]), D = toRows(args[3]); const n = A.length; const t = 1 / fs, r = Math.sqrt(t);
    const t1 = kadd(keye(n), kscale(A, t / 2)), t2 = kadd(keye(n), kscale(A, -t / 2));
    const Ad = ksolve(t2, t1), Bd = kscale(ksolve(t2, B), t / r);
    const t2T = t2[0].map((_, j) => t2.map((rw) => rw[j])); const CdT = ksolve(t2T, Cm[0].map((_, j) => Cm.map((rw) => rw[j])));
    const Cd = kscale(CdT[0].map((_, j) => CdT.map((rw) => rw[j])), r);
    const Dd = kadd(kscale(kmul(kscale(Cd, 1 / r), B), t / 2), D);
    return [fromRows(Ad), fromRows(Bd), fromRows(Cd), fromRows(Dd)];
  }
  if (zpkForm) {
    let fs = toNum(args[3]); if (args.length > 4) { const fp = 2 * Math.PI * toNum(args[4]); fs = fp / Math.tan(fp / fs / 2) / 2; }
    const z = toCList(args[0]), pp = toCList(args[1]); const k = toNum(args[2]);
    const f = bilinearZpk({ z, p: pp, k }, fs);
    return [cpxCol(cleanRoots(f.z)), cpxCol(cleanRoots(f.p)), num(f.k)];
  }
  let fs = toNum(args[2]); if (args.length > 3) { const fp = 2 * Math.PI * toNum(args[3]); fs = fp / Math.tan(fp / fs / 2) / 2; }
  const r = bilinearTf(F(args[0]), F(args[1]), fs);
  return [row(r.b), row(r.a)];
}
function toCList(v) { const t = M(v); const out = []; for (let i = 0; i < t.a.length; i++) out.push([t.a[i], t.im ? t.im[i] : 0]); return out; }
function impinvarImpl(args) {
  if (args.length < 2) throw E('impinvar:args', 'Usage: [bz,az] = impinvar(b, a, fs).');
  const b = Array.from(F(args[0])), a = Array.from(F(args[1])); const fs = args.length > 2 ? toNum(args[2]) : 1; const T = 1 / fs;
  while (a.length > 1 && a[0] === 0) a.shift(); while (b.length > 1 && b[0] === 0) b.shift();
  if (b.length >= a.length) throw E('impinvar:improper', 'The analog filter must be strictly proper (numerator degree below denominator degree).');
  const a0 = a[0]; const an = a.map((x) => x / a0), bn = b.map((x) => x / a0);
  const p = rootsC(an); const da = an.slice(0, -1).map((c, i) => c * (an.length - 1 - i));
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (cabs(csub(p[i], p[j])) < 1e-6 * (1 + cabs(p[i]))) throw E('impinvar:repeated', 'Repeated poles are not supported.');
  const pv = (q, z) => { let s = [0, 0]; for (const c of q) s = cadd(cmul(s, z), [c, 0]); return s; };
  const res = p.map((pi) => cdiv(pv(bn, pi), pv(da, pi)));
  const pz = p.map((pi) => cexp([pi[0] * T, pi[1] * T]));
  // sum r_i / (1 - pz_i z^-1) → numerator and denominator in z^-1
  const den = polyCx(pz); let numr = new Array(p.length).fill(null).map(() => [0, 0]);
  for (let i = 0; i < p.length; i++) { const others = polyCx(pz.filter((_, j) => j !== i)); for (let j = 0; j < others.length; j++) numr[j] = cadd(numr[j], cmul(res[i], others[j])); }
  const bz = numr.map((x) => x[0] * T); const az = den.map((x) => x[0]);
  while (bz.length < az.length) bz.push(0);
  return [row(bz), row(az)];
}

// ------------------------------------------------------------ second-order sections
export function zp2sosCore(z, p, k, order = 'up') {
  z = z.slice(); const groups = [];
  const cp = p.filter((x) => x[1] > 0), rp = p.filter((x) => x[1] === 0).sort((x, y) => Math.abs(y[0]) - Math.abs(x[0]));
  for (const x of cp) groups.push([x, conj(x)]);
  for (let i = 0; i < rp.length; i += 2) groups.push(rp.slice(i, i + 2));
  const nsec = Math.max(groups.length, Math.ceil(z.length / 2));
  while (groups.length < nsec) groups.push([]);
  groups.sort((g1, g2) => (g2.length ? Math.max(...g2.map(cabs)) : -1) - (g1.length ? Math.max(...g1.map(cabs)) : -1));
  const secs = [];
  const take = (target, realOnly) => {
    let best = -1, bd = Infinity;
    z.forEach((x, i) => { if (realOnly && x[1] !== 0) return; if (x[1] < 0) return; const d = cabs(csub(x, target)); if (d < bd) { bd = d; best = i; } });
    if (best < 0) return null; const x = z[best]; z.splice(best, 1);
    if (x[1] > 0) { const ci = z.findIndex((y) => Math.abs(y[0] - x[0]) < 1e-9 * (1 + Math.abs(x[0])) && Math.abs(y[1] + x[1]) < 1e-9 * (1 + Math.abs(x[1]))); if (ci >= 0) z.splice(ci, 1); return [x, conj(x)]; }
    return [x];
  };
  for (const g of groups) {
    let zs = [];
    const tgt = g.length ? g[0] : [0, 0];
    const first = take(tgt, g.length === 1);
    if (first) { zs = first; if (zs.length === 1 && g.length !== 1) { const s2 = take(tgt, true); if (s2) zs.push(...s2); } }
    secs.push({ z: zs, p: g });
  }
  // leftover zeros (more zeros than fitted): append to sections with room
  for (const x of z) { if (x[1] < 0) continue; const s = secs.find((t) => t.z.length < 2); if (s) s.z.push(x); }
  if (order === 'up') secs.reverse();
  const rows = secs.map((s) => { const b = polyR(s.z), a = polyR(s.p); while (b.length < 3) b.push(0); while (a.length < 3) a.push(0); return [...b, ...a]; });
  return rows;
}
function sosOut(rows, k, nargout) {
  if (nargout >= 2) return [fromRows(rows), num(k)];
  const r = rows.map((x) => x.slice()); if (r.length) for (let j = 0; j < 3; j++) r[0][j] *= k;
  return fromRows(r);
}
const sosRows = (v) => { const r = toRows(v); if (r.length && r[0].length !== 6) throw E('sos:badSos', 'SOS matrix must have 6 columns.'); return r; };
const sosBuiltins = {
  zp2sos(args, nargout) {
    const z = toCList(args[0]), p = toCList(args[1]); const k = args.length > 2 ? toNum(args[2]) : 1; const ord = args.length > 3 && isText(args[3]) ? toStr(args[3]).toLowerCase() : 'up';
    return sosOut(zp2sosCore(cleanRoots(z, 1e-10), cleanRoots(p, 1e-10), k, ord), k, nargout);
  },
  tf2sos(args, nargout) {
    const b = Array.from(F(args[0])), a = Array.from(F(args[1])); const ord = args.length > 2 && isText(args[2]) ? toStr(args[2]).toLowerCase() : 'up';
    while (a.length > 1 && a[0] === 0) a.shift();
    const L = Math.max(b.length, a.length); while (b.length < L) b.push(0); while (a.length < L) a.push(0);
    let bi = 0; while (bi < b.length && b[bi] === 0) bi++;
    const k = bi < b.length ? b[bi] / a[0] : 0;
    const zz = cleanRoots(rootsC(b), 1e-10), pp = cleanRoots(rootsC(a), 1e-10);
    return sosOut(zp2sosCore(zz, pp, k, ord), k, nargout);
  },
  sos2tf(args) {
    const rows = sosRows(args[0]); const g = args.length > 1 ? toNum(args[1]) : 1;
    let b = [g], a = [1]; for (const r of rows) { b = kconv(b, r.slice(0, 3)); a = kconv(a, r.slice(3)); }
    while (b.length > 1 && a.length > 1 && b[b.length - 1] === 0 && a[a.length - 1] === 0) { b.pop(); a.pop(); }
    return [row(b), row(a)];
  },
  sos2zp(args) {
    const rows = sosRows(args[0]); const g = args.length > 1 ? toNum(args[1]) : 1;
    const z = [], p = []; let k = g;
    for (const r of rows) {
      const b = r.slice(0, 3), a = r.slice(3);
      const tb = b.slice(); while (tb.length > 1 && tb[tb.length - 1] === 0) tb.pop(); const ta = a.slice(); while (ta.length > 1 && ta[ta.length - 1] === 0) ta.pop();
      k *= b[0] / a[0];
      if (b[0] !== 0) z.push(...rootsC(tb)); if (a[0] !== 0) p.push(...rootsC(ta));
    }
    return [cpxCol(cleanRoots(z)), cpxCol(cleanRoots(p)), num(k)];
  },
};

// ------------------------------------------------------------ builtins
export const builtins = {
  butter: iir((n) => buttap(n), 'butter', 0),
  cheby1: iir((n, rp) => cheb1ap(n, rp), 'cheby1', 1),
  cheby2: iir((n, rs) => cheb2ap(n, rs), 'cheby2', 1),
  ellip: iir((n, rp, rs) => ellipap(n, rp, rs), 'ellip', 2),
  besself(args, nargout) {
    if (args.length < 2) throw E('besself:args', 'Usage: [b,a] = besself(n, Wo).');
    const n = toNum(args[0]); const Wn = Array.from(F(args[1]));
    let type = Wn.length === 2 ? 'bandpass' : 'low';
    for (const a of args.slice(2)) { const s = lowerText(a); if (s && BTYPES[s]) type = BTYPES[s]; }
    return designOut(designZpk(besselap(n), Wn, type, true), nargout);
  },
  buttap(args, nargout) { const f = buttap(toNum(args[0])); return designOut(f, 3); },
  cheb1ap(args) { return designOut(cheb1ap(toNum(args[0]), toNum(args[1])), 3); },
  cheb2ap(args) { return designOut(cheb2ap(toNum(args[0]), toNum(args[1])), 3); },
  ellipap(args) { return designOut(ellipap(toNum(args[0]), toNum(args[1]), toNum(args[2])), 3); },
  besselap(args) { return designOut(besselap(toNum(args[0])), 3); },
  ...builtinsOrd,
  fir1(args, nargout, ctx) { const { b, warn } = fir1Impl(args); if (warn && ctx) ctx.warning('numeric:fir1:oddOrder', 'Odd order symmetric FIR filters must have a gain of zero at the Nyquist frequency. The order is being increased by one.'); return row(b); },
  fir2(args) { return row(fir2Impl(args)); },
  firls(args) { const o = bandArgs(args, 'firls'); return row(firlsCore(o.n, o.f, o.a, o.w)); },
  firpm(args, nargout) { const o = bandArgs(args, 'firpm'); const r = remez(o.n, o.f, o.a, o.w); return [row(r.h), num(r.err)]; },
  kaiserord: kaiserordImpl,
  bilinear: bilinearImpl,
  impinvar: impinvarImpl,
  ...sosBuiltins,
};

const iirSyn = (n, p) => [`[b,a] = ${n}(n, ${p}Wn)`, `[b,a] = ${n}(n, ${p}Wn, ftype)`, `[z,p,k] = ${n}(___)`, `[A,B,C,D] = ${n}(___)`, `[b,a] = ${n}(n, ${p}Wn, 's')`];
export const help = {
  butter: H('Butterworth IIR filter design (lowpass, highpass, bandpass, bandstop; digital or analog).', '버터워스 IIR 필터 설계 (저역/고역/대역통과/대역저지, 디지털 또는 아날로그).', iirSyn('butter', '')),
  cheby1: H('Chebyshev type I IIR filter design with passband ripple Rp dB.', '통과대역 리플 Rp dB 의 체비셰프 1형 IIR 필터 설계.', iirSyn('cheby1', 'Rp, ')),
  cheby2: H('Chebyshev type II IIR filter design with stopband attenuation Rs dB.', '저지대역 감쇠 Rs dB 의 체비셰프 2형 IIR 필터 설계.', iirSyn('cheby2', 'Rs, ')),
  ellip: H('Elliptic (Cauer) IIR filter design with passband ripple Rp and stopband attenuation Rs.', '통과대역 리플 Rp, 저지대역 감쇠 Rs 의 타원(Cauer) IIR 필터 설계.', iirSyn('ellip', 'Rp, Rs, ')),
  besself: H('Bessel analog filter design (maximally flat group delay).', '베셀 아날로그 필터 설계 (최대 평탄 군지연).', ['[b,a] = besself(n, Wo)', "[b,a] = besself(n, Wo, ftype)", '[z,p,k] = besself(___)']),
  buttap: H('Butterworth analog lowpass prototype (zeros, poles, gain).', '버터워스 아날로그 저역통과 원형 (영점, 극점, 이득).', ['[z,p,k] = buttap(n)']),
  cheb1ap: H('Chebyshev type I analog lowpass prototype.', '체비셰프 1형 아날로그 저역통과 원형.', ['[z,p,k] = cheb1ap(n, Rp)']),
  cheb2ap: H('Chebyshev type II analog lowpass prototype.', '체비셰프 2형 아날로그 저역통과 원형.', ['[z,p,k] = cheb2ap(n, Rs)']),
  ellipap: H('Elliptic analog lowpass prototype.', '타원 아날로그 저역통과 원형.', ['[z,p,k] = ellipap(n, Rp, Rs)']),
  besselap: H('Bessel analog lowpass prototype.', '베셀 아날로그 저역통과 원형.', ['[z,p,k] = besselap(n)']),
  buttord: H('Minimum Butterworth order and cutoff for given passband/stopband specs.', '통과/저지대역 사양을 만족하는 최소 버터워스 차수와 차단 주파수.', ['[n,Wn] = buttord(Wp, Ws, Rp, Rs)', "[n,Wn] = buttord(Wp, Ws, Rp, Rs, 's')"]),
  cheb1ord: H('Minimum Chebyshev type I order for given specs.', '사양을 만족하는 최소 체비셰프 1형 차수.', ['[n,Wp] = cheb1ord(Wp, Ws, Rp, Rs)']),
  cheb2ord: H('Minimum Chebyshev type II order for given specs.', '사양을 만족하는 최소 체비셰프 2형 차수.', ['[n,Ws] = cheb2ord(Wp, Ws, Rp, Rs)']),
  ellipord: H('Minimum elliptic filter order for given specs.', '사양을 만족하는 최소 타원 필터 차수.', ['[n,Wp] = ellipord(Wp, Ws, Rp, Rs)']),
  fir1: H('Window-method FIR filter design (default Hamming window, scaled passband).', '창 방식 FIR 필터 설계 (기본 해밍 창, 통과대역 정규화).', ['b = fir1(n, Wn)', 'b = fir1(n, Wn, ftype)', 'b = fir1(n, Wn, window)', "b = fir1(___, 'noscale')"]),
  fir2: H('Frequency-sampling FIR filter design from an arbitrary magnitude response.', '임의 크기 응답의 주파수 샘플링 FIR 필터 설계.', ['b = fir2(n, f, m)', 'b = fir2(n, f, m, npt, lap)', 'b = fir2(___, window)']),
  firls: H('Least-squares linear-phase FIR filter design.', '최소제곱 선형 위상 FIR 필터 설계.', ['b = firls(n, f, a)', 'b = firls(n, f, a, w)']),
  firpm: H('Parks-McClellan equiripple FIR filter design.', 'Parks-McClellan 등리플 FIR 필터 설계.', ['b = firpm(n, f, a)', 'b = firpm(n, f, a, w)', '[b, err] = firpm(___)']),
  kaiserord: H('Kaiser window FIR order estimate: order, cutoff, beta and filter type for fir1.', 'Kaiser 창 FIR 차수 추정: fir1 용 차수, 차단, beta, 필터 형식.', ['[n,Wn,beta,ftype] = kaiserord(f, a, dev)', '[n,Wn,beta,ftype] = kaiserord(f, a, dev, fs)']),
  bilinear: H('Bilinear transform of an analog filter (transfer function, zpk or state space), optional prewarping.', '아날로그 필터의 쌍선형 변환 (전달함수, zpk, 상태공간), 선택적 사전 왜곡.', ['[numd,dend] = bilinear(num, den, fs)', '[zd,pd,kd] = bilinear(z, p, k, fs)', '[Ad,Bd,Cd,Dd] = bilinear(A, B, C, D, fs)', '[___] = bilinear(___, fp)']),
  impinvar: H('Impulse invariance analog-to-digital filter conversion.', '임펄스 불변 아날로그→디지털 필터 변환.', ['[bz,az] = impinvar(b, a, fs)']),
  zp2sos: H('Zero-pole-gain to second-order sections.', '영점-극점-이득을 2차 섹션으로 변환.', ['sos = zp2sos(z, p, k)', '[sos, g] = zp2sos(z, p, k)', "sos = zp2sos(z, p, k, 'down')"]),
  tf2sos: H('Transfer function to second-order sections.', '전달함수를 2차 섹션으로 변환.', ['sos = tf2sos(b, a)', '[sos, g] = tf2sos(b, a)']),
  sos2tf: H('Second-order sections to transfer function.', '2차 섹션을 전달함수로 변환.', ['[b,a] = sos2tf(sos)', '[b,a] = sos2tf(sos, g)']),
  sos2zp: H('Second-order sections to zeros, poles and gain.', '2차 섹션을 영점, 극점, 이득으로 변환.', ['[z,p,k] = sos2zp(sos)', '[z,p,k] = sos2zp(sos, g)']),
};
export { freqzEval };
