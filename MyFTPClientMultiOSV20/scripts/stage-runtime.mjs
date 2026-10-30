// Puts everything the installed app needs to run its core into src-tauri/runtime/,
// which tauri.conf.json ships as a resource. The installed app then needs no
// Node.js, npm or node_modules on the machine:
//   runtime/node(.exe)                 the Node runtime this build runs on
//   runtime/server/server.js           server + core/ + npm dependencies, one file
//   runtime/package.json, runtime/src/build-info.json   version shown in About
//
// ssh2's optional native parts (cpu-features, sshcrypto.node) stay out: ssh2
// loads them in a try/catch and falls back to its pure-JS crypto.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'src-tauri', 'runtime');

fs.mkdirSync(path.join(out, 'server'), { recursive: true });
fs.mkdirSync(path.join(out, 'src'), { recursive: true });

await build({
  entryPoints: [path.join(root, 'server', 'server.js')],
  outfile: path.join(out, 'server', 'server.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  logLevel: 'warning',
  legalComments: 'none',
  external: ['cpu-features', '*.node'],
});

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
fs.writeFileSync(path.join(out, 'package.json'), `${JSON.stringify({ name: pkg.name, version: pkg.version, private: true }, null, 2)}\n`);
const info = path.join(root, 'src', 'build-info.json');
if (fs.existsSync(info)) fs.copyFileSync(info, path.join(out, 'src', 'build-info.json'));

// Copy the runtime only when it changed: it is ~90 MB.
const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';
const nodeDest = path.join(out, nodeName);
const src = fs.statSync(process.execPath);
const dst = fs.existsSync(nodeDest) ? fs.statSync(nodeDest) : null;
if (!dst || dst.size !== src.size || dst.mtimeMs < src.mtimeMs) {
  fs.copyFileSync(process.execPath, nodeDest);
  if (process.platform !== 'win32') fs.chmodSync(nodeDest, 0o755);
}
console.log(`[runtime] ${path.relative(root, out)} ready (node ${process.version})`);
