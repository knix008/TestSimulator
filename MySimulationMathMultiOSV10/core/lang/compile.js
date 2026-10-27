// Compiles the AST into JS closures. Each expression becomes an object
//   { ev(f) → Value, cs(f) → Value[] (comma-separated list), mv(f, nout) → Value[] }
// and each statement a function (f) → status (0 normal, 1 break, 2 continue, 3 return).
// `f` is the running Frame (see interp.js); variables live in f.ws.vars.
import { MError, tensor, str, string, complex, num } from '../value.js';
import { COLON, disown, OWNED } from './indexing.js';
import { BINOP_NAMES, UNOP_NAMES, POSTOP_NAMES, dnum, lnum, rangeCount } from './ops.js';
import { buildMatrix, buildCell } from './concat.js';
import { unparse } from './unparse.js';

export const S_NORMAL = 0, S_BREAK = 1, S_CONTINUE = 2, S_RETURN = 3;

/** Names that the function treats as variables (params, outputs, assignment targets). */
export function collectVarNames(fn) {
  const names = new Set();
  for (const p of fn.params || []) if (p !== '~') names.add(p);
  for (const o of fn.outs || []) if (o !== '~') names.add(o);
  for (const blk of fn.args || []) for (const it of blk.items) names.add(it.name);
  const walk = (stmts) => {
    for (const s of stmts) {
      switch (s.t) {
        case 'assign': names.add(s.lhs.name); break;
        case 'massign': for (const l of s.lhs) if (l.t === 'lv') names.add(l.name); break;
        case 'for': names.add(s.lv.name); walk(s.body); break;
        case 'while': walk(s.body); break;
        case 'if': for (const c of s.clauses) walk(c.body); if (s.else) walk(s.else); break;
        case 'switch': for (const c of s.cases) walk(c.body); if (s.otherwise) walk(s.otherwise); break;
        case 'try': walk(s.body); if (s.id) names.add(s.id); walk(s.cbody); break;
        case 'global': case 'persistent': for (const n of s.names) names.add(n); break;
        case 'block': walk(s.body); break;
        default: break;
      }
    }
  };
  walk(fn.body || []);
  return names;
}

function usesEnd(node) {
  let found = false;
  const visit = (n) => {
    if (found || !n || typeof n !== 'object') return;
    if (n.t === 'end') { found = true; return; }
    if (n.t === 'anon') return;
    for (const k in n) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach((x) => (Array.isArray(x) ? x.forEach(visit) : visit(x)));
      else if (v && typeof v === 'object' && k !== 'base') visit(v);
    }
  };
  if (Array.isArray(node)) node.forEach(visit); else visit(node);
  return found;
}

/** Free identifiers of an expression (for anonymous function captures). */
export function freeNames(node, bound, out = new Set()) {
  const visit = (n, b) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach((x) => visit(x, b)); return; }
    switch (n.t) {
      case 'id': if (!b.has(n.name)) out.add(n.name); return;
      case 'anon': { const nb = new Set(b); n.params.forEach((p) => nb.add(p)); visit(n.body, nb); return; }
      case 'index': visit(n.base, b); for (const c of n.chain) { if (c.args) visit(c.args, b); if (c.e) visit(c.e, b); } return;
      case 'super': out.add(n.name); visit(n.args, b); return;
      default:
        for (const k in n) { const v = n[k]; if (v && typeof v === 'object') visit(v, b); }
    }
  };
  visit(node, bound);
  return out;
}

export class Compiler {
  /**
   * @param rt interpreter runtime
   * @param scope { fi (FuncInfo or null), depth: Map name → levels up (nested functions) }
   */
  constructor(rt, scope) {
    this.rt = rt;
    this.scope = scope || { fi: null, depth: null };
  }

  // ---------------------------------------------------------------- variables
  varDepth(name) {
    const d = this.scope.depth;
    if (d) { const k = d.get(name); if (k) return k; }
    return 0;
  }
  wsAt(depth) {
    if (depth === 0) return (f) => f.ws;
    return (f) => { let w = f.ws; for (let i = 0; i < depth; i++) w = w.up; return w; };
  }

  /** read access (non-escaping) */
  reader(name) {
    const d = this.varDepth(name);
    if (d === 0) {
      return (f) => {
        const ws = f.ws;
        if (ws.gl !== null) { const s = ws.gl[name]; if (s !== undefined) return s[name]; }
        return ws.vars[name];
      };
    }
    const at = this.wsAt(d);
    return (f) => { const ws = at(f); if (ws.gl !== null) { const s = ws.gl[name]; if (s !== undefined) return s[name]; } return ws.vars[name]; };
  }
  writer(name) {
    const d = this.varDepth(name);
    const at = this.wsAt(d);
    const rt = this.rt;
    return (f, v) => {
      const ws = at(f);
      if (ws.gl !== null) { const s = ws.gl[name]; if (s !== undefined) { s[name] = v; OWNED.delete(v); } }
      ws.vars[name] = v;
      if (rt.watchVars) rt.varsChanged = true;
    };
  }

  // ---------------------------------------------------------------- expressions
  expr(n) {
    const c = this.exprInner(n);
    if (!c.cs) c.cs = (f) => [c.ev(f)];
    if (!c.mv) c.mv = (f) => [c.ev(f)];
    return c;
  }

  exprInner(n) {
    const rt = this.rt;
    switch (n.t) {
      case 'num': {
        let v;
        if (n.imag) v = complex(0, n.v);
        else if (n.cls && n.cls !== 'double') v = tensor(n.cls, [1, 1], [n.v]);
        else v = num(n.v);
        return { ev: () => v, konst: v };
      }
      case 'str': { const v = str(n.v); return { ev: () => v, konst: v }; }
      case 'dstr': { const v = string(n.v); return { ev: () => v, konst: v }; }
      case 'colon': return { ev: () => COLON };
      case 'end': return { ev: () => rt.endValue() };
      case 'paren': { const e = this.expr(n.e); return { ev: e.ev }; }
      case 'id': return this.idExpr(n);
      case 'bin': return this.binExpr(n);
      case 'un': return this.unExpr(n);
      case 'post': {
        const a = this.expr(n.a);
        const name = POSTOP_NAMES[n.op];
        return {
          ev: (f) => {
            const v = a.ev(f);
            if (v.re !== undefined && v.re.length === 1 && v.im === null && v.dims.length === 2 && !v.sparse) return v;
            return rt.op(name, [v]);
          },
        };
      }
      case 'andand': case 'oror': {
        const a = this.expr(n.a), b = this.expr(n.b);
        const isAnd = n.t === 'andand';
        const op = isAnd ? '&&' : '||';
        return {
          ev: (f) => {
            const x = rt.scalarTruth(a.ev(f), op);
            if (isAnd ? !x : x) return lnum(x);
            return lnum(rt.scalarTruth(b.ev(f), op));
          },
        };
      }
      case 'range': return this.rangeExpr(n);
      case 'matrix': return this.matrixExpr(n);
      case 'cellLit': {
        const rows = n.rows.map((r) => r.map((e) => this.expr(e)));
        return { ev: (f) => buildCell(rows.map((r) => { const vals = []; for (const e of r) for (const v of e.cs(f)) vals.push(v); return vals; })) };
      }
      case 'anon': return this.anonExpr(n);
      case 'fh': {
        const name = n.name;
        return { ev: (f) => rt.makeNamedHandle(name, f) };
      }
      case 'meta': return { ev: () => rt.metaclassOf(n.name) };
      case 'index': return this.indexExpr(n);
      case 'super': return this.superExpr(n);
      case 'tilde': throw new MError('core:parse', 'Invalid use of "~" here.');
      default: throw new MError('core:internal', `Cannot compile node ${n.t}`);
    }
  }

  idExpr(n) {
    const rt = this.rt;
    const name = n.name;
    const read = this.reader(name);
    const d = this.varDepth(name);
    const fi = this.scope.fi;
    const call = (f, nout) => rt.callFunction(name, [], nout, f, fi);
    const ev = (f) => {
      const v = read(f);
      if (v !== undefined) { OWNED.delete(v); return v; }
      const r = call(f, 1);
      if (r.length === 0) throw rt.noOutputError(name);
      return r[0];
    };
    return {
      ev,
      evRaw: read, // non-escaping read for operators
      name, depth: d,
      cs: (f) => { const v = read(f); if (v !== undefined) { OWNED.delete(v); return [v]; } return call(f, 1); },
      mv: (f, nout) => { const v = read(f); if (v !== undefined) { OWNED.delete(v); return [v]; } return call(f, nout); },
    };
  }

  binExpr(n) {
    const rt = this.rt;
    const name = BINOP_NAMES[n.op];
    const a = this.expr(n.a), b = this.expr(n.b);
    const ra = a.evRaw || a.ev, rb = b.evRaw || b.ev;
    const aId = a.evRaw ? a.name : null, bId = b.evRaw ? b.name : null;
    const slow = (f, x, y) => {
      if (x === undefined) x = a.ev(f);
      if (y === undefined) y = b.ev(f);
      const r = rt.op(name, [x, y]);
      if (r === x && aId) OWNED.delete(x);
      else if (r === y && bId) OWNED.delete(y);
      return r;
    };
    const rawOrCall = (raw, e) => (f) => { const v = raw(f); return v === undefined ? e.ev(f) : v; };
    const A = a.evRaw ? rawOrCall(ra, a) : a.ev;
    const B = b.evRaw ? rawOrCall(rb, b) : b.ev;
    // fast scalar paths: both operands real double scalars
    const isS = (v) => v.cls === 'double' && v.re.length === 1 && v.im === null && v.dims.length === 2 && v.sparse === undefined;
    let fast;
    switch (n.op) {
      case '+': fast = (x, y) => dnum(x + y); break;
      case '-': fast = (x, y) => dnum(x - y); break;
      case '*': case '.*': fast = (x, y) => dnum(x * y); break;
      case '/': case './': fast = (x, y) => dnum(x / y); break;
      case '\\': case '.\\': fast = (x, y) => dnum(y / x); break;
      case '^': case '.^': fast = (x, y) => ((x < 0 && !Number.isInteger(y)) ? null : dnum(x ** y)); break;
      case '==': fast = (x, y) => lnum(x === y); break;
      case '~=': fast = (x, y) => lnum(x !== y); break;
      case '<': fast = (x, y) => lnum(x < y); break;
      case '<=': fast = (x, y) => lnum(x <= y); break;
      case '>': fast = (x, y) => lnum(x > y); break;
      case '>=': fast = (x, y) => lnum(x >= y); break;
      case '&': fast = (x, y) => (Number.isNaN(x) || Number.isNaN(y) ? null : lnum(x !== 0 && y !== 0)); break;
      case '|': fast = (x, y) => (Number.isNaN(x) || Number.isNaN(y) ? null : lnum(x !== 0 || y !== 0)); break;
      default: fast = null;
    }
    const cmp = n.op === '==' || n.op === '~=' || n.op === '<' || n.op === '<=' || n.op === '>' || n.op === '>=';
    return {
      ev: (f) => {
        const x = A(f), y = B(f);
        if (fast !== null) {
          if (isS(x) && isS(y)) { const r = fast(x.re[0], y.re[0]); if (r !== null) return r; }
          else if (cmp && x.re !== undefined && y.re !== undefined && x.re.length === 1 && y.re.length === 1 && x.im === null && y.im === null
            && x.dims.length === 2 && y.dims.length === 2 && x.sparse === undefined && y.sparse === undefined && !x.isObject && !y.isObject) {
            return fast(x.re[0], y.re[0]);
          }
        }
        return slow(f, x, y);
      },
    };
  }

  unExpr(n) {
    const rt = this.rt;
    const a = this.expr(n.a);
    const name = UNOP_NAMES[n.op];
    const A = a.ev;
    if (n.op === '-') {
      return { ev: (f) => { const x = A(f); if (x.cls === 'double' && x.re.length === 1 && x.im === null && x.dims.length === 2 && x.sparse === undefined) return dnum(-x.re[0]); return rt.op(name, [x]); } };
    }
    if (n.op === '~') {
      return {
        ev: (f) => {
          const x = A(f);
          if ((x.cls === 'double' || x.cls === 'logical') && x.re.length === 1 && x.im === null && x.dims.length === 2 && x.sparse === undefined && !Number.isNaN(x.re[0])) return lnum(x.re[0] === 0);
          return rt.op(name, [x]);
        },
      };
    }
    return { ev: (f) => rt.op(name, [A(f)]) };
  }

  rangeExpr(n) {
    const rt = this.rt;
    const a = this.expr(n.a), b = this.expr(n.b), s = n.step ? this.expr(n.step) : null;
    const scalarD = (v) => v.cls === 'double' && v.re.length === 1 && v.im === null && v.sparse === undefined;
    const ev = (f) => {
      const x = a.ev(f), st = s ? s.ev(f) : null, y = b.ev(f);
      if (scalarD(x) && scalarD(y) && (!st || scalarD(st))) {
        const x0 = x.re[0], d = st ? st.re[0] : 1, x1 = y.re[0];
        const cnt = rangeCount(x0, d, x1);
        const re = new Float64Array(cnt);
        for (let k = 0; k < cnt; k++) re[k] = x0 + k * d;
        return tensor('double', [1, cnt], re);
      }
      return rt.op('colon', st ? [x, st, y] : [x, y]);
    };
    return { ev, range: { a, s, b } };
  }

  matrixExpr(n) {
    const rows = n.rows.map((r) => r.map((e) => this.expr(e)));
    if (rows.length === 0) { const v = tensor('double', [0, 0]); return { ev: () => v }; }
    const rt = this.rt;
    // all-constant numeric literal
    if (rows.every((r) => r.every((e) => e.konst && e.konst.cls === 'double' && !e.konst.im))) {
      const allScalar = rows.every((r) => r.every((e) => e.konst.re.length === 1)) && rows.every((r) => r.length === rows[0].length);
      if (allScalar) {
        const m = rows.length, c = rows[0].length;
        const re = new Float64Array(m * c);
        for (let i = 0; i < m; i++) for (let j = 0; j < c; j++) re[i + j * m] = rows[i][j].konst.re[0];
        const v = tensor('double', [m, c], re);
        return { ev: () => v };
      }
    }
    return {
      ev: (f) => {
        const vals = rows.map((r) => { const out = []; for (const e of r) { const l = e.cs(f); for (const v of l) out.push(v); } return out; });
        return rt.concat(vals);
      },
    };
  }

  anonExpr(n) {
    const rt = this.rt;
    const params = n.params;
    const bound = new Set(params);
    const free = [...freeNames(n.body, bound)];
    const text = '@(' + params.join(',') + ')' + unparse(n.body);
    const sub = new Compiler(rt, { fi: this.scope.fi, depth: null, anon: true });
    let body = null;
    const getBody = () => body || (body = sub.expr(n.body));
    const readers = free.map((nm) => [nm, this.reader(nm)]);
    const fi = this.scope.fi;
    return {
      ev: (f) => {
        const closure = Object.create(null);
        for (const [nm, rd] of readers) { const v = rd(f); if (v !== undefined) { OWNED.delete(v); closure[nm] = v; } }
        return { cls: 'function_handle', dims: [1, 1], params, closure, text, body: getBody, fi, anon: true };
      },
    };
  }

  superExpr(n) {
    const rt = this.rt;
    const args = n.args.map((a) => this.expr(a));
    const read = this.reader(n.name);
    const fi = this.scope.fi;
    const call = (f, nout) => {
      const vals = [];
      for (const a of args) for (const v of a.cs(f)) vals.push(v);
      return rt.callSuper(n.name, n.sup, vals, nout, f, fi, read(f));
    };
    return { ev: (f) => { const r = call(f, 1); if (!r.length) throw rt.noOutputError(n.sup); return r[0]; }, cs: (f) => call(f, 1), mv: call, superName: n.name };
  }

  // ---------------------------------------------------------------- indexing
  compileChain(chain) {
    return chain.map((c) => {
      if (c.k === '.') return { k: '.', name: c.name };
      if (c.k === '.()') return { k: '.()', e: this.expr(c.e) };
      const args = c.args.map((a) => this.expr(a));
      return { k: c.k, args, end: usesEnd(c.args), argNames: c.args.map((a) => (a.t === 'id' ? a.name : '')), simple:args.length === 1 && !c.args.some((a) => a.t === 'index' && a.chain.some((x) => x.k === '{}' || x.k === '.')) };
    });
  }

  indexExpr(n) {
    const rt = this.rt;
    const steps = this.compileChain(n.chain);
    const fi = this.scope.fi;
    if (n.base.t === 'id') {
      const name = n.base.name;
      const read = this.reader(name);
      // fast path x(i) with x a variable and a single scalar argument
      const one = steps.length === 1 && steps[0].k === '()' && steps[0].args.length === 1 && !steps[0].end ? steps[0].args[0] : null;
      const run = (f, nout) => {
        const v = read(f);
        if (v !== undefined) return rt.applyChain(v, steps, 0, f, nout);
        return rt.callChain(name, steps, f, nout, fi);
      };
      const ev = one
        ? (f) => {
          const v = read(f);
          if (v !== undefined && v.re !== undefined && v.sparse === undefined) {
            const i = one.ev(f);
            if (i.cls === 'double' && i.re.length === 1 && i.im === null) {
              const x = i.re[0];
              if (x >= 1 && x <= v.re.length && x === Math.floor(x)) {
                if (v.im === null || v.im[x - 1] === 0) { const re = new Float64Array(1); re[0] = v.re[x - 1]; return { cls: v.cls, dims: [1, 1], re, im: null }; }
              }
            }
            const r = rt.applyChainArgs(v, steps, f, 1, [i]);
            if (!r.length) throw rt.noOutputError(name);
            return r[0];
          }
          const r = run(f, 1);
          if (r.length === 0) throw rt.noOutputError(name);
          return r[0];
        }
        : (f) => {
          const r = run(f, 1);
          if (r.length === 0) throw rt.noOutputError(name);
          return r[0];
        };
      return { ev, cs: (f) => run(f, -1), mv: (f, nout) => run(f, nout), isCall: true, name };
    }
    const base = this.expr(n.base);
    const run = (f, nout) => rt.applyChain(base.ev(f), steps, 0, f, nout);
    return {
      ev: (f) => { const r = run(f, 1); if (!r.length) throw new MError('core:noOutput', 'Indexing produced no value.'); return r[0]; },
      cs: (f) => run(f, -1),
      mv: run,
    };
  }

  // ---------------------------------------------------------------- statements
  block(stmts) {
    const fns = stmts.map((s) => this.stmt(s));
    const n = fns.length;
    if (n === 0) return () => S_NORMAL;
    if (n === 1) return fns[0];
    return (f) => {
      for (let i = 0; i < n; i++) { const r = fns[i](f); if (r !== S_NORMAL) return r; }
      return S_NORMAL;
    };
  }

  stmt(s) {
    const inner = this.stmtInner(s);
    const rt = this.rt;
    const line = s.line;
    return (f) => {
      f.line = line;
      if (rt.dbgOn) rt.debugHook(f, line);
      return inner(f);
    };
  }

  stmtInner(s) {
    const rt = this.rt;
    switch (s.t) {
      case 'expr': return this.exprStmt(s);
      case 'assign': return this.assignStmt(s);
      case 'massign': return this.massignStmt(s);
      case 'cmd': {
        const args = s.args.map((a) => str(a));
        const name = s.name;
        const fi = this.scope.fi;
        const print = s.print;
        return (f) => {
          const r = rt.callFunction(name, args, 0, f, fi);
          if (r.length && r[0] !== undefined) { rt.setAns(f, r[0]); if (print) rt.display('ans', r[0], f); }
          return S_NORMAL;
        };
      }
      case 'shell': return (f) => { rt.shell(s.text, f); return S_NORMAL; };
      case 'if': return this.ifStmt(s);
      case 'for': return this.forStmt(s);
      case 'while': return this.whileStmt(s);
      case 'switch': return this.switchStmt(s);
      case 'try': return this.tryStmt(s);
      case 'break': return () => S_BREAK;
      case 'continue': return () => S_CONTINUE;
      case 'return': return () => S_RETURN;
      case 'global': {
        const names = s.names;
        return (f) => { for (const nm of names) rt.declareGlobal(f, nm); return S_NORMAL; };
      }
      case 'persistent': {
        const names = s.names;
        const inits = s.inits.map(([nm, e]) => [nm, this.expr(e)]);
        return (f) => { for (const nm of names) rt.declarePersistent(f, nm, inits.find((x) => x[0] === nm)); return S_NORMAL; };
      }
      case 'block': return this.block(s.body);
      default: throw new MError('core:internal', `Cannot compile statement ${s.t}`);
    }
  }

  exprStmt(s) {
    const rt = this.rt;
    const e = s.e;
    const print = s.print;
    if (e.t === 'id') {
      const name = e.name;
      const read = this.reader(name);
      const fi = this.scope.fi;
      return (f) => {
        const v = read(f);
        if (v !== undefined) { if (print) rt.display(name, v, f); return S_NORMAL; }
        const r = rt.callFunction(name, [], 0, f, fi);
        if (r.length && r[0] !== undefined) { rt.setAns(f, r[0]); if (print) rt.display('ans', r[0], f); }
        return S_NORMAL;
      };
    }
    if (e.t === 'super') {
      const c = this.expr(e);
      const write = this.writer(e.name);
      return (f) => { const r = c.mv(f, 0); if (r.isCtor && r.length) write(f, r[0]); return S_NORMAL; };
    }
    const c = this.expr(e);
    const isCallish = e.t === 'index';
    return (f) => {
      const vals = isCallish ? c.mv(f, 0) : [c.ev(f)];
      for (const v of vals) {
        if (v === undefined) continue;
        rt.setAns(f, v);
        if (print) rt.display('ans', v, f);
      }
      return S_NORMAL;
    };
  }

  assignStmt(s) {
    const rt = this.rt;
    const lv = s.lhs;
    const name = lv.name;
    const write = this.writer(name);
    const read = this.reader(name);
    const print = s.print;
    const rhs = this.expr(s.rhs);
    if (lv.chain.length === 0) {
      const ev = rhs.ev;
      const rhsIsCall = s.rhs.t === 'index' || s.rhs.t === 'id';
      return (f) => {
        let v;
        if (rhsIsCall) {
          const r = rhs.mv(f, 1);
          if (!r.length) throw rt.noOutputError(s.rhs.t === 'id' ? s.rhs.name : (s.rhs.base && s.rhs.base.name) || '', true);
          v = r[0];
        } else v = ev(f);
        write(f, v);
        if (print) rt.display(name, v, f);
        return S_NORMAL;
      };
    }
    const steps = this.compileChain(lv.chain);
    // x(i) = scalar fast path
    const one = steps.length === 1 && steps[0].k === '()' && steps[0].args.length === 1 && !steps[0].end ? steps[0].args[0] : null;
    return (f) => {
      const v = rhs.ev(f);
      const base = read(f);
      let out;
      if (one !== null && base !== undefined && OWNED.has(base) && base.re !== undefined && v.re !== undefined && v.cls === base.cls && v.im === null && base.im === null && v.re.length === 1 && v.dims.length === 2) {
        const i = one.ev(f);
        const x = i.re !== undefined && i.re.length === 1 && i.cls === 'double' ? i.re[0] : 0;
        if (x >= 1 && x <= base.re.length && x === Math.floor(x)) { base.re[x - 1] = v.re[0]; out = base; }
        else out = rt.assignChain(base, steps, 0, v, f, [i]);
      } else out = rt.assignChain(base, steps, 0, v, f);
      if (out !== base) write(f, out);
      else if (rt.watchVars) rt.varsChanged = true;
      if (print) rt.display(name, out, f);
      return S_NORMAL;
    };
  }

  massignStmt(s) {
    const rt = this.rt;
    const lhs = s.lhs.map((l) => {
      if (l.t === 'tilde') return { tilde: true };
      return { name: l.name, read: this.reader(l.name), write: this.writer(l.name), steps: l.chain.length ? this.compileChain(l.chain) : null };
    });
    const rhs = this.expr(s.rhs);
    const print = s.print;
    return (f) => {
      // count outputs (c{1:3} and s.f on struct arrays expand)
      const counts = lhs.map((l) => (l.tilde || !l.steps ? 1 : rt.lhsCount(l, f)));
      const nout = counts.reduce((a, b) => a + b, 0);
      const vals = rhs.mv(f, nout);
      if (vals.length < nout) {
        // the first output may be optional for a statement like [a, b] = size(x) — but missing ones are errors
        let need = 0, k = 0;
        for (const c of counts) { need += c; if (vals.length < need) break; k++; }
        if (vals.length === 0 || (vals.length < nout)) throw rt.tooManyOutputs(s.rhs);
      }
      let p = 0;
      for (let i = 0; i < lhs.length; i++) {
        const l = lhs[i];
        if (l.tilde) { p++; continue; }
        if (!l.steps) { const v = vals[p++]; l.write(f, v); continue; }
        if (counts[i] === 1) {
          const base = l.read(f);
          const out = rt.assignChain(base, l.steps, 0, vals[p++], f);
          if (out !== base) l.write(f, out);
          continue;
        }
        const part = vals.slice(p, p + counts[i]); p += counts[i];
        const base = l.read(f);
        const out = rt.assignSpread(base, l.steps, part, f);
        l.write(f, out);
      }
      if (print) for (const l of lhs) if (!l.tilde) rt.display(l.name, l.read(f), f);
      return S_NORMAL;
    };
  }

  cond(e) {
    const c = this.expr(e);
    const rt = this.rt;
    return (f) => {
      const v = c.ev(f);
      if (v.re !== undefined && v.re.length === 1 && v.im === null && v.sparse === undefined) {
        const x = v.re[0];
        if (x !== x) throw new MError('core:nanToLogical', 'NaN values cannot be converted to logicals.');
        return x !== 0;
      }
      return rt.truth(v);
    };
  }

  ifStmt(s) {
    const clauses = s.clauses.map((c) => [this.cond(c.cond), this.block(c.body)]);
    const els = s.else ? this.block(s.else) : null;
    if (clauses.length === 1) {
      const [c, b] = clauses[0];
      return els ? (f) => (c(f) ? b(f) : els(f)) : (f) => (c(f) ? b(f) : S_NORMAL);
    }
    return (f) => {
      for (const [c, b] of clauses) if (c(f)) return b(f);
      return els ? els(f) : S_NORMAL;
    };
  }

  forStmt(s) {
    const rt = this.rt;
    const body = this.block(s.body);
    const lv = s.lv;
    if (lv.chain.length) throw new MError('core:parse', 'The loop variable must be a simple variable name.');
    const write = this.writer(lv.name);
    const e = this.expr(s.e);
    const range = e.range;
    const loop = (f, cnt, get) => {
      for (let k = 0; k < cnt; k++) {
        write(f, get(k));
        if (rt.intFlag !== null && rt.intFlag[0] !== 0) rt.interrupted();
        const r = body(f);
        if (r !== S_NORMAL) { if (r === S_BREAK) break; if (r === S_CONTINUE) continue; return r; }
      }
      return S_NORMAL;
    };
    if (range) {
      const scalarD = (v) => v.cls === 'double' && v.re.length === 1 && v.im === null && v.sparse === undefined;
      return (f) => {
        const x = range.a.ev(f), st = range.s ? range.s.ev(f) : null, y = range.b.ev(f);
        if (scalarD(x) && scalarD(y) && (!st || scalarD(st))) {
          const x0 = x.re[0], d = st ? st.re[0] : 1, cnt = rangeCount(x0, d, y.re[0]);
          if (cnt === 0) { write(f, tensor('double', [1, 0])); return S_NORMAL; }
          return loop(f, cnt, (k) => dnum(x0 + k * d));
        }
        const v = rt.op('colon', st ? [x, st, y] : [x, y]);
        return rt.forEachColumn(v, (cnt, get) => loop(f, cnt, get), () => write(f, v));
      };
    }
    return (f) => {
      const v = e.ev(f);
      return rt.forEachColumn(v, (cnt, get) => loop(f, cnt, get), (empty) => write(f, empty));
    };
  }

  whileStmt(s) {
    const rt = this.rt;
    const c = this.cond(s.cond);
    const body = this.block(s.body);
    return (f) => {
      while (c(f)) {
        if (rt.intFlag !== null && rt.intFlag[0] !== 0) rt.interrupted();
        const r = body(f);
        if (r !== S_NORMAL) { if (r === S_BREAK) break; if (r === S_CONTINUE) continue; return r; }
      }
      return S_NORMAL;
    };
  }

  switchStmt(s) {
    const rt = this.rt;
    const e = this.expr(s.e);
    const cases = s.cases.map((c) => [this.expr(c.v), this.block(c.body)]);
    const other = s.otherwise ? this.block(s.otherwise) : null;
    return (f) => {
      const v = e.ev(f);
      for (const [ce, b] of cases) if (rt.switchMatch(v, ce.ev(f))) return b(f);
      return other ? other(f) : S_NORMAL;
    };
  }

  tryStmt(s) {
    const rt = this.rt;
    const body = this.block(s.body);
    const cbody = this.block(s.cbody);
    const write = s.id ? this.writer(s.id) : null;
    return (f) => {
      const depth = rt.stack.length;
      const endDepth = rt.endStack.length;
      try {
        return body(f);
      } catch (e) {
        const me = rt.catchable(e);
        if (!me) throw e;
        rt.unwindTo(depth);
        rt.endStack.length = endDepth;
        rt.lastError = me;
        if (write) write(f, rt.makeMException(me));
        return cbody(f);
      }
    };
  }
}

export { disown };
