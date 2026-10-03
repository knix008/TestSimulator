'use strict';

/**
 * `npm test` 보고서 — node:test 의 사용자 지정 리포터.
 *
 * 진행 중인 검사 파일과 검사 하나하나를 지나가는 대로 찍고, 각 검사에 걸린
 * 시간을 붙이고, 마지막에 전체 요약을 낸다. 표시는 ASCII 기호만 쓴다 —
 * 한글 콘솔(코드페이지 949)에서 유니코드 체크 표시가 "?" 로 깨지기 때문이다.
 */

const path = require('path');

const useColor =
  process.env.NO_COLOR === undefined &&
  process.env.TERM !== 'dumb' &&
  (process.env.FORCE_COLOR !== undefined || process.stdout.isTTY);

const paint = (code) => (text) => (useColor ? `[${code}m${text}[0m` : String(text));

const dim = paint('2');
const bold = paint('1');
const red = paint('31');
const green = paint('32');
const yellow = paint('33');
const cyan = paint('36');
const grey = paint('90');
const redBold = paint('1;31');
const greenBold = paint('1;32');
const cyanBold = paint('1;36');

const RULE = '-'.repeat(60);

function shortFile(file) {
  if (!file) return '(알 수 없는 파일)';
  return path.relative(process.cwd(), file).replace(/\\/g, '/');
}

function ms(value) {
  const n = Number(value) || 0;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${Math.round(n)}ms`;
}

/** 느린 검사는 눈에 띄게 — 500ms 이상 노랑, 100ms 이상 회색. */
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
    out.push(`${green('바라던 값')} ${JSON.stringify(cause.expected)}`);
    out.push(`${red('실제 값  ')} ${JSON.stringify(cause.actual)}`);
  }
  return out;
}

module.exports = async function* report(source) {
  /** @type {{name: string, file: string, error: any}[]} */
  const failures = [];
  const slowest = [];
  let current = null;
  let passed = 0;
  let skipped = 0;
  const started = Date.now();

  // 파일이 바뀔 때만 파일 이름을 찍는다 — 어디까지 왔는지 보이도록.
  const open = (file) => {
    const name = shortFile(file);
    if (current === name) return '';
    current = name;
    return `\n${bold(cyan(`* ${name}`))}\n`;
  };

  for await (const event of source) {
    const data = event.data || {};
    const isFileLevel = data.name && data.file && path.basename(data.file) === data.name;
    const duration = data.details && data.details.duration_ms;

    switch (event.type) {
      case 'test:pass': {
        if (isFileLevel || data.nesting > 0) break;
        if (data.skip || data.todo) {
          skipped += 1;
          const mark = data.todo ? '할 일' : '건너뜀';
          yield `${open(data.file)}  ${yellow('o')} ${dim(data.name)} ${grey(`(${mark})`)}${timing(duration)}\n`;
          break;
        }
        passed += 1;
        slowest.push({ name: data.name, ms: Number(duration) || 0 });
        yield `${open(data.file)}  ${green('+')} ${data.name}${timing(duration)}\n`;
        break;
      }

      case 'test:fail': {
        if (data.nesting > 0) break;
        const error = data.details && data.details.error;
        failures.push({ name: data.name, file: shortFile(data.file), error });
        const head = `${open(data.file)}  ${red('x')} ${bold(data.name)}${timing(duration)}\n`;
        const body = errorLines(error)
          .map((line) => `      ${dim(line)}\n`)
          .join('');
        yield head + body;
        break;
      }

      case 'test:stderr':
      case 'test:stdout': {
        const text = String(data.message || '').trimEnd();
        if (text) yield `${grey(`    | ${text.split('\n').join('\n    | ')}`)}\n`;
        break;
      }

      case 'test:summary': {
        // 파일별 요약은 건너뛰고 전체 요약만 낸다.
        if (data.file) break;
        const counts = data.counts || {};
        const total = counts.tests ?? passed + failures.length + skipped;
        const failed = counts.failed ?? failures.length;
        const took = ms(data.duration_ms ?? Date.now() - started);

        let out = `\n${grey(RULE)}\n`;

        if (failures.length) {
          out += `${bold(red('실패한 검사'))}\n`;
          for (const fail of failures) {
            out += `  ${red('x')} ${fail.name}  ${grey(fail.file)}\n`;
            for (const line of errorLines(fail.error)) out += `      ${dim(line)}\n`;
          }
          out += `${grey(RULE)}\n`;
        } else {
          // 통과했을 때는 오래 걸린 검사 셋을 알려 준다.
          const top = slowest.sort((a, b) => b.ms - a.ms).slice(0, 3).filter((t) => t.ms >= 20);
          if (top.length) {
            out += `${grey('오래 걸린 검사')} ${top.map((t) => `${t.name}${dim(` ${ms(t.ms)}`)}`).join(grey(' · '))}\n`;
            out += `${grey(RULE)}\n`;
          }
        }

        const parts = [
          `${green('통과')} ${greenBold(counts.passed ?? passed)}`,
          failed ? `${red('실패')} ${redBold(failed)}` : grey('실패 0')
        ];
        if (counts.skipped) parts.push(`${yellow('건너뜀')} ${counts.skipped}`);
        if (counts.todo) parts.push(`${yellow('할 일')} ${counts.todo}`);
        parts.push(`${grey('모두')} ${cyanBold(total)}`);
        parts.push(`${grey('걸린 시간')} ${took}`);

        out += `${parts.join(grey('  |  '))}\n`;
        out += failed ? `${redBold(`x ${failed}개가 실패했습니다.`)}\n` : `${greenBold('+ 모두 통과했습니다.')}\n`;
        yield out;
        break;
      }

      default:
        break;
    }
  }
};
