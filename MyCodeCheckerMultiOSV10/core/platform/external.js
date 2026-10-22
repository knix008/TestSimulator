'use strict';

// External issue import (SonarQube "external issues") and generic test
// execution reports. Each parser turns a tool report into contract Findings
// plus { engine, externalRule }, with type/severity, so the lead can merge
// them into an analysis. Rule keys are `external_<engine>:<rule>`.
//
// Formats: SARIF 2.1.0, Sonar generic issues JSON, Coverity JSON v7/v8,
// cppcheck XML v2, clang-tidy / clang / gcc text, ESLint JSON, Pylint JSON,
// Checkstyle XML, SpotBugs XML, PMD XML, gosec JSON, Bandit JSON, Semgrep JSON.
// Tests: JUnit XML, Sonar generic test execution XML.

const { normPath, cweNumber } = require('./util');
const { legacyFromImpact } = require('./measures');

// ---------------------------------------------------------------------------
// Tiny XML helpers (enough for flat tool reports; no DTD, no namespaces).

function decodeXml(s) {
  return String(s == null ? '' : s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function attrs(s) {
  const out = {};
  const re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(s))) out[m[1]] = decodeXml(m[3] != null ? m[3] : m[4]);
  return out;
}

/** All <tag ...>body</tag> and <tag .../> elements. Same-name nesting is not supported (not needed here). */
function elements(xml, tag) {
  const out = [];
  const re = new RegExp(`<${tag}(\\s[^>]*?)?(/>|>([\\s\\S]*?)</${tag}\\s*>)`, 'g');
  let m;
  while ((m = re.exec(xml))) out.push({ attrs: attrs(m[1] || ''), body: m[3] || '', selfClosing: m[2] === '/>' });
  return out;
}

function stripComments(xml) {
  return String(xml || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '');
}

// ---------------------------------------------------------------------------

function relPath(p, root) {
  let raw = String(p || '');
  if (/^file:\/\/\/[A-Za-z]:/i.test(raw)) raw = raw.slice(8);
  else if (/^file:\/\//i.test(raw)) raw = raw.slice(7);
  let s = normPath(raw);
  try { if (/%[0-9a-f]{2}/i.test(s)) s = decodeURIComponent(s); } catch { /* keep */ }
  if (root) {
    const r = normPath(root).replace(/\/+$/, '');
    if (r && s.toLowerCase().startsWith(`${r.toLowerCase()}/`)) s = s.slice(r.length + 1);
  }
  return s;
}

function msg(s) {
  const t = String(s == null ? '' : s).trim();
  return { en: t, ko: t };
}

function num(v, d = null) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
}

function finding(engine, ruleId, f) {
  const rule = String(ruleId || 'unknown');
  return {
    rule: `external_${engine}:${rule}`,
    engine,
    externalRule: rule,
    file: f.file,
    line: num(f.line, 1),
    ...(num(f.column) ? { column: num(f.column) } : {}),
    ...(num(f.endLine) ? { endLine: num(f.endLine) } : {}),
    ...(num(f.endColumn) ? { endColumn: num(f.endColumn) } : {}),
    message: msg(f.message || rule),
    type: f.type || 'CODE_SMELL',
    severity: f.severity || 'MAJOR',
    ...(f.cwe ? { cwe: `CWE-${cweNumber(f.cwe)}` } : {}),
    ...(f.events && f.events.length ? { events: f.events } : {}),
    ...(f.function ? { function: f.function } : {}),
    ...(f.debtMin ? { debtMin: f.debtMin } : {}),
    ...(f.tags && f.tags.length ? { tags: f.tags } : {}),
  };
}

function result(engine, findings, warnings = []) {
  const rules = new Map();
  for (const f of findings) {
    if (!rules.has(f.rule)) rules.set(f.rule, { key: f.rule, engine, externalRule: f.externalRule, langs: ['*'], type: f.type, severity: f.severity, debtMin: f.debtMin || 5, tags: ['external', engine], name: msg(f.externalRule), why: msg(''), fix: msg(''), external: true });
  }
  return { engine, findings, rules: [...rules.values()], warnings };
}

const SEC_WORDS = /secur|inject|xss|csrf|crypt|cwe|taint|overflow|vuln|password|secret|auth/i;

// ---------------------------------------------------------------------------
// SARIF 2.1.0

function sarifLevelSeverity(level, secScore) {
  if (secScore != null) {
    if (secScore >= 9) return 'BLOCKER';
    if (secScore >= 7) return 'CRITICAL';
    if (secScore >= 4) return 'MAJOR';
    return 'MINOR';
  }
  return { error: 'CRITICAL', warning: 'MAJOR', note: 'MINOR', none: 'INFO' }[level] || 'MAJOR';
}

/**
 * SARIF 2.1.0 from any tool. Engine = run.tool.driver.name (lower-case, no spaces).
 * Security comes from properties["security-severity"], tags like "security" or "external/cwe/cwe-79".
 * @returns {{engine:string, findings:object[], rules:object[], warnings:string[]}}
 */
function parseSarif(input, opts = {}) {
  const doc = typeof input === 'string' ? JSON.parse(input) : input;
  const all = [];
  const warnings = [];
  let engineName = 'sarif';
  for (const run of (doc && doc.runs) || []) {
    const driver = (run.tool && run.tool.driver) || {};
    const engine = (opts.engine || driver.name || 'sarif').toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
    engineName = engine;
    const rules = driver.rules || [];
    const byId = new Map(rules.map((r) => [r.id, r]));
    const bases = run.originalUriBaseIds || {};
    for (const res of run.results || []) {
      const rule = (res.ruleIndex != null && rules[res.ruleIndex]) || byId.get(res.ruleId) || (res.rule && byId.get(res.rule.id)) || {};
      const ruleId = res.ruleId || (res.rule && res.rule.id) || rule.id || 'unknown';
      const props = { ...(rule.properties || {}), ...(res.properties || {}) };
      const tags = [...(rule.properties && rule.properties.tags || []), ...(res.properties && res.properties.tags || [])].map(String);
      const sec = props['security-severity'] != null ? Number(props['security-severity']) : null;
      const cweTag = tags.find((t) => /cwe/i.test(t));
      const isSec = sec != null || tags.some((t) => /security/i.test(t)) || !!cweTag;
      const level = res.level || (rule.defaultConfiguration && rule.defaultConfiguration.level) || 'warning';
      let text = res.message && (res.message.text || res.message.markdown);
      if (!text && res.message && res.message.id && rule.messageStrings && rule.messageStrings[res.message.id]) {
        text = String(rule.messageStrings[res.message.id].text || '').replace(/\{(\d+)\}/g, (_, n) => (res.message.arguments || [])[n] || '');
      }
      const loc = (res.locations && res.locations[0] && res.locations[0].physicalLocation) || {};
      const art = loc.artifactLocation || {};
      let uri = art.uri || (art.index != null && run.artifacts && run.artifacts[art.index] && run.artifacts[art.index].location && run.artifacts[art.index].location.uri) || '';
      if (art.uriBaseId && bases[art.uriBaseId] && bases[art.uriBaseId].uri && !/^[a-z]+:/i.test(uri)) uri = bases[art.uriBaseId].uri.replace(/\/?$/, '/') + uri;
      if (!uri) { warnings.push(`Result without a location: ${ruleId}`); continue; }
      const region = loc.region || {};
      const events = [];
      for (const flow of res.codeFlows || []) for (const tf of flow.threadFlows || []) for (const step of tf.locations || []) {
        const pl = step.location && step.location.physicalLocation;
        if (!pl || !pl.region) continue;
        events.push({ line: pl.region.startLine || 1, tag: 'path', text: msg(step.location.message && step.location.message.text || ''), main: false, file: relPath(pl.artifactLocation && pl.artifactLocation.uri, opts.root) });
      }
      all.push(finding(engine, ruleId, {
        file: relPath(uri, opts.root), line: region.startLine, column: region.startColumn, endLine: region.endLine, endColumn: region.endColumn,
        message: text || (rule.shortDescription && rule.shortDescription.text) || ruleId,
        type: isSec ? 'VULNERABILITY' : (level === 'error' ? 'BUG' : 'CODE_SMELL'),
        severity: sarifLevelSeverity(level, sec), cwe: cweTag, events, tags: tags.filter((t) => !/[/ ]/.test(t)).map((t) => t.toLowerCase()).slice(0, 10),
      }));
    }
  }
  return result(engineName, all, warnings);
}

// ---------------------------------------------------------------------------
// SonarQube generic issue format

/** SonarQube generic issue JSON (both the 10.3+ `rules` + `impacts` form and the older `engineId/type/severity` form). */
function parseSonarGeneric(input, opts = {}) {
  const doc = typeof input === 'string' ? JSON.parse(input) : input;
  const rules = new Map(((doc && doc.rules) || []).map((r) => [r.id, r]));
  const findings = [];
  let engine = opts.engine || 'generic';
  for (const is of (doc && doc.issues) || []) {
    const rule = rules.get(is.ruleId) || {};
    const eng = String(is.engineId || rule.engineId || engine).toLowerCase();
    engine = eng;
    let { type, severity } = is;
    if (!type || !severity) {
      if (rule.impacts && rule.impacts.length) ({ type, severity } = legacyFromImpact(rule.impacts[0]));
      type = type || rule.type || 'CODE_SMELL';
      severity = severity || rule.severity || 'MAJOR';
    }
    const p = is.primaryLocation || {};
    const r = p.textRange || {};
    findings.push(finding(eng, is.ruleId, {
      file: relPath(p.filePath, opts.root), line: r.startLine, column: r.startColumn != null ? r.startColumn + 1 : null,
      endLine: r.endLine, endColumn: r.endColumn != null ? r.endColumn + 1 : null, message: p.message || rule.name,
      type, severity, debtMin: num(is.effortMinutes) || 0,
      events: (is.secondaryLocations || []).map((s) => ({ line: (s.textRange && s.textRange.startLine) || 1, tag: 'path', text: msg(s.message || ''), main: false, file: relPath(s.filePath, opts.root) })),
    }));
  }
  const out = result(engine, findings);
  for (const r of out.rules) {
    const src = rules.get(r.externalRule);
    if (src) { r.name = msg(src.name || r.externalRule); r.why = msg(src.description || ''); }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Coverity JSON v7 / v8 (cov-format-errors --json-output-v7/v8)

function parseCoverityJson(input, opts = {}) {
  const doc = typeof input === 'string' ? JSON.parse(input) : input;
  const findings = [];
  for (const is of (doc && doc.issues) || []) {
    const props = is.checkerProperties || {};
    const impact = String(props.impact || '').toLowerCase();
    const kind = String(props.issueKind || '').toUpperCase();
    const main = (is.events || []).find((e) => e.main) || {};
    const events = (is.events || []).map((e) => ({
      line: e.lineNumber || 1, tag: e.eventTag || 'path', text: msg(e.eventDescription || ''), main: !!e.main,
      file: relPath(e.filePathname || e.strippedFilePathname, opts.root),
    }));
    const file = is.strippedMainEventFilePathname || is.mainEventFilePathname || main.filePathname || '';
    const f = finding('coverity', is.checkerName || 'COVERITY', {
      file: relPath(file, opts.root), line: is.mainEventLineNumber || main.lineNumber,
      message: main.eventDescription || props.subcategoryLongDescription || props.subcategoryShortDescription || is.checkerName,
      type: /SECURITY/.test(kind) || props.category === 'Security best practices violations' ? 'VULNERABILITY' : 'BUG',
      severity: impact === 'high' ? 'CRITICAL' : impact === 'medium' ? 'MAJOR' : impact === 'low' ? 'MINOR' : 'MAJOR',
      cwe: props.cweCategory ? `CWE-${props.cweCategory}` : null, events, function: is.functionDisplayName || is.functionName,
    });
    f.checker = is.checkerName;
    if (is.mergeKey) f.mergeKey = is.mergeKey;
    if (props.impact) f.impact = props.impact;
    if (props.category) f.category = props.category;
    findings.push(f);
  }
  return result('coverity', findings);
}

// ---------------------------------------------------------------------------
// cppcheck XML v2

function parseCppcheckXml(xmlIn, opts = {}) {
  const xml = stripComments(xmlIn);
  const findings = [];
  const sev = { error: ['BUG', 'CRITICAL'], warning: ['BUG', 'MAJOR'], style: ['CODE_SMELL', 'MINOR'], performance: ['CODE_SMELL', 'MAJOR'], portability: ['CODE_SMELL', 'MAJOR'], information: ['CODE_SMELL', 'INFO'] };
  for (const e of elements(xml, 'error')) {
    const a = e.attrs;
    if (a.id === 'missingInclude' || a.id === 'missingIncludeSystem' || a.id === 'checkersReport') continue;
    const locs = elements(e.body, 'location').map((l) => l.attrs);
    if (!locs.length) continue;
    const [type, severity] = sev[a.severity] || ['CODE_SMELL', 'MAJOR'];
    findings.push(finding('cppcheck', a.id, {
      file: relPath(locs[0].file, opts.root), line: locs[0].line, column: locs[0].column, message: a.verbose || a.msg, type, severity, cwe: a.cwe,
      events: locs.length > 1 ? locs.map((l, n) => ({ line: num(l.line, 1), tag: 'path', text: msg(l.info || ''), main: n === 0, file: relPath(l.file, opts.root) })) : [],
    }));
  }
  return result('cppcheck', findings);
}

// ---------------------------------------------------------------------------
// clang-tidy / clang / gcc text

function parseClangTidy(textIn, opts = {}) {
  const findings = [];
  const re = /^(.+?):(\d+):(\d+):\s+(warning|error|note|remark):\s+(.*?)(?:\s+\[([\w.,-]+)\])?\s*$/;
  let last = null;
  for (const line of String(textIn || '').split(/\r?\n/)) {
    const m = line.match(re);
    if (!m) continue;
    const [, file, ln, col, level, message, check] = m;
    if (level === 'note' || level === 'remark') {
      if (last) (last.events = last.events || []).push({ line: Number(ln), tag: 'note', text: msg(message), main: false, file: relPath(file, opts.root) });
      continue;
    }
    const ruleId = (check || (level === 'error' ? 'clang-diagnostic-error' : 'clang-diagnostic-warning')).split(',')[0];
    const security = /^(cert-|clang-analyzer-security|bugprone-unsafe|clang-analyzer-unix\.cstring)/.test(ruleId) || SEC_WORDS.test(ruleId);
    const bug = /^(clang-analyzer-|bugprone-|clang-diagnostic-error)/.test(ruleId) || level === 'error';
    last = finding('clang-tidy', ruleId, {
      file: relPath(file, opts.root), line: ln, column: col, message,
      type: security ? 'VULNERABILITY' : bug ? 'BUG' : 'CODE_SMELL', severity: level === 'error' ? 'CRITICAL' : 'MAJOR',
    });
    findings.push(last);
  }
  return result('clang-tidy', findings);
}

// ---------------------------------------------------------------------------
// ESLint JSON

function parseEslintJson(input, opts = {}) {
  const doc = typeof input === 'string' ? JSON.parse(input) : input;
  const findings = [];
  for (const file of Array.isArray(doc) ? doc : []) {
    for (const m of file.messages || []) {
      const rule = m.ruleId || (m.fatal ? 'parsing-error' : 'eslint');
      findings.push(finding('eslint', rule, {
        file: relPath(file.filePath, opts.root), line: m.line, column: m.column, endLine: m.endLine, endColumn: m.endColumn, message: m.message,
        type: /security|no-eval|no-implied-eval|no-new-func|detect-/.test(rule) ? 'VULNERABILITY' : (m.fatal || /^no-(undef|unreachable|dupe|unsafe|cond-assign|self-compare|constant-condition)/.test(rule) ? 'BUG' : 'CODE_SMELL'),
        severity: m.severity === 2 ? 'MAJOR' : 'MINOR',
      }));
    }
  }
  return result('eslint', findings);
}

// ---------------------------------------------------------------------------
// Pylint JSON (--output-format=json and json2)

function parsePylintJson(input, opts = {}) {
  const doc = typeof input === 'string' ? JSON.parse(input) : input;
  const list = Array.isArray(doc) ? doc : (doc && doc.messages) || [];
  const map = { fatal: ['BUG', 'BLOCKER'], error: ['BUG', 'CRITICAL'], warning: ['BUG', 'MAJOR'], refactor: ['CODE_SMELL', 'MINOR'], convention: ['CODE_SMELL', 'MINOR'], info: ['CODE_SMELL', 'INFO'] };
  const findings = list.map((m) => {
    const [type, severity] = map[m.type] || ['CODE_SMELL', 'MAJOR'];
    return finding('pylint', m['message-id'] || m.messageId || m.symbol, {
      file: relPath(m.path, opts.root), line: m.line, column: m.column != null ? m.column + 1 : null, endLine: m.endLine,
      endColumn: m.endColumn != null ? m.endColumn + 1 : null, message: m.message, type, severity, function: m.obj || null,
    });
  });
  return result('pylint', findings);
}

// ---------------------------------------------------------------------------
// Checkstyle XML (also used by many linters: ktlint, swiftlint, golangci-lint...)

function parseCheckstyleXml(xmlIn, opts = {}) {
  const xml = stripComments(xmlIn);
  const findings = [];
  const engine = opts.engine || 'checkstyle';
  for (const f of elements(xml, 'file')) {
    for (const e of elements(f.body, 'error')) {
      const a = e.attrs;
      const source = a.source || 'checkstyle';
      const rule = source.split('.').pop().replace(/Check$/, '');
      findings.push(finding(engine, rule, {
        file: relPath(f.attrs.name, opts.root), line: a.line, column: a.column, message: a.message,
        type: a.severity === 'error' ? 'BUG' : 'CODE_SMELL', severity: { error: 'MAJOR', warning: 'MINOR', info: 'INFO', ignore: 'INFO' }[a.severity] || 'MINOR',
      }));
    }
  }
  return result(engine, findings);
}

// ---------------------------------------------------------------------------
// SpotBugs / FindBugs XML

function parseSpotbugsXml(xmlIn, opts = {}) {
  const xml = stripComments(xmlIn);
  const findings = [];
  const srcDirs = elements(xml, 'SrcDir').map((s) => normPath(decodeXml(s.body)));
  for (const b of elements(xml, 'BugInstance')) {
    const a = b.attrs;
    const sl = elements(b.body, 'SourceLine').map((s) => s.attrs);
    const primary = sl.find((s) => s.primary === 'true') || sl[sl.length - 1] || {};
    let file = primary.sourcepath || (primary.classname ? `${primary.classname.split('$')[0].replace(/\./g, '/')}.java` : '');
    if (!file) continue;
    const prefix = srcDirs.find((d) => d && opts.root && d.toLowerCase().startsWith(normPath(opts.root).toLowerCase()));
    if (prefix) file = `${relPath(prefix, opts.root)}/${file}`.replace(/^\//, '');
    const longMsg = elements(b.body, 'LongMessage')[0];
    const shortMsg = elements(b.body, 'ShortMessage')[0];
    const cat = String(a.category || '');
    const rank = Number(a.rank) || 20;
    findings.push(finding('spotbugs', a.type, {
      file, line: primary.start, endLine: primary.end, message: decodeXml(longMsg ? longMsg.body : shortMsg ? shortMsg.body : a.type),
      type: cat === 'SECURITY' || cat === 'MALICIOUS_CODE' ? 'VULNERABILITY' : cat === 'CORRECTNESS' || cat === 'MT_CORRECTNESS' ? 'BUG' : 'CODE_SMELL',
      severity: rank <= 4 ? 'BLOCKER' : rank <= 9 ? 'CRITICAL' : rank <= 14 ? 'MAJOR' : 'MINOR', cwe: a.cweid,
    }));
  }
  return result('spotbugs', findings);
}

// ---------------------------------------------------------------------------
// PMD XML

function parsePmdXml(xmlIn, opts = {}) {
  const xml = stripComments(xmlIn);
  const findings = [];
  for (const f of elements(xml, 'file')) {
    for (const v of elements(f.body, 'violation')) {
      const a = v.attrs;
      const pr = Number(a.priority) || 3;
      const ruleset = String(a.ruleset || '');
      findings.push(finding('pmd', a.rule, {
        file: relPath(f.attrs.name, opts.root), line: a.beginline, column: a.begincolumn, endLine: a.endline, endColumn: a.endcolumn,
        message: decodeXml(v.body).trim() || a.rule,
        type: /security/i.test(ruleset) ? 'VULNERABILITY' : /error ?prone|multithreading/i.test(ruleset) ? 'BUG' : 'CODE_SMELL',
        severity: ['', 'BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'][pr] || 'MAJOR',
      }));
    }
  }
  return result('pmd', findings);
}

// ---------------------------------------------------------------------------
// gosec JSON

function parseGosecJson(input, opts = {}) {
  const doc = typeof input === 'string' ? JSON.parse(input) : input;
  const findings = ((doc && doc.Issues) || []).map((is) => {
    const [ln, end] = String(is.line || '1').split('-');
    return finding('gosec', is.rule_id, {
      file: relPath(is.file, opts.root), line: ln, endLine: end, column: is.column, message: is.details, type: 'VULNERABILITY',
      severity: { HIGH: 'CRITICAL', MEDIUM: 'MAJOR', LOW: 'MINOR' }[String(is.severity).toUpperCase()] || 'MAJOR', cwe: is.cwe && is.cwe.id,
    });
  });
  return result('gosec', findings);
}

// ---------------------------------------------------------------------------
// Bandit JSON

function parseBanditJson(input, opts = {}) {
  const doc = typeof input === 'string' ? JSON.parse(input) : input;
  const findings = ((doc && doc.results) || []).map((r) => finding('bandit', r.test_id || r.test_name, {
    file: relPath(r.filename, opts.root), line: r.line_number, column: r.col_offset != null ? r.col_offset + 1 : null,
    endLine: r.line_range && r.line_range.length ? r.line_range[r.line_range.length - 1] : null, message: r.issue_text,
    type: String(r.issue_severity).toUpperCase() === 'LOW' && String(r.issue_confidence).toUpperCase() !== 'HIGH' ? 'SECURITY_HOTSPOT' : 'VULNERABILITY',
    severity: { HIGH: 'CRITICAL', MEDIUM: 'MAJOR', LOW: 'MINOR' }[String(r.issue_severity).toUpperCase()] || 'MAJOR', cwe: r.issue_cwe && r.issue_cwe.id,
  }));
  return result('bandit', findings);
}

// ---------------------------------------------------------------------------
// Semgrep JSON

function parseSemgrepJson(input, opts = {}) {
  const doc = typeof input === 'string' ? JSON.parse(input) : input;
  const findings = ((doc && doc.results) || []).map((r) => {
    const extra = r.extra || {};
    const meta = extra.metadata || {};
    const cwe = [].concat(meta.cwe || [])[0];
    const sec = !!cwe || /security/i.test(String(meta.category || '')) || [].concat(meta.owasp || []).length > 0;
    return finding('semgrep', r.check_id, {
      file: relPath(r.path, opts.root), line: r.start && r.start.line, column: r.start && r.start.col, endLine: r.end && r.end.line, endColumn: r.end && r.end.col,
      message: extra.message, type: sec ? 'VULNERABILITY' : (extra.severity === 'ERROR' ? 'BUG' : 'CODE_SMELL'),
      severity: { ERROR: 'CRITICAL', WARNING: 'MAJOR', INFO: 'MINOR' }[extra.severity] || 'MAJOR', cwe,
    });
  });
  return result('semgrep', findings);
}

// ---------------------------------------------------------------------------
// Detection and dispatch

const PARSERS = {
  sarif: parseSarif, sonar: parseSonarGeneric, coverity: parseCoverityJson, cppcheck: parseCppcheckXml, 'clang-tidy': parseClangTidy,
  eslint: parseEslintJson, pylint: parsePylintJson, checkstyle: parseCheckstyleXml, spotbugs: parseSpotbugsXml, pmd: parsePmdXml,
  gosec: parseGosecJson, bandit: parseBanditJson, semgrep: parseSemgrepJson,
};

/**
 * Guess the report format from its text (and optional file name).
 * @returns {string|null} a key of PARSERS, 'junit', 'sonar-tests', or null
 */
function detectFormat(textIn, fileName = '') {
  const s = String(textIn || '').replace(/^﻿/, '').trimStart();
  const name = String(fileName).toLowerCase();
  if (name.endsWith('.sarif') || name.endsWith('.sarif.json')) return 'sarif';
  if (s.startsWith('<')) {
    const head = s.slice(0, 4000);
    if (/<results\b[^>]*version="2"|<cppcheck\b/.test(head)) return 'cppcheck';
    if (/<checkstyle\b/.test(head)) return 'checkstyle';
    if (/<BugCollection\b/.test(head)) return 'spotbugs';
    if (/<pmd\b/.test(head)) return 'pmd';
    if (/<testExecutions\b/.test(head)) return 'sonar-tests';
    if (/<testsuites?\b/.test(head)) return 'junit';
    return null;
  }
  if (s.startsWith('{') || s.startsWith('[')) {
    let doc;
    try { doc = JSON.parse(s); } catch { return null; }
    if (doc && doc.runs && (doc.version === '2.1.0' || /sarif/i.test(doc.$schema || ''))) return 'sarif';
    if (doc && doc.runs) return 'sarif';
    if (doc && Array.isArray(doc.issues) && (doc.type === 'Coverity issues' || doc.formatVersion || (doc.issues[0] && doc.issues[0].checkerName))) return 'coverity';
    if (doc && Array.isArray(doc.issues) && (doc.issues.length === 0 || doc.issues[0].primaryLocation)) return 'sonar';
    if (doc && Array.isArray(doc.Issues)) return 'gosec';
    if (doc && Array.isArray(doc.results) && (doc.results[0] ? 'test_id' in doc.results[0] : 'metrics' in doc)) return 'bandit';
    if (doc && Array.isArray(doc.results) && (doc.results[0] ? 'check_id' in doc.results[0] : 'errors' in doc)) return 'semgrep';
    if (Array.isArray(doc) && (doc.length === 0 || 'filePath' in doc[0])) return 'eslint';
    if (Array.isArray(doc) && doc[0] && ('message-id' in doc[0] || 'symbol' in doc[0])) return 'pylint';
    if (doc && Array.isArray(doc.messages) && doc.statistics) return 'pylint';
    return null;
  }
  if (/^.+?:\d+:\d+:\s+(warning|error):/m.test(s)) return 'clang-tidy';
  return null;
}

/**
 * Import an external report.
 * @param {string|object} input report text (or parsed JSON)
 * @param {{format?:string, fileName?:string, root?:string, engine?:string}} [opts]
 * @returns {{format:string, engine:string, findings:object[], rules:object[], warnings:string[]}}
 */
function importExternal(input, opts = {}) {
  const textIn = typeof input === 'string' ? input.replace(/^﻿/, '') : JSON.stringify(input);
  const format = opts.format || detectFormat(textIn, opts.fileName);
  if (!format || !PARSERS[format]) throw new Error(`Unknown external report format${opts.fileName ? `: ${opts.fileName}` : ''}`);
  const out = PARSERS[format](typeof input === 'string' ? textIn : input, opts);
  return { format, ...out };
}

/** Turn imported findings into analysis issues (key, status, tags...). Pure; the lead merges them. */
function toIssues(findings, opts = {}) {
  const crypto = require('crypto');
  return findings.map((f) => ({
    key: crypto.createHash('sha1').update(`${f.rule}|${f.file}|${f.line}|${f.message.en}`).digest('hex').slice(0, 16),
    rule: f.rule, type: f.type, severity: f.severity, language: opts.language || null, file: f.file, line: f.line,
    ...(f.column ? { column: f.column } : {}), ...(f.endLine ? { endLine: f.endLine } : {}),
    message: f.message, debtMin: f.debtMin || 5, tags: [...new Set(['external', f.engine, ...(f.tags || []), ...(f.cwe ? [f.cwe.toLowerCase()] : [])])],
    status: f.type === 'SECURITY_HOTSPOT' ? 'TO_REVIEW' : 'OPEN', resolution: null, assignee: '', comments: [], changelog: [], isNew: true,
    external: true, engine: f.engine, externalRule: f.externalRule, ...(f.cwe ? { cwe: f.cwe } : {}), ...(f.events ? { events: f.events } : {}),
    ...(f.checker ? { checker: f.checker } : {}), ...(f.impact ? { impact: f.impact } : {}), ...(f.function ? { function: f.function } : {}),
  }));
}

// ---------------------------------------------------------------------------
// Test execution reports

function testTotals(tests) {
  const t = { tests: tests.length, failures: 0, errors: 0, skipped: 0, duration: 0 };
  for (const x of tests) {
    if (x.status === 'failure') t.failures += 1;
    else if (x.status === 'error') t.errors += 1;
    else if (x.status === 'skipped') t.skipped += 1;
    t.duration += x.duration || 0;
  }
  t.duration = Math.round(t.duration);
  return t;
}

/**
 * JUnit XML (Surefire, pytest, jest-junit, ctest ...). Duration in ms.
 * @returns {{format:'junit', tests:object[], suites:object[], totals:{tests,failures,errors,skipped,duration}}}
 */
function parseJUnit(xmlIn, opts = {}) {
  const xml = stripComments(xmlIn);
  const tests = [];
  const suites = [];
  const suiteEls = elements(xml, 'testsuite');
  const scopes = suiteEls.length ? suiteEls : [{ attrs: {}, body: xml }];
  for (const s of scopes) {
    const suiteTests = [];
    for (const c of elements(s.body, 'testcase')) {
      const a = c.attrs;
      let status = 'ok';
      let message = '';
      const fail = c.body.match(/<failure\b([^>]*)/);
      const err = c.body.match(/<error\b([^>]*)/);
      if (fail) { status = 'failure'; message = attrs(fail[1]).message || ''; }
      else if (err) { status = 'error'; message = attrs(err[1]).message || ''; }
      else if (/<skipped\b/.test(c.body)) status = 'skipped';
      const t = {
        name: a.name || '', classname: a.classname || s.attrs.name || '', file: a.file ? relPath(a.file, opts.root) : null,
        duration: Math.round((Number(a.time) || 0) * 1000), status, message,
      };
      suiteTests.push(t);
      tests.push(t);
    }
    suites.push({ name: s.attrs.name || '', ...testTotals(suiteTests) });
  }
  return { format: 'junit', tests, suites, totals: testTotals(tests) };
}

/** Sonar generic test execution XML (<testExecutions version="1">). Duration attribute is ms already. */
function parseSonarTests(xmlIn, opts = {}) {
  const xml = stripComments(xmlIn);
  const tests = [];
  const files = [];
  for (const f of elements(xml, 'file')) {
    const fileTests = [];
    for (const c of elements(f.body, 'testCase')) {
      let status = 'ok';
      let message = '';
      const fail = c.body.match(/<failure\b([^>]*)/);
      const err = c.body.match(/<error\b([^>]*)/);
      if (fail) { status = 'failure'; message = attrs(fail[1]).message || ''; }
      else if (err) { status = 'error'; message = attrs(err[1]).message || ''; }
      else if (/<skipped\b/.test(c.body)) status = 'skipped';
      const t = { name: c.attrs.name || '', file: relPath(f.attrs.path, opts.root), duration: Number(c.attrs.duration) || 0, status, message };
      fileTests.push(t);
      tests.push(t);
    }
    files.push({ path: relPath(f.attrs.path, opts.root), ...testTotals(fileTests) });
  }
  return { format: 'sonar-tests', tests, files, totals: testTotals(tests) };
}

/** Detect and parse a test report. */
function importTests(xmlIn, opts = {}) {
  const format = opts.format || detectFormat(xmlIn, opts.fileName);
  if (format === 'junit') return parseJUnit(xmlIn, opts);
  if (format === 'sonar-tests') return parseSonarTests(xmlIn, opts);
  throw new Error('Unknown test report format');
}

module.exports = {
  PARSERS, decodeXml, elements, detectFormat, importExternal, toIssues,
  parseSarif, parseSonarGeneric, parseCoverityJson, parseCppcheckXml, parseClangTidy, parseEslintJson, parsePylintJson,
  parseCheckstyleXml, parseSpotbugsXml, parsePmdXml, parseGosecJson, parseBanditJson, parseSemgrepJson,
  parseJUnit, parseSonarTests, importTests,
};
