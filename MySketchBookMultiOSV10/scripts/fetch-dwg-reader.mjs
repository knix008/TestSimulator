// Optional DWG reader for Import › Floor plan: LibreDWG compiled to WebAssembly (@mlightcad/libredwg-web),
// copied into library/dwg/ where src/io/plan-dwg.js loads it on demand (offline, only when a DWG is opened).
//
//   node scripts/fetch-dwg-reader.mjs --accept-gpl
//
// LICENSE: LibreDWG and @mlightcad/libredwg-web are GPL-3.0. They are NOT a dependency of MySketchBook and
// are not in package.json. Putting them into library/ means they ship with a build (library/ becomes installer
// resources / is copied next to the web build), and distributing the app together with a GPL-3.0 component
// may require distributing the whole app under GPL-3.0-compatible terms. Decide that before shipping;
// for your own use on your own machine it is fine. The alternative that keeps the app free of GPL code is a
// converter installed by the user (ODA File Converter, free; or LibreDWG's dwg2dxf), which the desktop app
// runs as a separate program (src-tauri/src/dwg.rs).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '0.8.7'; // ~11 MB wasm, ~0.1 MB glue
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'library', 'dwg');

if (!process.argv.includes('--accept-gpl')) {
  console.log('LibreDWG (WebAssembly) is GPL-3.0 licensed. Read the notice at the top of this script, then run:\n  node scripts/fetch-dwg-reader.mjs --accept-gpl');
  process.exit(1);
}
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'msk-libredwg-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const pack = spawnSync(npm, ['pack', `@mlightcad/libredwg-web@${VERSION}`, '--silent'], { cwd: work, encoding: 'utf8', shell: process.platform === 'win32' });
if (pack.status !== 0) { console.error(pack.stderr || 'npm pack failed'); process.exit(1); }
const tgz = path.join(work, pack.stdout.trim().split(/\r?\n/).at(-1));
const untar = spawnSync('tar', ['xzf', tgz, '-C', work], { encoding: 'utf8' });
if (untar.status !== 0) { console.error(untar.stderr || 'tar failed'); process.exit(1); }
fs.mkdirSync(target, { recursive: true });
for (const file of ['libredwg-web.js', 'libredwg-web.wasm']) fs.copyFileSync(path.join(work, 'package', 'wasm', file), path.join(target, file));
fs.writeFileSync(path.join(target, 'NOTICE.txt'), `@mlightcad/libredwg-web ${VERSION} (LibreDWG compiled to WebAssembly), GPL-3.0.\nhttps://github.com/mlightcad/libredwg-web — https://www.gnu.org/software/libredwg/\nInstalled by scripts/fetch-dwg-reader.mjs; loaded by src/io/plan-dwg.js only when a DWG is imported.\n`);
fs.rmSync(work, { recursive: true, force: true });
console.log(`DWG reader installed in ${path.relative(root, target)} (GPL-3.0 — see NOTICE.txt).`);
