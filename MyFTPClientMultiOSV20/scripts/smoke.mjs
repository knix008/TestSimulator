// Smoke test: starts the test FTP server (test/ftp-server.mjs) on a temp
// folder, launches the packaged-style app (dist/ must exist) with a private
// profile, drives it through window.__mfc (connect, list, download, upload,
// conflict, error dialog…), screenshots into .smoke/<scenario>.png and quits;
// then does the same against the web server (fetch transport, polling).
//
//   npm run build && npm run smoke                 # desktop + web, default scenarios
//   npm run smoke -- --scenario transfer           # one scenario (desktop)
//   npm run smoke -- --scenario transfer --web     # the same in the web version
//   npm run smoke -- --scenario all                # every scenario (desktop)
//   npm run smoke -- --desktop-only | --web-only
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { startFtpServer } from '../test/ftp-server.mjs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const smokeDir = path.join(root, '.smoke');
const profile = path.join(smokeDir, 'profile');
const localDir = path.join(smokeDir, 'local');
const serverRoot = path.join(smokeDir, 'server');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };

if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('[smoke] dist/ missing — run `npm run build` first.');
  process.exit(1);
}

// ── Fixtures ──
function seed() {
  fs.rmSync(localDir, { recursive: true, force: true });
  fs.rmSync(serverRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(localDir, 'photos'), { recursive: true });
  fs.mkdirSync(path.join(localDir, 'docs', 'notes'), { recursive: true });
  fs.writeFileSync(path.join(localDir, 'readme.txt'), 'local readme');
  fs.writeFileSync(path.join(localDir, 'photos', 'cat.jpg'), Buffer.alloc(50_000, 1));
  fs.writeFileSync(path.join(localDir, 'docs', 'plan.md'), '# plan');
  fs.writeFileSync(path.join(localDir, 'docs', 'notes', 'a.txt'), 'a');
  fs.writeFileSync(path.join(localDir, 'archive.zip'), Buffer.alloc(120_000, 2));
  fs.mkdirSync(path.join(serverRoot, 'pub', 'images'), { recursive: true });
  fs.mkdirSync(path.join(serverRoot, 'home'), { recursive: true });
  fs.writeFileSync(path.join(serverRoot, 'pub', 'welcome.txt'), 'welcome to the test server');
  fs.writeFileSync(path.join(serverRoot, 'pub', 'images', 'logo.png'), Buffer.alloc(80_000, 3));
  fs.writeFileSync(path.join(serverRoot, 'pub', 'data.json'), '{"ok":true}');
  fs.writeFileSync(path.join(serverRoot, 'pub', 'video.mp4'), Buffer.alloc(2_000_000, 4));
  fs.writeFileSync(path.join(serverRoot, 'readme.txt'), 'server readme');   // same name as a local file → conflict
  fs.mkdirSync(profile, { recursive: true });
}

function seedProfile(ftp) {
  fs.writeFileSync(path.join(profile, 'session.json'), JSON.stringify({ lastLocalPath: localDir, language: opt('lang') || 'ko', theme: opt('theme') || 'midnight', lastProfile: 'Test FTP', showConnectedDialog: false }, null, 2));
  fs.writeFileSync(path.join(profile, 'profiles.json'), JSON.stringify([
    { name: 'Test FTP', protocol: 'FTP', host: '127.0.0.1', port: String(ftp.port), user: ftp.user, password: 'b64:' + Buffer.from(ftp.password).toString('base64') },
    { name: 'Example SFTP', protocol: 'SFTP', host: 'sftp.example.com', port: '22', user: 'demo', password: '' },
  ], null, 2));
}

// ── Page scripts (run inside the renderer; `window.__mfc` is the hook) ──
const CONNECT = `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timeout: ' + fn.toString()); await wait(50); } };
  await until(() => window.__mfc && window.__mfc.state.profiles.length > 0);
  await window.__mfc.connect();
  await until(() => window.__mfc.state.conn && window.__mfc.state.server.entries.length > 0);
`;

const SCENARIOS = {
  main: `(async () => { const wait = (ms) => new Promise((r) => setTimeout(r, ms)); await wait(300); return 'booted'; })()`,
  connected: `(async () => { ${CONNECT} await window.__mfc.loadServer('/pub'); await wait(300); return JSON.stringify({ conn: window.__mfc.state.conn.protocol, entries: window.__mfc.state.server.entries.map((e) => e.name) }); })()`,
  transfer: `(async () => { ${CONNECT}
    await window.__mfc.loadServer('/pub'); await wait(200);
    const s = window.__mfc.state.server.entries;
    await window.__mfc.download([s.find((e) => e.name === 'images'), s.find((e) => e.name === 'video.mp4')]);
    await window.__mfc.upload([{ path: window.__mfc.state.localDir + '${path.sep === '\\' ? '\\\\' : '/'}docs', isDir: true, name: 'docs' }]);
    await wait(400);
    return JSON.stringify({ log: window.__mfc.state.log.slice(-9).map((l) => l.text), status: window.__mfc.state.status });
  })()`,
  conflict: `(async () => { ${CONNECT}
    const s = window.__mfc.state.server.entries;
    window.__mfc.download([s.find((e) => e.name === 'readme.txt')]);
    await until(() => document.querySelector('.dlg'));
    return 'conflict dialog shown';
  })()`,
  error: `(async () => { const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timeout'); await wait(50); } };
    await until(() => window.__mfc && window.__mfc.state.profiles.length > 0);
    window.__mfc.setForm({ protocol: 'FTP', host: '127.0.0.1', port: '1', user: 'x', password: 'y' });
    await wait(100);
    window.__mfc.connect();
    await until(() => document.querySelector('.dlg.error'));
    return 'error dialog shown';
  })()`,
  context: `(async () => { ${CONNECT} await wait(200); const row = document.querySelector('.remote-panel tbody tr:nth-child(2)'); row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 200, clientY: 260 })); return 'context'; })()`,
  local_context: `(async () => { const wait = (ms) => new Promise((r) => setTimeout(r, ms)); await wait(600); const row = document.querySelector('.local-panel .tree-row.selected') || document.querySelector('.local-panel .tree-row'); row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 700, clientY: 300 })); return 'local context'; })()`,
  profile_delete: `(async () => { await new Promise((r) => setTimeout(r, 300)); document.querySelectorAll('.tb-profile .tb-btn')[1].click(); await new Promise((r) => setTimeout(r, 200)); document.querySelector('.listbox-item').click(); return 'profile delete'; })()`,
  history: `(async () => { ${CONNECT} await window.__mfc.disconnect(); await wait(200); document.querySelector('.btn-history').click(); await wait(200); return JSON.stringify(window.__mfc.state.history.map((h) => h.host + ':' + h.port)); })()`,
  drives: `(async () => { const wait = (ms) => new Promise((r) => setTimeout(r, ms)); await wait(600); document.querySelector('.drive-btn').click(); await wait(200); return Array.from(document.querySelectorAll('.ctx-item .ctx-label')).map((e) => e.textContent).join(' | '); })()`,
  about: `(window.__mfc.action('about'), 'about')`,
  settings: `(window.__mfc.action('settings'), 'settings')`,   // not awaited: the dialog stays open for the screenshot
  themes: `document.querySelector('.tb-split-caret').click()`,
  light_en: `(async () => { window.__mfc.action('theme:daylight'); window.__mfc.action('toggleLanguage'); ${CONNECT} return 'light/en'; })()`,
  theme_nord: `(async () => { window.__mfc.action('theme:nord'); ${CONNECT} return 'nord'; })()`,
};

async function electronShot(name = 'main', script = null, url = null) {
  const electronPath = require('electron');
  const env = { ...process.env, MFC_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const shot = path.join(smokeDir, `${name}.png`);
  const extra = [];
  if (url) extra.push(`--smoke-url=${url}`);
  if (script) {
    const file = path.join(smokeDir, `${name}.script.js`);
    fs.writeFileSync(file, script);
    extra.push(`--smoke-script=${file}`, `--smoke-settle=${opt('settle') || 600}`);
  }
  if (opt('probe')) extra.push(`--smoke-probe=${path.resolve(opt('probe'))}`);
  let output = '';
  await new Promise((resolve, reject) => {
    const child = spawn(electronPath, ['.', `--smoke-shot=${shot}`, `--smoke-delay=${opt('delay') || 1500}`, ...extra], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'], env });
    child.stdout.on('data', (d) => { output += d; process.stdout.write(d); });
    const timer = setTimeout(() => { child.kill(); reject(new Error('electron smoke timed out')); }, 90_000);
    child.on('exit', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`electron exited ${code}`)); });
    child.on('error', reject);
  });
  if (!fs.existsSync(shot)) throw new Error('screenshot not written');
  if (/\[smoke\] capture failed/.test(output)) throw new Error(`scenario ${name} failed`);
  console.log(`[smoke] ${url ? 'web-ui' : 'desktop'} OK → ${path.relative(root, shot)} (${fs.statSync(shot).size} bytes)`);
  return output;
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

async function webSmoke(ftp, scenario = null) {
  const port = 5199;
  const child = spawn(process.execPath, [path.join(root, 'server', 'server.js'), '--port', String(port), '--no-open', '--config', profile], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, MFC_SMOKE: '1' } });
  try {
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('server did not start')), 10_000);
      child.stdout.on('data', (d) => { process.stdout.write(`[web] ${d}`); if (String(d).includes('http://')) { clearTimeout(t); resolve(); } });
      child.on('exit', (c) => reject(new Error(`server exited ${c}`)));
    });
    const info = await post(port, 'app.info');
    if (!info.ok || info.data.host !== 'web') throw new Error('app.info failed');
    const list = await post(port, 'local.list', { path: root });
    if (!list.ok || !list.data.entries.some((e) => e.name === 'package.json')) throw new Error('local.list failed');
    const html = await new Promise((resolve, reject) => http.get(`http://127.0.0.1:${port}/`, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve(b)); }).on('error', reject));
    if (!html.includes('<div id="root">')) throw new Error('index.html not served');
    // A job round trip over HTTP: connect to the test FTP server and list.
    const job = await post(port, 'remote.connect', { protocol: 'FTP', host: '127.0.0.1', port: ftp.port, user: ftp.user, password: ftp.password });
    let snap = job.data;
    for (let i = 0; i < 200 && snap.status === 'running'; i++) {
      await new Promise((r) => setTimeout(r, 50));
      snap = (await post(port, 'jobs.get', { id: snap.id })).data;
    }
    if (snap.status !== 'done') throw new Error(`connect job failed: ${snap.error}`);
    const listing = await post(port, 'remote.list', { id: snap.result.id, path: '/pub' });
    if (!listing.ok || !listing.data.entries.some((e) => e.name === 'welcome.txt')) throw new Error('remote.list failed');
    await post(port, 'remote.disconnect', { id: snap.result.id });
    console.log(`[smoke] web OK → api + static + connect job (${listing.data.entries.length} entries in /pub)`);
    // The UI itself in browser mode: a window without the preload script pointed at the server.
    await electronShot(scenario ? `web_${scenario}` : 'web_connected', SCENARIOS[scenario || 'connected'], `http://127.0.0.1:${port}/`);
  } finally {
    child.kill();
  }
}

(async () => {
  seed();
  const ftp = await startFtpServer({ root: serverRoot });
  seedProfile(ftp);
  console.log(`[smoke] test FTP server on 127.0.0.1:${ftp.port} (root ${path.relative(root, serverRoot)})`);
  try {
    const scenario = opt('scenario');
    if (scenario) {
      if (args.includes('--web')) await webSmoke(ftp, scenario);
      else if (scenario === 'all') { for (const [k, v] of Object.entries(SCENARIOS)) { seed(); seedProfile(ftp); await electronShot(k, v); } }
      else await electronShot(scenario, SCENARIOS[scenario]);
      console.log('[smoke] scenario done');
      return;
    }
    if (!args.includes('--web-only')) {
      await electronShot('main', SCENARIOS.main);
      const out = await electronShot('transfer', SCENARIOS.transfer);
      // Files really moved?
      if (!fs.existsSync(path.join(localDir, 'video.mp4')) || fs.statSync(path.join(localDir, 'video.mp4')).size !== 2_000_000) throw new Error('download did not land in the local folder');
      if (!fs.existsSync(path.join(localDir, 'images', 'logo.png'))) throw new Error('folder download incomplete');
      if (!fs.existsSync(path.join(serverRoot, 'pub', 'docs', 'notes', 'a.txt'))) throw new Error('folder upload incomplete');
      if (!/업로드 완료|Upload finished/.test(out)) throw new Error('upload log line missing');
      console.log('[smoke] desktop transfer verified (download 2 items, upload folder tree)');
    }
    if (!args.includes('--desktop-only')) await webSmoke(ftp);
    console.log('[smoke] all good');
  } finally {
    await ftp.close();
  }
})().catch((err) => { console.error('[smoke] FAILED:', err.message); process.exit(1); });
