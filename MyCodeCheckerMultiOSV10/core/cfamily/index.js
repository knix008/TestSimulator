'use strict';

// C/C++ front end for MyCodeChecker. Entry points:
//
//   parseUnit(text, opts)      -> Unit
//   parseProject(files, opts)  -> { units, globalSymbols, callGraph, diagnostics }
//
// plus re-exports of every layer (lexer, preprocessor, parser, types,
// symbols, essential types, CFG / dataflow) and AST helpers. AST.md is the
// reference for all node types and APIs.

const posix = require('path').posix;
const lexer = require('./lexer');
const pp = require('./preprocess');
const parser = require('./parser');
const types = require('./types');
const symbols = require('./symbols');
const essential = require('./essential');
const cfg = require('./cfg');
const ast = require('./ast');

const HEADER_EXT = new Set(['.h', '.hh', '.hpp', '.hxx', '.h++', '.inl', '.ipp', '.tpp', '.tcc']);
const CPP_EXT = new Set(['.cpp', '.cc', '.cxx', '.c++', '.cp', '.hpp', '.hh', '.hxx', '.h++', '.ipp', '.tpp', '.tcc', '.inl', '.cppm', '.ixx']);

function langOf(path, fallback) {
  const ext = posix.extname(String(path || '')).toLowerCase();
  if (String(path || '').endsWith('.C')) return 'cpp';
  if (CPP_EXT.has(ext)) return 'cpp';
  if (ext === '.c' || ext === '.h') return fallback === 'cpp' && ext === '.h' ? 'cpp' : 'c';
  return fallback || 'c';
}

function isHeader(path) {
  return HEADER_EXT.has(posix.extname(String(path || '')).toLowerCase());
}

function sortDiagnostics(list) {
  return list.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : (a.line - b.line) || (a.col - b.col)));
}

// Parse one translation unit.
// opts: { file, lang:'c'|'cpp', std, target:'lp64'|'ilp32'|'llp64'|{...}, includeDirs, defines, undefs,
//         files (other project files for #include), builtinHeaders (default true), booleanTypedefs,
//         knownTypes (extra typedef names for the parser), lexCache }
function parseUnit(text, opts = {}) {
  const file = pp.normPath(opts.file || '<input>');
  const lang = opts.lang === 'cpp' || opts.lang === 'c' ? opts.lang : langOf(file, 'c');
  const std = opts.std || (lang === 'cpp' ? 'c++20' : 'c17');
  const target = types.resolveTarget(opts.target);
  const t0 = Date.now();
  const pre = pp.preprocess(text, {
    file, lang, std, target, files: opts.files, fileMap: opts.fileMap, includeDirs: opts.includeDirs,
    defines: opts.defines, undefs: opts.undefs, builtinHeaders: opts.builtinHeaders, lexCache: opts.lexCache,
    trigraphs: opts.trigraphs, maxIncludeDepth: opts.maxIncludeDepth,
  });
  const t1 = Date.now();
  let parsed;
  try {
    parsed = parser.parse(pre.tokens, { lang, std, file, knownTypes: opts.knownTypes });
  } catch (e) {
    parsed = { ast: { type: 'TranslationUnit', decls: [], loc: { file, line: 1, col: 1, endLine: 1, endCol: 1, start: 0, end: 0 } }, diagnostics: [{ severity: 'error', code: 'parse-internal', message: `Internal parser error: ${e && e.message}`, file, line: 1, col: 1 }] };
  }
  const t2 = Date.now();
  ast.attachParents(parsed.ast);
  const sema = symbols.analyzeUnit(parsed.ast, { lang, target, file, booleanTypedefs: opts.booleanTypedefs });
  const t3 = Date.now();
  const diagnostics = sortDiagnostics([...pre.diagnostics, ...parsed.diagnostics, ...sema.diagnostics]);
  const unit = {
    file,
    lang,
    std,
    target,
    ast: parsed.ast,
    tokens: pre.tokens,
    comments: pre.comments,
    trigraphs: pre.trigraphs,
    directives: pre.directives,
    macros: pre.macroDefs,
    macroTable: pre.macros,
    expansions: pre.expansions,
    includes: pre.includes,
    headerGuards: pre.headerGuards,
    skipped: pre.skipped,
    undefInIf: pre.undefInIf,
    pragmas: pre.pragmas,
    sources: pre.sources,
    files: pre.files,
    diagnostics,
    symbols: sema.symbols,
    scope: sema.fileScope,
    externals: sema.externals,
    unresolved: sema.unresolved,
    lookup: sema.lookup,
    lookupQualified: sema.lookupQualified,
    timings: { preprocess: t1 - t0, parse: t2 - t1, sema: t3 - t2 },
  };
  return unit;
}

// Parse a set of files. Non-header files are translation units; headers are
// processed through #include, and headers no unit includes are parsed alone
// (unit.standaloneHeader = true).
// files: [{ path, text, lang? }]
function parseProject(files, opts = {}) {
  const list = (files || []).filter((f) => f && f.path != null).map((f) => ({ ...f, path: pp.normPath(f.path) }));
  const fileMap = new Map(list.map((f) => [f.path, { text: f.text || '', lang: f.lang }]));
  const lexCache = new Map();
  const units = [];
  const included = new Set();
  const parseOne = (f, standalone) => {
    const u = parseUnit(f.text || '', { ...opts, file: f.path, lang: f.lang || langOf(f.path, opts.lang), fileMap, lexCache });
    if (standalone) u.standaloneHeader = true;
    for (const inc of u.includes) if (inc.resolved) included.add(inc.resolved);
    units.push(u);
  };
  for (const f of list) if (!isHeader(f.path) || opts.headersAsUnits) parseOne(f, false);
  if (!opts.headersAsUnits) {
    for (const f of list) if (isHeader(f.path) && !included.has(f.path)) parseOne(f, true);
  }
  const globalSymbols = buildGlobalSymbols(units);
  const callGraph = buildCallGraph(units);
  const diagnostics = [];
  for (const u of units) for (const d of u.diagnostics) diagnostics.push({ ...d, unit: u.file });
  const unitByFile = new Map(units.map((u) => [u.file, u]));
  return { units, globalSymbols, callGraph, diagnostics, unitByFile, unitOf: (file) => unitByFile.get(file) || null };
}

// ---------------------------------------------------------------- cross-unit symbols

function declKey(node) {
  const l = node && node.loc;
  return l ? `${l.file}:${l.line}:${l.col}` : '';
}

// globalSymbols is keyed by qname, except C++ functions (without C language
// linkage), which are keyed by qname + parameter signature so that ordinary
// overloads stay separate entries: 'ns::f(int)', 'ns::f(const char *)'.
// get('ns::f') still finds an entry (the first overload); byName lists all.
class GlobalSymbolMap extends Map {
  constructor() {
    super();
    this.byName = new Map();
  }
  get(key) {
    const g = super.get(key);
    if (g || typeof key !== 'string') return g;
    const list = this.byName.get(key);
    return list ? list[0] : undefined;
  }
  overloads(qname) { return this.byName.get(qname) || []; }
  // entry of a Symbol (any unit)
  of(sym) {
    if (!sym) return undefined;
    for (const g of this.overloads(sym.qname)) if (g.symbols.some((x) => x.symbol === sym)) return g;
    return undefined;
  }
}

function paramSignature(t) {
  const c = types.canonical(t);
  if (!c || c.kind !== 'function') return '()';
  const ps = c.params.map((p) => canonicalString(types.unqualified(p)));
  if (c.variadic) ps.push('...');
  return '(' + ps.join(', ') + ')' + (c.quals && c.quals.length ? ' ' + c.quals.join(' ') : '') + (c.refQual ? ' ' + c.refQual : '');
}

function globalKey(s, u) {
  if (s.kind !== 'function' || u.lang !== 'cpp' || s.externC || s.qname === 'main') return s.qname;
  return s.qname + paramSignature(s.type);
}

function buildGlobalSymbols(units) {
  const out = new GlobalSymbolMap();
  for (const u of units) {
    for (const s of u.externals) {
      const gk = globalKey(s, u);
      let g = Map.prototype.get.call(out, gk);
      if (!g) {
        g = { key: gk, signature: gk === s.qname ? null : gk.slice(s.qname.length), name: s.name, qname: s.qname, kind: s.kind, decls: [], definitions: [], units: new Set(), types: [], typeMismatch: false, multipleDefinitions: false, defined: false, symbols: [] };
        out.set(gk, g);
        const same = out.byName.get(s.qname);
        if (same) same.push(g); else out.byName.set(s.qname, [g]);
      }
      g.units.add(u.file);
      g.symbols.push({ unit: u.file, unitRef: u, symbol: s });
      if (g.kind !== s.kind) g.kindMismatch = true;
      for (const d of s.decls) {
        const key = declKey(d);
        if (!d.loc || g.decls.some((x) => x.key === key)) continue;
        const isDef = s.definition === d || (s.kind === 'variable' && s.tentativeDefinition && s.tentative.includes(d));
        const entry = { key, unit: u.file, unitRef: u, node: d, file: d.loc.file, line: d.loc.line, col: d.loc.col, isDefinition: !!isDef, type: d.ctype || s.type, typeString: types.typeToString(d.ctype || s.type) };
        g.decls.push(entry);
        if (isDef) g.definitions.push(entry);
      }
    }
  }
  for (const g of out.values()) {
    g.defined = g.definitions.length > 0;
    g.system = g.decls.length > 0 && g.decls.every((d) => isBuiltinFile(d.file));
    // a definition in a header included by several units is one definition
    const defKeys = new Set(g.definitions.map((d) => d.key));
    g.multipleDefinitions = defKeys.size > 1 && !g.symbols.some((x) => x.symbol.isInline);
    const strs = new Set();
    for (const d of g.decls) if (!types.isUnknown(d.type)) strs.add(canonicalString(d.type));
    g.types = [...strs];
    if (strs.size > 1) {
      // compatible array sizes / prototypes are not mismatches
      const first = g.decls.find((d) => !types.isUnknown(d.type));
      g.typeMismatch = g.decls.some((d) => !types.isUnknown(d.type) && !types.sameType(d.type, first.type));
    }
  }
  return out;
}

function canonicalString(t) {
  return types.typeToString(deepCanonical(t, 0));
}
function deepCanonical(t, depth) {
  const c = types.canonical(t);
  if (depth > 20) return c;
  switch (c.kind) {
    case 'pointer': return { ...c, to: deepCanonical(c.to, depth + 1) };
    case 'array': return { ...c, of: deepCanonical(c.of, depth + 1) };
    case 'function': return { ...c, ret: deepCanonical(c.ret, depth + 1), params: c.params.map((p) => deepCanonical(p, depth + 1)) };
    default: return c;
  }
}

// ---------------------------------------------------------------- call graph

// Call-graph key: qname (+ parameter signature for C++ functions, as in
// globalSymbols), prefixed with 'file#' for internal linkage.
function functionKey(sym, unit) {
  if (!sym) return null;
  const q = unit.lang === 'cpp' && !sym.externC && sym.qname !== 'main' ? sym.qname + paramSignature(sym.type) : sym.qname;
  if (sym.linkage === 'internal') return `${unit.file}#${q}`;
  return q;
}

function buildCallGraph(units) {
  const nodes = new Map();
  const edges = [];
  const seenDefs = new Set();
  const node = (key, sym, unit) => {
    let n = nodes.get(key);
    if (!n) {
      n = { key, name: sym ? sym.name : key, qname: sym ? sym.qname : key, linkage: sym ? sym.linkage : 'external', defined: false, definitions: [], callees: new Set(), callers: new Set(), calls: [], unit: unit.file, unitRef: unit, noreturn: !!(sym && sym.noreturn) };
      nodes.set(key, n);
    }
    return n;
  };
  for (const u of units) {
    for (const s of u.symbols) if (s.kind === 'function') node(functionKey(s, u), s, u);
    for (const s of u.symbols) {
      if (s.kind !== 'function' || !s.definition || !s.definition.body) continue;
      const fd = s.definition;
      const dk = declKey(fd);
      const key = functionKey(s, u);
      const n = node(key, s, u);
      n.defined = true;
      if (seenDefs.has(dk + '|' + key)) continue;
      seenDefs.add(dk + '|' + key);
      n.definitions.push({ unit: u.file, unitRef: u, node: fd });
      ast.walk(fd.body, (x) => {
        if (x.type === 'LambdaExpr') return undefined;
        if (x.type !== 'CallExpr') return undefined;
        const cs = x.calleeSymbol || (x.callee && x.callee.symbol && x.callee.symbol.kind === 'function' ? x.callee.symbol : null);
        if (cs) {
          const ck = functionKey(cs, u);
          const cn = node(ck, cs, u);
          n.callees.add(ck);
          cn.callers.add(key);
          const call = { from: key, to: ck, node: x, unit: u.file, unitRef: u, line: x.loc.line, indirect: false };
          n.calls.push(call);
          edges.push(call);
        } else {
          const call = { from: key, to: null, node: x, unit: u.file, unitRef: u, line: x.loc.line, indirect: true, calleeText: x.callee && x.callee.type === 'Identifier' ? x.callee.qname : null };
          n.calls.push(call);
          edges.push(call);
        }
        return undefined;
      });
    }
  }
  return {
    nodes,
    edges,
    callees: (k) => [...((nodes.get(k) || {}).callees || [])],
    callers: (k) => [...((nodes.get(k) || {}).callers || [])],
    reachableFrom(k) {
      const seen = new Set();
      const stack = [k];
      while (stack.length) {
        const x = stack.pop();
        const n = nodes.get(x);
        if (!n) continue;
        for (const c of n.callees) if (!seen.has(c)) { seen.add(c); stack.push(c); }
      }
      return seen;
    },
    // All strongly connected components in bottom-up order (callees before
    // callers): the natural order for computing interprocedural summaries.
    sccs() {
      let index = 0;
      const idx = new Map(), low = new Map(), on = new Set(), stack = [], out = [];
      const strong = (v) => {
        idx.set(v, index); low.set(v, index); index++;
        stack.push(v); on.add(v);
        for (const w of (nodes.get(v) || { callees: [] }).callees) {
          if (!idx.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); } else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
        }
        if (low.get(v) === idx.get(v)) {
          const comp = [];
          let w;
          do { w = stack.pop(); on.delete(w); comp.push(w); } while (w !== v);
          out.push(comp.reverse());
        }
      };
      for (const k of nodes.keys()) if (!idx.has(k)) strong(k);
      return out;
    },
    // strongly connected components with recursion (size > 1 or a self call)
    recursion() {
      let index = 0;
      const idx = new Map(), low = new Map(), on = new Set(), stack = [], out = [];
      const strong = (v) => {
        idx.set(v, index); low.set(v, index); index++;
        stack.push(v); on.add(v);
        for (const w of (nodes.get(v) || { callees: [] }).callees) {
          if (!idx.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); } else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
        }
        if (low.get(v) === idx.get(v)) {
          const comp = [];
          let w;
          do { w = stack.pop(); on.delete(w); comp.push(w); } while (w !== v);
          const n = nodes.get(v);
          if (comp.length > 1 || (n && n.callees.has(v))) out.push(comp.reverse());
        }
      };
      for (const k of nodes.keys()) if (!idx.has(k)) strong(k);
      return out;
    },
  };
}

// ---------------------------------------------------------------- helpers for rule authors

// Source text of a node (or of any {loc}) in the file it was spelled in.
function sourceText(unit, node) {
  const l = node && (node.loc || node);
  if (!l || l.start == null) return '';
  const src = unit.sources && unit.sources.get(l.file);
  if (!src) return '';
  return src.text.slice(l.start, l.end);
}

// "file:line:col"
function locString(node) {
  const l = node && (node.loc || node);
  return l ? `${l.file}:${l.line}:${l.col}` : '?';
}

function isBuiltinFile(file) { return typeof file === 'string' && file.startsWith('<'); }

// Top-level declarations spelled in the unit's own file (or `file`).
function userDecls(unit, file) {
  const f = file || unit.file;
  return unit.ast.decls.filter((d) => d.loc && d.loc.file === f);
}

// Raw (unexpanded) tokens of one source file of the unit.
function rawTokens(unit, file) {
  const s = unit.sources.get(file || unit.file);
  return s ? s.tokens : [];
}

// Function definitions in the unit (FunctionDecl with body), optionally only from `file`.
function functionsOf(unit, file) {
  const out = [];
  ast.walk(unit.ast, (n) => {
    if (n.type === 'FunctionDecl' && n.body && (!file || (n.loc && n.loc.file === file))) out.push(n);
  });
  return out;
}

// Group a switch statement into clauses:
// [{ labels: [CaseStmt|DefaultStmt], body: [statements], node }] ; statements before the first label in `prefix`
function switchClauses(sw) {
  const res = { clauses: [], prefix: [] };
  const body = sw.body && sw.body.type === 'CompoundStmt' ? sw.body.body : sw.body ? [sw.body] : [];
  let cur = null;
  for (const st of body) {
    let s = st;
    if (s.type === 'CaseStmt' || s.type === 'DefaultStmt') {
      if (!cur || cur.body.length) { cur = { labels: [], body: [], node: s }; res.clauses.push(cur); }
      while (s && (s.type === 'CaseStmt' || s.type === 'DefaultStmt')) {
        cur.labels.push(s);
        s = s.body;
      }
      if (s) cur.body.push(s);
    } else if (cur) cur.body.push(s);
    else res.prefix.push(s);
  }
  return res;
}

const CFG_CACHE = new WeakMap();
// Cached CFG of a function definition.
function getCFG(fn, opts) {
  if (!opts) {
    const c = CFG_CACHE.get(fn);
    if (c) return c;
  }
  const g = cfg.buildCFG(fn, opts || {});
  if (!opts) CFG_CACHE.set(fn, g);
  return g;
}

module.exports = {
  // entry points
  parseUnit,
  parseProject,
  functionKey,
  paramSignature,
  langOf,
  isHeader,
  // layers
  lex: lexer.lex,
  preprocess: pp.preprocess,
  parse: parser.parse,
  analyzeUnit: symbols.analyzeUnit,
  buildCFG: cfg.buildCFG,
  buildAllCFGs: cfg.buildAllCFGs,
  getCFG,
  solve: cfg.solve,
  reachingDefinitions: cfg.reachingDefinitions,
  liveVariables: cfg.liveVariables,
  essentialType: essential.essentialType,
  essentialTypeOfType: essential.essentialTypeOfType,
  // AST helpers
  walk: ast.walk,
  findAll: ast.findAll,
  findFirst: ast.findFirst,
  childrenOf: ast.childrenOf,
  parentOf: ast.parentOf,
  parentKey: ast.parentKey,
  ancestors: ast.ancestors,
  enclosing: ast.enclosing,
  attachParents: ast.attachParents,
  skipParens: ast.skipParens,
  VISITOR_KEYS: ast.VISITOR_KEYS,
  declLeaf: parser.declLeaf,
  directFunction: parser.directFunction,
  sourceText,
  locString,
  isBuiltinFile,
  userDecls,
  rawTokens,
  functionsOf,
  switchClauses,
  // modules
  lexer,
  preprocessor: pp,
  parser,
  types,
  symbols,
  essential,
  cfg,
  ast,
};
