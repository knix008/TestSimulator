// npm run dev:web — the web UI while developing: a web core (server/web.js) on a free port and Vite on
// another free port, Vite proxying /api and the /api/live WebSocket to the core (vite.config.js,
// MYBOARD_API_TARGET). Both ports are free on 127.0.0.1 and ::1: nothing another program runs is reused
// or stopped. The page reloads on UI edits; restart this script after a core edit.
//
//   npm run dev:web                    core + Vite, opens nothing (the URL is printed)
//   npm run dev:web -- --no-core       Vite only, against a core you started yourself (MYBOARD_API_TARGET)
//   extra arguments after --core-args are passed to server/web.js (e.g. --config myboard.config.json)
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freeDevPort } from './dev-port.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const coreArgs = args.includes('--core-args') ? args.slice(args.indexOf('--core-args') + 1) : [];
const children = [];
const stopAll = () => { for (const child of children) { try { child.kill(); } catch { /* gone */ } } };
process.on('exit', stopAll);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => { stopAll(); process.exit(130); });

async function waitFor(url, seconds) {
  const deadline = Date.now() + seconds * 1000;
  for (;;) {
    try { const response = await fetch(url); if (response.status < 500) return true; } catch { /* not yet */ }
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

let target = process.env.MYBOARD_API_TARGET || null;
if (!args.includes('--no-core')) {
  const web = path.join(root, 'server', 'web.js');
  if (!existsSync(web)) {
    console.warn('[dev:web] server/web.js is not there yet: Vite runs alone and the UI shows "core not reachable".');
  } else {
    const corePort = await freeDevPort(5560);
    const data = path.join(root, 'data');
    mkdirSync(data, { recursive: true });
    const core = spawn(process.execPath, [web, '--port', String(corePort), '--host', '127.0.0.1', '--data', data, ...coreArgs], { cwd: root, stdio: 'inherit', env: { ...process.env, MYBOARD_PORT: String(corePort) } });
    children.push(core);
    core.on('exit', (code) => { console.error(`[dev:web] the web core ended (exit ${code}).`); stopAll(); process.exit(code || 1); });
    target = `http://127.0.0.1:${corePort}`;
    if (!(await waitFor(`${target}/api/info`, 60))) console.warn(`[dev:web] ${target}/api/info did not answer within 60 s; Vite starts anyway.`);
  }
}

const port = await freeDevPort(5520);
const vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, MYBOARD_DEV_PORT: String(port), ...(target ? { MYBOARD_API_TARGET: target } : {}) },
});
children.push(vite);
vite.on('exit', (code) => { stopAll(); process.exit(code ?? 0); });
if (await waitFor(`http://127.0.0.1:${port}/`, 60)) console.log(`\n[dev:web] MyBoard (web): http://127.0.0.1:${port}/${target ? `   (API → ${target})` : ''}\n`);
