/**
 * Ensures winCodeSign/rcedit-x64.exe exists for electron-builder on Windows.
 * Official 7z extract can fail (empty dir) when symlink creation is denied.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');

const VERSION = '2.6.0';
const CACHE = path.join(
  process.env.LOCALAPPDATA || '',
  'electron-builder',
  'Cache',
  'winCodeSign',
  `winCodeSign-${VERSION}`
);
const ARCHIVE = path.join(path.dirname(CACHE), `winCodeSign-${VERSION}.7z`);
const URL =
  `https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-${VERSION}/winCodeSign-${VERSION}.7z`;

function existsRcedit() {
  return fs.existsSync(path.join(CACHE, 'rcedit-x64.exe'));
}

function find7z() {
  const candidates = [
    path.join(process.env['ProgramFiles'] || '', '7-Zip', '7z.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', '7-Zip', '7z.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', '7-Zip', '7z.exe')
  ];
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = (u, redirects = 0) => {
      https
        .get(u, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
            res.resume();
            get(res.headers.location, redirects + 1);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`Download failed: HTTP ${res.statusCode}`));
            res.resume();
            return;
          }
          res.pipe(file);
          file.on('finish', () => file.close(() => resolve()));
        })
        .on('error', reject);
    };
    get(url);
  });
}

async function main() {
  if (process.platform !== 'win32') return;
  if (existsRcedit()) {
    console.log('[ensure-wincodesign] rcedit-x64.exe ready');
    return;
  }

  console.log('[ensure-wincodesign] repairing winCodeSign cache…');
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  if (fs.existsSync(CACHE)) {
    fs.rmSync(CACHE, { recursive: true, force: true });
  }
  fs.mkdirSync(CACHE, { recursive: true });

  if (!fs.existsSync(ARCHIVE) || fs.statSync(ARCHIVE).size < 1000) {
    console.log('[ensure-wincodesign] downloading', URL);
    await download(URL, ARCHIVE);
  }

  const seven = find7z();
  if (!seven) {
    console.error(
      '[ensure-wincodesign] 7-Zip not found. Install 7-Zip or enable Windows Developer Mode and re-run the build.'
    );
    process.exit(1);
  }

  const result = spawnSync(seven, ['x', ARCHIVE, `-o${CACHE}`, '-y'], { encoding: 'utf8' });
  // Symlink errors for darwin libs are OK if rcedit was extracted.
  if (!existsRcedit()) {
    console.error(result.stdout || '');
    console.error(result.stderr || '');
    console.error('[ensure-wincodesign] rcedit-x64.exe still missing after extract');
    process.exit(1);
  }
  console.log('[ensure-wincodesign] rcedit-x64.exe restored');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
