'use strict';

// Path-sensitive symbolic execution over the CFG, in the spirit of
// SonarPython's engine. Each local variable has an abstract value
//   { n: 'N' (None) | 'S' (not None) | undefined,
//     t: true | false | undefined   (truthiness),
//     c: string | undefined          (known literal, JSON),
//     imm: bool                      (immutable: truthiness / literal stable),
//     src: node                      (where None came from) }
// Up to K states per block entry are kept apart (path sensitivity); beyond
// that they are joined. Conditions refine states (x is None, not x,
// isinstance, and/or short-circuit, walrus).
//
// Produces: None dereferences (attribute / subscript / call / iteration on
// a value that is None on some feasible path) and condition atoms whose
// outcome never varies (always true / always false).

const { BUILTIN } = require('./scope');
const { dotted, children } = require('./ast');

const K = 8;
const MAX_STEPS = 25000;

const NEVER_NONE_CALLS = new Set(['len', 'str', 'int', 'float', 'bool', 'list', 'dict', 'set', 'tuple', 'frozenset', 'bytes', 'bytearray',
  'sorted', 'range', 'enumerate', 'zip', 'map', 'filter', 'reversed', 'repr', 'format', 'abs', 'round', 'sum', 'min', 'max', 'open', 'iter',
  'type', 'object', 'isinstance', 'hasattr', 'callable', 'chr', 'ord', 'hex', 'oct', 'bin', 'hash', 'id', 'input', 'divmod', 'pow', 'any', 'all']);
const IMM_CALLS = new Set(['str', 'int', 'float', 'bool', 'tuple', 'frozenset', 'bytes', 'len', 'repr', 'format', 'abs', 'round', 'sum', 'chr', 'ord', 'hex', 'oct', 'bin', 'hash', 'id', 'input', 'isinstance', 'hasattr', 'callable', 'any', 'all', 'divmod', 'pow', 'type']);
const EMPTY_CTORS = { list: true, dict: true, set: true, tuple: false, bytearray: true, frozenset: false, str: false, bytes: false };

let sidCounter = 0;
function sid(sym) {
  if (sym._sid == null) sym._sid = ++sidCounter;
  return sym._sid;
}

function valKey(v) {
  if (!v) return '';
  return `${v.n || ''}${v.t === undefined ? '' : v.t ? 'T' : 'F'}${v.c === undefined ? '' : v.c}${v.imm ? 'i' : ''}`;
}

function isUnknown(v) { return !v || (v.n === undefined && v.t === undefined && v.c === undefined); }

class State {
  constructor(map) { this.map = map || new Map(); this._key = null; }
  get(sym) { return this.map.get(sym); }
  set(sym, v) {
    const m = new Map(this.map);
    if (isUnknown(v)) m.delete(sym); else m.set(sym, v);
    return new State(m);
  }
  del(sym) { if (!this.map.has(sym)) return this; const m = new Map(this.map); m.delete(sym); return new State(m); }
  key() {
    if (this._key == null) {
      const parts = [];
      for (const [s, v] of this.map) parts.push(`${sid(s)}:${valKey(v)}`);
      parts.sort();
      this._key = parts.join(',');
    }
    return this._key;
  }
}

function joinVal(a, b) {
  if (!a || !b) return undefined;
  const v = {};
  if (a.n === b.n) v.n = a.n;
  if (a.t === b.t) v.t = a.t;
  if (a.c === b.c) v.c = a.c;
  if (a.imm && b.imm) v.imm = true;
  if (v.n === 'N') { v.src = a.src || b.src; if (a.weak || b.weak) v.weak = true; }
  return isUnknown(v) ? undefined : v;
}

function joinStates(list) {
  let m = new Map(list[0].map);
  for (let i = 1; i < list.length; i++) {
    const o = list[i].map;
    const next = new Map();
    for (const [s, v] of m) {
      const j = joinVal(v, o.get(s));
      if (j) next.set(s, j);
    }
    m = next;
  }
  return new State(m);
}

// None-ness learned inside a later operand of and/or only holds together
// with the other (untracked) operands: keep it, but never report from it.
function weaken(state, base) {
  let out = state;
  for (const [sym, v] of state.map) {
    if (v.n === 'N' && !v.weak) {
      const b = base.get(sym);
      if (!b || b.n !== 'N') out = out.set(sym, { ...v, weak: true });
    }
  }
  return out;
}

// Any call may mutate objects through aliases: forget the truthiness of
// every value that is not immutable.
function clobber(state) {
  let out = state;
  for (const [sym, v] of state.map) if (!v.imm && (v.t !== undefined || v.c !== undefined)) out = out.set(sym, { ...v, t: undefined, c: undefined });
  return out;
}

function truthOfConst(e) {
  switch (e.kind) {
    case 'None': return false;
    case 'bool': return e.value;
    case 'int': case 'float': case 'complex': return e.value !== 0;
    case 'str': case 'bytes': return e.value.length > 0;
    case 'Ellipsis': return true;
    default: return undefined;
  }
}

function mentions(e, sym) {
  let hit = false;
  const visit = (n) => { if (hit || !n) return; if (n.type === 'Name' && n.sym === sym) { hit = true; return; } for (const c of children(n)) visit(c); };
  visit(e);
  return hit;
}

function within(n, anc) {
  for (let p = n; p; p = p.parent) if (p === anc) return true;
  return false;
}

class SymExec {
  constructor(fnNode, cfg, opts) {
    this.fn = fnNode;
    this.cfg = cfg;
    this.tracked = opts.tracked;
    this.project = opts.project;
    this.catches = opts.catches || (() => false);
    this.derefs = new Map();
    this.conds = new Map();
    this.steps = 0;
    this.aborted = false;
  }

  run() {
    const bs = new Map();
    const pending = new Map();
    const queue = [];
    const enqueue = (b) => { if (!b._queued) { b._queued = true; queue.push(b); } };
    const deliver = (b, st) => {
      let info = bs.get(b);
      if (!info) { info = { keys: new Set(), list: [], merged: false, joined: null }; bs.set(b, info); }
      if (info.merged) {
        const j = joinStates([info.joined, st]);
        if (j.key() !== info.joined.key()) { info.joined = j; pending.set(b, [j]); enqueue(b); }
        return;
      }
      const k = st.key();
      if (info.keys.has(k)) return;
      info.keys.add(k);
      info.list.push(st);
      if (info.list.length > K) {
        info.merged = true;
        info.joined = joinStates(info.list);
        pending.set(b, [info.joined]);
      } else {
        if (!pending.has(b)) pending.set(b, []);
        pending.get(b).push(st);
      }
      enqueue(b);
    };
    deliver(this.cfg.entry, new State());
    while (queue.length) {
      if (this.steps > MAX_STEPS) { this.aborted = true; break; }
      const b = queue.shift();
      b._queued = false;
      const states = pending.get(b) || [];
      pending.delete(b);
      for (const st0 of states) {
        let cur = [st0];
        for (const el of b.elems) {
          const next = [];
          for (const s of cur) next.push(...this.element(el, s));
          cur = this.limit(next);
          this.steps += cur.length || 1;
        }
        let tStates = cur;
        let fStates = cur;
        if (b.cond && b.cond.kind === 'expr') {
          tStates = [];
          fStates = [];
          for (const s of cur) {
            const r = this.cond(b.cond.node, s, true);
            tStates.push(...r.T);
            fStates.push(...r.F);
          }
        }
        for (const e of b.succ) {
          const list = e.kind === 'true' ? tStates : e.kind === 'false' ? fStates : cur;
          for (const s of list) deliver(e.to, s);
        }
      }
    }
    for (const b of this.cfg.blocks) b._queued = false;
    return { derefs: [...this.derefs.values()], conds: this.aborted ? [] : [...this.conds.values()], aborted: this.aborted };
  }

  limit(states) {
    if (states.length <= K) return states;
    return [joinStates(states)];
  }

  trackedName(e) {
    return e && e.type === 'Name' && e.sym && e.sym !== BUILTIN && this.tracked(e.sym) ? e.sym : null;
  }

  // ── abstract value of an expression ──────────────────────
  valueOf(e, st) {
    if (!e) return undefined;
    switch (e.type) {
      case 'Constant': {
        const t = truthOfConst(e);
        if (e.kind === 'None') return { n: 'N', t: false, imm: true, src: e };
        const v = { n: 'S', t, imm: true };
        if (e.kind === 'bool' || e.kind === 'int' || (e.kind === 'str' && e.value.length < 40)) v.c = JSON.stringify([e.kind === 'bool' ? 'b' : e.kind, e.value]);
        return v;
      }
      case 'Name': {
        const s = this.trackedName(e);
        if (s) return st.get(s);
        if (e.sym === BUILTIN && (e.id === 'True' || e.id === 'False')) return { n: 'S', t: e.id === 'True' };
        return undefined;
      }
      case 'List': case 'Set': return { n: 'S', t: e.elts.length > 0 && !e.elts.some((x) => x.type === 'Starred') ? true : (e.elts.length ? undefined : false) };
      case 'Dict': return { n: 'S', t: e.keys.length > 0 && e.keys.every((k) => k !== null) ? true : (e.keys.length ? undefined : false) };
      case 'Tuple': return { n: 'S', t: e.elts.length > 0 && !e.elts.some((x) => x.type === 'Starred') ? true : (e.elts.length ? undefined : false), imm: true };
      case 'ListComp': case 'SetComp': case 'DictComp': return { n: 'S' };
      case 'GeneratorExp': case 'Lambda': return { n: 'S', t: true };
      case 'JoinedStr': return { n: 'S' };
      case 'Compare': return { n: 'S' };
      case 'BinOp': return { n: 'S' };
      case 'UnaryOp': return { n: 'S' };
      case 'IfExp': return joinVal(this.valueOf(e.body, st), this.valueOf(e.orelse, st));
      case 'BoolOp': {
        const last = this.valueOf(e.values[e.values.length - 1], st);
        if (e.op === 'Or' && last && last.n === 'S') return { n: 'S' };
        return undefined;
      }
      case 'NamedExpr': return this.valueOf(e.value, st);
      case 'Call': {
        const f = e.func;
        if (f.type === 'Name' && f.sym === BUILTIN) {
          if (Object.prototype.hasOwnProperty.call(EMPTY_CTORS, f.id) && !e.args.length && !e.keywords.length) return { n: 'S', t: false, imm: !EMPTY_CTORS[f.id] };
          if (NEVER_NONE_CALLS.has(f.id)) return { n: 'S', imm: IMM_CALLS.has(f.id) };
        }
        if (this.project) {
          const t = this.project.typeOf(f);
          if (t && t.k === 'class') return { n: 'S' };
        }
        return undefined;
      }
      default: return undefined;
    }
  }

  // ── conditions ───────────────────────────────────────────
  record(node, canT, canF, sym, kind) {
    let r = this.conds.get(node);
    if (!r) { r = { node, canT: false, canF: false, sym, kind }; this.conds.set(node, r); }
    if (canT) r.canT = true;
    if (canF) r.canF = true;
  }

  cond(e, st, rec) {
    switch (e.type) {
      case 'Constant': {
        const t = truthOfConst(e);
        return { T: t === false ? [] : [st], F: t === true ? [] : [st] };
      }
      case 'Name': {
        const s = this.trackedName(e);
        if (!s) return { T: [st], F: [st] };
        const v = st.get(s) || {};
        const canT = !(v.t === false || v.n === 'N');
        const canF = v.t !== true;
        if (rec) this.record(e, canT, canF, s, 'truth');
        return {
          T: canT ? [st.set(s, { ...v, n: 'S', t: true, src: undefined })] : [],
          F: canF ? [st.set(s, { ...v, t: false })] : [],
        };
      }
      case 'UnaryOp':
        if (e.op === 'Not') { const r = this.cond(e.operand, st, rec); return { T: r.F, F: r.T }; }
        break;
      case 'BoolOp': {
        let T = [st];
        let F = [];
        if (e.op === 'And') {
          for (const v of e.values) {
            const nextT = [];
            const first = v === e.values[0];
            for (const s of T) { const r = this.cond(v, s, rec); nextT.push(...r.T); F.push(...(first ? r.F : r.F.map((x) => weaken(x, st)))); }
            T = this.limit(nextT);
          }
          return { T, F: this.limit(F) };
        }
        let Fs = [st];
        const Ts = [];
        for (const v of e.values) {
          const nextF = [];
          const first = v === e.values[0];
          for (const s of Fs) { const r = this.cond(v, s, rec); Ts.push(...(first ? r.T : r.T.map((x) => weaken(x, st)))); nextF.push(...r.F); }
          Fs = this.limit(nextF);
        }
        T = this.limit(Ts);
        F = Fs;
        return { T, F };
      }
      case 'NamedExpr': {
        const states = this.expr(e.value, st);
        const out = { T: [], F: [] };
        for (let s of states) {
          const sym = this.trackedName(e.target);
          if (sym) s = s.set(sym, this.withSrc(this.valueOf(e.value, s), e));
          const r = this.cond(e.target, s, false);
          out.T.push(...r.T);
          out.F.push(...r.F);
        }
        return out;
      }
      case 'Compare': {
        if (e.ops.length !== 1) break;
        const op = e.ops[0];
        const l = e.left;
        const r = e.comparators[0];
        let x = null;
        let other = null;
        if (this.trackedName(l)) { x = l; other = r; } else if (this.trackedName(r)) { x = r; other = l; }
        if (x && other && other.type === 'Constant' && other.kind === 'None' && (op === 'Is' || op === 'IsNot' || op === 'Eq' || op === 'NotEq')) {
          const s = x.sym;
          const v = st.get(s) || {};
          const canNone = v.n !== 'S';
          const canNot = v.n !== 'N';
          const positive = op === 'Is' || op === 'Eq';
          if (rec) this.record(e, positive ? canNone : canNot, positive ? canNot : canNone, s, 'none');
          const noneSt = canNone ? [st.set(s, { n: 'N', t: false, src: e })] : [];
          const notSt = canNot ? [st.set(s, { ...v, n: 'S', src: undefined })] : [];
          return positive ? { T: noneSt, F: notSt } : { T: notSt, F: noneSt };
        }
        if (x && other && (op === 'Eq' || op === 'NotEq') && other.type === 'Constant' && (other.kind === 'int' || other.kind === 'str' || other.kind === 'bool')) {
          // evaluate other side first for derefs
          const s = x.sym;
          const v = st.get(s) || {};
          const c = JSON.stringify([other.kind === 'bool' ? 'b' : other.kind, other.value]);
          let canEq = true;
          let canNe = true;
          if (v.c !== undefined) { canEq = v.c === c; canNe = v.c !== c; } else if (v.n === 'N') canEq = false;
          if (rec) this.record(e, op === 'Eq' ? canEq : canNe, op === 'Eq' ? canNe : canEq, s, 'const');
          const eqSt = canEq ? [st.set(s, { n: 'S', t: truthOfConst(other), c })] : [];
          const neSt = canNe ? [st] : [];
          return op === 'Eq' ? { T: eqSt, F: neSt } : { T: neSt, F: eqSt };
        }
        if (x && other && (op === 'Lt' || op === 'LtE' || op === 'Gt' || op === 'GtE') && other.type === 'Constant' && other.kind === 'int') {
          // ordering against a known int literal value of the variable
          const v = st.get(x.sym) || {};
          let known = null;
          if (v.c !== undefined) { try { const p = JSON.parse(v.c); if (p[0] === 'int' && typeof p[1] === 'number') known = p[1]; } catch { known = null; } }
          if (known !== null && typeof other.value === 'number') {
            const a = x === l ? known : other.value;
            const b = x === l ? other.value : known;
            const res = op === 'Lt' ? a < b : op === 'LtE' ? a <= b : op === 'Gt' ? a > b : a >= b;
            if (rec) this.record(e, res, !res, x.sym, 'order');
            return res ? { T: [st], F: [] } : { T: [], F: [st] };
          }
          // value unknown on this path: either outcome is possible
          if (rec) this.record(e, true, true, x.sym, 'order');
        }
        break;
      }
      case 'Call': {
        const f = e.func;
        if (f.type === 'Name' && f.sym === BUILTIN && e.args.length >= 1) {
          const sym = this.trackedName(e.args[0]);
          if (sym && (f.id === 'isinstance' || f.id === 'callable' || f.id === 'hasattr')) {
            const states = this.expr(e, st);
            const out = { T: [], F: [] };
            const allowsNone = f.id === 'isinstance' && e.args[1] && /None/.test(dotted(e.args[1]) || JSON.stringify(e.args[1], ['type', 'id', 'elts', 'value', 'kind', 'func', 'args']) || '');
            for (const s of states) {
              const v = s.get(sym) || {};
              if (!allowsNone) {
                if (v.n !== 'N') out.T.push(s.set(sym, { ...v, n: 'S', src: undefined }));
              } else out.T.push(s);
              out.F.push(s);
            }
            return out;
          }
          if (sym && f.id === 'len' && e.args.length === 1) {
            const states = this.expr(e, st);
            const out = { T: [], F: [] };
            for (const s of states) {
              const v = s.get(sym) || {};
              const canT = v.t !== false;
              const canF = v.t !== true;
              if (canT) out.T.push(s.set(sym, { ...v, n: 'S', t: true }));
              if (canF) out.F.push(s.set(sym, { ...v, n: 'S', t: false }));
            }
            return out;
          }
        }
        break;
      }
      default: break;
    }
    const states = this.expr(e, st);
    return { T: states, F: states };
  }

  withSrc(v, node) {
    if (v && v.n === 'N') return { ...v, src: node };
    return v;
  }

  // ── expression evaluation (returns states) ───────────────
  deref(node, nameNode, st, kind) {
    const sym = this.trackedName(nameNode);
    if (!sym) return st;
    const v = st.get(sym);
    if (v && v.n === 'N') {
      if (!v.weak && !this.derefs.has(node) && !this.catches(node, kind) && !this.guarded(node, sym, v.src)) this.derefs.set(node, { node, name: nameNode, sym, src: v.src, kind });
      return st.set(sym, { ...v, n: 'S', t: undefined, src: undefined });
    }
    return st;
  }

  // The dereference sits under a condition that does not mention the
  // variable while the variable also gets real values elsewhere: the path
  // may well be infeasible through correlated conditions we do not track.
  guarded(node, sym, src) {
    if (!sym.bindings.some((b) => !(b.stmt && b.stmt.type === 'Assign' && b.stmt.value.type === 'Constant' && b.stmt.value.kind === 'None'))) return false;
    let child = node;
    let p = node.parent;
    while (p && p.type !== 'FunctionDef' && p.type !== 'AsyncFunctionDef' && p.type !== 'Lambda') {
      let tests = null;
      if ((p.type === 'If' || p.type === 'While' || p.type === 'IfExp') && child !== p.test) tests = [p.test];
      else if (p.type === 'BoolOp' && p.values.indexOf(child) > 0) tests = p.values.slice(0, p.values.indexOf(child));
      if (tests && !tests.some((t) => mentions(t, sym)) && !(src && within(src, p))) return true;
      child = p;
      p = p.parent;
    }
    return false;
  }

  // mutable value escapes: its truthiness may change
  escape(e, st) {
    const sym = this.trackedName(e);
    if (!sym) return st;
    const v = st.get(sym);
    if (v && !v.imm && (v.t !== undefined || v.c !== undefined)) return st.set(sym, { ...v, t: undefined, c: undefined });
    return st;
  }

  exprs(list, st) {
    let states = [st];
    for (const e of list) {
      if (!e) continue;
      const next = [];
      for (const s of states) next.push(...this.expr(e, s));
      states = this.limit(next);
    }
    return states;
  }

  expr(e, st) {
    if (!e) return [st];
    switch (e.type) {
      case 'Name': case 'Constant': return [st];
      case 'Attribute': {
        const states = this.expr(e.value, st);
        if (e.value.type !== 'Name') return states;
        if (/^__\w+__$/.test(e.attr)) return states;
        return states.map((s) => this.escape(e.value, this.deref(e, e.value, s, 'attribute')));
      }
      case 'Subscript': {
        let states = this.expr(e.value, st);
        if (e.value.type === 'Name') states = states.map((s) => this.deref(e, e.value, s, 'subscript'));
        if (e.ctx !== 'Load') states = states.map((s) => this.escape(e.value, s));
        const out = [];
        for (const s of states) out.push(...this.expr(e.slice, s));
        return this.limit(out);
      }
      case 'Call': {
        let states = this.expr(e.func, st);
        if (e.func.type === 'Name') states = states.map((s) => this.deref(e, e.func, s, 'call'));
        const args = [...e.args, ...e.keywords.map((k) => k.value)];
        const out = [];
        for (const s0 of states) {
          for (let s of this.exprs(args, s0)) {
            for (const a of args) s = this.escape(a.type === 'Starred' ? a.value : a, s);
            out.push(clobber(s));
          }
        }
        return this.limit(out);
      }
      case 'BoolOp': {
        const r = this.cond(e, st, false);
        return this.limit([...r.T, ...r.F]);
      }
      case 'IfExp': {
        const r = this.cond(e.test, st, true);
        const out = [];
        for (const s of r.T) out.push(...this.expr(e.body, s));
        for (const s of r.F) out.push(...this.expr(e.orelse, s));
        return this.limit(out.length ? out : [st]);
      }
      case 'NamedExpr': {
        const states = this.expr(e.value, st);
        const sym = this.trackedName(e.target);
        if (!sym) return states;
        return states.map((s) => s.set(sym, this.withSrc(this.valueOf(e.value, s), e)));
      }
      case 'Await': case 'Yield': case 'YieldFrom': return this.exprs([e.value], st).map(clobber);
      case 'Lambda': return this.exprs([...e.args.defaults, ...e.args.kw_defaults], st);
      case 'ListComp': case 'SetComp': case 'GeneratorExp': case 'DictComp': {
        const it = e.generators[0].iter;
        let states = this.expr(it, st);
        if (it.type === 'Name') states = states.map((s) => this.deref(it, it, s, 'iterate'));
        return states;
      }
      default: {
        return this.exprs(children(e), st);
      }
    }
  }

  // ── element transfer ─────────────────────────────────────
  assignTarget(t, value, st, srcNode) {
    if (!t) return [st];
    switch (t.type) {
      case 'Name': {
        const sym = this.trackedName(t);
        if (!sym) return [st];
        return [st.set(sym, this.withSrc(value, srcNode))];
      }
      case 'Tuple': case 'List': {
        let s = st;
        for (const el of t.elts) {
          const inner = el.type === 'Starred' ? el.value : el;
          if (inner.type === 'Name') { const sym = this.trackedName(inner); if (sym) s = s.set(sym, el.type === 'Starred' ? { n: 'S' } : undefined); } else s = this.assignTarget(inner, undefined, s, srcNode)[0];
        }
        return [s];
      }
      case 'Starred': return this.assignTarget(t.value, { n: 'S' }, st, srcNode);
      case 'Attribute': {
        const states = this.expr(t.value, st);
        if (t.value.type === 'Name' && !/^__\w+__$/.test(t.attr)) return states.map((s) => this.escape(t.value, this.deref(t, t.value, s, 'attribute')));
        return states;
      }
      case 'Subscript': {
        let states = this.expr(t.value, st);
        if (t.value.type === 'Name') states = states.map((s) => this.escape(t.value, this.deref(t, t.value, s, 'subscript')));
        const out = [];
        for (const s of states) out.push(...this.expr(t.slice, s));
        return out;
      }
      default: return [st];
    }
  }

  element(el, st) {
    const n = el.node;
    switch (el.kind) {
      case 'stmt': return this.stmt(n, st);
      case 'iter': {
        let states = this.expr(n.iter, st);
        if (n.iter.type === 'Name') states = states.map((s) => this.deref(n.iter, n.iter, s, 'iterate'));
        return states;
      }
      case 'for-target': return this.assignTarget(n.target, undefined, st, n);
      case 'with': {
        let states = [st];
        for (const it of n.items) {
          const next = [];
          for (const s of states) {
            for (let s2 of this.expr(it.context_expr, s)) {
              if (it.context_expr.type === 'Name') s2 = this.deref(it.context_expr, it.context_expr, s2, 'with');
              next.push(...(it.optional_vars ? this.assignTarget(it.optional_vars, undefined, s2, n) : [s2]));
            }
          }
          states = this.limit(next);
        }
        return states;
      }
      case 'except-bind': {
        const sym = n.nameNode && n.nameNode.sym && this.tracked(n.nameNode.sym) ? n.nameNode.sym : null;
        return [sym ? st.set(sym, { n: 'S', t: true }) : st];
      }
      case 'except-unbind': {
        const sym = n.nameNode && n.nameNode.sym && this.tracked(n.nameNode.sym) ? n.nameNode.sym : null;
        return [sym ? st.del(sym) : st];
      }
      case 'match': return this.expr(n.subject, st);
      case 'case-bind': {
        let s = st;
        const visit = (p) => {
          if (!p) return;
          for (const nn of [p.nameNode, p.restNode]) if (nn && nn.sym && this.tracked(nn.sym)) s = s.set(nn.sym, undefined);
            for (const c of children(p)) if (/^Match/.test(c.type)) visit(c);
        };
        visit(n.pattern);
        return [s];
      }
      default: return [st];
    }
  }

  stmt(s, st) {
    switch (s.type) {
      case 'Assign': {
        const states = this.expr(s.value, st);
        const out = [];
        for (const s0 of states) {
          const v = this.valueOf(s.value, s0);
          let cur = [s0];
          for (const t of s.targets) {
            const next = [];
            for (const c of cur) next.push(...this.assignTarget(t, v, c, s));
            cur = next;
          }
          out.push(...cur);
        }
        return this.limit(out);
      }
      case 'AnnAssign': {
        if (!s.value) return [st];
        const states = this.expr(s.value, st);
        const out = [];
        for (const s0 of states) out.push(...this.assignTarget(s.target, this.valueOf(s.value, s0), s0, s));
        return out;
      }
      case 'AugAssign': {
        const states = this.expr(s.value, st);
        const out = [];
        for (const s0 of states) {
          if (s.target.type === 'Name') {
            const sym = this.trackedName(s.target);
            if (sym) { const v = s0.get(sym) || {}; out.push(s0.set(sym, { n: v.n === 'N' ? undefined : 'S', imm: v.imm })); } else out.push(s0);
          } else out.push(...this.assignTarget(s.target, undefined, s0, s));
        }
        return out;
      }
      case 'Expr': return this.expr(s.value, st);
      case 'Return': return this.expr(s.value, st);
      case 'Raise': return this.exprs([s.exc, s.cause], st);
      case 'Assert': {
        const r = this.cond(s.test, st, false);
        return r.T;
      }
      case 'Delete': {
        let states = [st];
        for (const t of s.targets) {
          const next = [];
          for (const c of states) {
            if (t.type === 'Name') { const sym = this.trackedName(t); next.push(sym ? c.del(sym) : c); } else next.push(...this.assignTarget(t, undefined, c, s));
          }
          states = next;
        }
        return states;
      }
      case 'Import': case 'ImportFrom': {
        let c = st;
        for (const a of s.names) if (a.sym && this.tracked(a.sym)) c = c.set(a.sym, s.type === 'Import' ? { n: 'S', t: true, imm: true } : undefined);
        return [c];
      }
      case 'FunctionDef': case 'AsyncFunctionDef': case 'ClassDef': {
        const parts = s.type === 'ClassDef' ? [...s.decorator_list, ...s.bases, ...s.keywords.map((k) => k.value)] : [...s.decorator_list, ...s.args.defaults, ...s.args.kw_defaults];
        const states = this.exprs(parts, st);
        return states.map((c) => (s.sym && this.tracked(s.sym) ? c.set(s.sym, { n: 'S', t: true }) : c));
      }
      default: return [st];
    }
  }
}

module.exports = { SymExec };
