import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { languageFromInstall } from '../src/i18n.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('platform build scripts are wired', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['build:web'], 'node scripts/build.mjs web');
  assert.equal(pkg.scripts['build:windows'], 'node scripts/build.mjs windows');
  assert.equal(pkg.scripts['build:linux'], 'node scripts/build.mjs linux');
  assert.equal(pkg.scripts['build:macos'], 'node scripts/build.mjs macos');
  assert.match(read('scripts/build.mjs'), /web \| windows \| linux \| macos/);
});

test('only one installer is copied to the project root', () => {
  const script = read('scripts/build.mjs');
  const rootCopies = [...script.matchAll(/copyFileSync\(.*,\s*path\.join\(root, (\w+)\)\)/g)].map((match) => match[1]);
  assert.deepEqual(rootCopies, ['name', 'primary']);
});

test('installers ask for language and both shortcuts', () => {
  const config = JSON.parse(read('src-tauri/tauri.conf.json'));
  const nsis = config.bundle.windows.nsis;
  assert.equal(nsis.displayLanguageSelector, true);
  assert.deepEqual(nsis.languages, ['English', 'Korean']);
  assert.equal(nsis.installerIcon, 'icons/icon.ico');
  assert.equal(nsis.uninstallerIcon, 'icons/icon.ico');

  const hooks = read('src-tauri/windows/hooks.nsh');
  for (const line of [
    '설치 후 만들 바로가기를 선택하세요.',
    '바탕화면에 바로가기 만들기',
    '시작 메뉴에 바로가기 만들기',
    'Choose which shortcuts to create after installation.',
    'Create a Desktop shortcut',
    'Create a Start Menu shortcut',
    '$INSTDIR\\${MAINBINARYNAME}.exe" 0',
  ]) {
    assert.match(hooks, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  for (const file of ['src-tauri/linux/install-choices.sh', 'src-tauri/macos/install.sh']) {
    const script = read(file);
    assert.match(script, /설치 언어를 선택하세요/);
    assert.match(script, /바탕화면에 바로가기 만들기/);
    assert.match(script, /시작 메뉴에 바로가기 만들기/);
    assert.match(script, /Create a Desktop shortcut/);
    assert.match(script, /Create a Start Menu shortcut/);
  }
});

test('bundle icons are the generated program icon', () => {
  for (const file of [
    'src-tauri/icons/32x32.png',
    'src-tauri/icons/128x128.png',
    'src-tauri/icons/128x128@2x.png',
    'src-tauri/icons/icon.ico',
    'src-tauri/icons/icon.icns',
    'src-tauri/windows/installerHeader.bmp',
    'src-tauri/windows/installerSidebar.bmp',
  ]) {
    const bytes = fs.statSync(path.join(root, file)).size;
    assert.ok(bytes > 100, `${file} is missing artwork`);
  }
  const ico = fs.readFileSync(path.join(root, 'src-tauri/icons/icon.ico'));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  const header = fs.readFileSync(path.join(root, 'src-tauri/windows/installerHeader.bmp'));
  assert.equal(header.subarray(0, 2).toString('ascii'), 'BM');
  assert.equal(header.readInt32LE(18), 150);
  assert.equal(header.readInt32LE(22), 57);
});

test('a first launch follows the installer language', () => {
  assert.equal(languageFromInstall('en'), 'en');
  assert.equal(languageFromInstall('ko'), 'ko');
  assert.equal(languageFromInstall(''), 'ko');
  assert.equal(languageFromInstall('fr'), 'ko');
});

test('window calls are allowed by the capability file', () => {
  const main = read('src/main.js');
  const { permissions } = JSON.parse(read('src-tauri/capabilities/default.json'));
  const methods = new Set([...main.matchAll(/\bwin\.(\w+)\(/g)].map((match) => match[1]));
  if (methods.has('onCloseRequested')) methods.add('destroy');
  for (const method of methods) {
    if (method.startsWith('on')) continue;
    const kebab = method.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    assert.ok(permissions.includes(`core:window:allow-${kebab}`), `core:window:allow-${kebab}`);
  }
});
