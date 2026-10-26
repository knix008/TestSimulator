'use strict';

// Helpers shared by the rule files.

const A = require('../ast');
const M = require('../model');

function funcDecls(pf) {
  return pf.ast.decls.filter((d) => d.k === 'FuncDecl');
}

function paramFields(fn) {
  return fn.k === 'FuncLit' ? fn.type.params : fn.params;
}
function resultFields(fn) {
  return fn.k === 'FuncLit' ? fn.type.results : fn.results;
}

// func(w http.ResponseWriter, r *http.Request) and common framework contexts
function isHandler(fn) {
  const ps = paramFields(fn).map((f) => A.typeStr(f.type));
  if (ps.some((t) => /(^|\.)ResponseWriter$/.test(t)) && ps.some((t) => /^\*?http\.Request$/.test(t))) return true;
  if (ps.length === 1 && /^\*(gin\.Context|fiber\.Ctx)$|^echo\.Context$/.test(ps[0])) return true;
  return false;
}

function hasCommentIn(pf, line, endLine) {
  for (const c of pf.comments) if (c.line >= line && c.line <= endLine) return true;
  return false;
}

// a comment strictly between the braces of a block
function commentInside(pf, b) {
  const after = (c) => c.line > b.line || (c.line === b.line && c.col > b.col);
  const before = (c) => c.line < b.endLine || (c.line === b.endLine && c.col < b.endCol - 1);
  return pf.comments.some((c) => after(c) && before(c));
}

function resultsOf(pf, call) {
  try { return M.resultTypes(call, pf.resolver); } catch (e) { return null; }
}

function q(call) { return M.qualified(call); }

// enclosing loop inside the same function
function loopOf(n) { return M.inLoop(n); }

function fnOf(n) { return M.enclosingFn(n); }

function isErrorSym(sym) {
  return !!sym && (sym.tstr === 'error');
}

function isErrExpr(e) {
  e = A.strip(e);
  if (!e || e.k !== 'Ident' || !e.sym) return false;
  if (e.sym.tstr === 'error') return true;
  return !e.sym.tstr && /^err$|Err$/.test(e.name) && e.sym.local;
}

// sentinel error such as io.EOF, sql.ErrNoRows, ErrNotFound
function isSentinel(e) {
  e = A.strip(e);
  if (!e) return false;
  if (e.k === 'Selector') {
    const x = A.strip(e.x);
    if (x.k === 'Ident' && x.sym && x.sym.kind === 'pkg') return /^Err[A-Z0-9]|^EOF$|^ErrUnexpectedEOF$/.test(e.sel.name);
    return false;
  }
  if (e.k === 'Ident' && e.sym && !e.sym.local && (e.sym.kind === 'var')) return /^(Err|err)[A-Z0-9]/.test(e.name);
  return false;
}

function numVal(e) {
  e = A.strip(e);
  if (!e) return null;
  if (e.k === 'BasicLit' && (e.kind === 'int' || e.kind === 'float')) {
    const v = require('../lexer').numValue(e.value);
    return Number.isFinite(v) ? v : null;
  }
  if (e.k === 'Unary' && e.op === '-') { const v = numVal(e.x); return v == null ? null : -v; }
  return null;
}

function isIntType(t) { return M.INT_TYPES.has(t); }

function typeOf(pf, e) {
  try { return M.typeOfExpr(e, pf.resolver); } catch (err) { return ''; }
}

// the statement list that directly contains node n, and its index
function siblings(n) {
  const p = n.parent;
  if (!p) return null;
  let list = null;
  if (p.k === 'Block') list = p.stmts;
  else if (p.k === 'Case' || p.k === 'Comm') list = p.body;
  if (!list) return null;
  return { list, index: list.indexOf(n) };
}

function nameLoc(fn) {
  return fn.name ? fn.name : fn;
}

module.exports = {
  funcDecls, commentInside, paramFields, resultFields, isHandler, hasCommentIn, resultsOf, q, loopOf, fnOf, isErrorSym, isErrExpr,
  isSentinel, numVal, isIntType, typeOf, siblings, nameLoc,
};
