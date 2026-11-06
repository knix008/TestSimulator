// Builds the program that goes in front of a self-extracting archive and puts it where the
// installer picks it up. `node scripts/build-sfx.mjs debug` leaves it beside the debug app instead.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const debug = process.argv[2] === 'debug';
const args = ['build', '-p', 'zipmaster-core', '--bin', 'zipmaster-sfx'];
if (!debug) args.push('--release');
const r = spawnSync('cargo', args, { cwd: root, stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);

const name = process.platform === 'win32' ? 'zipmaster-sfx.exe' : 'zipmaster-sfx';
const built = path.join(root, 'target', debug ? 'debug' : 'release', name);
// The bundler needs the folder to hold something even for a debug build.
const dir = path.join(root, 'src-tauri', 'resources', 'sfx');
fs.mkdirSync(dir, { recursive: true });
fs.copyFileSync(built, path.join(dir, name));
console.log(`[sfx] ${(fs.statSync(built).size / 1048576).toFixed(1)} MB`);
