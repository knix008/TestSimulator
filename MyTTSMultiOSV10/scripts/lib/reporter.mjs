// Test output: English, coloured, one aligned line per test, a live "running" line while a
// test runs (a heartbeat every 10 s when the output is not a terminal), and a summary table.
// Colours follow the terminal: on when stdout is a TTY or FORCE_COLOR is set, off with NO_COLOR.

const tty = Boolean(process.stdout.isTTY);
const colour = !process.env.NO_COLOR && (tty || (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0'));
const paint = (code) => (text) => (colour ? `\x1b[${code}m${text}\x1b[0m` : String(text));
export const c = {
  bold: paint('1'), dim: paint('2'), red: paint('31'), green: paint('32'), yellow: paint('33'),
  blue: paint('34'), magenta: paint('35'), cyan: paint('36'), gray: paint('90'),
  bgGreen: paint('30;42'), bgRed: paint('97;41'), bgYellow: paint('30;43'), bgBlue: paint('97;44'),
};

const NAME_WIDTH = 64;
const CATEGORY_WIDTH = 8;
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** 7 ms · 1.24 s · 2m 05s, right-aligned in 8 columns. */
export function formatTime(ms) {
  let text;
  if (ms < 1000) text = `${Math.round(ms)} ms`;
  else if (ms < 60000) text = `${(ms / 1000).toFixed(2)} s`;
  else text = `${Math.floor(ms / 60000)}m ${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}s`;
  return text.padStart(8);
}

const fit = (text, width) => (text.length > width ? `${text.slice(0, width - 1)}…` : text);
/** The name and a dotted leader up to the time column. */
const leader = (name) => {
  const shown = fit(name, NAME_WIDTH);
  return `${shown} ${c.gray('.'.repeat(Math.max(1, NAME_WIDTH - shown.length)))}`;
};
const counter = (index, total) => c.gray(`[${String(index).padStart(3)}/${String(total).padStart(3)}]`);
const STATUS = {
  pass: () => c.green('✔ PASS'),
  fail: () => c.red('✘ FAIL'),
  skip: () => c.yellow('◌ SKIP'),
};
const categoryLabel = (name) => c.cyan(name.padEnd(CATEGORY_WIDTH));

export function line(text = '') { process.stdout.write(`${text}\n`); }

export function banner(title, facts) {
  const width = 100;
  line();
  line(c.bgBlue(` ${title} `.padEnd(width)));
  for (const [key, value] of facts) line(`  ${c.gray(key.padEnd(12))} ${value}`);
  line();
}

export function categoryHeader(name, description, count) {
  line(`${c.bold(c.magenta('▶'))} ${c.bold(name.toUpperCase().padEnd(CATEGORY_WIDTH))} ${description}${count != null ? c.gray(`  (${count} cases)`) : ''}`);
}

/** Starts the live line of a running test; returns stop() that clears it. */
export function running(index, total, category, name) {
  const started = Date.now();
  let frame = 0;
  if (tty) {
    const draw = () => {
      const spin = c.blue(`${SPINNER[frame++ % SPINNER.length]} RUN `);
      process.stdout.write(`\r\x1b[2K  ${counter(index, total)}  ${spin}  ${categoryLabel(category)} ${leader(name)} ${c.blue(formatTime(Date.now() - started))}`);
    };
    draw();
    const timer = setInterval(draw, 120);
    return () => { clearInterval(timer); process.stdout.write('\r\x1b[2K'); };
  }
  const timer = setInterval(() => line(`  ${counter(index, total)}  … still running: ${name} (${formatTime(Date.now() - started).trim()})`), 10000);
  return () => clearInterval(timer);
}

export function result(index, total, category, name, status, ms, detail = '') {
  line(`  ${counter(index, total)}  ${STATUS[status]()}  ${categoryLabel(category)} ${leader(name)} ${status === 'skip' ? c.gray(formatTime(ms)) : c.dim(formatTime(ms))}`);
  if (detail) {
    const colourise = status === 'fail' ? c.red : c.yellow;
    for (const text of String(detail).split('\n').slice(0, 12)) line(`${' '.repeat(20)}${colourise(status === 'fail' ? `│ ${text}` : `↳ ${text}`)}`);
  }
}

export function categoryFooter(stats) {
  const parts = [c.green(`${stats.pass} passed`), stats.fail ? c.red(`${stats.fail} failed`) : c.gray('0 failed'), stats.skip ? c.yellow(`${stats.skip} skipped`) : c.gray('0 skipped')];
  line(`  ${c.gray('└─')} ${parts.join(c.gray(' · '))} ${c.gray('in')} ${formatTime(stats.ms).trim()}`);
  line();
}

/** The summary table, one row per category, then the failures. */
export function summary(categories, failures, totalMs) {
  const head = ['Category', 'Cases', 'Passed', 'Failed', 'Skipped', 'Time', 'Result'];
  const widths = [12, 7, 8, 8, 9, 10, 10];
  const row = (cells, paints = []) => `  ${cells.map((cell, i) => {
    const text = i === 0 || i === 6 ? String(cell).padEnd(widths[i]) : String(cell).padStart(widths[i]);
    return paints[i] ? paints[i](text) : text;
  }).join(' ')}`;
  const ruleLine = c.gray(`  ${widths.map((w) => '─'.repeat(w)).join(' ')}`);
  line(c.bgBlue(' Summary '.padEnd(100)));
  line(c.bold(row(head)));
  line(ruleLine);
  const total = { cases: 0, pass: 0, fail: 0, skip: 0 };
  for (const cat of categories) {
    const s = cat.stats;
    const cases = s.pass + s.fail + s.skip;
    total.cases += cases; total.pass += s.pass; total.fail += s.fail; total.skip += s.skip;
    const verdict = s.fail ? 'FAILED' : s.pass ? 'PASSED' : 'SKIPPED';
    line(row([cat.name, cases, s.pass, s.fail, s.skip, formatTime(s.ms).trim(), verdict], [
      c.cyan, null, c.green, s.fail ? c.red : c.gray, s.skip ? c.yellow : c.gray, c.dim,
      s.fail ? c.red : s.pass ? c.green : c.yellow,
    ]));
  }
  line(ruleLine);
  line(c.bold(row(['TOTAL', total.cases, total.pass, total.fail, total.skip, formatTime(totalMs).trim(), total.fail ? 'FAILED' : 'PASSED'], [
    null, null, c.green, total.fail ? c.red : c.gray, total.skip ? c.yellow : c.gray, null, total.fail ? c.red : c.green,
  ])));
  line();
  if (failures.length) {
    line(c.red(c.bold(`  Failures (${failures.length})`)));
    for (const f of failures) line(`  ${c.red('✘')} ${c.cyan(f.category.padEnd(CATEGORY_WIDTH))} ${f.name}${f.message ? c.gray(` — ${fit(f.message.split('\n')[0], 110)}`) : ''}`);
    line();
  }
  const rate = total.pass + total.fail ? ((total.pass / (total.pass + total.fail)) * 100).toFixed(1) : '0.0';
  line(total.fail
    ? c.bgRed(` ✘ ${total.fail} of ${total.pass + total.fail} tests failed (${rate}% passed) `)
    : c.bgGreen(` ✔ All ${total.pass} tests passed${total.skip ? `, ${total.skip} skipped` : ''} — ${formatTime(totalMs).trim()} `));
  line();
  return total;
}
