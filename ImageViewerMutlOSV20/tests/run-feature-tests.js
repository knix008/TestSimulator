/**
 * Load every file in tests/cases/ and run it.
 *   npm test
 * Writes tests/results.json and tests/results.html
 */
'use strict';

const fs = require('fs');
const path = require('path');
const h = require('./helpers');

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

const CASE_DIR = path.join(__dirname, 'cases');
const results = [];
let currentSuite = '';
const runStarted = process.hrtime.bigint();

function nsToMs(ns) {
  return Number(ns) / 1e6;
}

function test(name, fn) {
  const started = process.hrtime.bigint();
  try {
    fn();
    results.push({ suite: currentSuite, name, ok: true, ms: nsToMs(process.hrtime.bigint() - started) });
  } catch (err) {
    results.push({
      suite: currentSuite,
      name,
      ok: false,
      ms: nsToMs(process.hrtime.bigint() - started),
      error: err && err.message ? err.message : String(err),
    });
  }
}

function each(items, titleFn, fn) {
  for (const item of items) {
    test(typeof titleFn === 'function' ? titleFn(item) : `${titleFn}: ${item}`, () => fn(item));
  }
}

const src = h.loadSources();
const files = fs.readdirSync(CASE_DIR).filter((f) => f.endsWith('.js')).sort();
if (!files.length) throw new Error('tests/cases is empty — add *.js test files');

for (const file of files) {
  const mod = require(path.join(CASE_DIR, file));
  if (!mod || typeof mod.run !== 'function') {
    throw new Error(`${file} must export { name, run }`);
  }
  currentSuite = mod.name || file;
  mod.run({ test, each, src, h });
}

const totalMs = nsToMs(process.hrtime.bigint() - runStarted);
const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;
const SUITE_ORDER = [
  'File & navigation',
  'Menus & shortcuts',
  'Print',
  'Edit window',
  'Effects',
  'Formats & samples',
  'DICOM & media',
  'Folder drives & viewer chrome',
  'Status, i18n, theme',
  'IPC & packaging',
];
const suites = [...new Set(results.map((r) => r.suite))]
  .sort((a, b) => {
    const ia = SUITE_ORDER.indexOf(a);
    const ib = SUITE_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
const bySuite = suites.map((name) => {
  const items = results.filter((r) => r.suite === name);
  return {
    name,
    passed: items.filter((r) => r.ok).length,
    failed: items.filter((r) => !r.ok).length,
    total: items.length,
    ms: items.reduce((sum, t) => sum + t.ms, 0),
    items,
  };
});

const avgMs = results.length ? totalMs / results.length : 0;
const slowest = [...results].sort((a, b) => b.ms - a.ms).slice(0, 8);

const summary = {
  generatedAt: new Date().toISOString(),
  version: src.pkg.version,
  casesDir: 'tests/cases',
  caseFiles: files,
  total: results.length,
  passed,
  failed,
  totalMs,
  avgMs,
  suites: bySuite,
};

fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(summary, null, 2));

function esc(s) {
  return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const suiteColors = {
  'File & navigation': '#3b82f6',
  Print: '#8b5cf6',
  'Edit window': '#ec4899',
  Effects: '#f59e0b',
  'Formats & samples': '#14b8a6',
  'Status, i18n, theme': '#06b6d4',
  'IPC & packaging': '#6366f1',
  'Folder drives & viewer chrome': '#84cc16',
  'Menus & shortcuts': '#f97316',
  'DICOM & media': '#22c55e',
};

const toc = bySuite.map((s, i) => {
  const color = suiteColors[s.name] || '#64748b';
  return `<a href="#s${i}" style="--c:${color}"><b>${esc(s.name)}</b><span>${s.passed}/${s.total}</span><em>${h.fmtMs(s.ms)}</em></a>`;
}).join('');

const slowRows = slowest.map((t) => `
  <tr class="${t.ok ? 'ok' : 'bad'}">
    <td class="ms">${h.fmtMs(t.ms)}</td>
    <td>${esc(t.suite)}</td>
    <td>${esc(t.name)}</td>
  </tr>`).join('');

const rows = bySuite.map((s, i) => {
  const color = suiteColors[s.name] || '#64748b';
  const compact = s.total >= 40;
  const tests = s.items.map((t) => compact
    ? `<span class="chip ${t.ok ? 'ok' : 'bad'}" title="${esc(t.name)} · ${h.fmtMs(t.ms)}${t.error ? ' · ' + t.error : ''}">
        <i></i>${esc(t.name)}<em>${h.fmtMs(t.ms)}</em>
      </span>`
    : `<div class="row ${t.ok ? 'ok' : 'bad'}">
        <span class="dot"></span>
        <span class="name">${esc(t.name)}</span>
        <span class="ms">${h.fmtMs(t.ms)}</span>
        ${t.ok ? '<span class="tag pass">PASS</span>' : '<span class="tag fail">FAIL</span>'}
        ${t.error ? `<div class="err">${esc(t.error)}</div>` : ''}
      </div>`).join('');
  const pct = Math.round((s.passed / s.total) * 100);
  return `
    <section class="suite ${compact ? 'wide' : ''}" id="s${i}" style="--c:${color}">
      <header>
        <h2>${esc(s.name)}</h2>
        <div class="meta">${s.passed}/${s.total} 통과 · ${h.fmtMs(s.ms)}</div>
      </header>
      <div class="bar"><i style="width:${pct}%"></i></div>
      ${compact ? `<div class="chips">${tests}</div>` : tests}
    </section>`;
}).join('');

const fileList = files.map((f) => `<code>${esc(f)}</code>`).join(' · ');
const rate = results.length ? Math.round((passed / results.length) * 100) : 0;
const verbose = process.argv.includes('--verbose') || process.env.VERBOSE === '1';

const htmlReport = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><title>Image Viewer 기능 테스트</title>
<style>
  :root { font-family: "Segoe UI", system-ui, sans-serif; }
  body { margin: 0; background: #0f172a; color: #e2e8f0; }
  .hero { padding: 28px 32px 20px; background: #1e293b; border-bottom: 3px solid #22c55e; }
  h1 { margin: 0 0 8px; font-size: 26px; color: #f8fafc; }
  .sub { color: #94a3b8; font-size: 13px; }
  .files { margin-top: 10px; color: #93c5fd; font-size: 12px; }
  .files code { background: #334155; padding: 1px 6px; border-radius: 4px; color: #bfdbfe; }
  .stats { display: flex; gap: 12px; margin-top: 16px; flex-wrap: wrap; }
  .stat { min-width: 110px; padding: 12px 16px; border-radius: 10px; }
  .stat b { display: block; font-size: 26px; line-height: 1.1; }
  .stat span { font-size: 12px; opacity: .85; }
  .s-total { background: #334155; }
  .s-pass { background: #14532d; color: #86efac; }
  .s-fail { background: #7f1d1d; color: #fecaca; }
  .s-rate { background: #1e3a5f; color: #93c5fd; }
  .s-time { background: #3b0764; color: #e9d5ff; }
  .s-avg { background: #422006; color: #fde68a; }
  .toc { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
  .toc a { display: flex; gap: 8px; align-items: baseline; background: #0f172a; border-left: 3px solid var(--c); color: #e2e8f0; text-decoration: none; padding: 6px 10px; border-radius: 6px; font-size: 12px; }
  .toc b { color: var(--c); font-size: 12px; }
  .toc span, .toc em { color: #94a3b8; font-style: normal; }
  .slow { margin: 16px 28px 0; background: #1e293b; border-radius: 12px; padding: 14px 16px; }
  .slow h3 { margin: 0 0 8px; font-size: 13px; color: #fbbf24; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td { padding: 5px 8px; border-top: 1px solid #334155; }
  td.ms { color: #fbbf24; font-variant-numeric: tabular-nums; width: 90px; }
  main { padding: 20px 28px 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 1100px) { main { grid-template-columns: 1fr; } }
  .suite { background: #1e293b; border-radius: 12px; padding: 14px 16px 10px; border-left: 5px solid var(--c); }
  .suite.wide { grid-column: 1 / -1; }
  .suite header { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .suite h2 { margin: 0; font-size: 15px; color: var(--c); }
  .meta { font-size: 12px; color: #94a3b8; }
  .bar { height: 6px; background: #334155; border-radius: 3px; margin: 8px 0 10px; overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--c); }
  .row { display: grid; grid-template-columns: 12px 1fr auto auto; gap: 8px; align-items: start; padding: 6px 0; border-top: 1px solid #334155; font-size: 13px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; }
  .ok .dot, .chip.ok i { background: #22c55e; }
  .bad .dot, .chip.bad i { background: #ef4444; }
  .name { color: #e2e8f0; }
  .ms { color: #fbbf24; font-variant-numeric: tabular-nums; font-size: 12px; }
  .tag { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; }
  .pass { background: #166534; color: #bbf7d0; }
  .fail { background: #991b1b; color: #fecaca; }
  .err { grid-column: 2 / -1; color: #fca5a5; font-size: 12px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; background: #0f172a; border-radius: 999px; padding: 3px 8px 3px 6px; font-size: 11px; color: #cbd5e1; }
  .chip i { width: 7px; height: 7px; border-radius: 50%; }
  .chip em { color: #fbbf24; font-style: normal; font-variant-numeric: tabular-nums; }
</style></head>
<body>
  <div class="hero">
    <h1>Image Viewer ${esc(src.pkg.version)} 기능 테스트</h1>
    <div class="sub">${esc(summary.generatedAt)} · ${results.length} cases · tests/cases</div>
    <div class="files">${fileList}</div>
    <div class="stats">
      <div class="stat s-total"><b>${results.length}</b><span>전체</span></div>
      <div class="stat s-pass"><b>${passed}</b><span>통과</span></div>
      <div class="stat s-fail"><b>${failed}</b><span>실패</span></div>
      <div class="stat s-rate"><b>${rate}%</b><span>성공률</span></div>
      <div class="stat s-time"><b>${h.fmtMs(totalMs)}</b><span>총 실행 시간</span></div>
      <div class="stat s-avg"><b>${h.fmtMs(avgMs)}</b><span>평균 / 케이스</span></div>
    </div>
    <nav class="toc">${toc}</nav>
  </div>
  <div class="slow">
    <h3>실행이 길었던 케이스</h3>
    <table>${slowRows}</table>
  </div>
  <main>${rows}</main>
</body></html>`;

fs.writeFileSync(path.join(__dirname, 'results.html'), htmlReport);

const nameW = Math.max(...bySuite.map((s) => s.name.length), 12);
console.log(`\n${C.bold}${C.cyan}Image Viewer ${src.pkg.version} feature tests${C.reset}`);
console.log(`${C.dim}${results.length} cases · ${bySuite.length} suites · ${h.fmtMs(totalMs)} · tests/cases${C.reset}\n`);
console.log(`${C.bold}  ${'Suite'.padEnd(nameW)}  ${'Pass'.padStart(7)}  ${'Fail'.padStart(4)}  ${'Time'.padStart(10)}${C.reset}`);
console.log(`${C.dim}  ${'─'.repeat(nameW + 27)}${C.reset}`);
for (const s of bySuite) {
  const color = s.failed ? C.yellow : C.green;
  console.log(
    `  ${C.bold}${color}${s.name.padEnd(nameW)}${C.reset}  ${String(`${s.passed}/${s.total}`).padStart(7)}  ${String(s.failed).padStart(4)}  ${C.magenta}${h.fmtMs(s.ms).padStart(10)}${C.reset}`
  );
}

if (verbose) {
  console.log('');
  for (const s of bySuite) {
    const color = s.failed ? C.yellow : C.green;
    console.log(`${C.bold}${color}▸ ${s.name}${C.reset}  ${s.passed}/${s.total}  ${C.magenta}${h.fmtMs(s.ms)}${C.reset}`);
    for (const t of s.items) {
      const mark = t.ok ? `${C.green}PASS${C.reset}` : `${C.red}FAIL${C.reset}`;
      const time = `${C.dim}${h.fmtMs(t.ms).padStart(8)}${C.reset}`;
      console.log(`  ${mark} ${time}  ${t.name}${t.error ? `  ${C.red}${t.error}${C.reset}` : ''}`);
    }
    console.log('');
  }
} else {
  const failedItems = results.filter((t) => !t.ok);
  if (failedItems.length) {
    console.log(`\n${C.bold}${C.red}Failed${C.reset}`);
    for (const t of failedItems) {
      console.log(`  ${C.red}FAIL${C.reset} ${C.dim}${h.fmtMs(t.ms).padStart(8)}${C.reset}  ${C.dim}${t.suite}${C.reset}  ${t.name}`);
      if (t.error) console.log(`         ${C.red}${t.error}${C.reset}`);
    }
  }
}

console.log(`\n${C.bold}${C.yellow}Slowest${C.reset}`);
for (const t of slowest.slice(0, 8)) {
  console.log(`  ${C.magenta}${h.fmtMs(t.ms).padStart(8)}${C.reset}  ${C.dim}${t.suite}${C.reset}  ${t.name}`);
}

console.log(`\n${C.bold}${failed ? C.red : C.green}${passed} passed, ${failed} failed, ${results.length} total (${rate}%)${C.reset}  ${C.magenta}${h.fmtMs(totalMs)}${C.reset}`);
console.log(`${C.dim}Report: tests/results.html${verbose ? '' : '  ·  npm test -- --verbose'}${C.reset}\n`);

process.exit(failed ? 1 : 0);
