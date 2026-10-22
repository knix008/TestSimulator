'use strict';

// AST traversal helpers shared by every C/C++ module.
// VISITOR_KEYS lists, per node type, the fields that hold child nodes (in
// source order). Fields not listed here (loc, ctype, symbol, specs shared by
// several declarators ...) are never traversed.

const VISITOR_KEYS = {
  TranslationUnit: ['decls'],
  Declaration: ['specs', 'declarators'],
  DeclSpec: ['attributes', 'alignas', 'typeSpec'],
  AlignasSpec: ['arg'],
  Attribute: [],
  BuiltinType: ['bits'],
  NamedType: ['templateArgs'],
  AutoType: [],
  TypeofType: ['arg'],
  DecltypeType: ['expr'],
  AtomicType: ['typeName'],
  RecordDecl: ['attributes', 'templateArgs', 'bases', 'members'],
  BaseSpecifier: ['templateArgs'],
  EnumDecl: ['underlying', 'enumerators'],
  EnumConstant: ['value'],
  AccessSpec: [],
  VarDecl: ['declarator', 'init', 'attributes'],
  FieldDecl: ['declarator', 'bitWidth', 'init', 'attributes'],
  TypedefDecl: ['declarator', 'attributes'],
  FunctionDecl: ['declarator', 'krDecls', 'ctorInits', 'body', 'attributes'],
  BindingDecl: ['init'],
  ParamDecl: ['specs', 'declarator', 'default'],
  CtorInit: ['args'],
  IdentDeclarator: ['templateArgs'],
  AbstractDeclarator: [],
  PointerDeclarator: ['inner'],
  ReferenceDeclarator: ['inner'],
  MemberPointerDeclarator: ['inner'],
  ArrayDeclarator: ['inner', 'size'],
  FunctionDeclarator: ['inner', 'params', 'noexceptExpr', 'trailingReturn'],
  BindingDeclarator: [],
  TypeName: ['specs', 'declarator'],
  ParenListInit: ['args'],
  // declarations (C++)
  NamespaceDecl: ['decls'],
  NamespaceAlias: [],
  UsingDirective: [],
  UsingDecl: [],
  AliasDecl: ['typeName'],
  TemplateDecl: ['params', 'requires', 'decl'],
  TemplateParam: ['param', 'typeName', 'default', 'params'],
  ConceptDecl: ['expr'],
  LinkageSpec: ['decls'],
  StaticAssert: ['cond', 'message'],
  EmptyDecl: [],
  ErrorDecl: [],
  AsmDecl: [],
  ModuleDecl: [],
  MacroCallDecl: [],
  // statements
  CompoundStmt: ['body'],
  ExprStmt: ['expr'],
  IfStmt: ['init', 'cond', 'then', 'else'],
  SwitchStmt: ['init', 'cond', 'body'],
  CaseStmt: ['value', 'high', 'body'],
  DefaultStmt: ['body'],
  LabelStmt: ['body'],
  WhileStmt: ['cond', 'body'],
  DoStmt: ['body', 'cond'],
  ForStmt: ['init', 'cond', 'inc', 'body'],
  RangeForStmt: ['init', 'decl', 'range', 'body'],
  GotoStmt: ['target'],
  ContinueStmt: [],
  BreakStmt: [],
  ReturnStmt: ['arg'],
  NullStmt: [],
  TryStmt: ['body', 'handlers'],
  CatchClause: ['param', 'body'],
  AsmStmt: [],
  ErrorStmt: [],
  // expressions
  Identifier: ['templateArgs'],
  IntegerLiteral: [],
  FloatingLiteral: [],
  CharLiteral: [],
  StringLiteral: [],
  BoolLiteral: [],
  NullptrLiteral: [],
  ThisExpr: [],
  ParenExpr: ['expr'],
  UnaryExpr: ['arg'],
  BinaryExpr: ['left', 'right'],
  AssignExpr: ['left', 'right'],
  ConditionalExpr: ['test', 'consequent', 'alternate'],
  CallExpr: ['callee', 'args'],
  MemberExpr: ['object', 'templateArgs'],
  IndexExpr: ['object', 'index'],
  CastExpr: ['typeName', 'arg', 'args'],
  SizeofExpr: ['typeName', 'arg'],
  SizeofPackExpr: [],
  AlignofExpr: ['typeName', 'arg'],
  CompoundLiteral: ['typeName', 'init'],
  InitList: ['items'],
  DesignatedInit: ['designators', 'value'],
  Designator: ['index', 'high'],
  GenericSelection: ['control', 'assocs'],
  GenericAssoc: ['typeName', 'expr'],
  StmtExpr: ['body'],
  LambdaExpr: ['captures', 'templateParams', 'params', 'trailingReturn', 'body'],
  LambdaCapture: ['init'],
  NewExpr: ['placement', 'typeName', 'init'],
  DeleteExpr: ['arg'],
  ThrowExpr: ['arg'],
  TypeidExpr: ['typeName', 'arg'],
  NoexceptExpr: ['arg'],
  VaArgExpr: ['arg', 'typeName'],
  OffsetofExpr: ['typeName', 'designators'],
  PackExpansion: ['expr'],
  FoldExpr: ['left', 'right'],
  RequiresExpr: [],
  AddrLabelExpr: [],
};

const SKIP = Symbol('skip');
const STOP = Symbol('stop');

function childrenOf(node) {
  const out = [];
  const keys = VISITOR_KEYS[node.type] || genericKeys(node);
  for (const k of keys) {
    const v = node[k];
    if (v == null) continue;
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c === 'object' && c.type) out.push(c); } else if (typeof v === 'object' && v.type) out.push(v);
  }
  return out;
}

function genericKeys(node) {
  return Object.keys(node).filter((k) => k !== 'loc' && k !== 'ctype' && k !== 'symbol' && k !== 'specs' && k !== 'scope' && !k.startsWith('_'));
}

// walk(root, { enter(node, parent, key), leave(node, parent, key) })
// enter may return walk.SKIP (do not visit children) or walk.STOP (abort).
// A plain function is treated as `enter`.
// Iterative (explicit stack), so arbitrarily deep trees cannot overflow the JS stack.
function walk(root, visitor) {
  if (!root) return;
  const v = typeof visitor === 'function' ? { enter: visitor } : visitor || {};
  const roots = Array.isArray(root) ? root : [root];
  for (const r of roots) {
    if (r && walkOne(r, v) === STOP) return;
  }
}

function childPairs(node) {
  const out = [];
  const keys = VISITOR_KEYS[node.type] || genericKeys(node);
  for (const k of keys) {
    const c = node[k];
    if (c == null) continue;
    if (Array.isArray(c)) {
      for (const x of c) if (x && typeof x === 'object' && x.type) out.push(x, k);
    } else if (typeof c === 'object' && c.type) out.push(c, k);
  }
  return out;
}

function walkOne(root, v) {
  // frame: [node, parent, key, children (flat [child, key, ...]) | null, index]
  const stack = [[root, null, null, null, 0]];
  while (stack.length) {
    const top = stack[stack.length - 1];
    if (top[3] === null) {
      if (v.enter) {
        const r = v.enter(top[0], top[1], top[2]);
        if (r === STOP) return STOP;
        if (r === SKIP || r === false) {
          stack.pop();
          if (v.leave) v.leave(top[0], top[1], top[2]);
          continue;
        }
      }
      top[3] = childPairs(top[0]);
    }
    const kids = top[3];
    if (top[4] < kids.length) {
      const c = kids[top[4]], k = kids[top[4] + 1];
      top[4] += 2;
      stack.push([c, top[0], k, null, 0]);
    } else {
      stack.pop();
      if (v.leave) v.leave(top[0], top[1], top[2]);
    }
  }
  return undefined;
}
walk.SKIP = SKIP;
walk.STOP = STOP;

// findAll(root, 'CallExpr' | ['IfStmt','WhileStmt'] | (node, parent) => bool)
function findAll(root, what) {
  const out = [];
  let test;
  if (typeof what === 'function') test = what;
  else if (Array.isArray(what)) { const s = new Set(what); test = (n) => s.has(n.type); } else test = (n) => n.type === what;
  walk(root, (n, p) => { if (test(n, p)) out.push(n); });
  return out;
}

function findFirst(root, what) {
  let found = null;
  const test = typeof what === 'function' ? what : Array.isArray(what) ? ((n) => what.includes(n.type)) : ((n) => n.type === what);
  walk(root, (n, p) => { if (test(n, p)) { found = n; return STOP; } return undefined; });
  return found;
}

const PARENTS = new WeakMap();
const KEYS = new WeakMap();

function attachParents(root) {
  walk(root, (n, p, k) => {
    if (p) { PARENTS.set(n, p); KEYS.set(n, k); }
  });
  return root;
}

function parentOf(node) { return PARENTS.get(node) || null; }
function parentKey(node) { return KEYS.get(node) || null; }

function ancestors(node) {
  const out = [];
  let p = PARENTS.get(node);
  while (p) { out.push(p); p = PARENTS.get(p); }
  return out;
}

function enclosing(node, type) {
  const test = typeof type === 'function' ? type : Array.isArray(type) ? ((n) => type.includes(n.type)) : ((n) => n.type === type);
  let p = PARENTS.get(node);
  while (p) { if (test(p)) return p; p = PARENTS.get(p); }
  return null;
}

// Strip ParenExpr wrappers.
function skipParens(e) {
  while (e && e.type === 'ParenExpr') e = e.expr;
  return e;
}

module.exports = { VISITOR_KEYS, walk, findAll, findFirst, childrenOf, attachParents, parentOf, parentKey, ancestors, enclosing, skipParens, SKIP, STOP };
