// Two-point boundary value problems: bvpinit, bvp4c, bvp5c, bvpset, bvpget,
// bvpxtend. Collocation with the three-point Lobatto IIIa formula (C1 cubic
// interpolant), damped Newton with a block Jacobian (finite differences of
// f at the mesh and mid points, or the FJacobian option) and residual-based
// mesh refinement.
import {
  E, F, H, num, str, structOf, isStruct, isFuncHandle, isText, toStr, toNum, isEmptyV, callFn, col, V, row, sfield, EPS, empty,
} from '../_util.js';
import * as K from '../_kernels.js';
import { makeOptionSet, optionGet, BVP_FIELDS, optReader } from './common.js';
import { evalSol } from './solvers.js';

function bvpinitImpl(args, nargout, ctx) {
  if (args.length < 2) throw E('bvpinit:nargin', 'bvpinit needs a mesh and an initial guess.');
  if (isStruct(args[0])) {
    // bvpinit(sol, [anew bnew], parameters)
    const sol = args[0]; const ab = Array.from(F(args[1]));
    const x = Array.from(F(sfield(sol, 'x'))); const yv = sfield(sol, 'y'); const n = yv.dims[0];
    const ya = F(yv); const N = x.length;
    const xs = x.slice(); const ys = [];
    for (let i = 0; i < N; i++) ys.push(Array.from(ya.subarray(i * n, i * n + n)));
    if (ab[0] < xs[0]) { xs.unshift(ab[0]); ys.unshift(ys[0].slice()); }
    const bnew = ab.length > 1 ? ab[1] : ab[0];
    if (bnew > xs[xs.length - 1]) { xs.push(bnew); ys.push(ys[ys.length - 1].slice()); }
    const Y = new Float64Array(n * xs.length); ys.forEach((y, k) => Y.set(y, k * n));
    const f = { solver: str('bvpinit'), x: row(Float64Array.from(xs)), y: V(n, xs.length, Y) };
    const p = args.length > 2 ? args[2] : sfield(sol, 'parameters');
    if (p && !isEmptyV(p)) f.parameters = p;
    f.yinit = empty();
    return structOf(f);
  }
  const x = Array.from(F(args[0]));
  if (x.length < 2) throw E('bvpinit:meshTooShort', 'The mesh must have at least two points.');
  for (let i = 1; i < x.length; i++) if (x[i] < x[i - 1]) throw E('bvpinit:meshNotMonotonic', 'The mesh must be monotonically increasing.');
  const yi = args[1];
  const extra = args.slice(3);
  let ys;
  if (isFuncHandle(yi) || isText(yi)) {
    ys = x.map((xx) => Array.from(F(callFn(ctx, isText(yi) ? toStr(yi) : yi, [num(xx), ...extra], 1)[0])));
  } else { const c = Array.from(F(yi)); ys = x.map(() => c.slice()); }
  const n = ys[0].length;
  const Y = new Float64Array(n * x.length); ys.forEach((y, k) => Y.set(y, k * n));
  const f = { solver: str('bvpinit'), x: row(Float64Array.from(x)), y: V(n, x.length, Y) };
  if (args.length > 2 && !isEmptyV(args[2])) f.parameters = args[2];
  f.yinit = yi;
  return structOf(f);
}

function bvpSolve(name, args, nargout, ctx) {
  if (args.length < 3) throw E(`${name}:nargin`, `${name} needs odefun, bcfun and solinit.`);
  const odefun = isText(args[0]) ? toStr(args[0]) : args[0];
  const bcfun = isText(args[1]) ? toStr(args[1]) : args[1];
  const init = args[2];
  if (!isStruct(init)) throw E(`${name}:badInit`, 'solinit must be a structure created with bvpinit.');
  const R = optReader(args.length > 3 && isStruct(args[3]) ? args[3] : null);
  const extra = args.slice(4);
  if (R.get('SingularTerm') !== undefined) throw E(`${name}:singularTerm`, 'The SingularTerm option is not supported.');
  const rtol = R.num('RelTol', 1e-3); const atolA = R.arr('AbsTol', [1e-6]);
  const nmax = Math.round(R.num('NMax', 5000));
  let x = Array.from(F(sfield(init, 'x')));
  const yv = sfield(init, 'y'); const n = yv.dims[0];
  const atol = atolA.length === 1 ? new Array(n).fill(atolA[0]) : atolA;
  let Y = []; { const ya = F(yv); for (let i = 0; i < x.length; i++) Y.push(Float64Array.from(ya.subarray(i * n, i * n + n))); }
  const pV = sfield(init, 'parameters');
  let p = pV && !isEmptyV(pV) ? Float64Array.from(F(pV)) : new Float64Array(0);
  const np = p.length;
  for (let i = 1; i < x.length; i++) if (x[i] === x[i - 1]) throw E(`${name}:multipoint`, 'Multipoint boundary value problems are not supported.');
  const stats = { nODEevals: 0, nBCevals: 0 };
  const f = (xx, y, pp) => {
    stats.nODEevals++;
    const a = [num(xx), col(Float64Array.from(y))]; if (np) a.push(col(Float64Array.from(pp)));
    const r = F(callFn(ctx, odefun, [...a, ...extra], 1)[0]);
    if (r.length !== n) throw E(`${name}:badOdeOutput`, `The ODE function must return a column vector of length ${n}.`);
    return Float64Array.from(r);
  };
  const bc = (ya, yb, pp) => {
    stats.nBCevals++;
    const a = [col(Float64Array.from(ya)), col(Float64Array.from(yb))]; if (np) a.push(col(Float64Array.from(pp)));
    const r = F(callFn(ctx, bcfun, [...a, ...extra], 1)[0]);
    if (r.length !== n + np) throw E(`${name}:badBcOutput`, `The boundary condition function must return a column vector of length ${n + np}.`);
    return Float64Array.from(r);
  };
  const FJ = R.get('FJacobian');
  const jacAt = (xx, y, pp, fy) => {
    if (FJ !== undefined && (isFuncHandle(FJ) || !isEmptyV(FJ))) {
      if (!isFuncHandle(FJ)) return K.rowsOf(F(FJ), n, n);
      const a = [num(xx), col(Float64Array.from(y))]; if (np) a.push(col(Float64Array.from(pp)));
      return K.rowsOf(F(callFn(ctx, FJ, [...a, ...extra], 1)[0]), n, n);
    }
    const J = K.zerosM(n, n);
    for (let j = 0; j < n; j++) {
      const d = Math.sqrt(EPS) * Math.max(Math.abs(y[j]), 1e-3);
      const yy = Float64Array.from(y); yy[j] += d; const f1 = f(xx, yy, pp);
      for (let i = 0; i < n; i++) J[i][j] = (f1[i] - fy[i]) / d;
    }
    return J;
  };
  const wnorm = (v, yref) => { let m = 0; for (let i = 0; i < v.length; i++) { const k = i % n; const s = atol[k] + rtol * Math.abs(yref[i] || 0); m = Math.max(m, Math.abs(v[i]) / s); } return m; };

  // residual of the collocation equations
  const residual = (xs, Ys, pp, keep) => {
    const N = xs.length; const fs = Ys.map((y, i) => f(xs[i], y, pp));
    const ms = [], fm = [];
    const r = new Float64Array(n * N + np);
    for (let i = 0; i < N - 1; i++) {
      const h = xs[i + 1] - xs[i]; const ym = new Float64Array(n);
      for (let k = 0; k < n; k++) ym[k] = (Ys[i][k] + Ys[i + 1][k]) / 2 - h / 8 * (fs[i + 1][k] - fs[i][k]);
      const fmi = f(xs[i] + h / 2, ym, pp); ms.push(ym); fm.push(fmi);
      for (let k = 0; k < n; k++) r[i * n + k] = Ys[i + 1][k] - Ys[i][k] - h / 6 * (fs[i][k] + 4 * fmi[k] + fs[i + 1][k]);
    }
    const b = bc(Ys[0], Ys[N - 1], pp);
    for (let k = 0; k < n + np; k++) r[(N - 1) * n + k] = b[k];
    if (keep) { keep.fs = fs; keep.ms = ms; keep.fm = fm; keep.bc = b; }
    return r;
  };
  const rnorm = (r) => { let m = 0; for (const v of r) m = Math.max(m, Math.abs(v)); return m; };

  const newton = (xs, Ys, pp) => {
    const N = xs.length; const nu = n * N + np;
    for (let it = 0; it < 60; it++) {
      ctx.checkInterrupt();
      const keep = {}; const r = residual(xs, Ys, pp, keep);
      if (!r.every(Number.isFinite)) throw E(`${name}:nonFinite`, 'The residual is not finite. Try a better initial guess.');
      // Jacobian
      const A = K.zerosM(nu, nu);
      const Jn = Ys.map((y, i) => jacAt(xs[i], y, pp, keep.fs[i]));
      for (let i = 0; i < N - 1; i++) {
        const h = xs[i + 1] - xs[i]; const Jm = jacAt(xs[i] + h / 2, keep.ms[i], pp, keep.fm[i]);
        for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
          let ml = 0, mr = 0; // (Jm*(I/2 + h/8 Ji))[a][b], (Jm*(I/2 - h/8 Ji1))[a][b]
          for (let c = 0; c < n; c++) { ml += Jm[a][c] * ((c === b ? 0.5 : 0) + h / 8 * Jn[i][c][b]); mr += Jm[a][c] * ((c === b ? 0.5 : 0) - h / 8 * Jn[i + 1][c][b]); }
          const id = a === b ? 1 : 0;
          A[i * n + a][i * n + b] = -id - h / 6 * (Jn[i][a][b] + 4 * ml);
          A[i * n + a][(i + 1) * n + b] = id - h / 6 * (Jn[i + 1][a][b] + 4 * mr);
        }
      }
      // boundary rows by finite differences
      const ya = Ys[0], yb = Ys[N - 1];
      for (let j = 0; j < n; j++) {
        const d = Math.sqrt(EPS) * Math.max(Math.abs(ya[j]), 1e-3);
        const y2 = Float64Array.from(ya); y2[j] += d; const b1 = bc(y2, yb, pp);
        const d2 = Math.sqrt(EPS) * Math.max(Math.abs(yb[j]), 1e-3);
        const y3 = Float64Array.from(yb); y3[j] += d2; const b2 = bc(ya, y3, pp);
        for (let k = 0; k < n + np; k++) { A[(N - 1) * n + k][j] += (b1[k] - keep.bc[k]) / d; A[(N - 1) * n + k][(N - 1) * n + j] += (b2[k] - keep.bc[k]) / d2; }
      }
      // parameter columns: finite differences of the whole residual
      for (let q = 0; q < np; q++) {
        const d = Math.sqrt(EPS) * Math.max(Math.abs(pp[q]), 1e-3);
        const p2 = Float64Array.from(pp); p2[q] += d; const r2 = residual(xs, Ys, p2);
        for (let k = 0; k < nu; k++) A[k][n * N + q] = (r2[k] - r[k]) / d;
      }
      const L = K.lu(A);
      if (L.singular) throw E(`${name}:SingJac`, 'Unable to solve the collocation equations -- a singular Jacobian encountered.');
      const d = K.luSolve(L, Array.from(r).map((v) => -v));
      // damped update
      const r0 = rnorm(r); let lam = 1; let accepted = false;
      const flat = new Float64Array(nu); Ys.forEach((y, i) => flat.set(y, i * n)); flat.set(pp, n * N);
      for (let ls = 0; ls < 12; ls++) {
        const Y2 = Ys.map((y, i) => { const z = new Float64Array(n); for (let k = 0; k < n; k++) z[k] = y[k] + lam * d[i * n + k]; return z; });
        const p2 = new Float64Array(np); for (let q = 0; q < np; q++) p2[q] = pp[q] + lam * d[n * N + q];
        const r2 = residual(xs, Y2, p2);
        if (rnorm(r2) < r0 || ls === 11 || r0 < 1e-13) { Ys = Y2; pp = p2; accepted = true; break; }
        lam /= 2;
      }
      if (!accepted) break;
      const dn = wnorm(d.map((v) => v * lam), flat);
      if (dn < 1e-3 && lam === 1) break;
    }
    return { Ys, pp };
  };

  let maxres = 0;
  for (let pass = 0; pass < 40; pass++) {
    const out = newton(x, Y, p); Y = out.Ys; p = out.pp;
    const N = x.length; const fs = Y.map((y, i) => f(x[i], y, p));
    // residual of the cubic interpolant at two interior Lobatto points per interval
    const res = new Array(N - 1).fill(0);
    const pts = [0.5 - Math.sqrt(21) / 14, 0.5 + Math.sqrt(21) / 14];
    for (let i = 0; i < N - 1; i++) {
      const h = x[i + 1] - x[i]; let m = 0;
      for (const s of pts) {
        const s2 = s * s, s3 = s2 * s; const S = new Float64Array(n), dS = new Float64Array(n);
        for (let k = 0; k < n; k++) {
          S[k] = (2 * s3 - 3 * s2 + 1) * Y[i][k] + (s3 - 2 * s2 + s) * h * fs[i][k] + (-2 * s3 + 3 * s2) * Y[i + 1][k] + (s3 - s2) * h * fs[i + 1][k];
          dS[k] = (6 * s2 - 6 * s) / h * Y[i][k] + (3 * s2 - 4 * s + 1) * fs[i][k] + (-6 * s2 + 6 * s) / h * Y[i + 1][k] + (3 * s2 - 2 * s) * fs[i + 1][k];
        }
        const fx = f(x[i] + s * h, S, p);
        for (let k = 0; k < n; k++) m = Math.max(m, Math.abs(dS[k] - fx[k]) / Math.max(Math.abs(fx[k]), atol[k] / rtol));
      }
      res[i] = m;
    }
    maxres = Math.max(0, ...res);
    if (maxres <= rtol) break;
    // refine
    const xs = [x[0]], ys = [Y[0]];
    for (let i = 0; i < N - 1; i++) {
      const h = x[i + 1] - x[i];
      if (res[i] > rtol) {
        const parts = res[i] > 100 * rtol ? 3 : 2;
        for (let q = 1; q < parts; q++) {
          const s = q / parts; const s2 = s * s, s3 = s2 * s; const S = new Float64Array(n);
          for (let k = 0; k < n; k++) S[k] = (2 * s3 - 3 * s2 + 1) * Y[i][k] + (s3 - 2 * s2 + s) * h * fs[i][k] + (-2 * s3 + 3 * s2) * Y[i + 1][k] + (s3 - s2) * h * fs[i + 1][k];
          xs.push(x[i] + s * h); ys.push(S);
        }
      }
      xs.push(x[i + 1]); ys.push(Y[i + 1]);
    }
    if (xs.length > nmax) { ctx.warning(`numeric:${name}:maxNewPnts`, `Unable to meet the tolerance without using more than ${nmax} mesh points. The last mesh of ${N} points and the solution are available in the output argument. The maximum residual is ${maxres.toExponential(3)}, while requested accuracy is ${rtol}.`); break; }
    x = xs; Y = ys;
  }
  const N = x.length; const fs = Y.map((y, i) => f(x[i], y, p));
  const Yd = new Float64Array(n * N), YP = new Float64Array(n * N);
  Y.forEach((y, i) => Yd.set(y, i * n)); fs.forEach((y, i) => YP.set(y, i * n));
  if (R.bool('Stats', false)) ctx.out(`The solution was obtained on a mesh of ${N} points.\nThe maximum residual is ${maxres.toExponential(3)}.\nThere were ${stats.nODEevals} calls to the ODE function.\nThere were ${stats.nBCevals} calls to the BC function.\n`);
  const fields = { solver: str(name), x: row(Float64Array.from(x)), y: V(n, N, Yd), yp: V(n, N, YP) };
  if (np) fields.parameters = col(p);
  fields.stats = structOf({ nmeshpoints: num(N), maxres: num(maxres), nODEevals: num(stats.nODEevals), nBCevals: num(stats.nBCevals) });
  return structOf(fields);
}

function bvpxtendImpl(args, nargout, ctx) {
  const sol = args[0]; const xn = toNum(args[1]);
  const x = Array.from(F(sfield(sol, 'x'))); const yv = sfield(sol, 'y'); const n = yv.dims[0]; const ya = F(yv);
  const N = x.length;
  let ynew;
  if (args.length > 2 && !isEmptyV(args[2]) && !isText(args[2])) ynew = Array.from(F(args[2]));
  else {
    // linear extrapolation using the end slope
    const { Y } = evalSol(sol, [xn < x[0] ? x[0] : x[N - 1]], ctx);
    const yp = sfield(sol, 'yp'); const ypa = yp ? F(yp) : null; const end = xn < x[0] ? 0 : N - 1;
    ynew = Array.from(Y).map((v, k) => v + (ypa ? ypa[end * n + k] : 0) * (xn - x[end]));
  }
  const xs = xn < x[0] ? [xn, ...x] : [...x, xn];
  const Yd = new Float64Array(n * xs.length);
  if (xn < x[0]) { Yd.set(ynew, 0); Yd.set(ya, n); } else { Yd.set(ya, 0); Yd.set(ynew, N * n); }
  const f = { solver: str('bvpinit'), x: row(Float64Array.from(xs)), y: V(n, xs.length, Yd) };
  const p = sfield(sol, 'parameters'); if (p) f.parameters = p;
  return structOf(f);
}

export const builtins = {
  bvpinit: bvpinitImpl,
  bvp4c: (a, n, c) => bvpSolve('bvp4c', a, n, c),
  bvp5c: (a, n, c) => bvpSolve('bvp5c', a, n, c),
  bvpset: (a, n, c) => makeOptionSet(BVP_FIELDS, 'bvpset', a, n, c),
  bvpget: (a) => optionGet(BVP_FIELDS, 'bvpget', a),
  bvpxtend: bvpxtendImpl,
};
export const help = {
  bvpinit: H('Form the initial guess structure for bvp4c and bvp5c.', 'bvp4c 와 bvp5c 용 초기 추정 구조체를 만듭니다.', ['solinit = bvpinit(x, yinit)', 'solinit = bvpinit(x, yinit, parameters)', 'solinit = bvpinit(sol, [anew bnew])']),
  bvp4c: H('Solve a two-point boundary value problem by collocation (fourth order).', '선택점(collocation) 방법으로 2점 경계값 문제를 풉니다 (4차).', ['sol = bvp4c(odefun, bcfun, solinit)', 'sol = bvp4c(odefun, bcfun, solinit, options)']),
  bvp5c: H('Solve a two-point boundary value problem by collocation.', '선택점(collocation) 방법으로 2점 경계값 문제를 풉니다.', ['sol = bvp5c(odefun, bcfun, solinit)', 'sol = bvp5c(odefun, bcfun, solinit, options)']),
  bvpset: H('Create or modify a BVP options structure.', 'BVP 옵션 구조체를 만들거나 수정합니다.', ['options = bvpset(Name, Value, ...)', 'options = bvpset(oldopts, Name, Value, ...)']),
  bvpget: H('Read a value from a BVP options structure.', 'BVP 옵션 구조체에서 값을 읽습니다.', ['v = bvpget(options, Name)', 'v = bvpget(options, Name, default)']),
  bvpxtend: H('Form a guess structure that extends the interval of a BVP solution.', 'BVP 해의 구간을 늘리는 추정 구조체를 만듭니다.', ['solinit = bvpxtend(sol, xnew)', 'solinit = bvpxtend(sol, xnew, ynew)']),
};
