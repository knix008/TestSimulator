'use strict';

// AUTOSAR C++14 chapter 8 — declarators (parameters, return values,
// initialization) and MISRA C++:2008 M8 rules.

const { A, M } = require('../lib/meta');
const { D } = require('../lib/delegate');
const U = require('../lib/util');
const { cf } = U;

const fundamental = (t) => { const c = t ? U.canon(t) : null; return !!(c && (c.kind === 'int' || c.kind === 'float' || c.kind === 'enum' || c.kind === 'pointer' || c.kind === 'nullptr')); };
const isRef = (t) => { const c = t ? U.canon(t) : null; return c && c.kind === 'reference' ? c : null; };

// Standard classes with a std::initializer_list constructor.
const STD_INIT_LIST = new Set(['vector', 'deque', 'list', 'forward_list', 'set', 'multiset', 'map', 'multimap',
  'unordered_set', 'unordered_multiset', 'unordered_map', 'unordered_multimap', 'basic_string', 'string', 'wstring',
  'u16string', 'u32string', 'u8string', 'valarray', 'priority_queue', 'queue', 'stack']);

// The declared class of `v` has a constructor taking a std::initializer_list.
function hasInitListCtor(ts, v) {
  if (STD_INIT_LIST.has(U.stdTemplate(ts))) return true;
  const rec = U.recordOf(v.ctype);
  if (!rec || U.canon(v.ctype).kind !== 'record') return false;
  return U.methods(rec).some((m) => {
    const f = m.node;
    if (!(f.isConstructor || f.name === (rec.name || '').split('::').pop())) return false;
    const p = (f.params || [])[0];
    const pts = p && p.specs && p.specs.typeSpec;
    return !!(pts && pts.type === 'NamedType' && /(^|::)initializer_list$/.test(pts.qname || pts.name || ''));
  });
}

// Parameters of function definitions (not lambdas): [{ p, fn }]
function defParams(unit) {
  return U.memo(unit, 'autosar.defParams', () => {
    const out = [];
    for (const fn of U.fnDefs(unit)) for (const p of fn.params || []) if (p.symbol && p.name) out.push({ p, fn });
    return out;
  });
}

// How a parameter is used: { read, written, escapes }
function paramUse(p) {
  const res = { read: false, written: false, escapes: false };
  for (const u of p.symbol.uses || []) {
    if (u.type !== 'Identifier') { res.escapes = true; continue; }
    const w = U.writeKind(u);
    if (w === 'assign') { res.written = true; continue; }
    if (w === 'compound' || w === 'incdec') { res.written = true; res.read = true; continue; }
    if (w === 'address') { res.escapes = true; continue; }
    // member write p.x = ..., p.f() or passing p on
    let c = u;
    let par = U.upParens(c);
    while (par.p && (par.p.type === 'MemberExpr' || par.p.type === 'IndexExpr') && par.key === 'object') { c = par.p; par = U.upParens(c); }
    if (c !== u) {
      const ww = U.writeKind(c);
      if (ww) { res.written = true; if (ww !== 'assign') res.read = true; continue; }
      if (par.p && par.p.type === 'CallExpr' && par.key === 'callee') { res.escapes = true; continue; }
    }
    if (par.p && par.p.type === 'CallExpr' && par.key === 'args') { res.escapes = true; continue; }
    if (par.p && (par.p.type === 'VarDecl') && isRef(par.p.ctype)) { res.escapes = true; continue; }
    if (par.p && par.p.type === 'ReturnStmt' && c === u) { res.escapes = true; continue; }
    res.read = true;
  }
  return res;
}

function isStdMoveArg(u) {
  const { p, key } = U.upParens(u);
  if (!p || p.type !== 'CallExpr' || key !== 'args') return false;
  const cn = U.callName(p);
  return !!(cn && !cn.member && (cn.name === 'move' || cn.name === 'forward'));
}

const templateParamNames = (td) => new Set((td.params || []).map((p) => p.name || (p.param && p.param.name)).filter(Boolean));

module.exports = [
  A({
    id: 'A8-2-1', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 2,
    name: ['Function templates whose return type depends on the parameter types shall use the trailing return type syntax', '반환 형식이 매개변수 형식에 따라 달라지는 함수 템플릿은 후행 반환 형식을 써야 합니다'],
    why: ['A trailing return type can name the parameters and avoids long qualified dependent names in front of the function.', '후행 반환 형식은 매개변수 이름을 쓸 수 있고 함수 앞의 긴 한정 종속 이름을 피하게 합니다.'],
    fix: ['Write auto f(params) -> ReturnType.', 'auto f(매개변수) -> 반환형식 으로 쓰세요.'],
    check(unit, api) {
      for (const td of U.ix(unit).get('TemplateDecl')) {
        const d = td.decl;
        if (!d || d.type !== 'Declaration' || d.declarators.length !== 1 || d.declarators[0].type !== 'FunctionDecl') continue;
        const f = d.declarators[0];
        const fd = U.fdecl(f);
        const ts = d.specs && d.specs.typeSpec;
        if (!ts || !fd || fd.trailingReturn) continue;
        const names = templateParamNames(td);
        let dependent = ts.type === 'DecltypeType' || !!ts.dependent;
        if (!dependent && ts.type === 'NamedType') {
          const parts = String(ts.qname || ts.name || '').split('::');
          dependent = parts.length > 1 && names.has(parts[0]);
          if (!dependent && ts.templateArgs) dependent = (cf.sourceText(unit, ts) || '').split(/[^\w]+/).some((w) => names.has(w)) && parts.length > 1;
        }
        if (dependent) api.report(U.at(f), M(`The dependent return type of the function template '${f.name}' is not a trailing return type.`, `함수 템플릿 '${f.name}' 의 종속 반환 형식을 후행 반환 형식으로 쓰지 않았습니다.`));
      }
    },
  }),
  A({
    id: 'A8-4-1', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 15, cert: 'DCL50-CPP',
    name: ['Functions shall not be defined using the ellipsis notation', '함수를 생략 부호(...) 표기로 정의하면 안 됩니다'],
    why: ['Arguments passed through ... are not type-checked and are easily read with the wrong type.', '... 로 전달한 인자는 형식 검사를 받지 않아 잘못된 형식으로 읽기 쉽습니다.'],
    fix: ['Use overloads, a variadic template or an std::initializer_list.', '오버로드, 가변 템플릿, std::initializer_list 를 쓰세요.'],
    check(unit, api) {
      for (const f of U.ix(unit).get('FunctionDecl')) if (f.variadic && !f.loc.macro) api.report(U.at(f), M(`The function '${f.name}' uses the ellipsis notation.`, `함수 '${f.name}' 이(가) 생략 부호 표기를 씁니다.`));
    },
  }),
  D('A8-4-2', ['9.6.5'], { name: ['All exit paths from a function with non-void return type shall have an explicit return statement with an expression', 'void 가 아닌 함수의 모든 종료 경로에는 식이 있는 return 문이 있어야 합니다'] }),
  A({
    id: 'A8-4-5', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['"consume" parameters declared as X&& shall always be moved from', 'X&& 로 선언한 "소비" 매개변수는 항상 이동해야 합니다'],
    why: ['Taking an rvalue reference promises to consume the argument; not moving from it copies or ignores it.', '우측값 참조를 받는 것은 인자를 소비하겠다는 약속인데, 이동하지 않으면 복사하거나 무시하게 됩니다.'],
    fix: ['Use std::move(param) where the value is consumed, or take the parameter differently.', '값을 소비하는 곳에서 std::move(매개변수) 를 쓰거나 매개변수를 다르게 받으세요.'],
    check(unit, api) {
      for (const { p, fn } of defParams(unit)) {
        const r = isRef(p.ctype);
        if (!r || !r.rvalue || U.inTemplate(fn)) continue;
        if (fn.isConstructor || specialMove(fn)) {
          // move constructors / assignments consume through their members
          if ((p.symbol.uses || []).some((u) => u.type === 'Identifier')) continue;
        }
        const uses = (p.symbol.uses || []).filter((u) => u.type === 'Identifier');
        if (!uses.some(isStdMoveArg)) api.report(U.at(p), M(`The rvalue reference parameter '${p.name}' is never moved from.`, `우측값 참조 매개변수 '${p.name}' 를 한 번도 이동하지 않습니다.`));
      }
    },
  }),
  A({
    id: 'A8-4-7', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 2,
    name: ['"in" parameters for "cheap to copy" types shall be passed by value', '복사 비용이 작은 형식의 "입력" 매개변수는 값으로 전달해야 합니다'],
    why: ['Passing an int or a pointer by const reference adds an indirection and aliasing questions for no benefit.', 'int 나 포인터를 const 참조로 전달하면 이득 없이 간접 참조와 별칭 문제만 생깁니다.'],
    fix: ['Pass fundamental types by value.', '기본 형식은 값으로 전달하세요.'],
    check(unit, api) {
      for (const p of U.ix(unit).get('ParamDecl')) {
        const r = isRef(p.ctype);
        if (!r || r.rvalue || !U.canon(r.to).const || !fundamental(r.to)) continue;
        if (U.inTemplate(p)) continue;
        api.report(U.at(p.nameLoc ? p : p), M(`The parameter '${p.name || '<unnamed>'}' of cheap-to-copy type '${U.tstr(r.to)}' is passed by const reference.`, `복사 비용이 작은 '${U.tstr(r.to)}' 형식 매개변수 '${p.name || '<이름 없음>'}' 를 const 참조로 전달합니다.`));
      }
    },
  }),
  A({
    id: 'A8-4-8', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 5,
    name: ['Output parameters shall not be used', '출력 매개변수는 쓰면 안 됩니다'],
    why: ['A reference parameter that is only written is a hidden return value; returning it is clearer.', '쓰기만 하는 참조 매개변수는 숨은 반환값이며, 반환하는 쪽이 더 분명합니다.'],
    fix: ['Return the value (or a struct / std::tuple for several values).', '값을(여러 개라면 구조체나 std::tuple 로) 반환하세요.'],
    check(unit, api) {
      for (const { p } of defParams(unit)) {
        const r = isRef(p.ctype);
        if (!r || r.rvalue || U.canon(r.to).const || !fundamental(r.to)) continue;
        const use = paramUse(p);
        if (use.written && !use.read && !use.escapes) api.report(U.at(p), M(`'${p.name}' is an output parameter; return the value instead.`, `'${p.name}' 은(는) 출력 매개변수입니다. 대신 값을 반환하세요.`));
      }
    },
  }),
  A({
    id: 'A8-4-9', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 5,
    name: ['"in-out" parameters declared as T& shall be modified', 'T& 로 선언한 "입출력" 매개변수는 수정되어야 합니다'],
    why: ['A non-const reference parameter that is never modified misleads callers into thinking the argument changes.', '수정하지 않는 비 const 참조 매개변수는 인자가 바뀐다고 호출자를 오해하게 합니다.'],
    fix: ['Take the parameter by const reference (or by value).', '매개변수를 const 참조(또는 값)로 받으세요.'],
    check(unit, api) {
      for (const { p, fn } of defParams(unit)) {
        const r = isRef(p.ctype);
        if (!r || r.rvalue || U.canon(r.to).const || U.unknownT(r.to) || U.inTemplate(fn)) continue;
        if (U.isVirtualDecl(fn) || fn.isOverride || fn.isOperator) continue;
        const use = paramUse(p);
        if (!use.written && !use.escapes) api.report(U.at(p), M(`The reference parameter '${p.name}' is never modified; take it by const reference.`, `참조 매개변수 '${p.name}' 를 수정하지 않습니다. const 참조로 받으세요.`));
      }
    },
  }),
  D('A8-5-0', ['11.6.2'], { type: 'BUG', name: ['All memory shall be initialized before it is read', '모든 메모리는 읽기 전에 초기화해야 합니다'] }),
  A({
    id: 'A8-5-1', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5, cwe: 'CWE-457',
    name: ['In an initialization list, the order shall be virtual bases, direct bases, then non-static data members in declaration order', '초기화 목록의 순서는 가상 기반, 직접 기반, 선언 순서의 비정적 데이터 멤버여야 합니다'],
    why: ['Members are initialized in declaration order regardless of the list; a different order suggests a dependency that does not hold.', '멤버는 목록과 상관없이 선언 순서로 초기화되므로, 다른 순서는 성립하지 않는 의존 관계를 암시합니다.'],
    fix: ['Reorder the initializers to match the declaration order.', '초기화 순서를 선언 순서에 맞추세요.'],
    check(unit, api) {
      for (const f of U.ix(unit).funcs) {
        if (!f.ctorInits || f.ctorInits.length < 2) continue;
        const rec = U.ownerRecord(unit, f);
        if (!rec || !rec.decl) continue;
        const order = new Map();
        let i = 0;
        const bs = U.bases(rec);
        for (const b of bs) if (b.virtual) order.set(String(b.spec.name || '').split('::').pop(), i++);
        for (const b of bs) if (!b.virtual) order.set(String(b.spec.name || '').split('::').pop(), i++);
        for (const m of U.fields(rec)) order.set(m.node.name, i++);
        let last = -1;
        for (const ci of f.ctorInits) {
          const k = order.get(String(ci.name || '').replace(/<.*$/, '').split('::').pop());
          if (k === undefined) continue;
          if (k < last) { api.report(ci.loc ? ci : f, M(`'${ci.name}' is initialized out of declaration order.`, `'${ci.name}' 을(를) 선언 순서와 다르게 초기화합니다.`)); break; }
          last = k;
        }
      }
    },
  }),
  A({
    id: 'A8-5-2', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 1,
    name: ['Braced-initialization {}, without the equals sign, shall be used for variable initialization', '변수 초기화에는 = 없이 중괄호 초기화 {} 를 써야 합니다'],
    why: ['Brace initialization forbids narrowing conversions and avoids the most vexing parse.', '중괄호 초기화는 좁히는 변환을 막고 가장 성가신 구문 분석(most vexing parse)을 피합니다.'],
    fix: ['Write T x{value}; instead of T x = value; or T x(value);.', 'T x = value; 나 T x(value); 대신 T x{value}; 로 쓰세요.'],
    check(unit, api) {
      api = U.cppOnlyFix(api); // a header shared with C must stay C
      for (const v of U.ix(unit).get('VarDecl')) {
        if (!v.init || v.initStyle === 'brace' || !v.initStyle) continue;
        const ts = v.specs && v.specs.typeSpec;
        if (ts && (ts.type === 'AutoType' || (ts.type === 'DecltypeType' && ts.auto))) continue; // A8-5-3 governs auto
        const decl = U.parent(v);
        const owner = decl && U.parent(decl);
        if (owner && owner.type === 'RangeForStmt') continue;
        // Exception of the rule: a class with a std::initializer_list
        // constructor, where braces would call that constructor instead
        // (std::vector<int> v(3, 0); std::string s(n, ' ');)
        if (v.initStyle === 'paren' && hasInitListCtor(ts, v)) continue;
        api.report(U.at(v), M(`'${v.name}' is initialized with ${v.initStyle === 'paren' ? 'parentheses' : 'an equals sign'} instead of braces.`, `'${v.name}' 을(를) 중괄호 대신 ${v.initStyle === 'paren' ? '괄호' : '등호'}로 초기화합니다.`));
      }
    },
  }),
  A({
    id: 'A8-5-3', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'MAJOR', debt: 2,
    name: ['A variable of type auto shall not be initialized using {} or ={} braced-initialization', 'auto 변수를 {} 나 ={} 중괄호 초기화로 초기화하면 안 됩니다'],
    why: ['auto with braces may deduce std::initializer_list instead of the element type.', '중괄호와 함께 쓴 auto 는 원소 형식 대신 std::initializer_list 로 추론될 수 있습니다.'],
    fix: ['Use auto x = value; or spell the type.', 'auto x = value; 로 쓰거나 형식을 명시하세요.'],
    check(unit, api) {
      for (const v of U.ix(unit).get('VarDecl')) {
        const ts = v.specs && v.specs.typeSpec;
        if (!ts || ts.type !== 'AutoType' || !v.init) continue;
        if (v.initStyle === 'brace' || v.init.type === 'InitList') api.report(U.at(v), M(`The auto variable '${v.name}' is initialized with braces.`, `auto 변수 '${v.name}' 을(를) 중괄호로 초기화합니다.`));
      }
    },
  }),
  D('A8-5-4', ['15.1.5'], { cat: 'Advisory' }),
  // ------------------------------------------------------- MISRA C++:2008 M8
  A({
    id: 'M8-0-1', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 2,
    name: ['An init-declarator-list or a member-declarator-list shall consist of a single declarator', '선언자 목록에는 선언자가 하나만 있어야 합니다'],
    why: ['Several declarators in one declaration (int* a, b;) are easily misread.', '한 선언에 선언자가 여럿 있으면(int* a, b;) 잘못 읽기 쉽습니다.'],
    fix: ['Declare each entity in its own declaration.', '개체마다 따로 선언하세요.'],
    check(unit, api) {
      for (const d of U.ix(unit).get('Declaration')) {
        if (d.declarators.length > 1 && !d.loc.macro) api.report(U.at(d.declarators[1]), M(`This declaration declares ${d.declarators.length} entities.`, `이 선언은 개체 ${d.declarators.length}개를 선언합니다.`));
      }
    },
  }),
  D('M8-3-1', ['13.3.2']),
  D('M8-4-2', ['13.3.3']),
  A({
    id: 'M8-4-4', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 2,
    name: ['A function identifier shall either be used to call the function or be preceded by &', '함수 식별자는 함수를 호출하거나 & 를 붙여서만 써야 합니다'],
    why: ['A bare function name used as a value (if (f)) is usually a forgotten call.', '값으로 쓴 함수 이름(if (f))은 대개 호출을 빠뜨린 것입니다.'],
    fix: ['Call the function, or take its address explicitly with &.', '함수를 호출하거나 & 로 주소를 명시적으로 얻으세요.'],
    check(unit, api) {
      for (const id of U.ix(unit).get('Identifier')) {
        const s = id.symbol;
        if (!s || s.kind !== 'function' || id.implicitThis) continue;
        const { p, key } = U.upParens(id);
        if (!p) continue;
        if (p.type === 'CallExpr' && key === 'callee') continue;
        if (p.type === 'UnaryExpr' && p.op === '&') continue;
        if (p.type === 'DecltypeType' || p.type === 'SizeofExpr' || p.type === 'UsingDecl') continue;
        api.report(id, M(`The function '${id.name}' is used without a call or '&'.`, `함수 '${id.name}' 을(를) 호출이나 '&' 없이 씁니다.`));
      }
    },
  }),
  A({
    id: 'M8-5-2', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 2,
    name: ['Braces shall be used to indicate and match the structure in the non-zero initialization of arrays and structures', '배열과 구조체의 0 이 아닌 초기화에서는 중괄호로 구조를 나타내고 맞춰야 합니다'],
    why: ['A flat initializer list for nested aggregates hides which element gets which value.', '중첩된 집합체에 평평한 초기값 목록을 쓰면 어느 원소가 어떤 값을 받는지 가려집니다.'],
    fix: ['Add inner braces for each sub-aggregate.', '하위 집합체마다 안쪽 중괄호를 쓰세요.'],
    check(unit, api) {
      for (const v of U.ix(unit).get('VarDecl', 'FieldDecl')) {
        if (!v.init || v.init.type !== 'InitList' || !v.ctype) continue;
        const items = v.init.items;
        if (items.length <= 1) continue; // {0} / {} zero-initialisation
        const t = U.canon(v.ctype);
        let sub = null;
        if (t.kind === 'array') sub = U.canon(t.of);
        else if (t.kind === 'record' && t.fields && t.fields.length) sub = U.canon(t.fields[0].type);
        if (!sub || (sub.kind !== 'array' && sub.kind !== 'record')) continue;
        if (items.some((x) => x.type !== 'InitList' && x.type !== 'DesignatedInit' && !(x.ctype && U.canon(x.ctype).kind === 'record'))) api.report(U.at(v), M(`The initializer of '${v.name}' does not use braces for its nested aggregates.`, `'${v.name}' 의 초기값이 중첩 집합체에 중괄호를 쓰지 않습니다.`));
      }
    },
  }),
];

function specialMove(fn) {
  const rec = fn.qualifier || cf.enclosing(fn, 'RecordDecl');
  if (!rec) return false;
  return fn.name === 'operator=';
}
