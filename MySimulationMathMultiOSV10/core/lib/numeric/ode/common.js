// Shared machinery of the ODE solvers: option sets (odeset/odeget), problem
// set-up (function calls, mass matrix, Jacobian, NonNegative), error norms,
// the initial step heuristic and the output driver (output points, Refine,
// events, OutputFcn, sol structures, statistics).
import {
  E, F, num, str, empty, struct, structOf, cell, cellRow, isStruct, isFuncHandle, isText, toStr, toNum,
  isEmptyV, callFn, col, V, row, sfield, tryCall, tensor, EPS, isObject,
} from '../_util.js';
import * as K from '../_kernels.js';

// ------------------------------------------------------------ option sets
export const ODE_FIELDS = ['AbsTol', 'BDF', 'Events', 'InitialStep', 'Jacobian', 'JConstant', 'JPattern', 'Mass', 'MassSingular',
  'MaxOrder', 'MaxStep', 'NonNegative', 'NormControl', 'OutputFcn', 'OutputSel', 'Refine', 'RelTol', 'Stats', 'Vectorized',
  'MStateDependence', 'MvPattern', 'InitialSlope'];
export const BVP_FIELDS = ['AbsTol', 'RelTol', 'SingularTerm', 'FJacobian', 'BCJacobian', 'Stats', 'NMax', 'Vectorized'];
export const DDE_FIELDS = ['AbsTol', 'Events', 'InitialStep', 'InitialY', 'Jumps', 'MaxStep', 'NormControl', 'OutputFcn', 'OutputSel', 'Refine', 'RelTol', 'Stats'];

function matchField(fields, name, fname) {
  const k = name.toLowerCase();
  const exact = fields.find((f) => f.toLowerCase() === k);
  if (exact) return exact;
  const c = fields.filter((f) => f.toLowerCase().startsWith(k));
  if (c.length === 1) return c[0];
  if (c.length > 1) throw E(`${fname}:ambiguousName`, `Ambiguous property name '${name}' (${c.join(', ')}).`);
  throw E(`${fname}:invalidPropertyName`, `Unrecognized property name '${name}'.`);
}

/** odeset / bvpset / ddeset. */
export function makeOptionSet(fields, fname, args, nargout, ctx) {
  if (!args.length && nargout === 0) {
    ctx.out(fields.map((f) => `${f.padStart(18)}: [ ]\n`).join(''));
    return undefined;
  }
  const rec = Object.create(null);
  for (const f of fields) rec[f] = empty();
  let i = 0;
  while (i < args.length && (isStruct(args[i]) || isEmptyV(args[i]) && !isText(args[i]))) {
    const s = args[i];
    if (isStruct(s) && s.data.length) {
      for (const f of s.fields) {
        const v = s.data[0][f];
        if (isEmptyV(v) && !isFuncHandle(v)) continue;
        rec[matchField(fields, f, fname)] = v;
      }
    }
    i++;
  }
  if ((args.length - i) % 2) throw E(`${fname}:badArgs`, 'Arguments must occur in name-value pairs.');
  for (; i < args.length; i += 2) {
    if (!isText(args[i])) throw E(`${fname}:badArgs`, `Expected a property name at argument ${i + 1}.`);
    rec[matchField(fields, toStr(args[i]), fname)] = args[i + 1];
  }
  return struct([1, 1], fields, [rec]);
}
/** odeget(options, name, default) */
export function optionGet(fields, fname, args) {
  if (args.length < 2) throw E(`${fname}:nargin`, `${fname} needs an options structure and a property name.`);
  const s = args[0]; const name = toStr(args[1], 'Property name');
  const def = args.length > 2 ? args[2] : empty();
  if (isEmptyV(s)) return def;
  if (!isStruct(s)) throw E(`${fname}:badOptions`, 'First argument must be an options structure.');
  const f = matchField(fields, name, fname);
  const v = sfield(s, f);
  if (v === undefined || (isEmptyV(v) && !isFuncHandle(v))) return def;
  return v;
}

/** Option reader over a struct (or nothing). */
export function optReader(s) {
  const get = (name) => {
    if (!s || !isStruct(s)) return undefined;
    const v = sfield(s, name);
    if (v === undefined || (isEmptyV(v) && !isFuncHandle(v))) return undefined;
    return v;
  };
  return {
    raw: s,
    get,
    num(name, def) { const v = get(name); return v === undefined ? def : toNum(v, name); },
    arr(name, def) { const v = get(name); return v === undefined ? def : Array.from(F(v)); },
    str(name, def) { const v = get(name); return v === undefined ? def : isText(v) ? toStr(v) : def; },
    bool(name, def) {
      const v = get(name); if (v === undefined) return def;
      if (isText(v)) { const t = toStr(v).toLowerCase(); return t === 'on' || t === 'true' || t === 'yes'; }
      return toNum(v) !== 0;
    },
  };
}

// ------------------------------------------------------------ norms
/** Tolerances → weights helper. */
export function makeTol(R, n, what = 'ode') {
  const rtol = R.num('RelTol', 1e-3);
  if (!(rtol > 0)) throw E(`${what}:badRelTol`, 'RelTol must be a positive scalar.');
  let atol = R.arr('AbsTol', [1e-6]);
  if (atol.some((x) => !(x > 0))) throw E(`${what}:badAbsTol`, 'AbsTol must be positive.');
  if (atol.length === 1) atol = new Array(n).fill(atol[0]);
  else if (atol.length !== n) throw E(`${what}:badAbsTol`, 'AbsTol must be a scalar or a vector of length numel(y0).');
  const rt = Math.max(rtol, 100 * EPS);
  const normControl = R.bool('NormControl', false);
  return {
    rtol: rt, atol, normControl,
    /** error norm of e relative to max(|ya|,|yb|) */
    err(e, ya, yb) {
      if (normControl) {
        const ne = K.norm2(e); const ny = Math.max(K.norm2(ya), yb ? K.norm2(yb) : 0);
        const at = Math.max(...atol);
        return ne / Math.max(rt * ny, at);
      }
      let m = 0;
      for (let i = 0; i < e.length; i++) {
        const sc = Math.max(rt * Math.max(Math.abs(ya[i]), yb ? Math.abs(yb[i]) : 0), atol[i]);
        const v = Math.abs(e[i]) / sc; if (v > m || Number.isNaN(v)) m = Number.isNaN(v) ? Infinity : v;
      }
      return m;
    },
  };
}

// ------------------------------------------------------------ problem set-up
/**
 * Parses (f, tspan, y0, options, extra...) and returns the problem record.
 * kind: 'ode' (explicit/stiff), 'implicit' (ode15i: f, tspan, y0, yp0, options).
 */
export function setupOde(ctx, solver, args, kind = 'ode') {
  const minArgs = kind === 'implicit' ? 4 : 3;
  if (args.length < minArgs) throw E(`${solver}:nargin`, `${solver} needs at least ${minArgs} inputs.`);
  const fh = args[0];
  if (!isFuncHandle(fh) && !isText(fh)) throw E(`${solver}:badFunction`, 'The first input must be a function handle.');
  const fn = isText(fh) ? toStr(fh) : fh;
  const tspan = Array.from(F(args[1], 'tspan'));
  if (tspan.length < 2) throw E(`${solver}:tspanTooShort`, 'The time span vector must have at least two elements.');
  if (tspan.some((x) => !Number.isFinite(x))) throw E(`${solver}:badTspan`, 'tspan must contain finite values.');
  const dir = Math.sign(tspan[tspan.length - 1] - tspan[0]);
  if (!dir) throw E(`${solver}:tspanEqual`, 'The first and last entries of tspan must be different.');
  for (let i = 1; i < tspan.length; i++) if ((tspan[i] - tspan[i - 1]) * dir < 0) throw E(`${solver}:tspanNotMonotonic`, 'The entries in tspan must strictly increase or decrease.');
  const y0v = args[2];
  if (y0v && y0v.im && y0v.im.some((x) => x !== 0)) throw E(`${solver}:complexY0`, 'Complex initial conditions are not supported.');
  const y0 = Float64Array.from(F(y0v, 'y0'));
  const n = y0.length;
  if (!n) throw E(`${solver}:emptyY0`, 'The initial condition vector must not be empty.');
  let yp0 = null, optIdx = 3;
  if (kind === 'implicit') { yp0 = Float64Array.from(F(args[3], 'yp0')); if (yp0.length !== n) throw E(`${solver}:badYp0`, 'yp0 must have the same length as y0.'); optIdx = 4; }
  const optsV = args.length > optIdx ? args[optIdx] : null;
  if (optsV && !isEmptyV(optsV) && !isStruct(optsV)) throw E(`${solver}:badOptions`, 'The options argument must be a structure created with odeset.');
  const R = optReader(optsV && isStruct(optsV) ? optsV : null);
  const extra = args.slice(optIdx + 1);
  const stats = { nsteps: 0, nfailed: 0, nfevals: 0, npds: 0, ndecomps: 0, nsolves: 0 };
  const tol = makeTol(R, n, solver);
  const nonneg = R.arr('NonNegative', []).map((i) => i - 1);
  if (nonneg.some((i) => i < 0 || i >= n || !Number.isInteger(i))) throw E(`${solver}:badNonNegative`, 'NonNegative indices must be in 1..numel(y0).');

  const P = {
    ctx, solver, fn, fh: args[0], tspan, dir, t0: tspan[0], tf: tspan[tspan.length - 1], y0, yp0, n, R, opts: optsV, extra, stats, tol, nonneg,
    hmax: Math.abs(R.num('MaxStep', 0.1 * Math.abs(tspan[tspan.length - 1] - tspan[0]))),
    h0: R.get('InitialStep') !== undefined ? Math.abs(R.num('InitialStep')) : null,
  };
  if (!(P.hmax > 0)) throw E(`${solver}:badMaxStep`, 'MaxStep must be positive.');

  if (kind === 'ode') {
    const raw = (t, y) => {
      stats.nfevals++;
      const r = callFn(ctx, fn, [num(t), col(Float64Array.from(y)), ...extra], 1);
      if (!r.length) throw E(`${solver}:noOutput`, 'The ODE function did not return a value.');
      const v = F(r[0]);
      if (v.length !== n) throw E(`${solver}:badOutputSize`, `The ODE function must return a column vector of length ${n}; it returned ${v.length} elements.`);
      return Float64Array.from(v);
    };
    P.f = nonneg.length ? (t, y) => { const fy = raw(t, y); for (const i of nonneg) if (y[i] <= 0) fy[i] = Math.max(fy[i], 0); return fy; } : raw;
    setupMass(P);
    setupJacobian(P);
  }
  return P;
}

function toRowsVal(v, n, what, solver) {
  const t = F(v); const d = v.dims || [1, 1];
  if (d[0] !== n || (d.length === 2 ? d[1] : 0) !== n) throw E(`${solver}:badSize`, `${what} must be a ${n}-by-${n} matrix.`);
  return K.rowsOf(t, n, n);
}

function setupMass(P) {
  const { R, n, ctx, solver, extra, stats } = P;
  const Mv = R.get('Mass');
  const dep = (R.str('MStateDependence', 'weak') || 'weak').toLowerCase();
  P.massDep = dep;
  if (Mv === undefined) { P.mass = null; return; }
  if (isFuncHandle(Mv) || isText(Mv)) {
    const fnM = isText(Mv) ? toStr(Mv) : Mv;
    P.mass = (t, y) => {
      const a = dep === 'none' ? [num(t), ...extra] : [num(t), col(Float64Array.from(y)), ...extra];
      const r = callFn(ctx, fnM, a, 1);
      return toRowsVal(r[0], n, 'The mass matrix', solver);
    };
    P.massConst = false;
  } else {
    const M0 = toRowsVal(Mv, n, 'The mass matrix', solver);
    P.mass = () => M0; P.massConst = true;
  }
  P.massSingular = (R.str('MassSingular', 'maybe') || 'maybe').toLowerCase();
  void stats;
}

/** numerical Jacobian of fun(t,y) (fy = fun(t,y)); groups: column groups; pattern rows (optional). */
export function fdJacobian(fun, t, y, fy, tol, groups = null, pattern = null) {
  const n = y.length; const m = fy.length; const J = K.zerosM(m, n);
  const del = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    const thresh = tol ? tol.atol[j] : 1e-6;
    let d = Math.sqrt(EPS) * Math.max(Math.abs(y[j]), thresh);
    if (y[j] < 0) d = -d;
    const tmp = y[j] + d; d = tmp - y[j];
    del[j] = d || Math.sqrt(EPS);
  }
  const gs = groups || Array.from({ length: n }, (_, j) => [j]);
  for (const g of gs) {
    const yy = Float64Array.from(y);
    for (const j of g) yy[j] += del[j];
    const f1 = fun(t, yy);
    if (g.length === 1) { const j = g[0]; for (let i = 0; i < m; i++) J[i][j] = (f1[i] - fy[i]) / del[j]; }
    else for (let i = 0; i < m; i++) { for (const j of g) if (pattern[i][j]) { J[i][j] = (f1[i] - fy[i]) / del[j]; break; } }
  }
  return J;
}
/** Column groups for a sparsity pattern (rows of booleans): greedy colouring. */
export function colorGroups(pattern, n) {
  const groups = []; const rowsUsed = [];
  for (let j = 0; j < n; j++) {
    const rowsJ = []; for (let i = 0; i < pattern.length; i++) if (pattern[i][j]) rowsJ.push(i);
    let placed = false;
    for (let g = 0; g < groups.length; g++) {
      if (rowsJ.every((i) => !rowsUsed[g].has(i))) { groups[g].push(j); rowsJ.forEach((i) => rowsUsed[g].add(i)); placed = true; break; }
    }
    if (!placed) { groups.push([j]); rowsUsed.push(new Set(rowsJ)); }
  }
  return groups;
}

function setupJacobian(P) {
  const { R, n, ctx, solver, extra, stats } = P;
  const Jv = R.get('Jacobian');
  const Jp = R.get('JPattern');
  if (Jv !== undefined && (isFuncHandle(Jv) || isText(Jv))) {
    const fnJ = isText(Jv) ? toStr(Jv) : Jv;
    P.jacF = (t, y) => { stats.npds++; const r = callFn(ctx, fnJ, [num(t), col(Float64Array.from(y)), ...extra], 1); return toRowsVal(r[0], n, 'The Jacobian', solver); };
    P.jacConst = R.bool('JConstant', false);
  } else if (Jv !== undefined) {
    const J0 = toRowsVal(Jv, n, 'The Jacobian', solver);
    P.jacF = () => J0; P.jacConst = true;
  } else {
    let groups = null, pattern = null;
    if (Jp !== undefined) { pattern = K.rowsOf(F(Jp), n, n).map((r) => r.map((x) => x !== 0)); groups = colorGroups(pattern, n); }
    P.jacF = (t, y, fy) => { stats.npds++; return fdJacobian(P.f, t, y, fy || P.f(t, y), P.tol, groups, pattern); };
    P.jacConst = false;
  }
}

/** M*v (M rows or null = identity) */
export const mmul = (M, v) => (M ? Float64Array.from(K.mulv(M, v)) : Float64Array.from(v));

/** Solve M x = b for the explicit solvers (mass matrix). */
export function explicitRhs(P) {
  if (!P.mass) return P.f;
  if (P.massConst) {
    const F0 = K.lu(P.mass(P.t0, P.y0));
    if (F0.singular) throw E(`${P.solver}:singularMass`, `${P.solver} cannot solve problems with a singular mass matrix. Use ode15s or ode23t.`);
    return (t, y) => Float64Array.from(K.luSolve(F0, P.f(t, y)));
  }
  return (t, y) => {
    const Ft = K.lu(P.mass(t, y));
    if (Ft.singular) throw E(`${P.solver}:singularMass`, `${P.solver} cannot solve problems with a singular mass matrix. Use ode15s or ode23t.`);
    return Float64Array.from(K.luSolve(Ft, P.f(t, y)));
  };
}

/** Initial step size (pow = 1/(order+1)). */
export function initialStep(P, f0, pow) {
  if (P.h0) return Math.min(P.h0, P.hmax, Math.abs(P.tf - P.t0));
  const { tol, y0, t0 } = P;
  const span = Math.abs(P.tf - t0);
  let absh = Math.min(P.hmax, span);
  let rh = 0;
  for (let i = 0; i < y0.length; i++) {
    const thr = tol.atol[i] / tol.rtol;
    rh = Math.max(rh, Math.abs(f0[i]) / Math.max(Math.abs(y0[i]), thr));
  }
  rh /= 0.8 * Math.pow(tol.rtol, pow);
  if (absh * rh > 1) absh = 1 / rh;
  const hmin = 16 * EPS * Math.abs(t0);
  return Math.max(absh, hmin, 1e-300);
}

// ------------------------------------------------------------ interpolants
export function hermite(t0, y0, f0, t1, y1, f1) {
  const h = t1 - t0; const n = y0.length;
  return (t) => {
    const s = (t - t0) / h; const s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    const r = new Float64Array(n);
    for (let i = 0; i < n; i++) r[i] = h00 * y0[i] + h10 * h * f0[i] + h01 * y1[i] + h11 * h * f1[i];
    return r;
  };
}
export function hermiteDeriv(t0, y0, f0, t1, y1, f1, t) {
  const h = t1 - t0; const s = (t - t0) / h; const n = y0.length; const r = new Float64Array(n);
  const d00 = (6 * s * s - 6 * s) / h, d10 = 3 * s * s - 4 * s + 1, d01 = (-6 * s * s + 6 * s) / h, d11 = 3 * s * s - 2 * s;
  for (let i = 0; i < n; i++) r[i] = d00 * y0[i] + d10 * f0[i] + d01 * y1[i] + d11 * f1[i];
  return r;
}
/** Lagrange interpolant through nodes ts with vectors ys. */
export function lagrange(ts, ys) {
  const k = ts.length; const n = ys[0].length;
  return (t) => {
    const r = new Float64Array(n);
    for (let j = 0; j < k; j++) {
      let l = 1; for (let m = 0; m < k; m++) if (m !== j) l *= (t - ts[m]) / (ts[j] - ts[m]);
      if (l !== 0) for (let i = 0; i < n; i++) r[i] += l * ys[j][i];
    }
    return r;
  };
}

// ------------------------------------------------------------ output driver
function evCall(P, ev, t, y) {
  const r = callFn(P.ctx, ev, [num(t), col(Float64Array.from(y)), ...P.extra], 3);
  if (!r.length) throw E(`${P.solver}:events`, 'The events function did not return a value.');
  const v = Array.from(F(r[0]));
  const nn = v.length;
  const term = r[1] && !isEmptyV(r[1]) ? Array.from(F(r[1])) : new Array(nn).fill(0);
  const dirs = r[2] && !isEmptyV(r[2]) ? Array.from(F(r[2])) : new Array(nn).fill(0);
  const fillTo = (a) => (a.length === 1 && nn > 1 ? new Array(nn).fill(a[0]) : a);
  return { v, term: fillTo(term), dirs: fillTo(dirs) };
}
const crossed = (a, b, d) => (d >= 0 && a < 0 && b >= 0) || (d <= 0 && a > 0 && b <= 0);

/**
 * Output recorder used by every time-stepping solver.
 * opts: { nargout, refine, solKind ('ode45' adds f3d), hasYp }
 */
export class Recorder {
  constructor(P, nargout, refine = 1) {
    this.P = P; this.nargout = nargout; this.refine = Math.max(1, Math.round(P.R ? P.R.num('Refine', refine) : refine));
    this.wantSol = nargout === 1 && !P.forceArrays;
    this.tout = []; this.yout = [];
    this.xs = []; this.ys = []; this.yps = []; this.f3d = [];
    this.te = []; this.ye = []; this.ie = [];
    this.next = 1; // tspan index (when > 2 points)
    const ev = P.R ? P.R.get('Events') : undefined;
    this.ev = ev === undefined ? null : (isText(ev) ? toStr(ev) : ev);
    const of = P.R ? P.R.get('OutputFcn') : undefined;
    this.outFcn = of === undefined ? null : (isText(of) ? toStr(of) : of);
    this.outSel = P.R ? P.R.arr('OutputSel', null) : null;
    this.stopped = false;
  }
  start(t0, y0, yp0) {
    const P = this.P;
    this.xs.push(t0); this.ys.push(Float64Array.from(y0)); this.yps.push(yp0 ? Float64Array.from(yp0) : null);
    this.tout.push(t0); this.yout.push(Float64Array.from(y0));
    if (this.ev) { this.evPrev = evCall(P, this.ev, t0, y0); }
    if (this.outFcn) {
      const r = callFn(P.ctx, this.outFcn, [row([P.tspan[0], P.tspan[P.tspan.length - 1]]), col(this.sel(y0)), str('init')], 0);
      void r;
    }
  }
  sel(y) { return this.outSel ? Float64Array.from(this.outSel.map((i) => y[i - 1])) : y; }
  /** Locate events in (t0, t1]; returns the terminal event time or null. */
  events(t0, y0, t1, y1, interp) {
    const P = this.P; const cur = evCall(P, this.ev, t1, y1); const prev = this.evPrev;
    const found = [];
    for (let j = 0; j < cur.v.length; j++) {
      if (!crossed(prev.v[j], cur.v[j], cur.dirs[j])) continue;
      // Illinois root finding on g(t) = value_j(t, interp(t))
      let a = t0, b = t1, ga = prev.v[j], gb = cur.v[j], side = 0;
      const tolT = 128 * EPS * Math.max(Math.abs(t0), Math.abs(t1), 1e-300);
      let tc = b;
      for (let it = 0; it < 200 && Math.abs(b - a) > tolT; it++) {
        let tm = b - gb * (b - a) / (gb - ga);
        if (!((tm - a) * (tm - b) < 0)) tm = 0.5 * (a + b);
        const gm = evCall(P, this.ev, tm, interp(tm)).v[j];
        if (gm === 0) { a = b = tm; break; }
        if ((gm > 0) === (gb > 0)) { b = tm; gb = gm; if (side === 1) ga /= 2; side = 1; } else { a = tm; ga = gm; if (side === -1) gb /= 2; side = -1; }
        tc = b;
      }
      tc = b;
      found.push({ t: tc, j, term: cur.term[j] !== 0 });
    }
    this.evPrev = cur;
    if (!found.length) return null;
    found.sort((x, y) => (x.t - y.t) * P.dir);
    let stopT = null;
    for (const e of found) {
      if (stopT !== null && (e.t - stopT) * P.dir > 0) break;
      const ye = e.t === t1 ? Float64Array.from(y1) : interp(e.t);
      this.te.push(e.t); this.ye.push(ye); this.ie.push(e.j + 1);
      if (e.term && stopT === null) stopT = e.t;
    }
    return stopT;
  }
  /** Records an accepted step. Returns true to stop integration. extra: {yp, K} */
  step(t0, y0, t1, y1, interp0, extra = {}) {
    const P = this.P; let stop = false;
    const nn = P.nonneg || [];
    const interp = nn.length ? (t) => { const r = interp0(t); for (const i of nn) if (r[i] < 0) r[i] = 0; return r; } : interp0; let tEnd = t1, yEnd = y1, ypEnd = extra.yp;
    if (this.ev) {
      const ts = this.events(t0, y0, t1, y1, interp);
      if (ts !== null) {
        stop = true; tEnd = ts;
        if (ts !== t1) { yEnd = interp(ts); ypEnd = extra.ypAt ? extra.ypAt(ts) : null; }
      }
    }
    // mesh (sol)
    this.xs.push(tEnd); this.ys.push(Float64Array.from(yEnd));
    this.yps.push(ypEnd ? Float64Array.from(ypEnd) : null);
    if (extra.K) this.f3d.push({ h: t1 - t0, K: extra.K.map((k) => Float64Array.from(k)), t0, y0: Float64Array.from(y0), trunc: tEnd !== t1 });
    // outputs
    const newT = [], newY = [];
    if (P.tspan.length === 2) {
      for (let i = 1; i < this.refine; i++) {
        const t = t0 + (t1 - t0) * i / this.refine;
        if ((t - tEnd) * P.dir >= 0) break;
        newT.push(t); newY.push(interp(t));
      }
      newT.push(tEnd); newY.push(Float64Array.from(yEnd));
    } else {
      while (this.next < P.tspan.length && (P.tspan[this.next] - tEnd) * P.dir <= 0) {
        const t = P.tspan[this.next++];
        newT.push(t); newY.push(t === t1 ? Float64Array.from(y1) : interp(t));
      }
      if (stop && (newT.length === 0 || newT[newT.length - 1] !== tEnd)) { newT.push(tEnd); newY.push(Float64Array.from(yEnd)); }
    }
    for (let i = 0; i < newT.length; i++) { this.tout.push(newT[i]); this.yout.push(newY[i]); }
    if (this.outFcn && newT.length) {
      const n = this.outSel ? this.outSel.length : P.n;
      const Y = new Float64Array(n * newT.length);
      newY.forEach((y, k) => { const s = this.sel(y); for (let i = 0; i < n; i++) Y[i + k * n] = s[i]; });
      const r = callFn(P.ctx, this.outFcn, [row(newT), V(n, newT.length, Y), str('')], 1);
      if (r.length && !isEmptyV(r[0]) && F(r[0]).some((x) => x !== 0)) stop = true;
    }
    this.lastT = tEnd;
    if (stop) this.stopped = true;
    return stop;
  }
  /** Finishes and returns the builtin outputs. */
  finish(solverName, extraSol = {}) {
    const P = this.P;
    if (this.outFcn) callFn(P.ctx, this.outFcn, [empty(), empty(), str('done')], 0);
    const n = P.n;
    if (P.R && P.R.bool('Stats', false)) {
      const s = P.stats;
      let txt = `${s.nsteps} successful steps\n${s.nfailed} failed attempts\n${s.nfevals} function evaluations\n`;
      if (P.implicit) txt += `${s.npds} partial derivatives\n${s.ndecomps} LU decompositions\n${s.nsolves} solutions of linear systems\n`;
      P.ctx.out(txt);
    }
    if (this.wantSol) return this.sol(solverName, extraSol);
    const N = this.tout.length;
    const T = col(Float64Array.from(this.tout));
    const Y = new Float64Array(N * n);
    this.yout.forEach((y, k) => { for (let i = 0; i < n; i++) Y[k + i * N] = y[i]; });
    const Yv = V(N, n, Y);
    const outs = [T, Yv];
    if (this.nargout > 2 || this.ev) {
      const ne = this.te.length;
      const YE = new Float64Array(ne * n);
      this.ye.forEach((y, k) => { for (let i = 0; i < n; i++) YE[k + i * ne] = y[i]; });
      outs.push(ne ? col(Float64Array.from(this.te)) : V(0, 1, []), ne ? V(ne, n, YE) : V(0, n, []), ne ? col(Float64Array.from(this.ie)) : V(0, 1, []));
    }
    if (this.nargout === 0) {
      const pr = tryCall(P.ctx, 'plot', [T, Yv, str('-o')], 0);
      if (pr !== null) return undefined;
    }
    return outs;
  }
  sol(solverName, extraSol = {}) {
    const P = this.P; const n = P.n; const N = this.xs.length;
    const Yd = new Float64Array(n * N);
    this.ys.forEach((y, k) => Yd.set(y, k * n));
    // derivatives at the mesh (Hermite data for deval)
    const YP = new Float64Array(n * N);
    this.yps.forEach((yp, k) => { if (yp) YP.set(yp, k * n); });
    const fields = {
      solver: str(solverName),
      extdata: structOf({ odefun: P.fh, options: P.opts && !isEmptyV(P.opts) ? P.opts : struct([1, 1], [], [Object.create(null)]), varargin: cellRow(P.extra) }),
      x: row(Float64Array.from(this.xs)),
      y: V(n, N, Yd),
      stats: structOf({ nsteps: num(P.stats.nsteps), nfailed: num(P.stats.nfailed), nfevals: num(P.stats.nfevals), ...(P.implicit ? { npds: num(P.stats.npds), ndecomps: num(P.stats.ndecomps), nsolves: num(P.stats.nsolves) } : {}) }),
    };
    const idata = { kind: str(this.f3d.length ? 'rk45' : 'hermite'), yp: V(n, N, YP) };
    if (this.f3d.length) {
      const m = this.f3d.length; const a = new Float64Array(n * 7 * m);
      this.f3d.forEach((st, k) => st.K.forEach((kk, j) => a.set(kk, j * n + k * n * 7)));
      idata.f3d = tensor('double', [n, 7, m], a);
      idata.h = row(Float64Array.from(this.f3d.map((s) => s.h)));
    }
    fields.idata = structOf(idata);
    if (this.ev) {
      const ne = this.te.length; const YE = new Float64Array(n * ne);
      this.ye.forEach((y, k) => YE.set(y, k * n));
      fields.xe = row(Float64Array.from(this.te)); fields.ye = V(n, ne, YE); fields.ie = row(Float64Array.from(this.ie));
    }
    Object.assign(fields, extraSol);
    return structOf(fields);
  }
}

// Dormand-Prince continuous extension (4th order), used by deval for 'rk45' data
export const BI45 = [
  [1, -183 / 64, 37 / 12, -145 / 128],
  [0, 0, 0, 0],
  [0, 1500 / 371, -1000 / 159, 1000 / 371],
  [0, -125 / 32, 125 / 12, -375 / 64],
  [0, 9477 / 3392, -729 / 106, 25515 / 6784],
  [0, -11 / 7, 11 / 3, -55 / 28],
  [0, 3 / 2, -4, 5 / 2],
];
export function ntrp45(t0, y0, h, Ks, t) {
  const s = (t - t0) / h; const n = y0.length; const r = Float64Array.from(y0);
  const sp = [s, s * s, s * s * s, s * s * s * s];
  for (let j = 0; j < 7; j++) {
    const c = BI45[j][0] * sp[0] + BI45[j][1] * sp[1] + BI45[j][2] * sp[2] + BI45[j][3] * sp[3];
    if (c !== 0) { const kj = Ks[j]; for (let i = 0; i < n; i++) r[i] += h * c * kj[i]; }
  }
  return r;
}
export function ntrp45d(t0, h, Ks, t, n) {
  const s = (t - t0) / h; const r = new Float64Array(n);
  const sp = [1, 2 * s, 3 * s * s, 4 * s * s * s];
  for (let j = 0; j < 7; j++) {
    const c = BI45[j][0] * sp[0] + BI45[j][1] * sp[1] + BI45[j][2] * sp[2] + BI45[j][3] * sp[3];
    if (c !== 0) { const kj = Ks[j]; for (let i = 0; i < n; i++) r[i] += c * kj[i]; }
  }
  return r;
}

export function failWarn(P, t, h) {
  P.ctx.warning(`numeric:${P.solver}:IntegrationTolNotMet`, `Failure at t=${t.toExponential(6)}.  Unable to meet integration tolerances without reducing the step size below the smallest value allowed (${h.toExponential(6)}) at time t.`);
}

export { cell, cellRow };
