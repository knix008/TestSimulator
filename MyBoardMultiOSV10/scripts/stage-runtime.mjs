// Stages the desktop core for the installer (ARCHITECTURE.md §7): src-tauri/runtime/ gets
//   node(.exe)    — the Node executable this script runs with (the installed app needs no Node.js)
//   desktop.cjs   — server/desktop.js and everything it imports (core/, mysql2, pg, mssql, ws …) in one
//                   CommonJS file made by esbuild
//   package.json  — { "type": "commonjs" } so Node never reads the bundle as ESM
// tauri.conf.json ships runtime/ as a resource; src-tauri/src/core.rs starts runtime/node runtime/desktop.cjs.
//
// Optional native add-ons the database drivers try to load (pg-native, bufferutil, utf-8-validate …) stay
// external: the drivers fall back to their pure JavaScript code when they are missing.
//
//   node scripts/stage-runtime.mjs            stage (build:win/mac/linux run it before tauri build)
//   node scripts/stage-runtime.mjs --check    also start the staged core once and wait for MYBOARD_READY
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.join(root, 'src-tauri', 'runtime');
const entry = path.join(root, 'server', 'desktop.js');

/** Modules that are optional at run time (native speed-ups) or not used by the desktop core. */
export const EXTERNAL = [
  'pg-native', 'bufferutil', 'utf-8-validate', 'cpu-features', 'ssh2',
  'kerberos', '@mongodb-js/zstd', 'snappy', 'aws4', 'mongodb-client-encryption',
  'better-sqlite3', 'sqlite3', '@electric-sql/pglite',
  // mssql/tedious optional authentication back ends.
  '@azure/msal-node-extensions', 'keytar',
];

if (!existsSync(entry)) {
  console.error(`[stage-runtime] ${path.relative(root, entry)} is missing: the core entry is needed for the desktop build.`);
  process.exit(1);
}

// Everything but the .gitignore placeholder goes: a stale bundle must never ship.
mkdirSync(runtime, { recursive: true });
for (const name of readdirSync(runtime)) if (name !== '.gitignore') rmSync(path.join(runtime, name), { recursive: true, force: true });

const { build } = await import('esbuild');
const started = Date.now();
const result = await build({
  entryPoints: [entry],
  outfile: path.join(runtime, 'desktop.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: `node${process.versions.node.split('.')[0]}`,
  external: EXTERNAL,
  minify: false,
  sourcemap: false,
  legalComments: 'inline',
  logLevel: 'warning',
  // import.meta.url in ESM sources → the bundle's own file URL.
  define: { 'import.meta.url': 'importMetaUrl' },
  banner: { js: "const importMetaUrl = require('node:url').pathToFileURL(__filename).href;" },
});
if (result.errors.length) process.exit(1);
writeFileSync(path.join(runtime, 'package.json'), `${JSON.stringify({ name: 'myboard-runtime', private: true, type: 'commonjs' }, null, 2)}\n`);

const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';
copyFileSync(process.execPath, path.join(runtime, nodeName));
const size = (file) => `${(statSync(path.join(runtime, file)).size / 1024 / 1024).toFixed(1)} MB`;
console.log(`[stage-runtime] desktop.cjs ${size('desktop.cjs')}, ${nodeName} ${size(nodeName)} (Node ${process.version}) in ${Date.now() - started} ms`);

if (process.argv.includes('--check')) {
  // Start the staged core once, from a temporary data folder, and wait for its READY line.
  const data = mkdtempSync(path.join(os.tmpdir(), 'myboard-stage-'));
  const child = spawn(path.join(runtime, nodeName), [path.join(runtime, 'desktop.cjs'), '--port', '0', '--data', data, '--parent-pid', String(process.pid)], { cwd: runtime, stdio: ['ignore', 'pipe', 'inherit'] });
  const ready = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 30000);
    let text = '';
    child.stdout.on('data', (chunk) => {
      text += chunk;
      const line = text.split(/\r?\n/).find((l) => l.startsWith('MYBOARD_READY '));
      if (line) { clearTimeout(timer); resolve(line); }
    });
    child.on('exit', () => { clearTimeout(timer); resolve(null); });
  });
  child.kill();
  try { rmSync(data, { recursive: true, force: true }); } catch { /* the core may still hold it a moment */ }
  if (!ready) { console.error('[stage-runtime] the staged core did not report MYBOARD_READY'); process.exit(1); }
  console.log(`[stage-runtime] staged core started: ${ready.split(' ').slice(0, 2).join(' ')} …`);
}
