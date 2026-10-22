'use strict';

// MISRA C++:2023 chapter 9 — statements.

const { R, M } = require('../lib/meta');
const U = require('../lib/util');
const F = require('../lib/flow');
const { cf } = U;

const src = (unit, e) => cf.sourceText(unit, e) || '?';
const isFallthrough = (s) => s && s.type === 'NullStmt' && (s.attributes || []).some((a) => a.name === 'fallthrough');

function endsClause(stmts) {
  const last = stmts[stmts.length - 1];
  if (!last) return false;
  if (['BreakStmt', 'ReturnStmt', 'ContinueStmt', 'GotoStmt'].includes(last.type) || isFallthrough(last)) return true;
  if (last.type === 'ExprStmt' && last.expr && U.strip(last.expr).type === 'ThrowExpr') return true;
  if (last.type === 'ExprStmt' && last.expr && U.strip(last.expr).type === 'CallExpr') {
    const s = U.strip(last.expr).calleeSymbol;
    if (s && s.noreturn) return true;
  }
  if (last.type === 'CompoundStmt') return endsClause(last.body);
  return false;
}

function exitReachableBy(g, kinds) {
  for (const e of g.exit.preds) {
    if (!g.isReachable(e.from)) continue;
    if (kinds.includes(e.kind)) return e;
  }
  return null;
}

const loopVar = (init) => {
  if (!init) return null;
  if (init.type === 'Declaration') {
    const vs = init.declarators.filter((d) => d.type === 'VarDecl');
    return vs.length === 1 ? { sym: vs[0].symbol, many: false } : { sym: null, many: vs.length > 1 };
  }
  if (init.type === 'ExprStmt' && init.expr) {
    const e = U.strip(init.expr);
    if (e.type === 'AssignExpr' && U.strip(e.left).type === 'Identifier') return { sym: U.strip(e.left).symbol, many: false };
    if (e.type === 'BinaryExpr' && e.op === ',') return { sym: null, many: true };
  }
  return null;
};

function modifiedIn(body, sym) {
  let hit = null;
  cf.walk(body, (n) => {
    if (hit) return cf.walk.STOP;
    if (n.type === 'Identifier' && n.symbol === sym) {
      const w = U.writeKind(n);
      if (w === 'assign' || w === 'compound' || w === 'incdec' || w === 'address') hit = n;
    }
    return undefined;
  });
  return hit;
}

module.exports = [
  R({
    id: '9.2.1', cat: 'Required', dec: true, sev: 'MAJOR', debt: 5,
    name: ['An explicit type conversion shall not be an expression statement', '명시적 타입 변환이 식 문장이 되면 안 됩니다'],
    why: ['A statement such as "std::lock_guard<std::mutex>(m);" creates a temporary that is destroyed at once, which is rarely intended.', '"std::lock_guard<std::mutex>(m);" 같은 문장은 곧바로 파괴되는 임시 객체를 만들 뿐이라 의도와 다른 경우가 대부분입니다.'],
    fix: ['Give the object a name, or cast to void if the value is deliberately discarded.', '객체에 이름을 붙이거나, 값을 일부러 버린다면 void 로 캐스트하세요.'],
    check(unit, api) {
      for (const s of U.ix(unit).get('ExprStmt')) {
        const e = U.strip(s.expr);
        if (!e || e.type !== 'CastExpr') continue;
        const to = U.canon((e.typeName && e.typeName.ctype) || e.ctype);
        if (to.kind === 'void') continue;
        api.report(s, M(`The explicit conversion to '${U.tstr((e.typeName && e.typeName.ctype) || e.ctype)}' is used as a statement; the temporary is discarded.`, `'${U.tstr((e.typeName && e.typeName.ctype) || e.ctype)}' 로의 명시적 변환이 문장으로 쓰여 임시 객체가 바로 버려집니다.`));
      }
    },
  }),
  R({
    id: '9.3.1', cat: 'Required', dec: true, autosar: 'M6-3-1', sev: 'MAJOR', debt: 2,
    name: ['The body of an iteration-statement or a selection-statement shall be a compound-statement', '반복문과 선택문의 본문은 복합문(중괄호) 이어야 합니다'],
    why: ['Without braces, a statement added later may look like part of the body but is not.', '중괄호가 없으면 나중에 추가한 문장이 본문처럼 보이지만 실제로는 아닙니다.'],
    fix: ['Enclose the body in braces.', '본문을 중괄호로 감싸세요.'],
    check(unit, api) {
      const x = U.ix(unit);
      const chk = (body, what, ko) => { if (body && body.type !== 'CompoundStmt') api.report(body, M(`The body of the ${what} is not enclosed in braces.`, `${ko} 의 본문이 중괄호로 감싸여 있지 않습니다.`)); };
      for (const s of x.get('WhileStmt')) chk(s.body, 'while loop', 'while 반복문');
      for (const s of x.get('DoStmt')) chk(s.body, 'do loop', 'do 반복문');
      for (const s of x.get('ForStmt', 'RangeForStmt')) chk(s.body, 'for loop', 'for 반복문');
      for (const s of x.get('SwitchStmt')) chk(s.body, 'switch', 'switch 문');
      for (const s of x.get('IfStmt')) {
        chk(s.then, 'if statement', 'if 문');
        if (s.else && s.else.type !== 'IfStmt') chk(s.else, 'else branch', 'else 갈래');
      }
    },
  }),
  R({
    id: '9.4.1', cat: 'Required', dec: true, autosar: 'M6-4-2', sev: 'MAJOR', debt: 2,
    name: ['All if ... else if constructs shall be terminated with an else statement', '모든 if ... else if 구조는 else 로 끝나야 합니다'],
    why: ['A final else shows that the remaining cases were considered.', '마지막 else 는 남은 경우도 고려했음을 보여 줍니다.'],
    fix: ['Add a final else (with a comment or defensive action if nothing is needed).', '마지막에 else 를 추가하세요 (할 일이 없으면 주석이나 방어 동작).'],
    check(unit, api) {
      for (const s of U.ix(unit).get('IfStmt')) {
        const p = U.parent(s);
        if (p && p.type === 'IfStmt' && p.else === s) continue; // inner link of a chain
        if (!s.else || s.else.type !== 'IfStmt') continue;
        let last = s.else;
        while (last.else && last.else.type === 'IfStmt') last = last.else;
        if (!last.else) api.report(last, M('The if ... else if chain has no final else.', 'if ... else if 사슬에 마지막 else 가 없습니다.'));
      }
    },
  }),
  R({
    id: '9.4.2', cat: 'Required', dec: true, autosar: 'M6-4-3', cwe: 'CWE-484', sev: 'MAJOR', debt: 10,
    name: ['The structure of a switch statement shall be appropriate', 'switch 문의 구조는 알맞아야 합니다'],
    why: ['Fall-through, missing default, labels nested in blocks and degenerate switches are common sources of mistakes.', '흘러내림, default 누락, 블록 안에 숨은 레이블, 의미 없는 switch 는 흔한 실수의 원인입니다.'],
    fix: ['End every clause with break/return/throw or [[fallthrough]], keep labels at the top level, and add a default (first or last).', '모든 절을 break/return/throw 나 [[fallthrough]] 로 끝내고, 레이블은 최상위에 두고, default 를 처음이나 끝에 두세요.'],
    check(unit, api) {
      for (const sw of U.ix(unit).get('SwitchStmt')) {
        const rep = (n, en, ko) => api.report(n, M(en, ko));
        if (!sw.body || sw.body.type !== 'CompoundStmt') { rep(sw, 'The switch body is not a compound statement.', 'switch 본문이 복합문이 아닙니다.'); continue; }
        const { prefix, clauses } = cf.switchClauses(sw);
        if (prefix.length) rep(prefix[0], 'Statements appear before the first case label.', '첫 case 레이블 앞에 문장이 있습니다.');
        // labels nested in inner statements
        cf.walk(sw.body, (n, par) => {
          if (n.type === 'SwitchStmt' && n !== sw) return cf.walk.SKIP;
          if ((n.type === 'CaseStmt' || n.type === 'DefaultStmt') && par !== sw.body && !(par && (par.type === 'CaseStmt' || par.type === 'DefaultStmt'))) rep(n, 'A switch label is nested inside another statement.', 'switch 레이블이 다른 문장 안에 들어 있습니다.');
          return undefined;
        });
        const cond = sw.cond && sw.cond.type !== 'Declaration' ? sw.cond : null;
        if (cond && U.numCat(U.strip(cond).ctype, unit.target) === 'bool') rep(cond, 'The switch condition is of type bool.', 'switch 조건이 bool 타입입니다.');
        if (clauses.length < 2) rep(sw, 'The switch has fewer than two clauses.', 'switch 의 절이 두 개보다 적습니다.');
        const defIdx = clauses.findIndex((c) => c.labels.some((l) => l.type === 'DefaultStmt'));
        if (defIdx < 0) {
          const et = cond && U.canon(U.nonRef(U.strip(cond).ctype || U.T.T.unknown));
          let covered = false;
          if (et && et.kind === 'enum' && et.constants) {
            const vals = new Set(clauses.flatMap((c) => c.labels).map((l) => String(l.constValue)));
            covered = et.constants.every((k) => vals.has(String(k.value)));
          }
          if (!covered) rep(sw, 'The switch has no default label.', 'switch 에 default 레이블이 없습니다.');
        } else if (defIdx !== 0 && defIdx !== clauses.length - 1) rep(clauses[defIdx].node, 'The default label is neither the first nor the last clause.', 'default 레이블이 첫 절도 마지막 절도 아닙니다.');
        clauses.forEach((c, i) => {
          if (!c.body.length) return;
          if (i === clauses.length - 1 && endsClause(c.body)) return;
          if (!endsClause(c.body)) rep(c.node, 'The switch clause does not end with break, return, throw or [[fallthrough]].', 'switch 절이 break, return, throw, [[fallthrough]] 로 끝나지 않습니다.');
        });
      }
    },
  }),
  R({
    id: '9.5.1', cat: 'Advisory', dec: true, autosar: 'A6-5-2', sev: 'MINOR', debt: 10,
    name: ['Legacy for statements should be simple', '전통적인 for 문은 단순해야 합니다'],
    why: ['A for loop with one counter, a simple bound and a simple step is easy to reason about; anything else hides the iteration logic.', '카운터 하나, 단순한 한계, 단순한 증감을 가진 for 문은 이해하기 쉽지만 그 밖의 형태는 반복 논리를 숨깁니다.'],
    fix: ['Use a single integer counter, compare it with a loop-invariant bound and step it by a constant; use while or range-for otherwise.', '정수 카운터 하나를 반복 중 변하지 않는 한계와 비교하고 상수로 증감하세요. 그렇지 않으면 while 이나 range-for 를 쓰세요.'],
    check(unit, api) {
      for (const f of U.ix(unit).get('ForStmt')) {
        const rep = (en, ko, n) => api.report(n || f, M(en, ko));
        if (!f.init && !f.cond && !f.inc) continue; // for (;;)
        const lv = loopVar(f.init);
        if (!lv || lv.many || !lv.sym) { rep('The for loop does not declare or initialise exactly one loop counter.', 'for 문이 카운터를 정확히 하나만 선언/초기화하지 않습니다.'); continue; }
        const sym = lv.sym;
        const ct = U.numCat(sym.type, unit.target);
        if (ct !== 'signed' && ct !== 'unsigned') { rep(`The loop counter '${sym.name}' is not of integer type.`, `카운터 '${sym.name}' 가 정수 타입이 아닙니다.`); continue; }
        const cond = f.cond && f.cond.type !== 'Declaration' ? U.strip(f.cond) : null;
        const isCounter = (e) => { e = U.strip(e); return e && e.type === 'Identifier' && e.symbol === sym; };
        if (!cond || cond.type !== 'BinaryExpr' || !['<', '<=', '>', '>=', '!='].includes(cond.op) || !(isCounter(cond.left) || isCounter(cond.right))) { rep(`The condition does not compare the counter '${sym.name}' with a bound.`, `조건이 카운터 '${sym.name}' 를 한계와 비교하지 않습니다.`, f.cond || f); continue; }
        const bound = isCounter(cond.left) ? cond.right : cond.left;
        let boundBad = null;
        cf.walk(bound, (n) => {
          if (n.type === 'Identifier' && n.symbol && (n.symbol.kind === 'variable' || n.symbol.kind === 'parameter') && modifiedIn(f.body, n.symbol)) boundBad = n;
          if (n.type === 'AssignExpr' || (n.type === 'UnaryExpr' && (n.op === '++' || n.op === '--'))) boundBad = n;
          return undefined;
        });
        if (boundBad) { rep(`The loop bound '${src(unit, bound)}' is modified in the loop.`, `반복 한계 '${src(unit, bound)}' 가 반복 안에서 바뀝니다.`, bound); continue; }
        const inc = f.inc ? U.strip(f.inc) : null;
        const simpleInc = inc && ((inc.type === 'UnaryExpr' && (inc.op === '++' || inc.op === '--') && isCounter(inc.arg))
          || (inc.type === 'AssignExpr' && (inc.op === '+=' || inc.op === '-=') && isCounter(inc.left) && U.constInt(inc.right, unit)));
        if (!simpleInc) { rep(`The increment does not step the counter '${sym.name}' by a constant.`, `증감식이 카운터 '${sym.name}' 를 상수만큼 바꾸지 않습니다.`, f.inc || f); continue; }
        const m = modifiedIn(f.body, sym);
        if (m) rep(`The loop counter '${sym.name}' is modified in the loop body.`, `카운터 '${sym.name}' 가 반복 본문에서 바뀝니다.`, m);
      }
    },
  }),
  R({
    id: '9.5.2', cat: 'Required', dec: true, sev: 'MAJOR', debt: 5,
    name: ['A for-range-initializer shall contain at most one function call', 'range-for 의 범위 식에는 함수 호출이 많아야 하나여야 합니다'],
    why: ['Temporaries created by nested calls in the range expression are destroyed before the loop body runs (dangling ranges).', '범위 식의 중첩 호출이 만든 임시 객체는 반복 본문이 실행되기 전에 파괴됩니다 (허상 범위).'],
    fix: ['Store the range in a named variable before the loop.', '반복 전에 범위를 이름 있는 변수에 저장하세요.'],
    check(unit, api) {
      for (const r of U.ix(unit).get('RangeForStmt')) {
        const calls = cf.findAll(r.range, (n) => n.type === 'CallExpr' || n.type === 'NewExpr' || (n.type === 'CastExpr' && n.kind === 'functional'));
        if (calls.length > 1) api.report(r.range, M(`The range expression contains ${calls.length} function calls.`, `범위 식에 함수 호출이 ${calls.length}개 있습니다.`));
      }
    },
  }),
  R({
    id: '9.6.1', cat: 'Advisory', dec: true, autosar: 'A6-6-1', sev: 'MINOR', debt: 10,
    name: ['The goto statement should not be used', 'goto 문은 쓰지 않아야 합니다'],
    why: ['goto makes control flow hard to follow and to verify.', 'goto 는 제어 흐름을 따라가고 검증하기 어렵게 합니다.'],
    fix: ['Use structured control flow (loops, break, return, functions).', '구조적 제어 흐름(반복문, break, return, 함수) 을 쓰세요.'],
    check(unit, api) {
      for (const g of U.ix(unit).get('GotoStmt')) api.report(g, M(`goto '${g.label || '?'}' is used.`, `goto '${g.label || '?'}' 를 씁니다.`));
    },
  }),
  R({
    id: '9.6.2', cat: 'Required', dec: true, autosar: 'M6-6-1', sev: 'MAJOR', debt: 10,
    name: ['A goto statement shall reference a label in a surrounding block', 'goto 문은 바깥 블록의 레이블만 가리켜야 합니다'],
    why: ['Jumping into a nested block skips initialisations and breaks block structure.', '중첩 블록 안으로 뛰어들면 초기화를 건너뛰고 블록 구조가 깨집니다.'],
    fix: ['Move the label to a block that encloses the goto, or restructure the code.', '레이블을 goto 를 감싸는 블록으로 옮기거나 코드를 다시 구성하세요.'],
    check(unit, api) {
      for (const g of U.ix(unit).get('GotoStmt')) {
        if (!g.label) continue;
        const fn = U.fnOf(g);
        if (!fn) continue;
        const lab = cf.findAll(fn.body, (n) => n.type === 'LabelStmt' && n.label === g.label)[0];
        if (!lab) continue;
        const block = U.parent(lab);
        if (block && !cf.ancestors(g).includes(block)) api.report(g, M(`goto '${g.label}' jumps into a block that does not enclose it.`, `goto '${g.label}' 가 자신을 감싸지 않는 블록 안으로 뜁니다.`));
      }
    },
  }),
  R({
    id: '9.6.3', cat: 'Required', dec: true, autosar: 'M6-6-2', sev: 'MAJOR', debt: 10,
    name: ['The goto statement shall jump to a label declared later in the function body', 'goto 는 함수 본문에서 뒤에 있는 레이블로만 뛰어야 합니다'],
    why: ['Backward jumps create hidden loops.', '뒤로 뛰는 goto 는 숨은 반복을 만듭니다.'],
    fix: ['Use a loop statement instead of a backward goto.', '뒤로 뛰는 goto 대신 반복문을 쓰세요.'],
    check(unit, api) {
      for (const g of U.ix(unit).get('GotoStmt')) {
        if (!g.label) continue;
        const fn = U.fnOf(g);
        if (!fn) continue;
        const lab = cf.findAll(fn.body, (n) => n.type === 'LabelStmt' && n.label === g.label)[0];
        if (lab && lab.loc.start < g.loc.start) api.report(g, M(`goto '${g.label}' jumps backwards to line ${lab.loc.line}.`, `goto '${g.label}' 가 ${lab.loc.line}행으로 뒤로 뜁니다.`));
      }
    },
  }),
  R({
    id: '9.6.4', cat: 'Required', dec: false, type: 'BUG', autosar: 'A7-6-1', sev: 'MAJOR', debt: 10,
    name: ['A function declared with the [[noreturn]] attribute shall not return', '[[noreturn]] 함수는 반환하면 안 됩니다'],
    why: ['Returning from a [[noreturn]] function is undefined behaviour.', '[[noreturn]] 함수에서 반환하는 것은 정의되지 않은 동작입니다.'],
    fix: ['End every path with a call to another noreturn function, a throw or an infinite loop.', '모든 경로를 다른 noreturn 함수 호출, throw, 무한 반복으로 끝내세요.'],
    check(unit, api) {
      for (const f of U.ix(unit).funcs) {
        if (!f.symbol || !f.symbol.noreturn) continue;
        const g = F.cfgOf(f);
        if (!g) continue;
        const e = exitReachableBy(g, ['normal', 'return', 'fallthrough']);
        if (!e) continue;
        const ret = cf.findAll(f.body, 'ReturnStmt')[0];
        api.report(ret || f, M(`The [[noreturn]] function '${f.name}' can return.`, `[[noreturn]] 함수 '${f.name}' 가 반환할 수 있습니다.`));
      }
    },
  }),
  R({
    id: '9.6.5', cat: 'Required', dec: false, type: 'BUG', autosar: 'A8-4-2', cwe: 'CWE-393', sev: 'CRITICAL', debt: 10,
    name: ['A function with non-void return type shall return a value on all paths', 'void 가 아닌 함수는 모든 경로에서 값을 반환해야 합니다'],
    why: ['Flowing off the end of a value-returning function is undefined behaviour.', '값을 반환하는 함수의 끝으로 흘러 나가는 것은 정의되지 않은 동작입니다.'],
    fix: ['Add a return statement on every path.', '모든 경로에 return 문을 넣으세요.'],
    check(unit, api) {
      for (const fn of F.bodies(unit)) {
        if (fn.type === 'FunctionDecl' && (fn.name === 'main' || fn.isConstructor || fn.isDestructor)) continue;
        let rt = null;
        if (fn.type === 'FunctionDecl') { const t = fn.ctype && U.canon(fn.ctype); rt = t && t.kind === 'function' ? t.ret : null; } else rt = fn.trailingReturn ? fn.trailingReturn.ctype : null;
        if (!rt || U.canon(rt).kind === 'void' || U.unknownT(rt)) continue;
        const g = F.cfgOf(fn);
        if (!g) continue;
        for (const r of cf.findAll(fn.body, 'ReturnStmt')) if (!r.arg && U.fnOf(r) === fn) api.report(r, M('A return statement without a value in a function returning a value.', '값을 반환하는 함수에 값 없는 return 문이 있습니다.'));
        const e = exitReachableBy(g, ['normal', 'fallthrough']);
        if (e) api.report({ file: fn.body.loc.file, line: fn.body.loc.endLine, col: Math.max(1, (fn.body.loc.endCol || 2) - 1) }, M(`Control can reach the end of '${fn.name || 'lambda'}' without returning a value.`, `'${fn.name || 'lambda'}' 의 끝에 값을 반환하지 않고 도달할 수 있습니다.`));
      }
    },
  }),
];
