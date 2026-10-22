'use strict';

// SEI CERT C++ — CTR: containers (plus the shared iterator-invalidation scan used by STR52-CPP).

const { rule } = require('../lib/meta');
const U = require('../lib/util');
const X = require('../lib/cpp');
const { M, T, cf } = U;

// ------------------------------------------------------------ container facts
// Known constant size of a container variable: std::array<T, N>, vector v(N), v = {a, b}, v{a, b}.
function knownSize(unit, sym) {
  if (!sym) return null;
  const b = X.symStd(sym);
  if (!b) return null;
  const d = (sym.decls || [])[0];
  if (b === 'array') {
    const ta = X.symTemplateArgs(sym);
    if (ta.length >= 2) { const n = U.constInt(unit, ta[1]); if (n != null) return Number(n); }
    return null;
  }
  if (!['vector', 'deque', 'string', 'wstring'].includes(b) || !d || d.type !== 'VarDecl') return null;
  if (!d.init) return 0;
  if (d.init.type === 'ParenListInit' && d.init.args.length >= 1 && b !== 'string' && b !== 'wstring') {
    const n = U.constInt(unit, d.init.args[0]);
    return n != null ? Number(n) : null;
  }
  if (d.init.type === 'InitList') return d.init.items.length;
  if (b === 'string' || b === 'wstring') {
    const s = U.strLit(X.initExpr(d.init));
    return s != null ? s.length : null;
  }
  return null;
}

const GROW = new Set(['push_back', 'emplace_back', 'push_front', 'emplace_front', 'insert', 'emplace', 'resize', 'assign', 'append', 'swap', 'operator=']);
const SHRINK = new Set(['erase', 'clear', 'pop_back', 'pop_front', 'resize', 'assign', 'swap', 'remove', 'remove_if', 'unique', 'splice']);
const INVALIDATE_SEQ = new Set(['push_back', 'emplace_back', 'insert', 'emplace', 'erase', 'resize', 'clear', 'reserve', 'assign', 'shrink_to_fit', 'push_front', 'emplace_front', 'pop_back', 'pop_front', 'swap', 'append', 'replace']);
const INVALIDATE_NODE = new Set(['erase', 'clear', 'assign', 'swap']); // list / map / set: only these touch existing iterators

// Is the container modified in size anywhere in fn (so constant-size reasoning does not hold)?
function sizeChanged(fn, sym) {
  if (!fn || !sym) return true;
  for (const u of sym.uses || []) {
    if (U.enclosingFn(u) !== fn && fn.type !== 'LambdaExpr') { /* other functions do not matter */ }
    const p = U.parent(u);
    if (p && p.type === 'MemberExpr' && U.pkey(u) === 'object' && (GROW.has(p.member) || SHRINK.has(p.member))) return true;
    if (p && p.type === 'AssignExpr' && U.pkey(u) === 'left') return true;
    if (p && p.type === 'CallExpr' && p.callee !== u) return true; // passed to a function by reference
    if (p && p.type === 'UnaryExpr' && p.op === '&') return true;
  }
  return false;
}

// Container a pointer / iterator / reference was obtained from: v.begin(), v.find(x), &v[i], v.data(), &v.front(), v[i] (reference)
const ITER_SOURCES = new Set(['begin', 'end', 'cbegin', 'cend', 'rbegin', 'rend', 'find', 'lower_bound', 'upper_bound', 'data', 'front', 'back', 'at', 'c_str']);
function originOf(unit, e) {
  e = U.strip(e);
  if (!e) return null;
  if (e.type === 'UnaryExpr' && e.op === '&') e = U.strip(e.arg);
  if (!e) return null;
  if (e.type === 'CallExpr' && U.isMemberCall(e) && ITER_SOURCES.has(U.callName(e))) return X.memberObj(e);
  if (e.type === 'CallExpr' && X.stdCall(e, ['begin', 'end', 'next', 'prev', 'find', 'find_if', 'lower_bound', 'upper_bound']) && e.args.length) {
    const ic = X.iterCall(e.args[0]);
    if (ic) return ic.obj;
    if (X.iterCall(e)) return X.iterCall(e).obj;
  }
  if (e.type === 'BinaryExpr' && (e.op === '+' || e.op === '-')) return originOf(unit, e.left);
  if (e.type === 'IndexExpr') {
    const s = U.idSym(e.object);
    if (s && X.isContainer(X.symStd(s))) return U.strip(e.object);
  }
  return null;
}

// Iterator-like variables: { sym, container: Symbol, node }
function iteratorVars(unit, fn) {
  const out = [];
  for (const v of cf.findAll(fn.body || fn, 'VarDecl')) {
    if (!v.init || !v.symbol) continue;
    const t = v.ctype && T.canonical(v.ctype);
    const isRef = t && t.kind === 'reference';
    const ex = X.initExpr(v.init);
    let o = originOf(unit, ex);
    if (!o) continue;
    const e = U.strip(ex);
    // `int x = v[0]` copies; only references / pointers / iterators keep pointing into the container
    if (e && e.type === 'IndexExpr' && !isRef) continue;
    if (e && e.type === 'CallExpr' && /^(front|back|at)$/.test(U.callName(e)) && !isRef) continue;
    const cs = U.idSym(o);
    if (!cs) continue;
    out.push({ sym: v.symbol, container: cs, node: v });
  }
  return out;
}

function containerFamily(sym) {
  const b = X.symStd(sym);
  if (!b) return null;
  if (X.isString(b)) return 'string';
  if (/^(list|forward_list|map|set|multimap|multiset)$/.test(b)) return 'node';
  if (/^unordered_/.test(b)) return 'hash';
  if (/^(vector|deque)$/.test(b)) return 'seq';
  return null;
}

function invalidates(sym, name) {
  const fam = containerFamily(sym);
  if (!fam) return false;
  if (fam === 'node') return INVALIDATE_NODE.has(name);
  if (fam === 'hash') return INVALIDATE_NODE.has(name) || name === 'insert' || name === 'emplace' || name === 'rehash' || name === 'reserve';
  return INVALIDATE_SEQ.has(name);
}

// Shared by CTR51-CPP (non-strings) and STR52-CPP (strings).
function invalidationCheck(unit, api, wantString) {
  const reported = new Set();
  for (const fn of U.functions(unit)) {
    const iters = iteratorVars(unit, fn);
    for (const it of iters) {
      const fam = containerFamily(it.container);
      if (!fam || (fam === 'string') !== wantString) continue;
      // modifying calls on the container after the iterator was obtained
      for (const u of it.container.uses || []) {
        if (u.loc.start <= it.node.loc.end) continue;
        const p = U.parent(u);
        let modName = null, mod = null;
        if (p && p.type === 'MemberExpr' && U.pkey(u) === 'object') {
          const call = U.parent(p);
          if (call && call.type === 'CallExpr' && call.callee === p && invalidates(it.container, p.member)) { modName = p.member; mod = call; }
        } else if (p && p.type === 'AssignExpr' && U.pkey(u) === 'left' && fam === 'string') { modName = p.op === '=' ? 'operator=' : `operator${p.op}`; mod = p; }
        if (!mod) continue;
        // it = c.erase(it) / it = c.insert(...) re-seat the iterator
        const mp = U.parent(mod);
        if (mp && mp.type === 'AssignExpr' && U.idSym(mp.left) === it.sym) continue;
        // the iterator must have been valid before this modification: no reassignment between
        const use = X.scanAfter(mod, X.symClassifier(it.sym));
        const loopUse = !use && X.inLoopBetween(mod, it.node) && (it.sym.uses || []).some((x) => x.loc.start < mod.loc.start && x.loc.start > it.node.loc.end && X.inLoopBetween(x, it.node) === X.inLoopBetween(mod, it.node));
        const where = use || (loopUse ? mod : null);
        if (!where || reported.has(where)) continue;
        // a jump right after the modification (break / return) ends the loop: fine
        if (!use && loopUse) {
          const st = U.stmtOf(mod);
          const next = U.following(st)[0];
          if (next && X.JUMPS.has(next.type)) continue;
          // the loop's own increment re-reads the iterator
        }
        reported.add(where);
        const kind = wantString ? M('string', '문자열') : M('container', '컨테이너');
        api.report(where, M(`'${it.sym.name}' refers into ${kind.en} '${it.container.name}' and is used after ${modName}() at line ${mod.loc.line}, which may invalidate it.`, `'${it.sym.name}' 는 ${kind.ko} '${it.container.name}' 내부를 가리키는데, 이를 무효화할 수 있는 ${modName}() (${mod.loc.line} 행) 뒤에 사용됩니다.`));
      }
    }
    // range-for over a container that the body grows or shrinks
    for (const rf of cf.findAll(fn.body || fn, 'RangeForStmt')) {
      const cs = U.idSym(rf.range);
      const fam = cs && containerFamily(cs);
      if (!fam || (fam === 'string') !== wantString) continue;
      for (const c of cf.findAll(rf.body, 'CallExpr')) {
        const o = X.memberObj(c);
        if (!o || U.idSym(o) !== cs || !invalidates(cs, U.callName(c))) continue;
        const st = U.stmtOf(c);
        const next = st && U.following(st)[0];
        if (next && (X.JUMPS.has(next.type))) continue;
        if (reported.has(c)) continue;
        reported.add(c);
        api.report(c, M(`${U.callName(c)}() modifies '${cs.name}' while a range-for loop iterates over it; the loop's iterators are invalidated.`, `범위 for 문이 '${cs.name}' 를 순회하는 동안 ${U.callName(c)}() 가 이를 수정하여 반복자가 무효화됩니다.`));
      }
    }
    // for (auto it = c.begin(); it != c.end(); ++it) { c.erase(it); }
    for (const loop of cf.findAll(fn.body || fn, 'ForStmt')) {
      const init = loop.init && loop.init.type === 'Declaration' ? loop.init.declarators[0] : null;
      if (!init || !init.symbol || !loop.inc) continue;
      const o = originOf(unit, X.initExpr(init.init));
      const cs = o && U.idSym(o);
      const fam = cs && containerFamily(cs);
      if (!fam || (fam === 'string') !== wantString) continue;
      if (!U.refersTo(loop.inc, init.symbol)) continue;
      for (const c of cf.findAll(loop.body, 'CallExpr')) {
        const mo = X.memberObj(c);
        if (!mo || U.idSym(mo) !== cs || !invalidates(cs, U.callName(c))) continue;
        const mp = U.parent(c);
        if (mp && mp.type === 'AssignExpr' && U.idSym(mp.left) === init.symbol) continue;
        const st = U.stmtOf(c);
        const next = st && U.following(st)[0];
        if (next && X.JUMPS.has(next.type)) continue;
        if (reported.has(c)) continue;
        reported.add(c);
        api.report(c, M(`${U.callName(c)}() on '${cs.name}' inside the loop invalidates iterator '${init.name}', which the loop then increments.`, `루프 안의 '${cs.name}' 에 대한 ${U.callName(c)}() 가 반복자 '${init.name}' 를 무효화하는데 루프가 이를 다시 증가시킵니다.`));
      }
    }
  }
}

// Algorithms whose last argument is a comparator (when they get one more argument than the range).
const CMP_ALGOS = { sort: 3, stable_sort: 3, partial_sort: 4, nth_element: 4, lower_bound: 4, upper_bound: 4, equal_range: 4, binary_search: 4, min_element: 3, max_element: 3, minmax_element: 3, make_heap: 3, push_heap: 3, pop_heap: 3, sort_heap: 3, is_sorted: 3, is_sorted_until: 3, merge: 6, inplace_merge: 4, includes: 5, set_union: 6, set_intersection: 6, set_difference: 6, set_symmetric_difference: 6, is_heap: 3, max: 3, min: 3, minmax: 3, lexicographical_compare: 5 };
const CMP_TEMPLATES = { set: 1, multiset: 1, map: 2, multimap: 2, priority_queue: 2 };
const PRED_ALGOS = new Set(['remove_if', 'remove_copy_if', 'find_if', 'find_if_not', 'count_if', 'copy_if', 'replace_if', 'replace_copy_if', 'partition', 'stable_partition', 'partition_copy', 'all_of', 'any_of', 'none_of', 'adjacent_find', 'unique', 'erase_if', 'is_partitioned', 'partition_point']);

function bodyReturnsNonStrict(body) {
  if (!body) return null;
  for (const r of cf.findAll(body, 'ReturnStmt')) {
    let a = U.strip(r.arg);
    if (!a) continue;
    if (a.type === 'BinaryExpr' && (a.op === '<=' || a.op === '>=')) return a;
    if (a.type === 'UnaryExpr' && a.op === '!') {
      const i = U.strip(a.arg);
      if (i && i.type === 'BinaryExpr' && (i.op === '<' || i.op === '>')) return a;
    }
  }
  return null;
}

function callOperator(rt) {
  const rd = X.recDef(rt);
  if (!rd) return null;
  const m = X.shape(rd).methods.find((f) => f.name === 'operator()');
  if (!m) return null;
  if (m.body) return m;
  const s = m.symbol;
  for (const d of (s && s.decls) || []) if (d.body) return d;
  return s && s.definition && s.definition.body ? s.definition : null;
}

// Body of a comparator / predicate expression: lambda, function name, function object.
function callableBody(e) {
  e = U.strip(e);
  if (!e) return null;
  if (e.type === 'LambdaExpr') return { node: e, body: e.body, name: 'lambda' };
  if (e.type === 'UnaryExpr' && e.op === '&') e = U.strip(e.arg);
  const s = U.idSym(e);
  if (s && s.kind === 'function') {
    const d = U.fnFromExpr(e);
    return d ? { node: d, body: d.body, name: s.name } : null;
  }
  let rt = X.recType(e.ctype);
  if (!rt && e.type === 'CastExpr' && e.typeName) rt = X.recType(e.typeName.ctype);
  if (rt) {
    const op = callOperator(rt);
    return op ? { node: op, body: op.body, name: rt.name, rec: rt, varSym: s } : null;
  }
  return null;
}

// std::less_equal / std::greater_equal used as an ordering. The front end does not
// know these names as types (`std::set<int, std::less_equal<int>>` fails to parse),
// so they are found in the tokens: inside the template arguments of an ordered
// container, or as an argument of a sorting algorithm.
function namedNonStrictTokens(unit) {
  const out = [];
  const toks = unit.tokens || [];
  for (let i = 2; i < toks.length; i++) {
    const t = toks[i];
    if (t.kind !== 'identifier' || (t.value !== 'less_equal' && t.value !== 'greater_equal')) continue;
    if (!t.file || t.file.startsWith('<')) continue;
    if (toks[i - 1].value !== '::' || toks[i - 2].value !== 'std') continue;
    // walk back to the enclosing '<' or '(' to see who receives it
    let depth = 0, owner = null;
    for (let j = i - 3; j >= 0 && i - j < 200; j--) {
      const v = toks[j].value;
      if (v === '>' || v === ')') depth++;
      else if (v === '>>') depth += 2;
      else if (v === '<' || v === '(') {
        if (depth === 0) { owner = toks[j - 1] && toks[j - 1].value; break; }
        depth--;
      } else if (v === ';' || v === '{' || v === '}') break;
    }
    if (owner && (owner in CMP_TEMPLATES || owner in CMP_ALGOS)) out.push({ tok: t, name: t.value, owner });
  }
  return out;
}

module.exports = [
  rule('CTR50-CPP', {
    risk: 'HLH', cwe: ['CWE-119', 'CWE-125', 'CWE-787', 'CWE-129'], sec: true, approx: true, deep: 'absint:OVERRUN',
    name: ['Guarantee that container indices and iterators are within the valid range', '컨테이너 인덱스와 반복자가 유효 범위 안에 있도록 보장하세요'],
    why: ['operator[] on std::array, std::vector and similar containers does no bounds checking; an index outside [0, size()) reads or writes outside the storage.', 'std::array, std::vector 등의 operator[] 는 경계 검사를 하지 않아 [0, size()) 밖의 인덱스는 저장 공간 밖을 읽거나 씁니다.'],
    fix: ['Compare the index with size() before indexing, or use at(), which throws std::out_of_range.', '인덱싱 전에 인덱스를 size() 와 비교하거나 std::out_of_range 를 던지는 at() 을 사용하세요.'],
  }, {
    check(unit, api) {
      for (const ix of U.nodes(unit, 'IndexExpr')) {
        const cs = U.idSym(ix.object);
        if (!cs) continue;
        const b = X.symStd(cs);
        const fn = U.enclosingFn(ix);
        if (b && X.isContainer(b) && !X.isString(b) && !/map$/.test(b)) {
          const k = U.constInt(unit, ix.index);
          if (k != null) {
            const n = knownSize(unit, cs);
            if (n != null && (k < 0n || Number(k) >= n) && (b === 'array' || !sizeChanged(fn, cs))) {
              api.report(ix, M(`Index ${k} is out of range for '${cs.name}' (std::${b} of size ${n}).`, `인덱스 ${k} 는 '${cs.name}' (크기 ${n} 인 std::${b}) 의 범위를 벗어납니다.`));
            }
            continue;
          }
        }
        // unchecked index parameter
        const is = U.idSym(ix.index);
        if (!fn || fn.type !== 'FunctionDecl' || !is || is.kind !== 'parameter' || cs === is) continue;
        const ps = (fn.params || []).map((p) => p.symbol);
        if (!ps.includes(is)) continue;
        const it = is.type && T.canonical(is.type);
        if (!it || it.kind !== 'int') continue;
        let what = null;
        if (cs.kind === 'parameter' && b && X.isContainer(b) && !X.isString(b) && !/map$/.test(b)) what = `std::${b}`;
        else if (cs.kind === 'parameter') {
          const ct = cs.type && T.canonical(cs.type);
          const others = ps.filter((s) => s && s !== is && s !== cs && s.type && T.isInteger(T.canonical(s.type)));
          if (ct && ct.kind === 'pointer' && others.length) what = 'pointer';
        }
        if (!what) continue;
        if (X.testedIn(fn.body, is)) continue;
        if (cf.findFirst(fn.body, (n) => n.type === 'CallExpr' && /^(at|size)$/.test(U.callName(n) || '') && U.refersTo(n, is))) continue;
        api.report(ix, M(`Index parameter '${is.name}' is used to index '${cs.name}' without being checked against its size.`, `인덱스 매개변수 '${is.name}' 가 크기와 비교되지 않은 채 '${cs.name}' 의 인덱스로 사용됩니다.`));
      }
    },
  }),

  rule('CTR51-CPP', {
    risk: 'HPM', cwe: ['CWE-416', 'CWE-664'], sec: true, approx: true, deep: 'absint:INVALIDATED_ITERATOR',
    name: ['Use valid references, pointers, and iterators to reference elements of a container', '컨테이너 요소는 유효한 참조, 포인터, 반복자로 참조하세요'],
    why: ['push_back, insert, erase, resize, clear and similar calls may reallocate or remove elements; iterators, pointers and references obtained before the call then dangle.', 'push_back, insert, erase, resize, clear 등은 재할당하거나 요소를 지울 수 있어 호출 전에 얻은 반복자, 포인터, 참조가 댕글링됩니다.'],
    fix: ['Re-obtain the iterator after the modifying call (it = v.erase(it)), reserve capacity first, or use indices.', '수정 호출 뒤 반복자를 다시 얻거나(it = v.erase(it)), 먼저 용량을 예약하거나, 인덱스를 사용하세요.'],
  }, {
    check(unit, api) {
      invalidationCheck(unit, api, false);
    },
  }),

  rule('CTR52-CPP', {
    risk: 'HLH', cwe: ['CWE-119', 'CWE-787'], sec: true, approx: true,
    name: ['Guarantee that library functions do not overflow', '라이브러리 함수가 넘치지 않도록 보장하세요'],
    why: ['std::copy, std::fill_n, std::transform and memcpy write through the destination iterator without growing the container; an empty or too small destination is overrun.', 'std::copy, std::fill_n, std::transform, memcpy 는 컨테이너를 늘리지 않고 대상 반복자로 쓰기만 해서 비어 있거나 작은 대상은 넘칩니다.'],
    fix: ['Size the destination first (resize / construct with the size) or use std::back_inserter.', '먼저 대상 크기를 맞추거나(resize / 크기 지정 생성) std::back_inserter 를 사용하세요.'],
  }, {
    check(unit, api) {
      const DEST = { copy: 2, copy_n: 2, copy_if: 2, move: 2, fill_n: 0, transform: -1, generate_n: 0, copy_backward: 2, reverse_copy: 2, rotate_copy: 3, unique_copy: 2, replace_copy: 2, remove_copy: 2, merge: 4, set_union: 4, partial_sum: 2, adjacent_difference: 2, iota: -2 };
      for (const c of U.nodes(unit, 'CallExpr')) {
        const n = X.stdCall(c, Object.keys(DEST));
        let destIdx = n ? DEST[n] : null;
        if (n === 'move' && c.args.length !== 3) continue;
        if (n === 'transform') destIdx = c.args.length === 4 ? 2 : c.args.length === 5 ? 3 : null;
        if (destIdx == null || destIdx < 0) {
          if (U.isLib(c, new Set(['memcpy', 'memmove', 'memset']))) {
            const o = X.memberObj(U.arg(c, 0), ['data']);
            const cs = o && U.idSym(o);
            if (cs && X.isContainer(X.symStd(cs)) && knownSize(unit, cs) === 0 && !usedBefore(cs, c)) {
              api.report(c, M(`${U.callName(c)}() writes into '${cs.name}.data()', but '${cs.name}' is empty.`, `${U.callName(c)}() 가 '${cs.name}.data()' 에 쓰지만 '${cs.name}' 는 비어 있습니다.`));
            }
          }
          continue;
        }
        const d = X.iterCall(c.args[destIdx]);
        if (!d || d.kind !== 'begin') continue;
        const cs = U.idSym(d.obj);
        if (!cs || !X.isContainer(X.symStd(cs))) continue;
        const size = knownSize(unit, cs);
        if (size == null) continue;
        if (usedBefore(cs, c)) continue;
        let need = null;
        if (n === 'fill_n' || n === 'copy_n' || n === 'generate_n') { const k = U.constInt(unit, c.args[n === 'copy_n' ? 1 : 1]); need = k != null ? Number(k) : null; }
        if (size === 0 || (need != null && need > size)) {
          api.report(c, M(`std::${n}() writes through '${U.src(unit, c.args[destIdx]).trim()}', but '${cs.name}' has only ${size} element(s); use std::back_inserter or resize it first.`, `std::${n}() 가 '${U.src(unit, c.args[destIdx]).trim()}' 로 쓰지만 '${cs.name}' 의 요소는 ${size} 개뿐입니다. std::back_inserter 를 쓰거나 먼저 크기를 맞추세요.`));
        }
      }
    },
  }),

  rule('CTR53-CPP', {
    risk: 'HPH', cwe: ['CWE-758', 'CWE-119'], approx: true,
    name: ['Use valid iterator ranges', '유효한 반복자 범위를 사용하세요'],
    why: ['An iterator range whose begin and end come from different containers is not a valid range; the algorithm walks off into unrelated memory.', '시작과 끝이 서로 다른 컨테이너에서 온 반복자 범위는 유효한 범위가 아니어서 알고리즘이 관계없는 메모리로 넘어갑니다.'],
    fix: ['Take both iterators from the same container: std::sort(v.begin(), v.end()).', '두 반복자를 같은 컨테이너에서 가져오세요: std::sort(v.begin(), v.end()).'],
  }, {
    check(unit, api) {
      for (const c of U.nodes(unit, 'CallExpr')) {
        const args = c.args || [];
        for (let i = 0; i + 1 < args.length; i++) {
          const a = X.iterCall(args[i]), b = X.iterCall(args[i + 1]);
          if (!a || !b || a.kind !== 'begin' || b.kind !== 'end') continue;
          const ka = U.key(unit, a.obj), kb = U.key(unit, b.obj);
          if (!ka || !kb || ka === kb) continue;
          api.report(c, M(`Iterator range [${U.src(unit, args[i]).trim()}, ${U.src(unit, args[i + 1]).trim()}) mixes two different containers.`, `반복자 범위 [${U.src(unit, args[i]).trim()}, ${U.src(unit, args[i + 1]).trim()}) 가 서로 다른 두 컨테이너를 섞습니다.`));
          break;
        }
      }
    },
  }),

  rule('CTR54-CPP', {
    risk: 'MPM', cwe: ['CWE-758', 'CWE-469'], approx: true,
    name: ['Do not subtract iterators that do not refer to the same container', '같은 컨테이너를 가리키지 않는 반복자끼리 빼지 마세요'],
    why: ['Subtracting or ordering iterators of different containers is undefined behavior; the result is meaningless.', '서로 다른 컨테이너의 반복자를 빼거나 비교하는 것은 정의되지 않은 동작이며 결과에 의미가 없습니다.'],
    fix: ['Only subtract or compare iterators obtained from the same container.', '같은 컨테이너에서 얻은 반복자끼리만 빼거나 비교하세요.'],
  }, {
    check(unit, api) {
      const origins = new Map();
      for (const fn of U.functions(unit)) {
        for (const it of iteratorVars(unit, fn)) {
          const vals = X.assignedValues(it.sym);
          const isIter = ({ value }) => { const v = U.strip(value); return v && v.type === 'CallExpr' && !/^(front|back|at|data|c_str)$/.test(U.callName(v) || ''); };
          if (!vals.every(isIter)) continue;
          const srcs = new Set(vals.map(({ value }) => { const o = originOf(unit, value); return o ? U.key(unit, o) : '?'; }));
          if (srcs.size === 1 && !srcs.has('?')) origins.set(it.sym, { k: [...srcs][0], name: it.container.name });
        }
      }
      const originKey = (e) => {
        const ic = X.iterCall(e);
        if (ic) { const k = U.key(unit, ic.obj); return k ? { k, name: U.src(unit, ic.obj).trim() } : null; }
        const s = U.idSym(e);
        return s && origins.has(s) ? origins.get(s) : null;
      };
      for (const b of U.nodes(unit, 'BinaryExpr')) {
        if (!['-', '<', '>', '<=', '>=', '==', '!='].includes(b.op)) continue;
        const l = originKey(b.left), r = originKey(b.right);
        if (!l || !r || l.k === r.k) continue;
        const verb = b.op === '-' ? M('subtracts', '뺍니다') : M('compares', '비교합니다');
        api.report(b, M(`'${U.src(unit, b).trim()}' ${verb.en} iterators of different containers '${l.name}' and '${r.name}'.`, `'${U.src(unit, b).trim()}' 가 서로 다른 컨테이너 '${l.name}' 와 '${r.name}' 의 반복자를 ${verb.ko}.`));
      }
    },
  }),

  rule('CTR55-CPP', {
    risk: 'HLM', cwe: ['CWE-119', 'CWE-125'], sec: true, approx: true,
    name: ['Do not use an additive operator on an iterator if the result would overflow', '결과가 범위를 넘는다면 반복자에 덧셈 연산자를 쓰지 마세요'],
    why: ['Moving an iterator past end() (c.end() + 1, c.begin() + n with n > size()) is undefined behavior even if the result is never dereferenced.', '반복자를 end() 너머로 옮기는 것(c.end() + 1, n > size() 인 c.begin() + n)은 역참조하지 않아도 정의되지 않은 동작입니다.'],
    fix: ['Check the distance against size() first, e.g. it + std::min<std::ptrdiff_t>(n, c.end() - it).', '먼저 거리를 size() 와 비교하세요. 예: it + std::min<std::ptrdiff_t>(n, c.end() - it).'],
  }, {
    check(unit, api) {
      const sizeTested = (fn, cs) => !!cf.findFirst(fn.body || fn, (n) => n.type === 'CallExpr' && /^(size|empty|length)$/.test(U.callName(n) || '') && U.idSym(X.memberObj(n)) === cs && (U.inCondition(n) || cf.enclosing(n, ['IfStmt', 'ConditionalExpr', 'WhileStmt', 'ForStmt'])));
      const check = (node, itExpr, kExpr, sign) => {
        const ic = X.iterCall(itExpr);
        if (!ic) return;
        const k = U.constInt(unit, kExpr);
        if (k == null) return;
        const kk = sign * Number(k);
        if (kk <= 0) return;
        const cs = U.idSym(ic.obj);
        if (ic.kind === 'end') {
          api.report(node, M(`'${U.src(unit, node).trim()}' moves an iterator ${kk} past end().`, `'${U.src(unit, node).trim()}' 가 반복자를 end() 너머로 ${kk} 만큼 옮깁니다.`));
          return;
        }
        if (!cs) return;
        const fn = U.enclosingFn(node);
        const size = knownSize(unit, cs);
        if (size != null && kk > size && (X.symStd(cs) === 'array' || !sizeChanged(fn, cs))) {
          api.report(node, M(`'${U.src(unit, node).trim()}' moves past the end of '${cs.name}', which has ${size} element(s).`, `'${U.src(unit, node).trim()}' 가 요소 ${size} 개인 '${cs.name}' 의 끝을 넘어갑니다.`));
          return;
        }
        if (size == null && fn && !sizeTested(fn, cs)) {
          api.report(node, M(`'${U.src(unit, node).trim()}' advances ${kk} element(s) into '${cs.name}' without checking its size.`, `'${U.src(unit, node).trim()}' 가 '${cs.name}' 의 크기를 확인하지 않고 ${kk} 요소만큼 이동합니다.`));
        }
      };
      for (const b of U.nodes(unit, 'BinaryExpr')) {
        if (b.op === '+') check(b, b.left, b.right, 1);
        else if (b.op === '-' && X.iterCall(b.left) && X.iterCall(b.left).kind === 'end') { /* end() - n is fine */ }
      }
      for (const c of U.nodes(unit, 'CallExpr')) {
        const n = X.stdCall(c, ['next', 'advance']);
        if (!n) continue;
        if (n === 'next' && c.args.length === 1) { const ic = X.iterCall(c.args[0]); if (ic && ic.kind === 'end') api.report(c, M(`'${U.src(unit, c).trim()}' moves an iterator past end().`, `'${U.src(unit, c).trim()}' 가 반복자를 end() 너머로 옮깁니다.`)); continue; }
        if (c.args.length !== 2) continue;
        let itE = c.args[0];
        const s = U.idSym(itE);
        if (n === 'advance' && s) {
          const vals = X.assignedValues(s);
          if (vals.length === 1) itE = vals[0].value;
        }
        check(c, itE, c.args[1], 1);
      }
    },
  }),

  rule('CTR56-CPP', {
    risk: 'HLH', cwe: ['CWE-758', 'CWE-119'], approx: true,
    name: ['Do not use pointer arithmetic on polymorphic objects', '다형 객체에 포인터 산술을 쓰지 마세요'],
    why: ['Indexing or incrementing a Base* that points into an array of Derived objects steps by sizeof(Base), not sizeof(Derived); every element after the first is misread.', 'Derived 객체 배열을 가리키는 Base* 를 인덱싱하거나 증가시키면 sizeof(Derived) 가 아닌 sizeof(Base) 만큼 이동하여 첫 요소 이후를 잘못 읽습니다.'],
    fix: ['Use an array/vector of the derived type, or of pointers (std::vector<std::unique_ptr<Base>>).', '파생 형식의 배열/벡터 또는 포인터의 벡터(std::vector<std::unique_ptr<Base>>)를 사용하세요.'],
  }, {
    check(unit, api) {
      const derivedSource = (e) => {
        e = U.strip(e);
        if (!e) return null;
        if (e.type === 'NewExpr' && e.isArray) return X.pointeeRec(e.ctype);
        const t = e.ctype && T.canonical(e.ctype);
        if (t && t.kind === 'array') return X.recType(t.of);
        return null;
      };
      const arith = (sym, root) => (sym.uses || []).find((u) => {
        if (root && !cf.ancestors(u).includes(root)) return false;
        const p = U.parent(u);
        if (!p) return false;
        if (p.type === 'IndexExpr' && U.pkey(u) === 'object') return true;
        if (p.type === 'BinaryExpr' && (p.op === '+' || p.op === '-') && T.isInteger(T.canonical((U.pkey(u) === 'left' ? p.right : p.left).ctype || T.T.int))) return true;
        if (p.type === 'UnaryExpr' && (p.op === '++' || p.op === '--')) return true;
        if (p.type === 'AssignExpr' && (p.op === '+=' || p.op === '-=') && U.pkey(u) === 'left') return true;
        return false;
      });
      // local Base *p = new Derived[n] / = derivedArray
      for (const v of U.nodes(unit, 'VarDecl')) {
        const bt = X.pointeeRec(v.ctype);
        if (!bt || !v.symbol || !v.init) continue;
        const t = T.canonical(v.ctype);
        if (t.kind !== 'pointer') continue;
        const dt = derivedSource(X.initExpr(v.init));
        if (!dt || dt === bt || !X.derivesFrom(dt, bt)) continue;
        const u = arith(v.symbol);
        if (u) api.report(u, M(`Pointer arithmetic on '${v.name}' (${bt.name} *), which points to an array of ${dt.name}; elements are ${dt.name}-sized.`, `${dt.name} 배열을 가리키는 '${v.name}' (${bt.name} *) 에 포인터 산술을 합니다. 요소 크기는 ${dt.name} 기준입니다.`));
      }
      // f(derivedArray) where f indexes its Base * parameter
      for (const c of U.nodes(unit, 'CallExpr')) {
        const def = U.calleeDef(c, api.project);
        if (!def) continue;
        (c.args || []).forEach((a, i) => {
          const dt = derivedSource(a);
          const p = (def.params || [])[i];
          if (!dt || !p || !p.symbol) return;
          const bt = X.pointeeRec(p.ctype);
          if (!bt || bt === dt || !X.derivesFrom(dt, bt)) return;
          if (!X.isPolymorphic(bt) && !X.isPolymorphic(dt) && !(X.recDef(dt) && X.shape(X.recDef(dt)).fields.length)) return;
          const u = arith(p.symbol, def.body);
          if (u) api.report(c.args[i], M(`Array of ${dt.name} is passed as '${p.name}' (${bt.name} *) to '${U.fnName(def)}', which uses pointer arithmetic on it (line ${u.loc.line}).`, `${dt.name} 배열이 '${U.fnName(def)}' 의 '${p.name}' (${bt.name} *) 로 전달되는데, 그 함수는 이 포인터에 산술 연산을 합니다(${u.loc.line} 행).`));
        });
      }
    },
  }),

  rule('CTR57-CPP', {
    risk: 'LPM', cwe: ['CWE-758'], approx: true,
    name: ['Provide a valid ordering predicate', '유효한 순서 술어를 제공하세요'],
    why: ['Sorting algorithms and associative containers require a strict weak ordering; a comparator using <= or >= (or std::less_equal) makes equal elements compare "less", causing crashes, duplicates or infinite loops.', '정렬 알고리즘과 연관 컨테이너는 엄격 약순서를 요구합니다. <= 나 >= (또는 std::less_equal)를 쓰는 비교자는 같은 요소를 "작다"고 판단하여 충돌, 중복, 무한 루프를 일으킵니다.'],
    fix: ['Compare with < (or >) only; use std::less<> / std::greater<>.', '< (또는 >) 로만 비교하고 std::less<> / std::greater<> 를 사용하세요.'],
  }, {
    check(unit, api) {
      const checkCallable = (where, e, ctx) => {
        const cb = callableBody(e);
        const bad = cb && bodyReturnsNonStrict(cb.body);
        if (bad) api.report(where, M(`The comparator of ${ctx} returns '${U.src(unit, bad).trim()}'; using <= or >= is not a strict weak ordering.`, `${ctx} 의 비교자가 '${U.src(unit, bad).trim()}' 를 반환합니다. <= 나 >= 는 엄격 약순서가 아닙니다.`));
      };
      for (const c of U.nodes(unit, 'CallExpr')) {
        const n = X.stdCall(c, Object.keys(CMP_ALGOS));
        if (!n || c.args.length !== CMP_ALGOS[n]) continue;
        checkCallable(c, c.args[c.args.length - 1], `std::${n}()`);
      }
      for (const h of namedNonStrictTokens(unit)) {
        api.report(h.tok, M(`std::${h.name} is used as the ordering of std::${h.owner}; it is not a strict weak ordering.`, `std::${h.owner} 의 순서로 std::${h.name} 를 사용하는데 이는 엄격 약순서가 아닙니다.`));
      }
      for (const nt of U.nodes(unit, 'NamedType')) {
        const b = X.stdBare(nt.qname || nt.name);
        if (!b || !(b in CMP_TEMPLATES)) continue;
        const ta = (nt.templateArgs || [])[CMP_TEMPLATES[b]];
        if (!ta) continue;
        const rt = X.recType(ta.ctype);
        const op = rt && callOperator(rt);
        const bad = op && bodyReturnsNonStrict(op.body);
        if (bad) api.report(nt, M(`Comparator '${rt.name}' of std::${b} returns '${U.src(unit, bad).trim()}'; using <= or >= is not a strict weak ordering.`, `std::${b} 의 비교자 '${rt.name}' 가 '${U.src(unit, bad).trim()}' 를 반환합니다. <= 나 >= 는 엄격 약순서가 아닙니다.`));
      }
    },
  }),

  rule('CTR58-CPP', {
    risk: 'LLH', cwe: ['CWE-758'], approx: true,
    name: ['Predicate function objects should not be mutable', '술어 함수 객체는 변경 가능한 상태를 갖지 않아야 합니다'],
    why: ['Algorithms may copy a predicate any number of times; state kept inside the predicate (a mutable lambda or a function object updating its members) is lost or duplicated, so the result is unpredictable.', '알고리즘은 술어를 몇 번이든 복사할 수 있어 술어 안의 상태(mutable 람다나 멤버를 바꾸는 함수 객체)가 사라지거나 중복되어 결과를 예측할 수 없습니다.'],
    fix: ['Keep predicates stateless; hold state outside and capture it by reference, or pass std::ref(pred).', '술어는 상태 없이 두고, 상태는 바깥에 두고 참조로 캡처하거나 std::ref(pred) 를 넘기세요.'],
  }, {
    check(unit, api) {
      for (const c of U.nodes(unit, 'CallExpr')) {
        const n = X.stdCall(c, PRED_ALGOS);
        if (!n || !c.args.length) continue;
        const a = U.strip(c.args[c.args.length - 1]);
        if (!a) continue;
        if (a.type === 'LambdaExpr') {
          if (!a.mutable) continue;
          const byCopy = new Set((a.captures || []).filter((k) => !k.byRef && k.symbol).map((k) => k.symbol));
          const w = cf.findFirst(a.body, (x) => {
            const t = x.type === 'UnaryExpr' && (x.op === '++' || x.op === '--') ? x.arg : x.type === 'AssignExpr' ? x.left : null;
            const s = t && U.idSym(t);
            return !!s && (byCopy.has(s) || (a.captureDefault === '=' && s.kind !== 'parameter' && U.enclosingFn(x) === a && !cf.ancestors((s.decls || [])[0] || {}).includes(a)));
          });
          if (w) api.report(a, M(`The mutable lambda passed to std::${n}() changes its captured state ('${U.src(unit, w).trim()}'); the algorithm may copy it.`, `std::${n}() 에 전달된 mutable 람다가 캡처한 상태를 바꿉니다('${U.src(unit, w).trim()}'). 알고리즘이 이를 복사할 수 있습니다.`));
          continue;
        }
        const cb = callableBody(a);
        if (!cb || !cb.rec || !cb.body) continue;
        const w = cf.findFirst(cb.body, (x) => {
          const t = x.type === 'UnaryExpr' && (x.op === '++' || x.op === '--') ? x.arg : x.type === 'AssignExpr' ? x.left : null;
          if (!t) return false;
          const s = U.strip(t);
          if (s && s.type === 'Identifier' && s.symbol && s.symbol.kind === 'field') return true;
          return !!(s && s.type === 'MemberExpr' && U.strip(s.object) && U.strip(s.object).type === 'ThisExpr');
        });
        if (w) api.report(a, M(`Predicate '${cb.rec.name}' passed to std::${n}() modifies its own member ('${U.src(unit, w).trim()}'); the algorithm may copy it.`, `std::${n}() 에 전달된 술어 '${cb.rec.name}' 가 자신의 멤버를 바꿉니다('${U.src(unit, w).trim()}'). 알고리즘이 이를 복사할 수 있습니다.`));
      }
    },
  }),
];

function usedBefore(sym, at) {
  // the container was handed to some code (resize / push_back / passed out) before `at`
  for (const u of sym.uses || []) {
    if (u.loc.start >= at.loc.start) continue;
    const p = U.parent(u);
    if (p && p.type === 'MemberExpr' && U.pkey(u) === 'object' && (GROW.has(p.member) || SHRINK.has(p.member))) return true;
    if (p && p.type === 'CallExpr' && p.callee !== u) return true;
    if (p && p.type === 'AssignExpr' && U.pkey(u) === 'left') return true;
    if (p && p.type === 'UnaryExpr' && p.op === '&') return true;
  }
  return false;
}

module.exports.invalidationCheck = invalidationCheck;
module.exports.knownSize = knownSize;
