'use strict';

// MISRA C++:2023 chapter 21 — language support library.

const { R, M } = require('../lib/meta');
const U = require('../lib/util');
const { cf } = U;

const userFile = (f) => typeof f === 'string' && !f.startsWith('<');
const S = (...a) => new Set(a);

const ATO = S('atof', 'atoi', 'atol', 'atoll');
const STRFN = S('strcat', 'strchr', 'strcmp', 'strcoll', 'strcpy', 'strcspn', 'strerror', 'strlen', 'strncat', 'strncmp', 'strncpy', 'strpbrk', 'strrchr', 'strspn', 'strstr', 'strtok', 'strxfrm',
  'strtol', 'strtoll', 'strtoul', 'strtoull', 'strtod', 'strtof', 'strtold',
  'wcscat', 'wcschr', 'wcscmp', 'wcscoll', 'wcscpy', 'wcscspn', 'wcslen', 'wcsncat', 'wcsncmp', 'wcsncpy', 'wcspbrk', 'wcsrchr', 'wcsspn', 'wcsstr', 'wcstok', 'wcsxfrm',
  'wcstol', 'wcstoll', 'wcstoul', 'wcstoull', 'wcstod', 'wcstof', 'wcstold', 'strtoimax', 'strtoumax', 'wcstoimax', 'wcstoumax');
const CALLOC = S('malloc', 'calloc', 'realloc', 'aligned_alloc', 'free');
const MAKERS = S('make_unique', 'make_shared', 'allocate_shared', 'make_unique_for_overwrite', 'make_shared_for_overwrite');
const ADVANCED = S('launder', 'construct_at', 'destroy_at', 'destroy', 'destroy_n', 'uninitialized_copy', 'uninitialized_copy_n', 'uninitialized_fill', 'uninitialized_fill_n', 'uninitialized_move', 'uninitialized_move_n', 'uninitialized_default_construct', 'uninitialized_default_construct_n', 'uninitialized_value_construct', 'uninitialized_value_construct_n');
const VA = S('va_start', 'va_arg', 'va_end', 'va_copy');
const SETJMP = S('setjmp', 'longjmp', '_setjmp', '_longjmp');
const SIGNAL = S('signal', 'raise');

function callsTo(unit, names) {
  const out = [];
  for (const c of U.ix(unit).get('CallExpr')) {
    const n = U.isLibCall(c, names);
    if (n) out.push({ c, n });
  }
  return out;
}

const isOperatorNewDelete = (n) => /^operator (new|delete)(\[\])?$/.test(n || '');

module.exports = [
  R({
    id: '21.2.1', cat: 'Required', dec: true, type: 'BUG', autosar: 'A18-0-2', cert: 'ERR62-CPP', cwe: 'CWE-190', sev: 'MAJOR', debt: 5,
    name: ['The library functions atof, atoi, atol and atoll from <cstdlib> shall not be used', '<cstdlib> 의 atof, atoi, atol, atoll 은 쓰면 안 됩니다'],
    why: ['These functions have undefined behaviour when the value cannot be represented and report no errors.', '이 함수들은 값을 표현할 수 없으면 정의되지 않은 동작이 되고 오류도 알리지 않습니다.'],
    fix: ['Use std::from_chars or std::stoi-style functions with error handling.', '오류 처리가 되는 std::from_chars 나 std::stoi 계열 함수를 쓰세요.'],
    check(unit, api) {
      for (const { c, n } of callsTo(unit, ATO)) api.report(c, M(`'${n}' is used to convert a string.`, `문자열 변환에 '${n}' 를 씁니다.`));
    },
  }),
  R({
    id: '21.2.2', cat: 'Required', dec: true, type: 'VULNERABILITY', autosar: 'M18-0-5', cert: 'STR50-CPP', cwe: 'CWE-120', sev: 'MAJOR', debt: 10,
    name: ['The string handling functions from <cstring>, <cstdlib>, <cwchar> and <cinttypes> shall not be used', '<cstring>, <cstdlib>, <cwchar>, <cinttypes> 의 문자열 처리 함수는 쓰면 안 됩니다'],
    why: ['C string functions do not check bounds and easily read or write past the end of a buffer.', 'C 문자열 함수는 경계를 검사하지 않아 버퍼 끝을 넘어 읽거나 쓰기 쉽습니다.'],
    fix: ['Use std::string, std::string_view and the C++ conversion functions.', 'std::string, std::string_view, C++ 변환 함수를 쓰세요.'],
    check(unit, api) {
      for (const { c, n } of callsTo(unit, STRFN)) api.report(c, M(`C string function '${n}' is used.`, `C 문자열 함수 '${n}' 를 씁니다.`));
    },
  }),
  R({
    id: '21.2.3', cat: 'Required', dec: true, type: 'VULNERABILITY', autosar: 'M18-0-3', cert: 'ENV33-C', cwe: 'CWE-78', sev: 'CRITICAL', debt: 15,
    name: ['The library function system from <cstdlib> shall not be used', '<cstdlib> 의 system 함수는 쓰면 안 됩니다'],
    why: ['system runs a command processor whose behaviour is implementation-defined and open to command injection.', 'system 은 구현 정의인 명령 처리기를 실행하며 명령 주입에 노출됩니다.'],
    fix: ['Use a dedicated process API with explicit arguments.', '인자를 명시하는 전용 프로세스 API 를 쓰세요.'],
    check(unit, api) {
      for (const { c } of callsTo(unit, S('system'))) api.report(c, M("'system' is called.", "'system' 을 호출합니다."));
    },
  }),
  R({
    id: '21.2.4', cat: 'Required', dec: true, type: 'BUG', autosar: 'M18-2-1', sev: 'MAJOR', debt: 5,
    name: ['The macro offsetof shall not be used', 'offsetof 매크로는 쓰면 안 됩니다'],
    why: ['offsetof is only conditionally supported for non-standard-layout types and ignores C++ object semantics.', 'offsetof 는 표준 배치가 아닌 타입에는 조건부로만 지원되고 C++ 객체 의미를 무시합니다.'],
    fix: ['Use pointers to members.', '멤버 포인터를 쓰세요.'],
    check(unit, api) {
      for (const o of U.ix(unit).get('OffsetofExpr')) api.report(o, M(`offsetof is used for member '${o.member || '?'}'.`, `멤버 '${o.member || '?'}' 에 offsetof 를 씁니다.`));
    },
  }),
  R({
    id: '21.6.1', cat: 'Advisory', dec: false, autosar: 'A18-5-5', sev: 'MINOR', debt: 15,
    name: ['Dynamic memory should not be used', '동적 메모리는 쓰지 않아야 합니다'],
    why: ['Dynamic allocation can fail, fragment memory and take unbounded time.', '동적 할당은 실패할 수 있고 메모리를 단편화하며 시간이 한없이 걸릴 수 있습니다.'],
    fix: ['Use statically sized storage, or pre-allocated pools with bounded behaviour.', '정적 크기 저장소나 동작이 제한된 미리 할당한 풀을 쓰세요.'],
    check(unit, api) {
      const x = U.ix(unit);
      for (const n of x.get('NewExpr')) if (!n.placement) api.report(n, M('A new expression allocates dynamic memory.', 'new 식이 동적 메모리를 할당합니다.'));
      for (const { c, n } of callsTo(unit, new Set([...CALLOC, ...MAKERS]))) if (n !== 'free') api.report(c, M(`'${n}' allocates dynamic memory.`, `'${n}' 가 동적 메모리를 할당합니다.`));
    },
  }),
  R({
    id: '21.6.2', cat: 'Required', dec: true, type: 'BUG', autosar: 'A18-5-2', cert: 'MEM51-CPP', cwe: 'CWE-401', sev: 'MAJOR', debt: 15,
    name: ['Dynamic memory shall be managed automatically', '동적 메모리는 자동으로 관리해야 합니다'],
    why: ['Manual new/delete and malloc/free leak or double-free memory on error paths.', '수동 new/delete 와 malloc/free 는 오류 경로에서 메모리 누수나 이중 해제를 일으킵니다.'],
    fix: ['Use std::make_unique/std::make_shared or containers.', 'std::make_unique/std::make_shared 나 컨테이너를 쓰세요.'],
    check(unit, api) {
      const x = U.ix(unit);
      for (const n of x.get('NewExpr')) if (!n.placement) api.report(n, M('A non-placement new expression manages memory manually.', '위치 지정이 아닌 new 식으로 메모리를 수동 관리합니다.'));
      for (const d of x.get('DeleteExpr')) api.report(d, M(`A ${d.array ? 'delete[]' : 'delete'} expression manages memory manually.`, `${d.array ? 'delete[]' : 'delete'} 식으로 메모리를 수동 관리합니다.`));
      for (const { c, n } of callsTo(unit, CALLOC)) api.report(c, M(`'${n}' manages memory manually.`, `'${n}' 로 메모리를 수동 관리합니다.`));
    },
  }),
  R({
    id: '21.6.3', cat: 'Required', dec: true, type: 'BUG', autosar: 'A18-5-10', cert: 'MEM54-CPP', sev: 'MAJOR', debt: 15,
    name: ['Advanced memory management shall not be used', '고급 메모리 관리는 쓰면 안 됩니다'],
    why: ['Placement new, explicit destructor calls, custom allocation functions and the uninitialised-memory algorithms make object lifetime easy to get wrong.', '위치 지정 new, 명시적 소멸자 호출, 사용자 정의 할당 함수, 초기화되지 않은 메모리 알고리즘은 객체 수명을 틀리기 쉽게 합니다.'],
    fix: ['Use containers and smart pointers that manage lifetime for you.', '수명을 대신 관리하는 컨테이너와 스마트 포인터를 쓰세요.'],
    check(unit, api) {
      const x = U.ix(unit);
      for (const n of x.get('NewExpr')) if (n.placement) api.report(n, M('Placement new is used.', '위치 지정 new 를 씁니다.'));
      for (const c of x.get('CallExpr')) {
        const cal = U.strip(c.callee);
        if (cal && cal.type === 'MemberExpr' && cal.isDestructor) api.report(c, M(`The destructor '${cal.member}' is called explicitly.`, `소멸자 '${cal.member}' 를 명시적으로 호출합니다.`));
        const cn = U.callName(c);
        if (cn && !cn.member && cn.qualifier === 'std' && ADVANCED.has(cn.name)) api.report(c, M(`'std::${cn.name}' is used.`, `'std::${cn.name}' 를 씁니다.`));
      }
      const seen = new Set();
      for (const f of x.get('FunctionDecl')) {
        if (!isOperatorNewDelete(f.name) || seen.has(f.symbol || f)) continue;
        seen.add(f.symbol || f);
        api.report(f, M(`'${f.name}' is declared by the program.`, `프로그램이 '${f.name}' 를 선언합니다.`));
      }
    },
  }),
  R({
    id: '21.6.4', cat: 'Required', dec: true, type: 'BUG', autosar: 'A18-5-4', sev: 'MAJOR', debt: 10,
    name: ['If a project defines either a sized or unsized version of a global operator delete, then both shall be defined', '프로젝트가 전역 operator delete 의 크기 지정판이나 비지정판 중 하나를 정의하면 둘 다 정의해야 합니다'],
    why: ['Which version the implementation calls is unspecified; defining only one leaves the other mismatched with the allocator.', '구현이 어느 판을 호출할지 명시되지 않아, 하나만 정의하면 다른 판이 할당자와 어긋납니다.'],
    fix: ['Define both the sized and the unsized global operator delete (and their array forms).', '전역 operator delete 의 크기 지정판과 비지정판 (그리고 배열판) 을 모두 정의하세요.'],
    project(project, api) {
      const found = new Map(); // 'delete' | 'delete[]' -> { sized, unsized }
      for (const unit of project.units) {
        for (const f of U.ix(unit).funcs) {
          const m = /^operator (delete(\[\])?)$/.exec(f.name || '');
          if (!m || f.qualifier || cf.enclosing(f, ['RecordDecl', 'NamespaceDecl'])) continue;
          let e = found.get(m[1]);
          if (!e) found.set(m[1], (e = {}));
          const n = U.paramCount(f);
          if (n === 1) e.unsized = e.unsized || f; else if (n === 2) e.sized = e.sized || f;
        }
      }
      for (const [k, e] of found) {
        if (e.sized && !e.unsized) api.report(e.sized, M(`The sized global 'operator ${k}' is defined but the unsized one is not.`, `크기 지정 전역 'operator ${k}' 는 정의했지만 비지정판은 정의하지 않았습니다.`));
        if (e.unsized && !e.sized) api.report(e.unsized, M(`The unsized global 'operator ${k}' is defined but the sized one is not.`, `비지정 전역 'operator ${k}' 는 정의했지만 크기 지정판은 정의하지 않았습니다.`));
      }
    },
  }),
  R({
    id: '21.6.5', cat: 'Required', dec: true, type: 'BUG', autosar: 'A5-3-3', cert: 'EXP57-CPP', cwe: 'CWE-401', sev: 'CRITICAL', debt: 10,
    name: ['A pointer to an incomplete class type shall not be deleted', '불완전 클래스 타입 포인터는 delete 하면 안 됩니다'],
    why: ['Deleting through a pointer to an incomplete type skips a non-trivial destructor, which is undefined behaviour.', '불완전 타입 포인터로 delete 하면 자명하지 않은 소멸자를 건너뛰어 정의되지 않은 동작이 됩니다.'],
    fix: ['Include the class definition before the delete expression.', 'delete 식 앞에서 클래스 정의를 포함하세요.'],
    check(unit, api) {
      for (const d of U.ix(unit).get('DeleteExpr')) {
        const t = d.arg && U.strip(d.arg).ctype ? U.canon(U.strip(d.arg).ctype) : null;
        const r = t && t.kind === 'pointer' ? U.canon(t.to) : null;
        if (r && r.kind === 'record' && !r.complete && !(r.decl && r.decl.members)) api.report(d, M(`'${r.name}' is an incomplete type at this delete expression.`, `이 delete 식에서 '${r.name}' 는 불완전 타입입니다.`));
      }
    },
  }),
  R({
    id: '21.10.1', cat: 'Required', dec: true, type: 'BUG', autosar: 'A8-4-1', cert: 'DCL50-CPP', sev: 'MAJOR', debt: 15,
    name: ['The features of <cstdarg> shall not be used', '<cstdarg> 의 기능은 쓰면 안 됩니다'],
    why: ['Variable argument access is not type-checked and easily has undefined behaviour.', '가변 인자 접근은 타입 검사가 되지 않아 쉽게 정의되지 않은 동작이 됩니다.'],
    fix: ['Use variadic templates, overloads or std::initializer_list.', '가변 템플릿, 오버로드, std::initializer_list 를 쓰세요.'],
    check(unit, api) {
      const seen = new Set();
      for (const e of unit.expansions || []) {
        if (!VA.has(e.name) || !userFile(e.file) || e.nested) continue;
        seen.add(`${e.line}:${e.col}`);
        api.report({ file: e.file, line: e.line, col: e.col }, M(`'${e.name}' from <cstdarg> is used.`, `<cstdarg> 의 '${e.name}' 를 씁니다.`));
      }
      for (const n of U.ix(unit).get('NamedType')) if (/(^|::)va_list$/.test(n.qname || n.name)) api.report(n, M("'va_list' from <cstdarg> is used.", "<cstdarg> 의 'va_list' 를 씁니다."));
      for (const v of U.ix(unit).get('VaArgExpr')) if (!seen.has(`${v.loc.line}:${v.loc.col}`)) api.report(v, M("'va_arg' from <cstdarg> is used.", "<cstdarg> 의 'va_arg' 를 씁니다."));
    },
  }),
  R({
    id: '21.10.2', cat: 'Required', dec: true, type: 'BUG', autosar: 'M17-0-5', cert: 'ERR52-CPP', sev: 'MAJOR', debt: 15,
    name: ['The standard header file <csetjmp> shall not be used', '표준 헤더 <csetjmp> 는 쓰면 안 됩니다'],
    why: ['setjmp/longjmp bypass destructors and normal control flow.', 'setjmp/longjmp 는 소멸자와 정상 제어 흐름을 우회합니다.'],
    fix: ['Use exceptions or explicit error returns.', '예외나 명시적인 오류 반환을 쓰세요.'],
    check(unit, api) {
      for (const i of unit.includes || []) if (userFile(i.file) && /^(csetjmp|setjmp\.h)$/.test(i.name)) api.report({ file: i.file, line: i.line, col: i.col }, M(`<${i.name}> is included.`, `<${i.name}> 를 포함합니다.`));
      const seen = new Set();
      for (const e of unit.expansions || []) if (SETJMP.has(e.name) && userFile(e.file) && !e.nested) { seen.add(`${e.line}`); api.report({ file: e.file, line: e.line, col: e.col }, M(`'${e.name}' is used.`, `'${e.name}' 를 씁니다.`)); }
      for (const { c, n } of callsTo(unit, SETJMP)) if (!seen.has(`${c.loc.line}`)) api.report(c, M(`'${n}' is used.`, `'${n}' 를 씁니다.`));
    },
  }),
  R({
    id: '21.10.3', cat: 'Required', dec: true, type: 'BUG', autosar: 'M18-7-1', cert: 'MSC54-CPP', sev: 'MAJOR', debt: 15,
    name: ['The facilities provided by the standard header file <csignal> shall not be used', '표준 헤더 <csignal> 의 기능은 쓰면 안 됩니다'],
    why: ['Signal handling has much implementation-defined and undefined behaviour.', '시그널 처리에는 구현 정의와 정의되지 않은 동작이 많습니다.'],
    fix: ['Use platform-specific, well-documented mechanisms outside the core code.', '핵심 코드 밖에서 플랫폼 고유의 잘 문서화된 방식을 쓰세요.'],
    check(unit, api) {
      for (const { c, n } of callsTo(unit, SIGNAL)) api.report(c, M(`'${n}' from <csignal> is used.`, `<csignal> 의 '${n}' 를 씁니다.`));
    },
  }),
];
