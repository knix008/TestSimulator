'use strict';

// Helpers shared by the rule files.

const A = require('../ast');
const { RAISE } = require('../cfg');

// if / elsif / else chain flattened: { branches: [{ cond, body, node }], elseBody, elseLine }
function ifChain(n) {
  const branches = [];
  let cur = n;
  let elseBody = null;
  let elseLine = null;
  for (;;) {
    branches.push({ cond: cur.cond, body: cur.then, node: cur });
    const e = cur.else;
    if (e && e.length === 1 && e[0].type === 'If' && e[0].kind === 'elsif') { cur = e[0]; continue; }
    elseBody = e;
    elseLine = cur.elseLine;
    break;
  }
  return { branches, elseBody, elseLine };
}

const isBlockIf = (n) => n && n.type === 'If' && !n.mod && !n.ternary;

function hasCommentIn(cx, from, to) {
  // strictly between the two lines: a trailing comment on the opening line does not count
  for (const c of cx.comments) if (c.line > from && c.line < to) return true;
  return false;
}

function isRaise(n) {
  return !!n && n.type === 'Call' && !n.recv && RAISE.has(n.name);
}

// statement that never completes normally
function terminates(s) {
  if (!s) return false;
  switch (s.type) {
    case 'Return': case 'Break': case 'Next': case 'Redo': case 'Retry': return true;
    case 'Call': return isRaise(s);
    case 'If': {
      if (s.mod || !s.else) return false;
      const ch = ifChain(s);
      if (!ch.elseBody) return false;
      return ch.branches.every((b) => endsWithTerminator(b.body)) && endsWithTerminator(ch.elseBody);
    }
    case 'Begin':
      if (s.ensure && endsWithTerminator(s.ensure)) return true;
      return !s.rescues.length && endsWithTerminator(s.body);
    default: return false;
  }
}

function endsWithTerminator(list) {
  if (!list || !list.length) return false;
  return terminates(list[list.length - 1]);
}

// Expression without side effects whose two evaluations give the same value.
function pure(n) {
  if (!n) return true;
  switch (n.type) {
    case 'Ident': case 'IVar': case 'CVar': case 'GVar': case 'Const': case 'Self': case 'Nil': case 'True': case 'False':
    case 'Int': case 'Float': case 'Sym': return true;
    case 'Str': return !n.interp;
    case 'Paren': return n.body.length === 1 && pure(n.body[0]);
    case 'Call':
      if (n.block) return false;
      if (n.name === '[]') return pure(n.recv) && n.args.every(pure);
      if (!n.args.length && n.recv && /^[a-z_]\w*\??$/.test(n.name) && !/!$/.test(n.name)) return pure(n.recv);
      return false;
    case 'Bin': return !['=~'].includes(n.op) && pure(n.l) && pure(n.r);
    case 'Not': case 'Unary': return pure(n.e);
    default: return false;
  }
}

// statement lists of a node, by property
const STMT_KEYS = {
  Program: ['body'], Def: ['body'], Block: ['body'], Lambda: ['body'], If: ['then', 'else'], While: ['body'], For: ['body'],
  When: ['body'], InClause: ['body'], Rescue: ['body'], Begin: ['body', 'elseBody', 'ensure'], Class: ['body'], Module: ['body'],
  SClass: ['body'], Case: ['else'], Paren: ['body'],
};

function stmtLists(n) {
  const keys = STMT_KEYS[n.type];
  if (!keys) return [];
  if (n.type === 'If' && (n.mod || n.ternary)) return [];
  if (n.type === 'While' && n.mod) return [];
  const out = [];
  for (const k of keys) if (Array.isArray(n[k])) out.push(n[k]);
  return out;
}

// Last expression statement position check: true when `s` is the value of its list's owner
function isValueStmt(s) {
  const p = s.parent;
  if (!p) return false;
  for (const list of stmtLists(p)) {
    const i = list.indexOf(s);
    if (i >= 0) return i === list.length - 1;
  }
  return true;
}

const lc = (s) => String(s || '').toLowerCase();

function octal(v) {
  const s = String(v);
  if (/^0[oO][0-7]+$/.test(s)) return parseInt(s.slice(2), 8);
  if (/^0[0-7]+$/.test(s)) return parseInt(s.slice(1), 8);
  if (/^0[xX]/.test(s)) return parseInt(s.slice(2), 16);
  if (/^0[bB]/.test(s)) return parseInt(s.slice(2), 2);
  return parseInt(s, 10);
}

// Name an assignment / pair targets: for variables, attributes, constants, hash keys
function targetName(t) {
  if (!t) return null;
  switch (t.type) {
    case 'Ident': case 'IVar': case 'CVar': case 'GVar': return t.name.replace(/^[@$]+/, '');
    case 'Const': return t.name;
    case 'Call':
      if (t.name === '[]' && t.args.length === 1) return A.symOrStr(t.args[0]);
      return t.name;
    case 'Sym': return t.name;
    case 'Str': return t.value;
    default: return null;
  }
}

function inPath(cx, re) { return re.test(cx.path); }

module.exports = { ifChain, isBlockIf, hasCommentIn, isRaise, terminates, endsWithTerminator, pure, stmtLists, isValueStmt, lc, octal, targetName, inPath };
