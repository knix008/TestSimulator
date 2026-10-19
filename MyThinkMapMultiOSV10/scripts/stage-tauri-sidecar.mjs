// Stages the Node service next to the Tauri bundle: core/ and host/ and (with
// --with-deps) a copy of node itself. The service uses only Node's built-in
// modules, so no node_modules folder goes into the installer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'src-tauri', 'sidecar');
const withNode = process.argv.includes('--with-deps');

function dirStamp(dir) {
  let count = 0;
  let newest = 0;
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else { count += 1; newest = Math.max(newest, fs.statSync(full).mtimeMs); }
    }
  };
  walk(dir);
  return `${count}:${newest}`;
}

const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';
const stamp = ['v2', withNode ? 'node' : 'nonode', process.version, dirStamp(path.join(root, 'core')), dirStamp(path.join(root, 'host'))].join('|');
const stampPath = path.join(out, '.stamp');
const info = path.join(root, 'src', 'build-info.json');
if (fs.existsSync(stampPath) && fs.readFileSync(stampPath, 'utf8') === stamp && (!withNode || fs.existsSync(path.join(out, nodeName)))) {
  if (fs.existsSync(info)) fs.copyFileSync(info, path.join(out, 'build-info.json'));
  console.log('[sidecar] Up to date');
  process.exit(0);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(path.join(root, 'core'), path.join(out, 'core'), { recursive: true });
fs.cpSync(path.join(root, 'host'), path.join(out, 'host'), { recursive: true });
if (fs.existsSync(info)) fs.copyFileSync(info, path.join(out, 'build-info.json'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify({ name: pkg.name, version: pkg.version, private: true }));
if (withNode) {
  fs.copyFileSync(process.execPath, path.join(out, nodeName));
  console.log(`[sidecar] Staged core, host and ${nodeName}`);
} else {
  console.log('[sidecar] Staged core and host');
}
fs.writeFileSync(stampPath, stamp);
