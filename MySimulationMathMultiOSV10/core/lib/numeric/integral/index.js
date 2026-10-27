// integral submodule of the numerics area: numerical integration.
//   integral, quadgk     global adaptive Gauss-Kronrod (7,15) with endpoint
//                        transformations (weak singularities, infinite limits),
//                        waypoints, array-valued integrands
//   integral2/3, quad2d  iterated adaptive Gauss-Kronrod; all inner integrals
//                        of one outer sweep are evaluated in one vectorised call
//   quad, quadv, quadl   adaptive Simpson / array-valued Simpson / Gauss-Lobatto
//   dblquad, triplequad  iterated integrals with f(xvector, y[, z])
//   trapz, cumtrapz      trapezoidal rule along a dimension
import {
  E, F, H, num, isText, toStr, toNum, isFuncHandle, isEmptyV, callFn, tensor, prod, nv, EPS, isStruct,
} from '../_util.js';

// ------------------------------------------------------------ Gauss-Kronrod (7,15)
const XGK = [0.991455371120812639, 0.949107912342758525, 0.864864423359769073, 0.741531185599394440, 0.586087235467691130, 0.405845151377397167, 0.207784955007898468, 0];
const WGK = [0.022935322010529225, 0.063092092629978553, 0.104790010322250184, 0.140653259715525919, 0.169004726639267903, 0.190350578064785410, 0.204432940075298892, 0.209482141084727828];
const WG = [0.129484966168869693, 0.279705391489276668, 0.381830050505118945, 0.417959183673469388];
const NODES = [], WK15 = [], WG15 = [];
for (let i = 0; i < 7; i++) { NODES.push(-XGK[i]); WK15.push(WGK[i]); WG15.push(i % 2 === 1 ? WG[(i - 1) / 2] : 0); }
NODES.push(0); WK15.push(WGK[7]); WG15.push(WG[3]);
for (let i = 6; i >= 0; i--) { NODES.push(XGK[i]); WK15.push(WGK[i]); WG15.push(i % 2 === 1 ? WG[(i - 1) / 2] : 0); }

/** Pieces of [a,b] (with waypoints) with maps t -> [x, dx/dt]. */
function makePieces(a, b, waypoints) {
  const pts = [a, ...waypoints.filter((w) => w > Math.min(a, b) && w < Math.max(a, b)).sort((x, y) => (a < b ? x - y : y - x)), b];
  const pieces = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const lo = pts[i], hi = pts[i + 1];
    if (lo === hi) continue;
    if (Number.isFinite(lo) && Number.isFinite(hi)) {
      const c = (hi + lo) / 2, d = (hi - lo) / 4;
      pieces.push({ t0: -1, t1: 1, map: (t) => [d * t * (3 - t * t) + c, 3 * d * (1 - t * t)] });
    } else if (Number.isFinite(lo) && hi === Infinity) {
      pieces.push({ t0: 0, t1: 1, map: (t) => [lo + t / (1 - t), 1 / ((1 - t) * (1 - t))] });
    } else if (lo === -Infinity && Number.isFinite(hi)) {
      pieces.push({ t0: -1, t1: 0, map: (t) => [hi + t / (1 + t), 1 / ((1 + t) * (1 + t))] });
    } else if (Number.isFinite(lo) && hi === -Infinity) {
      pieces.push({ t0: 0, t1: 1, map: (t) => [lo - t / (1 - t), -1 / ((1 - t) * (1 - t))] });
    } else if (lo === Infinity && Number.isFinite(hi)) {
      pieces.push({ t0: -1, t1: 0, map: (t) => [hi - t / (1 + t), -1 / ((1 + t) * (1 + t))] });
    } else if (lo === -Infinity && hi === Infinity) {
      pieces.push({ t0: -1, t1: 1, map: (t) => [t / (1 - t * t), (1 + t * t) / ((1 - t * t) * (1 - t * t))] });
    } else if (lo === Infinity && hi === -Infinity) {
      pieces.push({ t0: -1, t1: 1, map: (t) => [-t / (1 - t * t), -(1 + t * t) / ((1 - t * t) * (1 - t * t))] });
    } else throw E('integral:badLimits', 'Invalid integration limits.');
  }
  return pieces;
}

/**
 * Adaptive Gauss-Kronrod for a batch of independent problems.
 * probs: [{a, b}]; evalFn(pids: Int32Array, xs: Float64Array) -> {re, im|null} with m values per point.
 * Returns [{re: Float64Array(m), im, err}]
 */
export function gkBatch(probs, evalFn, o = {}) {
  const m = o.m || 1; const abstol = o.abstol ?? 1e-10, reltol = o.reltol ?? 1e-6;
  const maxInt = o.maxIntervals || 650; const initial = o.initial || 10; const wp = o.waypoints || [];
  const ctx = o.ctx; const warn = o.warn || (() => {});
  const st = probs.map((p) => {
    const s = { done: false, intervals: [], pieces: [], tlen: 0, Q: { re: new Float64Array(m), im: new Float64Array(m) }, err: 0, complex: false };
    if (p.a === p.b) { s.done = true; return s; }
    if (Number.isNaN(p.a) || Number.isNaN(p.b)) { s.done = true; s.Q.re.fill(NaN); return s; }
    s.pieces = makePieces(p.a, p.b, wp);
    s.tlen = s.pieces.reduce((acc, pc) => acc + (pc.t1 - pc.t0), 0);
    const per = Math.max(1, Math.ceil(initial / s.pieces.length));
    s.pending = [];
    s.pieces.forEach((pc) => { for (let k = 0; k < per; k++) s.pending.push({ pc, ta: pc.t0 + (pc.t1 - pc.t0) * k / per, tb: pc.t0 + (pc.t1 - pc.t0) * (k + 1) / per }); });
    return s;
  });
  let warnedNaN = false;
  for (let iter = 0; iter < 10000; iter++) {
    if (ctx) ctx.checkInterrupt();
    const pids = [], xs = [], ws = [], owners = [];
    st.forEach((s, pi) => {
      if (s.done || !s.pending || !s.pending.length) return;
      for (const iv of s.pending) {
        const half = (iv.tb - iv.ta) / 2, mid = (iv.ta + iv.tb) / 2;
        iv.off = xs.length;
        for (let q = 0; q < 15; q++) { const [x, w] = iv.pc.map(mid + half * NODES[q]); pids.push(pi); xs.push(x); ws.push(w * half); }
        owners.push([pi, iv]);
      }
    });
    if (!xs.length) break;
    const val = evalFn(Int32Array.from(pids), Float64Array.from(xs));
    for (const [pi, iv] of owners) {
      const s = st[pi];
      const qk = new Float64Array(m), qki = new Float64Array(m), qg = new Float64Array(m), qgi = new Float64Array(m);
      for (let q = 0; q < 15; q++) {
        const idx = iv.off + q; const w = ws[idx];
        for (let c = 0; c < m; c++) {
          let fr = val.re[idx * m + c], fi = val.im ? val.im[idx * m + c] : 0;
          if (w === 0 || !Number.isFinite(w)) { fr = 0; fi = 0; }
          qk[c] += WK15[q] * w * fr; qg[c] += WG15[q] * w * fr;
          if (fi) { qki[c] += WK15[q] * w * fi; qgi[c] += WG15[q] * w * fi; s.complex = true; }
        }
      }
      let e = 0; for (let c = 0; c < m; c++) e = Math.max(e, Math.hypot(qk[c] - qg[c], qki[c] - qgi[c]));
      iv.qk = qk; iv.qki = qki; iv.err = e;
      s.intervals.push(iv);
    }
    st.forEach((s) => { if (s.pending) s.pending = []; });
    // convergence per problem
    for (const s of st) {
      if (s.done) continue;
      const Q = new Float64Array(m), Qi = new Float64Array(m); let Etot = 0;
      for (const iv of s.intervals) { for (let c = 0; c < m; c++) { Q[c] += iv.qk[c]; Qi[c] += iv.qki[c]; } Etot += iv.err; }
      s.Q = { re: Q, im: Qi }; s.err = Etot;
      let qmag = 0; for (let c = 0; c < m; c++) qmag = Math.max(qmag, Math.hypot(Q[c], Qi[c]));
      if (!Number.isFinite(Etot) || !Number.isFinite(qmag)) {
        if (!warnedNaN) { warn('numeric:integral:NonFiniteValue', 'Infinite or Not-a-Number value encountered.'); warnedNaN = true; }
        s.done = true; continue;
      }
      const tol = Math.max(abstol, reltol * qmag);
      if (Etot <= tol) { s.done = true; continue; }
      if (s.intervals.length >= maxInt) {
        warn('numeric:integral:MaxIntervalCountReached', `Reached the limit on the maximum number of intervals in use. Approximate bound on error is ${Etot.toExponential(1)}. The integral may not exist, or it may be difficult to approximate numerically to the requested accuracy.`);
        s.done = true; continue;
      }
      const keep = [], split = [];
      for (const iv of s.intervals) { if (iv.err > tol * (iv.tb - iv.ta) / s.tlen) split.push(iv); else keep.push(iv); }
      if (!split.length) { let bi = 0; s.intervals.forEach((iv, i) => { if (iv.err > s.intervals[bi].err) bi = i; }); split.push(...keep.splice(bi, 1)); }
      let tooSmall = false;
      for (const iv of split) {
        const mid = (iv.ta + iv.tb) / 2;
        const [xa] = iv.pc.map(iv.ta + (iv.tb - iv.ta) * 0.0085), [xb] = iv.pc.map(iv.tb - (iv.tb - iv.ta) * 0.0085);
        if (!(mid > Math.min(iv.ta, iv.tb) && mid < Math.max(iv.ta, iv.tb)) || Math.abs(xb - xa) <= 2 * EPS * Math.max(Math.abs(xa), Math.abs(xb), 1e-300)) { tooSmall = true; keep.push(iv); continue; }
        s.pending.push({ pc: iv.pc, ta: iv.ta, tb: mid }, { pc: iv.pc, ta: mid, tb: iv.tb });
      }
      if (tooSmall && !s.pending.length) {
        warn('numeric:integral:MinStepSize', 'Minimum step size reached near x. Singularity likely.');
        s.done = true;
      }
      s.intervals = keep;
    }
    if (st.every((s) => s.done)) break;
  }
  return st.map((s) => ({ re: s.Q.re, im: s.complex ? s.Q.im : null, err: s.err }));
}

// ------------------------------------------------------------ helpers
const fnArgOf = (v, what) => { if (isFuncHandle(v)) return v; if (isText(v)) return toStr(v); throw E(`${what}:notFunction`, 'The integrand must be a function handle.'); };
function realLimit(v, what) {
  if (v && v.im && v.im.some((x) => x !== 0)) throw E(`${what}:complexLimits`, 'Complex integration limits are not supported.');
  return toNum(v, 'Integration limit');
}
function outValue(re, im, dims) {
  const t = tensor('double', dims, re, im && im.some((x) => x !== 0) ? im : null);
  return t;
}
/** Elementwise vectorised evaluation: f(X) same size as X (row vector). */
function vecEval(ctx, f, xs, extraArgs = [], what = 'integral') {
  const r = callFn(ctx, f, [tensor('double', [1, xs.length], Float64Array.from(xs)), ...extraArgs], 1);
  if (!r.length) throw E(`${what}:noOutput`, 'The integrand did not return a value.');
  const v = r[0]; const re = F(v);
  if (re.length !== xs.length) {
    if (re.length === 1) return { re: new Float64Array(xs.length).fill(re[0]), im: v.im ? new Float64Array(xs.length).fill(v.im[0]) : null };
    throw E(`${what}:FxNotSameSizeAsX`, 'Output of the function must be the same size as the input. If the integrand is array-valued, set the \'ArrayValued\' option to true.');
  }
  return { re: Float64Array.from(re), im: v.im ? Float64Array.from(v.im) : null };
}
function parseOpts(args, start, what, defs) {
  const o = nv(args, start, ['AbsTol', 'RelTol', 'ArrayValued', 'Waypoints', 'MaxIntervalCount', 'Method']);
  const g = (k) => o[k.toLowerCase()];
  const known = ['abstol', 'reltol', 'arrayvalued', 'waypoints', 'maxintervalcount', 'method'];
  for (const k of Object.keys(o)) if (!known.includes(k)) throw E(`${what}:unknownOption`, `Unknown option '${k}'.`);
  const abstol = g('AbsTol') ? toNum(g('AbsTol')) : defs.abstol;
  const reltol = g('RelTol') ? toNum(g('RelTol')) : defs.reltol;
  if (!(abstol >= 0) || !(reltol >= 0)) throw E(`${what}:badTol`, 'Tolerances must be nonnegative.');
  return {
    abstol, reltol,
    arrayValued: g('ArrayValued') ? (isText(g('ArrayValued')) ? /^(on|true)$/i.test(toStr(g('ArrayValued'))) : toNum(g('ArrayValued')) !== 0) : false,
    waypoints: g('Waypoints') && !isEmptyV(g('Waypoints')) ? (() => { const w = g('Waypoints'); if (w.im && w.im.some((x) => x !== 0)) throw E(`${what}:complexWaypoints`, 'Complex waypoints are not supported.'); return Array.from(F(w)); })() : [],
    maxIntervals: g('MaxIntervalCount') ? toNum(g('MaxIntervalCount')) : 650,
    method: g('Method') ? toStr(g('Method')).toLowerCase() : 'auto',
  };
}

// ------------------------------------------------------------ integral / quadgk
function integral1(args, nargout, ctx, what, defs) {
  if (args.length < 3) throw E(`${what}:nargin`, `${what} needs a function and the integration limits.`);
  const f = fnArgOf(args[0], what);
  let a = realLimit(args[1], what), b = realLimit(args[2], what);
  const o = parseOpts(args, 3, what, defs);
  const warn = (id, msg) => ctx.warning(id, msg);
  if (o.arrayValued) {
    let dims = null;
    const evalFn = (pids, xs) => {
      const out = []; let im = null;
      for (let i = 0; i < xs.length; i++) {
        const v = callFn(ctx, f, [num(xs[i])], 1)[0];
        if (!dims) dims = v.dims.slice();
        const re = F(v);
        out.push(re); if (v.im) { if (!im) im = []; im[i] = v.im; }
      }
      const m = out[0].length; const R = new Float64Array(xs.length * m); let I = null;
      out.forEach((r, i) => R.set(r, i * m));
      if (im) { I = new Float64Array(xs.length * m); im.forEach((r, i) => { if (r) I.set(r, i * m); }); }
      return { re: R, im: I };
    };
    // probe size
    const probe = callFn(ctx, f, [num(Number.isFinite(a) ? a : 0)], 1)[0];
    dims = probe.dims.slice(); const m = prod(dims);
    const [r] = gkBatch([{ a, b }], evalFn, { ...o, m, ctx, warn });
    const out = outValue(r.re, r.im, dims);
    return nargout > 1 ? [out, num(r.err)] : out;
  }
  const evalFn = (pids, xs) => vecEval(ctx, f, xs, [], what);
  const [r] = gkBatch([{ a, b }], evalFn, { ...o, m: 1, ctx, warn });
  const out = outValue(r.re, r.im, [1, 1]);
  return nargout > 1 ? [out, num(r.err)] : out;
}

// ------------------------------------------------------------ integral2 / integral3
function limitFn(ctx, v) {
  if (isFuncHandle(v) || isText(v)) { const g = fnArgOf(v, 'integral2'); return (xs, ys) => { const a = [tensor('double', [1, xs.length], Float64Array.from(xs))]; if (ys) a.push(tensor('double', [1, ys.length], Float64Array.from(ys))); const r = F(callFn(ctx, g, a, 1)[0]); return r.length === xs.length ? Float64Array.from(r) : new Float64Array(xs.length).fill(r[0]); }; }
  const c = toNum(v, 'Integration limit'); return (xs) => new Float64Array(xs.length).fill(c);
}
function integral2Impl(args, nargout, ctx) {
  if (args.length < 5) throw E('integral2:nargin', 'integral2 needs f, xmin, xmax, ymin, ymax.');
  const f = fnArgOf(args[0], 'integral2');
  const xmin = realLimit(args[1], 'integral2'), xmax = realLimit(args[2], 'integral2');
  const ylo = limitFn(ctx, args[3]), yhi = limitFn(ctx, args[4]);
  const o = parseOpts(args, 5, 'integral2', { abstol: 1e-10, reltol: 1e-6 });
  const warn = (id, msg) => ctx.warning(id.replace('integral:', 'integral2:'), msg);
  let fcalls = 0;
  const inner = (xs) => {
    const lo = ylo(xs), hi = yhi(xs);
    const probs = Array.from(xs, (_, i) => ({ a: lo[i], b: hi[i] }));
    const res = gkBatch(probs, (pids, ys) => {
      const X = new Float64Array(ys.length); for (let i = 0; i < ys.length; i++) X[i] = xs[pids[i]];
      fcalls++;
      const r = callFn(ctx, f, [tensor('double', [1, ys.length], X), tensor('double', [1, ys.length], Float64Array.from(ys))], 1)[0];
      const re = F(r); if (re.length !== ys.length) throw E('integral2:funSizeMismatch', 'The integrand must return an output the same size as the inputs.');
      return { re: Float64Array.from(re), im: r.im ? Float64Array.from(r.im) : null };
    }, { abstol: o.abstol / 4, reltol: o.reltol / 4, initial: 2, ctx, warn });
    const re = new Float64Array(xs.length); let im = null;
    res.forEach((r, i) => { re[i] = r.re[0]; if (r.im) { im = im || new Float64Array(xs.length); im[i] = r.im[0]; } });
    return { re, im };
  };
  const [r] = gkBatch([{ a: xmin, b: xmax }], (pids, xs) => inner(xs), { abstol: o.abstol, reltol: o.reltol, initial: 2, ctx, warn });
  void fcalls;
  const out = outValue(r.re, r.im, [1, 1]);
  return nargout > 1 ? [out, num(r.err)] : out;
}
function integral3Impl(args, nargout, ctx) {
  if (args.length < 7) throw E('integral3:nargin', 'integral3 needs f, xmin, xmax, ymin, ymax, zmin, zmax.');
  const f = fnArgOf(args[0], 'integral3');
  const xmin = realLimit(args[1], 'integral3'), xmax = realLimit(args[2], 'integral3');
  const ylo = limitFn(ctx, args[3]), yhi = limitFn(ctx, args[4]);
  const zlo = limitFn(ctx, args[5]), zhi = limitFn(ctx, args[6]);
  const o = parseOpts(args, 7, 'integral3', { abstol: 1e-10, reltol: 1e-6 });
  const warn = (id, msg) => ctx.warning(id.replace('integral:', 'integral3:'), msg);
  const zInner = (xs, ys) => {
    const lo = zlo(xs, ys), hi = zhi(xs, ys);
    const probs = Array.from(xs, (_, i) => ({ a: lo[i], b: hi[i] }));
    const res = gkBatch(probs, (pids, zs) => {
      const X = new Float64Array(zs.length), Y = new Float64Array(zs.length);
      for (let i = 0; i < zs.length; i++) { X[i] = xs[pids[i]]; Y[i] = ys[pids[i]]; }
      const sz = [1, zs.length];
      const r = callFn(ctx, f, [tensor('double', sz, X), tensor('double', sz, Y), tensor('double', sz, Float64Array.from(zs))], 1)[0];
      const re = F(r); if (re.length !== zs.length) throw E('integral3:funSizeMismatch', 'The integrand must return an output the same size as the inputs.');
      return { re: Float64Array.from(re), im: r.im ? Float64Array.from(r.im) : null };
    }, { abstol: o.abstol / 16, reltol: o.reltol / 16, initial: 1, ctx, warn });
    const re = new Float64Array(xs.length); let im = null;
    res.forEach((r, i) => { re[i] = r.re[0]; if (r.im) { im = im || new Float64Array(xs.length); im[i] = r.im[0]; } });
    return { re, im };
  };
  const yInner = (xs) => {
    const lo = ylo(xs), hi = yhi(xs);
    const probs = Array.from(xs, (_, i) => ({ a: lo[i], b: hi[i] }));
    const res = gkBatch(probs, (pids, ys) => { const X = new Float64Array(ys.length); for (let i = 0; i < ys.length; i++) X[i] = xs[pids[i]]; return zInner(X, ys); }, { abstol: o.abstol / 4, reltol: o.reltol / 4, initial: 1, ctx, warn });
    const re = new Float64Array(xs.length); let im = null;
    res.forEach((r, i) => { re[i] = r.re[0]; if (r.im) { im = im || new Float64Array(xs.length); im[i] = r.im[0]; } });
    return { re, im };
  };
  const [r] = gkBatch([{ a: xmin, b: xmax }], (pids, xs) => yInner(xs), { abstol: o.abstol, reltol: o.reltol, initial: 1, ctx, warn });
  const out = outValue(r.re, r.im, [1, 1]);
  return nargout > 1 ? [out, num(r.err)] : out;
}

// ------------------------------------------------------------ quad (adaptive Simpson)
function quadImpl(args, nargout, ctx) {
  if (args.length < 3) throw E('quad:nargin', 'quad needs a function and the integration limits.');
  const f = fnArgOf(args[0], 'quad');
  const a = toNum(args[1]), b = toNum(args[2]);
  const tol = args.length > 3 && !isEmptyV(args[3]) ? toNum(args[3]) : 1e-6;
  const trace = args.length > 4 && !isEmptyV(args[4]) && toNum(args[4]) !== 0;
  const extra = args.slice(5);
  let fcnt = 0; let warned = false;
  const fv = (xs) => { fcnt += xs.length; const r = vecEval(ctx, f, xs, extra, 'quad'); return r.re; };
  const hmin = EPS * Math.abs(b - a) / 1024;
  const step = (a0, b0, fa, fc, fb, Q, depth) => {
    ctx.checkInterrupt();
    const h = b0 - a0, c = (a0 + b0) / 2;
    if (Math.abs(h) < hmin || c === a0 || c === b0 || fcnt > 10000) { if (!warned) { ctx.warning('numeric:quad:MinStepSize', 'Minimum step size reached; singularity possible.'); warned = true; } return Q; }
    const [fd, fe] = fv([(a0 + c) / 2, (c + b0) / 2]);
    if (trace) ctx.out(`${String(fcnt).padStart(8)} ${a0.toPrecision(10)} ${h.toPrecision(10)} ${Q.toPrecision(10)}\n`);
    const Q1 = h / 12 * (fa + 4 * fd + fc), Q2 = h / 12 * (fc + 4 * fe + fb);
    const Qn = Q1 + Q2;
    if (!Number.isFinite(Qn)) { if (!warned) { ctx.warning('numeric:quad:ImproperFcnValue', 'Infinite or Not-a-Number function value encountered.'); warned = true; } return Qn; }
    if (Math.abs(Qn - Q) <= tol || depth > 50) return Qn + (Qn - Q) / 15;
    return step(a0, c, fa, fd, fc, Q1, depth + 1) + step(c, b0, fc, fe, fb, Q2, depth + 1);
  };
  // initial: 7 points, 3 subintervals (slightly irregular to avoid symmetry)
  const h = b - a;
  const pts = [a, a + 0.13579 * h, a + 0.27158 * h, a + 0.5 * h, a + 0.72842 * h, a + 0.86421 * h, b];
  let y = fv(pts);
  if (!Number.isFinite(y[0])) y[0] = fv([a + EPS * h])[0];
  if (!Number.isFinite(y[6])) y[6] = fv([b - EPS * h])[0];
  const Q0 = (p, q, r) => (pts[r] - pts[p]) / 6 * (y[p] + 4 * y[q] + y[r]);
  const Q = step(pts[0], pts[2], y[0], y[1], y[2], Q0(0, 1, 2), 0) + step(pts[2], pts[4], y[2], y[3], y[4], Q0(2, 3, 4), 0) + step(pts[4], pts[6], y[4], y[5], y[6], Q0(4, 5, 6), 0);
  return nargout > 1 ? [num(Q), num(fcnt)] : num(Q);
}

// quadv: array-valued adaptive Simpson
function quadvImpl(args, nargout, ctx) {
  if (args.length < 3) throw E('quadv:nargin', 'quadv needs a function and the integration limits.');
  const f = fnArgOf(args[0], 'quadv');
  const a = toNum(args[1]), b = toNum(args[2]);
  const tol = args.length > 3 && !isEmptyV(args[3]) ? toNum(args[3]) : 1e-6;
  const extra = args.slice(5);
  let fcnt = 0; let dims = null; let complex = false;
  const fv = (x) => {
    fcnt++; const v = callFn(ctx, f, [num(x), ...extra], 1)[0]; if (!dims) dims = v.dims.slice();
    const re = Float64Array.from(F(v)); if (v.im) complex = true;
    return { re, im: v.im ? Float64Array.from(v.im) : new Float64Array(re.length) };
  };
  const comb = (h, w, vs) => { const m = vs[0].re.length; const re = new Float64Array(m), im = new Float64Array(m); vs.forEach((v, k) => { for (let i = 0; i < m; i++) { re[i] += h * w[k] * v.re[i]; im[i] += h * w[k] * v.im[i]; } }); return { re, im }; };
  const diff = (p, q) => { let d = 0; for (let i = 0; i < p.re.length; i++) d = Math.max(d, Math.hypot(p.re[i] - q.re[i], p.im[i] - q.im[i])); return d; };
  const add = (p, q) => ({ re: p.re.map((x, i) => x + q.re[i]), im: p.im.map((x, i) => x + q.im[i]) });
  let warned = false;
  const step = (a0, b0, fa, fc, fb, Q, depth) => {
    ctx.checkInterrupt();
    const h = b0 - a0, c = (a0 + b0) / 2;
    const fd = fv((a0 + c) / 2), fe = fv((c + b0) / 2);
    const Q1 = comb(h / 12, [1, 4, 1], [fa, fd, fc]), Q2 = comb(h / 12, [1, 4, 1], [fc, fe, fb]);
    const Qn = add(Q1, Q2);
    if (diff(Qn, Q) <= tol || depth > 40) { if (depth > 40 && !warned) { ctx.warning('numeric:quadv:MinStepSize', 'Minimum step size reached; singularity possible.'); warned = true; } return Qn; }
    return add(step(a0, c, fa, fd, fc, Q1, depth + 1), step(c, b0, fc, fe, fb, Q2, depth + 1));
  };
  const h = b - a; const pts = [a, a + 0.13579 * h, a + 0.27158 * h, a + 0.5 * h, a + 0.72842 * h, a + 0.86421 * h, b];
  const y = pts.map(fv);
  const Q0 = (p, q, r) => comb((pts[r] - pts[p]) / 6, [1, 4, 1], [y[p], y[q], y[r]]);
  let Q = add(add(step(pts[0], pts[2], y[0], y[1], y[2], Q0(0, 1, 2), 0), step(pts[2], pts[4], y[2], y[3], y[4], Q0(2, 3, 4), 0)), step(pts[4], pts[6], y[4], y[5], y[6], Q0(4, 5, 6), 0));
  const out = tensor('double', dims, Q.re, complex ? Q.im : null);
  return nargout > 1 ? [out, num(fcnt)] : out;
}

// quadl: adaptive Gauss-Lobatto (Gander & Gautschi)
function quadlImpl(args, nargout, ctx) {
  if (args.length < 3) throw E('quadl:nargin', 'quadl needs a function and the integration limits.');
  const f = fnArgOf(args[0], 'quadl');
  const a = toNum(args[1]), b = toNum(args[2]);
  let tol = args.length > 3 && !isEmptyV(args[3]) ? toNum(args[3]) : 1e-6;
  const extra = args.slice(5);
  let fcnt = 0;
  const fv = (xs) => { fcnt += xs.length; return vecEval(ctx, f, xs, extra, 'quadl').re; };
  const m = (a + b) / 2, h = (b - a) / 2; const alpha = Math.sqrt(2 / 3), beta = 1 / Math.sqrt(5);
  const x1 = 0.942882415695480, x2 = 0.641853342345781, x3 = 0.236383199662150;
  const x = [a, m - x1 * h, m - alpha * h, m - x2 * h, m - beta * h, m - x3 * h, m, m + x3 * h, m + beta * h, m + x2 * h, m + alpha * h, m + x1 * h, b];
  const y = fv(x);
  const fa = y[0], fb = y[12];
  const i2 = (h / 6) * (y[0] + y[12] + 5 * (y[4] + y[8]));
  const i1 = (h / 1470) * (77 * (y[0] + y[12]) + 432 * (y[2] + y[10]) + 625 * (y[4] + y[8]) + 672 * y[6]);
  let is = h * (0.0158271919734802 * (y[0] + y[12]) + 0.0942738402188500 * (y[1] + y[11]) + 0.155071987336585 * (y[2] + y[10]) + 0.188821573960182 * (y[3] + y[9]) + 0.199773405226859 * (y[4] + y[8]) + 0.224926465333340 * (y[5] + y[7]) + 0.242611071901408 * y[6]);
  const s = Math.sign(is) || 1;
  const erri1 = Math.abs(i1 - is), erri2 = Math.abs(i2 - is);
  const R = erri2 !== 0 ? erri1 / erri2 : 1;
  if (R > 0 && R < 1) tol /= R;
  is = s * Math.abs(is) * tol / EPS; if (is === 0) is = b - a;
  let warned = false;
  const step = (a0, b0, fa0, fb0) => {
    ctx.checkInterrupt();
    const hh = (b0 - a0) / 2, mm = (a0 + b0) / 2;
    const mll = mm - alpha * hh, ml = mm - beta * hh, mr = mm + beta * hh, mrr = mm + alpha * hh;
    const [fmll, fml, fm, fmr, fmrr] = fv([mll, ml, mm, mr, mrr]);
    const j2 = (hh / 6) * (fa0 + fb0 + 5 * (fml + fmr));
    const j1 = (hh / 1470) * (77 * (fa0 + fb0) + 432 * (fmll + fmrr) + 625 * (fml + fmr) + 672 * fm);
    if (is + (j1 - j2) === is || mll <= a0 || b0 <= mrr || fcnt > 20000) {
      if ((mll <= a0 || b0 <= mrr || fcnt > 20000) && !warned) { ctx.warning('numeric:quadl:MinStepSize', 'Minimum step size reached; singularity possible.'); warned = true; }
      return j1;
    }
    return step(a0, mll, fa0, fmll) + step(mll, ml, fmll, fml) + step(ml, mm, fml, fm) + step(mm, mr, fm, fmr) + step(mr, mrr, fmr, fmrr) + step(mrr, b0, fmrr, fb0);
  };
  const Q = step(a, b, fa, fb);
  return nargout > 1 ? [num(Q), num(fcnt)] : num(Q);
}

// dblquad / triplequad: f(xvector, y[, z])
function dblquadImpl(args, nargout, ctx) {
  if (args.length < 5) throw E('dblquad:nargin', 'dblquad needs f, xmin, xmax, ymin, ymax.');
  const f = fnArgOf(args[0], 'dblquad');
  const [xa, xb, ya, yb] = [1, 2, 3, 4].map((i) => toNum(args[i]));
  const tol = args.length > 5 && !isEmptyV(args[5]) ? toNum(args[5]) : 1e-6;
  const extra = args.slice(7);
  const warn = (id, msg) => ctx.warning(id.replace('integral:', 'dblquad:'), msg);
  const outer = (pids, ys) => {
    const re = new Float64Array(ys.length);
    ys.forEach((y, i) => {
      const [r] = gkBatch([{ a: xa, b: xb }], (p, xs) => vecEval(ctx, f, xs, [num(y), ...extra], 'dblquad'), { abstol: tol / 4, reltol: 0, initial: 1, ctx, warn });
      re[i] = r.re[0];
    });
    return { re, im: null };
  };
  const [r] = gkBatch([{ a: ya, b: yb }], outer, { abstol: tol, reltol: 0, initial: 1, ctx, warn });
  return num(r.re[0]);
}
function triplequadImpl(args, nargout, ctx) {
  if (args.length < 7) throw E('triplequad:nargin', 'triplequad needs f, xmin, xmax, ymin, ymax, zmin, zmax.');
  const f = fnArgOf(args[0], 'triplequad');
  const [xa, xb, ya, yb, za, zb] = [1, 2, 3, 4, 5, 6].map((i) => toNum(args[i]));
  const tol = args.length > 7 && !isEmptyV(args[7]) ? toNum(args[7]) : 1e-6;
  const extra = args.slice(9);
  const warn = (id, msg) => ctx.warning(id.replace('integral:', 'triplequad:'), msg);
  const inner = (y, z) => gkBatch([{ a: xa, b: xb }], (p, xs) => vecEval(ctx, f, xs, [num(y), num(z), ...extra], 'triplequad'), { abstol: tol / 16, reltol: 0, initial: 1, ctx, warn })[0].re[0];
  const middle = (z) => gkBatch([{ a: ya, b: yb }], (p, ys) => ({ re: Float64Array.from(ys, (y) => inner(y, z)), im: null }), { abstol: tol / 4, reltol: 0, initial: 1, ctx, warn })[0].re[0];
  const [r] = gkBatch([{ a: za, b: zb }], (p, zs) => ({ re: Float64Array.from(zs, (z) => middle(z)), im: null }), { abstol: tol, reltol: 0, initial: 1, ctx, warn });
  return num(r.re[0]);
}

// ------------------------------------------------------------ trapz / cumtrapz
function firstNonSingleton(dims) { const i = dims.findIndex((d) => d !== 1); return i < 0 ? 0 : i; }
function trapzCore(args, cumulative) {
  const what = cumulative ? 'cumtrapz' : 'trapz';
  if (!args.length) throw E(`${what}:nargin`, `${what} needs at least one input.`);
  let X = null, Y, dim = null;
  if (args.length === 1) Y = args[0];
  else if (args.length === 2) {
    const s = args[1];
    if (prod(s.dims || [1, 1]) === 1 && prod(args[0].dims || [1, 1]) !== 1) { Y = args[0]; dim = toNum(s) - 1; }
    else { X = args[0]; Y = args[1]; }
  } else { X = args[0]; Y = args[1]; dim = toNum(args[2]) - 1; }
  const dims = (Y.dims || [1, 1]).slice();
  if (dim === null) dim = firstNonSingleton(dims);
  if (!(dim >= 0) || !Number.isInteger(dim)) throw E(`${what}:badDim`, 'Dimension must be a positive integer.');
  while (dims.length <= dim) dims.push(1);
  const yr = F(Y), yi = Y.im || null;
  const len = dims[dim]; const stride = prod(dims.slice(0, dim)); const outer = prod(dims.slice(dim + 1));
  let xs = null, xFull = null, spacing = 1;
  if (X) {
    const xa = F(X);
    if (xa.length === 1) spacing = xa[0];
    else if (xa.length === len && (X.dims[0] === 1 || X.dims[1] === 1 || X.dims.filter((d) => d !== 1).length <= 1)) xs = xa;
    else if (xa.length === yr.length) xFull = xa;
    else throw E(`${what}:LengthXMismatchY`, 'Length of X must match the size of Y along the operating dimension.');
  }
  const odims = dims.slice(); if (!cumulative) odims[dim] = 1;
  const n = prod(odims); const ore = new Float64Array(n), oim = yi ? new Float64Array(n) : null;
  for (let o = 0; o < outer; o++) for (let i = 0; i < stride; i++) {
    let acc = 0, acci = 0;
    if (cumulative) { const idx = i + stride * len * o; ore[idx] = 0; if (oim) oim[idx] = 0; }
    for (let k = 1; k < len; k++) {
      const i0 = i + stride * (k - 1 + len * o), i1 = i + stride * (k + len * o);
      const dx = xFull ? xFull[i1] - xFull[i0] : xs ? xs[k] - xs[k - 1] : spacing;
      acc += dx * (yr[i0] + yr[i1]) / 2; if (yi) acci += dx * (yi[i0] + yi[i1]) / 2;
      if (cumulative) { ore[i1] = acc; if (oim) oim[i1] = acci; }
    }
    if (!cumulative) { const idx = i + stride * o; ore[idx] = acc; if (oim) oim[idx] = acci; }
  }
  return tensor('double', odims, ore, oim && oim.some((v) => v !== 0) ? oim : null);
}

export const builtins = {
  integral: (a, n, c) => integral1(a, n > 1 ? 1 : n, c, 'integral', { abstol: 1e-10, reltol: 1e-6 }),
  quadgk: (a, n, c) => integral1(a, n, c, 'quadgk', { abstol: 1e-10, reltol: 1e-6 }),
  integral2: integral2Impl,
  quad2d: integral2Impl,
  integral3: integral3Impl,
  quad: quadImpl,
  quadv: quadvImpl,
  quadl: quadlImpl,
  dblquad: dblquadImpl,
  triplequad: triplequadImpl,
  trapz: (a) => trapzCore(a, false),
  cumtrapz: (a) => trapzCore(a, true),
};
export const help = {
  integral: H('Numerical integration (global adaptive Gauss-Kronrod quadrature, infinite limits allowed).', '수치 적분 (전역 적응 Gauss-Kronrod 구적법, 무한 구간 가능).', ['q = integral(fun, xmin, xmax)', "q = integral(fun, xmin, xmax, 'AbsTol', 1e-12, 'RelTol', 1e-8)", "q = integral(fun, xmin, xmax, 'ArrayValued', true)", "q = integral(fun, xmin, xmax, 'Waypoints', [x1 x2])"]),
  quadgk: H('Numerical integration by adaptive Gauss-Kronrod quadrature with an error bound.', '오차 한계를 함께 주는 적응 Gauss-Kronrod 수치 적분.', ['q = quadgk(fun, a, b)', '[q, errbnd] = quadgk(fun, a, b)', "[q, errbnd] = quadgk(fun, a, b, 'AbsTol', tol, 'MaxIntervalCount', n, 'Waypoints', w)"]),
  integral2: H('Numerically evaluate a double integral; the y limits may be functions of x.', '이중 적분을 수치로 계산합니다; y 한계는 x 의 함수일 수 있습니다.', ['q = integral2(fun, xmin, xmax, ymin, ymax)', "q = integral2(___, 'AbsTol', a, 'RelTol', r)", '[q, errbnd] = integral2(___)']),
  quad2d: H('Numerically evaluate a double integral over a planar region.', '평면 영역에서 이중 적분을 수치로 계산합니다.', ['q = quad2d(fun, a, b, c, d)', '[q, errbnd] = quad2d(___)']),
  integral3: H('Numerically evaluate a triple integral; inner limits may be functions.', '삼중 적분을 수치로 계산합니다; 안쪽 한계는 함수일 수 있습니다.', ['q = integral3(fun, xmin, xmax, ymin, ymax, zmin, zmax)', "q = integral3(___, 'AbsTol', a, 'RelTol', r)"]),
  quad: H('Numerical integration by adaptive Simpson quadrature.', '적응 Simpson 구적법에 의한 수치 적분.', ['q = quad(fun, a, b)', 'q = quad(fun, a, b, tol)', '[q, fcnt] = quad(___)']),
  quadv: H('Vectorized (array-valued) adaptive Simpson quadrature.', '배열 값 함수용 적응 Simpson 구적법.', ['Q = quadv(fun, a, b)', 'Q = quadv(fun, a, b, tol)', '[Q, fcnt] = quadv(___)']),
  quadl: H('Numerical integration by adaptive Gauss-Lobatto quadrature.', '적응 Gauss-Lobatto 구적법에 의한 수치 적분.', ['q = quadl(fun, a, b)', 'q = quadl(fun, a, b, tol)', '[q, fcnt] = quadl(___)']),
  dblquad: H('Double integral over a rectangle; fun(x, y) takes a vector x and a scalar y.', '사각형 영역의 이중 적분; fun(x, y) 는 벡터 x 와 스칼라 y 를 받습니다.', ['q = dblquad(fun, xmin, xmax, ymin, ymax)', 'q = dblquad(fun, xmin, xmax, ymin, ymax, tol)']),
  triplequad: H('Triple integral over a box; fun(x, y, z) takes a vector x and scalars y, z.', '직육면체 영역의 삼중 적분; fun(x, y, z) 는 벡터 x 와 스칼라 y, z 를 받습니다.', ['q = triplequad(fun, xmin, xmax, ymin, ymax, zmin, zmax)', 'q = triplequad(___, tol)']),
  trapz: H('Trapezoidal numerical integration.', '사다리꼴 수치 적분.', ['Q = trapz(Y)', 'Q = trapz(X, Y)', 'Q = trapz(___, dim)']),
  cumtrapz: H('Cumulative trapezoidal numerical integration.', '누적 사다리꼴 수치 적분.', ['Q = cumtrapz(Y)', 'Q = cumtrapz(X, Y)', 'Q = cumtrapz(___, dim)']),
};
export const classes = {};
void isStruct;
