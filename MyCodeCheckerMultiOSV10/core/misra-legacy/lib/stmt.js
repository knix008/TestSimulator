'use strict';

// Statement, expression and declaration checks shared by MISRA C:2004 and
// MISRA C++:2008.

const U = require('./util');
const UT = require('./underlying');

const { cf, T, M } = U;
const LOOPS = ['WhileStmt', 'DoStmt', 'ForStmt'];

const canon = (t) => (t ? T.canonical(t) : null);
const isFloatT = (t) => { const c = canon(t && T.nonRef(t)); return !!c && c.kind === 'float'; };
const isPtrT = (t) => { const c = canon(t && T.nonRef(t)); return !!c && (c.kind === 'pointer' || c.kind === 'array'); };
const isBoolT = (t) => { const c = canon(t && T.nonRef(t)); return !!c && c.kind === 'int' && c.name === 'bool'; };

// ------------------------------------------------------------------ bodies / switches

function bodyCompound(unit, api, mode) {
  const loops = mode !== 'if';
  const withIf = mode !== 'loops';
  const say = (s, what) => api.report(s, M(`The body of this ${what} is not a compound statement.`, `이 ${what} 문의 본문이 복합 문이 아닙니다.`));
  if (loops) for (const s of U.get(unit, 'WhileStmt', 'DoStmt', 'ForStmt', 'SwitchStmt', 'RangeForStmt')) {
    if (s.body && s.body.type !== 'CompoundStmt') say(s.body, s.type.replace('Stmt', '').replace('Range', '').toLowerCase());
  }
  if (!withIf) return;
  for (const s of U.get(unit, 'IfStmt')) {
    if (s.then && s.then.type !== 'CompoundStmt') say(s.then, 'if');
    if (s.else && s.else.type !== 'CompoundStmt' && s.else.type !== 'IfStmt') api.report(s.else, M("'else' is not followed by a compound statement or 'if'.", "'else' 뒤에 복합 문이나 'if'가 오지 않습니다."));
  }
}

function defaultLast(unit, api) {
  for (const sw of U.get(unit, 'SwitchStmt')) {
    const cls = cf.switchClauses(sw).clauses;
    if (!cls.length) continue;
    const last = cls[cls.length - 1];
    const hasDefault = (c) => c.labels.some((l) => l.type === 'DefaultStmt');
    if (!hasDefault(last)) api.report(sw, M('The final clause of this switch is not the default clause.', '이 switch의 마지막 절이 default 절이 아닙니다.'));
  }
}

function switchHasCase(unit, api) {
  for (const sw of U.get(unit, 'SwitchStmt')) {
    const cls = cf.switchClauses(sw).clauses;
    if (!cls.some((c) => c.labels.some((l) => l.type === 'CaseStmt'))) api.report(sw, M('This switch statement has no case clause.', '이 switch 문에 case 절이 없습니다.'));
  }
}

function switchBool(unit, api) {
  for (const sw of U.get(unit, 'SwitchStmt')) {
    if (!sw.cond || sw.cond.type === 'Declaration') continue;
    const u = UT.ut(unit, sw.cond);
    if (u.kind === 'bool' || isBoolT(sw.cond.ctype)) api.report(sw.cond, M('The switch condition is Boolean.', 'switch 조건이 부울입니다.'));
  }
}

// Every non-empty switch clause ends with an unconditional break (or throw).
function clauseEnds(unit, api, allowThrow) {
  for (const sw of U.get(unit, 'SwitchStmt')) {
    const cls = cf.switchClauses(sw).clauses;
    cls.forEach((c, i) => {
      if (!c.body.length) return;
      let last = c.body[c.body.length - 1];
      while (last && last.type === 'CompoundStmt' && last.body.length) last = last.body[last.body.length - 1];
      const ok = last && (last.type === 'BreakStmt' || (allowThrow && last.type === 'ExprStmt' && U.strip(last.expr) && U.strip(last.expr).type === 'ThrowExpr'));
      if (!ok && !(i === cls.length - 1 && false)) api.report(c.node, M('This switch clause does not end with an unconditional break.', '이 switch 절이 무조건 break로 끝나지 않습니다.'));
    });
  }
}

// ------------------------------------------------------------------ loops / jumps

function continueUsed(unit, api, wellFormedForOk) {
  for (const c of U.get(unit, 'ContinueStmt')) {
    if (wellFormedForOk) {
      const loop = cf.enclosing(c, LOOPS);
      if (loop && loop.type === 'ForStmt' && forCounter(loop).ok) continue;
    }
    api.report(c, M("The 'continue' statement is used.", "'continue' 문을 사용했습니다."));
  }
}

// loops with more than one break / goto that leaves them
function multipleExits(unit, api, countGoto) {
  for (const loop of U.get(unit, ...LOOPS, 'RangeForStmt')) {
    const exits = [];
    cf.walk(loop.body, (n) => {
      if (n !== loop.body && (LOOPS.includes(n.type) || n.type === 'RangeForStmt' || n.type === 'SwitchStmt')) {
        // breaks inside nested loops / switches leave those, gotos may still leave us
        if (countGoto) for (const g of cf.findAll(n, 'GotoStmt')) if (leaves(g, loop)) exits.push(g);
        return cf.walk.SKIP;
      }
      if (n.type === 'BreakStmt') exits.push(n);
      if (countGoto && n.type === 'GotoStmt' && leaves(n, loop)) exits.push(n);
      return undefined;
    });
    if (exits.length > 1) api.report(exits[1], M(`This loop has ${exits.length} break/goto statements that terminate it.`, `이 반복문을 끝내는 break/goto 문이 ${exits.length}개 있습니다.`));
  }
}
function leaves(g, loop) {
  const fn = cf.enclosing(g, 'FunctionDecl');
  if (!fn || !g.label) return false;
  const lbl = cf.findFirst(fn.body, (n) => n.type === 'LabelStmt' && n.label === g.label);
  if (!lbl) return false;
  return !cf.ancestors(lbl).includes(loop);
}

// Loop counter analysis of a for statement.
function forCounter(f) {
  const res = { ok: false, sym: null, counters: [] };
  const syms = new Set();
  const addW = (e) => {
    const x = U.strip(e);
    if (!x) return;
    if (x.type === 'AssignExpr' && U.strip(x.left).type === 'Identifier') syms.add(U.strip(x.left).symbol);
    if (x.type === 'UnaryExpr' && (x.op === '++' || x.op === '--') && U.strip(x.arg).type === 'Identifier') syms.add(U.strip(x.arg).symbol);
    if (x.type === 'BinaryExpr' && x.op === ',') { addW(x.left); addW(x.right); }
  };
  addW(f.inc);
  syms.delete(undefined); syms.delete(null);
  res.counters = [...syms];
  if (res.counters.length === 1) { res.sym = res.counters[0]; res.ok = true; }
  return res;
}

function writesTo(node, sym) {
  const hits = [];
  if (!node || !sym) return hits;
  cf.walk(node, (n) => {
    if (n.type === 'LambdaExpr') return cf.walk.SKIP;
    if (n.type === 'Identifier' && n.symbol === sym) {
      const w = U.P.writeKind(n);
      if (w === 'assign' || w === 'compound' || w === 'incdec') hits.push(n);
    }
    return undefined;
  });
  return hits;
}

function counterModifiedInBody(unit, api) {
  for (const f of U.get(unit, 'ForStmt')) {
    for (const sym of forCounter(f).counters) {
      for (const w of writesTo(f.body, sym)) api.report(w, M(`Loop counter '${sym.name}' is modified in the loop body.`, `반복 카운터 '${sym.name}'를 반복문 본문에서 변경했습니다.`));
      for (const w of writesTo(f.cond, sym)) api.report(w, M(`Loop counter '${sym.name}' is modified in the loop condition.`, `반복 카운터 '${sym.name}'를 반복 조건에서 변경했습니다.`));
    }
  }
}

function floatInFor(unit, api, condOnly) {
  for (const f of U.get(unit, 'ForStmt')) {
    for (const part of condOnly ? [f.cond] : [f.init, f.cond, f.inc]) {
      if (!part) continue;
      let hit = null;
      cf.walk(part, (n) => {
        if (hit) return cf.walk.STOP;
        if ((n.type === 'Identifier' && n.symbol && n.symbol.kind !== 'function' && isFloatT(n.ctype)) || (n.type === 'VarDecl' && isFloatT(n.ctype))) hit = n;
        return undefined;
      });
      if (hit) { api.report(hit, M(`'${hit.name}' of floating type is used to control the for loop.`, `부동소수점 형식인 '${hit.name}'를 for 반복 제어에 사용했습니다.`)); break; }
    }
  }
}

// ------------------------------------------------------------------ expressions

function floatEquality(unit, api) {
  for (const b of U.get(unit, 'BinaryExpr')) {
    if (b.op !== '==' && b.op !== '!=') continue;
    if (isFloatT(b.left && b.left.ctype) || isFloatT(b.right && b.right.ctype)) api.report(b, M(`Floating-point values are compared with '${b.op}'.`, `부동소수점 값을 '${b.op}'로 비교했습니다.`));
  }
  if (unit.lang === 'cpp') {
    // indirect: !(a < b) && !(a > b) style is rare; also flag <= && >= on the same operands
    for (const b of U.get(unit, 'BinaryExpr')) {
      if (b.op !== '&&') continue;
      const l = U.strip(b.left), r = U.strip(b.right);
      if (!l || !r || l.type !== 'BinaryExpr' || r.type !== 'BinaryExpr') continue;
      const pair = new Set([l.op, r.op]);
      if (pair.has('<=') && pair.has('>=') && isFloatT(l.left && l.left.ctype)
        && U.code(unit, l.left) === U.code(unit, r.left) && U.code(unit, l.right) === U.code(unit, r.right)) {
        api.report(b, M('Floating-point values are tested for equality indirectly.', '부동소수점 값의 같음을 간접적으로 검사했습니다.'));
      }
    }
  }
}

// ~ and << on unsigned char / unsigned short operands must be cast back immediately.
function shiftComplementCast(unit, api) {
  const intSize = (unit.target && unit.target.int) || 4;
  const check = (n, operand) => {
    const u = UT.ut(unit, operand);
    if (u.kind !== 'int' || u.signed || !u.size || u.size >= intSize) return;
    if (U.iceValue(unit, n) != null) return;
    const { p } = U.P.upParens(n);
    if (p && p.type === 'CastExpr' && p.typeName) {
      const t = UT.utOfType(unit, p.typeName.ctype);
      if (t.kind === 'int' && !t.signed && t.size === u.size) return;
    }
    api.report(n, M(`The result of '${n.op}' on a ${u.name} operand is not cast back to ${u.name} immediately.`, `${u.name} 피연산자에 대한 '${n.op}' 결과를 즉시 ${u.name}로 캐스트하지 않았습니다.`));
  };
  for (const n of U.get(unit, 'UnaryExpr')) if (n.op === '~') check(n, n.arg);
  for (const n of U.get(unit, 'BinaryExpr')) if (n.op === '<<') check(n, n.left);
}

const BIT_OPS = new Set(['&', '|', '^', '<<', '>>']);
const BIT_ASSIGN = new Set(['&=', '|=', '^=', '<<=', '>>=']);
function bitwiseSigned(unit, api) {
  const check = (n, operands, op) => {
    for (const o of operands) {
      const u = UT.ut(unit, o);
      if (u.kind === 'int' && u.signed) {
        api.report(n, M(`Bitwise operator '${op}' is applied to the signed operand '${U.code(unit, o)}'.`, `비트 연산자 '${op}'를 부호 있는 피연산자 '${U.code(unit, o)}'에 적용했습니다.`));
        return;
      }
    }
  };
  for (const b of U.get(unit, 'BinaryExpr')) if (BIT_OPS.has(b.op) && !isPtrT(b.left && b.left.ctype)) check(b, [b.left, b.right].filter((x, i) => !(i === 1 && (b.op === '<<' || b.op === '>>'))), b.op);
  for (const a of U.get(unit, 'AssignExpr')) if (BIT_ASSIGN.has(a.op)) check(a, a.op.length === 3 ? [a.left] : [a.left, a.right], a.op);
  for (const n of U.get(unit, 'UnaryExpr')) if (n.op === '~') check(n, [n.arg], '~');
}

function unaryMinusUnsigned(unit, api) {
  for (const n of U.get(unit, 'UnaryExpr')) {
    if (n.op !== '-') continue;
    const u = UT.ut(unit, n.arg);
    if (u.kind === 'int' && !u.signed) api.report(n, M(`Unary minus is applied to the unsigned expression '${U.code(unit, n.arg)}'.`, `부호 없는 식 '${U.code(unit, n.arg)}'에 단항 마이너스를 적용했습니다.`));
  }
}

// Access to the bit representation of floating-point objects through pointer casts or unions.
function floatBits(unit, api) {
  const scalarOf = (t) => { const c = canon(t); return c && c.kind === 'pointer' ? canon(c.to) : null; };
  for (const c of U.get(unit, 'CastExpr')) {
    if (!c.arg || !c.typeName) continue;
    const to = scalarOf(c.typeName.ctype);
    const from = scalarOf(T.decay(c.arg.ctype || T.T.unknown));
    if (!to || !from) continue;
    const fl = (x) => x.kind === 'float';
    const intish = (x) => x.kind === 'int';
    if ((fl(from) && intish(to)) || (intish(from) && fl(to))) api.report(c, M('The bit representation of a floating-point object is accessed through a pointer cast.', '포인터 캐스트로 부동소수점 객체의 비트 표현에 접근합니다.'));
  }
  for (const r of U.get(unit, 'RecordDecl')) {
    if (r.tag !== 'union' || !r.members) continue;
    const t = canon(r.ctype);
    const fs = (t && t.fields) || [];
    const hasF = fs.some((f) => isFloatT(f.type));
    const hasI = fs.some((f) => { const c = canon(f.type); return c && (c.kind === 'int' || (c.kind === 'array' && canon(c.of).kind === 'int')); });
    if (hasF && hasI) api.report(r, M('This union overlays a floating-point member with integer storage.', '이 공용체는 부동소수점 멤버와 정수 저장소를 겹칩니다.'));
  }
}

// Operands of && and || shall be primary (C) / postfix (C++) expressions.
const PRIMARY = new Set(['Identifier', 'IntegerLiteral', 'FloatingLiteral', 'CharLiteral', 'StringLiteral', 'BoolLiteral', 'ParenExpr', 'NullptrLiteral', 'ThisExpr']);
const POSTFIX = new Set([...PRIMARY, 'CallExpr', 'IndexExpr', 'MemberExpr', 'CastExpr']);
function logicalOperands(unit, api, postfix) {
  const ok = postfix ? POSTFIX : PRIMARY;
  for (const b of U.get(unit, 'BinaryExpr')) {
    if (b.op !== '&&' && b.op !== '||') continue;
    for (const o of [b.left, b.right]) {
      if (!o || ok.has(o.type)) continue;
      if (o.type === 'CastExpr' && !postfix) continue;
      if (o.type === 'BinaryExpr' && o.op === b.op) continue; // a && b && c
      if (o.type === 'UnaryExpr' && o.op === '!' && ok.has(o.arg && o.arg.type)) continue;
      if (postfix && o.type === 'UnaryExpr' && o.op === '!' ) continue;
      api.report(o, M(`Operand '${U.code(unit, o)}' of '${b.op}' is not parenthesised.`, `'${b.op}'의 피연산자 '${U.code(unit, o)}'가 괄호로 묶이지 않았습니다.`));
    }
  }
}

// side effects that matter
function hasEffect(unit, e) { return U.sideEffects(e, unit).length > 0; }

// expression statements without side effects
function noEffectStatements(unit, api) {
  for (const s of U.get(unit, 'ExprStmt')) {
    const e = U.strip(s.expr);
    if (!e || s.loc.macro) continue;
    if (e.type === 'CastExpr' && e.typeName && canon(e.typeName.ctype) && canon(e.typeName.ctype).kind === 'void') continue;
    if (['CallExpr', 'AssignExpr', 'ThrowExpr', 'DeleteExpr', 'NewExpr', 'StmtExpr', 'AsmStmt'].includes(e.type)) continue;
    if (unit.lang === 'cpp' && U.P.recordOf(e.ctype)) continue; // operator calls on class objects
    if (hasEffect(unit, e)) continue;
    api.report(s, M(`The statement '${U.code(unit, e)}' has no side effect.`, `문 '${U.code(unit, e)}'에 부수 효과가 없습니다.`));
  }
}

// ------------------------------------------------------------------ declarations

// enumerators: '=' only on the first, or on all
function enumInit(unit, api) {
  for (const e of U.get(unit, 'EnumDecl')) {
    const list = e.enumerators || [];
    if (list.length < 2) continue;
    const withInit = list.filter((x) => x.value);
    if (withInit.length === 0 || withInit.length === list.length) continue;
    if (withInit.length === 1 && list[0].value) continue;
    const bad = list.find((x, i) => i > 0 && x.value) || list.find((x) => !x.value);
    api.report(bad, M(`Enumeration '${e.name || '<anonymous>'}' initialises only some enumerators other than the first.`, `열거형 '${e.name || '<익명>'}'가 첫 번째 외의 일부 열거자만 초기화합니다.`));
  }
}

function blockScopeFunctions(unit, api) {
  for (const f of U.get(unit, 'FunctionDecl')) {
    if (f.body) continue;
    const scope = cf.enclosing(f, ['CompoundStmt', 'RecordDecl', 'TranslationUnit', 'NamespaceDecl', 'LinkageSpec']);
    if (scope && scope.type === 'CompoundStmt') api.report(f.nameLoc || f, M(`Function '${f.name}' is declared at block scope.`, `함수 '${f.name}'를 블록 범위에서 선언했습니다.`));
  }
}

function variadicFunctions(unit, api) {
  const seen = new Set();
  for (const f of U.get(unit, 'FunctionDecl')) {
    if (!f.variadic) continue;
    const k = f.symbol || f;
    if (seen.has(k) && !f.body) continue;
    seen.add(k);
    api.report(f.nameLoc || f, M(`Function '${f.name}' uses the ellipsis notation.`, `함수 '${f.name}'가 생략 부호(...)를 사용합니다.`));
  }
}

// Parameter names identical in every declaration of a function (within the unit).
function paramNamesMatch(unit, api) {
  const done = new Set();
  for (const f of U.get(unit, 'FunctionDecl')) {
    const s = f.symbol;
    if (!s || done.has(s)) continue;
    done.add(s);
    const decls = (s.decls || []).filter((d) => d.type === 'FunctionDecl' && U.user(d) && d.params);
    if (decls.length < 2) continue;
    const ref = decls[0];
    for (const d of decls.slice(1)) {
      const n = Math.min(ref.params.length, d.params.length);
      for (let i = 0; i < n; i++) {
        const a = ref.params[i].name, b = d.params[i].name;
        if (a && b && a !== b) {
          api.report(d.params[i].nameLoc || d.params[i], M(`Parameter ${i + 1} of '${f.name}' is named '${b}' here but '${a}' in another declaration.`, `'${f.name}'의 매개변수 ${i + 1} 이름이 여기서는 '${b}'이지만 다른 선언에서는 '${a}'입니다.`));
        }
      }
    }
  }
}

// bit-field types
function bitFields(unit) { return U.get(unit, 'FieldDecl').filter((f) => f.bitWidth); }

function specNames(fd) {
  const p = cf.parentOf(fd);
  const ts = p && p.specs && p.specs.typeSpec;
  return ts && ts.type === 'BuiltinType' ? ts.names : null;
}

function shiftRange(unit, api) {
  for (const b of U.get(unit, 'BinaryExpr')) {
    if (b.op !== '<<' && b.op !== '>>') continue;
    const v = U.iceValue(unit, b.right);
    if (v == null) continue;
    const u = UT.ut(unit, b.left);
    if (u.kind !== 'int' || !u.size) continue;
    const width = BigInt(u.size * 8);
    if (v < 0n || v >= width) api.report(b.right, M(`Shift amount ${v} is outside 0..${width - 1n} for the ${UT.describe(u)} left operand.`, `이동 크기 ${v}가 ${UT.describeKo(u)} 왼쪽 피연산자의 범위 0..${width - 1n}을 벗어났습니다.`));
  }
}

module.exports = {
  shiftRange,
  LOOPS, isFloatT, isPtrT, isBoolT, bodyCompound, defaultLast, switchHasCase, switchBool, clauseEnds, continueUsed,
  multipleExits, forCounter, writesTo, counterModifiedInBody, floatInFor, floatEquality, shiftComplementCast,
  bitwiseSigned, unaryMinusUnsigned, floatBits, logicalOperands, hasEffect, noEffectStatements, enumInit,
  blockScopeFunctions, variadicFunctions, paramNamesMatch, bitFields, specNames,
};
