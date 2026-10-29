'use strict';

// AUTOSAR C++14 chapter 18 — language support library (C library headers
// and functions, arrays, dynamic memory, std::bind / std::forward) and MISRA
// C++:2008 M18 rules.

const path = require('path');
const { A, M } = require('../lib/meta');
const { D } = require('../lib/delegate');
const U = require('../lib/util');
const { cf } = U;

const S = (...a) => new Set(a);
const C_HEADERS = S('assert.h', 'ctype.h', 'errno.h', 'fenv.h', 'float.h', 'inttypes.h', 'iso646.h', 'limits.h', 'locale.h', 'math.h', 'setjmp.h', 'signal.h',
  'stdalign.h', 'stdarg.h', 'stdbool.h', 'stddef.h', 'stdint.h', 'stdio.h', 'stdlib.h', 'string.h', 'tgmath.h', 'time.h', 'uchar.h', 'wchar.h', 'wctype.h', 'complex.h');
const CALLOC = S('malloc', 'calloc', 'realloc', 'free', 'aligned_alloc');
const TIME_FNS = S('time', 'clock', 'difftime', 'mktime', 'asctime', 'ctime', 'gmtime', 'localtime', 'strftime', 'timespec_get');

function newKindOf(e) {
  e = U.strip(e);
  if (!e || e.type !== 'NewExpr') return null;
  return e.isArray ? 'array' : 'single';
}

module.exports = [
  A({
    id: 'A18-0-1', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 2,
    name: ['The C library facilities shall only be accessed through C++ library headers', 'C 라이브러리 기능은 C++ 라이브러리 헤더로만 써야 합니다'],
    why: ['The <cxxx> headers put the C library into namespace std and add C++ overloads; <xxx.h> pollutes the global namespace.', '<cxxx> 헤더는 C 라이브러리를 std 네임스페이스에 넣고 C++ 오버로드를 더하지만, <xxx.h> 는 전역 네임스페이스를 어지럽힙니다.'],
    fix: ['Include <cstdio> instead of <stdio.h> (and so on).', '<stdio.h> 대신 <cstdio> 처럼 C++ 헤더를 포함하세요.'],
    check(unit, api) {
      api = U.cppOnlyFix(api); // a header shared with C must stay C
      for (const inc of unit.includes || []) {
        if (U.isBuiltin(inc.file)) continue;
        const base = path.posix.basename(String(inc.name || ''));
        if (C_HEADERS.has(base) && (inc.angled || inc.kind !== 'project')) api.report(inc, M(`The C header <${base}> is included; use <c${base.replace(/\.h$/, '')}>.`, `C 헤더 <${base}> 를 포함합니다. <c${base.replace(/\.h$/, '')}> 를 쓰세요.`));
      }
    },
  }),
  D('A18-0-2', ['21.2.1'], { name: ['The error state of a conversion from string to a numeric value shall be checked', '문자열을 수치로 변환할 때는 오류 상태를 확인해야 합니다'] }),
  D('A18-0-3', ['25.5.1'], { name: ['The library <clocale> (locale.h) and the setlocale function shall not be used', '<clocale>(locale.h) 라이브러리와 setlocale 함수는 쓰면 안 됩니다'] }),
  D('A18-1-1', ['11.3.1'], { cat: 'Required', name: ['C-style arrays shall not be used', 'C 스타일 배열은 쓰면 안 됩니다'] }),
  D('A18-1-2', ['26.3.1'], { cat: 'Required', name: ['The std::vector<bool> specialization shall not be used', 'std::vector<bool> 특수화는 쓰면 안 됩니다'] }),
  A({
    id: 'A18-1-3', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'MAJOR', debt: 10,
    name: ['The std::auto_ptr type shall not be used', 'std::auto_ptr 형식은 쓰면 안 됩니다'],
    why: ['auto_ptr transfers ownership on copy, which breaks containers and algorithms; it was removed in C++17.', 'auto_ptr 는 복사할 때 소유권을 옮겨 컨테이너와 알고리즘을 깨뜨리며 C++17 에서 제거되었습니다.'],
    fix: ['Use std::unique_ptr.', 'std::unique_ptr 를 쓰세요.'],
    check(unit, api) {
      for (const t of U.ix(unit).get('NamedType')) if (/(^|::)auto_ptr$/.test(t.qname || t.name || '')) api.report(t, M('std::auto_ptr is used.', 'std::auto_ptr 를 씁니다.'));
    },
  }),
  A({
    id: 'A18-5-1', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'MAJOR', debt: 10, cwe: 'CWE-762',
    name: ['Functions malloc, calloc, realloc and free shall not be used', 'malloc, calloc, realloc, free 함수는 쓰면 안 됩니다'],
    why: ['C allocation does not run constructors or destructors and is easily mismatched with delete.', 'C 할당은 생성자와 소멸자를 실행하지 않고 delete 와 섞어 쓰기 쉽습니다.'],
    fix: ['Use containers, std::make_unique / std::make_shared, or new/delete wrapped in RAII.', '컨테이너, std::make_unique / std::make_shared, 또는 RAII 로 감싼 new/delete 를 쓰세요.'],
    check(unit, api) {
      for (const { c, n } of U.libCalls(unit, CALLOC)) api.report(c, M(`'${n}' is used for dynamic memory.`, `동적 메모리에 '${n}' 를 씁니다.`));
    },
  }),
  D('A18-5-2', ['21.6.2'], { name: ['Non-placement new or delete expressions shall not be used', '배치(placement)가 아닌 new 나 delete 식은 쓰면 안 됩니다'] }),
  A({
    id: 'A18-5-3', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'CRITICAL', debt: 5, cwe: 'CWE-762', cert: 'EXP51-CPP',
    name: ['The form of the delete expression shall match the form of the new expression used to allocate the memory', 'delete 식의 형태는 메모리를 할당한 new 식의 형태와 맞아야 합니다'],
    why: ['delete on memory from new[] (or delete[] on memory from new) is undefined behaviour.', 'new[] 로 할당한 메모리에 delete 를(또는 new 로 할당한 메모리에 delete[] 를) 쓰는 것은 정의되지 않은 동작입니다.'],
    fix: ['Use delete[] for new[] and delete for new — or better, std::vector / std::unique_ptr<T[]>.', 'new[] 에는 delete[] 를, new 에는 delete 를 쓰세요. 더 좋게는 std::vector / std::unique_ptr<T[]> 를 쓰세요.'],
    check(unit, api) {
      for (const fn of U.ix(unit).funcs) {
        const kinds = new Map();
        cf.walk(fn.body, (n) => {
          if (n.type === 'LambdaExpr') return cf.walk.SKIP;
          if (n.type === 'VarDecl' && n.symbol && n.init) { const k = newKindOf(n.init); if (k) kinds.set(n.symbol, k); }
          if (n.type === 'AssignExpr' && n.op === '=') { const l = U.strip(n.left); const k = newKindOf(n.right); if (l && l.type === 'Identifier' && l.symbol && k) kinds.set(l.symbol, k); }
          if (n.type === 'DeleteExpr') {
            const a = U.strip(n.arg);
            const k = a && a.type === 'Identifier' ? kinds.get(a.symbol) : null;
            if (k && (k === 'array') !== !!n.array) api.report(n, M(`'${a.name}' was allocated with ${k === 'array' ? 'new[]' : 'new'} but is released with ${n.array ? 'delete[]' : 'delete'}.`, `'${a.name}' 은(는) ${k === 'array' ? 'new[]' : 'new'} 로 할당했는데 ${n.array ? 'delete[]' : 'delete'} 로 해제합니다.`));
          }
          return undefined;
        });
      }
    },
  }),
  D('A18-5-4', ['21.6.4']),
  A({
    id: 'A18-5-11', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'MAJOR', debt: 5,
    name: ['"operator new" and "operator delete" shall be defined together', '"operator new" 와 "operator delete" 는 함께 정의해야 합니다'],
    why: ['A custom operator new paired with the default operator delete (or the reverse) frees memory with the wrong allocator.', '사용자 정의 operator new 를 기본 operator delete 와(또는 그 반대로) 짝지으면 잘못된 할당기로 메모리를 해제합니다.'],
    fix: ['Provide the matching operator delete (or operator new) in the same scope.', '같은 범위에 짝이 되는 operator delete(또는 operator new)를 제공하세요.'],
    check(unit, api) {
      const scopes = new Map();
      for (const f of U.ix(unit).get('FunctionDecl')) {
        const m = /^operator (new|delete)(\[\])?$/.exec(f.name || '');
        if (!m) continue;
        const owner = cf.enclosing(f, 'RecordDecl');
        const key = owner || 'global';
        let e = scopes.get(key);
        if (!e) scopes.set(key, (e = { new: [], delete: [] }));
        e[m[1]].push(f);
      }
      for (const e of scopes.values()) {
        for (const [have, miss] of [['new', 'delete'], ['delete', 'new']]) {
          if (e[have].length && !e[miss].length) api.report(U.at(e[have][0]), M(`'${e[have][0].name}' is defined without a matching 'operator ${miss}'.`, `'${e[have][0].name}' 를 짝이 되는 'operator ${miss}' 없이 정의했습니다.`));
        }
      }
    },
  }),
  A({
    id: 'A18-9-1', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 5,
    name: ['The std::bind shall not be used', 'std::bind 는 쓰면 안 됩니다'],
    why: ['Lambdas are easier to read, type-check better and are usually faster than std::bind objects.', '람다가 std::bind 객체보다 읽기 쉽고 형식 검사가 낫고 대개 더 빠릅니다.'],
    fix: ['Use a lambda expression instead.', '대신 람다 식을 쓰세요.'],
    check(unit, api) {
      for (const { c, qualified } of U.stdCalls(unit, S('bind'))) if (qualified) api.report(c, M('std::bind is used.', 'std::bind 를 씁니다.'));
    },
  }),
  D('A18-9-2', ['28.6.2'], { name: ['Forwarding values to other functions shall be done via std::move for rvalue references and std::forward for forwarding references', '값 전달은 우측값 참조에는 std::move, 전달 참조에는 std::forward 로 해야 합니다'] }),
  D('A18-9-3', ['28.6.1'], { name: ['The std::move shall not be used on objects declared const or const&', 'const 나 const& 로 선언한 객체에 std::move 를 쓰면 안 됩니다'] }),
  A({
    id: 'A18-9-4', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'MAJOR', debt: 5,
    name: ['An argument to std::forward shall not be subsequently used', 'std::forward 에 넘긴 인자는 그 뒤에 다시 쓰면 안 됩니다'],
    why: ['After std::forward the object may have been moved from, so later uses read an unspecified state.', 'std::forward 뒤에는 객체가 이동되었을 수 있으므로 이후 사용은 정해지지 않은 상태를 읽습니다.'],
    fix: ['Forward the argument only once, as its last use.', '인자는 마지막 사용으로 한 번만 전달하세요.'],
    check(unit, api) {
      for (const { c } of U.stdCalls(unit, S('forward'))) {
        const a = c.args && c.args[0] ? U.strip(c.args[0]) : null;
        if (!a || a.type !== 'Identifier' || !a.symbol) continue;
        const fn = U.fnOf(c);
        const later = (a.symbol.uses || []).filter((u) => u !== a && u.type === 'Identifier' && U.fnOf(u) === fn && u.loc.file === c.loc.file && u.loc.start >= c.loc.end);
        if (later.length) api.report(later[0], M(`'${a.name}' is used after being passed to std::forward.`, `'${a.name}' 을(를) std::forward 에 넘긴 뒤 다시 씁니다.`));
      }
    },
  }),
  // ------------------------------------------------------- MISRA C++:2008 M18
  D('M18-0-3', ['18.5.2', '21.2.3'], { cat: 'Required', name: ['The library functions abort, exit, getenv and system from <cstdlib> shall not be used', '<cstdlib> 의 abort, exit, getenv, system 은 쓰면 안 됩니다'] }),
  A({
    id: 'M18-0-4', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['The time handling functions of library <ctime> shall not be used', '<ctime> 의 시간 처리 함수는 쓰면 안 됩니다'],
    why: ['The <ctime> functions have unspecified or implementation-defined behaviour and some are not thread-safe.', '<ctime> 함수는 동작이 정해지지 않았거나 구현 정의이며 일부는 스레드 안전하지 않습니다.'],
    fix: ['Use std::chrono.', 'std::chrono 를 쓰세요.'],
    check(unit, api) {
      for (const { c, n } of U.libCalls(unit, TIME_FNS)) api.report(c, M(`The <ctime> function '${n}' is used.`, `<ctime> 함수 '${n}' 를 씁니다.`));
    },
  }),
  D('M18-0-5', ['21.2.2'], { name: ['The unbounded functions of library <cstring> shall not be used', '<cstring> 의 경계 없는 함수는 쓰면 안 됩니다'] }),
  D('M18-2-1', ['21.2.4']),
  D('M18-7-1', ['21.10.3'], { name: ['The signal handling facilities of <csignal> shall not be used', '<csignal> 의 시그널 처리 기능은 쓰면 안 됩니다'] }),
];
