'use strict';

// MISRA C++:2023 chapter 0 — language-independent issues.

const { R, M } = require('../lib/meta');
const U = require('../lib/util');
const F = require('../lib/flow');
const { cf } = U;

const nm = (s) => (s && s.name) || '?';

function invariantCompare(e, unit) {
  e = U.strip(e);
  if (!e || e.type !== 'BinaryExpr' || !['<', '<=', '>', '>=', '==', '!='].includes(e.op)) return null;
  const sides = [[e.left, e.right, false], [e.right, e.left, true]];
  for (const [v, k, swapped] of sides) {
    const kc = U.constInt(k, unit);
    if (!kc || U.constInt(v, unit)) continue;
    const vs = U.strip(v);
    const t = vs && vs.ctype;
    if (!t || U.canon(t).kind !== 'int' || U.canon(t).name === 'bool') continue;
    let range;
    try { range = U.T.intRange(U.nonRef(t), unit.target); } catch (err) { continue; }
    if (!range) continue;
    let op = e.op;
    if (swapped) op = { '<': '>', '<=': '>=', '>': '<', '>=': '<=' }[op] || op;
    const K = kc.value;
    const { min, max } = range;
    let always = null;
    if (op === '<') always = max < K ? true : min >= K ? false : null;
    else if (op === '<=') always = max <= K ? true : min > K ? false : null;
    else if (op === '>') always = min > K ? true : max <= K ? false : null;
    else if (op === '>=') always = min >= K ? true : max < K ? false : null;
    else if (op === '==') always = K < min || K > max ? false : null;
    else if (op === '!=') always = K < min || K > max ? true : null;
    if (always !== null) return always;
  }
  return null;
}

function controlling(unit) {
  const x = U.ix(unit);
  const out = [];
  for (const s of x.get('IfStmt')) if (!s.constexpr && !s.consteval && s.cond && s.cond.type !== 'Declaration') out.push({ e: s.cond, stmt: s, kind: 'if' });
  for (const s of x.get('WhileStmt')) if (s.cond && s.cond.type !== 'Declaration') out.push({ e: s.cond, stmt: s, kind: 'while' });
  for (const s of x.get('DoStmt')) if (s.cond) out.push({ e: s.cond, stmt: s, kind: 'do' });
  for (const s of x.get('ForStmt')) if (s.cond && s.cond.type !== 'Declaration') out.push({ e: s.cond, stmt: s, kind: 'for' });
  for (const s of x.get('ConditionalExpr')) if (s.test) out.push({ e: s.test, stmt: s, kind: '?:' });
  return out;
}

const literalBool = (e, v) => {
  e = U.strip(e);
  if (!e) return false;
  if (e.type === 'BoolLiteral') return e.value === v;
  if (e.type === 'IntegerLiteral') return (e.value !== 0n) === v;
  return false;
};

// pieces of a condition split at && || !
function condParts(e, out = []) {
  e = U.strip(e);
  if (!e) return out;
  if (e.type === 'BinaryExpr' && (e.op === '&&' || e.op === '||')) { condParts(e.left, out); condParts(e.right, out); return out; }
  if (e.type === 'UnaryExpr' && e.op === '!') return condParts(e.arg, out);
  out.push(e);
  return out;
}

const LOG_FNS = new Set(['log', 'log10', 'log2', 'logf', 'logl', 'log10f', 'log2f']);
const SQRT_FNS = new Set(['sqrt', 'sqrtf', 'sqrtl']);
// Library functions and the (0-based) pointer arguments that must not be null.
// Other arguments are not pointers (memset's fill value, a size) or may be
// null by contract (strtol's end pointer, snprintf's buffer with size 0).
const NONNULL_ARGS = new Map([
  ['strlen', [0]], ['strcpy', [0, 1]], ['strncpy', [0, 1]], ['strcat', [0, 1]], ['strncat', [0, 1]], ['strcmp', [0, 1]],
  ['strncmp', [0, 1]], ['strchr', [0]], ['strrchr', [0]], ['strstr', [0, 1]], ['memcpy', [0, 1]], ['memmove', [0, 1]],
  ['memset', [0]], ['memcmp', [0, 1]], ['fopen', [0, 1]], ['fclose', [0]], ['fputs', [0, 1]], ['fgets', [0, 2]], ['puts', [0]],
  ['atoi', [0]], ['atol', [0]], ['atof', [0]], ['strtol', [0]], ['strtoul', [0]], ['strtod', [0]], ['printf', [0]],
  ['sprintf', [0, 1]], ['snprintf', [2]], ['fprintf', [0, 1]], ['qsort', [3]], ['bsearch', [0, 4]],
]);
const NONNULL_FNS = new Set(NONNULL_ARGS.keys());
const PRECOND_FNS = new Set([...NONNULL_FNS, 'log', 'log10', 'log2', 'logf', 'logl', 'log10f', 'log2f', 'sqrt', 'sqrtf', 'sqrtl',
  'isalnum', 'isalpha', 'isblank', 'iscntrl', 'isdigit', 'isgraph', 'islower', 'isprint', 'ispunct', 'isspace', 'isupper', 'isxdigit', 'tolower', 'toupper']);
const CTYPE_FNS = new Set(['isalnum', 'isalpha', 'isblank', 'iscntrl', 'isdigit', 'isgraph', 'islower', 'isprint', 'ispunct', 'isspace', 'isupper', 'isxdigit', 'tolower', 'toupper']);

// Variables 0.2.1 looks at: [{ v, used }]. headerScope: only the
// namespace-scope variables declared in headers (else: everything else).
function unusedVarCandidates(unit, headerScope) {
  const out = [];
  const used = U.usedSyms(unit).syms;
  for (const v of U.ix(unit).get('VarDecl')) {
    const s = v.symbol;
    if (!s || s.predefined) continue;
    if (!v.name || v.name.startsWith('__')) continue;
    const local = s.storage === 'automatic' || (s.scope && (s.scope.kind === 'function' || s.scope.kind === 'block'));
    if (!local && s.linkage !== 'internal') continue;
    if ((!local && U.isHeaderFile(v.loc.file)) !== headerScope) continue;
    if (U.attrNames(v).includes('maybe_unused')) continue;
    const t = U.canon(v.ctype);
    if (t.kind === 'record') {
      const hasCtorDtor = U.methods(t).some((m) => m.node.isConstructor || m.node.isDestructor);
      if (hasCtorDtor || U.bases(t).length) continue;
    }
    if (U.unknownT(v.ctype) && !(v.specs && v.specs.typeSpec && v.specs.typeSpec.type === 'AutoType')) continue;
    out.push({ v, used: used.has(s) || s.uses.length > 0 });
  }
  return out;
}
const reportUnusedVar = (api, v) => api.report(v.nameLoc ? { ...v.nameLoc, file: v.loc.file } : v, M(`Variable '${v.name}' is never used.`, `변수 '${v.name}' 이(가) 한 번도 사용되지 않습니다.`));

const isNullLit = (e, unit) => {
  e = U.strip(e);
  if (!e) return false;
  if (e.type === 'NullptrLiteral') return true;
  if (e.type === 'IntegerLiteral' && e.value === 0n) return true;
  if (e.type === 'CastExpr' && e.arg) return isNullLit(e.arg, unit) && U.canon(e.ctype).kind === 'pointer';
  return false;
};

module.exports = [
  R({
    id: '0.0.1', cat: 'Required', dec: true, autosar: 'M0-1-1', cwe: 'CWE-561', sev: 'MAJOR', debt: 10,
    name: ['A function shall not contain unreachable statements', '함수에 도달할 수 없는 문장이 있으면 안 됩니다'],
    why: ['Code that can never run is dead weight: it confuses readers, hides logic errors and cannot be tested.', '실행될 수 없는 코드는 읽는 사람을 혼란스럽게 하고 논리 오류를 숨기며 시험할 수도 없습니다.'],
    fix: ['Delete the unreachable statements or fix the control flow that skips them.', '도달할 수 없는 문장을 지우거나 그 문장을 건너뛰게 만드는 제어 흐름을 고치세요.'],
    check(unit, api) {
      for (const fn of F.bodies(unit)) {
        const g = F.cfgOf(fn);
        if (!g) continue;
        for (const { block, nodes } of g.unreachable()) {
          const n = (nodes || []).find((x) => U.user(x) && x.type !== 'NullStmt') || (block.terminator && block.terminator.node);
          if (!n || !U.user(n)) continue;
          if (U.fnOf(n) !== fn && !(fn.type === 'FunctionDecl' && U.fnOf(n) === null)) continue;
          api.report(n, M(`This statement can never be executed (line ${n.loc.line}).`, `이 문장(${n.loc.line}행)은 결코 실행되지 않습니다.`));
        }
      }
    },
  }),
  R({
    id: '0.0.2', cat: 'Advisory', dec: false, autosar: 'M0-1-2', cwe: 'CWE-570', sev: 'MINOR', debt: 10,
    name: ['Controlling expressions should not be invariant', '제어식은 항상 같은 값이 되면 안 됩니다'],
    why: ['A condition that is always true or always false usually signals a logic error or leftover debugging code.', '항상 참이거나 항상 거짓인 조건은 대개 논리 오류나 남겨진 디버깅 코드를 뜻합니다.'],
    fix: ['Remove the condition or correct it so that it depends on run-time state.', '조건을 없애거나 실행 시 상태에 따라 달라지도록 고치세요.'],
    check(unit, api) {
      for (const { e, kind, stmt } of controlling(unit)) {
        if ((kind === 'while' || kind === 'for') && literalBool(e, true)) continue; // infinite loop idiom
        if (kind === 'do' && literalBool(e, false)) continue; // do { } while (false)
        // `STATUS(CID_X, OK)` expanding to `((st) == OK ? (st) : ...)` with constant
        // arguments: the macro computes a constant, there is no run-time choice
        if (kind === '?:' && stmt.loc && stmt.loc.macro && U.constAny(stmt, unit)) continue;
        const c = U.constInt(e, unit);
        if (c) {
          api.report(e, M(`The ${kind} condition is always ${c.value !== 0n ? 'true' : 'false'}.`, `${kind} 조건이 항상 ${c.value !== 0n ? '참' : '거짓'}입니다.`));
          continue;
        }
        for (const p of condParts(e)) {
          const pc = U.constInt(p, unit);
          const inv = pc ? pc.value !== 0n : invariantCompare(p, unit);
          if (inv === null || inv === undefined) continue;
          api.report(p, M(`Part of the ${kind} condition is always ${inv ? 'true' : 'false'}: '${cf.sourceText(unit, p) || '?'}'.`, `${kind} 조건의 일부 '${cf.sourceText(unit, p) || '?'}' 가 항상 ${inv ? '참' : '거짓'}입니다.`));
        }
      }
    },
  }),
  R({
    id: '0.1.1', cat: 'Advisory', dec: false, autosar: 'A0-1-1', cwe: 'CWE-563', sev: 'MINOR', debt: 5,
    name: ['A value should not be unnecessarily written to a local object', '지역 객체에 쓸데없이 값을 써넣지 않아야 합니다'],
    why: ['A value that is overwritten or goes out of scope before it is read is wasted work and often points at a bug.', '읽히기 전에 덮어쓰이거나 범위를 벗어나는 값은 낭비이며 흔히 버그를 뜻합니다.'],
    fix: ['Remove the useless write or use the value it computes.', '쓸모없는 대입을 지우거나 계산한 값을 사용하세요.'],
    check(unit, api) {
      for (const fn of F.bodies(unit)) {
        for (const d of F.deadStores(fn)) {
          if (!U.user(d.node)) continue;
          if (d.kind === 'init' && (!d.node.init || U.constAny(d.node.init, unit) || ['InitList', 'NullptrLiteral', 'BoolLiteral'].includes(d.node.init.type))) continue;
          if (d.kind === 'init' && !U.usedSyms(unit).syms.has(d.sym)) continue; // unused variable: rule 0.2.1
          api.report(d.node, M(`The value written to '${nm(d.sym)}' here is never read.`, `여기서 '${nm(d.sym)}'에 써넣은 값은 읽히지 않습니다.`));
        }
      }
    },
  }),
  R({
    id: '0.1.2', cat: 'Required', dec: true, autosar: 'A0-1-2', cwe: 'CWE-252', sev: 'MAJOR', debt: 5,
    name: ['The value returned by a function shall be used', '함수가 돌려주는 값은 사용해야 합니다'],
    why: ['Ignoring a return value can silently drop error information or the result the call was made for.', '반환값을 무시하면 오류 정보나 호출의 목적이었던 결과를 조용히 잃을 수 있습니다.'],
    fix: ['Use the result, or cast the call to void to state that discarding it is intended.', '결과를 사용하거나, 버리는 것이 의도라면 void 로 캐스트하세요.'],
    check(unit, api) {
      for (const c of U.ix(unit).get('CallExpr')) {
        if (!U.isDiscarded(c)) continue;
        const t = c.refType || c.ctype;
        if (!t || U.unknownT(t) || U.canon(t).kind === 'void') continue;
        const cn = U.callName(c);
        if (!cn) continue;
        // fluent interfaces returning a reference to the same class are not values
        const rt = U.canon(t);
        if (rt.kind === 'reference' && cn.member) continue;
        if (c.calleeSymbol && c.calleeSymbol.qname && /^__builtin|^__assert/.test(c.calleeSymbol.qname)) continue;
        api.report(c, M(`The value returned by '${cn.name}' is discarded.`, `'${cn.name}' 의 반환값이 버려집니다.`));
      }
    },
  }),
  R({
    id: '0.2.1', cat: 'Advisory', dec: true, autosar: 'M0-1-3', cwe: 'CWE-563', sev: 'MINOR', debt: 5,
    name: ['Variables with limited visibility should be used at least once', '가시 범위가 제한된 변수는 한 번 이상 사용해야 합니다'],
    why: ['A local or internal variable that is never used is clutter and may indicate a missing piece of logic.', '쓰이지 않는 지역 변수나 내부 변수는 잡음이며 빠진 논리를 뜻할 수 있습니다.'],
    fix: ['Remove the variable or use it; mark intentional ones [[maybe_unused]].', '변수를 지우거나 사용하세요. 의도적이라면 [[maybe_unused]] 를 붙이세요.'],
    // A namespace-scope internal variable of a header (`constexpr int kMax = 4;`)
    // is copied into every unit that includes the header: it is unused only
    // when no unit uses it, so headers are decided over the whole project.
    project(project, api) {
      const byKey = new Map();
      for (const unit of project.units) {
        if (unit.lang !== 'cpp') continue;
        for (const { v, used } of unusedVarCandidates(unit, true)) {
          const key = `${v.loc.file}:${v.loc.line}:${v.name}`;
          const e = byKey.get(key);
          if (!e) byKey.set(key, { v, used });
          else if (used) e.used = true;
        }
      }
      for (const { v, used } of byKey.values()) if (!used) reportUnusedVar(api, v);
    },
    check(unit, api) {
      for (const { v, used } of unusedVarCandidates(unit, false)) if (!used) reportUnusedVar(api, v);
    },
  }),
  R({
    id: '0.2.2', cat: 'Required', dec: true, autosar: 'A0-1-4', cwe: 'CWE-563', sev: 'MAJOR', debt: 5,
    name: ['A named function parameter shall be used at least once', '이름이 있는 함수 매개변수는 한 번 이상 사용해야 합니다'],
    why: ['A parameter that is named but ignored suggests the function does not do what its interface promises.', '이름은 있지만 무시되는 매개변수는 함수가 인터페이스대로 동작하지 않음을 뜻할 수 있습니다.'],
    fix: ['Use the parameter, or leave it unnamed (or [[maybe_unused]]) when it is deliberately ignored.', '매개변수를 사용하거나, 일부러 무시한다면 이름을 빼거나 [[maybe_unused]] 를 붙이세요.'],
    check(unit, api) {
      const used = U.usedSyms(unit).syms;
      for (const fn of F.bodies(unit)) {
        if (fn.type === 'FunctionDecl' && (fn.isDefault || fn.isDeleted)) continue;
        for (const p of fn.params || []) {
          if (!p.name || !p.symbol || used.has(p.symbol) || p.symbol.uses.length) continue;
          if (U.attrNames(p).includes('maybe_unused') || (p.specs && (p.specs.attributes || []).some((a) => a.name === 'maybe_unused'))) continue;
          const fname = fn.type === 'FunctionDecl' ? fn.name : 'lambda';
          api.report(p.nameLoc ? { ...p.nameLoc, file: p.loc.file } : p, M(`Parameter '${p.name}' of '${fname}' is never used.`, `'${fname}' 의 매개변수 '${p.name}' 이(가) 사용되지 않습니다.`));
        }
      }
    },
  }),
  R({
    id: '0.2.3', cat: 'Advisory', dec: true, autosar: 'A0-1-6', cwe: 'CWE-1164', sev: 'MINOR', debt: 5,
    name: ['Types with limited visibility should be used at least once', '가시 범위가 제한된 타입은 한 번 이상 사용해야 합니다'],
    why: ['A local or unnamed-namespace type that nothing refers to is dead code.', '아무도 참조하지 않는 지역 타입이나 이름 없는 네임스페이스의 타입은 죽은 코드입니다.'],
    fix: ['Remove the unused type.', '쓰이지 않는 타입을 지우세요.'],
    check(unit, api) {
      const used = U.usedSyms(unit).syms;
      const enumUsed = new Set();
      for (const id of U.ix(unit).get('Identifier')) if (id.symbol && id.symbol.kind === 'enumerator' && id.symbol.enumType && id.symbol.enumType.decl) enumUsed.add(id.symbol.enumType.decl);
      const limited = (s) => {
        let sc = s.scope;
        if (!sc) return false;
        if (sc.kind === 'function' || sc.kind === 'block') return true;
        for (; sc; sc = sc.parent) if (sc.kind === 'namespace' && sc.node && sc.node.anonymous) return true;
        return false;
      };
      for (const s of unit.symbols) {
        if (s.kind !== 'tag' && s.kind !== 'typedef') continue;
        if (s.templateParam || !s.decls || !s.decls.length) continue;
        const d = s.decls[0];
        if (!U.user(d) || d.type === 'TemplateParam') continue;
        if (used.has(s) || s.uses.length || !limited(s)) continue;
        if (d.type === 'EnumDecl' && enumUsed.has(d)) continue;
        if (d.type === 'RecordDecl' && d.anonymous) continue;
        api.report(d.nameLoc ? { ...d.nameLoc, file: d.loc.file } : d, M(`Type '${s.name}' is declared but never used.`, `타입 '${s.name}' 이(가) 선언만 되고 사용되지 않습니다.`));
      }
    },
  }),
  R({
    id: '0.2.4', cat: 'Advisory', dec: true, autosar: 'A0-1-3', cwe: 'CWE-561', sev: 'MINOR', debt: 5,
    name: ['Functions with limited visibility should be used at least once', '가시 범위가 제한된 함수는 한 번 이상 사용해야 합니다'],
    why: ['A static, unnamed-namespace or private function that is never called is dead code.', '호출되지 않는 static 함수, 이름 없는 네임스페이스 함수, private 함수는 죽은 코드입니다.'],
    fix: ['Remove the function or call it where it is needed.', '함수를 지우거나 필요한 곳에서 호출하세요.'],
    check(unit, api) {
      const { syms, qnames } = U.usedSyms(unit);
      const isUsed = (s) => {
        if (syms.has(s) || (s.uses && s.uses.length)) return true;
        if (s.qname && qnames.has(s.qname)) return true;
        for (const o of s.overloads || []) if (syms.has(o) || (o.uses && o.uses.length)) return true;
        if (s.overloadOf && isUsed(s.overloadOf)) return true;
        return false;
      };
      const seen = new Set();
      for (const s of unit.symbols) {
        if (s.kind !== 'function' || seen.has(s)) continue;
        seen.add(s);
        const d = s.definition || (s.decls && s.decls[0]);
        if (!d || !U.user(d) || d.type !== 'FunctionDecl') continue;
        if (d.isDeleted || d.isDefault || d.name === 'main') continue;
        let limited = s.linkage === 'internal';
        if (s.member && s.access === 'private' && !s.isVirtual && !d.isConstructor && !d.isDestructor && !d.isOperator && !d.isConversion) limited = true;
        if (!limited) continue;
        if (isUsed(s)) continue;
        // definitions out of class may carry another symbol; check by owner name
        const owner = U.ownerRecord(unit, d);
        if (owner && qnames.has(`${owner.name}::${d.name}`)) continue;
        if (U.attrNames(d).includes('maybe_unused')) continue;
        api.report(d.nameLoc ? { ...d.nameLoc, file: d.loc.file } : d, M(`Function '${d.name}' has limited visibility and is never used.`, `가시 범위가 제한된 함수 '${d.name}' 이(가) 사용되지 않습니다.`));
      }
    },
  }),
  R({
    id: '0.3.1', dir: true, cat: 'Advisory', dec: false, cwe: 'CWE-1077', sev: 'MINOR', debt: 15,
    name: ['Floating-point arithmetic should be used appropriately', '부동소수점 연산은 알맞게 사용해야 합니다'],
    why: ['Rounding makes exact comparisons of floating-point values unreliable.', '반올림 오차 때문에 부동소수점 값을 정확히 비교하는 것은 믿을 수 없습니다.'],
    fix: ['Compare against a tolerance (epsilon) instead of testing for exact equality.', '정확한 같음 대신 허용 오차(epsilon) 와 비교하세요.'],
    check(unit, api) {
      for (const b of U.ix(unit).get('BinaryExpr')) {
        if (b.op !== '==' && b.op !== '!=') continue;
        const l = U.numCat(b.left && b.left.ctype, unit.target);
        const r = U.numCat(b.right && b.right.ctype, unit.target);
        if (l === 'float' || r === 'float') api.report(b, M(`Floating-point values are compared with '${b.op}'.`, `부동소수점 값을 '${b.op}' 로 비교합니다.`));
      }
    },
  }),
  R({
    id: '0.3.2', dir: true, cat: 'Required', dec: false, cwe: 'CWE-628', type: 'BUG', sev: 'MAJOR', debt: 15,
    name: ['A function call shall not violate the function\'s preconditions', '함수 호출은 그 함수의 사전 조건을 어기면 안 됩니다'],
    why: ['Calling a function with arguments outside its documented domain gives undefined or erroneous results.', '정의역 밖의 인자로 함수를 호출하면 정의되지 않은 결과나 잘못된 결과가 나옵니다.'],
    fix: ['Check the arguments against the function\'s preconditions before calling it.', '호출 전에 인자가 함수의 사전 조건을 만족하는지 확인하세요.'],
    check(unit, api) {
      for (const c of U.ix(unit).get('CallExpr')) {
        const cn = U.callName(c);
        if (!cn || cn.member || (cn.qualifier && cn.qualifier !== 'std')) continue;
        // only the library functions, not a project function (or member) of the same name
        if (!U.isLibCall(c, PRECOND_FNS)) continue;
        const a0 = c.args && c.args[0];
        const v = a0 ? U.constAny(a0, unit) : null;
        const num = v ? Number(v.value) : null;
        if (SQRT_FNS.has(cn.name) && num !== null && num < 0) api.report(c, M(`'${cn.name}' is called with a negative argument.`, `'${cn.name}' 를 음수 인자로 호출합니다.`));
        else if (LOG_FNS.has(cn.name) && num !== null && num <= 0) api.report(c, M(`'${cn.name}' is called with a non-positive argument.`, `'${cn.name}' 를 0 이하의 인자로 호출합니다.`));
        else if (CTYPE_FNS.has(cn.name) && num !== null && (num < -1 || num > 255) && c.args.length === 1) api.report(c, M(`'${cn.name}' needs a value representable as unsigned char or EOF.`, `'${cn.name}' 의 인자는 unsigned char 로 나타낼 수 있는 값이거나 EOF 여야 합니다.`));
        else if (NONNULL_FNS.has(cn.name)) {
          const i = NONNULL_ARGS.get(cn.name).find((k) => c.args && c.args[k] && isNullLit(c.args[k], unit));
          if (i !== undefined) api.report(c, M(`'${cn.name}' is passed a null pointer as argument ${i + 1}.`, `'${cn.name}' 의 ${i + 1}번째 인자로 널 포인터를 넘깁니다.`));
        }
      }
    },
  }),
];
