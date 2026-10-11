'use strict';

// npm test reporter. Marks and labels stay ASCII so any console code page prints them.

const path = require('path');

const useColor = process.env.NO_COLOR === undefined
  && process.env.TERM !== 'dumb'
  && (process.env.FORCE_COLOR !== undefined || process.stdout.isTTY);

const paint = (code) => (text) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : String(text));

const dim = paint('2');
const bold = paint('1');
const red = paint('31');
const green = paint('32');
const yellow = paint('33');
const blue = paint('36');
const grey = paint('90');
const redBold = paint('1;31');
const greenBold = paint('1;32');

const RULE = '-'.repeat(72);
const SLOWEST = 5;

const EN = {
  unknown: 'unknown file',
  expected: 'expected',
  actual: 'actual  ',
  todo: 'todo',
  skipped: 'skipped',
  failedHead: 'Failed tests',
  byFile: 'Results by file',
  slowest: `Slowest ${SLOWEST} tests`,
  output: 'Console output from tests',
  totals: 'Totals',
  file: 'file',
  pass: 'pass',
  fail: 'fail',
  skip: 'skip',
  time: 'time',
  files: 'files',
  tests: 'tests',
  suites: 'suites',
  passed: 'passed',
  failed: 'failed',
  cancelled: 'cancelled',
  duration: 'duration',
  lines: (n) => `${n} ${n === 1 ? 'line' : 'lines'}`,
  allOk: '+ All tests passed.',
  someFail: (n) => `x ${n} ${n === 1 ? 'test' : 'tests'} failed.`,
};

function shortFile(file) {
  if (!file) return `(${EN.unknown})`;
  return path.relative(process.cwd(), file).replace(/\\/g, '/');
}

function ms(value) {
  const n = Number(value) || 0;
  return n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`;
}

function timing(value) {
  const n = Number(value) || 0;
  const label = ` (${ms(n)})`;
  if (n >= 500) return yellow(label);
  if (n >= 100) return grey(label);
  return dim(label);
}

function firstLine(text) {
  return String(text == null ? '' : text).split('\n')[0];
}

function errorLines(error) {
  if (!error) return [];
  const cause = error.cause || error;
  const out = [];
  const message = firstLine(cause.message || error.message);
  if (message) out.push(message);
  if (cause.expected !== undefined || cause.actual !== undefined) {
    out.push(`${green(EN.expected)} ${JSON.stringify(cause.expected)}`);
    out.push(`${red(EN.actual)} ${JSON.stringify(cause.actual)}`);
  }
  return out;
}

// Pads plain text first and paints afterwards, so color codes do not break the columns.
function cell(text, width, paintFn = String, right = false) {
  const raw = String(text);
  const padded = right ? raw.padStart(width) : raw.padEnd(width);
  return paintFn(padded);
}

function where(file, line, column) {
  if (!line) return file;
  return column ? `${file}:${line}:${column}` : `${file}:${line}`;
}

module.exports = async function* report(source) {
  const failures = [];
  const files = new Map();
  const timings = [];
  let current = null;
  let passed = 0;
  let skipped = 0;
  let outputLines = 0;
  const started = Date.now();

  const statsOf = (name) => {
    if (!files.has(name)) files.set(name, { pass: 0, fail: 0, skip: 0, time: 0, output: 0 });
    return files.get(name);
  };

  const open = (file) => {
    const name = shortFile(file);
    statsOf(name);
    if (current === name) return '';
    current = name;
    return `\n${bold(blue('* ' + name))}\n`;
  };

  for await (const event of source) {
    const data = event.data || {};
    const isFile = data.name && data.file && path.basename(data.file) === data.name;
    const duration = Number(data.details && data.details.duration_ms) || 0;

    switch (event.type) {
      case 'test:pass': {
        if (isFile || data.nesting > 0) break;
        const head = open(data.file);
        const stats = statsOf(shortFile(data.file));
        stats.time += duration;
        if (data.skip || data.todo) {
          skipped += 1;
          stats.skip += 1;
          const mark = data.todo ? EN.todo : EN.skipped;
          yield `${head}  ${yellow('o')} ${dim(data.name)} ${grey(`(${mark})`)}${timing(duration)}\n`;
          break;
        }
        passed += 1;
        stats.pass += 1;
        timings.push({ name: data.name, file: shortFile(data.file), duration });
        yield `${head}  ${green('+')} ${data.name}${timing(duration)}\n`;
        break;
      }
      case 'test:fail': {
        if (data.nesting > 0) break;
        const head = open(data.file);
        const file = shortFile(data.file);
        const stats = statsOf(file);
        stats.fail += 1;
        stats.time += duration;
        const error = data.details && data.details.error;
        failures.push({ name: data.name, file, line: data.line, column: data.column, error });
        timings.push({ name: data.name, file, duration });
        const body = errorLines(error).map((line) => `      ${dim(line)}\n`).join('');
        yield `${head}  ${red('x')} ${bold(data.name)}${timing(duration)}\n${body}`;
        break;
      }
      case 'test:stderr':
      case 'test:stdout': {
        const text = String(data.message || '').trimEnd();
        if (!text) break;
        const count = text.split('\n').length;
        outputLines += count;
        if (data.file) statsOf(shortFile(data.file)).output += count;
        yield `${grey('    | ' + text.split('\n').join('\n    | '))}\n`;
        break;
      }
      case 'test:summary': {
        if (data.file) break;
        const counts = data.counts || {};
        const failed = counts.failed ?? failures.length;
        const total = counts.tests ?? passed + failures.length + skipped;
        const ok = failed === 0;

        let out = `\n${grey(RULE)}\n`;

        // Results by file.
        const names = [...files.keys()].sort();
        const width = Math.max(EN.file.length, ...names.map((name) => name.length));
        out += `${bold(EN.byFile)}\n`;
        out += `  ${cell(EN.file, width, grey)}  ${cell(EN.pass, 5, grey, true)}  ${cell(EN.fail, 5, grey, true)}  ${cell(EN.skip, 5, grey, true)}  ${cell(EN.time, 8, grey, true)}\n`;
        for (const name of names) {
          const stats = files.get(name);
          const mark = stats.fail ? red('x') : green('+');
          out += `${mark} ${cell(name, width)}  ${cell(stats.pass, 5, green, true)}  `
            + `${cell(stats.fail, 5, stats.fail ? redBold : grey, true)}  `
            + `${cell(stats.skip, 5, stats.skip ? yellow : grey, true)}  ${cell(ms(stats.time), 8, grey, true)}\n`;
        }

        // Slowest tests.
        const slow = timings.slice().sort((a, b) => b.duration - a.duration).slice(0, SLOWEST);
        if (slow.length) {
          out += `\n${bold(EN.slowest)}\n`;
          for (const one of slow) {
            out += `  ${cell(ms(one.duration), 8, one.duration >= 500 ? yellow : grey, true)}  ${one.name}  ${grey(one.file)}\n`;
          }
        }

        // Anything the tests printed. A clean run prints nothing here.
        if (outputLines) {
          out += `\n${bold(yellow(EN.output))}: ${EN.lines(outputLines)}\n`;
          for (const name of names) {
            const stats = files.get(name);
            if (stats.output) out += `  ${cell(name, width)}  ${yellow(EN.lines(stats.output))}\n`;
          }
        }

        // Failed tests with where they live.
        if (failures.length) {
          out += `\n${bold(red(EN.failedHead))}\n`;
          for (const fail of failures) {
            out += `  ${red('x')} ${fail.name}\n      ${grey(where(fail.file, fail.line, fail.column))}\n`;
            for (const line of errorLines(fail.error)) out += `      ${dim(line)}\n`;
          }
        }

        // Totals.
        out += `\n${bold(EN.totals)}\n`;
        const row = (label, value, paintFn = String) => `  ${cell(label, 10, grey)} ${paintFn(value)}\n`;
        out += row(EN.files, names.length);
        out += row(EN.tests, total);
        if (counts.suites) out += row(EN.suites, counts.suites);
        out += row(EN.passed, counts.passed ?? passed, greenBold);
        out += row(EN.failed, failed, failed ? redBold : grey);
        out += row(EN.skipped, counts.skipped ?? skipped, (counts.skipped ?? skipped) ? yellow : grey);
        if (counts.todo) out += row(EN.todo, counts.todo, yellow);
        if (counts.cancelled) out += row(EN.cancelled, counts.cancelled, red);
        out += row(EN.duration, ms(data.duration_ms ?? Date.now() - started));

        out += `${grey(RULE)}\n`;
        out += ok ? `${greenBold(EN.allOk)}\n` : `${redBold(EN.someFail(failed))}\n`;
        yield out;
        break;
      }
      default:
        break;
    }
  }
};
