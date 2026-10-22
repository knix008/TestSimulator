'use strict';

// Checkers that need the typed AST and the CFG structure but no abstract
// state: UNREACHABLE, IDENTICAL_BRANCHES, CONSTANT_EXPRESSION_RESULT,
// NO_EFFECT, MISSING_BREAK, SIGN_EXTENSION, MIXED_ENUMS, COPY_PASTE_ERROR,
// SIZEOF_MISMATCH and UNINIT_CTOR. They run per function through the
// analyzer's reporter (an.report) with reporting enabled.

const cf = require('../cfamily');
const { NORETURN } = require('./models');
const { hasSideEffects } = require('./interp');

const T = cf.types;

function skip(e) {
  while (e && e.type === 'ParenExpr') e = e.expr;
  return e;
}

function inMacro(n) {
  return !!(n && n.loc && n.loc.macro);
}

function norm(s) {
  return String(s || '').replace(/\s+/g, '');
}

function canon(t) {
  if (!t) return null;
  let c = T.canonical(t);
  if (c && c.kind === 'reference') c = T.canonical(c.to);
  return c;
}

function intLit(e) {
  e = skip(e);
  if (!e || inMacro(e)) return null;
  if (e.type === 'IntegerLiteral' || e.type === 'CharLiteral') return Number(e.value);
  return null;
}

function runSyntax(an) {
  const fn = an.fn;
  if (!fn.body) return;
  an.reporting = true;
  try {
    unreachable(an);
    cf.walk(fn.body, (n) => {
      if (n.type === 'LambdaExpr') return cf.walk.SKIP;
      if (!n.loc || n.loc.file !== an.file) return undefined;
      switch (n.type) {
        case 'IfStmt': identicalIf(an, n); break;
        case 'ConditionalExpr': identicalCond(an, n); break;
        case 'BinaryExpr': constExpr(an, n); mixedEnumsBin(an, n); signExt(an, n); arrayNull(an, n); break;
        case 'AssignExpr': mixedEnumsAssign(an, n); break;
        case 'ExprStmt': noEffect(an, n); break;
        case 'SwitchStmt': missingBreak(an, n); break;
        case 'CompoundStmt': copyPaste(an, n); break;
        case 'CallExpr': sizeofMismatch(an, n); break;
        default: break;
      }
      return undefined;
    });
    uninitCtor(an);
  } finally {
    an.reporting = false;
  }
}

// ---------------------------------------------------------------- UNREACHABLE

function unreachable(an) {
  let list = [];
  try { list = an.cfg.unreachable(); } catch { list = []; }
  for (const { block, nodes } of list) {
    if (block && block.preds && block.preds.length) continue;
    const n = (nodes || []).find((x) => x && x.loc && x.loc.file === an.file && !inMacro(x)
      && !['BreakStmt', 'NullStmt', 'LabelStmt', 'Declaration', 'CaseStmt', 'DefaultStmt', 'StaticAssert'].includes(x.type)
      && !(x.type === 'VarDecl' && !x.init));
    if (!n) continue;
    an.report('UNREACHABLE', n, {
      en: `This code cannot be reached: it follows a statement that always leaves this block (${an.src(n, 40)}).`,
      ko: `이 코드에 도달할 수 없습니다: 항상 블록을 떠나는 문장 뒤에 있습니다(${an.src(n, 40)}).`,
    }, [], { tag: 'unreachable' });
  }
}

// ---------------------------------------------------------------- IDENTICAL_BRANCHES

function identicalIf(an, n) {
  if (!n.else || n.else.type === 'IfStmt' || inMacro(n) || n.constexpr) return;
  const a = norm(an.src(n.then, 100000)), b = norm(an.src(n.else, 100000));
  if (!a || a !== b || a === '{}' || a === ';') return;
  an.report('IDENTICAL_BRANCHES', n, {
    en: `The two branches of this if statement are identical, so the condition ${an.src(n.cond, 40)} has no effect.`,
    ko: `이 if 문의 두 분기가 같아서 조건 ${an.src(n.cond, 40)}이(가) 의미가 없습니다.`,
  }, [], { tag: 'identical_branches' });
}

function identicalCond(an, n) {
  if (!n.consequent || inMacro(n)) return;
  const a = norm(an.src(n.consequent, 100000)), b = norm(an.src(n.alternate, 100000));
  if (!a || a !== b) return;
  an.report('IDENTICAL_BRANCHES', n, {
    en: `Both results of the ?: operator are ${an.src(n.consequent, 40)}, so the condition has no effect.`,
    ko: `?: 연산자의 두 결과가 모두 ${an.src(n.consequent, 40)}이어서 조건이 의미가 없습니다.`,
  }, [], { tag: 'identical_branches' });
}

// ---------------------------------------------------------------- CONSTANT_EXPRESSION_RESULT

function constExpr(an, n) {
  if (inMacro(n) || !scalarExpr(n.left) || !scalarExpr(n.right)) return;
  const op = n.op;
  if (op === '||' || op === '&&') {
    for (const side of [n.left, n.right]) {
      const v = intLit(side);
      if (v === null || v === 0 || v === 1) continue;
      const other = side === n.left ? n.right : n.left;
      if (intLit(other) !== null) continue;
      const res = op === '||' ? { en: 'true', ko: '참' } : { en: 'equal to the other operand', ko: '다른 피연산자와 같은 값' };
      an.report('CONSTANT_EXPRESSION_RESULT', n, {
        en: `The operand ${an.src(side, 20)} of ${op} is a non-zero constant, so ${an.src(n, 50)} is always ${res.en}. A comparison may be missing.`,
        ko: `${op}의 피연산자 ${an.src(side, 20)}이(가) 0이 아닌 상수여서 ${an.src(n, 50)}은(는) 늘 ${res.ko}입니다. 비교식이 빠졌을 수 있습니다.`,
      }, [], { tag: 'logical_vs_bitwise' });
      return;
    }
    return;
  }
  if (['<', '>=', '>', '<='].includes(op)) {
    let x = null, c = null, flip = false;
    if (intLit(n.right) === 0) { x = n.left; c = op; }
    else if (intLit(n.left) === 0) { x = n.right; c = { '>': '<', '<=': '>=', '<': '>', '>=': '<=' }[op]; flip = true; }
    if (!x || (c !== '<' && c !== '>=')) return;
    const t = canon(x.ctype);
    if (!t || !T.isInteger(t) || t.kind === 'enum' || !T.isUnsigned(t, an.target) || T.isBool(t)) return;
    const common = T.usualArithmetic(t, T.T.int, an.target);
    if (!common || !T.isUnsigned(common, an.target)) return;
    const always = c === '<' ? { en: 'false', ko: '거짓' } : { en: 'true', ko: '참' };
    an.report('CONSTANT_EXPRESSION_RESULT', n, {
      en: `${an.src(x, 30)} is unsigned, so ${an.src(n, 50)} is always ${always.en}.`,
      ko: `${an.src(x, 30)}은(는) 부호가 없어서 ${an.src(n, 50)}은(는) 늘 ${always.ko}입니다.`,
    }, [], { tag: 'unsigned_compare' });
    void flip;
    return;
  }
  if (op === '==' || op === '!=') {
    let masked = null, val = null;
    const l = skip(n.left), r = skip(n.right);
    if (l && l.type === 'BinaryExpr' && l.op === '&') { masked = l; val = intLit(r); }
    else if (r && r.type === 'BinaryExpr' && r.op === '&') { masked = r; val = intLit(l); }
    if (!masked || val === null) return;
    const mask = intLit(masked.right) !== null ? intLit(masked.right) : intLit(masked.left);
    if (mask === null || !Number.isSafeInteger(mask) || !Number.isSafeInteger(val) || mask < 0 || val < 0 || mask > 2 ** 31 || val > 2 ** 31) return;
    if ((val & ~mask) === 0) return;
    const always = op === '==' ? { en: 'false', ko: '거짓' } : { en: 'true', ko: '참' };
    an.report('CONSTANT_EXPRESSION_RESULT', n, {
      en: `${an.src(masked, 30)} can never equal ${val}: the value has bits outside the mask, so ${an.src(n, 50)} is always ${always.en}.`,
      ko: `${an.src(masked, 30)}은(는) ${val}이(가) 될 수 없습니다: 값에 마스크 밖 비트가 있어 ${an.src(n, 50)}은(는) 늘 ${always.ko}입니다.`,
    }, [], { tag: 'result_independent_of_operands' });
  }
}

// ---------------------------------------------------------------- NO_EFFECT

function arrayNull(an, n) {
  if ((n.op !== '==' && n.op !== '!=') || inMacro(n)) return;
  for (const [a, b] of [[n.left, n.right], [n.right, n.left]]) {
    if (!an.isNullLiteral(b)) continue;
    const x = skip(a);
    if (!x || (x.type !== 'Identifier' && x.type !== 'MemberExpr')) continue;
    const t = canon(x.type === 'Identifier' && x.symbol ? x.symbol.type : x.ctype);
    if (!t || t.kind !== 'array') continue;
    if (x.type === 'Identifier' && x.symbol && x.symbol.kind === 'parameter') continue;
    const always = n.op === '==' ? { en: 'false', ko: '거짓' } : { en: 'true', ko: '참' };
    an.report('NO_EFFECT', n, {
      en: `Comparing array ${an.src(x, 30)} to null: an array address is never null, so the comparison is always ${always.en}.`,
      ko: `배열 ${an.src(x, 30)}을(를) 널과 비교합니다: 배열 주소는 널이 아니어서 비교 결과가 늘 ${always.ko}입니다.`,
    }, [], { tag: 'array_null' });
    return;
  }
}

function isVolatileExpr(an, e) {
  const t = canon(e && e.ctype);
  return !!(t && t.volatile);
}

function scalarExpr(e) {
  const x = skip(e);
  if (x && x.type === 'BinaryExpr') return scalarExpr(x.left) && scalarExpr(x.right);
  if (x && x.type === 'Identifier' && !x.symbol) return false;
  const t = canon(e && e.ctype);
  return !!t && (T.isArithmetic(t) || t.kind === 'pointer' || t.kind === 'enum' || t.kind === 'array' || t.kind === 'nullptr');
}

function noEffect(an, n) {
  const x = skip(n.expr);
  if (!x || inMacro(n) || inMacro(x)) return;
  if (x.type === 'AssignExpr' && x.op === '=') {
    const l = skip(x.left), r = skip(x.right);
    if (!l || !r || hasSideEffects(l) || hasSideEffects(r) || isVolatileExpr(an, l)) return;
    if (!['Identifier', 'MemberExpr'].includes(l.type)) return;
    if (!norm(an.src(l, 1000)) || norm(an.src(l, 1000)) !== norm(an.src(r, 1000))) return;
    an.report('NO_EFFECT', x, {
      en: `Assigning ${an.src(l, 30)} to itself has no effect.`,
      ko: `${an.src(l, 30)}을(를) 자기 자신에 대입해도 효과가 없습니다.`,
    }, [], { tag: 'self_assign' });
    return;
  }
  if (x.type === 'BinaryExpr' && !['&&', '||', ','].includes(x.op) && !hasSideEffects(x) && scalarExpr(x.left) && scalarExpr(x.right)) {
    const isCmp = ['==', '!=', '<', '>', '<=', '>='].includes(x.op);
    an.report('NO_EFFECT', x, {
      en: isCmp ? `The result of comparison ${an.src(x, 40)} is discarded. An assignment may have been intended.` : `The result of ${an.src(x, 40)} is computed and discarded.`,
      ko: isCmp ? `비교 ${an.src(x, 40)}의 결과를 버립니다. 대입을 의도했을 수 있습니다.` : `${an.src(x, 40)}의 결과를 계산하고 버립니다.`,
    }, [], { tag: isCmp ? 'no_effect_test' : 'no_effect' });
    return;
  }
  if (x.type === 'UnaryExpr' && (x.op === '-' || x.op === '!' || x.op === '~') && !hasSideEffects(x) && scalarExpr(x.arg)) {
    an.report('NO_EFFECT', x, {
      en: `The result of ${an.src(x, 40)} is computed and discarded.`,
      ko: `${an.src(x, 40)}의 결과를 계산하고 버립니다.`,
    }, [], { tag: 'no_effect' });
  }
}

// ---------------------------------------------------------------- MISSING_BREAK

function isNoreturnCall(e) {
  e = skip(e);
  if (!e || e.type !== 'CallExpr') return false;
  const sym = e.calleeSymbol;
  if (sym && sym.noreturn) return true;
  const c = skip(e.callee);
  const name = (sym && (sym.qname || sym.name)) || (c && c.name);
  return !!name && (NORETURN.has(name) || (cf.symbols && cf.symbols.NORETURN_NAMES && cf.symbols.NORETURN_NAMES.has && cf.symbols.NORETURN_NAMES.has(name)));
}

function ends(s) {
  if (!s) return false;
  switch (s.type) {
    case 'BreakStmt': case 'ReturnStmt': case 'ContinueStmt': case 'GotoStmt': return true;
    case 'ExprStmt': {
      const x = skip(s.expr);
      return !!x && (x.type === 'ThrowExpr' || isNoreturnCall(x));
    }
    case 'CompoundStmt': return s.body.length > 0 && ends(s.body[s.body.length - 1]);
    case 'IfStmt': return !!s.else && ends(s.then) && ends(s.else);
    case 'CaseStmt': case 'DefaultStmt': case 'LabelStmt': return ends(s.body);
    case 'WhileStmt': case 'ForStmt': case 'DoStmt': {
      const c = s.type === 'ForStmt' ? s.cond : s.cond;
      const infinite = !c || (skip(c) && skip(c).type === 'IntegerLiteral' && Number(skip(c).value) !== 0);
      if (!infinite) return false;
      let brk = false;
      cf.walk(s.body, (n) => {
        if (['WhileStmt', 'ForStmt', 'DoStmt', 'SwitchStmt', 'LambdaExpr'].includes(n.type)) return cf.walk.SKIP;
        if (n.type === 'BreakStmt') brk = true;
        return undefined;
      });
      return !brk;
    }
    default: return false;
  }
}

function hasFallthroughAttr(stmts) {
  let found = false;
  for (const s of stmts) {
    cf.walk(s, (n) => {
      if (n.attributes && n.attributes.some && n.attributes.some((a) => a && /fallthrough/i.test(a.name || ''))) found = true;
      if (n.type === 'Identifier' && /fallthrough|FALLTHROUGH|FALL_THROUGH/.test(n.name || '')) found = true;
      return undefined;
    });
  }
  return found;
}

function missingBreak(an, sw) {
  let groups;
  try { groups = cf.switchClauses(sw).clauses; } catch { return; }
  const comments = (an.unit.comments || []).filter((c) => c.file === an.file);
  for (let i = 0; i + 1 < groups.length; i++) {
    const g = groups[i], next = groups[i + 1];
    const body = g.body || [];
    if (!body.length) continue;
    const last = body[body.length - 1];
    if (ends(last) || inMacro(last)) continue;
    if (hasFallthroughAttr(body)) continue;
    const nextNode = next.node || (next.labels && next.labels[0]);
    if (!nextNode || !nextNode.loc) continue;
    const from = last.loc ? last.loc.line : nextNode.loc.line;
    const to = nextNode.loc.line;
    if (comments.some((c) => c.line >= from && c.line <= to && /fall[\s-]*thr(ough|u)|no\s*break|FALLTHRU|intentional/i.test(c.value))) continue;
    const label = nextNode.type === 'DefaultStmt' ? 'default' : `case ${an.src(nextNode.value, 20)}`;
    an.report('MISSING_BREAK', nextNode, {
      en: `The preceding case is not terminated by a break statement, so execution falls through into ${label}.`,
      ko: `앞 case가 break 문으로 끝나지 않아 실행이 ${label}(으)로 넘어갑니다.`,
    }, [an.ev(last, 'fallthrough', `The case ends here without a break.`, `case가 여기서 break 없이 끝납니다.`)], { tag: 'unterminated_case' });
  }
}

// ---------------------------------------------------------------- SIGN_EXTENSION

function signExt(an, n) {
  if (n.op !== '<<' || inMacro(n)) return;
  const l = skip(n.left);
  if (!l) return;
  const lt = canon(l.ctype);
  if (!lt || !T.isInteger(lt) || T.isBool(lt) || !T.isUnsigned(lt, an.target)) return;
  const lbits = T.intBits(lt, an.target);
  const ibits = T.intBits(T.T.int, an.target);
  if (!lbits || lbits >= ibits) return;
  const c = intLit(n.right);
  if (c === null || c + lbits < ibits || c >= ibits) return;
  let cur = n, parent = cf.parentOf(n);
  while (parent && (parent.type === 'ParenExpr' || (parent.type === 'BinaryExpr' && (parent.op === '|' || parent.op === '+' || parent.op === '^')))) { cur = parent; parent = cf.parentOf(parent); }
  let target = null;
  if (!parent) return;
  if (parent.type === 'AssignExpr' && parent.right === cur) target = parent.left.ctype;
  else if (parent.type === 'VarDecl' && parent.init === cur) target = parent.ctype;
  else if (parent.type === 'CastExpr') target = parent.ctype;
  else if (parent.type === 'ReturnStmt') target = parent.functionReturnType || (an.fn.ctype && T.canonical(an.fn.ctype).ret);
  const tt = canon(target);
  if (!tt || !T.isInteger(tt)) return;
  const tbits = T.intBits(tt, an.target);
  if (!tbits || tbits <= ibits) return;
  an.report('SIGN_EXTENSION', n, {
    en: `${an.src(l, 30)} (${T.typeToString(lt)}) is promoted to int and shifted by ${c} into the sign bit; widening the result to ${T.typeToString(tt)} sign-extends it.`,
    ko: `${an.src(l, 30)}(${T.typeToString(lt)})이(가) int로 승격된 뒤 ${c}만큼 시프트되어 부호 비트에 닿고, ${T.typeToString(tt)}(으)로 넓히면 부호가 확장됩니다.`,
  }, [], { tag: 'sign_extension' });
}

// ---------------------------------------------------------------- MIXED_ENUMS

function enumOf(e) {
  e = skip(e);
  if (!e) return null;
  if (e.type === 'Identifier' && e.symbol && e.symbol.kind === 'enumerator') return e.symbol.enumType ? canon(e.symbol.enumType) : null;
  if (e.type === 'CastExpr') return null;
  const t = canon(e.ctype);
  return t && t.kind === 'enum' ? t : null;
}

function enumName(t) {
  return t.name || t.typedefName || '<anonymous>';
}

function sameEnum(a, b) {
  if (a === b) return true;
  if (a.decl && b.decl) return a.decl === b.decl;
  return enumName(a) === enumName(b) && a.name;
}

function mixedEnumsBin(an, n) {
  if (!['==', '!=', '<', '>', '<=', '>='].includes(n.op) || inMacro(n)) return;
  const a = enumOf(n.left), b = enumOf(n.right);
  if (!a || !b || sameEnum(a, b)) return;
  an.report('MIXED_ENUMS', n, {
    en: `Comparing a value of enum ${enumName(a)} with a value of enum ${enumName(b)}.`,
    ko: `열거형 ${enumName(a)}의 값과 열거형 ${enumName(b)}의 값을 비교합니다.`,
  }, [], { tag: 'mixed_enum_type' });
}

function mixedEnumsAssign(an, n) {
  if (n.op !== '=' || inMacro(n)) return;
  const lt = canon(n.left.ctype);
  if (!lt || lt.kind !== 'enum') return;
  const b = enumOf(n.right);
  if (!b || sameEnum(lt, b)) return;
  an.report('MIXED_ENUMS', n, {
    en: `Assigning a value of enum ${enumName(b)} to ${an.src(n.left, 30)} of enum ${enumName(lt)}.`,
    ko: `열거형 ${enumName(b)}의 값을 열거형 ${enumName(lt)}인 ${an.src(n.left, 30)}에 대입합니다.`,
  }, [], { tag: 'mixed_enum_type' });
}

// ---------------------------------------------------------------- COPY_PASTE_ERROR

const TOK = /[A-Za-z_]\w*|\d+(?:\.\d+)?|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\S/g;
const IDENT = /^[A-Za-z_]\w*$/;
const KW = new Set(['sizeof', 'return', 'if', 'else', 'int', 'char', 'long', 'short', 'unsigned', 'signed', 'const', 'void', 'struct']);

function renameOf(u, v) {
  let p = 0;
  while (p < u.length && p < v.length && u[p] === v[p]) p++;
  let s = 0;
  while (s < u.length - p && s < v.length - p && u[u.length - 1 - s] === v[v.length - 1 - s]) s++;
  return { x: u.slice(p, u.length - s), y: v.slice(p, v.length - s) };
}

function applyRename(w, x, y) {
  if (!x) return null;
  const i = w.indexOf(x);
  if (i < 0) return null;
  return w.slice(0, i) + y + w.slice(i + x.length);
}

function functionNames(an) {
  if (an.$names) return an.$names;
  const names = new Set();
  cf.walk(an.fn, (n) => {
    if (n.type === 'Identifier' && n.name) names.add(n.name);
    if (n.type === 'MemberExpr' && n.member) names.add(n.member);
    if ((n.type === 'VarDecl' || n.type === 'ParamDecl') && n.name) names.add(n.name);
    return undefined;
  });
  an.$names = names;
  return names;
}

function copyPaste(an, block) {
  const stmts = (block.body || []).filter((s) => s && s.type === 'ExprStmt' && !inMacro(s));
  for (let i = 0; i + 1 < stmts.length; i++) {
    const s1 = stmts[i], s2 = stmts[i + 1];
    if (!s1.loc || !s2.loc || s2.loc.line - s1.loc.line > 2) continue;
    const t1 = an.src(s1, 100000).match(TOK) || [];
    const t2 = an.src(s2, 100000).match(TOK) || [];
    if (t1.length !== t2.length || t1.length < 5) continue;
    let ok = true;
    const diffs = [];
    for (let k = 0; k < t1.length; k++) {
      if (t1[k] === t2[k]) continue;
      if (!IDENT.test(t1[k]) || !IDENT.test(t2[k])) { ok = false; break; }
      diffs.push(k);
    }
    if (!ok || diffs.length < 2) continue;
    const r = renameOf(t1[diffs[0]], t2[diffs[0]]);
    if (!r.x || !r.y) continue;
    if (!diffs.every((k) => applyRename(t1[k], r.x, r.y) === t2[k])) continue;
    const names = functionNames(an);
    for (let k = 0; k < t2.length; k++) {
      const w = t2[k];
      if (t1[k] !== w || !IDENT.test(w) || KW.has(w)) continue;
      const w2 = applyRename(w, r.x, r.y);
      if (!w2 || w2 === w || !names.has(w2) || t1.includes(w2)) continue;
      an.report('COPY_PASTE_ERROR', s2, {
        en: `This statement looks copied from the previous one with ${r.x} renamed to ${r.y}, but ${w} was not renamed. Should it be ${w2}?`,
        ko: `이 문장은 앞 문장을 복사해 ${r.x}을(를) ${r.y}(으)로 바꾼 것 같은데 ${w}은(는) 그대로입니다. ${w2}이어야 하지 않나요?`,
      }, [an.ev(s1, 'original', `The original statement: ${an.src(s1, 50)}`, `원래 문장: ${an.src(s1, 50)}`)], { tag: 'copy_paste_error' });
      break;
    }
  }
}

// ---------------------------------------------------------------- SIZEOF_MISMATCH

function sizeofsIn(e, out = []) {
  e = skip(e);
  if (!e) return out;
  if (e.type === 'SizeofExpr') out.push(e);
  else if (e.type === 'BinaryExpr' && (e.op === '*' || e.op === '+')) { sizeofsIn(e.left, out); sizeofsIn(e.right, out); }
  else if (e.type === 'CastExpr' && e.arg) sizeofsIn(e.arg, out);
  return out;
}

function sizeofType(s) {
  if (s.typeName) return canon(s.typeName.ctype);
  if (s.arg) {
    const a = skip(s.arg);
    if (a && a.type === 'Identifier' && a.symbol) return canon(a.symbol.type) || canon(a.ctype);
    return canon(a && a.ctype);
  }
  return null;
}

function calleeName(e) {
  const c = skip(e.callee);
  return c && c.type === 'Identifier' ? c.name : null;
}

function sizeofMismatch(an, call) {
  if (inMacro(call)) return;
  const name = calleeName(call);
  if (!name) return;
  const args = call.args || [];
  if (['malloc', 'calloc', 'realloc'].includes(name)) {
    let parent = cf.parentOf(call), cur = call;
    while (parent && (parent.type === 'ParenExpr' || parent.type === 'CastExpr')) { cur = parent; parent = cf.parentOf(parent); }
    let dt = null;
    if (parent && parent.type === 'AssignExpr' && parent.right === cur) dt = canon(parent.left.ctype);
    else if (parent && parent.type === 'VarDecl' && parent.init === cur) dt = canon(parent.ctype);
    if (!dt || dt.kind !== 'pointer') return;
    const pointee = canon(dt.to);
    if (!pointee || pointee.kind === 'void' || T.isCharType(pointee)) return;
    const sizeArgs = name === 'realloc' ? [args[1]] : name === 'calloc' ? [args[0], args[1]] : [args[0]];
    for (const sa of sizeArgs) {
      for (const s of sizeofsIn(sa)) {
        const st = sizeofType(s);
        if (!st) continue;
        let bad = false;
        if (st.kind === 'pointer' && pointee.kind !== 'pointer' && T.sameType(st, dt, { ignoreQuals: true })) bad = true;
        else if (T.isRecord(st) && T.isRecord(pointee) && st.decl !== pointee.decl && (T.sizeOf(st, an.target) || 0) < (T.sizeOf(pointee, an.target) || 0)) bad = true;
        if (!bad) continue;
        an.report('SIZEOF_MISMATCH', s, {
          en: `Allocating ${an.src(s, 30)} bytes for objects of type ${T.typeToString(pointee)}: ${T.typeToString(st)} is not the element type.`,
          ko: `${T.typeToString(pointee)} 타입 객체를 위해 ${an.src(s, 30)}바이트를 할당합니다: ${T.typeToString(st)}은(는) 원소 타입이 아닙니다.`,
        }, [], { tag: 'sizeof_mismatch' });
        return;
      }
    }
    return;
  }
  if (['memset', 'memcpy', 'memmove', 'memcmp', 'bzero'].includes(name)) {
    const nArg = name === 'bzero' ? args[1] : args[2];
    const dst = skip(args[0]);
    if (!nArg || !dst || dst.type !== 'Identifier' || !dst.symbol) return;
    const dt = canon(dst.symbol.type);
    if (!dt || dt.kind !== 'pointer') return;
    const pointee = canon(dt.to);
    if (!pointee || pointee.kind === 'pointer') return;
    for (const s of sizeofsIn(nArg)) {
      const a = skip(s.arg);
      if (!a || a.type !== 'Identifier' || a.symbol !== dst.symbol) continue;
      an.report('SIZEOF_MISMATCH', s, {
        en: `${an.src(s, 30)} is the size of the pointer ${dst.name}, not of the memory it points to.`,
        ko: `${an.src(s, 30)}은(는) ${dst.name}이(가) 가리키는 메모리가 아니라 포인터 자체의 크기입니다.`,
      }, [], { tag: 'sizeof_mismatch' });
      return;
    }
  }
}

// ---------------------------------------------------------------- UNINIT_CTOR

function uninitCtor(an) {
  const fn = an.fn;
  if (an.lang !== 'cpp' || !fn.isConstructor || !fn.body) return;
  const rec = fn.symbol && fn.symbol.record;
  const rt = rec && (rec.kind === 'record' ? rec : canon(rec.ctype || rec.type));
  if (!rt || !rt.fields) return;
  const inits = new Set((fn.ctorInits || []).map((c) => c.name));
  if ((fn.ctorInits || []).some((c) => c.name === rt.name || c.name === fn.name)) return;
  const params = fn.params || [];
  if (params.length === 1) {
    const pt = canon(params[0].ctype);
    if (pt && pt.kind === 'reference' && canon(pt.to) && canon(pt.to).decl === rt.decl) return;
  }
  const touched = new Set();
  let opaque = false;
  cf.walk(fn.body, (n) => {
    if (n.type === 'CallExpr') {
      const c = skip(n.callee);
      const sym = n.calleeSymbol;
      if ((sym && sym.member) || (c && c.type === 'MemberExpr')) opaque = true;
      for (const a of n.args || []) {
        const x = skip(a);
        if (x && x.type === 'UnaryExpr' && x.op === '&') { const f = fieldName(x.arg); if (f) touched.add(f); }
        if (x && x.type === 'ThisExpr') opaque = true;
      }
    }
    if (n.type === 'AssignExpr') { const f = fieldName(n.left); if (f) touched.add(f); }
    if (n.type === 'UnaryExpr' && (n.op === '++' || n.op === '--' || n.op === '&')) { const f = fieldName(n.arg); if (f) touched.add(f); }
    if (n.type === 'AsmStmt') opaque = true;
    return undefined;
  });
  if (opaque) return;
  for (const f of rt.fields) {
    if (!f.name || f.anonymous || f.unnamed) continue;
    const t = canon(f.type);
    if (!t || !(T.isScalar(t) || t.kind === 'pointer' || T.isInteger(t) || t.kind === 'enum')) continue;
    if (t.kind === 'reference') continue;
    if (f.node && (f.node.init || (f.node.specs && (f.node.specs.storage || []).includes('static')))) continue;
    if (f.symbol && f.symbol.storage === 'static') continue;
    if (inits.has(f.name) || touched.has(f.name)) continue;
    an.report('UNINIT_CTOR', fn, {
      en: `The constructor ${fn.qname || fn.name} does not initialize member ${f.name}.`,
      ko: `생성자 ${fn.qname || fn.name}이(가) 멤버 ${f.name}을(를) 초기화하지 않습니다.`,
    }, [f.node ? an.ev(f.node, 'member_decl', `Member ${f.name} is declared here.`, `멤버 ${f.name}을(를) 여기서 선언합니다.`) : null], { tag: 'uninit_member' });
  }
}

function fieldName(e) {
  e = skip(e);
  if (!e) return null;
  while (e && (e.type === 'IndexExpr' || (e.type === 'MemberExpr' && !(skip(e.object) && skip(e.object).type === 'ThisExpr')))) {
    if (e.type === 'MemberExpr') { const o = skip(e.object); if (o && o.type === 'Identifier' && o.symbol && o.symbol.kind === 'field') return o.name; }
    e = skip(e.object);
  }
  if (!e) return null;
  if (e.type === 'Identifier' && e.symbol && e.symbol.kind === 'field') return e.name;
  if (e.type === 'MemberExpr' && skip(e.object) && skip(e.object).type === 'ThisExpr') return e.member;
  return null;
}

module.exports = { runSyntax, ends };
