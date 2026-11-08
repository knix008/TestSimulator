// Runs a built web app (dist/ or another folder) in headless Edge / Chrome and hands back a CDP
// page: a small static server, a private browser profile, no real user data touched.
import { spawn } from 'node:child_process';
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'myhomemaker-web-'));
  const debug = 9400 + Math.floor(Math.random() * 500);
  const url = `http://127.0.0.1:${server.port}/?${query}`;
  const child = spawn(browser, ['--headless=new', `--remote-debugging-port=${debug}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`, `--lang=${language}`, '--no-first-run', '--no-default-browser-check', '--disable-features=msEdgeSidebarV2', 'about:blank'], { stdio: 'ignore' });
  const target = await waitTarget(debug, (t) => t.type === 'page');
  const page = await new Page(target).open();
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await page.send('Page.navigate', { url });
  await page.waitFor("document.readyState === 'complete' && !!window.__myhomemaker", { timeout: 20000 });
  await sleep(400);
  const close = async () => {
    page.close();
    child.kill();
    server.close();
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* still locked */ }
  };
  return { page, close, url, port: server.port };
}
