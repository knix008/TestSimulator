// Vitest reporter: no live "..." progress. After the run, print every test
// under its file with a coloured pass / fail / skip mark.

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
};

export const MARK = { pass: '✓', fail: '✗', skip: '○' };

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
  const items = tests.map((t) => ({
    name: taskName(t),
    state: testState(t),
    ms: Number(t.result?.duration) || 0,
    error: firstError(t),
  }));
  let pass = 0;
  let fail = 0;
  let skip = 0;
  const failed = [];
  for (const t of items) {
    if (t.state === 'pass') pass += 1;
    else if (t.state === 'fail') {
      fail += 1;
      failed.push(t.name);
    } else if (t.state === 'skip') skip += 1;
  }
  const name = String(file.name || file.filepath || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop();
  return {
    name: name || 'unknown',
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
  const i = text.lastIndexOf(' › ');
  if (i < 0) return { group: '', title: text };
  return { group: text.slice(0, i), title: text.slice(i + 3) };
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
  const lines = [`${title}  ${countsLine(row, color)}`];
  const items = row.items || [];
  for (const item of items) {
    const mark = paint(markTint(item.state), MARK[item.state] || '·', color);
    const { group, title: itemTitle } = splitItemName(item.name);
    const groupText = group ? `${paint('green', group, color)} › ` : '';
    const time = item.ms ? paint('dim', `  ${formatDuration(item.ms)}`, color) : '';
    lines.push(`  ${mark}  ${groupText}${itemTitle}${time}`);
    if (item.state === 'fail' && item.error) {
      lines.push(`     ${paint('red', item.error, color)}`);
    }
  }
  return lines.join('\n');
}

export function formatSummary(rows, { duration = 0, color = false } = {}) {
  const files = rows.length;
  const pass = rows.reduce((n, r) => n + r.pass, 0);
  const fail = rows.reduce((n, r) => n + r.fail, 0);
  const skip = rows.reduce((n, r) => n + r.skip, 0);
  const head = paint('bold', paint('brightCyan', '테스트 결과', color), color);
  const rule = paint('dim', '─'.repeat(56), color);
  const blocks = rows.map((row) => formatFileBlock(row, { color }));
  const totals = [
    paint('cyan', `파일 ${files}개`, color),
    paint('brightGreen', `통과 ${pass}`, color),
    paint(fail ? 'brightRed' : 'dim', `실패 ${fail}`, color),
    paint(skip ? 'brightYellow' : 'dim', `건너뜀 ${skip}`, color),
    paint('dim', formatDuration(duration), color),
  ].join(paint('dim', '  ·  ', color));

  const body = [head, '', ...blocks.flatMap((b, i) => (i ? ['', b] : [b])), '', rule, totals];
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
