'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const nsh = fs.readFileSync(path.join(ROOT, 'build', 'installer.nsh'), 'utf8');

test('has an installer build script for each OS', () => {
  for (const name of ['build', 'build:win', 'build:mac', 'build:linux']) {
    assert.ok(pkg.scripts[name], `npm run ${name} is missing`);
    assert.match(pkg.scripts[name], /electron-builder/);
    assert.match(pkg.scripts[name], /tools\/copy-installer\.js/, 'does not copy the installer to the project root');
  }
  assert.ok(pkg.devDependencies['electron-builder'], 'electron-builder is missing');
});

test('copies only the installer to the project root', () => {
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

test('defines package targets for all three OSes', () => {
  const kinds = (list) => list.map((entry) => entry.target);
  assert.deepEqual(kinds(pkg.build.win.target), ['nsis']);
  assert.deepEqual(kinds(pkg.build.mac.target), ['dmg', 'zip']);
  assert.deepEqual(kinds(pkg.build.linux.target), ['AppImage', 'deb']);
});

test('installer uses the same icon as the app', () => {
  const appIcon = pkg.build.win.icon;
  assert.equal(appIcon, 'assets/icon.ico');
  for (const key of ['installerIcon', 'uninstallerIcon', 'installerHeaderIcon']) {
    assert.equal(pkg.build.nsis[key], appIcon, `${key} differs from the app icon`);
  }
  for (const file of [pkg.build.win.icon, pkg.build.mac.icon, pkg.build.linux.icon]) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} is missing`);
  }
});

test('installer lets the user choose a language', () => {
  const { nsis } = pkg.build;
  assert.equal(nsis.multiLanguageInstaller, true);
  assert.equal(nsis.displayLanguageSelector, true);
  assert.deepEqual([...nsis.installerLanguages].sort(), ['en_US', 'ko_KR']);
});

test('installer does not create shortcuts on its own', () => {
  const { nsis } = pkg.build;
  assert.equal(nsis.oneClick, false, 'one-click mode cannot ask the user');
  assert.equal(nsis.createDesktopShortcut, false);
  assert.equal(nsis.createStartMenuShortcut, false);
});

test('install script asks before creating shortcuts', () => {
  for (const macro of ['customInit', 'customPageAfterChangeDir', 'customInstall', 'customUnInstall']) {
    assert.match(nsh, new RegExp(`!macro\\s+${macro}\\b`), `${macro} is missing`);
  }
  assert.match(nsh, /Page custom ShortcutPageCreate ShortcutPageLeave/, 'shortcut choice page is missing');
  assert.match(nsh, /\$DESKTOP\\\$\{PRODUCT_FILENAME\}\.lnk/, 'does not create the desktop shortcut');
  assert.match(nsh, /\$SMPROGRAMS\\\$\{PRODUCT_FILENAME\}\.lnk/, 'does not create the Start Menu shortcut');
  // Delete when unchecked, and clean up on uninstall too.
  assert.equal((nsh.match(/Delete "\$DESKTOP/g) || []).length >= 2, true);
  assert.equal((nsh.match(/Delete "\$SMPROGRAMS/g) || []).length >= 2, true);
  assert.match(nsh, /un\.RestoreHeld/, 'uninstall does not restore files held in boxes');
  assert.match(nsh, /mydeskbox\\held/, 'does not look for the held-files folder');
});

test('uninstall also removes the startup entry', () => {
  const RUN = 'Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  assert.ok(nsh.includes(`DeleteRegValue HKCU "${RUN}" "\${PRODUCT_FILENAME}"`), 'does not remove the startup entry');
  // Versions before the explicit name used the AppUserModelId. Remove that too.
  assert.ok(nsh.includes(`DeleteRegValue HKCU "${RUN}" "${pkg.build.appId}"`), 'does not remove the entry left by older versions');
  // The name the app writes must match the name the uninstaller looks for.
  const autostart = fs.readFileSync(path.join(ROOT, 'src', 'main', 'autostart.js'), 'utf8');
  assert.ok(autostart.includes(`'${pkg.productName}'`), 'name written by the app differs from the product name');
});

test('install script text exists in Korean and English', () => {
  assert.match(nsh, /\$LANGUAGE == 1042/, 'does not detect Korean');
  for (const word of ['바탕화면에 바로 가기 만들기', '시작 메뉴에 바로 가기 만들기']) {
    assert.ok(nsh.includes(word), `${word} is missing`);
  }
  for (const word of ['Create a shortcut on the desktop', 'Create a shortcut in the Start Menu']) {
    assert.ok(nsh.includes(word), `${word} is missing`);
  }
});

test('OS-specific native files are unpacked from the archive', () => {
  assert.ok(
    pkg.build.asarUnpack.some((glob) => glob.includes('koffi')),
    'windows will not open unless koffi is unpacked'
  );
});

test('packaged file list includes everything needed to run', () => {
  for (const glob of ['src/**/*', 'assets/**/*', 'package.json']) {
    assert.ok(pkg.build.files.includes(glob), `${glob} is missing`);
  }
});

test('installer lets the user choose to erase old settings', () => {
  assert.match(nsh, /Var WipeData/, 'no variable to hold the choice');
  assert.match(nsh, /\$\{NSD_GetState\} \$WipeCheck \$WipeData/, 'does not read the choice');
  assert.ok(nsh.includes('RMDir /r "$APPDATA\\${PRODUCT_FILENAME}"'), 'does not delete the settings folder');
  // This can't be undone, so the default must be to keep settings.
  assert.match(nsh, /StrCpy \$WipeData 0/, 'default is set to erase');
  for (const word of ['예전 설정을 모두 지우고 새로 시작', 'Erase earlier settings and start fresh']) {
    assert.ok(nsh.includes(word), `${word} is missing`);
  }
});

test('does not offer to erase settings when already installed', () => {
  assert.match(nsh, /Var HasOldApp/, 'no variable to hold whether the app is installed');
  assert.match(
    nsh,
    /ReadRegStr \$R0 SHELL_CONTEXT "\$\{INSTALL_REGISTRY_KEY\}" InstallLocation/,
    'does not look up the install location in the registry'
  );
  // The erase checkbox is only created when the app is not installed.
  assert.match(nsh, /\$\{ElseIf\} \$R7 == 1\s+\$\{NSD_CreateCheckbox\}[^\r\n]*\$R5/, 'always creates the erase checkbox');
  // Erasing is double-guarded: even if we get here, nothing is erased when already installed.
  assert.match(
    nsh,
    /\$\{If\} \$WipeData == \$\{BST_CHECKED\}\s+\$\{AndIf\} \$HasOldApp == 0/,
    'settings can be erased even when already installed'
  );
  for (const word of ['이미 설치되어 있습니다', 'MyDeskBox is already installed']) {
    assert.ok(nsh.includes(word), `${word} is missing`);
  }
});

test('silent uninstaller run during reinstall touches nothing', () => {
  // The installer runs the old uninstaller once with --updated.
  // Restoring at that point would dump everything held in boxes onto the desktop.
  assert.match(nsh, /\$\{IfNot\} \$\{isUpdated\}/, 'does not detect the reinstall path');
  const guard = nsh.indexOf('${IfNot} ${isUpdated}');
  const restore = nsh.indexOf('Call un.RestoreHeld');
  assert.ok(guard >= 0 && restore > guard, 'restore is outside the guard');
});

test('returns box files to the desktop before erasing settings', () => {
  assert.match(nsh, /Function RestoreBoxFiles/, 'restore step is missing');
  assert.ok(nsh.includes('$APPDATA\\${PRODUCT_FILENAME}\\boxes'), 'does not look for the box storage');
  assert.match(nsh, /Call RestoreBoxFiles\s+RMDir \/r/, 'deletes before restoring');
});

test('reinstall keeps the current shortcut state', () => {
  assert.match(
    nsh,
    /\$\{IfNot\} \$\{FileExists\} "\$DESKTOP\\\$\{PRODUCT_FILENAME\}\.lnk"\s+StrCpy \$MakeDesktop 0/,
    'a deleted desktop shortcut comes back'
  );
  assert.match(
    nsh,
    /\$\{IfNot\} \$\{FileExists\} "\$SMPROGRAMS\\\$\{PRODUCT_FILENAME\}\.lnk"\s+StrCpy \$MakeStartMenu 0/,
    'a deleted Start Menu shortcut comes back'
  );
});

// After uninstall, the desktop must look as it did before the app ran.
// Held files must not stay in the settings folder, and a hidden Recycle Bin must not stay hidden.
test('uninstall restores the desktop', () => {
  assert.match(nsh, /!macro customUnInit/, 'no restore step before files are deleted');
  assert.ok(
    nsh.includes('--restore-desktop'),
    'does not ask the app to restore'
  );
  // The executable must be called before files are deleted (customUnInit).
  const init = nsh.indexOf('!macro customUnInit');
  const call = nsh.indexOf('--restore-desktop', init);
  const end = nsh.indexOf('!macroend', init);
  assert.ok(call > init && call < end, 'tries to call the executable after it is deleted');
});

test('restores files and Recycle Bin manually if the app cannot', () => {
  assert.match(nsh, /Function un\.RestoreBoxFiles/, 'uninstaller has no manual restore');
  assert.match(nsh, /Function un\.EmptyToDesktop/, 'move-to-desktop step is missing');
  assert.match(nsh, /Function un\.ShowShellIcons/, 'does not unhide the Recycle Bin');
  // The Recycle Bin CLSID must match SHELL_CLSID in windows.js.
  const windows = fs.readFileSync(path.join(ROOT, 'src', 'main', 'desktop', 'windows.js'), 'utf8');
  const shellAt = nsh.indexOf('Function un.ShowShellIcons');
  const shellBody = nsh.slice(shellAt, nsh.indexOf('FunctionEnd', shellAt));
  for (const clsid of shellBody.match(/\{[0-9A-Fa-f-]{36}\}/g) || []) {
    assert.ok(windows.includes(clsid), `tries to restore an icon not listed in windows.js: ${clsid}`);
  }
  assert.ok(nsh.includes('{645FF040-5081-101B-9F08-00AA002F954E}'), 'does not restore the Recycle Bin');
});

test('restores once more after the app has stopped', () => {
  // The app may still be running during customUnInit and could re-hide what we restored,
  // so we must run again once the app has definitely stopped (customUnInstall).
  const at = nsh.indexOf('!macro customUnInstall');
  assert.ok(at > 0);
  const end = nsh.indexOf('!macroend', at);
  const body = nsh.slice(at, end);
  assert.ok(body.includes('Call un.RestoreBoxFiles'), 'does not restore files at the end');
  assert.ok(body.includes('Call un.ShowShellIcons'), 'does not restore the Recycle Bin at the end');
});

// A shortcut kept in a box comes back from the restore step, often renamed
// ('MyDeskBox (2).lnk', '(1) MyDeskBox.lnk'). Deleting the exact name before that leaves it behind.
test('uninstall removes shortcuts that came back from boxes', () => {
  const at = nsh.indexOf('!macro customUnInstall');
  const end = nsh.indexOf('!macroend', at);
  const body = nsh.slice(at, end);
  const restore = body.lastIndexOf('Call un.RestoreBoxFiles');
  const del = body.indexOf('Delete "$DESKTOP');
  assert.ok(del > restore, 'deletes the shortcut before box files come back');
  assert.ok(body.indexOf('Call un.DropOwnShortcuts') > restore, 'does not sweep shortcuts after restoring');
  assert.match(nsh, /Function un\.DropOwnShortcuts/, 'shortcut sweep is missing');
  assert.match(nsh, /Function un\.ShortcutTarget/, 'does not read the shortcut target');
  // Matched by target, not by name, so other programs' shortcuts stay.
  // The define does not exist yet where the function is read, so the macro passes the path in.
  assert.ok(body.includes('Push "$INSTDIR\\${APP_EXECUTABLE_FILENAME}"'), 'does not compare with the installed executable');
  const fn = nsh.slice(nsh.indexOf('Function un.DropOwnShortcuts'));
  assert.ok(!fn.slice(0, fn.indexOf('FunctionEnd')).includes('${APP_EXECUTABLE_FILENAME}'), 'uses a define the uninstaller build does not have');
});

test('reinstall asks before restoring', () => {
  const at = nsh.indexOf('!macro customInstall');
  assert.ok(at > 0);
  const end = nsh.indexOf('!macroend', at);
  const body = nsh.slice(at, end);
  assert.ok(body.includes('MessageBox MB_YESNO'), 'restores without asking');
  assert.ok(body.includes('--restore-desktop'), 'does not call the restore path');
  assert.ok(body.includes('$HasOldApp == 1'), 'asks even when not installed');
  assert.ok(body.includes('${IfNot} ${Silent}'), 'asks even during a silent install');
  assert.match(body, /boxes[\\]restore\.json/, 'does not check whether anything is held');
});
