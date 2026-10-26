'use strict';

// Bug rules (sonar-dotnet reliability family) that work on the AST plus the
// light type model.

const { R } = require('../registry');
const { same, unparen, dotted, callName, callTarget, forEachChild, hasMod, attrNamed, enclosing } = require('../ast');
const U = require('../util');
const T = require('../types');

const sideEffectFree = (e) => !U.containsKind(e, ['Invocation', 'New', 'Assign', 'Await']) && !(e.k === 'Unary' && (e.op === '++' || e.op === '--')) && !U.containsKind(e, ['Unary']);

// ─── self assignment
R('self-assignment', 'S1656', 'B', 'MA', 3, ['pitfall'],
  ['Variables should not be self-assigned', 'Assigning a variable to itself does nothing; usually `this.` or a parameter name is missing.', 'Assign the intended value, e.g. this.name = name.'],
  ['변수를 자기 자신에게 대입하면 안 됩니다', '변수를 자신에게 대입하면 아무 일도 하지 않습니다. 보통 this.나 매개변수 이름이 빠졌습니다.', '의도한 값을 대입하세요. 예: this.name = name.'],
  { kinds: { Assign(n, cx) {
    if (n.op !== '=') return;
    const l = unparen(n.left); const r = unparen(n.right);
    if (!['Name', 'Member', 'Element'].includes(l.k)) return;
    if (!same(l, r) || !sideEffectFree(l)) return;
    if (l.k === 'Name' && !l.sym && !l.msym) return;
    cx.report(n, `Remove or correct this useless self-assignment of '${cx.text(l)}'.`, `'${cx.text(l)}'의 쓸모없는 자기 대입을 지우거나 고치세요.`);
  } } });

// ─── identical operands
const IDENT_OPS = new Set(['==', '!=', '<', '>', '<=', '>=', '&&', '||', '&', '|', '^', '-', '/', '%']);
R('identical-operands', 'S1764', 'B', 'MA', 2, ['pitfall'],
  ['Identical expressions should not be used on both sides of a binary operator', 'Using the same expression on both sides always gives the same result and is almost always a copy-paste error.', 'Fix the operand that was meant to differ; use double.IsNaN for NaN checks.'],
  ['이항 연산자 양쪽에 같은 식을 쓰면 안 됩니다', '양쪽에 같은 식을 쓰면 결과가 항상 같고 대부분 복사-붙여넣기 오류입니다.', '달라야 할 피연산자를 고치세요. NaN 검사는 double.IsNaN을 쓰세요.'],
  { kinds: { Binary(n, cx) {
    if (!IDENT_OPS.has(n.op) || n.synthetic) return;
    const l = unparen(n.left); const r = unparen(n.right);
    if (l.k === 'Literal' || !same(l, r) || !sideEffectFree(l)) return;
    if ((n.op === '==' || n.op === '!=') && isFloat(l, cx)) return;
    if ((n.op === '-' || n.op === '/') && l.k === 'Name' && !l.sym && !l.msym) return;
    cx.report(n, `Correct one of the identical sub-expressions on both sides of operator '${n.op}'.`, `연산자 '${n.op}' 양쪽의 같은 하위 식 중 하나를 고치세요.`);
  } } });

function isFloat(e, cx) {
  const t = T.typeOf(e, cx.project);
  return !t || t.name === 'double' || t.name === 'float' || t.name === 'Double' || t.name === 'Single';
}

// ─── if/else-if chains
function ifChain(n) {
  const conds = []; const branches = [];
  let cur = n;
  while (cur && cur.k === 'If') {
    conds.push(cur.cond); branches.push(cur.then);
    if (cur.else && cur.else.k === 'If') { cur = cur.else; continue; }
    if (cur.else) branches.push(cur.else);
    return { conds, branches, hasElse: !!cur.else };
  }
  return { conds, branches, hasElse: false };
}
const isChainHead = (n) => !(n.parent && n.parent.k === 'If' && n.parent.else === n);
const stmtCount = (b) => (b && b.k === 'Block' ? b.stmts.length : b ? 1 : 0);
const lineSpan = (b) => (b ? b.endLine - b.line + 1 : 0);
const bodyKey = (b) => (b && b.k === 'Block' && b.stmts.length === 1 ? b.stmts[0] : b);

R('duplicate-condition', 'S1862', 'B', 'MA', 10, ['pitfall', 'unused'],
  ['Related "if/else if" statements should not have the same condition', 'A repeated condition in an if/else-if chain means the second branch can never run.', 'Fix the condition or merge the branches.'],
  ['if/else if 문에 같은 조건이 반복되면 안 됩니다', 'if/else-if 사슬에 같은 조건이 반복되면 두 번째 분기는 절대 실행되지 않습니다.', '조건을 고치거나 분기를 합치세요.'],
  { kinds: {
    If(n, cx) {
      if (!isChainHead(n)) return;
      const { conds } = ifChain(n);
      for (let i = 1; i < conds.length; i++) {
        for (let j = 0; j < i; j++) {
          if (same(unparen(conds[i]), unparen(conds[j])) && sideEffectFree(conds[i])) {
            cx.report(conds[i], `This branch duplicates the condition on line ${conds[j].line}.`, `이 분기는 ${conds[j].line}행의 조건과 같습니다.`);
            break;
          }
        }
      }
    },
    Switch(n, cx) {
      const seen = [];
      for (const sec of n.sections) for (const lab of sec.labels) {
        if (lab.k !== 'CaseLabel' || lab.when || !lab.pattern || lab.pattern.k !== 'ConstPattern') continue;
        const prev = seen.find((p) => same(p.pattern.expr, lab.pattern.expr));
        if (prev) cx.report(lab, `This case duplicates the one on line ${prev.line}.`, `이 case는 ${prev.line}행의 case와 같습니다.`);
        else seen.push(lab);
      }
    },
  } });

R('identical-branches', 'S1871', 'S', 'MA', 10, ['design', 'suspicious'],
  ['Two branches in a conditional structure should not have exactly the same implementation', 'Duplicated branch bodies are either a copy-paste error or should be merged.', 'Merge the conditions, or fix the branch that was meant to differ.'],
  ['조건 구조의 두 분기 구현이 같으면 안 됩니다', '분기 본문이 같으면 복사-붙여넣기 오류이거나 합쳐야 합니다.', '조건을 합치거나 달라야 할 분기를 고치세요.'],
  { kinds: {
    If(n, cx) {
      if (!isChainHead(n)) return;
      const { branches, hasElse } = ifChain(n);
      if (allSame(branches) && hasElse) return; // S3923
      for (let i = 1; i < branches.length; i++) {
        const b = branches[i];
        if (stmtCount(b) === 0) continue;
        if (stmtCount(b) < 2 && lineSpan(b) < 3) continue;
        for (let j = 0; j < i; j++) {
          if (same(bodyKey(branches[j]), bodyKey(b))) {
            cx.report(b, `This branch's code block is the same as the block for the branch on line ${branches[j].line}.`, `이 분기의 코드 블록이 ${branches[j].line}행 분기와 같습니다.`);
            break;
          }
        }
      }
    },
    Switch(n, cx) {
      const secs = n.sections;
      if (secs.length > 1 && secs.some((s) => s.labels.some((l) => l.k === 'DefaultLabel')) && secs.every((s) => sameStmts(s.stmts, secs[0].stmts))) return;
      for (let i = 1; i < secs.length; i++) {
        const st = withoutBreak(secs[i].stmts);
        if (st.length < 2 && (!st.length || st[st.length - 1].endLine - st[0].line < 2)) continue;
        for (let j = 0; j < i; j++) {
          if (sameStmts(withoutBreak(secs[j].stmts), st)) {
            cx.report(secs[i], `This case's code is the same as the case on line ${secs[j].line}.`, `이 case의 코드가 ${secs[j].line}행 case와 같습니다.`);
            break;
          }
        }
      }
    },
  } });

function withoutBreak(stmts) { return stmts.length && stmts[stmts.length - 1].k === 'Break' ? stmts.slice(0, -1) : stmts; }
function sameStmts(a, b) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false; return true; }
function allSame(list) { return list.length > 1 && list.every((b) => same(bodyKey(b), bodyKey(list[0]))); }

R('all-branches-identical', 'S3923', 'B', 'MA', 15, ['pitfall'],
  ['All branches in a conditional structure should not have exactly the same implementation', 'When every branch does the same thing the condition is useless, which usually hides a mistake.', 'Remove the condition or fix the branches.'],
  ['조건 구조의 모든 분기 구현이 같으면 안 됩니다', '모든 분기가 같은 일을 하면 조건이 쓸모없고 대개 실수를 숨깁니다.', '조건을 지우거나 분기를 고치세요.'],
  { kinds: {
    If(n, cx) {
      if (!isChainHead(n)) return;
      const { branches, hasElse } = ifChain(n);
      if (hasElse && allSame(branches) && stmtCount(branches[0]) > 0) cx.report(n, 'Remove this conditional structure or edit its code blocks so that they are not all the same.', '이 조건 구조를 지우거나 코드 블록이 모두 같지 않게 고치세요.');
    },
    Conditional(n, cx) {
      if (same(unparen(n.then), unparen(n.else))) cx.report(n, 'This conditional operation returns the same value whether the condition is true or false.', '이 조건 연산은 조건과 상관없이 같은 값을 돌려줍니다.');
    },
    Switch(n, cx) {
      const secs = n.sections;
      if (secs.length > 1 && secs.some((s) => s.labels.some((l) => l.k === 'DefaultLabel')) && secs.every((s) => sameStmts(s.stmts, secs[0].stmts)) && secs[0].stmts.length) {
        cx.report(n, 'Remove this switch or edit its sections so that they are not all the same.', '이 switch를 지우거나 섹션이 모두 같지 않게 고치세요.');
      }
    },
    SwitchExpr(n, cx) {
      if (n.arms.length > 1 && n.arms.some((a) => a.pattern.k === 'DiscardPattern') && n.arms.every((a) => same(a.expr, n.arms[0].expr))) {
        cx.report(n, 'Every arm of this switch expression returns the same value.', '이 switch 식의 모든 팔이 같은 값을 돌려줍니다.');
      }
    },
  } });

// ─── exceptions created but not thrown
R('exception-not-thrown', 'S3984', 'B', 'MA', 2, ['error-handling'],
  ['Exceptions should not be created without being thrown', 'Creating an exception object without throwing it has no effect.', 'Add throw, or remove the statement.'],
  ['예외를 만들고 던지지 않으면 안 됩니다', '예외 객체를 만들기만 하고 던지지 않으면 아무 효과가 없습니다.', 'throw를 붙이거나 문장을 지우세요.'],
  { kinds: { ExprStmt(n, cx) {
    const e = unparen(n.expr);
    if (e.k === 'New' && e.type && /Exception$/.test(e.type.name)) cx.report(n, `Throw this '${e.type.name}' or remove the useless statement.`, `이 '${e.type.name}'을 던지거나 쓸모없는 문장을 지우세요.`);
  } } });

// ─── return values of pure methods ignored
const STRING_PURE = new Set(['Trim', 'TrimStart', 'TrimEnd', 'ToUpper', 'ToLower', 'ToUpperInvariant', 'ToLowerInvariant', 'Replace', 'Substring', 'Insert', 'Remove',
  'PadLeft', 'PadRight', 'Split', 'Normalize', 'Contains', 'StartsWith', 'EndsWith', 'IndexOf', 'Equals']);
const LINQ_PURE = new Set(['Where', 'Select', 'SelectMany', 'OrderBy', 'OrderByDescending', 'ThenBy', 'ThenByDescending', 'Skip', 'Take', 'SkipWhile', 'TakeWhile',
  'Distinct', 'Any', 'All', 'Count', 'LongCount', 'First', 'FirstOrDefault', 'Last', 'LastOrDefault', 'Single', 'SingleOrDefault', 'ElementAt', 'ElementAtOrDefault',
  'Sum', 'Max', 'Min', 'Average', 'Cast', 'OfType', 'GroupBy', 'Zip', 'ToList', 'ToArray', 'ToDictionary', 'ToHashSet', 'ToLookup', 'Contains', 'SequenceEqual',
  'DefaultIfEmpty', 'Except', 'Intersect', 'Union', 'Reverse', 'AsEnumerable']);
const DATE_PURE = new Set(['AddDays', 'AddHours', 'AddMinutes', 'AddSeconds', 'AddMilliseconds', 'AddMonths', 'AddYears', 'AddTicks', 'Add', 'Subtract', 'ToUniversalTime', 'ToLocalTime']);
const STATIC_PURE = new Set(['string.Format', 'String.Format', 'string.Concat', 'String.Concat', 'string.Join', 'String.Join', 'Path.Combine', 'Path.GetFileName',
  'Path.GetExtension', 'Path.GetDirectoryName', 'Math.Abs', 'Math.Max', 'Math.Min', 'Math.Round', 'Math.Floor', 'Math.Ceiling', 'Math.Sqrt', 'Math.Pow']);
R('return-value-ignored', 'S2201', 'B', 'MA', 10, ['suspicious'],
  ['Return values from functions without side effects should not be ignored', 'Strings, dates and LINQ queries are immutable: calling Trim, Replace, AddDays or Where without using the result does nothing.', 'Use the returned value, e.g. s = s.Trim();.'],
  ['부수 효과 없는 함수의 반환값을 버리면 안 됩니다', '문자열, 날짜, LINQ 쿼리는 불변이라 결과를 쓰지 않는 Trim, Replace, AddDays, Where 호출은 아무 일도 하지 않습니다.', '반환값을 쓰세요. 예: s = s.Trim();.'],
  { kinds: { ExprStmt(n, cx) {
    const e = unparen(n.expr);
    if (e.k !== 'Invocation') return;
    const name = callName(e);
    const target = callTarget(e);
    if (!name || !target) return;
    const callee = unparen(e.expr);
    if (callee.cond) return;
    const td = dotted(target);
    if (td && STATIC_PURE.has(`${td}.${name}`)) { report(); return; }
    if (cx.project.typesByName.has(name) || projectDefinesMethod(cx.project, name)) return;
    const t = T.typeOf(target, cx.project);
    if (t && t.name === 'string' && !t.ranks && STRING_PURE.has(name)) { report(); return; }
    if (t && (t.name === 'DateTime' || t.name === 'TimeSpan' || t.name === 'DateTimeOffset') && !t.ranks && DATE_PURE.has(name)) { report(); return; }
    if (LINQ_PURE.has(name) && !['Contains', 'Remove', 'Add', 'Reverse'].includes(name) && (t ? (T.COLLECTIONS.has(t.name) || t.ranks) : isLinqChain(target))) {
      if (e.args.some((a) => a.expr.k === 'Lambda' && lambdaHasSideEffects(a.expr))) return;
      report();
    }
    function report() { cx.report(n, `Use the return value of '${name}'; the call has no side effects.`, `'${name}'의 반환값을 사용하세요. 이 호출은 부수 효과가 없습니다.`); }
  } } });

function isLinqChain(e) {
  e = unparen(e);
  return e && e.k === 'Invocation' && ['Where', 'Select', 'OrderBy', 'OrderByDescending', 'Skip', 'Take', 'Distinct', 'SelectMany', 'GroupBy'].includes(callName(e));
}
function lambdaHasSideEffects(l) { return !!U.containsKind(l.body, ['Assign', 'Invocation']) && l.body.k !== 'Binary'; }
function projectDefinesMethod(project, name) {
  if (project._methodNames === undefined) {
    project._methodNames = new Set();
    for (const t of project.allTypeInfos) for (const [k, arr] of t.members) if (arr.some((m) => m.kind === 'method')) project._methodNames.add(k);
  }
  return project._methodNames.has(name);
}

// ─── integer division assigned to floating point
R('integer-division-to-float', 'S2184', 'B', 'MI', 5, ['cwe-190', 'overflow'],
  ['Results of integer division should not be assigned to floating point variables', 'Integer division truncates before the conversion: double d = 1 / 3; is 0.', 'Make one operand floating point: 1.0 / 3.'],
  ['정수 나눗셈 결과를 실수 변수에 대입하면 안 됩니다', '정수 나눗셈은 변환 전에 잘립니다. double d = 1 / 3;은 0입니다.', '피연산자 하나를 실수로 만드세요: 1.0 / 3.'],
  { kinds: {
    VarDecl(n, cx) {
      const d = n.parent;
      if (!d || (d.k !== 'LocalDecl' && d.k !== 'Field') || !n.init) return;
      check(d.type, n.init, cx);
    },
    Assign(n, cx) {
      if (n.op !== '=') return;
      const lt = T.typeOf(n.left, cx.project);
      if (lt) check(lt.node || { name: lt.name }, n.right, cx);
    },
  } });
function check(typeNode, init, cx) {
  if (!typeNode || !['double', 'float', 'decimal', 'Double', 'Single', 'Decimal'].includes(typeNode.name) || typeNode.ranks) return;
  const e = unparen(init);
  if (!e || e.k !== 'Binary' || e.op !== '/') return;
  const l = T.typeOf(e.left, cx.project); const r = T.typeOf(e.right, cx.project);
  if (l && r && T.INTEGRAL.has(l.name) && T.INTEGRAL.has(r.name) && !l.nullable && !r.nullable) {
    cx.report(e, 'Cast one of the operands of this integer division to floating point.', '이 정수 나눗셈의 피연산자 하나를 실수로 캐스팅하세요.');
  }
}

// ─── useless increment
R('useless-increment', 'S2123', 'B', 'MA', 1, ['unused'],
  ['Values should not be uselessly incremented', '`return i++;` or `i = i++;` discards the increment.', 'Use ++i, or drop the increment.'],
  ['값을 쓸모없이 증가시키면 안 됩니다', '`return i++;`나 `i = i++;`는 증가분을 버립니다.', '++i를 쓰거나 증가를 지우세요.'],
  { kinds: {
    Return(n, cx) {
      const e = unparen(n.expr);
      if (e && e.k === 'Unary' && e.postfix && e.operand.k === 'Name' && e.operand.sym && e.operand.sym.kind !== 'param' && !e.operand.sym.captured) cx.report(e, `Remove this increment or correct the code not to waste it.`, '이 증감을 지우거나 버려지지 않게 고치세요.');
    },
    Assign(n, cx) {
      const r = unparen(n.right);
      if (n.op === '=' && r.k === 'Unary' && r.postfix && same(unparen(n.left), unparen(r.operand))) cx.report(r, 'Remove this increment or correct the code not to waste it.', '이 증감을 지우거나 버려지지 않게 고치세요.');
    },
  } });

// ─── reversed operators =+ =- =!
R('reversed-operator', 'S2757', 'B', 'MA', 1, ['pitfall'],
  ['Non-existent operators like "=+" should not be used', '`x =+ 1` assigns +1 instead of adding it; the operator was probably reversed.', 'Write += (or -=), or put a space: x = +1.'],
  ['"=+" 같은 없는 연산자를 쓰면 안 됩니다', '`x =+ 1`은 1을 더하지 않고 +1을 대입합니다. 연산자를 뒤집어 쓴 것 같습니다.', '+=(또는 -=)를 쓰거나 공백을 넣으세요: x = +1.'],
  { kinds: { Assign(n, cx) {
    if (n.op !== '=') return;
    const r = n.right;
    if (!(r.k === 'Unary' && !r.postfix && (r.op === '+' || r.op === '-' || r.op === '!')) && !(r.k === 'Literal' && /^-/.test(r.raw || ''))) return;
    const between = cx.src.slice(n.left.end, r.pos);
    if (!/^\s+=$/.test(between)) return;
    const after = cx.src[r.pos + 1];
    if (after !== ' ' && after !== '\t') return;
    const op = cx.src[r.pos];
    cx.report(n, `Was '${op}=' meant instead of '=${op}'?`, `'=${op}' 대신 '${op}='를 의도했나요?`);
  } } });

// ─── shifts
R('shift-out-of-range', 'S2183', 'B', 'MI', 5, ['pitfall'],
  ['Integral numbers should not be shifted by zero or more than their number of bits-1', 'Shift counts are masked to the type width: x << 32 on an int is x << 0.', 'Use a shift count between 1 and the bit width minus one, or a wider type.'],
  ['정수를 0이나 비트 수 이상만큼 시프트하면 안 됩니다', '시프트 횟수는 타입 폭으로 잘려서 int의 x << 32는 x << 0입니다.', '1부터 비트 수-1 사이로 시프트하거나 더 넓은 타입을 쓰세요.'],
  { kinds: { Binary(n, cx) {
    if (n.op !== '<<' && n.op !== '>>' && n.op !== '>>>') return;
    const k = U.numVal(n.right);
    if (k == null || !Number.isInteger(k)) return;
    const lt = T.typeOf(n.left, cx.project);
    const bits = lt && (lt.name === 'long' || lt.name === 'ulong') ? 64 : lt && (lt.name === 'int' || lt.name === 'uint') ? 32 : 0;
    if (!bits) return;
    if (k >= bits) cx.report(n, `Shifting a ${lt.name} by ${k} is the same as shifting by ${k % bits}.`, `${lt.name}을 ${k}만큼 시프트하는 것은 ${k % bits}만큼 시프트하는 것과 같습니다.`);
    else if (k === 0 && U.unparen(n.left).k !== 'Literal') cx.report(n, 'Remove this useless shift by zero.', '0만큼의 쓸모없는 시프트를 지우세요.');
  } } });

// ─── property accessors
function fieldBaseName(n) { return String(n).replace(/^(m_|_+|s_)/, '').toLowerCase(); }
function accessorField(acc, cx, kind) {
  const b = acc.body ? acc.body : acc.exprBody;
  if (!b) return null;
  let e = null;
  if (kind === 'get') {
    if (acc.exprBody) e = acc.exprBody;
    else if (b.k === 'Block' && b.stmts.length === 1 && b.stmts[0].k === 'Return') e = b.stmts[0].expr;
  } else {
    let a = acc.exprBody;
    if (!a && b.k === 'Block' && b.stmts.length === 1 && b.stmts[0].k === 'ExprStmt') a = b.stmts[0].expr;
    if (a && a.k === 'Assign' && a.op === '=' && unparen(a.right).k === 'Name' && unparen(a.right).name === 'value') e = a.left;
  }
  e = unparen(e);
  if (!e) return null;
  if (e.k === 'Member' && e.expr.k === 'This') return { name: e.name, node: e, msym: e.msym };
  if (e.k === 'Name' && e.msym) return { name: e.name, node: e, msym: e.msym };
  void cx;
  return null;
}
R('accessor-wrong-field', 'S4275', 'B', 'CR', 5, ['pitfall'],
  ['Getters and setters should access the expected fields', 'The accessor reads or writes a field whose name matches another property, while a field matching this property exists: a copy-paste slip.', 'Access the field that belongs to this property.'],
  ['getter와 setter는 기대하는 필드에 접근해야 합니다', '이 속성과 이름이 맞는 필드가 있는데 접근자는 다른 속성의 필드를 읽거나 씁니다. 복사-붙여넣기 실수입니다.', '이 속성에 해당하는 필드에 접근하세요.'],
  { kinds: { Property(n, cx) {
    if (!n.accessors || !n.owner || !n.owner.typeInfo) return;
    const info = n.owner.typeInfo;
    const fieldNames = [];
    for (const [k, arr] of info.members) if (arr.some((m) => m.kind === 'field')) fieldNames.push(k);
    const own = fieldNames.find((f) => fieldBaseName(f) === n.name.toLowerCase());
    if (!own) return;
    for (const acc of n.accessors) {
      const f = accessorField(acc, cx, acc.kind === 'get' ? 'get' : 'set');
      if (!f || f.name === own || !fieldNames.includes(f.name)) continue;
      const other = info.members.get(f.name);
      if (!other || !other.some((m) => m.kind === 'field')) continue;
      cx.report(f.node, `Refactor this ${acc.kind}ter so that it actually refers to the field '${own}'.`, `이 ${acc.kind === 'get' ? 'getter' : 'setter'}가 실제로 필드 '${own}'를 참조하도록 고치세요.`);
    }
  } } });

R('setter-ignores-value', 'S3237', 'B', 'MA', 5, ['pitfall'],
  ['"value" contextual keyword should be used', 'A set or init accessor that never uses `value` ignores what the caller assigns.', 'Assign value, or throw NotSupportedException if setting is not allowed.'],
  ['문맥 키워드 "value"를 사용해야 합니다', '`value`를 쓰지 않는 set/init 접근자는 호출자가 대입한 값을 무시합니다.', 'value를 대입하거나, 설정을 막으려면 NotSupportedException을 던지세요.'],
  { kinds: { Accessor(n, cx) {
    if (n.kind !== 'set' && n.kind !== 'init' && n.kind !== 'add' && n.kind !== 'remove') return;
    if (!n.valueSym || (!n.body && !n.exprBody)) return;
    if (n.body && n.body.stmts.length === 0) return;
    if (n.valueSym.refs.length || n.valueSym.nameofRefs) return;
    const b = n.exprBody || n.body;
    if (U.containsKind(b, ['Throw', 'ThrowExpr']) || (n.exprBody && n.exprBody.k === 'ThrowExpr')) return;
    if (n.member && n.member.iface) return;
    if (n.member && (hasMod(n.member, 'override'))) return;
    cx.report(n, `Use the 'value' contextual keyword in this ${n.kind} accessor declaration.`, `이 ${n.kind} 접근자 선언에서 문맥 키워드 'value'를 사용하세요.`);
  } } });

// ─── infinite recursion
R('infinite-recursion', 'S2190', 'B', 'BL', 30, ['suspicious'],
  ['Loops and recursions should not be infinite', 'The member calls itself unconditionally (for example a property getter returning the property itself), which ends in StackOverflowException.', 'Return the backing field, or add a terminating condition.'],
  ['반복과 재귀는 무한하면 안 됩니다', '멤버가 조건 없이 자신을 호출해(예: 속성 getter가 자기 자신을 반환) StackOverflowException으로 끝납니다.', '백킹 필드를 반환하거나 종료 조건을 넣으세요.'],
  { kinds: {
    Property(n, cx) {
      const self = (e) => { e = unparen(e); return e && ((e.k === 'Name' && e.name === n.name && !e.sym) || (e.k === 'Member' && e.expr.k === 'This' && e.name === n.name)); };
      if (n.exprBody && self(n.exprBody)) { cx.report(n.exprBody, `Add a way to break out of this property's recursion.`, '이 속성의 재귀를 끝낼 방법을 넣으세요.'); return; }
      for (const acc of n.accessors || []) {
        if (acc.kind === 'get') {
          const e = acc.exprBody || (acc.body && acc.body.stmts.length && acc.body.stmts[0].k === 'Return' ? acc.body.stmts[0].expr : null);
          if (e && self(e)) cx.report(e, `Add a way to break out of this property accessor's recursion.`, '이 속성 접근자의 재귀를 끝낼 방법을 넣으세요.');
        } else if (acc.kind === 'set') {
          const a = acc.exprBody || (acc.body && acc.body.stmts.length && acc.body.stmts[0].k === 'ExprStmt' ? acc.body.stmts[0].expr : null);
          if (a && a.k === 'Assign' && a.op === '=' && self(a.left)) cx.report(a, `Add a way to break out of this property accessor's recursion.`, '이 속성 접근자의 재귀를 끝낼 방법을 넣으세요.');
        }
      }
    },
    Method(n, cx) {
      if (n.iface) return;
      const first = n.exprBody || (n.body && n.body.stmts[0]);
      if (!first) return;
      let e = first.k === 'Return' ? first.expr : first.k === 'ExprStmt' ? first.expr : first.k === 'Block' ? null : first;
      e = unparen(e);
      if (!e || e.k !== 'Invocation') return;
      const callee = unparen(e.expr);
      const isSelf = (callee.k === 'Name' && callee.name === n.name && !callee.sym) || (callee.k === 'Member' && callee.expr.k === 'This' && callee.name === n.name);
      if (!isSelf || e.args.length !== n.params.length) return;
      for (let i = 0; i < e.args.length; i++) {
        const a = unparen(e.args[i].expr);
        if (!(a.k === 'Name' && a.sym && a.sym.decl === n.params[i]) || e.args[i].name) return;
      }
      if ((n.typeParams || []).length && callee.typeArgs) return;
      cx.report(e, `Add a way to break out of this method's recursion.`, '이 메서드의 재귀를 끝낼 방법을 넣으세요.');
    },
  } });

// ─── loops
R('loop-at-most-once', 'S1751', 'B', 'MA', 10, ['confusing'],
  ['Loops with at most one iteration should be refactored', 'The loop body always ends with break, return or throw, so it runs at most once.', 'Replace the loop with an if, or fix the jump.'],
  ['많아야 한 번 도는 반복은 고쳐야 합니다', '반복 본문이 항상 break, return, throw로 끝나서 많아야 한 번 실행됩니다.', '반복을 if로 바꾸거나 점프를 고치세요.'],
  { kinds: {
    For: atMostOnce, While: atMostOnce,
  } });
function atMostOnce(n, cx) {
  const b = n.body;
  if (!b || b.k !== 'Block' || !b.stmts.length) return;
  const last = b.stmts[b.stmts.length - 1];
  if (!['Break', 'Return', 'Throw'].includes(last.k)) return;
  let hasContinue = false;
  const visit = (x) => {
    if (hasContinue) return;
    if (x.k === 'Continue') { hasContinue = true; return; }
    if (['For', 'Foreach', 'While', 'Do', 'Lambda', 'LocalFunc'].includes(x.k)) return;
    forEachChild(x, visit);
  };
  forEachChild(b, visit);
  if (hasContinue) return;
  if (U.containsKind(b, ['Goto'])) return;
  cx.report(n, 'Refactor this loop to do more than one iteration.', '이 반복이 한 번보다 많이 돌도록 고치세요.', { atName: false });
}

function forVars(n) {
  const names = new Set();
  for (const x of n.init || []) if (x.k === 'LocalDecl') for (const v of x.vars) names.add(v.name);
  return names;
}
function updatedNames(exprs) {
  const out = new Set();
  for (const e of exprs) {
    const x = unparen(e);
    if (x.k === 'Unary' && (x.op === '++' || x.op === '--') && unparen(x.operand).k === 'Name') out.add(unparen(x.operand).name);
    if (x.k === 'Assign' && unparen(x.left).k === 'Name') out.add(unparen(x.left).name);
  }
  return out;
}
R('for-wrong-direction', 'S2251', 'B', 'MA', 5, ['pitfall'],
  ['A "for" loop update clause should move the counter in the right direction', 'The condition waits for the counter to grow but the update decreases it (or the opposite): the loop never ends or never runs.', 'Fix the update clause or the condition.'],
  ['for 반복의 갱신 절은 카운터를 올바른 방향으로 움직여야 합니다', '조건은 카운터가 커지기를 기다리는데 갱신은 줄입니다(또는 반대). 반복이 끝나지 않거나 실행되지 않습니다.', '갱신 절이나 조건을 고치세요.'],
  { kinds: { For(n, cx) {
    const c = unparen(n.cond);
    if (!c || c.k !== 'Binary' || !['<', '<=', '>', '>='].includes(c.op) || n.step.length !== 1) return;
    const l = unparen(c.left);
    if (l.k !== 'Name') return;
    const st = unparen(n.step[0]);
    let dir = 0;
    if (st.k === 'Unary' && unparen(st.operand).k === 'Name' && unparen(st.operand).name === l.name) dir = st.op === '++' ? 1 : -1;
    if (st.k === 'Assign' && unparen(st.left).k === 'Name' && unparen(st.left).name === l.name) {
      const k = U.numVal(st.right);
      if (k != null && k > 0 && (st.op === '+=' || st.op === '-=')) dir = st.op === '+=' ? 1 : -1;
    }
    if (!dir) return;
    const wantUp = c.op === '<' || c.op === '<=';
    if ((wantUp && dir < 0) || (!wantUp && dir > 0)) cx.report(n.step[0], `'${l.name}' is ${dir > 0 ? 'incremented' : 'decremented'} and will never reach 'stop condition'.`, `'${l.name}'가 ${dir > 0 ? '증가' : '감소'}해 종료 조건에 도달하지 못합니다.`);
  } } });

R('for-counter-not-updated', 'S1994', 'S', 'CR', 20, ['confusing'],
  ['"for" loop increment clauses should modify the loops\' counters', 'The update clause changes a variable the condition does not test, which makes the loop hard to follow.', 'Update the counter tested by the condition in the update clause.'],
  ['for 반복의 증가 절은 반복 카운터를 바꿔야 합니다', '갱신 절이 조건에서 검사하지 않는 변수를 바꿔 반복을 이해하기 어렵습니다.', '조건에서 검사하는 카운터를 갱신 절에서 바꾸세요.'],
  { kinds: { For(n, cx) {
    if (!n.cond || !n.step.length) return;
    const condNames = U.identsIn(n.cond);
    const upd = updatedNames(n.step);
    if (!upd.size) return;
    for (const u of upd) if (condNames.has(u)) return;
    cx.report(n.step[0], `This loop's stop condition tests ${[...condNames].slice(0, 3).join(', ')} but the incrementer updates ${[...upd].join(', ')}.`, `반복 종료 조건은 ${[...condNames].slice(0, 3).join(', ')}를 검사하는데 증가 절은 ${[...upd].join(', ')}를 바꿉니다.`);
  } } });

R('loop-counter-modified', 'S127', 'S', 'MA', 20, ['pitfall'],
  ['"for" loop stop conditions should be invariant', 'Changing the loop counter inside the body makes the number of iterations hard to predict.', 'Use a while loop, or do not assign the counter in the body.'],
  ['for 반복의 종료 조건은 변하지 않아야 합니다', '본문에서 반복 카운터를 바꾸면 반복 횟수를 예측하기 어렵습니다.', 'while 반복을 쓰거나 본문에서 카운터를 대입하지 마세요.'],
  { kinds: { For(n, cx) {
    const vars = forVars(n);
    const upd = updatedNames(n.step);
    const counters = [...vars].filter((v) => upd.has(v));
    if (!counters.length) return;
    const visit = (x) => {
      if (x.k === 'Lambda' || x.k === 'LocalFunc') return;
      if (x.k === 'Assign' && unparen(x.left).k === 'Name' && counters.includes(unparen(x.left).name)) { cx.report(x, `Do not update the loop counter '${unparen(x.left).name}' within the loop body.`, `반복 본문 안에서 반복 카운터 '${unparen(x.left).name}'를 바꾸지 마세요.`); return; }
      if (x.k === 'Unary' && (x.op === '++' || x.op === '--') && unparen(x.operand).k === 'Name' && counters.includes(unparen(x.operand).name)) { cx.report(x, `Do not update the loop counter '${unparen(x.operand).name}' within the loop body.`, `반복 본문 안에서 반복 카운터 '${unparen(x.operand).name}'를 바꾸지 마세요.`); return; }
      forEachChild(x, visit);
    };
    visit(n.body);
  } } });

// ─── collection size checks
R('collection-size-check', 'S3981', 'B', 'MA', 2, ['suspicious'],
  ['Collection sizes and array length comparisons should make sense', 'Count and Length are never negative, so `x.Count >= 0` is always true and `x.Length < 0` always false.', 'Compare with > 0 or == 0 as intended.'],
  ['컬렉션 크기와 배열 길이 비교는 말이 되어야 합니다', 'Count와 Length는 음수가 될 수 없어 `x.Count >= 0`은 항상 참, `x.Length < 0`은 항상 거짓입니다.', '의도에 맞게 > 0이나 == 0과 비교하세요.'],
  { kinds: { Binary(n, cx) {
    const isSize = (e) => { e = unparen(e); return e && ((e.k === 'Member' && (e.name === 'Count' || e.name === 'Length' || e.name === 'LongLength')) || (e.k === 'Invocation' && (callName(e) === 'Count' || callName(e) === 'LongCount') && callTarget(e))); };
    const zero = (e) => U.numVal(e) === 0;
    let always = null;
    if (isSize(n.left) && zero(n.right)) { if (n.op === '>=') always = 'true'; if (n.op === '<') always = 'false'; }
    if (zero(n.left) && isSize(n.right)) { if (n.op === '<=') always = 'true'; if (n.op === '>') always = 'false'; }
    if (always) cx.report(n, `The size is never negative: this comparison is always ${always}.`, `크기는 음수가 될 수 없어 이 비교는 항상 ${always === 'true' ? '참' : '거짓'}입니다.`);
  } } });

R('indexof-positive', 'S2692', 'B', 'CR', 2, ['suspicious'],
  ['"IndexOf" checks should not be for positive numbers', 'IndexOf returns 0 when the match is at the start; `> 0` misses it.', 'Compare with >= 0, or use Contains / StartsWith.'],
  ['"IndexOf" 검사는 양수로 하면 안 됩니다', 'IndexOf는 맨 앞에서 찾으면 0을 돌려주므로 `> 0`은 그 경우를 놓칩니다.', '>= 0과 비교하거나 Contains / StartsWith를 쓰세요.'],
  { kinds: { Binary(n, cx) {
    if (n.op !== '>') return;
    const l = unparen(n.left);
    if (l.k === 'Invocation' && callName(l) === 'IndexOf' && callTarget(l) && U.numVal(n.right) === 0) cx.report(n, `0 is a valid index, but this check ignores it.`, '0도 올바른 인덱스인데 이 검사는 그것을 무시합니다.');
  } } });

R('new-guid', 'S4581', 'B', 'MA', 1, ['pitfall'],
  ['"new Guid()" should not be used', '`new Guid()` is Guid.Empty, not a new unique identifier.', 'Use Guid.NewGuid() for a new value or Guid.Empty for the empty one.'],
  ['"new Guid()"를 쓰면 안 됩니다', '`new Guid()`는 새 고유 식별자가 아니라 Guid.Empty입니다.', '새 값에는 Guid.NewGuid(), 빈 값에는 Guid.Empty를 쓰세요.'],
  { kinds: { New(n, cx) {
    if (n.type && n.type.name === 'Guid' && n.args.length === 0 && !n.init) cx.report(n, 'Use Guid.NewGuid() or Guid.Empty, or add arguments to this Guid instantiation.', 'Guid.NewGuid()나 Guid.Empty를 쓰거나 이 Guid 생성에 인수를 넣으세요.');
  } } });

// ─── composite format strings
const FORMAT_CALLS = { Format: 0, AppendFormat: 0, WriteLine: 0, Write: 0, TryFormat: -1 };
function formatInfo(inv) {
  const name = callName(inv);
  if (!(name in FORMAT_CALLS) || name === 'TryFormat') return null;
  const t = callTarget(inv);
  const td = t ? dotted(t) : null;
  if (name === 'Format' && td !== 'string' && td !== 'String') return null;
  if ((name === 'WriteLine' || name === 'Write') && !(td === 'Console' || /Writer$/i.test(td || '') || /writer$/i.test(td || ''))) return null;
  let i = 0;
  const args = inv.args;
  if (args.length && U.strVal(args[0].expr) == null && args.length > 1 && U.strVal(args[1].expr) != null && (name === 'Format' || name === 'AppendFormat')) i = 1;
  const fmt = args[i] ? U.strVal(args[i].expr) : null;
  if (fmt == null || args[i].name) return null;
  const rest = args.slice(i + 1);
  if ((name === 'WriteLine' || name === 'Write') && rest.length === 0) return null;
  return { fmt, rest, fmtNode: args[i].expr, name };
}
function parseFormat(fmt) {
  const idx = [];
  for (let i = 0; i < fmt.length; i++) {
    const c = fmt[i];
    if (c === '{') {
      if (fmt[i + 1] === '{') { i++; continue; }
      const j = fmt.indexOf('}', i);
      if (j < 0) return { error: 'unclosed' };
      const body = fmt.slice(i + 1, j);
      const m = /^\s*(\d+)\s*(,\s*-?\d+\s*)?(:[^{}]*)?$/.exec(body);
      if (!m) return { error: 'invalid' };
      idx.push(Number(m[1]));
      i = j;
      continue;
    }
    if (c === '}') {
      if (fmt[i + 1] === '}') { i++; continue; }
      return { error: 'unopened' };
    }
  }
  return { idx };
}
R('format-string-invalid', 'S2275', 'B', 'BL', 10, ['pitfall'],
  ['Composite format strings should not lead to unexpected behavior at runtime', 'A malformed format item or an index beyond the arguments throws FormatException.', 'Fix the format items so each index refers to an argument.'],
  ['복합 서식 문자열이 실행 중 예상 못 한 동작을 하면 안 됩니다', '형식이 틀린 서식 항목이나 인수 개수를 넘는 인덱스는 FormatException을 던집니다.', '각 인덱스가 인수를 가리키도록 서식 항목을 고치세요.'],
  { kinds: { Invocation(n, cx) {
    const f = formatInfo(n);
    if (!f) return;
    if (f.rest.length === 1 && isArrayish(f.rest[0].expr, cx)) return;
    const p = parseFormat(f.fmt);
    if (p.error) { cx.report(f.fmtNode, 'Invalid format string: braces are not balanced or a format item is malformed.', '서식 문자열이 잘못되었습니다. 중괄호가 맞지 않거나 서식 항목 형식이 틀렸습니다.'); return; }
    const max = p.idx.length ? Math.max(...p.idx) : -1;
    if (max >= f.rest.length) cx.report(f.fmtNode, `Invalid format string: format item index ${max} is out of range; only ${f.rest.length} argument(s) are passed.`, `서식 문자열 오류: 서식 항목 인덱스 ${max}가 범위를 벗어납니다. 인수는 ${f.rest.length}개뿐입니다.`);
  } } });
R('format-args-unused', 'S3457', 'S', 'MA', 10, ['confusing'],
  ['Composite format strings should be used correctly', 'Arguments that no format item refers to are silently ignored.', 'Reference every argument, or remove the extra ones.'],
  ['복합 서식 문자열은 올바르게 써야 합니다', '어떤 서식 항목도 가리키지 않는 인수는 조용히 무시됩니다.', '모든 인수를 참조하거나 남는 인수를 지우세요.'],
  { kinds: { Invocation(n, cx) {
    const f = formatInfo(n);
    if (!f || !f.rest.length) return;
    if (f.rest.length === 1 && isArrayish(f.rest[0].expr, cx)) return;
    const p = parseFormat(f.fmt);
    if (p.error) return;
    if (!p.idx.length) { cx.report(f.fmtNode, 'Remove the arguments: this format string has no format items.', '인수를 지우세요. 이 서식 문자열에는 서식 항목이 없습니다.'); return; }
    const used = new Set(p.idx);
    const unused = [];
    for (let i = 0; i < f.rest.length; i++) if (!used.has(i)) unused.push(i + 1);
    if (unused.length) cx.report(f.fmtNode, `The format string does not use argument(s) ${unused.join(', ')}.`, `서식 문자열이 ${unused.join(', ')}번째 인수를 쓰지 않습니다.`);
  } } });
function isArrayish(e, cx) {
  e = unparen(e);
  if (e.k === 'ArrayNew' || e.k === 'Collection') return true;
  const t = T.typeOf(e, cx.project);
  if (t && t.ranks) return true;
  if (!t && e.k === 'Name') return true;
  if (!t && (e.k === 'Invocation' || e.k === 'Member')) return true;
  return false;
}

// ─── equality / hash code
function overrides(td, name, argc) {
  return td.members.find((m) => m.k === 'Method' && m.name === name && hasMod(m, 'override') && m.params.length === argc) || null;
}
R('reference-equals-value-type', 'S2995', 'B', 'MA', 5, ['pitfall'],
  ['"Object.ReferenceEquals" should not be used for value types', 'Value types are boxed into new objects, so ReferenceEquals is always false.', 'Use Equals or ==.'],
  ['값 타입에 "Object.ReferenceEquals"를 쓰면 안 됩니다', '값 타입은 새 객체로 박싱되어 ReferenceEquals가 항상 거짓입니다.', 'Equals나 ==를 쓰세요.'],
  { kinds: { Invocation(n, cx) {
    if (callName(n) !== 'ReferenceEquals' || n.args.length !== 2) return;
    for (const a of n.args) {
      const t = T.typeOf(a.expr, cx.project);
      if (t && !t.nullable && !t.ranks && T.isValueTypeName(t.name, cx.project)) { cx.report(n, `'ReferenceEquals' always returns false for value type '${t.name}'.`, `값 타입 '${t.name}'에서는 'ReferenceEquals'가 항상 거짓입니다.`); return; }
    }
  } } });
R('tostring-returns-null', 'S2225', 'B', 'MA', 5, ['pitfall', 'cwe-476'],
  ['"ToString()" method should not return null', 'Callers expect a string from ToString(); null breaks string formatting and concatenation logic.', 'Return string.Empty or a meaningful text.'],
  ['"ToString()" 메서드는 null을 반환하면 안 됩니다', '호출자는 ToString()에서 문자열을 기대합니다. null은 서식과 연결 로직을 깨뜨립니다.', 'string.Empty나 의미 있는 텍스트를 반환하세요.'],
  { kinds: { Method(n, cx) {
    if (n.name !== 'ToString' || n.params.length || !hasMod(n, 'override')) return;
    const body = n.exprBody ? [n.exprBody] : [];
    const visit = (x) => {
      if (x.k === 'Lambda' || x.k === 'LocalFunc') return;
      if (x.k === 'Return' && x.expr && U.unparen(x.expr).k === 'Literal' && U.unparen(x.expr).kind === 'null') cx.report(x, 'Return an empty string instead of null.', 'null 대신 빈 문자열을 반환하세요.');
      forEachChild(x, visit);
    };
    if (n.body) visit(n.body);
    for (const e of body) if (unparen(e).k === 'Literal' && unparen(e).kind === 'null') cx.report(e, 'Return an empty string instead of null.', 'null 대신 빈 문자열을 반환하세요.');
  } } });
R('hashcode-mutable-field', 'S2328', 'B', 'MA', 15, ['pitfall'],
  ['"GetHashCode" should not reference mutable fields', 'When a field used by GetHashCode changes, the object is lost inside hash sets and dictionaries.', 'Use only readonly fields (or immutable data) in GetHashCode.'],
  ['"GetHashCode"는 변경 가능한 필드를 참조하면 안 됩니다', 'GetHashCode에 쓰는 필드가 바뀌면 해시 집합과 사전에서 객체를 찾을 수 없습니다.', 'GetHashCode에는 readonly 필드(불변 데이터)만 쓰세요.'],
  { kinds: { Method(n, cx) {
    if (n.name !== 'GetHashCode' || n.params.length || !hasMod(n, 'override')) return;
    const td = n.owner;
    if (!td || td.kind === 'struct' || td.kind === 'record struct') return;
    const reported = new Set();
    const visit = (x) => {
      if (x.k === 'Name' && x.msym && x.msym.length === 1 && x.msym[0].kind === 'field' && x.msym[0].info === td.typeInfo) {
        const f = x.msym[0].node;
        if (!f.mods.has('readonly') && !f.mods.has('const') && !reported.has(x.name)) { reported.add(x.name); cx.report(x, `Remove this use of '${x.name}' from the 'GetHashCode' declaration, or make it readonly.`, `'GetHashCode' 선언에서 '${x.name}' 사용을 지우거나 readonly로 만드세요.`); }
      }
      forEachChild(x, visit);
    };
    visit(n.body || n.exprBody || { k: 'Empty' });
  } } });
R('equals-without-hashcode', 'S1206', 'S', 'MI', 15, ['pitfall'],
  ['"Equals(Object)" and "GetHashCode()" should be overridden in pairs', 'Equal objects must have equal hash codes, otherwise dictionaries and hash sets misbehave.', 'Override both methods consistently.'],
  ['"Equals(Object)"와 "GetHashCode()"는 짝으로 재정의해야 합니다', '같은 객체는 해시 코드도 같아야 합니다. 아니면 사전과 해시 집합이 잘못 동작합니다.', '두 메서드를 일관되게 함께 재정의하세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (n.kind !== 'class' && n.kind !== 'struct') return;
    const eq = overrides(n, 'Equals', 1); const hc = overrides(n, 'GetHashCode', 0);
    if (eq && !hc && !(n.typeInfo && n.typeInfo.decls.length > 1)) cx.report(n, `This type overrides 'Equals' but not 'GetHashCode'.`, `이 타입은 'Equals'만 재정의하고 'GetHashCode'는 재정의하지 않습니다.`, { atName: true });
    if (hc && !eq && !(n.typeInfo && n.typeInfo.decls.length > 1)) cx.report(n, `This type overrides 'GetHashCode' but not 'Equals'.`, `이 타입은 'GetHashCode'만 재정의하고 'Equals'는 재정의하지 않습니다.`, { atName: true });
  } } });
R('base-object-equals', 'S3249', 'B', 'MA', 5, ['pitfall'],
  ['Classes directly extending "object" should not call "base" in "GetHashCode" or "Equals"', 'object.Equals compares references and object.GetHashCode hashes the reference, which defeats a value-based override.', 'Compute equality and hash codes from the fields.'],
  ['"object"를 직접 상속한 클래스는 "GetHashCode"나 "Equals"에서 "base"를 호출하면 안 됩니다', 'object.Equals는 참조를 비교하고 object.GetHashCode는 참조로 해시하므로 값 기반 재정의를 무의미하게 만듭니다.', '필드로 동등성과 해시 코드를 계산하세요.'],
  { kinds: { Invocation(n, cx) {
    const c = unparen(n.expr);
    if (c.k !== 'Member' || c.expr.k !== 'Base' || (c.name !== 'Equals' && c.name !== 'GetHashCode')) return;
    const m = enclosing(n, ['Method']);
    if (!m || m.name !== c.name || !hasMod(m, 'override')) return;
    const td = m.owner;
    if (!td || td.kind !== 'class') return;
    const info = td.typeInfo;
    const hasClassBase = info && (info.baseInfo || info.externalBases.some((b) => !/^I[A-Z]/.test(b)));
    if (hasClassBase) return;
    cx.report(n, `Remove this 'base.${c.name}()' call; it uses reference semantics of 'object'.`, `이 'base.${c.name}()' 호출을 지우세요. 'object'의 참조 의미를 씁니다.`);
  } } });

// ─── threading
R('thread-static-instance', 'S3005', 'B', 'MA', 2, ['multi-threading'],
  ['"ThreadStatic" should not be used on non-static fields', '[ThreadStatic] is ignored on instance fields, so the field is silently shared per instance.', 'Make the field static, or remove the attribute.'],
  ['"ThreadStatic"은 static이 아닌 필드에 쓰면 안 됩니다', '[ThreadStatic]은 인스턴스 필드에서 무시되어 필드가 인스턴스마다 조용히 공유됩니다.', '필드를 static으로 만들거나 특성을 지우세요.'],
  { kinds: { Field(n, cx) {
    if (attrNamed(n.attrs, ['ThreadStatic']) && !n.mods.has('static')) cx.report(n.vars[0] || n, `Remove the 'ThreadStatic' attribute from this instance field, or make it static.`, `이 인스턴스 필드에서 'ThreadStatic' 특성을 지우거나 static으로 만드세요.`);
  } } });
R('thread-static-initialized', 'S2996', 'B', 'MA', 5, ['multi-threading'],
  ['"ThreadStatic" fields should not be initialized', 'The initializer runs once on the thread that runs the static constructor; every other thread sees the default value.', 'Initialize lazily on first use in each thread, or use ThreadLocal<T>.'],
  ['"ThreadStatic" 필드는 초기화하면 안 됩니다', '초기화식은 정적 생성자를 실행한 스레드에서 한 번만 실행되고 다른 스레드는 기본값을 봅니다.', '각 스레드에서 처음 쓸 때 지연 초기화하거나 ThreadLocal<T>을 쓰세요.'],
  { kinds: { Field(n, cx) {
    if (attrNamed(n.attrs, ['ThreadStatic']) && n.mods.has('static') && n.vars.some((v) => v.init)) cx.report(n.vars.find((v) => v.init), `Remove this initialization of the [ThreadStatic] field '${n.vars[0].name}'.`, `[ThreadStatic] 필드 '${n.vars[0].name}'의 초기화를 지우세요.`);
  } } });
R('anonymous-unsubscribe', 'S3244', 'B', 'MA', 10, ['pitfall'],
  ['Anonymous delegates should not be used to unsubscribe from Events', 'Each lambda is a new delegate instance, so `-= (s, e) => ...` removes nothing.', 'Store the handler in a variable or use a named method, and unsubscribe with it.'],
  ['익명 대리자로 이벤트 구독을 해지하면 안 됩니다', '람다는 매번 새 대리자 인스턴스라 `-= (s, e) => ...`는 아무것도 지우지 않습니다.', '처리기를 변수나 이름 있는 메서드에 두고 그것으로 해지하세요.'],
  { kinds: { Assign(n, cx) {
    if (n.op === '-=' && unparen(n.right).k === 'Lambda') cx.report(n, 'Unsubscribe with a delegate stored in a variable, not with an anonymous delegate.', '익명 대리자가 아니라 변수에 둔 대리자로 구독을 해지하세요.');
  } } });
R('static-init-order', 'S3263', 'B', 'MA', 5, ['pitfall'],
  ['Static fields should appear in the order they must be initialized', 'Static initializers run in textual order; reading a static field declared later gives its default value.', 'Move the referenced field above, or initialize in a static constructor.'],
  ['정적 필드는 초기화되어야 하는 순서대로 나와야 합니다', '정적 초기화식은 텍스트 순서로 실행되어 뒤에 선언된 정적 필드를 읽으면 기본값을 얻습니다.', '참조하는 필드를 위로 옮기거나 정적 생성자에서 초기화하세요.'],
  { kinds: { TypeDecl(n, cx) {
    const statics = [];
    for (const m of n.members) if (m.k === 'Field' && m.mods.has('static') && !m.isConst) for (const v of m.vars) statics.push({ v, m });
    const index = new Map(statics.map((s, i) => [s.v.name, i]));
    statics.forEach((s, i) => {
      if (!s.v.init) return;
      const visit = (x) => {
        if (x.k === 'Lambda' || x.k === 'LocalFunc' || x.k === 'Invocation' && unparen(x.expr).k === 'Name' && unparen(x.expr).name === 'nameof') return;
        if (x.k === 'Name' && !x.sym && index.has(x.name) && index.get(x.name) > i && x.msym && x.msym[0].info === n.typeInfo) {
          cx.report(x, `Move the declaration of '${x.name}' before this usage.`, `'${x.name}'의 선언을 이 사용보다 앞으로 옮기세요.`);
          return;
        }
        forEachChild(x, visit);
      };
      visit(s.v.init);
    });
  } } });
R('thread-suspend-resume', 'S3889', 'B', 'BL', 30, ['multi-threading'],
  ['"Thread.Resume" and "Thread.Suspend" should not be used', 'Suspending a thread at an arbitrary point can deadlock on locks it holds.', 'Use synchronization primitives such as ManualResetEvent or CancellationToken.'],
  ['"Thread.Resume"과 "Thread.Suspend"를 쓰면 안 됩니다', '임의의 지점에서 스레드를 멈추면 그 스레드가 잡은 잠금 때문에 교착될 수 있습니다.', 'ManualResetEvent나 CancellationToken 같은 동기화 도구를 쓰세요.'],
  { kinds: { Invocation(n, cx) {
    const name = callName(n);
    if (name !== 'Suspend' && name !== 'Resume') return;
    const t = callTarget(n);
    const tt = t ? T.typeOf(t, cx.project) : null;
    if ((tt && tt.name === 'Thread') || (t && dotted(t) === 'Thread.CurrentThread')) cx.report(n, `Refactor the code to remove this use of 'Thread.${name}'.`, `'Thread.${name}' 사용을 없애도록 코드를 고치세요.`);
  } } });
R('lock-non-readonly', 'S2445', 'B', 'MA', 15, ['multi-threading'],
  ['Blocks should be synchronized on read-only fields', 'If the locked field can be reassigned, two threads may lock different objects; a local or new object is never shared at all.', 'Lock on a private readonly object field.'],
  ['동기화 블록은 읽기 전용 필드에 걸어야 합니다', '잠그는 필드가 다시 대입되면 두 스레드가 다른 객체를 잠글 수 있고, 지역 변수나 새 객체는 아예 공유되지 않습니다.', 'private readonly 객체 필드에 잠금을 거세요.'],
  { kinds: { Lock(n, cx) {
    const e = unparen(n.expr);
    if (e.k === 'New') { cx.report(e, 'Do not lock on a new instance: it is not shared between threads.', '새 인스턴스에 잠금을 걸지 마세요. 스레드 사이에 공유되지 않습니다.'); return; }
    if (e.k === 'Name' && e.sym && (e.sym.kind === 'local') && !e.sym.captured && e.sym.init && unparen(e.sym.init).k === 'New') { cx.report(e, `Do not lock on local variable '${e.name}'; use a shared readonly field.`, `지역 변수 '${e.name}'에 잠금을 걸지 말고 공유 readonly 필드를 쓰세요.`); return; }
    const entry = (e.k === 'Name' && e.msym) || (e.k === 'Member' && e.expr.k === 'This' && e.msym) ? (e.msym.length === 1 ? e.msym[0] : null) : null;
    if (entry && entry.kind === 'field' && !entry.node.mods.has('readonly') && !entry.node.mods.has('const')) cx.report(e, `Do not lock on writable field '${e.name}'; use a readonly field instead.`, `쓰기 가능한 필드 '${e.name}'에 잠금을 걸지 말고 readonly 필드를 쓰세요.`);
  } } });
R('lock-weak-identity', 'S3998', 'B', 'CR', 15, ['multi-threading', 'cwe-412'],
  ['Threads should not lock on objects with weak identity', 'Strings (interned), Type objects and `this` are reachable from other code, which may lock on them too and deadlock.', 'Lock on a private readonly object.'],
  ['약한 정체성을 가진 객체에 잠금을 걸면 안 됩니다', '문자열(인턴), Type 객체, `this`는 다른 코드에서도 닿을 수 있어 같이 잠그면 교착됩니다.', 'private readonly 객체에 잠금을 거세요.'],
  { kinds: { Lock(n, cx) {
    const e = unparen(n.expr);
    let what = null;
    if (e.k === 'This') what = 'this';
    else if (e.k === 'Typeof') what = 'a Type';
    else if (e.k === 'Literal' && e.kind === 'string') what = 'a string';
    else if (e.k === 'Invocation' && callName(e) === 'GetType') what = 'a Type';
    else if (e.k === 'Invocation' && callName(e) === 'nameof') what = 'a string';
    else {
      const t = T.typeOf(e, cx.project);
      if (t && (t.name === 'string' || t.name === 'Type' || t.name === 'Thread' || t.name === 'MarshalByRefObject' || t.name === 'ParameterInfo' || t.name === 'MemberInfo' || t.name === 'ExecutionEngineException' || t.name === 'OutOfMemoryException' || t.name === 'StackOverflowException')) what = `a ${t.name}`;
    }
    if (what) cx.report(e, `Lock on a dedicated object instance instead of ${what}.`, `${what === 'this' ? 'this' : what.replace(/^an? /, '')} 대신 전용 객체 인스턴스에 잠금을 거세요.`);
  } } });

// ─── enums
R('flags-enum-uninitialized', 'S2345', 'B', 'MA', 5, ['pitfall'],
  ['Flags enumerations should explicitly initialize all their members', 'Implicit values 0, 1, 2, 3 overlap as bit flags: 3 is 1 | 2.', 'Give every member an explicit power-of-two value.'],
  ['Flags 열거형은 모든 멤버를 명시적으로 초기화해야 합니다', '암시적 값 0, 1, 2, 3은 비트 플래그로 겹칩니다. 3은 1 | 2입니다.', '모든 멤버에 2의 거듭제곱 값을 명시하세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (n.kind !== 'enum' || !attrNamed(n.attrs, ['Flags'])) return;
    const missing = n.members.filter((m) => m.k === 'EnumMember' && !m.value);
    if (missing.length && n.members.length > 2) cx.report(missing[0], `Initialize all the members of this 'Flags' enumeration.`, `이 'Flags' 열거형의 모든 멤버를 초기화하세요.`);
  } } });
R('flags-zero-none', 'S2346', 'S', 'CR', 5, ['convention'],
  ['Flags enumerations zero-value members should be named "None"', 'The zero value of a flags enum means "no flags"; naming it otherwise misleads `HasFlag` users.', 'Name the zero member None.'],
  ['Flags 열거형의 0 값 멤버 이름은 "None"이어야 합니다', 'Flags 열거형의 0은 "플래그 없음"이라 다른 이름은 HasFlag 사용자를 오해하게 합니다.', '0 멤버 이름을 None으로 하세요.'],
  { kinds: { EnumMember(n, cx) {
    const td = n.owner;
    if (!td || !attrNamed(td.attrs, ['Flags'])) return;
    if (n.value && U.numVal(n.value) === 0 && n.name !== 'None') cx.report(n, `Rename '${n.name}' to 'None'.`, `'${n.name}'의 이름을 'None'으로 바꾸세요.`);
  } } });
R('non-flags-bitwise', 'S4070', 'S', 'MI', 5, ['convention'],
  ['Non-flags enums should not be marked with "FlagsAttribute"', 'Combining members of an enum without [Flags] with | or & produces values that no member represents.', 'Add [Flags] with power-of-two values, or do not combine the members.'],
  ['Flags가 아닌 열거형을 비트 연산으로 조합하면 안 됩니다', '[Flags]가 없는 열거형 멤버를 | 나 &로 조합하면 어떤 멤버도 나타내지 않는 값이 됩니다.', '2의 거듭제곱 값과 함께 [Flags]를 붙이거나 멤버를 조합하지 마세요.'],
  { kinds: { Binary(n, cx) {
    if (n.op !== '|') return;
    const enumOf = (e) => {
      e = unparen(e);
      if (e.k !== 'Member' || e.expr.k !== 'Name') return null;
      const arr = cx.project.typesByName.get(e.expr.name);
      if (!arr || arr.length !== 1 || arr[0].kind !== 'enum') return null;
      return arr[0];
    };
    const a = enumOf(n.left); const b = enumOf(n.right);
    if (a && a === b && !a.decls.some((d) => attrNamed(d.attrs, ['Flags']))) cx.report(n, `'${a.name}' is not a flags enum; combining its members with '|' is suspicious.`, `'${a.name}'은 Flags 열거형이 아니라 '|'로 멤버를 조합하는 것은 의심스럽습니다.`);
  } } });

// ─── WinForms entry point
R('stathread-missing', 'S4210', 'B', 'MA', 5, ['winforms'],
  ['Windows Forms entry points should be marked with STAThread', 'Without [STAThread] COM components used by Windows Forms (clipboard, dialogs, drag and drop) fail.', 'Mark Main with [STAThread].'],
  ['Windows Forms 진입점에는 STAThread를 붙여야 합니다', '[STAThread]가 없으면 Windows Forms가 쓰는 COM 구성 요소(클립보드, 대화 상자, 끌어서 놓기)가 실패합니다.', 'Main에 [STAThread]를 붙이세요.'],
  { kinds: { Method(n, cx) {
    if (n.name !== 'Main' || !hasMod(n, 'static') || attrNamed(n.attrs, ['STAThread', 'MTAThread'])) return;
    let runs = false;
    const visit = (x) => { if (runs) return; if (x.k === 'Invocation' && callName(x) === 'Run' && dotted(callTarget(x) || {}) === 'Application') runs = true; forEachChild(x, visit); };
    if (n.body) visit(n.body);
    if (runs && !cx.src.includes('System.Windows.Application')) cx.report(n, `Add the 'STAThread' attribute to this entry point.`, `이 진입점에 'STAThread' 특성을 붙이세요.`, { atName: true });
  } } });

// ─── async
R('task-returns-null', 'S4586', 'B', 'CR', 5, ['async', 'cwe-476'],
  ['Non-async "Task/Task<T>" methods should not return null', 'Awaiting a null Task throws NullReferenceException.', 'Return Task.CompletedTask or Task.FromResult(...).'],
  ['async가 아닌 "Task/Task<T>" 메서드는 null을 반환하면 안 됩니다', 'null Task를 await하면 NullReferenceException이 납니다.', 'Task.CompletedTask나 Task.FromResult(...)를 반환하세요.'],
  { kinds: { Method(n, cx) {
    if (hasMod(n, 'async') || !n.retType || n.retType.name !== 'Task' || n.retType.nullable) return;
    const visit = (x) => {
      if (x.k === 'Lambda' || x.k === 'LocalFunc') return;
      if (x.k === 'Return' && x.expr && U.unparen(x.expr).k === 'Literal' && U.unparen(x.expr).kind === 'null') cx.report(x, 'Do not return null from this method; return a completed Task instead.', '이 메서드에서 null을 반환하지 말고 완료된 Task를 반환하세요.');
      forEachChild(x, visit);
    };
    if (n.body) visit(n.body);
    if (n.exprBody && U.unparen(n.exprBody).k === 'Literal' && U.unparen(n.exprBody).kind === 'null') cx.report(n.exprBody, 'Do not return null from this method; return a completed Task instead.', '이 메서드에서 null을 반환하지 말고 완료된 Task를 반환하세요.');
  } } });
R('async-void', 'S3168', 'B', 'MA', 15, ['async', 'multi-threading'],
  ['"async" methods should not return "void"', 'Exceptions thrown from an async void method crash the process and callers cannot await it.', 'Return Task; keep async void only for event handlers.'],
  ['"async" 메서드는 "void"를 반환하면 안 됩니다', 'async void 메서드에서 던진 예외는 프로세스를 죽이고 호출자는 기다릴 수 없습니다.', 'Task를 반환하세요. async void는 이벤트 처리기에만 쓰세요.'],
  { kinds: { Method(n, cx) {
    if (!hasMod(n, 'async') || !n.retType || n.retType.name !== 'void') return;
    if (U.isEventHandler(n) || hasMod(n, 'override') || n.iface) return;
    if (n.params.length === 2 && n.params[1].type && /Args$/.test(n.params[1].type.name)) return;
    if (/^On[A-Z]/.test(n.name) && n.owner && n.owner.typeInfo && n.owner.typeInfo.hasExternalBase()) return;
    cx.report(n, `Return 'Task' instead of 'void' from async method '${n.name}'.`, `async 메서드 '${n.name}'는 'void' 대신 'Task'를 반환하세요.`, { atName: true });
  } } });
R('blocking-async-call', 'S4462', 'B', 'BL', 10, ['async', 'multi-threading'],
  ['Calls to "async" methods should not be blocking', '.Result, .Wait() and GetAwaiter().GetResult() block the thread and can deadlock on a synchronization context.', 'await the task instead.'],
  ['"async" 메서드 호출을 블로킹하면 안 됩니다', '.Result, .Wait(), GetAwaiter().GetResult()는 스레드를 막고 동기화 컨텍스트에서 교착될 수 있습니다.', '대신 작업을 await하세요.'],
  { kinds: {
    Member(n, cx) {
      if (n.name !== 'Result' || isInvocationCallee(n)) return;
      if (!isTaskExpr(n.expr, cx) || inMain(n)) return;
      cx.report(n, `Replace this use of 'Task.Result' with 'await'.`, `'Task.Result' 사용을 'await'로 바꾸세요.`);
    },
    Invocation(n, cx) {
      const name = callName(n);
      const t = callTarget(n);
      if (!t || inMain(n)) return;
      if (name === 'Wait' && n.args.length === 0 && isTaskExpr(t, cx)) cx.report(n, `Replace this use of 'Task.Wait' with 'await'.`, `'Task.Wait' 사용을 'await'로 바꾸세요.`);
      if (name === 'GetResult' && n.args.length === 0) {
        const tt = unparen(t);
        if (tt.k === 'Invocation' && callName(tt) === 'GetAwaiter' && callTarget(tt) && isTaskExpr(callTarget(tt), cx)) cx.report(n, `Replace this use of 'GetAwaiter().GetResult()' with 'await'.`, `'GetAwaiter().GetResult()' 사용을 'await'로 바꾸세요.`);
      }
    },
  } });
function isInvocationCallee(m) { return m.parent && m.parent.k === 'Invocation' && m.parent.expr === m; }
function inMain(n) { const m = enclosing(n, ['Method']); return !!m && m.name === 'Main'; }
function isTaskExpr(e, cx) {
  e = unparen(e);
  if (!e) return false;
  if (e.k === 'Invocation') {
    const name = callName(e);
    if (name && /Async$/.test(name)) return true;
    if (name === 'Run' && dotted(callTarget(e) || {}) === 'Task') return true;
    const ms = T.resolveCall(e, cx.project);
    if (ms && ms[0].node.retType && (ms[0].node.retType.name === 'Task' || ms[0].node.retType.name === 'ValueTask')) return true;
    return false;
  }
  const t = T.typeOf(e, cx.project);
  return !!t && (t.name === 'Task' || t.name === 'ValueTask') && !t.ranks;
}
R('valuetask-reused', 'S5034', 'B', 'MA', 10, ['async'],
  ['"ValueTask" should be consumed correctly', 'A ValueTask may be backed by a pooled object; awaiting it twice or reading .Result before completion is undefined behavior.', 'Await a ValueTask exactly once, or call AsTask() first.'],
  ['"ValueTask"는 올바르게 소비해야 합니다', 'ValueTask는 풀링된 객체를 쓸 수 있어 두 번 await하거나 완료 전에 .Result를 읽으면 정의되지 않은 동작입니다.', 'ValueTask는 정확히 한 번만 await하거나 먼저 AsTask()를 호출하세요.'],
  { kinds: { LocalDecl(n, cx) {
    for (const v of n.vars) {
      const s = v.sym;
      if (!s) continue;
      const t = T.symType(s, cx.project);
      if (!t || t.name !== 'ValueTask') continue;
      let count = 0;
      for (const r of s.refs) {
        const p = r.parent;
        if (p && (p.k === 'Await' || (p.k === 'Member' && (p.name === 'Result' || p.name === 'AsTask' || p.name === 'GetAwaiter')))) {
          count++;
          if (count === 2) cx.report(p, `Refactor this ValueTask usage to consume '${s.name}' only once.`, `ValueTask '${s.name}'를 한 번만 소비하도록 고치세요.`);
        }
      }
    }
  } } });

module.exports = { isTaskExpr, formatInfo, parseFormat };
