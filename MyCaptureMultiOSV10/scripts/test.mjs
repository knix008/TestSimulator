// npm test — runs every MyCapture test and prints the results grouped by category.
//
//   npm test                       all categories
//   npm test -- --only js,rust     just those (js | rust | integration | e2e)
//   npm test -- --skip e2e         everything except those
//   npm test -- --quick            js + rust (no screen, no app window)
//
// Each test shows live as it finishes (✔/✖ + time). At the end every category
// is listed with its tests sorted (failures first, then slowest first), plus a
// summary table. Results are also written to test-results/results.json.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { run } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const color = (process.stdout.isTTY || Boolean(process.env.FORCE_COLOR)) && !process.env.NO_COLOR;
const paint = (code) => (text) => (color ? `\x1b[${code}m${text}\x1b[0m` : String(text));
const c = {
  bold: paint('1'), dim: paint('2'), red: paint('31'), green: paint('32'), yellow: paint('33'),
  blue: paint('34'), magenta: paint('35'), cyan: paint('36'), gray: paint('90'),
  inverseGreen: paint('30;42'), inverseRed: paint('97;41'), inverseBlue: paint('97;44'),
};

const CATEGORIES = [
  { id: 'js', title: 'JS 단위 테스트', subtitle: '상태 · 파일 이름 · 좌표 · 설정 · 번역 · 녹화 형식', tint: c.cyan, run: runJs },
  { id: 'rust', title: 'Rust 단위 테스트', subtitle: '이미지 인코딩 6종 · WebM 길이 · 경로', tint: c.magenta, run: (report) => runCargo(['test', '--lib'])(report) },
  { id: 'integration', title: 'Rust 통합 테스트', subtitle: '실제 화면 · 창 · 영역 캡처', tint: c.blue, run: (report) => runCargo(['test', '--test', 'capture_integration'])(report) },
  { id: 'e2e', title: 'E2E · 앱 GUI', subtitle: '실제 앱 실행 후 버튼 조작 (CDP)', tint: c.yellow, run: runE2e },
];

// ───────────────────────── arguments

const args = process.argv.slice(2);
const listArg = (name) => {
  const index = args.findIndex((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
  if (index < 0) return null;
  const value = args[index].includes('=') ? args[index].split('=')[1] : args[index + 1];
  return new Set(String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean));
};
let selected = CATEGORIES.map((category) => category.id);
const only = listArg('only');
const skip = listArg('skip');
if (args.includes('--quick')) selected = ['js', 'rust'];
if (only) selected = selected.filter((id) => only.has(id));
if (skip) selected = selected.filter((id) => !skip.has(id));

// ───────────────────────── live output

/** Terminal cell width: Hangul and other wide characters take two cells. */
const cells = (text) => [...String(text)].reduce((width, ch) => width + (/[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/.test(ch) ? 2 : 1), 0);
function fit(text, width) {
  let out = '';
  for (const ch of String(text)) {
    if (cells(out + ch) > width - (cells(text) > width ? 1 : 0)) return `${out}…`.padEnd(out.length + 1 + width - cells(out) - 1);
    out += ch;
  }
  return out + ' '.repeat(Math.max(0, width - cells(out)));
}

const formatMs = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);
const timeColor = (ms) => (ms >= 3000 ? c.red : ms >= 500 ? c.yellow : c.gray);
let spinnerTimer = null;
let spinnerText = '';

function spin(text) {
  spinnerText = text;
  if (!process.stdout.isTTY) return;
  if (spinnerTimer) return;
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frame = 0;
  spinnerTimer = setInterval(() => {
    process.stdout.write(`\r\x1b[2K  ${c.cyan(frames[frame++ % frames.length])} ${c.dim(spinnerText)}`);
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

function makeReporter(category, results) {
  let count = 0;
  return (result) => {
    count += 1;
    results.push(result);
    const mark = result.skipped ? c.yellow('○') : result.ok ? c.green('✔') : c.red('✖');
    const name = result.ok ? result.name : c.red(result.name);
    const group = result.group ? c.gray(`${result.group} › `) : '';
    line(`  ${c.gray(String(count).padStart(3))} ${mark} ${group}${name} ${timeColor(result.ms)(`(${formatMs(result.ms)})`)}`);
    if (!result.ok && result.error) {
      for (const errorLine of String(result.error).split('\n').slice(0, 8)) line(`        ${c.red(errorLine)}`);
    }
    spin(`${category.title} 실행 중… (${count}개 완료)`);
  };
}

// ───────────────────────── runners

async function runJs(report) {
  const files = fs.readdirSync(path.join(root, 'test', 'unit'))
    .filter((name) => name.endsWith('.test.js'))
    .map((name) => path.join(root, 'test', 'unit', name));
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
}

/** Runs cargo test single-threaded and times each test from the streamed output. */
function runCargo(cargoArgs) {
  return (report) => new Promise((resolve, reject) => {
    spin('컴파일 중… (첫 실행은 몇 분 걸릴 수 있습니다)');
    const child = spawn('cargo', [...cargoArgs, '--manifest-path', 'src-tauri/Cargo.toml', '--', '--test-threads=1'], {
      cwd: root,
      env: { ...process.env, CARGO_TERM_COLOR: 'never', RUST_BACKTRACE: '0' },
    });
    let buffer = '';
    let stderr = '';
    let lastEnd = performance.now();
    const starts = new Map();
    const failed = [];
    const failureText = new Map();
    let failureName = null;

    const onLine = (textLine) => {
      const result = textLine.match(/^test (\S+) \.\.\. (ok|FAILED|ignored)/);
      if (result) {
        const now = performance.now();
        const ms = now - (starts.get(result[1]) ?? lastEnd);
        lastEnd = now;
        const entry = { name: result[1].split('::').pop(), group: groupOf(result[1]), ms };
        if (result[2] === 'FAILED') failed.push({ ...entry, key: result[1] });
        else report({ ...entry, ok: true, skipped: result[2] === 'ignored' });
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
      // "test name ... " without its result yet: that test has just started.
      const pendingStart = buffer.match(/^test (\S+) \.\.\. $/);
      if (pendingStart && !starts.has(pendingStart[1])) starts.set(pendingStart[1], performance.now());
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      const compiling = text.match(/Compiling (\S+)/);
      if (compiling) spin(`컴파일 중… ${compiling[1]}`);
      else if (/Running /.test(text)) spin('테스트 실행 중…');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (buffer) onLine(buffer);
      for (const entry of failed) {
        report({ name: entry.name, group: entry.group, ok: false, ms: entry.ms, error: (failureText.get(entry.key) ?? []).join('\n') || 'FAILED' });
      }
      if (code !== 0 && !failed.length) {
        const message = stderr.split('\n').filter((textLine) => /^error/.test(textLine)).slice(0, 12).join('\n') || `cargo exited with ${code}`;
        report({ name: '컴파일', group: 'cargo', ok: false, ms: 0, error: message });
      }
      resolve();
    });
  });
}

const groupOf = (name) => (name.includes('::') ? name.split('::').slice(0, -1).filter((part) => part !== 'tests').join('::') : '');

async function runE2e(report) {
  if (process.platform !== 'win32') {
    report({ name: 'E2E 는 Windows(WebView2 CDP)에서만 실행됩니다', ok: true, skipped: true, ms: 0 });
    return;
  }
  spin('앱 빌드 확인 중… (cargo build)');
  await new Promise((resolve) => {
    // A copy started earlier by the E2E suite keeps the exe locked.
    const kill = spawn('powershell.exe', ['-NoProfile', '-Command',
      `Get-Process mycapture -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '${path.join(root, 'src-tauri', 'target').replace(/'/g, "''")}*' } | Stop-Process -Force`], { stdio: 'ignore' });
    kill.on('close', resolve);
  });
  const build = await new Promise((resolve) => {
    const child = spawn('cargo', ['build', '--manifest-path', 'src-tauri/Cargo.toml'], { cwd: root, env: { ...process.env, CARGO_TERM_COLOR: 'never' } });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stderr }));
  });
  if (build.code !== 0) {
    report({ name: '앱 빌드', ok: false, ms: 0, error: build.stderr.split('\n').filter((textLine) => /error/.test(textLine)).slice(0, 10).join('\n') });
    return;
  }
  const { App } = await import(pathToFileURL(path.join(root, 'test', 'e2e', 'harness.mjs')).href);
  const { cases } = await import(pathToFileURL(path.join(root, 'test', 'e2e', 'suite.mjs')).href);
  spin('앱 실행 중…');
  const app = new App();
  const startedAt = performance.now();
  try {
    await app.start();
    report({ name: '앱 실행 · DevTools 연결', group: 'app', ok: true, ms: performance.now() - startedAt });
  } catch (error) {
    report({ name: '앱 실행 · DevTools 연결', group: 'app', ok: false, ms: performance.now() - startedAt, error: error.message });
    await app.stop();
    return;
  }
  for (const testCase of cases) {
    spin(`E2E · ${testCase.name}`);
    const start = performance.now();
    try {
      await testCase.run(app);
      report({ name: testCase.name, group: 'app', ok: true, ms: performance.now() - start });
    } catch (error) {
      report({ name: testCase.name, group: 'app', ok: false, ms: performance.now() - start, error: error.message });
      await app.main.eval(`document.querySelector('[data-action="close-modal"]')?.click(); 1`).catch(() => {});
    }
  }
  await app.stop();
}

// ───────────────────────── main

const totalStart = performance.now();
const summary = [];
line();
line(`${c.inverseBlue(c.bold(' MyCapture 테스트 '))} ${c.gray(new Date().toLocaleString())}`);
line(c.gray(`  분류: ${selected.join(', ')}   (npm test -- --only js,rust · --skip e2e · --quick)`));

for (const category of CATEGORIES.filter((item) => selected.includes(item.id))) {
  line();
  line(`${category.tint('▌')} ${c.bold(category.tint(category.title))} ${c.gray(`— ${category.subtitle}`)}`);
  const results = [];
  const start = performance.now();
  try {
    await category.run(makeReporter(category, results));
  } catch (error) {
    results.push({ name: '실행기 오류', ok: false, ms: 0, error: error.stack ?? error.message });
    line(`  ${c.red('✖ 실행기 오류')} ${c.red(error.message)}`);
  }
  stopSpin();
  summary.push({ category, results, ms: performance.now() - start });
}
stopSpin();

// Sorted report: failures first, then slowest first.
line();
line(c.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 결과 (분류별 · 실패 우선 · 느린 순) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
for (const { category, results } of summary) {
  const failed = results.filter((result) => !result.ok);
  const status = failed.length ? c.inverseRed(' FAIL ') : c.inverseGreen(' PASS ');
  line();
  line(`${status} ${c.bold(category.tint(category.title))} ${c.gray(`(${results.length}개)`)}`);
  const sorted = [...results].sort((a, b) => Number(a.ok) - Number(b.ok) || b.ms - a.ms);
  const width = Math.min(72, Math.max(...sorted.map((result) => cells(`${result.group ? `${result.group} › ` : ''}${result.name}`)), 10));
  for (const result of sorted) {
    const label = `${result.group ? `${result.group} › ` : ''}${result.name}`;
    const padded = fit(label, width);
    const mark = result.skipped ? c.yellow('○ 건너뜀') : result.ok ? c.green('✔ 통과 ') : c.red('✖ 실패 ');
    const bar = '█'.repeat(Math.min(20, Math.max(1, Math.round(Math.log10(Math.max(result.ms, 1)) * 5))));
    line(`   ${mark}  ${result.ok ? padded : c.red(padded)}  ${timeColor(result.ms)(formatMs(result.ms).padStart(9))} ${timeColor(result.ms)(bar)}`);
  }
}

line();
line(c.bold('┌────────────────────────────┬────────┬────────┬────────┬──────────┐'));
line(c.bold('│ 분류                       │  통과  │  실패  │  전체  │   시간   │'));
line(c.bold('├────────────────────────────┼────────┼────────┼────────┼──────────┤'));
let passed = 0;
let failedTotal = 0;
let total = 0;
for (const { category, results, ms } of summary) {
  const ok = results.filter((result) => result.ok).length;
  const bad = results.length - ok;
  passed += ok;
  failedTotal += bad;
  total += results.length;
  const name = fit(category.title, 26);
  line(`│ ${category.tint(name)} │ ${c.green(String(ok).padStart(6))} │ ${(bad ? c.red : c.gray)(String(bad).padStart(6))} │ ${String(results.length).padStart(6)} │ ${formatMs(ms).padStart(8)} │`);
}
line(c.bold('├────────────────────────────┼────────┼────────┼────────┼──────────┤'));
line(`│ ${c.bold(fit('합계', 26))} │ ${c.green(c.bold(String(passed).padStart(6)))} │ ${(failedTotal ? c.red : c.gray)(c.bold(String(failedTotal).padStart(6)))} │ ${c.bold(String(total).padStart(6))} │ ${c.bold(formatMs(performance.now() - totalStart).padStart(8))} │`);
line(c.bold('└────────────────────────────┴────────┴────────┴────────┴──────────┘'));
line();
line(failedTotal
  ? `${c.inverseRed(c.bold(` ✖ ${failedTotal}개 실패 `))} ${c.red('위 목록의 빨간 항목을 확인하세요.')}`
  : `${c.inverseGreen(c.bold(` ✔ 모든 테스트 통과 (${passed}개) `))}`);

const reportDir = path.join(root, 'test-results');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, 'results.json'), JSON.stringify({
  date: new Date().toISOString(),
  passed,
  failed: failedTotal,
  categories: summary.map(({ category, results, ms }) => ({ id: category.id, title: category.title, ms: Math.round(ms), results })),
}, null, 2));
line(c.gray(`  자세한 결과: test-results/results.json`));
process.exit(failedTotal ? 1 : 0);
