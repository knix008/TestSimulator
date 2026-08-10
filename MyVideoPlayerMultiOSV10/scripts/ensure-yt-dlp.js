'use strict';

/**
 * Download a platform yt-dlp binary into vendor/yt-dlp for reliable YouTube saves.
 * Safe to re-run; skips when a large enough binary already exists.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const VENDOR = path.join(ROOT, 'vendor', 'yt-dlp');

function binaryName() {
  return process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
}

function downloadUrl() {
  const base = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';
  if (process.platform === 'win32') return `${base}/yt-dlp.exe`;
  if (process.platform === 'darwin') return `${base}/yt-dlp_macos`;
  return `${base}/yt-dlp`;
}

function fetchToFile(url, dest, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'MyVideoPlayer-yt-dlp-bootstrap' } }, (res) => {
      if (
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location &&
        redirectsLeft > 0
      ) {
        res.resume();
        fetchToFile(res.headers.location, dest, redirectsLeft - 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} downloading yt-dlp`));
        return;
      }
      const tmp = `${dest}.download`;
      const out = fs.createWriteStream(tmp);
      res.pipe(out);
      out.on('finish', () => {
        out.close(() => {
          try {
            fs.renameSync(tmp, dest);
            if (process.platform !== 'win32') {
              fs.chmodSync(dest, 0o755);
            }
            resolve(dest);
          } catch (err) {
            reject(err);
          }
        });
      });
      out.on('error', reject);
    });
    req.on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(VENDOR, { recursive: true });
  const dest = path.join(VENDOR, binaryName());
  if (fs.existsSync(dest)) {
    try {
      if (fs.statSync(dest).size > 500000) {
        // Quiet on the common "already present" path; log only when downloading.
        return;
      }
    } catch {
      /* re-download */
    }
  }

  const url = downloadUrl();
  console.log(`[ensure-yt-dlp] downloading ${url}`);
  await fetchToFile(url, dest);
  console.log(`[ensure-yt-dlp] saved ${dest}`);
}

main().catch((err) => {
  console.warn(`[ensure-yt-dlp] skipped: ${err.message || err}`);
  // Do not fail install/build — built-in youtubei.js remains as fallback.
  process.exit(0);
});
