'use strict';

// Small helpers shared by the platform modules. Node built-ins only.

/** Pick a language string out of `{ en, ko }` or a plain string. */
function text(value, lang = 'en') {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return value[lang] || value.en || value.ko || '';
}

/** Escape for HTML text and attribute values. */
function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** Quote one CSV cell (RFC 4180). Cells that start with = + - @ are prefixed to stop formula injection. */
function csvCell(value) {
  let s = String(value == null ? '' : value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Rows (arrays) to CSV text with CRLF line ends and a UTF-8 BOM so Excel reads Korean. */
function toCsvRows(rows) {
  return `\ufeff${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/** Same closed rule as core/ratings.js: resolved issues are closed, hotspots never are. */
function isClosed(issue) {
  if (!issue) return false;
  if (issue.type === 'SECURITY_HOTSPOT') return false;
  return issue.status === 'RESOLVED' || issue.status === 'CLOSED' || !!issue.resolution;
}

/** Normalize a path to forward slashes, no leading './' or '/'. */
function normPath(p) {
  return String(p || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

// The regular expression of a glob pattern: `*` is any text within one folder
// name, `?` one character, `**` any depth. `**/` also matches no folder at
// all and a final `/**` everything inside, so **/dup/** matches dup/a.js at
// the root as well. Case-insensitive; the pattern matches a whole path or its
// end after a /.
const globCache = new Map();
function globRegExp(pattern) {
  const p = normPath(pattern);
  let re = globCache.get(p);
  if (!re) {
    let body = '';
    for (let i = 0; i < p.length;) {
      if (p.startsWith('**/', i)) { body += '(?:.*/)?'; i += 3; }
      else if (p.startsWith('/**', i) && i + 3 === p.length) { body += '(?:/.*)?'; i += 3; }
      else if (p.startsWith('**', i)) { body += '.*'; i += 2; }
      else if (p[i] === '*') { body += '[^/]*'; i += 1; }
      else if (p[i] === '?') { body += '[^/]'; i += 1; }
      else { body += p[i].replace(/[.+^${}()|[\]\\]/g, '\\$&'); i += 1; }
    }
    re = new RegExp(`(?:^|/)${body}$`, 'i');
    if (globCache.size > 2000) globCache.clear();
    globCache.set(p, re);
  }
  return re;
}

/** Glob match with `*` (one segment), `?` and `**` (any depth, including none). Case-insensitive, matches a suffix of the path. */
function glob(rel, pattern) {
  const p = normPath(pattern);
  if (!p) return false;
  if (p === '**' || p === '*') return true;
  return globRegExp(p).test(normPath(rel));
}

/** Map catalog rules by key. Accepts an array or a Map. */
function ruleIndex(catalog) {
  if (catalog instanceof Map) return catalog;
  const map = new Map();
  for (const rule of catalog || []) if (rule && rule.key) map.set(rule.key, rule);
  return map;
}

/** Turn 'CWE-79', 'cwe-079', 79, 'external/cwe/cwe-79' into the number 79 (or null). */
function cweNumber(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const m = String(value).match(/cwe[-_/:\s]*0*(\d+)/i) || String(value).match(/^0*(\d+)$/);
  return m ? Number(m[1]) : null;
}

/** All CWE numbers that apply to an issue: issue.cwe, issue tags, rule cwe, rule standards.cwe, rule tags. */
function cwesOf(issue, rule) {
  const out = new Set();
  const add = (v) => { const n = cweNumber(v); if (n) out.add(n); };
  if (issue) {
    add(issue.cwe);
    for (const t of issue.tags || []) if (/cwe/i.test(t)) add(t);
    for (const c of issue.cwes || []) add(c);
  }
  if (rule) {
    add(rule.cwe);
    const std = rule.standards || {};
    for (const c of [].concat(std.cwe || [])) add(c);
    for (const t of rule.tags || []) if (/cwe/i.test(t)) add(t);
  }
  return [...out];
}

/** Count items by a key function. */
function countBy(items, fn) {
  const out = {};
  for (const item of items) {
    const k = fn(item);
    if (k == null) continue;
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

const SEV_ORDER = ['INFO', 'MINOR', 'MAJOR', 'CRITICAL', 'BLOCKER'];

/** Rating letter from the worst open severity, code quality style (no issue = A). */
function ratingFromWorst(issues) {
  let worst = -1;
  for (const i of issues) if (!isClosed(i)) worst = Math.max(worst, SEV_ORDER.indexOf(i.severity));
  return worst <= 0 ? 'A' : ['A', 'B', 'C', 'D', 'E'][worst];
}

module.exports = {
  globRegExp,
  text, esc, csvCell, toCsvRows, isClosed, normPath, glob, ruleIndex, cweNumber, cwesOf, countBy, SEV_ORDER, ratingFromWorst,
};
