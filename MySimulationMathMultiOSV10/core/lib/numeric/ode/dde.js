// Delay differential equations: dde23 (constant delays) and ddesd (general,
// possibly state-dependent delays), ddeset/ddeget. Explicit Bogacki-Shampine
// (2,3) pair with cubic Hermite interpolation of the past solution. For dde23
// the step is limited by the smallest delay and lands on propagated
// discontinuities t0 + sum of delays (up to third order).
import { E, F, H, num, str, col, V, row, structOf, callFn, isStruct, isFuncHandle, isText, toStr, isEmptyV, sfield, EPS, empty } from '../_util.js';
import { optReader, makeTol, makeOptionSet, optionGet, DDE_FIELDS, failWarn } from './common.js';
import { evalSol } from './solvers.js';

const C = [0, 1 / 2, 3 / 4, 1];
const A = [[], [1 / 2], [0, 3 / 4], [2 / 9, 1 / 3, 4 / 9]];
const EC = [-5 / 72, 1 / 12, 1 / 9, -1 / 8];

function solveDde(name, args, nargout, ctx) {
  if (args.length < 4) throw E(`${name}:nargin`, `${name} needs ddefun, delays, history and tspan.`);
  const fnOf = (v) => (isText(v) ? toStr(v) : v);
  const ddefun = fnOf(args[0]);
  const delaysV = args[1];
  const stateDep = name === 'ddesd' && (isFuncHandle(delaysV) || isText(delaysV));
  const lags = stateDep ? [] : Array.from(F(delaysV));
  if (lags.some((l) => !(l >= 0))) throw E(`${name}:badLags`, 'Delays must be nonnegative.');
  const hist = args[2];
  const tspan = Array.from(F(args[3]));
  if (tspan.length < 2 || !(tspan[tspan.length - 1] > tspan[0])) throw E(`${name}:badTspan`, 'tspan must be increasing with at least two entries.');
  const t0 = tspan[0], tf = tspan[tspan.length - 1];
  const R = optReader(args.length > 4 && isStruct(args[4]) ? args[4] : null);
  const extra = args.slice(5);
  // history
  let histFn;
  if (isStruct(hist)) {
    histFn = (t) => { const { Y } = evalSol(hist, [t], ctx); return Float64Array.from(Y); };
  } else if (isFuncHandle(hist) || isText(hist)) {
    histFn = (t) => Float64Array.from(F(callFn(ctx, fnOf(hist), [num(t), ...extra], 1)[0]));
  } else { const c = Float64Array.from(F(hist)); histFn = () => Float64Array.from(c); }
  let y = R.get('InitialY') !== undefined ? Float64Array.from(R.arr('InitialY')) : histFn(t0);
  const n = y.length;
  const tol = makeTol(R, n, name);
  const stats = { nsteps: 0, nfailed: 0, nfevals: 0 };
  const xs = [t0], ys = [Float64Array.from(y)], yps = [];
  const past = (tq) => {
    if (tq <= t0) return tq === t0 && R.get('InitialY') !== undefined ? Float64Array.from(ys[0]) : histFn(tq);
    const N = xs.length;
    if (tq >= xs[N - 1]) {
      if (N < 2 || yps.length < N) return Float64Array.from(ys[N - 1]);
      return herm(N - 2, tq);
    }
    let a = 0, b = N - 1; while (b - a > 1) { const c = (a + b) >> 1; if (xs[c] <= tq) a = c; else b = c; }
    return herm(a, tq);
  };
  function herm(i, t) {
    const h = xs[i + 1] - xs[i]; const s = (t - xs[i]) / h; const s2 = s * s, s3 = s2 * s; const r = new Float64Array(n);
    for (let k = 0; k < n; k++) r[k] = (2 * s3 - 3 * s2 + 1) * ys[i][k] + (s3 - 2 * s2 + s) * h * yps[i][k] + (-2 * s3 + 3 * s2) * ys[i + 1][k] + (s3 - s2) * h * yps[i + 1][k];
    return r;
  }
  const Zof = (t, yy) => {
    let times;
    if (stateDep) times = Array.from(F(callFn(ctx, fnOf(delaysV), [num(t), col(Float64Array.from(yy)), ...extra], 1)[0]));
    else times = lags.map((l) => t - l);
    const nl = times.length; const Z = new Float64Array(n * nl);
    times.forEach((tt, j) => { if (tt > t + 1e-12 * Math.max(1, Math.abs(t))) throw E(`${name}:futureDelay`, `A delay at t = ${t} refers to the future (${tt}).`); Z.set(tt === t ? yy : past(tt), j * n); });
    return V(n, nl, Z);
  };
  const f = (t, yy) => {
    stats.nfevals++;
    const r = F(callFn(ctx, ddefun, [num(t), col(Float64Array.from(yy)), Zof(t, yy), ...extra], 1)[0]);
    if (r.length !== n) throw E(`${name}:badOutputSize`, `The DDE function must return a column vector of length ${n}.`);
    return Float64Array.from(r);
  };
  // discontinuities
  const minLag = lags.length ? Math.min(...lags.filter((l) => l > 0), Infinity) : Infinity;
  const breaks = new Set();
  if (!stateDep && lags.length) {
    let level = [t0];
    for (let d = 0; d < 3; d++) { const nxt = []; for (const b of level) for (const l of lags) if (l > 0) { const v = b + l; if (v < tf) { breaks.add(v); nxt.push(v); } } level = nxt.slice(0, 200); }
  }
  for (const j of R.arr('Jumps', [])) if (j > t0 && j < tf) breaks.add(j);
  const bps = [...breaks].sort((a, b) => a - b);
  let t = t0; let f0 = f(t, y); yps.push(Float64Array.from(f0));
  const hmax = Math.min(R.num('MaxStep', 0.1 * (tf - t0)), minLag);
  let absh = R.get('InitialStep') !== undefined ? R.num('InitialStep') : Math.min(hmax, 0.01 * (tf - t0));
  let bi = 0;
  while (t < tf) {
    ctx.checkInterrupt();
    const hmin = 16 * EPS * Math.abs(t);
    absh = Math.min(hmax, Math.max(hmin, absh));
    while (bi < bps.length && bps[bi] <= t * (1 + 1e-14) + 1e-300) bi++;
    let target = bi < bps.length ? Math.min(bps[bi], tf) : tf;
    if (1.1 * absh >= target - t) absh = target - t; else target = null;
    let ynew, err, Ks;
    for (;;) {
      const h = absh;
      Ks = [f0];
      for (let i = 1; i < 4; i++) {
        const yi = new Float64Array(n); for (let k = 0; k < n; k++) { let acc = 0; for (let j = 0; j < i; j++) acc += A[i][j] * Ks[j][k]; yi[k] = y[k] + h * acc; }
        if (i === 3) ynew = yi;
        Ks.push(f(t + C[i] * h, yi));
      }
      const e = new Float64Array(n); for (let k = 0; k < n; k++) { let acc = 0; for (let j = 0; j < 4; j++) acc += EC[j] * Ks[j][k]; e[k] = h * acc; }
      err = tol.err(e, y, ynew);
      if (err > 1) {
        stats.nfailed++;
        if (absh <= hmin) { failWarn({ ctx, solver: name }, t, hmin); t = tf + 1; break; }
        absh = Math.max(hmin, absh * Math.max(0.1, 0.8 * Math.pow(err, -1 / 3))); target = null; continue;
      }
      break;
    }
    if (t > tf) break;
    stats.nsteps++;
    const tnew = target !== null ? target : t + absh;
    xs.push(tnew); ys.push(ynew); yps.push(Float64Array.from(Ks[3]));
    t = tnew; y = ynew; f0 = Ks[3];
    absh *= err === 0 ? 5 : Math.min(5, 0.8 * Math.pow(err, -1 / 3));
  }
  if (R.bool('Stats', false)) ctx.out(`${stats.nsteps} successful steps\n${stats.nfailed} failed attempts\n${stats.nfevals} function evaluations\n`);
  const N = xs.length; const Y = new Float64Array(n * N), YP = new Float64Array(n * N);
  ys.forEach((v, i) => Y.set(v, i * n)); yps.forEach((v, i) => YP.set(v, i * n));
  return structOf({
    solver: str(name), history: hist, discont: row(Float64Array.from([t0, ...bps])),
    x: row(Float64Array.from(xs)), y: V(n, N, Y), yp: V(n, N, YP),
    stats: structOf({ nsteps: num(stats.nsteps), nfailed: num(stats.nfailed), nfevals: num(stats.nfevals) }),
  });
}

export const builtins = {
  dde23: (a, n, c) => solveDde('dde23', a, n, c),
  ddesd: (a, n, c) => solveDde('ddesd', a, n, c),
  ddeset: (a, n, c) => makeOptionSet(DDE_FIELDS, 'ddeset', a, n, c),
  ddeget: (a) => optionGet(DDE_FIELDS, 'ddeget', a),
};
export const help = {
  dde23: H('Solve delay differential equations with constant delays.', '상수 지연을 갖는 지연 미분방정식을 풉니다.', ['sol = dde23(ddefun, lags, history, tspan)', 'sol = dde23(ddefun, lags, history, tspan, options)']),
  ddesd: H('Solve delay differential equations with general (time or state dependent) delays.', '일반(시간·상태 의존) 지연을 갖는 지연 미분방정식을 풉니다.', ['sol = ddesd(ddefun, delays, history, tspan)', 'sol = ddesd(ddefun, delays, history, tspan, options)']),
  ddeset: H('Create or modify a DDE options structure.', 'DDE 옵션 구조체를 만들거나 수정합니다.', ['options = ddeset(Name, Value, ...)', 'options = ddeset(oldopts, Name, Value, ...)']),
  ddeget: H('Read a value from a DDE options structure.', 'DDE 옵션 구조체에서 값을 읽습니다.', ['v = ddeget(options, Name)', 'v = ddeget(options, Name, default)']),
};
void empty; void isEmptyV; void sfield;
