// The web build under test: Vite on a free port (no hot reload, so edits during a run do not
// reload the page) and headless Edge / Chrome driven over the DevTools protocol.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freeDevPort } from '../../scripts/port.mjs';
import { Page, sleep, waitTarget } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
];

async function waitHttp(url, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error(`${url} did not answer`);
}

/** Starts the dev server and a browser on the app. Returns { page, url, close }. */
export async function startWeb({ width = 1600, height = 1000, storage = null, headless = true, browserArgs = [] } = {}) {
  const browser = BROWSERS.find((candidate) => fs.existsSync(candidate));
  if (!browser) throw new Error('Edge or Chrome is needed for the web tests');
  const port = await freeDevPort(1490);
  const vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(port), '--strictPort'], { cwd: root, env: { ...process.env, MYTRAINER_NO_HMR: '1' }, stdio: 'ignore' });
  const url = `http://localhost:${port}/`;
  await waitHttp(url);
  const debugPort = await freeDevPort(9600);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mytrainer-web-'));
  const args = [`--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`, '--no-first-run', '--no-default-browser-check', '--enable-unsafe-webgpu',
    // A fake microphone (a beep) and camera (a test pattern) that need no permission prompt: the live input tests.
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    // A headless page counts as hidden: without these its timers slow to one a minute after a while.
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', ...browserArgs, 'about:blank'];
  if (headless) args.unshift('--headless=new');
  const child = spawn(browser, args, { stdio: 'ignore' });
  const target = await waitTarget(debugPort, (t) => t.type === 'page');
  const page = await new Page(target).open();
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  // Tests drive the app themselves: no "training finished" popup in the way (unless a test asks for it).
  const settingsKey = 'mytrainer.settings.v1';
  if (storage?.[settingsKey] && typeof storage[settingsKey] === 'object') storage = { ...storage, [settingsKey]: { notifyTrainDone: false, ...storage[settingsKey] } };
  if (storage) {
    await page.send('Page.navigate', { url });
    await sleep(500);
    await page.eval(`(() => { localStorage.clear(); ${Object.entries(storage).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(typeof v === 'string' ? v : JSON.stringify(v))});`).join('')} })()`);
  }
  await page.send('Page.navigate', { url });
  await page.waitFor('Boolean(window.__mytrainer)', { timeout: 60000, message: 'the app did not start' });
  const close = async () => {
    page.close();
    // The browser's helper processes too: on Windows kill() ends only the first one (hundreds piled up).
    const end = (proc) => { if (process.platform === 'win32' && proc.pid) spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); else proc.kill(); };
    end(child);
    end(vite);
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* still held */ }
  };
  return { page, url, close, port };
}
