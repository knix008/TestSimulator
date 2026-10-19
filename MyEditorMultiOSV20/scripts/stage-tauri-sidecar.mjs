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

function dirStamp(dir) {
  let count = 0;
  let newest = 0;
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        count += 1;
        const mtime = fs.statSync(full).mtimeMs;
        if (mtime > newest) newest = mtime;
      }
    }
  };
  walk(dir);
  return `${count}:${newest}`;
}

function sourceStamp() {
  const lockPath = fs.existsSync(path.join(root, 'package-lock.json'))
    ? path.join(root, 'package-lock.json')
    : path.join(root, 'package.json');
  const lock = fs.statSync(lockPath);
  return [
    'v1',
    withDeps ? 'deps' : 'nodeps',
    process.version,
    `${lock.size}:${lock.mtimeMs}`,
    dirStamp(path.join(root, 'core')),
    dirStamp(path.join(root, 'host')),
  ].join('|');
}

const stampPath = path.join(out, '.stamp');
const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';
const stamp = sourceStamp();
if (fs.existsSync(stampPath) && fs.readFileSync(stampPath, 'utf8') === stamp
  && (!withDeps || fs.existsSync(path.join(out, nodeName)))) {
  const info = path.join(root, 'src', 'build-info.json');
  if (fs.existsSync(info)) fs.copyFileSync(info, path.join(out, 'build-info.json'));
  console.log('[sidecar] Up to date');
  process.exit(0);
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
  fs.copyFileSync(process.execPath, path.join(out, nodeName));
  console.log(`[sidecar] Staged core, host, node_modules and ${nodeName}`);
} else {
  console.log('[sidecar] Staged core and host');
}
fs.writeFileSync(stampPath, stamp);
