// node --test reporter: a heading per test file, ✔/✘ with time for every
// test, then a summary table. The same text (without colours) is saved to
// test/last-report.txt.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const color = process.stdout.isTTY || process.env.FORCE_COLOR ? {
  g: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, y: (s) => `\x1b[33m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m`, c: (s) => `\x1b[36m${s}\x1b[0m`,
} : { g: (s) => s, r: (s) => s, y: (s) => s, b: (s) => s, d: (s) => s, c: (s) => s };

const plain = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const ms = (n) => (n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${Math.round(n)} ms`);

export default async function* reporter(source) {
  const files = new Map();
  const failures = [];
  const log = [];
  let current = null;
  const emit = (line) => { log.push(plain(line)); return `${line}\n`; };
  const started = Date.now();

  for await (const event of source) {
    const data = event.data || {};
    const file = data.file ? path.basename(data.file) : null;
    if (event.type === 'test:pass' || event.type === 'test:fail') {
      if (data.details && data.details.type === 'suite') continue;
      if (data.nesting > 0 && !file) continue;
      const key = file || '(unknown)';
      if (!files.has(key)) files.set(key, { pass: 0, fail: 0, skip: 0, time: 0 });
      const row = files.get(key);
      if (current !== key) {
        current = key;
        yield emit(`\n${color.b(color.c(`▶ ${key}`))}`);
      }
      const time = (data.details && data.details.duration_ms) || 0;
      if (data.nesting === 0) row.time += time;
      const indent = '  '.repeat(data.nesting + 1);
      if (data.skip || data.todo) {
        row.skip++;
        yield emit(`${indent}${color.y('↷')} ${data.name} ${color.d(ms(time))}`);
      } else if (event.type === 'test:pass') {
        row.pass++;
        yield emit(`${indent}${color.g('✔')} ${data.name} ${color.d(ms(time))}`);
      } else {
        row.fail++;
        const err = data.details && data.details.error;
        const cause = err && (err.cause || err);
        const message = String((cause && cause.message) || err || 'failed').split('\n').slice(0, 6).join('\n');
        failures.push({ file: key, name: data.name, message });
        yield emit(`${indent}${color.r('✘')} ${data.name} ${color.d(ms(time))}`);
        yield emit(color.r(message.replace(/^/gm, `${indent}    `)));
      }
    } else if (event.type === 'test:diagnostic' && /^(tests|pass|fail)\b/.test(data.message || '')) {
      // node's own totals; the table below covers them
    } else if (event.type === 'test:stderr' || event.type === 'test:stdout') {
      const text = String(data.message || '').trimEnd();
      if (text) yield emit(color.d(text));
    }
  }

  const rows = [...files.entries()];
  const total = rows.reduce((t, [, r]) => ({ pass: t.pass + r.pass, fail: t.fail + r.fail, skip: t.skip + r.skip }), { pass: 0, fail: 0, skip: 0 });
  const width = Math.max(10, ...rows.map(([f]) => f.length));
  const line = `${'─'.repeat(width + 2)}┼${'─'.repeat(8)}┼${'─'.repeat(8)}┼${'─'.repeat(8)}┼${'─'.repeat(11)}`;
  const cell = (s, n) => String(s).padStart(n);
  yield emit(`\n${color.b('Summary')}`);
  yield emit(` ${'File'.padEnd(width)} │${cell('Pass', 7)} │${cell('Fail', 7)} │${cell('Skip', 7)} │${cell('Time', 10)}`);
  yield emit(line);
  for (const [file, r] of rows) {
    const status = r.fail ? color.r : color.g;
    yield emit(` ${status(file.padEnd(width))} │${cell(r.pass, 7)} │${cell(r.fail ? color.r(r.fail) : r.fail, r.fail ? 16 : 7)} │${cell(r.skip, 7)} │${cell(ms(r.time), 10)}`);
  }
  yield emit(line);
  const verdict = total.fail ? color.r(color.b('FAILED')) : color.g(color.b('PASSED'));
  yield emit(` ${'Total'.padEnd(width)} │${cell(total.pass, 7)} │${cell(total.fail, 7)} │${cell(total.skip, 7)} │${cell(ms(Date.now() - started), 10)}`);
  yield emit(`\n${verdict}  ${total.pass + total.fail + total.skip} tests, ${total.fail} failed`);
  if (failures.length) {
    yield emit(color.r('\nFailures:'));
    for (const f of failures) yield emit(color.r(`  ✘ ${f.file} › ${f.name}`));
  }
  try {
    const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'last-report.txt');
    fs.writeFileSync(out, `${log.join('\n')}\n`);
  } catch { /* report file is a convenience */ }
}
