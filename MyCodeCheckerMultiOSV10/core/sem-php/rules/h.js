'use strict';

// Small helpers shared by the rule files.

const A = require('../ast');

const FUNC_LIKE = new Set(['FuncDecl', 'Method', 'Closure', 'ArrowFn']);

function isCall(n, names) {
  if (!n || n.k !== 'Call') return false;
  const nm = A.callName(n);
  if (!nm) return false;
  return typeof names === 'string' ? nm === names : names.has ? names.has(nm) : names.includes(nm);
}

function arg(n, i, name) { return A.argAt(n, i, name); }

function truthyLit(e) {
  e = A.unparen(e);
  if (!e) return false;
  if (e.k === 'Lit') {
    if (e.kind === 'bool') return e.value === true;
    if (e.kind === 'int') return e.value !== 0;
    if (e.kind === 'str') return ['1', 'on', 'true', 'yes', 'stdout', 'stderr'].includes(String(e.value).toLowerCase());
  }
  return false;
}

function falsyLit(e) {
  e = A.unparen(e);
  if (!e) return false;
  if (e.k === 'Lit') {
    if (e.kind === 'bool') return e.value === false;
    if (e.kind === 'int') return e.value === 0;
    if (e.kind === 'null') return true;
    if (e.kind === 'str') return ['', '0', 'off', 'false', 'no'].includes(String(e.value).toLowerCase());
  }
  return false;
}

function constName(e) {
  e = A.unparen(e);
  if (!e) return '';
  if (e.k === 'Name') return A.shortName(e.name);
  if (e.k === 'CConst' && typeof e.name === 'string') return A.shortName(e.name);
  return '';
}

// string value of a literal or a concatenation of literals
function strConst(e) {
  e = A.unparen(e);
  if (!e) return null;
  if (e.k === 'Lit' && e.kind === 'str') return e.value;
  if (e.k === 'Bin' && e.op === '.') {
    const l = strConst(e.l);
    const r = strConst(e.r);
    if (l != null && r != null) return l + r;
  }
  return null;
}

function intConst(e) {
  e = A.unparen(e);
  if (!e) return null;
  if (e.k === 'Lit' && (e.kind === 'int')) return e.value;
  if (e.k === 'Unary' && e.op === '-') { const v = intConst(e.e); return v == null ? null : -v; }
  return null;
}

function arrItem(arr, key) {
  arr = A.unparen(arr);
  if (!arr || arr.k !== 'Arr') return undefined;
  for (const it of arr.items) {
    if (!it || !it.key) continue;
    const k = A.strVal(it.key);
    if (k != null && k.toLowerCase() === key.toLowerCase()) return it;
    const c = constName(it.key);
    if (c && c.toLowerCase() === key.toLowerCase()) return it;
  }
  return undefined;
}

function methodsOf(cls) { return cls.members.filter((m) => m.k === 'Method'); }
function propsOf(cls) { return cls.members.filter((m) => m.k === 'PropDecl'); }

function functionsIn(pf) {
  const out = [];
  for (const k of FUNC_LIKE) for (const n of pf.byKind.get(k) || []) out.push(n);
  out.sort((a, b) => a.pos - b.pos);
  return out;
}

function fnLabel(n) {
  if (n.k === 'FuncDecl') return `function "${n.name}"`;
  if (n.k === 'Method') return `method "${n.name}"`;
  return 'anonymous function';
}
function fnLabelKo(n) {
  if (n.k === 'FuncDecl') return `함수 "${n.name}"`;
  if (n.k === 'Method') return `메서드 "${n.name}"`;
  return '익명 함수';
}

function isTestClass(cls) {
  return cls && cls.k === 'ClassDecl' && cls.ext.some((e) => /TestCase$/.test(A.shortName(e.name)));
}

function hasDocTag(pf, node, tag) {
  const from = Math.max(0, node.pos - 400);
  const before = pf.src.slice(from, node.pos);
  const end = before.lastIndexOf('*/');
  if (end < 0) return false;
  const tail = before.slice(end + 2);
  if (/[;{}]/.test(tail)) return false;
  const start = before.lastIndexOf('/**', end);
  return start >= 0 && before.slice(start, end).includes(tag);
}

function hasAttr(node, name) {
  return !!(node.attrs && node.attrs.some((a) => A.shortName(a.name).toLowerCase() === name.toLowerCase()));
}

function isTestMethod(pf, m) {
  return m.k === 'Method' && (/^test/i.test(m.name) || hasDocTag(pf, m, '@test') || hasAttr(m, 'Test') || hasAttr(m, 'DataProvider') && /^test/i.test(m.name));
}

// comment text inside [from, to)
function commentsIn(pf, from, to) {
  return pf.comments.filter((c) => c.pos >= from && c.end <= to);
}

function bodyStmts(fnNode) {
  if (!fnNode.body) return [];
  if (fnNode.body.k === 'Block') return fnNode.body.stmts;
  return [];
}

const lc = (s) => String(s || '').toLowerCase();

module.exports = {
  isCall, arg, truthyLit, falsyLit, constName, strConst, intConst, arrItem, methodsOf, propsOf, functionsIn,
  fnLabel, fnLabelKo, isTestClass, hasDocTag, hasAttr, isTestMethod, commentsIn, bodyStmts, lc, FUNC_LIKE,
};
