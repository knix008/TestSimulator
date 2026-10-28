// ODE solvers of the simulation engine. f(t, x, dx) writes the derivatives.
// Fixed step: ode1 (Euler), ode2 (Heun), ode3 (Bogacki–Shampine), ode4 (RK4),
// ode5 (Dormand–Prince), ode8 (8th-order Gragg–Bulirsch–Stoer extrapolation),
// ode14x (implicit Euler with Richardson extrapolation, Newton iterations).
// Variable step: ode45 (Dormand–Prince 5(4)), ode23 (Bogacki–Shampine 3(2)),
// ode113 (Adams–Bashforth–Moulton PECE, order 4, restarted with RK4),
// ode15s / ode23s / ode23t / ode23tb (Rosenbrock 2(3) for stiff systems).

const TAB = {
  ode1: { c: [0], a: [[]], b: [1] },
  ode2: { c: [0, 1], a: [[], [1]], b: [0.5, 0.5] },
  ode3: { c: [0, 1 / 2, 3 / 4], a: [[], [1 / 2], [0, 3 / 4]], b: [2 / 9, 1 / 3, 4 / 9] },
  ode4: { c: [0, 0.5, 0.5, 1], a: [[], [0.5], [0, 0.5], [0, 0, 1]], b: [1 / 6, 1 / 3, 1 / 3, 1 / 6] },
  ode5: {
    c: [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1],
    a: [[], [1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9], [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729], [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656]],
    b: [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
  },
};
const EMB = {
  ode45: {
    c: [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1],
    a: [[], [1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9], [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729], [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656], [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]],
    b: [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0],
    bh: [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40],
    order: 4,
  },
  ode23: {
    c: [0, 1 / 2, 3 / 4, 1],
    a: [[], [1 / 2], [0, 3 / 4], [2 / 9, 1 / 3, 4 / 9]],
    b: [2 / 9, 1 / 3, 4 / 9, 0],
    bh: [7 / 24, 1 / 4, 1 / 3, 1 / 8],
    order: 2,
  },
};

export const FIXED_SOLVERS = ['ode1', 'ode2', 'ode3', 'ode4', 'ode5', 'ode8', 'ode14x'];
export const VARIABLE_SOLVERS = ['ode45', 'ode23', 'ode113', 'ode15s', 'ode23s', 'ode23t', 'ode23tb'];
const STIFF = new Set(['ode15s', 'ode23s', 'ode23t', 'ode23tb']);

/** Runge–Kutta stages: k[i] = f(t + c_i h, x + h Σ a_ij k_j); k0 may be given. */
function rkStages(tab, f, t, x, h, ks, tmp, k0) {
  const n = x.length;
  for (let i = 0; i < tab.c.length; i++) {
    if (i === 0 && k0) { ks[0].set(k0); continue; }
    const ai = tab.a[i];
    for (let q = 0; q < n; q++) { let s = x[q]; for (let j = 0; j < ai.length; j++) if (ai[j]) s += h * ai[j] * ks[j][q]; tmp[q] = s; }
    f(t + tab.c[i] * h, tmp, ks[i]);
  }
}

/** A solver object for n states: { step(f, t, x, h, out, k0?) → info, adaptive, order }. */
export function makeSolver(name, n) {
  const ws = (k) => Array.from({ length: k }, () => new Float64Array(n));
  const tmp = new Float64Array(n);
  if (TAB[name]) {
    const tab = TAB[name];
    const ks = ws(tab.c.length);
    return {
      name, adaptive: false,
      step(f, t, x, h, out, k0) {
        rkStages(tab, f, t, x, h, ks, tmp, k0);
        for (let q = 0; q < n; q++) { let s = x[q]; for (let j = 0; j < tab.b.length; j++) if (tab.b[j]) s += h * tab.b[j] * ks[j][q]; out[q] = s; }
        return { err: 0 };
      },
    };
  }
  if (name === 'ode8') return gbsSolver(n);
  if (name === 'ode14x') return implicitEulerSolver(n);
  if (EMB[name]) {
    const tab = EMB[name];
    const ks = ws(tab.c.length);
    return {
      name, adaptive: true, order: tab.order,
      step(f, t, x, h, out, k0, tol) {
        rkStages(tab, f, t, x, h, ks, tmp, k0);
        let en = 0;
        for (let q = 0; q < n; q++) {
          let s = x[q], e = 0;
          for (let j = 0; j < tab.b.length; j++) { const kj = ks[j][q]; if (tab.b[j]) s += h * tab.b[j] * kj; e += h * (tab.b[j] - tab.bh[j]) * kj; }
          out[q] = s;
          const sc = tol.abs + tol.rel * Math.max(Math.abs(x[q]), Math.abs(s));
          const r = Math.abs(e) / sc;
          if (r > en || Number.isNaN(r)) en = Number.isNaN(r) ? Infinity : r;
        }
        return { err: en };
      },
    };
  }
  if (name === 'ode113') return abmSolver(n);
  if (STIFF.has(name)) return rosenbrockSolver(n, name);
  throw new Error(`Unknown solver '${name}'.`);
}

// ------------------------------------------------------------ ode8: extrapolated modified midpoint
function gbsSolver(n) {
  const seq = [2, 4, 6, 8];
  const T = seq.map(() => new Float64Array(n));
  const z0 = new Float64Array(n), z1 = new Float64Array(n), d = new Float64Array(n), d0 = new Float64Array(n);
  return {
    name: 'ode8', adaptive: false,
    step(f, t, x, h, out, k0) {
      if (k0) d0.set(k0); else f(t, x, d0);
      for (let k = 0; k < seq.length; k++) {
        const m = seq[k], hs = h / m;
        z0.set(x);
        for (let q = 0; q < n; q++) z1[q] = x[q] + hs * d0[q];
        for (let i = 1; i < m; i++) {
          f(t + i * hs, z1, d);
          for (let q = 0; q < n; q++) { const zn = z0[q] + 2 * hs * d[q]; z0[q] = z1[q]; z1[q] = zn; }
        }
        f(t + h, z1, d);
        for (let q = 0; q < n; q++) T[k][q] = 0.5 * (z0[q] + z1[q] + hs * d[q]);
        // Aitken–Neville in h^2
        for (let j = k - 1; j >= 0; j--) {
          const r = (seq[k] / seq[j]) ** 2;
          for (let q = 0; q < n; q++) T[j][q] = T[j + 1][q] + (T[j + 1][q] - T[j][q]) / (r - 1);
        }
      }
      // after the loop T[0] holds the fully extrapolated value
      for (let q = 0; q < n; q++) out[q] = T[0][q];
      return { err: 0 };
    },
  };
}

// ------------------------------------------------------------ dense LU helpers
function luFactor(A, n, piv) {
  for (let k = 0; k < n; k++) {
    let p = k, mx = Math.abs(A[k + k * n]);
    for (let i = k + 1; i < n; i++) { const v = Math.abs(A[i + k * n]); if (v > mx) { mx = v; p = i; } }
    piv[k] = p;
    if (mx === 0) return false;
    if (p !== k) for (let j = 0; j < n; j++) { const s = A[k + j * n]; A[k + j * n] = A[p + j * n]; A[p + j * n] = s; }
    const akk = A[k + k * n];
    for (let i = k + 1; i < n; i++) A[i + k * n] /= akk;
    for (let j = k + 1; j < n; j++) { const akj = A[k + j * n]; if (akj) for (let i = k + 1; i < n; i++) A[i + j * n] -= A[i + k * n] * akj; }
  }
  return true;
}
function luSolve(A, n, piv, b) {
  for (let k = 0; k < n; k++) { const p = piv[k]; if (p !== k) { const s = b[k]; b[k] = b[p]; b[p] = s; } }
  for (let i = 0; i < n; i++) { let s = b[i]; for (let j = 0; j < i; j++) s -= A[i + j * n] * b[j]; b[i] = s; }
  for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < n; j++) s -= A[i + j * n] * b[j]; b[i] = s / A[i + i * n]; }
}
export { luFactor, luSolve };

/** Finite-difference Jacobian of f at (t, x) with f0 = f(t, x). */
function jacobian(f, t, x, f0, J, tmpx, tmpf) {
  const n = x.length;
  tmpx.set(x);
  for (let j = 0; j < n; j++) {
    const dx = Math.sqrt(2.2e-16) * Math.max(1e-5, Math.abs(x[j]));
    tmpx[j] = x[j] + dx;
    f(t, tmpx, tmpf);
    for (let i = 0; i < n; i++) J[i + j * n] = (tmpf[i] - f0[i]) / dx;
    tmpx[j] = x[j];
  }
}

// ------------------------------------------------------------ stiff: Rosenbrock 2(3)
function rosenbrockSolver(n, name) {
  const d = 1 / (2 + Math.SQRT2), e32 = 6 + Math.SQRT2;
  const J = new Float64Array(n * n), W = new Float64Array(n * n), piv = new Int32Array(n);
  const F0 = new Float64Array(n), F1 = new Float64Array(n), F2 = new Float64Array(n), Tt = new Float64Array(n);
  const k1 = new Float64Array(n), k2 = new Float64Array(n), k3 = new Float64Array(n), tx = new Float64Array(n), tf = new Float64Array(n), y1 = new Float64Array(n);
  return {
    name, adaptive: true, order: 2,
    step(f, t, x, h, out, k0, tol) {
      if (k0) F0.set(k0); else f(t, x, F0);
      jacobian(f, t, x, F0, J, tx, tf);
      const dt = Math.sqrt(2.2e-16) * Math.max(1e-5, Math.abs(t));
      f(t + dt, x, tf);
      for (let i = 0; i < n; i++) Tt[i] = (tf[i] - F0[i]) / dt;
      for (let i = 0; i < n * n; i++) W[i] = -h * d * J[i];
      for (let i = 0; i < n; i++) W[i + i * n] += 1;
      if (!luFactor(W, n, piv)) return { err: Infinity };
      for (let i = 0; i < n; i++) k1[i] = F0[i] + h * d * Tt[i];
      luSolve(W, n, piv, k1);
      for (let i = 0; i < n; i++) y1[i] = x[i] + 0.5 * h * k1[i];
      f(t + 0.5 * h, y1, F1);
      for (let i = 0; i < n; i++) k2[i] = F1[i] - k1[i];
      luSolve(W, n, piv, k2);
      for (let i = 0; i < n; i++) { k2[i] += k1[i]; out[i] = x[i] + h * k2[i]; }
      f(t + h, out, F2);
      for (let i = 0; i < n; i++) k3[i] = F2[i] - e32 * (k2[i] - F1[i]) - 2 * (k1[i] - F0[i]) + h * d * Tt[i];
      luSolve(W, n, piv, k3);
      let en = 0;
      for (let i = 0; i < n; i++) {
        const e = (h / 6) * (k1[i] - 2 * k2[i] + k3[i]);
        const r = Math.abs(e) / (tol.abs + tol.rel * Math.max(Math.abs(x[i]), Math.abs(out[i])));
        if (!(r <= en)) en = Number.isNaN(r) ? Infinity : Math.max(en, r);
      }
      return { err: en };
    },
  };
}

// ------------------------------------------------------------ ode14x: implicit Euler + Richardson
function implicitEulerSolver(n) {
  const J = new Float64Array(n * n), W = new Float64Array(n * n), piv = new Int32Array(n);
  const f0 = new Float64Array(n), fx = new Float64Array(n), r = new Float64Array(n), tx = new Float64Array(n), tf = new Float64Array(n);
  const y = new Float64Array(n), yh = new Float64Array(n), ya = new Float64Array(n);
  function beuler(f, t, x, h, res) {
    f(t + h, x, f0);
    jacobian(f, t + h, x, f0, J, tx, tf);
    for (let i = 0; i < n * n; i++) W[i] = -h * J[i];
    for (let i = 0; i < n; i++) W[i + i * n] += 1;
    if (!luFactor(W, n, piv)) { for (let i = 0; i < n; i++) res[i] = x[i] + h * f0[i]; return; }
    res.set(x);
    for (let it = 0; it < 8; it++) {
      f(t + h, res, fx);
      let nr = 0;
      for (let i = 0; i < n; i++) { r[i] = -(res[i] - x[i] - h * fx[i]); }
      luSolve(W, n, piv, r);
      for (let i = 0; i < n; i++) { res[i] += r[i]; nr = Math.max(nr, Math.abs(r[i]) / (1e-8 + Math.abs(res[i]))); }
      if (nr < 1e-10) break;
    }
  }
  return {
    name: 'ode14x', adaptive: false,
    step(f, t, x, h, out) {
      beuler(f, t, x, h, y);
      beuler(f, t, x, h / 2, yh);
      beuler(f, t + h / 2, yh, h / 2, ya);
      for (let i = 0; i < n; i++) out[i] = 2 * ya[i] - y[i];
      return { err: 0 };
    },
  };
}

// ------------------------------------------------------------ ode113: Adams–Bashforth–Moulton PECE (order 4)
function abmSolver(n) {
  const hist = []; // [{t, f}] most recent last, equally spaced with step hh
  let hh = 0;
  const e45 = makeSolver('ode45', n);
  const pred = new Float64Array(n), fp = new Float64Array(n), fc = new Float64Array(n);
  return {
    name: 'ode113', adaptive: true, order: 3,
    reset() { hist.length = 0; },
    step(f, t, x, h, out, k0, tol) {
      const f0 = new Float64Array(n);
      if (k0) f0.set(k0); else f(t, x, f0);
      const last = hist[hist.length - 1];
      if (!last || Math.abs(last.t + hh - t) > 1e-9 * Math.max(1, Math.abs(t)) || Math.abs(h - hh) > 1e-12 * h) { hist.length = 0; hh = h; }
      hist.push({ t, f: f0 });
      if (hist.length > 4) hist.shift();
      if (hist.length < 4) {
        // start-up with an error-controlled embedded step
        const r = e45.step(f, t, x, h, out, f0, tol);
        if (r.err > 1) { hist.pop(); return r; }
        return { err: r.err, hNext: h };
      }
      const [a, b, c, d] = [hist[0].f, hist[1].f, hist[2].f, hist[3].f];
      for (let i = 0; i < n; i++) pred[i] = x[i] + (h / 24) * (55 * d[i] - 59 * c[i] + 37 * b[i] - 9 * a[i]);
      f(t + h, pred, fp);
      for (let i = 0; i < n; i++) out[i] = x[i] + (h / 24) * (9 * fp[i] + 19 * d[i] - 5 * c[i] + b[i]);
      f(t + h, out, fc);
      let en = 0;
      for (let i = 0; i < n; i++) {
        const e = (19 / 270) * Math.abs(out[i] - pred[i]);
        const r = e / (tol.abs + tol.rel * Math.max(Math.abs(x[i]), Math.abs(out[i])));
        if (!(r <= en)) en = Number.isNaN(r) ? Infinity : Math.max(en, r);
      }
      if (en > 1) { hist.pop(); return { err: en }; }
      return { err: en, hNext: en < 0.01 ? 2 * h : h };
    },
  };
}

/** Default solver names. */
export function pickSolver(settings, nx) {
  let s = String(settings.solver || 'auto').trim();
  const fixed = String(settings.solverType || 'variable') === 'fixed';
  if (s === 'auto' || s === '') s = nx ? (fixed ? 'ode3' : 'ode45') : 'discrete';
  if (s === 'discrete') return { name: 'discrete', fixed };
  if (FIXED_SOLVERS.includes(s)) return { name: s, fixed: true };
  if (VARIABLE_SOLVERS.includes(s)) return { name: s, fixed: false };
  return { name: nx ? (fixed ? 'ode3' : 'ode45') : 'discrete', fixed, unknown: s };
}
