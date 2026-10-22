'use strict';

// SEI CERT C++ — EXP: expressions (and INT50-CPP).

const { rule } = require('../lib/meta');
const U = require('../lib/util');
const X = require('../lib/cpp');
const { M, T, cf } = U;

// ------------------------------------------------------------ EXP50 helpers
const UNSEQ_BIN = new Set(['+', '-', '*', '/', '%', '<<', '>>', '<', '>', '<=', '>=', '==', '!=', '&', '|', '^', '<=>']);

// Keys modified / read inside an operand (not descending into lambdas).
function effects(unit, root) {
  const mods = new Map(), reads = new Map();
  cf.walk(root, (n) => {
    if (n.type === 'LambdaExpr' || n.type === 'SizeofExpr' || n.type === 'AlignofExpr' || n.type === 'DecltypeType') return cf.walk.SKIP;
    if (n.type === 'UnaryExpr' && (n.op === '++' || n.op === '--')) { const k = U.key(unit, n.arg); if (k) mods.set(k, n); }
    else if (n.type === 'AssignExpr') { const k = U.key(unit, n.left); if (k) mods.set(k, n); }
    else if (n.type === 'Identifier' && n.symbol && (n.symbol.kind === 'variable' || n.symbol.kind === 'parameter')) reads.set(`#${n.symbol.id}`, n);
    return undefined;
  });
  return { mods, reads };
}

function conflict(a, b) {
  for (const [k, n] of a.mods) {
    if (b.mods.has(k) || b.reads.has(k)) return { key: k, node: n };
  }
  return null;
}

const nameOfKey = (unit, node) => {
  const t = node.type === 'UnaryExpr' ? node.arg : node.type === 'AssignExpr' ? node.left : node;
  return U.src(unit, t).trim();
};

// ------------------------------------------------------------ EXP56 tables
const C_CALLBACKS = { qsort: 3, bsearch: 4, atexit: 0, at_quick_exit: 0, pthread_create: 2, thrd_create: 1, pthread_once: 1, pthread_atfork: -1, signal: -2 };

// ------------------------------------------------------------ EXP54 helpers
function fnRetType(fn) {
  const t = fn && fn.ctype && T.canonical(fn.ctype);
  return t && t.kind === 'function' ? t.ret : null;
}

function localObjectOf(e, fn) {
  e = U.strip(e);
  if (!e) return null;
  if (e.type === 'MemberExpr' && !e.arrow) return localObjectOf(e.object, fn);
  if (e.type === 'IndexExpr') {
    const ot = e.object && e.object.ctype && T.canonical(e.object.ctype);
    if (ot && ot.kind === 'array') return localObjectOf(e.object, fn);
    return null;
  }
  const s = U.idSym(e);
  if (!s || !X.isLocalOf(s, fn)) return null;
  return s;
}

// A prvalue whose lifetime ends with the full-expression (literal, arithmetic, call returning by value).
function isTemporary(e) {
  e = U.skip(e);
  if (!e) return false;
  if (['IntegerLiteral', 'FloatingLiteral', 'CharLiteral', 'BoolLiteral'].includes(e.type)) return true;
  if (e.type === 'BinaryExpr' && UNSEQ_BIN.has(e.op) && e.ctype && T.isArithmetic(T.canonical(e.ctype))) return true;
  if (e.type === 'CastExpr' && e.kind === 'functional') return true;
  if (e.type === 'CallExpr' && e.refType) {
    const r = T.canonical(e.refType);
    if (r && r.kind !== 'reference' && r.kind !== 'pointer' && r.kind !== 'unknown' && r.kind !== 'dependent' && r.kind !== 'auto' && r.kind !== 'void') return true;
  }
  return false;
}

// Call returning std::string by value (declared return type name).
function returnsStringByValue(call) {
  if (!call || call.type !== 'CallExpr') return false;
  const s = call.calleeSymbol || U.idSym(call.callee);
  const d = s && ((s.definition) || (s.decls || [])[0]);
  if (!d || d.type !== 'FunctionDecl') return false;
  if (d.declarator && d.declarator.type !== 'FunctionDeclarator') return false; // pointer / reference return
  return X.isString(X.stdBare(U.declTypeName(d)));
}

function stringTemporary(e) {
  e = U.skip(e);
  if (!e) return false;
  if (e.type === 'CastExpr' && e.kind === 'functional') return X.isString(X.exprStd(e));
  if (e.type === 'CallExpr') return returnsStringByValue(e) || (X.stdCall(e, ['to_string', 'to_wstring']) != null);
  if (e.type === 'BinaryExpr' && e.op === '+') return X.isString(X.exprStd(e.left)) || X.isString(X.exprStd(e.right)) || stringTemporary(e.left) || stringTemporary(e.right);
  return false;
}

// ------------------------------------------------------------ EXP61 helpers
function refCapturedLocals(lam, fn) {
  const out = [];
  for (const c of lam.captures || []) {
    if (c.kind === 'name' && c.byRef && c.symbol && X.isLocalOf(c.symbol, fn)) out.push(c.symbol);
  }
  if (lam.captureDefault === '&') {
    const seen = new Set();
    for (const id of cf.findAll(lam.body, 'Identifier')) {
      const s = id.symbol;
      if (!s || seen.has(s)) continue;
      seen.add(s);
      if (X.isLocalOf(s, fn)) out.push(s);
    }
  }
  return out;
}

function isNonLocalTarget(e, fn) {
  e = U.strip(e);
  if (!e) return false;
  if (e.type === 'MemberExpr') return true; // this->cb, obj.cb
  const s = U.idSym(e);
  if (!s) return false;
  if (s.kind === 'field') return true;
  if (s.kind === 'variable' && s.storage === 'static') return true;
  if (s.kind === 'parameter' || s.kind === 'variable') {
    const t = s.type && T.canonical(s.type);
    if (t && t.kind === 'reference') return true;
  }
  return false;
}

// ------------------------------------------------------------ INT50 helpers
function enumRange(et) {
  const cs = et.constants || [];
  if (!cs.length) return { min: 0n, max: 0n };
  let lo = cs[0].value, hi = cs[0].value;
  for (const c of cs) { if (c.value < lo) lo = c.value; if (c.value > hi) hi = c.value; }
  const bitsFor = (v) => { let b = 0; while ((1n << BigInt(b)) <= v) b++; return b; };
  if (lo >= 0n) {
    const b = bitsFor(hi);
    return { min: 0n, max: (1n << BigInt(b)) - 1n };
  }
  const m = hi > -lo - 1n ? hi : -lo - 1n;
  const b = bitsFor(m);
  return { min: -(1n << BigInt(b)), max: (1n << BigInt(b)) - 1n };
}

const VA_START = new Set(['va_start', '__builtin_va_start']);
const MEMFN = { memset: [0], memcpy: [0, 1], memmove: [0, 1], memcmp: [0, 1], bzero: [0], memccpy: [0, 1] };

module.exports = [
  rule('EXP50-CPP', {
    risk: 'MPM', cwe: ['CWE-758'], approx: true,
    name: ['Do not depend on the order of evaluation for side effects', '부수 효과에 대해 평가 순서에 의존하지 마세요'],
    why: ['Function arguments and the operands of most operators are evaluated in an unspecified order; modifying a variable in one operand and using it in another gives undefined or unspecified results.', '함수 인수와 대부분 연산자의 피연산자는 평가 순서가 정해지지 않아, 한 피연산자에서 변수를 수정하고 다른 피연산자에서 사용하면 결과가 정의되지 않거나 지정되지 않습니다.'],
    fix: ['Do the side effect in a separate statement before the expression.', '부수 효과는 식 앞의 별도 문장에서 수행하세요.'],
  }, {
    check(unit, api) {
      const done = new Set();
      const hit = (node, c, ctx) => {
        const st = U.stmtOf(node) || node;
        if (done.has(st)) return;
        done.add(st);
        const v = nameOfKey(unit, c.node);
        api.report(node, M(`'${v}' is modified and also used in ${ctx.en} '${U.src(unit, node).replace(/\s+/g, ' ').slice(0, 60)}' whose evaluation order is unspecified.`, `평가 순서가 정해지지 않은 ${ctx.ko} '${U.src(unit, node).replace(/\s+/g, ' ').slice(0, 60)}' 에서 '${v}' 가 수정되면서 사용됩니다.`));
      };
      for (const c of U.nodes(unit, 'CallExpr')) {
        const args = (c.args || []).filter((a) => a && a.type !== 'InitList');
        if (args.length < 2) continue;
        const eff = args.map((a) => effects(unit, a));
        outer: for (let i = 0; i < eff.length; i++) {
          for (let j = 0; j < eff.length; j++) {
            if (i === j) continue;
            const cx = conflict(eff[i], eff[j]);
            if (cx) { hit(c, cx, M('the arguments of', '인수')); break outer; }
          }
        }
      }
      for (const b of U.nodes(unit, 'BinaryExpr')) {
        if (!UNSEQ_BIN.has(b.op)) continue;
        const l = effects(unit, b.left), r = effects(unit, b.right);
        const cx = conflict(l, r) || conflict(r, l);
        if (cx) hit(b, cx, M('the operands of', '피연산자'));
      }
      for (const a of U.nodes(unit, 'AssignExpr')) {
        const lk = U.key(unit, a.left);
        const r = effects(unit, a.right);
        if (lk && r.mods.has(lk)) { hit(a, { node: r.mods.get(lk) }, M('the assignment', '대입')); continue; }
        // a[i] = i++ : the left operand reads what the right one modifies
        const lt = U.strip(a.left);
        if (lt && (lt.type === 'IndexExpr' || lt.type === 'UnaryExpr')) {
          const l = effects(unit, lt.type === 'IndexExpr' ? lt.index : lt.arg);
          const cx = conflict(r, l) || conflict(l, effects(unit, a.right));
          if (cx) hit(a, cx, M('the assignment', '대입'));
        }
      }
    },
  }),

  rule('EXP51-CPP', {
    risk: 'HUM', cwe: ['CWE-758', 'CWE-762'],
    name: ['Do not delete an array through a pointer of the incorrect type', '잘못된 형식의 포인터로 배열을 삭제하지 마세요'],
    why: ['delete[] through a base-class pointer to an array of derived objects is undefined behavior: element size and destructors do not match.', '파생 객체 배열을 기반 클래스 포인터로 delete[] 하면 요소 크기와 소멸자가 맞지 않아 정의되지 않은 동작입니다.'],
    fix: ['Delete the array through a pointer of its real element type, or use std::vector<std::unique_ptr<Base>>.', '실제 요소 형식의 포인터로 배열을 삭제하거나 std::vector<std::unique_ptr<Base>> 를 사용하세요.'],
  }, {
    check(unit, api) {
      for (const d of U.nodes(unit, 'DeleteExpr')) {
        if (!d.array) continue;
        const s = U.idSym(d.arg);
        const bt = X.pointeeRec(d.arg && U.strip(d.arg).ctype);
        if (!s || !bt) continue;
        for (const { value } of X.assignedValues(s)) {
          const v = U.strip(value);
          if (!v || v.type !== 'NewExpr' || !v.isArray) continue;
          const dt = X.pointeeRec(v.ctype);
          if (dt && dt !== bt && dt.name !== bt.name) {
            api.report(d, M(`delete[] '${U.src(unit, d.arg)}' (pointer to ${bt.name}) releases an array of ${dt.name} allocated at line ${v.loc.line}.`, `delete[] '${U.src(unit, d.arg)}' (${bt.name} 포인터)가 ${v.loc.line} 행에서 할당한 ${dt.name} 배열을 해제합니다.`));
            break;
          }
        }
      }
    },
  }),

  rule('EXP52-CPP', {
    risk: 'LUL', cwe: ['CWE-758'],
    name: ['Do not rely on side effects in unevaluated operands', '평가되지 않는 피연산자의 부수 효과에 의존하지 마세요'],
    why: ['The operands of sizeof, decltype, noexcept, alignof and typeid (of a non-polymorphic type) are not evaluated; increments or assignments inside them never happen.', 'sizeof, decltype, noexcept, alignof, (비다형 형식의) typeid 의 피연산자는 평가되지 않아 그 안의 증가나 대입은 일어나지 않습니다.'],
    fix: ['Move the side effect out of the unevaluated operand.', '부수 효과를 평가되지 않는 피연산자 밖으로 옮기세요.'],
  }, {
    check(unit, api) {
      const side = (root) => root && cf.findFirst(root, (n) => (n.type === 'UnaryExpr' && (n.op === '++' || n.op === '--')) || n.type === 'AssignExpr' || n.type === 'NewExpr' || n.type === 'DeleteExpr');
      const rep = (node, what, e) => api.report(node, M(`The side effect '${U.src(unit, e).trim()}' inside ${what} is never evaluated.`, `${what} 안의 부수 효과 '${U.src(unit, e).trim()}' 는 평가되지 않습니다.`));
      for (const n of U.nodes(unit, ['SizeofExpr', 'AlignofExpr', 'NoexceptExpr', 'DecltypeType'])) {
        const root = n.type === 'DecltypeType' ? n.expr : n.arg;
        const e = side(root);
        if (!e) continue;
        if (cf.findFirst(root, 'LambdaExpr')) continue;
        rep(n, n.type === 'SizeofExpr' ? 'sizeof' : n.type === 'AlignofExpr' ? 'alignof' : n.type === 'NoexceptExpr' ? 'noexcept' : 'decltype', e);
      }
      for (const n of U.nodes(unit, 'TypeidExpr')) {
        if (!n.arg) continue;
        const e = side(n.arg);
        if (!e) continue;
        const rt = X.recType(U.strip(n.arg).ctype);
        if (rt && X.isPolymorphic(rt)) continue;
        rep(n, 'typeid', e);
      }
    },
  }),

  rule('EXP53-CPP', {
    risk: 'HPM', cwe: ['CWE-457', 'CWE-908'], deep: 'absint:UNINIT', approx: true,
    name: ['Do not read uninitialized memory', '초기화되지 않은 메모리를 읽지 마세요'],
    why: ['A local scalar without an initializer has an indeterminate value; reading it is undefined behavior.', '초기화식 없는 지역 스칼라 변수는 값이 정해지지 않아 읽으면 정의되지 않은 동작입니다.'],
    fix: ['Initialize the variable at its declaration (int x = 0; or int x{};).', '선언할 때 변수를 초기화하세요(int x = 0; 또는 int x{};).'],
  }, {
    check(unit, api) {
      for (const v of U.nodes(unit, 'VarDecl')) {
        if (v.init || !v.symbol || v.symbol.storage !== 'automatic') continue;
        { const f = U.enclosingFn(v); if (f && U.hasParseError(f.body)) continue; }
        const blk = U.parent(U.parent(v));
        if (!blk || blk.type !== 'CompoundStmt') continue;
        const t = v.ctype && T.canonical(v.ctype);
        if (!t || !(T.isArithmetic(t) || t.kind === 'pointer' || t.kind === 'enum')) continue;
        const sym = v.symbol;
        const use = X.scanAfter(U.parent(v), (n) => {
          if (n.type === 'SizeofExpr' || n.type === 'DecltypeType' || n.type === 'AlignofExpr') return 'skip';
          if (n.type !== 'Identifier' || n.symbol !== sym) return undefined;
          const p = U.parent(n), k = U.pkey(n);
          if (p.type === 'AssignExpr' && k === 'left' && p.op === '=') return 'kill';
          if (p.type === 'UnaryExpr' && p.op === '&') return 'kill';
          if (p.type === 'CallExpr' && p.callee !== n) return 'kill'; // may be an out reference parameter
          if (p.type === 'BinaryExpr' && p.op === '>>' && k === 'right') return 'kill'; // stream extraction
          if (p.type === 'CastExpr' && U.isVoidType(p.typeName && p.typeName.ctype)) return 'kill';
          return 'use';
        });
        if (use) api.report(use, M(`'${v.name}' is read before it is assigned a value (declared without initializer at line ${v.loc.line}).`, `'${v.name}' 가 값이 대입되기 전에 읽힙니다(${v.loc.line} 행에서 초기화식 없이 선언).`));
      }
    },
  }),

  rule('EXP54-CPP', {
    risk: 'HPH', cwe: ['CWE-416', 'CWE-562', 'CWE-825'], sec: true, approx: true,
    name: ['Do not access an object outside of its lifetime', '수명이 끝난 객체에 접근하지 마세요'],
    why: ['Returning a reference or pointer to a local or a temporary, using an object after its destructor has been called, and keeping c_str()/string_view of a temporary string all leave dangling references.', '지역 변수나 임시 객체에 대한 참조·포인터 반환, 소멸자를 호출한 뒤의 객체 사용, 임시 문자열의 c_str()/string_view 보관은 모두 댕글링 참조를 남깁니다.'],
    fix: ['Return by value, keep the owning object alive (name the std::string), and do not touch an object after destroying it.', '값으로 반환하고, 소유 객체를 살려 두며(std::string 에 이름을 붙이세요), 소멸시킨 객체를 다시 쓰지 마세요.'],
  }, {
    check(unit, api) {
      for (const r of U.nodes(unit, 'ReturnStmt')) {
        if (!r.arg) continue;
        const fn = U.enclosingFn(r);
        if (!fn || fn.type !== 'FunctionDecl') continue;
        const ret = fnRetType(fn);
        const rc = ret && T.canonical(ret);
        if (!rc) continue;
        const a = U.strip(r.arg);
        if (rc.kind === 'reference') {
          const s = localObjectOf(a, fn);
          if (s) { api.report(r, M(`'${U.fnName(fn)}' returns a reference to local '${s.name}', which is destroyed when the function returns.`, `'${U.fnName(fn)}' 가 함수가 끝나면 소멸되는 지역 변수 '${s.name}' 의 참조를 반환합니다.`)); continue; }
          if (!rc.rvalue && isTemporary(r.arg)) api.report(r, M(`'${U.fnName(fn)}' returns a reference bound to the temporary '${U.src(unit, r.arg).trim()}'.`, `'${U.fnName(fn)}' 가 임시 객체 '${U.src(unit, r.arg).trim()}' 에 묶인 참조를 반환합니다.`));
        } else if (rc.kind === 'pointer') {
          let s = null;
          if (a && a.type === 'UnaryExpr' && a.op === '&') s = localObjectOf(a.arg, fn);
          else if (a && a.ctype && T.canonical(a.ctype) && T.canonical(a.ctype).kind === 'array') s = localObjectOf(a, fn);
          if (s && s.storage === 'automatic') api.report(r, M(`'${U.fnName(fn)}' returns the address of local '${s.name}', which is destroyed when the function returns.`, `'${U.fnName(fn)}' 가 함수가 끝나면 소멸되는 지역 변수 '${s.name}' 의 주소를 반환합니다.`));
          const mo = X.memberObj(a, ['c_str', 'data']);
          const ms = mo && U.idSym(mo);
          if (ms && X.isLocalOf(ms, fn) && X.isString(X.symStd(ms))) api.report(r, M(`'${U.fnName(fn)}' returns '${U.src(unit, a)}', a pointer into local string '${ms.name}' that is destroyed on return.`, `'${U.fnName(fn)}' 가 반환 시 소멸되는 지역 문자열 '${ms.name}' 내부를 가리키는 '${U.src(unit, a)}' 를 반환합니다.`));
        }
      }
      // c_str()/data() of a temporary kept in a pointer; string_view bound to a temporary string
      const keep = (where, name, init) => {
        const e = U.strip(init);
        if (!e) return;
        const mo = X.memberObj(e, ['c_str', 'data']);
        if (mo && stringTemporary(mo)) {
          api.report(where, M(`'${name}' keeps '${U.src(unit, e)}', a pointer into a temporary string destroyed at the end of the statement.`, `'${name}' 가 문장이 끝나면 소멸되는 임시 문자열 내부 포인터 '${U.src(unit, e)}' 를 보관합니다.`));
        }
      };
      for (const v of U.nodes(unit, 'VarDecl')) {
        if (!v.init) continue;
        const t = v.ctype && T.canonical(v.ctype);
        if (t && t.kind === 'pointer') keep(v, v.name, X.initExpr(v.init));
        const b = X.stdBare(U.declTypeName(v));
        if ((b === 'string_view' || b === 'wstring_view' || b === 'span') && stringTemporary(X.initExpr(v.init))) {
          api.report(v, M(`std::${b} '${v.name}' is bound to a temporary string that is destroyed at the end of the declaration.`, `std::${b} '${v.name}' 가 선언이 끝나면 소멸되는 임시 문자열을 가리킵니다.`));
        }
      }
      for (const a of U.nodes(unit, 'AssignExpr')) {
        if (a.op !== '=') continue;
        const s = U.idSym(a.left);
        const t = s && s.type && T.canonical(s.type);
        if (t && t.kind === 'pointer') keep(a, s.name, a.right);
        else if (s && ['string_view', 'wstring_view'].includes(X.symStd(s)) && stringTemporary(a.right)) {
          api.report(a, M(`std::string_view '${s.name}' is assigned a temporary string that is destroyed at the end of the statement.`, `std::string_view '${s.name}' 에 문장이 끝나면 소멸되는 임시 문자열이 대입됩니다.`));
        }
      }
      // explicit destructor call, then use of the object
      for (const c of U.nodes(unit, 'CallExpr')) {
        const m = U.skip(c.callee);
        if (!m || m.type !== 'MemberExpr' || !(m.isDestructor || /^~/.test(m.member || ''))) continue;
        const k = U.key(unit, m.object);
        if (!k) continue;
        const base = m.arrow ? k : `&${k}`;
        const use = X.scanAfter(c, (n) => {
          if (n.type === 'NewExpr' && (n.placement || []).some((p) => { const pk = U.key(unit, p); return pk === base || pk === k; })) return 'kill';
          if (n.type === 'AssignExpr' && U.key(unit, n.left) === k) return 'kill';
          if ((n.type === 'Identifier' || n.type === 'MemberExpr') && U.key(unit, n) === k) {
            const p = U.parent(n);
            if (p && p.type === 'UnaryExpr' && p.op === '&') return undefined;
            if (p && p.type === 'CallExpr' && U.libCalls && U.isLib(p, new Set(['free', 'operator delete', '::operator delete']))) return 'kill';
            return 'use';
          }
          return undefined;
        });
        if (use) api.report(use, M(`'${U.src(unit, m.object)}' is used after its destructor was called explicitly at line ${c.loc.line}.`, `'${U.src(unit, m.object)}' 가 ${c.loc.line} 행에서 소멸자를 명시적으로 호출한 뒤 사용됩니다.`));
      }
    },
  }),

  rule('EXP55-CPP', {
    risk: 'MPM', cwe: ['CWE-704'],
    name: ['Do not access a cv-qualified object through a cv-unqualified type', 'cv 한정 객체를 cv 비한정 형식으로 접근하지 마세요'],
    why: ['Writing to an object defined const after casting away const is undefined behavior; the object may live in read-only memory or be constant-folded.', 'const 로 정의된 객체에 const 를 제거한 뒤 쓰면 정의되지 않은 동작입니다. 객체가 읽기 전용 메모리에 있거나 상수로 치환되었을 수 있습니다.'],
    fix: ['Do not define the object const if it must change, or use a mutable member.', '바뀌어야 하는 객체는 const 로 정의하지 않거나 mutable 멤버를 사용하세요.'],
  }, {
    check(unit, api) {
      const isWrite = (n) => {
        let c = n, p = U.parent(c);
        while (p && (p.type === 'ParenExpr')) { c = p; p = U.parent(c); }
        if (!p) return false;
        if (p.type === 'AssignExpr' && U.pkey(c) === 'left') return true;
        if (p.type === 'UnaryExpr' && (p.op === '++' || p.op === '--')) return true;
        if (p.type === 'UnaryExpr' && p.op === '*' || p.type === 'IndexExpr' && U.pkey(c) === 'object' || p.type === 'MemberExpr' && U.pkey(c) === 'object') return isWrite(p);
        return false;
      };
      const constObj = (e) => {
        e = U.strip(e);
        if (!e) return null;
        if (e.type === 'UnaryExpr' && e.op === '&') e = U.strip(e.arg);
        if (e && e.type === 'MemberExpr' && !e.arrow) e = U.strip(e.object);
        const s = U.idSym(e);
        if (!s || s.kind !== 'variable') return null;
        const t = s.type && T.canonical(s.type);
        if (!t || t.kind === 'reference' || t.kind === 'pointer') return null;
        let base = t;
        while (base && base.kind === 'array') base = T.canonical(base.of);
        return base && base.const ? s : null;
      };
      for (const c of U.nodes(unit, 'CastExpr')) {
        if (c.kind !== 'const_cast' && c.kind !== 'c-style') continue;
        const tt = c.typeName && c.typeName.ctype && T.canonical(c.typeName.ctype);
        if (!tt || (tt.kind !== 'pointer' && tt.kind !== 'reference')) continue;
        const to = T.canonical(tt.to);
        if (!to || to.const) continue;
        const arg = U.strip(c.arg);
        if (!arg) continue;
        // this inside a const member function
        if (arg.type === 'ThisExpr') {
          const fn = U.enclosingFn(c);
          const fd = fn && fn.declarator && cf.directFunction(fn.declarator);
          const isConstFn = fd && (fd.quals || []).includes('const');
          if (isConstFn && isWrite(c)) api.report(c, M(`const_cast removes const from 'this' in const member function '${U.fnName(fn)}' and writes through it.`, `const 멤버 함수 '${U.fnName(fn)}' 에서 const_cast 로 'this' 의 const 를 제거하고 그것을 통해 씁니다.`));
          continue;
        }
        const s = constObj(arg);
        if (!s) continue;
        let written = isWrite(c);
        if (!written) {
          const r = U.resultUse(c);
          if (r.kind === 'var' && r.sym) written = (r.sym.uses || []).some((u) => u.loc.start > c.loc.start && isWrite(u));
        }
        if (written) api.report(c, M(`'${s.name}' is defined const, but it is modified through '${U.src(unit, c).trim()}'.`, `'${s.name}' 는 const 로 정의되었지만 '${U.src(unit, c).trim()}' 를 통해 수정됩니다.`));
      }
    },
  }),

  rule('EXP56-CPP', {
    risk: 'LUM', cwe: ['CWE-758'], approx: true,
    name: ['Do not call a function with a mismatched language linkage', '언어 연결이 맞지 않는 함수를 호출하지 마세요'],
    why: ['C library functions such as qsort, bsearch, atexit and pthread_create expect a pointer to a function with C language linkage; passing a C++ function (or a lambda) is undefined behavior on ABIs where the calling conventions differ.', 'qsort, bsearch, atexit, pthread_create 같은 C 라이브러리 함수는 C 언어 연결 함수의 포인터를 기대합니다. C++ 함수(또는 람다)를 넘기면 호출 규약이 다른 ABI 에서 정의되지 않은 동작입니다.'],
    fix: ['Declare the callback extern "C", or use the C++ alternative (std::sort, std::thread).', '콜백을 extern "C" 로 선언하거나 C++ 대안(std::sort, std::thread)을 사용하세요.'],
  }, {
    check(unit, api) {
      for (const c of U.libCalls(unit, new Set(Object.keys(C_CALLBACKS)))) {
        const i = C_CALLBACKS[U.callName(c)];
        if (i < 0) continue;
        let a = U.arg(c, i);
        if (!a) continue;
        if (a.type === 'UnaryExpr' && a.op === '&') a = U.strip(a.arg);
        if (a.type === 'LambdaExpr') {
          api.report(a, M(`A lambda (C++ language linkage) is passed as the callback of ${U.callName(c)}(), which expects an extern "C" function.`, `extern "C" 함수를 기대하는 ${U.callName(c)}() 의 콜백으로 람다(C++ 언어 연결)가 전달됩니다.`));
          continue;
        }
        const s = U.idSym(a);
        if (!s || s.kind !== 'function' || s.system || s.externC) continue;
        const d = (s.decls || []).find((x) => cf.enclosing(x, 'LinkageSpec'));
        if (d) continue;
        api.report(a, M(`'${s.name}' has C++ language linkage but is passed as the callback of ${U.callName(c)}(), which expects an extern "C" function.`, `'${s.name}' 는 C++ 언어 연결인데 extern "C" 함수를 기대하는 ${U.callName(c)}() 의 콜백으로 전달됩니다.`));
      }
    },
  }),

  rule('EXP57-CPP', {
    risk: 'MLM', cwe: ['CWE-758'],
    name: ['Do not cast or delete pointers to incomplete classes', '불완전 클래스에 대한 포인터를 캐스트하거나 삭제하지 마세요'],
    why: ['delete on a pointer to an incomplete class skips a non-trivial destructor and class-specific operator delete; casts involving incomplete classes cannot apply the base-class pointer adjustment.', '불완전 클래스 포인터를 delete 하면 비자명한 소멸자와 클래스 전용 operator delete 를 건너뛰고, 불완전 클래스가 관련된 캐스트는 기반 클래스 포인터 조정을 할 수 없습니다.'],
    fix: ['Include the class definition before the delete or cast (e.g. define the destructor in the .cpp file for the pimpl idiom).', 'delete 나 캐스트 전에 클래스 정의를 포함하세요(pimpl 이면 .cpp 파일에서 소멸자를 정의).'],
  }, {
    check(unit, api) {
      const incompleteAt = (rt, at) => {
        if (!rt) return false;
        const def = X.recDef(rt);
        if (!def) return true;
        if (def.loc.file === at.loc.file && def.loc.start > at.loc.start) return true;
        return false;
      };
      for (const d of U.nodes(unit, 'DeleteExpr')) {
        const rt = X.pointeeRec(d.arg && U.strip(d.arg).ctype);
        if (rt && incompleteAt(rt, d)) api.report(d, M(`'${U.src(unit, d).trim()}' deletes a pointer to incomplete class '${rt.name}'.`, `'${U.src(unit, d).trim()}' 가 불완전 클래스 '${rt.name}' 에 대한 포인터를 삭제합니다.`));
      }
      for (const c of U.nodes(unit, 'CastExpr')) {
        if (c.kind !== 'c-style' && c.kind !== 'static_cast' && c.kind !== 'reinterpret_cast') continue;
        const to = X.pointeeRec(c.typeName && c.typeName.ctype);
        const from = X.pointeeRec(c.arg && U.strip(c.arg) && U.strip(c.arg).ctype);
        if (!to || !from || to === from) continue;
        const inc = incompleteAt(to, c) ? to : incompleteAt(from, c) ? from : null;
        if (!inc) continue;
        if (c.kind === 'reinterpret_cast') continue; // explicit reinterpretation, no adjustment expected
        api.report(c, M(`Cast between '${from.name} *' and '${to.name} *' while '${inc.name}' is incomplete; no pointer adjustment can be applied.`, `'${inc.name}' 가 불완전한 상태에서 '${from.name} *' 와 '${to.name} *' 사이를 캐스트하여 포인터 조정이 적용될 수 없습니다.`));
      }
    },
  }),

  rule('EXP58-CPP', {
    risk: 'MUM', cwe: ['CWE-758'],
    name: ['Pass an object of the correct type to va_start', 'va_start 에 올바른 형식의 객체를 넘기세요'],
    why: ['The parameter named in va_start must not be a reference, a class object with non-trivial members or a type changed by default argument promotion (char, short, float, bool); otherwise the behavior is undefined.', 'va_start 에 지정하는 매개변수는 참조, 비자명한 클래스 객체, 기본 인수 승격으로 바뀌는 형식(char, short, float, bool)이면 안 됩니다. 그렇지 않으면 정의되지 않은 동작입니다.'],
    fix: ['Make the last named parameter an int, long, double or pointer, or replace the variadic function with a variadic template.', '마지막 명명 매개변수를 int, long, double 또는 포인터로 하거나 가변 함수를 가변 템플릿으로 바꾸세요.'],
  }, {
    check(unit, api) {
      for (const c of U.nodes(unit, 'CallExpr')) {
        if (!VA_START.has(U.callName(c))) continue;
        const a = U.arg(c, 1);
        const s = U.idSym(a);
        if (!s || s.kind !== 'parameter') continue;
        const decl = (s.decls || []).find((d) => d.type === 'ParamDecl') || {};
        const t = T.canonical(decl.declaredType || s.type);
        if (!t) continue;
        let why = null;
        if (t.kind === 'reference') why = M('a reference', '참조');
        else if (t.kind === 'record' || (t.kind === 'unknown' && X.stdBare(t.name))) why = M(`an object of class type ${U.typeName(t)}`, `클래스 형식 ${U.typeName(t)} 의 객체`);
        else if (t.kind === 'float' && t.name === 'float') why = M('a float, which is promoted to double', 'double 로 승격되는 float');
        else if (t.kind === 'int' && T.intRank(t) < 3 && !(t.name === 'wchar_t')) why = M(`a ${t.name}, which is promoted to int`, `int 로 승격되는 ${t.name}`);
        if (why) api.report(c, M(`va_start() is passed parameter '${s.name}', which is ${why.en}.`, `va_start() 에 ${why.ko} 인 매개변수 '${s.name}' 가 전달됩니다.`));
      }
    },
  }),

  rule('EXP59-CPP', {
    risk: 'MLM', cwe: ['CWE-758'],
    name: ['Use offsetof() on valid types and members', 'offsetof() 는 올바른 형식과 멤버에만 사용하세요'],
    why: ['offsetof is only defined for standard-layout classes and non-static data members; using it on a class with virtual functions, mixed access or references, or on a static member, is undefined or ill-formed.', 'offsetof 는 표준 레이아웃 클래스와 비정적 데이터 멤버에만 정의됩니다. 가상 함수, 혼합 접근 지정, 참조가 있는 클래스나 정적 멤버에 쓰면 정의되지 않거나 잘못된 코드입니다.'],
    fix: ['Use offsetof only on standard-layout types and their non-static data members, or use a pointer to member.', 'offsetof 는 표준 레이아웃 형식과 그 비정적 데이터 멤버에만 사용하거나 멤버 포인터를 사용하세요.'],
  }, {
    check(unit, api) {
      for (const o of U.nodes(unit, 'OffsetofExpr')) {
        const rt = X.recType(o.typeName && o.typeName.ctype);
        if (!rt) continue;
        const first = (o.designators || [])[0];
        const fsym = first && first.field;
        const rd = X.recDef(rt);
        const sh = rd && X.shape(rd);
        const name = first && first.name;
        if (sh && name) {
          if (sh.statics.some((f) => f.name === name) || (fsym && fsym.kind === 'variable')) { api.report(o, M(`offsetof(${rt.name}, ${o.member}) names static member '${name}'.`, `offsetof(${rt.name}, ${o.member}) 가 정적 멤버 '${name}' 를 지정합니다.`)); continue; }
          if (sh.methods.some((f) => f.name === name)) { api.report(o, M(`offsetof(${rt.name}, ${o.member}) names member function '${name}'.`, `offsetof(${rt.name}, ${o.member}) 가 멤버 함수 '${name}' 를 지정합니다.`)); continue; }
        }
        if (!X.isStandardLayout(rt)) api.report(o, M(`offsetof(${rt.name}, ${o.member}) is used on '${rt.name}', which is not a standard-layout class.`, `표준 레이아웃 클래스가 아닌 '${rt.name}' 에 offsetof(${rt.name}, ${o.member}) 를 사용합니다.`));
      }
    },
  }),

  rule('EXP60-CPP', {
    risk: 'HPM', cwe: ['CWE-758'], approx: true,
    name: ['Do not pass a nonstandard-layout type object across execution boundaries', '비표준 레이아웃 객체를 실행 경계 너머로 전달하지 마세요'],
    why: ['Code compiled separately (C code, another compiler, a DLL, or a C variadic function) cannot rely on the layout of a class with virtual functions, mixed access or non-trivial members such as std::string.', '따로 컴파일된 코드(C 코드, 다른 컴파일러, DLL, C 가변 함수)는 가상 함수, 혼합 접근 지정, std::string 같은 비자명한 멤버가 있는 클래스의 레이아웃에 의존할 수 없습니다.'],
    fix: ['Pass standard-layout structs or plain values (s.c_str(), fields) across the boundary.', '경계 너머로는 표준 레이아웃 구조체나 단순 값(s.c_str(), 필드)을 전달하세요.'],
  }, {
    check(unit, api) {
      const nonStd = (e) => {
        e = U.strip(e);
        if (!e) return null;
        const b = X.exprStd(e);
        if (b && /^(string|wstring|u16string|u32string|vector|map|set|list|deque|shared_ptr|unique_ptr|function|optional|variant|any)$/.test(b)) return `std::${b}`;
        const rt = X.recType(e.ctype);
        if (rt && (!X.isStandardLayout(rt) || X.isNonTrivial(rt))) return rt.name;
        return null;
      };
      for (const c of U.nodes(unit, 'CallExpr')) {
        if (U.isMemberCall(c)) continue;
        const s = c.calleeSymbol || U.idSym(c.callee);
        const ft = s && s.type && T.canonical(s.type);
        if (!ft || ft.kind !== 'function') continue;
        const fixed = (ft.params || []).length;
        if (ft.variadic && (s.system || s.externC)) {
          for (let i = fixed; i < c.args.length; i++) {
            const n = nonStd(c.args[i]);
            if (n) api.report(c.args[i], M(`Object '${U.src(unit, c.args[i]).trim()}' of non-standard-layout type ${n} is passed through the variadic arguments of ${U.callName(c)}().`, `비표준 레이아웃 형식 ${n} 의 객체 '${U.src(unit, c.args[i]).trim()}' 가 ${U.callName(c)}() 의 가변 인수로 전달됩니다.`));
          }
          continue;
        }
        if (!s.externC || s.system) continue;
        for (const a of c.args || []) {
          const e = U.strip(a);
          if (!e) continue;
          const pe = e.type === 'UnaryExpr' && e.op === '&' ? e.arg : null;
          const rt = pe ? X.recType(U.strip(pe).ctype) : X.pointeeRec(e.ctype) || X.recType(e.ctype);
          if (rt && !X.isStandardLayout(rt)) api.report(a, M(`Object of non-standard-layout class '${rt.name}' is passed to extern "C" function '${s.name}'.`, `비표준 레이아웃 클래스 '${rt.name}' 의 객체가 extern "C" 함수 '${s.name}' 에 전달됩니다.`));
        }
      }
    },
  }),

  rule('EXP61-CPP', {
    risk: 'HPH', cwe: ['CWE-416', 'CWE-562'], sec: true, approx: true,
    name: ['A lambda object must not outlive any of its reference captured objects', '람다 객체는 참조로 캡처한 객체보다 오래 살면 안 됩니다'],
    why: ['A lambda that captures locals by reference and is returned or stored in a member/global keeps dangling references once the function returns.', '지역 변수를 참조로 캡처한 람다를 반환하거나 멤버/전역에 저장하면 함수가 끝난 뒤 댕글링 참조를 갖게 됩니다.'],
    fix: ['Capture by value ([=] or [x]) or make sure the lambda does not escape the scope of the captured objects.', '값으로 캡처하거나([=], [x]) 람다가 캡처된 객체의 범위를 벗어나지 않게 하세요.'],
  }, {
    check(unit, api) {
      for (const lam of U.nodes(unit, 'LambdaExpr')) {
        const fn = U.enclosingFn(lam);
        if (!fn) continue;
        const caps = refCapturedLocals(lam, fn);
        if (!caps.length) continue;
        const names = caps.map((s) => s.name).join(', ');
        const rep = (where, how) => api.report(where, M(`Lambda capturing local(s) ${names} by reference ${how.en}; the references dangle after '${U.fnName(fn)}' returns.`, `지역 변수 ${names} 를 참조로 캡처한 람다가 ${how.ko}. '${U.fnName(fn)}' 가 끝나면 참조가 댕글링됩니다.`));
        let n = lam, p = U.parent(n);
        while (p && (p.type === 'ParenExpr' || p.type === 'CastExpr')) { n = p; p = U.parent(n); }
        if (p && p.type === 'ReturnStmt') { rep(lam, M('is returned', '반환됩니다')); continue; }
        if (p && p.type === 'AssignExpr' && U.pkey(n) === 'right' && isNonLocalTarget(p.left, fn)) { rep(lam, M(`is stored in '${U.src(unit, p.left).trim()}'`, `'${U.src(unit, p.left).trim()}' 에 저장됩니다`)); continue; }
        if (p && p.type === 'CallExpr' && U.isMemberCall(p) && /^(push_back|emplace_back|insert|emplace|push|assign)$/.test(U.callName(p)) && isNonLocalTarget(X.memberObj(p), fn)) { rep(lam, M(`is stored in '${U.src(unit, X.memberObj(p)).trim()}'`, `'${U.src(unit, X.memberObj(p)).trim()}' 에 저장됩니다`)); continue; }
        // auto l = [&]{...}; return l;  /  member = l;
        const r = (p && p.type === 'VarDecl' && p.init === n) ? p.symbol : null;
        if (!r) continue;
        for (const u of r.uses || []) {
          const up = U.parent(u);
          if (up && up.type === 'ReturnStmt') { rep(u, M(`('${r.name}') is returned`, `('${r.name}') 가 반환됩니다`)); break; }
          if (up && up.type === 'AssignExpr' && U.pkey(u) === 'right' && isNonLocalTarget(up.left, fn)) { rep(u, M(`('${r.name}') is stored in '${U.src(unit, up.left).trim()}'`, `('${r.name}') 가 '${U.src(unit, up.left).trim()}' 에 저장됩니다`)); break; }
        }
      }
    },
  }),

  rule('EXP62-CPP', {
    risk: 'HPH', cwe: ['CWE-758'], approx: true,
    name: ['Do not access the bits of an object representation that are not part of the object\'s value representation', '객체 값 표현에 속하지 않는 비트에 접근하지 마세요'],
    why: ['memset/memcpy/memcmp on a class with virtual functions or non-trivial members overwrites or compares the vtable pointer, padding and internal pointers of members such as std::string.', '가상 함수나 비자명한 멤버가 있는 클래스에 memset/memcpy/memcmp 를 쓰면 vtable 포인터, 패딩, std::string 같은 멤버의 내부 포인터를 덮어쓰거나 비교합니다.'],
    fix: ['Use constructors, assignment and comparison operators (operator==) instead of raw memory functions.', '원시 메모리 함수 대신 생성자, 대입 연산자, 비교 연산자(operator==)를 사용하세요.'],
  }, {
    check(unit, api) {
      for (const c of U.libCalls(unit, new Set(Object.keys(MEMFN)))) {
        for (const i of MEMFN[U.callName(c)]) {
          const a = U.arg(c, i);
          if (!a) continue;
          let rt = null;
          if (a.type === 'UnaryExpr' && a.op === '&') rt = X.recType(U.strip(a.arg) && U.strip(a.arg).ctype);
          else if (a.type === 'ThisExpr') rt = X.pointeeRec(a.ctype) || X.recType(a.ctype && T.canonical(a.ctype).to);
          else rt = X.pointeeRec(a.ctype);
          if (!rt) continue;
          const why = X.nonTrivialReason(rt);
          if (!why) continue;
          api.report(c, M(`${U.callName(c)}() accesses the raw bytes of '${rt.name}', which has ${why.en}.`, `${U.callName(c)}() 가 ${why.ko} 이(가) 있는 '${rt.name}' 의 원시 바이트에 접근합니다.`));
          break;
        }
      }
    },
  }),

  rule('EXP63-CPP', {
    risk: 'MPM', cwe: ['CWE-672'], approx: true,
    name: ['Do not rely on the value of a moved-from object', '이동된 객체의 값에 의존하지 마세요'],
    why: ['After std::move the source object is left in a valid but unspecified state; reading its value gives unpredictable results.', 'std::move 뒤의 원본 객체는 유효하지만 지정되지 않은 상태라 그 값을 읽으면 결과를 예측할 수 없습니다.'],
    fix: ['Reassign or reset (clear(), = {}) the object before using it again.', '다시 사용하기 전에 객체를 다시 대입하거나 초기화(clear(), = {})하세요.'],
  }, {
    check(unit, api) {
      const REINIT = new Set(['clear', 'assign', 'reset', 'emplace', 'swap', 'operator=']);
      for (const c of U.nodes(unit, 'CallExpr')) {
        if (!X.stdCall(c, ['move'])) continue;
        if (c.args.length !== 1) continue;
        const s = U.idSym(c.args[0]);
        if (!s || (s.kind !== 'variable' && s.kind !== 'parameter')) continue;
        const fn = U.enclosingFn(c);
        if (!fn || !X.isLocalOf(s, fn)) continue;
        // `x = f(std::move(x));` reassigns x once the right side is evaluated
        if (cf.ancestors(c).some((a) => a.type === 'AssignExpr' && a.op === '=' && U.idSym(a.left) === s && a.right && c.loc.start >= a.right.loc.start)) continue;
        const b = X.symStd(s);
        const smart = b === 'unique_ptr' || b === 'shared_ptr';
        const use = X.scanAfter(c, (n) => {
          if (n.type === 'CallExpr' && U.isMemberCall(n) && REINIT.has(U.callName(n)) && U.idSym(X.memberObj(n)) === s) return 'kill';
          if (n.type !== 'Identifier' || n.symbol !== s) return undefined;
          const p = U.parent(n);
          if (p.type === 'AssignExpr' && U.pkey(n) === 'left') return 'kill';
          if (smart) {
            if (p.type === 'UnaryExpr' && p.op === '*') return 'use';
            if (p.type === 'MemberExpr' && p.arrow) return 'use';
            return undefined;
          }
          if (p.type === 'MemberExpr' && /^(clear|assign|reset|swap)$/.test(p.member)) return 'kill';
          return 'use';
        });
        if (use) api.report(use, M(`'${s.name}' is used after being moved from at line ${c.loc.line}; its value is unspecified.`, `'${s.name}' 가 ${c.loc.line} 행에서 이동된 뒤 사용되어 값이 지정되지 않았습니다.`));
      }
    },
  }),

  rule('INT50-CPP', {
    risk: 'MUM', cwe: ['CWE-704'],
    name: ['Do not cast to an out-of-range enumeration value', '범위를 벗어난 열거형 값으로 캐스트하지 마세요'],
    why: ['Converting an integer outside the value range of an enumeration without a fixed underlying type is undefined behavior (unspecified before C++17).', '고정된 기반 형식이 없는 열거형의 값 범위를 벗어난 정수를 변환하면 정의되지 않은 동작입니다(C++17 이전에는 지정되지 않음).'],
    fix: ['Check the value against the enumerators before the cast, or give the enum a fixed underlying type (enum E : int).', '캐스트 전에 값을 열거자와 비교하거나 열거형에 고정 기반 형식(enum E : int)을 지정하세요.'],
  }, {
    check(unit, api) {
      for (const c of U.nodes(unit, 'CastExpr')) {
        if (!['static_cast', 'c-style', 'functional'].includes(c.kind) || !c.arg) continue;
        const et = c.typeName && c.typeName.ctype && T.canonical(c.typeName.ctype);
        if (!et || et.kind !== 'enum' || et.fixed || et.scoped) continue;
        const at = c.arg.ctype && T.canonical(c.arg.ctype);
        if (at && at.kind === 'enum') continue;
        const v = U.constInt(unit, c.arg);
        if (v == null) continue;
        const r = enumRange(et);
        if (v < r.min || v > r.max) api.report(c, M(`Value ${v} is outside the range [${r.min}, ${r.max}] of enumeration '${et.name || '<anonymous>'}'.`, `값 ${v} 는 열거형 '${et.name || '<anonymous>'}' 의 범위 [${r.min}, ${r.max}] 를 벗어납니다.`));
      }
    },
  }),
];
