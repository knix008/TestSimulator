'use strict';

// MISRA C:2012 / 2023 chapter 17 — functions.

const B = require('../lib/b-common');
const L = require('../lib/b-stdlib');

const { cf, T, rule, msg, nodes, functions, text, skipParens, isUser } = B;

const VA_MACROS = new Set(['va_start', 'va_arg', 'va_end', 'va_copy']);

function hasNoreturnSpec(fd) {
  const specOk = (sp) => sp && ((sp.functionSpecs || []).includes('_Noreturn') || (sp.attributes || []).some((a) => a.name === 'noreturn' || a.name === '_Noreturn'));
  const attrOk = (n) => n && (n.attributes || []).some((a) => a.name === 'noreturn' || a.name === '_Noreturn');
  const decls = fd.symbol && fd.symbol.decls ? fd.symbol.decls : [fd];
  return decls.concat([fd]).some((d) => d && d.type === 'FunctionDecl' && (specOk(d.specs) || attrOk(d) || attrOk(d.declarator) || attrOk(cf.parentOf(d))));
}

function returnType(fd) {
  const t = B.canon(fd.ctype);
  return t && t.kind === 'function' ? B.canon(t.ret) : null;
}

// Exit edges of a function that are reached by normal control flow:
// { falls: Edge[] (end of body reached), returns: Edge[] }
function exitPaths(fd) {
  const g = cf.getCFG(fd);
  const reach = g.reachable();
  const falls = [];
  const returns = [];
  for (const e of g.exit.preds) {
    if (!reach.has(e.from)) continue;
    if (e.kind === 'return') returns.push(e);
    else if (e.kind === 'noreturn' || e.kind === 'throw') continue;
    else falls.push(e);
  }
  return { falls, returns };
}

function endLoc(fd) {
  const l = fd.body.loc;
  return { file: l.file, line: l.endLine, column: Math.max(1, (l.endCol || 2) - 1) };
}

function ignoredResult(node) {
  let n = node;
  for (let i = 0; i < 50; i++) {
    const p = cf.parentOf(n);
    if (!p) return false;
    if (p.type === 'ParenExpr') { n = p; continue; }
    if (p.type === 'ExprStmt') return true;
    if (p.type === 'ForStmt' && cf.parentKey(n) === 'inc') return true;
    if (p.type === 'BinaryExpr' && p.op === ',') { if (p.left === n) return true; n = p; continue; }
    return false;
  }
  return false;
}

function headerIncluded(unit, h) {
  return unit.includes.some((i) => i.name === h);
}

module.exports = [
  rule({
    id: '17.1', cat: 'Required', debt: 30, decidable: true, cert: 'DCL50-CPP',
    name: ['The features of <stdarg.h> shall not be used', '<stdarg.h>의 기능을 사용하면 안 됩니다'],
    why: ['Variable argument lists bypass type checking of the arguments, and misuse of va_arg is undefined behaviour.', '가변 인자 목록은 인자의 형 검사를 우회하며, va_arg를 잘못 쓰면 정의되지 않은 동작이 됩니다.'],
    fix: ['Use functions with a fixed, typed parameter list.', '형이 정해진 고정 매개변수 목록의 함수를 사용하세요.'],
    check(unit, api) {
      for (const e of unit.expansions) {
        if (!B.isUserLoc(e) || !VA_MACROS.has(e.name) || e.nested) continue;
        if (!e.def || !e.def.file || !e.def.file.startsWith('<')) continue;
        api.report(e, msg(`'${e.name}' from <stdarg.h> is used.`, `<stdarg.h>의 '${e.name}'을(를) 사용했습니다.`));
      }
      for (const nt of nodes(unit, 'NamedType')) {
        if (nt.name === 'va_list') api.report(nt, msg('The type \'va_list\' from <stdarg.h> is used.', '<stdarg.h>의 형 \'va_list\'를 사용했습니다.'));
      }
    },
  }),
  rule({
    id: '17.2', cat: 'Required', debt: 30, decidable: false, cwe: 'CWE-674',
    name: ['Functions shall not call themselves, directly or indirectly', '함수는 직접이든 간접이든 자기 자신을 호출하면 안 됩니다'],
    why: ['Recursion can exhaust the stack, and its maximum depth is hard to bound at compile time.', '재귀는 스택을 고갈시킬 수 있고 최대 깊이를 컴파일 시점에 제한하기 어렵습니다.'],
    fix: ['Rewrite the algorithm iteratively with a bounded loop or an explicit stack.', '제한된 루프나 명시적 스택을 사용하는 반복 방식으로 다시 작성하세요.'],
    project(project, api) {
      const cg = project.callGraph;
      if (!cg) return;
      for (const scc of cg.recursion()) {
        const names = scc.map((k) => (cg.nodes.get(k) || { name: k }).name);
        for (const k of scc) {
          const n = cg.nodes.get(k);
          if (!n) continue;
          for (const d of n.definitions) {
            if (!isUser(d.node)) continue;
            const self = scc.length === 1;
            api.report(d.node.nameLoc ? { ...d.node.nameLoc, file: d.node.loc.file } : d.node, self
              ? msg(`'${n.name}' calls itself recursively.`, `'${n.name}'이(가) 자기 자신을 재귀 호출합니다.`)
              : msg(`'${n.name}' is part of the recursive call cycle ${names.join(' -> ')} -> ${names[0]}.`, `'${n.name}'이(가) 재귀 호출 순환 ${names.join(' -> ')} -> ${names[0]}에 속합니다.`), { file: d.node.loc.file });
          }
        }
      }
    },
  }),
  rule({
    id: '17.3', cat: 'Mandatory', type: 'BUG', sev: 'CRITICAL', debt: 5, decidable: true, cwe: 'CWE-628', cert: 'DCL31-C',
    name: ['A function shall not be declared implicitly', '함수를 암시적으로 선언하면 안 됩니다'],
    why: ['Calling an undeclared function makes the compiler assume it returns int and skips all argument checks.', '선언되지 않은 함수를 호출하면 컴파일러가 int 반환을 가정하고 인자 검사를 모두 건너뜁니다.'],
    fix: ['Include the header that declares the function, or declare a prototype before the call.', '함수를 선언한 헤더를 포함하거나 호출 전에 프로토타입을 선언하세요.'],
    check(unit, api) {
      for (const c of nodes(unit, 'CallExpr')) {
        const callee = skipParens(c.callee);
        const s = c.calleeSymbol || (callee && callee.symbol);
        if (!s || !s.implicit) continue;
        // library functions missing from the front end's built-in headers
        const h = L.HEADER_OF.get(s.name);
        if (h && headerIncluded(unit, h)) continue;
        if (B.maybeDeclaredInMissingHeader(unit, api.project, s)) continue;
        api.report(c, msg(`'${s.name}' is called without a visible declaration.`, `'${s.name}'을(를) 선언 없이 호출했습니다.`));
      }
    },
  }),
  rule({
    id: '17.4', cat: 'Mandatory', type: 'BUG', sev: 'CRITICAL', debt: 10, decidable: true, cwe: 'CWE-394', cert: 'MSC37-C',
    name: ['Every exit path of a non-void function shall return a value', 'void가 아닌 함수의 모든 종료 경로는 값을 반환해야 합니다'],
    why: ['Using the value of a function that ended without a return expression is undefined behaviour.', 'return 식 없이 끝난 함수의 값을 사용하면 정의되지 않은 동작입니다.'],
    fix: ['End every path with a return statement that has an expression.', '모든 경로를 식이 있는 return 문으로 끝내세요.'],
    check(unit, api) {
      for (const fd of functions(unit)) {
        const rt = returnType(fd);
        if (!rt || T.isVoid(rt)) continue;
        const { falls } = exitPaths(fd);
        if (falls.length) api.report(endLoc(fd), msg(`Control can reach the end of non-void function '${fd.name}' without a return value.`, `void가 아닌 함수 '${fd.name}'이(가) 반환 값 없이 끝에 도달할 수 있습니다.`));
        cf.walk(fd.body, (n) => {
          if (n.type === 'LambdaExpr') return cf.walk.SKIP;
          if (n.type === 'ReturnStmt' && !n.arg) api.report(n, msg(`'return' without a value in non-void function '${fd.name}'.`, `void가 아닌 함수 '${fd.name}'에서 값 없이 'return'합니다.`));
          return undefined;
        });
      }
    },
  }),
  rule({
    id: '17.5', cat: 'Advisory', type: 'BUG', debt: 10, decidable: false, cwe: 'CWE-119',
    name: ['An array argument shall have at least the declared number of elements', '배열 인자는 선언된 개수 이상의 요소를 가져야 합니다'],
    why: ['A parameter declared as an array of N elements tells readers (and tools) that N elements will be accessed; a shorter array leads to out-of-bounds accesses.', 'N개 요소 배열로 선언된 매개변수는 N개 요소에 접근함을 뜻하므로, 더 짧은 배열을 넘기면 범위 밖 접근이 일어납니다.'],
    fix: ['Pass an array with enough elements, or change the parameter declaration.', '충분한 요소를 가진 배열을 넘기거나 매개변수 선언을 고치세요.'],
    check(unit, api) {
      for (const c of nodes(unit, 'CallExpr')) {
        const s = c.calleeSymbol;
        if (!s) continue;
        const fd = (s.decls || []).find((d) => d.type === 'FunctionDecl' && d.params && d.params.some((p) => p.declaredType && B.isArrayType(p.declaredType)));
        if (!fd) continue;
        fd.params.forEach((p, i) => {
          const at = B.canon(p.declaredType);
          if (!at || at.kind !== 'array' || at.size == null || !c.args[i]) return;
          const arg = B.stripCasts(c.args[i]);
          let n = null;
          if (arg.type === 'Identifier' && arg.symbol && arg.symbol.kind !== 'parameter' && B.isArrayType(arg.symbol.type)) n = B.canon(arg.symbol.type).size;
          else if (arg.type === 'MemberExpr' && B.isArrayType(arg.ctype)) n = B.canon(arg.ctype).size;
          else if (arg.type === 'StringLiteral' && !arg.incomplete) n = arg.length;
          if (n != null && n < at.size) api.report(c.args[i], msg(`'${text(unit, c.args[i])}' has ${n} elements but parameter '${p.name || i + 1}' of '${s.name}' is declared with ${at.size}.`, `'${text(unit, c.args[i])}'의 요소는 ${n}개인데 '${s.name}'의 매개변수 '${p.name || i + 1}'은(는) ${at.size}개로 선언되었습니다.`));
        });
      }
    },
  }),
  rule({
    id: '17.6', cat: 'Mandatory', type: 'BUG', debt: 5, decidable: true,
    name: ['Array parameters shall not use the static keyword between the brackets', '배열 매개변수의 대괄호 안에 static을 쓰면 안 됩니다'],
    why: ['[static N] promises at least N elements; if a caller breaks that promise the behaviour is undefined and compilers may optimise on it.', '[static N]은 최소 N개 요소를 약속하며, 호출자가 이를 어기면 정의되지 않은 동작이 되고 컴파일러가 이를 전제로 최적화할 수 있습니다.'],
    fix: ['Remove static from the array parameter declaration.', '배열 매개변수 선언에서 static을 제거하세요.'],
    check(unit, api) {
      for (const a of nodes(unit, 'ArrayDeclarator')) {
        if (!a.isStatic) continue;
        const p = cf.enclosing(a, 'ParamDecl');
        api.report(a, msg(`Parameter '${(p && p.name) || '?'}' uses 'static' in its array declarator.`, `매개변수 '${(p && p.name) || '?'}'의 배열 선언자에 'static'을 사용했습니다.`));
      }
    },
  }),
  rule({
    id: '17.7', cat: 'Required', debt: 5, decidable: true, cwe: 'CWE-252', cert: 'EXP12-C',
    name: ['The value returned by a non-void function shall be used', 'void가 아닌 함수의 반환 값은 사용해야 합니다'],
    why: ['Ignoring a returned value often means ignoring an error status.', '반환 값을 무시하면 오류 상태를 무시하는 경우가 많습니다.'],
    fix: ['Use the value, or cast the call to (void) to show that it is ignored on purpose.', '값을 사용하거나, 의도적으로 무시함을 보이려면 호출을 (void)로 형 변환하세요.'],
    check(unit, api) {
      for (const c of nodes(unit, 'CallExpr')) {
        const t = B.canon(c.ctype);
        if (!t || T.isVoid(t) || T.isUnknown(t)) continue;
        // an undeclared function has no known return value (17.3 reports the call)
        const s = c.calleeSymbol || (skipParens(c.callee) && skipParens(c.callee).symbol);
        if (s && s.implicit) continue;
        if (!ignoredResult(c)) continue;
        const n = B.calleeName(c) || text(unit, c.callee);
        api.report(c, msg(`The value returned by '${n}' is discarded.`, `'${n}'의 반환 값을 버렸습니다.`));
      }
    },
  }),
  rule({
    id: '17.8', cat: 'Advisory', debt: 5, decidable: false,
    name: ['A function parameter should not be modified', '함수 매개변수를 수정하지 않아야 합니다'],
    why: ['Modifying a parameter loses the original argument value and is often mistaken for changing the caller\'s object.', '매개변수를 수정하면 원래 인자 값을 잃고, 호출자의 객체를 바꾸는 것으로 오해하기 쉽습니다.'],
    fix: ['Copy the parameter into a local variable and modify the copy.', '매개변수를 지역 변수에 복사해 그 복사본을 수정하세요.'],
    check(unit, api) {
      const check = (target, node) => {
        const s = B.lvalueBase(target);
        if (s && s.kind === 'parameter') api.report(node, msg(`Parameter '${s.name}' is modified.`, `매개변수 '${s.name}'을(를) 수정합니다.`));
      };
      for (const a of nodes(unit, 'AssignExpr')) check(a.left, a);
      for (const u of nodes(unit, 'UnaryExpr')) if (u.op === '++' || u.op === '--') check(u.arg, u);
    },
  }),
  rule({
    id: '17.9', cat: 'Mandatory', type: 'BUG', sev: 'CRITICAL', debt: 10, decidable: false, amd: 'AMD3',
    name: ['A function declared _Noreturn shall not return', '_Noreturn으로 선언된 함수는 반환하면 안 됩니다'],
    why: ['Returning from a function declared _Noreturn is undefined behaviour; callers are compiled assuming it never comes back.', '_Noreturn으로 선언된 함수에서 반환하면 정의되지 않은 동작이며, 호출자는 반환하지 않는다고 가정하고 컴파일됩니다.'],
    fix: ['Make every path end in a call to a no-return function or an endless loop, or remove _Noreturn.', '모든 경로가 반환하지 않는 함수 호출이나 무한 루프로 끝나게 하거나 _Noreturn을 제거하세요.'],
    check(unit, api) {
      for (const fd of functions(unit)) {
        if (!hasNoreturnSpec(fd)) continue;
        const { falls, returns } = exitPaths(fd);
        for (const e of returns) {
          const r = e.from.elements.find((x) => x.type === 'ReturnStmt');
          api.report(r || fd, msg(`_Noreturn function '${fd.name}' returns here.`, `_Noreturn 함수 '${fd.name}'이(가) 여기에서 반환합니다.`));
        }
        if (falls.length) api.report(endLoc(fd), msg(`_Noreturn function '${fd.name}' can reach the end of its body.`, `_Noreturn 함수 '${fd.name}'이(가) 본문 끝에 도달할 수 있습니다.`));
      }
    },
  }),
  rule({
    id: '17.10', cat: 'Required', debt: 5, decidable: true, amd: 'AMD3',
    name: ['A _Noreturn function shall have void return type', '_Noreturn 함수의 반환형은 void여야 합니다'],
    why: ['A return type on a function that never returns is meaningless and misleading.', '반환하지 않는 함수의 반환형은 의미가 없고 오해를 부릅니다.'],
    fix: ['Declare the function with return type void.', '함수의 반환형을 void로 선언하세요.'],
    check(unit, api) {
      for (const fd of nodes(unit, 'FunctionDecl')) {
        if (!hasNoreturnSpec(fd)) continue;
        const rt = returnType(fd);
        if (rt && !T.isVoid(rt)) api.report(fd.nameLoc ? { ...fd.nameLoc, file: fd.loc.file } : fd, msg(`_Noreturn function '${fd.name}' has return type '${T.typeToString(rt)}'.`, `_Noreturn 함수 '${fd.name}'의 반환형이 '${T.typeToString(rt)}'입니다.`));
      }
    },
  }),
  rule({
    id: '17.11', cat: 'Advisory', debt: 5, decidable: false, amd: 'AMD3',
    name: ['A function that never returns should be declared _Noreturn', '반환하지 않는 함수는 _Noreturn으로 선언해야 합니다'],
    why: ['Declaring the property lets readers and the compiler know that control does not come back after the call.', '이 속성을 선언하면 호출 후 제어가 돌아오지 않음을 독자와 컴파일러가 알 수 있습니다.'],
    fix: ['Add the _Noreturn function specifier to the declarations of the function.', '함수 선언에 _Noreturn 함수 지정자를 추가하세요.'],
    check(unit, api) {
      for (const fd of functions(unit)) {
        if (hasNoreturnSpec(fd) || fd.name === 'main') continue;
        const { falls, returns } = exitPaths(fd);
        if (falls.length || returns.length) continue;
        api.report(fd.nameLoc ? { ...fd.nameLoc, file: fd.loc.file } : fd, msg(`'${fd.name}' never returns but is not declared _Noreturn.`, `'${fd.name}'은(는) 반환하지 않지만 _Noreturn으로 선언되지 않았습니다.`));
      }
    },
  }),
  rule({
    id: '17.12', cat: 'Advisory', debt: 2, decidable: true, amd: 'AMD3',
    name: ['A function identifier should only be called or used with &', '함수 식별자는 호출하거나 &와 함께만 사용해야 합니다'],
    why: ['A bare function name used as a value is easily mistaken for a call with the parentheses forgotten.', '값으로 쓴 함수 이름은 괄호를 빠뜨린 호출로 오해하기 쉽습니다.'],
    fix: ['Write &f when the address of the function is meant.', '함수의 주소를 의도했다면 &f로 쓰세요.'],
    check(unit, api) {
      for (const id of nodes(unit, 'Identifier')) {
        if (!id.symbol || id.symbol.kind !== 'function') continue;
        let n = id;
        let p = cf.parentOf(n);
        while (p && p.type === 'ParenExpr') { n = p; p = cf.parentOf(p); }
        if (!p) continue;
        if (p.type === 'CallExpr' && p.callee === n) continue;
        if (p.type === 'UnaryExpr' && p.op === '&') continue;
        if (p.type === 'SizeofExpr' || p.type === 'GenericSelection') continue;
        api.report(id, msg(`Function '${id.name}' is used without '&' or a call.`, `함수 '${id.name}'을(를) '&'나 호출 없이 사용했습니다.`));
      }
    },
  }),
  rule({
    id: '17.13', cat: 'Required', type: 'BUG', debt: 5, decidable: true, amd: 'AMD3',
    name: ['A function type shall not be type-qualified', '함수 형에 형 한정자를 붙이면 안 됩니다'],
    why: ['Qualifying a function type (through a typedef) is undefined behaviour in C.', '(typedef를 통해) 함수 형에 한정자를 붙이는 것은 C에서 정의되지 않은 동작입니다.'],
    fix: ['Remove the const/volatile qualifier from the function type.', '함수 형에서 const/volatile 한정자를 제거하세요.'],
    check(unit, api) {
      for (const ds of nodes(unit, 'DeclSpec')) {
        const q = (ds.qualifiers || []).filter((x) => x === 'const' || x === 'volatile' || x === 'restrict');
        if (!q.length || !ds.typeSpec) continue;
        if (!B.isFunctionType(ds.typeSpec.ctype)) continue;
        api.report(ds, msg(`The function type '${text(unit, ds.typeSpec)}' is qualified with '${q.join(' ')}'.`, `함수 형 '${text(unit, ds.typeSpec)}'에 '${q.join(' ')}' 한정자가 붙었습니다.`));
      }
    },
  }),
];
