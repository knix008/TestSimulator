// The built web version (what `npm run build:web` and the desktop installers ship): built into a temporary
// folder, served by `vite preview` on a free port and opened in headless Edge. Each window kind must start
// with no page error — a module that runs at load in the wrong chunk once blanked the main window here
// while the dev server (which the other E2E suites use) was fine.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Page, waitTarget } from './cdp.mjs';
import { freeDevPort } from '../../scripts/dev-port.mjs';

const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', '/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];

export const PAGES = [
  { name: 'main window: start page, engine running', query: '?nowelcome', ready: 'Boolean(window.__mybroadcasting && document.querySelector("#menubar") && window.__mybroadcasting.studio.engine?.gl)' },
  { name: 'projector window', query: '?projector=program', ready: 'Boolean(document.querySelector(".projector"))' },
  { name: 'document window (user\'s guide)', query: '?viewer=guide&lang=ko', ready: 'Boolean(document.querySelector("iframe.viewer-frame"))' },
];

export async function checkWebBuild(root, { onStep = () => {} } = {}) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mybc-webbuild-'));
  const results = [];
  onStep('building the web version (vite build)…');
  const t0 = performance.now();
  const built = spawnSync(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', out, '--emptyOutDir'], { cwd: root, encoding: 'utf8' });
  results.push({ name: 'vite build', ok: built.status === 0 && fs.existsSync(path.join(out, 'index.html')), ms: performance.now() - t0, error: built.status === 0 ? null : (built.stderr || built.stdout).split('\n').slice(-8).join('\n') });
  if (!results[0].ok) return results;
  const port = await freeDevPort(5900);
  const preview = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--outDir', out, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
  const browserPath = BROWSERS.find((f) => fs.existsSync(f));
  const cdp = await freeDevPort(port + 1);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mybc-webbuild-profile-'));
  let browser = null;
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 150)); }
    if (!browserPath) throw new Error('Edge or Chrome is required');
    browser = spawn(browserPath, ['--headless=new', `--remote-debugging-port=${cdp}`, `--user-data-dir=${profile}`, '--no-first-run', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
    const target = await waitTarget(cdp, (t) => t.type === 'page', 30000);
    const page = await new Page(target).open();
    await page.send('Runtime.enable');
    let errors = [];
    page.on('Runtime.exceptionThrown', (p) => errors.push(String(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text).split('\n')[0]));
    page.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') errors.push(p.args.map((a) => a.value ?? a.description).join(' ').split('\n')[0]); });
    for (const view of PAGES) {
      onStep(`opening the built ${view.name}…`);
      const t1 = performance.now();
      errors = [];
      let error = null;
      try {
        await page.send('Page.navigate', { url: `http://127.0.0.1:${port}/${view.query}` });
        await page.waitFor(view.ready, { timeout: 30000, message: view.name });
        await new Promise((r) => setTimeout(r, 1200));
      } catch (caught) { error = caught.message; }
      if (errors.length) error = [error, ...errors.slice(0, 4)].filter(Boolean).join(' | ');
      results.push({ name: `built ${view.name}`, ok: !error, ms: performance.now() - t1, error });
    }
    page.close();
  } catch (error) {
    results.push({ name: 'built web version opens', ok: false, ms: 0, error: error.message });
  } finally {
    browser?.kill();
    preview.kill();
    setTimeout(() => { for (const dir of [out, profile]) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* still in use */ } } }, 1500);
  }
  return results;
}
