// Smoke test: launches the packaged-style app (dist/ must exist) with a private
// profile, screenshots the main window into .smoke/main.png and quits; then
// starts the web server on a spare port and exercises the HTTP API.
//
//   npm run build && npm run smoke
//   npm run smoke -- --left C:\Some\Folder   (start the left panel there)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const smokeDir = path.join(root, '.smoke');
const profile = path.join(smokeDir, 'profile');
fs.mkdirSync(profile, { recursive: true });

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };

if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('[smoke] dist/ missing — run `npm run build` first.');
  process.exit(1);
}

// Seed the private profile so the panels open somewhere deterministic.
const left = opt('left') || root;
const right = opt('right') || path.join(root, 'src');
// --width <px>: start the main window at that width (e.g. the minimum) to check the layout.
fs.writeFileSync(path.join(profile, 'session.json'), JSON.stringify({ left, right, splitter: 0.5, language: opt('lang') || 'ko', theme: opt('theme') || 'dark', windowBounds: opt('width') ? { width: Number(opt('width')), height: 700 } : undefined, ...(opt('session') ? JSON.parse(opt('session')) : {}) }, null, 2));   // --session '{…}' merges extra keys

async function electronShot(name = 'main', script = null, url = null) {
  const electronPath = require('electron');
  const env = { ...process.env, CC_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const shot = path.join(smokeDir, `${name}.png`);
  const extra = [];
  if (url) extra.push(`--smoke-url=${url}`);
  if (script) {
    const file = path.join(smokeDir, `${name}.script.js`);
    fs.writeFileSync(file, script);
    extra.push(`--smoke-script=${file}`, `--smoke-settle=${opt('settle') || 1200}`);
  }
  // --probe <file.js>: evaluated after the scenario; its value is printed.
  if (opt('probe')) extra.push(`--smoke-probe=${path.resolve(opt('probe'))}`);
  if (opt('tool-script')) extra.push(`--smoke-tool-script=${path.resolve(opt('tool-script'))}`);
  // --menu-script <file.js>: runs inside the menu popup window (see main.js).
  if (opt('menu-script')) extra.push(`--smoke-menu-script=${path.resolve(opt('menu-script'))}`);
  // --quit close: end by closing the main window (checks that tool windows close with it).
  if (opt('quit')) extra.push(`--smoke-quit=${opt('quit')}`);
  await new Promise((resolve, reject) => {
    const child = spawn(electronPath, ['.', `--smoke-shot=${shot}`, `--smoke-delay=${opt('delay') || 3000}`, ...extra], { cwd: root, stdio: 'inherit', env });
    const timer = setTimeout(() => { child.kill(); reject(new Error('electron smoke timed out')); }, 60_000);
    child.on('exit', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`electron exited ${code}`)); });
    child.on('error', reject);
  });
  if (!fs.existsSync(shot)) throw new Error('screenshot not written');
  console.log(`[smoke] desktop OK → ${path.relative(root, shot)} (${fs.statSync(shot).size} bytes)`);
}

function post(port, name, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {});
    const req = http.request({ host: '127.0.0.1', port, path: `/api/${name}`, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.end(data);
  });
}

async function webSmoke(scenario = null) {
  const port = 5199;
  const child = spawn(process.execPath, [path.join(root, 'server', 'server.js'), '--port', String(port), '--no-open'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, CC_SMOKE: '1' } });
  try {
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('server did not start')), 10_000);
      child.stdout.on('data', (d) => { process.stdout.write(`[web] ${d}`); if (String(d).includes('http://')) { clearTimeout(t); resolve(); } });
      child.on('exit', (c) => reject(new Error(`server exited ${c}`)));
    });
    const info = await post(port, 'app.info');
    if (!info.ok || info.data.host !== 'web') throw new Error('app.info failed');
    const list = await post(port, 'fs.list', { path: root });
    if (!list.ok || !list.data.entries.some((e) => e.name === 'package.json')) throw new Error('fs.list failed');
    const html = await new Promise((resolve, reject) => http.get(`http://127.0.0.1:${port}/`, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve(b)); }).on('error', reject));
    if (!html.includes('<div id="root">')) throw new Error('index.html not served');
    // A job round trip: search this project for package.json
    const job = await post(port, 'search.start', { root: path.join(root, 'core'), pattern: '*.js' });
    let snap = job.data;
    for (let i = 0; i < 100 && snap.status === 'running'; i++) {
      await new Promise((r) => setTimeout(r, 50));
      snap = (await post(port, 'jobs.get', { id: snap.id })).data;
    }
    if (snap.status !== 'done' || !snap.result.found.length) throw new Error('search job failed');
    console.log(`[smoke] web OK → api + static + job (${snap.result.found.length} hits)`);
    // The UI itself in browser mode (fetch transport, polling): a window
    // without the preload script pointed at the server.
    await electronShot(scenario ? `web_${scenario}` : 'web', scenario ? SCENARIOS[scenario] : null, `http://127.0.0.1:${port}/`);
  } finally {
    child.kill();
  }
}

// Scenario scripts run inside the page (see window.__cc in src/App.jsx).
const SCENARIOS = {
  context: `(() => { const row = document.querySelectorAll('.file-panel')[0].querySelectorAll('tbody tr')[2]; row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 260, clientY: 240 })); })()`,
  compress: `(() => { const row = document.querySelectorAll('.file-panel')[0].querySelectorAll('tbody tr')[2]; row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); setTimeout(() => window.__cc.action('compress', 'left'), 150); })()`,
  search: `(() => { window.__cc.action('search', 'left'); setTimeout(() => { const inp = document.querySelector('.search-window input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, '*.jsx'); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.form.requestSubmit(); }, 300); })()`,
  about: `(() => { window.__cc.action('about'); })()`,   // not returned: the promise settles only when the dialog closes
  light_en: `(() => { window.__cc.action('toggleTheme'); window.__cc.action('toggleLanguage'); setTimeout(() => { const lbl = document.querySelectorAll('.side-label')[1]; lbl.click(); }, 200); })()`,
  themes: `document.querySelector('.tb-split-caret').click()`,
  menu_view: `document.querySelectorAll('.menu-title')[2].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))`,
  menu_file: `document.querySelectorAll('.menu-title')[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))`,
  menu_edit: `document.querySelectorAll('.menu-title')[1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))`,
  menu_archive: `(() => { const row = document.querySelectorAll('.file-panel')[0].querySelectorAll('tbody tr')[2]; row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); document.querySelectorAll('.menu-title')[3].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); })()`,
  drives: `document.querySelector('.drive-btn').click()`,
  settings: `(() => { window.__cc.action('settings'); })()`,
  settings_terminal: `(() => { window.__cc.action('settings'); setTimeout(() => document.querySelectorAll('.settings-tab')[1].click(), 300); })()`,
  theme_nord: `window.__cc.action('theme:nord')`,
  theme_sunset: `window.__cc.action('theme:sunset')`,
  error: `window.__cc.call('fs.mkdir', { dir: (window.__cc.session.left || '') + '/__no_such_dir__/x', name: 'y' }).then(() => 'unexpected: created', (e) => { window.__cc.dialogs.error(e); return 'error shown'; })`,
  // Bottom dock: a terminal running a command (the prompt shows the git state of the project folder), and the log tab.
  terminal: `(() => { const type = (cmd, enter) => { const inp = document.querySelector('.term-inline input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, cmd); inp.dispatchEvent(new Event('input', { bubbles: true })); if (enter) inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }; window.__cc.action('newTerminal').then(() => setTimeout(() => { type('git log --oneline -n 3', true); setTimeout(() => type('git status --short 한글', false), 1500); }, 1500)); })()`,
  log: `(() => { window.__cc.action('refresh'); window.__cc.action('newTerminal').then(() => setTimeout(() => { window.__cc.closeTerminal(window.__cc.terms[0].id); setTimeout(() => window.__cc.action('showLog'), 100); }, 800)); })()`,
  // Total Commander tools: the viewer on README.md, the multi-rename tool on three files, compare directories.
  viewer: `(() => { const rows = document.querySelectorAll('.file-panel')[0].querySelectorAll('tbody tr'); const row = Array.from(rows).find((r) => r.textContent.includes('README.md')); row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); setTimeout(() => window.__cc.action('view', 'left'), 150); })()`,
  multirename: `(() => { const rows = document.querySelectorAll('.file-panel')[1].querySelectorAll('tbody tr'); rows[3].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); rows[6].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, shiftKey: true })); setTimeout(() => window.__cc.action('multiRename', 'right'), 150); })()`,
  compare: `window.__cc.action('compareDirs')`,
  // Images: a click on a picture opens the preview window; Alt+Enter the file-info window (a JPEG shows its EXIF).
  preview: `(() => { const rows = document.querySelectorAll('.file-panel')[0].querySelectorAll('tbody tr'); const row = Array.from(rows).find((r) => /\.(png|jpg|heic|dcm|tiff?)$/i.test(r.querySelector('.c-name') ? r.querySelector('.c-name').textContent : r.textContent)); if (!row) return 'no image in the left panel (try --left <folder with pictures>)'; row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); return 'preview ' + row.textContent.slice(0, 30); })()`,
  fileinfo: `(() => { const rows = document.querySelectorAll('.file-panel')[0].querySelectorAll('tbody tr'); const row = Array.from(rows).find((r) => r.textContent.includes('package.json')) || rows[2]; row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); setTimeout(() => window.__cc.action('properties', 'left'), 150); })()`,
  menu_select: `document.querySelectorAll('.menu-title')[2].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))`,
  // Undo / redo: new folder → rename → undo ×2 → redo; every step drives the real action and answers its dialog.
  undo: `(async () => {
    const cc = () => window.__cc;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const answer = async (value) => { for (let i = 0; i < 40 && !cc().dialogs.stack.length; i++) await sleep(50); const d = cc().dialogs.stack[0]; cc().dialogs.resolve(d.id, value); };
    const settled = async () => { for (let i = 0; i < 100; i++) { await sleep(50); if (!cc().dialogs.stack.length) break; } await sleep(300); };
    const exists = (p) => cc().call('fs.exists', { path: p }).then((r) => r.exists);
    const sep = cc().session.left.includes('\\\\') ? '\\\\' : '/';
    const a = cc().session.left + sep + 'UndoTest 폴더', b = cc().session.left + sep + 'UndoTest 바뀐이름';
    const out = [];
    const p1 = cc().action('newFolder', 'left'); await answer('UndoTest 폴더'); await p1; await sleep(300);
    out.push(['create', await exists(a)]);
    const p2 = cc().action('rename', 'left'); await answer('UndoTest 바뀐이름'); await p2; await sleep(300);
    out.push(['rename', await exists(a), await exists(b)]);
    await cc().action('undo'); await settled(); out.push(['undo rename', await exists(a), await exists(b)]);
    await cc().action('undo'); await settled(); out.push(['undo create', await exists(a), await exists(b)]);
    await cc().action('redo'); await settled(); out.push(['redo create', await exists(a), await exists(b)]);
    out.push(['stacks', cc().history.undoStack.length, cc().history.redoStack.length]);
    out.push(['tips', document.querySelectorAll('.toolbar .tb-btn')[0].title, document.querySelectorAll('.toolbar .tb-btn')[1].title]);
    await cc().action('undo'); await settled(); out.push(['cleanup', await exists(a)]);
    return out;
  })()`,
  delete: `(() => { const rows = document.querySelectorAll('.file-panel')[1].querySelectorAll('tbody tr'); rows[4].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); rows[6].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, shiftKey: true })); setTimeout(() => window.__cc.action('delete', 'right'), 150); })()`,
};

(async () => {
  const scenario = opt('scenario');
  // --script <file.js>: an ad-hoc scenario from a file (same rules as SCENARIOS).
  if (opt('script')) { await electronShot(opt('name') || 'script', fs.readFileSync(opt('script'), 'utf-8')); console.log('[smoke] script done'); return; }
  if (scenario) {
    if (args.includes('--web')) await webSmoke(scenario);
    else if (scenario === 'all') { for (const [k, v] of Object.entries(SCENARIOS)) await electronShot(k, v); }
    else await electronShot(scenario, SCENARIOS[scenario]);
    console.log('[smoke] scenario done');
    return;
  }
  if (!args.includes('--web-only')) await electronShot();
  if (!args.includes('--desktop-only')) await webSmoke();
  console.log('[smoke] all good');
})().catch((err) => { console.error('[smoke] FAILED:', err.message); process.exit(1); });
