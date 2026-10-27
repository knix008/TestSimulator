// Window functions: hamming hann hanning blackman blackmanharris nuttallwin
// flattopwin kaiser bartlett barthannwin bohmanwin triang rectwin gausswin
// tukeywin chebwin parzenwin taylorwin, and window(@fn, n, ...).
import { E, H, col, toNum, isText, toStr, isFuncHandle, F, callFn } from '../_util.js';
import { besseli0, fft as kfft } from '../_kernels.js';

function lenArg(args, name) {
  if (!args.length) throw E(`${name}:noLength`, 'Window length is required.');
  const L = toNum(args[0], 'Window length');
  if (!(L >= 0) || !Number.isFinite(L)) throw E(`${name}:badLength`, 'Window length must be a non-negative integer.');
  return Math.round(L);
}
function flag(args, start) {
  for (let i = start; i < args.length; i++) if (isText(args[i])) { const s = toStr(args[i]).toLowerCase(); if (s === 'periodic' || s === 'symmetric') return s; }
  return 'symmetric';
}
/** Generalized cosine window sum a_k cos(2 pi k n / (N-1)), symmetric or periodic. */
export function cosineWin(L, coef, sflag = 'symmetric') {
  if (L === 0) return new Float64Array(0);
  if (L === 1) return Float64Array.of(1);
  const N = sflag === 'periodic' ? L : L - 1; const w = new Float64Array(L);
  for (let n = 0; n < L; n++) { let s = 0; for (let k = 0; k < coef.length; k++) s += (k % 2 ? -1 : 1) * coef[k] * Math.cos(2 * Math.PI * k * n / N); w[n] = s; }
  if (sflag === 'symmetric') for (let n = 0; n < L / 2; n++) w[L - 1 - n] = w[n];
  return w;
}
export const hammingW = (L, f) => cosineWin(L, [0.54, 0.46], f);
export const hannW = (L, f) => cosineWin(L, [0.5, 0.5], f);
export function hanningW(L, f = 'symmetric') {
  if (f === 'periodic') { const w = new Float64Array(L); const h = hanningW(L - 1); w.set(h, 1); return w; }
  const w = new Float64Array(L); for (let n = 0; n < L; n++) w[n] = 0.5 * (1 - Math.cos(2 * Math.PI * (n + 1) / (L + 1))); return w;
}
export const blackmanW = (L, f) => { const w = cosineWin(L, [0.42, 0.5, 0.08], f); for (let i = 0; i < w.length; i++) if (Math.abs(w[i]) < 1e-15) w[i] = 0; return w; };
export function kaiserW(L, beta = 0.5) {
  const w = new Float64Array(L); if (L === 1) { w[0] = 1; return w; }
  const d = besseli0(beta);
  for (let n = 0; n < L; n++) { const r = 2 * n / (L - 1) - 1; w[n] = besseli0(beta * Math.sqrt(Math.max(0, 1 - r * r))) / d; }
  return w;
}
export function bartlettW(L) { const w = new Float64Array(L); if (L === 1) { w[0] = 1; return w; } const h = (L - 1) / 2; for (let n = 0; n < L; n++) w[n] = 1 - Math.abs(n - h) / h; return w; }
export function triangW(L) { const w = new Float64Array(L); const d = L % 2 ? L + 1 : L; for (let n = 1; n <= L; n++) w[n - 1] = 1 - Math.abs(2 * n - L - 1) / d; return w; }
export function gaussW(L, alpha = 2.5) { const w = new Float64Array(L); if (L === 1) { w[0] = 1; return w; } const h = (L - 1) / 2; for (let n = 0; n < L; n++) { const k = n - h; w[n] = Math.exp(-0.5 * (alpha * k / h) ** 2); } return w; }
export function tukeyW(L, r = 0.5) {
  if (r <= 0) return new Float64Array(L).fill(1);
  if (r >= 1) return hannW(L);
  const w = new Float64Array(L).fill(1); if (L === 1) return w;
  const per = r / 2; const tl = Math.floor(per * (L - 1)) + 1; const th = L - tl + 1;
  for (let n = 0; n < L; n++) {
    const x = n / (L - 1);
    if (n < tl) w[n] = (1 + Math.cos(Math.PI / per * (x - per))) / 2;
    else if (n >= th - 1) w[n] = (1 + Math.cos(Math.PI / per * (x - 1 + per))) / 2;
  }
  return w;
}
export function barthannW(L) { const w = new Float64Array(L); if (L === 1) { w[0] = 1; return w; } for (let n = 0; n < L; n++) { const x = n / (L - 1) - 0.5; w[n] = 0.62 - 0.48 * Math.abs(x) + 0.38 * Math.cos(2 * Math.PI * x); } return w; }
export function bohmanW(L) { const w = new Float64Array(L); if (L === 1) { w[0] = 1; return w; } for (let n = 0; n < L; n++) { const q = Math.abs(-1 + 2 * n / (L - 1)); w[n] = (1 - q) * Math.cos(Math.PI * q) + Math.sin(Math.PI * q) / Math.PI; } w[0] = 0; w[L - 1] = 0; return w; }
export function parzenW(L) {
  const w = new Float64Array(L); const h = (L - 1) / 2;
  for (let n = 0; n < L; n++) { const k = Math.abs(n - h); const r = k / (L / 2); w[n] = k <= (L - 1) / 4 ? 1 - 6 * r * r + 6 * r * r * r : 2 * (1 - r) ** 3; }
  return w;
}
export function chebW(L, at = 100) {
  if (L === 1) return Float64Array.of(1);
  const order = L - 1; const g = 10 ** (-Math.abs(at) / 20); const beta = Math.cosh(Math.acosh(1 / g) / order);
  const pr = new Float64Array(L), pim = new Float64Array(L);
  for (let k = 0; k < L; k++) {
    const x = beta * Math.cos(Math.PI * k / L); let p;
    if (x > 1) p = Math.cosh(order * Math.acosh(x));
    else if (x < -1) p = (order % 2 ? -1 : 1) * Math.cosh(order * Math.acosh(-x));
    else p = Math.cos(order * Math.acos(x));
    if (L % 2) pr[k] = p; else { pr[k] = p * Math.cos(Math.PI * k / L); pim[k] = p * Math.sin(Math.PI * k / L); }
  }
  const W = kfft(pr, pim).re; const w = new Float64Array(L);
  if (L % 2) { const Mh = (L + 1) / 2; const h = []; for (let i = 0; i < Mh; i++) h.push(W[i] / W[0]); const full = [...h.slice(1).reverse(), ...h]; w.set(full); }
  else { const Mh = L / 2 + 1; const h = []; for (let i = 1; i < Mh; i++) h.push(W[i] / W[1]); const full = [...h.slice().reverse(), ...h]; w.set(full); }
  return w;
}
export function taylorW(L, nbar = 4, sll = -30) {
  const A = Math.acosh(10 ** (-sll / 20)) / Math.PI; const sp2 = nbar * nbar / (A * A + (nbar - 0.5) ** 2);
  const Fm = [];
  for (let m = 1; m < nbar; m++) {
    let num = (m + 1) % 2 ? -1 : 1; let den = 1;
    for (let i = 1; i < nbar; i++) { num *= 1 - m * m / sp2 / (A * A + (i - 0.5) ** 2); if (i !== m) den *= 1 - m * m / (i * i); }
    Fm.push(num / (2 * den));
  }
  const w = new Float64Array(L);
  for (let k = 0; k < L; k++) { const xi = (k - 0.5 * L + 0.5) / L; let s = 1; for (let m = 1; m < nbar; m++) s += 2 * Fm[m - 1] * Math.cos(2 * Math.PI * m * xi); w[k] = s; }
  return w;
}

const opt = (args, i, def) => (args.length > i && !isText(args[i]) && F(args[i]).length ? toNum(args[i]) : def);
const W = (fn) => (args) => col(fn(args));
export const builtins = {
  hamming: W((a) => hammingW(lenArg(a, 'hamming'), flag(a, 1))),
  hann: W((a) => hannW(lenArg(a, 'hann'), flag(a, 1))),
  hanning: W((a) => hanningW(lenArg(a, 'hanning'), flag(a, 1))),
  blackman: W((a) => blackmanW(lenArg(a, 'blackman'), flag(a, 1))),
  blackmanharris: W((a) => cosineWin(lenArg(a, 'blackmanharris'), [0.35875, 0.48829, 0.14128, 0.01168], flag(a, 1))),
  nuttallwin: W((a) => cosineWin(lenArg(a, 'nuttallwin'), [0.3635819, 0.4891775, 0.1365995, 0.0106411], flag(a, 1))),
  flattopwin: W((a) => cosineWin(lenArg(a, 'flattopwin'), [0.21557895, 0.41663158, 0.277263158, 0.083578947, 0.006947368], flag(a, 1))),
  kaiser: W((a) => kaiserW(lenArg(a, 'kaiser'), opt(a, 1, 0.5))),
  bartlett: W((a) => bartlettW(lenArg(a, 'bartlett'))),
  barthannwin: W((a) => barthannW(lenArg(a, 'barthannwin'))),
  bohmanwin: W((a) => bohmanW(lenArg(a, 'bohmanwin'))),
  triang: W((a) => triangW(lenArg(a, 'triang'))),
  rectwin: W((a) => new Float64Array(lenArg(a, 'rectwin')).fill(1)),
  gausswin: W((a) => gaussW(lenArg(a, 'gausswin'), opt(a, 1, 2.5))),
  tukeywin: W((a) => tukeyW(lenArg(a, 'tukeywin'), opt(a, 1, 0.5))),
  chebwin: W((a) => chebW(lenArg(a, 'chebwin'), opt(a, 1, 100))),
  parzenwin: W((a) => parzenW(lenArg(a, 'parzenwin'))),
  taylorwin: W((a) => taylorW(lenArg(a, 'taylorwin'), opt(a, 1, 4), opt(a, 2, -30))),
  window(args, nargout, ctx) {
    if (args.length < 2) throw E('window:args', 'Usage: w = window(@fn, n, ...).');
    const f = args[0];
    let name = isFuncHandle(f) ? f.name : isText(f) ? toStr(f) : null;
    if (name && builtins[name]) return builtins[name](args.slice(1), 1, ctx);
    if (isFuncHandle(f)) return callFn(ctx, f, args.slice(1), 1)[0];
    throw E('window:badFunction', 'The first argument must be a window function handle.');
  },
};

const sy = (n, extra = []) => [`w = ${n}(L)`, ...extra];
export const help = {
  hamming: H('Hamming window (column vector).', '해밍 창 (열 벡터).', sy('hamming', ["w = hamming(L, 'periodic')"])),
  hann: H('Hann (raised cosine) window with zero end points.', '양 끝이 0인 Hann 창.', sy('hann', ["w = hann(L, 'periodic')"])),
  hanning: H('Hanning window without the zero end points.', '양 끝 0을 뺀 Hanning 창.', sy('hanning', ["w = hanning(L, 'periodic')"])),
  blackman: H('Blackman window.', 'Blackman 창.', sy('blackman', ["w = blackman(L, 'periodic')"])),
  blackmanharris: H('Minimum four-term Blackman-Harris window.', '최소 4항 Blackman-Harris 창.', sy('blackmanharris')),
  nuttallwin: H('Nuttall-defined minimum four-term Blackman-Harris window.', 'Nuttall 정의 4항 Blackman-Harris 창.', sy('nuttallwin')),
  flattopwin: H('Flat top weighted window.', '평탄 상단(flat top) 창.', sy('flattopwin')),
  kaiser: H('Kaiser window with shape parameter beta (default 0.5).', '모양 매개변수 beta 의 Kaiser 창 (기본 0.5).', ['w = kaiser(L, beta)']),
  bartlett: H('Bartlett (triangular, zero end points) window.', 'Bartlett 창 (삼각, 끝점 0).', sy('bartlett')),
  barthannwin: H('Modified Bartlett-Hann window.', '수정 Bartlett-Hann 창.', sy('barthannwin')),
  bohmanwin: H('Bohman window.', 'Bohman 창.', sy('bohmanwin')),
  triang: H('Triangular window (non-zero end points).', '삼각 창 (끝점이 0이 아님).', sy('triang')),
  rectwin: H('Rectangular window (ones).', '사각 창 (모두 1).', sy('rectwin')),
  gausswin: H('Gaussian window with width factor alpha (default 2.5).', '폭 계수 alpha 의 가우스 창 (기본 2.5).', ['w = gausswin(L)', 'w = gausswin(L, alpha)']),
  tukeywin: H('Tukey (tapered cosine) window with ratio r (default 0.5).', '비율 r 의 Tukey(테이퍼 코사인) 창 (기본 0.5).', ['w = tukeywin(L)', 'w = tukeywin(L, r)']),
  chebwin: H('Dolph-Chebyshev window with sidelobe attenuation r dB (default 100).', '부엽 감쇠 r dB 의 Dolph-Chebyshev 창 (기본 100).', ['w = chebwin(L)', 'w = chebwin(L, r)']),
  parzenwin: H('Parzen (de la Vallee Poussin) window.', 'Parzen 창.', sy('parzenwin')),
  taylorwin: H('Taylor window (nbar, sidelobe level sll dB).', 'Taylor 창 (nbar, 부엽 레벨 sll dB).', ['w = taylorwin(L)', 'w = taylorwin(L, nbar, sll)']),
  window: H('Window of a given type: window(@hamming, 64).', '지정 형식의 창: window(@hamming, 64).', ['w = window(@fn, L)', 'w = window(@fn, L, param)']),
};
