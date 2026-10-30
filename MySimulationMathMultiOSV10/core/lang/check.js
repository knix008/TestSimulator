// Static checks of an M file for the editor's 문제점 (Problems) panel, and the
// catalog of everything the 도움말 (Help) panel lists.
//
// checkSource(rt, src, { workspace }) → [{ severity, line, col, code, name?, message }]
//   severity: 'error' | 'warning' | 'info'
//   code:     'parse'          syntax error (message: the parser's text)
//             'undefined'      a name that is no variable, local function or known function
//             'unused'         a function's variable that is set but never read
//             'outputNotSet'   a function output that is never assigned
//             'duplicateFunction' two functions of the same name in the file
//   Names are checked per scope (the script part, each function); a name set
//   anywhere in the scope counts as defined (no flow analysis). Scripts also
//   see the base workspace (`workspace: true`, the default).
// catalog(rt) → [{ name, kind: 'function' | 'constant', area, en, ko }]
import { parse } from './parser.js';
import { KEYWORDS } from './lexer.js';

/** Builtins that are values rather than operations (shown as 상수 / constants). */
export const CONSTANT_NAMES = new Set(['pi', 'eps', 'Inf', 'inf', 'NaN', 'nan', 'NA', 'i', 'j', 'I', 'J', 'true', 'false', 'realmax', 'realmin', 'intmax', 'intmin', 'flintmax']);

// Names every function or script has without assigning them.
const IMPLICIT = new Set(['ans', 'nargin', 'nargout', 'varargin', 'varargout', 'end']);

function newScope(kind, fn) {
  return { kind, fn, defined: new Map(), used: new Map(), anon: [] };
}

function define(scope, name, line) { if (name && !scope.defined.has(name)) scope.defined.set(name, line); }
function use(scope, name, line) {
  if (!name || scope.anon.some((p) => p.includes(name))) return;
  if (!scope.used.has(name)) scope.used.set(name, line);
}

function defineLv(scope, lv, line) {
  if (!lv || lv.t !== 'lv') return;
  // x(k) = … / s.f = … read x when it already exists; the chain's indices are reads
  for (const c of lv.chain || []) visit(c.args, scope, line);
  define(scope, lv.name, line);
}

function visit(node, scope, line) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) visit(n, scope, line); return; }
  if (typeof node.line === 'number') line = node.line;
  switch (node.t) {
    case 'assign': visit(node.rhs, scope, line); defineLv(scope, node.lhs, line); return;
    case 'massign': visit(node.rhs, scope, line); for (const lv of node.lhs || []) defineLv(scope, lv, line); return;
    case 'for': visit(node.e, scope, line); defineLv(scope, node.lv, line); visit(node.body, scope, line); return;
    case 'try': visit(node.body, scope, line); if (node.id) define(scope, node.id, line); visit(node.cbody, scope, line); return;
    case 'global': case 'persistent':
      for (const n of node.names || []) define(scope, n, line);
      for (const [, e] of node.inits || []) visit(e, scope, line);
      return;
    case 'id': use(scope, node.name, line); return;
    case 'index':
      visit(node.base, scope, line);
      for (const c of node.chain || []) { if (c.args) visit(c.args, scope, line); if (c.expr) visit(c.expr, scope, line); }
      return;
    case 'fh': if (node.name && !node.name.includes('.')) use(scope, node.name, line); return;
    case 'anon':
      scope.anon.push(node.params || []);
      visit(node.body, scope, line);
      scope.anon.pop();
      return;
    case 'cmd': use(scope, node.name, line); return;
    case 'num': case 'str': case 'colon': case 'end': case 'tilde': case 'meta': case 'shell': case 'super': return;
    default:
      for (const [k, v] of Object.entries(node)) if (k !== 't' && v && typeof v === 'object') visit(v, scope, line);
  }
}

/** 1-based column of `name` as a whole word on the line (not a field after '.'), else 1. */
function colOf(lines, line, name) {
  const text = lines[line - 1] || '';
  const re = new RegExp(`(^|[^\\w.])(${name})(?!\\w)`, 'g');
  for (let m; (m = re.exec(text));) {
    const before = text.slice(0, m.index + m[1].length);
    const q = (before.match(/'/g) || []).length + (before.match(/"/g) || []).length;
    const pct = before.indexOf('%');
    if (pct >= 0) break;
    if (q % 2 === 0) return m.index + m[1].length + 1;
  }
  return 1;
}

function knownName(rt, name) {
  if (KEYWORDS.has(name) || IMPLICIT.has(name)) return true;
  if (rt.help && rt.help[name]) return true;
  try { return !!rt.resolve(name); } catch { return false; }
}

export function checkSource(rt, src, opts = {}) {
  const text = String(src || '');
  const lines = text.split(/\r?\n/);
  let ast;
  try {
    ast = parse(text, { file: opts.file || undefined });
  } catch (e) {
    const p = (e && e.extra && e.extra.parse) || {};
    const line = p.line || e.parseLine || 1;
    return [{ severity: 'error', line, col: p.col || 1, code: 'parse', message: String((e && e.message) || e) }];
  }
  if (!ast || ast.kind === 'classdef' || ast.classdef) return [];
  const out = [];
  const fns = [];
  const parentOf = new Map();
  const collect = (list, parent) => { for (const f of list || []) { fns.push(f); if (parent) parentOf.set(f, parent); collect(f.nested, f); } };
  collect(ast.functions);
  const local = new Set(fns.map((f) => f.name));
  const seen = new Map();
  for (const f of fns) {
    if (seen.has(f.name)) out.push({ severity: 'error', line: f.line, col: colOf(lines, f.line, f.name), code: 'duplicateFunction', name: f.name, message: `Function "${f.name}" is defined more than once (first on line ${seen.get(f.name)}).` });
    else seen.set(f.name, f.line);
  }
  const ws = opts.workspace !== false && rt.base && rt.base.vars ? rt.base.vars : {};
  const report = (scope) => {
    for (const [name, line] of scope.used) {
      if (scope.defined.has(name) || (scope.inherited && scope.inherited.has(name)) || local.has(name)) continue;
      if (scope.kind === 'script' && Object.prototype.hasOwnProperty.call(ws, name)) continue;
      if (knownName(rt, name)) continue;
      out.push({ severity: 'warning', line, col: colOf(lines, line, name), code: 'undefined', name, message: `"${name}" is not a variable, a function in this file or a known function.` });
    }
    if (scope.kind !== 'function') return;
    const f = scope.fn;
    for (const o of f.outs || []) {
      if (o === 'varargout' || scope.defined.has(o)) continue;
      out.push({ severity: 'warning', line: f.line, col: colOf(lines, f.line, o), code: 'outputNotSet', name: o, message: `Output "${o}" of "${f.name}" is never set.` });
    }
    const params = new Set(f.params || []);
    for (const [name, line] of scope.defined) {
      if (scope.used.has(name) || (scope.usedByNested && scope.usedByNested.has(name)) || params.has(name) || (f.outs || []).includes(name)) continue;
      out.push({ severity: 'info', line, col: colOf(lines, line, name), code: 'unused', name, message: `"${name}" is set but never used.` });
    }
  };
  if (ast.body && ast.body.length) {
    const s = newScope('script', null);
    visit(ast.body, s, 1);
    report(s);
  }
  const scopes = new Map();
  for (const f of fns) {
    const s = newScope('function', f);
    for (const p of f.params || []) define(s, p, f.line);
    visit(f.body, s, f.line);
    scopes.set(f, s);
  }
  // nested functions share their parent's variables both ways
  for (const [f, p] of parentOf) {
    const s = scopes.get(f), ps = scopes.get(p);
    for (const [n, l] of ps.defined) if (!s.defined.has(n)) s.inherited = (s.inherited || new Map()).set(n, l);
    for (const [n] of s.used) ps.usedByNested = (ps.usedByNested || new Set()).add(n);
  }
  for (const s of scopes.values()) report(s);
  const rank = { error: 0, warning: 1, info: 2 };
  out.sort((a, b) => a.line - b.line || a.col - b.col || rank[a.severity] - rank[b.severity]);
  return out;
}

/** Every documented builtin (internal __names left out), by area. */
export function catalog(rt) {
  const owner = (rt.registry && rt.registry.owner) || {};
  const out = [];
  for (const [name, h] of Object.entries(rt.help || {})) {
    if (!h || name.startsWith('__')) continue;
    out.push({
      name,
      kind: CONSTANT_NAMES.has(name) ? 'constant' : 'function',
      area: owner[name] || 'lang',
      en: String(h.en || '').split('\n')[0],
      ko: String(h.ko || '').split('\n')[0],
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  return out;
}
