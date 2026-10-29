'use strict';

// Helpers for the AUTOSAR rules: the MISRA C++ helper set (read-only reuse)
// plus a few token / declaration utilities used across chapters.

const MU = require('../../misra-cpp/lib/util');
const { cf, T } = MU;

const at = (n) => (n && n.nameLoc ? { ...n.nameLoc, file: n.loc.file } : n);

// User source files of a unit (main file and project headers).
function userFiles(unit) {
  return (unit.files || [unit.file]).filter((f) => typeof f === 'string' && !f.startsWith('<'));
}

// Raw (not preprocessed) tokens of every user file: [{ file, tokens }]
function rawTokenFiles(unit) {
  return MU.memo(unit, 'autosar.raw', () => userFiles(unit).map((file) => {
    let tokens = [];
    try { tokens = cf.rawTokens(unit, file) || []; } catch (e) { tokens = []; }
    return { file, tokens, text: (unit.sources && unit.sources.get(file) && unit.sources.get(file).text) || '' };
  }));
}

// Raw tokens of `file` whose start offset lies in [start, end).
function tokensIn(unit, file, start, end) {
  const entry = rawTokenFiles(unit).find((f) => f.file === file);
  if (!entry) return [];
  const toks = entry.tokens;
  let lo = 0;
  let hi = toks.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (toks[mid].start < start) lo = mid + 1; else hi = mid; }
  const out = [];
  for (let i = lo; i < toks.length && toks[i].start < end; i++) out.push(toks[i]);
  return out;
}

// Raw tokens that are not part of a preprocessing directive line.
function codeTokens(tokens) {
  const out = [];
  let inDirective = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.bol) inDirective = t.kind === 'punct' && t.value === '#';
    if (!inDirective) out.push(t);
  }
  return out;
}

const userComments = (unit) => (unit.comments || []).filter((c) => !MU.isBuiltin(c.file));

// Calls of library functions by name (unqualified, :: or std::).
function libCalls(unit, names) {
  const out = [];
  for (const c of MU.ix(unit).get('CallExpr')) {
    const n = MU.isLibCall(c, names);
    if (n) out.push({ c, n });
  }
  return out;
}

// Any call whose callee is spelled name / std::name (no symbol check: for
// std:: library names the front end does not resolve).
function stdCalls(unit, names) {
  const out = [];
  for (const c of MU.ix(unit).get('CallExpr')) {
    const cn = MU.callName(c);
    if (!cn || cn.member) continue;
    if (cn.qualifier && cn.qualifier !== 'std') continue;
    if (names.has(cn.name)) out.push({ c, n: cn.name, qualified: !!cn.qualifier });
  }
  return out;
}

// Declared specifiers of a declaration-ish node.
const specs = (n) => MU.specsOf(n) || { storage: [], qualifiers: [], functionSpecs: [], attributes: [] };
const hasFnSpec = (n, s) => specs(n).functionSpecs.includes(s);
const hasStorage = (n, s) => specs(n).storage.includes(s);

// Text of a type specifier as written (NamedType qname / builtin names).
function typeSpecName(ts) {
  if (!ts) return '';
  if (ts.type === 'NamedType') return ts.qname || ts.name || '';
  if (ts.type === 'BuiltinType') return ts.names.join(' ');
  if (ts.type === 'RecordDecl' || ts.type === 'EnumDecl') return ts.name || '';
  return '';
}

// Name of the std template a type spec names (vector, unique_ptr ...), or ''.
function stdTemplate(ts) {
  if (!ts || ts.type !== 'NamedType') return '';
  const q = (ts.qname || ts.name || '').replace(/^::/, '');
  return q.startsWith('std::') ? q.slice(5) : '';
}

const inTemplate = (n) => cf.ancestors(n).some((a) => a.type === 'TemplateDecl');
// main, or a Windows program / DLL entry point (called by the system, like main)
const ENTRY_POINTS = new Set(['main', 'WinMain', 'wWinMain', 'wmain', '_tmain', '_tWinMain', 'DllMain']);
const isMain = (fd) => fd && ENTRY_POINTS.has(fd.name) && !fd.qualifier && !cf.enclosing(fd, ['RecordDecl', 'NamespaceDecl']);

// Has side effects (assignment, ++/--, call, new/delete, throw, volatile access).
function hasSideEffects(e) {
  let found = false;
  cf.walk(e, (n) => {
    if (found) return cf.walk.STOP;
    if (n.type === 'LambdaExpr') return cf.walk.SKIP;
    if (n.type === 'AssignExpr' || n.type === 'CallExpr' || n.type === 'NewExpr' || n.type === 'DeleteExpr' || n.type === 'ThrowExpr' || n.type === 'StmtExpr') found = true;
    else if (n.type === 'UnaryExpr' && (n.op === '++' || n.op === '--' || n.op === 'co_await' || n.op === 'co_yield')) found = true;
    else if (n.type === 'Identifier' && n.ctype && MU.canon(n.ctype).volatile) found = true;
    return undefined;
  });
  return found;
}

// Function definitions in user code (excluding defaulted / deleted).
const fnDefs = (unit) => MU.ix(unit).funcs.filter((f) => !f.isDefault && !f.isDeleted);

// Body walk that stays inside one function (skips nested lambdas and local classes).
function walkBody(fn, visit) {
  if (!fn || !fn.body) return;
  cf.walk(fn.body, (n, p, k) => {
    if (n !== fn.body && (n.type === 'LambdaExpr' || n.type === 'RecordDecl')) return cf.walk.SKIP;
    return visit(n, p, k);
  });
}

module.exports = {
  ...MU,
  at, userFiles, rawTokenFiles, tokensIn, codeTokens, userComments, libCalls, stdCalls, specs, hasFnSpec, hasStorage,
  typeSpecName, stdTemplate, inTemplate, isMain, hasSideEffects, fnDefs, walkBody,
};
