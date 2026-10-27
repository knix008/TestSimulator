// Figure / axes management, decorations, limits, views, get / set, findobj.
import { str, num, tensor, rowVec, cell, empty, bool, structOf, isCell, isStruct, isTensor } from '../value.js';
import { gerr, isTxt, txt, txtList, nums, isNum, lower, eqi } from './util.js';
import {
  G, create, destroy, getObj, mustObj, objsOf, handleValue, handleIds, isHandleValue, isGraphicsArg, getProp, setProp, setPairs, getAll, settableInfo,
  findProp, matOfRows, matOfValue, rowsOfMat, touch, isAxesType, figureOf, axesOf, invokeCallback, onSet, canonicalName, propNames,
} from './model.js';
import { TYPES, COMMON } from './schema.js';
import { currentFigure, currentAxes, newFigure, makeCurrentFigure, makeCurrentAxes, newAxes, allAxes, clearAxes, leadingAxes, newplot, resetAxes } from './figax.js';
import { axesInfo, subplotOuter, tileOuter, innerFromOuter } from './compute.js';
import { colormapByName, COLORMAP_NAMES } from './colormaps.js';
import { flush, resolvedColormap, plotChildren } from './scene.js';

const isPlaceholder = (id) => id === -1;
const textArg = (v) => (isCell(v) || (v && v.cls === 'string' && v.data.length > 1) ? txtList(v) : txt(v));

// ---------------------------------------------------------------- figures

function figureBuiltin(args, nargout, ctx) {
  const st = G(ctx);
  let f;
  let rest = args;
  if (args.length && !isTxt(args[0])) {
    const ids = handleIds(args[0]);
    const id = ids[0];
    if (st.objs.has(id)) {
      f = st.objs.get(id);
      if (f.type !== 'figure') throw gerr('figure:notFigure', 'The handle is not a figure.');
    } else {
      if (!(Number.isInteger(id) && id > 0)) throw gerr('figure:badNumber', 'Figure number must be a positive integer.');
      f = newFigure(ctx, id);
    }
    rest = args.slice(1);
    makeCurrentFigure(ctx, f);
  } else {
    f = newFigure(ctx);
  }
  if (rest.length) setPairs(ctx, [f], rest);
  makeCurrentFigure(ctx, f);
  flush(ctx);
  return handleValue(ctx, [f.id]);
}

function closeBuiltin(args, nargout, ctx) {
  const st = G(ctx);
  const root = st.objs.get(0);
  let targets;
  let force = false;
  const a = args.filter((v) => { if (isTxt(v) && lower(txt(v)) === 'force') { force = true; return false; } return true; });
  if (!a.length) { const f = currentFigure(ctx, false); targets = f ? [f] : []; }
  else if (isTxt(a[0])) {
    const s = txt(a[0]);
    if (lower(s) === 'all') targets = root.children.map((id) => st.objs.get(id)).filter((f) => f && (force || f.props.HandleVisibility === 'on'));
    else targets = root.children.map((id) => st.objs.get(id)).filter((f) => f && f.props.Name === s);
  } else targets = objsOf(ctx, a[0], 'Figure');
  let closed = 0;
  for (const f of targets) {
    if (!st.objs.has(f.id)) continue;
    if (f.type !== 'figure') { destroy(ctx, f.id); closed++; continue; }
    if (!force && f.props.CloseRequestFcn) invokeCallback(ctx, f.props.CloseRequestFcn, f, null);
    else destroy(ctx, f.id);
    closed++;
  }
  flush(ctx);
  return nargout > 0 ? bool(closed > 0) : [];
}

// ---------------------------------------------------------------- findobj

function descendants(st, o, hidden, depth = Infinity) {
  const out = [o];
  if (depth <= 0) return out;
  const kids = o.children.slice();
  if (hidden) for (const k of ['Title', 'Subtitle', 'XLabel', 'YLabel', 'ZLabel', 'Legend', 'Colorbar']) if (isAxesType(o.type) && o.props[k] != null) kids.push(o.props[k]);
  for (const c of kids) {
    const co = st.objs.get(c);
    if (!co) continue;
    if (!hidden && co.props.HandleVisibility !== 'on') continue;
    out.push(...descendants(st, co, hidden, depth - 1));
  }
  return out;
}

function matchValue(ctx, o, name, want) {
  const pn = /^type$/i.test(name) ? 'Type' : canonicalName(o, name);
  if (!pn) return false;
  let have;
  try { have = getProp(ctx, o, pn); } catch { return false; }
  if (isTxt(want)) return isTxt(have) && eqi(txt(have), txt(want)) || (pn === 'Type' && eqi(txt(have), txt(want)));
  if (isHandleValue(want) || isHandleValue(have)) { const a = isHandleValue(have) ? have.gh : []; const b = handleIds(want); return a.length === b.length && a.every((x, i) => x === b[i]); }
  if (isNum(want) && (isTensor(have))) { const a = nums(have), b = nums(want); return a.length === b.length && a.every((x, i) => x === b[i]); }
  return false;
}

function findobjImpl(ctx, args, hidden) {
  const st = G(ctx);
  let a = args.slice();
  let roots = [st.objs.get(0)];
  if (a.length && !isTxt(a[0])) { roots = objsOf(ctx, a[0]); a = a.slice(1); }
  let depth = Infinity;
  const tests = []; // [{op, fn}]
  let op = 'and', neg = false;
  for (let i = 0; i < a.length;) {
    const s = txt(a[i]);
    const l = lower(s);
    if (l === '-depth') { depth = nums(a[i + 1])[0]; i += 2; continue; }
    if (l === '-and') { op = 'and'; i++; continue; }
    if (l === '-or') { op = 'or'; i++; continue; }
    if (l === '-not') { neg = true; i++; continue; }
    if (l === '-property') { const p = txt(a[i + 1]); tests.push({ op, neg, fn: (o) => { try { return !!canonicalName(o, p); } catch { return false; } } }); i += 2; op = 'and'; neg = false; continue; }
    if (l === '-regexp') { const p = txt(a[i + 1]); const re = new RegExp(txt(a[i + 2])); tests.push({ op, neg, fn: (o) => { try { const v = getProp(ctx, o, canonicalName(o, p)); return isTxt(v) && re.test(txt(v)); } catch { return false; } } }); i += 3; op = 'and'; neg = false; continue; }
    const want = a[i + 1];
    if (want === undefined) throw gerr('findobj:args', 'Property names and values must come in pairs.');
    tests.push({ op, neg, fn: (o) => matchValue(ctx, o, s, want) });
    i += 2; op = 'and'; neg = false;
  }
  const res = [];
  const seen = new Set();
  for (const r of roots) {
    for (const o of descendants(st, r, hidden || st.objs.get(0).props.ShowHiddenHandles, depth)) {
      if (seen.has(o.id)) continue;
      let ok = true;
      tests.forEach((t, k) => { const v = t.fn(o) !== t.neg; ok = k === 0 ? v : t.op === 'or' ? ok || v : ok && v; });
      if (ok) { res.push(o.id); seen.add(o.id); }
    }
  }
  return handleValue(ctx, res, [res.length, res.length ? 1 : 0]);
}

// ---------------------------------------------------------------- get / set

function getBuiltin(args, nargout, ctx) {
  if (!args.length) throw gerr('get:args', 'get needs a handle.');
  const objs = objsOf(ctx, args[0]);
  if (args.length === 1) {
    if (objs.length === 1) {
      const s = getAll(ctx, objs[0]);
      if (nargout === 0) { ctx.out(structText(ctx, s)); return []; }
      return s;
    }
    return cell([objs.length, 1], objs.map((o) => getAll(ctx, o)));
  }
  if (isCell(args[1])) {
    const names = txtList(args[1]);
    const data = [];
    for (let j = 0; j < names.length; j++) for (let i = 0; i < objs.length; i++) data[i + j * objs.length] = getProp(ctx, objs[i], names[j]);
    return cell([objs.length, names.length], data);
  }
  const name = txt(args[1]);
  if (objs.length === 1) {
    if (objs[0].type === 'root' && /^default/i.test(name)) return defaultGet(ctx, name);
    return getProp(ctx, objs[0], name);
  }
  return cell([objs.length, 1], objs.map((o) => getProp(ctx, o, name)));
}
function structText(ctx, s) {
  const w = Math.max(...s.fields.map((f) => f.length));
  return s.fields.map((f) => { const v = s.data[0][f]; return `${' '.repeat(w - f.length + 4)}${f}: ${shortVal(v)}`; }).join('\n') + '\n';
}
import { shortValue as shortVal } from './model.js';

function defaultGet(ctx, name) {
  const st = G(ctx);
  const root = st.objs.get(0);
  if (root.internal && root.internal.defaults && name.toLowerCase() in root.internal.defaults) return root.internal.defaults[name.toLowerCase()];
  const m = /^default(figure|axes|line|text|surface|patch|image|light)(\w+)$/i.exec(name);
  if (!m) throw gerr('unknownProperty', `Unrecognized property '${name}' for class 'Root'.`);
  const type = m[1].toLowerCase();
  const e = findProp(type, m[2]);
  if (!e) throw gerr('unknownProperty', `Unrecognized property '${name}' for class 'Root'.`);
  const tmp = { type, props: {}, userSet: new Set(), internal: {} };
  for (const x of [...COMMON, ...TYPES[type]]) tmp.props[x[0]] = x[2];
  return getProp(ctx, tmp, e[0]);
}

function setBuiltin(args, nargout, ctx) {
  if (!args.length) throw gerr('set:args', 'set needs a handle.');
  const objs = objsOf(ctx, args[0]);
  if (args.length === 1) return settableInfo(ctx, objs[0]);
  if (args.length === 2 && isTxt(args[1])) {
    const e = findProp(objs[0].type, txt(args[1]));
    if (!e) throw gerr('unknownProperty', `Unrecognized property '${txt(args[1])}'.`);
    return e[1] === 'enum' ? cell([e[3].length, 1], e[3].map((s) => str(s))) : cell([0, 0], []);
  }
  if (args.length === 2 && isStruct(args[1])) {
    const s = args[1];
    for (const f of s.fields) for (const o of objs) setProp(ctx, o, f, s.data[0][f]);
    return [];
  }
  if (args.length === 3 && isCell(args[1]) && isCell(args[2])) {
    const names = txtList(args[1]);
    const vals = args[2];
    const [m] = vals.dims;
    for (let i = 0; i < objs.length; i++) for (let j = 0; j < names.length; j++) setProp(ctx, objs[i], names[j], vals.data[(m === 1 ? 0 : i) + j * m]);
    return [];
  }
  const root = objs.length === 1 && objs[0].type === 'root';
  if (root) {
    for (let i = 1; i + 1 < args.length; i += 2) {
      const n = txt(args[i]);
      if (/^default/i.test(n)) { const r = G(ctx).objs.get(0); r.internal = r.internal || {}; r.internal.defaults = r.internal.defaults || {}; r.internal.defaults[n.toLowerCase()] = args[i + 1]; }
      else setProp(ctx, objs[0], n, args[i + 1]);
    }
    return [];
  }
  setPairs(ctx, objs, args, 1);
  return [];
}

// ---------------------------------------------------------------- labels

/** Target axes / tiled layout / figure from a leading handle argument. */
function labelTarget(ctx, args) {
  if (args.length && isHandleValue(args[0])) {
    const [o] = objsOf(ctx, args[0]);
    return { target: o, args: args.slice(1) };
  }
  if (args.length > 1 && isNum(args[0]) && isGraphicsArg(ctx, args[0]) && !isTxt(args[0])) {
    const [o] = objsOf(ctx, args[0]);
    return { target: o, args: args.slice(1) };
  }
  return { target: currentAxes(ctx, true), args };
}

function setLabel(ctx, which, args) {
  const { target, args: a } = labelTarget(ctx, args);
  const st = G(ctx);
  if (target.type === 'heatmap') { target.props[which] = a.length ? txt(a[0]) : ''; touch(st, target); return handleValue(ctx, [target.id]); }
  let id = target.props[which];
  if (target.type === 'tiledlayout' && id == null) { id = create(ctx, 'text', target.id, { HorizontalAlignment: 'center', Rotation: which === 'YLabel' ? 90 : 0, FontSize: 11 }, { hidden: true }).id; target.props[which] = id; }
  if (id == null) throw gerr('label:target', `This object has no ${which}.`);
  const t = mustObj(st, id);
  if (!a.length) throw gerr('label:args', 'Not enough input arguments.');
  let k = 1;
  t.props.String = textArg(a[0]);
  t.userSet.add('String');
  if (which === 'Title' && a.length >= 2 && (a.length % 2 === 0) && !isPropName(a[1])) {
    // title(titletext, subtitletext)
    const sid = target.props.Subtitle;
    if (sid != null) { const s = mustObj(st, sid); s.props.String = textArg(a[1]); touch(st, s); }
    k = 2;
  }
  if (target.type === 'tiledlayout' && which === 'Title') target.internal.hasTitle = true;
  setPairs(ctx, [t], a, k);
  touch(st, t);
  return handleValue(ctx, [t.id]);
}
function isPropName(v) {
  if (!isTxt(v)) return false;
  try { return !!findProp('text', txt(v)); } catch { return true; }
}

function sgtitleBuiltin(args, nargout, ctx) {
  const st = G(ctx);
  let a = args;
  let f;
  if (a.length && isHandleValue(a[0])) { [f] = objsOf(ctx, a[0]); a = a.slice(1); } else f = currentFigure(ctx, true);
  if (f.type === 'tiledlayout') return setLabel(ctx, 'Title', [handleValue(ctx, [f.id]), ...a]);
  let id = f.internal.sgtitle;
  if (id == null || !st.objs.has(id)) { id = create(ctx, 'text', f.id, { HorizontalAlignment: 'center', FontSize: 12, FontWeight: 'normal', Units: 'normalized', Position: [0.5, 0.98, 0] }, { hidden: true }).id; f.internal.sgtitle = id; }
  const t = st.objs.get(id);
  t.props.String = textArg(a[0]);
  setPairs(ctx, [t], a, 1);
  touch(st, t);
  return handleValue(ctx, [id]);
}

// ---------------------------------------------------------------- legend / colorbar

const LOCATIONS = TYPES.legend.find((e) => e[0] === 'Location')[3];

function legendBuiltin(args, nargout, ctx) {
  const st = G(ctx);
  let a = args.slice();
  let ax = null;
  if (a.length && isHandleValue(a[0])) {
    const objs = objsOf(ctx, a[0]);
    if (objs.length === 1 && isAxesType(objs[0].type)) { ax = objs[0]; a = a.slice(1); }
  }
  ax = ax || currentAxes(ctx, true);
  let targets = null;
  if (a.length && isHandleValue(a[0])) { targets = objsOf(ctx, a[0]); a = a.slice(1); }
  const existing = ax.props.Legend != null ? st.objs.get(ax.props.Legend) : null;
  if (a.length === 1 && isTxt(a[0])) {
    const cmd = lower(txt(a[0]));
    if (cmd === 'off') { if (existing) destroy(ctx, existing.id); ax.props.Legend = null; touch(st, ax); return []; }
    if (cmd === 'hide' && existing) { existing.props.Visible = false; touch(st, existing); return []; }
    if ((cmd === 'show' || cmd === 'toggle') && existing) { existing.props.Visible = cmd === 'show' ? true : !existing.props.Visible; touch(st, existing); return nargout ? handleValue(ctx, [existing.id]) : []; }
    if (cmd === 'boxoff' && existing) { existing.props.Box = false; touch(st, existing); return []; }
    if (cmd === 'boxon' && existing) { existing.props.Box = true; touch(st, existing); return []; }
    if (cmd === 'hide' || cmd === 'boxoff' || cmd === 'boxon') return [];
    if (cmd === 'show' || cmd === 'toggle') a = [];
  }
  // labels then name/value pairs
  let labels = null;
  let k = 0;
  if (a.length && (isCell(a[0]) || (a[0].cls === 'string' && a[0].data.length > 1))) { labels = txtList(a[0]); k = 1; }
  else {
    const list = [];
    while (k < a.length && isTxt(a[k])) {
      const s = txt(a[k]);
      if ((a.length - k) % 2 === 0 && k + 1 < a.length) {
        try { if (findProp('legend', s) && !(isTxt(a[k + 1]) && list.length === 0 && false)) break; } catch { /* ambiguous → label */ }
      }
      if (LOCATIONS.includes(lower(s)) && k === a.length - 1 && list.length) { a.splice(k, 0, str('Location')); break; }
      list.push(s); k++;
    }
    if (list.length) labels = list;
  }
  const pool = targets || plotChildren(st, ax);
  const lg = existing || create(ctx, 'legend', ax.id, {}, { hidden: true });
  ax.props.Legend = lg.id;
  lg.internal.axes = ax.id;
  if (targets) lg.internal.targets = targets.map((o) => o.id);
  if (labels) {
    const used = pool.slice(0, labels.length);
    used.forEach((o, i) => { o.props.DisplayName = labels[i]; touch(st, o); });
    if (labels.length > pool.length) ctx.warning('graphics:legend:ignoringExtraEntries', 'Ignoring extra legend entries.');
    lg.internal.targets = used.map((o) => o.id);
  } else if (!targets) {
    let n = 1;
    for (const o of pool) if (!o.props.DisplayName) { o.props.DisplayName = `data${n}`; touch(st, o); n++; } else n++;
  }
  lg.props.String = (lg.internal.targets ? lg.internal.targets.map((id) => st.objs.get(id)).filter(Boolean) : pool).map((o) => o.props.DisplayName);
  setPairs(ctx, [lg], a, k);
  touch(st, lg);
  return nargout ? handleValue(ctx, [lg.id]) : [];
}
onSet(['legend'], 'String', (ctx, lg, x) => {
  const st = G(ctx);
  const ax = st.objs.get(lg.internal.axes);
  const pool = lg.internal.targets ? lg.internal.targets.map((id) => st.objs.get(id)).filter(Boolean) : ax ? plotChildren(st, ax) : [];
  x.forEach((s, i) => { if (pool[i]) { pool[i].props.DisplayName = s; touch(st, pool[i]); } });
  lg.props.String = x.slice();
  return true;
});

function colorbarBuiltin(args, nargout, ctx) {
  const st = G(ctx);
  let a = args.slice();
  let ax = null;
  if (a.length && isHandleValue(a[0])) { const [o] = objsOf(ctx, a[0]); ax = isAxesType(o.type) ? o : null; a = a.slice(1); if (o.type === 'colorbar') { setPairs(ctx, [o], a); return handleValue(ctx, [o.id]); } }
  ax = ax || currentAxes(ctx, true);
  const existing = ax.props.Colorbar != null ? st.objs.get(ax.props.Colorbar) : null;
  if (a.length && isTxt(a[0]) && ['off', 'delete', 'hide'].includes(lower(txt(a[0])))) {
    if (existing) destroy(ctx, existing.id);
    ax.props.Colorbar = null; touch(st, ax);
    return [];
  }
  const cb = existing || create(ctx, 'colorbar', ax.id, {}, { hidden: true });
  cb.internal.axes = ax.id;
  ax.props.Colorbar = cb.id;
  if (a.length && isTxt(a[0]) && a.length % 2 === 1) {
    const s = lower(txt(a[0]));
    const locs = TYPES.colorbar.find((e) => e[0] === 'Location')[3];
    if (locs.includes(s)) { cb.props.Location = locs.find((x) => x === s); a = a.slice(1); }
    else if (s === 'on' || s === 'show') a = a.slice(1);
  }
  setPairs(ctx, [cb], a);
  touch(st, cb);
  return nargout ? handleValue(ctx, [cb.id]) : [];
}

// ---------------------------------------------------------------- colormaps

function cmapArg(ctx, v, n = 256) {
  if (isTxt(v)) {
    const name = lower(txt(v));
    const rows = colormapByName(name, n);
    if (!rows) throw gerr('colormap:unknown', `Unknown colormap '${txt(v)}'.`);
    return matOfRows(rows);
  }
  const M = matOfValue(v);
  if (M.dims.length !== 2 || M.dims[1] !== 3) throw gerr('colormap:size', 'Colormap must be an m-by-3 matrix.');
  if (M.data.some((x) => !(x >= 0 && x <= 1))) throw gerr('colormap:range', 'Colormap values must be between 0 and 1.');
  return M;
}

function colormapBuiltin(args, nargout, ctx) {
  const st = G(ctx);
  let a = args.slice();
  let target = null;
  if (a.length && (isHandleValue(a[0]) || (isNum(a[0]) && a[0].dims[1] !== 3 && isGraphicsArg(ctx, a[0])))) { [target] = objsOf(ctx, a[0]); a = a.slice(1); }
  if (!a.length) {
    const t = target || currentFigure(ctx, true);
    const M = isAxesType(t.type) ? resolvedColormap(st, t) : (t.props.Colormap || resolvedColormap(st, t));
    return tensor('double', M.dims, M.data);
  }
  const prevLen = (() => { const t = target || currentFigure(ctx, true); const M = resolvedColormap(st, t); return M.dims[0]; })();
  const M = cmapArg(ctx, a[0], isTxt(a[0]) ? prevLen : 256);
  if (target && (isAxesType(target.type) || target.type === 'heatmap')) { target.props.Colormap = M; touch(st, target); }
  else {
    const f = target || currentFigure(ctx, true);
    f.props.Colormap = M;
    for (const ax of allAxes(st, f)) { ax.props.Colormap = null; touch(st, ax); }
    for (const c of f.children) { const o = st.objs.get(c); if (o && o.type === 'heatmap') { o.props.Colormap = M; touch(st, o); } }
    touch(st, f);
  }
  return nargout > 0 ? tensor('double', M.dims, M.data) : [];
}

function cmapFn(name) {
  return (args, nargout, ctx) => {
    let n;
    if (args.length) n = Math.max(0, Math.round(nums(args[0])[0]));
    else {
      const st = G(ctx);
      const f = currentFigure(ctx, false);
      n = f ? resolvedColormap(st, f).dims[0] : 256;
    }
    const rows = colormapByName(name, n) || [];
    const t = tensor('double', [rows.length, 3]);
    rows.forEach((r, i) => { t.re[i] = r[0]; t.re[i + rows.length] = r[1]; t.re[i + 2 * rows.length] = r[2]; });
    return t;
  };
}

// ---------------------------------------------------------------- axis / limits

function axesArg(ctx, args) {
  if (args.length && isHandleValue(args[0])) {
    const objs = objsOf(ctx, args[0]);
    return { axs: objs, args: args.slice(1) };
  }
  return { axs: [currentAxes(ctx, true)], args };
}

function axisBuiltin(args, nargout, ctx) {
  const st = G(ctx);
  const { axs, args: a } = axesArg(ctx, args);
  if (!a.length) {
    const ax = axs[0];
    const info = axesInfo(ctx, ax);
    const v = info.Is3D ? [...info.XLim, ...info.YLim, ...info.ZLim] : [...info.XLim, ...info.YLim];
    return rowVec(v);
  }
  for (const ax of axs) {
    for (const v of a) {
      if (isNum(v)) {
        const L = Array.from(nums(v));
        if (![4, 6, 8].includes(L.length)) throw gerr('axis:limits', 'Limits must be a 4-, 6- or 8-element vector.');
        const set = (k, i) => { if (!(L[i] < L[i + 1])) throw gerr('axis:limits', 'Limits must be increasing.'); ax.props[`${k}Lim`] = [L[i], L[i + 1]]; ax.props[`${k}LimMode`] = 'manual'; };
        set('X', 0); set('Y', 2);
        if (L.length >= 6) set('Z', 4);
        if (L.length === 8) { ax.props.CLim = [L[6], L[7]]; ax.props.CLimMode = 'manual'; }
        continue;
      }
      const s = lower(txt(v));
      const p = ax.props;
      switch (s) {
        case 'equal': p.DataAspectRatio = [1, 1, 1]; p.DataAspectRatioMode = 'manual'; p.PlotBoxAspectRatioMode = 'auto'; break;
        case 'image': p.DataAspectRatio = [1, 1, 1]; p.DataAspectRatioMode = 'manual'; p.XLimitMethod = p.YLimitMethod = p.ZLimitMethod = 'tight'; p.XLimMode = p.YLimMode = 'auto'; break;
        case 'square': p.PlotBoxAspectRatio = [1, 1, 1]; p.PlotBoxAspectRatioMode = 'manual'; p.DataAspectRatioMode = 'auto'; break;
        case 'normal': case 'fill': p.DataAspectRatioMode = 'auto'; p.PlotBoxAspectRatioMode = 'auto'; break;
        case 'tight': {
          const info = axesInfo(ctx, ax);
          void info;
          p.XLimitMethod = p.YLimitMethod = p.ZLimitMethod = 'tight';
          p.XLimMode = p.YLimMode = p.ZLimMode = 'auto';
          break;
        }
        case 'padded': p.XLimitMethod = p.YLimitMethod = p.ZLimitMethod = 'padded'; p.XLimMode = p.YLimMode = p.ZLimMode = 'auto'; break;
        case 'tickaligned': p.XLimitMethod = p.YLimitMethod = p.ZLimitMethod = 'tickaligned'; p.XLimMode = p.YLimMode = p.ZLimMode = 'auto'; break;
        case 'auto': p.XLimMode = p.YLimMode = p.ZLimMode = 'auto'; break;
        case 'manual': {
          const info = axesInfo(ctx, ax);
          for (const k of ['X', 'Y', 'Z']) { p[`${k}Lim`] = info[`${k}Lim`].slice(); p[`${k}LimMode`] = 'manual'; }
          break;
        }
        case 'off': p.Visible = false; break;
        case 'on': p.Visible = true; ax.internal.keepHidden = false; break;
        case 'ij': p.YDir = 'reverse'; break;
        case 'xy': p.YDir = 'normal'; break;
        case 'vis3d': p.PlotBoxAspectRatioMode = 'manual'; break;
        case 'square equal': break;
        default: throw gerr('axis:option', `Unknown axis option '${txt(v)}'.`);
      }
    }
    touch(st, ax);
  }
  return [];
}

function limBuiltin(axis) {
  const prop = axis === 'C' ? 'CLim' : `${axis}Lim`;
  return (args, nargout, ctx) => {
    const st = G(ctx);
    const { axs, args: a } = axesArg(ctx, args);
    const ax = axs[0];
    if (!a.length) {
      if (ax.type === 'heatmap') return rowVec(ax.props.ColorLimits);
      return rowVec(axesInfo(ctx, ax)[prop]);
    }
    if (isTxt(a[0])) {
      const s = lower(txt(a[0]));
      if (s === 'mode') return str(ax.props[`${prop}Mode`]);
      for (const x of axs) {
        if (s === 'auto') x.props[`${prop}Mode`] = 'auto';
        else if (s === 'manual') { x.props[prop] = axesInfo(ctx, x)[prop].slice(); x.props[`${prop}Mode`] = 'manual'; }
        else if (['tight', 'padded', 'tickaligned'].includes(s) && axis !== 'C') { x.props[`${axis}LimitMethod`] = s; x.props[`${prop}Mode`] = 'auto'; }
        else throw gerr('lim:option', `Unknown option '${txt(a[0])}'.`);
        touch(st, x);
      }
      return [];
    }
    const L = Array.from(nums(a[0]));
    if (L.length !== 2) throw gerr('lim:size', 'Limits must be a 2-element vector.');
    for (const x of axs) {
      if (x.type === 'heatmap' && axis === 'C') { x.props.ColorLimits = L; x.props.ColorLimitsMode = 'manual'; touch(st, x); continue; }
      setProp(ctx, x, prop, rowVec(L));
      propagateLink(ctx, x, prop);
    }
    return [];
  };
}

function propagateLink(ctx, ax, prop) {
  const st = G(ctx);
  const group = ax.internal.link;
  if (!group || !group.dims.includes(prop[0])) return;
  for (const id of group.ids) {
    const o = st.objs.get(id);
    if (!o || o === ax) continue;
    o.props[prop] = ax.props[prop].slice(); o.props[`${prop}Mode`] = 'manual';
    touch(st, o);
  }
}
for (const p of ['XLim', 'YLim', 'ZLim']) {
  onSet(['axes'], p, (ctx, ax, x) => { ax.props[p] = x; ax.props[`${p}Mode`] = 'manual'; ax.userSet.add(p); propagateLink(ctx, ax, p); return true; });
}

function ticksBuiltin(axis, what) {
  const prop = `${axis}${what}`;
  return (args, nargout, ctx) => {
    const st = G(ctx);
    const { axs, args: a } = axesArg(ctx, args);
    const ax = axs[0];
    if (ax.type === 'polaraxes' && (axis === 'X' || axis === 'Y')) { /* fallthrough: same props */ }
    if (!a.length) {
      if (what === 'Tick') return rowVec(axesInfo(ctx, ax)[prop] || []);
      const L = axesInfo(ctx, ax)[prop] || [];
      return cell([L.length, 1], L.map((s) => str(s)));
    }
    if (isTxt(a[0]) && ['auto', 'manual', 'mode'].includes(lower(txt(a[0])))) {
      const s = lower(txt(a[0]));
      if (s === 'mode') return str(ax.props[`${prop}Mode`]);
      for (const x of axs) { if (s === 'manual') { x.props[prop] = axesInfo(ctx, x)[prop].slice(); } x.props[`${prop}Mode`] = s; touch(st, x); }
      return [];
    }
    for (const x of axs) setProp(ctx, x, prop, a[0]);
    return [];
  };
}
function tickAngle(axis) {
  return (args, nargout, ctx) => {
    const { axs, args: a } = axesArg(ctx, args);
    if (!a.length) return num(axs[0].props[`${axis}TickLabelRotation`]);
    for (const x of axs) setProp(ctx, x, `${axis}TickLabelRotation`, a[0]);
    return [];
  };
}

function onOffBuiltin(props, opts = {}) {
  return (args, nargout, ctx) => {
    const st = G(ctx);
    const { axs, args: a } = axesArg(ctx, args);
    for (const ax of axs) {
      let v;
      if (!a.length) v = opts.toggle ? !ax.props[props[0]] : true;
      else {
        const s = lower(txt(a[0]));
        if (s === 'on') v = true; else if (s === 'off') v = false;
        else if (s === 'minor' && opts.minor) { const m = !ax.props.XMinorGrid; for (const k of ['XMinorGrid', 'YMinorGrid', 'ZMinorGrid']) ax.props[k] = m; touch(st, ax); continue; }
        else throw gerr('onoff:option', `Option must be 'on' or 'off'.`);
      }
      for (const p of props) ax.props[p] = v;
      if (opts.minor && !v) for (const k of ['XMinorGrid', 'YMinorGrid', 'ZMinorGrid']) ax.props[k] = false;
      touch(st, ax);
    }
    return [];
  };
}

function holdBuiltin(args, nargout, ctx) {
  const st = G(ctx);
  const { axs, args: a } = axesArg(ctx, args);
  const ax = axs[0];
  const f = figureOf(st, ax);
  let on;
  if (!a.length) on = ax.props.NextPlot !== 'add';
  else { const s = lower(txt(a[0])); on = s === 'on' || s === 'all'; if (!on && s !== 'off') throw gerr('hold:option', "hold must be 'on' or 'off'."); }
  for (const x of axs) x.props.NextPlot = on ? 'add' : 'replace';
  if (f) f.props.NextPlot = 'add';
  return [];
}

function viewBuiltin(args, nargout, ctx) {
  const st = G(ctx);
  const { axs, args: a } = axesArg(ctx, args);
  if (!a.length) { const v = axs[0].props.View; return nargout >= 2 ? [num(v[0]), num(v[1])] : rowVec(v); }
  let v;
  const n = a.map((x) => Array.from(nums(x)));
  if (n.length === 1 && n[0].length === 1) v = n[0][0] === 2 ? [0, 90] : n[0][0] === 3 ? [-37.5, 30] : null;
  else if (n.length === 1 && n[0].length === 2) v = n[0];
  else if (n.length === 1 && n[0].length === 3) { const [x, y, z] = n[0]; v = [Math.atan2(x, -y) * 180 / Math.PI, Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI]; }
  else if (n.length >= 2) v = [n[0][0], n[1][0]];
  if (!v) throw gerr('view:args', 'view(2), view(3), view(az, el) or view([az el]).');
  for (const ax of axs) { ax.props.View = v.map((x) => Number(x)); touch(st, ax); }
  return [];
}

function aspectBuiltin(prop) {
  return (args, nargout, ctx) => {
    const st = G(ctx);
    const { axs, args: a } = axesArg(ctx, args);
    if (!a.length) return rowVec(axesInfo(ctx, axs[0])[prop]);
    if (isTxt(a[0])) { const s = lower(txt(a[0])); for (const ax of axs) { if (s === 'mode') return str(ax.props[`${prop}Mode`]); ax.props[`${prop}Mode`] = s === 'manual' ? 'manual' : 'auto'; touch(st, ax); } return []; }
    let v = Array.from(nums(a[0]));
    if (v.length === 2) v = [v[0], v[1], 1];
    for (const ax of axs) setProp(ctx, ax, prop, rowVec(v));
    return [];
  };
}

function interactionMode(mode) {
  return (args, nargout, ctx) => {
    let a = args;
    let f = null;
    if (a.length && isHandleValue(a[0])) { const [o] = objsOf(ctx, a[0]); f = o.type === 'figure' ? o : figureOf(G(ctx), o); a = a.slice(1); }
    f = f || currentFigure(ctx, true);
    let on = true;
    if (a.length) { const s = lower(txt(a[0])); on = !['off'].includes(s); if (mode === 'zoom' && (s === 'out' || s === 'reset')) { resetView(ctx, f); return []; } }
    G(ctx).modes.set(f.id, on ? mode : 'none');
    ctx.host.post({ type: 'graphics.mode', figure: f.id, mode: on ? mode : 'none' });
    return [];
  };
}
function resetView(ctx, f) {
  const st = G(ctx);
  for (const ax of allAxes(st, f)) { for (const k of ['XLimMode', 'YLimMode', 'ZLimMode']) ax.props[k] = 'auto'; touch(st, ax); }
}

// ---------------------------------------------------------------- layouts

function subplotBuiltin(args, nargout, ctx) {
  const st = G(ctx);
  let a = args.slice();
  const f = currentFigure(ctx, true);
  if (a.length && isTxt(a[0]) && lower(txt(a[0])) === 'position') {
    const pos = Array.from(nums(a[1]));
    const ax = newAxes(ctx, f, 'axes', { Position: pos, PositionConstraint: 'innerposition' });
    setPairs(ctx, [ax], a, 2);
    return handleValue(ctx, [ax.id]);
  }
  if (a.length === 1 && isHandleValue(a[0])) { const [ax] = objsOf(ctx, a[0]); makeCurrentAxes(ctx, ax); return handleValue(ctx, [ax.id]); }
  let m, n, cells;
  if (a.length >= 3 && !isTxt(a[0])) { m = nums(a[0])[0]; n = nums(a[1])[0]; cells = Array.from(nums(a[2])); a = a.slice(3); }
  else if (a.length >= 1 && !isTxt(a[0])) { const v = Math.round(nums(a[0])[0]); m = Math.floor(v / 100); n = Math.floor(v / 10) % 10; cells = [v % 10]; a = a.slice(1); }
  else throw gerr('subplot:args', 'subplot(m, n, p).');
  if (!(m >= 1 && n >= 1) || cells.some((c) => !(c >= 1 && c <= m * n))) throw gerr('subplot:index', 'Index exceeds number of subplots.');
  let replace = false;
  a = a.filter((v) => { if (isTxt(v) && ['replace', 'align'].includes(lower(txt(v)))) { if (lower(txt(v)) === 'replace') replace = true; return false; } return true; });
  const key = `${m},${n},${cells.slice().sort((x, y) => x - y).join(' ')}`;
  const outer = subplotOuter(m, n, cells);
  // remove tiled layouts / heatmaps / axes that overlap
  let found = null;
  for (const c of f.children.slice()) {
    const o = st.objs.get(c);
    if (!o) continue;
    if (isAxesType(o.type) && o.internal.subplot === key && !replace) { found = o; continue; }
    if (o.type === 'tiledlayout' || ((isAxesType(o.type) || o.type === 'heatmap') && overlaps(o.props.OuterPosition, outer))) destroy(ctx, o.id);
  }
  const ax = found || newAxes(ctx, f, 'axes', { OuterPosition: outer, Position: innerFromOuter(outer) });
  ax.internal.subplot = key;
  setPairs(ctx, [ax], a);
  makeCurrentAxes(ctx, ax);
  return handleValue(ctx, [ax.id]);
}
function overlaps(p, q) {
  const ix = Math.min(p[0] + p[2], q[0] + q[2]) - Math.max(p[0], q[0]);
  const iy = Math.min(p[1] + p[3], q[1] + q[3]) - Math.max(p[1], q[1]);
  return ix > 0.02 * Math.min(p[2], q[2]) && iy > 0.02 * Math.min(p[3], q[3]);
}

function tiledlayoutBuiltin(args, nargout, ctx) {
  const st = G(ctx);
  let a = args.slice();
  let parent = null;
  if (a.length && isHandleValue(a[0])) { [parent] = objsOf(ctx, a[0]); a = a.slice(1); }
  const f = parent || currentFigure(ctx, true);
  let grid = [1, 1], flow = false;
  if (a.length && isTxt(a[0]) && ['flow', 'vertical', 'horizontal'].includes(lower(txt(a[0])))) { flow = lower(txt(a[0])); a = a.slice(1); }
  else if (a.length >= 2 && !isTxt(a[0])) { grid = [nums(a[0])[0], nums(a[1])[0]]; a = a.slice(2); }
  else if (a.length && !isTxt(a[0])) { const v = Array.from(nums(a[0])); grid = v.length === 2 ? v : [v[0], v[0]]; a = a.slice(1); }
  else flow = 'flow';
  if (f.type === 'figure') for (const c of f.children.slice()) { const o = st.objs.get(c); if (o && (isAxesType(o.type) || o.type === 'tiledlayout' || o.type === 'heatmap')) destroy(ctx, c); }
  const t = create(ctx, 'tiledlayout', f.id, { GridSize: grid });
  t.internal.flow = flow;
  t.internal.next = 1;
  setPairs(ctx, [t], a);
  makeCurrentFigure(ctx, figureOf(st, t));
  f.internal.layout = t.id;
  return handleValue(ctx, [t.id]);
}

function relayoutTiles(ctx, t) {
  const st = G(ctx);
  for (const c of t.children) {
    const o = st.objs.get(c);
    if (!o || !o.internal.tile) continue;
    o.props.OuterPosition = tileOuter(t, o.internal.tile, o.internal.span || [1, 1]);
    o.props.Position = innerFromOuter(o.props.OuterPosition);
    touch(st, o);
  }
}

function nexttileBuiltin(args, nargout, ctx) {
  const st = G(ctx);
  let a = args.slice();
  let t = null;
  if (a.length && isHandleValue(a[0])) { [t] = objsOf(ctx, a[0]); a = a.slice(1); }
  if (!t) {
    const f = currentFigure(ctx, true);
    t = f.internal.layout != null ? st.objs.get(f.internal.layout) : null;
    if (!t) t = st.objs.get(handleIds(tiledlayoutBuiltin([str('flow')], 1, ctx))[0]);
  }
  let tile = null, span = [1, 1];
  const n = a.filter((v) => !isTxt(v)).map((v) => Array.from(nums(v)));
  if (n.length === 1) { if (n[0].length === 2) span = n[0]; else tile = n[0][0]; }
  else if (n.length >= 2) { tile = n[0][0]; span = n[1].length === 2 ? n[1] : [n[1][0], n[1][0]]; }
  const [R, C] = t.props.GridSize;
  if (tile == null) {
    // next free tile
    const used = new Set();
    for (const c of t.children) { const o = st.objs.get(c); if (o && o.internal.tile) for (let r = 0; r < (o.internal.span || [1, 1])[0]; r++) for (let q = 0; q < (o.internal.span || [1, 1])[1]; q++) used.add(o.internal.tile + r * C + q); }
    tile = 1;
    while (used.has(tile)) tile++;
  }
  if (t.internal.flow) {
    const count = Math.max(tile, ...t.children.map((c) => st.objs.get(c)?.internal.tile || 0));
    let r, c;
    if (t.internal.flow === 'vertical') { r = count; c = 1; } else if (t.internal.flow === 'horizontal') { r = 1; c = count; }
    else { c = Math.ceil(Math.sqrt(count)); r = Math.ceil(count / c); }
    if (r * c < count) r++;
    const old = t.props.GridSize;
    if (old[0] !== r || old[1] !== c) {
      // re-number existing tiles for the new column count
      for (const ch of t.children) { const o = st.objs.get(ch); if (o && o.internal.tile) { const k = o.internal.tile - 1; o.internal.tile = Math.floor(k / old[1]) * c + (k % old[1]) + 1; if (t.internal.flow === 'flow') o.internal.tile = k + 1; } }
      t.props.GridSize = [r, c];
    }
  } else if (tile > R * C) throw gerr('nexttile:index', 'Tile number exceeds the number of tiles in the layout.');
  // existing axes at this tile?
  for (const c of t.children) { const o = st.objs.get(c); if (o && o.internal.tile === tile && isAxesType(o.type)) { if (a.some((v) => isTxt(v) && lower(txt(v)) === 'replace' || false)) destroy(ctx, o.id); else { makeCurrentAxes(ctx, o); relayoutTiles(ctx, t); return handleValue(ctx, [o.id]); } } }
  const f = figureOf(st, t);
  const ax = newAxes(ctx, f, 'axes', {}, t.id);
  ax.internal.tile = tile; ax.internal.span = span;
  relayoutTiles(ctx, t);
  makeCurrentAxes(ctx, ax);
  return handleValue(ctx, [ax.id]);
}

function axesBuiltin(type) {
  return (args, nargout, ctx) => {
    const st = G(ctx);
    let a = args.slice();
    if (a.length === 1 && isHandleValue(a[0])) {
      const [o] = objsOf(ctx, a[0]);
      if (isAxesType(o.type)) { makeCurrentAxes(ctx, o); return handleValue(ctx, [o.id]); }
    }
    let parent = null;
    if (a.length && isHandleValue(a[0])) { [parent] = objsOf(ctx, a[0]); a = a.slice(1); }
    const pi = a.findIndex((v, i) => i % 2 === 0 && isTxt(v) && lower(txt(v)) === 'parent');
    if (pi >= 0) { [parent] = objsOf(ctx, a[pi + 1]); a.splice(pi, 2); }
    const f = parent ? (parent.type === 'figure' ? parent : figureOf(st, parent)) : currentFigure(ctx, true);
    if (type === 'polaraxes') {
      // replace a cartesian axes sitting at the same place
      const cur = st.objs.get(f.props.CurrentAxes);
      if (cur && cur.type === 'axes' && cur.parent === f.id && !cur.children.length && !a.length) destroy(ctx, cur.id);
    }
    const ax = newAxes(ctx, f, type, {}, parent && parent.type !== 'figure' ? parent.id : null);
    setPairs(ctx, [ax], a);
    makeCurrentAxes(ctx, ax);
    return handleValue(ctx, [ax.id]);
  };
}

function linkaxesBuiltin(args, nargout, ctx) {
  const st = G(ctx);
  let axs;
  let a = args;
  if (a.length && (isHandleValue(a[0]) || isNum(a[0]))) { axs = objsOf(ctx, a[0]).filter((o) => isAxesType(o.type)); a = a.slice(1); }
  else axs = allAxes(st, currentFigure(ctx, true));
  const opt = a.length ? lower(txt(a[0])) : 'xy';
  if (opt === 'off') { for (const ax of axs) ax.internal.link = null; return []; }
  const dims = opt.toUpperCase().split('').filter((c) => 'XYZ'.includes(c));
  const group = { ids: axs.map((o) => o.id), dims };
  for (const d of dims) {
    let lo = Infinity, hi = -Infinity;
    for (const ax of axs) { const L = axesInfo(ctx, ax)[`${d}Lim`]; lo = Math.min(lo, L[0]); hi = Math.max(hi, L[1]); }
    for (const ax of axs) { ax.props[`${d}Lim`] = [lo, hi]; ax.props[`${d}LimMode`] = 'manual'; touch(st, ax); }
  }
  for (const ax of axs) ax.internal.link = group;
  return [];
}

// ---------------------------------------------------------------- annotation

function annotationBuiltin(args, nargout, ctx) {
  const st = G(ctx);
  let a = args.slice();
  let f = null;
  if (a.length && isHandleValue(a[0])) { [f] = objsOf(ctx, a[0]); a = a.slice(1); }
  f = f || currentFigure(ctx, true);
  if (!a.length || !isTxt(a[0])) throw gerr('annotation:args', "annotation(type, ...): type is 'line', 'arrow', 'doublearrow', 'textarrow', 'rectangle', 'ellipse' or 'textbox'.");
  const shape = lower(txt(a[0]));
  if (!['line', 'arrow', 'doublearrow', 'textarrow', 'rectangle', 'ellipse', 'textbox'].includes(shape)) throw gerr('annotation:type', `Unknown annotation type '${txt(a[0])}'.`);
  const o = create(ctx, 'annotation', f.id, {});
  o.internal.shape = shape;
  let k = 1;
  if (['line', 'arrow', 'doublearrow', 'textarrow'].includes(shape)) {
    if (a.length > 2 && !isTxt(a[1])) { o.props.X = Array.from(nums(a[1])); o.props.Y = Array.from(nums(a[2])); k = 3; }
    if (shape === 'textarrow') { o.props.HorizontalAlignment = 'center'; }
  } else if (a.length > 1 && !isTxt(a[1])) { o.props.Position = Array.from(nums(a[1])); k = 2; }
  if (shape === 'textbox') { o.props.EdgeColor = [0, 0, 0]; o.props.VerticalAlignment = 'top'; }
  setPairs(ctx, [o], a, k);
  touch(st, o);
  return handleValue(ctx, [o.id]);
}

// ---------------------------------------------------------------- pause / drawnow

let pauseEnabled = true;
function sleep(ms, ctx) {
  const end = Date.now() + ms;
  let ia = null;
  try { if (typeof SharedArrayBuffer !== 'undefined') ia = new Int32Array(new SharedArrayBuffer(4)); } catch { ia = null; }
  while (Date.now() < end) {
    ctx.checkInterrupt();
    const left = Math.min(50, end - Date.now());
    if (left <= 0) break;
    if (ia) { try { Atomics.wait(ia, 0, 0, left); continue; } catch { ia = null; } }
    const t = Date.now() + left; while (Date.now() < t) { /* spin */ }
  }
}

export const builtins = {
  __graphics_flush__(args, nargout, ctx) { flush(ctx, args.length > 0 && isTxt(args[0]) && lower(txt(args[0])) === 'full'); return []; },
  figure: figureBuiltin,
  uifigure_internal: undefined,
  gcf(args, nargout, ctx) { return handleValue(ctx, [currentFigure(ctx, true).id]); },
  gca(args, nargout, ctx) { return handleValue(ctx, [currentAxes(ctx, true).id]); },
  gco(args, nargout, ctx) { const st = G(ctx); const id = st.gco; return handleValue(ctx, id != null && st.objs.has(id) ? [id] : []); },
  gcbo(args, nargout, ctx) { const st = G(ctx); const id = st.objs.get(0).props.CallbackObject; return handleValue(ctx, id != null && st.objs.has(id) ? [id] : []); },
  gcbf(args, nargout, ctx) { const st = G(ctx); const o = st.objs.get(st.objs.get(0).props.CallbackObject); const f = o ? figureOf(st, o) : null; return handleValue(ctx, f ? [f.id] : []); },
  groot(args, nargout, ctx) { G(ctx); return handleValue(ctx, [0]); },
  shg(args, nargout, ctx) { const f = currentFigure(ctx, false); if (f) { makeCurrentFigure(ctx, f); flush(ctx); } return []; },
  clf(args, nargout, ctx) {
    const st = G(ctx);
    let a = args;
    let f;
    if (a.length && !isTxt(a[0])) { [f] = objsOf(ctx, a[0]); a = a.slice(1); } else f = currentFigure(ctx, true);
    const reset = a.length && lower(txt(a[0])) === 'reset';
    for (const c of f.children.slice()) { const o = st.objs.get(c); if (o && (reset || o.props.HandleVisibility === 'on')) destroy(ctx, c); }
    if (f.internal.sgtitle != null) { destroy(ctx, f.internal.sgtitle, false); f.internal.sgtitle = null; }
    f.internal.layout = null;
    f.props.CurrentAxes = null;
    if (reset) { f.props.Colormap = matOfRows(colormapByName('default', 256)); f.props.Name = ''; }
    touch(st, f);
    return nargout ? handleValue(ctx, [f.id]) : [];
  },
  cla(args, nargout, ctx) {
    let a = args;
    let ax;
    if (a.length && isHandleValue(a[0])) { [ax] = objsOf(ctx, a[0]); a = a.slice(1); } else ax = currentAxes(ctx, true);
    clearAxes(ctx, ax, a.length > 0 && lower(txt(a[0])) === 'reset');
    return [];
  },
  close: closeBuiltin,
  delete(args, nargout, ctx) {
    for (const v of args) {
      if (isTxt(v)) {
        // file delete (wildcards in the name part)
        const p = txt(v);
        const fs = ctx.fs;
        const abs = /^([A-Za-z]:)?\//.test(p) ? p : `${fs.cwd().replace(/\/$/, '')}/${p}`;
        if (/[*?]/.test(abs)) {
          const dir = abs.slice(0, abs.lastIndexOf('/')) || '/';
          const re = new RegExp(`^${abs.slice(abs.lastIndexOf('/') + 1).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
          for (const e of fs.list(dir)) if (!e.isDir && re.test(e.name)) fs.remove(`${dir}/${e.name}`);
        } else {
          if (!fs.exists(abs)) { ctx.warning('graphics:delete:fileNotFound', `File '${p}' not found.`); continue; }
          fs.remove(abs);
        }
        continue;
      }
      const st = G(ctx);
      for (const id of handleIds(v)) { if (st.objs.has(id)) destroy(ctx, id); }
    }
    return [];
  },
  ishandle(args, nargout, ctx) { return isGraphicsFn(ctx, args, false); },
  isgraphics(args, nargout, ctx) { return isGraphicsFn(ctx, args, true); },
  findobj(args, nargout, ctx) { return findobjImpl(ctx, args, false); },
  findall(args, nargout, ctx) { return findobjImpl(ctx, args, true); },
  allchild(args, nargout, ctx) {
    const st = G(ctx);
    const objs = objsOf(ctx, args[0]);
    const kids = (o) => [...o.children, ...(isAxesType(o.type) ? ['Title', 'Subtitle', 'XLabel', 'YLabel', 'ZLabel'].map((k) => o.props[k]).filter((x) => x != null) : [])];
    if (objs.length === 1) { const ids = kids(objs[0]).filter((id) => st.objs.has(id)); return handleValue(ctx, ids, [ids.length, ids.length ? 1 : 0]); }
    return cell([objs.length, 1], objs.map((o) => handleValue(ctx, kids(o))));
  },
  ancestor(args, nargout, ctx) {
    const st = G(ctx);
    const ids = handleIds(args[0]);
    if (!ids.length || !st.objs.has(ids[0])) return handleValue(ctx, []);
    const types = args.length > 1 ? txtList(args[1]).map(lower) : [];
    const top = args.length > 2 && lower(txt(args[2])) === 'toplevel';
    let cur = st.objs.get(ids[0]);
    let hit = null;
    while (cur) {
      if (types.includes(cur.type) || (types.includes('axes') && isAxesType(cur.type))) { hit = cur; if (!top) break; }
      cur = cur.parent == null ? null : st.objs.get(cur.parent);
    }
    return handleValue(ctx, hit ? [hit.id] : []);
  },
  get: getBuiltin,
  set: setBuiltin,
  reset(args, nargout, ctx) {
    for (const o of objsOf(ctx, args[0])) {
      if (isAxesType(o.type)) { resetAxes(ctx, o); continue; }
      for (const e of [...COMMON, ...TYPES[o.type]]) if (!['mat', 'handle', 'ro'].includes(e[1]) && !['Position', 'String', 'XData', 'YData', 'ZData', 'CData'].includes(e[0])) o.props[e[0]] = Array.isArray(e[2]) ? e[2].slice() : e[2];
      o.userSet = new Set();
      touch(G(ctx), o);
    }
    return [];
  },
  gobjects(args, nargout, ctx) {
    const d = args.length === 0 ? [0, 0] : args.length === 1 ? (() => { const v = Array.from(nums(args[0])); return v.length >= 2 ? v : [v[0], v[0]]; })() : [nums(args[0])[0], nums(args[1])[0]];
    const n = d[0] * d[1];
    return handleValue(ctx, new Array(n).fill(-1), d);
  },
  hold: holdBuiltin,
  ishold(args, nargout, ctx) { const { axs } = axesArg(ctx, args); return bool(axs[0].props.NextPlot === 'add'); },
  newplot(args, nargout, ctx) { const { ax } = newplot(ctx, args.length ? objsOf(ctx, args[0])[0] : null); return handleValue(ctx, [ax.id]); },
  drawnow(args, nargout, ctx) { flush(ctx); return []; },
  refresh(args, nargout, ctx) { const f = args.length ? objsOf(ctx, args[0])[0] : currentFigure(ctx, false); if (f) touch(G(ctx), f); flush(ctx); return []; },
  pause(args, nargout, ctx) {
    flush(ctx);
    if (args.length && isTxt(args[0])) { const s = lower(txt(args[0])); if (s === 'on') pauseEnabled = true; else if (s === 'off') pauseEnabled = false; else if (s === 'query') return str(pauseEnabled ? 'on' : 'off'); return []; }
    if (!pauseEnabled) return [];
    if (!args.length) { const r = ctx.host.request({ type: 'graphics.pause' }); void r; return []; }
    const secs = nums(args[0])[0];
    if (secs === Infinity) { ctx.host.request({ type: 'graphics.pause' }); return []; }
    if (secs > 0) sleep(secs * 1000, ctx);
    return [];
  },
  axes: axesBuiltin('axes'),
  polaraxes: axesBuiltin('polaraxes'),
  subplot: subplotBuiltin,
  tiledlayout: tiledlayoutBuiltin,
  nexttile: nexttileBuiltin,
  title(args, nargout, ctx) { const h = setLabel(ctx, 'Title', args); return nargout ? h : []; },
  subtitle(args, nargout, ctx) { const h = setLabel(ctx, 'Subtitle', args); return nargout ? h : []; },
  xlabel(args, nargout, ctx) { const h = setLabel(ctx, 'XLabel', args); return nargout ? h : []; },
  ylabel(args, nargout, ctx) { const h = setLabel(ctx, 'YLabel', args); return nargout ? h : []; },
  zlabel(args, nargout, ctx) { const h = setLabel(ctx, 'ZLabel', args); return nargout ? h : []; },
  sgtitle(args, nargout, ctx) { const h = sgtitleBuiltin(args, nargout, ctx); return nargout ? h : []; },
  suptitle(args, nargout, ctx) { const h = sgtitleBuiltin(args, nargout, ctx); return nargout ? h : []; },
  legend: legendBuiltin,
  colorbar: colorbarBuiltin,
  colormap: colormapBuiltin,
  annotation(args, nargout, ctx) { const h = annotationBuiltin(args, nargout, ctx); return nargout ? h : []; },
  axis(args, nargout, ctx) { const r = axisBuiltin(args, nargout, ctx); return Array.isArray(r) && !r.length ? [] : r; },
  xlim: limBuiltin('X'), ylim: limBuiltin('Y'), zlim: limBuiltin('Z'), clim: limBuiltin('C'), caxis: limBuiltin('C'),
  thetalim(args, nargout, ctx) {
    const { axs, args: a } = axesArg(ctx, args);
    if (!a.length) return rowVec(axesInfo(ctx, axs[0]).ThetaLim || axs[0].props.ThetaLim);
    for (const ax of axs) setProp(ctx, ax, 'ThetaLim', a[0]);
    return [];
  },
  rlim(args, nargout, ctx) {
    const { axs, args: a } = axesArg(ctx, args);
    if (!a.length) return rowVec(axesInfo(ctx, axs[0]).RLim || axs[0].props.RLim);
    for (const ax of axs) setProp(ctx, ax, 'RLim', a[0]);
    return [];
  },
  rticks: ticksBuiltin('R', 'Tick'), thetaticks: ticksBuiltin('Theta', 'Tick'),
  xticks: ticksBuiltin('X', 'Tick'), yticks: ticksBuiltin('Y', 'Tick'), zticks: ticksBuiltin('Z', 'Tick'),
  xticklabels: ticksBuiltin('X', 'TickLabel'), yticklabels: ticksBuiltin('Y', 'TickLabel'), zticklabels: ticksBuiltin('Z', 'TickLabel'),
  xtickangle: tickAngle('X'), ytickangle: tickAngle('Y'), ztickangle: tickAngle('Z'),
  grid: onOffBuiltin(['XGrid', 'YGrid', 'ZGrid'], { toggle: true, minor: true }),
  box: onOffBuiltin(['Box'], { toggle: true }),
  view: viewBuiltin,
  daspect: aspectBuiltin('DataAspectRatio'),
  pbaspect: aspectBuiltin('PlotBoxAspectRatio'),
  rotate3d: interactionMode('rotate'),
  zoom: interactionMode('zoom'),
  pan: interactionMode('pan'),
  datacursormode: interactionMode('datacursor'),
  linkaxes: linkaxesBuiltin,
  ...Object.fromEntries(COLORMAP_NAMES.filter((n) => n !== 'default').map((n) => [n, cmapFn(n)])),
  parula: cmapFn('default'),
};
delete builtins.uifigure_internal;

function isGraphicsFn(ctx, args, typed) {
  const st = G(ctx);
  const v = args[0];
  if (v == null) return bool(false);
  let ids;
  try { ids = handleIds(v); } catch { return bool(false); }
  const type = typed && args.length > 1 ? lower(txt(args[1])) : null;
  const out = ids.map((id) => { const o = st.objs.get(id); return o && !isPlaceholder(id) && (!type || o.type === type || (type === 'axes' && isAxesType(o.type))) ? 1 : 0; });
  return tensor('logical', v.dims ? v.dims.slice() : [1, 1], out);
}

export { axesArg, cmapArg, resetView, relayoutTiles };
