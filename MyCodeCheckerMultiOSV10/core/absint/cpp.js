'use strict';

// C++ checkers of the abstract interpreter that work on the typed AST and the
// CFG with small dedicated dataflow analyses (one per function):
//
//   USE_AFTER_MOVE       a local moved with std::move is used again
//   INVALIDATE_ITERATOR  an iterator used after its container was modified
//   MISMATCHED_ITERATOR  iterators of two different containers combined
//   FORWARD_NULL         dereference of an empty std::optional
//   OVERRUN              front()/back()/[i] of a container known to be empty
//   RETURN_LOCAL         c_str()/data() of a local std::string returned
//   USE_AFTER_FREE       c_str() of a temporary std::string used later
//   DELETE_VOID          delete of a void pointer
//   VIRTUAL_DTOR         delete through a base without a virtual destructor
//   UNCAUGHT_EXCEPT      an exception leaves main, a destructor or a noexcept function
//   AUTO_CAUSES_COPY     `auto x` copies an expensive object
//   PASS_BY_VALUE        an expensive parameter passed by value and only read
//   RESOURCE_LEAK        unique_ptr::release() result dropped
//   DC.STRING_BUFFER / DC.WEAK_CRYPTO / DC.STREAM_BUFFER  "don't call" functions
//
// Class-level checks (COPY_WITHOUT_ASSIGN, ASSIGN_WITHOUT_COPY) run once per
// class from index.js. Exception summaries (`throwsOf`) are kept on the engine.

const cf = require('../cfamily');

const T = cf.types;

function skip(e) {
  while (e && e.type === 'ParenExpr') e = e.expr;
  return e;
}

const inMacro = (n) => !!(n && n.loc && n.loc.macro);

function canon(t) {
  if (!t) return null;
  let c = T.canonical(t);
  if (c && c.kind === 'reference') c = T.canonical(c.to);
  return c;
}

function localSym(e) {
  e = skip(e);
  if (!e || e.type !== 'Identifier' || !e.symbol) return null;
  const s = e.symbol;
  if (s.kind !== 'variable' && s.kind !== 'parameter') return null;
  if (s.kind === 'variable' && s.storage !== 'automatic') return null;
  return s;
}

function calleeName(call) {
  const c = skip(call.callee);
  if (!c) return '';
  if (c.type === 'Identifier') return (c.symbol && c.symbol.qname) || c.qname || c.name || '';
  return '';
}

function isStdMove(call) {
  if (!call || call.type !== 'CallExpr' || (call.args || []).length !== 1) return false;
  const n = calleeName(call);
  return n === 'std::move' || (n === 'move' && !(skip(call.callee).symbol && skip(call.callee).symbol.definition));
}

// method call `obj.m(...)` / `obj->m(...)` on a local: { sym, member, arrow, call }
function methodCall(n) {
  if (!n || n.type !== 'CallExpr') return null;
  const c = skip(n.callee);
  if (!c || c.type !== 'MemberExpr') return null;
  const s = localSym(c.object);
  if (!s) return null;
  return { sym: s, member: c.member, arrow: c.arrow, call: n, obj: skip(c.object) };
}

// The spelled type of a variable's declaration: 'std::vector<std::string>'.
const typeTextCache = new WeakMap();
function declTypeText(unit, sym) {
  if (!sym) return '';
  if (typeTextCache.has(sym)) return typeTextCache.get(sym);
  let s = '';
  const d = sym.decls && sym.decls[0];
  const ts = d && d.specs && d.specs.typeSpec;
  if (ts) { try { s = cf.sourceText(unit, ts) || ''; } catch { s = ''; } }
  if (!s && sym.type) s = T.typeToString(sym.type);
  s = s.replace(/\s+/g, '');
  typeTextCache.set(sym, s);
  return s;
}

const SEQ_CONT = /^(::)?(std::)?(vector|deque|basic_string|string|wstring|u8string|u16string|u32string)\b/;
const NODE_CONT = /^(::)?std::(list|forward_list|map|multimap|set|multiset)\b/;
const HASH_CONT = /^(::)?std::(unordered_map|unordered_multimap|unordered_set|unordered_multiset)\b/;
const ANY_CONT = /^(::)?std::(vector|deque|list|forward_list|map|multimap|set|multiset|unordered_map|unordered_multimap|unordered_set|unordered_multiset|basic_string|string|wstring|array)\b/;

function contKind(text) {
  if (SEQ_CONT.test(text)) return 'seq';
  if (NODE_CONT.test(text)) return 'node';
  if (HASH_CONT.test(text)) return 'hash';
  if (/^(::)?std::array\b/.test(text)) return 'array';
  return null;
}

const ITER_FNS = new Set(['begin', 'end', 'cbegin', 'cend', 'rbegin', 'rend', 'crbegin', 'crend', 'find', 'lower_bound', 'upper_bound', 'insert', 'emplace', 'emplace_hint', 'erase']);
// operations that invalidate every iterator of a sequence container
const SEQ_INVAL = new Set(['push_back', 'emplace_back', 'push_front', 'emplace_front', 'insert', 'emplace', 'erase', 'clear', 'resize', 'reserve', 'assign', 'shrink_to_fit', 'swap', 'append', 'replace']);
const HASH_INVAL = new Set(['insert', 'emplace', 'emplace_hint', 'erase', 'clear', 'rehash', 'reserve', 'swap', 'operator[]', 'try_emplace', 'insert_or_assign']);
// non-mutating container members
const CONST_MEMBERS = new Set(['size', 'empty', 'length', 'capacity', 'max_size', 'begin', 'end', 'cbegin', 'cend', 'rbegin', 'rend', 'crbegin', 'crend', 'find', 'count', 'contains',
  'at', 'front', 'back', 'data', 'c_str', 'compare', 'substr', 'starts_with', 'ends_with', 'lower_bound', 'upper_bound', 'equal_range', 'get', 'value', 'value_or', 'has_value',
  'operator bool', 'get_allocator', 'key_comp', 'hash_function', 'bucket_count', 'load_factor', 'rfind', 'find_first_of', 'find_last_of', 'find_first_not_of', 'find_last_not_of', 'copy', 'use_count']);

// ------------------------------------------------------------------ dataflow

// Facts: Map<symId, fact>. A forward "may" analysis: facts survive a join if
// any predecessor has them (a move on one path makes a later use a defect
// on that path).
// "Empty" facts (std::optional, containers) are must facts: they survive a
// join only when both sides have them.
const MUST = new Set(['empty', 'emptyc']);

function joinFacts(a, b) {
  if (a === b) return a;
  if (!a) return b;
  if (!b) return a;
  let out = null;
  for (const [k, v] of a) {
    if (MUST.has(v.k) && !(b.has(k) && b.get(k).k === v.k)) { if (!out) out = new Map(a); out.delete(k); }
  }
  for (const [k, v] of b) {
    if (MUST.has(v.k)) continue;
    if (a.has(k)) {
      const x = a.get(k);
      if (x.k === 'iter' && v.k === 'iter' && (x.c !== v.c || !!x.inval !== !!v.inval)) {
        if (!out) out = new Map(a);
        out.set(k, { k: 'iter', c: x.c === v.c ? x.c : null, cname: x.cname, inval: x.inval || v.inval });
      }
      continue;
    }
    if (!out) out = new Map(a);
    out.set(k, v);
  }
  return out || a;
}

function sameFacts(a, b) {
  if (a === b) return true;
  if (!a || !b || a.size !== b.size) return false;
  for (const [k, v] of a) {
    const w = b.get(k);
    if (!w || w.k !== v.k || w.c !== v.c || !!w.inval !== !!v.inval) return false;
  }
  return true;
}

class Flow {
  constructor(an) {
    this.an = an;
    this.unit = an.unit;
    this.reporting = false;
    this.fn = an.fn;
  }

  run() {
    const g = this.an.cfg;
    let res;
    try {
      res = cf.solve(g, {
        direction: 'forward',
        boundary: new Map(),
        init: null,
        transferElement: (node, v) => (v ? this.element(node, v) : v),
        join: joinFacts,
        equal: sameFacts,
        edge: (e, v) => (v ? this.edge(e, v) : v),
        maxIterations: 20000,
      });
    } catch { return; }
    if (!res || res.converged === false) return;
    this.reporting = true;
    for (const b of g.rpo()) {
      let v = res.in.get(b);
      if (!v) continue;
      for (const n of cf.cfg.blockItems(b)) v = this.element(n, v);
    }
    this.reporting = false;
  }

  report(checker, node, en, ko, events, tag) {
    if (!this.reporting) return;
    this.an.report(checker, node, { en, ko }, events, { tag });
  }

  edge(e, v) {
    if ((e.kind !== 'true' && e.kind !== 'false') || !e.cond) return v;
    // `if (o)` / `if (o.has_value())` / `if (!v.empty())` clear "empty" facts on the matching edge
    let c = skip(e.cond), truth = e.kind === 'true';
    while (c && c.type === 'UnaryExpr' && c.op === '!') { c = skip(c.arg); truth = !truth; }
    let sym = null, nonEmptyWhen = null;
    const s0 = localSym(c);
    if (s0) { sym = s0; nonEmptyWhen = true; }
    const mc = methodCall(c);
    if (mc && (mc.member === 'has_value' || mc.member === 'operator bool')) { sym = mc.sym; nonEmptyWhen = true; }
    if (mc && mc.member === 'empty') { sym = mc.sym; nonEmptyWhen = false; }
    if (c && c.type === 'BinaryExpr') {
      const m2 = methodCall(skip(c.left));
      if (m2 && m2.member === 'size') { sym = m2.sym; nonEmptyWhen = (c.op === '>' || c.op === '!=' || c.op === '>=') ? true : (c.op === '==' ? false : null); }
    }
    if (!sym || nonEmptyWhen === null || truth !== nonEmptyWhen) return v;
    const f = v.get(sym.id);
    if (!f || (f.k !== 'empty' && f.k !== 'emptyc')) return v;
    const out = new Map(v);
    out.delete(sym.id);
    return out;
  }

  // one CFG element: walk it in evaluation order
  element(node, v) {
    this.cur = v;
    try {
      this.visit(node, null);
    } catch (err) {
      if (this.an.E.debug) throw err;
    }
    return this.cur;
  }

  set(id, fact) {
    const m = new Map(this.cur);
    if (fact) m.set(id, fact); else m.delete(id);
    this.cur = m;
  }

  kill(sym) { if (sym && this.cur.has(sym.id)) this.set(sym.id, null); }

  visit(n, parent) {
    if (!n || typeof n !== 'object') return;
    switch (n.type) {
      case 'LambdaExpr': return;
      case 'SizeofExpr': case 'AlignofExpr': case 'TypeidExpr': case 'NoexceptExpr': case 'DecltypeType': return;
      case 'VarDecl': this.varDecl(n); return;
      case 'AssignExpr': this.assign(n); return;
      case 'CallExpr': this.call(n, parent); return;
      case 'UnaryExpr':
        if (n.op === '*' && localSym(n.arg)) { this.deref(localSym(n.arg), n, 'deref'); return; }
        if ((n.op === '++' || n.op === '--') && localSym(n.arg)) { this.use(localSym(n.arg), n, 'iterate'); return; }
        if (n.op === '&' && localSym(n.arg)) { this.kill(localSym(n.arg)); return; }
        break;
      case 'MemberExpr':
        if (n.arrow && localSym(n.object)) { this.deref(localSym(n.object), n, 'arrow'); return; }
        break;
      case 'BinaryExpr':
        if ((n.op === '==' || n.op === '!=') && this.iterCompare(n)) return;
        // `in >> s` writes s
        if (n.op === '>>' && localSym(n.right) && !T.isInteger(canon(n.left.ctype) || T.T.int)) {
          this.visit(n.left, n);
          const s = localSym(n.right);
          const f = this.cur.get(s.id);
          if (f && f.k !== 'iter') this.kill(s);
          return;
        }
        break;
      case 'Identifier': {
        const s = localSym(n);
        if (s) this.use(s, n, 'use');
        return;
      }
      case 'ReturnStmt': {
        const a = skip(n.arg);
        // returning a moved-from local by name is a use as well
        if (a) this.visit(a, n);
        return;
      }
      default: break;
    }
    for (const c of cf.childrenOf(n)) this.visit(c, n);
  }

  varDecl(d) {
    const sym = d.symbol;
    if (d.init) this.visit(d.init, d);
    if (!sym) return;
    this.set(sym.id, null);
    const text = declTypeText(this.unit, sym);
    const init = d.init ? skip(d.init.type === 'InitList' && d.init.items && d.init.items.length === 1 ? d.init.items[0] : d.init) : null;
    // std::optional<T> o;  /  = std::nullopt;  /  {}
    if (/^(::)?std::optional</.test(text)) {
      const empty = !d.init || (init && init.type === 'Identifier' && /(^|::)nullopt$/.test(init.qname || '')) || (d.init && d.init.type === 'InitList' && !(d.init.items || []).length);
      if (empty) this.set(sym.id, { k: 'empty', ev: this.an.ev(d, 'empty_optional', `${sym.name} is declared empty.`, `${sym.name}을(를) 빈 값으로 선언합니다.`) });
      return;
    }
    const ck = contKind(text);
    if (ck && ck !== 'array' && !d.init && sym.kind === 'variable') {
      this.set(sym.id, { k: 'emptyc', ev: this.an.ev(d, 'empty_container', `${sym.name} is declared empty.`, `${sym.name}을(를) 비어 있게 선언합니다.`) });
      return;
    }
    // auto it = c.begin();
    const it = this.iterSource(init);
    if (it && !isNumeric(sym)) this.set(sym.id, { k: 'iter', c: it.sym.id, cname: it.sym.name, ckind: it.kind, inval: null });
  }

  iterSource(e) {
    e = skip(e);
    if (!e) return null;
    const mc = methodCall(e);
    if (mc && !mc.arrow && ITER_FNS.has(mc.member)) {
      const text = declTypeText(this.unit, mc.sym);
      const kind = contKind(text);
      // std::string::find / insert / erase take and return positions, not iterators
      const str = /^(::)?(std::)?(basic_string|string|wstring|u8string|u16string|u32string)\b/.test(text);
      if (kind && kind !== 'array' && !(str && !/^(c?r?begin|c?r?end)$/.test(mc.member))) return { sym: mc.sym, kind };
    }
    // std::find(c.begin(), c.end(), x) and friends
    if (e.type === 'CallExpr' && /^std::(find|find_if|find_if_not|lower_bound|upper_bound|max_element|min_element|adjacent_find|search|partition_point|remove|remove_if|unique)$/.test(calleeName(e)) && e.args.length >= 2) {
      const a = methodCall(skip(e.args[0]));
      if (a && (a.member === 'begin' || a.member === 'cbegin')) { const kind = contKind(declTypeText(this.unit, a.sym)); if (kind && kind !== 'array') return { sym: a.sym, kind }; }
    }
    return null;
  }

  assign(n) {
    const L = localSym(n.left);
    // `it = c.erase(it)`: the right side is evaluated first
    // a std::move on the right takes effect inside operator=, after the left side is evaluated
    this.deferMoves(() => {
      this.visit(n.right, n);
      if (!L) this.visit(n.left, n);
    });
    if (!L) return;
    if (n.op !== '=') { this.use(L, n.left, 'use'); return; }
    this.set(L.id, null);
    const r = skip(n.right);
    const text = declTypeText(this.unit, L);
    if (/^(::)?std::optional</.test(text) && r && r.type === 'Identifier' && /(^|::)nullopt$/.test(r.qname || '')) {
      this.set(L.id, { k: 'empty', ev: this.an.ev(n, 'empty_optional', `${L.name} is set to std::nullopt.`, `${L.name}을(를) std::nullopt로 둡니다.`) });
      return;
    }
    const it = this.iterSource(r);
    if (it && !isNumeric(L)) this.set(L.id, { k: 'iter', c: it.sym.id, cname: it.sym.name, ckind: it.kind, inval: null });
  }

  call(n, parent) {
    if (isStdMove(n)) {
      const s = localSym(n.args[0]);
      if (!s) { this.visit(n.args[0], n); return; }
      this.use(s, n.args[0], 'move');
      if (this.consumesMove(n, parent) && movable(s)) {
        const fact = { k: 'moved', ev: this.an.ev(n, 'move', `${s.name} is moved with std::move here.`, `${s.name}을(를) 여기서 std::move로 옮깁니다.`) };
        if (this.pending) this.pending.push([s.id, fact]); else this.set(s.id, fact);
      }
      return;
    }
    const mc = methodCall(n);
    if (mc) {
      // the object and the arguments are evaluated before the callee moves from any of them
      this.deferMoves(() => { for (const a of n.args || []) this.visit(a, n); });
      this.method(mc, n);
      return;
    }
    // other calls: arguments in order; a local passed by non-const reference may be rewritten
    this.visit(n.callee, n);
    const ft = calleeType(n);
    const moves = [];
    (n.args || []).forEach((a, i) => {
      const s = localSym(a);
      const pt = ft && ft.params && ft.params[i] ? T.canonical(ft.params[i]) : null;
      const byRef = pt ? pt.kind === 'reference' && !(canon(pt.to) && canon(pt.to).const) && !pt.rvalue : !ft;
      const f = s && this.cur.get(s.id);
      // std::getline(in, s) and other out-parameters give a moved-from object a new value
      if (s && byRef && f && f.k === 'moved') { this.kill(s); return; }
      this.deferMoves(() => this.visit(a, n), moves);
      if (!s) return;
      const f2 = this.cur.get(s.id);
      if (byRef && f2 && f2.k !== 'iter') this.kill(s);
    });
    if (this.pending) for (const m of moves) this.pending.push(m);
    else for (const [id, fact] of moves) this.set(id, fact);
  }

  // Run fn with std::move effects collected, then apply them (or add them to `into`).
  deferMoves(fn, into) {
    const saved = this.pending;
    this.pending = into || [];
    try { fn(); } finally {
      const list = this.pending;
      this.pending = saved;
      if (!into) for (const m of list) { if (saved) saved.push(m); else this.set(m[0], m[1]); }
    }
  }

  // Is the result of std::move(x) actually consumed (initialises, is assigned
  // or is passed to something that takes it by value / rvalue reference)?
  consumesMove(n, parent) {
    if (!parent) return false;
    if (parent.type === 'ExprStmt') return false;
    if (parent.type === 'CallExpr' && parent !== n) {
      const ft = calleeType(parent);
      const i = (parent.args || []).indexOf(n);
      if (ft && i >= 0 && ft.params && ft.params[i]) {
        const pt = T.canonical(ft.params[i]);
        if (pt.kind === 'reference' && !pt.rvalue) return false; // const T& / T&: nothing is moved
      }
      return true;
    }
    return true;
  }

  method(mc, n) {
    const { sym, member } = mc;
    const f = this.cur.get(sym.id);
    const text = declTypeText(this.unit, sym);
    // reset / clear / assign restore a moved-from object
    if (f && f.k === 'moved') {
      if (/^(clear|reset|assign|emplace|operator=|swap)$/.test(member)) { this.kill(sym); return; }
      this.report('USE_AFTER_MOVE', n, `${sym.name}.${member}() is called after ${sym.name} was moved.`, `${sym.name}을(를) 옮긴 뒤에 ${sym.name}.${member}()을(를) 호출합니다.`, [f.ev], 'use_after_move');
      this.kill(sym);
      return;
    }
    if (f && f.k === 'empty') {
      if (member === 'value') {
        this.report('FORWARD_NULL', n, `Calling value() on ${sym.name}, which is an empty std::optional here.`, `여기서 비어 있는 std::optional인 ${sym.name}에 value()를 호출합니다.`, [f.ev], 'empty_optional_access');
        this.kill(sym);
        return;
      }
      if (/^(emplace|swap|operator=)$/.test(member)) { this.kill(sym); return; }
      return;
    }
    if (f && f.k === 'emptyc') {
      if (/^(front|back|pop_back|pop_front)$/.test(member)) {
        this.report('OVERRUN', n, `Calling ${member}() on ${sym.name}, which is empty here.`, `여기서 비어 있는 ${sym.name}에 ${member}()를 호출합니다.`, [f.ev], 'empty_container_access');
        this.kill(sym);
        return;
      }
      if (!CONST_MEMBERS.has(member)) this.kill(sym);
      return;
    }
    if (f && f.k === 'iter') { this.use(sym, mc.obj, 'use'); return; }
    // container modifications invalidate iterators
    const ck = contKind(text);
    if (ck) {
      const all = (ck === 'seq' && SEQ_INVAL.has(member)) || (ck === 'hash' && HASH_INVAL.has(member)) || member === 'clear' || member === 'swap';
      const erased = (member === 'erase' && (n.args || []).length) ? localSym(n.args[0]) : null;
      if (all || erased) {
        let out = null;
        for (const [id, x] of this.cur) {
          if (x.k !== 'iter' || x.c !== sym.id || x.inval) continue;
          if (!all && (!erased || erased.id !== id)) continue;
          if (!out) out = new Map(this.cur);
          out.set(id, { ...x, inval: this.an.ev(n, 'invalidate', `${sym.name}.${member}() invalidates the iterators of ${sym.name}.`, `${sym.name}.${member}()가 ${sym.name}의 반복자를 무효로 만듭니다.`) });
        }
        if (out) this.cur = out;
      }
      // the position argument must belong to this container
      if ((member === 'erase' || member === 'insert' || member === 'emplace' || member === 'splice') && (n.args || []).length) this.mismatchArg(sym, n.args[0], n, member);
    }
    if (f && !CONST_MEMBERS.has(member)) this.kill(sym);
  }

  mismatchArg(contSym, arg, n, member) {
    const a = skip(arg);
    const src = methodCall(a);
    let other = null;
    if (src && ITER_FNS.has(src.member) && src.sym !== contSym && contKind(declTypeText(this.unit, src.sym))) other = src.sym;
    const s = localSym(a);
    if (s) { const f = this.cur.get(s.id); if (f && f.k === 'iter' && f.c && f.c !== contSym.id) other = { name: f.cname }; }
    if (!other) return;
    this.report('MISMATCHED_ITERATOR', a, `${contSym.name}.${member}() is given an iterator of ${other.name}.`, `${contSym.name}.${member}()에 ${other.name}의 반복자를 넘깁니다.`, [], 'mismatched_iterator');
  }

  iterCompare(n) {
    const l = localSym(n.left), r = skip(n.right);
    if (!l) return false;
    const f = this.cur.get(l.id);
    if (!f || f.k !== 'iter') return false;
    this.use(l, n.left, 'compare');
    const mc = methodCall(r);
    if (mc && (mc.member === 'end' || mc.member === 'cend' || mc.member === 'begin') && f.c && mc.sym.id !== f.c && contKind(declTypeText(this.unit, mc.sym))) {
      this.report('MISMATCHED_ITERATOR', n, `Iterator ${l.name} of ${f.cname} is compared with ${mc.sym.name}.${mc.member}().`, `${f.cname}의 반복자 ${l.name}을(를) ${mc.sym.name}.${mc.member}()와 비교합니다.`, [], 'mismatched_iterator');
    } else this.visit(n.right, n);
    return true;
  }

  deref(sym, node, how) {
    const f = this.cur.get(sym.id);
    if (!f) { if (how === 'arrow') this.visitChildrenOf(node); return; }
    if (f.k === 'empty') {
      this.report('FORWARD_NULL', node, `Dereferencing ${sym.name}, which is an empty std::optional here.`, `여기서 비어 있는 std::optional인 ${sym.name}을(를) 역참조합니다.`, [f.ev], 'empty_optional_access');
      this.kill(sym);
      return;
    }
    this.use(sym, node, how);
  }

  visitChildrenOf() { /* members of a local through -> have no other locals in them */ }

  use(sym, node, how) {
    const f = this.cur.get(sym.id);
    if (!f) return;
    if (f.k === 'moved') {
      this.report('USE_AFTER_MOVE', node, `${sym.name} is used after it was moved.`, `${sym.name}을(를) 옮긴 뒤에 사용합니다.`, [f.ev], 'use_after_move');
      this.kill(sym);
      return;
    }
    if (f.k === 'iter' && f.inval) {
      this.report('INVALIDATE_ITERATOR', node, `Iterator ${sym.name} is used after ${f.cname} was modified, which invalidated it.`, `${f.cname}을(를) 바꿔 무효가 된 반복자 ${sym.name}을(를) 사용합니다.`, [f.inval], 'use_invalid_iterator');
      this.kill(sym);
      return;
    }
    if (f.k === 'emptyc' && how === 'use') {
      // a container passed elsewhere may be filled
      this.kill(sym);
    }
  }
}

function isNumeric(sym) {
  const c = canon(sym && sym.type);
  return !!c && (T.isInteger(c) || T.isFloating(c) || c.kind === 'pointer');
}

function calleeType(call) {
  const s = call.calleeSymbol;
  let t = s && s.type ? T.canonical(s.type) : null;
  if (!t || t.kind !== 'function') {
    const c = skip(call.callee);
    t = c && c.ctype ? T.canonical(c.ctype) : null;
    if (t && t.kind === 'pointer') t = T.canonical(t.to);
  }
  return t && t.kind === 'function' ? t : null;
}

// A move of a scalar, pointer or trivially copyable struct is a copy.
function movable(sym) {
  const c = canon(sym.type);
  if (!c) return true;
  if (T.isScalar(c) || c.kind === 'pointer' || c.kind === 'enum' || T.isInteger(c) || T.isFloating(c)) return false;
  if (c.kind === 'record') {
    if (!c.decl || !c.decl.members) return true;
    let trivial = true;
    for (const f of c.fields || []) { const ft = canon(f.type); if (!ft || !(T.isScalar(ft) || ft.kind === 'pointer' || T.isInteger(ft) || T.isFloating(ft) || ft.kind === 'enum')) trivial = false; }
    if (c.scope) for (const s of c.scope.names.values()) if (s.kind === 'function') trivial = false;
    return !trivial;
  }
  return true;
}

// ------------------------------------------------------------------ syntactic C++ checks

const DC_STRING = new Set(['gets', '_getws', 'getwd', 'getpw']);
const DC_CRYPTO = new Set(['rand', 'srand', 'random', 'srandom', 'drand48', 'erand48', 'lrand48', 'nrand48', 'mrand48', 'jrand48', 'srand48', 'rand_r', 'std::rand', 'std::srand']);

// Is a type expensive to copy? Records of >= 128 bytes, records with
// non-trivial copies (user copy constructor or members of class type) and the
// standard containers / strings (known only by name without the headers).
// Approximate size of a type in bytes; standard library classes (unknown
// without their headers) get typical LP64 sizes.
const STD_SIZES = [
  [/^(::)?std::(basic_string|string|wstring|u8string|u16string|u32string)\b/, 32],
  [/^(::)?std::(vector|deque)\b/, 24],
  [/^(::)?std::(list|forward_list)\b/, 24],
  [/^(::)?std::(map|multimap|set|multiset)\b/, 48],
  [/^(::)?std::(unordered_map|unordered_multimap|unordered_set|unordered_multiset)\b/, 56],
  [/^(::)?std::(function)\b/, 32],
  [/^(::)?std::(shared_ptr|weak_ptr)\b/, 16],
  [/^(::)?std::(unique_ptr|atomic)\b/, 8],
  [/^(::)?std::(mutex)\b/, 40],
];

function estSize(t, depth = 0) {
  const c = canon(t);
  if (!c || depth > 8) return 8;
  if (c.kind === 'unknown') {
    for (const [re, n] of STD_SIZES) if (re.test(c.name || '')) return n;
    return 8;
  }
  if (c.kind === 'array') return c.size != null ? c.size * estSize(c.of, depth + 1) : 8;
  if (c.kind === 'record') {
    const known = T.sizeOf(c);
    if (known != null) return known;
    let n = 0;
    for (const f of c.fields || []) n += estSize(f.type, depth + 1);
    for (const b of c.bases || []) n += estSize(b, depth + 1);
    return n;
  }
  const s = T.sizeOf(c);
  return s == null ? 8 : s;
}

// Is a type expensive to copy? The standard containers (copying is linear),
// std::string when `strings` is set, records with a user copy constructor,
// and anything of 128 bytes or more.
function expensive(t, text, opts = {}) {
  const strings = opts.strings !== false;
  const name = text || (canon(t) && canon(t).kind === 'unknown' ? canon(t).name : '');
  if (name) {
    if (/^(::)?std::array</.test(name)) return false;
    if (/^(::)?std::(vector|deque|list|forward_list|map|multimap|set|multiset|unordered_map|unordered_multimap|unordered_set|unordered_multiset)\b/.test(name)) return true;
    if (/^(::)?std::(basic_string|string|wstring|u8string|u16string|u32string)\b/.test(name)) return strings;
    if (/^(::)?std::/.test(name)) return false;
  }
  const c = canon(t);
  if (!c || c.kind !== 'record') return false;
  if (c.scope) for (const s of c.scope.names.values()) {
    if (s.kind === 'function' && s.member && (s.decls || []).some((d) => d.isConstructor && !d.isDefault && !d.isDeleted && d.params && d.params.length === 1 && isSelfRef(d.params[0], c))) return true;
  }
  return estSize(c) >= 128;
}

function isSelfRef(p, rec) {
  const t = p && p.ctype && T.canonical(p.ctype);
  return !!t && t.kind === 'reference' && !t.rvalue && canon(t.to) && canon(t.to).kind === 'record' && canon(t.to).name === rec.name;
}

function isNoexcept(fn) {
  const d = cf.directFunction(fn.declarator);
  if (!d) return false;
  if (d.noexceptExpr) {
    const v = T.constValue(d.noexceptExpr, {});
    return !!(v && v.value !== undefined && Number(v.value) !== 0);
  }
  if (d.noexcept) return true;
  if (d.throwSpec !== undefined && d.throwSpec !== null && /^\(\s*\)$|^$/.test(String(d.throwSpec.text || d.throwSpec || '').replace(/^throw/, ''))) return Array.isArray(d.throwSpec) ? d.throwSpec.length === 0 : false;
  return false;
}

// Throws that escape fn: direct `throw` outside any try body and calls to
// functions whose summary says they throw. Returns [{ node, via }].
function escapingThrows(an) {
  const out = [];
  const E = an.E;
  const walk = (n, inTry) => {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'LambdaExpr') return;
    if (n.type === 'TryStmt') {
      const catchAll = (n.handlers || []).some((h) => h.catchAll);
      walk(n.body, inTry || catchAll || (n.handlers || []).length > 0);
      for (const h of n.handlers || []) walk(h.body, inTry);
      return;
    }
    if (n.type === 'ThrowExpr' && !inTry) out.push({ node: n, via: null });
    if (n.type === 'CallExpr' && !inTry) {
      const s = n.calleeSymbol;
      if (s && s.kind === 'function') {
        const info = E.throwsOf.get(E.keyForSym(s, an.unit));
        if (info) out.push({ node: n, via: s.name, ev: info.ev });
      }
    }
    for (const c of cf.childrenOf(n)) walk(c, inTry);
  };
  walk(an.fn.body, false);
  return out;
}

function runCpp(an) {
  const fn = an.fn;
  if (!fn.body || an.lang !== 'cpp') return;
  an.reporting = true;
  try {
    // exception summary for callers
    const esc = escapingThrows(an);
    const noexc = isNoexcept(fn) || fn.isDestructor || (fn.name || '').startsWith('~');
    if (esc.length && !noexc) an.E.throwsOf.set(an.key, { ev: an.ev(esc[0].node, 'throw', `${fn.name} can throw here.`, `${fn.name}이(가) 여기서 예외를 던질 수 있습니다.`) });
    const isMain = fn.name === 'main' && !fn.qualifier;
    if (esc.length && (noexc || isMain)) {
      const what = isMain ? 'main' : (fn.isDestructor || (fn.name || '').startsWith('~')) ? `destructor ${fn.qname || fn.name}` : `noexcept function ${fn.qname || fn.name}`;
      const whatKo = isMain ? 'main' : (fn.isDestructor || (fn.name || '').startsWith('~')) ? `소멸자 ${fn.qname || fn.name}` : `noexcept 함수 ${fn.qname || fn.name}`;
      for (const x of esc.slice(0, 3)) {
        if (inMacro(x.node)) continue;
        an.report('UNCAUGHT_EXCEPT', x.node, x.via
          ? { en: `${x.via} can throw an exception that is not caught in ${what}; std::terminate is called.`, ko: `${x.via}이(가) 던지는 예외를 ${whatKo}에서 잡지 않아 std::terminate가 호출됩니다.` }
          : { en: `An exception thrown here is not caught in ${what}; std::terminate is called.`, ko: `여기서 던진 예외를 ${whatKo}에서 잡지 않아 std::terminate가 호출됩니다.` },
        [x.ev || null], { tag: 'uncaught_exception' });
      }
    }
    new Flow(an).run();
    syntactic(an);
    passByValue(an);
  } finally {
    an.reporting = false;
  }
}

function syntactic(an) {
  const unit = an.unit;
  const ci = an.E.classIndex();
  cf.walk(an.fn.body, (n, parent) => {
    if (n.type === 'LambdaExpr') return cf.walk.SKIP;
    if (!n.loc || n.loc.file !== an.file || inMacro(n)) return undefined;
    switch (n.type) {
      case 'DeleteExpr': deleteChecks(an, n, ci); break;
      case 'CallExpr': callChecks(an, n, parent); break;
      case 'RangeForStmt': rangeFor(an, n); rangeFor_autoCopy(an, n); break;
      case 'VarDecl': autoCopy(an, n); smartPtrInit(an, n, ci); break;
      case 'ReturnStmt': returnCStr(an, n); break;
      case 'BinaryExpr': if (n.op === '>>') streamBuffer(an, n); break;
      default: break;
    }
    return undefined;
  });
  void unit;
}

function deleteChecks(an, n, ci) {
  const a = skip(n.arg);
  const t = a && canon(a.ctype);
  if (!t || t.kind !== 'pointer') return;
  const to = canon(t.to);
  if (to && to.kind === 'void') {
    an.report('DELETE_VOID', n, { en: `Deleting ${an.src(a, 40)}, a void pointer: no destructor runs and the behaviour is undefined.`, ko: `void 포인터 ${an.src(a, 40)}을(를) delete합니다. 소멸자가 실행되지 않고 동작이 정의되지 않습니다.` }, [], { tag: 'delete_void' });
    return;
  }
  if (to && to.kind === 'record') virtualDtor(an, n, to, ci, null);
}

function recQ(rec) {
  return (rec.decl && rec.decl.symbol && rec.decl.symbol.qname) || rec.name;
}

// The base has no virtual destructor but some derived class needs one run.
function virtualDtor(an, node, rec, ci, derivedHint) {
  const q = recQ(rec);
  if (!q || !ci.get(q)) return;
  const derived = derivedHint ? [derivedHint] : [...ci.derivedOf(q)];
  if (!derived.length || ci.hasVirtualDtor(q)) return;
  const needs = derived.find((d) => {
    const c = ci.get(d);
    if (!c) return false;
    if (c.dtor) return true;
    return c.recs.some((r) => (r.type.fields || []).some((f) => { const ft = canon(f.type); return ft && (ft.kind === 'record' || ft.kind === 'unknown'); }));
  });
  if (!needs) return;
  an.report('VIRTUAL_DTOR', node, {
    en: `Deleting an object through a pointer to ${q}, whose destructor is not virtual; the destructor of ${needs} does not run.`,
    ko: `소멸자가 virtual이 아닌 ${q}의 포인터로 객체를 delete하여 ${needs}의 소멸자가 실행되지 않습니다.`,
  }, [], { tag: 'nonvirtual_dtor' });
}

// std::unique_ptr<Base> p(new Derived) / = std::make_unique<Derived>()
function smartPtrInit(an, d, ci) {
  if (!d.init || !d.symbol) return;
  const text = declTypeText(an.unit, d.symbol);
  const m = /^(::)?std::(unique_ptr|shared_ptr)<([A-Za-z_][\w:]*)>$/.exec(text);
  if (!m || m[2] === 'shared_ptr') return; // shared_ptr remembers the real deleter
  let init = skip(d.init);
  if (init && init.type === 'ParenListInit') init = skip((init.args || [])[0]);
  if (init && init.type === 'InitList') init = skip((init.items || [])[0]);
  let derived = null;
  if (init && init.type === 'NewExpr') { const t = canon(init.typeName && init.typeName.ctype); if (t && t.kind === 'record') derived = recQ(t); }
  if (init && init.type === 'CallExpr') {
    const c = skip(init.callee);
    if (c && c.type === 'Identifier' && /(^|::)make_unique$/.test(c.qname || '') && c.templateArgs && c.templateArgs[0] && c.templateArgs[0].ctype) {
      const t = canon(c.templateArgs[0].ctype);
      if (t && t.kind === 'record') derived = recQ(t);
    }
  }
  if (!derived) return;
  const base = ci.get(m[3]) ? m[3] : [...ci.classes.keys()].find((k) => k.split('::').pop() === m[3]);
  if (!base || base === derived || !ci.derivedOf(base).has(derived)) return;
  const rec = ci.get(base).recs[0].type;
  virtualDtor(an, d, rec, ci, derived);
}

// "Don't call" checkers, for C and C++.
function runDontCall(an) {
  if (!an.fn.body) return;
  an.reporting = true;
  try {
    cf.walk(an.fn.body, (n) => {
      if (n.type !== 'CallExpr' || !n.loc || n.loc.file !== an.file) return undefined;
      const bare = calleeName(n).replace(/^::/, '');
      if (!DC_STRING.has(bare) && !DC_CRYPTO.has(bare)) return undefined;
      const sym = n.calleeSymbol;
      if (sym && sym.definition && !sym.system) return undefined; // a project function of that name
      if (DC_STRING.has(bare)) {
        an.report('DC.STRING_BUFFER', n, { en: `${bare}() cannot limit how much it writes into the buffer; it must not be called.`, ko: `${bare}()는 버퍼에 쓰는 양을 제한할 수 없으므로 호출하면 안 됩니다.` }, [], { tag: 'dont_call' });
      } else {
        an.report('DC.WEAK_CRYPTO', n, { en: `${bare}() is a predictable generator; do not use it where randomness matters for security.`, ko: `${bare}()는 예측 가능한 생성기이므로 보안에 쓰는 난수에 사용하지 마세요.` }, [], { tag: 'dont_call' });
      }
      return undefined;
    });
  } finally {
    an.reporting = false;
  }
}

function callChecks(an, n, parent) {
  const name = calleeName(n);
  const mc = methodCall(n);
  // u.release(); with the result dropped leaks the object
  if (mc && mc.member === 'release' && parent && parent.type === 'ExprStmt' && /^(::)?std::unique_ptr</.test(declTypeText(an.unit, mc.sym))
    // `register(p.get()); p.release();` hands the object over on purpose
    && !cf.findFirst(an.fn.body, (x) => { const m = methodCall(x); return !!m && m.sym === mc.sym && m.member === 'get'; })) {
    an.report('RESOURCE_LEAK', n, { en: `The pointer returned by ${mc.sym.name}.release() is dropped, so the object it owned leaks.`, ko: `${mc.sym.name}.release()가 돌려준 포인터를 버려 소유하던 객체가 누수됩니다.` }, [], { tag: 'leaked_storage' });
  }
  // std algorithms on a range made of two containers
  if (/^std::(find|find_if|count|count_if|sort|stable_sort|copy|for_each|accumulate|transform|remove|remove_if|unique|reverse|fill|equal|min_element|max_element|lower_bound|upper_bound|binary_search|replace|partition|any_of|all_of|none_of)$/.test(name) && (n.args || []).length >= 2) {
    const a = methodCall(skip(n.args[0])), b = methodCall(skip(n.args[1]));
    if (a && b && /^c?begin$/.test(a.member) && /^c?end$/.test(b.member) && a.sym !== b.sym) {
      an.report('MISMATCHED_ITERATOR', n, { en: `${name} is given a range from ${a.sym.name}.${a.member}() to ${b.sym.name}.${b.member}(): the iterators belong to different containers.`, ko: `${name}에 ${a.sym.name}.${a.member}()부터 ${b.sym.name}.${b.member}()까지의 범위를 넘깁니다. 서로 다른 컨테이너의 반복자입니다.` }, [], { tag: 'mismatched_iterator' });
    }
  }
  // const char *p = std::string(...).c_str(); — handled at the declaration
}

// for (auto &x : c) { c.push_back(...); } — the loop's own iterator is invalidated
function rangeFor(an, n) {
  const r = skip(n.range);
  const cs = localSym(r) || (r && r.type === 'MemberExpr' && !r.arrow && skip(r.object) && skip(r.object).type === 'ThisExpr' ? null : null);
  if (!cs) return;
  const kind = contKind(declTypeText(an.unit, cs));
  if (!kind || kind === 'array') return;
  const inval = kind === 'seq' ? SEQ_INVAL : kind === 'hash' ? HASH_INVAL : new Set(['erase', 'clear', 'swap']);
  cf.walk(n.body, (m, parent) => {
    if (m.type === 'LambdaExpr') return cf.walk.SKIP;
    const mc = methodCall(m);
    if (!mc || mc.sym !== cs || !inval.has(mc.member)) return undefined;
    // `c.erase(...); break;` leaves the loop before the iterator is used again
    if (leavesLoop(m)) return undefined;
    void parent;
    an.report('INVALIDATE_ITERATOR', m, {
      en: `${cs.name}.${mc.member}() inside a range-based for loop over ${cs.name} invalidates the loop's iterator.`,
      ko: `${cs.name}을(를) 도는 범위 기반 for 문 안에서 ${cs.name}.${mc.member}()가 반복자를 무효로 만듭니다.`,
    }, [an.ev(n, 'loop', `Looping over ${cs.name}.`, `${cs.name}을(를) 돕니다.`)], { tag: 'invalidate_iterator' });
    return undefined;
  });
}

function leavesLoop(call) {
  let s = call;
  let p = cf.parentOf(s);
  while (p && p.type !== 'ExprStmt') { s = p; p = cf.parentOf(p); }
  if (!p) return false;
  const block = cf.parentOf(p);
  if (!block || block.type !== 'CompoundStmt') return false;
  const i = block.body.indexOf(p);
  const next = block.body[i + 1];
  return !!next && ['BreakStmt', 'ReturnStmt', 'GotoStmt'].includes(next.type) || (!!next && next.type === 'ExprStmt' && skip(next.expr) && skip(next.expr).type === 'ThrowExpr');
}

function isModified(sym, body) {
  let mod = false;
  cf.walk(body, (n) => {
    if (mod) return cf.walk.STOP;
    if (n.type === 'AssignExpr') { const l = localSym(n.left); if (l === sym) mod = true; let b = skip(n.left); while (b && (b.type === 'MemberExpr' && !b.arrow || b.type === 'IndexExpr')) b = skip(b.object); if (localSym(b) === sym) mod = true; }
    if (n.type === 'UnaryExpr' && (n.op === '++' || n.op === '--' || n.op === '&')) { let b = skip(n.arg); while (b && (b.type === 'MemberExpr' && !b.arrow || b.type === 'IndexExpr')) b = skip(b.object); if (localSym(b) === sym) mod = true; }
    if (n.type === 'CallExpr') {
      if (isStdMove(n) && localSym(n.args[0]) === sym) mod = true;
      const mc = methodCall(n);
      if (mc && mc.sym === sym && !CONST_MEMBERS.has(mc.member)) {
        const ms = n.calleeSymbol;
        const ft = ms && T.canonical(ms.type);
        if (!(ft && ft.quals && ft.quals.includes('const'))) mod = true;
      }
      const ft = calleeType(n);
      (n.args || []).forEach((a, i) => {
        if (localSym(a) !== sym) return;
        const pt = ft && ft.params && ft.params[i] ? T.canonical(ft.params[i]) : null;
        if (!pt || (pt.kind === 'reference' && !(canon(pt.to) && canon(pt.to).const))) mod = true;
      });
    }
    if (n.type === 'BinaryExpr' && n.op === '>>' && localSym(n.right) === sym) mod = true;
    if (n.type === 'LambdaExpr') {
      for (const c of n.captures || []) {
        if (c.symbol === sym && c.byRef) mod = true;
        if (c.init) cf.walk(c.init, (m) => { if (m.type === 'Identifier' && m.symbol === sym) mod = true; });
      }
      cf.walk(n.body, (m) => { if (m.type === 'Identifier' && m.symbol === sym) mod = true; });
      return cf.walk.SKIP;
    }
    if (n.type === 'ReturnStmt' && localSym(n.arg) === sym) mod = true; // returned (moved out implicitly)
    if (n.type === 'VarDecl' && n.ctype && T.canonical(n.ctype).kind === 'reference' && localSym(n.init) === sym && !(canon(T.canonical(n.ctype).to) || {}).const) mod = true;
    return undefined;
  });
  return mod;
}

function elemTypeText(text) {
  const m = /^(::)?std::(vector|deque|list|forward_list|set|multiset|unordered_set|unordered_multiset|array)<(.+)>$/.exec(text);
  if (m) return m[3].replace(/,\d+$/, '');
  const mm = /^(::)?std::(map|multimap|unordered_map|unordered_multimap)<(.+)>$/.exec(text);
  if (mm) return `std::pair<${mm[3]}>`;
  return null;
}

function cheapText(t) {
  return /^(const)?(unsigned|signed)?(char|short|int|long|longlong|float|double|bool|size_t|u?int\d+_t|std::size_t|auto)\*?$/.test(t) || /\*$/.test(t);
}

function rangeFor_autoCopy(an, n) {
  const d = n.decl && (n.decl.declarators || [])[0];
  if (!d || d.type !== 'VarDecl' || !d.symbol) return;
  const ts = d.specs && d.specs.typeSpec;
  if (!ts || ts.type !== 'AutoType') return;
  if (d.declarator && d.declarator.type !== 'IdentDeclarator') return; // auto& / auto* / auto&&
  const r = localSym(skip(n.range)) || null;
  let elem = null;
  if (r) {
    const et = elemTypeText(declTypeText(an.unit, r));
    if (et) {
      if (cheapText(et)) return;
      if (/^(::)?std::(pair<|string|wstring|vector|map|set|list|deque|unordered_|function|shared_ptr)/.test(et)) elem = et;
      else {
        const c = an.E.classIndex().get(et.replace(/^::/, '')) || [...an.E.classIndex().classes.values()].find((x) => x.qname.split('::').pop() === et);
        if (c && c.recs[0] && expensive(c.recs[0].type, '')) elem = et;
      }
    } else {
      const rt = canon(r.type);
      if (rt && rt.kind === 'array' && expensive(rt.of, '')) elem = T.typeToString(rt.of);
    }
  }
  if (!elem) return;
  if (isModified(d.symbol, n.body)) return;
  an.report('AUTO_CAUSES_COPY', d, {
    en: `'auto ${d.name}' copies each ${elem} of ${r ? r.name : 'the range'}; use 'const auto& ${d.name}'.`,
    ko: `'auto ${d.name}'가 ${r ? r.name : '범위'}의 ${elem}을(를) 매번 복사합니다. 'const auto& ${d.name}'를 쓰세요.`,
  }, [], { tag: 'auto_causes_copy' });
}

function autoCopy(an, d) {
  const par = cf.parentOf(d), gp = par && cf.parentOf(par);
  if (gp && gp.type === 'RangeForStmt' && cf.parentKey(par) === 'decl') return; // handled by rangeFor_autoCopy
  const ts = d.specs && d.specs.typeSpec;
  if (!ts || ts.type !== 'AutoType' || !d.init || !d.symbol) return;
  if (d.declarator && d.declarator.type !== 'IdentDeclarator') return;
  const init = skip(d.init);
  if (!init || init.type !== 'CallExpr') return;
  const rt = init.refType && T.canonical(init.refType);
  if (!rt || rt.kind !== 'reference' || rt.rvalue) return;
  const to = canon(rt.to);
  if (!to || !(rt.to && T.canonical(rt.to).const)) return;
  if (!expensive(to, to.kind === 'unknown' ? to.name : '')) return;
  const fnBody = an.fn.body;
  if (isModified(d.symbol, fnBody)) return;
  an.report('AUTO_CAUSES_COPY', d, {
    en: `'auto ${d.name}' copies the ${T.typeToString(rt.to)} that ${an.src(init.callee, 30)} returns by reference; use 'const auto&'.`,
    ko: `'auto ${d.name}'가 ${an.src(init.callee, 30)}이(가) 참조로 돌려주는 ${T.typeToString(rt.to)}을(를) 복사합니다. 'const auto&'를 쓰세요.`,
  }, [], { tag: 'auto_causes_copy' });
}

// return s.c_str(); with s a local std::string
function returnCStr(an, n) {
  const a = skip(n.arg);
  const mc = methodCall(a);
  if (!mc || !/^(c_str|data)$/.test(mc.member) || mc.arrow) return;
  const s = mc.sym;
  if (s.kind !== 'variable' || s.storage !== 'automatic') return;
  const ct = canon(s.type);
  if (ct && T.canonical(s.type).kind === 'reference') return;
  if (!/^(::)?std::(string|wstring|basic_string|vector|u8string|u16string|u32string)\b/.test(declTypeText(an.unit, s))) return;
  an.report('RETURN_LOCAL', n, {
    en: `Returning ${s.name}.${mc.member}(), which points into local ${s.name}; it is destroyed when ${an.fn.name} returns.`,
    ko: `${an.fn.name}이(가) 반환되면 사라지는 지역 ${s.name} 안을 가리키는 ${s.name}.${mc.member}()를 반환합니다.`,
  }, [], { tag: 'escape_local_addr' });
}

// std::cin >> buf with buf a char array: no width limit
function streamBuffer(an, n) {
  const r = skip(n.right);
  const s = localSym(r) || (r && r.type === 'Identifier' && r.symbol && r.symbol.kind === 'variable' ? r.symbol : null);
  if (!s) return;
  const t = canon(s.type);
  if (!t || t.kind !== 'array' || !T.isCharType(canon(t.of))) return;
  let l = skip(n.left);
  while (l && l.type === 'BinaryExpr' && l.op === '>>') l = skip(l.left);
  const ln = l && l.type === 'Identifier' ? (l.qname || l.name) : '';
  const lt = l && canon(l.ctype);
  if (!/(^|::)(cin|wcin)$/.test(ln) && !(lt && /istream|ifstream|stringstream/.test(lt.name || ''))) return;
  // std::setw before the extraction limits it
  let src = '';
  try { src = cf.sourceText(an.unit, n) || ''; } catch { src = ''; }
  if (/setw\s*\(/.test(src)) return;
  an.report('DC.STREAM_BUFFER', n, {
    en: `Reading into char array ${s.name} with >> has no length limit; use std::string or std::setw.`,
    ko: `>> 로 char 배열 ${s.name}에 읽으면 길이 제한이 없습니다. std::string이나 std::setw를 쓰세요.`,
  }, [], { tag: 'dont_call' });
}

// Expensive parameters passed by value and only read.
function passByValue(an) {
  const fn = an.fn;
  if (fn.isConstructor || fn.isDeleted || fn.isDefault) return;
  if (/^operator\s*=/.test(fn.name || '')) return; // copy-and-swap assignment takes its argument by value
  if (fn.isOverride || (fn.symbol && an.E.classIndex().isVirtual(fn.symbol))) return; // the signature is fixed by the base
  // a function whose address is taken (thread entry, callback) has a fixed signature;
  // callers that move into a by-value parameter use it as a sink
  const uses = (fn.symbol && fn.symbol.uses) || [];
  const calls = [];
  for (const u of uses) {
    const p = cf.parentOf(u);
    if (!(p && p.type === 'CallExpr' && p.callee === u)) return;
    calls.push(p);
  }
  for (const p of fn.params || []) {
    if (!p.symbol || !p.name) continue;
    const t = p.declaredType || p.ctype;
    const c = t && T.canonical(t);
    if (!c || c.kind === 'reference' || c.kind === 'pointer') continue;
    const text = declTypeText(an.unit, p.symbol);
    if (!expensive(t, text, { strings: false })) continue;
    if (/^(::)?std::(shared_ptr|function)\b/.test(text)) continue; // sinks by convention
    if (isModified(p.symbol, fn.body)) continue;
    const idx = fn.params.indexOf(p);
    if (calls.some((c) => { const a = skip((c.args || [])[idx]); return a && (isStdMove(a) || !(a.type === 'Identifier' || a.type === 'MemberExpr' || a.type === 'IndexExpr' || (a.type === 'UnaryExpr' && a.op === '*'))); })) continue;
    an.report('PASS_BY_VALUE', p, {
      en: `Parameter ${p.name} of type ${text || T.typeToString(t)} is passed by value but only read; pass it as a const reference.`,
      ko: `${text || T.typeToString(t)} 타입 매개변수 ${p.name}을(를) 값으로 받지만 읽기만 합니다. const 참조로 받으세요.`,
    }, [], { tag: 'pass_by_value' });
  }
}

// ------------------------------------------------------------------ class-level checks

function classChecks(engine, report) {
  const ci = engine.classIndex();
  for (const c of ci.classes.values()) {
    const rec = c.recs[0] && c.recs[0].type;
    if (!rec || !rec.decl || !rec.decl.loc || !engine.userFiles.has(rec.decl.loc.file)) continue;
    const name = c.qname.split('::').pop();
    let copyCtor = null, copyAssign = null;
    for (const [mn, list] of c.methods) {
      for (const { sym } of list) {
        const d = (sym.decls || [])[0];
        if (!d || !d.params) continue;
        const ps = d.params.filter((p, i) => i === 0 || !p.default);
        if (ps.length !== 1) continue;
        const pt = ps[0].ctype && T.canonical(ps[0].ctype);
        const self = pt && pt.kind === 'reference' && !pt.rvalue && canon(pt.to) && canon(pt.to).kind === 'record' && canon(pt.to).name === rec.name;
        if (!self) continue;
        if (mn === name || d.isConstructor) copyCtor = d;
        else if (mn === 'operator=') copyAssign = d;
      }
    }
    const owns = (rec.fields || []).some((f) => { const ft = canon(f.type); return ft && ft.kind === 'pointer'; });
    if (!owns) continue;
    const user = (d) => d && !d.isDeleted && !d.isDefault;
    if (user(copyCtor) && !copyAssign) {
      report(rec.decl, 'COPY_WITHOUT_ASSIGN', { en: `Class ${c.qname} has a user-written copy constructor but no copy assignment operator; the implicit one copies its pointer members shallowly.`, ko: `클래스 ${c.qname}에 직접 쓴 복사 생성자는 있지만 복사 대입 연산자가 없어 암시적 대입이 포인터 멤버를 얕게 복사합니다.` });
    }
    if (user(copyAssign) && !copyCtor) {
      report(rec.decl, 'ASSIGN_WITHOUT_COPY', { en: `Class ${c.qname} has a user-written copy assignment operator but no copy constructor; the implicit one copies its pointer members shallowly.`, ko: `클래스 ${c.qname}에 직접 쓴 복사 대입 연산자는 있지만 복사 생성자가 없어 암시적 복사가 포인터 멤버를 얕게 복사합니다.` });
    }
  }
}

module.exports = { runCpp, runDontCall, classChecks, escapingThrows, isNoexcept, declTypeText, contKind };
