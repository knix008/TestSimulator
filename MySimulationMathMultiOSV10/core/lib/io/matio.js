// Workspace files: load / save (MAT Level 5 with compression, ASCII), the
// matfile object, and __whos_file__ (used by `whos -file` / `who -file`).
import {
  E, S, str, num, bool, tensor, isTextArg, isStruct, isTensor, isCell, isSparse, isString, absPath, fsExists, baseName,
  extName, readFileBytes, writeFileBytes, structScalar, structArray, globRegExp, cellCol, strList, bytesToText,
} from './util.js';
import { readMat5, writeMat5, matHeaderInfo, valueBytes } from '../../compat/mat5.js';
import { struct, object, isObject, toStr } from '../../value.js';

export const DEFAULT_MAT_FILE = 'workspace.mat';

/** Names of the variables of the caller workspace (interpreter hooks). */
function workspaceNames(ctx) {
  try { if (typeof ctx.listVars === 'function') return ctx.listVars('caller'); } catch { /* fall through */ }
  try { if (ctx.session && ctx.session.listVariables) return ctx.session.listVariables().map((v) => v.name); } catch { /* ignore */ }
  return [];
}

function resolveMatFile(ctx, name) {
  let p = absPath(ctx, name);
  if (!fsExists(ctx, p) && !extName(p)) p += '.mat';
  return p;
}

/** Matches variable names against patterns (wildcards) or regular expressions. */
function nameFilter(patterns, regexp) {
  if (!patterns.length) return () => true;
  const res = patterns.map((p) => (regexp ? new RegExp(p) : globRegExp(p)));
  return (n) => res.some((r) => r.test(n));
}

// ---------------------------------------------------------------- ASCII data

function parseAsciiMatrix(text, file) {
  const rows = [];
  for (const line0 of text.split(/\r\n|\n|\r/)) {
    const line = line0.replace(/%.*$/, '').trim();
    if (!line) continue;
    const parts = line.split(/[\s,]+/).filter(Boolean);
    const vals = parts.map((s) => { const v = Number(s.replace(/^\+/, '')); if (Number.isNaN(v) && !/^[+-]?nan$/i.test(s)) { const lv = s.toLowerCase(); if (lv === 'inf' || lv === '+inf') return Infinity; if (lv === '-inf') return -Infinity; throw E('io:load:unableToReadAscii', `Unable to read file '${file}'. Input must be a MAT-file or an ASCII file containing numeric data with the same number of columns in each row.`); } return v; });
    rows.push(vals);
  }
  const n = rows.length ? rows[0].length : 0;
  if (rows.some((r) => r.length !== n)) throw E('io:load:unableToReadAscii', `Unable to read file '${file}'. Number of columns on each line must be the same.`);
  const t = tensor('double', [rows.length, n]);
  rows.forEach((r, i) => r.forEach((x, j) => { t.re[i + j * rows.length] = x; }));
  return t;
}

export function validVarName(s) {
  let n = String(s).replace(/[^A-Za-z0-9_]/g, '_');
  if (!/^[A-Za-z]/.test(n)) n = 'X' + n;
  return n.slice(0, 63);
}

function formatAscii(v, double, tabs) {
  const t = isSparse(v) ? null : v;
  if (!t || !isTensor(t) || t.dims.length > 2) throw E('io:save:asciiData', 'Only numeric, logical and char 2-D arrays can be saved with -ascii.');
  const [m, n] = t.dims;
  const sep = tabs ? '\t' : '   ';
  const fmt = (x) => {
    if (Number.isNaN(x)) return 'NaN';
    if (!Number.isFinite(x)) return x > 0 ? 'Inf' : '-Inf';
    const s = x.toExponential(double ? 16 : 7).replace(/e([+-])(\d)$/, 'e$10$2');
    return (x >= 0 ? ' ' : '') + s;
  };
  let out = '';
  for (let i = 0; i < m; i++) {
    const row = [];
    for (let j = 0; j < n; j++) row.push(fmt(t.re[i + j * m]));
    out += (tabs ? '' : '  ') + row.join(sep) + '\n';
  }
  return out;
}

// ---------------------------------------------------------------- load

/** Reads all variables of a file → [{name, value, global}] (MAT or ASCII). */
export function readVarsFromFile(ctx, file, opts = {}) {
  const p = resolveMatFile(ctx, file);
  const bytes = readFileBytes(ctx, p, 'io:load:couldNotReadFile');
  const info = matHeaderInfo(bytes);
  if (opts.ascii === false || (info.kind && !opts.ascii)) {
    return readMat5(bytes, { only: opts.only, warn: (m) => ctx.warning('io:load:skipped', m) });
  }
  if (opts.mat) throw E('io:load:notMatFile', `File '${file}' is not a MAT-file.`);
  const value = parseAsciiMatrix(bytesToText(bytes), file);
  const name = validVarName(baseName(p).replace(/\.[^.]*$/, ''));
  return [{ name, value, global: false, ascii: true }];
}

function load(args, nargout, ctx) {
  let file = null;
  const patterns = [];
  let ascii = null, mat = false, regexp = false;
  for (const a of args) {
    const s = S(a);
    const l = s.toLowerCase();
    if (l === '-ascii') ascii = true;
    else if (l === '-mat') { mat = true; ascii = false; }
    else if (l === '-regexp') regexp = true;
    else if (file === null && !(s.startsWith('-'))) file = s;
    else patterns.push(s);
  }
  if (file === null) file = DEFAULT_MAT_FILE;
  if (ascii === null && !mat) {
    const ext = extName(file);
    if (ext && ext !== '.mat') {
      const bytes = readFileBytes(ctx, absPath(ctx, file), 'io:load:couldNotReadFile');
      ascii = !matHeaderInfo(bytes).kind;
    }
  }
  const keep = nameFilter(patterns, regexp);
  const vars = readVarsFromFile(ctx, file, { ascii: ascii === true, mat, only: keep });
  if (ascii === true && vars.length === 1 && vars[0].ascii) {
    if (nargout > 0) return vars[0].value;
    ctx.setVar(vars[0].name, vars[0].value, 'caller');
    return undefined;
  }
  for (const p of patterns) {
    if (!regexp && !/[*?]/.test(p) && !vars.some((v) => v.name === p)) ctx.warning('io:load:variableNotFound', `Variable '${p}' not found.`);
  }
  if (nargout > 0) {
    const o = {};
    for (const v of vars) o[v.name] = v.value;
    return structScalar(o);
  }
  for (const v of vars) {
    ctx.setVar(v.name, v.value, 'caller');
    if (v.global && typeof ctx.declareGlobal === 'function') { try { ctx.declareGlobal(v.name); } catch { /* ignore */ } }
  }
  return undefined;
}

// ---------------------------------------------------------------- save

export function writeVarsToFile(ctx, file, vars, opts = {}) {
  const p = absPath(ctx, file);
  let list = vars;
  if (opts.append && fsExists(ctx, p)) {
    const old = readMat5(readFileBytes(ctx, p), { warn: (m) => ctx.warning('io:save:skipped', m) });
    const names = new Set(vars.map((v) => v.name));
    list = [...old.filter((v) => !names.has(v.name)), ...vars];
  }
  const bytes = writeMat5(list, { compress: opts.compress !== false, warn: (m) => ctx.warning('io:save:unsupportedType', m) });
  writeFileBytes(ctx, p, bytes);
}

function save(args, nargout, ctx) {
  let file = null;
  const names = [];
  let ascii = false, dbl = false, tabs = false, append = false, compress = true, regexp = false, structName = null;
  const structFields = [];
  let inStruct = false;
  for (const a of args) {
    if (!isTextArg(a)) throw E('io:save:badArgument', 'Arguments must be text (file name, variable names or options).');
    const s = S(a);
    const l = s.toLowerCase();
    if (l.startsWith('-')) {
      inStruct = false;
      if (l === '-ascii') ascii = true;
      else if (l === '-double') dbl = true;
      else if (l === '-tabs') tabs = true;
      else if (l === '-append') append = true;
      else if (l === '-mat' || l === '-v7') { /* default */ } else if (l === '-v6' || l === '-v4' || l === '-nocompression') compress = false;
      else if (l === '-v7.3') ctx.warning('io:save:v73', 'Version 7.3 (HDF5) files are not written; a version 7 MAT-file is saved instead.');
      else if (l === '-regexp') regexp = true;
      else if (l === '-struct') inStruct = true;
      else throw E('io:save:badOption', `Unknown option '${s}'.`);
      continue;
    }
    if (file === null) { file = s; continue; }
    if (inStruct && structName === null) { structName = s; continue; }
    if (inStruct) structFields.push(s); else names.push(s);
  }
  if (file === null) file = DEFAULT_MAT_FILE;
  if (!ascii && !extName(file)) file += '.mat';
  let vars = [];
  if (structName !== null) {
    const s = ctx.getVar(structName, 'caller');
    if (!s) throw E('io:save:variableNotFound', `Variable '${structName}' not found.`);
    if (!isStruct(s) || s.data.length !== 1) throw E('io:save:structNotScalar', `The argument to -struct must be the name of a scalar structure variable.`);
    const keep = nameFilter(structFields, regexp);
    for (const f of s.fields) if (keep(f)) vars.push({ name: f, value: s.data[0][f] });
    for (const f of structFields) if (!regexp && !/[*?]/.test(f) && !s.fields.includes(f)) throw E('io:save:fieldNotFound', `Field '${f}' not found.`);
  } else {
    const all = workspaceNames(ctx);
    let wanted;
    if (!names.length) wanted = all;
    else {
      wanted = [];
      for (const n of names) {
        if (regexp || /[*?]/.test(n)) { const re = regexp ? new RegExp(n) : globRegExp(n); for (const a of all) if (re.test(a) && !wanted.includes(a)) wanted.push(a); } else wanted.push(n);
      }
    }
    for (const n of wanted) {
      const v = ctx.getVar(n, 'caller');
      if (v === undefined || v === null) throw E('io:save:variableNotFound', `Variable '${n}' not found.`);
      vars.push({ name: n, value: v, global: typeof ctx.isGlobal === 'function' ? !!ctx.isGlobal(n) : false });
    }
  }
  if (ascii) {
    let text = '';
    for (const v of vars) {
      if (isTensor(v.value) && v.value.cls === 'char') text += formatAscii({ ...v.value, cls: 'double' }, dbl, tabs);
      else text += formatAscii(v.value, dbl, tabs);
    }
    const p = absPath(ctx, file);
    if (append && fsExists(ctx, p)) ctx.fs.appendText(p, text); else ctx.fs.writeText(p, text);
    return undefined;
  }
  writeVarsToFile(ctx, file, vars, { append, compress });
  return undefined;
}

// ---------------------------------------------------------------- whos -file

function sizeOfValue(v) { return v.dims ? v.dims : [1, 1]; }

function whosFile(args, nargout, ctx) {
  if (!args.length) throw E('io:whos:notEnoughInputs', 'Not enough input arguments.');
  const file = S(args[0]);
  const pats = args.slice(1).map((a) => S(a));
  const vars = readVarsFromFile(ctx, file, { ascii: false, only: nameFilter(pats, false) });
  return structArray(vars.map((v) => ({
    name: str(v.name), size: tensor('double', [1, sizeOfValue(v.value).length], sizeOfValue(v.value)), bytes: num(valueBytes(v.value)),
    class: str(v.value.cls), global: bool(!!v.global), sparse: bool(isSparse(v.value)), complex: bool(!!v.value.im),
    nesting: structScalar({ function: str(''), level: num(1) }), persistent: bool(false),
  })), ['name', 'size', 'bytes', 'class', 'global', 'sparse', 'complex', 'nesting', 'persistent']);
}

// ---------------------------------------------------------------- matfile

function mfState(obj) { return obj.props; }
function subsName(s) { return Array.isArray(s.subs) ? toStr(s.subs[0]) : typeof s.subs === 'string' ? s.subs : toStr(s.subs); }
function substructValue(subs) {
  return structArray(subs.map((s) => ({
    type: str(s.type),
    subs: s.type === '.' ? str(typeof s.subs === 'string' ? s.subs : subsName(s)) : { cls: 'cell', dims: [1, (s.subs || []).length], data: (s.subs || []).map((x) => (typeof x === 'string' ? str(x) : x)) },
  })), ['type', 'subs'], [1, subs.length]);
}

function matfileVars(ctx, st) {
  if (!fsExists(ctx, st.path)) return [];
  return readMat5(readFileBytes(ctx, st.path), { warn: (m) => ctx.warning('io:matfile:skipped', m) });
}

function matfile(args, nargout, ctx) {
  if (!args.length) throw E('io:matfile:notEnoughInputs', 'Not enough input arguments.');
  let file = S(args[0], 'File name');
  if (!extName(file)) file += '.mat';
  const path = absPath(ctx, file);
  let writable = !fsExists(ctx, path);
  for (let i = 1; i + 1 < args.length; i += 2) {
    if (S(args[i]).toLowerCase() === 'writable') writable = !!args[i + 1].re?.[0];
  }
  return object('MatFile', { path, writable }, { handle: true });
}

const MATFILE_CLASS = {
  handle: true,
  props: ['Properties'],
  construct(args, ctx) { return matfile(args, 1, ctx); },
  subsref(obj, subs, nargout, ctx) {
    const st = mfState(obj);
    if (!subs.length || subs[0].type !== '.') throw E('io:matfile:badIndex', "Use m.varName to read a variable from a MAT-file object.");
    const name = subsName(subs[0]);
    let v;
    if (name === 'Properties') v = structScalar({ Source: str(st.path), Writable: bool(st.writable) });
    else {
      const found = matfileVars(ctx, st).find((x) => x.name === name);
      if (!found) throw E('io:matfile:variableNotFound', `Variable '${name}' not found in '${st.path}'.`);
      v = found.value;
    }
    if (subs.length > 1) return ctx.call('subsref', [v, substructValue(subs.slice(1))], nargout || 1);
    return [v];
  },
  subsasgn(obj, subs, rhs, ctx) {
    const st = mfState(obj);
    if (!subs.length || subs[0].type !== '.') throw E('io:matfile:badIndex', 'Use m.varName = value to write a variable.');
    const name = subsName(subs[0]);
    if (name === 'Properties' && subs.length === 3 && subsName(subs[1]) === 'Writable') { st.writable = !!rhs.re?.[0]; return obj; }
    if (!st.writable) throw E('io:matfile:notWritable', "The MAT-file object is read-only. Use matfile(filename, 'Writable', true).");
    let v = rhs;
    if (subs.length > 1) {
      const cur = matfileVars(ctx, st).find((x) => x.name === name);
      v = ctx.call('subsasgn', [cur ? cur.value : tensor('double', [0, 0]), substructValue(subs.slice(1)), rhs], 1)[0];
    }
    writeVarsToFile(ctx, st.path, [{ name, value: v }], { append: true });
    return obj;
  },
  methods: {
    who(args, nargout, ctx) { return cellCol(matfileVars(ctx, mfState(args[0])).map((v) => str(v.name))); },
    whos(args, nargout, ctx) { return whosFile([str(mfState(args[0]).path)], 1, ctx); },
  },
  display(obj, name, ctx) {
    const st = mfState(obj);
    const names = matfileVars(ctx, st).map((v) => `${v.name}: [${v.value.dims ? v.value.dims.join('x') : '1x1'} ${v.value.cls}]`);
    return `${name} = \n  MAT-file object with properties:\n\n    Properties.Source: '${st.path}'\n    Properties.Writable: ${st.writable ? 'true' : 'false'}\n${names.map((s) => '    ' + s).join('\n')}\n`;
  },
};

export const classes = { MatFile: MATFILE_CLASS };

export const builtins = { load, save, matfile, __whos_file__: whosFile };

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const help = {
  load: H('Load variables from a file into the workspace.', '파일의 변수를 작업 공간으로 불러옵니다.', ['load(filename)', 'load(filename, variables)', "load(filename, '-ascii')", "load(filename, '-mat')", 'S = load(___)', 'load filename var1 var2']),
  save: H('Save workspace variables to a file.', '작업 공간 변수를 파일에 저장합니다.', ['save(filename)', 'save(filename, variables)', "save(filename, variables, '-append')", "save(filename, '-struct', structName, fieldNames)", "save(filename, variables, '-ascii', '-double', '-tabs')", "save(filename, variables, '-v6')", 'save filename var1 var2']),
  matfile: H('Access variables in a MAT-file without loading the whole file.', 'MAT 파일 전체를 불러오지 않고 변수에 접근합니다.', ['m = matfile(filename)', "m = matfile(filename, 'Writable', true)", 'x = m.varName', 'm.varName = value']),
  __whos_file__: H('Internal: variables in a MAT-file (used by whos -file).', '내부용: MAT 파일 안의 변수 정보 (whos -file 에서 사용).', ['S = __whos_file__(filename)', 'S = __whos_file__(filename, var1, ...)']),
};


