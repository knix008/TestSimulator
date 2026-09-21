// Test reporter for `node --test`: the results grouped by file and suite as
// they arrive, then a summary table (one row per suite, one per file, a
// total) and the details of every failure at the very end, where they are
// easy to find. Colours only when stdout is a terminal (or FORCE_COLOR).
import path from 'node:path';

const color = process.stdout.isTTY || process.env.FORCE_COLOR ? (c, s) => `\x1b[${c}m${s}\x1b[0m` : (_c, s) => s;
const green = (s) => color(32, s);
const red = (s) => color(31, s);
const yellow = (s) => color(33, s);
const dim = (s) => color(2, s);
const bold = (s) => color(1, s);
const cyan = (s) => color(36, s);

const ms = (n) => `${(n || 0).toFixed(n >= 100 ? 0 : 1)} ms`;
const fileLabel = (f) => (f ? path.basename(f).replace(/\.test\.mjs$/, '') : '(no file)');

// Every suite / test event carries the file and the nesting level; a test's
// suite is the innermost suite still open in that file.
export default async function* reporter(source) {
  const files = new Map();       // file → { suites: Map<name, row>, order: [] }
  const openSuites = new Map();  // file → names open per nesting level
  const failures = [];
  let lastFile = null;
  let lastSuite = null;

  const fileRow = (f) => {
    if (!files.has(f)) files.set(f, { suites: new Map(), order: [] });
    return files.get(f);
  };
  const suiteRow = (f, name) => {
    const fr = fileRow(f);
    if (!fr.suites.has(name)) { fr.suites.set(name, { pass: 0, fail: 0, skip: 0, todo: 0, ms: 0 }); fr.order.push(name); }
    return fr.suites.get(name);
  };
  const header = (f, suite) => {
    let out = '';
    if (f !== lastFile) { out += `\n${bold(cyan(`■ ${fileLabel(f)}`))} ${dim(f)}\n`; lastFile = f; lastSuite = null; }
    if (suite !== lastSuite) { out += `  ${bold(suite)}\n`; lastSuite = suite; }
    return out;
  };

  for await (const event of source) {
    const d = event.data || {};
    switch (event.type) {
      case 'test:start': {
        // Suites and tests both announce themselves in order, with their
        // nesting level: index n of the per-file stack is whatever is open at
        // level n, so a test's suite is the entry just above its own level.
        const stack = openSuites.get(d.file) || [];
        stack.length = d.nesting || 0;
        stack.push(d.name);
        openSuites.set(d.file, stack);
        break;
      }
      case 'test:pass':
      case 'test:fail': {
        if (d.details && d.details.type === 'suite') break;
        const f = d.file || '';
        const stack = openSuites.get(f) || [];
        const suite = d.nesting > 0 ? stack.slice(0, d.nesting).join(' › ') : '(top level)';
        const row = suiteRow(f, suite);
        const dur = (d.details && d.details.duration_ms) || 0;
        row.ms += dur;
        let mark;
        if (d.skip) { row.skip++; mark = yellow('- skip'); }
        else if (d.todo) { row.todo++; mark = yellow('~ todo'); }
        else if (event.type === 'test:pass') { row.pass++; mark = green('✔'); }
        else { row.fail++; mark = red('✘'); failures.push({ file: f, suite, name: d.name, error: d.details && d.details.error }); }
        yield `${header(f, suite)}    ${mark} ${d.name} ${dim(`(${ms(dur)})`)}\n`;
        break;
      }
      case 'test:diagnostic':
        // The runner's own totals are replaced by the table below.
        break;
      case 'test:stderr':
      case 'test:stdout':
        yield d.message;
        break;
      default: break;
    }
  }

  // ── Summary table ──
  const rows = [];
  const total = { pass: 0, fail: 0, skip: 0, todo: 0, ms: 0 };
  for (const [f, fr] of files) {
    const sum = { pass: 0, fail: 0, skip: 0, todo: 0, ms: 0 };
    for (const name of fr.order) {
      const r = fr.suites.get(name);
      rows.push({ label: `  ${name}`, ...r });
      for (const k of Object.keys(sum)) sum[k] += r[k];
    }
    rows.splice(rows.length - fr.order.length, 0, { label: fileLabel(f), ...sum, group: true });
    for (const k of Object.keys(total)) total[k] += sum[k];
  }
  const width = Math.max(30, ...rows.map((r) => r.label.length)) + 2;
  const cell = (n, w = 6) => String(n).padStart(w);
  const line = (r, style = (s) => s) => {
    const status = r.fail ? red('FAIL') : r.pass + r.skip + r.todo ? green(' OK ') : dim(' -- ');
    return `${style(r.label.padEnd(width))}${status}  ${cell(r.pass)}${cell(r.fail)}${cell(r.skip + r.todo)}  ${cell(ms(r.ms), 10)}\n`;
  };
  let out = `\n${bold('Summary')}\n`;
  out += `${dim(''.padEnd(width))}${dim('status')}  ${dim(cell('pass'))}${dim(cell('fail'))}${dim(cell('skip'))}  ${dim(cell('time', 10))}\n`;
  out += `${'─'.repeat(width + 36)}\n`;
  for (const r of rows) out += r.group ? line(r, bold) : line(r);
  out += `${'─'.repeat(width + 36)}\n`;
  out += line({ label: 'Total', ...total }, bold);
  const verdict = total.fail ? red(`✘ ${total.fail} failed`) : green('✔ all passed');
  out += `\n${verdict}${dim(`  (${total.pass + total.fail} tests, ${total.skip + total.todo} skipped, ${(total.ms / 1000).toFixed(2)} s)`)}\n`;

  if (failures.length) {
    out += `\n${bold(red('Failures'))}\n`;
    failures.forEach((fl, i) => {
      out += `\n${red(`${i + 1}) ${fileLabel(fl.file)} › ${fl.suite} › ${fl.name}`)}\n`;
      const err = fl.error;
      const text = err && err.cause && err.cause.stack ? err.cause.stack : err && (err.stack || err.message) ? (err.stack || err.message) : String(err);
      out += text.split('\n').map((l) => `   ${l}`).join('\n') + '\n';
    });
  }
  yield out;
}
