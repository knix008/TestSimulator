'use strict';

// Shared helpers for the extra line-rule catalog. A rule built here has the
// same shape as an entry of core/rules.js RULES (key, langs, type, severity,
// debtMin, tags, scope, re, skip?, name, why, fix) plus derived cwe/standards.
// Compliant / non-compliant sample lines are kept apart in EXAMPLES so the
// rule objects stay identical in shape to the base catalog.

const TYPES = { B: 'BUG', V: 'VULNERABILITY', S: 'CODE_SMELL', H: 'SECURITY_HOTSPOT' };
const SEVS = { BL: 'BLOCKER', CR: 'CRITICAL', MA: 'MAJOR', MI: 'MINOR', IN: 'INFO' };

const EXAMPLES = new Map();

// Replace the inside of simple quoted literals with spaces, keeping the
// quotes, so a pattern can be tested against code tokens only.
function blankStrings(line) {
  const s = String(line);
  let out = '';
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '\\') { out += '  '; i++; continue; }
      if (c === q) { q = null; out += c; continue; }
      out += ' ';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') q = c;
    out += c;
  }
  return out;
}

// True when a ?: conditional sits inside a branch of another one on the same
// line. Strings are blanked first; ?. ?? and TypeScript optional markers
// (x?: T, x?) are not conditionals.
function nestedTernary(line) {
  const s = blankStrings(line);
  const open = [];
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[' || c === '{') { depth++; continue; }
    if (c === ')' || c === ']' || c === '}') {
      depth--;
      while (open.length && open[open.length - 1] > depth) open.pop();
      continue;
    }
    if ((c === ',' || c === ';') && open.length && open[open.length - 1] >= depth) {
      while (open.length && open[open.length - 1] >= depth) open.pop();
      continue;
    }
    if (c !== '?') continue;
    const next = s[i + 1] || '';
    const prev = s[i - 1] || '';
    // Only a spaced "cond ? a : b" counts; this skips ?. ?? x?: T, C# int?,
    // Kotlin String? and generics such as List<?>.
    if (!/[\s)\]]/.test(prev) || !/\s/.test(next)) continue;
    if (open.some((d) => d <= depth)) return true;
    open.push(depth);
  }
  return false;
}

// Shannon entropy in bits per character.
function entropy(text) {
  const s = String(text || '');
  if (!s) return 0;
  const counts = new Map();
  for (const c of s) counts.set(c, (counts.get(c) || 0) + 1);
  let h = 0;
  for (const n of counts.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

function arr(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function deriveStandards(tags) {
  const cwe = [];
  const owasp = [];
  for (const t of tags) {
    let m = /^cwe-(\d+)$/.exec(t);
    if (m) cwe.push(`CWE-${m[1]}`);
    m = /^owasp-(a\d\d)$/.exec(t);
    if (m) owasp.push(m[1].toUpperCase());
  }
  const standards = {};
  if (cwe.length) standards.cwe = cwe;
  if (owasp.length) standards.owasp2021 = owasp;
  return { cwe: cwe[0] || '', standards };
}

// maker('js', ['js']) returns R(id, type, sev, debtMin, tags, re, en, ko, bad, good, opts).
//   en / ko: [name, why, fix]
//   bad / good: a sample line (or several) that must / must not match
//   opts: { skip, scope, langs, lang (sample language), ns (re must also match
//           with strings blanked), code (a second, stricter regex tested on the
//           blanked line), raw (see raw lines but not comment-only ones) }
function maker(prefix, defaultLangs) {
  const rules = [];
  function R(id, type, sev, debtMin, tags, re, en, ko, bad, good, opts = {}) {
    const key = `${prefix}:${id}`;
    const langs = arr(opts.langs || defaultLangs);
    let skip = opts.skip || null;
    let scope = opts.scope || 'code';
    if (opts.ns) {
      const base = skip;
      skip = (rawLine, line) => {
        re.lastIndex = 0;
        if (!re.test(blankStrings(line))) return true;
        return base ? base(rawLine, line) : false;
      };
    }
    if (opts.code) {
      // re is a cheap prefilter on the real line; opts.code must also match
      // the line with string contents blanked.
      const strict = opts.code;
      const base = skip;
      skip = (rawLine, line) => {
        strict.lastIndex = 0;
        if (!strict.test(blankStrings(line))) return true;
        return base ? base(rawLine, line) : false;
      };
    }
    if (opts.raw) {
      // Hash-comment languages cut a line at '#', which also cuts "#{...}"
      // interpolation. Look at the raw line but ignore pure comment lines.
      scope = 'any';
      const base = skip;
      skip = (rawLine, line) => {
        if (/^\s*#(?!\{)/.test(String(rawLine))) return true;
        return base ? base(rawLine, line) : false;
      };
    }
    const allTags = tags.map((t) => String(t).toLowerCase());
    const { cwe, standards } = deriveStandards(allTags);
    const rule = {
      key,
      langs,
      type: TYPES[type] || type,
      severity: SEVS[sev] || sev,
      debtMin,
      tags: allTags,
      scope,
      re,
      name: { en: en[0], ko: ko[0] },
      why: { en: en[1], ko: ko[1] },
      fix: { en: en[2], ko: ko[2] },
      cwe,
      standards,
    };
    if (skip) rule.skip = skip;
    rules.push(rule);
    EXAMPLES.set(key, { bad: arr(bad), good: arr(good), lang: opts.lang || (langs[0] === '*' ? 'js' : langs[0]) });
    return rule;
  }
  R.rules = rules;
  return R;
}

module.exports = { maker, blankStrings, nestedTernary, entropy, EXAMPLES, TYPES, SEVS };
