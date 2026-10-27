// 2D plotting functions: plot, line, scatter, bar, histogram, area, stairs,
// stem, errorbar, fill / patch, text, rectangle, image family, polar plots,
// animated lines, function plots, pie, boxplot, heatmap, xline / yline.
import { str, num, tensor, rowVec, isCell, isStruct, empty, funcHandle } from '../value.js';
import { gerr, isTxt, txt, txtList, nums, isNum, parseColor, colorFromText, lower, finiteMinMax, linspace, isFuncHandle } from './util.js';
import { G, create, setPairs, pairsStart, handleValue, vecMat, colMat, matOfValue, objsOf, onSet, onGet, touch, matOfRows, rowsOfMat, setProp, mustObj, handleIds, isHandleValue, figureOf, destroy } from './model.js';
import { newplot, nextSeriesStyle, peekSeriesColor, leadingAxes, parseSeries, applySpec, plotData, noteAxisKind, columnsOf, lineSpecOf, currentAxes, currentFigure, newAxes, makeCurrentFigure } from './figax.js';
import { contourLines } from './contour.js';
import { niceNum } from './ticks.js';
import { colormapByName } from './colormaps.js';
import { resolvedColormap } from './scene.js';

const finite = (x) => x === x && x !== Infinity && x !== -Infinity;
const ret = (ctx, objs, row = false) => handleValue(ctx, objs.map((o) => o.id), objs.length === 0 ? [0, 0] : row ? [1, objs.length] : [objs.length, 1]);

// ---------------------------------------------------------------- lines

function makeLines(ctx, ax, series, pairs, type = 'line') {
  const out = [];
  for (const s of series) {
    const style = nextSeriesStyle(ax);
    const props = { XData: vecMat(s.x), YData: vecMat(s.y), ZData: s.z ? vecMat(s.z) : null, SeriesIndex: style.index };
    applySpec(props, s.spec, style);
    out.push(create(ctx, type, ax.id, props));
  }
  if (series.length) {
    if (series[0].xd) noteAxisKind(ax, 'X', series[0].xd);
    if (series[0].yd) noteAxisKind(ax, 'Y', series[0].yd);
  }
  if (pairs.length) setPairs(ctx, out, pairs);
  return out;
}

function plotGeneric(ctx, args, opts = {}) {
  const lead = leadingAxes(ctx, args);
  const { series, pairs } = parseSeries(ctx, lead.args, opts.dim || 2);
  if (!series.length && !pairs.length) throw gerr('plot:notEnoughInputs', 'Not enough input arguments.');
  const { ax, held } = newplot(ctx, lead.ax, { polar: opts.polar });
  if (!held) {
    if (opts.xscale) ax.props.XScale = opts.xscale;
    if (opts.yscale) ax.props.YScale = opts.yscale;
    if (opts.dim === 3) { ax.props.View = [-37.5, 30]; ax.props.XGrid = ax.props.YGrid = ax.props.ZGrid = true; }
    if (opts.polar) { ax.props.ThetaLimMode = 'auto'; }
  }
  return makeLines(ctx, ax, series, pairs);
}

export const builtins = {
  plot(args, nargout, ctx) { return ret(ctx, plotGeneric(ctx, args)); },
  plot3(args, nargout, ctx) { return ret(ctx, plotGeneric(ctx, args, { dim: 3 })); },
  loglog(args, nargout, ctx) { return ret(ctx, plotGeneric(ctx, args, { xscale: 'log', yscale: 'log' })); },
  semilogx(args, nargout, ctx) { return ret(ctx, plotGeneric(ctx, args, { xscale: 'log' })); },
  semilogy(args, nargout, ctx) { return ret(ctx, plotGeneric(ctx, args, { yscale: 'log' })); },

  line(args, nargout, ctx) {
    const lead = leadingAxes(ctx, args);
    let a = lead.args;
    const ax = lead.ax || currentAxes(ctx, true);
    const p0 = pairsStart(a, 0);
    const data = a.slice(0, p0).map((v) => plotData(ctx, v));
    const pairs = a.slice(p0);
    const out = [];
    if (data.length >= 2) {
      const xs = columnsOf(data[0]), ys = columnsOf(data[1], data[0].data.length), zs = data[2] ? columnsOf(data[2]) : null;
      const k = Math.max(xs.length, ys.length);
      for (let j = 0; j < k; j++) {
        const style = nextSeriesStyle(ax);
        out.push(create(ctx, 'line', ax.id, { XData: vecMat(xs[Math.min(j, xs.length - 1)]), YData: vecMat(ys[Math.min(j, ys.length - 1)]), ZData: zs ? vecMat(zs[Math.min(j, zs.length - 1)]) : null, Color: style.color }));
      }
    } else {
      const style = nextSeriesStyle(ax);
      out.push(create(ctx, 'line', ax.id, { XData: vecMat([0, 1]), YData: vecMat([0, 1]), Color: style.color }));
    }
    setPairs(ctx, out, pairs);
    return ret(ctx, out);
  },

  // ------------------------------------------------------------ scatter
  scatter(args, nargout, ctx) { return scatterImpl(ctx, args, 2); },
  scatter3(args, nargout, ctx) { return scatterImpl(ctx, args, 3); },
  polarscatter(args, nargout, ctx) { return scatterImpl(ctx, args, 2, true); },

  // ------------------------------------------------------------ bars
  bar(args, nargout, ctx) { return barImpl(ctx, args, false); },
  barh(args, nargout, ctx) { return barImpl(ctx, args, true); },

  histogram(args, nargout, ctx) {
    const lead = leadingAxes(ctx, args);
    let a = lead.args;
    if (!a.length) throw gerr('histogram:notEnoughInputs', 'Not enough input arguments.');
    const d = plotData(ctx, a[0]);
    const p0 = pairsStart(a, 1);
    const extra = a.slice(1, p0);
    const { ax, held } = newplot(ctx, lead.ax);
    const style = nextSeriesStyle(ax);
    const o = create(ctx, 'histogram', ax.id, { Data: { dims: d.dims, data: d.data }, FaceColor: style.color, SeriesIndex: style.index });
    o.internal.autoColor = true;
    if (extra.length) {
      const e = nums(extra[0]);
      if (e.length === 1) { o.props.NumBins = Math.max(1, Math.round(e[0])); o.props.BinMethod = 'manual'; o.internal.binMode = 'num'; }
      else { o.props.BinEdges = Array.from(e); o.props.BinMethod = 'manual'; o.internal.binMode = 'edges'; }
    }
    setPairs(ctx, [o], a.slice(p0));
    computeHistogram(o);
    if (!held) { /* nothing */ }
    return ret(ctx, [o]);
  },
  hist(args, nargout, ctx) {
    const lead = leadingAxes(ctx, args);
    const a = lead.args;
    if (!a.length) throw gerr('hist:notEnoughInputs', 'Not enough input arguments.');
    const y = Array.from(nums(a[0])).filter(finite);
    let centers;
    if (a.length > 1) {
      const b = nums(a[1]);
      if (b.length === 1) centers = histCenters(y, Math.max(1, Math.round(b[0])));
      else centers = Array.from(b);
    } else centers = histCenters(y, 10);
    const edges = [-Infinity];
    for (let i = 1; i < centers.length; i++) edges.push((centers[i - 1] + centers[i]) / 2);
    edges.push(Infinity);
    const counts = centers.map(() => 0);
    for (const v of y) { let k = 0; while (k < centers.length - 1 && v >= edges[k + 1]) k++; counts[k]++; }
    if (nargout > 0) return [rowVec(counts), rowVec(centers)];
    const { ax } = newplot(ctx, lead.ax);
    const style = nextSeriesStyle(ax);
    const b = create(ctx, 'bar', ax.id, { XData: vecMat(centers), YData: vecMat(counts), BarWidth: 1, FaceColor: style.color });
    b.internal.group = b.id;
    return [];
  },
  histogram2(args, nargout, ctx) {
    const lead = leadingAxes(ctx, args);
    const a = lead.args;
    if (a.length < 2) throw gerr('histogram2:notEnoughInputs', 'histogram2 needs X and Y data.');
    const x = nums(a[0]), y = nums(a[1]);
    const p0 = pairsStart(a, 2);
    const { ax, held } = newplot(ctx, lead.ax);
    let nb = [10, 10];
    if (p0 > 2) { const b = nums(a[2]); nb = b.length === 1 ? [b[0], b[0]] : [b[0], b[1]]; }
    const data = new Float64Array(x.length * 2);
    data.set(x, 0); data.set(y.subarray(0, x.length), x.length);
    const o = create(ctx, 'histogram2', ax.id, { Data: { dims: [x.length, 2], data }, NumBins: nb });
    setPairs(ctx, [o], a.slice(p0));
    computeHistogram2(o);
    if (!held) { ax.props.View = o.props.DisplayStyle === 'tile' ? [0, 90] : [-37.5, 30]; ax.props.XGrid = ax.props.YGrid = ax.props.ZGrid = true; }
    // drawn as a patch of boxes (bar3) or tiles
    buildHist2Patch(ctx, ax, o);
    return ret(ctx, [o]);
  },

  area(args, nargout, ctx) {
    const lead = leadingAxes(ctx, args);
    let a = lead.args;
    const p0 = pairsStart(a, 0);
    const data = a.slice(0, p0).filter((v) => !isTxt(v)).map((v) => plotData(ctx, v));
    let base = 0;
    let X, Y;
    if (data.length === 1) Y = data[0];
    else if (data.length === 2 && data[1].data.length === 1 && data[0].data.length > 1) { Y = data[0]; base = data[1].data[0]; }
    else if (data.length >= 2) { X = data[0]; Y = data[1]; if (data[2]) base = data[2].data[0]; }
    else throw gerr('area:notEnoughInputs', 'Not enough input arguments.');
    const cols = columnsOf(Y, X ? X.data.length : null);
    const n = cols[0].length;
    const x = X ? Array.from(X.data).slice(0, n) : Array.from({ length: n }, (_, i) => i + 1);
    const { ax } = newplot(ctx, lead.ax);
    const out = [];
    let group = null;
    for (const c of cols) {
      const style = nextSeriesStyle(ax);
      const o = create(ctx, 'area', ax.id, { XData: vecMat(x), YData: vecMat(c), BaseValue: base, FaceColor: style.color, SeriesIndex: style.index });
      if (group == null) group = o.id;
      o.internal.group = group;
      out.push(o);
    }
    setPairs(ctx, out, a.slice(p0));
    return ret(ctx, out, true);
  },

  stairs(args, nargout, ctx) {
    const lead = leadingAxes(ctx, args);
    const { series, pairs } = parseSeries(ctx, lead.args, 2);
    if (nargout >= 2) {
      const s = series[0];
      const xs = [], ys = [];
      for (let i = 0; i < s.y.length; i++) { if (i > 0) { xs.push(s.x[i]); ys.push(s.y[i - 1]); } xs.push(s.x[i]); ys.push(s.y[i]); }
      return [tensor('double', [xs.length, 1], xs), tensor('double', [ys.length, 1], ys)];
    }
    const { ax } = newplot(ctx, lead.ax);
    return ret(ctx, makeLines(ctx, ax, series, pairs, 'stair'));
  },

  stem(args, nargout, ctx) { return stemImpl(ctx, args, 2); },
  stem3(args, nargout, ctx) { return stemImpl(ctx, args, 3); },

  errorbar(args, nargout, ctx) {
    const lead = leadingAxes(ctx, args);
    let a = lead.args.slice();
    let spec = null, ornt = 'vertical';
    const p0 = (() => { for (let i = 0; i < a.length; i++) if (isTxt(a[i])) { const s = lower(txt(a[i])); if (['vertical', 'horizontal', 'both'].includes(s)) { ornt = s; a.splice(i, 1); i--; continue; } const sp = lineSpecOf(a[i]); if (sp && !spec && (a.length - i) % 2 === 1) { spec = sp; a.splice(i, 1); i--; continue; } return i; } return a.length; })();
    const d = a.slice(0, p0).map((v) => Array.from(nums(v)));
    let x, y, yn, yp, xn = null, xp = null;
    if (d.length === 2) { y = d[0]; x = y.map((_, i) => i + 1); yn = yp = d[1]; }
    else if (d.length === 3) { [x, y] = d; if (ornt === 'horizontal') { xn = xp = d[2]; yn = yp = null; } else if (ornt === 'both') { xn = xp = yn = yp = d[2]; } else { yn = yp = d[2]; } }
    else if (d.length === 4) { [x, y] = d; if (ornt === 'horizontal') { xn = d[2]; xp = d[3]; yn = yp = null; } else { yn = d[2]; yp = d[3]; } }
    else if (d.length === 6) { [x, y, yn, yp, xn, xp] = d; }
    else throw gerr('errorbar:args', 'errorbar expects (y,err), (x,y,err), (x,y,neg,pos) or (x,y,yneg,ypos,xneg,xpos).');
    const fix = (e) => (e == null ? null : e.length === 1 ? y.map(() => e[0]) : e);
    const { ax } = newplot(ctx, lead.ax);
    const style = nextSeriesStyle(ax);
    const props = { XData: vecMat(x), YData: vecMat(y), YNegativeDelta: yn ? vecMat(fix(yn)) : null, YPositiveDelta: yp ? vecMat(fix(yp)) : null, XNegativeDelta: xn ? vecMat(fix(xn)) : null, XPositiveDelta: xp ? vecMat(fix(xp)) : null };
    applySpec(props, spec, style);
    const o = create(ctx, 'errorbar', ax.id, props);
    setPairs(ctx, [o], a.slice(p0));
    return ret(ctx, [o]);
  },

  // ------------------------------------------------------------ patches
  fill(args, nargout, ctx) { return fillImpl(ctx, args, 2); },
  fill3(args, nargout, ctx) { return fillImpl(ctx, args, 3); },
  patch(args, nargout, ctx) { return patchImpl(ctx, args); },

  text(args, nargout, ctx) {
    const lead = leadingAxes(ctx, args);
    const a = lead.args;
    const ax = lead.ax || currentAxes(ctx, true);
    let k = 0;
    const coords = [];
    while (k < a.length && !isTxt(a[k]) && !isCell(a[k]) && (a[k].cls !== 'string')) { coords.push(Array.from(nums(a[k]))); k++; }
    if (coords.length < 2 || k >= a.length) {
      // text('Position',..,'String',..)
      const o = create(ctx, 'text', ax.id, {});
      setPairs(ctx, [o], a, coords.length ? k : 0);
      return ret(ctx, [o]);
    }
    const strings = (() => { const v = a[k]; if (isCell(v) || v.cls === 'string') return txtList(v); return [txt(v)]; })();
    const pairs = a.slice(k + 1);
    const n = coords[0].length;
    const out = [];
    if (n === 1) {
      out.push(create(ctx, 'text', ax.id, { Position: [coords[0][0], coords[1][0], coords[2] ? coords[2][0] : 0], String: strings.length === 1 ? strings[0] : strings }));
    } else {
      for (let i = 0; i < n; i++) out.push(create(ctx, 'text', ax.id, { Position: [coords[0][i], coords[1][i], coords[2] ? coords[2][i] : 0], String: strings[Math.min(i, strings.length - 1)] ?? '' }));
    }
    setPairs(ctx, out, pairs);
    return ret(ctx, out);
  },

  rectangle(args, nargout, ctx) {
    const lead = leadingAxes(ctx, args);
    const ax = lead.ax || currentAxes(ctx, true);
    const o = create(ctx, 'rectangle', ax.id, {});
    setPairs(ctx, [o], lead.args);
    return ret(ctx, [o]);
  },

  image(args, nargout, ctx) { return imageImpl(ctx, args, 'image'); },
  imagesc(args, nargout, ctx) { return imageImpl(ctx, args, 'imagesc'); },
  imshow(args, nargout, ctx) { return imageImpl(ctx, args, 'imshow'); },

  pcolor(args, nargout, ctx) {
    const lead = leadingAxes(ctx, args);
    const a = lead.args;
    let X, Y, C;
    if (a.length === 1) C = matOfValue(a[0]);
    else if (a.length >= 3) { X = matOfValue(a[0]); Y = matOfValue(a[1]); C = matOfValue(a[2]); }
    else throw gerr('pcolor:args', 'pcolor expects C or X, Y, C.');
    const [m, n] = C.dims;
    const { ax, held } = newplot(ctx, lead.ax);
    const o = create(ctx, 'surface', ax.id, {
      XData: X || vecMat(Array.from({ length: n }, (_, j) => j + 1)), YData: Y || colMat(Array.from({ length: m }, (_, i) => i + 1)),
      ZData: { dims: [m, n], data: new Float64Array(m * n) }, CData: C, FaceColor: 'flat', EdgeColor: [0, 0, 0],
    });
    if (!held) { ax.props.View = [0, 90]; ax.props.XLimitMethod = 'tight'; ax.props.YLimitMethod = 'tight'; ax.props.Box = true; ax.props.Layer = 'top'; }
    return ret(ctx, [o]);
  },

  // ------------------------------------------------------------ polar
  polarplot(args, nargout, ctx) { return ret(ctx, plotGeneric(ctx, args, { polar: true })); },
  polar(args, nargout, ctx) { return ret(ctx, plotGeneric(ctx, args, { polar: true })); },
  compass(args, nargout, ctx) {
    const lead = leadingAxes(ctx, args);
    let a = lead.args;
    let spec = null;
    if (a.length && isTxt(a[a.length - 1])) { spec = lineSpecOf(a[a.length - 1]); a = a.slice(0, -1); }
    let U, V;
    if (a.length === 1) { const d = plotData(ctx, a[0]); U = Array.from(d.data); V = d.im ? Array.from(d.im) : U.map(() => 0); }
    else { U = Array.from(nums(a[0])); V = Array.from(nums(a[1])); }
    const { ax } = newplot(ctx, lead.ax, { polar: true });
    const style = nextSeriesStyle(ax);
    const out = [];
    for (let i = 0; i < U.length; i++) {
      const th = Math.atan2(V[i], U[i]), r = Math.hypot(U[i], V[i]);
      const hl = r * 0.12, ha = 0.25 * (r > 0 ? 1 : 0);
      const tx = [0, th, th + (r > 0 ? Math.atan2(hl * Math.sin(ha), r - hl * Math.cos(ha)) : 0), th, th - (r > 0 ? Math.atan2(hl * Math.sin(ha), r - hl * Math.cos(ha)) : 0)];
      const rr = [0, r, Math.hypot(r - hl * Math.cos(ha), hl * Math.sin(ha)), r, Math.hypot(r - hl * Math.cos(ha), hl * Math.sin(ha))];
      const props = { XData: vecMat(tx), YData: vecMat(rr) };
      applySpec(props, spec, style);
      if (props.LineStyle === 'none') props.LineStyle = '-';
      out.push(create(ctx, 'line', ax.id, props));
    }
    return ret(ctx, out);
  },
  feather(args, nargout, ctx) {
    const lead = leadingAxes(ctx, args);
    let a = lead.args;
    let spec = null;
    if (a.length && isTxt(a[a.length - 1])) { spec = lineSpecOf(a[a.length - 1]); a = a.slice(0, -1); }
    let U, V;
    if (a.length === 1) { const d = plotData(ctx, a[0]); U = Array.from(d.data); V = d.im ? Array.from(d.im) : U.map(() => 0); }
    else { U = Array.from(nums(a[0])); V = Array.from(nums(a[1])); }
    const { ax, held } = newplot(ctx, lead.ax);
    const style = nextSeriesStyle(ax);
    const out = [];
    for (let i = 0; i < U.length; i++) {
      const x0 = i + 1, x1 = x0 + U[i], y1 = V[i];
      const len = Math.hypot(U[i], V[i]) || 1;
      const hx = -U[i] / len * 0.2 * len, hy = -V[i] / len * 0.2 * len;
      const c = Math.cos(0.35), s = Math.sin(0.35);
      const props = { XData: vecMat([x0, x1, x1 + c * hx - s * hy, x1, x1 + c * hx + s * hy]), YData: vecMat([0, y1, y1 + s * hx + c * hy, y1, y1 - s * hx + c * hy]) };
      applySpec(props, spec, style);
      if (props.LineStyle === 'none') props.LineStyle = '-';
      out.push(create(ctx, 'line', ax.id, props));
    }
    out.push(create(ctx, 'line', ax.id, { XData: vecMat([0, U.length + 1]), YData: vecMat([0, 0]), Color: [0.5, 0.5, 0.5], LineStyle: ':' }));
    out[out.length - 1].internal.noLegend = true;
    if (!held) { ax.props.DataAspectRatio = [1, 1, 1]; ax.props.DataAspectRatioMode = 'manual'; }
    return ret(ctx, out);
  },
  rose(args, nargout, ctx) {
    const lead = leadingAxes(ctx, args);
    const a = lead.args;
    const th = Array.from(nums(a[0])).filter(finite).map((t) => ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
    let nb = 20;
    if (a.length > 1) nb = Math.max(1, Math.round(nums(a[1])[0]));
    const w = (2 * Math.PI) / nb;
    const counts = new Array(nb).fill(0);
    for (const t of th) counts[Math.min(nb - 1, Math.floor(t / w))]++;
    const tt = [], rr = [];
    for (let k = 0; k < nb; k++) { tt.push(0, k * w, (k + 1) * w, 0); rr.push(0, counts[k], counts[k], 0); }
    if (nargout > 0) return [rowVec(tt), rowVec(rr)];
    const { ax } = newplot(ctx, lead.ax, { polar: true });
    const style = nextSeriesStyle(ax);
    return ret(ctx, [create(ctx, 'line', ax.id, { XData: vecMat(tt), YData: vecMat(rr), Color: style.color })]);
  },
  polarhistogram(args, nargout, ctx) { return builtins.rose(args, nargout, ctx); },

  // ------------------------------------------------------------ animated lines
  animatedline(args, nargout, ctx) {
    const lead = leadingAxes(ctx, args);
    let a = lead.args;
    const ax = lead.ax || currentAxes(ctx, true);
    const style = nextSeriesStyle(ax);
    const props = { XData: vecMat([]), YData: vecMat([]), Color: style.color };
    let k = 0;
    const data = [];
    while (k < a.length && !isTxt(a[k])) { data.push(Array.from(nums(a[k]))); k++; }
    if (data.length >= 2) { props.XData = vecMat(data[0]); props.YData = vecMat(data[1]); if (data[2]) props.ZData = vecMat(data[2]); }
    if (k < a.length && (a.length - k) % 2 === 1) { const sp = lineSpecOf(a[k]); if (sp) { applySpec(props, sp, style); k++; } }
    const o = create(ctx, 'animatedline', ax.id, props);
    setPairs(ctx, [o], a.slice(k));
    return ret(ctx, [o]);
  },
  addpoints(args, nargout, ctx) {
    if (args.length < 3) throw gerr('addpoints:args', 'addpoints(h, x, y) or addpoints(h, x, y, z).');
    const [o] = objsOf(ctx, args[0]);
    if (o.type !== 'animatedline') throw gerr('addpoints:type', 'addpoints needs an animated line.');
    const x = nums(args[1]), y = nums(args[2]), z = args[3] ? nums(args[3]) : null;
    const cat = (M, add) => { const old = M ? Array.from(M.data) : []; return old.concat(Array.from(add)); };
    let X = cat(o.props.XData, x), Y = cat(o.props.YData, y), Z = z ? cat(o.props.ZData, z) : null;
    const max = o.props.MaximumNumPoints;
    if (X.length > max) { const d = X.length - max; X = X.slice(d); Y = Y.slice(d); if (Z) Z = Z.slice(d); }
    o.props.XData = vecMat(X); o.props.YData = vecMat(Y); if (Z) o.props.ZData = vecMat(Z);
    touch(G(ctx), o);
    return [];
  },
  clearpoints(args, nargout, ctx) {
    for (const o of objsOf(ctx, args[0])) { o.props.XData = vecMat([]); o.props.YData = vecMat([]); o.props.ZData = null; touch(G(ctx), o); }
    return [];
  },
  getpoints(args, nargout, ctx) {
    const [o] = objsOf(ctx, args[0]);
    const v = (M) => rowVec(M ? Array.from(M.data) : []);
    return [v(o.props.XData), v(o.props.YData), v(o.props.ZData)];
  },

  // ------------------------------------------------------------ function plots
  fplot(args, nargout, ctx) {
    const lead = leadingAxes(ctx, args);
    let a = lead.args;
    if (!a.length) throw gerr('fplot:args', 'fplot needs a function.');
    let fx = toFunc(ctx, a[0]), fy = null;
    let k = 1;
    if (a.length > 1 && (isFuncHandle(a[1]) || (isTxt(a[1]) && /[a-z]\(|x/.test(txt(a[1])) && !lineSpecOf(a[1])))) { fy = toFunc(ctx, a[1]); k = 2; }
    let range = [-5, 5];
    if (k < a.length && isNum(a[k])) { range = Array.from(nums(a[k])); k++; }
    let spec = null;
    if (k < a.length && (a.length - k) % 2 === 1) { spec = lineSpecOf(a[k]); k++; }
    const t = adaptiveSample(ctx, fx, range[0], range[1]);
    let X, Y;
    if (fy) { X = evalVec(ctx, fx, t); Y = evalVec(ctx, fy, t); } else { X = t; Y = evalVec(ctx, fx, t); }
    const { ax, held } = newplot(ctx, lead.ax);
    if (!held && !fy) { ax.props.XLim = [range[0], range[1]]; ax.props.XLimMode = 'manual'; }
    const style = nextSeriesStyle(ax);
    const props = { XData: vecMat(X), YData: vecMat(Y) };
    applySpec(props, spec, style);
    const o = create(ctx, 'line', ax.id, props);
    o.internal.func = true;
    setPairs(ctx, [o], a.slice(k));
    return ret(ctx, [o]);
  },
  fplot3(args, nargout, ctx) {
    const lead = leadingAxes(ctx, args);
    const a = lead.args;
    const fx = toFunc(ctx, a[0]), fy = toFunc(ctx, a[1]), fz = toFunc(ctx, a[2]);
    let k = 3, range = [-5, 5];
    if (k < a.length && isNum(a[k])) { range = Array.from(nums(a[k])); k++; }
    const t = Array.from(linspace(range[0], range[1], 400));
    const { ax, held } = newplot(ctx, lead.ax);
    if (!held) { ax.props.View = [-37.5, 30]; ax.props.XGrid = ax.props.YGrid = ax.props.ZGrid = true; }
    const style = nextSeriesStyle(ax);
    const o = create(ctx, 'line', ax.id, { XData: vecMat(evalVec(ctx, fx, t)), YData: vecMat(evalVec(ctx, fy, t)), ZData: vecMat(evalVec(ctx, fz, t)), Color: style.color });
    setPairs(ctx, [o], a.slice(k));
    return ret(ctx, [o]);
  },
  fimplicit(args, nargout, ctx) { return fimplicitImpl(ctx, args); },
  ezplot(args, nargout, ctx) {
    const lead = leadingAxes(ctx, args);
    const a = lead.args;
    if (!a.length) throw gerr('ezplot:args', 'ezplot needs a function.');
    if (isTxt(a[0])) {
      const vars = exprVars(txt(a[0]));
      if (vars.length >= 2) return fimplicitImpl(ctx, [...(lead.ax ? [handleValue(ctx, [lead.ax.id])] : []), ...a]);
    } else if (isFuncHandle(a[0]) && a[0].params && a[0].params.length >= 2) return fimplicitImpl(ctx, args);
    const range = a.length > 1 && isNum(a[1]) ? Array.from(nums(a[1])) : [-2 * Math.PI, 2 * Math.PI];
    const h = builtins.fplot([...(lead.ax ? [handleValue(ctx, [lead.ax.id])] : []), a[0], rowVec(range.slice(0, 2))], 1, ctx);
    const ax = currentAxes(ctx, false);
    if (ax) { const t = G(ctx).objs.get(ax.props.Title); if (t) { t.props.String = isTxt(a[0]) ? txt(a[0]) : (a[0].text || ''); touch(G(ctx), t); } }
    return h;
  },

  // ------------------------------------------------------------ pie / boxplot / heatmap
  pie(args, nargout, ctx) { return pieImpl(ctx, args, false); },
  pie3(args, nargout, ctx) { return pieImpl(ctx, args, true); },
  boxplot(args, nargout, ctx) { return boxplotImpl(ctx, args); },
  heatmap(args, nargout, ctx) { return heatmapImpl(ctx, args); },

  xline(args, nargout, ctx) { return constLine(ctx, args, 'x'); },
  yline(args, nargout, ctx) { return constLine(ctx, args, 'y'); },
};

// ---------------------------------------------------------------- scatter

function scatterImpl(ctx, args, dim, polar = false) {
  const lead = leadingAxes(ctx, args);
  let a = lead.args.slice();
  let filled = false, marker = null;
  for (let i = a.length - 1; i >= dim; i--) {
    if (isTxt(a[i]) && lower(txt(a[i])) === 'filled') { filled = true; a.splice(i, 1); }
  }
  const p0 = (() => { for (let i = dim; i < a.length; i++) if (isTxt(a[i])) { const s = txt(a[i]); const sp = lineSpecOf(a[i]); if (sp && sp.marker && !sp.color && (a.length - i) % 2 === 1) { marker = sp.marker; a.splice(i, 1); i--; continue; } if (colorFromText(s) && i === dim + 1 && (a.length - i) % 2 === 1) continue; return i; } return a.length; })();
  if (p0 < dim) throw gerr('scatter:args', `scatter needs ${dim === 3 ? 'X, Y and Z' : 'X and Y'} data.`);
  const xd = plotData(ctx, a[0]), yd = plotData(ctx, a[1]), zd = dim === 3 ? plotData(ctx, a[2]) : null;
  const n = xd.data.length;
  if (yd.data.length !== n || (zd && zd.data.length !== n)) throw gerr('scatter:size', 'X, Y (and Z) must be the same length.');
  const S = p0 > dim && !isTxt(a[dim]) ? Array.from(nums(a[dim])) : null;
  const Cv = p0 > dim + 1 ? a[dim + 1] : null;
  const { ax, held } = newplot(ctx, lead.ax, { polar });
  if (!held && dim === 3) { ax.props.View = [-37.5, 30]; ax.props.XGrid = ax.props.YGrid = ax.props.ZGrid = true; }
  const style = nextSeriesStyle(ax);
  const props = { XData: vecMat(xd.data), YData: vecMat(yd.data), ZData: zd ? vecMat(zd.data) : null, SizeData: S && S.length ? vecMat(S.length === 0 ? [36] : S) : vecMat([36]), SeriesIndex: style.index };
  props.CData = vecMat(style.color);
  props.CData = { dims: [1, 3], data: Float64Array.from(style.color) };
  if (Cv && !(Cv.dims && Cv.dims.includes(0))) {
    if (isTxt(Cv)) { const c = parseColor(Cv); props.CData = { dims: [1, 3], data: Float64Array.from(c) }; }
    else {
      const M = matOfValue(Cv);
      if (M.dims[1] === 3 && (M.dims[0] === n || M.dims[0] === 1) && !(M.dims[0] === 1 && n === 3)) props.CData = M;
      else props.CData = { dims: [M.data.length, 1], data: M.data };
    }
  }
  if (marker) props.Marker = marker;
  if (filled) props.MarkerFaceColor = 'flat';
  noteAxisKind(ax, 'X', xd); noteAxisKind(ax, 'Y', yd);
  const o = create(ctx, 'scatter', ax.id, props);
  setPairs(ctx, [o], a.slice(p0));
  return ret(ctx, [o]);
}

// ---------------------------------------------------------------- bar

function barImpl(ctx, args, horizontal) {
  const lead = leadingAxes(ctx, args);
  let a = lead.args.slice();
  let layout = 'grouped', width = 0.8, color = null;
  const p0 = (() => {
    for (let i = 0; i < a.length; i++) {
      if (!isTxt(a[i])) continue;
      const s = lower(txt(a[i]));
      if (['grouped', 'stacked', 'hist', 'histc'].includes(s)) { layout = s === 'stacked' ? 'stacked' : 'grouped'; if (s.startsWith('hist')) width = 1; a.splice(i, 1); i--; continue; }
      const c = colorFromText(s);
      if (c && s.length === 1 && (a.length - i) % 2 === 1) { color = c; a.splice(i, 1); i--; continue; }
      return i;
    }
    return a.length;
  })();
  const data = a.slice(0, p0).map((v) => plotData(ctx, v));
  let X = null, Y;
  if (data.length === 1) Y = data[0];
  else if (data.length === 2 && data[1].data.length === 1 && data[0].data.length > 1) { Y = data[0]; width = data[1].data[0]; }
  else if (data.length >= 2) { X = data[0]; Y = data[1]; if (data[2]) width = data[2].data[0]; }
  else throw gerr('bar:notEnoughInputs', 'Not enough input arguments.');
  const isVecY = Y.dims[0] === 1 || Y.dims[1] === 1;
  let cols;
  if (isVecY) cols = [Array.from(Y.data)];
  else cols = columnsOf(Y, X ? X.data.length : Y.dims[0]);
  if (!isVecY && X && Y.dims[0] !== X.data.length && Y.dims[1] === X.data.length) cols = columnsOf(Y, X.data.length);
  const n = cols[0].length;
  const x = X ? Array.from(X.data) : Array.from({ length: n }, (_, i) => i + 1);
  if (x.length !== n) throw gerr('bar:size', 'X must have the same number of elements as rows of Y.');
  const { ax } = newplot(ctx, lead.ax);
  const out = [];
  let group = null;
  for (const c of cols) {
    const style = nextSeriesStyle(ax);
    const o = create(ctx, 'bar', ax.id, { XData: vecMat(x), YData: vecMat(c), BarWidth: width, BarLayout: layout, Horizontal: horizontal, FaceColor: color || style.color, SeriesIndex: style.index });
    if (group == null) group = o.id;
    o.internal.group = group;
    out.push(o);
  }
  if (X) noteAxisKind(ax, horizontal ? 'Y' : 'X', X);
  setPairs(ctx, out, a.slice(p0));
  return ret(ctx, out, true);
}

// ---------------------------------------------------------------- histogram

function histCenters(y, n) {
  const [lo, hi] = finiteMinMax(y);
  if (!(lo <= hi)) return Array.from({ length: n }, (_, i) => i + 1);
  if (lo === hi) return Array.from({ length: n }, (_, i) => lo - n / 2 + i + 0.5);
  const w = (hi - lo) / n;
  return Array.from({ length: n }, (_, i) => lo + w * (i + 0.5));
}

/** Bin edges and values of a histogram object (recomputed from its props). */
export function computeHistogram(o) {
  const p = o.props;
  const data = p.Data ? Array.from(p.Data.data).filter(finite) : [];
  let edges;
  const [lo0, hi0] = finiteMinMax(data);
  const has = lo0 <= hi0;
  const lims = o.internal.binLimits ? p.BinLimits : (has ? [lo0, hi0] : [0, 1]);
  const mode = o.internal.binMode;
  if (mode === 'edges') edges = p.BinEdges.slice();
  else if (mode === 'num') {
    const n = Math.max(1, p.NumBins);
    let [a, b] = lims;
    if (a === b) { a -= 0.5; b += 0.5; }
    const w = niceNum((b - a) / n, false);
    const start = o.internal.binLimits ? a : Math.floor(a / w) * w;
    if (!o.internal.binLimits && start + n * w >= b) edges = Array.from({ length: n + 1 }, (_, i) => Number((start + i * w).toPrecision(12)));
    else edges = Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
  } else if (mode === 'width') {
    const w = p.BinWidth;
    const [a, b] = lims;
    const s = Math.floor(a / w) * w;
    edges = [];
    for (let v = s; v <= b + w * 1e-9 || edges.length < 2; v += w) { edges.push(Number(v.toPrecision(12))); if (edges.length > 100000) break; }
    if (edges[edges.length - 1] < b) edges.push(edges[edges.length - 1] + w);
  } else {
    // automatic: integers rule or Scott's rule with a nice width
    const [a, b] = lims;
    const allInt = data.length && data.every((v) => Number.isInteger(v)) && b - a <= 50;
    if (!has) edges = [0, 1];
    else if (allInt) { edges = []; for (let v = a - 0.5; v <= b + 0.5 + 1e-9; v++) edges.push(v); }
    else if (a === b) edges = [a - 0.5, a + 0.5];
    else {
      const n = data.length;
      const mean = data.reduce((s, v) => s + v, 0) / n;
      const sd = Math.sqrt(data.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, n - 1));
      let w = 3.5 * sd * n ** (-1 / 3);
      if (!(w > 0)) w = (b - a) / 10;
      w = niceNum(Math.max(w, (b - a) / 1000), true);
      const s = Math.floor(a / w) * w;
      edges = [];
      for (let v = s; ; v += w) { edges.push(Number(v.toPrecision(12))); if (v >= b || edges.length > 10000) break; }
      if (edges.length < 2) edges.push(edges[0] + w);
    }
  }
  const counts = new Array(Math.max(0, edges.length - 1)).fill(0);
  for (const v of data) {
    if (v < edges[0] || v > edges[edges.length - 1]) continue;
    let lo = 0, hi = edges.length - 2;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (v >= edges[mid]) lo = mid; else hi = mid - 1; }
    counts[lo]++;
  }
  const N = data.length || 1;
  const widths = counts.map((_, i) => edges[i + 1] - edges[i]);
  let vals = counts.slice();
  switch (p.Normalization) {
    case 'probability': vals = counts.map((c) => c / N); break;
    case 'percentage': vals = counts.map((c) => (100 * c) / N); break;
    case 'countdensity': vals = counts.map((c, i) => c / widths[i]); break;
    case 'pdf': vals = counts.map((c, i) => c / N / widths[i]); break;
    case 'cumcount': { let s = 0; vals = counts.map((c) => (s += c)); break; }
    case 'cdf': { let s = 0; vals = counts.map((c) => (s += c) / N); break; }
    default: break;
  }
  p.BinEdges = edges;
  p.NumBins = counts.length;
  if (edges.length > 1) p.BinWidth = Number((edges[1] - edges[0]).toPrecision(12));
  p.BinLimits = [edges[0], edges[edges.length - 1]];
  o.internal.counts = counts;
  o.internal.values = vals;
}

for (const [name, mode] of [['NumBins', 'num'], ['BinEdges', 'edges'], ['BinWidth', 'width']]) {
  onSet(['histogram'], name, (ctx, o, x) => { o.props[name] = x; o.internal.binMode = mode; computeHistogram(o); return true; });
}
onSet(['histogram'], 'BinLimits', (ctx, o, x) => { o.props.BinLimits = x; o.internal.binLimits = true; if (!o.internal.binMode) o.internal.binMode = 'num'; computeHistogram(o); return true; });
for (const name of ['Data', 'Normalization', 'BinMethod']) {
  onSet(['histogram'], name, (ctx, o, x) => { o.props[name] = x; if (name === 'BinMethod' && x !== 'manual') o.internal.binMode = null; computeHistogram(o); return true; });
}
onGet(['histogram'], 'Values', (ctx, o) => rowVec(o.internal.values || []));
onGet(['histogram'], 'BinCounts', (ctx, o) => rowVec(o.internal.counts || []));
onGet(['histogram2'], 'Values', (ctx, o) => { const V = o.internal.values2; return V ? tensor('double', V.dims, V.data) : empty(); });

function computeHistogram2(o) {
  const p = o.props;
  const D = p.Data;
  const n = D ? D.dims[0] : 0;
  const x = D ? D.data.subarray(0, n) : [], y = D ? D.data.subarray(n, 2 * n) : [];
  const edgesFor = (arr, nb, given) => {
    if (given && given.length > 1) return given.slice();
    const [lo, hi] = finiteMinMax(arr);
    if (!(lo <= hi)) return [0, 1];
    const w = niceNum((hi - lo || 1) / nb, false);
    const s = Math.floor(lo / w) * w;
    const e = [];
    for (let v = s; ; v += w) { e.push(Number(v.toPrecision(12))); if (v >= hi || e.length > 1000) break; }
    if (e.length < 2) e.push(e[0] + w);
    return e;
  };
  const ex = edgesFor(x, p.NumBins[0] || 10, p.XBinEdges), ey = edgesFor(y, p.NumBins[1] || p.NumBins[0] || 10, p.YBinEdges);
  const nx = ex.length - 1, ny = ey.length - 1;
  const V = new Float64Array(nx * ny);
  const find = (e, v) => { if (v < e[0] || v > e[e.length - 1]) return -1; let k = 0; while (k < e.length - 2 && v >= e[k + 1]) k++; return k; };
  for (let i = 0; i < n; i++) { const a = find(ex, x[i]), b = find(ey, y[i]); if (a >= 0 && b >= 0) V[a + b * nx]++; }
  if (p.Normalization === 'probability') for (let k = 0; k < V.length; k++) V[k] /= n || 1;
  p.XBinEdges = ex; p.YBinEdges = ey;
  o.internal.values2 = { dims: [nx, ny], data: V };
}

function buildHist2Patch(ctx, ax, o) {
  const p = o.props;
  const V = o.internal.values2;
  const ex = p.XBinEdges, ey = p.YBinEdges;
  const verts = [], faces = [], cdata = [];
  const tile = p.DisplayStyle === 'tile';
  const [nx, ny] = V.dims;
  const add = (pts) => { const base = verts.length; verts.push(...pts); return base; };
  for (let a = 0; a < nx; a++) for (let b = 0; b < ny; b++) {
    const v = V.data[a + b * nx];
    if (!v && !p.ShowEmptyBins) continue;
    const x0 = ex[a], x1 = ex[a + 1], y0 = ey[b], y1 = ey[b + 1];
    if (tile) {
      const k = add([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]]);
      faces.push([k + 1, k + 2, k + 3, k + 4]); cdata.push(v);
    } else {
      const k = add([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0], [x0, y0, v], [x1, y0, v], [x1, y1, v], [x0, y1, v]]);
      for (const f of [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) { faces.push(f.map((q) => q + k + 1)); cdata.push(v); }
    }
  }
  const color = tile ? 'flat' : peekSeriesColor(ax);
  const patch = create(ctx, 'patch', o.id === ax.id ? ax.id : ax.id, {
    Vertices: matOfRows(verts.length ? verts : [[0, 0, 0]]), Faces: matOfRows(faces.length ? faces : [[1, 1, 1]]), FaceVertexCData: colMat(cdata.length ? cdata : [0]),
    FaceColor: color, EdgeColor: [0.15, 0.15, 0.15], FaceLighting: 'none',
  });
  patch.internal.noLegend = true;
  o.internal.patch = patch.id;
  o.props.Visible = true;
}

// ---------------------------------------------------------------- stem

function stemImpl(ctx, args, dim) {
  const lead = leadingAxes(ctx, args);
  let a = lead.args.slice();
  let filled = false;
  a = a.filter((v) => !(isTxt(v) && lower(txt(v)) === 'filled' && (filled = true)));
  const { series, pairs } = parseSeries(ctx, a, dim === 3 && a.filter((v) => !isTxt(v)).length >= 3 ? 3 : 2);
  const { ax, held } = newplot(ctx, lead.ax);
  if (!held && dim === 3) { ax.props.View = [-37.5, 30]; ax.props.XGrid = ax.props.YGrid = ax.props.ZGrid = true; }
  const out = [];
  for (const s of series) {
    const style = nextSeriesStyle(ax);
    const props = { XData: vecMat(s.x), YData: vecMat(s.y), ZData: s.z ? vecMat(s.z) : null };
    applySpec(props, s.spec, style);
    if (!s.spec || !s.spec.marker) props.Marker = 'o';
    if (props.LineStyle === 'none' && !(s.spec && s.spec.lineStyle === 'none')) props.LineStyle = '-';
    if (filled) props.MarkerFaceColor = props.Color;
    out.push(create(ctx, 'stem', ax.id, props));
  }
  setPairs(ctx, out, pairs);
  return ret(ctx, out);
}

// ---------------------------------------------------------------- fill / patch

function colorArg(v) {
  if (isTxt(v)) return { face: parseColor(v) };
  const M = matOfValue(v);
  if (M.data.length === 3 && (M.dims[0] === 1 || M.dims[1] === 1)) return { face: Array.from(M.data) };
  return { cdata: M };
}

function polysToPatch(xcols, ycols, zcols) {
  const nf = xcols.length;
  const nv = Math.max(...xcols.map((c) => c.length));
  const verts = [], faces = [];
  for (let f = 0; f < nf; f++) {
    const face = [];
    for (let k = 0; k < nv; k++) {
      if (k < xcols[f].length) { verts.push(zcols ? [xcols[f][k], ycols[f][k], zcols[f][k]] : [xcols[f][k], ycols[f][k]]); face.push(verts.length); } else face.push(NaN);
    }
    faces.push(face);
  }
  return { Vertices: matOfRows(verts), Faces: matOfRows(faces) };
}

function makePatchFromXY(ctx, ax, X, Y, Z, C, extraProps = {}) {
  const ref = X.dims[0] === 1 ? X.dims[1] : X.dims[0];
  const xc = columnsOf(X), yc = columnsOf(Y, ref), zc = Z ? columnsOf(Z, ref) : null;
  const props = { ...polysToPatch(xc, yc, zc), XData: X, YData: Y, ZData: Z || null, ...extraProps };
  if (C) {
    if (C.face) { props.FaceColor = C.face; }
    else {
      const M = C.cdata;
      const nf = xc.length;
      if (M.dims.length === 3 && M.dims[2] === 3) { // truecolor per face (1×nf×3) or per vertex (m×nf×3)
        const nper = M.dims[0] * M.dims[1];
        const rows = [];
        for (let i = 0; i < nper; i++) rows.push([M.data[i], M.data[i + nper], M.data[i + 2 * nper]]);
        props.FaceVertexCData = matOfRows(rows);
        props.FaceColor = M.dims[0] === 1 ? 'flat' : 'interp';
      } else if (M.data.length === nf) { props.FaceVertexCData = colMat(Array.from(M.data)); props.FaceColor = 'flat'; }
      else { props.FaceVertexCData = colMat(Array.from(M.data)); props.FaceColor = 'interp'; }
      props.CData = M;
    }
  }
  return create(ctx, 'patch', ax.id, props);
}

function fillImpl(ctx, args, dim) {
  const lead = leadingAxes(ctx, args);
  const a = lead.args;
  const p0 = (() => { for (let i = dim; i < a.length; i++) if (isTxt(a[i]) && !(i % (dim + 1) === dim && colorFromText(txt(a[i])))) return i; return a.length; })();
  const { ax, held } = newplot(ctx, lead.ax);
  if (dim === 3 && !held) { ax.props.View = [-37.5, 30]; ax.props.XGrid = ax.props.YGrid = ax.props.ZGrid = true; }
  const out = [];
  for (let i = 0; i + dim < p0; i += dim + 1) {
    const X = matOfValue(a[i]), Y = matOfValue(a[i + 1]), Z = dim === 3 ? matOfValue(a[i + 2]) : null;
    const C = colorArg(a[i + dim]);
    out.push(makePatchFromXY(ctx, ax, X, Y, Z, C, { EdgeColor: [0, 0, 0] }));
  }
  setPairs(ctx, out, a.slice(p0));
  return ret(ctx, out);
}

function patchImpl(ctx, args) {
  const lead = leadingAxes(ctx, args);
  let a = lead.args;
  const ax = lead.ax || currentAxes(ctx, true);
  if (a.length === 1 && isStruct(a[0])) {
    const s = a[0];
    const pairs = [];
    for (const f of s.fields) pairs.push(str(f), s.data[0][f]);
    a = pairs;
  }
  if (a.length && isTxt(a[0])) {
    const o = create(ctx, 'patch', ax.id, { FaceColor: [0, 0, 0] });
    setPairs(ctx, [o], a);
    syncPatchXY(o);
    return ret(ctx, [o]);
  }
  const p0 = pairsStart(a, 3);
  const dim = p0 >= 4 ? 3 : 2;
  const X = matOfValue(a[0]), Y = matOfValue(a[1]), Z = dim === 3 ? matOfValue(a[2]) : null;
  const C = a[dim] ? colorArg(a[dim]) : null;
  const o = makePatchFromXY(ctx, ax, X, Y, Z, C);
  setPairs(ctx, [o], a.slice(p0));
  return ret(ctx, [o]);
}

function syncPatchXY(o) {
  const p = o.props;
  if ((!p.Vertices || !p.Faces) && p.XData && p.YData) {
    const ref = p.XData.dims[0] === 1 ? p.XData.dims[1] : p.XData.dims[0];
    Object.assign(p, polysToPatch(columnsOf(p.XData), columnsOf(p.YData, ref), p.ZData ? columnsOf(p.ZData, ref) : null));
  }
  if (p.Vertices && !p.Faces) p.Faces = matOfRows([Array.from({ length: p.Vertices.dims[0] }, (_, i) => i + 1)]);
}
for (const name of ['XData', 'YData', 'ZData']) {
  onSet(['patch'], name, (ctx, o, x) => { o.props[name] = x; if (o.props.XData && o.props.YData) { const p = o.props; const ref = p.XData.dims[0] === 1 ? p.XData.dims[1] : p.XData.dims[0]; Object.assign(p, polysToPatch(columnsOf(p.XData), columnsOf(p.YData, ref), p.ZData ? columnsOf(p.ZData, ref) : null)); } return true; });
}
onSet(['patch'], 'Vertices', (ctx, o, x) => { o.props.Vertices = x; if (!o.props.Faces && x) o.props.Faces = matOfRows([Array.from({ length: x.dims[0] }, (_, i) => i + 1)]); return true; });
onSet(['patch'], 'CData', (ctx, o, x) => { o.props.CData = x; if (x) o.props.FaceVertexCData = colMat(Array.from(x.data)); return true; });

// ---------------------------------------------------------------- images

function imageImpl(ctx, args, kind) {
  const lead = leadingAxes(ctx, args);
  let a = lead.args.slice();
  let x = null, y = null, C = null, clim = null, map = null;
  // imshow(filename)
  if (kind === 'imshow' && a.length && isTxt(a[0]) && !(a.length > 1 && (a.length % 2 === 0))) {
    const r = ctx.call('imread', [a[0]], 2);
    a = [r[0], ...(r[1] && r[1].dims && !r[1].dims.includes(0) ? [r[1]] : []), ...a.slice(1)];
  }
  const p0 = (() => { for (let i = 0; i < a.length; i++) if (isTxt(a[i])) return i; return a.length; })();
  const data = a.slice(0, p0);
  if (kind === 'imshow') {
    if (data.length >= 1) C = data[0];
    if (data.length >= 2) {
      const d = data[1];
      if (d.dims && d.dims[1] === 3 && d.dims[0] > 1) map = d;
      else clim = d.dims && d.dims.includes(0) ? 'auto' : Array.from(nums(d));
    }
  } else if (data.length === 1) C = data[0];
  else if (data.length === 2 && kind === 'imagesc') { C = data[0]; clim = Array.from(nums(data[1])); }
  else if (data.length >= 3) { x = Array.from(nums(data[0])); y = Array.from(nums(data[1])); C = data[2]; if (data[3]) clim = Array.from(nums(data[3])); }
  const pairs = a.slice(p0);
  if (!C) {
    // image('CData', C, ...)
    const k = pairs.findIndex((v, i) => i % 2 === 0 && isTxt(v) && lower(txt(v)) === 'cdata');
    if (k >= 0) { C = pairs[k + 1]; pairs.splice(k, 2); }
  }
  if (!C) throw gerr(`${kind}:args`, 'Image data is missing.');
  const M = matOfValue(C);
  const [m, n] = M.dims;
  const truecolor = M.dims.length === 3 && M.dims[2] === 3;
  const { ax, held } = newplot(ctx, lead.ax);
  const props = { CData: M, XData: x ? [x[0], x[x.length - 1]] : [1, n], YData: y ? [y[0], y[y.length - 1]] : [1, m] };
  if (truecolor && M.cls !== 'uint8' && M.cls !== 'uint16') { /* doubles 0..1 */ }
  if (kind === 'imagesc') props.CDataMapping = 'scaled';
  if (kind === 'imshow' && !truecolor) {
    props.CDataMapping = map ? 'direct' : 'scaled';
    if (!map) {
      let lim;
      if (clim === 'auto') { const [lo, hi] = finiteMinMax(M.data); lim = lo < hi ? [lo, hi] : [0, 1]; }
      else if (clim && clim.length === 2) lim = clim;
      else lim = M.cls === 'uint8' ? [0, 255] : M.cls === 'uint16' ? [0, 65535] : M.cls === 'int16' ? [-32768, 32767] : [0, 1];
      ax.props.CLim = lim; ax.props.CLimMode = 'manual';
      ax.props.Colormap = matOfRows(colormapByName('gray', 256));
    } else {
      ax.props.Colormap = matOfValue(map);
      if (M.cls === 'uint8' || M.cls === 'uint16') { const d = new Float64Array(M.data.length); for (let i = 0; i < d.length; i++) d[i] = M.data[i] + 1; props.CData = { dims: M.dims, data: d }; }
    }
  }
  if (kind === 'imshow' && truecolor && (M.cls === 'uint8' || M.cls === 'uint16')) { /* keep class for the renderer */ }
  if (clim && kind === 'imagesc') { ax.props.CLim = clim; ax.props.CLimMode = 'manual'; }
  const o = create(ctx, 'image', ax.id, props);
  setPairs(ctx, [o], pairs);
  if (!held || kind === 'imshow') {
    ax.props.YDir = 'reverse';
    ax.props.XLimitMethod = 'tight'; ax.props.YLimitMethod = 'tight';
    ax.props.View = [0, 90];
    ax.props.Layer = 'top';
    ax.props.Box = true;
    if (kind === 'imshow') {
      ax.props.DataAspectRatio = [1, 1, 1]; ax.props.DataAspectRatioMode = 'manual';
      ax.props.Visible = false;
      ax.internal.keepHidden = true;
    }
  }
  return ret(ctx, [o]);
}

// ---------------------------------------------------------------- function plots

/** A callable for a function handle or an expression text in x (and y). */
function toFunc(ctx, v) {
  if (isFuncHandle(v)) return v;
  if (isTxt(v)) {
    const expr = txt(v);
    const vars = exprVars(expr);
    const params = vars.length ? vars : ['x'];
    const code = `@(${params.join(',')}) ${vectorize(expr)}`;
    try { return ctx.call('str2func', [str(code)], 1)[0]; } catch { /* fall back */ }
    try { return ctx.evalString(code, 'base')[0]; } catch { /* fall back */ }
    throw gerr('func', `Cannot turn '${expr}' into a function.`);
  }
  throw gerr('func', 'Expected a function handle or an expression.');
}
const RESERVED = new Set(['sin', 'cos', 'tan', 'exp', 'log', 'sqrt', 'abs', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'pi', 'log10', 'log2', 'sec', 'csc', 'cot', 'sign', 'floor', 'ceil', 'round', 'mod', 'max', 'min', 'besselj', 'gamma', 'erf', 'real', 'imag', 'atan2', 'Inf', 'NaN', 'eps', 'i', 'j', 'e']);
function exprVars(expr) {
  const ids = new Set((expr.match(/[A-Za-z_]\w*/g) || []).filter((w) => !RESERVED.has(w)));
  return [...ids].sort((p, q) => (p === 'x' ? -1 : q === 'x' ? 1 : p.localeCompare(q))).slice(0, 2);
}
const vectorize = (s) => s.replace(/([^.])([*/^])/g, '$1.$2').replace(/^([*/^])/, '.$1');

function evalVec(ctx, f, t) {
  try {
    const r = ctx.call(f, [rowVec(Array.from(t))], 1)[0];
    const d = nums(r);
    if (d.length === t.length) return Array.from(d);
    if (d.length === 1) return t.map(() => d[0]);
  } catch { /* per point */ }
  return Array.from(t, (x) => { try { return nums(ctx.call(f, [num(x)], 1)[0])[0]; } catch { return NaN; } });
}
function adaptiveSample(ctx, f, a, b) {
  const base = Array.from(linspace(a, b, 241));
  const y = evalVec(ctx, f, base);
  const out = [base[0]];
  const span = (finiteMinMax(y)[1] - finiteMinMax(y)[0]) || 1;
  for (let i = 1; i < base.length; i++) {
    const jump = Math.abs(y[i] - y[i - 1]) / span;
    if (jump > 0.05) { const k = Math.min(8, Math.ceil(jump * 40)); for (let s = 1; s < k; s++) out.push(base[i - 1] + ((base[i] - base[i - 1]) * s) / k); }
    out.push(base[i]);
  }
  return out;
}

function fimplicitImpl(ctx, args) {
  const lead = leadingAxes(ctx, args);
  const a = lead.args;
  const f = toFunc(ctx, a[0]);
  let k = 1, r = [-5, 5, -5, 5];
  if (k < a.length && isNum(a[k])) { const v = Array.from(nums(a[k])); r = v.length === 2 ? [v[0], v[1], v[0], v[1]] : v; k++; }
  let spec = null;
  if (k < a.length && (a.length - k) % 2 === 1) { spec = lineSpecOf(a[k]); k++; }
  const N = 151;
  const xs = Array.from(linspace(r[0], r[1], N)), ys = Array.from(linspace(r[2], r[3], N));
  const Z = new Float64Array(N * N);
  // try vectorised evaluation on the grid
  const Xg = tensor('double', [N, N]), Yg = tensor('double', [N, N]);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { Xg.re[i + j * N] = xs[j]; Yg.re[i + j * N] = ys[i]; }
  let ok = false;
  try { const v = nums(ctx.call(f, [Xg, Yg], 1)[0]); if (v.length === N * N) { Z.set(v); ok = true; } } catch { /* per point */ }
  if (!ok) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { try { Z[i + j * N] = nums(ctx.call(f, [num(xs[j]), num(ys[i])], 1)[0])[0]; } catch { Z[i + j * N] = NaN; } }
  const lines = contourLines(Float64Array.from(xs), Float64Array.from(ys), Z, N, N, [0]);
  const { ax, held } = newplot(ctx, lead.ax);
  if (!held) { ax.props.XLim = [r[0], r[1]]; ax.props.YLim = [r[2], r[3]]; ax.props.XLimMode = ax.props.YLimMode = 'manual'; }
  const style = nextSeriesStyle(ax);
  const X = [], Y = [];
  for (const l of lines) { for (let q = 0; q < l.points.length; q += 2) { X.push(l.points[q]); Y.push(l.points[q + 1]); } X.push(NaN); Y.push(NaN); }
  const props = { XData: vecMat(X), YData: vecMat(Y) };
  applySpec(props, spec, style);
  const o = create(ctx, 'line', ax.id, props);
  setPairs(ctx, [o], a.slice(k));
  return ret(ctx, [o]);
}

// ---------------------------------------------------------------- pie

function pieImpl(ctx, args, is3d) {
  const lead = leadingAxes(ctx, args);
  const a = lead.args;
  if (!a.length) throw gerr('pie:args', 'pie needs data.');
  let x = Array.from(nums(a[0])).map((v) => (finite(v) && v > 0 ? v : 0));
  let explode = null, labels = null;
  for (let i = 1; i < a.length; i++) {
    if (isCell(a[i]) || a[i].cls === 'string') labels = txtList(a[i]);
    else if (isTxt(a[i])) labels = [txt(a[i])];
    else explode = Array.from(nums(a[i]));
  }
  const total = x.reduce((s, v) => s + v, 0);
  const frac = total > 1 || x.every((v) => v === 0) ? x.map((v) => (total ? v / total : 0)) : x.slice();
  const { ax } = newplot(ctx, lead.ax);
  const cmap = rowsOfMat(resolvedColormap(G(ctx), ax));
  const out = [];
  let theta = Math.PI / 2;
  const n = frac.length;
  frac.forEach((f, i) => {
    if (f <= 0) return;
    const t0 = theta, t1 = theta - f * 2 * Math.PI;
    theta = t1;
    const mid = (t0 + t1) / 2;
    const off = explode && explode[i] ? 0.1 : 0;
    const cx = off * Math.cos(mid), cy = off * Math.sin(mid);
    const steps = Math.max(2, Math.ceil(f * 100));
    const px = [cx], py = [cy];
    for (let s = 0; s <= steps; s++) { const t = t0 + ((t1 - t0) * s) / steps; px.push(cx + Math.cos(t)); py.push(cy + Math.sin(t)); }
    const color = cmap.length ? cmap[Math.min(cmap.length - 1, Math.round((i / Math.max(1, n - 1)) * (cmap.length - 1)))] : [0.5, 0.5, 0.5];
    if (is3d) {
      const h = 0.35;
      const verts = [], faces = [];
      const m = px.length;
      for (let k = 0; k < m; k++) verts.push([px[k], py[k], 0]);
      for (let k = 0; k < m; k++) verts.push([px[k], py[k], h]);
      faces.push([...Array.from({ length: m }, (_, k) => k + 1)]);
      faces.push([...Array.from({ length: m }, (_, k) => m + k + 1)]);
      const sides = [];
      for (let k = 0; k < m; k++) { const k2 = (k + 1) % m; sides.push([k + 1, k2 + 1, m + k2 + 1, m + k + 1]); }
      const all = [...faces.map((f2) => f2.concat(new Array(Math.max(0, m - f2.length)).fill(NaN))), ...sides.map((s2) => s2.concat(new Array(Math.max(0, m - 4)).fill(NaN)))];
      out.push(create(ctx, 'patch', ax.id, { Vertices: matOfRows(verts), Faces: matOfRows(all), FaceColor: color, EdgeColor: [0, 0, 0], FaceLighting: 'gouraud' }));
    } else {
      out.push(create(ctx, 'patch', ax.id, { Vertices: matOfRows(px.map((v, k) => [v, py[k]])), Faces: matOfRows([px.map((_, k) => k + 1)]), FaceColor: color, EdgeColor: [0, 0, 0], DisplayName: labels ? labels[i] || '' : '' }));
    }
    const label = labels ? labels[i] ?? '' : `${pctText(f * 100)}%`;
    out.push(create(ctx, 'text', ax.id, { Position: [cx + 1.15 * Math.cos(mid), cy + 1.15 * Math.sin(mid), is3d ? 0.35 : 0], String: label, HorizontalAlignment: Math.cos(mid) < -0.1 ? 'right' : Math.cos(mid) > 0.1 ? 'left' : 'center' }));
  });
  ax.props.DataAspectRatio = [1, 1, 1]; ax.props.DataAspectRatioMode = 'manual';
  ax.props.Visible = false; ax.internal.keepHidden = true;
  ax.props.XLim = [-1.25, 1.25]; ax.props.YLim = [-1.25, 1.25]; ax.props.XLimMode = ax.props.YLimMode = 'manual';
  if (is3d) { ax.props.View = [-37.5, 30]; ax.props.ZLim = [0, 1]; ax.props.ZLimMode = 'manual'; }
  return ret(ctx, out);
}
function pctText(p) { return p < 1 && p > 0 ? '< 1' : String(Math.round(p)); }

// ---------------------------------------------------------------- boxplot

function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = q * sorted.length - 0.5;
  if (pos <= 0) return sorted[0];
  if (pos >= sorted.length - 1) return sorted[sorted.length - 1];
  const i = Math.floor(pos), f = pos - i;
  return sorted[i] + (sorted[i + 1] - sorted[i]) * f;
}

/** Box statistics of one sample: {q1, med, q3, lo, hi, outliers}. */
export function boxStats(values, whisker = 1.5) {
  const s = values.filter(finite).sort((p, q) => p - q);
  const q1 = quantile(s, 0.25), med = quantile(s, 0.5), q3 = quantile(s, 0.75);
  const iqr = q3 - q1;
  const loLim = q1 - whisker * iqr, hiLim = q3 + whisker * iqr;
  const inside = s.filter((v) => v >= loLim && v <= hiLim);
  return { q1, med, q3, lo: inside.length ? inside[0] : q1, hi: inside.length ? inside[inside.length - 1] : q3, outliers: s.filter((v) => v < loLim || v > hiLim) };
}

function boxplotImpl(ctx, args) {
  const lead = leadingAxes(ctx, args);
  const a = lead.args;
  if (!a.length) throw gerr('boxplot:args', 'boxplot needs data.');
  const M = matOfValue(a[0]);
  let groups;
  let names = null;
  let k = 1;
  if (a.length > 1 && !isTxt(a[1])) {
    // grouping variable
    const g = isCell(a[1]) || a[1].cls === 'string' ? txtList(a[1]) : Array.from(nums(a[1])).map(String);
    const keys = [...new Set(g)];
    groups = keys.map((key) => Array.from(M.data).filter((_, i) => g[i] === key));
    names = keys;
    k = 2;
  } else if (M.dims[0] === 1 || M.dims[1] === 1) groups = [Array.from(M.data)];
  else groups = columnsOf(M);
  let whisker = 1.5;
  for (let i = k; i + 1 < a.length; i += 2) {
    const nm = lower(txt(a[i]));
    if (nm === 'labels') names = txtList(a[i + 1]);
    if (nm === 'whisker') whisker = nums(a[i + 1])[0];
  }
  const { ax } = newplot(ctx, lead.ax);
  const out = [];
  const blue = [0, 0, 1], red = [1, 0, 0], black = [0, 0, 0];
  groups.forEach((vals, i) => {
    const s = boxStats(vals, whisker);
    const x = i + 1, w = 0.25;
    const L = (X, Y, color, style = '-', marker = 'none') => { const o = create(ctx, 'line', ax.id, { XData: vecMat(X), YData: vecMat(Y), Color: color, LineStyle: style, Marker: marker }); o.internal.noLegend = true; out.push(o); return o; };
    L([x, x], [s.q3, s.hi], black, '--');
    L([x, x], [s.lo, s.q1], black, '--');
    L([x - w / 2, x + w / 2], [s.hi, s.hi], black);
    L([x - w / 2, x + w / 2], [s.lo, s.lo], black);
    L([x - w, x + w, x + w, x - w, x - w], [s.q1, s.q1, s.q3, s.q3, s.q1], blue);
    L([x - w, x + w], [s.med, s.med], red);
    if (s.outliers.length) { const o = L(s.outliers.map(() => x), s.outliers, red, 'none', '+'); void o; }
  });
  ax.props.XLim = [0.5, groups.length + 0.5]; ax.props.XLimMode = 'manual';
  ax.props.XTick = groups.map((_, i) => i + 1); ax.props.XTickMode = 'manual';
  ax.props.XTickLabel = names || groups.map((_, i) => String(i + 1)); ax.props.XTickLabelMode = 'manual';
  ax.props.YLimitMethod = 'padded';
  return ret(ctx, out);
}

// ---------------------------------------------------------------- heatmap

function heatmapImpl(ctx, args) {
  let a = args;
  let parent = null;
  if (a.length && isHandleValue(a[0])) { const st = G(ctx); parent = mustObj(st, handleIds(a[0])[0]); a = a.slice(1); }
  const p0 = pairsStart(a, 0);
  const data = a.slice(0, p0);
  let xl = null, yl = null, C;
  if (data.length === 1) C = matOfValue(data[0]);
  else if (data.length >= 3) { xl = txtList(data[0]); yl = txtList(data[1]); C = matOfValue(data[2]); }
  else throw gerr('heatmap:args', 'heatmap expects cdata or xvalues, yvalues, cdata.');
  const [m, n] = C.dims;
  xl = xl || Array.from({ length: n }, (_, j) => String(j + 1));
  yl = yl || Array.from({ length: m }, (_, i) => String(i + 1));
  let fig;
  if (parent && parent.type === 'figure') fig = parent;
  else fig = currentFigure(ctx, true);
  const st = G(ctx);
  // a heatmap replaces the current axes (it is a standalone chart)
  let pos = [0, 0, 1, 1];
  const layout = parent && parent.type === 'tiledlayout' ? parent : null;
  if (!layout) {
    const ax = st.objs.get(fig.props.CurrentAxes);
    if (ax && ax.parent === fig.id) { pos = ax.props.OuterPosition.slice(); if (ax.props.NextPlot !== 'add') destroy(ctx, ax.id); }
    else if (fig.props.NextPlot !== 'add') for (const c of fig.children.slice()) destroy(ctx, c);
  }
  const h = create(ctx, 'heatmap', (layout || fig).id, { ColorData: C, XData: xl, YData: yl, XDisplayLabels: xl, YDisplayLabels: yl, OuterPosition: pos, Colormap: resolvedColormap(st, fig) });
  setPairs(ctx, [h], a.slice(p0));
  makeCurrentFigure(ctx, fig);
  return ret(ctx, [h]);
}

// ---------------------------------------------------------------- constant lines

function constLine(ctx, args, axis) {
  const lead = leadingAxes(ctx, args);
  const a = lead.args;
  const ax = lead.ax || currentAxes(ctx, true);
  const vals = Array.from(nums(a[0]));
  let k = 1, spec = null, label = null;
  if (k < a.length && isTxt(a[k]) && (a.length - k) % 2 === 1 && lineSpecOf(a[k])) { spec = lineSpecOf(a[k]); k++; }
  if (k < a.length && (isTxt(a[k]) || isCell(a[k])) && (a.length - k) % 2 === 1) { label = txtList(a[k]); k++; }
  const out = [];
  vals.forEach((v, i) => {
    const props = { XData: vecMat(axis === 'x' ? [v, v] : [-Infinity, Infinity]), YData: vecMat(axis === 'y' ? [v, v] : [-Infinity, Infinity]), Color: [0.15, 0.15, 0.15], LineStyle: '-' };
    if (spec) applySpec(props, spec, { color: props.Color, lineStyle: '-' });
    if (props.LineStyle === 'none') props.LineStyle = '-';
    const o = create(ctx, 'line', ax.id, props);
    o.internal.constAxis = axis;
    o.internal.noLegend = true;
    if (label) { const t = create(ctx, 'text', ax.id, { String: label[Math.min(i, label.length - 1)], Position: [v, v, 0], FontSize: 9 }); t.internal.constLabel = { axis, line: o.id }; }
    out.push(o);
  });
  setPairs(ctx, out, a.slice(k));
  return ret(ctx, out);
}

export { makeLines, toFunc, evalVec, exprVars, vectorize, colorArg, makePatchFromXY, newAxes, figureOf, setProp };
