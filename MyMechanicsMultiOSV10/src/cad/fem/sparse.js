// Sparse symmetric matrices for the tetrahedral solver: node graphs, CSR assembly with d dofs per node,
// Dirichlet conditions, incomplete Cholesky IC(0) and Jacobi preconditioners, preconditioned conjugate
// gradients, and eigen solvers (LOBPCG for K x = λ M x, subspace iteration for buckling).
//
// Storage: a scalar CSR (ptr, col, val) built from a node graph. With d dofs per node, row d·i+k of node i
// holds the columns d·j+l of i's neighbours j (sorted, i included): the entry of (i,k),(j,l) sits at
// base(i,k) + d·pos(j) + l, base(i,k) = d²·gptr[i] + k·d·deg(i). So assembly never searches.

/** Node adjacency (sorted, self included) of elements with `npe` nodes each, plus extra node pairs. */
export function nodeGraph(nn, conn, npe, extraPairs = null) {
  const sets = Array.from({ length: nn }, () => []);
  const ne = conn.length / npe;
  for (let e = 0; e < ne; e++) {
    const o = e * npe;
    for (let a = 0; a < npe; a++) { const i = conn[o + a]; for (let b = 0; b < npe; b++) sets[i].push(conn[o + b]); }
  }
  if (extraPairs) for (let p = 0; p < extraPairs.length; p += 2) { const i = extraPairs[p], j = extraPairs[p + 1]; sets[i].push(j); sets[j].push(i); }
  const ptr = new Int32Array(nn + 1);
  const lists = sets.map((s, i) => { s.push(i); const u = Int32Array.from(new Set(s)).sort(); ptr[i + 1] = u.length; return u; });
  for (let i = 0; i < nn; i++) ptr[i + 1] += ptr[i];
  const idx = new Int32Array(ptr[nn]);
  lists.forEach((u, i) => idx.set(u, ptr[i]));
  return { nn, ptr, idx };
}

/** Position of node j in node i's row (binary search), −1 when absent. */
export function graphPos(g, i, j) {
  let lo = g.ptr[i], hi = g.ptr[i + 1] - 1;
  while (lo <= hi) { const m = (lo + hi) >> 1, v = g.idx[m]; if (v === j) return m - g.ptr[i]; if (v < j) lo = m + 1; else hi = m - 1; }
  return -1;
}

/** An empty CSR matrix with d dofs per node on graph g. */
export function csrFromGraph(g, d) {
  const n = g.nn * d, ptr = new Int32Array(n + 1);
  for (let i = 0; i < g.nn; i++) { const deg = g.ptr[i + 1] - g.ptr[i]; for (let k = 0; k < d; k++) ptr[d * i + k + 1] = deg * d; }
  for (let r = 0; r < n; r++) ptr[r + 1] += ptr[r];
  const col = new Int32Array(ptr[n]);
  for (let i = 0; i < g.nn; i++) {
    const s = g.ptr[i], deg = g.ptr[i + 1] - s;
    for (let k = 0; k < d; k++) { let p = ptr[d * i + k]; for (let q = 0; q < deg; q++) { const j = g.idx[s + q]; for (let l = 0; l < d; l++) col[p++] = d * j + l; } }
  }
  return { n, d, g, ptr, col, val: new Float64Array(ptr[n]) };
}

/** Adds an element matrix Ke ((d·npe)²) for element nodes `nodes` into A. */
export function assemble(A, nodes, npe, Ke, scale = 1) {
  const { d, g, ptr, val } = A, m = d * npe;
  for (let a = 0; a < npe; a++) {
    const i = nodes[a], gi = g.ptr[i], deg = g.ptr[i + 1] - gi;
    for (let b = 0; b < npe; b++) {
      const pos = graphPos(g, i, nodes[b]);
      for (let k = 0; k < d; k++) {
        const base = ptr[d * i + k] + d * pos, row = (d * a + k) * m + d * b;
        for (let l = 0; l < d; l++) val[base + l] += scale * Ke[row + l];
      }
    }
    void deg;
  }
}

/** Adds v to entry (r, c) (must be in the pattern). */
export function addEntry(A, r, c, v) {
  let lo = A.ptr[r], hi = A.ptr[r + 1] - 1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (A.col[m] === c) { A.val[m] += v; return true; } if (A.col[m] < c) lo = m + 1; else hi = m - 1; }
  return false;
}

/** Entry (r, c) or 0. */
export function getEntry(A, r, c) {
  let lo = A.ptr[r], hi = A.ptr[r + 1] - 1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (A.col[m] === c) return A.val[m]; if (A.col[m] < c) lo = m + 1; else hi = m - 1; }
  return 0;
}

export function diagonal(A) {
  const out = new Float64Array(A.n);
  for (let r = 0; r < A.n; r++) out[r] = getEntry(A, r, r);
  return out;
}

/** y = A x. */
export function multiply(A, x, y) {
  const { n, ptr, col, val } = A;
  if (A.d === 3 && A.g) {
    // Node blocks: the three rows of node i share the neighbour list, so each x_j triple is read once.
    const gp = A.g.ptr, gi = A.g.idx, nn = A.g.nn;
    for (let i = 0; i < nn; i++) {
      const s0 = gp[i], deg = gp[i + 1] - s0;
      let p0 = ptr[3 * i], p1 = p0 + 3 * deg, p2 = p1 + 3 * deg, y0 = 0, y1 = 0, y2 = 0;
      for (let q = 0; q < deg; q++, p0 += 3, p1 += 3, p2 += 3) {
        const j = 3 * gi[s0 + q], x0 = x[j], x1 = x[j + 1], x2 = x[j + 2];
        y0 += val[p0] * x0 + val[p0 + 1] * x1 + val[p0 + 2] * x2;
        y1 += val[p1] * x0 + val[p1 + 1] * x1 + val[p1 + 2] * x2;
        y2 += val[p2] * x0 + val[p2 + 1] * x1 + val[p2 + 2] * x2;
      }
      y[3 * i] = y0; y[3 * i + 1] = y1; y[3 * i + 2] = y2;
    }
    return y;
  }
  for (let r = 0; r < n; r++) { let s = 0; for (let p = ptr[r], e = ptr[r + 1]; p < e; p++) s += val[p] * x[col[p]]; y[r] = s; }
  return y;
}

export function cloneMatrix(A) { return { ...A, val: Float64Array.from(A.val) }; }

/**
 * Dirichlet conditions: fixed[r] = 1 with value[r] (default 0). Moves the known columns to the right-hand side
 * b (when given) and leaves rows / columns of fixed dofs as the identity. Returns the reactions helper data.
 */
export function applyDirichlet(A, fixed, value = null, b = null) {
  const { n, ptr, col, val } = A;
  if (b && value) {
    for (let r = 0; r < n; r++) {
      if (fixed[r]) continue;
      let s = 0;
      for (let p = ptr[r]; p < ptr[r + 1]; p++) { const c = col[p]; if (fixed[c] && value[c]) s += val[p] * value[c]; }
      b[r] -= s;
    }
  }
  for (let r = 0; r < n; r++) {
    if (fixed[r]) { for (let p = ptr[r]; p < ptr[r + 1]; p++) val[p] = col[p] === r ? 1 : 0; if (b) b[r] = value ? value[r] : 0; continue; }
    for (let p = ptr[r]; p < ptr[r + 1]; p++) if (fixed[col[p]]) val[p] = 0;
  }
}

// ───────────────────────── preconditioners

export function jacobi(A) {
  const d = diagonal(A), inv = d.map((x) => (x > 0 ? 1 / x : 1));
  return (r, z) => { for (let i = 0; i < r.length; i++) z[i] = inv[i] * r[i]; return z; };
}

/**
 * Incomplete Cholesky IC(0) of a symmetric positive definite CSR (lower part, same pattern), on the diagonally
 * scaled matrix; on breakdown the diagonal is shifted (A + α·diag) and the factorization restarted.
 * Returns apply(r, z) for z ≈ A⁻¹ r, or null if every shift failed.
 */
export function incompleteCholesky(A) {
  const { n, ptr, col, val } = A;
  const dg = diagonal(A), s = dg.map((x) => (x > 0 ? 1 / Math.sqrt(x) : 1));
  // Lower part (columns < r) plus the diagonal last, row by row.
  const lp = new Int32Array(n + 1);
  for (let r = 0; r < n; r++) { let c = 0; for (let p = ptr[r]; p < ptr[r + 1]; p++) if (col[p] <= r) c++; lp[r + 1] = lp[r] + c; }
  const lc = new Int32Array(lp[n]), base = new Float64Array(lp[n]);
  for (let r = 0, q = 0; r < n; r++) for (let p = ptr[r]; p < ptr[r + 1]; p++) if (col[p] <= r) { lc[q] = col[p]; base[q] = val[p] * s[r] * s[col[p]]; q++; }
  const L = new Float64Array(lp[n]), w = new Float64Array(n), mark = new Uint8Array(n);
  for (const shift of [0, 1e-3, 1e-2, 0.05, 0.2, 1]) {
    let ok = true;
    for (let r = 0; r < n && ok; r++) {
      const s0 = lp[r], s1 = lp[r + 1];
      for (let q = s0; q < s1; q++) { w[lc[q]] = base[q] * (lc[q] === r ? 1 + shift : 1); mark[lc[q]] = 1; }
      for (let q = s0; q < s1 - 1; q++) {
        const k = lc[q];
        // w[k] -= Σ_{j<k} L_rj L_kj, over row k's lower entries present in row r.
        let t = w[k];
        for (let u = lp[k], ue = lp[k + 1] - 1; u < ue; u++) { const j = lc[u]; if (mark[j]) t -= L[u] * w[j]; }
        // w[j] for j<k already holds L_rj (finished), so the product above uses L_rj.
        t /= L[lp[k + 1] - 1];
        w[k] = t;
      }
      let dsum = w[r];
      for (let q = s0; q < s1 - 1; q++) dsum -= w[lc[q]] * w[lc[q]];
      if (!(dsum > 1e-12)) ok = false;
      else {
        for (let q = s0; q < s1 - 1; q++) L[q] = w[lc[q]];
        L[s1 - 1] = Math.sqrt(dsum);
      }
      for (let q = s0; q < s1; q++) { mark[lc[q]] = 0; w[lc[q]] = 0; }
    }
    if (!ok) continue;
    const y = new Float64Array(n);
    return (rr, z) => {
      for (let r = 0; r < n; r++) {
        let t = rr[r] * s[r];
        for (let q = lp[r], e = lp[r + 1] - 1; q < e; q++) t -= L[q] * y[lc[q]];
        y[r] = t / L[lp[r + 1] - 1];
      }
      for (let r = n - 1; r >= 0; r--) {
        const v = y[r] / L[lp[r + 1] - 1];
        y[r] = v;
        for (let q = lp[r], e = lp[r + 1] - 1; q < e; q++) y[lc[q]] -= L[q] * v;
      }
      for (let r = 0; r < n; r++) z[r] = y[r] * s[r];
      return z;
    };
  }
  return null;
}

/**
 * An approximate inverse for eigen solvers: a few IC(0)-preconditioned CG iterations (relative tolerance `tol`),
 * i.e. an inexact solve — LOBPCG with it converges in a handful of outer iterations.
 */
export function inexactInverse(A, M = preconditioner(A), { tol = 0.05, maxIter = 80, mask = null } = {}) {
  return (r, z) => {
    z.fill(0);
    pcg((v, out) => multiply(A, v, out), M, r, z, { tol, maxIter });
    if (mask) for (let d = 0; d < z.length; d++) if (mask[d]) z[d] = 0;
    return z;
  };
}

/** IC(0) when it factors, Jacobi otherwise. */
export function preconditioner(A) { return incompleteCholesky(A) ?? jacobi(A); }

// ───────────────────────── conjugate gradients

const dotv = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/**
 * Preconditioned CG for A x = b (x is the start and the result). apply(p, out) = A p, M(r, z) = z ≈ A⁻¹ r.
 * Stops at ‖r‖ ≤ tol·‖b‖ (or ref). Returns { it, rel, converged }.
 */
export function pcg(apply, M, b, x, { tol = 1e-8, maxIter = 5000, ref = 0, onIter = null, cancel = null } = {}) {
  const n = b.length, r = new Float64Array(n), z = new Float64Array(n), p = new Float64Array(n), q = new Float64Array(n);
  apply(x, q);
  for (let i = 0; i < n; i++) r[i] = b[i] - q[i];
  const bn = ref || Math.sqrt(dotv(b, b)) || 1;
  let rn = Math.sqrt(dotv(r, r));
  if (rn <= tol * bn) return { it: 0, rel: rn / bn, converged: true };
  M(r, z); p.set(z);
  let rz = dotv(r, z), it = 0;
  for (; it < maxIter; it++) {
    apply(p, q);
    const pq = dotv(p, q);
    if (!(pq > 0)) break;
    const alpha = rz / pq;
    for (let i = 0; i < n; i++) { x[i] += alpha * p[i]; r[i] -= alpha * q[i]; }
    rn = Math.sqrt(dotv(r, r));
    if (onIter && it % 10 === 0) onIter(it, rn / bn);
    if (cancel?.()) break;
    if (rn <= tol * bn) { it++; break; }
    M(r, z);
    const rz1 = dotv(r, z), beta = rz1 / rz;
    rz = rz1;
    for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i];
  }
  return { it, rel: rn / bn, converged: rn <= tol * bn * 1.0001 };
}

/** Solves A x = b with IC(0)-PCG (A already holding Dirichlet rows). */
export function solve(A, b, x = new Float64Array(A.n), opts = {}) {
  const M = opts.M ?? preconditioner(A);
  const res = pcg((v, out) => multiply(A, v, out), M, b, x, opts);
  return { x, ...res, M };
}

// ───────────────────────── direct solver: reverse Cuthill–McKee + envelope LDLᵀ

/** RCM permutation of the node graph (perm[new] = old), component by component from a low-degree start. */
export function rcmOrder(g) {
  const nn = g.nn, deg = new Int32Array(nn), seen = new Uint8Array(nn), order = [];
  for (let i = 0; i < nn; i++) deg[i] = g.ptr[i + 1] - g.ptr[i];
  const byDeg = Array.from({ length: nn }, (_, i) => i).sort((a, b) => deg[a] - deg[b]);
  for (const start of byDeg) {
    if (seen[start]) continue;
    // A pseudo-peripheral start: the last node of a BFS from `start`.
    let s = start;
    for (let pass = 0; pass < 2; pass++) {
      const q = [s], mark = new Set([s]);
      for (let h = 0; h < q.length; h++) { const v = q[h]; for (let p = g.ptr[v]; p < g.ptr[v + 1]; p++) { const w = g.idx[p]; if (!mark.has(w) && !seen[w]) { mark.add(w); q.push(w); } } }
      s = q.at(-1);
    }
    const q = [s]; seen[s] = 1;
    for (let h = 0; h < q.length; h++) {
      const v = q[h], nb = [];
      for (let p = g.ptr[v]; p < g.ptr[v + 1]; p++) { const w = g.idx[p]; if (!seen[w]) { seen[w] = 1; nb.push(w); } }
      nb.sort((a, b) => deg[a] - deg[b]);
      for (const w of nb) q.push(w);
    }
    order.push(...q);
  }
  return Int32Array.from(order.reverse());
}

/** Envelope size (entries) of A under the node permutation — to decide whether a direct solve is affordable. */
export function envelopeSize(A, perm) {
  const d = A.d, nn = A.g.nn, inv = new Int32Array(nn);
  for (let i = 0; i < nn; i++) inv[perm[i]] = i;
  let total = 0, flops = 0;
  for (let i = 0; i < nn; i++) {
    const old = perm[i];
    let lo = i;
    for (let p = A.g.ptr[old]; p < A.g.ptr[old + 1]; p++) lo = Math.min(lo, inv[A.g.idx[p]]);
    for (let k = 0; k < d; k++) { const len = d * (i - lo) + k + 1; total += len; flops += 0.5 * len * len; }
  }
  return { size: total, flops };
}

/**
 * Solves A x = b choosing the method: the envelope LDLᵀ when its cost is below that of ~400 IC(0)-CG iterations (or
 * `prefer: 'direct'` and it fits), IC(0)-PCG otherwise (or when the factorization meets a zero pivot).
 * Returns { x, method, it, converged, factor (reusable direct factor or null), M (preconditioner or null) }.
 */
export function solveSystem(A, b, x = new Float64Array(A.n), { prefer = 'auto', tol = 1e-9, maxIter = 20000, onIter = null, cancel = null, factor = null, M = null } = {}) {
  if (factor) { factor.solve(b, x); return { x, method: 'direct', it: 1, converged: true, factor, M: null }; }
  if (prefer !== 'iterative' && !M) {
    const perm = rcmOrder(A.g), est = envelopeSize(A, perm);
    const nnz = A.ptr[A.n], cgCost = 400 * 4 * nnz;
    if ((prefer === 'direct' && est.size < 1e8) || (prefer === 'auto' && est.flops < cgCost && est.size < 4e7)) {
      const F = envelopeFactor(A, perm);
      if (F) { F.solve(b, x); return { x, method: 'direct', it: 1, converged: true, factor: F, M: null }; }
    }
  }
  const P = M ?? preconditioner(A);
  const r = pcg((v, out) => multiply(A, v, out), P, b, x, { tol, maxIter, onIter, cancel });
  return { x, method: 'pcg', it: r.it, rel: r.rel, converged: r.converged, factor: null, M: P };
}

/**
 * Envelope LDLᵀ factorization of a symmetric CSR (d dofs per node) under the RCM node order. Works for indefinite
 * matrices without pivoting as long as no pivot vanishes. Returns { solve(b, x), n, size } or null (a zero pivot).
 */
export function envelopeFactor(A, perm = rcmOrder(A.g)) {
  const d = A.d, nn = A.g.nn, n = A.n, inv = new Int32Array(nn);
  for (let i = 0; i < nn; i++) inv[perm[i]] = i;
  // New dof order: node-major in the permuted node order.
  const first = new Int32Array(n), start = new Float64Array(n + 1);
  for (let i = 0; i < nn; i++) {
    const old = perm[i];
    let lo = i;
    for (let p = A.g.ptr[old]; p < A.g.ptr[old + 1]; p++) lo = Math.min(lo, inv[A.g.idx[p]]);
    for (let k = 0; k < d; k++) first[d * i + k] = d * lo;
  }
  for (let r = 0; r < n; r++) start[r + 1] = start[r] + (r - first[r] + 1);
  const size = start[n];
  if (size > 1.2e8) return null;
  const L = new Float64Array(size);       // row r: columns first[r] … r (last = diagonal D)
  for (let i = 0; i < nn; i++) {
    const old = perm[i];
    for (let k = 0; k < d; k++) {
      const rOld = d * old + k, r = d * i + k, base = start[r] - first[r];
      for (let p = A.ptr[rOld]; p < A.ptr[rOld + 1]; p++) {
        const cOld = A.col[p], cn = d * inv[(cOld / d) | 0] + (cOld % d);
        if (cn <= r) L[base + cn] = A.val[p];
      }
    }
  }
  const D = new Float64Array(n);
  let scale = 0;
  for (let r = 0; r < n; r++) scale = Math.max(scale, Math.abs(L[start[r + 1] - 1]));
  for (let r = 0; r < n; r++) {
    const fr = first[r], br = start[r] - fr;
    for (let j = fr; j < r; j++) {
      const fj = first[j], bj = start[j] - fj, k0 = Math.max(fr, fj);
      let s = L[br + j];
      for (let k = k0; k < j; k++) s -= L[br + k] * L[bj + k];
      L[br + j] = s;                        // W_rj = L_rj·D_j (k < j entries of this row are W too)
    }
    // Turn row r into L_rj = (L_rj D_j) / D_j and accumulate the pivot.
    let dr = L[br + r];
    for (let j = fr; j < r; j++) { const v = L[br + j]; const l = v / D[j]; dr -= v * l; L[br + j] = l; }
    if (!(Math.abs(dr) > 1e-14 * scale)) return null;
    D[r] = dr; L[br + r] = 1;
  }
  return { n, size, solve(b, x = new Float64Array(n)) {
    const y = new Float64Array(n);
    for (let i = 0; i < nn; i++) for (let k = 0; k < d; k++) y[d * i + k] = b[d * perm[i] + k];
    for (let r = 0; r < n; r++) { const fr = first[r], br = start[r] - fr; let s = y[r]; for (let j = fr; j < r; j++) s -= L[br + j] * y[j]; y[r] = s; }
    for (let r = 0; r < n; r++) y[r] /= D[r];
    for (let r = n - 1; r >= 0; r--) { const fr = first[r], br = start[r] - fr, v = y[r]; for (let j = fr; j < r; j++) y[j] -= L[br + j] * v; }
    for (let i = 0; i < nn; i++) for (let k = 0; k < d; k++) x[d * perm[i] + k] = y[d * i + k];
    return x;
  } };
}

// ───────────────────────── small dense helpers

/** Cyclic Jacobi eigen-decomposition of a symmetric n×n (row-major): values and column vectors. */
export function symmetricEigen(A0, n) {
  const A = Float64Array.from(A0), Z = new Float64Array(n * n);
  for (let i = 0; i < n; i++) Z[i * n + i] = 1;
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0, diag = 0;
    for (let i = 0; i < n; i++) { diag += A[i * n + i] ** 2; for (let j = i + 1; j < n; j++) off += A[i * n + j] ** 2; }
    if (off <= 1e-30 * diag || off === 0) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      const apq = A[p * n + q];
      if (Math.abs(apq) < 1e-300) continue;
      const theta = (A[q * n + q] - A[p * n + p]) / (2 * apq);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = A[k * n + p], akq = A[k * n + q]; A[k * n + p] = c * akp - s * akq; A[k * n + q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = A[p * n + k], aqk = A[q * n + k]; A[p * n + k] = c * apk - s * aqk; A[q * n + k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const zkp = Z[k * n + p], zkq = Z[k * n + q]; Z[k * n + p] = c * zkp - s * zkq; Z[k * n + q] = s * zkp + c * zkq; }
    }
  }
  return { values: Array.from({ length: n }, (_, i) => A[i * n + i]), vectors: Z };
}

/** A q = λ B q (n×n symmetric, B positive definite): ascending values, B-orthonormal columns Q; null if B singular. */
export function generalizedEigen(A, B, n) {
  const L = new Float64Array(n * n);
  let scale = 0;
  for (let i = 0; i < n; i++) scale = Math.max(scale, B[i * n + i]);
  for (let j = 0; j < n; j++) {
    let s = B[j * n + j];
    for (let k = 0; k < j; k++) s -= L[j * n + k] ** 2;
    if (!(s > 1e-12 * scale)) return null;
    L[j * n + j] = Math.sqrt(s);
    for (let i = j + 1; i < n; i++) { let t = B[i * n + j]; for (let k = 0; k < j; k++) t -= L[i * n + k] * L[j * n + k]; L[i * n + j] = t / L[j * n + j]; }
  }
  const solveL = (M) => {
    const X = new Float64Array(n * n);
    for (let c = 0; c < n; c++) for (let i = 0; i < n; i++) { let t = M[i * n + c]; for (let k = 0; k < i; k++) t -= L[i * n + k] * X[k * n + c]; X[i * n + c] = t / L[i * n + i]; }
    return X;
  };
  const W = solveL(A), Wt = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) Wt[i * n + j] = W[j * n + i];
  const C = solveL(Wt);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) C[i * n + j] = C[j * n + i] = (C[i * n + j] + C[j * n + i]) / 2;
  const { values, vectors } = symmetricEigen(C, n);
  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
  const Q = new Float64Array(n * n);
  order.forEach((src, c) => {
    for (let i = n - 1; i >= 0; i--) { let t = vectors[i * n + src]; for (let k = i + 1; k < n; k++) t -= L[k * n + i] * Q[k * n + c]; Q[i * n + c] = t / L[i * n + i]; }
  });
  return { values: order.map((i) => values[i]), Q };
}

// ───────────────────────── eigen solvers

/**
 * Smallest `p` eigenpairs of K x = λ M x by LOBPCG (Knyazev) with preconditioner T ≈ K⁻¹.
 * applyK, applyM(x, out); mask[d] = 1 for constrained dofs (kept at 0). Returns { values, vectors, iterations, converged }.
 */
export function lobpcg(n, applyK, applyM, T, p, { mask = null, maxIter = 300, tol = 1e-6, seed = 7, onIter = null, cancel = null, start = null } = {}) {
  let s = seed >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) - 0.5;
  const zeroMask = (v) => { if (mask) for (let d = 0; d < n; d++) if (mask[d]) v[d] = 0; return v; };
  const m = p + Math.min(4, Math.max(2, Math.ceil(p / 2)));          // block size with guard vectors
  const mk = (v) => ({ v, M: applyM(v, new Float64Array(n)), K: null });
  /** M-orthonormalises candidates against `base` and each other (two passes of Gram–Schmidt, dropping dependent ones). */
  const orthonormalise = (cands, base) => {
    const out = [];
    for (const v0 of cands) {
      const v = Float64Array.from(v0);
      let ref = 0;
      { const mv = applyM(v, new Float64Array(n)); ref = Math.sqrt(Math.max(0, dotv(v, mv))); }
      if (!(ref > 0)) continue;
      for (let pass = 0; pass < 2; pass++) for (const u of [...base, ...out]) { const c = dotv(v, u.M); if (c) for (let d = 0; d < n; d++) v[d] -= c * u.v[d]; }
      zeroMask(v);
      const e = mk(v), nr = Math.sqrt(Math.max(0, dotv(v, e.M)));
      if (!(nr > 1e-7 * ref)) continue;
      for (let d = 0; d < n; d++) { v[d] /= nr; e.M[d] /= nr; }
      out.push(e);
    }
    return out;
  };
  const withK = (list) => { for (const e of list) if (!e.K) e.K = applyK(e.v, new Float64Array(n)); return list; };
  const gram = (A, B, key) => { const a = A.length, G = new Float64Array(a * a); for (let i = 0; i < a; i++) for (let j = i; j < a; j++) G[i * a + j] = G[j * a + i] = 0.5 * (dotv(A[i].v, B[j][key]) + dotv(A[j].v, B[i][key])); return G; };
  const combine = (S, Q, cols) => cols.map((c) => {
    const v = new Float64Array(n), Mv = new Float64Array(n), Kv = new Float64Array(n), k = S.length;
    for (let i = 0; i < k; i++) { const w = Q[i * k + c]; if (!w) continue; const e = S[i]; for (let d = 0; d < n; d++) { v[d] += w * e.v[d]; Mv[d] += w * e.M[d]; Kv[d] += w * e.K[d]; } }
    return { v, M: Mv, K: Kv };
  });
  let X = orthonormalise(Array.from({ length: m }, (_, j) => zeroMask(start?.[j] ? Float64Array.from(start[j]) : Float64Array.from({ length: n }, rand))), []);
  withK(X);
  {
    const e = generalizedEigen(gram(X, X, 'K'), gram(X, X, 'M'), X.length);
    if (e) X = combine(X, e.Q, X.map((_, i) => i));
  }
  let P = [], values = X.map(() => 0), it = 0, converged = false, resid = [];
  for (; it < maxIter; it++) {
    values = X.map((x) => dotv(x.v, x.K) / dotv(x.v, x.M));
    const R = X.map((x, j) => { const r = new Float64Array(n); for (let d = 0; d < n; d++) r[d] = x.K[d] - values[j] * x.M[d]; return zeroMask(r); });
    resid = R.map((r, j) => Math.sqrt(dotv(r, r)) / Math.max(1e-300, Math.abs(values[j]) * Math.sqrt(dotv(X[j].M, X[j].M))));
    onIter?.(it, Math.max(...resid.slice(0, p)));
    if (resid.slice(0, p).every((r) => r < tol)) { converged = true; break; }
    if (cancel?.()) break;
    const W = orthonormalise(R.filter((_, j) => resid[j] >= 0.05 * tol).map((r) => zeroMask(T(r, new Float64Array(n)))), X);
    const Po = P.length ? orthonormalise(P.map((e) => e.v), [...X, ...W]) : [];
    const S = withK([...X, ...W, ...Po]);
    const e = generalizedEigen(gram(S, S, 'K'), gram(S, S, 'M'), S.length);
    if (!e) { P = []; continue; }
    const cols = X.map((_, i) => i), Qp = Float64Array.from(e.Q);
    for (let i = 0; i < X.length; i++) for (let c = 0; c < S.length; c++) Qp[i * S.length + c] = 0;
    P = combine(S, Qp, cols);
    X = combine(S, e.Q, cols);
  }
  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b]).slice(0, p);
  return { values: order.map((i) => values[i]), vectors: order.map((i) => X[i].v), iterations: it, converged, residuals: order.map((i) => resid[i] ?? 1) };
}

export { dotv as dot };
