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

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'target', 'vendor', '__pycache__',
  '.venv', 'venv', 'bin', 'obj', '.idea', '.vs', '.next', 'out', 'coverage',
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
  try { coverage = readCoverage(abs); } catch { coverage = null; }
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
  const rules = RULES.filter((r) => !inactive.has(r.key));
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

  for (const file of prepared) {
    const kind = commentKind(file.lang);
    const structural = structuralIssues(file.text, kind, options.limits);
    const suppressed = suppressionLines(file.text);
    langCount[file.lang] = (langCount[file.lang] || 0) + 1;
    let fileComplexity = 1;
    for (const line of structural.code) fileComplexity += decisionCount(line);
    complexity += fileComplexity;

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

  const dup = findDuplications(dupInput);
  const ncloc = fileRows.reduce((n, f) => n + f.ncloc, 0);
  const commentLines = fileRows.reduce((n, f) => n + f.commentLines, 0);

  const lineMap = new Map(prepared.map((file) => [file.path, String(file.text).split(/\r?\n/)]));
  for (let n = 0; n < issues.length; n++) {
    issues[n] = decorateIssue(issues[n], lineMap.get(issues[n].file) || [], options.components);
  }
  const hasBaseline = previous.size > 0 || options.hasBaseline;
  for (const item of issues) {
    item.isNew = !hasBaseline || !previous.has(item.key);
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
  const newNcloc = hasBaseline
    ? fileRows.filter((f) => newFiles.has(f.path)).reduce((n, f) => n + f.ncloc, 0) || (newIssues.length ? 1 : 0)
    : ncloc;

  const ratingsAll = rate(openIssues, hotspots, smellDebt, ncloc);
  const ratingsNew = rate(newIssues.filter((i) => i.type !== 'SECURITY_HOTSPOT'), newIssues.filter((i) => i.type === 'SECURITY_HOTSPOT'), newDebt, newNcloc || 0);

  const coverage = options.coverage;
  const lineCoverage = coverage && coverage.linesToCover ? coverage.lineCoverage : null;
  const dupDensity = ncloc ? Math.round((dup.duplicatedLines / Math.max(ncloc, 1)) * 1000) / 10 : 0;
  const newDupDensity = hasBaseline ? (dup.duplicatedLines > (options.previousDuplicatedLines || 0) ? dupDensity : 0) : dupDensity;

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
    new_coverage: lineCoverage,
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
    coverity,
  };
}

function makeIssue({ rule, severity, lang, file, line, message, rawLine, lines }) {
  const key = crypto.createHash('sha1').update(`${rule.key}|${file}|${String(rawLine).replace(/\s+/g, ' ').trim().slice(0, 240)}`).digest('hex').slice(0, 16);
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
    if (/NOSONAR|\bnoqa\b|\bnolint\b|checker\s*:\s*ignore|mcc-ignore/i.test(line)) set.add(i + 1);
  });
  return set;
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

function listRules() {
  return [...RULES.map(ruleMeta), ...structuralMeta(), ...checkerCatalog()];
}

module.exports = {
  analyzePath, analyzeSources, walk, listRules, matchGlob, excluded, SKIP_DIRS,
};
