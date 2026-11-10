// Builds every icon from the two drawings in assets/.
//   assets/app-icon.svg  → src-tauri/icons/* (program, installer, taskbar), assets/app-icon.ico|png, public/icon.svg
//   assets/file-icon.svg → assets/file-icon.ico|png (saved .myalgo project files)
//   node scripts/icons.mjs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'assets');
const tauri = path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');

function render(svg, outDir) {
  const result = spawnSync(process.execPath, [tauri, 'icon', path.join(assets, svg), '-o', outDir], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

render('app-icon.svg', path.join(root, 'src-tauri', 'icons'));
fs.copyFileSync(path.join(root, 'src-tauri', 'icons', 'icon.ico'), path.join(assets, 'app-icon.ico'));
fs.copyFileSync(path.join(root, 'src-tauri', 'icons', 'icon.png'), path.join(assets, 'app-icon.png'));
fs.copyFileSync(path.join(assets, 'app-icon.svg'), path.join(root, 'public', 'icon.svg'));

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'myalgosim-icons-'));
try {
  render('file-icon.svg', scratch);
  fs.copyFileSync(path.join(scratch, 'icon.ico'), path.join(assets, 'file-icon.ico'));
  fs.copyFileSync(path.join(scratch, 'icon.png'), path.join(assets, 'file-icon.png'));
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
console.log('아이콘을 만들었습니다: src-tauri/icons, assets/app-icon.*, assets/file-icon.*, public/icon.svg');
