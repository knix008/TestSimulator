/**
 * Windows에서 electron-builder winCodeSign 캐시 준비.
 * macOS용 dylib 심볼릭 링크 때문에 일반 사용자 권한으로 7z 해제가 실패하는 문제를 우회합니다.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const https = require('https');
const path = require('path');
const os = require('os');

const VERSION = '2.6.0';
const CACHE_ROOT = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'electron-builder',
  'Cache',
  'winCodeSign'
);
const TARGET_DIR = path.join(CACHE_ROOT, `winCodeSign-${VERSION}`);
const ARCHIVE = path.join(CACHE_ROOT, `winCodeSign-${VERSION}.7z`);
const URL = `https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-${VERSION}/winCodeSign-${VERSION}.7z`;
const SEVEN_ZA = path.join(
  __dirname,
  '..',
  'node_modules',
  '7zip-bin',
  'win',
  'x64',
  '7za.exe'
);

function log(msg) {
  console.log(`[prepare-win-codesign] ${msg}`);
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = (u, redirects = 0) => {
      https
        .get(u, (res) => {
          if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
            if (redirects > 5) return reject(new Error('Too many redirects'));
            res.resume();
            return get(res.headers.location, redirects + 1);
          }
          if (res.statusCode !== 200) {
            file.close();
            fs.unlinkSync(dest);
            return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          }
          res.pipe(file);
          file.on('finish', () => file.close(() => resolve()));
        })
        .on('error', (err) => {
          file.close();
          try { fs.unlinkSync(dest); } catch (_) {}
          reject(err);
        });
    };
    get(url);
  });
}

function isCacheReady() {
  return (
    fs.existsSync(path.join(TARGET_DIR, 'rcedit-x64.exe')) &&
    fs.existsSync(path.join(TARGET_DIR, 'windows-10'))
  );
}

function fixDarwinSymlinks() {
  const libDir = path.join(TARGET_DIR, 'darwin', '10.12', 'lib');
  if (!fs.existsSync(libDir)) return;

  const pairs = [
    ['libcrypto.1.0.0.dylib', 'libcrypto.dylib'],
    ['libssl.1.0.0.dylib', 'libssl.dylib'],
  ];

  for (const [srcName, linkName] of pairs) {
    const src = path.join(libDir, srcName);
    const dest = path.join(libDir, linkName);
    if (!fs.existsSync(src)) continue;
    if (fs.existsSync(dest)) {
      try {
        const st = fs.lstatSync(dest);
        if (st.isSymbolicLink() || st.size > 0) continue;
      } catch (_) {}
      try { fs.unlinkSync(dest); } catch (_) {}
    }
    fs.copyFileSync(src, dest);
    log(`Copied ${srcName} -> ${linkName}`);
  }
}

async function main() {
  if (process.platform !== 'win32') {
    log('Not Windows — skip');
    return;
  }

  if (isCacheReady()) {
    fixDarwinSymlinks();
    log(`Cache ready: ${TARGET_DIR}`);
    return;
  }

  fs.mkdirSync(CACHE_ROOT, { recursive: true });

  if (!fs.existsSync(ARCHIVE) || fs.statSync(ARCHIVE).size < 1000) {
    log(`Downloading ${URL}`);
    await download(URL, ARCHIVE);
  }

  if (fs.existsSync(TARGET_DIR)) {
    fs.rmSync(TARGET_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TARGET_DIR, { recursive: true });

  if (!fs.existsSync(SEVEN_ZA)) {
    throw new Error(`7za not found: ${SEVEN_ZA}`);
  }

  log(`Extracting to ${TARGET_DIR}`);
  // -snl: 심볼릭 링크 생성 실패를 허용(가능한 파일은 모두 해제)
  const result = spawnSync(
    SEVEN_ZA,
    ['x', '-bd', '-y', `-o${TARGET_DIR}`, ARCHIVE],
    { encoding: 'utf8' }
  );

  // exit 2 = 경고(심볼릭 링크 실패 포함). Windows 도구만 있으면 빌드에 충분.
  if (result.status !== 0 && result.status !== 2) {
    console.error(result.stdout || '');
    console.error(result.stderr || '');
    throw new Error(`7za failed with exit code ${result.status}`);
  }

  fixDarwinSymlinks();

  if (!isCacheReady()) {
    throw new Error('winCodeSign cache extraction incomplete (rcedit/windows-10 missing)');
  }

  log('winCodeSign cache prepared successfully');
}

main().catch((err) => {
  console.error(`[prepare-win-codesign] ${err.message}`);
  process.exit(1);
});
