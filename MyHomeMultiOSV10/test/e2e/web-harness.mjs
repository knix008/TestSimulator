// Runs a built web app (dist/ or another folder) in headless Edge / Chrome and hands back a CDP
// page: a small static server, a private browser profile, no real user data touched.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Page, sleep, waitTarget } from './cdp.mjs';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

export const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
];

/**
 * Ends a headless browser with every process it started. child.kill() is not enough: on Windows the spawned
 * msedge.exe only launches the real browser and exits, so its renderer, GPU and utility processes lived on, run
 * after run (419 of them), until Edge could not start any more ("page target not found"). The browser is asked to
 * quit through its debugging port (Browser.close ends all its processes); whatever still runs with this run's own
 * profile folder is then stopped. Nothing outside that profile is touched.
 */
export async function closeBrowser(debugPort, child, profile) {
  try {
    const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`, { signal: AbortSignal.timeout(2000) })).json();
    await new Promise((resolve) => {
      const ws = new WebSocket(webSocketDebuggerUrl);
      const done = () => { try { ws.close(); } catch { /* closed */ } resolve(); };
      ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
      ws.onmessage = done;
      ws.onclose = done;
      ws.onerror = done;
      setTimeout(done, 3000);
    });
  } catch { /* not reachable: stopped below */ }
  try { child?.kill(); } catch { /* already gone */ }
  if (process.platform === 'win32' && profile) {
    await sleep(500);
    // Any process of this run's profile that is still there (the folder name is unique to this run).
    const name = path.basename(profile).replace(/'/g, "''");
    try {
      execFileSync(path.join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command',
        `Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${name}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`],
      { stdio: 'ignore', timeout: 20000 });
    } catch { /* nothing left */ }
  }
}

/** A static server for `dir` on a free port: { port, close }. */
export function serve(dir) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(dir, url === '/' ? 'index.html' : url);
    if (!file.startsWith(path.resolve(dir))) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, close: () => server.close() })));
}

/** Starts the browser on the app: { page, close, url }. */
export async function launch(dir, { width = 1500, height = 950, query = 'nowelcome', language = 'ko' } = {}) {
  const browser = BROWSERS.find((candidate) => fs.existsSync(candidate));
  if (!browser) throw new Error('Edge or Chrome is needed');
  const server = await serve(dir);
  const url = `http://127.0.0.1:${server.port}/?${query}`;
  // A fresh Edge profile opens pages of its own (OneNote clipper, sync confirmation) in front of ours:
  // the app page then is "hidden", its timers are throttled to minutes and popups lose focus. So: no
  // background throttling, no sync or first-run pages, and any page that is not ours is closed.
  // Edge now and then does not come up in time (or the random debug port is taken): a full run then lost the whole
  // second language. It is started again — new port, new profile — up to three times.
  let profile;
  let debug;
  let child;
  let target;
  for (let attempt = 1; !target; attempt++) {
    profile = fs.mkdtempSync(path.join(os.tmpdir(), 'myhomemaker-web-'));
    debug = 9400 + Math.floor(Math.random() * 500);
    child = spawn(browser, ['--headless=new', `--remote-debugging-port=${debug}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`, `--lang=${language}`,
      '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-extensions', '--disable-component-extensions-with-background-pages',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      '--disable-features=msEdgeSidebarV2,msEdgeOnRampFRE,msSyncConsentPrompt,CalculateNativeWinOcclusion', 'about:blank'], { stdio: 'ignore' });
    try {
      target = await waitTarget(debug, (t) => t.type === 'page' && t.url === 'about:blank');
    } catch (error) {
      await closeBrowser(debug, child, profile);
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* still locked */ }
      if (attempt >= 3) { server.close(); throw error; }
    }
  }
  const page = await new Page(target).open();
  const closeOthers = async () => {
    try {
      const list = await (await fetch(`http://127.0.0.1:${debug}/json/list`)).json();
      for (const t of list) if (t.type === 'page' && t.id !== target.id) await fetch(`http://127.0.0.1:${debug}/json/close/${t.id}`).catch(() => {});
    } catch { /* the browser is closing */ }
  };
  await closeOthers();
  const keeper = setInterval(closeOthers, 3000);
  await page.send('Page.bringToFront').catch(() => {});
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await page.send('Page.navigate', { url });
  await page.waitFor("document.readyState === 'complete' && !!window.__myhomemaker", { timeout: 20000 });
  await sleep(400);
  const close = async () => {
    clearInterval(keeper);
    page.close();
    await closeBrowser(debug, child, profile);
    server.close();
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* still locked */ }
  };
  return { page, close, url, port: server.port };
}
