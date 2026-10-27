'use strict';

const compat = require('./compat');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { detectLanguage, ruleLangsFor, commentKind } = require('./languages');
const { RULES, ruleMeta } = require('./rules');
const { structuralIssues, structuralMeta, decisionCount, STRUCTURAL } = require('./metrics');
const { findDuplications } = require('./duplication');
const { readCoverage, coverageFor, parseLcov } = require('./coverage');
const { rate, countOpen, isClosed } = require('./ratings');
const { evaluateGate, DEFAULT_GATE } = require('./qualitygate');
const { checkerCatalog, decorateIssue, pathDefects, summarizeDefects } = require('./defects');
const checks = require('./checks');
const { engines, engineCatalog, extraLineRules } = require('./engines');
const cfront = require('./cfront');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'target', 'vendor', '__pycache__',
  '.venv', 'venv', 'bin', 'obj', '.idea', '.vs', '.next', 'out', 'coverage', '.mcc',
]);

const STRUCT_BY_KEY = new Map(STRUCTURAL.map((r) => [r.key, r]));

// options.onProgress({ phase, done, total, detail }) is called during the
// analysis: 'collect' (reading files), 'rules' (per file), 'engines' (per
// engine) and 'finish'. Calls are throttled except phase changes.
function progressReporter(onProgress) {
  if (typeof onProgress !== 'function') return () => {};
  let last = 0;
  let lastPhase = '';
  return (phase, done, total, detail) => {
    const now = Date.now();
    if (phase === lastPhase && now - last < 100 && done < total) return;
    last = now;
    lastPhase = phase;
    try { onProgress({ phase, done, total, detail: detail || '' }); } catch { /* progress is best effort */ }
  };
}

function analyzePath(root, options = {}) {
  const { sources, options: opts } = collectSources(root, options);
  return analyzeSources(sources, opts);
}

// The files of a folder and its coverage, as analyzeSources takes them
// ({ sources, options } with root and coverage set).
function collectSources(root, options = {}) {
  const abs = path.resolve(root);
  const report = progressReporter(options.onProgress);
  report('collect', 0, 1, abs);
  const files = walk(abs, options);
  const sources = [];
  const maxBytes = options.maxBytes || Infinity;
  for (const file of files) {
    let text;
    try {
      const st = fs.statSync(file);
      if (st.size > maxBytes) continue;
      text = fs.readFileSync(file, 'utf8');
    } catch { continue; }
    sources.push({ path: file, text });
    report('collect', sources.length, files.length, file);
  }
  let coverage = null;
  try { coverage = readCoverage(abs, options.coverageReports); } catch { coverage = null; }
  if (options.coverageText) {
    try { coverage = parseLcov(options.coverageText, abs); } catch { /* keep file coverage */ }
  }
  return { sources, options: { ...options, root: abs, coverage } };
}

// The analyzed files: relative paths, a known language, not excluded, text only.
function prepareFiles(files, options = {}) {
  const root = options.root || '';
  const exclusions = options.exclusions || [];
  const excludeDirs = normDirs(options.excludeDirs);
  const onlyLangs = options.languages && options.languages.length ? new Set(options.languages) : null;
  const prepared = [];
  for (const file of files || []) {
    const rel = toRel(root, file.path);
    if (excluded(rel, exclusions) || inDirs(rel, excludeDirs)) continue;
    const lang = detectLanguage(file.path);
    if (!lang) continue;
    if (onlyLangs && !onlyLangs.has(lang)) continue;
    const text = String(file.text == null ? '' : file.text);
    if (text.includes('\0')) continue;
    prepared.push({ path: rel, text, lang });
  }
  return prepared;
}

// The engines that share the C/C++ parse and run for these options.
function sharedEngines(options = {}) {
  const off = new Set(options.disabledChecks || []);
  const skip = new Set(options.skipEngines || []);
  return engines().filter((e) => cfront.ENGINE_IDS.has(e.id) && !checks.engineOff(e.id, off) && !skip.has(e.id));
}

// The files the shared C/C++ parse reads: options.cfamilyMaxBytes leaves larger
// C/C++ files out (a reduced analysis after running out of memory).
function cfamilyInput(prepared, options = {}) {
  const maxC = options.cfamilyMaxBytes;
  return maxC ? prepared.filter((f) => !((f.lang === 'c' || f.lang === 'cpp') && String(f.text).length > maxC)) : prepared;
}

function walk(root, options) {
  const out = [];
  const maxFiles = options.maxFiles || Infinity;
  const exclusions = options.exclusions || [];
  const excludeDirs = normDirs(options.excludeDirs);
  const visit = (dir) => {
    if (out.length >= maxFiles) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      if (out.length >= maxFiles) return;
      if (ent.name === '.' || ent.name === '..') continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name)) continue;
        if (excluded(path.relative(root, full), exclusions)) continue;
        if (inDirs(path.relative(root, full), excludeDirs)) continue;
        visit(full);
      } else if (ent.isFile()) {
        const rel = path.relative(root, full);
        if (excluded(rel, exclusions)) continue;
        if (!detectLanguage(full)) continue;
        out.push(full);
      }
    }
  };
  visit(root);
  return out;
}

function analyzeSources(files, options = {}) {
  const root = options.root || '';
  const inactive = new Set(options.inactive || []);
  const overrides = options.overrides || {};
  const previous = new Set(options.previousKeys || []);
  const states = options.issueState || {};
  const custom =(options.customRules || []).map(compileCustom).filter(Boolean);
  const rules = [...RULES, ...extraLineRules()].filter((r) => !inactive.has(r.key));  const started = Date.now();
  const warnings = [];

  const prepared = prepareFiles(files, options);

  const issues = issueList(issueBudget(options));
  const fileRows = [];
  const dupInput = [];
  let complexity = 0;
  const langCount = {};
  // Line-based new code: SCM changed lines (options.isNewLine), else lines whose
  // content is not in the baseline analysis (options.previousLineHashes).
  const lineHashes = {};
  const newLines = new Map();
  const prevHashes = options.previousLineHashes || null;
  if (typeof options.isNewLine !== 'function' && options.scmChanged && options.scmChanged.files) {
    const { isChangedLine } = require('./platform/scm');
    const changed = options.scmChanged;
    options = { ...options, isNewLine: (file, line) => isChangedLine(changed, file, line) };
  }
  const lineMode = typeof options.isNewLine === 'function' ? 'scm' : (prevHashes && options.hasBaseline !== false ? 'hash' : null);
  let newNclocLines = 0;
  let newToCover = 0;
  let newCovered = 0;

  const report = progressReporter(options.onProgress);
  let fileIndex = 0;
  for (const file of prepared) {
    report('rules', fileIndex++, prepared.length, file.path);
    const kind = commentKind(file.lang);
    const structural = structuralIssues(file.text, kind, options.limits);
    const suppressed = suppressionLines(file.text);
    langCount[file.lang] = (langCount[file.lang] || 0) + 1;
    let fileComplexity = 1;
    for (const line of structural.code) fileComplexity += decisionCount(line);
    complexity += fileComplexity;
    const hashes = structural.lines.map(lineHash);
    lineHashes[file.path] = hashes.join('');
    if (lineMode) {
      const set = new Set();
      if (lineMode === 'scm') {
        for (let i = 0; i < hashes.length; i++) if (options.isNewLine(file.path, i + 1)) set.add(i + 1);
      } else {
        const before = prevHashes[file.path];
        const pool = new Map();
        if (typeof before === 'string') for (let i = 0; i + HASH_LEN <= before.length; i += HASH_LEN) { const h = before.slice(i, i + HASH_LEN); pool.set(h, (pool.get(h) || 0) + 1); }
        for (let i = 0; i < hashes.length; i++) {
          const left = pool.get(hashes[i]) || 0;
          if (left > 0) pool.set(hashes[i], left - 1);
          else if (structural.lines[i].trim()) set.add(i + 1);
        }
      }
      newLines.set(file.path, set);
      for (const n of set) if (structural.code[n - 1] && structural.code[n - 1].trim()) newNclocLines++;
    }

    const push = (found, rule, lang) => {
      if (!found || !found.line || suppressed.has(found.line)) return;
      if (inactive.has(rule.key)) return;
      const severity = overrides[rule.key] || rule.severity;
      const rawLine = structural.lines[found.line - 1] || '';
      const item = makeIssue({
        rule, severity, lang: lang || file.lang, file: file.path, line: found.line,
        message: found.message || rule.name, rawLine, lines: structural.lines,
      });
      issues.add(item);
    };

    for (const found of structural.issues) {
      const rule = STRUCT_BY_KEY.get(found.rule);
      if (rule) push(found, rule, file.lang);
    }

    const langs = new Set(ruleLangsFor(file.lang));
    for (const rule of rules) {
      if (!ruleApplies(rule, langs)) continue;
      const sourceLines = rule.scope === 'any' ? structural.lines : structural.code;
      for (let i = 0; i < sourceLines.length; i++) {
        const line = sourceLines[i];
        if (!line || !line.trim()) continue;
        if (rule.scope !== 'any' && structural.commentOnly[i] && line.trim() === '') continue;
        rule.re.lastIndex = 0;
        if (!rule.re.test(line)) continue;
        if (rule.skip && rule.skip(structural.lines[i], line)) continue;
        push({
          line: i + 1,
          message: rule.name,
        }, rule, file.lang);
      }
    }
    for (const rule of custom) {
      if (!ruleApplies(rule, langs) && !rule.langs.includes('*')) continue;
      for (let i = 0; i < structural.lines.length; i++) {
        const line = structural.lines[i];
        rule.re.lastIndex = 0;
        if (!rule.re.test(line)) continue;
        push({ line: i + 1, message: rule.name }, rule, file.lang);
      }
    }
    for (const found of pathDefects(file.text, file.lang, file.path, { inactive: options.inactive, models: options.models })) {
      if (!found || !found.line || suppressed.has(found.line)) continue;
      const rule = {
        key: found.rule,
        type: found.type,
        severity: found.severity,
        debtMin: found.debtMin,
        tags: found.tags,
        name: found.message,
      };
      const item = makeIssue({
        rule, severity: overrides[found.rule] || found.severity, lang: file.lang, file: file.path,
        line: found.line, message: found.message, rawLine: structural.lines[found.line - 1] || '', lines: structural.lines,
      });
      item.events = found.events;
      item.checker = found.checker;
      item.impact = found.impact;
      item.function = found.function;
      issues.add(item);
    }

    const cov = coverageFor(options.coverage, file.path);
    if (cov && cov.lines && newLines.has(file.path)) {
      for (const n of newLines.get(file.path)) {
        const hit = cov.lines[n];
        if (hit == null) continue;
        newToCover++;
        if (hit) newCovered++;
      }
    }
    fileRows.push({
      path: file.path,
      language: file.lang,
      ncloc: structural.metrics.ncloc,
      lines: structural.metrics.lines,
      commentLines: structural.metrics.commentLines,
      commentDensity: structural.metrics.commentDensity,
      complexity: fileComplexity,
      coverage: cov && cov.toCover ? Math.round((cov.covered / cov.toCover) * 1000) / 10 : null,
    });
    dupInput.push({ path: file.path, lines: structural.code });
  }

  report('rules', prepared.length, prepared.length, '');
  runEngines(prepared, { inactive, root, options }, issues, overrides, warnings, report);
  report('finish', 1, 1, '');

  const dup = findDuplications(dupInput);
  const ncloc = fileRows.reduce((n, f) => n + f.ncloc, 0);
  const commentLines = fileRows.reduce((n, f) => n + f.commentLines, 0);

  const linesOf = lineCache(prepared, { missing: [] });
  for (let n = 0; n < issues.length; n++) {
    issues[n] = decorateIssue(issues[n], linesOf(issues[n].file), options.components);
  }
  // The line-based Defect Analysis pass (defect:*) yields to a path-sensitive engine
  // finding of the same checker on the same line.
  const precise = new Set(issues.filter((i) => i.checker && !String(i.rule).startsWith('cov:')).map((i) => `${i.checker}|${i.file}|${i.line}`));
  keepIf(issues, (i) => !(String(i.rule).startsWith('cov:') && precise.has(`${i.checker}|${i.file}|${i.line}`)));
  const annotations = new Map();
  for (const file of prepared) {
    if (compat.ANNOTATION_TEST_RE.test(file.text)) annotations.set(file.path, defectAnnotations(file.text));
  }
  if (annotations.size) {
    keepIf(issues, (i) => {
      const map = annotations.get(i.file);
      return !(map && annotationSuppresses(i, map.get(i.line)));
    });
  }
  // Check groups turned off in Settings › Analysis (custom rules and imported
  // findings always stay).
  const offChecks = new Set(options.disabledChecks || []);
  if (offChecks.size) {
    keepIf(issues, (i) => i.externalEngine || String(i.rule).startsWith('custom:') || !offChecks.has(checks.groupOf(i)));
  }
  issues.finish(warnings);
  uniqueKeys(issues);
  const hasBaseline = previous.size > 0 || options.hasBaseline;
  for (const item of issues) {
    if (lineMode === 'scm') item.isNew = newLines.has(item.file) && newLines.get(item.file).has(item.line || 1);
    else if (lineMode === 'hash') item.isNew = !previous.has(item.key) && newLines.has(item.file) && newLines.get(item.file).has(item.line || 1);
    else item.isNew = !hasBaseline || !previous.has(item.key);
    const saved = states[item.key] || states[`cid:${item.cid}`];
    if (saved) {
      item.status = saved.status || item.status;
      item.resolution = saved.resolution || null;
      item.assignee = saved.assignee || '';
      item.owner = saved.owner || saved.assignee || '';
      item.comments = saved.comments || [];
      item.changelog = saved.changelog || [];
      if (saved.classification) item.classification = saved.classification;
      if (saved.action) item.action = saved.action;
      if (saved.impact) item.impact = saved.impact;
      if (saved.tags) item.tags = saved.tags;
      if (saved.triageSeverity) item.triageSeverity = saved.triageSeverity;
      if (saved.externalReference) item.externalReference = saved.externalReference;
      if (saved.legacy) item.legacy = true;
      if (saved.review) item.review = saved.review;
    }
  }
  const defectAnalysis = summarizeDefects(issues, {
    previousCids: options.previousCids,
    hasBaseline: (options.previousCids && options.previousCids.length > 0) || false,
    previousIssues: options.previousIssues,
    policy: options.policy,
  });

  const openIssues = issues.filter((i) => i.type !== 'SECURITY_HOTSPOT');
  const hotspots = issues.filter((i) => i.type === 'SECURITY_HOTSPOT');
  const smellDebt = openIssues.filter((i) => i.type === 'CODE_SMELL' && !isClosed(i)).reduce((n, i) => n + i.debtMin, 0);
  const newIssues = issues.filter((i) => i.isNew);
  const newSmells = newIssues.filter((i) => i.type === 'CODE_SMELL' && !isClosed(i));
  const newDebt = newSmells.reduce((n, i) => n + i.debtMin, 0);
  const newFiles = new Set(newIssues.map((i) => i.file));
  const newNcloc = lineMode
    ? newNclocLines
    : hasBaseline
      ? fileRows.filter((f) => newFiles.has(f.path)).reduce((n, f) => n + f.ncloc, 0) || (newIssues.length ? 1 : 0)
      : ncloc;

  const ratingsAll = rate(openIssues, hotspots, smellDebt, ncloc);
  const ratingsNew = rate(newIssues.filter((i) => i.type !== 'SECURITY_HOTSPOT'), newIssues.filter((i) => i.type === 'SECURITY_HOTSPOT'), newDebt, newNcloc || 0);

  const coverage = options.coverage;
  const lineCoverage = coverage && coverage.linesToCover ? coverage.lineCoverage : null;
  const dupDensity = ncloc ? Math.round((dup.duplicatedLines / Math.max(ncloc, 1)) * 1000) / 10 : 0;
  let newDupDensity;
  if (lineMode) {
    const dupNew = new Set();
    for (const b of dup.blocks) {
      for (const inst of b.instances) {
        const set = newLines.get(inst.path);
        if (!set) continue;
        for (let n = inst.start; n <= inst.end; n++) if (set.has(n)) dupNew.add(`${inst.path}:${n}`);
      }
    }
    newDupDensity = newNclocLines ? Math.round((dupNew.size / newNclocLines) * 1000) / 10 : 0;
  } else {
    newDupDensity = hasBaseline ? (dup.duplicatedLines > (options.previousDuplicatedLines || 0) ? dupDensity : 0) : dupDensity;
  }
  // Coverage on new code: only new lines that the report lists.
  const newCoverage = lineMode ? (newToCover ? Math.round((newCovered / newToCover) * 1000) / 10 : null) : lineCoverage;

  const measures = {
    files: fileRows.length,
    ncloc,
    lines: fileRows.reduce((n, f) => n + f.lines, 0),
    comment_lines: commentLines,
    comment_density: (ncloc + commentLines) ? Math.round((commentLines / (ncloc + commentLines)) * 1000) / 10 : 0,
    complexity,
    duplicated_blocks: dup.blocks.length,
    duplicated_lines: dup.duplicatedLines,
    duplicated_lines_density: dupDensity,
    coverage: lineCoverage,
    bugs: countOpen(openIssues, 'BUG'),
    vulnerabilities: countOpen(openIssues, 'VULNERABILITY'),
    code_smells: countOpen(openIssues, 'CODE_SMELL'),
    security_hotspots: hotspots.filter((h) => !h.resolution).length,
    security_hotspots_reviewed: ratingsAll.hotspotsReviewed,
    sqale_index: smellDebt,
    sqale_debt_ratio: ratingsAll.debtRatio,
    reliability_rating: ratingsAll.reliabilityValue,
    security_rating: ratingsAll.securityValue,
    maintainability_rating: ratingsAll.maintainabilityValue,
    security_review_rating: ratingsAll.securityReviewValue,
    new_bugs: countOpen(newIssues, 'BUG'),
    new_vulnerabilities: countOpen(newIssues, 'VULNERABILITY'),
    new_code_smells: countOpen(newIssues, 'CODE_SMELL'),
    new_security_hotspots_reviewed: ratingsNew.hotspotsReviewed,
    new_coverage: newCoverage,
    new_lines: lineMode ? [...newLines.values()].reduce((n, s) => n + s.size, 0) : null,
    new_ncloc: newNcloc,
    new_lines_to_cover: lineMode ? newToCover : null,
    new_uncovered_lines: lineMode ? newToCover - newCovered : null,
    new_duplicated_lines_density: newDupDensity,
    new_maintainability_rating: ratingsNew.maintainabilityValue,
    new_reliability_rating: ratingsNew.reliabilityValue,
    new_security_rating: ratingsNew.securityValue,
  };

  const gate = evaluateGate(options.gate || DEFAULT_GATE, measures);
  const perFile = new Map();
  for (const i of issues) {
    let c = perFile.get(i.file);
    if (!c) { c = { issues: 0, hotspots: 0 }; perFile.set(i.file, c); }
    if (i.type === 'SECURITY_HOTSPOT') c.hotspots++;
    else if (!isClosed(i)) c.issues++;
  }
  for (const row of fileRows) {
    const c = perFile.get(row.path);
    row.issues = c ? c.issues : 0;
    row.hotspots = c ? c.hotspots : 0;
  }

  return {
    version: 1,
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    root: root || null,
    hasBaseline: !!hasBaseline,
    languages: langCount,
    measures,
    ratings: {
      reliability: ratingsAll.reliability,
      security: ratingsAll.security,
      maintainability: ratingsAll.maintainability,
      securityReview: ratingsAll.securityReview,
      debtRatio: ratingsAll.debtRatio,
      hotspotsReviewed: ratingsAll.hotspotsReviewed,
      hotspotsToReview: ratingsAll.hotspotsToReview,
    },
    ratingsNew: {
      reliability: ratingsNew.reliability,
      security: ratingsNew.security,
      maintainability: ratingsNew.maintainability,
      securityReview: ratingsNew.securityReview,
    },
    qualityGate: gate,
    issues,
    duplications: dup.blocks,
    files: fileRows,
    coverage: coverage ? {
      format: coverage.format,
      linesToCover: coverage.linesToCover,
      coveredLines: coverage.coveredLines,
      lineCoverage: coverage.lineCoverage,
    } : null,
    warnings,
    keys: issues.map((i) => i.key),
    lineHashes,
    newCodeMode: lineMode || (hasBaseline ? 'keys' : 'all'),
    defectAnalysis,
  };
}

// 6 hex chars of a whitespace-normalized line (baseline comparison only).
const HASH_LEN = 6;
function lineHash(line) {
  return crypto.createHash('md5').update(String(line).replace(/\s+/g, ' ').trim()).digest('hex').slice(0, HASH_LEN);
}

// Contract analyzers (core/ENGINE_CONTRACT.md) run once over all files so
// they can follow calls and includes across files.
// Engines that read the whole tree at once (manifests, the module graph).
const WHOLE_TREE_ENGINES = new Set(['sca', 'arch']);
// Source text per engine batch; a project up to this size is one batch.
const ENGINE_BATCH_BYTES = 16 * 1024 * 1024;

// Consecutive files (walk order keeps a folder together) up to maxBytes of text.
function fileBatches(files, maxBytes) {
  const out = [];
  let cur = [];
  let size = 0;
  for (const f of files) {
    const n = String(f.text || '').length;
    if (cur.length && size + n > maxBytes) { out.push(cur); cur = []; size = 0; }
    cur.push(f);
    size += n;
  }
  if (cur.length || !out.length) out.push(cur);
  return out.length === 1 ? [files] : out;
}

// Lines of a file, split on demand. Only the last few files are kept, so a
// large project does not hold every file twice (text and lines).
function lineCache(files, { keep = 256, missing } = {}) {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const cache = new Map();
  return (file) => {
    if (missing && !byPath.has(file)) return missing;
    let lines = cache.get(file);
    if (!lines) {
      if (cache.size >= keep) cache.delete(cache.keys().next().value);
      lines = String((byPath.get(file) || {}).text || '').split(/\r?\n/);
      cache.set(file, lines);
    }
    return lines;
  };
}

function runEngines(prepared, ctx, issues, overrides, warnings, report = () => {}) {
  const byPath = new Map(prepared.map((file) => [file.path, file]));
  const linesOf = lineCache(prepared);
  const suppressed = new Map();
  const off = new Set((ctx.options && ctx.options.disabledChecks) || []);
  const skip = new Set((ctx.options && ctx.options.skipEngines) || []);
  const list = engines().filter((engine) => !checks.engineOff(engine.id, off) && !skip.has(engine.id));
  // The C/C++ engines share one parse, which a large project gets in batches
  // (cfront.batches); each batch goes through all of them, then is dropped.
  // The other engines get a large project in batches of source text
  // (fileBatches), except the ones that need the whole tree.
  const plain = list.filter((engine) => !cfront.ENGINE_IDS.has(engine.id));
  const shared = list.filter((engine) => cfront.ENGINE_IDS.has(engine.id));
  const metas = new Map();
  const seenKeys = new Set(issues.map((i) => i.key));
  const parts = fileBatches(prepared, (ctx.options && ctx.options.engineBatchBytes) || ENGINE_BATCH_BYTES);
  plain.forEach((engine, index) => {
    const whole = WHOLE_TREE_ENGINES.has(engine.id) || parts.length === 1;
    (whole ? [prepared] : parts).forEach((files, k) => {
      report('engines', index, plain.length + shared.length, whole ? engine.id : `${engine.id} (${k + 1}/${parts.length})`);
      runEngine(engine, files);
    });
  });
  // options.cfamilyFindings: the shared engines already ran (in parallel, see
  // core/cfamily-pool.js); [{ byEngine: { id: findings }, warnings }] in batch order.
  const pre = ctx.options && ctx.options.cfamilyFindings;
  if (shared.length && Array.isArray(pre)) {
    pre.forEach((b, n) => {
      for (const w of b.warnings || []) warnings.push(w);
      shared.forEach((engine, k) => {
        report('engines', plain.length + shared.length * n + k, plain.length + shared.length * pre.length, `${engine.id} (${n + 1}/${pre.length})`);
        addFindings(engine, (b.byEngine || {})[engine.id] || []);
      });
    });
  } else if (shared.length) {
    for (const files of cfront.batches(cfamilyInput(prepared, ctx.options || {}), ctx.options && ctx.options.cfamilyBatch)) {
      const b = files.batch;
      shared.forEach((engine, k) => {
        if (!b) report('engines', plain.length + k, plain.length + shared.length, engine.id);
        else report('engines', plain.length + shared.length * (b.index - 1) + k, plain.length + shared.length * b.estimate, `${engine.id} (${b.index}/${b.estimate})`);
        runEngine(engine, files);
      });
      if (b && ctx.options && typeof ctx.options.releaseMemory === 'function') ctx.options.releaseMemory();
    }
  }

  function runEngine(engine, files) {
    let found = [];
    try {
      found = engine.analyze(files, ctx) || [];
    } catch (err) {
      warnings.push({ engine: engine.id, message: String((err && err.message) || err) });
      return;
    }
    addFindings(engine, found);
  }

  function addFindings(engine, found) {
    if (!metas.has(engine.id)) metas.set(engine.id, new Map(engine.catalog().map((m) => [m.key, m])));
    const meta = metas.get(engine.id);
    for (const f of found) {
      if (!f || !f.rule || !f.line || ctx.inactive.has(f.rule)) continue;
      const m = meta.get(f.rule) || {};
      // A rule only reports on its own languages (headers .h may be C or C++).
      const fileLang = (byPath.get(f.file) || {}).lang;
      if (fileLang && m.langs && !m.langs.includes('*') && !m.langs.includes(fileLang) && !/\.h$/i.test(f.file)) continue;
      const lines = linesOf(f.file);
      if (!suppressed.has(f.file)) suppressed.set(f.file, suppressionLines(lines.join('\n')));
      if (suppressed.get(f.file).has(f.line)) continue;
      const rule = { key: f.rule, type: f.type || m.type || 'CODE_SMELL', debtMin: m.debtMin || 10, tags: m.tags || [] };
      const severity = overrides[f.rule] || f.severity || m.severity || 'MAJOR';
      const lang = (byPath.get(f.file) || {}).lang || (m.langs && m.langs[0]) || '';
      const item = makeIssue({
        rule, severity, lang, file: f.file, line: f.line,
        message: f.message || m.name, rawLine: lines[f.line - 1] || '', lines,
        salt: `${f.line}|${f.column || ''}|${(f.message && (f.message.en || f.message.ko)) || ''}`,
      });
      item.engine = engine.id;
      if (f.column) item.column = f.column;
      if (f.endLine) item.endLine = f.endLine;
      if (f.endColumn) item.endColumn = f.endColumn;
      if (f.fix) item.fix = f.fix;
      if (f.fixes) item.fixes = f.fixes;
      if (f.events) item.events = f.events;
      if (f.function) item.function = f.function;
      for (const field of ['checker', 'standards', 'misraCategory', 'cwe', 'cert']) {
        if (m[field]) item[field] = m[field];
      }
      // The same finding twice (e.g. a header seen from two translation units) is reported once.
      if (seenKeys.has(item.key)) continue;
      seenKeys.add(item.key);
      issues.add(item);
    }
  }
}

// Removes the items keep() rejects, in place and in one pass (splicing one
// at a time is quadratic on millions of issues).
function keepIf(list, keep) {
  let w = 0;
  for (let r = 0; r < list.length; r++) if (keep(list[r])) list[w++] = list[r];
  list.length = w;
}

// The issue list of one analysis. Every issue is kept while the list fits its
// budget (about a quarter of the heap, at most 8 million: V8 also caps the
// entries of one Map or Set). Beyond it, further occurrences of a rule in a
// file that already has FOLD_AFTER of them are counted on the first one
// (item.folded) instead of being kept, and when even new rule/file pairs no
// longer fit they are only counted. finish() writes the counts into the
// messages and a warning, so a huge result never stops the analysis.
const ISSUE_BYTES = 2048;
const FOLD_AFTER = 20;

function issueBudget(options) {
  if (options.issueBudget > 0) return options.issueBudget;
  const heap = require('v8').getHeapStatistics().heap_size_limit;
  return Math.max(200000, Math.min(8000000, Math.floor((heap * 0.25) / ISSUE_BYTES)));
}

function issueList(budget) {
  const issues = [];
  const pairs = new Map();
  let folded = 0;
  let dropped = 0;
  Object.defineProperties(issues, {
    add: {
      configurable: true,
      value(item) {
        if (issues.length < budget) {
          if (item.file && item.rule) {
            const id = `${item.rule}|${item.file}`;
            const p = pairs.get(id);
            if (p) p.count++; else pairs.set(id, { first: item, count: 1 });
          }
          issues.push(item);
          return;
        }
        const id = `${item.rule}|${item.file}`;
        const p = pairs.get(id);
        if (p && p.count >= FOLD_AFTER) {
          p.first.folded = (p.first.folded || 0) + 1;
          folded++;
        } else if (issues.length < budget * 1.25) {
          if (p) p.count++; else pairs.set(id, { first: item, count: 1 });
          issues.push(item);
        } else dropped++;
      },
    },
    finish: {
      configurable: true,
      value(warnings) {
        // From here on the list is a plain array (it is posted and stored).
        delete issues.add;
        delete issues.finish;
        pairs.clear();
        if (!folded && !dropped) return;
        for (const i of issues) {
          if (!i.folded) continue;
          const more = { en: ` (+${i.folded} more in this file)`, ko: ` (이 파일에 ${i.folded}건 더 있음)` };
          i.message = typeof i.message === 'object' && i.message
            ? { ...i.message, en: `${i.message.en || ''}${more.en}`, ko: `${i.message.ko || i.message.en || ''}${more.ko}` }
            : `${i.message || ''}${more.en}`;
        }
        const n = (v) => v.toLocaleString('en');
        warnings.push({
          engine: 'limits',
          message: {
            en: `More issues than fit in memory (${n(budget)} kept): ${n(folded)} repeated issues were counted on the first issue of their rule in each file${dropped ? ` and ${n(dropped)} more were only counted` : ''}. Raise Settings › Analysis › Analysis memory limit to keep them all.`,
            ko: `이슈가 메모리에 담을 수 있는 수(${n(budget)}개)보다 많습니다. 반복된 이슈 ${n(folded)}건은 파일마다 같은 규칙의 첫 이슈에 건수로 더했습니다${dropped ? `. ${n(dropped)}건은 건수만 셌습니다` : ''}. 모두 남기려면 설정 › 분석 › 분석 메모리 한도를 올리십시오.`,
          },
          folded,
          dropped,
        });
      },
    },
  });
  return issues;
}

// Keys come from the rule, file and line text, so identical lines in one file
// (the same commented-out code twice) share a key. The first by line keeps it
// (its triage stays); the next ones get key#2, key#3 ... hashed, so triage,
// new-code marks and the database rows tell them apart.
function uniqueKeys(issues) {
  const byKey = new Map();
  for (const item of issues) {
    const list = byKey.get(item.key);
    if (list) list.push(item); else byKey.set(item.key, [item]);
  }
  for (const [key, list] of byKey) {
    if (list.length < 2) continue;
    list.sort((a, b) => (a.line || 0) - (b.line || 0));
    list.forEach((item, n) => {
      if (n) item.key = crypto.createHash('sha1').update(`${key}#${n + 1}`).digest('hex').slice(0, 16);
    });
  }
}

function makeIssue({ rule, severity, lang, file, line, message, rawLine, lines, salt }) {
  // Engine findings add the line and message: several can share a manifest line,
  // and files outside the language filter have no source lines to tell them apart.
  const extra = salt ? `|${salt}` : '';
  const key = crypto.createHash('sha1').update(`${compat.hashRuleKey(rule.key)}|${file}|${String(rawLine).replace(/\s+/g, ' ').trim().slice(0, 240)}${extra}`).digest('hex').slice(0, 16);
  const hotspot = rule.type === 'SECURITY_HOTSPOT';
  return {
    key,
    rule: rule.key,
    type: rule.type,
    severity,
    language: lang,
    file,
    line,
    message,
    debtMin: rule.debtMin || 0,
    tags: rule.tags || [],
    status: hotspot ? 'TO_REVIEW' : 'OPEN',
    resolution: null,
    assignee: '',
    comments: [],
    changelog: [],
    isNew: true,
    snippet: snippet(lines, line),
  };
}

function snippet(lines, line) {
  const start = Math.max(1, line - 2);
  const end = Math.min(lines.length, line + 2);
  const out = [];
  for (let n = start; n <= end; n++) out.push({ line: n, text: String(lines[n - 1] || '').slice(0, 400), hit: n === line });
  return out;
}

function suppressionLines(text) {
  const set = new Set();
  const lines = String(text).split(/\r?\n/);
  lines.forEach((line, i) => {
    if (compat.SUPPRESSION_RE.test(line)) set.add(i + 1);
  });
  return set;
}

// Defect Analysis code annotations: `// mcc[CHECKER]` or `/* mcc[event_tag : FALSE] */`
// suppress only the named checkers (or event tags), on that line and on the
// next line that has code. Returns Map<line, Set<lower-case name>>.
function defectAnnotations(text) {
  const out = new Map();
  const lines = String(text).split(/\r?\n/);
  const add = (line, names) => {
    const set = out.get(line) || new Set();
    for (const n of names) set.add(n);
    out.set(line, set);
  };
  for (let i = 0; i < lines.length; i++) {
    const re = compat.annotationRe();
    let m;
    const names = [];
    while ((m = re.exec(lines[i]))) {
      for (const part of m[1].split(',')) {
        const name = part.split(':')[0].trim().toLowerCase();
        if (name) names.push(name);
      }
    }
    if (!names.length) continue;
    add(i + 1, names);
    const commentOnly = /^\s*(\/\/|\/\*|\*(\s|\/|$)|#)/.test(lines[i]);
    if (commentOnly) {
      let j = i + 1;
      while (j < lines.length && (!lines[j].trim() || /^\s*(\/\/|\/\*|\*(\s|\/|$)|#)/.test(lines[j]))) j++;
      if (j < lines.length) add(j + 1, names);
    }
  }
  return out;
}

function annotationSuppresses(issue, names) {
  if (!names) return false;
  if (names.has('all') || names.has('*')) return true;
  const checker = String(issue.checker || '').toLowerCase();
  if (checker && names.has(checker)) return true;
  if (names.has(String(issue.rule || '').toLowerCase())) return true;
  return (issue.events || []).some((e) => e && e.tag && names.has(String(e.tag).toLowerCase()));
}

function ruleApplies(rule, langs) {
  if (rule.langs.includes('*')) return true;
  for (const lang of rule.langs) if (langs.has(lang)) return true;
  return false;
}

function compileCustom(rule) {
  if (!rule || !rule.pattern) return null;
  let re;
  try { re = new RegExp(rule.pattern, rule.flags || ''); } catch { return null; }
  return {
    key: rule.key || `custom:${rule.pattern.slice(0, 24)}`,
    langs: rule.langs && rule.langs.length ? rule.langs : ['*'],
    type: rule.type || 'CODE_SMELL',
    severity: rule.severity || 'MAJOR',
    debtMin: Number(rule.debtMin) || 10,
    tags: ['custom'],
    scope: 'any',
    re,
    name: rule.name || { en: rule.pattern, ko: rule.pattern },
    why: rule.why || { en: 'Custom rule.', ko: '사용자 규칙입니다.' },
    fix: rule.fix || { en: 'Change the line so it no longer matches.', ko: '더 이상 맞지 않도록 고치세요.' },
  };
}

function toRel(root, file) {
  if (!root) return String(file).replace(/\\/g, '/');
  const rel = path.relative(root, file);
  if (rel.startsWith('..')) return String(file).replace(/\\/g, '/');
  return rel.replace(/\\/g, '/');
}

// Folders excluded by the user (root-relative, e.g. "apis" or "src/gen"): the
// folder and everything below it, only at that place in the tree.
function normDirs(dirs) {
  return (dirs || []).map((d) => String(d || '').replace(/\\/g, '/').replace(/^\.?\/+|\/+$/g, '').toLowerCase()).filter(Boolean);
}

function inDirs(rel, dirs) {
  if (!dirs.length) return false;
  const n = String(rel || '').replace(/\\/g, '/').toLowerCase();
  return dirs.some((d) => n === d || n.startsWith(`${d}/`));
}

function excluded(rel, patterns) {
  const n = String(rel || '').replace(/\\/g, '/');
  return (patterns || []).some((p) => matchGlob(n, p));
}

function matchGlob(rel, pattern) {
  let p = String(pattern || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!p) return false;
  const body = p.split('**').map((part) => part.split('*').map(escapeReg).join('[^/]*')).join('.*');
  const re = new RegExp(`(?:^|/)${body}$`, 'i');
  return re.test(rel);
}

function escapeReg(s) {
  return s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

let rulesCache = null;
function listRules() {
  if (!rulesCache) rulesCache = withKoreanStandards([...RULES.map(ruleMeta), ...extraLineRules().map(ruleMeta), ...structuralMeta(), ...checkerCatalog(), ...engineCatalog()]);
  return rulesCache.map((r) => ({ ...r }));
}

// Add the 행정안전부 2021 item numbers a rule falls under (through its CWEs)
// so the issue filter and rule chips can show them.
function withKoreanStandards(rules) {
  const { MOIS_2021 } = require('./platform/kr-standards');
  const { cwesOf } = require('./platform/util');
  const byCwe = new Map();
  for (const [id, cat] of Object.entries(MOIS_2021)) for (const c of cat.cwes) byCwe.set(c, [...(byCwe.get(c) || []), id]);
  return rules.map((r) => {
    if (r.standards && r.standards.mois2021) return r;
    const ids = [...new Set(cwesOf(null, r).flatMap((c) => byCwe.get(c) || []))];
    return ids.length ? { ...r, standards: { ...(r.standards || {}), mois2021: ids } } : r;
  });
}

module.exports = {
  defectAnnotations,
  analyzePath, analyzeSources, walk, listRules, matchGlob, excluded, SKIP_DIRS,
  collectSources, prepareFiles, sharedEngines, cfamilyInput,
};
