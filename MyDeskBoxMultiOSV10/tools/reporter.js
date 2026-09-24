'use strict';

// npm test 의 결과를 파일별로 묶어 보기 좋게 찍는다.
// node --test --test-reporter=./tools/reporter.js

const path = require('path');

const useColor = process.env.NO_COLOR === undefined
  && process.env.TERM !== 'dumb'
  && (process.env.FORCE_COLOR !== undefined || process.stdout.isTTY);

const paint = (code) => (text) => (useColor ? `[${code}m${text}[0m` : String(text));

const dim = paint('2');
const bold = paint('1');
const red = paint('31');
const green = paint('32');
const yellow = paint('33');
const blue = paint('36');
const grey = paint('90');
const redBold = paint('1;31');
const greenBold = paint('1;32');

function shortFile(file) {
  if (!file) return '(어디인지 모름)';
  return path.relative(process.cwd(), file).replace(/\\/g, '/');
}

function ms(value) {
  const n = Number(value) || 0;
  return n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`;
}

// 느린 검사는 눈에 띄게 둔다.
function timing(value) {
  const n = Number(value) || 0;
  if (n >= 500) return yellow(` (${ms(n)})`);
  if (n >= 100) return grey(` (${ms(n)})`);
  return '';
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
    out.push(`${green('바라던 값')} ${JSON.stringify(cause.expected)}`);
    out.push(`${red('실제 값  ')} ${JSON.stringify(cause.actual)}`);
  }
  return out;
}

module.exports = async function* report(source) {
  const failures = [];
  const byFile = new Map();
  let current = null;
  let passed = 0;
  let skipped = 0;
  let started = Date.now();

  const open = (file) => {
    const name = shortFile(file);
    if (current === name) return '';
    current = name;
    const count = (byFile.get(name) || 0) + 1;
    byFile.set(name, count);
    return `\n${bold(blue('▌ ' + name))}\n`;
  };

  for await (const event of source) {
    const data = event.data || {};
    // 파일 하나가 통째로 죽은 경우는 검사 하나처럼 다루면 헷갈린다.
    const isFile = data.name && data.file && path.basename(data.file) === data.name;

    switch (event.type) {
      case 'test:pass': {
        if (isFile || data.nesting > 0) break;
        if (data.skip || data.todo) {
          skipped += 1;
          yield `${open(data.file)}  ${yellow('○')} ${dim(data.name)} ${grey(data.todo ? '(할 일)' : '(건너뜀)')}\n`;
          break;
        }
        passed += 1;
        yield `${open(data.file)}  ${green('✔')} ${data.name}${timing(data.details && data.details.duration_ms)}\n`;
        break;
      }
      case 'test:fail': {
        if (data.nesting > 0) break;
        const error = data.details && data.details.error;
        failures.push({ name: data.name, file: shortFile(data.file), error });
        const head = `${open(data.file)}  ${red('✘')} ${bold(data.name)}${timing(data.details && data.details.duration_ms)}\n`;
        const body = errorLines(error).map((line) => `      ${dim(line)}\n`).join('');
        yield head + body;
        break;
      }
      case 'test:stderr':
      case 'test:stdout': {
        const text = String(data.message || '').trimEnd();
        if (text) yield `${grey('    │ ' + text.split('\n').join('\n    │ '))}\n`;
        break;
      }
      case 'test:summary': {
        if (data.file) break; // 파일별 요약은 건너뛰고 전체만 쓴다
        const counts = data.counts || {};
        const total = counts.tests ?? passed + failures.length + skipped;
        const failed = counts.failed ?? failures.length;
        const ok = failed === 0;
        const took = ms(data.duration_ms ?? Date.now() - started);

        let out = `\n${grey('─'.repeat(52))}\n`;
        if (failures.length) {
          out += `${bold(red('실패한 검사'))}\n`;
          for (const fail of failures) {
            out += `  ${red('✘')} ${fail.name}  ${grey(fail.file)}\n`;
            for (const line of errorLines(fail.error)) out += `      ${dim(line)}\n`;
          }
          out += `${grey('─'.repeat(52))}\n`;
        }

        const parts = [
          `${green('통과')} ${greenBold(counts.passed ?? passed)}`,
          failed ? `${red('실패')} ${redBold(failed)}` : `${grey('실패 0')}`,
        ];
        if (counts.skipped) parts.push(`${yellow('건너뜀')} ${counts.skipped}`);
        if (counts.todo) parts.push(`${yellow('할 일')} ${counts.todo}`);
        parts.push(`${grey('모두')} ${total}`);
        parts.push(`${grey('걸린 시간')} ${took}`);

        out += `${parts.join(grey('  ·  '))}\n`;
        out += ok
          ? `${greenBold('✔ 모두 통과했습니다.')}\n`
          : `${redBold(`✘ ${failed}개가 실패했습니다.`)}\n`;
        yield out;
        break;
      }
      default:
        break;
    }
  }
};
