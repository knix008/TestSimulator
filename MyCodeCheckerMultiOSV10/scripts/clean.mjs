// npm run clean     — web and installer build output.
// npm run clean:all — that, plus node_modules and the tutorial video.
// Neither touches the workspace (AppData / Application Support / MCC_USER_DATA).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const DIRS = [
  'dist',
  'build',
  '.vite',
  path.join('src-tauri', 'target'),
  path.join('src-tauri', 'gen'),
  path.join('src-tauri', 'icons'),
  path.join('src-tauri', 'sidecar'),
  path.join('ide', 'vscode', 'dist'),
];

const ALL_DIRS = ['node_modules', path.join('docs', 'video'), 'coverage'];
const ALL_FILES = ['.eslintcache'];

const ROOT_INSTALLER = /\.(exe|msi|dmg|deb|AppImage)$/i;
const ROOT_MEDIA = /\.(mp4|webm)$/i;

/** Delete generated build folders and installers copied to the project root. */
export function cleanBuild(projectRoot) {
  const removed = [];
  for (const rel of DIRS) {
    const dir = path.join(projectRoot, rel);
    if (!fs.existsSync(dir)) continue;
    fs.rmSync(dir, { recursive: true, force: true });
    removed.push(dir);
  }
  for (const name of fs.readdirSync(projectRoot)) {
    const full = path.join(projectRoot, name);
    let stat;
    try { stat = fs.lstatSync(full); } catch { continue; }
    if (stat.isSymbolicLink()) continue;
    const installer = (stat.isDirectory() && name.endsWith('.app')) || (stat.isFile() && ROOT_INSTALLER.test(name));
    if (!installer) continue;
    fs.rmSync(full, { recursive: true, force: true });
    removed.push(full);
  }
  return removed;
}

function removeRel(projectRoot, rel, removed) {
  const full = path.join(projectRoot, rel);
  if (!fs.existsSync(full)) return;
  fs.rmSync(full, { recursive: true, force: true });
  removed.push(full);
}

/** clean, then dependencies and generated tutorial video. */
export function cleanAll(projectRoot) {
  const removed = cleanBuild(projectRoot);
  for (const rel of ALL_DIRS) removeRel(projectRoot, rel, removed);
  for (const rel of ALL_FILES) removeRel(projectRoot, rel, removed);
  for (const name of fs.readdirSync(projectRoot)) {
    if (!ROOT_MEDIA.test(name)) continue;
    const full = path.join(projectRoot, name);
    let stat;
    try { stat = fs.lstatSync(full); } catch { continue; }
    if (!stat.isFile()) continue;
    fs.rmSync(full, { force: true });
    removed.push(full);
  }
  return removed;
}

function main() {
  const all = process.argv.includes('--all');
  const removed = (all ? cleanAll : cleanBuild)(root);
  const tag = all ? 'clean:all' : 'clean';
  if (!removed.length) console.log(`[${tag}] Nothing to remove.`);
  else for (const file of removed) console.log(`[${tag}] removed ${path.relative(root, file)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
