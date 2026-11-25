// Runs an OpenSCAD syntax tree (parser.js): scopes (variables, functions and modules each in their own name
// space), special $ variables looked up through the callers, module instances with children(), list
// comprehensions, tail calls without stack growth, every built-in function of OpenSCAD 2021.01 and the
// built-in modules (handed to geometry.js through `geo`). The output is a tree of geometry made by `geo`.
import { parse, scadError } from './parser.js';
import {
  Range, FunctionValue, ObjectValue, isObj, isNum, isVec, isStr, isBool, isRange, isFn, typeName, truthy, toStr, repr, numStr,
  sinDeg, cosDeg, tanDeg, asinDeg, acosDeg, atanDeg, atan2Deg, roundHalfAway, equal, negate, add, sub, mul, div, mod, pow, compare, index,
} from './values.js';

const MAX_DEPTH = 3000;
const MAX_LIST = 5e6;

/** A scope: its own variables, functions and modules; `parent` = the lexical outer scope; `caller` = where a
 *  module or function was called from ($ variables are looked up through the callers). */
export class Scope {
  constructor(parent = null, caller = null) {
    this.parent = parent; this.caller = caller;
    this.vars = new Map(); this.funcs = new Map(); this.mods = new Map();
    this.children = parent?.children ?? null; // the children of the module instance this scope runs in
    this.file = parent?.file ?? null;
  }
  lookupVar(name) {
    if (name[0] === '$' && name !== '$children') {
      // Dynamic: this scope, then lexically enclosing scopes up to a module or function body, then its caller.
      for (let s = this; s; s = s.caller ?? s.parent) { if (s.vars.has(name)) return { found: true, value: s.vars.get(name) }; }
      return { found: false };
    }
    for (let s = this; s; s = s.parent) if (s.vars.has(name)) return { found: true, value: s.vars.get(name) };
    return { found: false };
  }
  lookupFunc(name) { for (let s = this; s; s = s.parent) if (s.funcs.has(name)) return s.funcs.get(name); return null; }
  lookupMod(name) { for (let s = this; s; s = s.parent) if (s.mods.has(name)) return s.mods.get(name); return null; }
}

/** Mersenne Twister (std::mt19937) — rands() gives the numbers OpenSCAD gives for a seed. */
class MT19937 {
  constructor(seed = 5489) { this.mt = new Uint32Array(624); this.seed(seed); }
  seed(s) { const mt = this.mt; mt[0] = s >>> 0; for (let i = 1; i < 624; i++) { const p = mt[i - 1] ^ (mt[i - 1] >>> 30); mt[i] = (Math.imul(1812433253, p) + i) >>> 0; } this.i = 624; }
  next() {
    const mt = this.mt;
    if (this.i >= 624) {
      for (let k = 0; k < 624; k++) {
        const y = (mt[k] & 0x80000000) | (mt[(k + 1) % 624] & 0x7fffffff);
        mt[k] = mt[(k + 397) % 624] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      this.i = 0;
    }
    let y = mt[this.i++];
    y ^= y >>> 11; y ^= (y << 7) & 0x9d2c5680; y ^= (y << 15) & 0xefc60000; y ^= y >>> 18;
    return y >>> 0;
  }
  /** libstdc++ generate_canonical<double, 53> with a 32-bit engine: two draws. */
  canonical() { const a = this.next(); const b = this.next(); let r = (a + b * 4294967296) / 18446744073709551616; if (r >= 1) r = 1 - Number.EPSILON / 2; return r; }
}
/** boost::hash of a double on a 64-bit platform, cut to 32 bits (rands() seeds). */
function hashDouble(v) {
  const BITS = 31; const MOD = 0x7fffffff;
  if (!Number.isFinite(v)) return Number.isNaN(v) ? 0 : (v > 0 ? 314159 : -314159) >>> 0;
  if (v === 0) return 0;
  // frexp: v = m · 2^e with 0.5 ≤ |m| < 1.
  let e = Math.floor(Math.log2(Math.abs(v))) + 1;
  let m = v / 2 ** e;
  if (Math.abs(m) >= 1) { m /= 2; e += 1; } else if (Math.abs(m) < 0.5) { m *= 2; e -= 1; }
  let sign = 1; if (m < 0) { sign = -1; m = -m; }
  let x = 0;
  while (m) {
    x = (((x << 28) & MOD) | (x >>> (BITS - 28))) >>> 0;
    m *= 268435456; e -= 28;
    const y = Math.floor(m); m -= y;
    x += y; if (x >= MOD) x -= MOD;
  }
  e = e >= 0 ? e % BITS : BITS - 1 - ((-1 - e) % BITS);
  x = ((((x << e) & MOD) | (e ? x >>> (BITS - e) : 0)) >>> 0);
  return sign < 0 ? (0x100000000 - x) >>> 0 : x >>> 0;
}

/**
 * Evaluates a program. Options:
 *   geo          the geometry back end (geometry.js createGeometry())
 *   readFile     (path, from) → string | Uint8Array | null — include / use / import / surface files
 *   overrides    { name: value } — top-level variables set from outside (the customizer)
 *   specials     { $fn, $fa, $fs, $t, $preview, … } start values
 * Returns { node: the root geometry node (or null), echoes: [lines], warnings: [lines] }.
 */
export function evaluate(source, opts = {}) {
  const run = new Run(opts);
  return run.main(source);
}

class Run {
  constructor({ geo = null, readFile = null, overrides = {}, specials = {}, fileName = 'main.scad', maxSteps = 5e7 } = {}) {
    this.geo = geo; this.readFile = readFile; this.overrides = overrides; this.fileName = fileName;
    this.echoes = []; this.warnings = []; this.depth = 0; this.steps = 0; this.maxSteps = maxSteps;
    this.rng = new MT19937((Date.now() >>> 0));
    this.root = null; // the first '!' node
    this.used = new Map(); // use<> libraries: path → scope
    this.specials = { $fn: 0, $fa: 12, $fs: 2, $t: 0, $preview: false, $vpr: [55, 0, 25], $vpt: [0, 0, 0], $vpd: 140, $vpf: 22.5, $children: undefined, $parent_modules: 0, ...specials };
    this.moduleStack = [];
  }

  warn(msg, node) { this.warnings.push(node?.line ? `${msg} (line ${node.line})` : msg); }

  main(source) {
    try { return this.mainInner(source); } catch (error) {
      // Too deep in JavaScript's own stack: OpenSCAD reports that as recursion.
      const err = error instanceof RangeError ? scadError('Recursion detected (stack overflow)', null, 'scad-eval') : error;
      err.echoes = this.echoes; err.warnings = this.warnings;
      throw err;
    }
  }

  mainInner(source) {
    const tree = parse(source);
    const top = new Scope();
    top.file = this.fileName;
    for (const [k, v] of Object.entries(this.specials)) top.vars.set(k, v);
    top.vars.set('PI', Math.PI);
    const g = new Scope(top);
    const nodes = this.execBody(tree.statements, g, { top: true });
    const node = this.root ?? (this.geo ? this.geo.group(nodes) : null);
    return { node, echoes: this.echoes, warnings: this.warnings, scope: g };
  }

  tick() { if (++this.steps > this.maxSteps) throw scadError('the program runs too long (stopped)', null, 'scad-eval'); }

  // ───────────────────────── statements

  /** include <…>: the statements of a file, read and parsed, in place. */
  // The main file may include itself once; a file already being included is refused (as OpenSCAD).
  expandIncludes(stmts, seen = new Set()) {
    const out = [];
    for (const s of stmts) {
      if (s.t === 'block' && !s.mod) { out.push(...this.expandIncludes(s.body, seen)); continue; }
      if (s.t !== 'include') { out.push(s); continue; }
      const path = joinPath(s.fromDir ?? dirName(this.fileName), s.path);
      if (seen.has(path)) { this.warn(`Can't open include file '${s.path}'.`, s); continue; }
      const text = this.fileText(path, s, s.path);
      if (text == null) continue;
      const inner = parse(text).statements;
      for (const x of inner) x.fromDir = dirName(path);
      out.push(...this.expandIncludes(inner, new Set([...seen, path])));
    }
    return out;
  }

  fileText(path, node, shown = path) {
    const data = this.readFile?.(path, this.fileName);
    if (data == null) { this.warn(`Can't open include file '${shown}'.`, node); return null; }
    if (typeof data === 'string') return data;
    return decodeText(data);
  }

  /** use <…>: the file's functions and modules (its variables live in its own scope). */
  useLibrary(given, scope, node) {
    const path = joinPath(node.fromDir ?? dirName(scope.file ?? this.fileName), given);
    let lib = this.used.get(path);
    if (!lib) {
      const text = this.fileText(path, node, given);
      if (text == null) return;
      lib = new Scope(scope.parent && !scope.parent.parent ? scope.parent : rootOf(scope));
      lib.file = path;
      this.used.set(path, lib);
      const parsed = parse(text).statements;
      for (const x of parsed) x.fromDir = dirName(path);
      const stmts = this.expandIncludes(parsed);
      this.declare(stmts, lib);
      this.assign(stmts, lib, false);
    }
    for (const [k, v] of lib.funcs) if (!scope.funcs.has(k)) scope.funcs.set(k, v);
    for (const [k, v] of lib.mods) if (!scope.mods.has(k)) scope.mods.set(k, v);
  }

  /** Function and module definitions of a statement list into `scope` (hoisted). */
  declare(stmts, scope) {
    for (const s of stmts) {
      if (s.t === 'function') scope.funcs.set(s.name, new FunctionValue(s.params, s.expr, scope, s.name));
      else if (s.t === 'module') scope.mods.set(s.name, { params: s.params, body: s.body, scope, name: s.name });
      else if (s.t === 'use') this.useLibrary(s.path, scope, s);
    }
  }

  /**
   * The assignments of a statement list, in order of first appearance — a name assigned twice keeps its
   * first place and takes the last value (as OpenSCAD). Top-level names in `overrides` take that value.
   */
  assign(stmts, scope, top) {
    const order = []; const last = new Map();
    for (const s of stmts) {
      if (s.t !== 'assign') continue;
      if (!last.has(s.name)) order.push(s.name);
      else this.warn(`${s.name} was assigned on line ${last.get(s.name).line} but was overwritten`, s);
      last.set(s.name, s);
    }
    for (const name of order) {
      const s = last.get(name);
      if (top && Object.prototype.hasOwnProperty.call(this.overrides, name)) { scope.vars.set(name, this.overrides[name]); continue; }
      scope.vars.set(name, this.expr(s.expr, scope));
    }
  }

  /** Runs a statement list in `scope`: definitions, assignments, then instances → geometry nodes (one each). */
  execBody(stmts, scope, { top = false, select = null } = {}) {
    const list = this.expandIncludes(stmts);
    this.declare(list, scope);
    this.assign(list, scope, top);
    const insts = list.filter((s) => s.t === 'inst' || s.t === 'if' || s.t === 'block');
    const out = [];
    for (const i of select ?? insts.keys()) {
      const n = this.instance(insts[i], scope);
      if (n) out.push(n);
    }
    return out;
  }

  /** Statements that count as children (instances, not assignments or definitions). */
  countChildren(stmts) { return this.expandIncludes(stmts).filter((s) => s.t === 'inst' || s.t === 'if' || s.t === 'block').length; }

  instance(s, scope) {
    this.tick();
    if (s.mod === '*') return null;
    let node;
    if (s.t === 'block') node = this.geo?.group(this.execBody(s.body, new Scope(scope)));
    else if (s.t === 'if') {
      const c = truthy(this.expr(s.cond, scope));
      const branch = c ? s.then : s.else;
      node = branch ? this.geo?.group(this.execBody(branch, new Scope(scope))) : null;
    } else node = this.call(s, scope);
    if (!node) return null;
    if (s.mod === '%') { this.geo?.background(node); return null; }
    if (s.mod === '#') this.geo?.highlight(node);
    if (s.mod === '!' && !this.root) this.root = node;
    return node;
  }

  /** Named and positional arguments evaluated: [{ name, value }]. */
  args(list, scope) { return list.map((a) => ({ name: a.name, value: this.expr(a.expr, scope) })); }

  call(s, scope) {
    const name = s.name;
    switch (name) {
      case 'for': case 'intersection_for': {
        const nodes = [];
        this.forEach(s.args, scope, (inner) => { const r = this.execBody(s.children, inner); if (name === 'for') nodes.push(...r); else nodes.push(this.geo?.group(r)); });
        if (!this.geo) return null;
        return name === 'for' ? this.geo.group(nodes) : this.geo.boolean('intersection', nodes.filter(Boolean));
      }
      case 'let': case 'assign': {
        if (name === 'assign') this.warn('DEPRECATED: The assign() module will be removed in future releases. Use a regular assignment instead.', s);
        const inner = new Scope(scope);
        for (const a of s.args) { if (!a.name) continue; if (inner.vars.has(a.name)) { this.warn(`${a.name} was assigned on line ${s.line} but was overwritten`, s); continue; } inner.vars.set(a.name, this.expr(a.expr, inner)); }
        return this.geo?.group(this.execBody(s.children, inner));
      }
      case 'echo': {
        this.echo(this.args(s.args, scope));
        return this.geo?.group(this.execBody(s.children, new Scope(scope)));
      }
      case 'assert': {
        this.assertCheck(s.args, scope, s);
        return this.geo?.group(this.execBody(s.children, new Scope(scope)));
      }
      case 'children': return this.childrenOf(s, scope);
      default: break;
    }
    const user = scope.lookupMod(name);
    if (user) return this.userModule(user, s, scope);
    if (this.geo?.has(name)) {
      const args = this.args(s.args, scope);
      const inner = new Scope(scope);
      for (const a of args) if (a.name && a.name[0] === '$') inner.vars.set(a.name, a.value);
      const special = (k) => inner.lookupVar(k).value;
      const kids = () => this.execBody(s.children, inner);
      const dir = s.fromDir ?? dirName(scope.file ?? this.fileName);
      return this.geo.module(name, args, { special, children: kids, line: s.line, warn: (m) => this.warn(m, s), readFile: (p) => this.readFile?.(joinPath(dir, p), this.fileName) });
    }
    this.warn(`Ignoring unknown module '${name}'`, s);
    return null;
  }

  userModule(mod, s, scope) {
    if (++this.depth > MAX_DEPTH) { this.depth = 0; throw scadError(`Recursion detected calling module '${s.name}'`, s, 'scad-eval'); }
    try {
      const args = this.args(s.args, scope);
      const inner = new Scope(mod.scope, scope);
      inner.file = mod.scope.file;
      this.bind(mod.params, args, inner, s.name, s);
      const count = this.countChildren(s.children);
      inner.vars.set('$children', count);
      this.moduleStack.push(s.name);
      inner.vars.set('$parent_modules', this.moduleStack.length);
      inner.children = { stmts: s.children, scope, count };
      try { const nodes = this.execBody(mod.body, inner); return this.geo ? this.geo.group(nodes) : null; }
      finally { this.moduleStack.pop(); }
    } finally { this.depth--; }
  }

  /** children(), children(i), children([i, j]), children([a : b]): the module instance's child nodes. */
  childrenOf(s, scope) {
    const ch = scope.children;
    if (!ch) return null;
    const args = this.args(s.args, scope);
    let select = null;
    if (args.length) {
      const v = args[0].value;
      const idx = isNum(v) ? [v] : isVec(v) ? v : isRange(v) ? v.values() : null;
      if (!idx) { this.warn('Bad parameter type for children', s); return null; }
      select = [];
      for (const i of idx) { if (!isNum(i)) continue; const k = Math.floor(i); if (k < 0 || k >= ch.count) this.warn(`Children index (${numStr(i)}) out of bounds (${ch.count} children)`, s); else select.push(k); }
    }
    // Run in the instance's scope, with $ variables seen from here (the module body).
    const inner = new Scope(ch.scope, scope);
    inner.children = ch.scope.children;
    const nodes = this.execBody(ch.stmts, inner, { select });
    return this.geo?.group(nodes);
  }

  /** Binds parameters: positional first, then by name; defaults evaluated in the new scope in order. */
  bind(params, args, inner, name, at) {
    const given = new Map();
    let pos = 0;
    for (const a of args) {
      if (a.name) {
        if (a.name[0] === '$') { inner.vars.set(a.name, a.value); continue; }
        if (!params.some((p) => p.name === a.name)) { this.warn(`variable ${a.name} not specified as parameter`, at); inner.vars.set(a.name, a.value); continue; }
        given.set(a.name, a.value);
      } else {
        if (pos < params.length) given.set(params[pos].name, a.value);
        else this.warn(`Too many unnamed arguments supplied`, at);
        pos++;
      }
    }
    for (const p of params) {
      if (given.has(p.name)) inner.vars.set(p.name, given.get(p.name));
      else inner.vars.set(p.name, p.def ? this.expr(p.def, inner) : undefined);
    }
  }

  forEach(binds, scope, fn) {
    const loop = (i, sc) => {
      if (i >= binds.length) { fn(sc); return; }
      const b = binds[i];
      const v = this.expr(b.expr, sc);
      for (const x of iterable(v, this)) { const inner = new Scope(sc); inner.vars.set(b.name, x); loop(i + 1, inner); }
    };
    loop(0, scope);
  }

  echo(args) {
    this.echoes.push(`ECHO: ${args.map((a) => (a.name ? `${a.name} = ${repr(a.value)}` : repr(a.value))).join(', ')}`);
  }

  assertCheck(argList, scope, at) {
    const args = this.args(argList, scope);
    const cond = args[0]?.value;
    if (!truthy(cond)) {
      const msg = args[1] ? `: ${toStr(args[1].value)}` : '';
      throw scadError(argList[0] ? `Assertion '${exprText(argList[0].expr)}' failed${msg}` : `Assertion failed${msg}`, at, 'scad-assert');
    }
  }

  // ───────────────────────── expressions

  expr(e, scope) {
    switch (e.t) {
      case 'num': return e.v;
      case 'str': return e.v;
      case 'bool': return e.v;
      case 'undef': return undefined;
      case 'id': {
        const r = scope.lookupVar(e.name);
        if (r.found) return r.value;
        // A function name used as a value (OpenSCAD 2021: only variables hold functions; warn as unknown).
        this.warn(`Ignoring unknown variable '${e.name}'`, e);
        return undefined;
      }
      case 'vec': return this.vector(e, scope);
      case 'range': {
        const b = this.expr(e.begin, scope); const st = e.step ? this.expr(e.step, scope) : 1; const en = this.expr(e.end, scope);
        if (!isNum(b) || !isNum(st) || !isNum(en)) return undefined;
        // [b : e] with b > e counts down in old versions; 2021 warns and makes it empty only with an explicit step.
        if (!e.step && b > en) { this.warn(`DEPRECATED: Using ranges of the form [begin:end] with begin value greater than the end value is deprecated`, e); return new Range(en, 1, b); }
        return new Range(b, st, en);
      }
      case 'un': {
        const v = this.expr(e.e, scope);
        if (e.op === '!') return !truthy(v);
        if (e.op === '-') return negate(v);
        return isNum(v) || isVec(v) ? v : undefined;
      }
      case 'bin': return this.binary(e, scope);
      case 'tern': return truthy(this.expr(e.c, scope)) ? this.expr(e.a, scope) : this.expr(e.b, scope);
      case 'index': return index(this.expr(e.obj, scope), this.expr(e.idx, scope));
      case 'member': {
        const v = this.expr(e.obj, scope);
        const k = { x: 0, y: 1, z: 2 }[e.name];
        if (isVec(v) && k !== undefined) return v[k];
        if (isObj(v)) return v.get(e.name);
        if (isRange(v)) return e.name === 'begin' ? v.begin : e.name === 'step' ? v.step : e.name === 'end' ? v.end : undefined;
        return undefined;
      }
      case 'let': { const inner = new Scope(scope); for (const b of e.binds) { if (!b.name || inner.vars.has(b.name)) continue; inner.vars.set(b.name, this.expr(b.expr, inner)); } return this.expr(e.body, inner); }
      case 'assert': { this.assertCheck(e.args, scope, e); return e.body ? this.expr(e.body, scope) : undefined; }
      case 'echo': { this.echo(this.args(e.args, scope)); return e.body ? this.expr(e.body, scope) : undefined; }
      case 'func': return new FunctionValue(e.params, e.body, scope);
      case 'call': return this.callFunction(e, scope);
      default: throw scadError(`cannot evaluate ${e.t}`, e, 'scad-eval');
    }
  }

  binary(e, scope) {
    const op = e.op;
    if (op === '&&') return truthy(this.expr(e.a, scope)) && truthy(this.expr(e.b, scope));
    if (op === '||') return truthy(this.expr(e.a, scope)) || truthy(this.expr(e.b, scope));
    const a = this.expr(e.a, scope); const b = this.expr(e.b, scope);
    switch (op) {
      case '+': return add(a, b);
      case '-': return sub(a, b);
      case '*': return mul(a, b);
      case '/': return div(a, b);
      case '%': return mod(a, b);
      case '^': return pow(a, b);
      case '==': return equal(a, b);
      case '!=': return !equal(a, b);
      default: return compare(op, a, b);
    }
  }

  vector(e, scope) {
    const out = [];
    for (const item of e.items) this.element(item, scope, out);
    return out;
  }
  /** One element of a vector or list comprehension, pushed onto `out`. */
  element(item, scope, out) {
    if (out.length > MAX_LIST) throw scadError('the list is too long', item, 'scad-eval');
    switch (item.t) {
      case 'lc-for': {
        this.forEach(item.binds, scope, (inner) => this.element(item.body, inner, out));
        return;
      }
      case 'lc-cfor': {
        let sc = new Scope(scope);
        for (const a of item.init) sc.vars.set(a.name, this.expr(a.expr, sc));
        let guard = 0;
        while (truthy(this.expr(item.cond, sc))) {
          if (++guard > 1e6) throw scadError('a for loop runs too long', item, 'scad-eval');
          this.element(item.body, sc, out);
          const next = new Scope(scope);
          for (const [k, v] of sc.vars) next.vars.set(k, v);
          for (const a of item.update) next.vars.set(a.name, this.expr(a.expr, next));
          sc = next;
        }
        return;
      }
      case 'lc-if': {
        if (truthy(this.expr(item.cond, scope))) this.element(item.then, scope, out);
        else if (item.else) this.element(item.else, scope, out);
        return;
      }
      case 'lc-let': {
        const inner = new Scope(scope);
        for (const b of item.binds) { if (!b.name || inner.vars.has(b.name)) continue; inner.vars.set(b.name, this.expr(b.expr, inner)); }
        this.element(item.body, inner, out);
        return;
      }
      case 'lc-each': {
        const tmp = [];
        this.element(item.body, scope, tmp);
        for (const v of tmp) {
          if (isVec(v)) out.push(...v);
          else if (isRange(v)) out.push(...v.values());
          else if (isStr(v)) out.push(...v);
          else out.push(v);
        }
        return;
      }
      default: out.push(this.expr(item, scope));
    }
  }

  /** A function call, with tail calls run in a loop (deep recursion like OpenSCAD's tail-recursion support). */
  callFunction(e, scope) {
    let callee = null; let builtin = null;
    if (e.fn.t === 'id') {
      callee = scope.lookupFunc(e.fn.name);
      if (!callee && e.fn.name[0] !== '$') { const v = scope.lookupVar(e.fn.name); if (v.found && isFn(v.value)) callee = v.value; }
      if (!callee) builtin = BUILTINS[e.fn.name];
      if (!callee && !builtin) { this.warn(`Ignoring unknown function '${e.fn.name}'`, e); return undefined; }
    } else {
      const v = this.expr(e.fn, scope);
      if (!isFn(v)) { this.warn('Can\'t call a value that is not a function', e); return undefined; }
      callee = v;
    }
    if (builtin) return builtin.call(this, this.args(e.args, scope), scope, e);
    let fn = callee; let args = this.args(e.args, scope); let caller = scope; let tail = 0;
    if (++this.depth > MAX_DEPTH) { this.depth = 0; throw scadError(`Recursion detected calling function '${fn.name ?? 'literal'}'`, e, 'scad-eval'); }
    try {
      for (;;) {
        this.tick();
        const inner = new Scope(fn.scope, caller);
        this.bind(fn.params, args, inner, fn.name, e);
        // Walk the body in tail position: ?:, let, assert, echo — a call there replaces this one.
        let body = fn.body; let sc = inner; let next = null;
        for (;;) {
          if (body.t === 'tern') { body = truthy(this.expr(body.c, sc)) ? body.a : body.b; continue; }
          if (body.t === 'let') { const s2 = new Scope(sc); for (const b of body.binds) { if (!b.name || s2.vars.has(b.name)) continue; s2.vars.set(b.name, this.expr(b.expr, s2)); } sc = s2; body = body.body; continue; }
          if (body.t === 'assert') { this.assertCheck(body.args, sc, body); if (!body.body) return undefined; body = body.body; continue; }
          if (body.t === 'echo') { this.echo(this.args(body.args, sc)); if (!body.body) return undefined; body = body.body; continue; }
          if (body.t === 'call') {
            let c = null;
            if (body.fn.t === 'id') { c = sc.lookupFunc(body.fn.name); if (!c && body.fn.name[0] !== '$') { const v = sc.lookupVar(body.fn.name); if (v.found && isFn(v.value)) c = v.value; } }
            else { const v = this.expr(body.fn, sc); if (isFn(v)) c = v; }
            if (c) { next = { fn: c, args: this.args(body.args, sc), caller: sc }; break; }
          }
          return this.expr(body, sc);
        }
        fn = next.fn; args = next.args; caller = dynAnchor(next.caller);
        if (++tail > 1e6) throw scadError(`Recursion detected calling function '${fn.name ?? 'literal'}'`, e, 'scad-eval');
      }
    } finally { this.depth--; }
  }
}

/** The nearest scope (from `s` toward its callers) that holds a $ variable: what a call's $ lookups need, so a
 *  long run of tail calls does not keep every earlier scope alive. */
function dynAnchor(s) {
  let c = s;
  while (c) {
    for (const k of c.vars.keys()) if (k[0] === '$') return c;
    const next = c.caller ?? c.parent;
    if (!next) return c;
    c = next;
  }
  return s;
}

/** Program text from bytes (UTF-8; bad bytes grouped as OpenSCAD reads them). */
function decodeText(b) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { /* walk it */ }
  let out = ''; let i = 0;
  const lenOf = (c) => (c < 0xc0 ? 1 : c < 0xe0 ? 2 : c < 0xf0 ? 3 : c < 0xf8 ? 4 : c < 0xfc ? 5 : c < 0xfe ? 6 : 1);
  while (i < b.length) { const n = Math.min(lenOf(b[i]), b.length - i); try { out += new TextDecoder('utf-8', { fatal: true }).decode(b.subarray(i, i + n)); } catch { out += '\ufffd'; } i += n; }
  return out;
}

/** The folder part of a path ('' for none) and a path joined and normalised (a/b/../c → a/c). */
function dirName(p) { const s = String(p ?? '').replace(/\\/g, '/'); const i = s.lastIndexOf('/'); return i < 0 ? '' : s.slice(0, i); }
function joinPath(dir, p) {
  const s = String(p).replace(/\\/g, '/');
  if (/^([a-z]:)?\//i.test(s) || !dir) return normalise(s);
  return normalise(`${dir}/${s}`);
}
function normalise(p) {
  const out = [];
  for (const part of p.split('/')) {
    if (part === '' || part === '.') { if (!out.length && p.startsWith('/')) out.push(''); continue; }
    if (part === '..' && out.length && out[out.length - 1] !== '..' && out[out.length - 1] !== '') out.pop(); else out.push(part);
  }
  return out.join('/');
}

function rootOf(scope) { let s = scope; while (s.parent) s = s.parent; return s; }

/** What a for loop goes over: vector elements, range values, string characters, or a single value. */
/** Arguments by name, positional ones taking the names in order. */
function textArgs(args, names) {
  const out = {}; let k = 0;
  for (const a of args) { if (a.name) out[a.name] = a.value; else if (k < names.length) out[names[k++]] = a.value; }
  return out;
}
/** A plain JS record (nested) as an OpenSCAD object. */
function toObject(o) {
  if (o && typeof o === 'object' && !Array.isArray(o)) return new ObjectValue(Object.entries(o).map(([k, v]) => [k, toObject(v)]));
  return o;
}

function iterable(v, run) {
  if (isVec(v)) return v;
  if (isRange(v)) {
    const n = v.count;
    if (n >= 4294967295) { run.warn('Bad range parameter in for statement: too many elements (4294967295)'); return []; }
    return v.iter();
  }
  if (isStr(v)) return [...v];
  if (isObj(v)) return v.keys();
  if (v === undefined) return [];
  return [v];
}

/** Source-like text of an expression (assertion messages). */
export function exprText(e) {
  if (!e) return '';
  switch (e.t) {
    case 'num': return numStr(e.v);
    case 'str': return JSON.stringify(e.v);
    case 'bool': return String(e.v);
    case 'undef': return 'undef';
    case 'id': return e.name;
    case 'bin': return `(${exprText(e.a)} ${e.op} ${exprText(e.b)})`;
    case 'un': return `${e.op}${exprText(e.e)}`;
    case 'call': return `${exprText(e.fn)}(${e.args.map((a) => (a.name ? `${a.name} = ` : '') + exprText(a.expr)).join(', ')})`;
    case 'index': return `${exprText(e.obj)}[${exprText(e.idx)}]`;
    case 'member': return `${exprText(e.obj)}.${e.name}`;
    case 'tern': return `(${exprText(e.c)} ? ${exprText(e.a)} : ${exprText(e.b)})`;
    case 'vec': return `[${e.items.map(exprText).join(', ')}]`;
    default: return '…';
  }
}

// ───────────────────────── built-in functions (this = Run)

const num1 = (f) => function fn(args, scope, e) {
  const v = args[0]?.value;
  if (args.length !== 1) { this.warn(`${e.fn.name}() number of parameters does not match`, e); return undefined; }
  if (!isNum(v)) { this.warn(`${e.fn.name}() parameter could not be converted`, e); return undefined; }
  return f(v);
};

function utf8Len(s) { return [...s].length; }
const oneArg = (name, f) => function fn(args, scope, e) { if (args.length !== 1) { this.warn(`${name}() number of parameters does not match`, e); return undefined; } return f(args[0].value); };
const baseName = (p) => String(p).replace(/\\/g, '/').split('/').pop();

const BUILTINS = {
  abs: num1(Math.abs),
  sign: num1((x) => (x < 0 ? -1 : x > 0 ? 1 : 0)),
  sin: num1(sinDeg), cos: num1(cosDeg), tan: num1(tanDeg),
  asin: num1(asinDeg), acos: num1(acosDeg), atan: num1(atanDeg),
  atan2(args, scope, e) { const [y, x] = args.map((a) => a.value); if (args.length !== 2) { this.warn('atan2() number of parameters does not match', e); return undefined; } return isNum(y) && isNum(x) ? atan2Deg(y, x) : undefined; },
  floor: num1(Math.floor), ceil: num1(Math.ceil), round: num1(roundHalfAway),
  sqrt: num1(Math.sqrt), exp: num1(Math.exp), ln: num1(Math.log),
  log(args, scope, e) {
    if (args.length === 1 && isNum(args[0].value)) return Math.log10(args[0].value);
    if (args.length === 2 && isNum(args[0].value) && isNum(args[1].value)) return Math.log(args[1].value) / Math.log(args[0].value);
    this.warn('log() number of parameters does not match', e); return undefined;
  },
  pow(args, scope, e) { if (args.length !== 2) { this.warn('pow() number of parameters does not match', e); return undefined; } return pow(args[0].value, args[1].value); },
  min(args, scope, e) { return minMax.call(this, args, e, -1); },
  max(args, scope, e) { return minMax.call(this, args, e, 1); },
  norm(args, scope, e) {
    const v = args[0]?.value;
    if (args.length !== 1 || !isVec(v)) { this.warn('norm() parameter could not be converted', e); return undefined; }
    let s = 0;
    for (const x of v) { if (!isNum(x)) { this.warn('norm() parameter could not be converted', e); return undefined; } s += x * x; }
    return Math.sqrt(s);
  },
  cross(args, scope, e) {
    const [a, b] = args.map((x) => x.value);
    if (!isVec(a) || !isVec(b) || a.length !== b.length || !(a.length === 2 || a.length === 3) || ![...a, ...b].every((x) => isNum(x) && Number.isFinite(x))) { this.warn('Invalid vector parameter for cross()', e); return undefined; }
    if (a.length === 2) return a[0] * b[1] - a[1] * b[0];
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  },
  len(args, scope, e) {
    if (args.length !== 1) { this.warn('len() number of parameters does not match', e); return undefined; }
    const v = args[0]?.value;
    if (isVec(v)) return v.length;
    if (isStr(v)) return utf8Len(v);
    if (isRange(v)) return v.values().length;
    this.warn(`len() parameter could not be converted`, e);
    return undefined;
  },
  concat(args) {
    const out = [];
    for (const a of args) { if (isVec(a.value)) out.push(...a.value); else out.push(a.value); }
    return out;
  },
  lookup(args, scope, e) {
    if (args.length !== 2) { this.warn('lookup() number of parameters does not match', e); return undefined; }
    const [key, table] = args.map((a) => a.value);
    if (!isNum(key) || !isVec(table)) { this.warn('lookup() parameter could not be converted', e); return undefined; }
    const rows = table.filter((r) => isVec(r) && r.length >= 2 && isNum(r[0]) && isNum(r[1]));
    if (!rows.length) return undefined;
    let low = rows[0]; let high = rows[0];
    // OpenSCAD: the lowest key above and the highest below; outside the table the end value.
    let lo = null; let hi = null;
    for (const r of rows) { if (r[0] <= key && (!lo || r[0] > lo[0])) lo = r; if (r[0] >= key && (!hi || r[0] < hi[0])) hi = r; }
    if (!lo) { low = rows.reduce((m, r) => (r[0] < m[0] ? r : m)); return low[1]; }
    if (!hi) { high = rows.reduce((m, r) => (r[0] > m[0] ? r : m)); return high[1]; }
    if (lo[0] === hi[0]) return lo[1];
    const f = (key - lo[0]) / (hi[0] - lo[0]);
    return lo[1] + f * (hi[1] - lo[1]);
  },
  str(args) { return args.map((a) => toStr(a.value)).join(''); },
  chr(args) {
    let s = '';
    const put = (v) => {
      if (isNum(v)) { const c = Math.trunc(v); if (c > 0 && c <= 0x10ffff && !(c >= 0xd800 && c <= 0xdfff)) s += String.fromCodePoint(c); }
      else if (isVec(v)) v.forEach(put);
      else if (isRange(v)) v.values().forEach(put);
    };
    args.forEach((a) => put(a.value));
    return s;
  },
  ord(args, scope, e) {
    const v = args[0]?.value;
    if (args.length !== 1) { this.warn('ord() number of parameters does not match', e); return undefined; }
    if (!isStr(v)) { this.warn(`ord() argument ${repr(v)} is not of type string`, e); return undefined; }
    const cs = [...v];
    if (!cs.length) { this.warn(`ord() argument ${repr(v)} is not exactly 1 character`, e); return undefined; }
    const cp = cs[0].codePointAt(0);
    return cp === 0xfffd ? undefined : cp;
  },
  search(args, scope, e) { return search.call(this, args, e); },
  rands(args, scope, e) {
    const vs = args.map((a) => a.value);
    if (vs.length !== 3 && vs.length !== 4) { this.warn('rands() number of parameters does not match', e); return undefined; }
    if (!vs.every(isNum)) return undefined;
    let [lo, hi, count] = vs;
    if (!Number.isFinite(lo)) lo = -Number.MAX_VALUE / 2;
    if (!Number.isFinite(hi)) hi = Number.MAX_VALUE / 2;
    if (hi < lo) [lo, hi] = [hi, lo];
    count = Math.abs(count);
    if (!Number.isFinite(count)) count = 1;
    count = Math.floor(count);
    if (vs.length === 4) this.rng.seed(hashDouble(vs[3]));
    const out = [];
    for (let i = 0; i < count; i++) out.push(lo >= hi ? lo : lo + this.rng.canonical() * (hi - lo));
    return out;
  },
  dxf_dim(args, scope, e) { return dxfDim.call(this, args, e); },
  dxf_cross(args, scope, e) { return dxfCross.call(this, args, e); },
  version() { return [2021, 1, 0]; },
  version_num() { return 20210100; },
  is_undef: oneArg('is_undef', (v) => v === undefined),
  is_bool: oneArg('is_bool', isBool),
  is_num: oneArg('is_num', (v) => isNum(v) && !Number.isNaN(v)),
  is_string: oneArg('is_string', isStr),
  is_list: oneArg('is_list', isVec),
  is_function: oneArg('is_function', isFn),
  is_object: oneArg('is_object', isObj),
  /**
   * object(…): members from [name, value] pairs, lists of pairs, other objects (copied) and name = value
   * arguments, later ones replacing earlier; a name given with undef as its value removes the member.
   */
  object(args, scope, e) {
    const m = new Map();
    const put = (k, v) => { if (v === undefined) m.delete(k); else m.set(k, v); };
    const pair = (p) => {
      if (isVec(p) && p.length === 2 && isStr(p[0])) { put(p[0], p[1]); return true; }
      if (isVec(p) && p.length === 1 && isStr(p[0])) { m.delete(p[0]); return true; }
      return false;
    };
    for (const a of args) {
      if (a.name) { put(a.name, a.value); continue; }
      const v = a.value;
      if (isObj(v)) { for (const [k, x] of v.map) put(k, x); continue; }
      if (pair(v)) continue;
      if (isVec(v) && v.every((p) => pair(p))) continue;
      this.warn(`object() argument ${repr(v)} is not an object, a [name, value] pair or a list of them`, e);
    }
    return new ObjectValue(m);
  },
  has_key(args, scope, e) {
    const [o, k] = args.map((a) => a.value);
    if (args.length !== 2) { this.warn('has_key() number of parameters does not match', e); return undefined; }
    return isObj(o) && isStr(k) ? o.has(k) : false;
  },
  /** The size and placement of a text as text() would draw it (with the same arguments). */
  textmetrics(args, scope, e) {
    const named = textArgs(args, ['text', 'size', 'font', 'halign', 'valign', 'spacing', 'direction', 'language', 'script']);
    const m = this.geo?.textMetrics?.(named, (n) => scope.lookupVar(n).value);
    return m ? toObject(m) : undefined;
  },
  /** The metrics of a font at a size: nominal and largest ascent and descent, line spacing, family and style. */
  fontmetrics(args, scope, e) {
    const named = textArgs(args, ['size', 'font']);
    const m = this.geo?.fontMetrics?.(named);
    return m ? toObject(m) : undefined;
  },
  parent_module(args, scope, e) {
    const n = args.length ? args[0].value : 0;
    const stack = this.moduleStack;
    if (!isNum(n) || n < 0) { this.warn('Negative parent module index (' + numStr(n) + ') not allowed', e); return undefined; }
    const k = stack.length - 1 - Math.floor(n);
    if (k < 0) { this.warn(`Parent module index (${numStr(n)}) greater than the number of modules on the stack`, e); return undefined; }
    return stack[k];
  },
};

/** Entities of a DXF file as group code pairs: [{ type, codes: Map(code → [values]) }]. */
function dxfEntities(text) {
  const lines = text.split(/\r?\n/);
  const out = []; let cur = null; let inEntities = false;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim()); const value = lines[i + 1].trim();
    if (code === 2 && cur?.type === 'SECTION') { inEntities = value === 'ENTITIES' || value === 'BLOCKS'; }
    if (code === 0) { cur = { type: value, codes: new Map() }; if (inEntities || value === 'SECTION') out.push(cur); continue; }
    if (cur) { if (!cur.codes.has(code)) cur.codes.set(code, []); cur.codes.get(code).push(value); }
  }
  return out.filter((x) => x.type !== 'SECTION');
}
function dxfArgs(args) {
  const o = { file: '', layer: '', name: '', origin: [0, 0], scale: 1 };
  for (const a of args) {
    if (a.name === 'file') o.file = toStr(a.value);
    else if (a.name === 'layer') o.layer = toStr(a.value);
    else if (a.name === 'name') o.name = toStr(a.value);
    else if (a.name === 'origin' && isVec(a.value) && a.value.length >= 2) o.origin = [Number(a.value[0]), Number(a.value[1])];
    else if (a.name === 'scale' && isNum(a.value)) o.scale = a.value;
  }
  return o;
}
function dxfText(run, file, e) {
  const data = run.readFile?.(joinPath(dirName(run.fileName), file), run.fileName);
  if (data == null) return null;
  return typeof data === 'string' ? data : new TextDecoder().decode(data);
}
function dxfDim(args, e) {
  const o = dxfArgs(args);
  const text = dxfText(this, o.file, e);
  if (text == null) return undefined;
  for (const ent of dxfEntities(text)) {
    if (ent.type !== 'DIMENSION') continue;
    const g = (c, d = 0) => Number(ent.codes.get(c)?.[0] ?? d);
    if (o.layer && (ent.codes.get(8)?.[0] ?? '') !== o.layer) continue;
    const name = ent.codes.get(1)?.[0] ?? '';
    if (o.name && name !== o.name) continue;
    const P = (i) => [(g(10 + i) - o.origin[0]) * o.scale, (g(20 + i) - o.origin[1]) * o.scale];
    const type = g(70) & 7; const angle = g(50);
    const c0 = P(0), c3 = P(3), c4 = P(4), c5 = P(5);
    if (type === 0) { const x = c4[0] - c3[0], y = c4[1] - c3[1]; return Math.abs(x * cosDeg(angle) + y * sinDeg(angle)); }
    if (type === 1) return Math.hypot(c4[0] - c3[0], c4[1] - c3[1]);
    if (type === 2) return Math.abs(atan2Deg(c0[0] - c5[0], c0[1] - c5[1]) - atan2Deg(c4[0] - c3[0], c4[1] - c3[1]));
    if (type === 3 || type === 4) return Math.hypot(c5[0] - c0[0], c5[1] - c0[1]);
    if (type === 6) return g(70) & 64 ? c3[0] : c3[1];
    return undefined;
  }
  this.warn(`WARNING: Can't find dimension '${o.name}' in '${o.file}', layer '${o.layer}'!`, e);
  return undefined;
}
function dxfCross(args, e) {
  const o = dxfArgs(args);
  const text = dxfText(this, o.file, e);
  if (text == null) return undefined;
  const lines = [];
  for (const ent of dxfEntities(text)) {
    if (ent.type !== 'LINE') continue;
    if (o.layer && (ent.codes.get(8)?.[0] ?? '') !== o.layer) continue;
    const g = (c) => Number(ent.codes.get(c)?.[0] ?? 0);
    lines.push([[(g(10) - o.origin[0]) * o.scale, (g(20) - o.origin[1]) * o.scale], [(g(11) - o.origin[0]) * o.scale, (g(21) - o.origin[1]) * o.scale]]);
  }
  if (lines.length !== 2) { this.warn(`WARNING: Can't find cross in '${o.file}', layer '${o.layer}'!`, e); return undefined; }
  const [[a, b], [c, d]] = lines;
  const x1 = a[0], y1 = a[1], x2 = b[0], y2 = b[1], x3 = c[0], y3 = c[1], x4 = d[0], y4 = d[1];
  const dd = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(dd) < 1e-12) return undefined;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / dd;
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}

function minMax(args, e, dir) {
  if (!args.length) { this.warn(`${dir < 0 ? 'min' : 'max'}() number of parameters does not match`, e); return undefined; }
  const v0 = args[0].value;
  if (args.length === 1 && isVec(v0)) {
    if (!v0.length) return undefined;
    let best = v0[0];
    for (const x of v0) { if (isNum(x) && isNum(best) ? (dir < 0 ? x < best : x > best) : false) best = x; }
    return best;
  }
  if (!isNum(v0)) return undefined;
  let best = v0;
  for (let i = 1; i < args.length; i++) { const x = args[i].value; if (!isNum(x)) return undefined; if (dir < 0 ? x < best : x > best) best = x; }
  return best;
}

function search(args, e) {
  if (args.length < 2) { this.warn('search() number of parameters does not match', e); return undefined; }
  const find = args[0].value; const table = args[1].value;
  const per = args.length > 2 ? Math.max(0, Math.trunc(Number(args[2].value) || 0)) : 1;
  const col = args.length > 3 ? Math.max(0, Math.trunc(Number(args[3].value) || 0)) : 0;
  const asVec = (v) => (isVec(v) ? v : isRange(v) ? v.values() : isStr(v) ? [...v] : []);
  const out = [];
  const matches = (needle, entry) => (col === 0 && equal(needle, entry)) || (isVec(entry) && col < entry.length && equal(needle, entry[col]));
  if (isNum(find)) {
    let count = 0; let j = 0;
    for (const entry of asVec(table)) { if (matches(find, entry)) { out.push(j); count++; if (per !== 0 && count >= per) break; } j++; }
    return out;
  }
  if (isStr(find)) {
    for (const ch of [...find]) {
      let count = 0; const res = [];
      if (isStr(table)) {
        const tc = [...table];
        for (let j = 0; j < tc.length; j++) {
          if (tc[j] === ch) { count++; if (per === 1) { out.push(j); break; } res.push(j); if (per > 1 && count >= per) break; }
        }
      } else {
        const tv = asVec(table);
        for (let j = 0; j < tv.length; j++) {
          const entry = isVec(tv[j]) ? tv[j] : [];
          if (entry.length <= col) { this.warn(`Invalid entry in search vector at index ${j}, required number of values in the entry: ${col + 1}. Invalid entry: ${repr(tv[j])}`, e); return []; }
          const s = toStr(entry[col]);
          if ([...s][0] === ch) { count++; if (per === 1) { out.push(j); break; } res.push(j); if (per > 1 && count >= per) break; }
        }
        if (count === 0) this.warn(`search term not found: "${ch}"`, e);
      }
      if (per === 0 || per > 1) out.push(res);
    }
    return out;
  }
  if (isVec(find)) {
    for (const needle of find) {
      let count = 0; const res = []; let j = 0;
      for (const entry of asVec(table)) {
        if (matches(needle, entry)) { count++; if (per === 1) { out.push(j); break; } res.push(j); if (per > 1 && count >= per) break; }
        j++;
      }
      if (per === 1 && count === 0) out.push(res);
      if (per === 0 || per > 1) out.push(res);
    }
    return out;
  }
  return undefined;
}

export { BUILTINS, MT19937, hashDouble, typeName };
