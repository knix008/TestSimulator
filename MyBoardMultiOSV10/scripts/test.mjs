// npm test — runs every MyBoard test and shows the results by category.
//
//   npm test                          core · ui · i18n · rust · web · tutorial
//   npm test -- --only web            just those (comma separated)
//   npm test -- --skip rust           everything except those
//   npm test -- --quick               core + ui + i18n + rust (no browser)
//   npm test -- --desktop             also the desktop app (src-tauri/target/debug/myboard.exe, built by npm start)
//
// Categories: core (test/core: the database, services, query language — the core's own tests, also
// `npm run test:core`) · ui (test/unit: the shell) · i18n · rust (cargo test --lib) · web (headless Edge,
// the real shell; a web core is started when server/web.js exists) · tutorial · desktop (opt-in).
// While running, each test is printed as it finishes (✔ ✖ ○ + time, coloured). At the end every
// category is listed with its tests aligned in columns (failures first, then slowest first) and a
// summary table follows. The full results are written to test-results/results.json and a readable
// report to test-results/report.txt.
//
// The browser tests start their own Vite (and web core) on ports free on 127.0.0.1 and ::1
// (scripts/dev-port.mjs) and their own headless Edge/Chrome profile; nothing the user runs (npm start,
// its Vite, the app) is reused, stopped or killed.
// MYBOARD_E2E_ONLY=<regex> runs only the E2E cases whose "group name" matches.
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
  { id: 'core', title: 'Core (Node)', subtitle: 'test/core — database layer, services, query language, rank keys, API (npm run test:core)', tint: c.cyan, run: runJs('core') },
  { id: 'ui', title: 'UI shell unit tests', subtitle: 'test/unit — icons, IconRef, icon picker, emoji, texts, no 3D leftovers', tint: c.purple, run: runJs('unit') },
  { id: 'i18n', title: 'Texts (Korean · English)', subtitle: 'scripts/i18n-check.mjs — every used key exists in both languages, both dictionaries have the same keys', tint: c.teal, run: runI18n },
  { id: 'rust', title: 'Rust unit tests', subtitle: 'cargo test --lib (core start, file I/O, fonts, window place, several instances)', tint: c.magenta, run: (report) => runCargo(['test', '--lib'], { env: { CARGO_TARGET_DIR: path.join(root, 'src-tauri', 'target', 'test') } })(report) },
  { id: 'web', title: 'E2E · web', subtitle: 'the real shell driven in headless Edge: start page, workspace, menus, popups, icon picker, realtime, API', tint: c.blue, run: runWeb },
  { id: 'tutorial', title: 'Tutorial', subtitle: 'every tutorial step in the real app (no errors, each step outlines its target)', tint: c.orange, run: runTutorial },
  { id: 'desktop', title: 'E2E · desktop', subtitle: 'debug exe (not built here) + own Vite + WebView2 CDP, closes only what it started', tint: c.yellow, run: runDesktop, optIn: 'desktop' },
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
if (args.includes('--quick')) selected = ['core', 'ui', 'i18n', 'rust'];
if (only) {
  const unknown = [...only].filter((id) => !CATEGORIES.some((category) => category.id === id));
  if (unknown.length) { console.error(`unknown category: ${unknown.join(', ')} (${CATEGORIES.map((category) => category.id).join(', ')})`); process.exit(2); }
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

/** Everything printed, without colours: written to test-results/report.txt at the end. */
const transcript = [];
function line(text = '') {
  const active = Boolean(spinnerTimer);
  stopSpin();
  process.stdout.write(`${text}\n`);
  // eslint-disable-next-line no-control-regex
  transcript.push(String(text).replace(/\x1b\[[0-9;]*m/g, ''));
  if (active) spin(spinnerText);
}

function makeReporter(category, results, categoryStart) {
  let count = 0;
  return (result) => {
    count += 1;
    results.push(result);
    const mark = result.skipped ? c.gray('○') : result.ok ? c.green('✔') : c.red('✖');
    const name = result.skipped ? c.gray(result.name) : result.ok ? result.name : c.red(result.name);
    const group = result.group ? c.gray(`${result.group} › `) : '';
    const elapsed = c.gray(`[${formatMs(performance.now() - categoryStart).padStart(8)}]`);
    line(`  ${elapsed} ${c.gray(String(count).padStart(3))} ${mark} ${group}${name} ${timeColor(result.ms)(`(${formatMs(result.ms)})`)}${result.skipped && typeof result.skipped === 'string' ? c.gray(` — ${result.skipped}`) : ''}`);
    for (const note of result.notes ?? []) line(`        ${c.gray(`ℹ ${note}`)}`);
    if (!result.ok && result.error) {
      for (const errorLine of String(result.error).split('\n').slice(0, 12)) line(`        ${c.red(errorLine)}`);
    }
    spin(`${category.title} running… (${count} done)`);
  };
}

// ───────────────────────── runners

function runJs(folder, names = null) {
  return async (report) => {
    const dir = path.join(root, 'test', folder);
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => /\.test\.(js|mjs)$/.test(name) && (!names || names.includes(name))).map((name) => path.join(dir, name)) : [];
    if (!files.length) { report({ name: `no tests in test/${folder}`, ok: true, skipped: 'no tests', ms: 0 }); return; }
    const stream = run({ files, concurrency: 1 });
    for await (const event of stream) {
      if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
      const data = event.data;
      if (data.details?.type === 'suite') continue;
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

/** The text check (scripts/i18n-check.mjs) as tests: missing Korean, missing English, keys only in one. */
async function runI18n(report) {
  const start = performance.now();
  const { output, code } = await exec(process.execPath, [path.join(root, 'scripts', 'i18n-check.mjs')]);
  const lineOf = (prefix) => output.split('\n').find((l) => l.startsWith(prefix)) ?? '';
  const ms = performance.now() - start;
  for (const [prefix, name] of [['missing ko', 'no keys missing in Korean'], ['missing en', 'no keys missing in English'], ['only ko', 'no keys only in Korean'], ['only en', 'no keys only in English']]) {
    const text = lineOf(prefix);
    const ok = /\(0\)/.test(text);
    report({ name, group: 'i18n', ok, ms: ms / 4, error: ok ? null : text.slice(0, 600) });
  }
  if (code !== 0 && !output) report({ name: 'run i18n-check', group: 'i18n', ok: false, ms, error: `exit ${code}` });
}

/**
 * cargo test, single-threaded, each test timed from the streamed output. The lib test binary is its own
 * file (target/debug/deps): a running debug app (npm start) is not touched, so nothing is stopped first.
 */
function runCargo(cargoArgs, { env = {} } = {}) {
  return (report) => new Promise((resolve, reject) => {
    spin('compiling… (the first run can take a few minutes)');
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
      if (compiling) spin(`compiling… ${compiling[1]}`);
      else if (/Blocking waiting for file lock/.test(text)) spin('waiting for another cargo build (npm start …) to finish…');
      else if (/Running /.test(text)) spin('running tests…');
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
        report({ name: 'compile', group: 'cargo', ok: false, ms: 0, error: message });
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
  const onlyCases = process.env.MYBOARD_E2E_ONLY ? new RegExp(process.env.MYBOARD_E2E_ONLY) : null;
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
    if (logged.length) error = [error, `${logged.length} page error(s):`, ...logged.slice(0, 6).map((text) => `  ${String(text).split('\n').slice(0, 3).join(' | ').slice(0, 400)}`)].filter(Boolean).join('\n');
    report({ name: testCase.name, group: testCase.group, ok: !error, ms: performance.now() - start, error, notes });
    if (error) await context.recover?.();
  }
}

async function runWeb(report) {
  const { WebApp } = await importLocal('test', 'e2e', 'web.harness.mjs');
  const suite = await importLocal('test', 'e2e', 'web.suite.mjs');
  const app = new WebApp({ gpu: false, core: true });
  spin('starting the web core, Vite and headless Edge…');
  const launched = performance.now();
  try {
    await app.start();
    const core = await app.run(`await T.until(() => A.state.core.status !== 'connecting', 20000, 'core'); return A.state.core.status + (A.state.core.info?.db ? ' · ' + A.state.core.info.db.type : '');`).catch((error) => error.message);
    report({ name: 'own Vite (free port), browser started, app open', group: 'Launch', ok: true, ms: performance.now() - launched, notes: [`${app.url} · core: ${app.webCore ? app.webCore.url : 'no server/web.js'} → ${core}`] });
  } catch (error) {
    report({ name: 'own Vite (free port), browser started, app open', group: 'Launch', ok: false, ms: performance.now() - launched, error: error.message });
    await app.stop();
    return;
  }
  try {
    app.takeErrors();
    await runCases(report, suite.cases, app, 'E2E · web');
    for (const file of fs.existsSync(path.join(root, 'test', 'e2e', 'views')) ? fs.readdirSync(path.join(root, 'test', 'e2e', 'views')).filter((f) => f.endsWith('.suite.mjs')).sort() : []) {
      const extra = await importLocal('test', 'e2e', 'views', file);
      await runCases(report, extra.cases, app, 'E2E · web');
    }
    const commands = await suite.commandCases(app);
    await runCases(report, commands, app, 'E2E · web · commands');
  } finally {
    await app.stop();
  }
}

/** Every tutorial step in the real app (web build); a step fails on a page error, an error popup or no outlined target. */
async function runTutorial(report) {
  const { WebApp } = await importLocal('test', 'e2e', 'web.harness.mjs');
  const app = new WebApp({ gpu: false });
  spin('starting the app…');
  try {
    await app.start();
  } catch (error) {
    report({ name: 'start the app', ok: false, ms: 0, error: error.message });
    await app.stop();
    return;
  }
  try {
    const steps = await app.run(`return (await import('/src/ui/tutorial.js')).STEPS.map((s) => ({ id: s.id, chapter: s.chapter }));`);
    app.takeErrors();
    await app.run(`A.state.settings.tutorialDone = false; A.run('tutorial'); return 1;`);
    for (let i = 0; i < steps.length; i++) {
      const start = performance.now();
      spin(`tutorial ${i + 1}/${steps.length} · ${steps[i].id}`);
      let error = null;
      let target = false;
      try {
        // The card's own "next" button (as a user clicks it).
        if (i > 0) await app.run(`document.querySelector('#tutorial-layer [data-tour="next"]').click(); return 1;`);
        await app.main.waitFor(`(() => { const s = window.__myboard.tutorial()?.state(); return s && s.active && s.index === ${i} && !s.busy; })()`, { timeout: 40000 });
        target = await app.main.waitFor(`Boolean(document.querySelector('.tour-outline'))`, { timeout: 3000 }).then(() => true, () => false);
        const popupError = await app.run(`return document.querySelector('.web-popup-error') ? (document.querySelector('.web-popup-error iframe')?.contentDocument?.querySelector('.popup')?.textContent.trim().slice(0, 300) || 'error popup') : '';`);
        if (popupError) error = `error popup: ${popupError}`;
        else if (!target) error = 'the step outlines nothing (its target is missing)';
      } catch (caught) {
        error = caught.message;
      }
      const logged = app.takeErrors();
      if (logged.length) error = [error, `${logged.length} page error(s):`, ...logged.slice(0, 5).map((text) => `  ${String(text).slice(0, 400)}`)].filter(Boolean).join('\n');
      report({ name: `${String(i + 1).padStart(2, '0')} ${steps[i].id}`, group: steps[i].chapter, ok: !error, ms: performance.now() - start, error });
    }
    const end = performance.now();
    await app.run(`document.querySelector('#tutorial-layer [data-tour="next"]')?.click(); await T.until(() => !A.tutorial().state().active, 10000, 'tour ended'); return 1;`).catch(() => {});
    const restored = await app.run(`return A.state.settings.tutorialDone === true && !document.querySelector('#tutorial-layer.active') && !A.popups.inline && !document.querySelector('.web-popup');`).catch((error) => error.message);
    const logged = app.takeErrors();
    report({ name: 'last step "Done" → tutorial closed, settings and screen restored', group: 'Cleanup', ok: restored === true && !logged.length, ms: performance.now() - end, error: restored === true ? (logged.length ? logged.join('\n') : null) : `not restored (${restored})` });
  } finally {
    await app.stop();
  }
}

async function runDesktop(report) {
  if (process.platform !== 'win32') {
    report({ name: 'desktop E2E runs on Windows (WebView2 CDP)', ok: true, skipped: 'Windows only', ms: 0 });
    return;
  }
  const { DesktopApp } = await importLocal('test', 'e2e', 'harness.mjs');
  const { desktopCases } = await importLocal('test', 'e2e', 'desktop.suite.mjs');
  const app = new DesktopApp();
  const launched = performance.now();
  spin('starting the debug app…');
  try {
    const why = await app.start();
    if (why?.skipped) { report({ name: 'start the debug app', group: 'Launch', ok: true, skipped: why.skipped, ms: performance.now() - launched }); return; }
    report({ name: 'debug exe started (own Vite, own WebView2 profile), DevTools attached', group: 'Launch', ok: true, ms: performance.now() - launched, notes: app.notes });
  } catch (error) {
    report({ name: 'debug exe started, DevTools attached', group: 'Launch', ok: false, ms: performance.now() - launched, error: error.message, notes: app.notes });
    await app.stop();
    return;
  }
  try {
    app.takeErrors();
    await runCases(report, desktopCases, app, 'E2E · desktop');
  } finally {
    const t0 = performance.now();
    const closed = await app.stop();
    report({ name: 'closes only the processes it started (other apps and servers untouched)', group: 'Cleanup', ok: closed.ok, ms: performance.now() - t0, error: closed.ok ? null : closed.error });
  }
}

const totalStart = performance.now();
const summary = [];
line();
line(`${c.inverseBlue(c.bold(' MyBoard tests '))} ${c.gray(new Date().toLocaleString('en-US'))}`);
line(c.gray(`  categories: ${selected.join(', ')}   (npm test -- --only web · --skip rust · --quick · --desktop · --installer)`));

for (const category of CATEGORIES.filter((item) => selected.includes(item.id))) {
  line();
  line(`${category.tint('▌')} ${c.bold(category.tint(category.title))} ${c.gray(`— ${category.subtitle}`)}`);
  const results = [];
  const start = performance.now();
  try {
    await category.run(makeReporter(category, results, start));
  } catch (error) {
    results.push({ name: 'runner error', ok: false, ms: 0, error: error.stack ?? error.message });
    line(`  ${c.red('✖ runner error')} ${c.red(error.stack ?? error.message)}`);
  }
  stopSpin();
  const ms = performance.now() - start;
  const passedCount = results.filter((r) => r.ok && !r.skipped).length;
  const failedCount = results.filter((r) => !r.ok).length;
  line(`  ${c.gray('└')} ${failedCount ? c.red(`✖ ${failedCount} failed`) : c.green(`✔ ${passedCount} passed`)}${failedCount ? c.green(` · ✔ ${passedCount} passed`) : ''}${results.some((r) => r.skipped) ? c.gray(` · ○ ${results.filter((r) => r.skipped).length} skipped`) : ''} ${c.gray(`(${formatMs(ms)})`)}`);
  summary.push({ category, results, ms });
}
stopSpin();

// Results: one table per category, columns aligned — failures first, then slowest first.
const width = Math.min(78, Math.max(30, ...summary.flatMap(({ results }) => results.map((r) => cells(`${r.group ? `${r.group} › ` : ''}${r.name}`)))));
const rule = (text) => c.bold(`${'━'.repeat(4)} ${text} ${'━'.repeat(Math.max(4, width + 40 - cells(text)))}`);
line();
line(rule('Results (by category · failures first · slowest first)'));
for (const { category, results, ms } of summary) {
  const failed = results.filter((result) => !result.ok);
  const status = failed.length ? c.inverseRed(' FAIL ') : c.inverseGreen(' PASS ');
  line();
  line(`${status} ${c.bold(category.tint(category.title))} ${c.gray(`(${results.length} tests · ${formatMs(ms)})`)}`);
  line(c.gray(`   ${'Status'.padEnd(7)}  ${fit('Group › Test', width)}  ${'Time'.padStart(9)}  Bar`));
  const sorted = [...results].sort((a, b) => Number(a.ok) - Number(b.ok) || Number(Boolean(a.skipped)) - Number(Boolean(b.skipped)) || b.ms - a.ms);
  const slowest = Math.max(1, ...sorted.map((r) => r.ms));
  for (const result of sorted) {
    const label = `${result.group ? `${result.group} › ` : ''}${result.name}`;
    const padded = fit(label, width);
    const mark = result.skipped ? c.gray('○ SKIP ') : result.ok ? c.green('✔ PASS ') : c.red('✖ FAIL ');
    const bar = '█'.repeat(Math.max(1, Math.round((result.ms / slowest) * 16)));
    const text = result.skipped ? c.gray(padded) : result.ok ? padded : c.red(padded);
    line(`   ${mark}  ${text}  ${timeColor(result.ms)(formatMs(result.ms).padStart(9))}  ${timeColor(result.ms)(bar)}`);
  }
}

line();
line(c.bold('┌──────────────────────────────┬────────┬────────┬────────┬────────┬────────────┐'));
line(c.bold('│ Category                     │  Pass  │  Fail  │  Skip  │  Total │    Time    │'));
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
  line(`│ ${category.tint(fit(category.title, 28))} │ ${c.green(String(ok).padStart(6))} │ ${(bad ? c.red : c.gray)(String(bad).padStart(6))} │ ${c.gray(String(skippedCount).padStart(6))} │ ${String(results.length).padStart(6)} │ ${formatMs(ms).padStart(10)} │`);
}
line(c.bold('├──────────────────────────────┼────────┼────────┼────────┼────────┼────────────┤'));
line(`│ ${c.bold(fit('Total', 28))} │ ${c.green(c.bold(String(passed).padStart(6)))} │ ${(failedTotal ? c.red : c.gray)(c.bold(String(failedTotal).padStart(6)))} │ ${c.gray(c.bold(String(skippedTotal).padStart(6)))} │ ${c.bold(String(total).padStart(6))} │ ${c.bold(formatMs(performance.now() - totalStart).padStart(10))} │`);
line(c.bold('└──────────────────────────────┴────────┴────────┴────────┴────────┴────────────┘'));
line();
if (failedTotal) {
  line(`${c.inverseRed(c.bold(` ✖ ${failedTotal} failed `))} ${c.red('Failed tests (first line of the reason):')}`);
  for (const { category, results } of summary) for (const result of results.filter((r) => !r.ok)) {
    line(c.red(`   • [${category.id}] ${result.group ? `${result.group} › ` : ''}${result.name}`));
    const reason = String(result.error ?? '').split('\n').map((x) => x.trim()).find(Boolean);
    if (reason) line(c.gray(`       ${reason.slice(0, 160)}`));
  }
} else {
  line(`${c.inverseGreen(c.bold(` ✔ All tests passed (${passed}${skippedTotal ? `, ${skippedTotal} skipped` : ''}) `))}`);
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
fs.writeFileSync(path.join(reportDir, 'report.txt'), `MyBoard test report — ${new Date().toLocaleString('en-US')}\n\n${transcript.join('\n')}\n`);
line(c.gray('  Details: test-results/results.json · test-results/report.txt'));
process.exit(failedTotal ? 1 : 0);
