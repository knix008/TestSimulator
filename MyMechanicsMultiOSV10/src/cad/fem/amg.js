// Smoothed-aggregation algebraic multigrid (Vaněk, Mandel & Brezina) as a preconditioner for CG on elasticity:
// nodes are grouped into aggregates on the matrix graph, the tentative prolongator carries the rigid-body modes
// (3 translations + 3 rotations, orthonormalised per aggregate), smoothed by one damped-Jacobi step
// P = (I − ω D⁻¹A) P_tent, coarse matrices A_c = Pᵀ A P, a direct (envelope) solve on the coarsest level;
// a symmetric V-cycle with damped-Jacobi smoothing. Scalar problems (heat) use the constant vector.

import { rcmOrder, envelopeFactor, diagonal, multiply } from './sparse.js';

/** Generic CSR helpers (n rows, sorted columns). */
export function transpose(A, m) {
  const cnt = new Int32Array(m + 1);
  for (let p = 0; p < A.ptr[A.n]; p++) cnt[A.col[p] + 1]++;
  for (let i = 0; i < m; i++) cnt[i + 1] += cnt[i];
  const col = new Int32Array(cnt[m]), val = new Float64Array(cnt[m]), pos = cnt.slice(0, m);
  for (let r = 0; r < A.n; r++) for (let p = A.ptr[r]; p < A.ptr[r + 1]; p++) { const c = A.col[p], q = pos[c]++; col[q] = r; val[q] = A.val[p]; }
  return { n: m, ptr: cnt, col, val };
}
/** C = A·B (Gustavson, rows of A × B). */
export function matmul(A, B, m) {
  const mark = new Int32Array(m).fill(-1), acc = new Float64Array(m), ptr = new Int32Array(A.n + 1);
  const cols = [], vals = [];
  const list = [];
  for (let r = 0; r < A.n; r++) {
    list.length = 0;
    for (let p = A.ptr[r]; p < A.ptr[r + 1]; p++) {
      const k = A.col[p], a = A.val[p];
      for (let q = B.ptr[k]; q < B.ptr[k + 1]; q++) { const c = B.col[q]; if (mark[c] !== r) { mark[c] = r; acc[c] = 0; list.push(c); } acc[c] += a * B.val[q]; }
    }
    list.sort((x, y) => x - y);
    for (const c of list) { cols.push(c); vals.push(acc[c]); }
    ptr[r + 1] = cols.length;
  }
  return { n: A.n, ptr, col: Int32Array.from(cols), val: Float64Array.from(vals) };
}
const mv = (A, x, y) => { for (let r = 0; r < A.n; r++) { let s = 0; for (let p = A.ptr[r]; p < A.ptr[r + 1]; p++) s += A.val[p] * x[A.col[p]]; y[r] = s; } return y; };

/** Thin QR of a k×b block (row-major) by modified Gram–Schmidt: Q (k×b, dropping dependent columns → zero), R (b×b). */
function qr(B, k, b) {
  const Q = Float64Array.from(B), R = new Float64Array(b * b);
  for (let j = 0; j < b; j++) {
    for (let i = 0; i < j; i++) { let d = 0; for (let r = 0; r < k; r++) d += Q[r * b + i] * Q[r * b + j]; R[i * b + j] = d; for (let r = 0; r < k; r++) Q[r * b + j] -= d * Q[r * b + i]; }
    let nr = 0; for (let r = 0; r < k; r++) nr += Q[r * b + j] ** 2;
    nr = Math.sqrt(nr); R[j * b + j] = nr;
    for (let r = 0; r < k; r++) Q[r * b + j] = nr > 1e-12 ? Q[r * b + j] / nr : 0;
  }
  return { Q, R };
}

/**
 * Builds the hierarchy. A: CSR with A.g (node graph) and A.d (dofs per node); coords: node positions (3 per node) for the
 * rigid-body modes (null for scalar problems); mask: fixed dofs (identity rows). Returns apply(r, z) or null.
 */
export function smoothedAggregation(A, { coords = null, mask = null, coarse = 2500, maxLevels = 6, radius = 0.6 } = {}) {
  if (!A.g || !A.d) return null;
  const levels = [];
  let Ak = { n: A.n, ptr: A.ptr, col: A.col, val: A.val }, d = A.d, nn = A.g.nn, gptr = A.g.ptr, gidx = A.g.idx;
  // Near null space at the fine level: rigid-body modes (or constants).
  const b0 = d === 3 && coords ? 6 : d;
  let NS = new Float64Array(A.n * b0);
  for (let i = 0; i < nn; i++) for (let k = 0; k < d; k++) {
    const r = d * i + k;
    if (mask?.[r]) continue;
    if (b0 === 6) {
      const x = coords[3 * i], y = coords[3 * i + 1], z = coords[3 * i + 2];
      NS[r * 6 + k] = 1;
      const rot = [[0, -z, y], [z, 0, -x], [-y, x, 0]][k];
      NS[r * 6 + 3] = rot[0]; NS[r * 6 + 4] = rot[1]; NS[r * 6 + 5] = rot[2];
    } else NS[r * b0 + k] = 1;
  }
  let b = b0;
  // Node positions at each level (aggregate centres below the fine one), for the neighbour radius.
  let pos = coords && d === 3 ? coords : null;
  for (let lvl = 0; lvl < maxLevels && Ak.n > coarse; lvl++) {
    // Aggregation on the node graph, each root taking only its nearer neighbours (within `radius` × its farthest
    // one; aggregate centres stand for the coarse nodes): the whole neighbourhood of a quadratic tet node is ~60
    // nodes, and aggregates that big coarsened ~45:1 — a weak coarse correction (an assembly took 733 CG
    // iterations; 447 with radius 0.6).
    let sptr = gptr, sidx = gidx;
    const RADIUS = radius;
    if (RADIUS > 0 && pos) {
      const lp = new Int32Array(nn + 1), li = [];
      const dist = (i, j) => Math.hypot(pos[3 * i] - pos[3 * j], pos[3 * i + 1] - pos[3 * j + 1], pos[3 * i + 2] - pos[3 * j + 2]);
      for (let i = 0; i < nn; i++) { let far = 0; for (let p = gptr[i]; p < gptr[i + 1]; p++) far = Math.max(far, dist(i, gidx[p])); for (let p = gptr[i]; p < gptr[i + 1]; p++) { const j = gidx[p]; if (j === i || dist(i, j) <= RADIUS * far) li.push(j); } lp[i + 1] = li.length; }
      sptr = lp; sidx = Int32Array.from(li);
    }
    const agg = new Int32Array(nn).fill(-1);
    let na = 0;
    for (let i = 0; i < nn; i++) {
      if (agg[i] >= 0) continue;
      let free = true;
      for (let p = sptr[i]; p < sptr[i + 1]; p++) if (agg[sidx[p]] >= 0) { free = false; break; }
      if (!free) continue;
      for (let p = sptr[i]; p < sptr[i + 1]; p++) agg[sidx[p]] = na;
      agg[i] = na++;
    }
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < nn; i++) {
      if (agg[i] >= 0) continue;
      for (let p = sptr[i]; p < sptr[i + 1]; p++) if (agg[sidx[p]] >= 0) { agg[i] = agg[sidx[p]]; break; }
    }
    for (let i = 0; i < nn; i++) if (agg[i] < 0) agg[i] = na++;
    if (na * b >= Ak.n * 0.7) break;
    // Tentative prolongator: per aggregate, QR of its near-null-space rows.
    const members = Array.from({ length: na }, () => []);
    for (let i = 0; i < nn; i++) members[agg[i]].push(i);
    const pt = { n: Ak.n, ptr: new Int32Array(Ak.n + 1), col: null, val: null };
    const tcol = new Int32Array(Ak.n * b), tval = new Float64Array(Ak.n * b);
    const NSc = new Float64Array(na * b * b);
    for (let a = 0; a < na; a++) {
      const rows = [];
      for (const i of members[a]) for (let k = 0; k < d; k++) rows.push(d * i + k);
      const B = new Float64Array(rows.length * b);
      rows.forEach((r, q) => { for (let j = 0; j < b; j++) B[q * b + j] = NS[r * b + j]; });
      const { Q, R } = qr(B, rows.length, b);
      rows.forEach((r, q) => { for (let j = 0; j < b; j++) { tcol[r * b + j] = a * b + j; tval[r * b + j] = Q[q * b + j]; } });
      for (let i = 0; i < b; i++) for (let j = 0; j < b; j++) NSc[(a * b + i) * b + j] = R[i * b + j];
    }
    for (let r = 0; r <= Ak.n; r++) pt.ptr[r] = r * b;
    pt.col = tcol; pt.val = tval;
    // Smoothing: P = (I − ω D⁻¹A) P_tent, ω = (4/3)/ρ(D⁻¹A) (power iterations).
    const D = new Float64Array(Ak.n);
    for (let r = 0; r < Ak.n; r++) for (let p = Ak.ptr[r]; p < Ak.ptr[r + 1]; p++) if (Ak.col[p] === r) D[r] = Ak.val[p];
    let v = Float64Array.from({ length: Ak.n }, (_, i) => Math.sin(i + 1)), w = new Float64Array(Ak.n), rho = 1;
    for (let it = 0; it < 25; it++) { mv(Ak, v, w); let nrm = 0; for (let i = 0; i < Ak.n; i++) { w[i] /= D[i] || 1; nrm += w[i] * w[i]; } nrm = Math.sqrt(nrm); rho = nrm / Math.sqrt(v.reduce((s2, x) => s2 + x * x, 0)); for (let i = 0; i < Ak.n; i++) v[i] = w[i] / nrm; }
    const omega = 4 / 3 / rho;
    const AP = matmul(Ak, pt, na * b);
    // P = P_tent − ω D⁻¹ AP (P_tent's pattern ⊂ AP's pattern).
    const P = { n: Ak.n, ptr: AP.ptr, col: AP.col, val: new Float64Array(AP.val.length) };
    for (let r = 0; r < Ak.n; r++) {
      const s = omega / (D[r] || 1);
      for (let p = AP.ptr[r]; p < AP.ptr[r + 1]; p++) P.val[p] = -s * AP.val[p];
      for (let j = 0; j < b; j++) {
        const c = tcol[r * b + j], t = tval[r * b + j];
        if (!t) continue;
        let lo = AP.ptr[r], hi = AP.ptr[r + 1] - 1;
        while (lo <= hi) { const m = (lo + hi) >> 1; if (AP.col[m] === c) { P.val[m] += t; break; } if (AP.col[m] < c) lo = m + 1; else hi = m - 1; }
      }
    }
    const PT = transpose(P, na * b);
    const Ac = matmul(PT, matmul(Ak, P, na * b), na * b);
    levels.push({ A: Ak, D, P, PT, omega: 0.9 / (1.1 * rho), rho });
    // The coarse graph from the coarse matrix's own pattern (Pᵀ A P reaches beyond adjacent aggregates).
    const nbr = Array.from({ length: na }, () => new Set());
    for (let r = 0; r < Ac.n; r++) { const a1 = (r / b) | 0; for (let p = Ac.ptr[r]; p < Ac.ptr[r + 1]; p++) nbr[a1].add((Ac.col[p] / b) | 0); }
    const ngp = new Int32Array(na + 1), lists = nbr.map((s2, a2) => { s2.add(a2); const u = Int32Array.from(s2).sort(); ngp[a2 + 1] = u.length; return u; });
    for (let a2 = 0; a2 < na; a2++) ngp[a2 + 1] += ngp[a2];
    const ngi = new Int32Array(ngp[na]); lists.forEach((u, a2) => ngi.set(u, ngp[a2]));
    if (pos) { const pc = new Float64Array(3 * na), cnt = new Float64Array(na); for (let i = 0; i < nn; i++) { const a2 = agg[i]; cnt[a2]++; for (let k = 0; k < 3; k++) pc[3 * a2 + k] += pos[3 * i + k]; } for (let a2 = 0; a2 < na; a2++) for (let k = 0; k < 3; k++) pc[3 * a2 + k] /= cnt[a2] || 1; pos = pc; }
    Ak = Ac; d = b; nn = na; gptr = ngp; gidx = ngi; NS = NSc;
  }
  // Coarsest: envelope LDLᵀ (needs a block graph — the coarse matrix rows are b per coarse node).
  const coarseA = { ...Ak, d, g: { nn, ptr: gptr, idx: gidx } };
  let coarseSolve;
  // Coarse rows can be empty (all-fixed aggregates): regularise the diagonal.
  // Such a row's column of P is zero (an aggregate of fixed dofs only, or a rigid-body column the QR dropped): the
  // dof is decoupled, so a unit diagonal leaves the rest as it is. Giving up here instead (as before) dropped the
  // whole multigrid for a weak fallback — a fine assembly mesh took 2800 CG iterations instead of a few hundred.
  {
    const empty = [];
    for (let r = 0; r < coarseA.n; r++) { let has = false; for (let p = coarseA.ptr[r]; p < coarseA.ptr[r + 1]; p++) if (coarseA.col[p] === r && Math.abs(coarseA.val[p]) > 0) has = true; if (!has) empty.push(r); }
    if (empty.length) {
      const isEmpty = new Uint8Array(coarseA.n); for (const r of empty) isEmpty[r] = 1;
      const ptr = new Int32Array(coarseA.n + 1), col = [], val = [];
      for (let r = 0; r < coarseA.n; r++) {
        if (isEmpty[r]) { col.push(r); val.push(1); }
        else for (let p = coarseA.ptr[r]; p < coarseA.ptr[r + 1]; p++) { if (isEmpty[coarseA.col[p]]) continue; col.push(coarseA.col[p]); val.push(coarseA.val[p]); }
        ptr[r + 1] = col.length;
      }
      coarseA.ptr = ptr; coarseA.col = Int32Array.from(col); coarseA.val = Float64Array.from(val);
    }
  }
  try {
    const perm = rcmOrder(coarseA.g);
    let F = envelopeFactor(coarseA, perm);
    // A coarse matrix singular to round-off (dependent rigid-body columns of one aggregate) has a zero pivot:
    // shifted by 1e-8 of its mean diagonal it factors, and as a preconditioner the shift does not matter. (Giving up
    // dropped the multigrid for Jacobi-like CG: 2800 iterations on a fine assembly mesh.)
    if (!F) {
      let s = 0, k = 0;
      for (let r = 0; r < coarseA.n; r++) for (let p = coarseA.ptr[r]; p < coarseA.ptr[r + 1]; p++) if (coarseA.col[p] === r) { s += Math.abs(coarseA.val[p]); k++; }
      const shift = 1e-8 * (s / Math.max(1, k)) || 1e-12;
      const val = Float64Array.from(coarseA.val);
      for (let r = 0; r < coarseA.n; r++) for (let p = coarseA.ptr[r]; p < coarseA.ptr[r + 1]; p++) if (coarseA.col[p] === r) val[p] += shift;
      F = envelopeFactor({ ...coarseA, val }, perm);
    }
    if (!F) return null;
    coarseSolve = (r, z) => F.solve(r, z);
  } catch { return null; }
  if (!levels.length) return coarseSolve;
  // Gauss–Seidel sweeps: forward before the coarse correction, backward after (a symmetric V-cycle for CG).
  const smooth = (L, x, rhs, sweeps, backward) => {
    const A2 = L.A;
    for (let s2 = 0; s2 < sweeps; s2++) {
      for (let q = 0; q < A2.n; q++) {
        const i = backward ? A2.n - 1 - q : q;
        let t = rhs[i];
        for (let p = A2.ptr[i]; p < A2.ptr[i + 1]; p++) { const c = A2.col[p]; if (c !== i) t -= A2.val[p] * x[c]; }
        if (L.D[i]) x[i] = t / L.D[i];
      }
    }
  };
  const cycle = (k, rhs) => {
    if (k === levels.length) { const z = new Float64Array(rhs.length); coarseSolve(rhs, z); return z; }
    const L = levels[k], x = new Float64Array(L.A.n);
    smooth(L, x, rhs, 1, false);
    const res = new Float64Array(L.A.n); mv(L.A, x, res); for (let i = 0; i < L.A.n; i++) res[i] = rhs[i] - res[i];
    const rc = new Float64Array(L.PT.n); mv(L.PT, res, rc);
    const ec = cycle(k + 1, rc);
    const e = new Float64Array(L.A.n); mv(L.P, ec, e);
    for (let i = 0; i < L.A.n; i++) x[i] += e[i];
    smooth(L, x, rhs, 1, true);
    return x;
  };
  void multiply; void diagonal;
  return (r, z) => { z.set(cycle(0, r)); if (mask) for (let i = 0; i < z.length; i++) if (mask[i]) z[i] = r[i]; return z; };
}
