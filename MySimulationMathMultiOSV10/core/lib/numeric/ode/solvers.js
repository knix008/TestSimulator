// Public ODE solver builtins (ode45 ... ode15i), deval, odextend, decic.
import {
  E, F, H, num, str, empty, structOf, isStruct, isFuncHandle, isText, toStr, toNum, isEmptyV, callFn, col, V, row, sfield, EPS,
} from '../_util.js';
import * as K from '../_kernels.js';
import { setupOde, Recorder, ntrp45, ntrp45d, makeOptionSet, optionGet, ODE_FIELDS, optReader, makeTol } from './common.js';
import { rkSolve, adamsSolve, TABLEAUX } from './explicit.js';
import { bdfSolve, trSolve, rosenbrockSolve, odeResidual, implicitResidual } from './implicit.js';

function runSolver(name, args, nargout, ctx, kind = 'ode') {
  const P = setupOde(ctx, name, args, kind);
  const refine = name === 'ode45' ? 4 : 1;
  const rec = new Recorder(P, nargout, refine);
  switch (name) {
    case 'ode45': rkSolve(P, rec, TABLEAUX.DP); break;
    case 'ode23': rkSolve(P, rec, TABLEAUX.BS); break;
    case 'ode78': case 'ode89': rkSolve(P, rec, TABLEAUX.F78, { stepToOutput: true }); break;
    case 'ode113': adamsSolve(P, rec); break;
    case 'ode15s': P.implicit = true; bdfSolve(P, odeResidual(P), rec); break;
    case 'ode15i': P.implicit = true; bdfSolve(P, implicitResidual(P), rec); break;
    case 'ode23s': P.implicit = true; rosenbrockSolve(P, rec); break;
    case 'ode23t': P.implicit = true; trSolve(P, odeResidual(P), rec, 'tr'); break;
    case 'ode23tb': P.implicit = true; trSolve(P, odeResidual(P), rec, 'trbdf2'); break;
    default: throw E('ode:unknownSolver', `Unknown solver ${name}.`);
  }
  return rec.finish(name);
}

// ------------------------------------------------------------ deval
/** Evaluates a solution structure at points xs. Returns {Y: rows n×m Float64Array col-major, YP}. */
export function evalSol(sol, xs, ctx) {
  const solver = toStr(sfield(sol, 'solver') || str(''));
  const x = F(sfield(sol, 'x')); const yv = sfield(sol, 'y'); const n = yv.dims[0]; const ya = F(yv);
  const N = x.length;
  let yp = sfield(sol, 'yp');
  const idata = sfield(sol, 'idata');
  let kind = 'hermite', f3d = null, hs = null;
  if (!yp && idata) {
    const k = sfield(idata, 'kind'); if (k) kind = toStr(k);
    yp = sfield(idata, 'yp');
    const f = sfield(idata, 'f3d'); if (f && kind === 'rk45') { f3d = F(f); hs = F(sfield(idata, 'h')); }
  }
  const ypa = yp ? F(yp) : null;
  if (solver === 'pdepe') throw E('deval:pdepe', 'Use pdeval for pdepe solutions.');
  const m = xs.length; const Y = new Float64Array(n * m), YP = new Float64Array(n * m);
  const dir = N > 1 ? Math.sign(x[N - 1] - x[0]) : 1;
  const lo = Math.min(x[0], x[N - 1]), hi = Math.max(x[0], x[N - 1]);
  // bvp multipoint: x may contain repeated interface points (handled by locate)
  for (let q = 0; q < m; q++) {
    const t = xs[q];
    if (t < lo - 1e3 * EPS * Math.max(1, Math.abs(lo)) || t > hi + 1e3 * EPS * Math.max(1, Math.abs(hi))) throw E('deval:SolOutsideInterval', `Attempting to evaluate the solution outside the interval [${lo}, ${hi}] where it is defined.`);
    // locate interval i with x[i] <= t <= x[i+1] (in direction)
    let a = 0, b = N - 1;
    while (b - a > 1) { const c = (a + b) >> 1; if ((x[c] - t) * dir <= 0) a = c; else b = c; }
    let i = a; if (N === 1) { for (let r = 0; r < n; r++) Y[r + q * n] = ya[r]; continue; }
    if (x[i + 1] === x[i] && i + 2 < N) i++;
    const t0 = x[i], t1 = x[i + 1], h = t1 - t0;
    const y0 = ya.subarray(i * n, i * n + n), y1 = ya.subarray((i + 1) * n, (i + 1) * n + n);
    if (t === t1) { for (let r = 0; r < n; r++) { Y[r + q * n] = y1[r]; if (ypa) YP[r + q * n] = ypa[(i + 1) * n + r]; } continue; }
    if (f3d) {
      const Ks = []; for (let j = 0; j < 7; j++) Ks.push(f3d.subarray(j * n + i * n * 7, j * n + i * n * 7 + n));
      const hh = hs[i];
      const yv2 = ntrp45(t0, y0, hh, Ks, t), yd = ntrp45d(t0, hh, Ks, t, n);
      for (let r = 0; r < n; r++) { Y[r + q * n] = yv2[r]; YP[r + q * n] = yd[r]; }
      continue;
    }
    if (!ypa || h === 0) { const s = h ? (t - t0) / h : 0; for (let r = 0; r < n; r++) { Y[r + q * n] = y0[r] + s * (y1[r] - y0[r]); YP[r + q * n] = h ? (y1[r] - y0[r]) / h : 0; } continue; }
    const f0 = ypa.subarray(i * n, i * n + n), f1 = ypa.subarray((i + 1) * n, (i + 1) * n + n);
    const s = (t - t0) / h; const s2 = s * s, s3 = s2 * s;
    for (let r = 0; r < n; r++) {
      Y[r + q * n] = (2 * s3 - 3 * s2 + 1) * y0[r] + (s3 - 2 * s2 + s) * h * f0[r] + (-2 * s3 + 3 * s2) * y1[r] + (s3 - s2) * h * f1[r];
      YP[r + q * n] = (6 * s2 - 6 * s) / h * y0[r] + (3 * s2 - 4 * s + 1) * f0[r] + (-6 * s2 + 6 * s) / h * y1[r] + (3 * s2 - 2 * s) * f1[r];
    }
  }
  void ctx;
  return { Y, YP, n, m };
}

function devalImpl(args, nargout, ctx) {
  if (args.length < 2) throw E('deval:nargin', 'deval needs a solution structure and evaluation points.');
  let sol, xv, idx = null;
  if (isStruct(args[0])) { sol = args[0]; xv = args[1]; if (args.length > 2) idx = Array.from(F(args[2])); }
  else { xv = args[0]; sol = args[1]; if (args.length > 2) idx = Array.from(F(args[2])); }
  if (!isStruct(sol) || !sfield(sol, 'x')) throw E('deval:badSol', 'The solution must be a structure returned by an ODE, BVP or DDE solver.');
  const xs = Array.from(F(xv));
  const { Y, YP, n, m } = evalSol(sol, xs, ctx);
  const rows = idx ? idx.map((i) => i - 1) : Array.from({ length: n }, (_, i) => i);
  if (rows.some((r) => r < 0 || r >= n)) throw E('deval:badIndex', 'Component indices are out of range.');
  const pick = (A) => { const r = new Float64Array(rows.length * m); for (let q = 0; q < m; q++) rows.forEach((ri, k) => { r[k + q * rows.length] = A[ri + q * n]; }); return V(rows.length, m, r); };
  return nargout > 1 ? [pick(Y), pick(YP)] : pick(Y);
}

function odextendImpl(args, nargout, ctx) {
  const sol = args[0];
  if (!isStruct(sol)) throw E('odextend:badSol', 'The first input must be a solution structure.');
  const solver = toStr(sfield(sol, 'solver'));
  const ext = sfield(sol, 'extdata');
  const odefun = args.length > 1 && !isEmptyV(args[1]) ? args[1] : sfield(ext, 'odefun');
  const tfinal = toNum(args[2], 'tfinal');
  const x = F(sfield(sol, 'x')); const yv = sfield(sol, 'y'); const n = yv.dims[0]; const ya = F(yv);
  const N = x.length;
  const yinit = args.length > 3 && !isEmptyV(args[3]) ? args[3] : col(ya.slice((N - 1) * n, N * n));
  const opts = args.length > 4 ? args[4] : sfield(ext, 'options');
  const va = sfield(ext, 'varargin'); const extra = va && va.data ? va.data : [];
  const newSol = builtins[solver]([odefun, row([x[N - 1], tfinal]), yinit, opts, ...extra], 1, ctx);
  // concatenate meshes (drop duplicated first point)
  const x2 = F(sfield(newSol, 'x')), y2 = F(sfield(newSol, 'y'));
  const xs = Float64Array.from([...x, ...x2.slice(1)]);
  const ys = new Float64Array(n * xs.length); ys.set(ya); ys.set(y2.subarray(n), N * n);
  const id1 = sfield(sol, 'idata'), id2 = sfield(newSol, 'idata');
  const yp1 = F(sfield(id1, 'yp')), yp2 = F(sfield(id2, 'yp'));
  const yps = new Float64Array(n * xs.length); yps.set(yp1); yps.set(yp2.subarray(n), N * n);
  const out = { ...newSol.data[0] };
  out.x = row(xs); out.y = V(n, xs.length, ys);
  out.idata = structOf({ kind: str('hermite'), yp: V(n, xs.length, yps) });
  const rec = Object.create(null); for (const f of newSol.fields) rec[f] = out[f];
  return { ...newSol, data: [rec] };
}

// decic: consistent initial conditions for F(t,y,yp)=0
function decicImpl(args, nargout, ctx) {
  if (args.length < 6) throw E('decic:nargin', 'decic needs odefun, t0, y0, fixed_y0, yp0, fixed_yp0.');
  const fn = args[0]; const t0 = toNum(args[1]);
  const y = Float64Array.from(F(args[2])); const fy = Array.from(F(args[3]));
  const yp = Float64Array.from(F(args[4])); const fyp = Array.from(F(args[5]));
  const n = y.length;
  const R = optReader(args.length > 6 && isStruct(args[6]) ? args[6] : null);
  const extra = args.slice(7);
  const tol = makeTol(R, n, 'decic');
  const res = (yy, zz) => Float64Array.from(F(callFn(ctx, fn, [num(t0), col(Float64Array.from(yy)), col(Float64Array.from(zz)), ...extra], 1)[0]));
  const free = [];
  for (let i = 0; i < n; i++) { if (!fy[i]) free.push(['y', i]); }
  for (let i = 0; i < n; i++) { if (!fyp[i]) free.push(['yp', i]); }
  if (free.length < n) {
    // too many fixed: still try with what is free
  }
  let r = res(y, yp);
  for (let it = 0; it < 50; it++) {
    ctx.checkInterrupt();
    const nr = K.normInf(Array.from(r));
    if (nr <= 1e-3 * tol.rtol * Math.max(1, K.normInf(Array.from(y))) * 1e-3 || nr < 1e-14) break;
    // Jacobian wrt free variables
    const J = Array.from({ length: n }, () => new Array(free.length).fill(0));
    free.forEach(([w, i], c) => {
      const v = w === 'y' ? y : yp; const d = Math.sqrt(EPS) * Math.max(1, Math.abs(v[i]));
      const old = v[i]; v[i] = old + d; const r1 = res(y, yp); v[i] = old;
      for (let q = 0; q < n; q++) J[q][c] = (r1[q] - r[q]) / d;
    });
    const dx = K.lstsq(J, Array.from(r).map((x) => -x));
    // damped update
    let lam = 1, ok = false;
    for (let ls = 0; ls < 20; ls++) {
      const y2 = Float64Array.from(y), yp2 = Float64Array.from(yp);
      free.forEach(([w, i], c) => { if (w === 'y') y2[i] += lam * dx[c]; else yp2[i] += lam * dx[c]; });
      const r2 = res(y2, yp2);
      if (K.normInf(Array.from(r2)) < nr || ls === 19) { y.set(y2); yp.set(yp2); r = r2; ok = true; break; }
      lam /= 2;
    }
    if (!ok) break;
  }
  const outs = [col(y), col(yp)];
  if (nargout > 2) outs.push(num(K.norm2(Array.from(r))));
  return outs;
}

const solverHelp = (name, en, ko) => H(en, ko, [`[t, y] = ${name}(odefun, tspan, y0)`, `[t, y] = ${name}(odefun, tspan, y0, options)`, `[t, y, te, ye, ie] = ${name}(odefun, tspan, y0, options)`, `sol = ${name}(___)`]);

export const builtins = {
  ode45: (a, n, c) => runSolver('ode45', a, n, c),
  ode23: (a, n, c) => runSolver('ode23', a, n, c),
  ode78: (a, n, c) => runSolver('ode78', a, n, c),
  ode89: (a, n, c) => runSolver('ode89', a, n, c),
  ode113: (a, n, c) => runSolver('ode113', a, n, c),
  ode15s: (a, n, c) => runSolver('ode15s', a, n, c),
  ode23s: (a, n, c) => runSolver('ode23s', a, n, c),
  ode23t: (a, n, c) => runSolver('ode23t', a, n, c),
  ode23tb: (a, n, c) => runSolver('ode23tb', a, n, c),
  ode15i: (a, n, c) => runSolver('ode15i', a, n, c, 'implicit'),
  odeset: (a, n, c) => makeOptionSet(ODE_FIELDS, 'odeset', a, n, c),
  odeget: (a) => optionGet(ODE_FIELDS, 'odeget', a),
  deval: devalImpl,
  odextend: odextendImpl,
  decic: decicImpl,
};

export const help = {
  ode45: solverHelp('ode45', 'Solve non-stiff ODEs with an explicit Runge-Kutta (4,5) pair (Dormand-Prince).', '명시적 Runge-Kutta (4,5) 쌍(Dormand-Prince)으로 비강성 상미분방정식을 풉니다.'),
  ode23: solverHelp('ode23', 'Solve non-stiff ODEs with a low-order Runge-Kutta (2,3) pair (Bogacki-Shampine).', '저차 Runge-Kutta (2,3) 쌍(Bogacki-Shampine)으로 비강성 상미분방정식을 풉니다.'),
  ode78: solverHelp('ode78', 'Solve non-stiff ODEs with a high-order Runge-Kutta (7,8) pair.', '고차 Runge-Kutta (7,8) 쌍으로 비강성 상미분방정식을 풉니다.'),
  ode89: solverHelp('ode89', 'Solve non-stiff ODEs with a high-order Runge-Kutta pair for very tight tolerances.', '매우 엄격한 허용오차용 고차 Runge-Kutta 쌍으로 비강성 상미분방정식을 풉니다.'),
  ode113: solverHelp('ode113', 'Solve non-stiff ODEs with a variable-order Adams-Bashforth-Moulton method.', '가변 차수 Adams-Bashforth-Moulton 방법으로 비강성 상미분방정식을 풉니다.'),
  ode15s: solverHelp('ode15s', 'Solve stiff ODEs and DAEs (mass matrix) with a variable-order BDF method.', '가변 차수 BDF 방법으로 강성 상미분방정식과 DAE(질량 행렬)를 풉니다.'),
  ode23s: solverHelp('ode23s', 'Solve stiff ODEs with a modified Rosenbrock (2,3) method.', '수정 Rosenbrock (2,3) 방법으로 강성 상미분방정식을 풉니다.'),
  ode23t: solverHelp('ode23t', 'Solve moderately stiff ODEs and DAEs with the trapezoidal rule.', '사다리꼴 규칙으로 중간 강성 상미분방정식과 DAE를 풉니다.'),
  ode23tb: solverHelp('ode23tb', 'Solve stiff ODEs and DAEs with the TR-BDF2 method.', 'TR-BDF2 방법으로 강성 상미분방정식과 DAE를 풉니다.'),
  ode15i: H('Solve fully implicit differential equations f(t,y,yp) = 0 with a variable-order BDF method.', '가변 차수 BDF 방법으로 완전 음함수 미분방정식 f(t,y,yp) = 0 을 풉니다.', ['[t, y] = ode15i(odefun, tspan, y0, yp0)', '[t, y] = ode15i(odefun, tspan, y0, yp0, options)', 'sol = ode15i(___)']),
  odeset: H('Create or modify an options structure for the ODE solvers.', 'ODE 풀이기용 옵션 구조체를 만들거나 수정합니다.', ['options = odeset(Name, Value, ...)', 'options = odeset(oldopts, Name, Value, ...)', 'options = odeset(oldopts, newopts)', 'odeset']),
  odeget: H('Read a value from an ODE options structure.', 'ODE 옵션 구조체에서 값을 읽습니다.', ['v = odeget(options, Name)', 'v = odeget(options, Name, default)']),
  deval: H('Evaluate the solution structure of an ODE, BVP or DDE solver at given points.', 'ODE, BVP, DDE 풀이기의 해 구조체를 주어진 점에서 계산합니다.', ['y = deval(sol, x)', 'y = deval(sol, x, idx)', '[y, yp] = deval(___)', 'y = deval(x, sol)']),
  odextend: H('Extend the solution of an initial value problem to a new end time.', '초기값 문제의 해를 새 끝 시간까지 연장합니다.', ['solext = odextend(sol, odefun, tfinal)', 'solext = odextend(sol, [], tfinal, yinit, options)']),
  decic: H('Compute consistent initial conditions for ode15i.', 'ode15i 용 일관된 초기 조건을 계산합니다.', ['[y0new, yp0new] = decic(odefun, t0, y0, fixed_y0, yp0, fixed_yp0)', '[y0new, yp0new, resnrm] = decic(___, options)']),
};
