// digitalFilter objects and designfilt; filter-property helpers filtord,
// isfir, islinphase, isminphase, ismaxphase.
import { E, H, F, M, row, num, str, bool, toNum, isText, toStr, isObject, fromRows, fmtShort, matText, isEmptyV } from '../_util.js';
import { object } from '../../../value.js';
import { filter as kfilter, roots as kroots } from '../_kernels.js';
import { builtins as design, designZpk, buttap, cheb1ap, cheb2ap, ellipap, zp2sosCore, firlsCore, remez } from './design.js';
import { builtins as spec, sosToTf } from './spectral.js';
import { filtfiltCore } from './proc.js';
import { kaiserW, builtins as winB } from './windows.js';
import { columnsOf, fromColumns, zpk2tf } from './_dsp.js';

// ------------------------------------------------------------ object
export function makeFilter(b, a, sos, info) {
  const fir = !sos && a.length === 1;
  const props = {
    FilterStructure: str(fir ? 'Direct-Form FIR' : 'Direct-Form II'),
    Coefficients: fir ? row(b.map((v) => v / a[0])) : fromRows(sos || [[...b, ...a]]),
    SampleRate: num(info.fs),
    FrequencyResponse: str(info.response),
    ImpulseResponse: str(fir ? 'fir' : 'iir'),
    DesignMethod: str(info.method),
  };
  for (const [k, v] of Object.entries(info.specs || {})) props[k] = typeof v === 'number' ? num(v) : str(String(v));
  return object('digitalFilter', props, { extra: { _b: b.slice(), _a: a.slice(), _sos: sos || null } });
}
const isDF = (v) => v && isObject(v) && v.cls === 'digitalFilter';
function needDF(args, name) { if (!isDF(args[0])) throw E(`digitalFilter:${name}`, `The first argument of ${name} must be a digitalFilter.`); return args[0]; }

// ------------------------------------------------------------ designfilt
const RESP = ['lowpassfir', 'lowpassiir', 'highpassfir', 'highpassiir', 'bandpassfir', 'bandpassiir', 'bandstopfir', 'bandstopiir'];
function designfiltImpl(args) {
  if (!args.length || !isText(args[0])) throw E('designfilt:noResponse', 'The first input must be a response type such as \'lowpassfir\'.');
  const resp = toStr(args[0]).toLowerCase();
  if (!RESP.includes(resp)) throw E('designfilt:badResponse', `Response '${toStr(args[0])}' is not supported. Use one of: ${RESP.join(', ')}.`);
  const o = Object.create(null); const names = Object.create(null);
  for (let i = 1; i < args.length; i += 2) {
    if (!isText(args[i])) throw E('designfilt:badOption', `Expected an option name at argument ${i + 1}.`);
    if (i + 1 >= args.length) throw E('designfilt:badOption', `Option '${toStr(args[i])}' needs a value.`);
    const k = toStr(args[i]).toLowerCase(); names[k] = toStr(args[i]); o[k] = args[i + 1];
  }
  const fs = o.samplerate ? toNum(o.samplerate) : 2; const nyq = fs / 2;
  const g = (k) => (o[k] != null ? toNum(o[k]) : null);
  const nf = (k) => (o[k] != null ? toNum(o[k]) / nyq : null);
  const method = o.designmethod ? toStr(o.designmethod).toLowerCase() : null;
  const order = g('filterorder');
  const kind = resp.replace(/(fir|iir)$/, ''); const isFir = resp.endsWith('fir');
  const specs = {}; for (const k of Object.keys(o)) if (k !== 'designmethod' && k !== 'samplerate' && k !== 'window') specs[names[k]] = isText(o[k]) ? toStr(o[k]) : toNum(o[k]);
  const btype = { lowpass: 'low', highpass: 'high', bandpass: 'bandpass', bandstop: 'stop' }[kind];
  const info = { fs, response: kind.charAt(0).toUpperCase() + kind.slice(1), method: '', specs };
  if (isFir) {
    let cut = kind === 'lowpass' || kind === 'highpass' ? (nf('cutofffrequency') != null ? [nf('cutofffrequency')] : null) : (nf('cutofffrequency1') != null ? [nf('cutofffrequency1'), nf('cutofffrequency2')] : null);
    let n = order;
    // band edges for ls/equiripple/kaiser
    let edges = null, amps = null;
    if (kind === 'lowpass' && nf('passbandfrequency') != null) { edges = [0, nf('passbandfrequency'), nf('stopbandfrequency'), 1]; amps = [1, 1, 0, 0]; }
    if (kind === 'highpass' && nf('passbandfrequency') != null) { edges = [0, nf('stopbandfrequency'), nf('passbandfrequency'), 1]; amps = [0, 0, 1, 1]; }
    if (kind === 'bandpass' && nf('passbandfrequency1') != null) { edges = [0, nf('stopbandfrequency1'), nf('passbandfrequency1'), nf('passbandfrequency2'), nf('stopbandfrequency2'), 1]; amps = [0, 0, 1, 1, 0, 0]; }
    if (kind === 'bandstop' && nf('passbandfrequency1') != null) { edges = [0, nf('passbandfrequency1'), nf('stopbandfrequency1'), nf('stopbandfrequency2'), nf('passbandfrequency2'), 1]; amps = [1, 1, 0, 0, 1, 1]; }
    if (edges && edges.some((x) => x == null || Number.isNaN(x))) throw E('designfilt:missingSpec', 'Incomplete passband/stopband frequency specification.');
    let b;
    if (cut && n != null) {
      info.method = 'Window';
      const fargs = [num(n), cut.length === 1 ? num(cut[0]) : row(cut)]; if (btype === 'high' || btype === 'stop') fargs.push(str(btype));
      if (o.window) { const wname = isText(o.window) ? toStr(o.window) : null; fargs.push(wname ? (() => { const wf = winB[wname.toLowerCase()]; if (!wf) throw E('designfilt:badWindow', `Unknown window '${wname}'.`); return wf([num(n + 1)]); })() : o.window); }
      b = Array.from(F(design.fir1(fargs, 1, null)));
    } else if (edges && n != null) {
      if (method === 'ls') { info.method = 'Least-squares'; b = Array.from(firlsCore(n, edges, amps)); }
      else { info.method = 'Equiripple'; b = Array.from(remez(n, edges, amps).h); }
    } else if (edges) {
      const rp = g('passbandripple') ?? 1, as = g('stopbandattenuation') ?? 60;
      const dp = (10 ** (rp / 20) - 1) / (10 ** (rp / 20) + 1), ds = 10 ** (-as / 20);
      const bands = edges.slice(1, -1); const a = []; for (let i = 0; i < amps.length; i += 2) a.push(amps[i]);
      const ko = design.kaiserord([row(bands), row(a), row(a.map((x) => (x ? dp : ds)))]);
      n = toNum(ko[0]); const beta = toNum(ko[2]); const w = row(Array.from(kaiserW(n + 1, beta)));
      const fargs = [num(n), ko[1]]; if (btype === 'high' || btype === 'stop') fargs.push(str(btype)); fargs.push(w);
      if (kind === 'bandstop' && (n % 2)) throw E('designfilt:odd', 'Bandstop design needs an even order.');
      b = Array.from(F(design.fir1(fargs, 1, null))); info.method = 'Kaiser window';
    } else throw E('designfilt:missingSpec', 'Specify FilterOrder with CutoffFrequency, or passband and stopband frequencies.');
    return makeFilter(b, [1], null, info);
  }
  // IIR
  let proto, Wn, m = method;
  const hp = kind === 'lowpass' || kind === 'highpass' ? [nf('halfpowerfrequency')] : [nf('halfpowerfrequency1'), nf('halfpowerfrequency2')];
  const pb = kind === 'lowpass' || kind === 'highpass' ? [nf('passbandfrequency')] : [nf('passbandfrequency1'), nf('passbandfrequency2')];
  const sb = kind === 'lowpass' || kind === 'highpass' ? [nf('stopbandfrequency')] : [nf('stopbandfrequency1'), nf('stopbandfrequency2')];
  const rp = g('passbandripple'), as = g('stopbandattenuation');
  let n = order;
  if (n == null) {
    if (pb[0] == null || sb[0] == null) throw E('designfilt:missingSpec', 'Specify FilterOrder or passband and stopband frequencies.');
    m = m || 'butter'; const fn = { butter: 'buttord', cheby1: 'cheb1ord', cheby2: 'cheb2ord', ellip: 'ellipord' }[m];
    if (!fn) throw E('designfilt:badMethod', `Unknown design method '${m}'.`);
    const ro = design[fn]([pb.length === 1 ? num(pb[0]) : row(pb), sb.length === 1 ? num(sb[0]) : row(sb), num(rp ?? 1), num(as ?? 60)]);
    n = toNum(ro[0]); Wn = Array.from(F(ro[1]));
    if (kind === 'bandpass' || kind === 'bandstop') { /* order applies per band edge pair */ }
  } else if (hp[0] != null) { m = m || 'butter'; Wn = hp; }
  else if (pb[0] != null && as != null && rp != null) { m = m || 'ellip'; Wn = pb; }
  else if (pb[0] != null && rp != null) { m = m || 'cheby1'; Wn = pb; }
  else if (sb[0] != null && as != null) { m = m || 'cheby2'; Wn = sb; }
  else throw E('designfilt:missingSpec', 'Incomplete IIR specification (HalfPowerFrequency, PassbandFrequency/PassbandRipple or StopbandFrequency/StopbandAttenuation).');
  if (Wn.some((x) => x == null || !(x > 0 && x < 1))) throw E('designfilt:badFrequency', 'Frequencies must lie between 0 and the Nyquist frequency.');
  if (m === 'butter') proto = buttap(n); else if (m === 'cheby1') proto = cheb1ap(n, rp ?? 1); else if (m === 'cheby2') proto = cheb2ap(n, as ?? 60); else if (m === 'ellip') proto = ellipap(n, rp ?? 1, as ?? 60);
  else throw E('designfilt:badMethod', `Unknown design method '${m}'.`);
  if (kind === 'bandpass' || kind === 'bandstop') { if (n % 2 && order != null) throw E('designfilt:oddOrder', 'Band IIR designs need an even FilterOrder.'); if (order != null) proto = m === 'butter' ? buttap(n / 2) : m === 'cheby1' ? cheb1ap(n / 2, rp ?? 1) : m === 'cheby2' ? cheb2ap(n / 2, as ?? 60) : ellipap(n / 2, rp ?? 1, as ?? 60); }
  const f = designZpk(proto, Wn, btype, false);
  const sos = zp2sosCore(f.z, f.p, 1, 'up'); for (let j = 0; j < 3 && sos.length; j++) sos[0][j] *= f.k;
  const { b, a } = zpk2tf(f);
  info.method = { butter: 'Butterworth', cheby1: 'Chebyshev type I', cheby2: 'Chebyshev type II', ellip: 'Elliptic' }[m];
  return makeFilter(b, a, sos, info);
}

// ------------------------------------------------------------ methods
function applyFilter(d, x, zero) {
  return fromColumns(columnsOf(x).cols.map((c) => {
    if (zero) { if (d._sos) { let y = c; for (const r of d._sos) y = filtfiltCore(r.slice(0, 3), r.slice(3, 6), y); return y; } return filtfiltCore(d._b, d._a, c); }
    if (d._sos) { let y = c; for (const r of d._sos) y = kfilter(r.slice(0, 3), r.slice(3, 6), y).y; return y; }
    return kfilter(d._b, d._a, c).y;
  }), columnsOf(x).isRow);
}
const rts = (p) => { const t = p.slice(); while (t.length > 1 && t[0] === 0) t.shift(); return t.length > 1 ? kroots(t) : { re: [], im: [] }; };
function filtord(b, a) { const tb = b.slice(), ta = a.slice(); while (tb.length > 1 && tb[tb.length - 1] === 0) tb.pop(); while (ta.length > 1 && ta[ta.length - 1] === 0) ta.pop(); return Math.max(tb.length, ta.length) - 1; }
function isLinPhase(b, a) {
  if (a.length > 1 && a.slice(1).some((x) => x !== 0)) return false;
  const n = b.length, tol = 1e-10 * Math.max(...b.map(Math.abs));
  let sym = true, anti = true; for (let i = 0; i < n; i++) { if (Math.abs(b[i] - b[n - 1 - i]) > tol) sym = false; if (Math.abs(b[i] + b[n - 1 - i]) > tol) anti = false; }
  return sym || anti;
}
const allIn = (r, inside) => r.re.every((x, i) => { const m = Math.hypot(x, r.im[i]); return inside ? m <= 1 + 1e-10 : m >= 1 - 1e-10; });
function baArgs(args) { if (isDF(args[0])) return [args[0]._b, args[0]._a]; return [Array.from(F(args[0])), args.length > 1 ? Array.from(F(args[1])) : [1]]; }

function display(d, name) {
  const p = d.props; const t = (v) => toStr(v);
  let s = `${name} = \n  digitalFilter with properties:\n\n`;
  const c = p.Coefficients; const cm = M(c);
  s += `    Coefficients: [${cm.m}x${cm.n} double]\n\n  Specifications:\n`;
  s += `    FrequencyResponse: '${t(p.FrequencyResponse)}'\n      ImpulseResponse: '${t(p.ImpulseResponse)}'\n           SampleRate: ${fmtShort(toNum(p.SampleRate))}\n`;
  for (const k of Object.keys(p)) if (!['FilterStructure', 'Coefficients', 'SampleRate', 'FrequencyResponse', 'ImpulseResponse', 'DesignMethod'].includes(k)) s += `${k.padStart(21)}: ${isText(p[k]) ? `'${t(p[k])}'` : fmtShort(toNum(p[k]))}\n`;
  s += `         DesignMethod: '${t(p.DesignMethod)}'\n`;
  return s;
}

const methods = {
  filter(args) { const d = needDF(args, 'filter'); return applyFilter(d, args[1], false); },
  filtfilt(args) { const d = needDF(args, 'filtfilt'); return applyFilter(d, args[1], true); },
  freqz(args) { return spec.freqz(args); },
  impz(args) { return spec.impz(args); },
  stepz(args) { return spec.stepz(args); },
  grpdelay(args) { return spec.grpdelay(args); },
  phasez(args) { return spec.phasez(args); },
  tf(args) { const d = needDF(args, 'tf'); return [row(d._b), row(d._a)]; },
  zpk(args) { const d = needDF(args, 'zpk'); const z = rts(d._b), p = rts(d._a); const cc = (r) => ({ cls: 'double', dims: [r.re.length, r.re.length ? 1 : 0], re: Float64Array.from(r.re), im: r.im.some((x) => x) ? Float64Array.from(r.im) : null }); const fb = d._b.find((x) => x !== 0) || 0; return [cc(z), cc(p), num(fb / d._a[0])]; },
  ss(args) { const d = needDF(args, 'ss'); return ssOf(d._b, d._a); },
  isstable(args) { const d = needDF(args, 'isstable'); const r = rts(d._a); return bool(r.re.every((x, i) => Math.hypot(x, r.im[i]) < 1)); },
  isfir(args) { const d = needDF(args, 'isfir'); return bool(d._a.length === 1 || d._a.slice(1).every((x) => x === 0)); },
  islinphase(args) { const d = needDF(args, 'islinphase'); return bool(isLinPhase(d._b, d._a)); },
  filtord(args) { const d = needDF(args, 'filtord'); return num(filtord(d._b, d._a)); },
  info(args) { const d = needDF(args, 'info'); return str(display(d, 'd').replace(/^d = \n/, '')); },
  double(args) { const d = needDF(args, 'double'); return d.props.Coefficients; },
};
function ssOf(b, a) {
  const L = Math.max(b.length, a.length); const bb = b.slice(), aa = a.slice(); while (bb.length < L) bb.push(0); while (aa.length < L) aa.push(0);
  const a0 = aa[0]; const an = aa.map((x) => x / a0), bn = bb.map((x) => x / a0); const n = L - 1;
  const A = Array.from({ length: n }, () => new Array(n).fill(0)); for (let j = 0; j < n; j++) A[0][j] = -an[j + 1]; for (let i = 1; i < n; i++) A[i][i - 1] = 1;
  const B = Array.from({ length: n }, (_, i) => [i === 0 ? 1 : 0]); const C = [Array.from({ length: n }, (_, j) => bn[j + 1] - bn[0] * an[j + 1])];
  const m = (r) => (r.length && r[0].length ? fromRows(r) : { cls: 'double', dims: [r.length, 0], re: new Float64Array(0), im: null });
  return [m(A), m(B), m(C), num(bn[0])];
}

export const classes = {
  digitalFilter: {
    props: ['FilterStructure', 'Coefficients', 'SampleRate', 'FrequencyResponse', 'ImpulseResponse', 'DesignMethod'],
    construct() { throw E('digitalFilter:construct', 'Use designfilt to create a digitalFilter.'); },
    methods,
    display(obj, name) { return display(obj, name); },
  },
};

export const builtins = {
  designfilt: designfiltImpl,
  filtord(args) { const [b, a] = baArgs(args); return num(filtord(b, a)); },
  isfir(args) { const [, a] = baArgs(args); return bool(a.length === 1 || a.slice(1).every((x) => x === 0)); },
  islinphase(args) { const [b, a] = baArgs(args); return bool(isLinPhase(b, a)); },
  isminphase(args) { const [b, a] = baArgs(args); return bool(allIn(rts(b), true) && allIn(rts(a), true)); },
  ismaxphase(args) { const [b, a] = baArgs(args); return bool(allIn(rts(b), false) && allIn(rts(a), true)); },
};

export const help = {
  designfilt: H("Designs a digitalFilter from a response type and specifications (e.g. 'lowpassiir', 'FilterOrder', 4, 'HalfPowerFrequency', 0.3).", "응답 형식과 사양으로 digitalFilter 설계 (예: 'lowpassiir', 'FilterOrder', 4, 'HalfPowerFrequency', 0.3).", ["d = designfilt('lowpassfir', 'FilterOrder', n, 'CutoffFrequency', fc)", "d = designfilt('lowpassiir', 'FilterOrder', n, 'HalfPowerFrequency', f3db, 'SampleRate', fs)", "d = designfilt('bandpassfir', 'FilterOrder', n, 'CutoffFrequency1', f1, 'CutoffFrequency2', f2)", "d = designfilt('highpassiir', 'PassbandFrequency', fp, 'StopbandFrequency', fst, 'PassbandRipple', rp, 'StopbandAttenuation', as)", 'y = filter(d, x)', '[h, w] = freqz(d)']),
  filtord: H('Filter order.', '필터 차수.', ['n = filtord(b, a)', 'n = filtord(d)']),
  isfir: H('True for an FIR filter.', 'FIR 필터면 참.', ['tf = isfir(b, a)', 'tf = isfir(d)']),
  islinphase: H('True for a linear-phase filter.', '선형 위상 필터면 참.', ['tf = islinphase(b, a)']),
  isminphase: H('True for a minimum-phase filter.', '최소 위상 필터면 참.', ['tf = isminphase(b, a)']),
  ismaxphase: H('True for a maximum-phase filter.', '최대 위상 필터면 참.', ['tf = ismaxphase(b, a)']),
};
void sosToTf; void matText; void isEmptyV;
