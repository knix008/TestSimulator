'use strict';

// AUTOSAR C++14 chapter 0 — language independent issues (unused code,
// dead code, floating point) and MISRA C++:2008 M0 rules.

const { A, M } = require('../lib/meta');
const { D } = require('../lib/delegate');
const U = require('../lib/util');
const { cf } = U;

// Expression statements whose value is computed and thrown away with no effect.
function noEffect(e) {
  e = U.strip(e);
  if (!e) return false;
  if (U.hasSideEffects(e)) return false;
  if (e.type === 'CastExpr' && e.kind !== 'functional' && U.canon(e.ctype || U.T.T.unknown).kind === 'void') return false; // (void)x
  if (e.type === 'Identifier' || e.type === 'BinaryExpr' || e.type === 'UnaryExpr' || e.type === 'IntegerLiteral' || e.type === 'FloatingLiteral'
    || e.type === 'MemberExpr' || e.type === 'IndexExpr' || e.type === 'ConditionalExpr' || e.type === 'BoolLiteral') {
    // operator calls on class types may have effects
    if (e.type === 'BinaryExpr' && (U.recordOf(e.left && e.left.ctype) || U.unknownT(e.left && e.left.ctype))) return false;
    if (e.type === 'Identifier' && (!e.symbol || e.symbol.kind === 'function')) return false;
    return true;
  }
  return false;
}

// Writes to anything other than the function's own local objects.
function externalEffects(fn) {
  const locals = new Set();
  cf.walk(fn.body, (n) => {
    if (n.type === 'VarDecl' && n.symbol && n.symbol.storage === 'automatic' && U.canon(n.symbol.type).kind !== 'reference') locals.add(n.symbol);
    return undefined;
  });
  let effect = false;
  cf.walk(fn.body, (n) => {
    if (effect) return cf.walk.STOP;
    if (['CallExpr', 'NewExpr', 'DeleteExpr', 'ThrowExpr', 'AsmStmt', 'StmtExpr', 'LambdaExpr'].includes(n.type)) { effect = true; return undefined; }
    if (n.type === 'ReturnStmt' && n.arg) { effect = true; return undefined; }
    let target = null;
    if (n.type === 'AssignExpr') target = n.left;
    else if (n.type === 'UnaryExpr' && (n.op === '++' || n.op === '--')) target = n.arg;
    if (target) {
      const t = U.strip(target);
      if (!(t && t.type === 'Identifier' && t.symbol && locals.has(t.symbol))) effect = true;
    }
    if (n.type === 'Identifier' && n.ctype && U.canon(n.ctype).volatile) effect = true;
    return undefined;
  });
  return effect;
}

module.exports = [
  D('M0-1-1', ['0.0.1']),
  D('M0-1-2', ['0.0.2']),
  D('M0-1-3', ['0.2.1']),
  A({
    id: 'M0-1-8', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 10,
    name: ['A void function shall have an external side effect', 'void 함수는 외부에 영향을 주는 동작이 있어야 합니다'],
    why: ['A function that returns nothing and changes nothing outside itself does no useful work; it is usually unfinished or wrong.', '아무것도 반환하지 않고 바깥을 바꾸지도 않는 함수는 쓸모 있는 일을 하지 않으며, 대개 미완성이거나 잘못된 코드입니다.'],
    fix: ['Remove the function, or make it return or store its result.', '함수를 지우거나 결과를 반환하거나 저장하게 하세요.'],
    check(unit, api) {
      for (const f of U.fnDefs(unit)) {
        if (f.isConstructor || f.isDestructor || f.isPure || !f.body || f.body.type !== 'CompoundStmt') continue;
        const ft = f.ctype ? U.canon(f.ctype) : null;
        if (!ft || ft.kind !== 'function' || U.canon(ft.ret).kind !== 'void') continue;
        if (!f.body.body.length) continue; // empty stubs are reported by other rules (and may be overrides)
        if (U.isVirtualDecl(f) || f.isOverride || f.isFinal) continue;
        if ((f.params || []).some((p) => p.ctype && ['pointer', 'reference'].includes(U.canon(p.ctype).kind))) continue;
        if (!externalEffects(f)) api.report(U.at(f), M(`The void function '${f.name}' has no external side effect.`, `void 함수 '${f.name}' 에는 외부에 영향을 주는 동작이 없습니다.`));
      }
    },
  }),
  A({
    id: 'M0-1-9', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5, cwe: 'CWE-561',
    name: ['There shall be no dead code', '죽은 코드가 없어야 합니다'],
    why: ['An expression statement whose value is discarded and which has no side effect can be removed without changing behaviour; it often hides a typo such as == for =.', '값을 버리고 부작용도 없는 식 문장은 지워도 동작이 같으며, = 대신 == 를 쓴 실수 같은 오류를 숨기는 경우가 많습니다.'],
    fix: ['Remove the statement or write the intended operation.', '문장을 지우거나 의도한 연산을 쓰세요.'],
    check(unit, api) {
      for (const s of U.ix(unit).get('ExprStmt')) {
        if (s.expr && noEffect(s.expr)) api.report(s, M('This expression statement has no effect.', '이 식 문장은 아무 효과가 없습니다.'));
      }
    },
  }),
  A({
    id: 'M0-1-10', cat: 'Advisory', enf: 'automated', sev: 'MINOR', debt: 5, cwe: 'CWE-561',
    name: ['Every defined function should be called at least once', '정의한 모든 함수는 한 번 이상 호출해야 합니다'],
    why: ['A function that is never called is dead code that still has to be reviewed and maintained.', '호출되지 않는 함수는 검토와 유지보수만 필요한 죽은 코드입니다.'],
    fix: ['Remove the function or call it where it is needed.', '함수를 지우거나 필요한 곳에서 호출하세요.'],
    project(project, api) {
      const used = new Set();
      for (const u of project.units) {
        const { syms, qnames } = U.usedSyms(u);
        for (const s of syms) if (s.qname) used.add(s.qname);
        for (const q of qnames) used.add(q);
      }
      const seen = new Set();
      for (const u of project.units) {
        if (u.lang !== 'cpp') continue;
        for (const f of U.ix(u).funcs) {
          if (!f.symbol || f.symbol.linkage !== 'external' || f.isDefault || f.isDeleted) continue;
          if (U.isMain(f) || f.isConstructor || f.isDestructor || f.isOperator || f.isConversion || f.qualifier) continue;
          if (cf.enclosing(f, 'RecordDecl') || U.inTemplate(f) || U.isVirtualDecl(f) || f.isOverride) continue;
          const q = f.symbol.qname || f.name;
          if (used.has(q) || seen.has(q)) continue;
          seen.add(q);
          api.report({ ...U.at(f), file: f.loc.file }, M(`The function '${f.name}' is defined but never called.`, `함수 '${f.name}' 이(가) 정의되었지만 호출되지 않습니다.`));
        }
      }
    },
  }),
  D('A0-1-1', ['0.1.1']),
  D('A0-1-2', ['0.1.2', '28.6.4']),
  D('A0-1-3', ['0.2.4']),
  D('A0-1-4', ['0.2.2']),
  D('A0-1-6', ['0.2.3'], { cat: 'Advisory' }),
  A({
    id: 'A0-4-2', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 5,
    name: ['Type long double shall not be used', 'long double 형식은 쓰면 안 됩니다'],
    why: ['The size, precision and representation of long double differ widely between compilers and targets.', 'long double 의 크기, 정밀도, 표현은 컴파일러와 대상마다 크게 다릅니다.'],
    fix: ['Use double (or a documented fixed-precision type).', 'double(또는 정밀도가 문서화된 형식)을 쓰세요.'],
    check(unit, api) {
      for (const b of U.ix(unit).get('BuiltinType')) {
        if (b.names.includes('long') && b.names.includes('double')) api.report(b, M("The type 'long double' is used.", "'long double' 형식을 씁니다."));
      }
      for (const l of U.ix(unit).get('FloatingLiteral')) {
        if (/l/i.test(l.suffix || '')) api.report(l, M(`The literal '${l.raw}' has type long double.`, `리터럴 '${l.raw}' 은(는) long double 형식입니다.`));
      }
    },
  }),
  D('A0-4-4', ['dir-0.3.2'], { cat: 'Required', enf: 'partially automated',
    name: ['Range, domain and pole errors shall be checked when using math functions', '수학 함수를 쓸 때는 범위, 정의역, 극점 오류를 확인해야 합니다'],
    why: ['Math functions such as sqrt, log or pow have arguments for which the result is undefined or not representable.', 'sqrt, log, pow 같은 수학 함수에는 결과가 정의되지 않거나 표현할 수 없는 인자가 있습니다.'],
    fix: ['Validate arguments before the call, or check errno / floating-point exceptions afterwards.', '호출 전에 인자를 검사하거나, 호출 뒤에 errno 나 부동소수점 예외를 확인하세요.'] }),
];
