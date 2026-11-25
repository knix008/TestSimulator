/**
 * Load every file in tests/cases/ and run it.
 *   npm test              list every case name, result, and time
 *   npm test -- --summary suite totals only
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

const pending = [];
const summaryOnly = process.argv.includes('--summary') || process.env.SUMMARY === '1';

/* Terminal cell width: only East Asian wide characters (Hangul, CJK, full-width forms,
   emoji) take two cells; dashes, arrows, ×, ▸ … take one; combining marks none. */
function charW(cp) {
  if ((cp >= 0x300 && cp <= 0x36f) || (cp >= 0x200b && cp <= 0x200f) || cp === 0xfe0f) return 0;
  if ((cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0x303e) || (cp >= 0x3041 && cp <= 0x33ff)
    || (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0xa960 && cp <= 0xa97f)
    || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f)
    || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff)
    || (cp >= 0x20000 && cp <= 0x3fffd)) return 2;
  return 1;
}
function cellW(s) {
  let w = 0;
  for (const ch of String(s)) w += charW(ch.codePointAt(0));
  return w;
}
function padEndW(s, w) {
  return String(s) + ' '.repeat(Math.max(0, w - cellW(s)));
}
function padStartW(s, w) {
  return ' '.repeat(Math.max(0, w - cellW(s))) + String(s);
}

/* Fixed columns, so every line lines up while results are still arriving */
const NUM_W = 4;          // case number inside its suite
const MARK_W = 4;         // PASS / FAIL
const TIME_W = 12;        // "12345.678 ms"
const FRAC_W = 9;         // "892/892"
const NAME_COL = 2 + NUM_W + 2 + MARK_W + 2 + TIME_W + 2;
let suiteNameW = 10;      // set once every case file is loaded
const firstLine = (s) => String(s || '').split(/\r?\n/)[0];
const markOf = (ok) => (ok ? `${C.green}PASS${C.reset}` : `${C.red}${C.bold}FAIL${C.reset}`);

/* Results are printed in order as soon as each one is known (an async case holds the
   ones after it until it settles). */
let flushed = 0;
let live = null;          // { name, n, passed, failed, ms } of the suite being printed
function endLiveSuite() {
  if (!live) return;
  if (summaryOnly) {
    const color = live.failed ? C.red : C.green;
    console.log(`  ${markOf(!live.failed)}  ${C.bold}${color}${padEndW(live.name, suiteNameW)}${C.reset}  ${padStartW(`${live.passed}/${live.n}`, FRAC_W)}  ${C.magenta}${padStartW(h.fmtMs(live.ms), TIME_W)}${C.reset}`);
  }
  live = null;
}
function printCase(t) {
  if (!live || live.name !== t.suite) {
    endLiveSuite();
    live = { name: t.suite, n: 0, passed: 0, failed: 0, ms: 0 };
    if (!summaryOnly) {
      const file = suiteFile[t.suite] ? `  ${C.dim}${suiteFile[t.suite]}${C.reset}` : '';
      console.log('');
      console.log(`${C.bold}${C.cyan}▸ ${t.suite}${C.reset}${file}`);
    }
  }
  live.n++;
  live.ms += t.ms;
  if (t.ok) live.passed++; else live.failed++;
  if (summaryOnly) return;
  const name = t.ok ? t.name : `${C.red}${t.name}${C.reset}`;
  console.log(`  ${C.dim}${padStartW(String(live.n), NUM_W)}${C.reset}  ${markOf(t.ok)}  ${C.magenta}${padStartW(h.fmtMs(t.ms), TIME_W)}${C.reset}  ${name}`);
  if (t.error) console.log(`${' '.repeat(NAME_COL)}${C.red}↳ ${firstLine(t.error)}${C.reset}`);
}
function flush() {
  while (flushed < results.length && results[flushed]) printCase(results[flushed++]);
}

function test(name, fn) {
  const index = results.length;
  results.push(null);
  const started = process.hrtime.bigint();
  const suite = currentSuite;
  const fill = (ok, error) => {
    results[index] = {
      n: index + 1,
      suite,
      name,
      ok,
      ms: nsToMs(process.hrtime.bigint() - started),
      ...(error ? { error: error && error.message ? error.message : String(error) } : {}),
    };
    flush();
  };
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      pending.push(result.then(() => fill(true), (err) => fill(false, err)));
      return;
    }
    fill(true);
  } catch (err) {
    fill(false, err);
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

const suiteFile = {};
const mods = files.map((file) => {
  const mod = require(path.join(CASE_DIR, file));
  if (!mod || typeof mod.run !== 'function') {
    throw new Error(`${file} must export { name, run }`);
  }
  const name = mod.name || file;
  suiteFile[name] = file;
  return { name, mod };
});
suiteNameW = Math.max(cellW('Suite'), cellW('Total'), ...mods.map((m) => cellW(m.name)));

console.log('');
console.log(`${C.bold}${C.cyan}MyImageViewer ${src.pkg.version} feature tests${C.reset}  ${C.dim}${files.length} case files${C.reset}`);
if (summaryOnly) {
  console.log(`  ${C.dim}${padEndW('', MARK_W)}  ${padEndW('Suite', suiteNameW)}  ${padStartW('Passed', FRAC_W)}  ${padStartW('Time', TIME_W)}${C.reset}`);
} else {
  console.log(`  ${C.dim}${padStartW('#', NUM_W)}  ${padEndW('Res', MARK_W)}  ${padStartW('Time', TIME_W)}  Test${C.reset}`);
}

for (const { name, mod } of mods) {
  currentSuite = name;
  mod.run({ test, each, src, h });
}

function report() {
flush();
endLiveSuite();
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
  'Behavior checks',
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
    file: suiteFile[name] || '',
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

const suiteSummaryRows = bySuite.map((s, i) => {
  const color = suiteColors[s.name] || '#64748b';
  return `<tr>
    <td class="suite-dot" style="--c:${color}"></td>
    <td><a href="#s${i}">${esc(s.name)}</a></td>
    <td class="file">${s.file ? `<code>${esc(s.file)}</code>` : ''}</td>
    <td class="num">${s.passed}/${s.total}</td>
    <td class="num">${s.failed}</td>
    <td class="ms">${h.fmtMs(s.ms)}</td>
  </tr>`;
}).join('');

const slowRows = slowest.map((t) => `
  <tr class="${t.ok ? 'ok' : 'bad'}">
    <td class="ms">${h.fmtMs(t.ms)}</td>
    <td>${esc(t.suite)}</td>
    <td>${esc(t.name)}</td>
  </tr>`).join('');

const rows = bySuite.map((s, i) => {
  const color = suiteColors[s.name] || '#64748b';
  const tests = s.items.map((t, j) => `
      <tr class="${t.ok ? 'ok' : 'bad'}">
        <td class="n">${j + 1}</td>
        <td>${t.ok ? '<span class="tag pass">PASS</span>' : '<span class="tag fail">FAIL</span>'}</td>
        <td class="name">${esc(t.name)}${t.error ? `<div class="err">${esc(t.error)}</div>` : ''}</td>
        <td class="ms">${h.fmtMs(t.ms)}</td>
      </tr>`).join('');
  const pct = Math.round((s.passed / s.total) * 100);
  return `
    <section class="suite" id="s${i}" style="--c:${color}">
      <header>
        <h2>${esc(s.name)}</h2>
        <div class="meta">${s.file ? `<code>${esc(s.file)}</code> · ` : ''}${s.passed}/${s.total} 통과 · ${h.fmtMs(s.ms)}</div>
      </header>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <table class="cases">
        <thead><tr><th>#</th><th>결과</th><th>테스트 내용</th><th class="ms">실행 시간</th></tr></thead>
        <tbody>${tests}</tbody>
      </table>
    </section>`;
}).join('');

const fileList = files.map((f) => `<code>${esc(f)}</code>`).join(' · ');
const rate = results.length ? Math.floor((passed / results.length) * 100) : 0;
const htmlReport = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><title>MyImageViewer 기능 테스트</title>
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
  .block { margin: 20px 28px 0; background: #1e293b; border-radius: 12px; padding: 16px 18px; }
  .block h2 { margin: 0 0 12px; font-size: 15px; color: #f8fafc; letter-spacing: 0.02em; }
  .block h3 { margin: 16px 0 8px; font-size: 13px; color: #fbbf24; }
  table.summary { width: 100%; border-collapse: collapse; font-size: 13px; }
  table.summary th { text-align: left; color: #94a3b8; font-size: 11px; font-weight: 600; padding: 6px 8px; border-bottom: 1px solid #475569; }
  table.summary td { padding: 7px 8px; border-top: 1px solid #334155; }
  table.summary td.suite-dot { width: 10px; padding-right: 0; }
  table.summary td.suite-dot::before { content: ''; display: block; width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
  table.summary td.file code { background: #334155; padding: 1px 6px; border-radius: 4px; color: #bfdbfe; font-size: 11px; }
  table.summary td.num { width: 80px; font-variant-numeric: tabular-nums; color: #cbd5e1; text-align: right; }
  table.summary th:nth-child(4),
  table.summary th:nth-child(5),
  table.summary th:nth-child(6) { text-align: right; }
  table.summary a { color: #e2e8f0; text-decoration: none; }
  table.summary a:hover { color: #93c5fd; }
  table.summary tfoot td { border-top: 2px solid #475569; font-weight: 600; color: #f8fafc; }
  table.slow { width: 100%; border-collapse: collapse; font-size: 13px; }
  table.slow td { padding: 5px 8px; border-top: 1px solid #334155; }
  td.ms, th.ms { color: #fbbf24; font-variant-numeric: tabular-nums; width: 96px; text-align: right; white-space: nowrap; }
  .details-head { margin: 28px 28px 0; padding-top: 8px; border-top: 1px solid #334155; }
  .details-head h2 { margin: 0; font-size: 15px; color: #f8fafc; }
  .details-head p { margin: 6px 0 0; font-size: 12px; color: #94a3b8; }
  main { padding: 16px 28px 40px; display: flex; flex-direction: column; gap: 16px; }
  .suite { background: #1e293b; border-radius: 12px; padding: 14px 16px 12px; border-left: 5px solid var(--c); }
  .suite header { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .suite h2 { margin: 0; font-size: 16px; color: var(--c); }
  .meta { font-size: 12px; color: #94a3b8; }
  .meta code { background: #334155; padding: 1px 6px; border-radius: 4px; color: #bfdbfe; }
  .bar { height: 6px; background: #334155; border-radius: 3px; margin: 8px 0 10px; overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--c); }
  table.cases { width: 100%; border-collapse: collapse; font-size: 13px; }
  table.cases th { text-align: left; color: #94a3b8; font-size: 11px; font-weight: 600; padding: 6px 8px; border-bottom: 1px solid #475569; }
  table.cases td { padding: 6px 8px; border-top: 1px solid #334155; vertical-align: top; }
  table.cases td.n { width: 44px; color: #64748b; font-variant-numeric: tabular-nums; }
  table.cases th.ms { text-align: right; }
  table.cases td.ms { width: 96px; color: #fbbf24; font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
  table.cases td.name { color: #e2e8f0; }
  table.cases tr.bad td.name { color: #fecaca; }
  .name { color: #e2e8f0; }
  .ms { color: #fbbf24; font-variant-numeric: tabular-nums; font-size: 12px; }
  .tag { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; }
  .pass { background: #166534; color: #bbf7d0; }
  .fail { background: #991b1b; color: #fecaca; }
  .err { margin-top: 4px; color: #fca5a5; font-size: 12px; }
</style></head>
<body>
  <div class="hero">
    <h1>MyImageViewer ${esc(src.pkg.version)} 기능 테스트</h1>
    <div class="sub">${esc(summary.generatedAt)} · tests/cases</div>
    <div class="files">${fileList}</div>
    <div class="stats">
      <div class="stat s-total"><b>${results.length}</b><span>전체</span></div>
      <div class="stat s-pass"><b>${passed}</b><span>통과</span></div>
      <div class="stat s-fail"><b>${failed}</b><span>실패</span></div>
      <div class="stat s-rate"><b>${rate}%</b><span>성공률</span></div>
      <div class="stat s-time"><b>${h.fmtMs(totalMs)}</b><span>총 실행 시간</span></div>
      <div class="stat s-avg"><b>${h.fmtMs(avgMs)}</b><span>평균 / 케이스</span></div>
    </div>
  </div>
  <section class="block" id="summary">
    <h2>요약</h2>
    <table class="summary">
      <thead><tr><th></th><th>스위트</th><th>파일</th><th>통과</th><th>실패</th><th>시간</th></tr></thead>
      <tbody>${suiteSummaryRows}</tbody>
      <tfoot><tr>
        <td></td><td>합계</td><td></td>
        <td class="num">${passed}/${results.length}</td>
        <td class="num">${failed}</td>
        <td class="ms">${h.fmtMs(totalMs)}</td>
      </tr></tfoot>
    </table>
    <h3>실행이 길었던 케이스</h3>
    <table class="slow">${slowRows}</table>
  </section>
  <div class="details-head" id="details">
    <h2>상세</h2>
    <p>스위트별 테스트 내용 · 결과 · 각 케이스 실행 시간</p>
  </div>
  <main>${rows}</main>
</body></html>`;

fs.writeFileSync(path.join(__dirname, 'results.html'), htmlReport);

/* Console summary: every table in fixed, measured columns */
const fileW = Math.max(cellW('File'), ...bySuite.map((s) => cellW(s.file || '')));
const FAIL_W = 6;
const colW = 2 + suiteNameW + 2 + fileW + 2 + FRAC_W + 2 + FAIL_W + 2 + TIME_W;
const line = (ch) => `${C.dim}${ch.repeat(colW)}${C.reset}`;
const rule = () => console.log(`${C.dim}  ${'─'.repeat(colW - 2)}${C.reset}`);
const failedItems = results.filter((t) => !t.ok);
const row = (name, file, frac, nFail, ms, color) => console.log(
  `  ${C.bold}${color}${padEndW(name, suiteNameW)}${C.reset}  ${C.dim}${padEndW(file, fileW)}${C.reset}  ${padStartW(frac, FRAC_W)}  ${nFail ? C.red : ''}${padStartW(String(nFail), FAIL_W)}${C.reset}  ${C.magenta}${padStartW(h.fmtMs(ms), TIME_W)}${C.reset}`
);

console.log('');
console.log(line('═'));
console.log(`${C.bold}  Summary${C.reset}  ${C.dim}${results.length} tests · ${bySuite.length} suites · ${rate}% passed · ${h.fmtMs(totalMs)}${C.reset}`);
console.log(line('─'));
console.log(`${C.bold}  ${padEndW('Suite', suiteNameW)}  ${padEndW('File', fileW)}  ${padStartW('Passed', FRAC_W)}  ${padStartW('Failed', FAIL_W)}  ${padStartW('Time', TIME_W)}${C.reset}`);
rule();
for (const s of bySuite) row(s.name, s.file || '', `${s.passed}/${s.total}`, s.failed, s.ms, s.failed ? C.red : C.green);
rule();
row('Total', '', `${passed}/${results.length}`, failed, totalMs, failed ? C.red : C.cyan);

if (failedItems.length) {
  console.log('');
  console.log(`${C.bold}${C.red}  Failed${C.reset}`);
  for (const t of failedItems) {
    console.log(`  ${C.red}FAIL${C.reset}  ${C.magenta}${padStartW(h.fmtMs(t.ms), TIME_W)}${C.reset}  ${C.dim}${padEndW(t.suite, suiteNameW)}${C.reset}  ${t.name}`);
    if (t.error) console.log(`  ${' '.repeat(MARK_W + 2 + TIME_W + 2 + suiteNameW + 2)}${C.red}↳ ${firstLine(t.error)}${C.reset}`);
  }
}

console.log('');
console.log(`${C.bold}${C.yellow}  Slowest${C.reset}`);
for (const t of slowest.slice(0, 8)) {
  console.log(`  ${markOf(t.ok)}  ${C.magenta}${padStartW(h.fmtMs(t.ms), TIME_W)}${C.reset}  ${C.dim}${padEndW(t.suite, suiteNameW)}${C.reset}  ${t.name}`);
}

console.log('');
console.log(line('═'));
console.log(`${C.bold}${failed ? C.red : C.green}${passed} passed, ${failed} failed, ${results.length} total (${rate}%)${C.reset}  ${C.magenta}${h.fmtMs(totalMs)}${C.reset}`);
console.log(`${C.dim}Report: tests/results.html${summaryOnly ? '' : '  ·  npm test -- --summary'}${C.reset}\n`);

process.exit(failed ? 1 : 0);
}

Promise.all(pending).then(report, (err) => {
  console.error(err);
  process.exit(1);
});
