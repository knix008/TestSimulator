// Octave-compatibility additions to the graphics area: application data,
// listeners and linked properties, handle tests, toolkit queries, copying and
// saving object trees (copyobj, hdl2struct / struct2hdl, savefig / openfig),
// hggroup / hgtransform, the camera functions, colormap tools, figure
// helpers (movegui, dialog, orient, whitebg, waitfor, gtext ...).
// The extra plot functions are in octave-plots.js (merged below).
import { str, num, tensor, rowVec, cell, empty, bool, struct, structOf, isCell, isStruct, isTensor, isFuncHandle, isChar, toTensor } from '../value.js';
import { gerr, isTxt, txt, txtList, nums, isNum, lower, fmtNum, COLOR_LETTERS, parseColor } from './util.js';
import {
  G, create, destroy, mustObj, objsOf, handleValue, handleIds, isHandleValue, getProp, setProp, findProp, matOfRows, rowsOfMat,
  matOfValue, touch, isAxesType, objProp, convertIn, figureOf, axesOf, invokeCallback, canonicalName, propNames, onSet, onGet,
} from './model.js';
import { TYPES, COMMON } from './schema.js';
import { currentFigure, currentAxes, newFigure, makeCurrentFigure, makeCurrentAxes, allAxes } from './figax.js';
import { axesInfo } from './compute.js';
import { flush, resolvedColormap } from './scene.js';
import { builtins as manage } from './manage.js';
import { FONT_NAMES } from './uiextra.js';
import { writeMat5, readMat5 } from '../compat/mat5.js';
import * as plotsMod from './octave-plots.js';

const H = {};
const h = (names, en, ko, syntax) => { for (const n of names.split(' ')) H[n] = { en, ko, syntax: syntax.map((s) => s.replace(/\bNAME\b/g, n)) }; };
const DEG = Math.PI / 180;
const TOOLKIT = 'canvas';

// ---------------------------------------------------------------- small helpers

const internalOf = (o) => { if (!o.internal) o.internal = {}; return o.internal; };
function oneObj(ctx, v, what = 'Handle') {
  const objs = objsOf(ctx, v, what);
  if (objs.length !== 1) throw gerr('handle', `${what} must be a single graphics handle.`);
  return objs[0];
}
const logicalLike = (v, arr) => tensor('logical', v && v.dims ? v.dims.slice() : [1, arr.length], arr);
function idsOrNone(v) { try { return handleIds(v); } catch { return null; } }
const nameArg = (v, fn) => { if (!isTxt(v)) throw gerr(`${fn}:name`, `${fn}: NAME must be a character vector or string.`); return txt(v); };
function cloneJs(v) {
  if (Array.isArray(v)) return v.map(cloneJs);
  if (v && v.dims && v.data && !v.cls) return { ...v, dims: v.dims.slice(), data: v.data.slice() };
  return v;
}
/** The figure that holds an object (the object itself for figures). */
function figOf(ctx, o) { return o.type === 'figure' ? o : figureOf(G(ctx), o); }
function needFigureArg(ctx, args) {
  if (args.length && (isHandleValue(args[0]) || (isNum(args[0]) && !isTxt(args[0]) && args[0].dims[0] * args[0].dims[1] === 1))) {
    const o = oneObj(ctx, args[0]);
    return { fig: figOf(ctx, o), obj: o, args: args.slice(1) };
  }
  return { fig: currentFigure(ctx, true), obj: null, args };
}
function guiPing(ctx) {
  try { const r = ctx.host && ctx.host.request ? ctx.host.request({ type: 'graphics.ping' }) : null; return !!(r && r.gui); } catch { return false; }
}

// ---------------------------------------------------------------- application data

function appdata(o) { const i = internalOf(o); if (!i.appdata) i.appdata = new Map(); return i.appdata; }

h('getappdata', 'Application data stored on a graphics object (all of it as a struct without a name; [] when the name is not set).', '그래픽 객체에 저장된 응용 프로그램 데이터 (이름이 없으면 전체를 구조체로; 없는 이름은 []).', ['value = getappdata(h, name)', 'S = getappdata(h)']);
h('setappdata', 'Stores application data on graphics objects.', '그래픽 객체에 응용 프로그램 데이터를 저장합니다.', ['setappdata(h, name, value)', 'setappdata(h, name1, value1, name2, value2, ...)']);
h('isappdata', 'True when the application data name is set on the object.', '객체에 그 이름의 응용 프로그램 데이터가 있으면 참.', ['tf = isappdata(h, name)', 'tf = isappdata(h, {name1, name2})']);
h('rmappdata', 'Removes application data from graphics objects.', '그래픽 객체의 응용 프로그램 데이터를 지웁니다.', ['rmappdata(h, name)', 'rmappdata(h, name1, name2, ...)']);
h('guidata', 'Stores or reads the GUI data of the figure that holds an object.', '객체가 속한 그림의 GUI 데이터를 저장하거나 읽습니다.', ['data = guidata(h)', 'guidata(h, data)']);
h('guihandles', 'Struct of the handles of a figure\'s tagged objects (field = Tag).', '그림 안에서 Tag가 있는 객체들의 핸들 구조체 (필드 = Tag).', ['hs = guihandles', 'hs = guihandles(h)']);

const appBuiltins = {
  getappdata(args, nargout, ctx) {
    if (!args.length) throw gerr('getappdata:args', 'getappdata needs a handle.');
    const objs = objsOf(ctx, args[0]);
    if (args.length === 1) {
      if (objs.length !== 1) throw gerr('getappdata:handle', 'getappdata: H must be a single handle when NAME is not given.');
      const m = appdata(objs[0]);
      const rec = {};
      for (const [k, v] of m) if (/^[A-Za-z]\w*$/.test(k)) rec[k] = v;
      return structOf(rec);
    }
    const name = nameArg(args[1], 'getappdata');
    const vals = objs.map((o) => (appdata(o).has(name) ? appdata(o).get(name) : empty()));
    return vals.length === 1 ? vals[0] : cell([vals.length, 1], vals);
  },
  setappdata(args, nargout, ctx) {
    if (args.length < 3) throw gerr('setappdata:args', 'setappdata(h, name, value).');
    const objs = objsOf(ctx, args[0]);
    let pairs = [];
    if (args.length === 3 && isCell(args[1]) && isCell(args[2])) {
      const names = txtList(args[1]);
      if (names.length !== args[2].data.length) throw gerr('setappdata:args', 'setappdata: the NAME and VALUE cell arrays must have the same length.');
      pairs = names.map((n, i) => [n, args[2].data[i]]);
    } else {
      if ((args.length - 1) % 2 !== 0) throw gerr('setappdata:args', 'setappdata: NAME and VALUE must come in pairs.');
      for (let i = 1; i < args.length; i += 2) pairs.push([nameArg(args[i], 'setappdata'), args[i + 1]]);
    }
    for (const o of objs) for (const [n, v] of pairs) appdata(o).set(n, v);
    return [];
  },
  isappdata(args, nargout, ctx) {
    if (args.length !== 2) throw gerr('isappdata:args', 'isappdata(h, name).');
    const objs = objsOf(ctx, args[0]);
    if (isCell(args[1]) || (args[1].cls === 'string' && args[1].data.length > 1)) {
      const names = txtList(args[1]);
      return logicalLike(args[1], names.map((n) => (objs.length && appdata(objs[0]).has(n) ? 1 : 0)));
    }
    const name = nameArg(args[1], 'isappdata');
    const out = objs.map((o) => (appdata(o).has(name) ? 1 : 0));
    return out.length === 1 ? bool(out[0]) : tensor('logical', [out.length, 1], out);
  },
  rmappdata(args, nargout, ctx) {
    if (args.length < 2) throw gerr('rmappdata:args', 'rmappdata(h, name).');
    const objs = objsOf(ctx, args[0]);
    const names = args.slice(1).flatMap((v) => txtList(v));
    for (const o of objs) {
      const m = appdata(o);
      for (const n of names) {
        if (!m.has(n)) throw gerr('rmappdata:notPresent', `rmappdata: appdata '${n}' is not present.`);
        m.delete(n);
      }
    }
    return [];
  },
  guidata(args, nargout, ctx) {
    if (!args.length || args.length > 2) throw gerr('guidata:args', 'guidata(h) or guidata(h, data).');
    const o = oneObj(ctx, args[0]);
    const f = figOf(ctx, o);
    if (!f) throw gerr('guidata:noFigure', 'guidata: H is not inside a figure.');
    if (args.length === 1) return appdata(f).has('__guidata__') ? appdata(f).get('__guidata__') : empty();
    appdata(f).set('__guidata__', args[1]);
    return [];
  },
  guihandles(args, nargout, ctx) {
    const st = G(ctx);
    const f = args.length ? figOf(ctx, oneObj(ctx, args[0])) : currentFigure(ctx, true);
    if (!f) throw gerr('guihandles:noFigure', 'guihandles: H is not inside a figure.');
    const tags = new Map();
    const walk = (o) => {
      const t = o.props.Tag;
      if (typeof t === 'string' && /^[A-Za-z]\w*$/.test(t)) { if (!tags.has(t)) tags.set(t, []); tags.get(t).push(o.id); }
      for (const c of o.children) { const co = st.objs.get(c); if (co) walk(co); }
    };
    walk(f);
    const rec = {};
    for (const [t, ids] of tags) rec[t] = handleValue(ctx, ids);
    return structOf(rec);
  },
};

// ---------------------------------------------------------------- handle tests, toolkits

h('isaxes', 'True for axes handles.', '좌표축 핸들이면 참.', ['tf = isaxes(h)']);
h('isfigure', 'True for figure handles.', '그림 핸들이면 참.', ['tf = isfigure(h)']);
h('ishghandle', 'True for valid graphics handles (the root 0 included).', '유효한 그래픽 핸들이면 참 (루트 0 포함).', ['tf = ishghandle(h)']);
h('isguirunning', 'True when figure windows can be shown (the app GUI is attached).', '그림 창을 보여 줄 수 있으면 (앱 GUI가 연결되어 있으면) 참.', ['tf = isguirunning']);
h('have_window_system', 'True when a window system is available for figures.', '그림을 위한 창 시스템이 있으면 참.', ['tf = have_window_system']);
h('graphics_toolkit', `Name of the graphics toolkit ('${TOOLKIT}': the app's canvas / WebGL renderer); selecting another one is an error.`, `그래픽 툴킷 이름 ('${TOOLKIT}': 앱의 캔버스/WebGL 렌더러). 다른 툴킷은 고를 수 없습니다.`, ['name = graphics_toolkit', 'name = graphics_toolkit(hfig)', `graphics_toolkit('${TOOLKIT}')`]);
h('available_graphics_toolkits', 'Cell array of the available graphics toolkits.', '사용할 수 있는 그래픽 툴킷 목록 (셀형 배열).', ['c = available_graphics_toolkits']);
h('loaded_graphics_toolkits', 'Cell array of the loaded graphics toolkits.', '불러온 그래픽 툴킷 목록 (셀형 배열).', ['c = loaded_graphics_toolkits']);
h('listfonts', 'Font names that figure text can use.', '그림 글자에 쓸 수 있는 글꼴 이름.', ['fonts = listfonts', 'fonts = listfonts(h)']);

function typeTest(ctx, args, pred) {
  if (args.length !== 1) throw gerr('args', 'One input argument expected.');
  const v = args[0];
  const ids = isHandleValue(v) || (isNum(v) && !isChar(v)) ? idsOrNone(v) : null;
  if (!ids) return bool(false);
  const st = G(ctx);
  const out = ids.map((id) => { const o = st.objs.get(id); return o && id !== -1 && pred(o) ? 1 : 0; });
  return tensor('logical', v.dims ? v.dims.slice() : [1, out.length], out);
}

const testBuiltins = {
  isaxes(args, nargout, ctx) { return typeTest(ctx, args, (o) => isAxesType(o.type)); },
  isfigure(args, nargout, ctx) { return typeTest(ctx, args, (o) => o.type === 'figure'); },
  ishghandle(args, nargout, ctx) { G(ctx); return typeTest(ctx, args, () => true); },
  isguirunning(args, nargout, ctx) { return bool(guiPing(ctx)); },
  have_window_system(args, nargout, ctx) { return bool(guiPing(ctx)); },
  graphics_toolkit(args, nargout, ctx) {
    if (args.length && isTxt(args[0])) {
      const name = txt(args[0]);
      if (lower(name) !== TOOLKIT) throw gerr('graphics_toolkit:unavailable', `graphics_toolkit: ${name} toolkit is not available (only '${TOOLKIT}').`);
      return nargout ? str(TOOLKIT) : [];
    }
    if (args.length) oneObj(ctx, args[0]);
    return str(TOOLKIT);
  },
  available_graphics_toolkits() { return cell([1, 1], [str(TOOLKIT)]); },
  loaded_graphics_toolkits() { return cell([1, 1], [str(TOOLKIT)]); },
  listfonts(args, nargout, ctx) {
    const names = [...FONT_NAMES];
    if (args.length) { const o = oneObj(ctx, args[0]); if (typeof o.props.FontName === 'string' && !names.includes(o.props.FontName)) names.push(o.props.FontName); }
    names.sort((a, b) => a.localeCompare(b));
    return cell([names.length, 1], names.map((s) => str(s)));
  },
};

// ---------------------------------------------------------------- listeners, linked properties

h('addlistener', 'Runs a callback after a property of a graphics object is set (callback receives the handle and an empty event).', '그래픽 객체 속성이 설정된 뒤 콜백을 실행합니다 (콜백 인수: 핸들, 빈 이벤트).', ['addlistener(h, prop, fcn)', 'addlistener(h, prop, {fcn, arg1, ...})']);
h('dellistener', 'Removes property listeners (all of them without fcn).', '속성 리스너를 지웁니다 (fcn이 없으면 전부).', ['dellistener(h, prop)', 'dellistener(h, prop, fcn)']);
h('linkprop', 'Keeps properties of several graphics objects equal (setting one sets all); the values of the first object are copied to the others.', '여러 그래픽 객체의 속성을 같게 유지합니다 (하나를 설정하면 모두 설정). 첫 객체의 값이 나머지로 복사됩니다.', ['hlink = linkprop(h, prop)', 'hlink = linkprop(h, {prop1, prop2})']);

function propKey(o, name) {
  const pn = canonicalName(o, name);
  if (!pn) throw gerr('listener:property', `Unknown property '${name}' for ${o.type} objects.`);
  return pn;
}
const sameCallback = (a, b) => a === b || (isFuncHandle(a) && isFuncHandle(b) && (a.name || a.text || '') !== '' && (a.name || a.text) === (b.name || b.text)) || (isTxt(a) && isTxt(b) && txt(a) === txt(b));

const linkBuiltins = {
  addlistener(args, nargout, ctx) {
    if (args.length !== 3) throw gerr('addlistener:args', 'addlistener(h, prop, fcn).');
    const objs = objsOf(ctx, args[0]);
    const prop = nameArg(args[1], 'addlistener');
    const fcn = args[2];
    if (!(isFuncHandle(fcn) || isTxt(fcn) || (isCell(fcn) && fcn.data.length))) throw gerr('addlistener:fcn', 'addlistener: FCN must be a function handle, a cell array {fcn, args...} or a character vector.');
    for (const o of objs) {
      const key = propKey(o, prop).toLowerCase();
      const i = internalOf(o);
      if (!i.listeners) i.listeners = {};
      (i.listeners[key] = i.listeners[key] || []).push(fcn);
    }
    return [];
  },
  dellistener(args, nargout, ctx) {
    if (args.length < 2) throw gerr('dellistener:args', 'dellistener(h, prop, fcn).');
    const objs = objsOf(ctx, args[0]);
    const prop = nameArg(args[1], 'dellistener');
    for (const o of objs) {
      const key = propKey(o, prop).toLowerCase();
      const L = o.internal && o.internal.listeners && o.internal.listeners[key];
      if (!L) continue;
      if (args.length < 3) delete o.internal.listeners[key];
      else o.internal.listeners[key] = L.filter((f) => !sameCallback(f, args[2]));
    }
    return [];
  },
  linkprop(args, nargout, ctx) {
    if (args.length !== 2) throw gerr('linkprop:args', 'linkprop(h, props).');
    const objs = objsOf(ctx, args[0]);
    if (objs.length < 2) throw gerr('linkprop:handles', 'linkprop: H must contain at least two graphics handles.');
    const names = txtList(args[1]).map((n) => propKey(objs[0], n));
    const group = { ids: objs.map((o) => o.id), props: new Set(names.map(lower)) };
    for (const o of objs) { const i = internalOf(o); i.links = (i.links || []).concat([group]); }
    const st = G(ctx);
    for (const n of names) {
      const v = objs[0].props[n];
      for (const o of objs.slice(1)) if (n in o.props) { o.props[n] = cloneJs(v); o.userSet.add(n); if (objs[0].props[`${n}Mode`] !== undefined && o.props[`${n}Mode`] !== undefined) o.props[`${n}Mode`] = objs[0].props[`${n}Mode`]; touch(st, o); }
    }
    return structOf({ Targets: handleValue(ctx, group.ids), PropertyNames: cell([1, names.length], names.map((s) => str(s))) });
  },
};

// ---------------------------------------------------------------- copying, groups, saving

h('copyobj', 'Copies graphics objects (with their children) to a new parent.', '그래픽 객체를 (자식까지) 새 부모 아래로 복사합니다.', ['hnew = copyobj(h, parent)']);
h('hggroup', 'Creates a group object: its children are drawn, selected and deleted together.', '그룹 객체를 만듭니다: 자식들을 함께 그리고 지웁니다.', ['g = hggroup', 'g = hggroup(ax)', 'g = hggroup(___, Name, Value)']);
h('hgtransform', 'Creates a transform group: its 4×4 Matrix (rotation, scaling, translation) is applied to the line, surface, patch, scatter, text and quiver objects inside it.', '변환 그룹을 만듭니다: 4×4 Matrix(회전, 크기, 이동)가 안의 선·곡면·패치·산점·글자·화살표에 적용됩니다.', ['t = hgtransform', 't = hgtransform(ax)', "t = hgtransform(___, 'Matrix', M)"]);
h('hdl2struct', 'Converts a graphics object and its children to a struct (type, handle, properties, children, special).', '그래픽 객체와 자식을 구조체로 바꿉니다 (type, handle, properties, children, special).', ['s = hdl2struct(h)']);
h('struct2hdl', 'Recreates graphics objects from a struct made by hdl2struct.', 'hdl2struct로 만든 구조체에서 그래픽 객체를 다시 만듭니다.', ['h = struct2hdl(s)', 'h = struct2hdl(s, parent)']);
h('savefig', 'Saves a figure (or graphics objects) to a .fig file (a MAT-file holding the hdl2struct struct).', '그림(또는 그래픽 객체)을 .fig 파일(hdl2struct 구조체를 담은 MAT 파일)로 저장합니다.', ['savefig(filename)', 'savefig(h, filename)']);
h('hgsave', 'Saves a figure like savefig; without an extension the file gets .ofig.', 'savefig처럼 그림을 저장합니다. 확장자가 없으면 .ofig 가 붙습니다.', ['hgsave(filename)', 'hgsave(h, filename)']);
h('openfig', 'Opens a figure saved with savefig / hgsave; reuse brings back the figure the file opened before.', 'savefig / hgsave로 저장한 그림을 엽니다. reuse 는 그 파일로 연 그림이 있으면 그것을 다시 씁니다.', ['h = openfig(filename)', "h = openfig(filename, 'reuse')", "h = openfig(filename, 'new', 'invisible')"]);
h('hgload', 'Loads a saved figure; a struct of properties is set on it and their old values returned.', '저장한 그림을 불러옵니다. 속성 구조체를 주면 그 값을 설정하고 이전 값을 돌려줍니다.', ['h = hgload(filename)', '[h, old] = hgload(filename, props)']);

/** Deep copy of object o under parent pid. Returns the new object. */
function cloneObject(ctx, o, pid) {
  const st = G(ctx);
  if (o.type === 'root') throw gerr('copyobj:root', 'copyobj: the root object cannot be copied.');
  const props = {};
  for (const [k, v] of Object.entries(o.props)) {
    if (o.dyn && o.dyn.has(k.toLowerCase())) { props[k] = cloneJs(v); continue; }
    const e = k === 'Number' ? null : findProp(o.type, k);
    if (e && e[1] === 'handle') continue;
    if (k === 'Number' || k === 'CurrentAxes' || k === 'CurrentObject') continue;
    props[k] = cloneJs(v);
  }
  const n = o.type === 'figure' ? newFigure(ctx) : create(ctx, o.type, pid, {});
  Object.assign(n.props, props);
  n.userSet = new Set(o.userSet);
  if (o.dyn) n.dyn = new Map([...o.dyn].map(([k, e]) => [k, e.slice()]));
  const skip = new Set(['info', 'infoKey', 'listeners', 'links', 'appdata', 'link', 'sgtitle', 'layout', 'targets', 'axes']);
  for (const [k, v] of Object.entries(o.internal || {})) if (!skip.has(k)) n.internal[k] = cloneJs(v);
  if (o.internal && o.internal.appdata) n.internal.appdata = new Map(o.internal.appdata);
  // axes labels (made by create): copy their text properties
  if (isAxesType(o.type)) {
    for (const k of ['Title', 'Subtitle', 'XLabel', 'YLabel', 'ZLabel']) {
      const src = st.objs.get(o.props[k]), dst = st.objs.get(n.props[k]);
      if (src && dst) { for (const [pk, pv] of Object.entries(src.props)) dst.props[pk] = cloneJs(pv); dst.userSet = new Set(src.userSet); }
    }
  }
  for (const c of o.children.slice().reverse()) { const co = st.objs.get(c); if (co) cloneObject(ctx, co, n.id); }
  if (isAxesType(o.type)) {
    const lg = st.objs.get(o.props.Legend);
    if (lg) { const nl = manage.legend([handleValue(ctx, [n.id])], 1, ctx); const nlo = st.objs.get(handleIds(nl)[0]); if (nlo) for (const k of ['Location', 'Orientation', 'Box', 'FontSize', 'NumColumns', 'Visible']) nlo.props[k] = cloneJs(lg.props[k]); }
    const cb = st.objs.get(o.props.Colorbar);
    if (cb) { const nc = manage.colorbar([handleValue(ctx, [n.id])], 1, ctx); const nco = st.objs.get(handleIds(nc)[0]); if (nco) nco.props.Location = cb.props.Location; }
  }
  if (o.type === 'figure' && o.internal && o.internal.sgtitle != null && st.objs.has(o.internal.sgtitle)) {
    const t = st.objs.get(o.internal.sgtitle);
    manage.sgtitle([handleValue(ctx, [n.id]), str(Array.isArray(t.props.String) ? t.props.String.join('\n') : String(t.props.String))], 1, ctx);
  }
  touch(st, n);
  return n;
}

/** Struct (hdl2struct format) of one object. */
function toStruct(ctx, o) {
  const st = G(ctx);
  const rec = {};
  const spec = [...COMMON, ...(TYPES[o.type] || [])];
  for (const [name, kind] of spec) {
    if (kind === 'ro' || kind === 'handle' || name === 'Children' || name === 'Parent') continue;
    const v = o.props[name];
    if (kind === 'cb' && !(v != null && (isTxt(v)))) continue; // function handles are not kept
    if (kind === 'any' && (v == null || (v && v.cls == null && !Array.isArray(v)))) continue;
    if (!o.userSet.has(name) && kind !== 'mat' && !['Position', 'String', 'XLim', 'YLim', 'ZLim', 'View', 'Name', 'Color', 'Style'].includes(name)) continue;
    try { rec[name] = getProp(ctx, o, name); } catch { /* skip */ }
  }
  const kids = [];
  const special = [];
  if (isAxesType(o.type)) {
    ['Title', 'XLabel', 'YLabel', 'ZLabel', 'Subtitle'].forEach((k) => {
      const t = st.objs.get(o.props[k]);
      if (t && t.props.String !== '' && !(Array.isArray(t.props.String) && !t.props.String.length)) { const s = toStruct(ctx, t); const pr = s.data[0].properties; pr.data[0].LabelRole = str(k); if (!pr.fields.includes('LabelRole')) pr.fields.push('LabelRole'); kids.push(s); special.push(kids.length); }   // a real field: saved in .fig files too
    });
    const lg = st.objs.get(o.props.Legend);
    if (lg) rec.LegendLocation = str(lg.props.Location);
    const cb = st.objs.get(o.props.Colorbar);
    if (cb) rec.ColorbarLocation = str(cb.props.Location);
  }
  if (o.type === 'figure' && o.internal && o.internal.sgtitle != null && st.objs.has(o.internal.sgtitle)) {
    const t = st.objs.get(o.internal.sgtitle);
    rec.SgTitle = str(Array.isArray(t.props.String) ? t.props.String.join('\n') : String(t.props.String));
  }
  if (o.type === 'annotation' && o.internal.shape) rec.Shape = str(o.internal.shape);
  for (const c of o.children.slice().reverse()) { const co = st.objs.get(c); if (co && co.props.HandleVisibility !== 'off') kids.push(toStruct(ctx, co)); }
  const children = kids.length ? struct([kids.length, 1], ['handle', 'type', 'children', 'special', 'properties'], kids.map((k) => k.data[0])) : struct([0, 1], ['handle', 'type', 'children', 'special', 'properties']);
  return structOf({ handle: num(o.id), type: str(o.type), children, special: rowVec(special), properties: structOf(rec) });
}

const NOT_SETTABLE = new Set(['LabelRole', 'LegendLocation', 'ColorbarLocation', 'SgTitle', 'Shape']);
/** Rebuilds objects from a hdl2struct record (one struct element). */
function fromStruct(ctx, rec, parent) {
  const st = G(ctx);
  const type = txt(rec.type);
  if (!TYPES[type] || type === 'root') throw gerr('struct2hdl:type', `struct2hdl: unknown object type '${type}'.`);
  const P = isStruct(rec.properties) && rec.properties.data.length ? rec.properties.data[0] : {};
  let o;
  if (type === 'figure') o = newFigure(ctx);
  else if (type === 'annotation') { o = create(ctx, type, parent.id, {}); o.internal.shape = P.Shape ? txt(P.Shape) : 'line'; }
  else {
    if (!parent) throw gerr('struct2hdl:parent', 'struct2hdl: a parent is needed for this object.');
    o = create(ctx, type, parent.id, {});
    if (isAxesType(type)) { const f = figureOf(st, o); if (f) f.props.CurrentAxes = o.id; }
  }
  const setAll = (obj, props) => {
    for (const [k, v] of Object.entries(props)) {
      if (NOT_SETTABLE.has(k)) continue;
      try { setProp(ctx, obj, k, v); } catch { /* not settable here */ }
    }
  };
  setAll(o, P);
  const kids = isStruct(rec.children) ? rec.children.data : [];
  const special = new Set(Array.from(nums(rec.special || empty())));
  kids.forEach((k, i) => {
    if (special.has(i + 1) && isAxesType(type)) {
      const kp = isStruct(k.properties) && k.properties.data.length ? k.properties.data[0] : {};
      const role = kp.LabelRole ? txt(kp.LabelRole) : null;
      const t = role && st.objs.get(o.props[role]);
      if (t) setAll(t, kp);
      return;
    }
    fromStruct(ctx, k, o);
  });
  if (isAxesType(type)) {
    if (P.LegendLocation) manage.legend([handleValue(ctx, [o.id]), str('Location'), P.LegendLocation], 1, ctx);
    if (P.ColorbarLocation) manage.colorbar([handleValue(ctx, [o.id]), P.ColorbarLocation], 1, ctx);
  }
  if (type === 'figure' && P.SgTitle) manage.sgtitle([handleValue(ctx, [o.id]), P.SgTitle], 1, ctx);
  touch(st, o);
  return o;
}

function absPath(ctx, p) {
  const fs = ctx.fs;
  return /^([A-Za-z]:)?\//.test(p) ? p : `${fs.cwd().replace(/\/$/, '')}/${p}`;
}
const figFile = (name) => (/\.[A-Za-z0-9]+$/.test(name) ? name : `${name}.fig`);

function saveFigBuiltin(args, nargout, ctx) {
  let objs, file;
  if (args.length === 1 && isTxt(args[0])) { objs = [currentFigure(ctx, true)]; file = txt(args[0]); }
  else if (args.length >= 2) { objs = objsOf(ctx, args[0]); file = txt(args[1]); }
  else if (args.length === 0) { objs = [currentFigure(ctx, true)]; file = 'Untitled.fig'; }
  else throw gerr('savefig:args', 'savefig(h, filename).');
  const s = objs.length === 1 ? toStruct(ctx, objs[0]) : struct([objs.length, 1], ['handle', 'type', 'children', 'special', 'properties'], objs.map((o) => toStruct(ctx, o).data[0]));
  const bytes = writeMat5([{ name: 's_oct40', value: s }], { warn: () => {} });
  const path = absPath(ctx, figFile(file));
  ctx.fs.writeBytes(path, bytes);
  return [];
}
/** hgsave: as savefig, with Octave's default extension .ofig. */
function hgsaveBuiltin(args, nargout, ctx) {
  const a = args.slice();
  const i = a.length === 1 ? 0 : a.length >= 2 ? 1 : -1;
  if (i >= 0 && isTxt(a[i]) && !/\.[A-Za-z0-9]+$/.test(txt(a[i]))) a[i] = str(`${txt(a[i])}.ofig`);
  return saveFigBuiltin(a.length ? a : [str('Untitled.ofig')], nargout, ctx);
}

/**
 * openfig(file, 'new' | 'reuse', 'visible' | 'invisible'): 'reuse' brings back the figure this file
 * opened before when it is still there instead of loading another copy.
 */
function openFigBuiltin(args, nargout, ctx) {
  if (!args.length) throw gerr('openfig:args', 'openfig(filename).');
  const flags = args.slice(1).filter(isTxt).map((a) => lower(txt(a)));
  const name0 = figFile(txt(args[0]));
  const path = absPath(ctx, name0);
  const st = G(ctx);
  st.openedFigs = st.openedFigs || new Map();
  if (flags.includes('reuse')) {
    const id = st.openedFigs.get(path);
    const f = id != null && st.objs.get(id) || null;
    if (f) {
      if (flags.includes('invisible')) setProp(ctx, f, 'Visible', str('off')); else if (flags.includes('visible')) setProp(ctx, f, 'Visible', str('on'));
      makeCurrentFigure(ctx, f); flush(ctx);
      return handleValue(ctx, [f.id]);
    }
  }
  const h = loadFigFile(ctx, name0, path);
  const ids = handleIds(h);
  const fig = ids.map((id) => st.objs.get(id)).find((o) => o && o.type === 'figure');
  if (fig) {
    st.openedFigs.set(path, fig.id);
    if (flags.includes('invisible')) setProp(ctx, fig, 'Visible', str('off'));
    else if (flags.includes('visible')) setProp(ctx, fig, 'Visible', str('on'));
    flush(ctx);
  }
  return h;
}

/** [h, old] = hgload(file, props): loads, then sets the fields of the struct props on the loaded objects; old = their values before. */
function hgloadBuiltin(args, nargout, ctx) {
  if (!args.length) throw gerr('hgload:args', 'hgload(filename) or hgload(filename, props).');
  let name = txt(args[0]);
  if (!/\.[A-Za-z0-9]+$/.test(name)) name = ctx.fs.exists(absPath(ctx, `${name}.ofig`)) ? `${name}.ofig` : `${name}.fig`;
  const h = loadFigFile(ctx, name, absPath(ctx, name));
  if (args.length < 2) return nargout > 1 ? [h, structOf({})] : h;
  if (!isStruct(args[1])) throw gerr('hgload:props', 'hgload: the second argument is a struct of property values.');
  const props = args[1];
  const old = {};
  const objs = handleIds(h).map((id) => G(ctx).objs.get(id)).filter(Boolean);
  for (const f of props.fields) {
    const v = props.data[0][f];
    for (const o of objs) {
      if (!(f in old)) { try { old[f] = getProp(ctx, o, f); } catch { /* not a property of this object */ } }
      setProp(ctx, o, f, v);
    }
  }
  flush(ctx);
  return nargout > 1 ? [h, structOf(old)] : h;
}

function loadFigFile(ctx, name, path) {
  if (!ctx.fs.exists(path)) throw gerr('openfig:notFound', `openfig: file '${name}' not found.`);
  let vars;
  try { vars = readMat5(ctx.fs.readBytes(path)); } catch (e) { throw gerr('openfig:format', `openfig: '${name}' is not a figure file (${e.message}).`); }
  const v = vars.find((x) => x.name === 's_oct40') || vars.find((x) => isStruct(x.value) && x.value.fields.includes('type'));
  if (!v) throw gerr('openfig:format', `openfig: '${name}' does not contain a saved figure.`);
  const st = G(ctx);
  const made = v.value.data.map((rec) => fromStruct(ctx, rec, txt(rec.type) === 'figure' ? null : currentAxesOrFigure(ctx, txt(rec.type))));
  const f = made.find((o) => o.type === 'figure');
  if (f) { makeCurrentFigure(ctx, f); const ax = allAxes(st, f)[0]; if (ax) f.props.CurrentAxes = ax.id; }
  flush(ctx);
  return handleValue(ctx, made.map((o) => o.id));
}
function currentAxesOrFigure(ctx, type) {
  if (isAxesType(type) || ['uicontrol', 'uipanel', 'annotation', 'tiledlayout', 'heatmap'].includes(type)) return currentFigure(ctx, true);
  return currentAxes(ctx, true);
}

function groupBuiltin(type) {
  return (args, nargout, ctx) => {
    let a = args;
    let parent = null;
    if (a.length && !isTxt(a[0])) { parent = oneObj(ctx, a[0], 'Parent'); a = a.slice(1); }
    const pi = a.findIndex((v, i) => i % 2 === 0 && isTxt(v) && lower(txt(v)) === 'parent');
    if (pi >= 0) { parent = oneObj(ctx, a[pi + 1], 'Parent'); a = a.slice(0, pi).concat(a.slice(pi + 2)); }
    if (!parent) parent = currentAxes(ctx, true);
    if (!(isAxesType(parent.type) || parent.type === 'hggroup' || parent.type === 'hgtransform')) throw gerr(`${type}:parent`, `${type}: the parent must be axes, an hggroup or an hgtransform.`);
    const g = create(ctx, type, parent.id, {});
    if ((a.length) % 2 !== 0) throw gerr('nameValue', 'Property names and values must come in pairs.');
    for (let i = 0; i < a.length; i += 2) setProp(ctx, g, txt(a[i]), a[i + 1]);
    return handleValue(ctx, [g.id]);
  };
}
onSet(['hgtransform'], 'Matrix', (ctx, o, x) => {
  if (x == null) { o.props.Matrix = null; return true; }
  if (x.dims.length !== 2 || x.dims[0] !== 4 || x.dims[1] !== 4) throw gerr('hgtransform:matrix', "hgtransform: 'Matrix' must be a 4-by-4 matrix.");
  if (Array.from(x.data).some((v) => !Number.isFinite(v))) throw gerr('hgtransform:matrix', "hgtransform: 'Matrix' must be finite.");
  o.props.Matrix = x;
  return true;
});
onGet(['hgtransform'], 'Matrix', (ctx, o) => {
  if (o.props.Matrix) return tensor('double', [4, 4], Array.from(o.props.Matrix.data));
  return tensor('double', [4, 4], [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
});

const treeBuiltins = {
  copyobj(args, nargout, ctx) {
    if (args.length !== 2) throw gerr('copyobj:args', 'copyobj(h, parent).');
    const st = G(ctx);
    const objs = objsOf(ctx, args[0]);
    const parents = handleIds(args[1]).map((id) => (id === 0 ? st.objs.get(0) : mustObj(st, id, 'Parent')));
    if (parents.length !== 1 && parents.length !== objs.length) throw gerr('copyobj:parents', 'copyobj: PARENT must be one handle or one per object.');
    const out = objs.map((o, i) => {
      const p = parents[parents.length === 1 ? 0 : i];
      if (o.type === 'figure' && p.type !== 'root') throw gerr('copyobj:parent', 'copyobj: a figure can only be copied to the root (0 / groot).');
      if (o.type !== 'figure' && p.type === 'root') throw gerr('copyobj:parent', 'copyobj: only figures can be copied to the root.');
      if (isAxesType(o.type) && !['figure', 'uipanel', 'tiledlayout'].includes(p.type)) throw gerr('copyobj:parent', 'copyobj: axes must be copied to a figure or panel.');
      return cloneObject(ctx, o, p.id).id;
    });
    return handleValue(ctx, out, args[0].dims && args[0].dims.length === 2 && out.length > 1 ? args[0].dims.slice() : null);
  },
  hggroup: groupBuiltin('hggroup'),
  hgtransform: groupBuiltin('hgtransform'),
  hdl2struct(args, nargout, ctx) {
    if (args.length !== 1) throw gerr('hdl2struct:args', 'hdl2struct(h).');
    return toStruct(ctx, oneObj(ctx, args[0]));
  },
  struct2hdl(args, nargout, ctx) {
    if (!args.length || !isStruct(args[0]) || !args[0].fields.includes('type')) throw gerr('struct2hdl:args', 'struct2hdl(s): S must be a struct made by hdl2struct.');
    const st = G(ctx);
    let parent = null;
    if (args.length > 1) { const ids = handleIds(args[1]); parent = ids[0] === 0 ? null : mustObj(st, ids[0], 'Parent'); }
    const made = args[0].data.map((rec) => fromStruct(ctx, rec, parent || (txt(rec.type) === 'figure' ? null : currentAxesOrFigure(ctx, txt(rec.type)))));
    const f = made.length && made[0].type === 'figure' ? made[0] : null;
    if (f) { const ax = allAxes(st, f)[0]; if (ax) f.props.CurrentAxes = ax.id; makeCurrentFigure(ctx, f); }
    return handleValue(ctx, made.map((o) => o.id));
  },
  savefig: saveFigBuiltin,
  hgsave: hgsaveBuiltin,
  openfig: openFigBuiltin,
  hgload: hgloadBuiltin,
};

// ---------------------------------------------------------------- camera

h('campos', 'Camera position of the axes (set: the view turns so the camera looks from there at the target).', '좌표축의 카메라 위치 (설정하면 그 자리에서 대상을 보도록 시점이 바뀝니다).', ['p = campos', 'campos([x y z])', 'campos(ax, ___)', "campos('auto')", "m = campos('mode')"]);
h('camtarget', 'Point the camera looks at (default: the centre of the axes box).', '카메라가 바라보는 점 (기본: 좌표축 상자 중심).', ['t = camtarget', 'camtarget([x y z])', 'camtarget(ax, ___)', "camtarget('auto')", "m = camtarget('mode')"]);
h('camup', 'Camera up vector (rotates the picture around the viewing direction).', '카메라 위쪽 벡터 (보는 방향을 축으로 그림을 돌립니다).', ['u = camup', 'camup([x y z])', 'camup(ax, ___)', "camup('auto')", "m = camup('mode')"]);
h('camva', 'Camera view angle in degrees (smaller zooms in).', '카메라 시야각, 도 (작을수록 확대).', ['a = camva', 'camva(angle)', 'camva(ax, ___)', "camva('auto')", "m = camva('mode')"]);
h('camzoom', 'Zooms the camera by a factor (> 1 zooms in) by narrowing the view angle.', '시야각을 좁혀 카메라를 배율만큼 확대합니다 (> 1이면 확대).', ['camzoom(factor)', 'camzoom(ax, factor)']);
h('camorbit', 'Orbits the camera around the target: dtheta degrees around the up axis, dphi degrees up.', '카메라를 대상 둘레로 돌립니다: 위쪽 축 둘레로 dtheta도, 위로 dphi도.', ['camorbit(dtheta, dphi)', "camorbit(dtheta, dphi, 'data', [0 0 1])", 'camorbit(ax, ___)']);
h('camroll', 'Rolls the camera around the viewing direction by an angle in degrees.', '보는 방향을 축으로 카메라를 각도(도)만큼 굴립니다.', ['camroll(angle)', 'camroll(ax, angle)']);
h('camlookat', 'Points the camera at graphics objects so they fill the view (no argument: the whole axes).', '그래픽 객체가 화면을 채우도록 카메라를 맞춥니다 (인수가 없으면 좌표축 전체).', ['camlookat', 'camlookat(h)', 'camlookat(ax)']);

const DEFAULT_VA = 6.6086;
function camAxes(ctx, args) {
  if (args.length && (isHandleValue(args[0]) || (isNum(args[0]) && args.length > 1 && idsOrNone(args[0]) && G(ctx).objs.has(nums(args[0])[0]) && !Number.isInteger(nums(args[0])[0])))) {
    const o = oneObj(ctx, args[0], 'Axes');
    if (!isAxesType(o.type)) throw gerr('camera:axes', 'The handle must be an axes.');
    return { ax: o, args: args.slice(1) };
  }
  return { ax: currentAxes(ctx, true), args };
}
/** Camera geometry in data units: {T, P, U, va, scale}. */
function camera(ctx, ax) {
  const info = axesInfo(ctx, ax);
  const p = ax.props;
  const L = [info.XLim, info.YLim, info.ZLim];
  const dar = info.DataAspectRatio || [1, 1, 1];
  const center = L.map((l) => (l[0] + l[1]) / 2);
  const T = p.CameraTargetMode === 'manual' ? p.CameraTarget.slice() : center;
  const va = p.CameraViewAngleMode === 'manual' ? p.CameraViewAngle : DEFAULT_VA;
  // world (plot box) units: data / DataAspectRatio
  const half = L.map((l, k) => (l[1] - l[0]) / 2 / (dar[k] || 1));
  const R = Math.hypot(...half) || 1;
  const [az, el] = p.View;
  const dir = [Math.cos(el * DEG) * Math.sin(az * DEG), -Math.cos(el * DEG) * Math.cos(az * DEG), Math.sin(el * DEG)];
  const dist = R / Math.sin((DEFAULT_VA / 2) * DEG);
  const P = p.CameraPositionMode === 'manual' ? p.CameraPosition.slice() : T.map((t, k) => t + dir[k] * dist * (dar[k] || 1));
  const is2D = az === 0 && el === 90;
  const U = p.CameraUpVectorMode === 'manual' ? p.CameraUpVector.slice() : is2D ? [0, 1, 0] : [0, 0, 1];
  return { T, P, U, va, dar, dir, dist };
}
/** View [az el] for a camera looking from P at T (data units scaled by the aspect ratio). */
function viewFrom(P, T, dar) {
  const d = [0, 1, 2].map((k) => (P[k] - T[k]) / (dar[k] || 1));
  if (Math.hypot(...d) === 0) throw gerr('camera:position', 'The camera position must differ from the target.');
  return [Math.atan2(d[0], -d[1]) / DEG, Math.atan2(d[2], Math.hypot(d[0], d[1])) / DEG];
}
function camProp(prop) {
  const modeProp = `${prop}Mode`;
  return (args, nargout, ctx) => {
    const st = G(ctx);
    const { ax, args: a } = camAxes(ctx, args);
    const cam = camera(ctx, ax);
    const cur = prop === 'CameraPosition' ? cam.P : prop === 'CameraTarget' ? cam.T : prop === 'CameraUpVector' ? cam.U : cam.va;
    if (!a.length) return Array.isArray(cur) ? rowVec(cur) : num(cur);
    if (isTxt(a[0])) {
      const s = lower(txt(a[0]));
      if (s === 'mode') return str(ax.props[modeProp]);
      if (s === 'auto') { ax.props[modeProp] = 'auto'; if (prop === 'CameraPosition' || prop === 'CameraTarget') { /* view stays */ } touch(st, ax); return []; }
      if (s === 'manual') { ax.props[prop] = Array.isArray(cur) ? cur.slice() : cur; ax.props[modeProp] = 'manual'; touch(st, ax); return []; }
      throw gerr('camera:option', `Unknown option '${txt(a[0])}'.`);
    }
    const v = Array.from(nums(a[0]));
    if (prop === 'CameraViewAngle') {
      if (v.length !== 1 || !(v[0] > 0 && v[0] < 180)) throw gerr('camva:angle', 'camva: the view angle must be between 0 and 180 degrees.');
      ax.props.CameraViewAngle = v[0];
    } else {
      if (v.length !== 3 || v.some((x) => !Number.isFinite(x))) throw gerr('camera:vector', 'The value must be a finite 3-element vector.');
      if (prop === 'CameraPosition') { ax.props.View = viewFrom(v, cam.T, cam.dar); ax.props.CameraPosition = v; }
      else if (prop === 'CameraTarget') { ax.props.View = viewFrom(cam.P, v, cam.dar); ax.props.CameraTarget = v; if (ax.props.CameraPositionMode !== 'manual') { ax.props.CameraPosition = cam.P.slice(); ax.props.CameraPositionMode = 'manual'; } }
      else { if (v.every((x) => x === 0)) throw gerr('camup:zero', 'camup: the up vector must not be zero.'); ax.props.CameraUpVector = v; }
    }
    ax.props[modeProp] = 'manual';
    touch(st, ax);
    return [];
  };
}
function rotAbout(v, axis, ang) {
  const n = Math.hypot(...axis) || 1;
  const k = axis.map((x) => x / n);
  const c = Math.cos(ang), s = Math.sin(ang);
  const dot = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  const cr = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
  return [0, 1, 2].map((i) => v[i] * c + cr[i] * s + k[i] * dot * (1 - c));
}

const camBuiltins = {
  campos: camProp('CameraPosition'),
  camtarget: camProp('CameraTarget'),
  camup: camProp('CameraUpVector'),
  camva: camProp('CameraViewAngle'),
  camzoom(args, nargout, ctx) {
    const { ax, args: a } = camAxes(ctx, args);
    if (a.length !== 1) throw gerr('camzoom:args', 'camzoom(factor).');
    const f = Number(nums(a[0])[0]);
    if (!(f > 0)) throw gerr('camzoom:factor', 'camzoom: the zoom factor must be positive.');
    const va = camera(ctx, ax).va;
    ax.props.CameraViewAngle = 2 * Math.atan(Math.tan((va / 2) * DEG) / f) / DEG;
    ax.props.CameraViewAngleMode = 'manual';
    touch(G(ctx), ax);
    return [];
  },
  camorbit(args, nargout, ctx) {
    const { ax, args: a } = camAxes(ctx, args);
    if (a.length < 2) throw gerr('camorbit:args', 'camorbit(dtheta, dphi).');
    const dth = nums(a[0])[0], dph = nums(a[1])[0];
    const coord = a.length > 2 ? lower(txt(a[2])) : 'data';
    if (!['data', 'camera'].includes(coord)) throw gerr('camorbit:coordsys', "camorbit: COORDSYS must be 'data' or 'camera'.");
    const dirAxis = a.length > 3 ? Array.from(nums(a[3])) : [0, 0, 1];
    const cam = camera(ctx, ax);
    let v = ax.props.View.slice();
    if (coord === 'data' && dirAxis[0] === 0 && dirAxis[1] === 0) v = [v[0] + (dirAxis[2] >= 0 ? dth : -dth), Math.max(-90, Math.min(90, v[1] + dph))];
    else {
      // general axis: rotate the position about the target
      const rel = [0, 1, 2].map((k) => (cam.P[k] - cam.T[k]) / (cam.dar[k] || 1));
      let r = rotAbout(rel, coord === 'camera' ? cam.U : dirAxis, dth * DEG);
      const side = [r[1] * cam.U[2] - r[2] * cam.U[1], r[2] * cam.U[0] - r[0] * cam.U[2], r[0] * cam.U[1] - r[1] * cam.U[0]];
      r = rotAbout(r, side, -dph * DEG);
      v = viewFrom(r.map((x, k) => cam.T[k] + x * (cam.dar[k] || 1)), cam.T, cam.dar);
    }
    ax.props.View = v;
    ax.props.CameraPositionMode = 'auto';
    touch(G(ctx), ax);
    return [];
  },
  camroll(args, nargout, ctx) {
    const { ax, args: a } = camAxes(ctx, args);
    if (a.length !== 1) throw gerr('camroll:args', 'camroll(angle).');
    const ang = nums(a[0])[0];
    const cam = camera(ctx, ax);
    const viewAxis = [0, 1, 2].map((k) => (cam.T[k] - cam.P[k]) / (cam.dar[k] || 1));
    const upW = cam.U.map((x, k) => x / (cam.dar[k] || 1));
    const r = rotAbout(upW, viewAxis, ang * DEG).map((x, k) => x * (cam.dar[k] || 1));
    ax.props.CameraUpVector = r.map((x) => (Math.abs(x) < 1e-12 ? 0 : x));
    ax.props.CameraUpVectorMode = 'manual';
    touch(G(ctx), ax);
    return [];
  },
  camlookat(args, nargout, ctx) {
    const st = G(ctx);
    let objs;
    let ax;
    if (args.length) {
      objs = objsOf(ctx, args[0]);
      if (objs.length === 1 && isAxesType(objs[0].type)) { ax = objs[0]; objs = null; }
      else { ax = axesOf(st, objs[0]); if (!ax) throw gerr('camlookat:axes', 'camlookat: the objects must be in axes.'); }
    } else ax = currentAxes(ctx, true);
    const info = axesInfo(ctx, ax);
    const L = [info.XLim, info.YLim, info.ZLim];
    let lo = L.map((l) => l[0]), hi = L.map((l) => l[1]);
    if (objs) {
      lo = [Infinity, Infinity, Infinity]; hi = [-Infinity, -Infinity, -Infinity];
      const add = (k, arr) => { for (const x of arr) if (Number.isFinite(x)) { lo[k] = Math.min(lo[k], x); hi[k] = Math.max(hi[k], x); } };
      const visit = (o) => {
        const p = o.props;
        if (p.Vertices) { const [m, n] = p.Vertices.dims; for (let k = 0; k < Math.min(3, n); k++) add(k, Array.from(p.Vertices.data.slice(k * m, (k + 1) * m))); }
        else for (const [k, nm] of [[0, 'XData'], [1, 'YData'], [2, 'ZData']]) if (p[nm] && p[nm].data) add(k, Array.from(p[nm].data));
        if (o.type === 'text' && Array.isArray(p.Position)) p.Position.forEach((x, k) => add(k, [x]));
        for (const c of o.children) { const co = st.objs.get(c); if (co) visit(co); }
      };
      objs.forEach(visit);
      for (let k = 0; k < 3; k++) if (!(lo[k] <= hi[k])) { lo[k] = hi[k] = k === 2 ? 0 : (L[k][0] + L[k][1]) / 2; }
    }
    const dar = info.DataAspectRatio || [1, 1, 1];
    const T = lo.map((x, k) => (x + hi[k]) / 2);
    const rObj = Math.hypot(...lo.map((x, k) => (hi[k] - x) / 2 / (dar[k] || 1))) || 1e-9;
    const rBox = Math.hypot(...L.map((l, k) => (l[1] - l[0]) / 2 / (dar[k] || 1))) || 1;
    ax.props.CameraTarget = T; ax.props.CameraTargetMode = objs ? 'manual' : 'auto';
    const va = 2 * Math.atan(Math.tan((DEFAULT_VA / 2) * DEG) * Math.min(1, rObj / rBox)) / DEG;
    ax.props.CameraViewAngle = va; ax.props.CameraViewAngleMode = objs ? 'manual' : 'auto';
    ax.props.CameraPositionMode = 'auto';
    touch(st, ax);
    return [];
  },
};

// ---------------------------------------------------------------- colormap tools

h('brighten', 'Brightens (0 < beta < 1) or darkens (-1 < beta < 0) a colormap: map.^gamma with gamma = 1 - beta (beta > 0) or 1/(1 + beta).', '컬러맵을 밝게(0 < beta < 1) 또는 어둡게(-1 < beta < 0) 합니다: map.^gamma, gamma = 1 - beta (beta > 0) 또는 1/(1 + beta).', ['brighten(beta)', 'newmap = brighten(beta)', 'newmap = brighten(map, beta)', 'brighten(h, beta)']);
h('cmpermute', 'Reorders the colormap of an indexed image; the image keeps its look.', '색인 영상의 컬러맵 순서를 바꿉니다 (영상 모양은 그대로).', ['[Y, newmap] = cmpermute(X, map)', '[Y, newmap] = cmpermute(X, map, index)']);
h('cmunique', 'Indexed image with only the colours that are used (no duplicates) from an indexed, RGB or gray image.', '색인·RGB·회색 영상에서 쓰인 색만 (중복 없이) 가진 색인 영상을 만듭니다.', ['[Y, newmap] = cmunique(X, map)', '[Y, newmap] = cmunique(RGB)', '[Y, newmap] = cmunique(I)']);
h('contrast', 'Gray colormap that spreads the values of an image evenly (histogram equalisation).', '영상 값이 고르게 퍼지도록 하는 회색 컬러맵 (히스토그램 평활화).', ['cmap = contrast(x)', 'cmap = contrast(x, n)']);
h('ocean', 'Ocean colormap: black → deep blue → light cyan.', 'Ocean 컬러맵: 검정 → 짙은 파랑 → 밝은 청록.', ['map = ocean', 'map = ocean(n)']);
h('rainbow', 'Rainbow colormap: red → orange → yellow → green → blue → violet.', 'Rainbow 컬러맵: 빨강 → 주황 → 노랑 → 초록 → 파랑 → 보라.', ['map = rainbow', 'map = rainbow(n)']);
h('cubehelix', 'Cubehelix colormap: brightness rises steadily while the hue turns.', 'Cubehelix 컬러맵: 색상이 돌면서 밝기가 고르게 올라갑니다.', ['map = cubehelix', 'map = cubehelix(n)', 'map = cubehelix(n, start, rots, hue, gamma)']);
h('iscolormap', 'True for a valid colormap: a real n-by-3 double or single matrix with values in [0, 1].', '올바른 컬러맵이면 참: 값이 [0, 1]인 실수 n×3 double/single 행렬.', ['tf = iscolormap(cm)']);
h('rgbplot', 'Plots the red, green and blue parts of a colormap (profile) or the colormap itself (composite).', '컬러맵의 빨강·초록·파랑 성분(profile) 또는 컬러맵 자체(composite)를 그립니다.', ['rgbplot(map)', "rgbplot(map, 'composite')", 'h = rgbplot(___)']);
h('colstyle', 'Splits a line specification into line style, colour and marker.', '선 사양을 선 모양, 색, 표식으로 나눕니다.', ['[style, color, marker, msg] = colstyle(spec)']);
h('dither', 'Floyd-Steinberg error diffusion: an RGB image to an indexed image of a colormap, or a gray image to black and white.', 'Floyd-Steinberg 오차 확산: RGB 영상을 컬러맵 색인 영상으로, 또는 회색 영상을 흑백으로.', ['X = dither(RGB, map)', 'X = dither(RGB, map, Qm, Qe)', 'BW = dither(I)']);
h('spinmap', 'Animates the colormap of the current figure by rotating it (for t seconds, inc rows a step), then restores it.', '현재 그림의 컬러맵을 돌려 움직이게 합니다 (t초, 한 번에 inc행) — 끝나면 되돌립니다.', ['spinmap', 'spinmap(t)', 'spinmap(t, inc)', "spinmap('inf')"]);

function mapArg(v, fn) {
  const t = toTensor(v);
  if (t.dims.length !== 2 || t.dims[1] !== 3) throw gerr(`${fn}:map`, `${fn}: MAP must be an n-by-3 colormap.`);
  return rowsOfMat({ dims: t.dims, data: t.re });
}
const mapValue = (rows) => { const t = tensor('double', [rows.length, 3]); rows.forEach((r, i) => { t.re[i] = r[0]; t.re[i + rows.length] = r[1]; t.re[i + 2 * rows.length] = r[2]; }); return t; };

/** Index image Value (0-based uint8 when ≤ 256 colours, else 1-based double). */
function indexImage(dims, idx0, ncolors) {
  if (ncolors <= 256) return tensor('uint8', dims, idx0);
  return tensor('double', dims, idx0.map((x) => x + 1));
}
function idxOf(v) {
  const t = toTensor(v);
  const zero = t.cls !== 'double' && t.cls !== 'single' && t.cls !== 'logical';
  return { t, idx: Array.from(t.re, (x) => (zero ? x : x - 1)) };
}

function figureMapRows(ctx) { const f = currentFigure(ctx, true); return { f, rows: rowsOfMat(resolvedColormap(G(ctx), f)) }; }
function setFigureMap(ctx, f, rows) {
  const st = G(ctx);
  f.props.Colormap = matOfRows(rows);
  for (const ax of allAxes(st, f)) { ax.props.Colormap = null; touch(st, ax); }
  touch(st, f);
}

const cmapBuiltins = {
  brighten(args, nargout, ctx) {
    if (!args.length || args.length > 2) throw gerr('brighten:args', 'brighten(beta), brighten(map, beta) or brighten(h, beta).');
    const beta = nums(args[args.length - 1])[0];
    if (!(beta > -1 && beta < 1)) throw gerr('brighten:beta', 'brighten: BETA must be a scalar in the range (-1, 1).');
    const gamma = beta > 0 ? 1 - beta : 1 / (1 + beta);
    const apply = (rows) => rows.map((r) => r.map((x) => x ** gamma));
    if (args.length === 2 && !(isHandleValue(args[0]) || (isNum(args[0]) && args[0].re.length === 1))) return mapValue(apply(mapArg(args[0], 'brighten')));
    let f;
    if (args.length === 2) { const o = oneObj(ctx, args[0]); f = figOf(ctx, o); } else f = currentFigure(ctx, true);
    const rows = apply(rowsOfMat(resolvedColormap(G(ctx), f)));
    if (nargout > 0 && args.length === 1) return mapValue(rows);
    setFigureMap(ctx, f, rows);
    return [];
  },
  cmpermute(args, nargout, ctx) {
    if (args.length < 2) throw gerr('cmpermute:args', '[Y, newmap] = cmpermute(X, map, index).');
    const map = mapArg(args[1], 'cmpermute');
    const n = map.length;
    let index;
    if (args.length > 2) index = Array.from(nums(args[2]), (x) => x - 1);
    else { index = Array.from({ length: n }, (_, i) => i); for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [index[i], index[j]] = [index[j], index[i]]; } }
    if (index.length !== n || new Set(index).size !== n || index.some((k) => !(k >= 0 && k < n && Number.isInteger(k)))) throw gerr('cmpermute:index', 'cmpermute: INDEX must be a permutation of 1:rows(map).');
    const inv = new Array(n);
    index.forEach((k, i) => { inv[k] = i; });
    const { t, idx } = idxOf(args[0]);
    const Y = idx.map((k) => { if (!(k >= 0 && k < n)) throw gerr('cmpermute:range', 'cmpermute: X contains indices outside the colormap.'); return inv[k]; });
    const zero = t.cls !== 'double' && t.cls !== 'single' && t.cls !== 'logical';
    return [tensor(t.cls === 'logical' ? 'double' : t.cls, t.dims.slice(), zero ? Y : Y.map((k) => k + 1)), mapValue(index.map((k) => map[k]))];
  },
  cmunique(args, nargout, ctx) {
    if (!args.length) throw gerr('cmunique:args', '[Y, newmap] = cmunique(X, map) / cmunique(RGB) / cmunique(I).');
    const t = toTensor(args[0]);
    let colors, dims;
    const scale = t.cls === 'uint8' ? 255 : t.cls === 'uint16' ? 65535 : 1;
    if (args.length > 1) {
      const map = mapArg(args[1], 'cmunique');
      const { idx } = idxOf(args[0]);
      dims = t.dims.slice();
      colors = idx.map((k) => { if (!(k >= 0 && k < map.length)) throw gerr('cmunique:range', 'cmunique: X contains indices outside the colormap.'); return map[k]; });
    } else if (t.dims.length === 3 && t.dims[2] === 3) {
      dims = [t.dims[0], t.dims[1]];
      const np = dims[0] * dims[1];
      colors = Array.from({ length: np }, (_, i) => [t.re[i] / scale, t.re[i + np] / scale, t.re[i + 2 * np] / scale]);
    } else {
      dims = t.dims.slice();
      colors = Array.from(t.re, (x) => { const g = x / scale; return [g, g, g]; });
    }
    const keyOf = (c) => c.join(',');
    const uniq = new Map();
    for (const c of colors) if (!uniq.has(keyOf(c))) uniq.set(keyOf(c), c);
    const list = [...uniq.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    const pos = new Map(list.map((c, i) => [keyOf(c), i]));
    const Y = colors.map((c) => pos.get(keyOf(c)));
    return [indexImage(dims, Y, list.length), mapValue(list)];
  },
  contrast(args, nargout, ctx) {
    if (!args.length) throw gerr('contrast:args', 'cmap = contrast(x, n).');
    const x = Array.from(nums(args[0])).filter(Number.isFinite).sort((a, b) => a - b);
    let n = args.length > 1 ? Math.round(nums(args[1])[0]) : (() => { const f = currentFigure(ctx, false); return f ? resolvedColormap(G(ctx), f).dims[0] : 64; })();
    if (!(n >= 1)) throw gerr('contrast:n', 'contrast: N must be a positive integer.');
    n = Math.floor(n);
    if (!x.length) return mapValue(Array.from({ length: n }, () => [0, 0, 0]));
    const lo = x[0], hi = x[x.length - 1];
    const rows = [];
    for (let i = 0; i < n; i++) {
      const q = n === 1 ? 0.5 : i / (n - 1);
      const pos = q * (x.length - 1);
      const a = Math.floor(pos), b = Math.min(x.length - 1, a + 1);
      const v = x[a] + (x[b] - x[a]) * (pos - a);
      const g = hi > lo ? (v - lo) / (hi - lo) : q;
      rows.push([g, g, g]);
    }
    return mapValue(rows);
  },
  iscolormap(args) {
    if (args.length !== 1) throw gerr('iscolormap:args', 'tf = iscolormap(cm).');
    const v = args[0];
    if (!isTensor(v) || !(v.cls === 'double' || v.cls === 'single') || v.im || v.dims.length !== 2 || v.dims[1] !== 3) return bool(false);
    return bool(Array.from(v.re).every((x) => x >= 0 && x <= 1));
  },
  rgbplot(args, nargout, ctx) {
    if (!args.length) throw gerr('rgbplot:args', 'rgbplot(map, style).');
    const rows = mapArg(args[0], 'rgbplot');
    const style = args.length > 1 ? lower(txt(args[1])) : 'profile';
    const n = rows.length;
    if (style === 'composite') {
      const img = tensor('double', [1, n, 3]);
      rows.forEach((r, j) => { img.re[j] = r[0]; img.re[j + n] = r[1]; img.re[j + 2 * n] = r[2]; });
      const hh = ctx.call('image', [img], 1)[0];
      const ax = currentAxes(ctx, true);
      ax.props.YTick = []; ax.props.YTickMode = 'manual'; touch(G(ctx), ax);
      return nargout ? hh : [];
    }
    if (style !== 'profile') throw gerr('rgbplot:style', "rgbplot: STYLE must be 'profile' or 'composite'.");
    const x = rowVec(Array.from({ length: n }, (_, i) => i + 1));
    const col = (k) => rowVec(rows.map((r) => r[k]));
    const hh = ctx.call('plot', [x, col(0), str('r'), x, col(1), str('g'), x, col(2), str('b')], 1)[0];
    const ax = currentAxes(ctx, true);
    ax.props.XLim = [0.5, n + 0.5]; ax.props.XLimMode = 'manual';
    ax.props.YLim = [0, 1]; ax.props.YLimMode = 'manual';
    touch(G(ctx), ax);
    return nargout ? hh : [];
  },
  colstyle(args) {
    if (args.length < 1 || !isTxt(args[0])) throw gerr('colstyle:args', '[style, color, marker, msg] = colstyle(spec).');
    const s = txt(args[0]);
    let rest = s, style = '', color = '', marker = '', msg = '';
    const words = [['square', 's'], ['diamond', 'd'], ['pentagram', 'p'], ['hexagram', 'h']];
    for (const [w, m] of words) { const i = rest.indexOf(w); if (i >= 0) { marker = m; rest = rest.slice(0, i) + rest.slice(i + w.length); } }
    if (rest === 'none') { style = 'none'; rest = ''; }
    while (rest.length) {
      const two = rest.slice(0, 2);
      if (two === '--' || two === '-.') { style = two; rest = rest.slice(2); continue; }
      const ch = rest[0];
      if (ch === '-' || ch === ':') style = ch;
      else if (COLOR_LETTERS[ch]) color = ch;
      else if ('o+*.x^v><sdph_|'.includes(ch)) marker = ch;
      else { msg = `colstyle: unrecognized format character: '${ch}'`; break; }
      rest = rest.slice(1);
    }
    if (msg) { style = ''; color = ''; marker = ''; }
    return [str(style), str(color), str(marker), str(msg)];
  },
  dither(args, nargout, ctx) {
    if (!args.length) throw gerr('dither:args', 'X = dither(RGB, map) or BW = dither(I).');
    const t = toTensor(args[0]);
    const scale = t.cls === 'uint8' ? 255 : t.cls === 'uint16' ? 65535 : 1;
    const [m, n] = t.dims;
    if (args.length === 1) {
      if (t.dims.length > 2) throw gerr('dither:gray', 'dither: a single input must be a gray image.');
      const e = Array.from(t.re, (x) => x / scale);
      const out = new Array(m * n).fill(0);
      for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) {
        const k = i + j * m;
        const v = e[k] >= 0.5 ? 1 : 0;
        out[k] = v;
        const err = e[k] - v;
        if (j + 1 < n) e[k + m] += (err * 7) / 16;
        if (i + 1 < m) { if (j > 0) e[k + 1 - m] += (err * 3) / 16; e[k + 1] += (err * 5) / 16; if (j + 1 < n) e[k + 1 + m] += err / 16; }
      }
      return tensor('logical', [m, n], out);
    }
    if (t.dims.length !== 3 || t.dims[2] !== 3) throw gerr('dither:rgb', 'dither: RGB must be an m-by-n-by-3 image.');
    const map = mapArg(args[1], 'dither');
    const np = m * n;
    const e = [0, 1, 2].map((c) => Array.from(t.re.subarray(c * np, (c + 1) * np), (x) => x / scale));
    const idx = new Array(np).fill(0);
    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) {
      const k = i + j * m;
      const px = [e[0][k], e[1][k], e[2][k]];
      let best = 0, bd = Infinity;
      for (let q = 0; q < map.length; q++) { const r = map[q]; const d = (r[0] - px[0]) ** 2 + (r[1] - px[1]) ** 2 + (r[2] - px[2]) ** 2; if (d < bd) { bd = d; best = q; } }
      idx[k] = best;
      for (let c = 0; c < 3; c++) {
        const err = px[c] - map[best][c];
        if (j + 1 < n) e[c][k + m] += (err * 7) / 16;
        if (i + 1 < m) { if (j > 0) e[c][k + 1 - m] += (err * 3) / 16; e[c][k + 1] += (err * 5) / 16; if (j + 1 < n) e[c][k + 1 + m] += err / 16; }
      }
    }
    return indexImage([m, n], idx, map.length);
  },
  spinmap(args, nargout, ctx) {
    let t = 5, inc = 2;
    if (args.length && isTxt(args[0])) { if (lower(txt(args[0])) === 'inf') t = Infinity; else throw gerr('spinmap:args', "spinmap(t, inc) or spinmap('inf')."); }
    else if (args.length) t = nums(args[0])[0];
    if (args.length > 1) inc = Math.round(nums(args[1])[0]);
    const { f, rows } = figureMapRows(ctx);
    const start = Date.now();
    let cur = rows.slice();
    const n = rows.length;
    try {
      do {
        const s = ((inc % n) + n) % n;
        cur = cur.slice(s).concat(cur.slice(0, s));
        setFigureMap(ctx, f, cur);
        ctx.call('pause', [num(0.05)], 0);
      } while ((Date.now() - start) / 1000 < t);
    } finally {
      if (G(ctx).objs.has(f.id)) { setFigureMap(ctx, f, rows); flush(ctx); }
    }
    return [];
  },
};

// ---------------------------------------------------------------- figure helpers

h('closereq', 'Default close request function: deletes the figure whose callback runs (else the current figure).', '기본 닫기 요청 함수: 콜백이 실행 중인 그림(없으면 현재 그림)을 지웁니다.', ['closereq']);
h('dialog', 'Creates a dialog figure (modal window style, no menu bar or tool bar).', '대화상자 그림을 만듭니다 (모달 창, 메뉴·도구 막대 없음).', ['h = dialog', 'h = dialog(Name, Value, ...)']);
h('movegui', "Moves a figure to a place on the screen ('center', 'north', 'northeast', ..., 'onscreen') or by [x y] pixels from the screen edges.", "그림을 화면의 한 곳('center', 'north', 'northeast', ..., 'onscreen')이나 화면 가장자리에서 [x y] 픽셀 위치로 옮깁니다.", ['movegui', 'movegui(position)', 'movegui(h, position)']);
h('findfigs', 'Moves figures that are (partly) off the screen back onto it.', '화면 밖으로 (일부) 나간 그림을 화면 안으로 옮깁니다.', ['findfigs']);
h('getpixelposition', 'Position [left bottom width height] of an object in pixels (relative to its parent, or to the figure when recursive).', '객체의 픽셀 위치 [왼쪽 아래 너비 높이] (부모 기준, recursive이면 그림 기준).', ['pos = getpixelposition(h)', 'pos = getpixelposition(h, recursive)']);
h('orient', "Paper orientation of a figure for printing ('portrait', 'landscape' or 'tall').", "인쇄할 때 그림의 용지 방향 ('portrait', 'landscape', 'tall').", ['orient', "orient('landscape')", 'orient(fig, orientation)', 'o = orient(fig)']);
h('whitebg', 'Sets the figure and axes background colour (contrasting axis colours); without a colour it switches between white and black.', '그림과 좌표축 배경색을 바꿉니다 (축 색은 대비색). 색이 없으면 흰색과 검정을 바꿉니다.', ['whitebg', 'whitebg(color)', 'whitebg(fig, color)', "whitebg(fig, 'none')"]);
h('waitfor', 'Blocks until an object is deleted (or its property changes / has a value; the figure banner resumes too).', '객체가 지워질 때까지 (또는 속성이 바뀌거나 값이 될 때까지; 그림 배너로도 계속) 기다립니다.', ['waitfor(h)', 'waitfor(h, prop)', 'waitfor(h, prop, value)', "waitfor(___, 'timeout', t)"]);
h('gtext', 'Places text where the mouse is clicked in the current figure (one click per string).', '현재 그림에서 마우스로 누른 곳에 글자를 놓습니다 (문자열마다 한 번).', ['gtext(s)', 'gtext({s1, s2})', 'h = gtext(s, Name, Value)']);
h('printd', 'Writes the displayed form of a value to a file: text for .txt, otherwise a picture of the text (needs the GUI).', '값의 표시 형태를 파일로 씁니다: .txt는 글자, 그 밖은 글자 그림 (GUI 필요).', ['printd(obj, filename)', 'out = printd(obj, filename)']);
h('refreshdata', 'Re-evaluates the XDataSource / YDataSource / ZDataSource expressions of plot objects and updates their data.', '플롯 객체의 XDataSource / YDataSource / ZDataSource 식을 다시 계산해 데이터를 바꿉니다.', ['refreshdata', 'refreshdata(h)', "refreshdata(h, 'caller')"]);
h('hidden', 'Hidden-line removal of mesh plots: on fills mesh faces with the axes colour, off makes them see-through.', '메시 플롯의 숨은선 제거: on은 면을 좌표축 색으로 칠하고, off는 투명하게 합니다.', ['hidden', 'hidden on', 'hidden off', 'hidden(ax, ___)', 'state = hidden']);
h('rticklabels', 'Sets or gets the r-axis tick labels of polar axes.', '극좌표축 r축 눈금 이름표를 설정하거나 읽습니다.', ['rticklabels(labels)', "rticklabels('auto')", 'c = rticklabels', 'rticklabels(pax, ___)']);
h('thetaticklabels', 'Sets or gets the theta-axis tick labels of polar axes.', '극좌표축 theta축 눈금 이름표를 설정하거나 읽습니다.', ['thetaticklabels(labels)', "thetaticklabels('auto')", 'c = thetaticklabels', 'thetaticklabels(pax, ___)']);

const PLACES = ['center', 'north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest', 'onscreen'];
function moveFigure(ctx, f, where) {
  const root = G(ctx).objs.get(0);
  const [, , SW, SH] = root.props.ScreenSize;
  let [l, b, w, hgt] = f.props.Position;
  const margin = 30;
  if (Array.isArray(where)) {
    const [x, y] = where;
    l = x >= 0 ? x : SW - w + x;
    b = y >= 0 ? y : SH - hgt + y;
  } else {
    const cx = (SW - w) / 2, cy = (SH - hgt) / 2;
    switch (where) {
      case 'center': l = cx; b = cy; break;
      case 'north': l = cx; b = SH - hgt - margin; break;
      case 'south': l = cx; b = margin; break;
      case 'east': l = SW - w - margin; b = cy; break;
      case 'west': l = margin; b = cy; break;
      case 'northeast': l = SW - w - margin; b = SH - hgt - margin; break;
      case 'northwest': l = margin; b = SH - hgt - margin; break;
      case 'southeast': l = SW - w - margin; b = margin; break;
      case 'southwest': l = margin; b = margin; break;
      default: // onscreen
        l = Math.min(Math.max(l, 1), Math.max(1, SW - w)); b = Math.min(Math.max(b, 1), Math.max(1, SH - hgt - margin)); break;
    }
  }
  f.props.Position = [Math.round(l), Math.round(b), w, hgt];
  touch(G(ctx), f);
}
function polarTickLabels(prop) {
  return (args, nargout, ctx) => {
    let a = args;
    let ax;
    if (a.length && isHandleValue(a[0])) { ax = oneObj(ctx, a[0], 'Axes'); a = a.slice(1); } else ax = currentAxes(ctx, true);
    if (ax.type !== 'polaraxes') throw gerr(`${prop}:axes`, `${prop === 'RTickLabel' ? 'rticklabels' : 'thetaticklabels'}: the axes must be polar axes.`);
    if (!a.length) { const L = axesInfo(ctx, ax)[prop] || []; return cell([L.length, 1], L.map((s) => str(String(s)))); }
    if (isTxt(a[0]) && ['auto', 'mode', 'manual'].includes(lower(txt(a[0])))) {
      const s = lower(txt(a[0]));
      if (s === 'mode') return str(ax.props[prop].length ? 'manual' : 'auto');
      ax.props[prop] = s === 'auto' ? [] : (axesInfo(ctx, ax)[prop] || []).slice();
      touch(G(ctx), ax);
      return [];
    }
    setProp(ctx, ax, prop, a[0]);
    return [];
  };
}
function pixelPos(ctx, o, recursive) {
  const st = G(ctx);
  if (o.type === 'figure') return o.props.Position.slice();
  if (o.type === 'root') return o.props.ScreenSize.slice();
  const parent = st.objs.get(o.parent);
  const ppx = parent ? pixelPos(ctx, parent, recursive) : [0, 0, 1, 1];
  let p = (isAxesType(o.type) ? o.props.Position : o.props.Position || [0, 0, 1, 1]).slice();
  const units = o.props.Units;
  const normalized = units === 'normalized' || (units === undefined && isAxesType(o.type));
  if (normalized) p = [p[0] * ppx[2], p[1] * ppx[3], p[2] * ppx[2], p[3] * ppx[3]];
  if (recursive && parent && parent.type !== 'figure') { p[0] += ppx[0]; p[1] += ppx[1]; }
  return p;
}
function isMeshSurface(o, axColor) {
  if (o.type !== 'surface') return false;
  const fc = o.props.FaceColor, ec = o.props.EdgeColor;
  if (ec === 'none') return false;
  if (fc === 'none') return true;
  return Array.isArray(fc) && (o.internal.hiddenMesh || (fc.every((x) => x === 1)) || (Array.isArray(axColor) && fc.every((x, i) => x === axColor[i])));
}

const figBuiltins = {
  closereq(args, nargout, ctx) {
    const st = G(ctx);
    const cbo = st.objs.get(st.objs.get(0).props.CallbackObject);
    const f = cbo ? figOf(ctx, cbo) : currentFigure(ctx, false);
    if (f) { destroy(ctx, f.id); flush(ctx); }
    return [];
  },
  dialog(args, nargout, ctx) {
    const f = newFigure(ctx);
    Object.assign(f.props, { WindowStyle: 'modal', MenuBar: 'none', ToolBar: 'none', NumberTitle: false, Resize: false, Name: 'Dialog', Position: [f.props.Position[0], f.props.Position[1], 300, 200] });
    if (args.length % 2) throw gerr('nameValue', 'Property names and values must come in pairs.');
    for (let i = 0; i < args.length; i += 2) setProp(ctx, f, txt(args[i]), args[i + 1]);
    makeCurrentFigure(ctx, f);
    flush(ctx);
    return handleValue(ctx, [f.id]);
  },
  movegui(args, nargout, ctx) {
    let a = args, f;
    if (a.length && !isTxt(a[0]) && !(isNum(a[0]) && a[0].re.length === 2)) { f = figOf(ctx, oneObj(ctx, a[0])); a = a.slice(1); } else f = currentFigure(ctx, true);
    let where = 'onscreen';
    if (a.length) {
      if (isTxt(a[0])) { where = lower(txt(a[0])); if (!PLACES.includes(where)) throw gerr('movegui:position', `movegui: unknown position '${txt(a[0])}'.`); }
      else { const v = Array.from(nums(a[0])); if (v.length !== 2) throw gerr('movegui:position', 'movegui: POSITION must be a name or a 2-element vector.'); where = v; }
    }
    moveFigure(ctx, f, where);
    return [];
  },
  findfigs(args, nargout, ctx) {
    const st = G(ctx);
    for (const id of st.objs.get(0).children.slice()) { const f = st.objs.get(id); if (f && f.type === 'figure') moveFigure(ctx, f, 'onscreen'); }
    return [];
  },
  getpixelposition(args, nargout, ctx) {
    if (!args.length) throw gerr('getpixelposition:args', 'pos = getpixelposition(h).');
    const o = oneObj(ctx, args[0]);
    const rec = args.length > 1 ? !!nums(args[1])[0] : false;
    return rowVec(pixelPos(ctx, o, rec));
  },
  orient(args, nargout, ctx) {
    let a = args, f;
    if (a.length && !isTxt(a[0])) { f = figOf(ctx, oneObj(ctx, a[0])); a = a.slice(1); } else f = currentFigure(ctx, true);
    if (!a.length) return str(f.internal.tall ? 'tall' : f.props.PaperOrientation);
    const o = lower(txt(a[0]));
    if (!['portrait', 'landscape', 'tall'].includes(o)) throw gerr('orient:orientation', "orient: ORIENTATION must be 'portrait', 'landscape' or 'tall'.");
    const [w, hgt] = f.props.PaperSize;
    const lo = Math.min(w, hgt), hi = Math.max(w, hgt);
    f.internal.tall = o === 'tall';
    if (o === 'landscape') { f.props.PaperOrientation = 'landscape'; f.props.PaperSize = [hi, lo]; f.props.PaperPosition = [0.25, 0.25, hi - 0.5, lo - 0.5]; }
    else { f.props.PaperOrientation = 'portrait'; f.props.PaperSize = [lo, hi]; f.props.PaperPosition = o === 'tall' ? [0.25, 0.25, lo - 0.5, hi - 0.5] : [0.25, 2.5, lo - 0.5, Math.min(hi - 5, (lo - 0.5) * 0.75)]; }
    f.props.PaperPositionMode = 'manual';
    touch(G(ctx), f);
    return [];
  },
  whitebg(args, nargout, ctx) {
    const st = G(ctx);
    let a = args, figs;
    if (a.length && (isHandleValue(a[0]) || (isNum(a[0]) && a[0].re.length !== 3 && !isTxt(a[0])))) { figs = objsOf(ctx, a[0]).map((o) => figOf(ctx, o)); a = a.slice(1); }
    else figs = [currentFigure(ctx, true)];
    for (const f of figs) {
      let bg;
      const axs = allAxes(st, f);
      if (a.length) {
        if (isTxt(a[0]) && lower(txt(a[0])) === 'none') bg = null;
        else bg = manageColor(a[0]);
      } else {
        const cur = axs.length && Array.isArray(axs[0].props.Color) ? axs[0].props.Color : (Array.isArray(f.props.Color) ? f.props.Color : [1, 1, 1]);
        const dark = (cur[0] + cur[1] + cur[2]) / 3 < 0.5;
        bg = dark ? [1, 1, 1] : [0, 0, 0];
      }
      if (bg == null) { // 'none': back to the defaults (theme colours)
        for (const o of [f, ...axs]) for (const k of ['Color', 'XColor', 'YColor', 'ZColor', 'GridColor']) o.userSet.delete(k);
        f.props.Color = [0.94, 0.94, 0.94];
        for (const ax of axs) { ax.props.Color = [1, 1, 1]; for (const k of ['XColor', 'YColor', 'ZColor', 'GridColor']) ax.props[k] = [0.15, 0.15, 0.15]; touch(st, ax); }
        touch(st, f);
        continue;
      }
      const fg = (bg[0] * 0.3 + bg[1] * 0.59 + bg[2] * 0.11) < 0.5 ? [1, 1, 1] : [0, 0, 0];
      f.props.Color = bg.slice(); f.userSet.add('Color');
      for (const ax of axs) {
        ax.props.Color = bg.slice();
        for (const k of ['XColor', 'YColor', 'ZColor', 'GridColor']) { ax.props[k] = fg.slice(); ax.userSet.add(k); }
        ax.userSet.add('Color');
        for (const k of ['Title', 'Subtitle', 'XLabel', 'YLabel', 'ZLabel']) { const t = st.objs.get(ax.props[k]); if (t) { t.props.Color = fg.slice(); t.userSet.add('Color'); touch(st, t); } }
        for (const c of ax.children) { const o = st.objs.get(c); if (o && o.type === 'text' && !o.userSet.has('Color')) { o.props.Color = fg.slice(); touch(st, o); } }
        touch(st, ax);
      }
      touch(st, f);
    }
    return [];
  },
  waitfor(args, nargout, ctx) {
    if (!args.length) throw gerr('waitfor:args', 'waitfor(h).');
    const st = G(ctx);
    let a = args.slice(1);
    let timeout = null;
    const ti = a.findIndex((v) => isTxt(v) && lower(txt(v)) === 'timeout');
    if (ti >= 0) { timeout = nums(a[ti + 1])[0]; a = a.slice(0, ti).concat(a.slice(ti + 2)); }
    const ids = idsOrNone(args[0]) || [];
    if (!ids.length || !st.objs.has(ids[0])) return [];
    const o = st.objs.get(ids[0]);
    if (a.length >= 2) {
      const cur = getProp(ctx, o, txt(a[0]));
      const want = a[1];
      const same = isTxt(cur) && isTxt(want) ? txt(cur) === txt(want) : isTensor(cur) && isNum(want) && cur.re.length === want.re.length && Array.from(cur.re).every((x, i) => x === want.re[i]);
      if (same) return [];
    } else if (a.length === 1) getProp(ctx, o, txt(a[0])); // validates the name
    const f = figOf(ctx, o);
    if (!f) return [];
    flush(ctx);
    ctx.host.request({ type: 'graphics.uiwait', figure: f.id, timeout });
    return [];
  },
  gtext(args, nargout, ctx) {
    if (!args.length) throw gerr('gtext:args', 'gtext(s).');
    const strs = isCell(args[0]) || (args[0].cls === 'string' && args[0].data.length > 1) ? txtList(args[0]) : [txt(args[0])];
    const rest = args.slice(1);
    const f = currentFigure(ctx, true);
    const ax = currentAxes(ctx, true, f);
    const made = [];
    for (const s of strs) {
      flush(ctx);
      const r = ctx.host.request({ type: 'graphics.ginput', figure: f.id, n: 1 });
      if (r == null) throw gerr('noDisplay', 'gtext needs the graphical interface (no figure window is available).');
      const p = (r.points || [])[0];
      if (!p) break;
      const hv = ctx.call('text', [handleValue(ctx, [ax.id]), num(p[0]), num(p[1]), str(s), ...rest], 1)[0];
      made.push(...handleIds(hv));
    }
    return nargout ? handleValue(ctx, made) : [];
  },
  printd(args, nargout, ctx) {
    if (args.length !== 2) throw gerr('printd:args', 'printd(obj, filename).');
    const file = txt(args[1]);
    const buf = [];
    const prev = ctx.out;
    ctx.out = (t) => buf.push(String(t));
    try { ctx.call('disp', [args[0]], 0); } finally { ctx.out = prev; }
    const text = buf.join('');
    const ext = (/\.([A-Za-z0-9]+)$/.exec(file) || [])[1];
    const path = absPath(ctx, file);
    if (!ext || lower(ext) === 'txt') ctx.fs.writeText(path, text);
    else {
      const st = G(ctx);
      const was = st.objs.get(0).props.CurrentFigure;
      const f = newFigure(ctx);
      f.props.Visible = false;
      const ax = create(ctx, 'axes', f.id, { Visible: false, Position: [0, 0, 1, 1], PositionConstraint: 'innerposition', XLim: [0, 1], YLim: [0, 1], XLimMode: 'manual', YLimMode: 'manual' });
      create(ctx, 'text', ax.id, { String: text.replace(/\n+$/, '').split('\n'), Position: [0.02, 0.98, 0], VerticalAlignment: 'top', FontName: 'Courier New', Interpreter: 'none' });
      try { ctx.call('print', [handleValue(ctx, [f.id]), str(file)], 0); } finally {
        destroy(ctx, f.id);
        if (was != null && st.objs.has(was)) st.objs.get(0).props.CurrentFigure = was;
        flush(ctx);
      }
    }
    return nargout ? str(text) : [];
  },
  refreshdata(args, nargout, ctx) {
    const st = G(ctx);
    const roots = args.length && !isTxt(args[0]) ? objsOf(ctx, args[0]) : [currentFigure(ctx, true)];
    const ws = args.length > 1 ? lower(txt(args[1])) : args.length === 1 && isTxt(args[0]) ? lower(txt(args[0])) : 'base';
    if (!['base', 'caller'].includes(ws)) throw gerr('refreshdata:workspace', "refreshdata: WORKSPACE must be 'base' or 'caller'.");
    const visit = (o) => {
      for (const k of ['X', 'Y', 'Z']) {
        const src = o.props[`${k}DataSource`];
        if (typeof src === 'string' && src.trim()) {
          let v;
          try { v = ctx.evalString(src, ws === 'caller' ? 'caller' : 'base'); } catch (e) { throw gerr('refreshdata:eval', `refreshdata: could not evaluate ${k}DataSource '${src}': ${e.message}`); }
          v = Array.isArray(v) ? v[0] : v;
          if (v != null) setProp(ctx, o, `${k}Data`, v);
        }
      }
      for (const c of o.children) { const co = st.objs.get(c); if (co) visit(co); }
    };
    roots.forEach(visit);
    return [];
  },
  hidden(args, nargout, ctx) {
    const st = G(ctx);
    let a = args, ax;
    if (a.length && isHandleValue(a[0])) { ax = oneObj(ctx, a[0], 'Axes'); a = a.slice(1); } else ax = currentAxes(ctx, true);
    const axColor = Array.isArray(ax.props.Color) ? ax.props.Color : [1, 1, 1];
    const meshes = [];
    const walk = (o) => { for (const c of o.children) { const co = st.objs.get(c); if (!co) continue; if (co.type === 'hggroup' || co.type === 'hgtransform') walk(co); else if (isMeshSurface(co, axColor)) meshes.push(co); } };
    walk(ax);
    const isOn = meshes.length ? meshes[0].props.FaceColor !== 'none' : true;
    if (!a.length && nargout > 0) return str(isOn ? 'on' : 'off');
    let on;
    if (!a.length) on = !isOn;
    else { const s = lower(txt(a[0])); if (s !== 'on' && s !== 'off') throw gerr('hidden:option', "hidden: option must be 'on' or 'off'."); on = s === 'on'; }
    for (const m of meshes) { m.internal.hiddenMesh = true; m.props.FaceColor = on ? axColor.slice() : 'none'; m.userSet.add('FaceColor'); touch(st, m); }
    return nargout ? str(on ? 'on' : 'off') : [];
  },
  rticklabels: polarTickLabels('RTickLabel'),
  thetaticklabels: polarTickLabels('ThetaTickLabel'),
};
function manageColor(v) {
  // a colour spec Value → [r g b]
  if (isTxt(v)) { const s = lower(txt(v)); const c = COLOR_LETTERS[s] || COLOR_LETTERS[{ red: 'r', green: 'g', blue: 'b', cyan: 'c', magenta: 'm', yellow: 'y', black: 'k', white: 'w' }[s]]; if (c) return c.slice(); }
  const a = Array.from(nums(v));
  if (a.length === 3 && a.every((x) => x >= 0 && x <= 1)) return a;
  throw gerr('whitebg:color', 'whitebg: COLOR must be an RGB triplet or a colour name.');
}

// ---------------------------------------------------------------- dynamic properties (addproperty)

/** "a|{b}|c" → { choices: ['a', 'b', 'c'], def: 'b' } (default: the braced one, else the first) */
function radioSpec(v, what) {
  if (!isTxt(v)) throw gerr('addproperty:radio', `addproperty: the ${what} must be a text like "a|{b}|c".`);
  let def = null;
  const choices = txt(v).split('|').map((x) => x.trim()).filter((x) => x.length).map((x) => {
    const m = /^\{(.*)\}$/.exec(x);
    if (m) { def = m[1]; return m[1]; }
    return x;
  });
  if (!choices.length) throw gerr('addproperty:radio', `addproperty: the ${what} lists no values.`);
  return { choices, def: def ?? choices[0] };
}
function hasPropNamed(o, name) {
  if (/^(type|parent|children)$/i.test(name)) return true;
  try { const e = objProp(o, name); return !!e && e[0].toLowerCase() === name.toLowerCase(); } catch { return false; }
}

const dynBuiltins = {
  addproperty(args, nargout, ctx) {
    if (args.length < 3) throw gerr('addproperty:args', 'addproperty: NAME, H and TYPE are required.');
    if (!isTxt(args[0])) throw gerr('addproperty:name', 'addproperty: NAME must be a character vector or string.');
    const name = txt(args[0]);
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) throw gerr('addproperty:name', `addproperty: invalid property name '${name}'.`);
    const o = oneObj(ctx, args[1], 'H');
    if (!isTxt(args[2])) throw gerr('addproperty:type', 'addproperty: TYPE must be a character vector or string.');
    const type = lower(txt(args[2]));
    if (hasPropNamed(o, name)) throw gerr('addproperty:exists', `addproperty: a '${name}' property already exists in the graphics object.`);
    const arg = args[3];
    let entry;
    const withDefault = (e, fallback) => { e[2] = arg === undefined ? fallback : convertIn(e, arg, 'the new property'); return e; };
    switch (type) {
      case 'any': entry = [name, 'any']; entry[2] = arg === undefined ? empty() : arg; break;
      case 'radio': {
        if (arg === undefined) throw gerr('addproperty:radio', 'addproperty: a radio property needs its values ("a|{b}|c").');
        const r = radioSpec(arg, 'value list');
        entry = [name, 'enum', r.def, r.choices];
        break;
      }
      case 'boolean': entry = withDefault([name, 'bool'], false); break;
      case 'double': entry = withDefault([name, 'num'], 0); break;
      case 'string': entry = withDefault([name, 'text'], ''); break;
      case 'handle': entry = withDefault([name, 'handle'], null); break;
      case 'array': case 'data': entry = withDefault([name, 'mat'], null); break;
      case 'color': {
        const keys = args[4] !== undefined ? radioSpec(args[4], 'list of color keywords').choices : [];
        entry = [name, 'color', undefined, keys];
        entry[2] = arg === undefined ? [0, 0, 0] : parseColor(arg, keys, name);
        break;
      }
      default:
        throw gerr('addproperty:type', `addproperty: unsupported property type '${txt(args[2])}' (any, radio, boolean, double, string, handle, color or array).`);
    }
    if (!o.dyn) o.dyn = new Map();
    o.dyn.set(name.toLowerCase(), entry);
    o.props[name] = Array.isArray(entry[2]) ? entry[2].slice() : entry[2];
    touch(G(ctx), o);
    return [];
  },
};
h('addproperty', 'Adds a dynamic property to one graphics object; get and set then accept it. TYPE: "any" (ARG = default value), "radio" (ARG = "a|{b}|c", the braced value is the default), "boolean" ("on"/"off"), "double" (a scalar), "string", "handle", "color" (ARG = default colour, an optional second ARG lists keywords like "none|flat") or "array".', '그래픽 객체 하나에 동적 속성을 추가합니다. 이후 get과 set이 그 속성을 받습니다. TYPE: "any"(ARG = 기본값), "radio"(ARG = "a|{b}|c", 중괄호 값이 기본), "boolean"("on"/"off"), "double"(스칼라), "string", "handle", "color"(ARG = 기본 색, 두 번째 ARG 로 "none|flat" 같은 키워드 목록), "array".', ['addproperty(name, h, type)', 'addproperty(name, h, type, arg, ...)']);

// ---------------------------------------------------------------- export

export const builtins = {
  ...appBuiltins, ...testBuiltins, ...linkBuiltins, ...treeBuiltins, ...camBuiltins, ...cmapBuiltins, ...figBuiltins,
  ...dynBuiltins, ...plotsMod.builtins,
};
export const help = { ...H, ...plotsMod.help };
export const quiet = ['hggroup', 'hgtransform', 'dialog', ...(plotsMod.quiet || [])];
void fmtNum; void propNames; void makeCurrentAxes; void matOfValue;
