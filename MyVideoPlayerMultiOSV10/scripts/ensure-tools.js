'use strict';

/**
 * Helper programs the app bundles (tauri.conf.json → bundle.resources):
 *   vendor/yt-dlp/yt-dlp(.exe) — via ensure-yt-dlp.js (pass --latest to update before a build)
 *   vendor/ffmpeg/ffmpeg(.exe) — copied from the ffmpeg-static npm package
 *
 * Runs as Tauri's beforeDevCommand / beforeBuildCommand, so `npm start` and the build:* scripts
 * never start without them (a missing yt-dlp is why YouTube downloads failed).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FFMPEG_DIR = path.join(ROOT, 'vendor', 'ffmpeg');
const FFMPEG_NAME = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

function ensureYtDlp() {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'ensure-yt-dlp.js'), ...process.argv.slice(2)], {
    cwd: ROOT,
    stdio: 'inherit'
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function ensureFfmpeg() {
  const dest = path.join(FFMPEG_DIR, FFMPEG_NAME);
  let source = null;
  try {
    source = require('ffmpeg-static');
  } catch {
    source = null;
  }
  if (!source || !fs.existsSync(source)) {
    if (fs.existsSync(dest)) return;
    console.error('[ensure-tools] ffmpeg-static is missing — run `npm install` first.');
    process.exit(1);
  }
  const srcStat = fs.statSync(source);
  if (fs.existsSync(dest) && fs.statSync(dest).size === srcStat.size) return;
  fs.mkdirSync(FFMPEG_DIR, { recursive: true });
  fs.copyFileSync(source, dest);
  if (process.platform !== 'win32') fs.chmodSync(dest, 0o755);
  console.log(`[ensure-tools] ffmpeg → ${path.relative(ROOT, dest)} (${(srcStat.size / 1048576).toFixed(1)} MB)`);
}

ensureYtDlp();
ensureFfmpeg();
