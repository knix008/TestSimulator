// The promises the project makes about itself: build commands, file registration, icons, documents.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { eq, includes, ok } from '../assert.js';
import { FILE_ICONS } from '../../scripts/generate-file-icons.mjs';
import { fileIconFor } from '../../src/lib/format.js';

export const title = 'Project: builds, file associations, icons, documents';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const has = (p) => fs.existsSync(path.join(root, p));

function pngSize(p) {
  const b = fs.readFileSync(path.join(root, p));
  eq(b.subarray(1, 4).toString(), 'PNG', p);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

export default async function (test) {
  const pkg = json('package.json');
  const conf = json('src-tauri/tauri.conf.json');
  const allExts = Object.values(FILE_ICONS).flatMap((f) => f.exts);

  await test('build commands for Web, Windows, macOS, Linux', () => {
    for (const s of ['build:web', 'build:win', 'build:mac', 'build:linux', 'build:all', 'test']) ok(pkg.scripts[s], s);
    includes(pkg.scripts['build:win'], '--bundles nsis');
    includes(pkg.scripts['build:mac'], '--bundles dmg');
    includes(pkg.scripts['build:linux'], 'appimage,deb');
    for (const s of ['build:win', 'build:mac', 'build:linux']) includes(pkg.scripts[s], 'copy-installer');
    for (const t of ['nsis', 'dmg', 'appimage', 'deb']) ok(conf.bundle.targets.includes(t), t);
  });
  await test('a Tauri app with a frameless window', () => {
    ok(pkg.devDependencies['@tauri-apps/cli']);
    includes(read('src-tauri/src/windows.rs'), '.decorations(false)');
    eq(pkg.dependencies.electron, undefined);
  });
  await test('the desktop bundle leaves out the web engine', () => {
    includes(read('src/lib/host.js'), "import('./webWorker.js')");
    includes(read('vite.config.js'), '__WEB_BUILD__');
    ok(!read('src/lib/host.js').includes('new Worker'), 'the worker lives apart from what the desktop bundles');
  });

  await test('associations: every supported format is registered', () => {
    const registered = conf.bundle.fileAssociations.flatMap((a) => a.ext);
    for (const e of allExts) ok(registered.includes(e), `.${e} is not registered`);
    for (const e of ['zip', '7z', 'rar', 'tar', 'tgz', 'gz', 'bz2', 'xz', 'zst', 'cab', 'iso', '001']) ok(registered.includes(e), e);
    eq(new Set(registered).size, registered.length, 'no extension twice');
  });
  await test('associations: the app opens a file from the command line', () => {
    includes(read('src-tauri/src/main.rs'), 'take_launch_files');
    includes(read('src/App.jsx'), "invoke('take_launch_files')");
    includes(read('src-tauri/src/main.rs'), 'RunEvent::Opened');
  });
  await test('Windows: each format gets its ProgId and icon in the registry', () => {
    eq(conf.bundle.windows.nsis.installerHooks, 'nsis/hooks.nsh');
    const hooks = read('src-tauri/nsis/hooks.nsh');
    includes(hooks, '!macro NSIS_HOOK_POSTINSTALL');
    for (const name of Object.keys(FILE_ICONS)) {
      includes(hooks, `Software\\Classes\\MyZipMaster.${name}\\DefaultIcon`);
      includes(hooks, `$INSTDIR\\resources\\file-icons\\${name}.ico`);
      ok(conf.bundle.fileAssociations.some((a) => a.name === `MyZipMaster.${name}`), name);
    }
    eq(conf.bundle.resources['icons/files/*.ico'], 'resources/file-icons/');
    eq(conf.bundle.windows.nsis.installMode, 'currentUser', 'no administrator prompt for a per-user install');
    eq(conf.bundle.windows.nsis.installerIcon, 'icons/icon.ico');
    eq(conf.bundle.windows.nsis.uninstallerIcon, 'icons/icon.ico');
  });
  await test('Windows: the generated installer script registers them (once built)', () => {
    const nsi = 'target/release/nsis/x64/installer.nsi';
    if (!has(nsi)) return;
    const text = read(nsi);
    for (const e of allExts) includes(text, `APP_ASSOCIATE "${e}"`, `.${e}`);
    includes(text, 'APP_UNASSOCIATE', 'uninstalling removes them');
    includes(text, 'NSIS_HOOK_POSTINSTALL');
  });
  await test('macOS: document types with their icons', () => {
    const plist = read('src-tauri/Info.plist');
    for (const [name, spec] of Object.entries(FILE_ICONS)) {
      includes(plist, `<string>file-${name}.icns</string>`);
      for (const e of spec.exts) includes(plist, `<string>${e}</string>`);
      eq(conf.bundle.macOS.files[`Resources/file-${name}.icns`], `icons/files/${name}.icns`);
    }
  });
  await test('Linux: MIME types, icons, refresh after install', () => {
    const mime = read('src-tauri/linux/myzipmaster-mime.xml');
    const deb = conf.bundle.linux.deb;
    for (const [name, spec] of Object.entries(FILE_ICONS)) {
      includes(mime, `type="${spec.mime}"`);
      for (const e of spec.exts) includes(mime, `*.${e}`);
      eq(deb.files[`/usr/share/icons/hicolor/256x256/mimetypes/${spec.mime.replace('/', '-')}.png`], `icons/files/${name}.png`);
    }
    eq(deb.files['/usr/share/mime/packages/myzipmaster.xml'], 'linux/myzipmaster-mime.xml');
    for (const script of ['linux/postinst.sh', 'linux/postrm.sh']) {
      includes(read(`src-tauri/${script}`), 'update-mime-database');
      includes(read(`src-tauri/${script}`), 'update-desktop-database');
    }
    eq(deb.postInstallScript, 'linux/postinst.sh');
    eq(deb.postRemoveScript, 'linux/postrm.sh');
    for (const a of conf.bundle.fileAssociations) ok(a.mimeType, a.name);
  });

  await test('app icon: 3D background and picture, all sizes', () => {
    const svg = read('assets/icon.svg');
    for (const needed of ['id="gloss"', 'id="tileShadow"', 'id="top"', 'id="left"', 'id="right"']) includes(svg, needed);
    eq(read('public/icon.svg'), svg, 'the app shows the same drawing');
    for (const f of ['32x32.png', '128x128.png', '128x128@2x.png', 'icon.png', 'icon.icns', 'icon.ico']) ok(has(`src-tauri/icons/${f}`), f);
    for (const f of conf.bundle.icon) ok(has(`src-tauri/${f}`), f);
    eq(pngSize('src-tauri/icons/icon.png')[0], 512);
  });
  await test('file icons: ico, icns, png, svg per format', () => {
    ok(Object.keys(FILE_ICONS).length >= 11);
    for (const name of Object.keys(FILE_ICONS)) {
      for (const ext of ['ico', 'icns', 'png']) ok(has(`src-tauri/icons/files/${name}.${ext}`), `${name}.${ext}`);
      ok(has(`assets/file-icons/${name}.svg`), name);
      ok(has(`public/file-icons/${name}.svg`), name);
      ok(pngSize(`src-tauri/icons/files/${name}.png`)[0] >= 256, name);
    }
  });
  await test('file icons: .ico holds small sizes through 256', () => {
    for (const name of Object.keys(FILE_ICONS)) {
      const b = fs.readFileSync(path.join(root, `src-tauri/icons/files/${name}.ico`));
      eq(b.readUInt16LE(2), 1, 'an icon file');
      const sizes = [];
      for (let i = 0; i < b.readUInt16LE(4); i += 1) sizes.push(b[6 + i * 16] || 256);
      for (const s of [16, 32, 48, 256]) ok(sizes.includes(s), `${name}.ico lacks ${s}`);
    }
  });
  await test('file icons: a different colour per format', () => {
    const faces = Object.values(FILE_ICONS).map((f) => f.hue.join());
    eq(new Set(faces).size, faces.length);
    const labels = Object.values(FILE_ICONS).map((f) => f.label);
    eq(new Set(labels).size, labels.length);
  });
  await test('file icons: the list uses the registered icon', () => {
    for (const [name, spec] of Object.entries(FILE_ICONS)) {
      for (const e of spec.exts) eq(fileIconFor(`x.${e}`), name, e);
    }
  });

  await test(`docs: user's guide in Korean and English, opens in the app`, () => {
    for (const f of ['doc/UsersGuide.md', 'doc/UsersGuide.en.md', 'README.md', 'Architecture.md']) ok(has(f), f);
    const heads = (t) => t.split('\n').filter((l) => l.startsWith('## ')).length;
    eq(heads(read('doc/UsersGuide.md')), heads(read('doc/UsersGuide.en.md')), 'same sections');
    includes(read('src/components/GuidePage.jsx'), 'UsersGuide.md?raw');
    // Pictures: there, real, and the same set in both languages.
    const pictures = (file) => [...read(file).matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
    const ko = pictures('doc/UsersGuide.md');
    const en = pictures('doc/UsersGuide.en.md');
    ok(ko.length >= 9, `the guide has pictures: ${ko.length}`);
    eq(ko.map((p) => p.replace('images/ko/', '')).join(), en.map((p) => p.replace('images/en/', '')).join(), 'the same pictures');
    for (const p of [...ko, ...en]) {
      const data = fs.readFileSync(path.join(root, 'doc', p));
      eq(data.subarray(1, 4).toString(), 'PNG', p);
      ok(data.length > 3000, `${p} holds a picture`);
    }
    includes(read('src-tauri/src/windows.rs'), '.visible(false)');
    includes(read('src/App.jsx'), "invoke('window_ready')");
    includes(read('src-tauri/src/files.rs'), 'pub async fn fs_roots', 'never on the window thread');
    includes(read('src-tauri/src/files.rs'), 'GetLogicalDrives', 'a disconnected drive is not touched');
    ok(!/^import \w+ from '\.\/App'/m.test(read('src/main.jsx')), 'each window loads only its own page');
    includes(read('src-tauri/nsis/hooks.nsh'), '--register-shell-menu');
    includes(read('src-tauri/nsis/hooks.nsh'), '--unregister-shell-menu');
    includes(read('src/main.jsx'), "guide: () => import('./components/GuidePage')");
    includes(read('src-tauri/capabilities/default.json'), '"guide"');
  });
  await test('npm run clean: lists what building made and, dry, removes nothing', () => {
    ok(pkg.scripts.clean, 'clean');
    ok(pkg.scripts['clean:all'], 'clean:all');
    const marker = path.join(root, 'dist-web');
    const before = fs.existsSync(marker);
    const r = spawnSync(process.execPath, ['scripts/clean.mjs', '--dry'], { cwd: root, encoding: 'utf8' });
    eq(r.status, 0);
    eq(fs.existsSync(marker), before, 'a dry run removes nothing');
    const script = read('scripts/clean.mjs');
    for (const t of ['dist', 'dist-web', 'target', 'test-results', 'src/engine', 'src-tauri/gen']) includes(script, `'${t}'`);
    ok(!script.includes("'doc'") && !script.includes("'src'") && !script.includes("'assets'"), 'never the sources');
  });

  await test('installer: Korean or English is asked, and the program inherits it', () => {
    const nsis = conf.bundle.windows.nsis;
    eq(nsis.displayLanguageSelector, true);
    ok(nsis.languages.includes('Korean') && nsis.languages.includes('English'));
    const hooks = read('src-tauri/nsis/hooks.nsh');
    includes(hooks, 'MUI_LANGDLL_ALWAYSSHOW');
    includes(hooks, 'install-language.txt');
    includes(hooks, '$LANGUAGE');
    const main = read('src-tauri/src/main.rs');
    includes(main, 'install-language.txt');
    includes(main, '"1042" => Some("ko")');
    includes(main, '"1033" => Some("en")');
  });

  await test('test output is in English', () => {
    const names = [];
    const collect = (file) => {
      for (const m of read(file).matchAll(/(?:await test\(|export const title = )['\`]([^'\`]*)['\`]/g)) names.push(m[1]);
    };
    for (const f of fs.readdirSync(path.join(root, 'test/suites'))) collect(`test/suites/${f}`);
    for (const f of ['wasm', 'web', 'desktop']) collect(`test/e2e/${f}.mjs`);
    ok(names.length > 100, `${names.length} names`);
    const korean = names.filter((n) => /[\u3131-\uD7A3]/.test(n));
    eq(korean.join(', '), '');
    const runner = read('test/runner.mjs');
    eq((runner.match(/[\u3131-\uD7A3]/g) ?? []).length, 0, 'the runner has no Korean');
  });

  await test('docs: installers are documented as build:*', () => {
    const text = read('README.md');
    for (const s of ['build:win', 'build:mac', 'build:linux', 'build:all', 'build:web']) includes(text, s);
  });
  await test('fixtures: real WinRAR and makecab files with their source', () => {
    for (const f of ['rar/m3_default.rar', 'rar/multivol.part1.rar', 'rar/COPYING.rars.txt', 'cab/lzx.cab', 'cab/mszip.cab']) ok(has(`test/fixtures/${f}`), f);
  });
  await test('.gitignore: build output and installers', () => {
    const text = read('.gitignore');
    for (const e of ['node_modules/', 'dist/', 'dist-web/', 'target/', 'test-results/', 'src/engine/', '/*.exe', '/*.dmg', '/*.AppImage', '/*.deb']) includes(text, e);
  });
}
