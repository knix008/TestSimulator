'use strict';

// sem-js: JavaScript / TypeScript semantic analyzer (SonarJS scope).
// Pipeline per file: tolerant parse -> parent links + node index -> scopes ->
// rules (AST, scope, CFG and symbolic-execution based). See
// core/ENGINE_CONTRACT.md for the catalog() / analyze() contract.

const { parse } = require('./parser');
const W = require('./walk');
const { analyzeScopes } = require('./scope');
const { buildCFG } = require('./cfg');
const { analyzeFunction } = require('./flow');
const { RULES, meta } = require('./rules');

const EXT_TS = /\.(ts|tsx|mts|cts)$/i;
const EXT_JS = /\.(js|jsx|mjs|cjs)$/i;

function catalog() {
  return RULES.map(meta);
}

// Blank everything outside <script> blocks of a .vue file (keeps offsets).
function vueScript(text) {
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  let any = false;
  let ts = false;
  const keep = [];
  while ((m = re.exec(text))) {
    any = true;
    if (/lang\s*=\s*["']?(ts|tsx)/i.test(m[1])) ts = true;
    const start = m.index + m[0].indexOf('>') + 1;
    keep.push([start, start + m[2].length]);
  }
  if (!any) return null;
  let out = '';
  let pos = 0;
  for (const [a, b] of keep) {
    out += text.slice(pos, a).replace(/[^\n\r]/g, ' ');
    out += text.slice(a, b);
    pos = b;
  }
  out += text.slice(pos).replace(/[^\n\r]/g, ' ');
  return { text: out, ts };
}

function isMinified(text) {
  if (text.length < 2000) return false;
  let lines = 1;
  let longest = 0;
  let cur = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) { lines++; if (cur > longest) longest = cur; cur = 0; } else cur++;
  }
  if (cur > longest) longest = cur;
  return longest > 2500 || text.length / lines > 300;
}

function fileKind(file) {
  const p = String(file.path || '');
  if (/\.d\.(m|c)?ts$/i.test(p)) return null;
  if (/\.vue$/i.test(p)) return { vue: true };
  if (file.lang === 'ts' || EXT_TS.test(p)) return { ts: true, jsx: /\.tsx$/i.test(p) };
  if (file.lang === 'js' || EXT_JS.test(p)) return { ts: false, jsx: true };
  return null;
}

function lineStarts(text) {
  const out = [0];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 10) out.push(i + 1);
    else if (c === 13) { if (text.charCodeAt(i + 1) === 10) i++; out.push(i + 1); }
  }
  return out;
}

class Context {
  constructor(file, text, ast, info, analysis) {
    this.file = file.path;
    this.src = text;
    this.ast = ast;
    this.ts = !!info.ts;
    this.jsx = !!info.jsx;
    this.lang = info.ts ? 'ts' : 'js';
    this.analysis = analysis;
    this.options = analysis.options || {};
    const prep = W.prepare(ast);
    this.byType = prep.byType;
    this.order = prep.order;
    this.isModule = ast.sourceType === 'module' || /\.mjs$/i.test(this.file) || this.ts;
    this.scope = analyzeScopes(ast, { module: this.isModule });
    this.starts = lineStarts(text);
    this.comments = ast.comments || [];
    this.findings = [];
    this.seen = new Set();
    this._flow = null;
    this._cfg = new Map();
    this._imports = null;
    this.rule = null;
  }

  nodes(type) {
    return this.byType.get(type) || [];
  }

  nodesOf(...types) {
    const out = [];
    for (const t of types) { const l = this.byType.get(t); if (l) out.push(...l); }
    return out.sort((a, b) => a._i - b._i);
  }

  functions() {
    return this.nodesOf('FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression');
  }

  loc(pos) {
    const s = this.starts;
    let lo = 0;
    let hi = s.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (s[mid] <= pos) lo = mid; else hi = mid - 1;
    }
    return { line: lo + 1, column: pos - s[lo] + 1 };
  }

  line(node) {
    return this.loc(node.start).line;
  }

  text(node) {
    return this.src.slice(node.start, node.end);
  }

  // Report a finding for the current rule. at: node or { start, end }.
  report(at, message, extra) {
    if (!at || at.start == null) return;
    const rule = this.rule;
    const k = `${rule.id}|${at.start}`;
    if (this.seen.has(k)) return;
    this.seen.add(k);
    const a = this.loc(at.start);
    const b = this.loc(Math.max(at.start, (at.end || at.start)));
    const f = { rule: rule.key, file: this.file, line: a.line, column: a.column, endLine: b.line, endColumn: b.column, message };
    if (extra) {
      if (extra.events) f.events = extra.events.map((e) => ({ line: e.line || this.line(e.node), tag: e.tag, text: e.text, main: !!e.main }));
      if (extra.fn) f.function = extra.fn;
    }
    this.findings.push(f);
  }

  // ---- module bindings
  imports() {
    if (this._imports) return this._imports;
    const map = new Map();
    const scopes = [this.scope.globalScope];
    for (const s of scopes) {
      for (const v of s.vars.values()) {
        const d = v.defs[0];
        if (!d) continue;
        if (d.kind === 'import' && d.source) {
          const sp = d.node;
          let imported = '*';
          if (sp.type === 'ImportSpecifier') imported = sp.imported.name || sp.imported.value;
          else if (sp.type === 'ImportDefaultSpecifier') imported = 'default';
          map.set(v, { source: normModule(d.source), imported });
        } else if ((d.kind === 'const' || d.kind === 'let' || d.kind === 'var') && d.node && d.node.type === 'VariableDeclarator' && d.node.init) {
          const req = requireOf(d.node.init);
          if (!req) continue;
          if (d.node.id.type === 'Identifier') map.set(v, { source: normModule(req.source), imported: req.prop || '*' });
          else if (d.node.id.type === 'ObjectPattern') {
            for (const p of d.node.id.properties) {
              if (p.type !== 'Property') continue;
              const val = p.value.type === 'AssignmentPattern' ? p.value.left : p.value;
              if (val.type === 'Identifier' && val.name === d.id.name) map.set(v, { source: normModule(req.source), imported: W.keyName(p.key, p.computed) || '*' });
            }
          }
        }
      }
    }
    this._imports = map;
    return map;
  }

  // Variable bound to an identifier reference (or declaration).
  varOf(id) {
    if (!id) return null;
    if (id._ref) return id._ref.resolved;
    return id._var || null;
  }

  // Module binding for a callee / member chain: { module, path: [], name }
  target(node) {
    node = W.unwrapTS(node);
    if (!node) return null;
    if (node.type === 'ChainExpression') node = node.expression;
    const path = [];
    let n = node;
    while (n && (n.type === 'MemberExpression' || n.type === 'ChainExpression' || n.type === 'TSNonNullExpression')) {
      if (n.type !== 'MemberExpression') { n = n.expression; continue; }
      const p = W.propName(n);
      if (p == null) return null;
      path.unshift(p);
      n = W.unwrapTS(n.object);
    }
    if (!n) return null;
    let module = null;
    if (n.type === 'Identifier') {
      const v = this.varOf(n);
      const imp = v && this.imports().get(v);
      if (imp) {
        module = imp.source;
        if (imp.imported !== '*' && imp.imported !== 'default') path.unshift(imp.imported);
      } else if (v) {
        return { module: null, path, base: n.name, local: true, name: [n.name, ...path].join('.') };
      } else {
        return { module: null, path, base: n.name, global: true, name: [n.name, ...path].join('.') };
      }
    } else if (n.type === 'CallExpression') {
      const req = requireOf(n);
      if (!req) return null;
      module = normModule(req.source);
      if (req.prop) path.unshift(req.prop);
    } else if (n.type === 'ThisExpression') {
      return { module: null, path, base: 'this', name: ['this', ...path].join('.') };
    } else return null;
    return { module, path, name: [module, ...path].join('.') };
  }

  // ---- control / data flow (cached)
  cfg(fn) {
    let c = this._cfg.get(fn);
    if (!c) { c = buildCFG(fn); this._cfg.set(fn, c); }
    return c;
  }

  flow() {
    if (this._flow) return this._flow;
    const results = [];
    const budgetEnd = Date.now() + (this.options.flowBudgetMs || 1500);
    const roots = [this.ast, ...this.functions()];
    for (const fn of roots) {
      if (Date.now() > budgetEnd) break;
      if (fn.type !== 'Program' && (!fn.body)) continue;
      let cfg;
      try { cfg = this.cfg(fn); } catch { continue; }
      let res;
      try { res = analyzeFunction(fn, cfg, this.scope, this); } catch { continue; }
      results.push({ fn, cfg, ...res });
    }
    this._flow = results;
    return results;
  }
}

function normModule(s) {
  return String(s || '').replace(/^node:/, '');
}

// require('x') / require('x').y / await import('x')
function requireOf(init) {
  let n = W.unwrapTS(init);
  if (!n) return null;
  if (n.type === 'AwaitExpression') n = n.argument;
  let prop = null;
  if (n.type === 'MemberExpression' && !n.computed && n.object.type === 'CallExpression') {
    prop = n.property.name;
    n = n.object;
  }
  if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'require' && n.arguments.length === 1) {
    const s = W.stringValue(n.arguments[0]);
    if (s != null) return { source: s, prop };
  }
  if (n.type === 'ImportExpression') {
    const s = W.stringValue(n.source);
    if (s != null) return { source: s, prop };
  }
  return null;
}

function analyzeFile(file, analysis) {
  const info = fileKind(file);
  if (!info) return [];
  let text = String(file.text || '');
  if (info.vue) {
    const v = vueScript(text);
    if (!v) return [];
    text = v.text;
    info.ts = v.ts;
    info.jsx = true;
  }
  if (!text.trim() || isMinified(text)) return [];
  if (text.length > (analysis.options.maxBytes || 1500000)) return [];
  let ast;
  try {
    ast = parse(text, { ts: info.ts, jsx: info.jsx });
  } catch (err) {
    if (info.ts && !info.jsx) {
      // some .ts files contain JSX-free generics the TS-only path rejects; retry as TSX
      try { ast = parse(text, { ts: true, jsx: true }); } catch { ast = null; }
    } else if (!info.ts) {
      // JS with TypeScript-only syntax (or Flow): try the TS grammar
      try { ast = parse(text, { ts: true, jsx: true }); info.ts = false; } catch { ast = null; }
    }
    if (!ast) {
      analysis.stats.parseErrors++;
      analysis.stats.errors.push({ file: file.path, message: String(err && err.message), pos: err && err.pos });
      return [];
    }
  }
  const ctx = new Context(file, text, ast, info, analysis);
  for (const r of analysis.rules) {
    if (r.tsOnly && !ctx.ts) continue;
    ctx.rule = r;
    try {
      r.run(ctx);
    } catch (err) {
      analysis.stats.ruleErrors++;
      if (analysis.options.debug) throw err;
    }
  }
  analysis.stats.files++;
  return ctx.findings;
}

function analyze(files, ctx = {}) {
  const inactive = ctx.inactive || new Set();
  const options = (ctx.options && (ctx.options['sem-js'] || ctx.options.semJs)) || {};
  const rules = RULES.filter((r) => !inactive.has(r.key) && !(options.only && !options.only.includes(r.id)));
  const stats = { files: 0, parseErrors: 0, ruleErrors: 0, errors: [] };
  const analysis = { rules, options, stats };
  const out = [];
  for (const file of files || []) {
    if (!file || !file.path) continue;
    let found = [];
    try {
      found = analyzeFile(file, analysis);
    } catch (err) {
      stats.parseErrors++;
      if (options.debug) throw err;
    }
    for (const f of found) out.push(f);
  }
  if (ctx.stats && typeof ctx.stats === 'object') ctx.stats['sem-js'] = { files: stats.files, parseErrors: stats.parseErrors, ruleErrors: stats.ruleErrors };
  out.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line || (a.column || 0) - (b.column || 0) || (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0)));
  return out;
}

module.exports = { catalog, analyze, parse, _internal: { Context, analyzeFile, vueScript, isMinified } };
