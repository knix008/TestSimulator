// Stages the Node service next to the Tauri bundle: core, host, and (with
// --with-deps) the production modules plus a copy of node itself.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'src-tauri', 'sidecar');
const withDeps = process.argv.includes('--with-deps');

const SKIP = new Set([
  'electron', 'electron-builder', 'electron-publish', 'app-builder-bin', 'app-builder-lib',
  '@electron', '@malept', '@develar', 'vite', '@vitejs', 'esbuild', '@esbuild', 'sharp',
  'concurrently', 'wait-on', 'cross-env', '@tauri-apps', 'rollup', 'postject', 'dmg-builder',
  'electron-winstaller', 'resedit',
]);

function copyTree(from, to) {
  fs.cpSync(from, to, { recursive: true, dereference: true });
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
copyTree(path.join(root, 'core'), path.join(out, 'core'));
copyTree(path.join(root, 'host'), path.join(out, 'host'));
const info = path.join(root, 'src', 'build-info.json');
if (fs.existsSync(info)) fs.copyFileSync(info, path.join(out, 'build-info.json'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify({ name: pkg.name, version: pkg.version }));

if (withDeps) {
  const modules = path.join(root, 'node_modules');
  if (!fs.existsSync(modules)) {
    console.error('[sidecar] node_modules is missing — run npm install');
    process.exit(1);
  }
  const dest = path.join(out, 'node_modules');
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(modules)) {
    if (name === '.bin' || SKIP.has(name)) continue;
    if (name.startsWith('@')) {
      const scope = path.join(modules, name);
      for (const child of fs.readdirSync(scope)) {
        const full = `${name}/${child}`;
        if (SKIP.has(full) || SKIP.has(name)) continue;
        fs.mkdirSync(path.join(dest, name), { recursive: true });
        copyTree(path.join(scope, child), path.join(dest, name, child));
      }
      continue;
    }
    copyTree(path.join(modules, name), path.join(dest, name));
  }
  const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';
  fs.copyFileSync(process.execPath, path.join(out, nodeName));
  console.log(`[sidecar] Staged core, host, node_modules and ${nodeName}`);
} else {
  console.log('[sidecar] Staged core and host');
}
