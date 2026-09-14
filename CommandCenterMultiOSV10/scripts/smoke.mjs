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
fs.writeFileSync(path.join(profile, 'session.json'), JSON.stringify({ left, right, splitter: 0.5, language: opt('lang') || 'ko', theme: opt('theme') || 'dark' }, null, 2));

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
  search: `window.__cc.action('search', 'left')`,
  about: `window.__cc.action('about')`,
  light_en: `(() => { window.__cc.action('toggleTheme'); window.__cc.action('toggleLanguage'); setTimeout(() => { const lbl = document.querySelectorAll('.side-label')[1]; lbl.click(); }, 200); })()`,
  themes: `document.querySelector('.tb-split-caret').click()`,
  drives: `document.querySelector('.drive-btn').click()`,
  settings: `window.__cc.action('settings')`,
  theme_nord: `window.__cc.action('theme:nord')`,
  theme_sunset: `window.__cc.action('theme:sunset')`,
  error: `window.__cc.call('fs.mkdir', { dir: (window.__cc.session.left || '') + '/__no_such_dir__/x', name: 'y' }).then(() => 'unexpected: created', (e) => { window.__cc.dialogs.error(e); return 'error shown'; })`,
  delete: `(() => { const rows = document.querySelectorAll('.file-panel')[1].querySelectorAll('tbody tr'); rows[4].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); rows[6].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, shiftKey: true })); setTimeout(() => window.__cc.action('delete', 'right'), 150); })()`,
};

(async () => {
  const scenario = opt('scenario');
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
