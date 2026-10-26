'use strict';

// AUTOSAR C++14 chapter 6 — statements (switch, loops, jumps) and MISRA
// C++:2008 M6 rules (switch structure, for-loop counters).

const { A, M } = require('../lib/meta');
const { D } = require('../lib/delegate');
const U = require('../lib/util');
const { cf } = U;

const LOOP_TYPES = ['ForStmt', 'WhileStmt', 'DoStmt', 'RangeForStmt'];

// Variables written in an expression: Map<Symbol, kind[]>
function writes(node) {
  const out = new Map();
  if (!node) return out;
  cf.walk(node, (n) => {
    if (n.type === 'LambdaExpr') return cf.walk.SKIP;
    if (n.type === 'Identifier' && n.symbol) {
      const w = U.writeKind(n);
      if (w && w !== 'address') {
        const { p } = U.upParens(n);
        let kind = w;
        if (w === 'compound') kind = p.op;
        else if (w === 'incdec') kind = p.op;
        let l = out.get(n.symbol);
        if (!l) out.set(n.symbol, (l = []));
        l.push({ kind, node: p, rhs: p.type === 'AssignExpr' ? p.right : null });
      }
    }
    return undefined;
  });
  return out;
}

function reads(node) {
  const out = new Map();
  if (!node) return out;
  cf.walk(node, (n) => {
    if (n.type === 'LambdaExpr') return cf.walk.SKIP;
    if (n.type === 'Identifier' && n.symbol && (n.symbol.kind === 'variable' || n.symbol.kind === 'parameter')) {
      let l = out.get(n.symbol);
      if (!l) out.set(n.symbol, (l = []));
      l.push(n);
    }
    return undefined;
  });
  return out;
}

// For-loop analysis: counters (modified in the increment and used in the condition).
function forInfo(f) {
  return U.memo(f, 'autosar.for', () => {
    const condReads = reads(f.cond && f.cond.type !== 'Declaration' ? f.cond : null);
    const incWrites = writes(f.inc);
    const counters = new Set([...incWrites.keys()].filter((s) => condReads.has(s)));
    const initSyms = new Set();
    if (f.init) {
      if (f.init.type === 'Declaration') for (const d of f.init.declarators) { if (d.symbol) initSyms.add(d.symbol); }
      else for (const s of writes(f.init).keys()) initSyms.add(s);
    }
    return { condReads, incWrites, counters, initSyms, condWrites: writes(f.cond), bodyWrites: writes(f.body) };
  });
}

const fors = (unit) => U.ix(unit).get('ForStmt');

// Case / default labels that belong to this switch (not to nested switches).
function labelsOf(sw) {
  const out = [];
  cf.walk(sw.body, (n) => {
    if (n.type === 'SwitchStmt' || n.type === 'LambdaExpr') return cf.walk.SKIP;
    if (n.type === 'CaseStmt' || n.type === 'DefaultStmt') out.push(n);
    return undefined;
  });
  return out;
}

const TERMINATORS = new Set(['BreakStmt', 'ReturnStmt', 'ContinueStmt', 'GotoStmt']);
const isThrowStmt = (s) => s && s.type === 'ExprStmt' && U.strip(s.expr) && U.strip(s.expr).type === 'ThrowExpr';

function lineText(unit, file, line) {
  const src = unit.sources && unit.sources.get(file);
  if (!src || !src.text) return null;
  return src.text.split(/\r?\n/)[line - 1] || '';
}

module.exports = [
  D('A6-2-2', ['9.2.1'], {
    name: ['Expression statements shall not be explicit calls to constructors of temporary objects only', '식 문장이 임시 객체 생성자의 명시적 호출뿐이면 안 됩니다'],
  }),
  A({
    id: 'A6-4-1', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 5,
    name: ['A switch statement shall have at least two case-clauses, distinct from the default label', 'switch 문에는 default 외에 case 절이 두 개 이상 있어야 합니다'],
    why: ['A switch with fewer than two cases is an obscure way to write an if statement.', 'case 가 두 개 미만인 switch 는 if 문을 알아보기 어렵게 쓴 것입니다.'],
    fix: ['Replace the switch with an if statement.', 'switch 를 if 문으로 바꾸세요.'],
    check(unit, api) {
      for (const sw of U.ix(unit).get('SwitchStmt')) {
        const cases = labelsOf(sw).filter((l) => l.type === 'CaseStmt').length;
        if (cases < 2) api.report(sw, M(`This switch has ${cases} case clause${cases === 1 ? '' : 's'} besides default.`, `이 switch 에는 default 외에 case 절이 ${cases}개뿐입니다.`));
      }
    },
  }),
  A({
    id: 'A6-5-1', cat: 'Required', enf: 'partially automated', sev: 'MINOR', debt: 5,
    name: ['A for-loop that loops through all elements of a container and only uses the counter as an index shall be a range-based for', '컨테이너의 모든 원소를 돌며 카운터를 인덱스로만 쓰는 for 문은 범위 기반 for 로 써야 합니다'],
    why: ['A hand-written index loop repeats the bounds and can get them wrong; range-based for states the intent directly.', '직접 쓴 인덱스 반복문은 경계를 반복해 쓰다가 틀릴 수 있지만, 범위 기반 for 는 의도를 바로 나타냅니다.'],
    fix: ['Use for (auto& e : container) { ... }.', 'for (auto& e : container) { ... } 를 쓰세요.'],
    check(unit, api) {
      for (const f of fors(unit)) {
        const { counters } = forInfo(f);
        if (counters.size !== 1 || !f.cond || f.cond.type !== 'BinaryExpr' || f.cond.op !== '<') continue;
        const [ctr] = counters;
        const l = U.strip(f.cond.left);
        if (!l || l.type !== 'Identifier' || l.symbol !== ctr) continue;
        const writesInc = forInfo(f).incWrites.get(ctr) || [];
        if (!writesInc.every((w) => w.kind === '++')) continue;
        // container name from `i < c.size()` or `i < N` (array of N)
        const r = U.strip(f.cond.right);
        let container = null;
        if (r && r.type === 'CallExpr') { const cn = U.callName(r); if (cn && cn.member && cn.name === 'size' && U.strip(cn.object) && U.strip(cn.object).type === 'Identifier') container = U.strip(cn.object).symbol; }
        const uses = U.usesIn(f.body, ctr);
        if (!uses.length) continue;
        const allIndex = uses.every((u) => {
          const { p, key } = U.upParens(u);
          if (!p || p.type !== 'IndexExpr' || key !== 'index') return false;
          const o = U.strip(p.object);
          if (!o || o.type !== 'Identifier' || !o.symbol) return false;
          if (container) return o.symbol === container;
          const t = U.nonRef(o.symbol.type);
          const n = U.constInt(r, unit);
          return t.kind === 'array' && n && Number(n.value) === t.size;
        });
        if (allIndex) api.report(f, M(`The loop only uses '${ctr.name}' to index every element; use a range-based for loop.`, `반복문이 '${ctr.name}' 를 모든 원소의 인덱스로만 씁니다. 범위 기반 for 를 쓰세요.`));
      }
    },
  }),
  D('A6-5-2', ['9.5.1'], { name: ['A for loop shall contain a single loop-counter which shall not have floating-point type', 'for 문에는 부동소수점이 아닌 루프 카운터가 하나만 있어야 합니다'] }),
  A({
    id: 'A6-5-3', cat: 'Advisory', enf: 'automated', sev: 'MINOR', debt: 5,
    name: ['Do statements should not be used', 'do 문은 쓰지 않아야 합니다'],
    why: ['The condition of a do-while is checked after the body, which is easy to overlook and to get wrong.', 'do-while 의 조건은 본문 뒤에 검사되어 놓치거나 틀리기 쉽습니다.'],
    fix: ['Use a while or for loop.', 'while 이나 for 문을 쓰세요.'],
    check(unit, api) {
      for (const d of U.ix(unit).get('DoStmt')) if (!d.loc.macro) api.report(d, M('A do statement is used.', 'do 문을 씁니다.'));
    },
  }),
  A({
    id: 'A6-5-4', cat: 'Advisory', enf: 'automated', sev: 'MINOR', debt: 5,
    name: ['For-init-statement and expression should not perform actions other than loop-counter initialization and modification', 'for 초기화문과 증감식은 루프 카운터 초기화와 변경 외의 일을 하지 않아야 합니다'],
    why: ['Extra work hidden in the for header is easily missed when reading the loop.', 'for 머리에 숨긴 추가 작업은 반복문을 읽을 때 놓치기 쉽습니다.'],
    fix: ['Move the extra initialization or update into the loop body or before the loop.', '추가 초기화나 갱신을 반복문 본문이나 반복문 앞으로 옮기세요.'],
    check(unit, api) {
      for (const f of fors(unit)) {
        const { counters, incWrites, initSyms } = forInfo(f);
        for (const [s, ws] of incWrites) if (!counters.has(s)) api.report(ws[0].node, M(`The for increment modifies '${s.name}', which is not the loop counter.`, `for 증감식이 루프 카운터가 아닌 '${s.name}' 를 바꿉니다.`));
        for (const s of initSyms) if (!counters.has(s) && f.init) api.report(f.init, M(`The for initialization sets '${s.name}', which is not the loop counter.`, `for 초기화문이 루프 카운터가 아닌 '${s.name}' 를 설정합니다.`));
        if (f.inc && cf.findFirst(f.inc, 'CallExpr')) api.report(f.inc, M('The for increment calls a function.', 'for 증감식에서 함수를 호출합니다.'));
      }
    },
  }),
  D('A6-6-1', ['9.6.1'], { cat: 'Required', name: ['The goto statement shall not be used', 'goto 문은 쓰면 안 됩니다'] }),
  // ------------------------------------------------------- MISRA C++:2008 M6
  D('M6-2-1', ['8.18.2'], { cat: 'Required', name: ['Assignment operators shall not be used in sub-expressions', '대입 연산자를 하위 식에서 쓰면 안 됩니다'] }),
  A({
    id: 'M6-2-2', cat: 'Required', enf: 'partially automated', type: 'BUG', sev: 'MAJOR', debt: 5, cwe: 'CWE-1077',
    name: ['Floating-point expressions shall not be directly or indirectly tested for equality or inequality', '부동소수점 식을 같음/다름으로 직접 또는 간접 비교하면 안 됩니다'],
    why: ['Rounding makes exact comparison of floating-point values unreliable.', '반올림 때문에 부동소수점 값의 정확한 비교는 믿을 수 없습니다.'],
    fix: ['Compare the difference against a tolerance.', '차이를 허용 오차와 비교하세요.'],
    check(unit, api) {
      const fl = (e) => { const c = e && e.ctype ? U.nonRef(e.ctype) : null; return !!(c && c.kind === 'float'); };
      for (const b of U.ix(unit).get('BinaryExpr')) {
        if ((b.op === '==' || b.op === '!=') && (fl(b.left) || fl(b.right))) api.report(b, M(`Floating-point values are compared with '${b.op}'.`, `부동소수점 값을 '${b.op}' 로 비교합니다.`));
      }
    },
  }),
  A({
    id: 'M6-2-3', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 2,
    name: ['A null statement shall only occur on a line by itself', '빈 문장은 한 줄에 단독으로만 있어야 합니다'],
    why: ['A stray semicolon after if (...) or for (...) silently becomes the whole body.', 'if (...) 나 for (...) 뒤의 잘못 붙은 세미콜론은 조용히 본문 전체가 됩니다.'],
    fix: ['Put the null statement on its own line, or remove it.', '빈 문장을 한 줄에 따로 두거나 지우세요.'],
    check(unit, api) {
      for (const s of U.ix(unit).get('NullStmt')) {
        if (s.loc.macro || (s.attributes && s.attributes.length)) continue;
        const text = lineText(unit, s.loc.file, s.loc.line);
        if (text === null) continue;
        const code = text.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '').trim();
        if (code !== ';') api.report(s, M('The null statement shares its line with other code.', '빈 문장이 다른 코드와 같은 줄에 있습니다.'));
      }
    },
  }),
  D('M6-3-1', ['9.3.1'], { name: ['The body of a switch, while, do or for statement shall be a compound statement', 'switch, while, do, for 문의 본문은 복합문이어야 합니다'] }),
  A({
    id: 'M6-4-1', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 2,
    name: ['An if (condition) or else shall be followed by a compound statement; else may be followed by another if', 'if (조건) 과 else 뒤에는 복합문이 와야 합니다(else 뒤에는 if 도 됩니다)'],
    why: ['Without braces a statement added later is easily believed to be controlled by the if.', '중괄호가 없으면 나중에 추가한 문장이 if 의 영향을 받는다고 착각하기 쉽습니다.'],
    fix: ['Wrap the body in braces.', '본문을 중괄호로 감싸세요.'],
    check(unit, api) {
      for (const s of U.ix(unit).get('IfStmt')) {
        if (s.loc.macro) continue;
        if (s.then && s.then.type !== 'CompoundStmt') api.report(s.then, M('The body of this if is not a compound statement.', '이 if 의 본문이 복합문이 아닙니다.'));
        if (s.else && s.else.type !== 'CompoundStmt' && s.else.type !== 'IfStmt') api.report(s.else, M('The else branch is not a compound statement.', 'else 갈래가 복합문이 아닙니다.'));
      }
    },
  }),
  D('M6-4-2', ['9.4.1']),
  D('M6-4-3', ['9.4.2'], { name: ['A switch statement shall be a well-formed switch statement', 'switch 문은 올바른 형태여야 합니다'] }),
  A({
    id: 'M6-4-4', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['A switch-label shall only be used when the most closely-enclosing compound statement is the body of the switch', 'switch 레이블은 가장 가까운 복합문이 switch 본문일 때만 써야 합니다'],
    why: ['Case labels nested inside other blocks (Duff\'s device) make the control flow very hard to follow.', '다른 블록 안에 둔 case 레이블(Duff 의 장치)은 흐름을 따라가기 매우 어렵게 합니다.'],
    fix: ['Place every case label directly in the switch body.', '모든 case 레이블을 switch 본문에 바로 두세요.'],
    check(unit, api) {
      for (const sw of U.ix(unit).get('SwitchStmt')) {
        for (const l of labelsOf(sw)) {
          let ok = true;
          for (const a of cf.ancestors(l)) {
            if (a === sw.body) break;
            if (a.type !== 'CaseStmt' && a.type !== 'DefaultStmt' && a.type !== 'LabelStmt') { ok = false; break; }
          }
          if (!ok) api.report(l, M('This switch label is nested inside a block within the switch.', '이 switch 레이블이 switch 안의 다른 블록에 들어 있습니다.'));
        }
      }
    },
  }),
  A({
    id: 'M6-4-5', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'MAJOR', debt: 5, cwe: 'CWE-484',
    name: ['An unconditional throw or break statement shall terminate every non-empty switch-clause', '비어 있지 않은 모든 switch 절은 무조건적인 throw 나 break 로 끝나야 합니다'],
    why: ['Falling through into the next clause is a frequent source of errors.', '다음 절로 넘어가는 것은 흔한 오류 원인입니다.'],
    fix: ['End the clause with break (or throw).', '절을 break(또는 throw)로 끝내세요.'],
    check(unit, api) {
      for (const sw of U.ix(unit).get('SwitchStmt')) {
        let groups;
        try { groups = cf.switchClauses(sw).clauses; } catch (e) { continue; }
        for (const c of groups) {
          if (!c.body || !c.body.length) continue;
          let last = c.body[c.body.length - 1];
          while (last && last.type === 'CompoundStmt' && last.body.length) last = last.body[last.body.length - 1];
          if (last && (TERMINATORS.has(last.type) || isThrowStmt(last))) continue;
          api.report(c.node, M('This switch clause is not terminated by break or throw.', '이 switch 절이 break 나 throw 로 끝나지 않습니다.'));
        }
      }
    },
  }),
  A({
    id: 'M6-4-6', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 2,
    name: ['The final clause of a switch statement shall be the default-clause', 'switch 문의 마지막 절은 default 절이어야 합니다'],
    why: ['A default clause at the end documents that every other value was considered.', '끝에 있는 default 절은 다른 모든 값을 고려했음을 보여 줍니다.'],
    fix: ['Add a default clause as the last clause, with a comment if nothing needs doing.', '할 일이 없더라도 주석과 함께 default 절을 마지막에 두세요.'],
    check(unit, api) {
      for (const sw of U.ix(unit).get('SwitchStmt')) {
        const ls = labelsOf(sw);
        if (!ls.length) continue;
        const last = ls[ls.length - 1];
        const hasDefault = ls.some((l) => l.type === 'DefaultStmt');
        if (!hasDefault) api.report(sw, M('This switch has no default clause.', '이 switch 에는 default 절이 없습니다.'));
        else if (last.type !== 'DefaultStmt') api.report(ls.find((l) => l.type === 'DefaultStmt'), M('The default clause is not the final clause of the switch.', 'default 절이 switch 의 마지막 절이 아닙니다.'));
      }
    },
  }),
  A({
    id: 'M6-4-7', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 2,
    name: ['The condition of a switch statement shall not have bool type', 'switch 문의 조건은 bool 형식이면 안 됩니다'],
    why: ['A switch on a bool is an if-else written in an obscure way.', 'bool 에 대한 switch 는 if-else 를 알아보기 어렵게 쓴 것입니다.'],
    fix: ['Use an if-else statement.', 'if-else 문을 쓰세요.'],
    check(unit, api) {
      for (const sw of U.ix(unit).get('SwitchStmt')) {
        const c = sw.cond && sw.cond.type !== 'Declaration' && sw.cond.ctype ? U.nonRef(sw.cond.ctype) : null;
        if (c && c.kind === 'int' && c.name === 'bool') api.report(sw.cond, M('The switch condition has type bool.', 'switch 조건의 형식이 bool 입니다.'));
      }
    },
  }),
  A({
    id: 'M6-5-2', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'MAJOR', debt: 5, cwe: 'CWE-835',
    name: ['If the loop-counter is not modified by -- or ++, it shall only be an operand of <=, <, > or >= in the condition', '루프 카운터를 -- 나 ++ 로 바꾸지 않으면 조건에서 <=, <, >, >= 의 피연산자로만 써야 합니다'],
    why: ['With a step larger than one, an == or != test can jump over the end value and never terminate.', '증가 폭이 1보다 크면 == 나 != 검사는 끝 값을 건너뛰어 끝나지 않을 수 있습니다.'],
    fix: ['Use a relational operator in the loop condition.', '반복 조건에 관계 연산자를 쓰세요.'],
    check(unit, api) {
      for (const f of fors(unit)) {
        const { counters, incWrites, condReads } = forInfo(f);
        for (const s of counters) {
          if ((incWrites.get(s) || []).every((w) => w.kind === '++' || w.kind === '--')) continue;
          for (const u of condReads.get(s) || []) {
            const { p } = U.upParens(u);
            if (p && p.type === 'BinaryExpr' && (p.op === '==' || p.op === '!=')) api.report(p, M(`The loop counter '${s.name}' is tested with '${p.op}' although it does not step by one.`, `루프 카운터 '${s.name}' 가 1씩 바뀌지 않는데 '${p.op}' 로 검사합니다.`));
          }
        }
      }
    },
  }),
  A({
    id: 'M6-5-3', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'MAJOR', debt: 5,
    name: ['The loop-counter shall not be modified within the condition or the statement', '루프 카운터는 조건이나 본문에서 바꾸면 안 됩니다'],
    why: ['Changing the counter outside the increment expression makes the number of iterations hard to determine.', '증감식 밖에서 카운터를 바꾸면 반복 횟수를 알기 어렵습니다.'],
    fix: ['Modify the counter only in the increment expression.', '카운터는 증감식에서만 바꾸세요.'],
    check(unit, api) {
      for (const f of fors(unit)) {
        const { counters, condWrites, bodyWrites } = forInfo(f);
        for (const s of counters) {
          for (const w of [...(condWrites.get(s) || []), ...(bodyWrites.get(s) || [])]) api.report(w.node, M(`The loop counter '${s.name}' is modified outside the increment expression.`, `루프 카운터 '${s.name}' 를 증감식 밖에서 바꿉니다.`));
        }
      }
    },
  }),
  A({
    id: 'M6-5-4', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['The loop-counter shall be modified by one of --, ++, -= n or += n, where n is constant for the loop', '루프 카운터는 --, ++, -= n, += n(n 은 반복 중 상수) 중 하나로 바꿔야 합니다'],
    why: ['Other updates (multiplication, assignment of a computed value) make the iteration count hard to predict.', '다른 갱신(곱셈, 계산한 값의 대입)은 반복 횟수를 예측하기 어렵게 합니다.'],
    fix: ['Use a fixed step with ++, --, += or -=.', '++, --, +=, -= 로 고정된 폭만큼 바꾸세요.'],
    check(unit, api) {
      for (const f of fors(unit)) {
        const { counters, incWrites, bodyWrites } = forInfo(f);
        for (const s of counters) {
          for (const w of incWrites.get(s) || []) {
            if (w.kind === '++' || w.kind === '--') continue;
            if ((w.kind === '+=' || w.kind === '-=') && w.rhs) {
              const rs = reads(w.rhs);
              if (![...rs.keys()].some((x) => bodyWrites.has(x) || x === s)) continue;
            }
            api.report(w.node, M(`The loop counter '${s.name}' is modified with '${w.kind === 'assign' ? '=' : w.kind}' instead of a constant step.`, `루프 카운터 '${s.name}' 를 고정 폭 대신 '${w.kind === 'assign' ? '=' : w.kind}' 로 바꿉니다.`));
          }
        }
      }
    },
  }),
  A({
    id: 'M6-5-5', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['A loop-control-variable other than the loop-counter shall not be modified within the condition or expression', '루프 카운터가 아닌 루프 제어 변수는 조건이나 증감식에서 바꾸면 안 됩니다'],
    why: ['Hidden updates of other control variables in the for header make termination hard to reason about.', 'for 머리에서 다른 제어 변수를 몰래 바꾸면 종료 여부를 따지기 어렵습니다.'],
    fix: ['Update the variable in the loop body.', '변수는 반복문 본문에서 바꾸세요.'],
    check(unit, api) {
      for (const f of fors(unit)) {
        const { counters, condWrites, condReads } = forInfo(f);
        for (const [s, ws] of condWrites) if (!counters.has(s) && condReads.has(s)) api.report(ws[0].node, M(`The loop-control variable '${s.name}' is modified in the loop condition.`, `루프 제어 변수 '${s.name}' 를 반복 조건에서 바꿉니다.`));
      }
    },
  }),
  A({
    id: 'M6-5-6', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['A loop-control-variable other than the loop-counter modified in the statement shall have type bool', '본문에서 바꾸는, 루프 카운터가 아닌 루프 제어 변수는 bool 형식이어야 합니다'],
    why: ['Using a numeric variable changed in the body as a second loop bound makes the termination condition obscure.', '본문에서 바꾸는 수치 변수를 두 번째 반복 경계로 쓰면 종료 조건이 모호해집니다.'],
    fix: ['Use a bool flag for early termination.', '조기 종료에는 bool 플래그를 쓰세요.'],
    check(unit, api) {
      for (const f of fors(unit)) {
        const { counters, condReads, bodyWrites } = forInfo(f);
        for (const [s, ws] of bodyWrites) {
          if (counters.has(s) || !condReads.has(s)) continue;
          const t = U.canon(s.type);
          if (!(t.kind === 'int' && t.name === 'bool')) api.report(ws[0].node, M(`The loop-control variable '${s.name}' is modified in the loop body but is not bool.`, `루프 제어 변수 '${s.name}' 를 본문에서 바꾸지만 bool 이 아닙니다.`));
        }
      }
    },
  }),
  D('M6-6-1', ['9.6.2']),
  D('M6-6-2', ['9.6.3']),
  A({
    id: 'M6-6-3', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 5,
    name: ['The continue statement shall only be used within a well-formed for loop', 'continue 문은 올바른 형태의 for 문 안에서만 써야 합니다'],
    why: ['In while and do loops a continue easily skips the update of the loop variable.', 'while 과 do 반복문에서 continue 는 반복 변수 갱신을 건너뛰기 쉽습니다.'],
    fix: ['Restructure the loop body with if/else instead of continue.', 'continue 대신 if/else 로 본문을 다시 구성하세요.'],
    check(unit, api) {
      for (const c of U.ix(unit).get('ContinueStmt')) {
        const loop = cf.enclosing(c, LOOP_TYPES);
        if (loop && loop.type !== 'ForStmt') api.report(c, M(`continue is used in a ${loop.type === 'DoStmt' ? 'do' : loop.type === 'WhileStmt' ? 'while' : 'range-based for'} loop.`, `${loop.type === 'DoStmt' ? 'do' : loop.type === 'WhileStmt' ? 'while' : '범위 기반 for'} 반복문에서 continue 를 씁니다.`));
      }
    },
  }),
];
