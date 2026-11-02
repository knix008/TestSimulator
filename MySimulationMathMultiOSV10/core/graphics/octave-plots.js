// Octave-compatibility plot functions built from the existing primitives:
// comet / comet3, the ez* function plots, plotyy, pareto, plotmatrix, spy,
// gplot, treeplot / etreeplot, the error-bar plots on log axes, sombrero,
// stemleaf and datetick. Merged into the graphics builtins by octave.js.
import { str, num, tensor, rowVec, cell, empty, isCell, isFuncHandle, toTensor, isSparse } from '../value.js';
import { gerr, isTxt, txt, txtList, nums, isNum, lower, linspace, finiteMinMax, fmtNum } from './util.js';
import { G, create, handleValue, handleIds, vecMat, colMat, touch, objsOf, isAxesType, setProp, isHandleValue, mustObj, figureOf } from './model.js';
import { currentFigure, currentAxes, newplot, newAxes, nextSeriesStyle, leadingAxes, applySpec, lineSpecOf, makeCurrentAxes } from './figax.js';
import { axesInfo } from './compute.js';
import { flush } from './scene.js';
import { toFunc } from './plots.js';

const H = {};
const h = (names, en, ko, syntax) => { for (const n of names.split(' ')) H[n] = { en, ko, syntax: syntax.map((s) => s.replace(/\bNAME\b/g, n)) }; };
const axV = (ctx, ax) => handleValue(ctx, [ax.id]);
const ids = (v) => (v && (v.gh || v.re) ? handleIds(v) : []);
const call1 = (ctx, fn, args) => ctx.call(fn, args, 1)[0];

// ---------------------------------------------------------------- comet

h('comet', 'Animated comet plot: a head moves along the curve leaving a trail (p = seconds per step, default 0.1).', '혜성 애니메이션: 머리가 곡선을 따라 움직이며 자취를 남깁니다 (p = 한 걸음 시간, 기본 0.1초).', ['comet(y)', 'comet(x, y)', 'comet(x, y, p)', 'comet(ax, ___)']);
h('comet3', 'Animated 3-D comet plot.', '3차원 혜성 애니메이션.', ['comet3(z)', 'comet3(x, y, z)', 'comet3(x, y, z, p)', 'comet3(ax, ___)']);

function cometImpl(ctx, args, dim) {
  const lead = leadingAxes(ctx, args);
  const a = lead.args.map((v) => Array.from(nums(v)));
  let x, y, z = null, p = 0.1;
  if (dim === 2) {
    if (a.length === 1) { y = a[0]; x = y.map((_, i) => i + 1); }
    else if (a.length >= 2) { [x, y] = a; if (a.length > 2) p = a[2][0]; }
    else throw gerr('comet:args', 'comet(x, y, p).');
  } else {
    if (a.length === 1) { z = a[0]; x = z.map((_, i) => i + 1); y = x.slice(); }
    else if (a.length >= 3) { [x, y, z] = a; if (a.length > 3) p = a[3][0]; }
    else throw gerr('comet3:args', 'comet3(x, y, z, p).');
  }
  const n = y.length;
  if (x.length !== n || (z && z.length !== n)) throw gerr('comet:size', 'The coordinate vectors must have the same length.');
  const { ax, held } = newplot(ctx, lead.ax);
  const st = G(ctx);
  if (!held) {
    const [x0, x1] = finiteMinMax(x), [y0, y1] = finiteMinMax(y);
    if (x0 < x1) { ax.props.XLim = [x0, x1]; ax.props.XLimMode = 'manual'; }
    if (y0 < y1) { ax.props.YLim = [y0, y1]; ax.props.YLimMode = 'manual'; }
    if (z) { const [z0, z1] = finiteMinMax(z); if (z0 < z1) { ax.props.ZLim = [z0, z1]; ax.props.ZLimMode = 'manual'; } ax.props.View = [-37.5, 30]; }
  }
  const s1 = nextSeriesStyle(ax), s2 = nextSeriesStyle(ax);
  const body = create(ctx, 'line', ax.id, { XData: vecMat([]), YData: vecMat([]), ZData: z ? vecMat([]) : null, Color: s1.color });
  const tail = create(ctx, 'line', ax.id, { XData: vecMat([]), YData: vecMat([]), ZData: z ? vecMat([]) : null, Color: s2.color, LineWidth: 1.5 });
  const head = create(ctx, 'line', ax.id, { XData: vecMat([]), YData: vecMat([]), ZData: z ? vecMat([]) : null, Color: s1.color, Marker: 'o', MarkerSize: 8, MarkerFaceColor: s1.color, LineStyle: 'none' });
  const tl = Math.max(1, Math.round(0.1 * n));
  const setXYZ = (o, i0, i1) => {
    o.props.XData = vecMat(x.slice(i0, i1)); o.props.YData = vecMat(y.slice(i0, i1));
    if (z) o.props.ZData = vecMat(z.slice(i0, i1));
    touch(st, o);
  };
  for (let i = 1; i <= n; i++) {
    ctx.checkInterrupt();
    setXYZ(body, 0, Math.max(1, i - tl + 1));
    setXYZ(tail, Math.max(0, i - tl), i);
    setXYZ(head, i - 1, i);
    if (p > 0) ctx.call('pause', [num(p)], 0); else flush(ctx);
  }
  setXYZ(body, 0, n);
  setXYZ(tail, n - 1, n);
  return [];
}

// ---------------------------------------------------------------- ez* function plots

h('ezcontour', 'Contour plot of f(x, y) over a domain (default [-2π 2π]) on an n×n grid (default 60).', 'f(x, y)의 등고선 그래프 (기본 영역 [-2π 2π], n×n 격자, 기본 60).', ['ezcontour(f)', 'ezcontour(f, [min max])', 'ezcontour(f, [xmin xmax ymin ymax])', 'ezcontour(___, n)', 'h = ezcontour(___)']);
h('ezcontourf', 'Filled contour plot of f(x, y) over a domain (default [-2π 2π]).', 'f(x, y)의 채운 등고선 그래프 (기본 영역 [-2π 2π]).', ['ezcontourf(f)', 'ezcontourf(f, dom)', 'ezcontourf(___, n)', 'h = ezcontourf(___)']);
h('ezmeshc', 'Mesh of f(x, y) with contour lines below it.', 'f(x, y)의 그물 곡면과 그 아래 등고선.', ['ezmeshc(f)', 'ezmeshc(f, dom)', 'ezmeshc(fx, fy, fz)', 'ezmeshc(___, n)', 'h = ezmeshc(___)']);
h('ezsurfc', 'Surface of f(x, y) with contour lines below it.', 'f(x, y)의 곡면과 그 아래 등고선.', ['ezsurfc(f)', 'ezsurfc(f, dom)', 'ezsurfc(fx, fy, fz)', 'ezsurfc(___, n)', 'h = ezsurfc(___)']);
h('ezplot3', 'Parametric 3-D curve (fx(t), fy(t), fz(t)), t in [0 2π] by default; animate draws it as a comet.', '매개변수 3차원 곡선 (fx(t), fy(t), fz(t)), 기본 t는 [0 2π]; animate는 혜성처럼 그립니다.', ['ezplot3(fx, fy, fz)', 'ezplot3(fx, fy, fz, [t0 t1])', 'ezplot3(___, n)', "ezplot3(___, 'animate')", 'h = ezplot3(___)']);
h('ezpolar', 'Polar plot of rho = f(theta), theta in [0 2π] by default.', '극좌표 그래프 rho = f(theta), 기본 theta는 [0 2π].', ['ezpolar(f)', 'ezpolar(f, [t0 t1])', 'ezpolar(___, n)', 'h = ezpolar(___)']);

function funcText(ctx, v) {
  if (isTxt(v)) return txt(v);
  try { return txt(call1(ctx, 'func2str', [v])).replace(/^@\([^)]*\)\s*/, ''); } catch { return ''; }
}
function evalGrid(ctx, f, X, Y) {
  try {
    const r = Float64Array.from(nums(ctx.call(f, [X, Y], 1)[0]));
    if (r.length === X.re.length) return r;
    if (r.length === 1) return new Float64Array(X.re.length).fill(r[0]);
  } catch { /* point by point */ }
  return Float64Array.from(X.re, (x, k) => { try { return nums(ctx.call(f, [num(x), num(Y.re[k])], 1)[0])[0]; } catch { return NaN; } });
}
function evalLine(ctx, f, t) {
  try {
    const r = Array.from(nums(ctx.call(f, [rowVec(t)], 1)[0]));
    if (r.length === t.length) return r;
    if (r.length === 1) return t.map(() => r[0]);
  } catch { /* point by point */ }
  return t.map((x) => { try { return nums(ctx.call(f, [num(x)], 1)[0])[0]; } catch { return NaN; } });
}
/** Splits trailing [domain] and n of an ez* call: {funcs, dom, n, rest}. */
function ezArgs(ctx, args, nf, defDom) {
  const lead = leadingAxes(ctx, args);
  const a = lead.args;
  const funcs = [];
  let k = 0;
  while (k < a.length && funcs.length < nf && (isFuncHandle(a[k]) || isTxt(a[k]))) { if (isTxt(a[k]) && lower(txt(a[k])) === 'animate') break; funcs.push(a[k]); k++; }
  if (!funcs.length) throw gerr('ez:args', 'A function (handle or expression) is needed.');
  let dom = defDom.slice(), n = null, animate = false;
  for (; k < a.length; k++) {
    if (isTxt(a[k])) { if (lower(txt(a[k])) === 'animate') animate = true; else throw gerr('ez:args', `Unknown option '${txt(a[k])}'.`); continue; }
    const v = Array.from(nums(a[k]));
    if (v.length === 1) n = Math.max(2, Math.round(v[0]));
    else if (v.length === 2 || v.length === 4) dom = v;
    else throw gerr('ez:domain', 'The domain must be [min max] or [xmin xmax ymin ymax].');
  }
  return { ax: lead.ax, funcs, dom, n, animate };
}
function ezSurface(ctx, args, plotFn, opts = {}) {
  const twoPi = 2 * Math.PI;
  const e = ezArgs(ctx, args, 3, [-twoPi, twoPi]);
  const n = e.n || opts.n || 60;
  const dom = e.dom.length === 2 ? [e.dom[0], e.dom[1], e.dom[0], e.dom[1]] : e.dom;
  const us = linspace(dom[0], dom[1], n), vs = linspace(dom[2], dom[3], n);
  const U = tensor('double', [n, n]), V = tensor('double', [n, n]);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { U.re[i + j * n] = us[j]; V.re[i + j * n] = vs[i]; }
  let X, Y, Z, title;
  if (e.funcs.length === 3) {
    if (opts.noParametric) throw gerr('ez:args', 'This function plots f(x, y) only.');
    const f = e.funcs.map((v) => toFunc(ctx, v));
    X = tensor('double', [n, n], evalGrid(ctx, f[0], U, V)); Y = tensor('double', [n, n], evalGrid(ctx, f[1], U, V)); Z = tensor('double', [n, n], evalGrid(ctx, f[2], U, V));
    title = `x = ${funcText(ctx, e.funcs[0])}, y = ${funcText(ctx, e.funcs[1])}, z = ${funcText(ctx, e.funcs[2])}`;
  } else {
    const f = toFunc(ctx, e.funcs[0]);
    X = U; Y = V; Z = tensor('double', [n, n], evalGrid(ctx, f, U, V));
    title = funcText(ctx, e.funcs[0]);
  }
  const lead = e.ax ? [axV(ctx, e.ax)] : [];
  const r = ctx.call(plotFn, [...lead, X, Y, Z], 2);
  const hv = plotFn === 'contour' || plotFn === 'contourf' ? r[1] : r[0];
  const ax = e.ax || currentAxes(ctx, true);
  const t = G(ctx).objs.get(ax.props.Title);
  if (t) { t.props.String = title; touch(G(ctx), t); }
  for (const [k, nm] of [['XLabel', 'x'], ['YLabel', 'y']]) { const lb = G(ctx).objs.get(ax.props[k]); if (lb && e.funcs.length === 1) { lb.props.String = nm; touch(G(ctx), lb); } }
  return hv;
}

// ---------------------------------------------------------------- error bars on log axes

h('loglogerr', 'Error bar plot on log-log axes (same arguments as errorbar; a format with > draws x errors, ~> both).', '양 로그 축의 오차 막대 그래프 (errorbar와 같은 인수; 형식의 >는 x 오차, ~>는 둘 다).', ['loglogerr(x, y, ey)', 'loglogerr(x, y, ly, uy)', 'loglogerr(x, y, ex, ey, fmt)', 'h = loglogerr(___)']);
h('semilogxerr', 'Error bar plot with a logarithmic x-axis.', 'x축이 로그인 오차 막대 그래프.', ['semilogxerr(x, y, ey)', 'semilogxerr(x, y, ly, uy)', 'h = semilogxerr(___)']);
h('semilogyerr', 'Error bar plot with a logarithmic y-axis.', 'y축이 로그인 오차 막대 그래프.', ['semilogyerr(x, y, ey)', 'semilogyerr(x, y, ly, uy)', 'h = semilogyerr(___)']);

function logErr(xs, ys) {
  return (args, nargout, ctx) => {
    const lead = leadingAxes(ctx, args);
    const a = [];
    let orient = null;
    for (const v of lead.args) {
      if (isTxt(v) && /[~>#]/.test(txt(v))) {
        const s = txt(v);
        orient = s.includes('~>') || s.includes('#') ? 'both' : s.includes('>') ? 'horizontal' : null;
        const spec = s.replace(/[~>#]/g, '');
        if (spec) a.push(str(spec));
        continue;
      }
      a.push(v);
    }
    const d = a.filter((v) => !isTxt(v)).length;
    if (orient === 'both' && d === 4) { // (x, y, ex, ey): symmetric errors in both directions
      const [x, y, ex, ey] = a.filter((v) => !isTxt(v));
      a.splice(0, a.length, x, y, ey, ey, ex, ex, ...a.filter((v) => isTxt(v)));
      orient = null;
    }
    if (orient) a.push(str(orient));
    const hv = call1(ctx, 'errorbar', [...(lead.ax ? [axV(ctx, lead.ax)] : []), ...a]);
    const o = G(ctx).objs.get(ids(hv)[0]);
    let ax = o ? G(ctx).objs.get(o.parent) : null;
    while (ax && !isAxesType(ax.type)) ax = G(ctx).objs.get(ax.parent);
    if (ax) { if (xs) ax.props.XScale = 'log'; if (ys) ax.props.YScale = 'log'; touch(G(ctx), ax); }
    return hv;
  };
}

// ---------------------------------------------------------------- plotyy, pareto

h('plotyy', 'Plots two data sets with two y-axes (left and right) sharing the x-axis.', '두 데이터를 x축을 함께 쓰는 두 y축(왼쪽, 오른쪽)으로 그립니다.', ['plotyy(x1, y1, x2, y2)', 'plotyy(x1, y1, x2, y2, fun)', 'plotyy(x1, y1, x2, y2, fun1, fun2)', '[ax, h1, h2] = plotyy(___)']);
h('pareto', 'Pareto chart: bars sorted in descending order (up to 95% of the total) and the cumulative percentage line on a right axis.', '파레토 차트: 내림차순 막대(합계의 95%까지)와 오른쪽 축의 누적 백분율 선.', ['pareto(y)', 'pareto(y, names)', 'pareto(y, x)', '[h, ax] = pareto(___)']);

/** Inner position of an axes (outer-constrained axes: the plot box inside OuterPosition). */
function axesInfoPosition(ax) {
  const p = ax.props;
  if (p.PositionConstraint === 'innerposition') return p.Position.slice();
  const o = p.OuterPosition;
  return [o[0] + 0.13 * o[2], o[1] + 0.11 * o[3], 0.775 * o[2], 0.815 * o[3]];
}
function plotyyImpl(ctx, args) {
  let a = args;
  let parent = null;
  if (a.length && isHandleValue(a[0])) { parent = objsOf(ctx, a[0])[0]; a = a.slice(1); }
  if (a.length < 4) throw gerr('plotyy:args', 'plotyy(x1, y1, x2, y2, fun1, fun2).');
  const [x1, y1, x2, y2] = a;
  const fn = (v) => (v == null ? 'plot' : isFuncHandle(v) ? v : txt(v));
  const f1 = fn(a[4]), f2 = a.length > 5 ? fn(a[5]) : f1;
  const st = G(ctx);
  const f = parent ? (parent.type === 'figure' ? parent : figureOf(st, parent)) : currentFigure(ctx, true);
  let ax1 = parent && isAxesType(parent.type) ? parent : currentAxes(ctx, false, f);
  // the pair takes the place of the current axes (a subplot keeps its cell); room is left for the right axis
  const base = ax1 ? axesInfoPosition(ax1) : [0.13, 0.11, 0.775, 0.815];
  const pos = [base[0], base[1], base[2] * 0.91, base[3]];
  const keepSubplot = ax1 ? ax1.internal.subplot : undefined;
  const outerKeep = ax1 ? ax1.props.OuterPosition.slice() : [0, 0, 1, 1];
  const parentId = ax1 ? ax1.parent : f.id;
  if (ax1 && ax1.props.NextPlot !== 'add') { ctx.call('delete', [axV(ctx, ax1)], 0); ax1 = null; }
  if (!ax1) ax1 = newAxes(ctx, f, 'axes', {}, parentId);
  if (keepSubplot !== undefined) ax1.internal.subplot = keepSubplot;
  makeCurrentAxes(ctx, ax1);
  const h1 = ctx.call(f1, [axV(ctx, ax1), x1, y1], 1)[0];
  Object.assign(ax1.props, { Position: pos.slice(), OuterPosition: outerKeep.slice(), PositionConstraint: 'innerposition', Box: false });
  const ax2 = newAxes(ctx, f, 'axes', {}, parentId);
  ax2.props.NextPlot = 'add'; // keep the properties below while plotting into it
  Object.assign(ax2.props, { Position: pos.slice(), OuterPosition: outerKeep.slice(), PositionConstraint: 'innerposition', YAxisLocation: 'right', Color: 'none', XTick: [], XTickMode: 'manual', XTickLabel: [], XTickLabelMode: 'manual', Box: false });
  ax2.userSet.add('Color');
  ax2.internal.colorIndex = 1; // its first series takes the second colour
  const h2 = ctx.call(f2, [axV(ctx, ax2), x2, y2], 1)[0];
  ax2.props.NextPlot = 'replace';
  const colorOf = (hv) => { const o = st.objs.get(ids(hv)[0]); if (!o) return null; const c = o.props.Color || o.props.FaceColor; return Array.isArray(c) ? c.slice() : null; };
  const c1 = colorOf(h1), c2 = colorOf(h2);
  if (c1) { ax1.props.YColor = c1; ax1.userSet.add('YColor'); }
  if (c2) { ax2.props.YColor = c2; ax2.userSet.add('YColor'); }
  // the two x-axes stay together
  const i1 = axesInfo(ctx, ax1), i2 = axesInfo(ctx, ax2);
  const xl = [Math.min(i1.XLim[0], i2.XLim[0]), Math.max(i1.XLim[1], i2.XLim[1])];
  const group = { ids: [ax1.id, ax2.id], dims: ['X'] };
  for (const ax of [ax1, ax2]) { ax.props.XLim = xl.slice(); ax.props.XLimMode = 'manual'; ax.internal.link = group; ax.internal.plotyy = [ax1.id, ax2.id]; touch(st, ax); }
  makeCurrentAxes(ctx, ax1);
  return { ax1, ax2, h1, h2 };
}

// ---------------------------------------------------------------- plotmatrix

h('plotmatrix', 'Scatter plot matrix: column j of x against column i of y in cell (i, j); plotmatrix(x) puts histograms on the diagonal.', '산점도 행렬: (i, j) 칸에 x의 j열 대 y의 i열; plotmatrix(x)는 대각선에 히스토그램.', ['plotmatrix(x, y)', 'plotmatrix(x)', 'plotmatrix(___, style)', '[h, ax, bigax, P, pax] = plotmatrix(___)']);

function columns(v) {
  const t = toTensor(v);
  let [m, n] = t.dims;
  if (m === 1) { m = n; n = 1; }
  return Array.from({ length: n }, (_, j) => Array.from(t.re.subarray(j * m, (j + 1) * m)));
}

// ---------------------------------------------------------------- spy, gplot, trees

h('spy', 'Plots the sparsity pattern of a matrix (a dot for every nonzero; row 1 at the top).', '행렬의 희소 패턴을 그립니다 (0이 아닌 원소마다 점; 1행이 위).', ['spy(S)', 'spy(S, markersize)', 'spy(S, linespec)', 'spy(S, linespec, markersize)', 'h = spy(___)']);
h('gplot', 'Plots a graph: an edge from xy(i,:) to xy(j,:) for every nonzero A(i,j).', '그래프를 그립니다: A(i,j)가 0이 아니면 xy(i,:)에서 xy(j,:)로 선.', ['gplot(A, xy)', 'gplot(A, xy, linespec)', '[x, y] = gplot(A, xy)', 'h = gplot(___)']);
h('treeplot', 'Plots a tree from a parent vector (p(i) = parent of node i, 0 for a root).', '부모 벡터로 나무를 그립니다 (p(i) = 노드 i의 부모, 뿌리는 0).', ['treeplot(p)', 'treeplot(p, nodestyle, edgestyle)']);
h('etreeplot', 'Plots the elimination tree of a (symmetric) matrix.', '(대칭) 행렬의 소거 나무를 그립니다.', ['etreeplot(A)', 'etreeplot(A, nodestyle, edgestyle)']);

function nonzeros(v) {
  const out = [];
  if (isSparse(v)) {
    const [m] = v.dims;
    for (let j = 0; j < v.dims[1]; j++) for (let k = v.colPtr[j]; k < v.colPtr[j + 1]; k++) if (v.re[k] !== 0 || (v.im && v.im[k] !== 0)) out.push([v.rowIdx[k], j]);
    void m;
    return out;
  }
  const t = toTensor(v);
  const [m, n] = t.dims;
  for (let j = 0; j < n; j++) for (let i = 0; i < m; i++) { const k = i + j * m; if (t.re[k] !== 0 || (t.im && t.im[k] !== 0)) out.push([i, j]); }
  return out;
}
/** Node coordinates of a forest given by a parent vector (0-based parents, -1 = root). */
export function treeLayout(parent) {
  const n = parent.length;
  const kids = Array.from({ length: n }, () => []);
  const roots = [];
  parent.forEach((p, i) => { if (p < 0) roots.push(i); else kids[p].push(i); });
  const depth = new Array(n).fill(0);
  const x = new Array(n).fill(0);
  let leaf = 0, maxDepth = 0;
  const visit = (i, d) => {
    depth[i] = d; maxDepth = Math.max(maxDepth, d);
    if (!kids[i].length) { x[i] = ++leaf; return; }
    for (const c of kids[i]) visit(c, d + 1);
    x[i] = (x[kids[i][0]] + x[kids[i][kids[i].length - 1]]) / 2;
  };
  for (const r of roots) visit(r, 0);
  const xs = x.map((v) => v / (leaf + 1));
  const ys = depth.map((d) => (maxDepth + 1 - d) / (maxDepth + 2));
  return { x: xs, y: ys, height: maxDepth };
}
function treeplotImpl(ctx, parentVec, nodeStyle, edgeStyle) {
  const n = parentVec.length;
  const parent = parentVec.map((p, i) => {
    if (!(Number.isInteger(p) && p >= 0 && p <= n) || p === i + 1) throw gerr('treeplot:tree', 'treeplot: TREE must be a vector of parent indices (0 for roots).');
    return p - 1;
  });
  // cycles make no tree
  for (let i = 0; i < n; i++) { let k = i, steps = 0; while (k >= 0 && steps <= n) { k = parent[k]; steps++; } if (steps > n) throw gerr('treeplot:tree', 'treeplot: TREE must not contain cycles.'); }
  const { x, y } = treeLayout(parent);
  const ex = [], ey = [];
  parent.forEach((p, i) => { if (p >= 0) { ex.push(x[i], x[p], NaN); ey.push(y[i], y[p], NaN); } });
  const { ax } = newplot(ctx, null);
  const nodeProps = { XData: vecMat(x), YData: vecMat(y), LineStyle: 'none', Marker: 'o', Color: [0, 0, 0], MarkerSize: 6 };
  const edgeProps = { XData: vecMat(ex), YData: vecMat(ey), Color: [1, 0, 0] };
  applySpec(nodeProps, lineSpecOf(str(nodeStyle)) || null, { color: [0, 0, 0] });
  applySpec(edgeProps, lineSpecOf(str(edgeStyle)) || null, { color: [1, 0, 0] });
  if (!/[-:]/.test(nodeStyle)) nodeProps.LineStyle = 'none';
  create(ctx, 'line', ax.id, edgeProps);
  create(ctx, 'line', ax.id, nodeProps);
  Object.assign(ax.props, { XLim: [0, 1], YLim: [0, 1], XLimMode: 'manual', YLimMode: 'manual', XTick: [], YTick: [], XTickMode: 'manual', YTickMode: 'manual' });
  touch(G(ctx), ax);
  return [];
}
/** Elimination tree (Liu) of the symmetric pattern of A: 0-based parents, -1 for roots. */
export function eliminationTree(A) {
  const nz = nonzeros(A);
  const n = A.dims[1];
  if (A.dims[0] !== n) throw gerr('etreeplot:square', 'etreeplot: A must be a square matrix.');
  const upper = Array.from({ length: n }, () => []);
  for (const [i, j] of nz) { if (i < j) upper[j].push(i); else if (j < i) upper[i].push(j); }
  const parent = new Array(n).fill(-1), anc = new Array(n).fill(-1);
  for (let k = 0; k < n; k++) {
    for (const i0 of upper[k]) {
      let i = i0;
      while (i !== -1 && i < k) { const next = anc[i]; anc[i] = k; if (next === -1) { parent[i] = k; break; } i = next; }
    }
  }
  return parent;
}

// ---------------------------------------------------------------- sombrero, stemleaf, datetick

h('sombrero', 'The sombrero surface sin(r)/r on [-8, 8]² with n×n points (default 41).', 'sombrero 곡면 sin(r)/r, [-8, 8]² 위 n×n 점 (기본 41).', ['sombrero', 'sombrero(n)', '[x, y, z] = sombrero(___)']);
h('stemleaf', 'Stem-and-leaf display of integer data (leaf = last digit, stem step 10 by default).', '정수 데이터의 줄기-잎 그림 (잎 = 마지막 자리, 기본 줄기 간격 10).', ['stemleaf(x, caption)', 'stemleaf(x, caption, stem_sz)', 'plotstr = stemleaf(___)']);
h('datetick', 'Labels the ticks of an axis that holds date numbers (datenum) as dates; picks a format from the span unless one is given.', '날짜 수(datenum)를 담은 축의 눈금을 날짜로 표시합니다; 형식이 없으면 범위에 맞춰 고릅니다.', ['datetick', 'datetick(axis)', 'datetick(axis, form)', "datetick(___, 'keeplimits')", "datetick(___, 'keepticks')", 'datetick(ax, ___)']);

function quartile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const a = Math.floor(pos), b = Math.ceil(pos);
  return sorted[a] + (sorted[b] - sorted[a]) * (pos - a);
}
export function stemleafText(x, caption, step = 10) {
  if (!(step > 0 && Number.isInteger(step) && /^10*$/.test(String(step)))) throw gerr('stemleaf:stem', 'stemleaf: STEM_SZ must be a power of 10 (10, 100, ...).');
  const vals = x.map((v) => Math.trunc(v));
  const sorted = vals.slice().sort((p, q) => p - q);
  const unit = step / 10;
  const isSorted = vals.every((v, i) => i === 0 || vals[i - 1] <= v);
  const lines = [caption, '', `       stem step: ${step}, data: ${isSorted ? 'sorted' : 'unsorted'}.`];
  const lo = quartile(sorted, 0.25), hi = quartile(sorted, 0.75);
  lines.push(`       Hinges:    lo: ${fmtNum(lo)}, hi: ${fmtNum(hi)}`);
  lines.push('');
  const key = (v) => (v < 0 ? `-${Math.floor(-v / step)}` : `${Math.floor(v / step)}`);
  const stems = [];
  const neg = sorted.filter((v) => v < 0), pos = sorted.filter((v) => v >= 0);
  if (neg.length) for (let s = Math.floor(-neg[0] / step); s >= 0; s--) stems.push(`-${s}`);
  if (pos.length) for (let s = 0; s <= Math.floor(pos[pos.length - 1] / step); s++) stems.push(`${s}`);
  const leaves = new Map(stems.map((s) => [s, []]));
  for (const v of sorted) leaves.get(key(v)).push(Math.floor(Math.abs(v) / unit) % 10);
  for (const [s, l] of leaves) { if (s.startsWith('-')) l.sort((p, q) => q - p); }
  const w = Math.max(...stems.map((s) => s.length), 1);
  for (const s of stems) lines.push(`  ${s.padStart(w + 8)} | ${leaves.get(s).join('')}`);
  return lines;
}

const DATE_FORMS = {
  0: 'dd-mmm-yyyy HH:MM:SS', 1: 'dd-mmm-yyyy', 2: 'mm/dd/yy', 3: 'mmm', 4: 'm', 5: 'mm', 6: 'mm/dd', 7: 'dd', 8: 'ddd', 9: 'd', 10: 'yyyy', 11: 'yy', 12: 'mmmyy',
  13: 'HH:MM:SS', 14: 'HH:MM:SS PM', 15: 'HH:MM', 16: 'HH:MM PM', 17: 'QQ-YY', 18: 'QQ', 19: 'dd/mm', 20: 'dd/mm/yy', 21: 'mmm.dd,yyyy HH:MM:SS',
  22: 'mmm.dd,yyyy', 23: 'mm/dd/yyyy', 24: 'dd/mm/yyyy', 25: 'yy/mm/dd', 26: 'yyyy/mm/dd', 27: 'QQ-YYYY', 28: 'mmmyyyy', 29: 'yyyy-mm-dd', 30: 'yyyymmddTHHMMSS', 31: 'yyyy-mm-dd HH:MM:SS',
};
const EPOCH = 719529; // datenum of 1970-01-01
const toDate = (dn) => new Date(Math.round((dn - EPOCH) * 86400000));
const fromDate = (d) => d.getTime() / 86400000 + EPOCH;
/** Nice date tick values (datenum) covering [a, b]. */
export function dateTickValues(a, b, maxTicks = 7) {
  const span = b - a;
  const SEC = 1 / 86400;
  const fixed = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200].map((s) => s * SEC).concat([1, 2, 7, 14]);
  for (const step of fixed) {
    if (span / step <= maxTicks) {
      const out = [];
      for (let v = Math.ceil(a / step - 1e-9) * step; v <= b + step * 1e-9; v += step) out.push(Number(v.toFixed(10)));
      if (out.length >= 2 || step === 14) return out;
    }
  }
  // months / years on calendar boundaries
  for (const months of [1, 2, 3, 6, 12, 24, 60, 120, 240, 600, 1200]) {
    if (span / (months * 30.44) <= maxTicks) {
      const d0 = toDate(a);
      let y = d0.getUTCFullYear(), m = d0.getUTCMonth();
      m = Math.ceil((y * 12 + m) / months) * months; y = Math.floor(m / 12); m %= 12;
      const out = [];
      for (;;) {
        const v = fromDate(new Date(Date.UTC(y, m, 1)));
        if (v > b + 1e-9) break;
        if (v >= a - 1e-9) out.push(v);
        m += months; y += Math.floor(m / 12); m %= 12;
        if (out.length > 100) break;
      }
      if (out.length >= 2) return out;
    }
  }
  return [a, b];
}
function dateFormFor(span) {
  if (span < 10 / 1440) return 13;
  if (span < 2) return 15;
  if (span < 15) return 8;
  if (span < 365) return 6;
  if (span < 365 * 9) return 12;
  return 10;
}

// ---------------------------------------------------------------- builtins

export const builtins = {
  comet(args, nargout, ctx) { return cometImpl(ctx, args, 2); },
  comet3(args, nargout, ctx) { return cometImpl(ctx, args, 3); },
  ezcontour(args, nargout, ctx) { return ezSurface(ctx, args, 'contour', { noParametric: true }); },
  ezcontourf(args, nargout, ctx) { return ezSurface(ctx, args, 'contourf', { noParametric: true }); },
  ezmeshc(args, nargout, ctx) { return ezSurface(ctx, args, 'meshc'); },
  ezsurfc(args, nargout, ctx) { return ezSurface(ctx, args, 'surfc'); },
  ezplot3(args, nargout, ctx) {
    const e = ezArgs(ctx, args, 3, [0, 2 * Math.PI]);
    if (e.funcs.length !== 3) throw gerr('ezplot3:args', 'ezplot3(fx, fy, fz).');
    const t = Array.from(linspace(e.dom[0], e.dom[1], e.n || 500));
    const [x, y, z] = e.funcs.map((v) => evalLine(ctx, toFunc(ctx, v), t));
    const lead = e.ax ? [axV(ctx, e.ax)] : [];
    let hv;
    if (e.animate) { cometImpl(ctx, [...lead, rowVec(x), rowVec(y), rowVec(z), num(0.01)], 3); hv = empty(); }
    else hv = call1(ctx, 'plot3', [...lead, rowVec(x), rowVec(y), rowVec(z)]);
    const ax = e.ax || currentAxes(ctx, true);
    const tt = G(ctx).objs.get(ax.props.Title);
    if (tt) { tt.props.String = `x = ${funcText(ctx, e.funcs[0])}, y = ${funcText(ctx, e.funcs[1])}, z = ${funcText(ctx, e.funcs[2])}`; touch(G(ctx), tt); }
    return hv;
  },
  ezpolar(args, nargout, ctx) {
    const e = ezArgs(ctx, args, 1, [0, 2 * Math.PI]);
    const t = Array.from(linspace(e.dom[0], e.dom[1], e.n || 500));
    const r = evalLine(ctx, toFunc(ctx, e.funcs[0]), t);
    const hv = call1(ctx, 'polar', [...(e.ax ? [axV(ctx, e.ax)] : []), rowVec(t), rowVec(r)]);
    const ax = e.ax || currentAxes(ctx, true);
    const tt = G(ctx).objs.get(ax.props.Title);
    if (tt) { tt.props.String = `r = ${funcText(ctx, e.funcs[0])}`; touch(G(ctx), tt); }
    return hv;
  },
  loglogerr: logErr(true, true),
  semilogxerr: logErr(true, false),
  semilogyerr: logErr(false, true),
  plotyy(args, nargout, ctx) {
    const { ax1, ax2, h1, h2 } = plotyyImpl(ctx, args);
    return [handleValue(ctx, [ax1.id, ax2.id]), h1, h2];
  },
  pareto(args, nargout, ctx) {
    let a = args;
    let lead = [];
    if (a.length && isHandleValue(a[0])) { lead = [a[0]]; a = a.slice(1); }
    if (!a.length) throw gerr('pareto:args', 'pareto(y, x).');
    const y = Array.from(nums(a[0]));
    if (y.some((v) => v < 0 || !Number.isFinite(v))) throw gerr('pareto:y', 'pareto: Y must be finite and not negative.');
    let names = null;
    if (a.length > 1) {
      if (isCell(a[1]) || (a[1].cls === 'string' && a[1].data.length > 1) || (a[1].cls === 'char' && a[1].dims[0] > 1)) names = txtList(a[1]);
      else names = Array.from(nums(a[1]), (v) => fmtNum(v));
      if (names.length !== y.length) throw gerr('pareto:x', 'pareto: X must have one entry per element of Y.');
    } else names = y.map((_, i) => String(i + 1));
    const order = y.map((v, i) => [v, i]).sort((p, q) => q[0] - p[0] || p[1] - q[1]).map((p) => p[1]);
    let ys = order.map((i) => y[i]);
    let ns = order.map((i) => names[i]);
    const total = ys.reduce((s, v) => s + v, 0) || 1;
    let cum = 0;
    let cdf = ys.map((v) => (cum += v) / total);
    const k95 = cdf.findIndex((c) => c >= 0.95 - 1e-12);
    if (k95 >= 0 && k95 + 1 < ys.length) { ys = ys.slice(0, k95 + 1); ns = ns.slice(0, k95 + 1); cdf = cdf.slice(0, k95 + 1); }
    const x = rowVec(ys.map((_, i) => i + 1));
    const { ax1, ax2, h1, h2 } = plotyyImpl(ctx, [...lead, x, rowVec(ys), x, rowVec(cdf.map((c) => c * total)), str('bar'), str('plot')]);
    const st = G(ctx);
    ax1.props.YLim = [0, total]; ax1.props.YLimMode = 'manual';
    ax2.props.YLim = [0, total]; ax2.props.YLimMode = 'manual';
    ax2.props.YTick = [0, 0.25, 0.5, 0.75, 1].map((f) => f * total); ax2.props.YTickMode = 'manual';
    ax2.props.YTickLabel = ['0%', '25%', '50%', '75%', '100%']; ax2.props.YTickLabelMode = 'manual';
    for (const ax of [ax1, ax2]) { ax.props.XLim = [0.5, ys.length + 0.5]; ax.props.XLimMode = 'manual'; touch(st, ax); }
    ax1.props.XTick = ys.map((_, i) => i + 1); ax1.props.XTickMode = 'manual';
    ax1.props.XTickLabel = ns; ax1.props.XTickLabelMode = 'manual';
    return [handleValue(ctx, [...ids(h1), ...ids(h2)]), handleValue(ctx, [ax1.id, ax2.id])];
  },
  plotmatrix(args, nargout, ctx) {
    let a = args.slice();
    let style = '.';
    if (a.length && isTxt(a[a.length - 1])) { style = txt(a.pop()); }
    if (!a.length || a.length > 2) throw gerr('plotmatrix:args', 'plotmatrix(x, y, style).');
    const X = columns(a[0]);
    const self = a.length === 1;
    const Y = self ? X : columns(a[1]);
    if (X[0].length !== Y[0].length) throw gerr('plotmatrix:size', 'plotmatrix: X and Y must have the same number of rows.');
    const st = G(ctx);
    const f = currentFigure(ctx, true);
    for (const c of f.children.slice()) { const o = st.objs.get(c); if (o && (isAxesType(o.type) || o.type === 'tiledlayout')) ctx.call('delete', [handleValue(ctx, [o.id])], 0); }
    const p = X.length, q = Y.length;
    const L = 0.1, B = 0.1, W = 0.8, Hh = 0.8, gap = 0.02;
    const cw = (W - gap * (p - 1)) / p, chh = (Hh - gap * (q - 1)) / q;
    const bigax = newAxes(ctx, f, 'axes', { Position: [L, B, W, Hh], PositionConstraint: 'innerposition', Visible: false });
    bigax.internal.keepHidden = true;
    const lines = [], axs = [], hist = [], pax = [];
    const spec = lineSpecOf(str(style));
    for (let i = 0; i < q; i++) for (let j = 0; j < p; j++) {
      const pos = [L + j * (cw + gap), B + (q - 1 - i) * (chh + gap), cw, chh];
      const ax = newAxes(ctx, f, 'axes', { Position: pos, PositionConstraint: 'innerposition', Box: true });
      axs[i + j * q] = ax.id;
      if (i !== q - 1) { ax.props.XTickLabel = []; ax.props.XTickLabelMode = 'manual'; }
      if (j !== 0) { ax.props.YTickLabel = []; ax.props.YTickLabelMode = 'manual'; }
      if (self && i === j) {
        const v = X[j].filter(Number.isFinite);
        const hv = call1(ctx, 'histogram', [handleValue(ctx, [ax.id]), rowVec(v)]);
        hist.push(...ids(hv)); pax.push(ax.id);
        lines[i + j * q] = -1;
        continue;
      }
      const props = { XData: vecMat(X[j]), YData: vecMat(Y[i]), LineStyle: 'none', Marker: '.' };
      applySpec(props, spec, nextSeriesStyle(ax));
      if (!/[-:]/.test(style)) props.LineStyle = 'none';
      lines[i + j * q] = create(ctx, 'line', ax.id, props).id;
    }
    // shared limits per column / row
    for (let j = 0; j < p; j++) { const [lo, hi] = finiteMinMax(X[j]); if (lo < hi) for (let i = 0; i < q; i++) { const ax = st.objs.get(axs[i + j * q]); const pad = (hi - lo) * 0.05; ax.props.XLim = [lo - pad, hi + pad]; ax.props.XLimMode = 'manual'; } }
    for (let i = 0; i < q; i++) { const [lo, hi] = finiteMinMax(Y[i]); if (lo < hi) for (let j = 0; j < p; j++) { if (self && i === j) continue; const ax = st.objs.get(axs[i + j * q]); const pad = (hi - lo) * 0.05; ax.props.YLim = [lo - pad, hi + pad]; ax.props.YLimMode = 'manual'; } }
    makeCurrentAxes(ctx, bigax);
    return [handleValue(ctx, lines, [q, p]), handleValue(ctx, axs, [q, p]), handleValue(ctx, [bigax.id]), handleValue(ctx, hist), handleValue(ctx, pax)];
  },
  spy(args, nargout, ctx) {
    const lead = leadingAxes(ctx, args);
    const a = lead.args;
    if (!a.length) throw gerr('spy:args', 'spy(S).');
    const S = a[0];
    const [m, n] = S.dims;
    let spec = null, msz = null;
    for (const v of a.slice(1)) { if (isTxt(v)) spec = lineSpecOf(v); else msz = nums(v)[0]; }
    const nz = nonzeros(S);
    const { ax } = newplot(ctx, lead.ax);
    const props = { XData: vecMat(nz.map((p) => p[1] + 1)), YData: vecMat(nz.map((p) => p[0] + 1)), LineStyle: 'none', Marker: '.' };
    applySpec(props, spec, nextSeriesStyle(ax));
    if (!spec || spec.lineStyle === undefined) props.LineStyle = 'none';
    if (!spec || !spec.marker) props.Marker = '.';
    if (msz != null) props.MarkerSize = msz;
    const o = create(ctx, 'line', ax.id, props);
    Object.assign(ax.props, { XLim: [0, n + 1], YLim: [0, m + 1], XLimMode: 'manual', YLimMode: 'manual', YDir: 'reverse', Box: true });
    const xl = G(ctx).objs.get(ax.props.XLabel);
    if (xl) { xl.props.String = `nz = ${nz.length}`; touch(G(ctx), xl); }
    touch(G(ctx), ax);
    return handleValue(ctx, [o.id]);
  },
  gplot(args, nargout, ctx) {
    if (args.length < 2) throw gerr('gplot:args', 'gplot(A, xy, linespec).');
    const A = args[0];
    const xy = toTensor(args[1]);
    const nv = xy.dims[0];
    if (xy.dims[1] < 2) throw gerr('gplot:xy', 'gplot: XY must be an n-by-2 matrix.');
    if (A.dims[0] !== nv || A.dims[1] !== nv) throw gerr('gplot:size', 'gplot: A must be n-by-n where n = rows(XY).');
    const xs = [], ys = [];
    for (const [i, j] of nonzeros(A)) { xs.push(xy.re[i], xy.re[j], NaN); ys.push(xy.re[i + nv], xy.re[j + nv], NaN); }
    if (nargout >= 2) return [tensor('double', [xs.length, 1], xs), tensor('double', [ys.length, 1], ys)];
    const spec = args.length > 2 ? [args[2]] : [];
    return call1(ctx, 'plot', [tensor('double', [xs.length, 1], xs), tensor('double', [ys.length, 1], ys), ...spec]);
  },
  treeplot(args, nargout, ctx) {
    if (!args.length) throw gerr('treeplot:args', 'treeplot(p).');
    const p = Array.from(nums(args[0]));
    return treeplotImpl(ctx, p, args.length > 1 ? txt(args[1]) : 'ko', args.length > 2 ? txt(args[2]) : 'r');
  },
  etreeplot(args, nargout, ctx) {
    if (!args.length) throw gerr('etreeplot:args', 'etreeplot(A).');
    const parent = eliminationTree(args[0]);
    return treeplotImpl(ctx, parent.map((p) => p + 1), args.length > 1 ? txt(args[1]) : 'ko', args.length > 2 ? txt(args[2]) : 'r');
  },
  sombrero(args, nargout, ctx) {
    const n = args.length ? Math.round(nums(args[0])[0]) : 41;
    if (!(n > 1)) throw gerr('sombrero:n', 'sombrero: N must be an integer greater than 1.');
    const v = linspace(-8, 8, n);
    const X = tensor('double', [n, n]), Y = tensor('double', [n, n]), Z = tensor('double', [n, n]);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = i + j * n;
      X.re[k] = v[j]; Y.re[k] = v[i];
      const r = Math.hypot(v[j], v[i]) + 2.220446049250313e-16;
      Z.re[k] = Math.sin(r) / r;
    }
    if (nargout > 0) return [X, Y, Z];
    ctx.call('surf', [X, Y, Z], 0);
    return [];
  },
  stemleaf(args, nargout, ctx) {
    if (args.length < 2) throw gerr('stemleaf:args', 'stemleaf(x, caption, stem_sz).');
    const x = Array.from(nums(args[0])).filter(Number.isFinite);
    if (!x.length) throw gerr('stemleaf:x', 'stemleaf: X must not be empty.');
    const step = args.length > 2 ? Math.round(nums(args[2])[0]) : 10;
    const lines = stemleafText(x, txt(args[1]), step);
    if (nargout > 0) {
      const w = Math.max(...lines.map((l) => l.length));
      const t = tensor('char', [lines.length, w]);
      lines.forEach((l, i) => { for (let j = 0; j < w; j++) t.re[i + j * lines.length] = j < l.length ? l.charCodeAt(j) : 32; });
      return t;
    }
    ctx.out(`${lines.join('\n')}\n`);
    return [];
  },
  datetick(args, nargout, ctx) {
    let a = args;
    let ax;
    if (a.length && isHandleValue(a[0])) { ax = objsOf(ctx, a[0])[0]; a = a.slice(1); } else ax = currentAxes(ctx, true);
    let axis = 'X', form = null, keepLimits = false, keepTicks = false;
    for (const v of a) {
      if (isTxt(v)) {
        const s = txt(v);
        const l = lower(s);
        if (l === 'keeplimits') keepLimits = true;
        else if (l === 'keepticks') keepTicks = true;
        else if (['x', 'y', 'z'].includes(l)) axis = l.toUpperCase();
        else form = s;
      } else form = nums(v)[0];
    }
    const st = G(ctx);
    const info = axesInfo(ctx, ax);
    const lim = info[`${axis}Lim`];
    let ticks;
    if (keepTicks) ticks = (info[`${axis}Tick`] || []).slice();
    else {
      // data range of the axis
      let lo = Infinity, hi = -Infinity;
      const walk = (o) => { for (const c of o.children) { const co = st.objs.get(c); if (!co) continue; const d = co.props[`${axis}Data`]; if (d && d.data) for (const v of d.data) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } walk(co); } };
      walk(ax);
      if (!(lo <= hi) || keepLimits) { lo = lim[0]; hi = lim[1]; }
      if (lo === hi) { lo -= 0.5; hi += 0.5; }
      ticks = dateTickValues(lo, hi);
      if (!keepLimits) {
        const step = ticks.length > 1 ? ticks[1] - ticks[0] : 1;
        let t0 = ticks[0], t1 = ticks[ticks.length - 1];
        if (t0 > lo) { ticks.unshift(...dateTickValues(lo - step, lo + 1e-9).filter((v) => v < t0).slice(-1)); t0 = ticks[0]; }
        if (t1 < hi) { ticks.push(...dateTickValues(hi - 1e-9, hi + step).filter((v) => v > t1).slice(0, 1)); t1 = ticks[ticks.length - 1]; }
        ax.props[`${axis}Lim`] = [Math.min(t0, lo), Math.max(t1, hi)]; ax.props[`${axis}LimMode`] = 'manual';
      } else ticks = ticks.filter((v) => v >= lim[0] - 1e-9 && v <= lim[1] + 1e-9);
    }
    const span = ticks.length > 1 ? ticks[ticks.length - 1] - ticks[0] : 1;
    let fmt = form == null ? DATE_FORMS[dateFormFor(span)] : typeof form === 'number' ? DATE_FORMS[form] : form;
    if (fmt == null) throw gerr('datetick:form', `datetick: unknown date format ${form}.`);
    let labels = [];
    if (ticks.length) {
      const r = call1(ctx, 'datestr', [tensor('double', [ticks.length, 1], ticks), str(fmt)]);
      labels = txtList(r).map((s) => s.trim());
    }
    ax.props[`${axis}Tick`] = ticks; ax.props[`${axis}TickMode`] = 'manual';
    ax.props[`${axis}TickLabel`] = labels; ax.props[`${axis}TickLabelMode`] = 'manual';
    ax.internal.datetick = { axis, form: fmt };
    touch(st, ax);
    return [];
  },
};

export const help = H;
export const quiet = ['comet', 'comet3', 'ezcontour', 'ezcontourf', 'ezmeshc', 'ezsurfc', 'ezplot3', 'ezpolar', 'loglogerr', 'semilogxerr', 'semilogyerr', 'spy', 'treeplot', 'etreeplot', 'rgbplot', 'gplot', 'pareto', 'plotyy', 'plotmatrix'];
void cell; void setProp; void mustObj; void colMat;
