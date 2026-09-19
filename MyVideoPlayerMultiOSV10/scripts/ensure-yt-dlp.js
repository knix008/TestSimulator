'use strict';

/**
 * Ensure vendor/yt-dlp has a usable yt-dlp binary.
 *
 * Default (npm start / postinstall):
 *   - If a usable binary already exists → skip download
 *   - If missing/broken → download latest
 *
 * Build mode (`--latest` or MYVIDEOPLAYER_YTDLP_LATEST=1):
 *   - Compare local version to GitHub latest
 *   - Download only when missing or older than latest
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const VENDOR = path.join(ROOT, 'vendor', 'yt-dlp');
const UA = 'MyVideoPlayer-yt-dlp-bootstrap';

function binaryName() {
  return process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
}

function downloadUrl() {
  const base = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';
  if (process.platform === 'win32') return `${base}/yt-dlp.exe`;
  if (process.platform === 'darwin') return `${base}/yt-dlp_macos`;
  return `${base}/yt-dlp`;
}

function parseYtDlpVersion(text) {
  const m = String(text || '').match(/(\d{4})\.(\d{1,2})\.(\d{1,2})(?:\.(\d+))?/);
  if (!m) return null;
  const parts = [
    m[1],
    String(m[2]).padStart(2, '0'),
    String(m[3]).padStart(2, '0')
  ];
  if (m[4]) parts.push(String(m[4]).padStart(2, '0'));
  return parts.join('.');
}

function compareVersions(a, b) {
  const left = String(a || '').split('.').map((n) => Number(n) || 0);
  const right = String(b || '').split('.').map((n) => Number(n) || 0);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i++) {
    const d = (left[i] || 0) - (right[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

function readLocalVersion(dest) {
  try {
    if (!fs.existsSync(dest) || fs.statSync(dest).size < 500000) return null;
    const result = spawnSync(dest, ['--version'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000
    });
    if (result.status !== 0) return null;
    return parseYtDlpVersion(result.stdout || result.stderr || '');
  } catch {
    return null;
  }
}

function requestText(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          'User-Agent': UA,
          Accept: 'application/vnd.github+json'
        }
      },
      (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          redirectsLeft > 0
        ) {
          res.resume();
          requestText(res.headers.location, redirectsLeft - 1).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      }
    );
    req.on('error', reject);
  });
}

async function fetchLatestVersion() {
  const body = await requestText(
    'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest'
  );
  const json = JSON.parse(body);
  const version = parseYtDlpVersion(json.tag_name || json.name || '');
  if (!version) throw new Error('Could not parse yt-dlp latest version');
  return version;
}

function fetchToFile(url, dest, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': UA } }, (res) => {
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
            if (fs.existsSync(dest)) fs.unlinkSync(dest);
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

function wantLatestMode() {
  if (process.argv.includes('--latest')) return true;
  return ['1', 'true', 'yes'].includes(
    String(process.env.MYVIDEOPLAYER_YTDLP_LATEST || '').toLowerCase()
  );
}

function forceUpdate() {
  return ['1', 'true', 'yes'].includes(
    String(process.env.MYVIDEOPLAYER_UPDATE_YTDLP || '').toLowerCase()
  );
}

async function main() {
  fs.mkdirSync(VENDOR, { recursive: true });
  const dest = path.join(VENDOR, binaryName());
  const force = forceUpdate();
  const latestMode = wantLatestMode();
  const localVersion = readLocalVersion(dest);

  // npm start / postinstall: keep existing binary — download only when missing.
  if (!force && !latestMode && localVersion) {
    console.log(`[ensure-yt-dlp] using existing ${localVersion}`);
    return;
  }

  let latestVersion = null;
  if (latestMode || !localVersion) {
    try {
      latestVersion = await fetchLatestVersion();
    } catch (err) {
      if (localVersion) {
        console.warn(
          `[ensure-yt-dlp] keep existing ${localVersion} (latest check failed: ${err.message || err})`
        );
        return;
      }
      // Fall through and try downloading /latest/ anyway.
    }
  }

  if (
    !force &&
    localVersion &&
    latestVersion &&
    compareVersions(localVersion, latestVersion) >= 0
  ) {
    console.log(`[ensure-yt-dlp] already latest (${localVersion})`);
    return;
  }

  const url = downloadUrl();
  console.log(
    `[ensure-yt-dlp] downloading ${url}` +
      (localVersion || latestVersion
        ? ` (have ${localVersion || 'none'}, latest ${latestVersion || 'unknown'})`
        : '')
  );
  await fetchToFile(url, dest);
  const next = readLocalVersion(dest) || 'unknown';
  console.log(`[ensure-yt-dlp] saved ${dest} (${next})`);
}

main().catch((err) => {
  console.warn(`[ensure-yt-dlp] skipped: ${err.message || err}`);
  // Do not fail install/build — built-in youtubei.js remains as fallback.
  process.exit(0);
});
