// npm run docs:shots — the pictures of the user manual and the tutorial document
// (public/docs/images/<ko|en>/*.png), taken from the real web app.
//
// The app is built once into a temporary folder and served by server/server.js
// with temporary settings (MSM_USER_DATA) and a temporary work folder (MSM_ROOT,
// filled with samples/), so the user's own settings and files are never touched.
// Headless Edge (or Chrome) at 1200×771 opens it once per language; each picture
// is the whole window or one element of it.
//
// Options: --lang ko|en (default both) · --only name,name · --keep (keep the temp folder)
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null; };
const langs = opt('lang') ? [opt('lang')] : ['ko', 'en'];
const only = opt('only') ? new Set(opt('only').split(',')) : null;
const W = 1200, H = 771;

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'msm-shots-'));
const workRoot = path.join(work, 'work');
fs.mkdirSync(workRoot, { recursive: true });
fs.cpSync(path.join(root, 'samples'), workRoot, { recursive: true });
process.env.MSM_ROOT = workRoot;

const browserExe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
if (!browserExe) throw new Error('Edge or Chrome is needed');

console.log('building …');
execSync(`npx vite build --outDir "${path.join(work, 'dist')}" --emptyOutDir`, { cwd: root, stdio: 'ignore', env: { ...process.env, MSM_USER_DATA: path.join(work, 'build-ud') } });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failed = [];

async function session(lang) {
  const ud = path.join(work, `ud-${lang}`);
  fs.mkdirSync(ud, { recursive: true });
  fs.writeFileSync(path.join(ud, 'settings.json'), JSON.stringify({ language: lang, theme: 'midnight', tutorial: { askOnLaunch: false, done: true } }));
  process.env.MSM_USER_DATA = ud;
  const { createWebServer } = await import(`${pathToFileURL(path.join(root, 'server/server.js')).href}?${lang}`);
  const server = createWebServer({ workRoot, distDir: path.join(work, 'dist') });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = spawn(browserExe, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${path.join(work, `prof-${lang}`)}`, `--window-size=${W},${H}`, '--hide-scrollbars', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((res) => { let b = ''; browser.stderr.on('data', (d) => { b += d; const m = b.match(/ws:\/\/[^\s]+/); if (m) res(m[0]); }); });
  const list = await (await fetch(`http://127.0.0.1:${new URL(wsUrl).port}/json`)).json();
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const wait = new Map();
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); }
    // a browser dialog (confirm / alert) would block every call: answer it
    if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: m.params.type !== 'confirm' });
  });
  await send('Page.enable');
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? undefined : r.result.result && r.result.result.value; };
  const key = async (k, code, vk, modifiers = 0) => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk, modifiers }); };
  // an app action; one that waits on a question in the page (save changes? …) is let go after 10 s
  const limit = (p, ms, label) => { let done = false; return Promise.race([p.then((v) => { done = true; return v; }), sleep(ms).then(() => { if (!done) console.log(`  (${label}: still waiting after ${ms / 1000} s, going on)`); })]); };
  const act = (a) => limit(ev(`window.__msm.action(${JSON.stringify(a)})`), 10000, `action ${a}`);
  const idle = async () => { await sleep(300); for (let i = 0; i < 80 && (await ev("!!document.querySelector('.tb-busy') || (window.__msmEngine && window.__msmEngine.state === 'busy')")); i++) await sleep(250); };
  const escape = async () => { await key('Escape', 'Escape', 27); await sleep(250); };
  const out = path.join(root, 'public/docs/images', lang);
  fs.mkdirSync(out, { recursive: true });
  /** The whole window, or the element of the first selector that is on screen. */
  const shot = async (name, sel = null, pad = 0) => {
    let clip;
    if (sel) {
      const r = await ev(`(() => { for (const s of ${JSON.stringify([].concat(sel))}) { const e = document.querySelector(s); if (e) { const b = e.getBoundingClientRect(); if (b.width > 4 && b.height > 4) return { x: b.x, y: b.y, w: b.width, h: b.height }; } } return null; })()`);
      if (!r) { failed.push(`${lang}/${name}: ${[].concat(sel).join(' | ')} not on screen`); return; }
      clip = { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: Math.min(W, r.w + 2 * pad), height: Math.min(H, r.h + 2 * pad), scale: 1 };
    }
    const s = await send('Page.captureScreenshot', { format: 'png', clip });
    fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(s.result.data, 'base64'));
    console.log(`  ${lang}/${name}.png`);
  };
  const want = (n) => !only || only.has(n);
  // one picture at a time, each to its end: a picture that went on while the next one started was
  // taken in the wrong state (a busy machine made steps slow), so there is no time limit here
  const step = async (n, fn) => {
    if (!want(n)) return;
    console.log(`  … ${n}`);
    try { await fn(); } catch (e) { failed.push(`${lang}/${n}: ${e.message}`); await escape().catch(() => {}); }
  };
  const tour = async (stepId) => {
    const i = await ev(`window.__msm.tutorial.steps.findIndex((s) => s.id === ${JSON.stringify(stepId)})`);
    if (!(await ev('window.__msm.tutorial.state().active'))) await ev(`window.__msm.tutorial.start({ index: ${i} })`);
    await ev(`window.__msm.tutorial.go(${i})`);
    for (let k = 0; k < 120 && (await ev('window.__msm.tutorial.state().busy')); k++) await sleep(250);
    await sleep(900);
  };

  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  for (let i = 0; i < 80 && !(await ev('!!(window.__msm && window.__msm.action && window.__msm.tutorial)')); i++) await sleep(500);
  await sleep(2000);
  const L = (ko, en) => (lang === 'en' ? en : ko);

  console.log(`[${lang}]`);
  await step('start', async () => { await act('showStart'); await sleep(1500); await shot('start'); });
  await act('hideStart'); await sleep(500);
  // the tutorial pictures: one per chapter (and tour.png, the tour on the desktop)
  const TOUR = { start: 'startNew', desktop: 'desk', script: 'newScript', command: 'cmd', editor: 'runScript', figures: 'fig3d', model: 'ioGraph', finish: 'settings' };
  for (const [chapter, stepId] of Object.entries(TOUR)) await step(`tour-${chapter}`, async () => { await tour(stepId); await shot(`tour-${chapter}`); });
  await step('tour', async () => { await tour('workspace'); await shot('tour'); });
  await ev('window.__msm.tutorial.stop()'); await sleep(400);
  await act('closeDocs'); await act('hideStart'); await sleep(400);

  // desktop with a script, the Command Window, the Workspace and the history
  await act('cmd:first'); await idle();
  await act(`cmd:${L("t = linspace(0, 1, 5); s = '안녕하세요';", "t = linspace(0, 1, 5); s = 'hello';")}`); await idle();
  await act('newScript:script'); await sleep(900);
  await step('desktop', () => shot('desktop'));
  await step('editor', async () => { await act('tab:editor'); await sleep(400); await shot('editor'); });
  await step('command', () => shot('command', '[data-pane="cmd"]'));
  await step('workspace', () => shot('workspace', '[data-pane="workspace"]'));
  await step('folder', () => shot('folder', '[data-pane="folder"]'));
  await step('ribbon', async () => { await act('tab:home'); await sleep(300); await shot('ribbon', ['.ribbon']); });
  await step('ribbon-help', async () => { await act('tab:help'); await sleep(300); await shot('ribbon-help', ['.ribbon']); await act('tab:home'); });
  // debugging: a breakpoint on line 3 of the script, run to it
  await step('debug', async () => {
    await act('tab:editor'); await sleep(300);
    await ev("(() => { const l = document.querySelectorAll('.cm-line')[2]; if (!l) return false; const b = l.getBoundingClientRect(); const s = window.getSelection(); const r = document.createRange(); r.setStart(l, 0); r.collapse(true); s.removeAllRanges(); s.addRange(r); l.closest('.cm-content').focus(); return true; })()");
    await sleep(200);
    await ev("document.querySelector('.ribbon [data-act=\"bp\"]')?.click()"); await sleep(300);
    await ev("document.querySelector('.ribbon [data-act=\"run\"]')?.click()"); await sleep(2500);
    await shot('debug');
    await ev("document.querySelector('.ribbon [data-act=\"stopDebug\"]')?.click()"); await idle();
    await ev("document.querySelector('.ribbon [data-act=\"bpClear\"]')?.click()"); await sleep(300);
  });
  await step('variable-editor', async () => { await act('var:A'); await sleep(1000); await shot('variable-editor'); });
  // figures
  await act('closeDocs'); await sleep(300);
  await step('figure-2d', async () => { await act('cmd:plot'); await idle(); await act('figures'); await sleep(900); await shot('figure-2d'); });
  await step('figure-datatip', async () => {
    await ev("window.__msmFigures.setMode('datacursor')"); await sleep(200);
    // a tip at the first maximum of the curve: click where the line is
    const p = await ev(`(() => { const ctl = window.__msmFigures; const fig = ctl.figure(); const lay = ctl.layouts.get(fig.id); const it = lay.items.find((x) => x.kind === 'axes2d'); const ln = it.node.children.find((c) => c.type === 'line'); const X = ln.props.XData.data || ln.props.XData, Y = ln.props.YData.data || ln.props.YData; const k = 60; const st = document.querySelector('.fig-over').getBoundingClientRect(); return { x: st.x + it.mapper.x(X[k]) + 6, y: st.y + it.mapper.y(Y[k]) + 6 }; })()`);
    if (p) { for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 }); }
    await sleep(500); await shot('figure-datatip');
    await ev("window.__msmFigures.setMode('none')");
  });
  await step('figure-3d', async () => { await act('cmd:surf'); await idle(); await act('figures'); await sleep(900); await shot('figure-3d'); });
  // the block-diagram editor with the tour's example model
  await act('closeDocs'); await sleep(300);
  await act('tourModel'); await sleep(1500); await act('tab:simulation'); await sleep(600);
  const api = '[...window.__msmSimEditors.values()].find((e) => e.name === "tourspring")';
  await step('model-editor', () => shot('model-editor'));
  await step('model-library', () => shot('model-library', ['[data-pane="simlib"]', '.sim-lib']));
  await step('model-scope', async () => { await ev(`${api}.run()`); await idle(); await sleep(1500); await shot('model-scope'); });
  await step('model-params', async () => { await ev(`(() => { const a = ${api}; const b = a.model.root.blocks.find((x) => x.type === 'Gain'); if (b) a.openBlock(b.id); })()`); await sleep(800); await shot('model-params'); await escape(); });
  await step('model-settings', async () => { await ev(`${api}.openSettings()`); await sleep(800); await shot('model-settings'); await escape(); });
  // settings and the manual
  await step('settings', async () => { await key(',', 'Comma', 188, 2); await sleep(1200); await shot('settings'); await escape(); await sleep(300); });
  await step('guide', async () => { await key('F1', 'F1', 112); await sleep(2000); await shot('guide'); await escape(); await sleep(300); });
  // the launch question: shown again for the picture
  await step('tutorial-ask', async () => {
    fs.writeFileSync(path.join(ud, 'settings.json'), JSON.stringify({ language: lang, theme: 'midnight', tutorial: { askOnLaunch: true, done: false } }));
    await send('Page.reload'); await sleep(5000);
    await shot('tutorial-ask', ['.msm-ask']);
  });

  ws.close();
  browser.kill();
  server.close();
}

for (const lang of langs) await session(lang);
if (!argv.includes('--keep')) fs.rmSync(work, { recursive: true, force: true });
if (failed.length) { console.log(`\nnot taken (${failed.length}):`); for (const f of failed) console.log(`  ${f}`); process.exitCode = 1; } else console.log('\nall pictures taken');
