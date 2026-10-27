// Session implementation (CONTRACT.md §7) over a given builtin registry.
// core/session.js builds the full library registry and calls this; tests may
// pass a small registry to exercise the language on its own.
import { MError, isStruct, isObject, empty } from '../value.js';
import { Interp, Frame, normPath, baseName, joinPath } from './interp.js';
import { Compiler } from './compile.js';
import { builtins as langBuiltins, help as langHelp, fallbacks, helpFor } from './builtins.js';
import { langClasses } from '../classes.js';
import { KEYWORDS } from './lexer.js';
import { disown } from './indexing.js';
import { createMemoryFs } from '../fs-memory.js';

const EMPTY_REGISTRY = { builtins: {}, help: {}, classes: {}, installs: [], owner: {} };

export function createSessionWith(registry, opts = {}) {
  const reg = registry || EMPTY_REGISTRY;
  const fs = opts.fs || createMemoryFs();
  const host = opts.host || { post() {}, request() { return null; } };
  const print = opts.print || (() => {});
  const onEvent = opts.onEvent || (() => {});
  const rt = new Interp({
    registry: reg, fs, host, print, onEvent,
    langBuiltins, langHelp, fallbacks, langClasses,
  });

  function failure(e) {
    const me = rt.toMError(e);
    rt.stack.length = 0;
    rt.endStack.length = 0;
    rt.accessorStack.length = 0;
    rt.stepMode = null;
    rt.updateDbg();
    rt.lastError = me;
    rt.print(rt.errorReport(me) + '\n', 'err');
    return { ok: false, error: { identifier: me.identifier, message: me.message, stack: (me.mstack || []).map((s) => ({ ...s })) } };
  }

  function guarded(fn, opts2 = {}) {
    rt.bumpGen();
    onEvent({ type: 'busy', busy: true });
    rt.stack.length = 0;
    rt.endStack.length = 0;
    try {
      fn();
      return { ok: true };
    } catch (e) {
      return failure(e);
    } finally {
      onEvent({ type: 'busy', busy: false });
      if (!opts2.quiet) onEvent({ type: 'workspace' });
    }
  }

  const session = {
    interp: rt,
    ctx: rt.ctx,
    get format() { return rt.format; },

    evaluate(code, eopts = {}) {
      code = String(code);
      if (eopts.echo) rt.print(`>> ${code}\n`, 'echo');
      if (!eopts.file && code.trim()) onEvent({ type: 'history', command: code });
      return guarded(() => {
        const ast = rt.parseCode(code, { isVar: (n) => rt.readWs(rt.base, n) !== undefined, file: eopts.file || null, cache: false });
        const frame = new Frame(rt.base, null, eopts.file ? normPath(eopts.file) : null, eopts.file ? baseName(normPath(eopts.file)).replace(/\.m$/, '') : 'base', 'base');
        const pseudo = rt.codeInfo(ast, frame);
        frame.fi = pseudo;
        const run = new Compiler(rt, { fi: pseudo, depth: null }).block(ast.body);
        rt.stack.push(frame);
        try {
          run(frame);
        } catch (e) {
          if (eopts.file) throw rt.annotate(e, frame);
          throw e;
        } finally { rt.stack.pop(); }
      });
    },

    runFile(path) {
      const p = normPath(path);
      return guarded(() => {
        const info = rt.loadFile(p);
        if (info.script) rt.runScript(info.script, rt.baseFrame, 0);
        else if (info.main) rt.callUser(info.main, [], 0, { caller: rt.baseFrame });
        else throw new MError('core:run:classdef', `"${p}" defines a class and cannot be run.`);
      });
    },

    listVariables() { return rt.listVariables(rt.base); },
    getVariable(name) { const v = rt.readWs(rt.base, name); return v === undefined ? null : disown(v); },
    setVariable(name, value) {
      if (!/^[A-Za-z]\w*$/.test(name) || KEYWORDS.has(name)) throw new MError('core:setVariable:invalidName', `Invalid variable name "${name}".`);
      rt.writeWs(rt.base, name, value);
      onEvent({ type: 'workspace' });
    },
    clear(names) {
      const ws = rt.base;
      const list = names && names.length ? names : Object.keys(ws.vars);
      for (const n of list) {
        const v = ws.vars[n];
        if (v && v.cls === 'onCleanup' && v.isObject) rt.fireCleanup(v);
        delete ws.vars[n];
        if (ws.gl) delete ws.gl[n];
      }
      onEvent({ type: 'workspace' });
    },

    complete(text, cursor) {
      return complete(rt, String(text), cursor == null ? String(text).length : cursor);
    },
    help(name) { return helpFor(rt, String(name)); },

    handleMessage(msg) {
      if (!msg || typeof msg.type !== 'string') return undefined;
      let result;
      for (const [prefix, fn] of rt.messageHandlers) {
        if (!msg.type.startsWith(prefix)) continue;
        try {
          const r = fn(msg);
          if (r !== undefined && result === undefined) result = r;
        } catch (e) {
          failure(e);
        }
      }
      return result;
    },
    setInterruptFlag(int32Array) { rt.intFlag = int32Array || null; },
    setBreakpoints(file, lines) { rt.setBreakpoints(file, lines || []); },
    cwd() { return normPath(fs.cwd()); },
  };
  rt.ctx.session = session;
  for (const install of reg.installs || []) install(rt.ctx);
  return session;
}

// ------------------------------------------------------------------ completion
function complete(rt, text, cursor) {
  const before = text.slice(0, cursor);
  const line = before.slice(before.lastIndexOf('\n') + 1);
  // inside a quoted text: complete file names
  const quotes = (line.match(/'/g) || []).length;
  if (quotes % 2 === 1) {
    const part = line.slice(line.lastIndexOf("'") + 1);
    return completeFiles(rt, part);
  }
  const m = /([A-Za-z_][\w]*(?:\.[A-Za-z_]?\w*)*)$/.exec(line);
  if (!m) return [];
  const token = m[1];
  const out = [];
  const seen = new Set();
  const add = (label, kind) => { if (!seen.has(label)) { seen.add(label); out.push({ label, kind }); } };
  if (token.includes('.')) {
    const parts = token.split('.');
    const prefix = parts.pop();
    let v = rt.readWs(rt.base, parts[0]);
    if (v !== undefined) {
      for (const p of parts.slice(1)) {
        if (v && isStruct(v) && v.data.length >= 1 && v.fields.includes(p)) v = v.data[0][p];
        else if (v && isObject(v) && v.props && p in v.props) v = v.props[p];
        else { v = undefined; break; }
      }
      if (v && isStruct(v)) for (const f of v.fields) { if (f.startsWith(prefix)) add(f, 'field'); }
      else if (v && isObject(v)) {
        const ci = rt.classOf(v);
        const props = ci ? (ci.js ? ci.js.def.props || Object.keys(v.props || {}) : ci.publicPropNames()) : Object.keys(v.props || {});
        for (const p of props) if (p.startsWith(prefix)) add(p, 'field');
        if (ci) for (const mm of ci.js ? Object.keys(ci.js.def.methods || {}) : ci.allMethodNames()) if (mm.startsWith(prefix)) add(mm, 'method');
      }
      return out;
    }
    // package members and class statics
    const pkg = parts.join('.');
    for (const d of rt.searchDirs()) {
      const dir = joinPath(d, parts.map((p) => '+' + p).join('/'));
      for (const [name, e] of rt.listing(dir)) {
        if (!e.isDir && name.endsWith('.m') && name.startsWith(prefix)) add(name.slice(0, -2), 'function');
        if (e.isDir && name.startsWith('+') && name.slice(1).startsWith(prefix)) add(name.slice(1), 'package');
      }
    }
    for (const name of Object.keys(rt.jsClasses)) if (name.startsWith(pkg + '.') && name.slice(pkg.length + 1).startsWith(prefix)) add(name.slice(pkg.length + 1), 'class');
    try {
      const ci = rt.findClass(pkg);
      if (ci && !ci.js) {
        for (const [n, mm] of ci.methods) if (mm.static && n.startsWith(prefix)) add(n, 'method');
        for (const [n, p] of ci.props) if (p.constant && n.startsWith(prefix)) add(n, 'field');
        for (const e of ci.enumDefs) if (e.name.startsWith(prefix)) add(e.name, 'field');
      }
    } catch { /* ignore */ }
    return out;
  }
  const vars = Object.keys(rt.base.vars).filter((n) => n.startsWith(token)).sort();
  for (const n of vars) add(n, 'variable');
  for (const k of [...KEYWORDS].sort()) if (k.startsWith(token)) add(k, 'keyword');
  for (const d of rt.searchDirs()) {
    for (const [name, e] of rt.listing(d)) {
      if (!e.isDir && name.endsWith('.m') && name.startsWith(token)) add(name.slice(0, -2), 'file');
      if (e.isDir && name.startsWith('@') && name.slice(1).startsWith(token)) add(name.slice(1), 'class');
      if (e.isDir && name.startsWith('+') && name.slice(1).startsWith(token)) add(name.slice(1), 'package');
    }
  }
  const fns = Object.keys(rt.builtins).filter((n) => n.startsWith(token)).sort();
  for (const n of fns) add(n, 'function');
  for (const n of Object.keys(rt.jsClasses).sort()) if (n.startsWith(token)) add(n, 'class');
  return out.slice(0, 500);
}

function completeFiles(rt, part) {
  const p = part.replace(/\\/g, '/');
  const slash = p.lastIndexOf('/');
  const dirPart = slash >= 0 ? p.slice(0, slash + 1) : '';
  const prefix = slash >= 0 ? p.slice(slash + 1) : p;
  let dir;
  try {
    const cwd = normPath(rt.fs.cwd());
    dir = dirPart ? (dirPart.startsWith('/') || /^[A-Za-z]:/.test(dirPart) ? dirPart : joinPath(cwd, dirPart)) : cwd;
  } catch { return []; }
  let list = [];
  try { list = rt.fs.list(dir.replace(/\/$/, '') || '/'); } catch { return []; }
  return list.filter((e) => e.name.startsWith(prefix)).map((e) => ({ label: dirPart + e.name + (e.isDir ? '/' : ''), kind: e.isDir ? 'folder' : 'file' }));
}

export { empty };
