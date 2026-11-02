// Octave-style optimization, least squares and quadrature:
// glpk (LP/MILP), qp, pqpnonneg, sqp, ols, gls, quadcc.
import { num, str, toNum, isStruct, isText, toStr, isCell, isFuncHandle, tensor } from '../../../value.js';
import { E, F, H, isEmptyV, sfield, S, callFn } from '../_util.js';
import * as K from '../_kernels.js';
import { simplexLP, qpSolve, kktMultipliers, rowDot } from '../optim/common.js';
import { sqp as sqpCore } from '../optim/nlcon.js';
import { T, rowsOf, mat, colV, txt } from './_h.js';

const has = (args, i) => i < args.length && !isEmptyV(args[i]);
const vecArg = (v, n, def) => { if (v == null || isEmptyV(v)) return new Array(n).fill(def); const a = Array.from(F(v)); if (a.length !== n) throw E('octave:sizeMismatch', `Expected a vector with ${n} elements.`); return a; };

// ------------------------------------------------------------ glpk
/** Multipliers of the active constraints at x for min c'x; Gi rows (<=), Ge rows (=). Returns {mu (per Gi row), nu (per Ge row)}. */
function activeDuals(c, x, G, h, Ge, lb, ub) {
  const n = x.length; const rows = [], tags = [];
  G.forEach((r, i) => { if (Math.abs(rowDot(r, x) - h[i]) <= 1e-8 * (1 + Math.abs(h[i]))) { rows.push(r); tags.push(i); } });
  for (let j = 0; j < n; j++) {
    if (Number.isFinite(lb[j]) && Math.abs(x[j] - lb[j]) <= 1e-9 * (1 + Math.abs(lb[j]))) { const r = new Array(n).fill(0); r[j] = -1; rows.push(r); tags.push(-1); }
    else if (Number.isFinite(ub[j]) && Math.abs(x[j] - ub[j]) <= 1e-9 * (1 + Math.abs(ub[j]))) { const r = new Array(n).fill(0); r[j] = 1; rows.push(r); tags.push(-1); }
  }
  const { lam, mu } = kktMultipliers(c, rows, Ge);
  const muG = new Array(G.length).fill(0);
  tags.forEach((t, k) => { if (t >= 0) muG[t] = lam[k]; });
  return { mu: muG, nu: mu.length ? mu : new Array(Ge.length).fill(0) };
}
function glpk(args, nargout, ctx) {
  const t0 = Date.now();
  if (args.length < 3) throw E('glpk:nargin', 'glpk: C, A and B are required.');
  const c = Array.from(F(args[0])); const n = c.length;
  if (!n) throw E('glpk:badC', 'glpk: C must be a non-empty vector.');
  const At = T(args[1], 'glpk', 'A');
  const m = At.dims[0];
  if (m && At.dims[1] !== n) throw E('glpk:badA', `glpk: A must have ${n} columns.`);
  const A = rowsOf(At);
  const b = Array.from(F(args[2]));
  if (b.length !== m) throw E('glpk:badB', `glpk: B must have ${m} elements.`);
  const lb = vecArg(has(args, 3) ? args[3] : null, n, 0);
  const ub = vecArg(has(args, 4) ? args[4] : null, n, Infinity);
  const ctype = has(args, 5) ? toStr(args[5]).toUpperCase() : 'S'.repeat(m);
  if (ctype.length !== m || /[^FUSLD]/.test(ctype)) throw E('glpk:badCtype', 'glpk: CTYPE must be a string of length rows(A) made of F, U, S, L and D.');
  const vartype = has(args, 6) ? toStr(args[6]).toUpperCase() : 'C'.repeat(n);
  if (vartype.length !== n || /[^CI]/.test(vartype)) throw E('glpk:badVartype', 'glpk: VARTYPE must be a string of length numel(C) made of C and I.');
  const s = has(args, 7) ? toNum(args[7]) : 1;
  if (s !== 1 && s !== -1) throw E('glpk:badSense', 'glpk: SENSE must be 1 (minimize) or -1 (maximize).');
  const param = has(args, 8) && isStruct(args[8]) ? args[8] : null;
  const itlim = param && sfield(param, 'itlim') ? toNum(sfield(param, 'itlim')) : undefined;
  const msglev = param && sfield(param, 'msglev') !== undefined ? toNum(sfield(param, 'msglev')) : 1;
  const cmin = c.map((v) => s * v);
  // rows
  const G = [], h = [], gmap = [], Ge = [], he = [], emap = [];
  for (let i = 0; i < m; i++) {
    const t = ctype[i];
    if (t === 'U') { G.push(A[i]); h.push(b[i]); gmap.push([i, -1]); }
    else if (t === 'L') { G.push(A[i].map((v) => -v)); h.push(-b[i]); gmap.push([i, 1]); }
    else if (t === 'D') { G.push(A[i]); h.push(b[i]); gmap.push([i, -1]); G.push(A[i].map((v) => -v)); h.push(b[i]); gmap.push([i, 1]); }
    else if (t === 'S') { Ge.push(A[i]); he.push(b[i]); emap.push(i); }
  }
  const intIdx = []; for (let j = 0; j < n; j++) if (vartype[j] === 'I') intIdx.push(j);
  const isMIP = intIdx.length > 0;
  let status, x = null, fbest = NaN;
  if (lb.some((v, j) => v > ub[j])) status = 4;
  else if (!isMIP) {
    const r = simplexLP(cmin, G, h, Ge, he, lb, ub, { ctx, maxIter: itlim });
    if (r.status === 1) { status = 5; x = Array.from(r.x); } else if (r.status === -2) status = 4; else if (r.status === -3) status = 6; else status = 1;
  } else {
    // branch and bound over LP relaxations
    const lb0 = lb.slice(), ub0 = ub.slice();
    for (const j of intIdx) { lb0[j] = Math.ceil(lb0[j] - 1e-9); ub0[j] = Math.floor(ub0[j] + 1e-9); }
    const stack = [{ lb: lb0, ub: ub0, bound: -Infinity }];
    let best = null, bestF = Infinity, nodes = 0, unb = false;
    while (stack.length) {
      ctx.checkInterrupt();
      const nd = stack.pop();
      if (nd.bound >= bestF - 1e-9 * (1 + Math.abs(bestF))) continue;
      if (nd.lb.some((v, j) => v > nd.ub[j])) continue;
      if (++nodes > 200000) break;
      const r = simplexLP(cmin, G, h, Ge, he, nd.lb, nd.ub, { ctx });
      if (r.status === -3) { if (nodes === 1) { unb = true; break; } continue; }
      if (r.status !== 1 || r.fval >= bestF - 1e-9 * (1 + Math.abs(bestF))) continue;
      let bj = -1, bf = 0;
      for (const j of intIdx) { const fr = Math.abs(r.x[j] - Math.round(r.x[j])); if (fr > 1e-7 && fr > bf) { bf = fr; bj = j; } }
      if (bj < 0) {
        const xi = Array.from(r.x); for (const j of intIdx) xi[j] = Math.round(xi[j]);
        const fv = cmin.reduce((a, v, j) => a + v * xi[j], 0);
        if (fv < bestF) { bestF = fv; best = xi; }
        continue;
      }
      const v = r.x[bj];
      const dn = { lb: nd.lb.slice(), ub: nd.ub.slice(), bound: r.fval }; dn.ub[bj] = Math.floor(v);
      const up = { lb: nd.lb.slice(), ub: nd.ub.slice(), bound: r.fval }; up.lb[bj] = Math.ceil(v);
      if (v - Math.floor(v) < 0.5) { stack.push(up, dn); } else { stack.push(dn, up); }
    }
    if (unb) status = 6; else if (best) { status = 5; x = best; } else status = 4;
  }
  let lambda = new Array(m).fill(NaN), red = new Array(n).fill(NaN);
  if (x) {
    fbest = c.reduce((a, v, j) => a + v * x[j], 0);
    if (!isMIP) {
      const { mu, nu } = activeDuals(cmin, x, G, h, Ge, lb, ub);
      lambda = new Array(m).fill(0);
      gmap.forEach(([i, sg], k) => { lambda[i] += sg * mu[k]; });
      emap.forEach((i, k) => { lambda[i] += -nu[k]; });
      lambda = lambda.map((v) => s * v);
      red = c.map((cv, j) => cv - A.reduce((acc, row, i) => acc + row[j] * lambda[i], 0));
    }
  } else x = new Array(n).fill(NaN);
  if (msglev >= 1 && status === 4) ctx.warning('numeric:glpk:infeasible', 'glpk: problem has no feasible solution.');
  if (msglev >= 1 && status === 6) ctx.warning('numeric:glpk:unbounded', 'glpk: problem has an unbounded solution.');
  const extra = S({ lambda: colV(lambda), redcosts: colV(red), time: (Date.now() - t0) / 1000, status });
  return [colV(x), num(fbest), num(0), extra].slice(0, Math.max(1, nargout));
}

// ------------------------------------------------------------ qp
function qp(args, nargout, ctx) {
  if (args.length < 2) throw E('qp:nargin', 'qp: X0 and H are required.');
  let opts = null;
  if (args.length > 2 && isStruct(args[args.length - 1])) { opts = args[args.length - 1]; args = args.slice(0, -1); }
  if (![2, 3, 5, 7, 10].includes(args.length)) throw E('qp:nargin', 'qp: expected qp(x0, H, q, A, b, lb, ub, A_lb, A_in, A_ub, options).');
  const Ht = T(args[1], 'qp', 'H'); const n = Ht.dims[0];
  if (Ht.dims[1] !== n) throw E('qp:badH', 'qp: H must be a square matrix.');
  const Hm = rowsOf(Ht).map((r, i) => r.map((v, j) => 0.5 * (v + Ht.re[j + i * n])));
  const q = has(args, 2) ? Array.from(F(args[2])) : new Array(n).fill(0);
  if (q.length !== n) throw E('qp:badQ', `qp: Q must have ${n} elements.`);
  let x0 = has(args, 0) ? Array.from(F(args[0])) : new Array(n).fill(0);
  if (x0.length !== n) throw E('qp:badX0', `qp: X0 must have ${n} elements.`);
  // equality constraints
  let Aeq = [], beq = [];
  if (has(args, 3)) {
    Aeq = rowsOf(T(args[3], 'qp', 'A')); beq = Array.from(F(args[4]));
    if (Aeq.some((r) => r.length !== n) || beq.length !== Aeq.length) throw E('qp:badA', 'qp: equality constraint dimensions mismatch.');
  }
  const lb = has(args, 5) ? vecArg(args[5], n, -Infinity) : null;
  const ub = has(args, 6) ? vecArg(args[6], n, Infinity) : null;
  let Ain = [], Alb = null, Aub = null;
  if (has(args, 8)) {
    Ain = rowsOf(T(args[8], 'qp', 'A_in'));
    if (Ain.some((r) => r.length !== n)) throw E('qp:badAin', `qp: A_in must have ${n} columns.`);
    Alb = has(args, 7) ? Array.from(F(args[7])) : null; Aub = has(args, 9) ? Array.from(F(args[9])) : null;
    if ((Alb && Alb.length !== Ain.length) || (Aub && Aub.length !== Ain.length)) throw E('qp:badAin', 'qp: A_lb and A_ub must have one element per row of A_in.');
  }
  const maxIter = opts && sfield(opts, 'MaxIter') !== undefined && !isEmptyV(sfield(opts, 'MaxIter')) ? toNum(sfield(opts, 'MaxIter')) : 200;
  // Octave's ordering of inequalities (in >= form): lb, -ub, A_in >= A_lb, -A_in >= -A_ub; rows with -Inf rhs are dropped
  const rows = []; // {g: <= row, h, tag}
  if (lb) lb.forEach((v, j) => { if (v > -Infinity) { const r = new Array(n).fill(0); r[j] = -1; rows.push({ g: r, h: -v }); } });
  if (ub) ub.forEach((v, j) => { if (v < Infinity) { const r = new Array(n).fill(0); r[j] = 1; rows.push({ g: r, h: v }); } });
  if (Alb) Alb.forEach((v, i) => { if (v > -Infinity) rows.push({ g: Ain[i].map((a) => -a), h: -v }); });
  if (Aub) Aub.forEach((v, i) => { if (v < Infinity) rows.push({ g: Ain[i].slice(), h: v }); });
  const G = rows.map((r) => r.g), h = rows.map((r) => r.h);
  const inf = new Array(n).fill(Infinity), ninf = new Array(n).fill(-Infinity);
  const r = qpSolve(Hm, q, G, h, Aeq, beq, Float64Array.from(ninf), Float64Array.from(inf), { ctx, x0: Float64Array.from(x0), maxIter: Math.max(maxIter, 50) * Math.max(1, n + G.length) });
  let code;
  if (r.status === -2) code = 6;
  else if (r.status === -3) code = 2;
  else if (r.status === 0) code = 3;
  else code = r.nonconvex ? 1 : 0;
  const x = Array.from(r.x);
  let obj = 0; for (let i = 0; i < n; i++) { obj += q[i] * x[i]; for (let j = 0; j < n; j++) obj += 0.5 * x[i] * Hm[i][j] * x[j]; }
  const g = q.map((v, i) => v + Hm[i].reduce((a, hh, j) => a + hh * x[j], 0));
  const act = [], tags = [];
  G.forEach((row, i) => { if (Math.abs(rowDot(row, x) - h[i]) <= 1e-8 * (1 + Math.abs(h[i]))) { act.push(row); tags.push(i); } });
  const { lam, mu } = code === 6 ? { lam: [], mu: [] } : kktMultipliers(g, act, Aeq);
  const lamIn = new Array(G.length).fill(0); tags.forEach((t, k) => { lamIn[t] = lam[k] || 0; });
  const lamEq = Aeq.map((_, k) => -(mu[k] || 0));
  const info = S({ solveiter: r.iterations, info: code });
  return [colV(x), num(obj), info, colV([...lamEq, ...lamIn])].slice(0, Math.max(1, nargout));
}

// ------------------------------------------------------------ pqpnonneg
function pqpnonneg(args, nargout, ctx) {
  if (args.length < 2) throw E('pqpnonneg:nargin', 'pqpnonneg: C and D are required.');
  const Ct = T(args[0], 'pqpnonneg', 'C'); const n = Ct.dims[0];
  if (Ct.dims[1] !== n) throw E('pqpnonneg:badC', 'pqpnonneg: C must be a square matrix.');
  const d = Array.from(F(args[1]));
  if (d.length !== n) throw E('pqpnonneg:badD', `pqpnonneg: D must have ${n} elements.`);
  let x0 = null;
  let opts = null;
  for (const a of args.slice(2)) { if (isStruct(a)) opts = a; else if (!isEmptyV(a)) x0 = Array.from(F(a)); }
  const maxIter = opts && sfield(opts, 'MaxIter') !== undefined && !isEmptyV(sfield(opts, 'MaxIter')) ? toNum(sfield(opts, 'MaxIter')) : 1e5;
  const Cm = rowsOf(Ct).map((r, i) => r.map((v, j) => 0.5 * (v + Ct.re[j + i * n])));
  const lb = new Float64Array(n), ub = new Float64Array(n).fill(Infinity);
  const r = qpSolve(Cm, d, [], [], [], [], lb, ub, { ctx, x0: x0 ? Float64Array.from(x0.map((v) => Math.max(0, v))) : null, maxIter });
  const x = Array.from(r.x, (v) => (v < 0 ? 0 : v));
  const g = d.map((v, i) => v + Cm[i].reduce((a, c, j) => a + c * x[j], 0));
  let minval = 0; for (let i = 0; i < n; i++) minval += x[i] * (d[i] + 0.5 * Cm[i].reduce((a, c, j) => a + c * x[j], 0));
  const exitflag = r.status === 1 ? Math.max(1, r.iterations) : 0;
  const lambda = g.map((v, i) => (x[i] > 0 ? 0 : v));
  const out = [colV(x), num(minval), num(exitflag), S({ algorithm: 'nnls-cholup', iterations: r.iterations }), colV(lambda)];
  return out.slice(0, Math.max(1, nargout));
}

// ------------------------------------------------------------ sqp
function fnPart(v, what) {
  if (v == null || isEmptyV(v) && !isFuncHandle(v)) return null;
  if (isCell(v)) return v.data.map((x) => fnPart(x, what));
  if (isFuncHandle(v)) return v;
  if (isText(v)) return toStr(v);
  throw E('sqp:badFunction', `sqp: ${what} must be a function handle, a name or a cell array of them.`);
}
function sqp(args, nargout, ctx) {
  if (args.length < 2 || args.length > 8) throw E('sqp:nargin', 'sqp: expected sqp(x0, phi, g, h, lb, ub, maxiter, tol).');
  const x0 = Float64Array.from(F(args[0])); const n = x0.length;
  const phi = fnPart(args[1], 'PHI'); const g = fnPart(args[2], 'G'); const hcon = fnPart(args[3], 'H');
  const [phiF, phiG] = Array.isArray(phi) ? phi : [phi, null];
  if (!phiF) throw E('sqp:badFunction', 'sqp: PHI must be a function.');
  const [gF, gJ] = Array.isArray(g) ? g : [g, null];
  const [hF, hJ] = Array.isArray(hcon) ? hcon : [hcon, null];
  const lbIn = has(args, 4) ? vecArg(args[4], n, -Infinity) : null;
  const ubIn = has(args, 5) ? vecArg(args[5], n, Infinity) : null;
  const maxiter = has(args, 6) ? toNum(args[6]) : 100;
  const tol = has(args, 7) ? toNum(args[7]) : Math.sqrt(2.220446049250313e-16);
  const cnt = { n: 0 };
  const xv = (x) => colV(Array.from(x));
  const callV = (f, x) => { const r = callFn(ctx, f, [xv(x)], 1); if (!r.length) throw E('sqp:noOutput', 'sqp: a function did not return a value.'); return Array.from(F(r[0])); };
  const f = (x) => { cnt.n++; ctx.checkInterrupt(); const v = callV(phiF, x); if (v.length !== 1) throw E('sqp:notScalar', 'sqp: PHI must return a scalar.'); return v[0]; };
  const fg = phiG ? (x) => { const v = f(x); const gr = callV(phiG, x); if (gr.length !== n) throw E('sqp:badGradient', `sqp: the gradient must have ${n} elements.`); return [v, Float64Array.from(gr)]; } : null;
  const jacRows = (J, m) => { const t = T(J, 'sqp'); const rows = []; for (let i = 0; i < m; i++) { const r = new Array(n); for (let j = 0; j < n; j++) r[j] = t.re[i + j * m]; rows.push(r); } return rows; };
  let nG = 0, nH = 0;
  if (gF) nG = callV(gF, x0).length;
  if (hF) nH = callV(hF, x0).length;
  const con = gF || hF ? (x) => {
    const ceq = gF ? callV(gF, x) : []; const hv = hF ? callV(hF, x) : [];
    const out = { c: hv.map((v) => -v), ceq };
    if ((!gF || gJ) && (!hF || hJ)) {
      out.Jceq = gF ? jacRows(callFn(ctx, gJ, [xv(x)], 1)[0], ceq.length) : [];
      out.Jc = hF ? jacRows(callFn(ctx, hJ, [xv(x)], 1)[0], hv.length).map((r) => r.map((v) => -v)) : [];
    }
    return out;
  } : null;
  const lb = Float64Array.from(lbIn || new Array(n).fill(-Infinity)), ub = Float64Array.from(ubIn || new Array(n).fill(Infinity));
  const o = S({ TolFun: tol, TolX: tol, TolCon: Math.max(tol, 1e-8), MaxIter: maxiter, MaxFunEvals: Math.max(1000, 200 * maxiter * Math.max(1, n)) });
  const r = sqpCore(ctx, { n, x0, f, fg, con, Ain: [], bin: [], Aeq: [], beq: [], lb, ub, dims: [n, 1], name: 'sqp', level: 'off', outFcn: null, cnt, o, algorithm: 'sqp' });
  let info;
  if (r.flag === 1 || r.flag === 2) info = 101;
  else if (r.flag === 0) info = 103;
  else info = 104;
  const lam = r.lam;
  const lambda = [...lam.eqnonlin.map((v) => -v), ...lam.ineqnonlin, ...(lbIn ? lam.lower : []), ...(ubIn ? lam.upper : [])];
  void nG; void nH;
  return [colV(Array.from(r.x)), num(r.fval), num(info), num(r.iter), num(r.funcCount), colV(lambda)].slice(0, Math.max(1, nargout));
}

// ------------------------------------------------------------ ols / gls
function ols(args, nargout) {
  if (args.length !== 2) throw E('ols:nargin', 'ols: expected ols(y, x).');
  const yt = T(args[0], 'ols', 'Y'), xt = T(args[1], 'ols', 'X');
  const nr = xt.dims[0], k = xt.dims[1];
  if (yt.dims[0] !== nr) throw E('ols:sizeMismatch', 'ols: number of rows of X and Y must be equal.');
  const X = rowsOf(xt), Y = rowsOf(yt); const p = yt.dims[1];
  const Xt = K.T(X); const Z = K.mul(Xt, X);
  const R = K.chol(Z);
  let beta, rnk;
  if (R) { beta = K.mul(K.inv(Z), K.mul(Xt, Y)); rnk = k; }
  else { beta = K.mul(K.pinv(X), Y); rnk = K.rank(Z); }
  const res = Y.map((row, i) => row.map((v, j) => v - X[i].reduce((a, xv, c) => a + xv * beta[c][j], 0)));
  const outs = [mat(beta, k, p)];
  if (nargout > 1) { const sg = K.mul(K.T(res), res).map((r) => r.map((v) => v / (nr - rnk))); outs.push(mat(sg, p, p)); }
  if (nargout > 2) outs.push(mat(res, nr, p));
  return outs;
}
function gls(args, nargout) {
  if (args.length !== 3) throw E('gls:nargin', 'gls: expected gls(y, x, o).');
  const yt = T(args[0], 'gls', 'Y'), xt = T(args[1], 'gls', 'X'), ot = T(args[2], 'gls', 'O');
  const rx = xt.dims[0], cx = xt.dims[1], ry = yt.dims[0], cy = yt.dims[1];
  if (rx !== ry) throw E('gls:sizeMismatch', 'gls: number of rows of X and Y must be equal.');
  const N = ry * cy;
  if (ot.dims[0] !== N || ot.dims[1] !== N) throw E('gls:badO', `gls: O must be a ${N}-by-${N} matrix.`);
  const X = rowsOf(xt);
  // z = kron(eye(cy), x)
  const Z = K.zerosM(N, cx * cy);
  for (let b = 0; b < cy; b++) for (let i = 0; i < rx; i++) for (let j = 0; j < cx; j++) Z[b * rx + i][b * cx + j] = X[i][j];
  const y = Array.from(yt.re);
  const Oi = K.inv(rowsOf(ot));
  const ZtOi = K.mul(K.T(Z), Oi);
  const u = K.mul(ZtOi, Z);
  const rk = K.rank(u);
  const bvec = rk === cx * cy ? K.mulv(K.inv(u), K.mulv(ZtOi, y)) : (() => {
    // pinv(O^-1/2 Z) O^-1/2 y via the symmetric square root of O^-1
    const { values, vectors } = K.symEig(Oi);
    const S2 = vectors.map((r) => r.map((v, j) => v * Math.sqrt(Math.max(0, values[j]))));
    const W = K.mul(S2, K.T(vectors));
    return K.mulv(K.pinv(K.mul(W, Z)), K.mulv(W, y));
  })();
  const beta = Array.from({ length: cx }, (_, i) => Array.from({ length: cy }, (_, j) => bvec[i + j * cx]));
  const outs = [mat(beta, cx, cy)];
  if (nargout > 1) {
    const r = []; for (let j = 0; j < cy; j++) for (let i = 0; i < rx; i++) r.push(y[i + j * ry] - X[i].reduce((a, xv, c) => a + xv * beta[c][j], 0));
    const v = K.dot(r, K.mulv(Oi, r)) / (rx * cy - rk);
    outs.push(num(v));
    if (nargout > 2) outs.push(tensor('double', [ry, cy], Float64Array.from(r)));
  }
  return outs;
}

// ------------------------------------------------------------ quadcc
// Nested Fejér/Clenshaw–Curtis rules on the interior Chebyshev points (no end-point evaluation)
function fejer2(nInt) {
  // nodes cos(kπ/(n+1)), k = 1..n on [-1, 1]; weights of Fejér's second rule
  const N = nInt + 1; const x = [], w = [];
  for (let k = 1; k <= nInt; k++) {
    const th = k * Math.PI / N; let s = 0;
    for (let j = 1; j <= Math.floor(N / 2); j++) s += Math.sin((2 * j - 1) * th) / (2 * j - 1);
    x.push(Math.cos(th)); w.push(4 * Math.sin(th) / N * s);
  }
  return { x, w };
}
const R15 = fejer2(15), R31 = fejer2(31);
function quadcc(args, nargout, ctx) {
  if (args.length < 3 || args.length > 5) throw E('quadcc:nargin', 'quadcc: expected quadcc(f, a, b, tol, sing).');
  const fh = isFuncHandle(args[0]) ? args[0] : isText(args[0]) ? toStr(args[0]) : null;
  if (!fh) throw E('quadcc:badFunction', 'quadcc: F must be a function handle.');
  let a = toNum(args[1]), b = toNum(args[2]);
  if (Number.isNaN(a) || Number.isNaN(b)) throw E('quadcc:badLimits', 'quadcc: integration limits must not be NaN.');
  let absTol = 1e-10, relTol = 1e-6;
  if (has(args, 3)) {
    const t = Array.from(F(args[3]));
    if (t.length === 1) relTol = t[0];
    else if (t.length === 2) { absTol = t[0]; relTol = t[1]; }
    else throw E('quadcc:badTol', 'quadcc: TOL must be a 1- or 2-element vector.');
    if (!(absTol >= 0) || !(relTol >= 0)) throw E('quadcc:badTol', 'quadcc: tolerances must be non-negative.');
  }
  let sing = has(args, 4) ? Array.from(F(args[4])) : [];
  let sign = 1;
  if (a === b) return [num(0), num(0), num(0)].slice(0, Math.max(1, nargout));
  if (a > b) { [a, b] = [b, a]; sign = -1; }
  // variable transformation for infinite limits: x = g(t)
  let g, dg, ta, tb;
  if (Number.isFinite(a) && Number.isFinite(b)) { g = (t) => t; dg = () => 1; ta = a; tb = b; }
  else if (!Number.isFinite(a) && !Number.isFinite(b)) { g = (t) => t / (1 - t * t); dg = (t) => (1 + t * t) / ((1 - t * t) ** 2); ta = -1; tb = 1; sing = sing.map((s) => (s === 0 ? 0 : (-1 + Math.sqrt(1 + 4 * s * s)) / (2 * s))); }
  else if (Number.isFinite(a)) { g = (t) => a + t / (1 - t); dg = (t) => 1 / ((1 - t) ** 2); ta = 0; tb = 1; sing = sing.map((s) => (s - a) / (1 + s - a)); }
  else { g = (t) => b - (1 - t) / t; dg = (t) => 1 / (t * t); ta = 0; tb = 1; sing = sing.map((s) => 1 / (1 + b - s)); }
  let nEval = 0; let complex = false;
  const evalAt = (ts) => {
    ctx.checkInterrupt();
    const xs = ts.map(g);
    const r = callFn(ctx, fh, [colV(xs)], 1);
    if (!r.length) throw E('quadcc:noOutput', 'quadcc: the integrand did not return a value.');
    const v = T(r[0], 'quadcc');
    if (v.re.length !== xs.length) throw E('quadcc:badOutput', 'quadcc: the integrand must be vectorized (return one value per input).');
    nEval += xs.length;
    if (v.im && v.im.some((q) => q !== 0)) complex = true;
    return ts.map((t, i) => {
      const d = dg(t);
      let re = v.re[i] * d, im = v.im ? v.im[i] * d : 0;
      if (!Number.isFinite(re)) re = 0; if (!Number.isFinite(im)) im = 0;
      return [re, im];
    });
  };
  const evalIv = (lo, hi) => {
    // the 15-point nodes are the odd-numbered (k = 2, 4, …) nodes of the 31-point rule
    const c = (lo + hi) / 2, hw = (hi - lo) / 2;
    const vals = evalAt(R31.x.map((x) => c + hw * x));
    let r2 = 0, i2 = 0, r1 = 0, i1 = 0;
    vals.forEach(([re, im], i) => { r2 += R31.w[i] * re; i2 += R31.w[i] * im; if (i % 2 === 1) { const w = R15.w[(i - 1) / 2]; r1 += w * re; i1 += w * im; } });
    r2 *= hw; i2 *= hw; r1 *= hw; i1 *= hw;
    return { lo, hi, q: [r2, i2], err: Math.hypot(r2 - r1, i2 - i1) };
  };
  const pts = [ta, ...sing.filter((s) => s > ta && s < tb).sort((p, q) => p - q), tb];
  let ivs = [];
  for (let i = 0; i + 1 < pts.length; i++) if (pts[i + 1] > pts[i]) ivs.push(evalIv(pts[i], pts[i + 1]));
  const maxIv = 2000;
  let warned = false;
  for (;;) {
    let qr = 0, qi = 0, err = 0; for (const iv of ivs) { qr += iv.q[0]; qi += iv.q[1]; err += iv.err; }
    const qa = Math.hypot(qr, qi);
    if (err <= Math.max(absTol, relTol * qa)) break;
    if (ivs.length >= maxIv) { warned = true; break; }
    let k = 0; for (let i = 1; i < ivs.length; i++) if (ivs[i].err > ivs[k].err) k = i;
    const iv = ivs[k];
    const mid = (iv.lo + iv.hi) / 2;
    if (!(mid > iv.lo && mid < iv.hi)) { iv.err = 0; continue; }
    const L = evalIv(iv.lo, mid), Rr = evalIv(mid, iv.hi);
    ivs.splice(k, 1, L, Rr);
  }
  let qr = 0, qi = 0, err = 0; for (const iv of ivs) { qr += iv.q[0]; qi += iv.q[1]; err += iv.err; }
  if (warned) ctx.warning('numeric:quadcc:maxIntervals', `quadcc: maximum number of intervals reached; error estimate ${err.toExponential(3)}.`);
  const q = complex ? tensor('double', [1, 1], Float64Array.of(sign * qr), Float64Array.of(sign * qi)) : num(sign * qr);
  return [q, num(err), num(nEval)].slice(0, Math.max(1, nargout));
}

export const builtins = { glpk, qp, pqpnonneg, sqp, ols, gls, quadcc };

export const help = {
  glpk: H('Linear and mixed-integer linear programming in the GLPK calling form: minimize or maximize c\'x subject to A x (F|U|S|L|D) b, bounds and integer variables. extra has lambda, redcosts, time and status (5 optimal, 4 infeasible, 6 unbounded).',
    'GLPK 호출 형식의 선형·혼합정수 선형 계획법: 제약 A x (F|U|S|L|D) b, 경계, 정수 변수 아래 c\'x 를 최소화/최대화. extra 에 lambda, redcosts, time, status(5 최적, 4 불가능, 6 무한) 가 담깁니다.',
    ['[xopt, fmin, errnum, extra] = glpk(c, A, b)', '[...] = glpk(c, A, b, lb, ub, ctype, vartype, sense, param)']),
  qp: H('Quadratic program min 0.5 x\'Hx + x\'q subject to A x = b, lb <= x <= ub and A_lb <= A_in x <= A_ub. info.info: 0 global, 1 local (non-convex), 2 unbounded, 3 iteration limit, 6 infeasible.',
    '이차 계획법 min 0.5 x\'Hx + x\'q (A x = b, lb <= x <= ub, A_lb <= A_in x <= A_ub). info.info: 0 전역 해, 1 국소 해(비볼록), 2 무한, 3 반복 한도, 6 불가능.',
    ['[x, obj, info, lambda] = qp(x0, H)', '[...] = qp(x0, H, q, A, b)', '[...] = qp(x0, H, q, A, b, lb, ub)', '[...] = qp(x0, H, q, A, b, lb, ub, A_lb, A_in, A_ub)', '[...] = qp(..., options)']),
  pqpnonneg: H('Non-negative quadratic program min 0.5 x\'Cx + d\'x subject to x >= 0 (C positive semidefinite).', '비음수 이차 계획법 min 0.5 x\'Cx + d\'x (x >= 0, C 양의 준정부호).', ['x = pqpnonneg(c, d)', '[x, minval, exitflag, output, lambda] = pqpnonneg(c, d, x0, options)']),
  sqp: H('Sequential quadratic programming: minimize phi(x) subject to g(x) = 0, h(x) >= 0 and lb <= x <= ub. phi, g and h may be cells {f, gradient/jacobian}. info: 101 normal, 103 iteration limit, 104 step too small.',
    '순차 이차 계획법: g(x) = 0, h(x) >= 0, lb <= x <= ub 아래 phi(x) 최소화. phi, g, h 는 {함수, 기울기/야코비안} 셀도 가능. info: 101 정상, 103 반복 한도, 104 스텝이 너무 작음.',
    ['[x, obj, info, iter, nf, lambda] = sqp(x0, phi)', '[...] = sqp(x0, phi, g, h)', '[...] = sqp(x0, phi, g, h, lb, ub, maxiter, tol)']),
  ols: H('Ordinary least squares y = x*beta + e; also returns the residual covariance sigma and the residuals.', '보통 최소제곱 y = x*beta + e. 잔차 공분산 sigma 와 잔차도 돌려줍니다.', ['[beta, sigma, r] = ols(y, x)']),
  gls: H('Generalized least squares for y = x*b + e with cov(vec(e)) = s^2 * o; returns beta, the variance estimate v and the residuals.', '일반화 최소제곱 (cov(vec(e)) = s^2 * o). beta, 분산 추정 v, 잔차를 돌려줍니다.', ['[beta, v, r] = gls(y, x, o)']),
  quadcc: H('Adaptive Clenshaw–Curtis type quadrature (nested interior Chebyshev rules) of a vectorized function; handles infinite limits, end-point singularities and listed interior singularities. Default tol [1e-10 1e-6] (absolute, relative).',
    '벡터화된 함수의 적응형 클렌쇼–커티스 방식 구적. 무한 구간, 끝점 특이점, 지정한 내부 특이점을 처리합니다. 기본 tol [1e-10 1e-6] (절대, 상대).',
    ['q = quadcc(f, a, b)', '[q, err, nr_points] = quadcc(f, a, b, tol)', '[...] = quadcc(f, a, b, tol, sing)']),
};

export { txt };
