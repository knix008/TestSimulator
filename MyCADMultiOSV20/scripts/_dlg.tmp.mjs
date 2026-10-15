import { execFileSync } from 'node:child_process';
import { App } from '../test/e2e/harness.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [ps1, out, command, title] = process.argv.slice(2);
const app = await new App().start();
try {
  await app.main.eval(`(window.__mycad.actions.showHome(false), setTimeout(() => window.__TAURI_INTERNALS__.invoke('plugin:dialog|save', { options: { filters: [{ name: 'MyCAD', extensions: ['mcad'] }] } }).then((r) => console.log(r), (e) => { window.__dlgError = String(e); }), 50), 1)`);
  await sleep(3000);
  console.log('err', await app.main.eval('String(window.__dlgError)'));
  try { console.log(execFileSync('powershell', ['-NoProfile', '-File', ps1.replace('winshot', 'list')], { encoding: 'utf8' })); console.log(execFileSync('powershell', ['-NoProfile', '-File', ps1, title, out], { encoding: 'utf8' })); } catch (e) { console.log(String(e.stdout)); }
  await sleep(800);
} finally { await app.stop?.(); await app.close?.(); }
