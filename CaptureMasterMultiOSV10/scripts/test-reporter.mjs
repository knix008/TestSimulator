// Custom reporter for `node --test`. Groups tests by file, prints each one as it
// finishes (with its duration) and ends with a column-aligned summary.
//
// Usage: node --test --test-concurrency=1 --test-reporter=./scripts/test-reporter.mjs test/*.test.mjs

import path from 'node:path';

const CATEGORIES = {
  'settings.test.mjs': 'Settings',
  'captureHistory.test.mjs': 'Capture history',
  'printLayout.test.mjs': 'Print layout',
  'themes.test.mjs': 'Themes',
  'document.test.mjs': 'Documents',
  'ico.test.mjs': 'Icons',
  'history.test.mjs': 'Undo',
  'format.test.mjs': 'Formatting',
  'errors.test.mjs': 'Errors',
  'selection.test.mjs': 'Selection',
  'annotations.test.mjs': 'Annotations',
  'dialogs.test.mjs': 'Dialogs',
  'recording.test.mjs': 'Recording',
  'images.test.mjs': 'Images',
  'menus.test.mjs': 'Menus',
  'fonts.test.mjs': 'Fonts',
  'platform.test.mjs': 'Platform',
  'i18n.test.mjs': 'Language',
};

const useColor = !process.env.NO_COLOR && (process.stdout.isTTY || !!process.env.FORCE_COLOR);
const paint = (code, text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
const green = (s) => paint('32', s);
const red = (s) => paint('31', s);
const yellow = (s) => paint('33', s);
const cyan = (s) => paint('36', s);
const dim = (s) => paint('2', s);
const bold = (s) => paint('1', s);
const boldGreen = (s) => paint('1;32', s);
const boldRed = (s) => paint('1;31', s);

/** Terminal columns a string occupies. Korean (and other wide) characters count as 2. */
function displayWidth(text) {
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    width += code >= 0x1100 && (
      code <= 0x115f || code === 0x2329 || code === 0x232a
      || (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f)
      || (code >= 0xac00 && code <= 0xd7a3)
      || (code >= 0xf900 && code <= 0xfaff)
      || (code >= 0xfe10 && code <= 0xfe19)
      || (code >= 0xfe30 && code <= 0xfe6f)
      || (code >= 0xff00 && code <= 0xff60)
      || (code >= 0xffe0 && code <= 0xffe6)
    ) ? 2 : 1;
  }
  return width;
}

function padEnd(text, width) {
  const gap = width - displayWidth(text);
  return gap > 0 ? text + ' '.repeat(gap) : text;
}

function padStart(text, width) {
  const gap = width - displayWidth(text);
  return gap > 0 ? ' '.repeat(gap) + text : text;
}

/** Fits text into `width` columns, ending with an ellipsis when it is too long. */
function fit(text, width) {
  if (displayWidth(text) <= width) return padEnd(text, width);
  let out = '';
  let used = 0;
  for (const ch of text) {
    const wide = displayWidth(ch);
    if (used + wide > width - 1) break;
    out += ch;
    used += wide;
  }
  return padEnd(`${out}…`, width);
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms >= 10) return `${ms.toFixed(0)} ms`;
  return `${ms.toFixed(1)} ms`;
}

function fileNameOf(event) {
  if (!event.data) return '';
  const raw = event.data.file || (event.data.nesting === 0 ? event.data.name : '');
  if (!raw) return '';
  const cleaned = raw.startsWith('file:') ? new URL(raw).pathname.replace(/^\/([A-Za-z]:)/, '$1') : raw;
  return path.basename(cleaned);
}

function categoryTitle(fileName) {
  return CATEGORIES[fileName] || fileName.replace(/\.test\.mjs$/, '');
}

/** The runner also reports each file as a test. A slash inside a test name is not a path. */
function isFileEvent(event, fileName) {
  const name = event.data && event.data.name;
  if (!fileName || !name) return true;
  if (name === fileName || path.basename(name) === fileName) return true;
  return (name.includes('\\') || name.includes('/')) && name.endsWith(fileName);
}

function errorText(details) {
  const error = details && details.error;
  if (!error) return '';
  const message = String(error.message || error).replace(/\s+/g, ' ').trim();
  const stack = typeof error.stack === 'string'
    ? error.stack.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('at ')).slice(0, 2)
    : [];
  return [message, ...stack].map((line) => `       ${dim(line)}`).join('\n');
}

export default async function* reporter(source) {
  const started = Date.now();
  /** @type {Map<string, { file: string, title: string, items: object[], duration: number }>} */
  const categories = new Map();
  let currentFile = '';
  const queued = new Map();

  const category = (fileName) => {
    let cat = categories.get(fileName);
    if (!cat) {
      cat = { file: fileName, title: categoryTitle(fileName), items: [], duration: 0 };
      categories.set(fileName, cat);
    }
    return cat;
  };

  yield `${bold('CaptureMaster tests')}\n`;

  for await (const event of source) {
    const fileName = fileNameOf(event);
    const isFile = isFileEvent(event, fileName);
    if (event.type === 'test:enqueue' && !isFile) queued.set(fileName, (queued.get(fileName) || 0) + 1);

    if (event.type === 'test:start' && !isFile && fileName && fileName !== currentFile) {
      currentFile = fileName;
      const cat = category(currentFile);
      yield `\n${cyan(bold(cat.title))}  ${dim(cat.file)}\n`;
      continue;
    }

    if ((event.type !== 'test:pass' && event.type !== 'test:fail') || isFile) continue;
    const cat = category(fileName);
    const duration = event.data.details && event.data.details.duration_ms;
    const skipped = event.data.skip != null && event.data.skip !== false;
    const todo = event.data.todo != null && event.data.todo !== false;
    const status = event.type === 'test:fail' ? 'fail' : skipped ? 'skip' : todo ? 'todo' : 'pass';
    cat.items.push({ name: event.data.name, status, duration: duration || 0 });
    cat.duration += duration || 0;

    const mark = status === 'pass' ? green('✓') : status === 'fail' ? red('✗') : yellow('–');
    const progress = dim(padStart(`${cat.items.length}/${queued.get(fileName) || cat.items.length}`, 7));
    const name = fit(event.data.name, 72);
    const shown = status === 'fail' ? red(name) : name;
    const time = dim(padStart(formatDuration(duration || 0), 8));
    yield `  ${mark} ${progress}  ${shown} ${time}\n`;
    if (status === 'fail') {
      const detail = errorText(event.data.details);
      if (detail) yield `${detail}\n`;
    }
  }

  const rows = [...categories.values()];
  const totals = rows.reduce((sum, cat) => {
    for (const item of cat.items) sum[item.status] += 1;
    sum.duration += cat.duration;
    return sum;
  }, { pass: 0, fail: 0, skip: 0, todo: 0, duration: 0 });
  const elapsed = Date.now() - started;

  const COL = { title: 18, pass: 6, fail: 6, skip: 8, time: 10 };
  const head = `  ${padEnd('Category', COL.title)} ${padStart('Passed', COL.pass)} ${padStart('Failed', COL.fail)} ${padStart('Skipped', COL.skip)} ${padStart('Time', COL.time)}`;
  const rule = `  ${'─'.repeat(displayWidth(head.trim()) + 2)}`;
  const lineFor = (title, pass, fail, skip, duration, paintTitle) => {
    const passText = pass ? green(padStart(String(pass), COL.pass)) : dim(padStart(String(pass), COL.pass));
    const failText = fail ? red(padStart(String(fail), COL.fail)) : dim(padStart(String(fail), COL.fail));
    const skipText = skip ? yellow(padStart(String(skip), COL.skip)) : dim(padStart(String(skip), COL.skip));
    return `  ${paintTitle(padEnd(title, COL.title))} ${passText} ${failText} ${skipText} ${padStart(formatDuration(duration), COL.time)}`;
  };

  yield `\n${bold('Summary')}\n`;
  yield `${dim(head)}\n`;
  yield `${dim(rule)}\n`;
  for (const cat of rows) {
    const count = (status) => cat.items.filter((item) => item.status === status).length;
    const title = count('fail') ? red : (text) => text;
    yield `${lineFor(cat.title, count('pass'), count('fail'), count('skip') + count('todo'), cat.duration, title)}\n`;
  }
  yield `${dim(rule)}\n`;
  const totalTitle = totals.fail ? boldRed : boldGreen;
  yield `${lineFor('Total', totals.pass, totals.fail, totals.skip + totals.todo, totals.duration, totalTitle)}\n`;
  yield `${dim(`  Elapsed ${formatDuration(elapsed)}`)}\n`;
}
