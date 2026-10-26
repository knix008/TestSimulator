// Copies the JavaScript service into src-tauri/sidecar so the Windows, Linux
// and macOS installers can run it. --with-deps also copies the Node binary
// of the machine doing the build (each OS builds its own installer).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'src-tauri', 'sidecar');
const withNode = process.argv.includes('--with-deps');
const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const name of ['core', 'host', 'server']) {
  fs.cpSync(path.join(root, name), path.join(out, name), { recursive: true });
}
// Every sample project (demo, cpp-sensor ...), without capture/output folders.
fs.cpSync(path.join(root, 'samples'), path.join(out, 'samples'), { recursive: true, filter: (src) => !/[\\/](\.mcc|build|node_modules)([\\/]|$)/.test(src) });
// Runtime packages of the service (the Anthropic SDK for AI CodeFix, database
// drivers for the result export) and what they depend on.
const SIDECAR_PACKAGES = ['@anthropic-ai/sdk', 'pg', 'mysql2', 'mssql'];
const copied = new Set();
const copyPackage = (name) => {
  if (copied.has(name)) return;
  const src = path.join(root, 'node_modules', ...name.split('/'));
  if (!fs.existsSync(src)) { console.warn(`[sidecar] missing package ${name}; run npm install`); return; }
  copied.add(name);
  fs.cpSync(src, path.join(out, 'node_modules', ...name.split('/')), { recursive: true });
  const meta = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8'));
  for (const dep of Object.keys(meta.dependencies || {})) copyPackage(dep);
};
for (const name of SIDECAR_PACKAGES) copyPackage(name);
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify({ name: pkg.name, version: pkg.version, private: true }));
if (withNode) {
  const dest = path.join(out, nodeName);
  fs.copyFileSync(process.execPath, dest);
  if (process.platform !== 'win32') fs.chmodSync(dest, 0o755);
  console.log(`[sidecar] Staged core, host, server, samples and ${nodeName}`);
} else {
  console.log('[sidecar] Staged core, host, server and samples');
}
