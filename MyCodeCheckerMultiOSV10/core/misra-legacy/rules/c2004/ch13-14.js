'use strict';

// MISRA C:2004 chapter 13 — control statement expressions; chapter 14 — control flow.

const { C04, M } = require('../../lib/meta');
const U = require('../../lib/util');
const S = require('../../lib/stmt');
const L = require('../../lib/lex');

const { cf } = U;

const BOOL_OPS = new Set(['&&', '||', '<', '>', '<=', '>=', '==', '!=']);

// Assignments inside expressions whose value is used as a Boolean.
function assignInBoolean(unit, api) {
  for (const a of U.get(unit, 'AssignExpr')) {
    let n = a;
    let p = cf.parentOf(n);
    let hit = false;
    for (let i = 0; p && i < 40; i++) {
      const key = cf.parentKey(n);
      if (p.type === 'ParenExpr' || (p.type === 'BinaryExpr' && p.op === ',' && key === 'right')) { n = p; p = cf.parentOf(p); continue; }
      if ((p.type === 'BinaryExpr' && BOOL_OPS.has(p.op)) || (p.type === 'UnaryExpr' && p.op === '!')) hit = true;
      else if (['IfStmt', 'WhileStmt', 'DoStmt', 'ForStmt'].includes(p.type) && key === 'cond') hit = true;
      else if (p.type === 'ConditionalExpr' && key === 'test') hit = true;
      break;
    }
    if (hit) api.report(a, M(`The assignment '${U.code(unit, a)}' is used in a Boolean expression.`, `대입 '${U.code(unit, a)}'를 부울 식 안에서 사용했습니다.`));
  }
}

module.exports = [
  C04({
    id: '13.1', cat: 'R', dec: true, c2012: '13.4',
    name: ['Assignments shall not be used in Boolean expressions', '부울 식 안에서 대입을 사용하지 않아야 합니다'],
    why: ["'=' inside a condition is often a mistyped '=='.", "조건 안의 '='는 '=='를 잘못 쓴 경우가 많습니다."],
    fix: ['Assign before the test and compare the variable.', '검사 전에 대입하고 변수를 비교하세요.'],
    check: assignInBoolean,
  }),
  C04({
    id: '13.2', cat: 'A', dec: true, c2012: '14.4',
    name: ['Tests against zero should be explicit unless the operand is Boolean', '피연산자가 부울이 아니면 0과의 비교를 명시해야 합니다'],
    why: ['An explicit comparison shows whether a number, a pointer or a flag is tested.', '명시적 비교는 숫자, 포인터, 플래그 중 무엇을 검사하는지 보여 줍니다.'],
    fix: ['Write the comparison, for example (count != 0U).', '비교를 쓰세요. 예: (count != 0U).'],
    reuse: 'misra-c:14.4',
  }),
  C04({
    id: '13.3', cat: 'R', dec: true, type: 'BUG', cwe: 'CWE-1077',
    name: ['Floating-point values shall not be tested for equality', '부동소수점 값의 같음을 검사하지 않아야 합니다'],
    why: ['Rounding makes exact comparison of floating values unreliable.', '반올림 때문에 부동소수점 값의 정확한 비교는 믿을 수 없습니다.'],
    fix: ['Compare the difference with a tolerance instead.', '대신 차이를 허용 오차와 비교하세요.'],
    check: S.floatEquality,
  }),
  C04({
    id: '13.4', cat: 'R', dec: true, c2012: '14.1',
    name: ['The controlling expression of a for loop shall not use floating objects', 'for 반복의 제어 식에 부동소수점 객체를 쓰지 않아야 합니다'],
    why: ['Accumulated rounding errors change the number of iterations.', '누적된 반올림 오차가 반복 횟수를 바꿉니다.'],
    fix: ['Count iterations with an integer and compute the floating value from it.', '정수로 반복을 세고 그로부터 부동소수점 값을 계산하세요.'],
    check(unit, api) { S.floatInFor(unit, api, true); },
  }),
  C04({
    id: '13.5', cat: 'R', dec: true, c2012: '14.2',
    name: ['The three expressions of a for statement shall only control the loop', 'for 문의 세 식은 반복 제어에만 관여해야 합니다'],
    why: ['Unrelated work in the for header hides the loop structure.', 'for 머리에 관계없는 작업이 있으면 반복 구조가 숨습니다.'],
    fix: ['Keep only the initialisation, test and update of the counter in the header.', '머리에는 카운터의 초기화, 검사, 갱신만 두세요.'],
    reuse: 'misra-c:14.2',
  }),
  C04({
    id: '13.6', cat: 'R', dec: true, c2012: '14.2',
    name: ['A for loop counter shall not be modified in the loop body', 'for 반복 카운터를 반복문 본문에서 변경하지 않아야 합니다'],
    why: ['Changing the counter inside the body makes the iteration count hard to see.', '본문 안에서 카운터를 바꾸면 반복 횟수를 알기 어렵습니다.'],
    fix: ['Update the counter only in the third expression of the for statement.', '카운터는 for 문의 세 번째 식에서만 갱신하세요.'],
    check: S.counterModifiedInBody,
  }),
  C04({
    id: '13.7', cat: 'R', dec: false, c2012: '14.3', cwe: 'CWE-570',
    name: ['Boolean operations with invariant results shall not be used', '결과가 변하지 않는 부울 연산을 사용하지 않아야 합니다'],
    why: ['A condition that is always true or always false indicates dead or wrong code.', '항상 참이거나 항상 거짓인 조건은 죽은 코드나 잘못된 코드를 뜻합니다.'],
    fix: ['Remove the test or correct the condition.', '검사를 없애거나 조건을 고치세요.'],
    reuse: 'misra-c:14.3',
  }),
  // ---------------------------------------------------------------- chapter 14
  C04({
    id: '14.1', cat: 'R', dec: false, c2012: '2.1', cwe: 'CWE-561',
    name: ['There shall be no unreachable code', '도달할 수 없는 코드가 없어야 합니다'],
    why: ['Code that can never run is either useless or a sign of a logic error.', '실행될 수 없는 코드는 쓸모없거나 논리 오류의 신호입니다.'],
    fix: ['Remove the code or fix the control flow that skips it.', '코드를 지우거나 그 코드를 건너뛰는 제어 흐름을 고치세요.'],
    reuse: 'misra-c:2.1',
  }),
  C04({
    id: '14.2', cat: 'R', dec: true, c2012: '2.2', cwe: 'CWE-1164',
    name: ['Every non-null statement shall have a side effect or change control flow', '널이 아닌 모든 문은 부수 효과가 있거나 제어 흐름을 바꿔야 합니다'],
    why: ['A statement without effect is usually a typing error such as == instead of =.', '효과 없는 문은 대개 = 대신 == 같은 입력 실수입니다.'],
    fix: ['Remove the statement or write the intended operation.', '문을 지우거나 의도한 연산을 쓰세요.'],
    check: S.noEffectStatements,
  }),
  C04({
    id: '14.3', cat: 'R', dec: true,
    name: ['A null statement shall be on a line by itself', '널 문장은 한 줄에 단독으로 있어야 합니다'],
    why: ['A stray semicolon after if or while is hard to spot when it shares a line.', 'if나 while 뒤의 잘못된 세미콜론은 다른 코드와 같은 줄에 있으면 알아보기 어렵습니다.'],
    fix: ['Put the null statement alone on its line, optionally followed by a comment after a space.', '널 문장을 단독 줄에 두고 필요하면 공백 뒤에 주석을 다세요.'],
    check: L.nullStatementLine,
  }),
  C04({
    id: '14.4', cat: 'R', dec: true, c2012: '15.1',
    name: ['The goto statement shall not be used', 'goto 문을 사용하지 않아야 합니다'],
    why: ['Unstructured jumps make control flow hard to follow and verify.', '구조화되지 않은 점프는 제어 흐름을 따라가고 검증하기 어렵게 합니다.'],
    fix: ['Use structured statements instead.', '대신 구조화된 문을 사용하세요.'],
    reuse: 'misra-c:15.1',
  }),
  C04({
    id: '14.5', cat: 'R', dec: true,
    name: ['The continue statement shall not be used', 'continue 문을 사용하지 않아야 합니다'],
    why: ['continue jumps over the rest of the body and obscures the loop logic.', 'continue는 본문의 나머지를 건너뛰어 반복 논리를 흐리게 합니다.'],
    fix: ['Restructure the body with an if statement.', 'if 문으로 본문을 재구성하세요.'],
    check(unit, api) { S.continueUsed(unit, api, false); },
  }),
  C04({
    id: '14.6', cat: 'R', dec: true, c2012: '15.4',
    name: ['A loop shall have at most one break that terminates it', '반복문을 끝내는 break는 하나 이하여야 합니다'],
    why: ['Several exits make it hard to reason about the state after the loop.', '여러 출구가 있으면 반복 후의 상태를 추론하기 어렵습니다.'],
    fix: ['Combine the exit conditions into one break or into the loop condition.', '탈출 조건을 하나의 break나 반복 조건으로 합치세요.'],
    check(unit, api) { S.multipleExits(unit, api, false); },
  }),
  C04({
    id: '14.7', cat: 'R', dec: true, c2012: '15.5',
    name: ['A function shall have a single point of exit at its end', '함수는 끝에 하나의 출구만 가져야 합니다'],
    why: ['Early returns complicate verification of the function postconditions.', '이른 반환은 함수 사후 조건의 검증을 복잡하게 합니다.'],
    fix: ['Store the result and return once at the end.', '결과를 저장하고 끝에서 한 번만 반환하세요.'],
    reuse: 'misra-c:15.5',
  }),
  C04({
    id: '14.8', cat: 'R', dec: true, c2012: '15.6',
    name: ['Bodies of switch, while, do and for shall be compound statements', 'switch, while, do, for의 본문은 복합 문이어야 합니다'],
    why: ['Without braces a statement added later silently falls outside the loop.', '중괄호가 없으면 나중에 추가한 문이 조용히 반복문 밖에 놓입니다.'],
    fix: ['Enclose the body in braces.', '본문을 중괄호로 묶으세요.'],
    check(unit, api) { S.bodyCompound(unit, api, 'loops'); },
  }),
  C04({
    id: '14.9', cat: 'R', dec: true, c2012: '15.6',
    name: ['if and else shall be followed by a compound statement (or else if)', 'if와 else 뒤에는 복합 문(또는 else if)이 와야 합니다'],
    why: ['Braces prevent the dangling-else problem and accidental misplaced statements.', '중괄호는 dangling else 문제와 실수로 잘못 놓인 문을 막습니다.'],
    fix: ['Enclose the branch in braces.', '분기를 중괄호로 묶으세요.'],
    check(unit, api) { S.bodyCompound(unit, api, 'if'); },
  }),
  C04({
    id: '14.10', cat: 'R', dec: true, c2012: '15.7',
    name: ['An if ... else if chain shall end with an else', 'if ... else if 연쇄는 else로 끝나야 합니다'],
    why: ['A final else shows that the remaining cases were considered.', '마지막 else는 남은 경우를 고려했음을 보여 줍니다.'],
    fix: ['Add a final else, with a comment if nothing needs to be done.', '마지막 else를 추가하고 할 일이 없으면 주석을 다세요.'],
    reuse: 'misra-c:15.7',
  }),
];
