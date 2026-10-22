'use strict';

const { rule } = require('./rules');

function txt(obj, lang) {
  if (!obj) return '';
  return obj[lang] || obj.en || obj.ko || '';
}

function sarifLevel(severity, type) {
  if (type === 'VULNERABILITY') {
    if (severity === 'BLOCKER' || severity === 'CRITICAL') return 'error';
    if (severity === 'MAJOR') return 'warning';
    return 'note';
  }
  if (severity === 'BLOCKER' || severity === 'CRITICAL') return 'error';
  if (severity === 'MAJOR') return 'warning';
  return 'note';
}

function toSarif(result) {
  const used = new Map();
  const results = [];
  for (const finding of result.findings || []) {
    const meta = rule(finding.rule) || {};
    if (!used.has(finding.rule)) {
      const std = meta.standards || {};
      const tags = [...(meta.tags || [])];
      used.set(finding.rule, {
        id: finding.rule,
        name: finding.rule,
        shortDescription: { text: txt(meta.name, 'en') || finding.rule },
        fullDescription: { text: txt(meta.why, 'en') || '' },
        help: { text: txt(meta.fix, 'en') || '' },
        defaultConfiguration: { level: sarifLevel(finding.severity || meta.severity, finding.type || meta.type) },
        properties: {
          tags,
          'security-severity': secScore(finding.severity || meta.severity),
          cwe: std.cwe || [],
          owasp2021: std.owasp2021 || [],
          type: finding.type || meta.type,
        },
      });
    }
    results.push({
      ruleId: finding.rule,
      level: sarifLevel(finding.severity || meta.severity, finding.type || meta.type),
      message: { text: txt(finding.message, 'en') || txt(meta.name, 'en') || finding.rule },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: finding.url },
          },
          logicalLocations: finding.param ? [{ name: finding.param, kind: 'parameter' }] : undefined,
        },
      ],
      properties: {
        method: finding.method,
        param: finding.param || undefined,
        evidence: finding.evidence || undefined,
      },
    });
  }
  return JSON.stringify(
    {
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'MyCodeChecker-DAST',
              informationUri: 'https://example.invalid/mycodechecker',
              rules: [...used.values()],
            },
          },
          results,
        },
      ],
    },
    null,
    2,
  );
}

function secScore(sev) {
  return { BLOCKER: '9.8', CRITICAL: '9.1', MAJOR: '6.5', MINOR: '4.0', INFO: '1.0' }[sev] || '5.0';
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toHtml(result, lang = 'en') {
  const sevOrder = { BLOCKER: 0, CRITICAL: 1, MAJOR: 2, MINOR: 3, INFO: 4 };
  const findings = [...(result.findings || [])].sort((a, b) => {
    const am = rule(a.rule) || {};
    const bm = rule(b.rule) || {};
    return (sevOrder[a.severity || am.severity] ?? 5) - (sevOrder[b.severity || bm.severity] ?? 5);
  });
  const counts = {};
  for (const fnd of findings) {
    const sev = fnd.severity || (rule(fnd.rule) || {}).severity || 'INFO';
    counts[sev] = (counts[sev] || 0) + 1;
  }
  const rows = findings
    .map((fnd) => {
      const meta = rule(fnd.rule) || {};
      const sev = fnd.severity || meta.severity || 'INFO';
      const std = meta.standards || {};
      const name = txt(fnd.message, lang) || txt(meta.name, lang);
      return `<tr class="sev-${esc(sev)}">
      <td><span class="badge b-${esc(sev)}">${esc(sev)}</span></td>
      <td><code>${esc(fnd.rule)}</code><div class="rn">${esc(txt(meta.name, lang))}</div></td>
      <td>${esc(fnd.method || 'GET')} <a href="${esc(fnd.url)}">${esc(fnd.url)}</a>${fnd.param ? `<div class="pm">param: <code>${esc(fnd.param)}</code></div>` : ''}</td>
      <td>${esc(name)}<div class="ev">${esc(fnd.evidence || '')}</div></td>
      <td>${esc((std.cwe || []).join(', '))}<br>${esc((std.owasp2021 || []).join(', '))}</td>
    </tr>`;
    })
    .join('\n');

  const summary = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO']
    .map((s) => `<span class="badge b-${s}">${s}: ${counts[s] || 0}</span>`)
    .join(' ');

  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MyCodeChecker DAST report</title>
<style>
  :root { color-scheme: light dark; --bg:#fff; --fg:#1a1a1a; --mut:#666; --line:#e2e2e2; --card:#f7f7f8; }
  @media (prefers-color-scheme: dark){ :root{ --bg:#15171a; --fg:#e8e8ea; --mut:#9aa0a6; --line:#2a2d31; --card:#1d2024; } }
  body{ font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif; margin:0; background:var(--bg); color:var(--fg); }
  .wrap{ max-width:1100px; margin:0 auto; padding:24px 16px; }
  h1{ font-size:20px; margin:0 0 4px; }
  .meta{ color:var(--mut); margin-bottom:16px; }
  .cards{ display:flex; flex-wrap:wrap; gap:12px; margin:16px 0; }
  .card{ background:var(--card); border:1px solid var(--line); border-radius:8px; padding:12px 16px; }
  .card .n{ font-size:22px; font-weight:600; }
  table{ border-collapse:collapse; width:100%; }
  th,td{ text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  th{ color:var(--mut); font-weight:600; font-size:12px; text-transform:uppercase; }
  code{ font-family:ui-monospace,Menlo,Consolas,monospace; font-size:12px; }
  a{ color:inherit; word-break:break-all; }
  .rn,.pm,.ev{ color:var(--mut); font-size:12px; }
  .ev{ white-space:pre-wrap; margin-top:4px; max-height:120px; overflow:auto; }
  .badge{ display:inline-block; padding:1px 8px; border-radius:999px; font-size:11px; font-weight:600; color:#fff; }
  .b-BLOCKER{ background:#8b0000; } .b-CRITICAL{ background:#d32f2f; } .b-MAJOR{ background:#ed6c02; }
  .b-MINOR{ background:#0277bd; } .b-INFO{ background:#607d8b; }
</style>
</head>
<body>
<div class="wrap">
  <h1>MyCodeChecker DAST report</h1>
  <div class="meta">Target: <strong>${esc([].concat(result.target || []).join(', '))}</strong><br>
    ${esc(result.startedAt || '')} → ${esc(result.finishedAt || '')} ·
    ${esc(result.requests || 0)} requests · ${esc((result.pages || []).length)} pages · mode: ${esc(result.mode || '')}</div>
  <div class="cards">
    <div class="card"><div class="n">${findings.length}</div>findings</div>
    <div class="card"><div class="n">${(result.pages || []).length}</div>pages</div>
    <div class="card"><div class="n">${esc(result.requests || 0)}</div>requests</div>
  </div>
  <div style="margin-bottom:12px">${summary}</div>
  <table>
    <thead><tr><th>Severity</th><th>Rule</th><th>Location</th><th>Detail</th><th>Standards</th></tr></thead>
    <tbody>
    ${rows || '<tr><td colspan="5">No findings.</td></tr>'}
    </tbody>
  </table>
</div>
</body>
</html>`;
}

module.exports = { toSarif, toHtml };
