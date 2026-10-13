#!/usr/bin/env node
/*
 * MyKanban test runner.
 *
 *   npm test                 run every test file under test/
 *   npm test -- boards       run only test files whose path contains "boards"
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// Isolate all app data (SQLite DB, uploads, db-config.json) in a temp directory
// before any application module is loaded.
const TEMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'mykanban-test-'));
process.env.KANBAN_DATA_PATH = TEMP_ROOT;
process.env.MYKANBAN_TEST_TEMP = TEMP_ROOT;

const framework = require('./lib/framework');
const reporter = require('./lib/reporter');

const TEST_ROOT = __dirname;
const PROJECT_ROOT = path.join(__dirname, '..');
const GROUP_ORDER = ['unit', 'renderer', 'api'];

function findTestFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'lib' || entry.name === 'fixtures') continue;
      found.push(...findTestFiles(full));
    } else if (entry.name.endsWith('.test.js')) {
      found.push(full);
    }
  }
  return found;
}

function sortFiles(files) {
  const groupIndex = (f) => {
    const group = path.relative(TEST_ROOT, f).split(path.sep)[0];
    const idx = GROUP_ORDER.indexOf(group);
    return idx === -1 ? GROUP_ORDER.length : idx;
  };
  return files.sort((a, b) => groupIndex(a) - groupIndex(b) || a.localeCompare(b));
}

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'];

function captureConsole() {
  const logs = [];
  const originals = {};
  CONSOLE_METHODS.forEach((m) => {
    originals[m] = console[m];
    console[m] = (...args) => {
      logs.push(args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : safeStringify(a))).join(' '));
    };
  });
  return {
    logs,
    restore() { CONSOLE_METHODS.forEach((m) => { console[m] = originals[m]; }); },
  };
}

function safeStringify(v) {
  try { return JSON.stringify(v); } catch { return String(v); }
}

async function runHooks(hooks, label, timeout) {
  for (const hook of hooks) {
    await framework.withTimeout(Promise.resolve().then(hook), timeout, `${label} hook`);
  }
}

async function runSuite(suite, index, total, results) {
  reporter.suiteStart(suite, index, total);
  const started = performance.now();
  const stats = { total: suite.tests.length, passed: 0, failed: 0, skipped: 0, duration: 0 };
  const timeout = framework.DEFAULT_TIMEOUT_MS * 2;

  const record = (result, n) => {
    results.push(result);
    stats[result.status === 'pass' ? 'passed' : result.status === 'fail' ? 'failed' : 'skipped']++;
    reporter.testResult(result, n);
  };

  let beforeError = null;
  const beforeCapture = captureConsole();
  try {
    await runHooks(suite.hooks.before, 'before', timeout);
  } catch (err) {
    beforeError = err;
  } finally {
    beforeCapture.restore();
  }
  if (beforeError) reporter.hookFailure(suite, 'before', beforeError);

  for (let i = 0; i < suite.tests.length; i++) {
    const test = suite.tests[i];
    const base = { suite: suite.name, file: suite.file, name: test.name };

    if (test.skip) {
      record({ ...base, status: 'skip', duration: 0 }, i + 1);
      continue;
    }
    if (beforeError) {
      record({ ...base, status: 'fail', duration: 0, error: new Error(`Skipped because the before hook failed: ${beforeError.message}`) }, i + 1);
      continue;
    }

    const capture = captureConsole();
    const t0 = performance.now();
    let error = null;
    try {
      await runHooks(suite.hooks.beforeEach, 'beforeEach', test.timeout);
      await framework.withTimeout(Promise.resolve().then(test.fn), test.timeout, 'Test');
    } catch (err) {
      error = err;
    }
    try {
      await runHooks(suite.hooks.afterEach, 'afterEach', test.timeout);
    } catch (err) {
      error = error || err;
    }
    const duration = performance.now() - t0;
    capture.restore();

    record({ ...base, status: error ? 'fail' : 'pass', duration, error, logs: capture.logs }, i + 1);
  }

  const afterCapture = captureConsole();
  try {
    await runHooks(suite.hooks.after, 'after', timeout);
  } catch (err) {
    afterCapture.restore();
    reporter.hookFailure(suite, 'after', err);
  } finally {
    afterCapture.restore();
  }

  stats.duration = performance.now() - started;
  reporter.suiteEnd(stats);
  return { name: suite.name, file: suite.file, stats };
}

async function main() {
  const filter = process.argv.slice(2).filter((a) => !a.startsWith('-')).join(' ').trim();
  let files = sortFiles(findTestFiles(TEST_ROOT));
  if (filter) {
    const needle = filter.toLowerCase();
    files = files.filter((f) => path.relative(TEST_ROOT, f).toLowerCase().includes(needle));
  }

  reporter.header({
    files: files.length,
    nodeVersion: process.version,
    platform: `${process.platform} ${process.arch}`,
    filter,
  });

  if (!files.length) {
    process.stdout.write(`\n  ${reporter.colors.yellow('No test files matched.')}\n\n`);
    return 1;
  }

  for (const file of files) {
    framework.setCurrentFile(path.relative(PROJECT_ROOT, file).split(path.sep).join('/'));
    require(file);
  }

  const suites = framework.getSuites();
  const results = [];
  const suiteSummaries = [];
  const started = performance.now();

  for (let i = 0; i < suites.length; i++) {
    suiteSummaries.push(await runSuite(suites[i], i + 1, suites.length, results));
  }

  try {
    await require('./lib/server').stopTestServer();
  } catch {}

  reporter.summary({ suites: suiteSummaries, results, duration: performance.now() - started });
  return results.some((r) => r.status === 'fail') ? 1 : 0;
}

function cleanup() {
  try { fs.rmSync(TEMP_ROOT, { recursive: true, force: true }); } catch {}
}

main()
  .then((code) => {
    cleanup();
    process.exit(code);
  })
  .catch((err) => {
    process.stderr.write(`\n  Test runner crashed: ${err.stack || err.message}\n\n`);
    cleanup();
    process.exit(2);
  });
