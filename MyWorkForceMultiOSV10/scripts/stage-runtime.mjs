// Stages the data service for the installer: src-tauri/runtime/ gets
//   node(.exe)    the Node executable this script runs with (the installed app needs no Node.js)
//   server.cjs    server/index.mjs and everything it imports (src/domain, mysql2, pg, mssql, nodemailer)
//                 in one CommonJS file made by esbuild
//   package.json  { "type": "commonjs" } so Node never reads the bundle as ESM
// tauri.conf.json ships runtime/ as a resource; src-tauri/src/core.rs starts runtime/node runtime/server.cjs.
//
//   node scripts/stage-runtime.mjs           stage (build:win/mac/linux run it before tauri build)
//   node scripts/stage-runtime.mjs --check   also start the staged service once and sign in as admin
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.join(root, 'src-tauri', 'runtime');
const entry = path.join(root, 'server', 'index.mjs');

/** Optional native add-ons and authentication back ends the drivers load only when present. */
const EXTERNAL = [
  'pg-native', 'cloudflare:sockets', 'kerberos', '@azure/msal-node-extensions', 'keytar',
  'bufferutil', 'utf-8-validate',
];

if (!existsSync(entry)) {
  console.error(`[stage-runtime] ${path.relative(root, entry)} is missing.`);
  process.exit(1);
}

// Everything but the .gitignore placeholder goes: a stale bundle must never ship.
mkdirSync(runtime, { recursive: true });
for (const name of readdirSync(runtime)) if (name !== '.gitignore') rmSync(path.join(runtime, name), { recursive: true, force: true });

const { build } = await import('esbuild');
const started = Date.now();
const result = await build({
  entryPoints: [entry],
  outfile: path.join(runtime, 'server.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: `node${process.versions.node.split('.')[0]}`,
  external: EXTERNAL,
  logLevel: 'warning',
  // import.meta.url in ESM sources → the bundle's own file URL.
  define: { 'import.meta.url': 'importMetaUrl' },
  banner: { js: "const importMetaUrl = require('node:url').pathToFileURL(__filename).href;" },
});
if (result.errors.length) process.exit(1);
writeFileSync(path.join(runtime, 'package.json'), `${JSON.stringify({ name: 'myworkforce-runtime', private: true, type: 'commonjs' }, null, 2)}\n`);

const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';
copyFileSync(process.execPath, path.join(runtime, nodeName));
const size = (file) => `${(statSync(path.join(runtime, file)).size / 1024 / 1024).toFixed(1)} MB`;
console.log(`[stage-runtime] server.cjs ${size('server.cjs')}, ${nodeName} ${size(nodeName)} (Node ${process.version}) in ${Date.now() - started} ms`);

if (process.argv.includes('--check')) {
  // Start the staged service from an empty data folder (a fresh install) and sign in as the administrator.
  const port = await new Promise((resolve) => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', () => { const { port: free } = probe.address(); probe.close(() => resolve(free)); });
  });
  const data = mkdtempSync(path.join(os.tmpdir(), 'myworkforce-stage-'));
  const child = spawn(path.join(runtime, nodeName), [path.join(runtime, 'server.cjs'), '--data', data, '--parent-pid', String(process.pid)], {
    cwd: runtime,
    env: { ...process.env, MYWORKFORCE_DATA_PORT: String(port), MYWORKFORCE_DATA_HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const ready = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 30000);
    let text = '';
    child.stdout.on('data', (chunk) => {
      text += chunk;
      if (text.includes('MYWORKFORCE_READY')) { clearTimeout(timer); resolve(true); }
    });
    child.on('exit', () => { clearTimeout(timer); resolve(false); });
  });
  let signedIn = false;
  if (ready) {
    const response = await fetch(`http://127.0.0.1:${port}/api/session`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: 'admin', password: 'admin' }),
    }).catch(() => null);
    signedIn = Boolean(response?.ok);
  }
  child.kill();
  setTimeout(() => { try { rmSync(data, { recursive: true, force: true }); } catch { /* still held a moment */ } }, 500);
  if (!ready || !signedIn) {
    console.error(`[stage-runtime] the staged service ${ready ? 'did not accept the first administrator sign-in' : 'did not start'}`);
    process.exit(1);
  }
  console.log('[stage-runtime] staged service started from an empty folder and accepted the first administrator sign-in');
}
