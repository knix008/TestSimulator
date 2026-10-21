'use strict';

const { metricLabel } = require('./qualitygate');
const { catalog } = require('./rules');
const { structuralMeta } = require('./metrics');

function ruleIndex() {
  const map = new Map();
  for (const rule of [...catalog(), ...structuralMeta()]) map.set(rule.key, rule);
  return map;
}

function toJson(analysis) {
  return JSON.stringify(analysis, null, 2);
}

function toCsv(analysis) {
  const rows = [['type', 'severity', 'rule', 'file', 'line', 'status', 'message']];
  for (const issue of analysis.issues) {
    const msg = issue.message && (issue.message.en || issue.message.ko) || '';
    rows.push([issue.type, issue.severity, issue.rule, issue.file, issue.line, issue.status, msg.replaceAll('"', '""')]);
  }
  return rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
}

function toDefects(analysis) {
  const rows = [['cid', 'checker', 'impact', 'kind', 'classification', 'action', 'owner', 'component', 'cwe', 'file', 'function', 'line', 'status', 'message']];
  const issues = [...(analysis.issues || []), ...((analysis.coverity && analysis.coverity.fixedDefects) || [])];
  for (const issue of issues) {
    const msg = text(issue.message, 'en');
    rows.push([
      issue.cid || '', issue.checker || '', issue.impact || '', issue.kind || '',
      issue.classification || '', issue.action || '', issue.owner || '', issue.component || '',
      issue.cwe || '', issue.file || '', issue.function || '', issue.line || '',
      issue.coverityStatus || issue.status || '', msg,
    ]);
  }
  return rows.map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(',')).join('\n');
}

function toSarif(analysis) {
  const rules = ruleIndex();
  const used = new Map();
  const results = [];
  for (const issue of analysis.issues) {
    const rule = rules.get(issue.rule);
    if (!used.has(issue.rule)) {
      used.set(issue.rule, {
        id: issue.rule,
        shortDescription: { text: text(rule && rule.name, 'en') || issue.rule },
        fullDescription: { text: text(rule && rule.why, 'en') || '' },
        help: { text: text(rule && rule.fix, 'en') || '' },
        defaultConfiguration: { level: sarifLevel(issue.severity, issue.type) },
        properties: { tags: issue.tags || [], type: issue.type },
      });
    }
    results.push({
      ruleId: issue.rule,
      level: sarifLevel(issue.severity, issue.type),
      message: { text: text(issue.message, 'en') },
      locations: [{
        physicalLocation: {
          artifactLocation: { uri: issue.file },
          region: { startLine: issue.line },
        },
      }],
      properties: { severity: issue.severity, type: issue.type, isNew: !!issue.isNew },
    });
  }
  return JSON.stringify({
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [{
      tool: { driver: { name: 'MyCodeChecker', version: '1.0.0', rules: [...used.values()] } },
      results,
      properties: { qualityGate: analysis.qualityGate, measures: analysis.measures, ratings: analysis.ratings },
    }],
  }, null, 2);
}

function toHtml(analysis, lang = 'ko') {
  const t = lang === 'ko';
  const gate = analysis.qualityGate || { status: 'NONE', conditions: [] };
  const rows = analysis.issues.slice(0, 2000).map((issue) => {
    const msg = text(issue.message, lang);
    return `<tr><td>${esc(issue.severity)}</td><td>${esc(issue.type)}</td><td>${esc(issue.rule)}</td><td>${esc(issue.file)}:${issue.line}</td><td>${esc(msg)}</td></tr>`;
  }).join('');
  const conds = (gate.conditions || []).map((c) => `<li>${esc(metricLabel(c.metric, lang))} ${esc(c.op)} ${esc(c.threshold)} — ${esc(c.status)} (${esc(c.actual)})</li>`).join('');
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>MyCodeChecker</title>
<style>body{font-family:Segoe UI,Malgun Gothic,sans-serif;margin:24px;color:#1c2530}table{border-collapse:collapse;width:100%}td,th{border:1px solid #d3dae3;padding:6px 8px;font-size:13px;text-align:left}th{background:#eef1f5}.fail{color:#c62828}.ok{color:#2e7d32}</style></head><body>
<h1>MyCodeChecker</h1>
<p class="${gate.status === 'OK' ? 'ok' : 'fail'}">${t ? '품질 게이트' : 'Quality gate'}: <strong>${esc(gate.status)}</strong></p>
<ul>${conds}</ul>
<p>${t ? '버그' : 'Bugs'} ${analysis.measures.bugs} · ${t ? '취약점' : 'Vulnerabilities'} ${analysis.measures.vulnerabilities} · ${t ? '코드 스멜' : 'Code smells'} ${analysis.measures.code_smells}</p>
<table><thead><tr><th>${t ? '심각도' : 'Severity'}</th><th>${t ? '종류' : 'Type'}</th><th>${t ? '규칙' : 'Rule'}</th><th>${t ? '위치' : 'Location'}</th><th>${t ? '메시지' : 'Message'}</th></tr></thead><tbody>${rows}</tbody></table>
</body></html>`;
}

function badge(status) {
  const ok = status === 'OK';
  const label = ok ? 'passed' : 'failed';
  const color = ok ? '#2e7d32' : '#c62828';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="168" height="20"><rect width="90" height="20" fill="#455a64"/><rect x="90" width="78" height="20" fill="${color}"/><text x="45" y="14" text-anchor="middle" fill="#fff" font-family="Segoe UI,sans-serif" font-size="11">quality gate</text><text x="129" y="14" text-anchor="middle" fill="#fff" font-family="Segoe UI,sans-serif" font-size="11">${label}</text></svg>`;
  return svg;
}

function sarifLevel(severity, type) {
  if (type === 'CODE_SMELL' && (severity === 'INFO' || severity === 'MINOR')) return 'note';
  if (severity === 'BLOCKER' || severity === 'CRITICAL') return 'error';
  if (severity === 'MAJOR') return 'warning';
  return 'note';
}

function text(value, lang) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value[lang] || value.en || value.ko || '';
}

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

module.exports = { toJson, toCsv, toSarif, toHtml, badge, toDefects, text };
