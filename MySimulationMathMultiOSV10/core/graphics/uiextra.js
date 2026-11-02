// Menus, context menus, tool bars, tables, button groups and the font
// chooser: uimenu, uicontextmenu, uitoolbar, uipushtool, uitoggletool,
// uitable, uibuttongroup, uisetfont. The GUI events of these objects come
// through uifuncs.js handleMessage → handleExtraCallback / button-group hooks.
import { str, num, tensor, cell, empty, bool, structOf, isCell, isStruct, isTensor, isChar, isString, isLogical, isNumeric } from '../value.js';
import { gerr, isTxt, txt, txtList, nums, isNum, lower } from './util.js';
import { G, create, objsOf, handleValue, isHandleValue, setPairs, setProp, touch, invokeCallback, eventData, onGet, onSet, findProp } from './model.js';
import { currentFigure } from './figax.js';
import { flush } from './scene.js';

// ---------------------------------------------------------------- helpers

function parentAndRest(ctx, args) {
  if (args.length && (isHandleValue(args[0]) || (isNum(args[0]) && !isTxt(args[0]) && args.length % 2 === 1))) {
    const [p] = objsOf(ctx, args[0], 'Parent');
    return { parent: p, rest: args.slice(1) };
  }
  const pi = args.findIndex((v, i) => i % 2 === 0 && isTxt(v) && lower(txt(v)) === 'parent');
  if (pi >= 0) { const [p] = objsOf(ctx, args[pi + 1], 'Parent'); const rest = args.slice(); rest.splice(pi, 2); return { parent: p, rest }; }
  return { parent: null, rest: args };
}
function needParent(p, types, fn) {
  if (!types.includes(p.type)) throw gerr(`${fn}:parent`, `The parent of a ${fn} must be a ${types.join(', ').replace(/, ([^,]*)$/, ' or $1')} object.`);
}
const exclusive = (o) => o && o.type === 'uicontrol' && (o.props.Style === 'radiobutton' || o.props.Style === 'togglebutton');
const valueNum = (v) => (v == null ? 0 : typeof v === 'number' ? v : isNum(v) && v.re && v.re.length ? v.re[0] : 0);
function groupOf(st, o) { const p = o && o.parent != null ? st.objs.get(o.parent) : null; return p && p.type === 'uibuttongroup' ? p : null; }
function groupButtons(st, g) { return g.children.slice().reverse().map((id) => st.objs.get(id)).filter(exclusive); }
/** The selected button of a button group (Value == Max), or null. */
function selectedButton(st, g) { return groupButtons(st, g).find((b) => valueNum(b.props.Value) === b.props.Max) || null; }
function selectButton(st, g, b) {
  for (const x of groupButtons(st, g)) {
    const want = x === b ? x.props.Max : x.props.Min;
    if (valueNum(x.props.Value) !== want) { x.props.Value = num(want); touch(st, x); }
  }
}

// ---------------------------------------------------------------- property hooks

// Label and Text are the same text; Callback and MenuSelectedFcn the same callback.
for (const [a, b] of [['Label', 'Text'], ['Text', 'Label']]) onSet(['uimenu'], a, (ctx, o, x) => { o.props[a] = x; o.props[b] = x; o.userSet.add(b); return true; });
for (const [a, b] of [['Callback', 'MenuSelectedFcn'], ['MenuSelectedFcn', 'Callback']]) onSet(['uimenu'], a, (ctx, o, x) => { o.props[a] = x; o.props[b] = x; return true; });
onSet(['uibuttongroup'], 'SelectionChangeFcn', (ctx, o, x) => { o.props.SelectionChangeFcn = x; o.props.SelectionChangedFcn = x; return true; });
onSet(['uibuttongroup'], 'SelectionChangedFcn', (ctx, o, x) => { o.props.SelectionChangeFcn = x; o.props.SelectionChangedFcn = x; return true; });
for (const n of ['TooltipString', 'Tooltip']) {
  const other = n === 'Tooltip' ? 'TooltipString' : 'Tooltip';
  onSet(['uipushtool', 'uitoggletool', 'uitable'], n, (ctx, o, x) => { o.props[n] = x; o.props[other] = x; return true; });
}

onGet(['uibuttongroup'], 'SelectedObject', (ctx, o) => {
  const st = G(ctx);
  const b = selectedButton(st, o);
  return handleValue(ctx, b ? [b.id] : []);
});
onSet(['uibuttongroup'], 'SelectedObject', (ctx, o, id) => {
  const st = G(ctx);
  const b = id == null ? null : st.objs.get(id);
  if (b && (!exclusive(b) || b.parent !== o.id)) throw gerr('invalidPropertyValue', "'SelectedObject' must be a radio button or toggle button of this button group.");
  if (b) selectButton(st, o, b);
  else for (const x of groupButtons(st, o)) { x.props.Value = num(x.props.Min); touch(st, x); }
  o.props.SelectedObject = null;
  return true;
});
// Radio / toggle buttons in a button group are mutually exclusive; the first one is selected.
onSet(['uicontrol'], 'Value', (ctx, o, x) => {
  o.props.Value = x;
  const st = G(ctx);
  const g = groupOf(st, o);
  if (g && exclusive(o) && valueNum(x) === o.props.Max) selectButton(st, g, o);
  return true;
});
onSet(['uicontrol'], 'Style', (ctx, o, x) => {
  o.props.Style = x;
  const st = G(ctx);
  const g = groupOf(st, o);
  if (g && exclusive(o) && !selectedButton(st, g)) { o.props.Value = num(o.props.Max); touch(st, o); }
  return true;
});

// uitable: Data must be a numeric / logical matrix or a cell array.
onSet(['uitable'], 'Data', (ctx, o, x) => {
  if (x == null || (x.dims && x.dims.includes(0))) { o.props.Data = null; return true; }
  if (!(isCell(x) || isNumeric(x) || isLogical(x)) || x.sparse || (x.dims && x.dims.length > 2)) throw gerr('invalidPropertyValue', "'Data' must be a 2-D numeric or logical matrix or a cell array.");
  if (isCell(x)) for (const e of x.data) if (!(isNumeric(e) || isLogical(e) || isChar(e) || isString(e)) || (!isTxt(e) && e.re && e.re.length > 1)) throw gerr('invalidPropertyValue', "Cells of 'Data' must hold scalars, logical values or text.");
  o.props.Data = x;
  return true;
});
onGet(['uitable'], 'Data', (ctx, o) => o.props.Data || tensor('double', [0, 0]));
onGet(['uitable'], 'ColumnName', (ctx, o) => o.props.ColumnName || str('numbered'));
onGet(['uitable'], 'RowName', (ctx, o) => o.props.RowName || str('numbered'));
onGet(['uitable'], 'ColumnEditable', (ctx, o) => o.props.ColumnEditable || tensor('logical', [0, 0]));
onGet(['uitable'], 'ColumnFormat', (ctx, o) => o.props.ColumnFormat || cell([0, 0], []));
onGet(['uitable'], 'ColumnWidth', (ctx, o) => o.props.ColumnWidth || str('auto'));
onGet(['uitable'], 'Extent', (ctx, o) => {
  const d = o.props.Data;
  const [m, n] = d ? d.dims : [0, 0];
  return tensor('double', [1, 4], [0, 0, 40 + 75 * n, 22 * (m + 1)]);
});

// ---------------------------------------------------------------- builtins

function uimenuBuiltin(args, nargout, ctx) {
  const st = G(ctx);
  const { parent, rest } = parentAndRest(ctx, args);
  const p = parent || currentFigure(ctx, true);
  needParent(p, ['figure', 'uimenu', 'uicontextmenu'], 'uimenu');
  const siblings = p.children.map((id) => st.objs.get(id)).filter((o) => o && o.type === 'uimenu');
  const o = create(ctx, 'uimenu', p.id, { Position: siblings.length + 1 });
  setPairs(ctx, [o], rest);
  touch(st, o);
  flush(ctx);
  return handleValue(ctx, [o.id]);
}

function uicontextmenuBuiltin(args, nargout, ctx) {
  const { parent, rest } = parentAndRest(ctx, args);
  const p = parent || currentFigure(ctx, true);
  needParent(p, ['figure'], 'uicontextmenu');
  const o = create(ctx, 'uicontextmenu', p.id, {});
  setPairs(ctx, [o], rest);
  return handleValue(ctx, [o.id]);
}

function uitoolbarBuiltin(args, nargout, ctx) {
  const { parent, rest } = parentAndRest(ctx, args);
  const p = parent || currentFigure(ctx, true);
  needParent(p, ['figure'], 'uitoolbar');
  const o = create(ctx, 'uitoolbar', p.id, {});
  setPairs(ctx, [o], rest);
  flush(ctx);
  return handleValue(ctx, [o.id]);
}

function toolBuiltin(type) {
  return (args, nargout, ctx) => {
    const st = G(ctx);
    const { parent, rest } = parentAndRest(ctx, args);
    let p = parent;
    if (!p) {
      const f = currentFigure(ctx, true);
      p = f.children.map((id) => st.objs.get(id)).find((o) => o && o.type === 'uitoolbar') || create(ctx, 'uitoolbar', f.id, {});
    }
    needParent(p, ['uitoolbar'], type);
    const o = create(ctx, type, p.id, {});
    setPairs(ctx, [o], rest);
    flush(ctx);
    return handleValue(ctx, [o.id]);
  };
}

function uitableBuiltin(args, nargout, ctx) {
  const { parent, rest } = parentAndRest(ctx, args);
  const p = parent || currentFigure(ctx, true);
  needParent(p, ['figure', 'uipanel', 'uibuttongroup'], 'uitable');
  const o = create(ctx, 'uitable', p.id, {});
  setPairs(ctx, [o], rest);
  flush(ctx);
  return handleValue(ctx, [o.id]);
}

function uibuttongroupBuiltin(args, nargout, ctx) {
  const { parent, rest } = parentAndRest(ctx, args);
  const p = parent || currentFigure(ctx, true);
  needParent(p, ['figure', 'uipanel', 'uibuttongroup'], 'uibuttongroup');
  const o = create(ctx, 'uibuttongroup', p.id, {});
  // 'SelectedObject' can only name a child, so apply it after the rest
  const sel = rest.findIndex((v, i) => i % 2 === 0 && isTxt(v) && lower(txt(v)) === 'selectedobject');
  const later = sel >= 0 ? rest.splice(sel, 2) : [];
  setPairs(ctx, [o], rest);
  if (later.length) setPairs(ctx, [o], later);
  flush(ctx);
  return handleValue(ctx, [o.id]);
}

/** Font names offered by the font chooser. */
export const FONT_NAMES = ['Helvetica', 'Arial', 'Calibri', 'Cambria', 'Consolas', 'Courier New', 'Georgia', 'Malgun Gothic', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Monospaced', 'SansSerif', 'Serif'];

function uisetfontBuiltin(args, nargout, ctx) {
  let target = null, init = null, title = 'Font';
  for (const a of args) {
    if (isTxt(a)) title = txt(a);
    else if (isStruct(a)) init = a;
    else if (isHandleValue(a) || isNum(a)) target = objsOf(ctx, a)[0];
    else throw gerr('uisetfont:args', 'uisetfont(h), uisetfont(fontstruct), uisetfont(___, title).');
  }
  const cur = { FontName: 'Helvetica', FontWeight: 'normal', FontAngle: 'normal', FontUnits: 'points', FontSize: 10 };
  const field = (s, k) => (s && s.fields.includes(k) ? s.data[0][k] : null);
  if (target) for (const k of Object.keys(cur)) { if (target.props[k] != null && (typeof target.props[k] === 'string' || typeof target.props[k] === 'number')) cur[k] = target.props[k]; }
  if (init) for (const k of Object.keys(cur)) { const v = field(init, k); if (v != null) cur[k] = isTxt(v) ? txt(v) : nums(v)[0]; }
  const names = FONT_NAMES.includes(cur.FontName) ? FONT_NAMES : [cur.FontName, ...FONT_NAMES];
  flush(ctx);
  const pick = ctx.host.request({ type: 'graphics.dialog', kind: 'listdlg', items: names, title, prompt: 'Font name', multiple: false, initial: [names.indexOf(cur.FontName) + 1] });
  if (pick == null) throw gerr('uisetfont:noDisplay', 'uisetfont needs the graphical interface (no figure window is available).');
  if (pick.cancelled || !Array.isArray(pick.indices) || !pick.indices.length) return num(0);
  const name = names[pick.indices[0] - 1];
  const more = ctx.host.request({ type: 'graphics.dialog', kind: 'inputdlg', title, prompts: ['Size (points):', 'Weight (normal | bold):', 'Angle (normal | italic):'], defaults: [String(cur.FontSize), cur.FontWeight, cur.FontAngle] });
  if (!more || more.cancelled || !Array.isArray(more.values)) return num(0);
  const size = Number(more.values[0]);
  if (!(size > 0)) throw gerr('uisetfont:size', `Invalid font size '${more.values[0]}'.`);
  const weight = lower(String(more.values[1] || 'normal').trim());
  const angle = lower(String(more.values[2] || 'normal').trim());
  if (!['normal', 'bold'].includes(weight)) throw gerr('uisetfont:weight', "Font weight must be 'normal' or 'bold'.");
  if (!['normal', 'italic'].includes(angle)) throw gerr('uisetfont:angle', "Font angle must be 'normal' or 'italic'.");
  const out = { FontName: str(name), FontWeight: str(weight), FontAngle: str(angle), FontUnits: str(cur.FontUnits), FontSize: num(size) };
  if (target) {
    for (const k of ['FontName', 'FontWeight', 'FontAngle', 'FontSize']) { let e = null; try { e = findProp(target.type, k); } catch { e = null; } if (e && e[0] === k) setProp(ctx, target, k, out[k]); }
    flush(ctx);
  }
  return structOf(out);
}

export const builtins = {
  uimenu: uimenuBuiltin,
  uicontextmenu: uicontextmenuBuiltin,
  uitoolbar: uitoolbarBuiltin,
  uipushtool: toolBuiltin('uipushtool'),
  uitoggletool: toolBuiltin('uitoggletool'),
  uitable: uitableBuiltin,
  uibuttongroup: uibuttongroupBuiltin,
  uisetfont: uisetfontBuiltin,
};

export const quiet = [];

// ---------------------------------------------------------------- GUI → engine events

/** Element (r, c) (0-based) of the table Data as a Value. */
function cellAt(D, r, c) {
  const m = D.dims[0];
  if (isCell(D)) return D.data[r + c * m];
  return tensor(D.cls, [1, 1], [D.re[r + c * m]]);
}
/** Format of a column: 'numeric' | 'logical' | 'char' | string[] (choices) | ''. */
function columnFormat(o, c) {
  const F = o.props.ColumnFormat;
  if (!F || !isCell(F) || c >= F.data.length) return '';
  const f = F.data[c];
  if (isCell(f)) return txtList(f);
  if (isTxt(f)) return lower(txt(f));
  return '';
}
/** Converts edited text / value for a cell; returns {value} or {error}. */
function convertCell(o, old, c, raw) {
  const fmt = columnFormat(o, c);
  const wantLogical = fmt === 'logical' || (!fmt && old && isLogical(old));
  const wantText = Array.isArray(fmt) || fmt === 'char' || (!fmt && old && (isChar(old) || isString(old)));
  if (wantLogical) {
    const b = typeof raw === 'boolean' ? raw : typeof raw === 'number' ? raw !== 0 : /^(1|true|on|yes)$/i.test(String(raw).trim());
    return { value: bool(b) };
  }
  if (wantText) {
    const s = String(raw);
    if (Array.isArray(fmt) && fmt.length && !fmt.includes(s)) return { error: `'${s}' is not one of the choices of column ${c + 1}.` };
    return { value: str(s) };
  }
  const s = String(raw).trim();
  const x = typeof raw === 'number' ? raw : s === '' ? NaN : Number(s);
  if (Number.isNaN(x) && !/^nan$/i.test(s)) return { error: `'${String(raw)}' is not a number.` };
  return { value: num(x) };
}
function withCell(D, r, c, v) {
  const m = D.dims[0];
  const k = r + c * m;
  if (isCell(D)) { const data = D.data.slice(); data[k] = v; return cell(D.dims.slice(), data); }
  const re = Float64Array.from(D.re);
  re[k] = v.re ? v.re[0] : 0;
  return tensor(D.cls, D.dims.slice(), re);
}

/**
 * Runs the GUI events of menus, tools and tables (uifuncs handleMessage calls
 * this first). Returns true when the message was handled here.
 */
export function handleExtraCallback(ctx, o, msg) {
  const st = G(ctx);
  const ev = msg.event;
  const run = (cb, name, extra = {}) => {
    if (!cb) return;
    try { invokeCallback(ctx, cb, o, eventData(ctx, o, name, extra)); } catch (err) { ctx.errOut(`Error in callback: ${err.message}\n`); }
  };
  switch (o.type) {
    case 'uimenu':
      if (o.props.Enable === false) return true;
      run(o.props.MenuSelectedFcn || o.props.Callback, 'Action');
      return true;
    case 'uicontextmenu':
      run(o.props.ContextMenuOpeningFcn || o.props.Callback, 'ContextMenuOpening');
      return true;
    case 'uipushtool':
      if (o.props.Enable === false) return true;
      run(o.props.ClickedCallback, 'ClickedCallback');
      return true;
    case 'uitoggletool': {
      if (o.props.Enable === false) return true;
      const want = msg.props && 'State' in msg.props ? !!msg.props.State : !o.props.State;
      o.props.State = want;
      run(want ? o.props.OnCallback : o.props.OffCallback, want ? 'On' : 'Off');
      run(o.props.ClickedCallback, 'ClickedCallback');
      return true;
    }
    case 'uitable': {
      const d = msg.data || {};
      if (ev === 'CellSelection') {
        const list = Array.isArray(d.indices) ? d.indices : [];
        const t = tensor('double', [list.length, 2]);
        list.forEach((p, i) => { t.re[i] = p[0]; t.re[i + list.length] = p[1]; });
        run(o.props.CellSelectionCallback, 'CellSelection', { Indices: t });
        return true;
      }
      if (ev === 'CellEdit') {
        const D = o.props.Data;
        const r = Number(d.row) - 1, c = Number(d.col) - 1;
        if (!D || !(r >= 0 && c >= 0 && r < D.dims[0] && c < D.dims[1])) return true;
        const old = cellAt(D, r, c);
        const conv = convertCell(o, old, c, d.value);
        let newData = old, error = '';
        if (conv.error) error = conv.error;
        else { newData = conv.value; o.props.Data = withCell(D, r, c, newData); }
        touch(st, o);
        run(o.props.CellEditCallback, 'CellEdit', {
          Indices: tensor('double', [1, 2], [r + 1, c + 1]), PreviousData: old, EditData: str(typeof d.value === 'string' ? d.value : String(d.value)),
          NewData: conv.error ? num(NaN) : newData, Error: str(error),
        });
        return true;
      }
      return true;
    }
    default: return false;
  }
}

/** Before a GUI callback on a uicontrol: the selected button of its button group (or undefined). */
export function groupBefore(ctx, o) {
  const st = G(ctx);
  const g = groupOf(st, o);
  return g && exclusive(o) ? { g, old: selectedButton(st, g) } : null;
}
/** After the props of a GUI callback were applied: runs SelectionChangedFcn when the selection moved. */
export function groupAfter(ctx, o, before) {
  if (!before) return;
  const st = G(ctx);
  const { g, old } = before;
  if (valueNum(o.props.Value) !== o.props.Max) {
    // clicking the selected radio button again keeps it selected
    if (o.props.Style === 'radiobutton' || old === o) { o.props.Value = num(o.props.Max); touch(st, o); }
    return;
  }
  selectButton(st, g, o);
  touch(st, g);
  if (old === o) return;
  const cb = g.props.SelectionChangedFcn;
  if (!cb) return;
  try {
    invokeCallback(ctx, cb, g, eventData(ctx, g, 'SelectionChanged', { OldValue: handleValue(ctx, old ? [old.id] : []), NewValue: handleValue(ctx, [o.id]) }));
  } catch (err) { ctx.errOut(`Error in callback: ${err.message}\n`); }
}

/** Context-menu id of an object for the scene (ContextMenu / UIContextMenu), or null. */
export function contextMenuId(st, o) {
  for (const v of [o.props.ContextMenu, o.props.UIContextMenu]) {
    if (v == null) continue;
    let id = null;
    if (isHandleValue(v)) id = v.gh.length === 1 ? v.gh[0] : null;
    else if (isTensor(v) && v.re && v.re.length === 1) id = v.re[0];
    const m = id == null ? null : st.objs.get(id);
    if (m && m.type === 'uicontextmenu') return m.id;
  }
  return null;
}

// ---------------------------------------------------------------- uitable scene data

const short = (x) => {
  if (Number.isNaN(x)) return 'NaN';
  if (!Number.isFinite(x)) return x > 0 ? 'Inf' : '-Inf';
  if (Number.isInteger(x) && Math.abs(x) < 1e10) return String(x);
  const s = x.toPrecision(5);
  return s.includes('e') ? s.replace(/\.?0+e/, 'e') : s.replace(/\.?0+$/, '');
};
function namesOf(v, n) {
  if (v == null || (isTxt(v) && lower(txt(v)) === 'numbered')) return Array.from({ length: n }, (_, i) => String(i + 1));
  if (v.dims && v.dims.includes(0)) return [];
  return txtList(v);
}
/** The JSON form of a uitable for the GUI. */
export function tableScene(o) {
  const D = o.props.Data;
  const [m, n] = D ? D.dims : [0, 0];
  const cells = [];
  for (let r = 0; r < m; r++) {
    const row = [];
    for (let c = 0; c < n; c++) {
      const v = cellAt(D, r, c);
      if (isLogical(v)) row.push({ t: 'b', v: !!v.re[0] });
      else if (isChar(v) || isString(v)) row.push({ t: 's', v: txt(v) });
      else if (v.re && v.re.length) row.push({ t: 'n', v: v.re[0], s: short(v.re[0]) });
      else row.push({ t: 's', v: '' });
    }
    cells.push(row);
  }
  const E = o.props.ColumnEditable;
  const ed = E ? Array.from(nums(E)) : [];
  const W = o.props.ColumnWidth;
  let widths = [];
  if (W && isCell(W)) widths = W.data.map((w) => (isTxt(w) ? 'auto' : nums(w)[0]));
  else if (W && isNum(W)) widths = Array.from(nums(W));
  return {
    Cells: cells,
    ColumnNames: namesOf(o.props.ColumnName, n),
    RowNames: namesOf(o.props.RowName, m),
    Editable: Array.from({ length: n }, (_, c) => !!(ed.length === 1 ? ed[0] : ed[c])),
    Formats: Array.from({ length: n }, (_, c) => columnFormat(o, c)),
    Widths: Array.from({ length: n }, (_, c) => (typeof widths[c] === 'number' ? widths[c] : 'auto')),
  };
}

// ---------------------------------------------------------------- help

const H = {};
const h = (name, en, ko, syntax) => { H[name] = { en, ko, syntax }; };
h('uimenu', 'Creates a menu in the figure menu bar, a submenu, or an item of a context menu.', '그림 메뉴 막대의 메뉴, 하위 메뉴, 또는 상황 메뉴의 항목을 만듭니다.',
  ["m = uimenu(fig, 'Label', 'File')", "item = uimenu(m, 'Label', 'Open', 'Callback', @fcn)", "item = uimenu(cm, 'Text', 'Delete', 'Accelerator', 'D')", 'm = uimenu(___, Name, Value)']);
h('uicontextmenu', 'Creates a context menu (right-click menu); assign it to the ContextMenu property of an object or figure.', '상황 메뉴(오른쪽 단추 메뉴)를 만듭니다. 객체나 그림의 ContextMenu 속성에 지정합니다.',
  ['cm = uicontextmenu', 'cm = uicontextmenu(fig)', "cm = uicontextmenu(fig, 'Callback', @fcn)", 'set(h, "ContextMenu", cm)']);
h('uitoolbar', 'Creates a tool bar in a figure.', '그림에 도구 모음을 만듭니다.', ['tb = uitoolbar', 'tb = uitoolbar(fig)', 'tb = uitoolbar(fig, Name, Value)']);
h('uipushtool', 'Creates a push button in a figure tool bar.', '그림 도구 모음에 누름 단추를 만듭니다.',
  ['t = uipushtool', 't = uipushtool(tb)', "t = uipushtool(tb, 'CData', img, 'TooltipString', 'Run', 'ClickedCallback', @fcn)"]);
h('uitoggletool', 'Creates a toggle button (State on/off) in a figure tool bar.', '그림 도구 모음에 켜기/끄기(State) 단추를 만듭니다.',
  ['t = uitoggletool', 't = uitoggletool(tb)', "t = uitoggletool(tb, 'TooltipString', 'Grid', 'OnCallback', @on, 'OffCallback', @off)"]);
h('uitable', 'Creates a table of data in a figure (numbers, text and logical values; editable columns).', '그림에 데이터 표를 만듭니다 (숫자, 글자, 논리값; 열 편집 가능).',
  ['t = uitable', "t = uitable(fig, 'Data', magic(3))", "t = uitable(___, 'ColumnName', {'a', 'b'}, 'ColumnEditable', true, 'CellEditCallback', @fcn)"]);
h('uibuttongroup', 'Creates a panel whose radio buttons and toggle buttons are mutually exclusive.', '안의 라디오 단추와 토글 단추가 하나만 선택되는 패널을 만듭니다.',
  ['bg = uibuttongroup', "bg = uibuttongroup(fig, 'Title', 'Mode', 'Position', pos)", "bg = uibuttongroup(___, 'SelectionChangedFcn', @fcn)"]);
h('uisetfont', 'Font chooser dialog; returns a font struct (or 0 when cancelled) and applies it to a handle.', '글꼴 선택 대화상자. 글꼴 구조체(취소하면 0)를 돌려주고 핸들에 적용합니다.',
  ['fontstruct = uisetfont', 'fontstruct = uisetfont(h)', 'fontstruct = uisetfont(fontstruct)', 'fontstruct = uisetfont(___, title)']);
export const help = H;
