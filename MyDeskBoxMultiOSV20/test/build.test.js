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
    assert.match(pkg.scripts[name], /tools\/copy-installer\.js/, '설치 파일을 루트로 복사하지 않는다');
  }
  assert.ok(pkg.devDependencies['electron-builder'], 'electron-builder 가 없다');
});

test('설치 파일 하나만 루트로 복사한다', () => {
  const os = require('node:os');
  const { pickInstaller, copyInstaller } = require('../tools/copy-installer');
  assert.equal(
    pickInstaller(['MyDeskBox-Setup-1.0.0-x64.exe', 'MyDeskBox-Setup-1.0.0-x64.exe.blockmap', 'builder-debug.yml'], 'win32'),
    'MyDeskBox-Setup-1.0.0-x64.exe'
  );
  assert.equal(pickInstaller(['MyDeskBox-1.0.0-x64.dmg', 'MyDeskBox-1.0.0-x64.zip'], 'darwin'), 'MyDeskBox-1.0.0-x64.dmg');
  assert.equal(pickInstaller(['MyDeskBox-1.0.0-x64.AppImage', 'MyDeskBox-1.0.0-x64.deb'], 'linux'), 'MyDeskBox-1.0.0-x64.deb');

  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-dist-'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-root-'));
  fs.writeFileSync(path.join(dist, 'MyDeskBox-Setup-1.0.0-x64.exe'), 'installer');
  fs.writeFileSync(path.join(dist, 'MyDeskBox-Setup-1.0.0-x64.exe.blockmap'), 'map');
  const copied = copyInstaller({ dist, root, platform: 'win32' });
  assert.equal(copied.name, 'MyDeskBox-Setup-1.0.0-x64.exe');
  assert.equal(fs.readFileSync(path.join(root, copied.name), 'utf8'), 'installer');
  assert.equal(fs.readdirSync(root).length, 1);
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
  assert.match(nsh, /un\.RestoreHeld/, '지울 때 박스에 둔 파일을 되돌리지 않는다');
  assert.match(nsh, /mydeskbox\\held/, '보관 폴더를 찾지 않는다');
});

test('지울 때 시작프로그램 자리도 함께 치운다', () => {
  const RUN = 'Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  assert.ok(nsh.includes(`DeleteRegValue HKCU "${RUN}" "\${PRODUCT_FILENAME}"`), '시작프로그램 자리를 치우지 않는다');
  // 이름을 적어 주기 전 판은 AppUserModelId 로 적었다. 그것도 함께 치운다.
  assert.ok(nsh.includes(`DeleteRegValue HKCU "${RUN}" "${pkg.build.appId}"`), '예전 판이 남긴 자리를 치우지 않는다');
  // 앱이 적는 이름과 제거 프로그램이 찾는 이름이 같아야 한다.
  const autostart = fs.readFileSync(path.join(ROOT, 'src', 'main', 'autostart.js'), 'utf8');
  assert.ok(autostart.includes(`'${pkg.productName}'`), '앱이 적는 이름이 제품 이름과 다르다');
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

test('이미 깔려 있으면 예전 설정을 지울지 묻지 않는다', () => {
  assert.match(nsh, /Var HasOldApp/, '이미 깔렸는지 담을 자리가 없다');
  assert.match(
    nsh,
    /ReadRegStr \$R0 SHELL_CONTEXT "\$\{INSTALL_REGISTRY_KEY\}" InstallLocation/,
    '깔린 자리를 레지스트리에서 찾지 않는다'
  );
  // 지우는 칸은 깔려 있지 않을 때만 만든다.
  assert.match(nsh, /\$\{ElseIf\} \$R7 == 1\s+\$\{NSD_CreateCheckbox\}[^\r\n]*\$R5/, '지우는 칸을 늘 만든다');
  // 지우는 일에는 빗장을 두 겹으로 건다. 깔려 있으면 여기까지 와도 지우지 않는다.
  assert.match(
    nsh,
    /\$\{If\} \$WipeData == \$\{BST_CHECKED\}\s+\$\{AndIf\} \$HasOldApp == 0/,
    '깔려 있어도 설정을 지울 수 있다'
  );
  for (const word of ['이미 설치되어 있습니다', 'MyDeskBox is already installed']) {
    assert.ok(nsh.includes(word), `${word} 가 없다`);
  }
});

test('다시 깔 때 조용히 도는 제거 프로그램은 아무것도 건드리지 않는다', () => {
  // 설치 프로그램은 예전 제거 프로그램을 --updated 로 한 번 돌린다.
  // 그때 되돌리기를 하면 박스에 담아 둔 것이 바탕화면으로 쏟아진다.
  assert.match(nsh, /\$\{IfNot\} \$\{isUpdated\}/, '다시 까는 길을 가려내지 않는다');
  const guard = nsh.indexOf('${IfNot} ${isUpdated}');
  const restore = nsh.indexOf('Call un.RestoreHeld');
  assert.ok(guard >= 0 && restore > guard, '되돌리기가 빗장 밖에 있다');
});

test('설정을 지우기 전에 박스에 담긴 파일을 바탕화면으로 돌려준다', () => {
  assert.match(nsh, /Function RestoreBoxFiles/, '돌려주는 차례가 없다');
  assert.ok(nsh.includes('$APPDATA\\${PRODUCT_FILENAME}\\boxes'), '보관함을 찾지 않는다');
  assert.match(nsh, /Call RestoreBoxFiles\s+RMDir \/r/, '돌려주기 전에 지운다');
});

test('다시 깔 때는 지금 있는 바로 가기를 그대로 따라간다', () => {
  assert.match(
    nsh,
    /\$\{IfNot\} \$\{FileExists\} "\$DESKTOP\\\$\{PRODUCT_FILENAME\}\.lnk"\s+StrCpy \$MakeDesktop 0/,
    '지워 둔 바탕화면 바로 가기가 되살아난다'
  );
  assert.match(
    nsh,
    /\$\{IfNot\} \$\{FileExists\} "\$SMPROGRAMS\\\$\{PRODUCT_FILENAME\}\.lnk"\s+StrCpy \$MakeStartMenu 0/,
    '지워 둔 시작 메뉴 바로 가기가 되살아난다'
  );
});

// 프로그램을 지우면 바탕화면은 켜기 전 모습이어야 한다.
// 담아 둔 파일이 설정 폴더에 남거나, 감춘 휴지통이 감춰진 채로 남으면 안 된다.
test('지울 때 바탕화면을 되돌린다', () => {
  assert.match(nsh, /!macro customUnInit/, '파일을 지우기 전에 되돌리는 자리가 없다');
  assert.ok(
    nsh.includes('--restore-desktop'),
    '프로그램에게 되돌리라고 부르지 않는다'
  );
  // 실행 파일을 부르는 자리는 지우기 전(customUnInit)이어야 한다.
  const init = nsh.indexOf('!macro customUnInit');
  const call = nsh.indexOf('--restore-desktop', init);
  const end = nsh.indexOf('!macroend', init);
  assert.ok(call > init && call < end, '지운 뒤에 실행 파일을 부르려 한다');
});

test('프로그램이 되돌리지 못해도 파일과 휴지통은 손으로 되돌린다', () => {
  assert.match(nsh, /Function un\.RestoreBoxFiles/, '제거 프로그램 쪽 손 복구가 없다');
  assert.match(nsh, /Function un\.EmptyToDesktop/, '바탕화면으로 옮기는 차례가 없다');
  assert.match(nsh, /Function un\.ShowShellIcons/, '감춘 휴지통을 되살리지 않는다');
  // 휴지통 CLSID 는 windows.js 의 SHELL_CLSID 와 같아야 한다.
  const windows = fs.readFileSync(path.join(ROOT, 'src', 'main', 'desktop', 'windows.js'), 'utf8');
  for (const clsid of nsh.match(/\{[0-9A-Fa-f-]{36}\}/g) || []) {
    assert.ok(windows.includes(clsid), `windows.js 에 없는 아이콘을 되살리려 한다: ${clsid}`);
  }
  assert.ok(nsh.includes('{645FF040-5081-101B-9F08-00AA002F954E}'), '휴지통을 되살리지 않는다');
});

test('앱이 멈춘 뒤에 한 번 더 되돌린다', () => {
  // customUnInit 은 앱이 아직 돌고 있을 수 있다. 그 판이 감춘 것을 다시 감출 수 있으므로
  // 앱이 확실히 멈춘 뒤(customUnInstall)에 한 번 더 지나야 한다.
  const at = nsh.indexOf('!macro customUnInstall');
  assert.ok(at > 0);
  const end = nsh.indexOf('!macroend', at);
  const body = nsh.slice(at, end);
  assert.ok(body.includes('Call un.RestoreBoxFiles'), '마지막에 파일을 되돌리지 않는다');
  assert.ok(body.includes('Call un.ShowShellIcons'), '마지막에 휴지통을 되살리지 않는다');
});

test('다시 깔 때는 되돌릴지 물어본 뒤에 되돌린다', () => {
  const at = nsh.indexOf('!macro customInstall');
  assert.ok(at > 0);
  const end = nsh.indexOf('!macroend', at);
  const body = nsh.slice(at, end);
  assert.ok(body.includes('MessageBox MB_YESNO'), '묻지 않고 되돌린다');
  assert.ok(body.includes('--restore-desktop'), '되돌리는 길을 부르지 않는다');
  assert.ok(body.includes('$HasOldApp == 1'), '깔려 있지 않은데도 묻는다');
  assert.ok(body.includes('${IfNot} ${Silent}'), '조용히 설치하는데도 묻는다');
  assert.match(body, /boxes[\\]restore\.json/, '담아 둔 것이 있는지 보지 않는다');
});
