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
const hlang = require('./cfamily/hlang');
const { normPath } = require('./cfamily/preprocess');

const parsed = new WeakMap();

function cFiles(files) {
  return (files || []).filter((f) => f.lang === 'c' || f.lang === 'cpp');
}

// ---------------------------------------------------------------- header languages

// A '.h' header is C, C++ or both, by the units that include it and by its
// own syntax (core/cfamily/hlang.js). A C++ header is parsed as C++ when it
// is analyzed on its own, the C rules do not report on it and the C++ rules
// do not report on a C header. A batch of a large project carries the
// decision made over the whole project (list.headerInfo).
function headerInfoOf(files, options = {}) {
  if (files && files.headerInfo) return files.headerInfo;
  return hlang.headerInfo(cFiles(files), { includeDirs: options.includeDirs });
}

// files: [{ path, lang, text }] -> Map(header path -> 'c' | 'cpp' | 'both')
function headerLanguages(files, options = {}) {
  const out = new Map();
  for (const [p, h] of headerInfoOf(files, options)) out.set(p, h.lang);
  return out;
}

// Sets lang 'cpp' on the '.h' files of the list that are C++ headers (for the
// language of their issues and the language breakdown). Returns the list.
function assignHeaderLanguages(files, options = {}) {
  const langs = headerLanguages(files, options);
  for (const f of files || []) {
    if (f.lang === 'c' && cf.isHeader(f.path) && langs.get(normPath(f.path)) === 'cpp') f.lang = 'cpp';
  }
  return files;
}

// Whether a finding of a rule for `langs` in `file`, seen through a unit of
// `unitLang` (null for project rules), is in the language of that file.
// fileLangs: project.fileLangs (headers and translation units).
function inLanguage(fileLangs, file, langs, unitLang) {
  const hl = fileLangs && fileLangs.get(file);
  if (!hl || hl === 'both') return true;
  if (langs && !langs.includes('*') && !langs.includes(hl)) return false;
  return !unitLang || unitLang === hl;
}

function copyInfo(info) {
  const out = new Map();
  for (const [p, h] of info) out.set(p, { ...h, from: new Set(h.from) });
  return out;
}

function projectFor(files, options = {}) {
  if (parsed.has(files)) return parsed.get(files);
  const info = copyInfo(headerInfoOf(files, options));
  const langOf = (f) => (f.lang === 'c' && info.has(normPath(f.path)) && info.get(normPath(f.path)).lang === 'cpp' ? 'cpp' : f.lang);
  const sources = cFiles(files).map((f) => ({ path: f.path, text: f.text, lang: langOf(f) }));
  let project = { units: [], globalSymbols: new Map(), callGraph: null, diagnostics: [] };
  if (sources.length) {
    project = cf.parseProject(sources, {
      includeDirs: options.includeDirs || [],
      defines: options.defines || {},
      undefs: options.undefs,
      platform: options.platform,
      target: options.target,
      unitFiles: files.unitFiles,
      lexCache: files.lexCache,
    });
  }
  // What the units really included (an #include through a macro, say).
  hlang.refine(info, project.units);
  const langs = new Map();
  for (const [p, h] of info) langs.set(p, h.lang);
  project.headerLangs = langs;
  // ... and the language of every file the engines report on
  const fileLangs = new Map(langs);
  for (const u of project.units) if (!fileLangs.has(u.file)) fileLangs.set(u.file, u.lang);
  project.fileLangs = fileLangs;
  parsed.set(files, project);
  return project;
}

// ---------------------------------------------------------------- batches

// A parsed unit keeps the AST and tokens of everything it includes, so a large
// project (thousands of units that each pull in a big library header) does not
// fit in memory at once: the heap runs out, and so does V8's limit on entries
// per Map (the AST parent table). Such a project is parsed in batches of units
// that fit a token budget; the engines run on each batch, and the batch is
// dropped before the next one is parsed. Cross-unit rules then see one batch
// at a time.
const BATCH = {
  smallSources: 150, // up to this many sources and headers: one parse, as before
  firstSources: 40,
  maxSources: 200,
  tokens: 1000000, // about 0.8 GB of parse data
};

function batchOf(headers, units, extra, lexCache, headerInfo) {
  const files = [...headers, ...extra];
  Object.defineProperty(files, 'unitFiles', { value: units.map((f) => f.path) });
  // One header token cache for all batches: the headers are lexed once.
  if (lexCache) Object.defineProperty(files, 'lexCache', { value: lexCache });
  // The header languages of the whole project (a batch has some units only).
  if (headerInfo) Object.defineProperty(files, 'headerInfo', { value: headerInfo });
  return files;
}

// What a parsed batch tells the planner: its size in tokens and the headers
// its units include.
function statsOf(project) {
  let tokens = 0;
  const included = [];
  for (const u of (project && project.units) || []) {
    tokens += u.tokens ? u.tokens.length : 0;
    for (const inc of u.includes || []) if (inc.resolved) included.push(inc.resolved);
  }
  return { tokens, units: ((project && project.units) || []).length, included };
}

// Plans the batches of a project. next() gives the next list, null while the
// headers no unit includes cannot be told yet (batches are still out), or
// undefined at the end; done(list, stats) reports a parsed batch. Batches can
// be parsed here (batches()) or elsewhere (core/cfamily-pool.js).
function planner(files, limits = {}) {
  const lim = { ...BATCH, ...limits };
  const cfiles = cFiles(files);
  const headers = cfiles.filter((f) => cf.isHeader(f.path));
  const sources = cfiles.filter((f) => !cf.isHeader(f.path));
  const single = sources.length <= lim.smallSources && headers.length <= lim.smallSources;
  const lexCache = limits.lexCache === false ? null : new Map();
  let info = null; // header languages, made with the first batch
  const included = new Set();
  let size = lim.firstSources;
  let pending = sources;
  let at = 0;
  let stage = single ? 'single' : 'sources';
  let out = 0;
  let index = 0;
  // The batch size is learned from the first batch only, so the batches are the
  // same however many threads parse them (and so are cross-unit findings).
  let learned = false;
  return {
    single,
    headers,
    sources,
    next() {
      if (stage === 'single') { stage = 'end'; return files; }
      if (stage === 'end') return undefined;
      if (index >= 1 && !learned) return null;
      if (at >= pending.length) {
        if (out > 0) return null;
        if (stage === 'alone') { stage = 'end'; return undefined; }
        // Headers that no unit includes are analyzed on their own.
        pending = headers.filter((f) => !included.has(normPath(f.path)));
        at = 0;
        stage = 'alone';
        if (!pending.length) { stage = 'end'; return undefined; }
      }
      const part = pending.slice(at, at + size);
      at += part.length;
      if (!info) info = hlang.headerInfo(cfiles, { includeDirs: lim.includeDirs });
      const list = batchOf(headers, part, stage === 'sources' ? part : [], lexCache, info);
      index++;
      out++;
      // list.batch = { index, estimate } (1-based; the estimate of the batch
      // count follows the measured size of the units).
      const left = pending.length - at + (stage === 'sources' ? headers.length : 0);
      Object.defineProperty(list, 'batch', { value: { index, estimate: index + Math.ceil(left / size) } });
      return list;
    },
    done(list, stats) {
      if (list === files) return;
      out--;
      if (stats) for (const p of stats.included || []) included.add(p);
      if (learned) return;
      learned = true;
      const per = stats ? stats.tokens / Math.max(1, stats.units || (list.unitFiles || []).length) : 0;
      if (per > 0) size = Math.max(1, Math.min(lim.maxSources, Math.floor(lim.tokens / per)));
    },
  };
}

// Yields file lists for the C/C++ engines. A list is handed to every engine
// (they share its parse through projectFor) before the next one is made.
function* batches(files, limits = {}) {
  const plan = planner(files, limits);
  for (let list = plan.next(); list; list = plan.next()) {
    yield list;
    plan.done(list, parsed.has(list) ? statsOf(parsed.get(list)) : null);
  }
}

// Engines that read the shared parse and so run once per batch.
const ENGINE_IDS = new Set(['misra-c', 'misra-cpp', 'cert', 'absint', 'his', 'autosar', 'misra-legacy']);

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
        // A C rule says nothing about a C++ header (nor a C++ rule about a C
        // header), also when a unit of the other language includes it.
        if (!inLanguage(project.fileLangs, file, rule.meta.langs, unit && unit.lang)) return;
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

module.exports = {
  cf, projectFor, parsedProject: (files) => parsed.get(files) || null, batchOf, createEngine, loadPack, batches, planner, statsOf, ENGINE_IDS, BATCH,
  headerInfo: headerInfoOf, headerLanguages, assignHeaderLanguages, inLanguage,
};
