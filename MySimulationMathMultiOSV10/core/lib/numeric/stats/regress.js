// Linear regression: regress and the LinearModel object made by fitlm.
import { tensor, num, str, empty, object, isText, toStr, toNum, structOf, isObject, cell } from '../../../value.js';
import { E, F, H, n1, isEmptyV, nv, toRows, fromRows, fmtG, cellStr, tryCall } from '../_util.js';
import { qr } from '../_kernels.js';
import { tCdf, tInv } from './dist.js';
import { invM, meanA } from './_s.js';
import { betainc } from '../_kernels.js';

const fCdfU = (x, a, b) => (x <= 0 ? 1 : betainc(a * x / (a * x + b), a / 2, b / 2, true));

/** Least squares by Householder QR with column dropping for rank deficiency. Returns {b, XtXinv, rank, keep}. */
export function lsq(X, y) {
  const n = X.length, p = X[0].length;
  const { Q, R } = qr(X);
  const tol = Math.max(n, p) * 2.2e-16 * Math.max(...R.slice(0, Math.min(n, p)).map((r, i) => Math.abs(r[i])), 0);
  const keep = []; for (let j = 0; j < Math.min(n, p); j++) if (Math.abs(R[j][j]) > tol) keep.push(j);
  let Xk = keep.length === p ? X : X.map((r) => keep.map((j) => r[j]));
  const { Q: Q2, R: R2 } = keep.length === p ? { Q, R } : qr(Xk);
  const k = keep.length; const qty = new Array(k).fill(0);
  for (let i = 0; i < k; i++) for (let t = 0; t < n; t++) qty[i] += Q2[t][i] * y[t];
  const bk = new Array(k).fill(0); for (let i = k - 1; i >= 0; i--) { let s = qty[i]; for (let j = i + 1; j < k; j++) s -= R2[i][j] * bk[j]; bk[i] = s / R2[i][i]; }
  const b = new Array(p).fill(0); keep.forEach((j, i) => { b[j] = bk[i]; });
  // (R'R)^-1 for kept columns
  const Rk = R2.slice(0, k).map((r) => r.slice(0, k));
  const Rinv = Rk.map(() => new Array(k).fill(0));
  for (let j = 0; j < k; j++) { Rinv[j][j] = 1 / Rk[j][j]; for (let i = j - 1; i >= 0; i--) { let s = 0; for (let t = i + 1; t <= j; t++) s += Rk[i][t] * Rinv[t][j]; Rinv[i][j] = -s / Rk[i][i]; } }
  const Ck = Rinv.map((r, i) => Rinv.map((r2, j) => { let s = 0; for (let t = 0; t < k; t++) s += r[t] * r2[t]; return s; }));
  const C = Array.from({ length: p }, () => new Array(p).fill(0)); keep.forEach((a, i) => keep.forEach((c, j) => { C[a][c] = Ck[i][j]; }));
  return { b, C, rank: k, keep };
}

function regress(args, nargout) {
  const y = Array.from(F(args[0])); const X = toRows(args[1]); const alpha = n1(args[2], 0.05);
  if (X.length !== y.length) throw E('regress:InvalidData', 'The number of rows in Y must equal the number of rows in X.');
  const ok = y.map((v, i) => !Number.isNaN(v) && X[i].every((t) => !Number.isNaN(t)));
  const yy = y.filter((_, i) => ok[i]), XX = X.filter((_, i) => ok[i]);
  const n = yy.length, p = XX[0].length;
  const { b, C, rank } = lsq(XX, yy);
  const yhat = XX.map((r) => r.reduce((s, v, j) => s + v * b[j], 0)); const r = yy.map((v, i) => v - yhat[i]);
  const nu = Math.max(0, n - rank); const sse = r.reduce((s, v) => s + v * v, 0); const s2 = nu > 0 ? sse / nu : NaN;
  const tc = nu > 0 ? tInv(1 - alpha / 2, nu) : NaN;
  const bint = b.map((v, j) => { const se = Math.sqrt(C[j][j] * s2); return [v - tc * se, v + tc * se]; });
  // studentized residual intervals
  const hdiag = XX.map((row) => { let s = 0; for (let a = 0; a < p; a++) for (let c = 0; c < p; c++) s += row[a] * C[a][c] * row[c]; return s; });
  const tc1 = nu > 1 ? tInv(1 - alpha / 2, nu - 1) : NaN;
  const rint = r.map((ri, i) => { const si = Math.sqrt(Math.max(0, (sse - ri * ri / (1 - hdiag[i])) / (nu - 1))); const w = tc1 * si * Math.sqrt(1 - hdiag[i]); return [ri - w, ri + w]; });
  const ym = meanA(yy); const sst = yy.reduce((s, v) => s + (v - ym) ** 2, 0); const R2 = 1 - sse / sst;
  const Fv = (sst - sse) / (rank - 1) / s2; const pF = fCdfU(Fv, rank - 1, nu);
  const full = (vals) => { const o = new Float64Array(y.length).fill(NaN); let k = 0; ok.forEach((g, i) => { if (g) o[i] = vals[k++]; }); return o; };
  const rFull = full(r); const rintFull = [full(rint.map((t) => t[0])), full(rint.map((t) => t[1]))];
  return [
    tensor('double', [p, 1], b), fromRows(bint), tensor('double', [y.length, 1], rFull),
    tensor('double', [y.length, 2], Float64Array.from([...rintFull[0], ...rintFull[1]])),
    tensor('double', [1, 4], [R2, Fv, pF, s2]),
  ];
}

// ------------------------------------------------------------ LinearModel
function fitlm(args, nargout, ctx) {
  let X, y, names, yname = 'y';
  let k = 2;
  if (isObject(args[0]) && args[0].cls === 'table') {
    // table input: last variable is the response
    const t = args[0]; const vn = tryCall(ctx, 'properties', [t]) ? null : null; void vn;
    const varNames = t.varNames || (t.props && t.props.VariableNames && t.props.VariableNames.data && t.props.VariableNames.data.map((s) => toStr(s)));
    const cols = t.columns || t.vars || null;
    if (!varNames || !cols) throw E('fitlm:tableInput', 'Table input is not supported here; pass a predictor matrix and a response vector.');
    const cv = cols.map((c) => Array.from(F(c)));
    y = cv[cv.length - 1]; X = y.map((_, i) => cv.slice(0, -1).map((c) => c[i])); names = varNames.slice(0, -1); yname = varNames[varNames.length - 1]; k = 1;
  } else {
    X = toRows(args[0]); y = Array.from(F(args[1]));
    if (X.length === 1 && X[0].length === y.length && y.length > 1) X = X[0].map((v) => [v]);
  }
  const o = nv(args, k, ['Intercept', 'VarNames', 'PredictorVars', 'ResponseVar', 'Weights', 'RobustOpts', 'Exclude', 'CategoricalVars']);
  const modelSpec = args[k] && isText(args[k]) && !['intercept', 'varnames', 'predictorvars', 'responsevar', 'weights', 'exclude'].includes(toStr(args[k]).toLowerCase()) ? toStr(args[k]).toLowerCase() : 'linear';
  if (modelSpec !== 'linear') throw E('fitlm:modelSpec', `Model specification '${modelSpec}' is not supported; use 'linear'.`);
  const p0 = X[0].length;
  if (!names) names = Array.from({ length: p0 }, (_, i) => `x${i + 1}`);
  if (o.varnames) { const vn = o.varnames.cls === 'cell' ? o.varnames.data.map((s) => toStr(s)) : o.varnames.data; names = vn.slice(0, p0); if (vn.length > p0) yname = vn[p0]; }
  const intercept = o.intercept ? toNum(o.intercept) !== 0 : true;
  const ok = y.map((v, i) => !Number.isNaN(v) && X[i].every((t) => !Number.isNaN(t)));
  const yy = y.filter((_, i) => ok[i]); const XX = X.filter((_, i) => ok[i]).map((r) => (intercept ? [1, ...r] : r.slice()));
  const coefNames = intercept ? ['(Intercept)', ...names] : names.slice();
  const n = yy.length, p = XX[0].length;
  const { b, C, rank } = lsq(XX, yy);
  const fitted = XX.map((r) => r.reduce((s, v, j) => s + v * b[j], 0)); const res = yy.map((v, i) => v - fitted[i]);
  const dfe = n - rank; const sse = res.reduce((s, v) => s + v * v, 0); const mse = sse / dfe;
  const ym = meanA(yy); const sst = intercept ? yy.reduce((s, v) => s + (v - ym) ** 2, 0) : yy.reduce((s, v) => s + v * v, 0);
  const ssr = sst - sse;
  const se = b.map((_, j) => Math.sqrt(C[j][j] * mse)); const tstat = b.map((v, j) => v / se[j]);
  const pv = tstat.map((t) => 2 * tCdf(-Math.abs(t), dfe));
  const R2 = 1 - sse / sst; const R2a = 1 - (sse / dfe) / (sst / (n - (intercept ? 1 : 0)));
  const dfr = rank - (intercept ? 1 : 0); const Fv = (ssr / dfr) / mse; const pF = fCdfU(Fv, dfr, dfe);
  const col = (a) => tensor('double', [a.length, 1], Float64Array.from(a));
  let coefTable = null;
  const tbl = tryCall(ctx, 'table', [col(b), col(se), col(tstat), col(pv), str('VariableNames'), cellStr(['Estimate', 'SE', 'tStat', 'pValue']), str('RowNames'), cellStr(coefNames, [coefNames.length, 1])]);
  if (tbl && tbl[0]) coefTable = tbl[0];
  if (!coefTable) coefTable = structOf({ Estimate: col(b), SE: col(se), tStat: col(tstat), pValue: col(pv), RowNames: cellStr(coefNames, [coefNames.length, 1]) });
  const full = (vals) => { const out = new Float64Array(y.length).fill(NaN); let t = 0; ok.forEach((g, i) => { if (g) out[i] = vals[t++]; }); return out; };
  const loglik = -n / 2 * (Math.log(2 * Math.PI * sse / n) + 1);
  const props = {
    Coefficients: coefTable,
    CoefficientNames: cellStr(coefNames),
    CoefficientCovariance: tensor('double', [p, p], Float64Array.from(C.flatMap((r, i) => C.map((rr) => rr[i] * mse)))),
    NumCoefficients: num(p), NumEstimatedCoefficients: num(rank),
    NumObservations: num(n), NumPredictors: num(p0), NumVariables: num(p0 + 1),
    PredictorNames: cellStr(names), ResponseName: str(yname), VariableNames: cellStr([...names, yname]),
    DFE: num(dfe), SSE: num(sse), SST: num(sst), SSR: num(ssr), MSE: num(mse), RMSE: num(Math.sqrt(mse)),
    Rsquared: structOf({ Ordinary: num(R2), Adjusted: num(R2a) }),
    LogLikelihood: num(loglik),
    ModelCriterion: structOf({ AIC: num(-2 * loglik + 2 * (rank + 1)), BIC: num(-2 * loglik + Math.log(n) * (rank + 1)) }),
    Fitted: tensor('double', [y.length, 1], full(fitted)),
    Residuals: structOf({ Raw: tensor('double', [y.length, 1], full(res)) }),
    Formula: str(`${yname} ~ ${intercept ? '1' + names.map((s) => ' + ' + s).join('') : names.join(' + ')}`),
  };
  return object('LinearModel', props, { extra: { _lm: { b, C, mse, dfe, intercept, coefNames, se, tstat, pv, n, R2, R2a, Fv, pF, dfr, yname, names } } });
}
function lmPredict(args) {
  const m = args[0]._lm; let Xn = toRows(args[1]);
  if (Xn.length === 1 && Xn[0].length !== m.names.length && m.names.length === 1) Xn = Xn[0].map((v) => [v]);
  const o = nv(args, 2, ['Alpha', 'Prediction', 'Simultaneous']); const alpha = o.alpha ? toNum(o.alpha) : 0.05;
  const obs = o.prediction && toStr(o.prediction).toLowerCase() === 'observation';
  const tc = tInv(1 - alpha / 2, m.dfe);
  const yp = [], lo = [], hi = [];
  for (const r of Xn) {
    const x = m.intercept ? [1, ...r] : r; const v = x.reduce((s, t, j) => s + t * m.b[j], 0);
    let q = 0; for (let a = 0; a < x.length; a++) for (let c = 0; c < x.length; c++) q += x[a] * m.C[a][c] * x[c];
    const w = tc * Math.sqrt(m.mse * (q + (obs ? 1 : 0)));
    yp.push(v); lo.push(v - w); hi.push(v + w);
  }
  return [tensor('double', [yp.length, 1], Float64Array.from(yp)), tensor('double', [yp.length, 2], Float64Array.from([...lo, ...hi]))];
}
function lmDisplay(obj, name) {
  const m = obj._lm;
  const rows = m.coefNames.map((c, i) => [c, fmtG(m.b[i], 5), fmtG(m.se[i], 5), fmtG(m.tstat[i], 5), fmtG(m.pv[i], 5)]);
  const head = ['', 'Estimate', 'SE', 'tStat', 'pValue']; const w = head.map((h, j) => Math.max(h.length, ...rows.map((r) => r[j].length)) + 4);
  const fmtRow = (r) => '    ' + r.map((s, j) => (j === 0 ? s.padEnd(w[0]) : s.padStart(w[j]))).join('');
  let s = `${name} = \nLinear regression model:\n    ${m.yname} ~ ${m.intercept ? '1' + m.names.map((t) => ' + ' + t).join('') : m.names.join(' + ')}\n\nEstimated Coefficients:\n`;
  s += fmtRow(head) + '\n' + fmtRow(head.map((h) => (h ? '_'.repeat(h.length) : ''))) + '\n\n' + rows.map(fmtRow).join('\n') + '\n\n';
  s += `Number of observations: ${m.n}, Error degrees of freedom: ${m.dfe}\nRoot Mean Squared Error: ${fmtG(Math.sqrt(m.mse), 3)}\n`;
  s += `R-squared: ${fmtG(m.R2, 3)},  Adjusted R-Squared: ${fmtG(m.R2a, 3)}\n`;
  if (m.dfr > 0) s += `F-statistic vs. constant model: ${fmtG(m.Fv, 3)}, p-value = ${fmtG(m.pF, 3)}\n`;
  return s;
}
function coefCI(args) {
  const m = args[0]._lm; const alpha = n1(args[1], 0.05); const tc = tInv(1 - alpha / 2, m.dfe);
  return fromRows(m.b.map((v, j) => [v - tc * m.se[j], v + tc * m.se[j]]));
}

export const classes = {
  LinearModel: {
    props: ['Coefficients', 'CoefficientNames', 'CoefficientCovariance', 'NumCoefficients', 'NumEstimatedCoefficients', 'NumObservations', 'NumPredictors', 'NumVariables', 'PredictorNames', 'ResponseName', 'VariableNames', 'DFE', 'SSE', 'SST', 'SSR', 'MSE', 'RMSE', 'Rsquared', 'LogLikelihood', 'ModelCriterion', 'Fitted', 'Residuals', 'Formula'],
    construct(args, ctx) { return fitlm(args, 1, ctx); },
    methods: {
      predict: (args) => lmPredict(args),
      coefCI: (args) => coefCI(args),
      feval: (args) => { const rest = args.slice(1); const X = rest.length > 1 ? fromRows(F(rest[0]).length ? Array.from(F(rest[0])).map((_, i) => rest.map((r) => F(r)[i])) : []) : rest[0]; return lmPredict([args[0], X])[0]; },
    },
    display: lmDisplay,
  },
};
export const builtins = { regress, fitlm };
export const help = {
  regress: H('Multiple linear regression with confidence intervals and statistics [R2 F p errvar].', '신뢰 구간과 통계량 [R2 F p 오차분산]을 주는 다중 선형 회귀.', ['b = regress(y, X)', '[b, bint, r, rint, stats] = regress(y, X, alpha)']),
  fitlm: H('Fits a linear regression model (LinearModel object with Coefficients, Rsquared, predict).', '선형 회귀 모형을 맞춥니다 (Coefficients, Rsquared, predict 가 있는 LinearModel 객체).', ['mdl = fitlm(X, y)', "mdl = fitlm(X, y, 'Intercept', false)", "mdl = fitlm(X, y, 'VarNames', {'x1','y'})", 'ypred = predict(mdl, Xnew)']),
};
