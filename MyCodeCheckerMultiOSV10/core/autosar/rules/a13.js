'use strict';

// AUTOSAR C++14 chapter 13 — overloading (user-defined literals, operator
// return types, forwarding-reference overloads, conversions, digit separators).

const { A, M } = require('../lib/meta');
const { D } = require('../lib/delegate');
const U = require('../lib/util');
const { cf } = U;

const ASSIGN_OPS = /^operator(=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|<<=|>>=)$/;
const ARITH_BIN = new Set(['+', '-', '*', '/', '%', '&', '|', '^', '<<', '>>']);
const REL = new Set(['==', '!=', '<', '>', '<=', '>=']);

const retOf = (f) => { const t = f.ctype ? U.canon(f.ctype) : null; return t && t.kind === 'function' ? t.ret : null; };
const opName = (f) => (/^operator\s*(.+)$/.exec(f.name || '') || [])[1] || '';
const isMemberFn = (f) => !!(cf.enclosing(f, 'RecordDecl') || f.qualifier);
// Number of operands of an operator function (members count the object).
const arity = (f) => U.paramCount(f) + (isMemberFn(f) && !U.hasStorage(f, 'static') && !U.hasFnSpec(f, 'friend') ? 1 : 0);

function forwardingParams(td) {
  const names = new Set((td.params || []).filter((p) => p.kind === 'type' && p.name).map((p) => p.name));
  const d = td.decl;
  if (!d || d.type !== 'Declaration' || d.declarators.length !== 1 || d.declarators[0].type !== 'FunctionDecl') return null;
  const f = d.declarators[0];
  const p = (f.params || []).find((x) => {
    const ts = x.specs && x.specs.typeSpec;
    return ts && ts.type === 'NamedType' && names.has(ts.name) && !(x.specs.qualifiers || []).length && x.declarator && x.declarator.type === 'ReferenceDeclarator' && x.declarator.rvalue;
  });
  return p ? { f, p } : null;
}

function separatorProblem(raw, base) {
  if (!raw.includes("'")) return null;
  let body = raw;
  let group = 3;
  if (base === 16) { body = raw.slice(2); group = 2; } else if (base === 2) { body = raw.slice(2); group = 4; } else if (base === 8) return 'octal';
  body = body.replace(base === 16 ? /[uUlLzZ]+$/ : /[uUlLzZfF]+$/, '');
  const intPart = base === 10 ? body.split(/[.eE]/)[0] : body;
  const groups = intPart.split("'");
  if (groups[0].length === 0 || groups[0].length > group) return group;
  for (let i = 1; i < groups.length; i++) if (groups[i].length !== group) return group;
  if (base === 10 && /[.]/.test(body)) {
    const frac = body.split('.')[1].split(/[eE]/)[0];
    const fg = frac.split("'");
    for (let i = 0; i < fg.length - 1; i++) if (fg[i].length !== group) return group;
  }
  return null;
}

module.exports = [
  A({
    id: 'A13-1-2', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 2,
    name: ['User-defined suffixes of literal operators shall start with an underscore followed by one or more letters', '사용자 정의 리터럴 접미사는 밑줄 다음에 하나 이상의 문자로 시작해야 합니다'],
    why: ['Suffixes without an underscore are reserved for the standard library; digits or a second underscore confuse readers.', '밑줄 없는 접미사는 표준 라이브러리용으로 예약되어 있고, 숫자나 두 번째 밑줄은 읽는 사람을 혼란스럽게 합니다.'],
    fix: ['Name the suffix _letters, e.g. _km.', '접미사를 _문자 형태로 지으세요(예: _km).'],
    check(unit, api) {
      for (const f of U.ix(unit).get('FunctionDecl')) {
        const m = /^operator\s*""\s*(\w+)$/.exec(f.name || '');
        if (m && !/^_[A-Za-z]+$/.test(m[1])) api.report(U.at(f), M(`The literal suffix '${m[1]}' does not consist of an underscore followed by letters.`, `리터럴 접미사 '${m[1]}' 이(가) 밑줄 다음 문자로 이루어지지 않았습니다.`));
      }
    },
  }),
  A({
    id: 'A13-2-1', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['An assignment operator shall return a reference to "this"', '대입 연산자는 "this" 에 대한 참조를 반환해야 합니다'],
    why: ['Returning *this by reference matches the built-in operators and allows chaining like a = b = c.', '*this 를 참조로 반환해야 내장 연산자와 같게 동작하고 a = b = c 같은 연결이 됩니다.'],
    fix: ['Declare the return type as T& and end with return *this;.', '반환 형식을 T& 로 선언하고 return *this; 로 끝내세요.'],
    check(unit, api) {
      for (const f of U.ix(unit).get('FunctionDecl')) {
        if (!ASSIGN_OPS.test(f.name || '') || !isMemberFn(f) || f.isDeleted) continue;
        const r = retOf(f);
        const c = r ? U.canon(r) : null;
        const okType = c && c.kind === 'reference' && !c.rvalue && !U.canon(c.to).const && (U.canon(c.to).kind === 'record' || U.unknownT(c.to));
        if (!okType) { api.report(U.at(f), M(`'${f.name}' does not return a non-const reference to its class.`, `'${f.name}' 이(가) 자기 클래스의 비 const 참조를 반환하지 않습니다.`)); continue; }
        if (!f.body || f.isDefault) continue;
        cf.walk(f.body, (n) => {
          if (n.type === 'LambdaExpr' || n.type === 'RecordDecl') return cf.walk.SKIP;
          if (n.type !== 'ReturnStmt') return undefined;
          const e = U.strip(n.arg);
          const ok = e && e.type === 'UnaryExpr' && e.op === '*' && U.strip(e.arg) && U.strip(e.arg).type === 'ThisExpr';
          if (!ok) api.report(n, M(`'${f.name}' returns something other than *this.`, `'${f.name}' 이(가) *this 가 아닌 것을 반환합니다.`));
          return undefined;
        });
      }
    },
  }),
  A({
    id: 'A13-2-2', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['A binary arithmetic or bitwise operator shall return a prvalue', '이항 산술/비트 연산자는 prvalue(값)를 반환해야 합니다'],
    why: ['a + b creates a new value; returning a reference leads to dangling references or surprising aliasing.', 'a + b 는 새 값을 만들며, 참조를 반환하면 댕글링 참조나 뜻밖의 별칭이 생깁니다.'],
    fix: ['Return the result by value.', '결과를 값으로 반환하세요.'],
    check(unit, api) {
      for (const f of U.ix(unit).get('FunctionDecl')) {
        if (!f.isOperator || f.isConversion || !ARITH_BIN.has(opName(f)) || arity(f) !== 2) continue;
        const r = retOf(f);
        if (!r || U.canon(r).kind !== 'reference') continue;
        if ((opName(f) === '<<' || opName(f) === '>>') && !isMemberFn(f)) continue; // stream insertion / extraction
        api.report(U.at(f), M(`The binary operator '${f.name}' returns a reference instead of a value.`, `이항 연산자 '${f.name}' 이(가) 값 대신 참조를 반환합니다.`));
      }
    },
  }),
  A({
    id: 'A13-2-3', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 2,
    name: ['A relational operator shall return a boolean value', '관계 연산자는 bool 값을 반환해야 합니다'],
    why: ['Callers use comparison results in conditions; a non-bool result relies on implicit conversions.', '호출자는 비교 결과를 조건에 쓰므로 bool 이 아닌 결과는 암시적 변환에 기대게 됩니다.'],
    fix: ['Declare the operator to return bool.', '연산자가 bool 을 반환하도록 선언하세요.'],
    check(unit, api) {
      for (const f of U.ix(unit).get('FunctionDecl')) {
        if (!f.isOperator || !REL.has(opName(f))) continue;
        const r = retOf(f);
        const c = r ? U.nonRef(r) : null;
        if (c && !(c.kind === 'int' && c.name === 'bool') && !U.unknownT(c)) api.report(U.at(f), M(`The relational operator '${f.name}' returns '${U.tstr(r)}' instead of bool.`, `관계 연산자 '${f.name}' 이(가) bool 대신 '${U.tstr(r)}' 를 반환합니다.`));
      }
    },
  }),
  A({
    id: 'A13-3-1', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 10,
    name: ['A function that contains a forwarding reference as its argument shall not be overloaded', '전달 참조를 인자로 받는 함수는 오버로드하면 안 됩니다'],
    why: ['A forwarding-reference template is a better match for almost every argument, so the other overloads are rarely chosen.', '전달 참조 템플릿은 거의 모든 인자에 더 잘 맞으므로 다른 오버로드가 좀처럼 선택되지 않습니다.'],
    fix: ['Rename one of the functions or constrain the template.', '함수 중 하나의 이름을 바꾸거나 템플릿에 제약을 두세요.'],
    check(unit, api) {
      for (const td of U.ix(unit).get('TemplateDecl')) {
        const fw = forwardingParams(td);
        if (!fw || fw.f.isConstructor) continue;
        const parent = U.parent(td);
        const list = parent ? (parent.decls || parent.members || parent.body || []) : [];
        const others = [];
        for (const d of list) {
          const decl = d.type === 'TemplateDecl' ? d.decl : d;
          if (d === td || !decl || decl.type !== 'Declaration') continue;
          for (const x of decl.declarators) if (x.type === 'FunctionDecl' && x.name === fw.f.name) others.push(x);
        }
        if (others.length) api.report(U.at(fw.f), M(`'${fw.f.name}' takes a forwarding reference and is also overloaded.`, `'${fw.f.name}' 은(는) 전달 참조를 받으면서 오버로드도 됩니다.`));
      }
    },
  }),
  A({
    id: 'A13-5-1', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 5,
    name: ['If operator[] is overloaded with a non-const version, a const version shall also be implemented', 'operator[] 를 비 const 로 오버로드하면 const 버전도 구현해야 합니다'],
    why: ['Without a const operator[], const objects of the class cannot be indexed.', 'const operator[] 가 없으면 그 클래스의 const 객체에 첨자를 쓸 수 없습니다.'],
    fix: ['Add a const overload returning a const reference.', 'const 참조를 반환하는 const 오버로드를 추가하세요.'],
    check(unit, api) {
      for (const rd of U.ix(unit).records) {
        if (!rd.ctype) continue;
        const subs = U.methods(U.canon(rd.ctype)).filter((m) => m.node.name === 'operator[]');
        const nonConst = subs.find((m) => !U.isConstMethod(m.node));
        if (nonConst && !subs.some((m) => U.isConstMethod(m.node))) api.report(U.at(nonConst.node), M(`'${rd.name}' has a non-const operator[] but no const one.`, `'${rd.name}' 에 비 const operator[] 만 있고 const 버전이 없습니다.`));
      }
    },
  }),
  A({
    id: 'A13-5-2', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 2,
    name: ['All user-defined conversion operators shall be defined explicit', '모든 사용자 정의 변환 연산자는 explicit 로 정의해야 합니다'],
    why: ['Implicit conversions are applied silently and can select unexpected overloads.', '암시적 변환은 조용히 적용되어 예상하지 못한 오버로드를 고를 수 있습니다.'],
    fix: ['Add explicit to the conversion operator.', '변환 연산자에 explicit 를 붙이세요.'],
    check(unit, api) {
      for (const f of U.ix(unit).get('FunctionDecl')) if (f.isConversion && !U.hasFnSpec(f, 'explicit') && !f.qualifier) api.report(U.at(f), M(`The conversion operator '${f.name}' is not explicit.`, `변환 연산자 '${f.name}' 이(가) explicit 가 아닙니다.`));
    },
  }),
  A({
    id: 'A13-5-3', cat: 'Advisory', enf: 'automated', sev: 'MINOR', debt: 5,
    name: ['User-defined conversion operators should not be used', '사용자 정의 변환 연산자는 쓰지 않아야 합니다'],
    why: ['Conversion operators make it hard to see which function is called; named functions are clearer.', '변환 연산자는 어떤 함수가 호출되는지 보기 어렵게 하며, 이름 있는 함수가 더 분명합니다.'],
    fix: ['Replace the conversion operator with a named member function such as toInt().', '변환 연산자를 toInt() 같은 이름 있는 멤버 함수로 바꾸세요.'],
    check(unit, api) {
      for (const f of U.ix(unit).get('FunctionDecl')) if (f.isConversion && !f.qualifier) api.report(U.at(f), M(`The user-defined conversion operator '${f.name}' is declared.`, `사용자 정의 변환 연산자 '${f.name}' 을(를) 선언했습니다.`));
    },
  }),
  D('A13-5-5', ['16.6.1'], { name: ['Comparison operators shall be non-member functions with identical parameter types', '비교 연산자는 매개변수 형식이 같은 비멤버 함수여야 합니다'] }),
  A({
    id: 'A13-6-1', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 1,
    name: ["Digit separators ' shall group decimal digits by 3, hexadecimal by 2 and binary by 4", "숫자 구분자 ' 는 10진수 3자리, 16진수 2자리, 2진수 4자리마다 써야 합니다"],
    why: ['Irregular groups make large constants harder, not easier, to read.', '불규칙한 묶음은 큰 상수를 읽기 쉽게 하기는커녕 더 어렵게 만듭니다.'],
    fix: ["Regroup the digits, e.g. 1'000'000, 0xFF'FF, 0b1010'1010.", "숫자를 다시 묶으세요(예: 1'000'000, 0xFF'FF, 0b1010'1010)."],
    check(unit, api) {
      for (const l of U.ix(unit).get('IntegerLiteral', 'FloatingLiteral')) {
        const raw = String(l.raw || '');
        const base = l.base || (/^0[xX]/.test(raw) ? 16 : /^0[bB]/.test(raw) ? 2 : 10);
        const g = separatorProblem(raw, l.type === 'FloatingLiteral' ? 10 : base);
        if (g) api.report(l, M(`The digit separators in '${raw}' are not placed every ${g === 'octal' ? 'n/a' : g} digits.`, `'${raw}' 의 숫자 구분자가 ${g === 'octal' ? '규칙에 맞게' : `${g}자리마다`} 놓이지 않았습니다.`));
      }
    },
  }),
];
