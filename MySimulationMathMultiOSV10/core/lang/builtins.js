// Builtins owned by the language: evaluation, workspaces, functions and
// handles, errors and warnings, paths, classes and objects, debugging,
// interaction and session commands. Each has the library signature
// (args, nargout, ctx); ctx.interp is the running interpreter.
import {
  MError, str, num, bool, cell, cellRow, struct, structOf, toStr, isText, isTensor, isCell, isStruct, isString,
  isObject, toNum, empty, stringArray, tensor, prod, isFuncHandle, NUMERIC_CLASSES, INT_RANGE,
} from '../value.js';
import { parseExpr } from './parser.js';
import { Compiler } from './compile.js';
import { formatDisplay, formatDisp, handleText } from './display.js';
import { fallbackOp } from './ops.js';
import { joinPath, dirName, baseName, normPath, Workspace, Frame, bytesOf, helpComment } from './interp.js';
import { KEYWORDS } from './lexer.js';
import { disown } from './indexing.js';

const S = (v, what) => toStr(v, what);
const textArg = (v, fn) => { if (!v || !isText(v)) throw new MError(`core:${fn}:notText`, 'Argument must be a character vector or string scalar.'); return toStr(v); };
const isVarName = (s) => /^[A-Za-z]\w{0,62}$/.test(s) && !KEYWORDS.has(s);
const cellOfStr = (arr, col = true) => cell(col ? [arr.length, 1] : [1, arr.length], arr.map((s) => str(s)));
const wsOf = (rt, which) => {
  const w = which.toLowerCase();
  if (w === 'base') return rt.baseFrame;
  if (w === 'caller') return rt.callerFrame();
  throw new MError('core:evalin:badWorkspace', "The workspace must be 'base' or 'caller'.");
};

function evalCode(rt, frame, code, nargout) {
  if (nargout > 0) return rt.evalIn(frame, code, true, nargout);
  rt.evalIn(frame, code, true, 0);
  return [];
}

/** Text of a help entry for `name` (builtin help or the leading comment of a file). */
export function helpFor(rt, name) {
  const h = rt.help[name];
  if (h) {
    const text = [h.en || '', ...(h.syntax || []).map((s) => '    ' + s)].join('\n');
    return { text, syntax: h.syntax || [], en: h.en || '', ko: h.ko || '' };
  }
  try {
    const t = rt.resolve(name);
    if (t && t.kind === 'user' && t.fi.help) return { text: t.fi.help, syntax: [], en: t.fi.help, ko: '' };
    if (t && t.kind === 'script' && t.si.help) return { text: t.si.help, syntax: [], en: t.si.help, ko: '' };
    if (t && t.kind === 'class' && t.ci.file) {
      const info = rt.fileCache.get(t.ci.file);
      const txt = info ? helpComment(info.info.src, info.info.ast.classdef.line) : null;
      if (txt) return { text: txt, syntax: [], en: txt, ko: '' };
    }
  } catch { /* ignore */ }
  return null;
}

function fileFor(rt, name) {
  if (!name) return null;
  if (name.includes('/') || name.includes('\\')) return normPath(name);
  const n = name.replace(/\.m$/, '');
  const f = rt.findFile(n);
  if (f) return f.path;
  try { const p = joinPath(normPath(rt.fs.cwd()), name); if (rt.fs.exists(p)) return p; } catch { /* ignore */ }
  return null;
}

function classNameOf(v) { return v.cls; }

const CATEGORY = {
  numeric: (c) => NUMERIC_CLASSES.includes(c),
  float: (c) => c === 'double' || c === 'single',
  integer: (c) => c in INT_RANGE,
};

function printList(rt, names) {
  if (!names.length) return;
  const w = Math.max(...names.map((n) => n.length)) + 2;
  const per = Math.max(1, Math.floor(76 / w));
  let out = '\n';
  for (let i = 0; i < names.length; i += per) out += names.slice(i, i + per).map((n) => n.padEnd(w)).join('') + '\n';
  rt.out(out + '\n');
}

function matchNames(all, patterns) {
  const regs = patterns.map((p) => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'));
  return all.filter((n) => regs.some((r) => r.test(n)));
}

function clearVars(rt, ws, names) {
  for (const n of names) {
    const v = ws.vars[n];
    if (v && v.cls === 'onCleanup' && v.isObject) rt.fireCleanup(v);
    delete ws.vars[n];
    if (ws.gl) delete ws.gl[n];
  }
  rt.varsChanged = true;
}

function pathSep(rt) { return rt.path.some((p) => /^[A-Za-z]:/.test(p)) ? ';' : ':'; }

function genpathOf(rt, dir) {
  const out = [dir];
  let entries = [];
  try { entries = rt.fs.list(dir); } catch { return out; }
  for (const e of entries) {
    if (!e.isDir) continue;
    if (e.name.startsWith('+') || e.name.startsWith('@') || e.name === 'private' || e.name.startsWith('.')) continue;
    out.push(...genpathOf(rt, joinPath(dir, e.name)));
  }
  return out;
}

function absPath(rt, p) {
  p = normPath(p);
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) return p;
  if (p === '~') return normPath(rt.fs.homeDir());
  if (p.startsWith('~/')) return joinPath(normPath(rt.fs.homeDir()), p.slice(2));
  const parts = [];
  for (const s of (normPath(rt.fs.cwd()) + '/' + p).split('/')) {
    if (s === '' || s === '.') { if (!parts.length) parts.push(''); continue; }
    if (s === '..') { if (parts.length > 1) parts.pop(); continue; }
    parts.push(s);
  }
  let r = parts.join('/');
  if (!r.startsWith('/') && !/^[A-Za-z]:/.test(r)) r = '/' + r;
  return r.replace(/^\/([A-Za-z]:)/, '$1');
}

function stackStruct(rt, skip = 0) {
  const fr = rt.stackInfo().slice(skip);
  return struct([fr.length, 1], ['file', 'name', 'line'], fr.map((s) => { const r = Object.create(null); r.file = str(s.file); r.name = str(s.name); r.line = num(s.line); return r; }));
}

function makeHandleFromText(rt, text) {
  const t = text.trim();
  if (t.startsWith('@')) {
    const e = parseExpr(t);
    if (e.t === 'anon') {
      const comp = new Compiler(rt, { fi: null, depth: null });
      const c = comp.expr(e);
      const f = new Frame(new Workspace(), null, null, 'str2func', 'eval');
      return c.ev(f);
    }
    if (e.t === 'fh') return { cls: 'function_handle', dims: [1, 1], name: e.name };
  }
  if (!/^[A-Za-z][\w.]*$/.test(t)) throw new MError('core:str2func:invalid', `Invalid function name '${t}'.`);
  return { cls: 'function_handle', dims: [1, 1], name: t };
}

function errorArgs(rt, args) {
  // error(msg) | error(fmt, a...) | error(id, fmt, a...) | error(struct)
  if (args.length === 1 && isStruct(args[0])) {
    const r = args[0].data[0] || {};
    const msg = r.message ? S(r.message) : '';
    const id = r.identifier ? S(r.identifier) : '';
    return { id, msg };
  }
  const first = S(args[0]);
  if (args.length === 1) return { id: '', msg: first };
  const looksId = /^[A-Za-z][\w-]*(:[\w-]+)+$/.test(first) && !/\s/.test(first);
  if (looksId) return { id: first, msg: rt.formatMessage(S(args[1]), args.slice(2)) };
  return { id: '', msg: rt.formatMessage(first, args.slice(1)) };
}

export const builtins = {
  // ---------------------------------------------------------------- evaluation
  eval(args, nargout, ctx) {
    const rt = ctx.interp;
    const code = textArg(args[0], 'eval');
    const frame = rt.currentFrame();
    if (args.length > 1) {
      const depth = rt.stack.length;
      try { return evalCode(rt, frame, code, nargout); } catch (e) {
        const me = rt.catchable(e);
        if (!me) throw e;
        rt.unwindTo(depth);
        rt.lastError = me;
        return evalCode(rt, frame, textArg(args[1], 'eval'), nargout);
      }
    }
    return evalCode(rt, frame, code, nargout);
  },
  evalin(args, nargout, ctx) {
    const rt = ctx.interp;
    const frame = wsOf(rt, textArg(args[0], 'evalin'));
    const code = textArg(args[1], 'evalin');
    if (args.length > 2) {
      try { return evalCode(rt, frame, code, nargout); } catch (e) { const me = rt.catchable(e); if (!me) throw e; rt.lastError = me; return evalCode(rt, frame, textArg(args[2], 'evalin'), nargout); }
    }
    return evalCode(rt, frame, code, nargout);
  },
  assignin(args, nargout, ctx) {
    const rt = ctx.interp;
    const frame = wsOf(rt, textArg(args[0], 'assignin'));
    const name = textArg(args[1], 'assignin');
    if (!isVarName(name)) throw new MError('core:assignin:invalidName', `Invalid variable name "${name}".`);
    rt.writeWs(frame.ws, name, disown(args[2]));
    rt.varsChanged = true;
    return [];
  },
  feval(args, nargout, ctx) {
    if (!args.length) throw new MError('core:minrhs', 'Not enough input arguments.');
    return ctx.interp.callAny(args[0], args.slice(1), nargout);
  },
  builtin(args, nargout, ctx) {
    const rt = ctx.interp;
    const name = textArg(args[0], 'builtin');
    if (name === 'subsref' || name === 'subsasgn') return builtins[name](args.slice(1), nargout, ctx, true);
    const fn = rt.builtins[name];
    if (!fn) throw new MError('core:builtin:notFound', `Cannot find builtin function '${name}'.`);
    const a = args.slice(1);
    // operators on objects: apply the default implementation to plain values
    return rt.callBuiltin(name, fn, a, nargout);
  },
  run(args, nargout, ctx) {
    const rt = ctx.interp;
    let p = textArg(args[0], 'run');
    if (!p.endsWith('.m')) p += '.m';
    const full = p.includes('/') || p.includes('\\') ? absPath(rt, p) : fileFor(rt, p) || absPath(rt, p);
    if (!rt.fs.exists(full)) throw new MError('core:run:fileNotFound', `File "${p}" not found.`);
    const info = rt.loadFile(full);
    const frame = rt.currentFrame();
    const old = normPath(rt.fs.cwd());
    const dir = dirName(full);
    if (dir !== old) rt.setCwd(dir);
    try {
      if (info.script) rt.runScript(info.script, frame, 0);
      else rt.callUser(info.main, [], 0, { caller: frame });
    } finally { if (dir !== old) { try { rt.setCwd(old); } catch { /* removed */ } } }
    return [];
  },

  // ---------------------------------------------------------------- workspace
  exist(args, nargout, ctx) {
    const rt = ctx.interp;
    const name = textArg(args[0], 'exist');
    const type = args[1] ? S(args[1]).toLowerCase() : '';
    const ws = rt.currentWs();
    if ((!type || type === 'var') && rt.readWs(ws, name) !== undefined) return num(1);
    if (type === 'var') return num(0);
    if (!type || type === 'file' || type === 'class' || type === 'builtin' || type === 'dir') {
      if (type !== 'dir' && type !== 'builtin') {
        let t = null;
        try { t = /^[A-Za-z][\w.]*$/.test(name) ? rt.resolve(name.replace(/\.m$/, '')) : null; } catch { t = null; }
        if (t && t.kind === 'class' && !t.ci.js && (type === '' || type === 'class')) return num(8);
        if (t && (t.kind === 'user' || t.kind === 'script') && type !== 'class') return num(2);
        if (t && t.kind === 'class' && t.ci.js && (type === '' || type === 'class')) return num(8);
      }
      if ((!type || type === 'builtin') && rt.builtins[name]) return num(5);
      try {
        const p = absPath(rt, name);
        if (rt.fs.exists(p)) { const st = rt.fs.stat(p); if (st.isDir && (!type || type === 'dir')) return num(7); if (!st.isDir && (!type || type === 'file')) return num(2); }
      } catch { /* ignore */ }
    }
    return num(0);
  },
  which(args, nargout, ctx) {
    const rt = ctx.interp;
    const name = textArg(args[0], 'which');
    let text;
    if (rt.readWs(rt.currentWs(), name) !== undefined) text = `${name} is a variable.`;
    else {
      const t = rt.resolve(name);
      if (!t) text = `'${name}' not found.`;
      else if (t.kind === 'user') text = t.fi.file;
      else if (t.kind === 'script') text = t.si.file;
      else if (t.kind === 'class') text = t.ci.file ? `${t.ci.file}  % ${name} constructor` : `built-in (${name} class)`;
      else text = `built-in (${(rt.registry.owner && rt.registry.owner[name]) || 'language'}/${name})`;
    }
    if (nargout > 0) return str(text.endsWith('not found.') ? '' : text);
    rt.out(text + '\n');
    return [];
  },
  clear(args, nargout, ctx) {
    const rt = ctx.interp;
    const ws = rt.currentWs();
    const words = args.map((a) => S(a));
    if (!words.length) { clearVars(rt, ws, Object.keys(ws.vars)); return []; }
    const opt = words[0].toLowerCase();
    if (opt === 'all' || opt === '-all') {
      clearVars(rt, ws, Object.keys(ws.vars));
      for (const k of Object.keys(rt.globals)) delete rt.globals[k];
      rt.fileCache.clear(); rt.fnCache.clear(); rt.userClasses.clear(); rt.evalCache.clear(); rt.bumpGen();
      return [];
    }
    if (opt === 'functions' || opt === '-functions' || opt === 'classes' || opt === '-classes') {
      rt.fileCache.clear(); rt.fnCache.clear(); rt.evalCache.clear(); rt.bumpGen();
      if (opt.includes('classes')) { rt.userClasses.clear(); clearVars(rt, ws, Object.keys(ws.vars)); }
      return [];
    }
    if (opt === 'global' || opt === '-global') {
      const names = words.length > 1 ? words.slice(1) : Object.keys(rt.globals);
      for (const n of names) { delete rt.globals[n]; if (ws.gl && ws.gl[n]) clearVars(rt, ws, [n]); }
      return [];
    }
    if (opt === 'variables' || opt === '-variables') { clearVars(rt, ws, words.length > 1 ? matchNames(Object.keys(ws.vars), words.slice(1)) : Object.keys(ws.vars)); return []; }
    if (opt === '-regexp') { const res = words.slice(1).map((p) => new RegExp(p)); clearVars(rt, ws, Object.keys(ws.vars).filter((n) => res.some((r) => r.test(n)))); return []; }
    if (opt === 'import' || opt === 'java' || opt === 'mex') return [];
    clearVars(rt, ws, matchNames(Object.keys(ws.vars), words));
    // a function name clears its cached definition
    for (const w of words) if (!/[*?]/.test(w)) { rt.fnCache.delete(w); }
    return [];
  },
  clearvars(args, nargout, ctx) {
    const rt = ctx.interp;
    const ws = rt.currentWs();
    const words = args.map((a) => S(a));
    const ex = words.indexOf('-except');
    const keep = ex >= 0 ? words.slice(ex + 1) : [];
    let targets = ex >= 0 ? words.slice(0, ex) : words;
    targets = targets.filter((w) => w !== '-global');
    let names = targets.length ? matchNames(Object.keys(ws.vars), targets) : Object.keys(ws.vars);
    if (keep.length) { const k = new Set(matchNames(names, keep)); names = names.filter((n) => !k.has(n)); }
    clearVars(rt, ws, names);
    return [];
  },
  who(args, nargout, ctx) {
    const rt = ctx.interp;
    const ws = rt.currentWs();
    let names = Object.keys(ws.vars).sort();
    if (args.length) names = matchNames(names, args.map((a) => S(a)).filter((w) => !w.startsWith('-')));
    if (nargout > 0) return cellOfStr(names);
    if (names.length) { rt.out('\nYour variables are:\n'); printList(rt, names); }
    return [];
  },
  whos(args, nargout, ctx) {
    const rt = ctx.interp;
    const ws = rt.currentWs();
    let list = rt.listVariables(ws);
    if (args.length) { const keep = new Set(matchNames(list.map((v) => v.name), args.map((a) => S(a)))); list = list.filter((v) => keep.has(v.name)); }
    if (nargout > 0) {
      return struct([list.length, 1], ['name', 'size', 'bytes', 'class', 'global', 'sparse', 'complex'], list.map((v) => {
        const val = rt.readWs(ws, v.name);
        const r = Object.create(null);
        r.name = str(v.name); r.size = tensor('double', [1, v.dims.length], v.dims); r.bytes = num(v.bytes); r.class = str(v.cls);
        r.global = bool(v.global); r.sparse = bool(!!val.sparse); r.complex = bool(!!val.im);
        return r;
      }));
    }
    if (!list.length) return [];
    const rows = list.map((v) => [v.name, v.dims.join('x'), String(v.bytes), v.cls + (v.global ? ' (global)' : '')]);
    const head = ['Name', 'Size', 'Bytes', 'Class'];
    const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
    let out = '  ' + head.map((h, i) => (i === 2 ? h.padStart(w[i]) : h.padEnd(w[i]))).join('    ') + '\n\n';
    for (const r of rows) out += '  ' + r.map((c, i) => (i === 2 ? c.padStart(w[i]) : c.padEnd(w[i]))).join('    ') + '\n';
    rt.out(out + '\n');
    return [];
  },
  isvarname(args) {
    const v = args[0];
    if (!v || !isText(v)) return bool(false);
    return bool(isVarName(toStr(v)));
  },
  inputname(args, nargout, ctx) {
    const rt = ctx.interp;
    const k = toNum(args[0]);
    const ws = rt.currentWs();
    const names = ws.argNames;
    if (!names || ws.fi === null) throw new MError('core:inputname:notInFunction', 'inputname can only be called inside a function.');
    if (k < 1 || k > ws.nargin) throw new MError('core:inputname:argNumberExceedsNargin', 'The argument number exceeds the number of inputs.');
    return str(names[k - 1] || '');
  },
  narginchk(args, nargout, ctx) {
    const lo = toNum(args[0]), hi = toNum(args[1]);
    const n = ctx.interp.currentWs().nargin;
    if (n < lo) throw Object.assign(new MError('core:narginchk:notEnoughInputs', 'Not enough input arguments.'), {});
    if (n > hi) throw new MError('core:narginchk:tooManyInputs', 'Too many input arguments.');
    return [];
  },
  nargoutchk(args, nargout, ctx) {
    const lo = toNum(args[0]), hi = toNum(args[1]);
    const n = ctx.interp.currentWs().nargout;
    if (n < lo) throw new MError('core:nargoutchk:notEnoughOutputs', 'Not enough output arguments.');
    if (n > hi) throw new MError('core:nargoutchk:tooManyOutputs', 'Too many output arguments.');
    return [];
  },
  nargin(args, nargout, ctx) {
    const rt = ctx.interp;
    if (!args.length) {
      const ws = rt.currentWs();
      if (!ws.fi && ws === rt.base) throw new MError('core:nargin:notInFunction', "You can only call nargin from within a function.");
      return num(ws.nargin);
    }
    const fi = funcInfoOf(rt, args[0]);
    const p = fi.params || [];
    return num(p.length && p[p.length - 1] === 'varargin' ? -p.length : p.length);
  },
  nargout(args, nargout, ctx) {
    const rt = ctx.interp;
    if (!args.length) {
      const ws = rt.currentWs();
      if (!ws.fi && ws === rt.base) throw new MError('core:nargout:notInFunction', "You can only call nargout from within a function.");
      return num(ws.nargout);
    }
    const fi = funcInfoOf(rt, args[0]);
    const o = fi.outs || [];
    return num(o.length && o[o.length - 1] === 'varargout' ? -o.length : o.length);
  },
  mfilename(args, nargout, ctx) {
    const rt = ctx.interp;
    const f = rt.currentFrame();
    const file = f.file || '';
    const opt = args[0] ? S(args[0]) : '';
    if (!file) return str('');
    if (opt === 'fullpath') return str(file.replace(/\.m$/, ''));
    if (opt === 'class') return str(f.fi && f.fi.classInfo ? f.fi.classInfo.name : '');
    return str(baseName(file).replace(/\.m$/, ''));
  },

  // ---------------------------------------------------------------- function handles
  func2str(args) {
    const h = args[0];
    if (!isFuncHandle(h)) throw new MError('core:func2str:notHandle', 'Input must be a function handle.');
    return str(h.anon ? h.text : h.name);
  },
  str2func(args, nargout, ctx) {
    const t = textArg(args[0], 'str2func');
    return makeHandleFromText(ctx.interp, t);
  },
  functions(args) {
    const h = args[0];
    if (!isFuncHandle(h)) throw new MError('core:functions:notHandle', 'Input must be a function handle.');
    if (h.anon) {
      const ws = structOf(Object.fromEntries(Object.entries(h.closure)));
      return structOf({ function: str(h.text), type: str('anonymous'), file: str(''), workspace: cellRow([ws]) });
    }
    if (h.fi) return structOf({ function: str(h.name), type: str(h.fi.parent ? 'nested' : h.fi.isMain ? 'simple' : 'scopedfunction'), file: str(h.fi.file || '') });
    return structOf({ function: str(h.name), type: str('simple'), file: str('') });
  },

  // ---------------------------------------------------------------- errors and warnings
  error(args, nargout, ctx) {
    if (!args.length) throw new MError('core:minrhs', 'Not enough input arguments.');
    const rt = ctx.interp;
    if (args.length === 1 && isTensor(args[0]) && prod(args[0].dims) === 0) return [];
    if (args.length === 1 && isStruct(args[0]) && prod(args[0].dims) === 0) return [];
    const { id, msg } = errorArgs(rt, args);
    if (args.length === 1 && isStruct(args[0]) && !msg) return [];
    const e = new MError(id, msg);
    e.fromError = true;
    e.extra.noFn = true;
    throw e;
  },
  warning(args, nargout, ctx) {
    const rt = ctx.interp;
    const stateStruct = () => struct([rt.warnState.size, 1], ['identifier', 'state'], [...rt.warnState].map(([k, v]) => { const r = Object.create(null); r.identifier = str(k); r.state = str(v); return r; }));
    if (!args.length) {
      if (nargout > 0) return stateStruct();
      rt.out(`All warnings have the state '${rt.warnState.get('all')}'.\n`);
      return [];
    }
    if (isStruct(args[0])) {
      for (const r of args[0].data) rt.warnState.set(S(r.identifier), S(r.state));
      return [];
    }
    const first = S(args[0]);
    const lower = first.toLowerCase();
    if (['on', 'off', 'query', 'error'].includes(lower)) {
      const id = args[1] ? S(args[1]) : 'all';
      if (lower === 'query') {
        const st = rt.warnState.has(id) ? rt.warnState.get(id) : rt.warnState.get('all');
        if (nargout > 0) return structOf({ identifier: str(id), state: str(st) });
        rt.out(`The state of warning '${id}' is '${st}'.\n`);
        return [];
      }
      const old = structOf({ identifier: str(id), state: str(rt.warnState.has(id) ? rt.warnState.get(id) : rt.warnState.get('all')) });
      if (id === 'all') { rt.warnState.clear(); rt.warnState.set('all', lower); }
      else if (id === 'backtrace' || id === 'verbose') { /* display options */ }
      else rt.warnState.set(id, lower);
      return nargout > 0 ? old : [];
    }
    const { id, msg } = errorArgs(rt, args);
    if (rt.warnState.get(id) === 'error') { const e = new MError(id, msg); e.fromError = true; e.extra.noFn = true; throw e; }
    rt.warn(id, msg);
    return [];
  },
  lastwarn(args, nargout, ctx) {
    const rt = ctx.interp;
    const old = rt.lastWarning;
    if (args.length) rt.lastWarning = { message: S(args[0]), identifier: args[1] ? S(args[1]) : '' };
    return [str(old.message), str(old.identifier)];
  },
  lasterr(args, nargout, ctx) {
    const rt = ctx.interp;
    const e = rt.lastError;
    if (args.length) rt.lastError = new MError(args[1] ? S(args[1]) : '', S(args[0]));
    return [str(e ? e.message : ''), str(e ? e.identifier : '')];
  },
  rethrow(args, nargout, ctx) {
    const rt = ctx.interp;
    const v = args[0];
    if (isObject(v) && v.cls === 'MException') { const e = rt.errorFromMException(v, true); e.frozen = true; e.fromError = true; e.extra.noFn = true; throw e; }
    if (isStruct(v)) {
      const r = v.data[0];
      const e = new MError(r.identifier ? S(r.identifier) : '', r.message ? S(r.message) : '');
      e.fromError = true; e.extra.noFn = true;
      throw e;
    }
    throw new MError('core:rethrow:badArg', 'rethrow requires an MException object or an error structure.');
  },
  assert(args, nargout, ctx) {
    const rt = ctx.interp;
    if (!args.length) throw new MError('core:minrhs', 'Not enough input arguments.');
    const c = args[0];
    let ok;
    try { ok = isTensor(c) && (c.cls === 'logical' || NUMERIC_CLASSES.includes(c.cls)) ? rt.truth(c) : (() => { throw new MError('core:assertion:LogicalScalar', 'Assertion input must be logical.'); })(); }
    catch (e) { if (e.identifier === 'core:assertion:LogicalScalar') throw e; ok = false; }
    if (ok) return [];
    if (args.length === 1) { const e = new MError('core:assertion:failed', 'Assertion failed.'); e.fromError = true; e.extra.noFn = true; throw e; }
    const { id, msg } = errorArgs(rt, args.slice(1));
    const e = new MError(id || 'core:assertion:failed', msg);
    e.fromError = true; e.extra.noFn = true;
    throw e;
  },

  // ---------------------------------------------------------------- folders and path
  cd(args, nargout, ctx) {
    const rt = ctx.interp;
    const old = normPath(rt.fs.cwd());
    if (!args.length) { if (nargout > 0) return str(old); rt.out(old + '\n'); return []; }
    const target = absPath(rt, S(args[0]));
    try { rt.setCwd(target); } catch { throw new MError('core:cd:folderNotFound', `Cannot CD to ${S(args[0])} (Name is nonexistent or not a folder).`); }
    return nargout > 0 ? str(old) : [];
  },
  pwd(args, nargout, ctx) { return str(normPath(ctx.interp.fs.cwd())); },
  userpath(args, nargout, ctx) {
    const rt = ctx.interp;
    if (args.length) { const p = S(args[0]); if (p !== 'clear' && p !== 'reset') rt.userPath = absPath(rt, p); else rt.userPath = null; return []; }
    const p = rt.userPath || joinPath(normPath(rt.fs.homeDir()), 'Documents/MySimulationMath');
    return str(p);
  },
  path(args, nargout, ctx) {
    const rt = ctx.interp;
    if (args.length) {
      const sep = pathSep(rt);
      const parts = args.map((a) => S(a)).join(sep).split(new RegExp(`[${sep === ';' ? ';' : ':;'}]`)).filter(Boolean).map((p) => absPath(rt, p));
      rt.path = [...new Set(parts)];
      rt.bumpGen();
      return [];
    }
    const text = rt.path.join(pathSep(rt));
    if (nargout > 0) return str(text);
    rt.out('\n\t\tPATH\n\n' + rt.path.map((p) => '\t' + p).join('\n') + '\n\n');
    return [];
  },
  addpath(args, nargout, ctx) {
    const rt = ctx.interp;
    const old = str(rt.path.join(pathSep(rt)));
    let atEnd = false;
    const dirs = [];
    for (const a of args) {
      if (isText(a) && (S(a) === '-end' || S(a) === '-END')) { atEnd = true; continue; }
      if (isText(a) && (S(a) === '-begin' || S(a) === '-BEGIN' || S(a) === '-frozen')) continue;
      if (isTensor(a) && a.cls !== 'char') { atEnd = toNum(a) === 1; continue; }
      for (const p of S(a).split(/[;]|:(?!\/)/)) if (p) dirs.push(absPath(rt, p));
    }
    for (const d of dirs) if (!rt.fs.exists(d)) rt.warn('core:addpath:dirNotFound', `Name is nonexistent or not a directory: ${d}`);
    const ok = dirs.filter((d) => rt.fs.exists(d));
    const rest = rt.path.filter((p) => !ok.includes(p));
    rt.path = atEnd ? [...rest, ...ok] : [...ok, ...rest];
    rt.bumpGen();
    return nargout > 0 ? old : [];
  },
  rmpath(args, nargout, ctx) {
    const rt = ctx.interp;
    const old = str(rt.path.join(pathSep(rt)));
    for (const a of args) for (const p of S(a).split(/[;]|:(?!\/)/)) {
      const d = absPath(rt, p);
      if (!rt.path.includes(d)) rt.warn('core:rmpath:DirNotFound', `"${d}" not found in path.`);
      rt.path = rt.path.filter((x) => x !== d);
    }
    rt.bumpGen();
    return nargout > 0 ? old : [];
  },
  genpath(args, nargout, ctx) {
    const rt = ctx.interp;
    const d = absPath(rt, args.length ? S(args[0]) : rt.fs.cwd());
    return str(genpathOf(rt, d).join(pathSep(rt)));
  },
  what(args, nargout, ctx) {
    const rt = ctx.interp;
    const d = args.length ? absPath(rt, S(args[0])) : normPath(rt.fs.cwd());
    let list = [];
    try { list = rt.fs.list(d); } catch { throw new MError('core:what:notFound', `Folder ${d} not found.`); }
    const m = list.filter((e) => !e.isDir && e.name.endsWith('.m')).map((e) => e.name);
    const mat = list.filter((e) => !e.isDir && e.name.endsWith('.mat')).map((e) => e.name);
    const classes = list.filter((e) => e.isDir && e.name.startsWith('@')).map((e) => e.name.slice(1));
    const pkgs = list.filter((e) => e.isDir && e.name.startsWith('+')).map((e) => e.name.slice(1));
    if (nargout > 0) return structOf({ path: str(d), m: cellOfStr(m), mat: cellOfStr(mat), classes: cellOfStr(classes), packages: cellOfStr(pkgs) });
    if (m.length) { rt.out(`\nM-files in folder ${d}\n`); printList(rt, m.map((x) => x.replace(/\.m$/, ''))); }
    if (mat.length) { rt.out(`\nMAT-files in folder ${d}\n`); printList(rt, mat); }
    if (classes.length) { rt.out(`\nClasses in folder ${d}\n`); printList(rt, classes); }
    if (pkgs.length) { rt.out(`\nPackages in folder ${d}\n`); printList(rt, pkgs); }
    return [];
  },

  // ---------------------------------------------------------------- types and classes
  class(args, nargout, ctx) {
    if (args.length !== 1) throw new MError('core:class:args', 'class requires one argument (old-style class construction is not supported).');
    return str(classNameOf(args[0]));
  },
  isa(args, nargout, ctx) {
    const rt = ctx.interp;
    const v = args[0];
    const names = isCell(args[1]) ? args[1].data.map((x) => S(x)) : isString(args[1]) ? args[1].data : [S(args[1])];
    const test = (name) => {
      if (v.cls === name) return true;
      if (CATEGORY[name]) return isTensor(v) && !v.sparse ? CATEGORY[name](v.cls) : (v.sparse ? name !== 'integer' && name !== 'float' ? CATEGORY[name]('double') : name === 'float' : false);
      if (isObject(v)) { const ci = rt.classOf(v); return !!(ci && ci.isa(name)); }
      return false;
    };
    if (names.length === 1) return bool(test(names[0]));
    return tensor('logical', [1, names.length], names.map((n) => (test(n) ? 1 : 0)));
  },
  isobject(args) { return bool(isObject(args[0]) && args[0].cls !== 'MException' ? true : isObject(args[0])); },
  methods(args, nargout, ctx) {
    const rt = ctx.interp;
    const v = args[0];
    const name = isObject(v) ? v.cls : S(v);
    const ci = rt.findClass(name);
    let names = [];
    if (ci) names = [...ci.allMethodNames()];
    if (ci && ci.js) names = Object.keys(ci.js.def.methods || {});
    names.sort((a, b) => a.localeCompare(b));
    if (nargout > 0) return cellOfStr(names);
    if (!ci) { rt.out(`No methods for class ${name} or no class ${name}.\n`); return []; }
    rt.out(`\nMethods for class ${name}:\n`);
    printList(rt, names);
    return [];
  },
  properties(args, nargout, ctx) {
    const rt = ctx.interp;
    const v = args[0];
    const name = isObject(v) ? v.cls : S(v);
    const ci = rt.findClass(name);
    let names = [];
    if (ci) names = ci.js ? (ci.js.def.props || []).slice() : ci.publicPropNames();
    else if (isStruct(v)) names = v.fields.slice();
    if (nargout > 0) return cellOfStr(names);
    if (!ci) { rt.out(`No properties for class ${name} or no class ${name}.\n`); return []; }
    rt.out(`\nProperties for class ${name}:\n\n` + names.map((n) => '    ' + n).join('\n') + '\n\n');
    return [];
  },
  ismethod(args, nargout, ctx) {
    const rt = ctx.interp;
    const v = args[0];
    const m = S(args[1]);
    const ci = isObject(v) ? rt.classOf(v) : null;
    if (!ci) return bool(false);
    return bool(!!ci.findMethod(m) || (ci.isHandle && ['addlistener', 'delete', 'isvalid', 'notify', 'listener'].includes(m)));
  },
  isprop(args, nargout, ctx) {
    const rt = ctx.interp;
    const v = args[0];
    const p = S(args[1]);
    if (!isObject(v)) return bool(false);
    const ci = rt.classOf(v);
    if (!ci) return bool(false);
    if (ci.js) return bool((ci.js.def.props || []).includes(p) || !!(v.props && p in v.props));
    return bool(!!ci.findProp(p) || (ci.dynamic && p in v.props));
  },
  metaclass(args, nargout, ctx) {
    const rt = ctx.interp;
    const v = args[0];
    if (isObject(v)) { const ci = rt.classOf(v); if (ci) return rt.metaclass(ci); }
    return rt.metaclassOf(isText(v) ? S(v) : v.cls);
  },
  subsref(args, nargout, ctx) {
    const rt = ctx.interp;
    const [v, S0] = args;
    const steps = subsToSteps(S0);
    return rt.applyChainValues(v, steps, Math.max(nargout, 1));
  },
  subsasgn(args, nargout, ctx) {
    const rt = ctx.interp;
    const [v, S0, rhs] = args;
    const steps = subsToSteps(S0);
    return rt.assignChainValues(v, steps, rhs);
  },
  substruct(args) {
    if (args.length % 2) throw new MError('core:substruct:args', 'substruct requires type/subs pairs.');
    const recs = [];
    for (let i = 0; i < args.length; i += 2) { const r = Object.create(null); r.type = args[i]; r.subs = args[i + 1]; recs.push(r); }
    return struct([1, recs.length], ['type', 'subs'], recs);
  },

  // ---------------------------------------------------------------- debugging
  keyboard(args, nargout, ctx) {
    const rt = ctx.interp;
    const f = rt.currentFrame();
    rt.pauseAt(f, f.line, 'keyboard');
    return [];
  },
  dbstop(args, nargout, ctx) {
    const rt = ctx.interp;
    const w = args.map((a) => S(a));
    if (w[0] === 'if' && w[1] === 'error') { rt.dbstopIfError = true; return []; }
    let file = null, lines = [];
    if (w[0] === 'in') { file = w[1]; const at = w.indexOf('at'); if (at >= 0) lines = w[at + 1].split(/[,; ]+/).map(Number); else lines = [1]; }
    else if (w.length >= 2) { file = w[0]; lines = w.slice(1).flatMap((x) => x.split(/[,; ]+/)).map(Number); }
    else if (w.length === 1) { file = w[0]; lines = [1]; }
    if (args.length === 2 && isTensor(args[1]) && args[1].cls !== 'char') lines = Array.from(args[1].re);
    const path = fileFor(rt, file);
    if (!path) throw new MError('core:dbstop:fileNotFound', `File "${file}" not found.`);
    const cur = rt.breakpoints.get(path);
    rt.setBreakpoints(path, [...new Set([...(cur || []), ...lines.filter((x) => Number.isFinite(x))])]);
    rt.onEvent({ type: 'breakpoints', file: path, lines: [...rt.breakpoints.get(path)] });
    return [];
  },
  dbclear(args, nargout, ctx) {
    const rt = ctx.interp;
    const w = args.map((a) => S(a));
    if (!w.length || w[0] === 'all') { for (const f of [...rt.breakpoints.keys()]) { rt.setBreakpoints(f, []); rt.onEvent({ type: 'breakpoints', file: f, lines: [] }); } rt.dbstopIfError = false; return []; }
    if (w[0] === 'if') { rt.dbstopIfError = false; return []; }
    const file = w[0] === 'in' ? w[1] : w[0];
    const path = fileFor(rt, file);
    if (!path) return [];
    const at = w.indexOf('at');
    if (at >= 0) { const del = new Set(w[at + 1].split(/[,; ]+/).map(Number)); const cur = [...(rt.breakpoints.get(path) || [])].filter((l) => !del.has(l)); rt.setBreakpoints(path, cur); }
    else rt.setBreakpoints(path, []);
    rt.onEvent({ type: 'breakpoints', file: path, lines: [...(rt.breakpoints.get(path) || [])] });
    return [];
  },
  dbstatus(args, nargout, ctx) {
    const rt = ctx.interp;
    const list = [...rt.breakpoints].map(([file, lines]) => ({ file, lines: [...lines].sort((a, b) => a - b) }));
    if (nargout > 0) return struct([list.length, 1], ['file', 'line'], list.map((b) => { const r = Object.create(null); r.file = str(b.file); r.line = tensor('double', [1, b.lines.length], b.lines); return r; }));
    for (const b of list) rt.out(`Breakpoints for ${b.file} are on line${b.lines.length > 1 ? 's' : ''} ${b.lines.join(', ')}.\n`);
    if (rt.dbstopIfError) rt.out('Stop if error.\n');
    return [];
  },
  dbcont() { throw new MError('core:dbcont:notDebugging', 'dbcont is only available while debugging.'); },
  dbstep() { throw new MError('core:dbstep:notDebugging', 'dbstep is only available while debugging.'); },
  dbquit() { throw new MError('core:dbquit:notDebugging', 'dbquit is only available while debugging.'); },
  dbstack(args, nargout, ctx) {
    const rt = ctx.interp;
    const st = stackStruct(rt, 0);
    if (nargout > 0) return [st, num(1)];
    for (const s of rt.stackInfo()) rt.out(`> In ${s.name} (line ${s.line})\n`);
    return [];
  },

  // ---------------------------------------------------------------- interaction
  input(args, nargout, ctx) {
    const rt = ctx.interp;
    const prompt = args.length ? S(args[0]) : '';
    const asText = args.length > 1 && S(args[1]) === 's';
    const reply = rt.host.request({ type: 'input', prompt, text: asText });
    if (reply == null) throw new MError('core:input:unavailable', 'Input is not available (no interactive Command Window).');
    const text = typeof reply === 'string' ? reply : String(reply.text ?? reply.value ?? '');
    rt.print(prompt + text + '\n', 'echo');
    if (asText) return str(text);
    if (!text.trim()) return tensor('double', [0, 0]);
    const vals = rt.evalIn(rt.currentFrame(), text, true, 1);
    return vals.length ? vals[0] : tensor('double', [0, 0]);
  },
  pause(args, nargout, ctx) {
    const rt = ctx.interp;
    if (args.length && isText(args[0])) {
      const w = S(args[0]).toLowerCase();
      const old = rt.pauseState || 'on';
      if (w === 'on' || w === 'off') rt.pauseState = w;
      return nargout > 0 || w === 'query' ? str(old) : [];
    }
    if (rt.pauseState === 'off') return [];
    const secs = args.length ? toNum(args[0]) : Infinity;
    if (secs <= 0) return [];
    const reply = rt.host.request({ type: 'pause', seconds: Number.isFinite(secs) ? secs : null });
    if (reply == null && Number.isFinite(secs)) {
      const end = Date.now() + Math.min(secs, 3600) * 1000;
      while (Date.now() < end) { if (rt.intFlag !== null && rt.intFlag[0] !== 0) rt.interrupted(); }
    }
    return [];
  },
  beep(args, nargout, ctx) { ctx.interp.host.post({ type: 'beep' }); return []; },
  more() { return []; },
  echo() { return []; },
  format(args, nargout, ctx) {
    const rt = ctx.interp;
    const f = rt.format;
    if (nargout > 0 && !args.length) return structOf({ NumericFormat: str(f.numeric), LineSpacing: str(f.spacing) });
    const words = args.map((a) => S(a));
    if (!words.length) { f.numeric = 'short'; f.spacing = 'loose'; return []; }
    const NUM = { short: 'short', long: 'long', shorte: 'shortE', longe: 'longE', shortg: 'shortG', longg: 'longG', shorteng: 'shortEng', longeng: 'longEng', rat: 'rat', hex: 'hex', bank: 'bank', '+': '+' };
    for (let i = 0; i < words.length; i++) {
      let w = words[i].toLowerCase();
      if ((w === 'short' || w === 'long') && words[i + 1] && /^(e|g|eng)$/i.test(words[i + 1])) { w += words[i + 1].toLowerCase(); i++; }
      if (w === 'compact' || w === 'loose') f.spacing = w;
      else if (NUM[w]) f.numeric = NUM[w];
      else if (w === 'default') { f.numeric = 'short'; f.spacing = 'loose'; }
      else throw new MError('core:format:unknown', `Unknown format option "${words[i]}".`);
    }
    return [];
  },
  clc(args, nargout, ctx) { ctx.interp.onEvent({ type: 'clc' }); return []; },
  home(args, nargout, ctx) { ctx.interp.onEvent({ type: 'clc' }); return []; },
  commandwindow(args, nargout, ctx) { ctx.interp.host.post({ type: 'focus', target: 'commandWindow' }); return []; },
  diary(args, nargout, ctx) {
    const rt = ctx.interp;
    if (!args.length) { rt.diary = rt.diary ? null : (rt.diaryFile || absPath(rt, 'diary')); return []; }
    const w = S(args[0]);
    if (w === 'off') { rt.diary = null; return []; }
    if (w === 'on') { rt.diary = rt.diaryFile || absPath(rt, 'diary'); return []; }
    rt.diaryFile = absPath(rt, w);
    rt.diary = rt.diaryFile;
    return [];
  },
  edit(args, nargout, ctx) {
    const rt = ctx.interp;
    if (!args.length) { rt.onEvent({ type: 'openFile', path: null, line: 1 }); return []; }
    for (const a of args) {
      const name = S(a);
      let p = fileFor(rt, name);
      if (!p) {
        p = absPath(rt, name.endsWith('.m') || name.includes('.') ? name : name + '.m');
        try { if (!rt.fs.exists(p)) rt.fs.writeText(p, ''); } catch { /* read-only */ }
      }
      rt.onEvent({ type: 'openFile', path: p, line: 1 });
    }
    return [];
  },
  open(args, nargout, ctx) {
    const rt = ctx.interp;
    const name = textArg(args[0], 'open');
    const p = fileFor(rt, name) || absPath(rt, name);
    if (!rt.fs.exists(p)) throw new MError('core:open:fileNotFound', `File "${name}" not found.`);
    rt.onEvent({ type: 'openFile', path: p, line: 1 });
    return [];
  },
  help(args, nargout, ctx) {
    const rt = ctx.interp;
    if (!args.length) {
      const text = 'Type "help name" for help on a function, or "doc name" to open the help browser.';
      if (nargout > 0) return str(text);
      rt.out(text + '\n');
      return [];
    }
    const name = S(args[0]);
    const h = helpFor(rt, name);
    const text = h ? `${name}  ${h.text}` : `${name} not found.\n\nUse the Help browser search field to search the documentation, or\ntype "help help" for help command options, such as help for methods.`;
    if (nargout > 0) return str(h ? h.text : '');
    rt.out(text.replace(/\n?$/, '\n'));
    return [];
  },
  doc(args, nargout, ctx) {
    const rt = ctx.interp;
    rt.onEvent({ type: 'doc', name: args.length ? S(args[0]) : null });
    if (args.length) { const h = helpFor(rt, S(args[0])); if (h) rt.out(`${S(args[0])}  ${h.text}\n`); }
    return [];
  },
  lookfor(args, nargout, ctx) {
    const rt = ctx.interp;
    const key = textArg(args[0], 'lookfor').toLowerCase();
    const hits = [];
    for (const [name, h] of Object.entries(rt.help)) {
      const t = `${name} ${h.en || ''} ${h.ko || ''}`.toLowerCase();
      if (t.includes(key)) hits.push([name, (h.en || '').split('\n')[0]]);
    }
    hits.sort((a, b) => a[0].localeCompare(b[0]));
    if (nargout > 0) return cellOfStr(hits.map((h) => h[0]));
    const w = Math.max(0, ...hits.map((h) => h[0].length));
    rt.out(hits.map(([n, d]) => `${n.padEnd(w)} - ${d}`).join('\n') + (hits.length ? '\n' : ''));
    return [];
  },
  profile(args, nargout, ctx) {
    const rt = ctx.interp;
    const w = args.length ? S(args[0]).toLowerCase() : 'info';
    if (!rt.profiler) rt.profiler = { on: false, data: new Map(), start: 0 };
    const p = rt.profiler;
    if (w === 'on' || w === 'resume') { p.on = true; if (w === 'on') p.data.clear(); p.start = Date.now(); return []; }
    if (w === 'off') { p.on = false; return []; }
    if (w === 'clear') { p.data.clear(); return []; }
    if (w === 'viewer' || w === 'report') { rt.onEvent({ type: 'profile', data: [...p.data].map(([name, d]) => ({ name, ...d })) }); p.on = false; return []; }
    const rows = [...p.data].map(([name, d]) => { const r = Object.create(null); r.FunctionName = str(name); r.NumCalls = num(d.calls); r.TotalTime = num(d.time / 1000); return r; });
    const info = structOf({ FunctionTable: struct([rows.length, 1], ['FunctionName', 'NumCalls', 'TotalTime'], rows) });
    if (nargout > 0 || w === 'info') return info;
    return [];
  },
  inmem(args, nargout, ctx) {
    const rt = ctx.interp;
    const names = [...rt.fileCache.values()].map((c) => c.info.name).sort();
    if (nargout > 0) return cellOfStr(names);
    printList(rt, names);
    return [];
  },
};

function funcInfoOf(rt, v) {
  if (isFuncHandle(v)) {
    if (v.anon) return { params: v.params, outs: ['varargout'] };
    if (v.fi) return v.fi;
    v = str(v.name);
  }
  const name = S(v).replace(/\.m$/, '');
  const t = rt.resolve(name);
  if (t && t.kind === 'user') return t.fi;
  if (t && t.kind === 'builtin') return { params: ['varargin'], outs: ['varargout'] };
  throw new MError('core:nargin:notFound', `Function '${name}' not found.`);
}

function subsToSteps(S0) {
  if (!isStruct(S0)) throw new MError('core:subsref:badS', 'The subscript argument must be a struct with fields type and subs.');
  return S0.data.map((r) => {
    const type = toStr(r.type);
    if (type === '.') return { k: '.', name: toStr(r.subs) };
    const subs = isCell(r.subs) ? r.subs.data : [r.subs];
    return { k: type, args: subs.map((x) => ({ cs: () => [isText(x) && toStr(x) === ':' ? COLON_VALUE : x] })), end: false, values: subs };
  });
}
const COLON_VALUE = str(':');

// ---------------------------------------------------------------- fallbacks (used only when no library provides them)
export const fallbacks = {};
for (const name of ['plus', 'minus', 'times', 'mtimes', 'rdivide', 'ldivide', 'mrdivide', 'mldivide', 'power', 'mpower', 'eq', 'ne', 'lt', 'le', 'gt', 'ge', 'and', 'or', 'not', 'uminus', 'uplus', 'transpose', 'ctranspose', 'colon']) {
  fallbacks[name] = (args, nargout, ctx) => fallbackOp(name, args, (id, m) => ctx.warning(id, m));
}
fallbacks.horzcat = (args, nargout, ctx) => ctx.interp.concat([args]);
fallbacks.vertcat = (args, nargout, ctx) => ctx.interp.concat(args.map((a) => [a]));
fallbacks.display = (args, nargout, ctx) => {
  const rt = ctx.interp;
  const name = args.length > 1 ? S(args[1]) : 'ans';
  rt.out(formatDisplay(name, args[0], rt.format, (o) => rt.objectDisplayText(o)));
  return [];
};
fallbacks.disp = (args, nargout, ctx) => { const rt = ctx.interp; rt.out(rt.dispText(args[0])); return []; };
fallbacks.deal = (args, nargout) => {
  const n = Math.max(nargout, 1);
  if (args.length === 1) return Array.from({ length: n }, () => args[0]);
  if (args.length !== n) throw new MError('core:deal:nargin', 'The number of outputs should match the number of inputs.');
  return args.slice();
};

export const help = {
  eval: { en: 'Execute M code given as text.', ko: '텍스트로 주어진 M 코드를 실행합니다.', syntax: ['eval(expression)', 'eval(expression, catchExpression)', '[a, b] = eval(expression)'] },
  evalin: { en: 'Execute code in the base or caller workspace.', ko: 'base 또는 caller 작업 공간에서 코드를 실행합니다.', syntax: ["evalin('base', expression)", "evalin('caller', expression)"] },
  assignin: { en: 'Assign a value to a variable in another workspace.', ko: '다른 작업 공간의 변수에 값을 지정합니다.', syntax: ["assignin('base', name, value)"] },
  feval: { en: 'Evaluate a function by name or handle.', ko: '이름이나 핸들로 함수를 실행합니다.', syntax: ['[y1, ..., yN] = feval(fun, x1, ..., xM)'] },
  builtin: { en: 'Call the built-in function, bypassing overloaded methods.', ko: '오버로드된 메서드를 거치지 않고 내장 함수를 호출합니다.', syntax: ['builtin(name, x1, ..., xN)'] },
  exist: { en: 'Check whether a variable, function, file or folder exists (1 variable, 2 file, 5 built-in, 7 folder, 8 class).', ko: '변수·함수·파일·폴더가 있는지 확인합니다.', syntax: ['exist name', "exist(name, 'var')"] },
  which: { en: 'Locate functions and files.', ko: '함수와 파일의 위치를 찾습니다.', syntax: ['which name', 'p = which(name)'] },
  clear: { en: 'Remove items from the workspace.', ko: '작업 공간에서 항목을 지웁니다.', syntax: ['clear', 'clear name1 ... nameN', 'clear all', 'clear functions', 'clear global'] },
  clearvars: { en: 'Clear variables, optionally keeping some.', ko: '변수를 지웁니다 (일부 제외 가능).', syntax: ['clearvars', 'clearvars -except a b'] },
  who: { en: 'List variables in the workspace.', ko: '작업 공간의 변수 목록.', syntax: ['who', 'c = who'] },
  whos: { en: 'List variables with their sizes and classes.', ko: '변수의 크기와 클래스를 나열합니다.', syntax: ['whos', 's = whos'] },
  isvarname: { en: 'True for a valid variable name.', ko: '올바른 변수 이름이면 true.', syntax: ['tf = isvarname(s)'] },
  inputname: { en: 'Variable name of a function input.', ko: '함수 입력의 변수 이름.', syntax: ['s = inputname(argNumber)'] },
  narginchk: { en: 'Validate the number of input arguments.', ko: '입력 인수 개수를 검사합니다.', syntax: ['narginchk(minArgs, maxArgs)'] },
  nargoutchk: { en: 'Validate the number of output arguments.', ko: '출력 인수 개수를 검사합니다.', syntax: ['nargoutchk(minArgs, maxArgs)'] },
  nargin: { en: 'Number of function input arguments.', ko: '함수 입력 인수 개수.', syntax: ['n = nargin', 'n = nargin(fun)'] },
  nargout: { en: 'Number of function output arguments.', ko: '함수 출력 인수 개수.', syntax: ['n = nargout', 'n = nargout(fun)'] },
  mfilename: { en: 'Name of the file of the running code.', ko: '실행 중인 코드의 파일 이름.', syntax: ['p = mfilename', "p = mfilename('fullpath')"] },
  func2str: { en: 'Text of a function handle.', ko: '함수 핸들의 텍스트.', syntax: ['s = func2str(fh)'] },
  str2func: { en: 'Function handle from text.', ko: '텍스트에서 함수 핸들을 만듭니다.', syntax: ["fh = str2func('sin')", "fh = str2func('@(x) x.^2')"] },
  functions: { en: 'Information about a function handle.', ko: '함수 핸들 정보.', syntax: ['s = functions(fh)'] },
  error: { en: 'Throw an error.', ko: '오류를 발생시킵니다.', syntax: ['error(msg)', 'error(id, fmt, a1, ..., aN)', 'error(errorStruct)'] },
  warning: { en: 'Display a warning, or control warning states.', ko: '경고를 표시하거나 경고 상태를 제어합니다.', syntax: ['warning(msg)', 'warning(id, fmt, ...)', "warning('off', id)", "warning('on', id)", "s = warning('query', id)"] },
  lastwarn: { en: 'Last warning message.', ko: '마지막 경고 메시지.', syntax: ['[msg, id] = lastwarn'] },
  lasterr: { en: 'Last error message.', ko: '마지막 오류 메시지.', syntax: ['[msg, id] = lasterr'] },
  rethrow: { en: 'Rethrow an error, keeping its stack.', ko: '오류를 스택을 유지한 채 다시 발생시킵니다.', syntax: ['rethrow(ME)'] },
  assert: { en: 'Throw an error when a condition is false.', ko: '조건이 거짓이면 오류를 발생시킵니다.', syntax: ['assert(cond)', 'assert(cond, msg)', 'assert(cond, id, fmt, ...)'] },
  MException: { en: 'Error object with identifier, message, stack and causes.', ko: '식별자·메시지·스택·원인을 가진 오류 객체.', syntax: ['ME = MException(id, fmt, a1, ..., aN)', 'throw(ME)', 'rethrow(ME)', 'getReport(ME)', 'ME = addCause(ME, causeME)'] },
  onCleanup: { en: 'Run a task when the variable is cleared or the function exits.', ko: '변수가 지워지거나 함수가 끝날 때 작업을 실행합니다.', syntax: ['c = onCleanup(@() task)'] },
  run: { en: 'Run a script file.', ko: '스크립트 파일을 실행합니다.', syntax: ['run(scriptname)'] },
  cd: { en: 'Change the current folder.', ko: '현재 폴더를 바꿉니다.', syntax: ['cd newFolder', 'old = cd(newFolder)', 'cd'] },
  pwd: { en: 'Current folder.', ko: '현재 폴더.', syntax: ['p = pwd'] },
  path: { en: 'View or set the search path.', ko: '검색 경로를 보거나 설정합니다.', syntax: ['path', 'p = path', 'path(newpath)'] },
  addpath: { en: 'Add folders to the search path.', ko: '검색 경로에 폴더를 추가합니다.', syntax: ['addpath(folder1, ..., folderN)', "addpath(folder, '-end')"] },
  rmpath: { en: 'Remove folders from the search path.', ko: '검색 경로에서 폴더를 제거합니다.', syntax: ['rmpath(folder)'] },
  genpath: { en: 'Folder and all subfolders as a path text.', ko: '폴더와 모든 하위 폴더를 경로 텍스트로.', syntax: ['p = genpath(folder)'] },
  userpath: { en: 'User folder for files on the search path.', ko: '검색 경로의 사용자 폴더.', syntax: ['p = userpath'] },
  what: { en: 'List program files in a folder.', ko: '폴더의 프로그램 파일 목록.', syntax: ['what', 'what folder', 's = what(folder)'] },
  class: { en: 'Class of a value.', ko: '값의 클래스.', syntax: ['c = class(obj)'] },
  isa: { en: 'True if a value is of the given class (or category numeric, float, integer).', ko: '값이 주어진 클래스이면 true.', syntax: ['tf = isa(obj, className)'] },
  isobject: { en: 'True for objects of classes.', ko: '클래스 객체이면 true.', syntax: ['tf = isobject(A)'] },
  methods: { en: 'Method names of a class.', ko: '클래스의 메서드 이름.', syntax: ['methods(className)', 'm = methods(obj)'] },
  properties: { en: 'Property names of a class.', ko: '클래스의 속성 이름.', syntax: ['properties(className)', 'p = properties(obj)'] },
  ismethod: { en: 'True if the object has the method.', ko: '객체에 메서드가 있으면 true.', syntax: ['tf = ismethod(obj, name)'] },
  isprop: { en: 'True if the object has the property.', ko: '객체에 속성이 있으면 true.', syntax: ['tf = isprop(obj, name)'] },
  metaclass: { en: 'Class description object.', ko: '클래스 설명 객체.', syntax: ['mc = metaclass(obj)', 'mc = ?ClassName'] },
  subsref: { en: 'Indexed reference with a subscript structure.', ko: '첨자 구조체로 인덱싱 참조.', syntax: ['B = subsref(A, S)'] },
  subsasgn: { en: 'Indexed assignment with a subscript structure.', ko: '첨자 구조체로 인덱싱 대입.', syntax: ['A = subsasgn(A, S, B)'] },
  substruct: { en: 'Create a subscript structure.', ko: '첨자 구조체를 만듭니다.', syntax: ["S = substruct('()', {1, 2}, '.', 'f')"] },
  keyboard: { en: 'Pause and give control to the debugger.', ko: '실행을 멈추고 디버거로 제어를 넘깁니다.', syntax: ['keyboard'] },
  dbstop: { en: 'Set a breakpoint.', ko: '중단점을 설정합니다.', syntax: ['dbstop in file at line', 'dbstop if error'] },
  dbclear: { en: 'Remove breakpoints.', ko: '중단점을 제거합니다.', syntax: ['dbclear all', 'dbclear in file', 'dbclear in file at line'] },
  dbstatus: { en: 'List breakpoints.', ko: '중단점 목록.', syntax: ['dbstatus', 's = dbstatus'] },
  dbcont: { en: 'Resume execution (debug mode).', ko: '실행을 계속합니다 (디버그 모드).', syntax: ['dbcont'] },
  dbstep: { en: 'Execute the next line (debug mode).', ko: '다음 줄을 실행합니다 (디버그 모드).', syntax: ['dbstep', 'dbstep in', 'dbstep out'] },
  dbquit: { en: 'Quit debug mode.', ko: '디버그 모드를 끝냅니다.', syntax: ['dbquit'] },
  dbstack: { en: 'Function call stack.', ko: '함수 호출 스택.', syntax: ['dbstack', 'ST = dbstack'] },
  input: { en: 'Request user input.', ko: '사용자 입력을 요청합니다.', syntax: ['x = input(prompt)', "txt = input(prompt, 's')"] },
  pause: { en: 'Stop execution temporarily.', ko: '실행을 잠시 멈춥니다.', syntax: ['pause(n)', 'pause', "pause('off')"] },
  beep: { en: 'Produce an alert sound.', ko: '경고음을 냅니다.', syntax: ['beep'] },
  more: { en: 'Control paged output (no effect here).', ko: '페이지 출력 제어 (효과 없음).', syntax: ['more on', 'more off'] },
  echo: { en: 'Display statements during execution (no effect here).', ko: '실행 중 문장 표시 (효과 없음).', syntax: ['echo on'] },
  format: { en: 'Set the output display format.', ko: '출력 표시 형식을 설정합니다.', syntax: ['format', 'format long', 'format short g', 'format compact', 'format loose'] },
  clc: { en: 'Clear the Command Window.', ko: '명령 창을 지웁니다.', syntax: ['clc'] },
  home: { en: 'Move the cursor to the top of the Command Window.', ko: '명령 창의 맨 위로 이동합니다.', syntax: ['home'] },
  commandwindow: { en: 'Bring the Command Window to the front.', ko: '명령 창을 앞으로 가져옵니다.', syntax: ['commandwindow'] },
  diary: { en: 'Log Command Window text to a file.', ko: '명령 창 텍스트를 파일에 기록합니다.', syntax: ['diary filename', 'diary on', 'diary off'] },
  edit: { en: 'Open a file in the editor.', ko: '편집기에서 파일을 엽니다.', syntax: ['edit', 'edit file'] },
  open: { en: 'Open a file in the appropriate tool.', ko: '적절한 도구로 파일을 엽니다.', syntax: ['open name'] },
  help: { en: 'Help for functions in the Command Window.', ko: '명령 창에서 함수 도움말.', syntax: ['help name'] },
  doc: { en: 'Open the help browser.', ko: '도움말 브라우저를 엽니다.', syntax: ['doc', 'doc name'] },
  lookfor: { en: 'Search help texts for a keyword.', ko: '도움말에서 키워드를 찾습니다.', syntax: ['lookfor keyword'] },
  profile: { en: 'Profile execution time of functions.', ko: '함수 실행 시간을 측정합니다.', syntax: ['profile on', 'profile off', 'p = profile(\'info\')', 'profile viewer'] },
  inmem: { en: 'Names of functions loaded in memory.', ko: '메모리에 로드된 함수 이름.', syntax: ['M = inmem'] },
};
