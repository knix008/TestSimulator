/**
 * stage-runtime.js — the programs the installed app runs beside itself, gathered into
 * src-tauri/runtime/ (bundled as a resource, see tauri.conf.json):
 *
 *   node scripts/stage-runtime.js        (run by build:win / build:mac / build:linux)
 *
 *   runtime/ffmpeg(.exe)       converts media the webview cannot play, reads media facts
 *                              (ffmpeg-static: the build of the OS this runs on)
 *   runtime/rembg_worker.py    AI background removal (run with the user's Python)
 *
 * Everything else the host does is in the app itself (src-tauri/src/host/).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'src-tauri', 'runtime');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
// Keeps the folder in git, so tauri-build finds the resource on a fresh clone
fs.writeFileSync(path.join(OUT, '.gitkeep'), '');

let ffmpeg;
try { ffmpeg = require('ffmpeg-static'); } catch { /* not installed */ }
if (!ffmpeg || !fs.existsSync(ffmpeg)) {
  console.error('[stage-runtime] ffmpeg-static has no binary for this OS — run npm install');
  process.exit(1);
}
const ffmpegName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
fs.copyFileSync(ffmpeg, path.join(OUT, ffmpegName));
if (process.platform !== 'win32') fs.chmodSync(path.join(OUT, ffmpegName), 0o755);
fs.copyFileSync(path.join(ROOT, 'scripts', 'rembg_worker.py'), path.join(OUT, 'rembg_worker.py'));

const mb = (fs.statSync(path.join(OUT, ffmpegName)).size / 1048576).toFixed(1);
console.log(`[stage-runtime] ${ffmpegName} (${mb} MB) + rembg_worker.py → src-tauri/runtime`);
