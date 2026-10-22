'use strict';

// MISRA C++:2023 chapters 22 (diagnostics), 23 (general utilities),
// 24 (strings), 25 (localization) and 26 (containers).

const { R, M } = require('../lib/meta');
const U = require('../lib/util');
const { cf } = U;

const userFile = (f) => typeof f === 'string' && !f.startsWith('<');
const S = (...a) => new Set(a);

const CTYPE = S('isalnum', 'isalpha', 'isblank', 'iscntrl', 'isdigit', 'isgraph', 'islower', 'isprint', 'ispunct', 'isspace', 'isupper', 'isxdigit', 'tolower', 'toupper',
  'iswalnum', 'iswalpha', 'iswblank', 'iswcntrl', 'iswdigit', 'iswgraph', 'iswlower', 'iswprint', 'iswpunct', 'iswspace', 'iswupper', 'iswxdigit', 'towlower', 'towupper', 'wctype', 'iswctype', 'wctrans', 'towctrans');
const TWO_ARG_OK = S('iswctype', 'towctrans');
const MEMFN = S('memcpy', 'memmove', 'memcmp');
const CONST_RESULT = S('localeconv', 'getenv', 'setlocale', 'strerror');
const STATIC_RESULT = S('asctime', 'ctime', 'gmtime', 'localtime', 'localeconv', 'getenv', 'setlocale', 'strerror');

function callsTo(unit, names) {
  const out = [];
  for (const c of U.ix(unit).get('CallExpr')) {
    const n = U.isLibCall(c, names);
    if (n) out.push({ c, n });
  }
  return out;
}

const isErrno = (e) => {
  e = U.strip(e);
  if (!e) return false;
  if (e.loc && e.loc.macro === 'errno') return true;
  return e.type === 'Identifier' && e.name === 'errno' && (!e.qualifier || e.qualifier === 'std');
};

const ptrToNonConst = (t) => {
  if (!t) return false;
  const c = U.canon(t);
  return c.kind === 'pointer' && !U.canon(c.to).const && U.canon(c.to).kind !== 'void' ? true : (c.kind === 'pointer' && U.canon(c.to).kind === 'void' && !U.canon(c.to).const);
};

const smartName = (ts) => (ts && ts.type === 'NamedType' && /^(std::)?(unique_ptr|shared_ptr)$/.test(ts.qname || ts.name || '') ? (ts.qname || ts.name) : null);

module.exports = [
  R({
    id: '22.3.1', cat: 'Required', dec: true, sev: 'MINOR', debt: 2,
    name: ['The assert macro shall not be used with a constant-expression', 'assert 매크로를 상수식과 함께 쓰면 안 됩니다'],
    why: ['A constant condition can be checked at compile time; a run-time assert of it is either always true or disabled in release builds.', '상수 조건은 컴파일 시간에 검사할 수 있습니다. 실행 시간 assert 는 늘 참이거나 릴리스 빌드에서 꺼집니다.'],
    fix: ['Use static_assert.', 'static_assert 를 쓰세요.'],
    check(unit, api) {
      for (const e of unit.expansions || []) {
        if (e.name !== 'assert' || !e.args || !userFile(e.file) || e.nested) continue;
        const toks = e.args[0] || [];
        if (!toks.length) continue;
        if (toks[0].value === 'false' || (toks[0].value === '0' && toks.length === 1)) continue; // deliberate "unreachable" marker
        const constant = toks.every((t) => t.kind === 'number' || t.kind === 'char' || t.kind === 'string' || t.kind === 'punct' || (t.kind === 'keyword' && ['true', 'false', 'sizeof', 'alignof'].includes(t.value)) || (t.kind === 'keyword' && /^(int|char|long|short|unsigned|signed|float|double|bool)$/.test(t.value)));
        if (constant) api.report({ file: e.file, line: e.line, col: e.col }, M(`assert is used with the constant expression '${toks.map((t) => t.value).join(' ')}'.`, `assert 를 상수식 '${toks.map((t) => t.value).join(' ')}' 과 함께 씁니다.`));
      }
    },
  }),
  R({
    id: '22.4.1', cat: 'Required', dec: true, autosar: 'M19-3-1', cert: 'ERR30-C', sev: 'MAJOR', debt: 5,
    name: ['The literal value zero shall be the only value assigned to errno', 'errno 에 대입하는 값은 리터럴 0 이어야 합니다'],
    why: ['errno is set by the library; storing other values in it confuses error detection.', 'errno 는 라이브러리가 설정합니다. 다른 값을 넣으면 오류 감지가 혼란스러워집니다.'],
    fix: ['Only reset errno to 0 before a library call; report your own errors differently.', '라이브러리 호출 전에 errno 를 0 으로만 초기화하고, 자체 오류는 다른 방식으로 알리세요.'],
    check(unit, api) {
      for (const a of U.ix(unit).get('AssignExpr')) {
        if (!isErrno(a.left)) continue;
        const r = U.strip(a.right);
        const zero = a.op === '=' && r && r.type === 'IntegerLiteral' && r.value === 0n;
        if (!zero) api.report(a, M(`errno is assigned '${cf.sourceText(unit, a.right) || '?'}' (only the literal 0 is allowed).`, `errno 에 '${cf.sourceText(unit, a.right) || '?'}' 를 대입합니다 (리터럴 0 만 허용).`));
      }
      for (const u of U.ix(unit).get('UnaryExpr')) if ((u.op === '++' || u.op === '--') && isErrno(u.arg)) api.report(u, M(`errno is modified with '${u.op}'.`, `errno 를 '${u.op}' 로 바꿉니다.`));
    },
  }),
  R({
    id: '23.11.1', cat: 'Advisory', dec: true, autosar: 'A20-8-5', cert: 'MEM56-CPP', sev: 'MINOR', debt: 5,
    name: ['The raw pointer constructors of std::shared_ptr and std::unique_ptr should not be used', 'std::shared_ptr 와 std::unique_ptr 의 원시 포인터 생성자는 쓰지 않아야 합니다'],
    why: ['Constructing a smart pointer from a raw pointer allows double ownership and leaks if an exception occurs between allocation and construction.', '원시 포인터로 스마트 포인터를 만들면 이중 소유가 가능하고, 할당과 생성 사이에 예외가 나면 누수됩니다.'],
    fix: ['Use std::make_unique or std::make_shared.', 'std::make_unique 나 std::make_shared 를 쓰세요.'],
    check(unit, api) {
      const rawArg = (e) => {
        e = U.strip(e);
        if (!e || e.type === 'NullptrLiteral') return false;
        if (e.type === 'NewExpr') return true;
        const t = e.ctype ? U.canon(e.ctype) : null;
        return !!(t && t.kind === 'pointer');
      };
      const x = U.ix(unit);
      for (const v of x.get('VarDecl', 'FieldDecl')) {
        const nm = smartName(v.specs && v.specs.typeSpec);
        if (!nm || !v.init) continue;
        const args = v.init.type === 'ParenListInit' ? v.init.args : v.init.type === 'InitList' ? v.init.items : [];
        if (args.length && rawArg(args[0])) api.report(v, M(`'${v.name}' is constructed with the raw pointer constructor of '${nm}'.`, `'${v.name}' 가 '${nm}' 의 원시 포인터 생성자로 만들어집니다.`));
      }
      for (const c of x.get('CastExpr')) {
        if (c.kind !== 'functional') continue;
        const nm = smartName(c.typeName && c.typeName.specs && c.typeName.specs.typeSpec);
        if (nm && c.arg && rawArg(c.arg)) api.report(c, M(`A '${nm}' temporary is constructed from a raw pointer.`, `원시 포인터로 '${nm}' 임시 객체를 만듭니다.`));
      }
      for (const n of x.get('NewExpr')) {
        const p = U.upParens(n).p;
        if (p && p.type === 'CallExpr') {
          const cn = U.callName(p);
          if (cn && cn.member && cn.name === 'reset') api.report(p, M('A smart pointer is reset with a raw pointer from new.', 'new 로 얻은 원시 포인터로 스마트 포인터를 reset 합니다.'));
        }
      }
    },
  }),
  R({
    id: '24.5.1', cat: 'Required', dec: true, type: 'BUG', cert: 'STR37-C', sev: 'MAJOR', debt: 5,
    name: ['The character handling functions from <cctype> and <cwctype> shall not be used', '<cctype> 와 <cwctype> 의 문자 처리 함수는 쓰면 안 됩니다'],
    why: ['Passing a value not representable as unsigned char (or EOF) is undefined behaviour, and the result depends on the global locale.', 'unsigned char (또는 EOF) 로 표현할 수 없는 값을 넘기면 정의되지 않은 동작이고, 결과가 전역 로캘에 따라 달라집니다.'],
    fix: ['Use the <locale> overloads with an explicit locale, or your own checks.', '로캘을 명시하는 <locale> 오버로드나 자체 검사를 쓰세요.'],
    check(unit, api) {
      for (const { c, n } of callsTo(unit, CTYPE)) {
        if (c.args.length === 2 && !TWO_ARG_OK.has(n)) continue; // std::isdigit(c, loc)
        api.report(c, M(`Character handling function '${n}' is used.`, `문자 처리 함수 '${n}' 를 씁니다.`));
      }
    },
  }),
  R({
    id: '24.5.2', cat: 'Required', dec: true, type: 'BUG', autosar: 'A12-0-2', cert: 'EXP62-CPP', sev: 'MAJOR', debt: 10,
    name: ['The C++ Standard Library functions memcpy, memmove and memcmp from <cstring> shall not be used', '<cstring> 의 memcpy, memmove, memcmp 는 쓰면 안 됩니다'],
    why: ['They work on object representations and bypass constructors, padding semantics and type safety.', '이 함수들은 객체 표현을 직접 다뤄 생성자, 채움 바이트 의미, 타입 안전성을 우회합니다.'],
    fix: ['Use copy/assignment, std::copy or comparison operators.', '복사/대입, std::copy, 비교 연산자를 쓰세요.'],
    check(unit, api) {
      for (const { c, n } of callsTo(unit, MEMFN)) api.report(c, M(`'${n}' is used.`, `'${n}' 를 씁니다.`));
    },
  }),
  R({
    id: '25.5.1', cat: 'Required', dec: true, cert: 'CON33-C', sev: 'MAJOR', debt: 10,
    name: ['The setlocale and std::locale::global functions shall not be called', 'setlocale 과 std::locale::global 은 호출하면 안 됩니다'],
    why: ['Changing the global locale affects every thread and every locale-dependent function in the program.', '전역 로캘을 바꾸면 모든 스레드와 로캘에 의존하는 모든 함수가 영향을 받습니다.'],
    fix: ['Pass an explicit std::locale object to the operations that need it.', '필요한 연산에 std::locale 객체를 명시적으로 넘기세요.'],
    check(unit, api) {
      for (const { c } of callsTo(unit, S('setlocale'))) api.report(c, M("'setlocale' is called.", "'setlocale' 을 호출합니다."));
      for (const c of U.ix(unit).get('CallExpr')) {
        const cal = U.strip(c.callee);
        if (cal && cal.type === 'Identifier' && cal.name === 'global' && /(^|::)locale$/.test(cal.qualifier || '')) api.report(c, M("'std::locale::global' is called.", "'std::locale::global' 을 호출합니다."));
      }
    },
  }),
  R({
    id: '25.5.2', cat: 'Mandatory', dec: false, type: 'BUG', cert: 'ENV30-C', sev: 'CRITICAL', debt: 10,
    name: ['The pointers returned by the C++ Standard Library functions localeconv, getenv, setlocale or strerror must only be used as if they have pointer to const-qualified type', 'localeconv, getenv, setlocale, strerror 가 반환한 포인터는 const 를 가리키는 포인터처럼만 써야 합니다'],
    why: ['Modifying the storage these functions return is undefined behaviour.', '이 함수들이 반환한 저장소를 수정하는 것은 정의되지 않은 동작입니다.'],
    fix: ['Store the result in a pointer to const and copy the data before changing it.', '결과를 const 포인터에 저장하고, 바꾸려면 먼저 데이터를 복사하세요.'],
    check(unit, api) {
      const x = U.ix(unit);
      const isSrc = (e) => { e = U.strip(e); if (e && e.type === 'CastExpr' && e.arg) e = U.strip(e.arg); return e && e.type === 'CallExpr' ? U.isLibCall(e, CONST_RESULT) : null; };
      // pointer variables holding such results (for writes through them)
      const held = new Map();
      for (const v of x.get('VarDecl')) {
        const n = v.init && v.init.type !== 'InitList' && v.init.type !== 'ParenListInit' ? isSrc(v.init) : null;
        if (!n) continue;
        if (ptrToNonConst(v.ctype)) api.report(v, M(`The result of '${n}' is stored in '${v.name}', a pointer to non-const.`, `'${n}' 의 결과를 const 가 아닌 포인터 '${v.name}' 에 저장합니다.`));
        if (v.symbol) held.set(v.symbol, n);
      }
      for (const a of x.get('AssignExpr')) {
        const n = a.op === '=' ? isSrc(a.right) : null;
        if (n && ptrToNonConst(U.strip(a.left).ctype)) api.report(a, M(`The result of '${n}' is assigned to a pointer to non-const.`, `'${n}' 의 결과를 const 가 아닌 포인터에 대입합니다.`));
        if (n) { const id = U.strip(a.left); if (id && id.type === 'Identifier' && id.symbol) held.set(id.symbol, n); }
      }
      // writes through the result
      for (const a of x.get('AssignExpr', 'UnaryExpr')) {
        const target = a.type === 'AssignExpr' ? a.left : (a.op === '++' || a.op === '--' ? a.arg : null);
        if (!target) continue;
        let e = U.strip(target);
        for (let i = 0; i < 10 && e; i++) {
          if (e.type === 'UnaryExpr' && e.op === '*') e = U.strip(e.arg);
          else if (e.type === 'IndexExpr') e = U.strip(e.object);
          else if (e.type === 'MemberExpr' && e.arrow) e = U.strip(e.object);
          else break;
          const n = isSrc(e) || (e && e.type === 'Identifier' && e.symbol && held.get(e.symbol));
          if (n) { api.report(a, M(`The storage returned by '${n}' is modified.`, `'${n}' 가 반환한 저장소를 수정합니다.`)); break; }
        }
      }
    },
  }),
  R({
    id: '25.5.3', cat: 'Mandatory', dec: false, type: 'BUG', cert: 'ENV34-C', sev: 'CRITICAL', debt: 10,
    name: ['The pointer returned by the C++ Standard Library functions asctime, ctime, gmtime, localtime, localeconv, getenv, setlocale or strerror must not be used following a subsequent call to the same function', 'asctime, ctime, gmtime, localtime, localeconv, getenv, setlocale, strerror 가 반환한 포인터는 같은 함수를 다시 호출한 뒤에 쓰면 안 됩니다'],
    why: ['These functions may reuse a static buffer, so a later call overwrites the data the earlier pointer refers to.', '이 함수들은 정적 버퍼를 재사용할 수 있어, 나중 호출이 앞서 받은 포인터가 가리키는 데이터를 덮어씁니다.'],
    fix: ['Copy the result before calling the function again.', '함수를 다시 호출하기 전에 결과를 복사하세요.'],
    check(unit, api) {
      for (const fn of U.ix(unit).funcs) {
        // events in source order: defs of a holder, calls, uses
        const holders = new Map(); // sym -> { fname, pos }
        const calls = [];
        cf.walk(fn.body, (n) => {
          if (n.type === 'CallExpr') { const nm = U.isLibCall(n, STATIC_RESULT); if (nm) calls.push({ nm, pos: n.loc.start, node: n }); }
          return undefined;
        });
        if (calls.length < 2) continue;
        const src = (e) => { e = U.strip(e); return e && e.type === 'CallExpr' ? U.isLibCall(e, STATIC_RESULT) : null; };
        const defs = [];
        cf.walk(fn.body, (n) => {
          if (n.type === 'VarDecl' && n.init && n.symbol) { const nm = src(n.init); defs.push({ sym: n.symbol, nm, pos: n.loc.end, node: n.init }); }
          if (n.type === 'AssignExpr' && n.op === '=') { const l = U.strip(n.left); if (l && l.type === 'Identifier' && l.symbol) defs.push({ sym: l.symbol, nm: src(n.right), pos: n.loc.end, node: n.right }); }
          return undefined;
        });
        void holders;
        const reported = new Set();
        for (const id of cf.findAll(fn.body, 'Identifier')) {
          if (!id.symbol || reported.has(id.symbol) || U.writeKind(id) === 'assign') continue;
          const before = defs.filter((d) => d.sym === id.symbol && d.pos <= id.loc.start).sort((a, b) => b.pos - a.pos)[0];
          if (!before || !before.nm) continue;
          const later = calls.find((c) => c.nm === before.nm && c.pos > before.pos && c.pos < id.loc.start && c.node !== before.node && !cf.ancestors(c.node).includes(before.node));
          if (!later) continue;
          reported.add(id.symbol);
          api.report(id, M(`'${id.name}' holds the result of '${before.nm}' but '${before.nm}' was called again at line ${later.node.loc.line}.`, `'${id.name}' 는 '${before.nm}' 의 결과를 담고 있는데 ${later.node.loc.line}행에서 '${before.nm}' 를 다시 호출했습니다.`));
        }
      }
    },
  }),
  R({
    id: '26.3.1', cat: 'Advisory', dec: true, autosar: 'A18-1-2', sev: 'MINOR', debt: 5,
    name: ['std::vector should not be specialized with bool', 'std::vector 를 bool 로 특수화하지 않아야 합니다'],
    why: ['std::vector<bool> is a packed bit container that does not meet the container requirements (its elements are not addressable).', 'std::vector<bool> 은 비트로 압축된 컨테이너라서 컨테이너 요구 사항을 만족하지 않습니다 (요소의 주소를 얻을 수 없음).'],
    fix: ['Use std::bitset, std::vector<std::uint8_t> or std::deque<bool>.', 'std::bitset, std::vector<std::uint8_t>, std::deque<bool> 을 쓰세요.'],
    check(unit, api) {
      for (const n of U.ix(unit).get('NamedType')) {
        if (!/^(std::)?vector$/.test(n.qname || n.name || '') || !n.templateArgs || !n.templateArgs.length) continue;
        const a = n.templateArgs[0];
        const t = a && a.type === 'TypeName' ? a.ctype || (a.specs && a.specs.typeSpec && a.specs.typeSpec.names && a.specs.typeSpec.names.join(' ')) : null;
        const isBool = t && (typeof t === 'string' ? t === 'bool' : U.canon(t).kind === 'int' && U.canon(t).name === 'bool');
        if (isBool) api.report(n, M('std::vector<bool> is used.', 'std::vector<bool> 을 씁니다.'));
      }
    },
  }),
];
