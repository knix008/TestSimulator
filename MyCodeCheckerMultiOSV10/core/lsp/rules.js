'use strict';

// Rule descriptions for hover and the "rule description" request.

const { listRules } = require('../analyze');
const { text } = require('./issues');

let index = null;

function ruleIndex() {
  if (index) return index;
  index = new Map();
  for (const meta of listRules()) if (meta && meta.key && !index.has(meta.key)) index.set(meta.key, meta);
  return index;
}

const TYPE_LABEL = {
  BUG: { en: 'Bug', ko: '버그' },
  VULNERABILITY: { en: 'Vulnerability', ko: '취약점' },
  CODE_SMELL: { en: 'Code smell', ko: '코드 스멜' },
  SECURITY_HOTSPOT: { en: 'Security hotspot', ko: '보안 핫스팟' },
};

const SEVERITY_LABEL = {
  BLOCKER: { en: 'Blocker', ko: '차단' },
  CRITICAL: { en: 'Critical', ko: '심각' },
  MAJOR: { en: 'Major', ko: '주요' },
  MINOR: { en: 'Minor', ko: '경미' },
  INFO: { en: 'Info', ko: '정보' },
};

const STANDARD_LABEL = {
  misraC2012: 'MISRA C:2012',
  misraC2023: 'MISRA C:2023',
  misraCpp2023: 'MISRA C++:2023',
  autosar: 'AUTOSAR C++14',
  certC: 'CERT C',
  certCpp: 'CERT C++',
  cwe: 'CWE',
  owasp2021: 'OWASP Top 10 2021',
  cweTop25: 'CWE Top 25',
};

function standardsList(meta) {
  const out = [];
  const std = meta.standards || {};
  for (const [k, v] of Object.entries(std)) {
    if (v === false || v == null || v === '') continue;
    const value = v === true ? 'yes' : Array.isArray(v) ? v.join(', ') : String(v);
    out.push({ id: k, label: STANDARD_LABEL[k] || k, value });
  }
  if (meta.cwe && !std.cwe) out.push({ id: 'cwe', label: 'CWE', value: meta.cwe });
  if (meta.cert && !std.certC && !std.certCpp) out.push({ id: 'cert', label: 'CERT', value: String(meta.cert).replace(/^CERT\s+/, '') });
  return out;
}

function fallbackMeta(key, issue) {
  return {
    key,
    type: (issue && issue.type) || 'CODE_SMELL',
    severity: (issue && issue.severity) || 'MAJOR',
    name: (issue && issue.message) || { en: key, ko: key },
    tags: (issue && issue.tags) || [],
    langs: ['*'],
  };
}

// { key, name, why, fix, type, severity, ... } with both languages, plus
// `title`/`markdown` rendered for the requested language.
function describeRule(key, lang = 'en', issue = null) {
  const meta = ruleIndex().get(key) || fallbackMeta(key, issue);
  const standards = standardsList(meta);
  const desc = {
    key,
    known: ruleIndex().has(key),
    name: meta.name || { en: key, ko: key },
    why: meta.why || null,
    fix: meta.fix || null,
    type: meta.type,
    severity: meta.severity,
    typeLabel: TYPE_LABEL[meta.type] || { en: meta.type, ko: meta.type },
    severityLabel: SEVERITY_LABEL[meta.severity] || { en: meta.severity, ko: meta.severity },
    tags: meta.tags || [],
    langs: meta.langs || [],
    debtMin: meta.debtMin || 0,
    engine: meta.engine || null,
    checker: meta.checker || null,
    category: meta.category || null,
    misraCategory: meta.misraCategory || null,
    standards,
  };
  desc.title = text(desc.name, lang);
  desc.markdown = ruleMarkdown(desc, lang, issue);
  return desc;
}

function ruleMarkdown(desc, lang, issue) {
  const ko = lang === 'ko';
  const L = (en, k) => (ko ? k : en);
  const lines = [];
  lines.push(`**${escapeMd(desc.title)}** \`${desc.key}\``);
  lines.push('');
  lines.push(`${text(desc.typeLabel, lang)} · ${text(desc.severityLabel, lang)}${desc.debtMin ? ` · ${desc.debtMin} ${L('min', '분')}` : ''}`);
  if (issue && issue.message) {
    const msg = text(issue.message, lang);
    if (msg && msg !== desc.title) { lines.push(''); lines.push(`> ${escapeMd(msg)}`); }
  }
  if (desc.why) { lines.push(''); lines.push(`**${L('Why is this an issue?', '왜 문제인가요?')}** ${escapeMd(text(desc.why, lang))}`); }
  if (desc.fix) { lines.push(''); lines.push(`**${L('How to fix', '고치는 방법')}** ${escapeMd(text(desc.fix, lang))}`); }
  if (desc.standards.length) {
    lines.push('');
    lines.push(`**${L('Standards', '표준')}** ${desc.standards.map((s) => `${s.label} ${s.value}`).join(' · ')}`);
  }
  if (desc.tags.length) { lines.push(''); lines.push(`${L('Tags', '태그')}: ${desc.tags.map((t) => `\`${t}\``).join(' ')}`); }
  return lines.join('\n');
}

function escapeMd(s) {
  return String(s || '').replace(/([*_`[\]<>])/g, '\\$1');
}

module.exports = { describeRule, ruleIndex, TYPE_LABEL, SEVERITY_LABEL };
