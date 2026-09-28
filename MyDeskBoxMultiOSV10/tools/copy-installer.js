'use strict';

// electron-builder 가 dist 에 만든 설치 파일 하나를 프로젝트 루트로 복사한다.
// 블록맵이나 압축 풀린 폴더는 설치 파일이 아니므로 고르지 않는다.

const fs = require('fs');
const path = require('path');

const PREFER = {
  win32: ['.exe'],
  darwin: ['.dmg'],
  linux: ['.deb'],
};

function isInstaller(name, extensions) {
  if (name.endsWith('.blockmap')) return false;
  return extensions.some((ext) => name.toLowerCase().endsWith(ext));
}

function pickInstaller(names, platform) {
  const extensions = PREFER[platform] || ['.exe'];
  const found = names.filter((name) => isInstaller(name, extensions));
  if (!found.length) return null;
  const setup = found.filter((name) => /setup/i.test(name));
  const pool = setup.length ? setup : found;
  return pool.slice().sort((a, b) => a.localeCompare(b)).at(-1);
}

function copyInstaller({ dist, root, platform }) {
  const names = fs.readdirSync(dist, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
  const name = pickInstaller(names, platform);
  if (!name) {
    throw new Error('dist 에서 설치 파일을 찾지 못했습니다.');
  }
  const from = path.join(dist, name);
  const to = path.join(root, name);
  fs.copyFileSync(from, to);
  return { name, from, to };
}

function main() {
  const root = path.join(__dirname, '..');
  try {
    const copied = copyInstaller({
      dist: path.join(root, 'dist'),
      root,
      platform: process.platform,
    });
    console.log(`설치 파일을 루트로 복사했습니다. ${copied.name}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { pickInstaller, copyInstaller };
