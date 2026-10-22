'use strict';

// Issue <-> LSP conversion: URIs, ranges, severities, related information.

const path = require('path');
const { fileURLToPath, pathToFileURL } = require('url');

const SLIM_FIELDS = [
  'key', 'rule', 'type', 'severity', 'language', 'file', 'line', 'column', 'endLine', 'endColumn',
  'message', 'events', 'cid', 'engine', 'function', 'checker', 'cwe', 'cert', 'standards', 'tags',
  'fix', 'fixes', 'debtMin',
];

function slimIssue(issue) {
  const out = {};
  for (const field of SLIM_FIELDS) if (issue[field] !== undefined && issue[field] !== null) out[field] = issue[field];
  return out;
}

const IS_WIN = process.platform === 'win32';

function uriToPath(uri) {
  if (!uri || typeof uri !== 'string') return null;
  if (!uri.startsWith('file:')) return null;
  try { return path.normalize(fileURLToPath(uri)); } catch { return null; }
}

function pathToUri(file) {
  return pathToFileURL(path.resolve(file)).href;
}

// A comparable key for a file path (Windows paths are case-insensitive).
function pathKey(file) {
  const p = path.normalize(path.resolve(file));
  return IS_WIN ? p.toLowerCase() : p;
}

function isInside(root, file) {
  const rel = path.relative(root, file);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function toRel(root, file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

const SEVERITY = { BLOCKER: 1, CRITICAL: 1, MAJOR: 2, MINOR: 3, INFO: 4 };

function diagnosticSeverity(issue, map) {
  if (map && map[issue.severity]) return map[issue.severity];
  if (issue.type === 'SECURITY_HOTSPOT') return 3;
  return SEVERITY[issue.severity] || 2;
}

function text(msg, lang) {
  if (msg == null) return '';
  if (typeof msg === 'string') return msg;
  return msg[lang] || msg.en || msg.ko || '';
}

// Range of an issue on a line of text. Columns in findings are 1-based; LSP
// positions are 0-based UTF-16 offsets, which JS string indices already are.
function issueRange(issue, lines) {
  const ln = Math.max(0, (issue.line || 1) - 1);
  const lineText = (lines && lines[ln]) || '';
  if (issue.column && issue.column > 0) {
    const start = Math.min(issue.column - 1, lineText.length);
    if (issue.endLine && issue.endColumn) {
      return { start: { line: ln, character: start }, end: { line: Math.max(ln, issue.endLine - 1), character: Math.max(0, issue.endColumn - 1) } };
    }
    const rest = lineText.slice(start);
    const word = /^[A-Za-z_$][\w$.]*/.exec(rest);
    const endChar = word ? start + word[0].length : (rest.trim() ? lineText.replace(/\s+$/, '').length : start + 1);
    return { start: { line: ln, character: start }, end: { line: ln, character: Math.max(endChar, start + 1) } };
  }
  const first = lineText.search(/\S/);
  const startChar = first < 0 ? 0 : first;
  let endChar = lineText.replace(/\s+$/, '').length;
  if (issue.rule === 'common:trailing-space') {
    const trimmed = lineText.replace(/[ \t]+$/, '');
    return { start: { line: ln, character: trimmed.length }, end: { line: ln, character: lineText.length } };
  }
  if (endChar <= startChar) endChar = Math.max(startChar + 1, lineText.length);
  return { start: { line: ln, character: startChar }, end: { line: ln, character: endChar } };
}

function lineRange(line, lines) {
  const ln = Math.max(0, (line || 1) - 1);
  const lineText = lines ? (lines[ln] || '') : null;
  const end = lineText == null ? 1000 : Math.max(1, lineText.length);
  const first = lineText ? Math.max(0, lineText.search(/\S/)) : 0;
  return { start: { line: ln, character: first }, end: { line: ln, character: end } };
}

// Builds an LSP Diagnostic. `ctx`:
//   lang, lines (string[] of the issue's file), rootPath, linesOf(rel) -> string[]|null,
//   ruleLink(key) -> url|null, severityMap
function toDiagnostic(issue, ctx) {
  const lang = ctx.lang || 'en';
  const diag = {
    range: issueRange(issue, ctx.lines),
    severity: diagnosticSeverity(issue, ctx.severityMap),
    code: issue.rule,
    source: 'MyCodeChecker',
    message: text(issue.message, lang) || issue.rule,
    data: {
      key: issue.key,
      rule: issue.rule,
      type: issue.type,
      severity: issue.severity,
      cid: issue.cid,
      engine: issue.engine,
    },
  };
  const href = ctx.ruleLink ? ctx.ruleLink(issue.rule) : null;
  if (href) diag.codeDescription = { href };
  if (issue.type === 'SECURITY_HOTSPOT') diag.data.hotspot = true;
  const related = [];
  for (const ev of issue.events || []) {
    if (!ev || !ev.line) continue;
    const evFile = ev.file || issue.file;
    if (ev.main && evFile === issue.file && ev.line === issue.line) continue;
    const msg = text(ev.text, lang);
    if (!msg) continue;
    const abs = path.join(ctx.rootPath, evFile);
    const evLines = evFile === issue.file ? ctx.lines : (ctx.linesOf ? ctx.linesOf(evFile) : null);
    related.push({
      location: { uri: pathToUri(abs), range: lineRange(ev.line, evLines) },
      message: ev.tag && ev.tag !== 'path' && ev.tag !== 'main' ? `${ev.tag}: ${msg}` : msg,
    });
  }
  if (related.length) diag.relatedInformation = related;
  if (issue.tags && issue.tags.includes('deprecated')) diag.tags = [2];
  return diag;
}

module.exports = {
  slimIssue, uriToPath, pathToUri, pathKey, isInside, toRel, toDiagnostic, issueRange,
  diagnosticSeverity, text, SEVERITY,
};
