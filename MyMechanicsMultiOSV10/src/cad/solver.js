// A small nonlinear least-squares solver (Levenberg–Marquardt with a finite-difference Jacobian),
// shared by the sketch constraints (cad/sketch.js) and the assembly mates (cad/assembly.js).
// The problems are small (tens to a few hundred unknowns), so dense linear algebra is fine.
//
// It also answers which unknowns the equations fix (the null space of the Jacobian): a sketch shows
// fully defined geometry in black and the rest in blue.

/** Solves A x = b in place by Gaussian elimination with partial pivoting (A: n×n rows). Returns x or null. */
export function solveLinear(A, b) {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[pivot][c])) pivot = r;
    if (Math.abs(A[pivot][c]) < 1e-14) return null;
    if (pivot !== c) { [A[c], A[pivot]] = [A[pivot], A[c]]; [b[c], b[pivot]] = [b[pivot], b[c]]; }
    const row = A[c];
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / row[c];
      if (f === 0) continue;
      const target = A[r];
      for (let k = c; k < n; k++) target[k] -= f * row[k];
      b[r] -= f * b[c];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k];
    x[r] = s / A[r][r];
  }
  return x;
}

const norm2 = (v) => v.reduce((s, x) => s + x * x, 0);

/** The Jacobian of `residuals` at x (m×n) by central differences. */
export function jacobian(residuals, x, r0 = residuals(x)) {
  const m = r0.length;
  const n = x.length;
  const J = Array.from({ length: m }, () => new Float64Array(n));
  const xs = x.slice();
  for (let j = 0; j < n; j++) {
    const h = 1e-6 * Math.max(1, Math.abs(x[j]));
    xs[j] = x[j] + h;
    const rp = residuals(xs);
    xs[j] = x[j] - h;
    const rm = residuals(xs);
    xs[j] = x[j];
    for (let i = 0; i < m; i++) J[i][j] = (rp[i] - rm[i]) / (2 * h);
  }
  return J;
}

/**
 * Minimises |residuals(x)|² from x0. Options: maxIter, tol (on the residual norm), and `weights` (per
 * unknown; a heavier one moves less — the point being dragged stays under the pointer).
 * Returns { x, ok, error (the residual norm), iterations }.
 */
export function levenbergMarquardt(residuals, x0, { maxIter = 100, tol = 1e-9, weights = null } = {}) {
  let x = x0.slice();
  const n = x.length;
  let r = residuals(x);
  let cost = norm2(r);
  if (!n || !r.length) return { x, ok: cost < tol * tol, error: Math.sqrt(cost), iterations: 0 };
  let lambda = 1e-3;
  let iter = 0;
  for (; iter < maxIter && cost > tol * tol; iter++) {
    const J = jacobian(residuals, x, r);
    const m = r.length;
    // Normal equations: (JᵀJ + λ·diag) dx = −Jᵀr.
    const JtJ = Array.from({ length: n }, () => new Float64Array(n));
    const Jtr = new Float64Array(n);
    for (let i = 0; i < m; i++) {
      const row = J[i];
      const ri = r[i];
      for (let a = 0; a < n; a++) {
        const va = row[a];
        if (va === 0) continue;
        Jtr[a] += va * ri;
        const target = JtJ[a];
        for (let b = 0; b < n; b++) target[b] += va * row[b];
      }
    }
    let improved = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      const A = Array.from({ length: n }, (_, a) => Float64Array.from(JtJ[a]));
      for (let a = 0; a < n; a++) A[a][a] += lambda * (Math.max(JtJ[a][a], 1e-9) + (weights?.[a] ?? 0));
      const dx = solveLinear(A, Array.from(Jtr, (v) => -v));
      if (!dx) { lambda *= 10; continue; }
      const xn = x.map((v, k) => v + dx[k]);
      const rn = residuals(xn);
      const cn = norm2(rn);
      if (Number.isFinite(cn) && cn < cost) {
        x = xn; r = rn; cost = cn;
        lambda = Math.max(lambda / 10, 1e-12);
        improved = true;
        break;
      }
      lambda *= 10;
    }
    if (!improved) break;
  }
  return { x, ok: Math.sqrt(cost) < Math.max(tol, 1e-7), error: Math.sqrt(cost), iterations: iter };
}

/**
 * Rank and null space of J (m×n) by reduced row echelon form. Returns { rank, free: [column], fixed: bool[n] }:
 * `fixed[j]` is true when unknown j cannot move without breaking an equation.
 */
export function nullSpaceInfo(J, n, tol = 1e-7) {
  const rows = J.map((row) => Float64Array.from(row));
  const m = rows.length;
  const pivots = [];
  let r = 0;
  for (let c = 0; c < n && r < m; c++) {
    let best = r;
    for (let i = r + 1; i < m; i++) if (Math.abs(rows[i][c]) > Math.abs(rows[best][c])) best = i;
    if (Math.abs(rows[best][c]) < tol) continue;
    [rows[r], rows[best]] = [rows[best], rows[r]];
    const p = rows[r][c];
    for (let k = 0; k < n; k++) rows[r][k] /= p;
    for (let i = 0; i < m; i++) {
      if (i === r) continue;
      const f = rows[i][c];
      if (Math.abs(f) < 1e-18) continue;
      for (let k = 0; k < n; k++) rows[i][k] -= f * rows[r][k];
    }
    pivots.push(c);
    r++;
  }
  const isPivot = new Array(n).fill(false);
  pivots.forEach((c) => { isPivot[c] = true; });
  const free = [];
  for (let c = 0; c < n; c++) if (!isPivot[c]) free.push(c);
  // Null space basis: one vector per free column. Unknown j is fixed when every basis vector is 0 there.
  const fixed = new Array(n).fill(true);
  for (const f of free) {
    fixed[f] = false;
    pivots.forEach((pc, row) => { if (Math.abs(rows[row][f]) > 1e-6) fixed[pc] = false; });
  }
  return { rank: pivots.length, free, fixed };
}
