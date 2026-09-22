// Compact vitest reporter: one row per file, then a totals line.
// Used as the default `npm test` summary so results are easy to scan.

export function collectTests(tasks, out = []) {
  for (const task of tasks || []) {
    if (task.type === 'test') out.push(task);
    if (task.tasks?.length) collectTests(task.tasks, out);
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

export function fileStats(file) {
  const tests = collectTests(file.tasks);
  let pass = 0;
  let fail = 0;
  let skip = 0;
  const failed = [];
  for (const t of tests) {
    const state = t.result?.state || (t.mode === 'skip' || t.mode === 'todo' ? t.mode : '');
    if (state === 'pass') pass += 1;
    else if (state === 'fail') {
      fail += 1;
      failed.push(taskName(t));
    } else if (state === 'skip' || state === 'todo') skip += 1;
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
  };
}

export function formatDuration(ms) {
  const n = Number(ms) || 0;
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(1)}s`;
}

function displayWidth(value) {
  let w = 0;
  for (const ch of String(value)) {
    w += /[\u1100-\u115F\u2329\u232A\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch) ? 2 : 1;
  }
  return w;
}

function pad(value, width, right = false) {
  const s = String(value);
  const extra = Math.max(0, width - displayWidth(s));
  const space = ' '.repeat(extra);
  return right ? space + s : s + space;
}

export function formatSummary(rows, { duration = 0 } = {}) {
  const files = rows.length;
  const pass = rows.reduce((n, r) => n + r.pass, 0);
  const fail = rows.reduce((n, r) => n + r.fail, 0);
  const skip = rows.reduce((n, r) => n + r.skip, 0);
  const nameW = Math.max(24, ...rows.map((r) => displayWidth(r.name)));
  const line = '-'.repeat(nameW + 40);
  const body = [
    '테스트 결과',
    line,
    `${pad('파일', nameW)}  ${pad('통과', 6, true)}  ${pad('실패', 6, true)}  ${pad('건너뜀', 8, true)}  ${pad('시간', 8, true)}`,
    line,
    ...rows.map((r) => (
      `${pad(r.name, nameW)}  ${pad(r.pass, 6, true)}  ${pad(r.fail, 6, true)}  ${pad(r.skip, 8, true)}  ${pad(formatDuration(r.ms), 8, true)}`
    )),
    line,
    `파일 ${files}개  ·  통과 ${pass}  ·  실패 ${fail}  ·  건너뜀 ${skip}  ·  ${formatDuration(duration)}`,
  ];
  const failed = rows.flatMap((r) => r.failed.map((name) => `  ${r.name}  ›  ${name}`));
  if (failed.length) {
    body.push('', '실패한 테스트', ...failed);
  }
  return body.join('\n');
}

export default class SummaryReporter {
  onFinished(files = [], errors = []) {
    const rows = (files || []).map(fileStats);
    const duration = rows.reduce((n, r) => n + r.ms, 0);
    const text = formatSummary(rows, { duration });
    console.log(`\n${text}\n`);
    if (errors?.length) {
      console.log(`리포터 오류 ${errors.length}건\n`);
    }
  }
}
