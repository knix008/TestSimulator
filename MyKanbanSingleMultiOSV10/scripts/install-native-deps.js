/**
 * install-native-deps.js — 네이티브 모듈 prebuild 바이너리 설치
 *
 * sqlite3는 N-API prebuild를 사용합니다. node-gyp 재빌드는
 * Visual Studio 2026 등 최신 환경에서 실패할 수 있으므로 prebuild만 시도합니다.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SQLITE3_DIR = path.join(ROOT, 'node_modules', 'sqlite3');

function hasSqliteBinary() {
  const candidates = [
    path.join(SQLITE3_DIR, 'build', 'Release', 'node_sqlite3.node'),
    path.join(SQLITE3_DIR, 'build', 'Debug', 'node_sqlite3.node'),
  ];
  return candidates.some((p) => fs.existsSync(p));
}

function installSqlitePrebuild() {
  if (!fs.existsSync(SQLITE3_DIR)) {
    console.log('[install-native-deps] sqlite3 not installed, skipping.');
    return;
  }

  if (hasSqliteBinary()) {
    console.log('[install-native-deps] sqlite3 prebuild already present.');
    return;
  }

  console.log('[install-native-deps] Installing sqlite3 prebuild binary...');
  execSync('npx prebuild-install -r napi', {
    cwd: SQLITE3_DIR,
    stdio: 'inherit',
    env: process.env,
  });

  if (!hasSqliteBinary()) {
    throw new Error('sqlite3 prebuild binary was not installed.');
  }

  console.log('[install-native-deps] sqlite3 prebuild installed.');
}

try {
  installSqlitePrebuild();
} catch (err) {
  console.error('[install-native-deps] Failed:', err.message);
  process.exit(1);
}
