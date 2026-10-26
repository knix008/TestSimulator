'use strict';

// MISRA C++:2008 chapter 6 — statements.

const { CPP08, M } = require('../../lib/meta');
const U = require('../../lib/util');
const S = require('../../lib/stmt');
const L = require('../../lib/lex');

const { cf, T } = U;

const isFloatSym = (s) => { const c = s && s.type && T.canonical(T.nonRef(s.type)); return !!c && c.kind === 'float'; };
const isBoolSym = (s) => { const c = s && s.type && T.canonical(T.nonRef(s.type)); return !!c && c.kind === 'int' && c.name === 'bool'; };

// Variables read in the loop condition other than the counter.
function controlVars(f, counter) {
  const out = new Set();
  if (!f.cond) return out;
  cf.walk(f.cond, (n) => {
    if (n.type === 'Identifier' && n.symbol && (n.symbol.kind === 'variable' || n.symbol.kind === 'parameter') && n.symbol !== counter) out.add(n.symbol);
  });
  return out;
}

function incForms(f, sym) {
  // how the counter is modified in the increment expression
  const forms = [];
  const visit = (e) => {
    const x = U.strip(e);
    if (!x) return;
    if (x.type === 'BinaryExpr' && x.op === ',') { visit(x.left); visit(x.right); return; }
    if (x.type === 'UnaryExpr' && (x.op === '++' || x.op === '--') && U.strip(x.arg).symbol === sym) forms.push({ kind: 'incdec', node: x });
    else if (x.type === 'AssignExpr' && U.strip(x.left).symbol === sym) forms.push({ kind: x.op, node: x });
  };
  visit(f.inc);
  return forms;
}

const forLoops = (unit) => U.get(unit, 'ForStmt').map((f) => ({ f, c: S.forCounter(f) }));

module.exports = [
  CPP08({
    id: '6-2-1', cat: 'R', dec: true, cpp2023: '8.18.2', c2012: '13.4',
    name: ['Assignment operators shall not be used in sub-expressions', '하위 식에서 대입 연산자를 사용하지 않아야 합니다'],
    why: ['An assignment inside a larger expression is easily mistaken for a comparison.', '큰 식 안의 대입은 비교로 착각하기 쉽습니다.'],
    fix: ['Make the assignment a separate statement.', '대입을 별도의 문으로 만드세요.'],
    reuse: 'misra-cpp:8.18.2',
  }),
  CPP08({
    id: '6-2-2', cat: 'R', dec: true, type: 'BUG', cwe: 'CWE-1077',
    name: ['Floating-point values shall not be tested for equality, directly or indirectly', '부동소수점 값의 같음을 직접 또는 간접으로 검사하지 않아야 합니다'],
    why: ['Rounding makes exact comparison unreliable.', '반올림 때문에 정확한 비교를 믿을 수 없습니다.'],
    fix: ['Compare with a tolerance.', '허용 오차와 비교하세요.'],
    check: S.floatEquality,
  }),
  CPP08({
    id: '6-2-3', cat: 'R', dec: true,
    name: ['A null statement shall be on a line by itself', '널 문장은 한 줄에 단독으로 있어야 합니다'],
    why: ['A stray semicolon sharing a line with code is easily missed.', '코드와 같은 줄의 잘못된 세미콜론은 놓치기 쉽습니다.'],
    fix: ['Put the null statement on its own line; a comment may follow after a space.', '널 문장을 단독 줄에 두세요. 공백 뒤에 주석은 허용됩니다.'],
    check: L.nullStatementLine,
  }),
  CPP08({
    id: '6-3-1', cat: 'R', dec: true, cpp2023: '9.3.1', c2012: '15.6',
    name: ['Bodies of switch, while, do and for shall be compound statements', 'switch, while, do, for의 본문은 복합 문이어야 합니다'],
    why: ['Without braces a later statement silently falls outside the body.', '중괄호가 없으면 나중의 문이 조용히 본문 밖에 놓입니다.'],
    fix: ['Enclose the body in braces.', '본문을 중괄호로 묶으세요.'],
    check(unit, api) { S.bodyCompound(unit, api, 'loops'); },
  }),
  CPP08({
    id: '6-4-1', cat: 'R', dec: true, cpp2023: '9.3.1', c2012: '15.6',
    name: ['if and else shall be followed by a compound statement (or else if)', 'if와 else 뒤에는 복합 문(또는 else if)이 와야 합니다'],
    why: ['Braces prevent dangling-else mistakes.', '중괄호는 dangling else 실수를 막습니다.'],
    fix: ['Enclose the branch in braces.', '분기를 중괄호로 묶으세요.'],
    check(unit, api) { S.bodyCompound(unit, api, 'if'); },
  }),
  CPP08({
    id: '6-4-2', cat: 'R', dec: true, cpp2023: '9.4.1', c2012: '15.7',
    name: ['An if ... else if chain shall end with an else', 'if ... else if 연쇄는 else로 끝나야 합니다'],
    why: ['A final else shows the remaining cases were considered.', '마지막 else는 남은 경우를 고려했음을 보여 줍니다.'],
    fix: ['Add a final else.', '마지막 else를 추가하세요.'],
    reuse: 'misra-cpp:9.4.1',
  }),
  CPP08({
    id: '6-4-3', cat: 'R', dec: true, cpp2023: '9.4.2', c2012: '16.1',
    name: ['A switch statement shall be well-formed', 'switch 문은 올바른 형식이어야 합니다'],
    why: ['Irregular switch bodies are hard to read and verify.', '불규칙한 switch 본문은 읽고 검증하기 어렵습니다.'],
    fix: ['Use case clauses directly in the switch body, each ending with break.', 'switch 본문에 직접 case 절을 두고 각 절을 break로 끝내세요.'],
    reuse: 'misra-cpp:9.4.2',
  }),
  CPP08({
    id: '6-4-4', cat: 'R', dec: true, c2012: '16.2',
    name: ['A switch label shall only appear directly in the switch body', 'switch 레이블은 switch 본문에 직접만 있어야 합니다'],
    why: ['Labels in nested blocks jump into the middle of statements.', '중첩 블록의 레이블은 문 중간으로 점프합니다.'],
    fix: ['Move the label to the outermost block of the switch.', '레이블을 switch의 가장 바깥 블록으로 옮기세요.'],
    reuse: 'misra-c:16.2',
  }),
  CPP08({
    id: '6-4-5', cat: 'R', dec: true, c2012: '16.3', cwe: 'CWE-484',
    name: ['Every non-empty switch clause shall end with an unconditional break or throw', '비어 있지 않은 모든 switch 절은 무조건 break나 throw로 끝나야 합니다'],
    why: ['Fall-through is usually a forgotten break.', '다음 절로 넘어가는 것은 대개 break를 잊은 것입니다.'],
    fix: ['End the clause with break or throw.', '절을 break나 throw로 끝내세요.'],
    check(unit, api) { S.clauseEnds(unit, api, true); },
  }),
  CPP08({
    id: '6-4-6', cat: 'R', dec: true, c2012: '16.4',
    name: ['The final clause of a switch shall be the default clause', 'switch의 마지막 절은 default 절이어야 합니다'],
    why: ['A final default shows that other values were considered.', '마지막 default는 다른 값을 고려했음을 보여 줍니다.'],
    fix: ['Add a default clause at the end.', '끝에 default 절을 추가하세요.'],
    check: S.defaultLast,
  }),
  CPP08({
    id: '6-4-7', cat: 'R', dec: true, c2012: '16.7',
    name: ['The condition of a switch shall not have type bool', 'switch의 조건은 bool 형식이면 안 됩니다'],
    why: ['A two-way choice is clearer as an if statement.', '두 갈래 선택은 if 문이 더 분명합니다.'],
    fix: ['Use if ... else.', 'if ... else를 사용하세요.'],
    check: S.switchBool,
  }),
  CPP08({
    id: '6-4-8', cat: 'R', dec: true, c2012: '16.6',
    name: ['Every switch statement shall have at least one case clause', '모든 switch 문에는 case 절이 하나 이상 있어야 합니다'],
    why: ['A switch without case labels selects nothing.', 'case 레이블이 없는 switch는 아무것도 선택하지 않습니다.'],
    fix: ['Add case clauses or remove the switch.', 'case 절을 추가하거나 switch를 없애세요.'],
    check: S.switchHasCase,
  }),
  CPP08({
    id: '6-5-1', cat: 'R', dec: true, cpp2023: '9.5.1', c2012: '14.1',
    name: ['A for loop shall have a single loop counter of non-floating type', 'for 반복은 부동소수점이 아닌 반복 카운터 하나를 가져야 합니다'],
    why: ['Several counters or a floating counter make the iteration count unclear.', '여러 카운터나 부동소수점 카운터는 반복 횟수를 불분명하게 만듭니다.'],
    fix: ['Use one integer counter updated in the third expression.', '세 번째 식에서 갱신하는 정수 카운터 하나를 사용하세요.'],
    check(unit, api) {
      for (const { f, c } of forLoops(unit)) {
        if (c.counters.length > 1) api.report(f, M(`This for loop has ${c.counters.length} loop counters.`, `이 for 반복에 반복 카운터가 ${c.counters.length}개 있습니다.`));
        else if (c.counters.length === 0 && (f.cond || f.inc)) api.report(f, M('This for loop has no loop counter.', '이 for 반복에 반복 카운터가 없습니다.'));
        else if (c.sym && isFloatSym(c.sym)) api.report(f, M(`Loop counter '${c.sym.name}' has floating type.`, `반복 카운터 '${c.sym.name}'가 부동소수점 형식입니다.`));
      }
    },
  }),
  CPP08({
    id: '6-5-2', cat: 'R', dec: true, cpp2023: '9.5.1',
    name: ['A counter not changed by ++ or -- shall only be tested with relational operators', '++나 --로 바꾸지 않는 카운터는 관계 연산자로만 검사해야 합니다'],
    why: ['With steps other than one, an equality test may never become true.', '1이 아닌 간격에서는 같음 검사가 끝내 참이 되지 않을 수 있습니다.'],
    fix: ['Use <, <=, > or >= in the condition.', '조건에 <, <=, >, >=를 사용하세요.'],
    check(unit, api) {
      for (const { f, c } of forLoops(unit)) {
        if (!c.sym || !f.cond) continue;
        if (incForms(f, c.sym).every((x) => x.kind === 'incdec')) continue;
        cf.walk(f.cond, (n) => {
          if (n.type === 'Identifier' && n.symbol === c.sym) {
            const { p } = U.P.upParens(n);
            if (!p || p.type !== 'BinaryExpr' || !['<', '<=', '>', '>='].includes(p.op)) api.report(n, M(`Loop counter '${c.sym.name}' is not used with a relational operator in the condition.`, `반복 카운터 '${c.sym.name}'를 조건에서 관계 연산자로 사용하지 않았습니다.`));
          }
        });
      }
    },
  }),
  CPP08({
    id: '6-5-3', cat: 'R', dec: true, cpp2023: '9.5.1', c2012: '14.2',
    name: ['The loop counter shall not be modified in the condition or the body', '반복 카운터를 조건이나 본문에서 변경하지 않아야 합니다'],
    why: ['Changing the counter elsewhere hides the iteration count.', '다른 곳에서 카운터를 바꾸면 반복 횟수가 숨습니다.'],
    fix: ['Update the counter only in the third expression.', '카운터는 세 번째 식에서만 갱신하세요.'],
    check: S.counterModifiedInBody,
  }),
  CPP08({
    id: '6-5-4', cat: 'R', dec: true, cpp2023: '9.5.1',
    name: ['The loop counter shall be changed by ++, --, += n or -= n with constant n', '반복 카운터는 ++, --, 상수 n의 += n, -= n으로 바꿔야 합니다'],
    why: ['Other updates make the number of iterations hard to determine.', '다른 갱신 방식은 반복 횟수를 알기 어렵게 합니다.'],
    fix: ['Use one of the simple update forms with an unchanging step.', '간격이 바뀌지 않는 단순한 갱신 형식 중 하나를 사용하세요.'],
    check(unit, api) {
      for (const { f, c } of forLoops(unit)) {
        if (!c.sym) continue;
        for (const x of incForms(f, c.sym)) {
          if (x.kind === 'incdec') continue;
          let ok = x.kind === '+=' || x.kind === '-=';
          if (ok && U.iceValue(unit, x.node.right) == null) {
            const ids = cf.findAll(x.node.right, 'Identifier').filter((i) => i.symbol && i.symbol.kind !== 'function');
            ok = ids.every((i) => !S.writesTo(f.body, i.symbol).length);
          }
          if (!ok) api.report(x.node, M(`Loop counter '${c.sym.name}' is updated with '${U.code(unit, x.node)}'.`, `반복 카운터 '${c.sym.name}'를 '${U.code(unit, x.node)}'로 갱신했습니다.`));
        }
      }
    },
  }),
  CPP08({
    id: '6-5-5', cat: 'R', dec: true, cpp2023: '9.5.1',
    name: ['Other loop-control variables shall not be modified in the condition or the update', '다른 반복 제어 변수를 조건이나 갱신 식에서 변경하지 않아야 합니다'],
    why: ['Hidden updates of control variables make the loop hard to understand.', '제어 변수의 숨은 갱신은 반복문을 이해하기 어렵게 합니다.'],
    fix: ['Update such variables in the loop body.', '그런 변수는 반복문 본문에서 갱신하세요.'],
    check(unit, api) {
      for (const { f, c } of forLoops(unit)) {
        for (const s of controlVars(f, c.sym)) {
          for (const part of [f.cond, f.inc]) for (const w of S.writesTo(part, s)) api.report(w, M(`Loop-control variable '${s.name}' is modified in the for statement header.`, `반복 제어 변수 '${s.name}'를 for 문 머리에서 변경했습니다.`));
        }
      }
    },
  }),
  CPP08({
    id: '6-5-6', cat: 'R', dec: true, cpp2023: '9.5.1',
    name: ['Loop-control variables modified in the body shall have type bool', '본문에서 변경하는 반복 제어 변수는 bool 형식이어야 합니다'],
    why: ['Only a Boolean flag set in the body keeps the loop termination clear.', '본문에서 설정하는 부울 플래그만이 반복 종료를 분명히 유지합니다.'],
    fix: ['Use a bool flag for early termination.', '조기 종료에는 bool 플래그를 사용하세요.'],
    check(unit, api) {
      for (const { f, c } of forLoops(unit)) {
        for (const s of controlVars(f, c.sym)) {
          if (isBoolSym(s)) continue;
          const w = S.writesTo(f.body, s);
          if (w.length) api.report(w[0], M(`Loop-control variable '${s.name}' is modified in the body but is not bool.`, `반복 제어 변수 '${s.name}'를 본문에서 변경하지만 bool이 아닙니다.`));
        }
      }
    },
  }),
  CPP08({
    id: '6-6-1', cat: 'R', dec: true, cpp2023: '9.6.2', c2012: '15.3',
    name: ['A goto label shall be in the same or an enclosing block', 'goto 레이블은 같은 블록이나 바깥 블록에 있어야 합니다'],
    why: ['Jumping into a nested block bypasses initialisations.', '중첩 블록으로 점프하면 초기화를 건너뜁니다.'],
    fix: ['Move the label or restructure the code.', '레이블을 옮기거나 코드를 재구성하세요.'],
    reuse: 'misra-cpp:9.6.2',
  }),
  CPP08({
    id: '6-6-2', cat: 'R', dec: true, cpp2023: '9.6.3', c2012: '15.2',
    name: ['goto shall jump to a label declared later in the function', 'goto는 함수에서 뒤에 선언된 레이블로 점프해야 합니다'],
    why: ['Backward jumps create hidden loops.', '뒤로 가는 점프는 숨은 반복을 만듭니다.'],
    fix: ['Use a loop statement instead.', '대신 반복문을 사용하세요.'],
    reuse: 'misra-cpp:9.6.3',
  }),
  CPP08({
    id: '6-6-3', cat: 'R', dec: true,
    name: ['continue shall only be used in a well-formed for loop', 'continue는 올바른 형식의 for 반복에서만 사용해야 합니다'],
    why: ['In other loops continue can skip the update of the control variable.', '다른 반복에서는 continue가 제어 변수의 갱신을 건너뛸 수 있습니다.'],
    fix: ['Restructure the loop body with if.', 'if로 반복 본문을 재구성하세요.'],
    check(unit, api) { S.continueUsed(unit, api, true); },
  }),
  CPP08({
    id: '6-6-4', cat: 'R', dec: true, c2012: '15.4',
    name: ['A loop shall have at most one break or goto that terminates it', '반복문을 끝내는 break나 goto는 하나 이하여야 합니다'],
    why: ['Several exits make the state after the loop hard to know.', '여러 출구는 반복 후의 상태를 알기 어렵게 합니다.'],
    fix: ['Combine the exit conditions.', '탈출 조건을 합치세요.'],
    check(unit, api) { S.multipleExits(unit, api, true); },
  }),
  CPP08({
    id: '6-6-5', cat: 'R', dec: true, c2012: '15.5',
    name: ['A function shall have a single point of exit at its end', '함수는 끝에 하나의 출구만 가져야 합니다'],
    why: ['Early returns complicate reasoning about cleanup and postconditions.', '이른 반환은 정리와 사후 조건 추론을 복잡하게 합니다.'],
    fix: ['Return once at the end.', '끝에서 한 번만 반환하세요.'],
    reuse: 'misra-c:15.5',
  }),
];
