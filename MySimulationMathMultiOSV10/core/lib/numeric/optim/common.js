// Shared pieces of the optimization solvers: option access (old and new option
// names), objective wrappers that keep the shape of x0, finite differences,
// constraint parsing, output functions, iteration display and the dense
// LP / QP / NNLS kernels used by several solvers.
import { tensor, str, isText, toStr, toNum, isCell, isStruct, isObject, toBool } from '../../../value.js';
import { E, F, M, S, oval, callFn, isEmptyV, fmtG, EPS, sfield, col } from '../_util.js';
import { zerosM, solve, lstsq, T, mulv, dot, qr as kqr } from '../_kernels.js';

export { EPS };

// ------------------------------------------------------------ arguments
/** args[i] unless missing or empty. */
export const argAt = (args, i) => (i < args.length && !isEmptyV(args[i]) ? args[i] : undefined);
/** The options struct (or object) of an argument, else null. */
export function getOpts(v) {
  if (v == null) return null;
  if (isStruct(v) && v.data.length === 1) return v;
  if (isObject(v) && v.props) return v;
  return null;
}
/** Unpacks a problem structure into positional arguments when args is a single struct with one of `keys`. */
export function fromProblem(args, order) {
  if (args.length === 1 && isStruct(args[0]) && args[0].data.length === 1) {
    const p = args[0];
    if (order.some((k) => sfield(p, k) !== undefined) && (sfield(p, order[0]) !== undefined || sfield(p, 'solver') !== undefined)) {
      return order.map((k) => sfield(p, k));
    }
  }
  return args;
}

// ------------------------------------------------------------ options
export function optRaw(o, names) {
  if (!o) return undefined;
  for (const nm of names) { const v = oval(o, nm); if (v !== undefined) return v; }
  return undefined;
}
/** Numeric option; text like '200*numberofvariables' is evaluated with nvars. */
export function optNum(o, names, def, nvars) {
  const v = optRaw(o, names);
  if (v === undefined) return def;
  if (isText(v)) {
    const s = toStr(v).toLowerCase().replace(/\s+/g, '');
    const m = /^(\d+(?:\.\d*)?(?:e[+-]?\d+)?)\*numberof(?:variables|vars)$/.exec(s);
    if (m) return Number(m[1]) * (nvars || 1);
    const x = Number(s);
    return Number.isNaN(x) ? def : x;
  }
  return toNum(v);
}
export function optStr(o, names, def) {
  const v = optRaw(o, names);
  if (v === undefined) return def;
  return isText(v) ? toStr(v) : def;
}
export function optBool(o, names, def) {
  const v = optRaw(o, names);
  if (v === undefined) return def;
  if (isText(v)) { const s = toStr(v).toLowerCase(); return s === 'on' || s === 'true' || s === 'yes' || s === 'objective'; }
  return toBool(v);
}
export function optArr(o, names, def) {
  const v = optRaw(o, names);
  if (v === undefined) return def;
  return Array.from(F(v));
}
/** Display level: 'off' | 'iter' | 'final' | 'notify'. */
export function dispLevel(o, def) {
  const s = optStr(o, ['Display'], def).toLowerCase();
  if (s === 'none' || s === 'off') return 'off';
  if (s.startsWith('iter')) return 'iter';
  if (s.startsWith('final')) return 'final';
  if (s.startsWith('notify')) return 'notify';
  return def;
}

// ------------------------------------------------------------ calling the user's functions
export const wrapX = (x, dims) => tensor('double', dims, typeof x === 'number' ? Float64Array.of(x) : Float64Array.from(x));
export const xOut = (x, dims) => tensor('double', dims, Float64Array.from(x));

/** Scalar objective f(x) → number. cnt.n counts evaluations. */
export function scalarFn(ctx, fh, dims, cnt, extra = [], what = 'objective function') {
  return (x) => {
    ctx.checkInterrupt();
    cnt.n++;
    const r = callFn(ctx, fh, [wrapX(x, dims), ...extra], 1);
    if (!r.length) throw E('optim:noOutput', `The ${what} did not return a value.`);
    const a = F(r[0], 'Objective value');
    if (a.length !== 1) throw E('optim:notScalar', `The ${what} must return a scalar value.`);
    if (r[0].im && r[0].im[0] !== 0) throw E('optim:complex', `The ${what} returned a complex value.`);
    return a[0];
  };
}
/** Objective with user gradient: (x) → [f, g]. */
export function gradFn(ctx, fh, dims, cnt, extra = []) {
  return (x) => {
    ctx.checkInterrupt();
    cnt.n++;
    const r = callFn(ctx, fh, [wrapX(x, dims), ...extra], 2);
    if (r.length < 2) throw E('optim:noGradient', 'The objective function must return the gradient as its second output when the gradient option is on.');
    const g = Float64Array.from(F(r[1]));
    if (g.length !== x.length) throw E('optim:badGradient', `The gradient must have ${x.length} elements.`);
    return [F(r[0])[0], g];
  };
}
/** Vector function F(x) → {v: Float64Array, dims, J?: rows} */
export function vecFn(ctx, fh, dims, cnt, withJac = false, extra = []) {
  return (x) => {
    ctx.checkInterrupt();
    cnt.n++;
    const r = callFn(ctx, fh, [wrapX(x, dims), ...extra], withJac ? 2 : 1);
    if (!r.length) throw E('optim:noOutput', 'The function did not return a value.');
    const out = { v: Float64Array.from(F(r[0])), dims: r[0].dims || [1, 1] };
    if (withJac) {
      if (r.length < 2) throw E('optim:noJacobian', 'The function must return the Jacobian as its second output when the Jacobian option is on.');
      const J = M(r[1]);
      out.J = [];
      for (let i = 0; i < J.m; i++) { const rr = new Array(J.n); for (let j = 0; j < J.n; j++) rr[j] = J.a[i + j * J.m]; out.J.push(rr); }
    }
    return out;
  };
}

// ------------------------------------------------------------ finite differences
function fdStep(x, j, central, lb, ub, typical) {
  const base = central ? Math.cbrt(EPS) : Math.sqrt(EPS);
  let h = base * Math.max(Math.abs(x[j]), typical ? Math.abs(typical[j] || 1) : 1);
  if (x[j] < 0) h = -h;
  if (ub && x[j] + h > ub[j]) h = -Math.abs(h);
  if (lb && x[j] + h < lb[j]) h = Math.abs(h);
  return h;
}
/** Gradient of f at x (f0 = f(x)) by forward or central differences. */
export function fdGrad(f, x, f0, opts = {}) {
  const n = x.length; const g = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    const h = fdStep(x, j, opts.central, opts.lb, opts.ub, opts.typical);
    const xp = Float64Array.from(x); xp[j] += h; const hh = xp[j] - x[j];
    if (opts.central) {
      const xm = Float64Array.from(x); xm[j] -= hh;
      g[j] = (f(xp) - f(xm)) / (2 * hh);
    } else g[j] = (f(xp) - f0) / hh;
  }
  return g;
}
/** Jacobian rows (m×n) of vector function V(x) → Float64Array, V0 = V(x). */
export function fdJac(V, x, V0, opts = {}) {
  const n = x.length, m = V0.length; const J = zerosM(m, n);
  for (let j = 0; j < n; j++) {
    const h = fdStep(x, j, opts.central, opts.lb, opts.ub, opts.typical);
    const xp = Float64Array.from(x); xp[j] += h; const hh = xp[j] - x[j];
    const vp = V(xp);
    if (opts.central) { const xm = Float64Array.from(x); xm[j] -= hh; const vm = V(xm); for (let i = 0; i < m; i++) J[i][j] = (vp[i] - vm[i]) / (2 * hh); }
    else for (let i = 0; i < m; i++) J[i][j] = (vp[i] - V0[i]) / hh;
  }
  return J;
}

// ------------------------------------------------------------ constraints
/** Linear constraint rows: {rows: number[][], rhs: number[]} */
export function linCons(A, b, n, fn, what = 'A') {
  if (A === undefined || isEmptyV(A)) {
    if (b !== undefined && !isEmptyV(b)) throw E(`${fn}:badConstraint`, `${what} is empty but its right-hand side is not.`);
    return { rows: [], rhs: [] };
  }
  const a = M(A, what);
  if (a.n !== n) throw E(`${fn}:badConstraint`, `${what} must have ${n} columns (one per variable).`);
  const rhs = b === undefined ? [] : Array.from(F(b));
  if (rhs.length !== a.m) throw E(`${fn}:badConstraint`, `The right-hand side of ${what} must have ${a.m} elements.`);
  const rows = [];
  for (let i = 0; i < a.m; i++) { const r = new Array(n); for (let j = 0; j < n; j++) r[j] = a.a[i + j * a.m]; rows.push(r); }
  return { rows, rhs };
}
/** Bounds as Float64Arrays (missing → ∓Inf). */
export function boundsOf(lbV, ubV, n, fn) {
  const lb = new Float64Array(n).fill(-Infinity), ub = new Float64Array(n).fill(Infinity);
  if (lbV !== undefined && !isEmptyV(lbV)) { const a = F(lbV); if (a.length > n) throw E(`${fn}:badBounds`, `The lower bound has more than ${n} elements.`); for (let i = 0; i < a.length; i++) lb[i] = a[i]; }
  if (ubV !== undefined && !isEmptyV(ubV)) { const a = F(ubV); if (a.length > n) throw E(`${fn}:badBounds`, `The upper bound has more than ${n} elements.`); for (let i = 0; i < a.length; i++) ub[i] = a[i]; }
  return { lb, ub, hasBounds: lb.some(Number.isFinite) || ub.some(Number.isFinite), consistent: lb.every((l, i) => l <= ub[i]) };
}
export const clampX = (x, lb, ub) => { const y = Float64Array.from(x); for (let i = 0; i < y.length; i++) { if (y[i] < lb[i]) y[i] = lb[i]; if (y[i] > ub[i]) y[i] = ub[i]; } return y; };
export const infNorm = (a) => { let s = 0; for (const x of a) { const v = Math.abs(x); if (v > s) s = v; } return s; };
export const twoNorm = (a) => { let s = 0; for (const x of a) s += x * x; return Math.sqrt(s); };
export const rowDot = (r, x) => { let s = 0; for (let j = 0; j < r.length; j++) s += r[j] * x[j]; return s; };

// ------------------------------------------------------------ output function / display
export function makeOutputFcn(ctx, o) {
  const plot = optRaw(o, ['PlotFcn', 'PlotFcns']);
  if (plot !== undefined) ctx.warning('numeric:optim:plotFcnIgnored', 'Plot functions are not drawn by this solver and are ignored; use OutputFcn to monitor progress.');
  const v = optRaw(o, ['OutputFcn', 'OutputFcns']);
  if (v === undefined) return null;
  const list = isCell(v) ? v.data : [v];
  return (x, dims, ov, state) => {
    let stop = false;
    for (const fh of list) {
      const r = callFn(ctx, fh, [wrapX(x, dims), S(ov), str(state)], 1);
      if (r.length && r[0] && r[0].re && r[0].re.length && r[0].re[0]) stop = true;
    }
    return stop;
  };
}
export const pad = (s, w) => String(s).padStart(w);
export const g4 = (x) => fmtG(x, 6);
export function finalMessage(ctx, level, exitflag, msg) {
  if (level === 'final' || level === 'iter' || (level === 'notify' && exitflag <= 0)) ctx.out(`\n${msg}\n\n`);
}
export function lambdaStruct(n, parts) {
  const o = {};
  for (const [k, v] of Object.entries(parts)) o[k] = col(Float64Array.from(v || []));
  return S(o);
}
export function outStruct(obj) { return S(obj); }

// ------------------------------------------------------------ dense LP: two-phase simplex
function pivot(Tb, r, c) {
  const pr = Tb[r]; const pv = pr[c]; const W = pr.length;
  for (let j = 0; j < W; j++) pr[j] /= pv;
  for (let i = 0; i < Tb.length; i++) {
    if (i === r) continue;
    const f = Tb[i][c]; if (f === 0) continue;
    const ti = Tb[i]; for (let j = 0; j < W; j++) ti[j] -= f * pr[j];
    ti[c] = 0;
  }
}
function simplexLoop(Tb, basis, allowed, it, ctx) {
  const m = basis.length, obj = Tb[m], W = obj.length - 1;
  let degenerate = 0;
  for (;;) {
    if (it.n >= it.max) return 0;
    it.n++;
    if (ctx && (it.n & 63) === 0) ctx.checkInterrupt();
    const bland = degenerate > 30;
    let e = -1, best = -1e-9;
    for (const j of allowed) { const d = obj[j]; if (d < -1e-9) { if (bland) { e = j; break; } if (d < best) { best = d; e = j; } } }
    if (e < 0) return 1;
    let r = -1, rmin = Infinity;
    for (let i = 0; i < m; i++) {
      const a = Tb[i][e];
      if (a > 1e-9) { const q = Tb[i][W] / a; if (q < rmin - 1e-12 || (Math.abs(q - rmin) <= 1e-12 && r >= 0 && basis[i] < basis[r])) { rmin = q; r = i; } }
    }
    if (r < 0) return -3;
    degenerate = rmin < 1e-12 ? degenerate + 1 : 0;
    pivot(Tb, r, e); basis[r] = e;
  }
}
/**
 * min c'x s.t. Ain x <= bin, Aeq x = beq, lb <= x <= ub (rows as number[][]).
 * Returns {status: 1 optimal | 0 iteration limit | -2 infeasible | -3 unbounded, x, fval, iterations}.
 */
export function simplexLP(c, Ain, bin, Aeq, beq, lb, ub, opts = {}) {
  const n = c.length;
  for (let j = 0; j < n; j++) if (lb[j] > ub[j]) return { status: -2, x: new Float64Array(n), fval: NaN, iterations: 0 };
  // variable substitution x_j = off_j + sum(sign * y)
  const off = new Float64Array(n); const ycols = []; const extraRows = [];
  for (let j = 0; j < n; j++) {
    const l = lb[j], u = ub[j];
    if (Number.isFinite(l)) { off[j] = l; ycols.push({ j, s: 1 }); if (Number.isFinite(u)) extraRows.push({ k: ycols.length - 1, rhs: u - l }); }
    else if (Number.isFinite(u)) { off[j] = u; ycols.push({ j, s: -1 }); }
    else { ycols.push({ j, s: 1 }); ycols.push({ j, s: -1 }); }
  }
  const ny = ycols.length;
  const rows = []; // {a: coeffs on y, sense: 'L'|'E', rhs}
  const toY = (r) => { const a = new Array(ny); for (let k = 0; k < ny; k++) a[k] = r[ycols[k].j] * ycols[k].s; return a; };
  const offDot = (r) => { let s = 0; for (let j = 0; j < n; j++) if (off[j] !== 0) s += r[j] * off[j]; return s; };
  Ain.forEach((r, i) => rows.push({ a: toY(r), sense: 'L', rhs: bin[i] - offDot(r) }));
  for (const er of extraRows) { const a = new Array(ny).fill(0); a[er.k] = 1; rows.push({ a, sense: 'L', rhs: er.rhs }); }
  Aeq.forEach((r, i) => rows.push({ a: toY(r), sense: 'E', rhs: beq[i] - offDot(r) }));
  const m = rows.length;
  const nSlack = rows.filter((r) => r.sense === 'L').length;
  // columns: y (ny) | slacks | artificials
  const slackOf = new Array(m).fill(-1); let sc = ny;
  rows.forEach((r, i) => { if (r.sense === 'L') slackOf[i] = sc++; });
  const needArt = []; const basis = new Array(m);
  rows.forEach((r, i) => {
    let sign = 1; if (r.rhs < 0) sign = -1;
    r.sign = sign;
    if (r.sense === 'L' && sign > 0) basis[i] = slackOf[i]; else needArt.push(i);
  });
  const nArt = needArt.length; const N = ny + nSlack + nArt; const W = N;
  const Tb = Array.from({ length: m + 1 }, () => new Float64Array(N + 1));
  rows.forEach((r, i) => {
    const t = Tb[i];
    for (let k = 0; k < ny; k++) t[k] = r.sign * r.a[k];
    if (slackOf[i] >= 0) t[slackOf[i]] = r.sign;
    t[W] = r.sign * r.rhs;
  });
  needArt.forEach((i, q) => { Tb[i][ny + nSlack + q] = 1; basis[i] = ny + nSlack + q; });
  const it = { n: 0, max: opts.maxIter || 10 * (m + N) + 1000 };
  const isArt = (j) => j >= ny + nSlack;
  let active = Array.from({ length: m }, (_, i) => i);
  if (nArt) {
    const obj = Tb[m]; obj.fill(0);
    for (const i of needArt) for (let j = 0; j <= N; j++) obj[j] -= Tb[i][j];
    for (const i of needArt) obj[basis[i]] = 0;
    const allowed = Array.from({ length: N }, (_, j) => j);
    const st = simplexLoop(Tb, basis, allowed, it, opts.ctx);
    if (st === 0) return { status: 0, x: new Float64Array(n), fval: NaN, iterations: it.n };
    const scale = 1 + rows.reduce((s, r) => s + Math.abs(r.rhs), 0);
    if (-Tb[m][W] > 1e-9 * scale) return { status: -2, x: new Float64Array(n), fval: NaN, iterations: it.n };
    // drive artificials out of the basis
    for (let i = 0; i < m; i++) {
      if (!isArt(basis[i])) continue;
      let pc = -1; for (let j = 0; j < ny + nSlack; j++) if (Math.abs(Tb[i][j]) > 1e-9) { pc = j; break; }
      if (pc >= 0) { pivot(Tb, i, pc); basis[i] = pc; } else active = active.filter((k) => k !== i);
    }
  }
  // phase II on the non-redundant rows
  const Tb2 = active.map((i) => Tb[i]); const basis2 = active.map((i) => basis[i]);
  const cy = new Float64Array(N); for (let k = 0; k < ny; k++) cy[k] = c[ycols[k].j] * ycols[k].s;
  const obj = new Float64Array(N + 1);
  for (let j = 0; j <= N; j++) obj[j] = j < N ? cy[j] : 0;
  Tb2.forEach((t, i) => { const cb = cy[basis2[i]]; if (cb !== 0) for (let j = 0; j <= N; j++) obj[j] -= cb * t[j]; });
  Tb2.push(obj);
  const allowed = Array.from({ length: ny + nSlack }, (_, j) => j);
  const st = simplexLoop(Tb2, basis2, allowed, it, opts.ctx);
  const y = new Float64Array(N);
  basis2.forEach((b, i) => { y[b] = Tb2[i][W]; });
  const x = Float64Array.from(off);
  for (let k = 0; k < ny; k++) x[ycols[k].j] += ycols[k].s * y[k];
  for (let j = 0; j < n; j++) { if (x[j] < lb[j]) x[j] = lb[j]; if (x[j] > ub[j]) x[j] = ub[j]; }
  let fval = 0; for (let j = 0; j < n; j++) fval += c[j] * x[j];
  return { status: st === 1 ? 1 : st === -3 ? -3 : 0, x, fval, iterations: it.n };
}

// ------------------------------------------------------------ NNLS (Lawson–Hanson)
/** min ||C x - d|| s.t. x >= 0; C rows m×n. Returns {x, w, iterations}. */
export function nnls(C, d, tol) {
  const m = C.length, n = m ? C[0].length : 0;
  const x = new Float64Array(n); const P = new Array(n).fill(false);
  let nrm1 = 0; for (let j = 0; j < n; j++) { let s = 0; for (let i = 0; i < m; i++) s += Math.abs(C[i][j]); nrm1 = Math.max(nrm1, s); }
  const t = tol ?? 10 * EPS * nrm1 * Math.max(m, n);
  const resid = () => { const r = new Float64Array(m); for (let i = 0; i < m; i++) { let s = d[i]; for (let j = 0; j < n; j++) s -= C[i][j] * x[j]; r[i] = s; } return r; };
  const grad = () => { const r = resid(); const w = new Float64Array(n); for (let j = 0; j < n; j++) { let s = 0; for (let i = 0; i < m; i++) s += C[i][j] * r[i]; w[j] = s; } return w; };
  let w = grad(); let iter = 0; const maxIter = 3 * n + 30;
  const subLS = () => {
    const idx = []; for (let j = 0; j < n; j++) if (P[j]) idx.push(j);
    const z = new Float64Array(n);
    if (!idx.length) return z;
    const Cp = C.map((r) => idx.map((j) => r[j]));
    const zp = lstsq(Cp, Array.from(d));
    idx.forEach((j, k) => { z[j] = zp[k]; });
    return z;
  };
  while (iter < maxIter) {
    let jmax = -1, wmax = t;
    for (let j = 0; j < n; j++) if (!P[j] && w[j] > wmax) { wmax = w[j]; jmax = j; }
    if (jmax < 0) break;
    P[jmax] = true; iter++;
    let z = subLS();
    let inner = 0;
    while (inner++ < 3 * n + 10) {
      let ok = true; for (let j = 0; j < n; j++) if (P[j] && z[j] <= 0) { ok = false; break; }
      if (ok) break;
      let alpha = Infinity;
      for (let j = 0; j < n; j++) if (P[j] && z[j] <= 0) { const a = x[j] / (x[j] - z[j]); if (a < alpha) alpha = a; }
      if (!Number.isFinite(alpha)) alpha = 0;
      for (let j = 0; j < n; j++) x[j] += alpha * (z[j] - x[j]);
      for (let j = 0; j < n; j++) if (P[j] && Math.abs(x[j]) <= t) { P[j] = false; x[j] = 0; }
      z = subLS();
    }
    for (let j = 0; j < n; j++) x[j] = P[j] ? z[j] : 0;
    w = grad();
  }
  return { x, w, iterations: iter };
}

/** Multipliers of active constraints: min ||g + Gi'λ + Ge'μ||, λ >= 0. Returns {lam, mu}. */
export function kktMultipliers(g, Gi, Ge) {
  const n = g.length; const ki = Gi.length, ke = Ge.length;
  if (!ki && !ke) return { lam: [], mu: [] };
  const C = zerosM(n, ki + 2 * ke);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < ki; k++) C[i][k] = Gi[k][i];
    for (let k = 0; k < ke; k++) { C[i][ki + k] = Ge[k][i]; C[i][ki + ke + k] = -Ge[k][i]; }
  }
  const r = nnls(C, Array.from(g, (v) => -v), 1e-14);
  const lam = Array.from(r.x.slice(0, ki)); const mu = [];
  for (let k = 0; k < ke; k++) mu.push(r.x[ki + k] - r.x[ki + ke + k]);
  return { lam, mu };
}

// ------------------------------------------------------------ convex QP: primal active set
/** Strictly convex QP from a feasible x. G x <= h, E x = e. Returns {status, x, W, lamE, lamG}. */
function qpActiveSet(H, c, E, e, G, h, x0, it, ctx) {
  const n = x0.length; let x = Float64Array.from(x0); let W = [];
  const maxIt = it.max;
  for (;;) {
    if (it.n >= maxIt) return { status: 0, x, W, lamE: new Array(E.length).fill(0), lamG: new Array(G.length).fill(0) };
    it.n++;
    if (ctx && (it.n & 31) === 0) ctx.checkInterrupt();
    const Aw = [...E, ...W.map((i) => G[i])]; const k = Aw.length;
    const K = zerosM(n + k, n + k);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) K[i][j] = H[i][j];
    for (let r = 0; r < k; r++) for (let j = 0; j < n; j++) { K[n + r][j] = Aw[r][j]; K[j][n + r] = Aw[r][j]; }
    const gk = new Array(n); for (let i = 0; i < n; i++) { let s = c[i]; for (let j = 0; j < n; j++) s += H[i][j] * x[j]; gk[i] = s; }
    const rhs = new Array(n + k).fill(0); for (let i = 0; i < n; i++) rhs[i] = -gk[i];
    const sol = solve(K, rhs);
    const p = sol.slice(0, n); const lam = sol.slice(n);
    const xn = Math.max(1, infNorm(x));
    if (infNorm(p) <= 1e-11 * xn) {
      let worst = -1, wv = -1e-10 * (1 + infNorm(gk));
      for (let t = 0; t < W.length; t++) if (lam[E.length + t] < wv) { wv = lam[E.length + t]; worst = t; }
      if (worst < 0) {
        const lamG = new Array(G.length).fill(0); W.forEach((i, t) => { lamG[i] = Math.max(0, lam[E.length + t]); });
        return { status: 1, x, W, lamE: lam.slice(0, E.length), lamG };
      }
      W.splice(worst, 1);
      continue;
    }
    let alpha = 1, block = -1;
    for (let i = 0; i < G.length; i++) {
      if (W.includes(i)) continue;
      const gp = rowDot(G[i], p);
      if (gp > 1e-14 * (1 + infNorm(G[i]))) {
        const step = Math.max(0, (h[i] - rowDot(G[i], x)) / gp);
        if (step < alpha) { alpha = step; block = i; }
      }
    }
    for (let i = 0; i < n; i++) x[i] += alpha * p[i];
    if (block >= 0) W.push(block);
  }
}
function isPD(H) {
  const n = H.length;
  const R = zerosM(n, n);
  for (let j = 0; j < n; j++) {
    let s = H[j][j]; for (let k = 0; k < j; k++) s -= R[k][j] * R[k][j];
    if (!(s > 1e-13 * (1 + Math.abs(H[j][j])))) return false;
    R[j][j] = Math.sqrt(s);
    for (let i = j + 1; i < n; i++) { let t = H[j][i]; for (let k = 0; k < j; k++) t -= R[k][j] * R[k][i]; R[j][i] = t / R[j][j]; }
  }
  return true;
}
/**
 * min 0.5 x'Hx + c'x s.t. Ain x <= bin, Aeq x = beq, lb <= x <= ub.
 * Returns {status: 1 | 0 | -2 infeasible | -3 unbounded | -6 nonconvex, x, iterations, lambda: {ineqlin, eqlin, lower, upper}}.
 */
export function qpSolve(H, c, Ain, bin, Aeq, beq, lb, ub, opts = {}) {
  const n = c.length;
  // feasible start
  let x0 = opts.x0 ? clampX(opts.x0, lb, ub) : null;
  const feasible = (x) => Ain.every((r, i) => rowDot(r, x) <= bin[i] + 1e-9 * (1 + Math.abs(bin[i]))) && Aeq.every((r, i) => Math.abs(rowDot(r, x) - beq[i]) <= 1e-9 * (1 + Math.abs(beq[i])));
  if (!x0 || !feasible(x0)) {
    const lp = simplexLP(new Array(n).fill(0), Ain, bin, Aeq, beq, lb, ub, { ctx: opts.ctx });
    if (lp.status === -2) return { status: -2, x: lp.x, iterations: lp.iterations };
    x0 = lp.x;
  }
  // bounds as rows
  const G = Ain.map((r) => r.slice()); const h = bin.slice(); const tags = Ain.map((_, i) => ['ineqlin', i]);
  for (let j = 0; j < n; j++) {
    if (Number.isFinite(ub[j])) { const r = new Array(n).fill(0); r[j] = 1; G.push(r); h.push(ub[j]); tags.push(['upper', j]); }
    if (Number.isFinite(lb[j])) { const r = new Array(n).fill(0); r[j] = -1; G.push(r); h.push(-lb[j]); tags.push(['lower', j]); }
  }
  const it = { n: 0, max: opts.maxIter || 50 * (n + G.length + Aeq.length) + 200 };
  let res;
  const hNorm = H.reduce((s, r) => Math.max(s, ...r.map(Math.abs)), 0);
  if (isPD(H)) res = qpActiveSet(H, c, Aeq, beq, G, h, x0, it, opts.ctx);
  else {
    // proximal point iterations: H + δI centred at the previous solution
    const delta = 1e-4 * Math.max(1, hNorm);
    const Hd = H.map((r, i) => r.map((v, j) => v + (i === j ? delta : 0)));
    let x = Float64Array.from(x0);
    for (let k = 0; k < 500; k++) {
      const ck = c.map((v, i) => v - delta * x[i]);
      res = qpActiveSet(Hd, ck, Aeq, beq, G, h, x, it, opts.ctx);
      const dx = infNorm(res.x.map((v, i) => v - x[i]));
      x = res.x;
      if (infNorm(x) > 1e12) return { status: -3, x, iterations: it.n };
      if (dx <= 1e-12 * Math.max(1, infNorm(x)) || res.status !== 1) break;
    }
    // detect non-convexity (negative curvature)
    let negCurv = false; for (let i = 0; i < n; i++) if (H[i][i] < -1e-14) negCurv = true;
    if (negCurv) res.nonconvex = true;
  }
  const lambda = { ineqlin: new Array(Ain.length).fill(0), eqlin: (res.lamE || []).slice(), lower: new Array(n).fill(0), upper: new Array(n).fill(0) };
  (res.lamG || []).forEach((v, i) => { const [k, j] = tags[i]; lambda[k][j] = v; });
  return { status: res.status, x: res.x, iterations: it.n, lambda, nonconvex: !!res.nonconvex };
}

/** Max constraint violation of linear constraints and bounds. */
export function linViolation(x, Ain, bin, Aeq, beq, lb, ub) {
  let v = 0;
  Ain.forEach((r, i) => { v = Math.max(v, rowDot(r, x) - bin[i]); });
  Aeq.forEach((r, i) => { v = Math.max(v, Math.abs(rowDot(r, x) - beq[i])); });
  for (let j = 0; j < x.length; j++) { v = Math.max(v, lb[j] - x[j], x[j] - ub[j]); }
  return Math.max(0, v);
}
export { zerosM, solve, lstsq, T, mulv, dot };

/** Orthonormal basis (array of n-vectors) of the null space of the rows A (m×n). */
export function svdNull(A, n) {
  const At = T(A); // n×m
  const { Q, R } = kqr(At);
  let rank = 0; const m = A.length;
  for (let i = 0; i < Math.min(n, m); i++) if (Math.abs(R[i][i]) > 1e-10 * (1 + Math.abs(R[0][0]))) rank++;
  const out = [];
  for (let k = rank; k < n; k++) out.push(Q.map((row) => row[k]));
  return out;
}
