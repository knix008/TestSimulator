// table and timetable value classes, their construction / conversion
// functions, indexing (dot, (), {}), assignment, display, joins, grouping
// (groupsummary, varfun, rowfun, findgroups, splitapply) and the JS helpers
// makeTable / tableToJS used by other areas (readtable / writetable).
import {
  tensor, normDims, prod, isTensor, isSparse, isString, isCell, isStruct, isChar, isObject, isFuncHandle,
  toTensor, num, bool, str, cell, struct, stringArray, MError,
} from '../../value.js';
import { E, textArg, optArg, textList, gather, resolveIndex, resolveDelete, subIndex, classDef, isCellstr } from './util.js';
import { catValues } from './ops.js';
import { objAssign } from './objarr.js';
import { cellItemText, sizeStr, inlineNumber } from './display.js';
import { formatNumber } from './fmt.js';
import { builtins as ELMAT } from './elmat.js';
import { builtins as SETS } from './sets.js';
import { builtins as DATAFUN } from './datafun.js';

const emptyD = () => tensor('double', [0, 0]);
const isTable = (v) => v && v.isObject && (v.cls === 'table' || v.cls === 'timetable');
const isTT = (v) => v && v.isObject && v.cls === 'timetable';
const COLON = { cls: 'char', dims: [1, 1], re: Float64Array.of(58), im: null };
const isColon = (s) => isChar(s) && s.re.length === 1 && s.re[0] === 58;

// ------------------------------------------------------------- construction

/** Number of rows of a variable value. */
export function rowsOf(v) {
  if (isTable(v)) return v.dims[0];
  return (v.dims || [1, 1])[0];
}

/** Makes a table object. vars: Value[] (equal heights), names: string[]. */
export function makeTableObj(vars, names, opts = {}) {
  const h = vars.length ? rowsOf(vars[0]) : (opts.height ?? 0);
  for (let i = 0; i < vars.length; i++) {
    if (rowsOf(vars[i]) !== h) throw E('base:table:UnequalVarLengths', `All table variables must have the same number of rows.`);
  }
  if (new Set(names).size !== names.length) throw E('base:table:DuplicateVarNames', `Duplicate table variable name: '${names.find((n, i) => names.indexOf(n) !== i)}'.`);
  const tt = !!opts.rowTimes;
  return {
    cls: tt ? 'timetable' : 'table', isObject: true, handle: false, dims: [h, vars.length], rows: h,
    props: {
      vars, names: names.slice(), rowNames: opts.rowNames || null, rowTimes: opts.rowTimes || null,
      description: opts.description || '', units: opts.units || names.map(() => ''), vdesc: opts.vdesc || names.map(() => ''),
      dimNames: opts.dimNames || (tt ? ['Time', 'Variables'] : ['Row', 'Variables']), userData: opts.userData || emptyD(),
    },
  };
}
function withVars(T, vars, names, extra = {}) {
  const P = T.props;
  const keep = (arr) => names.map((n) => { const i = P.names.indexOf(n); return i >= 0 && arr[i] !== undefined ? arr[i] : ''; });
  return makeTableObj(vars, names, { rowNames: extra.rowNames !== undefined ? extra.rowNames : P.rowNames, rowTimes: extra.rowTimes !== undefined ? extra.rowTimes : P.rowTimes, description: P.description, units: keep(P.units), vdesc: keep(P.vdesc), dimNames: P.dimNames, userData: P.userData, height: extra.height ?? T.dims[0] });
}

/** JS helper for other areas: build a table from column Values. */
export function makeTable(columns, names, opts = {}) { return makeTableObj(columns, names || columns.map((_, i) => `Var${i + 1}`), opts); }
/** JS helper: {names, columns, rowNames, rowTimes} of a table. */
export function tableToJS(T) { return { names: T.props.names.slice(), columns: T.props.vars.slice(), rowNames: T.props.rowNames, rowTimes: T.props.rowTimes }; }

// ------------------------------------------------------------- row gathering

/** Rows idx (0-based; -1 → missing) of any variable value. */
export function rowsGather(v, idx) {
  if (isTable(v)) return tableRows(v, idx);
  const d = v.dims || [1, 1];
  const n = d[0];
  const rest = prod(d) / Math.max(n, 1) || (n === 0 ? prod(d.slice(1)) : 0);
  const cols = n === 0 ? prod(d.slice(1)) : rest;
  const hasMissing = idx.some((i) => i < 0);
  if (!hasMissing) {
    const out = new Int32Array(idx.length * cols);
    let k = 0;
    for (let c = 0; c < cols; c++) for (const i of idx) out[k++] = i + c * n;
    return gather(v, out, [idx.length, ...d.slice(1)]);
  }
  // build with a missing element appended
  const withMiss = appendMissing(v);
  const m = n + 1;
  const out = new Int32Array(idx.length * cols);
  let k = 0;
  for (let c = 0; c < cols; c++) for (const i of idx) out[k++] = i < 0 ? n + c * m : i + c * m;
  return gather(withMiss, out, [idx.length, ...d.slice(1)]);
}
/** Same value with one extra row of missing values. */
function appendMissing(v) {
  const d = (v.dims || [1, 1]).slice();
  const n = d[0], cols = prod(d.slice(1));
  const m = n + 1;
  const total = m * cols;
  const pick = (src, fill) => {
    const a = Array.isArray(src) ? new Array(total) : new src.constructor(total);
    for (let c = 0; c < cols; c++) { for (let i = 0; i < n; i++) a[i + c * m] = src[i + c * n]; a[n + c * m] = fill; }
    return a;
  };
  const nd = [m, ...d.slice(1)];
  if (isTensor(v) || isSparse(v)) {
    const t = toTensor(v);
    const fill = t.cls === 'double' || t.cls === 'single' ? NaN : t.cls === 'char' ? 32 : 0;
    return { ...t, dims: nd, re: pick(t.re, fill), im: t.im ? pick(t.im, 0) : null };
  }
  if (isCell(v)) return { ...v, dims: nd, data: pick(v.data, str('')) };
  if (isString(v)) return { ...v, dims: nd, data: pick(v.data, null) };
  if (isStruct(v)) { const r = Object.create(null); for (const f of v.fields) r[f] = emptyD(); return { ...v, dims: nd, data: pick(v.data, r) }; }
  if (v.arr) {
    const out = { ...v, dims: nd, arr: pick(v.arr, v.cls === 'categorical' ? 0 : NaN) };
    if (v.arr2) out.arr2 = pick(v.arr2, NaN);
    if (v.arr3) out.arr3 = pick(v.arr3, NaN);
    return out;
  }
  throw E('base:table:missingFill', `Cannot fill missing rows for variables of class '${v.cls}'.`);
}
function tableRows(T, idx) {
  const P = T.props;
  const vars = P.vars.map((v) => rowsGather(v, idx));
  const rowNames = P.rowNames ? idx.map((i) => (i < 0 ? '' : P.rowNames[i])) : null;
  const rowTimes = P.rowTimes ? rowsGather(P.rowTimes, idx) : null;
  return withVars(T, vars, P.names, { rowNames, rowTimes, height: idx.length });
}

// ------------------------------------------------------------- subscripts

function rowIndex(T, s) {
  const h = T.dims[0];
  if (isColon(s)) return Array.from({ length: h }, (_, i) => i);
  if (T.props.rowNames && (isChar(s) || isString(s) || isCell(s))) {
    return textList(s).list.map((n) => { const k = T.props.rowNames.indexOf(n); if (k < 0) throw E('base:table:UnrecognizedRowName', `Unrecognized row name '${n}'.`); return k; });
  }
  if (isTT(T) && s && s.isObject && s.cls === T.props.rowTimes.cls) {
    const out = [];
    for (const t of s.arr) for (let i = 0; i < h; i++) if (T.props.rowTimes.arr[i] === t) out.push(i);
    return out;
  }
  if (s && s.isObject && s.cls === 'timerange') {
    const out = [];
    for (let i = 0; i < h; i++) { const t = T.props.rowTimes.arr[i]; if (t >= s.props.start && (s.props.closedRight ? t <= s.props.end : t < s.props.end)) out.push(i); }
    return out;
  }
  return Array.from(subIndex(s, h).idx);
}
function varIndex(T, s, allowNew = false) {
  const P = T.props;
  if (isColon(s)) return P.names.map((_, i) => i);
  if (isChar(s) || isString(s) || isCell(s)) {
    return textList(s).list.map((n) => {
      const k = P.names.indexOf(n);
      if (k < 0) { if (allowNew) return n; throw E('base:table:UnrecognizedVarName', `Unrecognized table variable name '${n}'.`); }
      return k;
    });
  }
  if (s && s.isObject && s.cls === 'vartype') return P.vars.map((v, i) => (matchesType(v, s.props.type) ? i : -1)).filter((i) => i >= 0);
  const t = toTensor(s);
  if (t.cls === 'logical') { const out = []; for (let i = 0; i < t.re.length; i++) if (t.re[i]) out.push(i); return out; }
  return Array.from(t.re, (x) => { if (!(x >= 1) || !Number.isInteger(x) || (x > P.names.length && !allowNew)) throw E('base:table:BadNumericVarIndex', `Variable index exceeds table dimensions.`); return x - 1; });
}
function matchesType(v, type) {
  if (type === 'numeric') return (isTensor(v) || isSparse(v)) && v.cls !== 'logical' && v.cls !== 'char';
  if (type === 'cellstr') return isCellstr(v);
  return v.cls === type;
}

// ------------------------------------------------------------- generic value index / assign

/** Indexes a plain value or object by a subscript chain. */
export function indexAny(v, subs, ctx) {
  let cur = v;
  for (let k = 0; k < subs.length; k++) {
    const s = subs[k];
    if (cur && cur.isObject) {
      const def = classDef(ctx, cur.cls);
      if (def && def.subsref) return def.subsref(cur, subs.slice(k), 1, ctx)[0];
      throw E('base:index:unsupported', `Indexing is not supported for class '${cur.cls}'.`);
    }
    if (s.type === '()') { const r = resolveIndex(cur.dims || [1, 1], s.subs); cur = gather(cur, r.idx, r.dims); } else if (s.type === '{}') {
      if (!isCell(cur)) throw E('base:index:braceNonCell', 'Brace indexing is not supported for variables of this type.');
      const r = resolveIndex(cur.dims, s.subs);
      if (r.idx.length !== 1) throw E('base:index:multipleBraceResults', 'Expected one output from a curly brace indexing expression, but there were ' + r.idx.length + ' results.');
      cur = cur.data[r.idx[0]];
    } else {
      const f = typeof s.subs === 'string' ? s.subs : textArg(s.subs);
      if (!isStruct(cur)) throw E('base:index:dotNonStruct', 'Dot indexing is not supported for variables of this type.');
      if (!cur.fields.includes(f)) throw E('base:index:noField', `Unrecognized field name "${f}".`);
      cur = cur.data[0][f];
    }
  }
  return cur;
}

const asStore = (v) => {
  if (isTensor(v) || isSparse(v)) { const t = toTensor(v); return { dims: t.dims, arr: t.re, arr2: t.im || undefined }; }
  if (isCell(v) || isString(v) || isStruct(v)) return { dims: v.dims, arr: v.data };
  return null;
};

/** Assigns rhs into v at subs (single level or chain). */
export function assignAny(v, subs, rhs, ctx) {
  const s = subs[0];
  if (v && v.isObject) {
    const def = classDef(ctx, v.cls);
    if (def && def.subsasgn) return def.subsasgn(v, subs, rhs, ctx);
    throw E('base:index:unsupported', `Assignment is not supported for class '${v.cls}'.`);
  }
  if (subs.length > 1) {
    const inner = indexAnySafe(v, [s], ctx);
    return assignAny(v, [s], assignAny(inner, subs.slice(1), rhs, ctx), ctx);
  }
  if (s.type === '.') {
    const f = typeof s.subs === 'string' ? s.subs : textArg(s.subs);
    let st = v && isStruct(v) ? v : struct([1, 1], [], [Object.create(null)]);
    const fields = st.fields.includes(f) ? st.fields : [...st.fields, f];
    const data = st.data.map((r) => { const o = Object.create(null); for (const k of fields) o[k] = k in r ? r[k] : emptyD(); return o; });
    data[0][f] = rhs;
    return struct(st.dims, fields, data);
  }
  if (v == null || (isTensor(v) && v.re.length === 0 && !isChar(v) && s.type === '{}')) v = cell([0, 0], []);
  if (s.type === '{}') {
    if (!isCell(v)) throw E('base:index:braceAssignNonCell', 'Brace assignment requires a cell array.');
    const st = asStore(v);
    const r = objAssign(st, s.subs, { dims: [1, 1], arr: [rhs] }, emptyD());
    return cell(r.dims, r.arr);
  }
  if (isTensor(rhs) && rhs.re.length === 0 && !isCell(v)) { const { keep, dims } = resolveDelete(v.dims, s.subs); return gather(v, keep, dims); }
  if (isCell(v)) {
    const src = isCell(rhs) ? rhs : cell([1, 1], [rhs]);
    const r = objAssign(asStore(v), s.subs, { dims: src.dims, arr: src.data }, emptyD());
    return cell(r.dims, r.arr);
  }
  if (isString(v)) {
    const src = isString(rhs) ? rhs : stringArray(rhs.dims || [1, 1], textList(rhs).list);
    const r = objAssign(asStore(v), s.subs, { dims: src.dims, arr: src.data }, null);
    return stringArray(r.dims, r.arr);
  }
  const t = toTensor(v);
  const R = toTensor(rhs);
  const conv = R.cls === t.cls ? R : catValues(1, [tensor(t.cls, [0, 0]), R], ctx);
  const r = objAssign(asStore(t), s.subs, { dims: conv.dims, arr: conv.re, arr2: conv.im || (t.im ? new Float64Array(conv.re.length) : undefined) }, t.cls === 'char' ? 0 : 0);
  let im = r.arr2 || null;
  if (!im && conv.im) { im = new Float64Array(r.arr.length); }
  if (conv.im && !t.im) {
    // complex rhs into real array
    const r2 = objAssign({ dims: t.dims, arr: new Float64Array(t.re.length) }, s.subs, { dims: conv.dims, arr: conv.im }, 0);
    im = r2.arr;
  }
  const cls = t.re.length === 0 && t.cls === 'double' && !isChar(v) ? conv.cls : t.cls;
  return { cls, dims: normDims(r.dims), re: r.arr, im: im && im.some((x) => x !== 0) ? im : null };
}
function indexAnySafe(v, subs, ctx) {
  try { return indexAny(v, subs, ctx); } catch (e) { return undefined; }
}

// ------------------------------------------------------------- properties

function propsStruct(T) {
  const P = T.props;
  const r = Object.create(null);
  r.Description = str(P.description);
  r.UserData = P.userData;
  r.DimensionNames = cell([1, 2], P.dimNames.map((s) => str(s)));
  r.VariableNames = cell([1, P.names.length], P.names.map((s) => str(s)));
  r.VariableDescriptions = cell([1, P.names.length], P.vdesc.map((s) => str(s)));
  r.VariableUnits = cell([1, P.names.length], P.units.map((s) => str(s)));
  r.VariableContinuity = emptyD();
  if (isTT(T)) {
    r.RowTimes = P.rowTimes;
    r.StartTime = P.rowTimes && P.rowTimes.arr.length ? rowsGather(P.rowTimes, [0]) : emptyD();
    const dt = P.rowTimes && P.rowTimes.arr.length > 1 ? P.rowTimes.arr[1] - P.rowTimes.arr[0] : NaN;
    const uniform = P.rowTimes && P.rowTimes.arr.length > 1 && Array.from(P.rowTimes.arr).every((x, i, a) => i === 0 || Math.abs(x - a[i - 1] - dt) < 1e-6);
    r.SampleRate = num(uniform ? 1000 / dt : NaN);
    r.TimeStep = uniform ? { ...P.rowTimes, cls: 'duration', dims: [1, 1], arr: Float64Array.of(dt), props: { Format: 's' } } : num(NaN);
  } else r.RowNames = P.rowNames ? cell([P.rowNames.length, 1], P.rowNames.map((s) => str(s))) : cell([0, 0], []);
  r.CustomProperties = struct([1, 1], [], [Object.create(null)]);
  return struct([1, 1], Object.keys(r), [r]);
}
function setProp(T, name, rhs) {
  const P = { ...T.props };
  const list = () => (isCell(rhs) || isString(rhs) ? textList(rhs).list : [textArg(rhs)]);
  switch (name) {
    case 'VariableNames': {
      const ns = list();
      if (ns.length !== P.names.length) throw E('base:table:IncorrectNumberOfVarNames', 'The VariableNames property must contain one name for each variable in the table.');
      if (new Set(ns).size !== ns.length) throw E('base:table:DuplicateVarNames', 'Duplicate table variable names.');
      P.names = ns; break;
    }
    case 'RowNames': {
      const ns = isTensor(rhs) && rhs.re.length === 0 ? null : list();
      if (ns && ns.length !== T.dims[0]) throw E('base:table:IncorrectNumberOfRowNames', 'The RowNames property must contain one name for each row in the table.');
      P.rowNames = ns; break;
    }
    case 'Description': P.description = textArg(rhs) || ''; break;
    case 'VariableUnits': P.units = list(); break;
    case 'VariableDescriptions': P.vdesc = list(); break;
    case 'DimensionNames': P.dimNames = list(); break;
    case 'UserData': P.userData = rhs; break;
    case 'RowTimes': P.rowTimes = rhs; break;
    default: throw E('base:table:UnknownProperty', `Unrecognized table property '${name}'.`);
  }
  return { ...T, props: P };
}

// ------------------------------------------------------------- subsref / subsasgn

function braceContent(T, rows, vars, ctx) {
  const items = vars.map((j) => rowsGather(T.props.vars[j], rows));
  if (items.length === 1) return items[0];
  return catValues(1, items, ctx);
}

function tableSubsref(T, subs, nargout, ctx) {
  const s = subs[0];
  let v;
  if (s.type === '.') {
    const name = typeof s.subs === 'string' ? s.subs : textArg(s.subs);
    const P = T.props;
    if (name === 'Properties') v = propsStruct(T);
    else if (P.names.includes(name)) v = P.vars[P.names.indexOf(name)];
    else if (isTT(T) && name === P.dimNames[0]) v = P.rowTimes;
    else if (!isTT(T) && name === P.dimNames[0] && P.rowNames) v = cell([P.rowNames.length, 1], P.rowNames.map((x) => str(x)));
    else if (TABLE_METHODS[name]) { const callArgs = subs[1] && subs[1].type === '()' ? subs[1].subs : []; const r = TABLE_METHODS[name]([T, ...callArgs], nargout, ctx); return Array.isArray(r) ? r : r === undefined ? [] : [r]; } else throw E('base:table:UnrecognizedVarName', `Unrecognized table variable name '${name}'.`);
  } else {
    if (s.subs.length !== 2) throw E('base:table:LinearSubscript', 'Subscripting a table using linear indexing (one subscript) or multidimensional indexing (three or more subscripts) is not supported. Use a row subscript and a variable subscript.');
    const rows = rowIndex(T, s.subs[0]), vars = varIndex(T, s.subs[1]);
    if (s.type === '()') {
      const sub = tableRows(T, rows);
      v = withVars(sub, vars.map((j) => sub.props.vars[j]), vars.map((j) => T.props.names[j]));
    } else v = braceContent(T, rows, vars, ctx);
  }
  if (subs.length > 1) return [indexAny(v, subs.slice(1), ctx)];
  return [v];
}

function setVar(T, name, value, ctx) {
  const P = T.props;
  const k = P.names.indexOf(name);
  if (isTensor(value) && value.re.length === 0 && value.dims[0] === 0 && value.dims[1] === 0 && k >= 0) {
    return withVars(T, P.vars.filter((_, i) => i !== k), P.names.filter((_, i) => i !== k));
  }
  const h = T.dims[0];
  let val = value;
  if (rowsOf(val) !== h) {
    if (P.vars.length === 0 && !P.rowNames && !P.rowTimes) {
      const nt = makeTableObj([val], [name], { description: P.description, dimNames: P.dimNames, userData: P.userData });
      return nt;
    }
    if (prod(val.dims || [1, 1]) === 1 && !isTable(val)) val = ELMAT.repmat([val, num(h), num(1)], 1, ctx);
    else throw E('base:table:RowDimensionMismatch', `To assign to or create a variable in a table, the number of rows must match the height of the table.`);
  }
  if (k >= 0) { const vars = P.vars.slice(); vars[k] = val; return withVars(T, vars, P.names); }
  return withVars(T, [...P.vars, val], [...P.names, name]);
}

function tableSubsasgn(T, subs, rhs, ctx) {
  const s = subs[0];
  const P = T.props;
  if (s.type === '.') {
    const name = typeof s.subs === 'string' ? s.subs : textArg(s.subs);
    if (name === 'Properties') {
      if (subs.length < 2 || subs[1].type !== '.') throw E('base:table:PropertiesAssign', 'Assign to a specific table property, for example T.Properties.VariableNames.');
      const pname = typeof subs[1].subs === 'string' ? subs[1].subs : textArg(subs[1].subs);
      let val = rhs;
      if (subs.length > 2) val = assignAny(indexAny(propsStruct(T), [subs[1]], ctx), subs.slice(2), rhs, ctx);
      return setProp(T, pname, val);
    }
    if (isTT(T) && name === P.dimNames[0]) return setProp(T, 'RowTimes', subs.length > 1 ? assignAny(P.rowTimes, subs.slice(1), rhs, ctx) : rhs);
    if (subs.length > 1) {
      const k = P.names.indexOf(name);
      const cur = k >= 0 ? P.vars[k] : undefined;
      const nv = assignAny(cur, subs.slice(1), rhs, ctx);
      if (rowsOf(nv) > T.dims[0] && P.vars.length) {
        // growing one variable grows the table
        const grown = tableRows(T, [...Array.from({ length: T.dims[0] }, (_, i) => i), ...new Array(rowsOf(nv) - T.dims[0]).fill(-1)]);
        return setVar(grown, name, nv, ctx);
      }
      return setVar(T, name, nv, ctx);
    }
    return setVar(T, name, rhs, ctx);
  }
  if (s.subs.length !== 2) throw E('base:table:LinearSubscript', 'Subscripting a table using linear indexing is not supported. Use a row subscript and a variable subscript.');
  // deletion
  if (s.type === '()' && isTensor(rhs) && rhs.re.length === 0 && !isTable(rhs)) {
    if (isColon(s.subs[1])) {
      const del = new Set(rowIndex(T, s.subs[0]));
      return tableRows(T, Array.from({ length: T.dims[0] }, (_, i) => i).filter((i) => !del.has(i)));
    }
    if (isColon(s.subs[0])) {
      const del = new Set(varIndex(T, s.subs[1]));
      return withVars(T, P.vars.filter((_, i) => !del.has(i)), P.names.filter((_, i) => !del.has(i)));
    }
    throw E('base:table:InvalidDeletion', 'At least one subscript must be a colon when you delete rows or variables.');
  }
  let rows;
  const h = T.dims[0];
  if (isColon(s.subs[0])) rows = Array.from({ length: h }, (_, i) => i);
  else if (P.rowNames && (isChar(s.subs[0]) || isString(s.subs[0]) || isCell(s.subs[0]))) rows = rowIndex(T, s.subs[0]);
  else rows = Array.from(subIndex(s.subs[0], h, true).idx);
  let vars = varIndex(T, s.subs[1], true);
  let cur = T;
  // grow rows
  const maxRow = rows.length ? Math.max(...rows) : -1;
  if (maxRow >= h) cur = tableRows(cur, [...Array.from({ length: h }, (_, i) => i), ...new Array(maxRow + 1 - h).fill(-1)]);
  // new variables
  for (let q = 0; q < vars.length; q++) {
    if (typeof vars[q] === 'string' || vars[q] >= cur.props.names.length) {
      const name = typeof vars[q] === 'string' ? vars[q] : `Var${vars[q] + 1}`;
      const template = s.type === '{}' ? rhs : isTable(rhs) ? rhs.props.vars[Math.min(q, rhs.props.vars.length - 1)] : isCell(rhs) ? rhs.data[q] : rhs;
      const empty = rowsGather(rowsGather(template, [0]), new Array(cur.dims[0]).fill(-1));
      cur = setVar(cur, name, empty, ctx);
      vars[q] = cur.props.names.indexOf(name);
    }
  }
  const sub = [{ type: '()', subs: [tensor('double', [rows.length, 1], rows.map((i) => i + 1)), COLON] }];
  const newVars = cur.props.vars.slice();
  vars.forEach((j, q) => {
    let piece;
    if (s.type === '{}') {
      piece = vars.length === 1 ? rhs : indexAny(rhs, [{ type: '()', subs: [COLON, num(q + 1)] }], ctx);
    } else if (isTable(rhs)) piece = rhs.props.vars[rhs.props.vars.length === 1 ? 0 : q];
    else if (isCell(rhs)) {
      const d = rhs.dims;
      piece = d[0] === 1 && rows.length === 1 ? rhs.data[q] : indexAny(rhs, [{ type: '()', subs: [COLON, num(q + 1)] }], ctx);
      if (isCell(piece) && !isCell(newVars[j])) piece = ELMAT.reshape([CELLMAT(piece, ctx), num(rows.length), num(1)], 1, ctx);
    } else piece = prod(rhs.dims || [1, 1]) === 1 ? rhs : indexAny(rhs, [{ type: '()', subs: [COLON, num(q + 1)] }], ctx);
    const target = newVars[j];
    const pd = (piece.dims || [1, 1]);
    if (prod(pd) === rows.length && pd[0] !== rows.length) piece = ELMAT.reshape([piece, num(rows.length), num(1)], 1, ctx);
    newVars[j] = assignAny(target, sub, piece, ctx);
  });
  return withVars(cur, newVars, cur.props.names);
}
function CELLMAT(c, ctx) { return catValues(0, c.data.map((x) => x), ctx); }

// ------------------------------------------------------------- display

function varCellTexts(v, ctx) {
  const n = rowsOf(v);
  const out = [];
  if (isTable(v)) { for (let i = 0; i < n; i++) out.push(`1×${v.dims[1]} table`); return { texts: out, right: false }; }
  if (v.isObject) {
    const def = classDef(ctx, v.cls);
    for (let i = 0; i < n; i++) { const e = rowsGather(v, [i]); const t = def && def.inlineText ? def.inlineText(e, ctx) : null; out.push(t == null ? `1×1 ${v.cls}` : t); }
    return { texts: out, right: false };
  }
  const d = v.dims;
  const cols = n ? prod(d) / n : 0;
  if (isChar(v)) { for (let i = 0; i < n; i++) { let s = ''; for (let j = 0; j < cols; j++) s += String.fromCharCode(v.re[i + j * n]); out.push(`'${s}'`); } return { texts: out, right: false }; }
  if (isString(v)) { for (let i = 0; i < n; i++) { const parts = []; for (let j = 0; j < cols; j++) { const s = v.data[i + j * n]; parts.push(s == null ? '<missing>' : `"${s}"`); } out.push(parts.join('    ')); } return { texts: out, right: false }; }
  if (isCell(v)) { for (let i = 0; i < n; i++) { const parts = []; for (let j = 0; j < cols; j++) parts.push(cellItemText(v.data[i + j * n], ctx)); out.push(parts.join('    ')); } return { texts: out, right: false }; }
  if (isStruct(v)) { for (let i = 0; i < n; i++) out.push('1×1 struct'); return { texts: out, right: false }; }
  const t = toTensor(v);
  const fmt1 = (x, k) => {
    if (t.cls === 'logical') return x ? 'true' : 'false';
    if (t.cls !== 'double' && t.cls !== 'single') return String(x);
    let s = !Number.isFinite(x) ? (x !== x ? 'NaN' : x > 0 ? 'Inf' : '-Inf') : Number.isInteger(x) && Math.abs(x) < 1e15 ? String(x) : formatNumber(x, { flags: '', width: -1, prec: 5, conv: 'g' });
    if (t.im) { const y = t.im[k]; s += `${y < 0 ? '-' : '+'}${formatNumber(Math.abs(y), { flags: '', width: -1, prec: 5, conv: 'g' })}i`; }
    return s;
  };
  // align sub-columns of multi-column variables
  const sub = [];
  for (let j = 0; j < cols; j++) { const c = []; for (let i = 0; i < n; i++) c.push(fmt1(t.re[i + j * n], i + j * n)); sub.push(c); }
  const w = sub.map((c) => Math.max(0, ...c.map((s) => s.length)));
  for (let i = 0; i < n; i++) out.push(sub.map((c, j) => c[i].padStart(w[j])).join('    '));
  return { texts: out, right: true };
}

function tableText(T, ctx) {
  const P = T.props;
  const n = T.dims[0];
  const columns = [];
  if (isTT(T)) {
    const r = varCellTexts(P.rowTimes, ctx);
    columns.push({ name: P.dimNames[0], texts: r.texts, right: false });
  } else if (P.rowNames) columns.push({ name: '', texts: P.rowNames.slice(), right: false, rowNames: true });
  P.vars.forEach((v, j) => { const r = varCellTexts(v, ctx); columns.push({ name: P.names[j], texts: r.texts, right: r.right }); });
  const lines = ['', '', ''];
  const rows = Array.from({ length: n }, () => '');
  for (const c of columns) {
    const w = Math.max(c.name.length, ...c.texts.map((s) => s.length), 0);
    const lpad = Math.floor((w - c.name.length) / 2);
    const head = c.rowNames ? ' '.repeat(w) : (' '.repeat(lpad) + c.name).padEnd(w);
    lines[0] += '    ' + head;
    lines[1] += '    ' + (c.rowNames ? ' '.repeat(w) : '_'.repeat(w));
    c.texts.forEach((t, i) => { rows[i] += '    ' + (c.right ? t.padStart(Math.max(...c.texts.map((s) => s.length))).padStart(w - Math.floor((w - Math.max(...c.texts.map((s) => s.length))) / 2)).padEnd(w) : t.padEnd(w)); });
  }
  const body = [lines[0].replace(/\s+$/, ''), lines[1].replace(/\s+$/, ''), '', ...rows.map((r) => r.replace(/\s+$/, ''))];
  return body.join('\n');
}

function tableDisplay(T, name, ctx, opts) {
  const loose = !(opts && opts.compact);
  const label = `  ${sizeStr(T.dims)} ${T.cls}`;
  const empty = T.dims[0] === 0 || T.dims[1] === 0;
  const text = empty ? `  ${sizeStr(T.dims)} empty ${T.cls}` : `${label}${loose ? '\n\n' : '\n'}${tableText(T, ctx)}`;
  if (opts && opts.disp) return (empty ? text : tableText(T, ctx)) + '\n';
  if (!name) return text + '\n';
  return loose ? `${name} =\n\n${text}\n\n` : `${name} =\n${text}\n`;
}

// ------------------------------------------------------------- constructors and conversions

function inputNames(ctx, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    let n = null;
    if (ctx && typeof ctx.inputName === 'function') { try { n = ctx.inputName(i); } catch (e) { n = null; } }
    out.push(n && /^[A-Za-z]\w*$/.test(n) ? n : `Var${i + 1}`);
  }
  return out;
}
const TABLE_PARAMS = ['VariableNames', 'RowNames', 'Size', 'VariableTypes', 'DimensionNames', 'RowTimes', 'SampleRate', 'TimeStep', 'StartTime'];
function splitNV(args) {
  let k = args.length;
  for (let i = 0; i < args.length; i++) {
    const s = textArg(args[i]);
    if (s !== null && TABLE_PARAMS.some((p) => p.toLowerCase() === s.toLowerCase()) && i + 1 < args.length && (i === 0 || !isTable(args[i]))) {
      // a char column that happens to equal a parameter name is unlikely; treat as parameter
      k = i; break;
    }
  }
  const nv = new Map();
  for (let i = k; i + 1 < args.length; i += 2) {
    const s = textArg(args[i]);
    const hit = TABLE_PARAMS.find((p) => p.toLowerCase() === (s || '').toLowerCase());
    if (!hit) throw E('base:table:UnknownParameter', `Invalid parameter name '${s}'.`);
    nv.set(hit, args[i + 1]);
  }
  return { pos: args.slice(0, k), nv };
}

function emptyOfType(type, n) {
  switch (type) {
    case 'double': case 'single': return { ...tensor(type, [n, 1]), re: new Float64Array(n) };
    case 'logical': return tensor('logical', [n, 1]);
    case 'string': return stringArray([n, 1], new Array(n).fill(null));
    case 'cell': case 'cellstr': return cell([n, 1], Array.from({ length: n }, () => (type === 'cellstr' ? tensor('char', [0, 0]) : emptyD())));
    case 'char': return tensor('char', [n, 0]);
    case 'datetime': return { cls: 'datetime', isObject: true, handle: false, dims: [n, 1], props: { Format: '', TimeZone: '' }, arr: new Float64Array(n).fill(NaN) };
    case 'duration': return { cls: 'duration', isObject: true, handle: false, dims: [n, 1], props: { Format: 'hh:mm:ss' }, arr: new Float64Array(n) };
    case 'categorical': return { cls: 'categorical', isObject: true, handle: false, dims: [n, 1], props: { categories: [], ordinal: false, protect: false }, arr: new Float64Array(n) };
    default:
      if (type in { int8: 1, uint8: 1, int16: 1, uint16: 1, int32: 1, uint32: 1, int64: 1, uint64: 1 }) return tensor(type, [n, 1]);
      throw E('base:table:UnsupportedVariableType', `Unsupported variable type '${type}'.`);
  }
}

function tableFn(args, nargout, ctx) {
  const { pos, nv } = splitNV(args);
  if (nv.has('Size')) {
    const sz = Array.from(toTensor(nv.get('Size')).re);
    const types = textList(nv.get('VariableTypes')).list;
    if (types.length !== sz[1]) throw E('base:table:VariableTypesAndSizeMismatch', 'The number of variable types must match the number of variables in Size.');
    const names = nv.has('VariableNames') ? textList(nv.get('VariableNames')).list : types.map((_, i) => `Var${i + 1}`);
    return makeTableObj(types.map((t) => emptyOfType(t, sz[0])), names, { height: sz[0], rowNames: nv.has('RowNames') ? textList(nv.get('RowNames')).list : null });
  }
  let names = nv.has('VariableNames') ? textList(nv.get('VariableNames')).list : inputNames(ctx, pos.length);
  if (names.length !== pos.length) throw E('base:table:IncorrectNumberOfVarNames', 'The number of variable names must match the number of variables.');
  const vars = pos.map((v) => (isChar(v) && v.dims[0] === 1 && pos.length && false ? v : v));
  let h = vars.length ? rowsOf(vars[0]) : 0;
  const rowNames = nv.has('RowNames') ? textList(nv.get('RowNames')).list : null;
  if (!vars.length && rowNames) h = rowNames.length;
  const T = makeTableObj(vars, names, { rowNames, height: h });
  if (nv.has('DimensionNames')) return setProp(T, 'DimensionNames', nv.get('DimensionNames'));
  return T;
}

function timetableFn(args, nargout, ctx) {
  const { pos, nv } = splitNV(args);
  let rowTimes = nv.get('RowTimes') || null;
  let vars = pos;
  let names;
  if (!rowTimes && pos.length && pos[0].isObject && (pos[0].cls === 'datetime' || pos[0].cls === 'duration')) { rowTimes = pos[0]; vars = pos.slice(1); names = inputNames(ctx, pos.length).slice(1); }
  if (!names) names = inputNames(ctx, vars.length);
  if (nv.has('VariableNames')) names = textList(nv.get('VariableNames')).list;
  const h = vars.length ? rowsOf(vars[0]) : 0;
  if (!rowTimes && (nv.has('SampleRate') || nv.has('TimeStep'))) {
    const start = nv.has('StartTime') ? nv.get('StartTime') : null;
    const step = nv.has('TimeStep') ? nv.get('TimeStep').arr[0] : 1000 / toTensor(nv.get('SampleRate')).re[0];
    const t0 = start ? start.arr[0] : 0;
    const arr = Float64Array.from({ length: h }, (_, i) => t0 + i * step);
    rowTimes = start && start.cls === 'datetime' ? { ...start, dims: [h, 1], arr } : { cls: 'duration', isObject: true, handle: false, dims: [h, 1], props: { Format: 's' }, arr };
  }
  if (!rowTimes) throw E('base:timetable:NoTimeVector', 'Row times must be specified as a datetime or duration vector.');
  if (rowTimes.dims[0] !== h && rowTimes.dims[1] === h) rowTimes = { ...rowTimes, dims: [h, 1] };
  if (rowsOf(rowTimes) !== h && vars.length) throw E('base:timetable:IncorrectNumberOfRowTimes', 'The number of row times must match the number of rows.');
  return makeTableObj(vars, names, { rowTimes, height: h });
}

function array2tableFn(args) {
  const A = args[0];
  const { nv } = splitNV([num(0), ...args.slice(1)].slice(1).length ? args.slice(1) : []);
  const d = A.dims;
  const n = d[0], m = d[1];
  const vars = [];
  for (let j = 0; j < m; j++) vars.push(rowsGather(gather(A, Array.from({ length: n }, (_, i) => i + j * n), [n, 1]), Array.from({ length: n }, (_, i) => i)));
  const names = nv.has('VariableNames') ? textList(nv.get('VariableNames')).list : vars.map((_, j) => `${'A'}${j + 1}`);
  return makeTableObj(vars, names, { height: n, rowNames: nv.has('RowNames') ? textList(nv.get('RowNames')).list : null });
}
function cell2tableFn(args, nargout, ctx) {
  const C = args[0];
  const { nv } = splitNV(args.slice(1));
  const [n, m] = C.dims;
  const vars = [];
  for (let j = 0; j < m; j++) {
    const items = []; for (let i = 0; i < n; i++) items.push(C.data[i + j * n]);
    const allNumScalar = items.every((x) => (isTensor(x) && !isChar(x) && x.re.length === 1));
    const allText = items.every((x) => isChar(x) && x.dims[0] <= 1);
    if (allNumScalar && items.length) vars.push(catValues(0, items, ctx));
    else if (items.every((x) => x.isObject && x.cls === items[0].cls) && items.length) vars.push(catValues(0, items, ctx));
    else vars.push(cell([n, 1], items));
    void allText;
  }
  const names = nv.has('VariableNames') ? textList(nv.get('VariableNames')).list : vars.map((_, j) => `C${j + 1}`);
  return makeTableObj(vars, names, { height: n, rowNames: nv.has('RowNames') ? textList(nv.get('RowNames')).list : null });
}
function struct2tableFn(args, nargout, ctx) {
  const S = args[0];
  let asArray = S.data.length !== 1;
  for (let i = 1; i + 1 < args.length; i += 2) if (optArg(args[i]) === 'asarray') asArray = toTensor(args[i + 1]).re[0] !== 0;
  if (!asArray) return makeTableObj(S.fields.map((f) => S.data[0][f]), S.fields);
  const n = S.data.length;
  const vars = S.fields.map((f) => {
    const items = S.data.map((r) => r[f]);
    if (items.every((x) => isTensor(x) && !isChar(x) && x.re.length === 1)) return catValues(0, items, ctx);
    return cell([n, 1], items);
  });
  return makeTableObj(vars, S.fields, { height: n });
}
function table2arrayFn(args, nargout, ctx) {
  const T = args[0];
  if (!T.props.vars.length) return emptyD();
  return catValues(1, T.props.vars, ctx);
}
function table2cellFn(args) {
  const T = args[0];
  const n = T.dims[0], m = T.dims[1];
  const data = new Array(n * m);
  T.props.vars.forEach((v, j) => {
    for (let i = 0; i < n; i++) {
      const r = rowsGather(v, [i]);
      data[i + j * n] = isCell(r) && prod(r.dims) === 1 ? r.data[0] : r;
    }
  });
  return cell([n, m], data);
}
function table2structFn(args) {
  const T = args[0];
  let scalar = false;
  for (let i = 1; i + 1 < args.length; i += 2) if (optArg(args[i]) === 'toscalar') scalar = toTensor(args[i + 1]).re[0] !== 0;
  const names = T.props.names;
  if (scalar) { const r = Object.create(null); names.forEach((nm, j) => { r[nm] = T.props.vars[j]; }); return struct([1, 1], names, [r]); }
  const n = T.dims[0];
  const data = [];
  for (let i = 0; i < n; i++) { const r = Object.create(null); names.forEach((nm, j) => { const v = rowsGather(T.props.vars[j], [i]); r[nm] = isCell(v) && prod(v.dims) === 1 ? v.data[0] : v; }); data.push(r); }
  return struct([n, 1], names, data);
}

// ------------------------------------------------------------- variable management

function varList(T, v) { return varIndex(T, v); }
function addvarsFn(args, nargout, ctx) {
  const T = args[0];
  let k = args.length;
  for (let i = 1; i < args.length; i++) { const s = optArg(args[i]); if (['before', 'after', 'newvariablenames'].includes(s)) { k = i; break; } }
  const newVals = args.slice(1, k);
  let names = inputNames(ctx, args.length).slice(1, k).map((n, i) => (n.startsWith('Var') ? `Var${T.dims[1] + i + 1}` : n));
  let at = T.dims[1];
  for (let i = k; i + 1 < args.length; i += 2) {
    const s = optArg(args[i]);
    if (s === 'newvariablenames') names = textList(args[i + 1]).list;
    else if (s === 'before') at = varIndex(T, args[i + 1])[0];
    else if (s === 'after') at = varIndex(T, args[i + 1])[0] + 1;
  }
  const vars = T.props.vars.slice(), ns = T.props.names.slice();
  vars.splice(at, 0, ...newVals); ns.splice(at, 0, ...names);
  return withVars(T, vars, ns);
}
function removevarsFn(args) {
  const T = args[0];
  const del = new Set(varList(T, args[1]));
  return withVars(T, T.props.vars.filter((_, i) => !del.has(i)), T.props.names.filter((_, i) => !del.has(i)));
}
function movevarsFn(args) {
  const T = args[0];
  const move = varList(T, args[1]);
  const rest = T.props.names.map((_, i) => i).filter((i) => !move.includes(i));
  let at = rest.length;
  for (let i = 2; i + 1 < args.length; i += 2) {
    const s = optArg(args[i]), w = varIndex(T, args[i + 1])[0];
    const p = rest.indexOf(w);
    if (s === 'before') at = p; else if (s === 'after') at = p + 1;
  }
  const order = rest.slice(); order.splice(at, 0, ...move);
  return withVars(T, order.map((i) => T.props.vars[i]), order.map((i) => T.props.names[i]));
}
function renamevarsFn(args) {
  const T = args[0];
  const idx = varList(T, args[1]), nn = textList(args[2]).list;
  const names = T.props.names.slice();
  idx.forEach((j, q) => { names[j] = nn[q]; });
  return withVars(T, T.props.vars, names);
}

// ------------------------------------------------------------- keys and grouping

/** Row key strings of selected variables. */
function rowKeys(T, vars) {
  const n = T.dims[0];
  const cols = vars.map((j) => keyColumn(T.props.vars[j]));
  return Array.from({ length: n }, (_, i) => cols.map((c) => c[i]).join('\u0001'));
}
function keyColumn(v) {
  const n = rowsOf(v);
  if (isCell(v)) return v.data.slice(0, n).map((x) => 's' + (textArg(x) ?? JSON.stringify(Array.from(x.re || []))));
  if (isString(v)) return v.data.slice(0, n).map((s) => (s == null ? '\u0000missing' : 's' + s));
  if (v.isObject && v.arr) return Array.from(v.arr.slice(0, n), (x, i) => (v.cls === 'categorical' ? (x ? 'c' + v.props.categories[x - 1] : '\u0000u') : 'n' + x));
  if (isChar(v)) { const d = v.dims; const m = d[1]; return Array.from({ length: n }, (_, i) => { let s = ''; for (let j = 0; j < m; j++) s += String.fromCharCode(v.re[i + j * n]); return 's' + s; }); }
  const t = toTensor(v);
  const cols = n ? t.re.length / n : 0;
  return Array.from({ length: n }, (_, i) => { let s = ''; for (let j = 0; j < cols; j++) s += 'n' + t.re[i + j * n]; return s; });
}
/** Sort comparator for key rows of a table (by the variables' values). */
function keyComparator(T, vars) {
  const cols = vars.map((j) => {
    const v = T.props.vars[j];
    if (isCell(v) || isString(v) || isChar(v)) return { text: true, vals: keyColumn(v) };
    if (v.isObject && v.arr) return { text: false, vals: Array.from(v.arr) };
    return { text: false, vals: Array.from(toTensor(v).re) };
  });
  return (a, b) => {
    for (const c of cols) {
      const x = c.vals[a], y = c.vals[b];
      if (x === y) continue;
      if (!c.text) { if (x !== x) return 1; if (y !== y) return -1; }
      return x < y ? -1 : 1;
    }
    return 0;
  };
}
/** Groups rows: returns {groups: [{key, rows}], sorted by key values}. */
function groupRows(T, vars) {
  const keys = rowKeys(T, vars);
  const map = new Map();
  keys.forEach((k, i) => { if (!map.has(k)) map.set(k, []); map.get(k).push(i); });
  const groups = [...map.values()];
  const cmp = keyComparator(T, vars);
  groups.sort((g1, g2) => cmp(g1[0], g2[0]));
  return groups;
}
function fnName(fn) {
  if (typeof fn === 'string') return fn;
  if (isFuncHandle(fn)) return fn.name || 'Fun';
  const t = textArg(fn);
  return t || 'Fun';
}

function groupsummaryFn(args, nargout, ctx) {
  const T = args[0];
  const gv = varIndex(T, args[1]);
  let methods = [];
  let dv = null;
  if (args.length > 2) {
    const m = args[2];
    if (isCell(m)) methods = m.data.map((x) => (isFuncHandle(x) ? x : textArg(x)));
    else methods = [isFuncHandle(m) ? m : textArg(m)];
    if (args.length > 3) dv = varIndex(T, args[3]);
  }
  if (methods.length === 1 && methods[0] === 'all') methods = ['mean', 'sum', 'min', 'max', 'range', 'median', 'mode', 'var', 'std', 'nummissing', 'nnz'];
  if (!dv) dv = T.props.names.map((_, i) => i).filter((i) => !gv.includes(i) && isTensor(T.props.vars[i]) && !isChar(T.props.vars[i]));
  const groups = groupRows(T, gv);
  const firsts = groups.map((g) => g[0]);
  const vars = gv.map((j) => rowsGather(T.props.vars[j], firsts));
  const names = gv.map((j) => T.props.names[j]);
  vars.push(tensor('double', [groups.length, 1], groups.map((g) => g.length)));
  names.push('GroupCount');
  let fcount = 0;
  for (const m of methods) {
    const label = typeof m === 'string' ? m : `fun${++fcount}`;
    for (const j of dv) {
      const col = T.props.vars[j];
      const vals = groups.map((g) => {
        const sub = rowsGather(col, g);
        if (m === 'nummissing') return num(Array.from(toTensor(sub).re).filter((x) => x !== x).length);
        if (m === 'numunique') return num(new Set(keyColumn(sub)).size);
        const r = ctx.call(m, [sub], 1)[0];
        return r;
      });
      vars.push(catValues(0, vals, ctx));
      names.push(`${label}_${T.props.names[j]}`);
    }
  }
  return makeTableObj(vars, names, { height: groups.length });
}

function nvMap(args, start, allowed) {
  const m = new Map();
  for (let i = start; i + 1 < args.length; i += 2) {
    const s = textArg(args[i]);
    const hit = allowed.find((a) => a.toLowerCase() === (s || '').toLowerCase());
    if (!hit) throw E('base:table:UnknownParameter', `Invalid parameter name '${s}'.`);
    m.set(hit, args[i + 1]);
  }
  return m;
}

function varfunFn(args, nargout, ctx) {
  const fn = args[0], T = args[1];
  const nv = nvMap(args, 2, ['InputVariables', 'GroupingVariables', 'OutputFormat']);
  const gv = nv.has('GroupingVariables') ? varIndex(T, nv.get('GroupingVariables')) : [];
  let iv = nv.has('InputVariables') ? varIndex(T, nv.get('InputVariables')) : T.props.names.map((_, i) => i).filter((i) => !gv.includes(i));
  const fmt = nv.has('OutputFormat') ? optArg(nv.get('OutputFormat')) : 'table';
  const name = fnName(fn);
  const groups = gv.length ? groupRows(T, gv) : [Array.from({ length: T.dims[0] }, (_, i) => i)];
  const results = iv.map((j) => groups.map((g) => ctx.call(fn, [rowsGather(T.props.vars[j], g)], 1)[0]));
  if (fmt === 'cell') return cell([groups.length, iv.length], iv.flatMap((_, q) => results[q]));
  if (fmt === 'uniform') return catValues(1, results.map((rs) => catValues(0, rs, ctx)), ctx);
  const vars = [], names = [];
  if (gv.length) {
    gv.forEach((j) => { vars.push(rowsGather(T.props.vars[j], groups.map((g) => g[0]))); names.push(T.props.names[j]); });
    vars.push(tensor('double', [groups.length, 1], groups.map((g) => g.length))); names.push('GroupCount');
  }
  iv.forEach((j, q) => { vars.push(catValues(0, results[q], ctx)); names.push(`${name}_${T.props.names[j]}`); });
  return makeTableObj(vars, names, { height: rowsOf(vars[0] || emptyD()), rowNames: !gv.length && T.props.rowNames && rowsOf(vars[0]) === T.dims[0] ? T.props.rowNames : null });
}

function rowfunFn(args, nargout, ctx) {
  const fn = args[0], T = args[1];
  const nv = nvMap(args, 2, ['InputVariables', 'GroupingVariables', 'OutputVariableNames', 'NumOutputs', 'OutputFormat', 'ExtractCellContents', 'SeparateInputs']);
  const iv = nv.has('InputVariables') ? varIndex(T, nv.get('InputVariables')) : T.props.names.map((_, i) => i);
  let outNames = nv.has('OutputVariableNames') ? textList(nv.get('OutputVariableNames')).list : null;
  const nout = nv.has('NumOutputs') ? toTensor(nv.get('NumOutputs')).re[0] : outNames ? outNames.length : 1;
  const fmt = nv.has('OutputFormat') ? optArg(nv.get('OutputFormat')) : 'table';
  const extract = nv.has('ExtractCellContents') && toTensor(nv.get('ExtractCellContents')).re[0] !== 0;
  const n = T.dims[0];
  const outs = Array.from({ length: nout }, () => []);
  for (let i = 0; i < n; i++) {
    const a = iv.map((j) => { const r = rowsGather(T.props.vars[j], [i]); return extract && isCell(r) ? r.data[0] : r; });
    const r = ctx.call(fn, a, nout);
    for (let q = 0; q < nout; q++) outs[q].push(r[q]);
  }
  if (fmt === 'cell') return cell([n, nout], outs.flat());
  const cols = outs.map((list) => (list.length ? catValues(0, list, ctx) : emptyD()));
  if (fmt === 'uniform') return nout === 1 ? cols[0] : cols;
  if (!outNames) outNames = cols.map((_, q) => `Var${q + 1}`);
  return makeTableObj(cols, outNames, { height: n, rowNames: T.props.rowNames });
}

function findgroupsFn(args, nargout, ctx) {
  let T;
  if (args.length === 1 && isTable(args[0])) T = args[0];
  else T = makeTableObj(args.map((a) => (rowsOf(a) === 1 && prod(a.dims || [1, 1]) > 1 ? ELMAT.transpose ? a : a : a)).map((a) => (a.dims && a.dims[0] === 1 && a.dims[1] > 1 ? reshapeCol(a) : a)), args.map((_, i) => `V${i}`));
  const vars = T.props.names.map((_, i) => i);
  const keys = rowKeys(T, vars);
  const valid = keys.map((k, i) => !/\u0000|nNaN/.test(k));
  const groups = groupRows(T, vars).filter((g) => valid[g[0]]);
  const G = new Float64Array(T.dims[0]).fill(NaN);
  groups.forEach((g, q) => { for (const i of g) G[i] = q + 1; });
  const outG = tensor('double', args.length === 1 && !isTable(args[0]) && args[0].dims[0] === 1 ? [1, G.length] : [G.length, 1], G);
  if (nargout <= 1) return outG;
  const ids = vars.map((j) => rowsGather(T.props.vars[j], groups.map((g) => g[0])));
  if (isTable(args[0])) return [outG, makeTableObj(ids, T.props.names, { height: groups.length })];
  return [outG, ...ids];
}
function reshapeCol(a) { return ELMAT.reshape([a, num(prod(a.dims)), num(1)], 1, null); }

function splitapplyFn(args, nargout, ctx) {
  const fn = args[0];
  const G = toTensor(args[args.length - 1]);
  const data = args.slice(1, -1);
  const ng = Math.max(0, ...Array.from(G.re).filter((x) => x === x));
  const nout = Math.max(1, nargout);
  const outs = Array.from({ length: nout }, () => []);
  for (let g = 1; g <= ng; g++) {
    const rows = []; G.re.forEach((x, i) => { if (x === g) rows.push(i); });
    const a = data.flatMap((d) => (isTable(d) ? d.props.vars.map((v) => rowsGather(v, rows)) : [rowsGather(d.dims[0] === 1 && d.dims[1] > 1 ? reshapeCol(d) : d, rows)]));
    const r = ctx.call(fn, a, nout);
    for (let q = 0; q < nout; q++) outs[q].push(r[q]);
  }
  const res = outs.map((list) => catValues(0, list, ctx));
  return nout === 1 ? res[0] : res;
}

// ------------------------------------------------------------- joins

function joinKeys(L, R, args, start) {
  const nv = nvMap(args, start, ['Keys', 'LeftKeys', 'RightKeys', 'MergeKeys', 'LeftVariables', 'RightVariables', 'Type', 'KeepOneCopy']);
  let lk, rk;
  if (nv.has('Keys')) { const ks = textList(nv.get('Keys')).list; lk = ks.map((k) => varIndex(L, str(k))[0]); rk = ks.map((k) => varIndex(R, str(k))[0]); } else if (nv.has('LeftKeys')) { lk = varIndex(L, nv.get('LeftKeys')); rk = varIndex(R, nv.get('RightKeys')); } else {
    const common = L.props.names.filter((n) => R.props.names.includes(n));
    if (!common.length) throw E('base:table:join:CantInferKey', 'Cannot find a common table variable to use as a key variable.');
    lk = common.map((n) => L.props.names.indexOf(n)); rk = common.map((n) => R.props.names.indexOf(n));
  }
  return { lk, rk, nv };
}
function mergeNames(L, R, lvars, rvars, lk, rk, merge) {
  const ln = lvars.map((j) => L.props.names[j]), rn = rvars.map((j) => R.props.names[j]);
  const lOut = ln.map((n) => (rn.includes(n) && !(merge && lk.some((k) => L.props.names[k] === n)) ? `${n}_left` : n));
  const rOut = rn.map((n) => (ln.includes(n) && !(merge && rk.some((k) => R.props.names[k] === n)) ? `${n}_right` : n));
  return { lOut, rOut };
}
function joinFn(args, nargout, ctx) {
  const L = args[0], R = args[1];
  const { lk, rk, nv } = joinKeys(L, R, args, 2);
  const lkeys = rowKeys(L, lk), rkeys = rowKeys(R, rk);
  const rmap = new Map();
  rkeys.forEach((k, i) => { if (rmap.has(k)) throw E('base:table:join:DuplicateRightKeyVarValues', 'The key variables for the right table must have unique values.'); rmap.set(k, i); });
  const match = lkeys.map((k) => { if (!rmap.has(k)) throw E('base:table:join:LeftKeyValueNotFound', 'The key variables for the left table must contain all values in the key variables for the right table.'); return rmap.get(k); });
  const lvars = nv.has('LeftVariables') ? varIndex(L, nv.get('LeftVariables')) : L.props.names.map((_, i) => i);
  const rvars = nv.has('RightVariables') ? varIndex(R, nv.get('RightVariables')) : R.props.names.map((_, i) => i).filter((i) => !rk.includes(i));
  const { lOut, rOut } = mergeNames(L, R, lvars, rvars, lk, rk, false);
  const vars = [...lvars.map((j) => L.props.vars[j]), ...rvars.map((j) => rowsGather(R.props.vars[j], match))];
  const out = withVars(L, vars, [...lOut, ...rOut]);
  return nargout >= 2 ? [out, tensor('double', [match.length, 1], match.map((i) => i + 1))] : out;
}
function innerjoinFn(args, nargout, ctx) {
  const L = args[0], R = args[1];
  const { lk, rk, nv } = joinKeys(L, R, args, 2);
  const lkeys = rowKeys(L, lk), rkeys = rowKeys(R, rk);
  const pairs = [];
  lkeys.forEach((k, i) => rkeys.forEach((k2, j) => { if (k === k2) pairs.push([i, j]); }));
  const cmp = keyComparator(L, lk);
  pairs.sort((a, b) => cmp(a[0], b[0]) || a[0] - b[0] || a[1] - b[1]);
  const lvars = nv.has('LeftVariables') ? varIndex(L, nv.get('LeftVariables')) : L.props.names.map((_, i) => i);
  const rvars = nv.has('RightVariables') ? varIndex(R, nv.get('RightVariables')) : R.props.names.map((_, i) => i).filter((i) => !rk.includes(i));
  const { lOut, rOut } = mergeNames(L, R, lvars, rvars, lk, rk, true);
  const li = pairs.map((p) => p[0]), ri = pairs.map((p) => p[1]);
  const vars = [...lvars.map((j) => rowsGather(L.props.vars[j], li)), ...rvars.map((j) => rowsGather(R.props.vars[j], ri))];
  const out = makeTableObj(vars, [...lOut, ...rOut], { height: pairs.length });
  if (nargout >= 2) return [out, tensor('double', [li.length, 1], li.map((i) => i + 1)), tensor('double', [ri.length, 1], ri.map((i) => i + 1))].slice(0, nargout);
  return out;
}
function outerjoinFn(args, nargout, ctx) {
  const L = args[0], R = args[1];
  const { lk, rk, nv } = joinKeys(L, R, args, 2);
  const type = nv.has('Type') ? optArg(nv.get('Type')) : 'full';
  const merge = nv.has('MergeKeys') && toTensor(nv.get('MergeKeys')).re[0] !== 0;
  const lkeys = rowKeys(L, lk), rkeys = rowKeys(R, rk);
  const pairs = [];
  const rUsed = new Set();
  lkeys.forEach((k, i) => {
    let any = false;
    rkeys.forEach((k2, j) => { if (k === k2) { pairs.push([i, j]); rUsed.add(j); any = true; } });
    if (!any && (type === 'full' || type === 'left')) pairs.push([i, -1]);
  });
  if (type === 'full' || type === 'right') rkeys.forEach((k, j) => { if (!rUsed.has(j)) pairs.push([-1, j]); });
  const cmpL = keyComparator(L, lk), cmpR = keyComparator(R, rk);
  const keyOfPair = (p) => (p[0] >= 0 ? lkeys[p[0]] : rkeys[p[1]]);
  pairs.sort((a, b) => {
    if (a[0] >= 0 && b[0] >= 0) return cmpL(a[0], b[0]) || a[0] - b[0];
    if (a[1] >= 0 && b[1] >= 0 && a[0] < 0 && b[0] < 0) return cmpR(a[1], b[1]);
    const ka = keyOfPair(a), kb = keyOfPair(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  const li = pairs.map((p) => p[0]), ri = pairs.map((p) => p[1]);
  let lvars = nv.has('LeftVariables') ? varIndex(L, nv.get('LeftVariables')) : L.props.names.map((_, i) => i);
  let rvars = nv.has('RightVariables') ? varIndex(R, nv.get('RightVariables')) : R.props.names.map((_, i) => i);
  if (merge) rvars = rvars.filter((i) => !rk.includes(i));
  const { lOut, rOut } = mergeNames(L, R, lvars, rvars, lk, rk, merge);
  const vars = [...lvars.map((j) => {
    const col = rowsGather(L.props.vars[j], li);
    const kpos = lk.indexOf(j);
    if (merge && kpos >= 0) {
      // fill missing keys from the right table
      const fromR = rowsGather(R.props.vars[rk[kpos]], ri);
      const missing = li.map((i, q) => (i < 0 ? q : -1)).filter((q) => q >= 0);
      if (missing.length) return assignAny(col, [{ type: '()', subs: [tensor('double', [missing.length, 1], missing.map((q) => q + 1)), COLON] }], rowsGather(fromR, missing), ctx);
    }
    return col;
  }), ...rvars.map((j) => rowsGather(R.props.vars[j], ri))];
  const out = makeTableObj(vars, [...lOut, ...rOut], { height: pairs.length });
  if (nargout >= 2) return [out, tensor('double', [li.length, 1], li.map((i) => i + 1)), tensor('double', [ri.length, 1], ri.map((i) => i + 1))].slice(0, nargout);
  return out;
}

// ------------------------------------------------------------- table methods (dispatched)

function sortrowsTable(args, nargout, ctx) {
  const T = args[0];
  let vars = null, dirs = [];
  for (let i = 1; i < args.length; i++) {
    const s = optArg(args[i]);
    if (s === 'ascend' || s === 'descend') dirs.push(s);
    else if (isCell(args[i]) && args[i].data.every((x) => ['ascend', 'descend'].includes(optArg(x)))) dirs = args[i].data.map((x) => optArg(x));
    else if (s === 'rownames' || (T.props.rowNames && s === T.props.dimNames[0].toLowerCase())) vars = ['rownames'];
    else if (isTensor(args[i]) && !isChar(args[i])) { const t = toTensor(args[i]).re; vars = Array.from(t, (x) => Math.abs(x) - 1); dirs = Array.from(t, (x) => (x < 0 ? 'descend' : 'ascend')); } else vars = varIndex(T, args[i]);
  }
  const n = T.dims[0];
  const idx = Array.from({ length: n }, (_, i) => i);
  if (vars && vars[0] === 'rownames') {
    const rn = T.props.rowNames;
    idx.sort((a, b) => (rn[a] < rn[b] ? -1 : rn[a] > rn[b] ? 1 : 0) * (dirs[0] === 'descend' ? -1 : 1) || a - b);
  } else if (!vars && isTT(T)) {
    const t = T.props.rowTimes.arr;
    idx.sort((a, b) => (t[a] - t[b]) * (dirs[0] === 'descend' ? -1 : 1) || a - b);
  } else {
    if (!vars) vars = T.props.names.map((_, i) => i);
    const cmps = vars.map((j) => keyComparator(T, [j]));
    idx.sort((a, b) => { for (let q = 0; q < vars.length; q++) { const c = cmps[q](a, b); if (c) return (dirs[Math.min(q, dirs.length - 1)] === 'descend' ? -1 : 1) * c; } return a - b; });
  }
  const out = tableRows(T, idx);
  return nargout >= 2 ? [out, tensor('double', [n, 1], idx.map((i) => i + 1))] : out;
}

function uniqueTable(args, nargout) {
  const T = args[0];
  const vars = T.props.names.map((_, i) => i);
  const groups = groupRows(T, vars);
  const out = tableRows(T, groups.map((g) => g[0]));
  if (nargout < 2) return out;
  const ic = new Float64Array(T.dims[0]);
  groups.forEach((g, q) => { for (const i of g) ic[i] = q + 1; });
  return [out, tensor('double', [groups.length, 1], groups.map((g) => g[0] + 1)), tensor('double', [ic.length, 1], ic)];
}

function headTail(isHead) {
  return (args) => {
    const T = args[0];
    const k = args.length > 1 ? toTensor(args[1]).re[0] : 8;
    const n = rowsOf(T);
    const m = Math.min(k, n);
    const idx = isHead ? Array.from({ length: m }, (_, i) => i) : Array.from({ length: m }, (_, i) => n - m + i);
    return rowsGather(T, idx);
  };
}

function summaryTable(args, nargout, ctx) {
  const T = args[0];
  const lines = [isTT(T) ? 'RowTimes:\n' : '', 'Variables:', ''];
  T.props.vars.forEach((v, j) => {
    const type = isCellstr(v) ? 'cell array of character vectors' : v.cls;
    lines.push(`    ${T.props.names[j]}: ${sizeStr(v.dims || [1, 1])} ${type}`);
    lines.push('');
    if ((isTensor(v) && !isChar(v) && v.cls !== 'logical') && v.re.length) {
      const vals = Array.from(toTensor(v).re).filter((x) => x === x).sort((a, b) => a - b);
      const med = vals.length ? (vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2) : NaN;
      lines.push('        Values:', '');
      lines.push(`            Min       ${inlineNumber(vals[0], v.cls)}`);
      lines.push(`            Median    ${inlineNumber(med, v.cls)}`);
      lines.push(`            Max       ${inlineNumber(vals[vals.length - 1], v.cls)}`);
      const nanCount = Array.from(toTensor(v).re).filter((x) => x !== x).length;
      if (nanCount) lines.push(`            NumMissing    ${nanCount}`);
      lines.push('');
    } else if (v.cls === 'logical') {
      const t = toTensor(v).re; const tr = Array.from(t).filter((x) => x).length;
      lines.push('        Values:', '', `            True     ${tr}`, `            False    ${t.length - tr}`, '');
    }
  });
  const text = lines.filter((l, i) => i > 0 || l).join('\n') + '\n';
  if (nargout >= 1) {
    const r = Object.create(null);
    T.props.vars.forEach((v, j) => { r[T.props.names[j]] = struct([1, 1], ['Size', 'Type'], [Object.assign(Object.create(null), { Size: tensor('double', [1, (v.dims || [1, 1]).length], v.dims || [1, 1]), Type: str(v.cls) })]); });
    return struct([1, 1], T.props.names.slice(), [r]);
  }
  ctx.out(text);
  return undefined;
}

const TABLE_METHODS = {
  sortrows: sortrowsTable,
  unique: uniqueTable,
  head: headTail(true),
  tail: headTail(false),
  height: (args) => num(args[0].dims[0]),
  width: (args) => num(args[0].dims[1]),
  summary: summaryTable,
  addvars: addvarsFn,
  removevars: removevarsFn,
  movevars: movevarsFn,
  renamevars: renamevarsFn,
  table2array: table2arrayFn,
  table2cell: table2cellFn,
  table2struct: table2structFn,
  join: joinFn,
  innerjoin: innerjoinFn,
  outerjoin: outerjoinFn,
  groupsummary: groupsummaryFn,
  findgroups: findgroupsFn,
  ismember(args, nargout, ctx) {
    const [A, B] = args;
    const vars = A.props.names.map((_, i) => i);
    const bk = rowKeys(B, B.props.names.map((n) => A.props.names.indexOf(n) >= 0 ? B.props.names.indexOf(n) : -1).filter((i) => i >= 0));
    const ak = rowKeys(A, vars);
    const tf = ak.map((k) => (bk.includes(k) ? 1 : 0));
    const TF = { cls: 'logical', dims: [ak.length, 1], re: Float64Array.from(tf), im: null };
    return nargout >= 2 ? [TF, tensor('double', [ak.length, 1], ak.map((k) => bk.indexOf(k) + 1))] : TF;
  },
  isempty: (args) => bool(args[0].dims[0] === 0 || args[0].dims[1] === 0),
  numel: (args) => num(args[0].dims[0] * args[0].dims[1]),
  length: (args) => num(args[0].dims[0] === 0 || args[0].dims[1] === 0 ? 0 : Math.max(args[0].dims[0], args[0].dims[1])),
  timetable2table(args) { const T = args[0]; const P = T.props; return makeTableObj([P.rowTimes, ...P.vars], [P.dimNames[0], ...P.names], { height: T.dims[0] }); },
};

// ------------------------------------------------------------- classes

function tableCat(k, items, ctx) {
  const tables = items.filter((v) => !(isTensor(v) && v.re.length === 0 && !isTable(v)));
  if (tables.length === 1) return tables[0];
  const first = tables[0];
  if (k === 0) {
    for (const t of tables) {
      if (!isTable(t)) throw E('base:table:vertcat:TableAndNonTable', 'All input arguments must be tables.');
      if (t.props.names.length !== first.props.names.length || !t.props.names.every((n) => first.props.names.includes(n))) throw E('base:table:vertcat:UnequalVarNames', 'All tables being vertically concatenated must have the same variable names.');
    }
    const vars = first.props.names.map((n) => catValues(0, tables.map((t) => t.props.vars[t.props.names.indexOf(n)]), ctx));
    const rowNames = first.props.rowNames ? tables.flatMap((t) => t.props.rowNames || []) : null;
    const rowTimes = first.props.rowTimes ? catValues(0, tables.map((t) => t.props.rowTimes), ctx) : null;
    return withVars(first, vars, first.props.names, { rowNames, rowTimes, height: tables.reduce((a, t) => a + t.dims[0], 0) });
  }
  if (k === 1) {
    let vars = [], names = [];
    for (const t of tables) {
      if (isTable(t)) { vars.push(...t.props.vars); names.push(...t.props.names); } else if (isCell(t)) { throw E('base:table:horzcat:CellInput', 'Concatenating a table with a cell array is not supported.'); } else { vars.push(t); names.push(`Var${names.length + 1}`); }
    }
    return withVars(first, vars, names);
  }
  throw E('base:table:cat:InvalidDim', 'Tables can only be concatenated along the first or second dimension.');
}

function makeClass(cls) {
  return {
    props: ['Properties'],
    construct: (args, ctx) => (cls === 'table' ? tableFn(args, 1, ctx) : timetableFn(args, 1, ctx)),
    methods: TABLE_METHODS,
    subsref: tableSubsref,
    subsasgn: tableSubsasgn,
    cat: tableCat,
    display: tableDisplay,
    size: (T) => T.dims,
    inlineText: (T) => null,
  };
}

export const classes = { table: makeClass('table'), timetable: makeClass('timetable') };

export const builtins = {
  table: tableFn,
  timetable: timetableFn,
  array2table: array2tableFn,
  cell2table: cell2tableFn,
  struct2table: struct2tableFn,
  table2array: (args, n, ctx) => table2arrayFn(args, n, ctx),
  table2cell: (args) => table2cellFn(args),
  table2struct: (args) => table2structFn(args),
  table2timetable(args) {
    const T = args[0];
    let ti = -1;
    for (let i = 1; i + 1 < args.length; i += 2) if (optArg(args[i]) === 'rowtimes') { const v = args[i + 1]; ti = textArg(v) !== null ? T.props.names.indexOf(textArg(v)) : -2; if (ti === -2) return makeTableObj(T.props.vars, T.props.names, { rowTimes: v }); }
    if (ti < 0) ti = T.props.vars.findIndex((v) => v.isObject && (v.cls === 'datetime' || v.cls === 'duration'));
    if (ti < 0) throw E('base:table2timetable:NoTimeVarFound', 'Input table must contain datetime or duration row times.');
    return makeTableObj(T.props.vars.filter((_, i) => i !== ti), T.props.names.filter((_, i) => i !== ti), { rowTimes: T.props.vars[ti], dimNames: [T.props.names[ti], 'Variables'] });
  },
  timetable2table: (args) => TABLE_METHODS.timetable2table(args),
  array2timetable(args) {
    const A = args[0];
    const nv = nvMap(args, 1, ['RowTimes', 'VariableNames', 'SampleRate', 'TimeStep', 'StartTime']);
    const T = array2tableFn([A, ...(nv.has('VariableNames') ? [str('VariableNames'), nv.get('VariableNames')] : [])]);
    const extra = [];
    for (const k of ['RowTimes', 'SampleRate', 'TimeStep', 'StartTime']) if (nv.has(k)) extra.push(str(k), nv.get(k));
    return timetableFn([...T.props.vars, str('VariableNames'), cell([1, T.props.names.length], T.props.names.map((s) => str(s))), ...extra], 1, null);
  },
  istable: (args) => bool(args[0] && args[0].isObject && args[0].cls === 'table'),
  istimetable: (args) => bool(isTT(args[0])),
  istabular: (args) => bool(isTable(args[0])),
  height: (args) => num(rowsOf(args[0])),
  width: (args) => num(isTable(args[0]) ? args[0].dims[1] : (args[0].dims || [1, 1])[1]),
  head: headTail(true),
  tail: headTail(false),
  addvars: addvarsFn,
  removevars: removevarsFn,
  movevars: movevarsFn,
  renamevars: renamevarsFn,
  join: joinFn,
  innerjoin: innerjoinFn,
  outerjoin: outerjoinFn,
  groupsummary: groupsummaryFn,
  varfun: varfunFn,
  rowfun: rowfunFn,
  findgroups: findgroupsFn,
  splitapply: splitapplyFn,
  summary(args, nargout, ctx) {
    if (isTable(args[0])) return summaryTable(args, nargout, ctx);
    const v = args[0];
    const t = toTensor(v);
    const vals = Array.from(t.re).filter((x) => x === x).sort((a, b) => a - b);
    ctx.out(`    ${sizeStr(v.dims)} ${v.cls}\n\n        Min      ${inlineNumber(vals[0], v.cls)}\n        Max      ${inlineNumber(vals[vals.length - 1], v.cls)}\n`);
    return undefined;
  },
  vartype(args) { return { cls: 'vartype', isObject: true, handle: false, dims: [1, 1], props: { type: textArg(args[0]) } }; },
  timerange(args, nargout, ctx) {
    const conv = (v) => (v.isObject ? v.arr[0] : ctx.call('datetime', [v], 1)[0].arr[0]);
    const kind = args.length > 2 ? optArg(args[2]) : 'openright';
    return { cls: 'timerange', isObject: true, handle: false, dims: [1, 1], props: { start: conv(args[0]), end: conv(args[1]), closedRight: kind === 'closed' || kind === 'openleft' } };
  },
};

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const help = {
  table: H('Table array with named variables of possibly different types.', '서로 다른 형식의 이름 있는 변수로 된 테이블.', ['T = table(var1, ..., varN)', "T = table(..., 'VariableNames', names)", "T = table(..., 'RowNames', rowNames)", "T = table('Size', sz, 'VariableTypes', types)"]),
  timetable: H('Timetable: a table with time-stamped rows.', '타임테이블: 시간이 붙은 행으로 된 테이블.', ['TT = timetable(rowTimes, var1, ..., varN)', "TT = timetable(var1, ..., 'RowTimes', rowTimes)", "TT = timetable(var1, ..., 'SampleRate', Fs)"]),
  array2table: H('Convert a homogeneous array to a table.', '동질 배열을 테이블로 변환.', ['T = array2table(A)', "T = array2table(A, 'VariableNames', names)"]),
  cell2table: H('Convert a cell array to a table.', '셀형 배열을 테이블로 변환.', ['T = cell2table(C)', "T = cell2table(C, 'VariableNames', names)"]),
  struct2table: H('Convert a structure array to a table.', '구조체 배열을 테이블로 변환.', ['T = struct2table(S)', "T = struct2table(S, 'AsArray', true)"]),
  table2array: H('Convert a table to a homogeneous array.', '테이블을 동질 배열로 변환.', ['A = table2array(T)']),
  table2cell: H('Convert a table to a cell array.', '테이블을 셀형 배열로 변환.', ['C = table2cell(T)']),
  table2struct: H('Convert a table to a structure array.', '테이블을 구조체 배열로 변환.', ['S = table2struct(T)', "S = table2struct(T, 'ToScalar', true)"]),
  table2timetable: H('Convert a table to a timetable.', '테이블을 타임테이블로 변환.', ['TT = table2timetable(T)', "TT = table2timetable(T, 'RowTimes', rowTimes)"]),
  timetable2table: H('Convert a timetable to a table.', '타임테이블을 테이블로 변환.', ['T = timetable2table(TT)']),
  array2timetable: H('Convert an array to a timetable.', '배열을 타임테이블로 변환.', ["TT = array2timetable(X, 'RowTimes', rowTimes)"]),
  istable: H('True for tables.', '테이블이면 참.', ['tf = istable(T)']),
  istimetable: H('True for timetables.', '타임테이블이면 참.', ['tf = istimetable(T)']),
  istabular: H('True for tables and timetables.', '테이블 또는 타임테이블이면 참.', ['tf = istabular(T)']),
  height: H('Number of table rows.', '테이블 행 수.', ['H = height(T)']),
  width: H('Number of table variables.', '테이블 변수 수.', ['W = width(T)']),
  head: H('First rows of a table or array.', '테이블이나 배열의 처음 행.', ['B = head(A)', 'B = head(A, k)']),
  tail: H('Last rows of a table or array.', '테이블이나 배열의 마지막 행.', ['B = tail(A)', 'B = tail(A, k)']),
  addvars: H('Add variables to a table.', '테이블에 변수 추가.', ['T2 = addvars(T1, var1, ..., varN)', "T2 = addvars(..., 'Before', location)", "T2 = addvars(..., 'NewVariableNames', names)"]),
  removevars: H('Delete variables from a table.', '테이블에서 변수 삭제.', ['T2 = removevars(T1, vars)']),
  movevars: H('Move variables in a table.', '테이블의 변수 이동.', ["T2 = movevars(T1, vars, 'After', location)"]),
  renamevars: H('Rename variables in a table.', '테이블의 변수 이름 변경.', ['T2 = renamevars(T1, vars, newNames)']),
  join: H('Combine two tables using key variables.', '키 변수로 두 테이블 결합.', ['T = join(Tleft, Tright)', "T = join(Tleft, Tright, 'Keys', keys)"]),
  innerjoin: H('Inner join between two tables.', '두 테이블의 내부 조인.', ['T = innerjoin(Tleft, Tright)', '[T, ileft, iright] = innerjoin(...)']),
  outerjoin: H('Outer join between two tables.', '두 테이블의 외부 조인.', ['T = outerjoin(Tleft, Tright)', "T = outerjoin(..., 'MergeKeys', true, 'Type', 'left')"]),
  groupsummary: H('Group summary computations.', '그룹 요약 계산.', ['G = groupsummary(T, groupvars)', 'G = groupsummary(T, groupvars, method)', 'G = groupsummary(T, groupvars, method, datavars)']),
  varfun: H('Apply a function to table variables.', '테이블 변수에 함수 적용.', ['B = varfun(func, A)', "B = varfun(func, A, 'GroupingVariables', g)", "B = varfun(..., 'OutputFormat', 'uniform')"]),
  rowfun: H('Apply a function to table rows.', '테이블 행에 함수 적용.', ['B = rowfun(func, A)', "B = rowfun(..., 'OutputVariableNames', names)"]),
  findgroups: H('Find groups and return group numbers.', '그룹 찾기 및 그룹 번호 반환.', ['G = findgroups(A)', '[G, ID] = findgroups(A)', '[G, ID1, ..., IDN] = findgroups(A1, ..., AN)']),
  splitapply: H('Split data into groups and apply a function.', '데이터를 그룹으로 나누어 함수 적용.', ['Y = splitapply(func, X, G)', 'Y = splitapply(func, X1, ..., XN, G)']),
  summary: H('Print a summary of a table or array.', '테이블이나 배열의 요약 출력.', ['summary(T)', 's = summary(T)']),
  vartype: H('Subscript into a table by variable type.', '변수 형식으로 테이블 첨자 지정.', ["S = vartype('numeric')"]),
  timerange: H('Time range for timetable row subscripting.', '타임테이블 행 첨자용 시간 범위.', ['S = timerange(startTime, endTime)', "S = timerange(startTime, endTime, 'closed')"]),
};
void MError; void SETS; void DATAFUN; void normDims; void isObject;
