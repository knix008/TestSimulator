/* Custom node:test reporter — groups tests by file, prints ✔ / ✘ lines with durations and a summary box.
 *   node --test --test-reporter=./test/reporter.js test/*.test.js            (npm test)
 *   Set NO_COLOR=1 to disable colours. */
const path = require('path');

const useColor = !process.env.NO_COLOR && process.stdout.isTTY !== false;
const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = (s) => c('32', s), red = (s) => c('31', s), yellow = (s) => c('33', s), dim = (s) => c('2', s), bold = (s) => c('1', s), cyan = (s) => c('36', s);
const ms = (d) => (d == null ? '' : d >= 1000 ? `${(d / 1000).toFixed(2)} s` : `${Math.round(d)} ms`);
const rel = (f) => (f ? path.relative(process.cwd(), f).replace(/\\/g, '/') : '');

module.exports = async function* reporter(source) {
  const files = new Map();       // file → { pass, fail, skip, tests: [] }
  const failures = [];
  let started = Date.now();
  let lastFile = null;
  const fileOf = (ev) => rel(ev.data.file) || '(unknown)';
  const bucket = (f) => { if (!files.has(f)) files.set(f, { pass: 0, fail: 0, skip: 0, tests: [], t: 0 }); return files.get(f); };
  const header = (f) => { if (f !== lastFile) { lastFile = f; return `\n${bold(cyan('▶ ' + f))}\n`; } return ''; };

  for await (const ev of source) {
    const d = ev.data;
    if (ev.type === 'test:pass' || ev.type === 'test:fail') {
      if (d.nesting !== 0) continue;   // top-level tests only (this suite has no nested subtests)
      const f = fileOf(ev);
      const b = bucket(f);
      const dur = d.details && d.details.duration_ms;
      b.t += dur || 0;
      let line = header(f);
      if (ev.type === 'test:pass') {
        if (d.skip) { b.skip++; line += `  ${yellow('○')} ${d.name} ${dim('(skipped)')}\n`; }
        else { b.pass++; line += `  ${green('✔')} ${d.name} ${dim(ms(dur))}\n`; }
      } else {
        b.fail++;
        const err = d.details && d.details.error;
        const msg = err ? String(err.message || err).split('\n')[0] : 'failed';
        failures.push({ file: f, name: d.name, err });
        line += `  ${red('✘')} ${red(d.name)} ${dim(ms(dur))}\n      ${red(msg)}\n`;
      }
      yield line;
    } else if (ev.type === 'test:stderr') {
      yield ev.data.message;
    }
  }

  const totals = [...files.values()].reduce((a, b) => ({ pass: a.pass + b.pass, fail: a.fail + b.fail, skip: a.skip + b.skip }), { pass: 0, fail: 0, skip: 0 });
  const total = totals.pass + totals.fail + totals.skip;
  const elapsed = Date.now() - started;

  if (failures.length) {
    yield `\n${bold(red('Failures'))}\n`;
    for (const f of failures) {
      yield `  ${red('✘')} ${f.file} › ${f.name}\n`;
      const err = f.err;
      if (err) {
        const text = err.stack || err.message || String(err);
        yield dim(text.split('\n').slice(0, 8).map((l) => '      ' + l).join('\n')) + '\n';
      }
    }
  }

  const rows = [...files.entries()].map(([f, b]) => [f, b.pass, b.fail, b.skip, ms(b.t)]);
  const w0 = Math.max(4, ...rows.map((r) => r[0].length));
  const line = '─'.repeat(w0 + 34);
  let out = `\n${bold('Summary')}\n${line}\n`;
  out += `${'File'.padEnd(w0)}  ${'Pass'.padStart(5)}  ${'Fail'.padStart(5)}  ${'Skip'.padStart(5)}  ${'Time'.padStart(9)}\n${line}\n`;
  for (const r of rows) out += `${r[0].padEnd(w0)}  ${green(String(r[1]).padStart(5))}  ${(r[2] ? red : dim)(String(r[2]).padStart(5))}  ${(r[3] ? yellow : dim)(String(r[3]).padStart(5))}  ${String(r[4]).padStart(9)}\n`;
  out += `${line}\n${'Total'.padEnd(w0)}  ${green(String(totals.pass).padStart(5))}  ${(totals.fail ? red : dim)(String(totals.fail).padStart(5))}  ${(totals.skip ? yellow : dim)(String(totals.skip).padStart(5))}  ${ms(elapsed).padStart(9)}\n${line}\n`;
  out += totals.fail
    ? `${bold(red(`✘ ${totals.fail} of ${total} tests failed`))}\n`
    : `${bold(green(`✔ All ${total} tests passed`))}${totals.skip ? dim(` (${totals.skip} skipped)`) : ''}\n`;
  yield out;
};
