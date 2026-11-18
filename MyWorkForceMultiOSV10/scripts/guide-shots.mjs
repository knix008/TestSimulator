// npm run guide:shots — photographs the program's screens for the user's guide and the tutorial document.
//
// Starts the data service and the web build on free ports with a throw-away data folder, loads the shop example,
// and drives headless Edge (or Chrome) through each screen in Korean and in English. The pictures land in
// src/assets/guide/<id>.<ko|en>.jpg, where src/ui/figures.js picks them up (a missing one falls back to the
// drawn sketch). Run it again after a screen changes, then rebuild.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Forward slashes for Vite on Windows: with backslashes some modules load a second time, and a second copy of
// the language module keeps the first language.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..').replace(/\\/g, '/');
const outDir = path.join(root, 'src', 'assets', 'guide');
mkdirSync(outDir, { recursive: true });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const free = () => new Promise((resolve) => { const probe = net.createServer(); probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); }); });
const color = (code) => (text) => (process.env.NO_COLOR ? text : `\x1b[${code}m${text}\x1b[0m`);
const green = color('32');
const red = color('31');
const dim = color('2');

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const browser = BROWSERS.find((file) => existsSync(file));
if (!browser) { console.error(red('No Edge or Chrome found for the screenshots.')); process.exit(1); }

const dataPort = await free();
const webPort = await free();
const cdpPort = await free();
const dataDir = mkdtempSync(path.join(os.tmpdir(), 'mwf-shots-data-'));
const profile = mkdtempSync(path.join(os.tmpdir(), 'mwf-shots-browser-'));
const kids = [];
const stop = () => { for (const kid of kids) { try { kid.kill(); } catch { /* gone */ } } };
process.on('exit', stop);

// ── the data service with an administrator and the shop example
const server = spawn(process.execPath, ['server/index.mjs'], { cwd: root, env: { ...process.env, MYWORKFORCE_DATA_PORT: String(dataPort), MYWORKFORCE_DATA_HOST: '127.0.0.1', MYWORKFORCE_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
kids.push(server);
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('the data service did not start')), 20000);
  server.stdout.on('data', (chunk) => { if (String(chunk).includes('MYWORKFORCE_READY')) { clearTimeout(timer); resolve(); } });
});
const api = `http://127.0.0.1:${dataPort}`;
const call = async (pathname, method, body, token) => (await fetch(api + pathname, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })).json();
const first = await call('/api/session', 'POST', { account: 'admin', password: 'admin' });
await call('/api/account/password', 'POST', { current: 'admin', next: 'Guide-Shots-1' }, first.token);
const { token } = await call('/api/session', 'POST', { account: 'admin', password: 'Guide-Shots-1' });

async function loadExample(lang) {
  const { exampleWorkspace } = await import(pathToFileURL(path.join(root, 'src/domain/examples.js')).href);
  const { upgradeWorkspace } = await import(pathToFileURL(path.join(root, 'src/domain/store.js')).href);
  const current = (await call('/api/workspace', 'GET', null, token)).workspace;
  const example = upgradeWorkspace(exampleWorkspace('shop', Date.now(), lang));
  // The signed-in administrator stays who they are (the server keeps the password by id).
  const me = current.users.find((user) => user.login === 'admin');
  const twin = example.users.find((user) => user.login === 'admin') || example.users.find((user) => user.admin);
  let next = example;
  if (twin && twin.id !== me.id) next = JSON.parse(JSON.stringify(example).split(JSON.stringify(twin.id)).join(JSON.stringify(me.id)));
  const mine = next.users.find((user) => user.id === me.id);
  if (mine) Object.assign(mine, { login: 'admin', admin: true, active: true });
  else next.users.unshift({ ...me, admin: true });
  next.currentUserId = me.id;
  const saved = await call('/api/workspace', 'PUT', { workspace: next, revision: current.revision }, token);
  if (!saved.saved) throw new Error(`the example was not saved: ${JSON.stringify(saved)}`);
}

// ── the web build
const { createServer } = await import(pathToFileURL(path.join(root, 'node_modules/vite/dist/node/index.js')).href);
const vite = await createServer({ root, configFile: false, logLevel: 'error', define: { __APP_VERSION__: '"1.0.0"', __APP_NAME__: '"MyWorkForce"', __BUILD_DATE__: '""', __BUILD_COMMIT__: '""' }, server: { port: webPort, strictPort: true, host: '127.0.0.1', watch: null } });
await vite.listen();

// ── the browser
const edge = spawn(browser, ['--headless=new', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, '--window-size=1280,800', '--no-first-run', '--disable-extensions', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
kids.push(edge);
let targets = [];
for (let i = 0; i < 80 && !targets.length; i += 1) { try { targets = (await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json()).filter((t) => t.type === 'page'); } catch { /* starting */ } await wait(250); }
const socket = new WebSocket(targets[0].webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener('open', resolve));
let seq = 0;
const pending = new Map();
socket.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } });
const cdp = (method, params = {}) => new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params })); });
const run = async (expression) => {
  const result = await cdp('Runtime.evaluate', { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true });
  if (result.result?.exceptionDetails) throw new Error(result.result.exceptionDetails.exception?.description || result.result.exceptionDetails.text);
  return result.result?.result?.value;
};
await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

const click = (selector) => `const el = document.querySelector(${JSON.stringify(selector)}); if (el) el.click(); await new Promise((r) => setTimeout(r, 700)); return Boolean(el);`;
const go = (view) => `const el = document.querySelector('[data-action="go"][data-view="${view}"]'); if (!el) return false; el.click(); await new Promise((r) => setTimeout(r, 900)); return true;`;
const closeAll = `for (let i = 0; i < 3; i += 1) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.body.click(); await new Promise((r) => setTimeout(r, 300)); return true;`;

/** Each picture: how to get there from the open workspace (the board of the shop example). */
const SHOTS = [
  { id: 'start', steps: [click('[data-action="menubar-home"]')], back: true },
  { id: 'shell', steps: [go('board')] },
  { id: 'home', steps: [go('home')] },
  { id: 'board', steps: [go('board'), click('#view [data-card]')] },
  { id: 'backlog', steps: [go('backlog')] },
  { id: 'roadmap', steps: [go('roadmap')] },
  { id: 'issues', steps: [go('issues')] },
  { id: 'wql', steps: [go('issues'), `const box = document.querySelector('#quick-search'); if (!box) return false; box.value = 'status != Done ORDER BY priority DESC'; box.dispatchEvent(new Event('input', { bubbles: true })); box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await new Promise((r) => setTimeout(r, 900)); return true;`] },
  { id: 'reports', steps: [go('reports')] },
  // Pages: the workspace that has pages (the last in the left tree, the example's own), then its first page.
  {
    id: 'knowledge',
    steps: [`const spaces = [...document.querySelectorAll('#left [data-action="open-workspace"]')]; const space = spaces[spaces.length - 1]; if (!space) return false; space.click(); await new Promise((r) => setTimeout(r, 900));
      const toggle = [...document.querySelectorAll('#left [data-action="toggle-workspace"]')].pop(); if (toggle && !document.querySelector('#left [data-action="open-article"]')) { toggle.click(); await new Promise((r) => setTimeout(r, 700)); }
      const page = document.querySelector('#left [data-action="open-article"]'); if (page) { page.click(); await new Promise((r) => setTimeout(r, 1200)); } document.activeElement?.blur?.(); return Boolean(page);`],
  },
  { id: 'documents', steps: [go('documents'), click('[data-action="doc-tab"][data-id="forms"]')] },
  { id: 'calendar', steps: [go('calendar')] },
  { id: 'files', steps: [click('[data-menu="file"]')], after: closeAll },
  { id: 'shortcuts', steps: [click('[data-action="shortcuts"]')], after: closeAll },
  // The tutorial's first step: from the start page, Start the tutorial, confirm, and the coach box shows.
  {
    id: 'tutorial',
    steps: [click('[data-action="menubar-home"]'), click('[data-action="start-tutorial"]'), click('#modal [data-action="confirm-yes"]'), 'await new Promise((r) => setTimeout(r, 1200)); return !document.querySelector("#coach").hidden;'],
    after: 'const close = document.querySelector(\'[data-action="tutorial-close"]\'); if (close) close.click(); await new Promise((r) => setTimeout(r, 400)); return true;',
    reload: true,
  },
  { id: 'settings', page: 'tool=settings' },
];

let initScript = '';
async function openApp(lang, query = '') {
  // One start-up script at a time (an older one would set the other language again).
  if (initScript) await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: initScript });
  initScript = (await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('myworkforce-data-url', '${api}'); localStorage.setItem('myworkforce-session', '${token}'); const s = JSON.parse(localStorage.getItem('myworkforce-settings') || '{}'); Object.assign(s, { language: '${lang}', showWelcome: false, showStartPage: false, theme: 'light' }); localStorage.setItem('myworkforce-settings', JSON.stringify(s)); localStorage.setItem('myworkforce-language', '${lang}'); } catch {}` })).result?.identifier || '';
  await cdp('Page.navigate', { url: `http://127.0.0.1:${webPort}/${query ? `?${query}&lang=${lang}` : ''}` });
  await wait(4500);
  if (!query) await run(`const enter = document.querySelector('[data-action="connect-local"]'); if (enter) { enter.click(); await new Promise((r) => setTimeout(r, 1500)); } const c = document.querySelector('#modal [data-action="modal-cancel"]'); if (c) c.click(); await new Promise((r) => setTimeout(r, 400)); return true;`);
  // The language as a person switches it: the program's own language button, until the File menu reads right.
  const want = lang === 'en' ? 'File' : '파일';
  for (let i = 0; i < 2; i += 1) {
    const label = await run(`return document.querySelector('[data-menu="file"]')?.innerText.trim() || document.querySelector('#view h1')?.innerText || '';`);
    if (label.includes(want) || query) break;
    await run(`const b = document.querySelector('[data-action="language"]'); if (b) b.click(); await new Promise((r) => setTimeout(r, 900)); return true;`);
  }
  const after = await run(`return document.querySelector('[data-menu="file"]')?.innerText.trim() || document.querySelector('#view h1')?.innerText || '';`);
  console.log(dim(`  [${lang}] ${query || 'main'}: ${after}`));
}

async function shoot(id, lang) {
  const shot = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 78 });
  const file = path.join(outDir, `${id}.${lang}.jpg`);
  writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
  return file;
}

let made = 0;
let missed = 0;
try {
  for (const lang of ['ko', 'en']) {
    await loadExample(lang);
    await openApp(lang);
    for (const item of SHOTS) {
      let ok = true;
      try {
        if (item.page) { await openApp(lang, item.page); await wait(1500); }
        else {
          for (const step of item.steps) ok = (await run(step)) !== false && ok;
        }
        await wait(500);
        await shoot(item.id, lang);
        made += 1;
        console.log(`  ${ok ? green('✔ SHOT') : red('✖ PART')}  ${lang}  ${item.id}`);
        if (item.after) await run(item.after);
        if (item.back) await run(`const home = document.querySelector('[data-action="menubar-home"]'); if (home && !document.querySelector('#app').classList.contains('on-start')) {} else if (home) home.click(); await new Promise((r) => setTimeout(r, 800)); return true;`);
        // The tutorial replaced the workspace with its own copy of the example: load ours again.
        if (item.reload) { await loadExample(lang); await openApp(lang); }
        if (item.page) await openApp(lang);
      } catch (error) {
        missed += 1;
        console.log(`  ${red('✖ FAIL')}  ${lang}  ${item.id}  ${dim(error.message.split('\n')[0])}`);
      }
    }
  }
} finally {
  await vite.close();
  stop();
  setTimeout(() => { for (const dir of [dataDir, profile]) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* still held */ } } }, 500);
}
console.log(`\n  ${made} pictures in ${path.relative(root, outDir)}${missed ? red(`, ${missed} failed`) : ''}`);
process.exit(missed ? 1 : 0);
