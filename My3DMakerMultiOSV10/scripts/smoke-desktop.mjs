// Drives the real desktop executable (native Rust solver behind Tauri) over the WebView2 debug port:
//   node scripts/smoke-desktop.mjs [--exe path] [--out dir]
// The app runs with its own WebView2 profile in a temporary folder (the user's settings are not touched)
// and is closed at the end — only the process this script started.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freeDevPort } from './dev-port.mjs';
import { Page, waitTarget, sleep } from '../test/e2e/cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };
const exe = opt('--exe', process.env.MY3DMAKER_E2E_EXE ?? path.join(root, 'src-tauri', 'target', 'debug', process.platform === 'win32' ? 'my3dmaker.exe' : 'my3dmaker'));
const out = opt('--out', path.join(root, 'test-results', 'desktop'));
if (!existsSync(exe)) { console.error(`✘ desktop: no executable at ${exe} (cargo build --features tauri/custom-protocol in src-tauri)`); process.exit(1); }
mkdirSync(out, { recursive: true });
const port = await freeDevPort(9400);
const profile = path.join(tmpdir(), `my3dmaker-e2e-${process.pid}`);
const app = spawn(exe, ['--nowelcome'], {
  stdio: 'ignore',
  env: { ...process.env, MY3DMAKER_MULTI: '1', WEBVIEW2_USER_DATA_FOLDER: profile, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`, MY3DMAKER_CONFIG_DIR: path.join(profile, 'config'), MY3DMAKER_DATA_DIR: path.join(profile, 'data') },
});
let failed = false;
const done = () => { try { app.kill(); } catch { /* gone */ } setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch { /* in use */ } }, 800); };
process.on('exit', done);

const steps = [
  ['desktop: app is up with the native solver', `(async()=>{ await new Promise(r=>{ const t=()=>window.__my3dmaker?r():setTimeout(t,100); t(); }); return String(Boolean(window.__TAURI_INTERNALS__)) + ':' + window.__my3dmaker.state.solver?.native })()`, /^true:true$/],
  ['desktop: static example solved natively', `(async()=>{ const a=window.__my3dmaker.actions; a.updateSettings({ showWelcome: false }); await a.openSample('cantilever'); const r = await a.solve(); return r.result.max.displacement * 1000 })()`, /^0\.(49|50|51)/],
  ['desktop: modal example', `(async()=>{ const a=window.__my3dmaker.actions; window.__my3dmaker.state.dirty=false; await a.openSample('modalBeam'); const r = await a.solve(); return r.modes.length })()`, /^8$/],
  ['desktop: flow example', `(async()=>{ const a=window.__my3dmaker.actions; window.__my3dmaker.state.dirty=false; await a.openSample('wingLift'); const r = await a.solve(); return r.fluid.forces[0].lift > 0 })()`, /^true$/],
  ['desktop: solve can be stopped', `(async()=>{ const a=window.__my3dmaker.actions; window.__my3dmaker.state.dirty=false; await a.openSample('cubeDrag'); const p = a.solve().catch(e=>e.message); await new Promise(r=>setTimeout(r,1500)); window.__my3dmaker.run('stopSolve'); return await p })()`, /^cancelled$/],
  ['desktop: no errors in the log', `JSON.stringify(window.__my3dmaker.state.log.filter(l => l.kind === 'error' && !/cancel|중지/i.test(l.text)).map(l => l.text))`, /^\[\]$/],
];

try {
  const target = await waitTarget(port, (t) => t.type === 'page' && /index\.html|tauri\.localhost|localhost/.test(t.url), 40000);
  const page = new Page(target);
  await page.open();
  // The WebView navigates once more while it starts: wait (through destroyed contexts) until the app has started
  // and stays put for a moment.
  const end = Date.now() + 60000;
  let stable = 0;
  while (Date.now() < end && stable < 3) {
    let up = false;
    try { up = (await page.eval('Boolean(window.__my3dmaker && document.readyState === "complete" && document.querySelector("#statusbar")?.textContent)', 5000)) === true; } catch { up = false; }
    stable = up ? stable + 1 : 0;
    await sleep(400);
  }
  for (const [name, expr, expect] of steps) {
    const t0 = Date.now();
    let value;
    try { value = String(await page.eval(expr, 240000)); } catch (e) { value = `error: ${e.message}`; }
    const ok = expect.test(value);
    console.log(`${ok ? '✔' : '✘'} ${name}${ok ? '' : `: got ${value.slice(0, 200)}`} [${Date.now() - t0} ms]`);
    if (!ok) failed = true;
  }
  await page.screenshot(path.join(out, 'desktop.png')).catch(() => {});
  page.close();
} catch (e) {
  console.log(`✘ desktop: ${e.message}`);
  failed = true;
}
await sleep(200);
done();
process.exit(failed ? 1 : 0);
