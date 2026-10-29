'use strict';

// Go semantic analyzer (Go reference analyzer + Defect Analysis Go checker scope).
// Contract: core/ENGINE_CONTRACT.md. Rule keys 'sem-go:<id>'.
//
// Pipeline: tolerant lexer (automatic semicolons, raw strings, runes) ->
// recursive-descent parser (generics) -> project model (packages per
// directory, scopes, symbols, light type inference) -> AST rule handlers ->
// per function CFG with liveness (dead stores, unchecked errors),
// reachability (dead code) and path-sensitive state propagation (nil,
// resources, locks).

const fs = require('fs');
const path = require('path');
const A = require('./ast');
const { buildProject } = require('./model');
const { buildCFG } = require('./cfg');
const flow = require('./flow');
const { FnSE } = require('./se');
const R = require('./rules/core');

require('./rules/smells');
require('./rules/bugs');
require('./rules/security');
require('./rules/style');
require('./rules/flow-rules');

const MAX_FILE_BYTES = 2000000;

let catalogCache = null;
function catalog() {
  if (!catalogCache) catalogCache = R.catalogEntries();
  return catalogCache.map((e) => ({ ...e }));
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

function goVersionOf(ctx, options) {
  if (options.goVersion) return String(options.goVersion);
  const root = ctx && ctx.root;
  if (!root) return '';
  try {
    const p = path.join(root, 'go.mod');
    if (!fs.existsSync(p)) return '';
    const m = /^go\s+(\d+\.\d+)/m.exec(fs.readFileSync(p, 'utf8'));
    return m ? m[1] : '';
  } catch (e) {
    return '';
  }
}

// Without a go.mod, the oldest Go release that compiles features the code
// uses: range over an integer (1.22), the iter package / range over a
// function iterator (1.23). '' when nothing tells.
const RANGE_INT = /\bfor\s+(?:[\w\s,]*:?=\s*)?range\s+(?:\d|len\s*\()/;
const ITER_IMPORT = /^\s*(?:import\s+)?"iter"\s*$|^\s*import\s+"iter"/m;
function inferGoVersion(files) {
  let v = '';
  for (const f of files) {
    if (ITER_IMPORT.test(f.text)) return '1.23';
    if (!v && RANGE_INT.test(f.text)) v = '1.22';
  }
  return v;
}

function versionAtLeast(v, want) {
  if (!v) return false;
  const [a, b] = v.split('.').map(Number);
  const [c, d] = want.split('.').map(Number);
  return a > c || (a === c && b >= d);
}

class Engine {
  constructor(project, active, opts) {
    this.project = project;
    this.active = active;
    this.opts = opts;
    this.findings = [];
    this.seen = new Set();
    this.internalErrors = 0;
  }
  add(id, pf, node, en, ko, extra) {
    const key = `sem-go:${id}`;
    if (!this.active.has(key) || !pf || pf.skip) return;
    const line = (extra && extra.line) || node.line || 1;
    const col = (extra && extra.col) || node.col || 1;
    const k = `${key}|${pf.path}|${line}|${col}`;
    if (this.seen.has(k)) return;
    this.seen.add(k);
    const def = R.BY_ID.get(id);
    const f = { rule: key, file: pf.path, line, column: col, message: { en: en || def.en[0], ko: ko || def.ko[0] } };
    if (node.endLine && !(extra && extra.line)) { f.endLine = node.endLine; f.endColumn = node.endCol; }
    if (extra && extra.events) f.events = extra.events;
    if (extra && extra.fn) f.function = extra.fn;
    else {
      const fn = node.parent ? enclosing(node) : null;
      if (fn) f.function = A.funcName(fn);
    }
    if (extra && extra.severity) f.severity = extra.severity;
    this.findings.push(f);
  }
}

function enclosing(n) {
  for (let p = n; p; p = p.parent) if (p.k === 'FuncDecl') return p;
  return null;
}

function makeCx(engine, def, pf) {
  return {
    def,
    pf,
    src: pf ? pf.src : '',
    project: engine.project,
    opts: engine.opts,
    report(node, en, ko, extra) { engine.add(def.id, pf, node, en, ko, extra); },
    reportIn(otherPf, node, en, ko, extra) { engine.add(def.id, otherPf, node, en, ko, extra); },
    text(n) { return A.text(pf.src, n); },
    norm(n) { return A.norm(pf.src, n); },
    cfg(fn) { return cfgOf(fn); },
  };
}

function cfgOf(fn) {
  if (fn._cfg === undefined) fn._cfg = fn.body ? buildCFG(fn) : null;
  return fn._cfg;
}

function analyze(files, ctx = {}) {
  const inactive = ctx.inactive || new Set();
  const options = Object.assign({}, (ctx.options && (ctx.options['sem-go'] || ctx.options.semGo)) || {});
  const goFiles = (files || []).filter((f) => f && typeof f.text === 'string' && f.text.length <= MAX_FILE_BYTES && (f.lang === 'go' || (!f.lang && /\.go$/i.test(f.path || '')) || (f.lang === undefined && /\.go$/i.test(f.path || ''))));
  if (!goFiles.length) return [];
  const active = new Set(R.RULES.map((r) => r.key).filter((k) => !inactive.has(k)));
  if (!active.size) return [];
  const t0 = Date.now();
  let project;
  try {
    project = buildProject(goFiles);
  } catch (e) {
    if (process.env.SEMGO_DEBUG) throw e;
    return [];
  }
  options.goVersion = goVersionOf(ctx, options) || inferGoVersion(goFiles);
  options.loopVarPerIteration = versionAtLeast(options.goVersion, '1.22');
  const engine = new Engine(project, active, options);
  for (const pf of project.files) pf.skip = pf.generated;
  const defs = R.RULES.filter((d) => active.has(d.key));
  const table = handlerTables();

  for (const def of defs) {
    if (!def.project) continue;
    try { def.project(project, makeCx(engine, def, null)); } catch (e) { if (process.env.SEMGO_DEBUG) throw e; engine.internalErrors++; }
  }
  for (const pf of project.files) {
    if (pf.skip) continue;
    const cxs = new Map();
    const cxFor = (def) => { let c = cxs.get(def.id); if (!c) { c = makeCx(engine, def, pf); cxs.set(def.id, c); } return c; };
    for (const def of defs) {
      if (!def.file) continue;
      try { def.file(pf, cxFor(def)); } catch (e) { if (process.env.SEMGO_DEBUG) throw e; engine.internalErrors++; }
    }
    A.walk(pf.ast, (n) => {
      const hs = table.get(n.k);
      if (!hs) return true;
      for (const h of hs) {
        if (!active.has(h.def.key)) continue;
        try { h.fn(n, cxFor(h.def)); } catch (e) { if (process.env.SEMGO_DEBUG) throw e; engine.internalErrors++; }
      }
      return true;
    });
  }

  // flow engines
  const wantDead = active.has('sem-go:dead-store') || active.has('sem-go:err-unchecked');
  const wantUnreach = active.has('sem-go:unreachable-code');
  const wantSE = defs.some((d) => d.engine === 'se');
  if (wantDead || wantUnreach || wantSE) {
    for (const pf of project.files) {
      if (pf.skip) continue;
      for (const fn of pf.funcs) {
        if (!fn.body) continue;
        try {
          const g = cfgOf(fn);
          if (!g) continue;
          if (wantDead) deadStoreReports(engine, pf, g);
          if (wantUnreach) flow.unreachableStatements(g, (s) => engine.add('unreachable-code', pf, s, 'Remove this code: it can never be executed.', '이 코드는 실행될 수 없으므로 지우세요.'));
          if (wantSE) {
            const se = new FnSE(g, pf, (id, node, en, ko, extra) => engine.add(id, pf, node, en, ko, extra ? { ...extra, line: node.line, col: node.col } : { line: node.line, col: node.col }));
            se.run();
          }
        } catch (e) {
          if (process.env.SEMGO_DEBUG) throw e;
          engine.internalErrors++;
        }
      }
    }
  }
  if (ctx.stats) {
    ctx.stats.semGo = { files: project.files.length, ms: Date.now() - t0, internalErrors: engine.internalErrors, parseErrors: project.files.reduce((a, f) => a + f.errors.length, 0) };
  }
  return engine.findings;
}

function deadStoreReports(engine, pf, g) {
  flow.deadStores(g, (d) => {
    const sym = d.sym;
    if (!sym || sym.captured || sym.addrTaken || sym.kind === 'result' || sym.kind === 'recv') return;
    if (d.zero) return;
    if (sym.reads === 0) return;
    const isErr = sym.tstr === 'error';
    if (isErr) {
      const rhs = A.strip(d.rhs);
      if (!rhs || rhs.k !== 'Call') return;
      engine.add('err-unchecked', pf, d.ident, `The error assigned to '${sym.name}' here is never checked before it is overwritten or the function ends.`,
        `여기서 '${sym.name}'에 대입한 오류를 덮어쓰거나 함수가 끝나기 전에 확인하지 않습니다.`);
      return;
    }
    if (d.op !== '=' && d.op !== ':=') return;
    if (flow.trivialValue(d.rhs)) return;
    if (sym.name.startsWith('_')) return;
    engine.add('dead-store', pf, d.ident, `Remove this useless assignment to '${sym.name}': the value is never read.`,
      `'${sym.name}'에 대한 쓸모없는 대입을 지우세요. 값을 읽지 않습니다.`);
  });
}

module.exports = { catalog, analyze, _internals: { buildProject, buildCFG } };
