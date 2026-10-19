// Help screenshots and the tutorial video, taken from the real app.
//
//   npm run build && node scripts/make-help-media.mjs              # screenshots + video
//   node scripts/make-help-media.mjs --shots                       # screenshots only
//   node scripts/make-help-media.mjs --video                       # video only
//   node scripts/make-help-media.mjs --only find,replace           # some screenshots
//   node scripts/make-help-media.mjs --shots --lang en             # the English help's screenshots
//
// The web build (dist/) is served by server/server.js with a private profile
// and a seeded sample folder, and driven in headless Edge / Chrome over the
// DevTools protocol through window.__med (the app's automation hook).
// Screenshots go to src/help/images (bundled into the Help window); the video
// is written to tutorial-all.mp4 in the project root (needs ffmpeg on PATH).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANG = (process.argv.includes('--lang') && process.argv[process.argv.indexOf('--lang') + 1]) || 'ko';
const imagesDir = path.join(root, 'src', 'help', 'images', LANG);
const videoOut = path.join(root, 'tutorial-all.mp4');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'myeditor-help-'));
let work = path.join(tmp, '0', 'my-project');
const profile = path.join(tmp, 'profile');
const PORT = 5231;
const CDP_PORT = 9431;

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };
const only = opt('only') ? new Set(opt('only').split(',')) : null;
const doShots = !flag('video');
const doVideo = !flag('shots') && !only && LANG === 'ko';   // the video is Korean

if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('dist/ missing — run `npm run build` first.');
  process.exit(1);
}

// ── sample folder ──
function crc32(buf) {
  let c = ~0;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}
function png(w, h, pixel) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) { const [r, g, b] = pixel(x, y); const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; }
  }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const sunset = (w, h) => (x, y) => {
  const t = y / h, sun = Math.hypot(x - w * 0.62, y - h * 0.58) < h * 0.16;
  if (sun) return [255, 214, 120];
  if (y > h * 0.66) { const s = 0.5 + 0.5 * Math.sin(x / 9 + y / 3); return [20 + 30 * s, 40 + 40 * s, 90 + 60 * s]; }
  return [Math.round(40 + 215 * t), Math.round(60 + 90 * t), Math.round(140 - 40 * t)];
};

const FILES = {
  'src/app.js': `// 주문 목록을 읽어 합계를 계산하는 예제
import { readFile } from 'node:fs/promises';

const TAX_RATE = 0.1;

/**
 * 주문 파일을 읽어 줄 단위로 나눕니다.
 * @param {string} file
 */
export async function loadOrders(file) {
  const text = await readFile(file, 'utf-8');
  const lines = text.split(/\\r?\\n/).filter(Boolean);
  return lines.map((line) => {
    const [name, price, count] = line.split(',');
    return { name, price: Number(price), count: Number(count) };
  });
}

export function total(orders) {
  const sum = orders.reduce((acc, o) => acc + o.price * o.count, 0);
  return Math.round(sum * (1 + TAX_RATE));
}

export default class Report {
  constructor(title = '주간 보고') { this.title = title; }
  print(orders) {
    console.log(\`\${this.title}: \${orders.length}건, 합계 \${total(orders)}원\`);
  }
}
`,
  'src/lib/util.py': `"""작은 도구 모음"""
import json
from pathlib import Path


def read_json(path: str) -> dict:
    """JSON 파일을 읽어 사전으로 돌려줍니다."""
    return json.loads(Path(path).read_text(encoding="utf-8"))


class Counter:
    def __init__(self):
        self.items = {}

    def add(self, key, n=1):
        self.items[key] = self.items.get(key, 0) + n
        return self.items[key]
`,
  'src/broken.js': `// 검사(Lint) 예제: 일부러 넣은 문제들
const unused = 42;
function greet(name {
  console.log('hello ' + nam);
}
greet('world')
`,
  'docs/README.md': `# 프로젝트 안내

My Editor 로 작성한 **Markdown** 문서입니다. *기울임*, ~~취소선~~, \`코드\` 를 쓸 수 있습니다.

## 할 일

- [x] 샘플 파일 만들기
- [x] 미리보기 확인
- [ ] 인쇄해 보기

## 표

| 항목 | 수량 | 가격 |
| --- | ---: | ---: |
| 사과 | 3 | 1,500 |
| 배 | 2 | 2,400 |

## 코드

\`\`\`js
console.log('안녕하세요');
\`\`\`

> 인용문입니다. [링크](https://example.com)

## 그림

![노을](sunset.png)

### 세부 항목 A

본문 내용.

### 세부 항목 B

본문 내용.
`,
  'docs/page.html': `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>미리보기 예제</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<h1 id="title">HTML 미리보기</h1>
<p>로컬 그림과 CSS, 스크립트가 함께 표시됩니다.</p>
<img src="sunset.png" alt="노을" width="320">
<ul><li>첫째</li><li>둘째</li></ul>
<script>document.getElementById('title').textContent += ' (스크립트 실행됨)';</script>
</body>
</html>
`,
  'docs/style.css': `body { font-family: sans-serif; margin: 24px; color: #223; }
h1 { color: #3a86ff; }
img { border-radius: 8px; }
`,
  'docs/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160"><rect x="10" y="10" width="220" height="140" rx="22" fill="#3a86ff"/><circle cx="120" cy="80" r="40" fill="#ffbe0b"/><text x="120" y="88" font-size="22" text-anchor="middle" fill="#123">SVG</text></svg>\n',
  'notes.txt': 'first line\r\nsecond line\r\n한글 메모\r\n',
  'spelling.txt': 'This sentense has a few mispelled words.\nThe editor underlines them and offers sugestions.\n',
  'data.json': JSON.stringify({ name: 'sample', ok: true, list: [1, 2, 3], nested: { a: 'b' } }, null, 2) + '\n',
  'legacy.txt': Buffer.from([0xbe, 0xc8, 0xb3, 0xe7, 0x20, 0x45, 0x55, 0x43, 0x2d, 0x4b, 0x52, 0x0a]),
};

let seeded = 0;
// A new folder every time: a terminal opened by the previous shot may still hold the last one.
// The English screenshots show English sample files.
const FILES_EN = {
  'src/app.js': `// Reads an order list and works out the total
import { readFile } from 'node:fs/promises';

const TAX_RATE = 0.1;

/**
 * Reads the order file and splits it into lines.
 * @param {string} file
 */
export async function loadOrders(file) {
  const text = await readFile(file, 'utf-8');
  const lines = text.split(/\\r?\\n/).filter(Boolean);
  return lines.map((line) => {
    const [name, price, count] = line.split(',');
    return { name, price: Number(price), count: Number(count) };
  });
}

export function total(orders) {
  const sum = orders.reduce((acc, o) => acc + o.price * o.count, 0);
  return Math.round(sum * (1 + TAX_RATE));
}

export default class Report {
  constructor(title = 'Weekly report') { this.title = title; }
  print(orders) {
    console.log(\`\${this.title}: \${orders.length} orders, total \${total(orders)}\`);
  }
}
`,
  'src/lib/util.py': `"""A few small helpers"""
import json
from pathlib import Path


def read_json(path: str) -> dict:
    """Reads a JSON file and returns a dict."""
    return json.loads(Path(path).read_text(encoding="utf-8"))


class Counter:
    def __init__(self):
        self.items = {}

    def add(self, key, n=1):
        self.items[key] = self.items.get(key, 0) + n
        return self.items[key]
`,
  'src/broken.js': `// Lint sample: problems on purpose
const unused = 42;
function greet(name {
  console.log('hello ' + nam);
}
greet('world')
`,
  'docs/README.md': `# Project notes

A **Markdown** document written in My Editor. You can use *italics*, ~~strikethrough~~ and \`code\`.

## To do

- [x] Make the sample files
- [x] Check the preview
- [ ] Try printing

## Table

| Item | Qty | Price |
| --- | ---: | ---: |
| Apples | 3 | 1.50 |
| Pears | 2 | 2.40 |

## Code

\`\`\`js
console.log('Hello');
\`\`\`

> A quote. [Link](https://example.com)

## Picture

![Sunset](sunset.png)

### Detail A

Body text.

### Detail B

Body text.
`,
  'docs/page.html': `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Preview sample</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<h1 id="title">HTML preview</h1>
<p>Local pictures, CSS and scripts are shown together.</p>
<img src="sunset.png" alt="Sunset" width="320">
<ul><li>First</li><li>Second</li></ul>
<script>document.getElementById('title').textContent += ' (script ran)';</script>
</body>
</html>
`,
  'notes.txt': 'first line\r\nsecond line\r\nthird line\r\n',
};

function seed() {
  work = path.join(tmp, String(++seeded), 'my-project');
  for (const [rel, body] of Object.entries({ ...FILES, ...(LANG === 'en' ? FILES_EN : {}) })) {
    const f = path.join(work, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, body);
  }
  fs.writeFileSync(path.join(work, 'docs', 'sunset.png'), png(480, 300, sunset(480, 300)));
  const bin = Buffer.alloc(4096); for (let i = 0; i < bin.length; i++) bin[i] = (i * 37 + (i >> 4)) & 0xff; bin.write('MYEDITOR BINARY SAMPLE', 0);
  fs.writeFileSync(path.join(work, 'sample.bin'), bin);
}

const p = (rel) => path.join(work, rel);
function writeSession(extra = {}) {
  fs.rmSync(profile, { recursive: true, force: true });
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'session.json'), JSON.stringify({
    sessionVersion: 7, language: LANG, theme: 'midnight', folder: work, sidebarVisible: true, toolbarVisible: true, statusBarVisible: true,
    tabs: [{ path: p('src/app.js'), cursor: { anchor: 260, head: 260 } }, { path: p('docs/README.md') }, { path: p('notes.txt') }],
    activeTab: 0,
    recent: [p('src/app.js'), p('docs/README.md'), p('notes.txt'), p('src/lib/util.py'), p('docs/page.html')],
    ...extra,
  }, null, 2));
}

// ── server and browser ──
let server = null;
async function startServer() {
  await stopServer();
  server = spawn(process.execPath, [path.join(root, 'server', 'server.js'), '--port', String(PORT), '--no-open', '--config', profile], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, MED_SMOKE: '1' } });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 15000);
    server.stdout.on('data', (d) => { if (String(d).includes('http://')) { clearTimeout(t); resolve(); } });
    server.on('exit', (c) => reject(new Error(`server exited ${c}`)));
  });
}
async function stopServer() {
  if (!server) return;
  const s = server; server = null;
  s.removeAllListeners('exit');
  await new Promise((r) => {
    s.once('exit', r);
    // The whole tree: a terminal opened in the app is a child of the server and holds the sample folder.
    if (process.platform === 'win32') spawnSync(path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'taskkill.exe'), ['/PID', String(s.pid), '/T', '/F'], { stdio: 'ignore' });
    else s.kill();
    setTimeout(r, 3000);
  });
}

function browserPath() {
  const list = [
    process.env.BROWSER_PATH,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  const found = list.find((f) => fs.existsSync(f));
  if (!found) throw new Error('Edge or Chrome is required (set BROWSER_PATH).');
  return found;
}

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map(); ws.addEventListener('message', (e) => this.onMessage(JSON.parse(e.data))); }
  static async connect(url) { const ws = new WebSocket(url); await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); }); return new Cdp(ws); }
  onMessage(m) {
    if (m.id && this.pending.has(m.id)) { const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); return; }
    const h = this.handlers.get(m.method); if (h) h(m.params);
  }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject })); }
  on(method, fn) { this.handlers.set(method, fn); }
}

let browser = null;
let page = null;
async function startBrowser() {
  const dir = path.join(tmp, 'browser');
  browser = spawn(browserPath(), ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${dir}`, '--window-size=1280,800', '--hide-scrollbars', '--force-device-scale-factor=1', '--lang=ko-KR', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-site-isolation-trials', '--disable-features=IsolateOrigins,site-per-process', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
  let targets = null;
  for (let i = 0; i < 100 && !targets; i++) {
    try { const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json(); targets = list.filter((t) => t.type === 'page'); if (!targets.length) targets = null; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  if (!targets) throw new Error('browser did not start');
  page = await Cdp.connect(targets[0].webSocketDebuggerUrl);
  await page.send('Page.enable');
  await page.send('Runtime.enable');
}

async function viewport(width, height) {
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
}

async function evaluate(expression, timeout = 30000) {
  const r = await Promise.race([
    page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
    new Promise((_, j) => setTimeout(() => j(new Error('evaluate timed out')), timeout)),
  ]);
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
  return r.result.value;
}

async function navigate(url) {
  const loaded = new Promise((r) => page.on('Page.loadEventFired', r));
  await page.send('Page.navigate', { url });
  await loaded;
}

// ── page helpers (run inside the app) ──
const PRELUDE = `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 10000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timeout: ' + fn.toString()); await wait(50); } };
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const med = () => window.__med;
  const docNamed = (name) => med().state.docs.find((d) => d.name === name);
  const show = async (name) => { med().activate(docNamed(name).id); await wait(500); };
  const open = async (rel) => { await med().openPath(med().state.folder + '/' + rel); await wait(700); };
  const openMenu = async (id) => { const i = med().menus.findIndex((m) => m.id === id); const btn = $$('.menus .menu-btn')[i]; btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); await until(() => $('.menu-drop')); await wait(250); };
  const ctxAt = async (el, dx = 12, dy = 10) => { const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + dx, clientY: r.top + dy, button: 2 })); await wait(350); };
  const typeInto = async (el, value) => { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); await wait(300); };
  const press = (el, key, mods = {}) => el.dispatchEvent(new KeyboardEvent('keydown', { key, code: key.length === 1 ? 'Key' + key.toUpperCase() : key, bubbles: true, cancelable: true, ...mods }));
  const cursorTo = (pos) => { const v = med().view(); v.focus(); v.dispatch({ selection: { anchor: pos } }); };
  const ready = async () => { await until(() => window.__med && window.__med.state.docs.length > 0); await wait(900); };
`;

// Each screenshot: optional session overrides, the page URL (default: the main window),
// a script, and what to keep (a selector list to clip to, or the whole page).
const MAIN = { w: 1280, h: 800 };
const SHOTS = [
  { name: 'start-page', session: { showStartOnLaunch: true }, script: `await until(() => $('.start-page')); await wait(2500);` },
  { name: 'start-tasks', session: { showStartOnLaunch: true }, script: `await until(() => $('.start-page')); await wait(1500);`, clip: ['[data-group="tasks"]'] },
  { name: 'start-background', session: { showStartOnLaunch: true }, script: `await until(() => $('.start-page')); await wait(1500);`, clip: ['[data-group="scenes"]'] },
  { name: 'tour', script: `med().action('tutorial'); await until(() => $('.tutorial-card')); await wait(800);` },
  { name: 'main-window', script: `` },
  { name: 'toolbar', script: ``, clip: ['.menubar', '.icon-toolbar'] },
  { name: 'tabbar', script: ``, clip: ['.tabbar'] },
  { name: 'statusbar', script: ``, clip: ['.statusbar'] },
  ...['file', 'edit', 'search', 'editor', 'view', 'lang', 'enc', 'help'].map((id) => ({
    name: `menu-${{ search: 'find', lang: 'language', enc: 'encoding' }[id] || id}`,
    script: `await openMenu('${id}');`, clip: ['.menubar', '.menu-drop'],
  })),
  { name: 'tab-context', script: `await ctxAt($$('.tab')[0]);`, clip: ['.tabbar', '.ctx-menu'] },
  { name: 'dirty-close', edits: true, script: `await show('notes.txt'); med().setText('바뀐 내용\\n'); await wait(200); med().action('close'); await until(() => $('.dlg')); await wait(300);` },
  { name: 'find', script: `med().action('find'); await until(() => $('.findbar input')); await typeInto($$('.findbar input')[0], 'orders'); await wait(300);` },
  { name: 'replace', script: `med().action('replace'); await until(() => $$('.findbar input').length > 1); await typeInto($$('.findbar input')[0], 'const'); await typeInto($$('.findbar input')[1], 'let'); await wait(300);` },
  { name: 'find-in-files', script: `med().action('findInFiles'); await wait(600); const inp = $('.search-panel input') || $('.sidebar input[type="search"]') || $('.sidebar input'); await typeInto(inp, 'total'); press(inp, 'Enter'); await wait(1500);` },
  { name: 'goto-line', script: `med().action('gotoLine'); await until(() => $('.dlg')); await wait(300);` },
  { name: 'language-picker', script: `med().action('languagePicker'); await until(() => $('.listbox-item')); await wait(300);` },
  { name: 'encoding-reopen', script: `await show('notes.txt'); med().action('reopenPicker'); await until(() => $('.dlg')); await wait(300);` },
  { name: 'folder-tree', script: `for (const name of ['src', 'docs']) { const row = $$('.sidebar .tree-row, .sidebar [role="treeitem"]').find((e) => e.textContent.trim() === name); if (row) { row.click(); await wait(400); } }`, clip: ['.sidebar-column'] },
  { name: 'autocomplete', edits: true, script: `const v = med().view(); const end = v.state.doc.line(22).to; v.dispatch({ changes: { from: end, insert: '\\n  con' }, selection: { anchor: end + 6 } }); v.focus(); await wait(200); press(v.contentDOM, ' ', { ctrlKey: true, code: 'Space' }); await until(() => $('.cm-tooltip-autocomplete'), 5000); await wait(400);` },
  { name: 'md-preview', script: `await show('README.md'); med().action('togglePreview'); await wait(1500);` },
  { name: 'md-wysiwyg', script: `await show('README.md'); med().action('toggle:mdWysiwyg'); await wait(1500);` },
  { name: 'md-outline', script: `await show('README.md'); med().action('toggleStructure'); await wait(1200);` },
  { name: 'html-preview', script: `await open('docs/page.html'); if (!$('.html-preview')) med().action('togglePreview'); await until(() => $('.html-preview iframe') && $('.html-preview iframe').srcdoc); await wait(4000);` },
  { name: 'svg-preview', script: `await open('docs/logo.svg'); if (!$('.svg-preview, .md-preview, .preview')) med().action('togglePreview'); await wait(1500);` },
  { name: 'image-view', script: `await open('docs/sunset.png'); await wait(1500);` },
  { name: 'hex-view', script: `await open('sample.bin'); await until(() => $('.hex-view'), 8000); await wait(800);` },
  { name: 'split-cols', script: `med().action('split:cols'); await wait(600); med().focusPane(1); await wait(200); await show('README.md'); await wait(600);` },
  { name: 'split-grid', script: `await open('src/lib/util.py'); med().action('split:grid'); await wait(600); const names = ['app.js', 'README.md', 'notes.txt']; for (let i = 1; i < 4; i++) { med().showInPane(i, docNamed(names[i - 1]).id); await wait(300); } med().focusPane(0); await wait(600);` },
  { name: 'lint', session: { lint: true, showLint: true }, script: `await open('src/broken.js'); med().action('lintPanel'); await wait(6000);` },
  { name: 'spell', session: { spellCheck: true }, script: `await open('spelling.txt'); await until(() => $('.cm-spell-error'), 8000); await wait(500); await ctxAt($$('.cm-spell-error')[1], 6, 8); await until(() => $('.ctx-menu')); await wait(400);` },
  { name: 'terminal', script: `med().action('toggleTerminal'); await until(() => $('.term-view:not(.hidden) input'), 8000); await wait(2500); const inp = $('.term-view:not(.hidden) input'); await typeInto(inp, 'dir'); press(inp, 'Enter'); await wait(2500);` },
  { name: 'log', script: `med().action('toggleLog'); await wait(1200);` },
  { name: 'print-preview', script: `med().action('print'); await until(() => $('.print-preview, .dlg'), 8000); await wait(2500);` },
  { name: 'theme-list', script: `$('.tb-split-caret').click(); await until(() => $('.theme-menu')); await wait(400);` },
  { name: 'theme-light', session: { theme: 'daylight' }, script: `` },
  { name: 'font-picker', script: `const fp = $('.icon-toolbar .font-picker input, .icon-toolbar .font-picker button, .font-picker input'); fp.focus(); fp.click(); await wait(1200);` },
  ...['general', 'start', 'theme', 'terminal', 'format', 'lint', 'print'].map((tab) => ({ name: `settings-${tab}`, url: `/?popup=settings&tab=${tab}`, size: { w: 1000, h: 860 }, script: `await until(() => $('.settings-tab.active')); await wait(1200);` })),
  { name: 'shortcuts', url: '/?popup=shortcuts', size: { w: 1000, h: 780 }, script: `await until(() => $('.dlg')); await wait(800);` },
  { name: 'about', url: '/?popup=about', size: { w: 560, h: 340 }, script: `await until(() => $('.dlg')); await wait(800);` },
  { name: 'help-window', url: '/?popup=help', size: { w: 1180, h: 820 }, script: `await until(() => $('.help-article h1')); await wait(800);` },
];

async function clipRect(selectors, pad = 8) {
  const r = await evaluate(`(() => { const rs = ${JSON.stringify(selectors)}.flatMap((s) => Array.from(document.querySelectorAll(s))).map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height);
    if (!rs.length) return null; const x = Math.min(...rs.map((r) => r.left)), y = Math.min(...rs.map((r) => r.top)), x2 = Math.max(...rs.map((r) => r.right)), y2 = Math.max(...rs.map((r) => r.bottom));
    return { x, y, w: x2 - x, h: y2 - y, vw: innerWidth, vh: innerHeight }; })()`);
  if (!r) return null;
  const x = Math.max(0, Math.floor(r.x - pad)), y = Math.max(0, Math.floor(r.y - pad));
  return { x, y, width: Math.min(r.vw - x, Math.ceil(r.w + pad * 2)), height: Math.min(r.vh - y, Math.ceil(r.h + pad * 2)), scale: 1 };
}

async function shoot(shot) {
  // Leave the previous shot's page first: its pending session save would otherwise
  // reach the next server (same port) and bring its edits back as unsaved drafts.
  await navigate('about:blank');
  seed();
  writeSession(shot.session);
  await startServer();
  const size = shot.size || MAIN;
  await viewport(size.w, size.h);
  await page.send('Storage.clearDataForOrigin', { origin: `http://127.0.0.1:${PORT}`, storageTypes: 'all' });   // the web build keeps layout in local storage
  await navigate(`http://127.0.0.1:${PORT}${shot.url || '/'}`);
  const result = await evaluate(`(async () => { ${PRELUDE} ${shot.url ? `await wait(600);` : 'await ready();'} ${shot.script} return ${shot.probe || "'ok'"}; })()`, 60000);
  if (!shot.url) {
    const dirty = await evaluate(`window.__med.state.docs.filter((d) => d.dirty).map((d) => d.name).join(', ')`);
    if (dirty && !shot.edits) throw new Error(`unexpected unsaved document(s): ${dirty}`);
  }
  const clip = shot.clip ? await clipRect(shot.clip) : null;
  if (shot.clip && !clip) throw new Error(`nothing to clip: ${shot.clip}`);
  const { data } = await page.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) });
  fs.writeFileSync(path.join(imagesDir, `${shot.name}.png`), Buffer.from(data, 'base64'));
  return result;
}

async function shots() {
  fs.mkdirSync(imagesDir, { recursive: true });
  const failed = [];
  for (const shot of SHOTS) {
    if (only && !only.has(shot.name)) continue;
    try { const out = await shoot(shot); console.log(`  ✓ ${shot.name}${out !== 'ok' ? ` → ${JSON.stringify(out)}` : ''}`); } catch (e) { failed.push(shot.name); console.log(`  ✗ ${shot.name}: ${e.message.split('\n')[0]}`); }
  }
  return failed;
}

// ── main ──
let failed = [];
try {
  await startBrowser();
  if (doShots) { console.log('screenshots →', path.relative(root, imagesDir)); failed = await shots(); }
  if (doVideo) { const { recordTutorial } = await import('./tutorial-video.mjs'); await recordTutorial({ page, evaluate, navigate, viewport, seed, writeSession, startServer, PRELUDE, PORT, tmp, out: videoOut }); }
} finally {
  await stopServer();
  if (browser) browser.kill();
  await new Promise((r) => setTimeout(r, 800));
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* the browser may still hold its profile */ }
}
if (failed.length) { console.error(`failed: ${failed.join(', ')}`); process.exit(1); }
