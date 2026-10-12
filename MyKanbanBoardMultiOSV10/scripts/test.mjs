// npm test — runs every MyKanbanBoard test and shows the results by category.
//
//   npm test                          all categories (installer build excluded)
//   npm test -- --only js,rust        just those
//   npm test -- --skip desktop        everything except those
//   npm test -- --quick               js + package + rust (no app window, no browser)
//   npm test -- --installer           also build the Windows installer and check it
//
// Categories: js · package · rust · db · web · desktop · installer
// While running, each test is printed as it finishes (✔ ✖ ○ + time, coloured).
// At the end every category is listed with its tests aligned in columns
// (failures first, then slowest first) and a summary table follows. The full
// results are written to test-results/results.json.
//
// Database servers for the "db" and "desktop" categories come from the
// git-ignored test/db.local.json: { "mysql": "mysql://user:pw@host:port", "postgres": "postgres://…" }
// (or the MYKANBAN_TEST_MYSQL_URL / MYKANBAN_TEST_POSTGRES_URL variables).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { run } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const color = (process.stdout.isTTY || Boolean(process.env.FORCE_COLOR)) && !process.env.NO_COLOR;
const paint = (code) => (text) => (color ? `\x1b[${code}m${text}\x1b[0m` : String(text));
const c = {
  bold: paint('1'), dim: paint('2'), red: paint('31'), green: paint('32'), yellow: paint('33'), blue: paint('34'), magenta: paint('35'),
  cyan: paint('36'), gray: paint('90'), white: paint('97'), inverseGreen: paint('30;42'), inverseRed: paint('97;41'), inverseBlue: paint('97;44'),
  inverseYellow: paint('30;43'), orange: paint('38;5;208'), purple: paint('38;5;141'), teal: paint('38;5;44'),
};

const CATEGORIES = [
  { id: 'js', title: 'JS 단위 테스트', subtitle: '보드 · 실행 취소 · 형식 · 프로젝트 · 첨부 · 인쇄 · 설정 · 번역 · 테마', tint: c.cyan, run: runJs('unit') },
  { id: 'package', title: '패키징 · 아이콘', subtitle: '3D 아이콘 · 파일 형식 등록 · 설치 언어 · 데이터 삭제 질문 · 재설치', tint: c.purple, run: runJs('static') },
  { id: 'rust', title: 'Rust 단위 테스트', subtitle: '파일 입출력·진행률 · 글꼴 · 창 위치 · SQLite 저장소', tint: c.magenta, run: (report) => runCargo(['test', '--lib'])(report) },
  { id: 'db', title: 'DB 통합 테스트', subtitle: '실제 MariaDB/MySQL · PostgreSQL 서버 (test/db.local.json)', tint: c.teal, run: (report) => runCargo(['test', '--test', 'db_integration'], { nocapture: true, env: dbEnv() })(report) },
  { id: 'web', title: 'E2E · 웹', subtitle: '웹 빌드를 헤드리스 Edge/Chrome 으로 조작 (CDP)', tint: c.blue, run: runWeb },
  { id: 'desktop', title: 'E2E · 데스크톱 GUI', subtitle: '실제 앱 실행 후 메뉴·툴바·팝업·파일·DB 조작 (CDP)', tint: c.yellow, run: runDesktop },
  { id: 'installer', title: '설치 프로그램', subtitle: 'npm run build:win → NSIS 설치 파일 검사', tint: c.orange, run: runInstaller, optIn: true },
];

// ───────────────────────── arguments

const args = process.argv.slice(2);
const listArg = (name) => {
  const index = args.findIndex((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
  if (index < 0) return null;
  const value = args[index].includes('=') ? args[index].split('=')[1] : args[index + 1];
  return new Set(String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean));
};
let selected = CATEGORIES.filter((category) => !category.optIn || args.includes('--installer')).map((category) => category.id);
const only = listArg('only');
const skip = listArg('skip');
if (args.includes('--quick')) selected = ['js', 'package', 'rust'];
if (only) selected = CATEGORIES.map((category) => category.id).filter((id) => only.has(id));
if (skip) selected = selected.filter((id) => !skip.has(id));

function dbEnv() {
  const env = {};
  try {
    const local = JSON.parse(fs.readFileSync(path.join(root, 'test', 'db.local.json'), 'utf8'));
    if (local.mysql) env.MYKANBAN_TEST_MYSQL_URL = local.mysql;
    if (local.postgres) env.MYKANBAN_TEST_POSTGRES_URL = local.postgres;
  } catch { /* no local servers */ }
  return { ...env, ...Object.fromEntries(['MYKANBAN_TEST_MYSQL_URL', 'MYKANBAN_TEST_POSTGRES_URL'].filter((k) => process.env[k]).map((k) => [k, process.env[k]])) };
}

// ───────────────────────── live output

/** Terminal cell width: Hangul and other wide characters take two cells. */
const cells = (text) => [...String(text)].reduce((width, ch) => width + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1f300}-\u{1faff}]/u.test(ch) ? 2 : 1), 0);
function fit(text, width) {
  let out = '';
  for (const ch of String(text)) {
    if (cells(out + ch) > width - (cells(text) > width ? 1 : 0)) return `${out}…${' '.repeat(Math.max(0, width - cells(out) - 1))}`;
    out += ch;
  }
  return out + ' '.repeat(Math.max(0, width - cells(out)));
}

const formatMs = (ms) => (ms >= 60000 ? `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(0)}s` : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);
const timeColor = (ms) => (ms >= 5000 ? c.red : ms >= 1000 ? c.yellow : ms >= 200 ? c.cyan : c.gray);
let spinnerTimer = null;
let spinnerText = '';
let spinnerStart = 0;

function spin(text) {
  spinnerText = text;
  if (!process.stdout.isTTY) return;
  if (spinnerTimer) return;
  spinnerStart = performance.now();
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frame = 0;
  spinnerTimer = setInterval(() => {
    process.stdout.write(`\r\x1b[2K  ${c.cyan(frames[frame++ % frames.length])} ${c.dim(spinnerText)} ${c.gray(formatMs(performance.now() - spinnerStart))}`);
  }, 90);
}

function stopSpin() {
  if (spinnerTimer) {
    clearInterval(spinnerTimer);
    spinnerTimer = null;
    process.stdout.write('\r\x1b[2K');
  }
}

function line(text = '') {
  const active = Boolean(spinnerTimer);
  stopSpin();
  process.stdout.write(`${text}\n`);
  if (active) spin(spinnerText);
}

function makeReporter(category, results, categoryStart) {
  let count = 0;
  return (result) => {
    count += 1;
    results.push(result);
    const mark = result.skipped ? c.yellow('○') : result.ok ? c.green('✔') : c.red('✖');
    const name = result.skipped ? c.yellow(result.name) : result.ok ? result.name : c.red(result.name);
    const group = result.group ? c.gray(`${result.group} › `) : '';
    const elapsed = c.gray(`[${formatMs(performance.now() - categoryStart).padStart(8)}]`);
    line(`  ${elapsed} ${c.gray(String(count).padStart(3))} ${mark} ${group}${name} ${timeColor(result.ms)(`(${formatMs(result.ms)})`)}${result.skipped && typeof result.skipped === 'string' ? c.yellow(` — ${result.skipped}`) : ''}`);
    if (!result.ok && result.error) {
      for (const errorLine of String(result.error).split('\n').slice(0, 10)) line(`        ${c.red(errorLine)}`);
    }
    spin(`${category.title} 실행 중… (${count}개 완료)`);
  };
}

// ───────────────────────── runners

function runJs(folder) {
  return async (report) => {
    const files = fs.readdirSync(path.join(root, 'test', folder)).filter((name) => name.endsWith('.test.js')).map((name) => path.join(root, 'test', folder, name));
    const stream = run({ files, concurrency: 1 });
    for await (const event of stream) {
      if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
      const data = event.data;
      if (data.details?.type === 'suite' || data.nesting > 0) continue;
      const error = event.type === 'test:fail' ? data.details?.error : null;
      report({
        name: data.name,
        group: path.basename(data.file ?? '', '.test.js'),
        ok: event.type === 'test:pass',
        skipped: Boolean(data.skip),
        ms: data.details?.duration_ms ?? 0,
        error: error ? String(error.cause?.message ?? error.message ?? error) : null,
      });
    }
  };
}

/** Runs cargo test single-threaded and times each test from the streamed output. */
function runCargo(cargoArgs, { nocapture = false, env = {} } = {}) {
  return (report) => new Promise((resolve, reject) => {
    spin('컴파일 중… (첫 실행은 몇 분 걸릴 수 있습니다)');
    const testArgs = ['--test-threads=1', ...(nocapture ? ['--nocapture'] : [])];
    const child = spawn('cargo', [...cargoArgs, '--manifest-path', 'src-tauri/Cargo.toml', '--', ...testArgs], {
      cwd: root,
      env: { ...process.env, ...env, CARGO_TERM_COLOR: 'never', RUST_BACKTRACE: '0' },
    });
    let buffer = '';
    let stderr = '';
    let lastEnd = performance.now();
    const failed = [];
    const failureText = new Map();
    let failureName = null;
    let open = null; // nocapture: "test x ... <output>" waits for its ok/FAILED line

    const finish = (name, status, note, ms) => {
      const entry = { name: name.split('::').pop(), group: groupOf(name), ms };
      if (status === 'FAILED') failed.push({ ...entry, key: name });
      else report({ ...entry, ok: true, skipped: status === 'ignored' || (note && /SKIP/.test(note) ? note.replace(/^.*SKIP:?\s*/, '') : false) });
    };

    const onLine = (textLine) => {
      const result = textLine.match(/^test (\S+) \.\.\. (.*)$/);
      if (result) {
        const now = performance.now();
        const status = result[2].trim().match(/^(ok|FAILED|ignored)$/)?.[1];
        if (status) {
          finish(result[1], status, null, now - lastEnd);
          lastEnd = now;
        } else {
          open = { name: result[1], note: result[2] };
        }
        return;
      }
      if (open) {
        const status = textLine.trim().match(/^(ok|FAILED|ignored)$/)?.[1];
        if (status) {
          const now = performance.now();
          finish(open.name, status, open.note, now - lastEnd);
          lastEnd = now;
          open = null;
          return;
        }
        if (textLine.trim()) open.note = `${open.note} ${textLine.trim()}`;
      }
      if (/^running \d+ tests?/.test(textLine)) lastEnd = performance.now();
      const header = textLine.match(/^---- (\S+) stdout ----$/);
      if (header) { failureName = header[1]; failureText.set(failureName, []); return; }
      if (/^(failures:|test result:)/.test(textLine)) failureName = null;
      if (failureName && textLine.trim()) failureText.get(failureName).push(textLine);
    };

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString().replace(/\r/g, '');
      const lines = buffer.split('\n');
      buffer = lines.pop();
      lines.forEach(onLine);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      const compiling = text.match(/Compiling (\S+)/);
      if (compiling) spin(`컴파일 중… ${compiling[1]}`);
      else if (/Running /.test(text)) spin('테스트 실행 중…');
      for (const textLine of text.replace(/\r/g, '').split('\n')) if (open && /panicked at/.test(textLine)) open.note += ` ${textLine}`;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (buffer) onLine(buffer);
      for (const entry of failed) {
        const text = (failureText.get(entry.key) ?? []).join('\n') || stderr.split('\n').filter((l) => /panicked|assert|Err/.test(l)).slice(0, 6).join('\n') || 'FAILED';
        report({ name: entry.name, group: entry.group, ok: false, ms: entry.ms, error: text });
      }
      if (code !== 0 && !failed.length) {
        const message = stderr.split('\n').filter((textLine) => /^error/.test(textLine)).slice(0, 12).join('\n') || `cargo exited with ${code}`;
        report({ name: '컴파일', group: 'cargo', ok: false, ms: 0, error: message });
      }
      resolve();
    });
  });
}

const groupOf = (name) => (name.includes('::') ? name.split('::').slice(0, -1).filter((part) => part !== 'tests').join('::') : 'integration');

function exec(command, commandArgs, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, { cwd: root, env: { ...process.env, CARGO_TERM_COLOR: 'never' }, shell: options.shell ?? false });
    let output = '';
    child.stdout?.on('data', (chunk) => { output += chunk; options.onOutput?.(chunk.toString()); });
    child.stderr?.on('data', (chunk) => { output += chunk; options.onOutput?.(chunk.toString()); });
    child.on('close', (code) => resolve({ code, output }));
  });
}

async function runCases(report, cases, context, label) {
  for (const testCase of cases) {
    spin(`${label} · ${testCase.group ? `${testCase.group} › ` : ''}${testCase.name}`);
    const start = performance.now();
    try {
      const outcome = await testCase.run(context);
      report({ name: testCase.name, group: testCase.group, ok: true, skipped: outcome?.skipped ?? false, ms: performance.now() - start });
    } catch (error) {
      report({ name: testCase.name, group: testCase.group, ok: false, ms: performance.now() - start, error: error.stack?.split('\n').slice(0, 4).join('\n') ?? error.message });
      await context.recover?.();
    }
  }
}

async function runWeb(report) {
  spin('웹 빌드 중… (vite build)');
  const start = performance.now();
  const build = await exec(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build']);
  report({ name: '웹 빌드 (vite build → dist/)', group: '빌드', ok: build.code === 0, ms: performance.now() - start, error: build.code ? build.output.split('\n').slice(-12).join('\n') : null });
  if (build.code !== 0) return;
  const { WebApp } = await import(pathToFileURL(path.join(root, 'test', 'e2e', 'web.harness.mjs')).href);
  const { cases } = await import(pathToFileURL(path.join(root, 'test', 'e2e', 'web.suite.mjs')).href);
  const app = new WebApp();
  const launched = performance.now();
  try {
    await app.start();
    report({ name: '브라우저 실행 · 페이지 열기', group: '실행', ok: true, ms: performance.now() - launched });
  } catch (error) {
    report({ name: '브라우저 실행 · 페이지 열기', group: '실행', ok: false, ms: performance.now() - launched, error: error.message });
    await app.stop();
    return;
  }
  await runCases(report, cases, app, 'E2E · 웹');
  await app.stop();
}

async function runDesktop(report) {
  if (process.platform !== 'win32') {
    report({ name: '데스크톱 E2E 는 Windows(WebView2 CDP)에서 실행됩니다', ok: true, skipped: 'Windows 전용', ms: 0 });
    return;
  }
  spin('앱 빌드 확인 중… (cargo build)');
  await exec('powershell.exe', ['-NoProfile', '-Command', `Get-Process mykanbanboard -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '${path.join(root, 'src-tauri', 'target').replace(/'/g, "''")}*' } | Stop-Process -Force`]);
  const start = performance.now();
  const build = await exec('cargo', ['build', '--manifest-path', 'src-tauri/Cargo.toml'], { onOutput: (text) => { const m = text.match(/Compiling (\S+)/); if (m) spin(`앱 빌드 중… ${m[1]}`); } });
  report({ name: '앱 빌드 (cargo build)', group: '빌드', ok: build.code === 0, ms: performance.now() - start, error: build.code ? build.output.split('\n').filter((l) => /error/.test(l)).slice(0, 10).join('\n') : null });
  if (build.code !== 0) return;
  const { App } = await import(pathToFileURL(path.join(root, 'test', 'e2e', 'harness.mjs')).href);
  const { cases } = await import(pathToFileURL(path.join(root, 'test', 'e2e', 'desktop.suite.mjs')).href);
  spin('앱 실행 중…');
  const app = new App();
  const launched = performance.now();
  try {
    await app.start();
    report({ name: '앱 실행 · DevTools 연결', group: '실행', ok: true, ms: performance.now() - launched });
  } catch (error) {
    report({ name: '앱 실행 · DevTools 연결', group: '실행', ok: false, ms: performance.now() - launched, error: error.message });
    await app.stop();
    return;
  }
  app.recover = async () => {
    try {
      if (app.process.exitCode != null) await app.launch();
      await app.main.eval(`Promise.all(['settings','about','confirm','error','progress','recent','print','project','image'].map((kind) => window.__TAURI_INTERNALS__.invoke('close_popup', { kind }))).then(() => window.__TAURI_INTERNALS__.invoke('hide_popup', { kind: 'menu' })).then(() => 1)`);
    } catch {
      await app.restart().catch(() => {});
    }
  };
  await runCases(report, cases, app, 'E2E · 데스크톱');
  await app.stop();
}

async function runInstaller(report) {
  if (process.platform !== 'win32') {
    report({ name: 'Windows 설치 파일은 Windows 에서 만듭니다', ok: true, skipped: 'Windows 전용', ms: 0 });
    return;
  }
  const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  spin('설치 파일 빌드 중… (npm run build:win, 몇 분 걸립니다)');
  const start = performance.now();
  const build = await exec(process.execPath, [path.join(root, 'scripts', 'build.mjs'), 'win'], { onOutput: (text) => { const m = text.match(/Compiling (\S+)|Running makensis|Finished/); if (m) spin(`설치 파일 빌드 중… ${m[0]}`); } });
  const exe = path.join(root, 'release', `MyKanbanBoard-Setup-${version}.exe`);
  report({ name: 'npm run build:win → NSIS 설치 파일', group: '빌드', ok: build.code === 0 && fs.existsSync(exe), ms: performance.now() - start, error: build.code ? build.output.split('\n').slice(-15).join('\n') : null });
  if (!fs.existsSync(exe)) return;
  const check = (name, test) => {
    const t0 = performance.now();
    try { test(); report({ name, group: '설치 파일', ok: true, ms: performance.now() - t0 }); } catch (error) { report({ name, group: '설치 파일', ok: false, ms: performance.now() - t0, error: error.message }); }
  };
  const nsi = fs.readFileSync(path.join(root, 'src-tauri', 'target', 'release', 'nsis', 'x64', 'installer.nsi'), 'utf8');
  check('설치 파일 크기·서명 헤더 (MZ)', () => {
    const bytes = fs.readFileSync(exe);
    if (bytes.subarray(0, 2).toString() !== 'MZ' || bytes.length < 1_000_000) throw new Error(`size ${bytes.length}`);
  });
  check('설치 언어: 한국어·영어 선택 화면', () => {
    for (const part of ['Korean.nsh', 'English.nsh', 'MUI_LANGDLL_DISPLAY']) if (!nsi.includes(part) && !fs.existsSync(path.join(root, 'src-tauri', 'target', 'release', 'nsis', 'x64', part))) throw new Error(part);
  });
  check('설치 아이콘 = 프로그램 아이콘', () => {
    if (!/!define INSTALLERICON ".*[\\/]icons[\\/]icon\.ico"/.test(nsi) || !nsi.includes('!define MUI_ICON "${INSTALLERICON}"')) throw new Error('INSTALLERICON');
  });
  check('파일 형식 등록: .mkanban / .mkproj', () => {
    for (const part of ['APP_ASSOCIATE "mkanban" "MyKanbanBoard.Board"', 'APP_ASSOCIATE "mkproj" "MyKanbanBoard.Project"']) if (!nsi.includes(part)) throw new Error(part);
  });
  check('문서 아이콘 파일 설치 (board.ico, project.ico)', () => { for (const part of ['board.ico', 'project.ico']) if (!nsi.includes(part)) throw new Error(part); });
  check('설치 훅: 데이터 삭제 질문 · 이전 설치 완전 제거 · 문서 아이콘', () => {
    if (!/!include ".*hooks\.nsh"/.test(nsi)) throw new Error('hooks.nsh not included');
    for (const part of ['!insertmacro NSIS_HOOK_PREINSTALL', '!insertmacro NSIS_HOOK_POSTINSTALL']) if (!nsi.includes(part)) throw new Error(part);
    if (!nsi.includes('"/oname=board.ico"') || !nsi.includes('"/oname=project.ico"')) throw new Error('document icons are not installed next to the program ($INSTDIR)');
  });
}

// ───────────────────────── main

const totalStart = performance.now();
const summary = [];
line();
line(`${c.inverseBlue(c.bold(' MyKanbanBoard 테스트 '))} ${c.gray(new Date().toLocaleString())}`);
line(c.gray(`  분류: ${selected.join(', ')}   (npm test -- --only js,rust · --skip desktop · --quick · --installer)`));

for (const category of CATEGORIES.filter((item) => selected.includes(item.id))) {
  line();
  line(`${category.tint('▌')} ${c.bold(category.tint(category.title))} ${c.gray(`— ${category.subtitle}`)}`);
  const results = [];
  const start = performance.now();
  try {
    await category.run(makeReporter(category, results, start));
  } catch (error) {
    results.push({ name: '실행기 오류', ok: false, ms: 0, error: error.stack ?? error.message });
    line(`  ${c.red('✖ 실행기 오류')} ${c.red(error.message)}`);
  }
  stopSpin();
  const ms = performance.now() - start;
  const passed = results.filter((r) => r.ok && !r.skipped).length;
  const failedCount = results.filter((r) => !r.ok).length;
  line(`  ${c.gray('└')} ${failedCount ? c.red(`✖ ${failedCount} 실패`) : c.green(`✔ ${passed} 통과`)}${results.some((r) => r.skipped) ? c.yellow(` · ○ ${results.filter((r) => r.skipped).length} 건너뜀`) : ''} ${c.gray(`(${formatMs(ms)})`)}`);
  summary.push({ category, results, ms });
}
stopSpin();

// Results: one table per category, columns aligned — failures first, then slowest first.
const width = Math.min(78, Math.max(30, ...summary.flatMap(({ results }) => results.map((r) => cells(`${r.group ? `${r.group} › ` : ''}${r.name}`)))));
const rule = (text) => {
  const pad = Math.max(4, width + 40 - cells(text));
  return c.bold(`${'━'.repeat(4)} ${text} ${'━'.repeat(pad)}`);
};
line();
line(rule('결과 (분류별 · 실패 우선 · 느린 순)'));
for (const { category, results, ms } of summary) {
  const failed = results.filter((result) => !result.ok);
  const status = failed.length ? c.inverseRed(' FAIL ') : c.inverseGreen(' PASS ');
  line();
  line(`${status} ${c.bold(category.tint(category.title))} ${c.gray(`(${results.length}개 · ${formatMs(ms)})`)}`);
  line(c.gray(`   ${'상태'.padEnd(7)}  ${fit('분류 › 테스트', width)}  ${'시간'.padStart(9)}  막대`));
  const sorted = [...results].sort((a, b) => Number(a.ok) - Number(b.ok) || Number(Boolean(a.skipped)) - Number(Boolean(b.skipped)) || b.ms - a.ms);
  const slowest = Math.max(1, ...sorted.map((r) => r.ms));
  for (const result of sorted) {
    const label = `${result.group ? `${result.group} › ` : ''}${result.name}`;
    const padded = fit(label, width);
    const mark = result.skipped ? c.yellow('○ 건너뜀') : result.ok ? c.green('✔ 통과  ') : c.red('✖ 실패  ');
    const bar = '█'.repeat(Math.max(1, Math.round((result.ms / slowest) * 16)));
    const text = result.skipped ? c.yellow(padded) : result.ok ? padded : c.red(padded);
    line(`   ${mark}  ${text}  ${timeColor(result.ms)(formatMs(result.ms).padStart(9))}  ${timeColor(result.ms)(bar)}`);
  }
}

line();
line(c.bold('┌──────────────────────────────┬────────┬────────┬────────┬────────┬────────────┐'));
line(c.bold('│ 분류                         │  통과  │  실패  │ 건너뜀 │  전체  │    시간    │'));
line(c.bold('├──────────────────────────────┼────────┼────────┼────────┼────────┼────────────┤'));
let passed = 0;
let failedTotal = 0;
let skippedTotal = 0;
let total = 0;
for (const { category, results, ms } of summary) {
  const skippedCount = results.filter((result) => result.skipped).length;
  const ok = results.filter((result) => result.ok && !result.skipped).length;
  const bad = results.filter((result) => !result.ok).length;
  passed += ok;
  failedTotal += bad;
  skippedTotal += skippedCount;
  total += results.length;
  line(`│ ${category.tint(fit(category.title, 28))} │ ${c.green(String(ok).padStart(6))} │ ${(bad ? c.red : c.gray)(String(bad).padStart(6))} │ ${(skippedCount ? c.yellow : c.gray)(String(skippedCount).padStart(6))} │ ${String(results.length).padStart(6)} │ ${formatMs(ms).padStart(10)} │`);
}
line(c.bold('├──────────────────────────────┼────────┼────────┼────────┼────────┼────────────┤'));
line(`│ ${c.bold(fit('합계', 28))} │ ${c.green(c.bold(String(passed).padStart(6)))} │ ${(failedTotal ? c.red : c.gray)(c.bold(String(failedTotal).padStart(6)))} │ ${(skippedTotal ? c.yellow : c.gray)(c.bold(String(skippedTotal).padStart(6)))} │ ${c.bold(String(total).padStart(6))} │ ${c.bold(formatMs(performance.now() - totalStart).padStart(10))} │`);
line(c.bold('└──────────────────────────────┴────────┴────────┴────────┴────────┴────────────┘'));
line();
line(failedTotal
  ? `${c.inverseRed(c.bold(` ✖ ${failedTotal}개 실패 `))} ${c.red('위 목록의 빨간 항목을 확인하세요.')}`
  : `${c.inverseGreen(c.bold(` ✔ 모든 테스트 통과 (${passed}개${skippedTotal ? `, 건너뜀 ${skippedTotal}개` : ''}) `))}`);

const reportDir = path.join(root, 'test-results');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, 'results.json'), JSON.stringify({
  date: new Date().toISOString(),
  passed,
  failed: failedTotal,
  skipped: skippedTotal,
  categories: summary.map(({ category, results, ms }) => ({ id: category.id, title: category.title, ms: Math.round(ms), results })),
}, null, 2));
line(c.gray('  자세한 결과: test-results/results.json'));
process.exit(failedTotal ? 1 : 0);
