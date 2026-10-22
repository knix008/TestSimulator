'use strict';

// Self-contained, print-ready HTML reports (open in a browser, print to PDF)
// and CSV variants. Korean / English through `lang`.
//
//   executiveReport   Sonar "project PDF report" style summary
//   securityReport    one security standard (from compliance.js)
//   misraReport       MISRA Compliance:2020 GCS / GEP / deviations
//   integrityReport   Coverity "Integrity report" (defect density, impact, component, checker, trend)
//   coveritySecurityReport  Coverity "Security report" (CWE-weighted score)
//   sparrowReport     Sparrow-style rule-set compliance
//   sbomSection       SCA {dependencies, vulnerabilities, licenses} block, used by the others

const { esc, text, toCsvRows, isClosed, ruleIndex, cwesOf, countBy } = require('./util');
const compliance = require('./compliance');
const { metricLabel } = require('../qualitygate');

const L = {
  en: {
    generated: 'Generated', project: 'Project', branch: 'Branch', gate: 'Quality gate', passed: 'Passed', failed: 'Failed', none: 'Not computed',
    reliability: 'Reliability', security: 'Security', maintainability: 'Maintainability', review: 'Security review', coverage: 'Coverage', duplications: 'Duplications',
    bugs: 'Bugs', vulnerabilities: 'Vulnerabilities', smells: 'Code smells', hotspots: 'Security hotspots', debt: 'Technical debt', ncloc: 'Lines of code',
    newCode: 'New code', overall: 'Overall code', conditions: 'Conditions', metric: 'Metric', operator: 'Operator', threshold: 'Threshold', actual: 'Actual', status: 'Status',
    topRules: 'Most violated rules', rule: 'Rule', count: 'Count', file: 'File', line: 'Line', message: 'Message', severity: 'Severity', type: 'Type',
    category: 'Category', rating: 'Rating', total: 'Total', toReview: 'To review', unmapped: 'Not mapped to this standard',
    guideline: 'Guideline', orig: 'Original category', eff: 'Category', violations: 'Violations', deviations: 'Deviations', enforcement: 'Enforcement', decidable: 'Decidable',
    gcs: 'Guideline Compliance Summary', gep: 'Guideline Enforcement Plan', grp: 'Guideline Re-categorization Plan', devs: 'Deviation records',
    justification: 'Justification', approver: 'Approver', date: 'Date', scope: 'Scope', valid: 'Valid', problems: 'Problems', verdict: 'Verdict',
    compliant: 'Compliant', notCompliant: 'Not compliant', from: 'From', to: 'To', applied: 'Applied', yes: 'yes', no: 'no',
    integrity: 'Integrity report', density: 'Defect density (per KLOC)', outstanding: 'Outstanding', high: 'High impact', medium: 'Medium impact', low: 'Low impact',
    byComponent: 'By component', byChecker: 'By checker', trend: 'Trend', snapshot: 'Snapshot', dismissed: 'Dismissed', fixed: 'Fixed', newly: 'Newly detected',
    secScore: 'Security score', cwe: 'CWE', weight: 'Weight', score: 'Score', level: 'Level',
    ruleSet: 'Rule set', checkedRules: 'Rules checked', violatedRules: 'Rules violated', complianceRate: 'Compliance rate',
    sbom: 'Software bill of materials', dependencies: 'Dependencies', licenses: 'Licenses', name: 'Name', version: 'Version', license: 'License', id: 'ID', pkg: 'Package',
    issues: 'Issues', requirement: 'Requirement', component: 'Component', checker: 'Checker', executive: 'Executive summary', securityReport: 'Security report',
    misra: 'MISRA compliance report', sparrow: 'Rule-set compliance report', covSecurity: 'Security report (CWE weighted)', rank: 'Rank',
  },
  ko: {
    generated: '생성', project: '프로젝트', branch: '브랜치', gate: '품질 게이트', passed: '통과', failed: '실패', none: '계산 안 됨',
    reliability: '신뢰성', security: '보안', maintainability: '유지보수성', review: '보안 검토', coverage: '커버리지', duplications: '중복',
    bugs: '버그', vulnerabilities: '취약점', smells: '코드 스멜', hotspots: '보안 핫스팟', debt: '기술 부채', ncloc: '코드 줄',
    newCode: '새 코드', overall: '전체 코드', conditions: '조건', metric: '지표', operator: '연산자', threshold: '기준', actual: '실제', status: '상태',
    topRules: '가장 많이 위반한 규칙', rule: '규칙', count: '개수', file: '파일', line: '줄', message: '메시지', severity: '심각도', type: '종류',
    category: '분류', rating: '등급', total: '합계', toReview: '검토 필요', unmapped: '이 표준에 연결되지 않음',
    guideline: '지침', orig: '원래 분류', eff: '분류', violations: '위반', deviations: '편차', enforcement: '적용 방법', decidable: '결정 가능',
    gcs: '지침 준수 요약(GCS)', gep: '지침 적용 계획(GEP)', grp: '지침 재분류 계획(GRP)', devs: '편차 기록',
    justification: '근거', approver: '승인자', date: '날짜', scope: '범위', valid: '유효', problems: '문제', verdict: '판정',
    compliant: '준수', notCompliant: '준수하지 않음', from: '이전', to: '이후', applied: '적용', yes: '예', no: '아니오',
    integrity: '무결성 보고서', density: '결함 밀도(KLOC당)', outstanding: '미해결', high: '높은 영향', medium: '중간 영향', low: '낮은 영향',
    byComponent: '구성 요소별', byChecker: '검사기별', trend: '추이', snapshot: '스냅숏', dismissed: '기각', fixed: '수정됨', newly: '새로 발견',
    secScore: '보안 점수', cwe: 'CWE', weight: '가중치', score: '점수', level: '수준',
    ruleSet: '규칙 집합', checkedRules: '검사한 규칙', violatedRules: '위반한 규칙', complianceRate: '준수율',
    sbom: '소프트웨어 자재 명세서(SBOM)', dependencies: '의존성', licenses: '라이선스', name: '이름', version: '버전', license: '라이선스', id: 'ID', pkg: '패키지',
    issues: '이슈', requirement: '요구 사항', component: '구성 요소', checker: '검사기', executive: '요약 보고서', securityReport: '보안 보고서',
    misra: 'MISRA 준수 보고서', sparrow: '규칙 집합 준수 보고서', covSecurity: '보안 보고서(CWE 가중)', rank: '순위',
  },
};

function t(lang) { return L[lang === 'ko' ? 'ko' : 'en']; }

const LETTER = ['', 'A', 'B', 'C', 'D', 'E'];
const RATING_COLOR = { A: '#2e7d32', B: '#7cb342', C: '#f9a825', D: '#ef6c00', E: '#c62828' };

const CSS = `
:root{--fg:#1c2530;--muted:#5b6876;--line:#d3dae3;--head:#eef1f5;--ok:#2e7d32;--bad:#c62828;--accent:#1565c0}
*{box-sizing:border-box}body{font-family:"Segoe UI","Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif;margin:0;padding:24px;color:var(--fg);background:#fff;font-size:13px;line-height:1.45}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 8px;border-bottom:2px solid var(--line);padding-bottom:4px}h3{font-size:14px;margin:16px 0 6px}
.meta{color:var(--muted);margin-bottom:16px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.card{border:1px solid var(--line);border-radius:6px;padding:10px}.card .k{color:var(--muted);font-size:12px}.card .v{font-size:20px;font-weight:600}
.badge{display:inline-block;min-width:22px;text-align:center;border-radius:4px;color:#fff;font-weight:700;padding:0 6px}
.ok{color:var(--ok)}.bad{color:var(--bad)}.verdict{font-size:18px;font-weight:700;padding:8px 12px;border-radius:6px;display:inline-block;color:#fff}
table{border-collapse:collapse;width:100%;margin:6px 0 12px}td,th{border:1px solid var(--line);padding:4px 6px;text-align:left;vertical-align:top}th{background:var(--head)}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}.small{font-size:11px;color:var(--muted)}
svg{max-width:100%}
@page{size:A4;margin:14mm}
@media print{body{padding:0}h2{break-after:avoid}table,tr,.card{break-inside:avoid}a{color:inherit;text-decoration:none}}
`;

function page(title, lang, body, opts = {}) {
  const tr = t(lang);
  const when = opts.generatedAt || new Date().toISOString();
  return `<!doctype html><html lang="${lang === 'ko' ? 'ko' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body>
<h1>${esc(title)}</h1><div class="meta">${opts.project ? `${esc(tr.project)}: <strong>${esc(opts.project)}</strong> · ` : ''}${opts.branch ? `${esc(tr.branch)}: ${esc(opts.branch)} · ` : ''}${esc(tr.generated)}: ${esc(when.replace('T', ' ').slice(0, 19))}</div>
${body}
</body></html>`;
}

function badge(letter) {
  const l = typeof letter === 'number' ? LETTER[letter] : letter;
  return `<span class="badge" style="background:${RATING_COLOR[l] || '#78909c'}">${esc(l || '—')}</span>`;
}

function table(headers, rows, numeric = []) {
  const th = headers.map((h, n) => `<th${numeric.includes(n) ? ' class="n"' : ''}>${esc(h)}</th>`).join('');
  const body = rows.map((r) => `<tr>${r.map((c, n) => `<td${numeric.includes(n) ? ' class="n"' : ''}>${c && c.html != null ? c.html : esc(c)}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${th}</tr></thead><tbody>${body || `<tr><td colspan="${headers.length}" class="small">—</td></tr>`}</tbody></table>`;
}

function card(k, v) { return `<div class="card"><div class="k">${esc(k)}</div><div class="v">${v}</div></div>`; }

/** Inline SVG line chart for a trend series [{at, value}] (no script, prints fine). */
function sparkline(points, opts = {}) {
  const vals = (points || []).filter((p) => p.value != null);
  const w = opts.width || 560; const h = opts.height || 120; const pad = 24;
  if (vals.length < 2) return '<div class="small">—</div>';
  const max = Math.max(...vals.map((p) => p.value), 1);
  const x = (n) => pad + (n * (w - pad * 2)) / (vals.length - 1);
  const y = (v) => h - pad - (v / max) * (h - pad * 2);
  const d = vals.map((p, n) => `${n ? 'L' : 'M'}${x(n).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const dots = vals.map((p, n) => `<circle cx="${x(n).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="2.5" fill="${opts.color || '#1565c0'}"><title>${esc(String(p.at).slice(0, 10))}: ${p.value}</title></circle>`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(opts.label || 'trend')}"><line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="#d3dae3"/><text x="${pad}" y="${pad - 8}" font-size="10" fill="#5b6876">${max}</text><path d="${d}" fill="none" stroke="${opts.color || '#1565c0'}" stroke-width="2"/>${dots}<text x="${pad}" y="${h - 6}" font-size="10" fill="#5b6876">${esc(String(vals[0].at).slice(0, 10))}</text><text x="${w - pad}" y="${h - 6}" font-size="10" fill="#5b6876" text-anchor="end">${esc(String(vals[vals.length - 1].at).slice(0, 10))}</text></svg>`;
}

function gateBlock(gate, lang) {
  const tr = t(lang);
  const g = gate || { status: 'NONE', conditions: [] };
  const color = g.status === 'OK' ? 'var(--ok)' : g.status === 'ERROR' ? 'var(--bad)' : '#78909c';
  const label = g.status === 'OK' ? tr.passed : g.status === 'ERROR' ? tr.failed : tr.none;
  const rows = (g.conditions || []).map((c) => [metricLabel(c.metric, lang), c.op, c.threshold, c.actual == null ? '—' : c.actual, { html: `<span class="${c.status === 'ERROR' ? 'bad' : 'ok'}">${esc(c.status)}</span>` }]);
  return `<div class="verdict" style="background:${color}">${esc(tr.gate)}: ${esc(label)}</div>${table([tr.metric, tr.operator, tr.threshold, tr.actual, tr.status], rows, [2, 3])}`;
}

/**
 * SBOM block from an SCA result { dependencies:[{name,version,license,ecosystem}], vulnerabilities:[{id,package,severity,fixedIn}], licenses:[{id,count,risk}] }.
 * Returns '' when no SCA result is given.
 */
function sbomSection(sca, lang = 'en') {
  if (!sca) return '';
  const tr = t(lang);
  const deps = sca.dependencies || [];
  const vulns = sca.vulnerabilities || [];
  const lic = sca.licenses && sca.licenses.length ? sca.licenses : Object.entries(countBy(deps, (d) => d.license || 'UNKNOWN')).map(([id, count]) => ({ id, count }));
  return `<h2>${esc(tr.sbom)}</h2><div class="grid">${card(tr.dependencies, deps.length)}${card(tr.vulnerabilities, vulns.length)}${card(tr.licenses, lic.length)}</div>
<h3>${esc(tr.vulnerabilities)}</h3>${table([tr.id, tr.pkg, tr.severity, tr.version], vulns.slice(0, 300).map((v) => [v.id || v.cve || '', v.package || v.name || '', v.severity || '', v.fixedIn || v.version || '']))}
<h3>${esc(tr.licenses)}</h3>${table([tr.license, tr.count], lic.map((l) => [l.id || l.name, l.count == null ? '' : l.count]), [1])}
<h3>${esc(tr.dependencies)}</h3>${table([tr.name, tr.version, tr.license], deps.slice(0, 1000).map((d) => [d.name, d.version || '', d.license || '']))}`;
}

function topRules(issues, catalog, lang, n = 10) {
  const rules = ruleIndex(catalog || []);
  const counts = countBy((issues || []).filter((i) => !isClosed(i)), (i) => i.rule);
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n).map(([key, count]) => [key, text(rules.get(key) && rules.get(key).name, lang), count]);
}

function hhmm(min) {
  const m = Number(min) || 0;
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  return h < 8 ? `${h}h ${m % 60}min` : `${Math.floor(h / 8)}d ${h % 8}h`;
}

/**
 * Executive summary (Sonar project PDF report style).
 * @param {object} analysis
 * @param {{lang?:string, project?:string, branch?:string, catalog?:object[], history?:object[], sca?:object, generatedAt?:string}} [opts]
 */
function executiveReport(analysis, opts = {}) {
  const lang = opts.lang || 'en';
  const tr = t(lang);
  const m = analysis.measures || {};
  const r = analysis.ratings || {};
  const rn = analysis.ratingsNew || {};
  const body = [];
  body.push(gateBlock(analysis.qualityGate, lang));
  body.push(`<h2>${esc(tr.overall)}</h2><div class="grid">
${card(tr.reliability, `${badge(r.reliability)} ${m.bugs ?? 0} ${esc(tr.bugs)}`)}
${card(tr.security, `${badge(r.security)} ${m.vulnerabilities ?? 0} ${esc(tr.vulnerabilities)}`)}
${card(tr.review, `${badge(r.securityReview)} ${m.security_hotspots ?? 0} ${esc(tr.hotspots)}`)}
${card(tr.maintainability, `${badge(r.maintainability)} ${m.code_smells ?? 0} ${esc(tr.smells)}`)}
${card(tr.debt, esc(hhmm(m.sqale_index)))}
${card(tr.coverage, m.coverage == null ? '—' : `${m.coverage}%`)}
${card(tr.duplications, `${m.duplicated_lines_density ?? 0}%`)}
${card(tr.ncloc, m.ncloc ?? 0)}</div>`);
  body.push(`<h2>${esc(tr.newCode)}</h2><div class="grid">
${card(tr.reliability, `${badge(rn.reliability || LETTER[m.new_reliability_rating])} ${m.new_bugs ?? 0}`)}
${card(tr.security, `${badge(rn.security || LETTER[m.new_security_rating])} ${m.new_vulnerabilities ?? 0}`)}
${card(tr.maintainability, `${badge(rn.maintainability || LETTER[m.new_maintainability_rating])} ${m.new_code_smells ?? 0}`)}
${card(tr.coverage, m.new_coverage == null ? '—' : `${m.new_coverage}%`)}
${card(tr.duplications, `${m.new_duplicated_lines_density ?? 0}%`)}</div>`);
  if (opts.history && opts.history.length > 1) {
    const h = opts.history.map((x) => ({ at: x.at, value: (x.measures || {}).bugs + (x.measures || {}).vulnerabilities + (x.measures || {}).code_smells }));
    body.push(`<h2>${esc(tr.trend)} — ${esc(tr.issues)}</h2>${sparkline(h, { label: tr.issues })}`);
  }
  body.push(`<h2>${esc(tr.topRules)}</h2>${table([tr.rule, tr.name, tr.count], topRules(analysis.issues, opts.catalog, lang), [2])}`);
  const bySev = countBy((analysis.issues || []).filter((i) => !isClosed(i)), (i) => `${i.type}|${i.severity}`);
  const sevRows = ['BUG', 'VULNERABILITY', 'CODE_SMELL', 'SECURITY_HOTSPOT'].map((ty) => [ty, ...['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'].map((s) => bySev[`${ty}|${s}`] || 0)]);
  body.push(`<h2>${esc(tr.severity)}</h2>${table([tr.type, 'BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'], sevRows, [1, 2, 3, 4, 5])}`);
  body.push(sbomSection(opts.sca, lang));
  return page(`${tr.executive}`, lang, body.join('\n'), opts);
}

/** CSV of the executive summary measures. */
function executiveCsv(analysis) {
  const m = analysis.measures || {};
  const rows = [['metric', 'value']];
  for (const [k, v] of Object.entries(m)) rows.push([k, v == null ? '' : v]);
  rows.push(['quality_gate', (analysis.qualityGate && analysis.qualityGate.status) || '']);
  return toCsvRows(rows);
}

function securityData(analysis, catalog, standardId, opts) {
  return compliance.report(analysis.issues || [], catalog || [], standardId, opts);
}

/**
 * Security report for one standard id (owasp2021, owasp2017, cweTop25_2024, cweTop25_2023, asvs4:2, pciDss40, pciDss321, stigAsdV5R3, sansTop25, certC, certCpp).
 */
function securityReport(analysis, catalog, standardId, opts = {}) {
  const lang = opts.lang || 'en';
  const tr = t(lang);
  const data = securityData(analysis, catalog, standardId, opts);
  let body = '';
  if (data.requirements) {
    body += `<div class="verdict" style="background:${data.compliant ? 'var(--ok)' : 'var(--bad)'}">${esc(data.title)}: ${esc(data.compliant ? tr.compliant : tr.notCompliant)} (${data.passed}/${data.requirements.length})</div>`;
    body += table([tr.requirement, tr.level, tr.name, 'CWE', tr.vulnerabilities, tr.hotspots, tr.status], data.requirements.map((r) => [r.id, `L${r.level}`, r.title, r.cwes.map((c) => `CWE-${c}`).join(' '), r.vulnerabilities, r.hotspots, { html: `<span class="${r.status === 'PASSED' ? 'ok' : 'bad'}">${esc(r.status)}</span>` }]), [4, 5]);
  } else if (data.rules) {
    body += `<div class="grid">${card(tr.checkedRules, data.checkedRules.length)}${card(tr.violatedRules, data.violatedRules)}${card(tr.issues, data.issues)}</div>`;
    body += table([tr.rule, tr.category, tr.total, tr.vulnerabilities, tr.bugs], data.rules.map((r) => [r.id, r.section, r.total, r.vulnerabilities, r.bugs]), [2, 3, 4]);
  } else {
    const rankCol = data.categories.some((c) => c.rank);
    body += `<div class="grid">${card(tr.vulnerabilities, data.totals.vulnerabilities)}${card(tr.hotspots, data.totals.hotspots)}${card(tr.bugs, data.totals.bugs)}${card(tr.rating, badge(data.totals.rating))}</div>`;
    const headers = [...(rankCol ? [tr.rank] : []), tr.category, tr.name, tr.vulnerabilities, tr.rating, tr.hotspots, tr.toReview, tr.bugs];
    const rows = data.categories.map((c) => [...(rankCol ? [c.rank] : []), c.id + (c.cat ? ` (${c.cat})` : ''), c.title, c.vulnerabilities, { html: badge(c.rating) }, c.hotspots, c.hotspotsToReview, c.bugs]);
    const off = rankCol ? 1 : 0;
    body += table(headers, rows, [off + 2, off + 4, off + 5, off + 6]);
    if (data.unmapped != null) body += `<p class="small">${esc(tr.unmapped)}: ${data.unmapped}</p>`;
  }
  const keys = new Set(data.categories ? data.categories.flatMap((c) => c.issueKeys) : data.requirements ? data.requirements.flatMap((r) => r.issueKeys) : (data.rules || []).flatMap((r) => r.issueKeys));
  const list = (analysis.issues || []).filter((i) => keys.has(i.key)).slice(0, 500);
  body += `<h2>${esc(tr.issues)}</h2>${table([tr.severity, tr.type, tr.rule, tr.file, tr.line, tr.message], list.map((i) => [i.severity, i.type, i.rule, i.file, i.line, text(i.message, lang)]), [4])}`;
  body += sbomSection(opts.sca, lang);
  return page(`${tr.securityReport} — ${data.title}`, lang, body, opts);
}

/** CSV of one security standard: category rows. */
function securityCsv(analysis, catalog, standardId, opts = {}) {
  const data = securityData(analysis, catalog, standardId, opts);
  if (data.requirements) return toCsvRows([['requirement', 'level', 'title', 'cwes', 'vulnerabilities', 'hotspots', 'bugs', 'status'], ...data.requirements.map((r) => [r.id, r.level, r.title, r.cwes.join(' '), r.vulnerabilities, r.hotspots, r.bugs, r.status])]);
  if (data.rules) return toCsvRows([['rule', 'section', 'total', 'vulnerabilities', 'bugs', 'code_smells'], ...data.rules.map((r) => [r.id, r.section, r.total, r.vulnerabilities, r.bugs, r.codeSmells])]);
  return toCsvRows([['category', 'title', 'vulnerabilities', 'rating', 'hotspots', 'hotspots_to_review', 'bugs'], ...data.categories.map((c) => [c.id, c.title, c.vulnerabilities, c.rating, c.hotspots, c.hotspotsToReview, c.bugs])]);
}

/**
 * MISRA compliance report (GCS, GEP, GRP, deviations, verdict).
 * @param {object} analysis
 * @param {object[]} catalog
 * @param {object} plan see compliance.misraCompliance
 */
function misraReport(analysis, catalog, plan = {}, opts = {}) {
  const lang = opts.lang || 'en';
  const tr = t(lang);
  const r = compliance.misraCompliance(analysis.issues || [], catalog || [], plan, opts);
  const yn = (b) => (b ? tr.yes : tr.no);
  let body = `<div class="verdict" style="background:${r.compliant ? 'var(--ok)' : 'var(--bad)'}">${esc(r.title)} — ${esc(r.compliant ? tr.compliant : tr.notCompliant)}</div>
<p class="small">${esc(r.framework)}</p>
<div class="grid">${Object.entries(r.summary).map(([k, v]) => card(k, v)).join('')}</div>
<h2>${esc(tr.gcs)}</h2>${table([tr.guideline, tr.orig, tr.eff, tr.status, tr.violations, tr.deviations], r.gcs.map((g) => [g.guideline, g.category, g.effectiveCategory, { html: `<span class="${g.status === 'Violations' ? 'bad' : g.status === 'Compliant' ? 'ok' : ''}">${esc(g.status)}</span>` }, g.violations, g.deviations]), [4, 5])}
<h2>${esc(tr.gep)}</h2>${table([tr.guideline, tr.eff, tr.decidable, tr.enforcement, tr.rule], r.gep.map((g) => [g.guideline, g.category, yn(g.decidable), g.enforcement, g.toolRules.join(', ')]))}
<h2>${esc(tr.grp)}</h2>${table([tr.guideline, tr.from, tr.to, tr.applied, tr.problems], r.grp.map((g) => [g.guideline, g.from || '—', g.to, yn(g.applied), g.reason]))}
<h2>${esc(tr.devs)}</h2>${table([tr.id, tr.guideline, tr.scope, tr.justification, tr.approver, tr.date, tr.count, tr.valid, tr.problems], r.deviations.map((d) => [d.id || '', d.rule, [].concat(d.scope || '**').join(', '), d.justification || '', d.approver || '', d.date || '', d.covers, yn(d.valid), d.problems.join(', ')]), [6])}`;
  if (r.reasons.length) body += `<h2>${esc(tr.verdict)}</h2>${table([tr.guideline, tr.problems, tr.count], r.reasons.map((x) => [x.guideline, x.reason, x.count == null ? '' : x.count]), [2])}`;
  return page(tr.misra, lang, body, opts);
}

/** CSV of the MISRA GCS (with enforcement columns). */
function misraCsv(analysis, catalog, plan = {}, opts = {}) {
  const r = compliance.misraCompliance(analysis.issues || [], catalog || [], plan, opts);
  return toCsvRows([['guideline', 'category', 'effective_category', 'status', 'violations', 'deviations', 'decidable', 'enforcement', 'tool_rules'],
    ...r.guidelines.map((g) => [g.guideline, g.category, g.effectiveCategory, g.status, g.violations, g.deviations, g.decidable, g.enforcement, g.toolRules.join(' ')])]);
}

function integrityData(analysis, opts = {}) {
  const issues = (analysis.issues || []).filter((i) => i.cid || i.checker);
  const live = issues.filter((i) => !(i.coverityStatus === 'Dismissed' || i.classification === 'False Positive' || i.classification === 'Intentional' || i.action === 'Ignore'));
  const ncloc = (analysis.measures && analysis.measures.ncloc) || 0;
  const kloc = ncloc / 1000;
  const impact = { High: 0, Medium: 0, Low: 0 };
  for (const i of live) impact[i.impact || 'Medium'] = (impact[i.impact || 'Medium'] || 0) + 1;
  const group = (fn) => Object.entries(countBy(live, fn)).map(([k, v]) => {
    const sub = live.filter((i) => fn(i) === k);
    return { name: k, outstanding: v, high: sub.filter((i) => i.impact === 'High').length, medium: sub.filter((i) => i.impact === 'Medium').length, low: sub.filter((i) => i.impact === 'Low').length };
  }).sort((a, b) => b.outstanding - a.outstanding);
  const target = opts.targetDensity == null ? 1.0 : opts.targetDensity;
  const density = kloc ? Math.round((live.length / kloc) * 100) / 100 : 0;
  const highDensity = kloc ? Math.round((impact.High / kloc) * 100) / 100 : 0;
  const cov = analysis.coverity || {};
  return {
    ncloc, kloc: Math.round(kloc * 100) / 100, outstanding: live.length, dismissed: issues.length - live.length, impact, density, highDensity,
    target, meetsTarget: density <= target, byComponent: group((i) => i.component || 'Other'), byChecker: group((i) => i.checker || i.rule),
    newlyDetected: cov.newlyDetected || 0, fixed: cov.fixed || 0, snapshot: cov.snapshot || null,
    trend: (opts.history || []).map((h) => ({ at: h.at, snapshot: h.coverity && h.coverity.snapshot, outstanding: h.coverity ? h.coverity.outstanding : null, high: h.coverity ? h.coverity.outstandingHigh : null, density: h.coverity && h.measures && h.measures.ncloc ? Math.round((h.coverity.outstanding / (h.measures.ncloc / 1000)) * 100) / 100 : null })),
  };
}

/**
 * Coverity-style Integrity report.
 * @param {object} analysis
 * @param {{lang?:string, history?:object[], targetDensity?:number, project?:string, branch?:string}} [opts]
 */
function integrityReport(analysis, opts = {}) {
  const lang = opts.lang || 'en';
  const tr = t(lang);
  const d = integrityData(analysis, opts);
  const body = `<div class="verdict" style="background:${d.meetsTarget ? 'var(--ok)' : 'var(--bad)'}">${esc(tr.density)}: ${d.density} (≤ ${d.target})</div>
<div class="grid">${card(tr.outstanding, d.outstanding)}${card(tr.high, d.impact.High)}${card(tr.medium, d.impact.Medium)}${card(tr.low, d.impact.Low)}${card(tr.dismissed, d.dismissed)}${card(tr.newly, d.newlyDetected)}${card(tr.fixed, d.fixed)}${card('KLOC', d.kloc)}</div>
<h2>${esc(tr.byComponent)}</h2>${table([tr.component, tr.outstanding, tr.high, tr.medium, tr.low], d.byComponent.map((r) => [r.name, r.outstanding, r.high, r.medium, r.low]), [1, 2, 3, 4])}
<h2>${esc(tr.byChecker)}</h2>${table([tr.checker, tr.outstanding, tr.high, tr.medium, tr.low], d.byChecker.map((r) => [r.name, r.outstanding, r.high, r.medium, r.low]), [1, 2, 3, 4])}
<h2>${esc(tr.trend)}</h2>${sparkline(d.trend.map((p) => ({ at: p.at, value: p.outstanding })), { label: tr.outstanding, color: '#c62828' })}
${table([tr.snapshot, tr.date, tr.outstanding, tr.high, tr.density], d.trend.map((p) => [p.snapshot || '', String(p.at || '').slice(0, 10), p.outstanding ?? '', p.high ?? '', p.density ?? '']), [2, 3, 4])}
${sbomSection(opts.sca, lang)}`;
  return page(tr.integrity, lang, body, opts);
}

/** CSV of the integrity report (by component and by checker). */
function integrityCsv(analysis, opts = {}) {
  const d = integrityData(analysis, opts);
  return toCsvRows([['group', 'name', 'outstanding', 'high', 'medium', 'low'],
    ...d.byComponent.map((r) => ['component', r.name, r.outstanding, r.high, r.medium, r.low]),
    ...d.byChecker.map((r) => ['checker', r.name, r.outstanding, r.high, r.medium, r.low]),
    ['total', 'density_per_kloc', d.density, d.impact.High, d.impact.Medium, d.impact.Low]]);
}

/**
 * CWE weight: CWE Top 25 2024 rank 1 = 25 ... rank 25 = 1, other CWEs 0.5; multiplied by impact (High 3, Medium 2, Low 1).
 */
function cweWeight(cwe) {
  const rank = compliance.CWE_TOP25_2024.indexOf(cwe);
  return rank >= 0 ? 25 - rank : 0.5;
}

function covSecurityData(analysis, catalog) {
  const rules = ruleIndex(catalog || []);
  const impactMul = { High: 3, Medium: 2, Low: 1 };
  const rows = new Map();
  let score = 0;
  for (const i of (analysis.issues || []).filter((x) => !isClosed(x) && (x.type === 'VULNERABILITY' || x.kind === 'Security' || x.type === 'SECURITY_HOTSPOT' || x.cwe))) {
    const cwes = cwesOf(i, rules.get(i.rule));
    if (!cwes.length) continue;
    const mul = impactMul[i.impact || ({ BLOCKER: 'High', CRITICAL: 'High', MAJOR: 'Medium' }[i.severity] || 'Low')];
    for (const c of cwes) {
      const w = cweWeight(c);
      const r = rows.get(c) || { cwe: `CWE-${c}`, name: compliance.CWE_NAMES[c] || '', weight: w, count: 0, score: 0 };
      r.count += 1; r.score += w * mul; score += w * mul;
      rows.set(c, r);
    }
  }
  const kloc = Math.max(((analysis.measures && analysis.measures.ncloc) || 0) / 1000, 1);
  const perKloc = score / kloc;
  const level = perKloc === 0 ? 'A' : perKloc < 5 ? 'B' : perKloc < 20 ? 'C' : perKloc < 50 ? 'D' : 'E';
  return { score: Math.round(score * 10) / 10, perKloc: Math.round(perKloc * 10) / 10, level, rows: [...rows.values()].sort((a, b) => b.score - a.score) };
}

/** Coverity-style Security report with CWE weighting. */
function coveritySecurityReport(analysis, catalog, opts = {}) {
  const lang = opts.lang || 'en';
  const tr = t(lang);
  const d = covSecurityData(analysis, catalog);
  const body = `<div class="grid">${card(tr.secScore, d.score)}${card(`${tr.score} / KLOC`, d.perKloc)}${card(tr.level, badge(d.level))}</div>
<p class="small">${esc(lang === 'ko' ? '가중치: CWE Top 25(2024) 1위 25점 … 25위 1점, 그 밖의 CWE 0.5점, 영향 높음×3 · 중간×2 · 낮음×1' : 'Weight: CWE Top 25 (2024) rank 1 = 25 … rank 25 = 1, other CWEs 0.5; impact High ×3, Medium ×2, Low ×1')}</p>
${table([tr.cwe, tr.name, tr.weight, tr.count, tr.score], d.rows.map((r) => [r.cwe, r.name, r.weight, r.count, Math.round(r.score * 10) / 10]), [2, 3, 4])}
${sbomSection(opts.sca, lang)}`;
  return page(tr.covSecurity, lang, body, opts);
}

/** CSV of the CWE-weighted security report. */
function coveritySecurityCsv(analysis, catalog) {
  const d = covSecurityData(analysis, catalog);
  return toCsvRows([['cwe', 'name', 'weight', 'count', 'score'], ...d.rows.map((r) => [r.cwe, r.name, r.weight, r.count, Math.round(r.score * 10) / 10]), ['total', '', '', '', d.score]]);
}

/**
 * Rule sets for the Sparrow-style report: a predicate over catalog rules.
 * Built in: 'cwe', 'owasp2021', 'cert', 'misraC2012', 'misraC2023', 'misraCpp2023', 'cweTop25', 'security', 'all'.
 * A custom set is { id, name, rules: [ruleKey] } or { id, name, tags: [tag] }.
 */
function ruleSetMembers(catalog, set) {
  const rules = [...ruleIndex(catalog || []).values()];
  if (set && typeof set === 'object') {
    if (set.rules) return rules.filter((r) => set.rules.includes(r.key));
    if (set.tags) return rules.filter((r) => (r.tags || []).some((tg) => set.tags.includes(tg)));
  }
  const id = typeof set === 'string' ? set : 'all';
  const std = (r) => r.standards || {};
  const pick = {
    all: () => true,
    security: (r) => r.type === 'VULNERABILITY' || r.type === 'SECURITY_HOTSPOT',
    cwe: (r) => cwesOf(null, r).length > 0,
    cweTop25: (r) => std(r).cweTop25 === true || cwesOf(null, r).some((c) => compliance.CWE_TOP25_2024.includes(c)),
    owasp2021: (r) => (std(r).owasp2021 || []).length > 0 || cwesOf(null, r).some((c) => Object.values(compliance.OWASP_2021).some((x) => x.cwes.includes(c))),
    cert: (r) => !!(std(r).certC || std(r).certCpp || r.cert),
    misraC2012: (r) => !!std(r).misraC2012,
    misraC2023: (r) => !!std(r).misraC2023,
    misraCpp2023: (r) => !!std(r).misraCpp2023,
  }[id] || (() => true);
  return rules.filter(pick);
}

function sparrowData(analysis, catalog, set, opts = {}) {
  const members = ruleSetMembers(catalog, set);
  const inactive = new Set(opts.inactive || []);
  const counts = countBy((analysis.issues || []).filter((i) => !isClosed(i)), (i) => i.rule);
  const rows = members.map((r) => ({
    key: r.key, name: r.name, severity: r.severity, type: r.type, checked: !inactive.has(r.key), violations: counts[r.key] || 0,
    ref: (r.standards && (r.standards.misraC2012 || r.standards.misraC2023 || r.standards.misraCpp2023 || r.standards.certC || r.standards.certCpp)) || r.cwe || r.cert || '',
  }));
  const checked = rows.filter((r) => r.checked);
  const violated = checked.filter((r) => r.violations > 0);
  return {
    set: typeof set === 'string' ? set : (set && (set.name || set.id)) || 'custom',
    rules: rows, checked: checked.length, violated: violated.length,
    complianceRate: checked.length ? Math.round(((checked.length - violated.length) / checked.length) * 1000) / 10 : 100,
    violations: violated.reduce((n, r) => n + r.violations, 0),
  };
}

/** Sparrow-style rule-set compliance report. */
function sparrowReport(analysis, catalog, set = 'all', opts = {}) {
  const lang = opts.lang || 'en';
  const tr = t(lang);
  const d = sparrowData(analysis, catalog, set, opts);
  const body = `<div class="grid">${card(tr.ruleSet, esc(d.set))}${card(tr.checkedRules, d.checked)}${card(tr.violatedRules, d.violated)}${card(tr.violations, d.violations)}${card(tr.complianceRate, `${d.complianceRate}%`)}</div>
${table([tr.rule, tr.name, tr.category, tr.severity, tr.violations, tr.status], d.rules.map((r) => [r.key, text(r.name, lang), r.ref, r.severity, r.violations, { html: !r.checked ? '<span class="small">—</span>' : r.violations ? `<span class="bad">${esc(tr.violations)}</span>` : `<span class="ok">${esc(tr.compliant)}</span>` }]), [4])}
${sbomSection(opts.sca, lang)}`;
  return page(tr.sparrow, lang, body, opts);
}

/** CSV of the Sparrow-style rule-set report. */
function sparrowCsv(analysis, catalog, set = 'all', opts = {}) {
  const d = sparrowData(analysis, catalog, set, opts);
  return toCsvRows([['rule', 'name', 'reference', 'severity', 'checked', 'violations'], ...d.rules.map((r) => [r.key, text(r.name, opts.lang || 'en'), r.ref, r.severity, r.checked, r.violations])]);
}

/** SBOM CSV (dependencies with license and known vulnerability ids). */
function sbomCsv(sca) {
  const vulnsBy = {};
  for (const v of (sca && sca.vulnerabilities) || []) (vulnsBy[v.package || v.name] = vulnsBy[v.package || v.name] || []).push(v.id || v.cve);
  return toCsvRows([['name', 'version', 'license', 'ecosystem', 'vulnerabilities'], ...((sca && sca.dependencies) || []).map((d) => [d.name, d.version || '', d.license || '', d.ecosystem || '', (vulnsBy[d.name] || []).join(' ')])]);
}

/**
 * One entry point: kind = executive | security | misra | integrity | coverity-security | sparrow | sbom.
 * @returns {{html:string, csv:string, fileName:string}}
 */
function build(kind, analysis, opts = {}) {
  const catalog = opts.catalog || [];
  const stamp = new Date().toISOString().slice(0, 10);
  switch (kind) {
    case 'executive': return { html: executiveReport(analysis, opts), csv: executiveCsv(analysis), fileName: `executive-${stamp}` };
    case 'security': return { html: securityReport(analysis, catalog, opts.standard || 'owasp2021', opts), csv: securityCsv(analysis, catalog, opts.standard || 'owasp2021', opts), fileName: `security-${opts.standard || 'owasp2021'}-${stamp}`.replace(/:/g, '-') };
    case 'misra': return { html: misraReport(analysis, catalog, opts.plan || {}, opts), csv: misraCsv(analysis, catalog, opts.plan || {}, opts), fileName: `misra-${(opts.plan && opts.plan.standard) || 'misraC2012'}-${stamp}` };
    case 'integrity': return { html: integrityReport(analysis, opts), csv: integrityCsv(analysis, opts), fileName: `integrity-${stamp}` };
    case 'coverity-security': return { html: coveritySecurityReport(analysis, catalog, opts), csv: coveritySecurityCsv(analysis, catalog), fileName: `cwe-security-${stamp}` };
    case 'sparrow': return { html: sparrowReport(analysis, catalog, opts.ruleSet || 'all', opts), csv: sparrowCsv(analysis, catalog, opts.ruleSet || 'all', opts), fileName: `ruleset-${stamp}` };
    case 'sbom': return { html: page(t(opts.lang).sbom, opts.lang || 'en', sbomSection(opts.sca || {}, opts.lang), opts), csv: sbomCsv(opts.sca || {}), fileName: `sbom-${stamp}` };
    default: throw new Error(`Unknown report kind: ${kind}`);
  }
}

module.exports = {
  REPORT_KINDS: ['executive', 'security', 'misra', 'integrity', 'coverity-security', 'sparrow', 'sbom'],
  executiveReport, executiveCsv, securityReport, securityCsv, misraReport, misraCsv, integrityReport, integrityCsv,
  coveritySecurityReport, coveritySecurityCsv, cweWeight, sparrowReport, sparrowCsv, ruleSetMembers, sbomSection, sbomCsv, sparkline, build,
};
