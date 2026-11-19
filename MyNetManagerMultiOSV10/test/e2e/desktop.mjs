// E2E: the real desktop program (debug build) driven over WebView2's DevTools port. What only the desktop
// app does: native file read/write, popups as OS windows, the printer list, document windows, and live
// capture through libpcap / Npcap (on the loopback adapter, with datagrams this test sends itself).
//
// Isolation: its own WebView2 profile and data folders (temp), MYNETMANAGER_MULTI=1 (no single-instance
// bookkeeping), files only in a temp folder. Nothing is printed on a real printer.
//
//   node test/e2e/desktop.mjs            (needs `npx tauri build --debug --no-bundle` first; builds it when missing)
import { spawn, spawnSync } from 'node:child_process';
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { c, groupLine, grouped, groupOf, heading, resultLine, totalsLine } from './report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = path.join(root, 'test-results', 'desktop');
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const exeName = process.platform === 'win32' ? 'MyNetManager.exe' : 'MyNetManager';
// MYNETMANAGER_E2E_EXE: a program built elsewhere (an isolated target folder with its page built in), so the suite
// neither needs the development server that target/debug's `npm start` build loads from, nor touches that build.
const exe = [process.env.MYNETMANAGER_E2E_EXE, path.join(root, 'src-tauri', 'target', 'debug', exeName), path.join(root, 'src-tauri', 'target', 'debug', exeName.toLowerCase())].filter(Boolean).find((p) => fs.existsSync(p));

if (process.platform !== 'win32') {
  console.log(heading('E2E desktop'));
  console.log(resultLine({ status: 'skip', name: 'desktop suite runs on Windows (WebView2 DevTools port)' }));
  console.log(totalsLine('E2E', 0, 0));
  process.exit(0);
}
if (!exe) {
  const r = spawnSync(process.execPath, [path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), 'build', '--debug', '--no-bundle'], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) process.exit(1);
}
const program = [process.env.MYNETMANAGER_E2E_EXE, path.join(root, 'src-tauri', 'target', 'debug', exeName)].filter(Boolean).find((p) => fs.existsSync(p));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mynetmanager-desktop-'));
const port = 9500 + Math.floor(Math.random() * 300);
const child = spawn(program, [], {
  env: {
    ...process.env, MYNETMANAGER_MULTI: '1',
    WEBVIEW2_USER_DATA_FOLDER: path.join(temp, 'webview'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection`,
    APPDATA: path.join(temp, 'appdata'), LOCALAPPDATA: path.join(temp, 'localappdata'),
  },
  stdio: 'ignore',
});

async function targets() {
  try { return await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { return []; }
}

/** A CDP connection to one page target. */
async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result); }
    else if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails?.exception?.description ?? 'exception');
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); setTimeout(() => { if (pending.has(n)) { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); } }, 60000); });
  await send('Runtime.enable');
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  return { send, evaluate, errors, close: () => ws.close(), screenshot: async (file) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); } };
}

let main = null;
const end = Date.now() + 60000;
while (!main && Date.now() < end) {
  const list = await targets();
  const target = list.find((t) => t.type === 'page' && !/[?&](popup|viewer)=/.test(t.url) && !t.url.startsWith('about:'));
  if (target) main = await connect(target);
  else await sleep(300);
}
const results = [];
console.log(heading('E2E desktop', c.dim(`(${path.basename(program)})`)));
if (!main) {
  console.log(resultLine({ status: 'fail', name: 'the program starts and shows its page', error: 'no page target on the DevTools port' }));
  child.kill();
  process.exit(1);
}

const run = (body) => main.evaluate(`(async () => { const A = window.__mynetmanager; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch {} await sleep(80); } throw new Error('timeout: ' + fn.toString().slice(0, 120)); };
  ${body} })()`);
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const CASES = [];
const test = (id, name, fn) => CASES.push({ id, name, fn });

test('app.start', 'The program starts, shows the start page and reports its build', async () => {
  await run(`await until(() => A && document.querySelector('.start-board')); return true;`);
  const info = await run(`return await (await import('/src/platform/native.js').catch(() => null))?.appInfo?.() ?? A.state.info;`).catch(() => null);
  const state = await run(`return { info: A.state.info, desktop: !!window.__TAURI_INTERNALS__ };`);
  assert(state.desktop, 'not running inside Tauri');
  assert(state.info?.version && state.info?.os, `app info: ${JSON.stringify(state.info ?? info)}`);
});

test('capture.backend', 'libpcap / Npcap is found and the interfaces are listed with friendly names', async () => {
  const r = await run(`await until(() => A.state.backend); await A.actions.refreshInterfaces(); return { backend: A.state.backend, ifaces: A.state.interfaces.map((i) => ({ id: i.id, name: i.friendly, kind: i.kind, addresses: i.addresses.length })) };`);
  assert(r.backend.available, `backend: ${JSON.stringify(r.backend)}`);
  assert(r.ifaces.length >= 2, 'no real interface');
  assert(r.ifaces.some((i) => i.kind === 'loopback'), 'no loopback adapter (Npcap loopback support)');
  assert(r.ifaces.filter((i) => i.kind !== 'demo').every((i) => i.name && !/^\\\\Device\\\\NPF_/.test(i.name)), 'an interface has no friendly name');
});

test('capture.filterCheck', 'Capture filters are compiled by libpcap: valid and invalid', async () => {
  const r = await run(`const inv = (args) => window.__TAURI_INTERNALS__.invoke('capture_check_filter', args).catch((e) => ({ ok: false, error: String(e?.message ?? e) }));
    return { good: await inv({ linktype: 1, filter: 'udp port 53 or tcp port 443' }), bad: await inv({ linktype: 1, filter: 'udp port nope' }) };`);
  assert(r.good.ok, `valid filter rejected: ${JSON.stringify(r.good)}`);
  assert(!r.bad.ok && r.bad.error, 'invalid filter accepted');
});

test('capture.loopback', 'Live capture on the loopback adapter with a capture filter receives exactly the datagrams sent', async () => {
  // Npcap installed for administrators only: the first capture in a process raises a UAC prompt that
  // nobody answers in an unattended run. Skip then (set MYNETMANAGER_TEST_CAPTURE=1 to run it and answer the prompt).
  const backend = await run(`await until(() => A.state.backend); return A.state.backend;`);
  if (backend.needsPrompt && process.env.MYNETMANAGER_TEST_CAPTURE !== '1') return 'skip';
  const udpPort = 40000 + Math.floor(Math.random() * 20000);
  const loop = await run(`return A.state.interfaces.find((i) => i.kind === 'loopback')?.id;`);
  assert(loop, 'no loopback interface');
  await run(`A.actions.updateSettings({ captureFilter: 'udp port ${udpPort}' }); const d = await A.actions.startLiveCapture(${JSON.stringify(loop)}); window.__liveDoc = d; await sleep(1500); return !!d?.capture;`);
  const socket = dgram.createSocket('udp4');
  for (let i = 0; i < 25; i += 1) { await new Promise((resolve) => socket.send(Buffer.from(`mynetmanager-test-${i}`), udpPort, '127.0.0.1', resolve)); await sleep(20); }
  socket.close();
  const r = await run(`const d = window.__liveDoc; await until(() => d.count >= 25, 10000).catch(() => {}); await A.actions.stopLiveCapture(d); A.actions.updateSettings({ captureFilter: '' });
    const ports = new Set(d.frames.map((f, i) => d.dissection(i).fields.get('udp.dstport')?.[0]?.value)); const text = d.dissection(0).fields.get('data.data')?.[0];
    return { count: d.count, ports: [...ports], linktype: d.file.interfaces[0].linktype, stopped: !d.capture };`);
  assert(r.stopped, 'capture did not stop');
  assert(r.count === 25, `captured ${r.count} of 25`);
  assert(r.ports.length === 1 && r.ports[0] === udpPort, `capture filter let through ports ${r.ports}`);
});

test('files.openSave', 'Open a pcapng from disk, save it as pcapng and pcap, reopen: same packets', async () => {
  const sample = path.join(root, 'samples', 'http-page-load.pcapng');
  const saved = path.join(temp, 'saved.pcapng');
  const savedPcap = path.join(temp, 'saved.pcap');
  const r = await run(`const d = await A.actions.openPath(${JSON.stringify(sample)}); const n = d.count;
    window.__mynetmanagerSavePicks = [${JSON.stringify(saved)}, ${JSON.stringify(savedPcap)}];
    await A.actions.saveDoc(d, { saveAs: true }); await A.actions.saveDoc(d, { saveAs: true, format: 'pcap' });
    const again = await A.actions.openPath(${JSON.stringify(savedPcap)}); return { n, saved: d.path, again: again?.count };`);
  assert(r.n > 10 && fs.existsSync(saved) && fs.existsSync(savedPcap), 'files not written');
  assert(r.again === r.n, `reopened ${r.again} of ${r.n}`);
  const original = fs.readFileSync(sample);
  assert(fs.statSync(saved).size >= original.length * 0.9, 'saved pcapng is too small');
});

test('popups.windows', 'Popups are OS windows of their own (settings, statistics, print)', async () => {
  await run(`await A.actions.openSample('mixed-office-lan'); return true;`);
  for (const [open, label] of [[`A.popups.open('settings', { tab: 'general' })`, 'popup=settings'], [`A.actions.openStats('hierarchy')`, 'popup=stats'], [`A.run('print')`, 'popup=print']]) {
    await run(`${open}; return true;`);
    const deadline = Date.now() + 10000;
    let found = null;
    while (!found && Date.now() < deadline) { found = (await targets()).find((t) => t.url.includes(label) || t.title === label.replace('popup=', 'popup-')); if (!found) await sleep(200); }
    assert(found, `no OS window for ${label}`);
  }
});

test('print.printers', 'The print window lists the printers (no page is sent to a printer)', async () => {
  const deadline = Date.now() + 10000;
  let target = null;
  while (!target && Date.now() < deadline) { target = (await targets()).find((t) => t.title === 'popup-print' || t.url.includes('popup=print')); if (!target) await sleep(200); }
  assert(target, 'no print window');
  const win = await connect(target);
  // The test hook replaces the real printing: no job may reach a printer.
  await win.evaluate(`window.__mynetmanagerPrintHook = (layout, job) => { window.__printed = { pages: layout.count, job }; }; true`);
  const r = await win.evaluate(`(async () => { const end = Date.now() + 10000; while (Date.now() < end && !document.querySelector('.pp-sheet')) await new Promise((r) => setTimeout(r, 100));
    const options = [...document.querySelectorAll('[data-print="printer"] option')].length; document.querySelector('[data-action="print-now"]').click(); await new Promise((r) => setTimeout(r, 300)); return { options, printed: window.__printed }; })()`);
  win.close();
  await run(`await A.popups.closeAll(); return true;`);
  assert(r.printed?.pages >= 1, 'print window did not lay out pages');
  assert(r.options >= 1 || r.printed.job.printer === '', 'no printer list and no fallback');
});

test('docs.window', "The user's guide opens in its own window", async () => {
  await run(`A.run('userGuide'); return true;`);
  const deadline = Date.now() + 15000;
  let found = null;
  while (!found && Date.now() < deadline) {
    for (const t of (await targets()).filter((x) => x.type === 'page')) {
      const win = await connect(t).catch(() => null);
      if (!win) continue;
      // A hidden popup can be slow to answer: ask each window briefly.
      const label = await Promise.race([win.evaluate('window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label ?? ""'), sleep(2000).then(() => '')]).catch(() => '');
      const ready = label === 'doc-guide' ? await win.evaluate(`(async () => { const end = Date.now() + 8000; while (Date.now() < end) { const f = document.querySelector('iframe'); if (f?.contentDocument?.querySelector('h1') && document.querySelectorAll('[data-viewer="lang"] svg.flag').length === 2) return true; await new Promise((r) => setTimeout(r, 200)); } return false; })()`).catch(() => false) : false;
      win.close();
      if (label === 'doc-guide') { found = { ready }; break; }
    }
    if (!found) await sleep(300);
  }
  assert(found, 'no guide window');
  assert(found.ready, 'the guide window shows no document or no language flags');
});

test('errors.none', 'No page errors in the main window', async () => {
  assert(!main.errors.length, main.errors.slice(0, 3).join(' | '));
});

let lastGroup = '';
for (const item of grouped(CASES)) {
  if (groupOf(item.id) !== lastGroup) { lastGroup = groupOf(item.id); console.log(groupLine(item.id)); }
  const started = performance.now();
  try {
    const outcome = await item.fn();
    if (outcome === 'skip') {
      results.push({ id: item.id, name: item.name, ok: true, skipped: true });
      console.log(resultLine({ status: 'skip', name: `${item.id}  ${item.name} (needs the Npcap admin prompt)`, ms: performance.now() - started }));
      continue;
    }
    results.push({ id: item.id, name: item.name, ok: true });
    console.log(resultLine({ status: 'pass', name: `${item.id}  ${item.name}`, ms: performance.now() - started }));
  } catch (error) {
    results.push({ id: item.id, name: item.name, ok: false, error: String(error?.message ?? error) });
    console.log(resultLine({ status: 'fail', name: `${item.id}  ${item.name}`, ms: performance.now() - started, error: String(error?.message ?? error) }));
    await main.screenshot(path.join(out, `${item.id}.png`)).catch(() => {});
  }
}

fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
const passed = results.filter((r) => r.ok && !r.skipped).length;
console.log(totalsLine('E2E', passed, results.filter((r) => !r.ok).length));
// Close the program (only the copy this test started) and remove its temporary data.
try { await run(`A.state.quitting = true; await window.__TAURI_INTERNALS__.invoke('quit_app'); return true;`); } catch { /* closing */ }
await sleep(1500);
try { child.kill(); } catch { /* gone */ }
await sleep(500);
try { fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5 }); } catch { /* locked */ }
process.exit(results.every((r) => r.ok) ? 0 : 1);
