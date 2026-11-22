// Pressure solver of the moulding flow (no DOM): conjugate gradients preconditioned by an aggregation algebraic
// multigrid V-cycle, for the weighted graph Laplacian of the cavity
//   (d_i + Σ_j g_ij) p_i − Σ_j g_ij p_j = b_i   on the active nodes,
// nodes outside the active set held at their value (Dirichlet, moved into b).
//
// The aggregates (and the coarse graphs they make) depend only on the domain's graph, so they are built once per
// domain; each solve only sums the edge conductances of the current step into the coarse operators (Galerkin
// with piecewise-constant prolongation: the coarse conductance between two aggregates is the sum of the fine
// ones between them). Smoothing is Gauss–Seidel, forward before and backward after the coarse correction, so the
// V-cycle is symmetric and positive definite and a valid preconditioner for CG; the plain aggregation's coarse
// correction is over-relaxed (a standard remedy for its too-small coarse energy). The coarsest level is solved
// directly (dense Cholesky). Typed arrays throughout; scratch arrays are kept with the hierarchy.

const COARSEST = 400;
const OVER = 1.6;

/** Greedy aggregation of a graph (rowPtr/col): a seed with all its neighbours free takes them, the rest join. */
function aggregate(n, rowPtr, col) {
  const agg = new Int32Array(n).fill(-1); let na = 0;
  for (let i = 0; i < n; i++) {
    if (agg[i] >= 0) continue;
    let free = true;
    for (let k = rowPtr[i]; k < rowPtr[i + 1]; k++) if (agg[col[k]] >= 0) { free = false; break; }
    if (!free) continue;
    agg[i] = na; for (let k = rowPtr[i]; k < rowPtr[i + 1]; k++) agg[col[k]] = na;
    na++;
  }
  for (let i = 0; i < n; i++) {
    if (agg[i] >= 0) continue;
    for (let k = rowPtr[i]; k < rowPtr[i + 1]; k++) if (agg[col[k]] >= 0) { agg[i] = agg[col[k]]; break; }
    if (agg[i] < 0) agg[i] = na++;
  }
  return { agg, na };
}

/** CSR adjacency of an edge list: rowPtr, col, edge (the edge index of each entry). */
function adjacency(n, ea, eb) {
  const m = ea.length; const deg = new Int32Array(n + 1);
  for (let e = 0; e < m; e++) { deg[ea[e] + 1]++; deg[eb[e] + 1]++; }
  for (let i = 0; i < n; i++) deg[i + 1] += deg[i];
  const rowPtr = Int32Array.from(deg); const fill = Int32Array.from(deg.subarray(0, n));
  const col = new Int32Array(2 * m); const edge = new Int32Array(2 * m);
  for (let e = 0; e < m; e++) {
    const a = ea[e]; const b = eb[e];
    col[fill[a]] = b; edge[fill[a]++] = e; col[fill[b]] = a; edge[fill[b]++] = e;
  }
  return { rowPtr, col, edge };
}

/** The multigrid hierarchy of a domain's graph (cached on the domain). */
export function hierarchy(domain) {
  if (domain._amg && domain._amg.m === domain.ea.length) return domain._amg;
  const levels = [];
  let n = domain.nodes.length; let ea = domain.ea; let eb = domain.eb;
  for (;;) {
    const lv = { n, ea, eb, ...adjacency(n, ea, eb) };
    lv.diag = new Float64Array(n); lv.w = new Float64Array(ea.length); lv.act = new Uint8Array(n);
    lv.x = new Float64Array(n); lv.b = new Float64Array(n); lv.r = new Float64Array(n);
    levels.push(lv);
    if (n <= COARSEST || levels.length > 12) break;
    const { agg, na } = aggregate(n, lv.rowPtr, lv.col);
    if (na > 0.8 * n) break; // the graph no longer coarsens
    // Coarse edges: the distinct aggregate pairs, and the coarse edge of each fine edge (−1 inside an aggregate).
    const key = new Map(); const cea = []; const ceb = []; const map = new Int32Array(ea.length);
    for (let e = 0; e < ea.length; e++) {
      let A = agg[ea[e]]; let B = agg[eb[e]];
      if (A === B) { map[e] = -1; continue; }
      if (A > B) { const t = A; A = B; B = t; }
      const k = A * na + B; let c = key.get(k);
      if (c === undefined) { c = cea.length; key.set(k, c); cea.push(A); ceb.push(B); }
      map[e] = c;
    }
    lv.agg = agg; lv.edgeMap = map;
    n = na; ea = Int32Array.from(cea); eb = Int32Array.from(ceb);
  }
  const N = domain.nodes.length;
  domain._amg = { m: domain.ea.length, levels, r: new Float64Array(N), z: new Float64Array(N), d: new Float64Array(N), q: new Float64Array(N), bb: new Float64Array(N), idx: new Int32Array(N) };
  return domain._amg;
}

/** Fills each level's operator from the fine conductances G, the extra diagonal and the active set. */
function setup(H, G, active, diagExtra) {
  const L0 = H.levels[0];
  L0.diag.fill(0);
  for (let i = 0; i < L0.n; i++) { L0.act[i] = active[i] ? 1 : 0; if (active[i] && diagExtra) L0.diag[i] = diagExtra[i]; }
  for (let e = 0; e < L0.ea.length; e++) {
    const g = G[e]; const a = L0.ea[e]; const c = L0.eb[e];
    if (active[a]) L0.diag[a] += g;
    if (active[c]) L0.diag[c] += g;
    L0.w[e] = active[a] && active[c] ? g : 0;
  }
  for (let l = 1; l < H.levels.length; l++) {
    const F = H.levels[l - 1]; const C = H.levels[l];
    C.diag.fill(0); C.w.fill(0); C.act.fill(0);
    for (let i = 0; i < F.n; i++) if (F.act[i]) { C.diag[F.agg[i]] += F.diag[i]; C.act[F.agg[i]] = 1; }
    for (let e = 0; e < F.ea.length; e++) {
      const w = F.w[e]; if (w === 0) continue;
      const c = F.edgeMap[e];
      if (c < 0) C.diag[F.agg[F.ea[e]]] -= 2 * w; else C.w[c] += w;
    }
  }
  // Coarsest: dense Cholesky of the active block.
  const T = H.levels[H.levels.length - 1];
  const ids = []; for (let i = 0; i < T.n; i++) if (T.act[i] && T.diag[i] > 0) ids.push(i);
  const k = ids.length; const pos = new Int32Array(T.n).fill(-1); ids.forEach((i, j) => { pos[i] = j; });
  const A = new Float64Array(k * k); let dmax = 0;
  for (let j = 0; j < k; j++) { A[j * k + j] = T.diag[ids[j]]; dmax = Math.max(dmax, T.diag[ids[j]]); }
  for (let e = 0; e < T.ea.length; e++) {
    const a = pos[T.ea[e]]; const c = pos[T.eb[e]]; const w = T.w[e];
    if (a < 0 || c < 0 || w === 0) continue;
    A[a * k + c] -= w; A[c * k + a] -= w;
  }
  for (let j = 0; j < k; j++) A[j * k + j] += 1e-12 * dmax;
  for (let j = 0; j < k; j++) {
    let s = A[j * k + j];
    for (let q = 0; q < j; q++) s -= A[j * k + q] * A[j * k + q];
    const d = Math.sqrt(Math.max(s, 1e-300)); A[j * k + j] = d;
    for (let i = j + 1; i < k; i++) {
      let t = A[i * k + j];
      for (let q = 0; q < j; q++) t -= A[i * k + q] * A[j * k + q];
      A[i * k + j] = t / d;
    }
  }
  H.chol = { A, ids, k, y: new Float64Array(k) };
}

function smooth(lv, forward) {
  const { n, rowPtr, col, edge, w, diag, act, x, b } = lv;
  if (forward) {
    for (let i = 0; i < n; i++) {
      if (!act[i] || !(diag[i] > 0)) continue;
      let s = b[i]; for (let k = rowPtr[i]; k < rowPtr[i + 1]; k++) s += w[edge[k]] * x[col[k]];
      x[i] = s / diag[i];
    }
  } else {
    for (let i = n - 1; i >= 0; i--) {
      if (!act[i] || !(diag[i] > 0)) continue;
      let s = b[i]; for (let k = rowPtr[i]; k < rowPtr[i + 1]; k++) s += w[edge[k]] * x[col[k]];
      x[i] = s / diag[i];
    }
  }
}

function coarsest(H, lv) {
  const { A, ids, k, y } = H.chol;
  lv.x.fill(0);
  for (let j = 0; j < k; j++) { let s = lv.b[ids[j]]; for (let q = 0; q < j; q++) s -= A[j * k + q] * y[q]; y[j] = s / A[j * k + j]; }
  for (let j = k - 1; j >= 0; j--) { let s = y[j]; for (let q = j + 1; q < k; q++) s -= A[q * k + j] * y[q]; y[j] = s / A[j * k + j]; }
  for (let j = 0; j < k; j++) lv.x[ids[j]] = y[j];
}

function vcycle(H, l) {
  const lv = H.levels[l];
  if (l === H.levels.length - 1) { coarsest(H, lv); return; }
  const { n, rowPtr, col, edge, w, diag, act, x, b, r, agg } = lv;
  x.fill(0);
  smooth(lv, true);
  const C = H.levels[l + 1]; C.b.fill(0);
  for (let i = 0; i < n; i++) {
    if (!act[i]) { r[i] = 0; continue; }
    let s = b[i] - diag[i] * x[i]; for (let k = rowPtr[i]; k < rowPtr[i + 1]; k++) s += w[edge[k]] * x[col[k]];
    C.b[agg[i]] += s;
  }
  vcycle(H, l + 1);
  for (let i = 0; i < n; i++) if (act[i]) x[i] += OVER * C.x[agg[i]];
  smooth(lv, false);
}

/**
 * Solves (diagExtra + Σ G (p_i − p_j)) p = rhs on the nodes in `active` (nodes outside keep their value in p,
 * coupled as Dirichlet values), starting from p. Returns the number of iterations.
 */
export function solveGraph(domain, G, active, diagExtra, rhs, p, { tol = 1e-7, maxIter = 500, signal = null } = {}) {
  const H = hierarchy(domain);
  setup(H, G, active, diagExtra);
  const L0 = H.levels[0]; const n = L0.n;
  const { r, z, d, q, bb, idx } = H; const { ea, eb } = L0;
  // Right-hand side with the Dirichlet couplings; the active nodes in a compact list.
  let na = 0;
  for (let i = 0; i < n; i++) if (active[i]) { idx[na++] = i; bb[i] = rhs[i]; }
  for (let e = 0; e < ea.length; e++) {
    const a = ea[e]; const c = eb[e]; const g = G[e]; if (g === 0) continue;
    if (active[a] && !active[c]) bb[a] += g * p[c];
    else if (active[c] && !active[a]) bb[c] += g * p[a];
  }
  const { rowPtr, col, edge, w, diag } = L0;
  const apply = (x, out) => {
    for (let t = 0; t < na; t++) {
      const i = idx[t]; let s = diag[i] * x[i];
      for (let k = rowPtr[i]; k < rowPtr[i + 1]; k++) s -= w[edge[k]] * x[col[k]];
      out[i] = s;
    }
  };
  const precond = (src, out) => {
    L0.b.fill(0); for (let t = 0; t < na; t++) L0.b[idx[t]] = src[idx[t]];
    vcycle(H, 0);
    for (let t = 0; t < na; t++) out[idx[t]] = L0.x[idx[t]];
  };
  // Inactive entries of the work vectors must read as 0 in the products.
  r.fill(0); z.fill(0); d.fill(0); q.fill(0);
  const x = p;
  // Inactive x would enter apply through w = 0 only, so p's Dirichlet values do not leak in.
  apply(x, q);
  let bn = 0; for (let t = 0; t < na; t++) { const i = idx[t]; r[i] = bb[i] - q[i]; bn += bb[i] * bb[i]; }
  bn = Math.sqrt(bn) || 1;
  precond(r, z);
  let rz = 0; for (let t = 0; t < na; t++) { const i = idx[t]; d[i] = z[i]; rz += r[i] * z[i]; }
  let it = 0;
  for (; it < maxIter; it++) {
    let rn = 0; for (let t = 0; t < na; t++) rn += r[idx[t]] ** 2;
    if (Math.sqrt(rn) <= tol * bn || signal?.cancelled) break;
    apply(d, q);
    let dq = 0; for (let t = 0; t < na; t++) { const i = idx[t]; dq += d[i] * q[i]; }
    if (!(dq > 0)) break;
    const al = rz / dq;
    for (let t = 0; t < na; t++) { const i = idx[t]; x[i] += al * d[i]; r[i] -= al * q[i]; }
    precond(r, z);
    let rz2 = 0; for (let t = 0; t < na; t++) { const i = idx[t]; rz2 += r[i] * z[i]; }
    const be = rz2 / rz; rz = rz2;
    for (let t = 0; t < na; t++) { const i = idx[t]; d[i] = z[i] + be * d[i]; }
  }
  return it;
}
