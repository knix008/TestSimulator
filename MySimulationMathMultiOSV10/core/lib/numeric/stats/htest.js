// Hypothesis tests: t, z, variance, chi-square goodness of fit,
// Kolmogorov–Smirnov, rank-sum / signed-rank, one- and two-way ANOVA.
import { tensor, num, str, bool, isText, toStr, toNum, cell, structOf, isFuncHandle, empty } from '../../../value.js';
import { E, F, H, n1, isEmptyV, nv, toRows, fromRows, callArr, fmtG, cellStr } from '../_util.js';
import { norminv, gammainc, betainc } from '../_kernels.js';
import { meanA, varA, stdA, sorted, tiedRank, groups, sumA } from './_s.js';
import { tCdf, tInv, Phi, DIST } from './dist.js';
import { isDistObj, evalCdf } from './distobj.js';

const fCdfU = (x, a, b) => (x <= 0 ? 1 : betainc(a * x / (a * x + b), a / 2, b / 2, true));
const chi2Cdf = (x, v) => gammainc(Math.max(x, 0) / 2, v / 2);
const chi2Inv = (q, v) => DIST.chi2.inv(q, [v]);
const fInv = (q, a, b) => DIST.f.inv(q, [a, b]);
const dataVec = (v) => Array.from(F(v)).filter((x) => !Number.isNaN(x));
function tailOf(o) {
  const t = o.tail ? toStr(o.tail).toLowerCase() : 'both';
  if (t === 'both' || t === 'ne') return 'both'; if (t === 'right' || t === 'gt') return 'right'; if (t === 'left' || t === 'lt') return 'left';
  throw E('htest:badTail', "Tail must be 'both', 'right' or 'left'.");
}
/** p value from a statistic with lower-tail cdf F. */
function pval(stat, tail, cdf) {
  if (tail === 'right') return 1 - cdf(stat);
  if (tail === 'left') return cdf(stat);
  const c = cdf(stat); return Math.min(1, 2 * Math.min(c, 1 - c));
}
const hOf = (p, alpha) => (Number.isNaN(p) ? NaN : p <= alpha ? 1 : 0);
const ci2 = (a, b) => tensor('double', [1, 2], [a, b]);
/** name/value options after `k` positional args, or the legacy (alpha, tail) positional form. */
function opts(args, k, extra = []) {
  const rest = args.slice(k);
  if (rest.length && !isText(rest[0])) {
    const o = Object.create(null); if (!isEmptyV(rest[0])) o.alpha = rest[0]; if (rest[1] && !isEmptyV(rest[1])) o.tail = rest[1];
    if (rest[2] && !isEmptyV(rest[2])) o.vartype = rest[2];
    return o;
  }
  return nv(rest, 0, ['Alpha', 'Tail', 'Dim', 'Vartype', ...extra]);
}

function tCi(m, se, df, alpha, tail) {
  if (tail === 'both') { const c = tInv(1 - alpha / 2, df); return ci2(m - c * se, m + c * se); }
  const c = tInv(1 - alpha, df);
  return tail === 'right' ? ci2(m - c * se, Infinity) : ci2(-Infinity, m + c * se);
}

const builtins = {
  ttest(args) {
    let x = dataVec(args[0]); let m = 0; let k = 1;
    if (args[1] != null && !isText(args[1])) {
      const v = F(args[1]);
      if (v.length > 1 || (v.length === 1 && F(args[0]).length === 1)) { const y = Array.from(v); const xa = Array.from(F(args[0])); if (y.length !== xa.length) throw E('ttest:inputSizeMismatch', 'The data in a paired t-test must be the same size.'); x = xa.map((t, i) => t - y[i]).filter((t) => !Number.isNaN(t)); }
      else if (v.length === 1) m = v[0];
      k = 2;
    }
    const o = opts(args, k); const alpha = o.alpha ? toNum(o.alpha) : 0.05; const tail = tailOf(o);
    const n = x.length; const df = n - 1; const sd = stdA(x); const se = sd / Math.sqrt(n); const mean = meanA(x);
    const t = (mean - m) / se; const p = pval(t, tail, (z) => tCdf(z, df));
    return [num(hOf(p, alpha)), num(p), tCi(mean, se, df, alpha, tail), structOf({ tstat: num(t), df: num(df), sd: num(sd) })];
  },
  ttest2(args) {
    const x = dataVec(args[0]), y = dataVec(args[1]); const o = opts(args, 2); const alpha = o.alpha ? toNum(o.alpha) : 0.05; const tail = tailOf(o);
    const vt = o.vartype ? toStr(o.vartype).toLowerCase() : 'equal';
    const nx = x.length, ny = y.length; const mx = meanA(x), my = meanA(y); const vx = varA(x), vy = varA(y); const d = mx - my;
    let df, se, sd;
    if (vt === 'equal') { df = nx + ny - 2; const sp = ((nx - 1) * vx + (ny - 1) * vy) / df; sd = Math.sqrt(sp); se = sd * Math.sqrt(1 / nx + 1 / ny); }
    else if (vt === 'unequal') { const a = vx / nx, b = vy / ny; se = Math.sqrt(a + b); df = (a + b) ** 2 / (a * a / (nx - 1) + b * b / (ny - 1)); sd = tensor('double', [1, 2], [Math.sqrt(vx), Math.sqrt(vy)]); }
    else throw E('ttest2:badVartype', "Vartype must be 'equal' or 'unequal'.");
    const t = d / se; const p = pval(t, tail, (z) => tCdf(z, df));
    return [num(hOf(p, alpha)), num(p), tCi(d, se, df, alpha, tail), structOf({ tstat: num(t), df: num(df), sd: typeof sd === 'number' ? num(sd) : sd })];
  },
  ztest(args) {
    const x = dataVec(args[0]); const m = n1(args[1], 0); const sigma = toNum(args[2], 'sigma');
    const o = opts(args, 3); const alpha = o.alpha ? toNum(o.alpha) : 0.05; const tail = tailOf(o);
    const n = x.length; const mean = meanA(x); const se = sigma / Math.sqrt(n); const z = (mean - m) / se;
    const p = pval(z, tail, Phi);
    let ci; if (tail === 'both') { const c = norminv(1 - alpha / 2); ci = ci2(mean - c * se, mean + c * se); } else { const c = norminv(1 - alpha); ci = tail === 'right' ? ci2(mean - c * se, Infinity) : ci2(-Infinity, mean + c * se); }
    return [num(hOf(p, alpha)), num(p), ci, num(z)];
  },
  vartest(args) {
    const x = dataVec(args[0]); const v0 = toNum(args[1], 'v'); const o = opts(args, 2); const alpha = o.alpha ? toNum(o.alpha) : 0.05; const tail = tailOf(o);
    const n = x.length, df = n - 1; const s2 = varA(x); const chi = df * s2 / v0;
    const p = pval(chi, tail, (c) => chi2Cdf(c, df));
    let ci;
    if (tail === 'both') ci = ci2(df * s2 / chi2Inv(1 - alpha / 2, df), df * s2 / chi2Inv(alpha / 2, df));
    else if (tail === 'right') ci = ci2(df * s2 / chi2Inv(1 - alpha, df), Infinity); else ci = ci2(0, df * s2 / chi2Inv(alpha, df));
    return [num(hOf(p, alpha)), num(p), ci, structOf({ chisqstat: num(chi), df: num(df) })];
  },
  vartest2(args) {
    const x = dataVec(args[0]), y = dataVec(args[1]); const o = opts(args, 2); const alpha = o.alpha ? toNum(o.alpha) : 0.05; const tail = tailOf(o);
    const d1 = x.length - 1, d2 = y.length - 1; const r = varA(x) / varA(y);
    const p = pval(r, tail, (f) => 1 - fCdfU(f, d1, d2));
    let ci;
    if (tail === 'both') ci = ci2(r / fInv(1 - alpha / 2, d1, d2), r / fInv(alpha / 2, d1, d2));
    else if (tail === 'right') ci = ci2(r / fInv(1 - alpha, d1, d2), Infinity); else ci = ci2(0, r / fInv(alpha, d1, d2));
    return [num(hOf(p, alpha)), num(p), ci, structOf({ fstat: num(r), df1: num(d1), df2: num(d2) })];
  },
  chi2gof(args, nargout, ctx) {
    const x = dataVec(args[0]);
    const o = nv(args, 1, ['NBins', 'Ctrs', 'Edges', 'CDF', 'Expected', 'NParams', 'EMin', 'Frequency', 'Alpha']);
    const alpha = o.alpha ? toNum(o.alpha) : 0.05; const emin = o.emin ? toNum(o.emin) : 5;
    let edges, Obs, Exp, nparams = o.nparams ? toNum(o.nparams) : null;
    const freq = o.frequency ? Array.from(F(o.frequency)) : null;
    const total = freq ? sumA(freq) : x.length;
    if (o.expected) {
      Exp = Array.from(F(o.expected)); const ctrs = o.ctrs ? Array.from(F(o.ctrs)) : Exp.map((_, i) => i);
      Obs = ctrs.map(() => 0); x.forEach((v, i) => { let b = 0, best = Infinity; ctrs.forEach((c, j) => { const d = Math.abs(v - c); if (d < best) { best = d; b = j; } }); Obs[b] += freq ? freq[i] : 1; });
      edges = ctrs.slice(); if (nparams == null) nparams = 0;
    } else {
      if (o.edges) edges = Array.from(F(o.edges));
      else if (o.ctrs) { const c = Array.from(F(o.ctrs)); edges = [c[0] - (c[1] - c[0]) / 2]; for (let i = 0; i < c.length - 1; i++) edges.push((c[i] + c[i + 1]) / 2); edges.push(c[c.length - 1] + (c[c.length - 1] - c[c.length - 2]) / 2); }
      else { const nb = o.nbins ? toNum(o.nbins) : 10; const lo = Math.min(...x), hi = Math.max(...x); edges = Array.from({ length: nb + 1 }, (_, i) => (i === nb ? hi : lo + (hi - lo) * i / nb)); }
      const nb = edges.length - 1; Obs = new Array(nb).fill(0);
      x.forEach((v, i) => { let b = edges.findIndex((e, j) => j < nb && v >= e && (v < edges[j + 1] || (j === nb - 1 && v <= edges[j + 1]))); if (b >= 0) Obs[b] += freq ? freq[i] : 1; });
      let cdf;
      if (o.cdf) {
        const c = o.cdf;
        if (isDistObj(c)) cdf = (t) => evalCdf(c, t, false);
        else if (isFuncHandle(c)) cdf = (t) => callArr(ctx, c, [num(t)])[0];
        else if (c.cls === 'cell') { const fh = c.data[0]; const extra = c.data.slice(1); cdf = (t) => callArr(ctx, fh, [num(t), ...extra])[0]; if (nparams == null) nparams = extra.length; }
        else throw E('chi2gof:badCDF', 'CDF must be a function handle, a cell array or a distribution object.');
        if (nparams == null) nparams = isDistObj(c) && c._fit ? c._p.length : 0;
      } else {
        const wx = freq ? x.flatMap((v, i) => new Array(freq[i]).fill(v)) : x;
        const m = meanA(wx), s = stdA(wx); cdf = (t) => Phi((t - m) / s); if (nparams == null) nparams = 2;
      }
      const P = edges.map((e, i) => (i === 0 ? 0 : i === edges.length - 1 ? 1 : cdf(e)));
      Exp = Obs.map((_, i) => total * (P[i + 1] - P[i]));
    }
    // pool bins with small expected counts from the tails inward
    let Oc = Obs.slice(), Ec = Exp.slice(), Ed = edges.slice();
    const pool = () => {
      while (Ec.length > 1 && Ec[0] < emin) { Ec[1] += Ec[0]; Oc[1] += Oc[0]; Ec.shift(); Oc.shift(); Ed.splice(1, 1); }
      while (Ec.length > 1 && Ec[Ec.length - 1] < emin) { const n = Ec.length; Ec[n - 2] += Ec[n - 1]; Oc[n - 2] += Oc[n - 1]; Ec.pop(); Oc.pop(); Ed.splice(Ed.length - 2, 1); }
      for (let i = 1; i < Ec.length - 1; i++) if (Ec[i] < emin) { const j = Ec[i - 1] < Ec[i + 1] ? i - 1 : i + 1; Ec[j] += Ec[i]; Oc[j] += Oc[i]; Ec.splice(i, 1); Oc.splice(i, 1); Ed.splice(Math.max(i, j), 1); i--; }
    };
    if (!o.expected) pool();
    const chi = Oc.reduce((s, ob, i) => s + (Ec[i] > 0 ? (ob - Ec[i]) ** 2 / Ec[i] : 0), 0);
    const df = Oc.length - 1 - nparams;
    const p = df > 0 ? 1 - chi2Cdf(chi, df) : NaN;
    const rv = (a) => tensor('double', [1, a.length], Float64Array.from(a));
    return [num(hOf(p, alpha)), num(p), structOf({ chi2stat: num(chi), df: num(df), edges: rv(Ed), O: rv(Oc), E: rv(Ec) })];
  },
  kstest(args) {
    const x = sorted(dataVec(args[0])); const n = x.length;
    const o = nv(args, 1, ['CDF', 'Alpha', 'Tail']); const alpha = o.alpha ? toNum(o.alpha) : 0.05;
    let tail = o.tail ? toStr(o.tail).toLowerCase() : 'unequal'; if (tail === 'both') tail = 'unequal'; if (tail === 'right') tail = 'larger'; if (tail === 'left') tail = 'smaller';
    let F0 = (t) => Phi(t);
    if (o.cdf) {
      const c = o.cdf;
      if (isDistObj(c)) F0 = (t) => evalCdf(c, t, false);
      else { const R = toRows(c); const xs = R.map((r) => r[0]), cs = R.map((r) => r[1]); F0 = (t) => { let k = -1; for (let i = 0; i < xs.length; i++) if (Math.abs(xs[i] - t) <= 1e-12 * Math.max(1, Math.abs(t))) { k = i; break; } if (k < 0) throw E('kstest:badCDF', 'The hypothesized CDF must contain every data value in its first column.'); return cs[k]; }; }
    }
    let dp = 0, dm = 0;
    for (let i = 0; i < n; i++) { const f = F0(x[i]); let j = i; while (j + 1 < n && x[j + 1] === x[i]) j++; dp = Math.max(dp, (j + 1) / n - f); dm = Math.max(dm, f - i / n); i = j; }
    let ks, p;
    if (tail === 'unequal') { ks = Math.max(dp, dm); p = ksPvalTwo(n, ks); }
    else { ks = tail === 'larger' ? dp : dm; p = ksPvalOne(n, ks); }
    const cv = NaN;
    return [num(hOf(p, alpha)), num(p), num(ks), num(cv)];
  },
  kstest2(args) {
    const x = sorted(dataVec(args[0])), y = sorted(dataVec(args[1]));
    const o = nv(args, 2, ['Alpha', 'Tail']); const alpha = o.alpha ? toNum(o.alpha) : 0.05;
    let tail = o.tail ? toStr(o.tail).toLowerCase() : 'unequal'; if (tail === 'both') tail = 'unequal';
    const n1_ = x.length, n2 = y.length; const all = sorted([...x, ...y]);
    let d = 0, dl = 0, dg = 0; let i = 0, j = 0;
    for (const v of all) { while (i < n1_ && x[i] <= v) i++; while (j < n2 && y[j] <= v) j++; const diff = i / n1_ - j / n2; d = Math.max(d, Math.abs(diff)); dl = Math.max(dl, diff); dg = Math.max(dg, -diff); }
    const ne = n1_ * n2 / (n1_ + n2);
    let ks = tail === 'unequal' ? d : tail === 'larger' || tail === 'right' ? dg : dl;
    let p;
    if (tail === 'unequal') { const lam = Math.max((Math.sqrt(ne) + 0.12 + 0.11 / Math.sqrt(ne)) * ks, 0); p = qks(lam); }
    else p = Math.exp(-2 * ne * ks * ks);
    return [num(hOf(p, alpha)), num(Math.min(Math.max(p, 0), 1)), num(ks)];
  },
  ranksum(args) {
    const x = dataVec(args[0]), y = dataVec(args[1]);
    const o = args[2] && !isText(args[2]) ? { alpha: args[2] } : nv(args, 2, ['Alpha', 'Method', 'Tail']);
    const alpha = o.alpha ? toNum(o.alpha) : 0.05; const tail = tailOf(o);
    const nx = x.length, ny = y.length; const ns = Math.min(nx, ny);
    const xFirst = nx <= ny; const small = xFirst ? x : y; const all = xFirst ? [...x, ...y] : [...y, ...x];
    const { r, tieSum } = tiedRank(all); let w = 0; for (let i = 0; i < ns; i++) w += r[i];
    let method = o.method ? toStr(o.method).toLowerCase() : (ns < 10 && nx + ny < 20 ? 'exact' : 'approximate');
    const N = nx + ny; const mean = ns * (N + 1) / 2;
    let p, zval = null;
    // tail is about x relative to y; flip when the small sample is y
    const t = xFirst ? tail : tail === 'right' ? 'left' : tail === 'left' ? 'right' : 'both';
    if (method === 'exact') {
      const dist = subsetSumDist(Array.from(r, (v) => Math.round(2 * v)), ns);
      const w2 = Math.round(2 * w); const plo = dist.le(w2), phi = dist.ge(w2);
      p = t === 'right' ? phi : t === 'left' ? plo : Math.min(1, 2 * Math.min(plo, phi));
    } else {
      const sd = Math.sqrt(nx * ny / 12 * (N + 1 - tieSum / (N * (N - 1))));
      const cc = t === 'both' ? 0.5 * Math.sign(w - mean) : t === 'right' ? 0.5 : -0.5;
      const z = (w - mean - cc) / sd; zval = xFirst ? z : -z;
      p = t === 'right' ? 1 - Phi(z) : t === 'left' ? Phi(z) : Math.min(1, 2 * Phi(-Math.abs(z)));
    }
    const st = zval == null ? structOf({ ranksum: num(w) }) : structOf({ zval: num(zval), ranksum: num(w) });
    return [num(p), num(hOf(p, alpha)), st];
  },
  signrank(args) {
    let x = Array.from(F(args[0])); let k = 1;
    if (args[1] != null && !isText(args[1])) { const y = Array.from(F(args[1])); x = y.length === 1 ? x.map((v) => v - y[0]) : x.map((v, i) => v - y[i]); k = 2; }
    const o = args[k] && !isText(args[k]) ? { alpha: args[k] } : nv(args, k, ['Alpha', 'Method', 'Tail']);
    const alpha = o.alpha ? toNum(o.alpha) : 0.05; const tail = tailOf(o);
    const d = x.filter((v) => !Number.isNaN(v) && v !== 0); const n = d.length;
    const { r, tieSum } = tiedRank(d.map(Math.abs));
    let w = 0; d.forEach((v, i) => { if (v > 0) w += r[i]; });
    const method = o.method ? toStr(o.method).toLowerCase() : n <= 15 ? 'exact' : 'approximate';
    let p, zval = null;
    if (n === 0) p = 1;
    else if (method === 'exact') {
      const dist = signDist(Array.from(r, (v) => Math.round(2 * v)));
      const w2 = Math.round(2 * w); const plo = dist.le(w2), phi = dist.ge(w2);
      p = tail === 'right' ? phi : tail === 'left' ? plo : Math.min(1, 2 * Math.min(plo, phi));
    } else {
      const mean = n * (n + 1) / 4; const sd = Math.sqrt(n * (n + 1) * (2 * n + 1) / 24 - tieSum / 48);
      const cc = tail === 'both' ? 0.5 * Math.sign(w - mean) : tail === 'right' ? 0.5 : -0.5;
      const z = (w - mean - cc) / sd; zval = z;
      p = tail === 'right' ? 1 - Phi(z) : tail === 'left' ? Phi(z) : Math.min(1, 2 * Phi(-Math.abs(z)));
    }
    const st = zval == null ? structOf({ signedrank: num(w) }) : structOf({ zval: num(zval), signedrank: num(w) });
    return [num(p), num(hOf(p, alpha)), st];
  },
  signtest(args) {
    let x = Array.from(F(args[0])); let k = 1;
    if (args[1] != null && !isText(args[1])) { const y = Array.from(F(args[1])); x = y.length === 1 ? x.map((v) => v - y[0]) : x.map((v, i) => v - y[i]); k = 2; }
    const o = args[k] && !isText(args[k]) ? { alpha: args[k] } : nv(args, k, ['Alpha', 'Method', 'Tail']);
    const alpha = o.alpha ? toNum(o.alpha) : 0.05; const tail = tailOf(o);
    const d = x.filter((v) => !Number.isNaN(v) && v !== 0); const n = d.length; const sp = d.filter((v) => v > 0).length; const sm = n - sp;
    const B = (k) => DIST.bino.cdf(k, [n, 0.5]);
    const p = tail === 'right' ? 1 - B(sp - 1) : tail === 'left' ? B(sp) : Math.min(1, 2 * B(Math.min(sp, sm)));
    return [num(p), num(hOf(p, alpha)), structOf({ sign: num(sp) })];
  },
  anova1(args, nargout, ctx) {
    const X = args[0]; const dims = X.dims || [1, 1];
    let groupsIdx, gnames;
    const disp = args[2] && isText(args[2]) ? toStr(args[2]).toLowerCase() : 'on';
    let vals = Array.from(F(X));
    if (args[1] && !isEmptyV(args[1])) {
      const g = groups(args[1]);
      if (dims[0] > 1 && dims[1] > 1) { // columns as groups with names
        groupsIdx = vals.map((_, i) => g.idx[Math.floor(i / dims[0])]); gnames = g.names;
      } else { groupsIdx = Array.from(g.idx); gnames = g.names; }
    } else if (dims[0] === 1 || dims[1] === 1) { groupsIdx = vals.map(() => 0); gnames = ['1']; }
    else { groupsIdx = vals.map((_, i) => Math.floor(i / dims[0])); gnames = Array.from({ length: dims[1] }, (_, i) => String(i + 1)); }
    const k = gnames.length; const sums = new Array(k).fill(0), cnt = new Array(k).fill(0);
    vals.forEach((v, i) => { const g = groupsIdx[i]; if (g < 0 || Number.isNaN(v)) return; sums[g] += v; cnt[g]++; });
    const means = sums.map((s, i) => s / cnt[i]); const N = sumA(cnt); const gm = sumA(sums) / N;
    let ssb = 0, ssw = 0; for (let g = 0; g < k; g++) if (cnt[g]) ssb += cnt[g] * (means[g] - gm) ** 2;
    vals.forEach((v, i) => { const g = groupsIdx[i]; if (g < 0 || Number.isNaN(v)) return; ssw += (v - means[g]) ** 2; });
    const kk = cnt.filter((c) => c > 0).length; const dfb = kk - 1, dfw = N - kk; const msb = ssb / dfb, msw = ssw / dfw; const Fv = msb / msw;
    const p = dfw > 0 ? fCdfU(Fv, dfb, dfw) : NaN;
    const tbl = anovaTable([['Groups', ssb, dfb, msb, Fv, p], ['Error', ssw, dfw, msw], ['Total', ssb + ssw, N - 1]]);
    if (disp !== 'off') ctx.out(anovaText([['Groups', ssb, dfb, msb, Fv, p], ['Error', ssw, dfw, msw], ['Total', ssb + ssw, N - 1]]));
    const stats = structOf({ gnames: cellStr(gnames, [k, 1]), n: tensor('double', [1, k], cnt), source: str('anova1'), means: tensor('double', [1, k], means), df: num(dfw), s: num(Math.sqrt(msw)) });
    return [num(p), tbl, stats];
  },
  anova2(args, nargout, ctx) {
    const R = toRows(args[0]); const reps = n1(args[1], 1); const disp = args[2] && isText(args[2]) ? toStr(args[2]).toLowerCase() : 'on';
    const nr = R.length, c = R[0].length; if (nr % reps) throw E('anova2:badReps', 'The number of rows must be a multiple of REPS.');
    const r = nr / reps; const N = nr * c; let gm = 0; R.forEach((row) => row.forEach((v) => { gm += v; })); gm /= N;
    const colM = R[0].map((_, j) => meanA(R.map((row) => row[j])));
    const rowM = Array.from({ length: r }, (_, i) => meanA(R.slice(i * reps, (i + 1) * reps).flat()));
    const cell_ = Array.from({ length: r }, (_, i) => R[0].map((_, j) => meanA(R.slice(i * reps, (i + 1) * reps).map((row) => row[j]))));
    const ssc = r * reps * sumA(colM.map((m) => (m - gm) ** 2)); const ssr = c * reps * sumA(rowM.map((m) => (m - gm) ** 2));
    let sst = 0; R.forEach((row) => row.forEach((v) => { sst += (v - gm) ** 2; }));
    const dfc = c - 1, dfr = r - 1;
    let rows, p;
    if (reps > 1) {
      let sse = 0; R.forEach((row, ii) => row.forEach((v, j) => { sse += (v - cell_[Math.floor(ii / reps)][j]) ** 2; }));
      const ssi = sst - ssc - ssr - sse; const dfi = dfc * dfr, dfe = N - r * c; const mse = sse / dfe;
      const Fc = (ssc / dfc) / mse, Fr = (ssr / dfr) / mse, Fi = (ssi / dfi) / mse;
      p = [fCdfU(Fc, dfc, dfe), fCdfU(Fr, dfr, dfe), fCdfU(Fi, dfi, dfe)];
      rows = [['Columns', ssc, dfc, ssc / dfc, Fc, p[0]], ['Rows', ssr, dfr, ssr / dfr, Fr, p[1]], ['Interaction', ssi, dfi, ssi / dfi, Fi, p[2]], ['Error', sse, dfe, mse], ['Total', sst, N - 1]];
    } else {
      const sse = sst - ssc - ssr; const dfe = dfc * dfr; const mse = sse / dfe;
      const Fc = (ssc / dfc) / mse, Fr = (ssr / dfr) / mse;
      p = [fCdfU(Fc, dfc, dfe), fCdfU(Fr, dfr, dfe)];
      rows = [['Columns', ssc, dfc, ssc / dfc, Fc, p[0]], ['Rows', ssr, dfr, ssr / dfr, Fr, p[1]], ['Error', sse, dfe, mse], ['Total', sst, N - 1]];
    }
    if (disp !== 'off') ctx.out(anovaText(rows));
    const stats = structOf({ source: str('anova2'), sigmasq: num(rows[rows.length - 2][3]), colmeans: tensor('double', [1, c], colM), coln: num(r * reps), rowmeans: tensor('double', [1, r], rowM), rown: num(c * reps), inter: num(reps > 1 ? 1 : 0), pval: num(reps > 1 ? p[2] : NaN), df: num(rows[rows.length - 2][2]) });
    return [tensor('double', [1, p.length], p), anovaTable(rows), stats];
  },
  kruskalwallis(args, nargout, ctx) {
    const X = args[0]; const dims = X.dims || [1, 1]; const vals = Array.from(F(X));
    let gi, gnames;
    if (args[1] && !isEmptyV(args[1])) { const g = groups(args[1]); gi = dims[0] > 1 && dims[1] > 1 ? vals.map((_, i) => g.idx[Math.floor(i / dims[0])]) : Array.from(g.idx); gnames = g.names; }
    else { gi = vals.map((_, i) => Math.floor(i / dims[0])); gnames = Array.from({ length: dims[1] }, (_, i) => String(i + 1)); }
    const keep = vals.map((v, i) => !Number.isNaN(v) && gi[i] >= 0); const v2 = vals.filter((_, i) => keep[i]); const g2 = gi.filter((_, i) => keep[i]);
    const { r, tieSum } = tiedRank(v2); const N = v2.length; const k = gnames.length;
    const rs = new Array(k).fill(0), cnt = new Array(k).fill(0); g2.forEach((g, i) => { rs[g] += r[i]; cnt[g]++; });
    let ssb = 0; for (let g = 0; g < k; g++) if (cnt[g]) ssb += cnt[g] * (rs[g] / cnt[g] - (N + 1) / 2) ** 2;
    let H_ = 12 * ssb / (N * (N + 1)); H_ /= 1 - tieSum / (N ** 3 - N);
    const df = cnt.filter((c) => c > 0).length - 1; const p = 1 - chi2Cdf(H_, df);
    const disp = args[2] && isText(args[2]) ? toStr(args[2]).toLowerCase() : 'on';
    const sst = N * (N * N - 1) / 12 * (1 - tieSum / (N ** 3 - N)); const ssbr = ssb;
    const rows = [['Groups', ssbr, df, ssbr / df, H_, p], ['Error', sst - ssbr, N - 1 - df, (sst - ssbr) / (N - 1 - df)], ['Total', sst, N - 1]];
    if (disp !== 'off') ctx.out(anovaText(rows, 'Chi-sq', 'Prob>Chi-sq'));
    return [num(p), anovaTable(rows, 'Chi-sq', 'Prob>Chi-sq'), structOf({ gnames: cellStr(gnames, [k, 1]), n: tensor('double', [1, k], cnt), source: str('kruskalwallis'), meanranks: tensor('double', [1, k], rs.map((s, i) => s / cnt[i])), sumt: num(tieSum) })];
  },
};

function anovaTable(rows, fname = 'F', pname = 'Prob>F') {
  const m = rows.length + 1; const head = ['Source', 'SS', 'df', 'MS', fname, pname];
  const data = new Array(m * 6);
  for (let j = 0; j < 6; j++) data[j * m] = str(head[j]);
  rows.forEach((r, i) => { for (let j = 0; j < 6; j++) data[(i + 1) + j * m] = j === 0 ? str(r[0]) : r[j] === undefined ? empty() : num(r[j]); });
  return cell([m, 6], data);
}
function anovaText(rows, fname = 'F', pname = 'Prob>F') {
  const head = ['Source', 'SS', 'df', 'MS', fname, pname];
  const cells = rows.map((r) => head.map((_, j) => (j === 0 ? r[0] : r[j] === undefined ? '' : fmtG(r[j], 5))));
  const w = head.map((h, j) => Math.max(h.length, ...cells.map((c) => c[j].length)) + 2);
  const line = (c) => c.map((s, j) => (j === 0 ? s.padEnd(w[j]) : s.padStart(w[j]))).join('');
  return '\n' + line(head) + '\n' + '-'.repeat(w.reduce((a, b) => a + b, 0)) + '\n' + cells.map(line).join('\n') + '\n\n';
}
/** Distribution of the sum of a random size-k subset of integer scores (all subsets equally likely). */
function subsetSumDist(scores, k) {
  const total = sumA(scores);
  // dp[j] = Map(sum → count) over subsets of size j
  let dp = Array.from({ length: k + 1 }, () => new Map()); dp[0].set(0, 1);
  for (const s of scores) for (let j = k; j >= 1; j--) for (const [sum, c] of dp[j - 1]) dp[j].set(sum + s, (dp[j].get(sum + s) || 0) + c);
  const m = dp[k]; let tot = 0; for (const c of m.values()) tot += c;
  return { le: (w) => { let s = 0; for (const [v, c] of m) if (v <= w) s += c; return s / tot; }, ge: (w) => { let s = 0; for (const [v, c] of m) if (v >= w) s += c; return s / tot; }, total };
}
function signDist(scores) {
  let m = new Map([[0, 1]]);
  for (const s of scores) { const nm = new Map(); for (const [v, c] of m) { nm.set(v, (nm.get(v) || 0) + c); nm.set(v + s, (nm.get(v + s) || 0) + c); } m = nm; }
  const tot = 2 ** scores.length;
  return { le: (w) => { let s = 0; for (const [v, c] of m) if (v <= w) s += c; return s / tot; }, ge: (w) => { let s = 0; for (const [v, c] of m) if (v >= w) s += c; return s / tot; } };
}
/** Kolmogorov distribution complement Q(lambda). */
function qks(lam) { if (lam < 1e-8) return 1; let s = 0; for (let j = 1; j <= 200; j++) { const t = 2 * (j % 2 ? 1 : -1) * Math.exp(-2 * j * j * lam * lam); s += t; if (Math.abs(t) < 1e-18) break; } return Math.min(Math.max(s, 0), 1); }
/** Exact two-sided one-sample KS p-value (Marsaglia–Tsang–Wang) with the reference's large-sample shortcut. */
function ksPvalTwo(n, d) {
  const s = n * d * d;
  if (s > 7.24 || (s > 3.76 && n > 99)) return Math.min(1, 2 * Math.exp(-(2.000071 + 0.331 / Math.sqrt(n) + 1.409 / n) * s));
  return Math.min(1, Math.max(0, 1 - mtw(n, d)));
}
function mtw(n, d) {
  const k = Math.floor(n * d) + 1; const m = 2 * k - 1; const h = k - n * d;
  const Hm = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => (i - j + 1 < 0 ? 0 : 1)));
  for (let i = 0; i < m; i++) { Hm[i][0] -= Math.pow(h, i + 1); Hm[m - 1][i] -= Math.pow(h, m - i); }
  Hm[m - 1][0] += 2 * h - 1 > 0 ? Math.pow(2 * h - 1, m) : 0;
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) if (i - j + 1 > 0) for (let g = 1; g <= i - j + 1; g++) Hm[i][j] /= g;
  // matrix power with scaling
  const mul = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, v, t) => s + v * B[t][j], 0)));
  let eQ = 0; let Q = null; let P = Hm; let eP = 0; let e = n;
  while (e > 0) {
    if (e & 1) { if (!Q) { Q = P.map((r) => r.slice()); eQ = eP; } else { Q = mul(Q, P); eQ += eP; if (Q[k - 1][k - 1] > 1e140) { Q = Q.map((r) => r.map((v) => v * 1e-140)); eQ += 140; } } }
    e >>= 1; if (e) { P = mul(P, P); eP *= 2; if (P[k - 1][k - 1] > 1e140) { P = P.map((r) => r.map((v) => v * 1e-140)); eP += 140; } }
  }
  let s = Q[k - 1][k - 1];
  for (let i = 1; i <= n; i++) { s = s * i / n; if (s < 1e-140) { s *= 1e140; eQ -= 140; } }
  return s * Math.pow(10, eQ);
}
function ksPvalOne(n, d) {
  // Smirnov one-sided exact formula
  if (d <= 0) return 1; if (d >= 1) return 0;
  let s = 0; const jmax = Math.floor(n * (1 - d));
  for (let j = 0; j <= jmax; j++) {
    const lc = lgam(n + 1) - lgam(j + 1) - lgam(n - j + 1);
    s += Math.exp(lc + (n - j) * Math.log(1 - d - j / n) + (j - 1) * Math.log(d + j / n));
  }
  return Math.min(1, d * s);
}
function lgam(x) { let s = 0; for (let i = 2; i < x; i++) s += Math.log(i); return s; }

const help = {
  ttest: H('One-sample and paired-sample t-test.', '단일 표본 및 대응 표본 t 검정.', ['h = ttest(x)', 'h = ttest(x, m)', 'h = ttest(x, y)', '[h, p, ci, stats] = ttest(___, Name, Value)']),
  ttest2: H('Two-sample t-test (equal or unequal variances).', '두 표본 t 검정 (등분산 또는 이분산).', ['h = ttest2(x, y)', "[h, p, ci, stats] = ttest2(x, y, 'Vartype', 'unequal')"]),
  ztest: H('z-test for the mean with known standard deviation.', '표준편차를 아는 평균에 대한 z 검정.', ['h = ztest(x, m, sigma)', '[h, p, ci, zval] = ztest(___, Name, Value)']),
  vartest: H('Chi-square variance test.', '카이제곱 분산 검정.', ['h = vartest(x, v)', '[h, p, ci, stats] = vartest(___)']),
  vartest2: H('Two-sample F-test for equal variances.', '두 표본 등분산 F 검정.', ['h = vartest2(x, y)', '[h, p, ci, stats] = vartest2(___)']),
  chi2gof: H('Chi-square goodness-of-fit test.', '카이제곱 적합도 검정.', ['h = chi2gof(x)', '[h, p, stats] = chi2gof(x, Name, Value)']),
  kstest: H('One-sample Kolmogorov–Smirnov test (standard normal by default).', '단일 표본 콜모고로프–스미르노프 검정 (기본 표준 정규).', ['h = kstest(x)', "[h, p, ksstat] = kstest(x, 'CDF', pd)"]),
  kstest2: H('Two-sample Kolmogorov–Smirnov test.', '두 표본 콜모고로프–스미르노프 검정.', ['h = kstest2(x1, x2)', '[h, p, ks2stat] = kstest2(___)']),
  ranksum: H('Wilcoxon rank sum test (Mann–Whitney U).', '윌콕슨 순위합 검정 (만–휘트니 U).', ['p = ranksum(x, y)', '[p, h, stats] = ranksum(x, y, Name, Value)']),
  signrank: H('Wilcoxon signed rank test.', '윌콕슨 부호 순위 검정.', ['p = signrank(x)', 'p = signrank(x, m)', '[p, h, stats] = signrank(x, y)']),
  signtest: H('Sign test.', '부호 검정.', ['p = signtest(x)', '[p, h, stats] = signtest(x, y)']),
  anova1: H("One-way analysis of variance; prints the table unless 'off'.", "일원 분산 분석; 'off'가 아니면 표를 출력.", ['p = anova1(y)', "[p, tbl, stats] = anova1(y, group, 'off')"]),
  anova2: H('Two-way analysis of variance.', '이원 분산 분석.', ['p = anova2(y, reps)', "[p, tbl, stats] = anova2(y, reps, 'off')"]),
  kruskalwallis: H('Kruskal–Wallis rank test.', '크러스컬–월리스 순위 검정.', ['p = kruskalwallis(x)', "[p, tbl, stats] = kruskalwallis(x, group, 'off')"]),
};
export { builtins, help };
