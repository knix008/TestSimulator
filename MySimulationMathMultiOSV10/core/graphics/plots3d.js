// Surfaces, meshes, contours, vector fields, solids of revolution, function
// surfaces, 3D bars and lighting commands.
import { str, num, tensor, rowVec } from '../value.js';
import { gerr, isTxt, txt, nums, isNum, lower, linspace, finiteMinMax, isFuncHandle } from './util.js';
import { G, create, setPairs, pairsStart, handleValue, vecMat, colMat, matOfValue, objsOf, touch, matOfRows, rowsOfMat, setProp, isHandleValue, onSet } from './model.js';
import { newplot, nextSeriesStyle, leadingAxes, applySpec, lineSpecOf, currentAxes, columnsOf, peekSeriesColor } from './figax.js';
import { contourGeometry } from './compute.js';
import { axesInfo } from './compute.js';
import { toFunc } from './plots.js';

const finite = (x) => x === x && x !== Infinity && x !== -Infinity;
const ret = (ctx, objs, row = false) => handleValue(ctx, objs.map((o) => o.id), objs.length === 0 ? [0, 0] : row ? [1, objs.length] : [objs.length, 1]);
const mat = (m, n, f) => { const d = new Float64Array(m * n); for (let j = 0; j < n; j++) for (let i = 0; i < m; i++) d[i + j * m] = f(i, j); return { dims: [m, n], data: d }; };
const toVal = (M) => tensor('double', M.dims, M.data);
const set3D = (ax) => { ax.props.View = [-37.5, 30]; ax.props.XGrid = ax.props.YGrid = ax.props.ZGrid = true; };

/** Parses (Z) / (X,Y,Z) / (X,Y,Z,C) surface data; returns {X, Y, Z, C, rest}. */
function surfaceData(args) {
  const k = pairsStart(args, 0);
  const d = args.slice(0, k).filter((v) => !isTxt(v)).map((v) => matOfValue(v));
  let X, Y, Z, C = null;
  if (d.length === 1 || d.length === 2) { Z = d[0]; if (d.length === 2) C = d[1]; }
  else if (d.length >= 3) { [X, Y, Z] = d; C = d[3] || null; }
  else throw gerr('surf:notEnoughInputs', 'Not enough input arguments.');
  const [m, n] = Z.dims;
  if (m < 1 || n < 1) throw gerr('surf:empty', 'Z must not be empty.');
  if (!X) { X = vecMat(Array.from({ length: n }, (_, j) => j + 1)); Y = colMat(Array.from({ length: m }, (_, i) => i + 1)); }
  else {
    const okX = X.data.length === n || (X.dims[0] === m && X.dims[1] === n);
    const okY = Y.data.length === m || (Y.dims[0] === m && Y.dims[1] === n);
    if (!okX || !okY) throw gerr('surf:size', 'Data dimensions must agree: X and Y must match the columns and rows of Z.');
  }
  return { X, Y, Z, C, rest: args.slice(k) };
}

function surfImpl(ctx, args, kind) {
  const lead = leadingAxes(ctx, args);
  const { X, Y, Z, C, rest } = surfaceData(lead.args);
  const { ax, held } = newplot(ctx, lead.ax);
  if (!held) set3D(ax);
  const props = { XData: X, YData: Y, ZData: Z, CData: C || Z };
  if (kind === 'mesh' || kind === 'meshz' || kind === 'waterfall') { props.FaceColor = [1, 1, 1]; props.EdgeColor = 'flat'; props.FaceLighting = 'none'; }
  if (kind === 'waterfall') props.MeshStyle = 'row';
  if (kind === 'meshz' || kind === 'waterfall') Object.assign(props, curtain(X, Y, Z, C || Z));
  const s = create(ctx, 'surface', ax.id, props);
  if (C) s.props.CDataMode = 'manual';
  const out = [s];
  if (kind === 'surfc' || kind === 'meshc') {
    const info = axesInfo(ctx, ax);
    const c = create(ctx, 'contour', ax.id, { XData: X, YData: Y, ZData: Z });
    c.internal.is3d = true;
    c.internal.zplane = info.ZLim[0];
    c.internal.flatAt = true;
    out.push(c);
  }
  setPairs(ctx, [s], rest);
  return ret(ctx, out);
}

// meshz / waterfall: add a skirt around the data at the minimum z
function curtain(X, Y, Z, C) {
  const [m, n] = Z.dims;
  const [zmin] = finiteMinMax(Z.data);
  const xv = (i, j) => (X.data.length === n && X.data.length !== m * n ? X.data[j] : X.data[i + j * m]);
  const yv = (i, j) => (Y.data.length === m && Y.data.length !== m * n ? Y.data[i] : Y.data[i + j * m]);
  const M = m + 2, N = n + 2;
  const ci = (i) => Math.min(m - 1, Math.max(0, i - 1)), cj = (j) => Math.min(n - 1, Math.max(0, j - 1));
  const border = (i, j) => i === 0 || j === 0 || i === M - 1 || j === N - 1;
  return {
    XData: mat(M, N, (i, j) => xv(ci(i), cj(j))), YData: mat(M, N, (i, j) => yv(ci(i), cj(j))),
    ZData: mat(M, N, (i, j) => (border(i, j) ? zmin : Z.data[ci(i) + cj(j) * m])), CData: mat(M, N, (i, j) => C.data[ci(i) + cj(j) * m]),
  };
}

function contourImpl(ctx, args, nargout, kind) {
  const lead = leadingAxes(ctx, args);
  let a = lead.args.slice();
  let spec = null;
  for (let i = 0; i < a.length; i++) {
    if (isTxt(a[i]) && (a.length - i) % 2 === 1) { const sp = lineSpecOf(a[i]); if (sp) { spec = sp; a.splice(i, 1); } break; }
  }
  const k = pairsStart(a, 0);
  const d = a.slice(0, k).map((v) => matOfValue(v));
  let X = null, Y = null, Z, lv = null;
  if (d.length === 1) Z = d[0];
  else if (d.length === 2) { Z = d[0]; lv = d[1]; }
  else if (d.length === 3) { [X, Y, Z] = d; }
  else if (d.length >= 4) { [X, Y, Z, lv] = d; }
  else throw gerr('contour:notEnoughInputs', 'Not enough input arguments.');
  const [m, n] = Z.dims;
  if (m < 2 || n < 2) throw gerr('contour:size', 'Z must be at least a 2-by-2 matrix.');
  const props = { XData: X || vecMat(Array.from({ length: n }, (_, j) => j + 1)), YData: Y || colMat(Array.from({ length: m }, (_, i) => i + 1)), ZData: Z, Fill: kind === 'contourf' };
  if (kind === 'contourf') props.LineColor = [0, 0, 0];
  if (spec && spec.color) props.LineColor = spec.color;
  if (spec && spec.lineStyle) props.LineStyle = spec.lineStyle;
  if (kind === 'contourc') {
    const fake = { props: { ...defaultsContour(), ...props }, internal: {}, ver: 0 };
    if (lv) setLevels(fake, lv);
    return toVal(contourGeometry(fake).matrix);
  }
  const { ax, held } = newplot(ctx, lead.ax);
  if (!held && kind === 'contour3') set3D(ax);
  const o = create(ctx, 'contour', ax.id, props);
  if (kind === 'contour3') o.internal.is3d = true;
  if (lv) setLevels(o, lv);
  setPairs(ctx, [o], a.slice(k));
  if (!held) { ax.props.Box = kind !== 'contour3'; ax.props.XLimitMethod = 'tight'; ax.props.YLimitMethod = 'tight'; if (kind !== 'contour3') ax.props.Layer = 'top'; }
  if (nargout === 0) return [];
  return [toVal(contourGeometry(o).matrix), ret(ctx, [o])];
}
const defaultsContour = () => ({ LevelList: [], LevelListMode: 'auto', LevelStep: 0, LevelStepMode: 'auto', Fill: false });
function setLevels(o, M) {
  const v = Array.from(M.data);
  if (v.length === 1 && Number.isInteger(v[0]) && v[0] > 0) o.internal.nlevels = v[0];
  else { o.props.LevelList = v.length === 2 && v[0] === v[1] ? [v[0]] : v; o.props.LevelListMode = 'manual'; }
}
onSet(['contour'], 'LevelList', (ctx, o, x) => { o.props.LevelList = x; o.props.LevelListMode = 'manual'; return true; });
onSet(['contour'], 'ContourMatrix', () => { throw gerr('readOnlyProperty', "The 'ContourMatrix' property is read-only."); });
import { onGet } from './model.js';
onGet(['contour'], 'ContourMatrix', (ctx, o) => toVal(contourGeometry(o).matrix));
onGet(['contour'], 'LevelList', (ctx, o) => rowVec(contourGeometry(o).levels));

function quiverImpl(ctx, args, dim) {
  const lead = leadingAxes(ctx, args);
  let a = lead.args.slice();
  let spec = null, filled = false;
  const k = (() => { for (let i = 0; i < a.length; i++) if (isTxt(a[i])) { const s = lower(txt(a[i])); if (s === 'filled') { filled = true; a.splice(i, 1); i--; continue; } const sp = lineSpecOf(a[i]); if (sp && (a.length - i) % 2 === 1) { spec = sp; a.splice(i, 1); i--; continue; } return i; } return a.length; })();
  const d = a.slice(0, k).map((v) => matOfValue(v));
  let X, Y, Z = null, U, V, W = null, scale = null;
  if (dim === 2) {
    if (d.length === 2 || d.length === 3) { [U, V] = d; if (d[2]) scale = d[2].data[0]; }
    else if (d.length >= 4) { [X, Y, U, V] = d; if (d[4]) scale = d[4].data[0]; }
    else throw gerr('quiver:args', 'quiver expects U, V or X, Y, U, V.');
    const [m, n] = U.dims;
    if (!X) { X = mat(m, n, (i, j) => j + 1); Y = mat(m, n, (i) => i + 1); }
    else if (X.data.length === n && Y.data.length === m && U.data.length === m * n && m > 1 && n > 1) { const xs = X.data, ys = Y.data; X = mat(m, n, (i, j) => xs[j]); Y = mat(m, n, (i) => ys[i]); }
  } else {
    if (d.length === 4 || d.length === 5) { [Z, U, V, W] = d; const [m, n] = Z.dims; X = mat(m, n, (i, j) => j + 1); Y = mat(m, n, (i) => i + 1); if (d[4]) scale = d[4].data[0]; }
    else if (d.length >= 6) { [X, Y, Z, U, V, W] = d; if (d[6]) scale = d[6].data[0]; }
    else throw gerr('quiver3:args', 'quiver3 expects Z, U, V, W or X, Y, Z, U, V, W.');
  }
  const { ax, held } = newplot(ctx, lead.ax);
  if (!held && dim === 3) set3D(ax);
  const style = nextSeriesStyle(ax);
  const props = { XData: X, YData: Y, ZData: Z, UData: U, VData: V, WData: W, Color: spec && spec.color ? spec.color : style.color };
  if (spec && spec.lineStyle) props.LineStyle = spec.lineStyle;
  if (spec && spec.marker) props.Marker = spec.marker;
  if (scale != null) { if (scale === 0) props.AutoScale = false; else props.AutoScaleFactor = scale * 0.9; }
  const o = create(ctx, 'quiver', ax.id, props);
  if (filled) o.internal.filled = true;
  setPairs(ctx, [o], a.slice(k));
  return ret(ctx, [o]);
}

/** Bilinear sample of a gridded field; returns NaN outside. */
function sampler(xs, ys, F, m, n) {
  return (x, y) => {
    const fx = locate(xs, x), fy = locate(ys, y);
    if (fx < 0 || fy < 0) return NaN;
    const j = Math.min(n - 2, Math.floor(fx)), i = Math.min(m - 2, Math.floor(fy));
    const tx = fx - j, ty = fy - i;
    const g = (a, b) => F[a + b * m];
    return (1 - ty) * ((1 - tx) * g(i, j) + tx * g(i, j + 1)) + ty * ((1 - tx) * g(i + 1, j) + tx * g(i + 1, j + 1));
  };
}
function locate(v, x) {
  const n = v.length;
  if (n < 2) return -1;
  const inc = v[n - 1] > v[0];
  if (inc ? x < v[0] || x > v[n - 1] : x > v[0] || x < v[n - 1]) return -1;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if ((v[mid] <= x) === inc) lo = mid; else hi = mid; }
  return lo + (x - v[lo]) / (v[hi] - v[lo]);
}

/** Integrates 2D streamlines (RK2). Returns array of [xs, ys]. */
export function streamlines2d(X, Y, U, V, sx, sy, step = 0.1, maxVert = 10000) {
  const [m, n] = U.dims;
  const xs = X.data.length === n ? Array.from(X.data) : Array.from({ length: n }, (_, j) => X.data[j * m]);
  const ys = Y.data.length === m ? Array.from(Y.data) : Array.from({ length: m }, (_, i) => Y.data[i]);
  const su = sampler(xs, ys, U.data, m, n), sv = sampler(xs, ys, V.data, m, n);
  const cell = Math.min(Math.abs(xs[1] - xs[0]) || 1, Math.abs(ys[1] - ys[0]) || 1);
  const h = step * cell;
  const lines = [];
  for (let k = 0; k < sx.length; k++) {
    let x = sx[k], y = sy[k];
    const px = [x], py = [y];
    for (let it = 0; it < maxVert; it++) {
      const u1 = su(x, y), v1 = sv(x, y);
      const sp = Math.hypot(u1, v1);
      if (!(sp > 1e-12)) break;
      const mx = x + 0.5 * h * u1 / sp, my = y + 0.5 * h * v1 / sp;
      const u2 = su(mx, my), v2 = sv(mx, my);
      const sp2 = Math.hypot(u2, v2);
      if (!(sp2 > 1e-12)) break;
      x += h * u2 / sp2; y += h * v2 / sp2;
      if (!finite(x) || !finite(y) || locate(xs, x) < 0 || locate(ys, y) < 0) break;
      px.push(x); py.push(y);
    }
    lines.push([px, py]);
  }
  return lines;
}

function peaksZ(x, y) {
  return 3 * (1 - x) ** 2 * Math.exp(-(x ** 2) - (y + 1) ** 2) - 10 * (x / 5 - x ** 3 - y ** 5) * Math.exp(-(x ** 2) - y ** 2) - (1 / 3) * Math.exp(-((x + 1) ** 2) - y ** 2);
}

/** Unit sphere grids (n+1)×(n+1). */
export function sphereGrid(n = 20) {
  const N = n + 1;
  const X = mat(N, N, (i, j) => { const th = -Math.PI + (2 * Math.PI * j) / n, ph = -Math.PI / 2 + (Math.PI * i) / n; return Math.cos(ph) * Math.cos(th); });
  const Y = mat(N, N, (i, j) => { const th = -Math.PI + (2 * Math.PI * j) / n, ph = -Math.PI / 2 + (Math.PI * i) / n; return Math.cos(ph) * Math.sin(th); });
  const Z = mat(N, N, (i) => Math.sin(-Math.PI / 2 + (Math.PI * i) / n));
  for (const M of [X, Y, Z]) for (let k = 0; k < M.data.length; k++) if (Math.abs(M.data[k]) < 1e-15) M.data[k] = 0;
  return { X, Y, Z };
}

function surfOrReturn(ctx, args, nargout, grids) {
  const lead = leadingAxes(ctx, args);
  if (nargout > 0) return [toVal(grids.X), toVal(grids.Y), toVal(grids.Z)];
  const { ax, held } = newplot(ctx, lead.ax);
  if (!held) set3D(ax);
  create(ctx, 'surface', ax.id, { XData: grids.X, YData: grids.Y, ZData: grids.Z, CData: grids.Z });
  if (!held) { ax.props.DataAspectRatio = [1, 1, 1]; ax.props.DataAspectRatioMode = 'manual'; }
  return [];
}

function fsurfImpl(ctx, args, kind) {
  const lead = leadingAxes(ctx, args);
  const a = lead.args;
  const f = toFunc(ctx, a[0]);
  let k = 1, r = [-5, 5, -5, 5];
  if (k < a.length && isNum(a[k])) { const v = Array.from(nums(a[k])); r = v.length === 2 ? [v[0], v[1], v[0], v[1]] : v; k++; }
  const N = kind === 'fcontour' ? 71 : 35;
  const xs = linspace(r[0], r[1], N), ys = linspace(r[2], r[3], N);
  const Xg = tensor('double', [N, N]), Yg = tensor('double', [N, N]);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { Xg.re[i + j * N] = xs[j]; Yg.re[i + j * N] = ys[i]; }
  let Z;
  try { Z = Float64Array.from(nums(ctx.call(f, [Xg, Yg], 1)[0])); if (Z.length !== N * N) throw new Error('size'); }
  catch { Z = new Float64Array(N * N); for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { try { Z[i + j * N] = nums(ctx.call(f, [num(xs[j]), num(ys[i])], 1)[0])[0]; } catch { Z[i + j * N] = NaN; } } }
  const ZM = { dims: [N, N], data: Z };
  const { ax, held } = newplot(ctx, lead.ax);
  let o;
  if (kind === 'fcontour') {
    o = create(ctx, 'contour', ax.id, { XData: vecMat(xs), YData: colMat(ys), ZData: ZM });
  } else {
    if (!held) set3D(ax);
    o = create(ctx, 'surface', ax.id, { XData: vecMat(xs), YData: colMat(ys), ZData: ZM, CData: ZM, ...(kind === 'fmesh' ? { FaceColor: [1, 1, 1], EdgeColor: 'flat', FaceLighting: 'none' } : {}) });
  }
  if (!held) { ax.props.XLim = [r[0], r[1]]; ax.props.YLim = [r[2], r[3]]; ax.props.XLimMode = ax.props.YLimMode = 'manual'; }
  setPairs(ctx, [o], a.slice(k));
  return ret(ctx, [o]);
}

function bar3Impl(ctx, args, horizontal) {
  const lead = leadingAxes(ctx, args);
  let a = lead.args.slice();
  let style = 'detached', width = 0.8, color = null;
  for (let i = a.length - 1; i >= 0; i--) if (isTxt(a[i])) { const s = lower(txt(a[i])); if (['detached', 'grouped', 'stacked'].includes(s)) style = s; else color = s; a.splice(i, 1); }
  const d = a.map((v) => matOfValue(v));
  let y = null, Z;
  if (d.length === 1) Z = d[0];
  else if (d.length === 2 && d[1].data.length === 1) { Z = d[0]; width = d[1].data[0]; }
  else { y = Array.from(d[0].data); Z = d[1]; if (d[2]) width = d[2].data[0]; }
  if (Z.dims[0] === 1) Z = { dims: [Z.dims[1], 1], data: Z.data };
  const [m, n] = Z.dims;
  y = y || Array.from({ length: m }, (_, i) => i + 1);
  const { ax, held } = newplot(ctx, lead.ax);
  if (!held) set3D(ax);
  const out = [];
  const stack = new Array(m).fill(0);
  for (let j = 0; j < n; j++) {
    const verts = [], faces = [];
    const w = width / 2;
    for (let i = 0; i < m; i++) {
      const v = Z.data[i + j * m];
      if (!finite(v)) continue;
      let cx, cy, x0, x1, y0, y1, z0, z1;
      if (style === 'grouped') { const gw = width / n; cx = j + 1; cy = y[i] - width / 2 + gw * (j + 0.5); x0 = 1 - 0.4; x1 = 1 + 0.4; void x0; void x1; x0 = 0.6; x1 = 1.4; y0 = cy - gw / 2; y1 = cy + gw / 2; z0 = 0; z1 = v; cx = 1; }
      else if (style === 'stacked') { cx = 1; cy = y[i]; x0 = cx - w; x1 = cx + w; y0 = cy - w; y1 = cy + w; z0 = stack[i]; z1 = stack[i] + v; stack[i] = z1; }
      else { cx = j + 1; cy = y[i]; x0 = cx - w; x1 = cx + w; y0 = cy - w; y1 = cy + w; z0 = 0; z1 = v; }
      const base = verts.length;
      const P = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
      verts.push(...(horizontal ? P.map(([px, py, pz]) => [pz, py, px]) : P));
      for (const f of [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) faces.push(f.map((q) => q + base + 1));
    }
    if (!verts.length) continue;
    const c = color ? (lineSpecOf(str(color)) || {}).color : peekSeriesColor(ax, j);
    out.push(create(ctx, 'patch', ax.id, { Vertices: matOfRows(verts), Faces: matOfRows(faces), FaceColor: c || peekSeriesColor(ax, j), EdgeColor: [0, 0, 0], FaceLighting: 'flat' }));
  }
  ax.internal.colorIndex = (ax.internal.colorIndex || 0) + n;
  if (!held) { ax.props.YDir = 'reverse'; }
  return ret(ctx, out, true);
}

/** Camera direction (unit, data-space proportions) from a View [az el]. */
export function viewDir(view) {
  const az = (view[0] * Math.PI) / 180, el = (view[1] * Math.PI) / 180;
  return [Math.cos(el) * Math.sin(az), -Math.cos(el) * Math.cos(az), Math.sin(el)];
}

/** Light position for camlight: rel 'headlight' | 'right' | 'left' | [az el] relative to the camera. */
export function camlightPosition(ctx, ax, rel, local) {
  const info = axesInfo(ctx, ax);
  const view = ax.props.View;
  let az = view[0], el = view[1];
  if (rel === 'right') { az += 30; el += 30; }
  else if (rel === 'left') { az -= 30; el += 30; }
  else if (Array.isArray(rel)) { az += rel[0]; el += rel[1]; }
  const dir = viewDir([az, Math.max(-90, Math.min(90, el))]);
  const c = [0, 1, 2].map((k) => { const L = [info.XLim, info.YLim, info.ZLim][k]; return (L[0] + L[1]) / 2; });
  const span = [info.XLim[1] - info.XLim[0], info.YLim[1] - info.YLim[0], info.ZLim[1] - info.ZLim[0]];
  const dist = local ? 1.2 : 5;
  return c.map((cc, k) => cc + dir[k] * span[k] * dist);
}

function surfacesOf(ctx, args) {
  const st = G(ctx);
  let targets;
  if (args.length && isHandleValue(args[0])) {
    const objs = objsOf(ctx, args[0]);
    targets = [];
    const walk = (o) => { if (o.type === 'surface' || o.type === 'patch') targets.push(o); for (const c of o.children) { const co = st.objs.get(c); if (co) walk(co); } };
    objs.forEach(walk);
    return { targets, rest: args.slice(1), ax: objs[0] };
  }
  const ax = currentAxes(ctx, true);
  targets = [];
  const walk = (o) => { for (const c of o.children) { const co = st.objs.get(c); if (!co) continue; if (co.type === 'surface' || co.type === 'patch') targets.push(co); if (co.type === 'hggroup') walk(co); } };
  walk(ax);
  return { targets, rest: args, ax };
}

export const builtins = {
  surf(args, nargout, ctx) { return surfImpl(ctx, args, 'surf'); },
  surfc(args, nargout, ctx) { return surfImpl(ctx, args, 'surfc'); },
  mesh(args, nargout, ctx) { return surfImpl(ctx, args, 'mesh'); },
  meshc(args, nargout, ctx) { return surfImpl(ctx, args, 'meshc'); },
  meshz(args, nargout, ctx) { return surfImpl(ctx, args, 'meshz'); },
  waterfall(args, nargout, ctx) { return surfImpl(ctx, args, 'waterfall'); },
  surface(args, nargout, ctx) {
    const lead = leadingAxes(ctx, args);
    const ax = lead.ax || currentAxes(ctx, true);
    if (lead.args.length && isTxt(lead.args[0])) { const o = create(ctx, 'surface', ax.id, {}); setPairs(ctx, [o], lead.args); return ret(ctx, [o]); }
    const { X, Y, Z, C, rest } = surfaceData(lead.args);
    const o = create(ctx, 'surface', ax.id, { XData: X, YData: Y, ZData: Z, CData: C || Z });
    setPairs(ctx, [o], rest);
    return ret(ctx, [o]);
  },
  ribbon(args, nargout, ctx) {
    const lead = leadingAxes(ctx, args);
    const d = lead.args.filter((v) => !isTxt(v)).map((v) => matOfValue(v));
    let Y, y, width = 0.75;
    if (d.length === 1) { Y = d[0]; }
    else if (d.length >= 2) { y = Array.from(d[0].data); Y = d[1]; if (d[2]) width = d[2].data[0]; }
    if (Y.dims[0] === 1) Y = { dims: [Y.dims[1], 1], data: Y.data };
    const [m, n] = Y.dims;
    y = y || Array.from({ length: m }, (_, i) => i + 1);
    const { ax, held } = newplot(ctx, lead.ax);
    if (!held) set3D(ax);
    const out = [];
    for (let j = 0; j < n; j++) {
      const X = mat(m, 2, (i, k) => j + 1 + (k ? width / 2 : -width / 2));
      const YY = mat(m, 2, (i) => y[i]);
      const Z = mat(m, 2, (i) => Y.data[i + j * m]);
      out.push(create(ctx, 'surface', ax.id, { XData: X, YData: YY, ZData: Z, CData: mat(m, 2, () => j + 1) }));
    }
    return ret(ctx, out);
  },
  contour(args, nargout, ctx) { return contourImpl(ctx, args, nargout, 'contour'); },
  contourf(args, nargout, ctx) { return contourImpl(ctx, args, nargout, 'contourf'); },
  contour3(args, nargout, ctx) { return contourImpl(ctx, args, nargout, 'contour3'); },
  contourc(args, nargout, ctx) { return contourImpl(ctx, args, nargout, 'contourc'); },
  clabel(args, nargout, ctx) {
    for (const a of args) if (isHandleValue(a)) for (const o of objsOf(ctx, a)) if (o.type === 'contour') { o.props.ShowText = true; touch(G(ctx), o); }
    return [];
  },
  quiver(args, nargout, ctx) { return quiverImpl(ctx, args, 2); },
  quiver3(args, nargout, ctx) { return quiverImpl(ctx, args, 3); },
  streamline(args, nargout, ctx) {
    const lead = leadingAxes(ctx, args);
    const d = lead.args.filter((v) => !isTxt(v)).map((v) => matOfValue(v));
    let X, Y, U, V, sx, sy;
    if (d.length >= 6) [X, Y, U, V, sx, sy] = d;
    else if (d.length >= 4) { [U, V, sx, sy] = d; const [m, n] = U.dims; X = vecMat(Array.from({ length: n }, (_, j) => j + 1)); Y = colMat(Array.from({ length: m }, (_, i) => i + 1)); }
    else throw gerr('streamline:args', 'streamline expects X, Y, U, V, startx, starty.');
    const lines = streamlines2d(X, Y, U, V, Array.from(sx.data), Array.from(sy.data));
    const ax = lead.ax || currentAxes(ctx, true);
    const out = lines.map(([px, py]) => create(ctx, 'line', ax.id, { XData: vecMat(px), YData: vecMat(py), Color: nextSeriesStyle(ax).color }));
    return ret(ctx, out);
  },
  sphere(args, nargout, ctx) {
    const lead = leadingAxes(ctx, args);
    const n = lead.args.length ? Math.max(3, Math.round(nums(lead.args[0])[0])) : 20;
    return surfOrReturn(ctx, args, nargout, sphereGrid(n));
  },
  ellipsoid(args, nargout, ctx) {
    const lead = leadingAxes(ctx, args);
    const v = lead.args.map((x) => nums(x)[0]);
    if (v.length < 6) throw gerr('ellipsoid:args', 'ellipsoid(xc,yc,zc,xr,yr,zr[,n]).');
    const n = v[6] ? Math.round(v[6]) : 20;
    const g = sphereGrid(n);
    for (let k = 0; k < g.X.data.length; k++) { g.X.data[k] = v[0] + v[3] * g.X.data[k]; g.Y.data[k] = v[1] + v[4] * g.Y.data[k]; g.Z.data[k] = v[2] + v[5] * g.Z.data[k]; }
    return surfOrReturn(ctx, args, nargout, g);
  },
  cylinder(args, nargout, ctx) {
    const lead = leadingAxes(ctx, args);
    const r = lead.args.length ? Array.from(nums(lead.args[0])) : [1, 1];
    const prof = r.length === 1 ? [r[0], r[0]] : r;
    const n = lead.args.length > 1 ? Math.round(nums(lead.args[1])[0]) : 20;
    const m = prof.length;
    const X = mat(m, n + 1, (i, j) => { const t = (2 * Math.PI * j) / n; const c = Math.cos(t); return prof[i] * (Math.abs(c) < 1e-15 ? 0 : c); });
    const Y = mat(m, n + 1, (i, j) => { const t = (2 * Math.PI * j) / n; const s = Math.sin(t); return prof[i] * (Math.abs(s) < 1e-15 ? 0 : s); });
    const Z = mat(m, n + 1, (i) => (m === 1 ? 0 : i / (m - 1)));
    return surfOrReturn(ctx, args, nargout, { X, Y, Z });
  },
  peaks(args, nargout, ctx) {
    let X, Y;
    if (args.length >= 2) {
      const x = matOfValue(args[0]), y = matOfValue(args[1]);
      if (x.data.length === y.data.length && x.dims[0] === y.dims[0]) { X = x; Y = y; }
      else { const xs = x.data, ys = y.data; X = mat(ys.length, xs.length, (i, j) => xs[j]); Y = mat(ys.length, xs.length, (i) => ys[i]); }
    } else {
      let v;
      if (args.length === 1) { const a = nums(args[0]); v = a.length === 1 ? Array.from(linspace(-3, 3, Math.round(a[0]))) : Array.from(a); }
      else v = Array.from(linspace(-3, 3, 49));
      X = mat(v.length, v.length, (i, j) => v[j]); Y = mat(v.length, v.length, (i) => v[i]);
    }
    const Z = { dims: X.dims.slice(), data: X.data.map((x, k) => peaksZ(x, Y.data[k])) };
    if (nargout === 0 && args.length <= 1) {
      const { ax, held } = newplot(ctx, null);
      if (!held) set3D(ax);
      create(ctx, 'surface', ax.id, { XData: X, YData: Y, ZData: Z, CData: Z });
      const t = G(ctx).objs.get(ax.props.Title);
      if (t) t.props.String = 'Peaks';
      ctx.out('z =  3*(1-x).^2.*exp(-(x.^2) - (y+1).^2) ... \n   - 10*(x/5 - x.^3 - y.^5).*exp(-x.^2-y.^2) ... \n   - 1/3*exp(-(x+1).^2 - y.^2) \n\n');
      return [];
    }
    if (nargout >= 3) return [toVal(X), toVal(Y), toVal(Z)];
    return toVal(Z);
  },
  fsurf(args, nargout, ctx) { return fsurfImpl(ctx, args, 'fsurf'); },
  fmesh(args, nargout, ctx) { return fsurfImpl(ctx, args, 'fmesh'); },
  fcontour(args, nargout, ctx) { return fsurfImpl(ctx, args, 'fcontour'); },
  ezsurf(args, nargout, ctx) { return fsurfImpl(ctx, args, 'fsurf'); },
  ezmesh(args, nargout, ctx) { return fsurfImpl(ctx, args, 'fmesh'); },
  bar3(args, nargout, ctx) { return bar3Impl(ctx, args, false); },
  bar3h(args, nargout, ctx) { return bar3Impl(ctx, args, true); },

  // ------------------------------------------------------------ lighting
  light(args, nargout, ctx) {
    const lead = leadingAxes(ctx, args);
    const ax = lead.ax || currentAxes(ctx, true);
    const o = create(ctx, 'light', ax.id, {});
    setPairs(ctx, [o], lead.args);
    return ret(ctx, [o]);
  },
  camlight(args, nargout, ctx) {
    let a = args.slice();
    let target = null;
    if (a.length && isHandleValue(a[0])) { const [o] = objsOf(ctx, a[0]); if (o.type === 'light') target = o; a = a.slice(1); }
    let rel = 'right', local = true;
    const numsArgs = [];
    for (const v of a) {
      if (isTxt(v)) { const s = lower(txt(v)); if (s === 'infinite') local = false; else if (s === 'local') local = true; else rel = s; }
      else numsArgs.push(nums(v)[0]);
    }
    if (numsArgs.length >= 2) rel = numsArgs.slice(0, 2);
    const ax = target ? G(ctx).objs.get(target.parent) : currentAxes(ctx, true);
    const pos = camlightPosition(ctx, ax, rel, local);
    const o = target || create(ctx, 'light', ax.id, {});
    o.props.Position = pos;
    o.props.Style = local ? 'local' : 'infinite';
    o.props.Headlight = rel === 'headlight';
    touch(G(ctx), o);
    return ret(ctx, [o]);
  },
  lightangle(args, nargout, ctx) {
    let a = args.slice();
    let target = null;
    if (a.length && isHandleValue(a[0])) { [target] = objsOf(ctx, a[0]); a = a.slice(1); }
    const az = a.length ? nums(a[0])[0] : 0, el = a.length > 1 ? nums(a[1])[0] : 0;
    const ax = target ? G(ctx).objs.get(target.parent) : currentAxes(ctx, true);
    const d = viewDir([az, el]);
    const o = target || create(ctx, 'light', ax.id, { Style: 'infinite' });
    o.props.Position = d;
    touch(G(ctx), o);
    return ret(ctx, [o]);
  },
  lighting(args, nargout, ctx) {
    const { targets, rest } = surfacesOf(ctx, args);
    const mode = rest.length ? lower(txt(rest[0])) : 'flat';
    const m = mode === 'phong' ? 'gouraud' : mode;
    if (!['flat', 'gouraud', 'none'].includes(m)) throw gerr('lighting:mode', "lighting must be 'flat', 'gouraud' or 'none'.");
    for (const o of targets) { o.props.FaceLighting = m; o.props.EdgeLighting = m === 'none' ? 'none' : o.props.EdgeLighting; touch(G(ctx), o); }
    return [];
  },
  material(args, nargout, ctx) {
    const { targets, rest } = surfacesOf(ctx, args);
    if (!rest.length) throw gerr('material:args', "material shiny | dull | metal | default | [ka kd ks n sc].");
    let v;
    if (isTxt(rest[0])) {
      const s = lower(txt(rest[0]));
      v = { shiny: [0.3, 0.6, 0.9, 20, 1], dull: [0.3, 0.8, 0, 10, 1], metal: [0.3, 0.3, 1, 25, 0.5], default: [0.3, 0.6, 0.9, 10, 1] }[s];
      if (!v) throw gerr('material:args', "material must be 'shiny', 'dull', 'metal' or 'default'.");
    } else v = Array.from(nums(rest[0]));
    for (const o of targets) {
      const p = o.props;
      if (v[0] != null) p.AmbientStrength = v[0];
      if (v[1] != null) p.DiffuseStrength = v[1];
      if (v[2] != null) p.SpecularStrength = v[2];
      if (v[3] != null) p.SpecularExponent = v[3];
      if (v[4] != null) p.SpecularColorReflectance = v[4];
      touch(G(ctx), o);
    }
    return [];
  },
  shading(args, nargout, ctx) {
    const { targets, rest } = surfacesOf(ctx, args);
    const mode = rest.length ? lower(txt(rest[0])) : 'faceted';
    for (const o of targets) {
      const p = o.props;
      const meshLike = Array.isArray(p.FaceColor) && p.FaceColor.every((x) => x === 1) && o.type === 'surface';
      if (mode === 'flat') { if (!meshLike) p.FaceColor = 'flat'; else p.EdgeColor = 'flat'; if (!meshLike) p.EdgeColor = 'none'; }
      else if (mode === 'interp') { if (!meshLike) { p.FaceColor = 'interp'; p.EdgeColor = 'none'; } else p.EdgeColor = 'interp'; }
      else if (mode === 'faceted') { if (!meshLike) { p.FaceColor = 'flat'; p.EdgeColor = [0, 0, 0]; } else p.EdgeColor = 'flat'; }
      else throw gerr('shading:mode', "shading must be 'flat', 'faceted' or 'interp'.");
      touch(G(ctx), o);
    }
    return [];
  },
  alpha(args, nargout, ctx) {
    const { targets, rest } = surfacesOf(ctx, args);
    if (!rest.length) throw gerr('alpha:args', 'alpha(value).');
    if (isTxt(rest[0])) {
      const s = lower(txt(rest[0]));
      if (s === 'opaque') for (const o of targets) o.props.FaceAlpha = 1;
      else if (s === 'clear') for (const o of targets) o.props.FaceAlpha = 0;
      else if (['flat', 'interp', 'texturemap'].includes(s)) { /* alpha data mapping: keep FaceAlpha */ }
      else throw gerr('alpha:args', 'Unknown alpha option.');
    } else {
      const v = nums(rest[0]);
      if (v.length === 1) for (const o of targets) o.props.FaceAlpha = Math.max(0, Math.min(1, v[0]));
      else for (const o of targets) if (o.type === 'surface') o.props.AlphaData = matOfValue(rest[0]);
    }
    for (const o of targets) touch(G(ctx), o);
    return [];
  },
};

export { surfaceData, peaksZ, setProp, str, rowsOfMat, columnsOf, applySpec, isFuncHandle };
