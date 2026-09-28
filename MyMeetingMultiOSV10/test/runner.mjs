// Colorful feature-test runner.
// Suites live in test/suites and are loaded through Vite so JSX, import.meta
// and CSS-url imports resolve the same way the app does.
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[38;5;203m',
  green: '\x1b[38;5;48m',
  yellow: '\x1b[38;5;220m',
  cyan: '\x1b[38;5;81m',
  blue: '\x1b[38;5;75m',
  magenta: '\x1b[38;5;177m',
  orange: '\x1b[38;5;214m',
  gray: '\x1b[38;5;245m',
  white: '\x1b[38;5;255m',
  pink: '\x1b[38;5;213m',
};

const SUITE_COLORS = [C.cyan, C.magenta, C.blue, C.orange, C.pink, C.green, C.yellow];

function dispWidth(s) {
  let w = 0;
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    const wide = (c >= 0x1100 && c <= 0x115F)
      || c === 0x2329 || c === 0x232A
      || (c >= 0x2E80 && c <= 0xA4CF && c !== 0x303F)
      || (c >= 0xAC00 && c <= 0xD7A3)
      || (c >= 0xF900 && c <= 0xFAFF)
      || (c >= 0xFE10 && c <= 0xFE19)
      || (c >= 0xFE30 && c <= 0xFE6F)
      || (c >= 0xFF00 && c <= 0xFF60)
      || (c >= 0xFFE0 && c <= 0xFFE6);
    w += wide ? 2 : 1;
  }
  return w;
}

function padEnd(s, width) {
  const extra = width - dispWidth(s);
  return s + (extra > 0 ? ' '.repeat(extra) : '');
}

function padStart(s, width) {
  const extra = width - dispWidth(s);
  return (extra > 0 ? ' '.repeat(extra) : '') + s;
}

function clip(s, width) {
  if (dispWidth(s) <= width) return s;
  let out = '';
  let w = 0;
  for (const ch of s) {
    const cw = dispWidth(ch);
    if (w + cw > width - 1) break;
    out += ch;
    w += cw;
  }
  return out + '…';
}

function fmtMs(ms) {
  if (ms < 1000) return `${ms.toFixed(2)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function paint(text, color) {
  return `${color}${text}${C.reset}`;
}

function installDom() {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: 'http://localhost:5179/',
    pretendToBeVisual: true,
  });
  const win = dom.window;
  const disk = { settings: null };
  win.electronAPI = {
    isElectron: true,
    saveSettings(data) { disk.settings = JSON.parse(JSON.stringify(data)); },
    loadSettings() { return Promise.resolve(disk.settings); },
  };
  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.localStorage = win.localStorage;
  for (const key of ['HTMLElement', 'Element', 'Node', 'DOMParser', 'File', 'Blob', 'FileReader']) {
    try {
      Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
    } catch { /* Node already exposes some of these as getters. */ }
  }
  globalThis.__mtgTestDisk = disk;
  return win;
}

function quietToolingNoise() {
  const origWarn = console.warn.bind(console);
  console.warn = (...args) => {
    const text = args.map((item) => String(item)).join(' ');
    if (text.includes('CJS build of Vite')) return;
    origWarn(...args);
  };
  const origErr = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, enc, cb) => {
    if (String(chunk).includes('The build was canceled') || String(chunk).includes('CJS build of Vite')) {
      if (typeof enc === 'function') enc();
      else if (typeof cb === 'function') cb();
      return true;
    }
    return origErr(chunk, enc, cb);
  };
}

function banner() {
  const bar = '━'.repeat(62);
  console.log('');
  console.log(paint(`  ${bar}`, C.magenta));
  console.log(`  ${paint('MyMeeting', C.bold + C.white)}  ${paint('기능 테스트', C.pink)}`);
  console.log(`  ${paint('각 케이스의 실행 시간과 함께 결과를 표시합니다', C.gray)}`);
  console.log(paint(`  ${bar}`, C.magenta));
  console.log('');
}

function printCase(result) {
  const mark = result.ok
    ? paint('✓', C.green)
    : paint('✗', C.red);
  const time = paint(padStart(fmtMs(result.ms), 10), C.yellow);
  const label = clip(result.name, 76);
  const padded = padEnd(label, 76);
  const shown = result.ok
    ? paint(padded, C.white)
    : paint(padded, C.red);
  console.log(`    ${mark}  ${shown}  ${time}`);
  if (!result.ok) {
    const lines = String(result.error?.stack || result.error?.message || result.error)
      .split('\n')
      .slice(0, 6);
    for (const line of lines) console.log(`       ${paint(line, C.red)}`);
  }
}

function summary(suites, totalMs) {
  const nameW = Math.max(12, ...suites.map((s) => dispWidth(s.title)));
  const line = (left, mid, right) => `  ${paint(left + mid + right, C.magenta)}`;
  const top = '╭' + '─'.repeat(nameW + 2) + '┬' + '─'.repeat(8) + '┬' + '─'.repeat(8) + '┬' + '─'.repeat(12) + '╮';
  const sep = '├' + '─'.repeat(nameW + 2) + '┼' + '─'.repeat(8) + '┼' + '─'.repeat(8) + '┼' + '─'.repeat(12) + '┤';
  const bot = '╰' + '─'.repeat(nameW + 2) + '┴' + '─'.repeat(8) + '┴' + '─'.repeat(8) + '┴' + '─'.repeat(12) + '╯';

  let passed = 0;
  let failed = 0;
  console.log('');
  console.log(`  ${paint('Summary', C.bold + C.magenta)}`);
  console.log(line(top, '', ''));
  const head = `│ ${padEnd('Suite', nameW)} │ ${padStart('Pass', 6)} │ ${padStart('Fail', 6)} │ ${padStart('Time', 10)} │`;
  console.log(`  ${paint(head, C.cyan)}`);
  console.log(line(sep, '', ''));

  for (const suite of suites) {
    passed += suite.passed;
    failed += suite.failed;
    const title = paint(padEnd(suite.title, nameW), suite.color);
    const pass = paint(padStart(String(suite.passed), 6), C.green);
    const fail = paint(padStart(String(suite.failed), 6), suite.failed ? C.red : C.gray);
    const time = paint(padStart(fmtMs(suite.ms), 10), C.yellow);
    console.log(`  ${paint('│', C.magenta)} ${title} ${paint('│', C.magenta)} ${pass} ${paint('│', C.magenta)} ${fail} ${paint('│', C.magenta)} ${time} ${paint('│', C.magenta)}`);
  }
  console.log(line(bot, '', ''));

  const all = passed + failed;
  const ratio = all ? passed / all : 1;
  const cells = 32;
  const filled = Math.round(ratio * cells);
  const bar = paint('█'.repeat(filled), C.green) + paint('░'.repeat(cells - filled), C.gray);
  const passLabel = paint(`${passed} passed`, C.bold + C.green);
  const failLabel = paint(`${failed} failed`, failed ? C.bold + C.red : C.gray);
  const timeLabel = paint(fmtMs(totalMs), C.bold + C.yellow);
  const status = failed
    ? paint('FAILED', C.bold + C.red)
    : paint('PASSED', C.bold + C.green);
  console.log('');
  console.log(`  ${status}   ${bar}  ${Math.round(ratio * 100)}%`);
  console.log(`  ${passLabel}    ${failLabel}    ${paint('total', C.gray)} ${timeLabel}`);
  console.log('');
}

async function main() {
  quietToolingNoise();
  banner();

  const dir = path.join(here, 'suites');
  const files = fs.readdirSync(dir)
    .filter((name) => name.endsWith('.test.js'))
    .sort();

  const server = await createServer({
    root,
    configFile: path.join(root, 'vite.config.js'),
    logLevel: 'silent',
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    ssr: { optimizeDeps: { noDiscovery: true, include: [] } },
  });
  installDom();

  const suites = [];
  const started = performance.now();

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const color = SUITE_COLORS[i % SUITE_COLORS.length];
      const suiteStarted = performance.now();
      const results = [];
      let title = file.replace(/\.test\.js$/, '');

      try {
        const mod = await server.ssrLoadModule(path.join(dir, file));
        title = mod.title || title;
        console.log(`  ${paint('▸', color)} ${paint(title, C.bold + color)}`);
        const test = async (name, fn) => {
          const t0 = performance.now();
          try {
            await fn();
            const row = { name, ok: true, ms: performance.now() - t0 };
            results.push(row);
            printCase(row);
          } catch (error) {
            const row = { name, ok: false, ms: performance.now() - t0, error };
            results.push(row);
            printCase(row);
          }
        };
        await mod.default(test);
      } catch (error) {
        console.log(`  ${paint('▸', color)} ${paint(title, C.bold + color)}`);
        const row = { name: '스위트 로드', ok: false, ms: performance.now() - suiteStarted, error };
        results.push(row);
        printCase(row);
      }

      const passed = results.filter((r) => r.ok).length;
      const failed = results.length - passed;
      suites.push({
        title,
        color,
        passed,
        failed,
        ms: performance.now() - suiteStarted,
      });
      console.log('');
    }
  } finally {
    await server.close();
  }

  summary(suites, performance.now() - started);
  const failed = suites.reduce((n, s) => n + s.failed, 0);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
