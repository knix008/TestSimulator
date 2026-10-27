'use strict';

/**
 * Helper programs the app bundles (tauri.conf.json → bundle.resources):
 *   vendor/yt-dlp/yt-dlp(.exe) — via ensure-yt-dlp.js (pass --latest to update before a build)
 *   vendor/ffmpeg/ffmpeg(.exe) — copied from the ffmpeg-static npm package
 *   vendor/deno/deno(.exe)     — JavaScript runtime yt-dlp needs for YouTube's signature
 *                                challenge, so users do not have to install Node.js
 *
 * Runs as Tauri's beforeDevCommand / beforeBuildCommand, so `npm start` and the build:* scripts
 * never start without them (a missing yt-dlp is why YouTube downloads failed).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const IS_WIN = process.platform === 'win32';
const FFMPEG_DIR = path.join(ROOT, 'vendor', 'ffmpeg');
const FFMPEG_NAME = IS_WIN ? 'ffmpeg.exe' : 'ffmpeg';
const DENO_DIR = path.join(ROOT, 'vendor', 'deno');
const DENO_NAME = IS_WIN ? 'deno.exe' : 'deno';

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
  if (!IS_WIN) fs.chmodSync(dest, 0o755);
  console.log(`[ensure-tools] ffmpeg → ${path.relative(ROOT, dest)} (${(srcStat.size / 1048576).toFixed(1)} MB)`);
}

/** Release asset for this machine (https://github.com/denoland/deno/releases). */
function denoAsset() {
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
  if (IS_WIN) return 'deno-x86_64-pc-windows-msvc.zip';
  if (process.platform === 'darwin') return `deno-${arch}-apple-darwin.zip`;
  return `deno-${arch}-unknown-linux-gnu.zip`;
}

function denoVersion(bin) {
  const r = spawnSync(bin, ['--version'], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? (r.stdout.match(/deno (\S+)/) || [])[1] || null : null;
}

function unzip(zip, dir) {
  // bsdtar (Windows 10+, macOS) reads zip files; Linux usually has unzip.
  const attempts = IS_WIN
    ? [['tar', ['-xf', zip, '-C', dir]], ['powershell', ['-NoProfile', '-Command', `Expand-Archive -Force -LiteralPath '${zip}' -DestinationPath '${dir}'`]]]
    : [['unzip', ['-o', zip, '-d', dir]], ['tar', ['-xf', zip, '-C', dir]]];
  for (const [cmd, args] of attempts) {
    const r = spawnSync(cmd, args, { stdio: 'ignore', windowsHide: true });
    if (r.status === 0) return true;
  }
  return false;
}

async function ensureDeno() {
  const dest = path.join(DENO_DIR, DENO_NAME);
  const latest = process.argv.includes('--latest') || process.env.MYVIDEOPLAYER_DENO_LATEST === '1';
  const have = fs.existsSync(dest) ? denoVersion(dest) : null;
  if (have && !latest) return;

  const base = 'https://github.com/denoland/deno/releases/latest/download';
  if (have && latest) {
    // Only download when GitHub has something newer.
    try {
      const res = await fetch('https://api.github.com/repos/denoland/deno/releases/latest', {
        headers: { 'User-Agent': 'MyVideoPlayer-build', Accept: 'application/vnd.github+json' }
      });
      const tag = res.ok ? String((await res.json()).tag_name || '').replace(/^v/, '') : '';
      if (!tag || tag === have) return;
    } catch {
      return; // offline: keep the copy we have
    }
  }

  const asset = denoAsset();
  console.log(`[ensure-tools] downloading ${base}/${asset}${have ? ` (have ${have})` : ''}`);
  let data;
  try {
    const res = await fetch(`${base}/${asset}`, { headers: { 'User-Agent': 'MyVideoPlayer-build' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    if (have) {
      console.warn(`[ensure-tools] deno download failed (${err.message}); keeping ${have}`);
      return;
    }
    console.error(`[ensure-tools] deno download failed: ${err.message}`);
    process.exit(1);
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-deno-'));
  const zip = path.join(work, asset);
  fs.writeFileSync(zip, data);
  if (!unzip(zip, work) || !fs.existsSync(path.join(work, DENO_NAME))) {
    console.error('[ensure-tools] could not unpack the deno archive');
    process.exit(1);
  }
  fs.mkdirSync(DENO_DIR, { recursive: true });
  fs.copyFileSync(path.join(work, DENO_NAME), dest);
  if (!IS_WIN) fs.chmodSync(dest, 0o755);
  fs.rmSync(work, { recursive: true, force: true });
  const version = denoVersion(dest);
  if (!version) {
    console.error('[ensure-tools] downloaded deno does not run');
    process.exit(1);
  }
  console.log(`[ensure-tools] deno ${version} → ${path.relative(ROOT, dest)} (${(fs.statSync(dest).size / 1048576).toFixed(1)} MB)`);
}

(async () => {
  ensureYtDlp();
  ensureFfmpeg();
  await ensureDeno();
})();
