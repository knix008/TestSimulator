// The Tauri desktop host: the core's HTTP server as the shell starts it
// (token, CORS for the window's origin, app.shutdown, --parent-pid), the
// desktop-only helpers, the look shared between windows, the user guide, and
// no Electron left behind.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freePort } from '../scripts/free-port.mjs';
import { appearanceOf, setAppearance, getAppearance } from '../src/lib/appearance.js';
import { isTauri, hostName, terminalsStream, ensureHost } from '../src/lib/backend.js';
import { themeById } from '../src/themes.js';

const require = createRequire(import.meta.url);
const shell = require('../core/shell');
const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'myftp-desktop-'));
const TOKEN = 'test-token';
let port;
let server;
let output = '';

function startServer(extraArgs = [], env = {}) {
  const child = spawn(process.execPath, [path.join(root, 'server', 'server.js'), '--port', String(port), '--token', TOKEN, '--no-open', '--config', path.join(tmp, 'config'), ...extraArgs], {
    cwd: root,
    env: { ...process.env, MFC_HOST_NAME: 'tauri', MFC_NO_OPEN: '1', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  return child;
}

async function waitReady() {
  for (let i = 0; i < 200; i++) {
    try {
      const r = await post('app.info', {}, { authorization: `Bearer ${TOKEN}` });
      if (r.status === 200) return;
    } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`server did not start\n${output}`);
}

function post(name, body, headers = {}) {
  return fetch(`http://127.0.0.1:${port}/api/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
}

before(async () => {
  port = await freePort(5600);
  server = startServer();
  await waitReady();
});

after(() => {
  if (server && server.exitCode === null) server.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('server: the desktop host reports itself and its desktop capabilities', async () => {
  const r = await post('app.info', {}, { authorization: `Bearer ${TOKEN}` });
  const body = await r.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.host, 'tauri');
  assert.equal(body.data.capabilities.reveal, true);
  assert.equal(body.data.capabilities.open, true);
  assert.equal(body.data.capabilities.pickFolder, true);
  assert.equal(body.data.capabilities.detachedDialogs, true);
});

test('server: the token is required', async () => {
  const r = await post('app.info', {});
  assert.equal(r.status, 401);
});

test('server: CORS answers the Tauri page origin and loopback only', async () => {
  for (const origin of ['http://tauri.localhost', 'http://127.0.0.1:5187']) {
    const pre = await fetch(`http://127.0.0.1:${port}/api/app.info`, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST' } });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), origin);
    assert.match(pre.headers.get('access-control-allow-headers'), /authorization/);
    const r = await post('app.info', {}, { origin, authorization: `Bearer ${TOKEN}` });
    assert.equal(r.headers.get('access-control-allow-origin'), origin);
  }
  const evil = await post('app.info', {}, { origin: 'https://example.com', authorization: `Bearer ${TOKEN}` });
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
});

test('server: the web host has no desktop capabilities', async () => {
  const webPort = await freePort(port + 1);
  const child = spawn(process.execPath, [path.join(root, 'server', 'server.js'), '--port', String(webPort), '--no-open', '--config', path.join(tmp, 'web')], {
    cwd: root, env: { ...process.env, MFC_HOST_NAME: '', MFC_NO_OPEN: '1' }, stdio: 'ignore',
  });
  try {
    let body = null;
    for (let i = 0; i < 200 && !body; i++) {
      try { body = await (await fetch(`http://127.0.0.1:${webPort}/api/app.info`, { method: 'POST', body: '{}' })).json(); } catch { await new Promise((r) => setTimeout(r, 50)); }
    }
    assert.equal(body.data.host, 'web');
    assert.equal(body.data.capabilities.reveal, false);
    assert.equal(body.data.capabilities.open, false);
    assert.equal(body.data.capabilities.pickFolder, false);
    assert.equal(body.data.capabilities.detachedDialogs, false);
  } finally {
    child.kill();
  }
});

test('server: MFC_INLINE_DIALOGS keeps dialogs in the main window', async () => {
  const p = await freePort(port + 2);
  const child = spawn(process.execPath, [path.join(root, 'server', 'server.js'), '--port', String(p), '--no-open', '--config', path.join(tmp, 'inline')], {
    cwd: root, env: { ...process.env, MFC_HOST_NAME: 'tauri', MFC_INLINE_DIALOGS: '1', MFC_NO_OPEN: '1' }, stdio: 'ignore',
  });
  try {
    let body = null;
    for (let i = 0; i < 200 && !body; i++) {
      try { body = await (await fetch(`http://127.0.0.1:${p}/api/app.info`, { method: 'POST', body: '{}' })).json(); } catch { await new Promise((r) => setTimeout(r, 50)); }
    }
    assert.equal(body.data.capabilities.detachedDialogs, false);
    assert.equal(body.data.capabilities.reveal, true);
  } finally {
    child.kill();
  }
});

test('server: session.save stores the window bounds the shell sends', async () => {
  const bounds = { x: 10, y: 20, width: 1300, height: 800, maximized: false };
  const r = await post('session.save', { patch: { windowBounds: bounds } }, { authorization: `Bearer ${TOKEN}` });
  assert.equal((await r.json()).ok, true);
  const saved = JSON.parse(fs.readFileSync(path.join(tmp, 'config', 'session.json'), 'utf8'));
  assert.deepEqual(saved.windowBounds, bounds);
});

test('server: --parent-pid ends the core when the shell is gone', async () => {
  const parent = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 400)'], { stdio: 'ignore' });
  const p = await freePort(port + 3);
  const child = spawn(process.execPath, [path.join(root, 'server', 'server.js'), '--port', String(p), '--no-open', '--config', path.join(tmp, 'orphan'), '--parent-pid', String(parent.pid)], {
    cwd: root, env: { ...process.env, MFC_HOST_NAME: 'tauri', MFC_NO_OPEN: '1' }, stdio: 'ignore',
  });
  const code = await Promise.race([
    new Promise((resolve) => child.on('exit', (c) => resolve(c))),
    new Promise((resolve) => setTimeout(() => resolve('still running'), 10000)),
  ]);
  if (code === 'still running') child.kill();
  assert.equal(code, 0);
});

// Last: it stops the shared server.
test('server: app.shutdown answers, then the core exits', async () => {
  const exited = new Promise((resolve) => server.on('exit', (c) => resolve(c)));
  const r = await post('app.shutdown', {}, { authorization: `Bearer ${TOKEN}` });
  assert.equal((await r.json()).ok, true);
  const code = await Promise.race([exited, new Promise((resolve) => setTimeout(() => resolve('timeout'), 5000))]);
  assert.equal(code, 0);
});

test('shell: open / reveal commands per platform', () => {
  const winFile = shell.commandFor('reveal', 'C:\\a b\\c.txt', 'win32', false);
  assert.equal(winFile.command, 'explorer.exe');
  assert.deepEqual(winFile.args, ['/select,"C:\\a b\\c.txt"']);
  assert.equal(winFile.options.windowsVerbatimArguments, true);
  assert.deepEqual(shell.commandFor('reveal', 'C:\\dir', 'win32', true).args, ['"C:\\dir"']);
  assert.deepEqual(shell.commandFor('open', 'C:\\a.txt', 'win32').args, ['"C:\\a.txt"']);
  assert.deepEqual(shell.commandFor('reveal', '/u/a.txt', 'darwin', false), { command: 'open', args: ['-R', '/u/a.txt'], options: {} });
  assert.deepEqual(shell.commandFor('open', '/u/a.txt', 'darwin').args, ['/u/a.txt']);
  assert.deepEqual(shell.commandFor('reveal', '/u/a.txt', 'linux', false), { command: 'xdg-open', args: ['/u'], options: {} });
});

test('shell: a missing path is an ENOENT error, nothing is launched', async () => {
  const missing = path.join(tmp, 'nope.txt');
  await assert.rejects(shell.openPath(missing), (err) => err.code === 'ENOENT' && err.path === missing);
  await assert.rejects(shell.revealPath(missing), (err) => err.code === 'ENOENT');
});

test('appearance: theme tokens, language and size shared with the other windows', () => {
  const a = appearanceOf({ theme: 'nord', language: 'en', fontSize: 15 });
  assert.equal(a.theme, 'nord');
  assert.equal(a.language, 'en');
  assert.equal(a.fontSize, 15);
  assert.equal(a.bg, themeById('nord').tokens['--bg']);
  assert.equal(a.vars['--accent'], themeById('nord').tokens['--accent']);
  assert.equal(a.mode, themeById('nord').mode);
  setAppearance({ theme: 'daylight' });
  assert.equal(getAppearance().theme, 'daylight');
  assert.equal(getAppearance().language, 'ko');
  assert.equal(appearanceOf({ theme: 'missing' }).theme, themeById('missing').id);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(getAppearance())));
});

test('backend: outside Tauri it is the web transport', async () => {
  assert.equal(isTauri, false);
  assert.equal(hostName, 'web');
  assert.equal(terminalsStream, false);
  await ensureHost();
});

test('user guide: structure, language and size controls, every picture present', () => {
  const html = fs.readFileSync(path.join(root, 'doc', 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'doc', 'manual.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'doc', 'manual.css'), 'utf8');
  assert.match(html, /<nav id="side"/);
  assert.match(html, /<div id="content">/);
  assert.match(css, /grid-template-columns: 260px minmax\(0, 1fr\)/);
  // − / current px / + with the size centred, and both languages.
  assert.match(html, /id="size-down"[\s\S]*id="size-now"[\s\S]*id="size-up"/);
  assert.match(css, /\.size output \{[^}]*justify-content: center;[^}]*text-align: center;/);
  assert.match(html, /data-lang="ko"/);
  assert.match(html, /data-lang="en"/);
  // Scripts and styles in files: the window's CSP has no inline-script exception for hashes.
  assert.doesNotMatch(html, /<script>(?!<\/script>)/);
  assert.doesNotMatch(html, /<style>/);
  // Follows the app: Tauri event and the browser's storage event.
  assert.match(js, /dialog:appearance/);
  assert.match(js, /addEventListener\('storage'/);
  // Every section exists in both languages.
  const sections = html.match(/<section id="[^"]+">/g) || [];
  assert.ok(sections.length >= 10, `${sections.length} sections`);
  const pictures = [...new Set([...html.matchAll(/<img src="(img\/[^"]+)"/g)].map((m) => m[1]))];
  assert.ok(pictures.length >= 10, `${pictures.length} pictures`);
  for (const pic of pictures) assert.ok(fs.existsSync(path.join(root, 'doc', pic)), `doc/${pic} is missing (npm run smoke -- --docs)`);
  for (const file of fs.readdirSync(path.join(root, 'doc', 'img'))) assert.ok(pictures.includes(`img/${file}`), `doc/img/${file} is not used by the guide`);
});

test('user guide: opened as its own window, not owned by the main one', () => {
  const rs = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'dialogs.rs'), 'utf8');
  const manual = rs.slice(rs.indexOf('pub async fn manual_open'), rs.indexOf('pub fn on_destroyed'));
  assert.match(manual, /WebviewUrl::App\("doc\/index\.html"\.into\(\)\)/);
  assert.match(manual, /\.resizable\(true\)/);
  assert.doesNotMatch(manual, /\.parent\(/);
  const tb = fs.readFileSync(path.join(root, 'src', 'components', 'Toolbar.jsx'), 'utf8');
  assert.match(tb, /onAction\('manual'\)/);
  const vite = fs.readFileSync(path.join(root, 'vite.config.mjs'), 'utf8');
  assert.match(vite, /dist\/doc/);
});

test('no Electron left: files, dependencies, references', () => {
  for (const gone of ['electron', 'build', path.join('scripts', 'start-electron.mjs')]) {
    assert.equal(fs.existsSync(path.join(root, gone)), false, `${gone} still exists`);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const name of ['electron', 'electron-builder', 'concurrently', 'wait-on', 'cross-env']) assert.equal(deps[name], undefined, name);
  assert.equal(pkg.main, undefined);
  assert.equal(pkg.build, undefined);
  assert.ok(deps['@tauri-apps/cli'] && deps['@tauri-apps/api']);
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const sources = ['src', 'core', 'server'].flatMap((d) => walk(path.join(root, d))).filter((f) => /\.(js|jsx|mjs|css)$/.test(f));
  for (const file of sources) {
    const text = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /window\.myFtpClient|ipcRenderer|require\('electron'\)|-webkit-app-region/, path.relative(root, file));
  }
});
