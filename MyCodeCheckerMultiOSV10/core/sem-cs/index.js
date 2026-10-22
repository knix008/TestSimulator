'use strict';

// C# semantic analyzer (SonarC#-style). Contract: core/ENGINE_CONTRACT.md.
// Rule keys 'sem-cs:<id>'.
//
// Pipeline: tolerant lexer + parser (C# 12) -> project model (types merged
// across partial declarations, inheritance by name, scopes and symbols) ->
// syntactic / semantic rules dispatched by node kind -> per function CFG with
// symbolic execution (null, collections, disposables, locks, conditions) and
// data-flow (dead stores, unreachable code).

const { buildProject } = require('./model');
const { forEachChild } = require('./ast');
const { RULES, meta } = require('./registry');
const { FnSE } = require('./se');
const { buildCFG } = require('./cfg');
const { deadStores, unreachableStatements } = require('./flow');
const { isGenerated } = require('./util');
const { shortText } = require('./se');

require('./rules/flow-defs');
require('./rules/bugs');
require('./rules/smells');
require('./rules/design');
require('./rules/naming');
require('./rules/security');
require('./rules/aspnet');
require('./rules/tests');

function catalog() {
  return RULES.map(meta);
}

class Engine {
  constructor(project, active, opts) {
    this.project = project;
    this.active = active;
    this.opts = opts || {};
    this.findings = [];
    this.internalErrors = 0;
    this.trackDisposables = active.has('sem-cs:disposable-not-disposed') || active.has('sem-cs:disposed-object-used') || active.has('sem-cs:dispose-twice');
    this.lockReleases = new Map();
    this.seen = new Set();
  }

  add(ruleKey, pf, node, en, ko, extra) {
    if (!this.active.has(ruleKey)) return;
    if (pf.skipReport) return;
    const line = node.nameLine && extra && extra.atName ? node.nameLine : node.line;
    const col = node.nameLine && extra && extra.atName ? node.nameCol : node.col;
    const k = `${ruleKey}|${pf.path}|${line}|${col}`;
    if (this.seen.has(k)) return;
    this.seen.add(k);
    const f = {
      rule: ruleKey,
      file: pf.path,
      line: line || 1,
      column: col || 1,
      message: { en, ko },
    };
    if (node.endLine && !(extra && extra.atName)) { f.endLine = node.endLine; f.endColumn = node.endCol; }
    if (extra && extra.events) f.events = extra.events;
    if (extra && extra.fn) f.function = extra.fn;
    if (extra && extra.severity) f.severity = extra.severity;
    this.findings.push(f);
  }

  nullableCtx(pf) {
    if (pf._nullable !== undefined) return pf._nullable;
    let on = !!(pf.lex && pf.lex.nullableEnabled);
    if (!on) {
      for (const t of pf.byKind.get('Type') || []) {
        if (!t.nullable) continue;
        if (t.name === 'string' || t.name === 'object' || /Exception$/.test(t.name)) { on = true; break; }
        const arr = this.project.typesByName.get(t.name);
        if (arr && arr.some((i) => i.kind === 'class' || i.kind === 'interface' || i.kind === 'record')) { on = true; break; }
      }
    }
    pf._nullable = on;
    return on;
  }

  isConstantish(node) {
    // conditions made only of literals / constants are intentional
    let ok = true;
    let sawVar = false;
    const visit = (n) => {
      if (!ok || !n || typeof n !== 'object') return;
      if (n.k === 'Name') {
        if (n.sym) { if (n.sym.isConst) return; sawVar = true; return; }
        if (n.msym && n.msym.every((m) => m.kind === 'const' || (m.kind === 'field' && m.node.mods && m.node.mods.has('readonly') && m.node.mods.has('static')))) return;
        if (n.msym) { sawVar = true; return; }
        return;
      }
      if (n.k === 'Invocation' || n.k === 'Member' || n.k === 'Element' || n.k === 'Await' || n.k === 'This') { sawVar = true; }
      forEachChild(n, visit);
    };
    visit(node);
    return !sawVar;
  }
}

function makeCx(engine, rule, pf) {
  return {
    rule,
    pf,
    project: engine.project,
    src: pf ? pf.text : '',
    engine,
    report(node, en, ko, extra) {
      if (!pf) return;
      engine.add(rule.key, pf, node, en || rule.name.en, ko || rule.name.ko, extra);
    },
    reportIn(otherPf, node, en, ko, extra) {
      engine.add(rule.key, otherPf, node, en || rule.name.en, ko || rule.name.ko, extra);
    },
    text(node) { return shortText(pf.text, node); },
  };
}

function analyze(files, ctx = {}) {
  const inactive = ctx.inactive || new Set();
  const options = (ctx.options && (ctx.options['sem-cs'] || ctx.options.semCs)) || {};
  const cs = (files || []).filter((f) => f && typeof f.text === 'string' && (f.lang === 'cs' || /\.cs$/i.test(f.path || '')));
  if (!cs.length) return [];
  const active = new Set(RULES.map((r) => r.key).filter((k) => !inactive.has(k)));
  if (!active.size) return [];
  const t0 = Date.now();
  let project;
  try {
    project = buildProject(cs);
  } catch (e) {
    if (process.env.SEMCS_DEBUG) throw e;
    return [];
  }
  const engine = new Engine(project, active, options);
  for (const pf of project.files) pf.skipReport = isGenerated(pf);
  const rules = RULES.filter((r) => active.has(r.key));
  // project-wide rules
  for (const rule of rules) {
    if (!rule.impl.project) continue;
    try { rule.impl.project(project, makeCx(engine, rule, null)); } catch (e) { if (process.env.SEMCS_DEBUG) throw e; engine.internalErrors++; }
  }
  // per file
  for (const pf of project.files) {
    if (!pf.unit || pf.skipReport) continue;
    for (const rule of rules) {
      const impl = rule.impl;
      if (!impl.file && !impl.kinds) continue;
      const cx = makeCx(engine, rule, pf);
      try {
        if (impl.file) impl.file(pf, cx);
        if (impl.kinds) {
          for (const kind in impl.kinds) {
            const nodes = pf.byKind.get(kind);
            if (!nodes) continue;
            const fn = impl.kinds[kind];
            for (const n of nodes) fn(n, cx);
          }
        }
      } catch (e) {
        if (process.env.SEMCS_DEBUG) throw e;
        engine.internalErrors++;
      }
    }
  }
  // flow engines
  const wantSE = rules.some((r) => r.impl.engine === 'se');
  const wantDead = active.has('sem-cs:dead-store');
  const wantUnreach = active.has('sem-cs:unreachable-code');
  if (wantSE || wantDead || wantUnreach) {
    for (const pf of project.files) {
      if (!pf.unit || pf.skipReport) continue;
      for (const fn of functionsOf(pf)) {
        const body = fn.k === 'TopLevel' ? { k: 'Block', stmts: fn.stmts, line: fn.line, col: fn.col } : (fn.body || fn.exprBody);
        if (!body) continue;
        if (fn.bindError) continue;
        try {
          if (wantSE) {
            engine.lockReleases.set(fn, hasLockRelease(body));
            const se = new FnSE(engine, fn, body, pf);
            se.run();
          }
          if (wantDead || wantUnreach) {
            const cfg = buildCFG(fn, body);
            if (cfg) {
              if (wantDead) {
                deadStores(cfg, fn, (ev) => {
                  if (!reportableDead(ev, pf)) return;
                  const n = ev.node;
                  const at = n.k === 'Assign' ? n.left : n;
                  engine.add('sem-cs:dead-store', pf, at, `Remove this useless assignment to local variable '${ev.sym.name}'.`,
                    `지역 변수 '${ev.sym.name}'에 대한 쓸모없는 대입을 지우세요.`);
                });
              }
              if (wantUnreach && fn.k !== 'Lambda') {
                unreachableStatements(cfg, (s) => engine.add('sem-cs:unreachable-code', pf, s, 'Remove this unreachable code.', '도달할 수 없는 이 코드를 지우세요.'));
              }
            }
          }
        } catch (e) {
          if (process.env.SEMCS_DEBUG) throw e;
          engine.internalErrors++;
        }
      }
    }
  }
  if (ctx.stats) {
    ctx.stats.semCs = { files: project.files.length, ms: Date.now() - t0, internalErrors: engine.internalErrors, parseErrors: project.files.reduce((a, f) => a + f.errors.length, 0) };
  }
  return engine.findings;
}

function reportableDead(ev, pf) {
  const sym = ev.sym;
  if (!sym || sym.reads === 0) return false;
  if (sym.name.startsWith('_')) return false;
  const ids = pf.lex && pf.lex.inactiveIds;
  if (ids && ids.has(sym.name)) return false;
  return true;
}

function hasLockRelease(body) {
  let found = false;
  const visit = (n) => {
    if (found || !n || typeof n !== 'object') return;
    if (n.k === 'Member' && ['Exit', 'ReleaseMutex', 'ExitReadLock', 'ExitWriteLock', 'ExitUpgradeableReadLock'].includes(n.name)) { found = true; return; }
    forEachChild(n, visit);
  };
  visit(body);
  return found;
}

// functions to analyze: members with bodies, local functions and block lambdas
function functionsOf(pf) {
  const out = [];
  for (const fn of pf.funcs) {
    if (fn.k === 'Initializer' || fn.k === 'TypeDecl') continue;
    if (fn.k === 'Property' || fn.k === 'Indexer' || fn.k === 'Event') { if (fn.exprBody) out.push(fn); continue; }
    out.push(fn);
  }
  for (const kind of ['LocalFunc', 'Lambda']) {
    for (const n of pf.byKind.get(kind) || []) {
      if (kind === 'Lambda' && (!n.body || n.body.k !== 'Block')) continue;
      out.push(n);
    }
  }
  return out;
}

module.exports = { catalog, analyze, _internals: { buildProject } };
