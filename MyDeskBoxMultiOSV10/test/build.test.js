'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const nsh = fs.readFileSync(path.join(ROOT, 'build', 'installer.nsh'), 'utf8');

test('운영체제별 설치 파일 만들기 명령이 있다', () => {
  for (const name of ['build', 'build:win', 'build:mac', 'build:linux']) {
    assert.ok(pkg.scripts[name], `npm run ${name} 이 없다`);
    assert.match(pkg.scripts[name], /electron-builder/);
  }
  assert.ok(pkg.devDependencies['electron-builder'], 'electron-builder 가 없다');
});

test('세 운영체제의 묶음 종류를 모두 정해 두었다', () => {
  const kinds = (list) => list.map((entry) => entry.target);
  assert.deepEqual(kinds(pkg.build.win.target), ['nsis']);
  assert.deepEqual(kinds(pkg.build.mac.target), ['dmg', 'zip']);
  assert.deepEqual(kinds(pkg.build.linux.target), ['AppImage', 'deb']);
});

test('설치 파일도 프로그램과 같은 아이콘을 쓴다', () => {
  const appIcon = pkg.build.win.icon;
  assert.equal(appIcon, 'assets/icon.ico');
  for (const key of ['installerIcon', 'uninstallerIcon', 'installerHeaderIcon']) {
    assert.equal(pkg.build.nsis[key], appIcon, `${key} 가 프로그램 아이콘과 다르다`);
  }
  for (const file of [pkg.build.win.icon, pkg.build.mac.icon, pkg.build.linux.icon]) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} 가 없다`);
  }
});

test('설치할 때 언어를 고를 수 있다', () => {
  const { nsis } = pkg.build;
  assert.equal(nsis.multiLanguageInstaller, true);
  assert.equal(nsis.displayLanguageSelector, true);
  assert.deepEqual([...nsis.installerLanguages].sort(), ['en_US', 'ko_KR']);
});

test('바로 가기는 설치 프로그램이 마음대로 만들지 않는다', () => {
  const { nsis } = pkg.build;
  assert.equal(nsis.oneClick, false, '물어보려면 한 번에 끝내는 방식이면 안 된다');
  assert.equal(nsis.createDesktopShortcut, false);
  assert.equal(nsis.createStartMenuShortcut, false);
});

test('설치 스크립트가 바로 가기를 물어보고 만든다', () => {
  for (const macro of ['customInit', 'customPageAfterChangeDir', 'customInstall', 'customUnInstall']) {
    assert.match(nsh, new RegExp(`!macro\\s+${macro}\\b`), `${macro} 가 없다`);
  }
  assert.match(nsh, /Page custom ShortcutPageCreate ShortcutPageLeave/, '고르는 페이지가 없다');
  assert.match(nsh, /\$DESKTOP\\\$\{PRODUCT_FILENAME\}\.lnk/, '바탕화면 바로 가기를 만들지 않는다');
  assert.match(nsh, /\$SMPROGRAMS\\\$\{PRODUCT_FILENAME\}\.lnk/, '시작 메뉴 바로 가기를 만들지 않는다');
  // 고르지 않으면 지우고, 지울 때도 치운다.
  assert.equal((nsh.match(/Delete "\$DESKTOP/g) || []).length >= 2, true);
  assert.equal((nsh.match(/Delete "\$SMPROGRAMS/g) || []).length >= 2, true);
});

test('설치 스크립트의 글이 한국어와 영어 두 벌이다', () => {
  assert.match(nsh, /\$LANGUAGE == 1042/, '한국어를 가려내지 않는다');
  for (const word of ['바탕화면에 바로 가기 만들기', '시작 메뉴에 바로 가기 만들기']) {
    assert.ok(nsh.includes(word), `${word} 가 없다`);
  }
  for (const word of ['Create a shortcut on the desktop', 'Create a shortcut in the Start Menu']) {
    assert.ok(nsh.includes(word), `${word} 가 없다`);
  }
});

test('운영체제마다 다른 네이티브 파일은 묶음에서 풀어 둔다', () => {
  assert.ok(
    pkg.build.asarUnpack.some((glob) => glob.includes('koffi')),
    'koffi 를 풀어 두지 않으면 창이 뜨지 않는다'
  );
});

test('묶을 파일 목록에 실행에 필요한 것이 모두 있다', () => {
  for (const glob of ['src/**/*', 'assets/**/*', 'package.json']) {
    assert.ok(pkg.build.files.includes(glob), `${glob} 가 빠졌다`);
  }
});

test('설치할 때 예전 설정을 지울지 고를 수 있다', () => {
  assert.match(nsh, /Var WipeData/, '고른 값을 담을 자리가 없다');
  assert.match(nsh, /\$\{NSD_GetState\} \$WipeCheck \$WipeData/, '고른 값을 읽지 않는다');
  assert.ok(nsh.includes('RMDir /r "$APPDATA\\${PRODUCT_FILENAME}"'), '설정 폴더를 지우지 않는다');
  // 되돌릴 수 없는 일이므로 기본은 지우지 않기여야 한다.
  assert.match(nsh, /StrCpy \$WipeData 0/, '기본값이 지우기로 되어 있다');
  for (const word of ['예전 설정을 모두 지우고 새로 시작', 'Erase earlier settings and start fresh']) {
    assert.ok(nsh.includes(word), `${word} 가 없다`);
  }
});
