// node --test reporter. For every test file: a coloured header, then one row
// per test in aligned columns (status, number, name, time). Then a summary
// table with per-file results and a pass bar, the totals and the failures.
// English only. The same text without colours goes to test/last-report.txt.
// Colours: on a terminal, or with FORCE_COLOR; NO_COLOR turns them off.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const useColor = !process.env.NO_COLOR && (process.stdout.isTTY || !!process.env.FORCE_COLOR);
const sgr = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const c = {
  green: sgr('32'), red: sgr('31'), yellow: sgr('33'), blue: sgr('34'), magenta: sgr('35'), cyan: sgr('36'),
  gray: sgr('90'), bold: sgr('1'), dim: sgr('2'),
  head: sgr('1;97;44'), ok: sgr('1;30;42'), bad: sgr('1;97;41'), warn: sgr('1;30;43'),
};

const plain = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '');
// Visible width: East Asian wide characters take two columns.
const width = (s) => [...plain(s)].reduce((n, ch) => n + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 2 : 1), 0);
const padEnd = (s, n) => `${s}${' '.repeat(Math.max(0, n - width(s)))}`;
const padStart = (s, n) => `${' '.repeat(Math.max(0, n - width(s)))}${s}`;
function fit(s, n) {
  if (width(s) <= n) return padEnd(s, n);
  let out = '';
  for (const ch of String(s)) {
    if (width(out + ch) > n - 1) break;
    out += ch;
  }
  return padEnd(`${out}…`, n);
}

const fmtTime = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);
const timeColor = (ms) => (ms >= 1000 ? c.red : ms >= 200 ? c.yellow : c.gray);
const cols = () => Math.max(80, Math.min(140, (process.stdout.columns || Number(process.env.COLUMNS) || 120) - 1));

// Pass bar: green = passed, red = failed (at least one cell), yellow = skipped.
function bar(pass, fail, skip, size) {
  const total = pass + fail + skip;
  if (!total) return c.gray('░'.repeat(size));
  const f = fail ? Math.max(1, Math.round((fail / total) * size)) : 0;
  const s = skip ? Math.max(1, Math.round((skip / total) * size)) : 0;
  const p = Math.max(0, size - f - s);
  const part = (paint, n) => (n ? paint('█'.repeat(n)) : '');
  return part(c.green, p) + part(c.red, f) + part(c.yellow, s);
}

// How many test files this run has: the files named on the command line, else
// every *.test.mjs next to this reporter (npm test passes a glob).
function fileCount() {
  const named = process.argv.slice(1).filter((a) => /\.test\.m?js$/.test(a) && !a.includes('*'));
  if (named.length) return named.length;
  try { return fs.readdirSync(path.dirname(fileURLToPath(import.meta.url))).filter((f) => f.endsWith('.test.mjs')).length; } catch { return 0; }
}

export default async function* reporter(source) {
  const files = new Map();
  const TOTAL = fileCount();
  let doneTests = 0;
  const failures = [];
  const log = [];
  let current = null;
  let number = 0;
  const started = Date.now();
  const emit = (line = '') => { log.push(plain(line)); return `${line}\n`; };
  const W = cols();
  const NAME = W - 16;

  for await (const event of source) {
    const data = event.data || {};
    const file = data.file ? path.basename(data.file) : null;
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
    if (data.details && data.details.type === 'suite') continue;
    if (data.nesting > 0 && !file) continue;
    const key = file || '(unknown)';
    if (!files.has(key)) files.set(key, { pass: 0, fail: 0, skip: 0, time: 0, tests: [] });
    const row = files.get(key);
    if (current !== key) {
      current = key;
      number = 0;
      // Progress on the right: file n of N, percent of the files, tests so far.
      const n = files.size;
      const of = Math.max(TOTAL, n);
      const pct = of ? Math.round((n / of) * 100) : 0;
      const progress = `[${padStart(n, String(of).length)}/${of}] ${padStart(pct, 3)}%  ${padStart(doneTests, 5)} tests done `;
      yield emit();
      yield emit(c.head(padEnd(` ▶ ${key}`, W - width(progress)) + progress));
    }
    doneTests++;
    const time = (data.details && data.details.duration_ms) || 0;
    if (data.nesting === 0) row.time += time;
    number++;
    const indent = '  '.repeat(data.nesting);
    const name = fit(`${indent}${data.name}`, NAME);
    const no = c.gray(padStart(String(number), 4));
    const t = timeColor(time)(padStart(fmtTime(time), 9));
    if (data.skip || data.todo) {
      row.skip++;
      row.tests.push({ status: 'skip', name: data.name, nesting: data.nesting, time });
      yield emit(` ${c.yellow('↷')} ${no}  ${c.yellow(name)}${t}`);
    } else if (event.type === 'test:pass') {
      row.pass++;
      row.tests.push({ status: 'pass', name: data.name, nesting: data.nesting, time });
      yield emit(` ${c.green('✔')} ${no}  ${name}${t}`);
    } else {
      row.tests.push({ status: 'fail', name: data.name, nesting: data.nesting, time });
      row.fail++;
      const err = data.details && data.details.error;
      const cause = err && (err.cause || err);
      const message = String((cause && cause.message) || err || 'failed').split('\n').slice(0, 8).join('\n');
      failures.push({ file: key, name: data.name, message });
      yield emit(` ${c.red('✘')} ${no}  ${c.red(name)}${t}`);
      yield emit(c.red(message.replace(/^/gm, '          │ ')));
    }
  }

  // ── summary ──
  const rows = [...files.entries()];
  const total = rows.reduce((t, [, r]) => ({ pass: t.pass + r.pass, fail: t.fail + r.fail, skip: t.skip + r.skip }), { pass: 0, fail: 0, skip: 0 });
  const FW = Math.max(12, ...rows.map(([f]) => width(f)));
  const BAR = 20;
  const sep = c.gray(`─${'─'.repeat(FW)}─┼${'─'.repeat(9)}┼${'─'.repeat(8)}┼${'─'.repeat(8)}┼${'─'.repeat(11)}┼─${'─'.repeat(BAR)}─`);
  const v = c.gray('│');
  yield emit();
  yield emit(c.head(padEnd(' SUMMARY', W)));
  yield emit(` ${c.bold(padEnd('File', FW))} ${v}${c.bold(padStart('Passed', 8))} ${v}${c.bold(padStart('Failed', 7))} ${v}${c.bold(padStart('Skipped', 7))} ${v}${c.bold(padStart('Time', 10))} ${v} ${c.bold('Result')}`);
  yield emit(sep);
  for (const [file, r] of rows) {
    const status = r.fail ? c.red : c.green;
    yield emit(` ${status(padEnd(file, FW))} ${v}${c.green(padStart(r.pass, 8))} ${v}${(r.fail ? c.red : c.gray)(padStart(r.fail, 7))} ${v}${(r.skip ? c.yellow : c.gray)(padStart(r.skip, 7))} ${v}${timeColor(r.time / 5)(padStart(fmtTime(r.time), 10))} ${v} ${bar(r.pass, r.fail, r.skip, BAR)}`);
  }
  yield emit(sep);
  const elapsed = Date.now() - started;
  yield emit(` ${c.bold(padEnd(`Total (${rows.length} files)`, FW))} ${v}${c.green(c.bold(padStart(total.pass, 8)))} ${v}${(total.fail ? c.red : c.gray)(c.bold(padStart(total.fail, 7)))} ${v}${(total.skip ? c.yellow : c.gray)(c.bold(padStart(total.skip, 7)))} ${v}${c.bold(padStart(fmtTime(elapsed), 10))} ${v} ${bar(total.pass, total.fail, total.skip, BAR)}`);
  yield emit();
  const count = total.pass + total.fail + total.skip;
  const rate = count ? ((total.pass / count) * 100).toFixed(1) : '0.0';
  const verdict = total.fail ? c.bad(' FAILED ') : c.ok(' PASSED ');
  yield emit(` ${verdict}  ${c.bold(count)} tests  ${c.green(`${total.pass} passed`)}  ${(total.fail ? c.red : c.gray)(`${total.fail} failed`)}  ${(total.skip ? c.yellow : c.gray)(`${total.skip} skipped`)}  ${c.cyan(`${rate}% pass rate`)}  ${c.gray(fmtTime(elapsed))}`);
  if (failures.length) {
    yield emit();
    yield emit(c.bad(padEnd(' FAILURES', W)));
    for (const [i, f] of failures.entries()) {
      yield emit(` ${c.red(padStart(`${i + 1}.`, 4))} ${c.bold(f.file)} ${c.gray('›')} ${f.name}`);
      yield emit(c.red(`      ${String(f.message).split('\n')[0]}`));
    }
  }
  const dir = path.dirname(fileURLToPath(import.meta.url));
  try {
    fs.writeFileSync(path.join(dir, 'last-report.txt'), `${log.join('\n')}\n`);
  } catch { /* the report file is a convenience */ }
  try {
    const md = markdownReport({ rows, total, failures, elapsed, startedAt: new Date(started) });
    fs.writeFileSync(path.join(dir, 'TestReport.md'), md);
    yield emit();
    yield emit(` ${c.gray('Report:')} ${c.cyan(path.join('test', 'TestReport.md'))}`);
  } catch { /* the report file is a convenience */ }
}

// ── Markdown report (test/TestReport.md) ──
// The same results as a document: the verdict, totals, results per area and
// per file, the failures with their messages, and every test per file.
const AREAS = [
  ['C/C++ analysis (MISRA, CERT, AUTOSAR, runtime errors, HIS, defects)', /^(misra-|cert|autosar|absint|his\.|cfamily|cfront|audit-cpp|audit-misra|defects|defect-cli)/],
  ['Language rules and semantic analysis', /^(sem-|rules-extra|rule-coverage|commented-code|modern-syntax|audit-|taint|kr-secure|iac|arch|lsp|engine)/],
  ['Dependencies and web scanning', /^(sca|dast)/],
  ['Projects, analysis jobs and storage', /^(scan-jobs|large-workspace|issue-budget|projectfile|target|gate-checks|newcode|migration|exclude-dirs|recent-samples|scenario|coverage|review|scheduler)/],
  ['Reports and export', /^(report-|export|dbsink)/],
  ['Platform, API, permissions and desktop', /^(api-ext|platform|permissions|desktop-host|admin|integrat|compat|errors|tools|aifix)/],
  ['GUI texts and help', /^(abbrev|help|terms)/],
];
const areaOf = (file) => (AREAS.find(([, re]) => re.test(file)) || ['Other'])[0];
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const icon = (r) => (r.fail ? '❌' : r.skip ? '⚠️' : '✅');
const pctOf = (r) => { const n = r.pass + r.fail + r.skip; return n ? `${((r.pass / n) * 100).toFixed(1)}%` : '—'; };

function markdownReport({ rows, total, failures, elapsed, startedAt }) {
  const count = total.pass + total.fail + total.skip;
  const at = new Date(startedAt.getTime() - startedAt.getTimezoneOffset() * 60000).toISOString().replace('T', ' ').slice(0, 19);
  const out = [];
  out.push('# MyCodeChecker — Test Report', '');
  out.push(`**Result: ${total.fail ? '❌ FAILED' : '✅ PASSED'}** — ${count} tests, ${total.pass} passed, ${total.fail} failed, ${total.skip} skipped (${pctOf(total)} pass rate)`, '');
  out.push('| Item | Value |', '|---|---|');
  out.push(`| Run at | ${at} |`);
  out.push(`| Duration | ${fmtTime(elapsed)} |`);
  out.push(`| Test files | ${rows.length} |`);
  out.push(`| Tests | ${count} |`);
  out.push(`| Passed | ${total.pass} |`);
  out.push(`| Failed | ${total.fail} |`);
  out.push(`| Skipped | ${total.skip} |`);
  out.push(`| Node.js | ${process.version} |`);
  out.push(`| Platform | ${process.platform} ${process.arch} |`);
  out.push('| Command | `npm test` (node --test, test/reporter.mjs) |', '');

  // Per area.
  const areas = new Map();
  for (const [file, r] of rows) {
    const a = areaOf(file);
    if (!areas.has(a)) areas.set(a, { files: 0, pass: 0, fail: 0, skip: 0, time: 0 });
    const s = areas.get(a);
    s.files++; s.pass += r.pass; s.fail += r.fail; s.skip += r.skip; s.time += r.time;
  }
  out.push('## Results by area', '');
  out.push('> Time is the sum of the test times. Test files run in parallel, so it is more than the duration of the run.', '');
  out.push('| Area | Files | Tests | Passed | Failed | Skipped | Pass rate | Time | Result |', '|---|---:|---:|---:|---:|---:|---:|---:|:---:|');
  for (const [name] of [...AREAS, ['Other']]) {
    const s = areas.get(name);
    if (!s) continue;
    out.push(`| ${name} | ${s.files} | ${s.pass + s.fail + s.skip} | ${s.pass} | ${s.fail} | ${s.skip} | ${pctOf(s)} | ${fmtTime(s.time)} | ${icon(s)} |`);
  }
  out.push('');

  // Failures first, when there are any.
  out.push('## Failures', '');
  if (!failures.length) out.push('None.', '');
  for (const [i, f] of failures.entries()) {
    out.push(`### ${i + 1}. ${f.file} › ${cell(f.name)}`, '', '```text', String(f.message).replace(/```/g, "'''"), '```', '');
  }

  // Per file.
  out.push('## Results by file', '');
  out.push('| # | File | Area | Tests | Passed | Failed | Skipped | Time | Result |', '|---:|---|---|---:|---:|---:|---:|---:|:---:|');
  rows.forEach(([file, r], i) => {
    out.push(`| ${i + 1} | \`${file}\` | ${areaOf(file).split(' (')[0]} | ${r.pass + r.fail + r.skip} | ${r.pass} | ${r.fail} | ${r.skip} | ${fmtTime(r.time)} | ${icon(r)} |`);
  });
  out.push('');

  // Every test, folded per file.
  out.push('## All tests', '');
  for (const [file, r] of rows) {
    out.push(`<details><summary>${icon(r)} <code>${file}</code> — ${r.pass + r.fail + r.skip} tests, ${r.fail} failed</summary>`, '');
    out.push('| # | Status | Test | Time |', '|---:|:---:|---|---:|');
    r.tests.forEach((t, i) => {
      const mark = t.status === 'pass' ? '✅' : t.status === 'fail' ? '❌' : '⚠️';
      out.push(`| ${i + 1} | ${mark} | ${'&nbsp;&nbsp;'.repeat(t.nesting || 0)}${cell(t.name)} | ${fmtTime(t.time)} |`);
    });
    out.push('', '</details>', '');
  }
  return `${out.join('\n')}\n`;
}
