'use strict';

// AUTOSAR C++14 chapters 19-27 — diagnostics, general utilities (smart
// pointers), strings, containers, algorithms, numerics (random numbers) and
// input/output (C-style strings), plus MISRA C++:2008 M19 / M27 rules.

const { A, M } = require('../lib/meta');
const { D } = require('../lib/delegate');
const U = require('../lib/util');
const { cf } = U;

const S = (...a) => new Set(a);
const CTYPE = S('isalnum', 'isalpha', 'isblank', 'iscntrl', 'isdigit', 'isgraph', 'islower', 'isprint', 'ispunct', 'isspace', 'isupper', 'isxdigit', 'tolower', 'toupper');
const ENGINES = /(^|::)(mt19937|mt19937_64|minstd_rand0?|ranlux24(_base)?|ranlux48(_base)?|knuth_b|default_random_engine|mersenne_twister_engine|linear_congruential_engine|subtract_with_carry_engine)$/;
const SORTS = S('sort', 'stable_sort', 'partial_sort', 'nth_element', 'lower_bound', 'upper_bound', 'equal_range', 'binary_search', 'make_heap', 'push_heap', 'pop_heap', 'sort_heap', 'merge', 'inplace_merge', 'min_element', 'max_element');

const smartName = (t) => {
  const s = typeof t === 'string' ? t : U.tstr(t);
  const m = /(^|::)(unique_ptr|shared_ptr)\b/.exec(s || '');
  return m ? m[2] : null;
};
const tsName = (ts) => (ts && ts.type === 'NamedType' ? (ts.qname || ts.name || '') : '');

// Smart pointers constructed from a raw `new`: [{ node, kind }]
function rawConstructions(unit) {
  return U.memo(unit, 'autosar.rawSmart', () => {
    const out = [];
    const x = U.ix(unit);
    const firstNew = (init) => {
      if (!init) return null;
      const items = init.type === 'ParenListInit' ? init.args : init.type === 'InitList' ? init.items : [init];
      const e = items && items.length ? U.strip(items[0]) : null;
      return e && e.type === 'NewExpr' ? e : null;
    };
    for (const v of x.get('VarDecl', 'FieldDecl')) {
      const k = smartName(tsName(v.specs && v.specs.typeSpec));
      if (k && firstNew(v.init)) out.push({ node: v, kind: k, name: v.name });
    }
    for (const c of x.get('CastExpr')) {
      if (c.kind !== 'functional') continue;
      const k = smartName(tsName(c.typeName && c.typeName.specs && c.typeName.specs.typeSpec));
      if (k && c.arg && U.strip(c.arg) && U.strip(c.arg).type === 'NewExpr') out.push({ node: c, kind: k });
    }
    for (const c of x.get('CallExpr')) {
      const cn = U.callName(c);
      if (!cn || !cn.member || cn.name !== 'reset' || !c.args || !c.args[0] || U.strip(c.args[0]).type !== 'NewExpr') continue;
      const k = smartName(cn.object && cn.object.ctype);
      if (k) out.push({ node: c, kind: k });
    }
    return out;
  });
}

module.exports = [
  // ---------------------------------------------------------------- chapter 19
  A({
    id: 'M19-3-1', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['The error indicator errno shall not be used', '오류 표시자 errno 는 쓰면 안 됩니다'],
    why: ['errno is a global side channel that is easily overwritten by an intervening call.', 'errno 는 중간 호출이 쉽게 덮어쓰는 전역 부수 경로입니다.'],
    fix: ['Use return values, std::error_code or exceptions to report errors.', '반환값, std::error_code, 예외로 오류를 알리세요.'],
    check(unit, api) {
      const seen = new Set();
      for (const e of unit.expansions || []) {
        if (e.name !== 'errno' || U.isBuiltin(e.file) || e.nested) continue;
        const k = `${e.file}:${e.line}:${e.col}`;
        if (seen.has(k)) continue;
        seen.add(k);
        api.report(e, M('errno is used.', 'errno 를 씁니다.'));
      }
      for (const id of U.ix(unit).get('Identifier')) if (id.name === 'errno' && !id.loc.macro && (!id.symbol || id.symbol.system)) api.report(id, M('errno is used.', 'errno 를 씁니다.'));
    },
  }),
  // ---------------------------------------------------------------- chapter 20
  A({
    id: 'A20-8-1', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'CRITICAL', debt: 10, cwe: 'CWE-415',
    name: ['An already-owned pointer value shall not be stored in an unrelated smart pointer', '이미 소유된 포인터 값을 관련 없는 스마트 포인터에 저장하면 안 됩니다'],
    why: ['Two smart pointers owning the same object delete it twice.', '두 스마트 포인터가 같은 객체를 소유하면 그 객체를 두 번 delete 합니다.'],
    fix: ['Copy or move the original smart pointer instead of wrapping its raw pointer again.', '원시 포인터를 다시 감싸지 말고 원래 스마트 포인터를 복사하거나 이동하세요.'],
    check(unit, api) {
      const x = U.ix(unit);
      const fromGet = (e) => { e = U.strip(e); if (!e || e.type !== 'CallExpr') return false; const cn = U.callName(e); return !!(cn && cn.member && cn.name === 'get' && smartName(cn.object && cn.object.ctype)); };
      const check = (node, items, k) => { const a = items && items[0]; if (k && a && fromGet(a)) api.report(node, M(`The raw pointer of another ${k} is stored in a new smart pointer.`, `다른 ${k} 의 원시 포인터를 새 스마트 포인터에 저장합니다.`)); };
      for (const v of x.get('VarDecl')) {
        const k = smartName(tsName(v.specs && v.specs.typeSpec));
        const init = v.init;
        if (!k || !init) continue;
        check(U.at(v), init.type === 'ParenListInit' ? init.args : init.type === 'InitList' ? init.items : [init], k);
      }
      for (const c of x.get('CastExpr')) if (c.kind === 'functional') check(c, [c.arg], smartName(tsName(c.typeName && c.typeName.specs && c.typeName.specs.typeSpec)));
    },
  }),
  A({
    id: 'A20-8-5', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 2, cert: 'MEM56-CPP',
    name: ['std::make_unique shall be used to construct objects owned by std::unique_ptr', 'std::unique_ptr 가 소유할 객체는 std::make_unique 로 생성해야 합니다'],
    why: ['make_unique avoids a raw new and is exception-safe when several arguments are evaluated.', 'make_unique 는 원시 new 를 피하고 여러 인자를 평가할 때도 예외에 안전합니다.'],
    fix: ['Write auto p = std::make_unique<T>(args...).', 'auto p = std::make_unique<T>(args...) 로 쓰세요.'],
    check(unit, api) {
      for (const r of rawConstructions(unit)) if (r.kind === 'unique_ptr') api.report(r.node.type === 'VarDecl' ? U.at(r.node) : r.node, M('A std::unique_ptr is constructed from a raw new expression.', 'std::unique_ptr 를 원시 new 식으로 생성합니다.'));
    },
  }),
  A({
    id: 'A20-8-6', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 2, cert: 'MEM56-CPP',
    name: ['std::make_shared shall be used to construct objects owned by std::shared_ptr', 'std::shared_ptr 가 소유할 객체는 std::make_shared 로 생성해야 합니다'],
    why: ['make_shared allocates the object and its control block together and is exception-safe.', 'make_shared 는 객체와 제어 블록을 함께 할당하며 예외에 안전합니다.'],
    fix: ['Write auto p = std::make_shared<T>(args...).', 'auto p = std::make_shared<T>(args...) 로 쓰세요.'],
    check(unit, api) {
      for (const r of rawConstructions(unit)) if (r.kind === 'shared_ptr') api.report(r.node.type === 'VarDecl' ? U.at(r.node) : r.node, M('A std::shared_ptr is constructed from a raw new expression.', 'std::shared_ptr 를 원시 new 식으로 생성합니다.'));
    },
  }),
  // ---------------------------------------------------------------- chapter 21
  A({
    id: 'A21-8-1', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'MAJOR', debt: 5, cert: 'STR37-C', cwe: 'CWE-704',
    name: ['Arguments to character-handling functions shall be representable as an unsigned char', '문자 처리 함수의 인자는 unsigned char 로 표현할 수 있어야 합니다'],
    why: ['Passing a negative plain char to isdigit / toupper is undefined behaviour.', '음수인 plain char 를 isdigit / toupper 에 넘기는 것은 정의되지 않은 동작입니다.'],
    fix: ['Cast the argument: std::isdigit(static_cast<unsigned char>(c)).', '인자를 변환하세요: std::isdigit(static_cast<unsigned char>(c)).'],
    check(unit, api) {
      for (const { c, n } of U.libCalls(unit, CTYPE)) {
        const a = c.args && c.args[0];
        const t = a && a.ctype ? U.nonRef(a.ctype) : null;
        if (t && t.kind === 'int' && (t.name === 'char' || t.name === 'signed char')) api.report(c, M(`'${n}' is called with a '${t.name}' argument that may be negative.`, `'${n}' 을(를) 음수일 수 있는 '${t.name}' 인자로 호출합니다.`));
      }
    },
  }),
  // ---------------------------------------------------------------- chapter 25
  D('A25-1-1', ['28.3.1'], { name: ['Non-static data members or captured values of predicate function objects shall not be modified', '술어 함수 객체의 비정적 멤버나 캡처한 값을 바꾸면 안 됩니다'] }),
  A({
    id: 'A25-4-1', cat: 'Required', enf: 'partially automated', type: 'BUG', sev: 'MAJOR', debt: 5, cert: 'CTR57-CPP',
    name: ['Ordering predicates used with associative containers and STL sorting algorithms shall adhere to strict weak ordering', '연관 컨테이너와 STL 정렬 알고리즘에 쓰는 순서 술어는 엄격한 약한 순서를 따라야 합니다'],
    why: ['A comparator such as a <= b is not irreflexive; sort and set then behave undefined (crashes, lost elements).', 'a <= b 같은 비교자는 비반사적이지 않아 sort 와 set 이 정의되지 않은 동작(충돌, 원소 손실)을 합니다.'],
    fix: ['Use a strict comparison such as a < b.', 'a < b 같은 엄격한 비교를 쓰세요.'],
    check(unit, api) {
      for (const { c, n } of U.stdCalls(unit, SORTS)) {
        const last = c.args && c.args[c.args.length - 1] ? U.strip(c.args[c.args.length - 1]) : null;
        if (!last || last.type !== 'LambdaExpr') continue;
        let bad = null;
        cf.walk(last.body, (x) => {
          if (x.type === 'LambdaExpr') return cf.walk.SKIP;
          if (x.type === 'ReturnStmt' && x.arg) { const e = U.strip(x.arg); if (e && e.type === 'BinaryExpr' && (e.op === '<=' || e.op === '>=')) bad = e; }
          return undefined;
        });
        if (bad) api.report(bad, M(`The comparator passed to '${n}' uses '${bad.op}', which is not a strict weak ordering.`, `'${n}' 에 넘긴 비교자가 엄격한 약한 순서가 아닌 '${bad.op}' 를 씁니다.`));
      }
    },
  }),
  // ---------------------------------------------------------------- chapter 26
  A({
    id: 'A26-5-1', cat: 'Required', enf: 'automated', type: 'VULNERABILITY', sev: 'MAJOR', debt: 5, cwe: 'CWE-338', cert: 'MSC50-CPP',
    name: ['Pseudorandom numbers shall not be generated using std::rand()', '의사 난수를 std::rand() 로 만들면 안 됩니다'],
    why: ['std::rand has poor statistical quality, a small range and hidden global state.', 'std::rand 는 통계적 품질이 낮고 범위가 작으며 숨은 전역 상태를 가집니다.'],
    fix: ['Use a <random> engine with a distribution.', '<random> 엔진과 분포를 쓰세요.'],
    check(unit, api) {
      for (const { c, n } of U.libCalls(unit, S('rand', 'srand'))) api.report(c, M(`'${n}' is used to generate pseudorandom numbers.`, `의사 난수를 만드는 데 '${n}' 를 씁니다.`));
    },
  }),
  A({
    id: 'A26-5-2', cat: 'Required', enf: 'automated', type: 'VULNERABILITY', sev: 'MAJOR', debt: 5, cwe: 'CWE-336', cert: 'MSC51-CPP',
    name: ['Random number engines shall not be default-initialized', '난수 엔진을 기본 초기화하면 안 됩니다'],
    why: ['A default-constructed engine always produces the same sequence.', '기본 생성한 엔진은 늘 같은 수열을 만듭니다.'],
    fix: ['Seed the engine, e.g. from std::random_device.', '엔진에 시드를 주세요(예: std::random_device 로).'],
    check(unit, api) {
      for (const v of U.ix(unit).get('VarDecl', 'FieldDecl')) {
        const n = tsName(v.specs && v.specs.typeSpec);
        if (!ENGINES.test(n)) continue;
        const empty = !v.init || (v.init.type === 'InitList' && !v.init.items.length) || (v.init.type === 'ParenListInit' && !v.init.args.length);
        if (empty && !U.hasStorage(v, 'extern')) api.report(U.at(v), M(`The random number engine '${v.name}' is default-initialized.`, `난수 엔진 '${v.name}' 을(를) 기본 초기화합니다.`));
      }
    },
  }),
  // ---------------------------------------------------------------- chapter 27
  D('A27-0-3', ['30.0.2'], { name: ['Alternate input and output operations on a file stream shall be separated by a flush or positioning call', '파일 스트림의 입력과 출력은 flush 나 위치 지정 호출로 구분해야 합니다'] }),
  A({
    id: 'A27-0-4', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 10, cwe: 'CWE-170',
    name: ['C-style strings shall not be used', 'C 스타일 문자열은 쓰면 안 됩니다'],
    why: ['Null-terminated character arrays are easily overrun and their length must be tracked by hand.', '널 종료 문자 배열은 넘치기 쉽고 길이를 손으로 관리해야 합니다.'],
    fix: ['Use std::string (or std::string_view for read-only text).', 'std::string(읽기 전용이면 std::string_view)을 쓰세요.'],
    check(unit, api) {
      api = U.cppOnlyFix(api); // a header shared with C must stay C
      const isChar = (t) => { const c = t ? U.canon(t) : null; return !!(c && c.kind === 'int' && (c.name === 'char' || c.name === 'wchar_t' || c.name === 'char16_t' || c.name === 'char32_t' || c.name === 'char8_t')); };
      for (const v of U.ix(unit).get('VarDecl', 'FieldDecl')) {
        if (!v.ctype || v.loc.macro) continue;
        const t = U.canon(v.ctype);
        const strInit = v.init && U.strip(v.init) && U.strip(v.init).type === 'StringLiteral';
        if ((t.kind === 'array' && isChar(t.of)) || (t.kind === 'pointer' && isChar(t.to) && strInit)) api.report(U.at(v), M(`'${v.name}' is a C-style string.`, `'${v.name}' 은(는) C 스타일 문자열입니다.`));
      }
    },
  }),
  D('M27-0-1', ['30.0.1'], { name: ['The stream input/output library <cstdio> shall not be used', '스트림 입출력 라이브러리 <cstdio> 는 쓰면 안 됩니다'] }),
];
