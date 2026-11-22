'use strict';

/**
 * `npm run clean` — 빌드 산출물을 지운다.
 *
 * 지우는 것: src-tauri/target(Rust 빌드 결과, 수 GB)·src-tauri/gen(Tauri 스키마),
 * Electron 판이 남겼을 수 있는 옛 dist/release/out 폴더, 프로젝트 루트로 복사된 설치 파일.
 * 지우지 않는 것: 소스·설정, 그리고 asset/·src-tauri/icons 의 아이콘
 * (git 에 들어 있고 빌드가 다시 만들어 주지 않는다).
 *
 * --all     node_modules 까지 지운다 (그 뒤에는 npm install 을 다시 해야 한다).
 * --dry-run 지우지 않고 목록만 보여 준다.
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || args.includes('-n');
const withModules = args.includes('--all');

const useColor =
  process.env.NO_COLOR === undefined && (process.env.FORCE_COLOR !== undefined || process.stdout.isTTY);
const paint = (code) => (text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : String(text));
const green = paint('32');
const grey = paint('90');
const cyan = paint('36');
const yellow = paint('33');
const bold = paint('1');

/** 빌드가 다시 만들어 주는 폴더 */
const DIRS = ['src-tauri/target', 'src-tauri/gen', 'dist', 'release', 'out'];

/** 루트로 복사된 설치 파일 (scripts/copy-installer-to-root.js, .gitignore 와 같은 이름) */
const INSTALLER_PATTERNS = [
  /^MyMemoPad-Setup-.*\.exe(\.blockmap)?$/i,
  /^MyMemoPad-.*\.dmg$/i,
  /^MyMemoPad-.*\.AppImage$/i,
  /^MyMemoPad_.*\.deb$/i,
  /^MyMemoPad-.*-(mac|win)\.zip$/i
];

function dirSize(target) {
  let total = 0;
  const stack = [target];
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
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)}GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${bytes}B`;
}

function collect() {
  const targets = DIRS.filter((rel) => fs.existsSync(path.join(root, rel)));
  for (const name of fs.readdirSync(root)) {
    if (INSTALLER_PATTERNS.some((re) => re.test(name))) targets.push(name);
  }
  if (withModules && fs.existsSync(path.join(root, 'node_modules'))) targets.push('node_modules');
  return targets;
}

function remove(rel) {
  const at = path.resolve(root, rel);
  // 프로젝트 밖은 절대 건드리지 않는다.
  if (!at.startsWith(root + path.sep)) throw new Error(`프로젝트 밖의 경로: ${rel}`);
  fs.rmSync(at, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}

function main() {
  const targets = collect();
  if (!targets.length) {
    console.log(`${green('+')} 지울 빌드 산출물이 없습니다. ${grey('(이미 깨끗합니다)')}`);
    return;
  }

  console.log(bold(dryRun ? '지울 것 (--dry-run, 실제로 지우지 않음)' : '빌드 산출물을 지웁니다'));
  let freed = 0;
  let failed = 0;
  for (const rel of targets) {
    const size = dirSize(path.join(root, rel));
    try {
      if (!dryRun) remove(rel);
      freed += size;
      console.log(`  ${dryRun ? yellow('-') : green('x')} ${rel} ${grey(human(size))}`);
    } catch (err) {
      failed += 1;
      console.log(`  ${yellow('!')} ${rel} ${grey(`지우지 못했습니다: ${err.code || err.message} (실행 중인 앱이 파일을 잡고 있을 수 있습니다)`)}`);
    }
  }

  const summary = `${targets.length - failed}개 항목 · ${human(freed)}`;
  console.log(dryRun ? `${yellow('~')} ${summary} ${grey('(지우지 않았습니다)')}` : `${cyan('=')} ${summary} 정리했습니다.`);
  if (failed) process.exitCode = 1;
}

main();
