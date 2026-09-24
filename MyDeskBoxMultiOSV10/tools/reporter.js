'use strict';

// npm test reporter. Marks stay ASCII so a Korean console does not print "?".

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

const RULE = '-'.repeat(52);

const KO = {
  unknown: '\uC5B4\uB514\uC778\uC9C0 \uBAA8\uB984',
  expected: '\uBC14\uB77C\uB358 \uAC12',
  actual: '\uC2E4\uC81C \uAC12  ',
  todo: '\uD560 \uC77C',
  skipped: '\uAC74\uB108\uB6F0',
  failedHead: '\uC2E4\uD328\uD55C \uAC80\uC0AC',
  passed: '\uD1B5\uACFC',
  failed: '\uC2E4\uD328',
  failedZero: '\uC2E4\uD328 0',
  all: '\uBAA8\uB450',
  took: '\uAC78\uB9B0 \uC2DC\uAC04',
  allOk: '+ \uBAA8\uB450 \uD1B5\uACFC\uD588\uC2B5\uB2C8\uB2E4.',
  someFail: (n) => `x ${n}\uAC1C\uAC00 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.`,
};

function shortFile(file) {
  if (!file) return `(${KO.unknown})`;
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
    out.push(`${green(KO.expected)} ${JSON.stringify(cause.expected)}`);
    out.push(`${red(KO.actual)} ${JSON.stringify(cause.actual)}`);
  }
  return out;
}

module.exports = async function* report(source) {
  const failures = [];
  const byFile = new Map();
  let current = null;
  let passed = 0;
  let skipped = 0;
  const started = Date.now();

  const open = (file) => {
    const name = shortFile(file);
    if (current === name) return '';
    current = name;
    const count = (byFile.get(name) || 0) + 1;
    byFile.set(name, count);
    return `\n${bold(blue('* ' + name))}\n`;
  };

  for await (const event of source) {
    const data = event.data || {};
    const isFile = data.name && data.file && path.basename(data.file) === data.name;

    switch (event.type) {
      case 'test:pass': {
        if (isFile || data.nesting > 0) break;
        if (data.skip || data.todo) {
          skipped += 1;
          const mark = data.todo ? KO.todo : KO.skipped;
          yield `${open(data.file)}  ${yellow('o')} ${dim(data.name)} ${grey(`(${mark})`)}${timing(data.details && data.details.duration_ms)}\n`;
          break;
        }
        passed += 1;
        yield `${open(data.file)}  ${green('+')} ${data.name}${timing(data.details && data.details.duration_ms)}\n`;
        break;
      }
      case 'test:fail': {
        if (data.nesting > 0) break;
        const error = data.details && data.details.error;
        failures.push({ name: data.name, file: shortFile(data.file), error });
        const head = `${open(data.file)}  ${red('x')} ${bold(data.name)}${timing(data.details && data.details.duration_ms)}\n`;
        const body = errorLines(error).map((line) => `      ${dim(line)}\n`).join('');
        yield head + body;
        break;
      }
      case 'test:stderr':
      case 'test:stdout': {
        const text = String(data.message || '').trimEnd();
        if (text) yield `${grey('    | ' + text.split('\n').join('\n    | '))}\n`;
        break;
      }
      case 'test:summary': {
        if (data.file) break;
        const counts = data.counts || {};
        const total = counts.tests ?? passed + failures.length + skipped;
        const failed = counts.failed ?? failures.length;
        const ok = failed === 0;
        const took = ms(data.duration_ms ?? Date.now() - started);

        let out = `\n${grey(RULE)}\n`;
        if (failures.length) {
          out += `${bold(red(KO.failedHead))}\n`;
          for (const fail of failures) {
            out += `  ${red('x')} ${fail.name}  ${grey(fail.file)}\n`;
            for (const line of errorLines(fail.error)) out += `      ${dim(line)}\n`;
          }
          out += `${grey(RULE)}\n`;
        }

        const parts = [
          `${green(KO.passed)} ${greenBold(counts.passed ?? passed)}`,
          failed ? `${red(KO.failed)} ${redBold(failed)}` : `${grey(KO.failedZero)}`,
        ];
        if (counts.skipped) parts.push(`${yellow(KO.skipped)} ${counts.skipped}`);
        if (counts.todo) parts.push(`${yellow(KO.todo)} ${counts.todo}`);
        parts.push(`${grey(KO.all)} ${total}`);
        parts.push(`${grey(KO.took)} ${took}`);

        out += `${parts.join(grey('  |  '))}\n`;
        out += ok ? `${greenBold(KO.allOk)}\n` : `${redBold(KO.someFail(failed))}\n`;
        yield out;
        break;
      }
      default:
        break;
    }
  }
};
