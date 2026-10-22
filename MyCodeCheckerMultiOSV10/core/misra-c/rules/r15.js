'use strict';

// MISRA C:2012 / 2023 chapter 15 — control flow.

const B = require('../lib/b-common');

const { cf, rule, msg, nodes, functions } = B;

const LOOPS = ['WhileStmt', 'DoStmt', 'ForStmt'];

function labelStmtOf(g) {
  const s = g.labelSymbol;
  if (s && s.decls) {
    const d = s.decls.find((x) => x.type === 'LabelStmt');
    if (d) return d;
    if (s.definition && s.definition.type === 'LabelStmt') return s.definition;
  }
  // fall back: search the function
  const fn = cf.enclosing(g, 'FunctionDecl');
  if (!fn || !g.label) return null;
  return cf.findFirst(fn.body, (n) => n.type === 'LabelStmt' && n.label === g.label);
}

// The "block" a statement belongs to: nearest compound statement, or the
// switch clause holding it when that clause is not a compound statement.
function blockOf(stmt) {
  let n = stmt;
  for (let p = cf.parentOf(n); p; n = p, p = cf.parentOf(p)) {
    if (p.type === 'CaseStmt' || p.type === 'DefaultStmt' || p.type === 'LabelStmt') continue;
    if (p.type === 'CompoundStmt') {
      const sw = cf.parentOf(p);
      if (sw && sw.type === 'SwitchStmt' && sw.body === p) {
        const cl = cf.switchClauses(sw).clauses.find((c) => c.labels.includes(n) || c.body.includes(n) || c.labels.some((l) => l === n));
        if (cl) return cl.node;
      }
      return p;
    }
    if (p.type === 'FunctionDecl') return p;
    // other statements (if, loops) nest: the body is itself a block when not compound
    return n;
  }
  return null;
}

function containsNode(root, x) {
  for (let n = x; n; n = cf.parentOf(n)) if (n === root) return true;
  return false;
}

// For a switch clause node used as a block, membership means the statement
// belongs to that clause.
function insideBlock(block, stmt) {
  if (!block) return false;
  if (block.type === 'CaseStmt' || block.type === 'DefaultStmt') {
    const sw = cf.enclosing(block, 'SwitchStmt');
    const cl = sw && cf.switchClauses(sw).clauses.find((c) => c.node === block);
    if (!cl) return containsNode(block, stmt);
    return [...cl.labels, ...cl.body].some((s) => containsNode(s, stmt));
  }
  return containsNode(block, stmt);
}

// The loop or switch a break statement leaves.
function breakTarget(b) {
  return cf.enclosing(b, [...LOOPS, 'SwitchStmt']);
}

module.exports = [
  rule({
    id: '15.1', cat: 'Advisory', debt: 10, decidable: true,
    name: ['The goto statement should not be used', 'goto 문을 사용하지 않아야 합니다'],
    why: ['Unstructured jumps make the control flow hard to follow and to verify.', '구조화되지 않은 점프는 제어 흐름을 따라가고 검증하기 어렵게 합니다.'],
    fix: ['Restructure the code with loops, if statements or a helper function.', '반복문, if 문 또는 보조 함수로 코드를 재구성하세요.'],
    check(unit, api) {
      for (const g of nodes(unit, 'GotoStmt')) api.report(g, msg(`'goto ${g.label || '*'}' is used.`, `'goto ${g.label || '*'}'를 사용했습니다.`));
    },
  }),
  rule({
    id: '15.2', cat: 'Required', debt: 10, decidable: true,
    name: ['goto shall jump to a label declared later in the same function', 'goto는 같은 함수에서 뒤에 선언된 레이블로만 점프해야 합니다'],
    why: ['A backward goto creates a hidden loop that the loop statements of the language would express more clearly.', '뒤로 가는 goto는 언어의 반복문으로 더 명확히 표현할 수 있는 숨은 루프를 만듭니다.'],
    fix: ['Replace the backward jump with a loop statement.', '뒤로 가는 점프를 반복문으로 바꾸세요.'],
    check(unit, api) {
      for (const g of nodes(unit, 'GotoStmt')) {
        if (g.computed) continue;
        const l = labelStmtOf(g);
        if (l && l.loc.start < g.loc.start) api.report(g, msg(`'goto ${g.label}' jumps backwards to line ${l.loc.line}.`, `'goto ${g.label}'가 ${l.loc.line}행으로 뒤로 점프합니다.`));
      }
    },
  }),
  rule({
    id: '15.3', cat: 'Required', debt: 10, decidable: true,
    name: ['A goto label shall be in a block enclosing the goto', 'goto의 레이블은 goto를 감싸는 블록에 있어야 합니다'],
    why: ['Jumping into a nested block or another switch clause skips initialisations and makes the code structure misleading.', '중첩된 블록이나 다른 switch 절로 점프하면 초기화를 건너뛰고 코드 구조가 오해를 부릅니다.'],
    fix: ['Move the label to the block of the goto or to an enclosing block.', '레이블을 goto가 있는 블록이나 그것을 감싸는 블록으로 옮기세요.'],
    check(unit, api) {
      for (const g of nodes(unit, 'GotoStmt')) {
        if (g.computed) continue;
        const l = labelStmtOf(g);
        if (!l) continue;
        const blk = blockOf(l);
        if (blk && !insideBlock(blk, g)) api.report(g, msg(`'goto ${g.label}' jumps into a block that does not enclose it (label at line ${l.loc.line}).`, `'goto ${g.label}'가 자신을 감싸지 않는 블록으로 점프합니다(레이블 ${l.loc.line}행).`));
      }
    },
  }),
  rule({
    id: '15.4', cat: 'Advisory', debt: 10, decidable: true,
    name: ['A loop should have at most one break or goto that leaves it', '루프에는 루프를 빠져나가는 break나 goto가 하나 이하여야 합니다'],
    why: ['Several exits from one loop make its termination conditions hard to understand.', '한 루프에 출구가 여러 개 있으면 종료 조건을 이해하기 어렵습니다.'],
    fix: ['Combine the exit conditions into one, for example with a flag tested in the loop condition.', '루프 조건에서 검사하는 플래그 등으로 종료 조건을 하나로 합치세요.'],
    check(unit, api) {
      for (const loop of nodes(unit, LOOPS)) {
        const exits = [];
        cf.walk(loop.body, (n) => {
          if (n.type === 'BreakStmt' && breakTarget(n) === loop) exits.push(n);
          if (n.type === 'GotoStmt' && !n.computed) {
            const l = labelStmtOf(n);
            if (l && !containsNode(loop, l)) exits.push(n);
          }
        });
        if (exits.length > 1) api.report(exits[1], msg(`This loop (line ${loop.loc.line}) has ${exits.length} break/goto exits.`, `이 루프(${loop.loc.line}행)에 break/goto 출구가 ${exits.length}개 있습니다.`));
      }
    },
  }),
  rule({
    id: '15.5', cat: 'Advisory', debt: 15, decidable: true,
    name: ['A function should have a single point of exit at its end', '함수의 종료 지점은 끝에 하나만 있어야 합니다'],
    why: ['Early returns make it easy to skip clean-up code at the end of the function.', '중간 반환은 함수 끝의 정리 코드를 건너뛰기 쉽게 만듭니다.'],
    fix: ['Store the result in a variable and return once, as the last statement.', '결과를 변수에 저장하고 마지막 문에서 한 번만 반환하세요.'],
    check(unit, api) {
      for (const fn of functions(unit)) {
        const rets = [];
        cf.walk(fn.body, (n) => { if (n.type === 'LambdaExpr' || n.type === 'StmtExpr') return cf.walk.SKIP; if (n.type === 'ReturnStmt') rets.push(n); return undefined; });
        const last = fn.body.body[fn.body.body.length - 1];
        for (const r of rets) {
          if (r === last) continue;
          api.report(r, msg(`'${fn.name}' returns before its final statement.`, `'${fn.name}'이(가) 마지막 문 이전에 반환합니다.`));
        }
      }
    },
  }),
  rule({
    id: '15.6', cat: 'Required', debt: 2, decidable: true, cwe: 'CWE-483',
    name: ['Bodies of loops and selection statements shall be compound statements', '반복문과 선택문의 본문은 복합문이어야 합니다'],
    why: ['Without braces, a statement added later may look as if it belongs to the body although it does not.', '중괄호가 없으면 나중에 추가한 문이 본문에 속한 것처럼 보이지만 실제로는 아닙니다.'],
    fix: ['Enclose the body in braces.', '본문을 중괄호로 감싸세요.'],
    check(unit, api) {
      const bad = (body, what) => {
        if (body && body.type !== 'CompoundStmt') api.report(body, msg(`The body of this ${what} is not enclosed in braces.`, `이 ${what}의 본문이 중괄호로 감싸여 있지 않습니다.`));
      };
      for (const s of nodes(unit, 'WhileStmt')) bad(s.body, 'while');
      for (const s of nodes(unit, 'DoStmt')) bad(s.body, 'do');
      for (const s of nodes(unit, 'ForStmt')) bad(s.body, 'for');
      for (const s of nodes(unit, 'SwitchStmt')) bad(s.body, 'switch');
      for (const s of nodes(unit, 'IfStmt')) {
        bad(s.then, 'if');
        if (s.else && s.else.type !== 'IfStmt') bad(s.else, 'else');
      }
    },
  }),
  rule({
    id: '15.7', cat: 'Required', debt: 5, decidable: true,
    name: ['An if ... else if chain shall end with an else', 'if ... else if 연쇄는 else로 끝나야 합니다'],
    why: ['A final else shows that the remaining cases were considered, like the default of a switch.', '마지막 else는 switch의 default처럼 나머지 경우를 고려했음을 보여줍니다.'],
    fix: ['Add a final else, with a comment or defensive action when nothing is to be done.', '할 일이 없으면 주석이나 방어 코드를 넣은 마지막 else를 추가하세요.'],
    check(unit, api) {
      for (const s of nodes(unit, 'IfStmt')) {
        const p = cf.parentOf(s);
        if (p && p.type === 'IfStmt' && p.else === s) continue; // not the head of the chain
        if (!s.else || s.else.type !== 'IfStmt') continue;
        let last = s.else;
        while (last.else && last.else.type === 'IfStmt') last = last.else;
        if (!last.else) api.report(last, msg('This if ... else if chain has no final else.', '이 if ... else if 연쇄에 마지막 else가 없습니다.'));
      }
    },
  }),
];
