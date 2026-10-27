// Tree-walking evaluator for the M subset (see parser.js). Variables live in
// a Scope; unknown names fall back to the scope's resolver (mask workspace →
// model workspace → base workspace) and then to functions (local mini
// library, user functions of the program, ctx.call for everything else).
import { MError, tensor, num, str, bool, isTensor, isCell, isStruct, isChar, isString, toStr, cell, struct, prod, cast, INT_RANGE, empty, funcHandle, isFuncHandle } from '../../value.js';
import * as op from './ops.js';
import { parseExpression, parseProgram } from './parser.js';
import { LIB } from './lib.js';

class Ctl { constructor(kind) { this.kind = kind; } }
const BREAK = new Ctl('break'), CONTINUE = new Ctl('continue'), RETURN = new Ctl('return');

export class Scope {
  constructor(resolve = null, parent = null) { this.vars = new Map(); this.resolve = resolve; this.parent = parent; }
  get(name) {
    if (this.vars.has(name)) return this.vars.get(name);
    if (this.parent) { const v = this.parent.get(name); if (v !== undefined) return v; }
    return this.resolve ? this.resolve(name) : undefined;
  }
  has(name) { return this.vars.has(name) || (this.parent ? this.parent.get(name) !== undefined : false) || (this.resolve ? this.resolve(name) !== undefined : false); }
  set(name, v) { this.vars.set(name, v); }
  local(name) { return this.vars.get(name); }
}

const cache = new Map();
export function parseCached(src, kind) {
  const key = kind + '\u0000' + src;
  let r = cache.get(key);
  if (!r) { r = kind === 'expr' ? parseExpression(src) : parseProgram(src); if (cache.size > 5000) cache.clear(); cache.set(key, r); }
  return r;
}

export class Interp {
  /**
   * @param ctx      the session ctx (may be a mockCtx); used for ctx.call fallback and output
   * @param options  { funcs: user functions, persist: Map for persistent variables, out(text) }
   */
  constructor(ctx, options = {}) {
    this.ctx = ctx;
    this.funcs = options.funcs || {};
    this.persist = options.persist || new Map();
    this.extraFns = options.fns || {};
    this.out = options.out || ((s) => ctx && ctx.out && ctx.out(s));
    this.depth = 0;
  }
  evalExpr(src, scope) { return this.expr(parseCached(src, 'expr'), scope, 1)[0]; }
  run(src, scope) {
    const prog = parseCached(src, 'prog');
    Object.assign(this.funcs, prog.funcs);
    try { this.block(prog.body, scope); } catch (e) { if (!(e instanceof Ctl)) throw e; }
  }
  /** Calls a user function defined in a program text (M Function blocks). */
  callUser(name, args, nargout) {
    const f = this.funcs[name];
    if (!f) throw new MError('sim:expr:undefined', `Undefined function '${name}'.`);
    return this.invoke(f, args, nargout);
  }
  invoke(f, args, nargout) {
    if (++this.depth > 200) { this.depth = 0; throw new MError('sim:expr:recursion', 'Maximum recursion depth reached.'); }
    const scope = new Scope(null, null);
    scope.fn = f;
    f.params.forEach((p, i) => { if (p === 'varargin') scope.set('varargin', cell([1, Math.max(0, args.length - i)], args.slice(i))); else if (i < args.length && p !== '~') scope.set(p, args[i]); });
    scope.set('\u0000nargin', num(args.length));
    scope.set('\u0000nargout', num(nargout));
    try { this.block(f.body, scope); } catch (e) { if (e !== RETURN) { this.depth--; throw e; } }
    this.depth--;
    const outs = [];
    for (let i = 0; i < Math.max(1, nargout); i++) {
      const o = f.outs[i];
      if (!o) break;
      if (o === 'varargout') { const vo = scope.local('varargout'); if (vo) outs.push(...vo.data); continue; }
      const v = scope.local(o);
      if (v === undefined) { if (i < nargout || i === 0) { if (i === 0 && nargout === 0) break; throw new MError('sim:expr:outputNotSet', `Output argument '${o}' is not assigned in '${f.name}'.`); } break; }
      outs.push(v);
    }
    return outs;
  }

  block(stmts, scope) { for (const s of stmts) this.stmt(s, scope); }
  stmt(s, scope) {
    switch (s.type) {
      case 'Expr': {
        const e = s.e;
        if (e.type === 'Id' && scope.get(e.name) === undefined) { const r = this.callName(e.name, [], 0, scope); if (r.length && s.print) this.show('ans', r[0]); if (r.length) scope.set('ans', r[0]); return; }
        const r = this.expr(e, scope, e.type === 'Index' || e.type === 'Id' ? 0 : 1);
        if (r.length) { if (!(e.type === 'Id')) scope.set('ans', r[0]); if (s.print) this.show(e.type === 'Id' ? e.name : 'ans', r[0]); }
        return;
      }
      case 'Assign': {
        if (s.lhs.length === 1) {
          const v = this.expr(s.rhs, scope, 1)[0];
          if (v === undefined) throw new MError('sim:expr:noValue', 'The expression does not return a value.');
          this.assign(s.lhs[0], v, scope);
          if (s.print) this.show(rootName(s.lhs[0]), scope.get(rootName(s.lhs[0])));
        } else {
          const vals = this.expr(s.rhs, scope, s.lhs.length);
          s.lhs.forEach((l, i) => { if (l.type === 'Tilde') return; if (vals[i] === undefined) throw new MError('sim:expr:tooManyOutputs', 'Too many output arguments.'); this.assign(l, vals[i], scope); });
        }
        return;
      }
      case 'If': {
        for (const c of s.clauses) if (op.truthy(this.value(c.cond, scope))) { this.block(c.body, scope); return; }
        if (s.els) this.block(s.els, scope);
        return;
      }
      case 'For': {
        const r = this.value(s.e, scope);
        const cols = r.dims ? (prod(r.dims) === 0 ? 0 : r.dims.slice(1).reduce((a, b) => a * b, 1)) : 1;
        const m = r.dims ? r.dims[0] : 1;
        for (let j = 0; j < cols; j++) {
          let v;
          if (isTensor(r)) { v = m === 1 ? tensor(r.cls, [1, 1], [r.re[j]], r.im ? [r.im[j]] : null) : tensor(r.cls, [m, 1], r.re.slice(j * m, j * m + m)); }
          else if (isCell(r)) v = cell([m, 1], r.data.slice(j * m, j * m + m));
          else v = r;
          scope.set(s.var, v);
          if (this.ctx && this.ctx.checkInterrupt) this.ctx.checkInterrupt();
          try { this.block(s.body, scope); } catch (e) { if (e === BREAK) break; if (e === CONTINUE) continue; throw e; }
        }
        return;
      }
      case 'While': {
        let guard = 0;
        while (op.truthy(this.value(s.cond, scope))) {
          if (++guard % 1000 === 0 && this.ctx && this.ctx.checkInterrupt) this.ctx.checkInterrupt();
          try { this.block(s.body, scope); } catch (e) { if (e === BREAK) break; if (e === CONTINUE) continue; throw e; }
        }
        return;
      }
      case 'Switch': {
        const v = this.value(s.e, scope);
        for (const c of s.cases) {
          const cv = this.value(c.v, scope);
          const cands = isCell(cv) ? cv.data : [cv];
          if (cands.some((x) => switchMatch(v, x))) { this.block(c.body, scope); return; }
        }
        if (s.otherwise) this.block(s.otherwise, scope);
        return;
      }
      case 'Try': {
        try { this.block(s.body, scope); } catch (e) {
          if (e instanceof Ctl) throw e;
          if (s.id) scope.set(s.id, struct([1, 1], ['message', 'identifier'], [Object.assign(Object.create(null), { message: str(e.message || ''), identifier: str(e.identifier || '') })]));
          this.block(s.handler, scope);
        }
        return;
      }
      case 'Break': throw BREAK;
      case 'Continue': throw CONTINUE;
      case 'Return': throw RETURN;
      case 'Persistent': {
        const key = scope.fn ? scope.fn.name : '';
        for (const n of s.names) {
          const k = key + '/' + n;
          if (!this.persist.has(k)) this.persist.set(k, { v: tensor('double', [0, 0]) });
          scope.persistent = scope.persistent || new Map();
          scope.persistent.set(n, this.persist.get(k));
          scope.set(n, this.persist.get(k).v);
        }
        return;
      }
      case 'Global': {
        for (const n of s.names) { const v = this.ctx && this.ctx.getVar ? safe(() => this.ctx.getVar(n, 'global')) : undefined; scope.set(n, v || tensor('double', [0, 0])); (scope.globals = scope.globals || new Set()).add(n); }
        return;
      }
      case 'Function': this.funcs[s.name] = s; return;
      default: throw new MError('sim:expr:internal', `Unknown statement ${s.type}`);
    }
  }
  show(name, v) {
    if (!v) return;
    let text;
    try { text = this.ctx && this.ctx.call ? null : null; } catch { text = null; }
    text = `${name} = ${displayText(v)}\n`;
    this.out(text);
  }

  assign(lhs, v, scope) {
    const name = rootName(lhs);
    const nv = this.assignInto(lhs, v, scope);
    scope.set(name, nv);
    if (scope.persistent && scope.persistent.has(name)) scope.persistent.get(name).v = nv;
    if (scope.onAssign) scope.onAssign(name, nv);
  }
  assignInto(lhs, v, scope) {
    if (lhs.type === 'Id') return v;
    const base = this.lvalueCurrent(lhs.obj, scope);
    let nv;
    if (lhs.type === 'Field' || lhs.type === 'DynField') {
      const fname = lhs.type === 'Field' ? lhs.name : toStr(this.value(lhs.e, scope));
      nv = setField(base, fname, v);
    } else {
      const idx = lhs.args.map((a, k) => this.indexArg(a, scope, base, k, lhs.args.length));
      nv = lhs.kind === '{}' ? cellAssign(base, idx, v) : indexAssign(base, idx, v);
    }
    return this.assignInto(lhs.obj, nv, scope);
  }
  lvalueCurrent(node, scope) {
    if (node.type === 'Id') { const v = scope.get(node.name); return v === undefined ? null : v; }
    const base = this.lvalueCurrent(node.obj, scope);
    if (base == null) return null;
    if (node.type === 'Field' || node.type === 'DynField') {
      const f = node.type === 'Field' ? node.name : toStr(this.value(node.e, scope));
      if (isStruct(base) && base.fields.includes(f)) return base.data[0][f];
      return null;
    }
    const idx = node.args.map((a, k) => this.indexArg(a, scope, base, k, node.args.length));
    try { return node.kind === '{}' ? cellIndex(base, idx)[0] : index(base, idx); } catch { return null; }
  }

  value(e, scope) {
    const r = this.expr(e, scope, 1);
    if (!r.length || r[0] === undefined) throw new MError('sim:expr:noValue', 'The expression does not return a value.');
    return r[0];
  }
  expr(e, scope, nargout = 1) {
    switch (e.type) {
      case 'Num': return [num(e.v)];
      case 'Imag': return [tensor('double', [1, 1], [0], [e.v])];
      case 'Str': return [e.dq ? { cls: 'string', dims: [1, 1], data: [e.v] } : str(e.v)];
      case 'Paren': return [this.value(e.e, scope)];
      case 'Id': {
        const v = scope.get(e.name);
        if (v !== undefined) return [v];
        return this.callName(e.name, [], nargout, scope);
      }
      case 'Colon': return [str(':')];
      case 'End': {
        const ctxv = scope.__end;
        if (!ctxv) throw new MError('sim:expr:end', "'end' is only valid inside an index.");
        return [num(ctxv())];
      }
      case 'Bin': return [this.binary(e, scope)];
      case 'Un': {
        const a = this.value(e.a, scope);
        return [e.op === '-' ? op.uminus(a) : op.not(a)];
      }
      case 'Post': return [op.transpose(this.value(e.a, scope), e.op === "'")];
      case 'Range': {
        const a = op.asTensor(this.value(e.a, scope)).re[0];
        const s = e.s ? op.asTensor(this.value(e.s, scope)).re[0] : 1;
        const b = op.asTensor(this.value(e.b, scope)).re[0];
        return [op.range(a, s, b)];
      }
      case 'Matrix': {
        const rows = e.rows.map((r) => r.flatMap((x) => this.expr(x, scope, 1)));
        if (rows.some((r) => r.some((v) => isCell(v)))) return [cellConcat(rows)];
        if (rows.some((r) => r.some((v) => isStruct(v)))) { const all = rows.flat(); return [all.length === 1 ? all[0] : structCat(all)]; }
        if (rows.some((r) => r.some((v) => isString(v)))) { const all = rows.flat(); return [{ cls: 'string', dims: [1, all.length], data: all.map((v) => toStr(v)) }]; }
        return [op.concat(rows)];
      }
      case 'CellLit': {
        const rows = e.rows.map((r) => r.flatMap((x) => this.expr(x, scope, 1)));
        const m = rows.length, n = m ? Math.max(...rows.map((r) => r.length)) : 0;
        if (!m || !n) return [cell([0, 0])];
        const data = new Array(m * n);
        for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) data[i + j * m] = rows[i][j] || tensor('double', [0, 0]);
        return [cell([m, n], data)];
      }
      case 'Anon': return [{ cls: 'function_handle', dims: [1, 1], simAnon: { params: e.params, body: e.body, scope }, text: '@(' + e.params.join(',') + ')' }];
      case 'FuncRef': return [funcHandle(e.name)];
      case 'Field': case 'DynField': {
        const base = this.value(e.obj, scope);
        const f = e.type === 'Field' ? e.name : toStr(this.value(e.e, scope));
        return [getField(base, f, this.ctx)];
      }
      case 'Index': return this.indexExpr(e, scope, nargout);
      default: throw new MError('sim:expr:internal', `Unknown expression ${e.type}`);
    }
  }
  binary(e, scope) {
    if (e.op === '&&' || e.op === '||') {
      const a = op.truthy(this.value(e.a, scope));
      if (e.op === '&&' && !a) return bool(false);
      if (e.op === '||' && a) return bool(true);
      return bool(op.truthy(this.value(e.b, scope)));
    }
    const a = this.value(e.a, scope), b = this.value(e.b, scope);
    if ((a.isObject || b.isObject) && this.ctx) {
      const name = { '+': 'plus', '-': 'minus', '*': 'mtimes', '.*': 'times', '/': 'mrdivide', './': 'rdivide', '^': 'mpower', '.^': 'power', '==': 'eq', '~=': 'ne', '<': 'lt', '>': 'gt', '<=': 'le', '>=': 'ge' }[e.op];
      return this.ctx.call(name, [a, b], 1)[0];
    }
    if (isString(a) || isString(b)) {
      if (e.op === '+') return { cls: 'string', dims: [1, 1], data: [textOf(a) + textOf(b)] };
      if (e.op === '==') return bool(textOf(a) === textOf(b));
      if (e.op === '~=') return bool(textOf(a) !== textOf(b));
    }
    switch (e.op) {
      case '+': return op.plus(a, b);
      case '-': return op.minus(a, b);
      case '*': return op.mtimes(a, b);
      case '.*': return op.times(a, b);
      case '/': return op.mrdivide(a, b);
      case './': return op.rdivide(a, b);
      case '\\': return op.mldivide(a, b);
      case '.\\': return op.ldivide(a, b);
      case '^': return op.mpower(a, b);
      case '.^': return op.power(a, b);
      case '==': return op.eq(a, b);
      case '~=': return op.ne(a, b);
      case '<': return op.lt(a, b);
      case '<=': return op.le(a, b);
      case '>': return op.gt(a, b);
      case '>=': return op.ge(a, b);
      case '&': return op.and(a, b);
      case '|': return op.or(a, b);
      default: throw new MError('sim:expr:internal', `Unknown operator ${e.op}`);
    }
  }
  indexArg(a, scope, base, k, n) {
    if (a.type === 'Colon') return ':';
    const prevEnd = scope.__end;
    scope.__end = () => {
      if (base == null) return 0;
      const d = base.dims || [1, 1];
      if (n === 1) return prod(d);
      if (k === n - 1) return d.slice(k).reduce((x, y) => x * y, 1);
      return d[k] ?? 1;
    };
    try { return this.value(a, scope); } finally { scope.__end = prevEnd; }
  }
  indexExpr(e, scope, nargout) {
    // function call or indexing
    if (e.obj.type === 'Id') {
      const v = scope.get(e.obj.name);
      if (v === undefined) {
        const args = e.args.flatMap((a) => (a.type === 'Colon' ? [str(':')] : this.expr(a, scope, 1)));
        return this.callName(e.obj.name, args, nargout, scope);
      }
      if (isFuncHandle(v) && e.kind === '()') {
        const args = e.args.flatMap((a) => this.expr(a, scope, 1));
        return this.callHandle(v, args, nargout);
      }
    }
    if (e.obj.type === 'Field' && e.obj.obj.type === 'Id' && scope.get(e.obj.obj.name) === undefined) {
      // package function like pkg.fn(x)
      const name = e.obj.obj.name + '.' + e.obj.name;
      const args = e.args.flatMap((a) => this.expr(a, scope, 1));
      return this.callName(name, args, nargout, scope);
    }
    const base = this.value(e.obj, scope);
    if (base.isObject && this.ctx) {
      const idx = e.args.map((a, k) => this.indexArg(a, scope, base, k, e.args.length)).map((x) => (x === ':' ? str(':') : x));
      return this.ctx.call('subsref', [base, struct([1, 1], ['type', 'subs'], [Object.assign(Object.create(null), { type: str(e.kind), subs: cell([1, idx.length], idx) })])], nargout);
    }
    const idx = e.args.map((a, k) => this.indexArg(a, scope, base, k, e.args.length));
    if (e.kind === '{}') return cellIndex(base, idx);
    if (isFuncHandle(base)) return this.callHandle(base, idx, nargout);
    return [index(base, idx)];
  }
  callHandle(h, args, nargout) {
    if (h.simAnon) {
      const s = new Scope(null, h.simAnon.scope);
      h.simAnon.params.forEach((p, i) => s.set(p, args[i]));
      return this.expr(h.simAnon.body, s, nargout);
    }
    if (h.name && !h.params) return this.callName(h.name, args, nargout, null);
    return this.ctx.call(h, args, nargout);
  }
  callName(name, args, nargout, scope) {
    if (name === 'nargin' && scope) return [scope.get('\u0000nargin') || num(0)];
    if (name === 'nargout' && scope) return [scope.get('\u0000nargout') || num(0)];
    if (this.funcs[name]) return this.invoke(this.funcs[name], args, nargout);
    if (this.extraFns[name]) { const r = this.extraFns[name](args, nargout, this, scope); return Array.isArray(r) ? r : r === undefined ? [] : [r]; }
    const lib = LIB[name];
    if (lib) {
      const r = lib(args, nargout, this, scope);
      if (r !== NOT_LOCAL) return Array.isArray(r) ? r : r === undefined ? [] : [r];
    }
    if (this.ctx && typeof this.ctx.call === 'function') {
      try { return this.ctx.call(name, args, nargout); } catch (err) {
        if (err && /undefined|Undefined/.test(err.message || '') && /test:undefined|undefined/i.test(err.identifier || '')) throw new MError('sim:expr:undefined', `Unrecognized function or variable '${name}'.`);
        throw err;
      }
    }
    throw new MError('sim:expr:undefined', `Unrecognized function or variable '${name}'.`);
  }
}
export const NOT_LOCAL = Symbol('notLocal');

function safe(f) { try { return f(); } catch { return undefined; } }
function rootName(l) { return l.type === 'Id' ? l.name : rootName(l.obj); }
function textOf(v) { return isString(v) ? (v.data[0] ?? '') : isChar(v) ? toStr(v) : displayText(v); }
function switchMatch(v, c) {
  if ((isChar(v) || isString(v)) && (isChar(c) || isString(c))) return toStr(v) === toStr(c);
  if (isTensor(v) && isTensor(c) && !isChar(v) && !isChar(c)) return v.re.length > 0 && c.re.length > 0 && v.re[0] === c.re[0];
  return false;
}

export function displayText(v) {
  if (isChar(v)) return `'${toStr(v)}'`;
  if (isString(v)) return `"${v.data.join('" "')}"`;
  if (isTensor(v)) {
    if (prod(v.dims) === 1) return fmt(v.re[0], v.im && v.im[0]);
    if (prod(v.dims) === 0) return '[]';
    const [m, n] = v.dims; const rows = [];
    for (let i = 0; i < m; i++) { const r = []; for (let j = 0; j < n; j++) r.push(fmt(v.re[i + j * m], v.im && v.im[i + j * m])); rows.push(r.join(' ')); }
    return '[' + rows.join('; ') + ']';
  }
  if (isStruct(v)) return 'struct with fields ' + v.fields.join(', ');
  if (isCell(v)) return `{${v.dims.join('x')} cell}`;
  return `<${v.cls}>`;
}
function fmt(x, im) {
  const f = (y) => (Number.isInteger(y) ? String(y) : Number(y.toPrecision(6)).toString());
  if (im) return `${f(x)}${im < 0 ? '-' : '+'}${f(Math.abs(im))}i`;
  return f(x);
}

// --------------------------------------------------------------- indexing helpers

function toIndexList(ix, extent) {
  if (ix === ':') { const a = new Array(extent); for (let i = 0; i < extent; i++) a[i] = i; return a; }
  const t = op.asTensor(ix);
  if (t.cls === 'logical') { const a = []; for (let i = 0; i < t.re.length; i++) if (t.re[i]) a.push(i); return a; }
  const a = new Array(t.re.length);
  for (let i = 0; i < t.re.length; i++) {
    const k = t.re[i];
    if (!(k >= 1) || !Number.isInteger(k)) throw new MError('sim:expr:badIndex', `Index must be a positive integer or logical (got ${k}).`);
    a[i] = k - 1;
  }
  return a;
}
function idxShape(ix, list) {
  if (ix === ':') return null;
  const t = op.asTensor(ix);
  return t.cls === 'logical' ? null : t.dims;
}
export function index(base, idx) {
  if (isStruct(base) || isCell(base)) {
    const d = base.dims;
    const lists = linearize(d, idx);
    const data = lists.map((k) => { if (k >= base.data.length) throw new MError('sim:expr:outOfRange', 'Index exceeds array bounds.'); return base.data[k]; });
    const dims = outShape(d, idx, lists.length);
    return isCell(base) ? cell(dims, data) : struct(dims, base.fields, data);
  }
  if (isString(base)) { const lists = linearize(base.dims, idx); return { cls: 'string', dims: outShape(base.dims, idx, lists.length), data: lists.map((k) => base.data[k]) }; }
  const t = op.asTensor(base);
  if (idx.length === 0) return t;
  const lists = linearize(t.dims, idx);
  const n = t.re.length;
  const re = new Float64Array(lists.length), im = t.im ? new Float64Array(lists.length) : null;
  for (let i = 0; i < lists.length; i++) {
    const k = lists[i];
    if (k >= n) throw new MError('sim:expr:outOfRange', `Index exceeds the number of array elements (${n}).`);
    re[i] = t.re[k]; if (im) im[i] = t.im[k];
  }
  return tensor(t.cls, outShape(t.dims, idx, lists.length), re, im);
}
function linearize(d, idx) {
  if (idx.length === 1) return toIndexList(idx[0], prod(d));
  const dd = d.slice(); while (dd.length < idx.length) dd.push(1);
  const ext = idx.map((_, k) => (k === idx.length - 1 ? dd.slice(k).reduce((a, b) => a * b, 1) : dd[k]));
  const lists = idx.map((ix, k) => toIndexList(ix, ext[k]));
  lists.forEach((l, k) => { for (const x of l) if (x >= ext[k]) throw new MError('sim:expr:outOfRange', `Index in position ${k + 1} exceeds array bounds (${ext[k]}).`); });
  const out = [];
  const strides = []; let s = 1; for (let k = 0; k < ext.length; k++) { strides.push(s); s *= ext[k]; }
  const rec = (k, off) => { if (k < 0) { out.push(off); return; } for (const x of lists[k]) rec(k - 1, off + x * strides[k]); };
  // column-major: first index varies fastest
  const recCM = (k, offs) => {
    if (k === lists.length) { out.push(...offs); return; }
  };
  void rec; void recCM;
  const counts = lists.map((l) => l.length);
  const total = counts.reduce((a, b) => a * b, 1);
  const sub = new Array(lists.length).fill(0);
  for (let c = 0; c < total; c++) {
    let off = 0; for (let k = 0; k < lists.length; k++) off += lists[k][sub[k]] * strides[k];
    out.push(off);
    for (let k = 0; k < lists.length; k++) { sub[k]++; if (sub[k] < counts[k]) break; sub[k] = 0; }
  }
  return out;
}
function outShape(d, idx, n) {
  if (idx.length === 1) {
    const ix = idx[0];
    if (ix === ':') return [n, 1];
    const s = idxShape(ix);
    const isVecBase = d.length === 2 && (d[0] === 1 || d[1] === 1);
    if (s && isVecBase && s.length === 2 && (s[0] === 1 || s[1] === 1)) return d[0] === 1 ? [1, n] : [n, 1];
    if (s) return s;
    return d[0] === 1 && d.length === 2 ? [1, n] : [n, 1];
  }
  const dd = d.slice(); while (dd.length < idx.length) dd.push(1);
  return idx.map((ix, k) => (ix === ':' ? (k === idx.length - 1 ? dd.slice(k).reduce((a, b) => a * b, 1) : dd[k]) : toIndexList(ix, 1e15).length));
}

export function indexAssign(base, idx, v) {
  if (base == null) base = isCell(v) ? cell([0, 0]) : isStruct(v) ? struct([0, 0], v.fields, []) : tensor(v.cls === 'logical' || v.cls === 'char' ? v.cls : (v.cls in INT_RANGE ? v.cls : 'double'), [0, 0]);
  if (isCell(base)) {
    const vals = isCell(v) ? v.data : [v];
    return genericAssign(base, idx, vals, (d, data) => cell(d, data), () => tensor('double', [0, 0]));
  }
  if (isStruct(base)) {
    const vals = isStruct(v) ? v.data : null;
    if (!vals) throw new MError('sim:expr:assign', 'Cannot assign a non-struct value into a struct array.');
    const fields = Array.from(new Set([...base.fields, ...v.fields]));
    return genericAssign(base, idx, vals, (d, data) => struct(d, fields, data.map((r) => { const o = Object.create(null); for (const f of fields) o[f] = (r && r[f]) || tensor('double', [0, 0]); return o; })), () => null);
  }
  let t = op.asTensor(base);
  let vt = op.asTensor(v);
  if (t.cls !== vt.cls && prod(t.dims) === 0) t = tensor(vt.cls, t.dims);
  if (prod(vt.dims) === 0 && !(idx.length === 1 && idx[0] === ':')) {
    // deletion a(i) = []
    return deleteElems(t, idx);
  }
  const d = t.dims.slice();
  const lists = growForAssign(d, idx);
  const nd = lists.newDims;
  let re = t.re, im = t.im;
  if (nd.some((x, k) => x !== (d[k] ?? 1)) || nd.length !== d.length) {
    const n2 = prod(nd); const r2 = new Float64Array(n2); const i2 = im ? new Float64Array(n2) : null;
    // copy old into new
    const od = d.slice(); while (od.length < nd.length) od.push(1);
    const n1 = prod(od);
    for (let k = 0; k < n1; k++) {
      let rem = k, off = 0, mul = 1;
      for (let q = 0; q < od.length; q++) { const s = rem % od[q]; rem = Math.floor(rem / od[q]); off += s * mul; mul *= nd[q]; }
      r2[off] = re[k]; if (i2) i2[off] = im[k];
    }
    re = r2; im = i2;
  } else { re = re.slice(); im = im ? im.slice() : null; }
  const offs = lists.offsets;
  if (vt.re.length !== 1 && vt.re.length !== offs.length) throw new MError('sim:expr:assignSize', `Unable to perform assignment: left side has ${offs.length} elements and right side has ${vt.re.length}.`);
  if (vt.im && !im) im = new Float64Array(re.length);
  const cls = t.cls;
  for (let k = 0; k < offs.length; k++) {
    const src = vt.re.length === 1 ? 0 : k;
    re[offs[k]] = cls === 'double' ? vt.re[src] : cast(tensor('double', [1, 1], [vt.re[src]]), cls).re[0];
    if (im) im[offs[k]] = vt.im ? vt.im[src] : 0;
  }
  return tensor(cls, nd, re, im && im.some((x) => x) ? im : null);
}
function growForAssign(d, idx) {
  if (idx.length === 1) {
    const n = prod(d);
    const list = toIndexList(idx[0], n);
    const mx = list.length ? Math.max(...list) + 1 : 0;
    let nd = d.slice();
    if (mx > n) {
      if (n === 0) nd = [1, mx];
      else if (d[0] === 1 && d.length === 2) nd = [1, mx];
      else if (d[1] === 1 && d.length === 2) nd = [mx, 1];
      else throw new MError('sim:expr:assignGrow', 'Attempt to grow array along ambiguous dimension.');
    }
    return { newDims: nd, offsets: list };
  }
  const dd = d.slice(); while (dd.length < idx.length) dd.push(1);
  const lists = idx.map((ix, k) => toIndexList(ix, dd[k]));
  const nd = dd.map((x, k) => Math.max(x, lists[k] && lists[k].length ? Math.max(...lists[k]) + 1 : 0));
  idx.forEach((ix, k) => { if (ix === ':' && dd[k] === 0) { nd[k] = 1; lists[k] = [0]; } });
  const strides = []; let s = 1; for (let k = 0; k < nd.length; k++) { strides.push(s); s *= nd[k]; }
  const offsets = [];
  const counts = lists.map((l) => l.length); const total = counts.reduce((a, b) => a * b, 1);
  const sub = new Array(lists.length).fill(0);
  for (let c = 0; c < total; c++) { let off = 0; for (let k = 0; k < lists.length; k++) off += lists[k][sub[k]] * strides[k]; offsets.push(off); for (let k = 0; k < lists.length; k++) { sub[k]++; if (sub[k] < counts[k]) break; sub[k] = 0; } }
  return { newDims: nd.length > 2 ? nd : nd, offsets };
}
function deleteElems(t, idx) {
  if (idx.length === 1) {
    const del = new Set(toIndexList(idx[0], t.re.length));
    const keep = []; for (let i = 0; i < t.re.length; i++) if (!del.has(i)) keep.push(i);
    const re = Float64Array.from(keep.map((i) => t.re[i]));
    return tensor(t.cls, t.dims[0] === 1 ? [1, keep.length] : [keep.length, 1], re, t.im ? Float64Array.from(keep.map((i) => t.im[i])) : null);
  }
  const [m, n] = t.dims;
  if (idx[0] === ':') {
    const del = new Set(toIndexList(idx[1], n)); const cols = []; for (let j = 0; j < n; j++) if (!del.has(j)) cols.push(j);
    const re = new Float64Array(m * cols.length); cols.forEach((j, c) => { for (let i = 0; i < m; i++) re[i + c * m] = t.re[i + j * m]; });
    return tensor(t.cls, [m, cols.length], re);
  }
  const del = new Set(toIndexList(idx[0], m)); const rows = []; for (let i = 0; i < m; i++) if (!del.has(i)) rows.push(i);
  const re = new Float64Array(rows.length * n); for (let j = 0; j < n; j++) rows.forEach((i, r) => { re[r + j * rows.length] = t.re[i + j * m]; });
  return tensor(t.cls, [rows.length, n], re);
}
function genericAssign(base, idx, vals, make, fill) {
  const d = base.dims.slice();
  const g = growForAssign(d, idx);
  const nd = g.newDims; const n2 = prod(nd);
  const data = new Array(n2).fill(null).map(() => fill());
  const od = d.slice(); while (od.length < nd.length) od.push(1);
  for (let k = 0; k < base.data.length; k++) {
    let rem = k, off = 0, mul = 1;
    for (let q = 0; q < od.length; q++) { const s = rem % od[q]; rem = Math.floor(rem / od[q]); off += s * mul; mul *= nd[q]; }
    data[off] = base.data[k];
  }
  g.offsets.forEach((o, k) => { data[o] = vals.length === 1 ? vals[0] : vals[k]; });
  return make(nd, data);
}
export function cellIndex(base, idx) {
  if (!isCell(base)) throw new MError('sim:expr:brace', 'Brace indexing is not supported for this type of variable.');
  const lists = linearize(base.dims, idx);
  return lists.map((k) => { if (k >= base.data.length) throw new MError('sim:expr:outOfRange', 'Index exceeds array bounds.'); return base.data[k]; });
}
function cellAssign(base, idx, v) {
  if (base == null) base = cell([0, 0]);
  if (!isCell(base)) throw new MError('sim:expr:brace', 'Brace assignment needs a cell array.');
  return genericAssign(base, idx, [v], (d, data) => cell(d, data), () => tensor('double', [0, 0]));
}
function cellConcat(rows) {
  const rr = rows.map((r) => r.map((v) => (isCell(v) ? v : cell([1, 1], [v]))));
  const hrows = rr.map((r) => { const m = r[0].dims[0]; const data = []; let n = 0; for (const c of r) { data.push(...c.data); n += c.dims[1]; } return cell([m, n], data); });
  if (hrows.length === 1) return hrows[0];
  const n = hrows[0].dims[1]; let m = 0; for (const h of hrows) m += h.dims[0];
  const data = new Array(m * n); let r0 = 0;
  for (const h of hrows) { const mh = h.dims[0]; for (let j = 0; j < n; j++) for (let i = 0; i < mh; i++) data[r0 + i + j * m] = h.data[i + j * mh]; r0 += mh; }
  return cell([m, n], data);
}
function structCat(items) {
  const fields = items[0].fields;
  return struct([1, items.length], fields, items.flatMap((s) => s.data));
}
export function getField(base, f, ctx) {
  if (isStruct(base)) {
    if (!base.fields.includes(f)) throw new MError('sim:expr:noField', `Unrecognized field name "${f}".`);
    if (base.data.length !== 1) { const vals = base.data.map((r) => r[f]); return vals[0]; }
    return base.data[0][f];
  }
  if (base && base.isObject) {
    if (base.props && f in base.props) return base.props[f];
    if (ctx) return ctx.call('subsref', [base, struct([1, 1], ['type', 'subs'], [Object.assign(Object.create(null), { type: str('.'), subs: str(f) })])], 1)[0];
  }
  if (base && base.cls === 'bus') { if (!(f in base.fields)) throw new MError('sim:expr:noField', `Bus has no element "${f}".`); return base.fields[f]; }
  throw new MError('sim:expr:dot', 'Dot indexing is not supported for variables of this type.');
}
function setField(base, f, v) {
  if (base == null || (isTensor(base) && prod(base.dims) === 0)) return struct([1, 1], [f], [Object.assign(Object.create(null), { [f]: v })]);
  if (isStruct(base)) {
    const fields = base.fields.includes(f) ? base.fields : [...base.fields, f];
    const data = base.data.map((r, i) => { const o = Object.create(null); for (const k of fields) o[k] = k === f && i === 0 ? v : (r[k] || tensor('double', [0, 0])); return o; });
    return struct(base.dims, fields, data);
  }
  if (base && base.cls === 'bus') return { ...base, fields: { ...base.fields, [f]: v } };
  if (base && base.isObject) return { ...base, props: { ...base.props, [f]: v } };
  throw new MError('sim:expr:dotAssign', 'Field assignment to a non-struct variable is not allowed.');
}
export { empty };
