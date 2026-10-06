// Reporter for `npm test` (node --test --test-reporter=./scripts/test-reporter.mjs).
//
// node --test prints every result the moment it finishes, so the files run in parallel come out
// interleaved. This one collects them and prints, once everything has run:
//   • the results grouped by area (one test file = one area), areas in name order; inside an area the
//     failures first, then skipped / todo, then the passes, each in name order, with the time it took
//   • the output the test processes wrote (warnings …), under the file that wrote it
//   • the failures in full: where, the message, the stack
//   • a summary table — tests / passed / failed / skipped / time per area, a bar of each area's share of
//     the time, the totals and the overall verdict
// While the tests run, a terminal shows one progress line. Colour follows NO_COLOR / FORCE_COLOR and
// otherwise whether stdout is a terminal.
import path from 'node:path';

const tty = !!process.stdout.isTTY;
const color = process.env.NO_COLOR ? false : process.env.FORCE_COLOR ? process.env.FORCE_COLOR !== '0' : tty;
const sgr = (code) => (s) => (color ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const c = {
  bold: sgr('1'), dim: sgr('2'),
  red: sgr('31'), green: sgr('32'), yellow: sgr('33'), blue: sgr('34'), magenta: sgr('35'), cyan: sgr('36'), gray: sgr('90'),
  okBadge: sgr('1;30;42'), failBadge: sgr('1;97;41'), warnBadge: sgr('1;30;43'), head: sgr('1;97;44'),
};

// The areas, by test file. A file not listed here is shown under its own name.
const AREAS = {
  archive: '압축 · Archive',
  'archive-names': '압축 파일 이름 · Archive names',
  exif: 'EXIF · Photo tags',
  format: '표시 형식 · Format',
  fsops: '파일 작업 · File ops',
  history: '실행 취소 · Undo history',
  i18n: '다국어 · Languages',
  jobs: '작업 · Jobs',
  media: '미디어 · Media',
  print: '인쇄 · Print',
  prompt: '프롬프트 · Prompt',
  samples: '샘플 파일 · Samples',
  session: '세션 · Session',
  settings: '설정 · Settings',
  syntax: '구문 강조 · Syntax',
  tar: 'TAR 형식 · Tar format',
  terminal: '터미널 · Terminal',
  termtext: '터미널 출력 · Term text',
  themes: '테마 · Themes',
};

// Display width: Hangul, CJK and full-width forms take two columns in a terminal.
function width(s) {
  let w = 0;
  for (const ch of String(s).replace(/\x1b\[[0-9;]*m/g, '')) {
    const p = ch.codePointAt(0);
    w += (p >= 0x1100 && p <= 0x115f) || (p >= 0x2e80 && p <= 0xa4cf) || (p >= 0xac00 && p <= 0xd7a3) || (p >= 0xf900 && p <= 0xfaff) || (p >= 0xfe30 && p <= 0xfe4f) || (p >= 0xff00 && p <= 0xff60) || (p >= 0xffe0 && p <= 0xffe6) ? 2 : 1;
  }
  return w;
}
const padEnd = (s, n) => s + ' '.repeat(Math.max(0, n - width(s)));
const padStart = (s, n) => ' '.repeat(Math.max(0, n - width(s))) + s;

function fmtMs(ms) {
  if (!Number.isFinite(ms)) return '';
  if (ms < 1) return `${ms.toFixed(2)} ms`;
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}
// slow tests stand out: ≥ 1 s yellow, ≥ 5 s magenta
const timeColor = (ms) => (ms >= 5000 ? c.magenta : ms >= 1000 ? c.yellow : c.gray);

const areaKey = (file) => (file ? path.basename(file).replace(/\.test\.[cm]?js$/, '').replace(/\.[cm]?js$/, '') : '');
const areaLabel = (key) => AREAS[key] || key || '(기타)';
const STATUS_ORDER = { fail: 0, skip: 1, todo: 2, pass: 3 };
const ICON = { pass: c.green('✔'), fail: c.red('✖'), skip: c.yellow('↷'), todo: c.cyan('…') };

function errorText(err) {
  const e = err && err.cause ? err.cause : err;
  if (!e) return '';
  const lines = String(e.stack || e.message || e).split('\n');
  return lines.filter((l) => !/\(node:|at node:|node_modules[\\/]/.test(l)).slice(0, 14).join('\n');
}

export default async function* reporter(source) {
  const areas = new Map();   // key → { key, file, tests: [], output: [] }
  const area = (file) => {
    const key = areaKey(file);
    if (!areas.has(key)) areas.set(key, { key, file, tests: [], output: [] });
    return areas.get(key);
  };
  let total = null;          // duration of the whole run (test:summary of the run)
  const t0 = Date.now();
  let done = 0, failed = 0;
  let progressShown = false;

  const progress = (name) => {
    if (!tty) return '';
    progressShown = true;
    const cols = (process.stdout.columns || 100) - 1;
    let line = `${c.cyan('⏳')} 실행 중 ${c.bold(done)}${failed ? c.red(` (실패 ${failed})`) : ''}  ${c.dim(name)}`;
    if (width(line) > cols) line = line.slice(0, cols);
    return `\r\x1b[2K${line}`;
  };

  for await (const ev of source) {
    const d = ev.data || {};
    switch (ev.type) {
      case 'test:pass':
      case 'test:fail': {
        if (d.details && d.details.type === 'suite') break;
        const status = d.skip !== undefined && d.skip !== false ? 'skip' : d.todo !== undefined && d.todo !== false ? 'todo' : ev.type === 'test:fail' ? 'fail' : 'pass';
        area(d.file).tests.push({ name: d.name, status, ms: d.details ? d.details.duration_ms : NaN, error: d.details && d.details.error, line: d.line, file: d.file, nesting: d.nesting || 0 });
        done += 1;
        if (status === 'fail') failed += 1;
        const p = progress(d.name);
        if (p) yield p;
        break;
      }
      case 'test:stderr':
      case 'test:stdout': {
        const msg = String(d.message || '').replace(/\s+$/, '');
        if (msg) area(d.file).output.push({ stream: ev.type === 'test:stderr' ? 'err' : 'out', msg });
        break;
      }
      case 'test:summary':
        if (!d.file && d.duration_ms !== undefined) total = d.duration_ms;
        break;
      default:
        break;
    }
  }

  const out = [];
  if (progressShown) out.push('\r\x1b[2K');
  const list = [...areas.values()].filter((a) => a.tests.length || a.output.length)
    .sort((a, b) => areaLabel(a.key).localeCompare(areaLabel(b.key), 'ko'));
  for (const a of list) {
    a.tests.sort((x, y) => STATUS_ORDER[x.status] - STATUS_ORDER[y.status] || x.name.localeCompare(y.name, 'en', { numeric: true }));
    a.count = { pass: 0, fail: 0, skip: 0, todo: 0 };
    for (const t of a.tests) a.count[t.status] += 1;
    a.ms = a.tests.reduce((s, t) => s + (t.nesting === 0 && Number.isFinite(t.ms) ? t.ms : 0), 0);
  }

  // ── results by area ──
  out.push('', c.head(' 테스트 결과 · Test results '), '');
  for (const a of list) {
    if (!a.tests.length) continue;
    const bad = a.count.fail > 0;
    const mark = bad ? c.red('▌') : c.green('▌');
    const counts = [`${a.tests.length}개`, c.green(`통과 ${a.count.pass}`), a.count.fail ? c.red(`실패 ${a.count.fail}`) : '', a.count.skip + a.count.todo ? c.yellow(`건너뜀 ${a.count.skip + a.count.todo}`) : ''].filter(Boolean).join(c.gray(' · '));
    out.push(`${mark} ${c.bold(areaLabel(a.key))}  ${c.gray(a.file ? path.basename(a.file) : '')}  ${counts}  ${timeColor(a.ms)(fmtMs(a.ms))}`);
    for (const t of a.tests) {
      const name = t.status === 'fail' ? c.red(t.name) : t.status === 'pass' ? t.name : c.yellow(t.name);
      out.push(`   ${ICON[t.status]} ${timeColor(t.ms)(padStart(fmtMs(t.ms), 10))}  ${'  '.repeat(t.nesting)}${name}`);
    }
    out.push('');
  }

  // ── what the test processes printed ──
  const withOutput = list.filter((a) => a.output.length);
  if (withOutput.length) {
    out.push(c.warnBadge(' 테스트 중 출력 · Output '), '');
    for (const a of withOutput) {
      out.push(`${c.yellow('▌')} ${c.bold(areaLabel(a.key))}  ${c.gray(a.file ? path.basename(a.file) : '')}`);
      for (const o of a.output) for (const l of o.msg.split('\n')) out.push(`   ${o.stream === 'err' ? c.yellow(l) : c.gray(l)}`);
      out.push('');
    }
  }

  // ── failures in full ──
  const failures = list.flatMap((a) => a.tests.filter((t) => t.status === 'fail').map((t) => ({ a, t })));
  if (failures.length) {
    out.push(c.failBadge(` 실패 상세 · Failures (${failures.length}) `), '');
    failures.forEach(({ a, t }, i) => {
      const where = t.file ? `${path.relative(process.cwd(), t.file)}${t.line ? `:${t.line}` : ''}` : '';
      out.push(`${c.red(`${i + 1})`)} ${c.bold(areaLabel(a.key))} ${c.gray('›')} ${c.red(t.name)}`);
      if (where) out.push(`   ${c.cyan(where)}`);
      for (const l of errorText(t.error).split('\n')) if (l) out.push(`   ${c.gray('│')} ${l}`);
      out.push('');
    });
  }

  // ── summary table ──
  const all = { tests: 0, pass: 0, fail: 0, skip: 0, ms: 0 };
  for (const a of list) {
    all.tests += a.tests.length; all.pass += a.count.pass; all.fail += a.count.fail; all.skip += a.count.skip + a.count.todo; all.ms += a.ms;
  }
  const wall = Number.isFinite(total) ? total : Date.now() - t0;
  const nameW = Math.max(width('분류 · Area'), ...list.map((a) => width(areaLabel(a.key))));
  const BAR = 16;
  const maxMs = Math.max(1, ...list.map((a) => a.ms));
  const cell = (v, w, paint) => (v ? paint(padStart(String(v), w)) : c.gray(padStart('0', w)));
  const rule = c.gray('─'.repeat(nameW + 52));
  out.push(c.head(' 요약 · Summary '), '');
  out.push(`  ${c.bold(padEnd('분류 · Area', nameW))}  ${c.bold(padStart('테스트', 6))}  ${c.bold(padStart('통과', 5))}  ${c.bold(padStart('실패', 5))}  ${c.bold(padStart('건너뜀', 6))}  ${c.bold(padStart('시간', 9))}  ${c.bold('비중')}`);
  out.push(`  ${rule}`);
  for (const a of list) {
    if (!a.tests.length) continue;
    const n = Math.max(a.ms > 0 ? 1 : 0, Math.round((a.ms / maxMs) * BAR));
    const bar = (a.count.fail ? c.red : timeColor(a.ms) === c.gray ? c.cyan : timeColor(a.ms))('█'.repeat(n)) + c.gray('░'.repeat(BAR - n));
    const label = a.count.fail ? c.red(padEnd(areaLabel(a.key), nameW)) : padEnd(areaLabel(a.key), nameW);
    out.push(`  ${label}  ${padStart(String(a.tests.length), 6)}  ${cell(a.count.pass, 5, c.green)}  ${cell(a.count.fail, 5, c.red)}  ${cell(a.count.skip + a.count.todo, 6, c.yellow)}  ${timeColor(a.ms)(padStart(fmtMs(a.ms), 9))}  ${bar}`);
  }
  out.push(`  ${rule}`);
  out.push(`  ${c.bold(padEnd('합계 · Total', nameW))}  ${c.bold(padStart(String(all.tests), 6))}  ${c.bold(cell(all.pass, 5, c.green))}  ${c.bold(cell(all.fail, 5, c.red))}  ${c.bold(cell(all.skip, 6, c.yellow))}  ${c.bold(padStart(fmtMs(wall), 9))}  ${c.gray('(경과 시간)')}`);
  out.push('');
  const rate = all.tests ? Math.round((all.pass / all.tests) * 1000) / 10 : 0;
  if (!all.tests) out.push(`  ${c.warnBadge(' ⚠ 실행된 테스트가 없습니다 ')}`);
  else if (all.fail) out.push(`  ${c.failBadge(` ✖ 실패 ${all.fail}개 `)}  ${c.red(`통과율 ${rate}%`)}  ${c.gray(`(${all.pass}/${all.tests})`)}`);
  else out.push(`  ${c.okBadge(' ✔ 모두 통과 ')}  ${c.green(`통과율 ${rate}%`)}  ${c.gray(`(${all.pass}/${all.tests}${all.skip ? `, 건너뜀 ${all.skip}` : ''})`)}`);
  out.push('', '');
  yield out.join('\n');
}
