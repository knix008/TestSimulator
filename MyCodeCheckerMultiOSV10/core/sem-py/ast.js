'use strict';

// AST helpers: child fields per node type, parent links, generic walks,
// structural equality, constant helpers and source slices.

const FIELDS = {
  Module: ['body'],
  FunctionDef: ['decorator_list', 'type_params', 'args', 'returns', 'body'],
  AsyncFunctionDef: ['decorator_list', 'type_params', 'args', 'returns', 'body'],
  ClassDef: ['decorator_list', 'type_params', 'bases', 'keywords', 'body'],
  Return: ['value'], Delete: ['targets'], Assign: ['targets', 'value'], AugAssign: ['target', 'value'],
  AnnAssign: ['target', 'annotation', 'value'], TypeAlias: ['name', 'type_params', 'value'],
  For: ['target', 'iter', 'body', 'orelse'], AsyncFor: ['target', 'iter', 'body', 'orelse'],
  While: ['test', 'body', 'orelse'], If: ['test', 'body', 'orelse'],
  With: ['items', 'body'], AsyncWith: ['items', 'body'], withitem: ['context_expr', 'optional_vars'],
  Match: ['subject', 'cases'], match_case: ['pattern', 'guard', 'body'],
  Raise: ['exc', 'cause'], Try: ['body', 'handlers', 'orelse', 'finalbody'], TryStar: ['body', 'handlers', 'orelse', 'finalbody'],
  ExceptHandler: ['etype', 'body'], Assert: ['test', 'msg'], Import: ['names'], ImportFrom: ['names'],
  Global: [], Nonlocal: [], Pass: [], Break: [], Continue: [], ErrorStmt: [], alias: [],
  Expr: ['value'],
  BoolOp: ['values'], NamedExpr: ['target', 'value'], BinOp: ['left', 'right'], UnaryOp: ['operand'],
  Lambda: ['args', 'body'], IfExp: ['test', 'body', 'orelse'], Dict: ['keys', 'values'], Set: ['elts'],
  ListComp: ['elt', 'generators'], SetComp: ['elt', 'generators'], GeneratorExp: ['elt', 'generators'],
  DictComp: ['key', 'value', 'generators'], comprehension: ['target', 'iter', 'ifs'],
  Await: ['value'], Yield: ['value'], YieldFrom: ['value'], Compare: ['left', 'comparators'],
  Call: ['func', 'args', 'keywords'], keyword: ['value'], FormattedValue: ['value', 'format_spec'],
  Interpolation: ['value', 'format_spec'], JoinedStr: ['values'], TemplateStr: ['values'], Constant: [],
  Attribute: ['value'], Subscript: ['value', 'slice'], Starred: ['value'], Name: [], List: ['elts'], Tuple: ['elts'],
  Slice: ['lower', 'upper', 'step'],
  arguments: ['posonlyargs', 'args', 'vararg', 'kwonlyargs', 'kw_defaults', 'defaults', 'kwarg'], arg: ['annotation'],
  MatchValue: ['value'], MatchSingleton: [], MatchSequence: ['patterns'], MatchMapping: ['keys', 'patterns'],
  MatchClass: ['cls', 'patterns', 'kwd_patterns'], MatchStar: [], MatchAs: ['pattern'], MatchOr: ['patterns'],
  TypeVar: ['bound', 'default_value'], ParamSpec: ['default_value'], TypeVarTuple: ['default_value'],
};

const FUNC_TYPES = new Set(['FunctionDef', 'AsyncFunctionDef']);
const SCOPE_TYPES = new Set(['FunctionDef', 'AsyncFunctionDef', 'ClassDef', 'Lambda', 'ListComp', 'SetComp', 'DictComp', 'GeneratorExp']);
const STMT_TYPES = new Set(['FunctionDef', 'AsyncFunctionDef', 'ClassDef', 'Return', 'Delete', 'Assign', 'AugAssign', 'AnnAssign', 'TypeAlias',
  'For', 'AsyncFor', 'While', 'If', 'With', 'AsyncWith', 'Match', 'Raise', 'Try', 'TryStar', 'Assert', 'Import', 'ImportFrom',
  'Global', 'Nonlocal', 'Expr', 'Pass', 'Break', 'Continue', 'ErrorStmt']);

function children(n) {
  const out = [];
  const f = FIELDS[n.type];
  if (!f) return out;
  for (const k of f) {
    const v = n[k];
    if (!v) continue;
    if (Array.isArray(v)) { for (const x of v) if (x) out.push(x); } else if (typeof v === 'object') out.push(v);
  }
  return out;
}

// Normalizes `arguments` objects (parser leaves them typeless) and sets
// parent links. Returns the list of all nodes in pre-order.
function link(root) {
  const all = [];
  const stack = [[root, null]];
  while (stack.length) {
    const [n, parent] = stack.pop();
    if (n.args && (n.type === 'FunctionDef' || n.type === 'AsyncFunctionDef' || n.type === 'Lambda') && !n.args.type) n.args.type = 'arguments';
    n.parent = parent;
    all.push(n);
    const ch = children(n);
    for (let i = ch.length - 1; i >= 0; i--) stack.push([ch[i], n]);
  }
  return all;
}

// pre-order walk; visit(n) returning false skips children
function walk(n, visit) {
  if (!n) return;
  if (visit(n) === false) return;
  for (const c of children(n)) walk(c, visit);
}

// walk without descending into nested scopes (functions, classes, lambdas, comprehensions)
function walkLocal(n, visit, includeRoot) {
  const ch = includeRoot ? [n] : children(n);
  for (const c of ch) {
    if (visit(c) === false) continue;
    if (SCOPE_TYPES.has(c.type)) {
      // still visit parts evaluated in the enclosing scope
      if (FUNC_TYPES.has(c.type)) {
        for (const d of c.decorator_list) walkLocal(d, visit, true);
        for (const d of c.args.defaults) walkLocal(d, visit, true);
        for (const d of c.args.kw_defaults) if (d) walkLocal(d, visit, true);
      } else if (c.type === 'ClassDef') {
        for (const d of c.decorator_list) walkLocal(d, visit, true);
        for (const d of c.bases) walkLocal(d, visit, true);
        for (const d of c.keywords) walkLocal(d, visit, true);
      } else if (c.type === 'Lambda') {
        for (const d of c.args.defaults) walkLocal(d, visit, true);
      } else if (c.generators && c.generators[0]) {
        walkLocal(c.generators[0].iter, visit, true);
      }
      continue;
    }
    walkLocal(c, visit, false);
  }
}

function isFunc(n) { return n && FUNC_TYPES.has(n.type); }

function enclosingFunction(n) {
  let p = n.parent;
  while (p) {
    if (FUNC_TYPES.has(p.type) || p.type === 'Lambda') return p;
    if (p.type === 'ClassDef' || p.type === 'Module') return null;
    p = p.parent;
  }
  return null;
}

function enclosingStatement(n) {
  let p = n;
  while (p && !STMT_TYPES.has(p.type)) p = p.parent;
  return p;
}

function enclosingClass(fn) {
  const p = fn && fn.parent;
  return p && p.type === 'ClassDef' ? p : null;
}

function dotted(e) {
  if (!e) return null;
  if (e.type === 'Name') return e.id;
  if (e.type === 'Attribute') {
    const b = dotted(e.value);
    return b ? b + '.' + e.attr : null;
  }
  return null;
}

function isConst(e) { return e && e.type === 'Constant'; }
function isNone(e) { return e && e.type === 'Constant' && e.kind === 'None'; }
function isStr(e) { return e && e.type === 'Constant' && e.kind === 'str'; }
function isNum(e) { return e && e.type === 'Constant' && (e.kind === 'int' || e.kind === 'float' || e.kind === 'complex'); }
function isBoolConst(e) { return e && e.type === 'Constant' && e.kind === 'bool'; }
function isTrue(e) { return isBoolConst(e) && e.value === true; }
function isFalse(e) { return isBoolConst(e) && e.value === false; }

// numeric value of a literal (handles unary minus)
function numValue(e) {
  if (!e) return null;
  if (e.type === 'Constant' && (e.kind === 'int' || e.kind === 'float')) return e.value;
  if (e.type === 'Constant' && e.kind === 'bool') return e.value ? 1 : 0;
  if (e.type === 'UnaryOp' && e.op === 'USub') { const v = numValue(e.operand); return v == null ? null : -v; }
  if (e.type === 'UnaryOp' && e.op === 'UAdd') return numValue(e.operand);
  return null;
}

// literal value if the expression is a compile-time literal (str/bytes/num/bool/None)
function literalKind(e) {
  if (!e) return null;
  if (e.type === 'Constant') return e.kind;
  if (e.type === 'UnaryOp' && (e.op === 'USub' || e.op === 'UAdd') && isNum(e.operand)) return e.operand.kind;
  if (e.type === 'JoinedStr') return 'str';
  return null;
}

function kw(call, name) {
  if (!call || !call.keywords) return null;
  for (const k of call.keywords) if (k.arg === name) return k.value;
  return null;
}

function hasKwargsSplat(call) { return call.keywords.some((k) => k.arg === null) || call.args.some((a) => a.type === 'Starred'); }

// positional argument i or keyword `name`
function arg(call, i, name) {
  if (name) { const v = kw(call, name); if (v) return v; }
  if (i != null && i < call.args.length && !call.args.slice(0, i + 1).some((a) => a.type === 'Starred')) return call.args[i];
  return null;
}

// Structural equality ignoring positions.
const SKIP_KEYS = new Set(['line', 'col', 'endLine', 'endCol', 'parent', 'parenthesized', 'parenLine', 'parenCol', 'attrLine', 'attrCol',
  'nameLine', 'nameCol', 'implicitConcat', 'opTok', 'strToks', 'defLine', 'decoLine', 'hasError', 'scope', 'sym', 'inFString', 'fieldCount', 'raw', '_id', 'cfg', 'info', 'ctx', 'augUse', 'isElif', 'prefix', 'simple', 'msg', 'error']);

function same(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false;
    return true;
  }
  if (a.type !== b.type) return false;
  const f = FIELDS[a.type] || [];
  for (const k of f) if (!same(a[k], b[k])) return false;
  for (const k of Object.keys(a)) {
    if (SKIP_KEYS.has(k) || f.includes(k)) continue;
    const va = a[k];
    if (va === null || typeof va !== 'object') { if (va !== b[k] && !(va == null && b[k] == null)) return false; } else if (Array.isArray(va) && (va.length === 0 || typeof va[0] !== 'object')) { if (!same(va, b[k])) return false; }
  }
  return true;
}

function sameList(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false;
  return true;
}

// true if the expression has no side effects we can see (names, attributes, literals, pure operators)
function isPure(e) {
  let pure = true;
  walk(e, (n) => {
    if (!pure) return false;
    if (n.type === 'Call' || n.type === 'Await' || n.type === 'Yield' || n.type === 'YieldFrom' || n.type === 'NamedExpr') { pure = false; return false; }
    return true;
  });
  return pure;
}

// Line-start offset table for slicing node source text.
function makeSlicer(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return (n) => {
    if (!n || !n.line) return '';
    const a = (starts[n.line - 1] || 0) + n.col;
    const b = (starts[(n.endLine || n.line) - 1] || 0) + (n.endCol == null ? n.col : n.endCol);
    return text.slice(a, Math.max(a, b));
  };
}

function short(s, max = 40) {
  s = String(s).replace(/\s+/g, ' ');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// names bound by an assignment target
function targetNames(t, out = []) {
  if (!t) return out;
  if (t.type === 'Name') out.push(t);
  else if (t.type === 'Tuple' || t.type === 'List') for (const e of t.elts) targetNames(e, out);
  else if (t.type === 'Starred') targetNames(t.value, out);
  return out;
}

function lastStatementTerminates(body) {
  const last = body[body.length - 1];
  if (!last) return false;
  return last.type === 'Return' || last.type === 'Raise' || last.type === 'Continue' || last.type === 'Break';
}

// the docstring node of a body, if any
function docstring(body) {
  const f = body && body[0];
  return f && f.type === 'Expr' && isStr(f.value) ? f.value : null;
}

module.exports = {
  FIELDS, FUNC_TYPES, SCOPE_TYPES, STMT_TYPES, children, link, walk, walkLocal, isFunc, enclosingFunction, enclosingStatement, enclosingClass,
  dotted, isConst, isNone, isStr, isNum, isBoolConst, isTrue, isFalse, numValue, literalKind, kw, arg, hasKwargsSplat, same, sameList, isPure,
  makeSlicer, short, targetNames, lastStatementTerminates, docstring,
};
