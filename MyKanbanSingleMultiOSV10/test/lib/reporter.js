/* Colorful, column-aligned console reporter for test/run.js */

const useColor = !process.env.NO_COLOR && process.env.FORCE_COLOR !== '0';

const ESC = '\x1b[';
const wrap = (open, close) => (s) => (useColor ? `${ESC}${open}m${s}${ESC}${close}m` : String(s));
const c = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  italic: wrap(3, 23),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  gray: wrap(90, 39),
  white: wrap(97, 39),
  bgRed: wrap(41, 49),
  bgGreen: wrap(42, 49),
  bgYellow: wrap(43, 49),
  bgBlue: wrap(44, 49),
  bgMagenta: wrap(45, 49),
};

const NAME_WIDTH = 70;
const TIME_WIDTH = 10;
const INDENT = '  ';

const ANSI_RE = /\x1b\[[0-9;]*m/g;
const visibleLength = (s) => String(s).replace(ANSI_RE, '').length;
const padEnd = (s, w) => s + ' '.repeat(Math.max(0, w - visibleLength(s)));
const padStart = (s, w) => ' '.repeat(Math.max(0, w - visibleLength(s))) + s;

function out(line = '') {
  process.stdout.write(`${line}\n`);
}

function formatMs(ms) {
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 1 : 0)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)} s`;
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(1);
  return `${m}m ${s}s`;
}

function colorTime(ms) {
  const text = padStart(formatMs(ms), TIME_WIDTH);
  if (ms < 100) return c.green(text);
  if (ms < 500) return c.yellow(text);
  return c.red(text);
}

function truncate(s, width) {
  return s.length > width ? `${s.slice(0, width - 1)}…` : s;
}

const STATUS = {
  pass: () => c.green(c.bold('✔ PASS')),
  fail: () => c.red(c.bold('✖ FAIL')),
  skip: () => c.yellow(c.bold('○ SKIP')),
};

function boxLines(lines, { color = c.cyan, minWidth = 0 } = {}) {
  const width = Math.max(minWidth, ...lines.map(visibleLength)) + 2;
  out(INDENT + color(`╔${'═'.repeat(width)}╗`));
  lines.forEach((line) => {
    out(INDENT + color('║') + ' ' + padEnd(line, width - 1) + color('║'));
  });
  out(INDENT + color(`╚${'═'.repeat(width)}╝`));
}

function header({ files, nodeVersion, platform, filter }) {
  out();
  boxLines([
    c.bold(c.white('MyKanban Test Runner')),
    c.gray(`Node ${nodeVersion}  |  ${platform}  |  ${files} test file(s)`),
    filter ? c.yellow(`Filter: "${filter}"`) : c.gray('Filter: none (running all tests)'),
  ], { color: c.cyan, minWidth: 60 });
}

function suiteStart(suite, index, total) {
  out();
  const counter = c.gray(`[${String(index).padStart(2, ' ')}/${total}]`);
  out(`${INDENT}${counter} ${c.bold(c.magenta('▶'))} ${c.bold(c.white(suite.name))}  ${c.gray(suite.file)}`);
  out(`${INDENT}${c.gray('─'.repeat(NAME_WIDTH + TIME_WIDTH + 18))}`);
}

function testResult(result, index) {
  const num = c.gray(String(index).padStart(3, ' '));
  const name = truncate(result.name, NAME_WIDTH - 3);
  const dots = c.gray(' ' + '.'.repeat(NAME_WIDTH - name.length) + ' ');
  const nameColored = result.status === 'fail' ? c.red(name) : result.status === 'skip' ? c.yellow(name) : name;
  const time = result.status === 'skip' ? padStart(c.gray('skipped'), TIME_WIDTH) : colorTime(result.duration);
  out(`${INDENT}  ${STATUS[result.status]()} ${num}  ${nameColored}${dots}${time}`);
  if (result.status === 'fail' && result.error) {
    const msg = String(result.error.message || result.error).split('\n').map((l) => l.trim()).filter(Boolean).join(' ');
    out(`${INDENT}             ${c.red('↳ ' + truncate(msg, NAME_WIDTH + 10))}`);
  }
}

function suiteEnd(stats) {
  const parts = [
    c.green(`${stats.passed} passed`),
    stats.failed ? c.red(c.bold(`${stats.failed} failed`)) : c.gray('0 failed'),
    stats.skipped ? c.yellow(`${stats.skipped} skipped`) : c.gray('0 skipped'),
  ];
  out(`${INDENT}  ${c.gray('└─')} ${parts.join(c.gray('  ·  '))}   ${c.gray('in')} ${c.cyan(formatMs(stats.duration))}`);
}

function hookFailure(suite, hookName, error) {
  out(`${INDENT}  ${c.red(c.bold('✖ HOOK'))}       ${c.red(`${hookName} hook failed in "${suite.name}": ${error.message}`)}`);
}

function bar(ratio, width = 40) {
  const filled = Math.round(ratio * width);
  const color = ratio === 1 ? c.green : ratio >= 0.9 ? c.yellow : c.red;
  return color('█'.repeat(filled)) + c.gray('░'.repeat(width - filled));
}

function summary({ suites, results, duration }) {
  const total = results.length;
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const skipped = results.filter((r) => r.status === 'skip').length;
  const executed = passed + failed;
  const rate = executed ? passed / executed : 1;

  out();
  out();
  const label = (s) => c.bold(padEnd(s, 14));
  boxLines([
    c.bold(c.white('TEST SUMMARY')),
    '',
    `${label('Test suites')}${c.white(String(suites.length))}`,
    `${label('Total tests')}${c.white(String(total))}`,
    `${label('Passed')}${c.green(c.bold(String(passed)))}`,
    `${label('Failed')}${failed ? c.red(c.bold(String(failed))) : c.gray('0')}`,
    `${label('Skipped')}${skipped ? c.yellow(String(skipped)) : c.gray('0')}`,
    `${label('Pass rate')}${bar(rate, 30)} ${c.bold((rate * 100).toFixed(1) + '%')}`,
    `${label('Duration')}${c.cyan(formatMs(duration))}`,
  ], { color: failed ? c.red : c.green, minWidth: 60 });

  // Per-suite table
  const cols = [
    { title: '#', width: 3, align: 'right' },
    { title: 'Suite', width: 38, align: 'left' },
    { title: 'Tests', width: 5, align: 'right' },
    { title: 'Pass', width: 5, align: 'right' },
    { title: 'Fail', width: 5, align: 'right' },
    { title: 'Skip', width: 5, align: 'right' },
    { title: 'Time', width: 10, align: 'right' },
    { title: 'Status', width: 6, align: 'left' },
  ];
  const line = (l, m, r) => INDENT + c.gray(l + cols.map((col) => '─'.repeat(col.width + 2)).join(m) + r);
  const row = (cells) => INDENT + c.gray('│') + cells.map((cell, i) => {
    const col = cols[i];
    const text = col.align === 'right' ? padStart(cell, col.width) : padEnd(cell, col.width);
    return ` ${text} `;
  }).join(c.gray('│')) + c.gray('│');

  out();
  out(line('┌', '┬', '┐'));
  out(row(cols.map((col) => c.bold(c.white(col.title)))));
  out(line('├', '┼', '┤'));
  suites.forEach((s, i) => {
    const ok = s.stats.failed === 0;
    out(row([
      c.gray(String(i + 1)),
      truncate(s.name, 38),
      String(s.stats.total),
      c.green(String(s.stats.passed)),
      s.stats.failed ? c.red(c.bold(String(s.stats.failed))) : c.gray('0'),
      s.stats.skipped ? c.yellow(String(s.stats.skipped)) : c.gray('0'),
      c.cyan(formatMs(s.stats.duration)),
      ok ? c.green('OK') : c.red(c.bold('FAIL')),
    ]));
  });
  out(line('└', '┴', '┘'));

  // Slowest tests
  const slowest = results.filter((r) => r.status !== 'skip').sort((a, b) => b.duration - a.duration).slice(0, 5);
  if (slowest.length) {
    out();
    out(`${INDENT}${c.bold(c.yellow('Slowest tests'))}`);
    slowest.forEach((r, i) => {
      const name = truncate(`${r.suite} › ${r.name}`, NAME_WIDTH + 10);
      out(`${INDENT}  ${c.gray(`${i + 1}.`)} ${padEnd(name, NAME_WIDTH + 12)}${colorTime(r.duration)}`);
    });
  }

  // Failure details
  const failures = results.filter((r) => r.status === 'fail');
  if (failures.length) {
    out();
    out(`${INDENT}${c.bold(c.red(`Failures (${failures.length})`))}`);
    failures.forEach((r, i) => {
      out();
      out(`${INDENT}  ${c.red(c.bold(`${i + 1}) ${r.suite} › ${r.name}`))}`);
      out(`${INDENT}     ${c.gray(r.file)}`);
      const err = r.error || {};
      const lines = String(err.stack || err.message || err).split('\n').slice(0, 8);
      lines.forEach((l) => out(`${INDENT}     ${c.red(l)}`));
      if (r.logs && r.logs.length) {
        out(`${INDENT}     ${c.gray('Captured console output:')}`);
        r.logs.slice(-10).forEach((l) => out(`${INDENT}       ${c.gray(truncate(l, 120))}`));
      }
    });
  }

  out();
  if (failed) {
    out(`${INDENT}${c.bgRed(c.white(c.bold(`  RESULT: ${failed} OF ${executed} TEST(S) FAILED  `)))}`);
  } else {
    out(`${INDENT}${c.bgGreen(c.white(c.bold(`  RESULT: ALL ${passed} TESTS PASSED  `)))}`);
  }
  out();
}

module.exports = {
  header,
  suiteStart,
  testResult,
  suiteEnd,
  hookFailure,
  summary,
  colors: c,
};
