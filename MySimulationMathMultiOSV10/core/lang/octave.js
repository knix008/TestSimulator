// Octave language and interpreter functions: evaluation with captured output,
// error state, settings (debug_on_error, max_recursion_depth …), the load path,
// help text, history, debugger navigation, the %!test / %!demo framework,
// publishing, memoization and other session functions. Merged into the
// language builtins by builtins.js, which also hands over its helpers (useHelpers).
import {
  MError, str, num, bool, cell, struct, structOf, toStr, isText, isTensor, isCell, isStruct, isString,
  isObject, toNum, tensor, prod, isFuncHandle, NUMERIC_CLASSES,
} from '../value.js';
import { parseExpr } from './parser.js';
import { KEYWORDS, isOctaveSource } from './lexer.js';
import { joinPath, dirName, baseName, normPath, Workspace, Frame, helpComment } from './interp.js';
import { disown } from './indexing.js';
import { handleText } from './display.js';
import { M_EXT, isMFile, stripMExt } from './mext.js';

// helpers of builtins.js, handed over by useHelpers() (no import cycle between the two modules)
let absPath, fileFor, textArg, helpFor;
export function useHelpers(h) { ({ absPath, fileFor, textArg, helpFor } = h); }

const S = (v, what) => toStr(v, what);
const cellCol = (items) => cell([items.length, 1], items);
const cellOfStr = (arr) => cellCol(arr.map((s) => str(s)));
const pathSep = (rt) => (rt.path.some((p) => /^[A-Za-z]:/.test(p)) ? ';' : ':');
const isAbs = (p) => p.startsWith('/') || /^[A-Za-z]:/.test(p);

/** Runs fn while collecting everything written to the Command Window. */
function capture(rt, fn) {
  const savedPrint = rt.printFn;
  const savedDiary = rt.diary;
  let buf = '';
  rt.printFn = (t, stream) => { if (stream === 'echo') savedPrint(t, stream); else buf += t; };
  rt.diary = null;
  try { fn(); } finally { rt.printFn = savedPrint; rt.diary = savedDiary; }
  return buf;
}

/** Runs code in a fresh function-like workspace (tests, demos, speed); returns the workspace. */
/** octave: the code comes from an Octave file (its dialect, see lexer.js isOctaveSource). */
function runIsolated(rt, code, vars, file, name, octave = false) {
  const ws = new Workspace(null, null);
  for (const [k, v] of Object.entries(vars || {})) ws.vars[k] = disown(v);
  const frame = new Frame(ws, null, file || null, name || 'test', 'function');
  const depth = rt.stack.length;
  rt.stack.push(frame);
  try { rt.evalIn(frame, code, false, 0, { octave }); } finally { rt.stack.length = depth; }
  return ws;
}

// ------------------------------------------------------------------ class precedence
/** superiorto / inferiorto: the class whose code is running (classdef method or @folder function). */
function callingClass(rt) {
  const fr = rt.currentFrame();
  const fi = fr && fr.fi;
  if (fi && fi.classInfo) return fi.classInfo.name;
  const file = (fi && fi.file) || (fr && fr.file) || '';
  const m = /(?:^|\/)@([^/]+)\/[^/]+$/.exec(String(file).replace(/\\/g, '/'));
  return m ? m[1] : null;
}
function classPrecedence(rt, args, fn) {
  const me = callingClass(rt);
  if (!me) throw new MError(`core:${fn}:notInClass`, `${fn}: invalid call outside a class constructor or method.`);
  if (!args.length) throw new MError(`core:${fn}:minrhs`, `${fn}: at least one class name is required.`);
  for (const a of args) {
    const names = isCell(a) ? a.data.map((x) => S(x)) : isString(a) ? a.data.map((x) => String(x ?? '')) : [S(a, fn)];
    for (const other of names) {
      if (!other) throw new MError(`core:${fn}:badName`, `${fn}: class names must be non-empty text.`);
      if (fn === 'superiorto') { if (!rt.isSuperiorClass(me, other)) rt.setClassPrecedence(me, other); } else if (!rt.isSuperiorClass(other, me)) rt.setClassPrecedence(other, me);
    }
  }
}

// ------------------------------------------------------------------ settings
// Octave's internal-variable functions: old = f(), old = f(new), f(new, "local")
// ("local" restores the old value when the calling function returns).
function setting(name, get, set, check) {
  return (args, nargout, ctx) => {
    const rt = ctx.interp;
    const old = get(rt);
    if (args.length) {
      const value = check(args[0], name);
      if (args.length > 1) {
        if (!isText(args[1]) || S(args[1]) !== 'local') throw new MError(`core:${name}:badOption`, `${name}: the second argument must be "local".`);
        const ws = rt.currentWs();
        if (ws === rt.base) throw new MError(`core:${name}:local`, `${name}: "local" is only valid inside a function.`);
        (ws.onExit || (ws.onExit = [])).push(() => set(rt, old));
      }
      set(rt, value);
      return nargout > 0 ? toValue(old) : [];
    }
    return toValue(old);
  };
}
const toValue = (x) => (typeof x === 'boolean' ? bool(x) : typeof x === 'number' ? num(x) : str(String(x)));
const logicalArg = (v, name) => {
  if (!v || !(isTensor(v)) || prod(v.dims) !== 1 || v.cls === 'char') throw new MError(`core:${name}:badValue`, `${name}: the value must be a logical scalar.`);
  return v.re[0] !== 0;
};
const countArg = (v, name) => {
  const x = isTensor(v) && v.cls !== 'char' && prod(v.dims) === 1 ? v.re[0] : NaN;
  if (!(x >= 0) || x !== Math.floor(x)) throw new MError(`core:${name}:badValue`, `${name}: the value must be a non-negative integer.`);
  return x;
};
const textValue = (v, name) => textArg(v, name);
const encodingArg = (v, name) => {
  const e = textArg(v, name).toLowerCase();
  if (e === 'utf-8' || e === 'utf8' || e === 'system') return e === 'utf8' ? 'utf-8' : e;
  if (typeof TextDecoder !== 'undefined') { try { new TextDecoder(e); return e; } catch { /* unknown */ } }
  throw new MError(`core:${name}:badEncoding`, `${name}: conversion from codepage '${e}' is not supported.`);
};

// ------------------------------------------------------------------ assert comparison (Octave form)
function valueText(v) {
  if (v === undefined) return 'O(0x0)';
  if (isTensor(v) && prod(v.dims) === 1 && v.cls !== 'char') {
    const x = v.re[0], y = v.im ? v.im[0] : 0;
    const f = (z) => (Number.isInteger(z) ? String(z) : Number.isNaN(z) ? 'NaN' : !Number.isFinite(z) ? (z > 0 ? 'Inf' : '-Inf') : String(+z.toPrecision(5)));
    return y ? `${f(x)}${y < 0 ? '-' : '+'}${f(Math.abs(y))}i` : f(x);
  }
  return `O(${(v.dims || [1, 1]).join('x')})`;
}

/** Mismatches of observed vs expected: [{ loc, obs, exp, why }] (empty when they agree). */
export function compareValues(rt, obs, exp, tol, loc = '()') {
  const out = [];
  const add = (why, o = valueText(obs), e = valueText(exp)) => out.push({ loc, obs: o, exp: e, why });
  if (isText(exp) && isTensor(exp)) {
    if (!(isTensor(obs) && obs.cls === 'char')) add('Expected string, but observed ' + (obs ? obs.cls : 'nothing'), '', `'${toStr(exp)}'`);
    else if (obs.dims.join('x') !== exp.dims.join('x') || obs.re.some((c, i) => c !== exp.re[i])) add("Strings don't match", `'${toStr(obs)}'`, `'${toStr(exp)}'`);
    return out;
  }
  if (isCell(exp)) {
    if (!isCell(obs)) { add(`Expected cell, but observed ${obs ? obs.cls : 'nothing'}`); return out; }
    if (obs.dims.join('x') !== exp.dims.join('x')) { add('Dimensions don\'t match', `O(${obs.dims.join('x')})`, `E(${exp.dims.join('x')})`); return out; }
    exp.data.forEach((e, i) => out.push(...compareValues(rt, obs.data[i], e, tol, `{${i + 1}}`)));
    return out;
  }
  if (isStruct(exp)) {
    if (!isStruct(obs)) { add(`Expected struct, but observed ${obs ? obs.cls : 'nothing'}`); return out; }
    if (obs.dims.join('x') !== exp.dims.join('x')) { add('Structure sizes don\'t match', `O(${obs.dims.join('x')})`, `E(${exp.dims.join('x')})`); return out; }
    const fo = [...obs.fields].sort().join(','), fe = [...exp.fields].sort().join(',');
    if (fo !== fe) { add('Structure fieldname mismatch', fo, fe); return out; }
    exp.data.forEach((r, i) => { for (const f of exp.fields) out.push(...compareValues(rt, obs.data[i][f], r[f], tol, `(${i + 1}).${f}`)); });
    return out;
  }
  const numericLike = (v) => v && (isTensor(v) || v.sparse) && v.cls !== 'char';
  if (numericLike(exp)) {
    if (!numericLike(obs)) { add(`Expected ${exp.cls}, but observed ${obs ? obs.cls : 'nothing'}`); return out; }
    if (obs.dims.join('x') !== exp.dims.join('x')) { add('Dimensions don\'t match', `O(${obs.dims.join('x')})`, `E(${exp.dims.join('x')})`); return out; }
    if (obs.cls !== exp.cls) { add(`Class ${obs.cls} != ${exp.cls}`, obs.cls, exp.cls); return out; }
    const full = (v) => (v.sparse ? rt.callBuiltinFn('full', rt.builtins.full, [v], 1)[0] || v : v);
    const o = full(obs), e = full(exp);
    const n = o.re.length;
    const dims = o.dims;
    const where = (i) => {
      if (n === 1) return '()';
      if (dims.length === 2 && (dims[0] === 1 || dims[1] === 1)) return `(${i + 1})`;
      const sub = []; let r = i;
      for (const d of dims) { sub.push((r % d) + 1); r = Math.floor(r / d); }
      return `(${sub.join(',')})`;
    };
    let shown = 0;
    for (let i = 0; i < n && shown < 50; i++) {
      const or = o.re[i], oi = o.im ? o.im[i] : 0, er = e.re[i], ei = e.im ? e.im[i] : 0;
      const itemText = (r, im) => valueText(tensor('double', [1, 1], [r], im ? [im] : null));
      const fail = (why) => { out.push({ loc: where(i), obs: itemText(or, oi), exp: itemText(er, ei), why }); shown++; };
      const oNaN = Number.isNaN(or) || Number.isNaN(oi), eNaN = Number.isNaN(er) || Number.isNaN(ei);
      if (oNaN || eNaN) { if (oNaN !== eNaN) fail(oNaN ? "'NaN' mismatch" : "'NaN' mismatch"); continue; }
      const oInf = !Number.isFinite(or) || !Number.isFinite(oi), eInf = !Number.isFinite(er) || !Number.isFinite(ei);
      if (oInf || eInf) { if (or !== er || oi !== ei) fail("'Inf' mismatch"); continue; }
      const err = Math.hypot(or - er, oi - ei);
      if (tol === 0) { if (err !== 0) fail(`Abs err ${+err.toPrecision(5)} exceeds tol 0 by ${+err.toPrecision(1)}`); continue; }
      if (tol > 0) { if (err > tol) fail(`Abs err ${+err.toPrecision(5)} exceeds tol ${tol} by ${+(err - tol).toPrecision(1)}`); continue; }
      const mag = Math.hypot(er, ei);
      const rel = mag === 0 ? err : err / mag;
      if (rel > -tol) fail(`Rel err ${+rel.toPrecision(5)} exceeds tol ${-tol} by ${+(rel + tol).toPrecision(1)}`);
    }
    return out;
  }
  // strings, function handles, objects: isequal
  let same = false;
  try { same = rt.truth(rt.callAny('isequal', [obs, exp], 1)[0]); } catch { same = false; }
  if (!same) add('Values differ', valueText(obs), valueText(exp));
  return out;
}

export function assertMessage(rows) {
  const lines = ['ASSERT errors for:  assert (cond,expected,tol)', '', '  Location  |  Observed  |  Expected  |  Reason'];
  for (const r of rows) lines.push(`    ${r.loc.padEnd(10)}${String(r.obs).padEnd(13)}${String(r.exp).padEnd(13)}${r.why}`);
  return lines.join('\n');
}

// ------------------------------------------------------------------ %!test / %!demo blocks
const BLOCK_WORDS = ['test', 'assert', 'fail', 'error', 'warning', 'shared', 'function', 'endfunction', 'demo', 'xtest', 'testif'];

/** The %! blocks of an M file: [{ type, head, code, line }]. */
export function testBlocks(src) {
  const lines = String(src).split(/\r?\n/);
  const blocks = [];
  let cur = null;
  lines.forEach((raw, k) => {
    const m = /^\s*[%#]!(.*)$/.exec(raw);
    if (!m) { cur = null; return; }
    const text = m[1];
    const w = /^([a-z_]+)(?![\w])(.*)$/.exec(text);
    if (text.startsWith('#')) { cur = null; return; } // %!# comment block
    if (w && BLOCK_WORDS.includes(w[1])) {
      cur = { type: w[1], head: w[2], body: [], line: k + 1 };
      blocks.push(cur);
      return;
    }
    if (cur) cur.body.push(text);
  });
  return blocks.map((b) => ({ type: b.type, head: b.head, code: [b.head, ...b.body].join('\n'), body: b.body.join('\n'), line: b.line }));
}

function sourceOf(rt, name, fn) {
  const path = fileFor(rt, name) || (isMFile(name) ? absPath(rt, name) : null);
  if (!path || !rt.fs.exists(path)) return null;
  return { path, src: rt.fs.readText(path) };
}

/** Pattern and code of `%!error <pattern> code` / `%!error id=ID code`. */
function errorSpec(head, body) {
  let rest = head.replace(/^\s+/, '');
  let pattern = null, id = null;
  const m = /^<(.*?)>(.*)$/s.exec(rest);
  if (m) { pattern = m[1]; rest = m[2]; }
  const i = /^id=(\S+)(.*)$/s.exec(rest.replace(/^\s+/, ''));
  if (i) { id = i[1]; rest = i[2]; }
  return { pattern, id, code: [rest, body].filter((x) => x.trim()).join('\n') };
}

/** Runs fn with the folder of a file on the search path (tests of files outside the path call their function). */
function withDirOnPath(rt, file, fn) {
  const dir = dirName(file);
  if (rt.searchDirs().includes(dir)) return fn();
  rt.path = [dir, ...rt.path];
  rt.bumpGen();
  try { return fn(); } finally { rt.path = rt.path.filter((p, i) => !(i === rt.path.indexOf(dir) && p === dir)); rt.bumpGen(); }
}

function runTests(rt, name, mode, out) {
  const file = sourceOf(rt, name);
  if (!file) return null;
  return withDirOnPath(rt, file.path, () => runTestBlocks(rt, name, mode, out, file));
}

function runTestBlocks(rt, name, mode, out, file) {
  const blocks = testBlocks(file.src);
  const oct = isOctaveSource(file.src);   // test code of an Octave file is Octave code
  const fns = blocks.filter((b) => b.type === 'function').map((b) => 'function' + b.code + '\nendfunction');
  const withFns = (code) => (fns.length ? code + '\n' + fns.join('\n') : code);
  let shared = {};
  let n = 0, nmax = 0, nxfail = 0;
  const verbose = mode === 'verbose';
  const report = (b, msg) => {
    if (mode === 'quiet') return;
    out(`***** ${b.type}${b.code.split('\n')[0]}\n`);
    if (b.code.includes('\n')) out(b.code.split('\n').slice(1).join('\n') + '\n');
    out(`!!!!! ${msg}\n`);
  };
  for (const b of blocks) {
    if (b.type === 'function' || b.type === 'endfunction' || b.type === 'demo') continue;
    if (b.type === 'shared') {
      // %!shared a, b  then initialisation code
      shared = {};
      const names = b.head.split(/[\s,]+/).filter(Boolean);
      const empty = tensor('double', [0, 0]);
      for (const nm of names) shared[nm] = empty;
      if (b.body.trim()) {
        try {
          const ws = runIsolated(rt, withFns(b.body), shared, file.path, name, oct);
          for (const nm of names) if (ws.vars[nm] !== undefined) shared[nm] = ws.vars[nm];
        } catch (e) {
          const me = rt.catchable(e); if (!me) throw e;
          nmax++;
          report(b, `shared variables failed: ${me.message}`);
        }
      }
      continue;
    }
    nmax++;
    if (verbose) out(`***** ${b.type}${b.code}\n`);
    let ok = false, msg = '';
    try {
      if (b.type === 'error' || b.type === 'warning') {
        const spec = errorSpec(b.head, b.body);
        if (b.type === 'error') {
          let thrown = null;
          try { capture(rt, () => runIsolated(rt, withFns(spec.code), shared, file.path, name, oct)); } catch (e) { thrown = rt.catchable(e); if (!thrown) throw e; }
          if (!thrown) msg = 'expected error <' + (spec.pattern || spec.id || '.') + '> but got none';
          else if (spec.id && thrown.identifier !== spec.id) msg = `expected id ${spec.id}, but got ${thrown.identifier || '(none)'}`;
          else if (spec.pattern && !new RegExp(spec.pattern).test(thrown.message)) msg = `expected <${spec.pattern}>\nbut got <${thrown.message}>`;
          else ok = true;
        } else {
          rt.lastWarning = { message: '', identifier: '' };
          capture(rt, () => runIsolated(rt, withFns(spec.code), shared, file.path, name, oct));
          const w = rt.lastWarning;
          if (!w.message) msg = 'expected warning <' + (spec.pattern || '.') + '> but got none';
          else if (spec.id && w.identifier !== spec.id) msg = `expected warning id ${spec.id}, but got ${w.identifier || '(none)'}`;
          else if (spec.pattern && !new RegExp(spec.pattern).test(w.message)) msg = `expected warning <${spec.pattern}>\nbut got <${w.message}>`;
          else ok = true;
        }
      } else {
        // test / xtest / testif (feature line, then code) / assert / fail
        let code = b.type === 'assert' || b.type === 'fail' ? b.type + b.code : b.type === 'testif' ? b.body : b.code;
        runIsolated(rt, withFns(code), shared, file.path, name, oct);
        ok = true;
      }
    } catch (e) {
      const me = rt.catchable(e);
      if (!me) throw e;
      msg = me.message;
    }
    if (ok) { n++; continue; }
    if (b.type === 'xtest') { nxfail++; if (mode !== 'quiet') out(`!!!!! known failure\n${msg}\n`); continue; }
    report(b, `${b.type === 'error' || b.type === 'warning' ? '' : 'test failed\n'}${msg}`);
  }
  return { n, nmax, nxfail, file: file.path };
}

function demoBlocks(rt, name) {
  const file = sourceOf(rt, name);
  if (!file) return null;
  return { file, demos: testBlocks(file.src).filter((b) => b.type === 'demo').map((b) => b.body.replace(/^\n+/, '')) };
}

function pickIdx(args, k, count, fn) {
  if (args.length <= k) return Array.from({ length: count }, (_, i) => i + 1);
  const v = args[k];
  const idx = isTensor(v) ? Array.from(v.re) : [toNum(v)];
  for (const i of idx) if (!(i >= 1 && i <= count && i === Math.floor(i))) throw new MError(`core:${fn}:badIndex`, `${fn}: invalid demo number ${i}; the file has ${count} demo${count === 1 ? '' : 's'}.`);
  return idx;
}

function mFilesIn(rt, dir) {
  let list = [];
  try { list = rt.fs.list(dir); } catch { throw new MError('core:dir:notFound', `Folder "${dir}" not found.`); }
  return list.filter((e) => !e.isDir && isMFile(e.name)).map((e) => joinPath(dir, e.name)).sort();
}

// ------------------------------------------------------------------ misc helpers
const ERRNO = {
  EPERM: 1, ENOENT: 2, ESRCH: 3, EINTR: 4, EIO: 5, ENXIO: 6, E2BIG: 7, ENOEXEC: 8, EBADF: 9, ECHILD: 10, EAGAIN: 11, ENOMEM: 12,
  EACCES: 13, EFAULT: 14, ENOTBLK: 15, EBUSY: 16, EEXIST: 17, EXDEV: 18, ENODEV: 19, ENOTDIR: 20, EISDIR: 21, EINVAL: 22,
  ENFILE: 23, EMFILE: 24, ENOTTY: 25, ETXTBSY: 26, EFBIG: 27, ENOSPC: 28, ESPIPE: 29, EROFS: 30, EMLINK: 31, EPIPE: 32,
  EDOM: 33, ERANGE: 34, EDEADLK: 35, ENAMETOOLONG: 36, ENOLCK: 37, ENOSYS: 38, ENOTEMPTY: 39, ELOOP: 40,
};

const TYPE_NAMES = [
  'null_matrix', 'null_string', 'null_sq_string', 'scalar', 'matrix', 'complex scalar', 'complex matrix', 'bool', 'bool matrix',
  'string', 'sq_string', 'float scalar', 'float matrix', 'float complex scalar', 'float complex matrix',
  'int8 scalar', 'int16 scalar', 'int32 scalar', 'int64 scalar', 'uint8 scalar', 'uint16 scalar', 'uint32 scalar', 'uint64 scalar',
  'int8 matrix', 'int16 matrix', 'int32 matrix', 'int64 matrix', 'uint8 matrix', 'uint16 matrix', 'uint32 matrix', 'uint64 matrix',
  'sparse matrix', 'sparse complex matrix', 'sparse bool matrix', 'cell', 'struct', 'scalar struct', 'function handle', 'object',
];

function typeName(v) {
  if (isObject(v)) return 'object';
  if (isFuncHandle(v)) return 'function handle';
  if (isCell(v)) return 'cell';
  if (isStruct(v)) return prod(v.dims) === 1 ? 'scalar struct' : 'struct';
  if (isString(v)) return 'string';
  if (v.sparse) return v.cls === 'logical' ? 'sparse bool matrix' : v.im ? 'sparse complex matrix' : 'sparse matrix';
  const n = prod(v.dims);
  const scalar = n === 1;
  if (v.cls === 'char') return n === 0 && v.dims[0] === 0 && v.dims[1] === 0 ? 'null_sq_string' : 'sq_string';
  if (v.cls === 'logical') return scalar ? 'bool' : 'bool matrix';
  if (v.cls === 'double') {
    if (!v.im && v.dims.length === 2 && v.dims[0] === 0 && v.dims[1] === 0) return 'null_matrix';
    return (v.im ? 'complex ' : '') + (scalar ? 'scalar' : 'matrix');
  }
  if (v.cls === 'single') return 'float ' + (v.im ? 'complex ' : '') + (scalar ? 'scalar' : 'matrix');
  if (NUMERIC_CLASSES.includes(v.cls)) return `${v.cls} ${scalar ? 'scalar' : 'matrix'}`;
  return v.cls;
}

/** A deterministic key of a value (memoize). */
function valueKey(v, ids) {
  if (v === undefined || v === null) return 'u';
  if (v.re !== undefined) return `${v.cls}${v.sparse ? 's' : ''}[${v.dims}]${Array.from(v.re).join(',')}${v.im ? 'i' + Array.from(v.im).join(',') : ''}${v.sparse ? 'p' + Array.from(v.colPtr) + 'r' + Array.from(v.rowIdx) : ''}`;
  if (isString(v)) return `s[${v.dims}]${JSON.stringify(v.data)}`;
  if (isCell(v)) return `c[${v.dims}]{${v.data.map((x) => valueKey(x, ids)).join(';')}}`;
  if (isStruct(v)) return `t[${v.dims}]${v.fields.join(',')}{${v.data.map((r) => v.fields.map((f) => valueKey(r[f], ids)).join(';')).join('|')}}`;
  if (isFuncHandle(v)) return 'f' + (v.anon ? v.text : v.name);
  if (!ids.has(v)) ids.set(v, ids.size + 1);
  return 'o' + ids.get(v);
}

function helpTextOf(rt, name) {
  const h = rt.help[name];
  if (h) return [h.en || '', ...(h.syntax || []).map((s) => '    ' + s)].join('\n');
  const r = helpFor(rt, name);
  return r ? r.text : null;
}

function firstSentence(text, max) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  const m = /^(.*?[.!?])(\s|$)/.exec(t);
  let s = m ? m[1] : t;
  if (s.length > max) s = s.slice(0, max);
  return s;
}

function frameLabel(fr) { return fr.kind === 'base' || fr.ws === undefined ? 'base' : fr.name; }

function fileLines(rt, file) {
  try { return rt.fs.readText(file).split(/\r?\n/); } catch { throw new MError('core:dbtype:fileNotFound', `Cannot read "${file}".`); }
}

function printLines(rt, lines, from, to, mark) {
  const w = String(to).length;
  let s = '';
  for (let k = from; k <= to && k <= lines.length; k++) s += `${k === mark ? '-->' : ''}${String(k).padStart(mark ? w + (k === mark ? 0 : 3) : w)}\t${lines[k - 1]}\n`;
  rt.out(s);
}

function needPaused(rt, fn) {
  if (!rt.paused) throw new MError(`core:${fn}:notDebugging`, `${fn} is only available while debugging.`);
  return rt.paused;
}

function htmlEscape(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function htmlUnescape(s) {
  return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&');
}
function latexEscape(s) { return String(s).replace(/([\\{}$&#^_%~])/g, (c) => (c === '\\' ? '\\textbackslash{}' : c === '~' ? '\\textasciitilde{}' : c === '^' ? '\\textasciicircum{}' : '\\' + c)); }

/** Cells of a script for publish: [{ title, text: string[], code }]. */
function publishCells(src) {
  const lines = String(src).split(/\r?\n/);
  const cells = [];
  let cur = { title: null, text: [], code: [] };
  const flush = () => { if (cur.title !== null || cur.text.length || cur.code.some((l) => l.trim())) cells.push(cur); };
  for (const line of lines) {
    const head = /^\s*(?:%%|##)(?!\S)(.*)$/.exec(line);
    if (head) { flush(); cur = { title: head[1].trim(), text: [], code: [] }; continue; }
    const c = /^\s*[%#] ?(.*)$/.exec(line);
    if (c && !cur.code.some((l) => l.trim()) && !/^\s*[%#][{}!]/.test(line)) { cur.text.push(c[1]); continue; }
    cur.code.push(line);
  }
  flush();
  return cells.map((c) => ({ ...c, code: c.code.join('\n').replace(/^\n+|\s+$/g, '') }));
}

// ------------------------------------------------------------------ builtins
export const octaveBuiltins = {
  // ---------------------------------------------------------------- evaluation
  evalc(args, nargout, ctx) {
    const rt = ctx.interp;
    const code = textArg(args[0], 'evalc');
    const frame = rt.currentFrame();
    const depth = rt.stack.length;
    const text = capture(rt, () => {
      try { rt.evalIn(frame, code, true, 0); } catch (e) {
        if (args.length < 2) throw e;
        const me = rt.catchable(e);
        if (!me) throw e;
        rt.unwindTo(depth);
        rt.lastError = me;
        rt.evalIn(frame, textArg(args[1], 'evalc'), true, 0);
      }
    });
    return str(text);
  },
  source(args, nargout, ctx) {
    const rt = ctx.interp;
    const p = textArg(args[0], 'source');
    const full = absPath(rt, p);
    if (!rt.fs.exists(full)) throw new MError('core:source:fileNotFound', `source: error sourcing file '${p}': file not found.`);
    const ctxName = args.length > 1 ? textArg(args[1], 'source').toLowerCase() : 'caller';
    const frame = ctxName === 'base' ? rt.baseFrame : rt.currentFrame();
    // the file is read and run as a script even when it defines functions
    rt.evalIn(new Frame(frame.ws, frame.fi, full, stripMExt(baseName(full)), frame.kind === 'base' ? 'base' : 'script'), rt.readSource(full), false, 0);
    return [];
  },
  nthargout(args, nargout, ctx) {
    if (args.length < 2) throw new MError('core:minrhs', 'nthargout: not enough input arguments.');
    const nArg = args[0];
    const idx = isTensor(nArg) && nArg.cls !== 'char' ? Array.from(nArg.re) : null;
    if (!idx || !idx.length || idx.some((k) => !(k >= 1) || k !== Math.floor(k))) throw new MError('core:nthargout:badN', 'nthargout: N must be a positive integer or a vector of them.');
    let ntot = Math.max(...idx), k = 1;
    if (isTensor(args[1]) && args[1].cls !== 'char') {
      ntot = toNum(args[1]);
      if (!(ntot >= Math.max(...idx)) || ntot !== Math.floor(ntot)) throw new MError('core:nthargout:badNtot', 'nthargout: NTOT must be an integer at least max(N).');
      k = 2;
    }
    const fn = args[k];
    const r = ctx.interp.callAny(fn, args.slice(k + 1), ntot);
    const pick = idx.map((i) => {
      if (r[i - 1] === undefined) throw new MError('core:nthargout:noOutput', `nthargout: the function returned fewer than ${i} outputs.`);
      return r[i - 1];
    });
    return idx.length === 1 && prod(nArg.dims) === 1 ? pick[0] : cell([1, pick.length], pick);
  },
  isargout(args, nargout, ctx) {
    const rt = ctx.interp;
    const ws = rt.currentWs();
    if (ws === rt.base || !ws.fi) throw new MError('core:isargout:notInFunction', 'isargout: invalid use at top level.');
    if (!args.length) throw new MError('core:minrhs', 'isargout: not enough input arguments.');
    const kv = args[0];
    const ks = isTensor(kv) ? Array.from(kv.re) : [toNum(kv)];
    const want = Math.max(ws.nargout, 1);
    const ign = ws.ignored || [];
    const res = ks.map((k) => {
      if (!(k >= 1) || k !== Math.floor(k)) throw new MError('core:isargout:badK', 'isargout: K must be a positive integer.');
      return k <= want && !ign.includes(k) ? 1 : 0;
    });
    return tensor('logical', isTensor(kv) ? kv.dims.slice() : [1, 1], res);
  },
  print_usage(args, nargout, ctx) {
    const rt = ctx.interp;
    let name;
    let text = null;
    if (args.length) { name = textArg(args[0], 'print_usage'); text = helpTextOf(rt, name); }
    else {
      const ws = rt.currentWs();
      if (ws === rt.base || !ws.fi) throw new MError('core:print_usage:topLevel', 'print_usage: only valid inside functions.');
      const fr = rt.currentFrame();
      name = ws.fi.name || fr.name;
      text = ws.fi.help || helpTextOf(rt, name);
    }
    // usage: the syntax lines (help entries) or the help text up to the first blank line
    let usage = '';
    const h = rt.help[name];
    if (h && h.syntax && h.syntax.length) usage = h.syntax.map((s) => ' -- ' + s).join('\n');
    else if (text) usage = text.split(/\n\s*\n/)[0].split('\n').map((l) => ' -- ' + l.trim()).join('\n');
    const msg = usage ? `Invalid call to ${name}.  Correct usage is:\n\n${usage}` : `Invalid call to ${name}`;
    const e = new MError('Octave:invalid-fun-call', msg);
    e.fromError = true;
    e.extra.noFn = true;
    throw e;
  },
  parseparams(args, nargout) {
    const params = args[0];
    if (!isCell(params)) throw new MError('core:parseparams:notCell', 'parseparams: PARAMS must be a cell array.');
    const items = params.data;
    let i = items.findIndex((x) => isText(x));
    if (i < 0) i = items.length;
    const reg = cell([1, i], items.slice(0, i));
    const props = items.slice(i);
    if (args.length === 1) return [reg, cell([1, props.length], props)];
    // [reg, v1, v2, …] = parseparams(params, name1, default1, …)
    const defs = args.slice(1);
    if (defs.length % 2) throw new MError('core:parseparams:pairs', 'parseparams: needs name/default pairs.');
    const names = [], vals = [];
    for (let k = 0; k < defs.length; k += 2) { names.push(textArg(defs[k], 'parseparams')); vals.push(defs[k + 1]); }
    if (props.length % 2) throw new MError('core:parseparams:pairs', 'parseparams: properties must be name/value pairs.');
    for (let k = 0; k < props.length; k += 2) {
      const pn = S(props[k]);
      const j = names.findIndex((n) => n.toLowerCase() === pn.toLowerCase());
      if (j < 0) throw new MError('core:parseparams:unknown', `parseparams: unrecognized option: ${pn}`);
      vals[j] = props[k + 1];
    }
    return [reg, ...vals];
  },
  is_function_handle(args) {
    if (args.length !== 1) throw new MError('core:is_function_handle:nargin', 'Invalid call to is_function_handle.');
    return bool(isFuncHandle(args[0]));
  },
  symvar(args, nargout, ctx) {
    const rt = ctx.interp;
    const s = textArg(args[0], 'symvar');
    let e;
    try { e = parseExpr(s); } catch { throw new MError('core:symvar:parse', `symvar: cannot parse "${s}".`); }
    const SKIP = new Set(['i', 'j', 'I', 'J', 'pi', 'Inf', 'inf', 'NaN', 'nan', 'NA', 'eps', 'e', 'true', 'false']);
    const names = new Set();
    const isFn = (n) => { try { const t = rt.resolve(n); return !!t && t.kind !== 'script'; } catch { return false; } };
    const visit = (n) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(visit); return; }
      if (n.t === 'id') { if (!SKIP.has(n.name) && !KEYWORDS.has(n.name)) names.add(n.name); return; }
      if (n.t === 'index' && n.base.t === 'id') {
        const called = n.chain[0].k === '()' && isFn(n.base.name);
        if (!called && !SKIP.has(n.base.name)) names.add(n.base.name);
        for (const c of n.chain) { if (c.args) visit(c.args); if (c.e) visit(c.e); }
        return;
      }
      if (n.t === 'anon') return;
      for (const k of Object.keys(n)) if (k !== 't' && n[k] && typeof n[k] === 'object') visit(n[k]);
    };
    visit(e);
    return cellOfStr([...names].sort());
  },
  typeinfo(args) {
    if (!args.length) return cellOfStr(TYPE_NAMES);
    return str(typeName(args[0]));
  },
  isglobal(args, nargout, ctx) {
    const rt = ctx.interp;
    const name = textArg(args[0], 'isglobal');
    const ws = rt.currentWs();
    return bool(!!(ws.gl && ws.gl[name]));
  },
  localfunctions(args, nargout, ctx) {
    const rt = ctx.interp;
    const fi = rt.currentFrame().fi;
    const info = fi && (fi.fileInfo || (fi.lookup && fi.file ? (rt.fileCache.get(fi.file) || {}).info : null));
    if (!info || !info.locals) return cell([0, 1], []);
    const out = [];
    for (const [n, lf] of info.locals) if (lf !== info.main && !lf.parent) out.push({ cls: 'function_handle', dims: [1, 1], name: n, fi: lf, ws: null });
    return cellCol(out);
  },
  numArgumentsFromSubscript(args, nargout, ctx) {
    const rt = ctx.interp;
    const [obj, s] = args;
    if (!isStruct(s) || !s.data.length) throw new MError('core:numArgumentsFromSubscript:badS', 'numArgumentsFromSubscript: S must be a subscript struct.');
    const first = s.data[0];
    const type = S(first.type);
    if (type === '()') return num(1);
    if (type === '.') return num(isStruct(obj) ? prod(obj.dims) : 1);
    // {}: as many outputs as the brace index selects
    const paren = struct([1, 1], ['type', 'subs'], [Object.assign(Object.create(null), { type: str('()'), subs: first.subs })]);
    const r = rt.callAny('subsref', [obj, paren], 1);
    return num(r.length ? prod(r[0].dims || [1, 1]) : 0);
  },
  loadobj(args, nargout, ctx) {
    const rt = ctx.interp;
    const v = args[0];
    if (isObject(v)) { const r = rt.tryObjectMethod(v, 'loadobj', [v], 1, true); if (r) return r[0]; }
    return v;
  },
  saveobj(args, nargout, ctx) {
    const rt = ctx.interp;
    const v = args[0];
    if (isObject(v)) { const r = rt.tryObjectMethod(v, 'saveobj', [v], 1, true); if (r) return r[0]; }
    return v;
  },

  // ---------------------------------------------------------------- errors
  lasterror(args, nargout, ctx) {
    const rt = ctx.interp;
    const e = rt.lastError;
    const stackRows = (e && e.mstack ? e.mstack : []).map((s) => Object.assign(Object.create(null), { file: str(s.file || ''), name: str(s.name || ''), line: num(s.line || 0), column: num(-1) }));
    const cur = structOf({ message: str(e ? e.message : ''), identifier: str(e ? e.identifier : ''), stack: struct([stackRows.length, 1], ['file', 'name', 'line', 'column'], stackRows) });
    if (args.length) {
      const a = args[0];
      if (isText(a)) {
        if (S(a) !== 'reset') throw new MError('core:lasterror:badArg', "lasterror: unrecognized string argument (only 'reset' is valid).");
        rt.lastError = null;
      } else if (isStruct(a) && a.data.length) {
        const r = a.data[0];
        const me = new MError(r.identifier ? S(r.identifier) : '', r.message ? S(r.message) : '');
        if (r.stack && isStruct(r.stack)) me.mstack = r.stack.data.map((x) => ({ file: x.file ? S(x.file) : '', name: x.name ? S(x.name) : '', line: x.line ? toNum(x.line) : 0 }));
        rt.lastError = me;
      } else throw new MError('core:lasterror:badArg', 'lasterror: argument must be a structure or a string.');
    }
    return cur;
  },
  errno(args, nargout, ctx) {
    const rt = ctx.interp;
    const old = rt.errnoValue;
    if (!args.length) return num(old);
    if (isText(args[0])) { const code = ERRNO[S(args[0])]; return num(code === undefined ? -1 : code); }
    rt.errnoValue = toNum(args[0]);
    return num(old);
  },
  errno_list() { return structOf(Object.fromEntries(Object.entries(ERRNO).map(([k, v]) => [k, num(v)]))); },
  fail(args, nargout, ctx) {
    // fail(code), fail(code, pattern), fail(code, 'warning', pattern)
    const rt = ctx.interp;
    const code = textArg(args[0], 'fail');
    const isWarn = args.length > 1 && S(args[1]) === 'warning';
    const pattern = isWarn ? (args.length > 2 ? S(args[2]) : '') : args.length > 1 ? S(args[1]) : '';
    const frame = rt.currentFrame();
    const depth = rt.stack.length;
    const fault = (msg) => { const e = new MError('core:fail', msg); e.fromError = true; e.extra.noFn = true; throw e; };
    if (isWarn) {
      rt.lastWarning = { message: '', identifier: '' };
      let err = null;
      capture(rt, () => { try { rt.evalIn(frame, code, true, 0); } catch (e) { err = rt.catchable(e); if (!err) throw e; rt.unwindTo(depth); } });
      if (err) fault(`expected warning <${pattern || '.'}>\nbut got error <${err.message}>`);
      const w = rt.lastWarning.message;
      if (!w) fault(`expected warning <${pattern || '.'}> but got none`);
      if (pattern && !new RegExp(pattern).test(w)) fault(`expected warning <${pattern}>\nbut got <${w}>`);
      return [];
    }
    let err = null;
    capture(rt, () => { try { rt.evalIn(frame, code, true, 0); } catch (e) { err = rt.catchable(e); if (!err) throw e; rt.unwindTo(depth); } });
    if (!err) fault(`expected error <${pattern || '.'}> but got none`);
    if (pattern && !new RegExp(pattern).test(err.message)) fault(`expected error <${pattern}>\nbut got <${err.message}>`);
    return [];
  },
  assert_equal(args, nargout, ctx) {
    if (args.length < 2) throw new MError('core:minrhs', 'assert_equal: needs the observed and the expected value.');
    const tol = args.length > 2 ? toNum(args[2]) : 0;
    const rows = compareValues(ctx.interp, args[0], args[1], tol);
    if (rows.length) { const e = new MError('core:assert_equal:failed', assertMessage(rows)); e.fromError = true; e.extra.noFn = true; throw e; }
    return [];
  },

  // ---------------------------------------------------------------- settings
  beep_on_error: setting('beep_on_error', (rt) => rt.beepOnError, (rt, v) => { rt.beepOnError = v; }, logicalArg),
  debug_on_error: setting('debug_on_error', (rt) => rt.dbstopIfError, (rt, v) => { rt.dbstopIfError = v; }, logicalArg),
  debug_on_warning: setting('debug_on_warning', (rt) => rt.debugOnWarning, (rt, v) => { rt.debugOnWarning = v; }, logicalArg),
  debug_on_interrupt: setting('debug_on_interrupt', (rt) => rt.debugOnInterrupt, (rt, v) => { rt.debugOnInterrupt = v; }, logicalArg),
  silent_functions: setting('silent_functions', (rt) => rt.silentFunctions, (rt, v) => { rt.silentFunctions = v; }, logicalArg),
  max_recursion_depth: setting('max_recursion_depth', (rt) => rt.recursionLimit, (rt, v) => { rt.recursionLimit = v; }, countArg),
  max_stack_depth: setting('max_stack_depth', (rt) => rt.maxStackDepth, (rt, v) => { rt.maxStackDepth = v; }, countArg),
  missing_function_hook: setting('missing_function_hook', (rt) => rt.missingFunctionHook, (rt, v) => { rt.missingFunctionHook = v; }, textValue),
  mfile_encoding: setting('mfile_encoding', (rt) => rt.mfileEncoding, (rt, v) => { rt.mfileEncoding = v; rt.fileCache.clear(); rt.fnCache.clear(); rt.bumpGen(); }, encodingArg),
  dir_encoding(args, nargout, ctx) {
    const rt = ctx.interp;
    const dir = absPath(rt, textArg(args[0], 'dir_encoding'));
    const old = rt.dirEncodings.get(dir) || rt.mfileEncoding;
    if (args.length > 1) {
      rt.dirEncodings.set(dir, encodingArg(args[1], 'dir_encoding'));
      rt.fileCache.clear(); rt.fnCache.clear(); rt.bumpGen();
      return nargout > 0 ? str(old) : [];
    }
    return str(old);
  },

  // ---------------------------------------------------------------- functions
  autoload(args, nargout, ctx) {
    const rt = ctx.interp;
    if (!args.length) {
      const rows = [...rt.autoloads].map(([f, file]) => Object.assign(Object.create(null), { function: str(f), file: str(file) }));
      return struct([rows.length, 1], ['function', 'file'], rows);
    }
    const name = textArg(args[0], 'autoload');
    if (args.length < 2) throw new MError('core:minrhs', 'autoload: needs a function name and a file.');
    let file = textArg(args[1], 'autoload');
    const remove = args.length > 2 && S(args[2]) === 'remove';
    if (!isAbs(normPath(file))) {
      // relative to the calling file, else the current folder
      const f = rt.currentFrame().file;
      file = f ? joinPath(dirName(normPath(f)), file) : absPath(rt, file);
    }
    if (remove) {
      if (rt.autoloads.get(name) !== normPath(file)) throw new MError('core:autoload:notFound', `autoload: "${name}" is not autoloaded from "${file}".`);
      rt.autoloads.delete(name);
    } else rt.autoloads.set(name, normPath(file));
    rt.fnCache.delete(name);
    rt.bumpGen();
    return [];
  },
  mlock(args, nargout, ctx) {
    const rt = ctx.interp;
    const ws = rt.currentWs();
    if (ws === rt.base || !ws.fi) throw new MError('core:mlock:topLevel', 'mlock: invalid use outside a function.');
    rt.locked.add(rt.currentFrame().name);
    return [];
  },
  munlock(args, nargout, ctx) {
    const rt = ctx.interp;
    const name = args.length ? textArg(args[0], 'munlock') : rt.currentFrame().name;
    rt.locked.delete(name);
    return [];
  },
  mislocked(args, nargout, ctx) {
    const rt = ctx.interp;
    const name = args.length ? textArg(args[0], 'mislocked') : rt.currentFrame().name;
    return bool(rt.locked.has(name));
  },
  memoize(args, nargout, ctx) {
    const rt = ctx.interp;
    const fh = args[0];
    if (!isFuncHandle(fh)) throw new MError('core:memoize:notHandle', 'memoize: FCN_HANDLE must be a function handle.');
    if (fh.memo) return fh;
    const cache = new Map();
    const ids = new Map();
    rt.memoCaches.add(cache);
    const size = 10;
    const memo = {
      cls: 'function_handle', dims: [1, 1], name: fh.anon ? fh.text : fh.name, text: fh.anon ? fh.text : undefined, memo: { cache, size, fh },
      jsfn(a, nout) {
        const key = `${nout}|${a.map((x) => valueKey(x, ids)).join('#')}`;
        if (cache.has(key)) { const v = cache.get(key); cache.delete(key); cache.set(key, v); return v; }
        const r = rt.callAny(fh, a, nout);
        cache.set(key, r);
        while (cache.size > size) cache.delete(cache.keys().next().value);
        return r;
      },
    };
    return memo;
  },
  clearAllMemoizedCaches(args, nargout, ctx) {
    for (const c of ctx.interp.memoCaches) c.clear();
    return [];
  },
  atexit(args, nargout, ctx) {
    const rt = ctx.interp;
    const fn = args[0];
    if (!fn || !(isText(fn) || isFuncHandle(fn))) throw new MError('core:atexit:badFcn', 'atexit: FCN must be a function name or handle.');
    const key = isText(fn) ? S(fn) : handleText(fn);
    const add = args.length < 2 || rt.truth(args[1]);
    if (add) { rt.atexitFns.push({ key, fn }); return nargout > 0 ? bool(true) : []; }
    for (let i = rt.atexitFns.length - 1; i >= 0; i--) if (rt.atexitFns[i].key === key) { rt.atexitFns.splice(i, 1); return bool(true); }
    return nargout > 0 ? bool(false) : [];
  },
  exit(args, nargout, ctx) {
    const rt = ctx.interp;
    let status = 0;
    for (const a of args) if (isTensor(a) && a.cls !== 'char') status = toNum(a);
    // atexit functions run last-registered first
    while (rt.atexitFns.length) {
      const { fn } = rt.atexitFns.pop();
      try { rt.callAny(fn, [], 0); } catch (e) { const me = rt.catchable(e); if (!me) throw e; rt.print(rt.errorReport(me) + '\n', 'err'); }
    }
    rt.onEvent({ type: 'exit', status });
    try { rt.host.post({ type: 'exit', status }); } catch { /* no host */ }
    const e = new MError('core:exit', 'The session was asked to exit.');
    e.extra.status = status;
    throw e;
  },

  // ---------------------------------------------------------------- paths
  file_in_loadpath(args, nargout, ctx) {
    const rt = ctx.interp;
    const names = isCell(args[0]) ? args[0].data.map((x) => S(x)) : [textArg(args[0], 'file_in_loadpath')];
    const all = args.length > 1 && S(args[1]) === 'all';
    const found = [];
    for (const nm of names) {
      if (isAbs(normPath(nm))) { if (rt.fs.exists(nm)) found.push(normPath(nm)); continue; }
      for (const d of rt.searchDirs()) { const p = joinPath(d, normPath(nm)); if (rt.fs.exists(p) && !found.includes(p)) found.push(p); }
    }
    if (all) return cellOfStr(found);
    return found.length ? str(found[0]) : tensor('double', [0, 0]);
  },
  file_in_path(args, nargout, ctx) {
    const rt = ctx.interp;
    const pathText = textArg(args[0], 'file_in_path');
    const names = isCell(args[1]) ? args[1].data.map((x) => S(x)) : [textArg(args[1], 'file_in_path')];
    const all = args.length > 2 && S(args[2]) === 'all';
    const dirs = pathText.split(/;|:(?!\/)/).filter(Boolean).map((d) => absPath(rt, d));
    const found = [];
    for (const nm of names) for (const d of dirs) { const p = isAbs(normPath(nm)) ? normPath(nm) : joinPath(d, normPath(nm)); if (rt.fs.exists(p) && !found.includes(p)) found.push(p); }
    if (all) return cellOfStr(found);
    return found.length ? str(found[0]) : tensor('double', [0, 0]);
  },
  dir_in_loadpath(args, nargout, ctx) {
    const rt = ctx.interp;
    const name = normPath(textArg(args[0], 'dir_in_loadpath'));
    const all = args.length > 1 && S(args[1]) === 'all';
    const isDir = (p) => { try { return rt.fs.exists(p) && rt.fs.stat(p).isDir; } catch { return false; } };
    const found = [];
    if (isAbs(name)) { if (isDir(name)) found.push(name); }
    else for (const d of rt.searchDirs()) { const p = joinPath(d, name); if (isDir(p) && !found.includes(p)) found.push(p); }
    if (all) return cellOfStr(found);
    return found.length ? str(found[0]) : tensor('double', [0, 0]);
  },
  command_line_path() { return str(''); },
  pathdef(args, nargout, ctx) {
    const rt = ctx.interp;
    return str((rt.defaultPath || rt.path).join(pathSep(rt)));
  },
  restoredefaultpath(args, nargout, ctx) {
    const rt = ctx.interp;
    rt.path = (rt.defaultPath || []).slice();
    rt.bumpGen();
    return str(rt.path.join(pathSep(rt)));
  },
  rehash(args, nargout, ctx) {
    const rt = ctx.interp;
    rt.dirCache.clear();
    rt.fnCache.clear();
    rt.bumpGen();
    return [];
  },
  savepath(args, nargout, ctx) {
    const rt = ctx.interp;
    let file = args.length ? absPath(rt, textArg(args[0], 'savepath')) : null;
    if (!file) {
      const up = rt.userPath || joinPath(normPath(rt.fs.homeDir()), 'Documents/MySimulationMath');
      file = joinPath(up, 'pathdef' + M_EXT);
    }
    const quote = (s) => `'${s.replace(/'/g, "''")}'`;
    const text = ['function p = pathdef', '% PATHDEF  Search path saved by savepath.', '  p = [ ...', ...rt.path.map((d) => `    ${quote(d + pathSep(rt))}, ...`), '  ];', 'end', ''].join('\n');
    try {
      const d = dirName(file);
      if (!rt.fs.exists(d)) rt.fs.mkdir(d);
      rt.fs.writeText(file, text);
    } catch (e) {
      if (nargout > 0) return num(1);
      throw new MError('core:savepath:write', `savepath: cannot write "${file}": ${e.message || e}`);
    }
    return nargout > 0 ? num(0) : [];
  },

  // ---------------------------------------------------------------- help text
  get_help_text(args, nargout, ctx) {
    const rt = ctx.interp;
    const name = textArg(args[0], 'get_help_text');
    const t = helpTextOf(rt, name);
    return [str(t === null ? '' : t), str(t === null ? 'Not found' : 'plain text')];
  },
  get_help_text_from_file(args, nargout, ctx) {
    const rt = ctx.interp;
    const p = absPath(rt, textArg(args[0], 'get_help_text_from_file'));
    if (!rt.fs.exists(p)) return [str(''), str('Not found')];
    const src = rt.readSource(p);
    const lines = src.split(/\r?\n/);
    const k = lines.findIndex((l) => /^\s*function\b/.test(l));
    const t = helpComment(src, k >= 0 ? k + 1 : 1);
    return [str(t || ''), str(t ? 'plain text' : 'Not found')];
  },
  get_first_help_sentence(args, nargout, ctx) {
    const rt = ctx.interp;
    const name = textArg(args[0], 'get_first_help_sentence');
    const max = args.length > 1 ? toNum(args[1]) : 80;
    const t = helpTextOf(rt, name);
    if (t === null) return [str(''), num(1)];
    return [str(firstSentence(t, max)), num(0)];
  },

  // ---------------------------------------------------------------- history
  history(args, nargout, ctx) {
    const rt = ctx.interp;
    let quiet = false, count = null;
    for (let k = 0; k < args.length; k++) {
      const a = args[k];
      if (isTensor(a) && a.cls !== 'char') { count = toNum(a); continue; }
      const w = S(a);
      if (w === '-c') { rt.history.length = 0; return []; }
      if (w === '-q') { quiet = true; continue; }
      if (w === '-w' || w === '-a') {
        const file = absPath(rt, args[k + 1] ? S(args[++k]) : 'history.txt');
        const text = rt.history.join('\n') + '\n';
        if (w === '-a') rt.fs.appendText(file, text); else rt.fs.writeText(file, text);
        return [];
      }
      if (w === '-r') {
        const file = absPath(rt, args[k + 1] ? S(args[++k]) : 'history.txt');
        rt.history.push(...rt.fs.readText(file).split(/\r?\n/).filter((l) => l.trim()));
        return [];
      }
      if (/^-?\d+$/.test(w)) { count = Math.abs(Number(w)); continue; }
      throw new MError('core:history:badOption', `history: unrecognized option "${w}".`);
    }
    const all = rt.history;
    const start = count === null ? 0 : Math.max(0, all.length - count);
    const pick = all.slice(start);
    if (nargout > 0) return cellOfStr(pick);
    const w = String(all.length).length;
    rt.out(pick.map((c, i) => (quiet ? '' : `${String(start + i + 1).padStart(w + 1)} `) + c).join('\n') + (pick.length ? '\n' : ''));
    return [];
  },
  run_history(args, nargout, ctx) {
    const rt = ctx.interp;
    // the running command is the last entry; negative numbers count back from it
    const n = rt.history.length;
    const at = (v) => { const k = toNum(v); return k < 0 ? n + k : k; };
    let a = args.length ? at(args[0]) : n - 1;
    let b = args.length > 1 ? at(args[1]) : a;
    if (a > b) [a, b] = [b, a];
    if (!(a >= 1 && b < n)) throw new MError('core:run_history:range', `run_history: commands ${a} to ${b} are not in the history (1 to ${n - 1}).`);
    const cmds = rt.history.slice(a - 1, b);
    for (const c of cmds) {
      rt.print(c + '\n', 'echo');
      rt.evalIn(rt.baseFrame, c, true, 0);
    }
    return [];
  },
  add_input_event_hook(args, nargout, ctx) {
    const rt = ctx.interp;
    const fn = args[0];
    if (!fn || !(isText(fn) || isFuncHandle(fn))) throw new MError('core:add_input_event_hook:badFcn', 'add_input_event_hook: FCN must be a function handle or name.');
    const id = (isText(fn) ? S(fn) : handleText(fn)) + ':' + (rt.inputHooks.size + 1) + ':' + Date.now().toString(36);
    rt.inputHooks.set(id, { fn, data: args.length > 1 ? args[1] : undefined });
    return str(id);
  },
  remove_input_event_hook(args, nargout, ctx) {
    const rt = ctx.interp;
    const id = textArg(args[0], 'remove_input_event_hook');
    const warnInvalid = args.length < 2 || rt.truth(args[1]);
    if (!rt.inputHooks.delete(id) && warnInvalid) rt.warn('core:remove_input_event_hook:notFound', `remove_input_event_hook: ${id} not found in list.`);
    return [];
  },

  // ---------------------------------------------------------------- debugger
  isdebugmode(args, nargout, ctx) { return bool(!!ctx.interp.paused); },
  dbnext() { throw new MError('core:dbnext:notDebugging', 'dbnext is only available while debugging.'); },
  dbwhere(args, nargout, ctx) {
    const rt = ctx.interp;
    if (!rt.paused) { rt.out('stopped at top level\n'); return []; }
    const fr = rt.debugFrame();
    if (!fr || fr.ws === rt.base) { rt.out('stopped at top level\n'); return []; }
    const line = fr === rt.paused.frame ? rt.paused.line : fr.line;
    rt.out(`stopped in ${frameLabel(fr)} at line ${line}${fr.file ? ` [${fr.file}]` : ''}\n`);
    return [];
  },
  dbup(args, nargout, ctx) {
    const rt = ctx.interp;
    const p = needPaused(rt, 'dbup');
    const n = args.length ? toNum(args[0]) : 1;
    const frames = rt.debugFrames();
    p.level = Math.min(frames.length - 1, p.level + n);
    octaveBuiltins.dbwhere([], 0, ctx);
    return [];
  },
  dbdown(args, nargout, ctx) {
    const rt = ctx.interp;
    const p = needPaused(rt, 'dbdown');
    const n = args.length ? toNum(args[0]) : 1;
    p.level = Math.max(0, p.level - n);
    octaveBuiltins.dbwhere([], 0, ctx);
    return [];
  },
  dblist(args, nargout, ctx) {
    const rt = ctx.interp;
    needPaused(rt, 'dblist');
    const fr = rt.debugFrame();
    if (!fr || !fr.file) throw new MError('core:dblist:noFile', 'dblist: the current location has no file.');
    const line = fr === rt.paused.frame ? rt.paused.line : fr.line;
    const ctxLines = args.length ? toNum(args[0]) : 10;
    const lines = fileLines(rt, fr.file);
    const from = Math.max(1, line - Math.floor(ctxLines / 2));
    printLines(rt, lines, from, Math.min(lines.length, from + ctxLines), line);
    return [];
  },
  dbtype(args, nargout, ctx) {
    const rt = ctx.interp;
    let file = null, spec = null;
    for (const a of args) {
      const t = isTensor(a) && a.cls !== 'char' ? String(toNum(a)) : S(a);
      if (/^\d+(:\d+)?$/.test(t.trim()) && (file !== null || rt.paused)) spec = t.trim();
      else file = t;
    }
    if (file === null) {
      const fr = rt.paused ? rt.debugFrame() : null;
      if (!fr || !fr.file) throw new MError('core:dbtype:noFile', 'dbtype: no file given and not stopped in a function.');
      file = fr.file;
    }
    let path = fileFor(rt, file.replace(/>.*$/, ''));
    if (!path) { const t = rt.resolve(stripMExt(file)); path = t && t.kind === 'user' ? t.fi.file : null; }
    if (!path) throw new MError('core:dbtype:notFound', `dbtype: function "${file}" not found.`);
    const lines = fileLines(rt, path);
    let from = 1, to = lines.length;
    if (spec) { const [a, b] = spec.split(':').map(Number); from = a; to = b === undefined ? a : b; }
    printLines(rt, lines, Math.max(1, from), Math.min(lines.length, to), 0);
    return [];
  },

  // ---------------------------------------------------------------- GUI windows
  commandhistory(args, nargout, ctx) { ctx.interp.onEvent({ type: 'showPane', pane: 'history' }); return []; },
  filebrowser(args, nargout, ctx) { ctx.interp.onEvent({ type: 'showPane', pane: 'files' }); return []; },
  workspace(args, nargout, ctx) { ctx.interp.onEvent({ type: 'showPane', pane: 'workspace' }); return []; },
  preferences(args, nargout, ctx) {
    if (args.length) throw new MError('core:preferences:tooManyInputs', 'preferences: no input arguments are accepted.');
    ctx.interp.onEvent({ type: 'showPreferences' });
    return [];
  },
  openvar(args, nargout, ctx) {
    const rt = ctx.interp;
    const name = textArg(args[0], 'openvar');
    if (rt.readWs(rt.currentWs(), name) === undefined) throw new MError('core:openvar:notFound', `openvar: "${name}" is not a variable.`);
    rt.onEvent({ type: 'openVariable', name });
    return [];
  },

  // ---------------------------------------------------------------- profiling
  profshow(args, nargout, ctx) {
    const rt = ctx.interp;
    let data = null, n = 20;
    for (const a of args) { if (isStruct(a)) data = a; else n = toNum(a); }
    if (!data) data = rt.callAny('profile', [str('info')], 1)[0];
    const tbl = data.data[0].FunctionTable;
    const rows = (tbl && isStruct(tbl) ? tbl.data : []).map((r) => ({ name: S(r.FunctionName), calls: toNum(r.NumCalls), time: toNum(r.TotalTime) }));
    rows.sort((a, b) => b.time - a.time);
    const total = rows.reduce((s, r) => s + r.time, 0) || 1;
    const w = Math.max(8, ...rows.map((r) => r.name.length));
    let out = `   #  ${'Function'.padEnd(w)}  Time (s)  Time (%)    Calls\n  ${'-'.repeat(w + 34)}\n`;
    rows.slice(0, n).forEach((r, i) => { out += `${String(i + 1).padStart(4)}  ${r.name.padEnd(w)}  ${r.time.toFixed(3).padStart(8)}  ${(100 * r.time / total).toFixed(2).padStart(8)}  ${String(r.calls).padStart(7)}\n`; });
    rt.out(out);
    return [];
  },
  profexport(args, nargout, ctx) {
    const rt = ctx.interp;
    const dir = absPath(rt, textArg(args[0], 'profexport'));
    let name = 'Profile', data = null;
    for (const a of args.slice(1)) { if (isStruct(a)) data = a; else if (isText(a)) name = S(a); }
    if (!data) data = rt.callAny('profile', [str('info')], 1)[0];
    const tbl = data.data[0].FunctionTable;
    const rows = (tbl && isStruct(tbl) ? tbl.data : []).map((r) => ({ name: S(r.FunctionName), calls: toNum(r.NumCalls), time: toNum(r.TotalTime) }));
    rows.sort((a, b) => b.time - a.time);
    const total = rows.reduce((s, r) => s + r.time, 0);
    const html = ['<!DOCTYPE html>', '<html><head><meta charset="utf-8">', `<title>${htmlEscape(name)}</title>`,
      '<style>body{font-family:sans-serif}table{border-collapse:collapse}td,th{border:1px solid #999;padding:2px 8px}td.n{text-align:right}</style>',
      '</head><body>', `<h1>${htmlEscape(name)}</h1>`, `<p>Total time: ${total.toFixed(3)} s</p>`,
      '<table><tr><th>#</th><th>Function</th><th>Time (s)</th><th>Time (%)</th><th>Calls</th></tr>',
      ...rows.map((r, i) => `<tr><td class="n">${i + 1}</td><td>${htmlEscape(r.name)}</td><td class="n">${r.time.toFixed(3)}</td><td class="n">${total ? (100 * r.time / total).toFixed(2) : '0.00'}</td><td class="n">${r.calls}</td></tr>`),
      '</table></body></html>', ''].join('\n');
    if (!rt.fs.exists(dir)) rt.fs.mkdir(dir);
    rt.fs.writeText(joinPath(dir, 'index.html'), html);
    return [];
  },

  profexplore(args, nargout, ctx) {
    const rt = ctx.interp;
    if (args.length > 1) throw new MError('core:profexplore:tooManyInputs', 'profexplore: at most one input (the profiler data) is accepted.');
    const data = args.length ? args[0] : rt.callAny('profile', [str('info')], 1)[0];
    if (!isStruct(data) || prod(data.dims) !== 1 || !data.fields.includes('FunctionTable') || !data.fields.includes('Hierarchical')) {
      throw new MError('core:profexplore:badData', 'profexplore: DATA must be the struct returned by profile("info") (fields FunctionTable and Hierarchical).');
    }
    const rec = data.data[0];
    const table = isStruct(rec.FunctionTable) ? rec.FunctionTable.data : [];
    const fname = (idx) => { const r = table[idx - 1]; return r ? S(r.FunctionName) : `<function ${idx}>`; };
    const field = (r, k) => (r[k] !== undefined ? toNum(r[k]) : 0);
    const ask = () => S(rt.callAny('input', [str('profexplore> '), str('s')], 1)[0]).trim();
    // returns -1 to leave the explorer, else the number of levels still to go up
    const worker = (tree, parents, prefix, top) => {
      const nodes = (isStruct(tree) ? tree.data.slice() : []).sort((a, b) => field(b, 'TotalTime') - field(a, 'TotalTime'));
      for (;;) {
        let out = `\n${parents}\n`;
        nodes.forEach((r, i) => {
          out += `${prefix}${i + 1}) ${fname(field(r, 'Index'))}\n`;
          out += `${prefix}  ${field(r, 'NumCalls')} calls, ${field(r, 'TotalTime').toFixed(3)} total, ${field(r, 'SelfTime').toFixed(3)} self\n`;
        });
        rt.out(out);
        const cmd = ask();
        if (cmd === 'exit' || cmd === 'quit') return -1;
        if (cmd === 'help') {
          rt.out('\nCommands for profile explorer:\n\nexit   Return to the prompt.\nquit   Return to the prompt.\nhelp   Display this help message.\nup [N] Go up N levels, where N is an integer.  Default is 1.\nN      Go down a level into option N.\n');
          continue;
        }
        const up = /^up(?:\s+(\S+))?$/.exec(cmd);
        if (up) {
          const n = up[1] === undefined ? 1 : Number(up[1]);
          if (!Number.isInteger(n) || n < 1) { rt.out('Invalid argument to the up command (a positive integer is required).\n'); continue; }
          if (top) { rt.out('Already at the top level.\n'); continue; }
          return n - 1;
        }
        const k = cmd === '' ? NaN : Math.trunc(Number(cmd));
        if (Number.isNaN(k)) { if (cmd !== '') rt.out(`Unknown command "${cmd}"; type "help" for the list of commands.\n`); continue; }
        if (k < 1 || k > nodes.length) { rt.out('The chosen option is out of range!\n'); continue; }
        const r = nodes[k - 1];
        const rv = worker(r.Children, `${parents}\n${prefix}${fname(field(r, 'Index'))}`, `${prefix}  `, false);
        if (rv < 0) return -1;
        if (rv > 0 && !top) return rv - 1;
      }
    };
    worker(rec.Hierarchical, 'Top', '  ', true);
    return [];
  },

  // ---------------------------------------------------------------- classes and literals
  isnull(args) {
    // a call written isnull([]) / isnull('') / isnull("") is answered by the compiler (compile.js);
    // here the argument is an evaluated value, never a null literal
    if (args.length !== 1) throw new MError('core:isnull:wrongNumberOfInputs', 'isnull: exactly one input argument is required.');
    return bool(false);
  },
  superiorto(args, nargout, ctx) { classPrecedence(ctx.interp, args, 'superiorto'); return []; },
  inferiorto(args, nargout, ctx) { classPrecedence(ctx.interp, args, 'inferiorto'); return []; },

  // ---------------------------------------------------------------- tests and demos
  test(args, nargout, ctx) {
    const rt = ctx.interp;
    if (!args.length) throw new MError('core:minrhs', 'test: needs the name of a function or file.');
    const name = textArg(args[0], 'test');
    const mode = args.length > 1 ? S(args[1]).toLowerCase() : 'normal';
    if (!['normal', 'quiet', 'verbose'].includes(mode)) throw new MError('core:test:badMode', `test: unknown mode "${mode}" (normal, quiet or verbose).`);
    const out = (t) => rt.out(t);
    const r = runTests(rt, name, mode, out);
    if (!r) {
      if (nargout > 0) return [bool(false), num(0), num(0), num(0), num(0)];
      rt.out(`????? ${name} not found\n`);
      return [];
    }
    const success = r.n + r.nxfail === r.nmax;
    if (nargout > 0) return [bool(success), num(r.n), num(r.nmax), num(r.nxfail), num(0)];
    if (r.nmax === 0) rt.out(`????? ${name} has no tests available\n`);
    else rt.out(`PASSES ${r.n} out of ${r.nmax} test${r.nmax === 1 ? '' : 's'}${r.nxfail ? `\n\nExpected failures (XFAIL): ${r.nxfail}` : ''}\n`);
    return [];
  },
  oruntests(args, nargout, ctx) {
    const rt = ctx.interp;
    const dirs = args.length ? args.map((a) => absPath(rt, S(a))) : [normPath(rt.fs.cwd())];
    let pass = 0, total = 0, xfail = 0;
    for (const dir of dirs) {
      rt.out(`Processing files in ${dir}:\n\n`);
      for (const p of mFilesIn(rt, dir)) {
        const src = rt.fs.readText(p);
        if (!testBlocks(src).some((b) => !['function', 'endfunction', 'demo', 'shared'].includes(b.type))) continue;
        const r = runTests(rt, p, 'quiet', () => {});
        pass += r.n; total += r.nmax; xfail += r.nxfail;
        const ok = r.n + r.nxfail === r.nmax;
        rt.out(`  ${baseName(p).padEnd(40, ' ')} ${ok ? 'PASS' : 'FAIL'} ${String(r.n).padStart(4)}/${String(r.nmax).padEnd(4)}${r.nxfail ? ` (${r.nxfail} XFAIL)` : ''}\n`);
      }
      rt.out('\n');
    }
    rt.out(`Summary:\n\n  PASS ${String(pass).padStart(6)}\n  FAIL ${String(total - pass - xfail).padStart(6)}\n${xfail ? `  XFAIL ${String(xfail).padStart(5)}\n` : ''}`);
    return [];
  },
  demo(args, nargout, ctx) {
    const rt = ctx.interp;
    const name = textArg(args[0], 'demo');
    const d = demoBlocks(rt, name);
    if (!d) throw new MError('core:demo:notFound', `demo: function "${name}" not found.`);
    if (!d.demos.length) { rt.out(`demo: no demos available for ${name}\n`); return []; }
    withDirOnPath(rt, d.file.path, () => {
      for (const k of pickIdx(args, 1, d.demos.length, 'demo')) {
        const code = d.demos[k - 1];
        rt.out(`${name} example ${k}:\n${code.split('\n').map((l) => ' ' + l).join('\n')}\n\n`);
        runIsolated(rt, code, {}, d.file.path, name, isOctaveSource(d.file.src || ''));
      }
    });
    return [];
  },
  example(args, nargout, ctx) {
    const rt = ctx.interp;
    const name = textArg(args[0], 'example');
    const d = demoBlocks(rt, name);
    if (!d) throw new MError('core:example:notFound', `example: function "${name}" not found.`);
    if (!d.demos.length) { if (nargout > 0) return [str(''), tensor('double', [1, 0])]; rt.out(`example: no example available for ${name}\n`); return []; }
    const pick = pickIdx(args, 1, d.demos.length, 'example');
    if (nargout > 0) {
      let s = ''; const idx = [];
      for (const k of pick) { idx.push(s.length + 1); s += d.demos[k - 1] + '\n'; }
      return [str(s), tensor('double', [1, idx.length], idx)];
    }
    for (const k of pick) rt.out(`${name} example ${k}:\n${d.demos[k - 1].split('\n').map((l) => ' ' + l).join('\n')}\n\n`);
    return [];
  },
  rundemos(args, nargout, ctx) {
    const rt = ctx.interp;
    const dirs = args.length ? args.map((a) => absPath(rt, S(a))) : [normPath(rt.fs.cwd())];
    for (const dir of dirs) {
      for (const p of mFilesIn(rt, dir)) {
        const demos = testBlocks(rt.fs.readText(p)).filter((b) => b.type === 'demo');
        if (!demos.length) continue;
        octaveBuiltins.demo([str(p)], 0, ctx);
      }
    }
    return [];
  },
  speed(args, nargout, ctx) {
    // speed(f1, init, max_n, f2, tol): run times of code text f1 (and f2) for growing n
    const rt = ctx.interp;
    const f1 = textArg(args[0], 'speed');
    const init = args.length > 1 && !(isTensor(args[1]) && prod(args[1].dims) === 0) ? textArg(args[1], 'speed') : '';
    const maxN = args.length > 2 && prod(args[2].dims) ? toNum(args[2]) : 100;
    const f2 = args.length > 3 && isText(args[3]) && S(args[3]).trim() ? S(args[3]) : null;
    const tol = args.length > 4 ? toNum(args[4]) : Number.EPSILON;
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const steps = maxN <= 1 ? [1] : [...new Set(Array.from({ length: 10 }, (_, i) => Math.max(1, Math.round(Math.exp(Math.log(maxN) * i / 9)))))];
    const time = (code, vars) => {
      // repeat until at least ~2 ms so tiny n are measurable
      let reps = 0, t0 = now(), ws = null;
      do { ws = runIsolated(rt, code, vars, null, 'speed'); reps++; } while (now() - t0 < 2 && reps < 1000);
      return { t: (now() - t0) / 1000 / reps, ws };
    };
    const T1 = [], T2 = [];
    for (const n of steps) {
      ctx.checkInterrupt();
      const vars = init ? runIsolated(rt, init, { n: num(n) }, null, 'speed').vars : { n: num(n) };
      const vars0 = { ...vars, n: num(n) };
      const a = time(f1, vars0);
      T1.push(a.t);
      if (f2) {
        const b = time(f2, vars0);
        T2.push(b.t);
        // the two versions must give the same x (when they set one)
        const x1 = a.ws.vars.x, x2 = b.ws.vars.x;
        if (x1 !== undefined && x2 !== undefined && tol !== 0) {
          const rows = compareValues(rt, x1, x2, -Math.abs(tol));
          if (rows.length) throw new MError('core:speed:mismatch', `speed: f1 and f2 give different results for n = ${n}.\n${assertMessage(rows)}`);
        }
      }
    }
    // run time ~ a * n^p from the larger half of the points
    const half = Math.max(0, Math.floor(steps.length / 2) - 1);
    const xs = steps.slice(half).map(Math.log), ys = T1.slice(half).map((t) => Math.log(Math.max(t, 1e-12)));
    const mx = xs.reduce((s, v) => s + v, 0) / xs.length, my = ys.reduce((s, v) => s + v, 0) / ys.length;
    const sxx = xs.reduce((s, v) => s + (v - mx) ** 2, 0);
    const p = sxx > 0 ? xs.reduce((s, v, i) => s + (v - mx) * (ys[i] - my), 0) / sxx : 0;
    const a = Math.exp(my - p * mx);
    const order = structOf({ p: num(p), a: num(a) });
    const nVec = tensor('double', [steps.length, 1], steps);
    const t1 = tensor('double', [steps.length, 1], T1);
    const t2 = tensor('double', [T2.length, 1], T2);
    if (nargout > 0) return [order, nVec, t1, t2];
    let out = `\n${'n'.padStart(8)}  ${'f1 time (s)'.padStart(12)}${f2 ? `  ${'f2 time (s)'.padStart(12)}  ${'ratio'.padStart(8)}` : ''}\n`;
    steps.forEach((n, i) => { out += `${String(n).padStart(8)}  ${T1[i].toExponential(3).padStart(12)}${f2 ? `  ${T2[i].toExponential(3).padStart(12)}  ${(T1[i] / T2[i]).toFixed(3).padStart(8)}` : ''}\n`; });
    if (f2) out += `\nMean runtime ratio = ${(T1.reduce((s, t, i) => s + t / T2[i], 0) / T1.length).toPrecision(3)} for maximum n = ${steps[steps.length - 1]}\n`;
    else out += `\nFor ${f1} order is n^${p.toFixed(2)}, time ≈ ${a.toPrecision(3)} * n^${p.toFixed(2)} s\n`;
    rt.out(out);
    return [];
  },

  // ---------------------------------------------------------------- publishing
  publish(args, nargout, ctx) {
    const rt = ctx.interp;
    const file = fileFor(rt, textArg(args[0], 'publish')) || absPath(rt, textArg(args[0], 'publish'));
    if (!rt.fs.exists(file)) throw new MError('core:publish:fileNotFound', `publish: file "${S(args[0])}" not found.`);
    let format = 'html', outDir = null, evalCode = true, showCode = true;
    const opt = (k, v) => {
      const key = k.toLowerCase();
      if (key === 'format') format = S(v).toLowerCase();
      else if (key === 'outputdir') outDir = absPath(rt, S(v));
      else if (key === 'evalcode') evalCode = rt.truth(v);
      else if (key === 'showcode') showCode = rt.truth(v);
    };
    if (args.length === 2 && isText(args[1])) format = S(args[1]).toLowerCase();
    else if (args.length === 2 && isStruct(args[1])) for (const f of args[1].fields) opt(f, args[1].data[0][f]);
    else for (let k = 1; k + 1 < args.length; k += 2) opt(S(args[k]), args[k + 1]);
    if (format !== 'html' && format !== 'latex') throw new MError('core:publish:format', `publish: unsupported format "${format}" (html or latex).`);
    const src = rt.readSource(file);
    const cells = publishCells(src);
    const name = stripMExt(baseName(file));
    // run the cells one after another in a fresh workspace, collecting each cell's output
    const ws = new Workspace(null, null);
    const frame = new Frame(ws, null, file, name, 'script');
    const outputs = cells.map((c) => {
      if (!evalCode || !c.code.trim()) return '';
      let text = '';
      const depth = rt.stack.length;
      rt.stack.push(frame);
      try {
        text = capture(rt, () => {
          try { rt.evalIn(frame, c.code, false, 0); } catch (e) {
            const me = rt.catchable(e);
            if (!me) throw e;
            rt.print(`error: ${me.message}\n`, 'err');
          }
        });
      } finally { rt.stack.length = depth; }
      return text;
    });
    const dir = outDir || joinPath(dirName(file), format === 'html' ? 'html' : 'latex');
    if (!rt.fs.exists(dir)) rt.fs.mkdir(dir);
    let doc;
    const title = cells.length && cells[0].title ? cells[0].title : name;
    if (format === 'html') {
      const parts = ['<!DOCTYPE html>', '<html><head><meta charset="utf-8">', `<title>${htmlEscape(title)}</title>`,
        '<style>body{font-family:sans-serif;max-width:50em;margin:auto}pre.codeinput{background:#f4f4f4;padding:6px;border:1px solid #ddd}pre.codeoutput{color:#555;padding:6px}</style>',
        '</head><body>'];
      cells.forEach((c, i) => {
        if (c.title) parts.push(i === 0 ? `<h1>${htmlEscape(c.title)}</h1>` : `<h2>${htmlEscape(c.title)}</h2>`);
        const paras = c.text.join('\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
        for (const p of paras) parts.push(`<p>${htmlEscape(p)}</p>`);
        if (showCode && c.code.trim()) parts.push(`<pre class="codeinput">${htmlEscape(c.code)}</pre>`);
        if (outputs[i]) parts.push(`<pre class="codeoutput">${htmlEscape(outputs[i].replace(/\s+$/, ''))}</pre>`);
      });
      parts.push(`<!--\n##### SOURCE BEGIN #####\n${src.replace(/-->/g, '- ->')}\n##### SOURCE END #####\n-->`, '</body></html>', '');
      doc = parts.join('\n');
    } else {
      const parts = ['\\documentclass{article}', '\\usepackage[utf8]{inputenc}', `\\title{${latexEscape(title)}}`, '\\begin{document}', '\\maketitle'];
      cells.forEach((c, i) => {
        if (c.title && i > 0) parts.push(`\\section*{${latexEscape(c.title)}}`);
        const paras = c.text.join('\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
        for (const p of paras) parts.push(latexEscape(p), '');
        if (showCode && c.code.trim()) parts.push('\\begin{verbatim}', c.code, '\\end{verbatim}');
        if (outputs[i]) parts.push('\\begin{verbatim}', outputs[i].replace(/\s+$/, ''), '\\end{verbatim}');
      });
      parts.push('\\end{document}', '');
      doc = parts.join('\n');
    }
    const outFile = joinPath(dir, name + (format === 'html' ? '.html' : '.tex'));
    rt.fs.writeText(outFile, doc);
    return nargout > 0 ? str(outFile) : [];
  },
  grabcode(args, nargout, ctx) {
    const rt = ctx.interp;
    const p = absPath(rt, textArg(args[0], 'grabcode'));
    if (!rt.fs.exists(p)) throw new MError('core:grabcode:fileNotFound', `grabcode: file "${S(args[0])}" not found.`);
    const html = rt.fs.readText(p);
    let code;
    const m = /##### SOURCE BEGIN #####\r?\n([\s\S]*?)\r?\n##### SOURCE END #####/.exec(html);
    if (m) code = m[1].replace(/- ->/g, '-->');
    else {
      const blocks = [];
      const re = /<pre class="codeinput"[^>]*>([\s\S]*?)<\/pre>/g;
      for (let b; (b = re.exec(html));) blocks.push(htmlUnescape(b[1].replace(/<[^>]+>/g, '')));
      code = blocks.join('\n\n');
    }
    if (nargout > 0) return str(code);
    rt.out(code.replace(/\n?$/, '\n'));
    return [];
  },
};

// ------------------------------------------------------------------ help
const H = (en, ko, syntax) => ({ en, ko, syntax });
export const octaveHelp = {
  evalc: H('Evaluate code and return everything it writes to the Command Window as text.', '코드를 실행하고 명령 창에 쓴 내용 전체를 텍스트로 돌려줍니다.', ['s = evalc(code)', 's = evalc(code, catchCode)']),
  source: H('Run the commands of a file as a script (also a file that defines functions).', '파일의 명령을 스크립트로 실행합니다 (함수를 정의하는 파일도).', ['source(file)', "source(file, 'base')"]),
  nthargout: H('The N-th output (or a cell of several outputs) of a function call.', '함수 호출의 N번째 출력 (여러 개면 셀).', ['arg = nthargout(n, fcn, x1, ...)', 'arg = nthargout(n, ntot, fcn, x1, ...)', 'c = nthargout([1 3], fcn, ...)']),
  isargout: H('True if output K of the running function is used by the caller (not ~ and within nargout).', '실행 중인 함수의 K번째 출력을 호출자가 쓰면 true (~가 아니고 nargout 이내).', ['tf = isargout(k)']),
  print_usage: H('Raise an "Invalid call" error with the usage lines from the help of the running function.', '실행 중인 함수 도움말의 사용법으로 "잘못된 호출" 오류를 발생시킵니다.', ['print_usage()', 'print_usage(name)']),
  parseparams: H('Split leading regular arguments from trailing name/value pairs; optionally parse the pairs against defaults.', '앞쪽 일반 인수와 뒤쪽 이름/값 쌍을 나누고, 기본값과 맞추어 해석할 수도 있습니다.', ['[reg, prop] = parseparams(params)', '[reg, v1, v2] = parseparams(params, name1, default1, name2, default2)']),
  is_function_handle: H('True for a function handle.', '함수 핸들이면 true.', ['tf = is_function_handle(x)']),
  symvar: H('Variable names used in an expression text (functions and constants such as pi left out).', '식 텍스트에 쓰인 변수 이름 (함수와 pi 같은 상수는 제외).', ['c = symvar(s)']),
  typeinfo: H('Internal type name of a value (scalar, matrix, bool, sq_string, cell, …); without input, all type names.', '값의 내부 형식 이름 (scalar, matrix, bool, sq_string, cell …); 입력이 없으면 모든 형식 이름.', ['t = typeinfo(x)', 'c = typeinfo()']),
  isglobal: H('True if the name is a global variable in the current workspace.', '이름이 현재 작업 공간의 전역 변수이면 true.', ['tf = isglobal(name)']),
  localfunctions: H('Handles to the local functions of the running file.', '실행 중인 파일의 로컬 함수 핸들.', ['c = localfunctions']),
  numArgumentsFromSubscript: H('Number of outputs an indexing expression produces (the default a class may overload).', '인덱싱 식이 내는 출력 개수 (클래스가 다시 정의할 수 있는 기본 동작).', ['n = numArgumentsFromSubscript(obj, s, indexingContext)']),
  loadobj: H('Restore an object after loading: calls the class loadobj method when it has one.', '불러온 뒤 객체를 복원합니다: 클래스에 loadobj 메서드가 있으면 호출합니다.', ['b = loadobj(a)']),
  saveobj: H('Prepare an object for saving: calls the class saveobj method when it has one.', '저장하기 전에 객체를 준비합니다: 클래스에 saveobj 메서드가 있으면 호출합니다.', ['b = saveobj(a)']),
  lasterror: H('The last error as a struct (message, identifier, stack); reset or set it.', '마지막 오류를 구조체로 (message, identifier, stack); 초기화하거나 설정합니다.', ['err = lasterror()', "lasterror('reset')", 'lasterror(err)']),
  errno: H('Last system error number; errno(name) gives the number of an error name.', '마지막 시스템 오류 번호; errno(name)은 오류 이름의 번호.', ['err = errno()', 'old = errno(val)', "n = errno('ENOENT')"]),
  errno_list: H('Struct of system error names and their numbers.', '시스템 오류 이름과 번호의 구조체.', ['s = errno_list()']),
  fail: H('Check that code raises an error (or a warning) whose message matches a pattern.', '코드가 패턴에 맞는 메시지의 오류(또는 경고)를 내는지 검사합니다.', ['fail(code)', 'fail(code, pattern)', "fail(code, 'warning', pattern)"]),
  assert_equal: H('Error unless the observed value equals the expected one (within a tolerance).', '관찰값이 기대값과 (허용 오차 안에서) 같지 않으면 오류.', ['assert_equal(observed, expected)', 'assert_equal(observed, expected, tol)']),
  beep_on_error: H('Query or set whether a beep sounds when an error is reported.', '오류를 보고할 때 경고음을 낼지 조회하거나 설정합니다.', ['val = beep_on_error()', 'old = beep_on_error(newVal)', "beep_on_error(newVal, 'local')"]),
  debug_on_error: H('Query or set whether the debugger stops when an error occurs (as dbstop if error).', '오류가 나면 디버거에서 멈출지 조회하거나 설정합니다 (dbstop if error와 같음).', ['val = debug_on_error()', 'old = debug_on_error(newVal)', "debug_on_error(newVal, 'local')"]),
  debug_on_warning: H('Query or set whether the debugger stops when a warning is issued.', '경고가 나면 디버거에서 멈출지 조회하거나 설정합니다.', ['val = debug_on_warning()', 'old = debug_on_warning(newVal)', "debug_on_warning(newVal, 'local')"]),
  debug_on_interrupt: H('Query or set whether an interrupt (Ctrl+C) stops in the debugger instead of ending the run.', '중단(Ctrl+C) 시 실행을 끝내지 않고 디버거에서 멈출지 조회하거나 설정합니다.', ['val = debug_on_interrupt()', 'old = debug_on_interrupt(newVal)', "debug_on_interrupt(newVal, 'local')"]),
  silent_functions: H('Query or set whether results inside functions stay undisplayed even without a semicolon.', '함수 안에서는 세미콜론이 없어도 결과를 표시하지 않을지 조회하거나 설정합니다.', ['val = silent_functions()', 'old = silent_functions(newVal)', "silent_functions(newVal, 'local')"]),
  max_recursion_depth: H('Query or set the maximum recursion depth of function calls.', '함수 호출의 최대 재귀 깊이를 조회하거나 설정합니다.', ['val = max_recursion_depth()', 'old = max_recursion_depth(newVal)', "max_recursion_depth(newVal, 'local')"]),
  max_stack_depth: H('Query or set the maximum depth of the call stack.', '호출 스택의 최대 깊이를 조회하거나 설정합니다.', ['val = max_stack_depth()', 'old = max_stack_depth(newVal)', "max_stack_depth(newVal, 'local')"]),
  missing_function_hook: H('Query or set the function called with the name of an undefined function before the error is raised.', '정의되지 않은 함수가 호출되면 오류 전에 그 이름으로 부를 함수를 조회하거나 설정합니다.', ['val = missing_function_hook()', 'old = missing_function_hook(newName)']),
  mfile_encoding: H('Query or set the text encoding used to read M files.', 'M 파일을 읽을 때 쓰는 텍스트 인코딩을 조회하거나 설정합니다.', ['val = mfile_encoding()', "old = mfile_encoding('windows-1252')"]),
  dir_encoding: H('Query or set the text encoding of the M files in one folder.', '한 폴더의 M 파일 텍스트 인코딩을 조회하거나 설정합니다.', ['enc = dir_encoding(dir)', 'old = dir_encoding(dir, enc)']),
  autoload: H('Load a function from a given file when it is first called; list or remove such entries.', '함수를 처음 호출할 때 지정한 파일에서 불러옵니다; 목록을 보거나 제거합니다.', ['autoload(name, file)', "autoload(name, file, 'remove')", 's = autoload()']),
  mlock: H('Lock the running function in memory (clear name keeps it).', '실행 중인 함수를 메모리에 고정합니다 (clear name으로 지워지지 않음).', ['mlock()']),
  munlock: H('Unlock a function locked with mlock.', 'mlock으로 고정한 함수를 풉니다.', ['munlock()', 'munlock(name)']),
  mislocked: H('True if a function is locked in memory.', '함수가 메모리에 고정되어 있으면 true.', ['tf = mislocked()', 'tf = mislocked(name)']),
  memoize: H('Function handle that caches results by input (the last 10 distinct calls).', '입력별로 결과를 캐시하는 함수 핸들 (서로 다른 최근 호출 10개).', ['mf = memoize(fh)', 'y = mf(x)']),
  clearAllMemoizedCaches: H('Empty the caches of every memoized function.', '모든 memoize 함수의 캐시를 비웁니다.', ['clearAllMemoizedCaches']),
  atexit: H('Register a function to run when the session exits (exit / quit); unregister it with false.', '세션이 끝날 때(exit / quit) 실행할 함수를 등록합니다; false로 등록을 취소합니다.', ['atexit(fcn)', 'status = atexit(fcn, false)']),
  exit: H('End the session: runs the atexit functions, then asks the application to close the session.', '세션을 끝냅니다: atexit 함수를 실행한 뒤 응용 프로그램에 세션 종료를 요청합니다.', ['exit', 'exit(status)']),
  quit: H('End the session (same as exit).', '세션을 끝냅니다 (exit와 같음).', ['quit', 'quit(status)']),
  file_in_loadpath: H('Full path of a file found in the current folder or the search path.', '현재 폴더나 검색 경로에서 찾은 파일의 전체 경로.', ['p = file_in_loadpath(file)', "c = file_in_loadpath(file, 'all')"]),
  file_in_path: H('Full path of a file found in the folders of a path text.', '경로 텍스트의 폴더에서 찾은 파일의 전체 경로.', ['p = file_in_path(path, file)', "c = file_in_path(path, file, 'all')"]),
  dir_in_loadpath: H('Full path of a folder found in the current folder or the search path.', '현재 폴더나 검색 경로에서 찾은 폴더의 전체 경로.', ['p = dir_in_loadpath(dir)', "c = dir_in_loadpath(dir, 'all')"]),
  command_line_path: H('Search path folders given on the command line (none in this application).', '명령줄로 준 검색 경로 폴더 (이 응용 프로그램에는 없음).', ['p = command_line_path()']),
  pathdef: H('The default search path (as at the start of the session).', '기본 검색 경로 (세션 시작 때의 경로).', ['p = pathdef()']),
  restoredefaultpath: H('Reset the search path to the default.', '검색 경로를 기본값으로 되돌립니다.', ['p = restoredefaultpath()']),
  rehash: H('Re-scan the folders of the search path for new or changed files.', '검색 경로 폴더의 새 파일이나 바뀐 파일을 다시 찾습니다.', ['rehash()']),
  savepath: H('Save the current search path to a file (pathdef function).', '현재 검색 경로를 파일(pathdef 함수)로 저장합니다.', ['savepath()', 'status = savepath(file)']),
  get_help_text: H('Help text of a function and its format.', '함수의 도움말 텍스트와 형식.', ['[text, format] = get_help_text(name)']),
  get_help_text_from_file: H('Help text of an M file and its format.', 'M 파일의 도움말 텍스트와 형식.', ['[text, format] = get_help_text_from_file(file)']),
  get_first_help_sentence: H('First sentence of the help text of a function.', '함수 도움말의 첫 문장.', ['[text, status] = get_first_help_sentence(name)', 'text = get_first_help_sentence(name, maxLen)']),
  history: H('List, save, load or clear the Command Window command history.', '명령 창 명령 기록을 나열·저장·불러오기·지우기 합니다.', ['history', 'history(n)', 'history -q', 'history -c', 'history -w file', 'history -r file', 'c = history()']),
  run_history: H('Run commands again from the command history (negative numbers count back).', '명령 기록의 명령을 다시 실행합니다 (음수는 뒤에서부터).', ['run_history(n)', 'run_history(first, last)', 'run_history(-1)']),
  add_input_event_hook: H('Register a function called each time the Command Window becomes idle; returns its id.', '명령 창이 대기 상태가 될 때마다 호출할 함수를 등록하고 그 id를 돌려줍니다.', ['id = add_input_event_hook(fcn)', 'id = add_input_event_hook(fcn, data)']),
  remove_input_event_hook: H('Remove a function registered with add_input_event_hook.', 'add_input_event_hook으로 등록한 함수를 제거합니다.', ['remove_input_event_hook(id)', 'remove_input_event_hook(id, warnInvalid)']),
  isdebugmode: H('True while stopped in the debugger.', '디버거에서 멈춰 있는 동안 true.', ['tf = isdebugmode()']),
  dbnext: H('Execute the next line (debug mode; same as dbstep).', '다음 줄을 실행합니다 (디버그 모드; dbstep과 같음).', ['dbnext']),
  dbwhere: H('Show where the debugger is stopped.', '디버거가 멈춘 위치를 보여 줍니다.', ['dbwhere']),
  dbup: H('Move the debug workspace up the call stack (to the caller).', '디버그 작업 공간을 호출 스택 위(호출자)로 옮깁니다.', ['dbup', 'dbup(n)']),
  dbdown: H('Move the debug workspace down the call stack.', '디버그 작업 공간을 호출 스택 아래로 옮깁니다.', ['dbdown', 'dbdown(n)']),
  dblist: H('List the source lines around the current debug line.', '현재 디버그 줄 주변의 소스 줄을 보여 줍니다.', ['dblist', 'dblist(n)']),
  dbtype: H('Show the source of a function file with line numbers.', '함수 파일 소스를 줄 번호와 함께 보여 줍니다.', ['dbtype name', 'dbtype name 10:20', 'dbtype 5']),
  commandhistory: H('Show the command history pane.', '명령 기록 창을 보여 줍니다.', ['commandhistory']),
  filebrowser: H('Show the file browser pane.', '파일 탐색기 창을 보여 줍니다.', ['filebrowser']),
  workspace: H('Show the workspace pane.', '작업 공간 창을 보여 줍니다.', ['workspace']),
  openvar: H('Open a variable in the variable editor.', '변수 편집기에서 변수를 엽니다.', ['openvar(name)']),
  profshow: H('Print a table of profiler data (the N most expensive functions).', '프로파일러 데이터 표를 출력합니다 (시간이 가장 많이 든 N개 함수).', ['profshow()', 'profshow(n)', 'profshow(data, n)']),
  profexport: H('Write profiler data as an HTML report into a folder.', '프로파일러 데이터를 HTML 보고서로 폴더에 씁니다.', ['profexport(dir)', 'profexport(dir, name, data)']),
  profexplore: H('Interactive browser of the profiler call tree in the Command Window: a number goes down into that function, "up [N]" goes up, "help" lists the commands, "exit" or "quit" ends. Without DATA it uses profile("info").', '명령 창에서 프로파일러 호출 트리를 둘러봅니다: 번호는 그 함수 안으로, "up [N]" 은 위로, "help" 는 명령 목록, "exit" 또는 "quit" 은 끝냅니다. DATA 가 없으면 profile("info") 를 씁니다.', ['profexplore', 'profexplore(data)']),
  preferences: H('Open the settings dialog of the application.', '응용 프로그램의 설정 대화 상자를 엽니다.', ['preferences']),
  isnull: H('True when the argument is written as a null literal ([], \'\' or "") right in the call; false for a variable holding an empty value. Used to tell A(idx) = [] (deletion) apart from assigning an empty value.', '인수가 호출 안에 널 리터럴([], \'\', "")로 직접 쓰였으면 true; 빈 값을 담은 변수는 false. A(idx) = [] (삭제)와 빈 값 대입을 구별할 때 씁니다.', ['tf = isnull(x)']),
  superiorto: H('Called in a class constructor or method: objects of this class take precedence over the named classes when a function or operator gets objects of several classes.', '클래스 생성자나 메서드 안에서 호출: 함수나 연산자가 여러 클래스의 객체를 받을 때 이 클래스가 지정한 클래스보다 우선합니다.', ['superiorto(class_name, ...)']),
  inferiorto: H('Called in a class constructor or method: the named classes take precedence over this class when a function or operator gets objects of several classes.', '클래스 생성자나 메서드 안에서 호출: 함수나 연산자가 여러 클래스의 객체를 받을 때 지정한 클래스가 이 클래스보다 우선합니다.', ['inferiorto(class_name, ...)']),
  test: H('Run the %!test, %!assert, %!error, %!warning and %!fail blocks of a function file.', '함수 파일의 %!test, %!assert, %!error, %!warning, %!fail 블록을 실행합니다.', ['test name', "test(name, 'quiet')", "test(name, 'verbose')", '[success, n, nmax, nxfail] = test(...)']),
  oruntests: H('Run the test blocks of every M file in a folder and print a summary.', '폴더의 모든 M 파일 테스트 블록을 실행하고 요약을 출력합니다.', ['oruntests', 'oruntests(dir)']),
  demo: H('Run the %!demo blocks of a function file.', '함수 파일의 %!demo 블록을 실행합니다.', ['demo name', 'demo(name, n)']),
  example: H('Show the code of the %!demo blocks of a function file.', '함수 파일의 %!demo 블록 코드를 보여 줍니다.', ['example name', 'example(name, n)', '[s, idx] = example(name)']),
  rundemos: H('Run the demos of every M file in a folder.', '폴더의 모든 M 파일 데모를 실행합니다.', ['rundemos', 'rundemos(dir)']),
  speed: H('Measure how the run time of code grows with n, and compare two versions.', '코드 실행 시간이 n에 따라 어떻게 늘어나는지 재고 두 버전을 비교합니다.', ['speed(f1, init, maxN)', 'speed(f1, init, maxN, f2, tol)', '[order, n, T_f1, T_f2] = speed(...)']),
  publish: H('Run a script and write its code, comments and output as an HTML or LaTeX document.', '스크립트를 실행하고 코드·주석·출력을 HTML 또는 LaTeX 문서로 씁니다.', ['publish(file)', "publish(file, 'latex')", "out = publish(file, 'outputDir', dir)"]),
  grabcode: H('M code of a published HTML file.', '게시된 HTML 파일의 M 코드.', ['grabcode(file)', 'code = grabcode(file)']),
};
octaveBuiltins.quit = octaveBuiltins.exit;
