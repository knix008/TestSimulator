// More sparse matrix tools: fill-reducing orderings (amd, colamd, symamd,
// ccolamd, csymamd, colperm), structural analysis (dmperm, sprank, etree,
// symbfact, treelayout), helpers (spaugment, spstats, spparms) and the
// iterative solvers pcr, qmr and tfqmr.
//
// The minimum degree orderings eliminate on an explicit elimination graph
// (minimum external degree, ties by index). They are valid fill-reducing
// permutations but not bit-identical to the SuiteSparse codes.
import { fail, dbl, out, outMat, scalar, optText, scal, intArg, H, cdiv, field } from './util.js';
import { isSparse, isStruct, tensor, str, charMatrix, isFuncHandle, isText } from '../../value.js';
import { spFromTriplets, spTranspose, makeOp, makePrec, iterArgs, finishIter, vz, vcopy, vdot, vnorm, axpy, vsub, toVal, fromVal } from './sparse.js';
import { SPPARMS_KEYS, SPPARMS_DEFAULT, SPPARMS_TIGHT, spparmsState } from './factor2.js';

const many = (outs, nargout) => (nargout <= 1 ? outs[0] : outs.slice(0, Math.max(1, nargout)));
const isEmptyV = (v) => v == null || (v.dims && v.dims.reduce((a, b) => a * b, 1) === 0);
const row1 = (arr) => out([1, arr.length], Float64Array.from(arr, (x) => x + 1));

/** Nonzero pattern {m, n, colPtr, rowIdx} of a sparse or dense 2-D argument. */
function pattern(v, fn) {
  if (isSparse(v)) return { m: v.dims[0], n: v.dims[1], colPtr: v.colPtr, rowIdx: v.rowIdx };
  const t = dbl(v, fn, 'S');
  if (t.dims.length > 2) fail(`${fn}:inputMustBe2D`, 'S must be a 2-D matrix.');
  const [m, n] = t.dims; const cp = [0], ri = [];
  for (let j = 0; j < n; j++) { for (let i = 0; i < m; i++) { const k = i + j * m; if (t.re[k] !== 0 || (t.im && t.im[k] !== 0)) ri.push(i); } cp.push(ri.length); }
  return { m, n, colPtr: Int32Array.from(cp), rowIdx: Int32Array.from(ri) };
}

// ------------------------------------------------------------- minimum degree orderings

class MinHeap {
  constructor() { this.a = []; }
  less(x, y) { return x[0] !== y[0] ? x[0] < y[0] : x[1] !== y[1] ? x[1] < y[1] : x[2] < y[2]; }
  push(x) { const a = this.a; a.push(x); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!this.less(a[i], a[p])) break; [a[i], a[p]] = [a[p], a[i]]; i = p; } }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let s = i; if (l < a.length && this.less(a[l], a[s])) s = l; if (r < a.length && this.less(a[r], a[s])) s = r; if (s === i) break; [a[i], a[s]] = [a[s], a[i]]; i = s; } }
    return top;
  }
  get size() { return this.a.length; }
}

/**
 * Minimum degree on an explicit elimination graph. adj: array of Sets (consumed).
 * level: constraint set per node (lower sets first) or null. dense: nodes ordered last.
 */
function minDegree(n, adj, level = null, dense = new Set()) {
  const lv = (i) => (level ? level[i] : 0);
  for (const d of dense) { for (const a of adj[d]) adj[a].delete(d); adj[d].clear(); }
  const heap = new MinHeap(); const alive = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (!dense.has(i)) { alive[i] = 1; heap.push([lv(i), adj[i].size, i]); }
  const order = [];
  while (heap.size) {
    const [, deg, v] = heap.pop();
    if (!alive[v] || deg !== adj[v].size) continue;
    alive[v] = 0; order.push(v);
    const nb = Array.from(adj[v]); adj[v].clear();
    for (const a of nb) adj[a].delete(v);
    for (let x = 0; x < nb.length; x++) { const sa = adj[nb[x]]; for (let y = x + 1; y < nb.length; y++) if (!sa.has(nb[y])) { sa.add(nb[y]); adj[nb[y]].add(nb[x]); } }
    for (const a of nb) heap.push([lv(a), adj[a].size, a]);
  }
  const all = order.concat(Array.from(dense).sort((a, b) => a - b));
  if (!level) return all;
  return all.map((v, i) => [v, i]).sort((a, b) => lv(a[0]) - lv(b[0]) || a[1] - b[1]).map((x) => x[0]);
}
/** Adjacency of the symmetric pattern of S + S' (diagonal ignored). */
function symAdj(P, fn) {
  if (P.m !== P.n) fail(`${fn}:notSquare`, 'S must be a square matrix.');
  const adj = Array.from({ length: P.n }, () => new Set());
  for (let j = 0; j < P.n; j++) for (let p = P.colPtr[j]; p < P.colPtr[j + 1]; p++) { const i = P.rowIdx[p]; if (i !== j) { adj[i].add(j); adj[j].add(i); } }
  return adj;
}
/** Column intersection graph of A'*A; rows with more than denseRow entries are ignored. */
function colAdj(P, denseRow) {
  const rows = Array.from({ length: P.m }, () => []);
  for (let j = 0; j < P.n; j++) for (let p = P.colPtr[j]; p < P.colPtr[j + 1]; p++) rows[P.rowIdx[p]].push(j);
  const adj = Array.from({ length: P.n }, () => new Set());
  for (const r of rows) {
    if (r.length > denseRow) continue;
    for (let x = 0; x < r.length; x++) for (let y = x + 1; y < r.length; y++) { adj[r[x]].add(r[y]); adj[r[y]].add(r[x]); }
  }
  return adj;
}
function knobsArg(v, fn, defs) {
  const k = defs.slice();
  if (isEmptyV(v)) return k;
  if (isStruct(v)) { const d = field(v, 'dense'); if (d) k[0] = scal(d, fn, 'dense'); return k; }
  const t = dbl(v, fn, 'knobs').re; for (let i = 0; i < Math.min(t.length, k.length); i++) k[i] = t[i];
  return k;
}
const denseLimit = (frac, n) => (frac < 0 ? Infinity : Math.max(16, frac * Math.sqrt(n)));
function denseNodes(adj, limit) { const s = new Set(); adj.forEach((a, i) => { if (a.size > limit) s.add(i); }); return s; }
function cmemberArg(v, n, fn) {
  if (isEmptyV(v)) return null;
  const c = dbl(v, fn, 'cmember').re;
  if (c.length !== n) fail(`${fn}:badCmember`, 'cmember must have one entry per column.');
  return Array.from(c);
}

function amdFn(args) {
  if (!args.length) fail('amd:notEnoughInputs', 'Not enough input arguments.');
  const P = pattern(args[0], 'amd'); const adj = symAdj(P, 'amd');
  const [dense] = knobsArg(args[1], 'amd', [10]);
  return row1(minDegree(P.n, adj, null, denseNodes(adj, denseLimit(dense, P.n))));
}
function symamdFn(args) {
  if (!args.length) fail('symamd:notEnoughInputs', 'Not enough input arguments.');
  const P = pattern(args[0], 'symamd'); const adj = symAdj(P, 'symamd');
  const [dense] = knobsArg(args[1], 'symamd', [10]);
  return row1(minDegree(P.n, adj, null, denseNodes(adj, denseLimit(dense, P.n))));
}
function csymamdFn(args) {
  if (!args.length) fail('csymamd:notEnoughInputs', 'Not enough input arguments.');
  const P = pattern(args[0], 'csymamd'); const adj = symAdj(P, 'csymamd');
  const [dense] = knobsArg(args[1], 'csymamd', [10]);
  return row1(minDegree(P.n, adj, cmemberArg(args[2], P.n, 'csymamd'), denseNodes(adj, denseLimit(dense, P.n))));
}
function colOrder(args, fn, constrained) {
  if (!args.length) fail(`${fn}:notEnoughInputs`, 'Not enough input arguments.');
  const P = pattern(args[0], fn);
  const [dr, dc] = knobsArg(args[1], fn, [10, 10]);
  const adj = colAdj(P, denseLimit(dr, P.n));
  const cnt = Array.from({ length: P.n }, (_, j) => P.colPtr[j + 1] - P.colPtr[j]);
  const lim = denseLimit(dc, Math.min(P.m, P.n));
  const dense = new Set(); cnt.forEach((c, j) => { if (c > lim) dense.add(j); });
  return row1(minDegree(P.n, adj, constrained ? cmemberArg(args[2], P.n, fn) : null, dense));
}
function colpermFn(args) {
  if (!args.length) fail('colperm:notEnoughInputs', 'Not enough input arguments.');
  const P = pattern(args[0], 'colperm');
  const idx = Array.from({ length: P.n }, (_, j) => j);
  idx.sort((a, b) => (P.colPtr[a + 1] - P.colPtr[a]) - (P.colPtr[b + 1] - P.colPtr[b]) || a - b);
  return row1(idx);
}

// ------------------------------------------------------------- matching and Dulmage-Mendelsohn

/** Maximum transversal: jmatch[i] = column of row i, imatch[j] = row of column j (-1: unmatched). */
function maxMatching(P) {
  const { m, n, colPtr, rowIdx } = P;
  const jmatch = new Int32Array(m).fill(-1), imatch = new Int32Array(n).fill(-1);
  for (let j = 0; j < n; j++) for (let p = colPtr[j]; p < colPtr[j + 1]; p++) { const i = rowIdx[p]; if (jmatch[i] < 0) { jmatch[i] = j; imatch[j] = i; break; } }
  const mark = new Int32Array(m).fill(-1), pos = new Int32Array(n);
  for (let j0 = 0; j0 < n; j0++) {
    if (imatch[j0] >= 0) continue;
    const cols = [j0], rows = []; pos[j0] = colPtr[j0];
    let done = false;
    while (cols.length && !done) {
      const j = cols[cols.length - 1]; let pushed = false;
      while (pos[j] < colPtr[j + 1]) {
        const i = rowIdx[pos[j]++];
        if (mark[i] === j0) continue;
        mark[i] = j0;
        if (jmatch[i] < 0) {
          rows.push(i);
          for (let t = 0; t < cols.length; t++) { jmatch[rows[t]] = cols[t]; imatch[cols[t]] = rows[t]; }
          done = true; break;
        }
        const jn = jmatch[i]; rows.push(i); cols.push(jn); pos[jn] = colPtr[jn]; pushed = true; break;
      }
      if (!done && !pushed) { cols.pop(); rows.pop(); }
    }
  }
  return { jmatch, imatch };
}
/** Strongly connected components (iterative Tarjan) of a square pattern; returns components in an order giving block upper triangular form. */
function sccBlocks(nc, colsOf) {
  const index = new Int32Array(nc).fill(-1), low = new Int32Array(nc), onStack = new Uint8Array(nc);
  const stack = [], comps = []; let counter = 0;
  for (let s = 0; s < nc; s++) {
    if (index[s] >= 0) continue;
    const work = [[s, 0]]; index[s] = low[s] = counter++; stack.push(s); onStack[s] = 1;
    while (work.length) {
      const top = work[work.length - 1]; const v = top[0]; const nbrs = colsOf(v);
      if (top[1] < nbrs.length) {
        const w = nbrs[top[1]++];
        if (index[w] < 0) { index[w] = low[w] = counter++; stack.push(w); onStack[w] = 1; work.push([w, 0]); } else if (onStack[w]) low[v] = Math.min(low[v], index[w]);
      } else {
        work.pop();
        if (work.length) { const u = work[work.length - 1][0]; low[u] = Math.min(low[u], low[v]); }
        if (low[v] === index[v]) { const c = []; let w; do { w = stack.pop(); onStack[w] = 0; c.push(w); } while (w !== v); comps.push(c.sort((a, b) => a - b)); }
      }
    }
  }
  return comps;
}
function dmpermCore(P) {
  const { m, n, colPtr, rowIdx } = P;
  const { jmatch, imatch } = maxMatching(P);
  const wi = new Int32Array(m).fill(-1), wj = new Int32Array(n).fill(-1);
  // C1 / R1: reachable from unmatched columns along alternating paths
  const queue = [];
  for (let j = 0; j < n; j++) if (imatch[j] < 0) { wj[j] = 0; queue.push(j); }
  for (let h = 0; h < queue.length; h++) {
    const j = queue[h];
    for (let p = colPtr[j]; p < colPtr[j + 1]; p++) { const i = rowIdx[p]; if (wi[i] >= 0) continue; wi[i] = 1; const j2 = jmatch[i]; if (j2 < 0 || wj[j2] >= 0) continue; wj[j2] = 1; queue.push(j2); }
  }
  // R3 / C3: reachable from unmatched rows (by rows of the matrix)
  const rowsCols = Array.from({ length: m }, () => []);
  for (let j = 0; j < n; j++) for (let p = colPtr[j]; p < colPtr[j + 1]; p++) rowsCols[rowIdx[p]].push(j);
  const q2 = [];
  for (let i = 0; i < m; i++) if (jmatch[i] < 0) { wi[i] = 0; q2.push(i); }
  for (let h = 0; h < q2.length; h++) {
    const i = q2[h];
    for (const j of rowsCols[i]) { if (wj[j] >= 0) continue; wj[j] = 3; const i2 = imatch[j]; if (i2 < 0 || wi[i2] >= 0) continue; wi[i2] = 3; q2.push(i2); }
  }
  const p = [], q = [], cc = [0, 0, 0, 0, 0], rr = [0, 0, 0, 0, 0];
  for (let j = 0; j < n; j++) if (wj[j] === 0) q.push(j);
  cc[1] = q.length;
  for (const [set, mark] of [[1, 1], [2, -1], [3, 3]]) {
    for (let j = 0; j < n; j++) if (wj[j] === mark && imatch[j] >= 0) { p.push(imatch[j]); q.push(j); }
    cc[set + 1] = q.length; rr[set] = p.length;
  }
  for (let i = 0; i < m; i++) if (wi[i] === 0) p.push(i);
  rr[4] = p.length;
  // fine decomposition of A(R2, C2)
  const c0 = cc[2], r0 = rr[1], nc = cc[3] - cc[2];
  const posOfRow = new Int32Array(m).fill(-1);
  for (let k = 0; k < nc; k++) posOfRow[p[r0 + k]] = k;
  const adjC = (l) => { const j = q[c0 + l]; const out1 = []; for (let t = colPtr[j]; t < colPtr[j + 1]; t++) { const k = posOfRow[rowIdx[t]]; if (k >= 0 && k !== l) out1.push(k); } return out1; };
  const comps = sccBlocks(nc, adjC);
  const ord = [].concat(...comps);
  const qs = ord.map((l) => q[c0 + l]), ps = ord.map((l) => p[r0 + l]);
  for (let k = 0; k < nc; k++) { q[c0 + k] = qs[k]; p[r0 + k] = ps[k]; }
  // fine blocks (as in CSparse): A(R1, [C0 C1]), the SCC blocks of A(R2, C2), A([R3 R0], C3)
  const r = [0], s = [0]; let nb = 0;
  if (cc[2] > 0) nb++;
  let acc = 0;
  for (const c of comps) { r[nb] = r0 + acc; s[nb] = c0 + acc; nb++; acc += c.length; }
  if (rr[2] < m) { r[nb] = rr[2]; s[nb] = cc[3]; nb++; }
  r[nb] = m; s[nb] = n;
  return { p, q, r, s, cc, rr, imatch };
}
function dmpermFn(args, nargout) {
  if (!args.length) fail('dmperm:notEnoughInputs', 'Not enough input arguments.');
  const P = pattern(args[0], 'dmperm');
  if (nargout <= 1) {
    const { imatch } = maxMatching(P);
    return out([1, P.n], Float64Array.from(imatch, (i) => i + 1));
  }
  const d = dmpermCore(P);
  const plus1 = (a) => out([1, a.length], Float64Array.from(a, (x) => x + 1));
  return many([plus1(d.p), plus1(d.q), plus1(d.r), plus1(d.s), plus1(d.cc), plus1(d.rr)], nargout);
}
function sprankFn(args) {
  if (!args.length) fail('sprank:notEnoughInputs', 'Not enough input arguments.');
  const { imatch } = maxMatching(pattern(args[0], 'sprank'));
  let r = 0; for (const i of imatch) if (i >= 0) r++;
  return scalar(r);
}

// ------------------------------------------------------------- elimination trees and symbolic factorization

function etreeCore(P, ata) {
  const n = P.n; const parent = new Int32Array(n).fill(-1), anc = new Int32Array(n).fill(-1);
  const prev = ata ? new Int32Array(P.m).fill(-1) : null;
  for (let k = 0; k < n; k++) {
    for (let p = P.colPtr[k]; p < P.colPtr[k + 1]; p++) {
      const row = P.rowIdx[p];
      let i = ata ? prev[row] : row;
      while (i !== -1 && i < k) { const inext = anc[i]; anc[i] = k; if (inext === -1) parent[i] = k; i = inext; }
      if (ata) prev[row] = k;
    }
  }
  return parent;
}
function postorder(parent) {
  const n = parent.length; const head = new Int32Array(n).fill(-1), next = new Int32Array(n).fill(-1);
  for (let j = n - 1; j >= 0; j--) if (parent[j] !== -1) { next[j] = head[parent[j]]; head[parent[j]] = j; }
  const post = [];
  for (let j = 0; j < n; j++) {
    if (parent[j] !== -1) continue;
    const st = [j];
    while (st.length) { const v = st[st.length - 1]; const c = head[v]; if (c === -1) { st.pop(); post.push(v); } else { head[v] = next[c]; st.push(c); } }
  }
  return post;
}
const parentRow = (parent) => out([1, parent.length], Float64Array.from(parent, (x) => x + 1));
function etreeFn(args, nargout) {
  if (!args.length) fail('etree:notEnoughInputs', 'Not enough input arguments.');
  const P = pattern(args[0], 'etree');
  const typ = args[1] == null ? 'sym' : optText(args[1]);
  if (typ !== 'sym' && typ !== 'col') fail('etree:badType', "The type must be 'sym' or 'col'.");
  if (typ === 'sym' && P.m !== P.n) fail('etree:notSquare', "S must be square for the 'sym' tree.");
  const parent = etreeCore(P, typ === 'col');
  return many([parentRow(parent), row1(postorder(parent))], nargout);
}
function symbfactFn(args, nargout) {
  if (!args.length) fail('symbfact:notEnoughInputs', 'Not enough input arguments.');
  const P = pattern(args[0], 'symbfact');
  const typ = args[1] == null || isEmptyV(args[1]) ? 'sym' : optText(args[1]);
  const mode = args[2] == null ? '' : optText(args[2]);
  if (!['sym', 'col', 'row', 'lo'].includes(typ)) fail('symbfact:badType', "The type must be 'sym', 'col', 'row' or 'lo'.");
  if ((typ === 'sym' || typ === 'lo') && P.m !== P.n) fail('symbfact:notSquare', 'S must be square.');
  const n = typ === 'row' ? P.m : P.n;
  // below[j]: rows i > j with a nonzero (i, j) in the lower triangle of the symmetric matrix
  const below = Array.from({ length: n }, () => new Set());
  const addPair = (a, b) => { if (a > b) below[b].add(a); else if (b > a) below[a].add(b); };
  if (typ === 'sym' || typ === 'lo') {
    for (let j = 0; j < P.n; j++) for (let p = P.colPtr[j]; p < P.colPtr[j + 1]; p++) { const i = P.rowIdx[p]; if (typ === 'sym' ? i <= j : i >= j) addPair(i, j); }
  } else {
    const groups = typ === 'col' ? Array.from({ length: P.m }, () => []) : Array.from({ length: P.n }, () => []);
    for (let j = 0; j < P.n; j++) for (let p = P.colPtr[j]; p < P.colPtr[j + 1]; p++) { if (typ === 'col') groups[P.rowIdx[p]].push(j); else groups[j].push(P.rowIdx[p]); }
    for (const g of groups) for (let x = 0; x < g.length; x++) for (let y = x + 1; y < g.length; y++) addPair(g[x], g[y]);
  }
  const Lcol = new Array(n); const parent = new Int32Array(n).fill(-1);
  const kids = Array.from({ length: n }, () => []);
  for (let j = 0; j < n; j++) {
    const s = new Set(below[j]);
    for (const c of kids[j]) for (const i of Lcol[c]) if (i > j) s.add(i);
    const arr = Array.from(s).sort((a, b) => a - b);
    Lcol[j] = [j, ...arr];
    if (arr.length) { parent[j] = arr[0]; kids[arr[0]].push(j); }
  }
  const depth = new Int32Array(n); let h = 0;
  for (let j = n - 1; j >= 0; j--) { depth[j] = parent[j] === -1 ? 1 : depth[parent[j]] + 1; h = Math.max(h, depth[j]); }
  const count = out([n, 1], Float64Array.from(Lcol, (c) => c.length));
  const outs = [count, scalar(h), parentRow(parent), row1(postorder(parent))];
  if (nargout >= 5) {
    const R = [], C = [];
    Lcol.forEach((c, j) => { for (const i of c) { R.push(j); C.push(i); } });
    const lower = mode === 'l' || mode === 'lower';
    const S = lower ? spFromTriplets(n, n, Int32Array.from(C), Int32Array.from(R), new Float64Array(R.length).fill(1)) : spFromTriplets(n, n, Int32Array.from(R), Int32Array.from(C), new Float64Array(R.length).fill(1));
    outs.push(S);
  }
  return many(outs, nargout);
}
function treelayoutFn(args, nargout) {
  if (!args.length) fail('treelayout:notEnoughInputs', 'Not enough input arguments.');
  const t = dbl(args[0], 'treelayout', 'Tree').re; const n = t.length;
  if (args[1] != null && !isEmptyV(args[1]) && dbl(args[1], 'treelayout', 'permutation').re.length !== n) fail('treelayout:badPermutation', 'The permutation must have one entry per node.');
  const kids = Array.from({ length: n }, () => []); const roots = [];
  for (let i = 0; i < n; i++) {
    const p = t[i];
    if (!Number.isInteger(p) || p < 0 || p > n || p === i + 1) fail('treelayout:badTree', 'Tree must be a vector of parent indices (0 for roots).');
    if (p === 0) roots.push(i); else kids[p - 1].push(i);
  }
  const x = new Float64Array(n), depth = new Int32Array(n); let leaves = 0, maxd = 0;
  const seen = new Uint8Array(n);
  for (const r of roots) {
    const st = [[r, 0]];
    while (st.length) {
      const top = st[st.length - 1]; const v = top[0];
      if (top[1] === 0) { seen[v] = 1; if (st.length > 1) depth[v] = depth[st[st.length - 2][0]] + 1; maxd = Math.max(maxd, depth[v]); }
      if (top[1] < kids[v].length) { st.push([kids[v][top[1]++], 0]); continue; }
      st.pop();
      if (!kids[v].length) x[v] = ++leaves; else x[v] = (x[kids[v][0]] + x[kids[v][kids[v].length - 1]]) / 2;
    }
  }
  if (seen.some((s) => !s)) fail('treelayout:badTree', 'Tree contains a cycle.');
  const h = n ? maxd + 1 : 0;
  const xs = Float64Array.from(x, (v) => v / (leaves + 1)), ys = Float64Array.from(depth, (d) => (h - d) / (h + 1));
  let s = 0;
  if (roots.length) { let v = roots[roots.length - 1]; s = 1; while (kids[v].length === 1) { v = kids[v][0]; s++; } }
  return many([out([1, n], xs), out([1, n], ys), scalar(h), scalar(s)], nargout);
}

// ------------------------------------------------------------- spaugment, spstats, spparms

function spaugmentFn(args) {
  if (!args.length) fail('spaugment:notEnoughInputs', 'Not enough input arguments.');
  const A = args[0];
  const t = isSparse(A) ? null : dbl(A, 'spaugment', 'A');
  if (t && t.dims.length > 2) fail('spaugment:inputMustBe2D', 'A must be a 2-D matrix.');
  const [m, n] = A.dims;
  const R = [], C = [], VR = [], VI = [];
  const push = (i, j, a, b) => { R.push(i); C.push(j); VR.push(a); VI.push(b); };
  let amax = 0;
  const each = (fnc) => {
    if (t) { for (let j = 0; j < n; j++) for (let i = 0; i < m; i++) { const k = i + j * m; const a = t.re[k], b = t.im ? t.im[k] : 0; if (a !== 0 || b !== 0) fnc(i, j, a, b); } } else for (let j = 0; j < n; j++) for (let p = A.colPtr[j]; p < A.colPtr[j + 1]; p++) fnc(A.rowIdx[p], j, A.re[p], A.im ? A.im[p] : 0);
  };
  each((i, j, a, b) => { amax = Math.max(amax, Math.hypot(a, b)); });
  const c = args[1] == null ? amax / 1000 : scal(args[1], 'spaugment', 'c');
  for (let i = 0; i < m; i++) push(i, i, c, 0);
  each((i, j, a, b) => { push(i, m + j, a, b); push(m + j, i, a, -b); });
  const anyIm = VI.some((v) => v !== 0);
  return spFromTriplets(m + n, m + n, Int32Array.from(R), Int32Array.from(C), Float64Array.from(VR), anyIm ? Float64Array.from(VI) : null);
}
function spstatsFn(args, nargout) {
  if (!args.length) fail('spstats:notEnoughInputs', 'Not enough input arguments.');
  let m, n, entries;
  if (args.length >= 2) {
    const v = dbl(args[0], 'spstats', 'S').re, jj = dbl(args[1], 'spstats', 'j').re;
    if (v.length !== jj.length) fail('spstats:dimMismatch', 'S and j must have the same number of elements.');
    m = v.length; n = 0; entries = [];
    for (let k = 0; k < v.length; k++) { const j = jj[k]; if (!(Number.isInteger(j) && j >= 1)) fail('spstats:badIndex', 'Bin numbers must be positive integers.'); n = Math.max(n, j); entries.push([k, j - 1, v[k]]); }
  } else {
    const S = args[0];
    if (isSparse(S)) { [m, n] = S.dims; entries = []; for (let j = 0; j < n; j++) for (let p = S.colPtr[j]; p < S.colPtr[j + 1]; p++) entries.push([S.rowIdx[p], j, S.re[p]]); } else {
      const t = dbl(S, 'spstats', 'S'); [m, n] = t.dims; entries = [];
      for (let j = 0; j < n; j++) for (let i = 0; i < m; i++) { const a = t.re[i + j * m]; if (a !== 0) entries.push([i, j, a]); }
    }
  }
  void m;
  const cnt = new Float64Array(n), sum = new Float64Array(n);
  for (const [, j, a] of entries) { cnt[j]++; sum[j] += a; }
  const mean = Float64Array.from(sum, (s, j) => s / cnt[j]);
  const ss = new Float64Array(n);
  for (const [, j, a] of entries) ss[j] += (a - mean[j]) ** 2;
  const variance = Float64Array.from(ss, (s, j) => s / (cnt[j] - 1));
  const spRow = (vals) => { const cols = [], vv = []; vals.forEach((x, j) => { if (x !== 0) { cols.push(j); vv.push(x); } }); return spFromTriplets(1, n, new Int32Array(cols.length), Int32Array.from(cols), Float64Array.from(vv)); };
  return many([spRow(cnt), spRow(mean), spRow(variance)], nargout);
}
function spparmsFn(args, nargout, ctx) {
  const vals = spparmsState(ctx);
  const colv = () => out([vals.length, 1], Float64Array.from(vals));
  if (!args.length) {
    if (nargout === 0) {
      const w = Math.max(...SPPARMS_KEYS.map((k) => k.length));
      ctx.out(SPPARMS_KEYS.map((k, i) => `${k.padStart(w)}: ${vals[i]}\n`).join(''));
      return undefined;
    }
    if (nargout === 1) return colv();
    return [charMatrix(SPPARMS_KEYS), colv()];
  }
  if (args.length === 1) {
    const k = optText(args[0]);
    if (k === 'default' || k === 'defaults') { vals.splice(0, vals.length, ...SPPARMS_DEFAULT); return undefined; }
    if (k === 'tight') { vals.splice(0, vals.length, ...SPPARMS_TIGHT); return undefined; }
    if (k != null) {
      const i = SPPARMS_KEYS.indexOf(k);
      if (i < 0) fail('spparms:badKey', `Unknown sparse parameter '${k}'.`);
      return scalar(vals[i]);
    }
    const v = dbl(args[0], 'spparms', 'vals').re;
    if (v.length > vals.length) fail('spparms:tooMany', `At most ${vals.length} values can be set.`);
    for (let i = 0; i < v.length; i++) vals[i] = v[i];
    return undefined;
  }
  const k = optText(args[0]); const i = k == null ? -1 : SPPARMS_KEYS.indexOf(k);
  if (i < 0) fail('spparms:badKey', `Unknown sparse parameter '${k}'.`);
  vals[i] = scal(args[1], 'spparms', 'val');
  return undefined;
}

// ------------------------------------------------------------- iterative solvers

const cmulS = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdivS = (a, b) => cdiv(a[0], a[1], b[0], b[1]);
const isZ = (a) => (a[0] === 0 && a[1] === 0) || !Number.isFinite(a[0]) || !Number.isFinite(a[1]);
/** y = a + c*b (c complex). */
const comb = (a, c, b) => { const y = vcopy(a); axpy(y, c[0], c[1], b); return y; };
const vscaleR = (x, s) => ({ re: x.re.map((v) => v * s), im: x.im.map((v) => v * s) });

function checkSquare(Av, n, fn) {
  if (!isFuncHandle(Av) && !isText(Av)) { const d = Av.dims; if (d[0] !== n || d[1] !== n) fail(`${fn}:dimagree`, 'A must be a square matrix of size length(b).'); }
}
function finish(x, flag, nb, A, b, it, resvec) { return { x, flag, relres: vnorm(vsub(b, A(x))) / nb, iter: it, resvec }; }

function pcrCore(A, b, n, tol, maxit, prec, x0) {
  const x = x0 || vz(n); const nb = vnorm(b);
  if (nb === 0) return { x: vz(n), flag: 0, relres: 0, iter: 0, resvec: [0] };
  const r = vsub(b, A(x)); const resvec = [vnorm(r)];
  if (resvec[0] / nb <= tol) return { x, flag: 0, relres: resvec[0] / nb, iter: 0, resvec };
  const P = prec || ((v) => v);
  const z = vcopy(P(r)); let Az = A(z); let p = vcopy(z); let Ap = vcopy(Az);
  let rho = vdot(z, Az);
  let best = { x: vcopy(x), rel: resvec[0] / nb, it: 0 };
  for (let it = 1; it <= maxit; it++) {
    const q = P(Ap); const den = vdot(Ap, q);
    if (isZ(den) || isZ(rho)) return { x: best.x, flag: 4, relres: best.rel, iter: best.it, resvec };
    const alpha = cdivS(rho, den);
    axpy(x, alpha[0], alpha[1], p); axpy(r, -alpha[0], -alpha[1], Ap); axpy(z, -alpha[0], -alpha[1], q);
    const nr = vnorm(r); resvec.push(nr);
    if (nr / nb < best.rel) best = { x: vcopy(x), rel: nr / nb, it };
    if (nr / nb <= tol) return finish(x, 0, nb, A, b, it, resvec);
    Az = A(z); const rhoN = vdot(z, Az);
    const beta = cdivS(rhoN, rho); rho = rhoN;
    p = comb(z, beta, p); Ap = comb(Az, beta, Ap);
  }
  return { x: best.x, flag: 1, relres: best.rel, iter: best.it, resvec };
}

function qmrCore(A, b, n, tol, maxit, M1, M2, x0) {
  const x = x0 || vz(n); const nb = vnorm(b);
  if (nb === 0) return { x: vz(n), flag: 0, relres: 0, iter: 0, resvec: [0] };
  const r = vsub(b, A(x)); const resvec = [vnorm(r)];
  if (resvec[0] / nb <= tol) return { x, flag: 0, relres: resvec[0] / nb, iter: 0, resvec };
  let vt = vcopy(r), y = M1.fw(vt), rho = vnorm(y);
  let wt = vcopy(r), z = M2.bw(wt), xi = vnorm(z);
  let gamma = 1, eta = [-1, 0], theta = 0, epsilon = [1, 0];
  let p = null, q = null, d = null, s = null;
  let best = { x: vcopy(x), rel: resvec[0] / nb, it: 0 };
  const brk = () => ({ x: best.x, flag: 4, relres: best.rel, iter: best.it, resvec });
  for (let it = 1; it <= maxit; it++) {
    if (rho === 0 || xi === 0) return brk();
    const v = vscaleR(vt, 1 / rho); y = vscaleR(y, 1 / rho);
    const w = vscaleR(wt, 1 / xi); z = vscaleR(z, 1 / xi);
    const delta = vdot(z, y);
    if (isZ(delta)) return brk();
    const yt = M2.fw(y), zt = M1.bw(z);
    if (it === 1) { p = vcopy(yt); q = vcopy(zt); } else {
      const c1 = cdivS(cmulS([xi, 0], delta), epsilon); p = comb(yt, [-c1[0], -c1[1]], p);
      const c2 = cdivS(cmulS([rho, 0], delta), epsilon); q = comb(zt, [-c2[0], c2[1]], q);
    }
    const pt = A(p);
    epsilon = vdot(q, pt);
    if (isZ(epsilon)) return brk();
    const beta = cdivS(epsilon, delta);
    if (isZ(beta)) return brk();
    vt = comb(pt, [-beta[0], -beta[1]], v);
    y = M1.fw(vt);
    const rho1 = rho; rho = vnorm(y);
    wt = comb(A(q, true), [-beta[0], beta[1]], w);
    z = M2.bw(wt); xi = vnorm(z);
    const gamma1 = gamma, theta1 = theta;
    theta = rho / (gamma1 * Math.hypot(beta[0], beta[1]));
    gamma = 1 / Math.sqrt(1 + theta * theta);
    if (gamma === 0) return brk();
    const g2 = gamma * gamma;
    eta = cdivS([-eta[0] * rho1 * g2, -eta[1] * rho1 * g2], [beta[0] * gamma1 * gamma1, beta[1] * gamma1 * gamma1]);
    const tg = (theta1 * gamma) ** 2;
    if (it === 1) { d = comb(vz(n), eta, p); s = comb(vz(n), eta, pt); } else { d = comb(vscaleR(d, tg), eta, p); s = comb(vscaleR(s, tg), eta, pt); }
    axpy(x, 1, 0, d); axpy(r, -1, 0, s);
    const nr = vnorm(r); resvec.push(nr);
    if (nr / nb < best.rel) best = { x: vcopy(x), rel: nr / nb, it };
    if (nr / nb <= tol) {
      const res = finish(x, 0, nb, A, b, it, resvec);
      if (res.relres <= tol * 10) return res;
    }
  }
  return { x: best.x, flag: 1, relres: vnorm(vsub(b, A(best.x))) / nb, iter: best.it, resvec };
}

function tfqmrCore(A, b, n, tol, maxit, prec, x0) {
  const P = prec || ((v) => v); const B = (v) => A(P(v));
  const x = x0 || vz(n); const nb = vnorm(b);
  if (nb === 0) return { x: vz(n), flag: 0, relres: 0, iter: 0, resvec: [0] };
  const r0 = vsub(b, A(x)); const resvec = [vnorm(r0)];
  if (resvec[0] / nb <= tol) return { x, flag: 0, relres: resvec[0] / nb, iter: 0, resvec };
  let w = vcopy(r0), u = vcopy(r0), Au = B(u), v = vcopy(Au), d = vz(n);
  const ysum = vz(n); const rt = vcopy(r0);
  let rho = vdot(rt, r0), tau = vnorm(r0), theta = 0, eta = [0, 0], alpha = [0, 0], uN = null;
  let best = { x: vcopy(x), rel: resvec[0] / nb, it: 0 };
  const current = () => { const xc = vcopy(x); const py = P(ysum); axpy(xc, 1, 0, py); return xc; };
  const brk = () => ({ x: best.x, flag: 4, relres: best.rel, iter: best.it, resvec });
  for (let m = 0; m < 2 * maxit; m++) {
    const it = Math.floor(m / 2) + 1;
    if (m % 2 === 0) {
      const sigma = vdot(rt, v);
      if (isZ(sigma)) return brk();
      alpha = cdivS(rho, sigma);
      uN = comb(u, [-alpha[0], -alpha[1]], v);
    }
    axpy(w, -alpha[0], -alpha[1], Au);
    const coef = cmulS(cdivS([theta * theta, 0], alpha), eta);
    d = comb(u, coef, d);
    theta = vnorm(w) / tau; const c = 1 / Math.sqrt(1 + theta * theta);
    tau = tau * theta * c; eta = [c * c * alpha[0], c * c * alpha[1]];
    axpy(ysum, eta[0], eta[1], d);
    if (m % 2 === 1 || tau * Math.sqrt(m + 2) <= tol * nb) {
      const xc = current(); const res = vnorm(vsub(b, A(xc))) / nb;
      if (m % 2 === 1) resvec.push(res * nb);
      if (res < best.rel) best = { x: vcopy(xc), rel: res, it };
      if (res <= tol) { if (m % 2 === 0) resvec.push(res * nb); return { x: xc, flag: 0, relres: res, iter: it, resvec }; }
    }
    if (m % 2 === 0) { u = uN; Au = B(u); } else {
      const rhoN = vdot(rt, w);
      if (isZ(rho)) return brk();
      const beta = cdivS(rhoN, rho); rho = rhoN;
      const u2 = comb(w, beta, u); const Au2 = B(u2);
      v = comb(Au2, beta, comb(Au, beta, v));
      u = u2; Au = Au2;
    }
  }
  return { x: best.x, flag: 1, relres: best.rel, iter: best.it, resvec };
}

/** Forward and adjoint solves with one preconditioner (matrix or handle M(x, 'notransp' | 'transp')). */
function precSides(M, ctx, n) {
  const none = M == null || (M.dims && M.dims[0] * M.dims[1] === 0 && !isFuncHandle(M));
  if (none) return { fw: (v) => v, bw: (v) => v };
  if (isFuncHandle(M)) return { fw: (r) => fromVal(ctx.call(M, [toVal(r), str('notransp')], 1)[0], n), bw: (r) => fromVal(ctx.call(M, [toVal(r), str('transp')], 1)[0], n) };
  let Mh;
  if (isSparse(M)) Mh = spTranspose(M, true); else {
    const t = dbl(M, 'precond', 'M'); const [a, b] = t.dims;
    const re = new Float64Array(a * b), im = t.im ? new Float64Array(a * b) : null;
    for (let j = 0; j < b; j++) for (let i = 0; i < a; i++) { re[j + i * b] = t.re[i + j * a]; if (im) im[j + i * b] = -t.im[i + j * a]; }
    Mh = tensor('double', [b, a], re, im);
  }
  return { fw: makePrec(M, null, ctx, n), bw: makePrec(Mh, null, ctx, n) };
}
function pcrFn(args, nargout, ctx) {
  if (args.length < 2) fail('pcr:notEnoughInputs', 'Not enough input arguments.');
  const p = iterArgs([args[0], args[1], args[2], args[3], args[4], undefined, args[5]], 'pcr');
  checkSquare(args[0], p.n, 'pcr');
  const A = makeOp(args[0], ctx, p.n, 'pcr');
  const prec = makePrec(p.M1, null, ctx, p.n);
  const x0 = p.x0 ? fromVal(p.x0, p.n) : null;
  return finishIter('pcr', nargout, ctx, pcrCore(A, p.b, p.n, p.tol, p.maxit ?? Math.min(p.n, 20), prec, x0));
}
function qmrFn(args, nargout, ctx) {
  if (args.length < 2) fail('qmr:notEnoughInputs', 'Not enough input arguments.');
  const p = iterArgs(args, 'qmr');
  checkSquare(args[0], p.n, 'qmr');
  const A = makeOp(args[0], ctx, p.n, 'qmr', true);
  const x0 = p.x0 ? fromVal(p.x0, p.n) : null;
  return finishIter('qmr', nargout, ctx, qmrCore(A, p.b, p.n, p.tol, p.maxit ?? Math.min(p.n, 20), precSides(p.M1, ctx, p.n), precSides(p.M2, ctx, p.n), x0));
}
function tfqmrFn(args, nargout, ctx) {
  if (args.length < 2) fail('tfqmr:notEnoughInputs', 'Not enough input arguments.');
  const p = iterArgs(args, 'tfqmr');
  checkSquare(args[0], p.n, 'tfqmr');
  const A = makeOp(args[0], ctx, p.n, 'tfqmr');
  const prec = makePrec(p.M1, p.M2, ctx, p.n);
  const x0 = p.x0 ? fromVal(p.x0, p.n) : null;
  return finishIter('tfqmr', nargout, ctx, tfqmrCore(A, p.b, p.n, p.tol, p.maxit ?? Math.min(p.n, 20), prec, x0));
}

// ------------------------------------------------------------- builtins / help

export const builtins = {
  amd: amdFn,
  colamd(args) { return colOrder(args, 'colamd', false); },
  ccolamd(args) { return colOrder(args, 'ccolamd', true); },
  symamd: symamdFn,
  csymamd: csymamdFn,
  colperm: colpermFn,
  dmperm: dmpermFn,
  sprank: sprankFn,
  etree: etreeFn,
  symbfact: symbfactFn,
  treelayout: treelayoutFn,
  spaugment: spaugmentFn,
  spstats: spstatsFn,
  spparms: spparmsFn,
  pcr: pcrFn,
  qmr: qmrFn,
  tfqmr: tfqmrFn,
};
void outMat; void intArg;

const IT = (f, pre) => [`x = ${f}(A, b)`, `x = ${f}(A, b, tol, maxit)`, `x = ${f}(A, b, tol, maxit, ${pre}, x0)`, `[x, flag, relres, iter, resvec] = ${f}(...)`];
export const help = {
  amd: H('Approximate minimum degree ordering of S+S\' (fill-reducing permutation for chol).', "S+S' 의 근사 최소 차수 순서 (chol 용 채움 감소 순열).", ['p = amd(S)', 'p = amd(S, opts)']),
  colamd: H("Column minimum degree ordering for sparse LU / QR (orders A'*A without forming it).", "희소 LU / QR 용 열 최소 차수 순서 (A'*A 를 만들지 않고 정렬).", ['p = colamd(S)', 'p = colamd(S, knobs)']),
  ccolamd: H('Constrained column minimum degree ordering: columns of constraint set 1 first, then 2, ...', '제약 열 최소 차수 순서: 제약 집합 1 의 열이 먼저, 다음 2, ...', ['p = ccolamd(S)', 'p = ccolamd(S, knobs, cmember)']),
  symamd: H('Symmetric minimum degree ordering (for chol of S(p,p)).', '대칭 최소 차수 순서 (S(p,p) 의 chol 용).', ['p = symamd(S)', 'p = symamd(S, knobs)']),
  csymamd: H('Constrained symmetric minimum degree ordering.', '제약 대칭 최소 차수 순서.', ['p = csymamd(S)', 'p = csymamd(S, knobs, cmember)']),
  colperm: H('Column permutation by increasing number of nonzeros.', '0 이 아닌 원소 개수 오름차순 열 순열.', ['p = colperm(S)']),
  dmperm: H('Dulmage-Mendelsohn decomposition: maximum matching, or block triangular form S(p,q).', 'Dulmage-Mendelsohn 분해: 최대 매칭 또는 블록 삼각 형식 S(p,q).', ['p = dmperm(S)', '[p, q, r, s, cc, rr] = dmperm(S)']),
  sprank: H('Structural rank of a sparse matrix (size of a maximum matching).', '희소 행렬의 구조적 계수 (최대 매칭 크기).', ['r = sprank(S)']),
  etree: H("Elimination tree of S ('sym') or of S'*S ('col') and its postorder.", "S ('sym') 또는 S'*S ('col') 의 소거 트리와 후위 순서.", ['p = etree(S)', "p = etree(S, 'col')", '[p, q] = etree(S, typ)']),
  symbfact: H('Symbolic Cholesky analysis: row counts, tree height, elimination tree, postorder and the pattern of R.', '기호 촐레스키 분석: 행 개수, 트리 높이, 소거 트리, 후위 순서, R 의 패턴.', ['count = symbfact(S)', "count = symbfact(S, typ)  % 'sym' | 'col' | 'row' | 'lo'", "[count, h, parent, post, R] = symbfact(S, typ, 'L')"]),
  treelayout: H('Coordinates for drawing a tree given by a parent vector.', '부모 벡터로 주어진 트리를 그리기 위한 좌표.', ['[x, y] = treelayout(tree)', '[x, y, h, s] = treelayout(tree, permutation)']),
  spaugment: H("Augmented system matrix [c*I, A; A', 0] for sparse least squares.", "희소 최소제곱용 확장 시스템 행렬 [c*I, A; A', 0].", ['S = spaugment(A)', 'S = spaugment(A, c)']),
  spstats: H('Per-column count, mean and variance of the nonzero entries of a sparse matrix.', '희소 행렬의 0 이 아닌 원소에 대한 열별 개수, 평균, 분산.', ['[count, mean, var] = spstats(S)', '[count, mean, var] = spstats(S, j)']),
  spparms: H("Query or set the sparse solver parameters ('spumoni', 'bandden', 'piv_tol', ...).", "희소 풀이기 매개변수 조회 또는 설정 ('spumoni', 'bandden', 'piv_tol' 등).", ['spparms()', 'vals = spparms()', '[keys, vals] = spparms()', "val = spparms('key')", "spparms('key', val)", "spparms('default')", "spparms('tight')"]),
  pcr: H('Preconditioned conjugate residual method for Hermitian (possibly indefinite) systems.', '에르미트 (부정 포함) 시스템용 전처리 켤레 잔차법.', IT('pcr', 'M')),
  qmr: H("Quasi-minimal residual method (A may be a function handle afun(x, 'notransp' | 'transp')).", "준최소 잔차법 (A 는 afun(x, 'notransp' | 'transp') 함수 핸들 가능).", IT('qmr', 'M1, M2')),
  tfqmr: H('Transpose-free quasi-minimal residual method.', '전치 없는 준최소 잔차법.', IT('tfqmr', 'M1, M2')),
};
