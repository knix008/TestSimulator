'use strict';

/**
 * `npm run clean` — 빌드 산출물을 지운다.
 *
 * 지우는 것: dist/release/out 폴더, 프로젝트 루트로 복사된 설치 파일,
 * `npm run icons` 가 만드는 아이콘들(원본은 asset/icon.svg 하나뿐이다).
 * 지우지 않는 것: node_modules, 소스, 설정 파일. 되살릴 수 없는 것은 건드리지 않는다.
 *
 * --all 을 주면 node_modules 까지 지운다 (그때는 npm install 을 다시 해야 한다).
 * --dry-run 을 주면 지우지 않고 목록만 보여 준다.
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || args.includes('-n');
const withModules = args.includes('--all');

const useColor =
  process.env.NO_COLOR === undefined && (process.env.FORCE_COLOR !== undefined || process.stdout.isTTY);
const paint = (code) => (text) => (useColor ? `[${code}m${text}[0m` : String(text));
const green = paint('32');
const grey = paint('90');
const cyan = paint('36');
const yellow = paint('33');
const bold = paint('1');

/** 지울 폴더 — 전부 빌드가 다시 만들어 주는 것들. */
const DIRS = ['dist', 'release', 'out', 'asset/icons'];

/** 지울 파일 — 생성된 아이콘과 루트로 복사된 설치 파일. */
const FILES = [
  'build/icon.ico',
  'asset/icon.ico',
  'asset/icon.png',
  'asset/icon-256.png',
  'asset/icon-1024.png',
  'asset/icon-master.png',
  'src/favicon.png'
];

/** 루트에 떨어지는 설치 파일 (scripts/copy-installer-to-root.js) */
const INSTALLER_PATTERNS = [
  /^MyClock-Setup-.*\.exe$/i,
  /^MyClock-.*\.dmg$/i,
  /^MyClock-.*\.AppImage$/i,
  /^MyClock_.*\.deb$/i,
  /^MyClock-.*-(mac|win)\.zip$/i,
  /^MyClock-Setup-.*\.exe\.blockmap$/i
];

function dirSize(target) {
  let total = 0;
  let stack = [target];
  while (stack.length) {
    const at = stack.pop();
    let stat;
    try {
      stat = fs.lstatSync(at);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(at)) stack.push(path.join(at, name));
    } else {
      total += stat.size;
    }
  }
  return total;
}

function human(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${bytes}B`;
}

function collect() {
  const targets = [];

  for (const rel of DIRS) {
    const at = path.join(root, rel);
    if (fs.existsSync(at)) targets.push(rel);
  }
  for (const rel of FILES) {
    const at = path.join(root, rel);
    if (fs.existsSync(at)) targets.push(rel);
  }
  for (const name of fs.readdirSync(root)) {
    if (INSTALLER_PATTERNS.some((re) => re.test(name))) targets.push(name);
  }
  if (withModules && fs.existsSync(path.join(root, 'node_modules'))) targets.push('node_modules');

  return targets;
}

function remove(rel) {
  const at = path.join(root, rel);
  // 프로젝트 밖은 절대 건드리지 않는다.
  if (!at.startsWith(root + path.sep)) throw new Error(`프로젝트 밖의 경로: ${rel}`);
  fs.rmSync(at, { recursive: true, force: true });
}

function main() {
  const targets = collect();

  if (!targets.length) {
    console.log(`${green('+')} 지울 빌드 산출물이 없습니다. ${grey('(이미 깨끗합니다)')}`);
    return;
  }

  console.log(bold(dryRun ? '지울 것 (--dry-run, 실제로 지우지 않음)' : '빌드 산출물을 지웁니다'));
  let freed = 0;
  for (const rel of targets) {
    const size = dirSize(path.join(root, rel));
    freed += size;
    if (!dryRun) remove(rel);
    console.log(`  ${dryRun ? yellow('-') : green('x')} ${rel} ${grey(human(size))}`);
  }

  const summary = `${targets.length}개 항목 · ${human(freed)}`;
  console.log(dryRun ? `${yellow('~')} ${summary} ${grey('(지우지 않았습니다)')}` : `${cyan('=')} ${summary} 정리했습니다.`);
}

main();
