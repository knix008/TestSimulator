'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { detectLanguage, ruleLangsFor, commentKind } = require('./languages');
const { RULES, ruleMeta } = require('./rules');
const { structuralIssues, structuralMeta, decisionCount, STRUCTURAL } = require('./metrics');
const { findDuplications } = require('./duplication');
const { readCoverage, coverageFor, parseLcov } = require('./coverage');
const { rate, countOpen, isClosed } = require('./ratings');
const { evaluateGate, SONAR_WAY } = require('./qualitygate');
const { checkerCatalog, decorateIssue, pathDefects, summarizeCoverity } = require('./coverity');
const { engines, engineCatalog, extraLineRules } = require('./engines');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'target', 'vendor', '__pycache__',
  '.venv', 'venv', 'bin', 'obj', '.idea', '.vs', '.next', 'out', 'coverage', '.mcc',
]);

const STRUCT_BY_KEY = new Map(STRUCTURAL.map((r) => [r.key, r]));

function analyzePath(root, options = {}) {
  const abs = path.resolve(root);
  const files = walk(abs, options);
  const sources = [];
  const maxBytes = options.maxBytes || 800000;
  for (const file of files) {
    let text;
    try {
      const st = fs.statSync(file);
      if (st.size > maxBytes) continue;
      text = fs.readFileSync(file, 'utf8');
    } catch { continue; }
    sources.push({ path: file, text });
  }
  let coverage = null;
  try { coverage = readCoverage(abs, options.coverageReports); } catch { coverage = null; }
  if (options.coverageText) {
    try { coverage = parseLcov(options.coverageText, abs); } catch { /* keep file coverage */ }
  }
  return analyzeSources(sources, { ...options, root: abs, coverage });
}

function walk(root, options) {
  const out = [];
  const maxFiles = options.maxFiles || 8000;
  const exclusions = options.exclusions || [];
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
  const exclusions = options.exclusions || [];
  const onlyLangs = options.languages && options.languages.length ? new Set(options.languages) : null;
  const custom = (options.customRules || []).map(compileCustom).filter(Boolean);
  const rules = [...RULES, ...extraLineRules()].filter((r) => !inactive.has(r.key));
  const started = Date.now();
  const warnings = [];

  const prepared = [];
  for (const file of files || []) {
    const rel = toRel(root, file.path);
    if (excluded(rel, exclusions)) continue;
    const lang = detectLanguage(file.path);
    if (!lang) continue;
    if (onlyLangs && !onlyLangs.has(lang)) continue;
    const text = String(file.text == null ? '' : file.text);
    if (text.includes('\0')) continue;
    prepared.push({ path: rel, text, lang });
  }

  const issues = [];
  const fileRows = [];
  const dupInput = [];
  let complexity = 0;
  const langCount = {};
  // Line-based new code: SCM changed lines (options.isNewLine), else lines whose
  // content is not in the baseline analysis (options.previousLineHashes).
  const lineHashes = {};
  const newLines = new Map();
  const prevHashes = options.previousLineHashes || null;
  const lineMode = typeof options.isNewLine === 'function' ? 'scm' : (prevHashes && options.hasBaseline !== false ? 'hash' : null);
  let newNclocLines = 0;
  let newToCover = 0;
  let newCovered = 0;

  for (const file of prepared) {
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
      issues.push(item);
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
      issues.push(item);
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

  runEngines(prepared, { inactive, root, options }, issues, overrides, warnings);

  const dup = findDuplications(dupInput);
  const ncloc = fileRows.reduce((n, f) => n + f.ncloc, 0);
  const commentLines = fileRows.reduce((n, f) => n + f.commentLines, 0);

  const lineMap = new Map(prepared.map((file) => [file.path, String(file.text).split(/\r?\n/)]));
  for (let n = 0; n < issues.length; n++) {
    issues[n] = decorateIssue(issues[n], lineMap.get(issues[n].file) || [], options.components);
  }
  // The line-based Coverity pass (cov:*) yields to a path-sensitive engine
  // finding of the same checker on the same line.
  const precise = new Set(issues.filter((i) => i.checker && !String(i.rule).startsWith('cov:')).map((i) => `${i.checker}|${i.file}|${i.line}`));
  for (let n = issues.length - 1; n >= 0; n--) {
    if (String(issues[n].rule).startsWith('cov:') && precise.has(`${issues[n].checker}|${issues[n].file}|${issues[n].line}`)) issues.splice(n, 1);
  }
  const annotations = new Map();
  for (const file of prepared) {
    if (/coverity\[/i.test(file.text)) annotations.set(file.path, coverityAnnotations(file.text));
  }
  if (annotations.size) {
    for (let n = issues.length - 1; n >= 0; n--) {
      const map = annotations.get(issues[n].file);
      if (map && annotationSuppresses(issues[n], map.get(issues[n].line))) issues.splice(n, 1);
    }
  }
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
  const coverity = summarizeCoverity(issues, {
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

  const gate = evaluateGate(options.gate || SONAR_WAY, measures);
  for (const row of fileRows) {
    row.issues = issues.filter((i) => i.file === row.path && i.type !== 'SECURITY_HOTSPOT' && !isClosed(i)).length;
    row.hotspots = issues.filter((i) => i.file === row.path && i.type === 'SECURITY_HOTSPOT').length;
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
    coverity,
  };
}

// 6 hex chars of a whitespace-normalized line (baseline comparison only).
const HASH_LEN = 6;
function lineHash(line) {
  return crypto.createHash('md5').update(String(line).replace(/\s+/g, ' ').trim()).digest('hex').slice(0, HASH_LEN);
}

// Contract analyzers (core/ENGINE_CONTRACT.md) run once over all files so
// they can follow calls and includes across files.
function runEngines(prepared, ctx, issues, overrides, warnings) {
  const byPath = new Map(prepared.map((file) => [file.path, file]));
  const split = new Map();
  const linesOf = (file) => {
    if (!split.has(file)) split.set(file, String((byPath.get(file) || {}).text || '').split(/\r?\n/));
    return split.get(file);
  };
  const suppressed = new Map();
  for (const engine of engines()) {
    const meta = new Map(engine.catalog().map((m) => [m.key, m]));
    let found = [];
    try {
      found = engine.analyze(prepared, ctx) || [];
    } catch (err) {
      warnings.push({ engine: engine.id, message: String((err && err.message) || err) });
      continue;
    }
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
        salt: `${f.line}|${(f.message && (f.message.en || f.message.ko)) || ''}`,
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
      issues.push(item);
    }
  }
}

function makeIssue({ rule, severity, lang, file, line, message, rawLine, lines, salt }) {
  // Engine findings add the line and message: several can share a manifest line,
  // and files outside the language filter have no source lines to tell them apart.
  const extra = salt ? `|${salt}` : '';
  const key = crypto.createHash('sha1').update(`${rule.key}|${file}|${String(rawLine).replace(/\s+/g, ' ').trim().slice(0, 240)}${extra}`).digest('hex').slice(0, 16);
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
    if (/NOSONAR|\bnoqa\b|\bnolint\b|checker\s*:\s*ignore|mcc-ignore|cov-ignore|parasoft-suppress|sparrow-ignore/i.test(line)) set.add(i + 1);
  });
  return set;
}

// Coverity code annotations: `// coverity[CHECKER]` or `/* coverity[event_tag : FALSE] */`
// suppress only the named checkers (or event tags), on that line and on the
// next line that has code. Returns Map<line, Set<lower-case name>>.
function coverityAnnotations(text) {
  const out = new Map();
  const lines = String(text).split(/\r?\n/);
  const add = (line, names) => {
    const set = out.get(line) || new Set();
    for (const n of names) set.add(n);
    out.set(line, set);
  };
  for (let i = 0; i < lines.length; i++) {
    const re = /coverity\[([^\]]+)\]/gi;
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
  coverityAnnotations,
  analyzePath, analyzeSources, walk, listRules, matchGlob, excluded, SKIP_DIRS,
};
