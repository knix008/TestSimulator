// Handle-graphics object model: the object store in ctx.state.graphics,
// creation / deletion, property get / set with validation, handle values.
import { object, isObject, tensor, str, num, cell, empty, structOf, struct, isFuncHandle, isCell, isTensor } from '../value.js';
import { gerr, isTxt, txt, txtList, nums, isNum, parseColor, fmtNum } from './util.js';
import { TYPES, COMMON, THEMED, TYPE_CLASS, DISPLAY_PROPS, defaultCmap } from './schema.js';
import { DEFAULT_COLOR_ORDER } from './colormaps.js';

// ---------------------------------------------------------------- state

const FRACTION = 1 / 1024; // non-figure handles are k + 1/1024 (never integers)

export function G(ctx) {
  if (!ctx.state.graphics) {
    const root = { id: 0, type: 'root', parent: null, children: [], props: {}, ver: 0, userSet: new Set() };
    applyDefaults(root);
    ctx.state.graphics = { objs: new Map([[0, root]]), seq: 1, dirty: new Set(), closed: [], sentOnce: false, gco: null, holdAll: false, modes: new Map(), flushes: 0 };
  }
  return ctx.state.graphics;
}

export const getObj = (st, id) => st.objs.get(id) || null;
export function mustObj(st, id, what = 'Handle') {
  const o = st.objs.get(id);
  if (!o) throw gerr('invalidHandle', `${what} is not a valid graphics object (it may have been deleted).`);
  return o;
}

function specOf(type) {
  const list = TYPES[type];
  if (!list) throw gerr('internal', `Unknown graphics type '${type}'.`);
  if (!specOf.cache) specOf.cache = new Map();
  let m = specOf.cache.get(type);
  if (!m) {
    m = new Map();
    for (const e of [...COMMON, ...list]) m.set(e[0].toLowerCase(), e);
    specOf.cache.set(type, m);
  }
  return m;
}

/** Spec entry of a property by (case-insensitive, unique-prefix) name, or null. */
export function findProp(type, name) {
  const m = specOf(type);
  const l = String(name).toLowerCase();
  if (m.has(l)) return m.get(l);
  let hit = null;
  for (const [k, e] of m) if (k.startsWith(l)) { if (hit) throw gerr('ambiguousProperty', `Ambiguous property name '${name}' for ${TYPE_CLASS[type] || type}.`); hit = e; }
  return hit;
}
export function propNames(type) { return [...specOf(type).values()].map((e) => e[0]); }

const cloneDefault = (d) => (Array.isArray(d) ? d.map((x) => (Array.isArray(x) ? x.slice() : x)) : d);
function applyDefaults(o) {
  for (const e of specOf(o.type).values()) o.props[e[0]] = cloneDefault(e[2]);
}

// ---------------------------------------------------------------- dirty tracking

export function figureOf(st, o) {
  let cur = o;
  while (cur && cur.type !== 'figure') cur = cur.parent == null ? null : st.objs.get(cur.parent);
  return cur;
}
export function axesOf(st, o) {
  let cur = o;
  while (cur && !isAxesType(cur.type)) cur = cur.parent == null ? null : st.objs.get(cur.parent);
  return cur;
}
export const isAxesType = (t) => t === 'axes' || t === 'polaraxes' || t === 'uiaxes';

export function touch(st, o) {
  if (!o) return;
  o.ver = (o.ver || 0) + 1;
  // bump axes too (computed limits depend on children)
  const ax = axesOf(st, o);
  if (ax && ax !== o) ax.ver = (ax.ver || 0) + 1;
  const f = figureOf(st, o);
  if (f) st.dirty.add(f.id);
}

// ---------------------------------------------------------------- creation

export function newId(st, type, wanted = null) {
  if (type === 'figure') {
    if (wanted != null) return wanted;
    let n = 1;
    while (st.objs.has(n)) n++;
    return n;
  }
  const id = st.seq++ + FRACTION;
  return id;
}

/**
 * Creates an object of `type` under `parent` (id). `props` is a JS object of
 * already-converted values (bypasses validation) — use setProps for Values.
 */
export function create(ctx, type, parentId, props = {}, opts = {}) {
  const st = G(ctx);
  const id = newId(st, type, opts.id);
  const o = { id, type, parent: parentId, children: [], props: {}, ver: 0, userSet: new Set(), internal: {} };
  applyDefaults(o);
  st.objs.set(id, o);
  if (parentId != null) {
    const p = mustObj(st, parentId, 'Parent');
    if (opts.hidden) { /* label texts etc.: not in Children */ } else p.children.unshift(id);
  }
  o.hidden = !!opts.hidden;
  if (type === 'figure') {
    o.props.Number = id;
    o.props.Colormap = matOfRows(defaultCmap());
    st.objs.get(0).props.CurrentFigure = id;
  }
  if (isAxesType(type)) {
    o.props.Kind = type === 'polaraxes' ? 'polar' : 'cartesian';
    o.props.XAxisType = 'numeric'; o.props.YAxisType = 'numeric';
    o.props.ColorOrder = matOfRows(DEFAULT_COLOR_ORDER);
    makeAxesLabels(ctx, o);
  }
  if (type === 'tiledlayout') {
    o.props.Title = create(ctx, 'text', id, { HorizontalAlignment: 'center', FontWeight: 'bold', FontSize: 11 }, { hidden: true }).id;
  }
  if (type === 'colorbar') o.props.Label = create(ctx, 'text', id, { HorizontalAlignment: 'center', Rotation: 90 }, { hidden: true }).id;
  Object.assign(o.props, props);
  for (const k of Object.keys(props)) o.userSet.add(k);
  touch(st, o);
  return o;
}

function makeAxesLabels(ctx, ax) {
  const mk = (extra) => create(ctx, 'text', ax.id, { HorizontalAlignment: 'center', ...extra }, { hidden: true }).id;
  ax.props.Title = mk({ FontWeight: 'bold', VerticalAlignment: 'bottom', FontSize: 11 });
  ax.props.Subtitle = mk({ VerticalAlignment: 'bottom' });
  ax.props.XLabel = mk({ VerticalAlignment: 'top', FontSize: 11 });
  ax.props.YLabel = mk({ Rotation: 90, VerticalAlignment: 'bottom', FontSize: 11 });
  ax.props.ZLabel = mk({ Rotation: 90, VerticalAlignment: 'bottom', FontSize: 11 });
  for (const k of ['Title', 'Subtitle', 'XLabel', 'YLabel', 'ZLabel']) ax.userSet.delete(k);
}

/** Ids of an object's hidden helper objects (labels, legend, colorbar). */
export function helperIds(o) {
  const out = [];
  for (const k of ['Title', 'Subtitle', 'XLabel', 'YLabel', 'ZLabel', 'Legend', 'Colorbar', 'Label']) {
    const v = o.props[k];
    if (typeof v === 'number' && specOf(o.type).get(k.toLowerCase())?.[1] === 'handle') out.push(v);
  }
  if (o.type === 'figure' && o.internal && o.internal.sgtitle != null) out.push(o.internal.sgtitle);
  return out;
}

/** Deletes an object and its descendants. Runs DeleteFcn callbacks. */
export function destroy(ctx, id, runCallbacks = true) {
  const st = G(ctx);
  const o = st.objs.get(id);
  if (!o || o.type === 'root' || o.deleting) return;
  o.deleting = true;
  if (runCallbacks && o.props.DeleteFcn) { try { invokeCallback(ctx, o.props.DeleteFcn, o, null); } catch (e) { ctx.warning('graphics:DeleteFcn', e.message); } }
  for (const c of o.children.slice()) destroy(ctx, c, runCallbacks);
  for (const h of helperIds(o)) destroy(ctx, h, false);
  const f = figureOf(st, o);
  if (o.parent != null) {
    const p = st.objs.get(o.parent);
    if (p) {
      p.children = p.children.filter((c) => c !== id);
      for (const k of ['Legend', 'Colorbar']) if (p.props[k] === id) p.props[k] = null;
      if (p.type === 'figure' && p.props.CurrentAxes === id) p.props.CurrentAxes = p.children.map((c) => st.objs.get(c)).find((c) => c && isAxesType(c.type))?.id ?? null;
      if (p.type === 'tiledlayout') {
        const fig = figureOf(st, p);
        if (fig && fig.props.CurrentAxes === id) fig.props.CurrentAxes = null;
      }
    }
  }
  st.objs.delete(id);
  if (st.gco === id) st.gco = null;
  if (o.type === 'figure') {
    st.dirty.delete(id);
    st.closed.push(id);
    const root = st.objs.get(0);
    root.children = root.children.filter((c) => c !== id);
    if (root.props.CurrentFigure === id) root.props.CurrentFigure = root.children.length ? root.children[0] : null;
  } else if (f && st.objs.has(f.id)) touch(st, f);
}

// ---------------------------------------------------------------- values ↔ JS

export function matOfRows(rows) {
  const m = rows.length, n = m ? rows[0].length : 0;
  const data = new Float64Array(m * n);
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) data[i + j * m] = rows[i][j];
  return { dims: [m, n], data };
}
export function rowsOfMat(M) {
  if (!M) return [];
  const [m, n] = M.dims;
  const out = [];
  for (let i = 0; i < m; i++) { const r = new Array(n); for (let j = 0; j < n; j++) r[j] = M.data[i + j * m]; out.push(r); }
  return out;
}
export function matOfValue(v) {
  if (v == null) return null;
  if (isTensor(v) || (v && v.sparse)) {
    const d = nums(v);
    const dims = v.dims.slice();
    if (dims.reduce((a, b) => a * b, 1) === 0) return { dims: [0, 0], data: new Float64Array(0) };
    let data = d;
    if (v.cls === 'uint8' || v.cls === 'uint16' || v.cls.startsWith('int')) data = Float64Array.from(d);
    const m = { dims, data: data === d ? Float64Array.from(d) : data };
    if (v.cls !== 'double' && v.cls !== 'single' && v.cls !== 'logical') m.cls = v.cls;
    if (v.cls === 'logical') m.cls = 'logical';
    return m;
  }
  throw gerr('notNumeric', 'Data must be numeric.');
}
export const vecMat = (arr) => ({ dims: [1, arr.length], data: Float64Array.from(arr) });
export const colMat = (arr) => ({ dims: [arr.length, 1], data: Float64Array.from(arr) });
export const matLen = (M) => (M ? M.data.length : 0);

export function matValue(M) {
  if (!M) return empty();
  const t = tensor(M.cls === 'uint8' ? 'uint8' : M.cls === 'logical' ? 'logical' : 'double', M.dims, M.data);
  return t;
}

/** Converts a Value for a property spec entry to the stored JS form. */
export function convertIn(entry, v, typeLabel = '') {
  const [name, kind, , extra] = entry;
  const bad = (msg) => gerr('invalidPropertyValue', `Invalid value for '${name}' property${typeLabel ? ` of ${typeLabel}` : ''}: ${msg}`);
  switch (kind) {
    case 'num': case 'int': {
      if (!isNum(v)) throw bad('value must be a numeric scalar.');
      const a = nums(v);
      if (a.length !== 1) throw bad('value must be a scalar.');
      return kind === 'int' ? Math.round(a[0]) : a[0];
    }
    case 'vec': {
      if (v != null && isTxt(v)) throw bad('value must be numeric.');
      return v == null ? [] : Array.from(nums(v));
    }
    case 'vec2': case 'vec3': case 'vec4': {
      const n = Number(kind[3]);
      if (!isNum(v)) throw bad(`value must be a 1-by-${n} numeric vector.`);
      const a = Array.from(nums(v));
      if (a.length !== n) throw bad(`value must be a 1-by-${n} numeric vector.`);
      if (n === 2 && /lim$/i.test(name) && !(a[0] < a[1]) && !(a[0] === -Infinity || a[1] === Infinity)) throw bad('limits must be increasing ([min max] with min < max).');
      return a;
    }
    case 'mat': {
      if (v == null || (v.dims && v.dims.includes(0))) return null;
      if (!(isNum(v) || (v && v.sparse))) throw bad('value must be numeric.');
      return matOfValue(v);
    }
    case 'color': return parseColor(v, extra || [], name);
    case 'enum': {
      if (isNum(v) && extra.includes('on') && extra.includes('off') && nums(v).length === 1) return nums(v)[0] ? 'on' : 'off';
      if (!isTxt(v)) throw bad(`value must be one of: ${extra.map((x) => `'${x}'`).join(', ')}.`);
      const s = txt(v);
      const hit = extra.find((c) => c.toLowerCase() === s.toLowerCase());
      if (hit == null) throw bad(`'${s}' is not one of: ${extra.map((x) => `'${x}'`).join(', ')}.`);
      return hit;
    }
    case 'bool': {
      if (isTxt(v)) {
        const s = txt(v).toLowerCase();
        if (s === 'on' || s === 'true') return true;
        if (s === 'off' || s === 'false') return false;
        throw bad("value must be 'on' or 'off'.");
      }
      if (isNum(v) && nums(v).length === 1) return nums(v)[0] !== 0;
      throw bad("value must be 'on' or 'off'.");
    }
    case 'text': {
      if (v == null) return '';
      if (isTxt(v)) return txt(v);
      if (isNum(v)) { const a = nums(v); return a.length === 1 ? fmtNum(a[0]) : Array.from(a, (x) => fmtNum(x)); }
      const list = txtList(v);
      return list.length === 1 && !isCell(v) ? list[0] : list;
    }
    case 'texts': {
      if (v == null) return [];
      if (isTxt(v)) { const s = txt(v); return s === '' ? [] : s.split('|').length > 1 && name !== 'String' ? s.split('|') : s.split('\n'); }
      return txtList(v);
    }
    case 'handle': {
      if (v == null || (v.dims && v.dims.includes(0))) return null;
      const ids = handleIds(v);
      if (ids.length !== 1) throw bad('value must be a single graphics handle.');
      return ids[0];
    }
    case 'cb': {
      if (v == null || (v.dims && v.dims.includes(0) && !isFuncHandle(v))) return null;
      if (isFuncHandle(v) || isTxt(v) || isCell(v)) return v;
      throw bad('value must be a function handle, a cell array {@fun, args...} or a character vector.');
    }
    case 'any': return v;
    case 'ro': throw gerr('readOnlyProperty', `The '${name}' property is read-only.`);
    default: return v;
  }
}

/** Stored JS form → Value. */
export function convertOut(ctx, entry, x) {
  const kind = entry[1];
  switch (kind) {
    case 'num': case 'int': return num(x);
    case 'vec': case 'vec2': case 'vec3': case 'vec4': return x == null ? empty() : tensor('double', [1, x.length], x);
    case 'mat': return matValue(x);
    case 'color': return Array.isArray(x) ? tensor('double', [1, 3], x) : str(String(x));
    case 'enum': return str(String(x));
    case 'bool': return str(x ? 'on' : 'off');
    case 'text': return Array.isArray(x) ? cell([x.length, 1], x.map((s) => str(s))) : str(x == null ? '' : String(x));
    case 'texts': return cell([x ? x.length : 0, 1], (x || []).map((s) => str(s)));
    case 'handle': return x == null ? handleValue(ctx, []) : handleValue(ctx, [x]);
    case 'cb': return x == null ? str('') : x;
    case 'any': return x == null ? empty() : x;
    case 'ro': return x == null ? empty() : jsToValue(ctx, x);
    default: return empty();
  }
}

function jsToValue(ctx, x) {
  if (typeof x === 'number') return num(x);
  if (typeof x === 'string') return str(x);
  if (typeof x === 'boolean') return str(x ? 'on' : 'off');
  if (Array.isArray(x)) return x.every((e) => typeof e === 'number') ? tensor('double', [1, x.length], x) : cell([x.length, 1], x.map((e) => jsToValue(ctx, e)));
  if (x && x.dims && x.data) return matValue(x);
  if (x && x.cls) return x;
  return empty();
}

// ---------------------------------------------------------------- handle values

export const CLASS_PREFIX = 'graphics.';
export function classNameOf(st, ids) {
  if (!ids.length) return CLASS_PREFIX + 'GraphicsPlaceholder';
  const types = new Set(ids.map((id) => st.objs.get(id)?.type || 'deleted'));
  if (types.size === 1) { const t = [...types][0]; return CLASS_PREFIX + (TYPE_CLASS[t] || 'Graphics'); }
  return CLASS_PREFIX + 'Graphics';
}
/** A handle Value for ids (column vector unless dims given). */
export function handleValue(ctx, ids, dims = null) {
  const st = G(ctx);
  const d = dims || (ids.length === 0 ? [0, 0] : ids.length === 1 ? [1, 1] : [ids.length, 1]);
  return object(classNameOf(st, ids), {}, { handle: true, dims: d, extra: { gh: ids.slice() } });
}
export const isHandleValue = (v) => isObject(v) && Array.isArray(v.gh);

/** Ids from a handle Value or numeric handles (no validity check). */
export function handleIds(v) {
  if (v == null) return [];
  if (isHandleValue(v)) return v.gh.slice();
  if (isNum(v)) return Array.from(nums(v));
  throw gerr('invalidHandle', 'Expected a graphics object handle.');
}
/** Valid object(s) from a handle argument; throws if any is invalid. */
export function objsOf(ctx, v, what = 'Handle') {
  const st = G(ctx);
  return handleIds(v).map((id) => mustObj(st, id, what));
}
export function isGraphicsArg(ctx, v) {
  if (isHandleValue(v)) return v.gh.length > 0 && v.gh.every((id) => G(ctx).objs.has(id));
  if (isNum(v) && !isTxt(v) && v.dims && v.dims[0] * v.dims[1] === 1) { const id = nums(v)[0]; return id !== 0 && G(ctx).objs.has(id); }
  return false;
}

// ---------------------------------------------------------------- get / set

const HOOKS = { get: Object.create(null), set: Object.create(null) };
/** Registers a getter hook: fn(ctx, obj) → Value (for computed props). */
export function onGet(types, name, fn) { for (const t of types) HOOKS.get[`${t}.${name}`] = fn; }
/** Registers a setter hook: fn(ctx, obj, jsValue, rawValue) — return true when handled. */
export function onSet(types, name, fn) { for (const t of types) HOOKS.set[`${t}.${name}`] = fn; }

export function getProp(ctx, o, name) {
  const entry = name === 'Type' ? ['Type', 'ro'] : name === 'Parent' || name === 'Children' ? [name, 'ro'] : findProp(o.type, name);
  if (!entry) throw gerr('unknownProperty', `Unrecognized property '${name}' for class '${TYPE_CLASS[o.type] || o.type}'.`);
  const pname = entry[0];
  if (pname === 'Type') return str(o.type === 'stair' ? 'stair' : o.type);
  if (pname === 'Parent') return o.parent == null ? handleValue(ctx, []) : handleValue(ctx, [o.parent]);
  if (pname === 'Children') {
    const st = G(ctx);
    const show = st.objs.get(0).props.ShowHiddenHandles;
    const ids = o.children.filter((c) => { const co = st.objs.get(c); return co && (show || co.props.HandleVisibility === 'on'); });
    return handleValue(ctx, ids, [ids.length, ids.length ? 1 : 0]);
  }
  const hook = HOOKS.get[`${o.type}.${pname}`];
  if (hook) { const r = hook(ctx, o); if (r !== undefined) return r; }
  return convertOut(ctx, entry, o.props[pname]);
}

export function canonicalName(o, name) {
  if (/^(type|parent|children)$/i.test(name)) return name[0].toUpperCase() + name.slice(1).toLowerCase();
  const e = findProp(o.type, name);
  return e ? e[0] : null;
}

/** Sets one property from a Value (validated). */
export function setProp(ctx, o, name, v) {
  if (/^type$/i.test(name) || /^children$/i.test(name) && false) throw gerr('readOnlyProperty', `The '${name}' property is read-only.`);
  if (/^parent$/i.test(name)) { reparent(ctx, o, v); return; }
  if (/^children$/i.test(name)) { reorderChildren(ctx, o, v); return; }
  const entry = findProp(o.type, name);
  if (!entry) throw gerr('unknownProperty', `Unrecognized property '${name}' for class '${TYPE_CLASS[o.type] || o.type}'.`);
  const pname = entry[0];
  const hook = HOOKS.set[`${o.type}.${pname}`];
  if (hook && hook.raw) { if (hook(ctx, o, null, v)) { o.userSet.add(pname); touch(G(ctx), o); return; } }
  const x = convertIn(entry, v, TYPE_CLASS[o.type]);
  if (hook && !hook.raw) { if (hook(ctx, o, x, v)) { o.userSet.add(pname); touch(G(ctx), o); return; } }
  o.props[pname] = x;
  o.userSet.add(pname);
  autoModes(o, pname);
  touch(G(ctx), o);
}

/** Sets a property from a JS value without validation (internal use). */
export function setRaw(ctx, o, name, x, user = false) {
  o.props[name] = x;
  if (user) o.userSet.add(name);
  touch(G(ctx), o);
}

const MODE_OF = {
  XLim: 'XLimMode', YLim: 'YLimMode', ZLim: 'ZLimMode', CLim: 'CLimMode', ALim: 'ALimMode', XTick: 'XTickMode', YTick: 'YTickMode', ZTick: 'ZTickMode',
  XTickLabel: 'XTickLabelMode', YTickLabel: 'YTickLabelMode', ZTickLabel: 'ZTickLabelMode', DataAspectRatio: 'DataAspectRatioMode', PlotBoxAspectRatio: 'PlotBoxAspectRatioMode',
  ThetaLim: 'ThetaLimMode', RLim: 'RLimMode', RTick: 'RTickMode', ThetaTick: 'ThetaTickMode', LevelList: 'LevelListMode', LevelStep: 'LevelStepMode',
  Limits: 'LimitsMode', Ticks: 'TicksMode', TickLabels: 'TickLabelsMode', ColorLimits: 'ColorLimitsMode', CData: 'CDataMode',
};
function autoModes(o, pname) {
  const m = MODE_OF[pname];
  if (m && m in o.props) o.props[m] = 'manual';
  if (pname === 'XTick' && o.props.XTickLabelMode === 'auto') { /* labels follow ticks */ }
  if (pname === 'Position' && isAxesType(o.type)) o.props.PositionConstraint = 'innerposition';
  if (pname === 'OuterPosition' && isAxesType(o.type)) o.props.PositionConstraint = 'outerposition';
}

function reparent(ctx, o, v) {
  const st = G(ctx);
  const ids = handleIds(v);
  if (ids.length !== 1) throw gerr('invalidParent', 'Parent must be a single graphics object.');
  const p = mustObj(st, ids[0], 'Parent');
  const old = st.objs.get(o.parent);
  if (old) { old.children = old.children.filter((c) => c !== o.id); touch(st, old); }
  o.parent = p.id;
  p.children.unshift(o.id);
  touch(st, o);
}
function reorderChildren(ctx, o, v) {
  const ids = handleIds(v);
  const set = new Set(o.children);
  if (ids.length !== o.children.filter((c) => G(ctx).objs.get(c)?.props.HandleVisibility === 'on').length || !ids.every((id) => set.has(id))) {
    throw gerr('invalidChildren', 'Children must be a permutation of the existing children.');
  }
  const hidden = o.children.filter((c) => !ids.includes(c));
  o.children = [...ids, ...hidden];
  touch(G(ctx), o);
}

/** Applies name/value pairs (Values) to objects. Throws on odd count / unknown names. */
export function setPairs(ctx, objs, args, start = 0) {
  if ((args.length - start) % 2 !== 0) throw gerr('nameValue', 'Property names and values must come in pairs.');
  for (let i = start; i < args.length; i += 2) {
    if (!isTxt(args[i])) throw gerr('nameValue', 'Property name must be a character vector or string.');
    const name = txt(args[i]);
    for (const o of objs) setProp(ctx, o, name, args[i + 1]);
  }
}
/** Splits trailing name/value pairs off: returns index where they start. */
export function pairsStart(args, from = 0, typeHint = null) {
  for (let i = from; i < args.length; i++) {
    if (isTxt(args[i]) && (args.length - i) % 2 === 0) {
      if (!typeHint) return i;
      try { if (findProp(typeHint, txt(args[i])) || /^parent$/i.test(txt(args[i]))) return i; } catch { return i; }
    }
  }
  return args.length;
}

/** All public properties of an object as a struct. */
export function getAll(ctx, o) {
  const names = ['Type', 'Parent', 'Children', ...propNames(o.type).filter((n) => !['Type', 'Parent', 'Children'].includes(n))];
  const rec = {};
  for (const n of names.sort((a, b) => a.localeCompare(b))) {
    try { rec[n] = getProp(ctx, o, n); } catch { /* skip */ }
  }
  return structOf(rec);
}

/** Possible values of settable properties (set(h) with no value). */
export function settableInfo(ctx, o) {
  const rec = {};
  for (const e of specOf(o.type).values()) {
    if (e[1] === 'ro') continue;
    rec[e[0]] = e[1] === 'enum' ? cell([e[3].length, 1], e[3].map((s) => str(s))) : cell([0, 0], []);
  }
  return structOf(rec);
}

// ---------------------------------------------------------------- callbacks

/** Runs a callback value (function handle, {fh, args...} cell or code text). */
export function invokeCallback(ctx, cb, src, evt) {
  if (cb == null) return;
  const st = G(ctx);
  const root = st.objs.get(0);
  const prev = root.props.CallbackObject;
  root.props.CallbackObject = src ? src.id : null;
  st.gco = src ? src.id : st.gco;
  try {
    const srcV = src ? handleValue(ctx, [src.id]) : empty();
    const evV = evt || empty();
    if (isFuncHandle(cb)) ctx.call(cb, [srcV, evV], 0);
    else if (isCell(cb) && cb.data.length && isFuncHandle(cb.data[0])) ctx.call(cb.data[0], [srcV, evV, ...cb.data.slice(1)], 0);
    else if (isTxt(cb)) { const code = txt(cb); if (code.trim()) { if (code.trim() === 'closereq') { if (src) destroy(ctx, src.id); } else ctx.evalString(code, 'base'); } }
    else if (isCell(cb) && cb.data.length && isTxt(cb.data[0])) ctx.call(txt(cb.data[0]), [srcV, evV, ...cb.data.slice(1)], 0);
  } finally {
    root.props.CallbackObject = prev;
  }
}

/** Event data struct. */
export function eventData(ctx, src, name, extra = {}) {
  const rec = { Source: handleValue(ctx, [src.id]), EventName: str(name) };
  for (const [k, v] of Object.entries(extra)) rec[k] = v;
  return structOf(rec);
}

// ---------------------------------------------------------------- display

export function displayHandle(ctx, v, name) {
  const st = G(ctx);
  const ids = v.gh;
  const lines = [];
  if (name) lines.push(`${name} = `);
  if (!ids.length) { lines.push('  0×0 empty GraphicsPlaceholder array.', ''); return lines.join('\n'); }
  if (ids.length > 1) {
    lines.push(`  ${v.dims.join('×')} graphics array:`, '');
    for (const id of ids) { const o = st.objs.get(id); lines.push(`    ${o ? TYPE_CLASS[o.type] || o.type : 'deleted handle'}`); }
    lines.push('');
    return lines.join('\n');
  }
  const o = st.objs.get(ids[0]);
  if (!o) { lines.push('  handle to deleted object', ''); return lines.join('\n'); }
  const cls = TYPE_CLASS[o.type] || o.type;
  const label = o.type === 'figure' ? `Figure (${o.id}${o.props.Name ? `: ${o.props.Name}` : ''})` : o.type === 'text' ? `Text (${shortText(o.props.String)})` : cls;
  lines.push(`  ${label} with properties:`, '');
  const show = DISPLAY_PROPS[o.type] || propNames(o.type).filter((n) => !COMMON.some((c) => c[0] === n)).slice(0, 8);
  const w = Math.max(...show.map((s) => s.length));
  for (const p of show) {
    let s;
    try { s = shortValue(getProp(ctx, o, p), p === 'Name' || p === 'String'); } catch { s = '?'; }
    lines.push(`${' '.repeat(4 + w - p.length)}${p}: ${s}`);
  }
  lines.push('', `  Use get to show all properties`, '');
  return lines.join('\n');
}
function shortText(s) { const t = Array.isArray(s) ? s.join(' ') : String(s || ''); return t.length > 30 ? `${t.slice(0, 27)}...` : t; }
export function shortValue(v, quoteText = true) {
  if (v == null) return '[]';
  if (v.cls === 'char') { const s = txt(v); return quoteText || true ? `'${s}'` : s; }
  if (isCell(v)) return `{${v.dims.join('×')} cell}`;
  if (isHandleValue(v)) return v.gh.length ? `[1×1 ${v.cls.replace(CLASS_PREFIX, '')}]` : '[0×0 GraphicsPlaceholder]';
  if (isFuncHandle(v)) return `@${v.name || v.text || 'function'}`;
  if (isTensor(v)) {
    const n = v.re.length;
    if (n === 0) return '[]';
    if (n <= 4 && v.dims[0] <= 1) return n === 1 ? fmtNum(v.re[0], 4) : `[${Array.from(v.re, (x) => fmtNum(x, 4)).join(' ')}]`;
    return `[${v.dims.join('×')} ${v.cls}]`;
  }
  if (v.cls === 'struct') return `[1×1 struct]`;
  return `[${v.cls}]`;
}

export { THEMED, struct };
