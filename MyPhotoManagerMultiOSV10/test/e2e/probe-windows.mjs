// Debug: open Settings, press Save, list WebView targets and the process's OS windows
// (a dialog window must be gone from both).
import { execFileSync } from 'node:child_process';
import { listTargets } from './cdp.mjs';
import { App } from './harness.mjs';

const osWindows = (pid) => execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'test/e2e/os-windows.ps1', '-ProcessId', String(pid)], { encoding: 'utf8' })
  .trim().split(/\r?\n/).filter(Boolean);

const app = new App();
await app.start();
const pages = async () => (await listTargets(app.port)).filter((t) => t.type === 'page').map((t) => t.url);
console.log('start', await pages(), osWindows(app.process.pid));
await app.main.eval(`document.querySelector('#open-settings').click(); 1`);
await new Promise((r) => setTimeout(r, 1500));
console.log('open', await pages(), osWindows(app.process.pid));
await app.main.eval(`window.__myphoto.topDialog().querySelector('.dialog-buttons .btn.primary').click(); 1`);
await new Promise((r) => setTimeout(r, 1500));
console.log('after save', await pages(), osWindows(app.process.pid), 'stack', await app.main.eval(`Boolean(window.__myphoto.topDialog())`));
await app.stop();
