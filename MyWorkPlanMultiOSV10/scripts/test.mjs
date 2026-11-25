// npm test — runs every MyWorkPlan test and shows the results by category.
//
//   npm test                          all categories (installer build excluded)
//   npm test -- --only js,rust        just those
//   npm test -- --skip desktop        everything except those
//   npm test -- --quick               js + package + rust (no app window, no browser)
//   npm test -- --installer           also build the Windows installer and check it
//
// Categories: js · package · rust · db · web · desktop · tutorial · installer
// While running, each test is printed as it finishes in aligned columns (elapsed,
// #, ✔ PASS / ✖ FAIL / ○ SKIP, group › name, its own time), coloured, in English.
// At the end every category is listed with its tests aligned in columns
// (failures first, then slowest first) and a summary table follows. The full
// results are written to test-results/results.json.
//
// Database servers for the "db" category come from the git-ignored
// test/db.local.json: { "mysql": "mysql://user:pw@host:port", "postgres": "postgres://…" }
// (or the MYWORKPLAN_TEST_MYSQL_URL / MYWORKPLAN_TEST_POSTGRES_URL variables). Without a MySQL/MariaDB
// server that test is skipped; without a PostgreSQL URL a temporary PostgreSQL server is started.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { run } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Colour is on by default (also when the output is piped to a log); NO_COLOR or --no-color turns it off.
const color = !process.env.NO_COLOR && !process.argv.includes('--no-color');
const paint = (code) => (text) => (color ? `\x1b[${code}m${text}\x1b[0m` : String(text));
const c = {
  bold: paint('1'), dim: paint('2'), red: paint('31'), green: paint('32'), yellow: paint('33'), blue: paint('34'), magenta: paint('35'),
  cyan: paint('36'), gray: paint('90'), white: paint('97'), inverseGreen: paint('30;42'), inverseRed: paint('97;41'), inverseBlue: paint('97;44'),
  inverseYellow: paint('30;43'), orange: paint('38;5;208'), purple: paint('38;5;141'), teal: paint('38;5;44'),
};

const CATEGORIES = [
  { id: 'js', title: 'JS unit tests', subtitle: 'scheduling · calendars · model · fields · filters · tracking · formats · XML/CSV · templates · printing · i18n · icons · themes', tint: c.cyan, run: runJs('unit') },
  { id: 'package', title: 'Packaging · icons · docs', subtitle: '3D icons · file associations · installer languages · settings reset (user data kept) · reinstall · bundled docs', tint: c.purple, run: runJs('static') },
  { id: 'rust', title: 'Rust unit tests', subtitle: 'file I/O · progress · fonts · window placement · single-instance lock', tint: c.magenta, run: (report) => runCargo(['test', '--lib'])(report) },
  { id: 'db', title: 'DB integration', subtitle: 'real MariaDB/MySQL server (test/db.local.json) · temporary PostgreSQL server · save/load/list/delete plans', tint: c.green, run: (report) => runCargo(['test', '--test', 'db_integration'], { nocapture: true, env: dbEnv() })(report) },
  { id: 'web', title: 'E2E · web', subtitle: 'the web build driven in headless Edge/Chrome (CDP)', tint: c.blue, run: runWeb },
  { id: 'desktop', title: 'E2E · desktop GUI', subtitle: 'the real app: menus · toolbar · popups · views · files · printing · settings (CDP + Win32)', tint: c.yellow, run: runDesktop },
  { id: 'tutorial', title: 'Tutorial', subtitle: 'every tutorial step in the real app (no errors)', tint: c.teal, run: runTutorial },
  { id: 'installer', title: 'Installer', subtitle: 'npm run build:win → NSIS installer checks', tint: c.orange, run: runInstaller, optIn: true },
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

/** Database servers for the "db" category (test/db.local.json, overridden by the environment). */
function dbEnv() {
  const env = {};
  try {
    const local = JSON.parse(fs.readFileSync(path.join(root, 'test', 'db.local.json'), 'utf8'));
    if (local.mysql) env.MYWORKPLAN_TEST_MYSQL_URL = local.mysql;
    if (local.postgres) env.MYWORKPLAN_TEST_POSTGRES_URL = local.postgres;
  } catch { /* no local servers */ }
  for (const key of ['MYWORKPLAN_TEST_MYSQL_URL', 'MYWORKPLAN_TEST_POSTGRES_URL']) if (process.env[key]) env[key] = process.env[key];
  return env;
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

/** Width of the name column in the live lines: fits the terminal (elapsed, #, status and time take ~42 cells). */
const LIVE_WIDTH = Math.max(40, Math.min(100, (process.stdout.columns || 140) - 42));

function makeReporter(category, results, categoryStart) {
  let count = 0;
  return (result) => {
    count += 1;
    results.push(result);
    const mark = result.skipped ? c.yellow('○ SKIP') : result.ok ? c.green('✔ PASS') : c.red('✖ FAIL');
    // Columns: elapsed · # · status · group › name (cut or padded to one width) · this test's own time, right-aligned.
    const groupText = result.group ? `${result.group} › ` : '';
    const label = fit(groupText + result.name, LIVE_WIDTH);
    const head = label.slice(0, Math.min(groupText.length, label.length));
    const rest = label.slice(head.length);
    const name = c.gray(head) + (result.skipped ? c.yellow(rest) : result.ok ? c.white(rest) : c.red(rest));
    const elapsed = c.gray(`[${formatMs(performance.now() - categoryStart).padStart(8)}]`);
    line(`  ${elapsed} ${category.tint(String(count).padStart(4))}  ${mark}  ${name}  ${timeColor(result.ms)(formatMs(result.ms).padStart(9))}${result.skipped && typeof result.skipped === 'string' ? c.yellow(`  — ${result.skipped}`) : ''}`);
    if (!result.ok && result.error) {
      for (const errorLine of String(result.error).split('\n').slice(0, 10)) line(`        ${c.red(errorLine)}`);
    }
    spin(`${category.title} running… (${count} done)`);
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
/** A copy of the debug app left running (crashed test, manual run) keeps the exe locked for cargo. */
function stopDebugApp() {
  if (process.platform !== 'win32') return Promise.resolve();
  return new Promise((resolve) => {
    const kill = spawn('powershell.exe', ['-NoProfile', '-Command', `Get-Process myworkplan -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '${path.join(root, 'src-tauri', 'target').replace(/'/g, "''")}*' } | Stop-Process -Force`], { stdio: 'ignore', windowsHide: true });
    kill.on('close', () => setTimeout(resolve, 300));
  });
}

function runCargo(cargoArgs, { nocapture = false, env = {} } = {}) {
  return (report) => stopDebugApp().then(() => new Promise((resolve, reject) => {
    spin('Compiling… (the first run can take a few minutes)');
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
      if (compiling) spin(`Compiling… ${compiling[1]}`);
      else if (/Running /.test(text)) spin('Running tests…');
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
        report({ name: 'compile', group: 'cargo', ok: false, ms: 0, error: message });
      }
      resolve();
    });
  }));
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
  spin('Building the web app… (vite build)');
  const start = performance.now();
  const build = await exec(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build']);
  report({ name: 'web build (vite build → dist/)', group: 'build', ok: build.code === 0, ms: performance.now() - start, error: build.code ? build.output.split('\n').slice(-12).join('\n') : null });
  if (build.code !== 0) return;
  const { WebApp } = await import(pathToFileURL(path.join(root, 'test', 'e2e', 'web.harness.mjs')).href);
  const { cases } = await import(pathToFileURL(path.join(root, 'test', 'e2e', 'web.suite.mjs')).href);
  const app = new WebApp();
  const launched = performance.now();
  try {
    await app.start();
    report({ name: 'start browser · open page', group: 'launch', ok: true, ms: performance.now() - launched });
  } catch (error) {
    report({ name: 'start browser · open page', group: 'launch', ok: false, ms: performance.now() - launched, error: error.message });
    await app.stop();
    return;
  }
  await runCases(report, cases, app, 'E2E · web');
  await app.stop();
}

async function runDesktop(report) {
  if (process.platform !== 'win32') {
    report({ name: 'desktop E2E runs on Windows (WebView2 CDP)', ok: true, skipped: 'Windows only', ms: 0 });
    return;
  }
  spin('Checking the app build… (cargo build)');
  await exec('powershell.exe', ['-NoProfile', '-Command', `Get-Process myworkplan -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '${path.join(root, 'src-tauri', 'target').replace(/'/g, "''")}*' } | Stop-Process -Force`]);
  const start = performance.now();
  const build = await exec('cargo', ['build', '--manifest-path', 'src-tauri/Cargo.toml'], { onOutput: (text) => { const m = text.match(/Compiling (\S+)/); if (m) spin(`Building the app… ${m[1]}`); } });
  report({ name: 'app build (cargo build)', group: 'build', ok: build.code === 0, ms: performance.now() - start, error: build.code ? build.output.split('\n').filter((l) => /error/.test(l)).slice(0, 10).join('\n') : null });
  if (build.code !== 0) return;
  const { App } = await import(pathToFileURL(path.join(root, 'test', 'e2e', 'harness.mjs')).href);
  const { cases } = await import(pathToFileURL(path.join(root, 'test', 'e2e', 'desktop.suite.mjs')).href);
  spin('Starting the app…');
  const app = new App();
  const launched = performance.now();
  try {
    await app.start();
    report({ name: 'start app · connect DevTools', group: 'launch', ok: true, ms: performance.now() - launched });
  } catch (error) {
    report({ name: 'start app · connect DevTools', group: 'launch', ok: false, ms: performance.now() - launched, error: error.message });
    await app.stop();
    return;
  }
  app.recover = async () => {
    try {
      if (app.process.exitCode != null) await app.launch();
      await app.main.eval(`window.__myworkplan.popups.closeAll().then(() => 1)`);
    } catch {
      await app.restart().catch(() => {});
    }
  };
  await runCases(report, cases, app, 'E2E · desktop');
  await app.stop();
}

async function runInstaller(report) {
  if (process.platform !== 'win32') {
    report({ name: 'the Windows installer is built on Windows', ok: true, skipped: 'Windows only', ms: 0 });
    return;
  }
  const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  spin('Building the installer… (npm run build:win, takes a few minutes)');
  const start = performance.now();
  const build = await exec(process.execPath, [path.join(root, 'scripts', 'build.mjs'), 'win'], { onOutput: (text) => { const m = text.match(/Compiling (\S+)|Running makensis|Finished/); if (m) spin(`Building the installer… ${m[0]}`); } });
  const exe = path.join(root, 'release', `MyWorkPlan-Setup-${version}.exe`);
  report({ name: 'npm run build:win → NSIS installer', group: 'build', ok: build.code === 0 && fs.existsSync(exe), ms: performance.now() - start, error: build.code ? build.output.split('\n').slice(-15).join('\n') : null });
  if (!fs.existsSync(exe)) return;
  const check = (name, test) => {
    const t0 = performance.now();
    try { test(); report({ name, group: 'installer', ok: true, ms: performance.now() - t0 }); } catch (error) { report({ name, group: 'installer', ok: false, ms: performance.now() - t0, error: error.message }); }
  };
  const nsi = fs.readFileSync(path.join(root, 'src-tauri', 'target', 'release', 'nsis', 'x64', 'installer.nsi'), 'utf8');
  check('installer size · MZ header', () => {
    const bytes = fs.readFileSync(exe);
    if (bytes.subarray(0, 2).toString() !== 'MZ' || bytes.length < 1_000_000) throw new Error(`size ${bytes.length}`);
  });
  check('installer languages: Korean · English picker', () => {
    for (const part of ['Korean.nsh', 'English.nsh', 'MUI_LANGDLL_DISPLAY']) if (!nsi.includes(part) && !fs.existsSync(path.join(root, 'src-tauri', 'target', 'release', 'nsis', 'x64', part))) throw new Error(part);
  });
  check('installer icon = app icon', () => {
    if (!/!define INSTALLERICON ".*[\\/]icons[\\/]icon\.ico"/.test(nsi) || !nsi.includes('!define MUI_ICON "${INSTALLERICON}"')) throw new Error('INSTALLERICON');
  });
  check('file associations: .mwp / .mwpt', () => {
    for (const part of ['APP_ASSOCIATE "mwp" "MyWorkPlan.Plan"', 'APP_ASSOCIATE "mwpt" "MyWorkPlan.Template"']) if (!nsi.includes(part)) throw new Error(part);
  });
  check('document icons installed (plan.ico, template.ico)', () => { for (const part of ['"/oname=plan.ico"', '"/oname=template.ico"']) if (!nsi.includes(part)) throw new Error(part); });
  check('install hooks: settings reset (user data kept) · old install removed · document icons · guide shortcut', () => {
    if (!/!include ".*hooks\.nsh"/.test(nsi)) throw new Error('hooks.nsh not included');
    for (const part of ['!insertmacro NSIS_HOOK_PREINSTALL', '!insertmacro NSIS_HOOK_POSTINSTALL']) if (!nsi.includes(part)) throw new Error(part);
  });
  check('bundled docs: user guide · tutorial · sample project', () => {
    for (const part of ['UsersGuide.html', 'UsersGuide.en.html', 'Tutorial.html', 'Tutorial.en.html', 'website-redesign.ko.mwp']) if (!nsi.includes(part)) throw new Error(`${part} is not in the installer`);
  });
  check('installer copied to the project root', () => {
    const copy = path.join(root, `MyWorkPlan-Setup-${version}.exe`);
    if (!fs.existsSync(copy)) throw new Error(copy);
    if (fs.statSync(copy).size !== fs.statSync(exe).size) throw new Error('the root copy differs from release/');
  });
}

/** Runs every tutorial step in the real desktop app; a step fails on a page error or an error popup. */
async function runTutorial(report) {
  if (process.platform !== 'win32') {
    report({ name: 'the tutorial check runs on Windows (WebView2 CDP)', ok: true, skipped: 'Windows only', ms: 0 });
    return;
  }
  const { App } = await import(pathToFileURL(path.join(root, 'test', 'e2e', 'harness.mjs')).href);
  const app = new App();
  spin('Starting the app…');
  try {
    await app.start();
  } catch (error) {
    report({ name: 'start app', ok: false, ms: 0, error: error.message });
    await app.stop();
    return;
  }
  try {
    const P = 'window.__myworkplan';
    await app.main.eval(`${P}.popups.closeAll().then(() => 1)`);
    const steps = await app.main.eval(`(async () => (await import('/src/ui/tutorial.js')).STEPS.map((s) => ({ id: s.id, chapter: s.chapter })))()`);
    await app.main.eval(`${P}.actions.startTutorial(); 1`);
    for (let i = 0; i < steps.length; i++) {
      const start = performance.now();
      spin(`Tutorial ${i + 1}/${steps.length} · ${steps[i].id}`);
      app.main.errors.length = 0;
      try {
        if (i > 0) await app.main.eval(`${P}.tutorial().next(); 1`);
        // active too: before the tour has started, its state already reads "step 0, not busy".
        await app.main.waitFor(`${P}.tutorial().state().active && ${P}.tutorial().state().index === ${i} && !${P}.tutorial().state().busy`, { timeout: 30000 });
        const target = await app.main.waitFor(`Boolean(document.querySelector('.tour-outline'))`, { timeout: 3000 }).then(() => true, () => false);
        const popupError = await app.main.eval(`(() => { const f = document.querySelector('.web-popup-error iframe'); return f?.contentDocument?.querySelector('#error-detail')?.value ?? ''; })()`);
        if (app.main.errors.length) throw new Error(app.main.errors.join('\n'));
        if (popupError) throw new Error(popupError);
        report({ name: `${String(i + 1).padStart(2, '0')} ${steps[i].id}${target ? '' : ' (no target)'}`, group: steps[i].chapter, ok: target, ms: performance.now() - start, error: target ? null : 'the step outlines nothing' });
      } catch (error) {
        report({ name: `${String(i + 1).padStart(2, '0')} ${steps[i].id}`, group: steps[i].chapter, ok: false, ms: performance.now() - start, error: error.message });
      }
    }
    const end = performance.now();
    await app.main.eval(`${P}.tutorial().stop().then(() => 1)`);
    const restored = await app.main.eval(`${P}.state.settings.tutorialDone === true && !document.querySelector('#tutorial-layer.active') && !${P}.popups.inline`);
    report({ name: 'afterwards settings and screen are restored (tutorial tab closed, popups back in OS windows)', group: 'cleanup', ok: restored, ms: performance.now() - end, error: restored ? null : 'not restored' });
  } finally {
    await app.stop();
  }
}

// ───────────────────────── main

const totalStart = performance.now();
const summary = [];
line();
line(`${c.inverseBlue(c.bold(' MyWorkPlan tests '))} ${c.gray(new Date().toLocaleString('en-US'))}`);
line(c.gray(`  categories: ${selected.join(', ')}   (npm test -- --only js,rust · --skip desktop · --quick · --installer · --no-color)`));

for (const category of CATEGORIES.filter((item) => selected.includes(item.id))) {
  line();
  line(`${category.tint('▌')} ${c.bold(category.tint(category.title))} ${c.gray(`— ${category.subtitle}`)}`);
  line(c.gray(`  ${'ELAPSED'.padStart(10)} ${'#'.padStart(4)}  STATUS  ${fit('GROUP › TEST', LIVE_WIDTH)}  ${'TIME'.padStart(9)}`));
  const results = [];
  const start = performance.now();
  try {
    await category.run(makeReporter(category, results, start));
  } catch (error) {
    results.push({ name: 'runner error', ok: false, ms: 0, error: error.stack ?? error.message });
    line(`  ${c.red('✖ runner error')} ${c.red(error.message)}`);
  }
  stopSpin();
  const ms = performance.now() - start;
  const passed = results.filter((r) => r.ok && !r.skipped).length;
  const failedCount = results.filter((r) => !r.ok).length;
  line(`  ${c.gray('└')} ${failedCount ? c.red(`✖ ${failedCount} failed`) : c.green(`✔ ${passed} passed`)}${results.some((r) => r.skipped) ? c.yellow(` · ○ ${results.filter((r) => r.skipped).length} skipped`) : ''} ${c.gray(`(${formatMs(ms)})`)}`);
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
line(rule('Results (by category · failures first · slowest first)'));
for (const { category, results, ms } of summary) {
  const failed = results.filter((result) => !result.ok);
  const status = failed.length ? c.inverseRed(' FAIL ') : c.inverseGreen(' PASS ');
  line();
  line(`${status} ${c.bold(category.tint(category.title))} ${c.gray(`(${results.length} tests · ${formatMs(ms)})`)}`);
  line(c.gray(`   ${'STATUS'.padEnd(8)}  ${fit('GROUP › TEST', width)}  ${'TIME'.padStart(9)}  BAR`));
  const sorted = [...results].sort((a, b) => Number(a.ok) - Number(b.ok) || Number(Boolean(a.skipped)) - Number(Boolean(b.skipped)) || b.ms - a.ms);
  const slowest = Math.max(1, ...sorted.map((r) => r.ms));
  for (const result of sorted) {
    const label = `${result.group ? `${result.group} › ` : ''}${result.name}`;
    const padded = fit(label, width);
    const mark = result.skipped ? c.yellow('○ SKIP  ') : result.ok ? c.green('✔ PASS  ') : c.red('✖ FAIL  ');
    const bar = '█'.repeat(Math.max(1, Math.round((result.ms / slowest) * 16)));
    const text = result.skipped ? c.yellow(padded) : result.ok ? padded : c.red(padded);
    line(`   ${mark}  ${text}  ${timeColor(result.ms)(formatMs(result.ms).padStart(9))}  ${timeColor(result.ms)(bar)}`);
  }
}

line();
line(c.bold('┌──────────────────────────────┬────────┬────────┬────────┬────────┬────────────┐'));
line(c.bold('│ Category                     │ Passed │ Failed │Skipped │ Total  │    Time    │'));
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
line(`│ ${c.bold(fit('Total', 28))} │ ${c.green(c.bold(String(passed).padStart(6)))} │ ${(failedTotal ? c.red : c.gray)(c.bold(String(failedTotal).padStart(6)))} │ ${(skippedTotal ? c.yellow : c.gray)(c.bold(String(skippedTotal).padStart(6)))} │ ${c.bold(String(total).padStart(6))} │ ${c.bold(formatMs(performance.now() - totalStart).padStart(10))} │`);
line(c.bold('└──────────────────────────────┴────────┴────────┴────────┴────────┴────────────┘'));
line();
line(failedTotal
  ? `${c.inverseRed(c.bold(` ✖ ${failedTotal} failed `))} ${c.red('See the red entries above.')}`
  : `${c.inverseGreen(c.bold(` ✔ All tests passed (${passed}${skippedTotal ? `, ${skippedTotal} skipped` : ''}) `))}`);

const reportDir = path.join(root, 'test-results');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, 'results.json'), JSON.stringify({
  date: new Date().toISOString(),
  passed,
  failed: failedTotal,
  skipped: skippedTotal,
  categories: summary.map(({ category, results, ms }) => ({ id: category.id, title: category.title, ms: Math.round(ms), results })),
}, null, 2));
line(c.gray('  Full results: test-results/results.json'));
process.exit(failedTotal ? 1 : 0);
