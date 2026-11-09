// npm test — runs every MySketchBook test and shows the results by category.
//
//   npm test                          js · package · rust · web · tutorial
//   npm test -- --only web            just those (comma separated)
//   npm test -- --skip rust           everything except those
//   npm test -- --quick               js + package + rust (no browser)
//   npm test -- --desktop             also the desktop app (src-tauri/target/debug/mysketchbook.exe, built by npm start)
//   npm test -- --installer           also build the Windows installer and check it
//
// Categories: js · package · rust · web · tutorial · desktop (opt-in) · installer (opt-in)
// While running, each test is printed as it finishes (✔ ✖ ○ + time, coloured).
// At the end every category is listed with its tests aligned in columns
// (failures first, then slowest first) and a summary table follows. The full
// results are written to test-results/results.json.
//
// The browser tests start their own Vite on a port free on 127.0.0.1 and ::1
// (scripts/dev-port.mjs) and their own headless Edge/Chrome profile; nothing the
// user runs (npm start, its Vite, the app) is reused, stopped or killed.
// MYSKETCHBOOK_E2E_ONLY=<regex> runs only the E2E cases whose "group name" matches.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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
const importLocal = (...parts) => import(pathToFileURL(path.join(root, ...parts)).href);

const CATEGORIES = [
  { id: 'js', title: 'JS 단위 테스트', subtitle: '라이브러리 · 모델링 커널(면·모서리·추론·솔리드) · 가져오기/내보내기 · 에셋 · 벽/문서', tint: c.cyan, run: runJs('unit') },
  { id: 'package', title: '패키징 · 아이콘', subtitle: '앱 아이콘(입체 타일 위 실내) · .msk 문서 아이콘 · 모든 OS 파일 형식 등록 · 리소스 · 팝업 종류 · 설치 언어 · 설치 훅', tint: c.purple, run: runJs('static', ['package.test.js']) },
  { id: 'rust', title: 'Rust 단위 테스트', subtitle: 'cargo test --lib (파일 입출력·진행률 · 글꼴 · 창 위치 · 여러 실행)', tint: c.magenta, run: (report) => runCargo(['test', '--lib'])(report) },
  { id: 'web', title: 'E2E · 웹 (GPU)', subtitle: '헤드리스 Edge + 실제 GPU 로 실제 앱 조작: 템플릿·예제·벽/방/문·배치·모델링·보기·메뉴·팝업·패널·파일·렌더링·성능', tint: c.blue, run: runWeb },
  { id: 'tutorial', title: '튜토리얼', subtitle: '튜토리얼의 모든 단계를 실제 앱에서 실행 (오류 없음, 단계마다 대상 표시)', tint: c.teal, run: runTutorial },
  { id: 'desktop', title: 'E2E · 데스크톱', subtitle: '디버그 exe (빌드 안 함) + 자체 Vite + WebView2 CDP, 시작한 프로세스만 닫음', tint: c.yellow, run: runDesktop, optIn: 'desktop' },
  { id: 'installer', title: '설치 프로그램', subtitle: 'npm run build:win → NSIS 설치 파일 검사 (.msk · project.ico · 설치 훅)', tint: c.orange, run: runInstaller, optIn: 'installer' },
];

// ───────────────────────── arguments

const args = process.argv.slice(2);
const listArg = (name) => {
  const index = args.findIndex((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
  if (index < 0) return null;
  const value = args[index].includes('=') ? args[index].split('=')[1] : args[index + 1];
  return new Set(String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean));
};
let selected = CATEGORIES.filter((category) => !category.optIn || args.includes(`--${category.optIn}`)).map((category) => category.id);
const only = listArg('only');
const skip = listArg('skip');
if (args.includes('--quick')) selected = ['js', 'package', 'rust'];
if (only) {
  const unknown = [...only].filter((id) => !CATEGORIES.some((category) => category.id === id));
  if (unknown.length) { console.error(`알 수 없는 분류: ${unknown.join(', ')} (${CATEGORIES.map((category) => category.id).join(', ')})`); process.exit(2); }
  selected = CATEGORIES.map((category) => category.id).filter((id) => only.has(id));
}
if (skip) selected = selected.filter((id) => !skip.has(id));

// ───────────────────────── live output

/** Terminal cell width: Hangul and other wide characters take two cells. */
const cells = (text) => [...String(text)].reduce((width, ch) => width + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1f300}-\u{1faff}]/u.test(ch) ? 2 : 1), 0);
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
    for (const note of result.notes ?? []) line(`        ${c.gray(`ℹ ${note}`)}`);
    if (!result.ok && result.error) {
      for (const errorLine of String(result.error).split('\n').slice(0, 12)) line(`        ${c.red(errorLine)}`);
    }
    spin(`${category.title} 실행 중… (${count}개 완료)`);
  };
}

// ───────────────────────── runners

function runJs(folder, names = null) {
  return async (report) => {
    const files = fs.readdirSync(path.join(root, 'test', folder)).filter((name) => name.endsWith('.test.js') && (!names || names.includes(name))).map((name) => path.join(root, 'test', folder, name));
    const stream = run({ files, concurrency: 1 });
    for await (const event of stream) {
      if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
      const data = event.data;
      if (data.details?.type === 'suite' || data.nesting > 0) continue;
      // A { todo } test is a feature not done yet: listed (yellow, with its reason), never a failure.
      const todo = data.todo ? `TODO${typeof data.todo === 'string' ? `: ${data.todo}` : ''}` : null;
      const error = event.type === 'test:fail' && !todo ? data.details?.error : null;
      report({
        name: data.name,
        group: path.basename(data.file ?? '', '.test.js'),
        ok: event.type === 'test:pass' || Boolean(todo),
        skipped: data.skip ? (typeof data.skip === 'string' ? data.skip : true) : todo ?? false,
        ms: data.details?.duration_ms ?? 0,
        error: error ? String(error.cause?.message ?? error.message ?? error) : null,
      });
    }
  };
}

/**
 * cargo test, single-threaded, each test timed from the streamed output. The lib test binary is its own
 * file (target/debug/deps): a running debug app (npm start) is not touched, so nothing is stopped first.
 */
function runCargo(cargoArgs, { env = {} } = {}) {
  return (report) => new Promise((resolve, reject) => {
    spin('컴파일 중… (첫 실행은 몇 분 걸릴 수 있습니다)');
    const child = spawn('cargo', [...cargoArgs, '--manifest-path', 'src-tauri/Cargo.toml', '--', '--test-threads=1'], {
      cwd: root,
      env: { ...process.env, ...env, CARGO_TERM_COLOR: 'never', RUST_BACKTRACE: '0' },
    });
    let buffer = '';
    let stderr = '';
    let lastEnd = performance.now();
    const failed = [];
    const failureText = new Map();
    let failureName = null;

    const onLine = (textLine) => {
      const result = textLine.match(/^test (\S+) \.\.\. (ok|FAILED|ignored)\s*$/);
      if (result) {
        const now = performance.now();
        const entry = { name: result[1].split('::').pop(), group: groupOf(result[1]), ms: now - lastEnd };
        lastEnd = now;
        if (result[2] === 'FAILED') failed.push({ ...entry, key: result[1] });
        else report({ ...entry, ok: true, skipped: result[2] === 'ignored' ? 'ignored' : false });
        return;
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
      else if (/Blocking waiting for file lock/.test(text)) spin('다른 cargo 빌드(npm start 등)가 끝나기를 기다리는 중…');
      else if (/Running /.test(text)) spin('테스트 실행 중…');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (buffer) onLine(buffer);
      for (const entry of failed) {
        const text = (failureText.get(entry.key) ?? []).join('\n') || 'FAILED';
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

/**
 * Runs E2E cases one by one. A case fails when it throws, or when the page logged an error
 * (exception, console.error, failed request) while it ran — those are listed with the failure.
 */
async function runCases(report, cases, context, label) {
  const onlyCases = process.env.MYSKETCHBOOK_E2E_ONLY ? new RegExp(process.env.MYSKETCHBOOK_E2E_ONLY) : null;
  for (const testCase of cases) {
    if (onlyCases && !onlyCases.test(`${testCase.group ?? ''} ${testCase.name}`)) continue;
    spin(`${label} · ${testCase.group ? `${testCase.group} › ` : ''}${testCase.name}`);
    const notes = [];
    context.note = (text) => notes.push(text);
    context.takeErrors?.();
    const start = performance.now();
    let error = null;
    try {
      const outcome = await testCase.run(context);
      if (outcome?.skipped) { report({ name: testCase.name, group: testCase.group, ok: true, skipped: outcome.skipped, ms: performance.now() - start, notes }); continue; }
    } catch (caught) {
      error = caught.stack?.split('\n').slice(0, 5).join('\n') ?? String(caught);
    }
    const logged = context.takeErrors?.() ?? [];
    if (logged.length) error = [error, `페이지 오류 ${logged.length}개:`, ...logged.slice(0, 6).map((text) => `  ${String(text).split('\n').slice(0, 3).join(' | ').slice(0, 400)}`)].filter(Boolean).join('\n');
    report({ name: testCase.name, group: testCase.group, ok: !error, ms: performance.now() - start, error, notes });
    if (error) await context.recover?.();
  }
}

async function runWeb(report) {
  const { WebApp } = await importLocal('test', 'e2e', 'web.harness.mjs');
  const suite = await importLocal('test', 'e2e', 'web.suite.mjs');
  const app = new WebApp({ gpu: true });
  spin('Vite · 헤드리스 Edge 시작 중…');
  const launched = performance.now();
  try {
    await app.start();
    const gpu = await app.run(`const gl = A.viewport?.renderer?.getContext() ?? document.createElement('canvas').getContext('webgl2'); const ext = gl?.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';`).catch(() => 'unknown');
    report({ name: '자체 Vite(빈 포트) · 브라우저 실행 · 앱 열림', group: '실행', ok: true, ms: performance.now() - launched, notes: [`${app.url} · GPU: ${gpu}`] });
  } catch (error) {
    report({ name: '자체 Vite(빈 포트) · 브라우저 실행 · 앱 열림', group: '실행', ok: false, ms: performance.now() - launched, error: error.message });
    await app.stop();
    return;
  }
  try {
    app.takeErrors();
    await runCases(report, suite.cases, app, 'E2E · 웹');
    const commands = await suite.commandCases(app);
    await runCases(report, commands, app, 'E2E · 웹 · 명령');
  } finally {
    await app.stop();
  }
}

/** Every tutorial step in the real app (web build, GPU); a step fails on a page error, an error popup or no outlined target. */
async function runTutorial(report) {
  const { WebApp } = await importLocal('test', 'e2e', 'web.harness.mjs');
  const app = new WebApp({ gpu: true });
  spin('앱 실행 중…');
  try {
    await app.start();
  } catch (error) {
    report({ name: '앱 실행', ok: false, ms: 0, error: error.message });
    await app.stop();
    return;
  }
  try {
    const steps = await app.run(`return (await import('/src/ui/tutorial.js')).STEPS.map((s) => ({ id: s.id, chapter: s.chapter }));`);
    app.takeErrors();
    await app.run(`A.state.settings.tutorialDone = false; A.run('tutorial'); return 1;`);
    for (let i = 0; i < steps.length; i++) {
      const start = performance.now();
      spin(`튜토리얼 ${i + 1}/${steps.length} · ${steps[i].id}`);
      let error = null;
      let target = false;
      try {
        // The card's own "next" button (as a user clicks it).
        if (i > 0) await app.run(`document.querySelector('#tutorial-layer [data-tour="next"]').click(); return 1;`);
        await app.main.waitFor(`(() => { const s = window.__mysketchbook.tutorial()?.state(); return s && s.active && s.index === ${i} && !s.busy; })()`, { timeout: 40000 });
        target = await app.main.waitFor(`Boolean(document.querySelector('.tour-outline'))`, { timeout: 3000 }).then(() => true, () => false);
        const popupError = await app.run(`return document.querySelector('.web-popup-error') ? (document.querySelector('.web-popup-error iframe')?.contentDocument?.querySelector('.popup')?.textContent.trim().slice(0, 300) || 'error popup') : '';`);
        if (popupError) error = `오류 팝업: ${popupError}`;
        else if (!target) error = 'the step outlines nothing (its target is missing)';
      } catch (caught) {
        error = caught.message;
      }
      const logged = app.takeErrors();
      if (logged.length) error = [error, `페이지 오류 ${logged.length}개:`, ...logged.slice(0, 5).map((text) => `  ${String(text).slice(0, 400)}`)].filter(Boolean).join('\n');
      report({ name: `${String(i + 1).padStart(2, '0')} ${steps[i].id}`, group: steps[i].chapter, ok: !error, ms: performance.now() - start, error });
    }
    const end = performance.now();
    await app.run(`document.querySelector('#tutorial-layer [data-tour="next"]')?.click(); await T.until(() => !A.tutorial().state().active, 10000, 'tour ended'); return 1;`).catch(() => {});
    const restored = await app.run(`return A.state.settings.tutorialDone === true && !document.querySelector('#tutorial-layer.active') && !A.popups.inline && !document.querySelector('.web-popup');`).catch((error) => error.message);
    const logged = app.takeErrors();
    report({ name: '마지막 단계 "완료" → 튜토리얼 닫힘, 설정·화면 원래대로', group: '정리', ok: restored === true && !logged.length, ms: performance.now() - end, error: restored === true ? (logged.length ? logged.join('\n') : null) : `not restored (${restored})` });
  } finally {
    await app.stop();
  }
}

async function runDesktop(report) {
  if (process.platform !== 'win32') {
    report({ name: '데스크톱 E2E 는 Windows(WebView2 CDP)에서 실행됩니다', ok: true, skipped: 'Windows 전용', ms: 0 });
    return;
  }
  const { DesktopApp } = await importLocal('test', 'e2e', 'harness.mjs');
  const { desktopCases } = await importLocal('test', 'e2e', 'desktop.suite.mjs');
  const app = new DesktopApp();
  const launched = performance.now();
  spin('디버그 앱 실행 중…');
  try {
    const why = await app.start();
    if (why?.skipped) { report({ name: '디버그 앱 실행', group: '실행', ok: true, skipped: why.skipped, ms: performance.now() - launched }); return; }
    report({ name: '디버그 exe 실행 (자체 Vite · 자체 WebView2 프로필) · DevTools 연결', group: '실행', ok: true, ms: performance.now() - launched, notes: app.notes });
  } catch (error) {
    report({ name: '디버그 exe 실행 · DevTools 연결', group: '실행', ok: false, ms: performance.now() - launched, error: error.message, notes: app.notes });
    await app.stop();
    return;
  }
  try {
    app.takeErrors();
    await runCases(report, desktopCases, app, 'E2E · 데스크톱');
  } finally {
    const t0 = performance.now();
    const closed = await app.stop();
    report({ name: '시작한 프로세스만 닫음 (다른 앱·서버는 그대로)', group: '정리', ok: closed.ok, ms: performance.now() - t0, error: closed.ok ? null : closed.error });
  }
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
  const exe = path.join(root, 'release', `MySketchBook-Setup-${version}.exe`);
  report({ name: 'npm run build:win → NSIS 설치 파일', group: '빌드', ok: build.code === 0 && fs.existsSync(exe), ms: performance.now() - start, error: build.code ? build.output.split('\n').slice(-15).join('\n') : fs.existsSync(exe) ? null : `${exe} missing` });
  if (!fs.existsSync(exe)) return;
  const check = (name, test) => {
    const t0 = performance.now();
    try { test(); report({ name, group: '설치 파일', ok: true, ms: performance.now() - t0 }); } catch (error) { report({ name, group: '설치 파일', ok: false, ms: performance.now() - t0, error: error.message }); }
  };
  const nsisDir = path.join(root, 'src-tauri', 'target', 'release', 'nsis', 'x64');
  const nsi = fs.readFileSync(path.join(nsisDir, 'installer.nsi'), 'utf8');
  check('설치 파일 크기·헤더 (MZ)', () => {
    const bytes = fs.readFileSync(exe);
    if (bytes.subarray(0, 2).toString() !== 'MZ' || bytes.length < 1_000_000) throw new Error(`size ${bytes.length}`);
  });
  check('설치 언어: 한국어·영어 선택 화면', () => {
    for (const part of ['Korean.nsh', 'English.nsh', 'MUI_LANGDLL_DISPLAY']) if (!nsi.includes(part) && !fs.existsSync(path.join(nsisDir, part))) throw new Error(part);
  });
  check('설치 아이콘 = 프로그램 아이콘', () => {
    if (!/!define INSTALLERICON ".*[\\/]icons[\\/]icon\.ico"/.test(nsi) || !nsi.includes('!define MUI_ICON "${INSTALLERICON}"')) throw new Error('INSTALLERICON');
  });
  check('파일 형식 등록: .msk 하나 (UML 형식 없음)', () => {
    if (!nsi.includes('APP_ASSOCIATE "msk" "MySketchBook.Project"')) throw new Error('APP_ASSOCIATE "msk"');
    if (/APP_ASSOCIATE "(myuml|mumlt)"/.test(nsi)) throw new Error('a UML file type is still registered');
  });
  check('문서 아이콘 파일 설치 (project.ico)', () => { if (!nsi.includes('"/oname=project.ico"')) throw new Error('project.ico is not installed'); });
  check('리소스: library · doc · samples 폴더가 설치 파일에 들어감 (옛 docs 없음)', () => {
    for (const part of ['library\\', 'samples\\', 'doc\\']) if (!nsi.includes(part)) throw new Error(`${part} is not in the installer`);
    if (/[\\"]docs\\/.test(nsi)) throw new Error('the old docs\\ folder is still in the installer');
  });
  check('사용 설명서 바로 가기: $INSTDIR\\doc\\UsersGuide.html', () => {
    const hooks = fs.readFileSync(path.join(root, 'src-tauri', 'windows', 'hooks.nsh'), 'utf8');
    if (!hooks.includes('"$INSTDIR\\doc\\UsersGuide.html"')) throw new Error('hooks.nsh does not link $INSTDIR\\doc\\UsersGuide.html');
  });
  check('설치 훅: 이전 설치 완전 제거 · 사용자 데이터 삭제 질문 · 문서 아이콘', () => {
    const include = /!include "(.*hooks\.nsh)"/.exec(nsi);
    if (!include) throw new Error('hooks.nsh not included');
    for (const part of ['!insertmacro NSIS_HOOK_PREINSTALL', '!insertmacro NSIS_HOOK_POSTINSTALL', '!insertmacro NSIS_HOOK_POSTUNINSTALL']) if (!nsi.includes(part)) throw new Error(part);
    if (nsi.indexOf(include[0]) > nsi.indexOf('!insertmacro MUI_PAGE_WELCOME')) throw new Error('hooks.nsh is included after the first page');
    if (nsi.indexOf(include[0]) > nsi.indexOf('!insertmacro MUI_LANGUAGE "Korean"')) throw new Error('hooks.nsh is included after the languages');
    const hooks = fs.readFileSync(include[1]);
    if (hooks[0] !== 0xef || hooks[1] !== 0xbb || hooks[2] !== 0xbf) throw new Error('hooks.nsh lost its UTF-8 BOM');
    const text = hooks.toString();
    if (!text.includes('!define MUI_CUSTOMFUNCTION_GUIINIT MumGuiInit')) throw new Error('GUIINIT');
    const id = /!define BUNDLEID "([^"]+)"/.exec(nsi)?.[1];
    if (id !== 'com.shkwon.mysketchbook') throw new Error(`BUNDLEID ${id}`);
    if (!text.includes(`"$APPDATA\\${id}"`) || !text.includes(`"$LOCALAPPDATA\\${id}"`)) throw new Error(`data folders of ${id}`);
    const defines = Object.fromEntries([...nsi.matchAll(/!define (\w+) "([^"]+)"/g)].map((m) => [m[1], m[2]]));
    const expand = (v) => v.replace(/\$\{(\w+)\}/g, (_, k) => expand(defines[k] ?? ''));
    for (const [define, mine] of [['UNINSTKEY', 'MUM_UNKEY'], ['MANUPRODUCTKEY', 'MUM_PRODKEY']]) {
      const ours = new RegExp(`!define /IfNDef ${mine} "([^"]+)"`).exec(text)?.[1];
      if (expand(defines[define] ?? '') !== ours) throw new Error(`${mine} "${ours}" ≠ ${define} "${expand(defines[define] ?? '')}"`);
    }
    if (!nsi.includes('!insertmacro CheckIfAppIsRunning "$INSTDIR\\${MAINBINARYNAME}.exe"')) throw new Error('CheckIfAppIsRunning');
  });
  const t0 = performance.now();
  const { findMakensis, runHookCases } = await importLocal('test', 'installer', 'hooks-cases.mjs');
  const makensis = findMakensis();
  if (makensis) {
    spin('설치 스크립트 경고 확인 (makensis)…');
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mysketchbook-nsis-'));
    for (const file of fs.readdirSync(nsisDir)) if (fs.statSync(path.join(nsisDir, file)).isFile()) fs.copyFileSync(path.join(nsisDir, file), path.join(scratch, file));
    const compiled = await exec(makensis, ['-V2', path.join(scratch, 'installer.nsi')]);
    const warnings = compiled.output.split(/\r?\n/).filter((textLine) => /warning/i.test(textLine) && /hooks\.nsh|Mum/i.test(textLine));
    report({ name: 'makensis: 생성된 설치 스크립트가 경고 없이 다시 컴파일됨 (hooks.nsh)', group: '설치 파일', ok: compiled.code === 0 && warnings.length === 0, ms: performance.now() - t0, error: compiled.code ? compiled.output.split('\n').slice(-15).join('\n') : warnings.join('\n') || null });
    fs.rmSync(scratch, { recursive: true, force: true });
    spin('설치 훅을 가짜 설치본에 실행 중…');
    try {
      await runHookCases(async (name, fn) => {
        const t1 = performance.now();
        try { await fn(); report({ name, group: '설치 훅', ok: true, ms: performance.now() - t1 }); } catch (error) { report({ name, group: '설치 훅', ok: false, ms: performance.now() - t1, error: error.message }); }
      });
    } catch (error) {
      report({ name: '설치 훅 검사 준비', group: '설치 훅', ok: false, ms: 0, error: error.message });
    }
  } else {
    report({ name: 'makensis 를 찾지 못함 (첫 build:win 이 설치함)', group: '설치 파일', ok: false, ms: 0, error: 'makensis.exe not found' });
  }
  check('설치 파일이 프로젝트 루트에 복사됨', () => {
    const copy = path.join(root, `MySketchBook-Setup-${version}.exe`);
    if (!fs.existsSync(copy)) throw new Error(copy);
    if (fs.statSync(copy).size !== fs.statSync(exe).size) throw new Error('the root copy differs from release/');
  });
}

// ───────────────────────── main

const totalStart = performance.now();
const summary = [];
line();
line(`${c.inverseBlue(c.bold(' MySketchBook 테스트 '))} ${c.gray(new Date().toLocaleString())}`);
line(c.gray(`  분류: ${selected.join(', ')}   (npm test -- --only web · --skip rust · --quick · --desktop · --installer)`));

for (const category of CATEGORIES.filter((item) => selected.includes(item.id))) {
  line();
  line(`${category.tint('▌')} ${c.bold(category.tint(category.title))} ${c.gray(`— ${category.subtitle}`)}`);
  const results = [];
  const start = performance.now();
  try {
    await category.run(makeReporter(category, results, start));
  } catch (error) {
    results.push({ name: '실행기 오류', ok: false, ms: 0, error: error.stack ?? error.message });
    line(`  ${c.red('✖ 실행기 오류')} ${c.red(error.stack ?? error.message)}`);
  }
  stopSpin();
  const ms = performance.now() - start;
  const passedCount = results.filter((r) => r.ok && !r.skipped).length;
  const failedCount = results.filter((r) => !r.ok).length;
  line(`  ${c.gray('└')} ${failedCount ? c.red(`✖ ${failedCount} 실패`) : c.green(`✔ ${passedCount} 통과`)}${failedCount ? c.green(` · ✔ ${passedCount} 통과`) : ''}${results.some((r) => r.skipped) ? c.yellow(` · ○ ${results.filter((r) => r.skipped).length} 건너뜀`) : ''} ${c.gray(`(${formatMs(ms)})`)}`);
  summary.push({ category, results, ms });
}
stopSpin();

// Results: one table per category, columns aligned — failures first, then slowest first.
const width = Math.min(78, Math.max(30, ...summary.flatMap(({ results }) => results.map((r) => cells(`${r.group ? `${r.group} › ` : ''}${r.name}`)))));
const rule = (text) => c.bold(`${'━'.repeat(4)} ${text} ${'━'.repeat(Math.max(4, width + 40 - cells(text)))}`);
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
if (failedTotal) {
  line(`${c.inverseRed(c.bold(` ✖ ${failedTotal}개 실패 `))} ${c.red('실패한 테스트:')}`);
  for (const { category, results } of summary) for (const result of results.filter((r) => !r.ok)) line(c.red(`   • [${category.id}] ${result.group ? `${result.group} › ` : ''}${result.name}`));
} else {
  line(`${c.inverseGreen(c.bold(` ✔ 모든 테스트 통과 (${passed}개${skippedTotal ? `, 건너뜀 ${skippedTotal}개` : ''}) `))}`);
}

const reportDir = path.join(root, 'test-results');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, 'results.json'), JSON.stringify({
  date: new Date().toISOString(),
  selected,
  passed,
  failed: failedTotal,
  skipped: skippedTotal,
  categories: summary.map(({ category, results, ms }) => ({ id: category.id, title: category.title, ms: Math.round(ms), passed: results.filter((r) => r.ok && !r.skipped).length, failed: results.filter((r) => !r.ok).length, results })),
}, null, 2));
line(c.gray('  자세한 결과: test-results/results.json'));
process.exit(failedTotal ? 1 : 0);
