// node --test reporter. One coloured, column-aligned line per test, then a
// column-aligned summary and a vertical totals block. English only.
// Colours: on a terminal, or with FORCE_COLOR. NO_COLOR turns them off.
import path from 'node:path';

function palette() {
  const forced = process.env.FORCE_COLOR;
  const on = forced ? forced !== '0' : !process.env.NO_COLOR && !!process.stdout.isTTY;
  const sgr = (code) => (text) => (on ? `\x1b[${code}m${text}\x1b[0m` : String(text));
  return {
    green: sgr('32'), red: sgr('31'), yellow: sgr('33'), magenta: sgr('35'), cyan: sgr('36'),
    gray: sgr('90'), bold: sgr('1'),
    head: sgr('1;97;44'), ok: sgr('1;30;42'), bad: sgr('1;97;41'),
  };
}

const plain = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '');
const width = (s) => [...plain(s)].reduce((n, ch) => n + (wide(ch) ? 2 : 1), 0);
const wide = (ch) => /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch);
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
const timeColor = (p, ms) => (ms >= 10000 ? p.magenta : ms >= 1000 ? p.yellow : ms >= 200 ? p.cyan : p.gray);
const cols = () => Math.max(80, Math.min(140, (process.stdout.columns || Number(process.env.COLUMNS) || 120) - 1));

const FEATURE = {
  'test/core.test.mjs': 'FTP, local files, profiles, history',
  'test/ftps.test.mjs': 'FTPS',
  'test/sftp.test.mjs': 'SFTP',
  'test/copymove.test.mjs': 'Copy, cut, paste, drag',
  'test/terminal.test.mjs': 'Terminal',
  'test/errors.test.mjs': 'Error dialogs',
  'test/ui.test.mjs': 'Settings, theme, i18n, dialogs',
  'test/ui-changes.test.mjs': 'Theme menu, path crumbs, dock',
  'test/session.test.mjs': 'Session and settings',
  'test/api.test.mjs': 'API',
  'test/shells.test.mjs': 'Shells',
  'test/jobs.test.mjs': 'Jobs',
  'test/prompts.test.mjs': 'Shell prompts',
  'test/term-color.test.mjs': 'Terminal colours',
  'test/complete.test.mjs': 'Tab completion',
  'test/fonts.test.mjs': 'Fonts',
  'test/desktop.test.mjs': 'Desktop host and user guide',
  'test/rust.test.mjs': 'Tauri shell (cargo test)',
};

function bar(p, pass, fail, skip, size) {
  const total = pass + fail + skip;
  if (!total) return p.gray('░'.repeat(size));
  const f = fail ? Math.max(1, Math.round((fail / total) * size)) : 0;
  const s = skip ? Math.max(1, Math.round((skip / total) * size)) : 0;
  const ok = Math.max(0, size - f - s);
  const part = (paint, n) => (n ? paint('█'.repeat(n)) : '');
  return part(p.green, ok) + part(p.red, f) + part(p.yellow, s);
}

function rel(file) {
  if (!file) return '(unknown)';
  return path.relative(process.cwd(), file).replace(/\\/g, '/');
}

function errMessage(err) {
  if (!err) return 'failed';
  const text = err.message || err.cause?.message || String(err);
  return String(text).split('\n')[0];
}

export default async function* reporter(source) {
  const c = palette();
  const files = new Map();
  const failures = [];
  const started = Date.now();
  let current = null;
  let number = 0;
  let banner = false;
  const W = cols();
  const NAME = Math.max(24, W - 18);

  const bucket = (file) => {
    if (!files.has(file)) files.set(file, { pass: 0, fail: 0, skip: 0, time: 0 });
    return files.get(file);
  };

  for await (const ev of source) {
    if (!banner) {
      banner = true;
      yield `${c.head(padEnd(' My FTP Client  test run', W))}\n`;
    }
    const d = ev.data || {};
    if (ev.type === 'test:stdout' || ev.type === 'test:stderr') {
      if (d.message) yield d.message;
      continue;
    }
    if (ev.type !== 'test:pass' && ev.type !== 'test:fail' && ev.type !== 'test:skip') continue;
    if (d.details && d.details.type === 'suite') continue;

    const file = rel(d.file);
    const row = bucket(file);
    if (current !== file) {
      current = file;
      number = 0;
      const feature = FEATURE[file] || 'Tests';
      yield `\n${c.head(fit(` ${file}   ${feature}`, W))}\n`;
    }
    number += 1;
    const dur = (d.details && d.details.duration_ms) || 0;
    if ((d.nesting || 0) === 0) row.time += dur;
    const indent = '  '.repeat(d.nesting || 0);
    const name = fit(`${indent}${d.name}`, NAME);
    const no = c.gray(padStart(String(number), 4));
    const clock = timeColor(c, dur)(padStart(fmtTime(dur), 9));
    const skipped = ev.type === 'test:skip' || d.skip || (d.details && d.details.skipped);

    if (skipped) {
      row.skip += 1;
      yield ` ${c.yellow('~')} ${no}  ${c.yellow(name)}${clock}\n`;
    } else if (ev.type === 'test:pass') {
      row.pass += 1;
      yield ` ${c.green('✔')} ${no}  ${name}${clock}\n`;
    } else {
      row.fail += 1;
      const err = d.details && d.details.error;
      failures.push({ file, name: d.name, message: errMessage(err) });
      yield ` ${c.red('✘')} ${no}  ${c.red(name)}${clock}\n`;
      yield `${c.red(`        ${errMessage(err)}`)}\n`;
    }
  }

  const rows = [...files.entries()];
  const total = rows.reduce(
    (a, [, r]) => ({ pass: a.pass + r.pass, fail: a.fail + r.fail, skip: a.skip + r.skip }),
    { pass: 0, fail: 0, skip: 0 },
  );
  const count = total.pass + total.fail + total.skip;
  const elapsed = Date.now() - started;
  const FW = Math.max(4, ...rows.map(([f]) => width(f)), width('File'));
  const BAR = 16;
  const v = c.gray('|');
  const rule = c.gray(`${'-'.repeat(FW + 2)}+${'-'.repeat(8)}+${'-'.repeat(8)}+${'-'.repeat(9)}+${'-'.repeat(11)}+${'-'.repeat(BAR + 2)}`);

  yield `\n${c.head(padEnd(' Summary', W))}\n`;
  yield ` ${c.bold(padEnd('File', FW))} ${v}${c.bold(padStart('Passed', 7))} ${v}${c.bold(padStart('Failed', 7))} ${v}${c.bold(padStart('Skipped', 8))} ${v}${c.bold(padStart('Time', 10))} ${v} ${c.bold('Result')}\n`;
  yield `${rule}\n`;
  for (const [file, r] of rows) {
    const name = r.fail ? c.red(padEnd(file, FW)) : c.green(padEnd(file, FW));
    const failed = (r.fail ? c.red : c.gray)(padStart(String(r.fail), 7));
    const skipped = (r.skip ? c.yellow : c.gray)(padStart(String(r.skip), 8));
    yield ` ${name} ${v}${c.green(padStart(String(r.pass), 7))} ${v}${failed} ${v}${skipped} ${v}${timeColor(c, r.time)(padStart(fmtTime(r.time), 10))} ${v} ${bar(c, r.pass, r.fail, r.skip, BAR)}\n`;
  }
  yield `${rule}\n`;
  const failedTotal = (total.fail ? c.red : c.gray)(c.bold(padStart(String(total.fail), 7)));
  const skippedTotal = (total.skip ? c.yellow : c.gray)(c.bold(padStart(String(total.skip), 8)));
  yield ` ${c.bold(padEnd('Total', FW))} ${v}${c.green(c.bold(padStart(String(total.pass), 7)))} ${v}${failedTotal} ${v}${skippedTotal} ${v}${c.bold(padStart(fmtTime(elapsed), 10))} ${v} ${bar(c, total.pass, total.fail, total.skip, BAR)}\n`;

  const rate = count ? ((total.pass / count) * 100).toFixed(1) : '0.0';
  const labelW = 12;
  const valueW = 10;
  const line = (label, value, paint) => `  ${c.bold(padEnd(label, labelW))}${paint(padStart(value, valueW))}\n`;
  yield '\n';
  yield line('Files', String(rows.length), c.cyan);
  yield line('Tests', String(count), c.bold);
  yield line('Passed', String(total.pass), c.green);
  yield line('Failed', String(total.fail), total.fail ? c.red : c.gray);
  yield line('Skipped', String(total.skip), total.skip ? c.yellow : c.gray);
  yield line('Pass rate', `${rate}%`, c.cyan);
  yield line('Duration', fmtTime(elapsed), timeColor(c, elapsed));
  yield '\n';
  yield total.fail
    ? `${c.bad(' FAILED ')}  ${c.red(`${total.fail} of ${count} tests failed`)}\n`
    : `${c.ok(' PASSED ')}  ${c.green(`All ${total.pass} tests passed`)}${total.skip ? c.yellow(`  (${total.skip} skipped)`) : ''}\n`;

  if (failures.length) {
    yield `\n${c.bad(padEnd(' Failures', W))}\n`;
    for (let i = 0; i < failures.length; i++) {
      const f = failures[i];
      yield ` ${c.red(padStart(`${i + 1}.`, 4))} ${c.bold(f.file)} ${c.gray('>')} ${f.name}\n`;
      yield `${c.red(`      ${f.message}`)}\n`;
    }
  }
}
