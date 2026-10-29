// The M-language runtime: workspaces, call stack, function resolution, calls
// (user functions, scripts, anonymous functions, builtins, class methods),
// indexing chains, assignment chains, objects, errors and the debugger.
import {
  MError, tensor, str, isObject, isTensor, isCell, isStruct, isString, isSparse, toTensor, prod, cell, struct,
  stringArray, empty, toStr, isText, num, bool, cellRow, structOf, cast as castValue, INT_RANGE,
} from '../value.js';
import { parse, parseExpr } from './parser.js';
import { lex } from './lexer.js';
import { Compiler, collectVarNames, S_RETURN } from './compile.js';
import {
  OWNED, COLON, indexParen, indexBrace, fieldRef, assignParen, assignBrace, assignField, parenForAssign,
  braceForAssign, fieldForAssign, countIndexed, resolveRead, disown, own,
} from './indexing.js';
import { fallbackOp, dnum, OP_SYMBOL } from './ops.js';
import { catValues, buildMatrix } from './concat.js';
import { formatDisplay, formatDisp, brief } from './display.js';
import { ClassInfo, makeJsClassInfo, HANDLE_METHODS } from '../classes.js';
import { sprintfLite } from './sprintf.js';

const joinPath = (d, n) => (d.endsWith('/') ? d + n : d + '/' + n);
const dirName = (p) => { const i = p.lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); };
const baseName = (p) => p.slice(p.lastIndexOf('/') + 1);
const CASTABLE = { double: 1, single: 1, logical: 1, char: 1, ...Object.fromEntries(Object.keys(INT_RANGE).map((k) => [k, 1])) };
const normPath = (p) => String(p).replace(/\\/g, '/');

export class Workspace {
  constructor(fi = null, up = null) {
    this.vars = Object.create(null);
    this.gl = null;
    this.up = up;
    this.fi = fi;
    this.nargin = 0;
    this.nargout = 0;
    this.argNames = null;
  }
}

export class Frame {
  constructor(ws, fi, file, name, kind) {
    this.ws = ws;
    this.fi = fi;
    this.file = file;
    this.name = name;
    this.kind = kind; // 'base' | 'function' | 'script' | 'anon' | 'eval'
    this.line = 0;
  }
}

/** Non-catchable control errors. */
const UNCATCHABLE = new Set(['core:interrupted', 'core:debugQuit']);

export class Interp {
  constructor(opts) {
    this.fs = opts.fs;
    this.host = opts.host || { post() {}, request() { return null; } };
    this.printFn = opts.print || (() => {});
    this.onEvent = opts.onEvent || (() => {});
    const reg = opts.registry || { builtins: {}, help: {}, classes: {}, installs: [], owner: {} };
    this.registry = reg;
    this.langBuiltins = opts.langBuiltins || {};
    this.fallbacks = opts.fallbacks || {};
    this.help = Object.assign(Object.create(null), reg.help || {}, opts.langHelp || {});
    // builtin table: library < language (language owns its names); fallbacks only fill gaps
    this.builtins = Object.create(null);
    for (const [k, fn] of Object.entries(this.fallbacks)) this.builtins[k] = fn;
    for (const [k, fn] of Object.entries(reg.builtins || {})) this.builtins[k] = fn;
    for (const [k, fn] of Object.entries(this.langBuiltins)) this.builtins[k] = fn;
    this.libHas = (name) => Object.prototype.hasOwnProperty.call(reg.builtins || {}, name);
    // classes
    this.jsClasses = Object.create(null);
    for (const [k, def] of Object.entries(opts.langClasses || {})) this.jsClasses[k] = makeJsClassInfo(k, def);
    for (const [k, def] of Object.entries(reg.classes || {})) this.jsClasses[k] = makeJsClassInfo(k, def);
    this.userClasses = new Map(); // name -> { ci, gen, mtime, path }

    this.base = new Workspace(null, null);
    this.baseFrame = new Frame(this.base, null, null, 'base', 'base');
    this.stack = [];
    this.endStack = [];
    this.accessorStack = [];
    this.globals = Object.create(null);
    this.path = [];
    this.gen = 1;
    this.dirCache = new Map();
    this.fileCache = new Map();
    this.fnCache = new Map();
    this.evalCache = new Map();
    this.format = { numeric: 'short', spacing: 'loose' };
    this.warnState = new Map([['all', 'on']]);
    this.lastWarning = { message: '', identifier: '' };
    this.lastError = null;
    this.intFlag = null;
    this.dbgOn = false;
    this.breakpoints = new Map();
    this.stepMode = null;
    this.stepDepth = 0;
    this.dbstopIfError = false;
    this.inDebugEval = false;
    this.recursionLimit = 500;
    this.cleanupLive = 0;
    this.watchVars = false;
    this.varsChanged = false;
    this.diary = null;
    this.state = Object.create(null);
    this.messageHandlers = [];
    this.pendingArgNames = null;
    this.builtinArgNames = null;
    this.listeners = new WeakMap();
    this.deleted = new WeakSet();
    this.ctx = this.makeCtx();
  }

  // ---------------------------------------------------------------- output
  print(text, stream = 'out') {
    this.printFn(text, stream);
    if (this.diary && stream !== 'echo') { try { this.fs.appendText(this.diary, text); } catch { /* ignore */ } }
  }
  out(text) { this.print(text, 'out'); }

  // ---------------------------------------------------------------- ctx
  makeCtx() {
    const rt = this;
    const ctx = {
      interp: rt,
      registry: rt.registry,
      get fs() { return rt.fs; },
      get host() { return rt.host; },
      state: rt.state,
      format: rt.format,
      session: null,
      call(fn, args, nargout = 1) { return rt.callAny(fn, args || [], nargout); },
      out(text) { rt.print(String(text), 'out'); },
      errOut(text) { rt.print(String(text), 'err'); },
      warning(id, message) { rt.warn(id, message); },
      onMessage(prefix, fn) { rt.messageHandlers.push([prefix, fn]); },
      checkInterrupt() { if (rt.intFlag !== null && rt.intFlag[0] !== 0) rt.interrupted(); },
      getVar(name, scope = 'caller') { const ws = scope === 'base' ? rt.base : rt.currentWs(); return disown(rt.readWs(ws, name)); },
      setVar(name, v, scope = 'caller') { const ws = scope === 'base' ? rt.base : rt.currentWs(); rt.writeWs(ws, name, v); rt.varsChanged = true; },
      inputName(i) { const n = rt.builtinArgNames; return n && typeof n[i] === 'string' && n[i] ? n[i] : null; },
      evalString(code, scope = 'base') { return rt.evalIn(scope === 'base' ? rt.baseFrame : rt.currentFrame(), String(code), true); },
    };
    return ctx;
  }

  currentFrame() { return this.stack.length ? this.stack[this.stack.length - 1] : this.baseFrame; }
  currentWs() { return this.currentFrame().ws; }
  /** The frame that called the currently running M function (for evalin/assignin 'caller'). */
  callerFrame() {
    let i = this.stack.length - 1;
    // skip script frames sharing the same workspace
    const cur = i >= 0 ? this.stack[i] : this.baseFrame;
    for (i -= 1; i >= 0; i--) if (this.stack[i].ws !== cur.ws) return this.stack[i];
    return this.baseFrame;
  }

  readWs(ws, name) {
    if (ws.gl !== null) { const s = ws.gl[name]; if (s !== undefined) return s[name]; }
    return ws.vars[name];
  }
  writeWs(ws, name, v) {
    if (ws.gl !== null) { const s = ws.gl[name]; if (s !== undefined) s[name] = v; }
    ws.vars[name] = v;
  }

  // ---------------------------------------------------------------- warnings / interrupts
  warningEnabled(id) {
    if (id && this.warnState.has(id)) return this.warnState.get(id) !== 'off';
    return this.warnState.get('all') !== 'off';
  }
  warn(id, message) {
    if (!this.warningEnabled(id)) return;
    this.lastWarning = { message, identifier: id || '' };
    const f = this.currentFrame();
    let loc = '';
    if (f.kind !== 'base' && f.name) loc = `> In ${f.name}${f.line ? ` (line ${f.line})` : ''}\n`;
    this.print(`Warning: ${message}\n${loc}`, 'warn');
  }
  interrupted() {
    if (this.intFlag) { try { Atomics.store(this.intFlag, 0, 0); } catch { this.intFlag[0] = 0; } }
    throw new MError('core:interrupted', 'Operation terminated by user during execution.');
  }

  // ---------------------------------------------------------------- errors
  noOutputError(name, assign) {
    if (assign) return new MError('core:TooManyOutputs', `Too many output arguments.`);
    return new MError('core:TooManyOutputs', `Too many output arguments.`);
  }
  tooManyOutputs() { return new MError('core:TooManyOutputs', 'Too many output arguments.'); }
  csListError(n) { return new MError('core:badCellRef', `Expected one output from a curly brace or dot indexing expression, but there were ${n} results.`); }

  /** Converts any thrown JS value to an MError when try/catch may handle it. */
  catchable(e) {
    if (e instanceof MError) return UNCATCHABLE.has(e.identifier) ? null : e;
    if (e instanceof RangeError && /call stack/i.test(e.message)) return new MError('core:recursionLimit', 'Maximum recursion limit reached. Use a smaller recursion depth or rewrite the algorithm iteratively.');
    if (e instanceof Error) { const m = new MError('core:internal', e.message); m.jsError = e; return m; }
    return new MError('core:internal', String(e));
  }
  toMError(e) {
    if (e instanceof MError) return e;
    return this.catchable(e) || new MError('core:internal', String(e && e.message || e));
  }
  unwindTo(depth) { if (this.stack.length > depth) this.stack.length = depth; this.accessorStack.length = 0; }

  makeMException(me) {
    if (me.mexc && me.mexc.props.message && toStr(me.mexc.props.message) === me.message) return me.mexc;
    const stackRows = me.mstack.map((s) => { const r = Object.create(null); r.file = str(s.file || ''); r.name = str(s.name || ''); r.line = num(s.line || 0); return r; });
    const props = Object.create(null);
    props.identifier = str(me.identifier || '');
    props.message = str(me.message || '');
    props.stack = struct([stackRows.length, 1], ['file', 'name', 'line'], stackRows);
    props.cause = cell([(me.causes || []).length, 1], (me.causes || []).map((c) => this.makeMException(c)));
    props.Correction = empty();
    const obj = { cls: 'MException', isObject: true, dims: [1, 1], handle: false, props, merror: me };
    me.mexc = obj;
    return obj;
  }
  /** MException object -> MError for throwing. */
  errorFromMException(obj, keepStack) {
    const p = obj.props;
    const e = new MError(toStr(p.identifier), toStr(p.message));
    if (keepStack && obj.merror) e.mstack = obj.merror.mstack.slice();
    const causes = p.cause && isCell(p.cause) ? p.cause.data : [];
    e.causes = causes.map((c) => this.errorFromMException(c, true));
    e.mexc = null;
    return e;
  }

  errorReport(e) {
    e = this.toMError(e);
    if (e.identifier === 'core:parse' && e.extra.parse) {
      return `Error: ${e.extra.parse.where}\n${e.message}`;
    }
    const lines = [];
    const st = e.mstack || [];
    if (e.extra.fn) {
      lines.push(`Error using ${e.extra.fn}`, e.message);
      if (st.length) lines.push('');
      for (const s of st) lines.push(`Error in ${s.name}${s.line ? ` (line ${s.line})` : ''}`);
    } else if (st.length && e.fromError) {
      lines.push(`Error using ${st[0].name}${st[0].line ? ` (line ${st[0].line})` : ''}`, e.message);
      if (st.length > 1) lines.push('');
      for (const s of st.slice(1)) lines.push(`Error in ${s.name}${s.line ? ` (line ${s.line})` : ''}`);
    } else if (st.length) {
      lines.push(`Error using ${st[0].name}${st[0].line ? ` (line ${st[0].line})` : ''}`, e.message);
      if (st.length > 1) lines.push('');
      for (const s of st.slice(1)) lines.push(`Error in ${s.name}${s.line ? ` (line ${s.line})` : ''}`);
    } else lines.push(e.message);
    for (const c of e.causes || []) lines.push('', 'Caused by:', '    ' + c.message);
    return lines.join('\n');
  }

  // ---------------------------------------------------------------- truth / switch
  truth(v) {
    if (isSparse(v)) v = toTensor(v);
    if (isTensor(v)) {
      const re = v.re;
      if (re.length === 0) return false;
      for (let i = 0; i < re.length; i++) {
        const x = re[i];
        if (x !== x) throw new MError('core:nanToLogical', 'NaN values cannot be converted to logicals.');
        if (x === 0 && !(v.im && v.im[i] !== 0)) return false;
      }
      return true;
    }
    if (isObject(v)) {
      const r = this.tryObjectMethod(v, 'logical', [v], 1);
      if (r) return this.truth(r[0]);
    }
    throw new MError('core:invalidConversion', `Conversion to logical from ${v.cls} is not possible.`);
  }
  scalarTruth(v, op) {
    if (v.re !== undefined && v.re.length === 1 && !v.sparse) {
      const x = v.re[0];
      if (x !== x) throw new MError('core:nanToLogical', 'NaN values cannot be converted to logicals.');
      return x !== 0 || (v.im !== null && v.im[0] !== 0);
    }
    if (isSparse(v) && prod(v.dims) === 1) return this.truth(v);
    if (isObject(v)) return this.truth(v);
    throw new MError('core:binaryOperatorNotSupported', `Operands to the ${op} operator must be convertible to logical scalar values. Use the ANY or ALL functions to reduce operands to logical scalar values.`);
  }
  switchMatch(v, c) {
    if (isCell(c)) return c.data.some((x) => this.switchMatch(v, x));
    if (isText(v) || (isTensor(v) && v.cls === 'char')) {
      if (!(isText(c) || (isTensor(c) && c.cls === 'char'))) return false;
      return toStr(v) === toStr(c);
    }
    if (isString(v) || isString(c)) {
      if (isString(v) && isString(c)) return v.data.length === 1 && c.data.length === 1 && v.data[0] === c.data[0];
      return false;
    }
    if (isObject(v) || isObject(c)) {
      const r = this.op('eq', [v, c]);
      return this.truth(r);
    }
    if (isTensor(v) && isTensor(c)) {
      if (c.cls === 'char') return false;
      if (prod(v.dims) === 0 || prod(c.dims) === 0) return false;
      if (prod(c.dims) !== 1 && prod(v.dims) !== 1) return false;
      const r = this.op('eq', [v, c]);
      return this.truth(r);
    }
    return false;
  }

  forEachColumn(v, run, onEmpty) {
    if (isSparse(v)) v = toTensor(v);
    if (isTensor(v) || isCell(v) || isStruct(v) || isString(v)) {
      const m = v.dims[0];
      const cols = prod(v.dims.slice(1));
      if (cols === 0 || (m === 0 && v.dims.length === 2 && v.dims[1] === 0)) { onEmpty(isTensor(v) ? tensor(v.cls, [m, 0]) : v); return 0; }
      if (isTensor(v) && m === 1 && !v.im) {
        const re = v.re, cls = v.cls;
        if (cls === 'double') return run(cols, (k) => dnum(re[k]));
        return run(cols, (k) => tensor(cls, [1, 1], [re[k]]));
      }
      const colIdx = (k) => { const lin = new Int32Array(m); for (let i = 0; i < m; i++) lin[i] = k * m + i; return lin; };
      return run(cols, (k) => {
        const lin = colIdx(k);
        if (isTensor(v)) return tensor(v.cls, [m, 1], Array.from(lin, (i) => v.re[i]), v.im ? Array.from(lin, (i) => v.im[i]) : null);
        if (isCell(v)) return cell([m, 1], Array.from(lin, (i) => disown(v.data[i])));
        if (isString(v)) return stringArray([m, 1], Array.from(lin, (i) => v.data[i]));
        return struct([m, 1], v.fields, Array.from(lin, (i) => v.data[i]));
      });
    }
    return run(1, () => v);
  }

  // ---------------------------------------------------------------- operators
  op(name, args) {
    // objects: class methods first
    for (const a of args) {
      if (a !== undefined && a.isObject) {
        const r = this.tryObjectMethod(a, name, args, 1);
        if (r) { if (!r.length) throw this.noOutputError(name); return r[0]; }
        const imp = this.implicitObjectOp(name, args);
        if (imp) return imp;
        throw new MError('core:undefinedOperator', `Operator '${OP_SYMBOL[name] || name}' is not supported for operands of type '${a.cls}'.`);
      }
    }
    const b = this.libHas(name) ? this.registry.builtins[name] : null;
    if (b) return this.normalizeOne(this.callBuiltinFn(name, b, args, 1), name);
    return fallbackOp(name, args, (id, msg) => this.warn(id, msg));
  }
  normalizeOne(r, name) {
    if (Array.isArray(r)) { if (!r.length) throw this.noOutputError(name); return r[0]; }
    if (r === undefined) throw this.noOutputError(name);
    return r;
  }
  implicitObjectOp(name, args) {
    // handle-class identity comparison and enumeration comparison
    if (name === 'eq' || name === 'ne') {
      const [a, b] = args;
      if (isObject(a) && isObject(b)) {
        let same;
        if (a.enumName !== undefined || b.enumName !== undefined) same = a.cls === b.cls && a.enumName === b.enumName;
        else if (a.handle || b.handle) same = a.props === b.props;
        else return null;
        return bool(name === 'eq' ? same : !same);
      }
      if (isObject(a) && a.enumName !== undefined && isText(b)) { const s = a.enumName === toStr(b); return bool(name === 'eq' ? s : !s); }
      if (isObject(b) && b.enumName !== undefined && isText(a)) { const s = b.enumName === toStr(a); return bool(name === 'eq' ? s : !s); }
    }
    return null;
  }

  concat(rows) {
    const flat = rows.flat();
    if (flat.some((v) => v.isObject)) {
      const obj = flat.find((v) => v.isObject);
      const which = rows.length === 1 ? 'horzcat' : 'vertcat';
      if (rows.length === 1 || rows.every((r) => r.length === 1)) {
        const items = rows.length === 1 ? rows[0] : rows.map((r) => r[0]);
        if (items.length === 1) return items[0];
        const r = this.tryObjectMethod(obj, which, items, 1);
        if (r) return r[0];
      }
      if (this.libHas(which)) {
        const rowVals = rows.map((r) => (r.length === 1 ? r[0] : this.normalizeOne(this.callBuiltinFn('horzcat', this.registry.builtins.horzcat, r, 1), 'horzcat')));
        return rowVals.length === 1 ? rowVals[0] : this.normalizeOne(this.callBuiltinFn('vertcat', this.registry.builtins.vertcat, rowVals, 1), 'vertcat');
      }
      throw new MError('core:concat:object', `Concatenation of ${obj.cls} objects is not supported.`);
    }
    return buildMatrix(rows);
  }

  // ---------------------------------------------------------------- ans / display
  setAns(f, v) { this.writeWs(f.ws, 'ans', v); }
  display(name, v, f) {
    if (isObject(v)) {
      const r = this.tryObjectMethod(v, 'display', [v, str(name)], 0, true);
      if (r) return;
      const ci = this.classOf(v);
      if (ci && ci.findMethod('disp')) { this.out(`${name} = \n\n`); this.tryObjectMethod(v, 'disp', [v], 0, true); return; }
      if (ci && ci.js && !ci.js.def.display && this.libHas('display')) {
        this.callBuiltinFn('display', this.registry.builtins.display, [v, str(name)], 0);
        return;
      }
      this.out(formatDisplay(name, v, this.format, (o) => this.objectDisplayText(o, name)));
      return;
    }
    if (this.libHas('display')) {
      this.callBuiltinFn('display', this.registry.builtins.display, [v, str(name)], 0);
      return;
    }
    this.out(formatDisplay(name, v, this.format));
  }
  objectDisplayText(obj) {
    const ci = this.classOf(obj);
    if (ci && ci.js && ci.js.def.display) return ci.js.def.display(obj, '', this.ctx);
    if (obj.enumName !== undefined) return `  ${obj.cls} enumeration\n\n    ${obj.enumName}`;
    if (ci && !ci.js) {
      const names = ci.publicPropNames();
      const w = Math.max(0, ...names.map((s) => s.length));
      const lines = [`  ${obj.cls} with ${names.length ? 'properties:' : 'no properties.'}`];
      if (names.length) lines.push('');
      for (const p of names) {
        let val;
        try { val = this.getProp(obj, p, true); } catch { val = undefined; }
        lines.push(`    ${p.padStart(w)}: ${val === undefined ? '[]' : brief(val, this.format)}`);
      }
      return lines.join('\n');
    }
    return null;
  }
  dispText(v) {
    if (isObject(v)) { const t = this.objectDisplayText(v); return t == null ? `  ${v.cls} object\n` : t.replace(/^ {2}/gm, '  ') + '\n'; }
    return formatDisp(v, this.format);
  }

  // ---------------------------------------------------------------- globals / persistent
  declareGlobal(f, name) {
    const ws = f.ws;
    if (ws.gl === null) ws.gl = Object.create(null);
    if (!(name in this.globals)) {
      const cur = ws.vars[name];
      this.globals[name] = empty();
      if (cur !== undefined && ws.gl[name] === undefined) this.warn('core:global:localExists', `The value of local variable "${name}" has been replaced by the global value.`);
    }
    ws.gl[name] = this.globals;
    ws.vars[name] = this.globals[name];
    this.varsChanged = true;
  }
  declarePersistent(f, name, init) {
    const fi = f.fi;
    if (!fi || f.kind === 'script' || f.kind === 'base') throw new MError('core:persistentNotInFunction', 'Persistent declarations are only allowed in a function.');
    const store = fi.persist;
    if (!(name in store)) store[name] = init ? init[1].ev(f) : empty();
    const ws = f.ws;
    if (ws.gl === null) ws.gl = Object.create(null);
    ws.gl[name] = store;
    ws.vars[name] = store[name];
  }

  // ---------------------------------------------------------------- files and path
  setCwd(path) {
    this.fs.chdir(path);
    this.bumpGen();
    this.onEvent({ type: 'cwd', path: this.fs.cwd() });
  }
  bumpGen() { this.gen++; }
  searchDirs() {
    let cwd;
    try { cwd = normPath(this.fs.cwd()); } catch { cwd = '/'; }
    const dirs = [cwd];
    for (const p of this.path) if (p !== cwd) dirs.push(p);
    return dirs;
  }
  listing(dir) {
    let c = this.dirCache.get(dir);
    if (c && c.gen === this.gen) return c.map;
    const map = new Map();
    try { for (const e of this.fs.list(dir)) map.set(e.name, e); } catch { /* missing folder */ }
    c = { gen: this.gen, map };
    this.dirCache.set(dir, c);
    return map;
  }
  /** Finds name.m (or a class folder) in the search path. Returns a path or null. */
  findFile(name) {
    if (name.includes('.')) {
      const parts = name.split('.');
      const last = parts.pop();
      const pkgPath = parts.map((p) => '+' + p).join('/');
      for (const d of this.searchDirs()) {
        const dir = joinPath(d, pkgPath);
        const m = this.listing(dir);
        if (m.has(last + '.m')) return { path: joinPath(dir, last + '.m'), mtime: m.get(last + '.m').mtimeMs };
        if (m.has('@' + last)) {
          const cd = joinPath(dir, '@' + last);
          const mm = this.listing(cd);
          if (mm.has(last + '.m')) return { path: joinPath(cd, last + '.m'), mtime: mm.get(last + '.m').mtimeMs, classDir: cd };
        }
      }
      return null;
    }
    for (const d of this.searchDirs()) {
      const m = this.listing(d);
      const e = m.get(name + '.m');
      if (e && !e.isDir) return { path: joinPath(d, name + '.m'), mtime: e.mtimeMs };
      if (m.has('@' + name)) {
        const cd = joinPath(d, '@' + name);
        const mm = this.listing(cd);
        if (mm.has(name + '.m')) return { path: joinPath(cd, name + '.m'), mtime: mm.get(name + '.m').mtimeMs, classDir: cd };
      }
    }
    return null;
  }
  findPrivate(name, file) {
    if (!file) return null;
    const d = dirName(file);
    const pd = baseName(d) === 'private' ? d : joinPath(d, 'private');
    const m = this.listing(pd);
    const e = m.get(name + '.m');
    return e ? { path: joinPath(pd, name + '.m'), mtime: e.mtimeMs } : null;
  }

  /** Parses (cached by mtime) a file into a FileInfo. */
  loadFile(path, mtime) {
    path = normPath(path);
    if (mtime === undefined) { try { mtime = this.fs.stat(path).mtimeMs; } catch { mtime = 0; } }
    const c = this.fileCache.get(path);
    if (c && c.mtime === mtime) return c.info;
    const src = this.fs.readText(path);
    const name = baseName(path).replace(/\.m$/, '');
    const ast = parse(src, { file: path });
    const info = { path, name, kind: ast.kind, ast, src, locals: new Map(), main: null, script: null, classdef: ast.classdef || null };
    for (const fn of ast.functions) info.locals.set(fn.name, this.makeFuncInfo(fn, info, null, null));
    if (ast.kind === 'function') {
      info.main = info.locals.get(ast.functions[0].name);
      info.main.name = name; // file name wins
      info.main.isMain = true;
      if (ast.functions[0].name !== name) info.locals.delete(ast.functions[0].name);
      info.locals.set(name, info.main);
      info.main.help = helpComment(src, ast.functions[0].line);
    } else if (ast.kind === 'script') {
      info.script = { name, body: ast.body, fileInfo: info, file: path, isScript: true, run: null, persist: Object.create(null), lookup: (n) => info.locals.get(n) || null, help: helpComment(src, 1) };
    }
    this.fileCache.set(path, { mtime, info });
    // a changed file invalidates resolution caches
    this.fnCache.clear();
    return info;
  }

  makeFuncInfo(ast, fileInfo, parent, classInfo) {
    const fi = {
      name: ast.name, ast, params: ast.params, outs: ast.outs, file: fileInfo ? fileInfo.path : null, fileInfo, parent,
      classInfo, nested: new Map(), persist: Object.create(null), run: null, varNames: null, depth: null, help: null,
      static: false, access: 'public', isScript: false,
    };
    for (const n of ast.nested) fi.nested.set(n.name, this.makeFuncInfo(n, fileInfo, fi, classInfo));
    fi.lookup = (name) => {
      for (let p = fi; p; p = p.parent) {
        const n = p.nested.get(name);
        if (n) return n;
        if (p.name === name && p.parent) return p;
      }
      if (fileInfo) { const l = fileInfo.locals.get(name); if (l) return l; }
      return null;
    };
    return fi;
  }

  compileFunc(fi) {
    if (fi.run) return;
    fi.varNames = collectVarNames(fi.ast);
    let depth = null;
    if (fi.parent) {
      depth = new Map();
      const own = new Set([...fi.params, ...fi.outs]);
      let k = 1;
      for (let p = fi.parent; p; p = p.parent, k++) {
        if (!p.varNames) p.varNames = collectVarNames(p.ast);
        for (const n of p.varNames) if (!own.has(n) && !depth.has(n)) depth.set(n, k);
      }
      for (const n of fi.varNames) if (!own.has(n) && depth.has(n)) { /* shared */ }
    }
    fi.depth = depth;
    const comp = new Compiler(this, { fi, depth });
    fi.run = comp.block(fi.ast.body);
    fi.argChecks = (fi.ast.args || []).filter((b) => !b.output).map((b) => b.items.map((it) => ({
      ...it,
      defC: it.def ? comp.expr(it.def) : null,
      valC: it.validators.map((v) => (v.t === 'id' ? { name: v.name } : { c: comp.expr(v) })),
    })));
    fi.callsSuper = astHasSuper(fi.ast.body, fi.outs[0]);
  }

  compileScript(si) {
    if (si.run) return;
    const comp = new Compiler(this, { fi: si, depth: null });
    si.run = comp.block(si.body);
  }

  // ---------------------------------------------------------------- resolution
  resolve(name) {
    const c = this.fnCache.get(name);
    if (c && c.gen === this.gen) return c.t;
    let t = null;
    const file = this.findFile(name);
    if (file) {
      const info = this.loadFile(file.path, file.mtime);
      if (info.kind === 'classdef') t = { kind: 'class', ci: this.classFromFile(info, name, file.classDir) };
      else if (info.kind === 'function') t = file.classDir ? { kind: 'class', ci: this.classFromFolder(name, file.classDir, info) } : { kind: 'user', fi: info.main };
      else t = { kind: 'script', si: info.script };
    } else if (this.builtins[name]) t = { kind: 'builtin', fn: this.builtins[name] };
    else if (this.jsClasses[name]) t = { kind: 'class', ci: this.jsClasses[name] };
    this.fnCache.set(name, { gen: this.gen, t });
    return t;
  }

  /** Calls `name` (not a variable) from frame f whose code belongs to fi. */
  callFunction(name, args, nargout, f, fi) {
    if (fi) {
      const lf = fi.lookup(name);
      if (lf) return this.callUser(lf, args, nargout, { caller: f });
    }
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a !== undefined && a.isObject) {
        const r = this.tryObjectMethod(a, name, args, nargout);
        if (r) return r;
        break;
      }
    }
    if (f && f.file) {
      const pf = this.findPrivate(name, f.file);
      if (pf) {
        const info = this.loadFile(pf.path, pf.mtime);
        if (info.main) return this.callUser(info.main, args, nargout, { caller: f });
        if (info.script) return this.runScript(info.script, f, nargout);
      }
    }
    const t = this.resolve(name);
    if (t !== null) return this.callTarget(t, name, args, nargout, f);
    throw this.undefinedError(name, args);
  }
  undefinedError(name, args) {
    if (args && args.length) {
      const types = [...new Set(args.map((a) => (a === COLON ? 'char' : a.cls)))];
      return new MError('core:UndefinedFunction', `Undefined function '${name}' for input arguments of type '${types[0]}'.`);
    }
    return new MError('core:UndefinedFunction', `Unrecognized function or variable '${name}'.`);
  }
  callTarget(t, name, args, nargout, f) {
    switch (t.kind) {
      case 'builtin': return this.callBuiltin(name, t.fn, args, nargout);
      case 'user': return this.callUser(t.fi, args, nargout, { caller: f });
      case 'script':
        if (args.length) throw new MError('core:scriptAsFunction', `Attempt to execute SCRIPT ${name} as a function.`);
        return this.runScript(t.si, f || this.currentFrame(), nargout);
      case 'class': return [this.construct(t.ci, args, f)];
      default: throw this.undefinedError(name, args);
    }
  }

  callBuiltinFn(name, fn, args, nargout) {
    try {
      return fn(args, nargout, this.ctx);
    } catch (e) {
      if (e instanceof MError) { if (e.extra && !e.extra.fn && !e.extra.noFn && !(e.mstack && e.mstack.length)) e.extra.fn = name; throw e; }
      const me = this.catchable(e);
      if (!me) throw e;
      me.extra.fn = name;
      throw me;
    }
  }
  /** sprintf-style message text (library sprintf when present, else the built-in subset). */
  formatMessage(fmt, args) {
    if (this.libHas('sprintf')) {
      try { return toStr(this.normalizeOne(this.registry.builtins.sprintf([str(fmt), ...args], 1, this.ctx), 'sprintf')); } catch { /* fall back */ }
    }
    return sprintfLite(fmt, args);
  }
  callBuiltin(name, fn, args, nargout) {
    // ctx.inputName(i) reads the caller's argument variable names during the call.
    const saved = this.builtinArgNames;
    this.builtinArgNames = this.pendingArgNames;
    this.pendingArgNames = null;
    let r;
    try { r = this.callBuiltinFn(name, fn, args, nargout); } finally { this.builtinArgNames = saved; }
    if (Array.isArray(r)) return r;
    if (r === undefined || r === null) return [];
    return [r];
  }

  /** ctx.call: function handle, function name or builtin. */
  callAny(fn, args, nargout) {
    if (typeof fn === 'string') {
      return this.callFunction(fn, args, nargout, this.currentFrame(), null);
    }
    if (fn && fn.cls === 'function_handle') return this.callHandle(fn, args, nargout);
    if (isText(fn)) return this.callFunction(toStr(fn), args, nargout, this.currentFrame(), null);
    throw new MError('core:feval:badFunction', 'Argument must contain a function name or a function handle.');
  }

  // ---------------------------------------------------------------- function handles
  makeNamedHandle(name, f) {
    const fi = f && (f.fi || null);
    if (fi && !fi.isScript) {
      const lf = fi.lookup(name);
      if (lf) return { cls: 'function_handle', dims: [1, 1], name, fi: lf, ws: lf.parent ? this.ancestorWs(f.ws, lf.parent) : null };
    } else if (fi && fi.isScript) {
      const lf = fi.lookup(name);
      if (lf) return { cls: 'function_handle', dims: [1, 1], name, fi: lf, ws: null };
    }
    return { cls: 'function_handle', dims: [1, 1], name };
  }
  ancestorWs(ws, targetFi) {
    for (let w = ws; w; w = w.up) if (w.fi === targetFi) return w;
    return ws;
  }
  callHandle(fh, args, nargout) {
    if (fh.anon) return this.callAnon(fh, args, nargout);
    if (fh.fi) return this.callUser(fh.fi, args, nargout, { upWs: fh.ws });
    if (fh.jsfn) { const r = fh.jsfn(args, nargout); return Array.isArray(r) ? r : r === undefined ? [] : [r]; }
    if (fh.name) {
      // a handle to a class method of an object argument dispatches like a call
      return this.callFunction(fh.name, args, nargout, this.currentFrame(), null);
    }
    throw new MError('core:badHandle', 'Invalid function handle.');
  }
  callAnon(fh, args, nargout) {
    const params = fh.params;
    if (args.length > params.length && !(params.length && params[params.length - 1] === 'varargin')) throw new MError('core:TooManyInputs', 'Too many input arguments.');
    for (let i = 0; i < args.length; i++) OWNED.delete(args[i]);
    const ws = new Workspace(fh.fi || null, null);
    const vars = ws.vars;
    const cl = fh.closure;
    for (const k in cl) vars[k] = cl[k];
    const np = params.length;
    for (let i = 0; i < np; i++) {
      const p = params[i];
      if (p === 'varargin' && i === np - 1) { vars.varargin = cellRow(args.slice(i)); break; }
      if (i < args.length && p !== '~') vars[p] = args[i];
    }
    ws.nargin = args.length;
    ws.nargout = nargout;
    const frame = new Frame(ws, fh.fi || null, fh.fi ? fh.fi.file : null, fh.text, 'anon');
    if (this.stack.length >= this.recursionLimit) throw new MError('core:recursionLimit', `Maximum recursion limit of ${this.recursionLimit} reached.`);
    this.stack.push(frame);
    try {
      const body = fh.body();
      if (nargout === 1) return [body.ev(frame)];
      return body.mv(frame, nargout);
    } catch (e) {
      throw this.annotate(e, frame);
    } finally {
      this.stack.pop();
    }
  }

  applyChainValues(v, steps, nout) { return this.applyChain(v, steps, 0, this.currentFrame(), nout); }
  assignChainValues(v, steps, rhs) { return this.assignChain(v, steps, 0, rhs, this.currentFrame()); }

  annotate(e, frame) {
    if (this.dbstopIfError && e instanceof MError && !e.dbPaused && !UNCATCHABLE.has(e.identifier) && !this.inDebugEval) {
      e.dbPaused = true;
      this.print(this.errorReport(e) + '\n', 'err');
      this.pauseAt(frame, frame.line, 'error');
    }
    if (e instanceof MError) {
      if (!UNCATCHABLE.has(e.identifier) && !e.frozen) e.mstack.push({ file: frame.file || '', name: frame.name || '', line: frame.line });
      return e;
    }
    const me = this.catchable(e);
    if (!me) return e;
    me.mstack.push({ file: frame.file || '', name: frame.name || '', line: frame.line });
    return me;
  }

  // ---------------------------------------------------------------- user functions
  callUser(fi, args, nargout, opts = {}) {
    if (fi.isScript) return this.runScript(fi, opts.caller || this.currentFrame(), nargout);
    if (!fi.run) this.compileFunc(fi);
    const params = fi.params, np = params.length;
    const hasVarargin = np > 0 && params[np - 1] === 'varargin';
    const nvNames = fi.argChecks && fi.argChecks.some((b) => b.some((it) => it.field));
    if (args.length > np && !hasVarargin && !nvNames) throw new MError('core:TooManyInputs', 'Too many input arguments.');
    const outs = fi.outs, no = outs.length;
    const hasVarargout = no > 0 && outs[no - 1] === 'varargout';
    if (nargout > no && !hasVarargout) throw new MError('core:TooManyOutputs', 'Too many output arguments.');
    let up = null;
    if (opts.upWs) up = opts.upWs;
    else if (fi.parent) {
      const caller = opts.caller || this.currentFrame();
      up = this.ancestorWs(caller.ws, fi.parent);
    }
    for (let i = 0; i < args.length; i++) OWNED.delete(args[i]);
    const ws = new Workspace(fi, up);
    const vars = ws.vars;
    const npos = hasVarargin ? np - 1 : np;
    for (let i = 0; i < npos && i < args.length; i++) { const p = params[i]; if (p !== '~') vars[p] = args[i]; }
    if (hasVarargin) vars.varargin = cellRow(args.slice(npos));
    ws.nargin = args.length;
    ws.nargout = nargout;
    ws.argNames = this.pendingArgNames;
    this.pendingArgNames = null;
    if (opts.presetOut !== undefined && no) { vars[outs[0]] = opts.presetOut; }
    const frame = new Frame(ws, fi, fi.file, fi.classInfo && !fi.isMain ? qualifiedName(fi) : fi.name, 'function');
    if (this.stack.length >= this.recursionLimit) throw new MError('core:recursionLimit', `Maximum recursion limit of ${this.recursionLimit} reached. Use set(0,'RecursionLimit',N) to change the limit. Be aware that exceeding your available stack space can crash the program.`);
    if (this.intFlag !== null && this.intFlag[0] !== 0) this.interrupted();
    this.stack.push(frame);
    const prof = this.profiler && this.profiler.on ? Date.now() : 0;
    try {
      if (fi.argChecks && fi.argChecks.length) this.validateArgs(fi, frame, args);
      fi.run(frame);
    } catch (e) {
      throw this.annotate(e, frame);
    } finally {
      this.stack.pop();
      if (this.cleanupLive > 0) this.runCleanups(ws);
      if (prof) {
        const key = frame.name;
        const d = this.profiler.data.get(key) || { calls: 0, time: 0 };
        d.calls++; d.time += Date.now() - prof;
        this.profiler.data.set(key, d);
      }
    }
    // outputs
    const res = [];
    const want = Math.max(nargout, 1);
    for (let i = 0; i < no && res.length < want; i++) {
      const o = outs[i];
      if (o === 'varargout' && i === no - 1) {
        const vo = vars.varargout;
        if (vo === undefined) { if (res.length < nargout) throw new MError('core:unassignedOutputs', `Output argument "varargout" (and possibly others) not assigned a value in the execution with "${fi.name}" function.`); break; }
        if (!isCell(vo)) throw new MError('core:varargoutNotCell', 'varargout must be a cell array.');
        for (const x of vo.data) { if (res.length >= want) break; res.push(x); }
        if (res.length < nargout) throw new MError('core:TooManyOutputs', 'Too many output arguments.');
        break;
      }
      const v = ws.gl !== null && ws.gl[o] ? ws.gl[o][o] : vars[o];
      if (v === undefined) {
        if (i < nargout || (i === 0 && nargout === 1)) throw new MError('core:unassignedOutputs', `Output argument "${o}" (and possibly others) not assigned a value in the execution with "${fi.name}" function.`);
        break;
      }
      res.push(v);
    }
    return res;
  }

  runCleanups(ws) {
    for (const k in ws.vars) {
      const v = ws.vars[k];
      if (v && v.cls === 'onCleanup' && v.isObject && !v.props.$done) this.fireCleanup(v);
    }
  }
  fireCleanup(obj) {
    if (obj.props.$done) return;
    obj.props.$done = true;
    this.cleanupLive--;
    const task = obj.props.task;
    if (task && task.cls === 'function_handle') this.callHandle(task, [], 0);
  }

  /** Converts a value to a class (numeric/char/logical directly, others through the class function). */
  convertTo(v, cls, frame) {
    if (isTensor(v) && (cls in CASTABLE)) return castValue(v, cls);
    return this.callFunction(cls, [v], 1, frame || this.currentFrame(), null)[0];
  }

  validateArgs(fi, frame, args) {
    const ws = frame.ws;
    let pos = 0;
    for (const block of fi.argChecks) {
      const posItems = block.filter((it) => !it.field);
      const nvItems = block.filter((it) => it.field);
      for (const it of posItems) {
        pos++;
        let v = ws.vars[it.name];
        if (v === undefined) {
          if (it.defC) { v = it.defC.ev(frame); ws.vars[it.name] = v; }
          else if (it.name !== 'varargin') throw new MError('core:minrhs', 'Not enough input arguments.');
          else continue;
        }
        ws.vars[it.name] = this.checkArg(it, v, frame, `Invalid argument at position ${pos}. `);
      }
      if (nvItems.length) {
        const sname = nvItems[0].name;
        const rec = Object.create(null);
        const fields = [];
        for (const it of nvItems) { if (it.defC) { rec[it.field] = it.defC.ev(frame); fields.push(it.field); } }
        const rest = args.slice(posItems.length + (fi.params.indexOf(sname) >= 0 ? fi.params.indexOf(sname) - posItems.length : 0));
        for (let i = 0; i + 1 < rest.length; i += 2) {
          const key = toStr(rest[i]);
          const it = nvItems.find((x) => x.field.toLowerCase() === key.toLowerCase());
          if (!it) throw new MError('core:InvalidNameValue', `Invalid name-value argument '${key}'.`);
          rec[it.field] = this.checkArg(it, rest[i + 1], frame, `Invalid name-value argument '${it.field}'. `);
          if (!fields.includes(it.field)) fields.push(it.field);
        }
        if (rest.length % 2) throw new MError('core:InvalidNameValue', 'Name-value arguments must come in pairs.');
        ws.vars[sname] = struct([1, 1], fields, [rec]);
      }
    }
  }
  checkArg(it, v, frame, prefix) {
    if (it.cls && v.cls !== it.cls) {
      try {
        v = this.convertTo(v, it.cls, frame);
      } catch {
        throw new MError('core:validators:mustBeClass', `${prefix}Value must be of type ${it.cls} or be convertible to ${it.cls}.`);
      }
    }
    if (it.dims) {
      const d = v.dims || [1, 1];
      const want = it.dims;
      const ok = want.length >= d.length && want.every((w, k) => w < 0 || w === (d[k] ?? 1));
      if (!ok) {
        // scalar expansion is not applied; report the size
        throw new MError('core:validators:size', `${prefix}Value must be of size ${want.map((w) => (w < 0 ? ':' : w)).join('x')}.`);
      }
    }
    for (const val of it.valC) {
      try {
        if (val.name) this.callFunction(val.name, [v], 0, frame, frame.fi);
        else { const saved = frame.ws.vars[it.name]; frame.ws.vars[it.name] = v; try { val.c.mv(frame, 0); } finally { if (saved !== undefined) frame.ws.vars[it.name] = saved; } }
      } catch (e) {
        const me = this.catchable(e);
        if (!me) throw e;
        const ne = new MError(me.identifier, prefix + me.message);
        ne.extra.noFn = true;
        throw ne;
      }
    }
    return v;
  }

  runScript(si, f, nargout) {
    if (nargout > 0) throw new MError('core:scriptAsFunction', `Attempt to execute SCRIPT ${si.name} as a function.`);
    this.compileScript(si);
    const frame = new Frame(f.ws, si, si.file, si.name, 'script');
    this.stack.push(frame);
    try {
      si.run(frame);
    } catch (e) {
      throw this.annotate(e, frame);
    } finally {
      this.stack.pop();
    }
    return [];
  }

  // ---------------------------------------------------------------- end / arguments
  endValue() {
    const top = this.endStack[this.endStack.length - 1];
    if (!top) throw new MError('core:endNotValid', "The end operator must be used within an array index expression.");
    const v = top.v;
    if (v === undefined) return dnum(0);
    if (isObject(v)) {
      const r = this.tryObjectMethod(v, 'end', [v, dnum(top.k + 1), dnum(top.n)], 1);
      if (r) return r[0];
      const dims = this.objectDims(v);
      return dnum(top.n === 1 ? prod(dims) : top.k < top.n - 1 ? (dims[top.k] ?? 1) : prod(dims.slice(top.k)));
    }
    const dims = v.dims;
    const n = top.n, k = top.k;
    if (n === 1) return dnum(prod(dims));
    if (k < n - 1) return dnum(k < dims.length ? dims[k] : 1);
    let p = 1; for (let i = k; i < dims.length; i++) p *= dims[i];
    return dnum(k >= dims.length ? 1 : p);
  }
  evalArgs(st, f, v) {
    const args = st.args;
    const n = args.length;
    if (!st.end) {
      if (n === 1) return args[0].cs(f);
      const out = [];
      for (let k = 0; k < n; k++) { const l = args[k].cs(f); for (let j = 0; j < l.length; j++) out.push(l[j]); }
      return out;
    }
    const top = { v, k: 0, n };
    this.endStack.push(top);
    const out = [];
    for (let k = 0; k < n; k++) { top.k = k; const l = args[k].cs(f); for (let j = 0; j < l.length; j++) out.push(l[j]); }
    this.endStack.pop();
    return out;
  }
  fieldName(v) {
    if (!isText(v)) throw new MError('core:dynamicFieldName', 'Dynamic structure field names must be character vectors or strings.');
    return toStr(v);
  }

  // ---------------------------------------------------------------- indexing chains
  applyChainArgs(v, steps, f, nout, firstArgs) {
    if (v.isObject || v.cls === 'function_handle') return this.applyChain(v, steps, 0, f, nout, firstArgs);
    const r = indexParen(v, firstArgs);
    if (steps.length === 1) return [r];
    return this.applyChain(r, steps, 1, f, nout);
  }

  applyChain(v, steps, k, f, nout, firstArgs) {
    const n = steps.length;
    for (; k < n; k++) {
      const st = steps[k];
      const last = k === n - 1;
      if (v.isObject) return this.objectChain(v, steps, k, f, nout, firstArgs);
      if (st.k === '()') {
        if (v.cls === 'function_handle') {
          const args = firstArgs && k === 0 ? firstArgs : this.evalArgs(st, f, undefined);
          const r = this.callHandle(v, args, last ? (nout < 0 ? 1 : nout) : 1);
          if (last) return r;
          if (!r.length) throw this.noOutputError('');
          v = r[0];
          continue;
        }
        const args = firstArgs && k === 0 ? firstArgs : this.evalArgs(st, f, v);
        v = indexParen(v, args);
        if (v === undefined) throw new MError('core:index', 'Index failed.');
        continue;
      }
      if (st.k === '{}') {
        const args = this.evalArgs(st, f, v);
        const list = indexBrace(v, args);
        if (last) return list;
        if (list.length !== 1) throw this.csListError(list.length);
        v = list[0];
        continue;
      }
      const name = st.k === '.' ? st.name : this.fieldName(st.e.ev(f));
      if (isStruct(v)) {
        const list = fieldRef(v, name);
        if (last) return list;
        if (list.length !== 1) throw this.csListError(list.length);
        v = list[0];
        continue;
      }
      if (v.cls === 'function_handle' && !v.anon && name) {
        throw new MError('core:dotIndexNotSupported', 'Dot indexing is not supported for variables of this type.');
      }
      throw new MError('core:dotIndexNotSupported', 'Dot indexing is not supported for variables of this type.');
    }
    OWNED.delete(v);
    return [v];
  }

  /** name(...)... where name is not a variable. */
  callChain(name, steps, f, nout, fi) {
    const st = steps[0];
    const callN = (k) => (k === steps.length - 1 ? (nout < 0 ? 1 : nout) : 1);
    if (st.k === '()') {
      // `end` inside a function call's arguments refers to the enclosing index expression
      const args = this.evalArgs(st.end ? { args: st.args, end: false } : st, f, undefined);
      this.pendingArgNames = st.argNames;
      const r = this.callFunction(name, args, callN(0), f, fi);
      if (steps.length === 1) return r;
      if (!r.length) throw this.noOutputError(name);
      return this.applyChain(r[0], steps, 1, f, nout);
    }
    if (st.k === '.') {
      const parts = [name];
      let j = 0;
      while (j < steps.length && steps[j].k === '.') { parts.push(steps[j].name); j++; }
      for (let len = parts.length; len >= 1; len--) {
        const full = parts.slice(0, len).join('.');
        let local = null;
        if (len === 1 && fi) local = fi.lookup(full);
        const t = local ? { kind: 'user', fi: local } : this.resolve(full);
        if (!t) continue;
        let k = len - 1; // next step index
        let v;
        if (t.kind === 'class') {
          const ci = t.ci;
          if (k < steps.length && steps[k].k === '.') {
            const member = steps[k].name;
            k++;
            let args = [];
            const hasCall = k < steps.length && steps[k].k === '()';
            if (hasCall) { args = this.evalArgs(steps[k], f, undefined); k++; }
            const r = this.staticMember(ci, member, args, k === steps.length ? (nout < 0 ? 1 : nout) : 1, hasCall, f);
            if (k === steps.length) return r;
            if (!r.length) throw this.noOutputError(member);
            v = r[0];
          } else {
            let args = [];
            if (k < steps.length && steps[k].k === '()') { args = this.evalArgs(steps[k], f, undefined); k++; }
            v = this.construct(ci, args, f);
            if (k === steps.length) return [v];
          }
        } else {
          let args = [];
          if (k < steps.length && steps[k].k === '()') { args = this.evalArgs(steps[k], f, undefined); k++; }
          const r = t.kind === 'user' && local ? this.callUser(local, args, k === steps.length ? (nout < 0 ? 1 : nout) : 1, { caller: f }) : this.callTarget(t, full, args, k === steps.length ? (nout < 0 ? 1 : nout) : 1, f);
          if (k === steps.length) return r;
          if (!r.length) throw this.noOutputError(full);
          v = r[0];
        }
        return this.applyChain(v, steps, k, f, nout);
      }
      throw this.undefinedError(name);
    }
    // name{...} with name not a variable
    throw new MError('core:UndefinedFunction', `Unrecognized function or variable '${name}'.`);
  }

  // ---------------------------------------------------------------- assignment chains
  assignChain(base, steps, k, rhs, f, pre) {
    if (base !== undefined && base.isObject) return this.objectAssign(base, steps, k, rhs, f);
    const st = steps[k];
    const last = k === steps.length - 1;
    let args = null, name = null;
    if (st.k === '()' || st.k === '{}') args = pre && k === 0 ? pre : this.evalArgs(st, f, base);
    else name = st.k === '.' ? st.name : this.fieldName(st.e.ev(f));
    if (base !== undefined && base.cls === 'function_handle') throw new MError('core:fhAssign', 'Unable to perform assignment to a function handle.');
    if (last) {
      if (st.k === '()') {
        if (rhs.isObject) return this.assignObjectElement(base, args, rhs);
        return assignParen(base, args, rhs);
      }
      if (st.k === '{}') return assignBrace(base, args, rhs);
      return assignField(base, name, rhs);
    }
    let sub;
    if (st.k === '()') sub = parenForAssign(base, args);
    else if (st.k === '{}') sub = braceForAssign(base, args);
    else sub = fieldForAssign(base, name);
    // a shared container shares its elements too: they must be copied before changing
    if (sub !== undefined && (base === undefined || !OWNED.has(base))) OWNED.delete(sub);
    if (st.k === '()' && sub !== undefined && isStruct(sub) && prod(sub.dims) !== 1 && steps[k + 1].k === '.') {
      throw new MError('core:scalarStructRequired', 'Scalar structure required for this assignment.');
    }
    if (st.k === '()' && sub !== undefined && isCell(sub) && steps[k + 1].k === '{}') sub = undefined;
    const nsub = this.assignChain(sub, steps, k + 1, rhs, f);
    if (st.k === '()') {
      if (nsub.isObject) return this.assignObjectElement(base, args, nsub);
      return assignParen(base, args, nsub);
    }
    if (st.k === '{}') return assignBrace(base, args, nsub);
    return assignField(base, name, nsub);
  }
  assignObjectElement(base, args, rhs) {
    // object arrays are not supported: allow x(1) = obj for new/empty/scalar targets
    const ok = args.every((a) => a !== COLON && isTensor(a) && a.re.length === 1 && a.re[0] === 1);
    if (ok && (base === undefined || (isTensor(base) && prod(base.dims) <= 1) || isObject(base))) return rhs;
    if (base !== undefined && isCell(base)) return assignParen(base, args, rhs);
    throw new MError('core:objectArrays', 'Arrays of objects are not supported; store objects in a cell array instead.');
  }

  lhsCount(l, f) {
    const steps = l.steps;
    if (steps.length !== 1) return 1;
    const st = steps[0];
    const base = l.read(f);
    if (st.k === '{}') { const args = this.evalArgs(st, f, base); return countIndexed(base, args); }
    if (st.k === '.' && base !== undefined && isStruct(base)) return Math.max(1, prod(base.dims));
    return 1;
  }
  assignSpread(base, steps, vals, f) {
    const st = steps[0];
    if (st.k === '{}') {
      const args = this.evalArgs(st, f, base);
      const { lin } = resolveRead(base.dims, args);
      let out = base;
      for (let i = 0; i < lin.length; i++) out = assignBrace(out, [dnum(lin[i] + 1)], vals[i]);
      return out;
    }
    // s.f on a struct array
    let out = base;
    for (let i = 0; i < vals.length; i++) {
      const el = parenForAssign(out, [dnum(i + 1)]);
      out = assignParen(out, [dnum(i + 1)], assignField(el, st.name, vals[i]));
    }
    return out;
  }

  // ---------------------------------------------------------------- classes
  classOf(obj) {
    if (!isObject(obj)) return null;
    const name = obj.cls;
    if (this.jsClasses[name]) return this.jsClasses[name];
    return this.findClass(name);
  }
  findClass(name) {
    if (this.jsClasses[name]) return this.jsClasses[name];
    const c = this.userClasses.get(name);
    if (c && c.gen === this.gen) return c.ci;
    const t = this.resolve(name);
    if (t && t.kind === 'class') return t.ci;
    if (c) return c.ci;
    return null;
  }
  classFromFolder(name, classDir, info) {
    // old-style @folder class whose constructor is a plain function: treat as a class with methods
    const ci = new ClassInfo(name);
    ci.file = info.path;
    ci.ctorFi = info.main;
    ci.oldStyle = true;
    this.addFolderMethods(ci, classDir, name);
    this.userClasses.set(name, { ci, gen: this.gen });
    return ci;
  }
  addFolderMethods(ci, classDir, name) {
    for (const [fname, e] of this.listing(classDir)) {
      if (e.isDir || !fname.endsWith('.m') || fname === name + '.m') continue;
      const info = this.loadFile(joinPath(classDir, fname), e.mtimeMs);
      if (info.main) { info.main.classInfo = ci; ci.methods.set(info.main.name, { fi: info.main, static: false, access: 'public', cls: ci }); }
    }
  }
  classFromFile(info, name, classDir) {
    const cached = this.userClasses.get(name);
    if (cached && cached.info === info) { cached.gen = this.gen; return cached.ci; }
    const cd = info.classdef;
    const ci = new ClassInfo(name);
    ci.file = info.path;
    ci.ast = cd;
    ci.attrs = this.evalAttrs(cd.attrs);
    this.userClasses.set(name, { ci, gen: this.gen, info });
    for (const s of cd.supers) {
      if (s === 'handle' || s === 'dynamicprops') { ci.isHandle = true; if (s === 'dynamicprops') ci.dynamic = true; continue; }
      const sup = this.findClass(s);
      if (!sup) {
        if (s.includes('.')) { if (/SetGet|Copyable|Heterogeneous|CustomDisplay/.test(s)) ci.isHandle = ci.isHandle || /SetGet|Copyable/.test(s); continue; }
        throw new MError('core:class:superNotFound', `The specified superclass '${s}' contains a parse error, cannot be found on the path, or is shadowed by another file with the same name.`);
      }
      ci.supers.push(sup);
      if (sup.isHandle) ci.isHandle = true;
    }
    const short = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : name;
    // methods
    for (const m of cd.methods) {
      const fi = this.makeFuncInfo(m, info, null, ci);
      const a = this.evalAttrs(m.attrs || {});
      fi.static = !!a.Static;
      fi.access = a.Access || 'public';
      fi.abstract = !!a.Abstract;
      if (m.name === short) { ci.ctorFi = fi; continue; }
      if (m.name.startsWith('get.')) { ci.getters.set(m.name.slice(4), fi); continue; }
      if (m.name.startsWith('set.')) { ci.setters.set(m.name.slice(4), fi); continue; }
      ci.methods.set(m.name, { fi, static: fi.static, access: fi.access, cls: ci });
    }
    if (classDir) this.addFolderMethods(ci, classDir, short);
    // properties (defaults are evaluated once, at class load)
    for (const p of cd.props) {
      const a = this.evalAttrs(p.attrs || {});
      const prop = {
        name: p.name, cls: ci, attrs: a, def: undefined, type: p.cls, dims: p.dims, validators: p.validators,
        get: a.GetAccess || a.Access || 'public', set: a.SetAccess || a.Access || 'public',
        constant: !!a.Constant, dependent: !!a.Dependent, hidden: !!a.Hidden, abstract: !!a.Abstract,
      };
      ci.props.set(p.name, prop);
      if (p.def) prop.defNode = p.def;
    }
    for (const prop of ci.props.values()) {
      if (prop.defNode) prop.def = this.evalInClass(prop.defNode, ci, info);
      else prop.def = prop.type && prop.type !== 'double' ? undefined : empty();
      if (prop.def === undefined) prop.def = empty();
    }
    for (const e of cd.events) ci.events.add(e.name);
    for (const e of cd.enums) ci.enumDefs.push(e);
    return ci;
  }
  evalAttrs(attrs) {
    const out = Object.create(null);
    for (const [k, v] of Object.entries(attrs || {})) {
      if ('value' in v) { out[k] = v.value; continue; }
      const e = v.expr;
      if (e.t === 'id') out[k] = e.name === 'true' ? true : e.name === 'false' ? false : e.name;
      else if (e.t === 'str' || e.t === 'dstr') out[k] = e.v;
      else if (e.t === 'num') out[k] = e.v !== 0;
      else if (e.t === 'meta') out[k] = 'private';
      else if (e.t === 'cellLit') out[k] = 'protected';
      else out[k] = true;
    }
    return out;
  }
  evalInClass(node, ci, info) {
    const fi = { name: ci.name, file: info.path, fileInfo: info, lookup: (n) => info.locals.get(n) || null, classInfo: ci, persist: Object.create(null), isScript: false };
    const comp = new Compiler(this, { fi, depth: null });
    const e = comp.expr(node);
    const ws = new Workspace(null, null);
    const frame = new Frame(ws, fi, info.path, ci.name, 'eval');
    this.stack.push(frame);
    try { return e.ev(frame); } finally { this.stack.pop(); }
  }

  newObject(ci) {
    const props = Object.create(null);
    const fill = (c) => {
      for (const s of c.supers) fill(s);
      for (const [k, p] of c.props) if (!p.constant && !p.dependent) props[k] = p.def;
    };
    fill(ci);
    const obj = { cls: ci.name, isObject: true, dims: [1, 1], handle: ci.isHandle, props };
    OWNED.add(obj);
    return obj;
  }

  construct(ci, args, f) {
    if (ci.js) return this.constructJs(ci, args);
    if (ci.oldStyle) { const r = this.callUser(ci.ctorFi, args, 1, { caller: f }); return r[0]; }
    if (ci.enumDefs.length && !this.constructingEnum) throw new MError('core:class:enumConstruct', `Cannot call the constructor of enumeration class '${ci.name}' outside the class definition.`);
    if (ci.isAbstract()) throw new MError('core:class:abstract', `Abstract classes cannot be instantiated. Class '${ci.name}' defines abstract methods and/or properties.`);
    const obj = this.newObject(ci);
    return this.runCtor(ci, obj, args, f);
  }
  constructJs(ci, args) {
    const def = ci.js.def;
    if (!def.construct) throw new MError('core:class:noConstructor', `The class '${ci.name}' has no constructor.`);
    const r = def.construct(args, this.ctx);
    return Array.isArray(r) ? r[0] : r;
  }
  runCtor(ci, obj, args, f) {
    if (ci.js) return obj;
    if (ci.ctorFi) {
      if (!ci.ctorFi.run) this.compileFunc(ci.ctorFi);
      if (!ci.ctorFi.callsSuper) for (const s of ci.supers) obj = this.runCtor(s, obj, [], f);
      const r = this.callUser(ci.ctorFi, args, 1, { presetOut: obj, caller: f });
      return r[0];
    }
    if (ci.supers.length === 1) return this.runCtor(ci.supers[0], obj, args, f);
    if (args.length) throw new MError('core:TooManyInputs', 'Too many input arguments.');
    for (const s of ci.supers) obj = this.runCtor(s, obj, [], f);
    return obj;
  }
  callSuper(objName, sup, args, nout, f, fi, objVal) {
    const sci = this.findClass(sup);
    if (!sci) throw new MError('core:class:superNotFound', `Superclass '${sup}' not found.`);
    if (fi && fi.classInfo && fi.outs && fi.outs[0] === objName && fi.classInfo.ctorFi === fi) {
      const r = [this.runCtor(sci, objVal !== undefined ? objVal : this.newObject(fi.classInfo), args, f)];
      r.isCtor = true;
      return r;
    }
    const m = sci.findMethod(objName);
    if (!m) throw new MError('core:class:noMethod', `No method '${objName}' in superclass '${sup}'.`);
    if (m.js) return this.callBuiltin(objName, m.fn, args, nout);
    return this.callUser(m.fi, args, nout, { caller: f });
  }

  objectDims(obj) {
    const ci = this.classOf(obj);
    if (ci && ci.js && ci.js.def.size) return ci.js.def.size(obj);
    return obj.dims || [1, 1];
  }

  /** Calls method `name` if the class of obj defines it; returns null otherwise. */
  tryObjectMethod(obj, name, args, nargout, noImplicit) {
    const ci = this.classOf(obj);
    if (!ci) return null;
    const m = ci.findMethod(name);
    if (m) {
      if (m.js) return this.callBuiltin(name, m.fn, args, nargout);
      if (m.access !== 'public' && !this.canAccess(m.access, m.cls)) throw new MError('core:class:MethodRestricted', `Cannot access method '${name}' in class '${ci.name}'.`);
      return this.callUser(m.fi, args, nargout, {});
    }
    if (noImplicit) return null;
    const imp = HANDLE_METHODS.get(name);
    if (imp && (!ci.js || name === 'delete' || name === 'isvalid')) {
      const r = imp(this, obj, args, nargout, ci);
      if (r !== null && r !== undefined) return r;
    }
    return null;
  }

  canAccess(level, defCls) {
    if (level === 'public' || level === true) return true;
    // the class of the running method
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const fi = this.stack[i].fi;
      if (!fi) continue;
      const c = fi.classInfo;
      if (!c) return false;
      if (level === 'private' || level === 'immutable') return c === defCls;
      return c.isa(defCls.name);
    }
    return false;
  }

  staticMember(ci, member, args, nout, hasCall, f) {
    if (ci.js) {
      const def = ci.js.def;
      if (def.static && def.static[member]) { const r = def.static[member](args, nout, this.ctx); return Array.isArray(r) ? r : r === undefined ? [] : [r]; }
      if (def.methods && def.methods[member]) return this.callBuiltin(member, def.methods[member], args, nout);
      throw new MError('core:class:noMember', `Unrecognized method, property, or field '${member}' for class '${ci.name}'.`);
    }
    // enumeration member
    if (ci.enumDefs.some((e) => e.name === member)) {
      const v = this.enumMember(ci, member);
      if (hasCall) return this.applyChain(v, [{ k: '()', args: args.map((a) => ({ cs: () => [a] })), end: false }], 0, f, nout);
      return [v];
    }
    const m = ci.findMethod(member);
    if (m) {
      if (m.access !== 'public' && !this.canAccess(m.access, m.cls)) throw new MError('core:class:MethodRestricted', `Cannot access method '${member}' in class '${ci.name}'.`);
      return this.callUser(m.fi, args, nout, { caller: f });
    }
    const p = ci.findProp(member);
    if (p && p.constant) return [p.def];
    throw new MError('core:class:noMember', `The class ${ci.name} has no Constant property or Static method named '${member}'.`);
  }
  enumMember(ci, name) {
    if (!ci.enumInstances) ci.enumInstances = new Map();
    let v = ci.enumInstances.get(name);
    if (v) return v;
    const def = ci.enumDefs.find((e) => e.name === name);
    const obj = this.newObject(ci);
    obj.enumName = name;
    const info = this.fileCache.get(ci.file);
    let args = [];
    if (def.args.length) args = def.args.map((a) => this.evalInClass(a, ci, info ? info.info : { path: ci.file, locals: new Map() }));
    this.constructingEnum = true;
    try {
      v = ci.ctorFi ? this.runCtor(ci, obj, args, null) : obj;
    } finally { this.constructingEnum = false; }
    v.enumName = name;
    OWNED.delete(v);
    ci.enumInstances.set(name, v);
    return v;
  }

  metaclassOf(name) {
    const ci = this.findClass(name);
    if (!ci) throw new MError('core:class:notFound', `Class '${name}' is not defined.`);
    return this.metaclass(ci);
  }
  metaclass(ci) {
    const props = Object.create(null);
    props.Name = str(ci.name);
    props.SuperclassList = cellRow(ci.supers.map((s) => str(s.name)));
    props.PropertyList = cellRow([...ci.allPropNames()].map((p) => str(p)));
    props.MethodList = cellRow([...ci.allMethodNames()].map((p) => str(p)));
    props.EventList = cellRow([...ci.events].map((p) => str(p)));
    props.HandleCompatible = bool(ci.isHandle);
    props.Abstract = bool(ci.isAbstract ? ci.isAbstract() : false);
    props.EnumerationMemberList = cellRow((ci.enumDefs || []).map((e) => str(e.name)));
    return { cls: 'meta.class', isObject: true, dims: [1, 1], handle: true, props };
  }

  // ---------------------------------------------------------------- object property access
  getProp(obj, name, quiet) {
    const ci = this.classOf(obj);
    if (!ci || ci.js) {
      const p = obj.props || {};
      if (name in p) return p[name];
      throw new MError('core:noSuchProperty', `Unrecognized property '${name}' for class '${obj.cls}'.`);
    }
    const prop = ci.findProp(name);
    if (!prop) {
      if (ci.dynamic && name in obj.props) return obj.props[name];
      throw new MError('core:noSuchMethodOrField', `Unrecognized method, property, or field '${name}' for class '${obj.cls}'.`);
    }
    if (!quiet && prop.get !== 'public' && !this.canAccess(prop.get, prop.cls)) throw new MError('core:class:GetProhibited', `Cannot access property '${name}' of class '${obj.cls}' because it is ${prop.get}.`);
    if (prop.constant) return prop.def;
    const getter = ci.findGetter(name);
    if (getter && !this.inAccessor(obj, name)) {
      this.accessorStack.push({ props: obj.props, name });
      try { const r = this.callUser(getter, [obj], 1, {}); return r[0]; } finally { this.accessorStack.pop(); }
    }
    if (prop.dependent) throw new MError('core:class:noGetMethod', `Dependent property '${name}' of class '${obj.cls}' has no get method.`);
    const v = obj.props[name];
    return v === undefined ? empty() : v;
  }
  inAccessor(obj, name) {
    for (const a of this.accessorStack) if (a.props === obj.props && a.name === name) return true;
    return false;
  }
  setProp(obj, name, v) {
    const ci = this.classOf(obj);
    if (!ci || ci.js) {
      if (obj.handle) { obj.props[name] = v; return obj; }
      const props = Object.assign(Object.create(null), obj.props);
      props[name] = v;
      return { ...obj, props };
    }
    const prop = ci.findProp(name);
    if (!prop) {
      if (ci.dynamic && name in obj.props) { obj.props[name] = v; return obj; }
      throw new MError('core:noPublicFieldForClass', `Unrecognized property '${name}' for class '${obj.cls}'.`);
    }
    if (prop.constant) throw new MError('core:class:SetProhibited', `Unable to set the '${name}' property of class '${obj.cls}' because it is a Constant property.`);
    if (prop.set !== 'public' && !this.canAccess(prop.set === 'immutable' ? 'private' : prop.set, prop.cls)) {
      throw new MError('core:class:SetProhibited', `Unable to set the '${name}' property of class '${obj.cls}' because it has ${prop.set} SetAccess.`);
    }
    if (prop.type && v.cls !== prop.type && !isObject(v)) {
      try { v = this.convertTo(v, prop.type); } catch { throw new MError('core:class:propType', `Error setting property '${name}' of class '${obj.cls}'. Value must be of type ${prop.type}.`); }
    }
    const setter = ci.findSetter(name);
    if (setter && !this.inAccessor(obj, name)) {
      this.accessorStack.push({ props: obj.props, name });
      try {
        const r = this.callUser(setter, [obj, v], obj.handle ? 0 : 1, {});
        if (!obj.handle) { if (!r.length) throw new MError('core:class:setMethodOutput', `The set method for property '${name}' must return the object.`); return r[0]; }
        return obj;
      } finally { this.accessorStack.pop(); }
    }
    if (prop.dependent) throw new MError('core:class:noSetMethod', `Dependent property '${name}' of class '${obj.cls}' has no set method.`);
    if (obj.handle) {
      obj.props[name] = v;
      this.firePropListeners(obj, name);
      return obj;
    }
    if (OWNED.has(obj)) { obj.props[name] = v; return obj; }
    const props = Object.assign(Object.create(null), obj.props);
    for (const k in props) disown(props[k]);
    props[name] = v;
    const nobj = { ...obj, props };
    OWNED.add(nobj);
    return nobj;
  }
  firePropListeners(obj, name) {
    const lmap = this.listeners.get(obj.props);
    if (!lmap) return;
    const ls = lmap.get('PostSet:' + name);
    if (!ls) return;
    for (const l of ls) if (l.enabled) this.callHandle(l.cb, [obj, this.eventData(obj, 'PostSet')], 0);
  }
  eventData(src, name) {
    const props = Object.create(null);
    props.Source = src;
    props.EventName = str(name);
    return { cls: 'event.EventData', isObject: true, dims: [1, 1], handle: true, props };
  }

  objectChain(obj, steps, k, f, nout, firstArgs) {
    const ci = this.classOf(obj);
    if (!ci) throw new MError('core:class:notFound', `Class '${obj.cls}' is not defined.`);
    const n = steps.length;
    // JS classes with subsref take the whole chain
    if (ci.js && ci.js.def.subsref) {
      const subs = [];
      for (let j = k; j < n; j++) subs.push(this.evalSub(steps[j], f, obj, firstArgs && j === 0 ? firstArgs : null));
      const r = ci.js.def.subsref(obj, subs, nout < 0 ? 1 : nout, this.ctx);
      return Array.isArray(r) ? r : r === undefined ? [] : [r];
    }
    if (!ci.js && !this.insideClass(ci)) {
      const m = ci.findMethod('subsref');
      if (m && !m.js) {
        const subs = [];
        for (let j = k; j < n; j++) subs.push(this.evalSub(steps[j], f, obj, firstArgs && j === 0 ? firstArgs : null));
        const S = struct([1, subs.length], ['type', 'subs'], subs.map((s) => { const r = Object.create(null); r.type = str(s.type); r.subs = s.type === '.' ? str(s.subs) : cellRow(s.subs.map((x) => (x === COLON ? str(':') : x))); return r; }));
        return this.callUser(m.fi, [obj, S], nout < 0 ? 1 : Math.max(nout, 1), {});
      }
    }
    const st = steps[k];
    const last = k === n - 1;
    let v;
    if (st.k === '.' || st.k === '.()') {
      const name = st.k === '.' ? st.name : this.fieldName(st.e.ev(f));
      if (ci.js) {
        const def = ci.js.def;
        if (def.methods && def.methods[name] && !(obj.props && name in obj.props)) {
          let args = [];
          let j = k + 1;
          if (j < n && steps[j].k === '()') { args = this.evalArgs(steps[j], f, undefined); j++; }
          const r = this.callBuiltin(name, def.methods[name], [obj, ...args], j === n ? (nout < 0 ? 1 : nout) : 1);
          if (j === n) return r;
          if (!r.length) throw this.noOutputError(name);
          return this.applyChain(r[0], steps, j, f, nout);
        }
        v = this.getProp(obj, name);
      } else {
        const prop = ci.findProp(name);
        if (prop) v = this.getProp(obj, name);
        else {
          const m = ci.findMethod(name);
          if (m || HANDLE_METHODS.has(name)) {
            let args = [];
            let j = k + 1;
            if (j < n && steps[j].k === '()') { args = this.evalArgs(steps[j], f, undefined); j++; }
            const cnt = j === n ? (nout < 0 ? 1 : nout) : 1;
            let r;
            if (m && m.static) r = this.callUser(m.fi, args, cnt, {});
            else if (m) {
              if (m.access !== 'public' && !this.canAccess(m.access, m.cls)) throw new MError('core:class:MethodRestricted', `Cannot access method '${name}' in class '${ci.name}'.`);
              r = this.callUser(m.fi, [obj, ...args], cnt, {});
            } else r = this.tryObjectMethod(obj, name, [obj, ...args], cnt) || [];
            if (j === n) return r;
            if (!r.length) throw this.noOutputError(name);
            return this.applyChain(r[0], steps, j, f, nout);
          }
          if (ci.dynamic && name in obj.props) v = obj.props[name];
          else throw new MError('core:noSuchMethodOrField', `Unrecognized method, property, or field '${name}' for class '${obj.cls}'.`);
        }
      }
      if (last) return [v];
      return this.applyChain(v, steps, k + 1, f, nout);
    }
    if (st.k === '()') {
      const args = firstArgs && k === 0 ? firstArgs : this.evalArgs(st, f, obj);
      if (args.length === 0 || args.every((a) => a === COLON || (isTensor(a) && a.re.length === 1 && a.re[0] === 1) || (isTensor(a) && a.cls === 'logical' && a.re.length === 1 && a.re[0] === 1))) {
        if (last) return [obj];
        return this.applyChain(obj, steps, k + 1, f, nout);
      }
      throw new MError('core:index:outOfBounds', 'Index exceeds the number of array elements. Index must not exceed 1.');
    }
    throw new MError('core:brace:object', `Brace indexing is not supported for variables of type '${obj.cls}'.`);
  }
  insideClass(ci) {
    const fr = this.currentFrame();
    return !!(fr.fi && fr.fi.classInfo && fr.fi.classInfo.isa(ci.name));
  }
  evalSub(st, f, obj, pre) {
    if (st.k === '.') return { type: '.', subs: st.name };
    if (st.k === '.()') return { type: '.', subs: this.fieldName(st.e.ev(f)) };
    return { type: st.k, subs: pre || this.evalArgs(st, f, obj) };
  }

  objectAssign(obj, steps, k, rhs, f) {
    const ci = this.classOf(obj);
    if (!ci) throw new MError('core:class:notFound', `Class '${obj.cls}' is not defined.`);
    const n = steps.length;
    if (ci.js && ci.js.def.subsasgn) {
      const subs = [];
      for (let j = k; j < n; j++) subs.push(this.evalSub(steps[j], f, obj, null));
      return ci.js.def.subsasgn(obj, subs, rhs, this.ctx);
    }
    if (!ci.js && !this.insideClass(ci)) {
      const m = ci.findMethod('subsasgn');
      if (m && !m.js) {
        const subs = [];
        for (let j = k; j < n; j++) subs.push(this.evalSub(steps[j], f, obj, null));
        const S = struct([1, subs.length], ['type', 'subs'], subs.map((s) => { const r = Object.create(null); r.type = str(s.type); r.subs = s.type === '.' ? str(s.subs) : cellRow(s.subs.map((x) => (x === COLON ? str(':') : x))); return r; }));
        return this.callUser(m.fi, [obj, S, rhs], 1, {})[0];
      }
    }
    const st = steps[k];
    const last = k === n - 1;
    if (st.k === '.' || st.k === '.()') {
      const name = st.k === '.' ? st.name : this.fieldName(st.e.ev(f));
      if (last) return this.setProp(obj, name, rhs);
      let cur = this.getProp(obj, name);
      // the current value is shared with the object; let nested assignment work on it in place only for owned values
      const nv = this.assignChain(cur, steps, k + 1, rhs, f);
      return this.setProp(obj, name, nv);
    }
    if (st.k === '()') {
      const args = this.evalArgs(st, f, obj);
      const one = args.every((a) => a !== COLON && isTensor(a) && a.re.length === 1 && a.re[0] === 1);
      if (!one) throw new MError('core:objectArrays', 'Arrays of objects are not supported; store objects in a cell array instead.');
      if (last) return rhs;
      return this.assignChain(obj, steps, k + 1, rhs, f);
    }
    throw new MError('core:brace:object', `Brace indexing is not supported for variables of type '${obj.cls}'.`);
  }

  // ---------------------------------------------------------------- evaluation entry points
  parseCode(code, opts = {}) {
    const cacheable = opts.cache !== false;
    if (cacheable) {
      const c = this.evalCache.get(code);
      if (c) return c;
    }
    const ast = parse(code, { file: opts.file || null, isVar: opts.isVar });
    if (cacheable) {
      const toks = lex(code, { commandSyntax: true });
      if (!toks.some((t) => t.type === 'cmd')) {
        if (this.evalCache.size > 500) this.evalCache.clear();
        this.evalCache.set(code, ast);
      }
    }
    return ast;
  }

  /** Runs code text in a frame's workspace. Returns values when the code is a single expression (ctx.evalString). */
  evalIn(frame, code, wantValue, nargout = 1) {
    const ws = frame.ws;
    const ast = this.parseCode(code, { isVar: (n) => this.readWs(ws, n) !== undefined });
    const pseudo = this.codeInfo(ast, frame);
    const comp = new Compiler(this, { fi: pseudo, depth: frame.fi && frame.fi.depth ? frame.fi.depth : null });
    if (wantValue && ast.body.length === 1 && ast.body[0].t === 'expr') {
      const e = comp.expr(ast.body[0].e);
      const ef = new Frame(ws, pseudo, frame.file, frame.name, frame.kind === 'base' ? 'base' : 'eval');
      ef.line = frame.line;
      this.stack.push(ef);
      try {
        const vals = nargout > 1 || ast.body[0].e.t === 'index' || ast.body[0].e.t === 'id' ? e.mv(ef, nargout) : [e.ev(ef)];
        if (ast.body[0].print && nargout === 0 && vals.length) { this.setAns(ef, vals[0]); this.display('ans', vals[0], ef); }
        return vals;
      } finally { this.stack.pop(); }
    }
    const run = comp.block(ast.body);
    const ef = new Frame(ws, pseudo, frame.file, frame.name, frame.kind === 'base' ? 'base' : 'eval');
    this.stack.push(ef);
    try { run(ef); } finally { this.stack.pop(); }
    return [];
  }
  /** FuncInfo-like object for code text run in a frame (keeps local function lookup of that frame). */
  codeInfo(ast, frame) {
    const parentFi = frame.fi;
    const locals = new Map();
    const info = { path: frame.file, locals };
    for (const fn of ast.functions) locals.set(fn.name, this.makeFuncInfo(fn, info, null, null));
    return {
      name: frame.name, file: frame.file, isScript: true, persist: parentFi ? parentFi.persist : Object.create(null),
      classInfo: parentFi ? parentFi.classInfo : null, depth: parentFi ? parentFi.depth : null,
      lookup: (n) => locals.get(n) || (parentFi && parentFi.lookup ? parentFi.lookup(n) : null),
    };
  }

  // ---------------------------------------------------------------- debugger
  updateDbg() { this.dbgOn = this.breakpoints.size > 0 || this.stepMode !== null; }
  setBreakpoints(file, lines) {
    file = normPath(file);
    if (!lines || !lines.length) this.breakpoints.delete(file);
    else this.breakpoints.set(file, new Set(lines.map(Number)));
    this.updateDbg();
  }
  debugHook(f, line) {
    if (this.inDebugEval) return;
    let pause = false;
    const depth = this.stack.length;
    if (this.stepMode !== null) {
      if (this.stepMode === 'stepIn') pause = true;
      else if (this.stepMode === 'step') pause = depth <= this.stepDepth;
      else if (this.stepMode === 'stepOut') pause = depth < this.stepDepth;
    }
    if (!pause && f.file) { const s = this.breakpoints.get(f.file); if (s && s.has(line)) pause = true; }
    if (pause) this.pauseAt(f, line, 'breakpoint');
  }
  stackInfo() {
    const out = [];
    for (let i = this.stack.length - 1; i >= 0; i--) { const fr = this.stack[i]; if (fr.kind !== 'eval') out.push({ file: fr.file || '', name: fr.name || '', line: fr.line }); }
    return out;
  }
  pauseAt(f, line, reason) {
    this.stepMode = null;
    this.updateDbg();
    for (;;) {
      const reply = this.host.request({ type: 'debug.paused', file: f.file || '', line, reason, stack: this.stackInfo(), vars: this.listVariables(f.ws) });
      if (reply == null || reply === 'continue') return;
      if (reply === 'step' || reply === 'stepIn' || reply === 'stepOut') {
        this.stepMode = reply;
        this.stepDepth = this.stack.length;
        this.updateDbg();
        return;
      }
      if (reply === 'stop') throw new MError('core:debugQuit', 'Debugging stopped.');
      if (typeof reply === 'object' && reply.eval !== undefined) {
        const code = String(reply.eval).trim();
        const cmd = code.replace(/;$/, '');
        if (cmd === 'dbcont') return;
        if (cmd === 'dbquit') throw new MError('core:debugQuit', 'Debugging stopped.');
        if (cmd === 'dbstep' || cmd === 'dbstep in' || cmd === 'dbstep out') {
          this.stepMode = cmd === 'dbstep' ? 'step' : cmd === 'dbstep in' ? 'stepIn' : 'stepOut';
          this.stepDepth = this.stack.length;
          this.updateDbg();
          return;
        }
        this.inDebugEval = true;
        try { this.evalIn(f, code, true, 0); } catch (e) {
          const me = this.catchable(e);
          if (!me) throw e;
          this.print(this.errorReport(me) + '\n', 'err');
        } finally { this.inDebugEval = false; }
        continue;
      }
      return;
    }
  }

  // ---------------------------------------------------------------- workspace listing
  listVariables(ws = this.base) {
    const out = [];
    const names = Object.keys(ws.vars).sort((a, b) => a.localeCompare(b));
    for (const name of names) {
      const v = this.readWs(ws, name);
      if (v === undefined) continue;
      out.push({ name, cls: v.cls, dims: (v.dims || [1, 1]).slice(), bytes: bytesOf(v), summary: summaryOf(v, this.format), global: !!(ws.gl && ws.gl[name] === this.globals) });
    }
    return out;
  }

  shell(text) {
    try {
      const r = this.fs.system(text);
      if (r && r.output) this.out(r.output.endsWith('\n') ? r.output : r.output + '\n');
    } catch (e) {
      throw new MError('core:system:unavailable', e.message || 'System commands are not available here.');
    }
  }
}

function qualifiedName(fi) {
  const c = fi.classInfo;
  return c ? `${c.name}/${fi.name}` : fi.name;
}

function astHasSuper(body, objName) {
  let found = false;
  const visit = (n) => {
    if (found || !n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(visit); return; }
    if (n.t === 'super' && n.name === objName) { found = true; return; }
    for (const k in n) { const v = n[k]; if (v && typeof v === 'object') visit(v); }
  };
  visit(body);
  return found;
}

/** Leading comment block of a file (help text). */
export function helpComment(src, fromLine) {
  const lines = src.split(/\r?\n/);
  const out = [];
  let i = fromLine; // line after header (1-based fromLine is the header line)
  if (fromLine === 1 && !/^\s*%/.test(lines[0] || '')) i = 1;
  // comments right after the header
  for (; i < lines.length; i++) {
    const m = /^\s*%(.*)$/.exec(lines[i]);
    if (!m) break;
    out.push(m[1].replace(/^ /, ''));
  }
  if (!out.length) {
    // comments before the header (scripts)
    for (let j = 0; j < lines.length; j++) { const m = /^\s*%(.*)$/.exec(lines[j]); if (!m) break; out.push(m[1].replace(/^ /, '')); }
  }
  return out.length ? out.join('\n') : null;
}

export function bytesOf(v) {
  if (!v) return 0;
  if (v.re !== undefined && !v.sparse) {
    const per = { double: 8, single: 4, int8: 1, uint8: 1, int16: 2, uint16: 2, int32: 4, uint32: 4, int64: 8, uint64: 8, logical: 1, char: 2 }[v.cls] || 8;
    return v.re.length * per * (v.im ? 2 : 1);
  }
  if (v.sparse) return v.re.length * 16 + (v.dims[1] + 1) * 8;
  if (isCell(v)) return v.data.reduce((s, x) => s + bytesOf(x) + 104, 0);
  if (isStruct(v)) return v.data.reduce((s, r) => s + v.fields.reduce((t, f) => t + bytesOf(r[f]) + 104, 0), 0) + v.fields.length * 64;
  if (isString(v)) return v.data.reduce((s, x) => s + 6 + (x ? x.length * 2 : 0) + 144, 0);
  return 8;
}
export function summaryOf(v, fmt) {
  if (isObject(v)) return `1×1 ${v.cls}`;
  const n = prod(v.dims || [1, 1]);
  if (v.cls === 'function_handle') return brief(v, fmt);
  if ((isTensor(v) && (n === 1 || (v.cls === 'char' && v.dims[0] === 1)) && !v.sparse) || (isString(v) && n === 1)) return brief(v, fmt);
  if (isTensor(v) && n <= 10 && v.dims[0] === 1 && !v.im) return brief(v, fmt);
  return `${(v.dims || [1, 1]).join('×')} ${v.sparse ? 'sparse ' + v.cls : v.cls}`;
}

export { joinPath, dirName, baseName, normPath, structOf, parseExpr };
