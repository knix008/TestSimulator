'use strict';

// 설치 파일 만들기 (Tauri). 설정 파일과 NSIS 훅(src-tauri/windows/hooks.nsh)을 글로 읽어 약속을 지키는지 본다.
// 실제 설치·제거는 사용자 컴퓨터를 바꾸므로 여기서는 돌리지 않는다.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TAURI = path.join(ROOT, 'src-tauri');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const conf = JSON.parse(fs.readFileSync(path.join(TAURI, 'tauri.conf.json'), 'utf8'));
const HOOKS = path.join(TAURI, 'windows', 'hooks.nsh');
const nsh = fs.readFileSync(HOOKS, 'utf8');

function macro(name) {
  const at = nsh.indexOf(`!macro ${name}`);
  assert.ok(at >= 0, `${name} is missing`);
  return nsh.slice(at, nsh.indexOf('!macroend', at));
}

function fn(name) {
  const at = nsh.indexOf(`Function ${name}\r\n`) >= 0 ? nsh.indexOf(`Function ${name}\r\n`) : nsh.indexOf(`Function ${name}\n`);
  assert.ok(at >= 0, `Function ${name} is missing`);
  return nsh.slice(at, nsh.indexOf('FunctionEnd', at));
}

// electron-builder 가 appId 로 짓는 GUID (UUID v5).
function electronGuid(appId) {
  const ns = Buffer.from('50e065bc313411e69bab38c9862bdaf3', 'hex');
  const hash = crypto.createHash('sha1').update(Buffer.concat([ns, Buffer.from(appId)])).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

test('has an installer build script for each OS', () => {
  for (const [name, bundles] of [['build', null], ['build:win', 'nsis'], ['build:mac', 'dmg'], ['build:linux', 'appimage,deb']]) {
    const script = pkg.scripts[name];
    assert.ok(script, `npm run ${name} is missing`);
    assert.match(script, /^tauri build/);
    if (bundles) assert.ok(script.includes(`--bundles ${bundles}`), `${name} does not build ${bundles}`);
    assert.match(script, /node tools\/copy-installer\.js$/, 'does not copy the installer to the project root');
  }
  assert.ok(pkg.devDependencies['@tauri-apps/cli'], '@tauri-apps/cli is missing');
  assert.equal(pkg.devDependencies.electron, undefined, 'electron is still a dependency');
  assert.equal(pkg.devDependencies['electron-builder'], undefined, 'electron-builder is still a dependency');
  assert.equal(pkg.build, undefined, 'electron-builder settings are still in package.json');
  assert.equal(fs.existsSync(path.join(ROOT, 'build', 'installer.nsh')), false, 'the Electron installer script is still there');
});

test('copies the installers to the project root under the usual names', () => {
  const { installerName, pickInstaller, copyInstallers } = require('../tools/copy-installer');
  assert.equal(installerName('MyDeskBox_1.0.0_x64-setup.exe'), 'MyDeskBox-Setup-1.0.0-x64.exe');
  assert.equal(installerName('MyDeskBox_1.0.0_aarch64.dmg'), 'MyDeskBox_1.0.0_aarch64.dmg');
  assert.equal(pickInstaller(['MyDeskBox_1.0.0_x64-setup.exe', 'MyDeskBox_1.0.0_x64-setup.exe.sig'], '.exe'), 'MyDeskBox_1.0.0_x64-setup.exe');
  assert.equal(pickInstaller(['MyDeskBox_1.0.9_x64-setup.exe', 'MyDeskBox_1.0.10_x64-setup.exe'], '.exe'), 'MyDeskBox_1.0.10_x64-setup.exe');

  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-target-'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-root-'));
  try {
    const nsis = path.join(target, 'release', 'bundle', 'nsis');
    fs.mkdirSync(nsis, { recursive: true });
    fs.writeFileSync(path.join(nsis, 'MyDeskBox_1.0.0_x64-setup.exe'), 'installer');
    fs.writeFileSync(path.join(nsis, 'MyDeskBox_1.0.0_x64-setup.exe.sig'), 'sig');
    const linux = path.join(target, 'x86_64-unknown-linux-gnu', 'release', 'bundle');
    fs.mkdirSync(path.join(linux, 'deb'), { recursive: true });
    fs.mkdirSync(path.join(linux, 'appimage'), { recursive: true });
    fs.writeFileSync(path.join(linux, 'deb', 'MyDeskBox_1.0.0_amd64.deb'), 'deb');
    fs.writeFileSync(path.join(linux, 'appimage', 'MyDeskBox_1.0.0_amd64.AppImage'), 'appimage');

    const win = copyInstallers({ target, root, platform: 'win32' });
    assert.deepEqual(win.map((item) => item.name), ['MyDeskBox-Setup-1.0.0-x64.exe']);
    assert.equal(fs.readFileSync(path.join(root, 'MyDeskBox-Setup-1.0.0-x64.exe'), 'utf8'), 'installer');
    const lin = copyInstallers({ target, root, platform: 'linux' });
    assert.deepEqual(lin.map((item) => item.name).sort(), ['MyDeskBox_1.0.0_amd64.AppImage', 'MyDeskBox_1.0.0_amd64.deb']);
    assert.equal(fs.readdirSync(root).length, 3, 'copied something that is not an installer');
    assert.throws(() => copyInstallers({ target, root, platform: 'darwin' }), /찾지 못했습니다/);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('defines package targets for all three OSes with the app icon', () => {
  assert.deepEqual(conf.bundle.targets, ['nsis', 'dmg', 'appimage', 'deb']);
  assert.equal(conf.productName, 'MyDeskBox');
  assert.equal(conf.mainBinaryName, 'MyDeskBox');
  assert.equal(conf.identifier, 'com.suhokwon.mydeskbox', 'the identifier changed; the old install would not be found');
  assert.equal(conf.version, pkg.version, 'tauri.conf.json and package.json versions differ');
  for (const file of conf.bundle.icon) {
    assert.ok(fs.existsSync(path.join(TAURI, file)), `${file} is missing`);
  }
  assert.equal(conf.bundle.windows.nsis.installerIcon, '../src/assets/icon.ico', 'installer icon differs from the app icon');
  // 박스 창은 ../src 의 renderer 와 assets 를 그대로 싣는다.
  assert.equal(conf.build.frontendDist, '../src');
});

test('installer lets the user choose a language and installs per user', () => {
  const { nsis } = conf.bundle.windows;
  assert.equal(nsis.displayLanguageSelector, true);
  assert.deepEqual([...nsis.languages].sort(), ['English', 'Korean']);
  assert.equal(nsis.installMode, 'currentUser');
  assert.equal(nsis.installerHooks, 'windows/hooks.nsh');
  assert.ok(nsh.charCodeAt(0) === 0xfeff, 'hooks.nsh needs a UTF-8 BOM or Korean text breaks');
  for (const name of ['NSIS_HOOK_PREINSTALL', 'NSIS_HOOK_POSTINSTALL', 'NSIS_HOOK_PREUNINSTALL', 'NSIS_HOOK_POSTUNINSTALL']) {
    macro(name);
  }
  assert.match(nsh, /\$LANGUAGE == 1042/, 'does not detect Korean');
});

// 훅 파일은 설치 스크립트 맨 위에서 읽힌다. 템플릿의 변수는 그 뒤에 선언되므로 함수 안에서 쓰면 빈 글자가 된다.
test('functions in the hooks do not use template variables', () => {
  const functions = nsh.split(/^Function /m).slice(1).map((part) => part.slice(0, part.indexOf('FunctionEnd')));
  assert.ok(functions.length > 10);
  for (const body of functions) {
    for (const name of ['$PassiveMode', '$UpdateMode', '$DeleteAppDataCheckboxState', '$WixMode']) {
      assert.equal(body.includes(name), false, `${body.split(/\r?\n/)[0]} uses ${name}`);
    }
  }
});

test('only one copy of the app runs at a time', () => {
  const lib = fs.readFileSync(path.join(TAURI, 'src', 'lib.rs'), 'utf8');
  assert.match(fs.readFileSync(path.join(TAURI, 'Cargo.toml'), 'utf8'), /tauri-plugin-single-instance/);
  assert.match(lib, /tauri_plugin_single_instance::init/, 'a second launch is not handed to the first one');
  assert.match(lib, /claim_single_instance\(\)/, 'nothing stops two copies from owning the desktop');
});

test('reinstall removes every earlier install completely', () => {
  assert.ok(nsh.includes(electronGuid(conf.identifier)), 'the Electron install key does not match the appId');
  assert.ok(nsh.includes('Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MyDeskBox'), 'does not look for the Tauri install');
  const remove = fn('MdbRemoveOld');
  // 앞 판은 늘 데이터를 두는 길로 지운다. 데이터를 지우는 일은 새로 깐 뒤에 따로 한다.
  assert.match(remove, /ExecWait '"\$MdbTaUn" \/S \/UPDATE _\?=\$2'/, 'the Tauri uninstaller is not run in place in keep mode');
  assert.match(remove, /\/S --updated \/currentuser _\?=\$MdbElDir'/, 'the Electron uninstaller is not run in place in keep mode');
  assert.ok(remove.indexOf('Call MdbCloseApp') < remove.indexOf('ExecWait'), 'the running app is not closed first');
  assert.match(remove, /DeleteRegKey HKCU "\$\{MDB_EL_UNKEY\}"/, 'leaves the Electron entry in Apps');
  const sweep = fn('MdbSweepDir');
  assert.match(sweep, /RMDir \/r "\$0"/, 'leftover files stay in the old folder');
  assert.match(sweep, /StrCpy \$1 \$0 "" -9\s+\$\{If\} \$1 == "\$\{MDB_NAME\}"/, 'removes a folder that may not be ours');
  assert.match(sweep, /Call MdbDropShortcutsTo/, 'old shortcuts keep pointing at the removed program');
  // 둘 다 깔려 있을 수 있다. 하나를 찾았다고 멈추면 다른 하나가 남는다.
  assert.equal(fn('MdbFindOld').includes('Return'), false, 'stops after finding the first install');
  // 조용한 설치에서도 앞 판을 지운다.
  assert.match(macro('NSIS_HOOK_PREINSTALL'), /Call MdbRemoveOld/);
  // 묻는 일은 첫 페이지 전에 한다. 앞 판을 지워 두면 Tauri 의 '이미 설치됨' 페이지가 스스로 빠진다.
  assert.match(nsh, /!define MUI_CUSTOMFUNCTION_GUIINIT MdbGuiInit/);
  assert.match(fn('MdbGuiInit'), /Call MdbRemoveOld\s*$/, 'the old install is not removed before the pages');
});

test('asks whether to delete user data, and keeps it unless the user says so twice', () => {
  const init = fn('MdbGuiInit');
  assert.ok(nsh.includes('!define MDB_DATA "$APPDATA\\MyDeskBox"'), 'looks in the wrong place for user data');
  assert.match(init, /layout\.json/, 'does not detect user data');
  assert.match(init, /StrCpy \$MdbWipe 0/, 'default is to delete');
  assert.match(init, /MB_YESNOCANCEL\|MB_ICONQUESTION\|MB_DEFBUTTON2/, 'the default button deletes the data');
  assert.match(init, /askYes:\s+[^\n]*\n\s+MessageBox MB_YESNO\|MB_ICONEXCLAMATION\|MB_DEFBUTTON2 "\$6" IDYES wipeOk/, 'deletes without confirming');
  assert.match(init, /Quit/, 'cancel does not stop the installation');
  for (const word of ['사용자 데이터', '지울까요?', 'User data', 'Delete it?']) {
    assert.ok(init.includes(word), `${word} is missing`);
  }
});

test('returns box files to the desktop before deleting user data', () => {
  const post = macro('NSIS_HOOK_POSTINSTALL');
  const restore = post.indexOf('Call MdbRestoreDesktop');
  assert.ok(restore > 0, 'does not restore the desktop');
  assert.ok(post.indexOf('RMDir /r "${MDB_DATA}"') > restore, 'deletes before restoring');
  assert.match(post, /\$\{If\} \$MdbWipe == 1/, 'deletes without being asked');
  const desktop = fn('${p}MdbRestoreDesktop');
  assert.ok(desktop.includes('--restore-desktop'), 'does not ask the app to restore');
  assert.match(desktop, /\$\{If\} \$1 != 0\s+Call \$\{p\}MdbRestoreBoxFiles\s+Call \$\{p\}MdbShowShellIcons/, 'no manual fallback');
  assert.ok(fn('${p}MdbRestoreBoxFiles').includes('${MDB_DATA}\\boxes'), 'does not look in the box storage');
});

test('uninstall restores the desktop before the program is deleted', () => {
  const pre = macro('NSIS_HOOK_PREUNINSTALL');
  assert.match(pre, /\$\{If\} \$UpdateMode <> 1/, 'restores during a reinstall too, emptying the boxes');
  assert.ok(pre.indexOf('Call un.MdbCloseApp') < pre.indexOf('Call un.MdbRestoreDesktop'), 'restores while the app may still re-hide files');
  const post = macro('NSIS_HOOK_POSTUNINSTALL');
  assert.ok(post.indexOf('Call un.MdbRestoreBoxFiles') < post.indexOf('Call un.MdbDropShortcutsTo'), 'drops shortcuts before box files come back');
  assert.match(post, /\$\{If\} \$DeleteAppDataCheckboxState = 1\s+RMDir \/r "\$\{MDB_DATA\}"/, 'user data is not removed when asked');
  // 앱이 닫힐 때 바탕화면을 되돌리는 길과 이어진다.
  const session = fs.readFileSync(path.join(TAURI, 'src', 'session.rs'), 'utf8');
  assert.match(session, /WM_ENDSESSION => \{\s+if w\.0 != 0 \{\s+restore_now\(\);/, 'closing through Restart Manager no longer restores');
});

test('uninstall removes the startup entry under the name the app writes', () => {
  const autostart = fs.readFileSync(path.join(TAURI, 'src', 'autostart.rs'), 'utf8');
  assert.ok(autostart.includes(`"${conf.productName}".into()`), 'name written by the app differs from the product name');
  const pre = macro('NSIS_HOOK_PREUNINSTALL');
  assert.ok(pre.includes('DeleteRegValue HKCU "${MDB_RUN_KEY}" "${MDB_NAME}"'), 'does not remove the startup entry');
  assert.ok(pre.includes(`DeleteRegValue HKCU "\${MDB_RUN_KEY}" "${conf.identifier}"`), 'does not remove the entry left by older versions');
  // 다시 깔면 앞 판의 경로가 적힌 시작프로그램 값을 새 경로로 바꾼다.
  assert.match(macro('NSIS_HOOK_POSTINSTALL'), /WriteRegStr HKCU "\$\{MDB_RUN_KEY\}" "\$\{MDB_NAME\}" '"\$INSTDIR\\\$\{MDB_EXE\}"'/);
});

test('unhides the same shell icons the app hides, without the call that wipes desktop icons', () => {
  const windows = fs.readFileSync(path.join(TAURI, 'src', 'desktop', 'windows.rs'), 'utf8');
  const listed = windows.slice(windows.indexOf('pub const SHELL_CLSID'), windows.indexOf('];', windows.indexOf('pub const SHELL_CLSID')));
  const shown = fn('${p}MdbShowShellIcons').match(/\{[0-9A-Fa-f-]{36}\}/g) || [];
  assert.ok(shown.includes('{645FF040-5081-101B-9F08-00AA002F954E}'), 'does not restore the Recycle Bin');
  assert.deepEqual([...shown].sort(), [...listed.match(/\{[0-9A-Fa-f-]{36}\}/g)].sort(), 'differs from SHELL_CLSID in windows.rs');
  // SHCNE_ASSOCCHANGED 하나에 바탕화면 그림이 모두 사라진다. 바탕화면 보기의 '새로 고침' 만 보낸다.
  assert.equal(/SHChangeNotify\(i 0x08000000/.test(nsh), false, 'uses SHCNE_ASSOCCHANGED');
  assert.match(fn('${p}MdbRefreshDesktop'), /0x7103/);
});

// 박스에 담아 두었던 바로 가기는 이름이 바뀌어 돌아온다. 이름이 아니라 가리키는 파일로 찾는다.
test('uninstall removes shortcuts that came back from boxes', () => {
  const drop = fn('${p}MdbDropShortcutsTo');
  assert.match(drop, /\$DESKTOP\\\*\.lnk/, 'does not look at every desktop shortcut');
  assert.match(drop, /Call \$\{p\}MdbShortcutTarget/, 'matches by name instead of target');
  assert.ok(macro('NSIS_HOOK_POSTUNINSTALL').includes('Push "$INSTDIR\\${MDB_EXE}"'), 'does not compare with the installed executable');
});
