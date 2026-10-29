'use strict';

// MISRA C++:2023 chapter 8 — expressions.

const { R, M } = require('../lib/meta');
const U = require('../lib/util');
const C = require('../lib/conv');
const { cf } = U;

const src = (unit, e) => U.nodeText(unit, e);
const tname = (t) => U.tstr(U.nonRef(t));

const GROUP = {
  '*': 'mul', '/': 'mul', '%': 'mul', '+': 'add', '-': 'add', '<<': 'shift', '>>': 'shift',
  '<': 'rel', '>': 'rel', '<=': 'rel', '>=': 'rel', '==': 'eq', '!=': 'eq', '&': 'band', '^': 'bxor', '|': 'bor', '&&': 'land', '||': 'lor',
};

function needsParens(pg, cg) {
  if (pg === cg) return pg === 'eq' || pg === 'rel'; // a < b < c, a == b == c
  if (pg === 'add' && cg === 'mul') return false;
  if ((pg === 'rel' || pg === 'eq') && (cg === 'add' || cg === 'mul')) return false;
  if ((pg === 'land' || pg === 'lor') && (cg === 'rel' || cg === 'eq')) return false;
  return true;
}

// Lambda classification: transient when invoked immediately or passed directly as an argument.
function transient(lam) {
  const { p, key } = U.upParens(lam);
  if (!p) return false;
  if (p.type === 'CallExpr') return key === 'callee' || key === 'args';
  return false;
}

function implicitThisUses(lam) {
  const out = [];
  cf.walk(lam.body, (n) => {
    if (n.type === 'LambdaExpr') return cf.walk.SKIP;
    if (n.type === 'ThisExpr' || (n.type === 'Identifier' && n.implicitThis)) out.push(n);
    return undefined;
  });
  return out;
}

function implicitCaptures(lam) {
  const explicit = new Set((lam.captures || []).map((c) => c.symbol || c.name));
  const outerFn = cf.enclosing(lam, ['FunctionDecl', 'LambdaExpr']);
  const out = [];
  const seen = new Set();
  cf.walk(lam.body, (n) => {
    if (n.type !== 'Identifier' || !n.symbol) return undefined;
    const s = n.symbol;
    if ((s.kind !== 'variable' && s.kind !== 'parameter') || s.storage !== 'automatic' || seen.has(s)) return undefined;
    if (explicit.has(s) || explicit.has(s.name)) return undefined;
    const d = s.decls && s.decls[0];
    if (!d || cf.ancestors(d).includes(lam) || (lam.params || []).includes(d)) return undefined;
    if (outerFn && !(cf.ancestors(d).includes(outerFn) || (outerFn.params || []).includes(d))) return undefined;
    seen.add(s);
    out.push(n);
    return undefined;
  });
  return out;
}

// Cast helpers ----------------------------------------------------------------

const castTo = (c) => (c.typeName && c.typeName.ctype) || c.ctype;
const castFrom = (c) => (c.arg ? U.strip(c.arg).ctype : null);

function targetQuals(t) {
  const c = U.canon(t);
  if (c.kind === 'pointer') return U.canon(c.to);
  if (c.kind === 'reference') return U.canon(c.to);
  return null;
}

const isCharLike = (t) => {
  const c = U.canon(t);
  if (c.kind === 'int' && (c.name === 'char' || c.name === 'unsigned char')) return true;
  if (t && t.kind === 'typedef' && t.name === 'byte') return true;
  if (c.kind === 'enum' && c.name === 'byte') return true;
  return c.kind === 'unknown' && /(^|::)byte$/.test(c.name || '');
};

const isObjPtr = (t) => { const c = U.canon(U.nonRef(t)); return c.kind === 'pointer' && U.canon(c.to).kind !== 'function'; };
const isIntegralT = (t) => { const c = U.canon(U.nonRef(t)); return c.kind === 'int' || c.kind === 'enum'; };

function typedefName(t) {
  for (let x = t, i = 0; x && i < 10; i++) {
    if (x.kind === 'typedef') { if (x.name === 'uintptr_t' || x.name === 'intptr_t') return x.name; x = x.target; } else break;
  }
  return null;
}

// Purity of calls (for 8.14.1) -------------------------------------------------

const PURE_LIB = new Set(['strlen', 'strcmp', 'strncmp', 'memcmp', 'abs', 'labs', 'fabs', 'sqrt', 'pow', 'sin', 'cos', 'tan', 'floor', 'ceil', 'isdigit', 'isalpha', 'isalnum', 'isspace', 'isupper', 'islower', 'toupper', 'tolower', 'strchr', 'strstr', 'min', 'max']);

function fnHasSideEffects(fd, depth, seen) {
  if (!fd || !fd.body) return null;
  if (seen.has(fd) || depth > 3) return false;
  seen.add(fd);
  let se = false;
  const locals = new Set((fd.params || []).map((p) => p.symbol).filter(Boolean));
  cf.walk(fd.body, (n) => {
    if (se) return cf.walk.STOP;
    if (n.type === 'VarDecl' && n.symbol && n.symbol.storage === 'automatic') locals.add(n.symbol);
    if (n.type === 'AssignExpr' || (n.type === 'UnaryExpr' && (n.op === '++' || n.op === '--'))) {
      const tgt = n.type === 'AssignExpr' ? n.left : n.arg;
      const r = U.rootIdent(tgt);
      const st = U.strip(tgt);
      if (!r || !locals.has(r.symbol) || (st && st.type !== 'Identifier' && U.canon(r.symbol.type).kind === 'pointer')) se = true;
    }
    if (n.type === 'DeleteExpr' || n.type === 'ThrowExpr') se = true;
    if (n.type === 'CallExpr') { const r = callEffects(n, depth + 1, seen); if (r !== false) se = true; }
    return undefined;
  });
  return se;
}

// true: has persistent side effects, false: pure, null: unknown
function callEffects(call, depth = 0, seen = new Set()) {
  const s = call.calleeSymbol;
  if (!s) return null;
  if (s.system) return PURE_LIB.has(s.name) ? false : true;
  const d = s.definition;
  if (d && d.type === 'FunctionDecl') {
    if (U.isConstMethod(d)) return false;
    return fnHasSideEffects(d, depth, seen);
  }
  const decl = s.decls && s.decls.find((x) => x.type === 'FunctionDecl');
  if (decl && U.isConstMethod(decl)) return false;
  return null;
}

function persistentEffect(e) {
  let found = null;
  cf.walk(e, (n) => {
    if (found) return cf.walk.STOP;
    if (n.type === 'LambdaExpr') return cf.walk.SKIP;
    if (n.type === 'AssignExpr' || (n.type === 'UnaryExpr' && (n.op === '++' || n.op === '--')) || n.type === 'DeleteExpr' || n.type === 'NewExpr' || n.type === 'ThrowExpr') found = n;
    else if (n.type === 'CallExpr' && callEffects(n) === true) found = n;
    else if (n.type === 'Identifier' && n.ctype && U.canon(n.ctype).volatile) found = n;
    return undefined;
  });
  return found;
}

const arraySize = (id) => {
  const s = id && id.symbol;
  if (!s || !s.type) return null;
  const t = U.canon(s.type);
  return t.kind === 'array' && t.size != null ? t.size : null;
};

function ptrRoot(e) {
  e = U.strip(e);
  if (!e) return null;
  if (e.type === 'Identifier' && e.symbol && U.canon(e.symbol.type).kind === 'array') return e.symbol;
  if (e.type === 'UnaryExpr' && e.op === '&') { const r = U.rootIdent(e.arg); return r && r.symbol && U.canon(r.symbol.type).kind !== 'pointer' ? r.symbol : null; }
  if (e.type === 'BinaryExpr' && (e.op === '+' || e.op === '-')) return ptrRoot(e.left) || (e.op === '+' ? ptrRoot(e.right) : null);
  return null;
}

module.exports = [
  R({
    id: '8.0.1', cat: 'Advisory', dec: true, autosar: 'M5-0-2', sev: 'MINOR', debt: 2,
    name: ['Parentheses should be used to make the meaning of an expression appropriately explicit', '괄호로 식의 뜻을 분명히 해야 합니다'],
    why: ['Relying on less familiar precedence rules (shifts, bitwise and logical operators) invites misreading.', '시프트, 비트, 논리 연산자처럼 덜 익숙한 우선순위에 기대면 잘못 읽기 쉽습니다.'],
    fix: ['Add parentheses around the inner operation.', '안쪽 연산을 괄호로 감싸세요.'],
    check(unit, api) {
      for (const b of U.ix(unit).get('BinaryExpr')) {
        const pg = GROUP[b.op];
        if (!pg) continue;
        for (const c of [b.left, b.right]) {
          if (!c || c.type !== 'BinaryExpr' || c.loc.macro) continue;
          const cg = GROUP[c.op];
          if (!cg) continue;
          if (pg === cg && (pg !== 'eq' && pg !== 'rel')) continue;
          if (!needsParens(pg, cg)) continue;
          api.report(c, M(`Add parentheses around '${src(unit, c)}' inside the '${b.op}' expression.`, `'${b.op}' 식 안의 '${src(unit, c)}' 에 괄호를 넣으세요.`));
        }
      }
      for (const c of U.ix(unit).get('ConditionalExpr')) {
        const t = c.test;
        if (t && (t.type === 'AssignExpr' || t.type === 'ConditionalExpr' || (t.type === 'BinaryExpr' && GROUP[t.op] && !['rel', 'eq'].includes(GROUP[t.op])))) api.report(t, M(`Add parentheses around the condition '${src(unit, t)}' of '?:'.`, `'?:' 의 조건 '${src(unit, t)}' 에 괄호를 넣으세요.`));
      }
    },
  }),
  R({
    id: '8.1.1', cat: 'Required', dec: true, sev: 'MAJOR', debt: 5,
    name: ['A non-transient lambda shall not implicitly capture this', '오래 남는 람다는 this 를 암묵적으로 캡처하면 안 됩니다'],
    why: ['A stored lambda that captured this implicitly can outlive the object and then use a dangling pointer.', '저장된 람다가 this 를 암묵적으로 캡처하면 객체보다 오래 살아남아 허상 포인터를 쓸 수 있습니다.'],
    fix: ['Capture this (or *this) explicitly so the dependency is visible.', 'this (또는 *this) 를 명시적으로 캡처해 의존성이 보이게 하세요.'],
    check(unit, api) {
      for (const lam of U.ix(unit).get('LambdaExpr')) {
        if (!lam.captureDefault || transient(lam)) continue;
        if ((lam.captures || []).some((c) => c.kind === 'this')) continue;
        const uses = implicitThisUses(lam);
        if (uses.length) api.report(lam, M(`The stored lambda captures 'this' implicitly (used for '${uses[0].name || 'this'}').`, `저장되는 람다가 'this' 를 암묵적으로 캡처합니다 ('${uses[0].name || 'this'}' 사용).`));
      }
    },
  }),
  R({
    id: '8.1.2', cat: 'Advisory', dec: true, autosar: 'A5-1-2', sev: 'MINOR', debt: 5,
    name: ['Variables should be captured explicitly in a non-transient lambda', '오래 남는 람다에서는 변수를 명시적으로 캡처해야 합니다'],
    why: ['Default captures hide which objects a stored lambda depends on and how (copy or reference).', '기본 캡처는 저장된 람다가 어떤 객체에 어떻게(복사/참조) 의존하는지 숨깁니다.'],
    fix: ['List each captured variable explicitly.', '캡처하는 변수를 하나씩 명시하세요.'],
    check(unit, api) {
      for (const lam of U.ix(unit).get('LambdaExpr')) {
        if (!lam.captureDefault || transient(lam)) continue;
        const caps = implicitCaptures(lam);
        if (caps.length) api.report(lam, M(`The stored lambda captures '${caps.map((c) => c.name).join("', '")}' implicitly with [${lam.captureDefault}].`, `저장되는 람다가 '${caps.map((c) => c.name).join("', '")}' 를 [${lam.captureDefault}] 로 암묵적으로 캡처합니다.`));
      }
    },
  }),
  R({
    id: '8.2.1', cat: 'Required', dec: true, type: 'BUG', autosar: 'M5-2-2', sev: 'MAJOR', debt: 10,
    name: ['A virtual base class shall only be cast to a derived class by means of dynamic_cast', '가상 기반 클래스를 파생 클래스로 바꿀 때는 dynamic_cast 만 써야 합니다'],
    why: ['The offset of a virtual base is only known at run time; other casts give undefined behaviour.', '가상 기반의 위치는 실행 시에만 알 수 있으므로 다른 캐스트는 정의되지 않은 동작이 됩니다.'],
    fix: ['Use dynamic_cast.', 'dynamic_cast 를 쓰세요.'],
    check(unit, api) {
      for (const c of U.ix(unit).get('CastExpr')) {
        if (c.kind === 'dynamic_cast' || !c.arg) continue;
        const from = U.recordOf(castFrom(c));
        const to = U.recordOf(castTo(c));
        if (!from || !to || from === to) continue;
        const e = U.allBases(to).get(from);
        if (e && e.virtualPaths) api.report(c, M(`'${from.name}' is a virtual base of '${to.name}' and is cast with ${c.kind}.`, `'${from.name}' 는 '${to.name}' 의 가상 기반인데 ${c.kind} 로 캐스트합니다.`));
      }
    },
  }),
  R({
    id: '8.2.2', cat: 'Required', dec: true, autosar: 'A5-2-2', sev: 'MAJOR', debt: 5,
    name: ['C-style casts and functional notation casts shall not be used', 'C 형식 캐스트와 함수 표기 캐스트를 쓰면 안 됩니다'],
    why: ['These casts can silently perform a const_cast or reinterpret_cast and are hard to search for.', '이런 캐스트는 const_cast 나 reinterpret_cast 를 조용히 수행할 수 있고 찾기도 어렵습니다.'],
    fix: ['Use static_cast, const_cast or reinterpret_cast as appropriate.', '알맞은 static_cast, const_cast, reinterpret_cast 를 쓰세요.'],
    check(unit, api) {
      api = U.cppOnlyFix(api); // a header shared with C must stay C
      for (const c of U.ix(unit).get('CastExpr')) {
        if (c.loc.macro && U.isBuiltin((unit.macroTable.get(c.loc.macro) || {}).file)) continue;
        const to = U.canon(castTo(c));
        if (c.kind === 'c-style') {
          if (to.kind === 'void') continue;
          api.report(c, M(`C-style cast to '${tname(castTo(c))}'.`, `'${tname(castTo(c))}' 로의 C 형식 캐스트입니다.`));
        } else if (c.kind === 'functional') {
          if (to.kind === 'record' || U.unknownT(to) || c.brace || !c.arg) continue;
          api.report(c, M(`Functional notation cast to '${tname(castTo(c))}'.`, `'${tname(castTo(c))}' 로의 함수 표기 캐스트입니다.`));
        }
      }
    },
  }),
  R({
    id: '8.2.3', cat: 'Required', dec: true, type: 'BUG', autosar: 'A5-2-3', cert: 'EXP55-CPP', cwe: 'CWE-704', sev: 'MAJOR', debt: 10,
    name: ['A cast shall not remove any const or volatile qualification from the type accessed via a pointer or by reference', '캐스트로 포인터나 참조가 가리키는 타입의 const/volatile 을 없애면 안 됩니다'],
    why: ['Writing through a pointer whose const was cast away is undefined when the object really is const.', 'const 를 벗겨낸 포인터로 실제 const 객체에 쓰면 정의되지 않은 동작입니다.'],
    fix: ['Keep the qualifier, or change the design so the object does not need to be modified.', '한정자를 유지하거나, 객체를 수정할 필요가 없도록 설계를 바꾸세요.'],
    check(unit, api) {
      for (const c of U.ix(unit).get('CastExpr')) {
        if (!c.arg) continue;
        const to = castTo(c);
        const tc = U.canon(to);
        let fromT = null;
        let toT = null;
        if (tc.kind === 'pointer') { const f = U.canon(U.nonRef(castFrom(c))); if (f.kind !== 'pointer') continue; fromT = U.canon(f.to); toT = U.canon(tc.to); } else if (tc.kind === 'reference') { fromT = U.canon(U.nonRef(castFrom(c))); toT = U.canon(tc.to); } else continue;
        const lost = ['const', 'volatile'].filter((q) => fromT[q] && !toT[q]);
        if (lost.length) api.report(c, M(`The ${c.kind} removes '${lost.join(' ')}' from the referenced type.`, `${c.kind} 가 가리키는 타입에서 '${lost.join(' ')}' 를 없앱니다.`));
      }
    },
  }),
  R({
    id: '8.2.4', cat: 'Required', dec: true, type: 'BUG', autosar: 'M5-2-6', sev: 'MAJOR', debt: 10,
    name: ['Casts shall not be performed between a pointer to function and any other type', '함수 포인터와 다른 타입 사이에 캐스트하면 안 됩니다'],
    why: ['Calling a function through a pointer of the wrong type is undefined behaviour.', '잘못된 타입의 포인터로 함수를 호출하는 것은 정의되지 않은 동작입니다.'],
    fix: ['Use the function pointer with its own type.', '함수 포인터는 원래 타입 그대로 쓰세요.'],
    check(unit, api) {
      for (const c of U.ix(unit).get('CastExpr')) {
        if (!c.arg) continue;
        const to = castTo(c);
        const from = castFrom(c);
        if (!from || U.canon(to).kind === 'void') continue;
        // `std::thread(fn)`, `std::function<void()>(fn)`: constructing an object, not a cast
        if (c.kind === 'functional' && (U.unknownT(to) || U.canon(to).kind === 'record')) continue;
        const a = U.isFnPtr(to);
        const b = U.isFnPtr(from);
        if (!a && !b) continue;
        if (a && b && U.T.sameType(U.T.decay(U.nonRef(from)), U.T.decay(U.nonRef(to)))) continue;
        api.report(c, M(`Cast between the function pointer type and '${tname(a ? from : to)}'.`, `함수 포인터 타입과 '${tname(a ? from : to)}' 사이의 캐스트입니다.`));
      }
    },
  }),
  R({
    id: '8.2.5', cat: 'Required', dec: true, autosar: 'A5-2-4', sev: 'MAJOR', debt: 10,
    name: ['reinterpret_cast shall not be used', 'reinterpret_cast 를 쓰면 안 됩니다'],
    why: ['reinterpret_cast reinterprets bits and is the main source of type-punning bugs.', 'reinterpret_cast 는 비트를 다르게 해석하며 타입 혼동 버그의 주된 원인입니다.'],
    fix: ['Use static_cast, std::bit_cast or a redesign; only casts to char/unsigned char/std::byte pointers are acceptable.', 'static_cast, std::bit_cast 나 설계 변경을 쓰세요. char/unsigned char/std::byte 포인터로의 캐스트만 허용됩니다.'],
    check(unit, api) {
      for (const c of U.ix(unit).get('CastExpr')) {
        if (c.kind !== 'reinterpret_cast') continue;
        const tq = targetQuals(castTo(c));
        if (tq && isCharLike(tq)) continue;
        if (tq && U.canon(castTo(c)).kind === 'pointer') {
          const tn = c.typeName && c.typeName.specs && c.typeName.specs.typeSpec;
          if (tn && tn.type === 'NamedType' && tn.name === 'byte') continue;
        }
        api.report(c, M(`reinterpret_cast to '${tname(castTo(c))}'.`, `'${tname(castTo(c))}' 로의 reinterpret_cast 입니다.`));
      }
    },
  }),
  R({
    id: '8.2.6', cat: 'Required', dec: true, type: 'BUG', autosar: 'M5-2-8', cwe: 'CWE-704', sev: 'MAJOR', debt: 10,
    name: ['An object with integral, enumerated, or pointer to void type shall not be cast to a pointer type', '정수, 열거형, void 포인터 값을 포인터 타입으로 캐스트하면 안 됩니다'],
    why: ['The resulting pointer may be misaligned or point to no object of the target type.', '결과 포인터는 정렬이 어긋나거나 대상 타입의 객체를 가리키지 않을 수 있습니다.'],
    fix: ['Keep the original typed pointer instead of converting through an integer or void*.', '정수나 void* 를 거치지 말고 원래 타입의 포인터를 유지하세요.'],
    check(unit, api) {
      for (const c of U.ix(unit).get('CastExpr')) {
        if (!c.arg || !isObjPtr(castTo(c))) continue;
        const f = U.canon(U.nonRef(castFrom(c) || U.T.T.unknown));
        const fromVoidPtr = f.kind === 'pointer' && U.canon(f.to).kind === 'void' && U.canon(U.canon(castTo(c)).to).kind !== 'void';
        if (f.kind === 'int' || f.kind === 'enum' || fromVoidPtr) api.report(c, M(`'${tname(castFrom(c))}' is cast to the pointer type '${tname(castTo(c))}'.`, `'${tname(castFrom(c))}' 를 포인터 타입 '${tname(castTo(c))}' 로 캐스트합니다.`));
      }
    },
  }),
  R({
    id: '8.2.7', cat: 'Advisory', dec: true, autosar: 'M5-2-9', sev: 'MINOR', debt: 5,
    name: ['A cast should not convert a pointer type to an integral type', '캐스트로 포인터를 정수 타입으로 바꾸지 않아야 합니다'],
    why: ['The integer value of a pointer is implementation-defined and not portable.', '포인터의 정수 값은 구현마다 달라 이식성이 없습니다.'],
    fix: ['Avoid treating addresses as numbers.', '주소를 숫자로 다루지 마세요.'],
    check(unit, api) {
      for (const c of U.ix(unit).get('CastExpr')) {
        if (!c.arg || !isIntegralT(castTo(c))) continue;
        const f = U.canon(U.nonRef(castFrom(c) || U.T.T.unknown));
        if (f.kind === 'pointer') api.report(c, M(`A pointer is cast to the integral type '${tname(castTo(c))}'.`, `포인터를 정수 타입 '${tname(castTo(c))}' 로 캐스트합니다.`));
      }
    },
  }),
  R({
    id: '8.2.8', cat: 'Required', dec: true, autosar: 'M5-2-9', sev: 'MAJOR', debt: 5,
    name: ['An object pointer type shall not be cast to an integral type other than std::uintptr_t or std::intptr_t', '객체 포인터는 std::uintptr_t 나 std::intptr_t 외의 정수 타입으로 캐스트하면 안 됩니다'],
    why: ['Only (u)intptr_t is guaranteed to hold a pointer value without loss.', '포인터 값을 잃지 않고 담는 것은 (u)intptr_t 만 보장됩니다.'],
    fix: ['Cast to std::uintptr_t (or std::intptr_t).', 'std::uintptr_t (또는 std::intptr_t) 로 캐스트하세요.'],
    check(unit, api) {
      for (const c of U.ix(unit).get('CastExpr')) {
        if (!c.arg || !isIntegralT(castTo(c)) || !isObjPtr(castFrom(c) || U.T.T.unknown)) continue;
        if (typedefName(castTo(c))) continue;
        api.report(c, M(`An object pointer is cast to '${tname(castTo(c))}' instead of std::uintptr_t.`, `객체 포인터를 std::uintptr_t 가 아닌 '${tname(castTo(c))}' 로 캐스트합니다.`));
      }
    },
  }),
  R({
    id: '8.2.9', cat: 'Required', dec: true, sev: 'MAJOR', debt: 5,
    name: ['The operand to typeid shall not be an expression of polymorphic class type', 'typeid 의 피연산자는 다형 클래스 타입의 식이면 안 됩니다'],
    why: ['typeid on a polymorphic glvalue evaluates the operand at run time, which is easily overlooked (and throws for null pointers).', '다형 glvalue 에 대한 typeid 는 피연산자를 실행 시에 평가하는데 이를 놓치기 쉽고 널 포인터면 예외를 던집니다.'],
    fix: ['Use a type-id operand, or a virtual function instead of type inspection.', '타입 이름을 피연산자로 쓰거나 타입 검사 대신 가상 함수를 쓰세요.'],
    check(unit, api) {
      for (const t of U.ix(unit).get('TypeidExpr')) {
        if (!t.arg) continue;
        const r = U.canon(U.nonRef(U.strip(t.arg).ctype || U.T.T.unknown));
        if (r.kind === 'record' && U.isPolymorphic(r)) api.report(t, M(`typeid is applied to an expression of the polymorphic class '${r.name}'.`, `다형 클래스 '${r.name}' 타입의 식에 typeid 를 씁니다.`));
      }
    },
  }),
  R({
    id: '8.2.10', cat: 'Required', dec: false, autosar: 'A7-5-2', cwe: 'CWE-674', sev: 'MAJOR', debt: 20,
    name: ['Functions shall not call themselves, either directly or indirectly', '함수는 직접이든 간접이든 자기 자신을 호출하면 안 됩니다'],
    why: ['Recursion makes stack usage unbounded and hard to verify.', '재귀는 스택 사용량을 무한히 만들 수 있고 검증하기 어렵습니다.'],
    fix: ['Rewrite the algorithm iteratively.', '알고리즘을 반복문으로 다시 작성하세요.'],
    project(project, api) {
      const cg = project.callGraph;
      if (!cg) return;
      for (const comp of cg.recursion()) {
        const names = comp.map((k) => (cg.nodes.get(k) || {}).name || k);
        for (const k of comp) {
          const n = cg.nodes.get(k);
          if (!n) continue;
          for (const d of n.definitions || []) {
            if (!U.user(d.node)) continue;
            const via = comp.length > 1 ? ` (through ${names.join(' -> ')})` : '';
            api.report(d.node.nameLoc ? { ...d.nameLoc, ...d.node.nameLoc, file: d.node.loc.file } : d.node, M(`'${n.name}' calls itself${via}.`, `'${n.name}' 이(가) 자기 자신을 호출합니다${comp.length > 1 ? ` (${names.join(' -> ')} 경유)` : ''}.`));
          }
        }
      }
    },
  }),
  R({
    id: '8.2.11', cat: 'Required', dec: true, type: 'BUG', autosar: 'A8-4-1', sev: 'MAJOR', debt: 10,
    name: ['An argument passed via ellipsis shall have an appropriate type', '줄임표(...) 로 넘기는 인자는 알맞은 타입이어야 합니다'],
    why: ['Passing class objects through ... is conditionally supported and loses constructors and destructors.', '클래스 객체를 ... 로 넘기는 것은 조건부로만 지원되며 생성자와 소멸자가 무시됩니다.'],
    fix: ['Pass a pointer or a fundamental value, or use a variadic template instead.', '포인터나 기본 타입 값을 넘기거나 가변 인자 템플릿을 쓰세요.'],
    check(unit, api) {
      for (const call of U.ix(unit).get('CallExpr')) {
        const ft = C.fnTypeOfCallee(call);
        if (!ft || !ft.variadic) continue;
        (call.args || []).slice(ft.params.length).forEach((a, i) => {
          const e = U.strip(a);
          const t = e && e.ctype;
          if (!t) return;
          const c = U.canon(U.nonRef(t));
          const ts = e.type === 'Identifier' && e.symbol && e.symbol.type ? U.canon(e.symbol.type) : null;
          if (c.kind === 'record' || (c.kind === 'unknown' && ts && ts.kind === 'unknown')) api.report(e, M(`The class-type value '${src(unit, e)}' is passed through '...' (argument ${ft.params.length + i + 1}).`, `클래스 타입 값 '${src(unit, e)}' 를 '...' 로 넘깁니다 (${ft.params.length + i + 1}번째 인자).`));
        });
      }
    },
  }),
  R({
    id: '8.3.1', cat: 'Advisory', dec: true, autosar: 'M5-3-2', sev: 'MINOR', debt: 2,
    name: ['The built-in unary - operator should only be applied to an expression of signed arithmetic type', '내장 단항 - 는 부호 있는 산술 타입에만 써야 합니다'],
    why: ['Negating an unsigned value wraps around to a large positive number.', '부호 없는 값을 음수로 만들면 큰 양수로 되돌아갑니다.'],
    fix: ['Convert to a signed type first, or rewrite the expression.', '먼저 부호 있는 타입으로 바꾸거나 식을 다시 쓰세요.'],
    check(unit, api) {
      for (const u of U.ix(unit).get('UnaryExpr')) {
        if (u.op !== '-') continue;
        const c = U.numCat(U.strip(u.arg) && U.strip(u.arg).ctype, unit.target);
        if (c === 'unsigned' || c === 'bool' || c === 'char' || c === 'enum') api.report(u, M(`Unary '-' is applied to '${src(unit, u.arg)}' of type '${tname(U.strip(u.arg).ctype)}'.`, `'${tname(U.strip(u.arg).ctype)}' 타입의 '${src(unit, u.arg)}' 에 단항 '-' 를 씁니다.`));
      }
    },
  }),
  R({
    id: '8.3.2', cat: 'Advisory', dec: true, sev: 'MINOR', debt: 1,
    name: ['The built-in unary + operator should not be used', '내장 단항 + 는 쓰지 않아야 합니다'],
    why: ['Unary + has no effect except a hidden integral promotion, and is often a typo.', '단항 + 는 숨은 정수 승격 외에는 아무 효과가 없고 오타인 경우가 많습니다.'],
    fix: ['Remove the +, or write an explicit cast if the promotion is intended.', '+ 를 지우거나, 승격이 의도라면 명시적으로 캐스트하세요.'],
    check(unit, api) {
      for (const u of U.ix(unit).get('UnaryExpr')) {
        if (u.op !== '+') continue;
        const c = U.numCat(u.arg && u.arg.ctype, unit.target);
        if (c && c !== 'record') api.report(u, M('The built-in unary + operator is used.', '내장 단항 + 연산자를 씁니다.'));
      }
    },
  }),
  R({
    id: '8.7.1', cat: 'Required', dec: false, type: 'BUG', autosar: 'M5-0-16', cwe: 'CWE-119', sev: 'CRITICAL', debt: 15,
    name: ['Pointer arithmetic shall not form an invalid pointer', '포인터 산술로 잘못된 포인터를 만들면 안 됩니다'],
    why: ['A pointer outside its array (other than one past the end) is undefined behaviour even if never dereferenced.', '배열 밖(끝 바로 다음 제외) 을 가리키는 포인터는 역참조하지 않아도 정의되지 않은 동작입니다.'],
    fix: ['Keep indices and offsets within the bounds of the array.', '인덱스와 오프셋을 배열 범위 안에 두세요.'],
    check(unit, api) {
      const x = U.ix(unit);
      for (const ie of x.get('IndexExpr')) {
        const id = U.strip(ie.object);
        if (!id || id.type !== 'Identifier') continue;
        const n = arraySize(id);
        const k = U.constInt(ie.index, unit);
        if (n === null || !k) continue;
        const { p } = U.upParens(ie);
        const addrOnly = p && p.type === 'UnaryExpr' && p.op === '&';
        if (k.value < 0n || k.value > BigInt(n) || (k.value === BigInt(n) && !addrOnly)) api.report(ie, M(`Index ${k.value} is outside the bounds of '${id.name}[${n}]'.`, `인덱스 ${k.value} 가 '${id.name}[${n}]' 의 범위를 벗어납니다.`));
      }
      for (const b of x.get('BinaryExpr')) {
        if (b.op !== '+' && b.op !== '-') continue;
        const id = U.strip(b.left);
        if (!id || id.type !== 'Identifier') continue;
        const n = arraySize(id);
        const k = U.constInt(b.right, unit);
        if (n === null || !k) continue;
        const off = b.op === '+' ? k.value : -k.value;
        if (off < 0n || off > BigInt(n)) api.report(b, M(`'${src(unit, b)}' points outside the array '${id.name}[${n}]'.`, `'${src(unit, b)}' 가 배열 '${id.name}[${n}]' 밖을 가리킵니다.`));
      }
    },
  }),
  R({
    id: '8.7.2', cat: 'Required', dec: false, type: 'BUG', autosar: 'M5-0-17', cwe: 'CWE-469', sev: 'MAJOR', debt: 10,
    name: ['Subtraction between pointers shall only be applied to pointers that address elements of the same array', '포인터 뺄셈은 같은 배열의 원소를 가리키는 포인터끼리만 해야 합니다'],
    why: ['Subtracting pointers into different objects is undefined behaviour.', '서로 다른 객체를 가리키는 포인터를 빼는 것은 정의되지 않은 동작입니다.'],
    fix: ['Only subtract pointers derived from the same array.', '같은 배열에서 나온 포인터끼리만 빼세요.'],
    check(unit, api) {
      for (const b of U.ix(unit).get('BinaryExpr')) {
        if (b.op !== '-') continue;
        if (!U.T.isPointer(b.left.ctype || U.T.T.unknown) && U.canon(U.nonRef(b.left.ctype || U.T.T.unknown)).kind !== 'array') continue;
        if (!U.T.isPointer(b.right.ctype || U.T.T.unknown) && U.canon(U.nonRef(b.right.ctype || U.T.T.unknown)).kind !== 'array') continue;
        const a = ptrRoot(b.left);
        const c = ptrRoot(b.right);
        if (a && c && a !== c) api.report(b, M(`Pointers into different objects ('${a.name}' and '${c.name}') are subtracted.`, `서로 다른 객체('${a.name}', '${c.name}') 를 가리키는 포인터를 뺍니다.`));
      }
    },
  }),
  R({
    id: '8.9.1', cat: 'Required', dec: false, type: 'BUG', autosar: 'M5-0-18', sev: 'MAJOR', debt: 10,
    name: ['The built-in relational operators >, >=, < and <= shall not be applied to objects of pointer type, except where they point to elements of the same array', '같은 배열이 아닌 포인터에 내장 관계 연산자 >, >=, <, <= 를 쓰면 안 됩니다'],
    why: ['Ordering pointers to different objects gives unspecified results.', '서로 다른 객체를 가리키는 포인터의 대소 비교 결과는 미지정입니다.'],
    fix: ['Compare indices, or use std::less for a total order.', '인덱스를 비교하거나 전체 순서가 필요하면 std::less 를 쓰세요.'],
    check(unit, api) {
      for (const b of U.ix(unit).get('BinaryExpr')) {
        if (!C.REL_OPS.has(b.op)) continue;
        const pl = U.canon(U.nonRef(b.left.ctype || U.T.T.unknown)).kind;
        const pr = U.canon(U.nonRef(b.right.ctype || U.T.T.unknown)).kind;
        if ((pl !== 'pointer' && pl !== 'array') || (pr !== 'pointer' && pr !== 'array')) continue;
        const a = ptrRoot(b.left);
        const c = ptrRoot(b.right);
        if (a && c && a !== c) api.report(b, M(`Pointers into different objects ('${a.name}' and '${c.name}') are compared with '${b.op}'.`, `서로 다른 객체('${a.name}', '${c.name}') 를 가리키는 포인터를 '${b.op}' 로 비교합니다.`));
      }
    },
  }),
  R({
    id: '8.14.1', cat: 'Advisory', dec: false, autosar: 'M5-14-1', sev: 'MINOR', debt: 5,
    name: ['The right-hand operand of a logical && or || operator should not contain persistent side effects', '논리 && / || 의 오른쪽 피연산자에는 지속되는 부수 효과가 없어야 합니다'],
    why: ['The right operand is evaluated only sometimes, so its side effects happen only sometimes.', '오른쪽 피연산자는 경우에 따라서만 평가되므로 그 부수 효과도 경우에 따라서만 일어납니다.'],
    fix: ['Move the side effect into a separate statement.', '부수 효과를 별도의 문장으로 옮기세요.'],
    check(unit, api) {
      for (const b of U.ix(unit).get('BinaryExpr')) {
        if (b.op !== '&&' && b.op !== '||') continue;
        const se = persistentEffect(b.right);
        if (se) api.report(b.right, M(`The right operand of '${b.op}' has a side effect ('${src(unit, se)}') that only happens sometimes.`, `'${b.op}' 의 오른쪽 피연산자에 경우에 따라서만 일어나는 부수 효과('${src(unit, se)}') 가 있습니다.`));
      }
    },
  }),
  R({
    id: '8.18.1', cat: 'Mandatory', dec: false, type: 'BUG', cwe: 'CWE-475', sev: 'CRITICAL', debt: 15,
    name: ['An object or subobject must not be copied to an overlapping object', '객체나 하위 객체를 겹치는 객체로 복사하면 안 됩니다'],
    why: ['Copying between overlapping storage (union members, overlapping buffers) is undefined behaviour.', '겹치는 저장 공간(공용체 멤버, 겹치는 버퍼) 사이의 복사는 정의되지 않은 동작입니다.'],
    fix: ['Copy through a temporary, or use std::memmove semantics for overlapping ranges.', '임시 객체를 거쳐 복사하거나, 겹치는 범위에는 memmove 방식을 쓰세요.'],
    check(unit, api) {
      for (const a of U.ix(unit).get('AssignExpr')) {
        if (a.op !== '=') continue;
        const l = U.strip(a.left);
        const r = U.strip(a.right);
        if (!l || !r || l.type !== 'MemberExpr' || r.type !== 'MemberExpr' || l.member === r.member) continue;
        const lo = U.canon(U.nonRef(l.object && l.object.ctype || U.T.T.unknown));
        const ro = U.canon(U.nonRef(r.object && r.object.ctype || U.T.T.unknown));
        const lu = lo.kind === 'pointer' ? U.canon(lo.to) : lo;
        if (lu.kind !== 'record' || lu.tag !== 'union') continue;
        if (cf.sourceText(unit, l.object) !== cf.sourceText(unit, r.object) || lo !== ro) continue;
        api.report(a, M(`The union member '${r.member}' is copied into the overlapping member '${l.member}'.`, `공용체 멤버 '${r.member}' 를 겹치는 멤버 '${l.member}' 로 복사합니다.`));
      }
      const COPY = new Set(['memcpy', 'strcpy', 'strncpy', 'wcscpy', 'wmemcpy']);
      for (const call of U.ix(unit).get('CallExpr')) {
        const n = U.isLibCall(call, COPY);
        if (!n || (call.args || []).length < 2) continue;
        const d = U.rootIdent(call.args[0]);
        const s = U.rootIdent(call.args[1]);
        if (d && s && d.symbol && d.symbol === s.symbol && cf.sourceText(unit, call.args[0]) !== cf.sourceText(unit, call.args[1])) api.report(call, M(`'${n}' copies within the same object '${d.name}'; the ranges may overlap.`, `'${n}' 가 같은 객체 '${d.name}' 안에서 복사하므로 범위가 겹칠 수 있습니다.`));
      }
    },
  }),
  R({
    id: '8.18.2', cat: 'Advisory', dec: true, autosar: 'M6-2-1', cwe: 'CWE-481', sev: 'MINOR', debt: 2,
    name: ['The result of an assignment operator should not be used', '대입 연산자의 결과를 사용하지 않아야 합니다'],
    why: ['Assignments buried inside larger expressions are easily mistaken for comparisons.', '큰 식 안에 묻힌 대입은 비교로 착각하기 쉽습니다.'],
    fix: ['Perform the assignment as a separate statement.', '대입을 별도의 문장으로 하세요.'],
    check(unit, api) {
      for (const a of U.ix(unit).get('AssignExpr')) {
        if (U.isDiscarded(a)) continue;
        const { p, key } = U.upParens(a);
        if (p && p.type === 'ForStmt' && (key === 'init' || key === 'inc')) continue;
        if (U.recordOf(a.left && a.left.ctype) && !U.canon(U.nonRef(a.left.ctype)).kind.startsWith('int')) {
          if (U.canon(U.nonRef(a.left.ctype)).kind === 'record') continue;
        }
        api.report(a, M(`The result of the assignment to '${src(unit, a.left)}' is used.`, `'${src(unit, a.left)}' 에 대한 대입의 결과를 사용합니다.`));
      }
    },
  }),
  R({
    id: '8.19.1', cat: 'Advisory', dec: true, autosar: 'M5-18-1', sev: 'MINOR', debt: 2,
    name: ['The comma operator should not be used', '쉼표 연산자는 쓰지 않아야 합니다'],
    why: ['The comma operator makes expressions harder to read and its value is easy to misunderstand.', '쉼표 연산자는 식을 읽기 어렵게 하고 그 값을 오해하기 쉽습니다.'],
    fix: ['Split the expression into separate statements.', '식을 여러 문장으로 나누세요.'],
    check(unit, api) {
      for (const b of U.ix(unit).get('BinaryExpr')) if (b.op === ',') api.report(b, M('The comma operator is used.', '쉼표 연산자를 씁니다.'));
    },
  }),
  R({
    id: '8.20.1', cat: 'Advisory', dec: true, autosar: 'M5-19-1', cwe: 'CWE-190', sev: 'MINOR', debt: 5,
    name: ['An unsigned arithmetic operation with constant operands should not wrap', '상수 피연산자의 부호 없는 산술은 순환(wrap) 하지 않아야 합니다'],
    why: ['A constant expression that wraps around is almost always a mistake in the constant.', '순환하는 상수식은 거의 언제나 상수를 잘못 쓴 것입니다.'],
    fix: ['Correct the constants or use a wider type.', '상수를 고치거나 더 넓은 타입을 쓰세요.'],
    check(unit, api) {
      const wraps = (e) => { const v = U.constInt(e, unit); return !!(v && v.wrapped); };
      for (const e of U.ix(unit).get('BinaryExpr', 'UnaryExpr')) {
        if (!wraps(e)) continue;
        const kids = cf.childrenOf(e).map(U.strip);
        if (kids.some((k) => k && wraps(k))) continue;
        api.report(e, M(`The unsigned constant expression '${src(unit, e)}' wraps around.`, `부호 없는 상수식 '${src(unit, e)}' 가 순환합니다.`));
      }
    },
  }),
];
