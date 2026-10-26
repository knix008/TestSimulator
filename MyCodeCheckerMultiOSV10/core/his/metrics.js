'use strict';

// HIS (Hersteller Initiative Software) source code metrics for C/C++.
// Everything is computed from the shared front end (core/cfamily via
// core/cfront.js projectFor); this module never changes the parse result.
//
// Definitions used here (documented so reports can be explained):
//   STMT    statements in the body: expression statements, local declarations,
//           if/switch/while/do/for, jumps (goto/break/continue/return), try,
//           asm. Blocks, labels, case/default labels and `;` are not counted.
//           Declarations in for-init / conditions belong to their statement.
//   COMF    comment lines / STMT. Comment lines are the distinct lines covered
//           by comments inside the function plus the comment block right
//           before it (the function header). File level: all comment lines of
//           the file / all statements of its functions.
//   PATH    non-cyclic execution paths: paths from entry to exit of the CFG
//           (short-circuit && / || split) where each loop back edge is
//           redirected to the loop exit (body taken once or not at all).
//           Saturates at `pathCap` (default 1e6).
//   GOTO    goto statements.
//   VG      cyclomatic complexity: 1 + if, while, do, for, range-for, case
//           labels, ?: and catch handlers (+ && / || with logicalOperators).
//   CALLING distinct functions of the project that call this one (self excluded).
//   CALLS   distinct callees called from the body (self included).
//   PARAM   declared parameters (`(void)` is 0, `...` not counted).
//   LEVEL   maximum nesting of if/switch/while/do/for (else-if keeps the level).
//   RETURN  exit points: return statements + 1 when the end of the body is
//           reachable.
//   VOCF    Halstead (N1 + N2) / (n1 + n2) over the function's tokens.
//           Operands are identifiers and literals; operators are keywords and
//           punctuators (closing ) ] } are not counted, a pair counts once).

const { cf, projectFor } = require('../cfront');

const DEFAULT_PATH_CAP = 1e6;

const STMT_TYPES = new Set([
  'ExprStmt', 'Declaration', 'IfStmt', 'SwitchStmt', 'WhileStmt', 'DoStmt', 'ForStmt', 'RangeForStmt',
  'GotoStmt', 'ContinueStmt', 'BreakStmt', 'ReturnStmt', 'TryStmt', 'AsmStmt', 'StaticAssert',
]);
const NEST_TYPES = new Set(['IfStmt', 'SwitchStmt', 'WhileStmt', 'DoStmt', 'ForStmt', 'RangeForStmt']);
const DECISION_TYPES = new Set(['IfStmt', 'WhileStmt', 'DoStmt', 'ForStmt', 'RangeForStmt', 'CaseStmt', 'ConditionalExpr', 'CatchClause']);
// Nested code that is not part of the function's own control flow.
const SKIP_TYPES = new Set(['LambdaExpr', 'RecordDecl']);
const CLOSERS = new Set([')', ']', '}']);

function isBuiltinFile(file) {
  return !file || String(file).startsWith('<');
}

// Walk the function body (pre-order) with the nesting level, skipping lambdas
// and local classes.
function walkBody(body, visit) {
  const stack = [{ node: body, level: 0, parent: null }];
  while (stack.length) {
    const { node, level, parent } = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (SKIP_TYPES.has(node.type)) continue;
    visit(node, level, parent);
    const next = NEST_TYPES.has(node.type) ? level + 1 : level;
    const kids = cf.childrenOf(node);
    for (let i = kids.length - 1; i >= 0; i--) {
      const kid = kids[i];
      // The else branch of an else-if chain stays on the if's own level.
      const lvl = node.type === 'IfStmt' && kid === node.else && kid.type === 'IfStmt' ? level : next;
      stack.push({ node: kid, level: lvl, parent: node });
    }
  }
}

function calleeName(unit, call) {
  const s = call.calleeSymbol;
  if (s && (s.qname || s.name)) return s.qname || s.name;
  let c = call.callee;
  while (c && c.type === 'ParenExpr') c = c.expr;
  if (!c) return null;
  if (c.type === 'Identifier') return c.qname || c.name;
  if (c.type === 'MemberExpr') return `.${c.member}`;
  const text = cf.sourceText(unit, c);
  return text ? text.replace(/\s+/g, '') : null;
}

function astMetrics(unit, fn, opts) {
  const m = { STMT: 0, GOTO: 0, VG: 1, LEVEL: 0, RETURN: 0, CALLS: 0 };
  const callees = new Set();
  walkBody(fn.body, (node, level, parent) => {
    if (STMT_TYPES.has(node.type)) {
      const key = parent ? cf.parentKey(node) : null;
      const inHeader = node.type === 'Declaration' && (key === 'init' || key === 'cond' || key === 'decl' || node.condition);
      if (!inHeader) m.STMT++;
    }
    if (NEST_TYPES.has(node.type) && level + 1 > m.LEVEL) m.LEVEL = level + 1;
    if (DECISION_TYPES.has(node.type)) m.VG++;
    if (opts.logicalOperators && node.type === 'BinaryExpr' && (node.op === '&&' || node.op === '||')) m.VG++;
    if (node.type === 'GotoStmt') m.GOTO++;
    if (node.type === 'ReturnStmt') m.RETURN++;
    if (node.type === 'CallExpr') {
      const name = calleeName(unit, node);
      if (name) callees.add(name);
    }
  });
  m.CALLS = callees.size;
  return m;
}

// Redirect loop back edges to the loop's normal exit and count entry→sink
// paths over the resulting graph (remaining retreating edges are dropped).
function pathCount(g, cap) {
  const loops = new Map();
  try {
    for (const l of g.loops()) loops.set(l.header, l);
  } catch (_) { /* no loop info: back edges are simply dropped */ }
  const exitOf = (header) => {
    const l = loops.get(header);
    if (!l || !l.exits || !l.exits.length) return null;
    const f = l.exits.find((e) => e.kind === 'false') || l.exits[0];
    return f.to;
  };
  const succs = (b) => {
    const out = [];
    for (const e of b.succs || []) {
      if (e.kind === 'exception') continue;
      if (e.kind === 'back' || e.back) {
        const t = exitOf(e.to);
        if (t) out.push(t);
      } else out.push(e.to);
    }
    return out;
  };
  const memo = new Map();
  const onStack = new Set();
  const stack = [{ b: g.entry, list: succs(g.entry), i: 0, sum: 0, used: 0 }];
  onStack.add(g.entry);
  let result = 0;
  while (stack.length) {
    const top = stack[stack.length - 1];
    if (top.i < top.list.length) {
      const s = top.list[top.i++];
      if (memo.has(s)) { top.sum = Math.min(cap, top.sum + memo.get(s)); top.used++; continue; }
      if (onStack.has(s)) continue; // retreating edge (goto loop): dropped
      onStack.add(s);
      stack.push({ b: s, list: succs(s), i: 0, sum: 0, used: 0 });
      continue;
    }
    const value = top.used ? top.sum : 1;
    memo.set(top.b, value);
    onStack.delete(top.b);
    stack.pop();
    if (stack.length) {
      const parent = stack[stack.length - 1];
      parent.sum = Math.min(cap, parent.sum + value);
      parent.used++;
    } else result = value;
  }
  return Math.min(cap, result);
}

function endReachable(g) {
  for (const e of (g.exit && g.exit.preds) || []) {
    if (['return', 'throw', 'noreturn', 'exception'].includes(e.kind)) continue;
    if (g.isReachable(e.from)) return true;
  }
  return false;
}

function declRange(fn) {
  const p = cf.parentOf(fn);
  const outer = p && p.type === 'Declaration' && p.declarators && p.declarators.length === 1 ? p.loc : fn.loc;
  return { start: Math.min(outer.start, fn.loc.start), end: Math.max(outer.end, fn.loc.end) };
}

function tokensIn(tokens, start, end) {
  const out = [];
  let inDirective = false;
  for (let i = firstAfter(tokens, start); i < tokens.length; i++) {
    const t = tokens[i];
    if (t.start >= end) break;
    if (t.bol) inDirective = t.value === '#' && t.kind === 'punct';
    if (inDirective) continue;
    out.push(t);
  }
  return out;
}

function halstead(tokens) {
  const ops = new Map();
  const opnds = new Map();
  for (const t of tokens) {
    if (t.kind === 'identifier' || t.kind === 'number' || t.kind === 'char' || t.kind === 'string') {
      opnds.set(t.value, (opnds.get(t.value) || 0) + 1);
    } else if (t.kind === 'keyword' || t.kind === 'punct' || t.kind === 'other') {
      if (CLOSERS.has(t.value)) continue;
      ops.set(t.value, (ops.get(t.value) || 0) + 1);
    }
  }
  let N1 = 0; let N2 = 0;
  for (const v of ops.values()) N1 += v;
  for (const v of opnds.values()) N2 += v;
  return { N1, N2, n1: ops.size, n2: opnds.size };
}

// Index of the first item (sorted by offset) that ends after `offset`.
function firstAfter(list, offset) {
  let lo = 0; let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].end <= offset) lo = mid + 1; else hi = mid;
  }
  return lo;
}

function commentLines(comments, start, end, set) {
  for (let i = firstAfter(comments, start); i < comments.length; i++) {
    const c = comments[i];
    if (c.start >= end) break;
    if (c.start >= start && c.end <= end) for (let l = c.line; l <= (c.endLine || c.line); l++) set.add(l);
  }
  return set;
}

// Comment block directly before the function: comments between the previous
// code token and the function start.
function headerStart(tokens, start) {
  let i = firstAfter(tokens, start) - 1;
  while (i >= 0 && tokens[i].start >= start) i--;
  return i >= 0 ? tokens[i].end : 0;
}

function keyMap(project) {
  const byNode = new Map();
  const cg = project.callGraph;
  if (!cg || !cg.nodes) return byNode;
  for (const n of cg.nodes.values()) for (const d of n.definitions || []) if (d && d.node) byNode.set(d.node, n.key);
  return byNode;
}

function recursionSets(project) {
  const cyc = new Map(); // key -> SCC (array)
  const cg = project.callGraph;
  if (!cg || typeof cg.recursion !== 'function') return { cyc, sccs: [] };
  let sccs = [];
  try { sccs = cg.recursion() || []; } catch (_) { sccs = []; }
  for (const s of sccs) for (const k of s) cyc.set(k, s);
  return { cyc, sccs };
}

function misraCounts(list, file, line, endLine) {
  if (!Array.isArray(list)) return null;
  let n = 0;
  const rules = new Set();
  for (const f of list) {
    if (!f || f.file !== file || !/^misra/i.test(String(f.rule || ''))) continue;
    if (f.line >= line && f.line <= endLine) { n++; rules.add(f.rule); }
  }
  return { NOMV: n, NOMVPR: rules.size };
}

const round = (v, d = 3) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

// Compute the per-function rows and per-file data of one project.
function compute(files, options = {}) {
  const opts = options || {};
  const cap = Number(opts.pathCap) > 0 ? Number(opts.pathCap) : DEFAULT_PATH_CAP;
  const cfOpts = opts.cfamily || {};
  const project = projectFor(files, cfOpts);
  const keys = keyMap(project);
  const { cyc, sccs } = recursionSets(project);
  const cg = project.callGraph;
  const rows = new Map();
  const fileStats = new Map();
  const fileStat = (unit, file) => {
    let s = fileStats.get(file);
    if (!s) {
      const src = unit.sources && unit.sources.get(file);
      const lines = new Set();
      if (src) for (const c of src.comments || []) for (let l = c.line; l <= (c.endLine || c.line); l++) lines.add(l);
      s = { file, commentLines: lines.size, statements: 0, functions: new Set() };
      fileStats.set(file, s);
    }
    return s;
  };
  for (const unit of project.units || []) {
    let fns = [];
    try { fns = cf.functionsOf(unit) || []; } catch (_) { fns = []; }
    for (const fn of fns) {
      try {
        const file = fn.loc && fn.loc.file;
        if (isBuiltinFile(file) || !fn.body || fn.loc.macro) continue;
        const at = fn.nameLoc || fn.loc;
        const id = `${file}|${at.line}|${at.col}|${fn.qname || fn.name}`;
        const key = keys.get(fn);
        const callers = new Set();
        if (key && cg && cg.nodes.get(key)) for (const c of cg.nodes.get(key).callers || []) if (c !== key) callers.add(c);
        const existing = rows.get(id);
        if (existing) {
          for (const c of callers) existing._callers.add(c);
          existing.CALLING = existing._callers.size;
          if (key && cyc.has(key)) existing.ap_cg_cycle = 1;
          continue;
        }
        const src = unit.sources && unit.sources.get(file);
        const tokens = (src && src.tokens) || [];
        const range = declRange(fn);
        const ast = astMetrics(unit, fn, opts);
        let PATH = 1; let RETURN = ast.RETURN;
        try {
          const g = cf.getCFG(fn);
          PATH = pathCount(g, cap);
          if (endReachable(g)) RETURN++;
        } catch (_) {
          if (!RETURN) RETURN = 1;
        }
        const h = halstead(tokensIn(tokens, range.start, range.end));
        const lines = new Set();
        commentLines((src && src.comments) || [], headerStart(tokens, range.start), range.end, lines);
        const row = {
          file,
          function: fn.qname || fn.name,
          line: at.line,
          endLine: fn.loc.endLine,
          COMF: ast.STMT ? round(lines.size / ast.STMT) : null,
          PATH,
          GOTO: ast.GOTO,
          VG: ast.VG,
          CALLING: callers.size,
          CALLS: ast.CALLS,
          PARAM: (fn.params || []).filter((p) => p && !p.pack).length,
          STMT: ast.STMT,
          LEVEL: ast.LEVEL,
          RETURN,
          VOCF: h.n1 + h.n2 ? round((h.N1 + h.N2) / (h.n1 + h.n2)) : 0,
          ap_cg_cycle: key && cyc.has(key) ? 1 : 0,
          halstead: h,
          commentLines: lines.size,
          key: key || null,
        };
        const mv = misraCounts(opts.misraFindings, file, fn.loc.line, fn.loc.endLine);
        if (mv) Object.assign(row, mv);
        Object.defineProperty(row, '_callers', { value: callers, enumerable: false });
        rows.set(id, row);
        const fs = fileStat(unit, file);
        fs.statements += ast.STMT;
        fs.functions.add(id);
      } catch (_) {
        // A function the metrics cannot handle is skipped, never fatal.
      }
    }
  }
  const list = [...rows.values()].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
  const filesOut = [...fileStats.values()]
    .map((s) => ({ file: s.file, commentLines: s.commentLines, statements: s.statements, functions: s.functions.size, COMF: s.statements ? round(s.commentLines / s.statements) : null }))
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  return { rows: list, files: filesOut, sccs, project };
}

module.exports = { compute, pathCount, halstead, DEFAULT_PATH_CAP, round };
