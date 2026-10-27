// Distances, hierarchical and partitional clustering, principal component
// analysis, cross-validation partitions and confusion matrices.
import { tensor, num, str, bool, empty, object, isText, toStr, toNum, structOf, isFuncHandle, cell, isCell, isString, isObject } from '../../../value.js';
import { E, F, H, n1, isEmptyV, nv, toRows, fromRows, callFn, cellStr, fmtG } from '../_util.js';
import { svd } from '../_kernels.js';
import { globalGen } from '../random.js';
import { meanA, varA, tiedRank, groups, invM, sorted, medianA } from './_s.js';

// ------------------------------------------------------------ distances
const METRICS = ['euclidean', 'squaredeuclidean', 'seuclidean', 'cityblock', 'minkowski', 'chebychev', 'mahalanobis', 'cosine', 'correlation', 'spearman', 'hamming', 'jaccard'];
function canonMetric(s) {
  const t = s.toLowerCase(); const m = METRICS.find((x) => x.startsWith(t)) || (t === 'chebyshev' ? 'chebychev' : null);
  if (!m) throw E('pdist:badMetric', `Unknown distance metric '${s}'.`); return m;
}
/** Returns d(a, b) for the metric, prepared with the data set X (rows). */
function metricFn(metric, X, param, ctx) {
  const p = X[0] ? X[0].length : 0;
  if (typeof metric !== 'string') {
    return { fh: metric };
  }
  switch (metric) {
    case 'euclidean': return (a, b) => { let s = 0; for (let i = 0; i < p; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s); };
    case 'squaredeuclidean': return (a, b) => { let s = 0; for (let i = 0; i < p; i++) s += (a[i] - b[i]) ** 2; return s; };
    case 'seuclidean': { const w = param ? Array.from(F(param)) : Array.from({ length: p }, (_, j) => Math.sqrt(varA(X.map((r) => r[j])))); return (a, b) => { let s = 0; for (let i = 0; i < p; i++) s += ((a[i] - b[i]) / w[i]) ** 2; return Math.sqrt(s); }; }
    case 'cityblock': return (a, b) => { let s = 0; for (let i = 0; i < p; i++) s += Math.abs(a[i] - b[i]); return s; };
    case 'minkowski': { const e = param ? toNum(param) : 2; return (a, b) => { let s = 0; for (let i = 0; i < p; i++) s += Math.abs(a[i] - b[i]) ** e; return s ** (1 / e); }; }
    case 'chebychev': return (a, b) => { let s = 0; for (let i = 0; i < p; i++) s = Math.max(s, Math.abs(a[i] - b[i])); return s; };
    case 'mahalanobis': {
      let C = param ? toRows(param) : null;
      if (!C) { const mu = Array.from({ length: p }, (_, j) => meanA(X.map((r) => r[j]))); C = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => X.reduce((s, r) => s + (r[i] - mu[i]) * (r[j] - mu[j]), 0) / (X.length - 1))); }
      const Ci = invM(C); if (!Ci) throw E('pdist:singularCov', 'The covariance matrix for the Mahalanobis metric must be positive definite.');
      return (a, b) => { const d = a.map((v, i) => v - b[i]); let s = 0; for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) s += d[i] * Ci[i][j] * d[j]; return Math.sqrt(Math.max(s, 0)); };
    }
    case 'cosine': return (a, b) => { let ab = 0, aa = 0, bb = 0; for (let i = 0; i < p; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; } return Math.max(0, 1 - ab / Math.sqrt(aa * bb)); };
    case 'correlation': case 'spearman': {
      const prep = (v) => { const r = metric === 'spearman' ? Array.from(tiedRank(v).r) : v; const m = meanA(r); return r.map((t) => t - m); };
      return (a, b) => { const x = prep(a), y = prep(b); let ab = 0, aa = 0, bb = 0; for (let i = 0; i < p; i++) { ab += x[i] * y[i]; aa += x[i] * x[i]; bb += y[i] * y[i]; } return Math.max(0, 1 - ab / Math.sqrt(aa * bb)); };
    }
    case 'hamming': return (a, b) => { let s = 0; for (let i = 0; i < p; i++) if (a[i] !== b[i]) s++; return s / p; };
    case 'jaccard': return (a, b) => { let nz = 0, df = 0; for (let i = 0; i < p; i++) if (a[i] !== 0 || b[i] !== 0) { nz++; if (a[i] !== b[i]) df++; } return nz ? df / nz : 0; };
    default: throw E('pdist:badMetric', `Unknown distance metric '${metric}'.`);
  }
}
function metricArg(v) { if (v == null || isEmptyV(v)) return 'euclidean'; if (isFuncHandle(v)) return v; return canonMetric(toStr(v)); }
/** Pairwise distance function between rows of X and rows of Y. */
function distFn(metric, X, param, ctx) {
  if (isFuncHandle(metric)) {
    return (a, b) => { const r = callFn(ctx, metric, [tensor('double', [1, a.length], a), tensor('double', [1, b.length], b)]); return F(r[0])[0]; };
  }
  return metricFn(metric, X, param, ctx);
}
export function pdistJS(X, metric = 'euclidean', param = null, ctx = null) {
  const n = X.length; const d = distFn(metric, X, param, ctx); const out = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push(d(X[i], X[j]));
  return out;
}
function pdist(args, nargout, ctx) {
  const X = toRows(args[0]); const metric = metricArg(args[1]);
  const D = pdistJS(X, metric, args[2], ctx);
  return tensor('double', [1, D.length], Float64Array.from(D));
}
function pdist2(args, nargout, ctx) {
  const X = toRows(args[0]), Y = toRows(args[1]);
  let metric = 'euclidean', k = 2, param = null;
  if (args[2] && (isFuncHandle(args[2]) || (isText(args[2]) && !['smallest', 'largest'].includes(toStr(args[2]).toLowerCase())))) { metric = metricArg(args[2]); k = 3; if (args[3] && !isText(args[3])) { param = args[3]; k = 4; } }
  const o = nv(args, k, ['Smallest', 'Largest']);
  const d = distFn(metric, [...X, ...Y], param, ctx);
  const nx = X.length, ny = Y.length;
  const D = Array.from({ length: nx }, (_, i) => Y.map((y) => d(X[i], y)));
  if (o.smallest || o.largest) {
    const K = toNum(o.smallest || o.largest); const asc = !!o.smallest;
    const Dk = new Float64Array(K * ny), Ik = new Float64Array(K * ny);
    for (let j = 0; j < ny; j++) {
      const idx = Array.from({ length: nx }, (_, i) => i).sort((a, b) => (asc ? D[a][j] - D[b][j] : D[b][j] - D[a][j]) || a - b);
      for (let t = 0; t < K; t++) { Dk[t + K * j] = t < nx ? D[idx[t]][j] : NaN; Ik[t + K * j] = t < nx ? idx[t] + 1 : NaN; }
    }
    return [tensor('double', [K, ny], Dk), tensor('double', [K, ny], Ik)];
  }
  return fromRows(D);
}
function squareform(args) {
  const v = args[0]; const dir = args[1] && isText(args[1]) ? toStr(args[1]).toLowerCase() : null;
  const d = v.dims || [1, 1]; const a = F(v);
  const isVec = (d[0] === 1 || d[1] === 1) && !(d[0] === 1 && d[1] === 1 && dir === 'tovector');
  if ((dir === 'tomatrix') || (!dir && isVec && !(d[0] === d[1] && d[0] === 1 && a[0] === 0))) {
    const m = a.length; const n = Math.round((1 + Math.sqrt(1 + 8 * m)) / 2);
    if (n * (n - 1) / 2 !== m) throw E('squareform:badLength', 'The size of the input vector is not correct.');
    const Z = new Float64Array(n * n); let k = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { Z[j + i * n] = a[k]; Z[i + j * n] = a[k]; k++; }
    return tensor('double', [n, n], Z);
  }
  const n = d[0]; if (d[0] !== d[1]) throw E('squareform:notSquare', 'The input matrix must be square.');
  const out = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push(a[j + i * n]);
  return tensor('double', [1, out.length], Float64Array.from(out));
}

// ------------------------------------------------------------ linkage
const LMETHODS = ['single', 'complete', 'average', 'weighted', 'centroid', 'median', 'ward'];
export function linkageJS(Dvec, n, method) {
  const sq = method === 'centroid' || method === 'median' || method === 'ward';
  const D = Array.from({ length: n }, () => new Float64Array(n));
  let k = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const v = sq ? Dvec[k] * Dvec[k] : Dvec[k]; D[i][j] = D[j][i] = v; k++; }
  const active = new Array(n).fill(true); const id = Array.from({ length: n }, (_, i) => i + 1); const size = new Array(n).fill(1);
  const Z = [];
  for (let step = 0; step < n - 1; step++) {
    let bi = -1, bj = -1, best = Infinity;
    for (let i = 0; i < n; i++) if (active[i]) for (let j = i + 1; j < n; j++) if (active[j] && D[i][j] <= best) { best = D[i][j]; bi = i; bj = j; }
    if (bi < 0) { // remaining distances are all NaN/Inf: merge the first two
      const act = active.map((a, i) => (a ? i : -1)).filter((i) => i >= 0); bi = act[0]; bj = act[1]; best = D[bi][bj];
    }
    const a = id[bi], b = id[bj];
    const h = sq ? Math.sqrt(Math.max(best, 0)) : best;
    Z.push([Math.min(a, b), Math.max(a, b), h]);
    const ni = size[bi], nj = size[bj];
    for (let t = 0; t < n; t++) if (active[t] && t !== bi && t !== bj) {
      const dik = D[bi][t], djk = D[bj][t], nk = size[t]; let v;
      switch (method) {
        case 'single': v = Math.min(dik, djk); break;
        case 'complete': v = Math.max(dik, djk); break;
        case 'average': v = (ni * dik + nj * djk) / (ni + nj); break;
        case 'weighted': v = (dik + djk) / 2; break;
        case 'centroid': v = (ni * dik + nj * djk) / (ni + nj) - ni * nj * best / ((ni + nj) ** 2); break;
        case 'median': v = dik / 2 + djk / 2 - best / 4; break;
        case 'ward': v = ((ni + nk) * dik + (nj + nk) * djk - nk * best) / (ni + nj + nk); break;
        default: throw E('linkage:badMethod', `Unknown linkage method '${method}'.`);
      }
      D[bi][t] = D[t][bi] = v;
    }
    active[bj] = false; size[bi] = ni + nj; id[bi] = n + step + 1;
  }
  // centroid / median / ward run Lance–Williams on squared Euclidean distances; heights are their square roots
  return Z;
}
function linkage(args, nargout, ctx) {
  const v = args[0]; const d = v.dims || [1, 1];
  let method = args[1] && isText(args[1]) ? toStr(args[1]).toLowerCase() : 'single';
  const mm = LMETHODS.find((m) => m.startsWith(method)); if (!mm) throw E('linkage:badMethod', `Unknown linkage method '${method}'.`); method = mm;
  let Dvec, n;
  const isDistVec = d[0] === 1 && args.length <= 2 && (() => { const m = d[1]; const nn = Math.round((1 + Math.sqrt(1 + 8 * m)) / 2); return nn * (nn - 1) / 2 === m; })();
  if (isDistVec) { Dvec = Array.from(F(v)); n = Math.round((1 + Math.sqrt(1 + 8 * Dvec.length)) / 2); }
  else {
    const X = toRows(v); n = X.length;
    let metric = args[2] ? metricArg(args[2]) : 'euclidean';
    Dvec = pdistJS(X, metric, args[3], ctx);
  }
  const Z = linkageJS(Dvec, n, method);
  return Z.length ? fromRows(Z) : tensor('double', [0, 3]);
}
/** Leaves under each node (node ids 1..2n-1). */
function members(Z, n) {
  const m = new Map(); for (let i = 1; i <= n; i++) m.set(i, [i]);
  Z.forEach((z, k) => m.set(n + k + 1, [...m.get(z[0]), ...m.get(z[1])]));
  return m;
}
function clusterFromZ(Z, n, nclust) {
  // cut the top nclust-1 links
  const lab = new Array(n).fill(0); const mem = members(Z, n);
  const roots = new Set(); if (nclust >= n) { for (let i = 1; i <= n; i++) roots.add(i); }
  else {
    roots.add(n + Z.length); // whole tree
    for (let k = Z.length - 1; k > Z.length - nclust; k--) { const node = n + k + 1; roots.delete(node); roots.add(Z[k][0]); roots.add(Z[k][1]); }
  }
  return labelRoots(roots, mem, n);
}
function labelRoots(roots, mem, n) {
  const lab = new Array(n).fill(0); let c = 0;
  const rs = [...roots].sort((a, b) => Math.min(...mem.get(a)) - Math.min(...mem.get(b)));
  for (const r of rs) { c++; for (const leaf of mem.get(r)) lab[leaf - 1] = c; }
  return lab;
}
function inconsistentJS(Z, n, depth = 2) {
  const out = [];
  for (let k = 0; k < Z.length; k++) {
    const hs = [];
    const walk = (node, d) => { if (node <= n || d > depth) return; const z = Z[node - n - 1]; hs.push(z[2]); walk(z[0], d + 1); walk(z[1], d + 1); };
    walk(n + k + 1, 1);
    const m = meanA(hs); const s = hs.length > 1 ? Math.sqrt(varA(hs)) : 0;
    out.push([m, s, hs.length, s > 0 ? (Z[k][2] - m) / s : 0]);
  }
  return out;
}
function cluster(args) {
  const Z = toRows(args[0]); const n = Z.length + 1;
  const o = nv(args, 1, ['Cutoff', 'MaxClust', 'Criterion', 'Depth']);
  const mem = members(Z, n);
  if (o.maxclust) {
    const ks = Array.from(F(o.maxclust));
    const cols = ks.map((k) => clusterFromZ(Z, n, Math.max(1, Math.min(n, k))));
    return tensor('double', [n, ks.length], Float64Array.from(cols.flat()));
  }
  if (!o.cutoff) throw E('cluster:noCriterion', "Specify 'Cutoff' or 'MaxClust'.");
  const crit = o.criterion ? toStr(o.criterion).toLowerCase() : 'inconsistent';
  const depth = o.depth ? toNum(o.depth) : 2;
  const val = crit === 'distance' ? Z.map((z) => z[2]) : inconsistentJS(Z, n, depth).map((r) => r[3]);
  const cs = Array.from(F(o.cutoff));
  const cols = cs.map((c) => {
    // a node is split when its value (or any descendant link's value for 'inconsistent') exceeds c
    const cut = new Array(Z.length).fill(false);
    for (let k = 0; k < Z.length; k++) cut[k] = val[k] > c;
    // propagate: a link above a cut link is also cut (monotone)
    for (let k = 0; k < Z.length; k++) for (const ch of [Z[k][0], Z[k][1]]) if (ch > n && cut[ch - n - 1]) cut[k] = true;
    const roots = new Set();
    const walk = (node) => { if (node <= n || !cut[node - n - 1]) { roots.add(node); return; } const z = Z[node - n - 1]; walk(z[0]); walk(z[1]); };
    walk(n + Z.length);
    return labelRoots(roots, mem, n);
  });
  return tensor('double', [n, cs.length], Float64Array.from(cols.flat()));
}
function cophenet(args) {
  const Z = toRows(args[0]); const n = Z.length + 1; const Y = Array.from(F(args[1]));
  const C = Array.from({ length: n }, () => new Float64Array(n)); const mem = members(Z, n);
  Z.forEach((z) => { for (const a of mem.get(z[0])) for (const b of mem.get(z[1])) { C[a - 1][b - 1] = C[b - 1][a - 1] = z[2]; } });
  const d = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) d.push(C[i][j]);
  const my = meanA(Y), md = meanA(d); let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < d.length; i++) { sab += (Y[i] - my) * (d[i] - md); saa += (Y[i] - my) ** 2; sbb += (d[i] - md) ** 2; }
  return [num(sab / Math.sqrt(saa * sbb)), tensor('double', [1, d.length], Float64Array.from(d))];
}
function dendrogram(args, nargout, ctx) {
  const Z = toRows(args[0]); const n = Z.length + 1;
  let P = 30; let k = 1; if (args[1] && !isText(args[1])) { P = toNum(args[1]); k = 2; }
  if (P === 0 || P > n) P = n;
  const o = nv(args, k, ['Orientation', 'Reorder', 'Labels', 'ColorThreshold', 'CheckCrossing']);
  // leaf nodes of the displayed tree: the clusters after cutting at P leaves
  const mem = members(Z, n);
  const T = P < n ? clusterFromZ(Z, n, P) : Array.from({ length: n }, (_, i) => i + 1);
  // order: depth-first, left child first
  const order = [];
  const top = new Set(); if (P < n) { top.add(n + Z.length); for (let kk = Z.length - 1; kk > Z.length - P; kk--) { top.delete(n + kk + 1); top.add(Z[kk][0]); top.add(Z[kk][1]); } }
  const walk = (node) => { if (node <= n || (P < n && top.has(node))) { order.push(node); return; } const z = Z[node - n - 1]; walk(z[0]); walk(z[1]); };
  walk(n + Z.length);
  const outperm = order.map((node) => T[mem.get(node)[0] - 1]);
  if (o.reorder) { /* user order accepted as given */ }
  let Hh = empty();
  return [Hh, tensor('double', [n, 1], Float64Array.from(T)), tensor('double', [1, outperm.length], Float64Array.from(outperm))];
}

// ------------------------------------------------------------ k-means / k-medoids
function kmeansCore(X, k, g, opts) {
  const n = X.length, p = X[0].length; const dist = opts.distance;
  const D = (a, b) => {
    if (dist === 'cityblock') { let s = 0; for (let i = 0; i < p; i++) s += Math.abs(a[i] - b[i]); return s; }
    if (dist === 'cosine' || dist === 'correlation') { let ab = 0, aa = 0, bb = 0; for (let i = 0; i < p; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; } return 1 - ab / Math.sqrt(aa * bb); }
    let s = 0; for (let i = 0; i < p; i++) s += (a[i] - b[i]) ** 2; return s;
  };
  const prep = (r) => {
    if (dist === 'correlation') { const m = meanA(r); r = r.map((v) => v - m); }
    if (dist === 'cosine' || dist === 'correlation') { const nr = Math.sqrt(r.reduce((s, v) => s + v * v, 0)); return r.map((v) => v / nr); }
    return r;
  };
  const Xp = X.map(prep);
  let C;
  if (opts.start === 'matrix') C = opts.C0.map((r) => prep(r.slice()));
  else if (opts.start === 'sample') { const idx = []; while (idx.length < k) { const i = Math.floor(g.rand() * n); if (!idx.includes(i)) idx.push(i); } C = idx.map((i) => Xp[i].slice()); }
  else if (opts.start === 'uniform') { const lo = Array.from({ length: p }, (_, j) => Math.min(...Xp.map((r) => r[j]))), hi = Array.from({ length: p }, (_, j) => Math.max(...Xp.map((r) => r[j]))); C = Array.from({ length: k }, () => lo.map((l, j) => l + g.rand() * (hi[j] - l))); }
  else {
    // k-means++
    C = [Xp[Math.min(n - 1, Math.floor(g.rand() * n))].slice()];
    const md = Xp.map((x) => D(x, C[0]));
    while (C.length < k) {
      const tot = md.reduce((a, b) => a + b, 0); let u = g.rand() * tot; let pick = n - 1;
      for (let i = 0; i < n; i++) { u -= md[i]; if (u <= 0) { pick = i; break; } }
      if (tot === 0) pick = Math.floor(g.rand() * n);
      C.push(Xp[pick].slice()); for (let i = 0; i < n; i++) md[i] = Math.min(md[i], D(Xp[i], C[C.length - 1]));
    }
  }
  let idx = new Array(n).fill(-1); let iter = 0;
  for (; iter < opts.maxIter; iter++) {
    opts.ctx.checkInterrupt();
    let changed = false;
    for (let i = 0; i < n; i++) { let b = 0, bd = Infinity; for (let c = 0; c < k; c++) { const d = D(Xp[i], C[c]); if (d < bd) { bd = d; b = c; } } if (idx[i] !== b) { idx[i] = b; changed = true; } }
    // update
    for (let c = 0; c < k; c++) {
      const memb = Xp.filter((_, i) => idx[i] === c);
      if (!memb.length) {
        if (opts.emptyAction === 'error') throw E('kmeans:emptyCluster', 'An empty cluster was created.');
        if (opts.emptyAction === 'drop') { C[c] = C[c].map(() => NaN); continue; }
        // singleton: farthest point from its centroid
        let far = 0, fd = -1; for (let i = 0; i < n; i++) { const d = D(Xp[i], C[idx[i]]); if (d > fd) { fd = d; far = i; } }
        C[c] = Xp[far].slice(); idx[far] = c; changed = true; continue;
      }
      if (dist === 'cityblock') C[c] = Array.from({ length: p }, (_, j) => medianA(memb.map((r) => r[j])));
      else { C[c] = Array.from({ length: p }, (_, j) => meanA(memb.map((r) => r[j]))); if (dist === 'cosine' || dist === 'correlation') C[c] = prep(C[c]); }
    }
    if (!changed && iter > 0) break;
  }
  const Dm = Xp.map((x) => C.map((c) => D(x, c)));
  const sumd = C.map((_, c) => Dm.reduce((s, r, i) => s + (idx[i] === c ? r[c] : 0), 0));
  return { idx, C, sumd, Dm, total: sumd.reduce((a, b) => a + (Number.isNaN(b) ? 0 : b), 0), iter: iter + 1 };
}
function kmeans(args, nargout, ctx) {
  const X = toRows(args[0]); let k = toNum(args[1], 'k');
  const o = nv(args, 2, ['Distance', 'Start', 'Replicates', 'MaxIter', 'EmptyAction', 'Display', 'Options', 'OnlinePhase']);
  const distance = o.distance ? toStr(o.distance).toLowerCase() : 'sqeuclidean';
  if (!['sqeuclidean', 'cityblock', 'cosine', 'correlation'].includes(distance)) throw E('kmeans:badDistance', `Unknown distance '${distance}'.`);
  let start = 'plus', C0 = null, reps = o.replicates ? toNum(o.replicates) : 1;
  if (o.start) { if (isText(o.start)) start = toStr(o.start).toLowerCase(); else { start = 'matrix'; C0 = toRows(o.start); k = C0.length; } }
  if (start === 'cluster') start = 'sample';
  const maxIter = o.maxiter ? toNum(o.maxiter) : 100; const emptyAction = o.emptyaction ? toStr(o.emptyaction).toLowerCase() : 'singleton';
  const n = X.length; if (k > n) throw E('kmeans:TooManyClusters', 'X must have more rows than the number of clusters.');
  const g = globalGen(ctx); let best = null;
  for (let r = 0; r < reps; r++) {
    const res = kmeansCore(X, k, g, { distance, start, C0, maxIter, emptyAction, ctx });
    if (!best || res.total < best.total) best = res;
  }
  const disp = o.display ? toStr(o.display).toLowerCase() : 'off';
  if (disp === 'final' || disp === 'iter') ctx.out(`${best.iter} iterations, total sum of distances = ${fmtG(best.total, 6)}\n`);
  return [tensor('double', [n, 1], Float64Array.from(best.idx.map((i) => i + 1))), fromRows(best.C), tensor('double', [k, 1], Float64Array.from(best.sumd)), fromRows(best.Dm)];
}
function kmedoids(args, nargout, ctx) {
  const X = toRows(args[0]); const k = toNum(args[1], 'k'); const n = X.length;
  const o = nv(args, 2, ['Distance', 'Replicates', 'Start', 'Algorithm', 'Options']);
  let metric = o.distance ? (isFuncHandle(o.distance) ? o.distance : toStr(o.distance).toLowerCase()) : 'sqeuclidean';
  const reps = o.replicates ? toNum(o.replicates) : 1;
  const met = metric === 'sqeuclidean' ? 'squaredeuclidean' : metric === 'cityblock' || metric === 'euclidean' || metric === 'cosine' || metric === 'correlation' || metric === 'hamming' || metric === 'jaccard' || metric === 'chebychev' || metric === 'seuclidean' || metric === 'mahalanobis' || metric === 'spearman' || metric === 'minkowski' ? metric : isFuncHandle(metric) ? metric : canonMetric(metric);
  const d = distFn(met, X, null, ctx);
  const DM = Array.from({ length: n }, (_, i) => new Float64Array(n)); for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) DM[i][j] = DM[j][i] = d(X[i], X[j]);
  const g = globalGen(ctx); let best = null;
  for (let r = 0; r < reps; r++) {
    // k-means++ style seeding on the distance matrix
    const med = [Math.floor(g.rand() * n)]; const md = Array.from({ length: n }, (_, i) => DM[i][med[0]]);
    while (med.length < k) { const tot = md.reduce((a, b) => a + b, 0); let u = g.rand() * tot, pick = n - 1; for (let i = 0; i < n; i++) { u -= md[i]; if (u <= 0) { pick = i; break; } } if (med.includes(pick)) pick = md.indexOf(Math.max(...md)); med.push(pick); for (let i = 0; i < n; i++) md[i] = Math.min(md[i], DM[i][pick]); }
    const cost = (M) => { let s = 0; for (let i = 0; i < n; i++) s += Math.min(...M.map((m) => DM[i][m])); return s; };
    let cur = cost(med);
    // PAM swap phase
    for (let it = 0; it < 100; it++) {
      ctx.checkInterrupt(); let improved = false;
      for (let a = 0; a < k; a++) for (let h = 0; h < n; h++) {
        if (med.includes(h)) continue; const trial = med.slice(); trial[a] = h; const c = cost(trial);
        if (c < cur - 1e-12) { med.splice(0, k, ...trial); cur = c; improved = true; }
      }
      if (!improved) break;
    }
    if (!best || cur < best.cur) best = { med: med.slice(), cur };
  }
  const med = best.med; const idx = []; const sumd = new Array(k).fill(0); const Dm = [];
  for (let i = 0; i < n; i++) { let b = 0; for (let c = 1; c < k; c++) if (DM[i][med[c]] < DM[i][med[b]]) b = c; idx.push(b + 1); sumd[b] += DM[i][med[b]]; Dm.push(med.map((m) => DM[i][m])); }
  return [tensor('double', [n, 1], Float64Array.from(idx)), fromRows(med.map((m) => X[m])), tensor('double', [k, 1], Float64Array.from(sumd)), fromRows(Dm), tensor('double', [k, 1], Float64Array.from(med.map((m) => m + 1))), structOf({ algorithm: str('pam'), start: str('plus'), distance: str(typeof metric === 'string' ? metric : 'custom'), iterations: num(1), bestReplicate: num(1) })];
}

// ------------------------------------------------------------ PCA
function pca(args) {
  let X = toRows(args[0]);
  const o = nv(args, 1, ['NumComponents', 'Centered', 'Economy', 'Rows', 'Algorithm', 'Weights', 'VariableWeights']);
  const rowsMode = o.rows ? toStr(o.rows).toLowerCase() : 'complete';
  if (rowsMode !== 'all') X = X.filter((r) => r.every((v) => !Number.isNaN(v)));
  const n = X.length, p = X[0].length; const centered = o.centered ? (isText(o.centered) ? toStr(o.centered) !== 'off' : toNum(o.centered) !== 0) : true;
  const mu = Array.from({ length: p }, (_, j) => (centered ? meanA(X.map((r) => r[j])) : 0));
  const Xc = X.map((r) => r.map((v, j) => v - mu[j]));
  const { U, s, V } = svd(Xc);
  const dof = n - (centered ? 1 : 0);
  let r = s.length; const tol = Math.max(n, p) * 2.2e-16 * (s[0] || 0);
  const economy = o.economy ? toNum(o.economy) !== 0 : true;
  let rank = s.filter((x) => x > tol).length;
  let kComp = economy ? Math.min(dof, p, r) : p;
  if (o.numcomponents) kComp = Math.min(kComp, toNum(o.numcomponents));
  // sign convention: largest |coeff| in each column is positive
  const coeff = Array.from({ length: p }, (_, i) => new Array(kComp).fill(0));
  const score = Array.from({ length: n }, () => new Array(kComp).fill(0));
  for (let c = 0; c < kComp && c < V[0].length; c++) {
    let mi = 0; for (let i = 1; i < p; i++) if (Math.abs(V[i][c]) > Math.abs(V[mi][c])) mi = i;
    const sg = V[mi][c] < 0 ? -1 : 1;
    for (let i = 0; i < p; i++) coeff[i][c] = sg * V[i][c];
    for (let i = 0; i < n; i++) score[i][c] = sg * U[i][c] * s[c];
  }
  const latentAll = s.map((x) => (x * x) / dof);
  const latent = latentAll.slice(0, Math.min(dof, p));
  const total = latentAll.reduce((a, b) => a + b, 0);
  const explained = latent.map((l) => 100 * l / total);
  const tsq = Xc.map((_, i) => { let t = 0; for (let c = 0; c < rank && c < s.length; c++) { const sc = U[i][c] * s[c]; t += sc * sc / latentAll[c]; } return t; });
  return [fromRows(coeff), fromRows(score), tensor('double', [latent.length, 1], Float64Array.from(latent)), tensor('double', [n, 1], Float64Array.from(tsq)), tensor('double', [explained.length, 1], Float64Array.from(explained)), tensor('double', [1, p], Float64Array.from(mu))];
}

// ------------------------------------------------------------ cvpartition / crossval / confusionmat
function makeCV(type, n, test, ctx, params) {
  const nTest = test.length;
  const props = {
    Type: str(type), NumObservations: num(n), NumTestSets: num(nTest),
    TrainSize: tensor('double', [1, nTest], test.map((t) => n - t.reduce((a, b) => a + b, 0))),
    TestSize: tensor('double', [1, nTest], test.map((t) => t.reduce((a, b) => a + b, 0))),
  };
  return object('cvpartition', props, { extra: { _test: test, _params: params } });
}
function cvpartition(args, nargout, ctx) {
  const g = globalGen(ctx);
  let groupsV = null, n;
  if (args[0] && (isCell(args[0]) || isString(args[0]) || (F(args[0]).length > 1))) { groupsV = groups(args[0]); n = groupsV.idx.length; } else n = toNum(args[0], 'n');
  const kind = args[1] ? toStr(args[1]).toLowerCase() : 'kfold';
  const perm = (m) => { const a = Array.from({ length: m }, (_, i) => i); for (let i = m - 1; i > 0; i--) { const j = Math.floor(g.rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  if (kind === 'kfold') {
    const K = args[2] ? toNum(args[2]) : 10; const folds = new Array(n).fill(0);
    if (groupsV) {
      const ng = groupsV.names.length; let offset = 0;
      for (let gi = 0; gi < ng; gi++) { const idx = []; groupsV.idx.forEach((v, i) => { if (v === gi) idx.push(i); }); const pp = perm(idx.length); pp.forEach((p, t) => { folds[idx[p]] = (t + offset) % K; }); offset += idx.length; }
    } else { const pp = perm(n); pp.forEach((p, t) => { folds[p] = t % K; }); }
    const test = Array.from({ length: K }, (_, k) => folds.map((f) => (f === k ? 1 : 0)));
    return makeCV(groupsV ? 'kfold' : 'kfold', n, test, ctx, { K });
  }
  if (kind === 'holdout') {
    const pv = args[2] ? toNum(args[2]) : 0.1; const nt = pv < 1 ? Math.round(pv * n) : pv;
    const pp = perm(n); const t = new Array(n).fill(0); for (let i = 0; i < nt; i++) t[pp[i]] = 1;
    return makeCV('holdout', n, [t], ctx, { p: pv });
  }
  if (kind === 'leaveout') return makeCV('leaveout', n, Array.from({ length: n }, (_, k) => Array.from({ length: n }, (_, i) => (i === k ? 1 : 0))), ctx, {});
  if (kind === 'resubstitution') return makeCV('resubstitution', n, [new Array(n).fill(1)], ctx, {});
  throw E('cvpartition:badType', `Unknown partition type '${kind}'.`);
}
const cvIdx = (c, i, train) => { const t = c._test[(i || 1) - 1]; if (!t) throw E('cvpartition:badIndex', 'Index exceeds the number of test sets.'); return tensor('logical', [t.length, 1], c.props.Type.re && toStr(c.props.Type) === 'resubstitution' ? t : t.map((v) => (train ? 1 - v : v))); };
function rowsSel(v, mask) {
  const d = v.dims; const m = d[0]; const n = d[1]; const a = F(v); const rows = []; mask.forEach((b, i) => { if (b) rows.push(i); });
  const out = new Float64Array(rows.length * n); for (let j = 0; j < n; j++) rows.forEach((r, t) => { out[t + j * rows.length] = a[r + j * m]; });
  return tensor('double', [rows.length, n], out);
}
function crossval(args, nargout, ctx) {
  let crit = null, fun = null, k = 0;
  if (isText(args[0])) { crit = toStr(args[0]).toLowerCase(); k = 1; } else { fun = args[0]; k = 1; }
  const data = []; while (k < args.length && !isText(args[k])) data.push(args[k++]);
  const o = nv(args, k, ['KFold', 'Holdout', 'Leaveout', 'Partition', 'Predfun', 'Stratify', 'MCReps']);
  const n = data[0].dims[0];
  let c;
  if (o.partition) c = o.partition;
  else if (o.holdout) c = cvpartition([num(n), str('holdout'), o.holdout], 1, ctx);
  else if (o.leaveout) c = cvpartition([num(n), str('leaveout')], 1, ctx);
  else c = cvpartition([o.stratify || num(n), str('kfold'), o.kfold || num(10)], 1, ctx);
  const K = c._test.length; const vals = [];
  let sse = 0, cnt = 0, miss = 0;
  for (let i = 0; i < K; i++) {
    ctx.checkInterrupt();
    const test = c._test[i]; const train = test.map((v) => 1 - v);
    if (crit) {
      if (!o.predfun) throw E('crossval:noPredfun', "'Predfun' is required with a criterion.");
      const X = data[0], y = data[1];
      const yhat = F(callFn(ctx, o.predfun, [rowsSel(X, train), rowsSel(y, train), rowsSel(X, test)])[0]);
      const yt = F(rowsSel(y, test));
      for (let t = 0; t < yt.length; t++) { if (crit === 'mse') sse += (yt[t] - yhat[t]) ** 2; else if (yt[t] !== yhat[t]) miss++; cnt++; }
    } else {
      const fa = []; for (const dv of data) { fa.push(rowsSel(dv, train)); } for (const dv of data) fa.push(rowsSel(dv, test));
      const r = callFn(ctx, fun, fa); vals.push(Array.from(F(r[0])));
    }
  }
  if (crit === 'mse') return num(sse / cnt);
  if (crit === 'mcr') return num(miss / cnt);
  return fromRows(vals);
}
function confusionmat(args) {
  const o = nv(args, 2, ['Order']);
  const toKeys = (v) => (isCell(v) || isString(v) ? (isCell(v) ? v.data.map((x) => toStr(x)) : v.data.slice()) : Array.from(F(v)));
  const a = toKeys(args[0]), b = toKeys(args[1]);
  if (a.length !== b.length) throw E('confusionmat:sizeMismatch', 'G and GHAT must have the same number of observations.');
  const numeric = typeof a[0] === 'number';
  let order;
  if (o.order) order = toKeys(o.order);
  else { order = [...new Set([...a, ...b].filter((x) => !(typeof x === 'number' && Number.isNaN(x)) && x !== ''))]; if (numeric) order.sort((x, y) => x - y); else order.sort(); }
  const k = order.length; const C = new Float64Array(k * k);
  for (let i = 0; i < a.length; i++) { const r = order.indexOf(a[i]), c = order.indexOf(b[i]); if (r >= 0 && c >= 0) C[r + c * k]++; }
  const ordV = numeric ? tensor('double', [k, 1], Float64Array.from(order)) : cellStr(order.map(String), [k, 1]);
  return [tensor('double', [k, k], C), ordV];
}

export const classes = {
  cvpartition: {
    props: ['Type', 'NumObservations', 'NumTestSets', 'TrainSize', 'TestSize'],
    construct(args, ctx) { return cvpartition(args, 1, ctx); },
    methods: {
      training: (args) => cvIdx(args[0], args[1] ? toNum(args[1]) : 1, true),
      test: (args) => cvIdx(args[0], args[1] ? toNum(args[1]) : 1, false),
      repartition: (args, nargout, ctx) => { const c = args[0]; const t = toStr(c.props.Type); const n = toNum(c.props.NumObservations); return cvpartition([num(n), str(t), num(c._params.K || c._params.p || 0)], 1, ctx); },
    },
    display(c, name) {
      const t = toStr(c.props.Type);
      const label = { kfold: 'K-fold cross validation partition', holdout: 'Hold-out cross validation partition', leaveout: 'Leave-one-out cross validation partition', resubstitution: 'Resubstitution (no partition of data)' }[t] || t;
      return `${name} = \n${label}\n   NumObservations: ${toNum(c.props.NumObservations)}\n       NumTestSets: ${toNum(c.props.NumTestSets)}\n         TrainSize: ${Array.from(F(c.props.TrainSize)).join('  ')}\n          TestSize: ${Array.from(F(c.props.TestSize)).join('  ')}\n`;
    },
  },
};
export const builtins = {
  pdist, pdist2, squareform, linkage, cluster, cophenet, dendrogram,
  inconsistent(args) { const Z = toRows(args[0]); return fromRows(inconsistentJS(Z, Z.length + 1, n1(args[1], 2))); },
  kmeans, kmedoids, pca, cvpartition, crossval, confusionmat,
};
export const help = {
  pdist: H('Pairwise distances between rows (euclidean, cityblock, cosine, mahalanobis, ...).', '행 사이의 쌍별 거리 (euclidean, cityblock, cosine, mahalanobis 등).', ['D = pdist(X)', 'D = pdist(X, metric)', "D = pdist(X, 'minkowski', p)", 'D = pdist(X, @distfun)']),
  pdist2: H('Distances between rows of two sets of observations.', '두 관측 집합의 행 사이 거리.', ['D = pdist2(X, Y)', 'D = pdist2(X, Y, metric)', "[D, I] = pdist2(X, Y, metric, 'Smallest', K)"]),
  squareform: H('Converts between a distance vector and a square distance matrix.', '거리 벡터와 정방 거리 행렬을 서로 변환합니다.', ['Z = squareform(y)', "y = squareform(Z, 'tovector')"]),
  linkage: H('Agglomerative hierarchical cluster tree.', '병합형 계층적 군집 트리.', ['Z = linkage(X)', 'Z = linkage(X, method)', 'Z = linkage(X, method, metric)', 'Z = linkage(y, method)']),
  cluster: H('Clusters from a hierarchical cluster tree.', '계층 군집 트리에서 군집을 만듭니다.', ["T = cluster(Z, 'MaxClust', n)", "T = cluster(Z, 'Cutoff', c, 'Criterion', 'distance')"]),
  cophenet: H('Cophenetic correlation coefficient.', '코페네틱 상관계수.', ['c = cophenet(Z, Y)', '[c, d] = cophenet(Z, Y)']),
  dendrogram: H('Dendrogram data: leaf assignment and leaf order (no drawing here).', '덴드로그램 데이터: 잎 배정과 잎 순서 (그림은 그리지 않음).', ['[H, T, outperm] = dendrogram(Z)', '[H, T, outperm] = dendrogram(Z, P)']),
  inconsistent: H('Inconsistency coefficients of a cluster tree.', '군집 트리의 비일관성 계수.', ['Y = inconsistent(Z)', 'Y = inconsistent(Z, depth)']),
  kmeans: H('k-means clustering (k-means++ start, replicates).', 'k-평균 군집 (k-means++ 시작, 반복 실행).', ['idx = kmeans(X, k)', '[idx, C, sumd, D] = kmeans(X, k, Name, Value)', "[___] = kmeans(X, k, 'Replicates', 5)"]),
  kmedoids: H('k-medoids clustering (PAM swaps).', 'k-메도이드 군집 (PAM 교환).', ['idx = kmedoids(X, k)', '[idx, C, sumd, D, midx, info] = kmedoids(X, k, Name, Value)']),
  pca: H('Principal component analysis.', '주성분 분석.', ['coeff = pca(X)', '[coeff, score, latent, tsquared, explained, mu] = pca(X, Name, Value)']),
  cvpartition: H('Cross-validation partition (KFold, HoldOut, LeaveOut, Resubstitution).', '교차 검증 분할 (KFold, HoldOut, LeaveOut, Resubstitution).', ["c = cvpartition(n, 'KFold', k)", "c = cvpartition(group, 'KFold', k)", "c = cvpartition(n, 'HoldOut', p)", 'idx = training(c, i)', 'idx = test(c, i)']),
  crossval: H('Cross-validated function values or loss estimate.', '교차 검증한 함수 값 또는 손실 추정.', ['vals = crossval(fun, X)', "mse = crossval('mse', X, y, 'Predfun', f)", "[___] = crossval(___, 'KFold', k)"]),
  confusionmat: H('Confusion matrix of known and predicted groups.', '실제 그룹과 예측 그룹의 혼동 행렬.', ['C = confusionmat(g, ghat)', "[C, order] = confusionmat(g, ghat, 'Order', order)"]),
};
