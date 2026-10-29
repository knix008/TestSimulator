'use strict';

// More Defect Analysis C/C++ checkers that work on the typed AST, the source layout
// and the CFG (no abstract state). They run per function after syntax.js:
//
//   UNINTENDED_INTEGER_DIVISION  int / int converted to a floating type
//   SWAPPED_ARGUMENTS            argument names match parameter names in another order
//   UNUSED_VALUE                 value stored and overwritten / never read (liveness on the CFG)
//   EVALUATION_ORDER             unsequenced modification and access in one expression
//   BAD_COMPARE                  function name compared with 0, pointer < null
//   NESTING_INDENT_MISMATCH      indentation suggests a statement is in an unbraced body
//   MISSING_COMMA                adjacent string literals in an initializer list
//   STRAY_SEMICOLON              `if (c);` / `for (...);` / `while (c);` before a block
//   SIZECHECK                    constant allocation size that does not fit the pointee
//   BAD_SIZEOF                   sizeof of a pointer where the buffer size was meant
//   DELETE_ARRAY                 new[] released with delete, new with delete[] (locals)
//   COPY_INSTEAD_OF_MOVE         expensive local copied although it is dead afterwards
//   WRAPPER_ESCAPE               c_str()/data() of a local string returned or stored
//
// OVERFLOW_BEFORE_WIDEN uses conversionContext() from here but is checked in
// eval.js with the operands' intervals. Class-level parts (DELETE_ARRAY on
// members, CTOR_DTOR_LEAK) and STACK_USE are collected here and reported
// project-wide from index.js.

const cf = require('../cfamily');
const { expensive, methodCall, isStdMove, calleeType, declTypeText } = require('./cpp');

const T = cf.types;

function skip(e) {
  while (e && e.type === 'ParenExpr') e = e.expr;
  return e;
}

function skipCasts(e) {
  e = skip(e);
  while (e && e.type === 'CastExpr' && e.arg) e = skip(e.arg);
  return e;
}

const inMacro = (n) => !!(n && n.loc && n.loc.macro);

function canon(t) {
  if (!t) return null;
  let c = T.canonical(t);
  if (c && c.kind === 'reference') c = T.canonical(c.to);
  return c;
}

function isIntType(t) {
  const c = canon(t);
  return !!c && T.isInteger(c) && c.kind !== 'enum';
}

function isFloatType(t) {
  const c = canon(t);
  return !!c && T.isFloating(c);
}

function fnRet(an) {
  const ft = an.fn.ctype && T.canonical(an.fn.ctype);
  return ft && ft.kind === 'function' ? ft.ret : null;
}

function constInt(an, e) {
  e = skip(e);
  if (!e) return null;
  try {
    const v = T.constValue(e, { target: an.target });
    if (v && !v.float && v.value !== undefined && !v.invalid) return Number(v.value);
  } catch { /* not constant */ }
  return null;
}

function isLiteral(e) {
  e = skipCasts(e);
  if (!e) return false;
  if (e.type === 'UnaryExpr' && (e.op === '-' || e.op === '+')) return isLiteral(e.arg);
  return ['IntegerLiteral', 'FloatingLiteral', 'CharLiteral', 'BoolLiteral', 'NullptrLiteral', 'StringLiteral'].includes(e.type);
}

function isNullLit(e) {
  e = skipCasts(e);
  if (!e) return false;
  if (e.type === 'NullptrLiteral') return true;
  return e.type === 'IntegerLiteral' && Number(e.value) === 0;
}

function varSym(e) {
  e = skip(e);
  if (!e || e.type !== 'Identifier' || !e.symbol) return null;
  const s = e.symbol;
  return s.kind === 'variable' || s.kind === 'parameter' ? s : null;
}

function isLocalSym(s) {
  return !!s && (s.kind === 'parameter' || (s.kind === 'variable' && s.storage === 'automatic'));
}

function typeName(t) {
  try { return T.typeToString(t); } catch { return '?'; }
}

// Where the value of expression e goes: the type it is converted to.
function conversionContext(an, e) {
  let cur = e, p = cf.parentOf(e);
  while (p && p.type === 'ParenExpr') { cur = p; p = cf.parentOf(p); }
  if (!p) return null;
  switch (p.type) {
    case 'AssignExpr':
      if (p.right === cur && (p.op === '=' || p.op === '+=' || p.op === '-=')) return { type: p.left.ctype, how: 'assign', node: p };
      return null;
    case 'VarDecl':
      if (p.init === cur) return { type: p.ctype, how: 'init', node: p };
      return null;
    case 'ReturnStmt':
      return { type: p.functionReturnType || fnRet(an), how: 'return', node: p };
    case 'CastExpr':
      if (p.arg === cur) return { type: p.ctype, how: 'cast', node: p };
      return null;
    case 'CallExpr': {
      const i = (p.args || []).indexOf(cur);
      if (i < 0) return null;
      const ft = calleeType(p);
      const pt = ft && ft.params && ft.params[i];
      return pt ? { type: pt, how: 'arg', node: p, idx: i } : null;
    }
    case 'BinaryExpr':
      if (['+', '-', '*', '/', '%'].includes(p.op)) return { type: p.ctype, how: 'operand', node: p };
      return null;
    default:
      return null;
  }
}

const HOW = {
  assign: { en: 'assigned to', ko: '대입' },
  init: { en: 'used to initialize', ko: '초기화' },
  return: { en: 'returned as', ko: '반환' },
  cast: { en: 'cast to', ko: '변환' },
  arg: { en: 'passed as', ko: '인자 전달' },
  operand: { en: 'used in arithmetic of type', ko: '연산' },
};

function lines(an) {
  if (an.$lines) return an.$lines;
  let text = '';
  const src = an.unit.sources && an.unit.sources.get(an.file);
  if (src && typeof src.text === 'string') text = src.text;
  an.$lines = text.split('\n');
  return an.$lines;
}

function indentOf(an, line) {
  const l = lines(an)[line - 1];
  if (l === undefined) return null;
  return /^[ \t]*/.exec(l)[0];
}

function runSyntax2(an) {
  const fn = an.fn;
  if (!fn.body) return;
  an.reporting = true;
  try {
    cf.walk(fn.body, (n, parent) => {
      if (n.type === 'LambdaExpr') return cf.walk.SKIP;
      if (!n.loc || n.loc.file !== an.file) return undefined;
      switch (n.type) {
        case 'BinaryExpr': intDivision(an, n); badCompare(an, n); badSizeofDiv(an, n); break;
        case 'CallExpr': swappedArgs(an, n); sizeCheck(an, n); badSizeofCall(an, n); break;
        case 'SizeofExpr': badSizeofParam(an, n); break;
        case 'IfStmt': case 'WhileStmt': case 'ForStmt': case 'RangeForStmt':
          straySemicolon(an, n, parent); nestingIndent(an, n, parent); condFunction(an, n); break;
        case 'UnaryExpr': if (n.op === '!') funcAsBool(an, n.arg, n); break;
        case 'InitList': missingComma(an, n); break;
        case 'DeleteExpr': if (an.lang === 'cpp') deleteArrayLocal(an, n); break;
        default: break;
      }
      evalOrderRoot(an, n);
      return undefined;
    });
    unusedValue(an);
    if (an.lang === 'cpp') { copyInsteadOfMove(an); wrapperEscape(an); }
  } finally {
    an.reporting = false;
  }
}

// ---------------------------------------------------------------- UNINTENDED_INTEGER_DIVISION

function intDivision(an, n) {
  if (n.op !== '/' || inMacro(n)) return;
  if (!isIntType(n.left && n.left.ctype) || !isIntType(n.right && n.right.ctype) || !isIntType(n.ctype)) return;
  const ctx = conversionContext(an, n);
  if (!ctx || !isFloatType(ctx.type)) return;
  const d = constInt(an, n.right), q = constInt(an, n.left);
  if (d === 1 || d === -1 || q === 0) return;
  if (d !== null && q !== null && d !== 0 && q % d === 0) return;
  an.report('UNINTENDED_INTEGER_DIVISION', n, {
    en: `Dividing integer expressions ${an.src(n.left, 30)} and ${an.src(n.right, 30)}, then converting the integer quotient to ${typeName(ctx.type)}: the remainder is lost.`,
    ko: `정수식 ${an.src(n.left, 30)}와(과) ${an.src(n.right, 30)}을(를) 나눈 뒤 정수 몫을 ${typeName(ctx.type)}(으)로 변환해 나머지를 잃습니다.`,
  }, [], { tag: 'integer_division' });
}

// ---------------------------------------------------------------- BAD_COMPARE

function funcDesignator(e) {
  e = skip(e);
  if (e && e.type === 'UnaryExpr' && e.op === '&') e = skip(e.arg);
  if (!e || e.type !== 'Identifier' || !e.symbol || e.symbol.kind !== 'function') return null;
  const s = e.symbol;
  // weak symbols may really be null
  for (const d of s.decls || []) if ((d.attributes || []).some((a) => a && /weak/.test(a.name || ''))) return null;
  return s;
}

function badCompare(an, n) {
  if (inMacro(n)) return;
  if (n.op === '==' || n.op === '!=') {
    for (const [a, b] of [[n.left, n.right], [n.right, n.left]]) {
      if (!isNullLit(b)) continue;
      const s = funcDesignator(a);
      if (!s) continue;
      const res = n.op === '==' ? { en: 'false', ko: '거짓' } : { en: 'true', ko: '참' };
      an.report('BAD_COMPARE', n, {
        en: `Comparing the address of function ${s.name} with 0: it is never null, so ${an.src(n, 40)} is always ${res.en}. Did you mean to call ${s.name}()?`,
        ko: `함수 ${s.name}의 주소를 0과 비교합니다. 주소는 널이 아니어서 ${an.src(n, 40)}은(는) 늘 ${res.ko}입니다. ${s.name}()를 호출하려던 것인가요?`,
      }, [], { tag: 'func_conv' });
      return;
    }
    return;
  }
  if (['<', '>', '<=', '>='].includes(n.op)) {
    for (const [a, b] of [[n.left, n.right], [n.right, n.left]]) {
      if (!isNullLit(b)) continue;
      const t = canon(skip(a) && skip(a).ctype);
      if (!t || t.kind !== 'pointer') continue;
      an.report('BAD_COMPARE', n, {
        en: `Comparing pointer ${an.src(a, 30)} with null using ${n.op}: pointers are not ordered relative to null; use == or !=.`,
        ko: `포인터 ${an.src(a, 30)}을(를) ${n.op}(으)로 널과 비교합니다. 포인터는 널과 크기 비교를 할 수 없으니 == 나 != 를 쓰세요.`,
      }, [], { tag: 'ptr_relational_null' });
      return;
    }
  }
}

function funcAsBool(an, e, at) {
  if (inMacro(at)) return;
  const s = funcDesignator(e);
  if (!s) return;
  an.report('BAD_COMPARE', at, {
    en: `Function ${s.name} is used as a truth value: its address is never null, so the test is constant. Did you mean to call ${s.name}()?`,
    ko: `함수 ${s.name}을(를) 참/거짓 값으로 씁니다. 주소는 널이 아니어서 검사 결과가 상수입니다. ${s.name}()를 호출하려던 것인가요?`,
  }, [], { tag: 'func_conv' });
}

function condFunction(an, n) {
  if (n.type === 'RangeForStmt' || !n.cond || n.cond.type === 'Declaration') return;
  const c = skip(n.cond);
  if (c && c.type === 'BinaryExpr' && (c.op === '&&' || c.op === '||')) {
    for (const side of [c.left, c.right]) funcAsBool(an, side, side);
    return;
  }
  funcAsBool(an, n.cond, n.cond);
}

// ---------------------------------------------------------------- SWAPPED_ARGUMENTS

function paramNamesOf(sym) {
  const decls = [sym.definition, ...(sym.decls || [])].filter(Boolean);
  for (const d of decls) {
    const ps = d.params || (d.declarator && cf.directFunction(d.declarator) && cf.directFunction(d.declarator).params);
    if (ps && ps.length && ps.every((p) => p && p.name)) return { names: ps.map((p) => p.name), decl: d };
  }
  return null;
}

function argName(e) {
  e = skipCasts(e);
  if (e && e.type === 'UnaryExpr' && e.op === '&') e = skip(e.arg);
  if (!e) return null;
  if (e.type === 'Identifier') return e.name;
  if (e.type === 'MemberExpr') return e.member;
  return null;
}

function swappedArgs(an, n) {
  if (inMacro(n)) return;
  const s = n.calleeSymbol;
  if (!s || s.kind !== 'function' || s.system) return;
  const args = n.args || [];
  if (args.length < 2) return;
  const pn = paramNamesOf(s);
  if (!pn || pn.names.length < 2) return;
  const names = pn.names;
  const an_ = args.map(argName);
  for (let i = 0; i < args.length && i < names.length; i++) {
    if (!an_[i] || an_[i] === names[i]) continue;
    const j = names.indexOf(an_[i]);
    if (j < 0 || j === i || j >= args.length || an_[j] !== names[i]) continue;
    if (j < i) continue;
    an.report('SWAPPED_ARGUMENTS', n, {
      en: `The arguments ${an_[i]} and ${an_[j]} of ${s.name} appear in the wrong order: parameter ${i + 1} of ${s.name} is named ${names[i]} and parameter ${j + 1} is named ${names[j]}.`,
      ko: `${s.name}의 인자 ${an_[i]}와(과) ${an_[j]}의 순서가 바뀐 것 같습니다. ${s.name}의 ${i + 1}번째 매개변수 이름은 ${names[i]}, ${j + 1}번째는 ${names[j]}입니다.`,
    }, [pn.decl && pn.decl.loc ? an.ev(pn.decl, 'params', `${s.name} is declared with parameters (${names.join(', ')}).`, `${s.name}은(는) 매개변수 (${names.join(', ')})(으)로 선언됩니다.`) : null], { tag: 'swapped_arguments' });
    return;
  }
}

// ---------------------------------------------------------------- EVALUATION_ORDER

// r: reads, w: writes, sw: writes completed by a sequence point inside the expression
// (left of , && || and ?: tests, call arguments): ordered before the expression's value.
const EMPTY = { r: new Map(), w: new Map(), sw: new Map() };

function accKey(e) {
  e = skip(e);
  if (!e) return null;
  if (e.type === 'Identifier') { const s = varSym(e); return s ? { k: `v${s.id}`, name: e.name } : null; }
  if (e.type === 'MemberExpr' && !e.arrow) { const b = accKey(e.object); return b ? { k: `${b.k}.${e.member}`, name: `${b.name}.${e.member}` } : null; }
  if (e.type === 'MemberExpr' && e.arrow) { const b = accKey(e.object); return b ? { k: `${b.k}->${e.member}`, name: `${b.name}->${e.member}` } : null; }
  return null;
}

function merge(...xs) {
  const out = { r: new Map(), w: new Map(), sw: new Map() };
  for (const x of xs) {
    if (!x) continue;
    for (const f of ['r', 'w', 'sw']) for (const [k, v] of x[f] || []) if (!out[f].has(k)) out[f].set(k, v);
  }
  return out;
}

function sequenced(x) {
  const out = merge(x);
  for (const [k, v] of out.w) if (!out.sw.has(k)) out.sw.set(k, v);
  out.w = new Map();
  return out;
}

const R1 = (k, v) => ({ r: new Map([[k, v]]), w: new Map(), sw: new Map() });
const W1 = (k, v) => ({ r: new Map(), w: new Map([[k, v]]), sw: new Map() });

function evalOrderRoot(an, n) {
  let root = null;
  switch (n.type) {
    case 'ExprStmt': root = n.expr; break;
    case 'VarDecl': root = n.init && n.init.type !== 'InitList' ? n.init : null; break;
    case 'ReturnStmt': root = n.arg; break;
    case 'IfStmt': case 'WhileStmt': case 'DoStmt': case 'SwitchStmt': root = n.cond && n.cond.type !== 'Declaration' ? n.cond : null; break;
    case 'ForStmt': if (n.cond && n.cond.type !== 'Declaration') evalOrder(an, n.cond); root = n.inc; break;
    default: return;
  }
  if (root) evalOrder(an, root);
}

function evalOrder(an, root) {
  if (!root || inMacro(root)) return;
  let done = false;
  const cpp = an.lang === 'cpp';
  const conflict = (A, B) => {
    if (done) return;
    for (const [k, wn] of [...A.w, ...A.sw]) {
      const other = B.w.get(k) || B.sw.get(k) || B.r.get(k);
      if (!other) continue;
      done = true;
      const mod = B.w.has(k) || B.sw.has(k);
      const name = wn.name;
      an.report('EVALUATION_ORDER', wn.node, {
        en: `${name} is modified by ${an.src(wn.node, 30)} and ${mod ? 'modified' : 'read'} again by ${an.src(other.node, 30)} in the same expression without a sequence point; the result depends on the evaluation order.`,
        ko: `한 식에서 ${name}을(를) ${an.src(wn.node, 30)}(으)로 수정하면서 순서점 없이 ${an.src(other.node, 30)}에서 다시 ${mod ? '수정' : '읽기'}합니다. 결과가 평가 순서에 따라 달라집니다.`,
      }, [an.ev(other.node, mod ? 'write' : 'read', `${name} is ${mod ? 'modified' : 'read'} here.`, `여기서 ${name}을(를) ${mod ? '수정' : '읽기'}합니다.`)], { tag: 'evaluation_order' });
      return;
    }
  };
  const check = (A, B) => { conflict(A, B); conflict(B, A); };
  // reads/writes of the sub-expressions that compute the location of an lvalue (not the target itself)
  const loc = (e) => {
    e = skip(e);
    if (!e) return EMPTY;
    if (e.type === 'Identifier') return EMPTY;
    if (e.type === 'MemberExpr') return e.arrow ? acc(e.object) : loc(e.object);
    if (e.type === 'IndexExpr') { const a = acc(e.object), b = acc(e.index); check(a, b); return merge(a, b); }
    if (e.type === 'UnaryExpr' && e.op === '*') return acc(e.arg);
    return acc(e);
  };
  const acc = (e) => {
    if (!e || done) return EMPTY;
    e = skip(e);
    if (!e) return EMPTY;
    switch (e.type) {
      case 'Identifier': {
        const k = accKey(e);
        if (!k) return EMPTY;
        return R1(k.k, { node: e, name: k.name });
      }
      case 'MemberExpr': {
        const k = accKey(e);
        const base = e.arrow ? acc(e.object) : EMPTY;
        if (!k) return e.arrow ? base : acc(e.object);
        return merge(base, R1(k.k, { node: e, name: k.name }));
      }
      case 'UnaryExpr': {
        if (e.op === '++' || e.op === '--') {
          const k = accKey(e.arg);
          const sub = loc(e.arg);
          if (!k) return merge(sub, acc(e.arg));
          return merge(sub, W1(k.k, { node: e, name: k.name }));
        }
        if (e.op === '&') return loc(e.arg);
        return acc(e.arg);
      }
      case 'AssignExpr': {
        const k = accKey(e.left);
        const L = k ? loc(e.left) : acc(e.left);
        const R = acc(e.right);
        if (k && R.w.has(k.k)) {
          check(W1(k.k, { node: e, name: k.name }), W1(k.k, R.w.get(k.k)));
        }
        check(L, R);
        const out = merge(L, R);
        if (k) out.w.set(k.k, { node: e, name: k.name });
        return out;
      }
      case 'BinaryExpr': {
        const A = acc(e.left), B = acc(e.right);
        if (e.op === '&&' || e.op === '||' || e.op === ',') return merge(sequenced(A), B);
        if (!(cpp && (e.op === '<<' || e.op === '>>'))) check(A, B);
        return merge(A, B);
      }
      case 'ConditionalExpr':
        return merge(sequenced(acc(e.test)), acc(e.consequent), acc(e.alternate));
      case 'CallExpr': {
        const parts = [acc(e.callee), ...(e.args || []).map((a) => acc(a))];
        for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) check(parts[i], parts[j]);
        return sequenced(merge(...parts));
      }
      case 'IndexExpr': {
        const A = acc(e.object), B = acc(e.index);
        check(A, B);
        return merge(A, B);
      }
      case 'CastExpr': return e.arg ? acc(e.arg) : merge(...(e.args || []).map((a) => acc(a)));
      case 'SizeofExpr': case 'AlignofExpr': case 'LambdaExpr': case 'StmtExpr': case 'TypeidExpr': case 'NoexceptExpr':
        return EMPTY;
      default: {
        const parts = [];
        for (const c of cf.childrenOf(e)) if (c && typeof c === 'object' && c.type) parts.push(acc(c));
        return merge(...parts);
      }
    }
  };
  acc(root);
}

// ---------------------------------------------------------------- NESTING_INDENT_MISMATCH / STRAY_SEMICOLON

function nextSibling(n, parent) {
  if (!parent || parent.type !== 'CompoundStmt') return null;
  const i = parent.body.indexOf(n);
  return i >= 0 ? parent.body[i + 1] || null : null;
}

function headEndLine(n) {
  if (n.type === 'RangeForStmt') return n.range && n.range.loc ? n.range.loc.endLine : n.loc.line;
  if (n.type === 'ForStmt') { const x = n.inc || n.cond || n.init; return x && x.loc ? x.loc.endLine : n.loc.line; }
  return n.cond && n.cond.loc ? n.cond.loc.endLine : n.loc.line;
}

function nestingIndent(an, n, parent) {
  if (inMacro(n)) return;
  if (n.type === 'IfStmt' && n.else) return;
  const body = n.type === 'IfStmt' ? n.then : n.body;
  if (!body || !body.loc || inMacro(body) || ['CompoundStmt', 'NullStmt'].includes(body.type)) return;
  const next = nextSibling(n, parent);
  if (!next || !next.loc || inMacro(next) || ['CaseStmt', 'DefaultStmt', 'LabelStmt', 'NullStmt'].includes(next.type)) return;
  if (body.loc.line !== headEndLine(n) + 1) return;
  if (next.loc.line !== body.loc.endLine + 1) return;
  const ic = indentOf(an, n.loc.line), ib = indentOf(an, body.loc.line), inx = indentOf(an, next.loc.line);
  if (ic === null || ib === null || inx === null) return;
  // both statements must start their lines
  if (next.loc.col !== inx.length + 1 || body.loc.col !== ib.length + 1) return;
  if (inx !== ib || ib.length <= ic.length || !ib.startsWith(ic)) return;
  const kw = { IfStmt: 'if', WhileStmt: 'while', ForStmt: 'for', RangeForStmt: 'for' }[n.type];
  an.report('NESTING_INDENT_MISMATCH', next, {
    en: `This statement is indented as if it were part of the body of the ${kw} on line ${n.loc.line}, but without braces only ${an.src(body, 30)} is in the body.`,
    ko: `이 문장은 ${n.loc.line}행 ${kw}의 본문인 것처럼 들여 썼지만 중괄호가 없어 ${an.src(body, 30)}만 본문입니다.`,
  }, [an.ev(body, 'nesting_indent', `Only this statement is controlled by the ${kw}.`, `${kw}이(가) 제어하는 문장은 이것뿐입니다.`)], { tag: 'nesting_indent_mismatch' });
}

function straySemicolon(an, n, parent) {
  if (inMacro(n)) return;
  if (n.type === 'IfStmt' && n.else) return;
  const body = n.type === 'IfStmt' ? n.then : n.body;
  if (!body || body.type !== 'NullStmt' || inMacro(body) || (body.attributes && body.attributes.length) || !body.loc) return;
  if (body.loc.line !== headEndLine(n)) return;
  const next = nextSibling(n, parent);
  if (!next || !next.loc || inMacro(next)) return;
  let follows = next.type === 'CompoundStmt' && next.loc.line <= body.loc.line + 1;
  if (!follows && next.loc.line === body.loc.line + 1) {
    const ic = indentOf(an, n.loc.line), inx = indentOf(an, next.loc.line);
    follows = ic !== null && inx !== null && inx.length > ic.length && inx.startsWith(ic) && next.loc.col === inx.length + 1;
  }
  if (!follows) return;
  const kw = { IfStmt: 'if', WhileStmt: 'while', ForStmt: 'for', RangeForStmt: 'for' }[n.type];
  an.report('STRAY_SEMICOLON', body, {
    en: `The semicolon after ${kw} (...) is an empty body, so the ${next.type === 'CompoundStmt' ? 'block' : 'statement'} on line ${next.loc.line} is not controlled by the ${kw}.`,
    ko: `${kw} (...) 뒤의 세미콜론이 빈 본문이 되어 ${next.loc.line}행의 ${next.type === 'CompoundStmt' ? '블록' : '문장'}은 ${kw}의 제어를 받지 않습니다.`,
  }, [an.ev(next, 'stray_semicolon', `This ${next.type === 'CompoundStmt' ? 'block' : 'statement'} looks like the body.`, `이 ${next.type === 'CompoundStmt' ? '블록' : '문장'}이 본문처럼 보입니다.`)], { tag: 'stray_semicolon' });
}

// ---------------------------------------------------------------- MISSING_COMMA

function missingComma(an, n) {
  if (inMacro(n)) return;
  const items = n.items || [];
  if (items.length < 2) return;
  const strs = items.map((x) => skip(x)).filter((x) => x && x.type === 'StringLiteral');
  if (strs.length !== items.length || strs.length < 2) return;
  const multi = strs.filter((s) => (s.parts || []).length >= 2 && !inMacro(s));
  if (!multi.length || multi.length * 3 > strs.length) return;
  // a declared size equal to the number of items means the concatenation is intended
  const p = cf.parentOf(n);
  const dt = p && p.type === 'VarDecl' && canon(p.ctype);
  if (dt && dt.kind === 'array' && dt.size != null && dt.size === items.length && p.declarator && !/\[\s*\]/.test(an.src(p.declarator, 200))) return;
  const sameLine = items.every((x) => x.loc && x.loc.line === items[0].loc.line);
  const ownLines = new Set(items.map((x) => x.loc && x.loc.line)).size === items.length;
  for (const s of multi) {
    const first = s.parts[0];
    if (/(\s|\\n|[:,;.])"?$/.test(first)) continue; // sentence continued on the next part
    const spans = s.loc.endLine > s.loc.line;
    if (spans ? !ownLines : !sameLine) continue;
    const pieces = s.parts.map((x) => x.replace(/^[a-zA-Z0-9]*"|"$/g, ''));
    an.report('MISSING_COMMA', s, {
      en: `The adjacent string literals ${s.parts.slice(0, 2).join(' ')} are concatenated into one element of the initializer list; a comma is probably missing.`,
      ko: `붙어 있는 문자열 리터럴 ${s.parts.slice(0, 2).join(' ')}이(가) 초기화 목록의 한 원소로 합쳐집니다. 쉼표가 빠졌을 것입니다.`,
    }, [an.ev(s, 'concatenation', `"${pieces.join('')}" is one element.`, `"${pieces.join('')}"이(가) 한 원소입니다.`)], { tag: 'missing_comma' });
  }
}

// ---------------------------------------------------------------- SIZECHECK

const ALLOCS = { malloc: [0], calloc: [0, 1], realloc: [1], alloca: [0], kmalloc: [0], xmalloc: [0], g_malloc: [0] };

function calleeBare(call) {
  const c = skip(call.callee);
  return c && c.type === 'Identifier' ? c.name : '';
}

function allocDest(call) {
  let parent = cf.parentOf(call), cur = call;
  while (parent && (parent.type === 'ParenExpr' || parent.type === 'CastExpr')) { cur = parent; parent = cf.parentOf(parent); }
  if (parent && parent.type === 'AssignExpr' && parent.right === cur && parent.op === '=') return { type: parent.left.ctype, node: parent.left };
  if (parent && parent.type === 'VarDecl' && parent.init === cur) return { type: parent.ctype, node: parent };
  return null;
}

function hasFlexibleTail(rec) {
  const fs = rec.fields || [];
  const last = fs[fs.length - 1];
  const lt = last && canon(last.type);
  return !!lt && lt.kind === 'array' && (lt.size == null || lt.size <= 1);
}

function sizeCheck(an, call) {
  if (inMacro(call)) return;
  const name = calleeBare(call);
  const idx = ALLOCS[name];
  if (!idx) return;
  const args = call.args || [];
  if (args.length <= Math.max(...idx)) return;
  const dest = allocDest(call);
  const dt = dest && canon(dest.type);
  if (!dt || dt.kind !== 'pointer') return;
  const pointee = canon(dt.to);
  if (!pointee || pointee.kind === 'void' || T.isCharType(pointee) || pointee.kind === 'unknown') return;
  if (T.isRecord(pointee) && hasFlexibleTail(pointee)) return;
  let es = null;
  try { es = T.sizeOf(pointee, an.target); } catch { es = null; }
  if (!es || es <= 1) return;
  let total = 1;
  for (const i of idx) {
    const v = constInt(an, args[i]);
    if (v === null) return;
    total *= v;
  }
  if (total <= 0 || total % es === 0) return;
  const what = total < es
    ? { en: `smaller than one ${typeName(pointee)} (${es} bytes)`, ko: `${typeName(pointee)} 하나(${es}바이트)보다 작습니다` }
    : { en: `not a multiple of the size of ${typeName(pointee)} (${es} bytes)`, ko: `${typeName(pointee)} 크기(${es}바이트)의 배수가 아닙니다` };
  const dname = dest.node.type === 'VarDecl' ? dest.node.name : an.src(dest.node, 30);
  an.report('SIZECHECK', call, {
    en: `${name} allocates ${total} bytes for ${dname} of type ${typeName(dt)}, which is ${what.en}.`,
    ko: `${name}이(가) ${typeName(dt)} 타입 ${dname}에 ${total}바이트를 할당하는데, ${what.ko}.`,
  }, [], { tag: 'size_error' });
}

// ---------------------------------------------------------------- BAD_SIZEOF

function sizeofSym(s) {
  if (!s || s.typeName) return null;
  const a = skip(s.arg);
  return a && a.type === 'Identifier' && a.symbol ? a : null;
}

function isArrayParam(sym) {
  if (!sym || sym.kind !== 'parameter') return false;
  for (const d of sym.decls || []) {
    if (d.type !== 'ParamDecl') continue;
    const dt = d.declaredType && T.canonical(d.declaredType);
    if (dt && dt.kind === 'array') return true;
    let x = d.declarator;
    while (x && x.type !== 'ArrayDeclarator' && x.inner && x.type !== 'PointerDeclarator') x = x.inner;
    if (x && x.type === 'ArrayDeclarator') return true;
  }
  return false;
}

function badSizeofParam(an, s) {
  if (inMacro(s)) return;
  const id = sizeofSym(s);
  if (!id || !isArrayParam(id.symbol)) return;
  an.report('BAD_SIZEOF', s, {
    en: `${an.src(s, 30)} is the size of a pointer: the array parameter ${id.name} is adjusted to a pointer, so its size is not the size of the caller's array.`,
    ko: `${an.src(s, 30)}은(는) 포인터의 크기입니다. 배열 매개변수 ${id.name}은(는) 포인터로 바뀌어 호출자 배열의 크기가 아닙니다.`,
  }, [], { tag: 'bad_sizeof' });
}

function ptrSym(id) {
  if (!id || !id.symbol) return null;
  const t = canon(id.symbol.type);
  return t && t.kind === 'pointer' ? t : null;
}

function badSizeofDiv(an, n) {
  if (n.op !== '/' || inMacro(n)) return;
  const l = skip(n.left), r = skip(n.right);
  if (!l || !r || l.type !== 'SizeofExpr' || r.type !== 'SizeofExpr') return;
  const id = sizeofSym(l);
  if (!id || !ptrSym(id) || isArrayParam(id.symbol)) return;
  const ra = skip(r.arg);
  const same = ra && ((ra.type === 'IndexExpr' && varSym(ra.object) === id.symbol) || (ra.type === 'UnaryExpr' && ra.op === '*' && varSym(ra.arg) === id.symbol));
  if (!same) return;
  an.report('BAD_SIZEOF', n, {
    en: `${an.src(n, 40)} does not count elements: ${id.name} is a pointer, so ${an.src(l, 20)} is the size of the pointer.`,
    ko: `${an.src(n, 40)}은(는) 원소 개수가 아닙니다. ${id.name}이(가) 포인터여서 ${an.src(l, 20)}은(는) 포인터의 크기입니다.`,
  }, [], { tag: 'bad_sizeof' });
}

// (function, buffer argument index, size argument index)
const SIZED = {
  strncpy: [0, 2], strncat: [0, 2], snprintf: [0, 1], vsnprintf: [0, 1], fgets: [0, 1], read: [1, 2], recv: [1, 2],
  fread: [0, 1], memcpy: [1, 2], memmove: [1, 2], memcmp: [1, 2], strncmp: [0, 2], getcwd: [0, 1], gethostname: [0, 1], readlink: [1, 2],
};

function badSizeofCall(an, call) {
  if (inMacro(call)) return;
  const name = calleeBare(call);
  const spec = SIZED[name];
  if (!spec) return;
  const args = call.args || [];
  const buf = skipCasts(args[spec[0]]);
  const size = skip(args[spec[1]]);
  if (!buf || !size || size.type !== 'SizeofExpr' || buf.type !== 'Identifier' || !buf.symbol) return;
  const id = sizeofSym(size);
  if (!id || id.symbol !== buf.symbol || isArrayParam(id.symbol)) return;
  const pt = ptrSym(id);
  if (!pt) return;
  const to = canon(pt.to);
  if (to && to.kind === 'pointer') return;
  an.report('BAD_SIZEOF', size, {
    en: `${an.src(size, 30)} passed to ${name} is the size of the pointer ${id.name}, not of the buffer it points to.`,
    ko: `${name}에 넘긴 ${an.src(size, 30)}은(는) ${id.name}이(가) 가리키는 버퍼가 아니라 포인터 자체의 크기입니다.`,
  }, [], { tag: 'bad_sizeof' });
}

// ---------------------------------------------------------------- DELETE_ARRAY (locals)

function newKind(e) {
  e = skipCasts(e);
  if (!e || e.type !== 'NewExpr' || (e.placement && e.placement.length)) return null;
  return { array: !!e.isArray, node: e };
}

function deleteArrayLocal(an, n) {
  const s = varSym(n.arg);
  if (!s || !isLocalSym(s) || s.kind === 'parameter') return;
  const allocs = [];
  let other = false;
  cf.walk(an.fn.body, (m) => {
    if (m.type === 'VarDecl' && m.symbol === s && m.init) { const k = newKind(m.init); if (k) allocs.push(k); else other = true; }
    if (m.type === 'AssignExpr' && varSym(m.left) === s) { const k = newKind(m.right); if (k) allocs.push(k); else other = true; }
    if (m.type === 'UnaryExpr' && m.op === '&' && varSym(m.arg) === s) other = true;
    return undefined;
  });
  if (other || !allocs.length || !allocs.every((a) => a.array !== !!n.array)) return;
  reportDeleteArray(an, n, s.name, allocs[0].node);
}

function reportDeleteArray(an, n, name, allocNode) {
  const arr = !n.array;
  an.report('DELETE_ARRAY', n, arr ? {
    en: `${name} was allocated with new[] but is released with delete; use delete[].`,
    ko: `${name}을(를) new[]로 할당했는데 delete로 해제합니다. delete[]를 쓰세요.`,
  } : {
    en: `${name} was allocated with new (not new[]) but is released with delete[]; use delete.`,
    ko: `${name}을(를) new[]가 아닌 new로 할당했는데 delete[]로 해제합니다. delete를 쓰세요.`,
  }, [allocNode ? an.ev(allocNode, 'alloc', `${name} is allocated with ${arr ? 'new[]' : 'new'} here.`, `여기서 ${name}을(를) ${arr ? 'new[]' : 'new'}(으)로 할당합니다.`) : null], { tag: 'delete_array' });
}

// ---------------------------------------------------------------- UNUSED_VALUE

// Backward liveness of the function's scalar locals over its CFG. A store
// (assignment or initializer) whose variable is dead right after it is
// reported, except trivial values (literals, NULL), which are defensive.
function unusedValue(an) {
  const fn = an.fn;
  if (an.hasAsm) return;
  const g = an.cfg;
  if (!g || !g.blocks) return;
  const cand = new Map();
  let opaque = false;
  cf.walk(fn.body, (n) => {
    if (n.type === 'CallExpr') {
      const nm = calleeBare(n);
      if (/^(_?setjmp|sigsetjmp|__builtin_setjmp)$/.test(nm)) opaque = true;
    }
    if (n.type === 'GotoStmt' && n.computed) opaque = true;
    return undefined;
  });
  if (opaque) return;
  const trackable = (s) => {
    if (!s || !isLocalSym(s)) return false;
    if (cand.has(s.id)) return cand.get(s.id);
    let ok = true;
    const t = s.type && T.canonical(s.type);
    if (!t || t.kind === 'reference' || t.volatile) ok = false;
    const c = canon(s.type);
    if (ok && !(c && (T.isInteger(c) || T.isFloating(c) || c.kind === 'pointer' || c.kind === 'enum'))) ok = false;
    if (ok && an.addrTaken.has(s.id)) ok = false;
    if (ok && /^(unused|dummy|ignored?|_+)$/i.test(s.name || '')) ok = false;
    if (ok) for (const d of s.decls || []) if ((d.attributes || []).some((a) => a && /unused|maybe_unused/.test(a.name || ''))) ok = false;
    if (ok && s.kind === 'variable' && (s.decls || []).some((d) => d.specs && (d.specs.storage || []).some((x) => x === 'static' || x === 'extern'))) ok = false;
    cand.set(s.id, ok);
    return ok;
  };
  // events of one CFG element in evaluation order: { use: sym } / { def: sym, node }
  const evCache = new Map();
  const events = (item) => {
    if (evCache.has(item)) return evCache.get(item);
    const out = [];
    const visit = (e, lvalue) => {
      e = skip(e);
      if (!e) return;
      switch (e.type) {
        case 'Identifier': { const s = varSym(e); if (s && trackable(s) && !lvalue) out.push({ use: s }); return; }
        case 'AssignExpr': {
          const s = varSym(e.left);
          if (s && trackable(s)) {
            visit(e.right, false);
            if (e.op !== '=') out.push({ use: s });
            out.push({ def: s, node: e, rhs: e.right, op: e.op });
            return;
          }
          visit(e.left, false); visit(e.right, false);
          return;
        }
        case 'UnaryExpr':
          if (e.op === '++' || e.op === '--') { visit(e.arg, false); return; } // read-modify-write: counts as a use
          visit(e.arg, false); return;
        case 'LambdaExpr':
          cf.walk(e, (m) => { if (m.type === 'Identifier') { const s = varSym(m); if (s && trackable(s)) out.push({ use: s }); } return undefined; });
          return;
        case 'SizeofExpr': case 'AlignofExpr':
          cf.walk(e, (m) => { if (m.type === 'Identifier') { const s = varSym(m); if (s && trackable(s)) out.push({ use: s }); } return undefined; });
          return;
        case 'VarDecl': {
          if (e.init) visit(e.init, false);
          if (e.symbol && trackable(e.symbol) && e.init) out.push({ def: e.symbol, node: e, rhs: e.init, op: '=' , init: true });
          return;
        }
        default:
          for (const c of cf.childrenOf(e)) if (c && typeof c === 'object' && c.type) visit(c, false);
      }
    };
    if (item.type === 'ExprStmt') visit(item.expr, false);
    else if (item.type === 'ReturnStmt') visit(item.arg, false);
    else if (item.type === 'Declaration') for (const d of item.declarators || []) visit(d, false);
    else if (['BreakStmt', 'ContinueStmt', 'GotoStmt', 'NullStmt', 'LabelStmt', 'StaticAssert', 'ParamDecl', 'CatchClause'].includes(item.type)) { /* nothing */ }
    else visit(item, false);
    evCache.set(item, out);
    return out;
  };
  const blocks = [...g.blocks];
  const items = new Map(blocks.map((b) => [b, cf.cfg.blockItems(b)]));
  const liveIn = new Map(blocks.map((b) => [b, new Set()]));
  const transfer = (b, out, onDead) => {
    const live = new Set(out);
    const list = items.get(b);
    for (let i = list.length - 1; i >= 0; i--) {
      const evs = events(list[i]);
      for (let j = evs.length - 1; j >= 0; j--) {
        const x = evs[j];
        if (x.def) { if (onDead && !live.has(x.def.id)) onDead(x); live.delete(x.def.id); }
        else live.add(x.use.id);
      }
    }
    return live;
  };
  const outOf = (b) => {
    const s = new Set();
    for (const e of b.succs || []) { const li = liveIn.get(e.to); if (li) for (const x of li) s.add(x); }
    return s;
  };
  let changed = true, rounds = 0;
  while (changed && rounds++ < 200) {
    changed = false;
    for (let k = blocks.length - 1; k >= 0; k--) {
      const b = blocks[k];
      const nin = transfer(b, outOf(b));
      const old = liveIn.get(b);
      if (nin.size !== old.size || [...nin].some((x) => !old.has(x))) { liveIn.set(b, nin); changed = true; }
    }
    if (an.E.spent()) return;
  }
  if (changed) return;
  let reach = null;
  try { reach = g.reachable(); } catch { reach = null; }
  const dead = [];
  for (const b of blocks) {
    if (reach && !reach.has(b)) continue;
    transfer(b, outOf(b), (x) => dead.push({ ...x, block: b }));
  }
  // later stores of each variable, to tell "overwritten" from "never used":
  // only a store the dead one can flow to (on the CFG) overwrites it.
  const defsOf = new Map();
  for (const b of blocks) for (const it of items.get(b)) for (const x of events(it)) if (x.def) {
    if (!defsOf.has(x.def.id)) defsOf.set(x.def.id, []);
    defsOf.get(x.def.id).push({ ...x, block: b });
  }
  const reachMemo = new Map();
  const reachFrom = (b) => {
    if (reachMemo.has(b)) return reachMemo.get(b);
    const seen = new Set();
    const work = (b.succs || []).map((e) => e.to);
    while (work.length) {
      const n = work.pop();
      if (!n || seen.has(n)) continue;
      seen.add(n);
      for (const e of n.succs || []) work.push(e.to);
    }
    reachMemo.set(b, seen);
    return seen;
  };
  const flowsTo = (x, d) => (d.block === x.block && d.node.loc.start > x.node.loc.start) || reachFrom(x.block).has(d.block);
  const reported = new Set();
  for (const x of dead) {
    if (reported.has(x.node) || !x.node.loc || x.node.loc.file !== an.file || inMacro(x.node)) continue;
    if (x.op !== '=') continue;
    const rhs = skip(x.rhs);
    if (!rhs || rhs.type === 'InitList' || isLiteral(rhs) || (rhs.type === 'Identifier' && rhs.symbol && rhs.symbol.kind === 'enumerator')) continue;
    if (rhs.type === 'Identifier' && rhs.symbol && rhs.symbol.kind === 'function') continue;
    // NULL / TRUE macros (also unresolved without their headers) and other constants are defensive values
    if (rhs.loc && rhs.loc.macro && /^(NULL|nullptr|TRUE|FALSE|true|false|EOF)$/.test(rhs.loc.macro)) continue;
    if (rhs.type === 'Identifier' && !rhs.symbol && /^(NULL|TRUE|FALSE)$/.test(rhs.name || '')) continue;
    if (constInt(an, rhs) !== null) continue;
    reported.add(x.node);
    const s = x.def;
    const later = (defsOf.get(s.id) || []).filter((d) => d.node !== x.node && d.node.loc && flowsTo(x, d)).sort((a, b) => a.node.loc.start - b.node.loc.start)[0];
    const fromCall = skipCasts(rhs) && skipCasts(rhs).type === 'CallExpr';
    const what = fromCall ? { en: `the value returned by ${an.src(skipCasts(rhs).callee, 30)}()`, ko: `${an.src(skipCasts(rhs).callee, 30)}()가 반환한 값` } : { en: `value ${an.src(rhs, 30)}`, ko: `값 ${an.src(rhs, 30)}` };
    const msg = later ? {
      en: `Assigning ${what.en} to ${s.name} here, but that stored value is overwritten before it can be used.`,
      ko: `여기서 ${s.name}에 ${what.ko}을(를) 대입하지만 그 값을 쓰기 전에 덮어씁니다.`,
    } : {
      en: `Assigning ${what.en} to ${s.name} here, but that stored value is not used.`,
      ko: `여기서 ${s.name}에 ${what.ko}을(를) 대입하지만 그 값을 쓰지 않습니다.`,
    };
    an.report('UNUSED_VALUE', x.node, msg, [later ? an.ev(later.node, 'overwrite', `${s.name} is overwritten here.`, `여기서 ${s.name}을(를) 덮어씁니다.`) : null], { tag: fromCall ? 'returned_value' : 'assigned_value' });
  }
}

// ---------------------------------------------------------------- COPY_INSTEAD_OF_MOVE

const SINK_MEMBERS = new Set(['push_back', 'push_front', 'push', 'insert', 'emplace_back', 'emplace', 'emplace_front', 'append']);

function loopsAround(n, stop) {
  const out = [];
  for (let p = cf.parentOf(n); p && p !== stop; p = cf.parentOf(p)) {
    if (['ForStmt', 'WhileStmt', 'DoStmt', 'RangeForStmt'].includes(p.type)) out.push(p);
    if (p.type === 'LambdaExpr') return null;
  }
  return out;
}

function contains(a, b) {
  return !!(a && b && a.loc && b.loc && a.loc.file === b.loc.file && a.loc.start <= b.loc.start && b.loc.end <= a.loc.end);
}

function deadAfter(an, sym, use) {
  const decl = (sym.decls || [])[0];
  const loops = loopsAround(use, an.fn.body);
  if (!loops) return false;
  for (const L of loops) if (!contains(L, decl)) return false;
  for (const u of sym.uses || []) {
    if (u === use || !u.loc || u.loc.file !== use.loc.file) continue;
    if (u.loc.start > use.loc.end) return false;
    if (contains(cf.enclosing(u, 'LambdaExpr'), u)) return false;
  }
  return true;
}

function movableLocal(an, e) {
  const id = skip(e);
  if (!id || id.type !== 'Identifier') return null;
  const s = varSym(id);
  if (!s || !isLocalSym(s)) return null;
  const t = s.type && T.canonical(s.type);
  if (!t || t.kind === 'reference' || t.kind === 'pointer' || t.const) return null;
  const text = declTypeText(an.unit, s);
  if ((s.decls || []).some((d) => d.specs && (d.specs.qualifiers || []).includes('const'))) return null;
  if (!expensive(s.type, text)) return null;
  if (an.addrTaken.has(s.id)) return null;
  return { s, id, text };
}

// the parameter has the argument's own type (no converting constructor)
function sameValueType(pt, m) {
  const at = canon(m.s.type);
  if (!at) return false;
  const nm = (x) => String(x || '').replace(/\s+/g, '');
  if (pt.kind === 'unknown') return at.kind === 'unknown' && nm(pt.name) === nm(at.name);
  return at.kind === 'record' && (at === pt || (!!at.decl && at.decl === pt.decl) || at.name === pt.name);
}

function copyInsteadOfMove(an) {
  const report = (m, where, how) => {
    if (inMacro(m.id) || !deadAfter(an, m.s, m.id)) return;
    an.report('COPY_INSTEAD_OF_MOVE', m.id, {
      en: `${m.s.name} (${m.text || typeName(m.s.type)}) is copied ${how.en}, but it is not used afterwards; use std::move(${m.s.name}).`,
      ko: `${m.s.name}(${m.text || typeName(m.s.type)})을(를) ${how.ko} 복사하지만 그 뒤로 쓰지 않습니다. std::move(${m.s.name})를 쓰세요.`,
    }, [an.ev(where, 'copy', `Copying ${m.s.name}.`, `${m.s.name}을(를) 복사합니다.`)], { tag: 'copy_constructor_call' });
  };
  cf.walk(an.fn.body, (n) => {
    if (n.type === 'LambdaExpr') return cf.walk.SKIP;
    if (!n.loc || n.loc.file !== an.file) return undefined;
    if (n.type === 'CallExpr') {
      if (isStdMove(n)) return undefined;
      const mc = methodCall(n);
      if (mc && SINK_MEMBERS.has(mc.member)) {
        for (const a of n.args || []) { const m = movableLocal(an, a); if (m && m.s !== mc.sym) report(m, n, { en: `into ${mc.sym.name}.${mc.member}()`, ko: `${mc.sym.name}.${mc.member}()(으)로` }); }
        return undefined;
      }
      const ft = calleeType(n);
      const s = n.calleeSymbol;
      if (!ft || !s || s.kind !== 'function') return undefined;
      (n.args || []).forEach((a, i) => {
        const pt = ft.params && ft.params[i] && T.canonical(ft.params[i]);
        if (!pt || pt.kind === 'reference' || pt.kind === 'pointer') return;
        if (!(pt.kind === 'record' || pt.kind === 'unknown')) return;
        const m = movableLocal(an, a);
        if (m && !sameValueType(pt, m)) return;
        if (m) report(m, n, { en: `into by-value parameter ${i + 1} of ${s.name}`, ko: `${s.name}의 값 매개변수 ${i + 1}(으)로` });
      });
      return undefined;
    }
    if (n.type === 'VarDecl' && n.init && n.symbol && n.initStyle !== 'brace') {
      const dt = n.ctype && T.canonical(n.ctype);
      if (!dt || dt.kind === 'reference' || dt.kind === 'pointer') return undefined;
      let init = skip(n.init);
      if (init && init.type === 'ParenListInit') init = (init.args || []).length === 1 ? skip(init.args[0]) : null;
      const m = movableLocal(an, init);
      if (m && m.s !== n.symbol && declTypeText(an.unit, n.symbol) === m.text.replace(/^const/, '')) report(m, n, { en: `into ${n.name}`, ko: `${n.name}(으)로` });
      return undefined;
    }
    if (n.type === 'AssignExpr' && n.op === '=') {
      const l = skip(n.left);
      const lt = l && canon(l.ctype);
      if (!lt || !(lt.kind === 'record' || lt.kind === 'unknown')) return undefined;
      const m = movableLocal(an, n.right);
      if (m && varSym(l) !== m.s) report(m, n, { en: `into ${an.src(l, 30)}`, ko: `${an.src(l, 30)}(으)로` });
    }
    return undefined;
  });
}

// ---------------------------------------------------------------- WRAPPER_ESCAPE

const WRAPPED = /^(::)?std::(string|wstring|basic_string|vector|u8string|u16string|u32string)\b/;

function localWrapper(an, e) {
  const mc = methodCall(skipCasts(e));
  if (!mc || !/^(c_str|data)$/.test(mc.member) || mc.arrow) return null;
  const s = mc.sym;
  if (!isLocalSym(s)) return null;
  const t = s.type && T.canonical(s.type);
  if (t && (t.kind === 'reference' || t.kind === 'pointer')) return null;
  if ((s.decls || []).some((d) => d.specs && (d.specs.storage || []).includes('static'))) return null;
  if (!WRAPPED.test(declTypeText(an.unit, s))) return null;
  return mc;
}

function outlives(an, l) {
  l = skip(l);
  if (!l) return null;
  if (l.type === 'Identifier' && l.symbol) {
    const s = l.symbol;
    if (s.kind === 'field') return { en: `member ${l.name}`, ko: `멤버 ${l.name}` };
    if (s.kind === 'variable' && s.storage === 'static') return { en: `${l.name}, which has static storage`, ko: `정적 저장소인 ${l.name}` };
    return null;
  }
  if (l.type === 'MemberExpr') {
    const o = skip(l.object);
    if (o && o.type === 'ThisExpr') return { en: `member ${l.member}`, ko: `멤버 ${l.member}` };
    const b = varSym(o);
    if (l.arrow && b && b.kind === 'parameter') return { en: `${an.src(l, 30)}, reachable by the caller`, ko: `호출자가 접근하는 ${an.src(l, 30)}` };
    if (b && b.kind === 'variable' && b.storage === 'static') return { en: `${an.src(l, 30)}, which has static storage`, ko: `정적 저장소인 ${an.src(l, 30)}` };
    return null;
  }
  if (l.type === 'UnaryExpr' && l.op === '*') {
    const b = varSym(l.arg);
    if (b && b.kind === 'parameter') return { en: `*${b.name}, an out parameter`, ko: `출력 매개변수 *${b.name}` };
  }
  return null;
}

function wrapperEscape(an) {
  cf.walk(an.fn.body, (n) => {
    if (n.type === 'LambdaExpr') return cf.walk.SKIP;
    if (!n.loc || n.loc.file !== an.file || inMacro(n)) return undefined;
    if (n.type === 'ReturnStmt' && n.arg) {
      const mc = localWrapper(an, n.arg);
      const rt = fnRet(an) && T.canonical(fnRet(an));
      if (mc && rt && rt.kind === 'pointer') {
        an.report('WRAPPER_ESCAPE', n, {
          en: `Returning ${mc.sym.name}.${mc.member}(), the internal buffer of local ${mc.sym.name}; it is freed when ${mc.sym.name} is destroyed at the end of ${an.fn.name}.`,
          ko: `지역 ${mc.sym.name}의 내부 버퍼인 ${mc.sym.name}.${mc.member}()를 반환합니다. ${an.fn.name}이(가) 끝나 ${mc.sym.name}이(가) 사라지면 해제됩니다.`,
        }, [an.ev(mc.call, 'wrapper', `${mc.sym.name}.${mc.member}() points into ${mc.sym.name}.`, `${mc.sym.name}.${mc.member}()는 ${mc.sym.name} 안을 가리킵니다.`)], { tag: 'escape' });
      }
    }
    if (n.type === 'AssignExpr' && n.op === '=') {
      const mc = localWrapper(an, n.right);
      if (!mc) return undefined;
      const where = outlives(an, n.left);
      if (!where) return undefined;
      an.report('WRAPPER_ESCAPE', n, {
        en: `Storing ${mc.sym.name}.${mc.member}(), the internal buffer of local ${mc.sym.name}, in ${where.en}; it dangles once ${mc.sym.name} is destroyed.`,
        ko: `지역 ${mc.sym.name}의 내부 버퍼인 ${mc.sym.name}.${mc.member}()를 ${where.ko}에 저장합니다. ${mc.sym.name}이(가) 사라지면 댕글링 포인터가 됩니다.`,
      }, [an.ev(mc.call, 'wrapper', `${mc.sym.name}.${mc.member}() points into ${mc.sym.name}.`, `${mc.sym.name}.${mc.member}()는 ${mc.sym.name} 안을 가리킵니다.`)], { tag: 'escape' });
    }
    return undefined;
  });
}

// ---------------------------------------------------------------- class facts (DELETE_ARRAY on members, CTOR_DTOR_LEAK)

const ALLOC_FNS = new Set(['malloc', 'calloc', 'realloc', 'strdup', 'strndup']);

function fieldOf(e) {
  e = skip(e);
  if (!e) return null;
  if (e.type === 'Identifier' && e.symbol && e.symbol.kind === 'field') return e.name;
  if (e.type === 'MemberExpr' && skip(e.object) && skip(e.object).type === 'ThisExpr') return e.member;
  return null;
}

function allocKindOf(e) {
  const x = skipCasts(e);
  if (!x) return null;
  if (x.type === 'NewExpr' && !(x.placement && x.placement.length)) return x.isArray ? 'new[]' : 'new';
  if (x.type === 'CallExpr' && ALLOC_FNS.has(calleeBare(x))) return 'malloc';
  return null;
}

function classKey(an) {
  const fn = an.fn;
  const rec = fn.symbol && fn.symbol.record;
  let t = rec && (rec.kind === 'record' ? rec : canon(rec.ctype || rec.type));
  if (t && t.kind !== 'record') t = null;
  if (t) return (t.decl && t.decl.symbol && t.decl.symbol.qname) || t.name || null;
  const q = fn.qname || '';
  const i = q.lastIndexOf('::');
  return i > 0 ? q.slice(0, i) : null;
}

// Per-method facts collected after each function (index.js reports).
function classFacts(an) {
  if (an.lang !== 'cpp' || !an.fn.body) return null;
  const key = classKey(an);
  if (!key) return null;
  const fn = an.fn;
  const facts = { key, an, ctor: !!fn.isConstructor, dtor: !!(fn.isDestructor || (fn.name || '').startsWith('~')), allocs: [], deletes: [], released: new Set(), used: new Set(), memberCalls: false };
  for (const ci of fn.ctorInits || []) {
    const k = allocKindOf((ci.args || [])[0]);
    if (k && ci.field && canon(ci.field.type) && canon(ci.field.type).kind === 'pointer') facts.allocs.push({ field: ci.name, kind: k, node: ci.args[0] });
  }
  cf.walk(fn.body, (n) => {
    if (n.type === 'LambdaExpr') return cf.walk.SKIP;
    if (n.type === 'AssignExpr' && n.op === '=') {
      const f = fieldOf(n.left);
      const k = f && allocKindOf(n.right);
      if (k && canon(n.left.ctype) && canon(n.left.ctype).kind === 'pointer') facts.allocs.push({ field: f, kind: k, node: n });
      else if (f) facts.used.add(f);
      const r = fieldOf(n.right);
      if (r) facts.released.add(r); // copied elsewhere: ownership may move
    } else if (n.type === 'DeleteExpr') {
      const f = fieldOf(n.arg);
      if (f) { facts.deletes.push({ field: f, array: !!n.array, node: n }); facts.released.add(f); }
    } else if (n.type === 'CallExpr') {
      const c = skip(n.callee);
      const s = n.calleeSymbol;
      if ((s && s.member) || (c && c.type === 'MemberExpr' && skip(c.object) && skip(c.object).type === 'ThisExpr')) facts.memberCalls = true;
      for (const a of n.args || []) { const f = fieldOf(a); if (f) facts.released.add(f); }
    } else if (n.type === 'ReturnStmt') {
      const f = fieldOf(n.arg);
      if (f) facts.released.add(f);
    } else if (n.type === 'UnaryExpr' && n.op === '&') {
      const f = fieldOf(n.arg);
      if (f) facts.released.add(f);
    } else if (n.type === 'VarDecl' && n.init) {
      const f = fieldOf(n.init);
      if (f) facts.released.add(f);
    }
    return undefined;
  });
  return facts;
}

module.exports = { runSyntax2, conversionContext, classFacts, reportDeleteArray, missingComma, isIntType, typeName, HOW, skipCasts };
