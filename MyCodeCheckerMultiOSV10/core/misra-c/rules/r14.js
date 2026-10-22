'use strict';

// MISRA C:2012 / 2023 chapter 14 — control statement expressions.

const B = require('../lib/b-common');

const { cf, T, rule, msg, nodes, sideEffects, text, skipParens, lvalueBase } = B;

// Symbols written (assignment / ++ / --) inside a subtree.
function writes(root) {
  const out = new Map();
  if (!root) return out;
  cf.walk(root, (n) => {
    if (n.type === 'SizeofExpr' || n.type === 'AlignofExpr') return cf.walk.SKIP;
    let t = null;
    if (n.type === 'AssignExpr') t = n.left;
    else if (n.type === 'UnaryExpr' && (n.op === '++' || n.op === '--')) t = n.arg;
    else if (n.type === 'VarDecl' && n.symbol && n.init) { if (!out.has(n.symbol)) out.set(n.symbol, n); return undefined; }
    if (t) { const s = lvalueBase(t); if (s && !out.has(s)) out.set(s, n); }
    return undefined;
  });
  return out;
}

function reads(root) {
  const out = new Map();
  if (!root) return out;
  cf.walk(root, (n) => {
    if (n.type === 'Identifier' && n.symbol && (n.symbol.kind === 'variable' || n.symbol.kind === 'parameter')) if (!out.has(n.symbol)) out.set(n.symbol, n);
  });
  return out;
}

function isFloatingSym(s) {
  return s && T.isFloating(T.canonical(s.type));
}

function controlling(unit) {
  const out = [];
  for (const s of nodes(unit, ['IfStmt', 'WhileStmt', 'DoStmt'])) if (s.cond && s.cond.type !== 'Declaration') out.push({ stmt: s, cond: s.cond });
  for (const s of nodes(unit, 'ForStmt')) if (s.cond && s.cond.type !== 'Declaration') out.push({ stmt: s, cond: s.cond });
  return out;
}

// Invariant value of a controlling expression: true / false / null (varies).
function invariant(e, unit) {
  const x = skipParens(e);
  const v = B.constInt(x, unit);
  if (v !== null) return v !== 0n;
  if (x.type === 'BinaryExpr' && ['<', '<=', '>', '>=', '==', '!='].includes(x.op)) {
    // comparison of a variable against a constant outside its range
    const sides = [[x.left, x.right, x.op], [x.right, x.left, { '<': '>', '<=': '>=', '>': '<', '>=': '<=', '==': '==', '!=': '!=' }[x.op]]];
    for (const [varSide, cSide, op] of sides) {
      const c = B.constInt(cSide, unit);
      if (c === null) continue;
      const vt = B.canon(B.stripCasts(varSide).ctype);
      if (!vt || !T.isInteger(vt) || T.isBool(vt)) continue;
      const vs = B.stripCasts(varSide);
      if (B.constInt(vs, unit) !== null) continue;
      let rng;
      try { rng = T.intRange(vt, unit.target); } catch (err) { rng = null; }
      if (!rng) continue;
      const { min, max } = rng;
      // value in [min, max] compared with c
      if (op === '<') { if (max < c) return true; if (min >= c) return false; }
      if (op === '<=') { if (max <= c) return true; if (min > c) return false; }
      if (op === '>') { if (min > c) return true; if (max <= c) return false; }
      if (op === '>=') { if (min >= c) return true; if (max < c) return false; }
      if (op === '==') { if (c < min || c > max) return false; }
      if (op === '!=') { if (c < min || c > max) return true; }
    }
  }
  return null;
}

function loopCounterOf(fs) {
  if (!fs.inc) return null;
  const w = writes(fs.inc);
  return w.size === 1 ? [...w.keys()][0] : null;
}

module.exports = [
  rule({
    id: '14.1', cat: 'Required', type: 'BUG', debt: 10, decidable: false, cwe: 'CWE-1339', cert: 'FLP30-C',
    name: ['A loop counter shall not have essentially floating type', '루프 카운터는 본질적으로 부동소수점 형이면 안 됩니다'],
    why: ['Rounding errors make the number of iterations of a loop counted with a floating value hard to predict.', '부동소수점 값으로 세는 루프는 반올림 오차 때문에 반복 횟수를 예측하기 어렵습니다.'],
    fix: ['Count with an integer variable and compute the floating value from it inside the loop.', '정수 변수로 반복을 세고 루프 안에서 부동소수점 값을 계산하세요.'],
    check(unit, api) {
      for (const fs of nodes(unit, 'ForStmt')) {
        const w = writes(fs.inc);
        const r = reads(fs.cond);
        for (const [s, n] of w) if (isFloatingSym(s) && r.has(s)) api.report(n, msg(`Loop counter '${s.name}' has floating type '${T.typeToString(s.type)}'.`, `루프 카운터 '${s.name}'의 형이 부동소수점 '${T.typeToString(s.type)}'입니다.`));
      }
      for (const ws of nodes(unit, ['WhileStmt', 'DoStmt'])) {
        if (!ws.cond || ws.cond.type === 'Declaration') continue;
        const r = reads(ws.cond);
        const w = writes(ws.body);
        for (const [s, n] of w) {
          if (!isFloatingSym(s) || !r.has(s)) continue;
          const isStep = n.type === 'UnaryExpr' || (n.type === 'AssignExpr' && (n.op === '+=' || n.op === '-='));
          if (isStep) api.report(n, msg(`Loop counter '${s.name}' has floating type '${T.typeToString(s.type)}'.`, `루프 카운터 '${s.name}'의 형이 부동소수점 '${T.typeToString(s.type)}'입니다.`));
        }
      }
    },
  }),
  rule({
    id: '14.2', cat: 'Required', debt: 15, decidable: false,
    name: ['A for loop shall be well-formed', 'for 루프는 올바른 형태여야 합니다'],
    why: ['A for loop whose three clauses do not simply initialise, test and step one counter (that the body leaves alone) is hard to reason about; use a while loop for anything else.', '세 절이 하나의 카운터를 초기화·검사·증가시키는 단순한 형태가 아니거나 본문이 카운터를 바꾸는 for 루프는 이해하기 어렵습니다. 그런 경우 while 루프를 쓰세요.'],
    fix: ['Use one loop counter: initialise it in the first clause, test it (and Boolean flags only) in the second, change only it in the third, and never modify it in the body.', '카운터 하나만 사용하세요. 첫 절에서 초기화하고, 둘째 절에서 카운터(와 불리언 플래그)만 검사하고, 셋째 절에서 카운터만 바꾸며, 본문에서는 수정하지 마세요.'],
    check(unit, api) {
      for (const fs of nodes(unit, 'ForStmt')) {
        if (!fs.init && !fs.cond && !fs.inc) continue; // for (;;)
        const problems = [];
        const incW = writes(fs.inc);
        const counter = loopCounterOf(fs);
        if (!fs.inc) problems.push(['the third clause is empty, so there is no loop counter', '셋째 절이 비어 있어 루프 카운터가 없습니다']);
        else if (incW.size !== 1) problems.push([`the third clause modifies ${incW.size} objects instead of one loop counter`, `셋째 절이 루프 카운터 하나가 아닌 ${incW.size}개의 객체를 수정합니다`]);
        else if (sideEffects(fs.inc, unit).some((e) => e.kind === 'call' || e.kind === 'volatile')) problems.push(['the third clause has side effects other than updating the counter', '셋째 절에 카운터 갱신 외의 부작용이 있습니다']);
        if (fs.init && counter) {
          const iw = writes(fs.init);
          const others = [...iw.keys()].filter((s) => s !== counter);
          if (others.length) problems.push([`the first clause also sets '${others[0].name}'`, `첫 절이 '${others[0].name}'도 설정합니다`]);
          else if (!iw.size) problems.push([`the first clause does not initialise '${counter.name}'`, `첫 절이 '${counter.name}'을(를) 초기화하지 않습니다`]);
        }
        const bodyW = writes(fs.body);
        if (fs.cond) {
          if (sideEffects(fs.cond, unit).length) problems.push(['the second clause has side effects', '둘째 절에 부작용이 있습니다']);
          const cr = reads(fs.cond);
          if (counter && !cr.has(counter)) problems.push([`the second clause does not use the loop counter '${counter.name}'`, `둘째 절이 루프 카운터 '${counter.name}'을(를) 사용하지 않습니다`]);
          for (const s of cr.keys()) {
            if (s === counter || !bodyW.has(s)) continue;
            if (B.cf.essentialTypeOfType && B.cf.essentialTypeOfType(s.type).category === 'boolean') continue;
            problems.push([`the second clause uses '${s.name}', which the body modifies`, `둘째 절이 본문에서 수정되는 '${s.name}'을(를) 사용합니다`]);
            break;
          }
        }
        if (counter && bodyW.has(counter)) problems.push([`the loop counter '${counter.name}' is modified in the body`, `루프 카운터 '${counter.name}'이(가) 본문에서 수정됩니다`]);
        if (fs.inc) {
          for (const s of reads(fs.inc).keys()) if (s !== counter && bodyW.has(s)) { problems.push([`the third clause uses '${s.name}', which the body modifies`, `셋째 절이 본문에서 수정되는 '${s.name}'을(를) 사용합니다`]); break; }
        }
        if (problems.length) api.report(fs, msg(`The for loop is not well-formed: ${problems[0][0]}.`, `for 루프가 올바른 형태가 아닙니다: ${problems[0][1]}.`));
      }
    },
  }),
  rule({
    id: '14.3', cat: 'Required', debt: 10, decidable: false, cwe: 'CWE-570',
    name: ['Controlling expressions shall not be invariant', '제어 식은 불변이면 안 됩니다'],
    why: ['A condition that is always true or always false usually reveals a logic error or dead code.', '항상 참이거나 항상 거짓인 조건은 보통 논리 오류나 죽은 코드를 뜻합니다.'],
    fix: ['Fix the condition or remove the dead branch; write intentional infinite loops as for (;;) or while (true).', '조건을 고치거나 죽은 분기를 제거하세요. 의도한 무한 루프는 for (;;) 또는 while (true)로 쓰세요.'],
    check(unit, api) {
      const list = controlling(unit);
      for (const c of nodes(unit, 'ConditionalExpr')) list.push({ stmt: c, cond: c.test });
      for (const { stmt, cond } of list) {
        const v = invariant(cond, unit);
        if (v === null) continue;
        if (v === true && (stmt.type === 'WhileStmt' || stmt.type === 'ForStmt' || stmt.type === 'DoStmt')) continue; // infinite loop
        if (v === false && stmt.type === 'DoStmt') continue; // do { } while (0)
        api.report(cond, msg(`The controlling expression '${text(unit, cond)}' is always ${v ? 'true' : 'false'}.`, `제어 식 '${text(unit, cond)}'이(가) 항상 ${v ? '참' : '거짓'}입니다.`));
      }
    },
  }),
  rule({
    id: '14.4', cat: 'Required', debt: 5, decidable: true,
    name: ['Controlling expressions of if and loops shall be essentially Boolean', 'if 문과 반복문의 제어 식은 본질적으로 불리언이어야 합니다'],
    why: ['Testing a number or pointer directly hides the intended comparison and mixes up Boolean and arithmetic values.', '숫자나 포인터를 그대로 검사하면 의도한 비교가 드러나지 않고 불리언과 산술 값이 섞입니다.'],
    fix: ['Write the comparison explicitly, for example x != 0 or p != NULL.', 'x != 0, p != NULL처럼 비교를 명시적으로 쓰세요.'],
    check(unit, api) {
      for (const { stmt, cond } of controlling(unit)) {
        const et = cf.essentialType(cond, { target: unit.target });
        if (!et || et.category === 'boolean') continue;
        const kind = stmt.type === 'IfStmt' ? 'if' : stmt.type === 'ForStmt' ? 'for' : stmt.type === 'DoStmt' ? 'do-while' : 'while';
        api.report(cond, msg(`The controlling expression '${text(unit, cond)}' of the ${kind} statement is essentially '${et.category}', not Boolean.`, `${kind} 문의 제어 식 '${text(unit, cond)}'이(가) 불리언이 아닌 본질적 '${et.category}' 형입니다.`));
      }
    },
  }),
];
