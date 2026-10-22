'use strict';

// Shared driver for the C/C++ rule engines (misra-c, misra-cpp, cert, absint).
// One analysis parses the C/C++ files once; every engine reads the same
// parseProject() result. Rule packs are folders of modules that each export
// an array of rules:
//
//   { meta: RuleMeta, check(unit, api) }   // per translation unit
//   { meta: RuleMeta, project(project, api) } // once, across all units
//
// api.report(node | loc | { file, line, column }, message, extra?) records a
// Finding for meta.key. See core/ENGINE_CONTRACT.md and core/cfamily/AST.md.

const fs = require('fs');
const path = require('path');
const cf = require('./cfamily');

const parsed = new WeakMap();

function cFiles(files) {
  return (files || []).filter((f) => f.lang === 'c' || f.lang === 'cpp');
}

function projectFor(files, options = {}) {
  if (parsed.has(files)) return parsed.get(files);
  const sources = cFiles(files).map((f) => ({ path: f.path, text: f.text, lang: f.lang }));
  let project = { units: [], globalSymbols: new Map(), callGraph: null, diagnostics: [] };
  if (sources.length) {
    project = cf.parseProject(sources, {
      includeDirs: options.includeDirs || [],
      defines: options.defines || {},
      target: options.target,
    });
  }
  parsed.set(files, project);
  return project;
}

function loadPack(dir) {
  const rules = [];
  if (!fs.existsSync(dir)) return rules;
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.js')) continue;
    const mod = require(path.join(dir, name));
    const list = Array.isArray(mod) ? mod : (mod.RULES || []);
    for (const rule of list) if (rule && rule.meta && rule.meta.key) rules.push(rule);
  }
  return rules;
}

function locOf(where) {
  if (!where) return null;
  if (where.loc) return where.loc;
  if (where.line) return where;
  return null;
}

// Build a contract engine ({ catalog, analyze }) from rule pack folders.
function createEngine(dirs, opts = {}) {
  let rules = null;
  const all = () => {
    if (!rules) rules = dirs.flatMap(loadPack);
    return rules;
  };
  const langs = new Set(opts.langs || ['c', 'cpp']);

  function catalog() {
    return all().map((r) => r.meta);
  }

  function analyze(files, ctx = {}) {
    const inactive = ctx.inactive || new Set();
    const active = all().filter((r) => !inactive.has(r.meta.key));
    if (!active.length || !cFiles(files).some((f) => langs.has(f.lang))) return [];
    const project = projectFor(files, (ctx.options && ctx.options.cfamily) || {});
    const findings = [];
    const seen = new Set();
    const apiFor = (rule, unit) => ({
      cf,
      project,
      unit,
      options: ctx.options || {},
      report(where, message, extra = {}) {
        const loc = locOf(where);
        if (!loc || !loc.line) return;
        const file = loc.file || (unit && unit.file);
        if (!file || file.startsWith('<')) return; // built-in header stand-ins
        const dedupe = `${rule.meta.key}|${file}|${loc.line}|${loc.col || loc.column || 0}|${message && message.en}`;
        if (seen.has(dedupe)) return;
        seen.add(dedupe);
        findings.push({
          rule: rule.meta.key,
          file,
          line: loc.line,
          column: loc.col || loc.column,
          endLine: loc.endLine,
          message: message || rule.meta.name,
          ...extra,
        });
      },
    });
    for (const rule of active) {
      const applies = (rule.meta.langs || ['c', 'cpp']);
      try {
        if (rule.project) rule.project(project, apiFor(rule, null));
        if (rule.check) {
          for (const unit of project.units) {
            if (!applies.includes(unit.lang) && !applies.includes('*')) continue;
            rule.check(unit, apiFor(rule, unit));
          }
        }
      } catch (err) {
        // A broken rule must not stop the rest of the analysis.
        if (ctx.warnings) ctx.warnings.push({ rule: rule.meta.key, message: String(err && err.message) });
      }
    }
    return findings;
  }

  return { catalog, analyze, rules: all };
}

module.exports = { cf, projectFor, createEngine, loadPack };
