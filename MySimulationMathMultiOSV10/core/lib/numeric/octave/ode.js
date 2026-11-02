// Octave's ODE/DAE interfaces: lsode (x' = f(x, t)), daspk, dassl and dasrt
// (residual form f(x, x', t) = 0, dasrt with root functions) and the odeplot
// output function. They run on the engine's BDF/Adams solvers (ode15s,
// ode113, ode15i) with the tolerances of the *_options keyword sets.
import { num, str, bool, toNum, isCell, isText, toStr, isFuncHandle, isChar, structOf, tensor } from '../../../value.js';
import { E, F, H, isEmptyV, sfield, callFn, jsFn } from '../_util.js';
import { evalSol } from '../ode/solvers.js';
import { getOption } from './options.js';
import { T, colV, rowV, txt } from './_h.js';

/** {f, jac} of an Octave function argument: handle, name, cell {f, jac} or two-row char matrix. */
function fnPair(v, fn) {
  if (isFuncHandle(v)) return { f: v, jac: null };
  if (isCell(v)) {
    if (v.data.length < 1 || v.data.length > 2) throw E(`${fn}:badFunction`, `${fn}: FCN must be a cell array of one or two functions.`);
    const [f, j] = v.data.map((x) => (isText(x) ? toStr(x).trim() : x));
    return { f, jac: j && !isEmptyV(j) ? j : null };
  }
  if (isChar(v) && v.dims[0] === 2) {
    const n = v.dims[1]; const rows = [0, 1].map((r) => Array.from({ length: n }, (_, j) => String.fromCharCode(v.re[r + 2 * j])).join('').trim());
    return { f: rows[0], jac: rows[1] || null };
  }
  if (isText(v)) return { f: toStr(v).trim(), jac: null };
  throw E(`${fn}:badFunction`, `${fn}: FCN must be a function handle, a name or a cell array.`);
}
const val1 = (ctx, f, args, fn) => {
  const r = callFn(ctx, f, args, 1);
  if (!r.length) throw E(`${fn}:noOutput`, `${fn}: the user function did not return a value.`);
  return r[0];
};

/** Splits [t0 ... tf] into integration segments at the critical times. */
function segments(times, tcrit) {
  const t0 = times[0], tf = times[times.length - 1]; const dir = Math.sign(tf - t0) || 1;
  const crit = tcrit.filter((c) => (c - t0) * dir > 0 && (c - tf) * dir < 0).sort((a, b) => (a - b) * dir);
  return { dir, bounds: [...crit, tf] };
}

// ------------------------------------------------------------ lsode
function lsode(args, nargout, ctx) {
  if (args.length < 3 || args.length > 4) throw E('lsode:nargin', 'lsode: expected lsode(fcn, x_0, t, t_crit).');
  const { f, jac } = fnPair(args[0], 'lsode');
  const x0 = Array.from(F(args[1])); const N = x0.length;
  const times = Array.from(F(args[2]));
  if (times.length < 1) throw E('lsode:badT', 'lsode: T must be a non-empty vector.');
  const tcrit = args.length > 3 && !isEmptyV(args[3]) ? Array.from(F(args[3])) : [];
  const method = getOption(ctx, 'lsode', 'integration method');
  const solver = method === 'adams' || method === 'non-stiff' ? 'ode113' : 'ode15s';
  const o = {
    RelTol: num(getOption(ctx, 'lsode', 'relative tolerance')),
    AbsTol: rowV([getOption(ctx, 'lsode', 'absolute tolerance')].flat()),
  };
  const h0 = getOption(ctx, 'lsode', 'initial step size'), hmax = getOption(ctx, 'lsode', 'maximum step size'), mo = getOption(ctx, 'lsode', 'maximum order');
  if (h0 > 0) o.InitialStep = num(h0);
  if (hmax > 0) o.MaxStep = num(hmax);
  if (mo > 0 && solver === 'ode15s') o.MaxOrder = num(Math.min(5, mo));
  const fw = jsFn(([tv, yv]) => val1(ctx, f, [yv, tv], 'lsode'), 'lsode_rhs');
  if (jac) o.Jacobian = jsFn(([tv, yv]) => val1(ctx, jac, [yv, tv], 'lsode'), 'lsode_jac');
  const opts = structOf(o);
  const Y = Array.from({ length: times.length }, () => new Array(N).fill(NaN));
  Y[0] = x0.slice();
  let istate = 2, msg = 'successful exit';
  if (times.length > 1) {
    const { dir, bounds } = segments(times, tcrit);
    let s0 = times[0], y = x0.slice(), idx = 1;
    for (const B of bounds) {
      if (idx >= times.length) break;
      const outs = [];
      while (idx < times.length && (times[idx] - B) * dir <= 0) { outs.push(idx); idx++; }
      const tsp = [s0]; const rowOf = [];
      for (const i of outs) { if (times[i] === s0) { Y[i] = y.slice(); continue; } if (times[i] !== tsp[tsp.length - 1]) tsp.push(times[i]); rowOf.push([i, tsp.length - 1]); }
      if (tsp[tsp.length - 1] !== B) tsp.push(B);
      const endRow = tsp.length - 1;
      if (tsp.length === 2) tsp.splice(1, 0, (tsp[0] + tsp[1]) / 2);
      const shift = tsp.length > endRow + 1 ? 1 : 0;
      const r = ctx.call(solver, [fw, rowV(tsp), colV(y), opts], 2);
      const yy = r[1]; const nr = yy.dims[0];
      const rowAt = (k) => Array.from({ length: N }, (_, j) => yy.re[k + nr * j]);
      if (nr < tsp.length) { istate = -1; msg = 'excess work done on this call (integration stopped before the final time)'; break; }
      for (const [i, k] of rowOf) Y[i] = rowAt(k + (k > 0 ? shift : 0));
      y = rowAt(nr - 1); s0 = B;
    }
  }
  if (istate < 0 && nargout < 2) throw E('lsode:failed', `lsode: ${msg}.`);
  const xm = new Float64Array(times.length * N);
  for (let i = 0; i < times.length; i++) for (let j = 0; j < N; j++) xm[i + times.length * j] = Y[i][j];
  return [tensor('double', [times.length, N], xm), num(istate), str(msg)].slice(0, Math.max(1, nargout));
}

// ------------------------------------------------------------ DAE solvers
function daeRun(fn, args, nargout, ctx, withRoots) {
  let g = null, rest = args;
  if (withRoots) {
    if (args.length >= 2 && (isFuncHandle(args[1]) || (isText(args[1]) && !isEmptyV(args[1])) || isCell(args[1]))) { g = isCell(args[1]) ? args[1].data[0] : args[1]; if (isText(g)) g = toStr(g).trim(); rest = [args[0], ...args.slice(2)]; }
  }
  if (rest.length < 4 || rest.length > 5) throw E(`${fn}:nargin`, `${fn}: expected ${fn}(fcn, ${withRoots ? '[g], ' : ''}x_0, xdot_0, t, t_crit).`);
  const { f, jac } = fnPair(rest[0], fn);
  const x0 = Array.from(F(rest[1])), xd0 = Array.from(F(rest[2]));
  const N = x0.length;
  if (xd0.length !== N) throw E(`${fn}:badXdot0`, `${fn}: X_0 and XDOT_0 must have the same length.`);
  const times = Array.from(F(rest[3]));
  if (!times.length) throw E(`${fn}:badT`, `${fn}: T must be a non-empty vector.`);
  const tcrit = rest.length > 4 && !isEmptyV(rest[4]) ? Array.from(F(rest[4])) : [];
  const opt = (k) => getOption(ctx, fn, k);
  const rt = opt('relative tolerance'); const at = opt('absolute tolerance');
  const o = { RelTol: num(Array.isArray(rt) ? Math.min(...rt) : rt), AbsTol: rowV(Array.isArray(at) ? at : [at]) };
  if (opt('initial step size') > 0) o.InitialStep = num(opt('initial step size'));
  if (opt('maximum step size') > 0) o.MaxStep = num(opt('maximum step size'));
  if (opt('maximum order') > 0) o.MaxOrder = num(Math.min(5, opt('maximum order')));
  const res = jsFn(([tv, yv, ypv]) => val1(ctx, f, [yv, ypv, tv], fn), `${fn}_res`);
  if (jac) {
    // Octave's jacobian is dF/dx + cj dF/dxdot; recover both parts from cj = 0 and cj = 1
    o.Jacobian = jsFn(([tv, yv, ypv]) => {
      const A = T(val1(ctx, jac, [yv, ypv, tv, num(0)], fn), fn), B = T(val1(ctx, jac, [yv, ypv, tv, num(1)], fn), fn);
      return [A, tensor('double', B.dims.slice(), B.re.map((v, i) => v - A.re[i]))];
    }, `${fn}_jac`);
  }
  if (withRoots && g) o.Events = jsFn(([tv, yv]) => {
    const v = T(val1(ctx, g, [yv, tv], fn), fn); const m = v.re.length;
    return [colV(Array.from(v.re)), colV(new Array(m).fill(1)), colV(new Array(m).fill(0))];
  }, `${fn}_roots`);
  const opts = structOf(o);
  let y = x0.slice(), yp = xd0.slice();
  // consistent initial conditions
  const icMode = fn === 'dasrt' ? 0 : opt('compute consistent initial condition');
  if (icMode) {
    let fixY, fixYp;
    if (fn === 'daspk' && icMode === 1) {
      const alg = opt('algebraic variables'); const av = Array.isArray(alg) ? alg : [alg];
      const isAlg = (i) => av.length === N && av[i] !== 0;
      fixY = x0.map((_, i) => (isAlg(i) ? 0 : 1)); fixYp = x0.map((_, i) => (isAlg(i) ? 1 : 0));
    } else if (fn === 'daspk' && icMode === 2) { fixY = new Array(N).fill(0); fixYp = new Array(N).fill(1); }
    else { fixY = new Array(N).fill(1); fixYp = new Array(N).fill(0); }
    const r = ctx.call('decic', [res, num(times[0]), colV(y), colV(fixY), colV(yp), colV(fixYp), opts], 2);
    y = Array.from(F(r[0])); yp = Array.from(F(r[1]));
  }
  const nt = times.length;
  const X = Array.from({ length: nt }, () => new Array(N).fill(NaN)), XD = Array.from({ length: nt }, () => new Array(N).fill(NaN));
  X[0] = y.slice(); XD[0] = yp.slice();
  let istate = 2, msg = 'integration completed by stepping exactly to TOUT';
  let tOut = times.slice(); let rootT = null;
  if (nt > 1) {
    const { dir, bounds } = segments(times, tcrit);
    let s0 = times[0], idx = 1;
    for (const B of bounds) {
      if (idx >= nt) break;
      const sol = ctx.call('ode15i', [res, rowV([s0, B]), colV(y), colV(yp), opts], 1)[0];
      const xs = Array.from(F(sfield(sol, 'x')));
      const tEnd = xs[xs.length - 1];
      const xe = sfield(sol, 'xe'); const hasRoot = !!(xe && !isEmptyV(xe) && F(xe).length && (tEnd - B) * dir < 0);
      if ((tEnd - B) * dir < -1e-12 * Math.max(1, Math.abs(B)) && !hasRoot) { istate = -1; msg = 'integration stopped before the final time (repeated failures or step size too small)'; break; }
      const want = [];
      while (idx < nt && (hasRoot ? (times[idx] - tEnd) * dir < 0 : (times[idx] - B) * dir <= 0)) { want.push(idx); idx++; }
      const pts = want.map((i) => times[i]);
      pts.push(hasRoot ? tEnd : B);
      const { Y, YP } = evalSol(sol, pts, ctx);
      want.forEach((i, k) => { for (let j = 0; j < N; j++) { X[i][j] = Y[k * N + j]; XD[i][j] = YP[k * N + j]; } });
      const last = pts.length - 1;
      y = Array.from({ length: N }, (_, j) => Y[last * N + j]); yp = Array.from({ length: N }, (_, j) => YP[last * N + j]);
      if (hasRoot) {
        rootT = tEnd;
        const keep = idx; // rows [0, keep) are valid
        tOut = [...times.slice(0, keep), tEnd];
        X.length = keep; XD.length = keep; X.push(y.slice()); XD.push(yp.slice());
        istate = 4; msg = 'integration completed by finding one or more roots';
        break;
      }
      s0 = B;
    }
  }
  if (istate < 0 && nargout < 3) throw E(`${fn}:failed`, `${fn}: ${msg}.`);
  const m = X.length;
  const pack = (R) => { const a = new Float64Array(m * N); for (let i = 0; i < m; i++) for (let j = 0; j < N; j++) a[i + m * j] = R[i][j]; return tensor('double', [m, N], a); };
  void rootT;
  if (withRoots) return [pack(X), pack(XD), colV(tOut), num(istate), str(msg)].slice(0, Math.max(1, nargout));
  return [pack(X), pack(XD), num(istate), str(msg)].slice(0, Math.max(1, nargout));
}
const daspk = (args, nargout, ctx) => daeRun('daspk', args, nargout, ctx, false);
const dassl = (args, nargout, ctx) => daeRun('dassl', args, nargout, ctx, false);
const dasrt = (args, nargout, ctx) => daeRun('dasrt', args, nargout, ctx, true);

// ------------------------------------------------------------ odeplot
function odeplot(args, nargout, ctx) {
  const flag = args.length > 2 ? (txt(args[2]) ?? '') : '';
  const st = ctx.state.odeplot || (ctx.state.odeplot = null);
  if (flag === 'init') {
    const tspan = Array.from(F(args[0])); const y0 = Array.from(F(args[1]));
    const lines = [];
    ctx.call('hold', [str('off')], 0);
    for (let i = 0; i < y0.length; i++) {
      const h = ctx.call('plot', [num(tspan[0]), num(y0[i]), str('-o')], 1)[0];
      lines.push(h);
      if (i === 0) ctx.call('hold', [str('on')], 0);
    }
    ctx.call('hold', [str('off')], 0);
    if (tspan.length >= 2 && tspan[tspan.length - 1] !== tspan[0]) ctx.call('xlim', [rowV([Math.min(tspan[0], tspan[tspan.length - 1]), Math.max(tspan[0], tspan[tspan.length - 1])])], 0);
    ctx.state.odeplot = { lines, t: [tspan[0]], y: y0.map((v) => [v]) };
    return bool(false);
  }
  if (flag === 'done') {
    if (st) ctx.call('drawnow', [], 0);
    ctx.state.odeplot = null;
    return bool(false);
  }
  if (flag !== '') throw E('odeplot:badFlag', `odeplot: unknown flag '${flag}'.`);
  if (!st) throw E('odeplot:notInitialized', 'odeplot: call with the "init" flag first.');
  const ts = Array.from(F(args[0])); const yt = T(args[1], 'odeplot');
  const n = st.lines.length; const k = ts.length;
  for (let c = 0; c < k; c++) { st.t.push(ts[c]); for (let i = 0; i < n; i++) st.y[i].push(yt.re[i + n * c]); }
  for (let i = 0; i < n; i++) ctx.call('set', [st.lines[i], str('XData'), rowV(st.t), str('YData'), rowV(st.y[i])], 0);
  ctx.call('drawnow', [], 0);
  return bool(false);
}

export const builtins = { lsode, daspk, dassl, dasrt, odeplot };

export const help = {
  lsode: H("Solve x' = f(x, t) and return the solution at the times T (one row per time). FCN may be a cell {f, jac} with jac(x, t). Uses the stiff BDF method by default ('integration method' in lsode_options selects non-stiff Adams). T_CRIT lists times the integrator must not step past.",
    "x' = f(x, t) 를 풀어 시각 T 에서의 해를 (시각마다 한 행) 돌려줍니다. FCN 은 {f, jac} 셀(jac(x, t))도 가능합니다. 기본은 강성 BDF 방법이며 lsode_options 의 'integration method' 로 비강성 Adams 를 고를 수 있습니다. T_CRIT 은 넘어가면 안 되는 시각입니다.",
    ['x = lsode(fcn, x_0, t)', '[x, istate, msg] = lsode(fcn, x_0, t, t_crit)']),
  daspk: H("Solve the DAE f(x, xdot, t) = 0 from consistent x_0, xdot_0 (BDF). Returns x and xdot at the times T. FCN may be {f, jac} with jac(x, xdot, t, cj) = df/dx + cj*df/dxdot. daspk_options can compute consistent initial conditions.",
    "미분대수방정식 f(x, xdot, t) = 0 을 일관된 x_0, xdot_0 에서 풉니다 (BDF). 시각 T 에서의 x 와 xdot 을 돌려줍니다. FCN 은 {f, jac} (jac(x, xdot, t, cj) = df/dx + cj*df/dxdot) 도 가능합니다. daspk_options 로 일관된 초기 조건을 계산할 수 있습니다.",
    ['[x, xdot] = daspk(fcn, x_0, xdot_0, t)', '[x, xdot, istate, msg] = daspk(fcn, x_0, xdot_0, t, t_crit)']),
  dassl: H("Solve the DAE f(x, xdot, t) = 0 (BDF) and return x and xdot at the times T; options from dassl_options.",
    "미분대수방정식 f(x, xdot, t) = 0 을 풀어 (BDF) 시각 T 에서의 x 와 xdot 을 돌려줍니다. 옵션은 dassl_options.",
    ['[x, xdot] = dassl(fcn, x_0, xdot_0, t)', '[x, xdot, istate, msg] = dassl(fcn, x_0, xdot_0, t, t_crit)']),
  dasrt: H("Solve the DAE f(x, xdot, t) = 0 and stop at the first root of the constraint functions g(x, t). t_out holds the output times (the last one is the root time when a root was found; istate is then 4).",
    "미분대수방정식 f(x, xdot, t) = 0 을 풀다가 제약 함수 g(x, t) 의 첫 근에서 멈춥니다. t_out 은 출력 시각이며 근을 찾으면 마지막 값이 근의 시각이고 istate 는 4 입니다.",
    ['[x, xdot, t_out] = dasrt(fcn, x_0, xdot_0, t)', '[x, xdot, t_out, istate, msg] = dasrt(fcn, g, x_0, xdot_0, t, t_crit)']),
  odeplot: H("ODE output function that plots the solution while it is computed; use odeset('OutputFcn', @odeplot).", "계산 중인 해를 그려 주는 ODE 출력 함수. odeset('OutputFcn', @odeplot) 으로 사용합니다.",
    ['stop = odeplot(t, y, flag)']),
};
