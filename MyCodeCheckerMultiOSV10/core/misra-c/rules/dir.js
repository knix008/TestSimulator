'use strict';

// MISRA C:2012 / 2023 directives (Dir 1.1 - Dir 5.3). Most directives are not
// fully decidable from source; these checks are documented approximations.

const U = require('../lib/a-util');
const { cf, T, meta, msg } = U;

const nameOf = (c) => U.callName(c);
const libCalls = (unit, names) => U.nodes(unit, 'CallExpr').filter((c) => names.has(nameOf(c)) && U.isLibraryCall(c));
const D = (id, o) => meta(id, { dir: true, dec: false, ...o });

// ------------------------------------------------------------------ Dir 2.1

const SEMA = new Set(['redefinition', 'conflicting-types', 'linkage-conflict', 'typedef-redefinition', 'duplicate-label', 'undeclared-label',
  'no-member', 'static-assert-failed', 'array-size-negative', 'redeclaration']);
function d21(unit, api) {
  for (const d of unit.diagnostics || []) {
    if (d.severity !== 'error' || U.isBuiltin(d.file) || SEMA.has(d.code) || /internal|too-deep/.test(d.code)) continue;
    api.report(d, msg(`Compilation error (${d.code}): ${d.message}`, `컴파일 오류(${d.code}): ${d.message}`));
  }
}

// ------------------------------------------------------------------ Dir 4.2 / 4.3 (assembly)

function asmNodes(unit) { return U.nodes(unit, 'AsmStmt', 'AsmDecl'); }

function d42(unit, api) {
  const byFile = new Map();
  for (const c of unit.comments || []) {
    let s = byFile.get(c.file);
    if (!s) byFile.set(c.file, (s = new Set()));
    for (let l = c.line; l <= (c.endLine || c.line); l++) s.add(l);
  }
  for (const a of asmNodes(unit)) {
    const s = byFile.get(a.loc.file) || new Set();
    const l = a.loc.line;
    if (s.has(l) || s.has(l - 1) || s.has(l - 2)) continue;
    api.report(a, msg('Assembly language is used without an explaining comment next to it.', '어셈블리 언어를 사용하지만 옆에 설명 주석이 없습니다.'));
  }
}

function d43(unit, api) {
  for (const a of U.nodes(unit, 'AsmStmt')) {
    if (a.loc.macro) continue;
    const fn = U.enclosingFn(a);
    if (!fn || !fn.body) continue;
    let other = 0;
    cf.walk(fn.body, (n) => {
      if (n === fn.body) return undefined;
      if (n.type === 'CompoundStmt') return undefined;
      if (/Stmt$/.test(n.type) && !['AsmStmt', 'NullStmt'].includes(n.type) && !(n.type === 'ReturnStmt' && !n.arg)) { other++; return cf.walk.SKIP; }
      if (n.type === 'Declaration') { other++; return cf.walk.SKIP; }
      return cf.walk.SKIP;
    });
    if (!other) continue;
    api.report(a, msg(`Assembly language in '${fn.name}' is mixed with C code; put it in its own function or macro.`, `'${fn.name}'에서 어셈블리가 C 코드와 섞여 있습니다. 별도 함수나 매크로로 분리하세요.`));
  }
}

// ------------------------------------------------------------------ Dir 4.4 (commented-out code)

function codeLike(line) {
  const l = line.trim().replace(/^\*+\s?/, '').trim();
  if (!l) return null;
  if (/^#\s*(include|define|if|ifdef|ifndef|endif|else|elif|undef|pragma)\b/.test(l)) return true;
  if (/^[{}]\s*;?$/.test(l)) return true;
  if (/^(if|while|for|switch)\s*\(.*\)\s*\{?$/.test(l)) return true;
  if (/^(else(\s+if\s*\(.*\))?\s*\{?|return\b[^.]*;|break\s*;|continue\s*;|goto\s+\w+\s*;)$/.test(l)) return true;
  if (/;$/.test(l) && /(\w\s*=[^=]|\w\s*\(.*\)|\]\s*=|\+\+|--|->)/.test(l) && !/[.!?:]\s+[A-Za-z]/.test(l.replace(/->/g, ''))) return true;
  if (/^[A-Za-z_][\w\s*]*\s[A-Za-z_]\w*\s*\([^)]*\)\s*\{$/.test(l)) return true;
  return false;
}

function d44(unit, api) {
  for (const [file] of U.userSources(unit)) {
    if (!U.firstScan(api, 'dir-4.4', file)) continue;
    for (const c of unit.comments || []) {
      if (c.file !== file) continue;
      let body = c.value || '';
      body = c.style === 'block' ? body.slice(2, body.endsWith('*/') ? -2 : undefined) : body.slice(2);
      if (/[@\\]code\b|```/.test(body)) continue;
      const lines = body.split(/\r?\n/);
      let code = 0, prose = 0;
      for (const ln of lines) {
        const k = codeLike(ln);
        if (k === true) code++;
        else if (k === false) prose++;
      }
      if (!code || code < prose) continue;
      // a documentation comment (/** */, /*! */, ///, //!) that also has prose, or a
      // comment that announces a usage example, shows code instead of disabling it
      const doc = /^\/(\*\*(?!\/)|\*!|\/\/|\/!)/.test(c.value || '');
      if ((doc && prose > 0) || /\b(usage|examples?|e\.g\.)\s*:/i.test(body)) continue;
      api.report(c, msg('This comment appears to contain commented-out code.', '이 주석에 주석 처리된 코드가 있는 것으로 보입니다.'));
    }
  }
}

// ------------------------------------------------------------------ Dir 4.5 (typographically ambiguous identifiers)

function norm(n) {
  return n.toLowerCase().replace(/_/g, '').replace(/rn/g, 'm').replace(/[il]/g, '1').replace(/o/g, '0').replace(/s/g, '5').replace(/z/g, '2').replace(/b/g, '8').replace(/h/g, 'n');
}
function within(a, b) {
  for (let s = b; s; s = s.parent) if (s === a) return true;
  return false;
}
function d45(unit, api) {
  const groups = new Map();
  for (const s of unit.symbols) {
    if (!U.isUserSym(s) || !s.name || !s.scope || s.scope.kind === 'prototype' || s.name === '__func__') continue;
    const ns = s.kind === 'tag' ? 'tag' : s.kind === 'label' ? 'label' : s.kind === 'field' ? `m${s.scope.node && s.scope.node.loc ? U.locKey(s.scope.node.loc) : ''}` : 'o';
    const k = `${ns}|${norm(s.name)}`;
    let a = groups.get(k);
    if (!a) groups.set(k, (a = []));
    if (!a.some((x) => x.name === s.name && x.scope === s.scope)) a.push(s);
  }
  for (const a of groups.values()) {
    if (a.length < 2) continue;
    for (let i = 0; i < a.length; i++) {
      for (let j = 0; j < i; j++) {
        const x = a[j], y = a[i];
        if (x.name === y.name) continue;
        if (!within(x.scope, y.scope) && !within(y.scope, x.scope)) continue;
        api.report(U.symLoc(y), msg(
          `Identifier '${y.name}' looks typographically like '${x.name}' (${U.symLoc(x) ? U.symLoc(x).line : '?'}).`,
          `식별자 '${y.name}'가 '${x.name}'(${U.symLoc(x) ? U.symLoc(x).line : '?'}줄)와 글자 모양이 헷갈립니다.`));
        break;
      }
    }
  }
}

// ------------------------------------------------------------------ Dir 4.6 (basic numerical types)

const NUMERIC_WORDS = new Set(['short', 'int', 'long', 'signed', 'unsigned', 'float', 'double']);
function basicNumeric(spec) {
  const t = spec && spec.typeSpec;
  if (!t || t.type !== 'BuiltinType') return null;
  const n = t.names || [];
  if (n.some((x) => NUMERIC_WORDS.has(x))) return n.join(' ');
  return null;
}
function d46(unit, api) {
  const say = (where, txt, name) => api.report(where, msg(
    `Basic numerical type '${txt}' is used for '${name}'; use a typedef that shows size and signedness (e.g. int32_t).`,
    `'${name}'에 기본 수치 타입 '${txt}'를 사용합니다. 크기와 부호를 나타내는 typedef(예: int32_t)를 쓰세요.`));
  for (const d of U.nodes(unit, 'Declaration')) {
    const sp = d.specs;
    if (!sp || (sp.storage || []).includes('typedef')) continue;
    const txt = basicNumeric(sp);
    if (!txt) continue;
    const decls = (d.declarators || []).filter((x) => !(x.type === 'FieldDecl' && x.bitWidth) && !(x.type === 'FunctionDecl' && x.name === 'main'));
    if (!decls.length) continue;
    say(sp.typeSpec, txt, decls.map((x) => x.name).filter(Boolean).join(', ') || '?');
  }
  for (const p of U.nodes(unit, 'ParamDecl')) {
    const txt = basicNumeric(p.specs);
    if (!txt) continue;
    const fn = cf.enclosing(p, 'FunctionDecl');
    if (fn && fn.name === 'main') continue;
    say(p.specs.typeSpec, txt, p.name || '<parameter>');
  }
}

// ------------------------------------------------------------------ Dir 4.7 (error information tested)

const ERROR_FUNCS = new Set(['fopen', 'freopen', 'fclose', 'fflush', 'fgetc', 'fgets', 'fputc', 'fputs', 'fread', 'fwrite', 'fseek', 'ftell',
  'fgetpos', 'fsetpos', 'remove', 'rename', 'tmpfile', 'setvbuf', 'malloc', 'calloc', 'realloc', 'aligned_alloc', 'strtol', 'strtoul',
  'strtoll', 'strtoull', 'strtod', 'strtof', 'strtold', 'atexit', 'signal', 'raise', 'mktime', 'scanf', 'fscanf', 'sscanf', 'thrd_create',
  'mtx_init', 'cnd_init', 'pthread_create', 'setlocale', 'getenv', 'mbstowcs', 'wcstombs', 'ungetc', 'getchar', 'getc']);

function testedLater(fn, sym, after) {
  for (const u of sym.uses || []) {
    if (!u.loc || u.loc.start <= after) continue;
    if (U.enclosingFn(u) !== fn) continue;
    for (let n = u, p = cf.parentOf(u); p; n = p, p = cf.parentOf(p)) {
      const k = cf.parentKey(n);
      if (p.type === 'ParenExpr') continue;
      if (p.type === 'BinaryExpr' && ['==', '!=', '<', '>', '<=', '>=', '&&', '||'].includes(p.op)) return true;
      if (p.type === 'UnaryExpr' && p.op === '!') return true;
      if ((p.type === 'IfStmt' || p.type === 'WhileStmt' || p.type === 'DoStmt' || p.type === 'SwitchStmt' || p.type === 'ForStmt') && k === 'cond') return true;
      if (p.type === 'ConditionalExpr' && k === 'test') return true;
      if (p.type === 'ReturnStmt') return true;
      if (p.type === 'CallExpr' && k !== 'callee' && !U.isLibraryCall(p)) return true;
      break;
    }
  }
  return false;
}

function d47(unit, api) {
  for (const c of libCalls(unit, ERROR_FUNCS)) {
    const fn = U.enclosingFn(c);
    if (!fn) continue;
    let n = c, p = cf.parentOf(c);
    while (p && p.type === 'ParenExpr') { n = p; p = cf.parentOf(p); }
    let bad = false;
    if (p && p.type === 'ExprStmt') bad = true;
    else if (p && p.type === 'CastExpr' && U.canon(p.typeName && p.typeName.ctype) && U.canon(p.typeName.ctype).kind === 'void') bad = true;
    else if (p && p.type === 'AssignExpr' && cf.parentKey(n) === 'right') {
      const t = U.skip(p.left);
      if (t && t.type === 'Identifier' && t.symbol && t.symbol.storage === 'automatic') bad = !testedLater(fn, t.symbol, c.loc.end);
    } else if (p && p.type === 'VarDecl' && p.symbol && p.symbol.storage === 'automatic') bad = !testedLater(fn, p.symbol, c.loc.end);
    if (!bad) continue;
    api.report(c, msg(`The error information returned by '${nameOf(c)}' is not tested.`, `'${nameOf(c)}'가 반환하는 오류 정보를 검사하지 않습니다.`));
  }
}

// ------------------------------------------------------------------ Dir 4.8 (opaque types)

function d48(project, api) {
  const recs = new Map();
  const needs = new Set();
  const idOf = (t) => {
    const c = U.canon(t);
    if (!c || c.kind !== 'record' || !c.decl || !c.decl.loc) return null;
    return U.locKey(c.decl.loc);
  };
  for (const u of project.units) {
    for (const r of U.nodes(u, 'RecordDecl')) {
      if (r.isDefinition && r.name && cf.isHeader(r.loc.file) && !U.isBuiltin(r.loc.file)) recs.set(U.locKey(r.loc), r);
    }
    for (const m of U.nodes(u, 'MemberExpr')) {
      let t = m.object && m.object.ctype;
      if (m.arrow) t = U.pointee(t && T.decay(t));
      const id = idOf(t);
      if (id) needs.add(id);
    }
    for (const n of U.nodes(u, 'VarDecl', 'FieldDecl', 'ParamDecl', 'CompoundLiteral', 'SizeofExpr', 'TypeName')) {
      let t = n.type === 'SizeofExpr' ? (n.typeName ? n.typeName.ctype : n.arg && n.arg.ctype) : n.type === 'CompoundLiteral' ? n.typeName && n.typeName.ctype : n.ctype;
      for (let g = 0; t && g < 10 && U.canon(t) && U.canon(t).kind === 'array'; g++) t = U.canon(t).of;
      if (n.type === 'TypeName' && !cf.enclosing(n, ['SizeofExpr', 'AlignofExpr', 'CompoundLiteral', 'OffsetofExpr'])) continue;
      const id = idOf(t);
      if (id) needs.add(id);
    }
    for (const x of U.nodes(u, 'UnaryExpr')) {
      if (x.op !== '*') continue;
      const id = idOf(x.ctype);
      if (id && cf.parentOf(x) && cf.parentOf(x).type !== 'UnaryExpr') needs.add(id);
    }
  }
  for (const [k, r] of recs) {
    if (needs.has(k)) continue;
    api.report(r.nameLoc || r, msg(
      `The members of ${r.tag} '${r.name}' are never accessed; hide its definition and expose only a pointer to an incomplete type.`,
      `${r.tag} '${r.name}'의 멤버에 전혀 접근하지 않습니다. 정의를 숨기고 불완전 타입 포인터만 공개하세요.`));
  }
}

// ------------------------------------------------------------------ Dir 4.9 (function-like macros)

const FN_OK_KEYWORDS = new Set(['sizeof', 'do', 'while', 'if', 'else', 'for', 'switch']);
// Names that make a replacement list something other than an expression or a statement.
const NOT_CODE = new Set(['__attribute__', '__attribute', '__declspec', '_Pragma', '__pragma', '__asm__', '__asm', 'asm',
  '__typeof__', '__typeof', 'typeof', '__extension__', '__restrict', '__inline', '__inline__']);
const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=', '++', '--']);

// Macros expanded where a constant expression is required (case labels, array
// sizes, bit-field widths, enumerators, static initializers): a function call
// cannot stand there.
function constantContextMacros(unit) {
  const ranges = [];
  const add = (e) => { if (e && e.loc && e.loc.end != null) ranges.push(e.loc); };
  cf.walk(unit.ast, (n) => {
    if (n.type === 'CaseStmt') { add(n.value); add(n.high); } else if (n.type === 'ArrayDeclarator') add(n.size);
    else if (n.type === 'EnumConstant') add(n.value);
    else if (n.type === 'FieldDecl') add(n.bitWidth);
    else if (n.type === 'VarDecl' && n.init && n.symbol && n.symbol.storage === 'static') add(n.init);
    else if (n.type === 'StaticAssert' || n.type === 'StaticAssertDecl') add(n.cond || n.expr);
    return undefined;
  });
  const names = new Set();
  for (const x of unit.expansions || []) {
    for (const r of ranges) {
      if (x.file !== r.file) continue;
      const after = x.line > r.line || (x.line === r.line && x.col >= r.col);
      const before = x.line < (r.endLine || r.line) || (x.line === (r.endLine || r.line) && x.col < (r.endCol || Infinity));
      if (after && before) { names.add(x.name); break; }
    }
  }
  return names;
}

// The macro changes an argument (`#define SET(x, v) ((x) = (v))`) or names a type
// with one: a function taking the same arguments cannot do the same.
function changesArgument(m) {
  const params = new Set(m.params || []);
  const b = m.body;
  const isParamAt = (i) => {
    let k = i;
    while (k >= 0 && b[k].value === ')') k--;
    return k >= 0 && b[k].kind === 'identifier' && params.has(b[k].value);
  };
  for (let i = 0; i < b.length; i++) {
    const t = b[i];
    if (!ASSIGN_OPS.has(t.value)) continue;
    if (i > 0 && isParamAt(i - 1)) return true;
    if ((t.value === '++' || t.value === '--') && i + 1 < b.length) {
      let k = i + 1;
      while (k < b.length && b[k].value === '(') k++;
      if (k < b.length && b[k].kind === 'identifier' && params.has(b[k].value)) return true;
    }
  }
  return false;
}

// Replacement lists that are no expression or statement: `ATTR(x) EXPORT`, a
// declaration `T name`.
function notAnExpression(m) {
  const b = m.body;
  if (b.some((t) => t.kind === 'identifier' && NOT_CODE.has(t.value))) return true;
  if (b[0] && b[0].value === '{') return false;
  let depth = 0;
  for (let i = 0; i < b.length; i++) {
    const t = b[i];
    if (t.value === '(' || t.value === '[') depth++;
    else if (t.value === ')' || t.value === ']') depth--;
    if (depth !== 0 || i + 1 >= b.length) continue;
    const n = b[i + 1];
    // a call or group followed by a name, or two names in a row
    if (t.value === ')' && n.kind === 'identifier') {
      // (type)x is a cast; NAME(args) x is not an expression
      let k = i, d = 0;
      for (; k >= 0; k--) { if (b[k].value === ')') d++; else if (b[k].value === '(') { d--; if (d === 0) break; } }
      if (k > 0 && b[k - 1].kind === 'identifier' && !FN_OK_KEYWORDS.has(b[k - 1].value)) return true;
    }
    if (t.kind === 'identifier' && n.kind === 'identifier') return true;
  }
  return false;
}

function d49(unit, api) {
  const inIf = new Set();
  for (const d of unit.directives || []) {
    if (d.kind !== 'if' && d.kind !== 'elif') continue;
    for (const t of d.tokens || []) if (t.kind === 'identifier') inIf.add(t.value);
  }
  let constant = null;
  for (const m of unit.macros || []) {
    if (m.kind !== 'function' || U.isBuiltin(m.file) || m.predefined || m.commandLine) continue;
    if (!U.firstScan(api, `dir-4.9@${m.line}`, m.file)) continue;
    if (m.usesStringify || m.usesPaste || m.variadic || m.usesVaOpt || !m.body || !m.body.length || inIf.has(m.name)) continue;
    if (m.body.some((t) => t.kind === 'keyword' && !FN_OK_KEYWORDS.has(t.value))) continue;
    if (m.body.some((t) => t.kind === 'punct' && (t.value === '#' || t.value === '##'))) continue;
    if (changesArgument(m) || notAnExpression(m)) continue;
    if (!constant) constant = constantContextMacros(unit);
    if (constant.has(m.name)) continue;
    api.report({ file: m.file, line: m.line, col: m.col }, msg(
      `Function-like macro '${m.name}' could be written as a function.`,
      `함수형 매크로 '${m.name}'는 함수로 작성할 수 있습니다.`));
  }
}

// ------------------------------------------------------------------ Dir 4.10 (include guards)

function d410(unit, api) {
  for (const f of unit.files || []) {
    if (U.isBuiltin(f) || !cf.isHeader(f)) continue;
    if (!U.firstScan(api, 'dir-4.10', f)) continue;
    const g = unit.headerGuards && unit.headerGuards.get(f);
    if (!g || g.guarded || g.pragmaOnce) continue;
    api.report({ file: f, line: 1, col: 1 }, msg(`Header '${f}' has no include guard.`, `헤더 '${f}'에 포함 가드가 없습니다.`));
  }
}

// ------------------------------------------------------------------ Dir 4.11 (validity of library arguments)

const NONNULL = {
  memcpy: [0, 1], memmove: [0, 1], memset: [0], memcmp: [0, 1], memchr: [0], strcpy: [0, 1], strncpy: [0, 1], strcat: [0, 1], strncat: [0, 1],
  strcmp: [0, 1], strncmp: [0, 1], strlen: [0], strchr: [0], strrchr: [0], strstr: [0, 1], strtok: [1], strspn: [0, 1], strcspn: [0, 1],
  atoi: [0], atol: [0], atof: [0], strtol: [0], strtoul: [0], strtod: [0], fclose: [0], fgetc: [0], fgets: [0, 2], fputs: [0, 1], fputc: [1],
  fread: [0, 3], fwrite: [0, 3], fseek: [0], ftell: [0], fprintf: [0, 1], fscanf: [0, 1], sprintf: [0, 1], snprintf: [], printf: [0], puts: [0],
  qsort: [3], bsearch: [3, 4],
};
const CTYPE = new Set(['isalnum', 'isalpha', 'isblank', 'iscntrl', 'isdigit', 'isgraph', 'islower', 'isprint', 'ispunct', 'isspace', 'isupper', 'isxdigit', 'tolower', 'toupper']);
const MATH_DOMAIN = {
  sqrt: (v) => v < 0, sqrtf: (v) => v < 0, sqrtl: (v) => v < 0,
  log: (v) => v <= 0, logf: (v) => v <= 0, logl: (v) => v <= 0, log10: (v) => v <= 0, log10f: (v) => v <= 0, log2: (v) => v <= 0, log2f: (v) => v <= 0,
  acos: (v) => v < -1 || v > 1, asin: (v) => v < -1 || v > 1, acosf: (v) => v < -1 || v > 1, asinf: (v) => v < -1 || v > 1,
};
function numValue(unit, e) {
  const v = U.constOf(unit, e);
  if (v) return typeof v.value === 'bigint' ? Number(v.value) : v.value;
  try { const f = T.constValue(e, { target: unit.target, allowFloat: true }); return f ? Number(f.value) : null; } catch (_) { return null; }
}
function d411(unit, api) {
  const say = (c, en, ko) => api.report(c, msg(`Invalid argument to '${nameOf(c)}': ${en}.`, `'${nameOf(c)}'에 잘못된 인수: ${ko}.`));
  for (const c of U.nodes(unit, 'CallExpr')) {
    const n = nameOf(c);
    if (!n || !U.isLibraryCall(c)) continue;
    if (NONNULL[n]) for (const i of NONNULL[n]) if (c.args[i] && U.isNullPtrConst(unit, c.args[i])) say(c, `argument ${i + 1} is a null pointer`, `${i + 1}번째 인수가 널 포인터입니다`);
    if (CTYPE.has(n) && c.args[0]) {
      const v = U.iceValue(unit, c.args[0]);
      if (v != null && (v < -1n || v > 255n)) say(c, `${v} is neither EOF nor an unsigned char value`, `${v}는 EOF도 unsigned char 값도 아닙니다`);
      else if (v == null && U.et(unit, api, c.args[0]).category === 'character' && T.isSigned(T.T.char, unit.target)) say(c, `'${U.code(unit, c.args[0])}' is a plain char that may be negative; cast it to unsigned char`, `'${U.code(unit, c.args[0])}'는 음수일 수 있는 char입니다. unsigned char로 캐스트하세요`);
    }
    if (MATH_DOMAIN[n] && c.args[0]) {
      const v = numValue(unit, c.args[0]);
      if (v != null && MATH_DOMAIN[n](v)) say(c, `${v} is outside the domain of the function`, `${v}는 함수의 정의역을 벗어납니다`);
    }
    if (/^strto(u?ll?|u?l|imax|umax)$/.test(n) && c.args[2]) {
      const b = U.iceValue(unit, c.args[2]);
      if (b != null && b !== 0n && (b < 2n || b > 36n)) say(c, `base ${b} is not 0 or 2..36`, `진법 ${b}는 0 또는 2..36이 아닙니다`);
    }
  }
}

// ------------------------------------------------------------------ Dir 4.12 (dynamic memory)

const DYN = new Set(['malloc', 'calloc', 'realloc', 'free', 'aligned_alloc', 'strdup', 'strndup']);
function d412(unit, api) {
  for (const c of libCalls(unit, DYN)) api.report(c, msg(`Dynamic memory function '${nameOf(c)}' is used.`, `동적 메모리 함수 '${nameOf(c)}'를 사용합니다.`));
}

// ------------------------------------------------------------------ Dir 4.13 (resource sequences)

const LOCKS = { mtx_lock: 'mtx_unlock', pthread_mutex_lock: 'pthread_mutex_unlock', mtx_trylock: 'mtx_unlock', mtx_timedlock: 'mtx_unlock' };
function d413(unit, api) {
  for (const fn of cf.functionsOf(unit)) {
    if (!U.userLoc(fn)) continue;
    const calls = cf.findAll(fn.body, 'CallExpr').filter((c) => U.isLibraryCall(c));
    const argText = (c, i) => (c.args[i] ? U.code(unit, c.args[i], 200).replace(/\s+/g, '') : '');
    const unlocks = new Map();
    for (const c of calls) {
      const n = nameOf(c);
      if (n === 'mtx_unlock' || n === 'pthread_mutex_unlock') unlocks.set(`${n}|${argText(c, 0)}`, (unlocks.get(`${n}|${argText(c, 0)}`) || 0) + 1);
    }
    const locks = new Map();
    for (const c of calls) {
      const n = nameOf(c);
      if (!LOCKS[n]) continue;
      const k = `${LOCKS[n]}|${argText(c, 0)}`;
      locks.set(k, (locks.get(k) || 0) + 1);
      if (locks.get(k) > (unlocks.get(k) || 0)) {
        api.report(c, msg(`'${nameOf(c)}(${argText(c, 0)})' in '${fn.name}' has no matching '${LOCKS[n]}'.`, `'${fn.name}'의 '${nameOf(c)}(${argText(c, 0)})'에 짝이 되는 '${LOCKS[n]}'가 없습니다.`));
      }
    }
    for (const c of calls) {
      if (nameOf(c) !== 'fopen' && nameOf(c) !== 'tmpfile') continue;
      let n = c, p = cf.parentOf(c);
      while (p && (p.type === 'ParenExpr' || p.type === 'CastExpr')) { n = p; p = cf.parentOf(p); }
      let sym = null;
      if (p && p.type === 'VarDecl') sym = p.symbol;
      else if (p && p.type === 'AssignExpr' && cf.parentKey(n) === 'right') { const t = U.skip(p.left); sym = t && t.type === 'Identifier' ? t.symbol : null; }
      if (!sym || sym.storage !== 'automatic') continue;
      let handled = false;
      for (const u of sym.uses || []) {
        const up = cf.parentOf(u);
        if (!up) continue;
        if (up.type === 'CallExpr' && cf.parentKey(u) !== 'callee' && (nameOf(up) === 'fclose' || !U.isLibraryCall(up))) handled = true;
        if (up.type === 'ReturnStmt' || (up.type === 'AssignExpr' && cf.parentKey(u) === 'right') || up.type === 'VarDecl') handled = true;
      }
      if (handled) continue;
      api.report(c, msg(`The stream opened into '${sym.name}' is never closed in '${fn.name}'.`, `'${fn.name}'에서 '${sym.name}'에 연 스트림을 닫지 않습니다.`));
    }
  }
}

// ------------------------------------------------------------------ Dir 4.14 (external input)

const INPUT_RET = new Set(['getchar', 'fgetc', 'getc', 'atoi', 'atol', 'atoll', 'strtol', 'strtoul', 'strtoll', 'strtoull']);
const INPUT_PTR = new Set(['scanf', 'fscanf', 'sscanf']);
const SIZE_ARGS = { memcpy: 2, memmove: 2, memset: 2, strncpy: 2, strncat: 2, malloc: 0, calloc: 1, fread: 1, fwrite: 1, alloca: 0 };

function comparedIn(fn, sym) {
  for (const u of sym.uses || []) {
    if (U.enclosingFn(u) !== fn) continue;
    for (let n = u, p = cf.parentOf(u); p; n = p, p = cf.parentOf(p)) {
      if (p.type === 'ParenExpr' || p.type === 'CastExpr') continue;
      if (p.type === 'BinaryExpr' && ['<', '>', '<=', '>=', '==', '!='].includes(p.op)) return true;
      if (p.type === 'SwitchStmt' && cf.parentKey(n) === 'cond') return true;
      break;
    }
  }
  return false;
}

function d414(unit, api) {
  for (const fn of cf.functionsOf(unit)) {
    if (!U.userLoc(fn)) continue;
    const tainted = new Map();
    for (const c of cf.findAll(fn.body, 'CallExpr')) {
      const n = nameOf(c);
      if (!n || !U.isLibraryCall(c)) continue;
      if (INPUT_RET.has(n)) {
        const p = cf.parentOf(c);
        if (p && p.type === 'VarDecl' && p.symbol) tainted.set(p.symbol, n);
        if (p && p.type === 'AssignExpr') { const t = U.skip(p.left); if (t && t.type === 'Identifier' && t.symbol) tainted.set(t.symbol, n); }
      }
      if (INPUT_PTR.has(n)) {
        for (const a of c.args.slice(1)) {
          const x = U.skip(a);
          if (x && x.type === 'UnaryExpr' && x.op === '&') { const r = U.skip(x.arg); if (r && r.type === 'Identifier' && r.symbol) tainted.set(r.symbol, n); }
        }
      }
    }
    for (const [sym, src] of tainted) {
      if (comparedIn(fn, sym)) continue;
      for (const u of sym.uses || []) {
        if (U.enclosingFn(u) !== fn) continue;
        let n = u, p = cf.parentOf(u);
        while (p && (p.type === 'ParenExpr' || p.type === 'CastExpr' || (p.type === 'BinaryExpr' && ['+', '-', '*'].includes(p.op)))) { n = p; p = cf.parentOf(p); }
        let sink = null;
        if (p && p.type === 'IndexExpr' && cf.parentKey(n) === 'index') sink = ['an array index', '배열 인덱스'];
        if (p && p.type === 'CallExpr' && SIZE_ARGS[nameOf(p)] != null && p.args[SIZE_ARGS[nameOf(p)]] === n) sink = [`the size argument of '${nameOf(p)}'`, `'${nameOf(p)}'의 크기 인수`];
        if (!sink) continue;
        api.report(u, msg(
          `'${sym.name}' comes from external input ('${src}') and is used as ${sink[0]} without being checked.`,
          `'${sym.name}'는 외부 입력('${src}')에서 온 값인데 검사 없이 ${sink[1]}로 사용됩니다.`));
      }
    }
  }
}

// ------------------------------------------------------------------ Dir 4.15 (NaN / infinity)

const FP_CHECKS = new Set(['isnan', 'isinf', 'isfinite', 'fpclassify', 'isnormal', 'fetestexcept']);
const FP_RISKY = new Set(['log', 'logf', 'logl', 'log10', 'log2', 'sqrt', 'sqrtf', 'sqrtl', 'pow', 'powf', 'powl', 'acos', 'asin', 'atanh', 'exp', 'expf']);
function d415(unit, api) {
  for (const fn of cf.functionsOf(unit)) {
    if (!U.userLoc(fn)) continue;
    const checks = cf.findAll(fn.body, 'CallExpr').some((c) => FP_CHECKS.has(nameOf(c)));
    for (const b of cf.findAll(fn.body, ['BinaryExpr', 'AssignExpr'])) {
      if (b.op !== '/' && b.op !== '/=') continue;
      if (!T.isFloating(U.canon(b.ctype) || T.T.int)) continue;
      const v = numValue(unit, b.right);
      if (v === 0) { api.report(b, msg(`Floating division by zero in '${U.code(unit, b)}' produces an infinity or NaN.`, `'${U.code(unit, b)}'의 부동소수점 0 나눗셈은 무한대나 NaN을 만듭니다.`)); continue; }
      if (v != null || checks) continue;
      const r = U.skip(b.right);
      const root = r && r.type === 'Identifier' ? r.symbol : null;
      if (root && comparedIn(fn, root)) continue;
      api.report(b, msg(
        `Floating division '${U.code(unit, b)}' may produce an infinity or NaN that is never detected in '${fn.name}'.`,
        `부동소수점 나눗셈 '${U.code(unit, b)}'가 무한대나 NaN을 만들 수 있는데 '${fn.name}'에서 감지하지 않습니다.`));
    }
    if (checks) continue;
    for (const c of cf.findAll(fn.body, 'CallExpr')) {
      if (!FP_RISKY.has(nameOf(c)) || !U.isLibraryCall(c) || !c.args[0] || numValue(unit, c.args[0]) != null) continue;
      const r = U.skip(c.args[0]);
      if (r && r.type === 'Identifier' && r.symbol && comparedIn(fn, r.symbol)) continue;
      api.report(c, msg(
        `The result of '${nameOf(c)}' may be an infinity or NaN that is never detected in '${fn.name}'.`,
        `'${nameOf(c)}'의 결과가 무한대나 NaN일 수 있는데 '${fn.name}'에서 감지하지 않습니다.`));
    }
  }
}

// ------------------------------------------------------------------ Dir 5.x (concurrency)

const CREATE = { thrd_create: 1, pthread_create: 2 };
const LOCK_NAMES = new Set(['mtx_lock', 'mtx_trylock', 'mtx_timedlock', 'pthread_mutex_lock', 'pthread_mutex_trylock']);
const UNLOCK_NAMES = new Set(['mtx_unlock', 'pthread_mutex_unlock']);

function threadEntries(project) {
  const names = new Set();
  for (const u of project.units) {
    for (const c of U.nodes(u, 'CallExpr')) {
      const i = CREATE[nameOf(c)];
      if (i == null || !c.args[i]) continue;
      let a = U.skip(c.args[i]);
      if (a && a.type === 'UnaryExpr' && a.op === '&') a = U.skip(a.arg);
      if (a && a.type === 'CastExpr') a = U.skip(a.arg);
      if (a && a.type === 'Identifier') names.add(a.name);
    }
  }
  return names;
}

function d51(project, api) {
  const entries = threadEntries(project);
  if (!entries.size) return;
  const keys = new Set();
  for (const n of project.callGraph.nodes.values()) if (entries.has(n.name)) { keys.add(n.key); for (const k of project.callGraph.reachableFrom(n.key)) keys.add(k); }
  for (const k of keys) {
    const node = project.callGraph.nodes.get(k);
    if (!node) continue;
    for (const { unit, node: fd } of node.definitions) {
      if (!U.userLoc(fd)) continue;
      const calls = cf.findAll(fd.body, 'CallExpr');
      if (calls.some((c) => LOCK_NAMES.has(nameOf(c)))) continue;
      for (const w of cf.findAll(fd.body, (x) => x.type === 'AssignExpr' || (x.type === 'UnaryExpr' && (x.op === '++' || x.op === '--')))) {
        const target = U.skip(w.type === 'AssignExpr' ? w.left : w.arg);
        let r = target;
        while (r && (r.type === 'MemberExpr' && !r.arrow || r.type === 'IndexExpr')) r = U.skip(r.object);
        const s = r && r.type === 'Identifier' ? r.symbol : null;
        if (!s || s.kind !== 'variable' || s.storage !== 'static' || U.quals(s.type).atomic) continue;
        void unit;
        api.report(w, msg(
          `Static object '${s.name}' is modified in thread function '${fd.name}' without holding a lock.`,
          `스레드 함수 '${fd.name}'에서 잠금 없이 정적 객체 '${s.name}'를 수정합니다.`));
      }
    }
  }
}

function d52(project, api) {
  const pairs = new Map();
  for (const u of project.units) {
    for (const fn of cf.functionsOf(u)) {
      if (!U.userLoc(fn)) continue;
      const calls = cf.findAll(fn.body, 'CallExpr').sort((a, b) => a.loc.start - b.loc.start);
      const held = [];
      for (const c of calls) {
        const n = nameOf(c);
        const arg = c.args[0] ? U.code(u, c.args[0], 200).replace(/\s+/g, '') : '';
        if (LOCK_NAMES.has(n)) {
          for (const h of held) {
            const k = `${h}\u0000${arg}`;
            if (!pairs.has(k)) pairs.set(k, { a: h, b: arg, call: c, fn: fn.name });
          }
          held.push(arg);
        } else if (UNLOCK_NAMES.has(n)) {
          const i = held.lastIndexOf(arg);
          if (i >= 0) held.splice(i, 1);
        }
      }
    }
  }
  for (const p of pairs.values()) {
    if (p.a === p.b) continue;
    const q = pairs.get(`${p.b}\u0000${p.a}`);
    if (!q) continue;
    api.report(p.call, msg(
      `'${p.b}' is locked while holding '${p.a}' in '${p.fn}', but '${q.fn}' locks them in the opposite order; this can deadlock.`,
      `'${p.fn}'에서는 '${p.a}'를 잡은 채 '${p.b}'를 잠그지만 '${q.fn}'은 반대 순서로 잠가 교착 상태가 생길 수 있습니다.`));
  }
}

function d53(unit, api) {
  for (const c of U.nodes(unit, 'CallExpr')) {
    if (CREATE[nameOf(c)] == null) continue;
    const fn = U.enclosingFn(c);
    const inLoop = !!cf.enclosing(c, ['ForStmt', 'WhileStmt', 'DoStmt']);
    if (fn && fn.name === 'main' && !inLoop) continue;
    if (fn && fn.name === 'main' && inLoop) {
      const loop = cf.enclosing(c, ['ForStmt', 'WhileStmt', 'DoStmt']);
      // a counted start-up loop (for with a constant bound) is still static creation
      if (loop.type === 'ForStmt' && loop.cond && loop.cond.type === 'BinaryExpr' && U.iceValue(unit, loop.cond.right) != null) continue;
    }
    api.report(c, msg(
      `Thread created by '${nameOf(c)}' in '${fn ? fn.name : '?'}' outside the start-up code of main.`,
      `'${fn ? fn.name : '?'}'에서 main의 시작 코드 밖에서 '${nameOf(c)}'로 스레드를 만듭니다.`));
  }
}

const none = () => {};
module.exports = [
  { meta: D('1.1', { cat: 'R', sev: 'INFO', debt: 30, manual: true, name: ['Implementation-defined behaviour shall be documented', '구현 정의 동작은 문서화해야 함'],
    why: ['Code that relies on implementation-defined behaviour is only correct for the compiler and target it was written for.', '구현 정의 동작에 기대는 코드는 작성 당시의 컴파일러와 대상에서만 올바릅니다.'],
    fix: ['Document every implementation-defined behaviour the project depends on.', '프로젝트가 의존하는 모든 구현 정의 동작을 문서화하세요.'] }), check: none },
  { meta: D('2.1', { cat: 'R', type: 'BUG', sev: 'BLOCKER', debt: 15, name: ['Source files shall compile without errors', '소스 파일은 오류 없이 컴파일되어야 함'],
    why: ['A file with compilation errors cannot be trusted to mean what it says.', '컴파일 오류가 있는 파일은 의도대로 동작한다고 믿을 수 없습니다.'],
    fix: ['Fix the error.', '오류를 고치세요.'] }), check: d21 },
  { meta: D('3.1', { cat: 'R', sev: 'INFO', debt: 30, manual: true, name: ['Code shall be traceable to requirements', '코드는 요구사항으로 추적 가능해야 함'],
    why: ['Code that no requirement asks for adds risk without benefit.', '어떤 요구사항도 요구하지 않는 코드는 이득 없이 위험만 더합니다.'],
    fix: ['Keep traceability between requirements and code.', '요구사항과 코드 사이의 추적성을 유지하세요.'] }), check: none },
  { meta: D('4.1', { cat: 'R', sev: 'INFO', debt: 30, manual: true, cwe: ['CWE-754'], name: ['Run-time failures shall be minimized', '실행 시간 오류를 최소화해야 함'],
    why: ['C performs few run-time checks, so overflow, invalid pointers or out-of-range values go unnoticed.', 'C는 실행 시간 검사를 거의 하지 않아 넘침, 잘못된 포인터, 범위 밖 값이 드러나지 않습니다.'],
    fix: ['Add defensive checks and use static analysis to show their absence is safe.', '방어적 검사를 넣고 정적 분석으로 안전함을 보이세요.'] }), check: none },
  { meta: D('4.2', { cat: 'A', sev: 'MINOR', debt: 5, name: ['Assembly language shall be documented', '어셈블리 사용은 문서화해야 함'],
    why: ['Assembly is hard to review; the reason for using it must be explained.', '어셈블리는 검토하기 어려워 사용 이유를 설명해야 합니다.'],
    fix: ['Add a comment that explains the assembly code.', '어셈블리 코드를 설명하는 주석을 다세요.'] }), check: d42 },
  { meta: D('4.3', { cat: 'R', sev: 'MAJOR', debt: 10, name: ['Assembly language shall be encapsulated and isolated', '어셈블리는 캡슐화·격리해야 함'],
    why: ['Mixing assembly with C code makes both harder to port and to verify.', '어셈블리를 C 코드와 섞으면 둘 다 이식하고 검증하기 어려워집니다.'],
    fix: ['Move the assembly into a dedicated function or macro.', '어셈블리를 전용 함수나 매크로로 옮기세요.'] }), check: d43 },
  { meta: D('4.4', { cat: 'A', sev: 'MINOR', debt: 5, name: ['Code should not be commented out', '코드를 주석 처리하지 않아야 함'],
    why: ['Commented-out code is not compiled or maintained and confuses readers.', '주석 처리된 코드는 컴파일되지도 관리되지도 않아 독자를 혼란스럽게 합니다.'],
    fix: ['Delete it or use conditional compilation with a documented reason.', '지우거나 이유를 적은 조건부 컴파일을 쓰세요.'] }), check: d44 },
  { meta: D('4.5', { cat: 'A', sev: 'MINOR', debt: 5, name: ['Typographically ambiguous identifiers', '글자 모양이 헷갈리는 식별자'],
    why: ['Names that differ only by case, underscores or look-alike characters (l/1, O/0) are easily confused.', '대소문자, 밑줄, 비슷한 문자(l/1, O/0)만 다른 이름은 쉽게 혼동됩니다.'],
    fix: ['Rename one of the identifiers.', '식별자 하나의 이름을 바꾸세요.'] }), check: d45 },
  { meta: D('4.6', { cat: 'A', sev: 'MINOR', debt: 2, cert: 'INT00-C', name: ['Use typedefs that show size and signedness', '크기와 부호를 나타내는 typedef 사용'],
    why: ['The size of int, long and friends varies between targets.', 'int, long 등의 크기는 대상마다 다릅니다.'],
    fix: ['Use <stdint.h> types such as int32_t or a project typedef.', 'int32_t 같은 <stdint.h> 타입이나 프로젝트 typedef를 쓰세요.'] }), check: d46 },
  { meta: D('4.7', { cat: 'R', type: 'BUG', sev: 'MAJOR', debt: 10, cwe: ['CWE-252'], cert: 'ERR33-C', name: ['Error information returned by a function shall be tested', '함수가 반환한 오류 정보를 검사해야 함'],
    why: ['Ignoring an error result lets the program continue in an invalid state.', '오류 결과를 무시하면 프로그램이 잘못된 상태로 계속 실행됩니다.'],
    fix: ['Check the returned value before using the result.', '결과를 쓰기 전에 반환 값을 검사하세요.'] }), check: d47 },
  { meta: D('4.8', { cat: 'A', sev: 'MINOR', debt: 15, name: ['Hide implementation of structures that are never dereferenced', '역참조하지 않는 구조체의 구현 숨기기'],
    why: ['If no code needs the members, exposing the definition only invites misuse.', '멤버가 필요한 코드가 없다면 정의를 공개하는 것은 오용만 부릅니다.'],
    fix: ['Move the definition into the implementation file and keep only a forward declaration in the header.', '정의를 구현 파일로 옮기고 헤더에는 전방 선언만 두세요.'] }), project: d48 },
  { meta: D('4.9', { cat: 'A', sev: 'MINOR', debt: 10, cert: 'PRE00-C', name: ['Prefer functions to function-like macros', '함수형 매크로보다 함수 사용'],
    why: ['Functions check argument types and evaluate each argument once; macros do neither.', '함수는 인수 타입을 검사하고 인수를 한 번만 평가하지만 매크로는 그렇지 않습니다.'],
    fix: ['Replace the macro with a (static inline) function.', '매크로를 (static inline) 함수로 바꾸세요.'] }), check: d49 },
  { meta: D('4.10', { cat: 'R', sev: 'MAJOR', debt: 5, cert: 'PRE06-C', name: ['Headers shall be protected against multiple inclusion', '헤더는 중복 포함을 막아야 함'],
    why: ['Including a header twice can cause redefinitions or silent changes of meaning.', '헤더를 두 번 포함하면 재정의 오류나 의미 변경이 생길 수 있습니다.'],
    fix: ['Wrap the header in #ifndef NAME_H / #define NAME_H / #endif.', '헤더를 #ifndef NAME_H / #define NAME_H / #endif로 감싸세요.'] }), check: d410 },
  { meta: D('4.11', { cat: 'R', type: 'BUG', sev: 'MAJOR', debt: 10, cwe: ['CWE-628'], cert: 'STR37-C', name: ['Validity of values passed to library functions', '라이브러리 함수에 넘기는 값의 유효성'],
    why: ['Many library functions have undefined behaviour for out-of-domain arguments such as null pointers.', '많은 라이브러리 함수는 널 포인터 같은 정의역 밖 인수에서 미정의 동작을 합니다.'],
    fix: ['Check arguments before calling the function.', '함수를 호출하기 전에 인수를 검사하세요.'] }), check: d411 },
  { meta: D('4.12', { cat: 'R', sev: 'MAJOR', debt: 30, cwe: ['CWE-401', 'CWE-770'], name: ['Dynamic memory allocation shall not be used', '동적 메모리 할당을 사용하지 않아야 함'],
    why: ['Heap use brings leaks, fragmentation and unpredictable timing and failure.', '힙 사용은 누수, 단편화, 예측할 수 없는 시간과 실패를 가져옵니다.'],
    fix: ['Use statically allocated memory or a deterministic pool.', '정적 할당 메모리나 결정적인 풀을 쓰세요.'] }), check: d412 },
  { meta: D('4.13', { cat: 'A', type: 'BUG', sev: 'MAJOR', debt: 10, cwe: ['CWE-772', 'CWE-667'], cert: 'FIO42-C', name: ['Resource functions shall be called in the right sequence', '자원 함수는 올바른 순서로 호출해야 함'],
    why: ['A stream that is never closed or a lock that is never released leaks the resource or blocks others.', '닫지 않은 스트림이나 풀지 않은 잠금은 자원을 새게 하거나 다른 쪽을 막습니다.'],
    fix: ['Pair every open with a close and every lock with an unlock on all paths.', '모든 경로에서 열기와 닫기, 잠금과 해제를 짝지으세요.'] }), check: d413 },
  { meta: D('4.14', { cat: 'R', type: 'VULNERABILITY', sev: 'CRITICAL', debt: 15, cwe: ['CWE-20', 'CWE-129'], cert: 'INT04-C', name: ['Values from external sources shall be checked', '외부에서 받은 값은 검사해야 함'], amendment: 'AMD1',
    why: ['Unchecked input used as an index or a size enables buffer overflows.', '검사하지 않은 입력을 인덱스나 크기로 쓰면 버퍼 넘침이 생깁니다.'],
    fix: ['Validate the range of external values before using them.', '외부 값을 쓰기 전에 범위를 검사하세요.'] }), check: d414 },
  { meta: D('4.15', { cat: 'R', type: 'BUG', sev: 'MAJOR', debt: 10, cwe: ['CWE-369', 'CWE-682'], cert: 'FLP32-C', amendment: 'AMD3', name: ['Infinities and NaNs shall not go undetected', '무한대와 NaN을 감지해야 함'],
    why: ['Floating-point infinities and NaNs propagate silently and corrupt later results.', '부동소수점 무한대와 NaN은 조용히 퍼져 이후 결과를 망칩니다.'],
    fix: ['Check divisors and arguments, or test the result with isnan/isinf/isfinite.', '나눗수와 인수를 검사하거나 결과를 isnan/isinf/isfinite로 확인하세요.'] }), check: d415 },
  { meta: D('5.1', { cat: 'R', type: 'BUG', sev: 'CRITICAL', debt: 20, cwe: ['CWE-362'], cert: 'CON43-C', amendment: 'AMD4', name: ['There shall be no data races between threads', '스레드 간 데이터 경쟁이 없어야 함'],
    why: ['Unsynchronized access to shared data from several threads is undefined behaviour.', '여러 스레드가 동기화 없이 공유 데이터에 접근하면 미정의 동작입니다.'],
    fix: ['Protect shared objects with a mutex or make them atomic.', '공유 객체를 뮤텍스로 보호하거나 atomic으로 만드세요.'] }), project: d51 },
  { meta: D('5.2', { cat: 'R', type: 'BUG', sev: 'CRITICAL', debt: 20, cwe: ['CWE-833'], cert: 'CON35-C', amendment: 'AMD4', name: ['There shall be no deadlocks between threads', '스레드 간 교착 상태가 없어야 함'],
    why: ['Acquiring the same locks in different orders in different threads can deadlock.', '여러 스레드가 같은 잠금들을 다른 순서로 얻으면 교착 상태가 생길 수 있습니다.'],
    fix: ['Always acquire locks in one global order.', '잠금은 항상 하나의 전역 순서로 얻으세요.'] }), project: d52 },
  { meta: D('5.3', { cat: 'R', sev: 'MAJOR', debt: 15, amendment: 'AMD4', name: ['There shall be no dynamic thread creation', '동적 스레드 생성이 없어야 함'],
    why: ['Creating threads during normal operation makes resource use and timing unpredictable.', '정상 동작 중 스레드를 만들면 자원 사용과 시간이 예측 불가능해집니다.'],
    fix: ['Create all threads during start-up in main.', '모든 스레드를 main의 시작 단계에서 만드세요.'] }), check: d53 },
];
