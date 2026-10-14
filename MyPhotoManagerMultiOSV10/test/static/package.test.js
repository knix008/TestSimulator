// Packaging and installer configuration (no build needed).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const json = (file) => JSON.parse(read(file));
const pkg = json('package.json');
const conf = json('src-tauri/tauri.conf.json');

// features: APP-INSTALL
test('npm scripts: build:win / build:mac / build:linux / build:webapp / build:all and tests', () => {
  for (const name of ['build:win', 'build:mac', 'build:linux', 'build:webapp', 'build:all', 'build:web', 'test', 'start', 'build:icons', 'fixtures']) assert.ok(pkg.scripts[name], name);
  assert.match(pkg.scripts['build:win'], /build\.mjs win/);
});

test('versions agree: package.json, Cargo.toml, tauri.conf.json', () => {
  assert.equal(conf.version, '../package.json');
  assert.match(read('src-tauri/Cargo.toml'), new RegExp(`version = "${pkg.version.replace(/\./g, '\\.')}"`));
});

test('app identity, icons and window', () => {
  assert.equal(conf.productName, 'MyPhotoManager');
  assert.equal(conf.identifier, 'com.shkwon.myphotomanager');
  for (const icon of conf.bundle.icon) assert.ok(fs.existsSync(path.join(root, 'src-tauri', icon)), icon);
  const png = fs.readFileSync(path.join(root, 'assets', 'icon.png'));
  assert.equal(png.readUInt32BE(16), 1024, 'icon is 1024 px');
  for (const file of ['public/icon.png', 'public/icon-192.png', 'public/icon-512.png', 'src-tauri/windows/installerHeader.bmp', 'src-tauri/windows/installerSidebar.bmp']) assert.ok(fs.existsSync(path.join(root, file)), file);
  assert.equal(conf.build.devUrl, 'http://localhost:1440');
  assert.match(read('vite.config.js'), /port: 1440/);
});

test('asset protocol may read any picture the user browses (including dot folders)', () => {
  const scope = conf.app.security.assetProtocol;
  assert.ok(scope.enable);
  assert.deepEqual(scope.scope.allow, ['**']);
  assert.equal(scope.scope.requireLiteralLeadingDot, false);
  const caps = json('src-tauri/capabilities/default.json').permissions;
  for (const permission of ['core:window:allow-set-fullscreen', 'dialog:allow-open', 'dialog:allow-save', 'core:window:allow-set-theme']) assert.ok(caps.includes(permission), permission);
});

// features: APP-INSTALL FILE-OPENWITH
test('Windows installer: Korean/English, own icon, hooks file with BOM; "Open with" only (no takeover)', () => {
  const nsis = conf.bundle.windows.nsis;
  assert.deepEqual(nsis.languages, ['Korean', 'English']);
  assert.ok(nsis.displayLanguageSelector);
  assert.equal(nsis.installerIcon, 'icons/icon.ico');
  const hooks = fs.readFileSync(path.join(root, 'src-tauri', nsis.installerHooks));
  assert.deepEqual([...hooks.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 BOM');
  const text = hooks.toString('utf8');
  for (const macro of ['NSIS_HOOK_PREINSTALL', 'NSIS_HOOK_POSTINSTALL', 'NSIS_HOOK_POSTUNINSTALL']) assert.ok(text.includes(`!macro ${macro}`), macro);
  for (const ext of ['jpg', 'heic', 'nef', 'dng', 'psd', 'tif']) assert.ok(text.includes(`MYPHOTO_ASSOC "${ext}"`) && text.includes(`MYPHOTO_UNASSOC "${ext}"`), ext);
  assert.ok(text.includes('OpenWithProgids'));
  assert.ok(!/WriteRegStr SHCTX "Software\\\\Classes\\\\\.\$\{EXT\}" ""/.test(text), 'never sets the default program');
  assert.ok(text.includes('$LANGUAGE == 1042'), 'Korean question');
  assert.equal(conf.bundle.fileAssociations, undefined, 'no Tauri file associations (they would take over .jpg)');
});

// features: APP-INSTALL
test('Linux packages: desktop entry offers MyPhotoManager for images; postinst refreshes caches', () => {
  const desktop = read('src-tauri/linux/myphotomanager.desktop');
  assert.match(desktop, /MimeType=image\/jpeg;.*image\/heic;/);
  assert.match(desktop, /Exec=\{\{exec\}\} %F/);
  for (const kind of ['deb', 'rpm']) {
    assert.equal(conf.bundle.linux[kind].desktopTemplate, 'linux/myphotomanager.desktop');
    assert.ok(read(`src-tauri/${conf.bundle.linux[kind].postInstallScript}`).includes('update-desktop-database'));
  }
  assert.ok(!read('src-tauri/linux/postinst.sh').includes('\r'), 'LF line endings');
});

// features: APP-INSTALL
test('macOS: viewer for images with Alternate rank (never the default)', () => {
  const plist = read('src-tauri/Info.plist');
  assert.ok(plist.includes('<string>public.image</string>'));
  assert.ok(plist.includes('<string>Alternate</string>') && !plist.includes('<string>Owner</string>'));
  assert.equal(conf.bundle.macOS.minimumSystemVersion, '11.0');
});

// features: APP-WEB
test('web app: manifest, service worker, sample photos', () => {
  const manifest = json('public/manifest.webmanifest');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'));
  assert.ok(read('public/sw.js').includes("addEventListener('fetch'"));
  assert.match(read('index.html'), /rel="manifest"/);
  const samples = json('public/samples/index.json');
  assert.ok(samples.length >= 5);
  for (const name of samples) assert.ok(fs.existsSync(path.join(root, 'public', 'samples', name)), name);
});

test('ignored build output and installers', () => {
  const ignore = read('.gitignore');
  for (const entry of ['node_modules/', 'dist/', 'src-tauri/target/', 'release/', '/MyPhotoManager-*.exe', '/MyPhotoManager-*.zip', 'test-results/']) assert.ok(ignore.includes(entry), entry);
});
