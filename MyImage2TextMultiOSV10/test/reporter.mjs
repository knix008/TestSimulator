// Custom reporter for `node --test`. Groups tests into categories, prints each
// test as it finishes with its duration, and ends with an aligned summary.
//
//   node --test --test-concurrency=1 --test-reporter=./test/reporter.mjs test/*.test.js

import path from 'node:path';

const CATEGORIES = {
  'aspect.test.js': { title: '비율 계산', color: '36' },
  'raster.test.js': { title: '이미지 형식 디코딩', color: '35' },
  'sample.test.js': { title: '픽셀 샘플링', color: '34' },
  'export.test.js': { title: '이미지 내보내기', color: '32' },
  'recent.test.js': { title: '최근 파일 · 폴더', color: '91' },
  'textFile.test.js': { title: '텍스트 파일 · 줄바꿈', color: '96' },
  'build.test.js': { title: '빌드 · 설치', color: '33' },
};
const FALLBACK_COLORS = ['96', '95', '94', '93', '92'];

const useColor = !process.env.NO_COLOR && (process.stdout.isTTY || !!process.env.FORCE_COLOR);
const paint = (code, text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
const green = (s) => paint('32', s);
const red = (s) => paint('31', s);
const yellow = (s) => paint('33', s);
const dim = (s) => paint('2', s);
const bold = (s) => paint('1', s);

const W = { index: 7, name: 58, time: 9, title: 20, count: 6, bar: 20 };

function displayWidth(text) {
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    width += code >= 0x1100 && (
      code <= 0x115f
      || (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f)
      || (code >= 0xac00 && code <= 0xd7a3)
      || (code >= 0xf900 && code <= 0xfaff)
      || (code >= 0xfe30 && code <= 0xfe6f)
      || (code >= 0xff00 && code <= 0xff60)
      || (code >= 0xffe0 && code <= 0xffe6)
    ) ? 2 : 1;
  }
  return width;
}

const padEnd = (text, width) => text + ' '.repeat(Math.max(0, width - displayWidth(text)));
const padStart = (text, width) => ' '.repeat(Math.max(0, width - displayWidth(text))) + text;

function fit(text, width) {
  if (displayWidth(text) <= width) return padEnd(text, width);
  let out = '';
  for (const ch of text) {
    if (displayWidth(out + ch) > width - 1) break;
    out += ch;
  }
  return padEnd(`${out}…`, width);
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms >= 10) return `${ms.toFixed(0)} ms`;
  return `${ms.toFixed(2)} ms`;
}

function timeColor(ms) {
  if (ms >= 100) return red;
  if (ms >= 10) return yellow;
  return green;
}

function fileNameOf(event) {
  const raw = event.data?.file || (event.data?.nesting === 0 ? event.data?.name : '');
  if (!raw) return '';
  const cleaned = raw.startsWith('file:') ? new URL(raw).pathname.replace(/^\/([A-Za-z]:)/, '$1') : raw;
  return path.basename(cleaned);
}

function isFileEvent(event, fileName) {
  const name = event.data?.name;
  if (!fileName || !name) return true;
  if (name === fileName || path.basename(name) === fileName) return true;
  return (name.includes('\\') || name.includes('/')) && name.endsWith(fileName);
}

function errorText(details) {
  const error = details?.error;
  if (!error) return '';
  const cause = error.cause || error;
  const message = String(cause.message || cause).replace(/\s+/g, ' ').trim();
  const stack = typeof cause.stack === 'string'
    ? cause.stack.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('at ')).slice(0, 2)
    : [];
  return [red(message), ...stack.map(dim)].map((line) => `${' '.repeat(W.index + 6)}${line}`).join('\n');
}

function bar(part, whole, width, color) {
  const filled = whole > 0 ? Math.max(part > 0 ? 1 : 0, Math.round((part / whole) * width)) : 0;
  return paint(color, '█'.repeat(filled)) + dim('░'.repeat(width - filled));
}

export default async function* reporter(source) {
  const started = Date.now();
  const categories = new Map();
  const queued = new Map();
  let currentFile = '';
  let finished = 0;

  const category = (fileName) => {
    let cat = categories.get(fileName);
    if (!cat) {
      const known = CATEGORIES[fileName];
      cat = {
        file: fileName,
        title: known?.title || fileName.replace(/\.test\.m?js$/, ''),
        color: known?.color || FALLBACK_COLORS[categories.size % FALLBACK_COLORS.length],
        items: [],
        duration: 0,
      };
      categories.set(fileName, cat);
    }
    return cat;
  };

  const rule = '─'.repeat(2 + W.index + 2 + W.name + 1 + W.time);
  yield `\n${paint('1;97;46', '  Image2Text 테스트  ')} ${dim(new Date().toLocaleString())}\n`;
  yield `${dim(rule)}\n`;
  yield `${dim(`   ${padStart('진행', W.index)}  ${padEnd('테스트', W.name)} ${padStart('시간', W.time)}`)}\n`;

  for await (const event of source) {
    const fileName = fileNameOf(event);
    const isFile = isFileEvent(event, fileName);
    if (event.type === 'test:enqueue' && !isFile) queued.set(fileName, (queued.get(fileName) || 0) + 1);

    if (event.type === 'test:start' && !isFile && fileName && fileName !== currentFile) {
      currentFile = fileName;
      const cat = category(fileName);
      yield `\n${paint(`1;${cat.color}`, `▶ ${cat.title}`)}  ${dim(cat.file)}\n`;
      continue;
    }

    if ((event.type !== 'test:pass' && event.type !== 'test:fail') || isFile) continue;
    const cat = category(fileName);
    const duration = event.data.details?.duration_ms || 0;
    const skipped = event.data.skip != null && event.data.skip !== false;
    const todo = event.data.todo != null && event.data.todo !== false;
    const status = event.type === 'test:fail' ? 'fail' : skipped || todo ? 'skip' : 'pass';
    cat.items.push({ name: event.data.name, status, duration });
    cat.duration += duration;
    finished += 1;

    const mark = status === 'pass' ? green('✔') : status === 'fail' ? red('✘') : yellow('○');
    const index = paint(cat.color, padStart(`${cat.items.length}/${queued.get(fileName) || cat.items.length}`, W.index));
    const name = fit(event.data.name, W.name);
    const shown = status === 'fail' ? red(name) : status === 'skip' ? yellow(name) : name;
    const time = timeColor(duration)(padStart(formatDuration(duration), W.time));
    yield `  ${mark}${index}  ${shown} ${time}\n`;
    if (status === 'fail') {
      const detail = errorText(event.data.details);
      if (detail) yield `${detail}\n`;
    }
  }

  const rows = [...categories.values()];
  const count = (cat, status) => cat.items.filter((item) => item.status === status).length;
  const totals = { pass: 0, fail: 0, skip: 0, duration: 0 };
  for (const cat of rows) {
    for (const status of ['pass', 'fail', 'skip']) totals[status] += count(cat, status);
    totals.duration += cat.duration;
  }
  const elapsed = Date.now() - started;

  const num = (value, color) => (value ? color : dim)(padStart(String(value), W.count));
  const head = `  ${padEnd('분류', W.title)} ${padStart('통과', W.count)} ${padStart('실패', W.count)} ${padStart('건너뜀', W.count)} ${padStart('시간', W.time)}  ${padEnd('시간 비율', W.bar)}`;
  const summaryRule = '─'.repeat(displayWidth(head) + 1);

  yield `\n${paint('1;97;45', '  결과 요약  ')}\n`;
  yield `${dim(head)}\n${dim(summaryRule)}\n`;
  for (const cat of rows) {
    const failed = count(cat, 'fail');
    const title = paint(failed ? '1;31' : `1;${cat.color}`, padEnd(cat.title, W.title));
    yield `  ${title} ${num(count(cat, 'pass'), green)} ${num(failed, red)} ${num(count(cat, 'skip'), yellow)} ${padStart(formatDuration(cat.duration), W.time)}  ${bar(cat.duration, totals.duration, W.bar, cat.color)}\n`;
  }
  yield `${dim(summaryRule)}\n`;
  const totalTitle = paint(totals.fail ? '1;31' : '1;32', padEnd('합계', W.title));
  yield `  ${totalTitle} ${num(totals.pass, green)} ${num(totals.fail, red)} ${num(totals.skip, yellow)} ${padStart(formatDuration(totals.duration), W.time)}\n`;
  yield `  ${dim(padEnd('전체 실행 시간', W.title))} ${padStart(formatDuration(elapsed), W.count * 3 + 2 + W.time + 1)}\n\n`;

  if (totals.fail) {
    yield `${paint('1;97;41', `  실패 ${totals.fail}개 / 전체 ${finished}개  `)}\n`;
  } else {
    yield `${paint('1;30;42', `  모두 통과 ${totals.pass}/${finished}  `)}\n`;
  }
}
