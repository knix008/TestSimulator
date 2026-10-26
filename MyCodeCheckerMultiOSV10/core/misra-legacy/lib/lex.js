'use strict';

// Lexical and preprocessor checks shared by MISRA C:2004 and C++:2008.

const U = require('./util');

const { cf, M } = U;

// comments of user files, each file once per rule
function comments(unit, api, id) {
  const files = new Set(U.sourcesOnce(unit, api, id).map(([f]) => f));
  return (unit.comments || []).filter((c) => files.has(c.file));
}

function lineComments(unit, api, id) {
  for (const c of comments(unit, api, id)) {
    if (c.style === 'line') api.report(c, M('A // comment is used; only /* ... */ comments are allowed.', '// 주석을 사용했습니다. /* ... */ 주석만 사용할 수 있습니다.'));
  }
}

function nestedBlockComment(unit, api, id) {
  for (const c of comments(unit, api, id)) {
    if (c.style !== 'block') continue;
    const body = c.value.slice(2, c.value.endsWith('*/') ? -2 : undefined);
    if (body.includes('/*')) api.report(c, M("The sequence '/*' appears inside a /* */ comment.", "/* */ 주석 안에 '/*' 시퀀스가 있습니다."));
  }
}

// Heuristic: does the comment text look like source code?
const CODE_END = /[;{}]\s*$/;
const CODE_PAT = /^\s*(#\s*(include|define|if|ifdef|ifndef|endif|else|elif|undef)\b|(if|while|for|switch)\s*\(|return\b[^.]*;|else\b\s*\{?|[A-Za-z_][\w.\->[\]]*\s*(=|\+=|-=|\+\+|--)[^=].*;|[A-Za-z_][\w:]*\s*\([^)]*\)\s*;)/;
function looksLikeCode(text) {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/^\s*\*+\s?/, '').trim()).filter(Boolean);
  return lines.some((l) => CODE_PAT.test(l) || (CODE_END.test(l) && /[=(]/.test(l) && !/[.!?]\s*$/.test(l.replace(/[;{}]\s*$/, ''))));
}

function commentedOut(unit, api, id, style) {
  for (const c of comments(unit, api, id)) {
    if (style && c.style !== style) continue;
    const body = c.style === 'block' ? c.value.slice(2, c.value.endsWith('*/') ? -2 : undefined) : c.value.slice(2);
    if (looksLikeCode(body)) api.report(c, M('This comment appears to contain commented-out code.', '이 주석에 주석 처리된 코드가 있는 것으로 보입니다.'));
  }
}

function literals(unit) {
  return U.get(unit, 'CharLiteral', 'StringLiteral');
}

// Escape sequences not defined by the language standard.
function undefinedEscapes(unit, api) {
  for (const l of literals(unit)) {
    for (const e of l.escapes || []) {
      if (e.kind === 'unknown') api.report(l, M(`The escape sequence '${e.text}' is not defined by the standard.`, `이스케이프 시퀀스 '${e.text}'는 표준에 정의되어 있지 않습니다.`));
    }
  }
}

// Octal constants (other than 0) and octal escapes (other than \0).
function octals(unit, api) {
  for (const n of U.get(unit, 'IntegerLiteral')) {
    if (n.octal) api.report(n, M(`'${n.raw}' is an octal constant.`, `'${n.raw}'은(는) 8진 상수입니다.`));
  }
  for (const l of literals(unit)) {
    for (const e of l.escapes || []) {
      if (e.kind === 'octal' && e.text !== '\\0') api.report(l, M(`'${e.text}' is an octal escape sequence.`, `'${e.text}'은(는) 8진 이스케이프 시퀀스입니다.`));
    }
  }
}

function trigraphs(unit, api, id) {
  const files = new Set(U.sourcesOnce(unit, api, id).map(([f]) => f));
  for (const t of unit.trigraphs || []) {
    if (files.has(t.file)) api.report(t, M(`The trigraph '${t.seq}' is used.`, `삼중 문자 '${t.seq}'를 사용했습니다.`));
  }
}

function digraphs(unit, api, id) {
  for (const [, src] of U.sourcesOnce(unit, api, id)) {
    for (const t of src.tokens || []) {
      if (t.digraph) api.report(t, M(`The digraph '${t.digraph}' is used.`, `이중 문자 '${t.digraph}'를 사용했습니다.`));
    }
  }
}

// A null statement shall be alone on its line (a comment may follow after a space).
function nullStatementLine(unit, api) {
  for (const n of U.get(unit, 'NullStmt')) {
    if (n.loc.macro || (n.attributes && n.attributes.length)) continue;
    const p = cf.parentOf(n);
    if (p && (p.type === 'ForStmt')) continue;
    const src = unit.sources && unit.sources.get(n.loc.file);
    if (!src) continue;
    const lines = src.text.split('\n');
    const line = (lines[n.loc.line - 1] || '').replace(/\r$/, '');
    const before = line.slice(0, n.loc.col - 1);
    const after = line.slice(n.loc.col);
    const ok = before.trim() === '' && (after.trim() === '' || /^\s+(\/\/|\/\*)/.test(after));
    if (!ok) api.report(n, M('The null statement is not on a line by itself.', '널 문장이 한 줄에 단독으로 있지 않습니다.'));
  }
}

// ------------------------------------------------------------------ preprocessor

function directives(unit, api, id, kinds) {
  const files = new Set(U.sourcesOnce(unit, api, id).map(([f]) => f));
  return (unit.directives || []).filter((d) => files.has(d.file) && (!kinds || kinds.includes(d.kind)));
}

// #define / #undef inside a block (or a namespace for C++)
function macroInBlock(unit, api, id, namespaces) {
  const ranges = [];
  for (const f of U.get(unit, 'FunctionDecl')) if (f.body && f.body.loc) ranges.push(f.body.loc);
  if (namespaces) for (const n of U.get(unit, 'NamespaceDecl')) if (n.loc) ranges.push(n.loc);
  for (const r of U.get(unit, 'RecordDecl')) if (r.members && r.loc) ranges.push(r.loc);
  for (const d of directives(unit, api, id, ['define', 'undef'])) {
    if (!d.active) continue;
    const inside = ranges.some((r) => r.file === d.file && (d.line > r.line || (d.line === r.line && d.col > r.col)) && (d.line < r.endLine));
    if (inside) api.report(d, M(`'#${d.kind} ${d.macro || ''}' appears inside a block.`, `'#${d.kind} ${d.macro || ''}'가 블록 안에 있습니다.`));
  }
}

function undefs(unit, api, id) {
  for (const d of directives(unit, api, id, ['undef'])) if (d.active) api.report(d, M(`'#undef ${d.macro || ''}' is used.`, `'#undef ${d.macro || ''}'를 사용했습니다.`));
}

// Function-like macro invoked with missing or empty arguments.
function macroArgsMissing(unit, api) {
  for (const e of unit.expansions || []) {
    if (U.isBuiltin(e.file) || !e.def || e.def.kind !== 'function' || !e.args) continue;
    const want = e.def.params.length;
    if (want === 0 && e.args.length === 1 && e.args[0].length === 0) continue;
    const empty = e.args.some((a) => a.length === 0);
    if (e.args.length < want || (empty && !e.def.variadic)) {
      api.report(e, M(`Macro '${e.name}' is invoked without all of its arguments.`, `매크로 '${e.name}'를 모든 인수 없이 호출했습니다.`));
    }
  }
}

// In a function-like macro body every parameter use is parenthesised unless an operand of # or ##.
function macroParamParens(unit, api, id) {
  const files = new Set(U.sourcesOnce(unit, api, id).map(([f]) => f));
  for (const m of unit.macros || []) {
    if (!files.has(m.file) || m.kind !== 'function') continue;
    const params = new Set(m.vaName ? [...m.params, m.vaName] : m.params);
    const b = m.body || [];
    for (let i = 0; i < b.length; i++) {
      const t = b[i];
      if (t.kind !== 'identifier' || !params.has(t.value)) continue;
      const prev = b[i - 1];
      const next = b[i + 1];
      if ((prev && (prev.value === '#' || prev.value === '##')) || (next && next.value === '##')) continue;
      if (prev && prev.value === '(' && next && next.value === ')') continue;
      api.report({ file: m.file, line: m.line, col: m.col }, M(`Parameter '${t.value}' of macro '${m.name}' is not enclosed in parentheses.`, `매크로 '${m.name}'의 매개변수 '${t.value}'가 괄호로 묶이지 않았습니다.`));
      break;
    }
  }
}

function hashOps(m) {
  let n = 0;
  const b = m.body || [];
  for (let i = 0; i < b.length; i++) {
    const v = b[i].value;
    if (v === '##') n++;
    else if (v === '#' && m.kind === 'function') n++;
  }
  return n;
}

function multipleHashOps(unit, api, id) {
  const files = new Set(U.sourcesOnce(unit, api, id).map(([f]) => f));
  for (const m of unit.macros || []) {
    if (!files.has(m.file)) continue;
    const n = hashOps(m);
    if (n > 1) api.report({ file: m.file, line: m.line, col: m.col }, M(`Macro '${m.name}' uses ${n} '#'/'##' operators.`, `매크로 '${m.name}'가 '#'/'##' 연산자를 ${n}개 사용합니다.`));
  }
}

// defined used in a non-standard form (generated by a macro, missing name).
function definedForm(unit, api, id) {
  const files = new Set(U.sourcesOnce(unit, api, id).map(([f]) => f));
  const codes = new Set(['pp-defined-from-macro', 'pp-defined-no-name', 'pp-defined-no-paren']);
  for (const d of unit.diagnostics || []) {
    if (!files.has(d.file)) continue;
    if (d.code === 'pp-defined-no-paren') continue; // `defined X` is a standard form
    if (codes.has(d.code)) api.report(d, M("The 'defined' operator is not used in one of its two standard forms.", "'defined' 연산자를 두 가지 표준 형식 중 하나로 사용하지 않았습니다."));
  }
  // `defined` produced by a macro expansion inside #if
  for (const dir of (unit.directives || []).filter((x) => files.has(x.file) && (x.kind === 'if' || x.kind === 'elif') && x.active)) {
    for (const t of dir.tokens || []) {
      if (t.kind !== 'identifier') continue;
      const def = unit.macroTable && unit.macroTable.get(t.value);
      if (def && (def.body || []).some((b) => b.value === 'defined')) {
        api.report(dir, M(`Macro '${t.value}' expands to the 'defined' operator.`, `매크로 '${t.value}'가 'defined' 연산자로 확장됩니다.`));
        break;
      }
    }
  }
}

// Directives in excluded regions that are not valid directives.
function skippedDirectives(unit, api, id) {
  for (const d of directives(unit, api, id)) {
    if (d.active === false && d.kind === 'unknown') api.report(d, M(`'${(d.text || '').trim()}' is not a valid preprocessing directive (in excluded code).`, `'${(d.text || '').trim()}'는 올바른 전처리 지시문이 아닙니다(제외된 코드).`));
  }
}

function nullDirective(unit, api, id) {
  for (const d of directives(unit, api, id, ['null'])) if (d.active) api.report(d, M("A '#' is not followed by a preprocessing token.", "'#' 뒤에 전처리 토큰이 없습니다."));
}

// #pragma without a nearby comment that explains it.
function undocumentedPragma(unit, api, id) {
  const near = new Set();
  for (const c of unit.comments || []) for (let l = c.line; l <= (c.endLine || c.line) + 1; l++) near.add(`${c.file}:${l}`);
  for (const d of directives(unit, api, id, ['pragma'])) {
    if (!d.active) continue;
    if (near.has(`${d.file}:${d.line}`)) continue;
    api.report(d, M('This #pragma is not documented by a comment.', '이 #pragma는 주석으로 설명되어 있지 않습니다.'));
  }
}

// Header names with the given characters.
function headerNameChars(unit, api, id, chars) {
  const files = new Set(U.sourcesOnce(unit, api, id).map(([f]) => f));
  for (const i of unit.includes || []) {
    if (!files.has(i.file) || i.viaMacro) continue;
    const bad = chars.find((c) => (i.name || '').includes(c));
    if (bad) api.report(i, M(`The header name '${i.name}' contains '${bad}'.`, `헤더 이름 '${i.name}'에 '${bad}'가 있습니다.`));
  }
}

module.exports = {
  comments, lineComments, nestedBlockComment, looksLikeCode, commentedOut, undefinedEscapes, octals, trigraphs, digraphs,
  nullStatementLine, directives, macroInBlock, undefs, macroArgsMissing, macroParamParens, multipleHashOps, hashOps,
  definedForm, skippedDirectives, nullDirective, undocumentedPragma, headerNameChars,
};
