'use strict';

// SEI CERT C++ — MEM: memory management.

const { rule } = require('../lib/meta');
const U = require('../lib/util');
const X = require('../lib/cpp');
const { M, T, cf } = U;

const C_ALLOC = new Set(['malloc', 'calloc', 'realloc', 'strdup', 'strndup', 'aligned_alloc']);
const C_FREE = new Set(['free']);

// Allocation kind of an expression: 'new' | 'new[]' | 'malloc' | 'stack' | 'static' | 'literal' | null
function allocKind(e, fn) {
  e = U.strip(e);
  if (!e) return null;
  if (e.type === 'NewExpr') {
    if (e.placement && e.placement.length && !isNothrow(e)) return null;
    return e.isArray ? 'new[]' : 'new';
  }
  if (e.type === 'CallExpr' && U.isLib(e, C_ALLOC)) return 'malloc';
  if (e.type === 'StringLiteral') return 'literal';
  if (e.type === 'UnaryExpr' && e.op === '&') {
    const s = U.idSym(e.arg);
    if (s && s.kind === 'variable') return s.storage === 'automatic' ? 'stack' : s.storage === 'static' ? 'static' : null;
    return null;
  }
  const t = e.ctype && T.canonical(e.ctype);
  const s = U.idSym(e);
  if (s && t && t.kind === 'array' && s.kind === 'variable') return s.storage === 'automatic' ? 'stack' : s.storage === 'static' ? 'static' : null;
  return null;
}

function isNothrow(n) {
  return (n.placement || []).some((p) => { const e = U.strip(p); return e && e.type === 'Identifier' && e.name === 'nothrow'; });
}

// The single kind of allocation a pointer variable ever receives in its function (or null when mixed / unknown).
function soleAlloc(sym, fn) {
  const vals = X.assignedValues(sym);
  if (!vals.length) return null;
  let kind = null, node = null;
  for (const v of vals) {
    const k = allocKind(v.value, fn);
    if (!k) { if (U.isNullConst(v.value)) continue; return null; }
    if (kind && kind !== k) return null;
    kind = k;
    node = node || v.value;
  }
  return kind ? { kind, node } : null;
}

const DEALLOC_OK = { new: 'delete', 'new[]': 'delete[]', malloc: 'free()' };
const ALLOC_TEXT = { new: 'new', 'new[]': 'new[]', malloc: 'malloc()', stack: 'automatic storage', static: 'static storage', literal: 'a string literal' };
const ALLOC_KO = { new: 'new', 'new[]': 'new[]', malloc: 'malloc()', stack: '자동 저장 공간', static: '정적 저장 공간', literal: '문자열 리터럴' };

function smartInit(decl) {
  // std::unique_ptr<T> p(x) / p{x} / = std::unique_ptr<T>(x)
  const args = X.initArgs(decl.init);
  if (args.length === 1) {
    const a = U.strip(args[0]);
    if (a && a.type === 'CastExpr' && a.kind === 'functional' && X.SMART.has(X.exprStd(a))) return a.arg ? U.strip(a.arg) : null;
    return a;
  }
  return null;
}

// T in unique_ptr<T> / shared_ptr<T> is an array type?
function smartArrayArg(targs) {
  const ta = targs && targs[0];
  if (!ta || !ta.ctype) return null;
  const t = T.canonical(ta.ctype);
  return t ? t.kind === 'array' : null;
}

// Uses of a pointer after it was obtained, in source order, until it is tested.
function firstUncheckedDeref(sym, after, fn) {
  const uses = (sym.uses || []).filter((u) => u.loc.start > after.loc.end && U.enclosingFn(u) === fn).sort((a, b) => a.loc.start - b.loc.start);
  for (const u of uses) {
    const p = U.parent(u);
    if (!p) continue;
    if (U.inCondition(u) || cf.enclosing(u, 'ConditionalExpr')) return null;
    if (p.type === 'AssignExpr' && U.pkey(u) === 'left') return null;
    if (p.type === 'ReturnStmt') return null;
    if (p.type === 'UnaryExpr' && p.op === '*') return u;
    if (p.type === 'MemberExpr' && p.arrow && U.pkey(u) === 'object') return u;
    if (p.type === 'IndexExpr' && U.pkey(u) === 'object') return u;
    if (p.type === 'CallExpr' && p.callee !== u) {
      if (U.isLib(p, new Set(['memset', 'memcpy', 'memmove', 'strcpy', 'strncpy', 'strcat', 'sprintf', 'snprintf', 'fgets', 'fread', 'read', 'strlen']))) return u;
      if (U.isLib(p, new Set(['free', 'realloc']))) return null;
      return null; // handed to code that may check it
    }
  }
  return null;
}

function globalScope(f) {
  const p = U.parent(U.parent(f));
  if (!p) return false;
  if (p.type === 'TranslationUnit') return true;
  return false;
}

module.exports = [
  rule('MEM50-CPP', {
    risk: 'HLM', cwe: ['CWE-416', 'CWE-415'], sec: true, approx: true, deep: 'absint:USE_AFTER_FREE',
    name: ['Do not access freed memory', '해제된 메모리에 접근하지 마세요'],
    why: ['Using a pointer after delete or free (dereferencing it, passing it on, deleting it again) is undefined behavior and a classic exploitable bug.', 'delete 나 free 뒤에 포인터를 사용하면(역참조, 전달, 다시 삭제) 정의되지 않은 동작이며 대표적인 악용 가능한 버그입니다.'],
    fix: ['Do not touch the pointer after releasing it; set it to nullptr, or use std::unique_ptr.', '해제한 뒤에는 포인터를 사용하지 말고 nullptr 로 설정하거나 std::unique_ptr 를 사용하세요.'],
  }, {
    check(unit, api) {
      const events = [];
      for (const d of U.nodes(unit, 'DeleteExpr')) events.push({ node: d, ptr: d.arg, what: d.array ? 'delete[]' : 'delete' });
      for (const c of U.libCalls(unit, C_FREE)) events.push({ node: c, ptr: c.args[0], what: 'free()' });
      for (const ev of events) {
        const k = U.key(unit, ev.ptr);
        if (!k) continue;
        const prefix = (n) => {
          const nk = U.key(unit, n);
          return nk === k;
        };
        const use = X.scanAfter(ev.node, (n) => {
          if (n.type === 'SizeofExpr' || n.type === 'DecltypeType') return 'skip';
          if ((n.type === 'Identifier' || n.type === 'MemberExpr') && prefix(n)) {
            const p = U.parent(n);
            if (p && p.type === 'AssignExpr' && p.op === '=' && U.pkey(n) === 'left') return 'kill';
            if (p && p.type === 'UnaryExpr' && p.op === '&') {
              const pp = U.parent(p);
              if (pp && pp.type === 'CallExpr') return 'kill';
            }
            return 'use';
          }
          // reassigning the object that holds the pointer (p->next ... ) also ends tracking
          if (n.type === 'AssignExpr' && n.op === '=' && k.startsWith(String(U.key(unit, n.left)) + '.') ) return 'kill';
          return undefined;
        });
        if (!use) continue;
        const p = U.parent(use);
        const twice = p && (p.type === 'DeleteExpr' || (p.type === 'CallExpr' && U.isLib(p, C_FREE)));
        const name = U.src(unit, ev.ptr).trim();
        if (twice) api.report(use, M(`'${name}' is released again after ${ev.what} at line ${ev.node.loc.line} (double free).`, `'${name}' 가 ${ev.node.loc.line} 행의 ${ev.what} 뒤에 다시 해제됩니다(이중 해제).`));
        else api.report(use, M(`'${name}' is used after ${ev.what} at line ${ev.node.loc.line}.`, `'${name}' 가 ${ev.node.loc.line} 행의 ${ev.what} 뒤에 사용됩니다.`));
      }
    },
  }),

  rule('MEM51-CPP', {
    risk: 'HLM', cwe: ['CWE-762', 'CWE-590'], sec: true, approx: true,
    name: ['Properly deallocate dynamically allocated resources', '동적으로 할당한 자원을 올바르게 해제하세요'],
    why: ['Memory must be released with the function matching its allocation (new/delete, new[]/delete[], malloc/free); releasing a non-heap object or using unique_ptr<T> for an array is undefined behavior.', '메모리는 할당과 짝이 맞는 함수로 해제해야 합니다(new/delete, new[]/delete[], malloc/free). 힙이 아닌 객체를 해제하거나 배열에 unique_ptr<T> 를 쓰면 정의되지 않은 동작입니다.'],
    fix: ['Match the deallocation to the allocation, never delete objects that were not allocated with new, and use unique_ptr<T[]> or std::vector for arrays.', '해제를 할당과 맞추고, new 로 할당하지 않은 객체는 delete 하지 말며, 배열에는 unique_ptr<T[]> 나 std::vector 를 사용하세요.'],
  }, {
    check(unit, api) {
      const check = (node, ptrExpr, dealloc) => {
        const fn = U.enclosingFn(node);
        const e = U.strip(ptrExpr);
        let info = null;
        const direct = allocKind(e, fn);
        if (direct === 'stack' || direct === 'static' || direct === 'literal') info = { kind: direct, node: e };
        else {
          const s = U.idSym(e);
          if (s && (s.kind === 'variable' || s.kind === 'parameter') && fn && X.isLocalOf(s, fn)) info = soleAlloc(s, fn);
        }
        if (!info) return;
        const ok = DEALLOC_OK[info.kind];
        if (ok === dealloc) return;
        const name = U.src(unit, ptrExpr).trim();
        if (!ok) api.report(node, M(`${dealloc} releases '${name}', which refers to ${ALLOC_TEXT[info.kind]}, not to dynamically allocated memory.`, `${dealloc} 가 동적 할당 메모리가 아니라 ${ALLOC_KO[info.kind]} 를 가리키는 '${name}' 를 해제합니다.`));
        else api.report(node, M(`'${name}' was allocated with ${ALLOC_TEXT[info.kind]} (line ${info.node.loc.line}) but is released with ${dealloc}; use ${ok}.`, `'${name}' 는 ${ALLOC_KO[info.kind]} 로 할당되었는데(${info.node.loc.line} 행) ${dealloc} 로 해제됩니다. ${ok} 를 사용하세요.`));
      };
      for (const d of U.nodes(unit, 'DeleteExpr')) check(d, d.arg, d.array ? 'delete[]' : 'delete');
      for (const c of U.libCalls(unit, C_FREE)) if (c.args[0]) check(c, c.args[0], 'free()');
      // smart pointers with the wrong array-ness
      const smart = (where, name, b, targs, value) => {
        const v = U.strip(value);
        if (!v || v.type !== 'NewExpr') return;
        const arr = smartArrayArg(targs);
        if (arr == null) return;
        if (v.isArray && !arr) api.report(where, M(`std::${b} '${name}' owns an array allocated with new[] but will release it with delete; use std::${b}<T[]>.`, `std::${b} '${name}' 가 new[] 로 할당한 배열을 소유하지만 delete 로 해제합니다. std::${b}<T[]> 를 사용하세요.`));
        else if (!v.isArray && arr) api.report(where, M(`std::${b}<T[]> '${name}' owns a single object allocated with new but will release it with delete[].`, `std::${b}<T[]> '${name}' 가 new 로 할당한 단일 객체를 소유하지만 delete[] 로 해제합니다.`));
      };
      for (const v of U.nodes(unit, 'VarDecl')) {
        const b = X.stdBare(U.declTypeName(v));
        if (!X.SMART.has(b) || !v.init) continue;
        smart(v, v.name, b, X.declTemplateArgs(v), smartInit(v));
      }
      for (const c of U.nodes(unit, 'CallExpr')) {
        const o = X.memberObj(c, ['reset']);
        const s = o && U.idSym(o);
        if (!s || !X.SMART.has(X.symStd(s)) || c.args.length !== 1) continue;
        smart(c, s.name, X.symStd(s), X.symTemplateArgs(s), c.args[0]);
      }
    },
  }),

  rule('MEM52-CPP', {
    risk: 'HLM', cwe: ['CWE-252', 'CWE-476', 'CWE-690'], sec: true, approx: true,
    name: ['Detect and handle memory allocation errors', '메모리 할당 오류를 감지하고 처리하세요'],
    why: ['new (std::nothrow) and malloc() return a null pointer on failure; dereferencing the result without checking crashes or corrupts memory.', 'new (std::nothrow) 와 malloc() 은 실패하면 널 포인터를 반환하여 확인하지 않고 역참조하면 충돌하거나 메모리가 손상됩니다.'],
    fix: ['Check the result against nullptr before using it, or use plain new, which throws std::bad_alloc.', '사용 전에 결과를 nullptr 와 비교하거나 std::bad_alloc 을 던지는 일반 new 를 사용하세요.'],
  }, {
    check(unit, api) {
      const allocs = [];
      for (const n of U.nodes(unit, 'NewExpr')) if (isNothrow(n)) allocs.push({ node: n, what: 'new (std::nothrow)' });
      for (const c of U.libCalls(unit, new Set(['malloc', 'calloc', 'realloc', 'aligned_alloc']))) allocs.push({ node: c, what: `${U.callName(c)}()` });
      for (const a of allocs) {
        let n = a.node, p = U.parent(n);
        while (p && (p.type === 'ParenExpr' || p.type === 'CastExpr')) { n = p; p = U.parent(n); }
        let sym = null, at = null;
        if (p && p.type === 'VarDecl' && p.init === n) { sym = p.symbol; at = p; }
        else if (p && p.type === 'AssignExpr' && p.op === '=' && U.pkey(n) === 'right') { sym = U.idSym(p.left); at = p; }
        else if (p && p.type === 'ParenListInit') { const vd = U.parent(p); if (vd && vd.type === 'VarDecl') { sym = vd.symbol; at = vd; } }
        if (!sym) continue;
        const fn = U.enclosingFn(a.node);
        if (!fn) continue;
        const u = firstUncheckedDeref(sym, at, fn);
        if (u) api.report(u, M(`'${sym.name}' from ${a.what} (line ${a.node.loc.line}) is used without checking it for null.`, `${a.what} (${a.node.loc.line} 행) 결과 '${sym.name}' 를 널 확인 없이 사용합니다.`));
      }
    },
  }),

  rule('MEM53-CPP', {
    risk: 'HLM', cwe: ['CWE-908', 'CWE-665'], approx: true,
    name: ['Explicitly construct and destruct objects when manually managing object lifetime', '객체 수명을 직접 관리할 때는 명시적으로 생성하고 소멸시키세요'],
    why: ['malloc() only provides raw storage: an object with a non-trivial constructor must be created there with placement new, and destroyed with an explicit destructor call before free().', 'malloc() 은 원시 저장 공간만 줍니다. 비자명한 생성자가 있는 객체는 placement new 로 생성하고, free() 전에 소멸자를 명시적으로 호출해야 합니다.'],
    fix: ['Use new/delete, or construct with placement new and call p->~T() before free().', 'new/delete 를 쓰거나, placement new 로 생성하고 free() 전에 p->~T() 를 호출하세요.'],
  }, {
    check(unit, api) {
      for (const c of U.libCalls(unit, new Set(['malloc', 'calloc', 'realloc', 'aligned_alloc']))) {
        let n = c, p = U.parent(n);
        while (p && (p.type === 'ParenExpr' || p.type === 'CastExpr')) { n = p; p = U.parent(n); }
        const rt = X.pointeeRec(n.ctype);
        if (!rt || !X.isNonTrivial(rt)) continue;
        let sym = null;
        if (p && p.type === 'VarDecl' && p.init === n) sym = p.symbol;
        else if (p && p.type === 'AssignExpr' && U.pkey(n) === 'right') sym = U.idSym(p.left);
        const fn = U.enclosingFn(c);
        if (sym && fn) {
          const placed = cf.findFirst(fn.body || fn, (x) => x.type === 'NewExpr' && (x.placement || []).some((pp) => U.idSym(pp) === sym));
          if (placed) continue;
          const use = (sym.uses || []).find((u) => u.loc.start > c.loc.end && (() => { const q = U.parent(u); return q && (q.type === 'MemberExpr' && q.arrow || q.type === 'UnaryExpr' && q.op === '*'); })());
          if (!use) continue;
          const why = X.nonTrivialReason(rt);
          api.report(use, M(`'${sym.name}' points to raw memory from ${U.callName(c)}() but is used as a '${rt.name}' (which has ${why ? why.en : 'a non-trivial constructor'}) without constructing it with placement new.`, `'${sym.name}' 는 ${U.callName(c)}() 의 원시 메모리를 가리키는데 placement new 로 생성하지 않고 '${rt.name}' (${why ? why.ko : '비자명한 생성자'} 있음) 로 사용됩니다.`));
        }
      }
      for (const c of U.libCalls(unit, C_FREE)) {
        const a = U.strip(c.args[0]);
        const rt = X.pointeeRec(a && a.ctype);
        if (!rt) continue;
        const rd = X.recDef(rt);
        if (!rd || !X.isNonTrivial(rt)) continue;
        const sh = X.shape(rd);
        const nontrivialDtor = (sh.hasDtor && !sh.hasDtor.isDefault) || sh.fields.some((f) => X.isNonTrivial(X.recType(f.ctype)) || /^std::/.test(U.declTypeName(f)) && X.stdBare(U.declTypeName(f)) !== 'array');
        if (!nontrivialDtor) continue;
        const k = U.key(unit, a);
        const fn = U.enclosingFn(c);
        const destroyed = fn && cf.findFirst(fn.body || fn, (x) => x.type === 'CallExpr' && x.loc.start < c.loc.start && U.skip(x.callee) && U.skip(x.callee).type === 'MemberExpr' && /^~/.test(U.skip(x.callee).member || '') && U.key(unit, U.skip(x.callee).object) === k);
        if (destroyed) continue;
        api.report(c, M(`free() releases '${U.src(unit, a).trim()}', a '${rt.name}' with a non-trivial destructor, without calling the destructor first.`, `free() 가 소멸자를 먼저 호출하지 않고 비자명한 소멸자가 있는 '${rt.name}' 객체 '${U.src(unit, a).trim()}' 를 해제합니다.`));
      }
    },
  }),

  rule('MEM54-CPP', {
    risk: 'HLM', cwe: ['CWE-119', 'CWE-787', 'CWE-131'], sec: true, approx: true,
    name: ['Provide placement new with properly aligned pointers to sufficient storage capacity', 'placement new 에는 충분한 크기와 올바른 정렬의 저장 공간을 주세요'],
    why: ['Placement new does not check the buffer: constructing an object in a buffer that is too small overruns it, and a char buffer without alignas may be misaligned for the type.', 'placement new 는 버퍼를 검사하지 않습니다. 너무 작은 버퍼에 객체를 만들면 넘치고, alignas 없는 char 버퍼는 형식에 맞게 정렬되지 않을 수 있습니다.'],
    fix: ['Use alignas(T) unsigned char buf[sizeof(T)] (or std::aligned_storage_t) and check the size for arrays.', 'alignas(T) unsigned char buf[sizeof(T)] (또는 std::aligned_storage_t)를 사용하고 배열이면 크기를 확인하세요.'],
  }, {
    check(unit, api) {
      for (const n of U.nodes(unit, 'NewExpr')) {
        if (!n.placement || n.placement.length !== 1 || isNothrow(n)) continue;
        let b = U.strip(n.placement[0]);
        if (b && b.type === 'UnaryExpr' && b.op === '&') b = U.strip(b.arg);
        const s = U.idSym(b);
        if (!s || s.kind !== 'variable') continue;
        const bt = s.type && T.canonical(s.type);
        if (!bt) continue;
        const bufSize = T.sizeOf(bt, unit.target);
        if (bufSize == null) continue;
        let objT = n.typeName && n.typeName.ctype && T.canonical(n.typeName.ctype);
        if (!objT) continue;
        let need = T.sizeOf(objT, unit.target);
        if (n.isArray && objT.kind === 'array' && objT.size == null) need = null;
        const rt = X.recType(objT.kind === 'array' ? objT.of : objT);
        if (rt && X.isPolymorphic(rt) && need != null) need += unit.target.pointer || 8;
        const tn = U.src(unit, n.typeName).trim();
        if (need != null && need > bufSize) {
          api.report(n, M(`Placement new constructs '${tn}' (${need} bytes) in '${s.name}', which has only ${bufSize} bytes.`, `placement new 가 ${bufSize} 바이트뿐인 '${s.name}' 에 '${tn}' (${need} 바이트)를 생성합니다.`));
          continue;
        }
        // alignment of a char buffer
        let el = bt;
        while (el && el.kind === 'array') el = T.canonical(el.of);
        if (!el || !(el.kind === 'int' && T.intRank(el) <= 1)) continue;
        const decl = (s.decls || [])[0];
        const hasAlignas = decl && decl.specs && (decl.specs.alignas || []).length;
        if (hasAlignas) continue;
        const declText = decl ? U.src(unit, U.parent(decl) || decl) : '';
        if (/alignas|__attribute__\s*\(\(\s*aligned/.test(declText)) continue;
        const elT = objT.kind === 'array' ? objT.of : objT;
        const need2 = Math.max(T.alignOf(elT, unit.target) || 1, rt ? X.requestedAlign(unit, rt) : 0);
        if (need2 <= 1) continue;
        api.report(n, M(`Placement new constructs '${tn}' (alignment ${need2}) in character buffer '${s.name}', which is not declared with alignas and may be misaligned.`, `placement new 가 alignas 없이 선언되어 잘못 정렬될 수 있는 문자 버퍼 '${s.name}' 에 '${tn}' (정렬 ${need2})를 생성합니다.`));
      }
    },
  }),

  rule('MEM55-CPP', {
    risk: 'HLM', cwe: ['CWE-252', 'CWE-476', 'CWE-248'], approx: true,
    name: ['Honor replacement dynamic storage management requirements', '대체 동적 저장 공간 관리 함수의 요구 사항을 지키세요'],
    why: ['A replacement operator new must throw std::bad_alloc on failure (callers do not check for null), and a replacement operator delete must not throw.', '대체 operator new 는 실패 시 std::bad_alloc 을 던져야 하고(호출자는 널을 확인하지 않음), 대체 operator delete 는 예외를 던지면 안 됩니다.'],
    fix: ['Throw std::bad_alloc when the allocation fails; make operator delete noexcept and non-throwing.', '할당이 실패하면 std::bad_alloc 을 던지고, operator delete 는 noexcept 로 예외를 던지지 않게 하세요.'],
  }, {
    check(unit, api) {
      for (const f of U.nodes(unit, 'FunctionDecl')) {
        if (!f.body || !globalScope(f)) continue;
        const name = String(f.name || '').replace(/\s+/g, ' ');
        const params = f.params || [];
        const nothrowForm = params.some((p) => /nothrow_t/.test(U.typeName(p.ctype) || '') || /nothrow_t/.test(U.declTypeName(p) || ''));
        if (/^operator new( ?\[\])?$/.test(name) && !nothrowForm) {
          for (const r of cf.findAll(f.body, 'ReturnStmt')) {
            if (U.enclosingFn(r) !== f || !r.arg) continue;
            const a = U.strip(r.arg);
            const nullish = (x) => { x = U.strip(x); return !!x && (U.isNullConst(x) || (x.loc && x.loc.macro === 'NULL')); };
            if (nullish(a) || (a.type === 'ConditionalExpr' && (nullish(a.consequent) || nullish(a.alternate)))) { api.report(r, M(`Replacement '${name}' returns a null pointer instead of throwing std::bad_alloc.`, `대체 '${name}' 가 std::bad_alloc 을 던지지 않고 널 포인터를 반환합니다.`)); continue; }
            if (a.type === 'CallExpr' && U.isLib(a, C_ALLOC)) { api.report(r, M(`Replacement '${name}' returns the result of ${U.callName(a)}() without throwing std::bad_alloc when it is null.`, `대체 '${name}' 가 ${U.callName(a)}() 결과가 널일 때 std::bad_alloc 을 던지지 않고 그대로 반환합니다.`)); continue; }
            const s = U.idSym(a);
            if (s && X.assignedValues(s).some((v) => { const e = U.strip(v.value); return e && e.type === 'CallExpr' && U.isLib(e, C_ALLOC); }) && !X.testedIn(f.body, s)) {
              api.report(r, M(`Replacement '${name}' returns '${s.name}' from malloc() without checking it and throwing std::bad_alloc.`, `대체 '${name}' 가 malloc() 결과 '${s.name}' 를 확인하여 std::bad_alloc 을 던지지 않고 반환합니다.`));
            }
          }
        }
        if (/^operator delete( ?\[\])?$/.test(name)) {
          const t = cf.findAll(f.body, 'ThrowExpr').find((x) => U.enclosingFn(x) === f && !cf.enclosing(x, 'TryStmt'));
          if (t) api.report(t, M(`Replacement '${name}' throws an exception.`, `대체 '${name}' 가 예외를 던집니다.`));
        }
      }
    },
  }),

  rule('MEM56-CPP', {
    risk: 'HLM', cwe: ['CWE-415', 'CWE-416'], sec: true, approx: true,
    name: ['Do not store an already-owned pointer value in an unrelated smart pointer', '이미 소유된 포인터 값을 관련 없는 스마트 포인터에 저장하지 마세요'],
    why: ['Two smart pointers created independently from the same raw pointer (or from another smart pointer\'s get(), or from this) each delete the object: double free.', '같은 원시 포인터(또는 다른 스마트 포인터의 get(), this)로 따로 만든 두 스마트 포인터는 각자 객체를 삭제하여 이중 해제가 됩니다.'],
    fix: ['Create the object once with std::make_shared / std::make_unique and copy the smart pointer; use enable_shared_from_this and shared_from_this() for this.', 'std::make_shared / std::make_unique 로 한 번 만들고 스마트 포인터를 복사하세요. this 에는 enable_shared_from_this 와 shared_from_this() 를 사용하세요.'],
  }, {
    check(unit, api) {
      const owners = new Map(); // raw sym -> first node
      const seen = (where, raw, b) => {
        const e = U.strip(raw);
        if (!e) return;
        if (e.type === 'ThisExpr') {
          if (b !== 'shared_ptr' && b !== 'unique_ptr') return;
          api.report(where, M(`std::${b} is created from 'this'; the object is already owned elsewhere (use enable_shared_from_this / shared_from_this()).`, `'this' 로 std::${b} 를 만듭니다. 객체는 이미 다른 곳에서 소유됩니다(enable_shared_from_this / shared_from_this() 사용).`));
          return;
        }
        const g = X.memberObj(e, ['get']);
        const gs = g && U.idSym(g);
        if (gs && X.SMART.has(X.symStd(gs))) {
          api.report(where, M(`std::${b} is created from '${U.src(unit, e).trim()}', a pointer already owned by smart pointer '${gs.name}'.`, `스마트 포인터 '${gs.name}' 가 이미 소유한 포인터 '${U.src(unit, e).trim()}' 로 std::${b} 를 만듭니다.`));
          return;
        }
        const s = U.idSym(e);
        if (!s || !(s.kind === 'variable' || s.kind === 'parameter')) return;
        const t = s.type && T.canonical(s.type);
        if (!t || t.kind !== 'pointer') return;
        const fn = U.enclosingFn(where);
        const key = `${fn ? fn.loc.start : 0}:${s.id}`;
        if (owners.has(key)) {
          const first = owners.get(key);
          // reassigned in between?
          const reassigned = X.assignedValues(s).some((v) => v.node.loc.start > first.loc.start && v.node.loc.start < where.loc.start);
          if (!reassigned) api.report(where, M(`Raw pointer '${s.name}' is stored in a second, unrelated smart pointer (the first one is at line ${first.loc.line}); both will delete it.`, `원시 포인터 '${s.name}' 가 관련 없는 두 번째 스마트 포인터에 저장됩니다(첫 번째는 ${first.loc.line} 행). 둘 다 이를 삭제합니다.`));
          owners.set(key, where);
          return;
        }
        owners.set(key, where);
      };
      const all = [];
      for (const v of U.nodes(unit, 'VarDecl')) {
        const b = X.stdBare(U.declTypeName(v));
        if (X.SMART.has(b) && v.init) all.push({ where: v, raw: smartInit(v), b });
      }
      for (const c of U.nodes(unit, 'CastExpr')) {
        if (c.kind !== 'functional' || !c.arg) continue;
        const b = X.exprStd(c);
        if (!X.SMART.has(b)) continue;
        const pv = U.parent(c);
        if (pv && (pv.type === 'VarDecl' || pv.type === 'ParenListInit')) continue; // handled with the VarDecl
        all.push({ where: c, raw: c.arg, b });
      }
      for (const c of U.nodes(unit, 'CallExpr')) {
        const o = X.memberObj(c, ['reset']);
        const s = o && U.idSym(o);
        if (s && X.SMART.has(X.symStd(s)) && c.args.length === 1) all.push({ where: c, raw: c.args[0], b: X.symStd(s) });
      }
      all.sort((a, b) => a.where.loc.start - b.where.loc.start);
      for (const x of all) if (x.raw) seen(x.where, x.raw, x.b);
    },
  }),

  rule('MEM57-CPP', {
    risk: 'MUM', cwe: ['CWE-758', 'CWE-1287'], approx: true,
    name: ['Avoid using default operator new for over-aligned types', '과정렬 형식에 기본 operator new 를 쓰지 마세요'],
    why: ['Before C++17 the default operator new only guarantees alignof(std::max_align_t); an object of a type declared alignas(32) or more may be misaligned (and toolchains without aligned new still behave that way).', 'C++17 이전의 기본 operator new 는 alignof(std::max_align_t) 정렬만 보장하므로 alignas(32) 이상으로 선언된 형식의 객체는 잘못 정렬될 수 있습니다(aligned new 가 없는 도구에서도 마찬가지).'],
    fix: ['Give the class its own aligned operator new/delete, compile as C++17 with aligned new support, or allocate with an aligned allocator.', '클래스에 정렬된 operator new/delete 를 직접 제공하거나, aligned new 를 지원하는 C++17 로 컴파일하거나, 정렬 할당자를 사용하세요.'],
  }, {
    check(unit, api) {
      const maxAlign = (unit.target && unit.target.maxAlign) || 16;
      for (const n of U.nodes(unit, 'NewExpr')) {
        if (n.placement && n.placement.length && !isNothrow(n)) continue;
        let t = n.typeName && n.typeName.ctype && T.canonical(n.typeName.ctype);
        while (t && t.kind === 'array') t = T.canonical(t.of);
        const rt = X.recType(t);
        if (!rt) continue;
        const al = X.requestedAlign(unit, rt);
        if (al <= maxAlign) continue;
        if (X.classHasMethod(rt, ['operator new', 'operator new[]'])) continue;
        const pre17 = /^c\+\+(98|03|11|14)$/.test(unit.std || '');
        api.report(n, M(`'${rt.name}' requires ${al}-byte alignment but is allocated with the default operator new, which only guarantees ${maxAlign} bytes${pre17 ? ' before C++17' : ' without aligned-new support'}.`, `'${rt.name}' 는 ${al} 바이트 정렬이 필요하지만 ${maxAlign} 바이트만 보장하는 기본 operator new 로 할당됩니다${pre17 ? '(C++17 이전)' : '(aligned new 미지원 시)'}.`));
      }
    },
  }),
];
