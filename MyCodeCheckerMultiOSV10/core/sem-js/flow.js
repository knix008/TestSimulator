'use strict';

// Data-flow over the CFG of one function:
//  - liveness of local variables -> dead stores
//  - path-sensitive symbolic execution over value-class constraints ->
//    null / undefined dereferences and conditions that never change.
//
// Tracked variables are locals of the function that no nested function
// writes (and no eval / with). A value is a set of value classes (bit mask);
// branches refine the mask of the tested symbolic value.

const { isFunction, staticValue, unwrapTS, dottedName, propName } = require('./walk');

const NUL = 1; const UND = 2; const FALSE = 4; const TRUE = 8; const ZERO = 16; const NUMNZ = 32; const NAN = 64;
const ESTR = 128; const STR = 256; const OBJ = 512; const ALL = 1023;
const FALSY = NUL | UND | FALSE | ZERO | NAN | ESTR;
const TRUTHY = TRUE | NUMNZ | STR | OBJ;
const NULLISH = NUL | UND;
const NUMBER = ZERO | NUMNZ | NAN;
const STRING = ESTR | STR;
const BOOL = TRUE | FALSE;
const SINGLETON = new Set([NUL, UND, TRUE, FALSE, ZERO, ESTR]);

const MAX_STATES = 12;
const MAX_STEPS = 6000;
const MAX_FORK = 12;

// ------------------------------------------------------------------ tracking
function trackedVariables(fnNode, sm) {
  const fnScope = sm.byNode.get(fnNode);
  if (!fnScope) return [];
  if (sm.hasEval.has(fnScope)) return [];
  // top-level bindings of classic scripts are globals shared with other scripts
  if (fnNode.type === 'Program' && fnScope.type === 'global') return [];
  const out = [];
  const visit = (s) => {
    for (const v of s.vars.values()) {
      const k = v.kind;
      if (k !== 'var' && k !== 'let' && k !== 'const' && k !== 'param' && k !== 'catch') continue;
      if (v.writtenInClosure || v.implicit || v.exported) continue;
      if (v.defs.some((d) => d.declare)) continue;
      out.push(v);
    }
    for (const c of s.children) if (c.fn === fnScope) visit(c);
  };
  visit(fnScope);
  if (fnScope.vars.has('arguments') && fnScope.vars.get('arguments').refs.length) {
    // sloppy-mode parameters alias `arguments`
    return out.filter((v) => v.kind !== 'param');
  }
  return out;
}

// ------------------------------------------------------------------ events (liveness)
function refVar(id, tracked) {
  const r = id._ref;
  if (!r || r.type || !r.resolved) return null;
  return tracked.has(r.resolved) ? r.resolved : null;
}

function events(node, out, tracked, cond) {
  if (!node || typeof node !== 'object') return;
  switch (node.type) {
    case 'Identifier': {
      const v = refVar(node, tracked);
      if (v && node._ref.read) out.push({ v, r: true, node });
      return;
    }
    case 'FunctionExpression': case 'ArrowFunctionExpression': case 'FunctionDeclaration': case 'ClassExpression': case 'ClassDeclaration':
      if (node.type === 'ClassExpression' || node.type === 'ClassDeclaration') { if (node.superClass) events(node.superClass, out, tracked, cond); }
      return;
    case 'AssignmentExpression': {
      const op = node.operator;
      const logical = op === '&&=' || op === '||=' || op === '??=';
      if (node.left.type === 'Identifier') {
        const v = refVar(node.left, tracked);
        if (op !== '=' && v) out.push({ v, r: true, node: node.left });
        events(node.right, out, tracked, cond || logical);
        if (v) out.push({ v, w: true, node: node.left, expr: node, cond: cond || logical, compound: op !== '=' });
      } else {
        targetEvents(node.left, out, tracked, cond, true);
        events(node.right, out, tracked, cond || logical);
        targetEvents(node.left, out, tracked, cond || logical, false);
      }
      return;
    }
    case 'UpdateExpression':
      if (node.argument.type === 'Identifier') {
        const v = refVar(node.argument, tracked);
        if (v) { out.push({ v, r: true, node: node.argument }); out.push({ v, w: true, node: node.argument, expr: node, cond, update: true }); }
      } else events(node.argument, out, tracked, cond);
      return;
    case 'LogicalExpression':
      events(node.left, out, tracked, cond);
      events(node.right, out, tracked, true);
      return;
    case 'ConditionalExpression':
      events(node.test, out, tracked, cond);
      events(node.consequent, out, tracked, true);
      events(node.alternate, out, tracked, true);
      return;
    case 'ChainExpression':
      events(node.expression, out, tracked, true);
      return;
    case 'MemberExpression':
      events(node.object, out, tracked, cond);
      if (node.computed) events(node.property, out, tracked, cond || node.optional);
      return;
    case 'CallExpression':
      events(node.callee, out, tracked, cond);
      for (const a of node.arguments) events(a, out, tracked, cond || node.optional);
      return;
    case 'Property':
      if (node.computed) events(node.key, out, tracked, cond);
      events(node.value, out, tracked, cond);
      return;
    case 'VariableDeclarator':
      if (node.init) events(node.init, out, tracked, cond);
      if (node.id.type === 'Identifier') {
        const v = refVar(node.id, tracked);
        if (v && node.init) out.push({ v, w: true, node: node.id, expr: node, init: true, cond });
      } else if (node.init) targetEvents(node.id, out, tracked, cond, false, true);
      return;
    case 'Params':
      for (const p of node.node.params) paramEvents(p, out, tracked);
      return;
    case 'ForRight':
      events(node.node.right, out, tracked, cond);
      return;
    case 'ForEachAssign': {
      const left = node.node.left;
      const pat = left.type === 'VariableDeclaration' ? left.declarations[0].id : left;
      targetEvents(pat, out, tracked, false, true);
      targetEvents(pat, out, tracked, false, false, true);
      return;
    }
    case 'CatchParam':
      if (node.node.param) targetEvents(node.node.param, out, tracked, false, false, true);
      return;
    case 'Opaque':
      return;
    default:
      if (node.type.startsWith('TS') && node.type !== 'TSAsExpression' && node.type !== 'TSNonNullExpression' && node.type !== 'TSSatisfiesExpression' && node.type !== 'TSTypeAssertion' && node.type !== 'TSInstantiationExpression' && node.type !== 'TSParameterProperty') return;
      for (const key in node) {
        if (key === 'parent' || key === 'comments' || key.charCodeAt(0) === 95 || key === 'typeAnnotation' || key === 'returnType' || key === 'typeArguments' || key === 'typeParameters') continue;
        const v = node[key];
        if (v === null || typeof v !== 'object') continue;
        if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') events(x, out, tracked, cond); } else if (typeof v.type === 'string') events(v, out, tracked, cond);
      }
  }
}

function paramEvents(p, out, tracked) {
  if (p.type === 'TSParameterProperty') p = p.parameter;
  if (p.type === 'AssignmentPattern') {
    events(p.right, out, tracked, true);
    p = p.left;
  }
  targetEvents(p, out, tracked, false, false, true);
}

// Assignment targets. reads=true emits the sub-expression reads (member
// objects, computed keys, defaults); reads=false emits the writes.
function targetEvents(p, out, tracked, cond, reads, isDecl) {
  if (!p) return;
  switch (p.type) {
    case 'Identifier':
      if (!reads) {
        const v = refVar(p, tracked);
        if (v) out.push({ v, w: true, node: p, cond, pattern: true, decl: !!isDecl });
      }
      return;
    case 'MemberExpression':
      if (reads) { events(p.object, out, tracked, cond); if (p.computed) events(p.property, out, tracked, cond); }
      return;
    case 'ObjectPattern':
      for (const prop of p.properties) {
        if (prop.type === 'RestElement') targetEvents(prop.argument, out, tracked, cond, reads, isDecl);
        else {
          if (reads && prop.computed) events(prop.key, out, tracked, cond);
          targetEvents(prop.value, out, tracked, cond, reads, isDecl);
        }
      }
      return;
    case 'ArrayPattern':
      for (const e of p.elements) targetEvents(e, out, tracked, cond, reads, isDecl);
      return;
    case 'RestElement': targetEvents(p.argument, out, tracked, cond, reads, isDecl); return;
    case 'AssignmentPattern':
      if (reads) events(p.right, out, tracked, true);
      targetEvents(p.left, out, tracked, cond, reads, isDecl);
      return;
    case 'TSAsExpression': case 'TSNonNullExpression': case 'TSSatisfiesExpression': case 'TSTypeAssertion':
      targetEvents(p.expression, out, tracked, cond, reads, isDecl);
      return;
    default:
      if (reads) events(p, out, tracked, cond);
  }
}

function elementEvents(el, tracked) {
  const out = [];
  if (el.type === 'ReturnStatement' || el.type === 'ThrowStatement') events(el.argument, out, tracked, false);
  else events(el, out, tracked, false);
  return out;
}

// ------------------------------------------------------------------ liveness
function liveness(cfg, trackedList) {
  const tracked = new Set(trackedList);
  if (!tracked.size) return [];
  const blocks = cfg.blocks.filter((b) => b.reachable);
  const evs = new Map();
  for (const b of blocks) {
    const list = b.elements.map((el) => elementEvents(el, tracked));
    if (b.test) {
      const t = [];
      events(b.test, t, tracked, false);
      list.push(t);
    }
    evs.set(b, list);
  }
  const liveIn = new Map();
  for (const b of blocks) liveIn.set(b, new Set());
  const transfer = (b, out, report) => {
    const live = new Set(out);
    const h = b.handler && liveIn.get(b.handler);
    if (h) for (const v of h) live.add(v);
    const list = evs.get(b);
    for (let i = list.length - 1; i >= 0; i--) {
      const ev = list[i];
      for (let j = ev.length - 1; j >= 0; j--) {
        const e = ev[j];
        if (e.w) {
          if (report && !live.has(e.v)) report(e);
          if (!e.cond) live.delete(e.v);
        } else if (e.r) live.add(e.v);
      }
      if (h) for (const v of h) live.add(v);
    }
    return live;
  };
  const outOf = (b) => {
    const s = new Set();
    for (const x of b.succ) { const li = liveIn.get(x); if (li) for (const v of li) s.add(v); }
    return s;
  };
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 200) {
    changed = false;
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      const nin = transfer(b, outOf(b), null);
      const old = liveIn.get(b);
      if (nin.size !== old.size || [...nin].some((v) => !old.has(v))) { liveIn.set(b, nin); changed = true; }
    }
  }
  const dead = [];
  for (const b of blocks) transfer(b, outOf(b), (e) => dead.push(e));
  return dead;
}

// ------------------------------------------------------------------ symbolic execution
// Persistent map: small layers over a shared base, flattened when deep.
class PMap {
  constructor(own, up, depth) {
    this.own = own;
    this.up = up;
    this.depth = depth;
  }
  get(k) {
    for (let p = this; p; p = p.up) {
      const v = p.own.get(k);
      if (v !== undefined) return v;
    }
    return undefined;
  }
  with(k, v) {
    if (this.depth >= 10) {
      const m = this.flat();
      m.set(k, v);
      return new PMap(m, null, 0);
    }
    return new PMap(new Map([[k, v]]), this, this.depth + 1);
  }
  flat() {
    const chain = [];
    for (let p = this; p; p = p.up) chain.push(p);
    const out = new Map();
    for (let i = chain.length - 1; i >= 0; i--) for (const [k, v] of chain[i].own) out.set(k, v);
    return out;
  }
}

class State {
  constructor(vals, cons, paths, origin) {
    this.vals = vals;
    this.cons = cons;
    this.paths = paths;
    this.origin = origin;
    this._key = null;
  }
  clone() {
    return new State(this.vals, this.cons, this.paths, this.origin);
  }
  mask(sv) {
    const m = this.cons.get(sv);
    return m === undefined ? ALL : m;
  }
}

function maskOfLiteral(v) {
  if (v === null) return NUL;
  if (v === undefined) return UND;
  switch (typeof v) {
    case 'boolean': return v ? TRUE : FALSE;
    case 'number': return Number.isNaN(v) ? NAN : v === 0 ? ZERO : NUMNZ;
    case 'bigint': return v === 0n ? ZERO : NUMNZ;
    case 'string': return v === '' ? ESTR : STR;
    default: return OBJ;
  }
}

function typeofMask(name) {
  switch (name) {
    case 'undefined': return UND;
    case 'object': return NUL | OBJ;
    case 'function': return OBJ;
    case 'string': return STRING;
    case 'number': return NUMBER;
    case 'bigint': return ZERO | NUMNZ;
    case 'boolean': return BOOL;
    case 'symbol': return OBJ;
    default: return 0;
  }
}

class Engine {
  constructor(cfg, tracked, ctx) {
    this.cfg = cfg;
    this.trackedList = tracked;
    this.tracked = new Set(tracked);
    this.ctx = ctx;
    this.svc = 1;
    this.aborted = false;
    this.steps = 0;
    this.conds = new Map(); // test node -> { t, f, fromVar }
    this.derefs = new Map(); // node -> { node, name, origin }
    this.varIndex = new Map(tracked.map((v, i) => [v, i]));
    this.condPaths = conditionPaths(cfg.root);
  }

  fresh() { return this.svc++; }

  initState() {
    const vals = new Map();
    const cons = new Map();
    const origin = new Map();
    for (const v of this.trackedList) {
      const sv = this.fresh();
      vals.set(v, sv);
      if (v.kind === 'var' && !v.defs.some((d) => d.kind === 'param')) { cons.set(sv, UND); origin.set(sv, v.defs[0].id); }
    }
    return new State(new PMap(vals, null, 0), new PMap(cons, null, 0), new Map(), origin);
  }

  key(st) {
    if (st._key !== null) return st._key;
    const canon = new Map();
    let s = '';
    for (const v of this.trackedList) {
      const sv = st.vals.get(v);
      let c = canon.get(sv);
      if (c === undefined) { c = canon.size; canon.set(sv, c); }
      s += `${c}:${st.mask(sv)},`;
    }
    if (st.paths.size) {
      for (const [k, sv] of st.paths) {
        let c = canon.get(sv);
        if (c === undefined) { c = canon.size; canon.set(sv, c); }
        s += `${k}=${c}:${st.mask(sv)},`;
      }
    }
    st._key = s;
    return s;
  }

  join(a, b, salt) {
    if (!a) return b;
    const vals = new Map();
    const cons = new Map();
    const origin = new Map(a.origin);
    for (const [k, v] of b.origin) if (!origin.has(k)) origin.set(k, v);
    for (const v of this.trackedList) {
      const sa = a.vals.get(v);
      const sb = b.vals.get(v);
      const m = a.mask(sa) | b.mask(sb);
      let sv;
      if (sa === sb) sv = sa;
      else sv = 1e7 + salt * 4096 + this.varIndex.get(v);
      vals.set(v, sv);
      if (m !== ALL) cons.set(sv, m);
    }
    const paths = new Map();
    for (const [k, sv] of a.paths) if (b.paths.get(k) === sv) { paths.set(k, sv); const m = a.mask(sv) | b.mask(sv); if (m !== ALL) cons.set(sv, m); }
    return new State(new PMap(vals, null, 0), new PMap(cons, null, 0), paths, origin);
  }

  constrain(st, sv, mask, why) {
    if (sv == null) return st;
    const old = st.mask(sv);
    const m = old & mask;
    if (m === 0) return null;
    if (m === old) return st;
    const n = st.clone();
    n.cons = n.cons.with(sv, m);
    if (why && (m & ~NULLISH) === 0 && !st.origin.has(sv)) { n.origin = new Map(st.origin); n.origin.set(sv, why); }
    return n;
  }

  record(test, val, st) {
    let r = this.conds.get(test);
    if (!r) { r = { t: false, f: false, fromVar: false, notVar: false }; this.conds.set(test, r); }
    const m = val.mask;
    if (m & TRUTHY) r.t = true;
    if (m & FALSY) r.f = true;
    if (val.fromVar) r.fromVar = true; else r.notVar = true;
    if (val.unknownVal) r.notVar = true;
  }

  run() {
    const cfg = this.cfg;
    const visited = new Map();
    const joined = new Map();
    const queue = [[cfg.entry, this.initState()]];
    const push = (b, st) => { if (b && st && b.id >= 0) queue.push([b, st]); };
    const handlerState = new Map();
    const toHandler = (b, st) => {
      if (!b.handler) return;
      const prev = handlerState.get(b.handler);
      const j = this.join(prev, st, b.handler.id + 1);
      if (prev && this.key(prev) === this.key(j)) return;
      handlerState.set(b.handler, j);
      push(b.handler, j);
    };
    while (queue.length) {
      if (++this.steps > MAX_STEPS) { this.aborted = true; return; }
      let [b, st] = queue.pop();
      let seen = visited.get(b);
      if (!seen) { seen = new Set(); visited.set(b, seen); }
      const k = this.key(st);
      if (seen.has(k)) continue;
      if (seen.size >= MAX_STATES) {
        const prev = joined.get(b);
        const j = this.join(prev, st, b.id + 2048);
        const jk = this.key(j);
        if (seen.has(jk)) continue;
        joined.set(b, j);
        st = j;
        seen.add(jk);
      } else seen.add(k);
      let states = [st];
      toHandler(b, st);
      for (const el of b.elements) {
        const next = [];
        for (const s of states) for (const r of this.element(el, s)) next.push(r);
        states = this.limit(next, b.id);
        if (b.handler) for (const s of states) toHandler(b, s);
        if (!states.length) break;
      }
      if (!states.length) continue;
      if (b.test) {
        for (const s of states) {
          if (b.testKind === 'case') {
            for (const r of this.caseTest(b, s)) push(r.succ, r.state);
            continue;
          }
          for (const r of this.expr(b.test, s)) {
            this.record(b.test, r.val, r.state);
            const m = r.val.mask;
            if (b.trueSucc && (m & TRUTHY)) push(b.trueSucc, r.val.refine ? r.val.refine(r.state, true) : r.state);
            if (b.falseSucc && (m & FALSY)) push(b.falseSucc, r.val.refine ? r.val.refine(r.state, false) : r.state);
          }
        }
      } else {
        for (const s of states) for (const x of b.succ) push(x, s);
      }
    }
  }

  limit(list, salt) {
    list = this.dedupeStates(list);
    if (list.length <= MAX_FORK) return list;
    let j = null;
    for (const s of list) j = this.join(j, s, salt + 8192);
    return [j];
  }

  caseTest(b, s) {
    const out = [];
    for (const d of this.expr(b.discriminant, s)) {
      for (const r of this.expr(b.test, d.state)) {
        let st = r.state;
        let tState = st;
        let fState = st;
        if (d.val.sv != null && SINGLETON.has(r.val.mask)) {
          tState = this.constrain(st, d.val.sv, r.val.mask);
          fState = this.constrain(st, d.val.sv, ALL & ~r.val.mask);
        }
        if (tState) out.push({ succ: b.trueSucc, state: tState });
        if (fState) out.push({ succ: b.falseSucc, state: fState });
      }
    }
    return out;
  }

  // -------------------------------------------------- elements
  element(el, s) {
    switch (el.type) {
      case 'Params': {
        let st = s;
        for (const p of el.node.params) {
          const q = p.type === 'TSParameterProperty' ? p.parameter : p;
          if (q.type === 'AssignmentPattern') {
            // value is the argument, or the default when undefined
            const res = this.expr(q.right, st);
            if (res.length) st = res[0].state;
          }
        }
        return [st];
      }
      case 'VariableDeclarator': {
        const kind = el.parent && el.parent.kind;
        if (!el.init) {
          if (kind === 'var') return [s];
          return this.bindPattern(el.id, { sv: null, mask: UND }, s, el.id);
        }
        const out = [];
        for (const r of this.expr(el.init, s)) for (const x of this.bindPattern(el.id, r.val, r.state, el)) out.push(x);
        return out;
      }
      case 'ReturnStatement': case 'ThrowStatement':
        if (!el.argument) return [s];
        return this.expr(el.argument, s).map((r) => r.state);
      case 'ForRight': {
        const out = [];
        for (const r of this.expr(el.node.right, s)) {
          if (el.node.type === 'ForOfStatement') {
            const st = this.deref(el.node.right, r.val, r.state);
            if (st) out.push(st);
          } else out.push(r.state);
        }
        return out;
      }
      case 'ForEachAssign': {
        const left = el.node.left;
        const pat = left.type === 'VariableDeclaration' ? left.declarations[0].id : left;
        return this.bindPattern(pat, { sv: null, mask: el.node.type === 'ForInStatement' ? STR : ALL }, s, null);
      }
      case 'CatchParam':
        if (!el.node.param) return [s];
        return this.bindPattern(el.node.param, { sv: null, mask: ALL }, s, null);
      case 'ClassDeclaration':
        if (el.superClass) return this.expr(el.superClass, s).map((r) => r.state);
        return [s];
      case 'Opaque':
        return [this.clearPaths(s)];
      case 'FunctionDeclaration': case 'TSInterfaceDeclaration':
        return [s];
      default:
        return this.expr(el, s).map((r) => r.state);
    }
  }

  trackedVar(id) {
    const r = id._ref;
    if (!r || !r.resolved) return null;
    return this.tracked.has(r.resolved) ? r.resolved : null;
  }

  declVar(id) {
    const v = id._var;
    return v && this.tracked.has(v) ? v : null;
  }

  bindPattern(p, val, s, why) {
    if (p.type === 'Identifier') {
      const v = this.declVar(p) || this.trackedVar(p);
      if (!v) return [s];
      return [this.assignVar(s, v, val, why)];
    }
    // destructuring: TypeError when the value is null / undefined
    let st = s;
    if (val && (val.mask & ~NULLISH) === 0 && val.mask) {
      return [];
    }
    if (val && val.sv != null) st = this.constrain(st, val.sv, ALL & ~NULLISH) || st;
    const ids = [];
    collectIds(p, ids);
    for (const id of ids) {
      const v = this.declVar(id) || this.trackedVar(id);
      if (v) st = this.assignVar(st, v, { sv: null, mask: ALL }, null);
    }
    return [st];
  }

  assignVar(s, v, val, why) {
    const n = s.clone();
    let sv = val.sv;
    if (sv == null) {
      sv = this.fresh();
      if (val.mask !== ALL) n.cons = n.cons.with(sv, val.mask);
      if (why && (val.mask & ~NULLISH) === 0) { n.origin = new Map(s.origin); n.origin.set(sv, why); }
    }
    n.vals = n.vals.with(v, sv);
    if (n.paths.size) {
      // paths rooted at this variable change meaning
      let drop = null;
      for (const k of n.paths.keys()) if (k === v.name || k.startsWith(`${v.name}.`)) (drop || (drop = [])).push(k);
      if (drop) { n.paths = new Map(n.paths); for (const k of drop) n.paths.delete(k); }
    }
    return n;
  }

  clearPaths(s) {
    if (!s.paths.size) return s;
    const n = s.clone();
    n.paths = new Map();
    return n;
  }

  // Dereference of `val` (member access / call / for-of). Returns the
  // continuing state, or null when the path always throws.
  deref(node, val, st) {
    if (!st) return null;
    const m = val.mask;
    if (m !== 0 && (m & ~NULLISH) === 0) {
      if (val.fromVar && !val.fromPath && !this.derefs.has(node)) {
        this.derefs.set(node, { node, name: val.name, origin: val.sv != null ? st.origin.get(val.sv) : null, mask: m });
      }
      return null;
    }
    if (val.sv != null && (m & NULLISH)) return this.constrain(st, val.sv, ALL & ~NULLISH);
    return st;
  }

  // -------------------------------------------------- expressions
  // Returns [{ state, val }]; val = { sv, mask, refine?, fromVar?, name? }
  expr(n, s) {
    switch (n.type) {
      case 'Literal':
        if (n.regex) return [{ state: s, val: { sv: null, mask: OBJ } }];
        if (n.bigint != null) return [{ state: s, val: { sv: null, mask: n.bigint === '0' ? ZERO : NUMNZ } }];
        return [{ state: s, val: { sv: null, mask: maskOfLiteral(n.value), lit: true } }];
      case 'Identifier': return [{ state: s, val: this.ident(n, s) }];
      case 'TemplateLiteral': {
        let res = [{ state: s }];
        for (const e of n.expressions) res = this.chain(res, e);
        const nonEmpty = n.quasis.some((q) => q.value.raw !== '');
        return res.map((r) => ({ state: r.state, val: { sv: null, mask: nonEmpty ? STR : STRING } }));
      }
      case 'ThisExpression': case 'Super': case 'MetaProperty':
        return [{ state: s, val: { sv: null, mask: n.type === 'MetaProperty' ? ALL : OBJ } }];
      case 'FunctionExpression': case 'ArrowFunctionExpression':
        return [{ state: s, val: { sv: null, mask: OBJ } }];
      case 'ClassExpression':
        if (n.superClass) return this.expr(n.superClass, s).map((r) => ({ state: r.state, val: { sv: null, mask: OBJ } }));
        return [{ state: s, val: { sv: null, mask: OBJ } }];
      case 'ArrayExpression': {
        let res = [{ state: s }];
        for (const e of n.elements) {
          if (!e) continue;
          if (e.type === 'SpreadElement') res = this.spread(res, e.argument);
          else res = this.chain(res, e);
        }
        return res.map((r) => ({ state: r.state, val: { sv: null, mask: OBJ } }));
      }
      case 'ObjectExpression': {
        let res = [{ state: s }];
        for (const p of n.properties) {
          if (p.type === 'SpreadElement') res = this.chain(res, p.argument);
          else {
            if (p.computed) res = this.chain(res, p.key);
            if (p.value.type !== 'FunctionExpression' && p.value.type !== 'AssignmentPattern') res = this.chain(res, p.value);
          }
        }
        return res.map((r) => ({ state: r.state, val: { sv: null, mask: OBJ } }));
      }
      case 'SequenceExpression': {
        let res = [{ state: s, val: { sv: null, mask: UND } }];
        for (const e of n.expressions) res = this.chainVal(res, e);
        return res;
      }
      case 'UnaryExpression': return this.unary(n, s);
      case 'UpdateExpression': {
        const arg = n.argument;
        if (arg.type === 'Identifier') {
          const v = this.trackedVar(arg);
          if (v) return [{ state: this.assignVar(s, v, { sv: null, mask: NUMBER }, null), val: { sv: null, mask: NUMBER } }];
          return [{ state: s, val: { sv: null, mask: NUMBER } }];
        }
        return this.memberWrite(arg, s).map((st) => ({ state: st, val: { sv: null, mask: NUMBER } }));
      }
      case 'BinaryExpression': return this.binary(n, s);
      case 'LogicalExpression': return this.logical(n, s);
      case 'ConditionalExpression': {
        const out = [];
        for (const r of this.expr(n.test, s)) {
          this.record(n.test, r.val, r.state);
          const m = r.val.mask;
          if (m & TRUTHY) { const st = r.val.refine ? r.val.refine(r.state, true) : r.state; if (st) for (const x of this.expr(n.consequent, st)) out.push(x); }
          if (m & FALSY) { const st = r.val.refine ? r.val.refine(r.state, false) : r.state; if (st) for (const x of this.expr(n.alternate, st)) out.push(x); }
        }
        return this.limitVals(out, n);
      }
      case 'AssignmentExpression': return this.assign(n, s);
      case 'MemberExpression': return this.member(n, s, false).filter((r) => !r.short || true).map((r) => (r.short ? { state: r.state, val: { sv: null, mask: UND } } : r));
      case 'ChainExpression': {
        const res = n.expression.type === 'CallExpression' ? this.call(n.expression, s, true) : this.member(n.expression, s, true);
        return res.map((r) => (r.short ? { state: r.state, val: { sv: null, mask: UND } } : r));
      }
      case 'CallExpression': return this.call(n, s, false).map((r) => (r.short ? { state: r.state, val: { sv: null, mask: UND } } : r));
      case 'NewExpression': {
        let res = this.expr(n.callee, s).map((r) => ({ state: r.state }));
        for (const a of n.arguments) res = a.type === 'SpreadElement' ? this.spread(res, a.argument) : this.chain(res, a);
        return res.map((r) => ({ state: this.clearPaths(r.state), val: { sv: null, mask: OBJ } }));
      }
      case 'AwaitExpression': case 'YieldExpression': {
        if (!n.argument) return [{ state: this.clearPaths(s), val: { sv: null, mask: ALL } }];
        return this.expr(n.argument, s).map((r) => ({ state: this.clearPaths(r.state), val: { sv: null, mask: ALL } }));
      }
      case 'TaggedTemplateExpression': {
        let res = this.expr(n.tag, s).map((r) => ({ state: r.state }));
        for (const e of n.quasi.expressions) res = this.chain(res, e);
        return res.map((r) => ({ state: this.clearPaths(r.state), val: { sv: null, mask: ALL } }));
      }
      case 'TSAsExpression': case 'TSSatisfiesExpression': case 'TSTypeAssertion': case 'TSInstantiationExpression':
        return this.expr(n.expression, s);
      case 'TSNonNullExpression':
        return this.expr(n.expression, s).map((r) => {
          const st = r.val.sv != null ? (this.constrain(r.state, r.val.sv, ALL & ~NULLISH) || r.state) : r.state;
          return { state: st, val: { ...r.val, mask: r.val.mask & ~NULLISH || OBJ, refine: null } };
        });
      case 'ImportExpression':
        return this.expr(n.source, s).map((r) => ({ state: r.state, val: { sv: null, mask: OBJ } }));
      case 'JSXElement': case 'JSXFragment': {
        let res = [{ state: s }];
        // siblings do not need path sensitivity between them: join after each child
        const step = (r, e) => {
          const out = this.chain(r, e);
          if (out.length <= 1) return out;
          let j = null;
          for (const x of out) j = this.join(j, x.state, (e.start % 1000) + 7000);
          return [{ state: j }];
        };
        const visitJsx = (node) => {
          if (node.type === 'JSXElement') {
            for (const a of node.openingElement.attributes) {
              if (a.type === 'JSXSpreadAttribute') res = step(res, a.argument);
              else if (a.value && a.value.type === 'JSXExpressionContainer' && a.value.expression.type !== 'JSXEmptyExpression') res = step(res, a.value.expression);
              else if (a.value && (a.value.type === 'JSXElement' || a.value.type === 'JSXFragment')) visitJsx(a.value);
            }
          }
          for (const c of node.children) {
            if (c.type === 'JSXExpressionContainer' && c.expression.type !== 'JSXEmptyExpression') res = step(res, c.expression);
            else if (c.type === 'JSXElement' || c.type === 'JSXFragment') visitJsx(c);
          }
        };
        visitJsx(n);
        return res.map((r) => ({ state: r.state, val: { sv: null, mask: OBJ } }));
      }
      case 'SpreadElement':
        return this.expr(n.argument, s);
      default:
        return [{ state: s, val: { sv: null, mask: ALL } }];
    }
  }

  limitVals(list, node) {
    if (list.length <= 1) return list;
    list = this.mergeResults(list);
    if (list.length <= MAX_FORK) return list;
    let j = null;
    let mask = 0;
    let fromVar = false;
    for (const r of list) { j = this.join(j, r.state, (node.start % 1000) + 9000); mask |= r.val.mask; fromVar = fromVar || !!r.val.fromVar; }
    return [{ state: j, val: { sv: null, mask, fromVar } }];
  }

  // Merge results that share a state (same object or same key); values are joined.
  mergeResults(list) {
    const byObj = new Map();
    for (const r of list) {
      const e = byObj.get(r.state);
      if (e) e.val = mergeVal(e.val, r.val); else byObj.set(r.state, { state: r.state, val: r.val, short: r.short });
    }
    let out = [...byObj.values()];
    if (out.length > 3) {
      const byKey = new Map();
      for (const r of out) {
        const k = this.key(r.state) + (r.short ? '|s' : '');
        const e = byKey.get(k);
        if (e) e.val = mergeVal(e.val, r.val); else byKey.set(k, r);
      }
      out = [...byKey.values()];
    }
    return out;
  }

  dedupeStates(list) {
    if (list.length <= 1) return list;
    const seen = new Set();
    const out = [];
    for (const s of list) { if (seen.has(s)) continue; seen.add(s); out.push(s); }
    if (out.length <= 3) return out;
    const keys = new Set();
    const res = [];
    for (const s of out) { const k = this.key(s); if (keys.has(k)) continue; keys.add(k); res.push(s); }
    return res;
  }

  // Evaluate e for each partial result, dropping its value.
  chain(res, e) {
    const states = [];
    for (const r of res) for (const x of this.expr(e, r.state)) states.push(x.state);
    let out = this.dedupeStates(states);
    if (out.length > MAX_FORK) { let j = null; for (const s of out) j = this.join(j, s, (e.start % 1000) + 9000); out = [j]; }
    return out.map((state) => ({ state }));
  }

  chainVal(res, e) {
    const out = [];
    for (const r of res) for (const x of this.expr(e, r.state)) out.push(x);
    return this.limitVals(out, e);
  }

  spread(res, arg) {
    const out = [];
    for (const r of res) {
      for (const x of this.expr(arg, r.state)) {
        const st = this.deref(arg, x.val, x.state);
        if (st) out.push({ state: st });
      }
    }
    return out;
  }

  ident(n, s) {
    const v = this.trackedVar(n);
    if (v) {
      const sv = s.vals.get(v);
      return { sv, mask: s.mask(sv), fromVar: true, name: n.name, refine: (st, t) => this.constrain(st, sv, t ? TRUTHY : FALSY, n) };
    }
    if (!n._ref || !n._ref.resolved) {
      if (n.name === 'undefined') return { sv: null, mask: UND, lit: true };
      if (n.name === 'NaN') return { sv: null, mask: NAN, lit: true };
      if (n.name === 'Infinity') return { sv: null, mask: NUMNZ, lit: true };
    }
    return { sv: null, mask: ALL, unknownVal: true };
  }

  pathKey(n) {
    // pure member chains rooted at an identifier or this
    const name = dottedName(n);
    if (!name || name.startsWith('super')) return null;
    return name;
  }

  pathVal(n, st) {
    const k = this.pathKey(n);
    if (!k || !this.condPaths.has(k)) return null;
    let sv = st.paths.get(k);
    let state = st;
    if (sv === undefined) {
      sv = this.fresh();
      state = st.clone();
      state.paths = new Map(st.paths);
      state.paths.set(k, sv);
    }
    return { state, val: { sv, mask: state.mask(sv), fromPath: true, refine: (x, t) => this.constrain(x, sv, t ? TRUTHY : FALSY) } };
  }

  unary(n, s) {
    const op = n.operator;
    if (op === 'delete') {
      const arg = n.argument;
      if (arg.type === 'MemberExpression') return this.member(arg, s, false).map((r) => ({ state: this.clearPaths(r.state), val: { sv: null, mask: BOOL } }));
      return this.expr(arg, s).map((r) => ({ state: r.state, val: { sv: null, mask: BOOL } }));
    }
    if (op === 'typeof' && n.argument.type === 'Identifier' && !this.trackedVar(n.argument)) {
      return [{ state: s, val: { sv: null, mask: STR } }];
    }
    return this.expr(n.argument, s).map((r) => {
      const a = r.val;
      switch (op) {
        case '!': {
          let mask = 0;
          if (a.mask & TRUTHY) mask |= FALSE;
          if (a.mask & FALSY) mask |= TRUE;
          return { state: r.state, val: { sv: null, mask, fromVar: a.fromVar, fromPath: a.fromPath, refine: a.refine ? (st, t) => a.refine(st, !t) : null } };
        }
        case 'typeof': return { state: r.state, val: { sv: null, mask: STR, typeofOf: a } };
        case 'void': return { state: r.state, val: { sv: null, mask: UND } };
        default: return { state: r.state, val: { sv: null, mask: op === '~' ? ZERO | NUMNZ : NUMBER } };
      }
    });
  }

  binary(n, s) {
    const out = [];
    const op = n.operator;
    for (const l of this.expr(n.left, s)) {
      for (const r of this.expr(n.right, l.state)) {
        out.push(this.binVal(n, op, l.val, r.val, r.state));
      }
    }
    return this.limitVals(out.filter(Boolean), n);
  }

  binVal(n, op, a, b, st) {
    const fromVar = !!(a.fromVar || b.fromVar);
    const fromPath = !!(a.fromPath || b.fromPath) && !fromVar;
    switch (op) {
      case '===': case '!==': case '==': case '!=': {
        const neg = op[0] === '!';
        const strict = op.length === 3;
        // typeof x === 'name'
        if ((a.typeofOf || b.typeofOf) && (b.lit || a.lit || true)) {
          const t = a.typeofOf ? a : b;
          const other = a.typeofOf ? n.right : n.left;
          const sv = staticValue(other);
          if (sv && typeof sv.value === 'string') {
            const tm = typeofMask(sv.value);
            const x = t.typeofOf;
            const m = x.mask;
            let mask = 0;
            if (tm === 0) mask = neg ? TRUE : FALSE;
            else {
              const canEq = (m & tm) !== 0;
              const exact = tm === UND || tm === STRING || tm === BOOL || tm === NUMBER;
              const canNe = sv.value === 'object' ? (m & ~(NUL | OBJ)) !== 0 || (m & OBJ) !== 0 : (sv.value === 'function' || sv.value === 'symbol' || sv.value === 'bigint') ? true : (m & ~tm) !== 0;
              if (canEq) mask |= neg ? FALSE : TRUE;
              if (canNe) mask |= neg ? TRUE : FALSE;
              void exact;
            }
            const refine = x.sv != null && tm !== 0 ? (s2, truth) => {
              const eq = neg ? !truth : truth;
              if (eq) return this.constrain(s2, x.sv, tm);
              if (sv.value === 'object') return this.constrain(s2, x.sv, ALL & ~NUL);
              if (sv.value === 'function' || sv.value === 'symbol' || sv.value === 'bigint') return s2;
              return this.constrain(s2, x.sv, ALL & ~tm);
            } : null;
            return { state: st, val: { sv: null, mask, fromVar: x.fromVar, fromPath: x.fromPath && !x.fromVar, refine } };
          }
        }
        let canEq;
        let canNe;
        if (strict) {
          canEq = (a.mask & b.mask & ~NAN) !== 0;
          canNe = !(SINGLETON.has(a.mask) && a.mask === b.mask);
        } else {
          const an = (a.mask & NULLISH) !== 0;
          const bn = (b.mask & NULLISH) !== 0;
          const aOnlyN = (a.mask & ~NULLISH) === 0;
          const bOnlyN = (b.mask & ~NULLISH) === 0;
          if (aOnlyN || bOnlyN) {
            // comparison with null / undefined
            canEq = aOnlyN ? bn : an;
            canNe = aOnlyN ? (b.mask & ~NULLISH) !== 0 : (a.mask & ~NULLISH) !== 0;
          } else { canEq = true; canNe = true; }
        }
        let mask = 0;
        if (canEq) mask |= neg ? FALSE : TRUE;
        if (canNe) mask |= neg ? TRUE : FALSE;
        if (!mask) mask = BOOL;
        const refineSide = (s2, side, other, eq) => {
          if (side.sv == null || !s2) return s2;
          if (strict) {
            if (eq) return this.constrain(s2, side.sv, other.mask & ~NAN, null);
            if (SINGLETON.has(other.mask)) return this.constrain(s2, side.sv, ALL & ~other.mask);
            return s2;
          }
          if ((other.mask & ~NULLISH) === 0) {
            return eq ? this.constrain(s2, side.sv, NULLISH, null) : this.constrain(s2, side.sv, ALL & ~NULLISH);
          }
          return s2;
        };
        const refine = (s2, truth) => {
          const eq = neg ? !truth : truth;
          let x = refineSide(s2, a, b, eq);
          if (!x) return null;
          x = refineSide(x, b, a, eq);
          return x;
        };
        return { state: st, val: { sv: null, mask, fromVar, fromPath, refine } };
      }
      case 'instanceof':
        return { state: st, val: { sv: null, mask: BOOL, fromVar: false, refine: a.sv != null ? (s2, t) => (t ? this.constrain(s2, a.sv, OBJ) : s2) : null } };
      case 'in': {
        const s2 = this.deref(n.right, b, st);
        if (!s2) return null;
        return { state: s2, val: { sv: null, mask: BOOL, refine: b.sv != null ? (s3, t) => (t ? this.constrain(s3, b.sv, OBJ) : s3) : null } };
      }
      case '<': case '>': case '<=': case '>=':
        return { state: st, val: { sv: null, mask: BOOL } };
      case '+': {
        let mask;
        if ((a.mask & ~STRING) === 0 || (b.mask & ~STRING) === 0) mask = ((a.mask & STR) || (b.mask & STR)) ? STR : STRING;
        else if ((a.mask & (STRING | OBJ)) === 0 && (b.mask & (STRING | OBJ)) === 0) mask = NUMBER;
        else mask = NUMBER | STRING;
        return { state: st, val: { sv: null, mask } };
      }
      default:
        return { state: st, val: { sv: null, mask: op === '&' || op === '|' || op === '^' || op === '<<' || op === '>>' || op === '>>>' ? ZERO | NUMNZ : NUMBER } };
    }
  }

  logical(n, s) {
    const out = [];
    const op = n.operator;
    for (const l of this.expr(n.left, s)) {
      this.record(n.left, op === '??' ? { ...l.val, mask: (l.val.mask & NULLISH ? FALSY : 0) | (l.val.mask & ~NULLISH ? TRUTHY : 0) } : l.val, l.state);
      const m = l.val.mask;
      if (op === '&&' || op === '||') {
        const shortT = op === '||';
        // short-circuit branch keeps the left value
        const shortMask = m & (shortT ? TRUTHY : FALSY);
        if (shortMask) {
          const st = l.val.refine ? l.val.refine(l.state, shortT) : l.state;
          if (st) out.push({ state: st, val: { ...l.val, mask: shortMask } });
        }
        const goMask = m & (shortT ? FALSY : TRUTHY);
        if (goMask) {
          const st = l.val.refine ? l.val.refine(l.state, !shortT) : l.state;
          if (st) for (const r of this.expr(n.right, st)) out.push({ state: r.state, val: { ...r.val, fromVar: r.val.fromVar || l.val.fromVar } });
        }
      } else {
        const nn = m & ~NULLISH;
        if (nn) {
          const st = l.val.sv != null ? this.constrain(l.state, l.val.sv, ALL & ~NULLISH) : l.state;
          if (st) out.push({ state: st, val: { ...l.val, mask: nn } });
        }
        if (m & NULLISH) {
          const st = l.val.sv != null ? this.constrain(l.state, l.val.sv, NULLISH) : l.state;
          if (st) for (const r of this.expr(n.right, st)) out.push(r);
        }
      }
    }
    return this.limitVals(out, n);
  }

  assign(n, s) {
    const op = n.operator;
    const left = n.left;
    if (left.type === 'Identifier') {
      const v = this.trackedVar(left);
      if (op === '=') {
        return this.expr(n.right, s).map((r) => ({ state: v ? this.assignVar(this.dropPath(r.state, left.name), v, r.val, n) : this.dropPath(r.state, left.name), val: r.val }));
      }
      if (op === '&&=' || op === '||=' || op === '??=') {
        const logicalOp = op.slice(0, 2);
        const fake = { type: 'LogicalExpression', operator: logicalOp, left, right: n.right, start: n.start, end: n.end };
        return this.logical(fake, s).map((r) => ({ state: v ? this.assignVar(r.state, v, r.val, n) : r.state, val: r.val }));
      }
      const out = [];
      for (const r of this.expr(n.right, s)) {
        const cur = this.ident(left, r.state);
        const res = this.binVal(n, op.slice(0, -1), cur, r.val, r.state);
        if (!res) continue;
        out.push({ state: v ? this.assignVar(res.state, v, { sv: null, mask: res.val.mask }, null) : res.state, val: { sv: null, mask: res.val.mask } });
      }
      return out;
    }
    if (left.type === 'MemberExpression') {
      const out = [];
      for (const r0 of this.member(left, s, false, true)) {
        if (r0.short) continue;
        for (const r of this.expr(n.right, r0.state)) {
          let st = this.clearPaths(r.state);
          const k = this.pathKey(left);
          if (k && op === '=') {
            const sv = r.val.sv != null ? r.val.sv : this.fresh();
            st = st.clone();
            st.paths = new Map();
            st.paths.set(k, sv);
            if (r.val.sv == null && r.val.mask !== ALL) st.cons = st.cons.with(sv, r.val.mask);
          }
          out.push({ state: st, val: op === '=' ? r.val : { sv: null, mask: ALL } });
        }
      }
      return out;
    }
    // destructuring assignment
    const out = [];
    for (const r of this.expr(n.right, s)) {
      for (const st of this.bindPattern(left, r.val, r.state, null)) out.push({ state: this.clearPaths(st), val: r.val });
    }
    return out;
  }

  dropPath(s, name) {
    if (!s.paths.size) return s;
    let drop = null;
    for (const k of s.paths.keys()) if (k === name || k.startsWith(`${name}.`)) (drop || (drop = [])).push(k);
    if (!drop) return s;
    const n = s.clone();
    n.paths = new Map(s.paths);
    for (const k of drop) n.paths.delete(k);
    return n;
  }

  memberWrite(m, s) {
    return this.member(m, s, false, true).filter((r) => !r.short).map((r) => this.clearPaths(r.state));
  }

  // Member access. Results may carry short:true (optional chain short-circuit).
  member(n, s, inChain, isWrite) {
    const out = [];
    const obj = n.object;
    let objRes;
    if (inChain && (obj.type === 'MemberExpression' || obj.type === 'CallExpression')) {
      objRes = obj.type === 'MemberExpression' ? this.member(obj, s, true) : this.call(obj, s, true);
    } else objRes = this.expr(obj, s);
    for (const o of objRes) {
      if (o.short) { out.push(o); continue; }
      let st = o.state;
      const m = o.val.mask;
      if (n.optional) {
        if (m & NULLISH) {
          const ns = o.val.sv != null ? this.constrain(st, o.val.sv, NULLISH) : st;
          if (ns) out.push({ state: ns, short: true, val: { sv: null, mask: UND } });
        }
        if (!(m & ~NULLISH)) continue;
        st = o.val.sv != null ? this.constrain(st, o.val.sv, ALL & ~NULLISH) : st;
        if (!st) continue;
      } else {
        st = this.deref(n, { ...o.val, name: o.val.name || dottedName(obj) }, st);
        if (!st) continue;
      }
      if (n.computed) {
        for (const p of this.expr(n.property, st)) out.push(this.memberValue(n, p.state, isWrite));
      } else out.push(this.memberValue(n, st, isWrite));
    }
    return out;
  }

  memberValue(n, st, isWrite) {
    if (!isWrite) {
      const pv = this.pathVal(n, st);
      if (pv) return pv;
      const p = propName(n);
      if (p === 'length') return { state: st, val: { sv: null, mask: NUMBER } };
    }
    return { state: st, val: { sv: null, mask: ALL } };
  }

  call(n, s, inChain) {
    const callee = unwrapTS(n.callee);
    let res;
    if (callee.type === 'MemberExpression') {
      res = this.member(callee, s, inChain).map((r) => (r.short ? r : { state: r.state, val: r.val }));
    } else if (inChain && callee.type === 'CallExpression') res = this.call(callee, s, true);
    else res = this.expr(n.callee, s);
    const out = [];
    for (const r of res) {
      if (r.short) { out.push(r); continue; }
      let st = r.state;
      if (n.optional) {
        const m = r.val.mask;
        if (m & NULLISH) out.push({ state: st, short: true, val: { sv: null, mask: UND } });
        if (!(m & ~NULLISH)) continue;
      } else if (callee.type === 'Identifier') {
        st = this.deref(n, r.val, st);
        if (!st) continue;
      }
      let args = [{ state: st, vals: [] }];
      for (const a of n.arguments) {
        const next = [];
        for (const x of args) {
          if (a.type === 'SpreadElement') {
            for (const y of this.expr(a.argument, x.state)) {
              const z = this.deref(a.argument, y.val, y.state);
              if (z) next.push({ state: z, vals: x.vals.concat([{ sv: null, mask: ALL }]) });
            }
          } else for (const y of this.expr(a, x.state)) next.push({ state: y.state, vals: x.vals.concat([y.val]) });
        }
        args = next;
        if (args.length > 1) {
          const seen = new Map();
          for (const x of args) { if (!seen.has(x.state)) seen.set(x.state, x); else seen.get(x.state).vals = seen.get(x.state).vals.map((v, i) => mergeVal(v, x.vals[i])); }
          args = [...seen.values()];
        }
        if (args.length > MAX_FORK) { this.aborted = true; args = args.slice(0, MAX_FORK); }
      }
      for (const x of args) out.push(this.callResult(n, callee, x.state, x.vals));
    }
    return out;
  }

  callResult(n, callee, st, vals) {
    const name = dottedName(callee);
    const a0 = vals[0];
    switch (name) {
      case 'Array.isArray':
        if (a0) return { state: this.clearPaths(st), val: { sv: null, mask: BOOL, refine: a0.sv != null ? (s2, t) => (t ? this.constrain(s2, a0.sv, OBJ) : s2) : null } };
        break;
      case 'Boolean':
        if (a0) return { state: st, val: { ...a0, mask: (a0.mask & TRUTHY ? TRUE : 0) | (a0.mask & FALSY ? FALSE : 0) } };
        break;
      case 'String': return { state: this.clearPaths(st), val: { sv: null, mask: STRING } };
      case 'Number': case 'parseInt': case 'parseFloat': case 'Math.round': case 'Math.floor': case 'Math.ceil': case 'Math.max': case 'Math.min': case 'Math.abs':
        return { state: this.clearPaths(st), val: { sv: null, mask: NUMBER } };
      case 'assert': case 'assert.ok': case 'console.assert': case 'invariant': case 'assert.strict': {
        if (a0 && a0.refine && name !== 'console.assert') {
          const s2 = a0.refine(st, true);
          if (s2) return { state: this.clearPaths(s2), val: { sv: null, mask: UND } };
        }
        break;
      }
      default: break;
    }
    return { state: this.clearPaths(st), val: { sv: null, mask: ALL } };
  }
}

function mergeVal(a, b) {
  if (a === b) return a;
  const same = a.sv != null && a.sv === b.sv;
  return { sv: same ? a.sv : null, mask: a.mask | b.mask, fromVar: !!(a.fromVar || b.fromVar), fromPath: !!(a.fromPath && b.fromPath), name: a.name || b.name, refine: same ? a.refine : null, unknownVal: !!(a.unknownVal || b.unknownVal) };
}

function collectIds(p, out) {
  if (!p) return;
  switch (p.type) {
    case 'Identifier': out.push(p); break;
    case 'ObjectPattern': for (const q of p.properties) collectIds(q.type === 'RestElement' ? q.argument : q.value, out); break;
    case 'ArrayPattern': for (const e of p.elements) collectIds(e, out); break;
    case 'RestElement': collectIds(p.argument, out); break;
    case 'AssignmentPattern': collectIds(p.left, out); break;
    case 'TSParameterProperty': collectIds(p.parameter, out); break;
    default: break;
  }
}

// Member chains of this function that are tested in conditions (only those
// get path values; others would only multiply states).
function conditionPaths(root) {
  const out = new Set();
  const body = root.type === 'Program' ? root : root.body;
  const visit = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n !== root && isFunction(n)) return;
    if (n.type === 'MemberExpression' && relevantRef(n) && !(n.parent && n.parent.type === 'MemberExpression' && n.parent.object === n) && !(n.parent && n.parent.type === 'CallExpression' && n.parent.callee === n)) {
      const k = dottedName(n);
      if (k) out.add(k);
    }
    for (const key in n) {
      if (key === 'parent' || key === 'comments' || key.charCodeAt(0) === 95) continue;
      const v = n[key];
      if (v === null || typeof v !== 'object') continue;
      if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') visit(x); } else if (typeof v.type === 'string') visit(v);
    }
  };
  visit(body);
  return out;
}

// Is this read in a position where the engine uses the value's constraint?
const EQ_OPS = new Set(['==', '!=', '===', '!==', 'in', 'instanceof']);
function relevantRef(id) {
  let n = id;
  let p = n.parent;
  while (p && (p.type === 'TSAsExpression' || p.type === 'TSSatisfiesExpression' || p.type === 'TSTypeAssertion' || p.type === 'ChainExpression' || p.type === 'TSNonNullExpression')) { n = p; p = p.parent; }
  if (!p) return false;
  switch (p.type) {
    case 'MemberExpression': return p.object === n;
    case 'CallExpression': case 'NewExpression': return p.callee === n;
    case 'IfStatement': case 'WhileStatement': case 'DoWhileStatement': case 'ForStatement': return p.test === n;
    case 'ConditionalExpression': return true;
    case 'LogicalExpression': return true;
    case 'UnaryExpression': return p.operator === '!' || p.operator === 'typeof';
    case 'BinaryExpression': return EQ_OPS.has(p.operator);
    case 'VariableDeclarator': return p.init === n;
    case 'AssignmentExpression': return p.right === n || p.operator !== '=';
    case 'ForOfStatement': return p.right === n;
    case 'SpreadElement': return true;
    case 'SwitchStatement': return p.discriminant === n;
    case 'TaggedTemplateExpression': return p.tag === n;
    default: return false;
  }
}

function seRelevant(v) {
  return v.refs.some((r) => r.read && !r.type && relevantRef(r.id));
}

function analyzeFunction(fnNode, cfg, sm, ctx) {
  const tracked = trackedVariables(fnNode, sm);
  const dead = liveness(cfg, tracked.filter((v) => !v.captured));
  const eng = new Engine(cfg, tracked.filter(seRelevant), ctx);
  try { eng.run(); } catch (err) { eng.aborted = true; if (ctx && ctx.debug) throw err; }
  return { tracked, dead, aborted: eng.aborted, conds: eng.aborted ? new Map() : eng.conds, derefs: eng.aborted ? new Map() : eng.derefs, steps: eng.steps };
}

module.exports = { analyzeFunction, trackedVariables, liveness, MASK: { NUL, UND, FALSE, TRUE, ZERO, NUMNZ, NAN, ESTR, STR, OBJ, ALL, FALSY, TRUTHY, NULLISH } };
