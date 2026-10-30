// Smoke test of the real desktop app: builds the Tauri debug exe with the
// current frontend embedded (`tauri build --debug --no-bundle`), starts the
// test FTP server (test/ftp-server.mjs) on a temp folder, launches the exe
// with a private profile (MFC_CONFIG_DIR) and its WebView2 debugging port, and
// drives the window through window.__mfc over CDP: connect, list, download,
// upload, conflict, error dialog, Del / copy · cut · paste / drag & drop
// between the panels and files dropped from outside… Each scenario is screenshotted into
// .smoke/<scenario>.png. Then the dialog windows and the user guide window are
// checked as separate windows, and the web version (server + headless Edge).
//
//   npm run smoke                                   # build + desktop + windows + web
//   npm run smoke -- --no-build                     # reuse the last debug exe
//   npm run smoke -- --scenario transfer            # one scenario
//   npm run smoke -- --scenario all                 # every scenario
//   npm run smoke -- --docs                         # every scenario, copy the guide's pictures to doc/img/
//   npm run smoke -- --desktop-only | --web-only
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { startFtpServer } from '../test/ftp-server.mjs';
import { freePort } from './free-port.mjs';
import { waitForTarget, listTargets, connect } from './cdp.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const smokeDir = path.join(root, '.smoke');
const profile = path.join(smokeDir, 'profile');
const localDir = path.join(smokeDir, 'local');
const serverRoot = path.join(smokeDir, 'server');
const outsideFile = path.join(smokeDir, 'outside', 'drop.txt');   // "Explorer" files dropped on the window
const exeName = process.platform === 'win32' ? 'MyFTPClient.exe' : 'MyFTPClient';
// Its own cargo target folder: the exe of a running `npm start` (target/debug) is locked.
const targetDir = path.join(root, 'src-tauri', 'target', 'smoke');
const exe = path.join(targetDir, 'debug', exeName);

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const flag = (name) => args.includes(`--${name}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pictures of the user guide (doc/index.html): scenario → doc/img/<name>.png
const DOC_PICTURES = {
  connected: 'main', transfer: 'transfer', conflict: 'conflict', context: 'server-menu', local_context: 'local-menu',
  history: 'history', drives: 'drives', themes: 'themes', terminal: 'terminal', error: 'error', light_en: 'english',
};

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
  fs.rmSync(path.dirname(outsideFile), { recursive: true, force: true });
  fs.mkdirSync(path.dirname(outsideFile), { recursive: true });
  fs.writeFileSync(outsideFile, 'dropped from outside');
  fs.mkdirSync(profile, { recursive: true });
}

function seedProfile(ftp) {
  for (const f of ['session.json', 'profiles.json', 'history.json']) fs.rmSync(path.join(profile, f), { force: true });
  fs.writeFileSync(path.join(profile, 'session.json'), JSON.stringify({ lastLocalPath: localDir, language: opt('lang') || 'ko', theme: opt('theme') || 'midnight', lastProfile: 'Test FTP', showConnectedDialog: false }, null, 2));
  fs.writeFileSync(path.join(profile, 'profiles.json'), JSON.stringify([
    { name: 'Test FTP', protocol: 'FTP', host: '127.0.0.1', port: String(ftp.port), user: ftp.user, password: 'b64:' + Buffer.from(ftp.password).toString('base64') },
    { name: 'Example SFTP', protocol: 'SFTP', host: 'sftp.example.com', port: '22', user: 'demo', password: '' },
  ], null, 2));
}

// ── Page scripts (run inside the window; `window.__mfc` is the hook) ──
const HELPERS = `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timeout: ' + fn.toString()); await wait(50); } };
  await until(() => window.__mfc && window.__mfc.state.profiles.length > 0, 20000);
`;
const CONNECT = `
  await window.__mfc.connect();
  await until(() => window.__mfc.state.conn && window.__mfc.state.server.entries.length > 0);
`;
const SEP = path.sep === '\\' ? '\\\\' : '/';

// Rows, presses, keys and drags as the panels receive them (React handlers + the
// document listeners of lib/filedrag.js). The OS side of a drop is the page's
// own handler (window.__mfc.osDrop) fed what Tauri's drag-drop event carries.
const FILEOPS = `
  const untilA = async (fn, ms = 15000) => { const t0 = Date.now(); while (!(await fn())) { if (Date.now() - t0 > ms) throw new Error('timeout: ' + fn.toString()); await wait(80); } };
  const idle = () => !window.__mfc.state.progress;
  const row = (panel, name) => Array.from(document.querySelectorAll(panel === 'server' ? '.remote-panel tbody tr' : '.local-panel .tree-row'))
    .find((r) => { const n = r.querySelector('.c-name span, .tree-name'); return n && n.textContent === name; });
  const centre = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 }; };
  const press = async (el, mods = {}) => {
    const p = centre(el);
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: p.x, clientY: p.y, ...mods }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: p.x, clientY: p.y, ...mods }));
    await wait(80);
  };
  const key = (panel, k, code, mods = {}) => {
    const el = document.querySelector(panel === 'server' ? '.remote-panel .table-wrap' : '.local-panel .tree-wrap');
    el.focus();
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: k, code, ...mods }));
  };
  const ctrl = (panel, letter) => key(panel, letter, 'Key' + letter.toUpperCase(), { ctrlKey: true });
  const confirmYes = async () => { await until(() => document.querySelector('.dlg .btn.danger')); document.querySelector('.dlg .btn.danger').click(); };
  const exists = async (p) => (await window.__mfc.call('local.exists', { path: p })).exists;
  const onServer = async (dir, name) => (await window.__mfc.call('remote.list', { id: window.__mfc.state.conn.id, path: dir })).entries.some((e) => e.name === name);
  const L = window.__mfc.state.localDir;
  const J = (...a) => a.join('${SEP}');
  const dragTo = async (from, to, mods = {}) => {
    const a = centre(from), b = centre(to);
    from.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: a.x, clientY: a.y, ...mods }));
    for (let i = 1; i <= 8; i++) { document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: a.x + ((b.x - a.x) * i) / 8, clientY: a.y + ((b.y - a.y) * i) / 8, ...mods })); await wait(15); }
    const ghost = document.querySelector('.file-drag-ghost');
    const label = ghost ? ghost.querySelector('.fdg-effect').textContent : '(no ghost)';
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: b.x, clientY: b.y, ...mods }));
    if (document.querySelector('.file-drag-ghost')) throw new Error('the drag ghost stayed after the drop');
    await wait(100);
    return label;
  };
`;

const SCENARIOS = {
  main: `await wait(300); return 'booted';`,
  connected: `${CONNECT} await window.__mfc.loadServer('/pub'); await wait(300); return JSON.stringify({ conn: window.__mfc.state.conn.protocol, entries: window.__mfc.state.server.entries.map((e) => e.name) });`,
  transfer: `${CONNECT}
    await window.__mfc.loadServer('/pub'); await wait(200);
    const s = window.__mfc.state.server.entries;
    await window.__mfc.download([s.find((e) => e.name === 'images'), s.find((e) => e.name === 'video.mp4')]);
    await window.__mfc.upload([{ path: window.__mfc.state.localDir + '${SEP}docs', isDir: true, name: 'docs' }]);
    await wait(400);
    return JSON.stringify({ log: window.__mfc.state.log.slice(-9).map((l) => l.text), status: window.__mfc.state.status });`,
  conflict: `${CONNECT}
    const s = window.__mfc.state.server.entries;
    window.__mfc.download([s.find((e) => e.name === 'readme.txt')]);
    await until(() => document.querySelector('.dlg'));
    return 'conflict dialog shown';`,
  error: `window.__mfc.setForm({ protocol: 'FTP', host: '127.0.0.1', port: '1', user: 'x', password: 'y' });
    await wait(100);
    window.__mfc.connect();
    await until(() => document.querySelector('.dlg.error'));
    return 'error dialog shown';`,
  context: `${CONNECT} await wait(200); const row = document.querySelector('.remote-panel tbody tr:nth-child(2)'); row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 200, clientY: 260 })); return 'context';`,
  local_context: `await wait(600); const row = document.querySelector('.local-panel .tree-row.selected') || document.querySelector('.local-panel .tree-row'); row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 700, clientY: 300 })); return 'local context';`,
  profile_delete: `await wait(300); document.querySelectorAll('.tb-profile .tb-btn')[1].click(); await wait(200); document.querySelector('.listbox-item').click(); return 'profile delete';`,
  history: `${CONNECT} await window.__mfc.disconnect(); await wait(200); document.querySelector('.btn-history').click(); await wait(200); return JSON.stringify(window.__mfc.state.history.map((h) => h.host + ':' + h.port));`,
  drives: `await wait(600); document.querySelector('.drive-btn').click(); await wait(200); return Array.from(document.querySelectorAll('.ctx-item .ctx-label')).map((e) => e.textContent).join(' | ');`,
  terminal: `${CONNECT} window.__mfc.action('terminal'); await wait(300); await until(() => document.querySelector('.xterm-rows') && document.querySelector('.xterm-rows').textContent.trim().length > 0, 10000); await wait(800); return 'terminal';`,
  // A terminal tab opened in Korean is renamed when the UI switches to English; a tab opened then has an English banner.
  terminal_en: `${CONNECT} window.__mfc.action('terminal'); await wait(300);
    await until(() => document.querySelector('.xterm-rows') && document.querySelector('.xterm-rows').textContent.trim().length > 0, 10000);
    const label = () => Array.from(document.querySelectorAll('.dock-tab-label')).slice(1).map((e) => e.textContent).join(' | ');
    const before = label();
    window.__mfc.action('toggleLanguage'); await wait(400);
    const after = label();
    if (before === after) throw new Error('tab title did not follow the language: ' + after);
    if (/[가-힣]/.test(after)) throw new Error('Korean left in the English tab title: ' + after);
    return JSON.stringify({ before, after });`,
  // Del deletes several selected rows on either side (after the confirmation).
  file_delete: `${CONNECT} ${FILEOPS}
    await window.__mfc.loadServer('/pub'); await wait(300);
    await press(row('server', 'data.json')); await press(row('server', 'welcome.txt'), { ctrlKey: true }); await wait(100);
    if (window.__mfc.state.serverSel.length !== 2) throw new Error('server multi-select: ' + window.__mfc.state.serverSel.length);
    key('server', 'Delete', 'Delete'); await confirmYes();
    await untilA(async () => idle() && !(await onServer('/pub', 'data.json')) && !(await onServer('/pub', 'welcome.txt')));
    await press(row('local', 'readme.txt')); await press(row('local', 'archive.zip'), { ctrlKey: true }); await wait(100);
    if (window.__mfc.state.localSel.length !== 2) throw new Error('local multi-select: ' + window.__mfc.state.localSel.length);
    key('local', 'Delete', 'Delete'); await confirmYes();
    await untilA(async () => !(await exists(J(L, 'readme.txt'))) && !(await exists(J(L, 'archive.zip'))));
    return 'Del: 2 server + 2 local items';`,
  // Ctrl+C / X / V inside and across the panels; into the same folder makes "name (2)".
  file_clipboard: `${CONNECT} ${FILEOPS}
    await window.__mfc.loadServer('/pub'); await wait(300);
    await press(row('local', 'archive.zip')); ctrl('local', 'c'); await wait(200); ctrl('server', 'v');
    await untilA(async () => idle() && await onServer('/pub', 'archive.zip'));
    await press(row('server', 'data.json')); ctrl('server', 'x'); await wait(200);
    if (!row('server', 'data.json').classList.contains('cut')) throw new Error('cut row is not dimmed');
    ctrl('local', 'v');
    await untilA(async () => idle() && await exists(J(L, 'data.json')) && !(await onServer('/pub', 'data.json')));
    await press(row('local', 'readme.txt')); ctrl('local', 'c'); await wait(200); ctrl('local', 'v');
    await untilA(async () => idle() && await exists(J(L, 'readme (2).txt')));
    await press(row('server', 'welcome.txt')); ctrl('server', 'c'); await wait(200); ctrl('server', 'v');
    await untilA(async () => idle() && await onServer('/pub', 'welcome (2).txt'));
    return JSON.stringify(window.__mfc.state.log.slice(-4).map((l) => l.text));`,
  // Rows dragged between the panels and into folders: across = copy, same side = move, Ctrl = copy.
  file_drag: `${CONNECT} ${FILEOPS}
    await window.__mfc.loadServer('/pub'); await wait(300);
    const labels = [];
    labels.push(await dragTo(row('server', 'data.json'), row('local', 'photos')));
    await untilA(async () => idle() && await exists(J(L, 'photos', 'data.json')));
    labels.push(await dragTo(row('local', 'readme.txt'), row('server', 'images')));
    await untilA(async () => idle() && await onServer('/pub/images', 'readme.txt'));
    labels.push(await dragTo(row('server', 'welcome.txt'), row('server', 'images')));
    await untilA(async () => idle() && await onServer('/pub/images', 'welcome.txt') && !(await onServer('/pub', 'welcome.txt')));
    labels.push(await dragTo(row('server', 'data.json'), row('server', 'images'), { ctrlKey: true }));
    await untilA(async () => idle() && await onServer('/pub/images', 'data.json') && await onServer('/pub', 'data.json'));
    labels.push(await dragTo(row('local', 'archive.zip'), row('local', 'docs')));
    await untilA(async () => idle() && await exists(J(L, 'docs', 'archive.zip')) && !(await exists(J(L, 'archive.zip'))));
    labels.push(await dragTo(row('local', 'photos'), row('local', 'readme.txt')));
    const want = [/^(복사|Copy) → photos$/, /^(복사|Copy) → images$/, /^(이동|Move) → images$/, /^(복사|Copy) → images$/, /^(이동|Move) → docs$/, /^$/];
    labels.forEach((l, i) => { if (!want[i].test(l)) throw new Error('drag ' + i + ' label: ' + l); });
    return JSON.stringify(labels);`,
  // Files from outside the app (what Tauri's drag-drop event delivers) onto the server and into a local folder.
  file_osdrop: `${CONNECT} ${FILEOPS}
    await window.__mfc.loadServer('/pub'); await wait(300);
    const ext = ${JSON.stringify(outsideFile)};
    const wrapBox = document.querySelector('.remote-panel .table-wrap').getBoundingClientRect();
    const sp = { x: wrapBox.left + wrapBox.width / 2, y: wrapBox.bottom - 12 };
    await window.__mfc.osDrop({ type: 'enter', ...sp, paths: [ext] });
    await window.__mfc.osDrop({ type: 'over', ...sp, paths: [] });
    await wait(50);
    if (!document.querySelector('.remote-panel.drop-over')) throw new Error('server panel not highlighted under an OS drag');
    await window.__mfc.osDrop({ type: 'drop', ...sp, paths: [ext] });
    await untilA(async () => idle() && await onServer('/pub', 'drop.txt'));
    const lp = centre(row('local', 'docs'));
    await window.__mfc.osDrop({ type: 'enter', ...lp, paths: [ext] });
    await window.__mfc.osDrop({ type: 'over', ...lp, paths: [] });
    await wait(50);
    if (!row('local', 'docs').classList.contains('drop-target')) throw new Error('local folder not highlighted under an OS drag');
    await window.__mfc.osDrop({ type: 'drop', ...lp, paths: [ext] });
    await untilA(async () => idle() && await exists(J(L, 'docs', 'drop.txt')));
    if (!(await exists(ext))) throw new Error('a plain drop from outside must copy, not move');
    return 'OS drop: server + local folder';`,
  about: `window.__mfc.action('about'); await until(() => document.querySelector('.dlg')); return 'about';`,
  settings: `window.__mfc.action('settings'); await until(() => document.querySelector('.settings-dlg')); return 'settings';`,
  themes: `await wait(300); document.querySelector('.tb-split-caret').click(); await wait(200); return 'themes';`,
  light_en: `window.__mfc.action('theme:daylight'); window.__mfc.action('toggleLanguage'); ${CONNECT} await window.__mfc.loadServer('/pub'); return 'light/en';`,
  theme_nord: `window.__mfc.action('theme:nord'); ${CONNECT} return 'nord';`,
};
const wrap = (body) => `(async () => { ${HELPERS} ${body} })()`;

// ── Desktop (the Tauri exe) ──
function buildDesktop(force = false) {
  if (!force && flag('no-build') && fs.existsSync(exe)) return;
  console.log('[smoke] building the debug exe with the current frontend (tauri build --debug --no-bundle)…');
  const cli = path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
  const r = spawnSync(process.execPath, [cli, 'build', '--debug', '--no-bundle'], { cwd: root, stdio: 'inherit', env: { ...process.env, CARGO_TARGET_DIR: targetDir } });
  if (r.status) throw new Error('tauri build failed');
}

async function launchDesktop({ inlineDialogs = true } = {}) {
  const port = await freePort(9330);
  const env = {
    ...process.env,
    MFC_CONFIG_DIR: profile,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  };
  if (inlineDialogs) env.MFC_INLINE_DIALOGS = '1'; else delete env.MFC_INLINE_DIALOGS;
  const child = spawn(exe, [], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  const exited = new Promise((resolve) => child.on('exit', resolve));
  const target = await waitForTarget(port, (t) => /index\.html|tauri\.localhost\/?$/.test(t.url) && !/doc\//.test(t.url));
  const page = await connect(target);
  await page.until('window.__mfc && window.__mfc.state', 30000);
  const stop = async () => {
    page.close();
    child.kill();
    await Promise.race([exited, sleep(5000)]);
  };
  return { port, page, child, stop, output: () => output };
}

async function desktopShot(name, body) {
  const app = await launchDesktop();
  try {
    const result = await app.page.evaluate(wrap(body), 90000);
    await sleep(Number(opt('settle') || 600));
    const shot = path.join(smokeDir, `${name}.png`);
    fs.writeFileSync(shot, await app.page.screenshot());
    console.log(`[smoke] desktop ${name} OK → ${path.relative(root, shot)}${result ? `  ${String(result).slice(0, 160)}` : ''}`);
    return String(result || '');
  } finally {
    await app.stop();
  }
}

// Dialogs and the user guide open as their own windows: new page targets.
async function desktopWindows({ checkImages = true } = {}) {
  const app = await launchDesktop({ inlineDialogs: false });
  try {
    const { port, page } = app;
    await page.evaluate(wrap(`return 1;`));
    // Settings: its own window; the theme picked there previews in the main window.
    page.evaluate("window.__mfc.action('settings'), 1");
    const dlg = await (async () => {
      const t0 = Date.now();
      while (Date.now() - t0 < 20000) {
        for (const t of await listTargets(port)) {
          if (/doc\//.test(t.url)) continue;
          const p = await connect(t);
          const name = await p.evaluate('window.__MFC_DIALOG__ || ""').catch(() => '');
          if (name === 'settings') return p;
          p.close();
        }
        await sleep(200);
      }
      throw new Error('the settings window did not open');
    })();
    await dlg.until("document.querySelector('.settings-dlg')", 15000);
    await dlg.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const size = await dlg.evaluate('JSON.stringify([window.innerWidth, window.innerHeight])');
    const fill = JSON.parse(await dlg.evaluate("JSON.stringify((({ width, height }) => ({ width, height }))(document.querySelector('.settings-dlg').getBoundingClientRect()))"));
    const [innerW, innerH] = JSON.parse(size);
    if (Math.abs(fill.width - innerW) > 2 || Math.abs(fill.height - innerH) > 2) throw new Error(`settings does not fill its window: ${fill.width}×${fill.height} in ${innerW}×${innerH}`);
    fs.writeFileSync(path.join(smokeDir, 'window-settings.png'), await dlg.screenshot());
    if (flag('docs')) fs.copyFileSync(path.join(smokeDir, 'window-settings.png'), path.join(root, 'doc', 'img', 'settings-window.png'));
    console.log(`[smoke] settings window OK (${size})`);
    // Cancel closes the window and resolves the main window's request with null.
    await dlg.evaluate("(document.querySelector('.settings-dlg .dlg-footer .btn:not(.primary)') || document.querySelector('.dlg-footer .btn')).click(), 1").catch(() => {});
    dlg.close();
    const t0 = Date.now();
    while (Date.now() - t0 < 10000) {
      const left = [];
      for (const t of await listTargets(port)) {
        const p = await connect(t);
        left.push(await p.evaluate('window.__MFC_DIALOG__ || ""').catch(() => ''));
        p.close();
      }
      if (!left.includes('settings')) break;
      await sleep(200);
    }

    // The user guide: a separate window with the app's theme, language and size controls.
    await page.evaluate("window.__mfc.action('theme:nord'), window.__mfc.action('manual'), 1");
    const guideTarget = await waitForTarget(port, (t) => /doc\/index\.html/.test(t.url), 20000);
    const guide = await connect(guideTarget);
    await guide.until("document.querySelector('#side a') && document.body.classList.contains('ready')", 15000);
    const facts = JSON.parse(await guide.evaluate(`JSON.stringify({
      bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
      lang: document.documentElement.lang,
      size: document.getElementById('size-now').textContent,
      centred: getComputedStyle(document.getElementById('size-now')).textAlign,
      sections: document.querySelectorAll('#side > ol > li').length,
      images: Array.from(document.images).filter((i) => i.complete && i.naturalWidth > 0).length,
      broken: Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')),
    })`));
    const nordBg = '#2e3440';
    if (facts.bg.toLowerCase() !== nordBg) throw new Error(`guide theme ${facts.bg} is not the main window's (${nordBg})`);
    if (checkImages && facts.broken.length) throw new Error(`guide has broken images: ${facts.broken.join(', ')}`);
    if (facts.centred !== 'center') throw new Error('the size label is not centred');
    // Language follows the main window.
    await page.evaluate("window.__mfc.action('toggleLanguage'), 1");
    await guide.until("document.documentElement.lang === 'en'", 5000);
    // The structure on the left is in the language on screen only.
    if (await guide.evaluate("/[가-힣]/.test(document.getElementById('side').textContent)")) throw new Error('the guide structure mixes Korean into the English view');
    await guide.evaluate("document.getElementById('size-up').click(), 1");
    fs.writeFileSync(path.join(smokeDir, 'window-guide.png'), await guide.screenshot());
    guide.close();
    console.log(`[smoke] user guide window OK (${facts.sections} sections, ${facts.images} images, ${facts.size}, theme follows, language follows)`);
  } finally {
    await app.stop();
  }
}

// ── Web (server + headless Edge) ──
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

function findEdge() {
  const candidates = process.platform === 'win32'
    ? [path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe')]
    : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/microsoft-edge', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

async function webSmoke(ftp) {
  const port = await freePort(5199);
  const child = spawn(process.execPath, [path.join(root, 'server', 'server.js'), '--port', String(port), '--no-open', '--config', profile], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, MFC_SMOKE: '1', MFC_HOST_NAME: 'web' } });
  let browser = null;
  try {
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('server did not start')), 10_000);
      child.stdout.on('data', (d) => { if (String(d).includes('http://')) { clearTimeout(t); resolve(); } });
      child.on('exit', (c) => reject(new Error(`server exited ${c}`)));
    });
    const info = await post(port, 'app.info');
    if (!info.ok || info.data.host !== 'web') throw new Error('app.info failed');
    const list = await post(port, 'local.list', { path: root });
    if (!list.ok || !list.data.entries.some((e) => e.name === 'package.json')) throw new Error('local.list failed');
    const html = await new Promise((resolve, reject) => http.get(`http://127.0.0.1:${port}/`, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve(b)); }).on('error', reject));
    if (!html.includes('<div id="root">')) throw new Error('index.html not served (run the build first)');
    const guide = await new Promise((resolve, reject) => http.get(`http://127.0.0.1:${port}/doc/index.html`, (res) => resolve(res.statusCode)).on('error', reject));
    if (guide !== 200) throw new Error('doc/index.html not served');
    const job = await post(port, 'remote.connect', { protocol: 'FTP', host: '127.0.0.1', port: ftp.port, user: ftp.user, password: ftp.password });
    let snap = job.data;
    for (let i = 0; i < 200 && snap.status === 'running'; i++) {
      await sleep(50);
      snap = (await post(port, 'jobs.get', { id: snap.id })).data;
    }
    if (snap.status !== 'done') throw new Error(`connect job failed: ${snap.error}`);
    const listing = await post(port, 'remote.list', { id: snap.result.id, path: '/pub' });
    if (!listing.ok || !listing.data.entries.some((e) => e.name === 'welcome.txt')) throw new Error('remote.list failed');
    await post(port, 'remote.disconnect', { id: snap.result.id });
    console.log(`[smoke] web OK → api + static + guide + connect job (${listing.data.entries.length} entries in /pub)`);

    const edge = findEdge();
    if (!edge) { console.log('[smoke] web UI: no Edge/Chrome found — API checks only'); return; }
    const cdpPort = await freePort(9360);
    browser = spawn(edge, ['--headless=new', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${path.join(smokeDir, 'edge')}`, '--window-size=1200,720', '--no-first-run', `http://127.0.0.1:${port}/`], { stdio: 'ignore' });
    const page = await connect(await waitForTarget(cdpPort, (t) => t.url.startsWith(`http://127.0.0.1:${port}`)));
    await page.until('window.__mfc && window.__mfc.state && window.__mfc.state.profiles.length > 0', 30000);
    const result = await page.evaluate(wrap(SCENARIOS.connected));
    fs.writeFileSync(path.join(smokeDir, 'web_connected.png'), await page.screenshot());
    page.close();
    console.log(`[smoke] web UI OK → .smoke/web_connected.png  ${result.slice(0, 120)}`);
  } finally {
    if (browser) browser.kill();
    child.kill();
  }
}

(async () => {
  fs.mkdirSync(smokeDir, { recursive: true });
  seed();
  const ftp = await startFtpServer({ root: serverRoot });
  seedProfile(ftp);
  console.log(`[smoke] test FTP server on 127.0.0.1:${ftp.port} (root ${path.relative(root, serverRoot)})`);
  try {
    if (!flag('web-only')) buildDesktop();
    const scenario = opt('scenario');
    const docs = flag('docs');
    if (scenario || docs) {
      const names = docs || scenario === 'all' ? Object.keys(SCENARIOS) : [scenario];
      for (const name of names) {
        seed(); seedProfile(ftp);
        await desktopShot(name, SCENARIOS[name]);
        if (docs && DOC_PICTURES[name]) {
          fs.mkdirSync(path.join(root, 'doc', 'img'), { recursive: true });
          fs.copyFileSync(path.join(smokeDir, `${name}.png`), path.join(root, 'doc', 'img', `${DOC_PICTURES[name]}.png`));
        }
      }
      if (docs) {
        seed(); seedProfile(ftp);
        await desktopWindows({ checkImages: false });
        console.log(`[smoke] guide pictures written to doc/img/ (${Object.keys(DOC_PICTURES).length + 1})`);
        // The exe embeds dist/doc: build again so the guide shows the new pictures, and check it.
        buildDesktop(true);
        seed(); seedProfile(ftp);
        await desktopWindows();
      }
      console.log('[smoke] done');
      return;
    }
    if (!flag('web-only')) {
      await desktopShot('main', SCENARIOS.main);
      const out = await desktopShot('transfer', SCENARIOS.transfer);
      if (!fs.existsSync(path.join(localDir, 'video.mp4')) || fs.statSync(path.join(localDir, 'video.mp4')).size !== 2_000_000) throw new Error('download did not land in the local folder');
      if (!fs.existsSync(path.join(localDir, 'images', 'logo.png'))) throw new Error('folder download incomplete');
      if (!fs.existsSync(path.join(serverRoot, 'pub', 'docs', 'notes', 'a.txt'))) throw new Error('folder upload incomplete');
      if (!/업로드 완료|Upload finished/.test(out)) throw new Error('upload log line missing');
      console.log('[smoke] desktop transfer verified (download 2 items, upload folder tree)');
      for (const name of ['file_delete', 'file_clipboard', 'file_drag', 'file_osdrop']) {
        seed(); seedProfile(ftp);
        await desktopShot(name, SCENARIOS[name]);
      }
      console.log('[smoke] Del · copy / cut / paste · drag between panels · OS drops verified');
      seed(); seedProfile(ftp);
      await desktopWindows();
    }
    if (!flag('desktop-only')) await webSmoke(ftp);
    console.log('[smoke] all good');
  } finally {
    await ftp.close();
  }
})().catch((err) => { console.error('[smoke] FAILED:', err.message); process.exit(1); });
