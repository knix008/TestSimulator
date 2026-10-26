'use strict';

// Ruby semantic analyzer (Ruby reference analyzer-like, plus Rails / Brakeman-style
// configuration and API checks that do not need taint tracking; taint flows
// live in core/taint). Contract: core/ENGINE_CONTRACT.md. Keys 'sem-rb:<id>'.
//
// Pipeline per file: tolerant lexer -> parser (AST with line/col) -> parent
// links -> local-variable scopes -> one traversal dispatching to node rules,
// per-file rules, and per-method CFG + liveness on demand (cx.flow(def)).

const { parse } = require('./parser');
const A = require('./ast');
const { buildScopes } = require('./scope');
const CFG = require('./cfg');
const core = require('./rules/core');
require('./rules');

const TEST_PATH = /(?:^|\/)(?:spec|test|tests|features)\/|_spec\.rb$|_test\.rb$/i;

let catalogCache = null;
function catalog() {
  if (!catalogCache) catalogCache = core.catalogEntries();
  return catalogCache;
}

class FileContext {
  constructor(file, parsed, options, inactive) {
    this.file = file;
    this.path = file.path;
    this.text = parsed.text;
    this.lines = parsed.text.split(/\r?\n/);
    this.comments = parsed.comments;
    this.tokens = parsed.tokens;
    this.program = parsed.program;
    this.errors = parsed.errors;
    this.options = options;
    this.inactive = inactive;
    this.isTest = TEST_PATH.test(file.path);
    this.findings = [];
    this.rule = null;
    this._starts = null;
    this._flow = new Map();
    this.all = A.link(parsed.program);
    this.scopes = buildScopes(parsed.program);
  }

  get starts() {
    if (!this._starts) {
      this._starts = [0];
      for (let i = 0; i < this.text.length; i++) if (this.text.charCodeAt(i) === 10) this._starts.push(i + 1);
    }
    return this._starts;
  }

  offset(line, col) { return (this.starts[line - 1] || 0) + (col - 1); }
  slice(n) {
    if (!n || !n.line) return '';
    return this.text.slice(this.offset(n.line, n.col), this.offset(n.endLine || n.line, n.endCol || n.col));
  }

  opt(name, def) {
    const r = this.options && this.options.rules && this.options.rules[this.rule.id];
    if (r && r[name] != null) return r[name];
    return def;
  }

  scopeOf(node) { return this.scopes.byNode.get(node) || null; }

  // CFG + liveness for one method (cached)
  flow(def) {
    if (this._flow.has(def)) return this._flow.get(def);
    let res = null;
    try {
      const g = CFG.build(def);
      const live = CFG.liveness(g);
      res = { g, live, dead: CFG.deadStores(g, live) };
    } catch (err) {
      if (this.options.debug) throw err;
    }
    this._flow.set(def, res);
    return res;
  }

  report(node, args, extra) {
    const def = this.rule;
    if (!def || !node) return;
    let line = node.nameLine || node.line;
    let col = node.nameLine ? node.nameCol : node.col;
    if (extra && extra.at) { line = extra.at.line; col = extra.at.col; }
    if (!line) return;
    const f = {
      rule: def.key,
      file: this.path,
      line,
      column: col || 1,
      message: extra && extra.message ? extra.message : core.message(def, args),
    };
    const endLine = extra && extra.at ? extra.at.endLine : (node.nameLine ? node.nameLine : node.endLine);
    const endCol = extra && extra.at ? extra.at.endCol : (node.nameLine ? node.nameCol + String(node.name || '').length : node.endCol);
    if (endLine) { f.endLine = endLine; if (endCol) f.endColumn = endCol; }
    if (extra && extra.events) f.events = extra.events;
    const d = node.type === 'Def' ? node : A.enclosingDef(node);
    if (d) f.function = d.name;
    this.findings.push(f);
  }
}

function buildDispatch() {
  const map = new Map();
  for (const r of core.RULES) {
    if (!r.on) continue;
    for (const [types, fn] of Object.entries(r.on)) {
      for (const t of types.split('|')) {
        if (!map.has(t)) map.set(t, []);
        map.get(t).push([r, fn]);
      }
    }
  }
  return map;
}

let dispatch = null;

function analyze(files, ctx = {}) {
  const inactive = ctx.inactive || new Set();
  const options = (ctx.options && (ctx.options['sem-rb'] || ctx.options.semRb)) || {};
  if (!dispatch) dispatch = buildDispatch();
  const fileRules = core.RULES.filter((r) => r.file && !inactive.has(r.key));
  const out = [];
  const stats = { files: 0, parseErrors: 0, ms: 0 };
  const t0 = Date.now();
  for (const file of files || []) {
    if (!file || typeof file.text !== 'string' || typeof file.path !== 'string') continue;
    const isRb = file.lang === 'rb' || /\.(?:rb|rake|gemspec|ru)$|(?:^|\/)(?:Rakefile|Gemfile|Guardfile|Capfile)$/i.test(file.path);
    if (!isRb) continue;
    if (file.text.length > (options.maxFileSize || 3000000)) continue;
    let cx;
    try {
      const parsed = parse(file.text);
      if (parsed.program.failed) continue;
      cx = new FileContext(file, parsed, options, inactive);
    } catch (err) {
      if (options.debug) throw err;
      continue;
    }
    stats.files++;
    if (cx.errors.length) stats.parseErrors++;
    for (const r of fileRules) {
      cx.rule = r;
      try { r.file(cx); } catch (err) { if (options.debug) throw err; }
    }
    for (const n of cx.all) {
      const hs = dispatch.get(n.type);
      if (!hs) continue;
      for (const [r, fn] of hs) {
        if (inactive.has(r.key)) continue;
        cx.rule = r;
        try { fn(n, cx); } catch (err) { if (options.debug) throw err; }
      }
    }
    out.push(...dedupe(cx.findings));
  }
  stats.ms = Date.now() - t0;
  if (ctx.stats) ctx.stats['sem-rb'] = stats;
  return out;
}

function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const f of list) {
    const k = `${f.rule}|${f.line}|${f.column || 0}|${f.message.en}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}

module.exports = { catalog, analyze, parse };
