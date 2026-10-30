// Custom node:test reporter: groups tests by file, prints ✔ / ✘ / ○ with
// durations, then a per-file table and a result summary.
//   npm test
import path from 'node:path';

const useColor = !process.env.NO_COLOR && process.stdout.isTTY !== false;
const paint = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = (s) => paint('32', s);
const red = (s) => paint('31', s);
const yellow = (s) => paint('33', s);
const dim = (s) => paint('2', s);
const bold = (s) => paint('1', s);
const cyan = (s) => paint('36', s);

const FEATURE = {
  'test/core.test.mjs': 'FTP · local · profiles · history',
  'test/ftps.test.mjs': 'FTPS',
  'test/sftp.test.mjs': 'SFTP',
  'test/terminal.test.mjs': 'Terminal',
  'test/errors.test.mjs': 'Error dialogs',
  'test/ui.test.mjs': 'Settings · theme · i18n · dialogs',
  'test/session.test.mjs': 'Session / settings',
  'test/api.test.mjs': 'API',
  'test/shells.test.mjs': 'Shells',
  'test/jobs.test.mjs': 'Jobs',
  'test/prompts.test.mjs': 'Shell prompts',
  'test/term-color.test.mjs': 'Terminal colours',
  'test/complete.test.mjs': 'Tab completion',
  'test/fonts.test.mjs': 'Fonts',
};

function ms(d) {
  if (d == null || Number.isNaN(d)) return '';
  return d >= 1000 ? `${(d / 1000).toFixed(2)} s` : `${Math.round(d)} ms`;
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

function errStack(err) {
  if (!err) return '';
  return String(err.stack || err.message || err).trim();
}

export default async function* reporter(source) {
  const files = new Map();
  const failures = [];
  const started = Date.now();
  let lastFile = null;
  let banner = false;

  const bucket = (f) => {
    if (!files.has(f)) files.set(f, { pass: 0, fail: 0, skip: 0, tests: [], t: 0 });
    return files.get(f);
  };

  const header = (f) => {
    if (f === lastFile) return '';
    lastFile = f;
    const label = FEATURE[f] ? dim(`  ${FEATURE[f]}`) : '';
    return `\n${bold(cyan('▶ ' + f))}${label}\n`;
  };

  for await (const ev of source) {
    if (!banner) {
      banner = true;
      yield `\n${bold('My FTP Client')} ${dim('— test run')}\n`;
    }
    const d = ev.data || {};
    if (ev.type === 'test:stdout' || ev.type === 'test:stderr') {
      if (d.message) yield d.message;
      continue;
    }
    if (ev.type !== 'test:pass' && ev.type !== 'test:fail' && ev.type !== 'test:skip') continue;

    const f = rel(d.file);
    const b = bucket(f);
    const dur = d.details && d.details.duration_ms;
    if ((d.nesting || 0) === 0) b.t += dur || 0;
    const indent = '  '.repeat(1 + (d.nesting || 0));
    const skipped = ev.type === 'test:skip' || d.skip || (d.details && d.details.skipped);
    let line = header(f);

    if (skipped) {
      b.skip += 1;
      const why = typeof d.skip === 'string' && d.skip ? dim(` (${d.skip})`) : dim('(skipped)');
      line += `${indent}${yellow('○')} ${d.name} ${why}\n`;
    } else if (ev.type === 'test:pass') {
      b.pass += 1;
      line += `${indent}${green('✔')} ${d.name} ${dim(ms(dur))}\n`;
    } else {
      b.fail += 1;
      const err = d.details && d.details.error;
      failures.push({ file: f, name: d.name, err });
      line += `${indent}${red('✘')} ${red(d.name)} ${dim(ms(dur))}\n`;
      line += `${indent}    ${red(errMessage(err))}\n`;
    }
    yield line;
  }

  const list = [...files.entries()];
  const totals = list.reduce(
    (a, [, b]) => ({ pass: a.pass + b.pass, fail: a.fail + b.fail, skip: a.skip + b.skip }),
    { pass: 0, fail: 0, skip: 0 },
  );
  const total = totals.pass + totals.fail + totals.skip;
  const elapsed = Date.now() - started;

  if (failures.length) {
    yield `\n${bold(red('Failures'))}\n`;
    for (const f of failures) {
      yield `  ${red('✘')} ${f.file} › ${f.name}\n`;
      const stack = errStack(f.err);
      if (stack) {
        yield dim(stack.split('\n').slice(0, 10).map((l) => '      ' + l).join('\n')) + '\n';
      }
    }
  }

  const rows = list.map(([f, b]) => [f, FEATURE[f] || '', b.pass, b.fail, b.skip, ms(b.t)]);
  const wFile = Math.max(8, ...rows.map((r) => r[0].length), 'File'.length);
  const wFeat = Math.max(8, ...rows.map((r) => r[1].length), 'Feature'.length);
  const line = '─'.repeat(wFile + wFeat + 36);

  let out = `\n${bold('Summary')}\n${line}\n`;
  out += `${'File'.padEnd(wFile)}  ${'Feature'.padEnd(wFeat)}  ${'Pass'.padStart(5)}  ${'Fail'.padStart(5)}  ${'Skip'.padStart(5)}  ${'Time'.padStart(9)}\n${line}\n`;
  for (const r of rows) {
    const failCell = r[3] ? red(String(r[3]).padStart(5)) : dim(String(r[3]).padStart(5));
    const skipCell = r[4] ? yellow(String(r[4]).padStart(5)) : dim(String(r[4]).padStart(5));
    out += `${r[0].padEnd(wFile)}  ${dim(r[1].padEnd(wFeat))}  ${green(String(r[2]).padStart(5))}  ${failCell}  ${skipCell}  ${String(r[5]).padStart(9)}\n`;
  }
  out += `${line}\n`;
  out += `${'Total'.padEnd(wFile)}  ${''.padEnd(wFeat)}  ${green(String(totals.pass).padStart(5))}  ${(totals.fail ? red : dim)(String(totals.fail).padStart(5))}  ${(totals.skip ? yellow : dim)(String(totals.skip).padStart(5))}  ${ms(elapsed).padStart(9)}\n`;
  out += `${line}\n`;
  if (totals.fail) out += `${bold(red(`✘ ${totals.fail} of ${total} tests failed`))}\n`;
  else out += `${bold(green(`✔ All ${totals.pass} tests passed`))}${totals.skip ? dim(`  (${totals.skip} skipped)`) : ''}\n`;
  out += dim(`${total} tests  ·  ${list.length} files  ·  ${ms(elapsed)}`) + '\n';
  yield out;
}
