'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// Normalised: git may well have checked these out with CRLF.
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

const CONF = JSON.parse(read('src-tauri/tauri.conf.json'));
const PKG = JSON.parse(read('package.json'));
const CARGO = read('src-tauri/Cargo.toml');
const HOOKS = read('src-tauri/windows/hooks.nsh');
const SCRIPTS = PKG.scripts;

describe('one product, one name', () => {
  it('keeps the same version everywhere', () => {
    const cargo = /^version = "([^"]+)"/m.exec(CARGO)[1];
    assert.strictEqual(CONF.version, PKG.version);
    assert.strictEqual(cargo, PKG.version);
  });

  it('keeps the identifier and folder the Electron build used', () => {
    // Settings, chosen icons and user themes live under this name; a new one
    // would leave every existing dock behind.
    assert.strictEqual(CONF.identifier, 'com.suhokwon.mydockbar');
    assert.strictEqual(CONF.productName, 'MyDockBar');
    assert.ok(read('src-tauri/src/lib.rs').includes('.join("MyDockBar")'), 'the data folder moved');
  });

  it('spells the names in the installer hooks the way the config does', () => {
    assert.ok(HOOKS.includes(`!define MDB_IDENTIFIER "${CONF.identifier}"`));
    assert.ok(HOOKS.includes(`!define MDB_EXE "${CONF.mainBinaryName}.exe"`));
    assert.ok(HOOKS.includes(`Uninstall\\${CONF.productName}"`));
  });
});

describe('the installer', () => {
  it('is per-user, Korean and English, with the hooks wired in', () => {
    const nsis = CONF.bundle.windows.nsis;
    assert.strictEqual(nsis.installMode, 'currentUser');
    assert.deepStrictEqual([...nsis.languages].sort(), ['English', 'Korean']);
    assert.strictEqual(nsis.installerHooks, 'windows/hooks.nsh');
  });

  it('is saved with a BOM, or NSIS reads the Korean as ANSI', () => {
    const bytes = fs.readFileSync(path.join(ROOT, 'src-tauri/windows/hooks.nsh'));
    assert.deepStrictEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  });

  it('removes an installed copy, Electron or Tauri, before installing', () => {
    assert.ok(/MDB_ELECTRON_KEY "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\8f4897b2-/.test(HOOKS));
    const removal = HOOKS.slice(HOOKS.indexOf('Function MDB_RemovePrevious'), HOOKS.indexOf('FunctionEnd', HOOKS.indexOf('Function MDB_RemovePrevious')));
    assert.ok(/taskkill/.test(removal), 'a running dock would hold its files open');
    assert.ok(removal.includes('${MDB_ELECTRON_KEY}') && removal.includes('${MDB_UNINSTKEY}'), 'one of the two builds is not removed');
    assert.ok(/NSIS_HOOK_PREINSTALL[\s\S]*Call MDB_RemovePrevious/.test(HOOKS), 'a silent install keeps the old copy');
  });

  it('always asks about the user data, with no answer chosen for the user', () => {
    const page = HOOKS.slice(HOOKS.indexOf('Function MDB_PagePrevious'), HOOKS.indexOf('Function MDB_LeavePrevious'));
    assert.ok(page.includes('MDB_KeepRadio') && page.includes('MDB_DeleteRadio'));
    assert.ok(!/NSD_Check/.test(page), 'one of the answers is pre-selected');
    const leave = HOOKS.slice(HOOKS.indexOf('Function MDB_LeavePrevious'), HOOKS.indexOf('Function MDB_Unquote'));
    assert.ok(/\$0 != \$\{BST_CHECKED\}[\s\S]{0,80}\$1 != \$\{BST_CHECKED\}[\s\S]{0,400}Abort/.test(leave),
      'the wizard moves on without an answer');
    const removal = HOOKS.slice(HOOKS.indexOf('Function MDB_RemovePrevious'));
    assert.ok(/\$\{If\} \$MDB_DeleteData == 1[\s\S]{0,80}RMDir \/r "\$APPDATA\\\$\{MDB_DATA_DIR\}"/.test(removal),
      'the user data is not removed when asked to be');
    assert.ok(/--updated/.test(removal), 'the Electron uninstaller would decide about the data itself');
  });

  it('never uses a Tauri define inside a Function', () => {
    // The hooks are read before Tauri defines them; inside a Function they are
    // still undefined and the uninstaller build fails.
    const functions = HOOKS.match(/^Function [\s\S]*?^FunctionEnd/gm) || [];
    for (const body of functions) {
      assert.ok(!/\$\{(PRODUCTNAME|MAINBINARYNAME|BUNDLEID|UNINSTKEY|MANUPRODUCTKEY)\}/.test(body), body.split('\n')[0]);
      assert.ok(!/\$(UpdateMode|PassiveMode|DeleteAppDataCheckboxState)\b/.test(body), `${body.split('\n')[0]} reads a Tauri variable`);
    }
  });
});

describe('the build commands', () => {
  it('has one per platform, each copying the installer to the root', () => {
    for (const [name, bundle] of [['build:win', 'nsis'], ['build:mac', 'dmg'], ['build:linux', 'appimage']]) {
      assert.ok(SCRIPTS[name], `no ${name} script`);
      assert.ok(SCRIPTS[name].includes(`--bundles ${bundle}`), `${name} builds the wrong bundle`);
      assert.ok(SCRIPTS[name].includes('copy-installer'), `${name} leaves the installer in target/`);
      assert.ok(SCRIPTS[name].includes('ensure-icons'), `${name} does not ensure the artwork`);
    }
    assert.ok(SCRIPTS.pack.includes('--no-bundle'), 'no pack-only build');
  });

  it('bundles the built-in themes and nothing it does not load', () => {
    assert.deepStrictEqual(CONF.bundle.resources, { '../themes': 'themes' });
    assert.strictEqual(CONF.build.frontendDist, '../src');
  });

  it('carries no Electron any more', () => {
    assert.ok(!PKG.devDependencies.electron, 'electron is still a dependency');
    assert.ok(!PKG.devDependencies['electron-builder'], 'electron-builder is still a dependency');
    assert.ok(!fs.existsSync(path.join(ROOT, 'src', 'main')), 'the Electron main process is still there');
    assert.ok(!fs.existsSync(path.join(ROOT, 'src', 'preload')), 'the Electron preload is still there');
  });

  it('lets transparent windows work on macOS', () => {
    assert.strictEqual(CONF.app.macOSPrivateApi, true);
    assert.ok(/macos-private-api/.test(CARGO));
  });
});
