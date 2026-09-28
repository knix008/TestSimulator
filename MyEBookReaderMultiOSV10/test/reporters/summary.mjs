// Vitest reporter: no live "..." progress. After the run, every test is printed
// under its file, the files are grouped by the kind of thing they test, and each
// category gets its own totals before the overall summary.
//
// The categories are what the task asked for — results sorted by kind with a
// summary — and they also make a regression obvious at a glance: a failure in
// "형식(Formats)" is a book that stopped opening, one in "GUI" is a control that
// stopped working.

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightCyan: '\x1b[96m',
  magenta: '\x1b[95m',
};

export const MARK = { pass: '✓', fail: '✗', skip: '○' };

/** Which category a test file belongs to. The order is the printing order. */
export const CATEGORIES = [
  { id: 'formats', label: '책 형식 (Formats)', files: ['epub', 'mobi', 'fb2', 'cbz', 'plaintext', 'book', 'pdfbook', 'image'] },
  { id: 'engine', label: '핵심 엔진 (Engine)', files: ['inflate', 'zip', 'html', 'markdown', 'search', 'library', 'view', 'print'] },
  { id: 'state', label: '설정·상태 (Settings & state)', files: ['settings', 'themes', 'menus', 'tabs', 'folders', 'history', 'platform', 'gallery', 'gallery-store'] },
  { id: 'gui', label: 'GUI 동작 (User interface)', files: ['app', 'components', 'bookview', 'dialogs', 'menuhost', 'dialoghost', 'panels', 'toolbar', 'gallery-view', 'printpreview'] },
  { id: 'i18n', label: '언어 (Language)', files: ['i18n'] },
  { id: 'build', label: '빌드·패키징 (Build & packaging)', files: ['package', 'electron-contract', 'icon-assets', 'ico', 'installer', 'reporter'] },
];

export function categoryOf(fileName) {
  const base = String(fileName || '').replace(/\.test\.(js|jsx|mjs)$/, '');
  for (const category of CATEGORIES) {
    if (category.files.includes(base)) return category.id;
  }
  return 'other';
}

export function categoryLabel(id) {
  return CATEGORIES.find((c) => c.id === id)?.label || '기타 (Other)';
}

/**
 * How wide a string is on a terminal. Korean (and CJK generally) takes two
 * columns per character, so padding by `String.length` leaves a summary whose
 * columns wander. This counts what the terminal will actually draw.
 */
export function displayWidth(text) {
  let width = 0;
  for (const char of String(text ?? '')) {
    const code = char.codePointAt(0);
    if (code === 0x200b) continue;
    const wide = (code >= 0x1100 && code <= 0x115f)
      || (code >= 0x2e80 && code <= 0xa4cf)
      || (code >= 0xac00 && code <= 0xd7a3)
      || (code >= 0xf900 && code <= 0xfaff)
      || (code >= 0xfe30 && code <= 0xfe6f)
      || (code >= 0xff00 && code <= 0xff60)
      || (code >= 0xffe0 && code <= 0xffe6)
      || (code >= 0x1f300 && code <= 0x1f64f);
    width += wide ? 2 : 1;
  }
  return width;
}

/** Pads to a column width the terminal agrees with. */
export function padDisplay(text, width, align = 'left') {
  const value = String(text ?? '');
  const gap = Math.max(0, width - displayWidth(value));
  if (align === 'right') return ' '.repeat(gap) + value;
  return value + ' '.repeat(gap);
}

export function collectTests(tasks, out = [], suite = null) {
  for (const task of tasks || []) {
    if (suite && !task.suite) task.suite = suite;
    if (task.type === 'test') out.push(task);
    if (task.tasks?.length) {
      collectTests(task.tasks, out, task.type === 'suite' ? task : suite);
    }
  }
  return out;
}

export function taskName(task) {
  const parts = [];
  let cur = task;
  while (cur) {
    if (cur.name) parts.unshift(cur.name);
    cur = cur.suite || cur.file || null;
    if (cur?.filepath) break;
  }
  return parts.join(' › ');
}

export function testState(task) {
  const state = task?.result?.state;
  if (state === 'pass' || state === 'fail') return state;
  if (state === 'skip' || state === 'todo') return 'skip';
  if (task?.mode === 'skip' || task?.mode === 'todo') return 'skip';
  return state || '';
}

function firstError(task) {
  const err = task?.result?.errors?.[0];
  if (!err) return '';
  const raw = err.message || err.toString?.() || '';
  return String(raw).split('\n')[0].trim();
}

export function fileStats(file) {
  const tests = collectTests(file.tasks);
  const items = tests.map((task) => ({
    name: taskName(task),
    state: testState(task),
    ms: Number(task.result?.duration) || 0,
    error: firstError(task),
  }));
  let pass = 0;
  let fail = 0;
  let skip = 0;
  const failed = [];
  for (const item of items) {
    if (item.state === 'pass') pass += 1;
    else if (item.state === 'fail') { fail += 1; failed.push(item.name); }
    else if (item.state === 'skip') skip += 1;
  }
  const name = String(file.name || file.filepath || '').replace(/\\/g, '/').split('/').pop();
  return {
    name: name || 'unknown',
    category: categoryOf(name),
    pass,
    fail,
    skip,
    total: tests.length,
    ms: Number(file.result?.duration) || 0,
    failed,
    items,
  };
}

export function formatDuration(ms) {
  const n = Number(ms) || 0;
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(1)}s`;
}

export function useColor({ env = process.env, tty = process.stdout?.isTTY } = {}) {
  if (env?.NO_COLOR) return false;
  if (env?.FORCE_COLOR && env.FORCE_COLOR !== '0') return true;
  return !!tty;
}

export function paint(style, text, enabled = true) {
  if (!enabled || !style || !ANSI[style]) return String(text);
  return `${ANSI[style]}${text}${ANSI.reset}`;
}

export function stripAnsi(text) {
  return String(text).replace(/\x1b\[[0-9;]*m/g, '');
}

function markTint(state) {
  if (state === 'pass') return 'brightGreen';
  if (state === 'fail') return 'brightRed';
  if (state === 'skip') return 'brightYellow';
  return 'dim';
}

export function splitItemName(name) {
  const text = String(name || '');
  const at = text.lastIndexOf(' › ');
  if (at < 0) return { group: '', title: text };
  return { group: text.slice(0, at), title: text.slice(at + 3) };
}

function countsLine(row, color) {
  const bits = [];
  if (row.pass) bits.push(paint('brightGreen', `${row.pass} 통과`, color));
  if (row.fail) bits.push(paint('brightRed', `${row.fail} 실패`, color));
  if (row.skip) bits.push(paint('brightYellow', `${row.skip} 건너뜀`, color));
  if (!bits.length) bits.push(paint('dim', '0건', color));
  bits.push(paint('dim', formatDuration(row.ms), color));
  return bits.join(paint('dim', '  ·  ', color));
}

export function formatFileBlock(row, { color = false } = {}) {
  const title = paint('bold', paint('green', row.name, color), color);
  const lines = [`  ${title}  ${countsLine(row, color)}`];
  for (const item of row.items || []) {
    const mark = paint(markTint(item.state), MARK[item.state] || '·', color);
    const { group, title: itemTitle } = splitItemName(item.name);
    const groupText = group ? `${paint('green', group, color)} › ` : '';
    const time = item.ms ? paint('dim', `  ${formatDuration(item.ms)}`, color) : '';
    lines.push(`    ${mark}  ${groupText}${itemTitle}${time}`);
    if (item.state === 'fail' && item.error) {
      lines.push(`       ${paint('red', item.error, color)}`);
    }
  }
  return lines.join('\n');
}

export function totals(rows) {
  return {
    files: rows.length,
    pass: rows.reduce((n, r) => n + r.pass, 0),
    fail: rows.reduce((n, r) => n + r.fail, 0),
    skip: rows.reduce((n, r) => n + r.skip, 0),
    ms: rows.reduce((n, r) => n + r.ms, 0),
  };
}

/** Groups the file rows into the printing categories, dropping empty ones. */
export function groupByCategory(rows) {
  const ids = [...CATEGORIES.map((c) => c.id), 'other'];
  return ids
    .map((id) => ({ id, label: categoryLabel(id), rows: rows.filter((row) => row.category === id) }))
    .filter((group) => group.rows.length);
}

function categoryHeading(group, color) {
  const sums = totals(group.rows);
  const head = paint('bold', paint('brightCyan', `▌ ${group.label}`, color), color);
  const line = [
    paint('cyan', `파일 ${sums.files}`, color),
    paint('brightGreen', `통과 ${sums.pass}`, color),
    paint(sums.fail ? 'brightRed' : 'dim', `실패 ${sums.fail}`, color),
    paint(sums.skip ? 'brightYellow' : 'dim', `건너뜀 ${sums.skip}`, color),
    paint('dim', formatDuration(sums.ms), color),
  ].join(paint('dim', '  ·  ', color));
  return `${head}  ${line}`;
}

/**
 * The closing summary: one row per category, in columns that line up — the
 * name, what passed, how many there were, how long it took, and the verdict.
 */
export function formatSummaryTable(rows, { color = false } = {}) {
  const groups = groupByCategory(rows);
  const head = { label: '분류 (Category)', pass: '통과', total: '전체', ms: '시간', state: '결과' };
  const body = groups.map((group) => {
    const sums = totals(group.rows);
    return {
      label: group.label,
      pass: String(sums.pass),
      total: String(sums.pass + sums.fail + sums.skip),
      ms: formatDuration(sums.ms),
      state: sums.fail ? `실패 ${sums.fail}` : '모두 통과',
      failed: sums.fail,
    };
  });

  const all = totals(rows);
  const last = {
    label: '합계 (Total)',
    pass: String(all.pass),
    total: String(all.pass + all.fail + all.skip),
    ms: formatDuration(all.ms),
    state: all.fail ? `실패 ${all.fail}` : '전체 성공',
    failed: all.fail,
  };

  const widths = {
    label: Math.max(...[head, ...body, last].map((row) => displayWidth(row.label))),
    pass: Math.max(...[head, ...body, last].map((row) => displayWidth(row.pass))),
    total: Math.max(...[head, ...body, last].map((row) => displayWidth(row.total))),
    ms: Math.max(...[head, ...body, last].map((row) => displayWidth(row.ms))),
    state: Math.max(...[head, ...body, last].map((row) => displayWidth(row.state))),
  };

  const line = (row, tint) => [
    padDisplay(row.label, widths.label),
    padDisplay(row.pass, widths.pass, 'right'),
    padDisplay(row.total, widths.total, 'right'),
    padDisplay(row.ms, widths.ms, 'right'),
    padDisplay(row.state, widths.state),
  ].map((cell, i) => {
    if (!tint) return cell;
    if (i === 0) return paint('cyan', cell, color);
    if (i === 1) return paint('brightGreen', cell, color);
    if (i === 4) return paint(row.failed ? 'brightRed' : 'brightGreen', cell, color);
    return paint('dim', cell, color);
  }).join('  │  ');

  const rule = paint('dim', '─'.repeat(displayWidth(stripAnsi(line(head, false)))), color);
  return [
    paint('bold', line(head, false), color),
    rule,
    ...body.map((row) => line(row, true)),
    rule,
    paint('bold', line(last, true), color),
  ].join('\n');
}

export function formatSummary(rows, { duration = 0, color = false } = {}) {
  const groups = groupByCategory(rows);
  const sums = totals(rows);
  const rule = paint('dim', '─'.repeat(64), color);
  const body = [paint('bold', paint('brightCyan', 'MyEBookReader — 테스트 결과', color), color), ''];

  for (const group of groups) {
    body.push(categoryHeading(group, color));
    for (const row of group.rows) body.push(formatFileBlock(row, { color }));
    body.push('');
  }

  body.push(rule);
  body.push(paint('bold', '요약 (Summary)', color));
  body.push('');
  body.push(formatSummaryTable(rows, { color }));
  body.push(rule);
  body.push([
    paint('cyan', `파일 ${sums.files}개`, color),
    paint('dim', formatDuration(duration || sums.ms), color),
    sums.fail
      ? paint('brightRed', '전체 실패', color)
      : paint('brightGreen', '전체 성공', color),
  ].join(paint('dim', '  ·  ', color)));

  return body.join('\n');
}

export default class SummaryReporter {
  onFinished(files = [], errors = []) {
    const rows = (files || []).map(fileStats);
    const duration = rows.reduce((n, r) => n + r.ms, 0);
    const text = formatSummary(rows, { duration, color: useColor() });
    console.log(`\n${text}\n`);
    if (errors?.length) {
      console.log(paint('brightRed', `리포터 오류 ${errors.length}건`, useColor()) + '\n');
    }
  }
}
