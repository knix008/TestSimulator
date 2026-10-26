'use strict';

// Python semantic analyzer (Python reference analyzer-like). Contract: core/ENGINE_CONTRACT.md.
// Rule keys 'sem-py:<id>'.
//
// Pipeline per analysis: parse every .py/.pyi (and .ipynb code cells) with
// the tolerant parser -> scopes/symbols -> project index (classes, functions,
// imports across files) -> per file: module rules, one AST traversal that
// dispatches to node rules, then per function a CFG with data-flow and
// symbolic execution (rules/flow.js).

const { parse } = require('./parser');
const { link, makeSlicer, FUNC_TYPES } = require('./ast');
const { buildScopes, scopeOf } = require('./scope');
const { Project, ModuleInfo } = require('./project');
const { RULES } = require('./rules');
const { toMeta } = require('./rules/def');
const { runFlow } = require('./rules/flow');

let catalogCache = null;
function catalog() {
  if (!catalogCache) catalogCache = RULES.map(toMeta);
  return catalogCache;
}

const TEST_PATH = /(?:^|\/)(?:tests?|testing|test_\w+\.py|\w+_tests?\.py|conftest\.py)(?:\/|$)|(?:^|\/)tests?_[^/]*\.py$|(?:^|\/)[^/]*_tests?\.py$/i;

// Extracts notebook code cells into one virtual source; returns { text, lineMap }.
function notebookSource(raw) {
  let nb;
  try { nb = JSON.parse(raw); } catch { return null; }
  const cells = Array.isArray(nb && nb.cells) ? nb.cells : [];
  const out = [];
  const lineMap = [];
  let searchFrom = 0;
  const rawLineOf = (pos) => { let n = 1; for (let i = 0; i < pos && i < raw.length; i++) if (raw.charCodeAt(i) === 10) n++; return n; };
  for (const cell of cells) {
    if (!cell || cell.cell_type !== 'code') continue;
    const src = Array.isArray(cell.source) ? cell.source.join('') : String(cell.source || '');
    for (const line of src.split('\n')) {
      let text = line;
      if (/^\s*[%!]/.test(text)) text = text.replace(/[^\s].*$/, 'pass');
      const needle = JSON.stringify(line).slice(1, -1);
      let pos = needle ? raw.indexOf(needle, searchFrom) : -1;
      if (pos >= 0) searchFrom = pos + needle.length; else pos = searchFrom;
      lineMap.push(rawLineOf(pos));
      out.push(text);
    }
    out.push('');
    lineMap.push(lineMap[lineMap.length - 1] || 1);
  }
  return { text: out.join('\n'), lineMap };
}

class FileContext {
  constructor(mod, project, file, opts) {
    this.mod = mod;
    this.project = project;
    this.file = file;
    this.path = file.path;
    this.text = mod.parsed.text;
    this.slice = makeSlicer(this.text);
    this.lines = this.text.split(/\r?\n/);
    this.comments = mod.parsed.comments;
    this.tokens = mod.parsed.tokens;
    this.isTest = TEST_PATH.test(file.path) || /(?:^|\/)tests?\//i.test(file.path);
    this.isSettings = /(?:^|\/)(?:settings(?:_\w+)?|config|conf|production|prod|base|local|development|dev|wsgi|asgi)\.py$/i.test(file.path) || /(?:^|\/)settings\//i.test(file.path);
    this.isStub = mod.isStub;
    this.opts = opts;
    this.findings = [];
    this.inactive = opts.inactive || new Set();
    this.lineMap = file.lineMap || null;
    this.errorLines = new Set(mod.parsed.errors.map((e) => e.line));
    this._imports = null;
  }

  q(e) { return this.project.qname(e); }
  type(e) { return this.project.typeOf(e); }
  scopeOf(n) { return scopeOf(n); }

  // modules imported anywhere in the file (top-level names)
  get imports() {
    if (!this._imports) {
      this._imports = new Set();
      for (const s of this.mod.allImports || []) this._imports.add(s);
    }
    return this._imports;
  }

  imported(prefix) {
    for (const m of this.imports) if (m === prefix || m.startsWith(prefix + '.')) return true;
    return false;
  }

  enclosingFunction(n) {
    let p = n.parent;
    while (p) {
      if (FUNC_TYPES.has(p.type)) return p;
      if (p.type === 'Module') return null;
      p = p.parent;
    }
    return null;
  }

  report(rule, node, en, ko, extra) {
    const key = `sem-py:${rule.id}`;
    if (this.inactive.has(key)) return;
    const pos = posOf(node);
    if (!pos.line) return;
    const f = {
      rule: key,
      file: this.path,
      line: pos.line,
      column: pos.col + 1,
      message: { en: en || rule.name.en, ko: ko || rule.name.ko },
    };
    if (pos.endLine) { f.endLine = pos.endLine; if (pos.endCol != null) f.endColumn = pos.endCol + 1; }
    if (extra) {
      if (extra.events) f.events = extra.events;
      if (extra.function) f.function = extra.function;
      if (extra.severity) f.severity = extra.severity;
      if (extra.type) f.type = extra.type;
    }
    if (!f.function) {
      const fn = node && node.parent !== undefined ? this.enclosingFunction(node) : null;
      if (fn) f.function = fn.name;
    }
    if (this.lineMap) {
      const map = (l) => this.lineMap[l - 1] || l;
      f.line = map(f.line);
      if (f.endLine) f.endLine = map(f.endLine);
      if (f.events) f.events = f.events.map((e) => ({ ...e, line: map(e.line) }));
      delete f.column;
      delete f.endColumn;
    }
    this.findings.push(f);
  }
}

function posOf(n) {
  if (!n) return {};
  if ((FUNC_TYPES.has(n.type) || n.type === 'ClassDef') && n.nameLine) return { line: n.nameLine, col: n.nameCol, endLine: n.nameLine, endCol: n.nameCol + n.name.length };
  return { line: n.line, col: n.col || 0, endLine: n.endLine, endCol: n.endCol };
}

function collectImports(mod) {
  const out = new Set();
  for (const n of mod.allNodes) {
    if (n.type === 'Import') for (const a of n.names) out.add(a.name);
    else if (n.type === 'ImportFrom' && n.module && !n.level) { out.add(n.module); for (const a of n.names) out.add(`${n.module}.${a.name}`); }
  }
  mod.allImports = out;
}

function buildDispatch(rules) {
  const map = new Map();
  for (const r of rules) {
    if (!r.on) continue;
    for (const [type, fn] of Object.entries(r.on)) {
      for (const t of type.split('|')) {
        if (!map.has(t)) map.set(t, []);
        map.get(t).push([r, fn]);
      }
    }
  }
  return map;
}

let dispatchCache = null;

function analyze(files, ctx = {}) {
  const t0 = Date.now();
  const inactive = ctx.inactive || new Set();
  const options = (ctx.options && (ctx.options['sem-py'] || ctx.options.semPy)) || {};
  const out = [];
  const project = new Project();
  const mods = [];
  for (const file of files || []) {
    if (!file || typeof file.text !== 'string') continue;
    const isPy = file.lang === 'py' || /\.pyi?$/i.test(file.path);
    const isNb = /\.ipynb$/i.test(file.path);
    if (!isPy && !isNb) continue;
    try {
      let text = file.text;
      let lineMap = null;
      if (isNb) {
        const nb = notebookSource(text);
        if (!nb) continue;
        text = nb.text;
        lineMap = nb.lineMap;
      }
      if (text.length > (options.maxFileSize || 3000000)) continue;
      const parsed = parse(text);
      if (parsed.module.failed) continue;
      const all = link(parsed.module);
      const scopes = buildScopes(parsed.module);
      const mod = new ModuleInfo(file, parsed, scopes);
      mod.allNodes = all;
      mod.index();
      collectImports(mod);
      project.add(mod);
      mods.push({ mod, file: { ...file, lineMap } });
    } catch (err) {
      if (options.debug) throw err;
    }
  }
  if (!dispatchCache) dispatchCache = buildDispatch(RULES);
  const moduleRules = RULES.filter((r) => r.module && !inactive.has(`sem-py:${r.id}`));
  const activeFlow = RULES.filter((r) => r.flow && !inactive.has(`sem-py:${r.id}`));
  const stats = { files: mods.length, parseErrors: 0, functions: 0, aborted: 0, ms: 0 };
  for (const { mod, file } of mods) {
    const c = new FileContext(mod, project, file, { inactive, options });
    if (mod.parsed.errors.length) stats.parseErrors++;
    try {
      for (const r of moduleRules) {
        try { r.module(c, rep(c, r)); } catch (err) { if (options.debug) throw err; }
      }
      for (const n of mod.allNodes) {
        const hs = dispatchCache.get(n.type);
        if (!hs) continue;
        for (const [r, fn] of hs) {
          if (inactive.has(`sem-py:${r.id}`)) continue;
          try { fn(n, c, rep(c, r)); } catch (err) { if (options.debug) throw err; }
        }
      }
      if (activeFlow.length) runFlow(c, activeFlow, stats, options);
    } catch (err) {
      if (options.debug) throw err;
    }
    out.push(...dedupe(c.findings));
  }
  stats.ms = Date.now() - t0;
  if (ctx.stats) ctx.stats['sem-py'] = stats;
  return out;
}

function rep(c, r) {
  return { report: (node, en, ko, extra) => c.report(r, node, en, ko, extra), rule: r };
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

module.exports = { catalog, analyze, parse, notebookSource };
