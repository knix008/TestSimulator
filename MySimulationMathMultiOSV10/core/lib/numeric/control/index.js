// control submodule of the numerics area: LTI model classes (tf, ss, zpk,
// frd, pid), interconnection, time and frequency responses, stability
// margins, discretization, and state-space design (lqr, kalman, place ...).
// Also the shared model conversions tf2zp zp2tf tf2ss ss2tf zp2ss ss2zp.
import * as K from '../_kernels.js';
import {
  E, F, M, H, nv, num, str, bool, cell, structOf, struct, isText, toStr, toNum, isCell, isStruct, isObject, tensor, cplx, tryCall, isNum, sfield, fmtG, stringArray, prod,
} from '../_util.js';
import {
  mkTF, mkZPK, mkSS, mkFRD, gainTF, toTF, toSS, toZPK, convertTo, explicitSS, fixMeta, trimLead, padTo, isZeroPoly, zerosM, eye, T, addM,
  lyapC, lyapD, sylvester, sylvesterD, careSolve, dareSolve, symmetrize, rootsOf, poles as polesOf, tzeros, freqResp, evalAt, hasDelay,
} from './lti.js';
import * as ops from './ops.js';
import {
  isLTI, makeObj, getModel, ltiArg, outObj, applyNV, rowsV, matV, colV, rowV, ccol, cvec, PROPS, ltiSubsref, ltiSubsasgn, displayText, pidModel, pidTF, propName,
} from './cls.js';
import {
  stdResponse, initialResponse, lsimResponse, dcgain as dcgainM, isStable, autoFreq, freqArg, phaseDeg, allMargins, margin as marginM, bandwidth as bandwidthM, dampData, rlocusData, timeGrid,
} from './analysis.js';
import {
  c2d as c2dM, d2c as d2cM, d2d as d2dM, ctrbM, obsvM, gram as gramM, balreal as balrealM, modred as modredM, minreal as minrealM, canon as canonM, ss2ss as ss2ssM,
  acker as ackerM, place as placeM, lqrDesign, kalmanDesign, padeCoef, padeModel, connectByName, connectByIndex, pidtune as pidtuneM,
} from './design.js';

// ------------------------------------------------------------ helpers
const isModelArg = (v) => isLTI(v) || (v && isObject(v) && v.cls === 'digitalFilter');
const typeOfObj = (v) => (isLTI(v) ? (v.cls === 'pid' ? 'tf' : v.cls) : 'tf');
const lowerText = (v) => (isText(v) ? toStr(v).toLowerCase() : null);
/** 3-D array Value [d0, d1, d2] from a getter (column-major). */
function arr3(d0, d1, d2, get, getIm) {
  const n = d0 * d1 * d2; const re = new Float64Array(n); const im = getIm ? new Float64Array(n) : null;
  for (let k = 0; k < d2; k++) for (let j = 0; j < d1; j++) for (let i = 0; i < d0; i++) { const q = i + j * d0 + k * d0 * d1; re[q] = get(i, j, k); if (im) im[q] = getIm(i, j, k); }
  return cplx([d0, d1, d2], re, im);
}
const cmat = (rows, imRows) => { const m = rows.length, n = m ? rows[0].length : 0; const re = new Float64Array(m * n), im = new Float64Array(m * n); for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) { re[i + j * m] = rows[i][j]; im[i + j * m] = imRows ? imRows[i][j] : 0; } return cplx([m, n], re, imRows ? im : null); };
/** Leading model arguments (with optional plot-style strings) and the rest. */
function splitModels(args) {
  const models = []; let i = 0;
  while (i < args.length && isModelArg(args[i])) { models.push(args[i]); i++; if (i < args.length && isText(args[i]) && args.length > i + 1 && isModelArg(args[i + 1])) i++; else if (i < args.length && isText(args[i]) && /^[-:.rgbcmykw*o+xsd^v<>ph]{1,4}$/.test(toStr(args[i]))) i++; }
  return { models, rest: args.slice(i) };
}
function needModel(args, name) { if (!args.length || !isModelArg(args[0])) throw E(`${name}:noModel`, `${name} requires a dynamic system model as its first input.`); return ltiArg(args[0]); }
function plotOrError(ctx, name, calls) {
  // calls: [[fnName, args], ...]; the first must be a plotting call
  const r = tryCall(ctx, calls[0][0], calls[0][1], 0);
  if (r === null) throw E(`${name}:noGraphics`, `Plotting is not available here. Call ${name} with output arguments, e.g. [y, t] = ${name}(sys).`);
  for (const [fn, a] of calls.slice(1)) tryCall(ctx, fn, a, 0);
}
function timeSpec(rest) {
  for (const a of rest) {
    if (isNum(a)) { const v = Array.from(F(a)); if (v.length === 1) return { tspec: v[0] }; if (v.length > 1) return { tspec: v }; }
  }
  return { tspec: undefined };
}
function amplitude(rest) {
  for (const a of rest) if (isStruct(a) || (isObject(a) && a.props)) { const v = sfield(a, 'Amplitude') || sfield(a, 'StepAmplitude'); if (v) return toNum(v); }
  return 1;
}

// ------------------------------------------------------------ constructors
function cellPolys(v, what) {
  if (isCell(v)) { const [ny, nu] = v.dims; const r = []; for (let i = 0; i < ny; i++) { r.push([]); for (let j = 0; j < nu; j++) r[i].push(Array.from(F(v.data[i + j * ny]))); } return r; }
  if (isNum(v)) return [[Array.from(F(v))]];
  throw E('tf:badArg', `${what} must be a numeric row vector or a cell array of row vectors.`);
}
function splitNV(args) { let i = 0; while (i < args.length && !isText(args[i])) i++; return [args.slice(0, i), args.slice(i)]; }
function tfCtor(args) {
  if (!args.length) return makeObj(mkTF([], [], 0, {}));
  const a0 = args[0];
  if (isText(a0) && ['s', 'z', 'p', 'q', 'z^-1', 'q^-1'].includes(toStr(a0))) {
    const v = toStr(a0); let Ts = /^[zq]/.test(v) ? -1 : 0; let rest = args.slice(1);
    if (rest.length && isNum(rest[0])) { Ts = toNum(rest[0]); rest = rest.slice(1); }
    const m = v.endsWith('^-1') ? mkTF([[[0, 1]]], [[[1, 0]]], Ts, { Variable: v }) : mkTF([[[1, 0]]], [[[0, 1]]], Ts, { Variable: v });
    return makeObj(applyNV(m, rest));
  }
  if (isModelArg(a0)) { const m = ltiArg(a0); const [, nvs] = splitNV(args.slice(1)); return makeObj(applyNV(toTF(m), nvs.filter((x, i) => !(i === 0 && lowerText(x) === 'minimal')))); }
  const [pos, nvs] = splitNV(args);
  if (pos.length === 1) { const G = rowsV(pos[0]); const m = mkTF(G.map((r) => r.map((x) => [x])), G.map((r) => r.map(() => [1])), 0, {}); return makeObj(applyNV(m, nvs)); }
  let numP = cellPolys(pos[0], 'Numerator'), denP = cellPolys(pos[1], 'Denominator');
  if (denP.length === 1 && denP[0].length === 1 && (numP.length > 1 || numP[0].length > 1)) denP = numP.map((r) => r.map(() => denP[0][0]));
  if (numP.length !== denP.length || numP[0].length !== denP[0].length) throw E('tf:dims', 'Numerator and denominator cell arrays must have the same size.');
  let Ts = pos.length > 2 ? toNum(pos[2]) : 0;
  // Variable given among name/value pairs decides padding convention
  let variable = null; for (let i = 0; i + 1 < nvs.length; i += 2) if (toStr(nvs[i]).toLowerCase() === 'variable') variable = toStr(nvs[i + 1]);
  for (let i = 0; i + 1 < nvs.length; i += 2) if (toStr(nvs[i]).toLowerCase() === 'ts') Ts = toNum(nvs[i + 1]);
  if (!(Ts === 0 || Ts === -1 || Ts > 0)) throw E('tf:badTs', 'The sample time must be 0, -1 or a positive scalar.');
  const m = mkTF(numP, denP, Ts, { Variable: variable });
  for (let i = 0; i < m.ny; i++) for (let j = 0; j < m.nu; j++) if (isZeroPoly(m.den[i][j])) throw E('tf:zeroDen', 'Denominators must be nonzero.');
  return makeObj(applyNV(m, nvs.filter((_, i) => true)));
}
function ssCtor(args, descriptor = false) {
  if (!args.length) return makeObj(mkSS([], [], [], [], 0, {}));
  const a0 = args[0];
  if (isModelArg(a0)) {
    let m = toSS(ltiArg(a0));
    const rest = args.slice(1);
    if (rest.length && lowerText(rest[0]) === 'minimal') { m = minrealM(m).model; rest.shift(); }
    else if (rest.length && lowerText(rest[0]) === 'explicit') { m = explicitSS(m); rest.shift(); }
    return makeObj(applyNV(m, rest));
  }
  const [pos, nvs] = splitNV(args);
  if (pos.length === 1) { const D = rowsV(pos[0]); return makeObj(applyNV(mkSS([], [], zerosM(D.length, 0), D, 0, {}, null, [D.length, D.length ? D[0].length : 0]), nvs)); }
  const A = rowsV(pos[0]); const n = A.length; if (n && A[0].length !== n) throw E('ss:badA', 'A must be a square matrix.');
  const Bv = pos[1], Cv = pos[2], Dv = pos[3];
  const nu = Bv && prod(Bv.dims) ? Bv.dims[1] : (Dv && prod(Dv.dims) ? Dv.dims[1] : 0);
  const ny = Cv && prod(Cv.dims) ? Cv.dims[0] : (Dv && prod(Dv.dims) ? Dv.dims[0] : 0);
  const B = Bv && prod(Bv.dims) ? rowsV(Bv) : zerosM(n, nu); const C = Cv && prod(Cv.dims) ? rowsV(Cv) : zerosM(ny, n);
  let D;
  if (!Dv || !prod(Dv.dims)) D = zerosM(ny, nu);
  else { const d = rowsV(Dv); D = d.length === 1 && d[0].length === 1 && (ny !== 1 || nu !== 1) ? (d[0][0] === 0 ? zerosM(ny, nu) : (() => { throw E('ss:badD', `D must be ${ny}-by-${nu}.`); })()) : d; }
  if (B.length !== n) throw E('ss:badB', 'B must have as many rows as A.');
  if (C.length && C[0].length !== n) throw E('ss:badC', 'C must have as many columns as A.');
  if (D.length !== ny || (D.length && D[0].length !== nu)) throw E('ss:badD', `D must be ${ny}-by-${nu}.`);
  let k = 4; let Em = null;
  if (descriptor) { Em = pos[4] && prod(pos[4].dims) ? rowsV(pos[4]) : null; k = 5; }
  const Ts = pos.length > k ? toNum(pos[k]) : 0;
  if (!(Ts === 0 || Ts === -1 || Ts > 0)) throw E('ss:badTs', 'The sample time must be 0, -1 or a positive scalar.');
  return makeObj(applyNV(mkSS(A, B, C, D, Ts, {}, Em, [ny, nu]), nvs));
}
function rootsCells(v) {
  if (isCell(v)) { const [ny, nu] = v.dims; const r = []; for (let i = 0; i < ny; i++) { r.push([]); for (let j = 0; j < nu; j++) r[i].push(cvec(v.data[i + j * ny])); } return r; }
  return [[cvec(v)]];
}
function zpkCtor(args) {
  if (!args.length) return makeObj(mkZPK([], [], [], 0, {}));
  const a0 = args[0];
  if (isText(a0) && ['s', 'z', 'p', 'q'].includes(toStr(a0))) {
    const v = toStr(a0); let Ts = /^[zq]/.test(v) ? -1 : 0; let rest = args.slice(1);
    if (rest.length && isNum(rest[0])) { Ts = toNum(rest[0]); rest = rest.slice(1); }
    return makeObj(applyNV(mkZPK([[{ re: [0], im: [0] }]], [[{ re: [], im: [] }]], [[1]], Ts, { Variable: v }), rest));
  }
  if (isModelArg(a0)) return makeObj(applyNV(toZPK(ltiArg(a0)), args.slice(1)));
  const [pos, nvs] = splitNV(args);
  if (pos.length === 1) { const G = rowsV(pos[0]); return makeObj(applyNV(mkZPK(G.map((r) => r.map(() => ({ re: [], im: [] }))), G.map((r) => r.map(() => ({ re: [], im: [] }))), G, 0, {}), nvs)); }
  const z = rootsCells(pos[0]), p = rootsCells(pos[1]); const k = rowsV(pos[2]);
  const ny = k.length, nu = ny ? k[0].length : 0;
  const fit = (x) => (x.length === ny && x[0].length === nu ? x : (x.length === 1 && x[0].length === 1 ? Array.from({ length: ny }, () => Array.from({ length: nu }, () => x[0][0])) : (() => { throw E('zpk:dims', 'Z, P and K must have compatible sizes.'); })()));
  const Ts = pos.length > 3 ? toNum(pos[3]) : 0;
  return makeObj(applyNV(mkZPK(fit(z), fit(p), k, Ts, {}), nvs));
}
function frdCtor(args) {
  if (args.length && isModelArg(args[0])) {
    const m = ltiArg(args[0]); const w = Array.from(F(args[1]));
    const Hh = freqResp(m, w); return makeObj(applyNV(mkFRD(Hh.map((r) => r.map((h) => ({ re: Array.from(h.re), im: Array.from(h.im) }))), w, m.Ts, { ...m.meta }), args.slice(2)));
  }
  const [pos, nvs] = splitNV(args);
  if (pos.length < 2) throw E('frd:args', 'frd requires response data and a frequency vector.');
  const R = pos[0]; const w = Array.from(F(pos[1])); const nf = w.length; const t = M(R);
  let ny, nu;
  if (R.dims.length === 3) { ny = R.dims[0]; nu = R.dims[1]; } else if (prod(R.dims) === nf) { ny = 1; nu = 1; } else throw E('frd:dims', 'The response data must have one value per frequency (ny-by-nu-by-nf for MIMO).');
  const Rr = []; for (let i = 0; i < ny; i++) { Rr.push([]); for (let j = 0; j < nu; j++) { const re = [], im = []; for (let k = 0; k < nf; k++) { const q = ny * nu === 1 ? k : i + j * ny + k * ny * nu; re.push(t.a[q]); im.push(t.im ? t.im[q] : 0); } Rr[i].push({ re, im }); } }
  const Ts = pos.length > 2 ? toNum(pos[2]) : 0;
  const m = mkFRD(Rr, w, Ts, {});
  for (let i = 0; i + 1 < nvs.length; i += 2) if (toStr(nvs[i]).toLowerCase() === 'frequencyunit') m.FrequencyUnit = toStr(nvs[i + 1]);
  return makeObj(applyNV(m, nvs.filter((_, i) => !(i % 2 === 0 && toStr(nvs[i]).toLowerCase() === 'frequencyunit') && !(i % 2 === 1 && toStr(nvs[i - 1]).toLowerCase() === 'frequencyunit'))));
}
function pidCtor(args) {
  const [pos, nvs] = splitNV(args);
  const g = (k, d = 0) => (pos[k] && prod(pos[k].dims) ? toNum(pos[k]) : d);
  const Kp = pos.length ? g(0, 1) : 1, Ki = g(1), Kd = g(2), Tf = g(3), Ts = g(4);
  if (Tf < 0) throw E('pid:badTf', 'Tf must be nonnegative.');
  let m = pidModel(Kp, Ki, Kd, Tf, Ts);
  const o = nv(nvs, 0);
  if (o.iformula) m.IFormula = toStr(o.iformula); if (o.dformula) m.DFormula = toStr(o.dformula);
  if (o.ts) { m.Ts = toNum(o.ts); if (m.Ts && !m.IFormula) { m.IFormula = 'ForwardEuler'; m.DFormula = 'ForwardEuler'; } }
  const rest = []; for (let i = 0; i + 1 < nvs.length; i += 2) { const k = toStr(nvs[i]).toLowerCase(); if (!['iformula', 'dformula', 'ts'].includes(k)) rest.push(nvs[i], nvs[i + 1]); }
  if (rest.length) { const obj = makeObj(m); let o2 = obj; for (let i = 0; i < rest.length; i += 2) o2 = ltiSubsasgn(o2, [{ type: '.', subs: toStr(rest[i]) }], rest[i + 1]); return o2; }
  return makeObj(m);
}

// ------------------------------------------------------------ binary operator plumbing
function bin(f) { return (args) => { const a = ltiArg(args[0], 'Left operand'), b = ltiArg(args[1], 'Right operand'); return outModel(f(a, b)); }; }
function outModel(m) { if (m.meta && m.meta.isStatic && m.type === 'tf') { m = { ...m, meta: { ...m.meta } }; } return makeObj(m); }

// ------------------------------------------------------------ responses (builtins)
function respBuiltin(kind) {
  return (args, nargout, ctx) => {
    const { models, rest } = splitModels(args);
    if (!models.length) throw E(`${kind}:noModel`, `${kind} requires a dynamic system model.`);
    const { tspec } = timeSpec(rest); const amp = amplitude(rest);
    if (nargout === 0) {
      const pa = [];
      for (const o of models) { const m = ltiArg(o); const r = stdResponse(m, tspec, kind, amp, ctx); for (let j = 0; j < r.Y.length; j++) { pa.push(colV(r.t), matV(r.Y[j], r.nt, r.ny)); } }
      plotOrError(ctx, kind, [['plot', pa], ['title', [str(kind === 'step' ? 'Step Response' : 'Impulse Response')]], ['xlabel', [str('Time (seconds)')]], ['ylabel', [str('Amplitude')]], ['grid', [str('on')]]]);
      return undefined;
    }
    const m = ltiArg(models[0]); const r = stdResponse(m, tspec, kind, amp, ctx);
    const y = arr3(r.nt, r.ny, r.Y.length, (k, i, j) => r.Y[j][k][i]);
    const out = [y, colV(r.t)];
    if (nargout > 2) out.push(arr3(r.nt, r.nx, r.Y.length, (k, i, j) => r.X[j][k][i]));
    return out;
  };
}
function initialB(args, nargout, ctx) {
  const { models, rest } = splitModels(args);
  if (!models.length) throw E('initial:noModel', 'initial requires a state-space model.');
  const m = ltiArg(models[0]); if (m.type !== 'ss') throw E('initial:notSS', 'initial requires a state-space (ss) model.');
  const x0 = Array.from(F(rest[0])); const t = rest[1] ? Array.from(F(rest[1])) : undefined;
  const r = initialResponse(m, x0, t && t.length === 1 ? t[0] : t, ctx);
  if (nargout === 0) { plotOrError(ctx, 'initial', [['plot', [colV(r.t), matV(r.Y, r.t.length, m.ny)]], ['title', [str('Response to Initial Conditions')]], ['xlabel', [str('Time (seconds)')]], ['ylabel', [str('Amplitude')]]]); return undefined; }
  return [matV(r.Y, r.t.length, m.ny), colV(r.t), matV(r.X, r.t.length, m.n)];
}
function lsimB(args, nargout, ctx) {
  const { models, rest } = splitModels(args);
  if (!models.length) throw E('lsim:noModel', 'lsim requires a dynamic system model.');
  const m = ltiArg(models[0]);
  let U = rowsV(rest[0]);
  if (U.length === 1 && m.nu === 1 && U[0].length > 1) U = U[0].map((x) => [x]);
  let t;
  if (rest[1] && prod(rest[1].dims)) t = Array.from(F(rest[1]));
  else { if (m.Ts === 0) throw E('lsim:noTime', 'A time vector is required for continuous-time models.'); const T0 = m.Ts > 0 ? m.Ts : 1; t = U.map((_, k) => k * T0); }
  const s = explicitSS(toSS(m));
  let x0 = null, method = 'foh';
  for (const a of rest.slice(2)) { if (isText(a)) method = toStr(a).toLowerCase(); else if (prod(a.dims)) x0 = Array.from(F(a)); }
  if (x0 && x0.length !== s.n) throw E('lsim:badX0', `The initial state must have ${s.n} elements.`);
  const r = lsimResponse(m, U, t, x0, method === 'zoh' ? 'zoh' : (m.Ts === 0 ? method : 'zoh'), ctx);
  if (nargout === 0) { plotOrError(ctx, 'lsim', [['plot', [colV(t), matV(r.Y, t.length, m.ny), colV(t), matV(U, t.length, m.nu)]], ['title', [str('Linear Simulation Results')]], ['xlabel', [str('Time (seconds)')]], ['ylabel', [str('Amplitude')]]]); return undefined; }
  return [matV(r.Y, t.length, m.ny), colV(t), matV(r.X, t.length, s.n)];
}
function stepinfoCore(y, t, yf, opts) {
  const n = y.length; const y0 = y[0]; const thr = opts.st;
  const [rl, rh] = opts.rt;
  if (!Number.isFinite(yf)) return { RiseTime: NaN, TransientTime: NaN, SettlingTime: NaN, SettlingMin: NaN, SettlingMax: NaN, Overshoot: NaN, Undershoot: NaN, Peak: Infinity, PeakTime: Infinity };
  const d = yf - y0;
  const cross = (level) => { for (let k = 0; k < n; k++) { const v = (y[k] - y0) / d; if (v >= level) { if (k === 0) return t[0]; const v0 = (y[k - 1] - y0) / d; return t[k - 1] + (t[k] - t[k - 1]) * (level - v0) / (v - v0); } } return NaN; };
  const tl = cross(rl), th = cross(rh); const rise = th - tl;
  const tol = thr * Math.abs(d);
  let last = -1; for (let k = n - 1; k >= 0; k--) if (Math.abs(y[k] - yf) > tol) { last = k; break; }
  let settle;
  if (last < 0) settle = t[0];
  else if (last === n - 1) settle = NaN;
  else { const e0 = Math.abs(y[last] - yf), e1 = Math.abs(y[last + 1] - yf); settle = t[last] + (t[last + 1] - t[last]) * (e0 - tol) / (e0 - e1 || 1); }
  let ymin = Infinity, ymax = -Infinity; for (let k = 0; k < n; k++) if (!(t[k] < th)) { ymin = Math.min(ymin, y[k]); ymax = Math.max(ymax, y[k]); }
  let os = 0, us = 0, pk = 0, pt = t[0];
  for (let k = 0; k < n; k++) { const v = (y[k] - y0) / d; os = Math.max(os, 100 * (v - 1) * Math.sign(d) * Math.sign(d)); us = Math.max(us, -100 * v); if (Math.abs(y[k]) > pk) { pk = Math.abs(y[k]); pt = t[k]; } }
  if (d === 0) { os = 0; us = 0; }
  return { RiseTime: rise, TransientTime: settle, SettlingTime: settle, SettlingMin: ymin, SettlingMax: ymax, Overshoot: Math.max(0, os), Undershoot: Math.max(0, us), Peak: pk, PeakTime: pt };
}
function stepinfoB(args, nargout, ctx) {
  let i = 0; const opts = { st: 0.02, rt: [0.1, 0.9] };
  let infos;
  const tailNV = (k) => { const o = nv(args, k, ['SettlingTimeThreshold', 'RiseTimeLimits', 'TransientTimeThreshold']); if (o.settlingtimethreshold) opts.st = toNum(o.settlingtimethreshold); if (o.risetimelimits) opts.rt = Array.from(F(o.risetimelimits)); };
  if (isModelArg(args[0])) {
    const m = ltiArg(args[0]); i = 1; tailNV(1);
    const a = stdResponse(m, undefined, 'step', 1, ctx);
    // refine the grid
    const tf = a.t[a.t.length - 1]; const fine = stdResponse(m, m.Ts === 0 ? Array.from({ length: 20001 }, (_, k) => k * tf / 20000) : undefined, 'step', 1, ctx);
    const G = dcgainM(m);
    infos = []; for (let ii = 0; ii < m.ny; ii++) { infos.push([]); for (let j = 0; j < m.nu; j++) infos[ii].push(stepinfoCore(fine.Y[j].map((r) => r[ii]), fine.t, G[ii][j], opts)); }
  } else {
    const y = rowsV(args[0]); let t, yf;
    const col = y.length === 1 ? y[0] : y.map((r) => r[0]);
    let k = 1;
    if (args[1] && isNum(args[1])) { t = Array.from(F(args[1])); k = 2; } else t = col.map((_, q) => q);
    if (args[k] && isNum(args[k])) { yf = toNum(args[k]); k++; } else yf = col[col.length - 1];
    tailNV(k);
    infos = [[stepinfoCore(col, t, yf, opts)]];
  }
  const fields = ['RiseTime', 'TransientTime', 'SettlingTime', 'SettlingMin', 'SettlingMax', 'Overshoot', 'Undershoot', 'Peak', 'PeakTime'];
  const ny = infos.length, nu = infos[0].length; const data = [];
  for (let j = 0; j < nu; j++) for (let q = 0; q < ny; q++) { const r = Object.create(null); for (const f of fields) r[f] = num(infos[q][j][f]); data.push(r); }
  return struct([ny, nu], fields, data);
}

// ------------------------------------------------------------ frequency builtins
function wArg(m, v) {
  if (v == null) return freqArg(m, null);
  if (isCell(v)) { const a = toNum(v.data[0]), b = toNum(v.data[1]); return freqArg(m, { range: [a, b] }); }
  if (isNum(v) && prod(v.dims)) return Array.from(F(v));
  return freqArg(m, null);
}
function bodeData(m, w) {
  const Hh = freqResp(m, w);
  const mag = (i, j, k) => Math.hypot(Hh[i][j].re[k], Hh[i][j].im[k]);
  const ph = []; for (let i = 0; i < m.ny; i++) { ph.push([]); for (let j = 0; j < m.nu; j++) ph[i].push(phaseDeg(Hh[i][j].re, Hh[i][j].im, m, i, j)); }
  return { Hh, mag, ph };
}
function bodeB(args, nargout, ctx) {
  const { models, rest } = splitModels(args); if (!models.length) throw E('bode:noModel', 'bode requires a dynamic system model.');
  if (nargout === 0) {
    const pm = [], pp = [];
    for (const o of models) { const m = ltiArg(o); const w = wArg(m, rest[0]); const d = bodeData(m, w); for (let i = 0; i < m.ny; i++) for (let j = 0; j < m.nu; j++) { pm.push(colV(w), colV(w.map((_, k) => 20 * Math.log10(d.mag(i, j, k))))); pp.push(colV(w), colV(d.ph[i][j])); } }
    if (tryCall(ctx, 'subplot', [num(2), num(1), num(1)], 0) === null) plotOrError(ctx, 'bode', [['semilogx', pm]]);
    else { plotOrError(ctx, 'bode', [['semilogx', pm], ['ylabel', [str('Magnitude (dB)')]], ['title', [str('Bode Diagram')]], ['grid', [str('on')]]]); tryCall(ctx, 'subplot', [num(2), num(1), num(2)], 0); tryCall(ctx, 'semilogx', pp, 0); tryCall(ctx, 'ylabel', [str('Phase (deg)')], 0); tryCall(ctx, 'xlabel', [str('Frequency (rad/s)')], 0); tryCall(ctx, 'grid', [str('on')], 0); }
    return undefined;
  }
  const m = ltiArg(models[0]); const w = wArg(m, rest[0]); const d = bodeData(m, w);
  const out = [arr3(m.ny, m.nu, w.length, d.mag), arr3(m.ny, m.nu, w.length, (i, j, k) => d.ph[i][j][k]), colV(w)];
  if (nargout > 3) out.push(arr3(m.ny, m.nu, w.length, () => 0), arr3(m.ny, m.nu, w.length, () => 0));
  return out;
}
function nyquistB(args, nargout, ctx) {
  const { models, rest } = splitModels(args); if (!models.length) throw E('nyquist:noModel', 'nyquist requires a dynamic system model.');
  const m = ltiArg(models[0]); const w = wArg(m, rest[0]); const Hh = freqResp(m, w);
  if (nargout === 0) { const pa = []; for (let i = 0; i < m.ny; i++) for (let j = 0; j < m.nu; j++) { pa.push(colV([...Hh[i][j].re]), colV([...Hh[i][j].im]), colV([...Hh[i][j].re]), colV([...Hh[i][j].im].map((x) => -x))); } plotOrError(ctx, 'nyquist', [['plot', pa], ['title', [str('Nyquist Diagram')]], ['xlabel', [str('Real Axis')]], ['ylabel', [str('Imaginary Axis')]]]); return undefined; }
  return [arr3(m.ny, m.nu, w.length, (i, j, k) => Hh[i][j].re[k]), arr3(m.ny, m.nu, w.length, (i, j, k) => Hh[i][j].im[k]), colV(w)];
}
function nicholsB(args, nargout, ctx) {
  const { models, rest } = splitModels(args); if (!models.length) throw E('nichols:noModel', 'nichols requires a dynamic system model.');
  const m = ltiArg(models[0]); const w = wArg(m, rest[0]); const d = bodeData(m, w);
  if (nargout === 0) { const pa = []; for (let i = 0; i < m.ny; i++) for (let j = 0; j < m.nu; j++) pa.push(colV(d.ph[i][j]), colV(w.map((_, k) => 20 * Math.log10(d.mag(i, j, k))))); plotOrError(ctx, 'nichols', [['plot', pa], ['title', [str('Nichols Chart')]], ['xlabel', [str('Open-Loop Phase (deg)')]], ['ylabel', [str('Open-Loop Gain (dB)')]]]); return undefined; }
  return [arr3(m.ny, m.nu, w.length, d.mag), arr3(m.ny, m.nu, w.length, (i, j, k) => d.ph[i][j][k]), colV(w)];
}
function sigmaB(args, nargout, ctx) {
  const { models, rest } = splitModels(args); if (!models.length) throw E('sigma:noModel', 'sigma requires a dynamic system model.');
  const m = ltiArg(models[0]); const w = wArg(m, rest[0]); const Hh = freqResp(m, w); const r = Math.min(m.ny, m.nu);
  const sv = [];
  for (let k = 0; k < w.length; k++) {
    const Mr = Array.from({ length: 2 * m.ny }, () => new Array(2 * m.nu).fill(0));
    for (let i = 0; i < m.ny; i++) for (let j = 0; j < m.nu; j++) { const a = Hh[i][j].re[k], b = Hh[i][j].im[k]; Mr[i][j] = a; Mr[i][j + m.nu] = -b; Mr[i + m.ny][j] = b; Mr[i + m.ny][j + m.nu] = a; }
    const s = K.svd(Mr).s; sv.push(Array.from({ length: r }, (_, q) => s[2 * q]));
  }
  if (nargout === 0) { plotOrError(ctx, 'sigma', [['semilogx', [colV(w), matV(sv.map((x) => x.map((v) => 20 * Math.log10(v))), w.length, r)]], ['title', [str('Singular Values')]]]); return undefined; }
  return [matV(T(sv), r, w.length), colV(w)];
}
function freqrespB(args, nargout) {
  const m = needModel(args, 'freqresp'); const w = args[1] ? wArg(m, args[1]) : autoFreq(m);
  const Hh = freqResp(m, w);
  return [arr3(m.ny, m.nu, w.length, (i, j, k) => Hh[i][j].re[k], (i, j, k) => Hh[i][j].im[k]), colV(w)];
}
function evalfrB(args) {
  const m = needModel(args, 'evalfr'); const sv = cvec(args[1]);
  const Hh = evalAt(m, [sv.re[0]], [sv.im[0]]);
  return cmat(Hh.map((r) => r.map((h) => h.re[0])), Hh.map((r) => r.map((h) => h.im[0])));
}
function marginB(args, nargout, ctx) {
  let m;
  if (isModelArg(args[0])) m = ltiArg(args[0]);
  else {
    const mag = Array.from(F(args[0])), ph = Array.from(F(args[1])), w = Array.from(F(args[2]));
    m = mkFRD([[{ re: mag.map((g, k) => g * Math.cos(ph[k] * Math.PI / 180)), im: mag.map((g, k) => g * Math.sin(ph[k] * Math.PI / 180)) }]], w, 0, {});
  }
  const r = marginM(m);
  if (nargout === 0) {
    const txt = `Gm = ${fmtG(20 * Math.log10(r.Gm), 4)} dB (at ${fmtG(r.Wcg, 4)} rad/s), Pm = ${fmtG(r.Pm, 4)} deg (at ${fmtG(r.Wcp, 4)} rad/s)`;
    if (m.type !== 'frd') { try { bodeB([args[0]], 0, ctx); tryCall(ctx, 'title', [str(txt)], 0); return undefined; } catch (e) { if (!/noGraphics/.test(e.identifier || '')) throw e; } }
    ctx.out(txt + '\n'); return undefined;
  }
  return [num(r.Gm), num(r.Pm), num(r.Wcg), num(r.Wcp)];
}
function allmarginB(args) {
  const m = needModel(args, 'allmargin'); const a = allMargins(m);
  const rv = (x) => (x.length ? rowV(x) : tensor('double', [1, 0]));
  return structOf({ GainMargin: rv(a.gm), GMFrequency: rv(a.gmf), PhaseMargin: rv(a.pm), PMFrequency: rv(a.pmf), DelayMargin: rv(a.dm), DMFrequency: rv(a.dmf), Stable: a.stable == null ? num(NaN) : bool(a.stable) });
}

// ------------------------------------------------------------ data extraction
function tfdataB(args, nargout) {
  const m = toTF(needModel(args, 'tfdata')); const v = lowerText(args[1]) === 'v';
  if (v && m.ny * m.nu !== 1) throw E('tfdata:notSISO', "The 'v' option requires a SISO model.");
  const nv_ = (X) => (v ? rowV(X[0][0]) : cell([m.ny, m.nu], (() => { const r = []; for (let j = 0; j < m.nu; j++) for (let i = 0; i < m.ny; i++) r.push(rowV(X[i][j])); return r; })()));
  return [nv_(m.num), nv_(m.den), num(m.Ts)];
}
function zpkdataB(args) {
  const m = toZPK(needModel(args, 'zpkdata')); const v = lowerText(args[1]) === 'v';
  if (v && m.ny * m.nu !== 1) throw E('zpkdata:notSISO', "The 'v' option requires a SISO model.");
  const cv = (X) => (v ? ccol(X[0][0].re, X[0][0].im) : cell([m.ny, m.nu], (() => { const r = []; for (let j = 0; j < m.nu; j++) for (let i = 0; i < m.ny; i++) r.push(ccol(X[i][j].re, X[i][j].im)); return r; })()));
  return [cv(m.z), cv(m.p), matV(m.k, m.ny, m.nu), num(m.Ts)];
}
function ssdataB(args) { const s = explicitSS(toSS(needModel(args, 'ssdata'))); return [matV(s.A, s.n, s.n), matV(s.B, s.n, s.nu), matV(s.C, s.ny, s.n), matV(s.D, s.ny, s.nu), num(s.Ts)]; }
function frdataB(args) {
  const m = needModel(args, 'frdata'); if (m.type !== 'frd') throw E('frdata:notFRD', 'frdata requires an frd model.');
  const nf = m.freq.length; const v = lowerText(args[1]) === 'v' && m.ny * m.nu === 1;
  const R = v ? cplx([nf, 1], m.R[0][0].re, m.R[0][0].im) : arr3(m.ny, m.nu, nf, (i, j, k) => m.R[i][j].re[k], (i, j, k) => m.R[i][j].im[k]);
  return [R, colV(m.freq), num(m.Ts)];
}

// ------------------------------------------------------------ poles, zeros, gains
function poleB(args) { const p = polesOf(needModel(args, 'pole')); return ccol(p.re, p.im); }
function zeroB(args, nargout) {
  const m = needModel(args, 'zero'); const z = tzeros(m); const out = [ccol(z.re, z.im)];
  if (nargout > 1) { const zz = toZPK(m); out.push(num(m.ny * m.nu === 1 ? zz.k[0][0] : NaN)); }
  return out;
}
function dampB(args, nargout, ctx) {
  const m = needModel(args, 'damp'); const rows = dampData(m);
  if (nargout === 0) {
    const unit = m.meta.TimeUnit || 'seconds';
    const lines = [' ', `         Pole              Damping       Frequency      Time Constant  `, `                                    (rad/${unit.replace(/s$/, '')})     (${unit})    `, ' '];
    for (const r of rows) lines.push(`  ${(fmtG(r.re, 3) + (r.im ? (r.im < 0 ? ' - ' : ' + ') + fmtG(Math.abs(r.im), 3) + 'i' : '')).padStart(20)}   ${fmtG(r.z, 3).padStart(10)}   ${fmtG(r.wn, 3).padStart(12)}   ${fmtG(r.tau, 3).padStart(12)}`);
    ctx.out(lines.join('\n') + '\n \n'); return undefined;
  }
  return [colV(rows.map((r) => r.wn)), colV(rows.map((r) => r.z)), ccol(rows.map((r) => r.re), rows.map((r) => r.im))];
}
function pzmapB(args, nargout, ctx) {
  const m = needModel(args, 'pzmap'); const p = polesOf(m); const z = tzeros(m);
  if (nargout === 0) { plotOrError(ctx, 'pzmap', [['plot', [colV(p.re), colV(p.im), str('x'), colV(z.re), colV(z.im), str('o')]], ['title', [str('Pole-Zero Map')]], ['xlabel', [str('Real Axis')]], ['ylabel', [str('Imaginary Axis')]]]); return undefined; }
  return [ccol(p.re, p.im), ccol(z.re, z.im)];
}
function rlocusB(args, nargout, ctx) {
  const m = needModel(args, 'rlocus'); const k = args[1] && isNum(args[1]) ? Array.from(F(args[1])) : null;
  const r = rlocusData(m, k); const np = r.r[0] ? r.r[0].length : 0; const nk = r.k.length;
  const re = [], im = []; for (let i = 0; i < np; i++) { re.push(r.r.map((c) => c[i][0])); im.push(r.r.map((c) => c[i][1])); }
  if (nargout === 0) { plotOrError(ctx, 'rlocus', [['plot', [matV(T(re), nk, np), matV(T(im), nk, np)]], ['title', [str('Root Locus')]], ['xlabel', [str('Real Axis')]], ['ylabel', [str('Imaginary Axis')]]]); return undefined; }
  return [cmat(re, im), rowV(r.k)];
}

// ------------------------------------------------------------ interconnection builtins
function idxArg(v) { return v == null ? null : Array.from(F(v)).map((x) => x - 1); }
function feedbackB(args) {
  const a = ltiArg(args[0], 'SYS1'), b = ltiArg(args[1], 'SYS2');
  let sign = -1, fin = null, fout = null;
  const nums = args.slice(2).filter((x) => !isText(x));
  if (args.slice(2).some((x) => isText(x) && toStr(x).toLowerCase() === 'name')) throw E('feedback:name', "The 'name' option is not supported; use index vectors.");
  if (nums.length === 1) sign = toNum(nums[0]); else if (nums.length >= 2) { fin = idxArg(nums[0]); fout = idxArg(nums[1]); if (nums[2]) sign = toNum(nums[2]); }
  if (sign !== 1 && sign !== -1) throw E('feedback:badSign', 'The sign must be +1 or -1.');
  return makeObj(ops.feedback(a, b, fin, fout, sign));
}
function seriesB(args) {
  const a = ltiArg(args[0], 'SYS1'), b = ltiArg(args[1], 'SYS2');
  if (args.length >= 4) { const o1 = idxArg(args[2]), i2 = idxArg(args[3]); const a2 = ops.select(a, o1, Array.from({ length: a.nu }, (_, k) => k)); const b2 = ops.select(b, Array.from({ length: b.ny }, (_, k) => k), i2); return makeObj(ops.mul(b2, a2)); }
  return makeObj(ops.mul(b, a));
}
function parallelB(args) {
  const a = ltiArg(args[0], 'SYS1'), b = ltiArg(args[1], 'SYS2');
  if (args.length > 2) throw E('parallel:indices', 'parallel with index vectors is not supported; use the + operator on subsystems.');
  return makeObj(ops.add(a, b));
}
function appendB(args) { if (!args.length) throw E('append:noArgs', 'append needs at least one model.'); return makeObj(ops.append(...args.map((x) => ltiArg(x)))); }
function connectB(args) {
  const models = []; let i = 0; while (i < args.length && isModelArg(args[i])) { models.push(ltiArg(args[i])); i++; }
  if (!models.length) throw E('connect:noModel', 'connect requires dynamic system models.');
  const rest = args.slice(i).filter((x) => !(isStruct(x)));
  if (rest.length >= 3 && isNum(rest[0])) {
    const Q = rowsV(rest[0]); return makeObj(connectByIndex(ops.append(...models), Q, Array.from(F(rest[1])), Array.from(F(rest[2]))));
  }
  if (rest.length < 2) throw E('connect:args', 'connect requires the external input and output names.');
  const names = (v) => (isCell(v) ? v.data.map((x) => toStr(x)) : v.cls === 'string' ? v.data.slice() : [toStr(v)]);
  return makeObj(connectByName(models, names(rest[0]), names(rest[1])));
}
function sumblkB(args) {
  const f = toStr(args[0]); const n = args[1] ? toNum(args[1]) : 1;
  const mt = f.replace(/\s+/g, '').match(/^([^=]+)=(.+)$/); if (!mt) throw E('sumblk:badFormula', "The formula must look like 'e = r - y'.");
  const out = mt[1]; const terms = []; const re = /([+-]?)([^+-]+)/g; let x;
  while ((x = re.exec(mt[2]))) terms.push([x[1] === '-' ? -1 : 1, x[2]]);
  const ex = (nm) => (n > 1 ? Array.from({ length: n }, (_, k) => `${nm}(${k + 1})`) : [nm]);
  const D = zerosM(n, n * terms.length); terms.forEach(([s], t) => { for (let k = 0; k < n; k++) D[k][t * n + k] = s; });
  const m = mkTF(D.map((r) => r.map((v) => [v])), D.map((r) => r.map(() => [1])), 0, { InputName: terms.flatMap(([, nm]) => ex(nm)), OutputName: ex(out) });
  return makeObj(m);
}

// ------------------------------------------------------------ transformations
function c2dB(args) {
  const m = needModel(args, 'c2d'); const Ts = toNum(args[1], 'Ts');
  let method = 'zoh'; const opts = {};
  for (const a of args.slice(2)) { if (isText(a)) method = toStr(a); else if (isStruct(a) || isObject(a)) { const v = sfield(a, 'Method'); if (v) method = toStr(v); const w = sfield(a, 'PrewarpFrequency'); if (w && toNum(w) > 0) opts.prewarp = toNum(w); } else if (isNum(a)) opts.prewarp = toNum(a); }
  if (method.toLowerCase() === 'prewarp' && !opts.prewarp) throw E('c2d:prewarp', "The 'prewarp' method needs a prewarp frequency.");
  return makeObj(c2dM(m, Ts, method, opts));
}
function d2cB(args) {
  const m = needModel(args, 'd2c'); let method = 'zoh'; const opts = {};
  for (const a of args.slice(1)) { if (isText(a)) method = toStr(a); else if (isStruct(a) || isObject(a)) { const v = sfield(a, 'Method'); if (v) method = toStr(v); const w = sfield(a, 'PrewarpFrequency'); if (w && toNum(w) > 0) opts.prewarp = toNum(w); } else if (isNum(a)) opts.prewarp = toNum(a); }
  return makeObj(d2cM(m, method, opts));
}
function minrealB(args, nargout, ctx) {
  const m = needModel(args, 'minreal'); const tol = args[1] && isNum(args[1]) && prod(args[1].dims) ? toNum(args[1]) : undefined;
  const r = minrealM(m, tol);
  if (r.removed && m.type === 'ss' && nargout <= 1) ctx.out(`${r.removed} state${r.removed > 1 ? 's' : ''} removed.\n`);
  return makeObj(r.model);
}
function balrealB(args) {
  const m = needModel(args, 'balreal'); const r = balrealM(m);
  const out = convertTo(r.sys, m.type === 'ss' ? 'ss' : 'ss');
  return [makeObj(out), colV(r.g), matV(r.T, r.g.length, r.g.length), matV(r.Ti, r.g.length, r.g.length)];
}
function canonB(args) {
  const m = needModel(args, 'canon'); const type = lowerText(args[1]) || 'modal';
  const r = canonM(m, type === 'companion' ? 'companion' : 'modal');
  const n = r.T.length; return [makeObj(r.model), matV(r.T, n, n)];
}

// ------------------------------------------------------------ design builtins
const sq = (v, what) => { const r = rowsV(v); if (r.length && r[0].length !== r.length) throw E('ctrl:notSquare', `${what} must be square.`); return r; };
function opt(args, k, def) { return args[k] && prod(args[k].dims) ? rowsV(args[k]) : def; }
function lyapB(args) {
  const A = sq(args[0], 'A');
  if (args.length >= 3 && args[2] && prod(args[2].dims) && !(args[3])) { const B = sq(args[1], 'B'); const C = rowsV(args[2]); return matV(sylvester(A, B, C), A.length, B.length); }
  const Q = rowsV(args[1]);
  if (args[3] && prod(args[3].dims)) { // generalized: A X E' + E X A' + Q = 0
    const Em = rowsV(args[3]); const Ei = K.inv(Em); const At = K.mul(Ei, A); const Qt = K.mul(K.mul(Ei, Q), T(Ei)); const X = lyapC(At, Qt); return matV(X, A.length, A.length);
  }
  return matV(lyapC(A, Q), A.length, A.length);
}
function dlyapB(args) {
  const A = sq(args[0], 'A');
  if (args.length >= 3 && args[2] && prod(args[2].dims)) { const B = sq(args[1], 'B'); const C = rowsV(args[2]); return matV(sylvesterD(A, B, C), A.length, B.length); }
  return matV(symmetrize(lyapD(A, rowsV(args[1]))), A.length, A.length);
}
function riccatiArgs(args) {
  const A = sq(args[0], 'A'), B = rowsV(args[1]); const n = A.length, m = B[0].length;
  const Q = opt(args, 2, zerosM(n, n)), R = opt(args, 3, eye(m)), S = opt(args, 4, null), Em = opt(args, 5, null);
  if (Em) { const Ei = K.inv(Em); return { A: K.mul(Ei, A), B: K.mul(Ei, B), Q, R, S: S ? K.mul(T(Ei), S) : null, Em, n, m }; }
  return { A, B, Q, R, S, Em, n, m };
}
function careB(args, nargout, ctx, legacy = true, disc = false) {
  const p = riccatiArgs(args);
  let X = disc ? dareSolve(p.A, p.B, p.Q, p.R, p.S) : careSolve(p.A, p.B, p.Q, p.R, p.S);
  let Kg;
  if (disc) Kg = K.mul(K.inv(addM(K.mul(K.mul(T(p.B), X), p.B), p.R)), addM(K.mul(K.mul(T(p.B), X), p.A), p.S ? T(p.S) : zerosM(p.m, p.n)));
  else Kg = K.mul(K.inv(p.R), addM(K.mul(T(p.B), X), p.S ? T(p.S) : zerosM(p.m, p.n)));
  if (p.Em) X = K.mul(K.mul(T(K.inv(p.Em)), X), K.inv(p.Em));
  const ev = K.eigvals(addM(p.A, K.mul(p.B, Kg), -1));
  const L = ccol(ev.re, ev.im);
  return legacy ? [matV(X, p.n, p.n), L, matV(Kg, p.m, p.n)] : [matV(X, p.n, p.n), matV(Kg, p.m, p.n), L];
}
function lqrB(args, nargout, ctx, forceDisc = false) {
  let A, B, Ts = 0, k = 0;
  if (isModelArg(args[0])) { const s = explicitSS(toSS(ltiArg(args[0]))); A = s.A; B = s.B; Ts = s.Ts; k = 1; } else { A = sq(args[0], 'A'); B = rowsV(args[1]); k = 2; }
  const n = A.length, m = B[0].length;
  const Q = rowsV(args[k]), R = rowsV(args[k + 1]); const N = opt(args, k + 2, null);
  const r = lqrDesign(A, B, Q, R, N, forceDisc || Ts !== 0);
  return [matV(r.K, m, n), matV(r.S, n, n), ccol(r.P.re, r.P.im)];
}
function lqryB(args) {
  const s = explicitSS(toSS(needModel(args, 'lqry'))); const Q = rowsV(args[1]), R = rowsV(args[2]); const N = opt(args, 3, zerosM(s.ny, s.nu));
  const Qx = K.mul(K.mul(T(s.C), Q), s.C); const Nx = addM(K.mul(K.mul(T(s.C), Q), s.D), K.mul(T(s.C), N));
  const Ru = addM(addM(addM(R, K.mul(K.mul(T(s.D), Q), s.D)), K.mul(T(s.D), N)), K.mul(T(N), s.D));
  const r = lqrDesign(s.A, s.B, Qx, Ru, Nx, s.Ts !== 0);
  return [matV(r.K, s.nu, s.n), matV(r.S, s.n, s.n), ccol(r.P.re, r.P.im)];
}
function lqeB(args) {
  const A = sq(args[0], 'A'), G = rowsV(args[1]), C = rowsV(args[2]), Q = rowsV(args[3]), R = rowsV(args[4]); const N = opt(args, 5, null);
  const n = A.length, ny = C.length;
  const Qb = K.mul(K.mul(G, Q), T(G)); const Nb = N ? K.mul(G, N) : null;
  const P = careSolve(T(A), T(C), Qb, R, Nb);
  const L = K.mul(addM(K.mul(P, T(C)), Nb || zerosM(n, ny)), K.inv(R));
  const ev = K.eigvals(addM(A, K.mul(L, C), -1));
  return [matV(L, n, ny), matV(P, n, n), ccol(ev.re, ev.im)];
}
function kalmanB(args) {
  const m = needModel(args, 'kalman'); const Qn = rowsV(args[1]), Rn = rowsV(args[2]); const Nn = opt(args, 3, null);
  const r = kalmanDesign(m, Qn, Rn, Nn);
  const n = r.P.length; return [makeObj(r.kest), matV(r.L, n, r.L[0].length), matV(r.P, n, n)];
}
function placeB(args, nargout, ctx, ack = false) {
  const A = sq(args[0], 'A'), B = rowsV(args[1]); const p = cvec(args[2]);
  const Kg = ack ? ackerM(A, B, p) : placeM(A, B, p);
  if (!ack && nargout > 1) return [matV(Kg, Kg.length, A.length), num(0)];
  return matV(Kg, Kg.length, A.length);
}
function ctrbB(args) { let A, B; if (isModelArg(args[0])) { const s = explicitSS(toSS(ltiArg(args[0]))); A = s.A; B = s.B; } else { A = sq(args[0], 'A'); B = rowsV(args[1]); } const R = (A.length ? (B[0] || []).length : 0) ? K.T(K.T(ctrbFull(A, B))) : zerosM(A.length, 0); return matV(R, A.length, A.length * (B[0] || []).length); }
const ctrbFull = (A, B) => ctrbM(A, B);
function obsvB(args) { let A, C; if (isModelArg(args[0])) { const s = explicitSS(toSS(ltiArg(args[0]))); A = s.A; C = s.C; } else { A = sq(args[0], 'A'); C = rowsV(args[1]); } const R = obsvM(A, C); return matV(R, A.length * C.length, A.length); }
function gramB(args) {
  const m = needModel(args, 'gram'); const t = (lowerText(args[1]) || 'c'); const s = explicitSS(toSS(m));
  if (t === 'cf' || t === 'of') { const W = gramM(s, t[0]); const R = K.chol(symmetrize(W)); if (!R) throw E('gram:notPD', 'The gramian is not positive definite.'); return matV(R, s.n, s.n); }
  return matV(gramM(s, t === 'o' ? 'o' : 'c'), s.n, s.n);
}
function padeB(args, nargout, ctx) {
  if (isModelArg(args[0])) { const m = ltiArg(args[0]); return makeObj(padeModel(m, toNum(args[1]))); }
  const tau = toNum(args[0]), N = toNum(args[1]); const p = padeCoef(tau, N);
  if (nargout === 0) { const o = makeObj(mkTF([[p.num]], [[p.den]], 0, {})); ctx.out(displayText(o, 'ans')); return undefined; }
  if (nargout >= 2) return [rowV(p.num), rowV(p.den)];
  return makeObj(mkTF([[p.num]], [[p.den]], 0, {}));
}
function pidtuneB(args) {
  const G = needModel(args, 'pidtune'); let type = 'PI', wc = null;
  if (args[1]) { if (isText(args[1])) type = toStr(args[1]); else if (isLTI(args[1]) && args[1].cls === 'pid') { const c = getModel(args[1]); type = (c.Kp ? 'P' : '') + (c.Ki ? 'I' : '') + (c.Kd ? 'D' : '') + (c.Tf ? 'F' : '') || 'PI'; } }
  let pm = 60;
  for (const a of args.slice(2)) { if (isNum(a)) wc = toNum(a); else if (isStruct(a) || isObject(a)) { const v = sfield(a, 'PhaseMargin'); if (v) pm = toNum(v); } }
  const r = pidtuneM(G, type, wc, pm);
  return [makeObj(r.C), structOf({ Stable: bool(r.info.Stable), CrossoverFrequency: num(r.info.CrossoverFrequency), PhaseMargin: num(r.info.PhaseMargin) })];
}
function gensigB(args) {
  const type = (lowerText(args[0]) || 'square'); const tau = toNum(args[1]); const Tf = args[2] ? toNum(args[2]) : 5 * tau; const Ts = args[3] ? toNum(args[3]) : tau / 64;
  const n = Math.floor(Tf / Ts + 1e-9) + 1; const t = Array.from({ length: n }, (_, k) => k * Ts);
  const u = t.map((x) => { const ph = (x % tau) / tau; if (type === 'sin' || type === 'sine') return Math.sin(2 * Math.PI * x / tau); if (type === 'pulse') return ph < Ts / tau - 1e-12 || Math.abs(x % tau) < 1e-12 ? 1 : 0; return ph < 0.5 ? 1 : 0; });
  return [colV(u), colV(t)];
}

// ------------------------------------------------------------ conversion functions (signal style)
function tf2zpB(args) {
  const B = rowsV(args[0]), a = Array.from(F(args[1])); const ad = trimLead(a);
  const zs = B.map((b) => { const t = trimLead(b); return isZeroPoly(t) ? { re: [], im: [] } : rootsOf(t); });
  const nz = Math.max(0, ...zs.map((z) => z.re.length));
  const Zre = zerosM(nz, B.length), Zim = zerosM(nz, B.length);
  zs.forEach((z, c) => { for (let r = 0; r < nz; r++) { Zre[r][c] = r < z.re.length ? z.re[r] : Infinity; Zim[r][c] = r < z.re.length ? z.im[r] : 0; } });
  const p = rootsOf(ad); const k = B.map((b) => { const t = trimLead(b); return isZeroPoly(t) ? 0 : t[0] / ad[0]; });
  return [cmat(Zre, Zim.some((r) => r.some((x) => x)) ? Zim : null), ccol(p.re, p.im), colV(k)];
}
function zp2tfB(args) {
  const Z = M(args[0]); const p = cvec(args[1]); const k = Array.from(F(args[2]));
  const den = K.poly(p.re, p.im);
  const ncol = Z.n && k.length > 1 ? Z.n : (k.length || 1);
  const rows = [];
  for (let c = 0; c < Math.max(ncol, 1); c++) {
    const zr = [], zi = []; const m = Z.m && Z.n ? Z.m : (Z.a.length && ncol === 1 ? Z.a.length : 0);
    for (let r = 0; r < m; r++) { const q = ncol === 1 ? r : r + c * Z.m; const x = Z.a[q]; if (!Number.isFinite(x)) continue; zr.push(x); zi.push(Z.im ? Z.im[q] : 0); }
    rows.push(K.poly(zr, zi).map((x) => x * (k[c] ?? k[0])));
  }
  const L = Math.max(den.length, ...rows.map((r) => r.length));
  return [matV(rows.map((r) => padTo(r, L))), rowV(padTo(den, L))];
}
function tf2ssB(args) {
  const Bm = rowsV(args[0]), a = trimLead(Array.from(F(args[1]))); const n = a.length - 1;
  const an = a.map((x) => x / a[0]); const ny = Bm.length;
  const bp = Bm.map((b) => { const t = trimLead(b); if (t.length > n + 1 && !isZeroPoly(t)) throw E('tf2ss:improper', 'The numerator degree must not exceed the denominator degree.'); return padTo(b.length > n + 1 ? b.slice(b.length - n - 1) : b, n + 1).map((x) => x / a[0]); });
  const A = zerosM(n, n); for (let j = 0; j < n; j++) A[0][j] = -an[j + 1]; for (let i = 1; i < n; i++) A[i][i - 1] = 1;
  const B = zerosM(n, 1); if (n) B[0][0] = 1;
  const C = bp.map((b) => Array.from({ length: n }, (_, j) => b[j + 1] - b[0] * an[j + 1]));
  const D = bp.map((b) => [b[0]]);
  return [matV(A, n, n), matV(B, n, 1), matV(C, ny, n), matV(D, ny, 1)];
}
function ss2tfB(args) {
  const A = sq(args[0], 'A'), B = rowsV(args[1]), C = rowsV(args[2]), D = rowsV(args[3]); const iu = args[4] ? toNum(args[4]) - 1 : 0;
  const s = mkSS(A, B, C, D, 0, {}, null, [C.length, D.length ? D[0].length : B[0].length]);
  const t = toTF(ops.select(s, Array.from({ length: s.ny }, (_, i) => i), [iu]));
  const L = A.length + 1;
  return [matV(t.num.map((r) => padTo(r[0], L))), rowV(padTo(t.den[0][0], L))];
}
function zp2ssB(args) {
  const [nm, dn] = zp2tfB(args); const r = tf2ssB([nm, dn]); return r;
}
function ss2zpB(args) {
  const [nm, dn] = ss2tfB(args); return tf2zpB([nm, dn]);
}

// ------------------------------------------------------------ predicates
const predicate = (name, f) => (args) => bool(f(needModel(args, name), args));

// ------------------------------------------------------------ builtins table
export const builtins = {
  tf(args) { return tfCtor(args); },
  ss(args) { return ssCtor(args); },
  dss(args) { return ssCtor(args, true); },
  zpk(args) { return zpkCtor(args); },
  frd(args) { return frdCtor(args); },
  pid(args) { return pidCtor(args); },
  step: respBuiltin('step'),
  impulse: respBuiltin('impulse'),
  initial: initialB,
  lsim: lsimB,
  stepinfo: stepinfoB,
  gensig: gensigB,
  bode: bodeB,
  bodemag(args, nargout, ctx) { const r = bodeB(args, nargout, ctx); return r && r[0] ? [r[0], r[2]] : r; },
  nyquist: nyquistB,
  nichols: nicholsB,
  sigma: sigmaB,
  freqresp: freqrespB,
  evalfr: evalfrB,
  margin: marginB,
  allmargin: allmarginB,
  bandwidth(args) { const m = needModel(args, 'bandwidth'); return num(bandwidthM(m, args[1] ? toNum(args[1]) : -3)); },
  dcgain(args) { const m = needModel(args, 'dcgain'); const G = dcgainM(m); return matV(G, m.ny, m.nu); },
  pole: poleB,
  zero: zeroB,
  tzero(args) { const m = needModel(args, 'tzero'); const z = tzeros(m); return ccol(z.re, z.im); },
  damp: dampB,
  pzmap: pzmapB,
  rlocus: rlocusB,
  isstable(args) { if (args[0] && isObject(args[0]) && args[0].cls === 'digitalFilter') { const m = ltiArg(args[0]); return bool(isStable(m)); } return bool(isStable(needModel(args, 'isstable'))); },
  isct: predicate('isct', (m) => m.Ts === 0),
  isdt: predicate('isdt', (m) => m.Ts !== 0),
  issiso: predicate('issiso', (m) => m.ny === 1 && m.nu === 1),
  isproper: predicate('isproper', (m) => { if (m.type !== 'tf' && m.type !== 'zpk') return !(m.type === 'ss' && m.E && K.lu(m.E).singular); const t = toTF(m); return t.num.every((r, i) => r.every((n, j) => isZeroPoly(n) || trimLead(n).length <= trimLead(t.den[i][j]).length)); }),
  isstatic: predicate('isstatic', (m) => (m.type === 'ss' ? m.n === 0 : m.type === 'frd' ? false : toTF(m).num.every((r, i) => r.every((n, j) => trimLead(n).length <= 1 && trimLead(toTF(m).den[i][j]).length <= 1)))),
  order(args) { const m = needModel(args, 'order'); if (m.type === 'ss') return num(m.n); if (m.type === 'frd') return num(0); return num(polesOf(m).re.length); },
  tfdata: tfdataB,
  zpkdata: zpkdataB,
  ssdata: ssdataB,
  frdata: frdataB,
  feedback: feedbackB,
  series: seriesB,
  parallel: parallelB,
  connect: connectB,
  sumblk: sumblkB,
  c2d: c2dB,
  d2c: d2cB,
  d2d(args) { const m = needModel(args, 'd2d'); return makeObj(d2dM(m, toNum(args[1]), args[2] ? toStr(args[2]) : 'zoh')); },
  minreal: minrealB,
  balreal: balrealB,
  modred(args) { const m = needModel(args, 'modred'); const el = Array.from(F(args[1])).map((x) => x - 1); const meth = lowerText(args[2]) === 'truncate' || lowerText(args[2]) === 'del' ? 'truncate' : 'matchdc'; return makeObj(modredM(m, el, meth)); },
  canon: canonB,
  ss2ss(args) { const m = needModel(args, 'ss2ss'); return makeObj(ss2ssM(m, rowsV(args[1]))); },
  pade: padeB,
  ctrb: ctrbB,
  obsv: obsvB,
  gram: gramB,
  lyap: lyapB,
  dlyap: dlyapB,
  care(args, nargout, ctx) { return careB(args, nargout, ctx, true, false); },
  dare(args, nargout, ctx) { return careB(args, nargout, ctx, true, true); },
  icare(args, nargout, ctx) { return careB(args, nargout, ctx, false, false); },
  idare(args, nargout, ctx) { return careB(args, nargout, ctx, false, true); },
  lqr(args, nargout, ctx) { return lqrB(args, nargout, ctx, false); },
  dlqr(args, nargout, ctx) { return lqrB(args, nargout, ctx, true); },
  lqry: lqryB,
  lqe: lqeB,
  kalman: kalmanB,
  place(args, nargout, ctx) { return placeB(args, nargout, ctx, false); },
  acker(args, nargout, ctx) { return placeB(args, nargout, ctx, true); },
  pidtune: pidtuneB,
  tf2zp: tf2zpB,
  zp2tf: zp2tfB,
  tf2ss: tf2ssB,
  ss2tf: ss2tfB,
  zp2ss: zp2ssB,
  ss2zp: ss2zpB,
};

// ------------------------------------------------------------ classes
const methods = {
  plus: bin((a, b) => ops.add(a, b)),
  minus: bin((a, b) => ops.sub(a, b)),
  mtimes: bin((a, b) => ops.mul(a, b)),
  times: bin((a, b) => { if (a.ny * a.nu === 1 || b.ny * b.nu === 1) return ops.mul(a, b); throw E('lti:times', 'Element-wise multiplication of MIMO models is not supported.'); }),
  mrdivide: bin((a, b) => ops.mul(a, ops.inv(b))),
  mldivide: bin((a, b) => ops.mul(ops.inv(a), b)),
  rdivide: bin((a, b) => { if (b.ny * b.nu !== 1) throw E('lti:rdivide', 'Element-wise division needs a SISO divisor.'); return ops.mul(a, ops.inv(b)); }),
  uminus(args) { return makeObj(ops.neg(ltiArg(args[0]))); },
  uplus(args) { return args[0]; },
  mpower(args) { const m = ltiArg(args[0]); return makeObj(ops.mpower(m, toNum(args[1]))); },
  power(args) { const m = ltiArg(args[0]); if (m.ny * m.nu !== 1) throw E('lti:power', 'Element-wise power needs a SISO model.'); return makeObj(ops.mpower(m, toNum(args[1]))); },
  inv(args) { return makeObj(ops.inv(ltiArg(args[0]))); },
  transpose(args) { return makeObj(ops.transpose(ltiArg(args[0]))); },
  ctranspose(args) { return makeObj(ops.ctranspose(ltiArg(args[0]))); },
  horzcat(args) { return makeObj(ops.hcat(args.filter((x) => isModelArg(x) || prod(x.dims)).map((x) => ltiArg(x)))); },
  vertcat(args) { return makeObj(ops.vcat(args.filter((x) => isModelArg(x) || prod(x.dims)).map((x) => ltiArg(x)))); },
  append: appendB,
  isempty(args) { const m = ltiArg(args[0]); return bool(m.ny * m.nu === 0); },
  ndims() { return num(2); },
  norm(args) {
    const m = ltiArg(args[0]); const t = args[1] == null ? 2 : (isText(args[1]) ? (toStr(args[1]).toLowerCase() === 'inf' ? Infinity : 2) : toNum(args[1]));
    if (t === 2) {
      const s = explicitSS(toSS(m));
      if (!isStable(s)) return num(Infinity);
      if (s.Ts === 0) { if (s.D.some((r) => r.some((x) => x !== 0))) return num(Infinity); const W = gramM(s, 'o'); const BWB = K.mul(K.mul(T(s.B), W), s.B); let tr = 0; for (let i = 0; i < BWB.length; i++) tr += BWB[i][i]; return num(Math.sqrt(Math.max(0, tr))); }
      const W = gramM(s, 'o'); const BWB = addM(K.mul(K.mul(T(s.B), W), s.B), K.mul(T(s.D), s.D)); let tr = 0; for (let i = 0; i < BWB.length; i++) tr += BWB[i][i]; return num(Math.sqrt(Math.max(0, tr)));
    }
    if (m.type !== 'frd' && !isStable(m)) return num(Infinity);
    const w = m.type === 'frd' ? m.freq : [0, ...autoFreq(m, 400)]; let best = 0;
    const sv = (ww) => { const Hh = freqResp(m, ww); let mx = 0; for (let k = 0; k < ww.length; k++) { const Mr = Array.from({ length: 2 * m.ny }, () => new Array(2 * m.nu).fill(0)); for (let i = 0; i < m.ny; i++) for (let j = 0; j < m.nu; j++) { const a = Hh[i][j].re[k], b = Hh[i][j].im[k]; Mr[i][j] = a; Mr[i][j + m.nu] = -b; Mr[i + m.ny][j] = b; Mr[i + m.ny][j + m.nu] = a; } mx = Math.max(mx, K.svd(Mr).s[0]); } return mx; };
    const vals = w.map((x) => sv([x])); let k0 = 0; vals.forEach((v, k) => { if (v > vals[k0]) k0 = k; }); best = vals[k0];
    if (m.type !== 'frd' && k0 > 0 && k0 < w.length - 1) { let a = w[k0 - 1], b = w[k0 + 1]; for (let it = 0; it < 60; it++) { const c1 = a + (b - a) * 0.382, c2 = a + (b - a) * 0.618; if (sv([c1]) > sv([c2])) b = c2; else a = c1; } best = Math.max(best, sv([(a + b) / 2])); }
    return nargoutWrap(best, w[k0]);
  },
};
function nargoutWrap(v, f) { return [num(v), num(f)]; }
// every control builtin is also a method so it wins over same-named functions of other areas
for (const k of Object.keys(builtins)) if (!['tf', 'ss', 'zpk', 'frd', 'pid', 'dss', 'tf2zp', 'zp2tf', 'tf2ss', 'ss2tf', 'zp2ss', 'ss2zp', 'lyap', 'dlyap', 'care', 'dare', 'icare', 'idare', 'lqe', 'place', 'acker', 'gensig', 'sumblk'].includes(k)) methods[k] = builtins[k];
methods.tf = (args) => tfCtor(args); methods.ss = (args) => ssCtor(args); methods.zpk = (args) => zpkCtor(args); methods.frd = (args) => frdCtor(args);

function classDef(cls, ctor) {
  return {
    props: PROPS[cls],
    construct(args) { return ctor(args); },
    methods,
    subsref(obj, subs) { return [ltiSubsref(obj, subs)]; },
    subsasgn(obj, subs, rhs) { return ltiSubsasgn(obj, subs, rhs); },
    display(obj, name) { return displayText(obj, name || 'ans'); },
    size(obj) { const m = getModel(obj); return [m.ny, m.nu]; },
    numel() { return 1; },
  };
}
export const classes = {
  tf: classDef('tf', tfCtor),
  ss: classDef('ss', ssCtor),
  zpk: classDef('zpk', zpkCtor),
  frd: classDef('frd', frdCtor),
  pid: classDef('pid', pidCtor),
};

// ------------------------------------------------------------ help
const S = (s) => s;
export const help = {
  tf: H('Transfer function model: tf(num,den), tf(num,den,Ts), tf(\'s\'), tf(sys), MIMO with cell arrays.', '전달 함수 모델: tf(num,den), tf(num,den,Ts), tf(\'s\'), tf(sys), 셀 배열로 MIMO.', ['sys = tf(num, den)', 'sys = tf(num, den, Ts)', "s = tf('s')", 'sys = tf(M)', 'sys = tf(sys)', "sys = tf(___, 'Variable', 'z^-1')"]),
  ss: H('State-space model x\' = Ax + Bu, y = Cx + Du (or discrete).', '상태 공간 모델 x\' = Ax + Bu, y = Cx + Du (또는 이산).', ['sys = ss(A, B, C, D)', 'sys = ss(A, B, C, D, Ts)', 'sys = ss(D)', 'sys = ss(sys)', "sys = ss(sys, 'minimal')"]),
  dss: H('Descriptor state-space model E x\' = Ax + Bu.', '디스크립터 상태 공간 모델 E x\' = Ax + Bu.', ['sys = dss(A, B, C, D, E)', 'sys = dss(A, B, C, D, E, Ts)']),
  zpk: H('Zero-pole-gain model.', '영점-극점-이득 모델.', ['sys = zpk(z, p, k)', 'sys = zpk(z, p, k, Ts)', "s = zpk('s')", 'sys = zpk(sys)']),
  frd: H('Frequency response data model.', '주파수 응답 데이터 모델.', ['sys = frd(response, freq)', 'sys = frd(response, freq, Ts)', 'sys = frd(sys, freq)']),
  pid: H('Parallel-form PID controller Kp + Ki/s + Kd*s/(Tf*s+1).', '병렬형 PID 제어기 Kp + Ki/s + Kd*s/(Tf*s+1).', ['C = pid(Kp, Ki, Kd)', 'C = pid(Kp, Ki, Kd, Tf)', 'C = pid(Kp, Ki, Kd, Tf, Ts)', "C = pid(___, 'IFormula', 'Trapezoidal')"]),
  step: H('Step response (plots when called without outputs).', '계단 응답 (출력 인수가 없으면 그래프를 그림).', ['step(sys)', 'step(sys, tFinal)', 'step(sys, t)', '[y, t] = step(sys)', '[y, t, x] = step(sys, ___)']),
  impulse: H('Impulse response.', '임펄스 응답.', ['impulse(sys)', '[y, t] = impulse(sys)', '[y, t, x] = impulse(sys, t)']),
  initial: H('Free response of a state-space model from an initial state.', '초기 상태에서 상태 공간 모델의 자유 응답.', ['initial(sys, x0)', '[y, t, x] = initial(sys, x0, t)']),
  lsim: H('Response to arbitrary inputs.', '임의 입력에 대한 응답.', ['lsim(sys, u, t)', '[y, t, x] = lsim(sys, u, t, x0)', "y = lsim(sys, u, t, x0, 'zoh')"]),
  stepinfo: H('Step-response characteristics (rise time, settling time, overshoot, peak).', '계단 응답 특성 (상승 시간, 정착 시간, 오버슈트, 피크).', ['S = stepinfo(sys)', 'S = stepinfo(y, t)', 'S = stepinfo(y, t, yfinal)', "S = stepinfo(___, 'SettlingTimeThreshold', 0.05)"]),
  gensig: H('Periodic test signals for lsim (square, sine, pulse).', 'lsim용 주기 신호 생성 (square, sine, pulse).', ['[u, t] = gensig(type, tau)', '[u, t] = gensig(type, tau, Tf, Ts)']),
  bode: H('Bode frequency response: magnitude and phase (degrees).', '보드 주파수 응답: 크기와 위상(도).', ['bode(sys)', 'bode(sys, w)', '[mag, phase, wout] = bode(sys)', '[mag, phase] = bode(sys, {wmin, wmax})']),
  bodemag: H('Bode magnitude response.', '보드 크기 응답.', ['bodemag(sys)', '[mag, w] = bodemag(sys)']),
  nyquist: H('Nyquist frequency response.', '나이퀴스트 주파수 응답.', ['nyquist(sys)', '[re, im, wout] = nyquist(sys, w)']),
  nichols: H('Nichols frequency response.', '니콜스 주파수 응답.', ['nichols(sys)', '[mag, phase, wout] = nichols(sys, w)']),
  sigma: H('Singular values of the frequency response.', '주파수 응답의 특이값.', ['sigma(sys)', '[sv, wout] = sigma(sys, w)']),
  freqresp: H('Frequency response at given frequencies (complex ny-by-nu-by-nw).', '주어진 주파수에서의 주파수 응답 (복소 ny×nu×nw).', ['[H, wout] = freqresp(sys)', 'H = freqresp(sys, w)']),
  evalfr: H('Evaluates a model at a complex point s or z.', '복소수 s 또는 z에서 모델 값을 계산합니다.', ['H = evalfr(sys, s)']),
  margin: H('Gain margin, phase margin and crossover frequencies (SISO).', '이득 여유, 위상 여유와 교차 주파수 (SISO).', ['[Gm, Pm, Wcg, Wcp] = margin(sys)', '[Gm, Pm, Wcg, Wcp] = margin(mag, phase, w)', 'margin(sys)']),
  allmargin: H('All stability margins and crossover frequencies.', '모든 안정 여유와 교차 주파수.', ['S = allmargin(sys)']),
  bandwidth: H('Frequency where the gain drops 3 dB below its DC value.', '이득이 DC 값보다 3 dB 떨어지는 주파수.', ['fb = bandwidth(sys)', 'fb = bandwidth(sys, dbdrop)']),
  dcgain: H('Low-frequency (DC) gain.', '저주파(DC) 이득.', ['k = dcgain(sys)']),
  pole: H('Poles of a dynamic system.', '동적 시스템의 극점.', ['p = pole(sys)']),
  zero: H('Zeros (transmission zeros for MIMO) and gain.', '영점 (MIMO는 전달 영점)과 이득.', ['z = zero(sys)', '[z, gain] = zero(sys)']),
  tzero: H('Invariant (transmission) zeros.', '불변(전달) 영점.', ['z = tzero(sys)']),
  damp: H('Natural frequency, damping ratio and poles.', '고유 진동수, 감쇠비와 극점.', ['damp(sys)', '[wn, zeta, p] = damp(sys)']),
  pzmap: H('Pole-zero map data (plots without outputs).', '극점-영점 지도 데이터 (출력이 없으면 그래프).', ['pzmap(sys)', '[p, z] = pzmap(sys)']),
  rlocus: H('Root locus: closed-loop poles as the feedback gain varies.', '근궤적: 피드백 이득에 따른 폐루프 극점.', ['rlocus(sys)', '[r, k] = rlocus(sys)', 'r = rlocus(sys, k)']),
  isstable: H('True when all poles are stable.', '모든 극점이 안정하면 참.', ['tf = isstable(sys)']),
  isct: H('True for continuous-time models.', '연속 시간 모델이면 참.', ['tf = isct(sys)']),
  isdt: H('True for discrete-time models.', '이산 시간 모델이면 참.', ['tf = isdt(sys)']),
  issiso: H('True for single-input single-output models.', '단일 입력 단일 출력 모델이면 참.', ['tf = issiso(sys)']),
  isproper: H('True when the model is proper (causal).', '모델이 proper(인과적)이면 참.', ['tf = isproper(sys)']),
  isstatic: H('True when the model has no dynamics.', '모델에 동특성이 없으면 참.', ['tf = isstatic(sys)']),
  order: H('Model order (number of states / poles).', '모델 차수 (상태 / 극점 수).', ['n = order(sys)']),
  tfdata: H('Numerator, denominator and sample time of a model.', '모델의 분자, 분모, 샘플 시간.', ['[num, den, Ts] = tfdata(sys)', "[num, den] = tfdata(sys, 'v')"]),
  zpkdata: H('Zeros, poles, gain and sample time.', '영점, 극점, 이득, 샘플 시간.', ['[z, p, k, Ts] = zpkdata(sys)', "[z, p, k] = zpkdata(sys, 'v')"]),
  ssdata: H('State-space matrices of a model.', '모델의 상태 공간 행렬.', ['[A, B, C, D, Ts] = ssdata(sys)']),
  frdata: H('Response data and frequencies of an frd model.', 'frd 모델의 응답 데이터와 주파수.', ['[response, freq, Ts] = frdata(sys)', "[response, freq] = frdata(sys, 'v')"]),
  feedback: H('Feedback connection of two models (negative by default).', '두 모델의 피드백 연결 (기본은 음의 피드백).', ['sys = feedback(sys1, sys2)', 'sys = feedback(sys1, sys2, sign)', 'sys = feedback(sys1, sys2, feedin, feedout, sign)']),
  series: H('Series connection sys2*sys1.', '직렬 연결 sys2*sys1.', ['sys = series(sys1, sys2)', 'sys = series(sys1, sys2, outputs1, inputs2)']),
  parallel: H('Parallel connection sys1 + sys2.', '병렬 연결 sys1 + sys2.', ['sys = parallel(sys1, sys2)']),
  connect: H('Block-diagram interconnection by signal names (or by an index matrix).', '신호 이름(또는 인덱스 행렬)으로 블록 다이어그램을 연결합니다.', ['sysc = connect(sys1, ..., sysN, inputs, outputs)', 'sysc = connect(sys, Q, inputs, outputs)']),
  sumblk: H('Summing junction defined by a formula such as \'e = r - y\'.', "'e = r - y' 같은 식으로 정의하는 합산점.", ["S = sumblk('e = r - y')", "S = sumblk('e = r - y', n)"]),
  c2d: H('Continuous to discrete conversion (zoh, foh, impulse, tustin, matched).', '연속 → 이산 변환 (zoh, foh, impulse, tustin, matched).', ['sysd = c2d(sys, Ts)', "sysd = c2d(sys, Ts, 'tustin')", 'sysd = c2d(sys, Ts, opts)']),
  d2c: H('Discrete to continuous conversion (zoh, tustin, matched).', '이산 → 연속 변환 (zoh, tustin, matched).', ['sysc = d2c(sysd)', "sysc = d2c(sysd, 'tustin')"]),
  d2d: H('Resamples a discrete model.', '이산 모델을 다른 샘플 시간으로 바꿉니다.', ['sys2 = d2d(sys, Ts)', "sys2 = d2d(sys, Ts, 'tustin')"]),
  minreal: H('Minimal realization / pole-zero cancellation.', '최소 실현 / 극점-영점 상쇄.', ['sysr = minreal(sys)', 'sysr = minreal(sys, tol)']),
  balreal: H('Balanced realization with Hankel singular values.', '한켈 특이값을 갖는 평형 실현.', ['[sysb, g, T, Ti] = balreal(sys)']),
  modred: H('Model order reduction by eliminating states.', '상태를 제거하여 모델 차수를 줄입니다.', ['rsys = modred(sys, elim)', "rsys = modred(sys, elim, 'Truncate')"]),
  canon: H('Modal or companion canonical state-space form.', '모달 또는 동반(companion) 정준 상태 공간 형식.', ["[csys, T] = canon(sys, 'modal')", "[csys, T] = canon(sys, 'companion')"]),
  ss2ss: H('State coordinate transformation z = T x.', '상태 좌표 변환 z = T x.', ['sysT = ss2ss(sys, T)']),
  pade: H('Pade approximation of time delays.', '시간 지연의 파데 근사.', ['[num, den] = pade(T, N)', 'sysx = pade(sys, N)']),
  ctrb: H('Controllability matrix [B AB A^2B ...].', '가제어성 행렬 [B AB A^2B ...].', ['Co = ctrb(A, B)', 'Co = ctrb(sys)']),
  obsv: H('Observability matrix [C; CA; CA^2 ...].', '가관측성 행렬 [C; CA; CA^2 ...].', ['Ob = obsv(A, C)', 'Ob = obsv(sys)']),
  gram: H('Controllability or observability gramian.', '가제어성 또는 가관측성 그래미안.', ["Wc = gram(sys, 'c')", "Wo = gram(sys, 'o')", "R = gram(sys, 'cf')"]),
  lyap: H('Continuous Lyapunov and Sylvester equations.', '연속 리아푸노프 및 실베스터 방정식.', ['X = lyap(A, Q)', 'X = lyap(A, B, C)', 'X = lyap(A, Q, [], E)']),
  dlyap: H('Discrete Lyapunov and Sylvester equations.', '이산 리아푸노프 및 실베스터 방정식.', ['X = dlyap(A, Q)', 'X = dlyap(A, B, C)']),
  care: H('Continuous algebraic Riccati equation.', '연속 대수 리카티 방정식.', ['[X, L, G] = care(A, B, Q)', '[X, L, G] = care(A, B, Q, R, S, E)']),
  dare: H('Discrete algebraic Riccati equation.', '이산 대수 리카티 방정식.', ['[X, L, G] = dare(A, B, Q, R)', '[X, L, G] = dare(A, B, Q, R, S, E)']),
  icare: H('Continuous Riccati equation, returning [X, K, L].', '연속 리카티 방정식, [X, K, L] 반환.', ['[X, K, L] = icare(A, B, Q, R, S, E)']),
  idare: H('Discrete Riccati equation, returning [X, K, L].', '이산 리카티 방정식, [X, K, L] 반환.', ['[X, K, L] = idare(A, B, Q, R, S, E)']),
  lqr: H('Linear-quadratic regulator.', '선형 2차 레귤레이터.', ['[K, S, P] = lqr(sys, Q, R, N)', '[K, S, P] = lqr(A, B, Q, R, N)']),
  dlqr: H('Discrete linear-quadratic regulator.', '이산 선형 2차 레귤레이터.', ['[K, S, e] = dlqr(A, B, Q, R, N)']),
  lqry: H('LQR with output weighting.', '출력 가중 LQR.', ['[K, S, e] = lqry(sys, Q, R, N)']),
  lqe: H('Kalman estimator gain for continuous systems.', '연속 시스템의 칼만 추정기 이득.', ['[L, P, E] = lqe(A, G, C, Q, R, N)']),
  kalman: H('Kalman filter design; returns the estimator model.', '칼만 필터 설계; 추정기 모델을 반환합니다.', ['[kest, L, P] = kalman(sys, Qn, Rn, Nn)']),
  place: H('Pole placement gain K so that eig(A-B*K) = p.', 'eig(A-B*K) = p가 되도록 극점 배치 이득 K.', ['K = place(A, B, p)']),
  acker: H('Pole placement for single-input systems (Ackermann formula).', '단일 입력 시스템의 극점 배치 (아커만 공식).', ['k = acker(A, b, p)']),
  pidtune: H('Tunes a PID controller for a SISO plant (target phase margin 60 degrees).', 'SISO 플랜트에 대해 PID 제어기를 조정합니다 (목표 위상 여유 60도).', ['C = pidtune(sys, type)', 'C = pidtune(sys, type, wc)', '[C, info] = pidtune(___)']),
  tf2zp: H('Transfer function coefficients to zeros, poles and gain.', '전달 함수 계수를 영점, 극점, 이득으로 변환합니다.', ['[z, p, k] = tf2zp(b, a)']),
  zp2tf: H('Zeros, poles and gain to transfer function coefficients.', '영점, 극점, 이득을 전달 함수 계수로 변환합니다.', ['[b, a] = zp2tf(z, p, k)']),
  tf2ss: H('Transfer function to controller canonical state space.', '전달 함수를 제어기 정준형 상태 공간으로 변환합니다.', ['[A, B, C, D] = tf2ss(b, a)']),
  ss2tf: H('State space to transfer function coefficients for one input.', '상태 공간을 한 입력에 대한 전달 함수 계수로 변환합니다.', ['[b, a] = ss2tf(A, B, C, D)', '[b, a] = ss2tf(A, B, C, D, ni)']),
  zp2ss: H('Zeros, poles and gain to state space.', '영점, 극점, 이득을 상태 공간으로 변환합니다.', ['[A, B, C, D] = zp2ss(z, p, k)']),
  ss2zp: H('State space to zeros, poles and gain.', '상태 공간을 영점, 극점, 이득으로 변환합니다.', ['[z, p, k] = ss2zp(A, B, C, D, ni)']),
};
void S; void propName; void pidTF; void lyapD; void gainTF; void mkSS; void fixMeta; void stringArray; void timeGrid; void hasDelay; void eye;
