'use strict';

// MISRA C:2012 / 2023 chapter 13 — side effects.

const B = require('../lib/b-common');

const { cf, rule, msg, nodes, sideEffects, describeEffect, fullExpressions, text, skipParens, lvalueBase, isVolatileType } = B;

// --- 13.2 helpers: unsequenced reads / writes -------------------------------

function emptySets() { return { w: new Map(), r: new Map(), v: [] }; }
function merge(a, b) {
  for (const [k, n] of b.w) if (!a.w.has(k)) a.w.set(k, n);
  for (const [k, n] of b.r) if (!a.r.has(k)) a.r.set(k, n);
  for (const x of b.v) a.v.push(x);
  return a;
}
// conflict between two unsequenced operand sets
function conflict(a, b) {
  for (const [s, n] of a.w) {
    if (b.w.has(s)) return { sym: s, node: n, kind: 'ww' };
    if (b.r.has(s)) return { sym: s, node: n, kind: 'wr' };
  }
  for (const [s, n] of b.w) if (a.r.has(s)) return { sym: s, node: n, kind: 'wr' };
  if (a.v.length && b.v.length) return { sym: null, node: a.v[0], kind: 'vv' };
  return null;
}

function analyzeSeq(e, report) {
  const x = e;
  if (!x || typeof x !== 'object') return emptySets();
  switch (x.type) {
    case 'Identifier': {
      const s = emptySets();
      if (x.symbol && (x.symbol.kind === 'variable' || x.symbol.kind === 'parameter')) s.r.set(x.symbol, x);
      if (isVolatileType(x.ctype)) s.v.push(x);
      return s;
    }
    case 'ParenExpr': return analyzeSeq(x.expr, report);
    case 'SizeofExpr': case 'AlignofExpr': case 'OffsetofExpr': return emptySets();
    case 'GenericSelection': {
      const sel = x.assocs[x.selected];
      return sel ? analyzeSeq(sel.expr, report) : emptySets();
    }
    case 'BinaryExpr': {
      const L = analyzeSeq(x.left, report);
      const R = analyzeSeq(x.right, report);
      if (x.op !== '&&' && x.op !== '||' && x.op !== ',') {
        const c = conflict(L, R);
        if (c) report(x, c);
      }
      return merge(L, R);
    }
    case 'ConditionalExpr': {
      const a = analyzeSeq(x.test, report);
      if (x.consequent) merge(a, analyzeSeq(x.consequent, report));
      return merge(a, analyzeSeq(x.alternate, report));
    }
    case 'AssignExpr': {
      const target = lvalueBase(x.left);
      const lt = skipParens(x.left);
      // reads needed to designate the target (indexes, pointers)
      let L;
      if (lt && lt.type === 'Identifier') L = emptySets();
      else if (lt && lt.type === 'MemberExpr') L = analyzeSeq(lt.object, report);
      else if (lt && lt.type === 'IndexExpr') { L = analyzeSeq(lt.object, report); const I = analyzeSeq(lt.index, report); const c = conflict(L, I); if (c) report(lt, c); merge(L, I); }
      else if (lt && lt.type === 'UnaryExpr' && lt.op === '*') L = analyzeSeq(lt.arg, report);
      else L = analyzeSeq(x.left, report);
      if (lt && lt.type === 'MemberExpr' && !lt.arrow && target) L.r.delete(target);
      if (lt && lt.type === 'IndexExpr' && target && B.isArrayType(lt.object.ctype)) L.r.delete(target);
      const R = analyzeSeq(x.right, report);
      const W = emptySets();
      if (target) { W.w.set(target, x); if (x.op !== '=') W.r.set(target, x); }
      if (isVolatileType(x.left.ctype)) W.v.push(x);
      const c = conflict(L, R);
      if (c) report(x, c);
      else if (target && R.w.has(target)) report(x, { sym: target, node: x, kind: 'ww' });
      return merge(merge(L, R), W);
    }
    case 'UnaryExpr': {
      const s = analyzeSeq(x.arg, report);
      if (x.op === '++' || x.op === '--') {
        const t = lvalueBase(x.arg);
        if (t) { s.w.set(t, x); s.r.set(t, x); }
      }
      return s;
    }
    case 'CallExpr': {
      const parts = [analyzeSeq(x.callee, report), ...x.args.map((a) => analyzeSeq(a, report))];
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          const c = conflict(parts[i], parts[j]);
          if (c) { report(x, c); i = parts.length; break; }
        }
      }
      return parts.reduce(merge, emptySets());
    }
    case 'IndexExpr': {
      const a = analyzeSeq(x.object, report);
      const b = analyzeSeq(x.index, report);
      const c = conflict(a, b);
      if (c) report(x, c);
      return merge(a, b);
    }
    case 'StmtExpr': case 'LambdaExpr': return emptySets();
    case 'InitList': {
      const parts = x.items.map((it) => analyzeSeq(it.type === 'DesignatedInit' ? it.value : it, report));
      return parts.reduce(merge, emptySets());
    }
    default: {
      const acc = emptySets();
      for (const c of cf.childrenOf(x)) if (c && c.type !== 'TypeName') merge(acc, analyzeSeq(c, report));
      return acc;
    }
  }
}

// Split a full expression on comma operators (each operand is sequenced).
function commaParts(e, out = []) {
  const x = skipParens(e);
  if (x && x.type === 'BinaryExpr' && x.op === ',') { commaParts(x.left, out); commaParts(x.right, out); } else if (e) out.push(e);
  return out;
}

module.exports = [
  rule({
    id: '13.1', cat: 'Required', type: 'BUG', debt: 10, decidable: false, cwe: 'CWE-758',
    name: ['Initializer lists shall not contain persistent side effects', '초기화 목록에 지속적인 부작용이 있으면 안 됩니다'],
    why: ['The order in which the expressions of an initializer list are evaluated is unspecified, so side effects inside them happen in an unpredictable order.', '초기화 목록의 식 평가 순서는 정해져 있지 않아 그 안의 부작용이 예측할 수 없는 순서로 일어납니다.'],
    fix: ['Compute the values into temporaries before the initialization and initialize from those.', '초기화 전에 값을 임시 변수에 계산해 두고 그 변수로 초기화하세요.'],
    check(unit, api) {
      const seen = new Set();
      for (const il of nodes(unit, 'InitList')) {
        let top = il;
        while (cf.parentOf(top) && (cf.parentOf(top).type === 'InitList' || cf.parentOf(top).type === 'DesignatedInit')) top = cf.parentOf(top);
        if (seen.has(top)) continue;
        seen.add(top);
        for (const e of sideEffects(top, unit)) {
          const d = describeEffect(unit, e);
          api.report(e.node, msg(`Initializer list contains the persistent side effect ${d.en}.`, `초기화 목록에 지속적인 부작용(${d.ko})이 있습니다.`));
        }
      }
    },
  }),
  rule({
    id: '13.2', cat: 'Required', type: 'BUG', sev: 'CRITICAL', debt: 15, decidable: false, cwe: 'CWE-758', cert: 'EXP30-C',
    name: ['An expression\'s value and side effects shall not depend on evaluation order', '식의 값과 부작용이 평가 순서에 따라 달라지면 안 됩니다'],
    why: ['When an object is modified and also read or modified elsewhere in the same expression without an intervening sequence point, the behaviour is undefined or depends on the compiler.', '같은 식에서 시퀀스 포인트 없이 객체를 수정하고 다른 곳에서 다시 읽거나 수정하면 동작이 정의되지 않거나 컴파일러에 따라 달라집니다.'],
    fix: ['Split the expression so that each object is modified at most once and is not read elsewhere in the same expression.', '식을 나누어 각 객체를 한 번만 수정하고 같은 식의 다른 곳에서 읽지 않도록 하세요.'],
    check(unit, api) {
      for (const { expr } of fullExpressions(unit)) {
        let done = false;
        analyzeSeq(expr, (node, c) => {
          if (done) return;
          done = true;
          if (c.kind === 'vv') {
            api.report(node, msg(`'${text(unit, node)}' accesses volatile objects in an unspecified order.`, `'${text(unit, node)}'에서 volatile 객체에 대한 접근 순서가 정해져 있지 않습니다.`));
          } else {
            const n = c.sym.name;
            api.report(node, c.kind === 'ww'
              ? msg(`'${n}' is modified more than once without a sequence point in '${text(unit, node)}'.`, `'${text(unit, node)}'에서 '${n}'이(가) 시퀀스 포인트 없이 두 번 이상 수정됩니다.`)
              : msg(`'${n}' is modified and also read without a sequence point in '${text(unit, node)}'.`, `'${text(unit, node)}'에서 '${n}'이(가) 시퀀스 포인트 없이 수정되고 읽힙니다.`));
          }
        });
      }
    },
  }),
  rule({
    id: '13.3', cat: 'Advisory', debt: 5, decidable: true,
    name: ['A full expression with ++ or -- should have no other side effects', '++ 또는 --가 있는 전체 식에는 다른 부작용이 없어야 합니다'],
    why: ['Mixing an increment or decrement with other side effects in one expression makes the code hard to read and the order of effects easy to get wrong.', '증감 연산을 다른 부작용과 한 식에 섞으면 읽기 어렵고 효과의 순서를 잘못 이해하기 쉽습니다.'],
    fix: ['Put the increment or decrement in a statement of its own.', '증감 연산을 별도의 문으로 분리하세요.'],
    check(unit, api) {
      for (const { expr } of fullExpressions(unit)) {
        for (const part of commaParts(expr)) {
          const eff = sideEffects(part, unit);
          if (eff.length < 2) continue;
          const inc = eff.find((e) => e.kind === 'incdec');
          if (!inc) continue;
          const other = eff.find((e) => e !== inc);
          const d = describeEffect(unit, other);
          api.report(inc.node, msg(`'${text(unit, inc.node)}' is combined with another side effect (${d.en}) in the same expression.`, `'${text(unit, inc.node)}'이(가) 같은 식에서 다른 부작용(${d.ko})과 함께 쓰였습니다.`));
        }
      }
    },
  }),
  rule({
    id: '13.4', cat: 'Advisory', debt: 5, decidable: true, cwe: 'CWE-481',
    name: ['The result of an assignment should not be used', '대입 연산의 결과를 사용하지 않아야 합니다'],
    why: ['Using an assignment as a value hides a side effect inside a larger expression and is easily confused with a comparison.', '대입을 값으로 쓰면 부작용이 큰 식 속에 숨고 비교 연산과 혼동하기 쉽습니다.'],
    fix: ['Perform the assignment as a separate statement and use the variable afterwards.', '대입을 별도의 문으로 수행한 뒤 변수를 사용하세요.'],
    check(unit, api) {
      for (const a of nodes(unit, 'AssignExpr')) {
        if (B.valueDiscarded(a)) continue;
        const p = cf.parentOf(a);
        if (p && p.type === 'ForStmt' && cf.parentKey(a) === 'inc') continue;
        api.report(a, msg(`The value of the assignment '${text(unit, a)}' is used.`, `대입 '${text(unit, a)}'의 결과 값이 사용됩니다.`));
      }
    },
  }),
  rule({
    id: '13.5', cat: 'Required', type: 'BUG', debt: 10, decidable: false, cwe: 'CWE-768',
    name: ['The right operand of && or || shall not contain persistent side effects', '&& 또는 ||의 오른쪽 피연산자에 지속적인 부작용이 있으면 안 됩니다'],
    why: ['The right operand is evaluated only for some values of the left operand, so its side effects happen conditionally, which is easy to overlook.', '오른쪽 피연산자는 왼쪽 값에 따라서만 평가되므로 그 부작용이 조건부로 일어나 놓치기 쉽습니다.'],
    fix: ['Evaluate the side effect before the logical expression, or use an if statement.', '논리 식 앞에서 부작용을 먼저 수행하거나 if 문을 사용하세요.'],
    check(unit, api) {
      for (const b of nodes(unit, 'BinaryExpr')) {
        if (b.op !== '&&' && b.op !== '||') continue;
        const eff = sideEffects(b.right, unit);
        if (!eff.length) continue;
        const d = describeEffect(unit, eff[0]);
        api.report(eff[0].node, msg(`The right operand of '${b.op}' has the persistent side effect ${d.en}.`, `'${b.op}'의 오른쪽 피연산자에 지속적인 부작용(${d.ko})이 있습니다.`));
      }
    },
  }),
  rule({
    id: '13.6', cat: 'Required', cat2012: 'Mandatory', type: 'BUG', debt: 5, decidable: true, cwe: 'CWE-1070', cert: 'EXP44-C',
    name: ['The operand of sizeof shall not contain potential side effects', 'sizeof의 피연산자에 잠재적 부작용이 있으면 안 됩니다'],
    why: ['The operand of sizeof is normally not evaluated, so a side effect written there silently never happens.', 'sizeof의 피연산자는 보통 평가되지 않으므로 그 안에 쓴 부작용은 조용히 일어나지 않습니다.'],
    fix: ['Move the side effect out of the sizeof operand.', '부작용을 sizeof 피연산자 밖으로 옮기세요.'],
    check(unit, api) {
      for (const s of nodes(unit, 'SizeofExpr')) {
        if (!s.arg) continue;
        const a = skipParens(s.arg);
        if (a && a.type === 'Identifier' && isVolatileType(a.ctype)) continue; // allowed: volatile lvalue alone
        const eff = sideEffects(s.arg, unit, { intoSizeof: true });
        if (!eff.length) continue;
        const d = describeEffect(unit, eff[0]);
        api.report(s, msg(`The operand of 'sizeof' contains ${d.en}, which is not evaluated.`, `'sizeof'의 피연산자에 평가되지 않는 ${d.ko}이(가) 있습니다.`));
      }
    },
  }),
];
