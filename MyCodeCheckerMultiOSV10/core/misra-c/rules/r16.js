'use strict';

// MISRA C:2012 / 2023 chapter 16 — switch statements.

const A = require('../lib/a-util');
const B = require('../lib/b-common');

const { cf, rule, msg, nodes, text } = B;

const isLabel = (n) => n && (n.type === 'CaseStmt' || n.type === 'DefaultStmt');

function labelText(unit, l) {
  return l.type === 'DefaultStmt' ? 'default' : `case ${text(unit, l.value)}`;
}

// Does a clause end with an unconditional break?
function endsWithBreak(body) {
  const last = body[body.length - 1];
  if (!last) return false;
  if (last.type === 'BreakStmt') return true;
  if (last.type === 'CompoundStmt') return endsWithBreak(last.body);
  return false;
}

function allLabels(sw) {
  const out = [];
  for (const c of cf.switchClauses(sw).clauses) for (const l of c.labels) out.push(l);
  return out;
}

module.exports = [
  rule({
    id: '16.1', cat: 'Required', debt: 10, decidable: true,
    name: ['All switch statements shall be well-formed', '모든 switch 문은 올바른 형태여야 합니다'],
    why: ['C allows switch bodies with almost any structure; a restricted shape (labels, statements, break) keeps the control flow obvious.', 'C는 거의 어떤 구조의 switch 본문도 허용합니다. 레이블, 문, break로 된 제한된 형태가 제어 흐름을 명확히 합니다.'],
    fix: ['Write the switch body as a brace-enclosed list of clauses, each starting with case/default labels and ending with break.', 'switch 본문을 case/default 레이블로 시작해 break로 끝나는 절들의 중괄호 목록으로 쓰세요.'],
    check(unit, api) {
      for (const sw of nodes(unit, 'SwitchStmt')) {
        if (!sw.body || sw.body.type !== 'CompoundStmt') {
          api.report(sw, msg('The switch body is not a compound statement.', 'switch 본문이 복합문이 아닙니다.'));
          continue;
        }
        const { prefix } = cf.switchClauses(sw);
        const code = prefix.find((s) => s.type !== 'NullStmt');
        if (code) api.report(code, msg('A statement appears in the switch body before the first case label.', 'switch 본문에서 첫 case 레이블 앞에 문이 있습니다.'));
        else if (!allLabels(sw).length) api.report(sw, msg('The switch statement has no case or default labels.', 'switch 문에 case나 default 레이블이 없습니다.'));
      }
    },
  }),
  rule({
    id: '16.2', cat: 'Required', debt: 10, decidable: true,
    name: ['A switch label shall only be used directly in the switch body', 'switch 레이블은 switch 본문 바로 안에서만 써야 합니다'],
    why: ['Labels nested inside other blocks or statements (as in Duff\'s device) produce jumps into the middle of those statements.', '다른 블록이나 문 안에 중첩된 레이블(더프의 장치처럼)은 그 문의 중간으로 점프하게 만듭니다.'],
    fix: ['Place every case and default label directly in the outermost block of the switch body.', '모든 case와 default 레이블을 switch 본문의 가장 바깥 블록에 두세요.'],
    check(unit, api) {
      for (const l of nodes(unit, ['CaseStmt', 'DefaultStmt'])) {
        let n = l;
        let p = cf.parentOf(n);
        while (isLabel(p)) { n = p; p = cf.parentOf(p); }
        const sw = cf.enclosing(l, 'SwitchStmt');
        if (!sw) continue;
        if (p === sw.body || p === sw) continue;
        api.report(l, msg(`'${labelText(unit, l)}' is nested inside another statement of the switch at line ${sw.loc.line}.`, `'${labelText(unit, l)}'이(가) ${sw.loc.line}행 switch의 다른 문 안에 중첩되어 있습니다.`));
      }
    },
  }),
  rule({
    id: '16.3', cat: 'Required', debt: 5, decidable: true, cwe: 'CWE-484',
    name: ['Every switch clause shall end with an unconditional break', '모든 switch 절은 무조건 break로 끝나야 합니다'],
    why: ['Falling through into the next clause is a frequent source of errors, and an intended fall-through looks the same as a forgotten break.', '다음 절로 흘러드는 것은 흔한 오류 원인이며, 의도한 경우와 break를 잊은 경우가 똑같아 보입니다.'],
    fix: ['End each clause with break; group labels that share code instead of falling through.', '각 절을 break로 끝내고, 코드를 공유하는 경우 흘러내리지 말고 레이블을 묶으세요.'],
    check(unit, api) {
      for (const sw of nodes(unit, 'SwitchStmt')) {
        for (const c of cf.switchClauses(sw).clauses) {
          if (endsWithBreak(c.body)) continue;
          api.report(c.node, msg(`The clause '${labelText(unit, c.labels[0])}' does not end with an unconditional break.`, `'${labelText(unit, c.labels[0])}' 절이 무조건 break로 끝나지 않습니다.`));
        }
      }
    },
  }),
  rule({
    id: '16.4', cat: 'Required', debt: 5, decidable: true, cwe: 'CWE-478',
    name: ['Every switch statement shall have a default label', '모든 switch 문에는 default 레이블이 있어야 합니다'],
    why: ['A default clause shows that unexpected values were considered and gives a place for defensive handling.', 'default 절은 예상치 못한 값을 고려했음을 보여주고 방어 처리를 할 곳을 제공합니다.'],
    fix: ['Add a default clause, with a comment or error handling when nothing is to be done.', '할 일이 없으면 주석이나 오류 처리를 넣은 default 절을 추가하세요.'],
    check(unit, api) {
      for (const sw of nodes(unit, 'SwitchStmt')) {
        if (!allLabels(sw).some((l) => l.type === 'DefaultStmt')) api.report(sw, msg(`The switch on '${text(unit, sw.cond)}' has no default label.`, `'${text(unit, sw.cond)}'에 대한 switch에 default 레이블이 없습니다.`));
      }
    },
  }),
  rule({
    id: '16.5', cat: 'Required', debt: 5, decidable: true,
    name: ['A default label shall be the first or the last switch label', 'default 레이블은 첫 번째나 마지막 switch 레이블이어야 합니다'],
    why: ['A default in the middle of the case labels is easy to miss when reading the switch.', 'case 레이블 중간의 default는 switch를 읽을 때 놓치기 쉽습니다.'],
    fix: ['Move the default clause to the start or the end of the switch.', 'default 절을 switch의 처음이나 끝으로 옮기세요.'],
    check(unit, api) {
      for (const sw of nodes(unit, 'SwitchStmt')) {
        const ls = allLabels(sw);
        const i = ls.findIndex((l) => l.type === 'DefaultStmt');
        if (i > 0 && i < ls.length - 1) api.report(ls[i], msg('The default label is neither the first nor the last label of the switch.', 'default 레이블이 switch의 첫 번째나 마지막 레이블이 아닙니다.'));
      }
    },
  }),
  rule({
    id: '16.6', cat: 'Required', debt: 5, decidable: true,
    name: ['A switch statement shall have at least two clauses', 'switch 문에는 절이 두 개 이상 있어야 합니다'],
    why: ['A switch with a single clause is an if statement in disguise, or a sign that cases are missing.', '절이 하나뿐인 switch는 사실상 if 문이거나 case가 빠졌다는 신호입니다.'],
    fix: ['Use an if statement, or add the missing clauses.', 'if 문을 쓰거나 빠진 절을 추가하세요.'],
    check(unit, api) {
      for (const sw of nodes(unit, 'SwitchStmt')) {
        const n = cf.switchClauses(sw).clauses.length;
        if (n < 2) api.report(sw, msg(`The switch statement has ${n} clause${n === 1 ? '' : 's'}.`, `switch 문의 절이 ${n}개뿐입니다.`));
      }
    },
  }),
  rule({
    id: '16.7', cat: 'Required', debt: 5, decidable: true,
    name: ['A switch expression shall not be essentially Boolean', 'switch 식은 본질적으로 불리언이면 안 됩니다'],
    why: ['Switching on a Boolean value is an if ... else written in a confusing way.', '불리언 값에 대한 switch는 if ... else를 헷갈리게 쓴 것입니다.'],
    fix: ['Use an if ... else statement.', 'if ... else 문을 사용하세요.'],
    check(unit, api) {
      for (const sw of nodes(unit, 'SwitchStmt')) {
        if (!sw.cond || sw.cond.type === 'Declaration') continue;
        const et = A.et(unit, api, sw.cond);
        if (et && et.category === 'boolean') api.report(sw.cond, msg(`The switch expression '${text(unit, sw.cond)}' is essentially Boolean.`, `switch 식 '${text(unit, sw.cond)}'이(가) 본질적으로 불리언입니다.`));
      }
    },
  }),
];
