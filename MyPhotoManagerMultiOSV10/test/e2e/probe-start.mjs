// Debug: launch the app without waiting for "ready" and print what the page shows / threw.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Page, sleep, waitTarget } from './cdp.mjs';
import { freePort, portOpen, root } from './harness.mjs';

const exe = path.join(root, 'src-tauri', 'target', 'debug', 'myphotomanager.exe');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'myphoto-probe-'));
let vite = null;
if (!(await portOpen(1440))) {
  vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', '1440', '--strictPort'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 150 && !(await portOpen(1440)); i++) await sleep(100);
}
const port = await freePort();
const env = { ...process.env, MYPHOTO_MULTI: '1', MYPHOTO_CONFIG_DIR: work, MYPHOTO_DATA_DIR: work, WEBVIEW2_USER_DATA_FOLDER: path.join(work, 'p'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(exe, [], { env, stdio: 'ignore' });
const target = await waitTarget(port, (t) => t.type === 'page', 40000);
const page = await new Page(target).open();
const errors = [];
page.on?.('Runtime.exceptionThrown', (e) => errors.push(e.exceptionDetails?.exception?.description ?? e.exceptionDetails?.text));
await page.send('Runtime.enable').catch(() => {});
await sleep(9000);
console.log(await page.eval(`JSON.stringify({ ready: document.body.classList.contains('ready'), text: document.body.innerText.slice(0, 600) })`).catch((e) => e.message));
console.log(errors.join('\n'));
page.close();
spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
vite?.kill();
