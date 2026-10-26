'use strict';

// PHP semantic analyzer (PHP reference analyzer scope). Contract: core/ENGINE_CONTRACT.md.
// Rule keys 'sem-php:<id>'.
//
// Pipeline: tolerant lexer (inline HTML, heredoc/nowdoc, interpolation,
// PHP 8 syntax) -> recursive-descent parser -> AST with line/col and parent
// links -> function scopes and local symbols -> one AST walk dispatching to
// rule handlers -> per function CFG with liveness (dead stores), constant
// propagation (always true / false conditions) and reachability.
// Taint flows (SQL injection, XSS, ...) live in core/taint and are not
// duplicated here.

const A = require('./ast');
const { parse } = require('./parser');
const { buildScopes } = require('./scope');
const { buildCFG } = require('./cfg');
const flow = require('./flow');
const R = require('./rules/core');

require('./rules/bugs');
require('./rules/smells');
require('./rules/style');
require('./rules/security');

const MAX_FILE_BYTES = 1500000;

let catalogCache = null;
function catalog() {
  if (!catalogCache) catalogCache = R.catalogEntries();
  return catalogCache.map((e) => Object.assign({}, e));
}

function isPhp(f) {
  if (!f || typeof f.text !== 'string') return false;
  if (f.lang === 'php') return true;
  if (f.lang && f.lang !== 'php') return false;
  return /\.(php|phtml|php[3-8]|inc)$/i.test(String(f.path || ''));
}

let tables = null;
function handlerTables() {
  if (tables) return tables;
  tables = new Map();
  for (const def of R.RULES) {
    if (!def.on) continue;
    for (const [kind, fn] of Object.entries(def.on)) {
      if (!tables.has(kind)) tables.set(kind, []);
      tables.get(kind).push({ def, fn });
    }
  }
  return tables;
}

class Engine {
  constructor(active) {
    this.active = active;
    this.findings = [];
    this.seen = new Set();
    this.internalErrors = 0;
  }

  add(def, pf, at, args, extra) {
    if (!this.active.has(def.key)) return;
    const line = (at && (at.nameLine && extra && extra.atName ? at.nameLine : at.line)) || 1;
    const col = (at && (at.nameLine && extra && extra.atName ? at.nameCol : at.col)) || 1;
    const k = `${def.key}|${pf.path}|${line}|${col}`;
    if (this.seen.has(k)) return;
    this.seen.add(k);
    const f = { rule: def.key, file: pf.path, line, column: col, message: R.message(def, args) };
    if (at && at.endLine && !(extra && extra.atName)) { f.endLine = at.endLine; f.endColumn = at.endCol; }
    if (extra && extra.fn) f.function = extra.fn;
    if (extra && extra.events) f.events = extra.events;
    this.findings.push(f);
  }
}

class Cx {
  constructor(engine, def, pf, proj) {
    this.engine = engine;
    this.def = def;
    this.pf = pf;
    this.proj = proj;
    this.src = pf ? pf.src : '';
  }
  report(at, ...args) { this.engine.add(this.def, this.pf, at, args); }
  reportName(at, ...args) { this.engine.add(this.def, this.pf, at, args, { atName: true }); }
  reportIn(pf, at, ...args) { this.engine.add(this.def, pf, at, args); }
  text(n) { return A.text(this.src, n); }
  short(n, max) { return A.shortText(this.src, n, max); }
  opt(name, dflt) {
    const o = this.proj && this.proj.options && this.proj.options[this.def.id];
    return o && o[name] != null ? o[name] : dflt;
  }
}

function parseFile(f) {
  const src = String(f.text);
  const { ast, lex, errors } = parse(src);
  const { byKind, all } = A.index(ast);
  const scopes = buildScopes(ast);
  const pf = {
    path: f.path,
    src,
    ast,
    lex,
    errors,
    byKind,
    all,
    scopes,
    lines: src.split('\n'),
    comments: lex.comments,
  };
  pf.isTest = /(^|\/)tests?\//i.test(f.path || '') || /Test\.php$/.test(f.path || '') || /\bPHPUnit\\|\bTestCase\b/.test(src);
  pf.namespace = (byKind.get('Namespace') || [])[0] || null;
  return pf;
}

function buildProject(pfs, options) {
  const proj = { files: pfs, functions: new Map(), classes: new Map(), options: options || {} };
  for (const pf of pfs) {
    for (const fd of pf.byKind.get('FuncDecl') || []) {
      const k = A.shortName(fd.name).toLowerCase();
      if (!proj.functions.has(k)) proj.functions.set(k, []);
      proj.functions.get(k).push({ node: fd, pf });
    }
    for (const c of pf.byKind.get('ClassDecl') || []) {
      if (!c.name) continue;
      const k = c.name.toLowerCase();
      if (!proj.classes.has(k)) proj.classes.set(k, []);
      proj.classes.get(k).push({ node: c, pf });
    }
  }
  return proj;
}

function fnName(scope) {
  const n = scope.node;
  if (n.k === 'FuncDecl' || n.k === 'Method') return n.name;
  return null;
}

function runFlow(engine, pf, active) {
  const deadDef = R.BY_ID.get('dead-store');
  const condDef = R.BY_ID.get('condition-always');
  const gratDef = R.BY_ID.get('gratuitous-boolean');
  const unreachDef = R.BY_ID.get('unreachable-code');
  const wantDead = active.has(deadDef.key);
  const wantCond = active.has(condDef.key) || active.has(gratDef.key);
  const wantUnreach = active.has(unreachDef.key);
  if (!wantDead && !wantCond && !wantUnreach) return;
  for (const scope of pf.scopes) {
    if (scope.arrow || scope.hasGoto) continue;
    const node = scope.node;
    if (node.k !== 'Program' && !(node.body && node.body.k === 'Block')) continue;
    try {
      const cfg = buildCFG(node);
      if (!cfg) continue;
      const fname = fnName(scope);
      const extra = fname ? { fn: fname } : undefined;
      if (wantUnreach) {
        for (const s of cfg.unreachable) {
          engine.add(unreachDef, pf, s, [], extra);
        }
      }
      if (scope.isTop || scope.dynamic) continue;
      if (wantDead) {
        flow.deadStores(cfg, (it) => {
          if (it.sym.reads === 0 || it.sym.name.startsWith('_')) return;
          const at = it.node.k === 'Assign' ? it.node.l : it.node;
          engine.add(deadDef, pf, at, [it.sym.name], extra);
        });
      }
      if (wantCond) {
        flow.constantConditions(cfg, (f) => {
          const def = f.kind === 'operand' ? gratDef : condDef;
          engine.add(def, pf, f.node, [f.value ? 'true' : 'false', A.shortText(pf.src, f.node, 40)], extra);
        });
      }
    } catch (e) {
      if (process.env.SEMPHP_DEBUG) throw e;
      engine.internalErrors++;
    }
  }
}

function analyze(files, ctx = {}) {
  const inactive = ctx.inactive || new Set();
  const options = (ctx.options && (ctx.options['sem-php'] || ctx.options.semPhp)) || {};
  const phpFiles = (files || []).filter((f) => isPhp(f) && f.text.length <= MAX_FILE_BYTES);
  if (!phpFiles.length) return [];
  const active = new Set(R.RULES.map((d) => d.key).filter((k) => !inactive.has(k)));
  if (!active.size) return [];
  const t0 = Date.now();
  const engine = new Engine(active);
  const pfs = [];
  for (const f of phpFiles) {
    try { pfs.push(parseFile(f)); } catch (e) {
      if (process.env.SEMPHP_DEBUG) throw e;
      engine.internalErrors++;
    }
  }
  const proj = buildProject(pfs, options);
  const defs = R.RULES.filter((d) => active.has(d.key));
  const table = handlerTables();
  for (const def of defs) {
    if (!def.project) continue;
    try { def.project(proj, new Cx(engine, def, null, proj)); } catch (e) {
      if (process.env.SEMPHP_DEBUG) throw e;
      engine.internalErrors++;
    }
  }
  for (const pf of pfs) {
    const cxs = new Map();
    const cxOf = (def) => { let c = cxs.get(def); if (!c) { c = new Cx(engine, def, pf, proj); cxs.set(def, c); } return c; };
    for (const def of defs) {
      if (!def.file) continue;
      try { def.file(pf, cxOf(def)); } catch (e) {
        if (process.env.SEMPHP_DEBUG) throw e;
        engine.internalErrors++;
      }
    }
    for (const n of pf.all) {
      const hs = table.get(n.k);
      if (!hs) continue;
      for (const h of hs) {
        if (!active.has(h.def.key)) continue;
        try { h.fn(n, cxOf(h.def)); } catch (e) {
          if (process.env.SEMPHP_DEBUG) throw e;
          engine.internalErrors++;
        }
      }
    }
    runFlow(engine, pf, active);
  }
  if (ctx.stats) {
    ctx.stats.semPhp = { files: pfs.length, ms: Date.now() - t0, internalErrors: engine.internalErrors, parseErrors: pfs.reduce((a, f) => a + f.errors.length, 0) };
  }
  engine.findings.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line || a.column - b.column));
  return engine.findings;
}

module.exports = { catalog, analyze, _internals: { parse, parseFile, buildProject } };
